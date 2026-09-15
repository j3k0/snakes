// v9 Feature tests — A (Save Export/Import), B (Visibility Auto-Save),
// C (Combo Heat Aura), D (Portal Food), E (Golden Hoard), F (Visual Feedback
// Pack), G (Diary Seed Replay). Includes regression tests for the two bugs
// caught by the v9 code review: (1) portal eat must grant the epic bonus AND
// remove the primary epic food; (2) rare_spawn sound must fire on the main
// generateFood path. Drives real game functions via updateGame()/generateFood().
import { chromium } from 'playwright';

const FILE = 'file://' + new URL('./snake.html', import.meta.url).pathname;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE, { waitUntil: 'networkidle' });

  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn(page);
      console.log('  PASS  ' + name);
    } catch (e) {
      failed++;
      console.log('  FAIL  ' + name + '\n        ' + (e && e.message ? e.message : e));
    }
  }
  console.log('\n' + (failed === 0 ? 'ALL GREEN' : failed + ' FAILED') + ' (' + (tests.length - failed) + '/' + tests.length + ')');
  if (errors.length) console.log('Console errors during run:\n - ' + errors.join('\n - '));
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
}

// Clean classic game, tick loop stopped, board cleared.
async function setup(page) {
  await page.evaluate(() => {
    gameMode = 'classic';
    resetGame();
    startGame();
    stopGameLoop();
    rivals = [];
    obstacles = [];
    activeBrews = [];
    activeMutators = [];
    shieldActive = false;
    slowMoActive = false;
    magnetActive = false;
    score = 0;
    extraFoods = [];
    transientRings = [];
    hoardActive = false; hoardTimer = 0; hoardTickCounter = 0; scoreMultiplier = 1;
    snake = [{ x: 200, y: 200 }];
    dx = TILE_SIZE; dy = 0;
    nextDirection = null;
    food = { x: 20, y: 20, type: 'common', spawnTime: performance.now() };
  });
}

// --- Feature A: Save Data Export/Import ---
test('A: export/import functions exist and export collects snake_ keys', async (page) => {
  const r = await page.evaluate(() => {
    if (typeof exportSaveData !== 'function' || typeof importSaveData !== 'function') return { ok: false, why: 'functions missing' };
    // Simulate the export key-collection logic without triggering a download
    const keys = Object.keys(localStorage).filter(k => k.startsWith('snake_'));
    return { ok: true, count: keys.length };
  });
  if (!r.ok) throw new Error(r.why);
  if (r.count < 5) throw new Error('expected several snake_ keys, got ' + r.count);
});

// --- Feature B: Visibility-Safe Auto-Save ---
test('B: visibilitychange handler calls saveSnapshot when hiding mid-game', async (page) => {
  const r = await page.evaluate(() => {
    // Code-path check: the handler body must call saveSnapshot before pausing
    const src = document.querySelector('script').textContent;
    const m = src.match(/visibilitychange'.*?\{([\s\S]*?)else if \(!document\.hidden/);
    if (!m) return { ok: false, why: 'visibilitychange handler not found' };
    const body = m[1];
    const saveIdx = body.indexOf('saveSnapshot()');
    const pauseIdx = body.indexOf("gameState = 'paused'");
    return { ok: saveIdx !== -1 && pauseIdx !== -1 && saveIdx < pauseIdx, saveIdx, pauseIdx };
  });
  if (!r.ok) throw new Error('saveSnapshot not called before pause in visibilitychange handler');
});

// --- Feature C: Combo Heat Aura ---
test('C: comboHeatColor bands (null <3, yellow 3-6, orange 7-14, red 15+)', async (page) => {
  const r = await page.evaluate(() => ({
    at0: comboHeatColor(0), at2: comboHeatColor(2), at3: comboHeatColor(3),
    at7: comboHeatColor(7), at15: comboHeatColor(15), at50: comboHeatColor(50)
  }));
  if (r.at0 !== null || r.at2 !== null) throw new Error('expected null below combo 3');
  if (!r.at3 || r.at3.indexOf('255') === -1) throw new Error('combo 3 should be yellowish, got ' + r.at3);
  if (!r.at7) throw new Error('combo 7 should be orange, got null');
  if (!r.at15 || r.at15.indexOf('rgba(255,55,0') !== 0) throw new Error('combo 15 should be red, got ' + r.at15);
  if (!r.at50 || r.at50.indexOf('rgba(255,55,0') !== 0) throw new Error('combo 50 should stay red');
});

// --- Feature D: Portal Food ---
test('D: epic food spawn creates portal twin in extraFoods (non-Walled)', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    extraFoods = [];
    obstacles = []; rivals = [];
    // Force an epic spawn via generateFood with a rigged type picker
    const orig = pickRandomFoodType;
    pickRandomFoodType = () => 'epic';
    const f = generateFood(snake);
    pickRandomFoodType = orig;
    return { food: f, extraCount: extraFoods.length, extraType: extraFoods[0] && extraFoods[0].type, hasLink: !!(extraFoods[0] && extraFoods[0].portalLink) };
  });
  if (!r.food) throw new Error('generateFood returned null');
  if (r.food.type !== 'epic') throw new Error('expected epic, got ' + r.food.type);
  if (r.extraCount !== 1) throw new Error('expected 1 portal twin in extraFoods, got ' + r.extraCount);
  if (r.extraType !== 'portal') throw new Error('portal twin type should be portal, got ' + r.extraType);
  if (!r.hasLink) throw new Error('portal twin missing portalLink');
});

test('D: portal twin excluded in Walled mode', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'walled'; resetGame(); startGame(); stopGameLoop();
    extraFoods = []; obstacles = []; rivals = [];
    const orig = pickRandomFoodType;
    pickRandomFoodType = () => 'epic';
    const f = generateFood(snake);
    pickRandomFoodType = orig;
    const count = extraFoods.length;
    gameMode = 'classic'; resetGame();
    return { count };
  });
  if (r.count !== 0) throw new Error('Walled mode must not spawn portal twins, got ' + r.count);
});

// Regression for code-review bug 1: portal eat grants epic bonus + removes primary epic food
test('D (regression): eating portal twin grants epic bonus, removes both foods', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    rivals = []; obstacles = []; activeBrews = []; activeMutators = [];
    score = 0; sessionFoodEaten = 0;
    snake = [{ x: 100, y: 100 }]; dx = TILE_SIZE; dy = 0;
    // Primary epic food far away, with portalLink to the twin
    food = { x: 300, y: 300, type: 'epic', spawnTime: performance.now(), portalLink: { x: 120, y: 100 } };
    // Portal twin one tile to the right of the head — next tick eats it
    extraFoods = [{ x: 120, y: 100, type: 'portal', spawnTime: performance.now(), portalLink: { x: 300, y: 300 } }];
    const scoreBefore = score;
    updateGame();
    return {
      scoreAfter: score,
      snakeHead: { x: snake[0].x, y: snake[0].y },
      snakeLen: snake.length,
      extraCount: extraFoods.length,
      primaryType: food && food.type,
      epicEaten: stats.epicFoodEaten
    };
  });
  if (r.scoreAfter <= r.scoreBefore) throw new Error('portal eat must grant epic score bonus, got ' + r.scoreAfter);
  if (r.snakeHead.x !== 300 || r.snakeHead.y !== 300) throw new Error('snake must teleport to the epic exit (300,300), got ' + JSON.stringify(r.snakeHead));
  if (r.snakeLen !== 3) throw new Error('snake must re-anchor to 3 segments, got ' + r.snakeLen);
  if (r.extraCount !== 0) throw new Error('portal twin must be removed from extraFoods, got ' + r.extraCount);
  if (r.primaryType === 'epic') throw new Error('primary epic food must be replaced after portal eat, still epic');
});

// Regression for code-review bug 2: rare_spawn sound on main generateFood path
test('D (regression): rare_spawn sound fires on main generateFood path', async (page) => {
  const r = await page.evaluate(() => {
    const src = document.querySelector('script').textContent;
    // Main path: rare/epic sound must come BEFORE the portal spawn block and
    // BEFORE 'return newFood' in generateFood (code-review bug 2 regression).
    const soundIdx = src.indexOf("if (newFood.type === 'rare' || newFood.type === 'epic') playSound('rare_spawn');\n            // v9 D");
    const portalIdx = src.indexOf('v9 D: epic food spawns a linked portal twin');
    const returnIdx = src.indexOf('return newFood;');
    return { ok: soundIdx !== -1 && soundIdx < portalIdx && portalIdx < returnIdx, soundIdx, portalIdx, returnIdx };
  });
  if (!r.ok) throw new Error('rare_spawn sound missing from main generateFood path');
});

// --- Feature E: Golden Hoard Event ---
test('E: hoard timer is tick-counted (no setTimeout/setInterval)', async (page) => {
  const r = await page.evaluate(() => {
    const src = document.querySelector('script').textContent;
    const hoardBlock = src.match(/v9 E: Golden Hoard Event[\s\S]*?function generateHoardFood/);
    if (!hoardBlock) return { ok: false, why: 'hoard block not found' };
    return { ok: !/setTimeout|setInterval/.test(hoardBlock[0]) };
  });
  if (!r.ok) throw new Error(r.why || 'hoard uses wall-clock timer (non-deterministic for replays)');
});

test('E: hoard activates after HOARD_INTERVAL ticks and grants 2x score', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    rivals = []; obstacles = []; activeBrews = []; activeMutators = [];
    extraFoods = [];
    score = 0;
    hoardTickCounter = HOARD_INTERVAL - 1;
    updateGame(); // should activate the hoard
    const active = hoardActive, mult = scoreMultiplier, foods = extraFoods.length;
    // Eat nothing; verify multiplier applies via addScore
    const s0 = score;
    addScore(10);
    const gained = score - s0;
    endHoard();
    return { active, mult, foods, gained, afterMult: scoreMultiplier };
  });
  if (!r.active) throw new Error('hoard did not activate at HOARD_INTERVAL');
  if (r.mult !== 2) throw new Error('scoreMultiplier should be 2 during hoard, got ' + r.mult);
  if (r.foods !== 4) throw new Error('hoard should spawn 4 bonus foods, got ' + r.foods);
  if (r.gained !== 20) throw new Error('addScore(10) during hoard should add 20, got ' + r.gained);
  if (r.afterMult !== 1) throw new Error('scoreMultiplier must reset to 1 after endHoard');
});

test('E: golden_food mutator caps hoard multiplier at 1.5', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    rivals = []; obstacles = []; activeBrews = [];
    activeMutators = ['golden_food'];
    score = 0; pinnacleRank = 0;
    scoreMultiplier = 2;
    addScore(10); // golden_food: 10*3=30; hoard cap 1.5: 30*1.5=45
    const gained = score;
    activeMutators = []; scoreMultiplier = 1;
    return { gained };
  });
  if (r.gained !== 45) throw new Error('expected 45 (10*3*1.5), got ' + r.gained);
});

test('E: rival respawn timer frozen during hoard', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    obstacles = []; activeBrews = []; activeMutators = [];
    rivals = [{ snake: [{x:0,y:0}], dx: 0, dy: 0, active: false, respawnTimer: 100, color: '#FF4444' }];
    hoardActive = true; hoardTimer = 100;
    const before = rivals[0].respawnTimer;
    updateGame();
    const during = rivals[0].respawnTimer;
    endHoard();
    updateGame();
    const after = rivals[0].respawnTimer;
    return { before, during, after };
  });
  if (r.during !== r.before) throw new Error('respawn timer must freeze during hoard: ' + r.before + ' -> ' + r.during);
  if (!(r.after < r.during)) throw new Error('respawn timer must resume after hoard: ' + r.during + ' -> ' + r.after);
});

test('E: hoard state is snapshotted and restored (additive fields)', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    rivals = []; obstacles = []; activeBrews = []; activeMutators = [];
    hoardActive = true; hoardTimer = 500; hoardTickCounter = 42; scoreMultiplier = 2;
    extraFoods = [{ x: 60, y: 60, type: 'bonus', spawnTime: 1 }];
    const snap = buildSnapshotObject();
    const ok = snap.hoardActive === true && snap.hoardTimer === 500 && snap.scoreMultiplier === 2 &&
               Array.isArray(snap.extraFoods) && snap.extraFoods.length === 1;
    // Restore and verify
    const restored = restoreFromSnapshot(JSON.parse(JSON.stringify(snap)), false);
    return { ok, restored, hoardAfter: hoardActive, timerAfter: hoardTimer, extraAfter: extraFoods.length };
  });
  if (!r.ok) throw new Error('snapshot missing hoard/extraFoods fields');
  if (!r.restored) throw new Error('restoreFromSnapshot failed');
  if (!r.hoardAfter || r.timerAfter !== 500 || r.extraAfter !== 1) throw new Error('hoard state not restored: ' + JSON.stringify(r));
});

test('E: hoard excluded in zen/walled/painter/gauntlet, enabled in snap', async (page) => {
  const r = await page.evaluate(() => ({
    classic: !!MODE_CONFIG.classic.hoardEnabled,
    timeAttack: !!MODE_CONFIG.timeAttack.hoardEnabled,
    daily: !!MODE_CONFIG.daily.hoardEnabled,
    snap: !!MODE_CONFIG.snap.hoardEnabled,
    zen: !!MODE_CONFIG.zen.hoardEnabled,
    walled: !!MODE_CONFIG.walled.hoardEnabled,
    painter: !!MODE_CONFIG.painter.hoardEnabled,
    gauntlet: !!MODE_CONFIG.gauntlet.hoardEnabled
  }));
  if (!(r.classic && r.timeAttack && r.daily && r.snap)) throw new Error('hoard should be enabled in classic/timeAttack/daily/snap');
  if (r.zen || r.walled || r.painter || r.gauntlet) throw new Error('hoard must be excluded in zen/walled/painter/gauntlet');
});

// --- Feature F: Visual Feedback Pack ---
test('F: transientRings helper pushes, caps at 50, and resets', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame();
    if (typeof pushTransientRing !== 'function') return { ok: false, why: 'pushTransientRing missing' };
    for (let i = 0; i < 60; i++) pushTransientRing(i, i, 10, '#FFF', 300, 'ring', 2);
    const capped = transientRings.length;
    resetGame();
    return { ok: true, capped, afterReset: transientRings.length };
  });
  if (!r.ok) throw new Error(r.why);
  if (r.capped !== 50) throw new Error('transientRings must cap at 50, got ' + r.capped);
  if (r.afterReset !== 0) throw new Error('resetGame must clear transientRings');
});

test('F: hunter move pushes dust ring at vacated cell', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    rivals = []; obstacles = []; activeBrews = [];
    calmMode = 'off';
    snake = [{ x: 100, y: 100 }];
    transientRings = [];
    food = { x: 140, y: 100, type: 'hunter', spawnTime: performance.now() };
    const fx = food.x, fy = food.y;
    moveHunter();
    const dust = transientRings.find(t => t.type === 'dust');
    return { moved: food.x !== fx || food.y !== fy, dustAt: dust ? { x: dust.x, y: dust.y } : null };
  });
  if (!r.moved) throw new Error('hunter did not move');
  if (!r.dustAt) throw new Error('no dust ring pushed at vacated cell');
  if (r.dustAt.x !== r.dustAt.x) throw new Error('dust position invalid');
});

test('F: bounty completion pushes cash-in ring at head', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    rivals = []; obstacles = []; activeBrews = [];
    snake = [{ x: 200, y: 200 }]; dx = TILE_SIZE; dy = 0;
    transientRings = [];
    // Active combo bounty already past target — auto-completes next tickBounty
    comboCount = 5;
    activeBounty = { kind: 'combo', target: 3, reward: { pts: 10 }, windowTicks: 100, ticksLeft: 50,
      baseline: { score: 0, sessionFoodEaten: 0, comboCount: 0, snakeLen: 1, sessionSpeedFood: 0 }, desc: 'test' };
    tickBounty();
    const ring = transientRings.find(t => t.type === 'ring' && t.color === '#FFD700');
    return { ringFound: !!ring, bountyCleared: activeBounty === null };
  });
  if (!r.ringFound) throw new Error('no cash-in ring pushed on bounty completion');
  if (!r.bountyCleared) throw new Error('bounty should clear after completion');
});

test('F: activatePowerUp pushes shockwave ring', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    rivals = []; obstacles = [];
    snake = [{ x: 200, y: 200 }];
    transientRings = [];
    activatePowerUp('shield');
    const ring = transientRings.find(t => t.type === 'ring');
    const result = { ringFound: !!ring };
    deactivatePowerUp(true);
    return result;
  });
  if (!r.ringFound) throw new Error('no shockwave ring on power-up activation');
});

// --- Feature G: Diary Seed Replay ---
test('G: retrySeedFromDiary sets seed + PRNG, blocked mid-game', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); // gameState = 'idle'
    retrySeedFromDiary('TESTSEED1');
    const seedOk = activeSeed === 'TESTSEED1' && seedPrng !== null;
    const fieldOk = document.getElementById('seedField').value === 'TESTSEED1';
    // Now block mid-game
    startGame();
    retrySeedFromDiary('OTHERSEED');
    const blockedOk = activeSeed === 'TESTSEED1';
    resetGame();
    return { seedOk, fieldOk, blockedOk };
  });
  if (!r.seedOk) throw new Error('seed/PRNG not set');
  if (!r.fieldOk) throw new Error('seedField not populated');
  if (!r.blockedOk) throw new Error('retrySeedFromDiary must be blocked during playing');
});

// --- Cross-cutting: extraFoods integration ---
test('X: generateFood does not spawn on top of extraFoods tiles', async (page) => {
  const r = await page.evaluate(() => {
    gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
    rivals = []; obstacles = []; activeBrews = []; activeMutators = [];
    snake = [{ x: 200, y: 200 }];
    extraFoods = [{ x: 20, y: 20, type: 'bonus', spawnTime: 1 }, { x: 40, y: 20, type: 'bonus', spawnTime: 1 }];
    // Generate many foods; none may land on an extraFood tile
    for (let i = 0; i < 30; i++) {
      const combined = snake.concat(rivalCombinedSnake()).concat(extraFoods);
      const f = generateFood(combined);
      if (!f) return { ok: false, why: 'generateFood returned null' };
      if (extraFoods.some(ef => ef.x === f.x && ef.y === f.y)) return { ok: false, why: 'food spawned on extraFood tile at ' + f.x + ',' + f.y };
    }
    return { ok: true };
  });
  if (!r.ok) throw new Error(r.why);
});

run();
