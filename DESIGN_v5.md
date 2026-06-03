# Snake Game — v5 Design Plan

## Vision

v4 gave us seeded runs, ghost replay, 2-player versus, accessibility, and QoL polish. The game is polished and complete. v5 takes it to the next level: **community virality, sensory immersion, infinite replayability, and visual spectacle** — all within the single HTML file constraint.

The five features were selected from a cross-agent brainstorm for maximum impact across different dimensions:

| Dimension | Feature |
|---|---|
| Social / Virality | A: Challenge URL Deep-Linking & Ghost Arena |
| Visual Spectacle | B: Canvas Painter Mode |
| sensory Immersion | C: Procedural Soundscape (Synesthesia Mode) |
| Infinite Replayability | D: Mutator Draft System |
| Structural Variety | E: Rogue-Lite Gauntlet Mode |

---

## Feature A: Challenge URL Deep-Linking & Ghost Arena

### Overview

Encode the game seed, mode, and an optional target score into a URL hash fragment (e.g., `#classic~abc123~500`). When anyone opens that URL, the game auto-selects the mode, fills in the seed, and starts. This turns every seeded run into a one-click challenge — shareable on social media, Discord, or anywhere a link works.

Ghost Arena extends this: instead of racing a single saved ghost, the player races **up to 3 top ghosts simultaneously**. Each ghost is drawn in a distinct color with a small label (1st, 2nd, 3rd). The ghosts come from the existing replay leaderboard (top 5 per mode per seed). This is the feature that turns the game from a solo time-killer into a speedrunning platform — all serverless, all in one file.

### Why It's Next-Level

A shareable URL is the single most viral mechanic a browser game can have. "Beat my score: [link]" is one click. No installation, no account, no server. Combined with ghost racing, this creates **competitive determinism** — same board, same food, same obstacles. The only variable is skill. This is how Tetris Effect and Mario Maker built communities, achieved with zero infrastructure.

### Dependencies on Existing Systems

- **Seeded runs** (`activeSeed`, `seededRandom`, `mulberry32`) — URL encoding is meaningless without deterministic boards
- **Ghost replay system** (`replayEvents`, `rebuildGhost`, `loadReplays`, `saveManager`) — Ghost Arena reuses the full replay pipeline; just renders multiple ghosts instead of one
- **`MODE_CONFIG`** / `MODE_ORDER` — URL mode must map to an existing mode key
- **Idle screen** — URL landing page intercepts normal idle flow to auto-configure and start
- **`startGame()`** — called programmatically after URL parsing instead of user keypress

### Data Model

```js
const CHALLENGE_URL_VERSION = 1;

// URL hash format: #<mode>~<seed>~<targetScore?>
// Examples:
//   #classic~abc123        → Classic mode, seed "abc123", no target
//   #classic~abc123~500    → Classic mode, seed "abc123", beat 500 points
//   #timeAttack~myseed~300 → Time Attack, seed "myseed", beat 300

// Parsed structure:
let challengeFromUrl = null;
// { mode: 'classic', seed: 'abc123', targetScore: 500, version: 1 }

// Ghost Arena config
const GHOST_ARENA_MAX = 3;
const GHOST_ARENA_COLORS = [
    { body: '#66CCFF', head: '#4488AA', label: '1st', alpha: 0.35 },
    { body: '#FF8866', head: '#AA4422', label: '2nd', alpha: 0.25 },
    { body: '#88FF88', head: '#44AA44', label: '3rd', alpha: 0.20 },
];
```

### Rendering Details

**Challenge landing overlay** (drawn when `challengeFromUrl !== null` and `gameState === 'idle'`):
- Dark overlay with challenge info: mode name, seed, target score (if any)
- "Press Enter to accept challenge" or auto-start after 2 seconds
- If target score is set, show it prominently: "Beat 500 points!"

**Ghost Arena rendering** (inserted in `drawGame()` before `drawSnake(t)`):
- Render up to 3 ghosts in order: 1st (most opaque) → 3rd (least opaque)
- Each ghost uses `ctx.globalAlpha` from `GHOST_ARENA_COLORS[i].alpha`
- Small label above each ghost head: `"1st"`, `"2nd"`, `"3rd"` in the ghost's color
- Ghost rendering reuses existing `drawSnakeBody()` pattern from v4's ghost feature
- Ghost labels use `ctx.save()`/`ctx.restore()` (canvas text alignment discipline)
- Draw order: grid → obstacles → food → **ghost arena snakes** → player snake → particles/trails → overlays → flash

**Target score HUD** (when `challengeFromUrl.targetScore` is set, during gameplay):
- Small label in top-left below existing score: `Target: 500`
- Color: gold when below target, white when reached/exceeded

**URL share button on game-over** (when seeded run completes):
- Existing game-over screen gets "Copy Challenge Link" button
- Encodes current mode + seed into hash, copies to clipboard via `navigator.clipboard.writeText()`
- Toast: "Challenge link copied!"

### User Interaction

**Accepting a challenge URL:**
1. Player opens `snake.html#classic~abc123~500`
2. On page load, `parseChallengeUrl()` runs, sets `challengeFromUrl`
3. Idle screen shows challenge overlay instead of mode selector
4. Enter or touch → auto-selects mode, sets seed, calls `startGame()`
5. If player presses Escape at challenge overlay → clear `challengeFromUrl`, show normal idle

**Ghost Arena toggle:**
- `G` key toggles Ghost Arena on/off (existing ghost toggle is `G`, extend it)
- When Ghost Arena is on and multiple replays exist for current mode+seed, show all (up to 3)
- When only one replay exists, falls back to single ghost (backward compatible)

**Creating a challenge:**
- On game-over screen (seeded run), "Copy Challenge Link" button
- On idle screen, if seed is filled in, "Share Challenge" button next to seed input

### Integration Points

**Game loop:** No changes. Ghost Arena is purely visual — ghosts are reconstructed from replays each tick (existing `rebuildGhost()` pattern, called for each ghost).

**State machine:**
- New state: `challengeFromUrl` checked in idle-screen rendering path
- If present, `drawIdleScreen()` renders challenge overlay instead of mode selector
- `startGame()` called with `challengeFromUrl.mode` and `challengeFromUrl.seed` pre-set
- After game starts, `challengeFromUrl` is cleared (one-shot)

**Save system:**
- No new localStorage keys — replays already stored as `snake_replays_<mode>`
- `challengeFromUrl` is ephemeral (page-load only, not persisted)
- Clipboard write is a browser API, no storage needed

**URL parsing on page load:**
```js
window.addEventListener('load', function() {
    const hash = window.location.hash.slice(1);
    if (hash) challengeFromUrl = parseChallengeUrl(hash);
});

function parseChallengeUrl(hash) {
    const parts = hash.split('~');
    if (parts.length < 2) return null;
    const mode = parts[0];
    if (!MODE_CONFIG[mode]) return null;
    const seed = parts[1];
    if (!seed) return null;
    const targetScore = parts[2] ? parseInt(parts[2], 10) || null : null;
    return { mode, seed, targetScore, version: CHALLENGE_URL_VERSION };
}
```

**`history.replaceState`** on game start to clean the URL (avoid re-triggering on refresh):
```js
if (challengeFromUrl) {
    history.replaceState(null, '', window.location.pathname);
}
```

### Edge Cases & Fragility Notes

- **URL hash on refresh:** If the player refreshes mid-game with a challenge URL, `parseChallengeUrl` fires again. Must either (a) clear hash via `history.replaceState` after accepting, or (b) guard on `gameState !== 'idle'` to ignore. Option (a) is cleaner.
- **Invalid mode in URL:** `#invalid~abc123` — `parseChallengeUrl` returns null, falls through to normal idle. Must not crash.
- **Seed with `~` character:** The `~` delimiter breaks if the seed contains one. Rule: seeds are URL-component-safe strings (alphanumeric + hyphens). The seed input field should strip/reject `~` on entry. For the URL hash, use `encodeURIComponent`/`decodeURIComponent` on the seed part.
- **Ghost Arena with daily mode:** Daily mode uses its own `getDailySeed()`. A challenge URL with `mode=daily` should auto-detect the daily seed, not use the URL seed. The `parseChallengeUrl` handler should reject mode=daily or silently switch to daily seed.
- **Multiple ghosts on the same tick:** `rebuildGhost()` is called 3 times per tick. The function rebuilds from scratch each call (no incremental state). For 3 ghosts × a 200-tick game, this is 600 ghost rebuilds — each iterating the replay events array. Performance: each replay has ~30-50 events, so ~3 × 200 × 50 = 30,000 iterations per game. Negligible.
- **Ghost Arena + existing `ghostEnabled` flag:** The existing `ghostEnabled` toggle shows one ghost. Ghost Arena should supplant it when multiple replays are available: if ≥2 replays match current seed+mode, show arena; if 1, show single ghost; if 0, show nothing. The `G` key toggles the entire feature.
- **Clipboard API failure:** `navigator.clipboard.writeText()` requires HTTPS or localhost. On plain HTTP, it throws. Fallback: `document.execCommand('copy')` with a hidden textarea. Or just toast "Copy failed — use HTTPS".
- **`history.replaceState` in file:// protocol:** Works in most browsers but not all. Guard with try/catch.

### Implementation Complexity

| Component | Lines |
|---|---|
| `parseChallengeUrl()` + URL hash listener | ~25 |
| Challenge landing overlay (`drawChallengeOverlay`) | ~40 |
| Ghost Arena multi-ghost rendering (extend `drawGame`) | ~30 |
| Ghost label rendering per head | ~15 |
| Target score HUD element | ~10 |
| "Copy Challenge Link" button on game-over | ~20 |
| "Share Challenge" button on idle screen | ~15 |
| Seed input validation (strip `~`) | ~5 |
| `history.replaceState` cleanup | ~5 |
| Clipboard fallback | ~10 |
| **Total** | **~175** |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| URL hash collisions/conflicts with browser navigation | Low | Low | `history.replaceState` clears hash after parsing |
| Clipboard API not available | Medium | Low | Fallback copy method + toast |
| Ghost Arena performance with long replays | Low | Medium | Cap ghost rebuilds to current tick; existing `rebuildGhost` is O(events), fast |
| Challenge URL format changes between game versions | Low | Medium | `CHALLENGE_URL_VERSION` in hash; version mismatch → show "Challenge outdated" toast, offer normal idle |
| Social media link previews don't show game content | High | Low | Inherent to single HTML file; can't control OpenGraph without a server. Accept limitation |

---

## Feature B: Canvas Painter Mode

### Overview

A new game mode ("Painter") where the snake leaves a **permanent colored trail** as it moves. Instead of the snake body disappearing at the tail, every tile the snake traverses becomes a permanent paint mark on the canvas. The board gradually fills with color, and the player's goal is to **cover as much of the board as possible** before dying.

Food still spawns and must be eaten to grow (longer snake = faster coverage), but the scoring metric is **percentage of board covered**, displayed as a live counter. Different food types leave different paint colors (matching `FOOD_TIERS` colors). The snake's head color cycles through a palette based on combo. When coverage reaches 100%, the mode continues — the player now paints *over* existing tiles, and a "paint layers" counter increments.

### Why It's Next-Level

This is the visual spectacle mode. It's mesmerizing to watch a board fill with color — the gameplay hook is "paint the whole canvas." It's low-complexity mechanically (standard snake + no removal), but the visual payoff is enormous. Combined with the existing trail cosmetics and particle systems, this mode becomes a screensaver-quality experience. Clips of filled boards would be highly shareable.

### Dependencies on Existing Systems

- **`MODE_CONFIG`** — new "painter" entry with `selfCollision: true, wrap: true, wallDeath: false`
- **`FOOD_TIERS`** — paint colors map directly from tier `color` property
- **`drawSnake()` / trail system** — Painter modifies the trail to be permanent (no fade)
- **`generateFood()`** — standard food gen; painter mode still needs food to grow
- **`updateGame()`** — tail segment no longer removed, added to paint grid instead
- **`drawGame()`** — paint grid rendered as a background layer before objects
- **`COMBO_MILESTONES`** — combo affects the snake head's current paint color
- **Progression (XP/levels/achievements)** — painter mode earns XP and has own achievements

### Data Model

```js
// MODE_CONFIG addition
painter: {
    name: 'Painter', speed: 120, selfCollision: true, wallDeath: false, wrap: true,
    timer: null, scoreIs: 'coverage', earnXP: true, achievementsEnabled: true
},

// Paint grid: 2D array tracking which tiles are painted and with what color
// Dimensions: (CANVAS_WIDTH / TILE_SIZE) x (CANVAS_HEIGHT / TILE_SIZE)
let paintGrid = null; // null when not in painter mode
// paintGrid[col][row] = { color: '#FF4444', layer: 1 } or null (unpainted)

// Coverage tracking
let paintCoveredCount = 0;
let paintTotalTiles = 0;
let paintLayers = 1; // increments each time 100% coverage is hit

// Snake's current paint color — dictated by combo + food tier
let currentPaintColor = '#FF4444';

// Painter-specific stats (added to stats object)
// stats.painterGamesPlayed, stats.painterMaxCoverage, stats.painterMaxLayers
```

### Rendering Details

**Paint grid rendering** (new layer in `drawGame()`, inserted after grid, before obstacles):
```
Draw order: grid → **paint grid** → obstacles → food → snake → particles/trails → overlays → flash
```

Each painted tile is a `fillRect` at the tile position with the stored color at ~85% opacity (slightly translucent so the grid pattern shows through). This keeps the aesthetic consistent rather than a flat fill.

**Unpainted tiles:** Not drawn (show background/grid as normal).

**Paint grid performance:** 20×20 = 400 tiles max. Even if all painted, that's 400 `fillRect` calls per frame — trivial. No caching needed (colors vary per tile).

**Snake head paint color cycle:**
- Base color from the last-eaten food tier (`FOOD_TIERS[eatenType].color`)
- At combo ≥ 10: color shifts every 3 food items through `FOOD_TIERS` palette
- At combo ≥ 30: rainbow cycle using `renderTime` (existing pattern from `trace_rainbow`)

**100% coverage milestone:**
- Flash screen white briefly (reuse `flashOverlay` system)
- Toast: "100% Coverage! Layer 2!"
- `paintLayers` increments
- Already-painted tiles can be overpainted (layer counter in each tile increments)
- Visual: on layer 2+, tiles show a subtle gradient overlay of the new color over the old

### User Interaction

- **Mode selection:** "Painter" appears in idle screen mode selector (after Walled)
- **Gameplay:** Standard snake controls (arrows/WASD/touch/swipe)
- **No new keybinds** — painter mode plays like Classic but with permanent trails
- **Game-over:** Shows final coverage %, layers, and "paint map" (the completed canvas stays visible)

### Integration Points

**Game loop (`updateGame()`):**
- When `gameMode === 'painter'` and the snake tail would normally be removed:
  ```js
  // Instead of: currentSnake.pop();
  // Do:
  const tail = currentSnake.pop();
  const col = tail.x / TILE_SIZE;
  const row = tail.y / TILE_SIZE;
  if (!paintGrid[col][row]) {
      paintGrid[col][row] = { color: currentPaintColor, layer: paintLayers };
      paintCoveredCount++;
  } else {
      paintGrid[col][row] = { color: currentPaintColor, layer: paintGrid[col][row].layer + 1 };
  }
  ```
- Snake head position is also painted (the head paints as it moves, not just the tail)

**Score display:**
- Painter mode score is `coveragePercent` (0.0–100.0+), not integer points
- `score = Math.floor((paintCoveredCount / paintTotalTiles) * 100)`
- When `paintLayers > 1`, show: "120% (Layer 2)"

**`resetGame()`:**
- Initialize `paintGrid` as empty 2D array
- Reset `paintCoveredCount`, `paintLayers`, `currentPaintColor`

**Achievements (new):**
- `PAINTER_50`: "Half Canvas" — Reach 50% coverage in Painter mode. XP: 200
- `PAINTER_100`: "Full Canvas" — Reach 100% coverage. XP: 500
- `PAINTER_LAYER2`: "Layer Cake" — Complete a second paint layer. XP: 400
- `PAINTER_RAINBOW`: "Prismatic" — Paint using all 6 food-tier colors in one run. XP: 300

**Session summary:** Add "Coverage" and "Layers" rows when mode is painter.

### Edge Cases & Fragility Notes

- **Snake fills the board in painter mode:** The board-full guard in `generateFood()` must account for paint coverage. A tile is "occupied" if it has the snake on it, BUT painted tiles are NOT obstacles — they're visual only. The snake can traverse painted tiles freely. Only the snake body itself blocks food placement. The board-full check remains `currentSnake.length >= totalTiles - obstacles.length`.
- **Self-collision on painted tiles:** The snake's painted trail is **not** the snake body. Painted tiles are visual markers; only the current `currentSnake` array defines the snake's physical body. Self-collision checks the snake array, not the paint grid. This is critical — if painted tiles were treated as body, the mode would be instantly unplayable.
- **Wrapping + paint grid coordinates:** `wrapPosition()` already handles wrapping. The paint grid index must use `Math.floor(wrappedX / TILE_SIZE)` and clamp to grid bounds. A wrapped position at x=400 should map to column 0, not column 20. Verify: `CANVAS_WIDTH / TILE_SIZE = 20`, columns 0-19. `wrappedX = 0` → col 0. `wrappedX = 380` → col 19. After wrap, `x = 0` → col 0. Correct.
- **Speed food in painter mode:** Speed food should still work (temporary speed boost). Painter mode uses `speed: 120` base, slower than Classic's dynamic speed — giving more time to see the painting.
- **Rival snake in painter mode:** Rival disabled. Two snakes competing for coverage adds complexity without enough fun. Painter is a meditative mode.
- **Obstacles in painter mode:** Obstacles ARE present (they create interesting negative space in the painting). Obstacle tiles cannot be painted.
- **Power-ups in painter mode:** Shield and Slow-Mo work. Magnet works. All three are useful here.
- **Draw order — paint grid behind obstacles:** Obstacles render over paint, creating "unpainted" regions inside the paint. This is the correct visual — obstacles are physical objects.
- **Canvas save/restore in paint grid rendering:** The paint grid loop sets `ctx.fillStyle` per tile. After the loop, `ctx.fillStyle` is whatever the last tile's color was. This leaks into subsequent `drawSnake()`. Fix: wrap the paint grid render in `ctx.save()`/`ctx.restore()`, or explicitly set `ctx.fillStyle` afterward. Per AGENTS.md discipline: use save/restore.
- **localStorage for paint maps:** Do NOT save the paint grid to localStorage — it's 400+ entries and nobody reloads to see their painting. The mode is ephemeral visual candy. If we want a "save screenshot" feature, use `canvas.toDataURL()` + download link.
- **`paintTotalTiles` changes with obstacles:** If obstacles exist, `paintTotalTiles = totalTiles - obstacles.length`. Obstacles can't be painted. Coverage % reflects paintable area only.

### Implementation Complexity

| Component | Lines |
|---|---|
| `MODE_CONFIG.painter` entry | ~5 |
| `paintGrid` initialization + reset | ~20 |
| Paint-on-move logic in `updateGame()` | ~25 |
| Paint grid rendering in `drawGame()` | ~15 |
| Coverage % calculation + display | ~10 |
| Layer-2+ visual gradient | ~15 |
| 100% coverage flash/toast handler | ~10 |
| Current paint color tracking | ~15 |
| 4 new achievements | ~20 |
| Mode selector addition + stats integration | ~10 |
| Game-over screen for painter | ~15 |
| **Total** | **~160** |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Self-collision confusion with paint grid | Medium | Critical | Clear comment + separate variable: `paintGrid` is visual-only, `currentSnake` is collision body |
| Paint grid coordinate overflow with wrapping | Low | High | Use `wrapPosition()` before grid indexing; clamp indices |
| Performance degradation on high-coverage frames | Low | Low | 400 fillRects is trivial; no concern |
| Mode confusion — player doesn't understand why score is % | Low | Medium | Onboarding: first time painter mode shows a 2-line tip overlay "Paint the board! Eat food to grow longer." |
| Paint rendering order conflicts with existing draw pipeline | Low | Medium | Insert paint grid at fixed position (after grid, before obstacles); wrap in save/restore |

---

## Feature C: Procedural Soundscape (Synesthesia Mode)

### Overview

A toggleable mode where the game composes music in real-time based on gameplay actions. Food tier → musical note (common=C4, uncommon=E4, rare=G4, epic=B4, bonus=A4, speed=D4). Combo multiplier → octave shift (combo 1x = octave 4, 5x = octave 5, 10x = octave 6). Obstacle proximity creates a low-frequency tension drone. The result: every run generates a unique piece of music determined by the player's actions.

Synesthesia Mode builds entirely on the existing Web Audio API infrastructure (`audioCtx`, oscillator creation in `playSound()`). No new audio library. No samples. Pure synthesis.

### Why It's Next-Level

This is the emotional immersion feature. The game already has sound effects; Synesthesia turns them into a **living soundtrack**. Players will replay runs specifically to "hear what happens." Combined with seeded runs, the same seed + same path = same music — a deterministic composition. This is the feature that makes the game feel like an art piece, not just a game.

### Dependencies on Existing Systems

- **`playSound()`** — Synesthesia extends (not replaces) the existing sound system. When Synesthesia is on, `playSound()` adds harmonic layers; the base sound effects still play.
- **`audioCtx`** — same AudioContext, just more oscillators
- **`FOOD_TIERS`** — maps to musical notes
- **`comboMultiplier`** — maps to octave offset
- **`obstacles`** — proximity triggers drone
- **`muted` flag** — Synesthesia respects mute
- **`GAME_TICK` counter** — used for drone envelope timing

### Data Model

```js
let synesthesiaMode = false; // persisted: saveManager.get('snake_synesthesia', '') === '1'

const SYNESTHESIA_NOTES = {
    common:   { note: 'C', freq: 261.63 }, // C4
    uncommon: { note: 'E', freq: 329.63 }, // E4
    rare:     { note: 'G', freq: 392.00 }, // G4
    epic:     { note: 'B', freq: 493.88 }, // B4
    bonus:    { note: 'A', freq: 440.00 }, // A4
    speed:    { note: 'D', freq: 293.66 }, // D4
};

const SYNESTHESIA_COMBO_OCTAVES = [
    { minCombo: 0,  octave: 4 },
    { minCombo: 5,  octave: 5 },
    { minCombo: 10, octave: 6 },
    { minCombo: 20, octave: 7 },
];

// Drone state
let droneOsc = null;
let droneGain = null;
let droneActive = false;

// Ambient pad state
let padOsc1 = null;
let padOsc2 = null;
let padGain = null;
let padActive = false;

// Note reverb via delay
let reverbDelay = null;
let reverbGain = null;
```

### Rendering Details

Synesthesia is an **audio-only** feature — no canvas rendering changes. However, there are visual indicators:

**HUD element** (when Synesthesia is active):
- Small note symbol in top-left area: "♫ SYN" (rendered in `drawGame()` after mute indicator)
- The note character pulses (alpha oscillates via `Math.sin(renderTime * 0.005)`) to show the feature is active

**Visual feedback for notes (optional enhancement):**
- When a food-tier note plays, a brief ring/pulse emanates from the food position
- Reuses existing particle system — spawns a ring of 6 particles in the food's tier color that expand outward
- This is a stretch goal; core Synesthesia is audio-only

### User Interaction

- **Toggle:** `X` key cycles Synesthesia on/off (during idle or gameplay)
- **Persistence:** Stored as `snake_synesthesia` in localStorage
- **Toast on toggle:** "♫ Synesthesia On" / "Synesthesia Off"
- **Works with existing sound toggle:** If `muted`, no Synesthesia either. Synesthesia is layered on top, not independent.

### Integration Points

**`playSound()` extension:**
The function is extended with a Synesthesia layer. When `synesthesiaMode` is true AND the sound is food-related (`eat`, `bonus`, `speed`), add harmonic overtones:

```js
function playSound(name) {
    if (muted) return;
    // ... existing audioCtx setup ...

    // EXISTING: base sound effect plays unchanged
    switch (name) { /* ... existing cases ... */ }

    // NEW: Synesthesia layer
    if (synesthesiaMode) {
        playSynesthesiaLayer(name, now);
    }
}

function playSynesthesiaLayer(name, now) {
    // Food eat sounds → musical notes
    if (name === 'eat' || name === 'bonus' || name === 'speed') {
        const tierInfo = SYNESTHESIA_NOTES[lastEatenType] || SYNESTHESIA_NOTES.common;
        const octave = getSynesthesiaOctave(comboMultiplier);
        const freq = tierInfo.freq * Math.pow(2, octave - 4);
        
        // Main note
        const noteOsc = audioCtx.createOscillator();
        const noteGain = audioCtx.createGain();
        noteOsc.type = 'sine';
        noteOsc.frequency.value = freq;
        noteGain.gain.setValueAtTime(0.15, now);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        noteOsc.connect(noteGain);
        noteGain.connect(audioCtx.destination);
        noteOsc.start(now);
        noteOsc.stop(now + 0.4);
        
        // Fifth harmonic (adds richness)
        const harmOsc = audioCtx.createOscillator();
        const harmGain = audioCtx.createGain();
        harmOsc.type = 'sine';
        harmOsc.frequency.value = freq * 1.5; // perfect fifth
        harmGain.gain.setValueAtTime(0.05, now);
        harmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        harmOsc.connect(harmGain);
        harmGain.connect(audioCtx.destination);
        harmOsc.start(now);
        harmOsc.stop(now + 0.3);
    }
    
    // Combo milestone → chord
    if (name === 'combo_milestone') {
        playSynesthesiaChord(now);
    }
    
    // Game over → resolve chord (play tonic)
    if (name === 'gameover') {
        playSynesthesiaResolution(now);
    }
}
```

**Drone system** (obstacle proximity):
- Every 10 game ticks, check Manhattan distance from snake head to nearest obstacle
- If distance ≤ 3 tiles: drone ramps up (gain from 0 to 0.08 over 20 ticks)
- If distance > 3 tiles: drone ramps down (gain from current to 0 over 20 ticks)
- Drone uses a low-frequency oscillator: `55 Hz` (A1) sawtooth wave, heavily filtered
- Drone is created lazily on first proximity event, not on game start

**Ambient pad** (continuous background):
- Two slightly detuned sine oscillators (drone at root note of current key)
- Very low volume (0.03) — just enough to fill silence
- Changes root when combo octave shifts (C → C5 → C6 etc.)
- Starts on game start, stops on game over

**Combo milestone chords:**
- At combo 3: C major triad (C4 + E4 + G4)
- At combo 5: adds 7th (C4 + E4 + G4 + B4)
- At combo 10: adds 9th (C4 + E4 + G4 + B4 + D5)
- At combo 20+: full extended chord with octave doubling
- Each chord note is a separate oscillator with staggered start (0, 0.05, 0.1, ...) for an arpeggiated feel

### Edge Cases & Fragility Notes

- **Audio node limit:** Web Audio API has no hard limit on active nodes, but browsers throttle. Each food-eat creates 2 oscillators (note + fifth), each chord creates up to 5. At fast gameplay (5 food/sec), that's 10 oscillators/sec. Each stops within 0.4s, so max concurrent ≈ 4. Well within limits. Combo chord moments add 5 more briefly.
- **AudioContext resume on user gesture:** `audioCtx` is created lazily and may be in `suspended` state. The existing `playSound()` already calls `audioCtx.resume()`. Synesthesia reuses this path. No issue.
- **Drone oscillator cleanup:** The drone oscillator must be explicitly stopped on game over / mode exit. If the game crashes or the tab is hidden, the drone continues. Fix: `gameOver()` and `resetGame()` must `stopDrone()`.
- **`exponentialRampToValueAtTime` with zero target:** This Web Audio method cannot target 0 (must be >0). Use 0.001 as the target (existing pattern in `playSound()`). All Synesthesia gain ramps already use 0.001.
- **Synesthesia + mute interaction:** `muted` flag is checked at the top of `playSound()`. Synesthesia is called from within `playSound()`, so muted → no Synesthesia. Correct.
- **`lastEatenType` tracking:** The Synesthesia layer needs to know which food tier was just eaten to pick the note. Add a global `lastEatenType = 'common'` updated in the food-eat block of `updateGame()`. Must be set BEFORE `playSound()` is called.
- **Mobile Safari audio restrictions:** iOS requires audio to start from a user gesture. The existing `playSound()` already handles this (first touch/click resumes `audioCtx`). No new restriction.
- **Performance on low-end devices:** The drone is a single sawtooth oscillator at 55 Hz — negligible CPU. The chord oscillators are brief (0.4s each). No concern.
- **`playSound()` duplicate case labels:** Per AGENTS.md, `playSound()` had duplicate `case 'combo_milestone'`. Verify no new duplicates when adding Synesthesia cases. The Synesthesia layer is a separate function, not new cases in the switch — this avoids the duplicate-case risk.

### Implementation Complexity

| Component | Lines |
|---|---|
| `SYNESTHESIA_NOTES` config | ~15 |
| `playSynesthesiaLayer()` — food notes + harmonics | ~40 |
| `playSynesthesiaChord()` — combo milestone chords | ~35 |
| `playSynesthesiaResolution()` — game-over resolution | ~15 |
| Drone system (start, stop, proximity check, ramp) | ~40 |
| Ambient pad (start, stop, root change) | ~25 |
| Toggle (`X` key) + persistence + toast | ~15 |
| HUD indicator "♫ SYN" | ~10 |
| `lastEatenType` tracking in `updateGame()` | ~5 |
| Drone cleanup in `gameOver()` / `resetGame()` | ~10 |
| **Total** | **~210** |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Audio fatigue on long sessions | Medium | Low | Keep volumes low (0.03-0.15); drone caps at 0.08; user can mute anytime |
| Oscillator leaks (not stopped) | Medium | Medium | Explicit cleanup in `gameOver()`, `resetGame()`, toggle-off |
| Mobile Safari audio start | Low | Low | Reuse existing `audioCtx.resume()` pattern |
| Clashing notes sound bad | Medium | Low | Use only consonant intervals (perfect 5th, major 3rd, octave); pentatonic-based mapping |
| AudioContext creation overhead on toggle | Low | Low | `audioCtx` is created once in `playSound()` — lazy, shared |

---

## Feature D: Mutator Draft System

### Overview

Before each run (when starting a seeded or unseeded game), the player is offered a **draft of 3 random mutators** and picks 1. Mutators are rule-bending modifiers that fundamentally change how the game plays. Examples: gravity (snake falls down when not pressing keys), mirror (controls are reversed left/right), phase shift (snake phases through itself every 5 ticks), hunger clock (lose 1 length every 50 ticks — die at length 0), double rival (two rival snakes).

Mutator tokens are earned from achievements — each achievement completion grants 1 token. Tokens are the currency that unlocks new mutators in the draft pool. Base pool has 3 mutators (gravity, mirror, phase shift); tokens unlock 5 more. Drafting is always free — tokens only expand the pool, not pay-per-use.

### Why It's Next-Level

This is the infinite replayability engine. Every run can be fundamentally different based on which mutator you draft. Combined with seeded runs (6 modes × 8 mutators = 48 mode+mutator combinations, times infinite seeds), the game has effectively unlimited variety. The token system ties mutator unlocks to the achievement system, giving players a reason to chase achievements beyond XP. This is the roguelike deck-builder loop: unlock → draft → play → unlock more.

### Dependencies on Existing Systems

- **`startGame()`** — mutator draft screen appears between idle and `startGame()`
- **Achievement system** — each `checkAchievements()` completion awards tokens
- **`saveManager`** — persists unlocked mutators and token count
- **`updateGame()`** — each mutator hooks into the game-tick update at specific points
- **`MODE_CONFIG`** — mutators are mode-independent; they layer on top of any mode
- **Combo system** — some mutators affect combo (e.g., double rival → faster food competition)
- **Seed system** — mutator selection should NOT be seeded (draft RNG uses `Math.random()`, not `seededRandom()`) — different players should get different draft choices even on the same seed

### Data Model

```js
const MUTATOR_DEFS = {
    gravity: {
        name: 'Gravity',
        icon: '⬇️',
        desc: 'Snake falls down when you stop pressing keys',
        tokenCost: 0, // free (in base pool)
    },
    mirror: {
        name: 'Mirror',
        icon: '🪞',
        desc: 'Left and right controls are reversed',
        tokenCost: 0,
    },
    phase_shift: {
        name: 'Phase Shift',
        icon: '👻',
        desc: 'Snake phases through itself every 5 ticks',
        tokenCost: 0,
    },
    hunger_clock: {
        name: 'Hunger Clock',
        icon: '⏳',
        desc: 'Lose 1 length every 50 ticks. Die at length 0.',
        tokenCost: 3,
    },
    double_rival: {
        name: 'Double Rival',
        icon: '🐍🐍',
        desc: 'Two rival snakes compete for food',
        tokenCost: 5,
    },
    golden_food: {
        name: 'Golden Age',
        icon: '✨',
        desc: 'All food gives 3× points but spawns half as often',
        tokenCost: 4,
    },
    shrink_zone: {
        name: 'Shrink Zone',
        icon: '📐',
        desc: 'Board shrinks by 1 row/column every 30 seconds',
        tokenCost: 6,
    },
    chaos_seed: {
        name: 'Chaos Seed',
        icon: '🎲',
        desc: 'Food type probability reshuffles every 20 ticks',
        tokenCost: 8,
    },
};

const MUTATOR_BASE_POOL = ['gravity', 'mirror', 'phase_shift'];
const MUTATOR_DRAFT_SIZE = 3; // show 3, pick 1

let mutatorTokens = 0; // persisted: snake_mutator_tokens
let unlockedMutators = [...MUTATOR_BASE_POOL]; // persisted: snake_mutator_unlocks
let activeMutator = null; // null or a mutator key like 'gravity'
let draftOptions = []; // temp: 3 mutator keys shown in draft screen
let draftScreenVisible = false;
```

### Rendering Details

**Draft screen overlay** (drawn when `draftScreenVisible === true`):
- Dark overlay (reuse `drawOverlay` pattern with `rgba(0,0,0,0.85)`)
- Title: "Draft a Mutator"
- 3 cards in a row, each showing: mutator icon + name + description
- Current card highlighted with gold border (controlled by `draftSelection`, 0-2)
- ArrowLeft/ArrowRight or A/D to navigate; Enter to select; Escape to skip (no mutator)
- Touch: tap on a card to select it
- Skip option at bottom: "Press Escape to play without a mutator"

**Active mutator HUD element** (during gameplay):
- Small badge in top-left: mutator icon + name (e.g., "⬇️ Gravity")
- Position: below Synesthesia indicator if both active

**Mutator-specific visual effects:**
- **Gravity:** Small downward arrows float across the canvas (cosmetic, rAF-decayed particles)
- **Mirror:** Canvas has a subtle horizontal mirror flip effect on the border (CSS `transform: scaleX(-1)` on a wrapper, or canvas flip)
- **Phase shift:** When phasing is active (every 5th tick), snake briefly becomes semi-transparent (alpha 0.5)
- **Hunger clock:** Pulsing countdown timer next to mutator badge
- **Double rival:** Each rival gets a distinct color (existing rival is red; second is orange)
- **Golden Age:** All food has a golden shimmer (existing `glow` property + gold tint)
- **Shrink Zone:** Red warning border on the shrinking edges
- **Chaos Seed:** Food has a "jitter" visual (slight random position offset that resets each frame)

### User Interaction

**Draft flow:**
1. Player selects mode on idle screen, presses Enter
2. Instead of immediate `startGame()`, `draftScreenVisible = true`
3. Player navigates draft cards (ArrowLeft/Right, touch tap)
4. Enter confirms selection → `activeMutator = draftOptions[draftSelection]`
5. `startGame()` called with mutator active
6. If Escape pressed → `activeMutator = null`, `startGame()` without mutator

**Unlocking mutators:**
- When `checkAchievements()` awards a new achievement, check if `mutatorTokens < MUTATOR_DEFS[key].tokenCost`
- Auto-unlock: when tokens ≥ cost for a locked mutator, show toast: "🔓 New mutator unlocked: Gravity!"
- Player doesn't manually spend tokens — auto-unlock is the simplest UX for a single-file game
- Alternative (more control): let player spend tokens in cosmetics panel "Mutators" tab. But this adds UI complexity.
- **Decision:** Auto-unlock. Simpler.

**During gameplay:**
- Mutator effects are passive — no new keybinds
- Some mutators change the game feel significantly (mirror, gravity) — player adapts

### Integration Points

**`startGame()`:**
- If mutator draft is enabled (feature flag / always on after first game), show draft screen before starting
- After draft selection, `startGame()` proceeds as normal
- `activeMutator` is checked in `updateGame()` for mutator-specific logic

**`updateGame()` mutator hooks:**
```js
// After direction input processing:
if (activeMutator === 'mirror') {
    // Flip horizontal: dx = -dx
    nextDirection = nextDirection ? { dx: -nextDirection.dx, dy: nextDirection.dy } : null;
}

// After velocity application, before collision check:
if (activeMutator === 'gravity') {
    // If no horizontal direction just changed, apply downward bias
    if (dy !== TILE_SIZE && dx !== 0) {
        // Override: snake falls unless actively going up
        nextDirection = { dx: dx, dy: TILE_SIZE };
    }
}

// Before self-collision check:
if (activeMutator === 'phase_shift' && gameTick % 5 === 0) {
    skipSelfCollision = true; // flag
}

// End of tick:
if (activeMutator === 'hunger_clock' && gameTick > 0 && gameTick % 50 === 0) {
    if (currentSnake.length > 1) {
        currentSnake.pop(); // shrink by 1
    } else {
        // length 1 → die
        triggerDeath();
    }
}
```

**Achievement → token flow:**
```js
// In checkAchievements(), after a new achievement is awarded:
mutatorTokens++;
saveManager.set('snake_mutator_tokens', mutatorTokens);

// Auto-unlock check:
for (const key of Object.keys(MUTATOR_DEFS)) {
    const def = MUTATOR_DEFS[key];
    if (!unlockedMutators.includes(key) && mutatorTokens >= def.tokenCost) {
        unlockedMutators.push(key);
        saveManager.setJSON('snake_mutator_unlocks', unlockedMutators);
        // ... check which one was just unlocked, show toast ...
    }
}
```

**`generateFood()` + Golden Age mutator:**
- `golden_food`: food spawn rate halved (spawn timer threshold doubled), but all point values ×3
- Implement: in the food-spawn timer check, if `activeMutator === 'golden_food'`, use `2 * spawnThreshold`

**Double rival mutator:**
- Spawns a second rival snake. Each rival has independent AI + position.
- `updateRival()` called twice (once per rival).
- Both rivals compete for the same food.
- This is the most complex mutator to implement — see risk assessment.

### Edge Cases & Fragility Notes

- **Draft screen + daily mode:** Daily challenge should have its own predetermined mutator or none at all. Drafting before a daily run changes the board characteristics and invalidates fairness comparison. **Decision:** No draft in daily mode. Skip straight to `startGame()`.
- **Draft screen + Zen mode:** Mutators can work in Zen mode but some are weird (hunger clock in a mode where you can't die from collision → you CAN die from hunger). Allow it — it's the player's choice.
- **Draft screen + versus mode:** No draft for versus — two players agreeing on a mutator adds unwanted coordination overhead.
- **Mirror mutator + keydown handler:** The mirror is applied to `nextDirection` AFTER the keydown handler sets it. This means the keydown handler runs normally, but the direction is flipped. The player must consciously press Left to go Right. This is the intended behavior.
- **Gravity + upward direction:** Gravity pulls the snake down every tick where the player isn't actively pressing Up or Down. If the player is going horizontally (dx ≠ 0, dy = 0), gravity overrides to dy = TILE_SIZE (downward). If the player is going UP (dy = -TILE_SIZE), gravity does NOT override — the player is actively fighting gravity. This creates a "you can go up but it takes effort" feel.
- **Phase shift + self-collision flag:** The `skipSelfCollision` flag must be reset at the end of each tick. If it leaks to the next tick, the snake becomes immortal. Critical: `let skipSelfCollision = false;` at the top of `updateGame()`, not a persistent global.
- **Hunger clock + snake starting length:** Starting length is 1 (single head). If the first hunger tick (tick 50) fires, the snake dies immediately. Fix: start hunger clock only after the first food is eaten, or start at length 3.
- **Double rival + `generateFood()` board-full guard:** AGENTS.md documents the two-source rival counting bug. Adding a second rival doubles the problem. The fix recommended in AGENTS.md (pass complete `currentSnake` to `generateFood()`) must be implemented first, AND the second rival's segments must also be included.
- **Shrink zone + canvas dimensions:** Shrinking the board requires modifying the playable area. This is the most invasive mutator. Simplest approach: track `shrinkRows` and `shrinkCols` (start at 0, increment every 30s). The snake dies if it enters a shrunk row/col (treated like a wall). Shrunk tiles render as a solid black border. Effectively, this mode adds dynamic walls.
- **Draft RNG should NOT be seeded:** Draft options come from `Math.random()`, not `seededRandom()`. Two players racing the same seed should face different mutator choices — the seed determines the board, not the player's draft option. Otherwise, speedrunning becomes about memorizing which draft to pick rather than adapting.
- **Auto-unlock ordering:** When a player earns enough tokens for multiple mutators, which unlocks first? Define an explicit unlock order (by `tokenCost` ascending, then by key alphabetical). Or unlock all that are affordable. **Decision:** Unlock all affordable mutators at once, toasting each.
- **Mutator + ghost replay:** Ghost replays record direction inputs. If the player had a mutator active (e.g., mirror), the replay stores the MIRRORED direction, not the original keypress. On replay, the ghost reconstructs using stored directions. If the same mutator is active during replay, the mirror applies again — the ghost moves correctly. But if the mutator is different or absent, the ghost path is wrong. **Fix:** Store `activeMutator` in the replay object. When replaying, if `replay.mutator !== activeMutator`, show "Ghost disabled — different mutator."

### Implementation Complexity

| Component | Lines |
|---|---|
| `MUTATOR_DEFS` config | ~35 |
| Draft screen overlay rendering | ~50 |
| Draft selection logic (keys/touch) | ~30 |
| Gravity mutator logic | ~20 |
| Mirror mutator logic | ~10 |
| Phase shift mutator logic | ~10 |
| Hunger clock mutator logic | ~15 |
| Double rival mutator (2nd rival AI + state) | ~40 |
| Golden Age mutator (spawn rate + point mult) | ~10 |
| Shrink Zone mutator (board shrinking) | ~35 |
| Chaos Seed mutator (food type reshuffle) | ~15 |
| Token earning + auto-unlock | ~25 |
| Active mutator HUD badge | ~10 |
| Per-mutator visual effects | ~25 |
| Mutator persistence (save/load) | ~10 |
| Mutator + replay guard | ~10 |
| **Total** | **~350** |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Double rival mutator complexity | High | High | Consider deferring this mutator to v5.1; ship other 7 first |
| Mirror mutator feel-bad (frustrating, not fun) | Medium | Medium | Playtest; if bad, flip the concept: "mirror" = canvas flips visually, not controls |
| Shrink zone + existing wrap logic conflict | Medium | High | Shrunk tiles are treated as walls; `wrapPosition()` ignores them but `updateGame()` checks bounds with shrink offset |
| Hunger clock instant-death on first tick | Medium | High | Start hunger at tick 100 or after first food eaten |
| Auto-unlock feels unrewarding | Medium | Low | Consider manual unlock screen if tokens feel meaningless otherwise |
| Draft screen adds latency to game start | Low | Low | Draft is 3 cards, 5-second decision max. Skippable with Escape |
| Mutator interactions (gravity + phase shift combo) | Low | Medium | Test all 28 pairs; some may be degenerate — disallow certain combinations or flag as "chaos recommended" |

---

## Feature E: Rogue-Lite Gauntlet Mode

### Overview

A 5-wave mode where each wave is a self-contained snake round with a specific objective (survive for 15 seconds, eat 5 food, reach 3x combo, etc.). Between waves, the player picks one of 3 power-up-like modifiers: start with extra length, food spawns faster, shield at wave start, score multiplier, slow movement speed. Death in any wave ends the run. The run's total score is the sum of all wave scores. After wave 5, a "Gauntlet Complete" screen shows cumulative stats.

Each wave gets progressively harder: faster base speed, more obstacles, rival snake appears in wave 3+, etc. The between-wave picks are the strategic layer — do you pick the shield to survive a hard wave, or the score multiplier to bank points?

### Why It's Next-Level

This is the structural variety feature. All other modes are continuous (play until you die). Gauntlet breaks the game into discrete chunks with different pacing. The between-wave picks add strategic depth — you're building a loadout across the run, not just reacting. The wave objectives create varied micro-goals instead of the same "eat food, don't die" loop. This is the mode for players who want structure and progression within a single run.

### Dependencies on Existing Systems

- **`MODE_CONFIG`** — new "gauntlet" entry
- **`gameState`** — new sub-state `gauntlet_intermission` for between-wave screen
- **`updateGame()`** — wave-specific objectives checked each tick
- **`resetGame()`** — partial reset between waves (keep modifiers, reset snake position and food)
- **`drawOverlay()`** — new gauntlet intermission and wave-complete overlays
- **`startGame()`** — gauntlet mode entry sets up wave 1
- **Combo system** — some waves are combo-focused
- **Obstacle system** — progressive obstacle spawning across waves
- **Power-up system** — some intermission picks grant power-ups at wave start
- **Achievement system** — gauntlet-specific achievements for completing waves

### Data Model

```js
// MODE_CONFIG addition
gauntlet: {
    name: 'Gauntlet', speed: 'dynamic', selfCollision: true, wallDeath: false, wrap: true,
    timer: null, scoreIs: 'points', earnXP: true, achievementsEnabled: true
},

const GAUNTLET_WAVES = [
    {
        wave: 1, objective: 'survive', duration: 900, // 900 ticks ≈ 15 seconds at 60fps/60ms
        speedBase: 120, obstacles: 0, rival: false, desc: 'Survive 15 seconds'
    },
    {
        wave: 2, objective: 'eat', target: 5,
        speedBase: 110, obstacles: 4, rival: false, desc: 'Eat 5 food'
    },
    {
        wave: 3, objective: 'combo', target: 3,
        speedBase: 100, obstacles: 6, rival: true, desc: 'Reach 3× combo'
    },
    {
        wave: 4, objective: 'survive', duration: 600,
        speedBase: 90, obstacles: 8, rival: true, desc: 'Survive 10 seconds (fast!)'
    },
    {
        wave: 5, objective: 'score', target: 150,
        speedBase: 85, obstacles: 10, rival: true, desc: 'Score 150 points'
    },
];

const GAUNTLET_PICKS = [
    { id: 'extra_length', name: 'Extra Length', icon: '📏', desc: 'Start the next wave with 5 extra segments', stackable: true },
    { id: 'food_rush', name: 'Food Rush', icon: '🍎', desc: 'Food spawns 50% faster next wave', stackable: true },
    { id: 'wave_shield', name: 'Wave Shield', icon: '🛡️', desc: 'Start next wave with a 6-second shield', stackable: false },
    { id: 'score_boost', name: 'Score Boost', icon: '⭐', desc: '+50% score next wave', stackable: true },
    { id: 'slow_pace', name: 'Slow Pace', icon: '🐌', desc: 'Snake moves 20% slower next wave', stackable: false },
    { id: 'combo_save', name: 'Combo Keep', icon: '🔥', desc: 'Combo doesn\'t reset between waves', stackable: false },
];

// Gauntlet state
let gauntletWave = 0;       // 0-indexed current wave (0-4)
let gauntletScore = 0;      // cumulative score across waves
let gauntletPicks = [];      // picked modifiers for current wave
let gauntletObjective = null;// current objective tracker
let gauntletIntermission = false;
let gauntletSelection = 0;  // highlighted pick during intermission
let gauntletPickOptions = []; // 3 random picks shown during intermission
```

### Rendering Details

**Wave objective HUD** (during gauntlet gameplay, top-center):
- Show current wave number and objective: "Wave 3/5: Reach 3× combo"
- Progress bar for quantifiable objectives (eat 5 → 2/5 shown as partial bar)
- Timer for survive objectives (countdown bar)

**Wave complete overlay** (brief, 1.5 seconds):
- "Wave 1 Complete!" text with wave score
- Auto-transitions to intermission

**Intermission screen** (between waves):
- Dark overlay (`rgba(0,0,0,0.85)`)
- Title: "Wave 2 — Choose your bonus"
- 3 cards showing pick options (name, icon, description)
- ArrowLeft/Right to highlight; Enter to select
- Touch: tap card to select
- After selection, 1-second countdown "Next wave in 3... 2... 1..." then auto-start

**Gauntlet Complete screen** (after wave 5):
- "Gauntlet Complete!" with total score
- Per-wave breakdown: "Wave 1: 45 pts | Wave 2: 80 pts | ..."
- Total cumulative picks used
- "Play Again" and "Menu" buttons

**Active picks indicator** (during wave, small area below mutator badge):
- Show icons of active picks for this wave: "📏⭐" (Extra Length + Score Boost)

### User Interaction

**During waves:** Standard snake controls. No new inputs.

**During intermission:**
- ArrowLeft/ArrowRight or A/D: navigate between 3 pick cards
- Enter: confirm selection
- Escape: skip pick (play next wave without bonus — strategic sacrifice to save time)

**Gauntlet complete:**
- Enter: play again (restart gauntlet)
- Escape: return to menu

**Between-wave flow:**
1. Wave objective met → `gauntletIntermission = true`, `gameState` still 'playing' but paused
2. Show wave-complete flash (1.5s)
3. Show intermission screen with 3 random picks
4. Player selects a pick or escapes to skip
5. Selected pick added to `gauntletPicks` array
6. `gauntletWave++`
7. Partial reset: clear snake, food, obstacles, power-ups, combo (unless combo_save is active)
8. Set up new wave's speed, obstacles, rival, objective
9. Apply picks (extra_length → add 5 segments before first move; food_rush → halve spawn timer; etc.)
10. Resume game loop

### Integration Points

**State machine extension:**
- `gameState` remains `'playing'` during intermission — the game loop is paused via game-tick gating
- New flag: `gauntletIntermission = true` — checked in `updateGame()`: if true, skip game-tick logic
- `animateVisuals()` still runs (intermission screen is rendered in the rAF loop)

**`updateGame()` gauntlet hooks:**
```js
if (gameMode === 'gauntlet') {
    if (gauntletIntermission) return; // paused for intermission

    // Check wave objective
    const wave = GAUNTLET_WAVES[gauntletWave];
    if (wave.objective === 'survive' && gameTick >= wave.duration) {
        completeWave();
    } else if (wave.objective === 'eat' && gauntletObjective.eaten >= wave.target) {
        completeWave();
    } else if (wave.objective === 'combo' && comboMultiplier >= wave.target) {
        completeWave();
    } else if (wave.objective === 'score' && score >= wave.target) {
        completeWave();
    }
}

function completeWave() {
    gauntletScore += score;
    if (gauntletWave >= GAUNTLET_WAVES.length - 1) {
        // All waves complete
        gameOver(); // triggers gauntlet-complete screen
    } else {
        gauntletIntermission = true;
        gauntletPickOptions = pickRandomGauntletPicks(3);
        gauntletSelection = 0;
    }
}
```

**`startGame()` gauntlet entry:**
- `gauntletWave = 0`
- `gauntletScore = 0`
- `gauntletPicks = []`
- Apply wave 1 config: speed, obstacles, rival

**Between-wave reset (`startNextWave()`):**
- Save current wave score → `gauntletScore`
- `resetGame()` but preserve: `gauntletWave`, `gauntletScore`, `gauntletPicks`
- Apply next wave config from `GAUNTLET_WAVES[gauntletWave]`
- Apply active picks (extra_length, food_rush, etc.)
- Place initial obstacles for wave
- Resume game loop

**Achievements:**
- `GAUNTLET_5`: "Five Alive" — Complete all 5 waves. XP: 500
- `GAUNTLET_FLAWLESS`: "Flawless Run" — Complete gauntlet without shield. XP: 400
- `GAUNTLET_SPEED`: "Speed Runner" — Complete gauntlet in under 3 minutes. XP: 300

### Edge Cases & Fragility Notes

- **Death during a wave:** Standard death → `gameOver()` fires. Gauntlet mode: show "Run Over — Wave 3/5" screen. `gauntletScore` still records the cumulative score up to death. No revival mechanic — that's what the intermission picks are for.
- **Wave objective already met on wave start (extra length causes eat objective to be pre-met):** Not possible — the eat objective counts food eaten during the wave, not total length. Start with extra length but eat counter = 0.
- **Combo objective + combo_save pick:** If combo_save is picked and the player's combo at wave end was 4×, they start the next wave at 4×. If the next wave's objective is "reach 3× combo", it's instantly complete. This is a valid strategy — the player earned it by picking combo_save.
- **Score objective across picks:** Score is per-wave (reset between waves). Score boost pick modifies the current wave's score. Gauntlet cumulative score = sum of per-wave scores.
- **Survive objective + shield:** Shield during a survive wave is very strong. This is intentional — the intermission pick is the strategic choice.
- **Intermission keydown leak:** During `gauntletIntermission`, arrow keys should navigate the intermission, not set snake direction. The keydown handler must check `gauntletIntermission` before routing to `setNextDirection()`.
- **Intermission + pause:** Player should be able to pause during intermission (P key / Escape). Pause overlay stacks on intermission overlay. Or: intermission IS effectively paused — adding explicit pause is redundant. Allow P to pause (shows standard pause menu), and Escape during intermission means "skip pick" not "quit to menu." Differentiate: Escape with `pauseConfirmPending` → cancel confirm; Escape without → skip pick.
- **Double rival + gauntlet:** The double rival mutator (Feature D) combined with gauntlet's wave 3+ rival would create 2-3 rivals simultaneously. If both features are active, limit total rivals to 2. This cross-feature interaction must be documented.
- **Seeded gauntlet:** A seeded gauntlet run produces the same wave objectives (hardcoded) AND same food/obstacle positions (from seed). The intermission picks use `Math.random()` (not seeded) — same pattern as mutator draft.
- **Wave duration in ticks vs. real-time:** The survive objective uses `duration` in game ticks. At `speedBase: 120`ms per tick, 900 ticks = 108 seconds. At `speedBase: 90`ms per tick, 600 ticks = 54 seconds. The wave speed determines real-time duration. This is correct — faster waves are shorter survival challenges.
- **`resetGame()` between waves must NOT reset `gameMode`:** The existing `resetGame()` resets snake, food, score, etc. but must not change `gameMode`. Verify: current `resetGame()` does not change `gameMode`. It's set by `startGame()` and stays constant.
- **Ghost replay + gauntlet:** Ghost replay with gauntlet is complex — the ghost would need to record which wave it was on. Decision: disable ghost replay in gauntlet mode. The mode is too structurally different for meaningful ghost comparison.

### Implementation Complexity

| Component | Lines |
|---|---|
| `MODE_CONFIG.gauntlet` + `GAUNTLET_WAVES` + `GAUNTLET_PICKS` | ~50 |
| `gauntletWave` state management | ~15 |
| Wave objective checking in `updateGame()` | ~35 |
| `completeWave()` + `startNextWave()` | ~40 |
| Intermission screen rendering | ~50 |
| Intermission keydown/touch handling | ~25 |
| Wave objective HUD (progress bar, timer) | ~30 |
| Wave-complete flash overlay | ~15 |
| Gauntlet-complete screen | ~30 |
| Between-wave reset logic | ~25 |
| Pick application logic | ~20 |
| 3 new achievements | ~15 |
| Gauntlet mode in mode selector | ~5 |
| Keydown handler gauntlet guard | ~10 |
| **Total** | **~365** |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Intermission state machine collision with pause | Medium | High | Explicit `gauntletIntermission` flag; keydown handler priority: pause > intermission > direction |
| Wave objective bugs (wrong counter, off-by-one) | Medium | Medium | Unit-testable: each objective type has clear start/end conditions |
| Between-wave reset leaks state | Medium | High | Careful partial reset: explicit list of what IS reset vs. preserved |
| Survive objectives are boring | Low | Low | Add environmental challenge: obstacles spawn during survive waves |
| 5 fixed waves get stale after a few runs | Medium | Low | Consider randomized wave order in v5.1; current 5 provide good variety |
| Gauntlet + mutator interaction (too many modifiers) | Low | Medium | If both features active, mutator applies to all waves — powerful but fair |

---

## Prioritized Roadmap

### Recommended Build Order

| Order | Feature | Rationale |
|---|---|---|
| **1** | **B: Canvas Painter Mode** | Lowest complexity (160 LOC), highest visual spectacle, fewest integration points. Produces a "wow" demo early. Independent of all other features. |
| **2** | **C: Procedural Soundscape** | Medium complexity (210 LOC), builds entirely on existing `playSound()` + `audioCtx`. No state machine changes. Independent of other features. |
| **3** | **A: Challenge URL Deep-Linking** | Medium complexity (175 LOC), builds on seed system (already done). Enables the social/viral loop. Ghost Arena is an extension of existing ghost system. |
| **4** | **E: Rogue-Lite Gauntlet Mode** | Highest complexity (365 LOC), adds new state machine states. Requires careful intermission + pause interaction. Built on well-understood patterns (objectives, modifiers). |
| **5** | **D: Mutator Draft System** | Highest complexity (350 LOC), touches the most internal systems (`updateGame()` is modified for 8 different mutators). Double rival is the riskiest single mutator. Build last so the codebase is stable before this invasive feature. |

### Why This Order

1. **Painter and Synesthesia first** — both are self-contained with minimal blast radius. They deliver immediate visual/sensory impact and build confidence. Painter is the simpler of the two, and it shares the mode infrastructure Gauntlet will later use.

2. **Challenge URL third** — enables the viral loop. The game now has shareable seeded runs (already done), paint mode (visual spectacle), and synesthesia (sensory hook) — all three produce compelling challenge URLs. Building the URL system when there's maximal content to share maximizes its impact.

3. **Gauntlet before Mutators** — Gauntlet introduces the intermission screen pattern (pick-from-3-cards) that Mutators also uses. Building Gauntlet first means the card-selection UI is battle-tested before being replicated in the draft system. Also, Gauntlet's between-wave modifiers are simpler than Mutators' persistent rule changes.

4. **Mutators last** — the most invasive feature. It touches `updateGame()` in 8 different ways, requires the draft screen (similar to gauntlet intermission), and has the riskiest individual mutator (double rival). By building it last, all other features are stable and the codebase is well-understood.

### Total Estimated Effort

| Feature | Lines |
|---|---|
| B: Canvas Painter | ~160 |
| C: Procedural Soundscape | ~210 |
| A: Challenge URL + Ghost Arena | ~175 |
| E: Rogue-Lite Gauntlet | ~365 |
| D: Mutator Draft System | ~350 |
| **Total** | **~1,260** |

Estimated codebase growth: 3,913 → ~5,173 lines. Still within single-file feasibility but approaching the upper bound. After v5, consider a build-step extraction for v6.

### Cross-Feature Interactions

| Interaction | Resolution |
|---|---|
| Painter + Synesthesia | Food-tier colors map to both paint colors AND musical notes. The visual and audio reinforce each other perfectly. No conflict. |
| Painter + Challenge URL | Painted boards produce shareable screenshots. The `% coverage` metric is a natural target score for challenge URLs. |
| Gauntlet + Mutators | A mutator can be drafted before a gauntlet run. The mutator applies to ALL waves. Some combos are degenerate (gravity + survive wave = impossible). Consider mutator-specific gauntlet wave adjustments in v5.1. |
| Gauntlet + Challenge URL | Gauntlet challenge URLs encode mode=gauntlet+seed. Same seed = same wave food/obstacles. Intermission picks use unseeded RNG. |
| Synesthesia + Mutators | Phase shift's transparency visual + synesthesia's audio work independently. No conflict. |
| Painter + Ghost Arena | Ghost replay in painter mode: ghost also paints (but its paint is invisible — ghost is semi-transparent). Decision: ghost's paint is NOT drawn (only the ghost snake body renders). Otherwise two paint layers conflict visually. |
| Double Rival + Gauntlet | Gauntlet already has rival in waves 3+. Double rival mutator adds a 2nd rival in those waves. Total = 2 rivals in waves 3-5, 1 rival in waves 1-2. Reasonable. |
| Shrink Zone + Painter | Board shrinking + paint coverage: shrunk tiles can't be painted AND un-shrink previously painted tiles. This creates a shrinking canvas effect. Intended — it's chaotic and fun. |
| Canvas Painter + `generateFood()` board-full check | Painter mode has long snakes (no tail removal). The board-full guard in `generateFood()` must account for long snakes. Current guard checks `currentSnake.length`. In painter, snake length = tick count (every tick, the body grows by 1 since nothing is removed). The guard works correctly — it correctly detects when the snake fills the board. |

### Features Considered But Deferred

| Idea | Why Deferred |
|---|---|
| Ghost replay download/share (base64) | v4 review suggested this. Good idea but low priority vs. challenge URLs, which make sharing instant. Revisit in v5.1. |
| Versus mode best-of-N | v4 review deferred. Still deferred — versus mode is v4 scope, v5 focuses on single-player depth. |
| Paint map save to localStorage | 400+ entries per run = too much storage churn. If players want to save, `canvas.toDataURL()` download is better. |
| Mutator manual unlock screen | Auto-unlock is simpler. If players want control, add a "Mutators" tab to the cosmetics panel in v5.1. |
| Gauntlet randomized wave order | 5 fixed waves are learnable and speedrunnable. Random order adds replayability but reduces mastery. v5.1 consideration. |
| Synesthesia + visual ring pulses | Core synesthesia is audio-only. Visual ring pulses are a stretch goal — add in v5.1 if audio-only feels insufficient. |

---

## Summary

v5 pushes the game from "polished browser game" to "platform + art piece + speedrunning ecosystem." The five features cover every dimension:

- **Social** (Challenge URLs make every run a competition)
- **Visual** (Painter mode turns gameplay into art)
- **Sensory** (Synesthesia makes every run a song)
- **Replayability** (Mutators create 48+ game variants per seed)
- **Structure** (Gauntlet gives strategic depth to single runs)

All built within the single HTML file, building on the seeded runs + ghost replay + progression infrastructure from v4. No server, no build step, no external dependencies. The snake eats, the world watches, the canvas sings.