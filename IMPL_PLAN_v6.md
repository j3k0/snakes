# Snake Game — v6 Implementation Plan

## 1. Synthesis of Review Feedback

Two independent reviews of DESIGN_v6 identified the following critical issues that reshape the plan:

**Code reference errors (found by feasibility review):**
- `checkDeathConditions()`, `onFoodEaten()`, `checkComboMilestone()`, `updateRivalCollisions()` do NOT exist as standalone functions — they are inline blocks inside `updateGame()`. Brew hooks must extract these into callable functions first.
- `REPLAY_VERSION` is 1, not 2. The ghost format bump is v1 → v2, not v2 → v3.
- The existing ghost replay only stores `mutator` (string), not a full `mutators` array. Migration is required.

**Scope corrections:**
- `activeMutator` → `activeMutators` refactor touches ~20 call sites, not ~15 (45 lines → ~90 lines).
- Diary is underestimated (315 → ~400-500 lines). Trimmed to core: no board snapshots, no export/import, no monthly digest in first pass.
- Cascade resonance effects (8 functions at 7.5 lines each) is too optimistic; each needs 10-15 lines.

**UX corrections:**
- Brew unlock via XP levels conflicts with 6+ existing gating systems. Gated by mutator tokens instead.
- Diary panel should be a DOM panel (like existing achievements/cosmetics panels), not canvas-drawn.
- Phantom Brew trigger changed to "ghost path crossing" (any tile the ghost ever occupied).
- 3-mutator score penalty changed from 0.25x to 0.5x.
- Resonance names need descriptive HUD presence, not just a one-time toast.
- Vampire + Phoenix: make them mutually exclusive (equipping one unequips the other).
- SRAnnounce div must be added statically to HTML, not created in JS.

**Deferrals from scope:**
- Diary board snapshot encoding (Feature C)
- Diary export/import (Feature C)
- Diary monthly digest (Feature C)
- Touch-target buttons for idle screen panels (too many DOM changes; mobile users can use keyboard tray)

---

## 2. Implementation Order

0. **Feature 0 (Extract game-loop functions)** — Prerequisite for Floaters, Brews, and Cascade. ~40 lines.
1. **Feature D (Floaters)** — Lowest risk, highest juice-per-line. ~50 lines.
2. **Feature E (Screen Reader)** — Foundation for accessibility. ~60 lines.
4. **Feature A (Brews)** — New panel + hooks. ~220 lines.
5. **Feature B (Cascade)** — Refactoring + resonances. ~320 lines.
6. **Feature C (Diary, trimmed)** — Core save/load + simple list. ~250 lines.
7. **Feature F (Responsive Sizing)** — CSS + resize handler. ~60 lines.

**Total: ~1,000 lines added.** (Previously estimated at 826, adjusted up after review corrections.)

---

## 3. Feature Implementation Details

### Feature 0: Extract Game-Loop Functions (Prerequisite for Brews)

#### Why Separate
Brew hooks reference functions that currently exist as inline code inside `updateGame()`. Without extraction, Brew logic would have to be inlined too — doubling code in the already-500-line `updateGame()`. These extractions are zero-functional-change refactors.

#### Extractions

**A. `checkPlayerDeath(wrappedHead, skipSelfCollision)` — extract from lines ~3731-3782**

`skipSelfCollision` is a local var in `updateGame()` (line 3617) — must be passed as parameter. The function is defined inside `updateGame()` to close over skipSelfCollision, OR it's standalone with an explicit parameter. We use a nested function declared inside `updateGame` via a `var checkPlayerDeath = function(wrappedHead) { ... }` declaration at the top of updateGame.

```js
function checkPlayerDeath(wrappedHead, skipSelfCollision) {
    if (shieldActive) {
      shieldActive = false; powerUpTimer = 0; powerUpType = null;
      stats.shieldBlocks++;
      spawnParticles(wrappedHead.x, wrappedHead.y, 15, '#4488FF');
      playSound('bonus');
      return false; // survived
    }
    lastDeathCause = 'You ran into yourself!';
    return true; // dead
  }
  
  // Wall death (line 3747)
  if (MODE_CONFIG[gameMode].wallDeath) {
    if (wrappedHead.x < 0 || wrappedHead.x >= CANVAS_WIDTH || wrappedHead.y < 0 || wrappedHead.y >= CANVAS_HEIGHT) {
      lastDeathCause = 'Hit the wall!';
      return true;
    }
  }
  
  // Rival body collision (line 3756)
  for (var rci = 0; rci < rivals.length; rci++) {
    if (rivals[rci].active) {
      for (var rcj = 0; rcj < rivals[rci].snake.length; rcj++) {
        if (rivals[rci].snake[rcj].x === wrappedHead.x && rivals[rci].snake[rcj].y === wrappedHead.y) {
          if (shieldActive) {
            shieldActive = false; powerUpTimer = 0; powerUpType = null;
            stats.shieldBlocks++;
            spawnParticles(wrappedHead.x, wrappedHead.y, 15, '#4488FF');
            playSound('bonus');
            return false;
          }
          lastDeathCause = 'You were caught by the rival!';
          return true;
        }
      }
    }
  }
  
  return false; // alive
}
```

The inlined code at lines 3731-3782 becomes:
```js
if (checkPlayerDeath(wrappedHead)) {
  snake.push(tail);
  gameOver();
  return;
}
```

**B. `eatFood(food, tail, wrappedHead)` — extract from lines ~3801-3916**

The food-eat handler is the largest inline block (~115 lines). Extract it:

```js
function eatFood(food, tail, wrappedHead) {
  snake.push(tail);
  snakeGrew = true;
  if (activeSeed !== null) recordReplayGrow(gameTick);
  const eatenType = food.type;
  
  // ... all existing food eat code: stats tracking, combo logic, milestone flash,
  //     XP award, particles, synesthesia rings, score addition, snap mode, painter mode
  // ... unchanged from source
}
```

Called in `updateGame()`:
```js
if (food && wrappedHead.x === food.x && wrappedHead.y === food.y) {
  eatFood(food, tail, wrappedHead);
}
```

**C. `handleComboMilestone(comboCount)` — extract the flash/milestone check**

```js
function handleComboMilestone(comboCount) {
  if (COMBO_MILESTONES.includes(comboCount) && comboCount > lastComboMilestone) {
    lastComboMilestone = comboCount;
    const color = COMBO_FLASH_COLORS[comboCount] || '#44BB44';
    const alpha = comboCount >= 20 ? 0.5 : comboCount >= 10 ? 0.4 : 0.3;
    if (!flashOverlay || flashOverlay.priority !== 'critical') {
      flashOverlay = { color, alpha, priority: comboCount >= 10 ? 'high' : 'normal' };
    }
    if (comboCount >= 10) {
      shakeTimer = Math.min(300, 100 + comboCount * 5);
    }
    vibrate(30);
    playSound('combo_milestone');
  }
}
```

#### Risk
- Zero-functional-change refactor. Must verify after extraction that death checks, food eating, and combo milestone still work identically.
- `tail` variable scope: `tail` is computed at line 3707 (`const tail = snake.pop()`). After extraction, `tail` must be available in `eatFood()` scope — passed as parameter.
- `wrappedHead` is computed at line 3729. Same pattern: pass as parameter.

#### LOC Estimate
- `checkPlayerDeath()`: ~35 lines
- `eatFood()`: ~115 lines (moved, not new)
- `handleComboMilestone()`: ~12 lines
- 3 call-site replacements: ~6 lines changed
- **Total extracted (net new): 0 lines** (just refactoring existing code)

---

### Feature A: Brews System (Pre-Run Loadout)

#### Changes from Design (per review)
- Brew unlock gated by **mutator tokens** (not XP levels). Each brew costs tokens: 2 tokens for basic (vampire, rampage), 3 for mid (phantom, leech, combustion), 5 for premium (echo, phoenix).
- Vampire and Phoenix are mutually exclusive: equipping one unequips the other.
- Phantom Brew trigger changed: if player head crosses ANY tile the ghost has ever occupied in recorded history (tracked via a `ghostPath` Set), trigger the combo boost.
- Leech Brew: if stolen segments reduce rival length to ≤0, the rival is defeated and does NOT respawn for 15s.
- Combustion Brew: multiplier persists for 3 food items, not 1.

#### BREWS_CONFIG

```js
const BREWS_CONFIG = [
  { id: 'vampire',    name: 'Vampire Brew',  desc: 'Survive first death at length 3',                   cost: 2, mutuallyExclusive: ['phoenix'] },
  { id: 'rampage',    name: 'Rampage Brew',  desc: 'Food spawns 2 tiles closer (min 3)',                cost: 2 },
  { id: 'phantom',    name: 'Phantom Brew',  desc: 'Cross ghost path → +1.0x combo for 5s',            cost: 3 },
  { id: 'leech',      name: 'Leech Brew',    desc: 'Head-to-head with rival → steal 3 segments',        cost: 3 },
  { id: 'combustion', name: 'Comb Brew',     desc: 'Combo milestone → +1 mult to next 3 foods',         cost: 3 },
  { id: 'echo',       name: 'Echo Brew',     desc: 'Every 8th food spawns a copy at adjacent tile',     cost: 5 },
  { id: 'phoenix',    name: 'Phoenix Brew',  desc: 'Resurrect once at length 5, score → 0',             cost: 5, mutuallyExclusive: ['vampire'] },
];
```

#### New Variables

```js
let unlockedBrews = [];        // brew IDs earned
let equippedBrews = [];        // max 2, loaded from save on idle
let activeBrews = [];          // copy of equippedBrews at startGame(), mutated in-run
let brewUsageFlags = {};       // { vampireUsed: false, phoenixUsed: false, echoCount: 0, combustionAccum: 0, combRemaining: 0 }
```

#### Brew Effect Hooks

**Vampire** — in `checkPlayerDeath()`, between shield check and death return:
```js
if (activeBrews.includes('vampire') && !brewUsageFlags.vampireUsed) {
  brewUsageFlags.vampireUsed = true;
  // Set snake to length 3, teleport to last safe position
  while (snake.length > 3) snake.pop();
  lastDeathCause = 'Vampire Brew saved you!';
  spawnParticles(wrappedHead.x, wrappedHead.y, 20, '#FF0044');
  queueToast('🩸 Vampire Brew saved you!', 2000);
  return false; // survived
}
```
~10 lines added.

**Rampage** — after food eat, affects food spawn positioning:
```js
if (activeBrews.includes('rampage')) {
  // nextFoodMinDistance = 3 (influences generateFood() placement)
}
```
~5 lines added.

**Phantom** — in `animateVisuals()` or `drawGame()`, check ghost path overlap:
```js
if (activeBrews.includes('phantom') && lastRunGhostPath) {
  const headTile = { x: Math.floor(snake[0].x / TILE_SIZE), y: Math.floor(snake[0].y / TILE_SIZE) };
  if (lastRunGhostPath.has(`${headTile.x},${headTile.y}`)) {
    phantomBoostTimer = 5000; // 5s
    spawnParticles(headTile.x * TILE_SIZE, headTile.y * TILE_SIZE, 8, '#AA88FF');
  }
}
// In combo logic: if phantomBoostTimer > 0, multiply combo by 2
```
~15 lines added.

**Leech** — in rival collision section of `checkPlayerDeath()`:
Where shield check fires for rival body collision, also check for head-to-head adjacency:
```js
for (var rci = 0; rci < rivals.length; rci++) {
  if (!rivals[rci].active) continue;
  var rivalHead = rivals[rci].snake[0];
  var dx = Math.abs(wrappedHead.x - rivalHead.x);
  var dy = Math.abs(wrappedHead.y - rivalHead.y);
  if (dx <= TILE_SIZE && dy <= TILE_SIZE && dx + dy <= TILE_SIZE * 2) {
    // Head adjacency
    if (activeBrews.includes('leech')) {
      var stolen = Math.min(3, rivals[rci].snake.length - 1);
      for (var si = 0; si < stolen; si++) {
        snake.push({...snake[snake.length-1]}); // grow
      }
      for (var si = 0; si < stolen; si++) {
        if (rivals[rci].snake.length > 1) rivals[rci].snake.pop();
      }
      if (rivals[rci].snake.length <= 1) {
        rivals[rci].active = false;
        // No respawn for 15s — set respawnTimer
        leechKillTimer = 15000;
      }
      spawnParticles(wrappedHead.x, wrappedHead.y, 10, '#44FF88');
    }
  }
}
```
~20 lines added.

**Combustion** — in `handleComboMilestone()`:
```js
if (activeBrews.includes('combustion')) {
  brewUsageFlags.combustionAccum++;
  brewUsageFlags.combRemaining += 3; // +1 mult for next 3 foods
}
```
In `addScore()` or score computation:
```js
let combustionBonus = 0;
if (activeBrews.includes('combustion') && brewUsageFlags.combRemaining > 0) {
  combustionBonus = tier.pts * brewUsageFlags.combustionAccum;
  brewUsageFlags.combRemaining--;
}
```
~10 lines added.

**Echo** — in `eatFood()` after successful eat:
```js
if (activeBrews.includes('echo')) {
  brewUsageFlags.echoCount = (brewUsageFlags.echoCount || 0) + 1;
  if (brewUsageFlags.echoCount % 8 === 0) {
    spawnEchoFood(food);
  }
}
```
~5 lines added, plus `spawnEchoFood()` helper (~10 lines):
```js
function spawnEchoFood(originalFood) {
  const adjacent = [
    {x: originalFood.x + TILE_SIZE, y: originalFood.y},
    {x: originalFood.x - TILE_SIZE, y: originalFood.y},
    {x: originalFood.x, y: originalFood.y + TILE_SIZE},
    {x: originalFood.x, y: originalFood.y - TILE_SIZE},
  ];
  const free = adjacent.filter(pos => isFreeTile(pos.x, pos.y));
  if (free.length > 0) {
    const pick = free[Math.floor(Math.random() * free.length)];
    const echoFood = { ...originalFood, pts: Math.floor(originalFood.pts / 2) };
    // Place at pick.x, pick.y
    food = echoFood;
    food.x = pick.x;
    food.y = pick.y;
  }
}
```
~15 lines. Note: spawns the echo as the NEXT food entity (replaces current food). This is simpler than maintaining parallel food arrays.

**Phoenix** — in `checkPlayerDeath()`, before death return:
```js
if (activeBrews.includes('phoenix') && !brewUsageFlags.phoenixUsed) {
  brewUsageFlags.phoenixUsed = true;
  // Find nearest unoccupied tile
  var freeTile = findFreeTile(wrappedHead.x, wrappedHead.y);
  if (freeTile) {
    snake.push(tail); // restore tail
    while (snake.length > 5) snake.pop();
    snake[0] = { x: freeTile.x, y: freeTile.y };
    if (gameMode !== 'zen' && gameMode !== 'painter') score = 0;
    lastDeathCause = 'Phoenix Brew resurrected!';
    spawnParticles(freeTile.x, freeTile.y, 25, '#FF8800');
    queueToast('🔥 Phoenix Brew resurrected you!', 2500);
    return false;
  }
}
```
~15 lines added.

#### Brews Panel UI (Idle Screen)

Pattern: New DOM panel (`#brewsPanel`) following the existing cosmetics/achievements panel pattern:
```html
<div id="brewsPanel" class="panel" style="display:none;">
  <button onclick="closeAllPanels()" class="panel-close">✕</button>
  <h2>🧪 BREWS</h2>
  <p class="panel-subtitle">Equip up to 2 brews before a run</p>
  <div id="brewsGrid" class="brews-grid">
    <!-- Dynamically populated -->
  </div>
  <div id="brewsTokenDisplay">Tokens: <span id="brewTokenCount">0</span></div>
</div>
```

Each brew card (generated in JS):
```js
function renderBrewsPanel() {
  const grid = document.getElementById('brewsGrid');
  let html = '';
  for (const brew of BREWS_CONFIG) {
    const unlocked = unlockedBrews.includes(brew.id);
    const equipped = equippedBrews.includes(brew.id);
    const affordable = mutatorTokens >= brew.cost;
    html += `
      <div class="brew-card ${unlocked ? 'unlocked' : 'locked'} ${equipped ? 'equipped' : ''}"
           onclick="toggleBrew('${brew.id}')"
           role="button" tabindex="0"
           aria-label="${brew.name}: ${brew.desc}${unlocked ? (equipped ? ' (equipped)' : '') : ' (locked, costs ' + brew.cost + ' tokens)'}">
        <div class="brew-name">${brew.name}</div>
        <div class="brew-desc">${brew.desc}</div>
        <div class="brew-cost">${unlocked ? (equipped ? '✓ Equipped' : 'Tap to equip') : '🔒 ' + brew.cost + ' tokens'}</div>
      </div>`;
  }
  grid.innerHTML = html;
  document.getElementById('brewTokenCount').textContent = mutatorTokens;
}
```

**Keybinding**: `B` key (idle only) to toggle brews panel. Add to `#brewsPanel` CSS close button.
**Mobile entry**: Add a small DOM button row below canvas for `[Stats] [Ach] [Cos] [Brews] [Diary]` — only on touch devices.

#### Persistence

```js
// saveManager keys
'snake_unlocked_brews' → JSON string array
'snake_equipped_brews' → JSON string array (max 2)
```

#### LOC Estimate
- BREWS_CONFIG + variables: ~20 lines
- Brew effect hooks (7 brews): ~80 lines
- Brews panel HTML+CSS: ~20 lines
- Panel render + toggle logic: ~60 lines
- Persistence + reset: ~15 lines
- Keybinding (B key): ~5 lines
- Extract `checkPlayerDeath()` refactoring: handled in Feature 0
- **Total: ~200 lines**

---

### Feature B: Cascade Mutator Storm (Resonances)

#### Changes from Design (per review)

- `activeMutator` (string) → `activeMutators` (array) — migration plan below
- 3-mutator score penalty: **0.5x** (not 0.25x). 1/2/3 mutators → 1.0x / 0.5x / 0.5x
- Gauntlet mode: limited to 1 mutator (no cascade in gauntlet)
- Ghost replay compatibility: v1 ghosts store `mutator` (string). On load, map to `mutators: [replay.mutator]`.
- Resonances show a persistent HUD indicator (small colored gem + name), not just a toast.
- Non-resonant combinations: gracefully degrade — each mutator works independently, no resonance, no penalty beyond the score multiplier.

#### Migration: `activeMutator` → `activeMutators`

**All call sites and changes:**

| # | Location | Current Code | New Code | Risk |
|---|---|---|---|---|
| 1 | Line 265 (`saveReplay()`) | `mutator: activeMutator` | `mutators: activeMutators` | Low — only affects fresh saves |
| 2 | Line 319 (`rebuildGhost()`) | `replay.mutator !== activeMutator` | `replay.mutators && replay.mutators[0] !== activeMutators[0]` | **High** — breaks ghost loading if wrong |
| 3 | Line 526 (declaration) | `let activeMutator = null;` | `let activeMutators = [];` | Low — single declaration |
| 4 | Line 907 (`addScore()`) | `activeMutator === 'golden_food'` | `activeMutators.includes('golden_food')` | Low — simple change |
| 5 | Line 926 (`pickRandomFoodType()`) | `activeMutator === 'chaos_seed'` | `activeMutators.includes('chaos_seed')` | Low — simple change |
| 6 | Line 1092 (`resetGame()`) | `activeMutator = null` | `activeMutators = []` | Low |
| 7 | Line 1295 (`startGame()`) | `activeMutator === 'double_rival'` | `activeMutators.includes('double_rival')` | Low |
| 8 | Lines 3512-3523 (HUD) | `activeMutator ? mutDef : ''` | Iterate `activeMutators` for display | Medium — rendering loop change |
| 9 | Line 3612 (gravity check) | `activeMutator === 'gravity'` | `activeMutators.includes('gravity')` | Low |
| 10 | Line 3618 (phase_shift) | `activeMutator === 'phase_shift'` | `activeMutators.includes('phase_shift')` | Low |
| 11 | Line 3622 (hunger_clock) | `activeMutator === 'hunger_clock'` | `activeMutators.includes('hunger_clock')` | Low |
| 12 | Line 3641 (shrink_zone) | `activeMutator === 'shrink_zone'` | `activeMutators.includes('shrink_zone')` | Low |
| 13 | Line 3662 (chaos_seed) | `activeMutator === 'chaos_seed'` | `activeMutators.includes('chaos_seed')` | Low |
| 14 | Line 4070 (golden_food regen) | `activeMutator === 'golden_food'` | `activeMutators.includes('golden_food')` | Low |
| 15 | Lines 4554-4566 (draft) | `activeMutator = draftOptions[draftSelection]` | `activeMutators = [draftOptions[draftSelection]]` for single; loop for cascade | Medium |
| 16 | Line 4932 (mirror input) | `activeMutator === 'mirror'` | `activeMutators.includes('mirror')` | Low |

**Ghost backward-compatibility code** (line 319 area):
```js
// Load ghost replay
function rebuildGhost(replay) {
  // v1 compatibility: map single mutator to mutators array
  let ghostMutators = replay.mutators || (replay.mutator ? [replay.mutator] : []);
  if (replay.version === REPLAY_VERSION && replay.seed === activeSeed) {
    // Compare mutator compatibility
    if (ghostMutators.length !== activeMutators.length) return [];
    // ... rest of ghost loading
  }
}
```

#### Draft Screen — Cascade Mode

New toggle on draft screen (line ~4540 area):
```js
const cascadeUnlocked = saveManager.get('snake_cascade_unlocked', '') === 'true';
let cascadeMode = false; // Toggles when D is pressed in draft screen (or new visual toggle)

function renderDraftOptions() {
  // ... existing options
  if (cascadeUnlocked) {
    addDraftUI('Cascade Mode: ' + (cascadeMode ? 'ON (pick 3)' : 'OFF (pick 1)'),
               'Press C to toggle cascade');
  }
}
```

Draft confirmation logic change:
```js
if (cascadeMode) {
  // Pick 3 mutators sequentially
  for (let ci = 0; ci < 3; ci++) {
    // Show options, let player pick
    // On Enter: add to activeMutators
  }
} else {
  // Original single-pick logic
  activeMutators = [draftOptions[draftSelection]];
}
```

#### Unlock Condition

Cascade mode unlocks after earning 5+ mutator tokens. Check in `checkMutatorUnlocks()`:
```js
if (!cascadeUnlocked && mutatorTokens >= 5) {
  saveManager.set('snake_cascade_unlocked', 'true');
  cascadeUnlocked = true;
  queueToast('🌀 Cascade Mode Unlocked! Pick 3 mutators per run!', 4000);
}
```

#### Resonance System

**RESONANCES Config:**
```js
const RESONANCES = {
  'gravity~mirror': {
    name: 'Quantum',
    desc: 'Direction inverts randomly every 10-15 ticks',
    effect: 'invertControls'
  },
  'phase_shift~hunger_clock': {
    name: 'Ethereal',
    desc: 'Phase-shift ticks pause hunger; snake becomes intangible',
    effect: 'intangiblePhase'
  },
  'golden_food~chaos_seed': {
    name: 'Chaos Gold',
    desc: 'All food 2x points and 2x XP, types shuffle every 20 ticks',
    effect: 'doubleGold'
  },
  'shrink_zone~double_rival': {
    name: 'Pressure Cooker',
    desc: 'Rivals also trigger board shrinking',
    effect: 'rivalShrink'
  },
  'hunger_clock~golden_food': {
    name: 'Famine Feast',
    desc: '4x food points but hunger ticks every 30',
    effect: 'feastFamine'
  },
  'mirror~chaos_seed': {
    name: 'Schrodinger',
    desc: 'Every 15 ticks: mirror toggles OR food reshuffles',
    effect: 'quantumToggle'
  },
  // Triple resonances (only relevant with 3 mutators at 0.5x)
  'gravity~mirror~phase_shift': {
    name: 'Chaos Theory',
    desc: 'Three effects cycle every 5 ticks',
    effect: 'chaosCycle'
  },
  'golden_food~hunger_clock~shrink_zone': {
    name: 'Apocalypse',
    desc: 'Shrink accelerates on each hunger tick',
    effect: 'rapidDoom'
  },
};
```

**Resonance detection** (run once at draft completion):
```js
function detectResonance(mutators) {
  mutators.sort(); // canonical order
  const key = mutators.join('~');
  return RESONANCES[key] || null;
}
```

**Resonance effect implementations:**

| Effect | Implementation |
|---|---|
| `invertControls` | Every 10-15 ticks: `flipDx = !flipDx; flipDy = !flipDy`. Apply in keydown handler. Flash screen 1 tick. ~8 lines. |
| `intangiblePhase` | If `gameTick % 5 === 0 && activeMutators.includes('phase_shift')`: skip hunger decrement. Set `snakeIntangible = true` — rivals pass through. ~5 lines. |
| `doubleGold` | `addScore()`: if active resonance → `pts * 2`. `awardXP()`: if active → `xp * 2`. Chaos seed reshuffling unchanged. ~6 lines. |
| `rivalShrink` | In rival food-eat handler: `shrinkBoard()` called. Shrink boundary gets red shadowBlur 10px. ~8 lines. |
| `feastFamine` | `addScore()`: `pts * 4`. Hunger clock max reduced from 50 to 30. ~4 lines. |
| `quantumToggle` | Every 15 ticks: 50% chance toggle mirror on/off, 50% reshuffle food weights. ~10 lines. |
| `chaosCycle` | Cycle through g→m→p every 5 ticks. Only cycled effect active. ~12 lines. |
| `rapidDoom` | Each hunger clock decrement reduces shrink zone counter by 2 extra ticks. ~3 lines. |

Each resonance effect is a function called from the appropriate hook in `updateGame()`. Total active resonance code: ~56 lines.

#### HUD Indicator

In `drawGame()` mutator display section (~line 3512):
```js
// Draw active mutators
let yOffset = MUTATOR_DEFS ? 30 : 20;
for (const mutId of activeMutators) {
  // ... existing single-mutator draw, now looped
}

// Draw resonance indicator (if any)
if (activeResonance) {
  ctx.save();
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = '#AA88FF';
  ctx.textAlign = 'right';
  ctx.fillText('✦ ' + activeResonance.name, CANVAS_WIDTH - 5, yOffset + 15);
  ctx.restore();
}
```

#### Score Multiplier

```js
function getCascadeMultiplier(count) {
  return 1.0 / (count || 1); // 1→1.0, 2→0.5, 3→0.333... but clamped to 0.5 for 3
}

// In gameOver() finalScore computation:
if (activeMutators.length > 1) {
  const mult = Math.max(0.5, getCascadeMultiplier(activeMutators.length));
  score = Math.floor(score * mult);
}
```

Per review recommendation: 0.5x for both 2 and 3 mutators. GetCascadeMultiplier returns 0.5 for 2, 0.5 for 3 (clamped).

#### LOC Estimate
- `activeMutator` → `activeMutators` refactor: ~90 lines changed (20 call sites)
- Cascade toggle + unlock: ~30 lines
- Draft screen cascade mode: ~30 lines
- Resonance config + detection: ~20 lines
- Resonance effects (8): ~56 lines
- Score multiplier: ~8 lines
- HUD indicator: ~12 lines
- Ghost compatibility: ~15 lines
- Gauntlet guard: ~5 lines
- **Total: ~266 lines changed**

---

### Feature C: Snake Diary (Trimmed)

#### Trimmed Scope (per review)
- ✓ Auto-save on game-over: date, mode, score, duration, death cause, seed, mutators, brews
- ✓ Scrollable timeline list (newest first)
- ✓ Per-entry detail expand with full stats grid
- ✓ Delete entry with confirmation
- ✓ Filter by mode dropdown
- ✗ Board snapshot encoding (deferred)
- ✗ Export/import (deferred)
- ✗ Monthly digest (deferred)
- ✗ Notes/inline editing (deferred)

#### Data Model

```js
const MAX_DIARY_ENTRIES = 200; // Reduced from 500 to keep localStorage lean

// Auto-saved in gameOver() and endZenSession()
function saveDiaryEntry() {
  const diary = saveManager.getJSON('snake_diary', []);
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    mode: gameMode,
    score: gameMode === 'painter' ? paintCoveredCount : score,
    duration: Math.floor((Date.now() - sessionStartTime) / 1000) || 0,
    foodEaten: sessionFoodEaten,
    maxCombo: sessionMaxCombo,
    level: level,
    levelAfter: levelAfterSession,
    prestigeLevel: prestigeLevel,
    deathCause: lastDeathCause,
    seed: activeSeed,
    mutators: activeMutators.slice(),
    brews: activeBrews.slice(),
  };
  diary.unshift(entry);
  if (diary.length > MAX_DIARY_ENTRIES) diary.length = MAX_DIARY_ENTRIES;
  saveManager.setJSON('snake_diary', diary);
}
```

#### Diary Panel (DOM panel, like achievements)

```html
<div id="diaryPanel" class="panel" style="display:none;">
  <button onclick="closeAllPanels()" class="panel-close">✕</button>
  <h2>📓 RUN DIARY</h2>
  <div id="diaryFilter">
    <select id="diaryModeFilter" onchange="renderDiary()">
      <option value="all">All Modes</option>
      <!-- POPULATED FROM MODE_ORDER -->
    </select>
  </div>
  <div id="diaryList" style="max-height:380px;overflow-y:auto;">
    <!-- Dynamically populated -->
  </div>
</div>
```

Diary entry render:
```js
function renderDiary() {
  const diary = saveManager.getJSON('snake_diary', []);
  const filter = document.getElementById('diaryModeFilter').value;
  const list = document.getElementById('diaryList');
  let html = '';
  for (const entry of diary) {
    if (filter !== 'all' && entry.mode !== filter) continue;
    const dateStr = new Date(entry.date).toLocaleDateString();
    const timeStr = formatDuration(entry.duration);
    html += `
      <div class="diary-entry" onclick="toggleDiaryDetail(${entry.id})">
        <div class="diary-summary">
          <span class="diary-mode">${entry.mode}</span>
          <span class="diary-score">${entry.score}</span>
          <span class="diary-time">${timeStr}</span>
          <span class="diary-date">${dateStr}</span>
        </div>
        <div id="diary-detail-${entry.id}" class="diary-detail" style="display:none;">
          <div class="diary-stats">
            <span>Food: ${entry.foodEaten}</span>
            <span>Combo: ${entry.maxCombo}x</span>
            <span>Level: ${entry.level}→${entry.levelAfter || entry.level}</span>
            <span>Prestige: ${entry.prestigeLevel}</span>
            <span>Seed: ${entry.seed || 'none'}</span>
            <span>Death: ${entry.deathCause}</span>
            <span>Mutators: ${entry.mutators?.join(', ') || 'none'}</span>
            <span>Brews: ${entry.brews?.join(', ') || 'none'}</span>
          </div>
          <button onclick="deleteDiaryEntry(${entry.id})" class="diary-delete">Delete</button>
        </div>
      </div>`;
  }
  list.innerHTML = html || '<p style="text-align:center;color:#888;">No entries yet.</p>';
}
```

#### Keybinding

`J` key (idle only) to toggle diary panel. Close panel same as others (close button, Escape).

#### Integration Points

- `gameOver()`: call `saveDiaryEntry()` after `finalizeSession()` but before returning
- `endZenSession()`: same — call `saveDiaryEntry()` after finalize

#### Persistence

```js
// saveManager key
'snake_diary' → JSON array of entry objects
// Max 200 entries × ~150 bytes = ~30KB
```

#### LOC Estimate

- `saveDiaryEntry()`: ~25 lines
- `renderDiary()`: ~35 lines
- `toggleDiaryDetail()` + `deleteDiaryEntry()`: ~15 lines
- Diary panel HTML + CSS: ~25 lines
- `formatDuration()` helper: ~5 lines
- Keybinding (J key): ~5 lines
- Integration in gameOver/endZenSession: ~6 lines
- **Total: ~116 lines**

---

### Feature D: Score Pop-Up Floaters & Juice

#### Data Model (no design change)

```js
let floaters = [];

function spawnFloater(x, y, text, color, size, duration) {
  floaters.push({
    x: x / TILE_SIZE, y: y / TILE_SIZE, // tile coords
    text: text,
    color: color,
    size: size || 16,
    life: duration || 1.0,
    maxLife: duration || 1.0,
    velocityY: -1.5,
  });
}
```

#### Render Function

```js
function drawFloaters(ctx) {
  for (let fi = floaters.length - 1; fi >= 0; fi--) {
    const f = floaters[fi];
    const progress = 1 - f.life / f.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = `bold ${f.size}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = f.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = f.color;
    const screenY = f.y * TILE_SIZE + progress * f.velocityY * TILE_SIZE;
    ctx.fillText(f.text, f.x * TILE_SIZE + TILE_SIZE / 2, screenY);
    ctx.restore();
  }
}
```

#### Lifecycle

Floaters decay in `animateVisuals()` delta-time section:
```js
for (let fi = floaters.length - 1; fi >= 0; fi--) {
  floaters[fi].life -= delta / 1000;
  if (floaters[fi].life <= 0) floaters.splice(fi, 1);
}
```

Density limit:
```js
if (floaters.length > 8) floaters.splice(0, floaters.length - 8);
```

#### Trigger Points

In `eatFood()` after spawning particles:
```js
const tierColor = FOOD_TIERS[eatenType].color;
const pts = FOOD_TIERS[eatenType].pts;
spawnFloater(wrappedHead.x, wrappedHead.y, '+' + pts, tierColor);

if (eatenType === 'speed') {
  spawnFloater(wrappedHead.x, wrappedHead.y, '+5 SPEED!', '#FFDD00', 20);
} else if (eatenType === 'bonus') {
  spawnFloater(wrappedHead.x, wrappedHead.y, '+30 BONUS!', '#FFD700', 18);
}
```

In `handleComboMilestone()`:
```js
if (comboCount === 3) {
  spawnFloater(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'COMBO x3!', '#44CCFF', 28, 1.5);
} else if (comboCount === 5) {
  spawnFloater(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'COMBO x5!', '#44FF44', 30, 1.5);
} else if (comboCount === 10) {
  spawnFloater(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'COMBO x10!', '#FF44FF', 34, 1.8);
} else if (comboCount === 20) {
  spawnFloater(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'COMBO x20!', '#FFAA00', 38, 2.0);
} else if (comboCount === 50) {
  spawnFloater(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 'COMBO x50!', '#FF0000', 42, 2.0);
}
```

#### Draw Order

Called from `animateVisuals()` after particles but before overlays:
```js
// Render particles (existing)
for (const p of particles) { ... }
ctx.globalAlpha = 1;

// NEW: Render floaters
drawFloaters(ctx);

// Touch swipe indicator (existing)
// Help overlay (existing)...
```

#### Draw Order Integration

Per AGENTS.md draw order: `grid → obstacles → food → snake → particles/trails → overlays → flash`. Floaters go between particles and overlays.

#### Clear on game-over

In `gameOver()`:
```js
floaters = []; // clear visual state
```

#### LOC Estimate

- Floater array + `spawnFloater()`: ~15 lines
- `drawFloaters()`: ~18 lines
- Decay + density in `animateVisuals()`: ~10 lines
- Trigger calls (eat + combo): ~15 lines
- Clear on game-over: ~2 lines
- **Total: ~50 lines**

---

### Feature E: Screen Reader Support

#### Static HTML (add to document body near canvas)

```html
<div id="srAnnounce" aria-live="polite" aria-atomic="true"
     class="sr-only"
     style="position:absolute;width:1px;height:1px;overflow:hidden;
            clip:rect(0,0,0,0);white-space:nowrap;border:0;"></div>
```

Also add ARIA to canvas:
```html
<canvas id="gameCanvas" role="img" aria-label="Snake game board"></canvas>
```

And d-pad button labels:
```html
<button data-key="ArrowUp" aria-label="Up">▲</button>
<button data-key="ArrowDown" aria-label="Down">▼</button>
<button data-key="ArrowLeft" aria-label="Left">◀</button>
<button data-key="ArrowRight" aria-label="Right">▶</button>
<button data-key=" " aria-label="Pause">⏸</button>
```

#### JavaScript

```js
let lastSrSpeak = 0;
let srQueue = '';

function srSpeak(text) {
  const el = document.getElementById('srAnnounce');
  if (!el) return;
  const now = Date.now();
  if (now - lastSrSpeak < 500) {
    srQueue = text;
    return;
  }
  lastSrSpeak = now;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
}

// Process queued announcements
setInterval(function() {
  if (srQueue && Date.now() - lastSrSpeak >= 500) {
    const msg = srQueue;
    srQueue = '';
    el = document.getElementById('srAnnounce');
    if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 50); }
  }
}, 500);
```

#### Announcement Points (key-specific code)

| Event | Code | Insert Point |
|---|---|---|
| Mode change | `srSpeak(getModeDesc(gameMode))` | After mode selection keydown |
| Game start | `srSpeak('Game started. Mode: ' + gameMode)` | `startGame()` |
| Food eat | `srSpeak('Ate ' + tier.name + '. Score ' + score)` | `eatFood()` |
| Combo milestone | `srSpeak('Combo ' + comboCount + '!')` | `handleComboMilestone()` |
| Combo break | `srSpeak('Combo broken at ' + comboCount)` | combo reset in `eatFood()` |
| Power-up | `srSpeak('Collected ' + type + ' for ' + dur + 's')` | power-up collection |
| Level up | `srSpeak('Level ' + level + '!')` | `levelUp()` or `awardXP()` level change |
| Death | `srSpeak('Game over. Score ' + score + '. ' + lastDeathCause)` | `gameOver()` before overlay draw |
| Pause/Resume | `srSpeak('Game paused')` / `srSpeak('Game resumed')` | pause toggle |
| Panel open | `srSpeak('Brews panel opened')` etc. | panel open handlers |
| Panel close | `srSpeak('Panel closed')` | `closeAllPanels()` |

#### Throttling Priority

- Death announcement: always fires immediately (bypasses debounce if necessary)
- Combo announcements only at milestones (3, 5, 10, 20, 50) + combo break. Not every combo level.
- Mode change debounced: if mode changes within 300ms, only announce final selection.

#### Panel ARIA roles

Existing panels (stats, achievements, cosmetics) and new panels (brews, diary) should get `role="dialog"` and `aria-labelledby` pointing to their `<h2>` element.

#### LOC Estimate

- HTML changes: ~15 lines (sr div, canvas aria, d-pad labels)
- `srSpeak()` + queue: ~15 lines
- ~15 announcement call sites (~2 lines each): ~30 lines
- Panel ARIA updates: ~10 lines
- **Total: ~70 lines**

---

### Feature F: Responsive Canvas Sizing

#### Changes from Design

- Minimum canvas size: 300px (not 280px as previously)
- Compact HUD: not implemented in first pass (too many CSS touchpoints). Deferred.
- Canvas internal resolution stays at 400×400. Only CSS display size changes.

#### Code

```js
function resizeCanvas() {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const dpad = document.getElementById('dpad');
  const scoreBar = document.getElementById('score');
  
  const scoreBarHeight = scoreBar ? scoreBar.offsetHeight : 0;
  const dpadHeight = dpad ? dpad.offsetHeight : 0;
  const margin = 16;
  
  const availableHeight = window.innerHeight - scoreBarHeight - dpadHeight - margin;
  const availableWidth = window.innerWidth - 16;
  
  const size = Math.max(300, Math.min(availableWidth, availableHeight, 600));
  
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
}
```

#### CSS

```css
#gameCanvas {
  max-width: 100%;
  /* Remove max-height: 70vh or any fixed pixel sizes */
  touch-action: none; /* prevent browser zoom */
}

/* Safe area for notched phones */
@media (display-mode: standalone) {
  #dpad {
    padding-bottom: max(8px, env(safe-area-inset-bottom));
  }
}
```

Remove from HTML:
- Inline `width="400" height="400"` on canvas tag → keep as attributes (these control internal resolution)
- Any `max-height: 70vh` in inline styles on canvas wrapper

#### Integration

```js
// On DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  resizeCanvas();
  // ... existing setup
});

// On resize + orientation change (debounced)
let resizeTimeout;
window.addEventListener('resize', function() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(resizeCanvas, 100);
});
window.addEventListener('orientationchange', function() {
  setTimeout(resizeCanvas, 300); // wait for orientation to settle
});
```

#### LOC Estimate

- `resizeCanvas()`: ~20 lines
- CSS changes: ~12 lines
- Event binding: ~12 lines
- Remove old hardcoded sizing: ~5 lines
- **Total: ~49 lines**

---

## 4. Persistence (saveManager)

| Key | Type | Feature | Max Size |
|---|---|---|---|
| `snake_unlocked_brews` | JSON string[] | A (Brews) | ~200B |
| `snake_equipped_brews` | JSON string[] | A (Brews) | ~200B |
| `snake_cascade_unlocked` | string 'true'/'false' | B (Cascade) | ~50B |
| `snake_resonances_discovered` | JSON string[] | B (Cascade) | ~500B |
| `snake_diary` | JSON DiaryEntry[] | C (Diary) | ~30KB |

All within localStorage quota (~5MB), even with ghost replays (~200KB) and existing data (< 50KB).

---

## 5. Draw Order

Current: `grid → obstacles → food → snake → particles/trails → overlays → flash`

New: `grid → obstacles → food → snake → particles/trails → **floaters** → overlays → flash`

Per AGENTS.md, floaters must save/restore canvas state per-item (they modify shadowBlur, font, textAlign, textBaseline).

---

## 6. Keybinding Summary

| Key | Feature | State | Action |
|---|---|---|---|
| B | A (Brews) | idle | Toggle Brews panel |
| J | C (Diary) | idle | Toggle Diary panel |
| C | B (Cascade) | draft screen | Toggle cascade mode |
| (existing) | Original | draft screen | D toggles draft mode |

No existing keybind conflicts (verified: B = unused, J = unused, C = unused on draft screen).

---

## 7. Integration Checklist

### Changes to `updateGame()` (~500 lines)
- [ ] Extract `checkPlayerDeath()` → call it instead of inline checks
- [ ] Extract `eatFood()` → call it instead of inline handler
- [ ] Extract `handleComboMilestone()` → call it instead of inline check
- [ ] Add Brew hooks (Phantom overlap check per tick)
- [ ] Add resonance effect hooks (intangiblePhase, quantumToggle, etc.)
- [X] Cascade mutator checks already exist here (gravity, phase_shift, etc.) — just change to `activeMutators.includes()`

### Changes to `gameOver()`
- [ ] Add `saveDiaryEntry()` call
- [ ] Add cascade score multiplier
- [ ] Clear floaters

### Changes to `animateVisuals()` (rAF loop)
- [ ] Add floater lifecycle decay (delta-time section)
- [ ] Add `drawFloaters(ctx)` call after particles

### Changes to `startGame()`
- [ ] Read `equippedBrews` → `activeBrews`
- [ ] If cascade mode → limit to 1 in gauntlet

### Changes to resetGame()
- [ ] `activeMutator = null` → `activeMutators = []`
- [ ] Reset brew usage flags

### Changes to draft screen
- [ ] Add cascade toggle (if unlocked)
- [ ] Change confirmation to support 3 picks in cascade mode

### Changes to keydown handler
- [ ] Add B for brews panel (idle only)
- [ ] Add J for diary panel (idle only)
- [ ] Add C for cascade toggle (draft screen only)
- [ ] Mirror mutator: `activeMutator === 'mirror'` → `activeMutators.includes('mirror')`

### Changes to endZenSession()
- [ ] Add `saveDiaryEntry()` — same pattern as gameOver()