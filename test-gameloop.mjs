// Regression guard for the game-loop stuck bug (commit 114937e).
//
// Bug: scheduleNextTick()'s `if (gameTimeout) return;` guard blocked re-scheduling
// because the fired setTimeout handle was never cleared. The loop ran exactly ONE
// tick then stopped forever — gameTick stuck at 1, snake frozen after one step.
//
// This test relies on REAL wall-clock time (not a direct updateGame() call) so it
// catches the class of bug where the setTimeout chain silently stalls. Existing
// tests in test-bugfixes.mjs call updateGame() directly via page.evaluate, which
// bypasses the setTimeout loop entirely and cannot detect this regression.
//
// Run: node test-gameloop.mjs
// Must FAIL on the pre-fix code (gameTick stuck at 1) and PASS on the fixed code.

import { chromium } from 'playwright';

const FILE = 'file://' + new URL('./snake.html', import.meta.url).pathname;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(FILE, { waitUntil: 'networkidle' });
  console.log(`Page loaded. Title: ${await page.title()}`);

  // --- Game loop regression guard ---
  // Starts a game via the real Enter keydown path, waits wall-clock time, then
  // asserts the setTimeout chain kept ticking. The three assertions target the
  // observable symptoms of the stuck-loop bug:
  //   1. gameTick advanced well beyond 1 (loop kept scheduling)
  //   2. snake[0] moved off its start position (snake kept moving)
  //   3. gameState is still 'playing' (no crash from the stalled loop)
  test('Game loop runs: gameTick advances, snake moves, state stays playing', async () => {
    // Force classic mode (no daily attempt consumption, no special-mode side effects).
    await page.evaluate(() => { gameMode = 'classic'; });

    // Start the game via the real Enter keydown handler — exercises the same
    // idle→playing path a player hits. The keydown listener is on document,
    // and Playwright dispatches keyboard events to the page's active element
    // (body by default), which bubble to document.
    await page.keyboard.press('Enter');

    // Wait for the snake to initialize before snapshotting the start position.
    await page.waitForFunction(() => typeof snake !== 'undefined' && snake.length > 0 && gameState === 'playing', { timeout: 5000 });

    // Clear obstacles so the length-1 snake can wrap around the board without
    // dying during the 2.0s wait. This isolates the loop-mechanic regression
    // (setTimeout chain stalling) from gameplay hazards (obstacle/wall death),
    // which would otherwise end the run and flip gameState to 'gameover'. The
    // obstacles array is module-scope and writable from page.evaluate.
    await page.evaluate(() => { obstacles = []; });

    // Snapshot the starting head position right after the game begins.
    const start = await page.evaluate(() => ({ x: snake[0].x, y: snake[0].y, tick: gameTick }));

    // Let the real setTimeout chain run for ~2.0s. At the default 120ms tick
    // interval that's ~16 ticks — far past the single tick the bug allowed, and
    // chosen to land mid-wrap-cycle (the snake wraps every 20 ticks at
    // TILE_SIZE=20 across PLAY_WIDTH=400, so 20 ticks would return it to the
    // start position — 16 ticks leaves it well clear). We do NOT call
    // updateGame() directly; the loop must drive itself.
    await page.waitForTimeout(2000);

    const after = await page.evaluate(() => ({
      tick: gameTick,
      headX: snake[0].x,
      headY: snake[0].y,
      state: gameState,
    }));

    // 1. gameTick must have advanced well beyond 1. The bug stalled at exactly
    //    1 (one tick fired, then the guard blocked re-scheduling). Requiring > 5
    //    gives a robust margin against any startup jitter.
    if (typeof after.tick !== 'number' || after.tick <= 5) {
      throw new Error(`gameTick did not advance past 5 (got ${after.tick}) — game loop stalled. Start tick was ${start.tick}.`);
    }

    // 2. The snake head must have moved from its start position. With the bug
    //    the snake advanced exactly one tile then froze, so this is a weaker
    //    signal than gameTick — but it confirms the snake is actually moving,
    //    not just a counter incrementing in a dead callback.
    const moved = after.headX !== start.x || after.headY !== start.y;
    if (!moved) {
      throw new Error(`snake[0] did not move from start (${start.x},${start.y}) — snake is frozen. After: (${after.headX},${after.headY}).`);
    }

    // 3. gameState must still be 'playing' — the stalled loop must not have
    //    silently crashed the game or flipped state.
    if (after.state !== 'playing') {
      throw new Error(`gameState is '${after.state}', expected 'playing' — game crashed during the loop.`);
    }

    console.log(`    start tick=${start.tick} head=(${start.x},${start.y}) → after tick=${after.tick} head=(${after.headX},${after.headY}) state=${after.state}`);

    // Clean up so subsequent runs of the suite don't inherit a running loop.
    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // Run all tests
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✅ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${t.name}: ${e.message}`);
      failed++;
    }
  }

  // Surface any console errors collected during the run.
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