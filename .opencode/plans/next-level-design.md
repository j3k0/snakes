# Snake Game: Next Level Design Spec

## Vision

Transform the Snake game from "solid but static" to "alive and replayable" by addressing three critical gaps:
1. **Visual smoothness** — snake jumps between cells; rendering runs redundantly
2. **Engagement cliff** — meta-game dead-ends after level 20; stats are decorative; achievements are thin
3. **Mobile/accessibility blockers** — panels trap touch users; food is color-only (invisible to color-blind players)

---

## Feature 1: Smooth Snake Interpolation

**Difficulty:** Medium
**Impact:** High — the single most visible improvement

### Problem
Snake movement is purely discrete: it snaps 20px per game tick. At slow speeds (120ms ticks), the snake visibly stutters — 8 position updates per second looks choppy on a 60fps display.

### Architecture
The game already has a dual render loop (setInterval for game logic, requestAnimationFrame for visual effects). Interpolation leverages this split: game logic stays on the tick, rendering interpolates between states.

### Implementation

**State tracking:**
```javascript
let prevSnake = [];      // deep copy of snake[] before each updateGame()
let lastTickTime = 0;   // performance.now() at start of each updateGame()
let tickInterval = 120;  // current setInterval delay in ms, updated on speed changes
```

**In updateGame() (beginning):**
```javascript
prevSnake = snake.map(s => ({ x: s.x, y: s.y }));
// ... existing game logic ...
// At end: remove drawGame() call (see Feature 2)
lastTickTime = performance.now();
```

**Track interval changes** — every `setInterval(updateGame, X)` call must also update `tickInterval = X`. There are **7 call sites** that must be updated:

| Line | Context | Interval Value |
|------|---------|---------------|
| ~379 | Slow-mo activate (in `activatePowerUp()`) | `getSpeed() * 2` |
| ~394 | Slow-mo deactivate (in `deactivatePowerUp()`) | `getSpeed()` |
| ~512 | `startGame()` | `getSpeed()` |
| ~1516 | Speed-food boost | `Math.max(MIN_SPEED, getSpeed() - 30)` |
| ~1521 | Speed-food boost timeout restore | `slowMoActive ? getSpeed() * 2 : getSpeed()` |
| ~1531 | Non-speed-food eat interval reset | `slowMoActive ? getSpeed() * 2 : getSpeed()` |
| ~1975 | Pause resume | `slowMoActive ? getSpeed() * 2 : getSpeed()` |

Each must set `tickInterval` to the same value passed to `setInterval`.

**In animateVisuals() (rAF loop):**
```javascript
const elapsed = timestamp - lastTickTime;
const t = Math.min(elapsed / tickInterval, 1);
drawGame(t);
```

**In drawSnake(interpolation):**
```javascript
function drawSnake(t) {
    let grew = snake.length > prevSnake.length;
    snake.forEach(function(segment, index) {
        let drawX, drawY;
        if (index === 0 || !prevSnake[index]) {
            // Head or new segment: interpolate from PREVIOUS segment's position
            // (head: use prev head; new tail: use current position)
            drawX = segment.x;
            drawY = segment.y;
            if (index === 0 && prevSnake.length > 0) {
                const prevHead = prevSnake[0];
                const dx = segment.x - prevHead.x;
                const dy = segment.y - prevHead.y;
                if (Math.abs(dx) <= CANVAS_WIDTH / 2) drawX = prevHead.x + dx * t;
                if (Math.abs(dy) <= CANVAS_HEIGHT / 2) drawY = prevHead.y + dy * t;
            }
        } else if (grew) {
            // Body segment during growth: use previous index's old position
            // (each segment shifted forward one slot)
            const prev = prevSnake[index - 1];
            drawX = segment.x;
            drawY = segment.y;
            const dx = segment.x - prev.x;
            const dy = segment.y - prev.y;
            if (Math.abs(dx) <= CANVAS_WIDTH / 2) drawX = prev.x + dx * t;
            if (Math.abs(dy) <= CANVAS_HEIGHT / 2) drawY = prev.y + dy * t;
        } else {
            // Normal: segment at index maps to previous position at same index
            const prev = prevSnake[index];
            drawX = segment.x;
            drawY = segment.y;
            const dx = segment.x - prev.x;
            const dy = segment.y - prev.y;
            if (Math.abs(dx) <= CANVAS_WIDTH / 2) drawX = prev.x + dx * t;
            if (Math.abs(dy) <= CANVAS_HEIGHT / 2) drawY = prev.y + dy * t;
        }
        // ... render segment at (drawX, drawY)
    });
}
```

**For non-playing states** (idle, paused, gameover), pass `t = 1` to show settled state.

**For rival snake**, add parallel `prevRivalSnake` tracking with same logic. When `rivalActive` is false or `rivalSnake.length === 0`, skip rival interpolation entirely.

**Growing detection**: Track `let snakeGrew = false` — set true in `updateGame()` when food is eaten (the `snake.push(tail)` path). Pass to `drawSnake` via global or include in interpolation state.

### Edge Cases
- **Wrap-around interpolation**: When the snake wraps (x goes from 380 to 0), the delta exceeds CANVAS_WIDTH/2. Detect and skip interpolation for that axis (snap to current position).
- **Snake growing**: On growth frames, body segment indices shift. Each segment at index i should interpolate from prevSnake[i-1] (predecessor's old position), not prevSnake[i]. Head interpolates from prevSnake[0]. New tail segment (index >= prevSnake.length) uses current position.
- **Game start**: `prevSnake` is empty on first frame; fall back to current position.
- **Rival removal**: When `rivalSnake` goes from N segments to 0 (rival defeated), `prevRivalSnake` has stale entries. Guard by checking `rivalActive && rivalSnake.length > 0` before interpolating.

---

## Feature 2: Single Render Path (Remove Double Rendering)

**Difficulty:** Easy
**Impact:** Medium — eliminates redundant draw calls, prerequisite for interpolation

### Problem
drawGame() is called from both updateGame() (line 1623) and animateVisuals() (line 964). During gameplay, the entire scene is drawn twice per game tick.

### Implementation

1. **Remove drawGame() call from updateGame()** (line 1623). The rAF loop is the sole render path.
2. **Add a visual dirty flag:**
```javascript
let visualDirty = true;
```
3. **Set `visualDirty = true`** at ALL state-mutation sites — this is critical. Every location that currently calls `drawGame()` directly must set `visualDirty = true` instead (or in addition). The specific sites are:

| Line | Context | Action |
|------|---------|--------|
| 451 | `resetGame()` | Set `visualDirty = true` |
| 516 | `startGame()` | Set `visualDirty = true` |
| 800 | `gameOver()` | Set `visualDirty = true` |
| 822 | `endZenSession()` | Set `visualDirty = true` |
| ~1939 | Arrow key mode select up | Set `visualDirty = true` |
| ~1946 | Arrow key mode select down | Set `visualDirty = true` |
| ~1964 | Pause | Set `visualDirty = true` |
| ~1977 | Resume | Set `visualDirty = true` |
| ~2105 | Visibility change pause | Set `visualDirty = true` |

The idle-state mode selector arrows are particularly important: since no particles/timers are active in idle, the `needsRedraw` condition would be false without `visualDirty = true`, and the mode highlight wouldn't update visually.
4. **Gate drawGame() in animateVisuals():**
```javascript
const needsRedraw = visualDirty || particles.length > 0 || flashOverlay || shakeTimer > 0 || eatAnimTimer > 0 || snapLevelUpFlash > 0 || (gameMode === 'snap' && gameState === 'playing');
if (needsRedraw) {
    visualDirty = false;
    drawGame(interpolation);
}
```
5. **Move ghost trail and sparkle rendering** from animateVisuals() into a new `drawTrails()` function called from within `drawGame()` after `drawRival()`. The sparkle trail effect must NOT call `spawnParticles()` from within `drawGame()` (that would be a state write during render). Instead, move the `gameTick % 5 === 0` sparkle spawn check to `updateGame()` and only render existing particles in `drawTrails()`. Use a `lastSparkleTick` counter or similar to ensure sparkle particles spawn once per game tick regardless of rAF rate.

6. **Keep existing synchronous `drawGame()` calls** in `gameOver()` and `endZenSession()` for now. These render the gameover overlay immediately, which is fine. The rAF loop will also render on the next frame. These can be migrated to `visualDirty = true` later once the rAF-only path is verified.

### Draw Order (Updated)
```
drawGame(t):
  1. drawGrid()
  2. drawObstacles()
  3. drawFood()
  4. drawPowerUp()
  5. drawSnake(t)
  6. drawRival(t)
  7. drawTrails(t)
  8. drawHUD()
  9. drawOverlays()

animateVisuals(timestamp):
  1. Compute delta, update particles, timers
  2. Compute interpolation t
  3. If needsRedraw: drawGame(t)
  4. Draw flash overlay (LAST, on top of everything)
  5. Draw snap level-up flash
  6. Animate score counter
  7. Update DOM (combo, XP)
  8. requestAnimationFrame(animateVisuals)
```

---

## Feature 3: Unlock Curve Fill + Prestige System

**Difficulty:** Medium
**Impact:** High — fixes the fundamental engagement cliff

### A: Fill Existing Level Gaps

| Level | New Unlock | Type | Description |
|-------|-----------|------|-------------|
| 5 | trace_fire | Trail | Orange ember particles behind snake |
| 6 | grid_void | Grid | Dark purple bg, magenta grid lines |
| 8 | death_frost | Death | Ice-blue burst, 40 particles |
| 11 | snake_midnight | Skin | Navy head, dark steel-blue body |
| 14 | trace_neon | Trail | Cyan glowing ghost trail |
| 16 | grid_cyberpunk | Grid | Yellow stroke on dark bg |
| 17 | death_gold | Death | Golden particle shower, 45 particles |
| 18 | snake_lava | Skin | Orange-red head, dark red body |
| 19 | trace_rainbow | Trail | Multi-color sparkle trail |

### B: Prestige System (Level 20+)

When a player reaches level 20+, they can Prestige from the idle screen:
- Resets XP to 0 and level to 1
- Increments a new `prestigeLevel` counter (stored in localStorage)
- Unlocks prestige-exclusive cosmetics
- Preserves achievements and stats

| Prestige | Unlock | Type | Description |
|----------|--------|------|-------------|
| 1 | border_gold | Border | Golden canvas border glow |
| 2 | snake_ghost | Skin | Translucent snake (globalAlpha 0.7) |
| 3 | death_lightning | Death | Electric blue lightning burst |
| 4 | grid_tron | Grid | Tron-style blue wireframe grid |
| 5 | trail_galaxy | Trail | Starfield particle trail |

Add `border` as a new cosmetic category in the cosmetics panel.

### C: Streak Cosmetic Rewards

| Streak Days | Unlock | Type | Description |
|-------------|--------|------|-------------|
| 3 | trail_streak_3 | Trail | Warm shimmer trail |
| 7 | grid_streak_7 | Grid | Special streak-border grid theme |
| 14 | snake_veteran | Skin | Weathered olive/military skin |
| 30 | death_fireworks | Death | Firework burst death effect |

Checked on daily game start. If streak meets a milestone and the cosmetic is not yet unlocked, add it and show a toast.

---

## Feature 4: New Achievements + Stats Tracking

**Difficulty:** Low
**Impact:** High — uses already-tracked stats; multiplies achievement density

### New Stats Fields

Add to `getDefaultStats()`:
```javascript
rivalsDefeated: 0,
shieldBlocks: 0,
magnetEats: 0,
dailyCompleted: 0,
epicFoodEaten: 0,
```

Track at existing code locations:
- `rivalsDefeated`: increment **only at line ~724** (where player head collision kills rival), NOT in `removeRival()` generically (which also covers stuck/self-destruct deaths)
- `shieldBlocks`: increment in shield activation blocks (lines ~1433 and ~1451). Description: "Block 3 collisions total across all shields"
- `magnetEats`: increment in food-eating block when `magnetActive` is true
- `dailyCompleted`: increment in `checkDailyCompletion()` when challenge is met
- `epicFoodEaten`: increment in food-eating block when `eatenType === 'epic'`

**CRITICAL: Stats migration**: `loadStats()` must merge saved data with `getDefaultStats()` using `Object.assign(getDefaultStats(), saved)` to prevent `undefined` values for new fields. Without this, new stats fields will render as "undefined" in the stats panel.

### New Achievements (15 additions)

**Mode-specific:**
- TIME_CRUNCH: Score 150+ in Time Attack (250 XP)
- ZEN_MASTER: Reach length 30 in Zen mode (200 XP) — **requires changing Zen mode to `achievementsEnabled: true`** while keeping `earnXP: false` for gameplay XP. The achievement awardXP() call bypasses the mode check directly.
- SNAP_SURVIVOR: Reach Snap Level 5 (250 XP)
- DAILY_DEVOTEE: Complete 7 daily challenges (500 XP)

**Stat milestones:**
- ROAD_WARRIOR: Travel 10,000 tiles total (300 XP) — uses stats.totalDistance
- CENTURION: Play 100 games (400 XP) — uses stats.gamesPlayed
- IRON_WILL: Die 50 times (200 XP) — uses stats.totalDeaths
- MARATHON_TIME: Total time played > 1 hour (300 XP) — uses stats.totalTimePlayed
- LONG_LEGACY: Longest snake ever > 40 (350 XP) — uses stats.longestLength

**Rival interactions:**
- RIVAL_SLAYER: Defeat 5 rival snakes total (250 XP) — uses stats.rivalsDefeated

**Power-ups:**
- SHIELD_MASTER: Block 3 collisions with shield (250 XP) — uses stats.shieldBlocks
- MAGNET_KING: Eat 30 food while magnet active (250 XP) — uses stats.magnetEats

**Streak:**
- STREAK_WEEK: Reach 7-day daily streak (500 XP)

**Food variety:**
- FOODIE: Eat 500 normal foods total (500 XP) — uses stats.normalFoodEaten
- EPICURE: Eat 30 epic foods total (600 XP) — uses stats.epicFoodEaten

Mode-specific achievements need `gameMode` passed to check functions. Modify `checkAchievements()` to add `gameMode` as a third parameter.

**Toast timer conflict**: The shared `window.achToastTimer` and `window.lvlToastTimer` cause achievement toasts to be suppressed when daily completion fires in sequence. Add a simple toast queue: push toast messages onto an array, and display them sequentially with `setTimeout`, so they never suppress each other.

---

## Feature 5: Mobile UX Fixes (Panel Close + Mode Selection)

**Difficulty:** Low
**Impact:** Critical — game-breaking on mobile

### 5A: Panel Close Buttons + Backdrop

Add a backdrop div and close buttons to all three panels:
```html
<div id="panelBackdrop" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;
     background:rgba(0,0,0,0.5);z-index:99;touch-action:manipulation;"></div>
```

In each `show*Panel()`: show backdrop, append close button, add backdrop click handler.

New function: `closeAllPanels()` — hides all panels and backdrop.

**IMPORTANT**: The backdrop click handler must call `e.stopPropagation()` to prevent click propagation to the canvas, which would set direction or start the game. Also, the `show*Panel()` functions currently toggle visibility (line 1885: `if (el.style.display === 'block') { el.style.display = 'none'; return; }`). When closing via backdrop, this toggle would re-open the panel. The backdrop click handler must set all panels to `'none'` directly, not call the show functions.

### 5B: Touch Mode Selection + Touch Guard

In the touchend handler, add idle-state swipe handling:
```javascript
if (gameState === 'idle') {
    if (Math.abs(dy_touch) > Math.abs(dx_touch) && Math.abs(dy_touch) > 30) {
        if (dy_touch < 0) modeSelectIndex = (modeSelectIndex + 1) % MODE_ORDER.length;
        else modeSelectIndex = (modeSelectIndex - 1 + MODE_ORDER.length) % MODE_ORDER.length;
        gameMode = MODE_ORDER[modeSelectIndex];
        visualDirty = true;
        drawGame(1);
        return;
    }
    // Horizontal swipes in idle: ignore (don't set direction)
    return;
}
```

**CRITICAL**: Add a `gameState === 'playing'` guard before the existing `setNextDirection()` call at line ~2095. Currently, horizontal swipes in idle state call `setNextDirection()` unguarded, setting a stale direction that gets applied when the game starts.

---

## Feature 6: Shape-Coded Food for Color-Blind Accessibility

**Difficulty:** Low
**Impact:** Affects ~8% of male players

### Implementation

Modify `drawFood()` to draw distinct shapes per tier. All shapes are drawn with pixel-aligned integer coordinates for crisp rendering. Wrap the entire drawFood body in `ctx.save()`/`ctx.restore()` to prevent state leaks on non-glow tiers.

| Tier | Shape | Visual Description | Color |
|------|-------|-------------------|-------|
| Common | Circle | Simple filled circle (radius 8px) | #FF4444 |
| Uncommon | Diamond | 4-point diamond shape | #4488FF |
| Rare | Triangle | Upward-pointing triangle | #44FF44 |
| Epic | Hexagon | 6-point regular hexagon | #AA44FF |
| Bonus | Pulsing circle | Pulsing circle (existing behavior, circle instead of square) | #FFD700 |
| Speed | Chevron | Double chevron (>>  shape) | #00FFFF |

**Shape distinctness**: Circle, diamond, triangle, hexagon, and chevron are maximally distinct from each other at 20px — no two shapes share the same number of vertices or visual profile.

**Letter labels**: Use **10px bold** with a **dark background circle** (semi-transparent black circle behind the letter) instead of white-on-bright. For non-common tiers only. Use a dark fill (#111) with white text (#FFF) for guaranteed contrast. Labels: U, R, E, B, S for uncommon/rare/epic/bonus/speed.

**No label for common food** (it's the most frequent and needs the least visual clutter).

---

## Implementation Order

| Step | Task | Depends On | Risk |
|------|------|------------|------|
| 1 | Panel close buttons + backdrop + closeAllPanels() | — | Low |
| 2 | Touch mode selection (swipe in idle state) | — | Low |
| 3 | Remove double render + visual dirty flag | — | Low |
| 4 | Smooth interpolation: prevSnake, tickInterval, drawSnake(t) | Step 3 | Medium |
| 5 | Smooth interpolation for rival snake | Step 4 | Low |
| 6 | Shape-coded food rendering | — | Low |
| 7 | New stats tracking (rivalsDefeated, shieldBlocks, magnetEats, dailyCompleted, epicFoodEaten) | — | Low |
| 8 | New achievements (15 new ones) | Step 7 | Low |
| 9 | Fill unlock curve (9 new cosmetics) | — | Low |
| 10 | Streak cosmetic rewards | — | Low |
| 11 | Prestige system (UI, cosmetics, panel update) | Step 9 | Medium |
| 12 | Trail rendering refactor (move into drawGame as drawTrails) | Step 3 | Low |