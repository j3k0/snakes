# Snake Bug Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 11 bugs in the Snake game, ranging from critical speed/corruption bugs to visual and UX issues.

**Architecture:** All fixes are within the single `snake.html` file. Each task modifies specific functions/lines in the 3025-line game. Tasks are ordered by criticality and dependency — early tasks fix game-breaking bugs, later tasks fix visual and UX issues.

**Tech Stack:** Vanilla JavaScript, Canvas 2D, Web Audio API, no build tools.

**Key Context:** The game has dual render loops (`setInterval` for game tick at lines 2117-2419, `requestAnimationFrame` for visuals at lines 1317-1473). AGENTS.md rules must be respected (save/restore discipline, draw order, interval management).

---

### Task 1: Speed Boost System Rewrite (B1/B2 Merged)

**This is the most critical fix. It touches the speed boost logic, slowMo interaction, and counter decrement.**

**Files:**
- Modify: `snake.html` lines 2268-2289, 586-591, 601-613, 782-784

- [ ] **Step 1: Remove the `preBoostInterval` variable**

Remove the variable declaration at line 149 (`let preBoostInterval = 120;`).

- [ ] **Step 2: Rewrite the speed food eat block (lines 2268-2289)**

Replace the current speed boost block with this code:

```javascript
// Speed food speed boost
if (eatenType === 'speed') {
    tickInterval = Math.max(MIN_SPEED, getEffectiveSpeed() - 30);
    restartGameInterval(tickInterval);
    speedBoostCounter = 16; // ~2 seconds at 120ms ticks
}
```

Remove the code block that ends with the `speedBoostCounter--` logic (lines 2278-2289). These will be replaced in Step 3.

- [ ] **Step 3: Add tick-level speed boost counter at end of updateGame()**

At the END of the `updateGame()` function (after line 2418 `visualDirty = true;`), add:

```javascript
// Speed boost counter — decrements every tick
if (speedBoostCounter > 0) {
    speedBoostCounter--;
    if (speedBoostCounter <= 0) {
        tickInterval = getEffectiveSpeed();
        restartGameInterval(tickInterval);
    }
}
```

- [ ] **Step 4: Update `restartGameInterval()` to follow AGENTS.md pattern**

Replace the function at lines 782-784:

```javascript
function restartGameInterval(speed) {
    clearInterval(gameInterval);
    gameInterval = null;
    gameInterval = setInterval(updateGame, speed || tickInterval);
}
```

- [ ] **Step 5: Verify the fix**

Manual verification sequence:
1. Open snake.html in browser (or use console)
2. Start a Classic game, eat speed food
3. Verify `speedBoostCounter` decrements every tick (check via console or behavior)
4. Before speed boost expires, pick up a slowMo powerup
5. Wait for speed boost to expire — verify game speed transitions to slowMo speed, not a stale value
6. Wait for slowMo to expire — verify game returns to normal speed
7. Eat speed food, avoid all food for 16+ ticks — verify speed boost expires regardless

- [ ] **Step 6: Commit**

```
git add snake.html
git commit -m "fix: rewrite speed boost system — eliminate stale preBoostInterval, make counter tick-based"
```

---

### Task 2: Fix Daily Streak Never Incrementing (B3)

**Files:**
- Modify: `snake.html` lines 706-730 and 2475-2492

- [ ] **Step 1: Reorganize daily streak save logic in `startGame()`**

Replace the streak block in `startGame()` (lines 708-729) with:

```javascript
// Update streak — only when a daily game actually starts
const today = new Date();
const storedDate = saveManager.get('snake_daily_date', '');
let streak = saveManager.getInt('snake_streak_count', 0);
const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

if (storedDate && storedDate !== todayStr) {
    // Different day than last play — check if consecutive
    const parts = storedDate.split('-');
    const storedDateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth()+1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    if (storedDate === yesterdayStr) {
        streak++;
    } else {
        streak = 1; // Broken streak, restart
    }
    saveManager.set('snake_streak_count', streak);
} else if (!storedDate) {
    // First ever play
    streak = 1;
    saveManager.set('snake_streak_count', streak);
}
// Always save the date so next day's comparison works
saveManager.set('snake_daily_date', todayStr);
```

Key changes:
- The date is SAVED here after streak computation (was only saved by `syncDailyState()` on page load)
- On first play of a new day, the streak comparison happens before `syncDailyState()` could normalize the date
- On same-day replays, `storedDate === todayStr` so the block is skipped — no re-increment

- [ ] **Step 2: Remove date save from `syncDailyState()`**

In `syncDailyState()` (line 2484), remove the line `saveManager.set('snake_daily_date', dateStr);` — the date is now saved in `startGame()` only. `syncDailyState()` should only load state, not write the date.

- [ ] **Step 3: Verify the fix**

Manual verification:
1. Clear localStorage for the site or set `snake_daily_date` to yesterday
2. Open game, select Daily Challenge, start game
3. Check localStorage — `snake_daily_date` should equal today, `snake_streak_count` should be 1
4. Close tab, re-open on the same day, start daily game — verify streak NOT incremented (still 1)
5. Manually set `snake_daily_date` to yesterday, start game — verify streak increments to 2

- [ ] **Step 4: Commit**

```
git add snake.html
git commit -m "fix: daily streak now correctly increments — save date after streak computation"
```

---

### Task 3: Remove Duplicate combo_milestone Case (B4)

**Files:**
- Modify: `snake.html` lines 1197-1202

- [ ] **Step 1: Remove the dead second `case 'combo_milestone':`**

Delete lines 1197-1202 (the second `case 'combo_milestone':` block that has the single sustained 660Hz tone). After removal, the `case 'levelup':` block should flow directly.

- [ ] **Step 2: Verify the fix**

Read the switch statement — confirm only one `case 'combo_milestone':` remains.

- [ ] **Step 3: Commit**

```
git add snake.html
git commit -m "fix: remove duplicate combo_milestone case in playSound() — was unreachable dead code"
```

---

### Task 4: Fix levelUpFlash Only on Actual Level-Ups (B5)

**Files:**
- Modify: `snake.html` line 2448

- [ ] **Step 1: Move levelUpFlash inside the level-up while loop**

In `awardXP()` function, move `levelUpFlash = 1500;` from line 2448 (outside the while loop) to inside the while loop, after `level++;` at line 2444:

```javascript
while (newLevel > level) {
    level++;
    levelUpFlash = 1500;  // moved here
    showLevelUpToast(level);
    checkLevelUnlocks(level);
}
```

And remove `levelUpFlash = 1500;` from line 2448 (the original position).

- [ ] **Step 2: Verify the fix**

Start a game, eat food to gain XP. Verify that:
- No golden flash appears on routine XP gains (the `awardXP(1)` every 10 ticks)
- Golden flash only appears when an actual level-up occurs
- The "LEVEL N!" text appears only on level-ups

- [ ] **Step 3: Commit**

```
git add snake.html
git commit -m "fix: levelUpFlash only triggers on actual level-ups, not every XP award"
```

---

### Task 5: Fix Flash Overlay Draw Order (B6)

**Files:**
- Modify: `snake.html` lines 1390-1445 (in `animateVisuals()`)

- [ ] **Step 1: Move flash overlay rendering to the end of `animateVisuals()`**

In the `animateVisuals()` function, locate the flash overlay rendering at lines 1390-1395:

```javascript
if (flashOverlay) {
    ctx.fillStyle = flashOverlay.color;
    ctx.globalAlpha = Math.max(0, flashOverlay.alpha);
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalAlpha = 1;
}
```

Move this block to AFTER the XP level-up flash rendering (after line 1445), but BEFORE the `requestAnimationFrame(animateVisuals)` call at line 1473. The new order should be:

1. Help overlay (lines 1398-1400)
2. Session summary (lines 1402-1419)
3. Snap level-up flash (lines 1421-1431)
4. XP level-up flash (lines 1434-1445)
5. **Flash overlay** (moved block, lines 1390-1395)
6. Score animation (lines 1447-1472)
7. requestAnimationFrame (line 1473)

- [ ] **Step 2: Verify the fix**

Trigger a level-up (via XP gain). The golden flash overlay should now render ON TOP of the session summary, snap level-up text, and XP level-up text. The flash should be fully visible as a screen-covering effect.

- [ ] **Step 3: Commit**

```
git add snake.html
git commit -m "fix: flash overlay renders last per AGENTS.md draw order — moved to end of animateVisuals()"
```

---

### Task 6: Fix Touch D-Pad Double-Dispatch on Pause Button (B7)

**Files:**
- Modify: `snake.html` lines 2931-2943

- [ ] **Step 1: Add touch-dispatch flag and consolidate D-pad handlers**

Replace the D-pad event listeners (lines 2931-2943) with:

```javascript
// Virtual D-pad — use touchstart-only to avoid double-dispatch on touch devices
// Desktop click handler checks a touch-dispatch flag to suppress redundant events
let _touchDispatched = false;

document.querySelectorAll('.dpad-btn').forEach(function(btn) {
  btn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    _touchDispatched = true;
    const key = btn.getAttribute('data-key');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: key }));
  }, { passive: false });
  
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    if (_touchDispatched) {
      _touchDispatched = false;
      return;
    }
    const key = btn.getAttribute('data-key');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: key }));
  });
});
```

- [ ] **Step 2: Verify the fix**

On a touch device (or Chrome DevTools with mobile emulation + touch enabled):
1. Start a game
2. Tap the space (pause) button on the D-pad
3. Verify the game pauses ONCE — it should NOT instantly resume
4. Tap the pause button again — game should resume
5. Tap direction buttons — verify single direction changes, no double-moves

- [ ] **Step 3: Commit**

```
git add snake.html
git commit -m "fix: touch D-pad no longer double-dispatches — _touchDispatched flag prevents click from firing after touchstart"
```

---

### Task 7: Fix Rival generateFood Double-Counting Rival Length (B8)

**Files:**
- Modify: `snake.html` line 509 and callers at lines 663, 971, 2276, 2412

- [ ] **Step 1: Update `generateFood()` to remove `rivalLength` from guard**

At line 508, remove the `rivalLength` variable and update the guard:

Change lines 508-509 from:
```javascript
const rivalLength = rivalActive ? rivalSnake.length : 0;
if (currentSnake.length + obstacles.length + rivalLength >= totalTiles) return null;
```

To:
```javascript
if (currentSnake.length + obstacles.length >= totalTiles) return null;
```

Now the `currentSnake` parameter entirely controls what's counted. Callers that include rival in `currentSnake` will correctly count it; callers that don't won't double-count.

- [ ] **Step 2: Update all callers to include rivalSnake in currentSnake**

Find the callers of `generateFood()` and update them:

**Line 663** (initial food generation in `resetGame()`):
```javascript
const combinedInitial = snake.concat(rivalActive ? rivalSnake : []);
food = generateFood(combinedInitial);
```

**Line 971** (rival ate food):
This already passes `combinedSnake = snake.concat(rivalSnake)`. No change needed.

**Line 2276** (player ate food):
```javascript
const playerCombined = snake.concat(rivalActive ? rivalSnake : []);
food = generateFood(playerCombined);
```

**Line 2412** (passive food regeneration):
This already passes `combinedSnake = snake.concat(rivalActive ? rivalSnake : [])`. No change needed.

- [ ] **Step 3: Verify the fix**

In Classic mode with a rival snake present:
1. Let the snake and rival grow to occupy many tiles
2. When food is eaten, verify `generateFood` uses the correct total (no double-count)
3. The "board filled up" game-over only triggers when the board is truly full

- [ ] **Step 4: Commit**

```
git add snake.html
git commit -m "fix: remove rivalLength double-count in generateFood board-full guard — callers now pass combined snake"
```

---

### Task 8: Fix Magnet Pull Broken at Wrap Edges (B9)

**Files:**
- Modify: `snake.html` lines 2336-2358

- [ ] **Step 1: Add wrapped delta computation for magnet pull**

Replace the magnet food-pull logic at lines 2336-2358:

```javascript
// Magnet effect: pull food toward snake
if (magnetActive && food) {
    const head = snake[0];
    let dx_food = head.x - food.x;
    let dy_food = head.y - food.y;

    // Account for wrapping — use the shortest path on each axis
    if (Math.abs(dx_food) > CANVAS_WIDTH / 2) {
        dx_food = dx_food > 0 ? dx_food - CANVAS_WIDTH : dx_food + CANVAS_WIDTH;
    }
    if (Math.abs(dy_food) > CANVAS_HEIGHT / 2) {
        dy_food = dy_food > 0 ? dy_food - CANVAS_HEIGHT : dy_food + CANVAS_HEIGHT;
    }

    const dist = Math.abs(dx_food) + Math.abs(dy_food);
    if (dist > 0 && dist <= 4 * TILE_SIZE) {
        let newFX = food.x;
        let newFY = food.y;
        if (Math.abs(dx_food) >= Math.abs(dy_food)) {
            newFX += dx_food > 0 ? TILE_SIZE : -TILE_SIZE;
        } else {
            newFY += dy_food > 0 ? TILE_SIZE : -TILE_SIZE;
        }
        const wrappedPos = wrapPosition({ x: newFX, y: newFY });
        const wrappedFX = wrappedPos.x;
        const wrappedFY = wrappedPos.y;
        if (!snake.some(s => s.x === wrappedFX && s.y === wrappedFY) &&
            !obstacles.some(o => o.x === wrappedFX && o.y === wrappedFY)) {
            food.x = wrappedFX;
            food.y = wrappedFY;
        }
    }
}
```

- [ ] **Step 2: Verify the fix**

In a wrapping board mode (Classic):
1. Position snake near left edge (x=20) and food near right edge (x=380)
2. Activate magnet powerup
3. Verify food moves left toward the snake (wrapping across the boundary), not right away from it
4. Test in all 4 edge directions (top/bottom/left/right)

- [ ] **Step 3: Commit**

```
git add snake.html
git commit -m "fix: magnet pull now uses wrapped delta distance — food near edges pulls correctly across wrap boundary"
```

---

### Task 9: Add Achievement/Daily Checks to endZenSession (B10)

**Files:**
- Modify: `snake.html` lines 1083-1090

- [ ] **Step 1: Add achievement and daily checks to `endZenSession()`**

Replace `endZenSession()` at lines 1083-1090:

```javascript
function endZenSession() {
    clearInterval(gameInterval);
    gameInterval = null;
    gameState = 'gameover';
    score = snake.length;
    finalizeSession(true);
    checkAchievements(score);
    checkDailyCompletion(score, {
        sessionSpeedFood: sessionSpeedFood,
        sessionBonusFood: sessionBonusFood,
        sessionMaxCombo: sessionMaxCombo,
        sessionTimeAlive: sessionTimeAlive,
        sessionFoodEaten: sessionFoodEaten,
        sessionFoodTypes: sessionFoodTypes,
        snakeLength: snake.length
    });
    // Session summary for display
    sessionSummary = {
        score: score,
        time: Math.floor(sessionTimeAlive / 1000),
        food: sessionFoodEaten,
        combo: sessionMaxCombo,
        xp: sessionXP,
    };
    sessionSummaryTimer = 4000;
    zenActive = false;
}
```

- [ ] **Step 2: Verify the fix**

Start Zen mode, play to reach an achievement threshold (e.g., eat first food for "First Bite"), then press Enter to end the session. Verify:
- Achievement toast appears
- Daily completion is checked (if it's Daily mode)
- Session summary appears

- [ ] **Step 3: Commit**

```
git add snake.html
git commit -m "fix: endZenSession() now calls checkAchievements() and checkDailyCompletion() for progression consistency"
```

---

### Task 10: Fix drawOverlay() Canvas State Leak (B11)

**Files:**
- Modify: `snake.html` lines 1476-1571

- [ ] **Step 1: Wrap `drawOverlay()` with `ctx.save()`/`ctx.restore()`**

At the very beginning of the function (after line 1476, before any canvas mutations), add:
```javascript
ctx.save();
```

At the very end of the function (after the closing brace of the `if (gameState === 'gameover')` block at line 1571, before the function's closing `}`), add:
```javascript
ctx.restore();
```

- [ ] **Step 2: Verify no early return leaks state**

Check all three early returns in `drawOverlay()`:
- Line 1542: `return;` (idle state) — the `ctx.save()` was called at the top, so this is safe ONLY if `ctx.restore()` is also called before it. Since we're at the top of the function and the return is in the idle path... Actually, we need to ensure the save/restore wraps the idle path too.

**Correction:** Instead of save/restore at function boundaries, use save/restore around the entire function body. Replace the early returns with a pattern that always restores:

```javascript
function drawOverlay(text, subtext) {
    ctx.save();
    // ... all existing code ...
    
    // Change: return statements become skip-to-restore
    if (gameState === 'idle') {
        // ... all idle rendering code ...
        ctx.restore();
        return;
    }
    // ... rest of function ...
    ctx.restore();
}
```

Actually simpler: add `ctx.save()` at line 1477 (after the function opening), and add `ctx.restore()` at line 1571 (before the closing brace), and also add `ctx.restore()` at line 1542 before the early return.

- [ ] **Step 3: Verify the fix**

Open the game, navigate through all states (idle → playing → paused → gameover). Verify no canvas state leaks occur — score text, food labels, and HUD text all render at correct positions with correct font/size.

- [ ] **Step 4: Commit**

```
git add snake.html
git commit -m "fix: drawOverlay() canvas state leak fixed with ctx.save()/ctx.restore() wrapping"
```

---

### Task 11: Help Overlay H Key GameState Guard + Escape Close (B12)

**Files:**
- Modify: `snake.html` lines 2854-2863 (Escape handler) and 2878-2888 (H handler)

- [ ] **Step 1: Add gameState guard to H key handler**

Replace the H key handler at lines 2878-2888:

```javascript
if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    if (gameState !== 'idle') {
        // Help overlay is only meaningful on the menu screen
        if (helpOverlayVisible) {
            helpOverlayVisible = false;
            visualDirty = true;
        }
        return;
    }
    if (helpOverlayVisible) {
        helpOverlayVisible = false;
        visualDirty = true;
    } else {
        helpOverlayVisible = true;
        visualDirty = true;
    }
    return;
}
```

- [ ] **Step 2: Make Escape close help overlay**

In the Escape handler (lines 2854-2863), BEFORE the gameover/idle checks, add:

```javascript
if (e.key === 'Escape') {
    // Close help overlay first if open
    if (helpOverlayVisible) {
        helpOverlayVisible = false;
        visualDirty = true;
        return;
    }
    // ... existing gameover/idle/panel code ...
```

- [ ] **Step 3: Verify the fix**

1. Open game in idle state, press H — help overlay appears
2. Press Escape — help overlay closes
3. Press H again during gameplay — nothing happens (game continues uninterrupted)
4. Press H at gameover — nothing happens (gameover screen not obscured)
5. Ensure game state is preserved throughout

- [ ] **Step 4: Commit**

```
git add snake.html
git commit -m "fix: help overlay H key now guarded by gameState — only works in idle; Escape closes help"
```

---

## Execution

This plan will be executed using **Subagent-Driven Development**: each task dispatched to a fresh implementer subagent, followed by two-stage review (spec compliance then code quality), all sequentially.
