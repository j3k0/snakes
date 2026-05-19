# Snake Bugfix Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 confirmed bugs across persistence, rendering, game logic, and mobile UX. All changes go into the single file `snake.html`.

**Architecture:** Bugs are grouped into 5 clusters by dependency, implemented sequentially with review between groups.

**Tech Stack:** Vanilla JS (ES6), Canvas 2D, Web Audio API, localStorage

---

## Task 1: Fix Persistence Issues (Bug 2a/2b/2c)

**File:** `/Users/jeko/tmp/snakes/snake.html`

### Step 1a: Add snake_xp and snake_prestige to saveAllState()

Find `function saveAllState()` (search for `saveAllState`). Currently it saves 3 keys. Add saves for `snake_xp` and `snake_prestige`:

```js
function saveAllState() {
    saveManager.set('snake_pinnacle', pinnacleRank);
    saveManager.set('snake_xp_overcharge', xpOvercharge);
    saveManager.set('snake_xp', xp);
    saveManager.set('snake_prestige', prestigeLevel);
    saveManager.setJSON('snake_stats', stats);
}
```

- [ ] Step 1a complete

### Step 1b: Save xpOvercharge on pinnacle activation

Find the pinnacle branch of the X key handler (search for `pinnacleRank++` in the keydown handler). After `saveManager.set('snake_pinnacle', pinnacleRank);` and `saveManager.set('snake_xp', '0');`, add:

```js
saveManager.set('snake_xp_overcharge', xpOvercharge);
```

- [ ] Step 1b complete

### Step 1c: Call syncDailyState() in startGame()

Find `function startGame()` (search for `function startGame`). Right at the top, before the daily challenge attempt check, add:

```js
function startGame() {
    syncDailyState();
    sessionSummary = null;
    // ... rest of existing code
```

Verify:
```bash
grep -c "syncDailyState" /Users/jeko/tmp/snakes/snake.html
```
Expected: 3 (declaration, boot call, startGame call)

- [ ] Step 1c complete

---

## Task 2: Fix Body Segment Interpolation (Bug 3)

**File:** `/Users/jeko/tmp/snakes/snake.html`

### Step 2a: Fix the else-if branch in drawSnake()

Search for the body interpolation else-if branch (look for `else if (prevSnake[index])` in `drawSnake()` — there are two similar patterns, one for `snakeGrew` and one for non-grew. The non-grew branch is the one with `prevSnake[index]` — NOT `prevSnake[index - 1]`.

Find this pattern:
```js
} else if (prevSnake[index]) {
    const pdx = segment.x - prevSnake[index].x;
    const pdy = segment.y - prevSnake[index].y;
    drawX = Math.abs(pdx) > CANVAS_WIDTH / 2 ? segment.x : prevSnake[index].x + pdx * t;
    drawY = Math.abs(pdy) > CANVAS_HEIGHT / 2 ? segment.y : prevSnake[index].y + pdy * t;
}
```

CHANGE TO:
```js
} else if (index > 0 && prevSnake[index - 1]) {
    const pdx = segment.x - prevSnake[index - 1].x;
    const pdy = segment.y - prevSnake[index - 1].y;
    drawX = Math.abs(pdx) > CANVAS_WIDTH / 2 ? segment.x : prevSnake[index - 1].x + pdx * t;
    drawY = Math.abs(pdy) > CANVAS_HEIGHT / 2 ? segment.y : prevSnake[index - 1].y + pdy * t;
}
```

Verify: Search for `prevSnake[index]` and `prevSnake[index - 1]` — the non-grew branch should use `index - 1`, the grew branch (which already uses `index - 1`) should be unchanged.

- [ ] Step 2a complete

---

## Task 3: Fix Rival AI Wrap-Aware Pathfinding (Bug 4)

**File:** `/Users/jeko/tmp/snakes/snake.html`

### Step 3a: Apply wrapped delta to rival food-seeking

Find the rival food-seeking section in `updateRival()` (search for `dx_food` and `dy_food` inside the rival AI, around where it calculates `nearestFood` direction). The code currently computes:

```js
const dx_food = nearestFood.x - head.x;
const dy_food = nearestFood.y - head.y;
```

After these two lines, add wrap-aware deltas (same pattern as the magnet power-up):

```js
// Account for wrapping — use the shortest path on each axis
if (Math.abs(dx_food) > CANVAS_WIDTH / 2) {
    dx_food = dx_food > 0 ? dx_food - CANVAS_WIDTH : dx_food + CANVAS_WIDTH;
}
if (Math.abs(dy_food) > CANVAS_HEIGHT / 2) {
    dy_food = dy_food > 0 ? dy_food - CANVAS_HEIGHT : dy_food + CANVAS_HEIGHT;
}
```

- [ ] Step 3a complete

---

## Task 4: Fix Combo Flash Priority (Bug 8)

**File:** `/Users/jeko/tmp/snakes/snake.html`

### Step 4a: Guard the combo milestone flash assignment

Find the combo milestone flashOverlay assignment (search for `flashOverlay = { color, alpha, priority:` inside the combo milestone handler). Currently it writes unconditionally. Change to:

```js
if (!flashOverlay || flashOverlay.priority !== 'critical') {
    flashOverlay = { color, alpha, priority: comboCount >= 10 ? 'high' : 'normal' };
}
```

- [ ] Step 4a complete

---

## Task 5: Fix updateScoreDisplay Triple-Call + Zen Mode (Bug 9)

**File:** `/Users/jeko/tmp/snakes/snake.html`

### Step 5a: Find and remove the redundant updateScoreDisplay() call

Search for `updateScoreDisplay()` calls near the eat handler. Find the third redundant call (after both `addScore()` calls have already run). It's approximately at the end of the eat block. Remove that line.

- [ ] Step 5a complete

### Step 5b: Add updateScoreDisplay() to addScore's Zen branch

Find the `addScore` function (search for `function addScore`). In the Zen mode guard:

```js
function addScore(amount) {
    if (gameMode === 'zen') {
        score = snake.length;
        return;
    }
    // ...
```

Change to:

```js
function addScore(amount) {
    if (gameMode === 'zen') {
        score = snake.length;
        updateScoreDisplay();
        return;
    }
    // ...
```

This ensures Zen mode still updates its score display (which was previously done by the now-removed redundant call).

- [ ] Step 5b complete

---

## Task 6: Fix Speed Boost on Resume (Bug 10)

**File:** `/Users/jeko/tmp/snakes/snake.html`

### Step 6a: Check speedBoostCounter in resumeGame()

Find `function resumeGame()` (search for `function resumeGame`). Find the line where `tickInterval = getEffectiveSpeed();` is set. Replace that line with:

```js
if (speedBoostCounter > 0) {
    tickInterval = Math.max(MIN_SPEED, getEffectiveSpeed() - 30);
} else {
    tickInterval = getEffectiveSpeed();
}
```

The `restartGameInterval(tickInterval)` call on the next line should remain unchanged.

- [ ] Step 6a complete

---

## Task 7: Fix Minor UX (Bugs 5, 6, 7)

**File:** `/Users/jeko/tmp/snakes/snake.html`

### Step 7a: Remove common food 'C' label (Bug 5)

Find the food labels object in `drawFood()` (search for `common: 'C'`). Remove the `'common: 'C',` entry. The result should be:

```js
const labels = { uncommon: 'U', rare: 'R', epic: 'E', bonus: 'B', speed: 'S' };
```

- [ ] Step 7a complete

### Step 7b: Remove image-rendering: pixelated (Bug 6)

Find `image-rendering: pixelated` in the CSS (search for `pixelated` in the HTML). Remove this line from the `#gameCanvas` CSS block.

- [ ] Step 7b complete

### Step 7c: Add overflow: hidden to body (Bug 7)

Find the `body` CSS block in the `<style>` section. Add `overflow: hidden;` to it:

```css
body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    margin: 0;
    background-color: #222;
    font-family: Arial, sans-serif;
    color: white;
    overflow: hidden;
}
```

- [ ] Step 7c complete

---

## Task 8: Fix Idle Screen Layout (Bug 1)

**File:** `/Users/jeko/tmp/snakes/snake.html`

**NOTE:** This is the highest-risk change. The idle screen in `drawOverlay()` mixes hardcoded Y positions (daily challenge info at `CANVAS_HEIGHT - XXX`) with a `currentY` flowing layout (prestige/pinnacle/overcharge/XP).

### Step 8a: Migrate daily challenge info to currentY flow

Find the daily challenge section in the idle screen (inside `drawOverlay()`, search for `gameMode === 'daily'` inside the idle state branch). Currently it draws text at hardcoded Y positions like `CANVAS_HEIGHT - 100`, `CANVAS_HEIGHT - 82`, etc.

Replace the entire daily challenge drawing block (roughly 15 lines starting from `if (gameMode === 'daily')`) with:

```js
if (gameMode === 'daily') {
    try {
        const seed = getDailySeed();
        const challenge = DAILY_CHALLENGES[seed % DAILY_CHALLENGES.length];
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('Today: ' + challenge.desc, CANVAS_WIDTH / 2, currentY);
        currentY += 18;
        ctx.fillStyle = '#AAA';
        ctx.font = '14px Arial';
        ctx.fillText('Reward: +' + challenge.reward + ' XP', CANVAS_WIDTH / 2, currentY);
        currentY += 16;
        ctx.fillStyle = dailyDone ? '#4CAF50' : '#FFD700';
        ctx.fillText('Attempts: ' + dailyAttempts + (dailyDone ? ' ✅' : ''), CANVAS_WIDTH / 2, currentY);
        currentY += 16;
        let streak = saveManager.getInt('snake_streak_count', 0);
        if (streak > 0) {
            ctx.fillStyle = '#FF6B35';
            ctx.font = '13px Arial';
            ctx.fillText('🔥 ' + streak + ' day streak!', CANVAS_WIDTH / 2, currentY);
            currentY += 16;
        }
    } catch(e) {}
}
```

- [ ] Step 8a complete

### Step 8b: Remove hardcoded Y for instruction and mobile hint

Find the instruction text lines after the prestige prompt (search for `CANVAS_HEIGHT - 40` and `CANVAS_HEIGHT - 24` near the end of the idle drawing block).

Replace these lines with `currentY`-based positioning:

```js
ctx.fillStyle = '#555';
ctx.font = '13px Arial';
if (hasTouch) {
    ctx.fillText('👆 Tap to Start | Swipe ↑↓ to change mode', CANVAS_WIDTH / 2, currentY);
    currentY += 16;
} else {
    ctx.fillText('↑↓ Select  |  ENTER Start  |  TAB Stats  |  F Achievements  |  C Cosmetics', CANVAS_WIDTH / 2, currentY);
    currentY += 16;
}
```

- [ ] Step 8b complete

### Step 8c: Verify no hardcoded CANVAS_HEIGHT offsets remain in the idle daily/instruction section

```bash
grep -n "CANVAS_HEIGHT - [0-9]" /Users/jeko/tmp/snakes/snake.html | grep -v "drawOverlay\|animateVisuals\|drawGame\|drawSnake\|drawRival\|snap\|sessionSummary\|drawFood\|drawRival\|drawHelp\|drawPowerUp\|drawTimeAttack\|drawSnap\|drawDaily\|drawXP\|drawPrestige\|drawMute\|drawSlowMo\|drawRivalHUD\|drawObstacles"
```

Expected: No idle-screen-related `CANVAS_HEIGHT - XXX` patterns remain.

- [ ] Step 8c complete

---

## Verification Steps

After all tasks:

```bash
# Parse check
node -e "const fs=require('fs'); try { new Function(fs.readFileSync('/Users/jeko/tmp/snakes/snake.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1]); console.log('SYNTAX OK'); } catch(e) { console.log('SYNTAX ERROR:', e.message); }"

# Confirm syncDailyState has 3 references
grep -c "syncDailyState" /Users/jeko/tmp/snakes/snake.html
# Expected: 3

# Confirm no 'common: 'C'' in labels
grep "common: 'C'" /Users/jeko/tmp/snakes/snake.html
# Expected: no output

# Confirm no image-rendering: pixelated
grep "image-rendering: pixelated" /Users/jeko/tmp/snakes/snake.html
# Expected: no output

# Confirm overflow: hidden on body
grep "overflow: hidden" /Users/jeko/tmp/snakes/snake.html
# Expected: at least 1 match

# Confirm saveAllState has snake_xp and snake_prestige
grep -A5 "function saveAllState" /Users/jeko/tmp/snakes/snake.html | grep "snake_xp\|snake_prestige"
# Expected: 2 matches

# Confirm no 'common: C' pattern
grep -n "common.*C" /Users/jeko/tmp/snakes/snake.html | grep "labels"
# Expected: no output (common should not be in the food labels map)
```