# Snake Game — v3 Design Document (Revised)

## Selected Features (4 total)

### Feature 1: "Walled" Game Mode

**Why:** Classic Snake with walls is the most iconic Snake variant. The MODE_CONFIG already has `wallDeath` and `wrap` properties that are currently dead code (all modes use `wallDeath:false, wrap:true`). This feature activates them.

**Behavior:**
- New mode "Walled" in the mode selector (after Snap, before Daily in MODE_ORDER)
- `wallDeath: true` — hitting canvas edge kills the snake
- `wrap: false` — no wrapping; raw out-of-bounds positions pass through unmodified
- Speed: dynamic (same as Classic), self-collision: true
- No obstacles (clean board for pure wall-death gameplay — distinct from Classic which has obstacles)
- No rival snake (walls are enough pressure)
- **Power-ups disabled** (magnet wrap logic conflicts with non-wrapping board)
- Scoring: standard points

**Critical fix for wrapPosition():** When `wrap: false`, `wrapPosition()` must return the RAW (unmodified) position, NOT a clamped position. The wall collision check then operates on this raw position. If `wrapPosition()` clamps off-screen positions to canvas bounds, the wall collision check `wrappedHead.x < 0 || wrappedHead.x >= CANVAS_WIDTH` will NEVER fire, making wall death impossible. The execution order in updateGame() is:
1. Compute `newHead`
2. Call `wrapPosition(newHead)` — when `wrap: false`, returns raw position unchanged
3. `checkCollision(wrappedHead)` — checks obstacles and self-collision
4. Wall death check: if `MODE_CONFIG[gameMode].wallDeath && (wrappedHead.x < 0 || wrappedHead.x >= CANVAS_WIDTH || wrappedHead.y < 0 || wrappedHead.y >= CANVAS_HEIGHT)` → `gameOver()` with `lastDeathCause = 'Hit the wall!'`
5. If not dead, proceed with food eat check using wrappedHead

**Changes needed:**
1. Add `MODE_CONFIG.walled` entry: `{ name:'Walled', speed:'dynamic', selfCollision:true, wallDeath:true, wrap:false, timer:null, scoreIs:'points', earnXP:true, achievementsEnabled:true }`
2. Add `getModeDesc('walled')` entry: `'Classic Snake with walls. Hitting the edge kills you — no second chances.'`
3. Add 'walled' to `MODE_ORDER` array: `['classic', 'timeAttack', 'snap', 'walled', 'zen', 'daily']`
4. Modify `wrapPosition()` to check `MODE_CONFIG[gameMode].wrap`:
   ```js
   function wrapPosition(pos) {
       const mc = MODE_CONFIG[gameMode];
       if (!mc.wrap) return pos; // Return raw position — wall death check handles out-of-bounds
       return {
           x: ((pos.x % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH,
           y: ((pos.y % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT
       };
   }
   ```
5. Add wall collision check in `updateGame()` after head position update
6. `generateObstacles()`: skip obstacles for walled mode
7. `spawnRival()`: skip rival for walled mode
8. Disable power-ups in Walled mode: in `updateGame()` power-up section, check `if (gameMode === 'walled') return;`
9. **Mode overflow fix**: With 6 modes, reduce mode selector item spacing. Current: y=130, 55px spacing → 6th item at y=405 (overflows 400px canvas). New: y=120, 45px spacing → 6th item at y=345, footer fits below.

**AGENTS.md update:** Add note about walled mode using `wrap: false` path — `wrapPosition()` returns raw position, wall collision check in `updateGame()`.

---

### Feature 2: Structured Obstacle Patterns + Progressive Obstacles

**Why:** Current obstacles are random single tiles with no visual variety. They never change during gameplay. Structured patterns make navigation more interesting, and progressive spawning ramps difficulty naturally.

**Behavior:**
- Obstacles generate as **patterns** (random selection from pool): single tile (40%), 2-tile horizontal L (15% each side), 2-tile vertical L (15% each side)
- Patterns are defined as arrays of `{dx, dy}` offsets from an anchor tile, placed with same distance/snake/food checks as current obstacles
- Every ~200 game ticks (~24s at default speed, adjusted for speed changes), 1-2 new single-tile obstacles spawn
- **CRITICAL: New obstacles must have feedback:** brief flash animation on newly spawned tiles (rendered in brighter color for 1s), a sound cue (reuse `'pause'` sound or add `'obstacle_spawn'`), and a brief toast "⚠ New obstacles!" — NEVER spawn silently
- **Progressive obstacles capped at 20% of total tiles** (80 tiles max on 400x400 board) to prevent board-filling game over
- New obstacle placement enforces 3-tile Manhattan distance from snake head (same as initial placement)
- Obstacles disabled in Walled mode and Zen mode
- **Classic mode mode description updated:** "Standard Snake. Wall wrapping, speed increases, board closes in over time."

**Changes needed:**
1. Define `OBSTACLE_PATTERNS`:
   ```js
   const OBSTACLE_PATTERNS = [
       { tiles: [{dx:0, dy:0}], weight: 0.40, name: 'single' },
       { tiles: [{dx:0, dy:0}, {dx:TILE_SIZE, dy:0}], weight: 0.15, name: 'h_left' },
       { tiles: [{dx:0, dy:0}, {dx:-TILE_SIZE, dy:0}], weight: 0.15, name: 'h_right' },
       { tiles: [{dx:0, dy:0}, {dx:0, dy:TILE_SIZE}], weight: 0.15, name: 'v_down' },
       { tiles: [{dx:0, dy:0}, {dx:0, dy:-TILE_SIZE}], weight: 0.15, name: 'v_up' },
   ];
   ```
2. Update `generateObstacles()`: select pattern by weight, attempt placement with all tiles, fall back to singles on conflict
3. Add `findFreeTile(headX, headY)` helper that checks 3-tile distance from head
4. Add progressive obstacle spawn logic in `updateGame()` with flash animation state + toast
5. Update `drawObstacles()` to render flash animation on newly spawned tiles
6. Update Classic mode description string
7. Add max obstacle occupancy constant: `const MAX_OBSTACLE_PERCENT = 0.20;`

**AGENTS.md update:** Add rules about progressive obstacles: feedback required, head-distance check, max occupancy cap.

---

### Feature 3: Pause Menu with Options

**Why:** Current pause screen is a text-only overlay with no interactive elements. Players who want to restart or quit have to die intentionally.

**Behavior:**
- When paused: show menu with 3 options:
  ```
  ⏸ PAUSED

    ▶ Resume
    🔄 Restart
    ⌂ Quit to Menu
  ```
- Default selection is "Resume" (index 0) — resets when entering pause state
- Arrow Up/Down navigates options (wraps around)
- Enter selects highlighted option
- P/Space toggles pause (same as Resume)
- Escape also resumes (existing behavior, now explicit)
- **Touch/click support**: each menu item has a rectangular canvas hit region. On touch/click during pause, if tap falls within a menu item's bounds, execute that action directly
- **Restart confirmation**: when Restart or Quit is selected and Enter pressed, show a brief "Confirm? Y/N" sub-prompt before executing. Enter confirms, Escape/Esc cancels back to main pause menu
- **Session accounting**: Restart from pause does NOT count as a death (no `totalDeaths++`), does NOT call `finalizeSession()` — it's an abandoned game. Quit to Menu also does NOT count as a death. Neither triggers `checkAchievements()` or `checkDailyCompletion()`.
- **State machine for Restart**: `paused → resetGame() sets idle → startGame() sets playing` — done atomically in the keydown handler. After `startGame()`, return early so no further handler code runs on stale state.

**Changes needed:**
1. Add `pauseMenuSelection = 0` variable (reset in `resetGame()` AND when entering pause state)
2. Add `pauseConfirmPending = false` and `pauseConfirmAction = null` for confirmation sub-prompt
3. Modify `drawOverlay()` paused-state branch with save/restore discipline per AGENTS.md
4. Add hit region detection in canvas click/touch handler for pause state
5. Modify keydown handler for pause state: ArrowUp/Down, Enter with confirm, Escape
6. `resetGame()`: add `pauseMenuSelection = 0; pauseConfirmPending = false; pauseConfirmAction = null;`
7. When game enters pause state: set `pauseMenuSelection = 0; pauseConfirmPending = false;`

**Canvas save/restore discipline:** The new pause menu overlay text rendering (set `font`, `textAlign`, `textBaseline`, `fillStyle`) must be wrapped in `ctx.save()` / `ctx.restore()`. No early returns between save/restore. Follow AGENTS.md: for simple state changes like `shadowBlur`, prefer explicit reset over save/restore, but for text alignment changes use save/restore.

---

### Feature 4: First-Time Player Onboarding

**Why:** Brand-new players see 5 game modes, mode descriptions, and keybindings they don't understand. A brief welcome overlay reduces the learning cliff.

**Behavior:**
- Check `saveManager.get('snake_has_played', '')` at page load
- If falsy (first launch), show a welcome overlay on the idle screen with 3 panels:
  1. Controls: render different text based on `hasTouch`/`isMobile`:
     - Keyboard: "Arrow keys to move, P to pause, Enter to start"
     - Touch: "Swipe to move, tap ⏸ to pause, tap canvas to start"
  2. Food: "Different colored food gives different points. Eat speed food for a burst!"
  3. Progression: "Eat food to earn XP and unlock cosmetics. Press C for cosmetics!"
- Footer: "Press any key or tap to start playing"
- On any keypress (Enter, Space, Arrow, etc.): dismiss overlay, set `saveManager.set('snake_has_played', '1')`, then let the normal handler process the key normally. If the key was Enter, it starts the game directly (intentional — one-key-to-play for first launch).
- On touch/click on canvas: dismiss overlay.
- **On mobile (touch only):** Tap-to-dismiss does NOT start a game (unlike keyboard Enter which both dismisses AND starts). This prevents accidental attempt consumption.
- **Canvas save/restore:** `drawWelcomeOverlay()` must use `ctx.save()`/`ctx.restore()` around all text rendering operations per AGENTS.md.

**Changes needed:**
1. Add `let welcomeOverlay = !saveManager.get('snake_has_played', '');` near state vars
2. Add `drawWelcomeOverlay(ctx)` function with save/restore discipline
3. In `drawOverlay()` idle-state branch: if `welcomeOverlay`, render welcome overlay instead of normal idle screen, return early
4. In keydown handler for idle state: if `welcomeOverlay`, dismiss on any keypress, save flag, let handler process key normally
5. Canvas click/touch handler: if `welcomeOverlay` and `hasTouch`, dismiss without dispatching Enter
6. Welcome overlay not affected by `resetGame()` — only on page load

---

## Implementation Order

| Order | Task | Risk | Lines Added |
|-------|------|------|-------------|
| 1 | First-Time Onboarding (Feature 4) | Low | ~55 |
| 2 | Pause Menu with confirmation (Feature 3) | Low-Medium | ~90 |
| 3 | Walled Mode (Feature 1) | Medium (wrapPosition blast radius) | ~45 |
| 4 | Obstacle Patterns + Progression (Feature 2) | Medium | ~85 |

## Cross-Feature Interactions

| Feature Pair | Interaction |
|---|---|
| Walled + Obstacle Patterns | Walled mode explicitly disables obstacles. No conflict. |
| Pause Menu + Onboarding | Welcome overlay only shows when game hasn't been played. Pause only during gameplay. No overlap. |
| Walled + wrapPosition fix | wrapPosition modification affects ALL modes. Must verify Classic/TimeAttack/Zen/Daily/Snap still wrap correctly after change. |
| Obstacle Patterns + existing obstacles | Existing obstacle iteration uses `.some(o => o.x...o.y)` — adding pattern metadata to obstacle objects doesn't break this pattern. |

## Edge Cases (Must Handle)

1. **Walled mode wall death:** `wrapPosition()` returns raw position when `wrap: false`. Wall death check detects out-of-bounds and kills. Position is NEVER clamped.
2. **Progressive obstacles + head distance:** `findFreeTile()` must enforce 3-tile minimum distance from snake head. The design's own code example must implement this constraint.
3. **Pause menu Restart atomicity:** The call sequence `paused → resetGame() → startGame()` happens within the keydown handler. After `startGame()` returns, the handler must `return` to prevent stale-state execution.
4. **Onboarding + Enter on first launch:** Enter dismisses AND starts the game in one press. This is intentional — first-time players press Enter to "start" and get into the action immediately.
5. **`pauseMenuSelection` not reset on resume:** Must reset to 0 when entering pause state AND in `resetGame()`.
6. **Canvas save/restore for all new overlays:** Both `drawWelcomeOverlay()` and the pause menu rendering must use save/restore discipline per AGENTS.md.
