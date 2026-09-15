# Snakes v12 — Implementation Plan

Companion to `v12-design-plan.md` (revision 2, incorporating `v12-review-1.md` and `v12-review-2.md`).
**Revision 2 of this plan** incorporates `v12-impl-review.md`; every blocking issue it raised was re-verified against `snake.html` by hand before being accepted. Corrections are marked **[IR]** (= impl-review).

**Baseline:** `master` @ `23a427e`, working tree clean, `snake.html` 8594 lines, 129 assertions across 11 suites all green.

**Deliverable:** 8 ordered steps, ~595 LOC in `snake.html`, one new suite `test-v12.mjs` (**~64 assertions, ~280 lines** — one number, reconciled per step **[IR-N3]**), AGENTS.md refresh. Committed and pushed on the task branch.

---

## Global contract

Every step obeys these without restating them.

**Load-bearing invariants (from AGENTS.md — do not break):**
- `gameState` is the single source of truth; check it before acting on input or updating.
- `stopGameLoop()` is the single exit path for `gameTimeout`; never write `gameTimeout` directly.
- The rAF loop (`animateVisuals`) reads game state but never writes game-logic state.
- Every `ctx.save()` needs a matching `ctx.restore()` on **all** paths.
- `FOOD_TIERS` weights must sum to 1.00; `pickRandomFoodType` normalises by total weight, but Walled filters must stay sane.
- Session-end logic goes in **both** `gameOver()` and `endZenSession()`.
- Per-run state is cleared in **both** `resetGame()` and `resetWaveState()`.
- Snapshot changes are **additive only**; never bump `SNAPSHOT_VERSION`.
- Every food-tier colour read goes through `foodColor(type)` (portal keeps its hardcoded `#AA44FF`).
- Timers are tick-counted against the real tick interval (~120 ms base).

**Sequencing rules.**
- One owner per function per step. `resetGame()` is edited by steps 1 (E), 5 (C) and 6 (A); `setNextDirection` by steps 2 (Feature 0) and 7 (A-pass2); `showFoodLegend` by step 1 then step 3.
- **Re-run every earlier step's acceptance after editing a function a later step shares [IR].** Shared: `resetGame`, `setNextDirection`, `drawComboBankHUD`, `updateGame`.
- **Hoist rule [IR-B4]:** any resonance condition read by a code path that executes *above* the mutator block (L6417-6459) must be computed from `activeMutators` inline or by a helper called at the point of use — never from `activeResonance`, which is assigned later in the tick. An implementer must never assume `activeResonance` is fresh outside `tickResonance()`.
- No step may start before its predecessor's acceptance gate passes.

**Verification per step, in this order:**
1. `node test-bugfixes.mjs` — "No JS errors on load" (module-scope binding canary).
2. Full suite: all 129 existing assertions still accounted for + this step's new ones.
3. This step's running-game evidence (screenshot or exact numeric delta), captured before moving on.

---

## Step 1 — E: Toast Pipeline Integrity

**Owner function:** `queueToast` (L7466-7470), `processToastQueue` (L7472-7489), `clearToasts` (new), `showFoodLegend` (L7458-7465), `resetGame` (L2135).

**Changes**

1. `queueToast(message, duration, priority)` — new optional third parameter, defaulting to `'normal'`. All ~50 existing callers pass two arguments, so defaulting is safe (grep-verified). Push `{ message, duration, priority }` into `toastQueue` (L1081).
2. `processToastQueue()` — select the next message by priority (`high` → `normal` → `low`), then FIFO within a priority. Track the displayed message in a new module-scope `toastCurrentMessage`; if the selected message equals it, extend the display rather than re-show.
3. Bound the queue at 20. On overflow evict lowest-priority-then-oldest — never evict a `high` message while a `low` one exists.
4. New module counter `toastGeneration`. The hide `setTimeout` inside `processToastQueue` captures the generation at scheduling time and returns early if it has changed. `clearToasts()` bumps it, empties `toastQueue`, sets `toastActive = false` and hides `toastEl` (L194).
5. `clearToasts()` is called from `resetGame()` **only** — not `resetWaveState()`, which `startNextWave()` (L5874) calls, and which would destroy the `'Wave N Complete!'` toast queued 2000 ms earlier at L5850.
6. `showFoodLegend()` — delete the direct `toastEl.textContent` write and its private 5 s `setTimeout`; replace with one `queueToast(LEGEND_TEXT, 5000, 'high')`. Content unchanged at this step (step 3 rebuilds it).
7. **Priority lanes — name the real call sites [IR-N9].** `high`: hazard spawn (L3649), bounty spawn/complete (L3554/L3569), the `showFoodLegend` call, power-up pickup. `normal`: the default (achievements, level-up, quests, cosmetics — untouched). `low`: the combo-charge onboarding toast (L6377) and the portal/bomb first-seen toasts. **There is no death toast in the codebase** — the original draft named one; it is dropped.

**Acceptance** (8 assertions)
- Two `high` sentinels then `showFoodLegend()` → sample `toastEl.textContent` every 250 ms, assert all three appear in order.
- Stack achievement + level-up + quest completion, drain, press Enter → no stale toast in the first 10 s of the new run, and none lost before Enter.
- Gauntlet: complete a wave, confirm within 2 s → `'Wave N Complete!'` still displayed.
- `toastGeneration`: queue a toast, `clearToasts()`, queue another → the second gets its full duration.

**LOC:** ~80.

---

## Step 2 — Feature 0: Mirror Flip Relocation

**Owner function:** `setNextDirection` (L4052-4062), keydown handler (L8330-8335).

**Changes**
1. Delete the mirror block at L8330-8333 — comment and `if` together.
2. At the **top** of `setNextDirection`, before the tail/reverse logic (L4055-4059), add:

```js
// v12: mirror moved out of the keydown handler so it applies on ALL input paths
// (keyboard and D-pad dispatch keydown; swipe calls this directly).
if (activeMutators.indexOf('mirror') !== -1) { newDx = -newDx; }
```

**Why before the checks:** the reverse-check compares against the effective tail — the direction that will actually be in effect — so the flip must be part of the candidate it validates. This preserves today's ordering: the flip ran at L8332 *before* the L8335 call.

**Acceptance** (3 assertions)
- Mirror on, swipe path (`setNextDirection(-TILE_SIZE, 0)` directly) → queued `dx` is `+TILE_SIZE`.
- Mirror on, ArrowLeft → queued `dx` is `+TILE_SIZE` (not double-flipped back to `-TILE_SIZE`).
- Mirror off → keyboard and swipe queue identically to today.
- `test-v11.mjs` L178/L233 set `dirQueue`/`lastConsumedDir` directly and never call `setNextDirection`, so the relocation cannot break them — re-run to confirm.
- **[IR]** The originally-planned source-text item ("the keydown handler contains no mirror test") is dropped: the keydown handler is an anonymous `addEventListener` callback and `.toString()` cannot reach it. The behavioural ArrowLeft assertion already catches the double-flip.

**LOC:** ~10.

---

## Step 3 — D: Help & Legend Truth Pass

**Owner functions:** `drawHelpOverlay` (L4145-4231), `showFoodLegend` (L7458).

**Changes**
1. Add `blurb` and `shortName` fields to the eight `FOOD_TIERS` entries (L1288-1302). No weight, point, or colour value changes.
2. New module-scope `buildFoodTableRows()` returning `[{ key, name, color, weight, pts, xp, blurb }]` derived from `FOOD_TIERS` — percentage via `Math.round(weight * 100) + '%'`, colour via `foodColor(key)` **from the same key being rendered** (not an index).
3. `drawHelpOverlay` — replace the hard-coded `foodInfo` literal (L4192-4198) and the index-based colour lookup (L4204) with the derived rows.
4. New module-scope `HELP_BINDINGS` array of `{ keys, desc, context }` covering all 22 bindings; `context` is `''` for global keys and `'idle'`/`'draft'`/`'playing'`/`'gameover'` for the four context-scoped ones (`C`, `X`, `R`, `S`). Render the controls table from it.
5. **Geometry, specified [IR-5].** The current layout is: left controls column at x=20/140, rows from `controlY + 20` at 18px pitch; food table at `foodX = CANVAS_WIDTH - 155` (= 285) over y ≈ `controlY + 22 … + 112`; `modeY = controlY + 20 + controls.length * 18 + 10` (L4212); footer at `CANVAS_HEIGHT - 10` (L4229); canvas 440×600.
   - A second controls column at x≳235 would run its description past the 440px edge — **two columns are not viable**. Use a **single denser column**: 12px pitch instead of 18 (rows still legible at the existing 12px font), and list the four context-scoped keys as `C (idle/draft)` in the key cell rather than adding a column.
   - Food table stays at `foodX = 285`, y from `controlY + 22`, now 8 rows instead of 6 → it ends at `controlY + 148`. The mode list must therefore start no higher than `controlY + 158`, i.e. `modeY = max(controlY + 20 + controls.length * 12 + 10, controlY + 158)`.
   - Verify at 440×600 and at the 300px `resizeCanvas` clamp.
6. `showFoodLegend()` — keep its single-line **points** format (it is a toast) and add the missing `bomb` entry. Do not add weights. Both surfaces share `buildFoodTableRows()`.

**Acceptance** (6 assertions)
- Every percentage printed in the help overlay equals `Math.round(FOOD_TIERS[k].weight * 100)` read from the live page.
- Every `FOOD_TIERS` key appears exactly once in the help table with the colour of its own key (assert the rendered row count is 8 and the colour source is the same key).
- `HELP_BINDINGS` covers every key the keydown handler documents. **[IR]** The originally-planned "assert the two sets are equal" is not computable (the handler is anonymous with no registry) — this replaces it: assert `HELP_BINDINGS` contains each of the 22 keys by explicit enumeration, and add a code comment stating the array is hand-maintained and must be updated when a binding is added.
- Screenshots: help overlay at the default viewport and at 300px width; `L` legend.
- `test-bugfixes.mjs` "No JS errors on load" passes.

**LOC:** ~100.

---

## Step 4 — B: Hazard Phase Telegraph

**Owner function:** `drawHazards` (L4802-4844).

**Changes**
1. Pulse floor: `0.25 + 0.15 * Math.sin(...)` (L4807) → `0.28 + 0.12 * Math.sin(...)`; the calm-mode branch is untouched.
2. Pre-ignition cue: when `h.phase === 'off' && h.phaseTimer <= 2`, draw a thin bright outline (flat colour, no gradient) **inside the existing hazard-loop pair** (L4806/L4824). `phaseTimer` semantics verified: it decrements then flips at ≤0 with a full-duration reset (L3613-3617), so while off the rendered values are 9…1 and `phaseTimer <= 2` is exactly the 2 ticks before ignition — `phaseTimer` is never 0 in a rendered state.
3. Countdown arc: centre `h.cx + TILE_SIZE/2, h.cy + TILE_SIZE/2` (matching the gradient centre at L4808); radius `h.radius`; flat `strokeStyle`, `lineWidth` 2, low alpha; fraction = `h.phaseTimer / (phase === 'on' ? HAZARD_ON_TICKS : HAZARD_OFF_TICKS)`. Always drawn — calm mode gates the pre-ignition **pulse**, never the informational arc (the v9 F2 bounty-ring precedent).
4. Do not read or write `seedOffset`. It is written at spawn (L3645) and serialised (L2691/L2858) but never read — grep confirms 3 hits, none inside `tickHazards`. Leave it; correct the AGENTS.md claim in cleanup.

**Acceptance** (6 assertions)
- Tick-sample `{phase, phaseTimer}` across a full on→off→on cycle → the pre-ignition cue is present on exactly the 2 ticks before `phase` flips to `'on'`.
- **Save/restore depth assertion [IR-6].** Test-local monkey-patch of `ctx.save`/`ctx.restore` (`page.evaluate`, no production code), then call `drawGame(1)` **repeatedly across a full on→off→on hazard cycle** in a hazards-enabled mode — not once. Catches a leaked save (early return, misplaced restore, loop `continue`). It does not catch an unbalanced transform (`translate`/`setTransform` with no save), and all new drawing sits inside an existing pair, so the scope is proportionate. State that limitation in the test comment.
- Screenshots: off-phase, pre-ignition, on-phase, ignition tick.

**LOC:** ~65.

---

## Step 5 — C: Recap Truth

**Owner functions:** `buildRecapData` (L3436-3466), `drawRecapCard` (L3467-3517), `gameOver` (L3312-3350), `endZenSession` (L3393-3429), `drawComboBankHUD` (L5507-5522), `drawDraftScreen` (L6039-6092), `saveDiaryEntry` (L501-520).

**Changes**

1. **Save/death split.** Add `lastSaveEvent = ''` beside `lastDeathCause` (L745). Re-point the **7 non-death writes** to `lastSaveEvent`: L6556, L6580, L6591, L6610, L6632, L6648, L6697. The **10 death writes** stay: L2573, L6438, L6597, L6602, L6655, L6689, L6853, L7009, L7090, L7156. Reset `lastSaveEvent = ''` in `resetGame()` beside `lastDeathCause = ''` (L2137).
2. **Zen.** `endZenSession()` sets `lastDeathCause = 'Zen session ended.'` before building the recap.
3. **Raw score + cascade, wired into BOTH session ends [IR-B3].** `buildRecapData()` gains `deathCause`, `saveEvent`, `rawScore`, `cascadeMult`.
   - `gameOver()` captures `sessionRawScore = score` **immediately before** the cascade multiply at L3322, and records `sessionCascadeMult` there.
   - `endZenSession()` **never applies the cascade** — it funnels through `finalizeSession(true)` after `score = snake.length` (L3397). It must therefore set `sessionCascadeMult = 1` explicitly. Following the original plan literally would have rendered a false `Cascade ×0.5 raw → final` row on a Zen score that was never halved, on a Zen run with 2-3 drafted mutators (Zen *is* draftable: `gameMode !== 'daily'` at L7924).
   - Both `sessionRawScore` and `sessionCascadeMult` join the **reset contract** in `resetGame()` and `resetWaveState()`.
   - `score / 0.5` is not a valid substitute: the `Math.floor` loss is unrecoverable and wrong for odd scores.
4. **Recap card geometry, specified [IR-5].** `cardH = 168` (L3471); the XP line is at `cardY + 80` (L3501); quest rows start at `cardY + 100` (L3505) at 14px pitch; the retry prompt is anchored at `cardY + cardH - 22` (L3515). With 3 quest rows the content ends at ~`cardY + 138`. Insert the new rows **above** the XP line and grow the card:
   - `deathCause` row at `cardY + 62` (replacing the delta line's slot when a cause exists; the delta line moves down or is merged).
   - `saveEvent` row at `cardY + 76`, drawn only when a save occurred.
   - cascade row (`Cascade ×0.5  1200 → 600`) directly under the XP line.
   - `cardH` grows to **196** for the 2-row case and **212** for the 3-row case; the retry prompt follows automatically from the `cardY + cardH - 22` anchor.
   - Verify against the worst case: 3 quest deltas + cause + save + cascade, at 440×600 and at the 300px clamp.
5. **HUD disclosure.** Extend `drawComboBankHUD()` rather than adding a badge — there is no free slot (bottom-left rows at `CANVAS_HEIGHT-28` and `CANVAS_HEIGHT-22`; top-right carries the mutator/resonance lists). Compose the string from parts: the charge badge when `comboCharges > 0`, plus `⚠ ×0.5 score` when a cascade factor applies, and change the entry guard (L5508) so the factor draws at `comboCharges === 0` — **which the original plan newly enabled and left in the `#555` colour at L5519 [IR-N7]**. The appended part gets its own visible colour (a second `fillText` with `#FF8888`, or a separate colour set for the warning segment).
6. **Draft-screen disclosure.** The `C: Cascade ON (pick 3)` line (L6085) gains the factor.
7. **Diary.** `saveDiaryEntry`'s `deathCause: lastDeathCause || 'quit'` (L514) keeps its key and meaning; after the split it stops recording rescues as deaths. `saveDiaryEntry` is called from both session ends (L3390, L3421), so the Zen cause propagates correctly. No schema change, no migration.
8. **Known pre-existing inconsistency — state it on the card, do not fix it here [IR-N8].** `updateScoreDisplay()` persists the **raw** score into `modeHighScores` during the run (L2291-2294, called from `addScore` L1862), and `finalizeSession()`'s post-cascade write never wins (L3293-3296). So the displayed and persisted "Best" is pre-cascade while the card headline is post-cascade, and a cascaded run can render `Score: 500` beside `−500 vs best` where the 1000 was set by that same run. The card's new `raw → final` row is what makes this visible; it must not be presented as a bug fix. Fixing the PB semantics is a separate balance decision and is out of scope.

**Acceptance** (9 assertions)
- Die by obstacle, self, wall, hazard, rival, starvation → 6 screenshots naming the right cause.
- Die immediately after each of the 7 saves → the card names the death, not the rescue.
- Zen: trigger a streak-charge save, then end the session → the card reads the Zen cause and shows **no** cascade row.
- Cascade: Classic, cascade on, 5 charges + a mutator → the badge shows both parts in visible colours; gauntlet → badge absent.
- Card fits at 440×600 and at the 300px clamp with 3 quest deltas + cause + save + cascade rows.
- Daily is not a valid cascade test: the draft gate (L7924) makes a mutator impossible there.

**LOC:** ~80.

---

## Step 6 — A-pass1: Resonance Completion, six non-input effects

**Owner functions:** new `tickResonance()`, the mutator block in `updateGame` (L6415-6474), the food-award sites, `advanceShrinkZone` coverage, `buildSnapshotObject`/`restoreFromSnapshot`, both reset sites.

**Changes**

1. **`tickResonance()`** — new module-scope function called where the current resonance block sits (L6462-6474). Delete the dead `feastFamine` block (L6468-1471). All cadence state lives in **its own module-scope counters** — never on the `activeResonance` object, which is rebuilt here every tick and would reset the cadence 8×/second.
2. **Hoist, before touching hunger [IR-B4].** The hunger block is L6427-6444 and `hungerTickCounter++` is **L6433** — 29 lines *above* the resonance block. Skipping it from `tickResonance()` would apply one tick late and drift the cadence ~1 tick in 5. Fix: add a module-scope `resonanceActive(effect)` helper that derives from `activeMutators` **via `detectResonance()`** (same sorted-key match as L896-900), and call it inline at L6433. `tickResonance()` keeps the per-tick cadence advancement; the *readers* above it use the helper. This is the global hoist rule applied.
3. **`intangiblePhase`** — at L6433, skip the increment when `resonanceActive('intangiblePhase') && gameTick % 5 === 0`; set the self-exemption window for this tick plus the next two (new module counters; the existing `skipSelfCollision` at L6422-6425 is tick-local). `drawSnake` renders translucent while the window is live. Descriptor rewritten: obstacles, walls, hazards and rivals still kill.
4. **`doubleGold`** — new `foodResonanceMult()` reading `activeMutators`. Multiply at the **food-award sites only**: `foodXP` (L6893-6901), `addScore(tier.pts)` (L6925), echo-brew `food2` (L7054), portal-twin epic (L7077-7078, score **and** XP), hoard-bonus (L7113). **`addScore` itself is not modified.** Chaos reshuffle cadence 20 → 10 ticks (L6456).
   - Deliberately **not** scaled: the combustion-brew bonus (L6928) and the combo bonus (L6941) — neither is food points, and the descriptor says "all food". The bomb path awards nothing (`bomb.pts = 0`, `xp = 0`), so it is not a site.
5. **`rivalShrink`** — call `advanceShrinkZone()` from the rival food-eat branch in `updateRival` (L3211-3218). The tick-tail guard `if (gameState !== 'playing') return;` at L7286 already exists with a comment naming this resonance; note in a code comment that the loop above it does not re-check `gameState` between rivals.
6. **`feastFamine`** — `hungerInterval()` returns 30 when `resonanceActive('feastFamine')`, else 50; use it in place of the `% 50` literal at L6434. Food points ×4 at the same food sites (pass 4 instead of 2). Descriptor states the stacking on Golden Age explicitly.
7. **`rapidDoom`** — the hunger pop branch also calls `advanceShrinkZone()`, **preserving the `gameOver(); return;` contract**.
8. **`chaosCycle`** — an additive gate `resonanceActive('chaosCycle') && cycleAllows(name)` wrapping the gravity (L6417-6420), phase_shift (L6422-6425) and mirror conditions. **Never** a replacement of the existing mutator checks.
9. **Descriptors** — rewrite the `RESONANCES` strings (L882-889) so each matches its implementation, including the two pass-2 entries. End state: no displayed resonance name describes behaviour that does not run.
10. **Snapshot (additive)** — new counters in `buildSnapshotObject` beside the `comboCharges`/`hazardChainStreak` neighbours; restore with defaults. No `SNAPSHOT_VERSION` bump.
11. **Resets** — every new counter cleared in both `resetGame()` and `resetWaveState()`.
12. **HUD** — a glyph for the live resonance state, plus a first-fire onboarding toast per resonance (the `hasSeenPortal`/`hasSeenComboBank` pattern, one new `snake_has_seen_*` key each).

**Acceptance** (18 assertions) — exact numeric deltas, because a screenshot cannot distinguish ×2 from ×3.

- **Chaos Gold baseline, with stated preconditions [IR-B1].** In one forced `common` eat: `score` gains **exactly 60** and `sessionXP` gains **exactly 50**. These hold only when: it is the run's **first eat** (`comboCount === 0`, otherwise `foodXP` is multiplied by `1 + comboCount*0.5` at L6896-6899), `gameMode !== 'zen'` (Zen forces `foodXP = 10`), `gameTick % 10 !== 0` (the survival drip `awardXP(1)` at L6496), no combustion brew, no active hoard/pigment/hazard-adjacency, and `evolutionTier < 3`. The test sets every one of these explicitly.
- **Pigment case = 120, not 180 [IR-B1].** With `pigmentRushActive` and `golden_food` drafted, `effectiveHoardMult` is **2**, not 3 (L1853-1855: `golden_food` present → `? 2 : 3`). So `addScore(20)` → `amount = 60` (golden ×3, L1846-1847) → `totalMult = min(1×2×1, 4) = 2` → **+120**. `180` is unreachable under *any* placement of the multiplier, because Chaos Gold necessarily drafts `golden_food`. Assert **120**.
- **Placement discriminator [IR-B1].** To prove the multiplier is at the food site and not in the funnel, assert that a **non-food** award is *not* doubled: `addScore(10)` called directly (and a bounty award at L3566) must be unchanged under Chaos Gold without pigment/hoard, while a food eat is doubled.
- **Ethereal** — 300 ticks → `snake.length` still decreases; the self-exemption window is live on exactly 3 of every 5 ticks.
- **Apocalypse** — park on the shrink boundary, `driveTicks` until the zone passes → `gameState === 'gameover'`, **and `lastDeathCause` is the shrink cause** (not any unrelated death), zero console errors.
- **Pressure Cooker** — drive a real run with a rival until it eats → assert `advanceShrinkZone` was reached at least once. Do not assert only the call site: the rival eats the single global `food`, so frequency depends on AI proximity.
- **Chaos Theory — subset run [IR-B2].** Draft `['gravity','mirror']` only. The original acceptance ("the three mutators without the resonance") is unconstructible: `detectResonance` key-matches the sorted full set, so drafting all three *is* entering the branch. The subset run is what actually verifies the additive-gate property — assert the gravity block still fires on its normal cadence and that no cycle gating is applied.
- **Famine Feast** — hunger pops every 30 ticks, not 50 (over 200 ticks).
- **Snapshot** — a pre-v12 snapshot restores with every new field defaulting.
- **Reachability** — at least one assertion goes through the **real draft path**, not `page.evaluate` assignment: forcing `activeMutators` bypasses `resetGame()`'s clearing and the draft handler's `spawnRival(1)`/`startGame()` ordering.

**Gate.** Pass 2 does not begin until every pass-1 effect is observed working.

**LOC:** ~145.

---

## Step 7 — A-pass2: Resonance Completion, two input effects

**Owner function:** `setNextDirection` (post step 2).

**Changes**
1. **`invertControls` (Quantum).** At the top of `setNextDirection`, **before** the mirror flip: when the inversion window is open, swap the axes (`{ dx, dy } = { dy, dx }`).
   - **Safety restated as an input-domain invariant [IR-N1].** The originally-stated algebraic proof was false: `dy = −dx` is satisfied by `dx = 1, dy = −1`, which swaps to exactly its own reverse. The real guarantee is that **both callers emit axis-aligned unit vectors** — keydown builds `(±TILE_SIZE, 0)` or `(0, ±TILE_SIZE)` with exactly one non-zero component (L8305-8325), and swipe does the same. The swap of an axis-aligned vector is its perpendicular, never its reverse. This must be written as a comment on the code, because a future diagonal-capable input surface (joystick, two-finger gesture) would silently make the mechanic lethal. A defensive guard — reject the swap when both components are non-zero — costs one line and removes the dependency on the input domain.
   - It also cannot cancel against the mirror, which negates `dx` alone while the swap changes which axis `dx` is.
   - Window opens every 10-15 ticks from `seededRandom()` (replacing the `Math.random()` at L6464), lasts 5 ticks, telegraphed by a HUD glyph + floater.
2. **`quantumToggle` (Schrodinger).** Every 15 ticks, alternate: (a) suspend the mirror flip for 5 ticks (a module flag read by the step-2 mirror line), or (b) `chaosCurrentWeights = shuffleFoodWeights(); chaosShuffleTick = gameTick;` — a real reassignment that `pickRandomFoodType` consults (L1868-1878). A bare `shuffleFoodWeights()` call mutates nothing and would be silently inert.
3. **`shuffleFoodWeights()`** — the weight draw at **L6030** switches from `Math.random()` to `seededRandom()`, closing a determinism leak that already existed for `chaos_seed` runs.

**Acceptance** (8 assertions)
- **Quantum, sign pinned [IR-N2].** With `activeMutators = ['gravity','mirror']` and the window forced open, ArrowLeft must queue **`(0, +TILE_SIZE)`** — swap-then-mirror yields `(0,−T)` and mirror-then-swap yields `(0,+T)`, so accepting either sign would not verify the stated order of operations. Assert the exact sign. (`ArrowLeft` is `(-T,0)`; swap → `(0,-T)`; step-2 mirror negates `dx = 0` → `(0,-T)`.) The test asserts whichever value the specified order produces and states the derivation in a comment.
- **Safety** — hold a straight line, force the window open, press all four directions → `gameState === 'playing'` and the heading never reversed. Note this assertion **passes on the review-flagged broken 180° design too** (Right → reverse-rejected, Left → up), so it does not discriminate; the vertical-axis sign probe is the discriminating test.
- **Cadence** — seed the run (`seedPrng` set) then drive 200 ticks → the window opened 13-20 times, not 200. Unseeded, `seededRandom()` falls back to `Math.random()` (L718-720) and the assertion is meaningless.
- **Schrodinger reshuffle branch** — assert `chaosCurrentWeights` is replaced (different object identity) exactly on the toggle tick, and that a `pickRandomFoodType()` sample distribution changes afterwards, proving the new weights are consulted and not merely computed.
- **Schrodinger mirror branch** — with `mirror~chaos_seed`, a horizontal press queues an **un**-mirrored `dx` while the window is open.
- **Determinism** — same seeded Classic run twice, same tick count, diff food positions. `shuffleFoodWeights`' change (item 3) alters the RNG stream for `chaos_seed` runs; the diff is run *within* the final build (comparing two identical seeded runs), not "before and after the change", which cannot be written in one build **[IR]**.

**LOC:** ~70.

---

## Step 8 — F: Risk Income

**Owner function:** new `bankComboCharge(source)`, plus four call sites.

**Changes**
1. `bankComboCharge(source)` — the cap-and-onboard logic currently inline at `handleComboMilestone` (L6372-6379) is extracted into this helper, and `handleComboMilestone` calls it. The `hasSeenComboBank` toast lives in the helper.
2. Four new sources: bounty completion (L3565-3576), every third consecutive hazard-chain eat (L6993-7001), Hoard Pigment Rush trigger (L7120-7130), and first reaching Titan or Apex (L2532-2537).
   - **[IR]** The evolution source is detected by comparing the tier **after** the `while` loop against the tier before it, and banking at most one charge **after** the loop — not inside it.
3. Hazard-chain source reads `hazardChainStreak` **at the eat moment**, never a cached value. Its mid-run resets are **L6631** (melt — not "L6450-region", which is the shrink_zone timer **[IR-N4]**), L6654 (hazard death), L6844 (bomb eat) and L7001 (non-adjacent eat), plus `resetGame()` (L2142) and `resetWaveState()` (L5793).

**Acceptance** (6 assertions)
- Complete a bounty → charge increments.
- Break the chain, then eat adjacent → no charge; eat adjacent three times consecutively → one charge.
- Force a two-tier evolution jump via `food2` stacking → exactly one charge.
- Missed-income check: exercise all four eat paths (bomb L6804, normal L6843, echo `food2` L7054, `extraFoods` L7113) and assert each moves what it should. **[IR]** The `extraFoods` path is a `addScore(FOOD_TIERS.bonus.pts)` site and does **not** bank a charge — "each moves what it should" must not be read as "each banks".
- Inflation **measurement**, not assertion: instrument the spend count over a scripted 5-minute Classic run and record the number on the issue. If the badge reads FULL for most of the run, raising spend costs to 2 charges is a design-owner decision; the measurement is what that decision needs.
- Screenshots: counter incrementing on bounty completion; the `FULL` badge state.

**LOC:** ~50.

---

## Test plan

New file `test-v12.mjs` following the `test-helpers.mjs` harness conventions (`launch`, `startGame`, `waitForTicks`, `driveTicks`, `getGameState`, `runTests`). **~64 assertions, ~280 lines** — the single reconciled figure; per-step budgets are 8 / 3 / 6 / 6 / 9 / 18 / 8 / 6 = 64 **[IR-N3]**.

Rules applied to the whole suite:
- **Source-text assertions are re-pointed, not deleted.** 37 `.toString()` assertions exist (test-bugfixes 10, test-v11 23, test-quests 3, test-evolution 1). Several are the only coverage of the `addScore` cap, the hazard-chain multiplier, the dual-reset contract and the `endZenSession` parallel hook. Delete only the ones this patch genuinely invalidates and replace each with a behavioural assertion of the same invariant. Because step 6 hooks the food sites rather than `addScore`, `test-v11.mjs` L111-113 and L265-266 remain valid.
- New assertions must fail on a plausible bug. No assertion may pin wording, layout constants, or incidental defaults.
- Deterministic and isolated; `waitForTicks` for loop behaviour, `driveTicks` for forced state; seeded runs wherever the assertion touches the PRNG stream.

Full re-run before commit:
```
for f in test-*.mjs; do [ "$f" = test-helpers.mjs ] || node "$f"; done
```

---

## Cleanup (after the smoke test proves the work)

1. Keep this cycle's planning docs in the tree — the repo's convention is that they ship (`v11-ideas-*.md`, `v11-design-plan.md`, `IMPL_PLAN_v11.md` all live in the repo).
2. **AGENTS.md refresh** — the canonical reference must match the shipped code:
   - New section: Mutator Resonances (all eight effects, the **input-domain** safety invariant for the axis swap, the every-tick recomputation trap, the hoist rule).
   - Input Buffer Queue: the mirror flip now lives in `setNextDirection`, not the keydown handler, and applies to all three paths.
   - Golden Hoard: `HOARD_INTERVAL`/`HOARD_DURATION` are `750`/`125`, not `5400`/`900`.
   - Hazard Zones: `seedOffset` is written and serialised but never read — remove the phase-offset claim.
   - New section: Cascade disclosure (badge composition, `sessionRawScore` capture in `gameOver` vs `sessionCascadeMult = 1` in `endZenSession`, the "disclose, do not rebalance" decision, and the pre-existing raw-vs-post-cascade `modeHighScores` inconsistency).
   - Toast Pipeline: bounded, prioritised, cleared in `resetGame()` only — and state why `resetWaveState()` must not clear it.
   - Death vs save: `lastDeathCause` (10 writes) vs `lastSaveEvent` (7 writes).
   - Delete the stale "`drawOverlay()` leaks text/alignment" note (verified fixed: save L4576, idle early-return restore L4580, final restore L4720).
3. No new files beyond `test-v12.mjs` and this cycle's planning docs.

---

## Risks

| Risk | Mitigation |
|---|---|
| Feature A is ~215 LOC across the input, score, hunger, shrink and rival paths — the largest risk in the cycle | Eight ordered acceptance gates; pass 2 blocked on pass 1 being observed; exact numeric deltas rather than screenshots for numeric effects |
| Editing the input choke point could regress normal play | Step 2 lands first and alone; the axis swap is structurally suicide-proof over the actual input domain (and defensively guarded); `test-v11.mjs` input cases re-run each step |
| `resetGame()` is touched by three steps | Strict step ordering; each step's assertions re-run before the next begins |
| A food-tier edit could desync `FOOD_TIERS` | Step 3 changes no weights, points or colours — only adds `blurb`/`shortName` |
| Source-text assertions mask a regression | Step 2 of the verification strategy replaces each invalidated source assertion with a behavioural one |
| The cascade disclosure surfaces a pre-existing PB inconsistency | Stated explicitly on the card and in step 5 item 8; fixing PB semantics is out of scope and is not smuggled into this cycle |
