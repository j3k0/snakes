# Snakes v14 — Design Plan

> **Revision 2.** Incorporates both independent design reviews (`v14-review-1.md` correctness /
> `v14-review-2.md` game design). Every blocking finding was re-verified against `snake.html` by hand
> before being accepted; changes are marked **[R1]** / **[R2]** / **[R1+R2]** inline. Both reviews
> independently caught the same two spec-level defects (the D1 snippet that draws nothing; the D2
> gate that contradicts its own sketch) — both are fixed in this revision.
>
> Baseline: master `c3289a1`, branch `feat/v14-cycle`, `snake.html` 9675 lines, 270 assertions across
> 13 suites — all green before any edit.

## Overview

**Theme: "The board obeys its own rules — and every cue tells the truth."**

v13 made the rival *fair* (collision contract) and *legible when it arrives and dies* (telegraph,
defeat cues). The three ideation lenses converge on what is still missing: the board's relationship
to the rival (it phases through obstacles and hazards, and its meals are invisible), and surfaces
that contradict themselves (the Best line vs the recap card, the mode-select clipping its own pitch,
the death frame erasing the killer).

**Selected: 7 features, ~120 LOC production + ~90 LOC test.** No snapshot-version bump, no new
panels, no new currencies, no new modes.

### Re-verification summary

| Backlog claim | Verdict (probed on `feat/v14-cycle`) |
|---|---|
| Rival AI ignores obstacles | CONFIRMED — rival head walked 0→380 through 9 obstacle tiles; AI filter at 3526-3555 tests only body + 180° |
| Rival eat emits no cue | CONFIRMED — probe: 0 sounds/toasts/particles/floaters; eat block 3594-3630 has zero cue calls |
| Three occupancy sets | CONFIRMED **[R1] + one claim REFUTED**: `findPortalTile`'s only caller (`generateFood`, 2171) passes `currentSnake` containing `rivalCombinedSnake()` from all 7 call sites — the twin already avoids rivals at spawn (probe: 0 hits in 300 real-shape draws, 0/48 end-to-end). The REAL holes: rival *movement* onto an existing twin (uncollectable-without-death; accepted non-fix, the rival moves on) and `snapToFreeTile` (2216-2232) missing materialising telegraphs (probed: exit snaps onto a telegraph head tile). |
| Rival immune to hazards | CONFIRMED — `isHazardCollision` (4192-4200) has exactly one caller: the player path (7544) |
| Mode-select clips text | CONFIRMED **[R2, corrected arithmetic]** — **2 of 8** descriptions exceed the 440px canvas (painter 552.7px, gauntlet 517.4px — glyphs physically cut); classic 416.2 / walled 414.8 fit but exceed the ~420px usable band the fix adopts (4 of 8 clip under the new geometry). Draw at 5248 is raw centred `fillText`; help overlay already uses `fillTextClipped` (4869). |
| Persisted Best vs recap | CONFIRMED — `updateScoreDisplay` (2478-2486) persists the RAW mid-run score; `finalizeSession`'s post-cascade write (3749-3752) never wins; recap shows post-cascade (probe: best 500 vs recap 250) |
| Two rivals overlap / shared head colour | MOSTLY FIXED by v13 (bodies #B71C1C/#AD1457 at 3377) — residual: both heads `#FF5555` (6121, 6140). **[R2] scoped as feature H.** |
| `gameOver()` clears rivals before death frame | CONFIRMED — `rivals = []` at 3787, before `drawGame(1)` at 3848 |

**Already resolved in v13 — do NOT reopen:** the leech descriptor, `double_rival` draftability, the
empty-draft-pool fallback (6801), B11/B12 vacuous assertions (test-v13.mjs:853-855, 887-888), the F5
three-string HUD test (1428-1435).

---

## Feature A — The rival's meal is visible (cue pack)

**Concept.** A rival eating food is a *player-facing event* — you just lost a race — and today it is
completely silent. Give it a small, deliberately quieter cue than the player's own.

**Change** (in `updateRival`'s eat block, 3594-3630, after the food regenerates):
1. `spawnFloater(newHead.x, newHead.y, 'rival ate', '#FF8888', 12, 0.8)` — **[R2]** text is an
   event phrase (like the player's `+10` / `+30 BONUS!`), never confusable with `+pts`. The colour
   `#FF8888` is deliberate: it matches the defeat floater and the HUD's rival lines — one
   rival-red vocabulary.
2. `playSound('rival_eat')` — a NEW quiet case in `playSound` (4272+): one short low tone (196 Hz,
   0.1s, gain ramp to 0.001). Verified pitch-collision-free: no existing case uses a lone short
   196 Hz blip ('rival_warn' is a 233→196 two-tone over 0.25s; the rest of the switch sits at
   220/330/440/523/659/660/784/880/1047/1100). Grep first: no duplicate `case 'rival_eat'`
   (v12's dead-case lesson).
3. Small particle puff: `spawnParticles(newHead.x, newHead.y, 4, r.color)` — 4, not the player's
   8-18. **[R2]** Calm-mode justification corrected: there is NO system-level calm gate
   (`spawnParticles` at 4697 is ungated; calm mode gates at call sites). The decision stands
   because it matches the player's own ungated eat burst (7939) — symmetric, and 4 particles is
   beneath the calm noise floor (death fragments cap at 60 in calm).
4. `srSpeak('Rival ate')` — pairs with the existing `announceRivalIncoming`/`Rival destroyed` speech.

**Why no toast.** Toasts are the high-interruption channel (bounded queue, eviction); a rival eating
is ambient information. **[R2] Weight confirmed by measurement:** 10-18 combined rival eats/min under
double_rival, mean gap 3-6 s, both rivals eating in the same tick **0 occurrences in ~2700 ticks** —
no throttle needed.

**Hooks.** `updateRival` eat block 3594-3630; `playSound` 4272-4340 (grep for `case 'rival_eat'`
first). **[R1] Test note:** `spawnFloater` caps the array at 8 (1077-1078) — the delta assertion
must pin the fixture's floaters empty before the drive, or the splice can make the delta 0.

**LOC:** ~10.

**Scores:** Impact 5 / Feasibility 5 / Risk 1 / Synergy 5.

**Failure modes.**
- *The cue fires when the rival eats the portal epic* — the twin cleanup (3603-3605) runs in the
  same block; the cue fires for ANY food type the rival eats. The rival's eat branch handles only
  the primary `food` (the single `if (food && …)` at 3594) — verified.
- *A vacuous test.* Catch: drive one rival eat; assert the floater array delta is exactly +1 with
  text 'rival ate', the sound log contains exactly one 'rival_eat', and `particles.length` grew by
  4. Mutation: the same fixture must fail on `c3289a1`.

**Verification in the running game.** Place food on the rival's next tile, drive the tick, watch the
'rival ate' floater rise and hear the blip. Screenshot.

---

## Feature B — The rival obeys the board: obstacles and hazards

**Concept.** **The board's hazards are real for everyone standing in them.** The rival stops walking
through solid obstacles (it steers when a free move exists) and dies in an on-phase hazard rift
(like the player does).

**B1 — obstacle steering in the 1-ply filter (~6 LOC).**
The chase branch (70% path, 3484-3550) already has the machinery: `bodyHit` (3526-3536) filters
candidates against the rival's own body, with a perpendicular retry (3543) and a
`safe.length === 0 → take the blocked move` fallback (3538-3545). Add an `obstacleHit(d)` predicate
(same wrap-aware next-tile maths as `bodyHit`, testing `obstacles.some(...)`) and fold it into the
existing filters — chase branch and its perpendicular retry. The 20% straight / 10% random branches
(3551-3560) stay UNCHANGED (their only filter is the 180° reversal; the residual phase-through rate
is measured and recorded, not hidden).

**[R2] Stall risk measured away:** six per-seed paired simulations (identical PRNG, obstacle-heavy
board, 800 ticks): progress toward food identical or better in 5/6 seeds, zero stalls, obstacle
phase-throughs 1-4 per seed → **0**. The perpendicular retry + fallback machinery handles it.

**Decision (recorded):** the rival still WALKS THROUGH a blocked move when nothing is safe (existing
fallback kept byte-identical) — the v4 trapped-rival rule is NOT reintroduced. Obstacles are
*avoided when avoidable*, never fatal.

**[R1] Determinism surface stated:** B1 changes `seededRandom()` consumption on chase ticks that
previously took a blocked move — every seeded run on an obstacle board changes meaning, on ALL
seeded surfaces: the daily, diary-seed replays, and ghost-arena boards (ghosts desynchronise from
the live run). Same accepted-risk class as v13's wrap-aware separation change; named for all three.

**B2 — hazards kill the rival (~8 LOC).**
After the move commits (post-`unshift`, 3590-3592), before the eat block:

```js
// v14: the rift is lethal to everyone standing in it — the rift's lethal ring
// means what it says for every actor on the board. Credit stays false: the
// player did not ram it, and this must not pay a defeat.
if (MODE_CONFIG[gameMode].hazardsEnabled && isHazardCollision(newHead)) {
    removeRival(idx, false);
    return;
}
```

- **[R1] The `rivalFreezeMs <= 0` and `hoardActive` gates from rev 1 are DELETED — they are dead
  code.** The only call path into `updateRival` is the hoisted block at 7231, which already gates
  `!hoardActive && rivalFreezeMs <= 0 && !gauntletIntermission`; a rival executing `updateRival`'s
  body has passed them. A comment stating the call-site invariant is worth more than a dead check.
  The `hazardsEnabled` gate is LIVE (zen/walled/painter/gauntlet set it false, and the player path
  at 7127 gates on the same field) and stays.
- **[R1] Semantics corrected to post-move:** the test runs on `newHead` after the move commits —
  the same shape as the player's hazard test (7544). A rival standing in a rift at the moment of
  ignition dies **only if its next move stays inside the rift**; stepping out survives. Symmetric
  with the player; the tests are written from this sentence, not from any "ignition" claim.
- **[R1] Interaction audit (verified):** `removeRival(idx, false)` → `active=false, snake=[]` → the
  leech window (7581) and `resolveRivalRams` (3700) skip inactive rivals; `movedThisTick` was set
  before the hazard check — harmless, the leech clause re-tests `.active` first. A self-crash inside
  a rift fires `removeRival(false)` once (the self-hit return precedes it). A food tile inside an
  on-phase rift becomes a bounded rival shredder (`HAZARD_MAX_LIFE` ≈ 5s → ≤1 death per such food).
- **[R2] Player-value framing, corrected to the measured reality:** the player cannot place food and
  the rival's filter ignores rifts, so "herding" is luck, not skill. The real change is **"the board
  occasionally removes the rival for free, uncredited"** — measured ~1 death per ~2000 ticks
  (~0.25/min) on a deliberately rift-crossed path, 1 head-in-hazard visit per ~750 ticks on a
  natural 2-rift board. It is a legibility win (the rift is real for everyone), not a skill tool.
- **[R2] Live domain, stated:** B2 fires in **classic and timeAttack only** — daily/snap have
  hazards but no rival; gauntlet (the rival-heavy mode) has `hazardsEnabled: false`; zen/walled/
  painter have neither. B1's domain, for contrast, is classic + timeAttack + gauntlet waves 3-5.

**[R2] SR honesty, one line in `removeRival` (3668):** `srSpeak('Rival destroyed')` runs
UNCONDITIONALLY today — a rift death (or the pre-existing self-crash) speaks the same "Rival
destroyed" as a credited kill. Make it credit-aware:
`srSpeak(defeatedByPlayer ? 'Rival destroyed' : 'Rival destroyed itself')`. The toast is already
credit-gated; this repairs the one channel left lying, in the function B2 already routes through.

**Hooks.** `updateRival` 3484-3560 (AI), 3590-3592 (post-move), 3668 (srSpeak); AGENTS.md Rival
System section.

**LOC:** ~18.

**Scores:** Impact 4 / Feasibility 5 / Risk 2 / Synergy 5.

**Failure modes.**
- *The rival traps itself and dies to obstacles.* Cannot: obstacles are never fatal in the new
  filter; the fallback takes the blocked move and walks through, exactly as today.
- *Locally-safe-but-globally-worse chase moves.* **[R1] The real regression risk is mean
  time-to-food, not stalling** — the "no N-tick stall window" gate from rev 1 was vacuous (the
  fallback guarantees movement before and after B1, so it cannot fail). Replaced: paired-seed
  time-to-food probe (identical PRNG, obstacle board, before vs after) — mean must not regress.
- *A new credited path leaks.* The call is `removeRival(idx, false)` — grep the diff: the ONLY new
  `removeRival` call site, credit false, no `stats.rivalsDefeated` delta. Mutation check: delete the
  `false` → the credit tests must fail.
- *The hazard kill competes with the eat block.* Order matters: hazard death runs BEFORE the eat
  block, so a rival stepping into a food tile inside a rift dies rather than eats. Assert with a
  food deliberately placed inside an on-phase rift.

**Verification in the running game.** Spawn a rival next to an obstacle wall and watch it route
around (screenshots before/after); drop a rift on a rival's chase path and watch it die with the
uncredited particle burst and the 'destroyed itself' SR line. Both in the real loop.

---

## Feature C — `snapToFreeTile` respects materialising telegraphs

**Concept.** **[R1] Re-scoped from rev 1.** The spawn-time "twin lands on a rival" hole does not
exist (`generateFood` passes the combined snake). The REAL occupancy hole with player-facing
consequence: `snapToFreeTile` (2216-2232) checks only `r.active` rivals, so a portal teleport's exit
tile can snap onto a **materialising** rival's tile (probed: snapped onto a telegraph's head tile
today, active rivals correctly avoided) — putting the player inside a body that is about to become
lethal.

**Change.** In `snapToFreeTile`, replace the `rivals.some(r.active && …)` checks (2219, 2227) with
`rivalCombinedSnake()` (821-828, includes active AND materialising rivals — the same set the rival's
own spawn and the food paths use).

**Also documented as an accepted non-fix:** a rival can *move onto* an existing portal twin
(`updateRival`'s move never checks `extraFoods`; probed `onTwin: true`). The twin sits under the
rival until it moves on within a stride or two; the "collect both" contract breaks only
transiently. Recorded in AGENTS.md rather than fixed — adding extras to the rival's 1-ply filter is
a behaviour widening without evidence of harm.

**Hooks.** `snapToFreeTile` 2216-2232.

**LOC:** ~4.

**Scores:** Impact 2 / Feasibility 5 / Risk 1 / Synergy 3.

**Failure modes.**
- *Vacuous gate.* **[R1]** The rev-1 gate ("100-seed twin spawn probe never lands on a rival")
  passed trivially before AND after — replaced: a teleport exit adjacent to a materialising
  telegraph must snap OFF its tiles (50/51 probed miss today → 50/50 after).
- *Determinism.* `rivalCombinedSnake()` ordering is array-order-stable; adding rejections only
  shrinks candidate tiles, so a seeded run's exit tile can move. Accepted (same class as v13's
  wrap-aware separation).

**Verification.** Probe: construct a materialising rival on the exit tile; assert the snap lands
elsewhere. 100-seed sweep.

---

## Feature D — The two bookkeeping lies

**D1 — the mode-select screen stops clipping (~5 LOC + 2 desc strings).**
Replace the raw centred draw at 5248 with the existing `fillTextClipped` helper (4781-4794):

```js
// [R1] correct coordinates — rev 1's sketch computed avail = (CANVAS_WIDTH-20) -
// (CANVAS_WIDTH-8) = -12 and drew NOTHING for any mode. Left-anchored at x=10:
fillTextClipped(getModeDesc(mode), 10, y + 20, CANVAS_WIDTH - 10);
```

- `ctx.textAlign` must be set to 'left' before the call and restored after (the block at 5233 sets
  'center'; the idle branch's `ctx.save()` at 5222 brackets it) — existing save/restore discipline.
- **[R2] The centred→left-anchor visual change is stated:** descriptions move from centred under
  the mode name to left-aligned at x=10. Accepted — left-aligned matches the help overlay's legend
  style.
- **[R2] Trim the two overflowing `descs` strings** (getModeDesc, 1956-1969) so the ellipsis becomes
  a never-fired safety net, not the primary display:
  - painter: `'Paint the board! Trail is permanent. No self-collision. Score = coverage %.'`
    (the rev-1 ellipsis deleted "Score = coverage %" — the mode's scoring rule).
  - gauntlet: `'5 waves, unique objectives. Death ends the run!'` (deleting "Death ends the run!"
    — the mode's one unique stakes statement — was the worse loss).
  The full text stays available to the screen reader (9085, 9094, 9562).

**D2 — the persisted Best agrees with the recap (cascade correction).**
**[R1] Re-designed from rev 1.** Rev 1 moved persistence to `finalizeSession` only — both reviews
proved that LOSES the player's best on two ordinary non-final paths, because `finalizeSession` has
exactly two callers (`gameOver` 3789, `endZenSession` 3868) while:

- **Pause → Quit to Menu** (9336-9341, touch 9478) calls `resetGame(); drawGame(1);` with NO
  finalize (documented: "Restart and Quit from pause do NOT count as deaths"). Today the mid-run
  write banks the quit-time best; rev 1's design silently dropped it (probed: best 500 → run 700 →
  quit → rev-1 keeps 500, the 700 gone forever).
- **Gauntlet waves**: `score` resets per wave (`resetWaveState`, 6547) and a mid-gauntlet
  `gameOver` persists only the current wave's score (probed: `gauntletScore 400`, wave score 50 →
  persists 50 both today and under rev 1, but today the mid-run write banked each wave's best —
  150→120→death-at-50 kept 150; rev 1 kept 50).

**The actual defect is narrower than rev 1 claimed:** the disagreement exists ONLY when the cascade
multiplier is < 1 — the persisted best is the RAW score while the recap card shows the post-cascade
score. For non-cascade runs the two already agree. So the fix is a **cascade correction at
finalize**, not a persistence-timing change:

```js
// In updateScoreDisplay (2478-2486): keep EVERYTHING as-is (mid-run persist,
// live HUD Best line, toast) EXCEPT the toast gate:
if (sessionModeHighStart > 0 && score > sessionModeHighStart && !sessionNewBestAnnounced) {
    sessionNewBestAnnounced = true;
    queueToast('🏆 NEW BEST! ' + MODE_CONFIG[gameMode].name + ': ' + score, 3000);
    playSound('achievement');
}
```

- **[R2] The NEW BEST toast fires ONCE per run, at the first crossing** (`sessionNewBestAnnounced`
  flag, module state). Measured today: 19 toasts in a 40-eat record run (58 queued against a cap of
  20 — the run's other toasts are evicted or deferred for the run's duration); by toast #6 the
  channel is unread. This is an intentional, player-facing design change: **one celebration, not
  one per eat.** It also fixes the measured fresh-mode gap where the first-ever run in a mode fires
  NO toast (the `prevBest &&` term fails when `prevBest` is undefined — probed: fresh snap mode,
  best 52, zero toasts): the new gate fires whenever `score > sessionModeHighStart`, which is true
  from the first crossing in a fresh mode. The gate keeps its `sessionModeHighStart > 0` shape
  only where today's build has it; **decide: for a fresh mode (`sessionModeHighStart === 0`), the
  toast also fires** — the run most deserving of one. Persistence itself is unchanged (every
  crossing still updates `modeHighScores` live, preserving pause-quit and gauntlet banking).
- **The cascade correction** in `finalizeSession`, after the existing best write (3749-3752):

```js
// v14 D2: the mid-run best was banked from the RAW score; the cascade can lower
// it. If THIS run's mid-run write is the persisted value and the post-cascade
// score is lower, correct it so the mode-select Best agrees with the recap card.
// (Pause-quit and gauntlet wave banking are untouched — they keep the raw score,
// which is the truth for a run that never reached a cascade.)
if (sessionCascadeMult < 1 && sessionRunMaxRaw > 0 &&
    modeHighScores[gameMode] === sessionRunMaxRaw && sessionRunMaxRaw > score) {
    modeHighScores[gameMode] = Math.max(score, sessionModeHighStart);
    saveManager.setJSON('snake_mode_highs', modeHighScores);
}
```

  - `sessionRunMaxRaw` (module state, reset to 0 in `startGame()`, updated in `updateScoreDisplay`
    whenever it writes `modeHighScores[gameMode] = score`) records exactly what this run persisted.
    The equality check (`=== sessionRunMaxRaw`) guarantees the correction only fires when nothing
    else moved the value — safe by construction, not by hope.
  - `sessionLiveBest` from rev 1 is DELETED — unnecessary now (mid-run writes continue).
  - **[R1] Restore hook (3130-area):** `restoreFromSnapshot` sets
    `sessionNewBestAnnounced = score > sessionModeHighStart` and
    `sessionRunMaxRaw = Math.max(sessionModeHighStart, score)` — so a resumed run neither re-fires
    the toast below the crossing ([R2 R-12]) nor fails to correct the cascade at its end.
  - Zen: `sessionCascadeMult = 1` (3864) → the correction no-ops. Gauntlet: cascade is limited to
    1 mutator (2656) → mult 1 → no-op. The correction only fires where the disagreement exists.
  - The recap's `isNewBest` (3907-3909) reads `sessionModeHighStart` — unchanged.

**Scores:** D1 Impact 2 / Feasibility 5 / Risk 1 / Synergy 2. D2 Impact 3 / Feasibility 4 / Risk 2 /
Synergy 3.

**Failure modes.**
- *Toast regressions.* **Catch:** a record run fires exactly ONE toast (mutation: delete the flag →
  19); a fresh-mode run (start best 0) fires one; a resume-then-eat does not re-fire.
- *Pause-quit still banks.* **Catch:** start best 500, run to 700, quit → persisted 700 (unchanged).
- *The correction never fires or over-fires.* **Catch:** 2-mutator run, raw 100 → cascade 0.5 →
  persisted best corrects 100 → 50 at death, recap shows 50: agreement. A no-mutator run
  (mult 1) → no correction. A run that quits early with a cascade drafted → correction does not
  fire (no finalize) — the persisted value stays raw, matching what the quit saved.
- *D1 re-clips or vanishes.* **[R2]** Assert POSITIVELY: all 8 modes produce a drawn description
  (the rev-1 gate passed vacuously on the broken sketch), and none extends beyond
  `CANVAS_WIDTH - 10` (text-metrics probe at 13px).

---

## Feature E — srSpeak queue depth 2

**Concept.** `srSpeak` (1085-1093) holds ONE pending slot: a second message inside the 500ms window
overwrites the first. v13's new rival speech (3455, 3668) makes collisions *likely* — 'Ate Common…'
regularly eats the rival warning. Depth 2 is the minimal honest fix.

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
- *Ordering.* FIFO: fire 'Ate Common' then 'Rival incoming' inside one window → **[R1] the test
  drives TWO real drain ticks** (force `lastSrSpeak` back, wait one interval tick per message,
  ~1000ms wall — acceptable for a test) and asserts `srAnnounce.textContent` receives the queued
  messages in order. No "read the interval's logic" (that is source-text by another name).

---

## Feature F — The death frame keeps its rival

**Concept.** `gameOver()` clears `rivals = []` (3787) before `drawGame(1)` (3848), so the frame that
killed you shows no rival — the screen contradicts the recap card's own cause string.

**[R1] Mechanism changed to a frame-scoped copy.** Rev 1 moved the clear after the first draw, but
its own failure-mode premise was false: **the Escape-at-gameover path (9229-9234) reaches idle
WITHOUT `resetGame()`** (`gameState = 'idle'; closeAllPanels(); updateMenuFooter(); drawGame(1);`).
Probed: after a post-draw clear, the idle screen renders the dead rival dimmed through the 0.75
scrim on any played-before profile — a new ghost bug on a path that is clean today. The
frame-scoped copy has no idle-path coupling:

```js
// gameOver(), before the clear:
deathRivals = rivals.map(function (r) { return { snake: r.snake.slice(), color: r.color, active: r.active }; });
rivals = [];   // (unchanged — stays where it is today, 3787)
```

`deathRivals` (module-scope `let`, declared beside `recapData` at 766) renders in `drawRival`
(6110) ONLY when `gameState === 'gameover'` (`var list = gameState === 'gameover' ? deathRivals :
rivals`); every other state renders `rivals` as today. Reset in `resetGame()` (2378) AND
`resetWaveState()` (both reset sites rule — though gauntlet gameover uses the wave overlay, the
reset is cheap insurance). The recap card overlays the board centre — the rival is visible on the
board area outside the card (probed: pixel delta `[254,85,85]` vs `[25,25,25]` at a rival tile),
which is the point: the frame that killed you shows what killed you.

**[R1] Verified safe:** `saveReplay`, `checkAchievements`, `checkDailyCompletion`,
`checkStatMilestones`, `checkQuestProgress`, `buildRecapData`, `saveDiaryEntry` — none reads
`rivals` (probe on `.toString()` of each). The update-loop exit invariant is the
`gameState !== 'playing'` return plus `stopGameLoop` (3769), not the array clear.

**LOC:** ~8.

**Scores:** Impact 2 / Feasibility 4 / Risk 2 / Synergy 2.

**Failure modes.**
- *A stale rival appears on the idle screen.* Cannot: the render is gated on `gameState ===
  'gameover'`, and idle is a different state regardless of which path reaches it (Escape included).
  **Catch:** drive gameOver with a live rival, press Escape, assert no rival pixels on the idle
  frame.
- *A hidden reader of `rivals` during gameover.* None (the audit above); the defeat increment
  lives inside `removeRival`, reachable only from the tick loop, which is stopped.
- *Vacuous assertion.* The gate is a pixel-level one: with `deathRivals` populated, a rival tile
  outside the card box renders `[254,85,85]`; with the feature reverted, `[25,25,25]`.

---

## Feature G — Truth pass: tests and docs

**Concept.** The outside-view lens re-ran all 13 suites (270 green) and found the surviving weak
assertion class v13's reviews hunted, plus AGENTS.md drift. The cheapest insurance in the cycle.

**G1 — test repairs (~40 test LOC):**
1. `test-v12.mjs:619-637` (C3): title promises "exactly 7 of 18 lastDeathCause writes are saves";
   body asserts `!== undefined` twice and hand-assigns strings. **[R1]** C2 directly above (605-612)
   already drives the split behaviourally — **C3 is deleted** rather than duplicated; its
   classification promise is unimplementable without re-driving the same branches C2 covers.
2. `test-bugfixes.mjs:98-102` (B3): `typeof startGame === 'function'` — replace with value asserts
   (`MODE_CONFIG` has 8 modes; `getModeDesc('painter')` returns a non-empty string).
3. `test-feature-d.mjs:70-73`: `typeof f.spawnTime === 'number'` tautology (field set
   unconditionally at 2136/2161) — replace with a value-range assert (spawnTime within the last
   tick's window) or delete if the surrounding test covers the pop behaviour.
4. test-v10/v11 source-substring asserts (`src.includes('0.30')` etc.): convert the v11
   streak-mult one to a behavioural check where cheap; delete rather than keep a string match.
   (Scope: only the 4 named sites.)

**G2 — AGENTS.md repairs (4 verified drift sites):**
1. **[R1] Section re-anchored by line, not title:** the false H-key claim lives under "State
   Management — Specific Bypasses" (AGENTS.md:160-162), NOT "First-Time Onboarding" (which already
   states the correct behaviour). Fix: `snake.html` 9278-9288 guards `if (gameState !== 'idle')
   return;` — the documented mid-game hazard is already fixed; rewrite the bullet to the real
   behaviour.
2. "Dual Render Loops" first paragraph still describes a `setInterval` game loop; the loop is the
   setTimeout chain (281-296); the only surviving `setInterval` is the srSpeak drain (1094).
3. "Code Clarity — playSound() Switch Case": only one `case 'combo_milestone'` exists (4343); the
   note's cited lines don't resolve. Mark historical or delete.
4. **[R1] New:** AGENTS.md:512 claims "`test-v12.mjs` asserts zero overflow at 1.0x/1.15x/1.35x
   simulated font widths" — no such test exists in test-v12.mjs. Same drift species; fix or delete
   the claim.
5. **[R2] Deferred to after the features (see build order):** the v14 section itself (Feature H's
   eat cue, obstacle steering, hazard lethality, the cascade correction, the snap fix, srSpeak
   depth, the death-frame rival, the head colours) — each with its accepted-behaviour notes and the
   deliberate non-fixes. Writing it first would document behaviour the tree does not have.

**[R2] Also noted (no action, verified):** the "dashed-amber ring" vocabulary in old docs is v10-era
— the current lethal rift is a violet radial gradient with a solid purple border; the dashed
ORANGE ring is the pre-ignition keyframe only (drawHazards, 5455-5485). G2's v14 section uses the
correct current vocabulary.

**LOC:** ~0 prod, ~50 test/doc.

**Scores:** Impact 4 / Feasibility 5 / Risk 1 / Synergy 5.

**Failure modes.**
- *A G1 rewrite cannot fail.* Mutation-test each rewritten assertion against the pre-fix behaviour.
- *G2 over-corrects.* Only rewrite what was verified by reading THIS tree; every doc change cites
  the current line.

---

## Feature H — Per-rival head colours (2 LOC)

**[R2] Added from review 2 R-9.** Both rivals' heads render `#FF5555` (6121, 6140) — under
`double_rival` the most-watched tile on the board is the one part of the pair the player cannot
tell apart (bodies are already distinct: `#B71C1C` / `#AD1457`, 3377). Fix: derive the head colour
per rival from its body colour (e.g. a per-rival `headColor` constant: `#FF6655` for rival 0,
`#FF66AA` for rival 1 — same brightness, distinct hue, both off the food axis). Two `fillStyle`
lines in `drawRival`; assertable (two rivals render different head colours) and in-theme
(identical actors must be distinguishable).

**LOC:** ~4 (2 render + 2 constant).

**Scores:** Impact 2 / Feasibility 5 / Risk 1 / Synergy 3.

---

## Deliberate non-fixes (recorded, with the evidence, per the ground rules)

1. **The full three-occupancy-set consolidation.** `findFreeTile`'s options object is load-bearing
   for five save/obstacle callers (AGENTS.md v13); a shared predicate is a separate project. v14
   closes only the player-facing hole (`snapToFreeTile` telegraphs).
2. **A rival moving onto an existing portal twin** (`updateRival`'s move never checks
   `extraFoods`) — probed real (`onTwin: true`), but the twin is uncollectable only until the rival
   moves on; adding extras to the 1-ply filter is a behaviour widening without evidence of harm.
   **[R1]** Replaces rev 1's false Feature C premise.
3. **The gauntlet wave-completing extra rival move** and **the `⚠ Rival in 0.0s` deferral display** —
   both documented accepted behaviour (AGENTS.md:121-122).
4. **Frozen-rival board cue (legibility L3).** **[R2] The one contested drop, recorded as a cost:**
   the freeze is decision-relevant (~15s per hoard cycle in hoard modes + the 5s Pigment Rush
   climax) and a motionless-but-lethal rival looks live. Deferred for a real reason — the wording
   discipline ("information, not a safety claim") needs its own legend pass — but the theme
   knowingly pays this cost in hoard modes. Recorded in the v14 AGENTS section.
5. **CVD palettes for the rival** (L9) and **double_rival HUD second line** (L10) — additive,
   deferred; recorded.
6. **Two rivals pass through each other** during play — spawn-time separation exists; per-tick
   mutual collision is a new rule with no evidence of harm.
7. **Rival hoard (mechanics Idea G)** — needs a balance playtest; wrong cycle.
8. **The `highScore` global write** in `updateScoreDisplay` (2488-2489) — kept as-is; the global
   best is cascade-agnostic and aligning it is a separate decision.

## Build order and gates

**[R2] Revised:** A lands first (the highest felt-impact line, independent of G); the G1 test
repairs and the three pre-v13 G2 doc fixes land with or right after A; **G2.4 (the v14 AGENTS
section) moves to the END** — documenting behaviour the tree does not have is the exact defect G2
purges, inverted.

| # | Step | Gate |
|---|---|---|
| 1 | **A** rival eat cue | floater delta +1 (floaters pinned empty first), one 'rival_eat', 4 particles; mutation-verified against `c3289a1` |
| 2 | **G1 + G2.1-4** truth pass | rewritten assertions fail against the pre-fix behaviour; 13 suites green |
| 3 | **B** obstacle steer + hazard kill + SR credit line | paired-seed time-to-food no regression; hazard death uncredited + 'destroyed itself'; full suite green |
| 4 | **C** snap telegraphs | teleport exit near a telegraph snaps off its tiles (50/50 probe) |
| 5 | **D1** mode-select clip | all 8 descriptions DRAW and fit (positive + bounds probe at 13px) |
| 6 | **D2** cascade correction + once-per-run toast | quit-paths still bank; cascade runs correct 100→50; exactly one NEW BEST toast per run; resume does not re-fire |
| 7 | **E** srSpeak depth | FIFO order asserted over two real drain ticks, cap 2 |
| 8 | **F + H** death-frame rival + head colours | pixel gate (rival visible on gameover frame, absent on idle); two rivals render distinct head colours |
| 9 | **G2.5** v14 AGENTS section | documents the shipped tree, cites current lines |
| 10 | Live-game pass | drive the real loop in Chromium: rival eats visibly, steers visibly, dies in rifts; screenshots |

A, B are the *board-truth* gate; C, D, E, F, H the *claim-truth* gate; G the *evidence* gate.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| The B2 hazard kill changes rival presence | Low | Live domain classic+timeAttack only (gauntlet has no hazards; daily/snap have no rival); uncredited; measured ~0.25/min ceiling. |
| B1 changes every seeded outcome on obstacle boards | Medium | No new `Math.random()` (grep the diff); seeded suites re-run; the daily + diary replays + ghost arena change meaning — accepted and named, same class as v13's wrap-aware separation. |
| D2's correction fires on a run it should not | Medium | The `=== sessionRunMaxRaw` equality guard; per-run reset in `startGame` + restore; zen/gauntlet mult 1 no-op. Full suite green. |
| F leaks a stale rival into idle | Low | Frame-scoped copy, render-gated on `gameState === 'gameover'`; no idle-path coupling (rev 1's defect). |
| New sound case collides | Low | Grep for duplicate `case 'rival_eat'`; 196 Hz short blip vs the existing set. |
| Tests that cannot fail | High if unchecked | Step 2 exists for exactly this; every new assertion mutation-checked. |

## Nothing else

No new game modes, currencies, DOM panels (the 7-site cross-hide contract untouched), food tiers,
dependencies or backend. `SNAPSHOT_VERSION` NOT bumped — v14 adds **zero snapshot fields**:
`sessionNewBestAnnounced` and `sessionRunMaxRaw` are per-run module state re-derived at
`startGame()` and on snapshot restore; `deathRivals` is frame-scoped visual state reset in
`resetGame()`. Both reset sites and both session-end hooks honoured by construction. AGENTS.md gains
the v14 section (G2.5).