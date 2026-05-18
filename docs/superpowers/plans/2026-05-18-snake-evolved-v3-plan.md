# Snake Evolved v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 bugs, rebalance 5 gameplay systems, add 7 QoL features, improve mobile/accessibility with 5 changes, and clean up 6 code architecture areas in a single-file Snake game (~2564 lines, snake.html)

**Architecture:** Single-file HTML/JS/CSS. All edits are to `/Users/jeko/tmp/snakes/snake.html`. Canvas-based rendering with dual loops (setInterval for game logic, requestAnimationFrame for visuals). localStorage for persistence.

**Tech Stack:** Vanilla HTML5 + Canvas + Web Audio API + localStorage

---

## Task Breakdown

### Task 1: Fix Bug 1 — Streak Day-Boundary

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Fix `Math.round(diffMs / 86400000)` rounding ~2hr across-midnight gap to 0 instead of 1.

**Current code (around line 562):**
```js
const diffMs = Date.now() - storedDateObj.getTime();
const diffDays = Math.round(diffMs / 86400000);
```

- [ ] **Step 1: Replace `Math.round` with `Math.floor`**

Change the diffDays calculation at line ~562 from:
```js
const diffDays = Math.round(diffMs / 86400000);
```
to:
```js
const diffDays = Math.floor(diffMs / 86400000);
```

- [ ] **Step 2: Verify the fix**

Check that:
- Same-day play: diffMs < 86400000 → `Math.floor(0.xxx)` = 0 → no streak change ✓
- Next-day play (~20 hours later): diffMs ~72000000 → `Math.floor(0.83)` = 0 → bug persists!

This means `Math.floor` also fails for ~20-hour gaps. Use date string comparison instead:

```js
const storedDate = localStorage.getItem('snake_daily_date') || '';
const today = new Date();
const todayStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
let streak = parseInt(localStorage.getItem('snake_streak_count')) || 0;
if (storedDate) {
  const storedDateStr = storedDate; // already in YYYY-M-D format
  if (storedDateStr !== todayStr) {
    // Different calendar day — check if consecutive
    const storedDateObj = new Date(storedDate);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.getFullYear() + '-' + (yesterday.getMonth()+1) + '-' + yesterday.getDate();
    if (storedDateStr === yesterdayStr) {
      localStorage.setItem('snake_streak_count', String(streak + 1));
    } else {
      // Gap > 1 day
      localStorage.setItem('snake_streak_count', '0');
    }
  }
  // same day: no change
} else {
  localStorage.setItem('snake_streak_count', '1');
}
```

- [ ] **Step 3: Verify the approach**

The date string comparison compares calendar dates, not timestamps. This correctly handles:
- Play at 11:30 PM, play again at 12:30 AM → different date strings → consecutive day check → streak increments ✓
- Play Monday, skip Tuesday, play Wednesday → Monday vs Wednesday → gap > 1 → streak resets ✓
- Play twice on same day at different times → identical date strings → no change ✓

---

### Task 2: Fix Bug 2 — Prestige Load Crash

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Add try/catch around localStorage access for prestigeLevel at line 121.

- [ ] **Step 1: Wrap prestigeLevel load in try/catch**

Change line ~121 from:
```js
let prestigeLevel = parseInt(localStorage.getItem('snake_prestige')) || 0;
```
to:
```js
let prestigeLevel;
try { prestigeLevel = parseInt(localStorage.getItem('snake_prestige')) || 0; } catch(e) { prestigeLevel = 0; }
```

---

### Task 3: Fix Bug 3 — Visibility Auto-Resume

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** When tab regains focus, auto-resume the game if it was auto-paused. Extract `resumeGame()` helper.

- [ ] **Step 1: Extract `resumeGame()` from keydown handler**

Current resume code in keydown handler (lines ~2393-2407):
```js
} else if (gameState === 'paused') {
    gameState = 'playing';
    if (sessionPauseStart) {
        const pauseDuration = Date.now() - sessionPauseStart;
        sessionPausedTime += pauseDuration;
        if (gameMode === 'timeAttack') {
            timeAttackEnd += pauseDuration;
        }
        sessionPauseStart = 0;
    }
    tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed();
    gameInterval = setInterval(updateGame, tickInterval);
    playSound('resume');
    drawGame(1);
    visualDirty = true;
}
```

Extract into a function right before `gameOver()`:
```js
function resumeGame() {
    gameState = 'playing';
    if (sessionPauseStart) {
        const pauseDuration = Date.now() - sessionPauseStart;
        sessionPausedTime += pauseDuration;
        if (gameMode === 'timeAttack') {
            timeAttackEnd += pauseDuration;
        }
        sessionPauseStart = 0;
    }
    tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed();
    gameInterval = setInterval(updateGame, tickInterval);
    playSound('resume');
    drawGame(1);
    visualDirty = true;
}
```

- [ ] **Step 2: Replace inline resume code with call to `resumeGame()`**

In the keydown handler, replace the `else if (gameState === 'paused')` block body with just `resumeGame();`.

- [ ] **Step 3: Add auto-resume on tab focus**

In the visibility change handler (lines ~2543-2553), add auto-resume:

```js
document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'playing') {
        sessionPauseStart = Date.now();
        gameState = 'paused';
        clearInterval(gameInterval);
        gameInterval = null;
        playSound('pause');
        drawGame(1);
        visualDirty = true;
    } else if (!document.hidden && gameState === 'paused') {
        // Only auto-resume if the game was auto-paused (sessionPauseStart > 0)
        // If user manually paused, sessionPauseStart will be 0 (set on manual pause)
        // Actually: both manual and auto-pause set sessionPauseStart. 
        // Track auto-pause specifically with a flag.
    }
});
```

Wait — need a way to distinguish auto-pause from manual-pause. Add a flag:

- [ ] **Step 3a: Add `autoPaused` flag**

Add after other game state variables (~line 90):
```js
let autoPaused = false;
```

- [ ] **Step 3b: Set `autoPaused = true` in visibility pause handler**

In the `document.hidden` branch:
```js
if (document.hidden && gameState === 'playing') {
    autoPaused = true;
    sessionPauseStart = Date.now();
    // ... rest of pause
}
```

- [ ] **Step 3c: Set `autoPaused = false` in manual pause**

In the keydown handler's manual pause branch (key 'p' or ' '):
```js
if (gameState === 'playing') {
    autoPaused = false;
    gameState = 'paused';
    // ... rest of pause
}
```

- [ ] **Step 3d: Add auto-resume to visibility handler**

The `!document.hidden` branch:
```js
} else if (!document.hidden && gameState === 'paused' && autoPaused) {
    autoPaused = false;
    resumeGame();
}
```

This ensures:
- User manually pauses, tab is hidden, tab returns → game stays paused ✓
- Game auto-paused by tab hide, tab returns → game auto-resumes ✓
- User manually pauses (no tab hide) → game stays paused until P/Space ✓

---

### Task 4: Fix Bug 4 — PowerUp Spawns on Rival

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Add rival snake tile check in `spawnPowerUpPickup()`.

- [ ] **Step 1: Add rival check to the spawn loop**

In `spawnPowerUpPickup()` (lines ~415-424), add rival check in the continue conditions:

```js
if (snake.some(s => s.x === x && s.y === y)) continue;
if (obstacles.some(o => o.x === x && o.y === y)) continue;
if (food && food.x === x && food.y === y) continue;
if (rivalActive && rivalSnake.some(s => s.x === x && s.y === y)) continue;
```

---

### Task 5: Fix Bug 5 — Rival Eats Last Food Game Over

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** When rival eats food and board is full (generateFood returns null), don't call gameOver().

- [ ] **Step 1: Replace `gameOver()` with graceful handling**

In the rival eat block (line ~827), change:
```js
food = generateFood(combinedSnake);
if (!food) { gameOver(); return; }
```
to:
```js
food = generateFood(combinedSnake);
if (!food) {
    // Board full — no food available. Keep food null, food will appear when space opens.
    // Don't call gameOver — the player didn't die.
}
```

The game's existing `generateFood()` guard at line 387 already checks `currentSnake.length + obstacles.length + rivalLength >= totalTiles`. When board is full, it returns null. Setting `food = null` means no food on the board. Next tick, `generateFood()` is called again. If a space has opened (snake or rival moved), food appears. If still full, stays null.

---

### Task 6: Fix Bug 6 — Food/Obstacle Generation Order

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Swap order so obstacles generate before food in resetGame().

- [ ] **Step 1: Swap lines 511-512**

Change:
```js
food = generateFood(snake);
generateObstacles();
```
to:
```js
generateObstacles();
food = generateFood(snake);
```

---

### Task 7: Rebalance — Epic Food Buff

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Epic food: 50pts (was 30), 70XP (was 55), glow 14 (was 8).

- [ ] **Step 1: Update FOOD_TIERS.epic properties**

In FOOD_TIERS (line ~317), change:
```js
epic: { pts: 30, xp: 55, weight: 0.03, color: '#AA44FF', pCount: 18, sound: 'bonus', glow: 8 },
```
to:
```js
epic: { pts: 50, xp: 70, weight: 0.03, color: '#AA44FF', pCount: 18, sound: 'bonus', glow: 14 },
```

---

### Task 8: Rebalance — Zen Mode XP

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Enable XP at 10 per food eaten in Zen mode (no combo multiplier).

- [ ] **Step 1: Change Zen earnXP to enable XP but change award mechanism**

Change `MODE_CONFIG.zen.earnXP` from `false` to `true`.

- [ ] **Step 2: Make Zen food XP a flat 10 per eat (skip combo multiplier)**

In the eat block (around line ~1832-1834), wrap combo multiplier logic:
```js
// XP award for eating
const tier = FOOD_TIERS[eatenType] || FOOD_TIERS.common;
let foodXP = tier.xp;
if (gameMode === 'zen') {
    foodXP = 10; // Flat XP in Zen mode
} else {
    const comboMul = 1 + comboCount * 0.5;
    foodXP = Math.round(foodXP * comboMul);
}
awardXP(foodXP);
```

---

### Task 9: Rebalance — Shield Nerf

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Shield duration 6s (was 8s), use POWERUP_TYPES config consistently.

- [ ] **Step 1: Update POWERUP_TYPES.shield.duration**

Change line ~323:
```js
shield: { name: 'Shield', color: '#4488FF', shape: 'circle', duration: 0 },
```
to:
```js
shield: { name: 'Shield', color: '#4488FF', shape: 'circle', duration: 6000 },
```

- [ ] **Step 2: Fix hardcoded shield timer at line 437**

Change:
```js
powerUpTimer = 8000;
```
to:
```js
powerUpTimer = POWERUP_TYPES.shield.duration;
```

- [ ] **Step 3: Fix hardcoded shield timer override at line 1691**

Change:
```js
const timerDuration = powerUpType === 'shield' ? 8000 : POWERUP_TYPES[powerUpType].duration;
```
to:
```js
const timerDuration = POWERUP_TYPES[powerUpType].duration;
```

---

### Task 10: Rebalance — Snap Mode Curve

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Decay 12% per 12s (was 20% per 10s), floor at 800ms.

- [ ] **Step 1: Update decay percentage and interval**

In the snap level-up block (line ~1902-1903), change:
```js
snapTimeSinceDecrease += MODE_CONFIG.snap.speed;
if (snapTimeSinceDecrease >= 10000) {
    snapDuration = Math.floor(snapDuration * 0.8);
    snapTimeSinceDecrease -= 10000;
```
to:
```js
snapTimeSinceDecrease += MODE_CONFIG.snap.speed;
if (snapTimeSinceDecrease >= 12000) {
    snapDuration = Math.floor(snapDuration * 0.88);
    snapTimeSinceDecrease -= 12000;
```

- [ ] **Step 2: Add floor check**

After the snapDuration update (and before `snapLevel++`), add:
```js
if (snapDuration < 800) snapDuration = 800;
```

---

### Task 11: Rebalance — Combo Score Bonus

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Add `score += Math.floor(comboCount * 2)` on combo eats.

- [ ] **Step 1: Add score bonus in the eat block**

After line ~1843 (`if (gameMode !== 'zen') score += tier.pts;`), add:
```js
// Combo score bonus
if (comboCount > 0 && gameMode !== 'zen') {
    score += Math.floor(comboCount * 2);
}
```

---

### Task 12: Architecture — drawTrails Data-Driven Refactor

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Replace 6 near-identical if-blocks with a single config-driven loop.

- [ ] **Step 1: Add TRAIL_RENDER_CONFIG object**

Add near the top of the script (near other config objects like FOOD_TIERS):
```js
const TRAIL_RENDER_CONFIG = {
  trace_ghost:   { alphaStart:0.15, alphaDecay:0.05, color: (idx, skin) => skin.head==='rainbow' ? '#00FF00' : skin.head },
  trace_fire:    { alphaStart:0.30, alphaDecay:0.10, color: (idx) => ['#FF6600','#CC3300','#880000'][idx] },
  trace_neon:    { alphaStart:0.25, alphaDecay:0.08, color: () => '#00FFFF' },
  trace_rainbow: { alphaStart:0.25, alphaDecay:0.08, color: (idx) => 'hsl('+((idx*20)+Date.now()*0.05)%360+',100%,50%)' },
  trace_galaxy:  { alphaStart:0.20, alphaDecay:0.06, color: (idx) => 'hsl('+(Date.now()*0.03+idx*30)%360+',80%,60%)' },
  trace_streak_3: { alphaStart:0.25, alphaDecay:0.08, color: () => '#FF6B35' },
};
```

- [ ] **Step 2: Replace drawTrails() body with data-driven loop**

Replace the entire `drawTrails()` function (lines ~1562-1626) with:
```js
function drawTrails() {
    const config = TRAIL_RENDER_CONFIG[cosmetics.trace];
    if (!config) return;
    if (snake.length < 4) return;
    const skin = SNAKE_SKINS[cosmetics.snake] || SNAKE_SKINS.snake_green;
    for (let t = 0; t < 3; t++) {
        const idx = snake.length - 1 - t;
        if (idx < 0) break;
        const seg = snake[idx];
        ctx.globalAlpha = config.alphaStart - t * config.alphaDecay;
        ctx.fillStyle = config.color(idx, skin);
        ctx.fillRect(seg.x, seg.y, TILE_SIZE - 1, TILE_SIZE - 1);
    }
    ctx.globalAlpha = 1;
}
```

---

### Task 13: Architecture — wrapPosition Consistency

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Replace inline wrapping math with calls to wrapPosition() at 4 locations.

- [ ] **Step 1: Fix rival test position (lines ~763-766)**

Change:
```js
const wrappedTest = {
    x: ((testPos.x % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH,
    y: ((testPos.y % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT,
};
```
to:
```js
const wrappedTest = wrapPosition(testPos);
```

- [ ] **Step 2: Fix rival escape position (lines ~775-778)**

Change:
```js
const tp = {
    x: ((head.x + dir.dx) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH,
    y: ((head.y + dir.dy) % CANVAS_HEIGHT + CANVAS_HEIGHT) % CANVAS_HEIGHT,
};
```
to:
```js
const tp = wrapPosition({ x: head.x + dir.dx, y: head.y + dir.dy });
```

- [ ] **Step 3: Fix rival new head (lines ~797-800)**

Change:
```js
const rNewHead = {
    x: ((head.x + rivalDx) % CANVAS_WIDTH + CANVAS_WIDTH) % CANVAS_WIDTH,
    y: ((head.y + rivalDy) % CANVAS_HEIGHT + CANVAS_HEIGHT) % CANVAS_HEIGHT,
};
```
to:
```js
const rNewHead = wrapPosition({ x: head.x + rivalDx, y: head.y + rivalDy });
```

- [ ] **Step 4: Fix magnet pull (lines ~1934-1935)**

Change:
```js
const wrappedFX = ((newFX % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH;
const wrappedFY = ((newFY % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT;
```
to:
```js
const wrappedPos = wrapPosition({ x: newFX, y: newFY });
const wrappedFX = wrappedPos.x;
const wrappedFY = wrappedPos.y;
```

---

### Task 14: Architecture — finalizeSession Extraction

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Extract shared bookkeeping from gameOver() and endZenSession().

- [ ] **Step 1: Add finalizeSession() function**

Add before gameOver():
```js
function finalizeSession() {
    sessionTimeAlive = Date.now() - sessionStartTime - sessionPausedTime;
    stats.gamesPlayed++;
    stats.totalScore += score;
    stats.totalDeaths++;
    stats.totalTimePlayed += sessionTimeAlive;
    if (score > stats.maxScore) stats.maxScore = score;
    if (sessionTimeAlive > stats.longestTimeAlive) stats.longestTimeAlive = sessionTimeAlive;
    if (snake.length > stats.longestLength) stats.longestLength = snake.length;
    saveAllState();
    if (score > (modeHighScores[gameMode] || 0)) {
        modeHighScores[gameMode] = score;
        try { localStorage.setItem('snake_mode_highs', JSON.stringify(modeHighScores)); } catch(e) {}
    }
    drawGame(1);
    visualDirty = true;
}
```

- [ ] **Step 2: Update gameOver() to use finalizeSession()**

Remove from gameOver():
```js
sessionTimeAlive = Date.now() - sessionStartTime - sessionPausedTime;
stats.gamesPlayed++;
stats.totalScore += score;
stats.totalDeaths++;
stats.totalTimePlayed += sessionTimeAlive;
if (score > stats.maxScore) stats.maxScore = score;
if (sessionTimeAlive > stats.longestTimeAlive) stats.longestTimeAlive = sessionTimeAlive;
saveAllState();
```
```js
if (score > (modeHighScores[gameMode] || 0)) {
    modeHighScores[gameMode] = score;
    try { localStorage.setItem('snake_mode_highs', JSON.stringify(modeHighScores)); } catch(e) {}
}
```
```js
drawGame(1);
visualDirty = true;
```

Replace with a single call: `finalizeSession();`

Leave in gameOver() only: rival cleanup, awardXP(snake.length*10), checkAchievements, checkDailyCompletion, death particles, sound, shake.

- [ ] **Step 3: Update endZenSession() to use finalizeSession()**

Remove same bookkeeping lines from endZenSession() and replace with `finalizeSession();`

---

### Task 15: Architecture — restartGameInterval Helper

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Extract duplicate interval restart pattern.

- [ ] **Step 1: Add restartGameInterval() helper**

```js
function restartGameInterval(speed) {
    clearInterval(gameInterval);
    gameInterval = setInterval(updateGame, speed || tickInterval);
}
```

- [ ] **Step 2: Replace at all 6 call sites**

Find all occurrences of:
```js
clearInterval(gameInterval);
gameInterval = setInterval(updateGame, tickInterval);
```
and replace with:
```js
restartGameInterval(tickInterval);
```

The 6 locations are:
1. Line ~447 (activatePowerUp slow-mo)
2. Line ~463 (deactivatePowerUp slow-mo restore)
3. Line ~1858 (speed food boost)
4. Line ~1864 (speed food boost restore)
5. Line ~1875 (non-speed food speed reset)
6. Line ~2404 (pause resume)

---

### Task 16: Architecture — PowerUp Pickup Naming

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Rename `powerUp` → `powerUpPickup` and `drawPowerUp` → `drawPowerUpPickup`.

- [ ] **Step 1: Rename variable declaration**

Change line ~138:
```js
let powerUp = null;
```
to:
```js
let powerUpPickup = null;
```

- [ ] **Step 2: Rename all references (~12)**

Search and replace `powerUp` → `powerUpPickup` BUT NOT `powerUpType`, `powerUpTimer`, `powerUpSpawnCounter`, `POWERUP_TYPES`, `activatePowerUp`, `deactivatePowerUp`, `spawnPowerUpPickup`. The standalone `powerUp` variable references are:
- Line 412: `if (powerUp) return;`
- Line 422: `powerUp = { x, y, type };`
- Line 495: `powerUp = null;`
- Line 880: `if (powerUp && wrappedHead.x === powerUp.x && wrappedHead.y === powerUp.y)`
- Line 1343: `function drawPowerUp() {`
- Line 1344: `if (!powerUp) return;`
- Line 1945: `if (gameMode !== 'zen' && !powerUp && !powerUpType)`

- [ ] **Step 3: Rename function declaration + call**

Change function declaration (line ~1343):
```js
function drawPowerUp() {
```
to:
```js
function drawPowerUpPickup() {
```

Change call site in drawGame() (line ~1649):
```js
drawPowerUp();
```
to:
```js
drawPowerUpPickup();
```

---

### Task 17: Architecture — Eye Drawing Dedup

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Extract duplicate eye-drawing code into shared function.

- [ ] **Step 1: Extract `drawEyes()` function**

```js
function drawEyes(drawX, drawY, dx, dy, scleraColor, pupilColor) {
    let ex1, ey1, ex2, ey2;
    if (dx > 0) {
        ex1 = drawX + 12; ey1 = drawY + 4;
        ex2 = drawX + 12; ey2 = drawY + 12;
    } else if (dx < 0) {
        ex1 = drawX + 4; ey1 = drawY + 4;
        ex2 = drawX + 4; ey2 = drawY + 12;
    } else if (dy < 0) {
        ex1 = drawX + 4; ey1 = drawY + 4;
        ex2 = drawX + 12; ey2 = drawY + 4;
    } else {
        ex1 = drawX + 4; ey1 = drawY + 12;
        ex2 = drawX + 12; ey2 = drawY + 12;
    }
    ctx.fillStyle = scleraColor;
    ctx.beginPath(); ctx.arc(ex1, ey1, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = pupilColor;
    ctx.beginPath(); ctx.arc(ex1, ey1, 2, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 2, 0, 2 * Math.PI); ctx.fill();
}
```

- [ ] **Step 2: Replace in drawSnake() (lines ~1450-1471)**

Replace:
```js
if (index === 0) {
    let ex1, ey1, ex2, ey2;
    if (dx > 0) {
        ex1 = drawX + 12; ey1 = drawY + 4;
        ex2 = drawX + 12; ey2 = drawY + 12;
    } else if (dx < 0) {
        ex1 = drawX + 4; ey1 = drawY + 4;
        ex2 = drawX + 4; ey2 = drawY + 12;
    } else if (dy < 0) {
        ex1 = drawX + 4; ey1 = drawY + 4;
        ex2 = drawX + 12; ey2 = drawY + 4;
    } else {
        ex1 = drawX + 4; ey1 = drawY + 12;
        ex2 = drawX + 12; ey2 = drawY + 12;
    }
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(ex1, ey1, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath(); ctx.arc(ex1, ey1, 2, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(ex2, ey2, 2, 0, 2 * Math.PI); ctx.fill();
}
```
with:
```js
if (index === 0) {
    drawEyes(drawX, drawY, dx, dy, 'white', 'black');
}
```

- [ ] **Step 3: Replace in drawRival() (lines ~1537-1558)**

Replace the eye-drawing block with:
```js
if (index === 0) {
    drawEyes(drawX, drawY, rivalDx, rivalDy, '#FFD700', '#000');
}
```

---

### Task 18: Architecture — comboFadeTimer Optimization

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Move comboFadeTimer clearTimeout from animateVisuals() to updateGame().

- [ ] **Step 1: Remove comboFadeTimer handling from animateVisuals() (lines ~1082-1088)**

Remove:
```js
const comboEl = document.getElementById('comboDisplay');
if (comboEl) {
    const mul = 1 + comboCount * 0.5;
    comboEl.textContent = comboCount > 0 ? 'x' + mul.toFixed(1) + ' COMBO!' : '';
    if (comboCount > 0) {
        clearTimeout(comboFadeTimer);
        comboFadeTimer = setTimeout(function() {
            document.getElementById('comboDisplay').textContent = '';
        }, 3500);
    }
}
```
from animateVisuals().

Keep only the combo count display logic. Remove the setTimeout/clearTimeout part.

Actually: keep the display logic in animateVisuals() since comboFadeTimer is separate. Just remove the clearTimeout calls and the comboFadeTimer setTimeout logic from here.

Better approach: move the timeout management to updateGame() where comboCount changes:

In the eat block of updateGame() (after `comboCount = Math.min(5, comboCount + 1);` or `comboCount = 0;`), add:
```js
clearTimeout(comboFadeTimer);
comboFadeTimer = setTimeout(function() {
    document.getElementById('comboDisplay').textContent = '';
}, 3500);
```

In animateVisuals(), keep only the display update:
```js
const comboEl = document.getElementById('comboDisplay');
if (comboEl) {
    const mul = 1 + comboCount * 0.5;
    comboEl.textContent = comboCount > 0 ? 'x' + mul.toFixed(1) + ' COMBO!' : '';
}
```

---

### Task 19: Mobile — Viewport Meta Tag

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Add viewport meta tag for mobile rendering.

- [ ] **Step 1: Add viewport meta tag in `<head>`**

After line ~4 (`<meta charset="UTF-8">`), add:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
```

Note: `maximum-scale=5.0` instead of `user-scalable=no` to avoid WCAG 2.1 SC 1.4.4 violation.

---

### Task 20: Mobile — Haptic Feedback

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Add navigator.vibrate() calls with throttling.

- [ ] **Step 1: Add haptic throttle timestamp variable**

Add after game state variables (~line 90):
```js
let lastVibrateTime = 0;
```

- [ ] **Step 2: Add vibrate helper function**

```js
function vibrate(duration) {
    if (navigator.vibrate) {
        const now = Date.now();
        if (now - lastVibrateTime >= 300) {
            lastVibrateTime = now;
            navigator.vibrate(duration);
        }
    }
}
```

- [ ] **Step 3: Add vibrate calls**

In the eat block (where `playSound(tier.sound)` is called): add `vibrate(15);`
In the gameOver() function: add `vibrate(30);`
In activatePowerUp(): add `vibrate(20);`

---

### Task 21: Accessibility — Verify Distinct Food Shapes

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Ensure every food type has a distinct shape in drawFood().

Current shapes (lines ~1244-1320):
- common: filled circle ✓
- uncommon: diamond ✓
- rare: up-triangle ✓
- epic: hexagon ✓
- bonus: pulsing circle ✓
- speed: double chevron >> ✓

All 6 types already have distinct shapes. No changes needed for this task — verified.

---

### Task 22: Accessibility — Food Labels Text Outline

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Replace dark circle background with text outline.

- [ ] **Step 1: Update label rendering in drawFood()**

Replace (lines ~1327-1340):
```js
const labels = { uncommon: 'U', rare: 'R', epic: 'E', bonus: 'B', speed: 'S' };
if (labels[food.type]) {
    ctx.save();
    // Dark semicircle behind letter
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
    ctx.fill();
    // White letter
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[food.type], cx, cy);
    ctx.restore();
}
```
with:
```js
const labels = { uncommon: 'U', rare: 'R', epic: 'E', bonus: 'B' };
if (labels[food.type]) {
    ctx.save();
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeText(labels[food.type], cx, cy);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(labels[food.type], cx, cy);
    ctx.restore();
}
```

Note: Removed 'S' from labels (speed chevrons are already distinctive). Bonus gets a 'B' label to help distinguish it from common at small sizes.

---

### Task 23: Accessibility — Snap Timer Text Supplement

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Add text to supplement the color-only ring timer.

- [ ] **Step 1: Add text to snap mode HUD**

In the drawSnake() snap mode section (lines ~1475-1491), after the ring rendering, add:
```js
// Text label for accessibility
ctx.fillStyle = ringColor;
ctx.font = 'bold 9px Arial';
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.fillText('SNAP ' + Math.round(fraction * 100) + '%', cx, cy + radius + 3);
```

---

### Task 24: QoL — Quick Restart

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** ENTER on gameover immediately restarts, ESC goes to menu.

- [ ] **Step 1: Change gameover ENTER handler**

In keydown handler (line ~2336), change:
```js
if (gameState === 'gameover') {
    gameState = 'idle';
    drawGame(1);
    visualDirty = true;
    return;
}
```
to:
```js
if (gameState === 'gameover') {
    resetGame();
    startGame();
    return;
}
```

- [ ] **Step 2: Add ESC to go to idle from gameover**

In the ESC handler (line ~2423), ensure gameover goes to idle. The current ESC handler calls `closeAllPanels()`. Add before or after:
```js
if (e.key === 'Escape') {
    if (gameState === 'gameover') {
        gameState = 'idle';
        drawGame(1);
        visualDirty = true;
        return;
    }
    closeAllPanels();
    return;
}
```

---

### Task 25: QoL — In-Game Keyboard Reference (H key)

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Press H to show a 2-second keyboard shortcut overlay.

- [ ] **Step 1: Add H key handler BEFORE the `gameState !== 'playing'` guard**

Add after the ESC handler and before `if (gameState !== 'playing') return;` (line ~2441):
```js
if (e.key === 'h' || e.key === 'H') {
    // Show keyboard reference overlay for 2 seconds via toast
    const ref = 'Arrows/WASD=Move P=Space=Pause M=Mute H=Help Tab=Stats F=Achiev C=Cosm Esc=Back';
    const toastEl = document.getElementById('toast');
    if (toastEl) {
        toastEl.textContent = ref;
        toastEl.style.display = 'block';
        setTimeout(function() {
            if (toastEl && toastEl.textContent === ref) {
                toastEl.style.display = 'none';
            }
        }, 4000);
    }
    return;
}
```

---

### Task 26: QoL — Food Type Legend (L key)

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Press L on idle menu to show food type reference.

- [ ] **Step 1: Add L key handler in idle state**

In the keydown handler, after mode selection and before the playing guard, add:
```js
if (e.key === 'l' || e.key === 'L') {
    if (gameState === 'idle') {
        showFoodLegend();
    }
    return;
}
```

- [ ] **Step 2: Implement showFoodLegend()**

Create function that populates the toast area (or a panel) with food info:
```js
function showFoodLegend() {
    const el = document.getElementById('toast');
    if (!el) return;
    let text = '🍎 Common=10pts Epic=50pts Bonus=30pts ';
    text += 'Rare=20pts Uncommon=15pts Speed=5pts(tempo!)';
    el.textContent = text;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 5000);
}
```

---

### Task 27: QoL — Mute Visual Indicator

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Show mute icon in canvas when muted.

- [ ] **Step 1: Add mute indicator to drawGame()**

In drawGame() function (line ~1628), add near the beginning (after drawGrid but before overlays):
```js
// Mute indicator
if (muted) {
    ctx.fillStyle = '#888';
    ctx.font = '16px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('🔇', CANVAS_WIDTH - 8, 8);
}
```

---

### Task 28: QoL — Mute Toggle Feedback

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Toast on mute toggle.

- [ ] **Step 1: Add queueToast call in M key handler**

In the M key handler (line ~2412), add:
```js
if (e.key === 'm' || e.key === 'M') {
    muted = muted ? 0 : 1;
    try { localStorage.setItem('snake_muted', muted); } catch(e) {}
    queueToast(muted ? '🔇 Muted' : '🔊 Sound On', 1500);
    return;
}
```

---

### Task 29: QoL — XP Progress Bar

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Replace text-only XP display with canvas-rendered progress bar.

- [ ] **Step 1: Calculate XP-to-next-level and render on canvas**

In drawGame() (after the mute indicator section), add:
```js
// XP progress bar
if (level < 20) { // Level 20 is max for prestige
    const xpForThisLevel = 100 * level * (level + 1) / 2;
    const xpForPrevLevel = level > 1 ? 100 * (level - 1) * level / 2 : 0;
    const xpInLevel = xp - xpForPrevLevel;
    const xpNeeded = xpForThisLevel - xpForPrevLevel;
    const progress = xpInLevel / xpNeeded;
    
    const barX = 5;
    const barY = CANVAS_HEIGHT - 22;
    const barWidth = 120;
    const barHeight = 12;
    
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);
    
    ctx.fillStyle = 'rgba(255,215,0,0.3)';
    ctx.fillRect(barX, barY, barWidth * Math.min(progress, 1), barHeight);
    
    ctx.strokeStyle = 'rgba(255,215,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Lv.' + level + ' ' + xpInLevel + '/' + xpNeeded, barX + barWidth/2, barY + barHeight/2);
}
```

- [ ] **Step 2: Update or remove the old DOM XP display**

The existing `#xpDisplay` DOM element (line 63) is updated in animateVisuals() at line ~1091:
```js
const xpEl = document.getElementById('xpDisplay');
if (xpEl) {
    xpEl.textContent = 'Lv.' + level + ' | XP: ' + xp.toLocaleString();
}
```

Either remove this DOM update or change it to be minimal (e.g., hide it since canvas now shows this info). Changing the DOM element to `style.display = 'none'` is safest.

---

### Task 30: QoL — Daily Challenge HUD

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Show daily challenge with progress during gameplay.

- [ ] **Step 1: Add progressKey to DAILY_CHALLENGES**

Update each challenge entry (lines ~330-341) to include a `progressKey` and `progressTarget`:
```js
{ desc:'Score 200+ points', check:function(s,st){return s>=200;}, reward:200, progressKey:'score', progressTarget:200 },
{ desc:'Score 300+ points', check:function(s,st){return s>=300;}, reward:300, progressKey:'score', progressTarget:300 },
{ desc:'Eat 5 speed foods', check:function(s,st){return st.sessionSpeedFood>=5;}, reward:150, progressKey:'speed', progressTarget:5 },
{ desc:'Eat 10 bonus foods', check:function(s,st){return st.sessionBonusFood>=10;}, reward:200, progressKey:'bonus', progressTarget:10 },
{ desc:'Reach 3x combo', check:function(s,st){return st.sessionMaxCombo>=3;}, reward:150, progressKey:'combo', progressTarget:3 },
{ desc:'Reach 5x combo', check:function(s,st){return st.sessionMaxCombo>=5;}, reward:300, progressKey:'combo', progressTarget:5 },
{ desc:'Survive 2 minutes', check:function(s,st){return st.sessionTimeAlive>=120000;}, reward:200, progressKey:'time', progressTarget:120000 },
{ desc:'Eat 20 foods total', check:function(s,st){return st.sessionFoodEaten>=20;}, reward:250, progressKey:'food', progressTarget:20 },
{ desc:'Reach snake length 15', check:function(s,st){return st.snakeLength>=15;}, reward:200, progressKey:'length', progressTarget:15 },
{ desc:'Eat 4+ different food types', check:function(s,st){return st.sessionFoodTypes.size>=4;}, reward:250, progressKey:'types', progressTarget:4 },
```

- [ ] **Step 2: Add helper function to get current progress**

```js
function getDailyProgress(challenge) {
    switch (challenge.progressKey) {
        case 'score': return score;
        case 'speed': return sessionSpeedFood;
        case 'bonus': return sessionBonusFood;
        case 'combo': return sessionMaxCombo;
        case 'time': return Math.min(sessionTimeAlive, challenge.progressTarget);
        case 'food': return sessionFoodEaten;
        case 'length': return snake.length;
        case 'types': return sessionFoodTypes.size;
        default: return 0;
    }
}
```

- [ ] **Step 3: Render daily HUD in drawGame()**

In drawGame(), add after the time-attack timer block (around line ~1667):
```js
// Daily challenge HUD
if (gameMode === 'daily' && gameState === 'playing') {
    const seed = getDailySeed();
    const challenge = DAILY_CHALLENGES[seed % DAILY_CHALLENGES.length];
    const progress = getDailyProgress(challenge);
    ctx.fillStyle = '#FFD700';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('🎯 ' + challenge.desc, CANVAS_WIDTH / 2, 2);
    if (challenge.progressTarget) {
        const fraction = Math.min(progress / challenge.progressTarget, 1);
        ctx.fillStyle = fraction >= 1 ? '#4CAF50' : '#AAA';
        ctx.font = '10px Arial';
        ctx.fillText('Progress: ' + Math.min(progress, challenge.progressTarget) + '/' + challenge.progressTarget, CANVAS_WIDTH / 2, 18);
    }
}
```

---

### Task 31: Final Review — Verify All Changes

**File:** `/Users/jeko/tmp/snakes/snake.html`

**Goal:** Sanity check that all changes work together, no regressions.

- [ ] **Step 1: Open the game in a browser**

Open the file: `open /Users/jeko/tmp/snakes/snake.html`

- [ ] **Step 2: Manual test checklist**

- [ ] Game loads without errors (check console)
- [ ] Streak increments on consecutive daily play (test by changing system date)
- [ ] Prestige works (level 20+ in test account)
- [ ] Tab-away auto-pauses and tab-return auto-resumes
- [ ] Power-ups never appear on rival snakes
- [ ] Rival eating last food doesn't end the game
- [ ] Food appears on correct tiles (after obstacles)
- [ ] Epic food shows 50pts, 70XP, strong glow
- [ ] Zen mode gives XP per food
- [ ] Shield duration is 6s
- [ ] Snap mode is playable past 120s
- [ ] Combo shows score increase
- [ ] drawTrails renders all trail types correctly
- [ ] PowerUp naming doesn't break anything
- [ ] Eyes drawn correctly on both snakes
- [ ] Viewport meta present in source
- [ ] Haptic fires (Android only)
- [ ] Food labels have text outline, not dark circle
- [ ] Snap timer shows text percentage
- [ ] Quick restart works (Enter from gameover)
- [ ] H key shows keyboard reference
- [ ] Mute shows icon + toast feedback
- [ ] XP bar renders on canvas
- [ ] Daily HUD shows challenge + progress
