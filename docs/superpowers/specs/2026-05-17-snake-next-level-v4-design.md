# Snake Game — v4: Game Feel & Replayability

## Vision
Transform the polished snake game from a satisfying mini-game into a genuinely replayable mobile-friendly experience with juicy feedback, visual variety, and daily retention hooks — all within a single HTML file.

## Architectural Constants
- Single `snake.html` file (currently 1154 lines)
- Canvas 400×400, 20px tiles (20×20 grid)
- Dual loops: `setInterval` (game tick, 50-120ms) + `requestAnimationFrame` (visuals, 60fps)
- localStorage for persistence
- DOM overlays for panels (stats, achievements, cosmetics, now daily challenge)
- All new features live in the same file with the same coding patterns

## Feature Package (5 Features)

### 1. Screen Juice (Camera Effects & Eating Animation)
**Difficulty:** Low | **Lines:** ~70

Add dynamic screen effects for game feel. Effects ONLY render when `gameState` is `playing` or `gameover` — never during pause.

- **Screen shake on death**: On `gameOver()`, set `shakeTimer = 200` (milliseconds). In `animateVisuals()`, apply random `translate(x, y)` offset with decaying intensity. Uses delta time from rAF timestamp for consistent timing across framerates.
- **Screen flash on eat**: Draw `ctx.fillStyle` overlay on canvas with decaying alpha. On each eat, set `flashOverlay = {color, alpha: 0.4}`. Alpha decays by `delta * 0.004` per rAF frame (≈ 100ms at 60fps). Colors: green for common/uncommon, gold for bonus, cyan for speed, purple for epic.
- **Snake head eating animation**: On eat, set `eatAnimTimer = 150` (ms). In `drawSnake()`, scale head by `1 + 0.2 * (eatAnimTimer / 150)` using `ctx` state. Timer decays via delta time in rAF.

**New state:**
```js
let shakeTimer = 0;          // ms remaining
let flashOverlay = null;     // {color, alpha}
let eatAnimTimer = 0;        // ms remaining
```

**Delta time in rAF:**
```js
let lastFrameTime = 0;
function animateVisuals(timestamp) {
  const delta = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  // Use delta for all timer decay
  if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - delta);
  // ...etc
  requestAnimationFrame(animateVisuals);
}
```

Existing call at line 1151 `requestAnimationFrame(animateVisuals)` passes timestamp automatically.

---

### 2. Touch & Swipe Controls + Mobile Support
**Difficulty:** Medium | **Lines:** ~100

Make the game playable on mobile with touch input, responsive sizing, and a virtual D-pad.

**Swipe detection (canvas only, not document):**
- `touchstart` → record position
- `touchend` → if delta > 30px, determine direction, feed into `nextDirection`
- If delta < 10px (tap): on idle → Enter, on gameover → Enter, on playing → Space (pause)
- `touch-action: none` on canvas via CSS

**Responsive canvas:**
```css
#gameCanvas { max-width: calc(100vw - 20px); max-height: 70vh; width: auto; height: auto; }
```
Internal resolution stays 400×400. CSS scaling handles display.

**Virtual D-pad overlay (shown on touch-capable devices via `@media (pointer: coarse)`):**
- DOM overlay below canvas with 4 arrow buttons + center pause button
- Each button dispatches corresponding `KeyboardEvent('keydown', {key: 'ArrowLeft'})` — reuses existing handler
- Mode selection via swipe-up/swipe-down on idle screen

**Touch-friendly UI:**
- Buttons/buttons in panels: minimum 44px touch target
- `#dpad` container hidden on desktop (`@media (pointer: fine) { #dpad { display: none; } }`)

**No new localStorage keys.**

---

### 3. Food Rarity Tiers (6 Types)
**Difficulty:** Medium | **Lines:** ~90

Expand from 3 food types to 6. FOOD_TIERS REPLACES `foodProbs` in `MODE_CONFIG` — all modes use the same tier weights for consistency. Per-mode food type filtering (e.g., Time Attack had no speed food) is dropped for simplicity; all food types appear in all modes.

**FOOD_TIERS:**
```js
const FOOD_TIERS = {
  common:   { pts: 10, xp: 25, weight: 0.40, color: '#FF4444', pCount: 8,  sound: 'eat' },
  uncommon: { pts: 15, xp: 30, weight: 0.25, color: '#4488FF', pCount: 10, sound: 'eat' },
  rare:     { pts: 20, xp: 40, weight: 0.12, color: '#44FF44', pCount: 14, sound: 'eat', glow: 8 },
  epic:     { pts: 30, xp: 55, weight: 0.03, color: '#AA44FF', pCount: 18, sound: 'bonus', glow: 14 },
  bonus:    { pts: 30, xp: 60, weight: 0.15, color: '#FFD700', pCount: 12, sound: 'bonus', pulse: true },
  speed:    { pts: 5,  xp: 40, weight: 0.05, color: '#00FFFF', pCount: 10, sound: 'speed' },
};
```

Total weights: 1.00. Bonus and speed rates are preserved from original game.

**Changes:**
- `generateFood()` uses cumulative weight selection from `FOOD_TIERS`
- `drawFood()` draws color from tier, applies `shadowBlur` glow for rare+ (remember to `ctx.shadowBlur = 0` after)
- `updateGame()` scoring uses `FOOD_TIERS[type].pts` and `.xp`
- Particle colors match food color
- Epic food uses existing `'bonus'` sound (ascending pitch)
- Rare+ food adds `ctx.shadowBlur` glow effect in draw
- **No HUD legend needed** — first time a player encounters epic food, show a toast: "Epic! +30 points!"

**Backward compatibility for achievements (CRITICAL):**
```js
// In updateGame(), eat block, replace existing type-specific stats:
if (eatenType === 'bonus') { stats.bonusFoodEaten++; sessionBonusFood++; }
else if (eatenType === 'speed') { stats.speedFoodEaten++; sessionSpeedFood++; }
else { stats.normalFoodEaten++; } // common, uncommon, rare, epic all count as 'normal'
```

Hat Trick achievement: `sessionFoodTypes.size >= 4` (at least 4 distinct types, up from 3, since there are now 6 types and the feat is easier).

**MODE_CONFIG update:** Remove `foodProbs` from all mode entries. All modes use `FOOD_TIERS` globally.

---

### 4. Procedural Obstacles (Static Walls)
**Difficulty:** Medium | **Lines:** ~80

Static wall tiles placed at game start. Hitting one = death. Makes every game a unique board.

**Generation (in `resetGame()`):**
- Count: `3 + Math.floor(Math.random() * 6)` obstacles (3-8 tiles)
- Placement: rejection sampling (max 50 attempts). Must not overlap snake (start position is 10,10), food, or other obstacles.
- Minimum distance: >= 3 tiles from snake head start position (10,10)
- **Board-full guard:** If `snake.length + obstacles.length + 1 >= totalTiles`, skip obstacle generation to prevent do-while infinite loop

**Collision:** In `checkCollision(pos)`, after self-collision check (or before depending on ordering), check `obstacles.some(o => o.x === pos.x && o.y === pos.y)`. Since `obstacles` is global, no signature change needed.

**Food generation:** `generateFood()` do-while condition must also exclude obstacle tiles:
```js
} while (currentSnake.some(s => s.x === newFood.x && s.y === newFood.y) ||
         obstacles.some(o => o.x === newFood.x && o.y === newFood.y));
```

**Rendering:** New `drawObstacles()` called from `drawGame()` after grid, before food:
```js
function drawObstacles() {
  ctx.fillStyle = '#555';
  obstacles.forEach(o => {
    ctx.fillRect(o.x, o.y, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#777';
    ctx.strokeRect(o.x, o.y, TILE_SIZE, TILE_SIZE);
  });
}
```

**Per-mode:** Enabled in Classic and Time Attack. Disabled in Zen (no-death mode). Enabled in Daily Challenge.

**Edge cases:**
- Obstacles + snake length can make board tight — acceptable challenge
- Must guarantee minimum space: if after generation < 50% of tiles remain open, reduce obstacle count by 1 and re-attempt

---

### 5. Daily Challenge System
**Difficulty:** Medium | **Lines:** ~140

A new mode with daily rotating challenges. Gives players a reason to return. Designed with player-friendliness: multiple attempts, moderate rewards, seeded challenge selection not food placement.

**Mode entry:** Add `daily` to `MODE_ORDER` as 4th mode. New `MODE_CONFIG` entry:
```js
daily: {
  name: 'Daily Challenge',
  speed: 'dynamic', selfCollision: true, wallDeath: false, wrap: true,
  timer: null, scoreIs: 'points', earnXP: true, achievementsEnabled: true,
}
```
No `foodProbs` — uses global `FOOD_TIERS`. Obstacles enabled.

**Daily seed for challenge selection only (not for food positions):**
```js
function getDailySeed() {
  const today = new Date();
  const dateStr = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```
Food positions remain random (`Math.random()`). No seeded PRNG needed.

**Challenge pool (hash(seed) % pool.length selects the day's challenge):**

| # | Description | Reward XP |
|---|-------------|-----------|
| 1 | Score 200+ points | 200 |
| 2 | Score 300+ points | 300 |
| 3 | Eat 5 speed foods | 150 |
| 4 | Eat 10 bonus foods | 200 |
| 5 | Reach 3x combo | 150 |
| 6 | Reach 5x combo | 300 |
| 7 | Survive 2 minutes | 200 |
| 8 | Eat 20 foods total | 250 |
| 9 | Reach snake length 15 | 200 |
| 10 | Eat 4+ different food types | 250 |

**Attempts:** 3 attempts per day. Attempt is consumed on game start (resetGame → startGame in daily mode). If player closes tab mid-game, attempt is lost.

**UI:**
- On idle screen, when `gameMode === 'daily'` (selected via Arrow Up/Down like other modes), show:
  - Mode name: "Daily Challenge"
  - Challenge description and XP reward
  - Remaining attempts for today
  - Streak info (if any)
- Game-over screen for daily mode: shows whether challenge was completed, XP earned, remaining attempts
- Toast on completion: "⭐ Daily Complete! +200 XP"

**Storage (unified naming, no duplicates):**
```
snake_daily_date: string (YYYY-MM-DD of last daily play)
snake_daily_done: boolean (today completed? actually redundant with remaining, but kept for clarity)
snake_daily_attempts_remaining: number (3 initial, decremented on game start)
snake_streak_count: number (consecutive days with at least one daily attempt)
```

**Streak:** Incremented when `snake_daily_date !== today` on page load and player has started a game (not just viewed the page). Streak = days with any daily activity. No multiplier (YAGNI). Displayed as "🔥 X day streak!" on idle screen. Streak resets to 0 if > 48 hours since last date.

**Attempt tracking logic:**
- On page load: if `snake_daily_date !== today`, reset `snake_daily_attempts_remaining = 3`, set `snake_daily_done = false`
- On `resetGame()` + `gameMode === 'daily'` + `gameState === 'idle'`: if `snake_daily_attempts_remaining > 0`, decrement by 1
- On `gameOver()` in daily mode: call `checkDailyCompletion(score, stats, ctx)`
- If completed: `awardXP(reward)`, `snake_daily_done = true`, show "Daily Complete!" toast
- If all attempts used: show "No attempts remaining. Come back tomorrow!"

---

## Data Flow Changes

### New Globals
```
shakeTimer: number (0)
flashOverlay: {color, alpha, maxAlpha} | null
eatAnimTimer: number (0)
obstacles: Array<{x, y}>
lastFrameTime: number (0)
```

### New localStorage Keys
```
snake_daily_date
snake_daily_done
snake_daily_attempts_remaining
snake_streak_count
```

### Modified Functions

| Function | Changes |
|----------|---------|
| `animateVisuals()` | Accept `timestamp` param, compute delta, decay timers, apply shake/flash on canvas |
| `drawSnake()` | Apply eating animation scale on head when `eatAnimTimer > 0` |
| `drawGame()` | Call `drawObstacles()` after grid |
| `generateFood()` | Use `FOOD_TIERS` weighted selection, exclude obstacle tiles |
| `checkCollision()` | Check obstacles array |
| `resetGame()` | Generate obstacles, set food type defaults |
| `gameOver()` | Set `shakeTimer`, check daily completion, update stats normalization |
| `updateGame()` | Use `FOOD_TIERS[type].pts/.xp`, trigger flash on eat, normalize food type for stats |
| `drawOverlay()` | Show daily challenge info when `gameMode === 'daily'` |
| `loadStats()` / `saveAllState()` | No change |
| `MODE_CONFIG` | Remove `foodProbs`, add `daily` entry |
| `MODE_ORDER` | Add `'daily'` |
| `drawFood()` | Use `FOOD_TIERS.color`, apply glow for rare+, pulse for bonus |

### New Functions

| Function | Purpose |
|----------|---------|
| `drawObstacles()` | Render wall tiles |
| `checkDailyCompletion(score, stats, ctx)` | Evaluate challenge condition |
| `getDailySeed()` | Compute deterministic seed from date |
| `syncDailyState()` | Reset attempts if new day, update streak |

---

## Implementation Order (Sequential)

| Order | Task | Lines Added | Risk |
|-------|------|-------------|------|
| 1 | Screen juice (shake, flash, eat animation + delta time in rAF) | ~70 | Low |
| 2 | Touch controls (swipe + responsive canvas + D-pad) | ~100 | Low |
| 3 | Food rarity tiers (6 types, MODE_CONFIG update, stat normalization) | ~90 | Medium |
| 4 | Procedural obstacles (generation, collision, rendering, food exclusion) | ~80 | Medium |
| 5 | Daily challenge system (mode, UI, challenge pool, attempt tracking, streak) | ~140 | Medium |

Features 1 and 2 are independent and could be swapped. Features 3-5 all modify `generateFood()` and must compose correctly — Feature 3 sets up the tier system, Feature 4 adds obstacle exclusion, Feature 5 adds daily mode context.

---

## Edge Cases & Cross-Feature Interactions

| Interaction | Handling |
|---|---|
| Screen shake during pause | Suppress in `animateVisuals()` — check `gameState !== 'playing' && gameState !== 'gameover'` |
| Flash + combo combo | Both render, no conflict — flash is fillRect, combo is shadowBlur |
| Touch controls + panels | Touch only on canvas element; DOM panels use their own click handlers |
| Obstacles + board full | Guard in resetGame: if `snake.length + obstacles.length >= 390` (97.5%), reduce obstacles |
| Food tiers + achievements | `common/uncommon/rare/epic` normalize to `normalFoodEaten`. Hat Trick threshold: >=4 types |
| Daily mode + obstacles | Enabled. Daily uses same obstacle generation |
| Daily attempts + tab close | Attempt consumed on `startGame()`. No recovery on tab close. |
| Daily seed + timezone | `new Date()` uses local timezone. No UTC enforcement — acceptable for single-player |
| Delta time overflow | Cap `delta` at 100ms to avoid jumps on resume (e.g., tab switch) |
| D-pad + keyboard | Both dispatch keydown events. No conflict — same handler, same buffer |
| `shadowBlur` carryover | `ctx.shadowBlur = 0` after drawing each glowing food tile, or use save/restore |
| localStorage migration | No existing keys conflict with new names. v3 data unaffected |
| `animateVisuals()` performance | Delta time adds 1 subtraction per frame. No measurable cost |

---

## First-Time Experience (v4)
- First launch after v4 install: all 5 features are active
- Food tiers: first rare/epic encounter shows toast hint
- Obstacles: visible immediately on game start
- Daily challenge: visible as 4th mode option on idle screen
- Touch controls: responsive D-pad appears automatically on touch devices
- Screen juice: felt immediately on first eat and first death
