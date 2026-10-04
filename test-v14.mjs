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
await page.evaluate(() => {
  if (window.__origPlaySound) window.playSound = window.__origPlaySound;
  if (window.__origSrSpeak) window.srSpeak = window.__origSrSpeak;
  window.seededRandom = window.__origSeededRandom;
});
check('No page errors during the whole suite', pageErrors.length === 0, pageErrors.join('; '));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
