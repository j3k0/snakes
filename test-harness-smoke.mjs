// Smoke test for the reusable Playwright test harness (FOV-1076).
//
// Verifies the harness helpers work end-to-end against the real game:
//   1. startGame + waitForTicks — the loop runs over wall-clock time
//   2. pressDirection — input is accepted and the snake turns
//   3. placeFood + moveTowardFood — food can be eaten
//   4. getGameState — score increments after eating
//
// This test uses the REAL setTimeout chain (no direct updateGame() calls in
// the loop/tick assertions), so it would catch a regression like the
// stuck-loop bug (commit 114937e) that the snapshot-only suite missed.
//
// Run: node test-harness-smoke.mjs

import {
  launch, collectErrors, startGame, stopGame,
  waitForTicks, pressDirection, driveTicks,
  placeFood, moveTowardFood, getGameState,
  runTests, TILE_SIZE,
} from './test-helpers.mjs';

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function run() {
  const { browser, page } = await launch();
  const errors = collectErrors(page);
  console.log(`Page loaded. Title: ${await page.title()}`);

  // -------------------------------------------------------------------------
  // Test 1: startGame + waitForTicks — the loop runs over wall-clock time.
  // This is the test the old suite could not do: it relies on the real
  // setTimeout chain, not a direct updateGame() call.
  // -------------------------------------------------------------------------
  test('startGame enters playing; waitForTicks advances via real setTimeout chain', async () => {
    await startGame(page);
    const snap = await getGameState(page);
    if (snap.gameState !== 'playing') throw new Error(`gameState=${snap.gameState}, expected 'playing'`);
    if (snap.snakeLength < 1) throw new Error(`snake length ${snap.snakeLength} < 1`);
    const startTick = snap.gameTick;
    const afterTick = await waitForTicks(page, 5, 6000);
    if (afterTick < startTick + 5) {
      throw new Error(`gameTick advanced ${afterTick - startTick} (< 5) — real loop stalled`);
    }
    console.log(`    tick ${startTick} → ${afterTick} (real wall-clock loop)`);
    await stopGame(page);
  });

  // -------------------------------------------------------------------------
  // Test 2: pressDirection — input is accepted and the snake turns.
  // -------------------------------------------------------------------------
  test('pressDirection turns the snake and settles dx/dy', async () => {
    await startGame(page);
    // Snake starts moving right (dx=TILE_SIZE, dy=0). Turn down.
    const turned = await pressDirection(page, 'down');
    if (turned.dy !== TILE_SIZE) throw new Error(`dy=${turned.dy}, expected ${TILE_SIZE} (down)`);
    if (turned.dx !== 0) throw new Error(`dx=${turned.dx}, expected 0 (down)`);
    const snap = await getGameState(page);
    if (snap.dy !== TILE_SIZE) throw new Error(`getGameState dy=${snap.dy}, expected ${TILE_SIZE}`);
    console.log(`    turned down: dx=${snap.dx} dy=${snap.dy}`);
    await stopGame(page);
  });

  // -------------------------------------------------------------------------
  // Test 3: placeFood + moveTowardFood — food can be eaten (snake grows).
  // -------------------------------------------------------------------------
  test('placeFood + moveTowardFood: snake eats and grows', async () => {
    await startGame(page);
    const before = await getGameState(page);
    // Place a common food one tile ahead of the head.
    await placeFood(page);
    const ticks = await moveTowardFood(page, { maxTicks: 5 });
    const after = await getGameState(page);
    if (after.gameState !== 'playing') throw new Error(`gameState=${after.gameState}, expected 'playing'`);
    if (after.snakeLength <= before.snakeLength) {
      throw new Error(`snake did not grow: ${before.snakeLength} → ${after.snakeLength} (ticks=${ticks})`);
    }
    console.log(`    length ${before.snakeLength} → ${after.snakeLength} in ${ticks} ticks`);
    await stopGame(page);
  });

  // -------------------------------------------------------------------------
  // Test 4: getGameState — score increments after eating.
  // -------------------------------------------------------------------------
  test('getGameState: score increments after eating', async () => {
    await startGame(page);
    const before = await getGameState(page);
    await placeFood(page);
    await moveTowardFood(page, { maxTicks: 5 });
    const after = await getGameState(page);
    if (after.score <= before.score) {
      throw new Error(`score did not increase: ${before.score} → ${after.score}`);
    }
    if (after.sessionFoodEaten <= before.sessionFoodEaten) {
      throw new Error(`sessionFoodEaten did not increase: ${before.sessionFoodEaten} → ${after.sessionFoodEaten}`);
    }
    console.log(`    score ${before.score} → ${after.score}, food ${before.sessionFoodEaten} → ${after.sessionFoodEaten}`);
    await stopGame(page);
  });

  // -------------------------------------------------------------------------
  // Run all tests
  // -------------------------------------------------------------------------
  const failed = await runTests(tests);

  if (errors.length > 0) {
    console.log('\nConsole errors during run:');
    for (const e of errors) console.log(`  ! ${e}`);
  }

  await browser.close();
  process.exit(failed > 0 || errors.length > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});