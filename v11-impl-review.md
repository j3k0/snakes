# Snakes v11 Implementation Plan — Review (Implementation Correctness)

Reviewer scope: verify every claimed line number and function name in IMPL_PLAN_v11.md against `snake.html` (8033 lines, commit cfaf4f0); confirm review-1 and review-2 critical/high findings were incorporated; assess implementability.
All line references below are to `snake.html` unless prefixed "plan L###".

---

## Critical-Finding Incorporation Summary

| Finding | Review 1 | Review 2 | Plan v11 status | Verdict |
|---|---|---|---|---|
| C1 daily seed | C1 ✅ | C1 ✅ | Plan §D step 1 (L53–57): seeds `seedPrng = mulberry32(getDailySeed())` in `startGame()` daily block after L2293 | **Incorporated** — but see [CRITICAL-1] below (resetGame hole) |
| C2/C3 streak in checkPlayerDeath | C2 ✅ | C3 ✅ | Plan §E step 5 (L159–163): `tryStreakChargeSave` invoked after vampire in each lethal branch, returns false | **Incorporated** ✅ |
| H1 pigmentRushTimer in tick loop | H1 ✅ | M5 ✅ | Plan §C step 5 (L195–197): decay in `updateGame()` L5970–5973, not `animateVisuals()` | **Incorporated** ✅ |
| H2 addScore(amount) no sig change | H2 ✅ | — | Plan §A step 4 (L88–90): `addScore(amount)` at L1777, inject `hazardChainMult` into L1800 product, no parameter | **Incorporated** ✅ |
| H3 comboHeatColor vs haloColor | H3 ✅ | — | Plan §B steps 3–4 (L128–134): split — `comboHeatColor` L4891 (body tint at L5011) and inline `haloColor` L4924 (head halo) | **Incorporated** ✅ |

All five critical/high findings from the prior reviews are addressed in the plan. Line numbers verified correct against snake.html.

---

## [CRITICAL]

### CRITICAL-1. Plan §D step 6 claims `seedPrng`/`activeSeed` are cleared in `resetGame()` — FALSE; daily seed leaks across runs

**Plan ref:** §D step 6 (L67): *"`activeSeed`/`seedPrng` are already cleared in `resetGame()` (verify — grep `seedPrng = null` in resetGame)."*

**Verified reality:** `resetGame()` (L2055–2178) does NOT contain any `seedPrng = null` or `activeSeed = null` assignment. Grep of the resetGame body returns zero matches. The only places `seedPrng` is set to null are: `seedClearBtn` handler (L8027), empty-seedField handler (L8014), and `restoreFromSnapshot` (L2646). `activeSeed` is set to null only at L411 (declaration), L2642 (restore), L8013/L8026 (seed UI handlers).

**Consequence:** If Feature D seeds `seedPrng = mulberry32(getDailySeed())` in the daily block (after L2293) but never clears it, then when the player returns to the menu and starts a **Classic/TimeAttack/Snap** run (which the plan explicitly says should remain non-deterministic, §D step 4, L65), `seedPrng` is still set from the prior daily run. Every `seededRandom()` call in the non-daily run would be deterministic — Classic food spawns become reproducible from the stale daily seed. This breaks the plan's stated invariant (§D step 4): *"Classic/TimeAttack/Snap keep `seedPrng = null` → `seededRandom()` → `Math.random()` (unchanged)."*

This is the exact latent bug the plan claims to avoid, reintroduced by the fix itself. The plan's own verification step (§D Verify, L71: "restart with same date, confirm same 3 positions") would pass, but a hidden regression in Classic mode would ship.

**Fix:** Add to `resetGame()` (L2055, near the existing `hazards = []` clear at L2142):
```js
activeSeed = null;
seedPrng = null;
```
Then in `startGame()` daily block (after L2293), the plan's seed assignment runs AFTER resetGame has cleared. The existing `seedField`/`seedRandomBtn` handlers (L8009–8027) set these vars BEFORE `startGame` is called (they fire from the idle screen), so they will re-seed correctly. Update plan §D step 6 to: "Add `activeSeed = null; seedPrng = null;` to `resetGame()` (L2055, near L2142). The seedField/seedRandomBtn handlers (L8009–8027) re-seed before `startGame` when the player sets a manual seed."

**Severity rationale:** Without this, Feature D silently makes Classic mode deterministic with a stale daily seed — a regression in the most-played mode. The plan explicitly relies on this invariant and asserts it is already true when it is not.

---

## [HIGH]

### HIGH-1. Plan §F step 4 claims `importSaveData` "validate each key" — the function does a blind bulk-set, no per-key validation exists

**Plan ref:** §F step 4 (L35–36): *"In `importSaveData(file)` (L1709): On import, validate each key; quarantine failures with `queueToast` listing rejected keys."*

**Verified reality:** `importSaveData` (L1709–1727) does NOT iterate or validate keys. It does a single bulk `localStorage.setItem` loop at L1720: `Object.keys(data.keys).forEach(function(k) { localStorage.setItem(k, data.keys[k]); });`. There is no per-key JSON.parse, no validator call, no quarantine hook. The function also returns after the confirm dialog (L1719) — there is no validation layer to extend.

**Consequence:** The plan's instruction "validate each key; quarantine failures" implies a small addition, but it requires rewriting the import loop to: (1) read each raw string, (2) attempt JSON.parse with the appropriate validator (which the importer doesn't know — validators are passed per-call-site in `getJSON`, not stored centrally), (3) on failure copy to `snake_corrupt_` prefix and collect for the toast. This is a structural rewrite, not an additive hook, and the plan treats it as a 1-line addition within "~90 LOC" for Feature F.

**Fix:** Either (a) reduce the import scope to: "after the bulk `localStorage.setItem` loop (L1720), re-run the load-time validation pass (the same `getJSON` calls that populate `quarantinedKeys` at module init) and toast if any newly-imported key quarantines" — this reuses the existing quarantine path without a per-key validator lookup. Or (b) drop the import-validation step entirely from Feature F (the export-backup button at step 6 still covers the quarantine-recovery use case; the import path is a separate robustness concern). The plan must pick one and not leave step 4 as an underspecified rewrite.

### HIGH-2. Plan §E step 4 threshold-grant tracking key has no reset-on-streak-break path specified

**Plan ref:** §E step 4 (L156–158): *"`STREAK_CHARGE_DAYS = [7, 14, 30]` — on daily game start, if streak hits a threshold AND not already granted this cycle, increment `streakCharges`... Track last-granted threshold per streak cycle via a `snake_streak_charge_granted` save key (store the threshold index, reset when streak resets to 0)."*

**Verified reality:** The streak-break logic is in `startGame()` daily block at L2283–2285: `streak = 1; // Broken streak, restart`. The plan says to "reset when streak resets to 0" — but the codebase never sets streak to 0; a broken streak resets to **1** (L2284), not 0. A first-ever play sets it to 1 (L2289). So the reset condition "streak resets to 0" never fires.

**Consequence:** The `snake_streak_charge_granted` key would never reset, so after hitting day 7 (grant charge), then breaking the streak, then rebuilding to day 7, the grant would NOT fire again because the stored threshold index (7) is already marked granted. The player earns one charge ever, not one per streak cycle.

**Fix:** Change the reset condition from "streak resets to 0" to "streak resets to 1" (i.e., reset `snake_streak_charge_granted` in the broken-streak branch at L2283–2285 and the first-play branch at L2287–2290). The plan must specify the exact reset site: in `startGame()` daily block, when `streak = 1` is assigned (both L2284 and L2289), also `saveManager.set('snake_streak_charge_granted', -1)` (or 0, whichever sentinel represents "no threshold granted this cycle").

---

## [MEDIUM]

### MEDIUM-1. Plan §A step 3 adjacency probe reads `h.radius` but the hazard radius is dynamic (bell curve) — the "fixed ring" claim is only half-fixed

**Plan ref:** §A step 3 (L85–86): *"check if any hazard has `phase === 'on'` AND `dist > h.radius && dist <= h.radius + TILE_SIZE` (Manhattan, fixed 1-tile ring around the lethal zone — 'near but not in')."* and *"This is a fixed-ring adjacency, NOT scaling with `h.radius` (review H1 fix)."*

**Verified reality:** `h.radius` expands and contracts on a sine bell curve from `TILE_SIZE * 0.8` to `HAZARD_MAX_RADIUS` (= `2.5 * TILE_SIZE`, per L3376). The adjacency ring is `h.radius + TILE_SIZE`, which at peak radius is `3.5 * TILE_SIZE` and at min is `1.8 * TILE_SIZE`. The plan's text says "fixed 1-tile ring" but the formula `dist <= h.radius + TILE_SIZE` is NOT fixed — it scales with the dynamic radius. The plan contradicts its own parenthetical: it says "fixed-ring adjacency, NOT scaling with `h.radius`" while specifying a formula that scales with `h.radius`.

Review-1 H1 and review-2 H1 both flagged this exact contradiction. The plan's response (§A step 3) resolves the *lethal-vs-adjacent* distinction (dist > h.radius excludes the lethal zone) but does NOT resolve the *scaling* issue — the ring still breathes with the hazard lifecycle. This is a gameplay feel issue (the bonus zone grows/shrinks each tick) and a plan-internal contradiction (says "fixed", specifies "scaling").

**Fix:** Pick one explicitly. If the intent is a fixed ring, use a fixed distance from the hazard CENTER: `dist > TILE_SIZE * 2.5 && dist <= TILE_SIZE * 3.5` (constant, independent of `h.radius`). If the intent is "one tile beyond the current lethal edge" (breathing ring), delete the word "fixed" and say "1-tile buffer beyond the current dynamic radius; the bonus zone expands and contracts with the hazard's bell-curve lifecycle." The current wording will mislead the implementer.

### MEDIUM-2. Plan §A step 4 global cap formula is stated two different ways

**Plan ref:** §A step 4 (L88–91):
- L89: *"`score += Math.round(amount * multi * effectiveHoardMult * hazardChainMult);`"*
- L91: *"`var totalMult = Math.min(multi * effectiveHoardMult * hazardChainMult, 4);` then `score += Math.round(amount * totalMult);`"*

These are two different L1800 replacements. The first (L89) has no cap; the second (L91) caps the product at ×4. The plan's "Cross-Feature Interactions" section (L225) restates the cap: *"`Math.min(multi * effectiveHoardMult * hazardChainMult, 4)`"*. So the cap is the intended final form, but step 4 shows the un-capped line first (L89) and then the cap as a separate sentence (L91), which an implementer speed-reading could implement as two separate statements (uncapped multiply, then a capped multiply that overwrites).

**Fix:** Replace L89 with the capped form directly and delete the redundant L91 sentence. Step 4 should read: "L1800 becomes: `var totalMult = Math.min(multi * effectiveHoardMult * hazardChainMult, 4); score += Math.round(amount * totalMult);`" — one statement, one cap.

### MEDIUM-3. Plan §C step 4 golden_food + rush cap (×2) interaction with the global ×4 cap is ambiguous

**Plan ref:** §C step 4 (L193): *"When `golden_food` mutator active AND `pigmentRushActive`: cap at ×2 (so Golden Age + Rush = ×4 max, not ×6 — mirrors existing hoard+golden cap at L1797)."* Then L194: *"The global multiplier cap from Feature A (×4 on `multi * effectiveHoardMult * hazardChainMult`) applies here too."*

**Verified reality:** L1797–1798 already caps `effectiveHoardMult` at `Math.min(scoreMultiplier, 1.5)` when golden_food is active (hoard ×2 → ×1.5, so Golden Age + Hoard = ×4.5). The plan's Feature C says rush replaces hoard ×2 with ×3, and with golden_food caps at ×2. But the global cap (Feature A, ×4) caps the FULL product `multi * effectiveHoardMult * hazardChainMult`. So the two caps interact: `effectiveHoardMult` is first capped at ×2 (golden+rush), then the whole product is capped at ×4.

The plan doesn't state the ordering of these two caps. If `multi = 1.5` (pinnacle), `hazardChainMult = 2.5` (max streak), and `effectiveHoardMult = 2` (golden+rush), the product is `1.5 * 2.5 * 2 = 7.5`, capped to ×4. But if `effectiveHoardMult` were capped at ×3 (rush, no golden), product = `1.5 * 2.5 * 3 = 11.25`, capped to ×4. So the golden+rush ×2 cap is redundant whenever the global ×4 cap fires — which is always when hazardChainMult > 1. The plan doesn't note this redundancy.

**Fix:** Clarify: "The golden+rush ×2 cap (L1797-style) only matters when `hazardChainMult === 1` (no hazard adjacency). When hazard-adjacent, the global ×4 cap dominates. Both caps apply in sequence (effectiveHoardMult capped first, then the full product capped) — this is belt-and-suspenders, not a bug." Add this as a note so the implementer doesn't think the two caps conflict.

### MEDIUM-4. Plan §E step 9 display site L4335–4340 streak block has no save/restore wrapper (pre-existing leak, plan should not worsen)

**Plan ref:** §E step 9 (L171): *"streak block at L4335–4340 (inside `drawOverlay`, idle screen) — add `🛡×` + `streakCharges` glyph."*

**Verified reality:** The streak block (L4335–4341) sets `ctx.fillStyle` (L4337) and `ctx.font` (L4338) then `fillText` (L4339) without a wrapping `ctx.save()`/`ctx.restore()`. This is a pre-existing leak (review-1 H4 flagged it). The plan adds a new `fillText` to this block but does not mention wrapping it. The plan's invariant matrix (L264, Canvas save/restore column E) claims "✓ (streak HUD)" — implying compliance — but the plan does not instruct the implementer to add a save/restore.

**Fix:** Add to step 9: "Wrap the new `🛡×N` fillText in `ctx.save()`/`ctx.restore()` (or, as cleanup, wrap the whole daily-info block L4320–4357). The pre-existing leak at L4335–4341 is not a regression, but the new glyph should not worsen it."

### MEDIUM-5. Plan §B step 2 death-save chain omits the rival-collision path (L6256–6301) from the streak-charge wiring

**Plan ref:** §B step 2 (L124–127) and §E step 5 (L161–162) list two paths: hazard (L6238) and collision (L6187). §E step 5 says "Hazard path (L6238-area): after vampire (L6246)... Collision path (L6187-area): after vampire (L6201), before serpentine (L6206)."

**Verified reality:** `checkPlayerDeath` (L6186–6303) has THREE lethal branches with their own shield/vampire saves, not two:
1. Self/obstacle collision (L6187–6215): shield (L6188), vampire (L6196), serpentine (L6206), death (L6215).
2. Wall death (L6217–6234): phoenix-only save (L6221), no shield/vampire — death (L6233).
3. Hazard (L6238–6254): shield (L6239), vampire (L6246), death (L6254).
4. Rival collision (L6256–6301): shield (L6276), phoenix (L6285), death (L6297).

The plan's "collision path (L6187-area)" conflates branches 1 and 4. The rival-collision branch (L6256–6301) has its OWN shield (L6276) and a phoenix save (L6285), but NO vampire save. The plan says "after vampire (L6201), before serpentine (L6206)" for the collision path — but the rival branch has neither vampire nor serpentine. If `tryStreakChargeSave` is only wired into the two paths the plan names, a death by rival collision (L6297) would NOT consume a streak charge — the player dies despite having charges.

The wall-death branch (L6217–6234) also has no shield/vampire (only phoenix) — but daily mode has `wallDeath: false` (L1230), so wall death is irrelevant to daily/streak play. The rival branch, however, IS relevant (daily mode has rivals).

**Fix:** §E step 5 must list the streak-charge insertion for ALL lethal fall-through points, not just "collision (L6187)" and "hazard (L6238)":
- Self/obstacle (after L6201 vampire, before L6206 serpentine): `tryStreakChargeSave` — matches plan.
- Rival collision (after L6285 phoenix, before L6297 death): `tryStreakChargeSave` — **MISSING from plan**.
- Hazard (after L6246 vampire, before L6254 death): `tryStreakChargeSave` — matches plan.
- Wall death (after L6221 phoenix, before L6233 death): `tryStreakChargeSave` — optional (daily has wallDeath:false, but Classic/Snap have wallDeath and the charge should fire there too for consistency).

The plan's "two paths" framing is incomplete. The helper approach (§E step 5, L160: "invoked after the vampire save in EACH lethal branch") is correct in spirit but the enumerated sites omit the rival and wall branches.

---

## [LOW]

### LOW-1. Plan §F step 1 cites "near L225, the `saveManager` definition" — `saveManager` is at L212; L225 is `getJSON`

**Verified:** `const saveManager =` is at L212. L225 is the `getJSON(key, defaultVal, validator)` method inside the object literal. The plan says to declare `quarantinedKeys` "near L225, the saveManager definition" — L225 is inside the object, not a declaration site. The implementer should place `quarantinedKeys` at module scope near L212 (before the `const saveManager` block) or immediately after L242 (after the object closes), since it must be in module scope, not inside the saveManager object.

**Fix:** Cite L212 or "after L242 (the saveManager object close)" for the `quarantinedKeys` declaration site.

### LOW-2. Plan §G step 2 cites "after the head segment draws, before drawEyes" — the head segment is inside the forEach at L5028–5030

**Verified:** `drawEyes` is called at L5029 inside `snake.forEach` (L4932) for `index === 0`. The plan says "after the head segment draws, before `drawEyes`" — the head segment draw is the `if (index === 0)` block at L5028, and `drawEyes` is at L5029. There is no "after the head segment draws, before drawEyes" gap — they are adjacent. The chevron must be drawn either before L5028 (inside the forEach, gated on `index === 0`) or after the forEach closes (L5031) using `snake[0]`. The plan's instruction is ambiguous about whether the chevron is inside or outside the forEach.

**Fix:** Specify: "After the forEach closes (L5031), before the snap timer ring (L5033), draw the chevrons using `snake[0]` (the head position is `headDrawX`/`headDrawY`, set during the forEach at the head index). Wrap in `ctx.save()`/`ctx.restore()`."

### LOW-3. Plan §A step 5 cites "after combo-bonus addScore at L6493, before checkAchievements at L6542" — correct, but the bomb-eat branch (L6394–6418) does NOT reach L6493

**Verified:** The bomb eat branch (L6394–6418) ends with `srSpeak('Bomb detonated')` at L6418 and `return`-style flow (the `else` at L6419 continues to the normal eat path). The bomb branch does NOT fall through to the combo-bonus block at L6484–6493 — it has its own combo handling (L6402–6414) and food regen (L6416). So placing `hazardChainStreak` reset logic only at "after L6493" would NOT reset the streak on a bomb eat. The plan §A step 5 (L95) says "Bomb eat branch (L6394–6418): bomb resets `hazardChainStreak = 0`" — this is correct and explicit, but the implementer must add the reset INSIDE the bomb branch (e.g., after L6414 `handleComboMilestone()`), not at L6493.

**Fix:** No plan change needed if the implementer reads step 5 fully, but clarify: "Add `hazardChainStreak = 0` inside the bomb branch at L6414 (after `handleComboMilestone()`, before L6416 food regen) — the bomb branch returns before L6493, so the L6493-site reset does not cover it."

### LOW-4. Plan §E step 3 awardXP multiplier — L6885 is the overcharge path (level ≥ 20), not the main XP path

**Plan ref:** §E step 3 (L153–155): *"Multiply into the XP gained before the overcharge loop (L6885)."*

**Verified:** `awardXP` (L6879–6900) has two paths: level ≥ 20 (L6882–6886, overcharge) and the main path (L6888–6899, `xp += amount`). L6885 is `saveManager.set('snake_xp_overcharge', xpOvercharge)` — inside the overcharge branch. The plan says "before the overcharge loop (L6885)" but there is no loop; L6883–6885 is a 3-line overcharge accumulator. The streak multiplier should be applied to `amount` BEFORE the level-20 branch (i.e., at L6880, after the `earnXP` guard at L6881), so it applies to both the overcharge and main paths.

**Fix:** Cite L6881 (after the `earnXP` guard) as the insertion point: `amount = Math.round(amount * streakMult);` before the level-20 check at L6882. This applies the multiplier to both paths. The plan's "before the overcharge loop (L6885)" is the wrong line and misnames a 3-line block as a "loop."

### LOW-5. Plan §D step 2 `seedOffset` formula uses `HAZARD_ON_TICKS` — variable name not verified in plan

**Verified:** `HAZARD_ON_TICKS` is used at L3372 (`h.phaseTimer = h.phase === 'on' ? HAZARD_ON_TICKS : HAZARD_OFF_TICKS`). The plan §D step 2 (L60) says `seedOffset = Math.floor(seededRandom() * HAZARD_ON_TICKS)`. This is a real constant. No issue — just confirming the symbol exists.

### LOW-6. Plan §C step 9 says "resetGame() (L2055) only (E is Gauntlet-excluded)" — the parenthetical "E" is a typo for "C"

**Verified:** §C step 9 (L207): *"Reset: `resetGame()` (L2055) only (E is Gauntlet-excluded — matching hoard precedent)."* The feature being discussed is C (Hoard Pigment Rush), not E. The "(E is Gauntlet-excluded)" should read "(C is Gauntlet-excluded)" or "hoard is Gauntlet-excluded." Minor, but will confuse a reader cross-referencing features.

### LOW-7. Plan §A step 7 cites resetGame L2055 AND resetWaveState L5419 — correct, but `resetWaveState` does not currently clear hazard state and the plan doesn't specify the exact line

**Verified:** `resetWaveState` (L5419–5443) clears `extraFoods` (L5426), `comboCount` (L5436), etc., but does NOT clear any `hazardChainStreak` (which doesn't exist yet). The plan says to add `hazardChainStreak = 0` to resetWaveState but doesn't cite a line. The logical site is near L5436 (`comboCount = 0`) since the streak is combo-adjacent state.

**Fix:** Cite L5436 as the insertion site in resetWaveState: "Add `hazardChainStreak = 0` near `comboCount = 0` (L5436)."

---

## Death-Save Chain Order Verification

**Required chain (per assignment):**
- Hazard: melt → shield → vampire → streak → death
- Collision: shield → vampire → streak → serpentine → death

**Plan v11 state (§B step 2 L124–127, §E step 6 L166–168, Cross-Feature L219–222):**
- Hazard: melt → shield → vampire → streak charge → death ✅
- Collision: shield → vampire → streak charge → serpentine → death ✅

**Verified against code:**
- Hazard branch (L6238–6254): shield (L6239) → vampire (L6246) → death (L6254). Melt slots before L6239 (plan §B step 1, L110). Streak charge slots after L6246 (plan §E step 5, L161). **Order correct.**
- Collision branch (L6187–6215): shield (L6188) → vampire (L6196) → serpentine (L6206) → death (L6215). Streak charge slots after L6201, before L6206 (plan §E step 5, L162). **Order correct.**
- Serpentine absent from hazard path: ✅ (comment at L6237 confirms; no serpentine code in L6238–6254).

**Melt resets hazardChainStreak (assignment requirement 5):** Plan §B step 1 (L115): `hazardChainStreak = 0;` in the melt branch. ✅ **Correctly addressed.**

---

## Other Assignment Requirements Verification

| # | Requirement | Status |
|---|---|---|
| 4 | addScore global cap (×4) prevents ×7.5 | ✅ Plan §A step 4 L91 and §Cross-Feature L225–229 specify `Math.min(multi * effectiveHoardMult * hazardChainMult, 4)`. Verified L1800 is the final score line. (See MEDIUM-2 for the dual-statement ambiguity.) |
| 5 | Melt branch resets hazardChainStreak | ✅ Plan §B step 1 L115: `hazardChainStreak = 0;` in the melt branch. |
| 6 | extraFoods snapshot includes pigment field | ✅ Plan §C step 7 L199–201: `pigment: ef.pigment \|\| false` at build L2508 and restore L2656. Verified both lines serialize `{x, y, type, spawnTime, portalLink}` — no `pigment` yet, so the addition is correct. |
| 7 | Hazard snapshot includes seedOffset | ✅ Plan §D step 3 L61–64: `seedOffset: h.seedOffset \|\| 0` at build L2522 and restore L2667. Verified L2522 serializes `{cx, cy, radius, phase, phaseTimer, lifeTimer, maxLife}` and L2667 restores the same — no `seedOffset` yet, addition correct. |
| 8 | Implementation order dependencies respected | ✅ Plan §Implementation Order L231–238: G → F → D → A → B → E → C. F before D (quarantine covers new daily save keys), D before A (daily hazard determinism stable), A before B (adjacency/death paths stable), B before E (death-save chain settled), E before C (addScore path stable from A). The dependency graph is acyclic and each prerequisite is justified. |

---

## Line-Claim Accuracy (All Verified)

| Plan claim | snake.html actual | Match |
|---|---|---|
| `dirQueue` L261 | L261 `let dirQueue = [];` | ✅ |
| `drawSnake(t)` L4898 | L4898 `function drawSnake(t)` | ✅ |
| `saveManager.getJSON` L225 | L225 `getJSON(key, defaultVal, validator)` | ✅ (but saveManager object starts at L212 — see LOW-1) |
| `restoreFromSnapshot` L2622 | L2622 `function restoreFromSnapshot(data, fromStorage)` | ✅ |
| `importSaveData` L1709 | L1709 `function importSaveData(file)` | ✅ |
| `renderSettings` L1621 | L1621 `function renderSettings()` | ✅ |
| `requestAnimationFrame(animateVisuals)` near L8030 | L8030 `requestAnimationFrame(animateVisuals);` | ✅ |
| `startGame()` daily block L2256–2294 | L2256 `if (gameMode === 'daily')` through L2294 `}` | ✅ |
| seedField handler L542–543 | L541 `activeSeed = seed;` L543 `seedPrng = mulberry32(hash);` | ✅ (L542 is the hash line) |
| `tickHazards` spawn L3386–3387 | L3386–3387 `seededRandom()` for hx/hy | ✅ |
| hazard object L3390 | L3390 `hazards.push({...})` | ✅ |
| `buildSnapshotObject` hazard L2522 | L2522 `hazards: hazards.map(...)` | ✅ |
| `restoreFromSnapshot` hazard L2667 | L2667 `hazards = (data.hazards \|\| []).map(...)` | ✅ |
| `addScore(amount)` L1777 | L1777 `function addScore(amount)` | ✅ |
| L1800 `score += Math.round(amount * multi * effectiveHoardMult)` | L1800 exact match | ✅ |
| `checkPlayerDeath` hazard branch L6238 | L6238 `if (isHazardCollision(wrappedHead))` | ✅ |
| `updateGame()` L5959 | L5959 `function updateGame()` | ✅ |
| `tickHazards` call L5964 | L5964 `if (MODE_CONFIG[gameMode].hazardsEnabled) tickHazards();` | ✅ |
| hoard tick block L5970–5973 | L5970–5973 `hoardTimer--` / `endHoard()` | ✅ |
| `comboHeatColor` L4891 | L4891 `function comboHeatColor(combo)` | ✅ |
| body tint L5011–5014 | L5011–5014 `comboHeatColor` applied via fillRect | ✅ |
| inline `haloColor` L4924 | L4924 `var haloColor = ...` | ✅ |
| `haloAlpha` cap L4918 | L4918 `var haloAlpha = (0.3 + 0.2 * comboFrac)...` | ✅ |
| `ctx.save()`/`restore()` L4922–4930 | L4922 `ctx.save()` / L4930 `ctx.restore()` | ✅ |
| `awardXP` L6879 | L6879 `function awardXP(amount)` | ✅ |
| overcharge L6885 | L6885 `saveManager.set('snake_xp_overcharge', ...)` | ✅ (but see LOW-4 — it's a statement, not a loop) |
| `STREAK_UNLOCKS` loop L2297–2306 | L2297 `for (const days in STREAK_UNLOCKS)` through L2309 `}` | ✅ |
| `checkPlayerDeath` collision L6187 | L6187 `if (checkCollision(wrappedHead)...)` | ✅ |
| vampire collision L6201 | L6201 `return false;` (end of vampire block) | ✅ |
| serpentine L6206 | L6206 `if (evolutionTier >= 1 && !obstaclePassUsed...)` | ✅ |
| vampire hazard L6246 | L6246 `if (activeBrews.indexOf('vampire')...)` | ✅ |
| `resetGame` L2055 | L2055 `function resetGame()` | ✅ |
| `resetWaveState` L5419 | L5419 `function resetWaveState()` | ✅ |
| `buildSnapshotObject` L2493 | L2493 `function buildSnapshotObject()` | ✅ |
| extraFoods build L2508 | L2508 `extraFoods: extraFoods.map(...)` | ✅ |
| extraFoods restore L2656 | L2656 `extraFoods = (data.extraFoods \|\| []).map(...)` | ✅ |
| hoard snapshot build L2583 | L2583 `hoardActive: hoardActive` | ✅ |
| hoard snapshot restore L2722 | L2722 `hoardActive = !!data.hoardActive` | ✅ |
| `activateHoard` L3416 | L3416 `function activateHoard()` | ✅ |
| `extraFoods` push L3424 | L3424 `if (hf) extraFoods.push(hf);` | ✅ |
| extraFoods eat block L6589 | L6589 `for (var efi = extraFoods.length - 1; ...)` | ✅ |
| `endHoard` L3429 | L3429 `function endHoard()` | ✅ |
| `drawGame` hoard tint L5219 | L5219 `if (hoardActive)` | ✅ |
| `drawHazards` L4508 | L4508 `function drawHazards()` | ✅ |
| bomb eat branch L6394–6418 | L6394–6418 (bomb logic block) | ✅ |
| combo-bonus addScore L6493 | L6493 `addScore(comboBonus);` | ✅ |
| `checkAchievements` L6542 | L6542 `checkAchievements(score);` | ✅ |
| `updateMenuFooter` L2205 | L2205 `function updateMenuFooter()` | ✅ |
| streak block L4335–4340 | L4335–4340 (streak display) | ✅ |
| `gameOver` L3076 | L3076 `function gameOver()` | ✅ |
| `clearSnapshot` L2624 | L2609 `function clearSnapshot()` (plan says L2624 — actually L2609) | ⚠ see LOW-8 |

### LOW-8. Plan §F step 3 cites `clearSnapshot()` at L2624 — the function is at L2609

**Verified:** `function clearSnapshot()` is at L2609, not L2624. L2624 is inside `restoreFromSnapshot` (the `clearSnapshot()` call within the validation-failure path). The plan says "Before `clearSnapshot()` on validation failure (L2624)" — L2624 is likely the `clearSnapshot()` call site inside restoreFromSnapshot, not the function definition. The implementer should verify whether the quarantine call goes at L2609 (the function body) or at the call site within restoreFromSnapshot (near L2624).

**Fix:** Cite L2609 for the `clearSnapshot` function definition and clarify whether the quarantine call is inside `clearSnapshot` (affects all callers) or at the restoreFromSnapshot validation-failure site (L2624-area).

---

## Summary

| Severity | Count | Action |
|---|---|---|
| CRITICAL | 1 | resetGame must clear seedPrng/activeSeed (CRITICAL-1) |
| HIGH | 2 | importSaveData rewrite scope (HIGH-1); streak-charge-grant reset condition (HIGH-2) |
| MEDIUM | 5 | adjacency ring scaling contradiction (M-1); dual cap formula (M-2); golden+rush cap redundancy (M-3); streak HUD save/restore (M-4); rival-collision streak-charge path missing (M-5) |
| LOW | 8 | citation/labeling fixes (L-1 through L-8) |

**Bottom line:** The plan correctly incorporates all five critical/high findings from the prior reviews (C1, C2/C3, H1, H2, H3) with accurate line numbers. The death-save chain order is correct for both paths. The global ×4 cap, melt-resets-streak, extraFoods pigment snapshot, and hazard seedOffset snapshot are all specified. The implementation order is acyclic and justified.

The one CRITICAL (CRITICAL-1: resetGame does not clear seedPrng) is a latent bug the plan's own verification step would miss — it would cause Classic mode to become deterministic with a stale daily seed after the first daily run. The two HIGHs are underspecified rewrite scope (import validation) and a wrong reset condition (streak resets to 1, not 0). The five MEDIUMs are plan-internal contradictions or missing wiring sites that would cause implementation errors but not architectural failures.