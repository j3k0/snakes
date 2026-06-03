# Snake Game — v5 Implementation Plan

## 1. Synthesis of Review Feedback

Two independent reviews of DESIGN_v5 identified 21 critical issues that reshaped the plan. The most impactful changes: Painter mode was unplayable with `selfCollision: true` (ever-growing snake + self-collision = inevitable death), so it now uses `selfCollision: false` like Zen. Two keybind collisions were discovered — X (Prestige at level 20+ idle) and G (existing single-ghost toggle) — requiring reassignment to Y and Shift+G respectively. The Mirror mutator was specified at the wrong integration point (updateGame instead of keydown handler), and the double_rival mutator was blocked by the global-variable rival state, requiring a full refactor into a `rivals[]` array. The draft screen was deemed too much friction for casual players, so it's now opt-in (D key on idle). Synesthesia's sparse 15-30 notes/run was upgraded with rhythmic pulse, ambient pad, combo arpeggiator, and promoted visual ring pulses to core scope. Gauntlet's between-wave reset cannot partially call `resetGame()` (67 lines resetting 40+ vars), so a separate `resetWaveState()` is required. Finally, the mutator token economy needed a post-unlock sink (token re-rolls and extra draft slots), and gauntlet needed persistent progression (Gauntlet Mastery) to avoid a dead-end after wave 5.

---

## 2. Feature Implementation Details

### Feature A: Challenge URL Deep-Linking & Ghost Arena

#### Changes from Design
- Add `hashchange` event listener so browser back button re-activates challenge (review finding #16).
- Ghost Arena cold-start: when <3 replays available, show what exists with "Found N of 3 ghosts" label; when 0, toggle does nothing (review finding #17).
- Mobile touch targets for challenge landing overlay: stack elements vertically on narrow screens, minimum 48×48px touch targets, font sizes scaled to canvas width (review finding #18).

#### MODE_CONFIG Entry
No changes. Challenge URL is mode-agnostic; it selects an existing mode.

#### New Variables/Globals
```js
const CHALLENGE_URL_VERSION = 1;
const GHOST_ARENA_MAX = 3;
const GHOST_ARENA_COLORS = [
    { body: '#66CCFF', head: '#4488AA', label: '1st', alpha: 0.35 },
    { body: '#FF8866', head: '#AA4422', label: '2nd', alpha: 0.25 },
    { body: '#88FF88', head: '#44AA44', label: '3rd', alpha: 0.20 },
];

let challengeFromUrl = null;
// { mode: 'classic', seed: 'abc123', targetScore: 500, version: 1 }
let ghostArenaMode = false; // Shift+G toggles; distinct from ghostEnabled
let arenaGhostReplays = []; // up to 3 best replays for current seed+mode
let arenaGhostPositions = []; // array of arrays: [ghost0positions, ghost1positions, ...]
```

#### New Keybinds
- **Shift+G**: Toggle Ghost Arena (extends existing G which still toggles single ghost). When `ghostArenaMode` is true, `ghostEnabled` is overridden — Arena mode renders up to 3 ghosts in distinct colors. When Arena is off, single ghost toggle works normally.

#### Code Changes

**1. `parseChallengeUrl(hash)` — NEW function (~25 lines)**

Insert near `mulberry32()` / seed system code (~line 327):
```js
function parseChallengeUrl(hash) {
    const parts = hash.split('~');
    if (parts.length < 2) return null;
    const mode = parts[0];
    if (!MODE_CONFIG[mode]) return null;
    if (mode === 'daily') return null; // daily uses its own seed
    const seed = decodeURIComponent(parts[1]);
    if (!seed || seed.includes('~')) return null;
    const targetScore = parts[2] ? parseInt(parts[2], 10) || null : null;
    return { mode, seed, targetScore, version: CHALLENGE_URL_VERSION };
}
```

**2. Page-load hash parsing — insert at end of script (~line 3909)**

```js
window.addEventListener('load', function() {
    const hash = window.location.hash.slice(1);
    if (hash) {
        challengeFromUrl = parseChallengeUrl(hash);
    }
});

window.addEventListener('hashchange', function() {
    if (gameState === 'idle') {
        const hash = window.location.hash.slice(1);
        challengeFromUrl = hash ? parseChallengeUrl(hash) : null;
        visualDirty = true;
    }
});
```

**3. `drawChallengeOverlay()` — NEW function (~40 lines)**

Called from `drawOverlay()` when `challengeFromUrl !== null && gameState === 'idle'`. Renders:
- Dark overlay replacing idle screen
- Challenge info: mode name, seed, target score
- "Press Enter to accept" prompt
- Escape to dismiss
- Mobile: vertical stacking, scaled fonts
- Must wrap all text in `ctx.save()`/`ctx.restore()` per canvas discipline

**4. Integration with startGame flow (~line 3470, keydown handler Enter case)**

When `challengeFromUrl` is set and Enter is pressed:
```js
if (challengeFromUrl) {
    gameMode = challengeFromUrl.mode;
    document.getElementById('seedField').value = challengeFromUrl.seed;
    activeSeed = challengeFromUrl.seed;
    const hash = challengeFromUrl.seed.split('').reduce(function(h, c) { return ((h << 5) - h) + c.charCodeAt(0) | 0; }, 0);
    seedPrng = mulberry32(hash);
    try { history.replaceState(null, '', window.location.pathname); } catch(e) {}
    challengeFromUrl = null;
}
```

**5. Ghost Arena: modify `drawGame()` (~line 2686, ghost section)**

Replace the single ghost block with:
```js
if (ghostArenaMode && activeSeed !== null && arenaGhostReplays.length > 0) {
    for (var gi = 0; gi < arenaGhostReplays.length && gi < GHOST_ARENA_MAX; gi++) {
        var ghostBody = arenaGhostPositions[gi] || [];
        if (ghostBody.length === 0) continue;
        ctx.save();
        ctx.globalAlpha = GHOST_ARENA_COLORS[gi].alpha;
        for (var gj = 0; gj < ghostBody.length; gj++) {
            ctx.fillStyle = gj === 0 ? GHOST_ARENA_COLORS[gi].head : GHOST_ARENA_COLORS[gi].body;
            ctx.fillRect(ghostBody[gj].x, ghostBody[gj].y, TILE_SIZE - 1, TILE_SIZE - 1);
        }
        // Label above ghost head
        if (ghostBody.length > 0) {
            ctx.fillStyle = GHOST_ARENA_COLORS[gi].body;
            ctx.font = hudFont(9);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            var label = GHOST_ARENA_COLORS[gi].label;
            if (arenaGhostReplays.length < GHOST_ARENA_MAX) {
                label = GHOST_ARENA_COLORS[gi].label;
            }
            ctx.fillText(label, ghostBody[0].x + TILE_SIZE / 2, ghostBody[0].y - 2);
        }
        ctx.restore();
    }
} else if (ghostEnabled && activeSeed !== null && ghostPositions.length > 0) {
    // existing single ghost code remains unchanged
    ctx.save();
    ctx.globalAlpha = 0.3;
    for (var gi = 0; gi < ghostPositions.length; gi++) {
        var gp = ghostPositions[gi];
        ctx.fillStyle = gi === 0 ? '#88DDFF' : '#66CCFF';
        ctx.fillRect(gp.x, gp.y, TILE_SIZE - 1, TILE_SIZE - 1);
    }
    ctx.restore();
}
```

**6. Ghost Arena: update `updateGame()` ghost rebuild (~line 2738)**

When `ghostArenaMode` is active, rebuild all arena ghosts:
```js
if (ghostArenaMode && activeSeed !== null) {
    arenaGhostPositions = arenaGhostReplays.map(function(replay) {
        return rebuildGhost(replay, gameTick);
    });
} else if (ghostEnabled && activeSeed !== null) {
    var bestReplay = getBestReplay(gameMode);
    ghostPositions = rebuildGhost(bestReplay, gameTick);
} else {
    ghostPositions = [];
    arenaGhostPositions = [];
}
```

**7. `getArenaReplays()` — NEW function (~15 lines)**

Returns top 3 replays for current mode+seed:
```js
function getArenaReplays(mode) {
    var replays = loadReplays(mode);
    var matched = replays.filter(function(r) {
        return r.seed === activeSeed && r.version === REPLAY_VERSION;
    });
    matched.sort(function(a, b) { return b.score - a.score; });
    return matched.slice(0, GHOST_ARENA_MAX);
}
```

Called when Ghost Arena is toggled on and when `activeSeed` changes.

**8. Shift+G keydown handler — modify keydown handler (~line 3579)**

Insert before the existing `G` handler:
```js
if (e.key === 'G' && e.shiftKey) {
    e.preventDefault();
    if (activeSeed === null) {
        queueToast('Ghost Arena requires a seeded run', 2000);
        return;
    }
    ghostArenaMode = !ghostArenaMode;
    if (ghostArenaMode) {
        arenaGhostReplays = getArenaReplays(gameMode);
        if (arenaGhostReplays.length === 0) {
            ghostArenaMode = false;
            queueToast('No ghosts found for this seed', 2000);
            return;
        }
        ghostEnabled = false; // single ghost off
        queueToast('Ghost Arena: ' + arenaGhostReplays.length + ' of ' + GHOST_ARENA_MAX + ' ghosts', 2000);
    } else {
        arenaGhostReplays = [];
        arenaGhostPositions = [];
        queueToast('Ghost Arena Off', 1500);
    }
    return;
}
```

**9. Target score HUD — add in `drawGame()` after seed display (~line 2712)**

```js
if (challengeFromUrl && challengeFromUrl.targetScore && (gameState === 'playing' || gameState === 'paused')) {
    ctx.save();
    var targetReached = score >= challengeFromUrl.targetScore;
    ctx.fillStyle = targetReached ? '#FFFFFF' : '#FFD700';
    ctx.font = hudFont(11);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Target: ' + challengeFromUrl.targetScore, 5, 5);
    ctx.restore();
}
```

**10. "Copy Challenge Link" — add to gameover rendering in `drawOverlay()`**

When `activeSeed !== null && gameState === 'gameover'`, show a "Press K to copy challenge link" prompt. Add keydown handler for K:
```js
if ((e.key === 'k' || e.key === 'K') && gameState === 'gameover' && activeSeed !== null) {
    var url = window.location.origin + window.location.pathname + '#' + gameMode + '~' + encodeURIComponent(activeSeed) + (score > 0 ? '~' + score : '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
            queueToast('Challenge link copied!', 2000);
        }).catch(function() {
            fallbackCopy(url);
        });
    } else {
        fallbackCopy(url);
    }
    return;
}
```

**11. `fallbackCopy(text)` — NEW function (~10 lines)**

```js
function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        queueToast('Challenge link copied!', 2000);
    } catch(e) {
        queueToast('Copy failed — use HTTPS', 2000);
    }
    document.body.removeChild(ta);
}
```

**12. Seed input `~` validation — modify seed input handler (~line 3886)**

```js
// In the seed input handler, after reading val:
val = val.replace(/~/g, '');
this.value = val; // sanitize displayed value
```

#### Integration Points
- **`resetGame()`**: Must reset `ghostArenaMode = false`, `arenaGhostReplays = []`, `arenaGhostPositions = []`
- **`gameOver()`**: No special changes needed; challenge target display is visual-only
- **`endZenSession()`**: No changes needed
- **`saveManager`**: No new localStorage keys — `challengeFromUrl` is ephemeral

#### AGENTS.md Updates
- **Ghost Arena** section: Document that Shift+G toggles arena mode, arena uses up to 3 distinct-colored ghosts, labels require `ctx.save()`/`ctx.restore()`, arena and single ghost are mutually exclusive
- **Challenge URL** section: Document `hashchange` listener, `history.replaceState` cleanup, seed `~` character rejection
- **Draw order** update: Ghost Arena renders after food, before player snake (grid → obstacles → food → **ghost arena snakes** → player snake → particles/trails → overlays → flash)
- **`loadReplays` + ghost arena**: When `ghostArenaMode` is active, `arenaGhostReplays` is populated at toggle time. If the player's current run creates a new replay that would appear in arena, the arena does NOT update mid-game (replays are saved to localStorage on `gameOver()`). The arena replays are a snapshot from when the mode was toggled.

---

### Feature B: Canvas Painter Mode

#### Changes from Design
- **`selfCollision: false`** (like Zen). Snake passes through itself — review found that `selfCollision: true` + ever-growing body makes the mode unplayable (finding #1).
- **Collision-reversal path eliminated**: Since `selfCollision: false`, no collision path pushes the tail back. Painting is straightforward on `pop()` (finding #4).
- **Starting length 3** instead of 1, and **base speed 80ms** (faster) with **progressive speed increase** every 50 food eaten (speed -= 5, min 50ms). The 120ms base was too slow — at 120ms/tick, snake fills 400 tiles in 48s, making the mode extremely short (finding #5).
- **Watercolor bleed effect**: `ctx.shadowBlur = 6` with `shadowColor` matching tile color. Newly painted tiles flash slightly brighter for 500ms (track paint time per tile). Not "flat fillRects at 85% opacity" (finding #19).

#### MODE_CONFIG Entry
```js
painter: {
    name: 'Painter', speed: 80, selfCollision: false, wallDeath: false, wrap: true,
    timer: null, scoreIs: 'coverage', earnXP: true, achievementsEnabled: true
},
```

Add `'painter'` to `MODE_ORDER` array: `['classic', 'timeAttack', 'snap', 'walled', 'zen', 'painter', 'daily']` (before daily since daily is special).

#### New Variables/Globals
```js
let paintGrid = null;       // null when not in painter mode; 2D array [col][row]
let paintCoveredCount = 0;
let paintTotalTiles = 0;
let paintLayers = 1;
let currentPaintColor = '#FF4444';
let painterFoodEaten = 0;  // tracks food eaten for progressive speed
```

#### `paintGrid` Structure
```js
// On init: paintGrid[col][row] = null (unpainted) or { color, layer, timestamp }
// col = x / TILE_SIZE, row = y / TILE_SIZE, range 0..(CANVAS_WIDTH/TILE_SIZE - 1)
// timestamp = Date.now() for flash-brightness effect on newly painted tiles
```

#### Code Changes

**1. `initPaintGrid()` — NEW function (~15 lines)**

```js
function initPaintGrid() {
    var cols = CANVAS_WIDTH / TILE_SIZE;
    var rows = CANVAS_HEIGHT / TILE_SIZE;
    paintGrid = [];
    for (var c = 0; c < cols; c++) {
        paintGrid[c] = [];
        for (var r = 0; r < rows; r++) {
            paintGrid[c][r] = null;
        }
    }
    paintCoveredCount = 0;
    paintTotalTiles = (cols * rows) - obstacles.length;
    paintLayers = 1;
    currentPaintColor = '#FF4444';
    painterFoodEaten = 0;
}
```

**2. Modify `resetGame()` (~line 861)**

Add to the variable reset block:
```js
paintGrid = null;
paintCoveredCount = 0;
paintTotalTiles = 0;
paintLayers = 1;
currentPaintColor = '#FF4444';
painterFoodEaten = 0;
```

After obstacles are generated but before food generation, add:
```js
if (gameMode === 'painter') initPaintGrid();
```

Also: Painter mode starts snake at length 3:
```js
if (gameMode === 'painter') {
    snake = [
        { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE },
        { x: 9 * TILE_SIZE, y: 10 * TILE_SIZE },
        { x: 8 * TILE_SIZE, y: 10 * TILE_SIZE }
    ];
    dx = TILE_SIZE;
    dy = 0;
}
```
This replaces the default `snake = [{ x: 10 * TILE_SIZE, y: 10 * TILE_SIZE }];` line in `resetGame()`. Use a conditional.

**3. Modify `updateGame()` — tail painting (~line 2765)**

The existing code does `const tail = snake.pop();` at line 2765. For painter mode, instead of discarding the tail, paint it:

After `const tail = snake.pop();`:
```js
if (gameMode === 'painter' && paintGrid) {
    var pcol = Math.floor(tail.x / TILE_SIZE);
    var prow = Math.floor(tail.y / TILE_SIZE);
    var cols = CANVAS_WIDTH / TILE_SIZE;
    var rows = CANVAS_HEIGHT / TILE_SIZE;
    if (pcol >= 0 && pcol < cols && prow >= 0 && prow < rows) {
        if (!paintGrid[pcol][prow]) {
            paintGrid[pcol][prow] = { color: currentPaintColor, layer: paintLayers, timestamp: Date.now() };
            paintCoveredCount++;
        } else {
            paintGrid[pcol][prow] = { color: currentPaintColor, layer: paintGrid[pcol][prow].layer + 1, timestamp: Date.now() };
        }
    }
}
```

**4. Modify `updateGame()` — head painting**

After `snake.unshift(wrappedHead);` (line 2819), add:
```js
if (gameMode === 'painter' && paintGrid) {
    var hcol = Math.floor(wrappedHead.x / TILE_SIZE);
    var hrow = Math.floor(wrappedHead.y / TILE_SIZE);
    var cols = CANVAS_WIDTH / TILE_SIZE;
    var rows = CANVAS_HEIGHT / TILE_SIZE;
    if (hcol >= 0 && hcol < cols && hrow >= 0 && hrow < rows) {
        if (!paintGrid[hcol][hrow]) {
            paintGrid[hcol][hrow] = { color: currentPaintColor, layer: paintLayers, timestamp: Date.now() };
            paintCoveredCount++;
        } else {
            paintGrid[hcol][hrow] = { color: currentPaintColor, layer: paintGrid[hcol][hrow].layer + 1, timestamp: Date.now() };
        }
    }
}
```

**5. Modify `updateGame()` — painter score calculation**

After the zen mode score block (~line 2728), add:
```js
if (gameMode === 'painter' && paintTotalTiles > 0) {
    score = Math.floor((paintCoveredCount / paintTotalTiles) * 100);
    if (paintLayers > 1) {
        score = Math.floor(((paintCoveredCount / paintTotalTiles) * 100) + ((paintLayers - 1) * 100));
    }
}
```

**6. Modify `updateGame()` — painter progressive speed**

After food-eat block, inside the food-consumed section:
```js
if (gameMode === 'painter') {
    painterFoodEaten++;
    if (painterFoodEaten % 50 === 0) {
        var painterSpeed = Math.max(MIN_SPEED, getSpeed() - 5);
        tickInterval = painterSpeed;
        restartGameTimeout();
    }
}
```

**7. Modify `updateGame()` — 100% coverage check**

After food eat, add coverage check:
```js
if (gameMode === 'painter' && paintTotalTiles > 0 && paintCoveredCount >= paintTotalTiles && !flashOverlay) {
    paintLayers++;
    paintCoveredCount = 0; // reset for next layer count
    flashOverlay = { color: '#FFFFFF', alpha: 0.6, priority: 'high' };
    queueToast('100% Coverage! Layer ' + paintLayers + '!', 3000);
    playSound('achievement');
    vibrate(50);
}
```

**8. Modify `updateGame()` — current paint color tracking**

After the `lastEatenType` is determined (set `lastEatenType` before `playSound()` call — needed for both painter and synesthesia), update paint color:
```js
if (gameMode === 'painter') {
    var paintTier = FOOD_TIERS[eatenType] || FOOD_TIERS.common;
    currentPaintColor = paintTier.color;
}
```

Also: combo affects paint color cycle:
```js
if (gameMode === 'painter') {
    if (comboCount >= 30) {
        currentPaintColor = 'hsl(' + ((renderTime * 0.1) % 360) + ',100%,50%)';
    } else if (comboCount >= 10) {
        var tierKeys = Object.keys(FOOD_TIERS);
        currentPaintColor = FOOD_TIERS[tierKeys[painterFoodEaten % tierKeys.length]].color;
    }
}
```

**9. `drawPaintGrid()` — NEW function (~25 lines)**

Called in `drawGame()` after grid, before obstacles:
```js
function drawPaintGrid() {
    if (gameMode !== 'painter' || !paintGrid) return;
    var cols = CANVAS_WIDTH / TILE_SIZE;
    var rows = CANVAS_HEIGHT / TILE_SIZE;
    var now = Date.now();
    ctx.save();
    for (var c = 0; c < cols; c++) {
        for (var r = 0; r < rows; r++) {
            var tile = paintGrid[c][r];
            if (!tile) continue;
            var age = now - tile.timestamp;
            var flashAlpha = age < 500 ? 0.15 : 0; // newly painted tiles are brighter
            ctx.globalAlpha = 0.85 + flashAlpha;
            ctx.shadowBlur = 6;
            ctx.shadowColor = tile.color;
            ctx.fillStyle = tile.color;
            ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
}
```

**10. Modify `drawGame()` — insert paint grid call (~line 2676)**

```js
function drawGame(t) {
    ctx.imageSmoothingEnabled = false;
    drawGrid();
    drawPaintGrid();       // <-- NEW: after grid, before obstacles
    drawMuteIndicator();
    drawXPBar();
    drawPrestigeBorder();
    drawObstacles();
    // ... rest unchanged
}
```

**11. Modify `generateFood()` board-full guard for painter (~line 757)**

The existing guard is `currentSnake.length + obstacles.length >= totalTiles`. In painter mode, the snake never shrinks (body grows continuously). This will trigger quickly. The board-full guard should still work — when the snake physically fills all non-obstacle tiles, it correctly returns null. No change needed; the guard uses `currentSnake.length` which is the actual snake body, not painted tiles.

However, for painter mode, we need to ensure the snake doesn't fill the board too quickly given its rapid growth. The progressive speed system (faster ticks) means the snake covers tiles faster but also has less time to react. This is self-balancing.

**12. Painter mode: disable rival, disable progressive obstacles**

In `startGame()`: add guard:
```js
if (gameMode === 'painter') {
    // No rival in painter mode
    // No progressive obstacles — obstacles set at wave start only
}
```

In `generateObstacles()`: already excludes zen, walled. Add:
```js
if (gameMode === 'zen' || gameMode === 'walled' || gameMode === 'painter') return;
```

In progressive obstacle spawn block (~line 3072): add `gameMode !== 'painter'` guard.

**13. New achievements**

```js
PAINTER_50: { name: 'Half Canvas', desc: 'Reach 50% coverage in Painter', xp: 200, icon: '🎨', check: function(s,c) { return c.painterCoverage >= 50; } },
PAINTER_100: { name: 'Full Canvas', desc: 'Reach 100% coverage in Painter', xp: 500, icon: '🖼️', check: function(s,c) { return c.painterCoverage >= 100; } },
PAINTER_LAYER2: { name: 'Layer Cake', desc: 'Complete a second paint layer', xp: 400, icon: '🎂', check: function(s,c) { return c.painterLayers >= 2; } },
PAINTER_RAINBOW: { name: 'Prismatic', desc: 'Paint using all 6 food-tier colors in one run', xp: 300, icon: '🌈', check: function(s,c) { return c.painterAllColors; } },
```

Achievement context additions in `checkAchievements()`:
```js
painterCoverage: gameMode === 'painter' ? score : 0,
painterLayers: paintLayers,
painterAllColors: (function() {
    if (gameMode !== 'painter' || !paintGrid) return false;
    var colors = new Set();
    var cols = CANVAS_WIDTH / TILE_SIZE;
    var rows = CANVAS_HEIGHT / TILE_SIZE;
    for (var c = 0; c < cols; c++) {
        for (var r = 0; r < rows; r++) {
            if (paintGrid[c][r]) colors.add(paintGrid[c][r].color);
        }
    }
    return colors.size >= 6;
})(),
```

**14. Mode description**

```js
painter: 'Paint the board! Eat food to grow. Your trail is permanent — no self-collision. Score = coverage %.',
```

**15. `lastEatenType` variable — NEW global (~line 350 area)**

```js
let lastEatenType = 'common';
```

Set in the food-eat block of `updateGame()` before any `playSound()` call:
```js
lastEatenType = eatenType;
```

This is also required for Synesthesia (Feature C).

#### Integration Points
- **`resetGame()`**: Reset paint state, init if painter mode, start at length 3
- **`gameOver()` / `endZenSession()`**: No special cleanup needed (paint is visual only)
- **`addScore()`**: Painter mode bypasses addScore — score is coverage %, set directly
- **`drawGame()`**: Paint grid renders after drawGrid, before drawObstacles
- **`generateFood()`**: Board-full guard remains correct (uses physical snake length)
- **`updateRival()`**: Rival disabled in painter mode
- **`generateObstacles()`**: Painter excluded from progressive spawning but gets initial obstacles

#### AGENTS.md Updates
- **Painter Mode** section: `selfCollision: false` (like Zen), painted tiles are visual-only (not collision body), `paintGrid` is `null` when not in painter mode, drawing uses `ctx.save()`/`ctx.restore()` with `shadowBlur`
- **Draw Order** update: grid → **paint grid** → obstacles → food → snake → ...
- **`updateGame()` painter path**: Tail is painted on `pop()` AND head is painted on `unshift()` — both create paint entries. Since painter uses `selfCollision: false`, there is no collision reversal path that would push the tail back after painting.

---

### Feature C: Procedural Soundscape (Synesthesia Mode)

#### Changes from Design
- **Y key** instead of X (review finding #2 — X conflicts with Prestige at idle + level 20).
- **Continuous musical content** added (review finding #7): rhythmic low pulse every 4 ticks at ~20% volume, ambient pad at 0.08-0.10 volume changing root note every 50 ticks, combo-based arpeggiator (plays a note every tick while combo active).
- **Visual ring pulses promoted to CORE SCOPE** (review finding #7 — not stretch goal).

#### New Variables/Globals
```js
let synesthesiaMode = false;
let lastEatenType = 'common'; // shared with painter mode

const SYNESTHESIA_NOTES = {
    common:   { note: 'C', freq: 261.63 },
    uncommon: { note: 'E', freq: 329.63 },
    rare:     { note: 'G', freq: 392.00 },
    epic:     { note: 'B', freq: 493.88 },
    bonus:    { note: 'A', freq: 440.00 },
    speed:    { note: 'D', freq: 293.66 },
};

const SYNESTHESIA_COMBO_OCTAVES = [
    { minCombo: 0,  octave: 4 },
    { minCombo: 5,  octave: 5 },
    { minCombo: 10, octave: 6 },
    { minCombo: 20, octave: 7 },
];

let droneOsc = null;
let droneGain = null;
let droneActive = false;
let padOsc1 = null;
let padOsc2 = null;
let padGain = null;
let padActive = false;
let padRootNote = 261.63; // C4
let padChangeTick = 0;
```

#### New Keybinds
- **Y**: Toggle Synesthesia on/off (any game state). Persisted as `snake_synesthesia`.

#### Code Changes

**1. `playSynesthesiaLayer(name, now)` — NEW function (~45 lines)**

Called from `playSound()` when `synesthesiaMode` is true:
```js
function playSynesthesiaLayer(name, now) {
    if (name === 'eat' || name === 'bonus' || name === 'speed') {
        var tierInfo = SYNESTHESIA_NOTES[lastEatenType] || SYNESTHESIA_NOTES.common;
        var octave = getSynesthesiaOctave();
        var freq = tierInfo.freq * Math.pow(2, octave - 4);
        var noteOsc = audioCtx.createOscillator();
        var noteGain = audioCtx.createGain();
        noteOsc.type = 'sine';
        noteOsc.frequency.value = freq;
        noteGain.gain.setValueAtTime(0.15, now);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        noteOsc.connect(noteGain);
        noteGain.connect(audioCtx.destination);
        noteOsc.start(now);
        noteOsc.stop(now + 0.4);
        // Fifth harmonic
        var harmOsc = audioCtx.createOscillator();
        var harmGain = audioCtx.createGain();
        harmOsc.type = 'sine';
        harmOsc.frequency.value = freq * 1.5;
        harmGain.gain.setValueAtTime(0.05, now);
        harmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        harmOsc.connect(harmGain);
        harmGain.connect(audioCtx.destination);
        harmOsc.start(now);
        harmOsc.stop(now + 0.3);
    }
    if (name === 'combo_milestone') {
        playSynesthesiaChord(now);
    }
    if (name === 'gameover') {
        playSynesthesiaResolution(now);
    }
}
```

**2. `getSynesthesiaOctave()` — NEW function (~8 lines)**

```js
function getSynesthesiaOctave() {
    var oct = 4;
    for (var i = SYNESTHESIA_COMBO_OCTAVES.length - 1; i >= 0; i--) {
        if (comboCount >= SYNESTHESIA_COMBO_OCTAVES[i].minCombo) {
            oct = SYNESTHESIA_COMBO_OCTAVES[i].octave;
            break;
        }
    }
    return oct;
}
```

**3. `playSynesthesiaChord(now)` — NEW function (~35 lines)**

Builds chords based on combo level. Called on combo_milestone:
```js
function playSynesthesiaChord(now) {
    var notes = [261.63, 329.63, 392.00]; // C4, E4, G4 — C major triad
    if (comboCount >= 5) notes.push(493.88);  // B4 — major 7th
    if (comboCount >= 10) notes.push(293.66 * 2); // D5 — 9th
    if (comboCount >= 20) notes.push(261.63 * 2); // C5 — octave doubling
    var stagger = 0.05;
    for (var i = 0; i < notes.length; i++) {
        var chordOsc = audioCtx.createOscillator();
        var chordGain = audioCtx.createGain();
        chordOsc.type = 'sine';
        chordOsc.frequency.value = notes[i];
        var startTime = now + i * stagger;
        chordGain.gain.setValueAtTime(0, startTime);
        chordGain.gain.linearRampToValueAtTime(0.08, startTime + 0.05);
        chordGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        chordOsc.connect(chordGain);
        chordGain.connect(audioCtx.destination);
        chordOsc.start(startTime);
        chordOsc.stop(now + 0.6);
    }
}
```

**4. `playSynesthesiaResolution(now)` — NEW function (~15 lines)**

Called on gameover — plays a resolving tonic:
```js
function playSynesthesiaResolution(now) {
    var resOsc = audioCtx.createOscillator();
    var resGain = audioCtx.createGain();
    resOsc.type = 'sine';
    resOsc.frequency.value = 261.63; // C4 tonic
    resGain.gain.setValueAtTime(0.12, now);
    resGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    resOsc.connect(resGain);
    resGain.connect(audioCtx.destination);
    resOsc.start(now);
    resOsc.stop(now + 1.0);
}
```

**5. Modify `playSound()` (~line 1485)**

After the existing switch block (line ~1590), before the closing `}`:
```js
if (synesthesiaMode) {
    playSynesthesiaLayer(name, now);
}
```

**6. Rhythmic pulse — modify `updateGame()`**

Add near end of game tick (~line 3060):
```js
if (synesthesiaMode && !muted && gameTick % 4 === 0) {
    playSynesthesiaPulse();
}
```

**7. `playSynesthesiaPulse()` — NEW function (~12 lines)**

```js
function playSynesthesiaPulse() {
    if (!audioCtx) return;
    var now = audioCtx.currentTime;
    var pulseOsc = audioCtx.createOscillator();
    var pulseGain = audioCtx.createGain();
    pulseOsc.type = 'triangle';
    pulseOsc.frequency.value = 55; // A1
    pulseGain.gain.setValueAtTime(0.04, now);
    pulseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    pulseOsc.connect(pulseGain);
    pulseGain.connect(audioCtx.destination);
    pulseOsc.start(now);
    pulseOsc.stop(now + 0.1);
}
```

**8. Combo arpeggiator — modify `updateGame()`**

```js
if (synesthesiaMode && !muted && comboCount > 0 && gameTick % Math.max(1, 4 - Math.min(3, Math.floor(comboCount / 5))) === 0) {
    playSynesthesiaArp();
}
```

**9. `playSynesthesiaArp()` — NEW function (~15 lines)**

```js
function playSynesthesiaArp() {
    if (!audioCtx) return;
    var now = audioCtx.currentTime;
    var arpNotes = [261.63, 329.63, 392.00, 493.88];
    var freq = arpNotes[gameTick % arpNotes.length];
    var octave = getSynesthesiaOctave();
    freq = freq * Math.pow(2, octave - 4);
    var arpOsc = audioCtx.createOscillator();
    var arpGain = audioCtx.createGain();
    arpOsc.type = 'sine';
    arpOsc.frequency.value = freq;
    arpGain.gain.setValueAtTime(0.06, now);
    arpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    arpOsc.connect(arpGain);
    arpGain.connect(audioCtx.destination);
    arpOsc.start(now);
    arpOsc.stop(now + 0.12);
}
```

**10. Ambient pad system**

**`startPad()` — NEW function (~20 lines)**:
```js
function startPad() {
    if (!audioCtx || padActive) return;
    padActive = true;
    padChangeTick = gameTick;
    var now = audioCtx.currentTime;
    padOsc1 = audioCtx.createOscillator();
    padOsc2 = audioCtx.createOscillator();
    padGain = audioCtx.createGain();
    padOsc1.type = 'sine';
    padOsc2.type = 'sine';
    padOsc1.frequency.value = padRootNote;
    padOsc2.frequency.value = padRootNote * 1.005; // slight detune
    padGain.gain.value = 0.09;
    padOsc1.connect(padGain);
    padOsc2.connect(padGain);
    padGain.connect(audioCtx.destination);
    padOsc1.start(now);
    padOsc2.start(now);
}
```

**`stopPad()` — NEW function (~10 lines)**:
```js
function stopPad() {
    if (!padActive) return;
    padActive = false;
    try {
        if (padOsc1) { padOsc1.stop(); padOsc1 = null; }
        if (padOsc2) { padOsc2.stop(); padOsc2 = null; }
    } catch(e) {}
    padGain = null;
}
```

**`updatePad()` — NEW function (~10 lines)**, called from `updateGame()`:
```js
function updatePad() {
    if (!synesthesiaMode || muted || !padActive) return;
    if (gameTick - padChangeTick >= 50) {
        padChangeTick = gameTick;
        var regions = [261.63, 293.66, 329.63, 349.23, 392.00]; // C4-D4-E4-F4-G4
        var regionIdx = Math.floor((snake[0].y / CANVAS_HEIGHT) * regions.length);
        padRootNote = regions[Math.min(regionIdx, regions.length - 1)];
        var now = audioCtx.currentTime;
        if (padOsc1) padOsc1.frequency.linearRampToValueAtTime(padRootNote, now + 0.5);
        if (padOsc2) padOsc2.frequency.linearRampToValueAtTime(padRootNote * 1.005, now + 0.5);
    }
}
```

**11. Drone system**

**`startDrone()` — NEW function (~15 lines)**:
```js
function startDrone() {
    if (!audioCtx || droneActive) return;
    droneActive = true;
    var now = audioCtx.currentTime;
    droneOsc = audioCtx.createOscillator();
    droneGain = audioCtx.createGain();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.value = 55; // A1
    droneGain.gain.value = 0;
    droneOsc.connect(droneGain);
    droneGain.connect(audioCtx.destination);
    droneOsc.start(now);
}
```

**`updateDrone()` — NEW function (~15 lines)**, called from `updateGame()` every 10 ticks:
```js
function updateDrone() {
    if (!synesthesiaMode || muted) return;
    if (obstacles.length === 0) {
        stopDrone();
        return;
    }
    var head = snake[0];
    var nearestDist = Infinity;
    for (var i = 0; i < obstacles.length; i++) {
        var dist = Math.abs(head.x - obstacles[i].x) + Math.abs(head.y - obstacles[i].y);
        if (dist < nearestDist) nearestDist = dist;
    }
    var tileDist = nearestDist / TILE_SIZE;
    var now = audioCtx.currentTime;
    if (tileDist <= 3) {
        if (!droneActive) startDrone();
        if (droneGain) droneGain.gain.linearRampToValueAtTime(0.08, now + 0.3);
    } else {
        if (droneActive && droneGain) {
            droneGain.gain.linearRampToValueAtTime(0, now + 0.5);
        }
    }
}
```

**`stopDrone()` — NEW function (~8 lines)**:
```js
function stopDrone() {
    if (!droneActive) return;
    droneActive = false;
    try {
        if (droneOsc) { droneOsc.stop(); droneOsc = null; }
    } catch(e) {}
    droneGain = null;
}
```

**12. Integration points for drone/pad in `updateGame()`**

Add near end of `updateGame()`, before tick time recording:
```js
if (synesthesiaMode && !muted) {
    if (gameTick % 10 === 0) updateDrone();
    updatePad();
}
```

**13. Start/stop synesthesia on game lifecycle**

In `startGame()`:
```js
if (synesthesiaMode) startPad();
```

In `gameOver()`:
```js
stopDrone();
stopPad();
```

In `endZenSession()`:
```js
stopDrone();
stopPad();
```

In `resetGame()`:
```js
stopDrone();
stopPad();
```

**14. Y key toggle — modify keydown handler**

Insert near the M key handler (~line 3565):
```js
if (e.key === 'y' || e.key === 'Y') {
    synesthesiaMode = !synesthesiaMode;
    saveManager.set('snake_synesthesia', synesthesiaMode ? '1' : '0');
    if (synesthesiaMode) {
        if (gameState === 'playing') startPad();
        queueToast('♫ Synesthesia On', 1500);
    } else {
        stopDrone();
        stopPad();
        queueToast('Synesthesia Off', 1500);
    }
    return;
}
```

**15. Synesthesia initialization on page load**

Near the other save-based initializations:
```js
synesthesiaMode = saveManager.get('snake_synesthesia', '') === '1';
```

**16. HUD indicator — modify `drawGame()`**

After mute indicator:
```js
if (synesthesiaMode) {
    ctx.save();
    var synAlpha = 0.5 + 0.5 * Math.sin(renderTime * 0.005);
    ctx.globalAlpha = synAlpha;
    ctx.fillStyle = '#FFD700';
    ctx.font = hudFont(10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('♫ SYN', 5, 15);
    ctx.restore();
}
```

**17. Visual ring pulses on food eat — CORE SCOPE**

In the food-eat block, after `spawnParticles(...)`:
```js
if (synesthesiaMode) {
    spawnSynesthesiaRing(wrappedHead.x, wrappedHead.y, tierColor);
}
```

**`spawnSynesthesiaRing(x, y, color)` — NEW function (~10 lines)**:
```js
function spawnSynesthesiaRing(x, y, color) {
    for (var i = 0; i < 6; i++) {
        var angle = (Math.PI * 2 / 6) * i;
        particles.push({
            x: x + TILE_SIZE / 2,
            y: y + TILE_SIZE / 2,
            vx: Math.cos(angle) * 3,
            vy: Math.sin(angle) * 3,
            life: 1.0,
            maxLife: 0.4,
            color: color,
            size: 3,
            isRing: true
        });
    }
}
```

The particle system in `animateVisuals()` renders these as expanding rings. The `isRing` flag could drive a different render (circle instead of square), but for simplicity the existing square particle render works — the 6 particles expand outward like a ring burst.

#### Integration Points
- **`playSound()`**: Extended with synesthesia layer call after existing switch
- **`updateGame()`**: Pulse (every 4 ticks), drone check (every 10 ticks), pad update (every tick), arpeggiator (variable tick based on combo)
- **`gameOver()`/`endZenSession()`/`resetGame()`**: Must stop drone and pad
- **`startGame()`**: Must start pad if synesthesia is active
- **Particle system**: Synesthesia ring pulses reuse existing `particles` array and `spawnParticles` pattern

#### AGENTS.md Updates
- **Synesthesia Mode** section: Y key toggle, persisted as `snake_synesthesia`, all oscillators created in `playSound()` context (reusing existing `audioCtx`), drone and pad must be stopped in `gameOver()`, `endZenSession()`, and `resetGame()`. Add to the parallel session-end path warning.
- **`playSound()` duplicate case**: Grep for duplicate labels when adding synesthesia code — the synesthesia layer is a separate function, not new switch cases, which avoids the duplicate-case risk. Document this pattern.
- **`lastEatenType`**: Must be set in `updateGame()` BEFORE `playSound()` is called. Both Painter and Synesthesia depend on it.

---

### Feature D: Mutator Draft System

#### Changes from Design
- **Opt-in, not default** (review finding #8): Default: no draft screen. Press D on idle to enable draft mode. Only then does startGame() show the draft screen. "Draft Mode" indicator shown on idle screen.
- **Mirror mutator flips in keydown handler** (review finding #9): not in `updateGame()`. Wrap `setNextDirection()` to check active mutator and negate dx.
- **Double rival: rivals[] array refactor** (review finding #10): Replace singleton `rivalSnake`/`rivalDx`/`rivalDy`/`rivalActive`/`rivalRespawnTimer` with `rivals = []` array of rival objects. `updateRival(index)` takes an index parameter. This is 60-80 lines of refactoring.
- **Hunger clock starts after first food** (review finding #11): `hungerStarted` flag, hunger clock only triggers after first food eaten.
- **Toast queue mandate** (review finding #14): All new toasts use `queueToast()`, not legacy timer pattern.
- **Token sink** (review finding #20): Tokens can be spent to re-roll draft options or draft 2 mutators instead of 1.
- **Mutator + ghost replay**: Store `activeMutator` in replay object. When replaying, if mutator mismatch, hide ghost.

#### MODE_CONFIG Entry
None — mutators are mode-independent overlays.

#### New Variables/Globals
```js
const MUTATOR_DEFS = {
    gravity:     { name: 'Gravity',      icon: '\u2B07', desc: 'Snake falls when you stop pressing keys',    tokenCost: 0 },
    mirror:      { name: 'Mirror',       icon: '\uD83D\uDE00', desc: 'Left and right controls are reversed', tokenCost: 0 },
    phase_shift: { name: 'Phase Shift',  icon: '\uD83D\uDC7B', desc: 'Snake phases through itself every 5 ticks', tokenCost: 0 },
    hunger_clock:{ name: 'Hunger Clock', icon: '\u231B', desc: 'Lose 1 length every 50 ticks. Die at length 0.', tokenCost: 3 },
    double_rival:{ name: 'Double Rival', icon: '\uD83D\uDC0D\uD83D\uDC0D', desc: 'Two rival snakes compete for food', tokenCost: 5 },
    golden_food: { name: 'Golden Age',   icon: '\u2728', desc: 'All food gives 3x points but spawns half as often', tokenCost: 4 },
    shrink_zone: { name: 'Shrink Zone',  icon: '\uD83D\uDCCD', desc: 'Board shrinks by 1 row/column every 30 seconds', tokenCost: 6 },
    chaos_seed:  { name: 'Chaos Seed',   icon: '\uD83C\uDFB2', desc: 'Food type probability reshuffles every 20 ticks', tokenCost: 8 },
};

const MUTATOR_BASE_POOL = ['gravity', 'mirror', 'phase_shift'];
const MUTATOR_DRAFT_SIZE = 3;

let mutatorTokens = 0;
let unlockedMutators = MUTATOR_BASE_POOL.slice();
let activeMutator = null;
let draftOptions = [];
let draftScreenVisible = false;
let draftSelection = 0;
let draftModeEnabled = false; // opt-in: press D on idle

let shrinkRows = 0;
let shrinkCols = 0;
let hungerStarted = false;
let hungerTickCounter = 0;
let chaosShuffleTick = 0;
let chaosCurrentWeights = null;
```

#### New Keybinds
- **D** (idle only): Toggle draft mode on/off. Shows "Draft Mode" indicator.
- **ArrowLeft/ArrowRight** (draft screen): Navigate draft cards
- **Enter** (draft screen): Confirm selection
- **Escape** (draft screen): Skip (play without mutator)
- **R** (draft screen, costs 1 token): Re-roll the 3 draft options

#### Rival System Refactor (Required for double_rival)

This is the most invasive change. The existing code uses global variables:

**Current globals (lines 399-407):**
```js
let rivalSnake = [];
let rivalDx = 0;
let rivalDy = 0;
let rivalActive = false;
let rivalRespawnTimer = 0;
```

**New structure:**
```js
let rivals = []; // array of { snake, dx, dy, active, respawnTimer, color }
```

Each rival object:
```js
{ snake: [], dx: 0, dy: 0, active: false, respawnTimer: 0, color: '#FF4444' }
```

**Refactor `updateRival(index)`** — modify existing function (~line 1235):

Change signature from `updateRival()` to `updateRival(idx)`. Replace all references to global `rivalSnake`, `rivalDx`, `rivalDy`, `rivalActive` with `rivals[idx].snake`, `rivals[idx].dx`, etc.

**Compatibility helpers** (to minimize blast radius during incremental migration):
```js
var rivalSnake = []; // will become a getter
var rivalDx = 0;
var rivalDy = 0;
var rivalActive = false;
var rivalRespawnTimer = 0;
```

Actually, given that the refactoring is broad, the preferred approach is direct replacement:

**Search-replace all usages of `rivalSnake`, `rivalDx`, `rivalDy`, `rivalActive`, `rivalRespawnTimer` throughout the codebase.**

Key affected locations:
- `resetGame()` (line 897-901): Reset all rivals
- `gameOver()` (line 1411-1413): Clear all rivals
- `spawnRival()` (line 1183): Create `rivals[0]` or `rivals[1]`
- `removeRival()` (line 1357): Accept index parameter
- `updateRival()` (line 1235): Accept index parameter
- `checkCollision()` (line 1069): Check all rival bodies
- `generateFood()` (line 755): Include all rival segments
- `updateGame()` (line 2799): Check collision against all rivals
- `drawRival()`: Draw all rivals with distinct colors
- `drawRivalHUD()`: HUD for all rivals
- All other references

**For the initial migration (non-double_rival mode):** Keep a single rival at `rivals[0]`. All existing code paths that spawned/checked/updated one rival now operate on `rivals[0]`.

**For `double_rival` mutator:** When active and mode allows rivals (classic, timeAttack), spawn a second rival at `rivals[1]` with a distinct color ('#FF8844'). Update both each tick.

**Refactored `spawnRival(idx)`:**
```js
function spawnRival(idx) {
    if (idx === undefined) idx = 0;
    while (rivals.length <= idx) {
        rivals.push({ snake: [], dx: TILE_SIZE, dy: 0, active: false, respawnTimer: 0, color: idx === 0 ? '#FF4444' : '#FF8844' });
    }
    if (rivals[idx].active) return;
    if (gameMode === 'zen' || gameMode === 'snap' || gameMode === 'daily' || gameMode === 'walled' || gameMode === 'painter') return;
    // ... spawn logic using rivals[idx].snake, rivals[idx].dx, etc.
    rivals[idx].active = true;
}
```

**Refactored `updateRival(idx)`:**
Same logic as current `updateRival()` but uses `rivals[idx]` instead of globals.

**Helper for legacy checks:**
```js
function anyRivalActive() {
    return rivals.some(function(r) { return r.active; });
}

function rivalCombinedSnake() {
    var combined = [];
    for (var i = 0; i < rivals.length; i++) {
        if (rivals[i].active) combined = combined.concat(rivals[i].snake);
    }
    return combined;
}
```

Replace all `rivalActive` boolean checks with `anyRivalActive()`. Replace `rivalSnake` in combined-snake constructions with `rivalCombinedSnake()`.

#### Draft Screen Implementation

**1. `drawDraftScreen()` — NEW function (~50 lines)**

Called from `drawGame()` when `draftScreenVisible === true`:
- Dark overlay `rgba(0,0,0,0.85)`
- Title "Draft a Mutator"
- 3 cards in a row (or stacked vertically on mobile)
- Each card: icon + name + description
- `draftSelection` highlighted with gold border
- "Press Escape to skip" at bottom
- If mutatorTokens > 0: "Press R to re-roll (1 token)"
- Touch: tap on card to select
- All text in `ctx.save()`/`ctx.restore()`

Mobile layout detection:
```js
var isNarrow = CANVAS_WIDTH < 300;
var cardWidth = isNarrow ? CANVAS_WIDTH - 40 : 110;
var cardHeight = isNarrow ? 80 : 130;
var cardY = isNarrow ? 60 : 100;
var cardGap = isNarrow ? 8 : 10;
```

**2. D key toggle — modify keydown handler**

Insert in the idle-state section of the keydown handler:
```js
if ((e.key === 'd' || e.key === 'D') && gameState === 'idle') {
    draftModeEnabled = !draftModeEnabled;
    queueToast(draftModeEnabled ? 'Draft Mode ON — start game to draft a mutator' : 'Draft Mode OFF', 2000);
    drawGame(1);
    return;
}
```

**3. Draft flow integration with startGame()**

Modify the Enter handler at idle (line 3470):
```js
if (gameState === 'idle') {
    // ... existing daily check ...
    if (draftModeEnabled && unlockedMutators.length > 0 && gameMode !== 'daily') {
        // Enter draft screen instead of starting immediately
        resetGame(); // reset first to get clean state
        draftOptions = pickDraftOptions(MUTATOR_DRAFT_SIZE);
        draftSelection = 0;
        draftScreenVisible = true;
        drawGame(1);
        return;
    }
    resetGame();
    startGame();
    visualDirty = true;
    return;
}
```

**4. Draft screen keydown handling**

When `draftScreenVisible` is true:
```js
if (draftScreenVisible) {
    if (e.key === 'ArrowLeft' || e.key === 'a') {
        draftSelection = (draftSelection - 1 + draftOptions.length) % draftOptions.length;
        drawGame(1);
        return;
    }
    if (e.key === 'ArrowRight' || e.key === 'd') {
        draftSelection = (draftSelection + 1) % draftOptions.length;
        drawGame(1);
        return;
    }
    if (e.key === 'Enter') {
        activeMutator = draftOptions[draftSelection];
        draftScreenVisible = false;
        draftModeEnabled = false;
        // Apply double_rival mutator: spawn second rival if mode allows
        applyMutatorOnStart();
        startGame();
        queueToast(MUTATOR_DEFS[activeMutator].icon + ' ' + MUTATOR_DEFS[activeMutator].name + '!', 2000);
        return;
    }
    if (e.key === 'Escape') {
        activeMutator = null;
        draftScreenVisible = false;
        draftModeEnabled = false;
        startGame();
        return;
    }
    if ((e.key === 'r' || e.key === 'R') && mutatorTokens > 0) {
        mutatorTokens--;
        saveManager.set('snake_mutator_tokens', mutatorTokens);
        draftOptions = pickDraftOptions(MUTATOR_DRAFT_SIZE);
        draftSelection = 0;
        queueToast('Re-rolled! (Tokens: ' + mutatorTokens + ')', 1500);
        drawGame(1);
        return;
    }
    return; // consume all other keys while draft is visible
}
```

**5. `pickDraftOptions(count)` — NEW function (~15 lines)**

```js
function pickDraftOptions(count) {
    var pool = unlockedMutators.slice();
    if (pool.length <= count) return pool;
    var options = [];
    var safety = 0;
    while (options.length < count && safety < 100) {
        var idx = Math.floor(Math.random() * pool.length); // NOT seeded
        var key = pool[idx];
        if (options.indexOf(key) === -1) options.push(key);
        safety++;
    }
    return options;
}
```

#### Mutator Implementations in updateGame()

**1. Gravity mutator (~15 lines in updateGame)**

After direction processing (~line 2763):
```js
if (activeMutator === 'gravity') {
    if (dy !== -TILE_SIZE && dy !== TILE_SIZE) {
        // Snake going horizontally — apply downward bias
        nextDirection = { dx: dx, dy: TILE_SIZE };
    }
}
```

Note: gravity only applies when going horizontally. If going UP (dy = -TILE_SIZE), player is "fighting gravity" — keep going up. If going DOWN (dy = TILE_SIZE), gravity is already satisfied.

**2. Mirror mutator — in keydown handler**

Modify `setNextDirection()` call area. Instead of modifying in updateGame (where direction is already consumed), intercept at keydown time:

```js
// In the direction-input part of keydown handler (line 3708-3736):
var finalDx = newDx;
var finalDy = newDy;
if (activeMutator === 'mirror') {
    finalDx = -newDx; // flip horizontal
}
setNextDirection(finalDx, finalDy);
```

This is the correct integration point — mirror flips the input, not the processed direction.

**3. Phase shift mutator (~10 lines in updateGame)**

Before self-collision check (~line 2774):
```js
var skipSelfCollision = false;
if (activeMutator === 'phase_shift' && gameTick % 5 === 0) {
    skipSelfCollision = true;
}
```

Modify collision check:
```js
if (checkCollision(wrappedHead) && !skipSelfCollision) {
```

`skipSelfCollision` is a tick-local variable reset each tick (line 2724). Not a persistent global.

**4. Hunger clock mutator (~15 lines in updateGame)**

Near end of game tick:
```js
if (activeMutator === 'hunger_clock') {
    if (!hungerStarted && sessionFoodEaten > 0) {
        hungerStarted = true;
        hungerTickCounter = 0;
    }
    if (hungerStarted) {
        hungerTickCounter++;
        if (hungerTickCounter > 0 && hungerTickCounter % 50 === 0) {
            if (snake.length > 1) {
                snake.pop();
            } else {
                lastDeathCause = 'Starvation!';
                gameOver();
                return;
            }
        }
    }
}
```

Reset in `resetGame()`:
```js
hungerStarted = false;
hungerTickCounter = 0;
```

**5. Double rival mutator**

In `applyMutatorOnStart()`:
```js
function applyMutatorOnStart() {
    if (activeMutator === 'double_rival') {
        // Second rival will be spawned by spawnRival(1) during startGame
        // Already have spawnRival(0) call in startGame for classic/timeAttack
    }
}
```

In `startGame()`, after the existing `spawnRival()` call (which becomes `spawnRival(0)`):
```js
if (activeMutator === 'double_rival') {
    spawnRival(1);
}
```

In `updateGame()`, the `if (rivalActive)` / `updateRival()` block becomes:
```js
for (var ri = 0; ri < rivals.length; ri++) {
    if (rivals[ri].active) {
        updateRival(ri);
    }
}
```

And the rival respawn timer section becomes a loop over rivals.

**6. Golden Age mutator**

In `updateGame()` food-spawn section and `pickRandomFoodType()`:

The food spawn happens in two places: after eating (`generateFood(playerCombined)`) and passive regeneration. For Golden Age, reduce passive regeneration frequency (already every 10th tick — change to every 20th for golden age). For point multiplier, in `addScore()`:
```js
if (activeMutator === 'golden_food') {
    amount *= 3;
}
```

And reduce food spawn frequency: in the passive food regen section (~line 3054):
```js
var regenInterval = (activeMutator === 'golden_food') ? 20 : 10;
if (!food && gameTick % regenInterval === 0 && gameState === 'playing') {
```

**7. Shrink Zone mutator**

New variables: `shrinkRows`, `shrinkCols`

In `resetGame()`: `shrinkRows = 0; shrinkCols = 0;`

In `updateGame()`, near end of tick:
```js
if (activeMutator === 'shrink_zone') {
    var ticksPerShrink = Math.floor(30000 / getEffectiveSpeed()); // ~30 seconds worth of ticks
    if (gameTick > 0 && gameTick % ticksPerShrink === 0) {
        if (shrinkCols < CANVAS_WIDTH / TILE_SIZE / 2 - 1) {
            shrinkCols++;
        } else if (shrinkRows < CANVAS_HEIGHT / TILE_SIZE / 2 - 1) {
            shrinkRows++;
        }
        // Check if snake is in shrunk area
        var headNow = snake[0];
        var minX = shrinkCols * TILE_SIZE;
        var maxX = CANVAS_WIDTH - shrinkCols * TILE_SIZE;
        var minY = shrinkRows * TILE_SIZE;
        var maxY = CANVAS_HEIGHT - shrinkRows * TILE_SIZE;
        if (headNow.x < minX || headNow.x >= maxX || headNow.y < minY || headNow.y >= maxY) {
            lastDeathCause = 'Caught by the shrinking zone!';
            gameOver();
            return;
        }
    }
}
```

In `wrapPosition()`: No change — wrapping still works. The shrink zone is checked separately. Shrunk tiles are effectively walls.

In `drawGame()`: Add `drawShrinkZone()` after grid:
```js
function drawShrinkZone() {
    if (activeMutator !== 'shrink_zone' || (shrinkRows === 0 && shrinkCols === 0)) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    var minX = 0;
    var maxX = CANVAS_WIDTH - shrinkCols * TILE_SIZE;
    var minY = 0;
    var maxY = CANVAS_HEIGHT - shrinkRows * TILE_SIZE;
    // Left strip
    ctx.fillRect(minX, 0, shrinkCols * TILE_SIZE, CANVAS_HEIGHT);
    // Right strip
    ctx.fillRect(maxX, 0, shrinkCols * TILE_SIZE, CANVAS_HEIGHT);
    // Top strip
    ctx.fillRect(0, minY, CANVAS_WIDTH, shrinkRows * TILE_SIZE);
    // Bottom strip
    ctx.fillRect(0, maxY, CANVAS_WIDTH, shrinkRows * TILE_SIZE);
    // Red border on active edge
    ctx.strokeStyle = '#FF4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(shrinkCols * TILE_SIZE, shrinkRows * TILE_SIZE, CANVAS_WIDTH - 2 * shrinkCols * TILE_SIZE, CANVAS_HEIGHT - 2 * shrinkRows * TILE_SIZE);
    ctx.restore();
}
```

**8. Chaos Seed mutator**

In `resetGame()`: `chaosShuffleTick = 0; chaosCurrentWeights = null;`

In `updateGame()`:
```js
if (activeMutator === 'chaos_seed') {
    if (gameTick % 20 === 0) {
        chaosCurrentWeights = shuffleFoodWeights();
        chaosShuffleTick = gameTick;
    }
}
```

Modify `pickRandomFoodType()` to check `chaosCurrentWeights`:
```js
function pickRandomFoodType() {
    var rand = seededRandom();
    if (activeMutator === 'chaos_seed' && chaosCurrentWeights) {
        var cumulative = 0;
        for (var typeKey in chaosCurrentWeights) {
            cumulative += chaosCurrentWeights[typeKey];
            if (rand < cumulative) return typeKey;
        }
    }
    var tiers = FOOD_TIERS;
    var cumulative = 0;
    for (var typeKey in tiers) {
        cumulative += tiers[typeKey].weight;
        if (rand < cumulative) return typeKey;
    }
    return 'common';
}
```

`shuffleFoodWeights()`:
```js
function shuffleFoodWeights() {
    var keys = Object.keys(FOOD_TIERS);
    var weights = keys.map(function() { return Math.random(); });
    var total = weights.reduce(function(a,b) { return a+b; }, 0);
    var result = {};
    for (var i = 0; i < keys.length; i++) {
        result[keys[i]] = weights[i] / total;
    }
    return result;
}
```

**9. Active mutator HUD badge**

In `drawGame()`:
```js
if (activeMutator) {
    ctx.save();
    ctx.fillStyle = '#FFD700';
    ctx.font = hudFont(10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var mutY = synesthesiaMode ? 28 : 15;
    ctx.fillText(MUTATOR_DEFS[activeMutator].icon + ' ' + MUTATOR_DEFS[activeMutator].name, 5, mutY);
    ctx.restore();
}
```

**10. Token awarding from achievements**

In `checkAchievements()` (~line 3260), after a new achievement is awarded:
```js
mutatorTokens++;
saveManager.set('snake_mutator_tokens', mutatorTokens);
checkMutatorUnlocks();
```

**11. `checkMutatorUnlocks()` — NEW function (~20 lines)**

```js
function checkMutatorUnlocks() {
    for (var key in MUTATOR_DEFS) {
        var def = MUTATOR_DEFS[key];
        if (unlockedMutators.indexOf(key) === -1 && mutatorTokens >= def.tokenCost) {
            unlockedMutators.push(key);
            saveManager.setJSON('snake_mutator_unlocks', unlockedMutators);
            queueToast('New mutator unlocked: ' + def.name + '!', 3000);
        }
    }
}
```

**12. Token sink: extra draft slot + re-roll**

When `draftScreenVisible`:
- Show "Press R to re-roll (1 token)" if `mutatorTokens > 0`
- Pressing R decrements `mutatorTokens` and re-picks `draftOptions`

For extra draft slot, allow spending 1 token before starting the draft to get 2 mutators instead of 1:
```js
// In draft screen, add button/option:
// "Press T to draft 2 mutators (1 token)" 
// When active, draftOptions has 4 cards, player picks 2
```

This adds moderate complexity. Implement as stretch within Feature D scope. The simpler version: pressing T in draft screen spends 1 token and increases draft picks from 1 to 2 (show all 4 cards, pick 2 sequentially).

**13. Ghost replay + mutator guard**

Modify `saveReplay()`:
```js
var replay = {
    version: REPLAY_VERSION,
    seed: activeSeed,
    mode: gameMode,
    mutator: activeMutator, // NEW
    score: score,
    maxLength: maxLength,
    timestamp: Date.now(),
    events: replayEvents
};
```

Modify `rebuildGhost()`:
```js
function rebuildGhost(replay, currentTick) {
    if (!replay || replay.seed !== activeSeed || replay.version !== REPLAY_VERSION) return [];
    if (replay.mutator !== activeMutator) return []; // mutator mismatch — ghost disabled
    // ... rest unchanged
}
```

**14. Persistence**

```js
mutatorTokens = saveManager.getInt('snake_mutator_tokens', 0);
unlockedMutators = saveManager.getJSON('snake_mutator_unlocks', MUTATOR_BASE_POOL.slice(), function(v) { return Array.isArray(v) && v.length > 0; });
```

**15. Modify help overlay**

Add D (Draft Mode), Y (Synesthesia) to the controls list in `drawHelpOverlay()`.

#### Integration Points
- **`startGame()`**: Draft screen intercepts Enter on idle if draft mode enabled; double_rival spawns extra rival
- **`updateGame()`**: Gravity, phase_shift, hunger_clock, shrink_zone, chaos_seed, golden_food hooks
- **keydown handler**: Mirror flip, draft navigation keys, D toggle, R re-roll
- **`resetGame()`**: Reset all mutator state (shrink, hunger, chaos, activeMutator, draft)
- **`gameOver()`/`endZenSession()`**: Reset activeMutator (or not — keep for session-end stats?), stop any mutator-specific effects
- **`checkAchievements()`**: Award tokens, check mutator unlocks
- **`saveReplay()`/`rebuildGhost()`**: Include and check mutator key
- **`addScore()`**: Golden Age multiplier
- **`pickRandomFoodType()`**: Chaos Seed weights
- **`generateFood()`**: Board-full guard uses `rivalCombinedSnake()` from rivals array
- **`drawGame()`**: Draft screen overlay, active mutator HUD, shrink zone visual

#### AGENTS.md Updates
- **Rival System**: Document `rivals[]` array structure, `updateRival(idx)` signature, `anyRivalActive()` helper, `rivalCombinedSnake()` helper. All code that previously checked `rivalActive` now uses `anyRivalActive()`. `removeRival(idx)` takes an index.
- **Food Generation — Two-Source Rival Counting**: Update to reflect `rivalCombinedSnake()` helper eliminates the double-counting issue. ALL callers pass complete currentSnake.
- **Mirror Mutator**: Applied in keydown handler, NOT in updateGame. `setNextDirection(-newDx, newDy)` after mirror detection.
- **Phase Shift**: `skipSelfCollision` is a tick-local flag, reset every tick. Must never be a persistent global.
- **Hunger Clock**: Starts only after first food eaten (`hungerStarted` flag). Without this, tick-50 death on starting length is guaranteed.
- **Shrink Zone**: Shrunk tiles are effectively walls. Snake dies if it enters them. Do NOT modify `wrapPosition()` — shrinking is orthogonal to wrapping.
- **Draft screen + daily mode**: No draft in daily mode. Guard in startGame flow.
- **Draft screen + Zen mode**: Allow drafting — some mutators are weird but valid in Zen.
- **Token awarding**: Must be called from BOTH `gameOver()` and `endZenSession()` — extract `awardMutatorTokens()` helper. (Per existing AGENTS.md: session-end logic must be in both paths.)

---

### Feature E: Rogue-Lite Gauntlet Mode

#### Changes from Design
- **`resetWaveState()` function** instead of partial `resetGame()` call (review finding #12). `resetGame()` is 67 lines resetting 40+ variables — cannot be partially called. New function resets only per-wave state.
- **GameOver score handling** (review finding #13): Before calling gameOver on gauntlet completion, set `score = gauntletScore`.
- **Gauntlet Mastery** (review finding #21): Persistent progression. Each wave completed earns 1 point. Accumulate to unlock gauntlet cosmetics (border, trail). Display mastery tier on gauntlet-complete screen.
- **Toast queue mandate** (review finding #14): Wave complete toast uses `queueToast()`.

#### MODE_CONFIG Entry
```js
gauntlet: {
    name: 'Gauntlet', speed: 'dynamic', selfCollision: true, wallDeath: false, wrap: true,
    timer: null, scoreIs: 'points', earnXP: true, achievementsEnabled: true
},
```

Add `'gauntlet'` to `MODE_ORDER`: `['classic', 'timeAttack', 'snap', 'walled', 'zen', 'painter', 'gauntlet', 'daily']`.

#### New Variables/Globals
```js
const GAUNTLET_WAVES = [
    { wave: 1, objective: 'survive', duration: 900, speedBase: 120, obstacles: 0, rival: false, desc: 'Survive 15 seconds' },
    { wave: 2, objective: 'eat', target: 5, speedBase: 110, obstacles: 4, rival: false, desc: 'Eat 5 food' },
    { wave: 3, objective: 'combo', target: 3, speedBase: 100, obstacles: 6, rival: true, desc: 'Reach 3x combo' },
    { wave: 4, objective: 'survive', duration: 600, speedBase: 90, obstacles: 8, rival: true, desc: 'Survive 10 seconds (fast!)' },
    { wave: 5, objective: 'score', target: 150, speedBase: 85, obstacles: 10, rival: true, desc: 'Score 150 points' },
];

const GAUNTLET_PICKS = [
    { id: 'extra_length', name: 'Extra Length', icon: '\uD83D\uDCCF', desc: '+5 segments next wave', stackable: true },
    { id: 'food_rush', name: 'Food Rush', icon: '\uD83C\uDF4E', desc: 'Food spawns 50% faster', stackable: true },
    { id: 'wave_shield', name: 'Wave Shield', icon: '\uD83D\uDEE1', desc: '6-second shield at wave start', stackable: false },
    { id: 'score_boost', name: 'Score Boost', icon: '\u2B50', desc: '+50% score next wave', stackable: true },
    { id: 'slow_pace', name: 'Slow Pace', icon: '\uD83D\uDC0C', desc: '20% slower next wave', stackable: false },
    { id: 'combo_save', name: 'Combo Keep', icon: '\uD83D\uDD25', desc: 'Combo carries between waves', stackable: false },
];

const GAUNTLET_MASTERY_TIERS = [
    { points: 0,  name: 'None',      color: '#888' },
    { points: 5,  name: 'Bronze',    color: '#CD7F32' },
    { points: 15, name: 'Silver',    color: '#C0C0C0' },
    { points: 30, name: 'Gold',      color: '#FFD700' },
    { points: 50, name: 'Platinum',  color: '#E5E4E2' },
    { points: 75, name: 'Diamond',   color: '#B9F2FF' },
];

let gauntletWave = 0;
let gauntletScore = 0;
let gauntletPicks = [];
let gauntletObjective = null;
let gauntletIntermission = false;
let gauntletSelection = 0;
let gauntletPickOptions = [];
let gauntletMasteryPoints = 0;
let gauntletWaveScore = 0; // per-wave score
```

#### Code Changes

**1. `resetWaveState()` — NEW function (~30 lines)**

This is the critical function for between-wave resets. Resets per-wave state while preserving gauntlet state:

```js
function resetWaveState() {
    var wave = GAUNTLET_WAVES[gauntletWave];
    snake = [{ x: 10 * TILE_SIZE, y: 10 * TILE_SIZE }];
    if (gameMode === 'painter' && paintGrid) {
        snake = [
            { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE },
            { x: 9 * TILE_SIZE, y: 10 * TILE_SIZE },
            { x: 8 * TILE_SIZE, y: 10 * TILE_SIZE }
        ];
    }
    dx = TILE_SIZE;
    dy = 0;
    nextDirection = null;
    food = null;
    score = 0;
    gauntletWaveScore = 0;
    displayedScore = 0;
    sessionFoodEaten = 0;
    sessionFoodTypes = new Set();
    sessionSpeedFood = 0;
    sessionBonusFood = 0;
    comboCount = 0;
    lastEatTime = 0;
    lastComboMilestone = 0;
    if (!gauntletPicks.some(function(p) { return p.id === 'combo_save'; })) {
        sessionMaxCombo = 0;
    }
    gameTick = 0;
    particles = [];
    flashOverlay = null;
    shakeTimer = 0;
    eatAnimTimer = 0;
    touchIndicatorTimer = 0;
    speedBoostCounter = 0;
    shieldActive = false;
    magnetActive = false;
    slowMoActive = false;
    powerUpTimer = 0;
    powerUpType = null;
    powerUpPickup = null;
    powerUpSpawnCounter = 0;
    powerUpDespawnCounter = 0;
    // Reset rivals
    rivals = [];
    // Reset obstacles and regenerate for this wave
    obstacles = [];
    generateObstaclesForWave(wave);
    // Apply picks
    applyGauntletPicks();
    // Generate initial food
    var combined = snake.concat(rivalCombinedSnake());
    food = generateFood(combined);
    // Set speed for this wave
    tickInterval = wave.speedBase;
}
```

**2. `generateObstaclesForWave(wave)` — NEW function (~15 lines)**

Places a specific number of obstacles for the wave:
```js
function generateObstaclesForWave(wave) {
    obstacles = [];
    if (wave.obstacles === 0) return;
    var count = wave.obstacles;
    var headX = 10 * TILE_SIZE;
    var headY = 10 * TILE_SIZE;
    for (var i = 0; i < count; i++) {
        var tile = findFreeTile(headX, headY);
        if (tile) obstacles.push(tile);
    }
}
```

**3. `applyGauntletPicks()` — NEW function (~20 lines)**

```js
function applyGauntletPicks() {
    for (var i = 0; i < gauntletPicks.length; i++) {
        var pick = gauntletPicks[i];
        switch (pick.id) {
            case 'extra_length':
                for (var j = 0; j < 5; j++) {
                    snake.push({ x: snake[0].x, y: snake[0].y });
                }
                break;
            case 'food_rush':
                // Handled by checking gauntletPicks in spawn logic
                break;
            case 'wave_shield':
                shieldActive = true;
                powerUpTimer = 6000;
                powerUpType = 'shield';
                break;
            case 'score_boost':
                // Handled by checking gauntletPicks in addScore
                break;
            case 'slow_pace':
                tickInterval = Math.floor(tickInterval * 1.2);
                break;
        }
    }
}
```

**4. Wave objective checking in `updateGame()`**

After the zen-mode score block (~line 2728), add:
```js
if (gameMode === 'gauntlet') {
    if (gauntletIntermission) return;
    var wave = GAUNTLET_WAVES[gauntletWave];
    if (wave.objective === 'survive' && gameTick >= wave.duration) {
        completeGauntletWave();
    } else if (wave.objective === 'eat' && sessionFoodEaten >= wave.target) {
        completeGauntletWave();
    } else if (wave.objective === 'combo' && comboCount >= wave.target) {
        completeGauntletWave();
    } else if (wave.objective === 'score' && score >= wave.target) {
        completeGauntletWave();
    }
}
```

**5. `completeGauntletWave()` — NEW function (~20 lines)**

```js
function completeGauntletWave() {
    gauntletWaveScore = score;
    gauntletScore += score;
    gauntletMasteryPoints++;
    saveManager.set('snake_gauntlet_mastery', gauntletMasteryPoints);
    if (gauntletWave >= GAUNTLET_WAVES.length - 1) {
        // All waves complete — set score to cumulative before gameOver
        score = gauntletScore;
        queueToast('Gauntlet Complete! Total: ' + gauntletScore, 4000);
        gameOver();
        return;
    }
    // Intermission
    gauntletIntermission = true;
    gauntletPickOptions = pickRandomGauntletPicks(3);
    gauntletSelection = 0;
    playSound('achievement');
    queueToast('Wave ' + (gauntletWave + 1) + ' Complete! +' + gauntletWaveScore + ' pts', 2000);
}
```

**6. `pickRandomGauntletPicks(count)` — NEW function (~10 lines)**

```js
function pickRandomGauntletPicks(count) {
    var pool = GAUNTLET_PICKS.slice();
    var options = [];
    var safety = 0;
    while (options.length < count && safety < 100) {
        var idx = Math.floor(Math.random() * pool.length);
        var pick = pool[idx];
        if (options.some(function(o) { return o.id === pick.id; })) { safety++; continue; }
        options.push(pick);
        safety++;
    }
    return options;
}
```

**7. `startNextWave()` — NEW function (~10 lines)**

Called from intermission after player picks a bonus:
```js
function startNextWave() {
    gauntletWave++;
    gauntletIntermission = false;
    resetWaveState();
    var wave = GAUNTLET_WAVES[gauntletWave];
    if (wave.rival && (gameMode === 'gauntlet')) {
        spawnRival(0);
        if (activeMutator === 'double_rival') spawnRival(1);
    }
    tickInterval = wave.speedBase;
    restartGameTimeout();
}
```

**8. `drawGauntletIntermission()` — NEW function (~50 lines)**

Called from `drawGame()` when `gauntletIntermission === true`:
- Dark overlay `rgba(0,0,0,0.85)`
- "Wave N+1 — Choose your bonus"
- 3 cards vertically (mobile: stacked, desktop: row)
- ArrowLeft/Right to highlight; Enter to select
- Touch: tap card
- All text in `ctx.save()`/`ctx.restore()`

**9. `drawGauntletHUD()` — NEW function (~20 lines)**

Called from `drawGame()` during gauntlet gameplay:
- Wave number: "Wave 3/5"
- Objective + progress: "Eat 5 food (3/5)" with progress bar
- Surive: countdown bar
- Show active picks icons
- All text in `ctx.save()`/`ctx.restore()`

**10. `drawGauntletCompleteScreen()` — NEW function (~30 lines)**

Called from `drawGame()` when `gameState === 'gameover' && gameMode === 'gauntlet'`:
- "Gauntlet Complete!" text
- Total score
- Per-wave breakdown
- Gauntlet Mastery tier + points
- Mobile: stacked layout
- All text in `ctx.save()`/`ctx.restore()`

**11. Modify `drawGame()` — add gauntlet rendering hooks**

```js
if (gauntletIntermission) {
    drawGauntletIntermission();
}
if (gameMode === 'gauntlet' && gameState === 'playing') {
    drawGauntletHUD();
}
if (gameState === 'gameover' && gameMode === 'gauntlet') {
    drawGauntletCompleteScreen();
}
```

**12. Intermission keydown handler**

Add in the keydown handler, before the `gameState === 'playing'` direction section:

```js
if (gauntletIntermission) {
    if (e.key === 'ArrowLeft' || e.key === 'a') {
        gauntletSelection = (gauntletSelection - 1 + gauntletPickOptions.length) % gauntletPickOptions.length;
        drawGame(1);
        return;
    }
    if (e.key === 'ArrowRight' || e.key === 'd') {
        gauntletSelection = (gauntletSelection + 1) % gauntletPickOptions.length;
        drawGame(1);
        return;
    }
    if (e.key === 'Enter') {
        gauntletPicks.push(gauntletPickOptions[gauntletSelection]);
        startNextWave();
        drawGame(1);
        return;
    }
    if (e.key === 'Escape') {
        startNextWave(); // skip pick
        drawGame(1);
        return;
    }
    // Allow P/Space to pause during intermission
    if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
        // Standard pause handling
    }
    return;
}
```

**13. Intermission touch handling**

On canvas touch, check if `gauntletIntermission` is true and hit-test the three card positions. If touch lands on a card, set `gauntletSelection` and confirm on touchend.

**14. Gauntlet + gameOver integration**

When a Gauntlet run ends in death (not completion), the gameOver screen shows "Run Over — Wave N/5". The `gauntletScore` still records cumulative score up to death.

**15. Score boost pick integration in `addScore()`**

```js
if (gameMode === 'gauntlet' && gauntletPicks.some(function(p) { return p.id === 'score_boost'; })) {
    amount = Math.floor(amount * 1.5);
}
```

**16. Food rush pick integration in food spawn**

In `updateGame()` food-spawn section, adjust spawn timer thresholds:
```js
var spawnMod = 1;
if (gameMode === 'gauntlet' && gauntletPicks.some(function(p) { return p.id === 'food_rush'; })) {
    spawnMod = 0.5;
}
```

Apply `spawnMod` to the appropriate spawn counter check.

**17. New achievements**

```js
GAUNTLET_5: { name: 'Five Alive', desc: 'Complete all 5 gauntlet waves', xp: 500, icon: '\uD83C\uDFC5', check: function(s,c) { return c.gauntletComplete; } },
GAUNTLET_FLAWLESS: { name: 'Flawless Run', desc: 'Complete gauntlet without using shield', xp: 400, icon: '\uD83D\uDC51', check: function(s,c) { return c.gauntletFlawless; } },
GAUNTLET_SPEED: { name: 'Speed Runner', desc: 'Complete gauntlet in under 3 minutes', xp: 300, icon: '\u26A1', check: function(s,c) { return c.gauntletSpeed; } },
```

Achievement context additions:
```js
gauntletComplete: gameMode === 'gauntlet' && gauntletWave >= GAUNTLET_WAVES.length - 1 && gameState === 'gameover',
gauntletFlawless: gauntletComplete && !sessionUsedShield,
gauntletSpeed: gauntletComplete && sessionTimeAlive < 180000,
```

**18. Gauntlet persistence**

```js
gauntletMasteryPoints = saveManager.getInt('snake_gauntlet_mastery', 0);
```

**19. Ghost replay disabled in gauntlet**

In `saveReplay()`, add:
```js
if (gameMode === 'gauntlet') return;
```

Already guarded by `activeSeed === null` check for non-seeded modes. If a seeded gauntlet is played, replay would be complex due to multi-wave structure. Explicitly skip for now.

**20. Gauntlet mode description**

```js
gauntlet: '5 waves, each with a unique objective. Pick bonuses between waves. Death ends the run!',
```

**21. Session-end parallel path for gauntlet + token awarding**

Per AGENTS.md, session-end logic must be in both `gameOver()` and `endZenSession()`. For gauntlet, the key concern is token awarding from achievements. Create a helper:

```js
function awardMutatorTokenIfApplicable() {
    // Called from both gameOver() and endZenSession() after checkAchievements()
    // (tokens are already incremented inside checkAchievements flow)
}
```

This is a no-op for now since tokens are awarded inside `checkAchievements()`. The helper exists to future-proof the parallel-path pattern.

#### Integration Points
- **`resetGame()`**: Reset gauntlet state (wave, score, picks, intermission)
- **`updateGame()`**: Wave objective checking, gauntlet intermission gating
- **`gameOver()`**: Gauntlet completion sets `score = gauntletScore` before calling
- **`startGame()`**: Gauntlet entry sets up wave 1
- **`drawGame()`**: Gauntlet HUD, intermission screen, complete screen
- **keydown handler**: Intermission navigation, gauntlet-specific key handling
- **`addScore()`**: Score boost multiplier
- **Food spawn**: Food rush modifier

#### AGENTS.md Updates
- **Gauntlet Mode** section: `gauntletIntermission` flag gates `updateGame()` (if true, skip game-tick logic). `resetWaveState()` resets per-wave state only — does NOT call `resetGame()`. Wave completion calls `gameOver()` with `score = gauntletScore` for correct achievement/stat tracking.
- **Intermission + Pause** interaction: P/Space pauses during intermission (standard pause menu). Escape during intermission = skip pick (not quit). Arrow keys navigate intermission cards.
- **Gauntlet + Mutator**: Active mutator applies to ALL waves. Some combos may be degenerate (gravity + survive wave). Document as known interaction.
- **Gauntlet + Ghost Replay**: Ghost replay disabled in gauntlet mode. Multi-wave structure makes replay comparison meaningless.
- **Gauntlet Mastery**: Persistent `snake_gauntlet_mastery` counter in localStorage. Increments per wave completed. Tiers: None/Bronze/Silver/Gold/Platinum/Diamond at 0/5/15/30/50/75 points.

---

## 3. Build Order

Revised from DESIGN_v5 based on review findings and risk assessment:

| Order | Feature | Rationale |
|---|---|---|
| **0** | **Rival system refactor** | Prerequisite for double_rival mutator. Must be done first to unblock Feature D. 60-80 lines of refactoring with zero new functionality — pure internal restructure. |
| **1** | **B: Canvas Painter Mode** | Lowest complexity, highest visual impact, independent of other features. Self-collision redesign makes it cleaner than the original design. |
| **2** | **C: Procedural Soundscape** | Medium complexity, builds entirely on existing `playSound()` + `audioCtx`. No state machine changes. Y key has no conflicts. |
| **3** | **A: Challenge URL + Ghost Arena** | Medium complexity. Builds on seed system. Ghost Arena extends the now-refactored rivals system. Challenge URL enables the viral loop when Painter and Synesthesia are already in place. |
| **4** | **E: Rogue-Lite Gauntlet** | High complexity (new state machine states + `resetWaveState()`). Builds on the rival refactor. The intermission card-selection UI pattern will inform the draft screen. |
| **5** | **D: Mutator Draft System** | Highest complexity. Touches `updateGame()` in 8 different ways. Ghost + rival refactor must be stable before adding double_rival. Mirror mutator integrates at keydown layer (requires understanding keydown flow). Build last so all other features are stable. |

### Revised Estimated Lines

| Feature | Lines |
|---|---|
| 0: Rival refactor | ~80 |
| B: Canvas Painter | ~180 (increased from 160 for watercolor effect + progressive speed) |
| C: Procedural Soundscape | ~280 (increased from 210 for pulse/pad/arpeggiator/rings) |
| A: Challenge URL + Ghost Arena | ~200 (increased from 175 for hashchange + mobile targets) |
| E: Rogue-Lite Gauntlet | ~400 (increased from 365 for resetWaveState + mastery) |
| D: Mutator Draft System | ~420 (increased from 350 for rival refactor integration + token sink) |
| **Total** | **~1,560** |

Estimated codebase growth: 3,913 → ~5,473 lines. Still within single-file feasibility.

---

## 4. Testing Plan

### Feature A: Challenge URL & Ghost Arena

| Test | Steps | Expected |
|---|---|---|
| URL parsing — valid | Open `snake.html#classic~abc123~500` | Challenge overlay appears with mode, seed, target |
| URL parsing — invalid mode | Open `snake.html#invalid~abc123` | Falls through to normal idle screen |
| URL parsing — daily mode | Open `snake.html#daily~abc123` | `parseChallengeUrl` returns null, normal idle |
| URL parsing — seed with ~ | Open `snake.html#classic~a~b~c` | First ~ splits correctly; `a` is seed, `b` is target, extra ignored |
| Accept challenge | Enter on challenge overlay | Game starts in correct mode with correct seed |
| Reject challenge | Escape on challenge overlay | Returns to normal idle, `challengeFromUrl = null` |
| hashchange event | Browser back button after accepting | Challenge re-parses if hash present; no-op if cleaned |
| history.replaceState | After accepting challenge | URL bar shows clean path (no hash) |
| Seed input sanitization | Type `abc~123` in seed field | `~` stripped, value becomes `abc123` |
| Copy challenge link | K key on gameover (seeded run) | Clipboard contains `#mode~seed~score` URL |
| Copy challenge link | K key on gameover (no seed) | No action (only works on seeded runs) |
| Target score HUD | Playing with `challengeFromUrl.targetScore` | Target shows below score, gold < target, white >= target |
| Ghost Arena toggle | Shift+G with seeded run + 2+ replays | Arena shows multiple colored ghosts with labels |
| Ghost Arena cold-start | Shift+G with only 1 replay | Shows 1 ghost with "Found 1 of 3 ghosts" |
| Ghost Arena no ghosts | Shift+G with 0 replays for seed | Toggle does nothing, toast "No ghosts found" |
| Ghost Arena + single G | G when arena is active | Single ghost does not activate (mutually exclusive) |
| Mobile challenge overlay | Challenge URL on narrow screen | Cards stack vertically, fonts scaled |
| Clipboard fallback | Copy on HTTP (not localhost) | Fallback textarea copy, or "Copy failed" toast |

### Feature B: Canvas Painter Mode

| Test | Steps | Expected |
|---|---|---|
| Mode selection | Select Painter on idle screen | Mode config loads, name displays |
| Starting length | Start painter game | Snake is 3 segments long, not 1 |
| Tail painting | Move snake, observe tail | Tail tile becomes painted, stays visible |
| Head painting | Move snake, observe head position | Head tile becomes painted on each move |
| Self-collision | Snake crosses own painted trail | No death (selfCollision: false) |
| Wall wrapping | Move off screen edge | Wraps normally |
| Obstacle collision | Move into obstacle | Death (obstacles are physical) |
| Coverage progress | Play until >50% coverage | Score displays as percentage, reaches 50 |
| 100% coverage | Paint entire board | Flash, toast "Layer 2!", paintLayers increments |
| Food-type color | Eat common food | Paint color is `#FF4444` |
| Food-type color variation | Eat different tier foods | Paint color changes to match tier |
| Combo color cycle | Reach combo 10+ | Paint color cycles through FOOD_TIERS palette |
| Rainbow paint | Reach combo 30+ | Paint color cycles via HSL rainbow |
| Progressive speed | Eat 50+ food | Speed increases (tickInterval decreases) |
| Watercolor effect | Observe painted tiles | Tiles have shadowBlur glow effect |
| Flash brightness | Observe newly painted tiles | New tiles slightly brighter for 500ms |
| Board-full | Snake fills all tiles | `generateFood` returns null, gameOver with "Board filled up" |
| Rival disabled | Play painter mode | No rival snake spawns |
| Achievements | Reach 50% coverage | `PAINTER_50` achievement unlocks |
| Achievements | Paint all 6 colors | `PAINTER_RAINBOW` achievement unlocks |
| Power-ups | Shield/slow-mo/magnet spawn | All work normally in painter mode |

### Feature C: Synesthesia Mode

| Test | Steps | Expected |
|---|---|---|
| Toggle | Press Y | Synesthesia on, toast "♫ Synesthesia On" |
| Toggle off | Press Y again | Synesthesia off, all audio stops |
| Persistence | Toggle on, refresh page | Synesthesia still on after refresh |
| Mute interaction | Toggle synesthesia on, then mute | No synesthesia audio (muted check at top of playSound) |
| Food note — common | Eat common food | C4 note plays (261.63 Hz) |
| Food note — epic | Eat epic food | B4 note plays (493.88 Hz) |
| Combo octave | Reach 5x combo, eat food | Notes shift to octave 5 |
| Combo octave | Reach 20x combo | Notes shift to octave 7 |
| Combo chord | Hit combo milestone (3) | C major triad plays (3 notes staggered) |
| Gameover resolution | Die | Tonic C4 note plays (resolution sound) |
| Drone activation | Move near obstacle | Low-frequency drone ramps up |
| Drone deactivation | Move away from obstacles | Drone fades out |
| Ambient pad | Start game with synesthesia | Continuous low pad plays |
| Pad region change | Move snake to bottom of board | Pad root note shifts upward |
| Rhythmic pulse | Wait and listen | Low pulse every 4 ticks |
| Combo arpeggiator | Get combo > 0 | Arp notes play at variable tick rate |
| Visual ring pulse | Eat food with synesthesia on | 6 particles burst outward in food color |
| HUD indicator | Synesthesia on | "♫ SYN" text pulses in top-left |
| Oscillator cleanup | Toggle synesthesia off, then die | No hanging oscillators (drone/pad stopped) |
| Tab hidden | Switch tab during synesthesia | No audio artifacts on return |
| Y key no conflict | Y on idle screen with level >= 20 | No Prestige triggered (X = Prestige, Y = Synesthesia) |

### Feature D: Mutator Draft System

| Test | Steps | Expected |
|---|---|---|
| Draft mode toggle | Press D on idle | "Draft Mode ON" toast |
| Draft mode off | Press D again | "Draft Mode OFF" toast |
| Draft screen flow | Enable draft, start game | 3 mutator cards appear |
| Draft selection | ArrowLeft/Right on draft screen | Selection highlights change |
| Draft confirm | Enter on draft screen | Game starts with selected mutator |
| Draft skip | Escape on draft screen | Game starts with no mutator |
| No draft in daily | Daily mode + draft enabled | No draft screen (skipped) |
| Gravity mutator | Draft gravity, play | Snake falls when not pressing up/down |
| Mirror mutator | Draft mirror, press Left | Snake goes Right (controls reversed) |
| Phase shift | Draft phase_shift | Every 5th tick, snake passes through itself |
| Hunger clock | Draft hunger_clock, eat first food, wait 50 ticks | Snake shrinks by 1 |
| Hunger clock death | Draft hunger, shrink to length 0 | Death by "Starvation!" |
| Golden Age | Draft golden_food | Points ×3, food spawns half as often |
| Shrink Zone | Draft shrink_zone, play 30s | Board edges shrink, red warning border |
| Shrink Zone death | Enter shrunk area | Death "Caught by the shrinking zone!" |
| Chaos Seed | Draft chaos_seed, play 20 ticks | Food type probabilities reshuffle |
| Token earning | Unlock a new achievement | `mutatorTokens++`, toast |
| Token unlock | Earn enough tokens for locked mutator | Auto-unlock toast |
| Re-roll | R key on draft screen (has tokens) | New options appear, token decremented |
| Double rival | Draft double_rival in classic/timeAttack | Two rival snakes appear |
| Double rival in zen | Draft double_rival in zen | Rival disabled (zen excludes rivals) |
| Mutator HUD | Play with active mutator | Mutator icon + name in top-left |
| Ghost + mutator mismatch | Ghost replay with different mutator | Ghost not shown (mismatch guard) |
| Rival refactor | Play classic mode with one rival | Same behavior as before refactoring |
| Rival refactor | Remove rival | `removeRival(0)` works correctly |
| GenerateFood after refactor | Snake + rival filling board | Board-full guard works with `rivalCombinedSnake()` |

### Feature E: Gauntlet Mode

| Test | Steps | Expected |
|---|---|---|
| Mode selection | Select Gauntlet on idle screen | Mode config loads |
| Wave 1 objective | Start gauntlet | "Survive 15 seconds" displayed, countdown bar |
| Wave 1 completion | Survive full duration | Wave complete toast, intermission screen |
| Intermission navigation | ArrowLeft/Right | Pick selection highlights |
| Intermission confirm | Enter | Pick added to gauntletPicks, next wave starts |
| Intermission skip | Escape | Moves to next wave without a pick |
| Wave reset | Start wave 2 | Snake resets, food regenerates, speed changes |
| Score accumulation | Complete wave 1 (50pts) + wave 2 (80pts) | `gauntletScore = 130` |
| Death during wave | Die in wave 3 | "Run Over — Wave 3/5" display |
| All waves complete | Complete wave 5 | "Gauntlet Complete!" with total score |
| Gauntlet complete score | Check final score | `score = gauntletScore` (correct for achievements) |
| Extra length pick | Select Extra Length in intermission | Next wave starts with +5 segments |
| Food rush pick | Select Food Rush | Food spawns faster next wave |
| Wave shield pick | Select Wave Shield | 6-second shield at wave start |
| Score boost pick | Select Score Boost | +50% score in next wave |
| Slow pace pick | Select Slow Pace | 20% slower next wave |
| Combo save pick | Select Combo Keep, carry combo across wave | Combo persists between waves |
| Rival in wave 3 | Start wave 3 | Rival snake appears |
| Pause during intermission | P key during intermission | Standard pause menu appears |
| Gauntlet mastery | Complete wave 1 | masteryPoints increments, check localStorage |
| Mastery tier | Reach 5 mastery points | Bronze tier displayed on complete screen |
| Ghost replay | Play seeded gauntlet | No replay saved (gauntlet excluded) |
| Gauntlet + mutator | Draft mutator, then gauntlet | Mutator applies to all waves |
| resetWaveState isolation | Check after wave reset | Gauntlet wave/score/picks preserved; snake/food/combo reset |

---

## 5. AGENTS.md Update List

Every new architectural rule or constraint discovered during review that must be documented in AGENTS.md:

### New Sections

1. **Painter Mode**
   - `selfCollision: false` (like Zen). Painted tiles are visual-only — only physical `currentSnake` array defines collision body. `paintGrid` is `null` when not in painter mode.
   - Painter mode starts snake at length 3, base speed 80ms, progressive speed increase every 50 food eaten (speed -= 5, min 50ms).
   - Both tail (on `pop()`) and head (on `unshift()`) paint tiles. Since `selfCollision: false`, there is no collision-reversal path that would re-push the tail after painting.
   - `addScore()` is bypassed in painter mode — score is coverage % set directly in `updateGame()`.
   - Rival snake disabled. Progressive obstacles disabled. Initial obstacles still generate.

2. **Synesthesia Mode**
   - Y key toggle (NOT X — X is Prestige). Persisted as `snake_synesthesia`.
   - Drone and pad oscillators must be stopped in `gameOver()`, `endZenSession()`, AND `resetGame()`. Miss any path = audio leak.
   - Synesthesia layer is called from within `playSound()` (after existing switch), not as new switch cases. This avoids `playSound()` duplicate-case risk documented in existing AGENTS.md.
   - `lastEatenType` must be set BEFORE `playSound()` is called in `updateGame()`. Both Painter and Synesthesia depend on it.

3. **Challenge URL System**
   - `hashchange` event listener re-activates challenge on browser back.
   - `history.replaceState` cleans hash after accepting (try/catch for file:// protocol).
   - Seed input strips `~` characters on entry.
   - Challenge URL with `mode=daily` returns null — daily uses its own seed.
   - Ghost Arena (Shift+G) and single ghost (G) are mutually exclusive.

4. **Ghost Arena**
   - Up to 3 ghosts from top replays for current mode+seed.
   - Ghost labels require `ctx.save()`/`ctx.restore()` (canvas text alignment discipline).
   - Arena replays are a snapshot from toggle time — not updated mid-game.
   - When <3 replays exist, show available ghosts with "Found N of 3" note. When 0, toggle does nothing.

5. **Mutator Draft System**
   - Draft mode is opt-in: D key on idle. Default: no draft screen.
   - Mirror mutator flips direction in keydown handler (wraps `setNextDirection`), NOT in `updateGame()`. Direction is already consumed by the time updateGame processes it.
   - `skipSelfCollision` for phase_shift is a tick-local flag (reset each tick at top of `updateGame()`). Must never be a persistent global — leaking to next tick makes snake immortal.
   - Hunger clock starts only after `hungerStarted = true` (set on first food eaten). Without this guard, tick-50 on length-1 start = instant death.
   - Shrink Zone: shrunk tiles are effectively walls. Do NOT modify `wrapPosition()` — shrinking is orthogonal to wrapping. Death check happens in `updateGame()`.
   - Chaos Seed weights are NOT seeded (use `Math.random()` for reshuffling). Same design principle as draft options.
   - Token awarding from achievements happens inside `checkAchievements()`. Must be called from both `gameOver()` AND `endZenSession()` parallel paths.

6. **Gauntlet Mode**
   - `gauntletIntermission` flag gates `updateGame()` — when true, skip all game-tick logic. `animateVisuals()` still runs (renders intermission screen).
   - `resetWaveState()` resets per-wave state only. Does NOT call `resetGame()` (which resets 40+ variables including gauntlet state). Explicit list of what IS reset.
   - Wave completion sets `score = gauntletScore` BEFORE calling `gameOver()`. This ensures achievements/stats use the correct cumulative score.
   - Escape during intermission = skip pick (not quit to menu). P/Space during intermission = pause.
   - Ghost replay disabled in gauntlet mode. Multi-wave structure makes comparison meaningless.
   - Gauntlet Mastery: persistent `snake_gauntlet_mastery` in localStorage. Increments per wave completed.

7. **Rival System Refactor**
   - `rivals[]` array replaces `rivalSnake`/`rivalDx`/`rivalDy`/`rivalActive`/`rivalRespawnTimer` globals.
   - Each rival: `{ snake, dx, dy, active, respawnTimer, color }`.
   - `updateRival(idx)` takes index parameter. `spawnRival(idx)`, `removeRival(idx)`.
   - `anyRivalActive()` replaces `rivalActive` boolean checks.
   - `rivalCombinedSnake()` returns concatenated segments of all active rivals.
   - `generateFood()` now uses `rivalCombinedSnake()` — eliminates the two-source rival counting bug from existing AGENTS.md.

### Updates to Existing Sections

8. **Draw Order** — Updated to: grid → paint grid → obstacles → food → ghost arena snakes → player snake → particles/trails → overlays → flash overlay. Ghost Arena inserts between food and player snake. Paint grid inserts between grid and obstacles.

9. **Dual Render Loops — rAF Write Boundary** — Paint tile flash-brightness decay reads `paintGrid[c][r].timestamp` (visual state). The rAF loop's particle system processes synesthesia ring pulses. Both are read-only on game-logic state. No new write contention introduced.

10. **Toast Timer Sharing** — All new features (challenge URL, mutator unlock, wave complete, 100% coverage, synesthesia toggle) use `queueToast()` instead of the legacy shared-timer pattern. This follows the existing toast queue system.

11. **Progression Systems — Zen Mode Gap** — Token awarding from achievements (`mutatorTokens++`) happens inside `checkAchievements()` which is called from both `gameOver()` and `endZenSession()`. Verified same path. No new parallel-path divergence.

12. **State Management** — New sub-states added: `draftScreenVisible`, `gauntletIntermission`, `challengeFromUrl`. All are checked before acting on input in the keydown handler. The `gameState` variable remains the single source of truth for core flow; sub-states are feature-specific flags.

13. **Keybind Reference** — Updated:
   - D (idle): Draft mode toggle
   - Y: Synesthesia toggle
   - Shift+G: Ghost Arena toggle
   - K (gameover, seeded): Copy challenge link
   - R (draft screen): Re-roll options

14. **`playSound()` Switch Case** — Synesthesia layer added as a separate function called from within `playSound()`, not as new switch cases. This intentionally avoids duplicate-case risk. When adding sounds for synesthesia, grep for the case label first.