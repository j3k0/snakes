# Snake Next Level — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use agentic loop to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add meta-progression (XP, levels, achievements, stats, cosmetics) and game modes (Classic, Time Attack, Zen) to the Snake game.

**Architecture:** Single HTML file, all state in localStorage (extending existing patterns), DOM overlays for panels, canvas for game rendering.

**Tech Stack:** Vanilla JS, Canvas 2D, Web Audio API, localStorage

**File modified:** `snake.html` (single file, all features added inline)

---

## Current Code Overview

The file is ~500 lines. Key landmarks for hooks:

- **Line 43-66:** Globals section (`let snake, food, dx, dy, score, highScore, gameInterval, gameState, nextDirection, audioCtx, muted, particles, displayedScore`)
- **Line 70-72:** `getSpeed()`
- **Line 74-90:** `generateFood()`
- **Line 92-105:** `resetGame()`
- **Line 115-119:** `startGame()`
- **Line 121-126:** `checkCollision()`
- **Line 128-133:** `wrapPosition()`
- **Line 135-142:** `gameOver()`
- **Line 203-216:** `spawnParticles()`
- **Line 218-251:** `animateVisuals()`
- **Line 253-266:** `drawOverlay()`
- **Line 268-283:** `drawGrid()`
- **Line 285-300:** `drawFood()`
- **Line 302-330:** `drawSnake()`
- **Line 332-345:** `drawGame()`
- **Line 347-409:** `updateGame()`
- **Line 411-480:** `keydown` event listener
- **Line 482-490:** `visibilitychange` listener

---

## TASK 1: Stats Tracking + XP & Level System

### Overview
This is the foundation task. It adds lifetime stats, XP/level progression, combo mechanics, session tracking, and a stats panel.

### Step 1.1: Add new globals (after line 66)

Add these lines immediately after `let displayedScore = 0;` (line 66):

```js
// Progression system
let stats = loadStats();
let xp = parseInt(localStorage.getItem('snake_xp')) || 0;
let level = getLevelFromXP(xp);
let sessionXP = 0;
let gameTick = 0;
let comboCount = 0;
let lastEatTime = 0;
let sessionStartTime = 0;
let sessionFoodEaten = 0;
let sessionFoodTypes = new Set();
let sessionSpeedFood = 0;
let sessionBonusFood = 0;
let sessionTimeAlive = 0;
```

### Step 1.2: Add helper functions (after `getSpeed()`, around line 72)

Add these functions after `getSpeed()`:

```js
function getLevelFromXP(xp) {
  let n = 1, required = 0;
  while (true) {
    required = 100 * n * (n + 1) / 2;
    if (xp < required) return n;
    n++;
  }
}

function awardXP(amount) {
  if (gameMode === 'zen') return; // no XP in Zen
  xp += amount;
  sessionXP += amount;
  const newLevel = getLevelFromXP(xp);
  if (newLevel > level) {
    level = newLevel;
    localStorage.setItem('snake_level', level);
    showLevelUpToast(level);
    checkLevelUnlocks(level);
  }
  localStorage.setItem('snake_xp', xp);
}

function getDefaultStats() {
  return {
    gamesPlayed: 0, totalScore: 0, maxScore: 0, totalFoodEaten: 0,
    normalFoodEaten: 0, bonusFoodEaten: 0, speedFoodEaten: 0,
    longestLength: 0, longestTimeAlive: 0, totalTimePlayed: 0,
    totalDistance: 0, maxCombo: 0, totalDeaths: 0
  };
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem('snake_stats')) || getDefaultStats(); }
  catch(e) { return getDefaultStats(); }
}

function saveAllState() {
  localStorage.setItem('snake_stats', JSON.stringify(stats));
}

function showLevelUpToast(level) {
  const el = document.getElementById('toast');
  el.textContent = `⚡ LEVEL UP! Level ${level} ⚡`;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function showStatsPanel() {
  const el = document.getElementById('statsPanel');
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.innerHTML = `<h2 style="text-align:center;margin-top:0;">📊 STATS</h2>
    <table style="width:100%;">
      <tr><td>Games Played</td><td style="text-align:right;">${stats.gamesPlayed}</td></tr>
      <tr><td>Total Score</td><td style="text-align:right;">${stats.totalScore.toLocaleString()}</td></tr>
      <tr><td>Best Score</td><td style="text-align:right;">${stats.maxScore.toLocaleString()}</td></tr>
      <tr><td>Total Food Eaten</td><td style="text-align:right;">${stats.totalFoodEaten}</td></tr>
      <tr><td>Normal/Bonus/Speed</td><td style="text-align:right;">${stats.normalFoodEaten}/${stats.bonusFoodEaten}/${stats.speedFoodEaten}</td></tr>
      <tr><td>Longest Snake</td><td style="text-align:right;">${stats.longestLength}</td></tr>
      <tr><td>Longest Life</td><td style="text-align:right;">${Math.floor(stats.longestTimeAlive/1000)}s</td></tr>
      <tr><td>Total Time</td><td style="text-align:right;">${Math.floor(stats.totalTimePlayed/60000)}m</td></tr>
      <tr><td>Total Distance</td><td style="text-align:right;">${stats.totalDistance} tiles</td></tr>
      <tr><td>Best Combo</td><td style="text-align:right;">${stats.maxCombo}x</td></tr>
      <tr><td>Deaths</td><td style="text-align:right;">${stats.totalDeaths}</td></tr>
    </table>
    <p style="text-align:center;color:#888;margin-top:10px;">Press TAB or ESC to close</p>`;
  el.style.display = 'block';
}
```

**HOOK POINTS:**
- `getLevelFromXP()` — computes level from cumulative XP using formula `100 × n × (n + 1) / 2`
- `awardXP()` — adds XP, checks for level up, persists to localStorage, calls toast and unlock check
- `saveAllState()` — persists stats object
- `showStatsPanel()` — toggles `#statsPanel` overlay

### Step 1.3: Modify `resetGame()` (line 92-105)

Add session tracker resets at the top of `resetGame()` before existing code:

```js
function resetGame() {
  // Session tracker resets
  sessionXP = 0;
  comboCount = 0;
  lastEatTime = 0;
  sessionFoodEaten = 0;
  sessionFoodTypes = new Set();
  sessionSpeedFood = 0;
  sessionBonusFood = 0;
  gameTick = 0;
  sessionTimeAlive = 0;
  sessionStartTime = 0;

  snake = [{ x: 10 * TILE_SIZE, y: 10 * TILE_SIZE }];
  dx = TILE_SIZE;
  dy = 0;
  food = generateFood(snake);
  score = 0;
  displayedScore = 0;
  particles = [];
  gameState = 'idle';
  gameInterval = null;
  nextDirection = null;
  updateScoreDisplay();
  drawGame();
}
```

**HOOK POINT:** `resetGame()` clears all per-session trackers so each game starts fresh.

### Step 1.4: Modify `startGame()` (line 115-119)

Add session start time recording:

```js
function startGame() {
  gameState = 'playing';
  sessionStartTime = Date.now();
  gameInterval = setInterval(updateGame, getSpeed());
  drawGame();
}
```

**HOOK POINT:** `startGame()` sets `sessionStartTime` for survival time tracking.

### Step 1.5: Modify `updateGame()` (line 347-409)

Add tick counter and survival XP at the very top of `updateGame()`, before the `if (gameState !== 'playing')` check:

```js
function updateGame() {
  gameTick++;
  stats.totalDistance++;
  if (gameTick % 10 === 0) {
    awardXP(1);
  }

  if (gameState !== 'playing') return;
  // ... rest of existing updateGame logic
```

In the food eat block (around line 375-406), replace the existing score logic with the following (keeping the existing score assignments and interval changes, adding stat tracking and combo logic):

Replace lines 375-406 with:

```js
  if (wrappedHead.x === food.x && wrappedHead.y === food.y) {
    snake.push(tail);
    const eatenType = food.type;
    let particleColor = eatenType === 'bonus' ? '#FFD700' : eatenType === 'speed' ? '#00FFFF' : '#00FF00';
    spawnParticles(wrappedHead.x, wrappedHead.y, 12, particleColor);

    // Stat tracking
    sessionFoodTypes.add(eatenType);
    stats[`${eatenType}FoodEaten`]++;
    sessionFoodEaten++;
    stats.totalFoodEaten++;

    // Combo logic
    const now = Date.now();
    if (now - lastEatTime < 3000 && lastEatTime > 0) {
      comboCount = Math.min(5, comboCount + 1);
    } else {
      comboCount = 0;
    }
    lastEatTime = now;

    // Award food XP with combo multiplier
    let foodXP = { normal: 25, bonus: 60, speed: 40 }[eatenType];
    let comboMul = 1 + comboCount * 0.5;
    awardXP(Math.round(foodXP * comboMul));

    // Update max combo
    if (comboCount > stats.maxCombo) stats.maxCombo = comboCount;

    if (eatenType === 'bonus') {
      score += 30;
      playSound('bonus');
    } else if (eatenType === 'speed') {
      score += 5;
      playSound('speed');
      clearInterval(gameInterval);
      gameInterval = setInterval(updateGame, Math.max(MIN_SPEED, getSpeed() - 30));
      const ci = gameInterval;
      setTimeout(() => {
        if (gameInterval === ci && gameState === 'playing') {
          clearInterval(gameInterval);
          gameInterval = setInterval(updateGame, getSpeed());
        }
      }, 2000);
    } else {
      score += 10;
      playSound('eat');
    }
    updateScoreDisplay();
    food = generateFood(snake);
    if (!food) { gameOver(); return; }
    if (eatenType !== 'speed') {
      clearInterval(gameInterval);
      gameInterval = setInterval(updateGame, getSpeed());
    }
  }
```

**HOOK POINTS:**
- Top of `updateGame()` — survival XP tick every 10th call
- Food eat block — food type stats, combo calculation, XP award with combo multiplier, max combo tracking

### Step 1.6: Modify `gameOver()` (line 135-142)

Add stat aggregation at the top of `gameOver()`, before existing logic:

```js
function gameOver() {
  clearInterval(gameInterval);
  gameInterval = null;
  gameState = 'gameover';

  // Aggregate session stats into lifetime stats
  sessionTimeAlive = Date.now() - sessionStartTime;
  if (sessionTimeAlive > stats.longestTimeAlive) stats.longestTimeAlive = sessionTimeAlive;
  stats.totalTimePlayed += sessionTimeAlive;
  stats.gamesPlayed++;
  stats.totalDeaths++;
  stats.totalScore += score;
  if (score > stats.maxScore) stats.maxScore = score;
  if (snake.length > stats.longestLength) stats.longestLength = snake.length;
  awardXP(snake.length * 10); // end-of-game bonus
  saveAllState();

  spawnParticles(snake[0].x, snake[0].y, 30, '#FF4500');
  playSound('gameover');
  drawGame();
}
```

**HOOK POINT:** `gameOver()` merges all session stats into lifetime stats, awards end-of-game XP, and persists.

### Step 1.7: Add DOM overlays to HTML (in `<body>`)

Add after line 40 (`<p id="highScore">Best: 0</p>`):

```html
<div id="xpDisplay" style="color:#aaa;font-size:0.9em;"></div>
<div id="comboDisplay" style="color:#FFD700;font-size:1.2em;min-height:1.5em;"></div>
<div id="toast" style="position:fixed;top:20px;left:50%;transform:translateX(-50%);color:#FFD700;font-size:24px;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.8);display:none;z-index:1000;pointer-events:none;"></div>
<div id="statsPanel" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);border:2px solid #555;border-radius:10px;padding:20px;color:white;font-family:monospace;z-index:100;min-width:300px;"></div>
```

### Step 1.8: Modify keydown handler (line 411-480)

Add these cases at the top of the keydown handler, before the `if (e.key === 'Enter')` block (around line 416):

```js
document.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
    e.preventDefault();
  }

  // Tab toggles stats panel
  if (e.key === 'Tab') {
    e.preventDefault();
    showStatsPanel();
    return;
  }

  // Escape closes any panel
  if (e.key === 'Escape') {
    document.querySelectorAll('[id$=Panel]').forEach(p => p.style.display = 'none');
    return;
  }

  // ... rest of existing handler
```

### Step 1.9: Update combo display in `animateVisuals()` (line 218-251)

Add combo display update at the end of `animateVisuals()`, before `requestAnimationFrame(animateVisuals)`:

```js
  // Update combo display
  document.getElementById('comboDisplay').textContent = comboCount > 0 ? `x${comboCount} COMBO!` : '';

  requestAnimationFrame(animateVisuals);
```

### Step 1.10: Update XP/level display

Add XP display update in `drawGame()` or `animateVisuals()`. In `drawGame()` (around line 338), after drawing overlays, add:

```js
  // Update XP display
  document.getElementById('xpDisplay').textContent = `Lv.${level} | XP: ${xp.toLocaleString()}`;
```

**TESTING for TASK 1:**
- Open `snake.html` in browser
- Play a game, eat food
- Open DevTools → Application → Local Storage → check keys: `snake_stats`, `snake_xp`, `snake_level`
- Verify `snake_stats` contains gamesPlayed=1, totalFoodEaten incremented, totalDistance > 0
- Press Tab to toggle stats panel
- Press Escape to close it
- Eat food rapidly (within 3s) to see combo counter appear
- Die and check XP increased by `snake.length * 10`
- Verify level-up toast appears when crossing threshold (e.g., award 1000 XP manually in console: `awardXP(1000)`)

---

## TASK 2: Achievement System

### Overview
Adds 15 achievements with unlock conditions, XP rewards, toast notifications, and an achievements panel.

### Step 2.1: Add achievement definitions (after globals, around line 67)

Add after the progression globals from Task 1:

```js
const ACHIEVEMENTS = {
  FIRST_BITE: { name: 'First Bite', desc: 'Eat your first food', xp: 25, icon: '🍽️', check: s => s.totalFoodEaten >= 1 },
  CENTURY: { name: 'Century', desc: 'Score 100 in one game', xp: 100, icon: '💯', check: (s, ctx) => ctx.maxScore >= 100 },
  QUINTESSENCE: { name: 'Quintessence', desc: 'Score 500 in one game', xp: 300, icon: '🌟', check: (s, ctx) => ctx.maxScore >= 500 },
  MILLENNIUM: { name: 'Millennium', desc: 'Score 1,000 in one game', xp: 500, icon: '💎', check: (s, ctx) => ctx.maxScore >= 1000 },
  BONUS_FEAST: { name: 'Bonus Feast', desc: 'Eat 10 bonus foods total', xp: 100, icon: '🥇', check: s => s.bonusFoodEaten >= 10 },
  SPEED_DEMON: { name: 'Speed Demon', desc: 'Eat 10 speed foods total', xp: 100, icon: '⚡', check: s => s.speedFoodEaten >= 10 },
  GOURMAND: { name: 'Gourmand', desc: 'Eat 100 normal foods total', xp: 200, icon: '🍕', check: s => s.normalFoodEaten >= 100 },
  GLUTTON: { name: 'Glutton', desc: 'Eat 20 foods in one game', xp: 150, icon: '🤤', check: (s, ctx) => ctx.sessionFoodEaten >= 20 },
  SURVIVOR: { name: 'Survivor', desc: 'Survive 1 minute in one game', xp: 100, icon: '⏱️', check: (s, ctx) => ctx.sessionTimeAlive >= 60000 },
  MARATHONER: { name: 'Marathoner', desc: 'Survive 3 minutes in one game', xp: 300, icon: '⏳', check: (s, ctx) => ctx.sessionTimeAlive >= 180000 },
  LONG_BOI: { name: 'Long Boi', desc: 'Reach snake length 20', xp: 150, icon: '🐍', check: (s, ctx) => ctx.snakeLength >= 20 },
  SERPENT: { name: 'Serpent', desc: 'Reach snake length 50', xp: 400, icon: '🐉', check: (s, ctx) => ctx.snakeLength >= 50 },
  HAT_TRICK: { name: 'Hat Trick', desc: 'Eat all 3 food types in one game', xp: 150, icon: '🎩', check: (s, ctx) => ctx.hatTrickEligible },
  COMBO_3: { name: 'Combo Lord', desc: 'Reach 3x combo', xp: 150, icon: '🔥', check: (s, ctx) => ctx.maxCombo >= 3 },
  COMBO_5: { name: 'Combo Master', desc: 'Reach 5x combo', xp: 300, icon: '💥', check: (s, ctx) => ctx.maxCombo >= 5 },
};

let achievements = loadAchievements();

function loadAchievements() {
  try { return JSON.parse(localStorage.getItem('snake_achievements')) || {}; }
  catch(e) { return {}; }
}
```

### Step 2.2: Add achievement check function (after loadAchievements)

```js
function checkAchievements(trigger) {
  if (gameMode === 'zen') return;
  let unlocked = false;
  const ctx = {
    sessionFoodEaten,
    sessionTimeAlive,
    snakeLength: snake.length,
    hatTrickEligible: sessionFoodTypes.size === 3,
    maxCombo: stats.maxCombo,
    maxScore: stats.maxScore
  };
  for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
    if (achievements[id]) continue; // already unlocked
    if (ach.check(stats, ctx)) {
      achievements[id] = Date.now();
      awardXP(ach.xp);
      showAchievementToast(ach);
      unlocked = true;
    }
  }
  if (unlocked) {
    localStorage.setItem('snake_achievements', JSON.stringify(achievements));
  }
}

function showAchievementToast(ach) {
  const el = document.getElementById('toast');
  el.textContent = `🏆 ${ach.icon} ${ach.name}: ${ach.desc} (+${ach.xp} XP)`;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function showAchievementsPanel() {
  const el = document.getElementById('achievementsPanel');
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  let html = '<h2 style="text-align:center;margin-top:0;">🏆 ACHIEVEMENTS</h2><div style="max-height:400px;overflow-y:auto;">';
  for (const [id, ach] of Object.entries(ACHIEVEMENTS)) {
    const unlocked = achievements[id];
    html += `<div style="padding:8px;margin:4px 0;background:${unlocked ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.05)'};border-radius:6px;">
      <span style="font-size:1.2em;">${unlocked ? '✅' : '🔒'}</span>
      <strong>${ach.icon} ${ach.name}</strong>
      <span style="color:#888;margin-left:10px;">${ach.desc}</span>
      <span style="float:right;color:#FFD700;">${unlocked ? '✓ ' + new Date(unlocked).toLocaleDateString() : '+' + ach.xp + ' XP'}</span>
    </div>`;
  }
  html += '</div><p style="text-align:center;color:#888;">Press F or ESC to close</p>';
  el.innerHTML = html;
  el.style.display = 'block';
}
```

### Step 2.3: Add achievements panel HTML (after statsPanel)

Add after the `#statsPanel` div from Task 1:

```html
<div id="achievementsPanel" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.95);border:2px solid #FFD700;border-radius:10px;padding:20px;color:white;font-family:sans-serif;z-index:100;min-width:350px;max-width:500px;"></div>
```

### Step 2.4: Modify keydown handler for achievements

Add this case in the keydown handler, after the Escape handler and before Enter:

```js
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    showAchievementsPanel();
    return;
  }
```

### Step 2.5: Hook `checkAchievements()` into game flow

In `updateGame()`, in the food eat block (from Task 1), after the combo/maxCombo update, add:

```js
    // Check achievements after eating
    checkAchievements('food_eat');
```

In `updateGame()`, after the combo update block, add:

```js
    // Check combo achievements
    if (comboCount >= 3) checkAchievements('combo');
```

In `gameOver()`, after `saveAllState()`, add:

```js
  checkAchievements('game_over');
```

**HOOK POINTS:**
- After food eat → `checkAchievements('food_eat')`
- After combo reaches 3+ → `checkAchievements('combo')`
- At end of `gameOver()` → `checkAchievements('game_over')`

### Step 2.6: Update `saveAllState()` to include achievements

Modify `saveAllState()`:

```js
function saveAllState() {
  localStorage.setItem('snake_stats', JSON.stringify(stats));
  localStorage.setItem('snake_achievements', JSON.stringify(achievements));
}
```

**TESTING for TASK 2:**
- Open game, eat first food → verify toast appears for "First Bite"
- Check localStorage `snake_achievements` contains `FIRST_BITE` timestamp
- Press F to open achievements panel, verify it shows locked/unlocked states
- Set `comboCount = 3` in console, then eat food → verify "Combo Lord" toast
- Die after eating 20 foods in one session → verify "Glutton" toast
- Press Escape to close achievements panel

---

## TASK 3: Unlockable Cosmetics

### Overview
Adds unlockable snake skins, grid themes, trace effects, and death effects gated by level.

### Step 3.1: Add cosmetic definitions (after achievement definitions)

```js
const SNAKE_SKINS = {
  snake_green: { name: 'Classic', head: '#00FF00', body: '#00CC00', unlock: 1 },
  snake_cyan: { name: 'Cyan', head: '#00FFFF', body: '#00CCCC', unlock: 2 },
  snake_purple: { name: 'Purple', head: '#9B59B6', body: '#7D3C98', unlock: 4 },
  snake_gold: { name: 'Gold', head: '#FFD700', body: '#DAA520', unlock: 7 },
  snake_fire: { name: 'Fire', head: '#FF4500', body: '#8B0000', unlock: 10 },
  snake_rainbow: { name: 'Rainbow', head: 'rainbow', body: 'rainbow', unlock: 15 },
};

const GRID_THEMES = {
  grid_classic: { name: 'Classic', stroke: 'rgba(255,255,255,0.04)', bg: '#111', unlock: 1 },
  grid_neon: { name: 'Neon', stroke: 'rgba(0,255,255,0.08)', bg: '#0a0a1a', unlock: 3 },
  grid_matrix: { name: 'Matrix', stroke: 'rgba(0,255,65,0.1)', bg: '#000', unlock: 12 },
};

const TRACE_EFFECTS = {
  trace_none: { name: 'None', unlock: 1 },
  trace_ghost: { name: 'Ghost Trail', unlock: 9 },
  trace_sparkle: { name: 'Sparkle Trail', unlock: 15 },
};

const DEATH_EFFECTS = {
  death_classic: { name: 'Classic Burst', color: '#FF4500', count: 30, unlock: 1 },
  death_blue: { name: 'Blue Burst', color: '#4488FF', count: 30, unlock: 13 },
  death_rainbow: { name: 'Rainbow Burst', color: 'rainbow', count: 50, unlock: 20 },
};

const LEVEL_UNLOCKS = {
  2: ['snake_cyan'],
  3: ['grid_neon'],
  4: ['snake_purple'],
  7: ['snake_gold'],
  9: ['trace_ghost'],
  10: ['snake_fire'],
  12: ['grid_matrix'],
  13: ['death_blue'],
  15: ['snake_rainbow', 'trace_sparkle'],
  20: ['death_rainbow']
};

let unlockedCosmetics = loadUnlocked();
let cosmetics = loadEquipped();

function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem('snake_unlocks')) || ['snake_green', 'grid_classic', 'trace_none', 'death_classic']; }
  catch(e) { return ['snake_green', 'grid_classic', 'trace_none', 'death_classic']; }
}

function loadEquipped() {
  try { return JSON.parse(localStorage.getItem('snake_equipped')) || { snake: 'snake_green', grid: 'grid_classic', trace: 'trace_none', death: 'death_classic' }; }
  catch(e) { return { snake: 'snake_green', grid: 'grid_classic', trace: 'trace_none', death: 'death_classic' }; }
}

function checkLevelUnlocks(newLevel) {
  const unlocks = LEVEL_UNLOCKS[newLevel] || [];
  for (const id of unlocks) {
    if (!unlockedCosmetics.includes(id)) {
      unlockedCosmetics.push(id);
      const config = SNAKE_SKINS[id] || GRID_THEMES[id] || TRACE_EFFECTS[id] || DEATH_EFFECTS[id];
      showAchievementToast({ icon: '🎨', name: 'Cosmetic Unlocked!', desc: `"${config?.name || id}"`, xp: 0 });
    }
  }
  localStorage.setItem('snake_unlocks', JSON.stringify(unlockedCosmetics));
}
```

### Step 3.2: Add cosmetics panel HTML

Add after `#achievementsPanel`:

```html
<div id="cosmeticsPanel" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.95);border:2px solid #9B59B6;border-radius:10px;padding:20px;color:white;font-family:sans-serif;z-index:100;min-width:350px;max-width:500px;"></div>
```

### Step 3.3: Add cosmetics panel function (after `showAchievementsPanel`)

```js
function showCosmeticsPanel() {
  if (gameState === 'playing') return;
  const el = document.getElementById('cosmeticsPanel');
  if (el.style.display === 'block') { el.style.display = 'none'; return; }

  const categories = [
    { key: 'snake', label: '🐍 Snake Skin', items: SNAKE_SKINS },
    { key: 'grid', label: '🌐 Grid Theme', items: GRID_THEMES },
    { key: 'trace', label: '✨ Trace Effect', items: TRACE_EFFECTS },
    { key: 'death', label: '💀 Death Effect', items: DEATH_EFFECTS },
  ];

  let html = '<h2 style="text-align:center;margin-top:0;">🎨 COSMETICS</h2>';
  categories.forEach(cat => {
    const current = cosmetics[cat.key];
    const ids = Object.keys(cat.items).filter(id => unlockedCosmetics.includes(id));
    const idx = ids.indexOf(current);
    html += `<div style="margin:10px 0;padding:10px;background:rgba(255,255,255,0.05);border-radius:6px;">
      <div style="color:#aaa;font-size:0.9em;margin-bottom:4px;">${cat.label}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <button onclick="cycleCosmetic('${cat.key}', -1)" style="background:#333;color:white;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;">◀</button>
        <span style="font-weight:bold;">${cat.items[current]?.name || current}</span>
        <button onclick="cycleCosmetic('${cat.key}', 1)" style="background:#333;color:white;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;">▶</button>
      </div>
    </div>`;
  });
  html += '<p style="text-align:center;color:#888;">Press C or ESC to close</p>';
  el.innerHTML = html;
  el.style.display = 'block';
}

function cycleCosmetic(category, direction) {
  const defs = { snake: SNAKE_SKINS, grid: GRID_THEMES, trace: TRACE_EFFECTS, death: DEATH_EFFECTS }[category];
  const ids = Object.keys(defs).filter(id => unlockedCosmetics.includes(id));
  let idx = ids.indexOf(cosmetics[category]);
  idx = (idx + direction + ids.length) % ids.length;
  cosmetics[category] = ids[idx];
  localStorage.setItem('snake_equipped', JSON.stringify(cosmetics));
  showCosmeticsPanel(); // re-render
  drawGame(); // preview
}
```

**Note:** `cycleCosmetic` is exposed to the global scope so inline `onclick` handlers work. In a single HTML file this is acceptable.

### Step 3.4: Add keybinding for cosmetics panel

In the keydown handler, add after the F key handler:

```js
  if (e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    showCosmeticsPanel();
    return;
  }
```

### Step 3.5: Modify `drawSnake()` (line 302-330)

Replace the existing `drawSnake()` with cosmetic-aware rendering:

```js
function drawSnake() {
  const skin = SNAKE_SKINS[cosmetics.snake] || SNAKE_SKINS.snake_green;
  snake.forEach((segment, index) => {
    if (skin.head === 'rainbow') {
      const hue = (index * 20 + Date.now() * 0.05) % 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    } else {
      ctx.fillStyle = index === 0 ? skin.head : skin.body;
    }
    ctx.fillRect(segment.x, segment.y, TILE_SIZE - 1, TILE_SIZE - 1);

    if (index === 0) {
      let ex1, ey1, ex2, ey2;
      if (dx > 0) {
        ex1 = segment.x + 12; ey1 = segment.y + 4;
        ex2 = segment.x + 12; ey2 = segment.y + 12;
      } else if (dx < 0) {
        ex1 = segment.x + 4; ey1 = segment.y + 4;
        ex2 = segment.x + 4; ey2 = segment.y + 12;
      } else if (dy < 0) {
        ex1 = segment.x + 4; ey1 = segment.y + 4;
        ex2 = segment.x + 12; ey2 = segment.y + 4;
      } else {
        ex1 = segment.x + 4; ey1 = segment.y + 12;
        ex2 = segment.x + 12; ey2 = segment.y + 12;
      }
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(ex1, ey1, 4, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(ex2, ey2, 4, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = 'black';
      ctx.beginPath(); ctx.arc(ex1, ey1, 2, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(ex2, ey2, 2, 0, 2 * Math.PI); ctx.fill();
    }
  });
}
```

### Step 3.6: Modify `drawGrid()` (line 268-283)

Replace with theme lookup:

```js
function drawGrid() {
  const theme = GRID_THEMES[cosmetics.grid] || GRID_THEMES.grid_classic;
  ctx.strokeStyle = theme.stroke;
  ctx.lineWidth = 1;
  for (let x = 0; x <= CANVAS_WIDTH; x += TILE_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += TILE_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }
}
```

### Step 3.7: Add trace effects to `animateVisuals()` (line 218-251)

Add trace rendering before the particle update loop in `animateVisuals()`:

```js
function animateVisuals() {
  // Draw ghost trail
  if (cosmetics.trace === 'trace_ghost' && snake.length >= 2) {
    const last = snake[snake.length - 1];
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(last.x, last.y, TILE_SIZE - 1, TILE_SIZE - 1);
    ctx.globalAlpha = 1;
  }

  // Draw sparkle trail
  if (cosmetics.trace === 'trace_sparkle' && gameTick % 5 === 0 && snake.length > 0) {
    const tail = snake[snake.length - 1];
    spawnParticles(tail.x, tail.y, 2, '#FFD700');
  }

  // ... existing particle update loop
```

### Step 3.8: Modify `gameOver()` death effect (line 135-142)

Replace the hardcoded `spawnParticles` call with:

```js
  // Death effect
  const de = DEATH_EFFECTS[cosmetics.death] || DEATH_EFFECTS.death_classic;
  if (de.color === 'rainbow') {
    spawnParticles(snake[0].x, snake[0].y, de.count, '#FF0000');
    spawnParticles(snake[0].x, snake[0].y, de.count, '#00FF00');
    spawnParticles(snake[0].x, snake[0].y, de.count, '#0000FF');
  } else {
    spawnParticles(snake[0].x, snake[0].y, de.count, de.color);
  }
```

### Step 3.9: Save cosmetics in `saveAllState()`

Update `saveAllState()`:

```js
function saveAllState() {
  localStorage.setItem('snake_stats', JSON.stringify(stats));
  localStorage.setItem('snake_achievements', JSON.stringify(achievements));
  localStorage.setItem('snake_unlocks', JSON.stringify(unlockedCosmetics));
  localStorage.setItem('snake_equipped', JSON.stringify(cosmetics));
}
```

**TESTING for TASK 3:**
- Open game, press C → cosmetics panel should appear (only when not playing)
- Cycle through snake skins using arrow buttons, verify canvas updates
- Verify locked cosmetics don't appear in the cycle list
- Manually set `level = 2` and `awardXP(100)` to trigger level-up → verify "Cyan" unlock toast
- Verify unlocked cosmetics persist in localStorage `snake_unlocks`
- Verify equipped cosmetics persist in localStorage `snake_equipped`
- Test rainbow snake: colors should shift across segments
- Test ghost trail: faint fade at tail position
- Test death effects: change equipped death effect, die, verify particle color changes

---

## TASK 4: Game Mode Selector

### Overview
Adds three game modes (Classic, Time Attack, Zen) with a mode selection UI on the idle screen.

### Step 4.1: Add mode config and globals (after cosmetic globals)

```js
const MODE_CONFIG = {
  classic: {
    name: 'Classic',
    speed: 'dynamic',
    selfCollision: true,
    wallDeath: false,
    wrap: true,
    timer: null,
    scoreIs: 'points',
    earnXP: true,
    achievementsEnabled: true,
    foodProbs: { normal: 0.80, bonus: 0.15, speed: 0.05 }
  },
  timeAttack: {
    name: 'Time Attack',
    speed: 80,
    selfCollision: true,
    wallDeath: false,
    wrap: true,
    timer: 60000,
    scoreIs: 'points',
    earnXP: true,
    achievementsEnabled: true,
    foodProbs: { normal: 0.70, bonus: 0.30 }
  },
  zen: {
    name: 'Zen',
    speed: 150,
    selfCollision: false,
    wallDeath: false,
    wrap: true,
    timer: null,
    scoreIs: 'length',
    earnXP: false,
    achievementsEnabled: false,
    foodProbs: { normal: 0.80, bonus: 0.20 }
  }
};

const MODE_ORDER = ['classic', 'timeAttack', 'zen'];
let gameMode = 'classic';
let modeSelectIndex = 0;
let timeAttackEnd = 0;
let timeAttackPausedRemaining = 0;
let modeHighScores = loadModeHighScores();

function loadModeHighScores() {
  try { return JSON.parse(localStorage.getItem('snake_mode_highs')) || {}; }
  catch(e) { return {}; }
}

function getModeDesc(mode) {
  const d = {
    classic: 'Standard snake. All food types. Dynamic speed.',
    timeAttack: '60 seconds! No speed food. Bonus = +50 pts.',
    zen: 'No collisions. Score = length. Press Enter to end.'
  };
  return d[mode] || '';
}
```

### Step 4.2: Modify `getSpeed()` (line 70-72)

Replace with:

```js
function getSpeed() {
  const mc = MODE_CONFIG[gameMode];
  if (typeof mc.speed === 'number') return mc.speed;
  return Math.max(MIN_SPEED, BASE_SPEED - Math.floor(score / 50) * 5);
}
```

### Step 4.3: Modify `checkCollision()` (line 121-126)

Replace with:

```js
function checkCollision(pos) {
  const mc = MODE_CONFIG[gameMode];
  if (!mc.selfCollision) return false;
  for (let i = 0; i < snake.length; i++) {
    if (pos.x === snake[i].x && pos.y === snake[i].y) return true;
  }
  return false;
}
```

### Step 4.4: Modify `generateFood()` (line 74-90)

Replace the probability logic to use `MODE_CONFIG`:

```js
function generateFood(currentSnake) {
  const mc = MODE_CONFIG[gameMode];
  if (currentSnake.length >= (CANVAS_WIDTH / TILE_SIZE) * (CANVAS_HEIGHT / TILE_SIZE)) return null;
  let newFood;
  do {
    const rand = Math.random();
    let type = 'normal';
    let cumulative = 0;
    for (const [t, prob] of Object.entries(mc.foodProbs)) {
      cumulative += prob;
      if (rand < cumulative) { type = t; break; }
    }
    newFood = {
      x: Math.floor(Math.random() * (CANVAS_WIDTH / TILE_SIZE)) * TILE_SIZE,
      y: Math.floor(Math.random() * (CANVAS_HEIGHT / TILE_SIZE)) * TILE_SIZE,
      type: type
    };
  } while (currentSnake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
  return newFood;
}
```

### Step 4.5: Modify `startGame()` (line 115-119)

Add mode-specific initialization:

```js
function startGame() {
  gameState = 'playing';
  sessionStartTime = Date.now();

  const mc = MODE_CONFIG[gameMode];
  if (mc.timer) {
    timeAttackEnd = Date.now() + mc.timer;
    timeAttackPausedRemaining = mc.timer;
  }

  gameInterval = setInterval(updateGame, getSpeed());
  drawGame();
}
```

### Step 4.6: Modify `updateGame()` (line 347-409)

Add Time Attack timer check after the existing `gameTick` block. Insert after `if (gameTick % 10 === 0) awardXP(1);`:

```js
  // Time Attack timer
  if (gameMode === 'timeAttack') {
    const remaining = timeAttackEnd - Date.now();
    if (remaining <= 0) {
      gameOver();
      return;
    }
  }
```

In the food eat block, modify bonus food score for Time Attack. Replace `score += 30;` for bonus food with:

```js
    if (eatenType === 'bonus') {
      score += (gameMode === 'timeAttack' ? 50 : 30);
      playSound('bonus');
    }
```

For Zen mode scoring, add after the score updates (before `updateScoreDisplay()`):

```js
    // Zen mode: score = length
    if (gameMode === 'zen') {
      score = snake.length;
    }
```

### Step 4.7: Modify `gameOver()` (line 135-142)

Add per-mode high score tracking after existing stat aggregation:

```js
  // Per-mode high score
  if (score > (modeHighScores[gameMode] || 0)) {
    modeHighScores[gameMode] = score;
    localStorage.setItem('snake_mode_highs', JSON.stringify(modeHighScores));
  }
```

Add Zen mode exception at the very top:

```js
function gameOver() {
  if (gameMode === 'zen') return; // Zen never auto-ends

  clearInterval(gameInterval);
  gameInterval = null;
  gameState = 'gameover';
  // ... rest of existing gameOver logic
```

### Step 4.8: Add Zen end session function

```js
function endZenSession() {
  clearInterval(gameInterval);
  gameInterval = null;
  gameState = 'gameover';

  sessionTimeAlive = Date.now() - sessionStartTime;
  if (sessionTimeAlive > stats.longestTimeAlive) stats.longestTimeAlive = sessionTimeAlive;
  stats.totalTimePlayed += sessionTimeAlive;
  stats.gamesPlayed++;
  stats.totalScore += score;
  if (score > stats.maxScore) stats.maxScore = score;
  if (snake.length > stats.longestLength) stats.longestLength = snake.length;
  saveAllState();

  drawGame();
}
```

### Step 4.9: Modify `drawOverlay()` (line 253-266)

Replace with mode-aware overlay. When `gameState === 'idle'`, draw mode selector instead of simple text:

```js
function drawOverlay(text, subtext) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (gameState === 'idle') {
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SELECT MODE', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

    MODE_ORDER.forEach((mode, i) => {
      const y = CANVAS_HEIGHT / 2 - 20 + i * 40;
      const isSelected = i === modeSelectIndex;
      ctx.fillStyle = isSelected ? '#FFD700' : '#888';
      ctx.font = isSelected ? 'bold 24px Arial' : '20px Arial';
      ctx.fillText((isSelected ? '▶ ' : '  ') + MODE_CONFIG[mode].name, CANVAS_WIDTH / 2, y);
      if (isSelected) {
        ctx.font = '14px Arial';
        ctx.fillStyle = '#AAA';
        ctx.fillText(getModeDesc(mode), CANVAS_WIDTH / 2, y + 22);
      }
    });

    ctx.font = '14px Arial';
    ctx.fillStyle = '#888';
    ctx.fillText(`Lv.${level} | XP: ${xp.toLocaleString()}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
    return;
  }

  ctx.fillStyle = '#FFF';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
  if (subtext) {
    ctx.font = '18px Arial';
    ctx.fillStyle = '#AAA';
    ctx.fillText(subtext, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
  }
}
```

### Step 4.10: Add timer HUD to `drawGame()` (line 332-345)

Add Time Attack timer rendering after `drawSnake()` and before overlay checks:

```js
function drawGame() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawGrid();
  drawFood();
  drawSnake();

  // Time Attack HUD
  if (gameMode === 'timeAttack' && gameState === 'playing') {
    const remaining = Math.max(0, timeAttackEnd - Date.now());
    const secs = Math.ceil(remaining / 1000);
    ctx.fillStyle = secs <= 10 ? '#FF4500' : '#FFF';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`TIME: ${secs}s`, CANVAS_WIDTH - 10, 10);
  }

  // Update XP display
  document.getElementById('xpDisplay').textContent = `Lv.${level} | XP: ${xp.toLocaleString()}`;

  if (gameState === 'idle') {
    drawOverlay('SNAKE', 'Press ENTER to Start');
  } else if (gameState === 'paused') {
    drawOverlay('PAUSED', 'Press P or SPACE to Resume');
  } else if (gameState === 'gameover') {
    drawOverlay('GAME OVER', `Score: ${score} | Press ENTER to Restart`);
  }
}
```

### Step 4.11: Modify keydown handler for mode selection (line 411-480)

Replace the Enter handler (lines 416-422) with mode-aware logic:

```js
  if (e.key === 'Enter') {
    if (gameState === 'idle') {
      gameMode = MODE_ORDER[modeSelectIndex];
      resetGame();
      startGame();
    } else if (gameState === 'gameover') {
      resetGame();
      startGame();
    } else if (gameState === 'playing' && gameMode === 'zen') {
      endZenSession();
    }
    return;
  }
```

Add mode navigation when idle. Insert before `if (gameState !== 'playing') return;` (around line 446):

```js
  if (gameState === 'idle') {
    if (e.key === 'ArrowUp') {
      modeSelectIndex = (modeSelectIndex - 1 + MODE_ORDER.length) % MODE_ORDER.length;
      drawGame();
      return;
    }
    if (e.key === 'ArrowDown') {
      modeSelectIndex = (modeSelectIndex + 1) % MODE_ORDER.length;
      drawGame();
      return;
    }
  }
```

### Step 4.12: Modify pause/resume for Time Attack timer

In the pause handler (P/Space key, around line 424), add Time Attack pause logic:

```js
  if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
    if (gameState === 'playing') {
      gameState = 'paused';
      clearInterval(gameInterval);
      gameInterval = null;
      if (gameMode === 'timeAttack') {
        timeAttackPausedRemaining = timeAttackEnd - Date.now();
      }
      playSound('pause');
      drawGame();
    } else if (gameState === 'paused') {
      gameState = 'playing';
      if (gameMode === 'timeAttack') {
        timeAttackEnd = Date.now() + timeAttackPausedRemaining;
      }
      gameInterval = setInterval(updateGame, getSpeed());
      playSound('resume');
      drawGame();
    }
    return;
  }
```

### Step 4.13: Modify `visibilitychange` handler (line 482-490)

Add Time Attack pause logic:

```js
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameState === 'playing') {
    gameState = 'paused';
    clearInterval(gameInterval);
    gameInterval = null;
    if (gameMode === 'timeAttack') {
      timeAttackPausedRemaining = timeAttackEnd - Date.now();
    }
    playSound('pause');
    drawGame();
  }
});
```

On resume from visibility change, there's no automatic resume (player must press P/Space), so the existing handler is fine.

### Step 4.14: First-time player detection

Add at the top of the script (after globals) or in `init`:

```js
const isFirstPlay = !localStorage.getItem('snake_stats');
```

If `isFirstPlay` is true, skip the mode selector on first idle screen. This can be handled by modifying `drawOverlay()`:

```js
  if (gameState === 'idle') {
    if (isFirstPlay) {
      // Simple first-play screen
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SNAKE', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);
      ctx.font = '18px Arial';
      ctx.fillStyle = '#AAA';
      ctx.fillText('Press ENTER to Start', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
      return;
    }
    // ... existing mode selector rendering
  }
```

**TESTING for TASK 4:**
- Open game in fresh incognito → verify simple "SNAKE - Press ENTER to Start" screen (no mode selector)
- Play one game, then return to idle → verify mode selector appears
- Arrow Up/Down to cycle modes, verify highlight and description update
- Select Time Attack, verify timer counts down from 60 in HUD
- Pause Time Attack, verify timer stops; resume, verify continues from correct time
- Let Time Attack timer hit 0 → verify game over triggers
- Select Zen, verify no self-collision (snake can cross itself)
- In Zen, press Enter → verify `endZenSession()` called and summary shown
- Verify per-mode high scores stored in `snake_mode_highs`
- Verify Classic mode still behaves like original (dynamic speed, all food types)

---

## Cross-Task Integration Checklist

- [ ] `awardXP()` checks `gameMode === 'zen'` before awarding
- [ ] `checkAchievements()` checks `gameMode === 'zen'` and skips
- [ ] `saveAllState()` persists stats, achievements, unlocks, equipped cosmetics
- [ ] `drawGame()` updates `#xpDisplay` every frame
- [ ] `animateVisuals()` updates `#comboDisplay` every frame
- [ ] Only one overlay active at a time (new overlay closes current one)
- [ ] Escape key closes all overlays
- [ ] All `JSON.parse(localStorage.getItem(...))` wrapped in try-catch
- [ ] `generateFood()` checks board fill before do-while loop (existing line 75 preserved)
- [ ] `gameOver()` clears interval AND sets `gameInterval = null` (existing pattern preserved)
- [ ] Speed changes clear existing interval and create new one (existing pattern preserved)

## Final Verification

1. Open `snake.html` in browser
2. Check console for no errors on load
3. Play Classic mode → eat food, verify XP increases, verify combo works
4. Press Tab → stats panel shows
5. Press F → achievements panel shows
6. Press C → cosmetics panel shows (only when not playing)
7. Play Time Attack → verify 60s timer, no speed food
8. Play Zen → verify no collision, Enter ends session
9. Die in Classic → verify death particles match equipped cosmetic
10. Verify all localStorage keys: `snake_stats`, `snake_xp`, `snake_level`, `snake_achievements`, `snake_unlocks`, `snake_equipped`, `snake_mode_highs`
11. Refresh page → verify all persisted data loads correctly
