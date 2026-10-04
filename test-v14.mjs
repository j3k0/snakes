// v14 test suite — Snakes v14 "the rival obeys the board and is legible".
//
// Every assertion is BEHAVIOURAL: it drives the real `updateRival()` / `updateGame()` /
// `drawGame()` and asserts an observable outcome. No source-substring assertion stands alone.
//
// Run: node test-v14.mjs
// Differential (pre-v14 build must fail the feature tests):
//   git show c3289a1:snake.html > /tmp/pre-v14.html && SNAKE_FILE=/tmp/pre-v14.html node test-v14.mjs

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.env.SNAKE_FILE || join(__dirname, 'snake.html');

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });

let pass = 0, fail = 0;
function ok(name) { console.log('  PASS  ' + name); pass++; }
function fail_(name, msg) { console.log('  FAIL  ' + name + (msg ? ': ' + msg : '')); fail++; }
function check(name, cond, msg) { cond ? ok(name) : fail_(name, msg); }

await page.waitForTimeout(400);
await page.evaluate(() => { window.__origSeededRandom = window.seededRandom; });

// Shared in-page preamble: a clean, deterministic Classic run with every capture stubbed.
const PRE = `
const roadChase = () => { window.seededRandom = () => 0; };
const cleanRun = (opts) => {
  opts = opts || {};
  window.seededRandom = window.__origSeededRandom;
  gameMode = opts.mode || 'classic';
  resetGame(); startGame(); stopGameLoop();
  rivals = []; obstacles = []; hazards = []; extraFoods = [];
  activeBrews = []; activeMutators = [];
  hoardActive = false; rivalFreezeMs = 0;
  score = 0; stats.rivalsDefeated = 0;
  food = null; food2 = null;
  floaters.length = 0; particles.length = 0; particleDensity = 100;
  window.__sounds = [];
  if (!window.__origPlaySound) window.__origPlaySound = window.playSound;
  window.playSound = (n) => { window.__sounds.push(n); };
  window.__sr = [];
  if (!window.__origSrSpeak) window.__origSrSpeak = window.srSpeak;
  window.srSpeak = (t) => { window.__sr.push(t); };
};
const rivalAt = (segs, ddx, ddy) => {
  rivals = [{ snake: segs.map(s => ({ x: s[0], y: s[1] })), dx: ddx, dy: ddy,
              active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
};
`;

check('No page errors on load', pageErrors.length === 0, pageErrors.join('; '));

// ---------------------------------------------------------------------------
// A — the rival's meal is visible and audible.
console.log('\nA: rival eat cue');
{
  const r = await page.evaluate(PRE + `
    cleanRun();
    rivalAt([[100,100],[80,100],[60,100]], 20, 0);
    food = { x: 120, y: 100, type: 'common', spawnTime: performance.now() };
    roadChase();
    const foodBefore = food;
    updateRival(0);
    ({ ate: food !== foodBefore, len: rivals[0].snake.length,
       floaters: floaters.map(f => f.text), particles: particles.length,
       sounds: window.__sounds.slice(), sr: window.__sr.slice() });
  `);
  check('A1 fixture: the rival ate (one call, one tile)', r.ate && r.len === 4, JSON.stringify(r));
  check('A1 exactly one "rival ate" floater', r.floaters.length === 1 && r.floaters[0] === 'rival ate', JSON.stringify(r.floaters));
  check('A1 exactly one rival_eat sound', r.sounds.filter(s => s === 'rival_eat').length === 1, JSON.stringify(r.sounds));
  check('A1 four particles', r.particles === 4, String(r.particles));
  check('A1 SR line "Rival ate"', r.sr.includes('Rival ate'), JSON.stringify(r.sr));

  const r2 = await page.evaluate(PRE + `
    cleanRun();
    rivalAt([[100,100],[80,100],[60,100]], 20, 0);
    food = { x: 300, y: 300, type: 'common', spawnTime: performance.now() };
    roadChase();
    updateRival(0);
    ({ floaters: floaters.length, sounds: window.__sounds.filter(s => s === 'rival_eat').length });
  `);
  check('A2 no cue on a plain move', r2.floaters === 0 && r2.sounds === 0, JSON.stringify(r2));
}

// ---------------------------------------------------------------------------
// B — the rival obeys the board: obstacles and hazards.
console.log('\nB: the board constrains the rival');
{
  // B1: chase branch pinned — a wall between the rival and the food. The 20%/10% branches
  // are untouched by design and still phase through (B3 measures that residual).
  const r = await page.evaluate(PRE + `
    cleanRun();
    const wall = [];
    for (let y = 60; y <= 340; y += 20) wall.push({ x: 200, y });
    obstacles = wall;
    rivalAt([[100,200],[80,200],[60,200]], 20, 0);
    // x=280, not further: chase is wrap-aware, and food more than half a board away is
    // chased the OTHER way round — the rival would never meet the wall (vacuous pass).
    food = { x: 280, y: 200, type: 'common', spawnTime: performance.now() };
    roadChase();
    const target = food;
    let entered = null, alive = true, ateAt = -1;
    for (let i = 0; i < 40; i++) {
      updateRival(0);
      if (!rivals[0].active) { alive = false; break; }
      const h = rivals[0].snake[0];
      if (obstacles.some(o => o.x === h.x && o.y === h.y)) { entered = i + ':' + h.x + ',' + h.y; break; }
      if (food !== target) { ateAt = i; break; }
    }
    ({ entered, alive, head: rivals[0].snake[0], ate: food !== target, ateAt });
  `);
  check('B1 chasing rival routes around an obstacle wall (40 ticks)', r.entered === null && r.alive, JSON.stringify(r));
  check('B1 ...and still reaches the food behind it', r.ate === true, JSON.stringify(r));

  // B2a: hazard kill — the rival steps into a live rift.
  const r2 = await page.evaluate(PRE + `
    cleanRun();
    rivalAt([[100,100],[80,100],[60,100]], 20, 0);
    food = { x: 300, y: 300, type: 'common', spawnTime: performance.now() };
    hazards = [{ cx: 120, cy: 100, radius: 16, phase: 'on', phaseTimer: 99, lifeTimer: 999, maxLife: 999, seedOffset: 0 }];
    window.seededRandom = () => 0.75; // straight
    const d0 = stats.rivalsDefeated, s0 = score;
    updateRival(0);
    ({ active: rivals[0].active, dDef: stats.rivalsDefeated - d0, dScore: score - s0, sr: window.__sr.slice() });
  `);
  check('B2a rival dies stepping into a live rift', r2.active === false, JSON.stringify(r2));
  check('B2a the rift kill is uncredited (no defeat, no score)', r2.dDef === 0 && r2.dScore === 0, JSON.stringify(r2));
  check('B2a SR says "Rival destroyed itself"', r2.sr.includes('Rival destroyed itself') && !r2.sr.includes('Rival destroyed'), JSON.stringify(r2.sr));

  // B2c: an off-phase rift is harmless; hazards off in a hazard-less mode.
  const r3 = await page.evaluate(PRE + `
    const out = {};
    cleanRun();
    rivalAt([[100,100],[80,100],[60,100]], 20, 0);
    food = { x: 300, y: 300, type: 'common', spawnTime: performance.now() };
    hazards = [{ cx: 120, cy: 100, radius: 16, phase: 'off', phaseTimer: 99, lifeTimer: 999, maxLife: 999, seedOffset: 0 }];
    window.seededRandom = () => 0.75;
    updateRival(0); out.offPhase = rivals[0].active;
    cleanRun({ mode: 'zen' });
    rivalAt([[100,100],[80,100],[60,100]], 20, 0);
    food = { x: 300, y: 300, type: 'common', spawnTime: performance.now() };
    hazards = [{ cx: 120, cy: 100, radius: 16, phase: 'on', phaseTimer: 99, lifeTimer: 999, maxLife: 999, seedOffset: 0 }];
    window.seededRandom = () => 0.75;
    updateRival(0); out.zen = rivals[0].active;
    out;
  `);
  check('B2c off-phase rift and hazard-less mode do not kill', r3.offPhase === true && r3.zen === true, JSON.stringify(r3));

  // B2d: a credited (player) removal still says 'Rival destroyed'.
  const r4 = await page.evaluate(PRE + `
    cleanRun();
    rivalAt([[100,100],[80,100],[60,100]], 20, 0);
    removeRival(0, true);
    ({ sr: window.__sr.slice(), dDef: stats.rivalsDefeated });
  `);
  check('B2d credited removal: "Rival destroyed", defeat counted', r4.sr.includes('Rival destroyed') && r4.dDef === 1, JSON.stringify(r4));

  // B4: self-crash whose target tile is also inside a live rift — removed exactly once.
  const r5 = await page.evaluate(PRE + `
    cleanRun();
    // A U-shaped body: head (100,100) facing -y, the next step (100,80) is body index 3.
    rivalAt([[100,100],[120,100],[120,80],[100,80],[80,80]], 0, -20);
    food = { x: 300, y: 300, type: 'common', spawnTime: performance.now() };
    hazards = [{ cx: 100, cy: 80, radius: 16, phase: 'on', phaseTimer: 99, lifeTimer: 999, maxLife: 999, seedOffset: 0 }];
    window.seededRandom = () => 0.75;
    const orig = window.removeRival; let calls = 0;
    window.removeRival = function(i, c) { calls++; return orig(i, c); };
    updateRival(0);
    window.removeRival = orig;
    ({ calls, active: rivals[0].active, particles: particles.length, sr: window.__sr.slice() });
  `);
  check('B4 self-crash into a rift: one removal, one burst', r5.calls === 1 && r5.active === false && r5.particles === 20, JSON.stringify(r5));

  // B5: post-move semantics — stepping OUT of a live rift survives.
  const r6 = await page.evaluate(PRE + `
    cleanRun();
    rivalAt([[100,100],[80,100],[60,100]], 20, 0);
    food = { x: 300, y: 300, type: 'common', spawnTime: performance.now() };
    hazards = [{ cx: 100, cy: 100, radius: 16, phase: 'on', phaseTimer: 99, lifeTimer: 999, maxLife: 999, seedOffset: 0 }];
    window.seededRandom = () => 0.75;
    updateRival(0);
    ({ active: rivals[0].active, head: rivals[0].snake[0] });
  `);
  check('B5 a rival stepping out of a live rift survives', r6.active === true && r6.head.x === 120, JSON.stringify(r6));

  // B3: 20-seed aggregate, post-B vs a pre-B build derived in-page (the obstacle filter
  // stripped from the live updateRival source). On a build without B1 the strip is a no-op
  // and the phase-through ratio is 1.0 — the gate fails, as it must.
  const r7 = await page.evaluate(PRE + `
    cleanRun();
    const post = window.updateRival;
    const pre = eval('(' + post.toString().split(' && !obstacleHit(d)').join('') + ')');
    const tot = { pre: { eats: 0, ticks: 0, pt: 0 }, post: { eats: 0, ticks: 0, pt: 0 } };
    for (let s = 0; s < 20; s++) {
      for (const [name, fn] of [['pre', pre], ['post', post]]) {
        window.updateRival = fn;
        cleanRun();
        seedPrng = mulberry32(hashString('b3-seed-' + s)); activeSeed = 'b3-seed-' + s;
        const wall = [];
        for (let y = 60; y <= 340; y += 20) {
          if (y !== 200) wall.push({ x: 140, y });
          if (y !== 100) wall.push({ x: 240, y });
          if (y !== 300) wall.push({ x: 320, y });
        }
        obstacles = wall;
        rivalAt([[100,200],[80,200],[60,200]], 20, 0);
        food = { x: 360, y: 200, type: 'common', spawnTime: performance.now() };
        let prev = food;
        for (let i = 0; i < 300; i++) {
          updateRival(0);
          if (!rivals[0].active) break;
          tot[name].ticks++;
          const h = rivals[0].snake[0];
          if (obstacles.some(o => o.x === h.x && o.y === h.y)) tot[name].pt++;
          if (food !== prev) { tot[name].eats++; prev = food; }
          if (!food) break;
        }
      }
    }
    window.updateRival = post;
    seedPrng = null; activeSeed = null;
    tot.pre.tpe = tot.pre.ticks / tot.pre.eats; tot.post.tpe = tot.post.ticks / tot.post.eats;
    tot;
  `);
  console.log('        B3 figures: ' + JSON.stringify(r7));
  check('B3 time-to-food within 1.25x of pre-B (20 seeds)', r7.post.tpe <= r7.pre.tpe * 1.25, r7.pre.tpe.toFixed(1) + ' -> ' + r7.post.tpe.toFixed(1));
  check('B3 phase-throughs at most half of pre-B (20 seeds)', r7.post.pt <= r7.pre.pt * 0.5, r7.pre.pt + ' -> ' + r7.post.pt);
}

// ---------------------------------------------------------------------------
// C — the portal exit never lands on a materialising rival.
console.log('\nC: snapToFreeTile respects telegraphs');
{
  const sweep = (active) => page.evaluate(PRE + `
    cleanRun();
    const rng = mulberry32(hashString('c-sweep'));
    const cols = PLAY_WIDTH / TILE_SIZE, rows = PLAY_HEIGHT / TILE_SIZE;
    let good = 0; const bad = [];
    for (let t = 0; t < 50; t++) {
      const x = (2 + Math.floor(rng() * (cols - 4))) * TILE_SIZE;
      const y = (2 + Math.floor(rng() * (rows - 4))) * TILE_SIZE;
      // A 3-segment body whose HEAD sits on the exit candidate; one perpendicular
      // neighbour also covered, so the snap has to choose among the rest.
      rivals = [{ snake: [{x, y}, {x: x - 20, y}, {x: x - 40, y}], dx: 20, dy: 0,
                  active: ${active}, respawnTimer: ${active ? 0 : 1600}, moveCounter: 0, color: '#B71C1C' }];
      snake = [{ x: x, y: y - 20 }, { x: x, y: y - 40 }];
      obstacles = [];
      const out = snapToFreeTile(x, y);
      const onRival = rivalCombinedSnake().some(s => s.x === out.x && s.y === out.y);
      const onSnake = snake.some(s => s.x === out.x && s.y === out.y);
      if (!onRival && !onSnake) good++; else if (bad.length < 3) bad.push(x + ',' + y + '->' + out.x + ',' + out.y);
    }
    ({ good, bad });
  `);
  const c1 = await sweep(false);
  check('C1 materialising rival: exit snaps off the telegraph (50/50)', c1.good === 50, JSON.stringify(c1));
  const c2 = await sweep(true);
  check('C2 active rival: exit snaps off the body (50/50, regression)', c2.good === 50, JSON.stringify(c2));
}

// ---------------------------------------------------------------------------
// D1 — mode-select descriptions draw within the canvas.
console.log('\nD1: mode-select descriptions within bounds');
{
  const draw = (longDesc) => page.evaluate(PRE + `
    cleanRun();
    gameState = 'idle';
    const savedWelcome = welcomeOverlay;
    welcomeOverlay = false; // P3: with the welcome overlay up, 6 of 8 descriptions never draw
    const origFill = ctx.fillText, origDesc = window.getModeDesc;
    if (${longDesc}) window.getModeDesc = () => 'W'.repeat(80);
    const res = {};
    for (let i = 0; i < MODE_ORDER.length; i++) {
      const mode = MODE_ORDER[i];
      const want = getModeDesc(mode);
      const hits = [];
      ctx.fillText = function(text, x, y) {
        const t = String(text);
        if (t === want || (t.endsWith('\u2026') && want.startsWith(t.slice(0, -1)))) {
          const w = ctx.measureText(t).width;
          const left = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'right' ? x - w : x;
          hits.push({ left: Math.round(left * 10) / 10, right: Math.round((left + w) * 10) / 10, clipped: t !== want });
        }
        return origFill.apply(this, arguments);
      };
      modeSelectIndex = i;
      drawGame(1);
      res[mode] = hits;
    }
    ctx.fillText = origFill; window.getModeDesc = origDesc; welcomeOverlay = savedWelcome;
    ({ res, W: CANVAS_WIDTH });
  `);
  const r = await draw(false);
  const bad = Object.entries(r.res).filter(([m, h]) => h.length !== 1 || h[0].left < 0 || h[0].right > r.W || h[0].clipped);
  check('D1a all 8 descriptions drawn once, whole, inside the canvas', Object.keys(r.res).length === 8 && bad.length === 0, JSON.stringify(bad));
  const r2 = await draw(true);
  const bad2 = Object.entries(r2.res).filter(([m, h]) => h.length !== 1 || h[0].left < 0 || h[0].right > r2.W - 10 || !h[0].clipped);
  check('D1b an over-long description is ellipsised inside the canvas', bad2.length === 0, JSON.stringify(bad2.slice(0, 2)));
}

// ---------------------------------------------------------------------------
// D2 — one NEW BEST per run; the cascade-lowered best is corrected.
console.log('\nD2: NEW BEST toast + cascade correction');
{
  const D2PRE = PRE + `
  const savedHighs = JSON.stringify(modeHighScores);
  const toasts = [];
  if (!window.__origQueueToast) window.__origQueueToast = window.queueToast;
  window.queueToast = (m) => { toasts.push(String(m)); };
  const newBests = () => toasts.filter(t => t.includes('NEW BEST')).length;
  const runIn = (mode, startBest, mutators) => {
    cleanRun({ mode });
    // cleanRun started a run; set the best and restart so sessionModeHighStart reads it.
    stopGameLoop();
    if (startBest === undefined) delete modeHighScores[mode]; else modeHighScores[mode] = startBest;
    saveManager.setJSON('snake_mode_highs', modeHighScores);
    startGame(); stopGameLoop();
    activeMutators = mutators || []; activeBrews = []; score = 0;
    toasts.length = 0;
  };
  const restore = () => {
    window.queueToast = window.__origQueueToast;
    modeHighScores = JSON.parse(savedHighs);
    saveManager.setJSON('snake_mode_highs', modeHighScores);
    resetGame();
  };
  `;
  const a = await page.evaluate(D2PRE + `
    runIn('classic', 100);
    for (let i = 0; i < 40; i++) addScore(10);
    const out = { n: newBests(), best: modeHighScores.classic, score };
    restore(); out;
  `);
  check('D2a a record run queues exactly one NEW BEST toast', a.n === 1 && a.best === a.score, JSON.stringify(a));

  const b = await page.evaluate(D2PRE + `
    runIn('snap', undefined);
    addScore(10); addScore(10);
    const out = { n: newBests(), start: sessionModeHighStart };
    restore(); out;
  `);
  check('D2b a fresh mode gets its NEW BEST at the first crossing', b.n === 1 && b.start === 0, JSON.stringify(b));

  const c = await page.evaluate(D2PRE + `
    runIn('classic', 500);
    for (let i = 0; i < 70; i++) addScore(10);
    resetGame(); // the pause-menu Quit path: no finalizeSession
    const out = { persisted: saveManager.getJSON('snake_mode_highs', {}).classic };
    restore(); out;
  `);
  check('D2c pause-quit keeps the raw mid-run best (unchanged)', c.persisted === 700, JSON.stringify(c));

  const d = await page.evaluate(D2PRE + `
    runIn('classic', 40, ['gravity', 'mirror']);
    for (let i = 0; i < 10; i++) addScore(10);
    const mid = modeHighScores.classic;
    gameOver();
    const out = { mid, score, mult: sessionCascadeMult,
                  persisted: saveManager.getJSON('snake_mode_highs', {}).classic,
                  live: modeHighScores.classic, recapNew: recapData && recapData.isNewBest };
    restore(); out;
  `);
  check('D2d cascade-lowered best is corrected to the post-cascade score', d.mid === 100 && d.mult === 0.5 && d.score === 50 && d.persisted === 50 && d.live === 50 && d.recapNew === true, JSON.stringify(d));

  const d2 = await page.evaluate(D2PRE + `
    runIn('classic', 80, ['gravity', 'mirror']);
    for (let i = 0; i < 10; i++) addScore(10);
    gameOver();
    const out = { score, persisted: saveManager.getJSON('snake_mode_highs', {}).classic };
    restore(); out;
  `);
  check('D2d\' correction never drops below the start best', d2.score === 50 && d2.persisted === 80, JSON.stringify(d2));

  const e = await page.evaluate(D2PRE + `
    runIn('classic', 40, ['gravity']);
    for (let i = 0; i < 10; i++) addScore(10);
    gameOver();
    const out = { score, persisted: saveManager.getJSON('snake_mode_highs', {}).classic };
    restore(); out;
  `);
  check('D2e single-mutator run: the persisted best is the raw score', e.score === 100 && e.persisted === 100, JSON.stringify(e));

  const f = await page.evaluate(D2PRE + `
    runIn('classic', 200);
    for (let i = 0; i < 50; i++) addScore(10);
    const snap = buildSnapshotObject();
    resetGame();
    sessionNewBestAnnounced = false; sessionRunMaxRaw = 0; // prove restore re-derives them
    restoreFromSnapshot(snap);
    stopGameLoop();
    toasts.length = 0;
    const flag = sessionNewBestAnnounced, maxRaw = sessionRunMaxRaw;
    addScore(10);
    const out = { flag, maxRaw, n: newBests(), score, start: sessionModeHighStart };
    restore(); out;
  `);
  check('D2f a resumed record run does not re-fire the toast', f.flag === true && f.maxRaw === 500 && f.n === 0 && f.start === 200, JSON.stringify(f));
}

// ---------------------------------------------------------------------------
// E — the screen-reader queue keeps two messages, in order.
console.log('\nE: srSpeak depth 2');
{
  const r = await page.evaluate(`(async () => {
    const speak = window.__origSrSpeak || window.srSpeak;
    if (window.__origSrSpeak) window.srSpeak = window.__origSrSpeak;
    const el = document.getElementById('srAnnounce');
    const heard = [];
    const mo = new MutationObserver(() => { if (el.textContent) heard.push(el.textContent); });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    await new Promise(res => setTimeout(res, 600));   // let any pending drain finish
    heard.length = 0;
    srQueue = Array.isArray(srQueue) ? [] : '';       // drop leftovers from earlier scenarios
    lastSrSpeak = Date.now();                         // open a 500ms window
    speak('FIRST'); speak('SECOND');
    const queued = Array.isArray(srQueue) ? srQueue.slice() : srQueue;
    await new Promise(res => setTimeout(res, 1800));  // two drain windows
    lastSrSpeak = Date.now();
    for (let i = 0; i < 5; i++) speak('X' + i);
    const capped = Array.isArray(srQueue) ? srQueue.slice() : srQueue;
    await new Promise(res => setTimeout(res, 1800));
    mo.disconnect();
    return { heard, queued, capped };
  })()`);
  const iF = r.heard.indexOf('FIRST'), iS = r.heard.indexOf('SECOND');
  check('E1 two messages in one window are both spoken, in order', iF >= 0 && iS > iF, JSON.stringify(r));
  check('E2 the queue is capped at 2 (third+ dropped)', Array.isArray(r.capped) && r.capped.length === 2 && r.capped[0] === 'X0' && r.capped[1] === 'X1', JSON.stringify(r.capped));
}

// ---------------------------------------------------------------------------
// F + H — the death frame keeps its rival; the two rival heads differ.
console.log('\nF/H: death-frame rival + per-rival head colours');
{
  const r = await page.evaluate(PRE + `
    cleanRun();
    // Bottom-left corner, well outside the centred recap card.
    rivalAt([[40,360],[20,360],[0,360]], 20, 0);
    // Board coords -> device pixels: drawGame applies DPR and translates by the play margin.
    const px = (x, y) => { const d = ctx.getImageData(Math.round((PLAY_MARGIN_LEFT + x) * DPR), Math.round((PLAY_MARGIN_TOP + y) * DPR), 1, 1).data; return [d[0], d[1], d[2]]; };
    // Sanity: the same pixel is red while PLAYING, so the probe point is right.
    drawGame(1);
    const live = px(50, 370);
    lastDeathCause = 'test';
    gameOver();
    deathFragments = []; deathFragmentsActive = false; particles.length = 0;
    drawGame(1);
    const dead = px(50, 370);
    const rivalsAfter = rivals.length;
    // Escape -> idle
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const state = gameState;
    welcomeOverlay = false;
    drawGame(1);
    const idle = px(50, 370);
    resetGame();
    ({ live, dead, idle, state, rivalsAfter, deathLen: typeof deathRivals !== 'undefined' ? deathRivals.length : 0 });
  `);
  const reddish = (c) => c[0] > 150 && c[0] > c[1] + 40 && c[0] > c[2] + 20;
  check('F0 fixture: the rival head pixel is red while playing', reddish(r.live), JSON.stringify(r));
  check('F1 the game-over frame still shows the rival', r.rivalsAfter === 0 && reddish(r.dead), JSON.stringify(r));
  check('F1 after Escape to idle the rival is gone (and resetGame clears the copy)', r.state === 'idle' && !reddish(r.idle) && r.deathLen === 0, JSON.stringify(r));

  const h = await page.evaluate(PRE + `
    cleanRun();
    rivals = [
      { snake: [{x:40,y:100},{x:20,y:100}], dx: 20, dy: 0, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' },
      { snake: [{x:40,y:300},{x:20,y:300}], dx: 20, dy: 0, active: true, respawnTimer: 0, moveCounter: 0, color: '#AD1457' },
    ];
    const heads = [];
    const origRect = ctx.fillRect;
    ctx.fillRect = function(x, y) {
      if ((x === 41 && (y === 101 || y === 301))) heads.push(y + ':' + ctx.fillStyle);
      return origRect.apply(this, arguments);
    };
    drawRival(0);
    ctx.fillRect = origRect;
    rivals[1].active = false; rivals[1].respawnTimer = 800; // materialising branch too
    const heads2 = [];
    ctx.fillRect = function(x, y) {
      if (x === 41 && y === 301) heads2.push(ctx.fillStyle);
      return origRect.apply(this, arguments);
    };
    drawRival(0);
    ctx.fillRect = origRect;
    resetGame();
    ({ heads, heads2 });
  `);
  const c0 = (h.heads.find(s => s.startsWith('101:')) || '').slice(4), c1 = (h.heads.find(s => s.startsWith('301:')) || '').slice(4);
  check('H1 two rivals draw distinguishable head colours', c0 && c1 && c0 !== c1, JSON.stringify(h));
  check('H1 the materialising telegraph uses the same per-rival head colour', h.heads2.length === 1 && h.heads2[0] === c1, JSON.stringify(h));
}

// ---------------------------------------------------------------------------
await page.evaluate(() => {
  if (window.__origPlaySound) window.playSound = window.__origPlaySound;
  if (window.__origSrSpeak) window.srSpeak = window.__origSrSpeak;
  window.seededRandom = window.__origSeededRandom;
});
check('No page errors during the whole suite', pageErrors.length === 0, pageErrors.join('; '));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
