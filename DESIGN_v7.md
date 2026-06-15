# Snake Game — v7 Design Plan

## Vision

v6 gave us brews, cascade mutator storm, snake diary, score floaters, screen reader support, and responsive canvas sizing. The game has metagame strategy, emergent synergy, personal history, and accessibility. v7 goes further: **mid-run persistence, length-as-reward, daily goals, visual spectacle, and installability** — still in the single HTML file.

Six features were selected from an 18-idea cross-domain brainstorm (gameplay, visual/juice, technical architecture) for maximum impact across different dimensions:

| Dimension | Feature |
|---|---|
| Architectural Safety | A: Unified Render Scheduler |
| Mid-Run Reward | B: Evolution System (Snake Morphs) |
| Daily Engagement | C: Quest Board (Daily/Weekly Missions) |
| Visual Juice | D: Visual Polish Pack (Food Anim, Grid Breathing, Post-FX, Death Effect) |
| Quality of Life | E: GameState Snapshot Engine (Save & Resume) |
| Platform | F: PWA Shell (Installable + Offline) |

### Implementation Order

A → F → B → D → C → E

- **A first**: Architectural fix makes all visual features safe.
- **F early**: 45-line quick win with massive impact.
- **B before D**: Evolution morphs must exist before visual polish touches `drawSnake()`.
- **C before E**: Quest state variables must exist before snapshot schema is finalized.
- **E last**: Snapshot schema must cover ALL state variables from A-F.

---

## Feature A: Unified Render Scheduler

### Overview

Replace the fragile dual-loop `flashOverlay` write contention with a producer-consumer queue pattern. The game-tick loop writes to a **producer queue**; the rAF loop writes to a **separate rAF-only buffer**; at frame start, the rAF loop drains and merges both into a single resolved effect set.

### Why It's Next-Level

AGENTS.md explicitly warns: "any future code adding a flashOverlay write creates a write-contention risk." Every visual feature we add multiplies that risk. Fixing this first makes ALL subsequent features safer.

### Design Decision (per review feedback)

The initial design had both loops writing to the SAME `visualQueue` — this doesn't fix contention, it just moves it. The correct pattern: **game-tick loop writes to `gameEffects[]`; rAF loop's decay/level-up logic writes to `rAFEffects[]`; `drainVisualQueue()` merges both at frame start.** Each array is written by ONE loop only — no shared mutable state.

### Data Model

```js
// Producer queue — ONLY the game-tick loop writes here
let gameEffects = [];

// rAF-only buffer — ONLY the rAF loop writes here (for level-up decay, etc.)
let rAFEffects = [];

const PRIORITY_ORDER = { critical: 3, high: 2, normal: 1, none: 0 };

function queueGameEffect(type, params) {
  // Called from updateGame() only
  gameEffects.push({
    type: type,        // 'flash' | 'shake'
    color: params.color || '#FFF',
    alpha: params.alpha || 0.5,
    priority: PRIORITY_ORDER[params.priority] || PRIORITY_ORDER.none,
    decay: params.decay || 0
  });
}

function queueRAFEffect(type, params) {
  // Called from animateVisuals() only (for level-up flash decay, etc.)
  rAFEffects.push({
    type: type,
    color: params.color || '#FFF',
    alpha: params.alpha || 0.5,
    priority: PRIORITY_ORDER[params.priority] || PRIORITY_ORDER.none,
    decay: params.decay || 0
  });
}

function drainVisualQueue() {
  // Called at the START of rAF's draw pass — merges both queues
  let effects = { flash: null, shake: null };
  const all = gameEffects.concat(rAFEffects);
  for (const e of all) {
    if (!effects[e.type] || e.priority > effects[e.type].priority) {
      effects[e.type] = e;
    }
  }
  gameEffects.length = 0;
  rAFEffects.length = 0;
  return effects;
}

function hasPendingEffects() {
  return gameEffects.length > 0 || rAFEffects.length > 0;
}
```

### Migration: flashOverlay → VisualQueue

**~10 flashOverlay write sites must be converted:**

| Location | Loop | New Call |
|---|---|---|
| `updateGame()` food eat flash | game-tick | `queueGameEffect('flash', {color, alpha, priority: 'normal'})` |
| `updateGame()` combo milestone | game-tick | `queueGameEffect('flash', {color, alpha, priority: 'high'})` |
| `updateGame()` painter 100% | game-tick | `queueGameEffect('flash', {color, alpha, priority: 'high'})` |
| `updateGame()` shake writes | game-tick | `queueGameEffect('shake', {duration})` |
| rAF level-up flash (initial) | rAF | `queueRAFEffect('flash', {color, alpha, priority: 'critical'})` |
| rAF level-up decay | rAF | `queueRAFEffect('flash', {alpha: decayed, priority: 'critical'})` |
| rAF snap level-up flash | rAF | `queueRAFEffect('flash', {alpha, priority: 'high'})` |
| `drawGame()` flash rendering | consumer | `const fx = drainVisualQueue(); if (fx.flash) ...` |
| `needsRedraw` check | consumer | `hasPendingEffects()` |
| Shake rendering | consumer | read from `fx.shake` returned by `drainVisualQueue()` |

**Note**: `shakeTimer` decay stays as a timer (it's a screen transform, not an overlay). The queue only handles flash effects and shake triggers. `shakeTimer` itself is decremented in rAF and read in `drawGame()` — this is safe because it's single-writer (rAF only).

### Implementation Complexity Estimate

- Queue data structure + drain + helpers: ~45 lines
- Refactor flashOverlay sites (~10): ~30 lines
- Level-up flash decay refactor: ~20 lines
- `needsRedraw` refactor: ~10 lines
- Remove old `flashOverlay` variable: ~5 lines
- **Total: ~110 lines changed**

### Risk Assessment

- **Compatibility**: Very low. Internal refactor only. The priority mapping (`PRIORITY_ORDER`) must match the existing implicit chain (critical > high > normal).
- **Performance**: Trivial. Two arrays with at most 2-3 entries each, concatenated once per frame.
- **Migration complexity**: Medium. Must find and convert ~10 write sites. The rAF decay section (lines 2552-2563) needs careful rework — level-up flash writes must move to `queueRAFEffect()`, and the decay logic must queue a new effect each frame rather than mutate `flashOverlay` directly.

---

## Feature B: Evolution System (Snake Morphs at Milestones)

### Overview

When the snake reaches specific length thresholds (10, 25, 50, 100), it "evolves" — gaining a visual transformation AND a small permanent ability for the rest of that run. Evolution turns length from purely a difficulty increase into a reward.

### Why It's Next-Level

Currently, getting longer is only a negative (harder to navigate, more self-collision risk). Evolution creates mid-run goalposts that reward the player for surviving. Each tier changes the snake's appearance and grants a small bonus.

### Data Model

```js
const EVOLUTION_TIERS = [
  { length: 10,  name: 'Swift',      speedBonus: 0.05,  visual: 'slimmer trail',  color: '#44FF88', glow: 0 },
  { length: 25,  name: 'Serpentine', obstaclePass: 1,   visual: 'wavy body',       color: '#44CCFF', glow: 4 },
  { length: 50,  name: 'Titan',      foodProximity: 1,  visual: 'thicker, border', color: '#FFAA44', glow: 6 },
  { length: 100, name: 'Apex',       minCombo: 2,       visual: 'rainbow shimmer', color: 'rainbow', glow: 8 },
];

// Per-run state (reset in resetGame)
let evolutionTier = -1;        // -1 = no evolution yet
let obstaclePassUsed = false;  // for Serpentine tier
```

**Single threshold set for all modes** (per review: mode-specific thresholds add maintenance burden with minimal gameplay benefit). Zen mode's length 100+ is trivially reachable but Zen is casual — this is intentional.

### Evolution Trigger

In the food-eat block of `updateGame()` (inline, since `eatFood()` was not extracted per v6 plan), after snake grows:
```js
if (evolutionTier < EVOLUTION_TIERS.length - 1) {
  const nextTier = EVOLUTION_TIERS[evolutionTier + 1];
  if (snake.length >= nextTier.length) {
    evolveSnake(evolutionTier + 1);
  }
}
```

### Evolution Effects

| Tier | Gameplay Effect | Implementation Point |
|---|---|---|
| **Swift** | `getEffectiveSpeed()` returns `baseSpeed * (1 + speedBonus)` | 3 lines in `getEffectiveSpeed()` |
| **Serpentine** | One-time pass-through a single **obstacle**. Requires `isObstacleCollision(pos)` helper. | 8 lines in death check |
| **Titan** | Food spawns 1 tile closer to snake head. In `generateFood()`, reduce max distance by `foodProximity` tiles. Stacks with Rampage Brew (different constraints). | 3 lines in `generateFood()` |
| **Apex** | Combo floor 2x on break. In combo reset: `comboCount = (evolutionTier >= 3) ? 2 : 0`. Does NOT re-trigger milestones already passed. | 2 lines in combo logic |

### Death Interception Order (per review)

Explicit ordering of death-prevention effects:
1. **Shield** power-up (active shield absorbs one hit)
2. **Vampire/Phoenix Brew** (strategic, chosen by player)
3. **Serpentine obstacle pass** (automatic, earned by gameplay)
4. **Actual death** → `gameState = 'gameover'`

This order ensures brew saves fire before evolution saves, because brews are chosen (strategic) and evolution is earned (automatic). Vampire doesn't waste Serpentine's obstacle pass.

### Visual Morphs

- **Swift**: Body segments render 1px narrower. Trail is slightly shorter.
- **Serpentine**: Body uses sine-wave offset per segment (wavy pattern). `shadowBlur = 4` on head.
- **Titan**: Body segments 1px wider. `shadowBlur = 6` on all segments.
- **Apex**: Head color cycles through rainbow via `renderTime`. `shadowBlur = 8`.

### Power Budget (per review)

Evolution bonuses are **per-run** and reset on death. Brews are per-run with one-shot flags. Mutators apply score penalties in cascade mode. Evolution bonuses do NOT stack multiplicatively with Brew bonuses of the same type — they are additive effects on different systems.

### Implementation Complexity Estimate

- Evolution config + data: ~30 lines
- `evolveSnake()` function: ~20 lines
- `isObstacleCollision()` helper: ~8 lines
- Gameplay bonus hooks (4): ~15 lines
- Visual morphs in `drawSnake()`: ~30 lines
- Evolution announcements (floater + toast): ~15 lines
- Reset in `resetGame()`: ~5 lines
- **Total: ~123 lines**

---

## Feature C: Quest Board (Daily/Weekly Missions)

### Overview

A rotating set of 3 daily + 3 weekly missions with specific constraints, rewarding XP (not mutator tokens). Quests give players a reason to try modes and mutators they'd otherwise ignore.

### Why It's Next-Level

The game has daily challenge seeds but no structured goal system. A quest board creates directed exploration. Daily quests create a habit loop; weekly quests provide longer-term engagement.

### Token Economy Decision (per review feedback)

Quest rewards are **XP only**, NOT mutator tokens. The current token economy (1 per achievement, spent on brews) is balanced — flooding it with 24-75 tokens/day from quests would destroy its scarcity. XP rewards preserve the existing token economy while still providing meaningful progression.

### Data Model

```js
// 20 quest templates (per review: 50 is excessive for a single-file game)
const QUEST_TEMPLATES = [
  { id: 'reach_length',   desc: 'Reach length {n}',          progressKey: 'snakeLength', params: ['n'],           rewards: { xp: 25 } },
  { id: 'score_target',   desc: 'Score {n}+ in one run',     progressKey: 'score',        params: ['n'],           rewards: { xp: 30 } },
  { id: 'combo_target',   desc: 'Reach combo x{n}',          progressKey: 'comboCount',   params: ['n'],           rewards: { xp: 20 } },
  { id: 'survive_time',  desc: 'Survive {n}s',              progressKey: 'timeAlive',    params: ['n'],           rewards: { xp: 25 } },
  { id: 'eat_food',      desc: 'Eat {n} food',              progressKey: 'foodEaten',    params: ['n'],           rewards: { xp: 15 } },
  { id: 'eat_food_type', desc: 'Eat {n} {tier} food',       progressKey: 'foodTypeCount', params: ['n','tier'],  rewards: { xp: 20 } },
  { id: 'mode_run',      desc: 'Play {mode} mode',          progressKey: 'modePlayed',   params: ['mode'],        rewards: { xp: 10 } },
  { id: 'mode_score',    desc: 'Score {n}+ in {mode}',      progressKey: 'modeScore',     params: ['n','mode'],  rewards: { xp: 35 } },
  { id: 'use_mutator',   desc: 'Play with {mutator}',       progressKey: 'mutatorUsed',  params: ['mutator'],     rewards: { xp: 15 } },
  { id: 'brew_run',      desc: 'Equip {brew} brew',         progressKey: 'brewUsed',     params: ['brew'],        rewards: { xp: 15 } },
  { id: 'walled_score',  desc: 'Score {n}+ in Walled',      progressKey: 'modeScore',     params: ['n'],           rewards: { xp: 40 } },
  { id: 'no_death_5min', desc: 'Survive 5min without dying', progressKey: 'timeAlive',    params: [],              rewards: { xp: 50 } },
  // ... 8 more with increasing difficulty
];

// Generated quest instance
const questEntry = {
  id: 'q_20260614_1',
  templateId: 'reach_length',
  desc: 'Reach length 20',
  progressKey: 'snakeLength',
  progress: 0,
  target: 20,
  completed: false,
  claimed: false,
  reward: { xp: 25 },
  period: 'daily',  // 'daily' | 'weekly'
  generatedAt: '2026-06-14T00:00:00Z',
};
```

### Quest Generation

```js
function generateDailyQuests() {
  const daySeed = getDayString();  // '2026-06-14'
  const rng = seedPrng(daySeed + '_quests');
  // ... generate 3 quests from pool using seededRandom
}
```

Weekly quests: same pattern with ISO week string seed, 3 quests, higher-difficulty params.

### Progress Tracking

Each quest template has a `progressKey` that maps to a state variable:
```js
const QUEST_PROGRESS_MAP = {
  snakeLength: () => snake.length,
  score: () => score,
  comboCount: () => comboCount,
  timeAlive: () => sessionTimeAlive,
  foodEaten: () => sessionFoodEaten,
  // ...
};

function checkQuestProgress() {
  for (const quest of activeQuests) {
    if (quest.completed) continue;
    const current = QUEST_PROGRESS_MAP[quest.progressKey]();
    quest.progress = Math.max(quest.progress, current);
    if (quest.progress >= quest.target) quest.completed = true;
  }
}
```

Called from: food-eat block (length, food count, combo), `gameOver()` AND `endZenSession()` (survival time, mode played). Per AGENTS.md: `endZenSession()` and `gameOver()` are parallel session-end paths — both must check quest progress.

Quest progress is persisted to localStorage on every progress update, independent of snapshot saves.

### Midnight Boundary

Quest date staleness is checked only at page load and on idle screen render — NOT during gameplay. If the player is mid-run when midnight passes, quests from the previous day remain active.

### UI

- **Quests panel**: DOM panel following cosmetics/achievements pattern.
- Keybinding: `Q` (idle only).
- Daily quests section: 3 quests with progress bars, reset timer.
- Weekly quests section: 3 quests, reset timer ("Resets Monday").
- Claim button: "Claim: +25 XP" — only when `deferredInstallPrompt !== null`... wait, wrong. Only when quest is completed + !claimed.
- Claim atomicity: set `claimed = true`, add XP, save BOTH quests and XP in same synchronous block.

### Persistence

```js
'snake_daily_quests'   → JSON quest array
'snake_weekly_quests'  → JSON quest array
'snake_daily_quest_date'  → date string
'snake_weekly_quest_date' → ISO week string
```

### Implementation Complexity Estimate

- Quest template pool (20): ~50 lines
- Quest generation (daily + weekly): ~40 lines
- Progress tracking + map: ~40 lines
- Quest panel HTML + CSS: ~30 lines
- Quest panel render: ~40 lines
- Claim logic: ~15 lines
- Persistence: ~20 lines
- Keybinding (Q key): ~5 lines
- `endZenSession()` integration: ~5 lines
- **Total: ~245 lines**

---

## Feature D: Visual Polish Pack

### Overview

Four visual improvements bundled: food spawn pop + idle bob, ambient grid breathing, post-processing vignette, and snake decay death effect (replacing existing death particles).

### D1: Food Spawn Pop & Idle Bob (~65 lines)

Food items play a brief scale-up "pop" on spawn and continuously bob while waiting. `spawnTime` is set inside `generateFood()` so all callers get it automatically.

```js
// In generateFood(), before returning:
food.spawnTime = performance.now();

// In drawFood():
//   spawnScale = easeOutBack(elapsed / 250) if spawning
//   Per-type bob: circle wobbles vertically, diamond rotates, hexagon pulses, chevron drifts
//   easeOutBack(t) = 1 + 2.7 * (t-1)^3 + 1.7 * (t-1)^2
```

Also applies to Echo Brew's `spawnEchoFood()` — must set `spawnTime` there too.

### D2: Ambient Grid Breathing (~25 lines)

Radial gradient overlay centered on snake head, modulated by `Math.sin(renderTime * 0.002)` for a ~3-second breathing cycle. Only when `gameState === 'playing'`. Renders between `drawGrid()` and `drawPaintGrid()` inside the play area clip, wrapped in `ctx.save()`/`ctx.restore()`.

### D3: Post-Processing Vignette (~70 lines)

`drawPostFX()` called LAST in `drawGame()` before flash overlay. Uses `source-over` (NOT `multiply` — per review, `multiply` is not available in Canvas 2D).

- **Always-on vignette**: radial gradient, transparent center → 0.15 alpha at edges.
- **Slow-mo tint**: semi-transparent purple fill (replaces flat `drawSlowMoTint()`).
- **Death vignette crush**: radial gradient red→black that intensifies as `shakeTimer` decreases.

### D4: Snake Decay Death Effect (~110 lines)

**Replaces** existing death particles (per review: don't run two death effects simultaneously). The existing `spawnParticles()` call in `gameOver()` for death is replaced with the fragment system.

On death, iterate `snake[]` in reverse (tail first), spawning `DeathFragment` per segment into `deathFragments[]`. Each fragment: `{x, y, vx, vy, life, maxLife, color, size, delay}`. The delay creates sequential tail-to-head explosion.

In `animateVisuals()`: update fragments with gravity, decay via delta time, render with `'lighter'` composite for additive glow. **Must restore** `globalCompositeOperation = 'source-over'` after rendering. Cap at 400 fragments.

Render between particles and floaters in `animateVisuals()`, but only when `gameState === 'gameover'` and `deathFragmentsActive` flag is set. Game-over overlay text renders AFTER fragments.

### Implementation Complexity Estimate

- D1 (Food pop/bob): ~65 lines
- D2 (Grid breathing): ~25 lines
- D3 (Post-FX): ~70 lines
- D4 (Death effect): ~110 lines
- Replace existing death particles: ~5 lines
- **Total: ~275 lines**

---

## Feature E: GameState Snapshot Engine (Save & Resume)

### Overview

Serialize the entire game state to a compact JSON blob, enabling save/resume across browser sessions and tab closes.

### Why It's Next-Level

The game has no mid-run persistence. Tab close = run lost. A snapshot engine solves this with zero server infrastructure.

### Data Model

**Complete schema** (per review audit of `resetGame()` variables):

```js
const snapshot = {
  v: 1,
  // Core state
  mode: 'classic',
  seed: 'abc123',
  tick: 472,
  score: 152,
  snake: [[x,y,dx,dy], ...],
  dx: 20, dy: 0,
  food: {x, y, type, spawnTime},
  food2: null,
  tickInterval: 100,
  // Combo
  comboCount: 3,
  lastComboMilestone: 5,
  lastEatTime: 1718400000000,
  // Speed
  speedBoostCounter: 0,
  // Obstacles
  obstacles: [{x,y}, ...],
  obstacleSpawnTimer: 150,
  // Power-ups
  powerUpType: null,
  powerUpTimer: 0,
  powerUpSpawnCounter: 50,
  powerUpDespawnCounter: 0,
  shieldActive: false,
  magnetActive: false,
  slowMoActive: false,
  // Rival
  rivalActive: false,
  rivalSnake: null,
  // Mutators & Brews
  activeMutators: ['gravity'],
  activeBrews: ['vampire'],
  brewFlags: {vampireUsed: false},
  cascadeMode: false,
  activeResonance: null,
  // Evolution
  evolutionTier: 1,
  obstaclePassUsed: false,
  // Mode-specific
  gauntletWave: 2,
  gauntletScore: 0,
  gauntletPicks: [],
  gauntletIntermission: false,
  gauntletWaveScore: 0,
  snapDuration: 3000,
  snapLevel: 1,
  snapTimeSinceDecrease: 0,
  timeAttackEnd: 0,
  zenActive: false,
  // Painter
  paintGrid: null,  // compressed: [[col,row,color,layer], ...]
  paintCoveredCount: 0,
  paintTotalTiles: 400,
  paintLayers: 1,
  currentPaintColor: '#FF4444',
  painterFoodEaten: 0,
  // Mutator-specific
  shrinkTimer: 2500,
  shrinkRows: 0,
  shrinkCols: 0,
  hungerStarted: false,
  hungerTickCounter: 0,
  chaosShuffleTick: 0,
  chaosCurrentWeights: null,
  // Session stats
  sessionFoodEaten: 12,
  sessionFoodTypes: ['common', 'rare'],  // converted from Set
  sessionSpeedFood: 0,
  sessionBonusFood: 0,
  sessionTimeAlive: 45,
  sessionMaxCombo: 5,
  sessionXP: 120,
  sessionPausedTime: 0,
  sessionPauseStart: 0,
  sessionStartTime: 1718400000000,
  sessionUsedShield: false,
  lastEatenType: 'common',
  // Replay
  replayEvents: [...]  // truncated to current tick
};
```

**~45 fields** total. The schema version comment must list every field with its type as a maintenance contract.

### URL Hash Handling (per review)

Snapshot URL hash (`#snapshot=<data>`) must be intercepted BEFORE the existing `parseChallengeUrl()`:
```js
const hash = window.location.hash.slice(1);
if (hash.startsWith('snapshot=')) {
  restoreFromSnapshotHash(hash.slice(9));
  history.replaceState(null, '', window.location.pathname);
  return;
}
// ... existing parseChallengeUrl() ...
```

### Restore Logic

`restoreFromSnapshot()` mirrors `startGame()` but skips: daily attempt consumption, streak update, brew initialization, rival spawn, gauntlet init. Extract common post-restore steps into `resumeGameLoop()`:
```js
function resumeGameLoop() {
  gameState = 'playing';
  scheduleNextTick();
}
```

Used by both `startGame()` and `restoreFromSnapshot()`.

### Tab-Close Safety

Save snapshot on pause AND on `beforeunload` AND on `pagehide` (more reliable on mobile iOS):
```js
window.addEventListener('beforeunload', () => saveSnapshot());
window.addEventListener('pagehide', () => saveSnapshot());
```

### Set Serialization

`sessionFoodTypes` is a `Set` — must convert: `[...sessionFoodTypes]` on serialize, `new Set(data.sessionFoodTypes)` on restore.

### Implementation Complexity Estimate

- Schema + serialize: ~80 lines
- Deserialize + restore: ~80 lines
- `resumeGameLoop()` helper: ~10 lines
- Pause menu integration (4th item, touch regions updated): ~30 lines
- Tab-close handlers: ~20 lines
- "Resume Run" idle button: ~20 lines
- URL hash interception: ~15 lines
- Clipboard sharing: ~20 lines
- **Total: ~275 lines**

---

## Feature F: PWA Shell (Installable + Offline)

### Overview

Add a web app manifest (inlined as data URI) and standalone mode detection. 45 lines for a massive UX upgrade.

### Web App Manifest (Inlined)

```html
<link rel="manifest" href="data:application/manifest+json,...">
```

SVG icon: simple S-curve path in 192×192 viewBox (minimizes encoding complexity). Test in Chrome, Firefox, and Safari.

### Standalone Mode Detection

```js
const isStandalone = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches
  || window.navigator.standalone === true;
```

Extends v6's existing `@media (display-mode: standalone)` CSS rule.

### Install Prompt

Show "Install App" button ONLY when `deferredInstallPrompt !== null` (Chrome only). On other browsers, don't show non-functional button.

### Implementation Complexity Estimate

- Manifest data URI: ~10 lines
- SVG icon: ~8 lines
- Standalone detection: ~12 lines
- Install prompt: ~15 lines
- **Total: ~45 lines**

---

## Cross-Cutting Concerns

### Persistence (saveManager)

| Key | Type | Feature | Max Size |
|---|---|---|---|
| `snake_daily_quests` | JSON QuestEntry[] | C (Quests) | ~3KB |
| `snake_weekly_quests` | JSON QuestEntry[] | C (Quests) | ~3KB |
| `snake_daily_quest_date` | string | C (Quests) | ~20B |
| `snake_weekly_quest_date` | string | C (Quests) | ~20B |
| `snake_snapshot` | JSON Snapshot | E (Save/Resume) | ~15KB |

Total: ~21KB new + existing ~250KB = ~271KB. Well within 5MB localStorage quota.

### Draw Order

Current (v6): `grid → obstacles → food → snake → particles/trails → floaters → overlays → flash`

New (v7): `grid → **grid breathing** → obstacles → food **(with pop/bob)** → snake **(with evolution morph)** → particles → **death fragments** → floaters → overlays → **post-FX vignette** → flash`

### Keybinding Summary

| Key | Feature | State | Action |
|---|---|---|---|
| Q | C (Quests) | idle | Toggle Quests panel |

### Prerequisite Refactors

1. **Extract `drawGame()` from `updateGame()` nesting** — currently nested at 16-space indent. Move to module scope.
2. **`eatFood()` remains inline** — v6 planned extraction but didn't complete. v7 hooks into the inline block.

### Test Plan

- **A**: Verify flash, shake effects render correctly. Test concurrent effects.
- **B**: Verify each evolution tier triggers at correct length. Verify death interception order. Verify `isObstacleCollision()` distinguishes obstacles from self-collision.
- **C**: Verify quest generation determinism. Verify progress tracking in both `gameOver()` and `endZenSession()`. Verify midnight boundary handling.
- **D**: Verify food pop, grid breathing, vignette, death fragments. Verify `save()`/`restore()` discipline. Verify death fragments REPLACE existing death particles.
- **E**: Verify save/restore roundtrip for all ~45 state fields. Verify tab-close + pagehide auto-save. Verify URL hash interception order.
- **F**: Verify manifest loads. Verify standalone detection in Chrome, Safari, Firefox. Verify install button only shows on Chrome.

---

## Estimated Total

| Feature | LOC | Risk | Category |
|---|-----|------|----------|
| A: Unified Render Scheduler | ~110 | Medium | Architectural |
| B: Evolution System | ~123 | Low | Gameplay |
| C: Quest Board | ~245 | Low | Metagame |
| D: Visual Polish Pack | ~275 | Low | Visual/Juice |
| E: Snapshot Engine | ~275 | Medium | QoL/Platform |
| F: PWA Shell | ~45 | Low | Platform |
| Prerequisite refactors | ~50 | Low | — |
| **Total** | **~1,123** | | |