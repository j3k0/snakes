# Implementation Plan v7 Review — Critical Issues

## Summary

The v7 implementation plan is well-structured and mostly accurate, but contains several line-number errors, missing integration steps, and one architectural misunderstanding that would cause bugs. Below are numbered issues ordered by severity.

---

## 1. LINE NUMBER ERRORS

### 1.1. `drawGame` is NOT at line 3849 as a standalone function

**Plan says**: "drawGame(t) at ~L3849" and treats it as a top-level function.

**Reality**: `drawGame` is declared at line 3849 **inside the `animateVisuals` function** (which starts at line 2514). It is a nested function, not a top-level one. The indentation at line 3849 is 16 spaces — it's deeply nested inside `animateVisuals`.

**Impact**: Any feature that adds code to `drawGame` must be placed within `animateVisuals`, not at the top level. The plan's "Integration Checklist" entries that say "Add to drawGame(t)" need to specify the correct nesting context.

**Correct location**: `drawGame` is at line 3849, nested inside `animateVisuals` (L2514–L2703). The closing `}` of `drawGame` is at line 4019, and `animateVisuals` closes at line 2703.

### 1.2. `updateGame` line numbers are correct but its internal structure matters

**Plan says**: `updateGame` at ~L4021.

**Reality**: Confirmed at line 4021. However, `updateGame` contains nested functions `handleComboMilestone` (L4025–L4052) and `checkPlayerDeath` (L4221–L4305). The plan correctly references these but should note they are closure-scoped inside `updateGame`.

### 1.3. `resetGame` line number is correct

**Plan says**: ~L1320. **Reality**: Confirmed at line 1320.

### 1.4. `gameOver` line number is correct

**Plan says**: ~L1911. **Reality**: Confirmed at line 1911.

### 1.5. `endZenSession` line number is correct

**Plan says**: ~L1970. **Reality**: Confirmed at line 1970.

### 1.6. `startGame` line number is correct

**Plan says**: ~L1494. **Reality**: Confirmed at line 1494.

### 1.7. `generateFood` line number is correct

**Plan says**: ~L1210. **Reality**: Confirmed at line 1210.

### 1.8. `drawFood` line number is correct

**Plan says**: ~L2892. **Reality**: Confirmed at line 2892.

### 1.9. `drawSnake` line number is correct

**Plan says**: ~L3105. **Reality**: Confirmed at line 3105.

### 1.10. `getEffectiveSpeed` line number is correct

**Plan says**: ~L230. **Reality**: Confirmed at line 230.

### 1.11. `animateVisuals` line number is correct

**Plan says**: ~L2514. **Reality**: Confirmed at line 2514.

### 1.12. `checkCollision` line number is correct

**Plan says**: ~L1601. **Reality**: Confirmed at line 1601.

### 1.13. `drawOverlay` line number is correct

**Plan says**: ~L2705. **Reality**: Confirmed at line 2705.

### 1.14. `drawGrid` line number is correct

**Plan says**: ~L2859. **Reality**: Confirmed at line 2859.

### 1.15. `drawPaintGrid` line number is correct

**Plan says**: ~L3439. **Reality**: Confirmed at line 3439.

### 1.16. `drawTrails` line number is correct

**Plan says**: ~L3244. **Reality**: Confirmed at line 3244.

### 1.17. `drawSlowMoTint` line number is correct

**Plan says**: ~L3338. **Reality**: Confirmed at line 3338.

### 1.18. `scheduleNextTick` line number is correct

**Plan says**: ~L218. **Reality**: Confirmed at line 218.

### 1.19. `parseChallengeUrl` line number is correct

**Plan says**: ~L406. **Reality**: Confirmed at line 406.

### 1.20. `flashOverlay` declaration is correct

**Plan says**: ~L242. **Reality**: Confirmed at line 242.

### 1.21. `comboCount` declaration is correct

**Plan says**: ~L553. **Reality**: Confirmed at line 553.

### 1.22. `activeBrews` / `brewUsageFlags` declarations are correct

**Plan says**: ~L742–743. **Reality**: Confirmed at lines 742–743.

### 1.23. `activeMutators` declaration is correct

**Plan says**: ~L680. **Reality**: Confirmed at line 680.

### 1.24. `activeResonance` declaration is correct

**Plan says**: ~L662. **Reality**: Confirmed at line 662.

### 1.25. `BREWS_CONFIG` location is correct

**Plan says**: ~L731. **Reality**: Confirmed at line 731.

### 1.26. `renderTime` declaration is correct

**Plan says**: ~L527. **Reality**: Confirmed at line 527.

### 1.27. `snapLevelUpFlash` declaration is correct

**Plan says**: ~L533. **Reality**: Confirmed at line 533.

### 1.28. `sessionTimeAlive` declaration is correct

**Plan says**: ~L561. **Reality**: Confirmed at line 561.

---

## 2. INTEGRATION COMPLETENESS ISSUES

### 2.1. `flashOverlay` rendering is in `animateVisuals`, NOT in `drawGame`

**Critical architectural fact**: The `flashOverlay` is rendered at lines 2666–2674 inside `animateVisuals` (after `drawGame` returns), NOT inside `drawGame`. The comment at line 2666 says "Flash overlay — renders last on top of everything (AGENTS.md)".

**Impact**: Any feature that adds a new flash overlay color/type must ensure:
- The `flashOverlay` object is set in `updateGame` (or wherever the trigger happens)
- The decay logic at lines 2552–2555 in `animateVisuals` handles it
- The rendering at lines 2666–2674 handles the new color/type

The plan's integration checklists should explicitly call out the `animateVisuals` decay block (L2552–2555) and render block (L2666–2674) as touch points, not just `drawGame`.

### 2.2. `flashOverlay` is cleared in 3 places, not just `resetGame`

The plan mentions clearing `flashOverlay` in `resetGame` (L1344). But it's also cleared in:
- `resetWaveState` at line 3551 (gauntlet wave transitions)
- `animateVisuals` decay at line 2554 (when alpha reaches 0)

Any feature that sets `flashOverlay` must ensure it doesn't conflict with the priority system (lines 2560, 4030, 4420, 4476). The priority levels are: `'normal'`, `'high'`, `'critical'`. A `'critical'` overlay cannot be overwritten by lower-priority ones.

### 2.3. `comboCount` reset sites

The plan references `comboCount = 0` in `resetGame` (L1324) and `resetWaveState` (L3541). But there's also a reset at line 4390 inside `updateGame` when the combo timer expires. Any feature that modifies combo behavior must account for all three reset sites.

### 2.4. `sessionTimeAlive` is computed in `finalizeSession`, not updated per-tick

The plan may assume `sessionTimeAlive` is a running counter. It is NOT. It's computed once at session end in `finalizeSession` (line 1894):
```js
sessionTimeAlive = Date.now() - sessionStartTime - sessionPausedTime;
```

Any feature that needs live elapsed time during gameplay should use `Date.now() - sessionStartTime - sessionPausedTime` directly, not `sessionTimeAlive`.

### 2.5. `drawGame` is called from MANY places, not just `animateVisuals`

The plan's integration checklist should note that `drawGame(1)` is called from:
- `resetGame` (L1426)
- `startGame` (L1597)
- `gameOver` (L1964)
- `resumeGame` (L1888)
- Key handler for mode changes, pause, draft, gauntlet picks (L5113, L5118, L5123, L5128, L5134, L5139, L5146, L5155, L5160, L5180, L5207, L5234, L5280, L5291, L5300, L5323, L5357, L5413, L5488, L5494, L5511, L5524, L5530, L5539, L5643, L5650, L5660, L5661, L5716)

Any visual feature added to `drawGame` must work correctly when called with `t=1` (snapshot mode) from these many call sites.

### 2.6. `food2` (Echo Brew) is already implemented

The plan may reference "Echo Brew" as a new feature, but it's already fully implemented in v6:
- Declaration: line 178
- Spawn logic: lines 4510–4522
- Eat logic: lines 4525–4537
- Render logic: lines 3016–3030
- Reset: line 1417

If the plan intends to modify Echo Brew behavior, it must account for all these existing touch points.

---

## 3. MISSING STEPS

### 3.1. No mention of `resetWaveState` for gauntlet-mode features

If any v7 feature adds per-run state variables, they MUST also be reset in `resetWaveState` (L3527–L3571), not just `resetGame`. The gauntlet mode resets state between waves via `resetWaveState`, and missing a variable there causes state leakage between waves.

Currently `resetWaveState` resets: `comboCount`, `flashOverlay`, `shakeTimer`, `eatAnimTimer`, `speedBoostCounter`, `shieldActive`, `magnetActive`, `slowMoActive`, `powerUpTimer`, `powerUpType`, `powerUpPickup`, `powerUpSpawnCounter`, `powerUpDespawnCounter`, `rivals`, `obstacles`, `particles`, `sessionFoodEaten`, `sessionFoodTypes`, `sessionSpeedFood`, `sessionBonusFood`, `gameTick`, `lastEatTime`, `lastComboMilestone`, `touchIndicatorTimer`.

Any new per-run variable must be added to this list.

### 3.2. No mention of `startGame` brew initialization for new brew features

If adding new brew types, the initialization block at lines 1566–1572 in `startGame` must be updated:
```js
activeBrews = equippedBrews.slice();
brewUsageFlags = {};
for (var bi = 0; bi < activeBrews.length; bi++) { brewUsageFlags[activeBrews[bi] + 'Used'] = false; }
brewUsageFlags.echoCount = 0;
brewUsageFlags.combustionAccum = 0;
brewUsageFlags.combRemaining = 0;
```

New brews with usage flags need their flags initialized here.

### 3.3. No mention of `finalizeSession` for session stat tracking

If any feature adds new session stats, they must be saved in `finalizeSession` (L1893–L1902) which writes to `saveAllState()`. The plan should call out this integration point.

### 3.4. No mention of the `gameOver` vs `endZenSession` duality

`gameOver` (L1911) and `endZenSession` (L1970) are separate death handlers. Any feature that adds death-time behavior (particles, save, achievement checks) must be added to BOTH functions, or at minimum verified that the zen path doesn't miss it.

Currently `endZenSession` does NOT:
- Award XP via `awardXP()` (zen has flat XP per food)
- Play death particles
- Set `shakeTimer`
- Call `vibrate(30)`
- Play `gameover` sound

If a feature adds death effects, the plan must specify whether they apply to zen mode.

### 3.5. No mention of `checkDailyCompletion` context object

Both `gameOver` (L1928–L1936) and `endZenSession` (L1978–L1986) pass a context object to `checkDailyCompletion`. If a feature adds new session stats that daily challenges check, this context object must be extended in both places.

---

## 4. ORDERING ISSUES

### 4.1. `drawGame` is called BEFORE `startGame` returns in the Enter-key handler

At line 5246–5248:
```js
resetGame();
startGame();  // startGame calls drawGame(1) at L1597 internally
visualDirty = true;
```

But at line 5229–5235 (draft mode path):
```js
resetGame();
draftOptions = pickDraftOptions(MUTATOR_DRAFT_SIZE);
draftSelection = 0;
draftScreenVisible = true;
drawGame(1);  // explicit call — startGame is NOT called here
```

Any feature that assumes `startGame` always runs before the first `drawGame` will break for the draft-mode path, where `drawGame` is called without `startGame`.

### 4.2. `updateGame` mutator logic runs BEFORE movement

In `updateGame` (L4021+), the mutator logic (gravity, phase_shift, hunger_clock, shrink_zone, chaos_seed, resonance) runs at lines 4087–4154, BEFORE the snake moves (the movement happens via `snake.unshift(wrappedHead)` at L4314, but `wrappedHead` is computed earlier around L4160–4300 area).

The plan should verify that any new mutator that affects movement direction is placed in the correct order relative to the direction-change logic.

### 4.3. `flashOverlay` decay in `animateVisuals` runs BEFORE `drawGame`

In `animateVisuals`:
1. Flash overlay decay (L2552–2555)
2. Level-up flash overlay set (L2557–2563)
3. `drawGame(t)` called (L2578)
4. Flash overlay RENDERED (L2666–2674) — AFTER `drawGame` returns

This means: if a feature sets `flashOverlay` inside `drawGame`, it will be rendered in the same frame (because rendering happens after `drawGame` returns). But if it sets `flashOverlay` inside `updateGame`, the decay in the NEXT `animateVisuals` frame will reduce alpha before rendering. This is the existing pattern and works correctly, but the plan should be aware of this ordering.

---

## 5. POTENTIAL BUGS

### 5.1. `flashOverlay` priority system can suppress intended effects

The priority system at lines 2560, 4030, 4420 means:
- A `'critical'` overlay (level-up) blocks ALL other overlays
- A `'high'` overlay (100% coverage, combo ≥10) blocks `'normal'` overlays
- A `'normal'` overlay (food eat, resonance) blocks nothing but can be blocked

If a new feature sets a `'normal'` flash, it may never appear if a `'high'` or `'critical'` overlay is active. The plan should specify the intended priority for any new flash effects.

### 5.2. `flashOverlay` is set to `null` when alpha decays to 0 (L2554)

But the level-up flash block (L2557–2563) can set it again immediately after. If a feature sets `flashOverlay` and expects it to persist for a specific duration, the decay rate (`delta * 0.004`, i.e., ~0.07 per frame at 60fps) means a 0.4 alpha overlay lasts ~5.7 seconds. The plan should verify intended durations.

### 5.3. `comboCount` reset at L4390 resets `lastComboMilestone` too

When the combo timer expires (3 seconds without eating), both `comboCount` and `lastComboMilestone` are reset to 0. This means if a feature adds a new combo milestone, it will correctly re-trigger when the combo builds up again. This is correct behavior but the plan should be aware of it.

### 5.4. `snakeGrew` flag affects head interpolation in `drawSnake`

At line 3121, when `snakeGrew` is true, the head snaps to its actual position. This flag is set at line 4368 (when food is eaten) and cleared at line 4157 (at the start of the next tick's movement phase). Any feature that modifies the eat flow must ensure `snakeGrew` is set correctly, or the head will appear to lag behind.

### 5.5. `prevSnake` is captured at line 4156, AFTER death checks

This means if the snake dies, `prevSnake` is never updated for that tick. This is correct — death rendering uses the last known positions. But any feature that adds post-death visual effects relying on `prevSnake` should be aware it reflects the pre-death state.

---

## 6. COMPATIBILITY WITH EXISTING CODE

### 6.1. IIFE / closure scope

The entire game code is wrapped in a single IIFE (the file is one big `(function() { ... })()`). All variables declared with `let`/`var` at the top level of the IIFE are accessible to all functions within. There is no module system, no import/export.

**Implication**: New variables declared at the top level (around L177–L680) are automatically available everywhere. New functions declared at the top level are callable from anywhere. This is the existing pattern and the plan should follow it.

### 6.2. Nested function pattern

`updateGame` contains nested functions `handleComboMilestone` and `checkPlayerDeath` (declared inside `updateGame`'s body). These have closure access to `updateGame`'s locals. `drawGame` is nested inside `animateVisuals`. `drawDraftScreen`, `drawFloaters`, `drawGauntletCompleteScreen`, etc. are top-level functions.

**Implication**: If a feature needs a new helper function that accesses `updateGame`'s locals (like `wrappedHead`, `tail`, `skipSelfCollision`), it should be declared inside `updateGame` following the existing pattern. If it only needs top-level variables, it can be a top-level function.

### 6.3. `var` vs `let` usage

The codebase uses both `var` and `let` inconsistently. Top-level declarations use `let` (lines 177–680). Some nested functions use `var` (e.g., `handleComboMilestone` at L4028). The plan should follow the surrounding convention: use `let` for new top-level declarations, `var` or `let` for nested based on what the enclosing function uses.

### 6.4. `food2` already exists

The variable `food2` (line 178) is already used for Echo Brew duplicate food. Any feature that needs a second food item must either reuse `food2` (if compatible) or use a different variable name.

### 6.5. `activeBrews` and `brewUsageFlags` are already established patterns

New brew types should follow the existing pattern:
- Add to `BREWS_CONFIG` array (L731–L739)
- Initialize usage flags in `startGame` (L1566–L1572)
- Check and act in `updateGame` (like echo at L4510–4522, combustion at L4439–4442, vampire at L4231–4237, etc.)
- Render effects in `drawFood` or `drawGame` as needed

### 6.6. `activeMutators` and `activeResonance` are already established

New mutators should follow the existing pattern:
- Add to `MUTATOR_DEFS`
- Check in `updateGame`'s mutator logic block (L4087–L4154)
- Add resonance detection in `detectResonance` if applicable
- Render indicators in `drawGame` (L3944–L3969)

---

## 7. SUMMARY OF RECOMMENDATIONS

1. **Fix the `drawGame` nesting misconception**: The plan must acknowledge that `drawGame` is nested inside `animateVisuals`, not a top-level function. All "add to drawGame" instructions must specify the correct nesting.

2. **Add `resetWaveState` to all integration checklists**: Any new per-run state variable must be reset in `resetWaveState` (L3527), not just `resetGame` (L1320).

3. **Add `startGame` brew init to all brew-related checklists**: New brew usage flags must be initialized at L1566–L1572.

4. **Add `finalizeSession` to checklists for new session stats**: New stats must be saved via `saveAllState()` in `finalizeSession` (L1893).

5. **Add `endZenSession` to checklists for death-time behavior**: Any death effect must be added to both `gameOver` (L1911) AND `endZenSession` (L1970) unless explicitly zen-only or non-zen-only.

6. **Add `checkDailyCompletion` context object to checklists**: New session stats needed by daily challenges must be added to the context objects at L1928–L1936 and L1978–L1986.

7. **Document `flashOverlay` priority system**: Any new flash effect must specify its priority level and be aware that higher-priority overlays can suppress it.

8. **Verify `flashOverlay` touch points**: The plan should list all three touch points: set (in `updateGame`), decay (L2552–2555 in `animateVisuals`), and render (L2666–2674 in `animateVisuals`).

9. **Account for `snakeGrew` flag**: Any feature modifying the eat flow must ensure `snakeGrew` is set correctly at L4368.

10. **Verify `comboCount` reset coverage**: Any combo-related feature must account for resets at L1324 (`resetGame`), L3541 (`resetWaveState`), and L4390 (`updateGame` timeout).
