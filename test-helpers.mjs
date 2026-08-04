// Reusable Playwright test harness for the Snakes game (FOV-1076).
//
// Addresses the root cause of the game-loop bug going undetected: existing tests
// only used page.evaluate snapshots and direct updateGame() calls, never
// verifying real-time game behavior over wall-clock time. These helpers wrap
// the common patterns (start, wait for ticks, press direction, move toward
// food, snapshot state) so tests stay concise AND exercise the real loop.
//
// Usage:
//   import { startGame, waitForTicks, pressDirection, moveTowardFood,
//            getGameState, collectErrors, FILE, TICK_MS, TILE_SIZE } from './test-helpers.mjs';
//
// All helpers assume the module-scope globals documented in AGENTS.md:
// function/var declarations become window.* properties; let/const are lexical
// globals accessible by bare name via page.evaluate.

import { chromium } from 'playwright';

// snake.html lives next to this file.
const FILE = 'file://' + new URL('./snake.html', import.meta.url).pathname;
export { FILE };

export const TILE_SIZE = 20;
export const TICK_MS = 120; // BASE_SPEED default tick interval

// Direction key map for pressDirection().
const DIR_KEYS = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

// ---------------------------------------------------------------------------
// Browser/page lifecycle
// ---------------------------------------------------------------------------

// Launch a fresh browser + page and load the game. Collects console/page errors
// into the returned array so callers can assert "no errors". Passes the page
// back for direct use.
export async function launch() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(FILE, { waitUntil: 'networkidle' });
  return { browser, page };
}

// Attach error collectors to a page. Returns the array; push-then-assert later.
export function collectErrors(page) {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

// ---------------------------------------------------------------------------
// Game control helpers
// ---------------------------------------------------------------------------

// startGame(page, opts?) — load is assumed done. Presses Enter (the real
// idle→playing path) and waits for gameState === 'playing' with a snake present.
// opts.mode (default 'classic') sets gameMode before starting. opts.seed sets
// a deterministic seed (string) — mirrors the seedField handler's hash. opts.clean
// (default true) clears obstacles/hazards/rival/extraFoods after start so the
// snake can't die mid-test from ambient hazards.
export async function startGame(page, opts = {}) {
  const mode = opts.mode || 'classic';
  const clean = opts.clean !== false;
  await page.evaluate((m) => { gameMode = m; }, mode);
  if (opts.seed) {
    await page.evaluate((s) => {
      activeSeed = s;
      seedPrng = mulberry32(s.split('').reduce(function (h, c) {
        return ((h << 5) - h) + c.charCodeAt(0) | 0;
      }, 0));
    }, opts.seed);
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => typeof snake !== 'undefined' && snake.length > 0 && gameState === 'playing',
    { timeout: 5000 }
  );
  if (clean) {
    await page.evaluate(() => {
      obstacles = [];
      hazards = [];
      if (typeof rivals !== 'undefined') rivals = [];
      extraFoods = [];
    });
  }
}

// Stop the game loop and return to idle. Call at the end of every test so the
// next test starts from a clean slate (no lingering setTimeout chain).
export async function stopGame(page) {
  await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
}

// ---------------------------------------------------------------------------
// Tick & input helpers
// ---------------------------------------------------------------------------

// waitForTicks(page, n, timeoutMs=5000) — poll until gameTick advances by at
// least n from its current value, using the REAL setTimeout chain (wall-clock).
// This is the helper that catches the stuck-loop class of bug: it does NOT
// call updateGame() directly, so a stalled setTimeout chain times out.
export async function waitForTicks(page, n, timeoutMs = 5000) {
  const startTick = await page.evaluate(() => gameTick);
  await page.waitForFunction(
    (s) => typeof gameTick === 'number' && gameTick >= s,
    startTick + n,
    { timeout: timeoutMs }
  );
  return await page.evaluate(() => gameTick);
}

// pressDirection(page, dir) — press an arrow key and wait for the direction to
// be consumed (dirQueue drains the pressed turn). dir is 'up'|'down'|'left'|'right'.
// Returns the post-press {dx, dy} the snake settled into.
export async function pressDirection(page, dir) {
  const key = DIR_KEYS[dir];
  if (!key) throw new Error(`Unknown direction: ${dir}`);
  await page.keyboard.press(key);
  // Wait until dirQueue holds the turn OR (if the tick already consumed it)
  // dx/dy match the requested direction. The queue is 2-deep; a turn may be
  // consumed within one tick, so accept either condition.
  const want = {
    up: { dx: 0, dy: -TILE_SIZE },
    down: { dx: 0, dy: TILE_SIZE },
    left: { dx: -TILE_SIZE, dy: 0 },
    right: { dx: TILE_SIZE, dy: 0 },
  }[dir];
  await page.waitForFunction(
    (w) => {
      if (dirQueue.length > 0) {
        const h = dirQueue[0];
        if (h.dx === w.dx && h.dy === w.dy) return true;
      }
      return dx === w.dx && dy === w.dy;
    },
    want,
    { timeout: 3000 }
  );
  // Drive enough ticks to consume the queue and settle dx/dy, then return.
  await driveTicks(page, 2);
  return await page.evaluate(() => ({ dx, dy }));
}

// driveTicks(page, n) — call updateGame() directly n times. Use when you need
// deterministic, fast tick progression WITHOUT relying on wall-clock time
// (e.g., to place food and force an eat in one go). NOT a substitute for
// waitForTicks when testing the loop itself.
export async function driveTicks(page, n) {
  await page.evaluate((count) => { for (let i = 0; i < count; i++) updateGame(); }, n);
}

// ---------------------------------------------------------------------------
// Food helpers
// ---------------------------------------------------------------------------

// placeFood(page, opts?) — set the global `food` to a common food at a given
// position (default: one tile ahead of the head in the current direction).
// opts.type (default 'common'), opts.dx/dy override the offset direction,
// opts.x/opts.y set an absolute position.
export async function placeFood(page, opts = {}) {
  const type = opts.type || 'common';
  let x, y;
  if (opts.x !== undefined && opts.y !== undefined) {
    x = opts.x; y = opts.y;
  } else {
    const off = await page.evaluate(() => ({ dx, dy, hx: snake[0].x, hy: snake[0].y }));
    x = opts.dx !== undefined ? off.hx + opts.dx : off.hx + off.dx;
    y = opts.dy !== undefined ? off.hy + opts.dy : off.hy + off.dy;
  }
  await page.evaluate((p) => {
    food = { x: p.x, y: p.y, type: p.type, spawnTime: performance.now() };
  }, { x, y, type });
  return { x, y };
}

// moveTowardFood(page, opts?) — compute the direction from the snake head to the
// current food and drive ticks until the food is eaten (snake grows / new food
// spawns). Wraps around the board edges (wrap-aware Manhattan). opts.maxTicks
// (default 30) caps the loop to avoid hanging if food is unreachable.
// Returns the number of ticks driven. Uses direct updateGame() calls for speed —
// for a real-time version, pair with waitForTicks.
export async function moveTowardFood(page, opts = {}) {
  const maxTicks = opts.maxTicks || 30;
  const eaten = await page.evaluate((max) => {
    let ticks = 0;
    const PW = PLAY_WIDTH, PH = PLAY_HEIGHT, TS = TILE_SIZE;
    while (ticks < max && gameState === 'playing') {
      const h = snake[0];
      // Wrap-aware delta toward food.
      let ddx = food.x - h.x;
      let ddy = food.y - h.y;
      if (Math.abs(ddx) > PW / 2) ddx = ddx > 0 ? ddx - PW : ddx + PW;
      if (Math.abs(ddy) > PH / 2) ddy = ddy > 0 ? ddy - PH : ddy + PH;
      // Prefer the axis with larger distance; avoid 180° reversal.
      if (Math.abs(ddx) >= Math.abs(ddy)) {
        const ndx = ddx > 0 ? TS : -TS;
        if (ndx !== -dx) { dx = ndx; dy = 0; }
        else { dx = 0; dy = ddy > 0 ? TS : -TS; }
      } else {
        const ndy = ddy > 0 ? TS : -TS;
        if (ndy !== -dy) { dx = 0; dy = ndy; }
        else { dx = ddx > 0 ? TS : -TS; dy = 0; }
      }
      const beforeLen = snake.length;
      updateGame();
      ticks++;
      if (snake.length > beforeLen) break; // ate the food
    }
    return ticks;
  }, maxTicks);
  return eaten;
}

// ---------------------------------------------------------------------------
// State snapshot
// ---------------------------------------------------------------------------

// getGameState(page) — one-shot snapshot of the core observable state.
export async function getGameState(page) {
  return await page.evaluate(() => ({
    gameState,
    gameTick,
    score,
    snakeLength: snake.length,
    sessionFoodEaten,
    dirQueue: dirQueue.map(d => ({ dx: d.dx, dy: d.dy })),
    dx,
    dy,
    head: snake.length > 0 ? { x: snake[0].x, y: snake[0].y } : null,
    food: food ? { x: food.x, y: food.y, type: food.type } : null,
  }));
}

// ---------------------------------------------------------------------------
// Test runner (minimal, matches existing *.mjs convention)
// ---------------------------------------------------------------------------

// runTests(tests) — given an array of {name, fn}, run sequentially, log
// pass/fail, print console errors, exit non-zero on any failure. Mirrors the
// inline runner pattern in test-bugfixes.mjs / test-gameplay.mjs so existing
// suites can adopt the harness incrementally.
export async function runTests(tests) {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${t.name}`);
      console.log(`      ${err.message}`);
      failed++;
    }
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed;
}