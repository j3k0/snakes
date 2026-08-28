// Regression tests for the FOV-1161 bug-hunt fixes.
//
// Each test drives the real game (snake.html) via Playwright and asserts the
// specific behavior the fix introduced. Reuses the test-helpers harness for
// launch/stop but sets up scenario state directly via page.evaluate.

import { chromium } from 'playwright';
import { FILE } from './test-helpers.mjs';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

let browser;
let page;

async function setup() {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.goto(FILE);
}

// ---------------------------------------------------------------------------
// getInt: a legitimately-stored 0 must not resurrect the default
// ---------------------------------------------------------------------------
test('getInt returns 0 (not default) for a stored "0"', async () => {
  await page.evaluate(() => saveManager.set('snake_daily_attempts_remaining', '0'));
  const v = await page.evaluate(() => saveManager.getInt('snake_daily_attempts_remaining', 3));
  if (v !== 0) throw new Error(`expected 0, got ${v}`);
});

test('getInt returns default for non-numeric and missing keys', async () => {
  const missing = await page.evaluate(() => saveManager.getInt('snake_no_such_key', 7));
  if (missing !== 7) throw new Error(`missing: expected 7, got ${missing}`);
  await page.evaluate(() => saveManager.set('snake_no_such_key', 'abc'));
  const bad = await page.evaluate(() => saveManager.getInt('snake_no_such_key', 7));
  if (bad !== 7) throw new Error(`bad: expected 7, got ${bad}`);
});

// ---------------------------------------------------------------------------
// restoreFromSnapshot: dx/dy must not be ||-coerced (vertical saves resume on-grid)
// ---------------------------------------------------------------------------
test('restoreFromSnapshot keeps a vertical (dx:0) direction intact', async () => {
  await page.evaluate(() => {
    gameMode = 'classic';
    resetGame();
    dirQueue = [];
    const snap = {
      v: SNAPSHOT_VERSION,
      mode: 'classic',
      seed: null,
      snake: [{ x: 100, y: 100 }, { x: 80, y: 100 }],
      dx: 0, dy: 20,
    };
    const ok = restoreFromSnapshot(snap, false);
    if (!ok) throw new Error('restore failed');
  });
  const dir = await page.evaluate(() => ({ dx, dy }));
  if (dir.dx !== 0 || dir.dy !== 20) {
    throw new Error(`expected dx:0 dy:20, got dx:${dir.dx} dy:${dir.dy}`);
  }
});

// ---------------------------------------------------------------------------
// Death-save teleport: walled-mode Phoenix must reposition the snake away from
// the wall (not leave the head on the deadly tile), and the player survives.
// ---------------------------------------------------------------------------
test('walled Phoenix save re-anchors the snake and survives the wall', async () => {
  const outcome = await page.evaluate(() => {
    gameMode = 'walled';
    resetGame();
    obstacles = []; rivals = []; hazards = []; extraFoods = [];
    snake = [{ x: 10, y: 100 }]; // head 1 tile from the left edge
    dx = -TILE_SIZE; dy = 0;
    dirQueue = [];
    lastConsumedDir = { dx: -TILE_SIZE, dy: 0 };
    food = { x: 300, y: 300, type: 'common', pts: 10, xp: 5, spawnTime: performance.now() };
    activeBrews = ['phoenix'];
    brewUsageFlags = { phoenixUsed: false };
    equippedBrews = ['phoenix'];
    score = 100;
    gameState = 'playing';
    updateGame();
    return { state: gameState, head: snake[0], phoenixUsed: !!brewUsageFlags.phoenixUsed, snakeLen: snake.length };
  });
  if (outcome.phoenixUsed !== true) throw new Error('phoenix brew was not consumed');
  if (outcome.state !== 'playing') throw new Error(`expected playing, got ${outcome.state}`);
  if (outcome.head.x < 0 || outcome.head.x >= 400) {
    throw new Error(`head left on/off the wall: x=${outcome.head.x}`);
  }
  if (outcome.head.x === 10) throw new Error('head did not move to a safe tile');
});

// ---------------------------------------------------------------------------
// Seed determinism: a manual seed typed into the seed field must survive the
// real Enter start path (resetGame no longer wipes it).
// ---------------------------------------------------------------------------
test('manual seed survives resetGame and seeds the run', async () => {
  await page.evaluate(() => {
    gameMode = 'classic';
    resetGame();
    document.getElementById('seedField').value = 'TESTSED';
  });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => gameState === 'playing', { timeout: 5000 });
  const seeded = await page.evaluate(() => activeSeed);
  if (seeded !== 'TESTSED') throw new Error(`activeSeed not from manual seed: ${seeded}`);
});

test('daily opening food is deterministic across runs', async () => {
  const firstFood = await page.evaluate(() => {
    gameMode = 'daily';
    const f = document.getElementById('seedField');
    f.value = ''; // daily derives from getDailySeed()
    resetGame();
    return food ? { x: food.x, y: food.y } : null;
  });
  const secondFood = await page.evaluate(() => {
    resetGame();
    return food ? { x: food.x, y: food.y } : null;
  });
  if (!firstFood || !secondFood) throw new Error('no food generated');
  if (firstFood.x !== secondFood.x || firstFood.y !== secondFood.y) {
    throw new Error(`daily opening food differs: ${JSON.stringify(firstFood)} vs ${JSON.stringify(secondFood)}`);
  }
});

// ---------------------------------------------------------------------------
// Per-type lifetime stats: a primary speed-food eat must increment the lifetime
// bucket (SPEED_DEMON / BONUS_FEAST / EPICURE were unachievable before).
// ---------------------------------------------------------------------------
test('primary speed-food eat increments stats.speedFoodEaten', async () => {
  const r = await page.evaluate(() => {
    gameMode = 'classic';
    resetGame();
    obstacles = []; rivals = []; hazards = []; extraFoods = [];
    snake = [{ x: 100, y: 100 }];
    dx = TILE_SIZE; dy = 0;
    dirQueue = [];
    lastConsumedDir = { dx: TILE_SIZE, dy: 0 };
    food = { x: 120, y: 100, type: 'speed', pts: 10, xp: 5, spawnTime: performance.now() };
    const before = stats.speedFoodEaten || 0;
    gameState = 'playing';
    updateGame();
    return { before, after: stats.speedFoodEaten || 0 };
  });
  if (r.after !== r.before + 1) throw new Error(`stats.speedFoodEaten changed ${r.before} -> ${r.after}`);
});

// ---------------------------------------------------------------------------
// getBoostedSpeed: at the MIN_SPEED floor with Swift, a boost must never be
// slower than the current effective speed.
// ---------------------------------------------------------------------------
test('getBoostedSpeed is never slower than getEffectiveSpeed', async () => {
  const r = await page.evaluate(() => {
    const oldScore = score;
    score = 100000;
    evolutionTier = 0;
    const eff = getEffectiveSpeed();
    const boost = getBoostedSpeed();
    score = oldScore;
    return { eff, boost };
  });
  if (r.boost > r.eff) throw new Error(`boost ${r.boost} is slower than effective ${r.eff}`);
});

// ---------------------------------------------------------------------------
// Hazard melt respects the Apex combo floor.
// ---------------------------------------------------------------------------
test('hazard melt at combo>=10 applies the Apex floor', async () => {
  const r = await page.evaluate(() => {
    gameMode = 'classic';
    resetGame();
    obstacles = []; rivals = []; extraFoods = [];
    snake = [{ x: 100, y: 100 }];
    dx = TILE_SIZE; dy = 0; dirQueue = []; lastConsumedDir = { dx: TILE_SIZE, dy: 0 };
    food = { x: 300, y: 300, type: 'common', pts: 10, xp: 5, spawnTime: performance.now() };
    evolutionTier = 3;
    comboCount = 12;
    lastComboMilestone = 10;
    hazards = [{ cx: 120, cy: 100, radius: TILE_SIZE, phase: 'on', phaseTimer: 15, lifeTimer: 300, maxLife: 300 }];
    gameState = 'playing';
    updateGame();
    return { comboCount, state: gameState };
  });
  if (r.state !== 'playing') throw new Error('melt should prevent death');
  const floor = await page.evaluate(() => EVOLUTION_TIERS[3].minCombo);
  if (r.comboCount !== floor) throw new Error(`melt comboCount=${r.comboCount}, expected floor=${floor}`);
});

// ---------------------------------------------------------------------------
// Keydown: typing in the seed field must not trigger global hotkeys
// ---------------------------------------------------------------------------
test('keydown is ignored while typing in an input (no prestige)', async () => {
  const after = await page.evaluate(() => {
    resetGame();
    level = 25;
    const f = document.getElementById('seedField');
    f.value = 'x';
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    return { level, xp };
  });
  if (after.level !== 25) throw new Error(`prestige fired via seed field: level=${after.level}`);
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  await setup();
  let failures = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log('  PASS  ' + t.name);
    } catch (e) {
      failures++;
      console.log('  FAIL  ' + t.name);
      console.log('        ' + e.message);
    }
  }
  await browser.close();
  console.log(failures === 0 ? '\nALL GREEN (' + tests.length + '/' + tests.length + ')' : `\n${failures} FAILED (${tests.length - failures}/${tests.length})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
