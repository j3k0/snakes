# Snake Game v4 — Implementation Plan

Incorporating feedback from two design reviews. This plan adjusts scope, effort, and ordering based on critical findings.

---

## Adjusted Scope

Based on review feedback, Scope is being **reduced** for this iteration. The two high-risk features are deferred:

| Feature | Status | Rationale |
|---------|--------|-----------|
| F0. Null-food crash | ✅ Implement now | 5 min, critical bug |
| F1. Seeded Challenge Runs | ✅ Implement now | Medium effort, high impact |
| F2. Ghost Replay System | ✅ Implement now | Medium effort, pairs with seeds |
| F3. Local 2-Player Versus | ❌ **DEFERRED** | 600-700 lines, 50+ function changes, canvas refactor. Too risky. |
| F4. QoL Polish | ✅ Implement now | Low effort, high polish |
| F5. HC Accessibility | ✅ Implement now | Medium effort, important |

**F3 (Versus Mode) is cut from this iteration.** It needs its own dedicated planning/implementation cycle. The canvas-width change alone touches ~50+ code sites and the ~600 line estimate makes it too large to do alongside the other features.

---

## Implementation Order

```
F0 → F4 (4a/4b/4c first, 4d last) → F5 → F1 → F2
```

Rationale:
- F0 (crash fix) is trivially safe.
- F4a/4b/4c (toast, imageSmoothing, contextmenu) are independent quick wins.
- F4d (setTimeout chain) changes the game-loop pattern — do it early so seeds/ghosts build on the new loop.
- F5 (HC mode) is independent, no dependencies.
- F1 (Seeds) and F2 (Ghosts) share data (seed determinism) — implement as a pair.

---

## F0: Null-Food Crash Fix

**Review concern addressed:** Need guards in TWO places — player food collision AND rival food collision.

**Changes needed:**

1. In `updateGame()`, player food collision (~line 2593):
   ```js
   // BEFORE:
   if (wrappedHead.x === food.x && wrappedHead.y === food.y) {
   // AFTER:
   if (food && wrappedHead.x === food.x && wrappedHead.y === food.y) {
   ```

2. In `updateGame()`, rival food collision (~line 2621):
   ```js
   // Add food guard before rival eating food
   if (food && checkRivalCollision(rivalSnake[0], food)) {
   ```

**File:** `snake.html`  
**Estimate:** 2 lines, 2 minutes.  
**Test:** No crash when board is full after rival eats last food.

---

## F4: QoL Polish

### F4a: "New Best!" Toast

**Review concern addressed:** Need pre-game high-score snapshot.

**Add to** `updateScoreDisplay()` (called each tick):
```js
// Track mode high score snapshot at game start
let sessionModeHighStart = 0;  // set in startGame()

// In updateScoreDisplay() or gameOver():
if (score > modeHighScores[gameMode]) {
    const prevBest = modeHighScores[gameMode] || score;  // snapshot taken at startGame
    modeHighScores[gameMode] = score;
    saveManager.setJSON('snake_mode_highs', modeHighScores);
    if (sessionModeHighStart > 0 && score > sessionModeHighStart) {
        queueToast('🏆 NEW BEST! ' + MODE_CONFIG[gameMode].name + ': ' + score, 3000);
        playSound('achievement');
    }
}
```

In `startGame()`:
```js
sessionModeHighStart = modeHighScores[gameMode] || 0;
```

**Estimate:** ~15 lines.  
**Test:** Play a mode, get score > previous best, verify toast + sound.

### F4b: imageSmoothingEnabled = false

One line in `drawGame()`:
```js
ctx.imageSmoothingEnabled = false;
```

**Estimate:** 1 line, 30 seconds.  
**Test:** Retina display — grid lines should be crisp.

### F4c: Disable context menu on canvas

```js
canvas.addEventListener('contextmenu', e => e.preventDefault());
```

**Estimate:** 1 line, 30 seconds.  
**Test:** Long-press on mobile — no "Save Image" popup.

### F4d: Replace setInterval with setTimeout chain

**Review concern addressed:** 5 call sites for restartGameInterval; speed boost + slow-mo interaction non-trivial.

**New architecture:**

```js
// REPLACE: gameInterval
// ADD:     gameTimeout

function scheduleNextTick() {
    if (gameState !== 'playing') return;
    gameTimeout = setTimeout(() => {
        updateGame();
        // AFTER updateGame completes:
        if (gameState === 'playing') {
            scheduleNextTick();
        }
    }, tickInterval);
}

function stopGameLoop() {
    if (gameTimeout) { clearTimeout(gameTimeout); gameTimeout = null; }
}

function restartGameTimeout() {
    stopGameLoop();
    if (gameState === 'playing') {
        scheduleNextTick();
    }
}
```

**Replace all usages:**
| Old | New |
|-----|-----|
| `gameInterval = setInterval(updateGame, tickInterval)` | `scheduleNextTick()` |
| `clearInterval(gameInterval); gameInterval = null` | `stopGameLoop()` |
| `restartGameInterval(speed)` | `tickInterval = speed; restartGameTimeout()` |
| `clearInterval(gameInterval)` in auto-pause | `stopGameLoop()` |
| `clearInterval(gameInterval)` in endZenSession | `stopGameLoop()` |

**Key insight from review:** `restartGameInterval()` is called from inside `updateGame()` for speed boosts and boost expiry. With setTimeout, we don't need to restart at all — just update `tickInterval` and the NEXT tick will use the new speed:

```js
// Inside updateGame(), speed food eaten:
// BEFORE: restartGameInterval(getEffectiveSpeed() - 30);
// AFTER:  tickInterval = getEffectiveSpeed() - 30;
//         (no need to restart — next tick uses new tickInterval)

// Inside updateGame(), speedBoostCounter expires:
// BEFORE: restartGameInterval(getEffectiveSpeed());
// AFTER:  tickInterval = getEffectiveSpeed();
```

**Important:** Currently `restartGameInterval` is called from these 5 locations:
1. `startGame()` — line 908 → replace with `scheduleNextTick()`
2. `activatePowerUp()` — line 693 → replace with `tickInterval = ...; restartGameTimeout()`
3. `deactivatePowerUp()` — line 710 → replace with `tickInterval = ...; restartGameTimeout()`
4. `resumeGame()` — line 1227 → replace with `scheduleNextTick()`
5. `updateGame()` speed-food — line 2681 → just set `tickInterval`
6. `updateGame()` boost expire — line 2832 → just set `tickInterval`

**Estimate:** ~15 lines new functions + ~15 lines replacements = ~30 lines.  
**Test:** Speed food boost works (interval decreases, then restores), slow-mo power-up works, auto-pause/resume works, Zen mode end works.

---

## F5: High-Contrast Accessibility Mode

**Review concern addressed:** Grid cache needs double-keyed approach.

```js
let highContrast = false;  // new global

// Toggle: press V
document.addEventListener('keydown', (e) => {
    if (e.key === 'v' || e.key === 'V') {
        highContrast = !highContrast;
        saveManager.set('snake_high_contrast', highContrast ? '1' : '0');
        visualDirty = true;
    }
});

// Load on init:
highContrast = saveManager.get('snake_high_contrast', '') === '1';
```

**Changes per area:**

1. **Grid cache** — modify cache key:
   ```js
   // In ensureGridCache():
   const cacheKey = cosmetics.grid + (highContrast ? '_hc' : '');
   if (gridCacheCanvas && gridCacheTheme === cacheKey) return;
   ```
   Draw grid with increased stroke opacity when HC active:
   ```js
   gctx.strokeStyle = highContrast
       ? 'rgba(255,255,255,0.15)'
       : theme.stroke;
   ```

2. **Food letter labels** — `drawFood()`:
   ```js
   // Add letter labels for ALL food types when HC active
   if (highContrast) {
       const labels = { normal: 'C', bonus: 'B', speed: 'S', epic: 'E', unique: 'U', rare: 'R' };
       ctx.font = 'bold 13px Arial';
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       ctx.fillStyle = '#FFFFFF';
       ctx.strokeStyle = '#000000';
       ctx.lineWidth = 3;
       ctx.strokeText(labels[food.type] || '?', x + TILE_SIZE/2, y + TILE_SIZE/2);
       ctx.fillText(labels[food.type] || '?', x + TILE_SIZE/2, y + TILE_SIZE/2);
   }
   ```

3. **Obstacle cross-hatch** — `drawObstacles()`:
   ```js
   if (highContrast) {
       ctx.strokeStyle = 'rgba(255,255,255,0.4)';
       ctx.lineWidth = 1;
       ctx.beginPath();
       ctx.moveTo(x, y); ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE);
       ctx.moveTo(x + TILE_SIZE, y); ctx.lineTo(x, y + TILE_SIZE);
       ctx.stroke();
   }
   ```

4. **Snake outline** — `drawSnake()`:
   ```js
   if (highContrast) {
       ctx.strokeStyle = '#FFFFFF';
       ctx.lineWidth = 1.5;
       ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
   }
   ```

5. **HUD indicator** — near mute indicator:
   ```js
   if (highContrast) {
       ctx.fillStyle = 'rgba(255,255,255,0.6)';
       ctx.font = '11px Arial';
       ctx.textAlign = 'right';
       ctx.fillText('HC', CANVAS_WIDTH - 24, CANVAS_HEIGHT - 26);
   }
   ```

**Estimate:** ~80 lines.  
**Test:** Toggle V during game, verify: brighter grid, letter labels on all food, cross-hatch on obstacles, white outline on snake, "HC" label visible.

---

## F1: Seeded Challenge Runs

**Review concern addressed:**
- 19 Math.random() call sites (not 25 — 6 are cosmetic)
- Speed boost breaks seed determinism → use fixed tick interval for seeded runs
- Daily mode isolation → check `isSeededRun` flag
- Rival AI depends on seed → rival uses same PRNG (so it IS deterministic)
- `resetGame()` must preserve seed state → add soft reset path

**PRNG: mulberry32** (~15 lines, well-tested for game use):
```js
let seedPrng = null;  // function reference when seeded

function mulberry32(a) {
    return function() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function seededRandom() {
    return seedPrng ? seedPrng() : Math.random();
}
```

**Seed input UI** on idle screen (after "Best" display):
```html
<div id="seedInput" style="display:flex; align-items:center; gap:6px; margin-top:6px;">
    <input type="text" id="seedField" placeholder="Seed..." style="width:110px; padding:3px 6px; background:#222; color:white; border:1px solid #555; border-radius:4px; font-family:monospace; font-size:12px;">
    <button id="seedRandomBtn" style="padding:3px 8px; background:#333; color:white; border:1px solid #555; border-radius:4px; cursor:pointer; font-size:11px;">🎲</button>
    <button id="seedClearBtn" style="padding:3px 8px; background:#333; color:#aaa; border:1px solid #555; border-radius:4px; cursor:pointer; font-size:11px;">✕</button>
</div>
```

**Replace Math.random call sites** (19 game-logic sites in these functions):
- `pickRandomFoodType()` — `Math.random()` → `seededRandom()`
- `generateFood()` — position X,Y + fallback
- `spawnPowerUpPickup()` — type + position
- `pickWeightedPattern()` — pattern selection
- `findFreeTile()` — random position
- `generateObstacles()` — count + pattern anchor + fallback
- `spawnRival()` — position + corner
- `updateRival()` — AI decision + direction shuffle
- `updateGame()` — progressive obstacle spawn count

**Seed display** during gameplay:
```js
// In drawGame() or HUD area:
if (activeSeed !== null) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Seed: ' + activeSeed, CANVAS_WIDTH - 5, CANVAS_HEIGHT - 6);
}
```

**Fixed speed for seeded runs:** When `activeSeed` is set, force speed to a fixed value and disable speed-boost food:
```js
// In updateGame(), when processing speed food:
if (activeSeed !== null) {
    // Speed food gives +5 points but no speed boost (keeps runs deterministic)
    score += 5;
    // Skip the speed boost logic
} else {
    // Normal speed boost path
}
```

**resetGame() seed preservation:** Add check at top:
```js
function resetGame() {
    // Don't clear seed state
    // ... rest of reset logic ...
}
```

**Estimate:** ~165 lines.  
**Test:** Same seed produces same food sequence. Speed food doesn't change tick interval. Daily mode unaffected.

---

## F2: Ghost Replay System ("Echo")

**Review concern addressed:**
- **Critical: Need growth markers** — direction deltas alone can't reconstruct snake length. Add `{tick, event: 'grow'}` events.
- **Replay depends on seed** — mandatory, not optional. No seed = no ghost.
- **Ghost advances on logical game ticks** via `gameTick` counter, not real time.

**Replay format:**
```js
const REPLAY_VERSION = 1;

// In memory during gameplay:
let replayEvents = [];  // [{tick: number, type: 'dir', dx: number, dy: number} | {tick: number, type: 'grow'}]

// On direction change:
replayEvents.push({ tick: gameTick, type: 'dir', dx, dy });

// On food eat (snake grows):
replayEvents.push({ tick: gameTick, type: 'grow' });
```

**Saved replay (localStorage):**
```js
{
    version: REPLAY_VERSION,
    seed: activeSeed,
    mode: gameMode,
    score: finalScore,
    maxLength: snake.length,
    timestamp: Date.now(),
    events: replayEvents  // compact array
}
```

**Save and load:**
```js
const MAX_REPLAYS_PER_MODE = 5;

function saveReplay(replay) {
    let replays = loadReplays(replay.mode);
    replays.push(replay);
    replays.sort((a, b) => b.score - a.score);
    replays = replays.slice(0, MAX_REPLAYS_PER_MODE);
    saveManager.setJSON('snake_replays_' + replay.mode, replays);
}

function loadReplays(mode) {
    return saveManager.getJSON('snake_replays_' + mode, []);
}
```

**Ghost rendering:** During `drawGame()`, after drawing obstacles and before drawing the current snake:
```js
function drawGhostSnake(ctx, ghostPositions) {
    if (!ghostPositions || ghostPositions.length === 0) return;
    ctx.save();
    ctx.globalAlpha = 0.3;
    const color = '#66CCFF';
    for (let i = 0; i < ghostPositions.length; i++) {
        const seg = ghostPositions[i];
        ctx.fillStyle = i === 0 ? '#88DDFF' : color;
        ctx.fillRect(seg.x, seg.y, TILE_SIZE - 1, TILE_SIZE - 1);
    }
    ctx.restore();
}
```

**Ghost position rebuild** — on each game tick, reconstruct ghost positions from events up to current `gameTick`. Events on the SAME tick must be processed together to avoid double-moving the head when a direction change and growth happen simultaneously.

```js
let ghostPositions = [];  // rebuilt each tick

function rebuildGhost(replay, currentTick) {
    if (!replay || replay.seed !== activeSeed) return [];
    let head = { x: TILE_SIZE * 10, y: TILE_SIZE * 10 };  // start at center
    let body = [{...head}];
    let dx = TILE_SIZE, dy = 0;
    let lastTick = -1;
    
    for (const evt of replay.events) {
        if (evt.tick > currentTick) break;
        
        // Update direction at any time
        if (evt.type === 'dir') { dx = evt.dx; dy = evt.dy; }
        
        // When tick changes, advance the head exactly once
        if (evt.tick !== lastTick && lastTick >= 0) {
            head = { x: head.x + dx, y: head.y + dy };
            body.unshift({...head});
        }
        if (lastTick < 0) lastTick = evt.tick;
        
        // Track that this tick has a growth event
        // Will trim body at the end
        
        if (evt.tick !== lastTick) lastTick = evt.tick;
    }
    
    // Advance one more tick for the current tick
    if (lastTick <= currentTick) {
        head = { x: head.x + dx, y: head.y + dy };
        body.unshift({...head});
    }
    
    // Trim body: each 'grow' event adds 1 segment, +1 for initial segment
    const growthEvents = replay.events.filter(e => e.tick <= currentTick && e.type === 'grow').length;
    const expectedLen = growthEvents + 1;
    while (body.length > expectedLen) {
        body.pop();
    }
    
    // Wrap positions and ensure at least 1 segment
    return body.length > 0 ? body.map(p => wrapPosition(p)) : [];
}
```

**Ghost toggle UI:** Add button on idle screen and keybind (G key) to toggle ghost display during gameplay.

**Estimate:** ~120 lines.  
**Test:** Play a seeded run with ghost on. Verify ghost snake follows recorded path. Swap seed — ghost disappears.

---

## Testing Plan

| After implementing | Test |
|-------------------|------|
| F0 | Fill board with rival, let rival eat last food, verify no crash on next tick |
| F4a | Beat personal high score, verify toast + sound |
| F4b | Inspect retina display rendering — grid lines crisp |
| F4c | Long-press canvas on mobile — no context menu |
| F4d | Eat speed food, verify speed changes. Auto-pause, resume, verify loop. Zen mode end, verify clean exit. |
| F5 | Press V, verify all food has letter labels, obstacles have cross-hatch, grid is brighter, snake has outline |
| F1 | Enter seed "ABC123", play, note food sequence. Restart same seed, verify identical sequence. |
| F1 | Play with daily mode, verify seed field doesn't affect daily seed |
| F2 | Play seeded run, save ghost. Play same seed with ghost on, verify ghost snake visible and following path |
| F2 | Play seeded run, save ghost. Play different seed, verify ghost not shown |
| All | Run `test-bugfixes.mjs` with Playwright — no regressions |

---

## Files Modified

| File | Change |
|------|--------|
| `snake.html` | All JS changes (F0-F5) |
| `DESIGN_v4.md` | Updated scope (F3 deferred) |
| `test-bugfixes.mjs` | Add new tests for F0-F5 |
