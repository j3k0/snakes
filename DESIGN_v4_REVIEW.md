# Snake Game v4 Design Plan — Critical Review

**Reviewer:** Snaky PI (architectural review against the 3,642-line snake.html codebase)
**Date:** 2026-05-23

---

## Executive Summary

The v4 plan is **ambitious but generally sound**. The six features are well-chosen for impact and most designs are coherent. However, there are **specific architectural gaps, understated dependencies, and edge-case omissions** that would cause bugs or rework if not addressed before implementation. The two highest-risk items are (1) the Ghost replay system's dependency on seed determinism being deeper than stated, and (2) the canvas resize for Versus mode touching hundreds of pixel positions across the codebase.

---

## Feature 0: Null-Food Crash Fix

**Verdict: Sound, but scoped incorrectly.**

### Design Accuracy

The design states the fix requires 2 lines — one for the player food check, one for the rival collision check. This is **wrong**. The rival check in `updateRival()` (line ~1139) **already guards food**:

```js
if (food && rNewHead.x === food.x && rNewHead.y === food.y) {
```

The only unprotected access is in `updateGame()` at the player food collision check. This is a **1-line fix**, not 2.

### Actual Fix

```js
// In updateGame(), change:
if (wrappedHead.x === food.x && wrappedHead.y === food.y) {
// To:
if (food && wrappedHead.x === food.x && wrappedHead.y === food.y) {
```

### When Food Becomes Null

`food` becomes null in two paths:
1. `generateFood()` returns null when board is full (snake + obstacles >= total tiles)
2. `updateRival()` sets `food = null` explicitly when the rival eats the last food and `generateFood()` returns null

Both paths are reachable. The crash is real. Fix is correct.

### Verdict

- **Design sound:** Yes
- **Effort estimate:** Accurate (trivially < 5 min)
- **Missing edge cases:** None
- **Conflicts:** None

---

## Feature 1: Seeded Challenge Runs

**Verdict: Conceptually sound, but the effort estimate is too low and the design has gaps.**

### Missing Math.random() Call Sites

The design says "replace all Math.random() calls in game logic." The actual call sites that MUST be seeded for reproducibility:

| Function | Call Sites | Seeded? |
|---|---|---|
| `pickRandomFoodType()` | 1 (tier selection) | Must seed |
| `generateFood()` | 2 (position x/y, fallback tile selection) | Must seed |
| `pickWeightedPattern()` | 1 (pattern selection) | Must seed |
| `generateObstacles()` | 3 (count, pattern position x/y) | Must seed |
| `spawnRival()` | 2 (fallback position selection, corner pick) | Must seed |
| `updateRival()` | 2 (AI decision rand < 0.70, direction shuffle) | Must seed |
| `spawnPowerUpPickup()` | 2 (type, position) | Must seed |
| `updateGame()` progressive obstacles | 1 (count = 1+floor(rand*2)) | Must seed |
| `spawnParticles()` | 2 (velocity, size) | Must NOT seed |
| Trail particle colors in `updateGame()` | 0 (uses renderTime, not Math.random) | N/A |

That's **14+ call sites** across 8 functions that need `Math.random()` → `seededRandom()` replacement. The "~100 lines" estimate including PRNG implementation, UI, and seed versioning is **optimistic by ~50%**. Expect 150-180 lines.

### Seed Version Stamping

The design mentions version-stamped seeds (`snake_seed_v1`) which is good. But what happens on version mismatch?

- **Missing behavior:** If a player has a seed string from a friend but their game version is newer, what do they see? An error toast? Silent fallback to random? The seed input field should validate and show a message.
- **Storage:** Seeds should probably be stored in localStorage (the last-used seed) so it persists across page reloads. Not mentioned.

### Daily Mode Conflict

The design says "Daily challenge mode uses its own `getDailySeed()` — unaffected by the seed field." But **the UI behavior is unspecified**:

- If the player types a seed, then selects Daily mode, what happens? The seed field should either (a) be hidden/disabled when Daily is selected, or (b) the seed is silently ignored. Option (a) is better UX.
- If the player starts a Daily game with a seed visible, do they think the seed applies? This is a confusion risk.

**Recommendation:** When `gameMode === 'daily'`, hide the seed input and display "Seed: Daily (auto-generated)."

### Seed Display During Gameplay

The design says bottom-right corner. But the bottom-right already hosts:
- Snap HUD: `CANVAS_WIDTH - 5, 5` (top-right)
- Rival HUD: `CANVAS_WIDTH - 5, CANVAS_HEIGHT - 60` (bottom-right)
- Mute indicator: `CANVAS_WIDTH - 8, 8` (top-right)

Bottom-left has the XP bar at `CANVAS_HEIGHT - 22`. The bottom-right space directly above the rival HUD (`CANVAS_HEIGHT - 80` area) is available for a seed display, but needs explicit positioning to avoid overlap.

### Food Generation Edge Case with Seeded RNG

`generateFood()` has a fallback path when the board is nearly full: it scans all free tiles and picks one with `Math.random()`. When seeded, this means the fallback tile selection is deterministic, which is correct. But if the same seed produces the same snake path, the board-filling behavior will be identical — desirable for speedrunning.

### Effort Reassessment

| Component | Lines |
|---|---|
| mulberry32 PRNG + seededRandom wrapper | ~20 |
| Seed input UI (field + button + styling) | ~30 |
| activeSeed/isSeededRun globals + init | ~10 |
| Replace Math.random() at 14+ call sites | ~30 |
| Seed display during gameplay + game-over | ~25 |
| Seed version stamping + validation | ~20 |
| Seed persistence in localStorage | ~15 |
| Daily mode UI conflict handling | ~15 |
| **Total** | **~165** |

### Verdict

- **Design sound:** Yes, with caveats
- **Effort estimate:** Underestimated (~100 → ~165 lines)
- **Missing edge cases:** Daily mode UI conflict, version-mismatch UX, seed persistence, HUD space collision
- **Dependencies:** None (correctly listed as independent)
- **Conflicts:** Daily mode seed confusion (not a code conflict, a UX one)

---

## Feature 2: Ghost Replay System ("Echo")

**Verdict: The dependency on seeds is understated, and the replay data structure has a critical gap.**

### Critical Design Gap: Growth Events

The proposed replay format stores only `{tick, dx, dy}` direction changes. But a snake grows when it eats food, and the ghost needs to know when food was eaten to reconstruct the correct snake length at each tick.

**Why this matters:** If the ghost replay only records direction changes:
- Tick 0: snake = [{0,0}], dx=RIGHT
- Tick 5: direction change to DOWN
- Tick 10: direction change to RIGHT
- But did the snake eat food at tick 3? Tick 7? The ghost playback can't know.

**Solution A (recommended):** The replay format MUST include growth markers:
```js
inputs: [
  {tick: 5, dx: 1, dy: 0},
  {tick: 7, grew: true},       // food eaten at tick 7
  {tick: 12, dx: 0, dy: -1},
  {tick: 15, grew: true},      // food eaten at tick 15
  // direction-only changes don't need grew:false — implied
]
```

**Solution B:** When a seed is active, replay playback can re-simulate the food positions from the seed and check if the ghost head hits food. This works but makes the seed dependency **mandatory**, not just "for optimal experience" as the design states.

The design says "Ghost replay without seed: Works but only shows path, not food/obstacle layout." But without growth events OR a seed, the replay can't even reconstruct the correct snake length. The ghost would have a **fixed-length snake regardless of when food was eaten.** This undermines the entire feature for unseeded runs.

### Replay Playback Engine Complexity

The design says "Ghost playback reads from the replay array on each game tick, advancing its own head position." This requires:

1. Maintaining a **playback pointer** into the `inputs` array (not linear scanning every tick)
2. Reconstructing the ghost snake body array from tick 0 to currentTick using direction changes + growth markers
3. Handling the case where the replay snake wraps around canvas edges

The engine needs to be a deterministic mini-simulator. For an unseeded run without growth markers, it can't work correctly.

### Seed Dependency — Stronger Than Stated

The implementation order says Feature 4 (Ghost) depends on Feature 3 (Seeds) "for optimal experience." In reality, **without seeds, the replay format MUST include growth markers** (or full position data). The dependency is: either implement seeds first, or implement a more complex replay format. The design should acknowledge this choice explicitly.

### Ghost Rendering Order

The design says ghost renders with `ctx.globalAlpha = 0.3`. The ghost should render **before** the main snake so it appears behind it. Currently `drawGame()` calls `drawSnake(t)` which draws the player snake. Ghost rendering should be inserted before `drawSnake(t)`:

```js
function drawGame(t) {
    drawGrid();
    // ...
    drawGhost(t);        // NEW: render ghost behind player snake
    drawSnake(t);
    // ...
}
```

### Multiple Ghosts?

The design says "Top 5 personal bests per mode." Can the player toggle through multiple ghosts? If so, how many at once? The design implies one ghost at a time (the selected replay), but this should be explicit.

### Storage Quota

localStorage has ~5MB per origin. With up to 5 replays × 6 modes = 30 replays, each ~50 direction changes × (assuming ~15 bytes per entry), total ~22KB. Well within limits. No issue.

### Effort Reassessment

| Component | Lines |
|---|---|
| ReplayRecorder (capture during gameplay) | ~25 |
| Replay storage (top 5 per mode, LRU) | ~20 |
| Ghost playback engine (mini-simulator) | ~40 |
| Ghost render function | ~20 |
| UI toggle (button/keybind) | ~15 |
| Replay compatibility check | ~15 |
| Growth markers in replay format | ~10 |
| **Total** | **~145** |

Plus the seed system dependency. Without seeds, the replay format complexity increases.

### Verdict

- **Design sound:** Partially — missing growth event recording
- **Effort estimate:** Slightly underestimated (~120 → ~145 lines)
- **Missing edge cases:** Growth without seed, multiple ghost selection, ghost rendering order, game-over while ghost still playing, ghost outlasting current game
- **Dependencies:** **Strongly** dependent on Feature 3 (Seeds), not just "for optimal experience" but for correct playback without a more complex format
- **Conflicts:** None with existing features

---

## Feature 3: Local 2-Player Versus Mode

**Verdict: Ambitious feature with the most architectural risk. Canvas resize is the biggest hazard.**

### Canvas Resize — The Biggest Risk

Changing the canvas from 400×400 to 600×400 for versus mode affects:

1. **Constants:** `CANVAS_WIDTH` goes from 400 to 600. But it's used everywhere.
2. **Grid:** 20×20 tiles becomes 30×20 tiles — a rectangular grid. The grid cache must be rebuilt.
3. **Overlay centering:** Most overlays use `CANVAS_WIDTH / 2` for centering (correct). But some use hardcoded offsets:
   - XP bar: `barX = 5` (bottom-left, fine)
   - Rival HUD: `CANVAS_WIDTH - 5` (right edge — will auto-adjust but rival doesn't exist in versus)
   - Mute indicator: `CANVAS_WIDTH - 8` (auto-adjusts, fine)
   - Snap HUD: `CANVAS_WIDTH - 5` (auto-adjusts, fine but Snap mode doesn't co-exist with versus)
   - Mode selector idle screen: hardcoded `CANVAS_WIDTH / 2` for centering (fine)
   - Help overlay: hardcoded column positioning `foodX = CANVAS_WIDTH - 155` (would need adjustment)
   - Welcome overlay: uses `CANVAS_WIDTH / 2` (fine)
   - Various toast, stat milestone displays: DOM-based (non-canvas, fine)
4. **Food generation:** Uses `CANVAS_WIDTH / TILE_SIZE` and `CANVAS_HEIGHT / TILE_SIZE` for tile count — this auto-adapts to 30×20. Good.
5. **Obstacle generation:** Same tile-count math — auto-adapts. Good.
6. **Wrapping:** `wrapPosition()` uses `CANVAS_WIDTH` and `CANVAS_HEIGHT` — auto-adapts. Good.
7. **Touch coordinates:** Scale factor uses `CANVAS_WIDTH / rect.width` — auto-adapts. Good.

**Recommendation:** Instead of modifying `CANVAS_WIDTH` at runtime (which would require re-caching everything), define a separate `CANVAS_WIDTH_VERSUS = 600` and use conditional logic in canvas sizing, grid generation, and any hardcoded overlay positions. The canvas element's `width` attribute should be set dynamically on game start.

### WASD Key Conflict

The existing `keydown` handler already routes 'a', 'w', 's', 'd' to `setNextDirection()` for Player 1:

```js
case 'a':
    newDx = -TILE_SIZE;
    newDy = 0;
    break;
case 'w':
    newDx = 0;
    newDy = -TILE_SIZE;
    break;
```

For versus mode, this handler must be forked:
- Arrow keys → `setNextDirection(dx, dy)` (P1)
- WASD keys → `setNextDirectionP2(dx2, dy2)` (P2)

But `setNextDirection()` currently validates against `nextDirection ?? {dx, dy}`. P2 needs its own `nextDirection2` buffer and `dx2/dy2` state. This is straightforward but the routing logic in the keydown handler needs careful refactoring to avoid double-processing keys.

### Food Competition Edge Cases

The design says "whichever head reaches first eats it." But `updateGame()` processes both snakes **sequentially** in `updateVersus()`. This means:

- If both snakes' heads land on the same food on the same tick, the **first-processed snake** always wins.
- This introduces an unfair P1 advantage if P1 is always processed first.

**Fix:** After moving both snakes, check food collision. If both heads are on food, either:
- (a) Both eat (duplicate food) — simpler
- (b) Random tiebreaker — fair but non-deterministic
- (c) Neither eats — harshest but most "competitive"

Recommendation (a): both eat. It's the least surprising and doesn't create feel-bad moments.

### P2 State Variables

The design says "Duplicate snake state variables for P2." At minimum:
```js
let snake2 = [];
let dx2 = 0, dy2 = 0;
let nextDirection2 = null;
let score2 = 0;
let prevSnake2 = [];  // for interpolation
```

But also needed for consistency:
- `snake2Grew` flag (for interpolation in draw)
- P2 input buffering mirroring P1's `setNextDirection()` logic

### Game-Over Flow

After one player dies in versus, what happens?
- Option A: Game ends immediately, surviving player wins.
- Option B: Surviving player continues playing solo until they die, then winner is determined by score.

The design says "Winner screen: P1 Wins! / P2 Wins! / Draw!" — this implies immediate end when someone dies. But what if both die on the same tick (head-to-head collision)? That's a draw.

The game-over screen for versus needs its own overlay distinct from single-player "GAME OVER." The current `drawOverlay()` is a single function with game-state branching. Recommend adding a `drawVersusOverlay()` function.

### Mobile Hiding

The design says "On mobile: hide this mode." Implementation options:
- Skip 'versus' in `MODE_ORDER` on mobile
- Show 'versus' but greyed out with "Desktop only" label
- Allow selection but show "Not available on mobile" toast when Enter is pressed

Option A is cleanest: filter `MODE_ORDER` dynamically based on `hasTouch || isMobile`.

### Obstacles, Rival, Power-ups in Versus

The design says none of these. Verify:
- `generateObstacles()`: skips for zen and walled. Add versus to the skip list.
- `spawnRival()`: skips for zen, snap, daily, walled. Add versus.
- Power-up spawn timer: skips for zen and walled. Add versus.
- Progressive obstacle spawn: skips for zen, walled, daily. Add versus.

### Mode Selector Overflow

With 7 modes, the idle screen mode selector needs adjustment. Currently at y=120 with 45px spacing, 7 items would reach y=120+6*45 = 390 — overlapping the footer area at y=305. Solution:
- Reduce spacing to 40px (y=120+6*40 = 360, footer at y=310 — still tight)
- Or reduce font size from 18px/22px to 16px/20px
- Or use scrolling mode selector (overengineered)

The v3 design already addressed 6-mode overflow with reduced spacing. For 7 modes, either reduce further or accept that the bottom mode description gets truncated.

### Effort Reassessment

| Component | Lines |
|---|---|
| P2 state variables + init | ~15 |
| WASD routing in keydown + setNextDirectionP2 | ~20 |
| updateVersus() — dual snake logic | ~60 |
| Collision matrix (self, cross, head-to-head) | ~30 |
| drawVersusOverlay() — winner screen | ~25 |
| Canvas sizing logic (400→600) | ~20 |
| Mode selector overflow fix | ~10 |
| Disable obstacles/rival/power-ups in versus | ~5 |
| Mobile hiding | ~10 |
| Food competition tiebreaker | ~10 |
| **Total** | **~205** |

The estimate of ~250 lines is actually closer to reality than I initially thought. Still slightly low given the canvas resize complexity, but in the right ballpark.

### Verdict

- **Design sound:** Mostly, with gaps in food competition, game-over flow, and canvas resize strategy
- **Effort estimate:** Slightly low (~250 → ~280 lines with canvas sizing edge cases)
- **Missing edge cases:** Food competition tiebreaker, game-over flow after death, canvas resize affecting all overlay positions, WASD key conflict with existing routing, sequential processing advantage
- **Dependencies:** Correctly listed as independent
- **Conflicts:** WASD keys already mapped to P1; canvas resize affects all other modes' rendering if not isolated properly

---

## Feature 4: "New Best!" Toast & QoL Polish

**Verdict: Mostly low-risk, but the setTimeout conversion (4d) carries medium risk.**

### 4a. "New Best!" Toast

The design checks `score > mode-specific high score`. But `modeHighScores[gameMode]` is **updated during gameplay** in `updateScoreDisplay()`:

```js
function updateScoreDisplay() {
    if (score > (modeHighScores[gameMode] || 0)) {
        modeHighScores[gameMode] = score;
        saveManager.setJSON('snake_mode_highs', modeHighScores);
    }
    // ...
}
```

This means by the time `gameOver()` runs, `modeHighScores[gameMode]` already equals the current score (if it's the new best). The toast check must use a **snapshot of the pre-game high score**:

```js
// In startGame():
previousModeHighScore = modeHighScores[gameMode] || 0;

// In gameOver() or finalizeSession():
if (score > previousModeHighScore && previousModeHighScore > 0) {
    showNewBestToast();
}
```

The `previousModeHighScore > 0` check prevents toasting on the first-ever score (as specified).

### 4b. imageSmoothingEnabled

One line in `drawGame()`:
```js
ctx.imageSmoothingEnabled = false;
```

The grid is drawn via `ctx.drawImage(gridCacheCanvas, 0, 0)` from an offscreen canvas of identical dimensions (400×400 → 400×400). At 1:1 scale, `imageSmoothingEnabled` has no visible effect on `drawImage`. It does affect scaled image rendering, which isn't used. The only perceptible benefit is on `fillRect` calls — but `imageSmoothingEnabled` only affects image rendering (`drawImage`), not shape rendering. **This setting has no practical effect in the current rendering pipeline.** It's harmless but won't produce "crisper pixel rendering" as claimed.

### 4c. Context Menu Disable

```js
canvas.addEventListener('contextmenu', e => e.preventDefault());
```

Simple and correct. No conflicts.

### 4d. setTimeout Chain — Risk Analysis

The current game loop uses `setInterval` with these touchpoints:

| Location | Current Code | Conversion |
|---|---|---|
| `startGame()` | `setInterval(updateGame, tickInterval)` | `scheduleNextTick(tickInterval)` |
| `resumeGame()` | `restartGameInterval(tickInterval)` | `scheduleNextTick(tickInterval)` |
| `restartGameInterval(speed)` | `clearInterval` + `setInterval` | `stopGameLoop()` + `scheduleNextTick(speed)` |
| Pause handler | `clearInterval(gameInterval)` | `stopGameLoop()` |
| `gameOver()` | `clearInterval(gameInterval)` | `stopGameLoop()` |
| `endZenSession()` | `clearInterval(gameInterval)` | `stopGameLoop()` |
| Speed boost | `restartGameInterval(tickInterval)` | `stopGameLoop()` + `scheduleNextTick(tickInterval)` |
| Slow-mo deactivate | `restartGameInterval(tickInterval)` | `stopGameLoop()` + `scheduleNextTick(tickInterval)` |

**Critical implementation detail:** Where is `scheduleNextTick()` called?

The design implies `scheduleNextTick()` is called after `updateGame()` completes. The cleanest pattern:

```js
function updateGame() {
    // ... all game logic ...
    lastTickTime = performance.now();
    visualDirty = true;
    
    // Schedule next tick only if still playing
    if (gameState === 'playing') {
        gameTimeout = setTimeout(updateGame, tickInterval);
    }
}

function stopGameLoop() {
    if (gameTimeout) {
        clearTimeout(gameTimeout);
        gameTimeout = null;
    }
}

function scheduleNextTick(interval) {
    stopGameLoop();
    gameTimeout = setTimeout(updateGame, interval || tickInterval);
}
```

**Risk:** `updateGame()` has early returns for game-over. If `gameState` is changed to anything other than 'playing' during `updateGame()`, the `setTimeout` at the end won't fire — correct behavior.

**But:** The `restartGameInterval()` pattern (called mid-game for speed changes) means the current tick's `updateGame()` will still schedule a new tick at the old interval. Then `restartGameInterval()` clears it and schedules at the new interval. This creates a **double-schedule race**. In the `setInterval` world, `clearInterval` kills the old timer immediately. With `setTimeout`, the scheduled callback might already be queued.

**Fix:** In `scheduleNextTick()`, always stop + reschedule. Never call `scheduleNextTick()` from within `updateGame()` AND from callers that modify speed. Pick one pattern:

- **Option A:** `updateGame()` always calls `scheduleNextTick()` at its end (for `gameState === 'playing'`). External callers like speed boost just change `tickInterval` — the next tick scheduled by `updateGame()` picks up the new value.
- **Option B:** External callers are responsible for scheduling. `updateGame()` never schedules itself. The `startGame()` and `resumeGame()` paths set up the initial `setTimeout`, and the callback re-schedules if `gameState === 'playing'`.

Option A is simpler and self-correcting. The speed boost logic becomes: change `tickInterval`, and the next tick naturally uses the new value. No need for `restartGameInterval()`.

**Recommendation:** Go with Option A. This reduces the conversion risk significantly.

### Effort Reassessment

| Component | Lines |
|---|---|
| 4a: Toast logic + previousHighScore | ~10 |
| 4b: imageSmoothingEnabled | ~1 |
| 4c: contextmenu event | ~2 |
| 4d: setTimeout conversion (8 touchpoints) | ~25 |
| **Total** | **~38** |

The ~30 line estimate is close, but 4d alone is ~25 lines given the number of touchpoints. Realistic total: ~40 lines.

### Verdict

- **Design sound:** Yes, except 4b has no practical effect as stated
- **Effort estimate:** Slightly low (~30 → ~40 lines)
- **Missing edge cases:** 4a needs pre-game high score snapshot; 4d needs careful double-schedule avoidance
- **Dependencies:** None (correct)
- **Conflicts:** 4d touches the game loop which is shared with all other features. Do this early or late but not mid-stream while other features are being developed.

---

## Feature 5: High-Contrast Accessibility Mode

**Verdict: Sound design. The grid cache invalidation needs attention.**

### Grid Cache Invalidation

`ensureGridCache()` uses a simple theme-name check for cache validity:

```js
if (gridCacheCanvas && gridCacheTheme === cosmetics.grid) return;
```

When high-contrast mode changes grid line opacity from 0.04 to 0.15, the theme name (`cosmetics.grid`) doesn't change — only the desired opacity does. The cache won't regenerate.

**Fix:** Include high-contrast state in the cache key:
```js
let gridCacheHighContrast = false;

function ensureGridCache() {
    const theme = GRID_THEMES[cosmetics.grid] || GRID_THEMES.grid_classic;
    if (gridCacheCanvas && gridCacheTheme === cosmetics.grid && gridCacheHighContrast === highContrast) return;
    gridCacheHighContrast = highContrast;
    // ... rebuild with opacity based on highContrast ...
    const opacity = highContrast ? 0.15 : 0.04;
    gctx.strokeStyle = theme.stroke.replace(/[\d.]+\)$/, opacity + ')');
    // ...
}
```

This adds ~5 lines but is essential for correctness.

### Snake Outline Rendering

The design says "2px white outline stroke on snake tiles." Implementation:

```js
function drawSnake(t) {
    // ... for each segment ...
    if (highContrast) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(drawX - 1, drawY - 1, TILE_SIZE + 1, TILE_SIZE + 1);
    }
    // ... then draw the colored segment as normal ...
}
```

This works for all skin types (including ghost and rainbow) because the outline is drawn first and the colored fill overwrites the interior. The 1px overflow on each side creates a 2px total outline. No conflicts with existing rendering.

### Food Labels for Common Type

Currently, common food has no label. Adding "C" requires adding it to the labels map:

```js
const labels = { common: 'C', uncommon: 'U', rare: 'R', epic: 'E', bonus: 'B', speed: 'S' };
```

And changing the condition from `if (labels[food.type])` to `if (highContrast || labels[food.type] !== 'C')`. Actually simpler: just draw labels for all types when HC is active.

### V Key Conflict Check

'V' is not currently bound in the keydown handler. The `switch` statement only handles arrow keys + WASD. Adding 'V' handling before the direction switch is clean:

```js
if ((e.key === 'v' || e.key === 'V') && gameState !== 'playing') {
    highContrast = !highContrast;
    saveManager.set('snake_high_contrast', highContrast ? '1' : '0');
    gridCacheTheme = null; // force grid cache rebuild
    queueToast(highContrast ? '🔲 High Contrast On' : 'High Contrast Off', 2000);
    return;
}
```

Wait — the design says "Toggle with V key." But 'V' should work during gameplay too (a player might want to toggle mid-game). The design implies it's a global toggle. Don't restrict to `gameState !== 'playing'`.

### HUD Indicator Placement

The design says "🔲 HC when active." Placement options:
1. Next to mute indicator (top-right, below `🔇`): `CANVAS_WIDTH - 8, 28`
2. Next to power-up HUD (top-left, wasn't discussed)

Top-right below mute indicator is clearest. Add to `drawGame()`:
```js
function drawGame(t) {
    // ...
    drawMuteIndicator();
    if (highContrast) {
        ctx.fillStyle = '#FFD700';
        ctx.font = hudFont(12);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('🔲 HC', CANVAS_WIDTH - 8, 28);
    }
}
```

### Cross-hatch Pattern Performance

Drawing 2-3 diagonal lines per obstacle × up to 80 obstacles = 240 additional line segments per frame. Trivial. No performance concern.

### Verdict

- **Design sound:** Yes, with grid cache fix
- **Effort estimate:** Accurate (~80 lines)
- **Missing edge cases:** Grid cache invalidation when HC toggles, V key should work mid-game
- **Dependencies:** None (correct)
- **Conflicts:** None with existing features

---

## Overall Plan Review

### Implementation Order

The proposed order is:
0. Bug fix
1. QoL Polish (4a-4d)
2. High-Contrast (Feature 5)
3. Seeded Runs (Feature 1)
4. Ghost Replay (Feature 2)
5. Versus Mode (Feature 3)

**Issues:**

1. **Feature 4d (setTimeout) should move earlier or later.** It touches the game loop centrally. If done as item 1, all subsequent features are built on the new loop pattern. If done late, merge conflicts are more likely. **Recommendation:** Do it as item 0.5 (immediately after bug fix) so the entire rest of the development happens with the new loop pattern.

2. **Feature 3 (Versus) should be LAST** — this is correctly ordered. It has the largest blast radius and should be done when everything else is stable.

3. **The dependency chain for Ghost → Seeds is correct.** But the seeds implementation should include the growth-marker extension point so Ghost can be built on it without rework.

**Recommended order:**
0. Bug fix (null-food)
1. setTimeout conversion (4d — foundational loop change)
2. Remaining QoL (4a-4c) — trivial, can bundle with 4d
3. High-Contrast (Feature 5) — independent
4. Seeded Runs (Feature 1) — independent, but needed by Ghost
5. Ghost Replay (Feature 2) — depends on Seeds
6. Versus Mode (Feature 3) — largest blast radius, last

### Missing Features Worth Considering

1. **Seed/game-mode URL sharing:** A `?seed=abc123&mode=classic` URL parameter that auto-fills the seed and mode on page load. Makes sharing one click instead of "type this seed, select Classic, press Enter." ~20 lines, huge usability win.

2. **Versus mode tiebreaker rounds:** The design mentions "best-of-3 or best-of-5 option (optional stretch goal)." Even without rounds, a simple "Play Again" button on the versus game-over screen would dramatically improve the party-game flow. Currently, after one player wins, both need to navigate back to idle and restart. ~15 lines.

3. **Ghost download/share:** The replay data is tiny JSON. Adding a "Copy ghost code" button that base64-encodes the replay for sharing on social media would extend the seed ecosystem. ~20 lines, optional but high-impact.

### Features Worth Dropping or Deferring

1. **Feature 4b (imageSmoothingEnabled):** As noted, this has no visible effect in the current rendering pipeline. It's harmless (1 line) but doesn't deliver the promised "crisper pixel rendering." Keep it (it's 1 line) but don't expect visible results.

2. **Feature 3 (Versus) best-of-N rounds:** The stretch goal of best-of-3/5 should be deferred to v5. Getting basic versus working is already ~280 lines.

### Cross-Cutting Risks

1. **Single-file growth:** The codebase is already 3,642 lines. Adding ~800 lines from these 6 features pushes it past 4,400. The single-file constraint becomes a real maintenance burden. Consider whether any features should be split into separate files with a build step (though this violates the "single HTML file" constraint).

2. **Global namespace:** ~100+ global variables already. Adding `activeSeed`, `isSeededRun`, `seededRandom`, `replays`, `ghostReplay`, `ghostPositions`, `snake2`, `dx2`, `dy2`, `nextDirection2`, `score2`, `prevSnake2`, `highContrast`, `gameTimeout`, `previousModeHighScore` — another 15+ globals. Name collisions with future features become increasingly likely.

3. **No regression tests:** The plan's "Testing" section lists manual verification steps. With 6 features touching the same codebase, manual testing all interactions grows combinatorially. Consider at minimum a smoke-test checklist in AGENTS.md that covers: (a) each mode starts without crash, (b) seeded runs produce identical food, (c) versus mode P2 responds to WASD, (d) ghost renders without interfering with gameplay, (e) HC toggle doesn't break grid cache.

4. **localStorage key proliferation:** Each feature adds localStorage keys. Current keys: `snake_high_score`, `snake_mode_highs`, `snake_muted`, `snake_xp`, `snake_prestige`, `snake_pinnacle`, `snake_xp_overcharge`, `snake_stats`, `snake_achievements`, `snake_unlocks`, `snake_equipped`, `snake_daily_*`, `snake_has_played`, `snake_streak_count`, `snake_daily_date`. Adding: `snake_active_seed`, `snake_replays`, `snake_high_contrast`. No quota concern but worth tracking.

---

## Summary Table

| Feature | Design Sound? | Effort (Plan) | Effort (Actual) | Risk | Key Gaps |
|---|---|---|---|---|---|
| 0. Null-food fix | Yes | 5 min | 5 min | None | Scoped 2 lines, only 1 needed |
| 1. Seeded Runs | Mostly | ~100 lines | ~165 lines | Low-Med | Daily mode UI confusion, 14+ call sites, HUD space |
| 2. Ghost Replay | Partial | ~120 lines | ~145 lines | Medium | **Missing growth events**, seed dependency understated |
| 3. Versus Mode | Mostly | ~250 lines | ~280 lines | **High** | Canvas resize blast radius, food tiebreaker, WASD routing, game-over flow |
| 4a. Toast | Yes | — | ~10 lines | Low | Needs pre-game high-score snapshot |
| 4b. imageSmoothing | Yes | — | ~1 line | None | No practical effect in current pipeline |
| 4c. contextmenu | Yes | — | ~2 lines | None | None |
| 4d. setTimeout | Yes | — | ~25 lines | Medium | Double-schedule race, 8 touchpoints |
| 5. High-Contrast | Yes | ~80 lines | ~85 lines | Low | Grid cache invalidation on toggle |

**Total estimated effort:** ~715 lines (vs. plan's implied ~585)

---

## Bottom Line

The v4 plan is well-scoped and the features are high-impact. With the fixes identified above — particularly growth markers in ghost replays, a pre-game high-score snapshot for the toast, and a careful canvas resize strategy for versus mode — the implementation should be smooth. The setTimeout conversion (4d) should be done first after the bug fix to establish the new game-loop pattern before other features build on it.

**Go/No-Go: GO, with the above amendments.**