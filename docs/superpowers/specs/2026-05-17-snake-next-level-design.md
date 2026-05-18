# Snake Game — Next Level Design (v3)

## Vision
Transform the polished Snake game into a complete "game as a service" experience with meta-progression, achievements, cosmetics, and multiple game modes — all within a single HTML file. Players earn XP, level up, unlock cosmetics, and tackle achievements across 4 game modes.

## Architectural Approach
Stay as a single HTML file. All new state stored in `localStorage` (extending existing `snake_high_score` / `snake_muted` pattern). All overlay panels (stats, achievements, cosmetics) are DOM overlays styled to match the dark canvas aesthetic. No canvas-rendered overlays.

No new external dependencies. Vanilla JS throughout.

---

## Feature 1: Stats Tracking + XP & Level System

### Stats Tracking
Persistent lifetime stats stored in localStorage under key `snake_stats`:

```js
{
  gamesPlayed: 0,
  totalScore: 0,
  maxScore: 0,
  totalFoodEaten: 0,
  normalFoodEaten: 0,
  bonusFoodEaten: 0,
  speedFoodEaten: 0,
  longestLength: 0,
  longestTimeAlive: 0,   // ms
  totalTimePlayed: 0,     // ms
  totalDistance: 0,       // tiles traversed
  maxCombo: 0,
  totalDeaths: 0
}
```

**Hooks:**
- `resetGame()` — reset per-session trackers
- `startGame()` — record `sessionStartTime`
- `updateGame()` tick — increment `stats.totalDistance`, survival XP tick (every 10th tick), increment `gameTick`
- `updateGame()` food eat — increment food type counters, check longestLength
- `gameOver()` — merge session stats into lifetime stats, persist to localStorage

**Display:** Stats panel toggled by `Tab` key (DOM overlay). Shows key stats.

### XP & Level System

**Sources:**
| Source | XP | When |
|--------|-----|------|
| Eat normal food | 25 | On eat |
| Eat bonus food | 60 | On eat |
| Eat speed food | 40 | On eat |
| Survival tick | 1 | Per 10 game ticks |
| End-of-game | length × 10 | On game over |

Per-tick survival XP counter: `if (gameTick % 10 === 0) awardXP(1)` — so it checks every 10th tick.
`gameTick` is a counter that increments on each `updateGame()` call.

**Level thresholds:** `levelThreshold(n) = 100 × n × (n + 1) / 2`

| Level | XP Needed | Cumulative |
|-------|-----------|------------|
| 1 | 0 | 0 |
| 2 | 100 | 100 |
| 3 | 200 | 300 |
| 4 | 300 | 600 |
| 5 | 400 | 1,000 |
| 10 | 900 | 4,500 |
| 15 | 1,400 | 10,500 |
| 20 | 1,900 | 19,000 |
| 25 | 2,400 | 30,000 |
| 30 | 2,900 | 43,500 |

**Globals:** `let xp, level, sessionXP, comboCount, lastEatTime, sessionStartTime, gameTick;`

**Level-up notification:** Brief particle burst + DOM toast "Level Up! You are now level N" (auto-fades after 3s).

**Display on idle/gameover overlays:** "Lv. N | XP: X / Y"

### Combo Mechanic
- Combo triggers when eating food within 3 seconds of the last food eaten
- Combo counter increments: 0 → 1 → 2 → 3 → 4 → 5 (capped at 5x)
- Combo multiplies XP only (NOT score): `xpMultiplier = 1 + combo × 0.5` (so 5x combo = 3.5× XP)
- Combo resets to 0 when: 3+ seconds pass without eating, OR game over
- Visual: combo counter shown near score as "x3 COMBO!" that pulses
- Combo uses Date.now() real-time (not game ticks)
- Auto-pause (visibility change) does NOT reset combo — timer resumes on unpause

---

## Feature 2: Achievement System

15 achievements across 4 categories. One-time unlocks. Each rewards XP.

All achievements require `gameMode === 'classic'` or `gameMode === 'timeAttack'`. No achievements unlock in Zen mode. The achievements panel shows which mode(s) each achievement is available in.

### Score Achievements

| ID | Name | Criteria | XP | Modes |
|----|------|----------|-----|-------|
| `FIRST_BITE` | First Bite | Eat first food ever | 25 | Classic, Time Attack |
| `CENTURY` | Century | Score 100 in one game | 100 | Classic, Time Attack |
| `QUINTESSENCE` | Quintessence | Score 500 in one game | 300 | Classic, Time Attack |
| `MILLENNIUM` | Millennium | Score 1,000 in one game | 500 | Classic, Time Attack |

### Food Achievements

| ID | Name | Criteria | XP | Modes |
|----|------|----------|-----|-------|
| `BONUS_FEAST` | Bonus Feast | Eat 10 bonus foods total | 100 | Classic, Time Attack |
| `SPEED_DEMON` | Speed Demon | Eat 10 speed foods total | 100 | Classic, Time Attack |
| `GOURMAND` | Gourmand | Eat 100 normal foods total | 200 | Classic, Time Attack |
| `GLUTTON` | Glutton | Eat 20 foods in one game | 150 | Classic, Time Attack |

### Survival Achievements

| ID | Name | Criteria | XP | Modes |
|----|------|----------|-----|-------|
| `SURVIVOR` | Survivor | Survive 1 minute in one game | 100 | Classic, Time Attack |
| `MARATHONER` | Marathoner | Survive 3 minutes in one game | 300 | Classic, Time Attack |
| `LONG_BOI` | Long Boi | Reach snake length 20 | 150 | Classic, Time Attack |
| `SERPENT` | Serpent | Reach snake length 50 | 400 | Classic, Time Attack |

### Special Achievements

| ID | Name | Criteria | XP | Modes |
|----|------|----------|-----|-------|
| `HAT_TRICK` | Hat Trick | Eat all 3 food types in one game | 150 | Classic, Time Attack |
| `COMBO_3` | Combo Lord | Reach 3x combo | 150 | Classic, Time Attack |
| `COMBO_5` | Combo Master | Reach 5x combo | 300 | Classic, Time Attack |

### Storage
```js
// localStorage key: snake_achievements
// Value: { "CENTURY": 1684321000123, ... }  (timestamp or absent means locked)
```

### Implementation
- `checkAchievements(trigger, context)` called from food_eat and game_over hooks
- On unlock: save timestamp, play unlock particle effect, show DOM toast "Achievement Unlocked: Century!", award XP
- Achievements screen toggled by `F` key (DOM overlay, shows locked/unlocked status and eligible modes)
- Use emoji icons for visual appeal: 🏆💯🍽️⏱️⭐

### Edge Cases
- Achievement check functions must handle missing stats gracefully on first play
- Toast notifications queue if multiple achievements unlock at once (show one at a time, 2s apart)

---

## Feature 3: Unlockable Cosmetics

### Categories

**Snake Colors (6):**
| ID | Name | Unlock | Colors |
|----|------|--------|--------|
| `snake_green` | Classic | Default | #00FF00 / #00CC00 |
| `snake_cyan` | Cyan | Level 2 | #00FFFF / #00CCCC |
| `snake_purple` | Purple | Level 4 | #9B59B6 / #7D3C98 |
| `snake_gold` | Gold | Level 7 | #FFD700 / #DAA520 |
| `snake_fire` | Fire | Level 10 | #FF4500→#8B0000 gradient |
| `snake_rainbow` | Rainbow | Level 15 | HSL hue shift per segment |

**Grid Themes (3):**
| ID | Name | Unlock | Style |
|----|------|--------|-------|
| `grid_classic` | Classic | Default | rgba(255,255,255,0.04) |
| `grid_neon` | Neon | Level 3 | rgba(0,255,255,0.08) |
| `grid_matrix` | Matrix | Level 12 | rgba(0,255,65,0.1) |

**Trace Effects (3):**
| ID | Name | Unlock | Visual |
|----|------|--------|--------|
| `trace_none` | None | Default | No trail |
| `trace_ghost` | Ghost Trail | Level 9 | Fading previous 3 tail positions, alpha 0.15→0.02 |
| `trace_sparkle` | Sparkle Trail | Level 15 | Tiny particles from tail every 5 ticks |

**Death Effects (3):**
| ID | Name | Unlock | Visual |
|----|------|--------|--------|
| `death_classic` | Classic Burst | Default | 30 red/orange particles |
| `death_blue` | Blue Burst | Level 13 | 30 blue particles |
| `death_rainbow` | Rainbow Burst | Level 20 | 50 multi-color particles |

### Storage
```js
// snake_unlocks: ["snake_cyan", "grid_neon", ...]
// snake_equipped: { snake: "snake_green", grid: "grid_classic", trace: "trace_none", death: "death_classic" }
```

### Selection UI
- Toggle with `C` key (when not playing)
- DOM overlay showing current loadout
- Left/Right arrows cycle through unlocked options
- Changes apply immediately to canvas rendering
- Only one overlay can be active at a time

### Hook Points
- `drawSnake()` — look up equipped snake color config
- `drawGrid()` — look up equipped grid theme config
- `drawTrace()` — look up equipped trace effect config
- `triggerDeathEffect()` — look up equipped death effect config
- Level-up function adds new unlocks based on level thresholds

---

## Feature 4: Game Mode Selector

### Game State Machine

```
        ┌─────────────┐
        │    idle     │
        └──────┬──────┘
               │ Enter (first play) / arrow navigation
               ▼
        ┌─────────────┐
        │ modeSelect  │◄─── arrow keys select mode
        └──────┬──────┘
               │ Enter
               ▼
        ┌─────────────┐     Escape / P      ┌─────────┐
        │   playing   │────────────────────►│ paused  │
        └──────┬──────┘◄────────────────────└─────────┘
               │
               │ collision / time out
               ▼
        ┌─────────────┐
        │  gameOver   │
        └──────┬──────┘
               │ Enter
               └────────────► idle

Zen exception:
playing ──► (Enter) ──► endZenSession() ──► summary overlay ──► Enter ──► idle
```

States:
- `idle`: attract screen. First-time players auto-skip to Classic.
- `modeSelect`: entered from idle. Arrow keys select mode, Enter starts game.
- `playing`: active gameplay.
- `paused`: game loop halted, overlays blocked.
- `gameOver`: death/time-out summary. Zen mode never enters this state.

### MODE_CONFIG Architecture
Instead of scattered if/else branches, use a config object:

```js
const MODE_CONFIG = {
  classic: {
    speed: 'dynamic',
    selfCollision: true,
    wallDeath: false,
    wrap: true,
    timer: null,
    foodTypes: ['normal', 'bonus', 'speed'],
    foodProbs: { normal: 0.70, bonus: 0.20, speed: 0.10 },
    scoreIs: 'points',
    earnXP: true,
    achievements: true,
  },
  timeAttack: {
    speed: 80,
    selfCollision: true,
    wallDeath: false,
    wrap: true,
    timer: 60000, // ms
    foodTypes: ['normal', 'bonus'],  // no speed food
    foodProbs: { normal: 0.60, bonus: 0.40 },
    scoreIs: 'points',
    earnXP: true,
    achievements: true,
  },
  zen: {
    speed: 150,
    selfCollision: false,
    wallDeath: false,
    wrap: true,
    timer: null,
    foodTypes: ['normal', 'bonus'],
    foodProbs: { normal: 0.70, bonus: 0.30 },
    scoreIs: 'length',
    earnXP: false,
    achievements: false,
  }
};
```

### Modes

**Classic** — Existing gameplay unchanged. Standard speed curve, wall wrapping, all food types, score = points. XP and achievements enabled.

**Time Attack** — 60-second countdown. Score max points. No speed food. Bonus food awards +50 points (not +30). Game over when timer hits 0. Speed fixed at 80ms.
- Timer uses wall-clock time (`Date.now()`), not game ticks
- Timer PAUSES when game is paused (visibility change or `P` key)
- `timeAttackEnd = Date.now() + 60000` on start
- On resume from pause: recalculate `remaining = timeAttackEnd - Date.now()`
- Timer rendered on canvas HUD as "TIME: 0:45"
- Game over when timer hits 0 → trigger `gameOver()` with `reason="time"`

**Zen** — No collision with self. No collision with walls (wrapping still works). Snake can cross itself. Score = snake length. Speed fixed at 150ms.
- XP earning disabled in Zen mode (all sources)
- Score is measured as snake length, not points
- Game never ends automatically. Player presses Enter to end Zen session, which then shows summary, then returns to idle

### Mode Select UI
- On idle screen, show mode selector with arrow key navigation:
  ```
  SELECT MODE
  ← Classic →      (highlighted)
    Time Attack
    Zen
  Press ENTER to play
  ```
- Arrow keys move highlight up/down. Enter starts selected mode.
- Selected mode shown below mode name: brief description + rules summary.

### Implementation
- New global: `let gameMode = 'classic';`
- Branch logic in key functions:
  - `startGame()` — apply mode-specific speed/score config from `MODE_CONFIG`
  - `updateGame()` — branch collision logic (Zen skips self-collision), increment `gameTick`, award survival XP every 10th tick
  - `getSpeed()` — return mode-specific speed
  - `drawOverlay()` — render mode select UI when `gameState === 'idle'` and not first-time player
  - `gameOver()` — Time Attack mode overrides score comparison; Zen mode calls `endZenSession()` instead
- Per-mode high scores stored in localStorage

---

## Implementation Order

| Order | Feature | Depends On | Effort |
|-------|---------|------------|--------|
| 1 | Stats Tracking + XP & Level System | — | Medium |
| 2 | Achievement System | Feature 1 (stats, XP) | Medium |
| 3 | Unlockable Cosmetics | Feature 1 (level gates) | Medium |
| 4 | Game Mode Selector | — (independent) | High |

## Implementation Notes

### First-Time Player Experience
- First-time player detection: if `snake_stats` doesn't exist in localStorage, it's a first play
- First play: auto-select Classic mode (skip mode selector), show only "SNAKE - Press ENTER to Start"
- After first game over: introduce mode selector and level/XP on second idle screen
- Progressive disclosure: show keybinding hints only after relevant feature is first encountered
- Level/XP display hidden until player reaches level 2

### localStorage Batching
- All state persisted in a single `saveAllState()` call on game over
- Keys: `snake_stats`, `snake_xp`, `snake_level`, `snake_achievements`, `snake_unlocks`, `snake_equipped`, `snake_high_score`, `snake_muted`
- Write batch: `batchSave()` gathers all, calls `setItem` once per key
- Add version field to all stored objects for migration path

### Food Generation & Overlap Checking
- `generateFood()` must check if the snake fills the board before entering the do-while loop, otherwise it infinite-loops
- Include `disabled` short-circuit guard during overlap checking when no valid tiles remain
- Food items use a monotonic `id` counter for debug / analytics tracking

## Keybindings

| Key | Action | When |
|-----|--------|------|
| `Tab` | Toggle stats panel | Any time |
| `F` | Toggle achievements panel | Any time |
| `C` | Toggle cosmetics panel | Not playing |
| `Escape` | Close any active overlay | Any time |
| `Arrow keys` | Navigate mode select / cosmetic options | Idle / cosmetics panel |

**Overlay state machine:** Only ONE overlay can be active at a time. Opening a new overlay closes the current one. `Escape` closes any active overlay and returns to the underlying game state.

## Data Migration

No migration needed. New localStorage keys are all namespaced (`snake_stats`, `snake_xp`, `snake_level`, `snake_achievements`, `snake_unlocks`, `snake_equipped`, `snake_mode_highs`). Old keys (`snake_high_score`, `snake_muted`) continue to work. First load initializes all new keys with defaults.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| localStorage null/corrupt | All JSON.parse wrapped in try-catch with fallback to defaults |
| First-time player | All systems start at zero; default cosmetics; no achievements; level 1 |
| Achievement toast during gameplay | DOM toast, non-blocking, auto-dismiss 3s |
| Multiple achievements at once | Queue toasts, show one at a time 2s apart |
| Zen mode + achievements | Achievements track per-mode; all achievements disabled in Zen |
| Mode switch mid-game | Not allowed — mode selected only on idle screen |
| Board full (food generation) | `generateFood()` checks fill before do-while loop; if full, skip spawn |
| Pause during combo timer | Combo `Date.now()` timer resumes on unpause; does not reset |
| Time Attack pause | Wall-clock timer recalculated on resume; HUD updates immediately |
