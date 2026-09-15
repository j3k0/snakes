// v7 Feature D: Visual Polish Pack — smoke tests.
// Verifies D1 (food spawn pop + idle bob), D2 (grid breathing), D3 (post-FX
// vignette replacing drawSlowMoTint), and D4 (snake-decay death fragments
// replacing the old death-particle burst). Drives the real game functions.
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
    food = { x: 20, y: 20, type: 'common', spawnTime: performance.now() };
  });
}

// --- D1: easeOutBack + food spawn pop + idle bob ---
test('D1: easeOutBack exists and eases 0->1', async (page) => {
  const r = await page.evaluate(() => {
    if (typeof easeOutBack !== 'function') return { ok: false, why: 'no easeOutBack' };
    return { ok: true, at0: easeOutBack(0), at1: easeOutBack(1), mid: easeOutBack(0.5) };
  });
  if (!r.ok) throw new Error(r.why);
  // easeOutBack(0) = 1 + 2.7*(-1)^3 + 1.7*(-1)^2 = 1 - 2.7 + 1.7 = 0
  if (Math.abs(r.at0) > 0.001) throw new Error('easeOutBack(0) should be 0, got ' + r.at0);
  if (Math.abs(r.at1 - 1) > 0.001) throw new Error('easeOutBack(1) should be 1, got ' + r.at1);
  if (r.mid < 0.9) throw new Error('easeOutBack(0.5) unexpectedly low: ' + r.mid);
});

test('D1: generateFood sets spawnTime', async (page) => {
  await setup(page);
  const hasSpawnTime = await page.evaluate(() => {
    const f = generateFood([{ x: 0, y: 0 }]);
    return !!(f && typeof f.spawnTime === 'number');
  });
  if (!hasSpawnTime) throw new Error('generateFood did not set spawnTime');
});

test('D1: drawFood renders without error across all food types', async (page) => {
  await setup(page);
  const ok = await page.evaluate(() => {
    const types = ['common', 'uncommon', 'rare', 'epic', 'bonus', 'speed'];
    for (const ty of types) {
      food = { x: 20, y: 20, type: ty, spawnTime: performance.now() };
      drawFood();
    }
    return true;
  });
  if (!ok) throw new Error('drawFood threw for some food type');
});

test('D1: drawFood save/restore balanced (transform returns to identity)', async (page) => {
  await setup(page);
  const balanced = await page.evaluate(() => {
    ctx.save();
    const before = ctx.getTransform();
    food = { x: 20, y: 20, type: 'epic', spawnTime: performance.now() };
    renderTime = 12345;
    drawFood();
    const after = ctx.getTransform();
    ctx.restore();
    return before.a === after.a && before.d === after.d && before.e === after.e && before.f === after.f;
  });
  if (!balanced) throw new Error('drawFood left ctx transform mutated (save/restore imbalance)');
});

// --- D2: grid breathing ---
test('D2: drawGame renders without error during playing state', async (page) => {
  await setup(page);
  const ok = await page.evaluate(() => {
    gameState = 'playing';
    renderTime = 5000;
    drawGame(1);
    return true;
  });
  if (!ok) throw new Error('drawGame threw during playing (grid breathing)');
});

// --- D3: post-FX vignette ---
test('D3: drawPostFX exists and drawSlowMoTint is gone', async (page) => {
  const r = await page.evaluate(() => ({
    hasPostFX: typeof drawPostFX === 'function',
    hasSlowMoTint: typeof drawSlowMoTint !== 'undefined',
  }));
  if (!r.hasPostFX) throw new Error('drawPostFX missing');
  if (r.hasSlowMoTint) throw new Error('drawSlowMoTint should have been removed');
});

test('D3: drawPostFX save/restore balanced', async (page) => {
  const r = await page.evaluate(() => {
    ctx.save();
    const before = ctx.globalCompositeOperation;
    slowMoActive = true;
    gameState = 'playing';
    shakeTimer = 0;
    drawPostFX();
    const after = ctx.globalCompositeOperation;
    ctx.restore();
    slowMoActive = false;
    return before === after;
  });
  if (!r) throw new Error('drawPostFX changed globalCompositeOperation without restore');
});

test('D3: drawPostFX renders without error in gameover+shake (death vignette)', async (page) => {
  const ok = await page.evaluate(() => {
    gameState = 'gameover';
    shakeTimer = 150;
    drawPostFX();
    return true;
  });
  if (!ok) throw new Error('drawPostFX threw during gameover death-crush');
});

// --- D4: death fragments ---
test('D4: deathFragments state declared and empty at reset', async (page) => {
  await setup(page);
  const r = await page.evaluate(() => ({
    isArray: Array.isArray(deathFragments),
    empty: deathFragments.length === 0,
    inactive: deathFragmentsActive === false,
  }));
  if (!r.isArray) throw new Error('deathFragments is not an array');
  if (!r.empty || !r.inactive) throw new Error('deathFragments not cleared at reset: ' + JSON.stringify(r));
});

test('D4: gameOver spawns fragments (tail-to-head) and sets active', async (page) => {
  await setup(page);
  const r = await page.evaluate(() => {
    for (let i = 0; i < 5; i++) snake.push({ x: 20, y: 20 });
    gameOver();
    return {
      count: deathFragments.length,
      active: deathFragmentsActive,
      // Iterated fi from snake.length-1 down to 0, pushing each; so the LAST
      // pushed (head, fi=0) sits at the end of the array with the largest delay.
      headDelay: deathFragments.length ? deathFragments[deathFragments.length - 1].delay : -1,
      tailDelay: deathFragments.length ? deathFragments[0].delay : -1,
    };
  });
  if (!r.active) throw new Error('deathFragmentsActive not set after gameOver');
  if (r.count < 1) throw new Error('no fragments spawned');
  if (!(r.headDelay > r.tailDelay)) throw new Error('delays not tail-to-head: head=' + r.headDelay + ' tail=' + r.tailDelay);
});

test('D4: gameOver no longer calls spawnParticles for death', async (page) => {
  await setup(page);
  const particleCount = await page.evaluate(() => {
    snake = [];
    for (let i = 0; i < 6; i++) snake.push({ x: 20, y: 20 });
    particles = [];
    gameOver();
    return particles.length; // old code would have pushed ~30 death particles here
  });
  if (particleCount > 0) throw new Error('death still spawns particles (' + particleCount + '); old burst not replaced');
});

test('D4: fragment cap at 400 respected for very long snakes', async (page) => {
  await setup(page);
  const capped = await page.evaluate(() => {
    snake = [];
    for (let i = 0; i < 1000; i++) snake.push({ x: 20, y: 20 });
    gameOver();
    return deathFragments.length;
  });
  if (capped !== 400) throw new Error('expected exactly 400 fragments for 1000-seg snake, got ' + capped);
});

test('D4: animateVisuals renders fragments and restores compositeOp', async (page) => {
  await setup(page);
  const ok = await page.evaluate(() => {
    snake = [];
    for (let i = 0; i < 8; i++) snake.push({ x: 20, y: 20 });
    gameOver();
    // Stub the self-rescheduling requestAnimationFrame so animateVisuals runs its
    // body exactly once per call (it normally re-queues itself forever at the end).
    const realRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    let compositeOk = true;
    try {
      lastFrameTime = performance.now();
      animateVisuals(performance.now());
      for (const df of deathFragments) df.delay = 0;
      animateVisuals(performance.now() + 50);
      compositeOk = ctx.globalCompositeOperation === 'source-over';
    } finally {
      window.requestAnimationFrame = realRAF;
    }
    return compositeOk;
  });
  if (!ok) throw new Error('animateVisuals left compositeOp != source-over after fragment render');
});

test('D4: resetGame clears fragments', async (page) => {
  await setup(page);
  const cleared = await page.evaluate(() => {
    snake = [];
    for (let i = 0; i < 4; i++) snake.push({ x: 20, y: 20 });
    gameOver();
    if (!deathFragmentsActive) return 'fragments never activated';
    resetGame();
    return (deathFragments.length === 0 && deathFragmentsActive === false) ? 'cleared' : 'not cleared';
  });
  if (cleared !== 'cleared') throw new Error(cleared);
});

run().catch(e => { console.error(e); process.exit(1); });
