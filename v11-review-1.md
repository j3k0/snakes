# Snakes v11 Design Plan — Review 1 (Gameplay & Architecture-Invariant Compliance)

Reviewer scope: verify every claimed hook point against `snake.html` (8034 lines), check all architecture invariants, assess risk ratings, and evaluate feature selection. All line numbers below reference the actual `snake.html`; plan line refs are cited as "plan L####" where they diverge.

## Summary of line-claim accuracy

Functions confirmed at the stated lines: `tickHazards` L3362, `isHazardCollision` L3402, `activateHoard` L3416, `endHoard` L3429, `generateHoardFood` L3436, `setNextDirection` L3784, `animateVisuals` L4023, `drawHazards` L4508, `comboHeatColor` L4891, `drawSnake` L4898, `drawPostFX` L5203, `resetWaveState` L5419, `checkPlayerDeath` L6186, `awardXP` L6879, `queueToast` L6955, `buildSnapshotObject` L2493, `restoreFromSnapshot` L2622, `resetGame` L2055, `gameOver` L3076, `endZenSession` L3158, `exportSaveData` L1692, `importSaveData` L1709, `renderSettings` L1621, `updateMenuFooter` L2205, `dirQueue` L261, `calmModeEffective` L326, `STREAK_UNLOCKS` L1168, streak source L2271/L2296, hoard-tint draw L5219, rival-freeze L6769/L6777, extraFoods-eat-block L6589, touch-indicator L4161, SNAPSHOT_VERSION=1 L2479.

---

## [CRITICAL]

### C1. Feature D's central premise is false — daily mode is NOT deterministic; `seedPrng` is never set for daily runs
The plan repeatedly claims the daily seed "already deterministically via `seedPrng`" (D Concept), "Daily mode config L1230 already runs the deterministic RNG" (D Hook points), and "seedPrng is set in startGame() daily block L2256" (D Determinism audit). **All three are factually wrong.**
- `seedPrng` (declared L412) is set ONLY in: seedField input handler (L543), `restoreFromSnapshot` (L2644), challenge-URL handler (L7390), seedRandomBtn (L8022). It is set to `null` by seedClearBtn (L8027).
- The `startGame()` daily block (L2256–2294) handles only `dailyAttempts` and `snake_streak_count`. It never touches `activeSeed` or `seedPrng`.
- `MODE_CONFIG.daily` (L1229–1232) has no seed wiring.
- `seededRandom()` (L689–690) is `seedPrng ? seedPrng() : Math.random()`. In a normal daily run `seedPrng === null`, so **every `seededRandom()` call in daily mode falls back to `Math.random()`** — food spawn, hazard spawn, rival AI, hunter flee. Daily mode is currently fully non-deterministic.
- `getDailySeed()` (L1318) is used ONLY to pick a `DAILY_CHALLENGES[seed % len]` index (L4322, L4462, L5270, L7084), never to seed the game RNG.

**Consequence:** Feature D's entire mechanism ("when `gameMode === 'daily'`, derive spawn position from `seededRandom()` instead of `Math.random()`") is a no-op — `seededRandom()` already returns `Math.random()` in daily mode. Hazards will remain RNG. The "memoizable obstacle course" depth the feature promises does not materialize. Worse, the plan's "Determinism audit" asserts the opposite of reality and would mislead the implementer.

**Fix:** Feature D must FIRST add daily seed initialization: in `startGame()` daily block (after L2293), set `activeSeed = String(getDailySeed())` and `seedPrng = mulberry32(getDailySeed())` (or hash the seed string the same way the seedField handler does at L542–543). Only THEN does the `seededRandom()` swap in `tickHazards` (L3386–3387) buy determinism. This also retroactively makes daily food/rival/hunter spawns deterministic — a much larger behavioral change than the plan states (Risk should rise). Also note the snapshot-restore caveat (L2635–2641): the PRNG stream position is NOT snapshotted, so a resumed daily run diverges post-restore — acceptable for save/resume but must be documented.

### C2. Feature E places the streak-charge death save in `gameOver()` L3076 — architecturally too late to cancel a death
The plan documents the death-save chain as `melt → shield → vampire → streak charge → serpentine → death` (all gates in `checkPlayerDeath`), then contradicts itself: "Charge consume: death handling in `gameOver()` L3076 — before the death is finalized … cancel death, decrement streakCharges … and resume the run (`gameState = 'playing'`)."
- `checkPlayerDeath` (L6186) returns `true` → caller at L6306–6309 immediately calls `gameOver()` and returns. By the time `gameOver()` runs: `gameState='gameover'` (L3079), `clearSnapshot()` (L3082), `saveReplay` (L3089), `finalizeSession(false)` (L3093), `awardXP` (L3094), `checkAchievements`/`checkDailyCompletion`/`checkStatMilestones`/`checkQuestProgress` (L3095–3106), `buildRecapData` (L3111), death-fragment spawn (L3122–3147) have ALL executed.
- "Resuming the run" from L3076 means reverting ~30 statements of side effects (stats writes, leaderboard write in `finalizeSession`, achievement unlocks, diary entry at L3155). This is intractable and would double-count XP/leaderboard entries.
- The plan's own corrected chain order (streak charge AFTER per-run saves, before serpentine) places it inside `checkPlayerDeath`, NOT in `gameOver`.

**Fix:** The streak-charge consume must be a gate inside `checkPlayerDeath()`, mirroring the shield/vampire pattern. Concretely: add a branch after the vampire save in EACH death sub-path (self/obstacle at L6196, wall at L6221, hazard at L6246, rival at L6276) — or, cleaner, add a single helper `tryStreakChargeSave(wrappedHead)` invoked at the top of each lethal branch before falling through to `return true`. On success: decrement `streakCharges`, `saveManager.set('snake_streak_charges', ...)`, `queueToast('🛡 Streak charge consumed!')`, reposition the head to a free tile (Phoenix-style, like L6223–6230), and `return false`. Remove the `gameOver()` L3076 consume site entirely. The plan's "automatic with toast" UX decision is fine; only the placement is wrong. This also fixes a latent bug: the plan's chain puts streak AFTER serpentine in one sentence and BEFORE serpentine in the next (L116–118) — the order must be pinned (streak before serpentine is correct: serpentine is obstacle-specific and one-use-per-run, streak is the more general persistent save).

---

## [HIGH]

### H1. Feature C proposes to decrement `pigmentRushTimer` in `animateVisuals()` while calling it "game-tick, not rAF" — contradicts itself and would violate the rAF write boundary
- Plan C Hook points: "`animateVisuals()` timer-decay section — decrement `pigmentRushTimer` per tick (game-tick, not rAF — this is game-logic state written in the tick loop, like `hoardTimer`)."
- `animateVisuals` (L4023) is the **rAF** loop. Decrementing a game-logic timer there violates the rAF-write boundary invariant (AGENTS.md "Dual Render Loops — rAF Write Boundary"). The plan even says the decrement is "game-tick, not rAF" yet names the rAF function as the site — the two clauses contradict.
- The correct precedent is `hoardTimer--` at L5971, inside `updateGame()` (the tick loop, in the `hoardActive` else-branch at L5970–5973).

**Fix:** Place `pigmentRushTimer--` (and the `if (pigmentRushTimer <= 0) pigmentRushActive = false;` clear) inside `updateGame()` adjacent to L5971, in the `if (MODE_CONFIG[gameMode].hoardEnabled)` block. `animateVisuals` must only READ `pigmentRushTimer` for the tint alpha. Update the plan's hook-point text to cite `updateGame()` L5970–5973, not `animateVisuals()`.

### H2. Feature A's `addScore(amount, multi)` signature is wrong — the function is `addScore(amount)`; the multiplier path is internal
- Plan A Hook points: "`addScore(amount, multi)` L1800 — the `scoreMultiplier` / `effectiveHoardMult` path at L1796–L1800 is the existing multiplier injection site; chain a `hazardChainMult` there as `1 + Math.min(hazardChainStreak, 3) * 0.5`."
- Actual: `function addScore(amount)` at L1777. There is no `multi` parameter. `multi` is a local computed at L1783 (`pinnacleRank * getOverchargeMultiplier()`), and `effectiveHoardMult` at L1796. The final line is `score += Math.round(amount * multi * effectiveHoardMult)` (L1800).
- The plan's intent (inject `hazardChainMult` into the L1800 product) is correct and feasible, but the cited signature would mislead the implementer into adding a parameter that no caller passes (all ~6 call sites pass one arg: L6477, L6480, L6493, L6583, L6604, L6639).

**Fix:** Restate as: "in `addScore(amount)` (L1777), introduce `var hazardChainMult = hazardAdjacentThisTick ? (1 + Math.min(hazardChainStreak, 3) * 0.5) : 1;` before L1800 and multiply it into the L1800 product: `score += Math.round(amount * multi * effectiveHoardMult * hazardChainMult)`. No signature change; all callers inherit the multiplier." Note the `golden_food` cap interaction (L1797–1798) already caps `effectiveHoardMult`; decide whether `hazardChainMult` stacks multiplicatively with the hoard cap (plan doesn't say — specify ×1.5 hazard × ×2 hoard = ×3, or cap the combined product).

### H3. Feature B's line references conflate `comboHeatColor` (L4891) with the head-halo inline color (L4916)
- Plan B: "`comboCount >= 3` aura at L4916 — extend the visual threshold ladder: at `comboCount >= 10` show a distinct molten tint" and "`comboHeatColor(combo)` L4916-area — extend the existing helper to return the molten variant at combo ≥ 10."
- Actual: `comboHeatColor` is defined at **L4891** (returns the body-tint rgba). The L4916 block is the **head halo**, which computes its color INLINE (`haloColor` at L4924: `comboCount >= 15 ? '#FF4400' : comboCount >= 7 ? '#FF8800' : '#FFCC00'`) and does NOT call `comboHeatColor`. The body tint that DOES use `comboHeatColor` is applied at L5011–5014.
- So "extend comboHeatColor at L4916-area" is wrong on two counts: wrong function (comboHeatColor is at 4891) and wrong site (the halo at 4916 doesn't use comboHeatColor).

**Fix:** Split into two edits: (1) extend `comboHeatColor` (L4891–4896) to add a `combo >= 10` molten branch returning a brighter orange-red rgba (alpha cap 0.7 vs the current 0.25 ceiling) — this drives the BODY tint at L5011. (2) extend the inline `haloColor` ladder at L4924 to add a `comboCount >= 10 ? '#FF6600'` (or brighter) rung, and raise the `haloAlpha` cap at L4918 from 0.5 to 0.7 when `comboCount >= 10`. Both edits already sit inside `ctx.save()`/`ctx.restore()` (L4922–4930) so save/restore discipline is satisfied. Do NOT use `foodColor()` — correct (these aren't tier reads).

### H4. Feature E's `updateMenuFooter()` line ref is L2214; the function is at L2205
- Plan E: "Display: streak block at L4335–L4340 + `updateMenuFooter()` L2214." `updateMenuFooter` is at L2205 (L2214 is 9 lines into its body). Minor, but the streak-charge HUD ("🛡×N") should be added to the streak display block at L4335–4340 (inside `drawOverlay`, the idle screen) — confirm this block is wrapped in `ctx.save()`/`ctx.restore()` per the sub-function leak rule. Grep shows the surrounding idle-screen text sets `ctx.font`/`ctx.fillStyle` repeatedly without a wrapping save/restore (L4324–4353), so the new `fillText` for "🛡×N" inherits the same leak risk as the existing code. Not a regression, but document it.

**Fix:** Cite L2205 for `updateMenuFooter`. Add the charges glyph in the L4335–4340 streak block. Since the block already leaks text state (pre-existing), no NEW invariant breach — but if the implementer touches this area, wrap the whole daily-info block (L4320–4357) in `ctx.save()`/`ctx.restore()` as a cleanup.

---

## [MEDIUM]

### M1. Feature A's eat-site line (L6484) is the combo-bonus block, not "the food-eat block"
- Plan A: "Eat site L6484 (the food-eat block, after combo bonus) — bump `hazardChainStreak` if `hazardAdjacentThisTick`, else reset to 0." L6484 is the start of the combo score-bonus `if (comboCount > 0 ...)` block; the actual eat block opens much earlier (~L6380). The hazard-chain bump logically belongs AFTER the combo bonus resolves (after L6493) but BEFORE `checkAchievements`/`checkQuestProgress` (L6542–6543) so the streak is counted before snapshot/quest reads. The line is approximately right but the label "food-eat block" is loose.

**Fix:** Specify "after the combo-bonus `addScore` at L6493 and before `checkAchievements(score)` at L6542." Also: the bomb-eat branch (L6394–6418) is a separate eat path — decide explicitly whether eating a bomb counts as a "non-adjacent food" that resets `hazardChainStreak` to 0 (bomb is an eat; plan doesn't address it). Recommend: bomb resets the chain (it's not a hazard-adjacent harvest), and document this.

### M2. Feature A: `hazardAdjacentThisTick` is a per-tick boolean but the eat block runs inside the tick — verify the "this tick" semantics and reset cadence
- The plan sets `hazardAdjacentThisTick` in `tickHazards()` (L3362) each tick, then reads it in the eat block (same tick, since `tickHazards` runs at L5964 before the move/eat logic). That ordering is correct. BUT `tickHazards` only runs when `MODE_CONFIG[gameMode].hazardsEnabled` (L5964 gate). In non-hazard modes `hazardAdjacentThisTick` is never set — the plan says it "is always false" but doesn't specify WHERE it's declared/initialized. It must be a module-scope `let` reset to `false` at the top of each `updateGame()` tick (or defaulted false and only set true in `tickHazards`), else it can leak `true` across ticks/modes.

**Fix:** Declare `let hazardAdjacentThisTick = false;` at module scope (near L205–206 hazards block) and reset it to `false` at the TOP of `updateGame()` (L5959, before the `tickHazards` call at L5964) so a tick where the snake isn't adjacent never carries a stale `true`. Snapshot it as an additive field (the plan does: L28 additive note) — but note it's transient-ish; restoring it to `true` mid-adjacency is harmless since the next tick recomputes it. Acceptable.

### M3. Feature C: pigment-tag plumbing on `extraFoods` entries must round-trip through the snapshot
- The plan tags the 4 hoard foods with `pigment: true` at `activateHoard` (L3424). But `buildSnapshotObject`'s `extraFoods` map (L2508) serializes only `{x, y, type, spawnTime, portalLink}` — it does NOT preserve a `pigment` field. `restoreFromSnapshot` (L2656) reconstructs `extraFoods` with the same limited field set. So a snapshot taken mid-hoard would lose the `pigment` tag, and `hoardPigmentCount` (which IS snapshotted per the plan) would no longer match the actual tagged foods in `extraFoods` — a desync where the count says 2 but only 0 tagged foods remain.

**Fix:** Add `pigment: ef.pigment || false` to the `extraFoods` serialization at L2508 and `pigment: ef.pigment || false` to the restore map at L2656. This is an additive field on an existing additive array — no SNAPSHOT_VERSION bump. Note this in the plan's snapshot hook-point.

### M4. Feature E: streak-charge is a persistent meta-resource read at run start, but the plan doesn't specify the load site
- Plan E: "`streakCharges` is NOT per-run … It's read from `saveManager` at run start." But there's no load site cited. The charges must be loaded in `startGame()` (near L2296, after the streak read) into a module-scope `let streakCharges = saveManager.getInt('snake_streak_charges', 0)`, and re-read on each run start so a charge spent in a prior run is reflected. Currently `startGame()` does not read it.

**Fix:** Add to `startGame()` after L2296: `streakCharges = saveManager.getInt('snake_streak_charges', 0);` and declare `let streakCharges = saveManager.getInt('snake_streak_charges', 0);` at module scope (near L741–742 progression state). The consume gate (per C2, in `checkPlayerDeath`) decrements the module var AND writes `saveManager.set('snake_streak_charges', streakCharges)` synchronously.

### M5. Feature F: `quarantinedKeys` Set as module scope is fine, but the "fire toast once on load" needs a concrete trigger
- Plan F: "Module-scope `quarantinedKeys = new Set()` — populated during load, read once for the toast, then can be cleared." The toast trigger needs a concrete call site. `queueToast` (L6955) enqueues into `toastQueue` and starts `processToastQueue` — but on page load the game is at `gameState='idle'` and the toast queue may not be processing yet (it's drained in `animateVisuals`). Also, the corruption-detection toast must fire AFTER the canvas/`toastEl` is ready.

**Fix:** Populate `quarantinedKeys` during the initial load pass (the `getJSON` calls at L408, L944, L1212, L6903, etc. run at module init). Then, at the end of the load/init sequence (the bottom of the `<script>` near L8030, after `requestAnimationFrame(animateVisuals)`), add `if (quarantinedKeys.size > 0) queueToast('Save data issue detected — backed up corrupted keys, settings reset.', 5000);`. Confirm `toastEl` exists at that point (it's declared in HTML at L101, so yes). The re-quarantine guard (`if (key.startsWith('snake_corrupt_')) return defaultVal;`) is correct and necessary — keep it.

### M6. Feature D: `dailyHazardIndex` counter and `seedOffset` field need snapshot/restore consideration
- Plan D adds a `seedOffset` to each hazard (L3390) and a `dailyHazardIndex` counter. The plan says "Snapshot unaffected — hazards already serialize at L2667; the determinism is a spawn-time property." But `dailyHazardIndex` is per-run state that determines the NEXT hazard's RNG draw — if not snapshotted, a resumed daily run would reset the index to 0 and re-draw the same early hazard positions, breaking replay determinism.
- Additionally, `seedOffset` must be added to the hazard serialization at L2522 (build) and L2667 (restore), or it's lost on resume and the phase offset re-randomizes.

**Fix:** Add `seedOffset: h.seedOffset || 0` to the hazard snapshot map (L2522) and restore map (L2667) — additive, no version bump. Snapshot `dailyHazardIndex` as an additive field alongside `hazardTickCounter`. Or, simpler: derive `dailyHazardIndex` from `hazards.length` at spawn time (since hazards spawn one at a time and cap at 2, the index = total hazards ever spawned this run, which can be reconstructed from a monotonic counter — but that counter still needs snapshotting). Specify which.

---

## [LOW]

### L1. Feature G tick-consumption line is L6149, not L6148
Plan G says "Tick consumption site L6148." The `dirQueue.shift()` is at L6149 (L6148 is the `if` wrapping it). Cosmetic; the implementer will find it.

### L2. Feature A "Manhattan ≤ TILE_SIZE" adjacency vs `isHazardCollision`'s `dist <= h.radius`
`isHazardCollision` (L3406) uses `Math.abs(pos.x - h.cx) + Math.abs(pos.y - h.cy) <= h.radius` (Manhattan ≤ radius). Plan A's adjacency probe says "distance ≤ `radius + TILE_SIZE`". This is consistent with the existing pattern. Just confirm `h.radius` is in pixels (it is — `TILE_SIZE * 0.8` to `HAZARD_MAX_RADIUS`, L3376) so `radius + TILE_SIZE` is a 1-tile buffer. Correct.

### L3. Feature B: melt slot "before shield" is correct but the hazard branch (L6238) has its OWN shield/vampire chain separate from the self/obstacle branch (L6188)
The plan says "The melt must slot before shield so a high-combo player isn't punished by also consuming their shield" and cites "isHazardCollision death path L6238." Note the hazard death branch (L6238–6255) has its OWN shield (L6239) and vampire (L6246) saves, SEPARATE from the self/obstacle branch (L6188–6215). The melt must be inserted at the TOP of the hazard branch (before L6239 shield), AND if the plan wants melt to also cover self/wall/rival deaths at combo≥10, it needs inserting in those branches too. The plan only mentions the hazard path — clarify scope: melt is hazard-only (thematically correct: "melt" lava), so only the L6238 branch needs it. Document that explicitly.

### L4. Feature C: `hasSeenPigmentRush` first-time toast pattern is correct but no save-key collision check
The plan mirrors `hasSeenPortal`/`hasSeenBomb`. Grep confirms those use `snake_has_seen_portal`/`snake_has_seen_bomb`. Use `snake_has_seen_pigment_rush` (no collision). Fine.

### L5. Feature F: `renderSettings()` "Restore Backed-Up Data" button — confirm no new panel
Plan F adds a button inside `renderSettings()` (L1621, inside `#settingsPanel`). No new DOM panel → cross-hide contract NOT triggered. Correct — the plan implicitly respects this. Just call it out as compliant.

### L6. Feature selection quality — no swap recommended
The 7 features (A–G) all compound with existing systems (hazards, combo, hoard, streak, snapshot, input buffer, save) per the v11 "depth over breadth" theme. None should be swapped for a rejected idea:
- The rejected "Save Corruption Auto-Recovery" (now Feature F) was previously rejected but is now ripe because the snapshot engine + export/import are load-bearing — the plan correctly recognizes this.
- "Daily Seed Rival Ghost" (rejected, R3) is correctly deferred pending D's determinism — but per C1, D doesn't actually deliver determinism yet, so the deferral rationale is right for the wrong reason.
- No selected feature is a standalone silo; all 7 connect ≥2 existing systems. Selection quality is good.
- One consideration: Feature E (130 LOC, R3) is the highest-risk selected feature and its death-save placement (C2) is broken. If the implementer can't resolve C2 cleanly, E should be the first to defer to v12 (the "Seasonal Ladder" prerequisite argument is independent of the death-save mechanic). Flag this as a contingent drop.

---

## Invariant compliance matrix

| Invariant | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| `gameState` single source of truth | ✓ | ✓ | ✓ | ✓ | ⚠ see C2 (resume from gameOver) | ✓ | ✓ |
| Dual render loop / rAF read-only | ✓ | ✓ | ✗ see H1 (pigmentRushTimer in animateVisuals) | ✓ | ✓ | ✓ | ✓ (drawSnake reads dirQueue live) |
| Module scope (let/const lexical, function/var window) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Canvas save/restore on text/alignment | ✓ (drawHazards already wraps) | ✓ (halo already wraps) | ✓ (drawGame tint is fillRect only) | ✓ | ⚠ see H4 (streak HUD text) | ✓ (button is DOM) | ✓ (plan mandates wrap) |
| FOOD_TIERS weights sum to 1.0 | ✓ (no tier added) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Parallel session-end hooks (gameOver AND endZenSession) | ✓ (A has no session-end logic) | ✓ (B has no session-end logic) | ✓ (C has no session-end logic) | ✓ | ✗ see C2 (consume only in gameOver) | ✓ (F is load-time) | ✓ (G has no session-end logic) |
| Reset sites (resetGame AND resetWaveState) | ⚠ plan cites both (L2055+L5419) — but hazards are Gauntlet-excluded so resetWaveState doesn't clear hazards; correct for A since hazardChainStreak should clear in both per invariant; verify resetWaveState adds the clear) | ✓ | ⚠ plan says resetWaveState NOT needed (hoard-excluded) — correct per hoard precedent | ✓ | ✓ (persistent, no reset) | ✓ | ✓ (dirQueue already reset in both) |
| Snapshot additive (no version bump) | ✓ | ✓ (no snapshot change) | ✗ see M3 (pigment tag not serialized) | ⚠ see M6 (seedOffset/index) | ✓ (streakCharges additive) | ✓ (no snapshot change) | ✓ (no snapshot change) |
| Cross-hide panel contract | ✓ (no new panel) | ✓ | ✓ | ✓ | ✓ | ✓ (no new panel) | ✓ (canvas only) |
| foodColor() at all tier.color reads | ✓ (A uses fixed hue, not a tier) | ✓ (B uses fixed hue) | ✓ (C doesn't read tier.color) | ✓ | ✓ | ✓ | ✓ |
| Death save chain order correct & documented | ✓ (A resets streak on hazard death) | ✓ (B documents melt→shield→vampire→serpentine) | ✓ | ✓ | ✗ see C2 (chain vs consume site contradiction) | ✓ | ✓ |

---

## Risk rating assessment

| Feature | Plan risk | Assessed risk | Reason |
|---|---|---|---|
| A Hazard Chain Bonus | 2 | 2 | Correct. Score-only, no new collision. |
| B Combo Heat → Hazard Melt | 3 | 3 | Correct. Death-path branch; chain-order sensitive. |
| C Hoard Pigment Rush | 3 | 3 | Correct. Tagged-food snapshot desync (M3) is a real but contained risk. |
| D Daily Seed Hazard Layout | 2 | **4** | **Understated.** Per C1, the feature doesn't work as written (no seedPrng in daily). Fixing it makes ALL daily RNG deterministic — a large behavioral surface (food, rival, hunter) — raising risk well above 2. |
| E Streak Multiplier Ladder | 3 | **4** | **Understated.** Death-save placement (C2) is broken; XP-multiplier compounds with overcharge + quests (large economy surface). |
| F Save Corruption Auto-Recovery | 2 | 2 | Correct. Read-only quarantine; no game-logic change. |
| G Input Buffer Visualization | 1 | 1 | Correct. Pure rendering. |

---

## Top actions for the plan author
1. **C1:** Rewrite Feature D to first seed `seedPrng` in the `startGame()` daily block; only then does `seededRandom()` in `tickHazards` buy determinism. Bump D's risk to 4.
2. **C2:** Move the streak-charge consume from `gameOver()` L3076 into `checkPlayerDeath()` as a gate (return false), mirroring shield/vampire. Pin the chain order (streak before serpentine).
3. **H1:** Move `pigmentRushTimer` decrement from `animateVisuals()` to `updateGame()` (tick loop, near L5971). Cite `updateGame` not `animateVisuals`.
4. **H2:** Fix `addScore` signature to `addScore(amount)`; inject `hazardChainMult` into the L1800 product without a parameter change.
5. **H3:** Split Feature B's color edits: `comboHeatColor` at L4891 (body tint) and the inline `haloColor` at L4924 (head halo) — two separate sites.
6. **M3/M6:** Add `pigment` to `extraFoods` snapshot (L2508/L2656) and `seedOffset`/`dailyHazardIndex` to the hazard snapshot (L2522/L2667).
7. **M4:** Specify the `streakCharges` module-scope declaration and `startGame()` load site.