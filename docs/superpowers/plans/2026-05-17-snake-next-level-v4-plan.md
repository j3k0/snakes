# Snake v4 — Implementation Plan

## Overview
Implement 5 features into a single-file snake game (`snake.html`, 1154 lines). Each feature has its own subagent task + review cycle. Features are implemented sequentially with NO code from later features present when building earlier ones.

## Sequential Execution Plan

### Task 1: Screen Juice (Delta Time + Shake + Flash + Eat Animation)
**Lines added:** ~70
**Risk:** Low

**Changes to make in snake.html:**

1. **Add delta-time to rAF loop:**
   - Add `let lastFrameTime = 0;` global
   - Change `function animateVisuals()` to `function animateVisuals(timestamp)` (rAF passes timestamp automatically)
   - At top: `if (!lastFrameTime) lastFrameTime = timestamp; const delta = Math.min(timestamp - lastFrameTime, 100); lastFrameTime = timestamp;`
   - Cap delta at 100ms to prevent jumps on tab resume

2. **Add screen shake state:**
   - Add `let shakeTimer = 0;` global
   - In `gameOver()`, set `shakeTimer = 200;`
   - In `animateVisuals()`, decay: `if (shakeTimer > 0) { shakeTimer = Math.max(0, shakeTimer - delta); }`
   - Apply shake via canvas translate in drawGame or before drawGame is called:
     ```
     if (shakeTimer > 0) {
       const intensity = (shakeTimer / 200) * 5; // 0-5px
       ctx.save();
       ctx.translate((Math.random() - 0.5) * 2 * intensity, (Math.random() - 0.5) * 2 * intensity);
     }
     ```
     And restore after drawing: `if (shakeTimer > 0) ctx.restore();`

3. **Add flash overlay:**
   - Add `let flashOverlay = null;` global (format: `{color: string, alpha: number}`)
   - In `updateGame()` eat block (around line 740), set flash based on food type:
     ```
     const flashColor = eatenType === 'bonus' ? '#FFD700' : eatenType === 'speed' ? '#00FFFF' : eatenType === 'epic' ? '#AA44FF' : '#44FF44';
     flashOverlay = { color: flashColor, alpha: 0.4 };
     ```
   - In `animateVisuals()`, decay: `if (flashOverlay) { flashOverlay.alpha -= delta * 0.004; if (flashOverlay.alpha <= 0) flashOverlay = null; }`
   - In `drawGame()`, after all drawing, if `flashOverlay`:
     ```
     if (flashOverlay) {
       ctx.fillStyle = flashOverlay.color;
       ctx.globalAlpha = flashOverlay.alpha;
       ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
       ctx.globalAlpha = 1;
     }
     ```

4. **Add eating animation:**
   - Add `let eatAnimTimer = 0;` global
   - In `updateGame()` eat block, set `eatAnimTimer = 150;`
   - In `animateVisuals()`, decay: `if (eatAnimTimer > 0) eatAnimTimer = Math.max(0, eatAnimTimer - delta);`
   - In `drawSnake()` head drawing section (before eyes), if `eatAnimTimer > 0`:
     ```
     if (eatAnimTimer > 0 && index === 0) {
       const scale = 1 + 0.2 * (eatAnimTimer / 150);
       const cx = segment.x + TILE_SIZE / 2;
       const cy = segment.y + TILE_SIZE / 2;
       ctx.save();
       ctx.translate(cx, cy);
       ctx.scale(scale, scale);
       ctx.translate(-cx, -cy);
       // ... draw head rect
       ctx.restore();
       return; // skip body draw for head, already done
     }
     ```
     Actually, simpler: adjust the head rect size based on timer, not translate/scale:
     ```
     if (index === 0) {
       const scale = eatAnimTimer > 0 ? 1 + 0.2 * (eatAnimTimer / 150) : 1;
       const size = Math.round((TILE_SIZE - 1) * scale);
       const offset = Math.round(((TILE_SIZE - 1) - size) / 2);
       ctx.fillRect(segment.x + offset, segment.y + offset, size, size);
       // ... then draw eyes as before
     }
     ```

5. **Suppress effects during pause:** Add `if (gameState !== 'playing' && gameState !== 'gameover') return;` early in animateVisuals.

Make these changes to the snake.html file. DO NOT change any other features or behaviors.

---

### Task 2: Touch & Mobile Controls
**Lines added:** ~100
**Risk:** Low
**Depends on:** Task 1 complete

**Changes:**

1. **Add responsive CSS for canvas:**
   ```
   #gameCanvas { max-width: calc(100vw - 20px); max-height: 70vh; }
   @media (max-width: 480px) { #gameCanvas { width: 100%; height: auto; } }
   ```

2. **Add touch event listeners on canvas (NOT document):**
   - `let touchStartX = 0, touchStartY = 0;`
   - `canvas.addEventListener('touchstart', ...)` — preventDefault, record position
   - `canvas.addEventListener('touchend', ...)` — calc delta
     - If delta < 10px: tap → simulate Enter on idle/gameover, Space on playing
     - If delta >= 30px horizontal/vertical → determine direction, feed into `nextDirection` using same buffer logic as keydown

3. **Virtual D-pad overlay:**
   - Add DOM: `<div id="dpad">` with 4 arrow buttons + pause button
   - `@media (pointer: fine) { #dpad { display: none; } }` — only on touch
   - Each button: `onpointerdown` dispatches `new KeyboardEvent('keydown', {key: 'ArrowLeft'})` etc
   - Click/touch event uses same existing keydown handler

4. **Mode selection on touch:**
   - On idle screen, add swipe-up/swipe-down on canvas to change mode
   - Or simpler: add visible `<` `>` buttons in the D-pad area for mode cycling

Make these changes. DO NOT modify game mechanics, food, obstacles, daily challenge, or screen juice beyond what's needed for touch.

---

### Task 3: Food Rarity Tiers (6 Types)
**Lines added:** ~90
**Risk:** Medium
**Depends on:** Tasks 1+2 complete

**Changes:**

1. **FOOD_TIERS constant (add after MODE_CONFIG):**
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

2. **Remove `foodProbs` from all MODE_CONFIG entries.** Delete the `foodProbs` property from classic, timeAttack, zen.

3. **Update `generateFood()`:** Replace the weighted random selection using `MODE_CONFIG[gameMode].foodProbs` with cumulative weight selection from `FOOD_TIERS`. Same pattern, just iterating over `FOOD_TIERS` entries instead.

4. **Update `drawFood()`:** Replace type-specific rendering with:
   - Look up `FOOD_TIERS[food.type]` or default to `FOOD_TIERS.common`
   - Use `tier.color` for fill
   - If `tier.glow`: `ctx.shadowBlur = tier.glow; ctx.shadowColor = tier.color;` then reset `ctx.shadowBlur = 0` after
   - If `tier.pulse`: existing bonus food pulse logic
   - Move the existing bonus/speed/normal color logic to use tier properties

5. **Update `updateGame()` eat block:**
   - Replace `const foodXPMap = { normal: 25, bonus: 60, speed: 40 };` with `const tier = FOOD_TIERS[eatenType] || FOOD_TIERS.common;`
   - Use `tier.pts` for scoring (instead of hardcoded 10/30/5)
   - Use `tier.xp` for food XP
   - Use `tier.pCount` for particle count  
   - Use `tier.color` for particle color

6. **Stat normalization (backward compat):**
   - In the eat block, replace type-specific stats:
     ```
     if (eatenType === 'bonus') { stats.bonusFoodEaten++; sessionBonusFood++; }
     else if (eatenType === 'speed') { stats.speedFoodEaten++; sessionSpeedFood++; }
     else { stats.normalFoodEaten++; } // all 4 normal tiers count as 'normal'
     ```

7. **Hat Trick achievement:** Change `sessionFoodTypes.size === 3` to `sessionFoodTypes.size >= 4` in `checkAchievements()` (line 852).

8. **Update flash color in Task 1's eat block:** Use `tier.color` instead of hardcoded colors.

DO NOT implement obstacles, daily challenge, or any other feature not listed here.

---

### Task 4: Procedural Obstacles (Static Walls)
**Lines added:** ~80
**Risk:** Medium
**Depends on:** Tasks 1-3 complete

**Changes:**

1. **New global:** `let obstacles = [];`

2. **New function `generateObstacles()`:**
   - Count: `3 + Math.floor(Math.random() * 6)` (3-8 random tiles)
   - For each: pick random tile, reject if overlaps snake (start is 10,10), food, other obstacles, or is within 3 tiles of snake head
   - Max 50 attempts per obstacle
   - Guard: if `snake.length + obstacles.length + 1 >= 400` (total tiles), return
   - Guard: if obstacles would leave < 200 open tiles, reduce count

3. **Call `generateObstacles()` in `resetGame()`** after food generation, before drawing.

4. **Update `checkCollision(pos)`:**
   - Add: `for (let o of obstacles) { if (pos.x === o.x && pos.y === o.y) return true; }`
   - Can be at start of function (before self-collision loop) for clarity

5. **Update `generateFood()` do-while condition:** Add `obstacles.some(o => o.x === newFood.x && o.y === newFood.y)` to rejection check.

6. **Update the board-full guard in `generateFood()`:** Change from `currentSnake.length >= totalTiles` to `currentSnake.length + obstacles.length >= totalTiles`.

7. **New function `drawObstacles()`:**
   ```js
   function drawObstacles() {
     ctx.fillStyle = '#555';
     obstacles.forEach(o => {
       ctx.fillRect(o.x, o.y, TILE_SIZE, TILE_SIZE);
       ctx.strokeStyle = '#777';
       ctx.lineWidth = 1;
       ctx.strokeRect(o.x, o.y, TILE_SIZE, TILE_SIZE);
     });
   }
   ```

8. **Call `drawObstacles()` in `drawGame()`** after `drawGrid()` and before `drawFood()`.

9. **Zen mode:** Guard obstacle generation with `if (gameMode !== 'zen')` in resetGame.

DO NOT implement daily challenge or any other feature not listed here.

---

### Task 5: Daily Challenge System
**Lines added:** ~140
**Risk:** Medium
**Depends on:** Tasks 1-4 complete (since it uses FOOD_TIERS and obstacles)

**Changes:**

1. **Add `daily` to MODE_CONFIG:**
```js
daily: {
  name: 'Daily Challenge',
  speed: 'dynamic', selfCollision: true, wallDeath: false, wrap: true,
  timer: null, scoreIs: 'points', earnXP: true, achievementsEnabled: true
}
```

2. **Add `'daily'` to MODE_ORDER** (after 'zen'):
```js
const MODE_ORDER = ['classic', 'timeAttack', 'zen', 'daily'];
```

3. **Challenge pool and seed:**
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

const DAILY_CHALLENGES = [
  { desc: 'Score 200+ points', check: (s) => s >= 200, reward: 200 },
  { desc: 'Score 300+ points', check: (s) => s >= 300, reward: 300 },
  { desc: 'Eat 5 speed foods', check: (s, st) => st.sessionSpeedFood >= 5, reward: 150 },
  { desc: 'Eat 10 bonus foods', check: (s, st) => st.sessionBonusFoodEaten >= 10, reward: 200 },
  { desc: 'Reach 3x combo', check: (s, st) => st.sessionMaxCombo >= 3, reward: 150 },
  { desc: 'Reach 5x combo', check: (s, st) => st.sessionMaxCombo >= 5, reward: 300 },
  { desc: 'Survive 2 minutes', check: (s, st) => st.sessionTimeAlive >= 120000, reward: 200 },
  { desc: 'Eat 20 foods total', check: (s, st) => st.sessionFoodEaten >= 20, reward: 250 },
  { desc: 'Reach snake length 15', check: (s, st) => st.snakeLength >= 15, reward: 200 },
  { desc: 'Eat 4+ different food types', check: (s, st) => st.sessionFoodTypes.size >= 4, reward: 250 },
];
```

4. **Daily state globals:**
```js
let dailyChallenge = null;
let dailyAttempts = 3;
let dailyDone = false;
```

5. **`syncDailyState()` function:**
   - Read `snake_daily_date` from localStorage
   - If not today: reset `dailyAttempts = 3`, `dailyDone = false`, update streak
   - Read `snake_daily_attempts_remaining`, `snake_daily_done`, `snake_streak_count` from localStorage

6. **`checkDailyCompletion(score, ctx)` function:**
   - If `gameMode !== 'daily'` return
   - If `dailyDone` already, return
   - Get today's challenge: `const challenge = DAILY_CHALLENGES[getDailySeed() % DAILY_CHALLENGES.length];`
   - Evaluate `challenge.check(score, ctx)`
   - If completed: `awardXP(challenge.reward)`, `dailyDone = true`, show toast

7. **Modify `resetGame()` for daily mode:**
   - Check `gameState === 'idle'`
   - If `gameMode === 'daily'` and `dailyAttempts > 0`:
     - `dailyAttempts--`
     - Save `snake_daily_attempts_remaining`
     - `snake_daily_date = today`, save
   - If `dailyAttempts <= 0`: don't start, show message

8. **Modify `gameOver()`:** Call `checkDailyCompletion(score, contextObj)`

9. **Modify `drawOverlay()`:** When `gameMode === 'daily'`, show:
   - "Daily Challenge" as header
   - Today's challenge description + reward
   - Attempts remaining
   - Streak if > 0

10. **GetModeDesc:** Add description for daily mode: "Complete today's unique challenge! 3 attempts per day."

11. **localStorage keys:** `snake_daily_date`, `snake_daily_done`, `snake_daily_attempts_remaining`, `snake_streak_count`

---

## Per-Task Verification

After each task, verify:
1. The game loads without errors
2. The feature works as described
3. Existing features still work (modes, achievements, cosmetics, particles, sounds, etc.)
4. AGENTS.md constraints are respected (game loop, food generation guard, gameState checks)

## Rollback Plan
If a task breaks the game, revert the changes to snake.html and re-implement with the review findings addressed. Each task changes a distinct set of lines, making targeted rollback feasible.
