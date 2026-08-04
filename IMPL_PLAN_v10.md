# Snakes v10 — Implementation Plan

Incorporates review feedback from both plan reviewers (architecture + gameplay). All BLOCKER and MAJOR issues addressed.

## Feature Summary

| # | Feature | LOC | Impact | Feas | Risk |
|---|---------|-----|--------|-----|------|
| G | Input Buffer Queue (2-deep) | ~60 | 5 | 3 | 3 |
| F | Colorblind Food Palettes | ~160 | 4 | 4 | 3 |
| E | Meta-Achievements | ~120 | 3 | 5 | 1 |
| D | Daily Seed Leaderboard | ~140 | 4 | 5 | 1 |
| B | Bomb Food | ~140 | 4 | 5 | 3 |
| A | Combo Bank | ~180 | 4 | 5 | 3 |
| C | Hazard Zones | ~220 | 4 | 4 | 4 |

**Total: ~1020 LOC** (revised up from ~890 per reviewer feedback).

## Implementation Order

1. **G → F → E → D → B → A → C**

Rationale: G is the foundational input fix (self-contained). F creates `foodColor()` which B needs. E and D are low-risk additive features. B adds a food tier (after F so palette helper exists). A adds the active resource (after B so the obstacle-clear charge synergizes with bomb). C is the most complex (last, after all prior systems are stable).

---

## Feature G — Input Buffer Queue (2-deep)

### State
- Replace `let nextDirection = null` with `let dirQueue = []` (cap 2). Declared at ~line 260.
- `let lastConsumedDir = { dx: 1, dy: 0 }` — tracks the last direction consumed by the tick, for reverse-checking when the queue is empty.

### setNextDirection(dx, dy)
At ~line 3622. New logic:
1. Compute the "effective tail direction": if `dirQueue.length > 0`, the tail is `dirQueue[dirQueue.length - 1]`; else `lastConsumedDir`.
2. Reverse check: if `dx === -effectiveTail.dx && dy === -effectiveTail.dy`, reject (prevents 180° self-collision).
3. Duplicate check: if `dx === effectiveTail.dx && dy === effectiveTail.dy`, reject (no-op).
4. If `dirQueue.length < 2`, push `{dx, dy}`. Cap at 2 — a 3rd press is silently dropped (documented: "2 pending turns max").

### Tick consumption
At ~line 5855 (currently `nextDirection = null` after consuming):
- If `dirQueue.length > 0`: `const next = dirQueue.shift(); dx = next.dx; dy = next.dy; lastConsumedDir = {dx, dy};`
- Else: use current `dx`/`dy` (snake continues straight).

### Reset sites
All `nextDirection = null` sites become `dirQueue = []`:
- Line ~2087 (`resetGame`)
- Line ~5137 (`resetWaveState`)
- The tick-consumption site (~5855) becomes `dirQueue.shift()` (not a reset, but a consume).

### Swipe handler
At ~line 7432. Change `nextDirection = {dx, dy}` to `setNextDirection(dx, dy)` so swipes go through the queue's reverse-check and cap. This is a REQUIRED edit — the current code writes directly, bypassing the buffer.

### Snapshot
- Serialize: `dirQueue: dirQueue` (instead of `nextDirection`).
- Restore: `dirQueue = data.dirQueue || (data.nextDirection ? [data.nextDirection] : [])` — backward-compatible with v1 snapshots that have `nextDirection` (additive, no `SNAPSHOT_VERSION` bump).
- Also restore `lastConsumedDir` from the first queue entry or default `{dx:1, dy:0}`.

### Replay
`recordReplayDirection` logs the per-tick consumed `dx`/`dy` — unchanged. Replays store results, not inputs, so v9 replays play back correctly on v10 and vice versa. Confirm in test.

### Tests
- `test-v10.mjs`: Queue accepts 2, rejects 3rd. Reverse-check rejects 180°. Perpendicular after straight works. v1 snapshot restores to single-element queue. Replay direction stream unchanged.

---

## Feature F — Colorblind Food Palettes

### CVD_PALETTES
Module-scope object, keyed by type:
```js
const CVD_PALETTES = {
  off: null,
  protan: { common: {fill:'#0072B2',outline:'#004F7C'}, uncommon:{...}, rare:{...}, epic:{...}, bonus:{...}, speed:{...}, hunter:{...}, bomb:{...} },
  deutan: { ... }, // same Okabe-Ito assignments, can differ per CVD type
  tritan: { ... }
};
```
Okabe-Ito safe set: blue #0072B2, orange #E69F00, magenta #CC79A7, yellow #F0E442, sky-blue #56B4E9, vermillion #D55E00, green #009E73, reddish-purple #CC79A7.

Each palette maps ALL food types (including bomb — Feature B, and hazard — Feature C uses its own default blue/violet, see below). Bomb gets a non-orange CVD color (e.g. yellow #F0E442) to avoid collision with hunter's amber.

### foodColor(type) helper
New function. Returns the CVD-palette color if a palette is active, else `FOOD_TIERS[type].color`. Used at ALL `tier.color` read sites:
- `drawFood()` (~4295) — main food rendering
- `drawExtraFood()` (~4523) — portal/hoard foods
- `drawSnake()` skin path (~4628) — skin-based foods (if any use tier colors)
- Eat-block floater (~6115) — `spawnFloater(..., tierColor)`
- Eat-block flash (~6108) — `flashOverlay = { color: tierColor }`
- Eat-block particles (~6105) — `spawnParticles(..., tierColor)`
- Synesthesia ring (if it uses tierColor)
- Painter mode `currentPaintColor` (~6170)

This is critical: partial coverage means a CVD player sees corrected food but uncorrected floaters/flashes/particles — confusing. ALL sites must route through `foodColor()`.

### Persistence
- `saveManager.set('snake_cvd_palette', 'off')` — loaded near `highContrast` (~line 263).
- `let cvdPalette = saveManager.get('snake_cvd_palette', 'off')` — module-scope.

### Settings UI
4-button selector (Protan/Deutan/Tritan/Off) in `renderSettings()` (~1549), mirroring the Calm Mode Auto/On/Off `seg()` pattern. `setCvdPalette(type)` handler — bare-name global.

### Grid cache
Add `_cvd<cvdPalette>` suffix to the grid cache key (alongside `_dpr`, `_g`, `_bg`). On palette change: set `gridCacheTheme = null; visualDirty = true` (like `toggleHighContrast` at ~1604).

### Hazard default color
Hazards (Feature C) use blue/violet (#6B3FA0) as their DEFAULT color — safe across all CVD types without remapping. The CVD palette does NOT need to remap hazard colors (they're already CVD-safe). This avoids the "red lava under protanopia" problem entirely.

### Calm mode
No pulse animation in the palette selector UI — static color swatches only (calm-mode respects reduced motion).

### Tests
- `test-v10.mjs`: `foodColor('common')` returns palette color when active, `FOOD_TIERS.common.color` when off. Palette persists across reload.

---

## Feature E — Meta-Achievements

### META_ACHIEVEMENTS map
Same shape as `ACHIEVEMENTS`: `{name, desc, xp, icon, check(s,c)}`. The `check` reads the module-scope `achievements` map directly (not `s`/`c` args — different from base achievements, but works via closure). Designed in **bands** (per reviewer feedback — don't front-load COMBO_50):

```js
const META_ACHIEVEMENTS = {
  meta_combo_apprentice: { name:'Combo Apprentice', desc:'Reach x3, x5, and x7 combos', xp:100, icon:'🌟', check:()=> achievements.COMBO_3 && achievements.COMBO_5 && achievements.COMBO_7 },
  meta_combo_master: { name:'Combo Master', desc:'Reach x10, x20, and x30 combos', xp:300, icon:'⚡', check:()=> achievements.COMBO_10 && achievements.COMBO_20 && achievements.COMBO_30 },
  meta_evolution: { name:'Apex Evolution', desc:'Reach all evolution tiers', xp:200, icon:'🧬', check:()=> achievements.EVOLUTION_SWIFT && achievements.EVOLUTION_SERPENTINE && achievements.EVOLUTION_TITAN && achievements.EVOLUTION_APEX },
  meta_rival_slayer: { name:'Rival Slayer', desc:'Defeat rivals in 3 different modes', xp:150, icon:'⚔️', check:()=> achievements.RIVAL_SLAYER_CLASSIC && achievements.RIVAL_SLAYER_DAILY && achievements.RIVAL_SLAYER_SNAP },
  meta_completionist: { name:'Completionist', desc:'Unlock all base achievements', xp:500, icon:'👑', check:()=> Object.keys(ACHIEVEMENTS).every(id => achievements[id]) },
};
```
(Exact achievement IDs to be verified against the live `ACHIEVEMENTS` object at implementation time.)

### Evaluation
In `checkAchievements()` (~6652), as a second loop AFTER the existing one, INSIDE the `achievementsEnabled` guard:
```js
for (const [id, meta] of Object.entries(META_ACHIEVEMENTS)) {
  if (!achievements[id] && meta.check()) {
    achievements[id] = Date.now();
    awardXP(meta.xp);
    mutatorTokens += 1; // +1 token per meta (NOT a "large bundle" — per reviewer E2)
    queueToast(`🏆 Meta: ${meta.name}!`, 3000);
    unlockedAny = true;
  }
}
```
Token reward: **+1 per meta** (not "large bundle") — avoids economy flooding per AGENTS.md Quest Board precedent.

### Persistence
`snake_meta_achievements` JSON key (parallel to `snake_achievements`). Meta IDs namespaced `meta_*` to avoid collisions. Auto-included in `exportSaveData()` (collects all `snake_*` keys).

### Cosmetics
Each meta grants a cosmetic (at least one concrete: a `meta_completionist` grid theme). Reuse `unlockedCosmetics` path.

### Tests
- `test-v10.mjs`: Meta unlocks after base achievements are set. No unlock when base is incomplete. `mutatorTokens` increments by 1 per meta.

---

## Feature D — Daily Seed Leaderboard

### Storage
`snake_daily_lb` — JSON map keyed by date string from `getDayString()` (~1282). Each day's value is an array of `{score, time, foodEaten, maxCombo, ts}` (top 5, sorted by score desc, maxCombo desc, ts asc).

### Write
In `finalizeSession()` (~2953) — NOT in `gameOver`/`endZenSession` separately (per reviewer D1: `finalizeSession` is called by both, so a single hook covers both paths). Gated on `gameMode === 'daily'`:
```js
if (gameMode === 'daily') {
  const dayKey = getDayString();
  const lb = saveManager.getJSON('snake_daily_lb', {});
  if (!lb[dayKey]) lb[dayKey] = [];
  lb[dayKey].push({ score, time: sessionTimeAlive, foodEaten, maxCombo, ts: Date.now() });
  lb[dayKey].sort((a,b) => b.score - a.score || b.maxCombo - a.maxCombo || a.ts - b.ts);
  lb[dayKey] = lb[dayKey].slice(0, 5);
  saveManager.setJSON('snake_daily_lb', lb);
}
```

### Render
Idle-screen daily strip — when daily mode is selected on the idle screen, render a small top-5 list below the mode description (in the idle-screen draw branch of `drawOverlay`/idle render, NOT in `showStatsPanel` which is already dense). Shows "Today's Best: 1) 342pts 2) 280pts ..." for the current day.

### Stale data
New key (`snake_daily_lb`) — no cross-version contamination. Pre-v10 runs don't have entries. The first v10 daily run populates the list.

### Tests
- `test-v10.mjs`: Leaderboard stores top-5, sorts by score desc. New day creates new entry. Old day's data persists.

---

## Feature B — Bomb Food

### FOOD_TIERS.bomb
```js
bomb: { pts: 0, xp: 0, weight: 0.04, color: '#FF6600', pCount: 16, sound: 'bonus', glow: 12 }
```
- `xp: 0` (per reviewer B1 — purely tactical, no consolation XP). The reward is the cleared board / trimmed rival.
- `pts: 0` — no score from the bomb itself.

### Weight rebalance
Current weights sum to exactly 1.00. Adding bomb (0.04) requires rebalancing. Target: keep sum at 1.00.
- `common`: 0.37 → 0.33 (−0.04)
- `bonus`: 0.13 → 0.13 (unchanged)
- Sum: 0.33 + 0.25 + 0.12 + 0.03 + 0.13 + 0.05 + 0.05 + 0.04 = 1.00 ✓
(Per reviewer B1: the `common` fallback absorbs a 0.01 gap, but targeting exactly 1.00 is cleaner.)

### Eat block (bomb branch)
At ~line 6004, `food.type === 'bomb'` branch BEFORE the score/combo award:
1. **Skip score**: do NOT call `addScore(tier.pts)` (pts is 0 anyway, but also skip the combo-bonus `addScore(comboBonus)` — per reviewer B3: bomb should not benefit from combo multiplier; it's a tactical tool, not a score source). Skip `awardXP(foodXP)` (xp is 0). Skip `stats.normalFoodEaten++` — add a `stats.bombsEaten++` counter instead (new stat bucket, avoids mis-bucketing).
2. **Blast**: iterate `obstacles[]`, remove any within `2*TILE_SIZE` Manhattan distance of `wrappedHead`. Call `spawnParticles(wrappedHead.x, wrappedHead.y, 16, '#FF6600')` + `pushTransientRing(wrappedHead.x + TILE_SIZE/2, wrappedHead.y + TILE_SIZE/2, 80, '#FF6600', 500, 'ring', 4)`.
3. **Rival trim**: for each `rivals[i]` where `r.active && r.snake.length > 1` and `r.snake[0]` is within `2*TILE_SIZE` Manhattan: `const trim = Math.min(3, r.snake.length - 1); for (let t=0; t<trim; t++) r.snake.pop();` (per reviewer B2: proportional trim, guard head).
4. **Combo**: do NOT break the combo (bomb is an eat, not a miss). The combo timer continues. But the bomb itself contributes 0 to the combo score.

### drawFood bomb case
At ~4285. Pulsing dark-orange circle with a fuse spark. Draw at local origin per D1 discipline (`ctx.save()` → translate → scale → draw → `ctx.restore()`). Use `foodColor('bomb')` for CVD support.

### Magnet skip
Add `bomb` to the magnet-skip set (per reviewer B4). The existing magnet pull skips hunter (`food.type !== 'hunter'`). Add: `food.type !== 'hunter' && food.type !== 'bomb'`. Also skip in `extraFoods` magnet path.

### Echo-brew food2 coercion
At ~6206: `var f2Type = (food.type === 'hunter' || food.type === 'portal' || food.type === 'bomb') ? 'common' : food.type;`

### Walled mode exclusion
Bomb excluded in Walled mode (obstacles disabled, blast is pointless). Two paths:
1. Non-chaos: `effectiveTiers` filter drops bomb when `MODE_CONFIG[gameMode].wrap === false` (same as hunter).
2. Chaos: `shuffleFoodWeights` filter (~5381) — add `k === 'bomb'` alongside `k === 'hunter'` (per reviewer B5: chaos path currently only drops hunter).

### EXPLORER achievement
Stays at `sessionFoodTypes.size >= 6` (now 6-of-8 non-Walled). Do NOT bump.

### First-time toast
On first bomb spawn: `queueToast('💣 Bomb food: blast obstacles & trim the rival!', 3000)` — gated by `hasSeenBomb` flag (mirrors `hasSeenPortal` pattern).

### Tests
- `test-v10.mjs`: Bomb weight distribution. Bomb eat skips score+XP. Bomb clears obstacles within 2 tiles. Bomb trims rival. Magnet skips bomb. Echo-brew coerces bomb to common.

---

## Feature A — Combo Bank

### Combo Bank milestones
Per reviewer A1: grant a charge on ALL `COMBO_MILESTONES` entries `[3,5,7,10,15,20,30,50]` (not a subset). The cap of 5 is the limiter. This aligns with the live milestone system and makes the cap binding.

### State
- `let comboCharges = 0` — module-scope, declared beside `comboCount` (~688).
- `let comboBankSpendMode = 0` — 0=Clear, 1=Magnet, 2=Teleport. Cycled by `X` key. Displayed in HUD.
- Reset in `resetGame()` + `resetWaveState()` (Gauntlet waves reset the snake, so charges must reset too).

### Charge banking
In `handleComboMilestone()` (~5685), after the existing floater:
```js
if (COMBO_MILESTONES.includes(comboCount) && comboCharges < 5) {
  comboCharges++;
  if (!hasSeenComboBank) { hasSeenComboBank = true; saveManager.set('snake_has_seen_combo_bank', '1'); queueToast('⚡ Combo Charge banked! Press X to cycle, Z to spend.', 3000); }
}
```
Cap overflow: show "⚡ FULL" in HUD when `comboCharges >= 5` (per reviewer A5 — no silent discard).

### Spend-mode selector
Per reviewer A.1 BLOCKER: a spend-mode selector is required. Design:
- `X` key: cycles spend mode (Clear → Magnet → Teleport → Clear). The current mode is shown in the HUD badge.
- `Z` key: spends 1 charge on the current mode.
- Touch: a small "⚡" HUD button (canvas-drawn tap target near the combo display). Tap cycles mode; long-press spends. This gives mobile parity (per reviewer A.6).
- This is simpler than a radial wheel (which requires pause/slowmo) and works under time pressure. The HUD badge shows the current mode clearly: `⚡[Clear]` / `⚡[Magnet]` / `⚡[Teleport]`.

### spendComboCharge(kind)
New function, triggered by `Z` key (gated on `gameState === 'playing'` and `comboCharges > 0`):
```js
function spendComboCharge() {
  if (comboCharges <= 0 || gameState !== 'playing') return;
  comboCharges--;
  if (comboBankSpendMode === 0) { // Clear
    obstacles = obstacles.filter(o => Math.abs(o.x - snake[0].x) + Math.abs(o.y - snake[0].y) > 3 * TILE_SIZE);
    pushTransientRing(snake[0].x + TILE_SIZE/2, snake[0].y + TILE_SIZE/2, 3*TILE_SIZE, '#00FFFF', 400, 'ring', 3);
    spawnParticles(snake[0].x, snake[0].y, 20, '#00FFFF');
  } else if (comboBankSpendMode === 1) { // Magnet Pulse
    // NEW multi-step loop (per reviewer A2: existing magnet is 1-tile/tick at radius 4)
    // Instantly move all foods up to 6 tiles toward head, stopping at 1-tile gap
    [food, ...(extraFoods||[])].forEach(f => {
      if (!f || f.type === 'hunter' || f.type === 'bomb' || f.portal) return; // skip hunter+bomb+portal (per reviewer A3)
      const dx = ..., dy = ...; // wrap-aware delta
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist <= 6 * TILE_SIZE) {
        // snap to 1-tile gap (not onto head, to avoid auto-eat)
        ...move food to 1 tile away from head along shortest axis...
      }
    });
    pushTransientRing(snake[0].x + TILE_SIZE/2, snake[0].y + TILE_SIZE/2, 6*TILE_SIZE, '#FF00FF', 400, 'ring', 3);
  } else if (comboBankSpendMode === 2) { // Food Teleport
    if (food && food.type !== 'portal') { // per reviewer A4: don't move portal epics
      const ft = findFreeTile(snake[0].x, snake[0].y);
      if (ft) { food.x = ft.x; food.y = ft.y; }
    }
    pushTransientRing(snake[0].x + TILE_SIZE/2, snake[0].y + TILE_SIZE/2, 2*TILE_SIZE, '#FFFF00', 300, 'ring', 2);
  }
}
```

Magnet Pulse details (per reviewer A2/A3):
- NEW multi-step loop, NOT a reuse of the existing 1-tile/tick magnet. Instantly moves food to 1-tile gap from head.
- Skip hunter, bomb, and portal foods (consistent with existing hunter-skip).
- 1-tile gap (not onto head) to avoid auto-eating the wrong food.

Food Teleport details (per reviewer A4):
- Does NOT move portal epic foods (with linked twins) — skip if `food.type === 'portal'`.
- Uses `findFreeTile(snake[0].x, snake[0].y)` and reassigns `food.x/y`.

### HUD
In `drawGame()` margin section, immediately after `drawXPBar()` (~4856):
- Draw a small badge: `⚡[<mode>] x<charges>` (e.g., `⚡[Clear] x3`).
- When `comboCharges >= 5`: show "FULL".
- Wrap in `ctx.save()`/`ctx.restore()` (sub-function leak rule).
- Touch tap target: a ~40x40px area around the badge. Tap cycles mode, long-press spends.

### Snapshot
`comboCharges` and `comboBankSpendMode` as additive fields (no `SNAPSHOT_VERSION` bump). Restore: `comboCharges = data.comboCharges || 0; comboBankSpendMode = data.comboBankSpendMode || 0`.

### Zen mode
Charges accrue in Zen (comboCount increments there), but spend is inert (no obstacles to clear, no score to optimize). State this explicitly (per reviewer A.7).

### Serpentine synergy note
Clear's obstacle-clear overlaps with Serpentine's obstacle pass (per reviewer A3). This is a balance concern, not a code defect. The Clear is on-demand (costs a charge), Serpentine is reactive (saves on death). They coexist: Clear is proactive, Serpentine is reactive. Flag for playtest.

### Tests
- `test-v10.mjs`: Charges bank on all milestones, cap at 5. Spend decrements. Clear removes obstacles within 3 tiles. Magnet skips hunter+bomb+portal. Teleport skips portal. Snapshot round-trips charges.

---

## Feature C — Hazard Zones

### State
- `let hazards = []` — module-scope array, declared early (~204). Entries: `{cx, cy, radius, phase, lifeTimer, maxLife, expandTimer}`.
- `phase`: `'on'` or `'off'` (pulsing).
- `lifeTimer`: counts down from `maxLife`; hazard contracts as it approaches 0.
- Reset in `resetGame()` ONLY (per reviewer C6: hazards are Gauntlet-excluded, so `resetWaveState` is not needed — matches hoard precedent).

### MODE_CONFIG
Set `hazardsEnabled` explicitly on ALL 8 modes (per reviewer C4):
- Classic: `true`
- Time Attack: `true`
- Daily: `true`
- Snap: `true`
- Zen: `false` (chill mode)
- Walled: `false` (walls are the obstacle)
- Painter: `false` (coverage puzzle, hazards don't fit)
- Gauntlet: `false` (waves are the challenge)

### tickHazards()
Called from `updateGame()` after `tickBounty()` (~5672), gated on `MODE_CONFIG[gameMode].hazardsEnabled`:
1. Advance `lifeTimer` (decrement). Remove hazards with `lifeTimer <= 0`.
2. Toggle `phase` on a tick counter (e.g., on for 15 ticks, off for 10 ticks — the "pulse").
3. Expand `radius` over the first half of `lifeTimer`, contract over the second half (per reviewer C2: radius expands regardless of phase; lethality requires `phase === 'on'`; off-phase expansion is the escape window).
4. Spawn new hazards on a tick counter (like `HOARD_INTERVAL`). Cap at 2 concurrent (per reviewer C6). Min distance from snake head on spawn: 4 tiles (so a hazard doesn't ignite under the player with no reaction window).
5. No hazards for the first 15 seconds of a run (grace period for onboarding — per reviewer C1).

### checkPlayerDeath hazard check
Per reviewer C3: the existing `checkPlayerDeath` (~5883) has a specific death-interception order (Shield → Vampire/Phoenix → Serpentine → death). The hazard check needs a new top-level branch that reuses the save chain.

Insert AFTER the existing `checkCollision(wrappedHead)` block (which handles obstacle+self collision with the full save chain), as a parallel check:
```js
if (isHazardCollision(wrappedHead)) {
  // Same save chain: shield → vampire → serpentine? → death
  // Per reviewer C4: Serpentine does NOT pass hazards (hazards are distinct from obstacles)
  // So: shield → vampire/phoenix → death (no serpentine save)
  if (shieldActive) { consumeShield(); return false; }
  if (vampireActive) { ... vampire save ...; return false; }
  // NO serpentine save — hazards are not obstacles
  return true; // death
}
```
`isHazardCollision(wrappedHead)`: iterate `hazards[]`, return true if `wrappedHead` within `h.radius` AND `h.phase === 'on'` AND `hazardLingerCounter >= 1` (per reviewer C1: death on the 2nd consecutive lethal tick, giving 1 tick to escape — see below).

### Fair lethality (per reviewer C1 BLOCKER)
The "≥2 ticks" linger death is too fast at high speed. Fix:
- **Telegraph**: when a hazard's phase switches to 'on', the tile glows (visual warning) for 1 tick BEFORE becoming lethal. So the player sees the hazard ignite, then it becomes lethal on the next tick.
- **Linger**: `hazardLingerCounter` increments each tick the head is on an active+lethal hazard tile. Death on `hazardLingerCounter >= 1` (i.e., the 2nd consecutive lethal tick). This gives 1 full tick to escape at any speed.
- At max speed (~50ms/tick), 1 tick = 50ms — still tight but fair because the telegraph gives advance warning.

Actually, simpler and clearer: a hazard is lethal only when `phase === 'on'`. The telegraph is the off→on transition (the tile starts glowing during the last off-tick). The player has the entire off-phase to position. Death occurs if the head is on a lethal tile at the check tick — no linger counter needed. The "wait or race the off-phase" is the core mechanic. This is cleaner: if you're on a hazard when it's on, you die (shield/vampire save). If you're on it when it's off, you're safe. The telegraph is the visual pulse itself — you see it charging.

**Final decision**: No linger counter. Hazard is lethal when `phase === 'on'` and head is within `radius`. The pulse cycle (on for N ticks, off for M ticks) IS the telegraph. The off-phase is the escape window. This is fair because the player can see the pulse and time their movement. The 15-second grace period at run start ensures the player isn't hit before they learn the mechanic.

### drawHazards()
New helper, drawn between `drawObstacles()` and `drawFood()` in `drawGame()` (~5491). Per AGENTS.md draw order: grid → obstacles → **hazards** → food → snake.
- Radial gradient (blue/violet #6B3FA0 — CVD-safe default, per reviewer F2).
- Pulsing alpha when `phase === 'on'` (bright), dim when `phase === 'off'`.
- Calm mode: no pulse, steady tinted tile (per reviewer C5 — calm players still see the threat).
- Use play-area coordinates (post-translate, per reviewer C2).
- `ctx.save()`/`ctx.restore()` around the draw.

### generateFood collision rejection
Add `hazards` to `generateFood()`'s rejection set (~1792) — food doesn't spawn on active hazard tiles. Same pattern as `extraFoods`.

### generateHoardFood
Per reviewer C3: decide whether `generateHoardFood` rejects hazards. **Decision: does NOT reject** — hoard foods can spawn in active hazards, creating intentional emergent tension ("the hoard spawned inside a hazard rift — I had to time my dash"). This is the more interesting design choice. Document it.

### First-time toast
On first hazard spawn: `queueToast('⚠ Hazard! Don't linger on glowing rifts!', 3000)` — gated by `hasSeenHazard` flag.

### Snapshot
`hazards` as additive field (no `SNAPSHOT_VERSION` bump). Restore: `hazards = data.hazards || []`.

### Tests
- `test-v10.mjs`: Hazard spawns with grace period. Lethal only when phase==='on'. Shield saves from hazard death. Serpentine does NOT save (hazards aren't obstacles). Max 2 concurrent. generateFood rejects active hazards. generateHoardFood does NOT reject (intentional).

---

## Cross-Cutting Integration Checklist

### Reset sites
- `resetGame()`: `dirQueue = []`, `comboCharges = 0`, `comboBankSpendMode = 0`, `hazards = []`.
- `resetWaveState()`: `dirQueue = []`, `comboCharges = 0`, `comboBankSpendMode = 0`. (Hazards excluded from Gauntlet, so no reset needed — per reviewer C6.)

### Session-end hooks
- `finalizeSession()`: Daily Seed Leaderboard write (gated on `gameMode === 'daily'`).
- `checkAchievements()`: Meta-achievements second loop (inside `achievementsEnabled` guard).
- Combo Bank, Bomb Food, Hazard Zones: no session-end hooks (die with run, like bounty/hoard).

### Snapshot fields (all additive, no SNAPSHOT_VERSION bump)
- `dirQueue` (replaces `nextDirection`, backward-compat restore)
- `comboCharges`, `comboBankSpendMode`
- `hazards`

### Calm mode (all features gate intensity only, never logic)
- G: no visual change (logic only).
- F: no pulse in palette selector UI (static swatches).
- E: no visual change.
- D: no visual change.
- B: bomb fuse spark — calm mode shows steady glow, no spark animation.
- A: charge HUD — calm mode shows static badge, no pulse.
- C: hazard pulse — calm mode shows steady tint, no pulse. Lethality unchanged.

### AGENTS.md updates (post-implementation)
- Add v10 feature sections (Combo Bank, Bomb Food, Hazard Zones, Daily Seed Leaderboard, Meta-Achievements, Colorblind Palettes, Input Buffer Queue).
- Correct the stale Zen-Mode-Gap section (endZenSession DOES call checkAchievements/checkDailyCompletion in live code).

### First-time onboarding toasts
- Combo Bank: first charge banked → "⚡ Combo Charge banked! Press X to cycle, Z to spend."
- Bomb Food: first bomb spawn → "💣 Bomb food: blast obstacles & trim the rival!"
- Hazard Zones: first hazard spawn → "⚠ Hazard! Don't linger on glowing rifts!"
- All gated by `hasSeen*` flags (mirrors `hasSeenPortal` pattern).

### Test plan
New `test-v10.mjs` file:
1. Load smoke (no JS errors on load) — run first.
2. Input buffer queue: accepts 2, rejects 3rd, reverse-check, perpendicular works, v1 snapshot back-compat.
3. CVD palette: `foodColor()` returns correct color for each palette + off.
4. Meta-achievements: unlock after base achievements, +1 token per meta.
5. Daily leaderboard: stores top-5, sorts by score, new day = new entry.
6. Bomb food: weight distribution, eat skips score+XP, clears obstacles, trims rival, magnet skips, echo-brew coerces, Walled exclusion (both paths).
7. Combo Bank: charges bank on all milestones, cap 5, spend modes, Clear/Magnet/Teleport effects, snapshot round-trip.
8. Hazard Zones: grace period, lethal only when on, shield saves, serpentine doesn't, max 2 concurrent, generateFood rejects, generateHoardFood doesn't reject.

### Welcome overlay update
Add Combo Bank and Hazards to the welcome overlay's progression info panel so new players aren't surprised mid-run.