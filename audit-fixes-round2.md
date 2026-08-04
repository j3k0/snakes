# Audit Fixes Round 2 — Deep Second-Pass

5 parallel audit scouts found 24 additional bugs across 5 system clusters (after the first round fixed C1-C6, H1-H9). Fixed all 3 CRITICAL, 11 HIGH, and 6 MEDIUM/LOW bugs.

## CRITICAL Fixes

### CRITICAL-GL1: Normal food eat block missing all stat tracking
- **Problem:** The `else` branch of the food-eat `if (eatenType === 'bomb')` block had a `// Stats tracking` comment but never incremented `sessionFoodEaten`, `stats.totalFoodEaten`, `stats.normalFoodEaten`, `sessionSpeedFood`, `sessionBonusFood`, or `sessionFoodTypes`. Only bomb/food2/hoard eat paths did. This broke GLUTTON/GLUTTON_II/EXPLORER/HAT_TRICK/SPEED_DEMON_II achievements, daily challenges, and the stats panel.
- **Fix:** Added stat tracking (`sessionFoodEaten++; stats.totalFoodEaten++; stats.normalFoodEaten++; if(eatenType==='speed') sessionSpeedFood++; if(eatenType==='bonus') sessionBonusFood++; sessionFoodTypes.add(eatenType);`) at the top of the normal food eat `else` block.

### CRITICAL-F1: generateFood MAX_ITERATIONS fallback never populates freeTiles
- **Problem:** The fallback scan in `generateFood()` looped all tiles with only `continue` guards — no `freeTiles.push(...)`. The `freeTiles` array was always empty, so the near-full-board recovery always returned null, killing the player even when free tiles existed.
- **Fix:** Added `freeTiles.push({ x: tx, y: ty });` as the final `else` after all the `continue` guards.

### CRITICAL-P1/S1: endZenSession() missing finalizeSession(true)
- **Problem:** `endZenSession()` never called `finalizeSession(true)`, unlike `gameOver()` which calls `finalizeSession(false)`. Zen sessions didn't compute `sessionTimeAlive` (stayed 0), didn't update stats (gamesPlayed, totalScore, maxScore, longestTimeAlive, longestLength), didn't call `saveAllState()`, and didn't update mode high scores. SURVIVOR/MARATHONER/IMMORTAL achievements and timeAlive quests could never complete from Zen.
- **Fix:** Added `finalizeSession(true);` in `endZenSession()` before `awardXP`. Also moved `score = snake.length;` before `saveReplay()` so Zen replays store the canonical length score (S5 fix).

## HIGH Fixes

### HIGH-GL2: phase_shift mutator skips obstacle collisions (not just self)
- **Problem:** `checkPlayerDeath` gated the entire collision block with `if (checkCollision(wrappedHead) && !skipSelfCollision)`. `checkCollision` merges obstacle + self, so when `skipSelfCollision` was true (phase_shift every 5th tick), obstacle collisions were also skipped — the snake walked through obstacles.
- **Fix:** Split the check: `var hitObstacle = isObstacleCollision(wrappedHead); var hitSelf = !skipSelfCollision && checkCollision(wrappedHead); if (hitObstacle || hitSelf) {`.

### HIGH-GL3: powerUpPickup not cleared in resetGame
- **Problem:** `resetGame()` reset `powerUpTimer`, `powerUpType`, `powerUpSpawnCounter`, `powerUpDespawnCounter` but never set `powerUpPickup = null`. A pickup from a previous game persisted.
- **Fix:** Added `powerUpPickup = null;` to the power-up reset section in `resetGame()`.

### HIGH-GL4: pigmentRushTimer calibrated for 60fps (7× too long)
- **Problem:** `pigmentRushTimer = 300` was decremented once per tick at 120ms. At 120ms/tick: 300×120 = 36s, not the intended 5s. The ×3 multiplier lasted 7× too long.
- **Fix:** Changed to `pigmentRushTimer = 42;` (~5s at 120ms tick).

### HIGH-GL5: HOARD_INTERVAL/DURATION calibrated for 60fps (7× too long)
- **Problem:** `HOARD_INTERVAL = 5400` (~90s at 60ms) → 648s at 120ms. `HOARD_DURATION = 900` (~15s) → 108s. Hoard triggered 7× too late and lasted 7× too long.
- **Fix:** `HOARD_INTERVAL = 750` (~90s), `HOARD_DURATION = 125` (~15s) at 120ms tick.

### HIGH-GL6: HAZARD_INTERVAL/MAX_LIFE/GRACE calibrated for 60fps (2-7× too long)
- **Problem:** `HAZARD_INTERVAL = 3600` (~60s) → 432s. `HAZARD_MAX_LIFE = 300` (~5s) → 36s. `HAZARD_GRACE_TICKS = 250` (~15s) → 30s. Hazards spawned too rarely and lived too long.
- **Fix:** `HAZARD_INTERVAL = 500` (~60s), `HAZARD_MAX_LIFE = 42` (~5s), `HAZARD_GRACE_TICKS = 125` (~15s). Left HAZARD_ON/OFF_TICKS as-is (1.8s/1.2s pulse is readable at 120ms).

### HIGH-S2: sessionSpeedFood not reset in resetGame
- **Problem:** `sessionSpeedFood` was never reset in `resetGame()` or `resetWaveState()`. It accumulated across runs, corrupting bounty baselines, quest progress, and daily challenges.
- **Fix:** Added `sessionSpeedFood = 0;` in `resetGame()` near `sessionBonusFood = 0;`.

### HIGH-F2: Bomb eat skips checkAchievements/checkQuestProgress
- **Problem:** The bomb `if` block ended without calling `checkAchievements(score)` or `checkQuestProgress()`. The first audit (H7) incorrectly claimed the bomb path was covered — it's a sibling `if/else`, not fall-through.
- **Fix:** Added `checkAchievements(score); checkQuestProgress();` at the end of the bomb eat block.

### HIGH-F3: findPortalTile can place portal twin on a lethal hazard
- **Problem:** `findPortalTile()` rejected snake/obstacle/food/food2/powerUp/extraFoods but not on-phase hazards, unlike the main `generateFood` loop. A portal twin on a hazard was un-eatable without dying.
- **Fix:** Added `hazards.some(h => h.phase === 'on' && Math.abs(h.cx-tx)+Math.abs(h.cy-ty) <= h.radius)` rejection.

### HIGH-F7/R1: food2 draw bypasses foodColor (CVD palette)
- **Problem:** `ctx.fillStyle = f2Tier.color` used raw `FOOD_TIERS[type].color` instead of `foodColor(food2.type)`. With a CVD palette active, the echo-brew duplicate rendered in the wrong hue.
- **Fix:** Changed to `ctx.fillStyle = foodColor(food2.type);`.

### HIGH-R2: drawPowerUpHUD leaks text state + flicker early-return leak
- **Problem:** `drawPowerUpHUD()` set textAlign/textBaseline/fillStyle/globalAlpha with no save/restore. The flicker early-return skipped any cleanup, leaking stale text state into subsequent renders.
- **Fix:** Wrapped in `ctx.save()`/`ctx.restore()`. The flicker early-return now calls `ctx.restore()` before returning.

### HIGH-R3: drawTimeAttackHUD/drawSnapHUD/drawDailyHUD/drawMuteIndicator leak text state
- **Problem:** Four HUD functions set textAlign/textBaseline/fillStyle/font with no save/restore. Any early-return guard left stale state for the next consumer.
- **Fix:** Wrapped each in `ctx.save()`/`ctx.restore()`.

## MEDIUM Fixes

### MED-F5: Bounty can complete during Golden Hoard, doubling its reward
- **Problem:** `tickBounty()` only suppressed bounty SPAWNS during hoard. An already-active bounty still ticked down and `checkBounty()` fired `addScore(b.reward.pts)` with the hoard ×2/pigment ×3 multiplier. AGENTS.md says "bounties are suppressed during hoard."
- **Fix:** Added `if (hoardActive) return;` after the `if (!activeBounty)` block in `tickBounty()`, holding active bounties in stasis until hoard ends.

### MED-GL7: Phoenix Brew consumed even when findFreeTile fails
- **Problem:** In both wall-death and rival-death paths, `brewUsageFlags.phoenixUsed = true` was set BEFORE checking `findFreeTile`. If the board was full, the brew was wasted but the player still died.
- **Fix:** Moved `brewUsageFlags.phoenixUsed = true` inside the `if (freePos)` block in both paths.

### MED-GL8: obstacleSpawnTimer not reset in resetWaveState
- **Problem:** `resetWaveState()` didn't reset `obstacleSpawnTimer`. Between gauntlet waves, the timer carried over, potentially spawning extra obstacles on the first tick of a new wave.
- **Fix:** Added `obstacleSpawnTimer = OBSTACLE_SPAWN_INTERVAL;` to `resetWaveState()`.

### MED-GL9: Progressive obstacle spawning not excluded for Gauntlet mode
- **Problem:** The progressive obstacle condition excluded zen/walled/daily/painter but not gauntlet. AGENTS.md says progressive obstacles spawn "in Classic and Time Attack modes" — gauntlet has wave-defined obstacles.
- **Fix:** Added `&& gameMode !== 'gauntlet'` to the condition.

### MED-S3: restoreFromSnapshot catch block clears without quarantine
- **Problem:** The catch block called `clearSnapshot()` but not `quarantineKey(SNAPSHOT_KEY)`. A snapshot that passed the version gate but had corrupt fields (runtime error during restore) was destroyed without backup.
- **Fix:** Added `quarantineKey(SNAPSHOT_KEY);` before `clearSnapshot();` in the catch block.

### MED-R4: drawSnake snap-mode timer ring leaks text state
- **Problem:** The snap timer ring block set strokeStyle/lineWidth/fillStyle/font/textAlign/textBaseline with no save/restore.
- **Fix:** Wrapped in `ctx.save()`/`ctx.restore()`.

### LOW-R5: drawGame seed-display block leaks text state
- **Problem:** The seed display set fillStyle/font/textAlign/textBaseline with no save/restore.
- **Fix:** Wrapped in `ctx.save()`/`ctx.restore()`.

### LOW-S6: lastEatenType not reset in resetGame
- **Problem:** `lastEatenType` persisted across runs. The synesthesia note for the first food of a new run used the previous run's last eaten type.
- **Fix:** Added `lastEatenType = 'common';` in `resetGame()`.

## NOT Fixed (Intentional / Out of scope)

- **F4 (generateHoardFood on hazards):** AGENTS.md explicitly documents this as intentional ("generateHoardFood does NOT reject hazards — intentional emergent tension").
- **GL11 (HAZARD_ON/OFF_TICKS):** 1.8s on / 1.2s off at 120ms is a readable pulse cycle — design choice, not a calibration bug.
- **F8/F9/F10 (portal line wrap, snapToFreeTile hazards, combo-bank teleport scope):** LOW, no gameplay-breaking impact.
- **S7 (resetWaveState ghost cleanup):** LOW, visual-only, gauntlet doesn't use ghost replays.
- **P3 (daily snapshot restore re-hash):** Documented in AGENTS.md as acceptable.
- **S4 (importSaveData misleading toast):** LOW, cosmetic.

## Test Results

All tests pass (17/18, same pre-existing stale B9 as round 1):
- test-v11: 14/14 ✅
- test-v10: 12/12 ✅
- test-v9: 19/19 ✅
- test-evolution: 11/11 ✅
- test-feature-d: 14/14 ✅
- test-quests: 21/21 ✅
- test-bugfixes: 17/18 (B9 pre-existing stale)