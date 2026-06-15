# Snake Game — v7 Implementation Plan

## 1. Prerequisite Refactors

### 1.1 Extract `drawGame()` from `updateGame()` nesting

`drawGame()` is currently declared inside `updateGame()` (line 3849) at 16-space indent. Extract to module scope.

**Changes:**
- Move `function drawGame(t) { ... }` from inside `updateGame()` to module scope (after `animateVisuals()`)
- Verify all variables used inside `drawGame()` are accessible at module scope (they should be — all are closure-scoped or module-scoped `let`/`var`)
- ~0 lines changed (just dedentation and move)

### 1.2 Verify v6 state

Confirm all v6 features are implemented and working:
- `activeMutators` array (replaces `activeMutator`)
- `activeBrews`, `brewUsageFlags`, `equippedBrews`
- Floaters, diary, screen reader, responsive canvas
- Cascade mode, resonances

---

## 2. Feature A: Unified Render Scheduler

### Step 1: Add queue data structures (after line 242)

```js
// v7: Visual effect queues — producer-consumer pattern
let gameEffects = [];   // ONLY written by game-tick loop
let rAFEffects = [];    // ONLY written by rAF loop
const PRIORITY_ORDER = { critical: 3, high: 2, normal: 1, none: 0 };

function queueGameEffect(type, params) {
  gameEffects.push({
    type: type,
    color: params.color || '#FFF',
    alpha: params.alpha || 0.5,
    priority: PRIORITY_ORDER[params.priority] || 0,
    decay: params.decay || 0
  });
}

function queueRAFEffect(type, params) {
  rAFEffects.push({
    type: type,
    color: params.color || '#FFF',
    alpha: params.alpha || 0.5,
    priority: PRIORITY_ORDER[params.priority] || 0,
    decay: params.decay || 0
  });
}

function drainVisualQueue() {
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

~45 lines added after line 242.

### Step 2: Convert game-tick flashOverlay writes

Replace each `flashOverlay = {...}` in `updateGame()` with `queueGameEffect('flash', {...})`:

| Line | Current | New |
|---|---|---|
| 4031 | `flashOverlay = { color, alpha, priority: comboCount >= 10 ? 'high' : 'normal' }` | `queueGameEffect('flash', { color, alpha, priority: comboCount >= 10 ? 'high' : 'normal' })` |
| 4147 | `flashOverlay = { color: '#FFFFFF', alpha: 0.2, priority: 'normal' }` | `queueGameEffect('flash', { color: '#FFFFFF', alpha: 0.2, priority: 'normal' })` |
| 4421 | `flashOverlay = { color: tierColor, alpha: 0.4, priority: 'normal' }` | `queueGameEffect('flash', { color: tierColor, alpha: 0.4, priority: 'normal' })` |
| 4479 | `flashOverlay = { color: '#FFFFFF', alpha: 0.6, priority: 'high' }` | `queueGameEffect('flash', { color: '#FFFFFF', alpha: 0.6, priority: 'high' })` |

Also add `queueGameEffect('shake', ...)` for shake triggers where appropriate.

### Step 3: Convert rAF flashOverlay writes (lines 2553-2563)

Replace the rAF level-up flash decay section:

```js
// Current (lines 2553-2563):
if (flashOverlay && flashOverlay.priority === 'critical') {
  flashOverlay.alpha -= delta * 0.004;
  if (flashOverlay.alpha <= 0) flashOverlay = null;
}
if (levelUpFlash > 0) {
  levelUpFlash -= delta;
  if (!flashOverlay || flashOverlay.priority !== 'critical') {
    flashOverlay = { color: '#FFD700', alpha: Math.min(0.3, levelUpFlash / 5000), priority: 'critical' };
  }
}

// New:
// Decay is handled in drainVisualQueue — just queue the current level-up state
if (levelUpFlash > 0) {
  levelUpFlash -= delta;
  queueRAFEffect('flash', { color: '#FFD700', alpha: Math.min(0.3, levelUpFlash / 5000), priority: 'critical', decay: 0.004 });
}
```

### Step 4: Convert flashOverlay rendering and needsRedraw

In `drawGame()`, replace flash rendering:
```js
// Current:
if (flashOverlay) { ... }

// New:
const visualFX = drainVisualQueue();
if (visualFX.flash) { ctx.fillStyle = visualFX.flash.color; ctx.globalAlpha = visualFX.flash.alpha; ctx.fillRect(...); ctx.globalAlpha = 1; }
```

Replace `needsRedraw` check:
```js
// Current: flashOverlay !== null
// New: hasPendingEffects()
```

### Step 5: Convert resetGame() and gameOver() flashOverlay clears

Line 1344: `flashOverlay = null` → `gameEffects.length = 0; rAFEffects.length = 0;`
Line 3551: `flashOverlay = null` → same

### Step 6: Remove old `flashOverlay` variable declaration

Line 242: `let flashOverlay = null;` → remove (replaced by queue system)

**Total: ~110 lines changed/added**

---

## 3. Feature F: PWA Shell

### Step 1: Add manifest link in `<head>` (after line 5)

```html
<link rel="manifest" href="data:application/manifest+json,...">
```

Manifest JSON (URL-encoded):
- name: "Snakes", short_name: "Snakes"
- start_url: "."
- display: "standalone"
- background_color: "#222", theme_color: "#111"
- orientation: "portrait"
- icons: [inline SVG data URI — S-curve snake shape]

### Step 2: Add standalone detection (in script, after `isMobile` line 250)

```js
const isStandalone = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches
  || window.navigator.standalone === true;
```

### Step 3: Add install prompt (in script, after DOMContentLoaded)

```js
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});
```

Show "Install App" button on idle screen only when `deferredInstallPrompt !== null`.

### Step 4: Adjust canvas sizing for standalone

In `resizeCanvas()`, when `isStandalone`, account for extra vertical space (no browser chrome).

**Total: ~45 lines**

---

## 4. Feature B: Evolution System

### Step 1: Add EVOLUTION_TIERS config (after BREWS_CONFIG)

```js
const EVOLUTION_TIERS = [
  { length: 10, name: 'Swift', speedBonus: 0.05, color: '#44FF88', glow: 0 },
  { length: 25, name: 'Serpentine', obstaclePass: 1, color: '#44CCFF', glow: 4 },
  { length: 50, name: 'Titan', foodProximity: 1, color: '#FFAA44', glow: 6 },
  { length: 100, name: 'Apex', minCombo: 2, color: 'rainbow', glow: 8 },
];
```

~10 lines.

### Step 2: Add per-run state variables (near other per-run vars, ~line 550)

```js
let evolutionTier = -1;
let obstaclePassUsed = false;
```

### Step 3: Add `evolveSnake()` function

```js
function evolveSnake(tierIndex) {
  evolutionTier = tierIndex;
  const tier = EVOLUTION_TIERS[tierIndex];
  // Visual: brief flash
  queueGameEffect('flash', { color: tier.color === 'rainbow' ? '#FF44FF' : tier.color, alpha: 0.3, priority: 'normal' });
  // Sound
  playSound('achievement');
  // Toast + floater
  queueToast('⚡ Evolution: ' + tier.name + '!', 3000);
  spawnFloater(PLAY_MARGIN_LEFT + PLAY_WIDTH / 2, PLAY_MARGIN_TOP + PLAY_HEIGHT / 2, tier.name.toUpperCase() + '!', tier.color === 'rainbow' ? '#FF44FF' : tier.color, 30, 1.5);
}
```

~15 lines.

### Step 4: Add evolution trigger in food-eat block (~line 4420 area)

After snake grows:
```js
if (evolutionTier < EVOLUTION_TIERS.length - 1 && snake.length >= EVOLUTION_TIERS[evolutionTier + 1].length) {
  evolveSnake(evolutionTier + 1);
}
```

~4 lines.

### Step 5: Add gameplay bonus hooks

**Swift** — in `getEffectiveSpeed()` (line 1150):
```js
function getEffectiveSpeed() {
  let speed = slowMoActive ? getSpeed() * 2 : getSpeed();
  if (evolutionTier >= 0) speed *= (1 + EVOLUTION_TIERS[0].speedBonus);
  return speed;
}
```

**Serpentine** — in `checkPlayerDeath()` (line 4221), after shield check but before death:
```js
if (evolutionTier >= 1 && !obstaclePassUsed && isObstacleCollision(wrappedHead)) {
  obstaclePassUsed = true;
  queueToast('🛡️ Serpentine: Obstacle pass used!', 2000);
  return false;
}
```

Requires `isObstacleCollision()` helper:
```js
function isObstacleCollision(pos) {
  for (const obs of obstacles) {
    if (pos.x === obs.x && pos.y === obs.y) return true;
  }
  return false;
}
```

**Titan** — in `generateFood()` (line 1210), reduce max distance:
```js
const proximityBonus = (evolutionTier >= 2) ? EVOLUTION_TIERS[2].foodProximity : 0;
```

**Apex** — in combo reset logic (search for `comboCount = 0`):
```js
// When combo resets:
comboCount = (evolutionTier >= 3) ? 2 : 0;
```

### Step 6: Add visual morphs in `drawSnake()` (line 3105)

After the skin is resolved, add evolution-specific rendering:
- Tier 0 (Swift): render segments 1px narrower
- Tier 1 (Serpentine): add sine-wave y-offset per segment
- Tier 2 (Titan): render segments 1px wider, add shadowBlur
- Tier 3 (Apex): head color cycles through rainbow

~30 lines inside `drawSnake()`.

### Step 7: Reset in `resetGame()` (line 1320)

```js
evolutionTier = -1;
obstaclePassUsed = false;
```

**Total: ~123 lines**

---

## 5. Feature D: Visual Polish Pack

### D1: Food Spawn Pop & Idle Bob

#### Step 1: Add spawnTime to food object

In `generateFood()` (line 1210), before returning food:
```js
food.spawnTime = performance.now();
```

Also in `spawnEchoFood()` if it exists.

#### Step 2: Add easeOutBack helper

```js
function easeOutBack(t) {
  return t < 1 ? 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2) : 1;
}
```

#### Step 3: Modify `drawFood()` (line 2892)

Add spawn pop scale and idle bob per food type:
- Compute `spawnScale` from `easeOutBack(elapsed / 250)` if spawning
- Apply per-type bob offset (circle: vertical wobble, diamond: rotation, hexagon: pulse, chevron: drift)
- Wrap in `ctx.save()`/`ctx.restore()`

~65 lines.

### D2: Ambient Grid Breathing

#### Step 1: Add in `drawGame()` after `drawGrid()` call

```js
if (gameState === 'playing' && snake.length > 0) {
  ctx.save();
  var hx = headDrawX + TILE_SIZE / 2;
  var hy = headDrawY + TILE_SIZE / 2;
  var grd = ctx.createRadialGradient(hx, hy, 20, hx, hy, 120);
  var breathAlpha = 0.04 + 0.03 * Math.sin(renderTime * 0.002);
  grd.addColorStop(0, 'rgba(255,255,255,' + breathAlpha + ')');
  grd.addColorStop(0.5, 'rgba(255,255,255,' + (breathAlpha * 0.5) + ')');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, PLAY_WIDTH, PLAY_HEIGHT);
  ctx.restore();
}
```

~25 lines.

### D3: Post-Processing Vignette

#### Step 1: Add `drawPostFX()` function (module scope, after `drawGame()`)

```js
function drawPostFX() {
  ctx.save();
  // Always-on vignette
  var vig = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.4, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // Slow-mo tint (source-over, NOT multiply)
  if (slowMoActive) {
    ctx.fillStyle = 'rgba(80,0,120,0.08)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  // Death vignette crush
  if (gameState === 'gameover' && shakeTimer > 0) {
    var deathAlpha = (1 - shakeTimer / 200) * 0.3;
    var dv = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 50, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.6);
    dv.addColorStop(0, 'rgba(0,0,0,0)');
    dv.addColorStop(1, 'rgba(60,0,0,' + deathAlpha + ')');
    ctx.fillStyle = dv;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  ctx.restore();
}
```

#### Step 2: Call `drawPostFX()` in `drawGame()` — last thing before flash overlay

#### Step 3: Remove old `drawSlowMoTint()` calls, replaced by `drawPostFX()`

~70 lines.

### D4: Snake Decay Death Effect

#### Step 1: Add deathFragments array (after particles declaration)

```js
let deathFragments = [];
let deathFragmentsActive = false;
```

#### Step 2: Replace death particles in `gameOver()` (line 1911)

Remove the existing `spawnParticles()` death call. Replace with fragment spawning:
```js
// Spawn death fragments from snake segments (tail-first)
deathFragments = [];
deathFragmentsActive = true;
for (let fi = snake.length - 1; fi >= 0; fi--) {
  const seg = snake[fi];
  const angle = Math.random() * Math.PI * 2;
  const speed = 1 + Math.random() * 2;
  deathFragments.push({
    x: seg.x + TILE_SIZE / 2,
    y: seg.y + TILE_SIZE / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 1,
    life: 0.6 + Math.random() * 0.6,
    maxLife: 0.6 + Math.random() * 0.6,
    color: (fi === 0) ? snakeHeadColor : snakeBodyColor,
    size: (fi === 0) ? 5 : 2 + Math.random() * 3,
    delay: (snake.length - 1 - fi) * 15  // sequential explosion
  });
}
if (deathFragments.length > 400) deathFragments.splice(0, deathFragments.length - 400);
```

#### Step 3: Update and render fragments in `animateVisuals()`

After particles rendering, before floaters:
```js
if (deathFragmentsActive && deathFragments.length > 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let fi = deathFragments.length - 1; fi >= 0; fi--) {
    const df = deathFragments[fi];
    if (df.delay > 0) { df.delay -= delta; continue; }
    df.x += df.vx;
    df.y += df.vy;
    df.vy += 0.08; // gravity
    df.life -= delta / 1000;
    if (df.life <= 0) { deathFragments.splice(fi, 1); continue; }
    ctx.globalAlpha = df.life / df.maxLife;
    ctx.fillStyle = df.color;
    ctx.shadowBlur = df.size;
    ctx.shadowColor = df.color;
    ctx.beginPath();
    ctx.arc(df.x, df.y, df.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore(); // restores globalAlpha, compositeOp, shadowBlur
  if (deathFragments.length === 0) deathFragmentsActive = false;
}
```

#### Step 4: Clear fragments in `resetGame()`

```js
deathFragments = [];
deathFragmentsActive = false;
```

~110 lines.

**D Total: ~275 lines**

---

## 6. Feature C: Quest Board

### Step 1: Add QUEST_TEMPLATES config (after EVOLUTION_TIERS)

20 templates with `progressKey` mapping. ~50 lines.

### Step 2: Add quest generation functions

`generateDailyQuests()`, `generateWeeklyQuests()`, `instantiateQuest()`. ~40 lines.

### Step 3: Add QUEST_PROGRESS_MAP and checkQuestProgress()

Map progressKey to state variable readers. Called from food-eat block, `gameOver()`, AND `endZenSession()`. ~40 lines.

### Step 4: Add quest panel HTML (in body, after diary panel)

```html
<div id="questsPanel" class="panel" style="display:none;">...</div>
```

~30 lines.

### Step 5: Add quest panel render function

`renderQuests()` with progress bars, claim buttons, reset timers. ~40 lines.

### Step 6: Add claim logic

Atomic claim: set `claimed`, add XP, persist. ~15 lines.

### Step 7: Add persistence

Load/save daily and weekly quests + dates. ~20 lines.

### Step 8: Add Q keybinding in keydown handler (idle state)

~5 lines.

### Step 9: Add `endZenSession()` integration

Call `checkQuestProgress()` from `endZenSession()` (parallel to `gameOver()`). ~5 lines.

### Step 10: Add quest staleness check on page load / idle render

If stored quest date doesn't match current date, regenerate. ~10 lines.

**Total: ~245 lines**

---

## 7. Feature E: GameState Snapshot Engine

### Step 1: Add snapshot functions (module scope)

`saveSnapshot()`: serialize ~45 state variables to JSON, store in localStorage. ~60 lines.

`restoreFromSnapshot(data)`: deserialize and assign all state variables, call `resumeGameLoop()`. ~80 lines.

`resumeGameLoop()`: shared post-restore steps (set `gameState = 'playing'`, call `scheduleNextTick()`). ~10 lines.

### Step 2: Add URL hash interception

At the top of the hash handler (before `parseChallengeUrl()`):
```js
if (hash.startsWith('snapshot=')) {
  restoreFromSnapshotHash(hash.slice(9));
  history.replaceState(null, '', window.location.pathname);
  return;
}
```

~15 lines.

### Step 3: Add "Save & Quit" to pause menu

Add 4th menu item. Update touch hit regions (3→4 items, reduce spacing from 40px to 32px). ~30 lines.

### Step 4: Add tab-close handlers

```js
window.addEventListener('beforeunload', () => saveSnapshot());
window.addEventListener('pagehide', () => saveSnapshot());
```

~10 lines.

### Step 5: Add "Resume Run" button on idle screen

Conditional button when `snake_snapshot` exists in localStorage. ~20 lines.

### Step 6: Add clipboard sharing

"Copy Run State" on pause menu → encode to clipboard. ~20 lines.

**Total: ~275 lines**

---

## 8. Integration Checklist

### Changes to `updateGame()`
- [ ] Convert flashOverlay writes to `queueGameEffect()`
- [ ] Add evolution trigger in food-eat block
- [ ] Add quest progress check in food-eat block
- [ ] Add `isObstacleCollision()` helper
- [ ] Add Serpentine obstacle pass in `checkPlayerDeath()`
- [ ] Add Apex combo floor in combo reset
- [ ] Add `checkQuestProgress()` call from relevant hooks

### Changes to `animateVisuals()`
- [ ] Convert rAF flashOverlay writes to `queueRAFEffect()`
- [ ] Add death fragment update/render
- [ ] Add floater decay (v6 — already exists)
- [ ] Ensure `globalCompositeOperation` restore after fragments

### Changes to `drawGame()`
- [ ] Extract from `updateGame()` nesting
- [ ] Replace flash rendering with `drainVisualQueue()`
- [ ] Replace `needsRedraw` check with `hasPendingEffects()`
- [ ] Add grid breathing after `drawGrid()`
- [ ] Add `drawPostFX()` call before flash overlay
- [ ] Remove `drawSlowMoTint()` (replaced by PostFX)

### Changes to `drawFood()`
- [ ] Add spawn pop + idle bob
- [ ] Wrap in `ctx.save()`/`ctx.restore()`

### Changes to `drawSnake()`
- [ ] Add evolution visual morphs per tier

### Changes to `resetGame()`
- [ ] Clear visual queues instead of `flashOverlay = null`
- [ ] Reset `evolutionTier = -1`, `obstaclePassUsed = false`
- [ ] Clear `deathFragments`
- [ ] Reset food `spawnTime`

### Changes to `startGame()`
- [ ] Extract `resumeGameLoop()` helper
- [ ] Add quest staleness check

### Changes to `gameOver()`
- [ ] Replace death particles with death fragments
- [ ] Add `checkQuestProgress()` call
- [ ] Clear visual queues

### Changes to `endZenSession()`
- [ ] Add `checkQuestProgress()` call (parallel to `gameOver()`)

### Changes to `getEffectiveSpeed()`
- [ ] Add Swift evolution speed bonus

### Changes to `generateFood()`
- [ ] Add `food.spawnTime = performance.now()`
- [ ] Add Titan food proximity bonus

### New DOM elements
- [ ] Quests panel (`#questsPanel`)
- [ ] PWA manifest link in `<head>`
- [ ] "Resume Run" button on idle screen (conditional)

### New keybindings
- [ ] Q → toggle Quests panel (idle only)

### Persistence keys
- [ ] `snake_daily_quests`
- [ ] `snake_weekly_quests`
- [ ] `snake_daily_quest_date`
- [ ] `snake_weekly_quest_date`
- [ ] `snake_snapshot`

---

## 9. Estimated LOC Summary

| Feature | LOC |
|---|---|
| Prerequisite refactors | ~50 |
| A: Unified Render Scheduler | ~110 |
| F: PWA Shell | ~45 |
| B: Evolution System | ~123 |
| D: Visual Polish Pack | ~275 |
| C: Quest Board | ~245 |
| E: Snapshot Engine | ~275 |
| **Total** | **~1,123** |