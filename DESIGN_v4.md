# Snake Game — v4 Design Plan

## Vision
Push the already-polished Snake game further with high-impact features that create community, replayability, social play, and accessibility — all within the single HTML file constraint.

---

## Selected Features (6 total)

### Feature 0: Bug Fix — Null-Food Crash (CRITICAL)
**Source:** Agent 3, #1

**Problem:** In `updateGame()`, the snake position check `wrappedHead.x === food.x && wrappedHead.y === food.y` has no null-guard. When the board is nearly full and `generateFood()` returns null, the game crashes with `Cannot read properties of null (reading 'x')`. The rival's collision check has the same issue.

**Fix (2 lines):**
```js
// In updateGame(), player food check:
if (food && wrappedHead.x === food.x && wrappedHead.y === food.y) { ... }
// In rival collision check:
if (food && ...) { ... }
```

**Effort:** 5 minutes.

---

### Feature 1: Seeded Challenge Runs with Shareable Codes
**Source:** Agent 1, #2

**Why:** Creates community around the game. Players share seeds on social media, speedrunners compete on identical boards, content creators make "can you beat this seed?" challenges. Biggest impact-to-effort ratio of any feature.

**Behavior:**
- Add a linear congruential PRNG (`mulberry32` or xoshiro128**) — ~15 lines.
- On idle screen, show a seed input field + "Random Seed" button. Players can type any seed or generate one.
- Replace all `Math.random()` calls in game logic with `seededRandom()` when a seed is active.
- Display "Seed: XXXXXX" during gameplay (bottom-right corner) and on game-over screen with a "Copy" button.
- Daily challenge mode uses its own `getDailySeed()` — unaffected by the seed field.
- Seeds are version-stamped (`snake_seed_v1`) so code changes invalidate old seeds gracefully.
- Preserve randomized cosmetics (snake skin, grid theme, death effect) — seed only applies to game logic RNG, not UI randomness.

**Data flow:**
```
Idle screen → seed input or "Random Seed" button → seed stored in activeSeed variable
→ gameStart() checks activeSeed → initializes PRNG if set
→ All game RNG: food type/position, obstacle pattern/spawn, rival behavior, power-up spawn
→ Game does NOT use Math.random() for game logic when seed active
```

**Changes needed:**
1. Add `seededRandom()` / `mulberry32()` PRNG functions
2. Add seed input UI on idle screen (styled input + button)
3. Add `activeSeed` global and `isSeededRun` flag
4. Replace `Math.random()` call sites in game logic (food gen, obstacle gen, rival AI, power-up spawn)
5. Add seed display during gameplay + game-over screen
6. Version-stamp the seed format

**Effort:** Low-Medium (~100 lines). Seed format versioning is the trickiest part.

---

### Feature 2: Ghost Replay System ("Echo")
**Source:** Agent 1, #5 / Agent 2, #1

**Why:** The most addictive feature in racing games — competing against your past self. Combined with seeded runs, this creates a full speedrunning ecosystem within a single HTML file. Zero server needed.

**Behavior:**
- After each run (if score > 0), the game records `{tick, dx, dy}` deltas as a replay.
- Top 5 personal bests per mode are saved to localStorage.
- On subsequent runs, toggle a ghost overlay: a semi-transparent snake (alpha 0.3, distinct color) replays the saved run alongside the current game.
- Ghost is purely visual — it follows its recorded path independently, cannot interact with current food or snake.
- Ghost renders using the same `drawSnake()` with `ctx.globalAlpha = 0.3` and a fixed color.
- Ghost playback reads from the replay array on each game tick, advancing its own head position.
- **Seed dependency:** Ghost replays are only valid when the same seed is active. Replays store the seed version and seed value. Mismatch = ghost not shown (with a brief note: "Ghost disabled — different seed").

**Replay data structure:**
```js
// Saved to localStorage
{
  version: 1,
  seed: activeSeed || null,
  mode: gameMode,
  score: finalScore,
  snakeLength: finalLength,
  timestamp: Date.now(),
  // Direction changes: [{tick: 5, dx: 1, dy: 0}, {tick: 12, dx: 0, dy: -1}, ...]
  // Only store direction deltas, not every tick — snakes change direction ~20-50 times per game
  inputs: [{tick, dx, dy}, ...]
}
```

**Ghost rendering:**
```js
function drawGhostSnake(ctx, replay, currentTick) {
  if (!replay || replay.seed !== activeSeed) return;
  // Build ghost snake position from replay inputs up to currentTick
  ctx.save();
  ctx.globalAlpha = 0.3;
  // Draw ghost snake with fixed silver/cyan color
  drawSnakeBody(ctx, ghostPositions, '#66CCFF', '#4488AA');
  ctx.restore();
}
```

**Changes needed:**
1. `ReplayRecorder` — captures direction changes during gameplay
2. Replay storage — top 5 per mode, LRU eviction
3. Ghost playback engine — reconstructs position from input deltas
4. Ghost render function — draws with alpha and distinct color
5. UI toggle — button/keybind to toggle ghost on/off
6. Replay compatibility check — version + seed match

**Effort:** Medium (~120 lines).

---

### Feature 3: Local 2-Player Versus Mode
**Source:** Agent 1, #1

**Why:** The single highest-impact feature for social play. Two humans on the same keyboard competing for food, body-blocking each other, creating emergent drama rival AI cannot replicate. Turns the game from solo time-killer into a party game.

**Behavior:**
- New mode "Versus" added to `MODE_ORDER` (after Daily).
- Player 1: Arrow keys (existing). Player 2: WASD keys.
- Same food pool — both snakes compete for the same food. Whichever snake's head reaches the food first eats it.
- Self-collision kills. Snake-to-snake collision: head-to-body kills the head-owner (both die if heads collide head-on).
- No obstacles, no rival snake, no power-ups (keeps the mode clean).
- Canvas expands to 600×400 (wider aspect ratio) — gives both snakes room to maneuver. On mobile: hide this mode.
- Winner screen: "P1 Wins!" or "P2 Wins!" or "Draw!" with scores shown.
- Best-of-3 or best-of-5 option (optional stretch goal).

**Architecture:**
```
P2 state mirrors P1 state:
- snake2, dx2, dy2, nextDirection2, score2
- input buffering for WASD
- updateGame() → updatePlayer1() + updatePlayer2() in sequence
- drawGame() → drawPlayer1() + drawPlayer2() with different colors
- Food eaten by whichever head collides first
- Collision checks: P1 head vs P2 body (and vice versa), head-to-head
```

**Changes needed:**
1. Add "Versus" mode to `MODE_CONFIG` and `MODE_ORDER`
2. Duplicate snake state variables for P2 (P2 prefix)
3. WASD key handler for P2 input buffering
4. `updateVersus()` — update both snakes, compete for food
5. Collision: P1 head vs P2 body, P2 head vs P1 body, head-to-head
6. Winner detection + screen
7. Canvas size logic: 600×400 for versus, 400×400 otherwise
8. Hide on mobile
9. Mode selector overflow fix (7 modes now)

**Effort:** Medium (~250 lines).

---

### Feature 4: "New Best!" Toast & QoL Polish
**Source:** Agent 3, #2 + bonuses

**Why:** Players feel unrecognized when beating a personal high score draws no reaction. Several one-liner improvements add up to a noticeably more polished experience.

**Sub-features:**

**4a. "New Best!" Toast**
- When score exceeds the mode-specific high score, show a toast: `"🏆 NEW BEST! [Mode Name]: [Score]"`.
- Play `playSound('achievement')` and vibrate 50ms.
- Only toast on positive improvement (not first-ever score).

**4b. Disable image smoothing on canvas**
- One line: `ctx.imageSmoothingEnabled = false;` in `drawGame()`.
- Crisper pixel rendering on retina displays.

**4c. Disable context menu on canvas (mobile)**
- `canvas.addEventListener('contextmenu', e => e.preventDefault());`
- Mobile players won't get "Save Image" popup mid-game.

**4d. Replace setInterval with setTimeout chain**
- Prevents tick stacking on slow devices (the "speed-up jank").
- `setInterval` does not account for its own execution time; if `updateGame()` takes longer than the interval, ticks stack.
- `setTimeout` naturally accounts for execution time since it fires relative to NOW.
- Replace all `clearInterval(gameInterval)` / `setInterval(...)` with `stopGameLoop()` / `scheduleNextTick()`.

**Effort:** Low (~30 lines total for all 4 sub-features).

---

### Feature 5: High-Contrast Accessibility Mode
**Source:** Agent 3, #4

**Why:** ~8% of males have color vision deficiency. The game already uses shapes + letter labels for food, but contrast is still poor for obstacles, grid lines, and some food types. This makes the game playable by everyone.

**Behavior:**
- Toggle with `V` key (cycle: Normal → High Contrast).
- Active state persisted in localStorage (`snake_high_contrast`).
- When active:
  1. Food letter labels on ALL types (not just non-common) — "C" for Common, "B" for Bonus, "S" for Speed, "E" for Epic, "U" for Unique, "R" for Rare. Font: 13px bold white with 3px black stroke.
  2. Obstacle rendering: add diagonal cross-hatch pattern over the gray fill.
  3. Grid line opacity: increase from 0.04 to 0.15.
  4. Snake skin colors: add a white outline stroke on snake tiles (2px) for shape recognition independent of color.
- Visual indicator in HUD: "🔲 HC" when active.

**Changes needed:**
1. Add `highContrast` global + persistence
2. `V` key handler
3. Modified `drawFood()` — add letter labels for all types when HC active
4. Modified `drawObstacles()` — add cross-hatch when HC active
5. Modified `ensureGridCache()` — use higher opacity when HC active
6. Modified `drawGame()` — add snake outline stroke when HC active

**Effort:** Medium (~80 lines).

---

## Implementation Order

| Order | Task | Effort | Dependencies |
|-------|------|--------|-------------|
| 0 | Null-food crash fix | 5 min | None |
| 1 | QoL Polish (4a-4d) | Low | None |
| 2 | High-Contrast Accessibility Mode | Medium | None |
| 3 | Seeded Challenge Runs | Low-Med | None |
| 4 | Ghost Replay System | Medium | Seed system (F3) |
| 5 | Local 2-Player Versus Mode | Medium | None |

Features 0-3 are independent and can be done in any order.
Feature 4 (Ghost) depends on Feature 3 (Seeds) for optimal experience.
Feature 5 (Versus) is independent but touches the most code paths.

---

## Edge Cases & Cross-Feature Interactions

| Interaction | Handling |
|---|---|
| Seed + Versus mode | Versus mode ignores seed (both players need same RNG) |
| High-contrast + custom skins | Snake outline stroke applies regardless of skin |
| Ghost replay on changed code | Version stamp invalidates old replays; show "Ghost unavailable" |
| Ghost replay without seed | Works but only shows path, not food/obstacle layout |
| Versus mode on mobile | Hidden from mode selector on touch devices |
| Speed boost + setTimeout chain | `restartGameInterval()` becomes `stopGameLoop(); scheduleNextTick();` — naturally handles interval changes |
| Seed format migration | Include version number in seed string; on version mismatch, regenerate seed |

---

## Testing

Each feature should be verifiable:
1. **Null-food crash:** Artificially fill board, verify no crash
2. **New Best toast:** Start mode, get score > previous best, verify toast + sound
3. **High-contrast:** Toggle V, verify labels, cross-hatch, brighter grid
4. **Seeded runs:** Same seed → same food sequence. Verify by comparing first 10 food positions
5. **Ghost replay:** Play a run, then play again with ghost toggle, verify ghost snake follows recorded path
6. **Versus mode:** Start versus, move both snakes, verify independent control + collision
