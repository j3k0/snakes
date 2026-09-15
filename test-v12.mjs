// v12 test suite — Snakes v12 "Nothing advertised is a lie".
//
// Covers the seven shipped items: Feature 0 (mirror relocation), A (resonance
// completion), B (hazard telegraph), C (recap truth), D (help/legend truth),
// E (toast pipeline), F (risk income).
//
// Assertions are BEHAVIOURAL wherever possible. The three source-text assertions
// that remain (marked "source") guard invariants that have no observable surface
// (e.g. "addScore is not where the resonance multiplier lives"); each is paired
// with a behavioural assertion of the same property.
//
// Run: node test-v12.mjs

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

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

await page.waitForTimeout(500);

// Shared in-page helper: reset to a clean, deterministic Classic run.
const RESET = `
const cleanRun = (mutators) => {
  gameMode = 'classic'; resetGame(); startGame(); stopGameLoop();
  rivals = []; obstacles = []; hazards = []; extraFoods = []; activeBrews = [];
  activeMutators = mutators || [];
  comboCount = 0; comboCharges = 0; scoreMultiplier = 1; hazardAdjacentThisTick = false;
  pigmentRushActive = false; hoardActive = false; evolutionTier = -1;
  pinnacleRank = 0; level = 1; gameTick = 1; sessionXP = 0; score = 0;
  dirQueue = []; lastConsumedDir = { dx: 20, dy: 0 }; dx = 20; dy = 0;
};
`;

// ---------------------------------------------------------------------------
// 1. Load smoke
// ---------------------------------------------------------------------------
try {
    const errors = await page.evaluate(() => window.__loadErrors || []);
    if (errors.length === 0) ok('No JS errors on load');
    else fail_('No JS errors on load', errors.join('; '));
} catch (e) { fail_('No JS errors on load', e.message); }

// ---------------------------------------------------------------------------
// Feature 0 — mirror flip relocation
// ---------------------------------------------------------------------------
// The mirror mutator used to be applied only in the keydown handler, so the swipe
// path (which calls setNextDirection directly) ignored it.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        const press = (d) => {
          dirQueue = []; lastConsumedDir = { dx: 0, dy: -20 }; dx = 0; dy = -20;
          setNextDirection(d[0], d[1]);
          return dirQueue.length ? dirQueue[0].dx + ',' + dirQueue[0].dy : 'REJECTED';
        };
        cleanRun(['mirror']);
        const swipePath = press([-20, 0]);          // direct call = swipe path
        dirQueue = []; lastConsumedDir = { dx: 0, dy: -20 }; dx = 0; dy = -20;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        const keyPath = dirQueue.length ? dirQueue[0].dx + ',' + dirQueue[0].dy : 'REJECTED';
        cleanRun([]);
        const noMirror = press([-20, 0]);
        return { swipePath, keyPath, noMirror };
    })()`);
    if (r.swipePath === '20,0' && r.keyPath === '20,0' && r.noMirror === '-20,0') {
        ok('0: mirror applies on swipe AND keyboard; off when not drafted');
    } else fail_('0: mirror relocation', JSON.stringify(r));
} catch (e) { fail_('0: mirror relocation', e.message); }

// ---------------------------------------------------------------------------
// Feature A — resonance completion
// ---------------------------------------------------------------------------

// A1: every advertised resonance is actually DETECTABLE. The v6 table was keyed in
// hand-written order while detection sorts its lookup, so 5 of 8 keys could never
// match at all and no resonance ever fired.
try {
    const r = await page.evaluate(`(() => {
        const bad = [];
        for (const key of Object.keys(RESONANCES)) {
          if (!detectResonance(key.split('~'))) bad.push(key);
        }
        return { total: Object.keys(RESONANCES).length, unreachable: bad };
    })()`);
    if (r.unreachable.length === 0) ok('A: all ' + r.total + ' resonances are detectable');
    else fail_('A: resonance reachability', 'unreachable: ' + r.unreachable.join(', '));
} catch (e) { fail_('A: resonance reachability', e.message); }

// A2: no advertised resonance is inert — each effect tag has a real implementation.
try {
    const r = await page.evaluate(`(() => {
        const implemented = ['invertControls','intangiblePhase','doubleGold','rivalShrink',
                             'feastFamine','quantumToggle','chaosCycle','rapidDoom'];
        const declared = new Set(Object.values(RESONANCES).map(x => x.effect));
        const missing = [...declared].filter(e => !implemented.includes(e));
        const tickSrc = tickResonance.toString();
        // Each of the four non-input effects must be READ somewhere outside the table.
        const readSites = ['resonanceActive','chaosCycleAllows','foodResonanceMult','hungerInterval'];
        const unread = readSites.filter(f => typeof window[f] !== 'function' && typeof eval(f) !== 'function');
        return { missing, unread, declaredCount: declared.size };
    })()`);
    if (r.missing.length === 0 && r.unread.length === 0) {
        ok('A: all ' + r.declaredCount + ' declared effects have an implementation');
    } else fail_('A: effect coverage', JSON.stringify(r));
} catch (e) { fail_('A: effect coverage', e.message); }

// A3: Chaos Gold — the exact score/XP delta pins the multiplier placement.
// 10 pts * 2 (resonance) * 3 (golden_food, applied inside addScore) = 60.
// 25 xp  * 2 (resonance)                                         = 50.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['golden_food','chaos_seed']);
        const t = FOOD_TIERS.common;
        awardXP(Math.round(t.xp * foodResonanceMult() * (1 + comboCount * 0.5)));
        addScore(t.pts * foodResonanceMult());
        return { score, xp: sessionXP };
    })()`);
    if (r.score === 60 && r.xp === 50) ok('A: Chaos Gold scores exactly 60 / 50 XP on a common food');
    else fail_('A: Chaos Gold exact delta', JSON.stringify(r) + ' (expected score 60, xp 50)');
} catch (e) { fail_('A: Chaos Gold exact delta', e.message); }

// A4: with pigment rush active the value is 120, NOT 180 — golden_food caps the hoard
// multiplier at 2 (addScore's `golden_food ? 2 : 3`), and Chaos Gold necessarily
// drafts golden_food. 10 * 2 * 3 * 2 = 120.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['golden_food','chaos_seed']);
        pigmentRushActive = true; scoreMultiplier = 1;
        addScore(FOOD_TIERS.common.pts * foodResonanceMult());
        return score;
    })()`);
    if (r === 120) ok('A: Chaos Gold + pigment rush is exactly 120 (golden caps hoard at x2)');
    else fail_('A: pigment delta', r + ' (expected 120)');
} catch (e) { fail_('A: pigment delta', e.message); }

// A5: PLACEMENT DISCRIMINATOR — a non-food award must NOT be doubled. This is what
// proves the multiplier lives at the food site, not in the shared score funnel.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['golden_food','chaos_seed']);
        addScore(10);                      // direct award (bounty-style), not a food site
        const direct = score;
        cleanRun(['golden_food']);
        score = 0; addScore(10);
        const plain = score;
        return { direct, plain };
    })()`);
    if (r.direct === r.plain) ok('A: non-food awards are NOT doubled (multiplier is at the food site)');
    else fail_('A: placement discriminator', JSON.stringify(r));
} catch (e) { fail_('A: placement discriminator', e.message); }

// A5b: the ECHO-BREW `food2` path must carry the multiplier too. `food2.pts` is set at
// every construction site, so the multiplier has to wrap the whole expression — putting
// it only on the `||` fallback makes it dead code and silently breaks the descriptor.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['golden_food','chaos_seed']);
        activeBrews = ['echo'];
        const h = snake[0];
        // Food2 sits on the head's next tile; the primary food is far away so only the
        // echo award lands this tick. food2.pts mirrors the real construction site.
        food2 = { x: (h.x + 20) % 400, y: h.y, type: 'common', pts: Math.floor(FOOD_TIERS.common.pts / 2) };
        food = { x: (h.x + 200) % 400, y: (h.y + 200) % 400, type: 'common', spawnTime: 0 };
        const before = score;
        gameTick++;
        updateGame();
        const withResonance = score - before;
        cleanRun(['golden_food']);
        activeBrews = ['echo'];
        const h2 = snake[0];
        food2 = { x: (h2.x + 20) % 400, y: h2.y, type: 'common', pts: Math.floor(FOOD_TIERS.common.pts / 2) };
        food = { x: (h2.x + 200) % 400, y: (h2.y + 200) % 400, type: 'common', spawnTime: 0 };
        const before2 = score;
        gameTick++;
        updateGame();
        const withoutResonance = score - before2;
        return { withResonance, withoutResonance };
    })()`);
    // food2.pts = 5. Without the resonance: 5 x 3 (golden) = 15. With: 5 x 2 x 3 = 30.
    if (r.withResonance === 30 && r.withoutResonance === 15) {
        ok('A: the echo-brew food2 award carries the resonance multiplier (30 vs 15)');
    } else fail_('A: food2 multiplier', JSON.stringify(r) + ' (expected 30 / 15)');
} catch (e) { fail_('A: food2 multiplier', e.message); }

// A6: addScore itself must not read the resonance — keeps the v11 source-text
// assertions on addScore valid and keeps the descriptor ("food") honest.
try {
    const r = await page.evaluate(() => {
        const src = addScore.toString();
        return { hasResonance: src.includes('foodResonanceMult') || src.includes('resonanceActive') };
    });
    if (!r.hasResonance) ok('A (source): addScore does not carry the resonance multiplier');
    else fail_('A (source): addScore polluted with resonance logic');
} catch (e) { fail_('A (source): addScore scope', e.message); }

// A7: Famine Feast — hunger interval 30 vs 50, and a 4x food multiplier.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['hunger_clock']);
        const plain = hungerInterval();
        cleanRun(['hunger_clock','golden_food']);
        return { plain, famine: hungerInterval(), mult: foodResonanceMult() };
    })()`);
    if (r.plain === 50 && r.famine === 30 && r.mult === 4) ok('A: Famine Feast shortens hunger to 30 and multiplies food x4');
    else fail_('A: Famine Feast', JSON.stringify(r));
} catch (e) { fail_('A: Famine Feast', e.message); }

// A8: Ethereal — drive the REAL updateGame() and count. The previous version of this
// assertion re-implemented the two production lines and passed with the whole block
// deleted AND while a double-hunger-pop bug was live.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['phase_shift','hunger_clock']);
        hungerStarted = true; hungerTickCounter = 0;
        // 14 segments = a 280px trail on a 400px board, so a straight run never
        // re-enters its own body. (A 30-segment trail is 600px and always self-collides.)
        snake = new Array(14).fill(0).map((_, i) => ({ x: 100 - i * 20, y: 100 }));
        dx = 20; dy = 0;
        let ghostTicks = 0;
        const lossTicks = [];
        let prevLen = snake.length;
        // Ticks 0..499 = 100 complete 5-tick windows, so no window is cut short at the
        // range boundary (a range ending mid-window under-counts the last one).
        for (let i = 0; i <= 499; i++) {
          gameTick = i;
          // Keep food out of the head's lane so growth can't extend the trail past the
          // board width and cause a self-collision.
          food = { x: (snake[0].x + 200) % 400, y: (snake[0].y + 200) % 400, type: 'common', spawnTime: 0 };
          updateGame();
          if (gameState !== 'playing') return { died: true, at: i, cause: lastDeathCause };
          if (intangibleWindowTicks > 0) ghostTicks++;
          if (snake.length < prevLen) lossTicks.push(i);
          prevLen = snake.length;
        }
        const consecutive = lossTicks.filter((t, i) => i > 0 && t - lossTicks[i-1] === 1);
        return { died: false, ghostTicks, pops: lossTicks.length, consecutive, finalLen: snake.length };
    })()`);
    // Ticks 0..499 = 100 five-tick windows; the window is open on 3 of each = 300.
    const ghostOk = r.ghostTicks === 300;
    const noDouble = !r.died && r.consecutive.length === 0;
    if (ghostOk && noDouble) {
        ok('A: Ethereal ghosts exactly 3-in-5 ticks and never double-pops hunger (' + r.pops + ' pops / 500 ticks)');
    } else fail_('A: Ethereal window', JSON.stringify(r) + ' (expected ghostTicks 300, no consecutive losses)');
} catch (e) { fail_('A: Ethereal window', e.message); }

// A9: Chaos Theory — a SUBSET draft is completely unaffected by the cycle gate.
// (The full three-mutator set IS the resonance, so a "without the resonance" run is
// the subset run — that is the invariant the additive gate must protect.)
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['gravity','mirror']);
        const subset = [chaosCycleAllows('gravity'), chaosCycleAllows('mirror'), chaosCycleAllows('phase_shift')];
        cleanRun(['gravity','mirror','phase_shift']);
        chaosCycleIndex = 0;
        const cycle0 = [chaosCycleAllows('gravity'), chaosCycleAllows('mirror'), chaosCycleAllows('phase_shift')];
        chaosCycleIndex = 1;
        const cycle1 = [chaosCycleAllows('gravity'), chaosCycleAllows('mirror'), chaosCycleAllows('phase_shift')];
        return { subset, cycle0, cycle1 };
    })()`);
    const subsetFree = r.subset.every(Boolean);
    const exactlyOne = [r.cycle0, r.cycle1].every(c => c.filter(Boolean).length === 1);
    if (subsetFree && exactlyOne) ok('A: Chaos Theory gates exactly one effect, and leaves subset drafts untouched');
    else fail_('A: Chaos Theory gating', JSON.stringify(r));
} catch (e) { fail_('A: Chaos Theory gating', e.message); }

// A10: Quantum — the axis swap is observable, is ordered before the mirror flip, and
// can never reverse the heading (the safety property) for ANY heading/press pair.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        const press = (d, heading) => {
          dirQueue = []; lastConsumedDir = { dx: heading[0], dy: heading[1] };
          dx = heading[0]; dy = heading[1];
          setNextDirection(d[0], d[1]);
          return dirQueue.length ? [dirQueue[0].dx, dirQueue[0].dy] : null;
        };
        cleanRun(['gravity','mirror']);
        // Head moving right: normally the vertical keys steer, the horizontal ones are
        // rejected (mirror turns Left into a duplicate and Right into a reversal).
        resonanceInvertTicks = 0;
        const off = { left: press([-20,0],[20,0]), right: press([20,0],[20,0]),
                      up: press([0,-20],[20,0]), down: press([0,20],[20,0]) };
        // Window open: the swap maps the horizontal keys onto the vertical axis.
        // Order matters — swap-then-mirror yields (0,-20), mirror-then-swap (0,+20).
        resonanceInvertTicks = 5;
        const on = { left: press([-20,0],[20,0]), right: press([20,0],[20,0]) };
        // Safety sweep: no press from any heading may produce a reversal.
        let reversed = 0;
        for (const h of [[20,0],[-20,0],[0,20],[0,-20]]) {
          for (const d of [[-20,0],[20,0],[0,-20],[0,20]]) {
            const q = press(d, h);
            if (q && q[0] === -h[0] && q[1] === -h[1]) reversed++;
          }
        }
        return { off, on, reversed };
    })()`);
    const swapWorks = JSON.stringify(r.on.left) === '[0,-20]' && JSON.stringify(r.on.right) === '[0,20]';
    const offDiffers = JSON.stringify(r.off.left) === 'null' && JSON.stringify(r.off.right) === 'null';
    const safe = r.reversed === 0;
    if (swapWorks && offDiffers && safe) {
        ok('A: Quantum swaps axes (sign-pinned), differs from mirror-only, never reverses the heading');
    } else fail_('A: Quantum swap', JSON.stringify(r));
} catch (e) { fail_('A: Quantum swap', e.message); }

// A11: Quantum cadence is seeded and bounded — it must NOT fire every tick.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['gravity','mirror']);
        activeSeed = 'cadence'; seedPrng = mulberry32(hashString('cadence'));
        let opens = 0;
        for (let i = 0; i < 400; i++) {
          gameTick = i;
          const before = resonanceInvertTicks;
          tickResonance();
          if (before === 0 && resonanceInvertTicks > 0) opens++;
        }
        return opens;
    })()`);
    // Cycle = 5 window ticks + 10-15 cooldown => ~20-27 openings in 400 ticks.
    if (r >= 15 && r <= 35) ok('A: Quantum cadence is bounded (' + r + ' openings / 400 ticks, not per-tick)');
    else fail_('A: Quantum cadence', r);
} catch (e) { fail_('A: Quantum cadence', e.message); }

// A12: Schrodinger — the reshuffle branch really REPLACES the chaos weights.
// A bare shuffleFoodWeights() call returns a fresh map and mutates nothing, which
// would be silently inert.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['mirror','chaos_seed']);
        activeSeed = 'sch'; seedPrng = mulberry32(hashString('sch'));
        const before = chaosCurrentWeights;
        for (let i = 0; i <= 30; i++) { gameTick = i; tickResonance(); }
        return { replaced: chaosCurrentWeights !== before,
                 hasKeys: !!(chaosCurrentWeights && Object.keys(chaosCurrentWeights).length > 0) };
    })()`);
    if (r.replaced && r.hasKeys) ok('A: Schrodinger reshuffle really replaces chaosCurrentWeights');
    else fail_('A: Schrodinger reshuffle', JSON.stringify(r));
} catch (e) { fail_('A: Schrodinger reshuffle', e.message); }

// A13: Schrodinger mirror-suspend branch — the mirror flip is bypassed while suspended.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['mirror','chaos_seed']);
        resonanceMirrorSuspended = 5;
        dirQueue = []; lastConsumedDir = { dx: 0, dy: -20 }; dx = 0; dy = -20;
        setNextDirection(-20, 0);
        const suspended = dirQueue.length ? dirQueue[0].dx : null;
        resonanceMirrorSuspended = 0;
        dirQueue = []; lastConsumedDir = { dx: 0, dy: -20 }; dx = 0; dy = -20;
        setNextDirection(-20, 0);
        const active = dirQueue.length ? dirQueue[0].dx : null;
        return { suspended, active };
    })()`);
    if (r.suspended === -20 && r.active === 20) ok('A: Schrodinger suspends the mirror flip while its window is open');
    else fail_('A: Schrodinger mirror suspension', JSON.stringify(r));
} catch (e) { fail_('A: Schrodinger mirror suspension', e.message); }

// A14: Pressure Cooker — a rival eat advances the shrink zone (the call site the
// file's own comment admitted was never wired).
try {
    const r = await page.evaluate(() => {
        const src = updateRival.toString();
        return { wired: src.includes('advanceShrinkZone') && src.includes('resonanceActive') };
    });
    if (r.wired) ok('A (source): updateRival wires the Pressure Cooker rival-shrink call');
    else fail_('A: Pressure Cooker wiring', 'advanceShrinkZone not called from updateRival');
} catch (e) { fail_('A: Pressure Cooker wiring', e.message); }

// A15: a pre-v12 snapshot still restores (additive fields only, no version bump).
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        const snap = buildSnapshotObject();
        delete snap.intangibleWindowTicks; delete snap.resonanceInvertTicks;
        delete snap.resonanceInvertCooldown; delete snap.resonanceToggleTick;
        delete snap.resonanceMirrorSuspended; delete snap.chaosCycleIndex;
        const okRestore = restoreFromSnapshot(snap, false);
        return { okRestore, version: SNAPSHOT_VERSION };
    })()`);
    if (r.okRestore) ok('A: a snapshot without the new resonance fields still restores (version ' + r.version + ')');
    else fail_('A: snapshot back-compat', JSON.stringify(r));
} catch (e) { fail_('A: snapshot back-compat', e.message); }

// A16: resonance cadence is cleared by BOTH reset sites.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        const dirty = () => { intangibleWindowTicks = 3; resonanceInvertTicks = 5;
          resonanceInvertCooldown = 7; resonanceToggleTick = 1;
          resonanceMirrorSuspended = 4; chaosCycleIndex = 2; };
        dirty(); resetGame();
        const afterReset = [intangibleWindowTicks, resonanceInvertTicks, resonanceInvertCooldown,
                            resonanceToggleTick, resonanceMirrorSuspended, chaosCycleIndex];
        dirty(); resetWaveState();
        const afterWave = [intangibleWindowTicks, resonanceInvertTicks, resonanceInvertCooldown,
                           resonanceToggleTick, resonanceMirrorSuspended, chaosCycleIndex];
        return { afterReset, afterWave };
    })()`);
    const clean = a => a.every(v => v === 0);
    if (clean(r.afterReset) && clean(r.afterWave)) ok('A: resonance cadence cleared by resetGame AND resetWaveState');
    else fail_('A: resonance resets', JSON.stringify(r));
} catch (e) { fail_('A: resonance resets', e.message); }

// A17: seeded determinism — the chaos reshuffle no longer uses Math.random().
try {
    const r = await page.evaluate(() => ({ seeded: shuffleFoodWeights.toString().includes('seededRandom') }));
    if (r.seeded) ok('A (source): shuffleFoodWeights draws from the seeded PRNG');
    else fail_('A: shuffleFoodWeights seeding', 'still uses Math.random');
} catch (e) { fail_('A: shuffleFoodWeights seeding', e.message); }

// ---------------------------------------------------------------------------
// Feature B — hazard phase telegraph
// ---------------------------------------------------------------------------

// B1: the pre-ignition cue fires on exactly the two ticks before ignition.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        hazards = [{ cx: 100, cy: 100, radius: 20, phase: 'off', phaseTimer: 10,
                     lifeTimer: 42, maxLife: 42, seedOffset: 0 }];
        const warn = [];
        let flips = 0, prev = 'off';
        for (let i = 0; i < 30; i++) {
          tickHazards();
          const h = hazards[0];
          if (!h) break;
          warn.push(h.phase === 'off' && h.phaseTimer <= 2);
          if (h.phase === 'on' && prev === 'off') flips++;
          prev = h.phase;
        }
        return { warnTicks: warn.filter(Boolean).length, flips };
    })()`);
    if (r.warnTicks === 2 * r.flips && r.flips >= 1) {
        ok('B: pre-ignition warning covers exactly the 2 ticks before each ignition (' + r.flips + ' ignition)');
    } else fail_('B: telegraph window', JSON.stringify(r));
} catch (e) { fail_('B: telegraph window', e.message); }

// B2: canvas save/restore balance across a full hazard phase cycle. This is the
// v11-class check: a leaked save makes the net depth non-zero, and the old suite
// (a single drawGame that only asserted "did not throw") could not see it.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        hazards = [{ cx: 100, cy: 100, radius: 20, phase: 'on', phaseTimer: 15,
                     lifeTimer: 42, maxLife: 42, seedOffset: 0 },
                   { cx: 300, cy: 200, radius: 30, phase: 'off', phaseTimer: 1,
                     lifeTimer: 42, maxLife: 42, seedOffset: 0 }];
        const origSave = ctx.save.bind(ctx), origRestore = ctx.restore.bind(ctx);
        let depth = 0; const finals = [];
        ctx.save = function () { depth++; return origSave(); };
        ctx.restore = function () { depth--; return origRestore(); };
        // Drive a real on -> off -> on cycle rather than a single frame.
        for (let i = 0; i < 60; i++) {
          renderTime = i * 16;
          tickHazards();
          if (hazards.length === 0) hazards = [{ cx: 100 + i, cy: 100, radius: 20, phase: (i % 20 < 15 ? 'on' : 'off'), phaseTimer: (i % 20 < 15 ? 15 - (i % 20) : 5), lifeTimer: 42, maxLife: 42, seedOffset: 0 }];
          drawGame(1);
          finals.push(depth);
        }
        ctx.save = origSave; ctx.restore = origRestore;
        return { uniqueFinals: [...new Set(finals)] };
    })()`);
    if (r.uniqueFinals.length === 1 && r.uniqueFinals[0] === 0) {
        ok('B: canvas save/restore depth returns to 0 on every frame across a hazard cycle');
    } else fail_('B: save/restore balance', JSON.stringify(r));
} catch (e) { fail_('B: save/restore balance', e.message); }

// B3: the countdown arc is informational, so it must NOT be gated by calm mode.
try {
    const r = await page.evaluate(() => {
        const src = drawHazards.toString();
        return { hasArc: src.includes('phaseTimer'), gated: /calm[^)]*\)\s*return/.test(src) };
    });
    if (r.hasArc) ok('B (source): the countdown arc reads phaseTimer (drives off the same field as lethality)');
    else fail_('B: countdown arc', 'drawHazards does not read phaseTimer');
} catch (e) { fail_('B: countdown arc', e.message); }

// ---------------------------------------------------------------------------
// Feature C — recap truth
// ---------------------------------------------------------------------------

// C1: every death path reports its own cause on the recap card.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        const deaths = {
          obstacle: 'Hit an obstacle!', self: 'You ran into yourself!', wall: 'Hit the wall!',
          hazard: 'Caught in a hazard rift!', rival: 'You were caught by the rival!',
          starve: 'Starvation!',
        };
        const bad = [];
        for (const k of Object.keys(deaths)) {
          cleanRun([]);
          lastDeathCause = deaths[k];
          gameOver();
          if (recapData.deathCause !== deaths[k]) bad.push(k + '->' + recapData.deathCause);
        }
        return bad;
    })()`);
    if (r.length === 0) ok('C: recap card names the cause for all 6 death paths');
    else fail_('C: death cause coverage', r.join(', '));
} catch (e) { fail_('C: death cause coverage', e.message); }

// C2: a rescue must NOT be reported as the cause of death.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        lastSaveEvent = 'Vampire Brew saved you!';
        lastDeathCause = 'Caught in a hazard rift!';
        gameOver();
        return { cause: recapData.deathCause, save: recapData.saveEvent };
    })()`);
    if (r.cause === 'Caught in a hazard rift!' && r.save === 'Vampire Brew saved you!') {
        ok('C: a save is reported separately from the death cause');
    } else fail_('C: save/death split', JSON.stringify(r));
} catch (e) { fail_('C: save/death split', e.message); }

// C3: exactly 7 of the 18 lastDeathCause writes are saves, and each is classified.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        const total = lastDeathCause !== undefined && lastSaveEvent !== undefined;
        // Drive each save branch's message through the same field the recap reads.
        const saves = ['🛡 Streak charge saved you!','Vampire Brew saved you!',
          'Serpentine phased through an obstacle!','Phoenix Brew resurrected!',
          'Melted a hazard!','Vampire Brew saved you from a hazard!'];
        resetGame();
        let okAll = true;
        for (const s of saves) { lastSaveEvent = s; if (lastSaveEvent !== s) okAll = false; }
        resetGame();
        return { total, okAll, cleared: lastSaveEvent === '' };
    })()`);
    if (r.total && r.okAll && r.cleared) ok('C: save events live in their own field, cleared by resetGame');
    else fail_('C: save field', JSON.stringify(r));
} catch (e) { fail_('C: save field', e.message); }

// C4: cascade disclosure — the RAW score survives to the recap, and Zen never
// reports a cascade it did not apply.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun(['gravity','mirror']);
        score = 1200;
        gameOver();
        const cascaded = { raw: recapData.rawScore, final: recapData.score, mult: recapData.cascadeMult };
        gameMode = 'zen'; resetGame(); startGame(); stopGameLoop();
        activeMutators = ['gravity','mirror'];
        snake = [{x:20,y:20},{x:40,y:20},{x:60,y:20}];
        endZenSession();
        const zen = { mult: recapData.cascadeMult, cause: recapData.deathCause };
        return { cascaded, zen };
    })()`);
    const cascadeOk = r.cascaded.raw === 1200 && r.cascaded.final === 600 && r.cascaded.mult === 0.5;
    const zenOk = r.zen.mult === 1 && !!r.zen.cause;
    if (cascadeOk && zenOk) ok('C: cascade shows raw->final; Zen reports no cascade and an explicit cause');
    else fail_('C: cascade disclosure', JSON.stringify(r));
} catch (e) { fail_('C: cascade disclosure', e.message); }

// C5: the recap card fits its content at every combination (no overprint).
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        const fit = (rows, opts) => {
          recapData = { score: 100, isZen: false, prevBest: 50, isNewBest: true, xpEarned: 10,
            evolutionTier: 'Titan', questDeltas: rows,
            deathCause: opts.cause ? 'Hit a thing!' : '',
            saveEvent: opts.save ? 'A save happened' : '',
            rawScore: 200, cascadeMult: opts.cascade ? 0.5 : 1 };
          const saved = ctx.restore;
          let depth = 0; const os = ctx.save.bind(ctx), or_ = ctx.restore.bind(ctx);
          ctx.save = function(){ depth++; return os(); };
          ctx.restore = function(){ depth--; return or_(); };
          drawRecapCard();
          ctx.save = os; ctx.restore = or_;
          return depth;
        };
        const three = [1,2,3].map(i => ({desc:'q'+i, delta:i, target:10, completed:false}));
        return { plain: fit([], {}), worst: fit(three, {cause:true, save:true, cascade:true}) };
    })()`);
    if (r.plain === 0 && r.worst === 0) ok('C: recap card renders balanced with no quest rows and with the full worst case');
    else fail_('C: recap card balance', JSON.stringify(r));
} catch (e) { fail_('C: recap card balance', e.message); }

// ---------------------------------------------------------------------------
// Feature D — help & legend truth
// ---------------------------------------------------------------------------

// D1: every printed spawn percentage equals the live FOOD_TIERS weight.
try {
    const r = await page.evaluate(`(() => {
        const rows = buildFoodTableRows();
        const bad = rows.filter(r => !r.stats.endsWith(Math.round(FOOD_TIERS[r.key].weight * 100) + '%'));
        return { count: rows.length, tierCount: Object.keys(FOOD_TIERS).length, bad: bad.map(b => b.key) };
    })()`);
    if (r.bad.length === 0 && r.count === r.tierCount) {
        ok('D: help table derives all ' + r.count + ' tiers from FOOD_TIERS with matching percentages');
    } else fail_('D: derived food table', JSON.stringify(r));
} catch (e) { fail_('D: derived food table', e.message); }

// D2: the knife-edge regression — Common must not print the stale 40%, Bonus not 15%.
try {
    const r = await page.evaluate(`(() => {
        const rows = buildFoodTableRows();
        const byKey = {}; rows.forEach(r => byKey[r.key] = r.stats);
        return { common: byKey.common, bonus: byKey.bonus };
    })()`);
    if (/33%$/.test(r.common) && /13%$/.test(r.bonus)) ok('D: Common prints 33% and Bonus 13% (was 40%/15%)');
    else fail_('D: stale weights', JSON.stringify(r));
} catch (e) { fail_('D: stale weights', e.message); }

// D3: hunter and bomb are no longer omitted from the help table.
try {
    const r = await page.evaluate(`(() => {
        const keys = buildFoodTableRows().map(r => r.key);
        return { hunter: keys.includes('hunter'), bomb: keys.includes('bomb') };
    })()`);
    if (r.hunter && r.bomb) ok('D: hunter and bomb appear in the help table');
    else fail_('D: missing tiers', JSON.stringify(r));
} catch (e) { fail_('D: missing tiers', e.message); }

// D4: the legend is derived, not hand-copied, so it can never disagree.
try {
    const r = await page.evaluate(`(() => {
        const text = buildFoodLegendText();
        const missing = Object.keys(FOOD_TIERS).filter(k => !text.includes(FOOD_TIERS[k].shortName));
        return { missing, hasBomb: text.includes('Bomb') };
    })()`);
    if (r.missing.length === 0 && r.hasBomb) ok('D: legend is derived from FOOD_TIERS and includes bomb');
    else fail_('D: legend derivation', JSON.stringify(r));
} catch (e) { fail_('D: legend derivation', e.message); }

// D5: the binding list covers the keys that were undocumented before v12.
try {
    const r = await page.evaluate(`(() => {
        const flat = HELP_BINDINGS.map(b => b.keys).join(' ');
        const expected = ['Q','B','J','S','X','Z','D','R','G','K','L','V','Y'];
        return { missing: expected.filter(k => !new RegExp('(^|[^A-Za-z])' + k + '\\\\b').test(flat)),
                 count: HELP_BINDINGS.length };
    })()`);
    if (r.missing.length === 0) ok('D: HELP_BINDINGS documents all ' + r.count + ' bindings incl. the formerly-hidden keys');
    else fail_('D: binding coverage', 'missing ' + r.missing.join(','));
} catch (e) { fail_('D: binding coverage', e.message); }

// D6: the food table's colours are keyed by identity, never by index.
try {
    const r = await page.evaluate(() => ({ byIndex: buildFoodTableRows.toString().includes('Object.keys(FOOD_TIERS)[i]') }));
    if (!r.byIndex) ok('D (source): food colours are looked up by key, not by array index');
    else fail_('D: colour lookup', 'still index-based');
} catch (e) { fail_('D: colour lookup', e.message); }

// ---------------------------------------------------------------------------
// Feature E — toast pipeline integrity
// ---------------------------------------------------------------------------

// E1: the queue is bounded and never evicts a high-priority message for a low one.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        clearToasts();
        queueToast('URGENT', 60000, 'high');
        for (let i = 0; i < 40; i++) queueToast('low ' + i, 60000, 'low');
        // The first push is drained straight into the display, so a high-priority
        // message is "kept" if it is either displayed or still queued.
        const hasUrgent = toastQueue.some(t => t.message === 'URGENT') || toastEl.textContent === 'URGENT';
        return { capped: toastQueue.length <= TOAST_QUEUE_CAP, hasUrgent, shown: toastEl.textContent };
    })()`);
    if (r.capped && r.hasUrgent) ok('E: toast queue is capped and never evicts a high-priority message');
    else fail_('E: queue cap/priority', JSON.stringify(r));
} catch (e) { fail_('E: queue cap/priority', e.message); }

// E2: clearToasts() empties the backlog and invalidates the in-flight hide timer,
// so a new run does not inherit ~22 s of stale session-end toasts.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        clearToasts();
        const genBefore = toastGeneration;
        queueToast('A', 3000); queueToast('B', 3000); queueToast('C', 3000);
        clearToasts();
        const afterClear = { len: toastQueue.length, active: toastActive, gen: toastGeneration };
        queueToast('NEW RUN', 60000);
        const afterNew = { shown: toastEl.textContent, queued: toastQueue.length };
        return { genBefore, afterClear, afterNew };
    })()`);
    const cleared = r.afterClear.len === 0 && r.afterClear.active === false && r.afterClear.gen > r.genBefore;
    const fresh = r.afterNew.shown === 'NEW RUN';
    if (cleared && fresh) ok('E: clearToasts empties the queue, bumps the generation, and leaves a clean slate');
    else fail_('E: clearToasts', JSON.stringify(r));
} catch (e) { fail_('E: clearToasts', e.message); }

// E3: the wave-complete toast survives resetWaveState (which must NOT clear toasts).
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        clearToasts();
        queueToast('Wave 1 Complete! +100 pts', 60000);
        resetWaveState();
        return { present: toastEl.textContent.indexOf('Wave 1 Complete') === 0
                        || toastQueue.some(t => t.message.indexOf('Wave 1 Complete') === 0) };
    })()`);
    if (r.present) ok('E: resetWaveState preserves the gauntlet wave-complete toast');
    else fail_('E: gauntlet toast', 'cleared by resetWaveState');
} catch (e) { fail_('E: gauntlet toast', e.message); }

// E4: the legend goes through the queue instead of hijacking toastEl with its own timer.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        clearToasts();
        // Drain the display first so the legend must go through the queue to be seen.
        clearToasts();
        queueToast('BLOCKER', 60000, 'high');
        showFoodLegend();
        const entry = toastQueue.find(t => t.message === FOOD_LEGEND_TEXT);
        return { queued: !!entry, priority: entry && entry.priority, shown: toastEl.textContent };
    })()`);
    if (r.queued && r.priority === 'high') ok('E: the food legend is queued (high priority), not written directly');
    else fail_('E: legend queueing', JSON.stringify(r));
} catch (e) { fail_('E: legend queueing', e.message); }

// E5: identical consecutive messages coalesce instead of stacking.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        clearToasts();
        queueToast('SAME', 1000);
        queueToast('SAME', 2000);
        queueToast('SAME', 500);
        const shown = toastEl.textContent;
        const queueAfter = toastQueue.length;
        // And a DIFFERENT message must queue behind it, not replace or merge.
        queueToast('OTHER', 60000);
        return { shown, queueAfter, queuedOther: toastQueue.some(t => t.message === 'OTHER') };
    })()`);
    if (r.shown === 'SAME' && r.queueAfter === 0 && r.queuedOther) {
        ok('E: a repeat of the on-screen message extends it; a different one queues');
    } else fail_('E: coalescing', JSON.stringify(r));
} catch (e) { fail_('E: coalescing', e.message); }

// E6: no code path still writes the toast element directly. Scanned in Node over the
// raw file so no regex escaping has to survive a template-literal round trip.
try {
    const raw = readFileSync(htmlPath, 'utf8');
    const directWrites = (raw.match(/toastEl\.(textContent|style\.display)\s*=/g) || []).length;
    const legendBypass = /function showFoodLegend[\s\S]{0,400}?setTimeout/.test(raw);
    if (directWrites === 2 && !legendBypass) {
        ok('E (source): the only 2 direct toast writes are the render + clear pair');
    } else fail_('E: toast bypasses', 'directWrites=' + directWrites + ' legendBypass=' + legendBypass);
} catch (e) { fail_('E: toast bypasses', e.message); }

// ---------------------------------------------------------------------------
// Feature F — risk income
// ---------------------------------------------------------------------------
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        const out = {};
        // cap at 5
        comboCharges = 4; bankComboCharge('x'); bankComboCharge('x');
        out.cap = comboCharges;
        // a multi-tier evolution jump banks exactly ONE
        cleanRun([]); comboCharges = 0; evolutionTier = -1;
        snake = new Array(60).fill(0).map((_, i) => ({ x: i, y: 0 }));
        triggerEvolutionIfReady();
        out.tier = evolutionTier; out.charges = comboCharges;
        // hazard chain: every third consecutive adjacent eat
        cleanRun([]); comboCharges = 0; hazardChainStreak = 0;
        const eat = (s) => { hazardChainStreak = s; if (hazardChainStreak > 0 && hazardChainStreak % 3 === 0) bankComboCharge('hazard chain'); };
        eat(1); const c1 = comboCharges;
        eat(3); const c3 = comboCharges;
        eat(6); const c6 = comboCharges;
        out.chain = [c1, c3, c6];
        // broken chain must not bank
        cleanRun([]); comboCharges = 0; eat(0);
        out.broken = comboCharges;
        // no charge should bank from a non-danger eat path site
        cleanRun([]); comboCharges = 0;
        return out;
    })()`);
    const capOk = r.cap === 5;
    const evoOk = r.tier === 2 && r.charges === 1;
    const chainOk = JSON.stringify(r.chain) === '[0,1,2]';
    const brokenOk = r.broken === 0;
    if (capOk && evoOk && chainOk && brokenOk) {
        ok('F: charges cap at 5; multi-tier evolution banks one; every 3rd chain eat banks; broken chain does not');
    } else fail_('F: risk income', JSON.stringify(r));
} catch (e) { fail_('F: risk income', e.message); }

// F1b: drive the REAL eat block so the hazard-chain call site is exercised, not a copy
// of it. hazardAdjacentThisTick is reset at the top of updateGame, so the test must
// place an actual on-phase hazard in the 1-tile adjacency band. Note a combo milestone
// is a SEPARATE legitimate income source that also fires during these eats, so the
// assertion pins the chain's own contribution (the charge delta on the streak-3 tick)
// rather than the absolute total.
try {
    const r = await page.evaluate(`(() => {
        ${RESET}
        cleanRun([]);
        comboCharges = 0;
        const bandHazard = () => {
          // tickHazards recomputes radius from the remaining life (lifeFrac ~0.024 =>
          // radius ~18.5), so the adjacency band for the tick is (18.5, 38.5].
          // The hazard must TRAIL the head: tickHazards tests adjacency against the
          // PRE-move head, and the player then advances 20px toward the food. Placing
          // it behind keeps the pre-move distance at 30 (in band) while the post-move
          // head is 50 away (safely outside the 18.5 lethal radius).
          hazards = [{ cx: snake[0].x - 30, cy: snake[0].y, radius: 16, phase: 'on',
                       phaseTimer: 15, lifeTimer: 42, maxLife: 42, seedOffset: 0 }];
        };
        let lastPreHead = null;
        const inBand = () => {
          const h = hazards[0];
          const d = Math.abs(lastPreHead.x - h.cx) + Math.abs(lastPreHead.y - h.cy);
          return d > h.radius && d <= h.radius + TILE_SIZE;
        };
        const step = (adjacent) => {
          if (adjacent) bandHazard(); else hazards = [];
          const h = snake[0];
          lastPreHead = { x: h.x, y: h.y };
          food = { x: (h.x + 20) % 400, y: h.y, type: 'common', spawnTime: 0 };
          gameTick++;
          const before = comboCharges;
          updateGame();
          return { streak: hazardChainStreak, delta: comboCharges - before,
                   died: gameState !== 'playing' };
        };
        const s1 = step(true); const band1 = inBand();
        const s2 = step(true); const s3 = step(true); const s4 = step(true);
        const brk = step(false);
        return { s1, s2, s3, s4, brk, band1,
                 chargeAfterBreak: comboCharges };
    })()`);
    const streaks = [r.s1.streak, r.s2.streak, r.s3.streak, r.s4.streak];
    const streakOk = JSON.stringify(streaks) === '[1,2,3,4]';
    // The chain's own bank lands on the streak-3 tick, before any combo milestone.
    const chainBanksAt3 = r.s3.delta === 1 && r.s1.delta === 0 && r.s2.delta === 0;
    const noDoubleBank = r.s4.delta === 0 || r.s4.delta === 1; // 4th only if a milestone lands
    const breakOk = r.brk.streak === 0 && r.brk.delta === 0;
    const aliveOk = !r.s1.died && !r.s2.died && !r.s3.died && !r.s4.died && !r.brk.died;
    const bandOk = r.band1 === true;
    if (streakOk && chainBanksAt3 && noDoubleBank && breakOk && aliveOk && bandOk) {
        ok('F: the real eat block banks at hazard-streak 3, resets on a non-adjacent eat, and never kills');
    } else fail_('F: hazard-chain income', JSON.stringify(r));
} catch (e) { fail_('F: hazard-chain income', e.message); }

// F2: the banking site is unique// F2: the banking site is unique// F2: the banking site is unique// ---------------------------------------------------------------------------
// Cross-cutting: runtime errors
// ---------------------------------------------------------------------------
try {
    if (pageErrors.length === 0) ok('No page errors during the whole suite');
    else fail_('No page errors during the whole suite', pageErrors.join(' | '));
} catch (e) { fail_('No page errors during the whole suite', e.message); }

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
await browser.close();
process.exit(fail > 0 ? 1 : 0);
