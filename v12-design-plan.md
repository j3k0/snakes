# Snakes v12 — Design Plan

> **Revision 2.** This revision incorporates the two independent design reviews in `v12-review-1.md` and `v12-review-2.md`. Every blocking issue they raised was re-verified against `snake.html` by hand before being accepted; the fixes are marked **[R1]** / **[R2]** / **[R1+R2]** inline. The two reviews converged on the same two flagship defects (the `invertControls` axis cancellation and the false `addScore` ceiling claim) and on the same structural fix (land the mirror-flip relocation first).

## Overview

**Theme: "Nothing advertised is a lie."** v12 does not add another parallel system. It makes the promises the game already makes to the player *true*, and then makes the danger it already ships *pay*.

**Baseline:** master `23a427e`, `snake.html` 8594 lines, ~34 features across v7-v11, 129 assertions across 11 Playwright suites (all green at the time of writing).

**Selected:** 6 features, ~560 LOC. Generated from 27 ideas produced by 3 independent ideation agents (gameplay / meta / polish): `v12-ideas-gameplay.md`, `v12-ideas-meta.md`, `v12-ideas-polish.md`, brief in `v12-ideation-context.md`.

**Why this scope.** Both the gameplay and polish ideation agents ranked resonance completion first, and it is the issue's own named open gap #1 (the meta agent's set is orthogonal and contributes nothing here **[R1]**). The other five items are cheap, independently falsifiable repairs to claims the shipped game currently gets wrong: the recap card never says what killed you, the help overlay documents the wrong food probabilities and hides two of eight food types, the cascade penalty silently halves your score, the toast queue is unbounded and is never cleared between runs, and the hazard telegraph is ambiguous exactly when it matters. Two of the six (D, E) are pure text/plumbing; two (B, C) are presentation over state that already exists; one (F) is 45 LOC of new income; one (A) is the flagship.

**v11's lesson is a design constraint here.** v11 shipped 7 features with every assertion green while the game was unplayable (invisible portal/hoard foods, canvas transform corruption, a rival spawning on the player's tile). The v11 risk driver was not feature count — it was **unverifiable surface**. Feature A is almost the entire risk of v12 on that measure, which is why its verification budget is the largest and why the pass split below is a real gate, not a label **[R1+R2]**.

---

## Feature 0 — Mirror Flip Relocation (standalone bug fix)

**Concept.** The mirror mutator's flip lives only in the keydown handler (`newDx = -newDx`, L8331-8333). The D-pad dispatches a synthetic `keydown` (L8359) so it inherits the flip; the swipe handler calls `setNextDirection` directly (L8499) and therefore **ignores the mirror mutator entirely**. v12 moves the flip to the top of `setNextDirection` (L4052-4062) — the single choke point all three input paths share — and deletes the keydown copy.

**Why this is its own step, first.** Three of Feature A's eight effects touch that one site (`chaosCycle` gates it, `quantumToggle` toggles it, `invertControls` composes with it), so shipping it last means every later effect is built on and verified against the buggy foundation — and `chaosCycle`'s pass-1 verification would be invalidated the moment the relocation landed **[R1+R2]**. As a standalone fix it is ~6 lines, removes a shipped defect on all three input paths, and is independently testable.

**LOC:** ~10 (6 code + 4 test).

**Scores:** Impact 2 / Feasibility 5 / Risk 1 / Synergy 3 (a prerequisite, not a headline).

**Hook points.** `setNextDirection` L4052-4062; keydown flip L8331-8333; D-pad synthetic dispatch L8359; swipe caller L8499.

**Failure modes.** *Double flip.* Moving the flip without deleting the keydown copy double-negates under mirror for keyboard/D-pad (net: no flip) while swipe flips once — three paths, two behaviours. **Catch:** assert `setNextDirection` is the only site referencing the mirror mutator, and assert the swipe path flips: set `activeMutators = ['mirror']`, drive a swipe-equivalent `setNextDirection(LEFT)`, read the queued `dx`.

**Verification in the running game.** Start a run with the mirror mutator, press ArrowLeft, then swipe left; the settled direction must be identical.

---

## Feature A — Resonance Completion (flagship)

**Concept.** `RESONANCES` (L881-890) advertises eight mutator-pair synergies with flavour text describing real mechanical behaviour. The HUD prints their names (violet, `#AA88FF`, L6253-6255) **[R1]**. `activeResonance.effect` is consumed at exactly one site (L6462-6474): `invertControls` flashes a white overlay and does not invert anything, `feastFamine`'s body is an empty `if` with a comment, and the other six are detected, named, and inert. After v12 every effect tag has an implementation, and **every descriptor string describes what is actually implemented** — where an effect cannot be made safe and real, the descriptor is rewritten rather than the code faked. The rule the HUD obeys afterwards: *the name you see is a mechanic that runs.*

### Per-effect specification

All hooks re-read in the current file. The two effects the reviews showed to be broken as originally specified are re-specified below.

| effect (pair) | v12 implementation | hook |
|---|---|---|
| `intangiblePhase` (phase_shift~hunger_clock) | On phase ticks (`gameTick % 5 === 0`) the hunger decrement is skipped and the self-collision exemption window widens from that tick to the following two. Body renders translucent while the window is live. **Descriptor rewritten to match:** the snake stays solid to obstacles, walls, hazards and rivals — only *self*-collision is exempted **[R1+R2]**. | `skipSelfCollision` L6422-6425; hunger L6427-6444; consumption L6565-6567 |
| `doubleGold` (golden_food~chaos_seed) | Food points and food XP ×2, applied **at the food-award sites** (not inside `addScore`), and the chaos reshuffle cadence halves (20 → 10 ticks). Because the hook is the food site, the descriptor "All food 2x points and 2x XP" becomes exactly true — a funnel-level ×2 would also have doubled bounty, quest, achievement and survival-drip awards **[R1+R2]**. | food sites L6901, L6925, L6928, L7054, L7077-7078, L7113; chaos cadence L6456-6459 |
| `rivalShrink` (shrink_zone~double_rival) | A rival food-eat calls `advanceShrinkZone()`; the tick-tail guard `if (gameState !== 'playing') return;` already present at L7281-7286 (its comment names this resonance) handles the death return. The file's own comment at L2555-2558 documents the call site as unwired. | `advanceShrinkZone()` L2559-2576; rival eat L3211-3218; guard L7281-7286 |
| `feastFamine` (hunger_clock~golden_food) | Hunger pop interval 30 (extracted into a `hungerInterval()` helper, replacing the literal `% 50` at L6434) and food points ×4 **at the food site**. **Descriptor states the stacking explicitly:** "Food scores 4x (stacks on Golden Age) but hunger ticks every 30 ticks" — the pair always has `golden_food` active, so a bare "4x" would be false **[R1+R2]**. The now-dead block at L6468-6471 is deleted. | hunger L6427-6444; food sites as `doubleGold` |
| `rapidDoom` (golden_food~hunger_clock~shrink_zone) | Each hunger pop also calls `advanceShrinkZone()`, preserving the `gameOver()` + early-return contract. | hunger pop L6432-6440; `advanceShrinkZone()` L2559-2576 |
| `chaosCycle` (gravity~mirror~phase_shift) | Exactly one of gravity / mirror / phase_shift is active per 5-tick window, rotating. Written as an **additive gate** — `resonanceActive && cycleAllows(x)` — never as a replacement of the existing mutator check, so players who drafted those mutators without the resonance are unaffected (and cannot be affected: `detectResonance` key-matches the sorted full set at L896-900, so `chaosCycle` and `invertControls` can never co-occur) **[R2]**. Stated consequence: for the players who *did* draft all three, this is a downgrade (each effect is live ~⅓ of the time) — that is what "three effects cycle every 5 ticks" means, and the descriptor already says it. | gravity L6417-6420; phase_shift L6422-6425; mirror site (Feature 0) |
| `invertControls` (gravity~mirror) | **Re-specified [R1+R2].** The inversion is an **axis swap** of the pressed direction (`dx,dy → dy,dx`), applied at the top of `setNextDirection` before the mirror flip. Safety is structural, not dependent on the reverse-check: for any input, `(dy,dx) = (−dx,−dy)` requires `dx = −dy` *and* `dy = −dx`, which forces both to zero — so an axis swap can never produce a 180° reversal, and the mechanic can never kill the player instantly. It also cannot cancel against the mirror: mirror negates `dx` only, while the swap changes which axis `dx` is. Descriptor rewritten: **"Left/Right and Up/Down controls swap at random for a few ticks"** — the original "Direction inverts randomly every 10-15 ticks" does not describe an axis swap. Cadence 10-15 ticks from `seededRandom()`, telegraphed by a HUD glyph + floater when the window opens. | `setNextDirection` L4052-4062 (post-Feature-0) |
| `quantumToggle` (mirror~chaos_seed) | **Re-specified [R1+R2].** The original spec called `shuffleFoodWeights()`, which *returns* a fresh map and mutates nothing (L6025-6037) — a bare call is a silent no-op, i.e. the v11 failure class. v12 specifies: every 15 ticks, alternate between (a) suspending the mirror flip for 5 ticks (reads as "controls un-reverse") and (b) `chaosCurrentWeights = shuffleFoodWeights(); chaosShuffleTick = gameTick;` — a real reassignment that `pickRandomFoodType` actually consults (L1875-1879). Descriptor rewritten: **"Every 15 ticks: mirror inverts or food types reshuffle."** | mirror site (Feature 0); `shuffleFoodWeights` L6025-6037; consumption L1875-1879 |

**Bugs fixed en route.**
1. **Swipe ignores the mirror mutator** — fixed by Feature 0.
2. **`shuffleFoodWeights()` is unseeded.** Its weights are drawn with `Math.random()` at L6030 and it is called from the tick loop at L6457 whenever `chaos_seed` is active — so a seeded run with `chaos_seed` drafted is already non-deterministic, and the original plan's claim that L6464 was "the only resonance-era `Math.random()` in the tick loop" was false **[R1+R2]**. v12 converts L6030 to `seededRandom()`, closing the leak rather than widening it (the original spec would have doubled the cadence *and* added a second caller).
3. **`Math.random()` in the invert cadence** (L6464) → `seededRandom()`.

**`addScore` is not modified.** Both reviews showed the original plan's multiplier placement was arithmetically wrong: `golden_food`'s ×3 is applied to `amount` at L1846-1847, *before* the `Math.min(totalMult, 4)` cap at L1860, so the cap does not bound it — `addScore(100)` under `golden_food` + hoard is `100→300→×1.5 = 450` today (pinned by `test-v9.mjs:224`, which asserts 45 for `addScore(10)`) **[R1+R2]**. Hooking the food sites instead leaves `addScore` untouched, which also preserves the existing source-text assertions on it (`test-v11.mjs` L111-113, L265-266) without re-pinning.

**Stated consequence:** because XP is doubled at the food sites, a Chaos Gold run at level ≥ 20 accrues `xpOvercharge` about twice as fast, which feeds `getOverchargeMultiplier()` (L1826-1828) into `addScore`'s `multi`. That is bounded by the existing `Math.min(0.50, …)` cap and by the ×4 total cap, so there is no unbounded loop — but it is a real, accepted side effect and is recorded here rather than discovered later **[R2]**.

**LOC:** ~215. `tickResonance()` + effect bodies (~85), food-site multipliers (~15), Feature-0-dependent input work (~40), HUD glyph + first-fire onboarding (~25), additive snapshot fields (~10), both reset sites (~10), assertions (~80 in `test-v12.mjs`). The earlier revision understated this at ~200 while itemising ~245; **~215 is the number used in the cycle total** **[R1]**.

**Scores:** Impact 5 / Feasibility 3 / Risk 4 / Synergy 5

### Failure modes and their catches

- *Timer re-arms every tick.* `activeResonance` is recomputed at L6462 every tick, so cadence state must live in its own module-scope counters, never on the resonance object. **Catch:** draft `gravity`+`mirror`, drive 200 ticks, assert the Quantum window opened 13-20 times, not 200.
- *Inversion changes nothing observable.* The failure the reviews predicted for the original spec. **Catch (exact, not a screenshot):** with `activeMutators = ['gravity','mirror']` and the window forced open, pressing ArrowLeft must queue `(0, -TILE_SIZE)` (swapped, then mirror-negated on a zero `dx`) rather than `(+TILE_SIZE, 0)`. Assert on the vertical axis, where the mirror flip is a no-op **[R1]**.
- *Inversion kills the player.* Structural (see the spec) — the swap can never be a reversal. **Catch:** hold a straight line, force the window open, press all four directions, assert `gameState === 'playing'` and the heading never reversed.
- *Skipped early return.* Calling `advanceShrinkZone()` from the hunger branch without propagating its `gameOver(); return;` continues the tick on a dead snake. **Catch:** enter Apocalypse, park on the boundary, `driveTicks` until the zone passes, assert `gameState === 'gameover'`.
- *Score inflation, quantified.* `doubleGold` and `feastFamine` multiply at the food site, which is *before* `golden_food`'s ×3 in `addScore`. **Catch:** with no prestige, no hoard, no pigment rush, no hazard adjacency and `golden_food` + `chaos_seed` drafted, one forced `common` eat must add **exactly 60** (`10 ×2 ×3`) and `sessionXP` must rise by **exactly 50** (`25 ×2`). Repeat with `pigmentRushActive` and assert the specified number (180). These are the three numbers that pin multiplier placement unambiguously **[R2]**.
- *Hunger pause makes the run immortal.* Ethereal pauses hunger only on phase ticks and only widens rather than removes self-collision. **Catch:** run Ethereal 300 ticks, assert `snake.length` still decreases; separately assert the 3-in-5 self-exemption window does not read as permanently self-safe.
- *`rivalShrink` never fires.* The rival eats only the single global `food` (L3211), so trigger frequency depends on rival AI proximity. **Catch:** drive a real run with a rival and assert `advanceShrinkZone` was reached at least once, rather than asserting the call site exists.
- *Snapshot.* All new fields additive; `SNAPSHOT_VERSION` untouched; a pre-v12 snapshot must restore with defaults. **Catch:** load a pre-change snapshot into the changed build.
- *Reachability.* Draft mode (L7924) plus cascade multi-pick (L7854-7867) makes 2- and 3-mutator runs selectable — a precondition for shipping this at all. Note that forcing `activeMutators` via `page.evaluate` bypasses `resetGame()`'s clearing (L2188) and the draft handler's `spawnRival(1)`/`startGame()` ordering (L7861-7881), so at least one assertion must use the real draft path **[R2]**.

### Verification in the running game

A screenshot of a score cannot distinguish ×2 from ×3, and a screenshot cannot show that hunger popped every 30 ticks rather than 50 — so for `doubleGold`, `feastFamine` and `rapidDoom` the evidence is **the exact numeric delta** (above), not a picture. Screenshots are the evidence only where the observable is visual: the Ethereal translucency, the Quantum telegraph glyph, and the `chaosCycle` HUD phase marker — three screenshots, plus the exact-delta assertions for the rest. This replaces the previous revision's vague "eight screenshots minimum" and its reference to a snake "health bar", which does not exist anywhere in the file **[R1+R2]**.

The verification gate: **pass 1** (`intangiblePhase`, `doubleGold`, `rivalShrink`, `feastFamine`, `rapidDoom`, `chaosCycle`) must be fully green *and* observed before **pass 2** (`invertControls`, `quantumToggle`) begins. If pass 2 cannot be verified, pass 1 still converts six advertised resonances into facts — the issue's gap #1 — and pass 2's two descriptors are rewritten rather than left lying **[R1+R2]**.

---

## Feature B — Hazard Phase Telegraph

**Concept.** A hazard is lethal only while `phase === 'on'` (`isHazardCollision`, L3657-3666), cycling 15 ticks on / 10 ticks off (L3602-3603). There is no advance warning: it snaps from safe to lethal in one tick. The on-phase pulse alpha (`0.25 + 0.15*sin(renderTime/150)`, L4807) dips to 0.10 while the off-phase is a flat 0.08. v12 adds a two-tick pre-ignition flash and a thin countdown arc driven by the existing `phaseTimer`, and raises the pulse floor.

**Corrected framing [R1]:** the two states are *not* indistinguishable today — the on-phase already draws a solid lethal border (L4817-4823) that is absent when off, and calm mode already uses a steady alpha. The defect is narrower and still real: down to a one-tick gap, nothing tells the player *when* ignition comes. The border is the strongest existing cue and must be preserved, not replaced.

**Why.** Three shipped features (Hazard Zones v10 C, Hazard Chain v11 A, Hazard Melt v11 B) rest on the player reading the phase clock. Needs **no new state** — `phase` and `phaseTimer` already serialise (snapshot L2691, restore L2858). Note that `seedOffset` is written at spawn (L3645) and serialised but **never read** by `tickHazards`; v12 does not depend on it and corrects the AGENTS.md claim that it provides a phase offset **[R2]**.

**LOC:** ~65. ~20 pre-ignition cue, ~10 pulse floor, ~25 countdown arc, ~10 calm-mode parity, ~10 assertions.

**Scores:** Impact 3 / Feasibility 5 / Risk 2 / Synergy 4

**Failure modes**
- *Telegraph disagrees with lethality.* The flash reads `phaseTimer`; the kill check reads `phase`. Deriving the cue from the wrong field makes the game flash "safe" while lethal. **Catch:** `driveTicks` while sampling `{phase, phaseTimer}` each tick; assert the flash window is exactly the 2 ticks before `phase` flips to `'on'`.
- *Canvas state.* `drawHazards` already has two independent `save()`/`restore()` pairs (L4806/L4824 for the hazard loop, L4833/L4840 for the v11 A adjacency ring) and v11 already corrupted this function once. New drawing must land inside the correct pair. **Catch:** a save/restore depth check on the `ctx` object across one `drawGame()` call in a hazards-enabled mode, over a run long enough to include on→off→on transitions. The previous revision delegated this to a "Feature G" that does not exist and to a test that does not exist — the only canvas assertion in the suite (`test-feature-d.mjs` L105-113) calls `drawGame(1)` once and checks it did not throw, which is exactly the shape that was green while v11 shipped transform corruption **[R2]**.
- *Arc coordinates.* The arc is drawn inside the play-area translate, so it must be centred on `h.cx + TILE_SIZE/2` (matching the existing gradient centre at L4808), not on `h.cx` **[R1]**.
- *Per-frame allocation.* The function already allocates a radial gradient per hazard per frame; the arc must use a flat `strokeStyle` as the bounty ring does (L4476-4503), not a second gradient.
- *Calm mode.* Calm gates *oscillation*, never information — the arc stays, the pulse stops.

**Verification in the running game.** Four screenshots of the same hazard: off-phase, 2 ticks before ignition, on-phase, and across the ignition tick — human-checked for "would I have known the next tick kills me".

---

## Feature C — Recap Truth: death cause and cascade disclosure

### C1 — the recap card never says what killed you

`lastDeathCause` is a module-scope string (L745) written at **18 sites**: 1 reset (L2137) and **17 message writes** — **10 deaths** (L2573, 6438, 6597, 6602, 6655, 6689, 6853, 7009, 7090, 7156) and **7 saves** (L6556, 6580, 6591, 6610, 6632, 6648, 6697) **[R1+R2]**. It is spoken to screen readers (L3327) and persisted as `deathCause` (L514), but `drawRecapCard()` (L3467-3517) — the branch every non-gauntlet death takes since v8 D — never renders it. Only the gauntlet path (L6302) and the legacy fallback (L6308) do.

Because a save does **not** end the run, the field currently reports a rescue as the cause of death whenever a save is the last thing written before the run ends — most visibly in Zen, where `endZenSession()` never writes the field at all, and in the hazard path where the Vampire brew save (L6648) is the most common write of the two "Vampire Brew saved you" strings **[R1+R2]**.

**Fix:** split into `lastSaveEvent` (the 7 save writes) and `lastDeathCause` (the 10 death writes). The recap renders the cause and, when a save occurred in the same run, a separate "saved once" line. `endZenSession()` sets an explicit Zen cause. The diary keeps the field name `deathCause` and its meaning — after the split it simply stops lying, without a schema change.

### C2 — the cascade penalty silently halves your score

`getCascadeMultiplier()` (L902-906) returns 0.5 for any run with 2+ mutators and `gameOver()` applies it at L3320-3323. `addScore()` calls `updateScoreDisplay()` with no cascade factor, so the HUD reads the raw score all run and the recap shows the halved value — a silent 50% haircut. `DESIGN_v6.md` (L184) required a HUD indicator; it was never built.

**Fix, corrected [R2]:** `gameOver()` overwrites `score = Math.floor(score * cascMult)` at L3322 and only calls `buildRecapData()` at L3345 — the raw score is **destroyed before the card is built**, and `score / 0.5` cannot recover it (the `Math.floor` loss is unrecoverable and is wrong for odd scores). v12 captures the pre-cascade value into `sessionRawScore` at the multiply site so the card can render `raw → final` honestly.

**The 0.5 formula itself is not changed** — that is a balance decision, and altering it would invalidate the scale of every existing `modeHighScores` and `snake_daily_lb` entry. Disclose, do not rebalance.

**HUD placement, resolved [R2]:** there is no free HUD slot. The bottom-left rows are occupied by the combo-bank badge (`CANVAS_HEIGHT-28`, x=5, L5515-5516) and the XP bar (`CANVAS_HEIGHT-22`, L5477); the top-right carries the mutator and resonance lists. The cascade factor is therefore **appended to the existing combo-bank badge string** rather than added as a second badge — one `fillText` site, no collision possible. The badge reads as a warning (`⚠ ×0.5 score`), not a bare multiplier.

**LOC:** ~75. Splitting the 17 writes (~15), recap rows + `cardH` reflow (~25), `sessionRawScore` capture (~5), badge string extension + draft-screen disclosure near L6084 (~15), assertions (~15).

**Scores:** Impact 4 / Feasibility 4 / Risk 2 / Synergy 4

**Failure modes**
- *Card overflow.* `cardH = 168` (L3471), 3 quest rows from `cardY + 100` (L3505), retry prompt at `cardY + cardH - 22` (L3515). Adding two rows without growing the card overprints the prompt. **Catch:** screenshot gameover with 3 quest deltas + a death cause + a cascade line, at the default viewport and at the 300px minimum, and confirm the border and prompt are inside the card.
- *Stale cause on Zen.* **Catch:** trigger a streak-charge save, then end a Zen session; assert the recap reads a Zen cause, not the rescue.
- *Diary schema.* L514 keeps its key and meaning.
- *Save reported as death.* **Catch — the case the original plan missed [R1+R2]:** die immediately after each of the seven saves (melt, vampire-collision, serpentine, phoenix-wall, phoenix-rival, vampire-hazard, streak-charge) and assert the card names the death, not the rescue. Seven running-game cases.
- *Badge collision.* **Catch:** screenshot in **Classic** with cascade on, 5 banked combo charges and a mutator active. The previous revision specified daily mode, where the draft gate (L7924) makes a mutator and therefore a cascade factor impossible **[R2]**. Gauntlet truncates to ≤1 mutator (L2474-2476), so the badge must be absent there.

**Verification in the running game.** Die once by each of obstacle, self, wall, hazard, rival, starvation — six screenshots naming the right cause.

---

## Feature D — Help & Legend Truth Pass

**Concept.** `drawHelpOverlay()` (L4146-4231) hand-copies facts that live in `FOOD_TIERS` (L1288-1302), and they are wrong: it prints **40%** for Common and **15%** for Bonus (L4194, L4198) while the real weights are **0.33** and **0.13** (L1291, L1295); it lists six of the **eight** food types, omitting **hunter** and **bomb**; and colours are already index-derived (`foodColor(Object.keys(FOOD_TIERS)[i])`, L4205) while names are hard-coded, so inserting a tier today silently miscolours the whole table.

**Corrected claim [R1+R2]:** the controls column documents 10 bindings, and `M`, `Tab` and `F` **are** among them (L4169, L4172, L4173) — the original plan listed them as missing. The genuinely undocumented keys are **12**: `S` (L7905), `X` (L7954/L7965), `Z` (L7960), `Y` (L8046), `D` (L8060), `R` (L8068), `V` (L8087), `G` (L8094/L8118), `B` (L8162), `J` (L8177), `Q` (L8184), `K` (L8219) — four of which are context-scoped (`C` cascade-in-draft vs cosmetics-in-idle L7833/L8155; `X` combo-bank-in-play vs prestige-at-idle L7954/L7965; `R` draft-reroll vs snapshot-resume L7891/L8068; `S` draft-navigation vs settings L7816/L7905), so the table needs a context column rather than a flat list. Also corrected: `showFoodLegend()`'s *points* (L7460) are accurate today — it omits `bomb` only, and does not print weights at all **[R2]**.

v12 derives the food table from `FOOD_TIERS` and the controls list from one `HELP_BINDINGS` array, so a future rebalance or a new binding cannot desync the printed text.

**LOC:** ~100. ~35 derived tier table (+ `icon`/`blurb` on the eight tier defs), ~30 `HELP_BINDINGS` with a context column + render, ~15 hunter/bomb blurbs and high-contrast letters, ~20 legend string shared by both surfaces, ~10 assertions on the derived percentages.

**Scores:** Impact 4 / Feasibility 4 / Risk 2 / Synergy 3

**Failure modes**
- *Layout collision.* Everything below the controls table is offset from `modeY = controlY + 20 + controls.length * 18 + 10` (L4212) and the footer sits at `CANVAS_HEIGHT - 10` (L4229); the canvas is 440×600. Adding ~12 rows on an 18px rhythm pushes `modeY` into the mode list. **Catch:** open help at the default viewport and at the 300px minimum, screenshot, confirm no overlap and a visible footer. Two columns, or the mode list moves.
- *Colour/name desync.* Colour must be derived from the same key being rendered, not from an index into a filtered list.
- *`showFoodLegend` has two owners.* Feature E routes it through the toast queue (step 1); Feature D rebuilds its content (step 2). The shared string must be specified once: the legend keeps its single-line **points** format (that is what fits a toast) and *gains* `bomb`; the weight/percentage table belongs to the help overlay only **[R2]**.
- *`HELP_BINDINGS` is hand-maintained*, so the "cannot disagree" property holds for the food table but only "cannot silently omit" for bindings. Stating this rather than implying enforcement **[R2]**.

**Verification in the running game.** Screenshot the help overlay and the `L` legend; assert every printed percentage equals `Math.round(FOOD_TIERS[k].weight * 100)` read from the live page.

---

## Feature E — Toast Pipeline Integrity

**Concept.** `queueToast()`/`processToastQueue()` (L7466-7489) is the game's only non-canvas notification channel and the delivery mechanism for about twelve systems. Three verified defects:

1. **The queue is never cleared.** `toastQueue` (L1081) is declared, pushed and shifted and nothing else; `resetGame()` (L2135) and `resetWaveState()` (L5774) do not touch it. Six systems can queue from one `gameOver()`, totalling ~22 s of messages **[R2]** — stale "Achievement unlocked" toasts bleed into the *next* run, drawn over a live board.
2. **The queue is unbounded.** `pushTransientRing` caps at 50, `spawnParticles` clamps at `500 - particles.length`; the toast queue has no cap at all.
3. **`showFoodLegend()` bypasses the queue** (L7458-7465) — it writes `toastEl.textContent` and starts its own 5 s `setTimeout`, so pressing `L` during an in-flight toast corrupts it.

v12 adds a bounded, priority-ordered queue, coalesces identical consecutive messages, calls `clearToasts()` and routes the legend through the queue.

**Correction [R1]:** `clearToasts()` is called from **`resetGame()` only**. `completeGauntletWave()` queues `'Wave N Complete! +pts'` (2000 ms, L5850) and the intermission's confirm handler calls `startNextWave()` → `resetWaveState()` (L5873), so clearing there destroys the only feedback for completing a wave in the common case. `resetWaveState()` is a mid-run reset; the toast channel is not per-run game state.

**LOC:** ~80. ~25 bounded/priority/coalescing queue, ~10 `clearToasts()` + generation counter + `resetGame()` wiring, ~15 legend through the queue, ~20 priority annotations on named high-frequency sites (health/hazard/bounty = high; cosmetics/achievements = normal; the rest default), ~12 assertions.

**Scores:** Impact 3 / Feasibility 5 / Risk 2 / Synergy 3

**Failure modes**
- *In-flight timeout survives the clear.* `processToastQueue` (L7472-7489) keeps no timer handle, so clearing the array does not cancel the pending hide; a new-run toast queued before it fires gets hidden early by the stale callback, which then calls `processToastQueue()` again. **Fix:** a `toastGeneration` counter bumped by `clearToasts()` and checked inside the timeout callback **[R2]**.
- *Dropping a message the player needs.* Evict lowest-priority-then-oldest, never evict below the cap.
- *Clearing kills a legitimate gameover toast.* `clearToasts()` in `resetGame()` runs when the player presses Enter to retry — correct — but must not be reachable from `startGame()` alone, since the recap card and its toasts render in the `gameover` state *before* Enter. **Catch:** die, let toasts drain, press Enter, assert none lost pre-Enter and none stale after.
- *Coalescing hides a real repeat.* Coalesce on exact message equality only.
- *Race with the legend.* **Catch:** queue two sentinels, call `showFoodLegend()`, sample `toastEl.textContent` every 250 ms, assert all three appear in order.

**Verification in the running game.** Trigger a stacked gameover (achievement + level-up + quest), screenshot the toast sequence, press Enter, screenshot the first 10 s of the new run and confirm the board is free of stale toasts.

---

## Feature F — Risk Income

**Concept.** Combo Bank charges (cap 5, spent with `Z`) are banked on exactly one event: a combo milestone (`comboCharges++` exists only at L6373). The bank is therefore fed exclusively by the safest play pattern — continuous eating. v12 adds **four** income sources from events that already exist and are already dangerous: bounty completion (L3565-3576), every third consecutive hazard-chain eat (L6993-7001), triggering the Hoard Pigment Rush (L7120-7128), and first reaching Titan or Apex (L2532-2537 — a `while` loop, so a multi-tier jump must bank at most one charge). No new state, no new UI, no new mechanic.

**Why.** Cheapest high-synergy item in the cycle, and the balance counterweight to Feature B: the hazard family becomes legible, and then pays out in a resource the player wants.

**LOC:** ~50. One `bankComboCharge(source)` helper (~15), four insertions (~12), reuse of the `hasSeenComboBank` onboarding guard (~8), assertions (~10).

**Scores:** Impact 3 / Feasibility 5 / Risk 2 / Synergy 5

**Failure modes**
- *Charge inflation.* Bounties fire every ~400 ticks and hoards every ~750, so a long run could sit at `FULL` permanently, turning Clear into an obstacle-deleting spam button. **Catch, as a measurement rather than an assertion [R1]:** instrument the spend count over a scripted 5-minute Classic run and report it on the issue; the remedy (raising spend costs to 2 charges) is a design-owner decision, and the measured number is what that decision needs.
- *Stale chain reads.* `hazardChainStreak` is reset at four sites; the every-third rule reads it at the eat moment. **Catch:** break the chain, then eat while adjacent; assert no charge banks.
- *Double-banking.* **Catch:** force a two-tier evolution jump (via `food2` stacking) and assert exactly one charge is banked.
- *Missed income site.* The eat block has four separate paths (bomb L6804, normal L6843, echo `food2` L7054, `extraFoods` L7113); a counter wired into one silently stalls on the others. **Catch:** exercise each path and assert the badge updates.

**Verification in the running game.** Complete a bounty and screenshot the counter incrementing; bank to FULL and screenshot the `FULL` state.

---

## Implementation Order

Least-risk-first, one owner per function, with a verification gate between each step. The mirror relocation is promoted to step 2 per both reviews; `showFoodLegend` has exactly one owner per step (E then D); `resetGame()` is touched by A, C and E and they land in that order **[R2]**.

| # | Step | LOC | Why here |
|---|---|---|---|
| 1 | **E — Toast Pipeline Integrity** | ~80 | Pure plumbing; fixes a live bug immediately; no game logic. |
| 2 | **Feature 0 — Mirror Flip Relocation** | ~10 | Standalone bug fix; every later input-touching effect depends on it being correct. |
| 3 | **D — Help & Legend Truth Pass** | ~100 | Pure text/layout; owns `showFoodLegend` after step 1 routed it. |
| 4 | **B — Hazard Phase Telegraph** | ~65 | Rendering only, no new state, no input path. |
| 5 | **C — Recap Truth** | ~75 | Presentation over existing state; `resetGame` already settled by A/C's ordering. |
| 6 | **A-pass1 — Resonance Completion, six non-input effects** | ~145 | State/score edits only, on top of a settled input path. |
| 7 | **A-pass2 — Resonance Completion, two input effects** | ~70 | The input path; highest risk, gated on pass 1 being observed working. |
| 8 | **F — Risk Income** | ~50 | Tuning on top of the now-stable bank. |

Cycle total: **~595 LOC**, of which ~80 is assertions.

---

## Verification Strategy (applies to every feature)

1. **Load smoke first.** `node test-bugfixes.mjs` — "No JS errors on load" is the canary for the module-scope binding contract (one typo'd identifier at module init halts the entire script).
2. **Suite green.** All 11 existing suites, every assertion accounted for, plus a new `test-v12.mjs`. Every feature below carries an explicit assertion budget — the previous revision funded assertions for only Features A and F and shipped B, C, D and E on screenshots alone **[R1]**.
3. **Source-text assertions are re-pointed, not deleted.** 37 `.toString()` assertions exist across the suite, several of which are the only coverage of the `addScore` cap, the hazard-chain multiplier, the dual-reset contract and the `endZenSession` parallel hook. The rule is narrowed: delete only assertions the patch genuinely invalidates, and replace each with a behavioural assertion of the same invariant. Feature A is designed so that `addScore` is not edited at all, which keeps `test-v11.mjs` L111-113 and L265-266 valid; `test-v11.mjs` L178/L233 set `dirQueue`/`lastConsumedDir` directly, so the relocated mirror flip must be re-checked against them **[R1+R2]**.
4. **Running game.** Each feature names the exact screenshot or exact numeric delta a human must check. Captured during implementation, not asserted afterwards.
5. **Snapshot back-compat.** A pre-v12 snapshot restores with additive fields defaulting; `SNAPSHOT_VERSION` is not bumped.
6. **Determinism.** Daily-seeded runs produce identical food and hazard sequences before and after. After v12 there is **no** `Math.random()` reachable from a seeded path except `pickRandomGauntletPicks` (L5858), which is not part of any seeded mode **[R1+R2]**.

---

## Out of Scope

Named candidates this cycle deliberately does **not** build, each with the evidence that would un-park it. 27 ideas were generated; these are the substantive rejections.

- **Rift Harvest** (score for standing inside an off-phase hazard; ~110 LOC, I4/F4/R3/S5). The strongest new-mechanic idea in the set, and it depends on the telegraph Feature B is only now shipping. It asks the player to stand in lava within a ~1.2 s window; shipping the mechanic and its readability together repeats v11's mistake. **Revisit when:** Feature B has been played for a full session and the phase clock reads clearly.
- **Gauntlet Wave Modifiers** (~120 LOC). Would add the first real content to the thinnest mode, and would arm the latent trap that `resetWaveState()` never clears `hazards` (verified: `hazards = []` exists only at L2244) — inert today purely because gauntlet disables hazards. It also adds two instant-death sources to a run-ends-on-death mode with no playtest data. **Revisit when:** the telegraph has shipped and a wave-level hazard budget has been playtested.
- **Streak Freeze Vault** (~70, I4/F5/R2/S4) and **Quest Cadence Ladder** (~85, I4/F4/R3/S5). Good retention ideas that add a *second* longitudinal streak beside `snake_streak_count`, which already gates four cosmetics, the death-insurance charges and the XP multiplier. Two adjacent streaks need a naming/UI decision that is a design-owner call. **Revisit when:** the meta layer is the cycle's focus, with the naming decided up front.
- **Achievement Progress Meters** (~130), **PB Chase HUD** (~50), **Records Board** (~80), **Milestone Wall** (~65), **Collection Index** (~105), **Session XP Ledger** (~100), **Weekly Wrap Card** (~145). Presentation-only meta surfaces. All cheap, none changes what a run feels like, and the recap card already carries four of them from v8 D. Deferred as a bundle.
- **Canvas State Leak Guard** (~80). A runtime depth-counter around `ctx.save`/`ctx.restore` to catch the v11-class transform corruption. The reasoning for deferring it stands (it patches the shared `ctx`, the very surface it protects), **but** Feature B needs a minimal version of exactly this check — a save/restore depth assertion across one `drawGame()` in a hazards-enabled mode — so a one-function version ships inside B rather than the general guard **[R2]**. The two `ctx` shadowing sites found during ideation (`checkAchievements` L7526, `drawFloaters` L6095) are noted but not renamed: neither draws today, so renaming is unrelated cleanup.
- **Tick Cadence Telemetry / drift normalization** (~60). The ideation agent's own assessment was that the drift is probably a few percent, and the fix rewrites the loop everything depends on. **Revisit when:** a measured drift number justifies it.
- **Rift-Tainted Food** (~110). Touches the most-cited fragile invariant in the codebase (weights sum to 1.00, no normalization) plus six peripheral sites. Not while the budget belongs to correctness.
- **Mutator Contracts** (~180, I4/F3/R4/S5). Attractive — mutators are the only system whose sole score interaction is a penalty — but it is eight bespoke counters across four separate eat paths. It should follow the resonance work, which touches the same mutator block.
- **Bounty Streak** (~80), **Threat Clock** (~120). Escalation systems layered on cadences Feature A is about to make *conditional*. Tuning an escalation ladder against cadences moving in the same cycle ships numbers nobody has verified.
- **Quest Reroll** (~85). Deliberately pokes the quest determinism invariant v11 D established, and its failure mode silently corrupts the persisted board.
- **Screen-Reader Announcement Channel** (~105, I4/F4/R3/S4). The coverage gap is real — `srSpeak` has a one-slot last-write-wins queue that drops messages, and ~10 events added since v6 never announce. Deferred, not rejected, because its acceptance criterion is usability by a human listener and this cycle cannot honestly verify that. Feature E's priority lanes are designed so it can be built on top. **Revisit when:** a human can sit with the game and judge it.

**Nothing else.** No new modes, no new currencies, no new DOM panels (so the 7-site cross-hide contract is untouched), no new food tiers, no new snapshot version, no dependencies, no backend. **AGENTS.md is updated as part of cleanup** for: the relocated mirror flip, the resonance descriptors, the cascade badge, the corrected `HOARD_INTERVAL`/`HOARD_DURATION` values, the dead `seedOffset` field, and the stale `drawOverlay` leak note **[R1+R2]**.
