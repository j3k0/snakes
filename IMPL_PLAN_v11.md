# Snakes v11 — Implementation Plan

Incorporates review feedback from v11-review-1.md and v11-review-2.md. All line numbers verified against snake.html (8033 lines, commit cfaf4f0).

## Feature G — Input Buffer Visualization (~50 LOC, Risk 1)

**Goal:** Directional chevron at snake head when `dirQueue` has pending turns.

### Steps
1. **Declare no new state** — `dirQueue` (L261) already exists and is reset in `resetGame()`/`resetWaveState()`.
2. **In `drawSnake(t)` (L4898)** — after the head segment draws, before `drawEyes`:
   - Wrap in `ctx.save()`/`ctx.restore()`.
   - For each pending entry in `dirQueue` (max 2), draw a semi-transparent chevron at offset 4px/8px from `snake[0]` in the queued `{dx, dy}` direction.
   - Alpha 0.6, fixed high-contrast color `#FFEE88` (CVD-safe; NOT a food tier, so no `foodColor`).
   - Gate: `if (!calmModeEffective() && dirQueue.length > 0 && gameState === 'playing')`.
3. No snapshot change (reads existing `dirQueue` live). No reset change.

### Verify
- `node test-v10.mjs` — existing input buffer tests still pass (G doesn't modify the buffer, only reads it).
- Manual: queue 2 turns at high speed, observe chevrons appear and disappear as turns consume.

## Feature F — Save Corruption Auto-Recovery (~90 LOC, Risk 2)

**Goal:** Quarantine corrupted save keys instead of silently losing them.

### Steps
1. **Module-scope state** (near L225, the `saveManager` definition):
   - `const quarantinedKeys = new Set();`
2. **In `saveManager.getJSON(key, defaultVal, validator)` (L225)**:
   - On parse failure OR validator-fail: before returning `defaultVal`, copy the raw string to `localStorage['snake_corrupt_' + key]` and add `key` to `quarantinedKeys`.
   - **Re-quarantine guard**: `if (key.startsWith('snake_corrupt_')) return defaultVal;` — no recursive quarantine.
3. **In `restoreFromSnapshot(data, fromStorage)` (L2622)**:
   - Before `clearSnapshot()` on validation failure (L2624), call `quarantineKey(SNAPSHOT_KEY)` explicitly (the snapshot is read raw, not via `getJSON`).
   - Add a `quarantineKey(key)` helper that copies `localStorage[key]` to `localStorage['snake_corrupt_' + key]` and adds to `quarantinedKeys`.
4. **In `importSaveData(file)` (L1709)**:
   - On import, validate each key; quarantine failures with `queueToast` listing rejected keys.
5. **Load-time toast** (at the end of the `<script>` init, near L8030, after `requestAnimationFrame(animateVisuals)`):
   - `if (quarantinedKeys.size > 0) queueToast('⚠ Save data issue detected — backed up corrupted keys, settings reset.', 5000);`
6. **In `renderSettings()` (L1621)**:
   - Add a "Export Backed-Up Data" button (NOT "Restore" — corrupted data is untrustworthy) if any `snake_corrupt_*` keys exist. Button calls `exportSaveData()` (which already iterates all `snake_*` keys, including quarantined ones).

### Verify
- `node test-bugfixes.mjs` — "No JS errors on load" still passes (the quarantine logic is additive, no new top-level `let`/`const` before first use).
- Manual: inject a bad `snake_achievements` value in localStorage, reload, confirm toast + quarantine key appears + export includes it.

## Feature D — Daily Seed Determinism (~80 LOC, Risk 4)

**Goal:** Make daily mode fully deterministic by seeding `seedPrng` at run start. This fixes a latent bug (the daily leaderboard compares runs on different boards) and enables learnable hazard layouts for diary replay.

**Critical review finding (C1):** `seedPrng` is NEVER set in `startGame()` daily block (L2256–2294). `seededRandom()` (L689) falls back to `Math.random()` when `seedPrng` is null. Daily mode is currently fully non-deterministic — food, hazard, rival, and hunter spawns all use `Math.random()`. The daily leaderboard (v10 D) compares runs that should be on the same board but aren't.

### Steps
1. **In `startGame()` daily block (after L2293, before the streak increment)**:
   - `activeSeed = String(getDailySeed());`
   - `seedPrng = mulberry32(getDailySeed());`
   - This mirrors the seedField input handler pattern at L542–543.
   - **Scope note:** This makes ALL daily `seededRandom()` calls deterministic — food spawn, hazard spawn, rival AI, hunter flee. This is the CORRECT behavior for a daily challenge with a leaderboard. It's a larger behavioral surface than the original plan stated, hence risk 4.
2. **In `tickHazards()` spawn branch (L3386–3387)**:
   - Already calls `seededRandom()` for `hx`/`hy` — now deterministic because `seedPrng` is set.
   - Add `seedOffset = Math.floor(seededRandom() * HAZARD_ON_TICKS)` to the hazard object at L3390 for deterministic phase offset.
3. **Hazard snapshot** — add `seedOffset: h.seedOffset || 0` to:
   - `buildSnapshotObject()` hazard map (L2522-area).
   - `restoreFromSnapshot()` hazard map (L2667-area).
   - Additive, no `SNAPSHOT_VERSION` bump.
4. **Non-daily modes**: The `gameMode === 'daily'` gate in `startGame()` ensures only daily mode seeds `seedPrng`. Classic/TimeAttack/Snap keep `seedPrng = null` → `seededRandom()` → `Math.random()` (unchanged).
5. **Snapshot-restore caveat** (document, don't fix): `restoreFromSnapshot` (L2635–2641) does NOT snapshot the PRNG stream position — a resumed daily run diverges post-restore. Acceptable for save/resume (the run continues with fresh RNG draws); document in a comment.
6. **Reset**: `activeSeed`/`seedPrng` are already cleared in `resetGame()` (verify — grep `seedPrng = null` in resetGame).

### Verify
- `node test-v10.mjs` — daily mode tests still pass.
- New test: start daily game, record first 3 food positions. Restart with same date, confirm same 3 positions.
- `node test-quests.mjs` — quest determinism unaffected (quests use their own `mulberry32(hashString(...))` seed, independent of `seedPrng`).

## Feature A — Hazard Chain Bonus (~70 LOC, Risk 2)

**Goal:** Stacking score multiplier for eating adjacent to on-phase hazards.

### Steps
1. **Module-scope state** (near L205, the `hazards` block):
   - `let hazardChainStreak = 0;`
   - `let hazardAdjacentThisTick = false;`
2. **In `updateGame()` (L5959)** — at the TOP of the tick, before `tickHazards` call (L5964):
   - `hazardAdjacentThisTick = false;` — reset every tick so a non-adjacent tick never carries stale `true`.
3. **In `tickHazards()` (L3362)** — after the phase advancement loop, before the spawn logic:
   - If `MODE_CONFIG[gameMode].hazardsEnabled`: iterate `hazards[]`, check if any hazard has `phase === 'on'` AND `dist > h.radius && dist <= h.radius + TILE_SIZE` (Manhattan, fixed 1-tile ring around the lethal zone — "near but not in"). If so, set `hazardAdjacentThisTick = true`.
   - This is a fixed-ring adjacency, NOT scaling with `h.radius` (review H1 fix).
4. **In `addScore(amount)` (L1777)** — before the L1800 product:
   - `var hazardChainMult = (hazardAdjacentThisTick && hazardChainStreak > 0) ? (1 + Math.min(hazardChainStreak, 3) * 0.5) : 1;`
   - L1800 becomes: `score += Math.round(amount * multi * effectiveHoardMult * hazardChainMult);`
   - **No signature change** (review H2 fix) — all ~6 callers pass one arg.
   - **Global multiplier cap** (review H2 from reviewer 2): cap the combined product at ×4: `var totalMult = Math.min(multi * effectiveHoardMult * hazardChainMult, 4);` then `score += Math.round(amount * totalMult);`. This prevents ×7.5 compounding (hazard ×2.5 × hoard ×2 × pigment ×3).
5. **Eat block (after combo-bonus `addScore` at L6493, before `checkAchievements(score)` at L6542)**:
   - If `hazardAdjacentThisTick`: `hazardChainStreak++;` else `hazardChainStreak = 0;`
   - If `hazardChainStreak >= 1`: emit floater `×` + hazardChainMult via the existing floater pattern.
   - **Bomb eat branch (L6394–6418)**: bomb resets `hazardChainStreak = 0` (bomb is not a hazard-adjacent harvest — review M1 fix).
6. **In `checkPlayerDeath()` hazard branch (L6238)** — on hazard death: `hazardChainStreak = 0;` (before the death return).
7. **Reset**: `hazardChainStreak = 0` in `resetGame()` (L2055) AND `resetWaveState()` (L5419).
8. **Snapshot**: add `hazardChainStreak` to `buildSnapshotObject()` (L2493-area) and `restoreFromSnapshot()` (L2622-area). Additive, missing → 0.
9. **`drawHazards()` (L4508)** — when `hazardAdjacentThisTick && hazardChainStreak > 0`: draw a subtle gold ring around the adjacent hazard. Fixed hue `#FFD700` (CVD-safe, NOT a food tier). Wrap in `ctx.save()`/`ctx.restore()`.

### Verify
- New test: place snake adjacent to on-phase hazard, eat food, confirm multiplier applies. Eat non-adjacent, confirm reset.
- `node test-v10.mjs` — hazard tests still pass (A doesn't modify hazard collision, only adds scoring).

## Feature B — Combo Heat → Hazard Melt (~45 LOC, Risk 3)

**Goal:** At combo ≥ 10, entering an on-phase hazard downgrades lethal to combo-break.

### Steps
1. **In `checkPlayerDeath()` hazard branch (L6238)** — at the TOP of the branch, BEFORE the shield check (L6239):
   ```js
   if (comboCount >= 10) {
       comboCount = 0;
       lastComboMilestone = 0;
       hazardChainStreak = 0;  // review H3 fix: melt breaks the chain too
       lastDeathCause = 'Melted a hazard!';
       spawnParticles(wrappedHead.x, wrappedHead.y, 20, '#FFAA00');
       pushTransientRing(wrappedHead.x, wrappedHead.y, 40, '#FFAA00', 400, 'ring', 3);
       queueToast('🔥 Melted a hazard!');
       return false;
   }
   ```
   - **Melt is hazard-only** (review L3 fix): only the L6238 branch gets this. Self/wall/rival deaths at combo ≥ 10 are NOT melted (thematically correct — "melt" lava, not walls).
2. **Death save chain order (corrected, load-bearing)**:
   - Hazard death: `melt (combo ≥ 10) → shield → vampire → streak charge (Feature E) → death`
   - Collision death: `shield → vampire → streak charge (Feature E) → serpentine → death`
   - Serpentine is ABSENT from the hazard path (hazards aren't obstacles — codebase comment at L6238 confirms).
3. **`comboHeatColor(combo)` (L4891)** — extend the body-tint helper:
   - Add `combo >= 10` branch returning a brighter orange-red rgba (alpha cap 0.7 vs 0.25 ceiling).
   - Applied at L5011–5014 (body tint).
4. **Inline `haloColor` ladder (L4924)** — extend the head-halo inline color:
   - Add `comboCount >= 10 ? '#FF6600'` rung between the existing ≥7 (`'#FF8800'`) and ≥15 (`'#FF4400'`).
   - Raise `haloAlpha` cap (L4918) from 0.5 to 0.7 when `comboCount >= 10`.
   - Both edits are inside the existing `ctx.save()`/`ctx.restore()` at L4922–4930.
5. **No new state, no snapshot change** (reads existing `comboCount`).

### Verify
- New test: set `comboCount = 10`, move snake onto on-phase hazard, confirm no death + combo reset to 0 + `hazardChainStreak` reset.
- Set `comboCount = 9`, confirm hazard death still lethal.

## Feature E — Streak Multiplier Ladder (~170 LOC, Risk 4)

**Goal:** Streak-scaled XP multiplier + bankable death insurance charge.

**Critical review finding (C2/C3):** The streak charge consume MUST be in `checkPlayerDeath()`, NOT `gameOver()`. `gameOver()` runs after death is finalized (snapshot cleared, XP awarded, leaderboard written). Every other death save (shield, vampire, serpentine) operates by returning `false` from `checkPlayerDeath()` BEFORE `gameOver()` is called.

### Steps
1. **Module-scope state** (near L741, progression state):
   - `let streakCharges = saveManager.getInt('snake_streak_charges', 0);`
2. **In `startGame()` (after L2296, after streak read)**:
   - `streakCharges = saveManager.getInt('snake_streak_charges', 0);` — re-read on each run start so a charge spent in a prior run is reflected.
3. **In `awardXP()` (L6879)** — apply streak multiplier:
   - `const streakCount = saveManager.getInt('snake_streak_count', 0);`
   - `const streakMult = 1 + Math.min(0.30, streakCount * 0.01);` — +1% per streak day, cap +30%.
   - Multiply into the XP gained before the overcharge loop (L6885).
4. **Threshold grant** — extend `STREAK_UNLOCKS` loop (L2297–2306):
   - `STREAK_CHARGE_DAYS = [7, 14, 30]` — on daily game start, if streak hits a threshold AND not already granted this cycle, increment `streakCharges` and `saveManager.set('snake_streak_charges', streakCharges)`.
   - Track last-granted threshold per streak cycle via a `snake_streak_charge_granted` save key (store the threshold index, reset when streak resets to 0).
5. **Streak charge consume — in `checkPlayerDeath()`, NOT `gameOver()`** (review C2/C3 fix):
   - Add a helper `tryStreakChargeSave(wrappedHead)` invoked after the vampire save in EACH lethal branch:
     - Hazard path (L6238-area): after vampire (L6246), before the death return.
     - Collision path (L6187-area): after vampire (L6201), before serpentine (L6206).
   - Helper: `if (streakCharges > 0) { streakCharges--; saveManager.set('snake_streak_charges', streakCharges); queueToast('🛡 Streak charge consumed!'); reposition head to free tile (Phoenix-style, like L6223–6230); return false; } return true;`
   - **Auto-fire design decision** (review H4 response): auto-fire with toast, no prompt. The charge is banked for exactly this purpose — spending it IS the point. A prompt mid-death is bad UX. The player earns charges by maintaining a streak; the insurance auto-activates on lethal hits. If the player wants to "save" a charge, they avoid dying (which is the skill expression).
6. **Death save chain order (load-bearing, corrected)**:
   - Hazard death: `melt (combo ≥ 10) → shield → vampire → streak charge → death`
   - Collision death: `shield → vampire → streak charge → serpentine → death`
   - Streak charge is AFTER per-run saves (shield, vampire), BEFORE serpentine (obstacle-specific). This preserves per-run resources first.
7. **Snapshot**: add `streakCharges` to `buildSnapshotObject()` (L2493-area) and `restoreFromSnapshot()` (L2622-area). Additive, missing → 0. NOTE: `streakCharges` is a persistent meta-resource, but the snapshot stores the current run's value so a resume reflects the correct charge count. The save key `snake_streak_charges` is the persistent source; the snapshot field is the in-run copy.
8. **Reset**: `streakCharges` is NOT reset in `resetGame()`/`resetWaveState()` (persistent). It's re-read from `saveManager` in `startGame()`.
9. **Display**: streak block at L4335–4340 (inside `drawOverlay`, idle screen) — add `🛡×` + `streakCharges` glyph. Also in `updateMenuFooter()` (L2205) streak info.

### Verify
- New test: set `streakCharges = 1`, trigger death, confirm charge consumed + run continues + `saveManager` decremented.
- Set `streakCharges = 0`, trigger death, confirm normal death.
- New test: set streak = 15, confirm `awardXP` applies 1.15× multiplier.

## Feature C — Hoard Pigment Rush (~75 LOC, Risk 3)

**Goal:** Eating all 4 hoard foods before timer expires triggers a 5s ×3 score climax.

### Steps
1. **Module-scope state** (near L204, hoard state):
   - `let hoardPigmentCount = 0;`
   - `let pigmentRushTimer = 0;`
   - `let pigmentRushActive = false;`
2. **In `activateHoard()` (L3416)** — tag the 4 hoard foods with `pigment: true` when pushing to `extraFoods` (L3424, via `generateHoardFood()` return or post-push iteration).
3. **In `extraFoods` eat block (L6589)** — on eating an `ef.pigment` food:
   - `hoardPigmentCount++;`
   - If `hoardPigmentCount >= 4`: set `pigmentRushActive = true`, `pigmentRushTimer = 300` (5s × 60fps), extend rival `respawnTimer += 3000`, `queueToast('🎨 Pigment Rush! ×3!')`, `queueGameEffect('flash')`.
4. **In `addScore(amount)` (L1777)** — the `effectiveHoardMult` path (L1796–1800):
   - When `pigmentRushActive`: the hoard multiplier becomes ×3 (replaces the ×2, not stacks — rush IS the climax).
   - When `golden_food` mutator active AND `pigmentRushActive`: cap at ×2 (so Golden Age + Rush = ×4 max, not ×6 — mirrors existing hoard+golden cap at L1797).
   - The global multiplier cap from Feature A (×4 on `multi * effectiveHoardMult * hazardChainMult`) applies here too.
5. **`pigmentRushTimer` decay — in `updateGame()` tick loop (L5970–5973, the `hoardActive` block)** (review H1 fix — NOT in `animateVisuals`):
   - `if (pigmentRushActive) { pigmentRushTimer--; if (pigmentRushTimer <= 0) { pigmentRushActive = false; } }`
   - This is game-logic state (affects `addScore`), so it MUST decay in the tick loop, not rAF.
6. **In `endHoard()` (L3429)** — clear `hoardPigmentCount`. Do NOT clear `pigmentRushTimer`/`pigmentRushActive` if rush is active (the rush is a reward that outlives the hoard — design choice so triggering the rush at the last second isn't punished).
7. **`extraFoods` snapshot** (review M3 fix) — add `pigment: ef.pigment || false` to:
   - `buildSnapshotObject()` `extraFoods` map (L2508).
   - `restoreFromSnapshot()` `extraFoods` map (L2656).
   - Additive, no version bump.
8. **Hoard state snapshot** — add `hoardPigmentCount`, `pigmentRushTimer`, `pigmentRushActive` to:
   - `buildSnapshotObject()` (L2583-area, alongside existing hoard fields).
   - `restoreFromSnapshot()` (L2722-area).
   - Additive, missing → 0/false.
9. **Reset**: `resetGame()` (L2055) only (E is Gauntlet-excluded — matching hoard precedent). Clear `hoardPigmentCount = 0`, `pigmentRushTimer = 0`, `pigmentRushActive = false`.
10. **`drawGame()` hoard tint (L5219)** — when `pigmentRushActive`: stronger gold tint (alpha 0.12, or 0.06 in calm mode vs the normal 0.06/0.03).
11. **`hasSeenPigmentRush`** first-time toast (mirrors `hasSeenPortal`/`hasSeenBomb`). Save key: `snake_has_seen_pigment_rush`.

### Verify
- New test: trigger hoard, eat all 4 pigment foods, confirm `pigmentRushActive = true` + ×3 multiplier.
- Confirm `pigmentRushTimer` decays in tick loop (not rAF) — pause game, confirm timer pauses.
- `node test-v10.mjs` — hoard tests still pass.

## Cross-Feature Interactions (Load-Bearing)

### Death Save Chain (Final Order)
- **Hazard death path** (L6238): `melt (combo ≥ 10, Feature B) → shield → vampire → streak charge (Feature E) → death`
- **Collision death path** (L6187): `shield → vampire → streak charge (Feature E) → serpentine → death`
- Serpentine is ABSENT from the hazard path (hazards aren't obstacles).
- Melt is hazard-only (not collision/wall/rival).

### addScore Multiplier Path (Final Order)
- L1800: `score += Math.round(amount * multi * effectiveHoardMult * hazardChainMult)` with a global cap `Math.min(multi * effectiveHoardMult * hazardChainMult, 4)`.
- `multi` = pinnacle/overcharge multiplier (internal to `addScore`).
- `effectiveHoardMult` = hoard ×2, or pigment rush ×3 (Feature C), capped at ×2 with golden_food.
- `hazardChainMult` = ×1.5–×2.5 (Feature A), only when hazard-adjacent.
- Global cap ×4 prevents ×7.5 compounding.

### Implementation Order (Revised)
1. **G. Input Buffer Visualization** (~50 LOC) — pure rendering, self-contained.
2. **F. Save Corruption Auto-Recovery** (~90 LOC) — robustness layer, protects snapshot engine before new fields added.
3. **D. Daily Seed Determinism** (~80 LOC) — seed wiring in `startGame()`. After F so the quarantine layer covers the new daily-seed save keys.
4. **A. Hazard Chain Bonus** (~70 LOC) — `addScore` multiplier + adjacency check. After D so daily hazard determinism is stable.
5. **B. Combo Heat → Hazard Melt** (~45 LOC) — death-path branch. After A so hazard adjacency/death paths are stable. Explicitly resets `hazardChainStreak` in the melt branch.
6. **E. Streak Multiplier Ladder** (~170 LOC) — XP multiplier + death-save gate. After B so the death save chain order is settled (melt → shield → vampire → streak → serpentine).
7. **C. Hoard Pigment Rush** (~75 LOC) — hoard internal objective. Last so `extraFoods` eat block and `addScore` multiplier path are stable from A.

Total: ~580 LOC (revised from ~705 after D's reframe and LOC adjustments).

## Test Plan

After all 7 features:
1. `node test-bugfixes.mjs` — "No JS errors on load" (first smoke check).
2. `node test-v10.mjs` — all 12 v10 tests pass (regression).
3. `node test-v9.mjs`, `node test-evolution.mjs`, `node test-feature-d.mjs`, `node test-quests.mjs` — all pass (regression).
4. New `test-v11.mjs` covering:
   - G: chevron renders when `dirQueue.length > 0`, hidden in calm mode.
   - F: corrupted key quarantined, toast on load, export includes quarantined keys.
   - D: daily mode food/hazard positions reproducible across restarts with same date.
   - A: hazard-adjacent eat applies multiplier, non-adjacent resets, bomb resets, global cap ×4.
   - B: combo ≥ 10 melts hazard (no death, combo reset), combo < 10 lethal, melt resets `hazardChainStreak`.
   - E: streak multiplier in `awardXP`, charge consume in `checkPlayerDeath` (not `gameOver`), charge persists across runs.
   - C: 4 pigment foods trigger rush, ×3 multiplier, timer decays in tick loop, `extraFoods` snapshot includes `pigment` field.

## Architecture Invariant Compliance (Verified)

| Invariant | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| `gameState` single source of truth | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Dual render loop / rAF read-only | ✓ | ✓ | ✓ (timer in tick loop) | ✓ | ✓ | ✓ | ✓ |
| Module scope (let/const lexical) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Canvas save/restore | ✓ (drawHazards) | ✓ (halo existing) | ✓ (tint is fillRect) | ✓ | ✓ (streak HUD) | ✓ (DOM button) | ✓ (drawSnake) |
| FOOD_TIERS weights sum to 1.0 | ✓ (no tier) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Parallel session-end hooks | ✓ (none needed) | ✓ (none needed) | ✓ (none needed) | ✓ | ✓ (checkPlayerDeath, not gameOver) | ✓ (load-time) | ✓ (none needed) |
| Reset sites (resetGame AND resetWaveState) | ✓ (both) | ✓ (no new state) | ✓ (resetGame only — hoard-excluded) | ✓ (seedPrng in resetGame) | ✓ (persistent, no reset) | ✓ | ✓ (dirQueue existing) |
| Snapshot additive (no version bump) | ✓ (hazardChainStreak) | ✓ (no change) | ✓ (pigment + hoard fields) | ✓ (seedOffset) | ✓ (streakCharges) | ✓ (no change) | ✓ (no change) |
| Cross-hide panel contract | ✓ (no panel) | ✓ | ✓ | ✓ | ✓ | ✓ (no panel) | ✓ (canvas only) |
| foodColor() at tier.color reads | ✓ (fixed hue) | ✓ (fixed hue) | ✓ (no tier reads) | ✓ | ✓ | ✓ | ✓ (fixed hue) |
| Death save chain order | ✓ (resets on hazard death) | ✓ (melt before shield) | ✓ | ✓ | ✓ (streak after vampire, before serpentine) | ✓ | ✓ |