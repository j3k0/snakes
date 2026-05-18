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

## Game Loop — Restart Helper
- `restartGameInterval(speed)` must also do `clearInterval(gameInterval); gameInterval = null;` before `setInterval` — not just `gameOver()`. Without the null, a stale interval handle lingers and `clearInterval()` on it is a silent no-op.

## Dual Render Loops — rAF Write Boundary
- The rAF loop's timer-decay section (lines ~1346-1352) writes `flashOverlay` from `levelUpFlash` and `snapLevelUpFlash` decay — this is a write to visual state inside the read-only rAF loop. Legitimate since it only writes the `flashOverlay` object (visual state), not game-logic state, but the pattern is fragile: any future code adding a `flashOverlay` write in this section creates a write-contention risk with the game-tick `flashOverlay` writes in `updateGame()`.
- `flashOverlay` is written by BOTH the game tick (food eat, combo milestone, line ~2229) AND the rAF loop (level-up decay). They coordinate implicitly through `levelUpFlash` timer overlap. If both write in the same frame, the rAF's level-up flash overwrites the game-tick's food-eat flash. Documented pattern, not a bug, but fragile.

## Canvas Save/Restore — Sub-Function Leaks
- `drawOverlay()` (lines ~1476-1571) sets `ctx.textAlign`, `ctx.textBaseline`, `ctx.font`, and `ctx.fillStyle` without save/restore. Its idle-state branch has an early return at line ~1542 that leaks these values into `animateVisuals()`. Any sub-function called from `drawGame()` or `animateVisuals()` that modifies text/alignment properties MUST wrap in save/restore.
- Common leak pattern: `ctx.textAlign = 'center'` and `ctx.textBaseline = 'middle'` in overlay/draw functions without save/restore. These persist into subsequent canvas text operations and silently misalign labels.

## Draw Order — HUD Elements
- Background HUD (`drawMuteIndicator`, `drawXPBar`, `drawPrestigeBorder`) renders between grid and obstacles, at grid depth. This is intentional — they sit on the background behind game content. The core game-draw order (grid → obstacles → food → snake → trails → overlays → flash) defines only the game-content layering; HUD elements interleave at grid depth and do not follow the same sequence.

## Food Generation — Two-Source Rival Counting
- `generateFood(currentSnake)` reads rival snake state from TWO sources: the `currentSnake` parameter AND the global `rivalActive`/`rivalSnake` variables. The board-full guard `currentSnake.length + obstacles.length + rivalLength` double-counts rival segments when `currentSnake` already includes them (as in `updateRival()`'s `combinedSnake` call).
- Rule: if `currentSnake` already includes rival segments (caller concatenated them), `rivalLength` must not be added again. Preferred fix: remove `rivalLength` entirely and have ALL callers pass a complete `currentSnake` that includes rival segments when they should count toward board capacity.

## Speed Boost System
- Speed food changes are TEMPORARY and interact with PERMANENT speed modifiers (slowMo). Never store a snapshot of `tickInterval` and restore it later — intermediate state changes (slowMo activate/deactivate) make the snapshot stale. Always recompute from `getEffectiveSpeed()` at restoration time.
- Timed counters (`speedBoostCounter`) must decrement EVERY game tick, not only when the triggering event (food eat) occurs. Placing the decrement inside a conditional handler means the timer pauses when the event stops firing.
- Speed food sets `tickInterval = Math.max(MIN_SPEED, getEffectiveSpeed() - 30)` — the offset is always relative to `getEffectiveSpeed()`, which accounts for slowMo. This way slowMo activates and deactivations automatically adjust the boosted speed target.

## Magnet Power-Up — Wrap-Aware Distance
- The magnet pull uses Manhattan distance to move food toward the snake head. On a wrapping board, raw coordinate subtraction gives the WRONG direction when food is near a map edge (e.g., food at x=380, head at x=20: raw dx = -360, but shortest path is +20 across the wrap boundary).
- Always compute wrapped delta: if `|dx| > CANVAS_WIDTH/2`, the shortest path wraps. Use `dx = dx > 0 ? dx - CANVAS_WIDTH : dx + CANVAS_WIDTH` to get the true shortest-axis direction.

## Touch Controls — Android Chrome `click` Suppression
- `touchstart.preventDefault()` with `{ passive: false }` suppresses the synthetic `click` event on iOS Safari but NOT on Android Chrome. A `_touchDispatched` flag is required as a second defense: `touchstart` sets it to true, `click` checks it and returns early without dispatching.
- The `_touchDispatched` flag must be declared at module/script scope outside the `forEach` closure, because the click handler is a separate event callback that runs on a different event-loop turn. Inside the `forEach` callback, both the `touchstart` and `click` closures share the flag — this works because of closure capture, but the flag must be `let` at the top of the `querySelectorAll(...).forEach(...)` block.
- If the flag is declared once outside the `forEach`, it's a single global that ALL buttons share. This is intentional — only one touch interaction can be in flight at a time on a phone. If two buttons were touched simultaneously (extremely unlikely), the flag would suppress the second button's click, which is the correct behavior.

## State Management — Specific Bypasses
- `helpOverlayVisible` toggle (H key, lines ~2878-2888) has no `gameState` guard. During gameplay, it fills the canvas with `rgba(0,0,0,0.85)` while the game continues running — the player may die without seeing it. At gameover, it obscures the game-over screen.
- `Escape` key handler checks `gameState === 'gameover'` before `helpOverlayVisible`, so pressing Escape during an open help overlay at gameover transitions to idle instead of closing help first.

## Progression Systems — Zen Mode Gap
- `endZenSession()` calls `finalizeSession(true)` but does NOT call `checkAchievements()` or `checkDailyCompletion()`, unlike `gameOver()`. Zen-mode achievements that depend on session-end state (`CENTURY`, `ZEN_MASTER`, etc.) only trigger on food-eat ticks via `checkAchievements(score)` at line ~2276. If the player's last food-eat didn't trigger the condition, quitting Zen mode won't check it.
- `gameOver()` and `endZenSession()` are parallel session-end paths. Any new feature that adds session-end logic must be added to BOTH functions.

## Code Clarity — playSound() Switch Case
- `playSound()` can have duplicate `case` labels without a JavaScript error — the second case is simply unreachable dead code. The switch at lines ~1109-1206 had two `case 'combo_milestone':` blocks. The first (ascending C5→E5 arpeggio) always fires; the second (sustained 660Hz tone) never does. This makes the code confusing: a reader at line 1197 assumes that case is active.
- When adding new sounds to `playSound()`, grep for the case label first to check for duplicates.

