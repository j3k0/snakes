// v7 Feature B: Evolution System — smoke tests.
// Drives the real game via updateGame()/generateFood()/getEffectiveSpeed() to verify
// every tier threshold, gameplay bonus hook, the Serpentine death-interception order,
// state reset, and that the visual-morph draw path renders without error.
import { chromium } from 'playwright';

const FILE = 'file:///opt/projects/experiments/snakes/snake.html';
const T = 20; // TILE_SIZE

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

// Common setup: a clean classic game with the tick loop stopped so we can call
// updateGame() manually without the setTimeout chain racing us. Rival/obstacles
// cleared; the caller overrides what it needs.
async function setup(page) {
  await page.evaluate(() => {
    gameMode = 'classic';
    resetGame();
    startGame();
    stopGameLoop();
    rivals = [];
    obstacles = [];
    activeBrews = [];
    shieldActive = false;
    slowMoActive = false;
    score = 0;
    evolutionTier = -1;
    obstaclePassUsed = false;
    food = { x: 20, y: 20, type: 'common' };
  });
}

function near(a, b, eps) { return Math.abs(a - b) <= eps; }

// --- Existence / config ---
test('EVOLUTION_TIERS has 4 tiers at lengths 10/25/50/100', async (page) => {
  const t = await page.evaluate(() => EVOLUTION_TIERS && EVOLUTION_TIERS.map(x => ({ len: x.length, name: x.name })));
  if (!t || t.length !== 4) throw new Error('expected 4 tiers, got ' + JSON.stringify(t));
  const want = [10, 25, 50, 100];
  for (let i = 0; i < 4; i++) if (t[i].len !== want[i]) throw new Error('tier ' + i + ' length ' + t[i].len + ' != ' + want[i]);
});

test('evolution symbols are accessible', async (page) => {
  const ok = await page.evaluate(() =>
    typeof EVOLUTION_TIERS !== 'undefined' &&
    typeof evolutionTier !== 'undefined' &&
    typeof obstaclePassUsed !== 'undefined' &&
    typeof triggerEvolutionIfReady === 'function' &&
    typeof evolveSnake === 'function' &&
    typeof isObstacleCollision === 'function');
  if (!ok) throw new Error('evolution symbols missing');
});

// --- Thresholds ---
test('triggerEvolutionIfReady crosses tiers at exact thresholds', async (page) => {
  await setup(page);
  const res = await page.evaluate(() => {
    const out = [];
    function setLen(n) { snake = []; for (let i = 0; i < n; i++) snake.push({ x: 20 * i, y: 0 }); }
    // 9 → none
    setLen(9); triggerEvolutionIfReady(); out.push({ len: 9, tier: evolutionTier });
    // 10 → Swift (0)
    setLen(10); triggerEvolutionIfReady(); out.push({ len: 10, tier: evolutionTier });
    // 25 → Serpentine (1)
    setLen(25); triggerEvolutionIfReady(); out.push({ len: 25, tier: evolutionTier });
    // 50 → Titan (2)
    setLen(50); triggerEvolutionIfReady(); out.push({ len: 50, tier: evolutionTier });
    // 100 → Apex (3)
    setLen(100); triggerEvolutionIfReady(); out.push({ len: 100, tier: evolutionTier });
    // 200 → capped at 3
    setLen(200); triggerEvolutionIfReady(); out.push({ len: 200, tier: evolutionTier });
    return out;
  });
  const want = [-1, 0, 1, 2, 3, 3];
  for (let i = 0; i < want.length; i++) {
    if (res[i].tier !== want[i]) throw new Error('len ' + res[i].len + ' → tier ' + res[i].tier + ' (want ' + want[i] + ')');
  }
});

// --- Swift speed ---
test('Swift: +5% speed (smaller tick interval), stacks with slowMo', async (page) => {
  await setup(page);
  const r = await page.evaluate(() => {
    const baseSpeed = (typeof BASE_SPEED !== 'undefined') ? BASE_SPEED : 120;
    evolutionTier = -1; slowMoActive = false; score = 0;
    const none = getEffectiveSpeed();
    evolutionTier = 0;
    const swift = getEffectiveSpeed();
    slowMoActive = true;
    const swiftSlowmo = getEffectiveSpeed();
    slowMoActive = false;
    evolutionTier = -1;
    const slowmoOnly = (() => { slowMoActive = true; const v = getEffectiveSpeed(); slowMoActive = false; return v; })();
    return { none, swift, swiftSlowmo, slowmoOnly, baseSpeed };
  });
  // Swift should make the interval ~5% smaller (faster).
  if (!near(r.swift, r.none / 1.05, 0.5)) throw new Error('swift ' + r.swift + ' != ' + (r.none / 1.05));
  // Swift + slowMo: slowMo doubles base, then /1.05.
  if (!near(r.swiftSlowmo, r.slowmoOnly / 1.05, 0.5)) throw new Error('swift+slowmo ' + r.swiftSlowmo + ' != ' + (r.slowmoOnly / 1.05));
});

// --- Serpentine obstacle pass (functional via updateGame) ---
test('Serpentine: passes one obstacle, then dies on the next', async (page) => {
  await setup(page);
  const r = await page.evaluate(() => {
    snake = [{ x: 200, y: 200 }];
    dx = 20; dy = 0; nextDirection = null;
    evolutionTier = 1; obstaclePassUsed = false;
    obstacles = [{ x: 220, y: 200 }];
    food = { x: 20, y: 20, type: 'common' };
    updateGame();
    const after1 = { state: gameState, pass: obstaclePassUsed, head: snake[0] && { x: snake[0].x, y: snake[0].y } };
    // second obstacle ahead of the new head
    obstacles = [{ x: 240, y: 200 }];
    updateGame();
    const after2 = { state: gameState, pass: obstaclePassUsed, cause: lastDeathCause };
    return { after1, after2 };
  });
  if (r.after1.state !== 'playing') throw new Error('first hit should be saved, state=' + r.after1.state);
  if (!r.after1.pass) throw new Error('obstaclePassUsed should be true after pass');
  if (r.after1.head.x !== 220) throw new Error('head should have phased to 220, got ' + r.after1.head.x);
  if (r.after2.state !== 'gameover') throw new Error('second hit should kill, state=' + r.after2.state);
  if (!/obstacle/i.test(r.after2.cause || '')) throw new Error('death cause should mention obstacle, got "' + r.after2.cause + '"');
});

// Serpentine must NOT save a self-collision.
test('Serpentine: does not save a self-collision', async (page) => {
  await setup(page);
  const r = await page.evaluate(() => {
    // Build a snake that will self-collide: head moves into its own body.
    snake = [
      { x: 220, y: 200 }, // head
      { x: 220, y: 180 },
      { x: 200, y: 180 },
      { x: 200, y: 200 }, // tail — head moving down-left will hit body, not obstacle
    ];
    dx = 0; dy = -20; nextDirection = null; // head 220,200 -> 220,180 (own body)
    evolutionTier = 1; obstaclePassUsed = false;
    obstacles = [];
    food = { x: 20, y: 20, type: 'common' };
    updateGame();
    return { state: gameState, pass: obstaclePassUsed, cause: lastDeathCause };
  });
  if (r.state !== 'gameover') throw new Error('self-collision should still kill, state=' + r.state);
  if (r.pass) throw new Error('obstaclePassUsed must NOT flip on self-collision');
});

// Leech brew rival-steal is a 3rd growth site — evolution must fire there too.
test('Leech steal growth triggers evolution (3rd growth site)', async (page) => {
  await setup(page);
  const r = await page.evaluate(() => {
    // 8-seg snake; moving right into a rival head -> Leech steals 3 -> length
    // crosses Swift@10 at the steal site (before this fix it only recovered on
    // the next food eat).
    snake = [];
    for (let i = 0; i < 8; i++) snake.push({ x: 200 - i * 20, y: 200 });
    dx = 20; dy = 0; nextDirection = null;
    evolutionTier = -1;
    activeBrews = ['leech'];
    rivals = [{ active: true, color: '#FF6666', snake: [
      { x: 240, y: 200 }, { x: 260, y: 200 }, { x: 280, y: 200 }, { x: 300, y: 200 },
    ] }];
    obstacles = [];
    food = { x: 20, y: 20, type: 'common' };
    updateGame();
    return { tier: evolutionTier, len: snake.length };
  });
  if (r.tier !== 0) throw new Error('Leech steal should evolve to Swift (tier 0), got tier ' + r.tier);
  if (r.len < 10) throw new Error('snake should have grown past 10, got length ' + r.len);
});

// --- Titan food proximity ---
test('Titan: shrinks Rampage food-spawn cap by 1 tile', async (page) => {
  await setup(page);
  // Deterministic: the Titan reduction must be wired into generateFood.
  const src = await page.evaluate(() => generateFood.toString());
  if (!/EVOLUTION_TIERS\[2\]\.foodProximity/.test(src) || !/minFoodSpawnDist\s*-/.test(src))
    throw new Error('generateFood does not reduce the spawn cap by Titan foodProximity');
  // Behavioral: Titan must reject the 41-60px annulus that cap-3 allows. Sampled
  // with tolerance because generateFood's MAX_ITERATIONS fallback bypasses the cap
  // on a near-empty board (rare ~0.03%/call), so we compare fractions, not maxima.
  const r = await page.evaluate(() => {
    const head = { x: 200, y: 200 };
    snake = [head];
    function manh(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
    function sample(tier) {
      evolutionTier = tier;
      minFoodSpawnDist = 3; // Rampage cap = 3 tiles
      let over40 = 0, inAnnulus = 0, n = 0;
      for (let i = 0; i < 250; i++) {
        const f = generateFood(snake);
        if (!f) continue;
        n++;
        const d = manh(f, head);
        if (d > 40) over40++;
        if (d > 40 && d <= 60) inAnnulus++;
      }
      return { n, over40, inAnnulus };
    }
    return { titan: sample(2), base: sample(1) };
  });
  // Titan (cap 2): essentially no food beyond 40px (allow a sliver for fallback).
  if (r.titan.over40 / r.titan.n > 0.05) throw new Error('Titan let ' + r.titan.over40 + '/' + r.titan.n + ' foods past 40px');
  // Non-Titan (cap 3): the 41-60px annulus must be routinely reachable.
  if (r.base.inAnnulus / r.base.n < 0.10) throw new Error('non-Titan annulus (41-60px) unreachable: ' + r.base.inAnnulus + '/' + r.base.n);
});

// --- Apex combo floor ---
test('Apex: combo resets to 2 (not 0) on a broken eat window', async (page) => {
  await setup(page);
  const r = await page.evaluate(() => {
    function eatWithBrokenWindow(tier) {
      // reset to a clean single-segment snake pointing right
      snake = [{ x: 200, y: 200 }];
      dx = 20; dy = 0; nextDirection = null;
      evolutionTier = tier;
      lastEatTime = 0;            // forces the combo-break (else) branch
      comboCount = 7;             // pretend we had a combo; break should floor it
      lastComboMilestone = 0;
      obstacles = [];
      food = { x: 220, y: 200, type: 'common' }; // directly ahead
      updateGame();
      return comboCount;
    }
    return { apex: eatWithBrokenWindow(3), base: eatWithBrokenWindow(0) };
  });
  if (r.apex !== 2) throw new Error('Apex combo floor should be 2, got ' + r.apex);
  if (r.base !== 0) throw new Error('non-Apex combo should reset to 0, got ' + r.base);
});

// --- State reset ---
test('resetGame() clears evolution state', async (page) => {
  await setup(page);
  const r = await page.evaluate(() => {
    evolutionTier = 2; obstaclePassUsed = true;
    resetGame();
    return { tier: evolutionTier, pass: obstaclePassUsed };
  });
  if (r.tier !== -1) throw new Error('evolutionTier should reset to -1, got ' + r.tier);
  if (r.pass) throw new Error('obstaclePassUsed should reset to false');
});

// --- Visual morphs render without error at every tier ---
test('drawSnake visual morphs render at every tier (no throw)', async (page) => {
  await setup(page);
  const ok = await page.evaluate(() => {
    // long snake so body morphs are visible
    snake = [];
    for (let i = 0; i < 30; i++) snake.push({ x: 20 + (i % 19) * 20, y: 40 + Math.floor(i / 19) * 20 });
    prevSnake = snake.map(s => ({ x: s.x, y: s.y }));
    gameState = 'playing';
    for (let tier = -1; tier <= 3; tier++) {
      evolutionTier = tier;
      try { drawGame(1); }
      catch (e) { return { err: 'tier ' + tier + ': ' + e.message }; }
    }
    // verify shadow state did not leak (shadowBlur reset to 0 by drawSnake)
    return { err: null, leakedShadow: ctx.shadowBlur };
  });
  if (ok.err) throw new Error(ok.err);
  if (ok.leakedShadow !== 0) throw new Error('ctx.shadowBlur leaked after drawSnake: ' + ok.leakedShadow);
});

run();
