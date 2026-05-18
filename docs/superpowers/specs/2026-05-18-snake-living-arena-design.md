# The Living Arena — Snake Game "Next Level" Design

> **Spec Status:** Draft v1
> **Date:** 2026-05-18

## Vision

Transform the current Snake game from a solitary score-chaser into a dynamic "living arena" where the player contends with an AI rival, deploys power-ups to gain advantage, and faces a relentless survival mode — all while the game world feels alive and responsive. Built on top of the existing food tiers, combos, XP/progression, cosmetics, and daily challenges.

## Feature 1: Rival Snake (AI Nemesis)

### Summary
An AI-controlled opponent snake that patrols the board independently, competes for food, and creates dynamic spatial tension. The rival eats food, grows, and can kill the player (head-to-body collision). If the rival's head touches the player's body, the rival dies and drops a bonus.

### Design

**Spawn:** The rival snake spawns when the game starts (Classic/Time Attack modes only). It starts at length 3 on the opposite side of the board from the player. Its initial direction is random (not toward the player).

**AI Behavior (per tick):**
1. With 70% probability: move toward the nearest food tile (Manhattan distance pathfinding — prefer axis that reduces distance, with random tie-breaking)
2. With 20% probability: continue current direction (maintains momentum)
3. With 10% probability: random valid turn (adds unpredictability)

The AI rejects moves that would cause immediate self-collision or obstacle collision. If all valid moves lead to collision, the rival dies (removed from board). The AI does NOT chase the player — it competes for resources.

**Collision Rules:**
- Player head touches rival body → player dies
- Player head touches rival head → player dies
- Rival head touches player body → rival dies with particle explosion + bonus XP
- Rival head touches player head → player dies
- Rival self-collision → rival dies

**Rival Death:** 20 particles at head, +100 XP + 50 bonus score, toast "Rival Defeated!", new rival spawns after 10 seconds.

**Rival Growth:** +1 segment per food eaten, max length 20. Food eaten by rival is consumed.

**Integration:**
- New globals: `rivalSnake[]`, `rivalDx`, `rivalDy`, `rivalActive`, `rivalRespawnTimer`
- `resetGame()` initializes rival
- `updateGame()` adds rival AI + movement + collision
- `drawSnake()` renders rival with distinct colors (red body, yellow head)
- `gameOver()` cleans up rival
- Board-full check in `generateFood()` adds rival length

## Feature 2: Power-Up Drops

### Summary
Special glowing pickups spawning at 8% probability. Three types: Shield (absorbs one collision), Magnet (pulls food toward snake for 5s), Slow-Motion (halves game speed for 4s).

### Design

**Spawn:** 8% chance in `generateFood()`. Equal probability among three types. Max 1 active on board.

| Type | Color | Shape | Duration | Effect |
|------|-------|-------|----------|--------|
| Shield | Blue #4488FF | Circle | Until used | Absorbs next collision; pops with particles |
| Magnet | Green #44FF44 | Star | 5 seconds | Food within 4-tile radius moves toward head |
| Slow-Mo | Purple #AA44FF | Diamond | 4 seconds | Game interval doubles (half speed) |

**Implementation:**
- `POWERUP_TYPES` config object near `FOOD_TIERS`
- `shieldActive`, `magnetActive`, `slowMoActive` booleans + timers
- Shield: negates collision in `updateGame()`, blue burst particles
- Magnet: moves food 1 tile/tick toward head if within 4-tile radius
- Slow-Mo: `clearInterval`/`setInterval` with doubled interval
- HUD bar at top of canvas showing active power-up + remaining duration
- Only one power-up active at a time (new pickup overwrites current)

## Feature 3: Snap Mode (One-Bite Challenge)

### Summary
New game mode: snake shrinks by 1 segment every 3 seconds. Eating is required for survival, not just scoring.

### Design

**MODE_CONFIG:**
```js
snap: {
    name:'Snap', speed:90, selfCollision:true, wallDeath:false, wrap:true,
    timer:null, scoreIs:'points', earnXP:true, achievementsEnabled:true
}
```

Add `'snap'` to `MODE_ORDER`.

**Shrink Mechanic:**
- `shrinkTimer = 3000` initialized in `resetGame()`
- Decrements each tick. When <= 0: if length <= 1 → game over; else `snake.pop()`, reset timer, poof particles
- Eating food resets timer to 3000. Rare/epic foods add +1000ms (max 5000). Bonus adds +2000ms.
- Circular timer ring around snake head, color: green→yellow→red

**HUD:** "SNAP MODE" label + timer bar at top of canvas.

## Feature 4: Technical Improvements

### 4a. Batched Grid Rendering
Consolidate 42 individual `beginPath()`/`stroke()` calls into one batched path in `drawGrid()`.

### 4b. Fix `gameInterval = null` in `gameOver()`
Add `gameInterval = null;` after `clearInterval(gameInterval)` at line 461.

### 4c. Fix Draw Order
Ensure flash overlay renders LAST in `animateVisuals()` (after particles/trails).

### 4d. Shared Direction Utility
Extract `setNextDirection(newDx, newDy)` function from duplicated code in keydown + touch handlers.

## Implementation Order
1. Technical quick wins (batched grid, gameInterval null, setNextDirection, flash overlay)
2. Snap Mode
3. Power-Up System
4. Rival Snake (most complex)

## Out of Scope
- Background music, boss encounters, portals, ghosts, HiDPI scaling
