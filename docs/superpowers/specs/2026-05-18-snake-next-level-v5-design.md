# Snake Next Level v5 — Design Document

> **Status:** Draft
> **Date:** 2026-05-18
> **Repository:** `/Users/jeko/tmp/snakes/snake.html` (single-file HTML/JS/CSS, ~2644 lines)
> **Evolution:** v3 → v4 (Living Arena, descoped) → v5

## Context

This design targets the current state of the game after v3 was implemented: a feature-rich Snake game with 5 game modes (Classic, Time Attack, Zen, Daily, Snap), 6 food tiers (common/uncommon/rare/epic/bonus/speed), power-ups (shield/magnet/slow-mo), AI rival snake, cosmetics (snake skins / grid themes / trails / death effects / borders), XP/levels/prestige (5 prestige levels, cap at level 20), 30 achievements, particle system, screen shake, combo system (5x max), wall wrapping, input buffering, auto-pause, sound effects (Web Audio API), touch controls (D-pad + swipe), daily challenges with streaks, per-mode high scores, dual render loops (setInterval game loop + requestAnimationFrame visual loop), toast queue, DOM panels (stats/achievements/cosmetics), and food type legend.

The game has grown organically from a simple ~300-line script into a ~2644-line monolith. The code is functional but carries architectural debt: duplicated speed formulas, 38+ scattered localStorage access patterns, DOM queries in 60fps hot paths, `Date.now()` calls in render paths, and a handful of subtle bugs. Performance on mobile can lag when the board is full of particles or the grid redraws every frame.

## Core Principles

1. **Refactor, don't add** — zero new gameplay features. No new modes, food types, power-ups, or mechanics. Everything is cleanup, performance, or polish.
2. **Architectural debt reduction** — extract the monolith into logical sub-functions, consolidate duplicated patterns, centralize data access.
3. **Performance optimization** — cache the grid on an offscreen canvas, eliminate `Date.now()` from render paths, guard particle spawning, batch DOM writes.
4. **Bug fixes** — power-up pickup despawn, food generation iteration limit, speed boost closure race, rival-eats-last-food softlock, Zen mode death counter.
5. **Polish** — level-up visual flash, achievement/level-up/power-up sounds, help system overhaul, end-of-game session summary, vibration feedback, mobile HUD scaling.

## Scope Constraints

- NOT adding new game modes
- NOT adding new food types or power-ups
- NOT rebalancing existing mechanics (XP values, food weights, power-up durations, speed curves)
- NOT changing game feel or core loop
- NOT restructuring into multiple files
- All changes remain within the single-file structure

## Package 1: Architectural Refactoring

**Rationale:** Clean before optimizing. These changes reduce duplication, consolidate logic, and make all subsequent work safer.

### 1a. Speed Calculation Centralization

**Problem:** The formula `slowMoActive ? getSpeed() * 2 : getSpeed()` is duplicated across 7+ locations. Each copy is a potential source of bugs if the formula changes — and the pattern has already diverged (e.g., `activatePowerUp` stores `tickInterval = getSpeed() * 2` directly while `resumeGame` recomputes it from `slowMoActive`).

**Current locations (all in `snake.html`):**

| Line | Context | Code |
|------|---------|------|
| 484 | `activatePowerUp()` slowMo | `tickInterval = getSpeed() * 2` |
| 499 | `deactivatePowerUp()` slowMo restore | `tickInterval = getSpeed()` |
| 640 | `startGame()` | `tickInterval = getSpeed()` |
| 897 | `resumeGame()` | `tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed()` |
| 1913 | Speed food restore (setTimeout) | `tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed()` |
| 1923 | Normal eat restore | `tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed()` |
| 1963 | Power-up timer tick duration | `const tickDuration = slowMoActive ? getSpeed() * 2 : getSpeed()` |

**Fix:**
```js
function getEffectiveSpeed() {
    return slowMoActive ? getSpeed() * 2 : getSpeed();
}
```

Replace all 7 inline formulas with `getEffectiveSpeed()`. This eliminates a source of subtle speed bugs where one call site might not account for slowMo (e.g., the `deactivatePowerUp()` call at line 499 ignores the possibility that `slowMoActive` might already be false — it's technically safe because `deactivatePowerUp()` sets `slowMoActive = false` on the line before, but the pattern is fragile).

**Edge case:** `getSpeed()` itself is dynamic for Classic/Daily mode (`Math.max(MIN_SPEED, BASE_SPEED - Math.floor(score / 50) * 5)`). `getEffectiveSpeed()` doubles whatever `getSpeed()` returns. This is correct behavior — slowMo doubles the effective tickInterval regardless of the base speed.

### 1b. Extract DrawGame Sub-Functions

**Problem:** `drawGame()` (lines 1604-1764) is a 160-line function that inlines all HUD rendering logic. It should delegate to named sub-functions.

**Audit findings:**
- Grid drawing: already in `drawGrid()` ✓
- Obstacles: already in `drawObstacles()` ✓
- Food: already in `drawFood()` ✓
- Snake: already in `drawSnake()` ✓
- Rival: already in `drawRival()` ✓
- Trails: already in `drawTrails()` ✓
- Power-up pickup: already in `drawPowerUpPickup()` ✓
- **Missing extracts (currently inlined in drawGame):**
  - Time Attack HUD (lines 1675-1682) → `drawTimeAttackHUD()`
  - Snap HUD (lines 1686-1701) → `drawSnapHUD()`
  - Daily HUD (lines 1704-1719) → `drawDailyHUD()`
  - Power-up HUD (lines 1722-1744) → `drawPowerUpHUD()`
  - Rival length display (lines 1747-1755) → `drawRivalHUD()`
  - XP bar (lines 1617-1644) → `drawXPBar()`
  - Mute indicator (lines 1607-1614) → `drawMuteIndicator()`
  - Prestige border (lines 1647-1660) → `drawPrestigeBorder()`
  - Slow-mo tint (lines 1669-1672) → `drawSlowMoTint()`

**Signatures:**
```js
function drawTimeAttackHUD() // reads gameState, timeAttackEnd, gameMode
function drawSnapHUD()       // reads shrinkTimer, snapDuration, snapLevel
function drawDailyHUD()      // reads score, session* variables
function drawPowerUpHUD()    // reads powerUpType, powerUpTimer
function drawRivalHUD()      // reads rivalActive, rivalSnake, snake
function drawXPBar()         // reads level, xp
function drawMuteIndicator() // reads muted
function drawPrestigeBorder()// reads cosmetics.border
function drawSlowMoTint()    // reads slowMoActive
```

All functions read global module-level state (same as current `drawGame()`). No parameters needed. `drawGame()` becomes:
```js
function drawGame(t) {
    drawGrid();
    drawMuteIndicator();
    drawXPBar();
    drawPrestigeBorder();
    drawObstacles();
    drawFood();
    drawPowerUpPickup();
    drawSnake(t);
    drawRival(t);
    drawTrails();
    drawSlowMoTint();
    drawTimeAttackHUD();
    drawSnapHUD();
    drawDailyHUD();
    drawPowerUpHUD();
    drawRivalHUD();
    if (gameState === 'idle') drawOverlay('SNAKE', 'Press ENTER to Start');
    else if (gameState === 'paused') drawOverlay('PAUSED', 'Press P or SPACE to Resume');
    else if (gameState === 'gameover') drawOverlay('GAME OVER', 'Score: ' + score + ' | Press ENTER to Restart');
}
```

### 1c. Cache DOM References

**Problem:** DOM elements are queried via `document.getElementById()` in the rAF hot path (~60fps), which is wasteful when these elements never change.

**Current hot-path queries:**

| Line | Element | Context |
|------|---------|---------|
| 1127 | `comboDisplay` | Every rAF frame (60fps) |
| 1132 | `xpDisplay` | Every rAF frame (60fps) |
| 1127 | `comboDisplay` | `comboFadeTimer` callback (but this is once per combo) |

**Fix:** Cache at module level alongside existing cached references (lines 79-82):
```js
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');

// NEW cached references:
const toastEl = document.getElementById('toast');
const comboDisplayEl = document.getElementById('comboDisplay');
const xpDisplayEl = document.getElementById('xpDisplay');
const statsPanelEl = document.getElementById('statsPanel');
const achievementsPanelEl = document.getElementById('achievementsPanel');
const cosmeticsPanelEl = document.getElementById('cosmeticsPanel');
const panelBackdropEl = document.getElementById('panelBackdrop');
const dpadEl = document.getElementById('dpad');
```

Replace all `document.getElementById('toast')`, `document.getElementById('comboDisplay')`, etc. with cached references throughout the file. This eliminates ~40 DOM queries on page load (not perf-critical) but critically eliminates the 60fps queries.

### 1d. Consolidate localStorage

**Problem:** There are 38+ direct `localStorage.getItem()` / `localStorage.setItem()` calls, each with its own `try/catch` wrapper. The try/catch pattern is essential (private browsing, storage quota) but massively duplicated.

**Fix:** Create a `saveManager` utility:
```js
const saveManager = {
    get(key, defaultVal) {
        try {
            const val = localStorage.getItem(key);
            return val !== null ? val : defaultVal;
        } catch(e) { return defaultVal; }
    },
    set(key, value) {
        try { localStorage.setItem(key, String(value)); }
        catch(e) { /* storage unavailable */ }
    },
    getJSON(key, defaultVal) {
        try {
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : defaultVal;
        } catch(e) { return defaultVal; }
    },
    setJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); }
        catch(e) { /* storage unavailable */ }
    },
    remove(key) {
        try { localStorage.removeItem(key); }
        catch(e) { /* storage unavailable */ }
    }
};
```

**Keys in use:** `snake_high_score`, `snake_muted`, `snake_xp`, `snake_prestige`, `snake_stats`, `snake_achievements`, `snake_unlocks`, `snake_equipped`, `snake_mode_highs`, `snake_daily_date`, `snake_daily_done`, `snake_daily_attempts_remaining`, `snake_streak_count`.

Replace all scattered patterns:
```js
// BEFORE (9 lines for one value):
let highScore;
try { highScore = parseInt(localStorage.getItem('snake_high_score')) || 0; } catch(e) { highScore = 0; }

// AFTER:
const highScore = parseInt(saveManager.get('snake_high_score', '0'));
```

```js
// BEFORE:
try { localStorage.setItem('snake_high_score', highScore); } catch(e) { /* localStorage unavailable */ }

// AFTER:
saveManager.set('snake_high_score', highScore);
```

For JSON values:
```js
// BEFORE (3 lines):
try { return JSON.parse(localStorage.getItem('snake_stats')); }
catch(e) { return getDefaultStats(); }

// AFTER:
return saveManager.getJSON('snake_stats') || getDefaultStats();
```

**Impact:** Eliminates ~60 lines of try/catch boilerplate. Every storage access becomes a one-liner. New storage keys added in the future will naturally use the manager.

### 1e. Guard Canvas Save/Restore

**Problem:** The shake translation block (lines 1080-1086) evaluates its condition twice independently:
```js
if (shakeTimer > 0 && gameState !== 'paused') {
    const intensity = (shakeTimer / 200) * 5;
    ctx.save();
    ctx.translate(...);
}
drawGame(t);
if (shakeTimer > 0 && gameState !== 'paused') ctx.restore();
```

If `shakeTimer` or `gameState` changes between the two checks (e.g., `drawGame()` somehow modifies either — in current code it doesn't, but this is fragile), the save and restore counts would be mismatched, permanently corrupting the canvas transform stack.

**Fix:** Use a guard variable:
```js
let didShake = false;
if (shakeTimer > 0 && gameState !== 'paused') {
    didShake = true;
    const intensity = (shakeTimer / 200) * 5;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * 2 * intensity, (Math.random() - 0.5) * 2 * intensity);
}
drawGame(t);
if (didShake) ctx.restore();
```

This ensures save/restore are always paired, regardless of mutable state changes.

**Audit for other save/restore issues:**
- `drawFood()` (lines 1273-1360): `ctx.save()` at top of function, `ctx.restore()` inside the function body at line 1360, then another save/restore at lines 1365-1374 for label drawing. Both are properly paired. ✓
- `drawPowerUpPickup()` (lines 1384-1421): single save/restore pair. ✓
- `drawEyes()` (lines 1423-1444): no save/restore — uses fillStyle directly. This is safe because fillStyle is overwritten by the caller (drawSnake/drawRival) after calling drawEyes. ✓
- `drawSnake()` (lines 1446-1552): save/restore at lines 1541-1550 for shield aura. Clean pair. The ghost/rainbow globalAlpha at lines 1487-1506 is manually reset to 1 at line 1505. ✓
- `drawOverlay()` (lines 1140-1236): no save/restore — sets fillStyle, font, textAlign explicitly. ✓
- `animateVisuals()` lines 1108-1116: save/restore for snap level-up flash. ✓

The shake translation is the only risky pair.

### 1f. Prestige Endgame

**Problem:** `PRESTIGE_REWARDS` (lines 261-267) has entries for prestige levels 1-5 only, but the key handler (lines 2402-2414) allows infinite prestige with no cap:
```js
if ((e.key === 'x' || e.key === 'X') && gameState === 'idle' && level >= 20) {
    prestigeLevel++;
    xp = 0;
    level = 1;
    // ...
    checkPrestigeUnlocks();
}
```

Beyond level 5, `checkPrestigeUnlocks()` at line 2171 does `const reward = PRESTIGE_REWARDS[prestigeLevel];` — since level 6+ is undefined, no reward is given, no toast is shown. The player can prestige infinitely for no benefit, wasting their level 20 progress.

**Fixes:**

1. **Add prestige cap at 5:**
```js
if ((e.key === 'x' || e.key === 'X') && gameState === 'idle' && level >= 20) {
    if (prestigeLevel >= 5) {
        queueToast('⭐ Max Prestige Reached! You are at the peak.', 3000);
        return;
    }
    prestigeLevel++;
    // ...
}
```

2. **Display prestige multiplier in HUD:**
   Currently, prestige level is only shown in the idle overlay (line 1186-1190). Add it to the XP bar too: `"Lv.5 | P3 | 1200/1500"` when `prestigeLevel > 0`.

3. **Show prestige multiplier on gameover overlay:**
   When `prestigeLevel > 0`, show `"Prestige x1.5"` (or whatever multiplier) beneath the score to explain the benefit to the player.

## Package 2: Performance Optimization

**Rationale:** After cleanup, optimize the hot paths. The game runs at 60fps on the rAF loop and up to 20fps on the setInterval loop. Every millisecond counts.

### 2a. Offscreen Canvas for Grid

**Problem:** `drawGrid()` (lines 1238-1254) redraws the grid every frame. This involves:
- 1 fillRect for background
- 21 vertical line segments (moveTo + lineTo)
- 21 horizontal line segments (moveTo + lineTo)
- 1 stroke call

The grid is purely decorative (cosmetic) — it changes only when the player switches grid themes, which happens once per session at most.

**Fix:** Create an offscreen canvas cache:
```js
let gridCacheCanvas = null;
let currentGridTheme = null;

function ensureGridCache() {
    const theme = GRID_THEMES[cosmetics.grid] || GRID_THEMES.grid_classic;
    if (gridCacheCanvas && currentGridTheme === cosmetics.grid) return;
    
    if (!gridCacheCanvas) {
        gridCacheCanvas = document.createElement('canvas');
        gridCacheCanvas.width = CANVAS_WIDTH;
        gridCacheCanvas.height = CANVAS_HEIGHT;
    }
    
    const gCtx = gridCacheCanvas.getContext('2d');
    // Draw grid onto cache (same logic as current drawGrid)
    gCtx.strokeStyle = theme.stroke;
    gCtx.lineWidth = 1;
    gCtx.fillStyle = theme.bg;
    gCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    gCtx.beginPath();
    for (let x = 0; x <= CANVAS_WIDTH; x += TILE_SIZE) {
        gCtx.moveTo(x, 0);
        gCtx.lineTo(x, CANVAS_HEIGHT);
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y += TILE_SIZE) {
        gCtx.moveTo(0, y);
        gCtx.lineTo(CANVAS_WIDTH, y);
    }
    gCtx.stroke();
    
    currentGridTheme = cosmetics.grid;
}

function drawGrid() {
    ensureGridCache();
    ctx.drawImage(gridCacheCanvas, 0, 0);
}
```

**Invalidation:** Call `ensureGridCache()` (which will re-cache) whenever the player changes grid theme — in the cosmetics panel handler (line 2327).

**Impact:** Eliminates 43 draw calls per frame (1 fillRect + 42 moveTo/lineTo + 1 stroke). The grid becomes a single `drawImage` call — essentially free.

### 2b. Eliminate Date.now() in Render Path

**Problem:** `Date.now()` is called in the rAF render path for purely cosmetic effects. This blocks on the system clock and prevents frame timing from being synchronized with the display refresh.

**Current Date.now() calls in render path:**

| Line | Function | Usage |
|------|----------|-------|
| 1330 | `drawFood()` (-> `drawGame()` -> rAF) | `Math.sin(Date.now() / 200)` for bonus food pulse |
| 1491 | `drawSnake()` (-> `drawGame()` -> rAF) | Rainbow snake hue: `Date.now() * 0.05` |
| 330 | `TRAIL_RENDER_CONFIG.trace_rainbow.color` (-> `drawTrails()` -> rAF) | `Date.now() * 0.05` |
| 331 | `TRAIL_RENDER_CONFIG.trace_galaxy.color` (-> `drawTrails()` -> rAF) | `Date.now() * 0.03` |

**Fix:** Pass a cached `renderTime` through the draw chain:

```js
let renderTime = 0; // module-level variable

function animateVisuals(timestamp) {
    renderTime = timestamp; // <-- set once per frame
    // ... rest of animateVisuals
}
```

Then replace:
- `Date.now() / 200` -> `renderTime / 200`
- `Date.now() * 0.05` -> `renderTime * 0.05`
- `Date.now() * 0.03` -> `renderTime * 0.03`

**Draw chain update:** `drawGame(t)` -> `drawFood()` / `drawSnake()` / `drawTrails()` all receive `renderTime` indirectly (either as a parameter or via the module variable). Since `animateVisuals` is the sole caller of the draw chain, and it sets `renderTime` once per frame, all cosmetic time values are synchronized.

**Edge case:** The first frame. On first call, `timestamp` is a high-resolution time (from `performance.now()` via rAF), not an epoch-based time. For sine/cosine animations, this is fine — only the relative delta matters. No behavioral change from `Date.now()`.

### 2c. Separate Particle Layer (Deferred)

**Problem:** When particles are the only visual change (no game state change), the game still does a full `drawGame()` redraw (grid + obstacles + food + snake + rival + trails). Particles render on top of the game canvas, so there's no easy way to skip the full redraw.

**Current flow (lines 1077-1097):**
```js
const needsRedraw = visualDirty || particles.length > 0 || flashOverlay || shakeTimer > 0 || ...;
if (needsRedraw) {
    visualDirty = false;
    // shake save/translate
    drawGame(t);
    // shake restore
}
// Render particles on top
for (const p of particles) { ... }
```

Since `drawGame(t)` redraws EVERYTHING (including tween interpolation based on elapsed time), we can't easily cache a background frame.

**Recommendation for v5:** Defer this optimization. The complexity of caching a background frame and correctly compositing it with particle overlays is high for relatively low gain (particles are typically short-lived). Instead, focus on:

### 2d. Batch Particle Alpha Tiers (Deferred alternative)

Rather than caching the game frame, reduce `globalAlpha` churn by batching particles into alpha tiers:

```js
// In animateVisuals, instead of per-particle globalAlpha:
const alphaBuckets = [0.1, 0.3, 0.5, 0.7, 0.9];
for (const bucket of alphaBuckets) {
    ctx.globalAlpha = bucket;
    for (const p of particles) {
        const alpha = Math.max(0, p.life);
        if (Math.abs(alpha - bucket) < 0.1) {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
    }
}
ctx.globalAlpha = 1;
```

This reduces `ctx.globalAlpha` sets from O(n) to O(5). Deferred — only if profiling shows globalAlpha churn as a bottleneck.

### 2e. Particle Upper Bound

**Problem:** `spawnParticles()` (lines 1033-1046) has no upper bound. A death with the "Fireworks" effect (50 particles) + trail spawns (2-3 particles per tick) can accumulate thousands of particles, causing frame drops.

**Fix:** Add early return guard:
```js
function spawnParticles(x, y, count, color) {
    if (particles.length > 500) return; // <-- NEW
    for (let i = 0; i < count; i++) {
        // ... existing code
    }
}
```

### 2f. Cache XP Bar Math

**Problem:** The XP bar (lines 1617-1644) recomputes `xpForThisLevel` and `xpForPrevLevel` every frame using `O(1)` formulas, but these values change only when level changes.

**Fix:** Cache in module variables:
```js
let cachedLevel = 0;
let cachedXpForThisLevel = 0;
let cachedXpForPrevLevel = 0;

function updateXpCache() {
    if (level === cachedLevel) return;
    cachedLevel = level;
    cachedXpForThisLevel = 100 * level * (level + 1) / 2;
    cachedXpForPrevLevel = level > 1 ? 100 * (level - 1) * level / 2 : 0;
}
```

Call `updateXpCache()` in `awardXP()` (which is the only place level changes). Then `drawXPBar()` reads cached values.

### 2g. Unnecessary DOM Writes in rAF

**Problem:** Lines 1132-1135 execute every rAF frame unconditionally:
```js
const xpEl = document.getElementById('xpDisplay');
if (xpEl) {
    xpEl.style.display = 'none'; // <-- set 60/sec even when already hidden
}
```

And lines 1127-1131 set `comboEl.textContent` unnecessarily in idle/gameover states (still sets empty string even when already empty).

**Fix:** Guard with value-change checks:
```js
// In animateVisuals:
if (comboDisplayEl) {
    const comboText = comboCount > 0 ? 'x' + (1 + comboCount * 0.5).toFixed(1) + ' COMBO!' : '';
    if (comboDisplayEl.textContent !== comboText) {
        comboDisplayEl.textContent = comboText;
    }
}
if (xpDisplayEl && xpDisplayEl.style.display !== 'none') {
    xpDisplayEl.style.display = 'none';
}
```

The combo check uses cached reference (from 1c) and avoids string allocation on most frames (when combo is same).

## Package 3: Bug Fixes

**Rationale:** Real bugs that affect gameplay — power-up despawn, food generation, speed boost closure, rival softlock, Zen death counter.

### 3a. Power-Up Pickup Despawn

**Problem:** Once `spawnPowerUpPickup()` places a pickup (line 448-463), it stays indefinitely. The spawn timer (lines 1996-2002) checks `!powerUpPickup`, so once a pickup exists, no more can spawn. If the pickup is placed in an inaccessible location (e.g., corner the snake can't reach), it permanently blocks the power-up system.

**Fix:** Add a despawn timer:

```js
let powerUpDespawnCounter = 0;
const POWERUP_DESPAWN_TICKS = 125; // ~15s at 120ms tick

// In spawnPowerUpPickup():
powerUpDespawnCounter = POWERUP_DESPAWN_TICKS;

// In updateGame(), add:
if (powerUpPickup) {
    powerUpDespawnCounter--;
    if (powerUpDespawnCounter <= 0) {
        powerUpPickup = null;
        powerUpSpawnCounter = 0; // reset spawn timer for consistent spacing
    }
}
```

**Visual feedback:** When < 20 ticks remaining (~3s), make the pickup pulse/blink by adjusting its alpha in `drawPowerUpPickup()`. Pass `renderTime` (from 2b) to modulate blink frequency:
```js
function drawPowerUpPickup() {
    if (!powerUpPickup) return;
    const ticksLeft = powerUpDespawnCounter / POWERUP_DESPAWN_TICKS;
    const alpha = ticksLeft < 0.2
        ? (Math.sin(renderTime / 80) * 0.5 + 0.5) * 0.8 + 0.2  // blink
        : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    // ... existing drawing code
    ctx.restore();
}
```

**Also fix:** Reset `powerUpSpawnCounter` in `deactivatePowerUp()` (line 497) to ensure consistent spacing after a power-up expires:
```js
function deactivatePowerUp() {
    // ... existing code
    powerUpSpawnCounter = 0; // <-- NEW
}
```

### 3b. Food Generation Iteration Limit

**Problem:** `generateFood()` (lines 421-446) uses a `do-while` loop with no iteration limit. On a near-full board (snake length 50+ with obstacles and rival), the random coordinates can collide thousands of times before finding a free tile. In the worst case, the loop never terminates (though the board-full guard at line 424 should catch this — but the guard checks `currentSnake.length + obstacles.length + rivalLength >= totalTiles`, which is a strict >=, so one food tile is always "reserved").

**Fix:** Add a maximum iteration counter with linear scan fallback:

```js
function generateFood(currentSnake) {
    const totalTiles = (CANVAS_WIDTH / TILE_SIZE) * (CANVAS_HEIGHT / TILE_SIZE);
    const rivalLength = rivalActive ? rivalSnake.length : 0;
    if (currentSnake.length + obstacles.length + rivalLength >= totalTiles) return null;
    
    const MAX_ITERATIONS = 200;
    let iterations = 0;
    let newFood;
    do {
        if (iterations++ > MAX_ITERATIONS) {
            // Linear scan fallback: collect free tiles
            const freeTiles = [];
            const gridW = CANVAS_WIDTH / TILE_SIZE;
            const gridH = CANVAS_HEIGHT / TILE_SIZE;
            for (let x = 0; x < gridW; x++) {
                for (let y = 0; y < gridH; y++) {
                    const px = x * TILE_SIZE;
                    const py = y * TILE_SIZE;
                    if (currentSnake.some(s => s.x === px && s.y === py)) continue;
                    if (obstacles.some(o => o.x === px && o.y === py)) continue;
                    if (rivalActive && rivalSnake.some(s => s.x === px && s.y === py)) continue;
                    freeTiles.push({ x: px, y: py });
                }
            }
            if (freeTiles.length === 0) return null;
            const tile = freeTiles[Math.floor(Math.random() * freeTiles.length)];
            // Still assign a food type
            return {
                x: tile.x,
                y: tile.y,
                type: pickRandomFoodType()
            };
        }
        
        const rand = Math.random();
        let type = 'common';
        let cumulative = 0;
        for (const typeKey in FOOD_TIERS) {
            cumulative += FOOD_TIERS[typeKey].weight;
            if (rand < cumulative) { type = typeKey; break; }
        }
        
        newFood = {
            x: Math.floor(Math.random() * (CANVAS_WIDTH / TILE_SIZE)) * TILE_SIZE,
            y: Math.floor(Math.random() * (CANVAS_HEIGHT / TILE_SIZE)) * TILE_SIZE,
            type: type
        };
    } while (
        currentSnake.some(segment => segment.x === newFood.x && segment.y === newFood.y) ||
        obstacles.some(o => o.x === newFood.x && o.y === newFood.y) ||
        (rivalActive && rivalSnake.some(s => s.x === newFood.x && s.y === newFood.y))
    );
    return newFood;
}

function pickRandomFoodType() {
    const rand = Math.random();
    let cumulative = 0;
    for (const typeKey in FOOD_TIERS) {
        cumulative += FOOD_TIERS[typeKey].weight;
        if (rand < cumulative) return typeKey;
    }
    return 'common';
}
```

This combines the fast random approach for normal board states with a guaranteed-termination linear scan for near-full boards. The linear scan is O(n*m) = O(400) for a 20x20 grid, which is negligible.

### 3c. Speed Food Restore Closure Race

**Problem:** Lines 1907-1917:
```js
if (eatenType === 'speed') {
    tickInterval = Math.max(MIN_SPEED, getSpeed() - 30);
    restartGameInterval(tickInterval);
    const ci = gameInterval;
    setTimeout(() => {
        if (gameInterval === ci && gameState === 'playing') {
            tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed();
            restartGameInterval(tickInterval);
        }
    }, 2000);
}
```

The closure captures `ci = gameInterval`. If the game is paused/resumed during the 2-second window, `gameInterval` is reassigned by `restartGameInterval()`, so `gameInterval === ci` evaluates to false, and the restore never fires. The game is left at a permanently boosted speed.

**Fix:** Replace setTimeout closure with a counter-based approach:

```js
let speedBoostCounter = 0;
const SPEED_BOOST_TICKS = 16; // ~2s at 120ms tick

// In eat block (speed food case):
if (eatenType === 'speed') {
    tickInterval = Math.max(MIN_SPEED, getSpeed() - 30);
    restartGameInterval(tickInterval);
    speedBoostCounter = SPEED_BOOST_TICKS;
}

// In updateGame(), add at top or in a dedicated section:
if (speedBoostCounter > 0) {
    speedBoostCounter--;
    if (speedBoostCounter === 0) {
        tickInterval = getEffectiveSpeed();
        restartGameInterval(tickInterval);
    }
}
```

**Why this works:** `speedBoostCounter` is tracked by tick count, not wall-clock time. Pausing the game stops the setInterval, so the counter doesn't decrement during pause. Resuming continues from where it left off. The counter survives interval reassignment because it's not closure-capturing `gameInterval`.

**Edge case:** Speed boost + slowMo. If slowMo is active when speed food is eaten:
1. Speed food sets `tickInterval = getSpeed() - 30` (even faster than usual)
2. After 16 ticks, restore sets `tickInterval = getEffectiveSpeed()` which accounts for slowMo (getSpeed() * 2)

This is correct behavior — the speed boost overrides slowMo while active, and restore properly considers slowMo.

**Edge case:** Speed boost while another speed boost is active. The counter resets to `SPEED_BOOST_TICKS` on each speed food eat, extending the boost duration. This matches the original behavior via setTimeout (each eat creates a new timeout without clearing the old one — the counter approach naturally handles this: only the latest counter matters).

### 3d. Rival Eats Last Food Softlock

**Problem:** Lines 857-868 (inside `updateRival()`):
```js
if (food && rNewHead.x === food.x && rNewHead.y === food.y) {
    const combinedSnake = snake.concat(rivalSnake);
    const newFood = generateFood(combinedSnake);
    if (newFood) {
        if (rivalSnake.length < RIVAL_MAX_LENGTH) {
            rivalSnake.push(rTail);
        }
        food = newFood;
        playSound('eat');
    }
    // If board is full, rival doesn't eat the food — food stays on board
}
```

When `generateFood(combinedSnake)` returns null (board full), `food` stays at the old position. The rival's head is now at that position (unshifted at line 855). On subsequent ticks:

1. `updateRival()` runs; rival tries to pathfind toward food (which is at its own head — distance 0)
2. Direction calculation at line 788 produces `dx: 0, dy: 0` (or reverts to current direction)
3. Food is visible but inaccessible (under rival body)
4. Player can't reach the food
5. `generateFood` is never called again (it's only called when player eats, at line 1920)
6. Game enters a deadlock state with no new food spawning

**Fix:** When rival eats food and `generateFood` returns null, explicitly set `food = null`:

```js
if (food && rNewHead.x === food.x && rNewHead.y === food.y) {
    const combinedSnake = snake.concat(rivalSnake);
    const newFood = generateFood(combinedSnake);
    if (newFood) {
        if (rivalSnake.length < RIVAL_MAX_LENGTH) {
            rivalSnake.push(rTail);
        }
        food = newFood;
        playSound('eat');
    } else {
        // Board is full — food disappears, rival doesn't grow
        food = null;
    }
}
```

Then, remove the early `if (!food) return;` guard at line 2015 (which is a redundant check that skips the rest of `updateGame` when food is null):

```js
// In updateGame(), lines 2013-2016:
if (rivalActive) {
    updateRival();
    // REMOVED: if (!food) return; — let the game continue even without food
}
```

And add a passive food regeneration mechanism at the end of `updateGame()`:

```js
// At end of updateGame(), before visualDirty = true:
if (!food && gameState === 'playing') {
    const combinedSnake = snake.concat(rivalActive ? rivalSnake : []);
    const newFood = generateFood(combinedSnake);
    if (newFood) food = newFood;
}
```

This ensures food is eventually regenerated when board space opens (e.g., snake dies, rival dies, or the player dies from collision).

### 3e. EndZenSession Death Count

**Problem:** `endZenSession()` (lines 958-965) calls `finalizeSession()` which unconditionally increments `stats.totalDeaths++` (line 908). In Zen mode, the player explicitly quits — this is not a death.

**Fix:** Add an `isVoluntary` parameter to `finalizeSession()`:

```js
function finalizeSession(isVoluntary) {
    sessionTimeAlive = Date.now() - sessionStartTime - sessionPausedTime;
    stats.gamesPlayed++;
    stats.totalScore += score;
    if (!isVoluntary) stats.totalDeaths++; // <-- conditional
    stats.totalTimePlayed += sessionTimeAlive;
    if (score > stats.maxScore) stats.maxScore = score;
    if (sessionTimeAlive > stats.longestTimeAlive) stats.longestTimeAlive = sessionTimeAlive;
    if (snake.length > stats.longestLength) stats.longestLength = snake.length;
    saveAllState();
    if (score > (modeHighScores[gameMode] || 0)) {
        modeHighScores[gameMode] = score;
        saveManager.setJSON('snake_mode_highs', modeHighScores);
    }
    drawGame(1);
    visualDirty = true;
}
```

Update callers:

```js
// In gameOver():
finalizeSession(false);

// In endZenSession():
finalizeSession(true);
```

**Additionally:** Add `stats.zenSessions++` counter (new field in `getDefaultStats()`) if desired for future achievement tracking. Not required for v5.

## Package 4: Polish & Feedback

**Rationale:** Pure player-facing improvements. Sound, visual feedback, help system, session summary.

### 4a. Level-Up Visual Flash

**Problem:** Leveling up (1-20) currently shows only a text toast via `queueToast()` (line 2152). The Snap mode has a visually prominent "LEVEL N!" gold text animation (`snapLevelUpFlash`, lines 1106-1116) but regular level-ups have no corresponding visual fanfare.

**Fix:** Create a reusable `levelUpFlash` mechanism similar to `snapLevelUpFlash`:

```js
let levelUpFlash = 0; // countdown timer in ms

// In awardXP(), when level increases:
if (newLevel > level) {
    level++;
    levelUpFlash = 1500; // show for 1.5s
    showLevelUpToast(level);
    checkLevelUnlocks(level);
}
```

**In animateVisuals()**, render the flash:
```js
if (levelUpFlash > 0) {
    levelUpFlash = Math.max(0, levelUpFlash - delta);
    const alpha = Math.min(1, levelUpFlash / 500);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#FFD700';
    ctx.fillText('🌟 LEVEL ' + level + '! 🌟', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.restore();
}
```

**Gold flash overlay:** Add a gold-tinted flash overlay on level-up:
```js
// In awardXP(), when level increases:
if (newLevel > level) {
    level++;
    levelUpFlash = 1500;
    flashOverlay = { color: '#FFD700', alpha: 0.3 }; // gold flash
    showLevelUpToast(level);
    checkLevelUnlocks(level);
}
```

The flash overlay already handles alpha decay (lines 1069-1072). It will fade naturally from 0.3 to 0 over ~75 frames.

**Edge case:** Prestige resets level to 1. On prestige, don't show level-up flash (the prestige toast is sufficient). Check: `if (newLevel > level && newLevel > 1)` for the flash — level 1 after prestige already had its flash on the original level-up.

### 4b. Achievement Sound

**Problem:** Achievements fire with no audio feedback. The player may miss the toast.

**Fix:** Add `'achievement'` case to `playSound()` (lines 967-1024):
```js
case 'achievement':
    // Ascending arpeggio: C5 -> E5 -> G5, 0.4s total
    osc.frequency.setValueAtTime(523, now);
    osc.frequency.linearRampToValueAtTime(659, now + 0.13);
    osc.frequency.linearRampToValueAtTime(784, now + 0.27);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
    break;
```

Call at line 2200 in `checkAchievements()`:
```js
if (ach.check(stats, ctx)) {
    achievements[id] = Date.now();
    // ...
    showAchievementToast(ach);
    playSound('achievement'); // <-- NEW
    unlockedAny = true;
}
```

**Edge case:** Multiple achievements unlocking at once. Each calls `playSound()` which creates a new oscillator. Multiple arpeggios will play simultaneously — this sounds like a chord, which is acceptable (and even celebratory).

### 4c. Level-Up Sound

**Fix:** Add `'levelup'` case to `playSound()`:
```js
case 'levelup':
    // Two-tone ascending: C5 -> C6, 0.3s
    osc.frequency.setValueAtTime(523, now);
    osc.frequency.linearRampToValueAtTime(1047, now + 0.15);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
    break;
```

Call in `awardXP()` (where level-up is detected, around line 2057-2060):
```js
if (newLevel > level) {
    level++;
    levelUpFlash = 1500;
    playSound('levelup'); // <-- NEW
    showLevelUpToast(level);
    checkLevelUnlocks(level);
}
```

### 4d. Power-Up Activation/Deactivation Sounds

**Fix:** Add two new cases to `playSound()`:
```js
case 'powerup':
    // Quick ascending sweep: 440 -> 880, 0.15s
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
    break;

case 'powerdown':
    // Short descending: 660 -> 330, 0.1s
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
    break;
```

Call in `activatePowerUp()` (line 465-495) and `deactivatePowerUp()` (line 497-507):
```js
function activatePowerUp(type) {
    vibrate(20);
    playSound('powerup'); // <-- NEW
    deactivatePowerUp();
    // ...
}

function deactivatePowerUp() {
    playSound('powerdown'); // <-- NEW
    // ...
}
```

**Edge case:** `deactivatePowerUp()` is called from `activatePowerUp()` (to deactivate any existing power-up before activating a new one). On new activation, both `powerup` and `powerdown` would play. This is fine — the powerdown of the old effect and powerup of the new effect create a clear audio cue for the transition. If it sounds cluttered, add a flag `silentDeactivate` when called from `activatePowerUp()`.

### 4e. Help System Overhaul

**Problem:** The current help system (lines 2495-2508) shows a single-line toast with abbreviated keyboard references. It's hard to read, times out quickly, and provides no visual context (food legend, game mode info, prestige mechanics).

**Fix:** Replace with a canvas-drawn overlay showing ALL controls and references in a readable grid.

**New H key handler (replaces lines 2495-2508):**
```js
let helpOverlayVisible = false;

if (e.key === 'h' || e.key === 'H') {
    helpOverlayVisible = !helpOverlayVisible; // toggle
    drawGame(1);
    return;
}
```

**New drawHelpOverlay() function:**
```js
function drawHelpOverlay() {
    if (!helpOverlayVisible) return;
    
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    const col1X = 15;
    const col2X = 210;
    let y = 15;
    const lineH = 19;
    const headerH = 24;
    
    // Title
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('CONTROLS & INFO', CANVAS_WIDTH / 2, y);
    y += headerH + 5;
    
    ctx.textAlign = 'left';
    ctx.font = '12px Arial';
    
    // Column 1
    let y1 = y;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('CONTROLS', col1X, y1);
    ctx.font = '12px Arial';
    y1 += lineH;
    
    const controls = [
        ['Arrows / WASD', 'Move snake'],
        ['P / Space', 'Pause / Resume'],
        ['Enter', 'Start / Restart'],
        ['Esc', 'Back to menu'],
        ['M', 'Toggle mute'],
        ['H', 'Toggle this help'],
        ['Tab', 'Stats panel'],
        ['F', 'Achievements'],
        ['C', 'Cosmetics'],
        ['X', 'Prestige (Lv.20+)'],
        ['L', 'Food legend (menu)'],
    ];
    
    ctx.fillStyle = '#CCC';
    for (const [key, action] of controls) {
        ctx.fillStyle = '#FFD700';
        ctx.fillText(key, col1X, y1);
        const keyWidth = ctx.measureText(key).width;
        ctx.fillStyle = '#888';
        ctx.fillText('  ' + action, col1X + keyWidth + 2, y1);
        y1 += lineH;
    }
    
    // Column 2
    let y2 = y;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('FOOD TIERS', col2X, y2);
    ctx.font = '12px Arial';
    y2 += lineH;
    
    const foods = [
        ['Common', '10pts / 25XP / 40%'],
        ['Uncommon', '15pts / 30XP / 25%'],
        ['Rare', '20pts / 40XP / 12%'],
        ['Epic', '50pts / 70XP / 3%'],
        ['Bonus', '30pts / 60XP / 15%'],
        ['Speed', '5pts / 40XP / 5%'],
    ];
    
    for (const [name, info] of foods) {
        ctx.fillStyle = FOOD_TIERS[name.toLowerCase()]?.color || '#FFF';
        ctx.fillText(name, col2X, y2);
        ctx.fillStyle = '#888';
        ctx.fillText('  ' + info, col2X + ctx.measureText(name).width + 4, y2);
        y2 += lineH;
    }
    
    y2 += 5;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('GAME MODES', col2X, y2);
    ctx.font = '12px Arial';
    y2 += lineH;
    
    for (const mode of MODE_ORDER) {
        const cfg = MODE_CONFIG[mode];
        ctx.fillStyle = '#CCC';
        ctx.fillText(cfg.name, col2X, y2);
        ctx.fillStyle = '#888';
        ctx.fillText('  ' + getModeDesc(mode), col2X + ctx.measureText(cfg.name).width + 4, y2);
        y2 += lineH;
    }
    
    // Footer
    if (prestigeLevel > 0) {
        const footerY = CANVAS_HEIGHT - 50;
        ctx.fillStyle = '#FFD700';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Prestige ' + prestigeLevel + ' — Multiplier active', CANVAS_WIDTH / 2, footerY);
    }
    
    ctx.fillStyle = '#555';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Press H or ESC to close', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 15);
    
    ctx.restore();
}
```

**Integrate into drawGame():** Call `drawHelpOverlay()` at the very end (after overlays):
```js
function drawGame(t) {
    // ... all existing draws
    drawOverlay(...); // existing overlay for pause/gameover/idle
    drawHelpOverlay(); // <-- NEW, draws on top of everything
}
```

**Accessibility:** Works in all game states (idle, playing, paused, gameover). Toggle on/off via H key. Closes automatically when starting a new game or on gameover transition.

### 4f. End-of-Game Session Summary

**Problem:** After gameover, the overlay shows "Score: X | Press ENTER to Restart" (line 1762). No session highlights or replay motivation.

**Fix:** Add a session summary overlay that displays after gameover for a few seconds, showing key stats.

```js
let sessionSummaryTimer = 0;
let sessionSummary = null;

// In gameOver(), after finalizeSession():
sessionSummary = {
    timeSurvived: sessionTimeAlive,
    foodEaten: sessionFoodEaten,
    foodTypes: sessionFoodTypes.size,
    maxCombo: sessionMaxCombo,
    xpEarned: sessionXP,
    score: score,
    length: snake.length,
};
sessionSummaryTimer = 3000; // show for 3s, then fade to normal overlay

// In animateVisuals():
if (sessionSummaryTimer > 0) {
    sessionSummaryTimer = Math.max(0, sessionSummaryTimer - delta);
}

// In drawOverlay(), after the existing gameover text:
if (gameState === 'gameover' && sessionSummary && sessionSummaryTimer > 0) {
    const alpha = Math.min(1, sessionSummaryTimer / 500); // fade out in last 0.5s
    ctx.save();
    ctx.globalAlpha = alpha;
    
    const yBase = CANVAS_HEIGHT / 2 + 55;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SESSION SUMMARY', CANVAS_WIDTH / 2, yBase);
    
    ctx.fillStyle = '#CCC';
    ctx.font = '12px Arial';
    const stats = [
        'Time: ' + Math.floor(sessionSummary.timeSurvived / 1000) + 's',
        'Food: ' + sessionSummary.foodEaten + ' (' + sessionSummary.foodTypes + ' types)',
        'Max Combo: ' + sessionSummary.maxCombo + 'x',
        'Length: ' + sessionSummary.length,
        'XP Earned: ' + sessionSummary.xpEarned,
    ];
    for (let i = 0; i < stats.length; i++) {
        ctx.fillText(stats[i], CANVAS_WIDTH / 2, yBase + 20 + i * 18);
    }
    
    // Next achievement hint
    const nextAch = findNextAchievement();
    if (nextAch) {
        ctx.fillStyle = '#9B59B6';
        ctx.font = '11px Arial';
        ctx.fillText('Next: ' + nextAch.name + ' — ' + nextAch.desc + ' (+' + nextAch.xp + ' XP)', CANVAS_WIDTH / 2, yBase + 20 + stats.length * 18 + 8);
    }
    
    ctx.restore();
}
```

**findNextAchievement helper:** Return the first incomplete achievement (simplest implementation):
```js
function findNextAchievement() {
    const mc = MODE_CONFIG[gameMode];
    if (!mc.achievementsEnabled) return null;
    for (const id in ACHIEVEMENTS) {
        if (!achievements[id]) return ACHIEVEMENTS[id];
    }
    return null;
}
```

## Package 5: Mobile & Accessibility

**Rationale:** Lowest risk, highest gratitude from mobile players. Vibration exists but is incomplete. HUD text scaling is missing. Touch feedback is minimal.

### 5a. Vibration Feedback

**Problem:** Vibration exists for eat (15ms), death (30ms), and power-up activation (20ms) — but not for achievement unlock or level-up. The debounce (300ms) is already in place.

**Current vibrate calls:**
- Line 466: `activatePowerUp()` — 20ms
- Line 941: `gameOver()` — 30ms
- Line 1904: eat block — 15ms

**Add:**
- Line 2200 (achievement unlock): `vibrate(50)` — distinct longer buzz
- In `awardXP()` level-up: `vibrate(40)` — celebratory
- In `deactivatePowerUp()`: `vibrate(15)` — brief acknowledgment

The existing 300ms debounce on `lastVibrateTime` (line 414) prevents buzz fatigue when multiple events fire in quick succession (e.g., achievement + level-up at same time).

### 5b. HUD Text Size Scaling

**Problem:** On mobile, the 400x400 canvas is CSS-scaled down to fit smaller screens. HUD text (9px-14px in the canvas) becomes illegible when the canvas is rendered at 250px physical width.

**Fix:** Add a detection check and scale HUD font sizes accordingly:

```js
const isMobile = window.innerWidth < 500 || ('ontouchstart' in window && window.innerWidth < 700);
const HUD_SCALE = isMobile ? 1.3 : 1.0; // 1.3x font sizes on mobile
```

Then use `HUD_SCALE` multiplier in all canvas font size specifications. Since fonts are specified as strings like `'bold 9px Arial'`, use a helper:

```js
function hudFont(weight, size, family) {
    return (weight || '') + ' ' + Math.round(size * HUD_SCALE) + 'px ' + (family || 'Arial');
}

// Usage:
ctx.font = hudFont('bold', 9); // -> 'bold 12px Arial' on mobile
ctx.font = hudFont('bold', 18); // -> 'bold 23px Arial' on mobile
```

**Affected draw functions:** All sub-functions extracted in 1b that set `ctx.font`:
- `drawTimeAttackHUD()`: 18px -> 23px
- `drawSnapHUD()`: 14px, 9px -> 18px, 12px
- `drawDailyHUD()`: 11px, 10px -> 14px, 13px
- `drawPowerUpHUD()`: 11px -> 14px
- `drawRivalHUD()`: 12px -> 16px
- `drawXPBar()`: 9px -> 12px
- `drawOverlay()`: various sizes -> scaled proportionally

**Note:** The overlay text (idle menu, pause, gameover) is already at 32px/20px — these are large enough and should not scale (or scale minimally, 1.1x). Only HUD elements need scaling.

### 5c. Touch Indicator Visual Feedback

**Problem:** When a mobile player swipes, there is no visual confirmation that the gesture was registered. Swipes can feel unresponsive if the direction change is subtle.

**Fix:** Add a brief flash/tint effect on swipe detection:

```js
let touchIndicatorTimer = 0;

// In touchend handler (line 2574-2617), when a valid swipe is detected:
if (gameState === 'playing') {
    setNextDirection(newDx, newDy);
    touchIndicatorTimer = 80; // 80ms indicator
}

// In animateVisuals():
if (touchIndicatorTimer > 0) {
    touchIndicatorTimer = Math.max(0, touchIndicatorTimer - delta);
}

// Draw the indicator in drawGame() or after particle layer:
function drawTouchIndicator() {
    if (touchIndicatorTimer <= 0) return;
    const alpha = touchIndicatorTimer / 80;
    ctx.save();
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = '#4488FF';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.restore();
}
```

**Reuse eatAnimTimer?** The `eatAnimTimer` (line 1888) is already used for food-eat animations. Better to add a new `touchIndicatorTimer` to avoid conflicting semantics.

## Implementation Order

### Phase 1: Package 1 — Architectural Refactoring

**Rationale:** Clean before optimizing. Speed centralization, DOM caching, localStorage consolidation. These are safe changes with low risk.

| Step | Change | File impact | Risk |
|------|--------|-------------|------|
| 1 | Add `getEffectiveSpeed()` (1a) | Insert ~3 lines; update 7 call sites | Low — pure substitution |
| 2 | Extract drawGame sub-functions (1b) | Move ~80 lines into 8 named functions | Low — pure extraction |
| 3 | Cache DOM references (1c) | Add ~8 const declarations; update ~40 call sites | Low — replaces getElementById with const |
| 4 | Consolidate localStorage (1d) | Add saveManager; update 38+ call sites | Low — try/catch wrapping unchanged |
| 5 | Guard shake save/restore (1e) | Change 2 condition checks to guard var | Low — same behavior |
| 6 | Prestige endgame (1f) | Add cap check + UI display | Low — new safe guard |

### Phase 2: Package 2 — Performance Optimization

**Rationale:** After cleanup, optimize hot paths. Grid cache, Date.now removal, particle limit.

| Step | Change | File impact | Risk |
|------|--------|-------------|------|
| 1 | Offscreen canvas for grid (2a) | Add ~30 lines; modify drawGrid | Low-Med — offscreen canvas may have edge cases |
| 2 | Eliminate Date.now() in render (2b) | Add renderTime; update 4 color functions | Low — pure substitution |
| 3 | Particle upper bound (2e) | Add 1-line guard | Low |
| 4 | Cache XP bar math (2f) | Add 3 module vars + cache function | Low |
| 5 | Guard DOM writes (2g) | Add value-change checks | Low |

### Phase 3: Package 3 — Bug Fixes

**Rationale:** Real bugs that affect gameplay.

| Step | Change | File impact | Risk |
|------|--------|-------------|------|
| 1 | Power-up despawn (3a) | Add ~15 lines for timer + visual | Low — new safe feature |
| 2 | Food iteration limit (3b) | Modify generateFood logic | Low-Med — changes food generation algorithm |
| 3 | Speed boost restore (3c) | Replace setTimeout with counter | Low-Med — new state variable |
| 4 | Rival food softlock (3d) | Modify updateRival + updateGame | Low-Med — fixes stale food state |
| 5 | Zen death count (3e) | Add parameter to finalizeSession | Low — parameter addition |

### Phase 4: Package 4 — Polish & Feedback

**Rationale:** Pure player-facing improvements.

| Step | Change | File impact | Risk |
|------|--------|-------------|------|
| 1 | Level-up flash (4a) | Add levelUpFlash var + render | Low — new visual only |
| 2 | Achievement sound (4b) | Add playSound case + call site | Low |
| 3 | Level-up sound (4c) | Add playSound case + call site | Low |
| 4 | Power-up sounds (4d) | Add 2 playSound cases + call sites | Low |
| 5 | Help overlay (4e) | ~80 lines of canvas rendering | Low-Med — overlay only |
| 6 | Session summary (4f) | ~50 lines for overlay | Low |

### Phase 5: Package 5 — Mobile & Accessibility

**Rationale:** Fits everywhere; lowest risk.

| Step | Change | File impact | Risk |
|------|--------|-------------|------|
| 1 | Vibration feedback (5a) | Add 2-3 call sites | Low |
| 2 | HUD text scaling (5b) | Add hudFont helper; update ~15 call sites | Low — font scaling only |
| 3 | Touch indicator (5c) | Add ~15 lines | Low |

## Testing and Verification

### Per-Package Verification

**Phase 1 (Refactoring):**
- Speed: Verify `getEffectiveSpeed()` returns same values as inline formula in all 7 locations
- Draw separation: Each extracted function produces identical output to original inline code
- DOM cache: No `document.getElementById` remains in rAF hot path
- localStorage: All 13 keys read/written correctly after saveManager introduction
- Prestige: Verify cap at 5, verify "Max Prestige" toast, verify prestige displays in HUD

**Phase 2 (Performance):**
- Grid cache: Verify identical grid appearance with cached canvas; verify cache invalidates on theme change
- Date.now elimination: Verify animations (bonus pulse, rainbow hue) are visually indistinguishable
- Particle cap: Spawn 501+ particles; verify no more than 500 exist at once
- DOM writes: Verify `textContent` and `style.display` only change when value actually changes

**Phase 3 (Bug Fixes):**
- Power-up despawn: Spawn pickup; wait 15s; verify it disappears and can respawn
- Food iteration: Test on near-full board (40+ length); verify food generation completes quickly
- Speed restore: Eat speed food; pause/resume within 2s; verify speed restores to normal
- Rival food: Fill board; observe rival eats last food; verify game doesn't softlock
- Zen death: End Zen session; verify `stats.totalDeaths` unchanged

**Phase 4 (Polish):**
- All new sounds play correctly across muted/unmuted states
- Help overlay toggle works in all game states
- Session summary appears on gameover and fades correctly

**Phase 5 (Mobile):**
- Vibration fires on achievement/level-up (test on supported device)
- HUD text is legible on 320px-wide viewport
- Touch indicator flash visible on swipe

### Automated Test Considerations

The game is a single-file HTML/JS/CSS with no test framework. For manual testing:

1. Open `snake.html` in browser
2. For each change, verify the specific behavior described above
3. For performance, use Chrome DevTools Performance tab: measure frame duration before/after grid cache
4. For Date.now changes, verify no `Date.now()` calls appear in flame chart during rAF

## Success Criteria

1. All 7 speed formula locations use `getEffectiveSpeed()` with identical output values
2. `drawGame()` is reduced from ~160 lines to ~25 lines (delegating entirely to sub-functions)
3. Zero `document.getElementById()` calls in rAF hot path (comboDisplay, xpDisplay use cached refs)
4. All 38+ localStorage access patterns consolidated to saveManager calls
5. Canvas save/restore in shake block uses guard variable
6. Prestige caps at 5 with "Max Prestige" message and multiplier display
7. Grid redraws only on theme change (single drawImage per frame otherwise)
8. Zero `Date.now()` calls in render path — all use `renderTime` from rAF timestamp
9. Particle count never exceeds 500
10. XP bar math computes once per level, not once per frame
11. Speed food boost survives pause/resume (counter-based, not closure-based)
12. Power-up pickup despawns after 15s with blinking visual
13. Food generation never exceeds 200 iterations (linear fallback)
14. Rival eating last food on full board doesn't softlock the game
15. Voluntarily ending Zen doesn't increment `stats.totalDeaths`
16. Level-up shows gold flash + "LEVEL N!" text overlay + two-tone ascending sound
17. Achievement unlock plays ascending arpeggio
18. Power-up activation/deactivation play sweep sounds
19. Help overlay shows all controls in readable grid, works from any state
20. Session summary appears on gameover with stats + next achievement hint
21. Vibration fires on achievement/level-up/death/power-up with 300ms debounce
22. HUD text is legible on mobile (hudFont helper with scaling)
23. Touch swipe shows brief visual indicator

## Descoped Items (Not in v5)

- **Multi-file restructuring** — The game stays single-file. Module extraction would introduce bundling/loading concerns beyond the scope of this cleanup iteration.
- **Full particle layer separation** (2c) — Complexity of cached background + particle compositing is high. Deferred to v6 if profiling shows need.
- **React/TypeScript migration** — Entirely new tech stack. Not appropriate for a refactoring iteration.
- **New game modes** — Explicitly excluded by scope constraints.
- **New food types or power-ups** — Explicitly excluded.
- **Rebalancing** — Explicitly excluded (XP values, food weights, power-up durations, speed curves).
- **WebGL rendering** — The canvas 2D API is sufficient. WebGL would increase complexity without proportional benefit for a 400x400 grid game.
- **Online multiplayer** — Would require server infrastructure. Not appropriate for a single-file game.
- **Service worker / PWA** — Adds caching complexity. Could be considered after refactoring.

## Post-Review Amendments (2026-05-18)

The following amendments address critical findings from three independent reviews of this design document. Each finding is cross-referenced to the relevant design section. The original document text above remains unchanged; these amendments supplement it.

---

### Critical Fixes

**A. `renderTime` incompatibility (Review finding on Section 2b)**

- **Problem:** `renderTime` (as defined in Section 2b, line 374) is a `performance.now()` timestamp sourced from the rAF callback, not a `Date.now()` epoch. It cannot replace `Date.now()` in wall-clock computations such as `timeAttackEnd - Date.now()` (used in the Time Attack HUD at current line 1676).
- **Fix (update to Section 2b):** Keep `Date.now()` at line 1676 for the Time Attack HUD remaining-time display. Replace `Date.now()` with `renderTime` ONLY for non-wall-clock cosmetic uses:
  - `Math.sin(Date.now() / 200)` at line 1330 (bonus food pulse)
  - Rainbow snake hue at line 1491
  - `TRAIL_RENDER_CONFIG` color functions at lines 330-331
- **Clarify `renderTime` source:** `renderTime` is set at the top of `animateVisuals()` as `const renderTime = timestamp || performance.now()`. The rAF provides `timestamp` automatically; `performance.now()` serves as a fallback. Document this in the code.

**B. Speed boost cancels on intermediate food eat (Review finding on Section 3c)**

- **Problem:** When `speedBoostCounter > 0` (speed boost is active) and the player eats a non-speed food, lines 1922-1925 (`tickInterval = getEffectiveSpeed()`) reset the interval back to normal speed, prematurely cancelling the active speed boost.
- **Fix (update to Section 3c):** After the existing lines 1922-1925, insert a guard:
  ```js
  if (speedBoostCounter > 0) tickInterval = preBoostInterval;
  ```
  This restores the boosted speed interval after the normal eat handler tries to reset it.
- **Simpler alternative:** Wrap lines 1922-1925 in `else if (speedBoostCounter <= 0)` so the normal speed restoration only fires when no speed boost is active.

**C. Passive food regeneration needs cooldown (Review finding on Section 3d)**

- **Problem:** The proposed passive food regeneration at the end of `updateGame()` (`if (!food) generateFood(...)`) runs every game tick (50-120ms). On near-full boards where the linear scan fallback executes, this triggers an expensive O(n*m) scan every 50-120ms.
- **Fix (update to Section 3d line 730):** Gate the regeneration with a tick counter:
  ```js
  if (!food && gameTick % 10 === 0 && gameState === 'playing') {
  ```
  This limits food regeneration attempts to every 10th tick (~0.5-1.2s depending on game speed), reducing the performance impact on near-full boards from continuous scanning to periodic scanning.

**D. `saveManager` preserves per-site validation (Review finding on Section 1d)**

- **Problem:** `saveManager.getJSON('snake_unlocks')` returns `[]` (empty array) as a truthy value. The current `loadUnlocked()` correctly validates with `Array.isArray(data) && data.length > 0`, but the proposed saveManager design (Section 1d) removes this validation by relying on `|| getDefault()` fallback, which would treat `[]` as non-falsy and pass through invalid data.
- **Fix (update to Section 1d):** Add an optional `validator` parameter to `getJSON`:
  ```js
  getJSON(key, defaultVal, validator) {
      try {
          const val = localStorage.getItem(key);
          if (val === null) return defaultVal;
          const parsed = JSON.parse(val);
          return validator ? (validator(parsed) ? parsed : defaultVal) : parsed;
      } catch(e) { return defaultVal; }
  },
  ```
  Each call site passes its existing validation logic. The default validator (when omitted) is `v => v !== null && v !== undefined`.
- **Example:**
  ```js
  // loadUnlocked():
  return saveManager.getJSON('snake_unlocks', [], v => Array.isArray(v) && v.length > 0);
  ```

---

### Medium Fixes

**E. `deactivatePowerUp` speed ordering (Review finding on Section 1a)**

- **Problem:** In `deactivatePowerUp()`, line 499 computes `tickInterval = getSpeed()` BEFORE `slowMoActive = false` is set at line 504. If `getSpeed()` were replaced with `getEffectiveSpeed()` (as Section 1a proposes), the call would return double the intended speed because `slowMoActive` is still `true`.
- **Fix (update to Section 1a):** Reorder `deactivatePowerUp()` to set `slowMoActive = false` before computing `tickInterval`. Alternatively, keep `getSpeed()` (not `getEffectiveSpeed()`) at this single location with an explicit comment:
  ```js
  // NOTE: getSpeed() NOT getEffectiveSpeed() — slowMoActive is still true here,
  // and we want the base speed. slowMoActive is set to false on the next line.
  tickInterval = getSpeed();
  slowMoActive = false;
  ```
  The latter approach is safer as it avoids coupling the ordering to `deactivatePowerUp`s internal sequence.

**F. Help overlay draw order (Review finding on Section 4e)**

- **Problem:** Section 4e places `drawHelpOverlay()` inside `drawGame()` (lines 1068-1075). However, the help overlay should be the topmost layer — it must render above particles and the flash overlay, which are drawn in `animateVisuals()` after `drawGame()` returns.
- **Fix (update to Section 4e):** Render the help overlay in `animateVisuals()` after the flash overlay, not inside `drawGame()`. This requires `helpOverlayVisible` to persist across rAF frames (it already does as a module-level boolean). The draw order in `animateVisuals()` becomes:
  1. Shake save/translate
  2. `drawGame(t)` — grid, obstacles, food, snake, particles, overlays
  3. Shake restore
  4. Particle rendering loop
  5. Flash overlay
  6. **`drawHelpOverlay()`** — on top of everything
- Update the integration section (lines 1068-1075) to reflect this: remove the `drawHelpOverlay()` call from `drawGame()` and add it to `animateVisuals()` as the final rendering step.

**G. Add missing polish items from UX review**

The following polish features were identified during UX review as valuable additions that are consistent with the "refactor, polish, no new features" mandate of v5:

1. **Death cause display:** Show what killed the player in the gameover overlay. Track `lastDeathCause` in `gameOver()` with values: `'self-collision'`, `'rival'`, `'snap-shrink'`. Display as a subtitle beneath "GAME OVER", e.g., "You hit yourself!" or "You were caught by the rival!".
2. **Combo milestone flash:** At 3x and 5x combo, play a brief screen flash + sound. Reuse the existing `flashOverlay` mechanism with combo-specific colors (3x: `#44BB44` green, 5x: `#FF8800` orange). Track `lastComboMilestone` to avoid re-triggering on every tick of the same milestone.
3. **Power-up expiration warning:** When `powerUpTimer < 2000ms` (2 seconds remaining), make the power-up HUD bar flicker by modulating its alpha with `Math.sin(renderTime / 60)` in `drawPowerUpHUD()`.
4. **Rare food spawn chime:** Play a short distinguishable sound whenever a rare or epic food type spawns on the board. Add a `'rare_spawn'` case to `playSound()` — a soft ascending chime (two quick notes, 0.2s total). Call it from `generateFood()` when the selected type is `'rare'` or `'epic'`.

**H. Prestige cap ordering (Review finding on Section 1f)**

- **Problem:** The proposed code in Section 1f (lines 279-288) does `prestigeLevel++` before checking the cap. The cap guard at line 281 is correct in the example, but the surrounding narrative says "Add prestige cap at 5" and the code structure must be verified: the increment must NOT happen before the cap check.
- **Fix (update to Section 1f):** Explicitly state the ordering constraint: the cap check must occur BEFORE `prestigeLevel++`. The correct sequence is:
  1. Check `prestigeLevel >= 5` → show max prestige toast → return (NO increment)
  2. Then `prestigeLevel++`
  3. Then reset XP/level
- Update the code block (lines 279-288) to clearly show this ordering.

**I. Particle cap drop graceful (Review finding on Section 2e)**

- **Problem:** The proposed guard `if (particles.length > 500) return;` (Section 2e, line 438) drops the entire particle spawn request when the cap is reached. For large spawns (e.g., 50 particles for Fireworks death effect), this means zero particles are created even if there is capacity for some.
- **Fix (update to Section 2e):** Replace the hard return with a graceful count adjustment:
  ```js
  function spawnParticles(x, y, count, color) {
      count = Math.min(count, 500 - particles.length);
      if (count <= 0) return;
      for (let i = 0; i < count; i++) {
          // ... existing code
      }
  }
  ```
  This spawns as many particles as capacity allows, up to the requested count, rather than dropping the entire spawn. The guard variable name changes from "upper bound" to "graceful cap."

---

### Minor Fixes

**J. Mobile UX additions (Review finding on Section 5)**

A UX audit of the mobile experience identified the following gaps (none represent new features — all are presentation/polish):

1. **D-pad responsive sizing:** The virtual D-pad (Section 5 context) should use CSS `@media` queries to resize for landscape vs. portrait orientations:
   ```css
   @media (orientation: landscape) and (max-height: 500px) {
       #dpad { width: 120px; height: 120px; }
       #dpad .dpad-btn { width: 36px; height: 36px; font-size: 16px; }
   }
   @media (orientation: portrait) and (max-width: 400px) {
       #dpad { width: 140px; height: 140px; }
       #dpad .dpad-btn { width: 42px; height: 42px; font-size: 18px; }
   }
   ```
2. **DOM panel overflow:** Stats, achievements, and cosmetics panels (DOM panels referenced in Section 1c) should have:
   ```css
   max-width: 90vw;
   overflow-y: auto;
   ```
   This prevents panel content from overflowing the viewport on narrow screens.
3. **Colorblind mode:** A colorblind-accessible mode was reviewed and deemed out of scope for v5. Document as a future TODO in the descoped items or a comment in the cosmetics panel code.

**K. Session summary timer guard (Review finding on Section 4f)**

- **Problem:** `sessionSummary` (Section 4f) is set in `gameOver()` but never cleared. If the player starts a new game (calling `startGame()`) after a gameover, the old `sessionSummary` data persists until the next `gameOver()` overwrites it.
- **Fix (update to Section 4f):** Clear `sessionSummary` at the beginning of `startGame()`:
  ```js
  function startGame() {
      sessionSummary = null;
      sessionSummaryTimer = 0;
      // ... rest of startGame
  }
  ```
  This ensures no stale summary data bleeds across sessions.

**L. Sound overlap guard (Review finding on Section 4d)**

- **Problem:** `activatePowerUp()` calls `deactivatePowerUp()` first (Section 4d, line 920). Both functions now play sounds (`playSound('powerup')` and `playSound('powerdown')` respectively), meaning a new power-up activation triggers both the deactivation sound (for the previous power-up) and the activation sound (for the new one) simultaneously.
- **Fix (update to Section 4d):** Add a `silentDeactivate` parameter to `deactivatePowerUp()`:
  ```js
  function deactivatePowerUp(silentDeactivate) {
      if (!silentDeactivate) playSound('powerdown');
      // ... existing deactivation logic
  }
  ```
  Then update the call from `activatePowerUp()`:
  ```js
  function activatePowerUp(type) {
      vibrate(20);
      playSound('powerup');
      deactivatePowerUp(true); // silent — don't play powerdown during activation swap
      // ... activation logic
  }
  ```
  The standalone deactivation path (timer expiry, ESC key) continues to play the sound normally.
