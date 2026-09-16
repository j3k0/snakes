# v14 Design Review — 1 of 2 (correctness & architecture)

> Reviewer scope: factual accuracy of `v14-design-plan.md` (rev 1) against the live tree
> (`feat/v14-cycle` @ c7dd152, `snake.html` 9675 lines), interaction risks the plan misses,
> AGENTS.md invariant violations, test-gate validity, and scope sanity.
> Method: `node test-harness-smoke.mjs` (4/4) run first; 13-suite sweep re-run green
> (bugfixes 18, bughunt 10, evolution 11, feature-d 14, gameloop 1, gameplay 5, harness-smoke 4,
> quests 21, v10 12, v11 14, v12 45, v13 96, v9 19 = 270); every load-bearing claim probed in the
> live game via throwaway Playwright scripts (19 probes, all deleted after use). Line numbers cite
> this tree, not the plan's.

## Verdict

The plan's backlog re-verification table is honest and mostly accurate, but **three of the seven
features are built on a false or half-true premise** (C, D1-as-written, F), **one has a
self-contradictory code snippet** (D1), and **two miss the consumer/regression that decides whether
the fix is worse than the bug** (D2 quit-paths, B2's hoard/rivalFreeze gating). The truth pass (G)
is sound. Minimum change set at the end.

---

## Findings

### 1. Feature C's premise is false in the real call path — the twin already avoids rivals [BLOCKING]

**Claim** (plan:184-186): `findPortalTile` (2189-2214) "is the only spawner that never checks
`rivals` — a portal twin can rest on a live rival's body tile."

**Fact.** The function itself has no `rivals` read — that half is true. But `findPortalTile` has
exactly **one caller**: `generateFood(currentSnake)` at snake.html:2171, and every one of the seven
`generateFood` call sites (2452, 3611, 6607, 7874, 8041, 8125, 8337) passes
`snake.concat(rivalCombinedSnake()).concat(extraFoods)` (or the equivalent explicit loop at 3604-3610).
`findPortalTile`'s **first rejection** (2198) is `currentSnake.some(...)` — which, with the real
argument, already rejects every live AND materialising rival tile. Probes:

- Real-caller shape (`combined = snake.concat(rivalCombinedSnake()).concat(extraFoods)`), rival
  covering 3 tiles, 300 draws of `findPortalTile`: **0 twin-on-rival hits** (non-null 300).
- End-to-end `generateFood` on a board with a 3-segment active rival, 1500 spawns, 48 epics, 48
  twins: **0 on rival**.

The earlier probe that produced "1 hit in 200" (my own and, presumably, the ideation agents')
passed a synthetic `currentSnake` that omitted rivals — a caller that does not exist on this tree.
The plan's own gate ("100-seed twin spawn probe never lands on a rival segment") will pass
trivially **both before and after** the change: it is a vacuous gate for a non-existent defect —
exactly the class G exists to delete.

**What is actually true (and small):** the twin can *end up* under a rival because
`updateRival`'s move never checks `extraFoods` — a rival walks ONTO an existing twin tile and can
sit on it (probe: rival head driven onto a placed twin, `onTwin: true`). Feature C's one-line
spawn-time predicate does nothing about that path. The player-facing consequence the plan wants
("twin uncollectable-without-death") is produced by rival *movement*, not rival *spawn*.

**Required change:** either drop Feature C, or re-scope it to the real hole — which is either
(a) document the movement overlap as an accepted non-fix (cheapest, defensible: the rival moves on
within a stride or two), or (b) add the twin tile to the rival's own 1-ply filter (same family as
B1's `obstacleHit`, and then it belongs in Feature B, not C). The `snapToFreeTile`
materialising-telegraph hole (plan:196-198) is real and worth keeping — probes confirm a portal
exit snaps onto a materialising rival's tile today (`snapped {x:300,y:200}` on a telegraph's head
tile) while an active rival is correctly avoided (`{x:320,y:200}`).

---

### 2. Feature D1's code snippet draws nothing — `avail` is negative [BLOCKING]

**Claim** (plan:231): replace 5248 with
`fillTextClipped(getModeDesc(mode), CANVAS_WIDTH - 8, y + 20, CANVAS_WIDTH - 20);`

**Fact.** `fillTextClipped` (4781-4794) computes `avail = maxX - x` and returns immediately when
`avail <= 0`. With the snippet's numbers: `avail = (CANVAS_WIDTH - 20) - (CANVAS_WIDTH - 8) =
-12` → **the description never renders at all**. Probed against the real helper: `avail: -12,
fillTextCalls: 0` — zero draws for every mode, including the four that fit today. This is a
regression from "4 of 8 clip" to "8 of 8 vanish", far worse than the bug.

The prose two lines later says "Left-anchored at x=10 with maxX=CANVAS_WIDTH-10 gives every
description ~420px" — which IS correct (probe: `avail: 420`, painter renders with an ellipsis,
`painterW 552.7 → "Paint the board! Eat food to grow. Your …"`). The snippet and the prose
disagree; the snippet is the one an implementer would paste.

**Required change:** fix the snippet to `fillTextClipped(getModeDesc(mode), 10, y + 20,
CANVAS_WIDTH - 10);` (or centred-equivalent measured bounds). Also note D1's left-anchor changes
the description's visual relationship to the selected row (today centred under the mode name,
plan left-aligned at x=10 — a design change the plan doesn't mention, likely fine but should be
stated). The plan's claim that `ctx.textAlign` must be set to 'left' and restored is correct and
necessary — today's block sets `'center'` at 5233 and `fillTextClipped` uses `fillText` under the
current alignment.

---

### 3. Feature D2 loses the best on every non-final session end — quit-mid-run, gauntlet waves [BLOCKING]

**Claim** (plan:248-266): "persist at session end only" — `updateScoreDisplay` stops writing
`modeHighScores`; `finalizeSession` becomes the sole persistence point.

**Fact.** `finalizeSession` has exactly two callers: `gameOver()` (3789) and `endZenSession()`
(3868). The plan audited `updateScoreDisplay`'s callers (2007 zen addScore, 2034 addScore, 2469
resetGame, 3178 resume) but never asked **which paths end a session WITHOUT calling
finalizeSession**. There are two, both ordinary player flows:

- **Pause → Quit to Menu** (keyboard 9336-9341 confirm branch and touch 9478): calls
  `resetGame(); drawGame(1);` — no `finalizeSession`. AGENTS.md documents this deliberately
  ("Restart and Quit from pause do NOT count as deaths (no `totalDeaths++`, no `finalizeSession()`
  call)"). Probe: start best 500, run reaches score 700, quit → today `modeHighScores.classic =
  700` (persisted mid-run at 2034→2478); under the plan it would stay **500 and the 700 is gone
  forever**. A player who beats their best then quits loses the record — the fix is worse than
  the bug for every player who uses the pause menu to leave a run.
- **Gauntlet waves.** `score` resets per wave (`resetWaveState` 6544) and `gameOver` on a
  mid-gauntlet death reads only the *current wave's* score — `gauntletScore` (the running total)
  is never what `finalizeSession` persists (probe: `gauntletScore 400`, wave score 50 at death →
  persists 50 today *and* under the plan). Today the mid-run write at least banks each wave's best
  as it happens (probe: wave scores 150 → 120 → death-at-50 → best stays 150). Under the plan the
  same run persists **50**. Same regression shape for Time Attack ("Time's up!" is fine — it goes
  through gameOver) and for the save-and-quit snapshot flow (`saveAndQuit` 3235 → resetGame, no
  finalize; the snapshot itself doesn't store `modeHighScores`, and `sessionLiveBest` is explicitly
  NOT snapshotted by the plan, so resume-then-death would re-persist from the resumed score only —
  accidentally OK, but by luck, not design).

The plan's own failure-mode table says "Callers audited: `addScore`/`updateMenuFooter`/resume" —
the audit enumerated `updateScoreDisplay`'s callers, not `finalizeSession`'s. The v13 lesson
("check every proposed fix for the fix-worse-than-bug shape") applies verbatim.

**Required change:** D2 must either (a) keep a mid-run write but write `Math.min(score,
post-cascade-equivalent)`— no, that's uncomputable mid-run; or (b) persist at session end AND at
the quit paths — which means adding `finalizeSession`-like persistence to pause-quit (a behaviour
change to the quit contract AGENTS.md documents); or (c) simplest correct fix: leave the mid-run
write in place and make `finalizeSession` overwrite with the post-cascade score when it is HIGHER
*than the raw score that was persisted* — i.e. track `sessionRawScore` and write
`modeHighScores[gameMode] = Math.max(modeHighScores[gameMode], score)` at finalize is already
there; the actual disagreement (persisted pre-cascade 100 vs recap 50) needs the finalize write to
also be able to *lower* what mid-run wrote, which requires knowing the mid-run write came from
this run. A per-run marker (`sessionPersistedRun`) or simply persisting
`score > sessionModeHighStart ? score : ...` needs design. Whichever shape: **the plan must
either drop D2 or add the quit-path/gauntlet persistence to scope** — as written it is a
player-visible regression on two documented non-final paths.

Secondary D2 notes: the toast-shape rewrite (sessionLiveBest gate) is behaviourally equivalent to
today's `prevBest` gate for the toast (verified by analysis: both fire exactly at the first
crossing of the run); zen's persistence claim (endZenSession path preserves zen writes) is
correct; the `highScoreEl` refresh in `finalizeSession` is a real need (DOM line would otherwise
lag — verified the line renders from `modeHighScores`/`highScore` at 2490-2494).

---

### 4. Feature B2's freeze gate is dead code, and the plan's own stated reason is wrong [MAJOR]

**Claim** (plan:135-138): gate the hazard kill on `rivalFreezeMs <= 0` "for symmetry with the
freeze that gates the rival's movement"; and (plan:169-171, risk register) "Gated on
`rivalFreezeMs <= 0`; `hoardActive` already skips `updateRival` wholesale."

**Fact.** Both gates are unreachable inside `updateRival`. The only call path into `updateRival`
is the hoisted block at 7231: `if (anyRivalActive() && !hoardActive && rivalFreezeMs <= 0 &&
!gauntletIntermission)`. A rival executing the body of `updateRival` has already passed
`rivalFreezeMs <= 0` — the plan admits this ("keep it anyway for direct-call parity"), but then
the *risk register* and the *failure modes* lean on the gate as if it did something ("a frozen
rival in an igniting rift survives that tick and dies on the first post-freeze move tick —
Bounded (freeze ≤ 3s)"). That sentence describes a protection the gate cannot provide: frozen
rivals never reach `updateRival` at all, today and after B2. Dead gates that are *documented as
load-bearing* are precisely the "assertion that cannot fail" disease in code form.

The real interaction to record is the opposite one the plan misses: **a rift igniting under a
frozen rival kills it on its first post-freeze move only if that move stays inside the rift**
(probe: rival at the rift edge stepping out survives — `stillActive: true`). The plan's other
sentence — "A rival standing in a rift at the moment of ignition dies there" (plan:142) — is
**false as stated**: B2 tests `newHead` after the move, so a rival standing in an igniting rift
whose next move exits the rift survives. That is symmetric with the player (whose hazard test also
runs on the post-move head, 7544) and therefore fine — but the plan should say that, not the
ignition claim. An implementer writing the test from the plan's sentence ("drop an on-phase rift
on a rival and watch it die") will write a fixture that passes by luck or fail depending on where
the fixture's food is.

**Required change:** delete the `rivalFreezeMs <= 0` and `hoardActive` gates from the snippet
(they are unreachable; a comment stating the call-site invariant is worth more than a dead check),
and correct the ignition sentence to the post-move semantics. Keep the `MODE_CONFIG[gameMode].hazardsEnabled`
gate — it is live (zen/walled/painter/gauntlet set `hazardsEnabled:false` and the player path at
7127 gates on the same field).

---

### 5. Feature B2 vs the leech/movedThisTick/resolveRivalRams interactions — safe, but plan should say why [MINOR]

Checked every interaction the assignment lists, by read + probe:

- `removeRival(idx, false)` → `r.active = false`, `snake = []` → `checkPlayerDeath`'s leech
  window is inside `if (rivals[rci].active)` (7581) → skipped; `resolveRivalRams` skips inactive
  rivals (3700) → no post-death credit. Safe.
- `movedThisTick` (3591) is set before the hazard check would run; a hazard-killed rival sets it
  then dies — harmless, the leech clause re-tests `.active` first. Safe.
- Rule 1 contact: the player's segment loop skips inactive rivals. Safe.
- Ordering vs the eat block (plan:166-168): correct — hazard death before the eat block means a
  rival stepping onto food inside a rift dies rather than eats. Also correct that the self-crash
  return (3586) precedes it, so a self-crash inside a rift fires `removeRival(false)` once.
- One subtlety the plan misses: `removeRival` fires `srSpeak('Rival destroyed')` (3668) on the
  hazard path too. A rival dying to a rift the same tick the player dies will speak "Rival
  destroyed" then "Game over..." — with Feature E's depth-2 queue both are delivered (today the
  second overwrites the first). No action needed; worth a line in the accepted-behaviour notes.

---

### 6. Feature F is internally inconsistent: the claim it cites as fixed is the path it breaks [MAJOR]

**Claim** (plan:355-392): move `rivals = []` after the first `drawGame(1)`; "`resetGame()` clears
`rivals` (2378) and every path to idle passes through it (`Escape` from gameover → idle goes
through `resetGame` — verify; if any path reaches idle without `resetGame`, clear there too)."

**Fact.** The plan asks the implementer to verify the Escape path and the answer is: **it does
NOT go through resetGame**. The handler at 9228-9234 does `gameState = 'idle'; closeAllPanels();
updateMenuFooter(); drawGame(1);` — no `resetGame()`. Same for the touch Enter-dispatch at 9537
(gameover → synthetic Enter → 9032-9035, which does `resetGame(); startGame()` — that one is
fine). Consequences, probed:

- After F, the gameover frame correctly shows the rival (probe: pixel delta at a rival tile
  outside the recap card's 320×~130 box: with-rival `[254,85,85]` vs without `[25,25,25]` — the
  rival IS the visible content; inside the card box the card paints over it, so the recap card
  hides the rival for tiles under it — the feature works only for the board area outside the
  card, which is most of it).
- **Escape at gameover → idle WITHOUT resetGame**: `rivals` still populated, `drawGame(1)` runs
  `drawRival` before `drawOverlay` → the rival renders dimmed through the idle screen's 0.75
  scrim (probe: max pixel delta at rival tile 60 (≈25% show-through) with rivals present vs
  cleared, `welcomeOverlay=false`). On a fresh profile the welcome overlay replaces the idle
  screen entirely (5224-5226), masking it — but any player who has played once sees the ghost.
  **This is a new bug F introduces on a path that today is clean**, and the plan's failure-mode
  section says the opposite ("every path to idle passes through [resetGame]").

**Required change:** F must either (a) also clear `rivals` in the 9228 Escape-at-gameover branch
(and audit any other no-resetGame idle transition), or (b) keep a frame-scoped death copy
(`deathRivals` rendered only on the gameover frame, reset in `resetGame`/`resetWaveState`) — the
mechanics ideation agent's option, ~4 LOC, no idle-path coupling. As written, F trades "death
frame shows no rival" for "idle screen sometimes shows a ghost rival" — fix worse than bug.

Also verified safe (plan's grep claims hold): `saveReplay`, `checkAchievements`,
`checkDailyCompletion`, `checkStatMilestones`, `checkQuestProgress`, `buildRecapData`,
`saveDiaryEntry` — none reads `rivals` (probe on `.toString()` of each). The update-loop exit
invariant is the `gameState !== 'playing'` return at 7121-7123 plus `stopGameLoop` at 3769, not
the array clear — the plan's implied claim there is right.

---

### 7. Feature A: cue facts verified; two details wrong [MINOR]

Verified true: the eat block (3594-3632) has zero cue calls (probe: `floatsDelta 0, partsDelta 0`
on a driven rival eat); `playSound` has no duplicate `case` labels today (`combo_milestone`
count = 1 — the v12 duplicate is gone, AGENTS.md:168-170 note is indeed stale); no
`case 'rival_eat'` exists; 196 Hz is used only inside `rival_warn`'s two-tone shape (233→196 over
0.25s), so a standalone 196 Hz 0.1s blip is distinct; `extraFoods`/hoard foods are eaten by the
player only (8139-8177) and the rival's eat branch handles only the primary `food` — plan's
parenthetical is right.

Two details to correct:

- **Plan:63 — "NOT calm-gated individually (the whole rAF particle system is already the calm
  surface)" is false.** `spawnParticles` (4697) has no calm gate (probe: source contains no
  `calmModeEffective`); the calm gates live at individual call sites (death fragments cap, F1
  hunter dust skip, F3 shockwave skip, drawFood's pop gate). The player's own eat burst (7939)
  is likewise ungated. So the rival-eat particles are consistent with the player's eat — fine —
  but the plan's justification invents a gate that doesn't exist. If calm gating is wanted,
  decide it explicitly; if not, delete the false parenthetical.
- **Plan:61 "the existing cases use 220/330/440/523/660/784/880/1047/1100 Hz"** — incomplete but
  harmless: the switch also uses 659 and 261-family only in `SYNESTHESIA_NOTES` (not playSound).
  The collision-free conclusion stands.

The Feature A gate ("floater delta +1, text 'rival', one 'rival_eat', particles +4, mutation-
verified against c3289a1") is a real, failable gate. One note: `spawnFloater` caps the array at 8
(1077-1078) — a "delta exactly +1" assertion must snapshot the array when it is below cap or the
splice can make the delta 0; pin the fixture's floaters empty before the drive.

---

### 8. Feature B1: structure verified; the stall gate as specified cannot fail [MAJOR]

Verified true: the chase branch is the 70% path (`rand < 0.7`); `bodyHit` at 3526-3536 filters
only the rival's own body; the perpendicular retry at 3543 reuses `bodyHit`; the
`safe.length === 0 → possible stays unfiltered → take the blocked move` fallback at 3538-3545 is
exactly as the plan describes; the 20% straight and 10% random branches (3552-3560) filter only
the 180° reversal; `updateRival` never reads `obstacles` (probe: source contains no
`obstacles`); a driven rival walks through 9 obstacle tiles today.

**The oscillation gate (plan:161-164) is vacuous as written.** "No N-tick window with zero tiles
advanced beyond the cadence skips… at length 3 the rival must advance on every stride-1 tick
where a free axis exists" — but the fallback *guarantees* the rival always moves (it takes the
blocked move and walks through the obstacle), and the 20%/10% branches are unfiltered, so tiles
advanced never stalls for any obstacle configuration, before or after B1. The gate cannot
distinguish the fixed build from a build where the rival circles a 2×2 obstacle pocket forever:
both advance a tile per stride tick. The actual regression risk B1 carries is different — the
chase branch may now take a *locally safe but globally worse* move (e.g. refuse the direct food
axis and oscillate between two perpendicular detours), which shows up as **mean time-to-food
regression**, not as stalling. The plan's *first* half of the gate ("mean progress toward food
must not regress vs today's build") is the real gate and is fine; the "no-stall" half should be
deleted or replaced with a time-to-food bound, otherwise it is another assertion that cannot fail.

Also worth stating in the plan: B1 changes `seededRandom()` consumption on every chase tick that
previously took a blocked move (the `possible` array it draws from can differ), so **every seeded
run on an obstacle board changes meaning** — the plan covers this for the daily (risk register,
"Medium") but the same applies to all seeded diary replays/ghost arena boards, where the ghost now
desynchronises from the live run. Same accepted-risk class as v13's separation change; just name
both surfaces.

---

### 9. Feature E: design correct; one test hook is unimplementable as described [MINOR]

Verified: `srQueue` is a single string slot (1084, 1089), the drain interval (1094-1100) is the
only `setInterval` left; the overwrite happens today (probe: two rapid `srSpeak` calls →
`srQueue === 'SECOND message'`, first lost); 21 `srSpeak` call sites (count matches the plan);
the FIFO + cap-2 shape mirrors `dirQueue`'s cap-2 precedent (4637). The proposed rewrite is
correct and the drop-the-third behaviour is honestly documented.

One correction: plan:345-347 says "assert via `textContent` timing or by stubbing `Date.now` …
drive the queue with `lastSrSpeak` forced backwards and the interval's logic read directly
(behavioural, not source-text)". "The interval's logic read directly" is source-text by another
name if it means reading the function's `.toString()`; the implementable behavioural form is:
force `lastSrSpeak` back, fire the real drain by waiting one interval tick (or wrapping
`Date.now` in `page.evaluate`), and assert `srAnnounce.textContent` ends up containing the queued
message **in order**. Two queued messages require two drain ticks (~1000ms wall) — fine for a
test, but the plan's phrase "one per drain tick" must make it into the test or the ordering
assertion will flake. Also note `srQueue` is a `let` lexical global — the test reaches it by bare
name, which `page.evaluate` supports (AGENTS.md Module Scope section).

---

### 10. Feature G: all four G1 test citations verified; G2 names the wrong AGENTS.md section [MINOR]

- `test-v12.mjs:619-637` (C3): verified — asserts `!== undefined` twice, hand-assigns strings,
  no counting. The title's "exactly 7 of 18 writes" promise is unfalsifiable by the body. The
  proposed rewrite (drive a real save branch, assert the `lastSaveEvent`/`lastDeathCause` split)
  is real; note C2 right above it (605-612) already drives exactly that split
  behaviourally — so the rewrite must differentiate (assert the *classification* of multiple
  distinct save strings through a real branch each, or simply delete C3 as covered by C2 — worth
  deciding explicitly, or G1.1 duplicates C2).
- `test-bugfixes.mjs:98-102` (B3): verified — `typeof startGame === 'function'`. The replacement
  proposal (assert `MODE_CONFIG` has 8 modes, `getModeDesc('painter')` non-empty) is a value
  assert and failable. Good.
- `test-feature-d.mjs:70-73`: verified — `typeof f.spawnTime === 'number'` after a fresh
  `generateFood`; the field is set unconditionally (2136, 2161), so it is a tautology against any
  build that has the line. Replacement proposal is reasonable.
- `test-v11.mjs:202-206`: verified — `src.includes('0.30')` and `typeof streakCharges ===
  'undefined'` are source-substring/typeof asserts. (Plan cites "v10/v11" four sites but only
  names v11's; the count is loose but the class is right.)
- G2 drift site 1: the H-key guard claim is indeed false (snake.html:9278-9288 guards
  `if (gameState !== 'idle') return;`). The plan's "AGENTS.md:161" cite is correct, but its
  *section label* is wrong: the stale bullet lives under "State Management — Specific Bypasses"
  (heading at AGENTS.md:160), not "First-Time Onboarding" (heading at 179, which itself says the
  opposite — "the welcome overlay only renders when `gameState === 'idle'`"). A G2 edit that
  greps by the section name the plan gives would rewrite the *correct* section and leave the
  stale one. Cite the section by line, not title.
- G2 drift site 2: verified — the "Dual Render Loops" first paragraph still describes a
  `setInterval` game loop; the loop is the setTimeout chain (281-296); the only surviving
  `setInterval` is the srSpeak drain (1094). True.
- G2 drift site 3: verified — only one `case 'combo_milestone':` exists (4343); the stale note's
  cited line numbers don't resolve. True.
- One more drift G2 misses (and should either fix or explicitly skip): AGENTS.md:512 claims
  "`test-v12.mjs` asserts zero overflow at 1.0x, 1.15x and 1.35x simulated font widths" — no such
  test exists in test-v12.mjs (zero `measureText`/font-scale matches; the v12 D-series tests
  check legend derivation and binding coverage, not geometry). G2's scope rule says "only rewrite
  what was verified by reading THIS tree" — this claim fails that test today and is exactly the
  same drift species as the three it does list.

---

### 11. Re-verification table spot-checks [CONFIRMED — no finding]

Load-bearing claims verified true on this tree, with probes where cheap: eat block structure
(3594-3632, zero cues — probe 3); `isHazardCollision` (4192-4200) has exactly one caller, the
player path (7544); `updateScoreDisplay` (2477-2495) persists raw mid-run and `finalizeSession`'s
post-cascade write (3749-3752) never wins when cascade < 1 (probe: persisted 100, recap
`{score:50, raw:100, mult:0.5}` — plan's "best 500 vs recap 250" scaled variant confirmed);
mode-select draws raw centred `fillText` at 5248 while the help overlay uses `fillTextClipped`
at 4869; measured widths at 13px match the plan exactly (classic 416.2, walled 414.8, painter
552.7, gauntlet 517.4 vs 440px canvas — 4 of 8 overhang); `rivals = []` at 3787 precedes
`drawGame(1)` at 3848; both heads render `#FF5555` (6121, 6140) with bodies `#B71C1C`/`#AD1457`
(3377); `snapToFreeTile` checks only `r.active` rivals (2219, 2227) and misses materialising
telegraphs (probe 50/51); the empty-draft-pool fallback is at 6801 (plan says 6803-6804 — off by
two lines but the claim holds); B11/B12 and F5 assertions are repaired and live at the cited
lines (test-v13.mjs:853-855, 887-888, 1428-1435 — verified by read); AGENTS.md:121-122 documents
the gauntlet extra move and the 0.0s deferral (reopening needs a reason — the plan's non-fix #2
is correct).

---

## AGENTS.md invariant audit

- **Snapshot additive:** honoured — zero new snapshot fields; `sessionLiveBest` is module state.
  The claim "`restoreFromSnapshot` re-derives it from `sessionModeHighStart`" needs the restore
  site to actually set it (3130 restores `sessionModeHighStart`; `sessionLiveBest` must be added
  there) — plan says "re-derived" but does not list 3130 as a hook. Add it or D2 breaks on
  resume: `sessionLiveBest` would stay at its previous run's value.
- **Both reset sites:** the plan claims honour "by construction" because `sessionLiveBest` is
  only per-run — but if D2 ships, `resetWaveState` resets `score` per wave while
  `sessionLiveBest` must survive across waves within a gauntlet run (else the toast re-fires
  every wave). The invariant is "reset in BOTH sites" — for `sessionLiveBest` the correct
  behaviour is reset in `resetGame`/`startGame` but **NOT** per-wave; the plan's blanket "both
  reset sites honoured by construction" is wrong-headed here and would produce either a
  re-firing toast or a missed one depending on which way the implementer reads it. State the
  per-run (not per-wave) lifetime explicitly.
- **Both session-end hooks:** honoured — D2's finalize point is shared by both `gameOver` and
  `endZenSession`. But see Finding 3: the hooks the plan *adds* (persistence) must also cover
  the quit paths or the invariant's spirit (no silent loss) is violated.
- **Canvas save/restore:** D1's instruction to set `textAlign='left'` and restore inside the
  existing save/restore discipline is correct (the idle branch's `ctx.save()` is at 5222; the
  restore after the mode list must bracket the alignment change). No violation.
- **No 60fps calibration:** all proposed gates are tick-driven or event-driven; the srSpeak
  E ordering test is the only wall-clock-dependent one (500ms interval) — the plan flags it and
  proposes lastSrSpeak forcing. Acceptable.
- **Assertion truth:** G's mutation-testing rule is stated and applied to A/B/D gates. B1's
  no-stall gate (Finding 8) and C's twin-never-on-rival gate (Finding 1) are the two that fail
  the plan's own standard.

---

## Scope sanity

- **Should be a non-fix instead:** Feature C as written (Finding 1) — or re-scoped to the
  movement path; the `snapToFreeTile` telegraph half is the part worth shipping.
- **Recorded non-fix that should be in:** non-fix #8 (the `highScore` *global* write) is
  correct to leave — but D2 as designed will make the DOM `Best:` line read `modeHighScores`
  at 2490-2494 while the plan's finalize-only persistence changes when THAT line updates
  mid-run too (today the line tracks the run live; after D2 it goes stale for the whole run,
  by design). That's a player-visible change the plan never mentions: the in-run HUD "Best"
  stops updating. Either accept and document it, or render the line from `sessionLiveBest`
  during play. Decide in the plan, not in the code.
- **Right-sized:** A, B, E, G are the correct scope with the corrections above. The 7-feature /
  ~120 LOC envelope is realistic *after* C is dropped or re-scoped (C's 4 LOC estimate was for a
  fix of a non-existent hole).

---

## Minimum change set

1. **Drop or re-scope Feature C** (Finding 1): the spawn-time hole does not exist in the real
   call path (`generateFood` passes `rivalCombinedSnake()` to `findPortalTile` via
   `currentSnake`); either keep only the `snapToFreeTile` materialising fix + a documented
   non-fix for movement overlap, or fold twin-tile avoidance into B1's filter. Replace the
   vacuous "100-seed twin never on rival" gate accordingly.
2. **Fix the D1 snippet** (Finding 2): `fillTextClipped(getModeDesc(mode), 10, y + 20,
   CANVAS_WIDTH - 10);` — the published coordinates draw nothing (`avail = -12`).
3. **Re-design or drop D2's persistence move** (Finding 3): pause-quit and gauntlet
   per-wave scores are lost under finalize-only persistence — two documented non-final paths.
   At minimum: persist on quit, keep per-wave banking for gauntlet, and state that the in-run
   HUD Best line goes stale; add `sessionLiveBest` re-derivation to `restoreFromSnapshot` (3130)
   and declare its per-run (not per-wave) lifetime.
4. **B2:** delete the dead `rivalFreezeMs <= 0`/`hoardActive` gates from the snippet and correct
   the ignition sentence to post-move semantics; keep the hazardsEnabled gate (Finding 4).
5. **F:** add the `rivals` clear to the Escape-at-gameover idle transition (9228-9234) or switch
   to a frame-scoped `deathRivals` copy — the current plan text asserts a resetGame path that
   does not exist (Finding 6).
6. **B1:** replace the no-stall gate with a time-to-food / mean-progress bound (the stall gate
   cannot fail by construction) and name the seeded-replay/ghost-arena determinism surface
   alongside the daily (Finding 8).
7. **A:** delete the false "rAF particle system is already the calm surface" parenthetical;
   decide calm-gating explicitly; pin floaters empty before the +1 delta assertion (Finding 7).
8. **E:** make the ordering test drive two real drain ticks; do not "read the interval's logic"
   (source-text in disguise) (Finding 9).
9. **G:** re-anchor the H-key repair to the section the stale bullet actually lives in
   ("State Management — Specific Bypasses", AGENTS.md:160-162 — the plan's title "First-Time
   Onboarding" points at the section that already states the correct behaviour); resolve C3's
   overlap with C2 (delete or differentiate); add the AGENTS.md:512 phantom-overflow-test drift
   to the sweep (Finding 10).

With 1-6 applied the plan is implementable as written; 7-9 are quality corrections to features
that are otherwise sound.
