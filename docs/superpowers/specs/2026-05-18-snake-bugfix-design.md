# Snake Game Bug Fix Design

> **Spec Status:** Draft v1
> **Date:** 2026-05-18

## Bug Fix Package

This design document catalogs all known bugs in the Snake game (snake.html) and defines the fix approach for each. Bugs are prioritized by severity and grouped into independent fix tasks for implementation.

---

## Bug Catalog (All Known Issues)

### Critical Bugs

#### B1/B2: Speed Boost System Rewrite — Stale preBoostInterval + Counter Only Decrements on Food-Eat

**Location:** `updateGame()` lines 2268–2289, `activatePowerUp()` lines 586–591, `deactivatePowerUp()` lines 601–613

**Root Causes:** Two interacting bugs:
1. `preBoostInterval` captures `tickInterval` when speed food is eaten. If slowMo state changes before speed boost expires, restoring `preBoostInterval` gives a wrong value — game gets stuck at wrong speed permanently.
2. `speedBoostCounter--` is inside the `if (food eaten)` block, so it only decrements when food is eaten. Without food, the speed boost lasts indefinitely.

**Fix:** Complete rewrite of the speed boost logic:
- Remove `preBoostInterval` entirely
- Speed boost sets `tickInterval` to `Math.max(MIN_SPEED, getEffectiveSpeed() - 30)` at activation
- At boost end, restore via `tickInterval = getEffectiveSpeed()` — always recomputes from current state, never uses a stale saved value
- Move `speedBoostCounter--` to the end of `updateGame()` (outside the food-eat block), so it decrements every tick
- The non-speed-food speed adjustment at line 2278 (`if (eatenType !== 'speed' && speedBoostCounter <= 0)`) must also be evaluated every tick, not just on food eat
- Ensure `restartGameInterval()` is called consistently — use `clearInterval(gameInterval); gameInterval = null; gameInterval = setInterval(updateGame, tickInterval)` pattern per AGENTS.md

#### B3: Daily Streak Never Increments — `snake_daily_date` Not Saved

**Location:** `startGame()` lines 706–730, `syncDailyState()` lines 2475–2492

**Root Cause:** `syncDailyState()` (lines 2475–2492) runs on page load and saves `today` as `snake_daily_date` (line 2484). When `startGame()` runs later (lines 706–730), it reads `storedDate` which already matches `todayStr`. The condition `storedDateStr !== todayStr` (line 715) is always false on same-day plays. Additionally, the streak increment logic at lines 721–728 never explicitly saves `snake_daily_date` to localStorage — even on the first play or on the first play of a new day, the date is updated by `syncDailyState()` before `startGame()` has a chance to do the comparison.

**Fix:** In `startGame()`, after computing the streak value:
1. Save `snake_daily_date` to `todayStr` regardless of whether the streak incremented — this must happen INSIDE the streak computation conditional (after line 724) so that same-day re-runs don't re-increment
2. Add explicit save of `snake_streak_count` alongside the date save to ensure storage consistency
3. The date must be saved at the same time as the streak count, not deferred to a later call

#### B4: Duplicate `case 'combo_milestone'` in `playSound()` — Dead Code

**Location:** `playSound()` lines 1170–1177 and 1197–1202

**Root Cause:** Two `case 'combo_milestone':` labels in the same switch statement. JavaScript matches the first one; the second (at line 1197) is unreachable dead code. The two cases have different sound implementations (ascending arpeggio vs. single sustained tone), suggesting conflicting intent.

**Fix:** Remove the dead second case (lines 1197–1202). Keep the first implementation (ascending C5→E5 arpeggio, 0.2s).

### High Bugs

#### B5: `levelUpFlash` Set on Every XP Award, Not Just Level-Ups

**Location:** `awardXP()` line 2448

**Root Cause:** `levelUpFlash = 1500;` is outside the `while (newLevel > level)` loop, so it fires on every `awardXP()` call, including the `awardXP(1)` every 10 game ticks. This causes a constant golden flash making genuine level-ups invisible.

**Fix:** Move `levelUpFlash = 1500;` inside the `while (newLevel > level)` loop, after `level++;`.

#### B6: Flash Overlay Does Not Render Last — Draw Order Violation

**Location:** `animateVisuals()` lines 1390–1445

**Root Cause:** The flash overlay renders at lines 1390–1395, but four elements render after it: help overlay (1398), session summary (1403), snap level-up flash (1422), level-up flash (1435). This violates the AGENTS.md rule that flash overlay must render on top of everything.

**Fix:** Move the flash overlay rendering to the very end of `animateVisuals()`, after the session summary, snap level-up, and level-up flash sections. The ordering should be: help overlay → session summary → snap level-up flash → XP level-up flash → flash overlay.

#### B7: Touch D-Pad Space Button Causes Instant Pause/Resume Toggle

**Location:** D-pad event listeners lines 2931–2943

**Root Cause:** Each `.dpad-btn` has both `click` and `touchstart` listeners. On touch devices, `touchstart` dispatches a Keydown event and `e.preventDefault()` should suppress the subsequent `click`. On some platforms (Android Chrome), the click still fires, causing double-dispatch. For the space button, this means pause followed immediately by resume.

**Fix:** Consolidate to a single event handler. Use `touchstart` only (remove `click` listener on touch devices), or use a flag that the `click` handler checks to skip if a `touchstart` already dispatched the event.

#### B8: Rival `generateFood` Double-Counts Rival Length

**Location:** `updateRival()` line 970–971, `generateFood()` line 508–509

**Root Cause:** When the rival eats food, it calls `generateFood(combinedSnake)` where `combinedSnake = snake.concat(rivalSnake)`. Inside `generateFood`, `rivalLength = rivalActive ? rivalSnake.length : 0` double-counts the rival — once via `currentSnake.length` (which includes rival from `combinedSnake`) and once via `rivalLength`.

**Fix:** When the `currentSnake` parameter already includes the rival snake, pass `rivalActive = false` for the length guard calculation. Simplest approach: in `generateFood`, don't add `rivalLength` to the guard if `currentSnake` already includes rival segments. Or better: remove the `rivalLength` variable entirely and rely solely on `currentSnake.length + obstacles.length`.

#### B9: Magnet Pull Broken at Wrap Edges

**Location:** `updateGame()` lines 2336–2358

**Root Cause:** The magnet pull uses linear Manhattan distance (`head.x - food.x`, `head.y - food.y`) without accounting for world wrapping. Food near the right edge might be 20px away across the wrap boundary but 380px away in linear space, so the magnet pulls in the wrong direction or doesn't pull at all.

**Fix:** Compute wrapped delta: for each axis, if the absolute distance exceeds `CANVAS_WIDTH / 2`, use the wrapped distance instead. Then pull toward the shortest path.

#### B10: `endZenSession()` Skips `checkAchievements()` and `checkDailyCompletion()`

**Location:** `endZenSession()` lines 1083–1090

**Root Cause:** `endZenSession()` calls `finalizeSession(true)` but does NOT call `checkAchievements()` or `checkDailyCompletion()`, unlike `gameOver()`. This makes session-end achievement/daily checks fragile in Zen mode.

**Fix:** Add `checkAchievements(score)` and `checkDailyCompletion(score, ...)` calls to `endZenSession()`, passing the same context object that `gameOver()` uses.

#### B11: drawOverlay() Leaks Canvas State (textAlign, textBaseline)

**Location:** `drawOverlay()` lines 1476–1571

**Root Cause:** `drawOverlay()` sets `ctx.textAlign = 'center'`, `ctx.textBaseline = 'middle'`, and various `ctx.font` / `ctx.fillStyle` values without any `ctx.save()`/`ctx.restore()` pair. The idle branch has an early return at line 1542 that leaks these values. While it doesn't corrupt live gameplay (idle screen renders before game starts), the non-idle path (paused/gameover) leaks state into the next `drawGame()` call in `animateVisuals()`, potentially misaligning score text, food labels, or other canvas text.

**Fix:** Wrap the `drawOverlay()` canvas mutations with `ctx.save()`/`ctx.restore()`. All `ctx.textAlign`, `ctx.textBaseline`, `ctx.font`, and `ctx.fillStyle` changes should be scoped inside the save/restore pair.

#### B12: Help Overlay H Key Missing gameState Guard

**Location:** Keydown handler lines 2878–2888

**Root Cause:** The H key toggles `helpOverlayVisible` with no gameState guard. During gameplay, help overlay fills the canvas (rgba(0,0,0,0.85)) while the game continues running — player may die while viewing help. At gameover, help obscures the game-over screen. Escape key does not close the help overlay.

**Fix:** Add a gameState guard: only allow help toggle in `idle` state (where mode selection help is meaningful). Also make Escape close help overlay if visible.

### Medium/Low Bugs (Documented, Deferred)

These are real but less impactful. Documented for awareness; not in scope for this fix cycle.

- **Snap mode shrinkTimer double-accounting** (explorer 1, Bug #1) — Fragile but functionally correct
- **PowerUp timer uses `getEffectiveSpeed()` not actual tick interval** (explorer 1, Bug #4) — Powerups expire 33% faster during speed boost
- **Canvas tap dispatches Space with no debounce** (explorer 3, Bug #3) — Accidental pauses
- **`drawGame(1)` called twice in `gameOver()`** (explorer 3, Bug #6) — One-frame visual glitch
- **Toast queue bypassed by direct DOM manipulation** (review 1, Bug #3) — Race condition on toast element
- **`cachedLevel` not reset on prestige** (review 1, Bug #5)
- **Stats not persisted until game over** (review 1, Bug #6)
- **Magnet doesn't check rival snake tiles** (review 2, Bug C)

---

## Implementation Order

| Priority | Bug ID | Description | Impact | Risk |
|----------|--------|-------------|--------|------|
| P0 | B1/B2 | Speed Boost System Rewrite (merged) | Stale preBoostInterval + indefinite boost | Medium |
| P0 | B3 | Daily streak never increments | Core feature broken, user-facing | Low |
| P0 | B5 | levelUpFlash on every XP award | P0 per UX review — constant visual noise from `awardXP(1)` every 10 ticks means every player sees the flash constantly, destroying the level-up feedback loop | Low |
| P0 | B7 | Touch D-pad pause/resume toggle | P0 per UX review — pause button completely broken on Android Chrome | Medium |
| P0 | B8 | Rival generateFood double-counts rival | P0 per completeness review — causes premature game-over in rival modes | Low |
| P1 | B4 | Duplicate combo_milestone case (dead code) | Confusing, wastes code | Low |
| P1 | B6 | Flash overlay draw order violation | Visual bug, screen flash obscured | Low |
| P1 | B9 | Magnet pull broken at wrap edges | Power-up doesn't work near edges | Low |
| P1 | B10 | endZenSession() skips checks | Achievements/daily not checked in Zen | Low |
| P1 | B11 | drawOverlay() leaks canvas textAlign/textBaseline | Canvas state corruption, text misalignment risk | Low |
| P1 | B12 | Help overlay H key missing gameState guard | AGENTS.md violation, player can obscure live game | Low |

---

## Design Decisions

### Decision 1: Replace `preBoostInterval` with on-demand speed recomputation

Instead of tracking a saved interval value, speed-food boost will lower `tickInterval` by 30ms from whatever `getEffectiveSpeed()` returns. When the boost expires, call `getEffectiveSpeed()` to restore. This eliminates the stale-state problem entirely.

### Decision 2: Use a `_touchUsedFlag` for D-pad double-dispatch fix

Rather than removing the `click` event (which would break desktop touchpad users), use a `touchstart`-set flag that the `click` handler checks. On `touchstart`, set a flag. On `click`, if the flag is set, skip dispatch and clear the flag. This handles hybrid touch/pointer devices correctly.

### Decision 3: `generateFood` guard simplification

Remove the `rivalLength` variable from the board-full guard. The function already receives `currentSnake` which may or may not include rival segments. The guard should check `currentSnake.length + obstacles.length >= totalTiles`. If the caller wants to exclude rival from the guard, they can pass a shorter array.

### Decision 4: Wrapped delta for magnet

Compute the shortest-path distance on each axis by checking if the straight-line distance exceeds half the board size, and if so, use the wrapped distance. Pull food along the shortest axis.

### Decision 5: AGENTS.md compliance for interval management

All `restartGameInterval()` call sites must follow the AGENTS.md pattern: `clearInterval(gameInterval); gameInterval = null; gameInterval = setInterval(updateGame, tickInterval)`. The existing `restartGameInterval()` helper at line 782 currently does `clearInterval` + `setInterval` but does NOT set `gameInterval = null` between them. This will be updated to match AGENTS.md convention.

---

## Cross-Feature Interactions

| Interaction | Handling |
|---|---|
| Speed boost + slowMo active simultaneously | Boost expiration always uses `getEffectiveSpeed()`, which accounts for slowMo. Clean separation. |
| PowerUp timer during speed boost | PowerUp timer uses tick-based decrement — during speed boost, more ticks fire per second, so powerups expire faster. This is intentional (speed boost costs you powerup time). |
| Magnet pull near obstacles | Already checked (line 2353). Wrapped delta fix doesn't affect obstacle checking. |
| Daily streak across midnight | `syncDailyState()` handles date boundary. The startGame() fix ensures the date is saved after streak increment. |
| B5 × B10: Zen session end + level-up flash | B10 adds `checkAchievements()` to `endZenSession()`, which calls `awardXP()`. If this triggers a level-up, `levelUpFlash` fires during game-over state. Verify the flash doesn't conflict with game-over overlay rendering. |
| B10: Zen session end + toast queue | Both `checkAchievements()` and `checkDailyCompletion()` call `queueToast()`. The queue serializes correctly, but verify no direct `toastEl.style.display = 'block'` calls bypass the queue in the game-over/Zen-end path. |

---

## Verification Strategies

| Bug ID | How to Verify |
|--------|---------------|
| B1/B2 | Start game, eat speed food, toggle slowMo via powerup, wait for boost to expire. Verify `tickInterval` returns to correct slowMo speed (not a stale pre-boost value). Then avoid food entirely for 16+ ticks — verify speed boost expires after 16 ticks regardless of food consumption. |
| B3 | Open game on day N, start daily challenge. On day N+1, open game, verify streak incremented. Start another game same day — verify streak does NOT re-increment. |
| B4 | Trigger combo_milestone (eat food with 3x combo). Verify ascending C5→E5 arpeggio plays. |
| B5 | Start game, eat food. Verify golden flash appears ONLY on actual level-up, not on every food-eat. |
| B6 | Trigger level-up. Verify flash overlay renders ON TOP of session summary, snap level-up text, and XP level-up text. |
| B7 | On touch device (or Chrome DevTools mobile emulation), tap space button on D-pad. Verify pause toggles exactly once, not instantly pause+resume. |
| B8 | Classic mode with rival. Simulate near-full board. Verify no premature "board filled up" game-over. |
| B9 | Wrapping mode, food at right edge, snake head at left edge. Activate magnet powerup. Verify food moves toward snake via the shortest (wrapped) path. |
| B10 | Start Zen mode, play, end Zen session. Verify achievement toasts and daily toasts appear. |
| B11 | Inspect idle screen rendering. Verify no canvas state leaks into subsequent game rendering. |
| B12 | Help overlay H key: Open help during idle. Press Escape. Verify help overlay closes. During gameplay, press H. Verify help opens but game continues. Press H again. Verify help closes. |
