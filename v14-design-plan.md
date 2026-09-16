# Snakes v14 — Design Plan

> **Revision 1.** Written after three independent ideation passes (`v14-ideas-mechanics.md`,
> `v14-ideas-legibility.md`, `v14-ideas-outside.md`). Every backlog claim was re-verified by at least
> one live Playwright probe or a line-cited read before selection; corrections are marked inline.
> Baseline: master `c3289a1`, branch `feat/v14-cycle`, `snake.html` 9675 lines, 270 assertions across
> 13 suites — all green before any edit.

## Overview

**Theme: "The board obeys its own rules — and every cue tells the truth."**

v13 made the rival *fair* (collision contract) and *legible when it arrives and dies* (telegraph,
defeat cues). The three ideation lenses converge on what is still missing, and they name it three
ways:

- Mechanics: *"the board is a place, not a backdrop"* — the rival phases through obstacles and
  hazards, and its meals are invisible.
- Legibility: *"nothing on the board lies by omission"* — frozen rivals look live, a rival eat is
  silent, the mode-select clips its own pitch, the persisted Best disagrees with the recap card.
- Outside view: *"make every invisible event visible, and every visible claim true"* — tests that
  cannot fail, docs that describe fixed bugs, a portal twin that ignores the rival.

Unifying these: **the rules the player lives by must visibly bind every actor, and every cue a
surface emits must be true.** That is a consolidation cycle: small, verifiable, additive — the
deliberate v13 leftovers rather than new systems.

**Selected: 7 features, ~120 LOC production + ~90 LOC test.** No snapshot-version bump, no new
panels, no new currencies, no new modes.

### Re-verification summary (what the lenses confirmed)

| Backlog claim | Verdict (probed on `feat/v14-cycle`) |
|---|---|
| Rival AI ignores obstacles | CONFIRMED — rival head walked 0→380 through 9 obstacle tiles (`updateRival` never reads `obstacles`; AI filter at 3526-3555 tests only body + 180°) |
| Rival eat emits no cue | CONFIRMED — probe: 0 sounds/toasts/particles/floaters; eat block 3594-3630 has zero cue calls |
| Three occupancy sets | CONFIRMED + one NEW hole: `findPortalTile` (2189-2214) never checks rivals at all — a portal twin can rest on a live rival's body |
| Rival immune to hazards | CONFIRMED — `isHazardCollision` (4192-4200) has exactly one caller: the player path (7544) |
| Mode-select clips text | CONFIRMED and WIDENED — probe: 4 of 8 descriptions exceed the 440px canvas (classic 416.2, walled 414.8, painter 552.7, gauntlet 517.4); draw at 5248 is raw centred `fillText` while the help overlay already uses `fillTextClipped` (4869) |
| Persisted Best vs recap | CONFIRMED — `updateScoreDisplay` (2478-2486) persists the RAW mid-run score; `finalizeSession`'s post-cascade write (3749-3752) never wins; recap shows post-cascade (probe: best 500 vs recap 250) |
| Two rivals overlap / shared head colour | MOSTLY FIXED by v13 (bodies #B71C1C/#AD1457 at 3377; sibling spawn checks 3429-3431) — residual: both heads `#FF5555` (6121, 6140); movement pass-through remains [INFERENCE: rare] |
| `gameOver()` clears rivals before death frame | CONFIRMED — `rivals = []` at 3787, before `drawGame(1)` at 3848 |

**Already resolved in v13 — do NOT reopen:** the leech descriptor, `double_rival` draftability, the
empty-draft-pool fallback (6803-6804), B11/B12 vacuous assertions (repaired at test-v13.mjs:853-855,
887-888), the F5 three-string HUD test (1428-1435).

---

## Feature A — The rival's meal is visible (cue pack)

**Concept.** A rival eating food is a *player-facing event* — you just lost a race — and today it is
completely silent. Give it a small, deliberately quieter cue than the player's own.

**Change** (in `updateRival`'s eat block, 3594-3630, after the food regenerates):
1. `spawnFloater(newHead.x, newHead.y, 'rival', '#FF8888', 12, 0.8)` — text, not points, so it can
   never be confused with the player's own `+pts` floaters.
2. `playSound('rival_eat')` — a NEW quiet case in `playSound` (4272+): one short low tone (196 Hz,
   0.1s, gain ramp to 0.001). Verified pitch-collision-free: the existing cases use 220/330/440/523/
   660/784/880/1047/1100 Hz and 'rival_warn' holds 233/196 in a two-tone 0.25s shape — a single short
   196 blip reads differently. Grep first: no duplicate `case 'rival_eat'` (v12's dead-case lesson).
3. Small particle puff: `spawnParticles(newHead.x, newHead.y, 4, r.color)` — 4, not the player's
   8-18, and NOT calm-gated individually (the whole rAF particle system is already the calm surface);
   keep it symmetric with `drawRival`'s existing approach.
4. `srSpeak('Rival ate')` — pairs with the existing `announceRivalIncoming`/`Rival destroyed` speech.

**Why no toast.** Toasts are the high-interruption channel (bounded queue, eviction); a rival eating
is ambient information, not an event the player must act on. Floater + quiet blip + board particles
is the right weight.

**Hooks.** `updateRival` eat block 3594-3630; `playSound` 4272-4340 (grep for `case 'rival_eat'`
first — v12 found dead duplicate cases in this switch).

**LOC:** ~10.

**Scores:** Impact 5 / Feasibility 5 / Risk 1 / Synergy 5.

**Failure modes.**
- *Floater spam under double_rival.* Both rivals eating in one tick = two floaters. Acceptable (they
  are on different tiles, and the player's own eat can also produce several); no throttle needed at
  2 rivals max.
- *The cue fires when the rival eats the portal epic* — the twin cleanup (3603-3605) runs in the same
  block; the cue should fire for ANY food type the rival eats, including epics and hoard foods
  (`extraFoods` are eaten at 8140 area by the player only — verify the rival's eat branch only
  handles the primary `food`; it does: the single `if (food && …)` at 3594).
- *A vacuous test.* Catch: drive one rival eat; assert the floater array delta is exactly +1 with
  text 'rival', the sound log contains exactly one 'rival_eat', and `particles.length` grew by 4.
  Pre-fix (mutation): assert the same fixture fails on `c3289a1`.

**Verification in the running game.** Place food on the rival's next tile, drive the tick, watch the
'!' floater rise and hear the blip. Screenshot.

---

## Feature B — The rival obeys the board: obstacles and hazards

**Concept.** Two changes, one idea: **the board's hazards are real for everyone standing in them.**
The rival stops walking through solid obstacles (it steers when a free move exists) and dies in an
on-phase hazard rift (like the player does). Both were v13's recorded v14 candidates; both probes
confirmed they are still live.

**B1 — obstacle steering in the 1-ply filter (~6 LOC).**
The chase branch (70% path, 3484-3550) already has the machinery: `bodyHit` (3526-3536) filters
candidates against the rival's own body, with a perpendicular retry (3543) and a
`safe.length === 0 → take the blocked move` fallback (3538-3545). Add an `obstacleHit(d)` predicate
(same wrap-aware next-tile maths as `bodyHit`, testing `obstacles.some(...)`) and fold it into the
existing filters:

- chase branch: `var safe = possible.filter(function(d) { return !bodyHit(d) && !obstacleHit(d); });`
  and the perpendicular retry likewise.
- 20% straight / 10% random branches (3551-3560): leave UNCHANGED. Their only filter is the 180°
  reversal today; widening their contract is the beginning of a rewrite, and the chase branch covers
  70% of decisions. The residual "walks through an obstacle" rate drops from ~100% of obstacle-axis
  moves to only the non-chase branches' unlucky picks — measured and recorded, not hidden.

**Decision (recorded):** the rival still WALKS THROUGH a blocked move when nothing is safe (existing
fallback, 3538-3545 kept byte-identical) — the v4 trapped-rival rule is NOT reintroduced; a walled-in
rival keeps its "spirit" escape hatch. Obstacles are *avoided when avoidable*, never fatal.

**B2 — hazards kill the rival (~8 LOC).**
After the move commits (post-`unshift`, 3590-3592), before the eat block:

```js
// v14: the rift is lethal to everyone standing in it — the dashed-amber cue
// means what it says for every actor on the board. Credit stays false: the
// player did not ram it (this is a NEW counterplay tool — herd it in — and
// must not pay a defeat).
if (MODE_CONFIG[gameMode].hazardsEnabled &&
    isHazardCollision(newHead) && rivalFreezeMs <= 0) {
    removeRival(idx, false);
    return;
}
```

- Gated on `rivalFreezeMs <= 0` for symmetry with the freeze that gates the rival's movement — a
  frozen rival is not adjudicated against hazards on a tick it did not act.
- NOT gated on `hoardActive`: hazards don't spawn/lethality doesn't change during the hoard, and
  `updateRival` itself is already skipped wholesale when `hoardActive` (7231), so the guard inside is
  unreachable then; keep it anyway for direct-call parity with the freeze gate.
- The check runs on `newHead` AFTER the move commits (post-pop, post-self-test) — so it is the
  rival's real post-move position, mirroring how the player's hazard test (7544) runs on the
  post-move head. A rival standing in a rift at the moment of ignition dies there — that is the
  point; the pulse cycle is the telegraph for both actors.
- `removeRival(idx, false)` — uncredited, exactly the self-crash semantics (3586). The particle burst
  (3653) fires from `removeRival`'s existing `r.active && snake.length > 0` branch.

**What changes for the player.** A rift becomes a rival-removal tool the player can bait — genuine
counterplay, never credited, so no RIVAL_SLAYER inflation. AGENTS.md's "the rival stays immune to
obstacles and hazards" section (recorded as the v14 candidate) is rewritten: obstacles = steer;
hazards = lethal; the "spirit" statement narrows to the blocked-move fallback only.

**Hooks.** `updateRival` 3484-3560 (AI), 3590-3592 (post-move); AGENTS.md Rival System section.

**LOC:** ~16.

**Scores:** Impact 4 / Feasibility 5 / Risk 2 / Synergy 5.

**Failure modes.**
- *The rival traps itself and dies to obstacles.* Cannot: obstacles are never fatal in the new
  filter; the fallback takes the blocked move and walks through, exactly as today.
- *Oscillation stall.* The chase branch could ping-pong between two obstacle-blocked axes.
  **Catch:** 200-tick probe on an obstacle-heavy board — the rival's mean progress toward food must
  not regress vs today's build; assert no N-tick window with zero tiles advanced beyond the cadence
  skips (stride is length-derived; at length 3 the rival must advance on every stride-1 tick where a
  free axis exists).
- *The hazard kill competes with the eat block.* Order matters: hazard death runs BEFORE the eat
  block, so a rival stepping into a food tile inside a rift dies rather than eats. The rift ignites
  for everyone; no special case. Assert with a food deliberately placed inside an on-phase rift.
- *A new credited path leaks.* The call is `removeRival(idx, false)` — grep the diff: the ONLY new
  `removeRival` call site, credit false, no `stats.rivalsDefeated` delta. Mutation check: delete the
  `false` → suite must fail (B-series credit tests).
- *Frozen-rival hole.* `rivalFreezeMs <= 0` gate means a frozen rival in an igniting rift survives
  that tick and dies on the first post-freeze move tick. Bounded (freeze ≤ 3s), visually consistent
  (it is not acting), documented.

**Verification in the running game.** Spawn a rival next to an obstacle wall and watch it route
around (screenshots before/after); drop an on-phase rift on a rival and watch it die with the
uncredited particle burst. Both in the real loop.

---

## Feature C — One occupancy truth for the portal twin

**Concept.** `findPortalTile` (2189-2214) is the only spawner that never checks `rivals` — a portal
twin can rest on a live rival's body tile, and the player's "collect both" contract for epics breaks
(the twin is uncollectable-without-death until the rival moves). This is the *one* consolidation
this cycle; the full three-set unification (backlog #3) stays out of scope (see Deliberate
non-fixes).

**Change.** One predicate added to `findPortalTile`'s scan:

```js
if (rivalCombinedSnake().some(function (rs) { return rs.x === tx && rs.y === ty; })) continue;
```

`rivalCombinedSnake()` (821-828) includes active AND materialising rivals — the same set the rival's
own spawn and the food spawn paths use. This makes the twin's occupancy set a superset-correct
version of the hoard/echo sets: snake + obstacles + food + food2 + powerUp + extraFoods + on-phase
hazards + **rivals (live or materialising)**.

Also fix `snapToFreeTile` (2216-2232) the same way: its `rivals.some(r.active && …)` check misses
materialising telegraphs — swap to `rivalCombinedSnake()`. The exit tile of a portal teleport
landing on a telegraph's tile would put the player inside a body that is about to become lethal.

**Hooks.** `findPortalTile` 2189-2214; `snapToFreeTile` 2216-2232.

**LOC:** ~4.

**Scores:** Impact 2 / Feasibility 5 / Risk 1 / Synergy 3.

**Failure modes.**
- *Determinism shift.* `rivalCombinedSnake()` ordering is array-order-stable; `seededRandom()` picks
  from `candidates` — adding rejections only shrinks the candidate list, so a daily run's twin tile
  can move to a different free tile. Accept: portal twins are rare events and the daily leaderboard
  compares runs on the same board definition, which is changing deliberately (same reasoning as
  v13's wrap-aware separation change).
- *A crowded board loses portal spawns.* `findPortalTile` returns null → the epic simply spawns
  without a twin (existing behaviour at 2202-2212; callers handle null). No new failure mode.

**Verification.** Probe: construct a rival whose body covers the epic's chosen twin tile candidates;
assert the twin never spawns on a rival segment over 100 seeded spawns.

---

## Feature D — The two bookkeeping lies

**D1 — the mode-select screen stops clipping (~5 LOC).** Replace the raw centred draw at 5248 with
the existing `fillTextClipped` helper (4781-4794, established pattern, measured at draw time):

```js
fillTextClipped(getModeDesc(mode), CANVAS_WIDTH - 8, y + 20, CANVAS_WIDTH - 20);
```

Note the coordinate change: `fillTextClipped` is LEFT-anchored (it measures a prefix against
`maxX - x`), while today's call is centre-anchored. Measured: classic 416.2px, walled 414.8px,
painter 552.7px, gauntlet 517.4px vs a 440px canvas — 4 of 8 descriptions clip. Left-anchored at
x=10 with maxX=CANVAS_WIDTH-10 gives every description ~420px before the ellipsis; painter/gauntlet
ellipsise, the rest render whole. The full text stays available to the screen reader (9085, 9094,
9562). `ctx.textAlign` must be set to 'left' before the call and restored after (the block at 5233
sets 'center' for the title) — wrap the change in the existing save/restore discipline.

**D2 — the persisted Best agrees with the recap (~10 LOC).**
Today `updateScoreDisplay` (2478-2486) persists the RAW mid-run score into `modeHighScores` +
localStorage on every addScore; `finalizeSession`'s post-cascade write (3749-3752) then never wins
(cascade only lowers), so the mode-select shows a pre-cascade Best while the recap card shows the
post-cascade score. Probed: best 500, recap 250.

Fix: **persist at session end only; keep the in-run NEW BEST toast on the live comparison.**

```js
function updateScoreDisplay() {
    // v14 D2: the in-run crossing fires the toast but no longer PERSISTS — the
    // cascade can halve the raw score at gameOver, so a mid-run persist left the
    // stored Best disagreeing with the recap card by exactly the cascade factor.
    if (score > sessionLiveBest) {
        sessionLiveBest = score;
        if (sessionModeHighStart > 0 && score > sessionModeHighStart) {
            queueToast('🏆 NEW BEST! ' + MODE_CONFIG[gameMode].name + ': ' + score, 3000);
            playSound('achievement');
        }
    }
    ... // highScore lifetime + text updates unchanged
}
```

- `sessionLiveBest` is a module-scope per-run var reset in `startGame()` to
  `sessionModeHighStart`, and NOT persisted (it is display state; the snapshot does not need it —
  `finalizeSession` runs from the in-memory score, and a snapshot restore into a later run starts a
  fresh session anyway; `restoreFromSnapshot` re-derives it from `sessionModeHighStart`).
- `finalizeSession` (3749-3752) becomes the single persistence point and already writes
  post-cascade — it now actually wins, because the mid-run writes stopped. Add
  `highScoreEl.textContent` refresh at the end of `finalizeSession` so the idle Best line updates
  immediately (today `updateScoreDisplay` runs during the run; after the change the DOM would
  otherwise lag until some later call — `updateMenuFooter`/`drawGame(1)` at 3763-3764 cover the
  canvas, the DOM line needs the explicit refresh).
- `buildRecapData`'s `isNewBest` (3907-3909) reads `sessionModeHighStart` — unchanged, still correct.
- Zen: `addScore` zen branch (2007) calls `updateScoreDisplay` with `score = snake.length` — the
  toast gate `sessionModeHighStart > 0` plus zen's `isNewBest = false` precedent: zen mode does not
  compete for mode Best (its recap says so), so gate the whole best-block on
  `gameMode !== 'zen'` — actually NO: today zen DOES write `modeHighScores[gameMode]` through this
  path. Preserve that exactly: the persistence move changes WHEN zen's best is written (session end
  via `endZenSession → finalizeSession(true)`), not WHETHER. The toast gate keeps its
  `sessionModeHighStart > 0` shape.

**Scores:** D1 Impact 2 / Feasibility 5 / Risk 1 / Synergy 2. D2 Impact 3 / Feasibility 4 / Risk 2 /
Synergy 3.

**Failure modes.**
- *The NEW BEST toast breaks.* **Catch:** drive a run past the start best; assert the toast fires
  mid-run exactly once and `localStorage['snake_mode_highs']` is UNCHANGED until `finalizeSession`;
  after finalize the persisted value equals the post-cascade score.
- *The idle "Best (Mode): N" line goes stale.* **Catch:** after `finalizeSession`, read
  `highScoreEl.textContent` — it must show the post-cascade value without any further input.
- *A mid-run death with 1 mutator (no cascade).* Behaviour identical to today (best == raw ==
  final). Assert the simple case first.
- *D1 re-clips.* Assert measured widths: after the fix, no drawn description's text extends beyond
  `CANVAS_WIDTH - 10` (canvas text-metrics probe at 13px, all 8 modes).

---

## Feature E — srSpeak queue depth 2

**Concept.** `srSpeak` (1085-1093) holds ONE pending slot: a second message inside the 500ms window
overwrites the first. v13's new rival speech (3455 'Rival incoming…', 3668 'Rival destroyed') makes
collisions *likely* — 'Ate Common…' regularly eats the rival warning. The channel exists so SR users
get the same information; depth 2 is the minimal honest fix.

**Change.** `srQueue` becomes a 2-deep FIFO array drained by the existing `setInterval` (1094-1100),
one message per drain tick:

```js
let srQueue = [];                       // v14 E: 2-deep FIFO — the single slot dropped
                                        // 'Rival incoming' whenever an eat spoke in the
                                        // same 500ms window.
function srSpeak(text) {
    var el = document.getElementById('srAnnounce');
    if (!el) return;
    var now = Date.now();
    if (now - lastSrSpeak < 500) {
        if (srQueue.length < 2) srQueue.push(text);
        return;
    }
    lastSrSpeak = now;
    el.textContent = '';
    setTimeout(function() { el.textContent = text; }, 50);
}
setInterval(function() {
    if (srQueue.length && Date.now() - lastSrSpeak >= 500) {
        var msg = srQueue.shift();       // one per drain tick; the rest waits
        lastSrSpeak = Date.now();
        var el = document.getElementById('srAnnounce');
        if (el) { el.textContent = ''; setTimeout(function() { el.textContent = msg; }, 50); }
    }
}, 500);
```

Cap of 2: a third message inside a window is dropped (documented; matches `dirQueue`'s cap-2
precedent). 21 `srSpeak` call sites, zero signature changes.

**LOC:** ~8.

**Scores:** Impact 3 / Feasibility 5 / Risk 1 / Synergy 4.

**Failure modes.**
- *Queue grows unboundedly.* Capped at 2 by construction; assert `srQueue.length <= 2` after 10
  rapid calls.
- *Ordering.* FIFO: fire 'Ate Common' then 'Rival incoming' inside one window → assert the drain
  order is Ate first, Rival second, both delivered.
- *Test hooks.* The `srAnnounce` element is real DOM — assert via `textContent` timing or by
  stubbing `Date.now`; the existing throttle makes wall-clock tests flaky, so drive the queue with
  `lastSrSpeak` forced backwards and the interval's logic read directly (behavioural, not
  source-text).

---

## Feature F — The death frame keeps its rival

**Concept.** `gameOver()` clears `rivals = []` (3787) before `drawGame(1)` (3848), so the frame that
killed you shows no rival — the screen contradicts the recap card's own cause string. Move the clear
to after the first draw.

**Change.** In `gameOver()`, move `rivals = [];` from 3787 to immediately after `drawGame(1)` /
`visualDirty = true` (3848-3849). Nothing between those points reads `rivals` for game logic:
`finalizeSession` (3789) writes scores/quests, `awardXP`/`checkAchievements`/`checkDailyCompletion`
/`checkStatMilestones`/`checkQuestProgress`/`buildRecapData` read `stats`/quests, the death-fragment
loop reads `snake` only. The one reader to check: `checkAchievements(score)` — grep for `rivals` in
the achievement/quest readers first; if any reads `rivals` for a milestone (`RIVAL_SLAYER` reads
`stats.rivalsDefeated`, not the array), the move is safe. `saveReplay` (3785) — verify it does not
serialise `rivals` (it records the player's directions; grep to confirm).

**Accepted consequence (documented):** the death frame's later redraws (recap card frames from
`animateVisuals`) also show the rival until the next `drawGame(1)` from an idle-context redraw —
the rival is drawn from the stale array for the gameover duration. Deliberate: the recap card
period (~2.5s) showing the killer is the feature; the array is fully cleared on `resetGame()`
(2378) and the next `startGame()`, so no ghost leaks into a new run. **Guard:** `drawRival` renders
whenever `rivals[i].snake.length > 0` (6113) — after the run the tick loop is stopped
(`stopGameLoop` at 3769), so a dead rival cannot move; it is a frozen tableau. `drawRivalHUD`
(6421) also renders the live-length line on the death frame — acceptable, it is information the
player just used, and the recap card overlays the canvas centre, not the HUD corner.

**LOC:** ~2 (one line moved + comment).

**Scores:** Impact 2 / Feasibility 4 / Risk 2 / Synergy 2.

**Failure modes.**
- *A stale rival appears on the idle screen.* `resetGame()` clears `rivals` (2378) and every path to
  idle passes through it (`Escape` from gameover → idle goes through `resetGame` — verify; if any
  path reaches idle without `resetGame`, clear there too).
- *A hidden double-count.* Any system reading `rivals` during gameover (achievements, quests) now
  sees a stale body. **Catch:** grep every `rivals[` read outside `updateGame`/`drawRival`/
  `drawRivalHUD`/`spawnRival` and confirm none is credit-bearing (the defeat increment is inside
  `removeRival`, which only runs from the tick loop).

---

## Feature G — Truth pass: tests and docs

**Concept.** The outside-view lens re-ran all 13 suites (270 green) and found the surviving weak
assertion class v13's reviews hunted, plus AGENTS.md drift. This is the cheapest insurance in the
cycle and it protects everything above: a truth pass FIRST so the rest of the cycle is measured
against assertions that can fail.

**G1 — test repairs (~40 test LOC):**
1. `test-v12.mjs:619-637` (C3): title promises "exactly 7 of 18 lastDeathCause writes are saves";
   body asserts a field is not undefined and hand-assigns strings. Rewrite as a behavioural assert:
   drive a real save branch (vampire on a hazard, as v13's B-series does) and assert the SPLIT —
   `lastSaveEvent` names the save AND `lastDeathCause` stays empty on that tick.
2. `test-bugfixes.mjs:98-102` (B3): `typeof startGame === 'function'` — replace with a value assert
   (e.g. the load-time binding smoke stays, but assert an observable: `MODE_CONFIG` has 8 modes and
   `getModeDesc('painter')` returns a non-empty string).
3. `test-feature-d.mjs:70-73`: `typeof f.spawnTime === 'number'` tautology (the field is set
   unconditionally) — replace with a value range assert (spawnTime is within the last tick's
   window) or delete if the surrounding test already covers the pop behaviour.
4. test-v10/v11 source-substring asserts (`src.includes('0.30')`): convert the v11 streak-mult one
   to a behavioural check where cheap; where the behaviour is rAF-internal, delete rather than keep
   a string match. (Scope: only the 4 named sites; do not boil the suite ocean.)

**G2 — AGENTS.md repairs (3 verified drift sites + the v14 sections):**
1. "First-Time Onboarding"/H-key claim (AGENTS.md:161): the H-key guard claim is false —
   `snake.html` 9277-9288 guards `if (gameState !== 'idle') return;`. Rewrite the section to the
   real behaviour (the overlay is idle-gated; the documented mid-game hazard is already fixed).
2. "Dual Render Loops" first paragraph still describes the setInterval game loop; the setTimeout
   chain section contradicts it in the same file. Rewrite the older section to match the v6+
   reality (the only remaining setInterval is the srSpeak drain at 1094).
3. "Code Clarity — playSound() Switch Case": the duplicate-case note cites line numbers that no
   longer resolve and one case is gone. Mark it historical or delete.
4. Add the v14 section: the eat cue, obstacle steering (with the blocked-move fallback), hazard
   lethality for the rival, the persistence-timing change, the portal-twin occupancy set, srSpeak
   depth, the death-frame rival — each with its accepted-behaviour notes and the deliberate
   non-fixes below.

**LOC:** ~0 prod, ~50 test/doc.

**Scores:** Impact 4 (future-reader + suite integrity) / Feasibility 5 / Risk 1 / Synergy 5.

**Failure modes.**
- *A G1 rewrite cannot fail.* Mutation-test each rewritten assertion against the pre-fix behaviour
  (e.g. point the C3 rewrite at the v12 build where the save wrote into `lastDeathCause` — it must
  fail).
- *G2 over-corrects.* Only rewrite what was verified by reading THIS tree; every doc change cites
  the current line.

---

## Deliberate non-fixes (recorded, with the evidence, per the ground rules)

1. **The full three-occupancy-set consolidation.** `findFreeTile`'s options object is load-bearing
   for five save/obstacle callers (AGENTS.md v13); a shared predicate is a separate project. v14
   closes only the two holes with player-facing consequences (portal twin, snap exit tile).
2. **The gauntlet wave-completing extra rival move** and **the `⚠ Rival in 0.0s` deferral display** —
   both documented accepted behaviour (AGENTS.md:121-122). Reopening needs a reason; none on file.
3. **Frozen-rival board cue (legibility L3).** Real gap (the frozen rival looks live), but it needs a
   legend/colour decision that interacts with the deliberately-refused HUD `❄` — recorded, not
   shipped this cycle.
4. **CVD palettes for the rival** (legibility L9) — real gap, additive; deferred to keep the cycle at
   7 features. The v14 AGENTS section records it.
5. **double_rival HUD second line** (legibility L10) — the top HUD band is full; only do it with a
   measured overflow.
6. **Two rivals pass through each other** — spawn-time separation exists; per-tick mutual collision
   is a new rule with no evidence of harm. Documented in v13; unchanged.
7. **Rival hoard (mechanics Idea G)** — needs a balance playtest; wrong cycle.
8. **`updateScoreDisplay`'s highScore (global) write** — kept as-is (the global best is
   cascade-agnostic today by the same accident; aligning it is a separate decision).

## Build order and gates

| # | Step | Gate |
|---|---|---|
| 1 | **G** truth pass | rewritten assertions fail against the pre-fix behaviour; 13 suites green |
| 2 | **A** rival eat cue | floater delta +1, one 'rival_eat', 4 particles; mutation-verified against `c3289a1` |
| 3 | **B** obstacle steer + hazard kill | mean progress toward food no worse; no-stall probe; hazard death uncredited; full suite green |
| 4 | **C** portal twin occupancy | 100-seed twin spawn probe never lands on a rival segment |
| 5 | **D1** mode-select clip | all 8 descriptions render within bounds (text-metrics probe at 13px) |
| 6 | **D2** Best parity | toast mid-run once; persisted value changes only at finalize; equals post-cascade |
| 7 | **E** srSpeak depth | FIFO order asserted, cap 2, no unbounded growth |
| 8 | **F** death-frame rival | `gameOver` draw shows the rival; idle screen never does |
| 9 | Live-game pass | drive the real loop in Chromium: rival eats visibly, steers visibly, dies in rifts; screenshots |

A, B are the *board-truth* gate; C, D, E, F the *claim-truth* gate; G is the *evidence* gate and
lands FIRST.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| The B2 hazard kill changes rival presence (a rift wipe during the hoard freeze) | Low | Gated on `rivalFreezeMs <= 0`; `hoardActive` already skips `updateRival` wholesale. |
| The B1 steering changes every seeded outcome on obstacle boards | Medium | Determinism: no new `Math.random()` (grep the diff); seeded suites re-run; the daily seed changes meaning — accepted, same class as v13's wrap-aware separation. |
| D2's persistence move breaks a consumer | Medium | Callers audited: `addScore`/`updateMenuFooter`/resume — only the toast path reads the crossing; `finalizeSession` remains the sole writer. Full suite green. |
| F leaks a stale rival into idle | Medium | Verified clear paths (resetGame + every idle transition); draw-side only. |
| New sound case collides | Low | Grep for duplicate `case 'rival_eat'`; pitch 196 Hz short blip vs existing set. |
| Tests that cannot fail | High if unchecked | Step 1 exists for exactly this; every new assertion mutation-checked. |

## Nothing else

No new game modes, currencies, DOM panels (the 7-site cross-hide contract untouched), food tiers,
dependencies or backend. `SNAPSHOT_VERSION` NOT bumped — v14 adds **zero snapshot fields**
(`sessionLiveBest` is per-run module state, re-derived at `startGame`/restore; everything else reads
existing state). Both reset sites (`resetGame` + `resetWaveState`) and both session-end hooks
(`gameOver` + `endZenSession`) are honoured by construction: the only per-run state added is
`sessionLiveBest`, reset in `startGame()` and re-derived on snapshot restore. AGENTS.md gains the
v14 section (G2).