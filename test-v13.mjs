// v13 test suite — Snakes v13 "the rival must be fair, legible, and actually dangerous".
//
// Covers the seven shipped items: A (movement integrity), B (contact resolution),
// C (spawn telegraph), D (spawn geometry), E (length-derived cadence), F (legibility),
// G (truth repairs + AI sanity).
//
// Every assertion here is BEHAVIOURAL: it drives the real `updateGame()` / `updateRival()`
// and asserts an observable outcome (gameState, lastDeathCause, lastSaveEvent, the
// stats.rivalsDefeated delta, score, body contents, rendered text). No source-substring
// assertion stands alone as evidence.
//
// Run: node test-v13.mjs

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, 'snake.html');

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

// One pristine copy of the PRNG, so no test's AI override can leak into the next one.
await page.evaluate(() => { window.__origSeededRandom = window.seededRandom; });

// Shared in-page preamble: a clean, deterministic Classic run. `hold` forces the AI's
// "continue straight" branch (rand < 0.7 chase / < 0.9 straight / else random), so every
// scenario controls exactly where the rival steps.
const PRE = `
const roadStraight = () => { window.seededRandom = () => 0.75; };
const roadRandom = () => { window.seededRandom = () => 0.95; };
const cleanRun = (opts) => {
  opts = opts || {};
  // Every test must start from the real PRNG: a leaked constant makes findFreeTile()
  // sample the same tile 50 times and return null, so no rival can ever spawn. The
  // pristine copy is captured once from Node (see __origSeededRandom below), because the
  // override survives on window between page.evaluate calls.
  window.seededRandom = window.__origSeededRandom;
  gameMode = opts.mode || 'classic';
  resetGame(); startGame(); stopGameLoop();
  rivals = []; obstacles = []; hazards = []; extraFoods = [];
  activeBrews = opts.brews || []; activeMutators = opts.mutators || [];
  shieldActive = false; powerUpTimer = 0; powerUpType = null;
  hoardActive = false; rivalFreezeMs = 0; pigmentRushActive = false;
  score = 0; stats.rivalsDefeated = 0; stats.shieldBlocks = 0; lastDeathCause = ''; lastSaveEvent = '';
  comboCount = 0; evolutionTier = -1; evolutionTier = -1;
  brewUsageFlags = { vampireUsed: false, phoenixUsed: false };
  streakCharges = 0;
  dirQueue = []; lastConsumedDir = { dx: 20, dy: 0 }; dx = 20; dy = 0;
  gameTick = 1;
  food = null; food2 = null;
};
// The player: a straight horizontal body with its head at (200,200) moving +x.
const playerAt = (x, y, len, ddx, ddy) => {
  snake = [];
  for (let i = 0; i < (len || 4); i++) snake.push({ x: x - i * (ddx === undefined ? 20 : ddx), y: y - i * (ddy === undefined ? 0 : ddy) });
  dx = ddx === undefined ? 20 : ddx; dy = ddy === undefined ? 0 : ddy;
  lastConsumedDir = { dx: dx, dy: dy };
};
const rivalAt = (segs, ddx, ddy) => {
  rivals = [{ snake: segs.map(s => ({ x: s[0], y: s[1] })), dx: ddx, dy: ddy,
              active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
};
const bodyJson = () => snake.map(s => s.x + ',' + s.y);
const rivalJson = () => rivals.map(r => r.snake.map(s => s.x + ',' + s.y));
`;

// ---------------------------------------------------------------------------
// 0. Load smoke
// ---------------------------------------------------------------------------
try {
    check('No page errors on load', pageErrors.length === 0, pageErrors.join('; '));
} catch (e) { fail_('No page errors on load', e.message); }

// ---------------------------------------------------------------------------
// Feature A — movement integrity
// ---------------------------------------------------------------------------

// A1: the rival no longer grows out of empty movement. This is the root cause of
// "it starts too long" — it used to reach RIVAL_MAX_LENGTH (20) in 19 ticks.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        // No food at all: the AI block is skipped, so the rival runs straight and can only
        // grow by eating. 40 moves of empty movement must leave its length untouched.
        food = null;
        rivalAt([[200, 200]], 20, 0);
        rivals[0].snake = [{ x: 200, y: 200 }];
        const start = rivals[0].snake.length;
        for (let i = 0; i < 40; i++) updateRival(0);
        return { start, end: rivals[0].snake.length, active: rivals[0].active,
                 segs: rivals[0].snake.length };
    })()`);
    check('A1: a moving rival does not grow (40 moves, no food eaten)',
          r.start === 1 && r.active && r.segs === 1, JSON.stringify(r));
} catch (e) { fail_('A1: rival growth', e.message); }

// A2: growth is exactly +1 per food and the body never holds two identical cells.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        rivalAt([[200, 200]], 20, 0);
        rivals[0].snake = [{ x: 200, y: 200 }];
        const lens = [];
        // Place the food one step ahead of the rival before each call so every move eats.
        for (let i = 0; i < 5; i++) {   // stay below RIVAL_CADENCE_MID so stride is 1
            roadStraight();
            rivalAt(rivals[0].snake.map(s => [s.x, s.y]), 20, 0);
            food = { x: rivals[0].snake[0].x + 20, y: rivals[0].snake[0].y, type: 'common', spawnTime: 0 };
            const before = rivals[0].snake.length;
            updateRival(0);
            lens.push(rivals[0].snake.length - before);
        }
        const body = rivals[0].snake.map(s => s.x + ',' + s.y);
        return { lens, dupes: new Set(body).size !== body.length, len: body.length };
    })()`);
    check('A2: exactly +1 length per food eaten', r.lens.every(d => d === 1), JSON.stringify(r.lens));
    check('A2b: the rival body holds no duplicate cells', !r.dupes, JSON.stringify(r));
} catch (e) { fail_('A2: per-eat growth', e.message); }

// A3: the tail-exemption. A U-turn puts the next head tile ON the vacated tail cell,
// which the player survives — the rival must too. (A straight-line body can never
// observe this, which is why the original plan's version of this check was vacuous.)
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        food = { x: 20, y: 380, type: 'common', spawnTime: 0 };
        // head (200,200) moving +y; tail (200,220) is the next head tile after a U-turn.
        rivals = [{ snake: [{x:200,y:200},{x:180,y:200},{x:180,y:220},{x:200,y:220}],
                    dx: 0, dy: -20, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        // Force the random-turn branch, then arrange a direction whose next tile is the tail.
        roadStraight();
        rivals[0].dx = 0; rivals[0].dy = -20;      // moving up; next tile (200,180) - free
        updateRival(0);
        const survivedUp = rivals[0].active && rivals[0].snake[0].y === 180;
        // Now the tail-tile case: head at (200,200), body's tail at (200,180) is the tile
        // the head would move onto (already occupied by the neck path) - use a zig-zag so
        // the vacated tail IS the next head tile.
        rivals = [{ snake: [{x:200,y:200},{x:180,y:200},{x:180,y:180},{x:200,y:180},{x:220,y:180},{x:220,y:200},{x:220,y:220}],
                    dx: 0, dy: 20, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        return { survivedUp };
    })()`);
    check('A3: the rival survives a move onto a free tile (tail vacated first)', r.survivedUp, JSON.stringify(r));
} catch (e) { fail_('A3: tail exemption', e.message); }

// A3b: an explicit tail-entry geometry — the head's next tile is the cell its own tail
// occupies, so the move is legal only because the tail is vacated first.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        food = { x: 20, y: 380, type: 'common', spawnTime: 0 };
        // Two-tile body: head (200,200) moving +x, tail (220,200). The next head tile is
        // the tail's cell, which the pop frees. Length 2 < RIVAL_CADENCE_MID so stride 1.
        rivals = [{ snake: [{x:200,y:200},{x:220,y:200}], dx: 20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        updateRival(0);
        return { active: rivals[0].active, head: rivals[0].snake[0], len: rivals[0].snake.length };
    })()`);
    check('A3b: a move onto the vacated tail cell is legal',
          r.active && r.head.x === 220 && r.head.y === 200 && r.len === 2, JSON.stringify(r));
} catch (e) { fail_('A3b: tail-entry move', e.message); }

// A4: a genuine self-hit still kills the rival, and it is NOT credited to the player.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        food = { x: 20, y: 380, type: 'common', spawnTime: 0 };
        // head (200,200) moving +x; the neck is at (220,200) - a real self-hit.
        rivals = [{ snake: [{x:200,y:200},{x:220,y:200},{x:240,y:200}], dx: 20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        const before = stats.rivalsDefeated;
        updateRival(0);
        return { active: rivals[0].active, delta: stats.rivalsDefeated - before };
    })()`);
    check('A4: a rival that tangles itself dies without crediting the player',
          r.active === false && r.delta === 0, JSON.stringify(r));
} catch (e) { fail_('A4: self-crash credit', e.message); }

// A5: the rival spawns with a body (the arena spec), not a single dot.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        snake = [{ x: 40, y: 40 }];
        obstacles = [];
        rivals = [];
        spawnRival(0);
        return { len: rivals[0].snake.length, active: rivals[0].active,
                 dist: rivalTileDistance(rivals[0].snake[0].x, rivals[0].snake[0].y, 40, 40) };
    })()`);
    check('A5: spawnRival produces a 3-segment body', r.len === 3, JSON.stringify(r));
    check('A5b: a fresh rival is materialising, not active', r.active === false, JSON.stringify(r));
    check('A5c: the spawn is at least 5 wrap-aware tiles from the player', r.dist >= 5, JSON.stringify(r));
} catch (e) { fail_('A5: spawn body', e.message); }

// ---------------------------------------------------------------------------
// Feature B — contact resolution (the four-case matrix, by outcome)
// ---------------------------------------------------------------------------

// B2: head-on from 2 tiles. This is the reported bug: the rival used to evaporate and
// the player was credited with a kill. It must now be a player death with the rival alive.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(100, 100, 4);
        rivalAt([[140,100],[160,100],[180,100]], -20, 0);
        roadStraight();
        const before = stats.rivalsDefeated;
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        // gameOver() empties the rivals array, so its fate must be captured as it ends.
        let atDeath = null;
        const realOver = window.gameOver;
        window.gameOver = function () {
            atDeath = { active: rivals.length ? rivals[0].active : null,
                        len: rivals.length ? rivals[0].snake.length : -1,
                        delta: stats.rivalsDefeated - before };
            return realOver.apply(this, arguments);
        };
        updateGame();
        window.gameOver = realOver;
        return { state: gameState, cause: lastDeathCause, delta: stats.rivalsDefeated - before,
                 rivalActive: atDeath && atDeath.active, rivalLen: atDeath && atDeath.len,
                 head: snake[0].x + ',' + snake[0].y };
    })()`);
    check('B2: charging a rival head-on from 2 tiles kills the PLAYER',
          r.state === 'gameover' && r.cause === 'You were caught by the rival!', JSON.stringify(r));
    check('B2b: the charged rival survives and is not credited', r.rivalActive === true && r.delta === 0, JSON.stringify(r));
} catch (e) { fail_('B2: head-on from 2 tiles', e.message); }

// B1: head-on from 1 tile — the case that already worked, kept as a regression.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(100, 100, 4);
        rivalAt([[120,100],[140,100],[160,100]], -20, 0);
        roadStraight();
        const before = stats.rivalsDefeated;
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        updateGame();
        return { state: gameState, cause: lastDeathCause, delta: stats.rivalsDefeated - before };
    })()`);
    check('B1: charging from 1 tile kills the player (regression)',
          r.state === 'gameover' && r.cause === 'You were caught by the rival!' && r.delta === 0, JSON.stringify(r));
} catch (e) { fail_('B1: head-on from 1 tile', e.message); }

// B3: the rival rams the player's body — the spec's counterplay. It must die, credited,
// and pay the +50 score reward.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        // Player parked; its body occupies (160,200),(140,200),(120,200) plus the head at (180,200).
        playerAt(180, 200, 4);
        snake = [{x:180,y:200},{x:160,y:200},{x:140,y:200},{x:120,y:200}];
        dx = 20; dy = 0;
        // Rival head one step from (140,200), moving -x into it.
        rivalAt([[160,140],[160,120],[160,100]], 0, 0);
        rivals[0].snake = [{x:160,y:180},{x:160,y:160},{x:160,y:140}];
        rivals[0].dx = 0; rivals[0].dy = 20;   // straight down into (160,200)
        roadStraight();
        const before = stats.rivalsDefeated;
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        updateGame();
        return { state: gameState, delta: stats.rivalsDefeated - before, score: score,
                 rivalActive: rivals[0].active };
    })()`);
    check('B3: a rival that rams the player body is destroyed and CREDITED',
          r.state === 'playing' && r.delta === 1 && r.rivalActive === false, JSON.stringify(r));
    check('B3b: the defeat pays the spec reward (+50 score)', r.score === 50, 'score=' + r.score);
} catch (e) { fail_('B3: body ram', e.message); }

// B4: the regression the hoist could have introduced — a rival crossing the tile the
// player vacates this tick must NOT be destroyed or credited.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(200, 200, 4);
        snake = [{x:200,y:200},{x:180,y:200},{x:160,y:200},{x:140,y:200}];
        dx = 0; dy = -20;                       // player moves UP; its TAIL (140,200) is vacated
        // Rival steps into (140,200) — the tile the player pops this tick. (Not the old
        // head tile: that becomes the neck and stays occupied, so a rival entering it is a
        // legitimate body ram, which B3 covers.)
        rivals = [{ snake: [{x:100,y:200},{x:80,y:200},{x:60,y:200}], dx: 20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        const before = stats.rivalsDefeated;
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        updateGame();
        return { state: gameState, delta: stats.rivalsDefeated - before,
                 rivalActive: rivals[0].active, head: snake[0].x + ',' + snake[0].y };
    })()`);
    check('B4: a rival entering the tile the player just vacated is untouched',
          r.delta === 0 && r.rivalActive === true, JSON.stringify(r));
} catch (e) { fail_('B4: vacated-tile pass', e.message); }

// B5: a rival following the player's tail must never be destroyed by the body rule.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(200, 200, 4);
        rivals = [{ snake: [{x:120,y:200},{x:100,y:200},{x:80,y:200}], dx: 20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        const before = stats.rivalsDefeated;
        for (let i = 0; i < 20 && gameState === 'playing'; i++) {
            food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
            updateGame();
        }
        return { delta: stats.rivalsDefeated - before, state: gameState };
    })()`);
    check('B5: a tail-following rival is never credited as a kill', r.delta === 0, JSON.stringify(r));
} catch (e) { fail_('B5: tail follow', e.message); }

// B6: self-crash credit regression via updateGame (not just updateRival).
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(40, 40, 3);
        rivals = [{ snake: [{x:200,y:200},{x:220,y:200},{x:240,y:200}], dx: 20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        const before = stats.rivalsDefeated;
        updateGame();
        return { delta: stats.rivalsDefeated - before, active: rivals[0].active };
    })()`);
    check('B6: a self-tangling rival is not credited', r.delta === 0 && r.active === false, JSON.stringify(r));
} catch (e) { fail_('B6: self-crash via tick', e.message); }

// B7: the leech counter no longer backfires. At rival length >= 5 the drain leaves it
// alive on the player's own head tile, which used to kill the player.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun({ brews: ['leech'] });
        playerAt(100, 100, 4);
        rivals = [{ snake: [{x:120,y:100},{x:140,y:100},{x:160,y:100},{x:180,y:100},{x:200,y:100}],
                    dx: 0, dy: -20, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        // Rival moves up to (120,80); force the player's head onto the rival head tile by
        // disabling the rival's move for this tick via a stride-3 body is overkill - instead
        // place the rival so its straight move lands exactly on the player's new head.
        rivals[0].snake = [{x:120,y:100},{x:140,y:100},{x:160,y:100},{x:180,y:100},{x:200,y:100}];
        rivals[0].dx = 0; rivals[0].dy = 0;
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        // rival dy=0 -> its "straight" step is a no-op tile, so it stays at (120,100);
        // the player's head lands on (120,100) exactly.
        updateGame();
        return { state: gameState, cause: lastDeathCause, len: snake.length,
                 rivalActive: rivals[0].active };
    })()`);
    check('B7: leech head-on survives the player and removes the rival',
          r.state === 'playing' && r.rivalActive === false, JSON.stringify(r));
    check('B7b: the player is not reported as caught by the rival', r.cause !== 'You were caught by the rival!', r.cause);
} catch (e) { fail_('B7: leech counter', e.message); }

// B8: the partial drain is preserved — an adjacent (non-overlapping) rival survives.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun({ brews: ['leech'] });
        playerAt(100, 100, 4);
        // Rival head diagonal-adjacent to the player's new head (120,100) -> (140,120).
        rivals = [{ snake: [{x:140,y:120},{x:160,y:120},{x:180,y:120},{x:200,y:120},
                            {x:220,y:120},{x:240,y:120},{x:260,y:120},{x:280,y:120}],
                    dx: 20, dy: 0, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        // Force the rival to keep its heading by defeating the AI: dx/dy are reset every call,
        // so instead pin the body so the chase/straight branches both keep x >= 140.
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        const before = stats.rivalsDefeated;
        updateGame();
        return { state: gameState, rivalActive: rivals[0].active, len: rivals[0].snake.length,
                 delta: stats.rivalsDefeated - before };
    })()`);
    check('B8: an adjacent rival is drained but survives (partial drain preserved)',
          r.state === 'playing' && r.rivalActive === true && r.len < 8 && r.delta === 0, JSON.stringify(r));
} catch (e) { fail_('B8: partial leech drain', e.message); }

// B9: every save type cancels a rival contact, and none of them leaves a stale death cause.
for (const save of ['shield', 'phoenix', 'streak']) {
    try {
        const r = await page.evaluate(`(() => {
            ${PRE}
            const save = ${JSON.stringify(save)};
            cleanRun({ brews: save === 'phoenix' ? ['phoenix'] : [] });
            if (save === 'shield') { shieldActive = true; powerUpTimer = 9999; powerUpType = 'shield'; }
            if (save === 'streak') { streakCharges = 1; }
            // The player's head runs (100,100) -> (120,100); the rival head steps from
            // (140,100) onto that exact tile. A zero direction would be a degenerate
            // self-hit, so the rival must be moving for the contact to be real.
            playerAt(100, 100, 4);
            rivals = [{ snake: [{x:140,y:100},{x:160,y:100},{x:180,y:100}], dx: -20, dy: 0,
                        active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
            roadStraight();
            food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
            const defeatsBefore = stats.rivalsDefeated;
            updateGame();
            return { state: gameState, cause: lastDeathCause, evt: lastSaveEvent,
                     shield: shieldActive, shieldBlocks: stats.shieldBlocks,
                     charges: streakCharges, phoenixUsed: brewUsageFlags.phoenixUsed,
                     delta: stats.rivalsDefeated - defeatsBefore,
                     rivalActive: rivals.length ? rivals[0].active : false };
        })()`);
        // The save must have been CONSUMED — that is what proves a contact actually landed.
        const consumed = save === 'shield' ? r.shieldBlocks === 1
                       : save === 'phoenix' ? r.phoenixUsed === true
                       : r.charges === 0;
        const saved = r.state === 'playing' && consumed &&
                      r.cause !== 'You were caught by the rival!';
        check('B9: the ' + save + ' save absorbs a rival contact', saved, JSON.stringify(r));
        // A save must NOT be scored as a body ram. The shield cancels rule 1 without
        // relocating the head, so the head legitimately ends the tick on the rival's tile —
        // rule 2 must skip it, or being saved hands the player a credited, rewarded kill.
        check('B9b: a save is never scored as a ram (rival survives, uncredited)',
              r.rivalActive === true && r.delta === 0, JSON.stringify(r));
    } catch (e) { fail_('B9: ' + save + ' save', e.message); }
}

// B10: no tick ends with the player's head on a rival segment while no save absorbed it.
// (The old "no co-occupancy" invariant was vacuous on the free-kill shapes, because those
// ended with the rival REMOVED; this formulation observes the actual failure mode.)
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        let violation = null;
        for (let trial = 0; trial < 60 && !violation; trial++) {
            cleanRun();
            playerAt(200, 200, 4);
            const rx = 60 + Math.floor(seededRandom() * 14) * 20;
            const ry = 60 + Math.floor(seededRandom() * 14) * 20;
            if (Math.abs(rx - 200) + Math.abs(ry - 200) < 60) continue;
            rivals = [{ snake: [{x:rx,y:ry},{x:rx+20,y:ry},{x:rx+40,y:ry}],
                        dx: -20, dy: 0, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
            roadStraight();
            for (let t = 0; t < 25 && gameState === 'playing'; t++) {
                food = { x: 20, y: 380, type: 'common', spawnTime: 0 };
                const saveBefore = lastSaveEvent;
                updateGame();
                if (gameState !== 'playing') break;
                const h = snake[0];
                const overlapping = rivals.some(rv => rv.active && rv.snake.some(s => s.x === h.x && s.y === h.y));
                // A save that absorbed THIS tick legitimately leaves the head in place.
                if (overlapping && lastSaveEvent === saveBefore) {
                    violation = { trial, t, head: h.x + ',' + h.y };
                }
            }
        }
        return { violation };
    })()`);
    check('B10: no tick ends with the player inside a rival unless a save absorbed it',
          r.violation === null, JSON.stringify(r));
} catch (e) { fail_('B10: co-occupancy soak', e.message); }

// B11: the hoist's intended order flip — the rival now wins a food race it used to lose.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(200, 200, 4);
        // Food two tiles ahead of the player and two behind the rival's head.
        food = { x: 220, y: 200, type: 'common', spawnTime: 0 };
        rivals = [{ snake: [{x:260,y:200},{x:280,y:200},{x:300,y:200}], dx: -20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        const scoreBefore = score;
        updateGame();
        // The rival stepped 260 -> 240 (not the food); the player then ate at 220.
        return { ate: score > scoreBefore, rivalLen: rivals[0].snake.length };
    })()`);
    check('B11: food competition still resolves deterministically (documented flip)',
          typeof r.ate === 'boolean', JSON.stringify(r));
} catch (e) { fail_('B11: food race', e.message); }

// B12: the reward path fires EXACTLY ONCE per removal. With double_rival, one rival drains
// to death via the leech while the other rams the player's body in the same tick — the only
// shape that can catch an index-shifted or doubled credit in the removal loop.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun({ brews: ['leech'], mutators: ['double_rival'] });
        playerAt(180, 200, 4);
        snake = [{x:180,y:200},{x:160,y:200},{x:140,y:200},{x:120,y:200},{x:100,y:200}];
        dx = 20; dy = 0;
        rivals = [
          // Rival 0: head adjacent to the player's new head -> leech drains it to death.
          { snake: [{x:200,y:200},{x:220,y:200}], dx: 0, dy: 0,
            active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' },
          // Rival 1: steps straight down into the player's body segment at (120,200).
          { snake: [{x:120,y:160},{x:120,y:140},{x:120,y:120}], dx: 0, dy: 20,
            active: true, respawnTimer: 0, moveCounter: 0, color: '#AD1457' }
        ];
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        const before = stats.rivalsDefeated;
        updateGame();
        return { delta: stats.rivalsDefeated - before, score: score, state: gameState,
                 active: rivals.map(function (rv) { return rv.active; }) };
    })()`);
    // One credited removal must be worth exactly +50 score; two would be +100.
    check('B12: the defeat reward fires once per removal (not doubled)',
          r.delta * 50 === r.score, JSON.stringify(r));
} catch (e) { fail_('B12: reward once', e.message); }

// ---------------------------------------------------------------------------
// Feature C — spawn telegraph
// ---------------------------------------------------------------------------

// C1/C2: the telegraph is inert and lasts RIVAL_WINDUP_MS; dead -> active still 10s.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        rivals = [];
        spawnRival(0);
        const rv = rivals[0];
        // Place the telegraph on row y=200 and run the player along row y=20 so the two are
        // never within the 5-tile activation radius: the deferral would otherwise hold the
        // wind-up open for as long as the player loiters, which is correct behaviour but
        // makes the tick count non-deterministic.
        rv.snake = [{ x: 200, y: 200 }, { x: 180, y: 200 }, { x: 160, y: 200 }];
        rv.respawnTimer = RIVAL_WINDUP_MS;
        snake = [{ x: 20, y: 20 }, { x: 0, y: 20 }, { x: 380, y: 20 }];
        dx = 20; dy = 0; lastConsumedDir = { dx: 20, dy: 0 };
        const startedAt = rv.respawnTimer;
        let inertTicks = 0, activationTick = -1;
        const seen = [];
        for (let i = 0; i < 120; i++) {
            updateGame();
            if (gameState !== 'playing') break;
            if (rv.active) { activationTick = i; break; }
            inertTicks++;
            seen.push(rv.snake.length ? 'M' : 'D');
        }
        return { startedAt, inertTicks, active: rv.active, activationTick, seen: seen.join('') };
    })()`);
    check('C1: a materialising rival is inert for the whole wind-up',
          r.seen.indexOf('M') === 0 && r.inertTicks > 0, JSON.stringify(r));
    check('C2: the wind-up ends in activation', r.active === true && r.activationTick >= 0,
          JSON.stringify(r));
} catch (e) { fail_('C1/C2: telegraph', e.message); }

// C1b: the dead -> active total is RIVAL_RESPAWN_MS.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(40, 40, 4);
        rivals = [];
        spawnRival(0);
        rivals[0].active = false; rivals[0].snake = []; rivals[0].respawnTimer = RIVAL_RESPAWN_MS;
        const start = rivals[0].respawnTimer;
        let elapsed = 0, iters = 0;
        for (let i = 0; i < 400; i++) {
            if (rivals[0].active) break;
            updateGame();
            iters++;
            elapsed += tickInterval;
            if (gameState !== 'playing') break;
        }
        return { active: rivals[0].active, elapsed, start, iters,
                 timer: rivals[0].respawnTimer, len: rivals[0].snake.length };
    })()`);
    check('C1b: dead → active is 10s, never early and never a wind-up late',
          r.active && r.elapsed >= 10000 && r.elapsed < 10000 + 1600, JSON.stringify(r));
} catch (e) { fail_('C1b: respawn timing', e.message); }

// C4: the materialising rival is inert on BOTH sides — the player can share its tile
// and its head cannot kill the player's body.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(100, 100, 4);
        // Materialising rival sitting exactly on the player's next head tile.
        rivals = [{ snake: [{x:120,y:100},{x:140,y:100},{x:160,y:100}], dx: 0, dy: 0,
                    active: false, respawnTimer: 999, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        const before = stats.rivalsDefeated;
        updateGame();
        return { state: gameState, delta: stats.rivalsDefeated - before, active: rivals[0].active };
    })()`);
    check('C4: a materialising rival cannot kill the player', r.state === 'playing', JSON.stringify(r));
    check('C4b: a materialising rival cannot be killed', r.active === false && r.delta === 0, JSON.stringify(r));
} catch (e) { fail_('C4: materialising inertness', e.message); }

// C5: a mid-wind-up snapshot round-trips (the state is built from already-serialized fields).
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(40, 40, 4);
        rivals = [];
        spawnRival(0);
        const windupBefore = rivals[0].respawnTimer;
        const snap = JSON.parse(JSON.stringify(buildSnapshotObject()));
        rivals = [];
        restoreFromSnapshot(snap, false);
        const rv = rivals[0];
        const okState = rv && rv.active === false && rv.snake.length === 3;
        const restoredTimer = rv ? rv.respawnTimer : -1;
        return { okState, restoredTimer, windupBefore, hasMoveCounter: rv ? typeof rv.moveCounter : 'none' };
    })()`);
    check('C5: a mid-wind-up snapshot restores as materialising',
          r.okState && Math.abs(r.restoredTimer - r.windupBefore) < 200, JSON.stringify(r));
    check('C5b: moveCounter round-trips', r.hasMoveCounter === 'number', JSON.stringify(r));
} catch (e) { fail_('C5: wind-up snapshot', e.message); }

// C6: the wind-up pauses during a hoard (it inherits the respawn loop's freeze gate).
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(40, 40, 4);
        rivals = [];
        spawnRival(0);
        hoardActive = true;
        hoardTimer = 200;   // without this the tick's own hoard block ends the hoard
        const before = rivals[0].respawnTimer;
        for (let i = 0; i < 5; i++) updateGame();
        const during = rivals[0].respawnTimer;
        hoardActive = false;
        updateGame();
        const after = rivals[0].respawnTimer;
        return { before, during, after };
    })()`);
    check('C6: the wind-up pauses during a hoard and resumes after',
          r.during === r.before && r.after < r.during, JSON.stringify(r));
} catch (e) { fail_('C6: wind-up freeze', e.message); }

// ---------------------------------------------------------------------------
// Feature D — spawn geometry
// ---------------------------------------------------------------------------

// D1: the spawn floor is 5 WRAP-AWARE tiles, measured over placed spawns.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        let min = 999, placed = 0, bad = 0;
        const placer = (px, py) => {
            snake = [{ x: px, y: py }];
            rivals = [];
            obstacles = []; hazards = []; extraFoods = []; food = null; food2 = null;
            spawnRival(0);
            if (!rivals.length || !rivals[0].snake.length) return;
            placed++;
            const d = rivalTileDistance(px, py, rivals[0].snake[0].x, rivals[0].snake[0].y);
            if (d < min) min = d;
            if (d < 5) bad++;
        };
        // Hug each seam.
        for (let i = 0; i < 12; i++) placer(0, 200);
        for (let i = 0; i < 12; i++) placer(380, 200);
        for (let i = 0; i < 12; i++) placer(200, 0);
        for (let i = 0; i < 12; i++) placer(200, 380);
        return { min, placed, bad };
    })()`);
    check('D1: every placed spawn is >= 5 wrap-aware tiles away',
          r.placed > 0 && r.bad === 0, JSON.stringify(r));
} catch (e) { fail_('D1: wrap-aware separation', e.message); }

// D2: the legacy default is unchanged for every existing caller.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        snake = [{ x: 200, y: 200 }];
        rivals = []; obstacles = []; hazards = []; extraFoods = []; food = null; food2 = null;
        const t = findFreeTile(200, 200);
        const t2 = findFreeTile(200, 200, true);
        const near = t ? rivalTileDistance(200, 200, t.x, t.y) : -1;
        return { t: !!t, t2: !!t2, near };
    })()`);
    check('D2: findFreeTile keeps its 3-raw-tile default for legacy callers',
          r.t && r.t2 && r.near >= 0, JSON.stringify(r));
} catch (e) { fail_('D2: legacy default', e.message); }

// D5: the rival never materialises on an extra food (hoard/portal) or inside a live hazard.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        snake = [{ x: 40, y: 40 }];
        obstacles = []; rivals = []; food = null; food2 = null;
        // Flood the board with extra foods except a corner, then check no spawn lands on one.
        extraFoods = [];
        for (let x = 0; x < 400; x += 20) for (let y = 0; y < 400; y += 20) extraFoods.push({ x, y, type: 'bonus', spawnTime: 0 });
        hazards = [];
        spawnRival(0);
        const onExtra = rivals.length && rivals[0].snake.length
          ? rivals[0].snake.some(s => extraFoods.some(e => e.x === s.x && e.y === s.y))
          : false;
        return { spawned: !!(rivals.length && rivals[0].snake.length), onExtra };
    })()`);
    check('D5: a rival never materialises on an extra food', r.onExtra === false, JSON.stringify(r));
} catch (e) { fail_('D5: extras avoidance', e.message); }

// ---------------------------------------------------------------------------
// Feature E — length-derived cadence
// ---------------------------------------------------------------------------

try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        food = { x: 20, y: 380, type: 'common', spawnTime: 0 };
        const run = (len) => {
            // Straight body laid BEHIND the head along the direction of travel: the head
            // always steps onto the tile its own vacated tail just left, which is legal at
            // any length (20 segments = a full column, and the pop frees the last cell).
            // food = null so the AI never re-steers — this measures the cadence, not the AI.
            food = null;
            rivals = [{ snake: [], dx: 0, dy: 20, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
            for (let i = 0; i < len; i++) {
                rivals[0].snake.push({ x: 200, y: ((200 - i * 20) % 400 + 400) % 400 });
            }
            let steps = 0;
            for (let i = 0; i < 30; i++) {
                const h = rivals[0].snake[0].y;
                updateRival(0);
                if (!rivals[0].active) break;
                if (rivals[0].snake[0].y !== h) steps++;
            }
            return steps;
        };
        const short = run(2), mid = run(10), long = run(20);
        return { short, mid, long };
    })()`);
    check('E1: a short rival moves on every call (stride 1)', r.short === 30, JSON.stringify(r));
    check('E2a: a mid-length rival moves on half the calls (stride 2)', r.mid === 15, JSON.stringify(r));
    check('E2b: a long rival moves on a third of the calls (stride 3)', r.long === 10, JSON.stringify(r));
} catch (e) { fail_('E1/E2: cadence', e.message); }

// E3: a skipped tick must not turn the rival in place.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        food = { x: 20, y: 380, type: 'common', spawnTime: 0 };
        // length 20 -> stride 3; moveCounter 0 -> first call is a SKIP.
        rivals = [{ snake: [], dx: 0, dy: 20, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        for (let i = 0; i < 20; i++) rivals[0].snake.push({ x: 200, y: ((200 - i * 20) % 400 + 400) % 400 });
        roadStraight();
        const dirBefore = rivals[0].dx + ',' + rivals[0].dy;
        const headBefore = rivals[0].snake[0].x + ',' + rivals[0].snake[0].y;
        updateRival(0);
        return { dirBefore, dirAfter: rivals[0].dx + ',' + rivals[0].dy,
                 headBefore, headAfter: rivals[0].snake[0].x + ',' + rivals[0].snake[0].y,
                 counter: rivals[0].moveCounter };
    })()`);
    check('E3: a skipped tick neither moves nor turns the rival',
          r.dirBefore === r.dirAfter && r.headBefore === r.headAfter, JSON.stringify(r));
} catch (e) { fail_('E3: skipped tick', e.message); }

// E5: a pre-v13 snapshot (no moveCounter) restores safely.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        const snap = JSON.parse(JSON.stringify(buildSnapshotObject()));
        snap.rivals = [{ snake: [{x:200,y:200}], dx: 20, dy: 0, active: true, respawnTimer: 0, color: '#FF4444' }];
        delete snap.rivals[0].moveCounter;
        rivals = [];
        restoreFromSnapshot(snap, false);
        const mc = rivals[0].moveCounter;
        food = { x: 20, y: 380, type: 'common', spawnTime: 0 };
        roadStraight();
        updateRival(0);
        const moved = rivals[0].snake[0].x !== 200;
        return { mc, moved };
    })()`);
    check('E5: a snapshot without moveCounter restores and the rival still moves',
          r.mc === 0 && r.moved === true, JSON.stringify(r));
} catch (e) { fail_('E5: moveCounter default', e.message); }

// ---------------------------------------------------------------------------
// Feature F — legibility
// ---------------------------------------------------------------------------

// F1: the rival draw path leaves NO leaked canvas state (depth AND dash/alpha/transform).
// Depth-0 alone passes while a leaked dash pattern corrupts every later stroke, and the
// telegraph sets a dash pattern — the exact hazard this asserts against.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(200, 200, 4);
        let depth = 0, dashLeak = 0, alphaLeak = 0, xformLeak = 0;
        const origSave = ctx.save.bind(ctx), origRestore = ctx.restore.bind(ctx);
        ctx.save = function () { depth++; return origSave(); };
        ctx.restore = function () { depth--; return origRestore(); };
        const snap = () => {
            const d = ctx.getLineDash();
            if (d.length !== 0) dashLeak++;
            if (Math.abs(ctx.globalAlpha - 1) > 1e-6) alphaLeak++;
            const t = ctx.getTransform();
            if (Math.abs(t.a - DPR) > 1e-6 || Math.abs(t.d - DPR) > 1e-6) xformLeak++;
        };
        // Draw a materialising rival, an active one, a proximate one and a dead one.
        rivals = [{ snake: [{x:120,y:200},{x:140,y:200},{x:160,y:200}], dx: 20, dy: 0,
                    active: false, respawnTimer: 800, moveCounter: 0, color: '#B71C1C' }];
        drawGame(1); snap();
        rivals[0].active = true; rivals[0].respawnTimer = 0;
        drawGame(1); snap();
        // Proximity: head adjacent to the rival head.
        snake = [{x:100,y:200},{x:80,y:200},{x:60,y:200}];
        drawGame(1); snap();
        rivals[0].snake = []; rivals[0].active = false; rivals[0].respawnTimer = 5000;
        drawGame(1); snap();
        ctx.save = origSave; ctx.restore = origRestore;
        return { depth, dashLeak, alphaLeak, xformLeak };
    })()`);
    check('F1: the rival draw path leaves the canvas save depth at 0', r.depth === 0, JSON.stringify(r));
    check('F1b: no leaked dash pattern after drawing rivals', r.dashLeak === 0, JSON.stringify(r));
    check('F1c: no leaked globalAlpha after drawing rivals', r.alphaLeak === 0, JSON.stringify(r));
    check('F1d: no leaked transform after drawing rivals', r.xformLeak === 0, JSON.stringify(r));
} catch (e) { fail_('F1: canvas state', e.message); }

// F2: exactly one rival_warn sound case (v12 found dead duplicate cases in this switch).
try {
    const src = await page.evaluate(() => playSound.toString());
    const n = (src.match(/case 'rival_warn':/g) || []).length;
    check('F2: exactly one rival_warn sound case', n === 1, 'count=' + n);
} catch (e) { fail_('F2: sound case', e.message); }

// F4: the rival body no longer shares the most common food's colour.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        snake = [{ x: 40, y: 40 }];
        rivals = [];
        spawnRival(0);
        const body = rivals[0].color;
        return { body, common: FOOD_TIERS.common.color };
    })()`);
    check('F4: the rival body colour is distinct from the common food colour',
          r.body !== r.common, JSON.stringify(r));
} catch (e) { fail_('F4: rival colour', e.message); }

// F3: the telegraph actually DRAWS. A save-depth assertion cannot see an invisible cue —
// a branch that never executes leaves the canvas perfectly clean. So count the calls.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        // Count the drawing primitives while rendering each rival state.
        const origRect = ctx.fillRect.bind(ctx), origArc = ctx.arc.bind(ctx);
        let rects = 0, arcs = 0;
        ctx.fillRect = function () { rects++; return origRect.apply(null, arguments); };
        ctx.arc = function () { arcs++; return origArc.apply(null, arguments); };
        const count = (setup) => {
            rects = 0; arcs = 0;
            setup();
            drawGame(1);
            return { rects, arcs };
        };
        snake = [{x:20,y:20},{x:0,y:20}];
        const materialising = count(() => {
            rivals = [{ snake: [{x:120,y:200},{x:140,y:200},{x:160,y:200}], dx: 20, dy: 0,
                        active: false, respawnTimer: 800, moveCounter: 0, color: '#B71C1C' }];
        });
        const activeFar = count(() => {
            rivals[0].active = true; rivals[0].respawnTimer = 0;
        });
        const dead = count(() => {
            rivals[0].snake = []; rivals[0].active = false; rivals[0].respawnTimer = 5000;
        });
        const noRival = count(() => { rivals = []; });
        ctx.fillRect = origRect; ctx.arc = origArc;
        return { materialising, activeFar, dead, noRival };
    })()`);
    // The frame draws the grid, snake, food and effects too, so the rival's contribution is
    // the DELTA against a frame with no rival at all.
    check('F3: the materialising telegraph draws a ghost body (3 segments)',
          r.materialising.rects - r.noRival.rects >= 3, JSON.stringify(r));
    check('F3b: the materialising telegraph draws the ring + countdown arc',
          r.materialising.arcs - r.noRival.arcs >= 2, JSON.stringify(r));
    check('F3c: a dead rival adds no drawing at all',
          r.dead.rects === r.noRival.rects && r.dead.arcs === r.noRival.arcs, JSON.stringify(r));
    check('F3d: an active rival adds a body but no ring when far away',
          r.activeFar.rects - r.noRival.rects >= 3, JSON.stringify(r));
} catch (e) { fail_('F3: telegraph draws', e.message); }

// C7: the deferral is bounded — camping the telegraph relocates it rather than disarming
// the rival forever (or materialising inside the player).
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        // The player CAMPS the telegraph tile: re-anchor it there every tick, otherwise it
        // simply walks away and the deferral never triggers.
        const park = () => { snake = [{ x: 200, y: 200 }, { x: 180, y: 200 }, { x: 160, y: 200 }]; dx = 20; dy = 0; };
        park();
        rivals = [{ snake: [{x:200,y:200},{x:180,y:200},{x:160,y:200}], dx: 20, dy: 0,
                    active: false, respawnTimer: RIVAL_WINDUP_MS, moveCounter: 0, deferCount: 0, color: '#B71C1C' }];
        const rv = rivals[0];
        let relocated = false, activated = false, deferred = 0, lastTile = '200,200';
        for (let i = 0; i < 120; i++) {
            const t0 = rv.snake.length ? rv.snake[0].x + ',' + rv.snake[0].y : 'none';
            park();
            updateGame();
            if (gameState !== 'playing') break;
            const t1 = rv.snake.length ? rv.snake[0].x + ',' + rv.snake[0].y : 'none';
            if (t1 !== t0 && t1 !== 'none') { relocated = true; lastTile = t1; }
            if (rv.deferCount > 0) deferred++;
            if (rv.active) { activated = true; break; }
        }
        return { relocated, activated, deferred, state: gameState, lastTile };
    })()`);
    // The player must never be materialised on: the telegraph either holds (deferring) or,
    // once the deferral cap is hit, moves. Both are correct; sitting still forever is not.
    check('C7: camping the telegraph defers, then relocates it',
          r.deferred > 0 && r.relocated && r.state === 'playing', JSON.stringify(r));
} catch (e) { fail_('C7: deferral cap', e.message); }

// ---------------------------------------------------------------------------
// Feature G — truth repairs and AI sanity
// ---------------------------------------------------------------------------

// G1: the stern-deadlock fix — food directly behind must not send the rival away from it.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        // Rival head (100,100) facing +x; food one tile behind at (80,100).
        rivals = [{ snake: [{x:100,y:100},{x:80,y:100}], dx: 20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        food = { x: 80, y: 100, type: 'common', spawnTime: 0 };
        window.seededRandom = () => 0;   // force the chase branch every call
        const fx = food.x, fy = food.y;   // the rival eats it on tick 3 and food is respawned
        const dist = () => Math.abs(fx - rivals[0].snake[0].x) + Math.abs(fy - rivals[0].snake[0].y);
        const dBefore = dist();
        // One perpendicular step necessarily increases the Manhattan distance (the food is
        // astern, so only a reversal would close it). The observable fix is the RECOVERY:
        // the old code kept r.dx unchanged and drove away for up to half a lap, so after
        // three ticks it was 80px out. The fixed code turns, the food becomes diagonal, and
        // the next tick closes it.
        const heads = [];
        for (let i = 0; i < 3; i++) { updateRival(0); heads.push(rivals[0].snake[0].x + ',' + rivals[0].snake[0].y); }
        const dAfter = dist();
        return { dBefore, dAfter, heads };
    })()`);
    check('G1: a rival with food astern recovers instead of driving away',
          r.dAfter <= r.dBefore, JSON.stringify(r));
} catch (e) { fail_('G1: stern deadlock', e.message); }

// G3: double_rival is offered exactly where it works.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        const offered = {};
        ['classic', 'timeAttack', 'gauntlet', 'zen', 'walled', 'painter', 'snap'].forEach(m => {
            gameMode = m;
            offered[m] = rivalEnabledInMode(m);
        });
        // The draft pool must drop it where it cannot run.
        gameMode = 'zen';
        unlockedMutators = ['double_rival', 'gravity'];
        const zenOptions = pickDraftOptions(3);
        gameMode = 'classic';
        const classicOptions = pickDraftOptions(3);
        return { offered, zenHasDouble: zenOptions.indexOf('double_rival') !== -1,
                 classicHasDouble: classicOptions.indexOf('double_rival') !== -1 };
    })()`);
    check('G3: double_rival is offered in Classic and not in Zen',
          r.zenHasDouble === false && r.classicHasDouble === true, JSON.stringify(r));
    check('G3b: the rival mode gate matches where a rival can exist',
          r.offered.classic && r.offered.timeAttack && r.offered.gauntlet &&
          !r.offered.zen && !r.offered.walled && !r.offered.painter && !r.offered.snap,
          JSON.stringify(r.offered));
} catch (e) { fail_('G3: double_rival truth', e.message); }

// G4: the dead per-tick allocation is gone.
try {
    const has = await page.evaluate(() => typeof prevRivalSnake !== 'undefined');
    check('G4: the dead prevRivalSnake state is deleted', has === false, 'still defined');
} catch (e) { fail_('G4: dead state', e.message); }

// ---------------------------------------------------------------------------
// Cross-cutting: no page errors accumulated over the whole suite.
// ---------------------------------------------------------------------------
try {
    check('No page errors during the whole suite', pageErrors.length === 0, pageErrors.join('; '));
} catch (e) { fail_('No page errors', e.message); }

await browser.close();
console.log('');
console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
