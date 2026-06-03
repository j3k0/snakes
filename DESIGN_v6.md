# Snake Game — v6 Design Plan

## Vision

v5 gave us painter mode, synesthesia, challenge URLs, gauntlet, and mutators. The game has visual spectacle, sensory immersion, and infinite replayability. v6 goes deeper: **metagame strategy, emergent synergy, personal history, polished feel, and universal accessibility** — still in the single HTML file.

Six features were selected from a cross-agent brainstorm for maximum impact across different dimensions:

| Dimension | Feature |
|---|---|
| Metagame Strategy | A: Brews System (Pre-Run Loadout) |
| Emergent Synergy | B: Cascade Mutator Storm (Resonances) |
| Personal History | C: Snake Diary (Automatic Run Journal) |
| Game Feel | D: Score Pop-Up Floaters & Juice |
| Universal Access | E: Screen Reader Support |
| Visual Polish | F: Responsive Canvas Sizing |

---

## Feature A: Brews System (Pre-Run Loadout)

### Overview

A persistent loadout system accessible from the idle screen (new "Brews" panel button). The player equips up to 2 Brews before any run. Brews are passive modifiers earned by reaching XP level milestones — separate from the mutator economy. Once unlocked, a Brew is always available. Brews persist across runs until changed.

### Why It's Next-Level

Brews let the player define their play style. Vampire + Leech = survival tank. Rampage + Combustion = aggressive risk. This creates theorycrafting — the player thinks about runs before they start. Brews interact with mutators: Phantom Brew + Phase Shift mutator means phasing through your own ghost trail but still getting the combo bonus.

### Data Model

```js
const BREWS_CONFIG = [
  { id: 'vampire',   name: 'Vampire Brew',   desc: 'Survive first death at length 3',                        unlockLevel: 5 },
  { id: 'rampage',   name: 'Rampage Brew',   desc: 'Each food eaten spawns next 2 tiles closer (min 3)',      unlockLevel: 8 },
  { id: 'phantom',   name: 'Phantom Brew',   desc: 'Intersect own ghost trail → +0.5x combo for 3s',          unlockLevel: 12 },
  { id: 'leech',     name: 'Leech Brew',     desc: 'Head-to-head with rival → steal 3 segments',              unlockLevel: 15 },
  { id: 'combustion',name: 'Combustion Brew', desc: 'Combo milestones add +1 point multiplier to next food',   unlockLevel: 18 },
  { id: 'echo',      name: 'Echo Brew',      desc: 'Every 8th food spawns a copy at adjacent tile (half pts)', unlockLevel: -1 }, // prestige 1
  { id: 'phoenix',   name: 'Phoenix Brew',   desc: 'Resurrect once per run with length 5, score → 0',         unlockLevel: -2 }, // prestige 3
];

// Persisted
let equippedBrews = []; // max 2
let unlockedBrews = []; // ids of unlocked brews
```

### Brew Details

| Brew | Effect | Trigger Point | Lines |
|---|---|---|---|
| **Vampire** | First death in run: survive with length 3 instead of dying. Flags `vampireSaved = true`. One-time per run. | `checkDeathConditions()` | ~8 |
| **Rampage** | After eating food, force `nextFoodDistance = min(current, 3)`. Affects `spawnFood()` positioning logic. | `onFoodEaten()` | ~5 |
| **Phantom** | If last run's ghost data exists, check player head against ghost segments each tick. On overlap, boost combo counter and set a 3s timer. | `updateGame()` each tick | ~10 |
| **Leech** | On head-to-head tile adjacency with rival head, rival loses 3 segments, player gains 3. Rival respawns if length ≤ 0. | `updateRivalCollisions()` | ~12 |
| **Combustion** | On combo milestone (3, 5, 10, 20, 50), increment `nextFoodMultiplier`. Next food eaten adds `nextFoodMultiplier * tier.points` extra. | `checkComboMilestone()` | ~8 |
| **Echo** | Counter mod 8 check in `onFoodEaten()`. If true, spawn a food of same tier at a random adjacent tile with `score *= 0.5`. | `onFoodEaten()` | ~10 |
| **Phoenix** | On death, if `phoenixUsed === false`, set it, teleport to nearest unoccupied tile, set length to 5, score to 0, reset combo counter. | `checkDeathConditions()` (before game-over) | ~15 |

### Dependencies & Integration Points

- **XP/Level system** (`playerLevel`, `levelUp()`) — Brew unlock level equates to `playerLevel >= unlockLevel`
- **Save manager** (`saveManager.set/get`) — Stores `equippedBrews` and `unlockedBrews` arrays
- **Idle screen** — New "Brews" button (reuses cosmetics panel pattern)
- **`startGame()`** — Reads `equippedBrews` and sets `activeBrews` for the run
- **`checkDeathConditions()`** — Vampire and Phoenix intercept death
- **`onFoodEaten()`** — Rampage, Combustion, Echo hook in
- **`updateGame()`** each tick — Phantom overlap check
- **`updateRivalCollisions()`** — Leech hook

### UI

- **Brews panel** (idle screen): grid of brew cards showing unlock status, effect description, equipped checkboxes (max 2). Locked brews show unlock level requirement.
- **HUD**: Small brew icons (2 max) below the mutator badge during gameplay. Show a glow when effect triggers.
- **Equip confirmation**: Tapping a 3rd brew deselects the first. Visual feedback when max reached.

### Rendering

- Brew panel reuses cosmetic panel overlay pattern (dark bg, centered grid, close button)
- HUD icons: 16x16 colored circles with a letter abbreviation (V, R, P, L, C, E, Ph)

### Risk Assessment

- Vampire + Phoenix together = 2 lives per run. Intentional — this is the "survival build."
- Echo in Painter mode: duplicated food doubles coverage speed. Intentional — synergy between systems.
- Phantom requires ghost data to exist. Graceful fallback: if no ghost data, show "No ghost data" in the phantom brew tooltip and don't equip.

### Implementation Complexity Estimate

- Brews config: ~30 lines
- Brews panel UI: ~60 lines
- Brew effect hooks: ~60 lines total (split across 5 functions)
- HUD rendering: ~15 lines
- Persistence: ~10 lines
- **Total: ~175 lines**

---

## Feature B: Cascade Mutator Storm (Resonances)

### Overview

An extension of v5's mutator system. Cascade Mode lets the player activate **up to 3 mutators simultaneously** — each additional mutator beyond the first applies a score multiplier penalty. The core innovation: **mutator pairs create resonance effects** — emergent behaviors not possible with either alone.

### Why It's Next-Level

Discovery loop. Players try random pairs to see if anything happens. Resonances are hidden until both mutators are active — creating a "there's something here" feel. The score penalty means combos must be strategically worth the 2-4x score reduction.

### Data Model

```js
// Extended from v5 single mutator
let activeMutators = []; // was: activeMutator (string)
const MAX_CASCADE_MUTATORS = 3;

// Score multiplier per count
function getCascadeMultiplier(count) {
  return count === 1 ? 1.0 : count === 2 ? 0.5 : 0.25;
}

// Resonance pairs
const RESONANCES = {
  'gravity~mirror': {
    name: 'Quantum',
    desc: 'Direction controls invert randomly every 10-15 ticks. Screen flashes briefly.',
    effect: 'invertControls'
  },
  'phase_shift~hunger_clock': {
    name: 'Ethereal',
    desc: 'During phase-shift ticks, hunger pauses and snake body becomes intangible.',
    effect: 'intangiblePhase'
  },
  'golden_food~chaos_seed': {
    name: 'Chaos Gold',
    desc: 'Food reshuffles every 20 ticks but ALL food gives 2x points and 2x XP.',
    effect: 'doubleGold'
  },
  'shrink_zone~double_rival': {
    name: 'Pressure Cooker',
    desc: 'Rivals also trigger board shrinking. Red glow pulses from shrink boundary.',
    effect: 'rivalShrink'
  },
  'hunger_clock~golden_food': {
    name: 'Famine Feast',
    desc: 'Food gives 4x points but hunger ticks every 30 ticks instead of 50.',
    effect: 'feastFamine'
  },
  'mirror~chaos_seed': {
    name: 'Schrodinger',
    desc: 'Every 15 ticks: mirror toggles OR food reshuffles (random). Semi-predictable.',
    effect: 'quantumToggle'
  },
  // 3-mutator resonances (require 3 specific mutators)
  'gravity~mirror~phase_shift': {
    name: 'Chaos Theory',
    desc: 'All three effects cycle every 5 ticks in sequence. Pure entropy.',
    effect: 'chaosCycle'
  },
  'golden_food~hunger_clock~shrink_zone': {
    name: 'Apocalypse',
    desc: 'Shrink zone accelerates every time hunger ticks. Game ends fast.',
    effect: 'rapidDoom'
  },
};
```

### Resonance Effects (Implementation)

| Resonance | Implementation |
|---|---|
| **Quantum** | Every 10-15 ticks (random in range), flip `dxNegated` and `dyNegated` flags. Apply in input consumption. Flash screen via `flashOverlay` for 1 tick. |
| **Ethereal** | In `updateGame()`, if tick % 5 === 0 (phase shift tick), skip hunger decrement. Set `snakeIntangible = true` during phase ticks — rivals and obstacles pass through. |
| **Chaos Gold** | `spawnFood()` every 20 ticks reshuffles food type weights (same as chaos_seed). `onFoodEaten()` multiplies score and XP by 2. |
| **Pressure Cooker** | When ANY rival eats food, call `shrinkBoard()` (same function the player's shrink zone calls). Red glow: add 10px red shadowBlur to shrink boundary lines. |
| **Feast Famine** | `onFoodEaten()` multiplies score by 4. Hunger counter max reduced from 50 to 30. |
| **Schrodinger** | Every 15 ticks: 50% chance toggle mirror on/off, 50% chance reshuffle food weights. |
| **Chaos Theory** | Cycle through gravity → mirror → phase_shift each 5 ticks. Only the cycled effect is active at any tick. |
| **Apocalypse** | Each hunger clock decrement also reduces shrink zone countdown by 2 extra ticks. |

### UI Changes

- **Draft screen** (v5): If unlocked, "Cascade Mode: ON/OFF" toggle at top. When ON, pick 3 mutators instead of 1.
- **Unlock**: Cascade toggle unlocks after earning 5 mutator tokens (one-time toast: "Cascade Mode Unlocked!").
- **Score multiplier** shown in the HUD during cascade runs: small "×0.25" badge near the score display.
- **Resonance notification**: When a resonance is detected at draft completion, show a brief toast: "Resonance: Quantum!" with the effect description.

### Persistence

- `resonancesDiscovered` — array of discovered resonance IDs (stored in saveManager). Used for a "Resonance Library" display in the mutator panel. Not required for the resonance to work — it works on discovery.

### Risk & Migration

- Refactoring `activeMutator` from string to array is the biggest touch point. All 15+ call sites that check `if (activeMutator === 'gravity')` become `if (activeMutators.includes('gravity'))`.
- Gauntlet mode picks — current code picks 1 mutator at gauntlet intermission. Must limit to 1 in gauntlet (no cascade there).
- Ghost replay guard: ghost data from cascaded runs must include the full `activeMutators` array. The existing v5 ghost format only stores `activeMutator` (string). Bump ghost version to 3.

### Implementation Complexity Estimate

- Refactor `activeMutator` → `activeMutators`: ~20 site touches, ~45 lines changed
- Cascade toggle & unlock: ~30 lines
- Draft screen cascade mode: ~30 lines
- Resonance detection: ~25 lines
- Resonance effects (8 functions): ~60 lines
- Score multiplier: ~5 lines
- Ghost format bump: ~10 lines
- **Total: ~180 lines changed/added**

---

## Feature C: Snake Diary (Automatic Run Journal)

### Overview

Every run is automatically logged. Browse, filter, and relive past runs. Add personal notes. This turns the game into a personal history book.

### Why It's Next-Level

The ghost system already captures full replay data. The Diary is a lighter-weight log that creates a sense of history. The monthly digest is a pleasant surprise that appears without asking. Notes turn sterile stats into personal memories.

### Data Model

```js
// Per-run entry (auto-saved on game over)
const diaryEntry = {
  id: Date.now(),           // unique
  date: '2026-06-03T14:30:00Z',
  mode: 'classic',
  score: 152,
  duration: 45,             // seconds
  foodEaten: 12,
  maxCombo: 5,
  level: 3,
  prestigeLevel: 0,
  deathCause: 'self_bite',  // wall, self_bite, rival, shrink_zone, hunger_clock, time_up, etc.
  seed: 'abc123',
  activeMutators: ['gravity'],
  equippedBrews: ['vampire'],
  note: '',                 // user-editable
  boardSnapshot: '',        // compact string encoding of final board state
};

// Stored in saveManager under 'snake_diary'
// Max 500 entries, auto-prune oldest
const MAX_DIARY_ENTRIES = 500;
```

### UI

- **Diary button** on idle screen: "Diary" between "Stats" and "Brews" on the bottom row.
- **Timeline view**: scrollable list of entries, newest first. Each entry shows:
  - Mode icon + mode name
  - Score (prominent)
  - Duration (formatted: "0:45")
  - Death cause (icon + text)
  - Date (relative: "2 hours ago", "Yesterday", "Jun 1")
  - Note indicator (small pen icon if note exists)
- **Entry detail view**: tap any entry to expand:
  - Full stats grid (score, food, combo, level, prestige, seed)
  - Mutators + Brews used
  - Death cause with icon
  - Note text (editable inline)
  - "Play Ghost" button (loads the linked ghost data if available)
  - "Delete Entry" (with confirmation)
- **Filter bar**: dropdowns for mode, date range, death cause. Text search across notes.
- **Monthly digest**: auto-generated when the calendar month changes. Shown as a special "📅 May 2026 Summary" entry at month start:
  - Total runs, total play time, most played mode, highest score, total food eaten
  - Presented as a decorated card with a different background color

### Board Snapshot Encoding

A compact string for freeze-frame rendering:

```
p5,3~4,5~6,2|r5,3~4,5|f12,7~2|s42
```

Where: `p` = player segments, `r` = rival(s), `f` = food positions+tier, `s` = score. Max ~80 chars per entry. Decoder reconstructs a visual mini-map.

### Persistence

- Stored under `saveManager` key `snake_diary`
- 500 entries × ~200 bytes average = ~100KB max
- Auto-prune: when adding a new entry, if length > MAX_DIARY_ENTRIES, splice from index 0 (oldest)

### Export

- Single button at bottom of diary: "Export Diary" → generates a compressed JSON string, copies to clipboard
- "Import Diary" → parses and merges (newer entries overwrite duplicates by id)

### Implementation Complexity Estimate

- Diary entry save (game over hook): ~15 lines
- Diary panel UI: ~120 lines
- Entry detail view: ~60 lines
- Monthly digest generation: ~30 lines
- Board snapshot encode/decode: ~30 lines
- Export/import: ~20 lines
- Filter bar: ~40 lines
- **Total: ~315 lines**

---

## Feature D: Score Pop-Up Floaters & Combo Juice

### Overview

Canvas-drawn floating text rises from the eat location showing point value + contextual label. Combo milestones get screen-center announcements. The game feels more responsive and juicy.

### Why It's Next-Level

When food is eaten, it currently disappears with a particle burst and a sound. Adding positional score text makes the feedback feel immediate and satisfying. It's the cheapest way to add "juice" to the game.

### Data Model

```js
let floaters = [];

function spawnFloater(x, y, text, color, size = 16, duration = 1.0) {
  floaters.push({
    x, y,
    text,
    color,
    size,
    life: duration,       // seconds
    maxLife: duration,
    velocityY: -1.5,      // tiles per second
  });
}
```

### Rendering

Called from `animateVisuals()`:

```js
function drawFloaters(ctx) {
  for (const f of floaters) {
    const progress = 1 - f.life / f.maxLife;  // 0 → 1
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = `bold ${f.size}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = f.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = f.color;
    const floatY = f.y + progress * f.velocityY * 2;  // rise
    ctx.fillText(f.text, f.x * TILE_SIZE + TILE_SIZE / 2, floatY * TILE_SIZE);
    ctx.restore();
  }
}
```

### Trigger Points

- **Normal food eat**: spawn at food tile center `"+50"` in food tier color.
- **Speed food**: `"+5 SPEED!"` in yellow with larger font (20px).
- **Bonus food**: `"+30 BONUS!"` in gold with shadowBlur 12px.
- **Combo milestone (3x)**: screen-center large text `"COMBO x3!"` in cyan, scales 0.5→1.2→1.0 over 1s.
- **Combo milestone (5x, 10x, 20x, 50x)**: same but larger and different colors (green → purple).

### Density Limit

- Max 8 floaters on screen. If > 8, remove the oldest.
- On game-over, clear all floaters (prevent overlap with death particles).

### Implementation Complexity Estimate

- Floater struct + spawn function: ~15 lines
- `spawnFloater()` calls in `onFoodEaten()` and combo milestone: ~10 lines
- `drawFloaters()` in animate loop: ~15 lines
- Floaters state cleanup: ~5 lines
- **Total: ~45 lines**

---

## Feature E: Screen Reader Support

### Overview

A hidden ARIA live region announces game state, scores, events, and menu selections. Screen reader users can play and understand the game.

### Why It's Next-Level

Zero accessibility currently. Screen reader support opens the game to blind and low-vision players. It's the right thing to do and dramatically expands the audience.

### Implementation

**DOM addition** (in HTML `<body>`):

```html
<div id="srAnnounce" aria-live="polite" aria-atomic="true"
     style="position:absolute;width:1px;height:1px;overflow:hidden;
            clip:rect(0,0,0,0);white-space:nowrap;border:0;"></div>
```

**JavaScript helper**:

```js
function srSpeak(text) {
  const el = document.getElementById('srAnnounce');
  if (!el) return;
  // Debounce: max 1 announcement per 500ms
  const now = Date.now();
  if (now - lastSrSpeak < 500) {
    srQueue = text;  // overwrite queued message
    return;
  }
  lastSrSpeak = now;
  el.textContent = '';  // Clear-then-set pattern for VoiceOver
  setTimeout(() => { el.textContent = text; }, 50);
}

// Process queued announcements on interval
setInterval(() => {
  if (srQueue && Date.now() - lastSrSpeak >= 500) {
    const msg = srQueue;
    srQueue = '';
    srSpeak(msg);
  }
}, 500);
```

### Announcement Points

| Event | Message | Priority |
|---|---|---|
| Mode change | "Classic mode. Standard snake gameplay." | Always |
| Game start | "Game started. Score zero." | Always |
| Food eaten (combo ≤ 1) | "Ate [tier] food. Score [N]." | Always |
| Food eaten (combo > 1) | "Ate [tier] food. Combo [N]. Score [N]." | Always |
| Combo milestone | "Combo [N]!" | Milestones only (3,5,10,20,50) |
| Combo break | "Combo broken at [N]." | When combo > 2 |
| Power-up collect | "Collected [name] for [duration] seconds." | Always |
| Level up | "Level up! Level [N]. [unlock info]." | Always |
| Death | "Game over. Score [N]. [cause]." | Always |
| Pause | "Game paused." | Always |
| Resume | "Game resumed." | Always |
| Panel open | "[Panel] opened. [N] items." | Always |
| Challenge link | "Challenge loaded. [mode], target [score]." | Always |
| New achievement | "Achievement unlocked: [name]." | Always |

### Edge Cases

- Combo announcement throttling: only announce at milestones (3,5,10,20,50) + combo break. Not every increment.
- Quick mode switching: debounce mode announcement. If mode changes within 300ms, only announce the final selection.
- Panel navigation: use `aria-live="polite"` with clear-then-set. Don't announce internal keyboard navigation within a panel (too noisy).
- Game-over: announce score prominently. Don't interrupt with other announcements during the death animation sequence.

### Implementation Complexity Estimate

- HTML element: 1 line
- `srSpeak()` function: ~15 lines
- Debounce + queue: ~10 lines
- Announcement call sites (~15): ~30 lines
- **Total: ~56 lines**

---

## Feature F: Responsive Canvas Sizing

### Overview

Replace the hardcoded canvas CSS sizing with a dynamic function that fits the canvas to the viewport while maintaining the game's internal coordinate system.

### Why It's Next-Level

The canvas is currently 400x400 with `max-height: 70vh`, wasting space on large screens and cramping on notched phones. This is the single biggest visual polish issue.

### Implementation

```js
function resizeCanvas() {
  const canvas = document.getElementById('gameCanvas');
  const dpad = document.getElementById('dpad');
  const scoreBar = document.getElementById('score');
  
  // Available height: viewport minus score bar, dpad, and safe margins
  const scoreBarHeight = scoreBar ? scoreBar.offsetHeight : 0;
  const dpadHeight = dpad ? dpad.offsetHeight : 0;
  const margin = 16; // total vertical margin
  
  const availableHeight = window.innerHeight - scoreBarHeight - dpadHeight - margin;
  const availableWidth = window.innerWidth - 16; // horizontal margin
  
  // Square aspect ratio
  const size = Math.min(availableWidth, availableHeight, 600); // cap at 600px
  
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  
  // Canvas internal resolution stays unchanged
  // canvas.width and canvas.height remain at their grid values
}
```

### CSS Changes

```css
#gameCanvas {
  /* Remove hardcoded width/height */
  max-width: 100%;
  /* No more max-height: 70vh */
}

/* Safe area on notched phones */
@media (display-mode: standalone) {
  #dpad {
    padding-bottom: max(8px, env(safe-area-inset-bottom));
  }
}
```

### Integration

- Call `resizeCanvas()` on `window resize` and `orientationchange` events
- Call once on DOMContentLoaded
- Debounce resize handler (100ms) to avoid perf issues on rapid resize

### Edge Cases

- Very small screens (< 300px available): fall back to 300px minimum, enable a "compact HUD" mode that reduces font sizes.
- Very large screens (> 1200px): cap at 600px to prevent the board from being unreachable.
- Orientation change on mobile: re-trigger, handled by the resize listener.
- Zoom: `window.innerWidth`/`innerHeight` account for zoom. No special handling needed.

### Implementation Complexity Estimate

- `resizeCanvas()`: ~20 lines
- CSS changes: ~10 lines
- Event binding + debounce: ~10 lines
- Compact HUD mode: ~15 lines
- **Total: ~55 lines**

---

## Cross-Cutting Concerns

### Persistence (saveManager)

| Key | Type | Purpose |
|---|---|---|
| `snake_unlocked_brews` | string[] | Brew IDs the player has earned |
| `snake_equipped_brews` | string[] | Currently equipped brew IDs (max 2) |
| `snake_cascade_unlocked` | boolean | Whether cascade mode is unlocked |
| `snake_resonances_discovered` | string[] | Resonance IDs the player has found |
| `snake_diary` | DiaryEntry[] | Auto-logged run entries (max 500) |
| `snake_mutator_tokens_earned` | number | Count for cascade unlock check |

### Ghost Replay Format (Bump to v3)

v2 ghost format (current):
```js
{ version: 2, mode, seed, mutator: 'gravity', events: [...], score, ... }
```

v3 ghost format:
```js
{ version: 3, mode, seed, mutators: ['gravity'], brews: ['vampire'], events: [...], score, ... }
```

Key changes:
- `mutator` (string) → `mutators` (array of strings)
- `brews` (new field, array of strings)
- Backward compatible: v2 ghosts still load, v3 ghosts with single mutator display normally
- Ghost replay guard (`shouldShowGhost`) checks `mutators` instead of `mutator`

### Touch Controls

- No changes needed for Brews/Cascade (they're pre-run UI)
- Diary panel uses standard list UI — touch compatible
- Floaters are canvas-only, no DOM interaction
- Screen reader: no touch changes
- Responsive sizing: improves touch target accuracy on larger canvases

### Test Plan

- Brews: each brew has a unit test in `test-bugfixes.mjs` verifying the effect triggers and doesn't crash
- Cascade: verify that 3-mutator draft works, resonance effects apply, score multiplier is correct
- Diary: verify save/load, auto-prune, monthly digest generation
- Floaters: verify render + cleanup on game-over
- Screen reader: verify DOM element exists and `srSpeak()` fires on key events (manual verification)
- Responsive sizing: verify canvas scales and game coordinates are unaffected

---

## Implementation Order

1. **Feature D (Floaters)** — Lowest risk, most visible juice. Quick win.
2. **Feature E (Screen Reader)** — Foundation for accessibility. Mostly additive.
3. **Feature A (Brews)** — New panel + hooks. Well-scoped.
4. **Feature B (Cascade)** — Refactoring touchpoint + new effects. Depends on understanding mutator system fully.
5. **Feature C (Diary)** — Largest feature. Needs save/load, UI, table rendering, monthly digest.
6. **Feature F (Responsive Sizing)** — CSS + resize handler. Can be done last to ensure everything else works at the new size.

All six features are designed to be **independent** — they can be implemented in any order and don't block each other. The only shared dependency is the save manager (each feature adds its own keys).