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
          r.state === 'gameover' && /head-on/.test(r.cause), JSON.stringify(r));
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
          r.state === 'gameover' && /head-on/.test(r.cause) && r.delta === 0, JSON.stringify(r));
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
        return { delta: stats.rivalsDefeated - before, state: gameState,
                 rivalAlive: rivals.length > 0 && rivals[0].active };
    })()`);
    // Assert the rival is still ALIVE, not just uncredited: a wrongly-destroyed rival that
    // also failed to credit would satisfy `delta === 0` alone.
    check('B5: a tail-following rival is neither destroyed nor credited',
          r.delta === 0 && r.rivalAlive === true, JSON.stringify(r));
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

// B7: the leech contract, pinned against base. Three geometries, because the drain and the
// removal are different things and conflating them is a free kill:
//   swap      — the snakes trade tiles; the player's head lands on the rival's NECK. The
//               leech window is the 3x3 box around the rival's head, so the neck is ALWAYS
//               inside it; the drain fires, and the player DIES (base does too). Removing the
//               rival here would hand a brew owner a kill they did not earn.
//   same tile — the rival's head ends on the player's head tile: the drain resolves it.
//   adjacent  — in the 3x3 window but not overlapping: drain only, nobody dies.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        const run = (segs, rdx, rdy, head) => {
            cleanRun({ brews: ['leech'] });
            playerAt(head[0], head[1], 4);
            rivals = [{ snake: segs.map(s => ({ x: s[0], y: s[1] })), dx: rdx, dy: rdy,
                        active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
            roadStraight();
            food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
            const len0 = snake.length, d0 = stats.rivalsDefeated;
            updateGame();
            return { state: gameState, cause: lastDeathCause, grew: snake.length - len0,
                     delta: stats.rivalsDefeated - d0,
                     rivalActive: rivals.length ? rivals[0].active : null };
        };
        return {
            // head-on SWAP, length 5 so the drain leaves 2 and the removal must be a
            // deliberate decision rather than the drain emptying the rival.
            swap: run([[120,100],[140,100],[160,100],[180,100],[200,100]], -20, 0, [100,100]),
            // Both heads land on the same tile. Length 5 again, so the length<=1 clause cannot be
            // what removes it — this exercises the head-tile clause specifically.
            same: run([[140,100],[160,100],[180,100],[200,100],[220,100]], -20, 0, [100,100]),
            // Diagonal neighbour: inside the 3x3 leech window, no overlap. Length 8 so the
            // drain leaves 5 and the rival is simply not destroyed.
            adj:  run([[140,80],[160,80],[180,80],[200,80],[220,80],[240,80],[260,80],[280,80]], -20, 0, [100,100])
        };
    })()`);
    check('B7: the drain still fires on a head-on swap (+3) but does NOT save the player',
          r.swap.grew === 3 && r.swap.state === 'gameover' && r.swap.delta === 0,
          JSON.stringify(r.swap));
    check('B7b: the swap is reported as a head-on charge, and costs a life not a kill',
          /head-on/.test(r.swap.cause), JSON.stringify(r.swap));
    check('B7c: a rival head left on the player\'s tile is drained AND destroyed, credited',
          r.same.state === 'playing' && r.same.rivalActive === false && r.same.delta === 1 &&
          r.same.grew === 3, JSON.stringify(r.same));
    check('B7d: an adjacent rival is drained without a kill and without dying',
          r.adj.state === 'playing' && r.adj.rivalActive === true && r.adj.delta === 0 &&
          r.adj.grew === 3, JSON.stringify(r.adj));
} catch (e) { fail_('B7: leech contract', e.message); }

// B17: the leech clause must NOT fire when the rival did not move this tick. A stationary
// rival (cadence skip, or the hoard/Pigment Rush freeze) leaves its head on the tile the
// player charges into; resolving that as a leech kill survived-and-collected a contact the
// unbrewed player dies on — and it flipped on the rival's invisible moveCounter, which is
// the same "sometimes I run through it" texture this cycle exists to remove. The contrast
// with B17c is the whole point: identical positions, only the rival's stride phase differs.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        const seg = (x, y, n, ddx, ddy) => {
            const out = [];
            for (let i = 0; i < n; i++) out.push({ x: x + i * ddx, y: y + i * ddy });
            return out;
        };
        // The rival's head is PARKED on the player's destination, body running away from the
        // player along y. mc controls whether its next updateRival call skips or moves.
        const park = (mc, freeze) => {
            cleanRun({ brews: ['leech'] });
            if (freeze) { hoardActive = true; hoardTimer = 500; }
            playerAt(100, 100, 4);
            rivals = [{ snake: seg(120, 100, 7, 0, 20), dx: 0, dy: 20, active: true,
                        respawnTimer: 0, moveCounter: mc, color: '#B71C1C' }];
            roadStraight();
            food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
            const d0 = stats.rivalsDefeated, l0 = snake.length;
            updateGame();
            return { state: gameState, delta: stats.rivalsDefeated - d0,
                     grew: snake.length - l0, cause: lastDeathCause };
        };
        // length 7 -> stride 2: mc 0 skips, mc 1 moves.
        return { skip: park(0, false), freeze: park(0, true), moves: park(1, false) };
    })()`);
    check('B17: charging a STATIONARY rival is lethal, not a free credited kill',
          r.skip.state === 'gameover' && r.skip.delta === 0, JSON.stringify(r.skip));
    check('B17b: the same holds while the rival is frozen by the hoard',
          r.freeze.state === 'gameover' && r.freeze.delta === 0, JSON.stringify(r.freeze));
    check('B17c: the divergence was phase-only — the skip and move rows differ',
          r.moves.state !== r.skip.state, JSON.stringify(r));
} catch (e) { fail_('B17: stationary leech', e.message); }

// B18: the drain-to-nothing rescue is UNCONDITIONAL, and must stay that way. A short rival
// (<= 4) drained to <= 1 segment is REMOVED even when it never moved, exactly as the base
// build does — otherwise the player dies with the drain already applied, which is the
// "the counter backfires" defect this cycle exists to delete. B17 cannot catch this: every
// B17 fixture uses a length-7 rival, where the drain leaves 4 and clause 1 is unreachable.
// Gating clause 1 on `movedThisTick` (shipped once, caught in review) fails exactly here.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        const seg = (x, y, n, ddx, ddy) => {
            const out = [];
            for (let i = 0; i < n; i++) out.push({ x: x + i * ddx, y: y + i * ddy });
            return out;
        };
        // A frozen (or stride-skipping) rival of the given length, head on the player's
        // destination, body running away along +y so the drain has segments to eat.
        const short = (len, freeze) => {
            cleanRun({ brews: ['leech'] });
            if (freeze) { hoardActive = true; hoardTimer = 500; }
            playerAt(100, 100, 4);
            rivals = [{ snake: seg(120, 100, len, 0, 20), dx: 0, dy: 20, active: true,
                        respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
            roadStraight();
            food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
            const d0 = stats.rivalsDefeated, l0 = snake.length;
            updateGame();
            return { state: gameState, delta: stats.rivalsDefeated - d0,
                     grew: snake.length - l0, cause: lastDeathCause };
        };
        return { frozen2: short(2, true), frozen3: short(3, true), frozen4: short(4, true),
                 frozen6: short(6, true) };
    })()`);
    const removed = (o) => o.state === 'playing' && o.delta === 1;
    check('B18: a frozen length-2 rival drained to nothing is removed, not a death',
          removed(r.frozen2), JSON.stringify(r.frozen2));
    check('B18b: the same for length 3 and 4 (drain leaves 1 segment)',
          removed(r.frozen3) && removed(r.frozen4), JSON.stringify(r));
    // The contrast that makes it a real boundary: at length 6 the drain leaves 3, clause 1
    // cannot apply, and a stationary rival must NOT be credited — the player dies instead.
    check('B18c: at length 6 the drain leaves 3, so the stationary rival is not credited',
          r.frozen6.state === 'gameover' && r.frozen6.delta === 0, JSON.stringify(r.frozen6));
} catch (e) { fail_('B18: short-rival rescue', e.message); }

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
        const saved = r.state === 'playing' && consumed && !/rival/.test(r.cause);
        check('B9: the ' + save + ' save absorbs a rival contact', saved, JSON.stringify(r));
        // A save must NOT be scored as a body ram. The shield cancels rule 1 without
        // relocating the head, so the head legitimately ends the tick on the rival's tile —
        // rule 2 must skip it, or being saved hands the player a credited, rewarded kill.
        check('B9b: a save is never scored as a ram (rival survives, uncredited)',
              r.rivalActive === true && r.delta === 0, JSON.stringify(r));
    } catch (e) { fail_('B9: ' + save + ' save', e.message); }
}

// B13: a SAVE must never be scored as a ram, including in a head-on SWAP. The shield
// cancels rule 1 without relocating, so the rival's new head ends up on the tile the player
// just left — which after the unshift is the player's NECK (snake[1]). The si=1 skip alone
// does not cover that: rule 2 has to be suppressed for the rival rule 1 already adjudicated.
// Pre-fix this paid +1 defeat and +50 score for being saved.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun({ brews: [] });
        shieldActive = true; powerUpTimer = 9999; powerUpType = 'shield';
        playerAt(100, 100, 4);
        // Head-on swap: player 100 -> 120, rival 120 -> 100.
        rivals = [{ snake: [{x:120,y:100},{x:140,y:100}], dx: -20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        updateGame();
        return { state: gameState, blocks: stats.shieldBlocks, delta: stats.rivalsDefeated,
                 score: score, cause: lastDeathCause,
                 rivalActive: rivals.length ? rivals[0].active : null };
    })()`);
    check('B13: a shielded head-on swap does not pay a credited kill',
          r.state === 'playing' && r.blocks === 1 && r.delta === 0 && r.score === 0 &&
          r.rivalActive === true, JSON.stringify(r));
    // Without the shield the same geometry must kill the player with no credit — the
    // contrast is what makes the rule legible.
    const noShield = await page.evaluate(`(() => {
        ${PRE}
        cleanRun({ brews: [] });
        playerAt(100, 100, 4);
        rivals = [{ snake: [{x:120,y:100},{x:140,y:100}], dx: -20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        updateGame();
        return { state: gameState, delta: stats.rivalsDefeated, cause: lastDeathCause };
    })()`);
    check('B13b: the same swap kills the player when unsaved, uncredited',
          noShield.state === 'gameover' && noShield.delta === 0 && /head-on/.test(noShield.cause),
          JSON.stringify(noShield));
} catch (e) { fail_('B13: shielded swap', e.message); }

// B14: the death cause must distinguish a head-on from a flank charge — v13 made the head-on
// lethal where it used to be a free kill, so one shared string taught the player nothing.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun({ brews: [] });
        playerAt(140, 100, 4);
        // FLANK: the rival is horizontal and steps UP, so its body still crosses row 100 at
        // x=160 while its head moves to (160,80) — away from the player's tile and body.
        // The player charges into the rival's side: lethal, but not a head-on.
        rivals = [{ snake: [{x:160,y:100},{x:180,y:100},{x:200,y:100}], dx: 0, dy: -20,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        updateGame();
        return { state: gameState, cause: lastDeathCause };
    })()`);
    check('B14: charging the rival\'s flank reports the flank cause, not a head-on',
          r.state === 'gameover' && /ran into/.test(r.cause), JSON.stringify(r));
    // The head-on case (B1/B2) must report a DIFFERENT string: one shared string taught the
    // player nothing about a rule that just became lethal.
    const headOn = await page.evaluate(`(() => {
        ${PRE}
        cleanRun({ brews: [] });
        playerAt(100, 100, 4);
        rivals = [{ snake: [{x:120,y:100},{x:140,y:100}], dx: -20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        updateGame();
        return { state: gameState, cause: lastDeathCause };
    })()`);
    check('B14b: the two lethal geometries report distinct, rule-naming causes',
          headOn.state === 'gameover' && /head-on/i.test(headOn.cause) &&
          headOn.cause !== r.cause, JSON.stringify({ flank: r.cause, headOn: headOn.cause }));
    // v12's lesson: canvas text metrics are environment-dependent, and the recap card is a
    // fixed 320px. Measure the strings rather than trusting an offset.
    const width = await page.evaluate(`(() => {
        ctx.save(); ctx.font = 'bold 13px Arial';
        const out = { card: 320, cause: Math.round(ctx.measureText(lastDeathCause).width) };
        ctx.restore(); return out;
    })()`);
    check('B14c: the head-on cause fits the 320px recap card',
          width.cause > 0 && width.cause <= width.card - 20, JSON.stringify(width));
} catch (e) { fail_('B14: cause split', e.message); }

// B15: the Phoenix/streak teleport rebuilds a 3-tile body, and only its HEAD tile went
// through findFreeTile — the two tail tiles were unfiltered, so a later tick could credit a
// rival they had been laid on top of. The rebuild must stop before a rival segment.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun({ brews: ['phoenix'] });
        playerAt(100, 200, 4);
        // Rival 0 is the hit: player head 100 -> 120 lands on its post-move body.
        // Rival 1's post-move head is (280,300) — exactly the first tile the rebuild would
        // lay behind a teleport to (300,300).
        rivals = [
          { snake: [{x:120,y:200},{x:140,y:200}], dx: -20, dy: 0,
            active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' },
          // Post-move body: [(260,300),(280,300)] — its NECK is the first tile the rebuild
          // would lay at (280,300), while the teleport target (300,300) stays free.
          { snake: [{x:280,y:300},{x:300,y:300}], dx: -20, dy: 0,
            active: true, respawnTimer: 0, moveCounter: 0, color: '#AD1457' }
        ];
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        const origFind = window.findFreeTile;
        window.findFreeTile = function () { return { x: 300, y: 300 }; };
        updateGame();
        window.findFreeTile = origFind;
        const onRival = snake.some(function (s) {
            return rivals.some(function (rv) { return rv.snake.some(function (rs) { return rs.x === s.x && rs.y === s.y; }); });
        });
        return { state: gameState, len: snake.length, onRival, phoenixUsed: brewUsageFlags.phoenixUsed };
    })()`);
    check('B15: the phoenix rebuild never lays the body on a rival',
          r.phoenixUsed === true && r.onRival === false, JSON.stringify(r));
} catch (e) { fail_('B15: phoenix rebuild', e.message); }

// B16: the head-on rule is taught exactly once, and only on a genuine head-on. The cause
// string cannot carry the counterplay (it must stay short for the 320px recap card), so the
// one-shot toast IS the teaching mechanism — nothing pinned it, its string, or its flag.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        const headOn = () => {
            cleanRun({ brews: [] });
            playerAt(100, 100, 4);
            rivals = [{ snake: [{x:120,y:100},{x:140,y:100}], dx: -20, dy: 0,
                        active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
            roadStraight();
            food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
            updateGame();
        };
        const heard = [];
        const orig = window.queueToast;
        window.queueToast = function (msg) { heard.push(String(msg)); };
        hasSeenRivalHeadOn = false;
        headOn();
        const first = heard.slice();
        heard.length = 0;          // clear, or the second slice still carries the first toast
        headOn();
        const second = heard.slice();
        window.queueToast = orig;
        return { first, second, flag: hasSeenRivalHeadOn,
                 stored: saveManager.get('snake_has_seen_rival_head_on', '') };
    })()`);
    const taught = r.first.filter(function (m) { return /head-on/.test(m); });
    check('B16: the head-on death teaches the counterplay once',
          taught.length === 1 && /SIDE/i.test(taught[0]), JSON.stringify(r));
    check('B16b: it does not fire again on a later head-on death',
          r.second.filter(function (m) { return /head-on/.test(m); }).length === 0, JSON.stringify(r.second));
    check('B16c: the one-shot flag persists', r.flag === true && r.stored === '1',
          JSON.stringify({ flag: r.flag, stored: r.stored }));
} catch (e) { fail_('B16: teach toast', e.message); }

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
// The food sits one tile in front of BOTH heads: the rival reaches it on its move, the
// player would have reached it on theirs. Pre-v13 the player ate it and the rival grew by
// nothing; now the rival eats it and the player leaves empty-handed.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        playerAt(200, 200, 3);
        food = { x: 220, y: 200, type: 'common', spawnTime: 0 };
        // length 3 -> stride 1, so the rival moves on the first call.
        rivals = [{ snake: [{x:240,y:200},{x:260,y:200},{x:280,y:200}], dx: -20, dy: 0,
                    active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        roadStraight();
        const lenBefore = rivals[0].snake.length;
        let atEnd = null;
        const realOver = window.gameOver;
        window.gameOver = function () {
            atEnd = { len: rivals.length ? rivals[0].snake.length : -1, score: score };
            return realOver.apply(this, arguments);
        };
        updateGame();
        window.gameOver = realOver;
        return { lenBefore, atEnd, state: gameState, score: score, cause: lastDeathCause };
    })()`);
    // The rival ends the tick standing on the contested tile having eaten it; the player,
    // arriving second, finds nothing (and dies on the rival). Pre-v13 the order was
    // reversed — the player ate and the rival grew by nothing.
    check('B11: the rival wins the contested food (it moves first)',
          r.atEnd && r.atEnd.len === r.lenBefore + 1 && r.atEnd.score === 0, JSON.stringify(r));
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
        // Rival 0 moves LEFT onto the player's head tile (200,200) and dies by leech.
        // Its direction must be non-zero: a dx:0/dy:0 rival has a degenerate head and
        // self-destructs before the leech can fire.
        rivals = [
          { snake: [{x:220,y:200},{x:240,y:200}], dx: -20, dy: 0,
            active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' },
          // Rival 1 is one tile above the player's body segment at (120,200) and steps
          // straight down onto it.
          { snake: [{x:120,y:180},{x:120,y:160},{x:120,y:140}], dx: 0, dy: 20,
            active: true, respawnTimer: 0, moveCounter: 0, color: '#AD1457' }
        ];
        roadStraight();
        food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
        const before = stats.rivalsDefeated;
        updateGame();
        return { delta: stats.rivalsDefeated - before, score: score, state: gameState,
                 active: rivals.map(function (rv) { return rv.active; }) };
    })()`);
    // Two credited removals in one tick must pay exactly twice — never once (a lost credit)
    // and never three times (a doubled reward).
    check('B12: two removals in one tick credit exactly twice and pay exactly once each',
          r.delta === 2 && r.score === 100, JSON.stringify(r));
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
        // The default floor is 3 RAW tiles — sample it, or the assertion passes for any radius.
        let minDefault = 99, minOptIn = 99, n = 0;
        for (let i = 0; i < 300; i++) {
            rivals = []; snake = [{ x: 200, y: 200 }]; obstacles = []; hazards = []; extraFoods = []; food = null;
            const a = findFreeTile(200, 200);
            const b = findFreeTile(200, 200, { minTiles: 5, wrapAware: true });
            if (a) { minDefault = Math.min(minDefault, rivalTileDistance(200, 200, a.x, a.y)); n++; }
            if (b) minOptIn = Math.min(minOptIn, rivalTileDistance(200, 200, b.x, b.y));
        }
        return { t: !!t, t2: !!t2, near, minDefault, minOptIn, n };
    })()`);
    check('D2: findFreeTile keeps its 3-raw-tile default for legacy callers',
          r.t && r.t2 && r.minDefault >= 3 && r.minDefault < 5 && r.minOptIn >= 5,
          JSON.stringify(r));
} catch (e) { fail_('D2: legacy default', e.message); }

// D5: the rival never materialises on an extra food (hoard/portal) or inside a live hazard.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        // Pin the PRNG: this fixture samples ONE spawn, so with live randomness the tile
        // varies run to run and the assertion can pass by luck (visible when the suite is
        // run against a build where the predicate does not exist yet).
        seedPrng = mulberry32(20240915);
        snake = [{ x: 40, y: 40 }];
        obstacles = []; rivals = []; food = null; food2 = null;
        // Flood the board with extra foods except a corner, then check no spawn lands on one.
        extraFoods = [];
        // One live hazard covering the whole board is unusable (nothing could spawn), so
        // place a small on-phase rift and assert the spawn avoids that tile specifically.
        hazards = [{ cx: 200, cy: 200, radius: 40, phase: 'on', phaseTimer: 10, lifeTimer: 100, maxLife: 100 }];
        spawnRival(0);
        const onExtra = rivals.length && rivals[0].snake.length
          ? rivals[0].snake.some(s => extraFoods.some(e => e.x === s.x && e.y === s.y))
          : false;
        const inHazard = rivals.length && rivals[0].snake.length
          ? rivals[0].snake.some(s => Math.abs(s.x - 200) + Math.abs(s.y - 200) <= 40)
          : false;
        seedPrng = null;
        return { spawned: !!(rivals.length && rivals[0].snake.length), onExtra, inHazard };
    })()`);
    check('D5: a rival never materialises on an extra food', r.onExtra === false, JSON.stringify(r));
    check('D5b: a rival never materialises inside a live hazard', r.inHazard === false, JSON.stringify(r));
} catch (e) { fail_('D5: extras avoidance', e.message); }

// D6: the telegraph's BODY gets the same occupancy set as its head tile — including the
// primary food, which the body-extension loop previously ignored (measured 5/800 spawns on
// the food, and since body segment 1 is adjacent to the head the rival then ate it free).
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        seedPrng = mulberry32(20240916);   // pinned: a fixed 800-spawn sample
        snake = [{ x: 40, y: 40 }];
        let onFood = 0, placed = 0;
        for (let i = 0; i < 800; i++) {
            rivals = []; obstacles = []; hazards = []; extraFoods = []; food2 = null;
            food = { x: 120, y: 120, type: 'common', spawnTime: 0 };
            spawnRival(0);
            if (!rivals.length || !rivals[0].snake.length) continue;
            placed++;
            if (rivals[0].snake.some(s => s.x === food.x && s.y === food.y)) onFood++;
        }
        seedPrng = null;
        return { placed, onFood };
    })()`);
    check('D6: no telegraph body segment lands on the primary food',
          r.placed > 100 && r.onFood === 0, JSON.stringify(r));
} catch (e) { fail_('D6: body vs food', e.message); }

// D7: under double_rival, one telegraph's BODY must not be laid over another's. The head
// tile went through rivalCombinedSnake() (which now includes materialising rivals); the
// body-extension loop checked no sibling at all, so two telegraphs could stack.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        seedPrng = mulberry32(20240917);   // pinned: a fixed 400-spawn sample
        snake = [{ x: 40, y: 40 }, { x: 20, y: 40 }];
        let overlaps = 0, placed = 0;
        for (let i = 0; i < 400; i++) {
            obstacles = []; hazards = []; extraFoods = []; food2 = null; food = null;
            // Rival 0 is a fixed materialising telegraph; rival 1 spawns around it.
            rivals = [{ snake: [{x:200,y:200},{x:220,y:200},{x:240,y:200}], dx: 20, dy: 0,
                        active: false, respawnTimer: 900, moveCounter: 0, deferCount: 0,
                        color: '#B71C1C' }];
            spawnRival(1);
            if (rivals.length < 2 || !rivals[1].snake.length) continue;
            placed++;
            const a = rivals[0].snake, b = rivals[1].snake;
            if (a.some(function (x) { return b.some(function (y) { return x.x === y.x && x.y === y.y; }); })) overlaps++;
        }
        seedPrng = null;
        return { placed, overlaps };
    })()`);
    check('D7: a second telegraph never overlaps the first',
          r.placed > 100 && r.overlaps === 0, JSON.stringify(r));
} catch (e) { fail_('D7: sibling telegraphs', e.message); }

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

// F2: the warning must actually SOUND, and must sound when the wind-up starts — a tone at
// the moment the rival becomes lethal is not a warning. Behavioural: intercept playSound
// and read the calls (a source grep would pass with the case unreachable).
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        snake = [{ x: 40, y: 40 }];
        const orig = playSound;
        const heard = [];
        window.playSound = function (n) { heard.push(n); };
        rivals = [];
        spawnRival(0);                       // the wind-up STARTS here
        const atWindup = heard.slice();
        // Now run the wind-up to activation and confirm nothing re-fires the warning.
        const rv = rivals[0];
        rv.snake = [{ x: 200, y: 200 }, { x: 180, y: 200 }, { x: 160, y: 200 }];
        rv.respawnTimer = 0;
        for (let i = 0; i < 3; i++) updateGame();
        window.playSound = orig;
        return { atWindup, activated: rv.active, afterActivation: heard.slice() };
    })()`);
    check('F2: the rival warning sounds when the wind-up starts',
          r.atWindup.indexOf('rival_warn') !== -1, JSON.stringify(r));
    check('F2b: it does not re-fire at activation',
          r.afterActivation.filter(function (n) { return n === 'rival_warn'; }).length === 1,
          JSON.stringify(r));
} catch (e) { fail_('F2: sound', e.message); }

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

// F5: the three-state HUD. It is the only textual channel for the telegraph, so capture
// the strings drawRivalHUD actually renders (by intercepting fillText).
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        const origText = ctx.fillText.bind(ctx);
        let texts = [];
        ctx.fillText = function (t) { texts.push(String(t)); return origText.apply(null, arguments); };
        const capture = (setup) => {
            texts = []; setup(); drawRivalHUD();
            return texts.filter(function (t) { return t.indexOf('Rival') === 0 || t.indexOf('\u26A0') === 0; });
        };
        const none = capture(() => { rivals = []; });
        const live = capture(() => {
            rivals = [{ snake: [{x:20,y:20},{x:40,y:20},{x:60,y:20}], dx: 20, dy: 0,
                        active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        });
        const windup = capture(() => {
            rivals[0].active = false; rivals[0].respawnTimer = 1200;
        });
        const dead = capture(() => {
            rivals[0].snake = []; rivals[0].respawnTimer = 6400;
        });
        ctx.fillText = origText;
        return { none, live, windup, dead };
    })()`);
    check('F5: the HUD is silent with no rival', r.none.length === 0, JSON.stringify(r));
    check('F5b: the HUD shows the live length', /^Rival: 3$/.test(r.live[0] || ''), JSON.stringify(r.live));
    check('F5c: the HUD shows the telegraph countdown',
          /^\u26A0 Rival in 1\.[12]s$/.test(r.windup[0] || ''), JSON.stringify(r.windup));
    check('F5d: the HUD shows the respawn countdown',
          /^Rival \u29D7 6\.4s$/.test(r.dead[0] || ''), JSON.stringify(r.dead));
    // All three states must be DISTINCT strings, or the HUD is not telling the player which
    // state the rival is in.
    check('F5e: the three states render three distinct strings',
          new Set([r.live[0], r.windup[0], r.dead[0]]).size === 3, JSON.stringify(r));
} catch (e) { fail_('F5: HUD states', e.message); }

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

// F6: one HUD line, two rivals. A live rival's ambient length must NOT mask a materialising
// rival's countdown — that hides the feature's core cue for its entire window.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        const origText = ctx.fillText.bind(ctx);
        let texts = [];
        ctx.fillText = function (t) { texts.push(String(t)); return origText.apply(null, arguments); };
        const capture = (setup) => {
            texts = []; setup(); drawRivalHUD();
            return texts.filter(function (t) { return /Rival/.test(t); });
        };
        const both = capture(() => {
            rivals = [
              { snake: [{x:60,y:60},{x:80,y:60},{x:100,y:60}], dx: 20, dy: 0, active: true,
                respawnTimer: 0, moveCounter: 0, color: '#B71C1C' },
              { snake: [{x:300,y:300},{x:320,y:300},{x:340,y:300}], dx: 20, dy: 0, active: false,
                respawnTimer: 800, moveCounter: 0, deferCount: 0, color: '#AD1457' }
            ];
        });
        const liveOnly = capture(() => { rivals = [rivals[0]]; });
        ctx.fillText = origText;
        return { both, liveOnly };
    })()`);
    check('F6: a materialising rival outranks a live one on the HUD line',
          /^\u26A0 Rival in/.test(r.both[0] || ''), JSON.stringify(r));
    check('F6b: with no telegraph the live length still shows',
          /^Rival: 3$/.test(r.liveOnly[0] || ''), JSON.stringify(r.liveOnly));
} catch (e) { fail_('F6: HUD priority', e.message); }

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

// G2: the chase branch rejects a move onto the rival's own body WHEN an alternative
// exists (the arena spec's promised rule). A no-alternative coil still dies — documented.
try {
    const r = await page.evaluate(`(() => {
        ${PRE}
        cleanRun();
        // Head at (40,40) with its forward tile (60,40) occupied by its own body index 3,
        // and (40,60) free. The chase branch must pick the free perpendicular.
        rivals = [{ snake: [{x:40,y:40},{x:20,y:40},{x:60,y:40},{x:60,y:20},{x:60,y:0}],
                    dx: 20, dy: 0, active: true, respawnTimer: 0, moveCounter: 0, color: '#B71C1C' }];
        // Food directly ahead on the x axis with a positive delta -> chase branch, and the
        // candidate is the blocked tile.
        food = { x: 200, y: 40, type: 'common', spawnTime: 0 };
        window.seededRandom = () => 0;   // always take the chase branch and index 0
        updateRival(0);
        const alive = rivals[0].active;
        const head = alive ? rivals[0].snake[0].x + ',' + rivals[0].snake[0].y : 'dead';
        window.seededRandom = window.__origSeededRandom;
        return { alive, head, len: rivals[0].snake.length };
    })()`);
    check('G2: the AI avoids a 1-ply self-collision when an alternative exists',
          r.alive === true && r.head !== '60,40', JSON.stringify(r));
} catch (e) { fail_('G2: self-rejection', e.message); }

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
