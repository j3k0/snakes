// Gameplay integration test (FOV-1075).
//
// Verifies the core game loop end-to-end: the snake can turn, eat food, grow,
// and score. Uses a fixed seed so food spawns predictably. Calls updateGame()
// directly (via page.evaluate) to drive ticks deterministically — the loop
// mechanic itself is covered by test-gameloop.mjs; this suite targets the
// eat/grow/score/stat/achievement contracts.
//
// Run: node test-gameplay.mjs

import { chromium } from 'playwright';

const FILE = 'file://' + new URL('./snake.html', import.meta.url).pathname;
// Fixed seed so generateFood()'s seededRandom() calls are deterministic.
// The exact food positions don't matter — each test overrides food.x/y
// directly to place food adjacent to the head — but a fixed seed keeps
// obstacle/rival spawns stable across runs so they never interfere.
const TEST_SEED = 'test-gameplay-1075';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Helper: start a deterministic classic-mode game and wait for the snake to
// initialize. Clears obstacles + rival so nothing can kill the snake during
// the tick-driven assertions. Returns nothing — callers read state via
// page.evaluate.
async function startCleanGame(page) {
  await page.evaluate((seed) => {
    gameMode = 'classic';
    // Set a deterministic seed so obstacle/rival/food generation is stable.
    // Mirrors the seedField input handler's hash computation.
    activeSeed = seed;
    seedPrng = mulberry32(seed.split('').reduce(function (h, c) {
      return ((h << 5) - h) + c.charCodeAt(0) | 0;
    }, 0));
    resetGame();
    startGame();
  }, TEST_SEED);
  await page.waitForFunction(() => typeof snake !== 'undefined' && snake.length > 0 && gameState === 'playing', { timeout: 5000 });
  // Clear hazards + obstacles + rival so the snake can't die during assertions.
  await page.evaluate(() => {
    obstacles = [];
    hazards = [];
    rivals = [];
    extraFoods = [];
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(FILE, { waitUntil: 'networkidle' });
  console.log(`Page loaded. Title: ${await page.title()}`);

  // -------------------------------------------------------------------------
  // Test 1: dirQueue accepts a direction key and the snake turns within ticks.
  // -------------------------------------------------------------------------
  test('dirQueue accepts direction input and snake turns within a few ticks', async () => {
    await startCleanGame(page);

    // Snake starts moving right (dx=TILE_SIZE, dy=0). Press ArrowDown.
    await page.keyboard.press('ArrowDown');

    // The keydown handler calls setNextDirection(0, TILE_SIZE). The queue
    // should now hold one pending turn (down). It is NOT yet consumed —
    // consumption happens at the top of the next updateGame() tick.
    const queueState = await page.evaluate(() => ({
      len: dirQueue.length,
      head: dirQueue.length > 0 ? dirQueue[0] : null,
    }));
    if (queueState.len !== 1) throw new Error(`Expected dirQueue.length=1 after ArrowDown, got ${queueState.len}`);
    if (!queueState.head || queueState.head.dx !== 0 || queueState.head.dy !== 20) {
      throw new Error(`dirQueue[0] = ${JSON.stringify(queueState.head)}, expected {dx:0, dy:20}`);
    }

    // Drive a few ticks so the queued turn is consumed and dy updates.
    await page.evaluate(() => { for (let i = 0; i < 3; i++) updateGame(); });

    const after = await page.evaluate(() => ({ dx, dy, headY: snake[0].y }));
    if (after.dy !== 20) throw new Error(`Expected dy=20 (down) after ticks, got dy=${after.dy}`);
    if (after.dx !== 0) throw new Error(`Expected dx=0 after turning down, got dx=${after.dx}`);
    // The head must have moved downward from its start y (200).
    if (after.headY <= 200) throw new Error(`Head did not move downward: headY=${after.headY} (start 200)`);

    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // -------------------------------------------------------------------------
  // Test 2: eating food increments sessionFoodEaten and grows the snake.
  // -------------------------------------------------------------------------
  test('eating food increments sessionFoodEaten and grows snake.length', async () => {
    await startCleanGame(page);

    const before = await page.evaluate(() => ({
      eaten: sessionFoodEaten,
      len: snake.length,
      headX: snake[0].x,
      headY: snake[0].y,
    }));

    // Place food one tile ahead of the head in the current direction (right).
    // The snake moves right (dx=TILE_SIZE), so food at head.x+TILE_SIZE is
    // eaten on the next updateGame() tick.
    await page.evaluate(() => {
      food = { x: snake[0].x + 20, y: snake[0].y, type: 'common', spawnTime: performance.now() };
    });

    // Drive one tick — the head moves onto the food tile and the eat block fires.
    await page.evaluate(() => updateGame());

    const after = await page.evaluate(() => ({
      eaten: sessionFoodEaten,
      len: snake.length,
      state: gameState,
    }));

    if (after.state !== 'playing') throw new Error(`gameState=${after.state}, expected 'playing' (snake died unexpectedly)`);
    if (after.eaten !== before.eaten + 1) throw new Error(`sessionFoodEaten: expected ${before.eaten + 1}, got ${after.eaten}`);
    if (after.len !== before.len + 1) throw new Error(`snake.length: expected ${before.len + 1}, got ${after.len} (snake did not grow)`);

    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // -------------------------------------------------------------------------
  // Test 3: score increases after eating.
  // -------------------------------------------------------------------------
  test('score increases after eating food', async () => {
    await startCleanGame(page);

    const scoreBefore = await page.evaluate(() => score);

    // Place a common food (pts: 10) one tile ahead.
    await page.evaluate(() => {
      food = { x: snake[0].x + 20, y: snake[0].y, type: 'common', spawnTime: performance.now() };
    });
    await page.evaluate(() => updateGame());

    const scoreAfter = await page.evaluate(() => score);

    if (scoreAfter <= scoreBefore) throw new Error(`score did not increase: before=${scoreBefore}, after=${scoreAfter}`);
    // Common food awards 10 pts. Combo bonus is 0 on first eat (comboCount starts 0).
    if (scoreAfter - scoreBefore < 10) throw new Error(`score increase ${scoreAfter - scoreBefore} < 10 (common food pts)`);

    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // -------------------------------------------------------------------------
  // Test 4: stats.totalFoodEaten increments (GL1 fix from audit round 2).
  // -------------------------------------------------------------------------
  test('stats.totalFoodEaten increments after eating (GL1 fix)', async () => {
    await startCleanGame(page);

    const totalBefore = await page.evaluate(() => stats.totalFoodEaten);

    await page.evaluate(() => {
      food = { x: snake[0].x + 20, y: snake[0].y, type: 'common', spawnTime: performance.now() };
    });
    await page.evaluate(() => updateGame());

    const totalAfter = await page.evaluate(() => stats.totalFoodEaten);

    if (totalAfter !== totalBefore + 1) throw new Error(`stats.totalFoodEaten: expected ${totalBefore + 1}, got ${totalAfter}`);

    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // -------------------------------------------------------------------------
  // Test 5: checkAchievements / checkQuestProgress fire after eating.
  // Verified two ways: (a) spy on the functions, (b) observable effect —
  // the FIRST_BITE achievement (totalFoodEaten >= 1) unlocks.
  // -------------------------------------------------------------------------
  test('checkAchievements and checkQuestProgress fire after eating', async () => {
    await startCleanGame(page);

    // Spy: wrap both functions to count calls. The closures are module-scope
    // function declarations (window properties), so reassigning them on
    // window is observable by the eat block, which calls them by bare name.
    // Bare-name resolution finds the window property after reassignment.
    await page.evaluate(() => {
      window.__achCalls = 0;
      window.__questCalls = 0;
      const origAch = checkAchievements;
      const origQuest = checkQuestProgress;
      // Reassign the window-level binding (function declarations live on window).
      window.checkAchievements = function (s) { window.__achCalls++; return origAch(s); };
      window.checkQuestProgress = function () { window.__questCalls++; return origQuest(); };
    });

    // Ensure FIRST_BITE is not yet unlocked so the unlock is observable.
    await page.evaluate(() => { achievements.FIRST_BITE = null; });

    await page.evaluate(() => {
      food = { x: snake[0].x + 20, y: snake[0].y, type: 'common', spawnTime: performance.now() };
    });
    await page.evaluate(() => updateGame());

    const result = await page.evaluate(() => ({
      achCalls: window.__achCalls,
      questCalls: window.__questCalls,
      firstBite: achievements.FIRST_BITE ? true : false,
      totalFood: stats.totalFoodEaten,
    }));

    if (result.achCalls < 1) throw new Error(`checkAchievements was not called after eating (calls=${result.achCalls})`);
    if (result.questCalls < 1) throw new Error(`checkQuestProgress was not called after eating (calls=${result.questCalls})`);
    // FIRST_BITE unlocks at totalFoodEaten >= 1. This is the observable proof
    // that checkAchievements actually ran the achievement checks, not just
    // incremented a counter.
    if (!result.firstBite) throw new Error(`FIRST_BITE achievement did not unlock after eating (totalFoodEaten=${result.totalFood})`);

    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // -------------------------------------------------------------------------
  // Run all tests
  // -------------------------------------------------------------------------
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  \u2705 ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  \u274C ${t.name}: ${e.message}`);
      failed++;
    }
  }

  if (errors.length > 0) {
    console.log(`\nConsole errors during run: ${errors.length}`);
    errors.forEach(e => console.log(`  ! ${e}`));
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});