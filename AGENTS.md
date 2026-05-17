# AGENTS.md

## Game Loop
- `gameInterval` must be both `clearInterval()`'d AND set to `null` in `gameOver()` — the keydown handler guards on `!gameInterval` to detect stopped state
- Speed changes require clearing the existing `setInterval` and creating a new one; you cannot mutate a running interval's delay

## Dual Render Loops
- The game runs TWO concurrent loops: `setInterval` (50-120ms) for `updateGame()` → `drawGame()` (core game state), and `requestAnimationFrame` (60fps) for `animateVisuals()` (particles, score animation, screen effects)
- The rAF loop reads game state (particle array, score values, timer flags) but NEVER writes to game logic state — no write contention between loops
- `animateVisuals(timestamp)` receives the rAF timestamp automatically; compute delta via `Math.min(timestamp - lastFrameTime, 100)` and use it for all timer-based decays. Cap at 100ms to prevent jumps when resuming from tab-hidden state
- Hardcoded frame-rate assumptions (e.g., `16 / maxLife`) break on variable-refresh-rate displays — always use delta time

## Canvas Save/Restore Discipline
- Canvas state operations (`ctx.translate`, `ctx.shadowBlur`, `ctx.globalAlpha`, `ctx.scale`) mutate persistent context state
- Every `ctx.save()` must have a matching `ctx.restore()` on ALL code paths — an early return between them permanently corrupts the canvas transform
- For simple one-off state changes (e.g., shadowBlur on a single tile), prefer explicit reset (`ctx.shadowBlur = 0`) over save/restore

## Draw Order
- Canvas draw order is: grid → obstacles → food → snake → particles/trails → overlays (pause, gameover) → flash overlay
- Flash overlay must render LAST (on top of everything) to create the screen-covering effect
- Obstacles render behind food so eating near an obstacle is visually clear

## Food Generation
- `generateFood()` must check if the snake fills the board before entering the do-while loop, otherwise it infinite-loops
- When obstacles exist, the board-full guard must check `currentSnake.length + obstacles.length`, not just `currentSnake.length`
- The do-while condition must also reject obstacle tiles

## Food Tier System
- `FOOD_TIERS` is the global authority for food type distribution — per-mode `foodProbs` were removed
- All game modes use the same FOOD_TIERS weights for consistency
- Stat normalization: `common/uncommon/rare/epic` all map to `stats.normalFoodEaten` in the eat block's else branch

## State Management
- `gameState` (`idle`/`playing`/`paused`/`gameover`) is the single source of truth for all flow control; always check it before acting on input or updating

## Touch Controls
- Touch input uses two parallel paths:
  - **Virtual D-pad**: Dispatches `KeyboardEvent('keydown', {key})` to `document` — reuses the existing keydown handler and its input buffering, direction validation, and game-state guards
  - **Swipe detection**: Sets `nextDirection` directly (same buffer the keydown handler uses)
- D-pad `touchstart` listeners must use `{ passive: false }` and `e.preventDefault()` to suppress the subsequent `click` event (which would double-dispatch)
- Touch event listeners must be on the canvas element (not document) to avoid interfering with DOM panels

## Daily Challenge System
- Attempt is consumed on `startGame()`, not on page load or `gameOver()`
- If consumed on page load: tab-close mid-game loses the attempt
- If consumed on `gameOver()`: Zen mode (no death) lets player play indefinitely without consuming attempts
- Streak increments on consecutive daily game starts, tracked in `snake_streak_count`

## Toast Timer Sharing
- `window.achToastTimer` and `window.lvlToastTimer` are shared global timers used by achievements, level-ups, daily completion, and cosmetic unlocks
- When two toast systems fire in sequence (e.g., `checkAchievements()` + `checkDailyCompletion()` both from `gameOver()`), the second toast's `clearTimeout` on the shared timer suppresses the first toast's display
