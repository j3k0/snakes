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
await page.evaluate(() => {
  if (window.__origPlaySound) window.playSound = window.__origPlaySound;
  if (window.__origSrSpeak) window.srSpeak = window.__origSrSpeak;
  window.seededRandom = window.__origSeededRandom;
});
check('No page errors during the whole suite', pageErrors.length === 0, pageErrors.join('; '));
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
