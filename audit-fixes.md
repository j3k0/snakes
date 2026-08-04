# Audit Fixes Summary

All 6 CRITICAL and 9 HIGH bugs found by the audit scouts have been fixed in `snake.html`.

## CRITICAL Fixes

### C1: Double-tick from restartGameTimeout inside updateGame
- **Problem:** `scheduleNextTick()` could be called twice when `updateGame()` triggers `restartGameTimeout()` (which calls `stopGameLoop()` + `scheduleNextTick()`), then the outer setTimeout callback also calls `scheduleNextTick()`, creating two pending timeouts causing exponential tick doubling.
- **Fix:** Added guard `if (gameTimeout) return;` at the top of `scheduleNextTick()`, before the `gameState` check. If a timeout is already pending, the re-schedule is a no-op.

### C2: drawFood() label block missing ctx.save()
- **Problem:** In `drawFood()`, the non-high-contrast label block (`if (labels[food.type])`) called `ctx.restore()` without a matching `ctx.save()`, popping the canvas state stack without a push and corrupting the transform.
- **Fix:** Added `ctx.save()` at the start of the label block, before `ctx.font` assignment, mirroring the high-contrast branch.

### C3: extraFoods rendering trapped in drawPowerUpPickup
- **Problem:** The `extraFoods[]` rendering loop was inside `drawPowerUpPickup()`, which returns early when no power-up pickup exists (`if (!powerUpPickup) return`). Portal foods and hoard foods were never rendered in the common case (no active power-up).
- **Fix:** Moved the `extraFoods` forEach loop from `drawPowerUpPickup()` to the end of `drawFood()`, after the food2 rendering block.

### C4: drawGame() target-score block undefined variables
- **Problem:** The target-score display block in `drawGame()` referenced undefined variables `color` and `alpha` (pasted from `handleComboMilestone`), causing a ReferenceError that halted `drawGame()` when a challenge URL with `targetScore` was active.
- **Fix:** Removed the `flashOverlay`/`queueGameEffect` lines referencing `color` and `alpha`. Replaced with the intended `ctx.fillText('Target: ...')` + `ctx.restore()`.

### C5: generateFood board-full guard under-counts
- **Problem:** The guard `currentSnake.length + obstacles.length >= totalTiles` didn't count food, food2, extraFoods, or powerUpPickup, so on a nearly-full board the MAX_ITERATIONS scan could return a tile overlapping existing entities.
- **Fix:** Added `extraFoods.length` to the guard count. Added checks for `food`, `food2`, `powerUpPickup`, and `extraFoods` positions in the free-tile scan loop.

### C6: streakCharges snapshot contamination
- **Problem:** `buildSnapshotObject()` included `streakCharges` and `restoreFromSnapshot()` restored it from snapshot data, potentially duplicating or losing the persistent meta-resource banked across days.
- **Fix:** Removed `streakCharges` from `buildSnapshotObject()`. In `restoreFromSnapshot()`, changed the restore line to re-read from `saveManager` (`saveManager.getInt('snake_streak_charges', 0)`) instead of from snapshot data.

## HIGH Fixes

### H1: Stale lastConsumedDir after reset
- **Problem:** `lastConsumedDir` was never reset in `resetGame()` or `resetWaveState()`. After a game ending while moving down, the next game rejected Up as the first input.
- **Fix:** Added `lastConsumedDir = { dx: TILE_SIZE, dy: 0 };` after `dx = TILE_SIZE; dy = 0;` in both `resetGame()` and `resetWaveState()`.

### H2: Dynamic speed never recomputed
- **Problem:** `tickInterval` was set at game start but never recomputed during normal play. `getSpeed()` scaling by score was never applied unless a speed food or power-up triggered.
- **Fix:** Added `else { tickInterval = getEffectiveSpeed(); }` to the speedBoostCounter block at the end of `updateGame()`, so `tickInterval` is recomputed every tick when no speed boost is active.

### H3: tryStreakChargeSave consumes charge when findFreeTile fails
- **Problem:** `tryStreakChargeSave()` decremented `streakCharges` and persisted before checking if `findFreeTile` returned a valid position. On a full board, the charge was lost but the player still died.
- **Fix:** Restructured to call `findFreeTile` first, only decrement `streakCharges` and persist if a free position is found.

### H4: Portal teleport missing snakeGrew
- **Problem:** After portal teleport re-anchor, `snakeGrew` was not set to `true`, causing the render interpolator to mis-interpolate the head for one frame.
- **Fix:** Added `snakeGrew = true;` after the `while` loop that regrows the snake in the portal teleport block.

### H5: endHoard abandons pigment foods
- **Problem:** `endHoard()` didn't remove leftover hoard bonus foods from `extraFoods[]`. Uneaten pigment foods stayed on the board and could spuriously re-trigger Pigment Rush.
- **Fix:** Added `extraFoods = extraFoods.filter(function(ef) { return !ef.pigment; });` in `endHoard()`.

### H6: Combo-bank magnet corrupts portal foods
- **Problem:** `spendComboCharge()` mode 1 (Magnet Pulse) skipped `f.portal` but portal twin foods in extraFoods have `portalLink` (an object), not `portal` (a boolean). The pulse relocated the portal twin, breaking its link.
- **Fix:** Changed the skip condition to also check `f.portalLink`: `if (!f || f.type === 'hunter' || f.type === 'bomb' || f.type === 'portal' || f.portalLink) return;`

### H7: food2/bomb/hoard eats skip checkAchievements/checkQuestProgress
- **Problem:** The food2 eat, bomb eat, and hoard bonus eat paths didn't call `checkAchievements(score)` or `checkQuestProgress()` after incrementing score/stats. Quests/achievements gated on score or food count could be missed.
- **Fix:** Added `checkAchievements(score); checkQuestProgress();` after the food2 eat block and after the hoard bonus eat block. (The bomb eat path was already covered by the primary food eat block.)

### H8: endZenSession missing awardXP
- **Problem:** `endZenSession()` didn't call `awardXP()` for the Zen session's length-based XP, unlike `gameOver()` which calls `awardXP(snake.length * 10)`.
- **Fix:** Added `awardXP(snake.length * 10);` in `endZenSession()` before `checkAchievements(score)`.

### H9: Cross-hide panel gaps
- **Problem:** Several `show*Panel` functions didn't hide all 7 panels (stats, achievements, cosmetics, quests, settings, brews, diary), leaving panels visible simultaneously.
- **Fix:** Added missing `style.display = 'none'` lines:
  - `showBrewsPanel`: added diaryPanel hide
  - `showAchievementsPanel`: added brewsPanel + diaryPanel hide
  - `showCosmeticsPanel`: added brewsPanel + diaryPanel hide
  - `showStatsPanel`: added brewsPanel + diaryPanel hide

## Test Updates

Two test files were updated to match the corrected behavior:

- **test-v11.mjs (line 209):** Updated the streak test E assertion — the snapshot should NOT contain `streakCharges` (C6 fix). Changed from checking presence to checking absence.
- **test-bugfixes.mjs (line 148):** Updated the B8 test assertion — the generateFood guard now includes `extraFoods.length` (C5 fix).

## Test Results

- `test-v11.mjs`: 14 passed, 0 failed
- `test-v10.mjs`: 12 passed, 0 failed
- `test-v9.mjs`: 19 passed, 0 failed (ALL GREEN)
- `test-bugfixes.mjs`: 17 passed, 1 failed (B9: pre-existing failure, unrelated to audit fixes — checks for `CANVAS_WIDTH / 2` in magnet code but the code uses `PLAY_WIDTH / 2`)

## Issues Encountered

- **C5 regression:** The initial C5 fix accidentally removed the `const totalTiles` declaration line from `generateFood()`, causing `ReferenceError: totalTiles is not defined`. Fixed by restoring the declaration.
- **B9 pre-existing failure:** The B9 test ("magnet pull uses wrapped delta") was already failing before any audit fixes (confirmed via `git stash`). It checks for `CANVAS_WIDTH / 2` / `CANVAS_HEIGHT / 2` in `updateGame` but the magnet wrap code uses `PLAY_WIDTH / 2` / `PLAY_HEIGHT / 2`. Not related to any audit bug.