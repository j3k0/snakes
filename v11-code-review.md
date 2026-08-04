# v11 Code Review — snake.html against IMPL_PLAN_v11.md

Reviewer: ReviewV11CodeB. All line numbers from `snake.html` (8266 lines). Verified by grep + targeted reads.

## Checklist Verification

### 1. Death save chain order — PASS (with one nuance)

**Hazard path** (L6420–6453): `melt (combo ≥ 10, L6425) → shield (L6435) → vampire (L6442) → streak (L6450) → death (L6453)`. ✓ Matches plan exactly. Serpentine correctly ABSENT (hazards aren't obstacles). Melt is before shield. ✓

**Collision path** (L6365–6395): `shield (L6366) → vampire (L6374) → streak (L6382) → serpentine (L6386) → death (L6395)`. ✓ Streak after vampire, before serpentine. ✓

**Wall path** (L6397–6416): `phoenix (L6401) → streak (L6414) → death`. No shield/vampire — walls aren't collisions or hazards, so the existing design only offers Phoenix + streak. Consistent with pre-v11 code; not in the checklist's 4-path enumeration but correct (wall deaths never offered shield/vampire historically).

**Rival path** (L6474–6498): `shield (L6475) → phoenix (L6484) → streak (L6497) → death`. ✓

### 2. addScore global cap — PASS
L1830–1832: `var hazardChainMult = ... ; var totalMult = Math.min(multi * effectiveHoardMult * hazardChainMult, 4); score += Math.round(amount * totalMult);` ✓ Exact match to plan's `Math.min(multi * effectiveHoardMult * hazardChainMult, 4)`.

### 3. Melt branch resets hazardChainStreak — PASS
L6428: `hazardChainStreak = 0;` inside the `comboCount >= 10` melt branch (L6425–6433). ✓

### 4. extraFoods snapshot includes pigment — PASS
- Build L2572: `... portalLink: ef.portalLink || null, pigment: ef.pigment || false };`
- Restore L2726: `... portalLink: ef.portalLink || null, pigment: ef.pigment || false };`
Both build and restore include `ef.pigment || false`. ✓

### 5. resetGame clears seedPrng = null and activeSeed = null — PASS
L2181–2182: `activeSeed = null; seedPrng = null;` in `resetGame()`. ✓ (CRITICAL-1 from plan resolved.)

### 6. tryStreakChargeSave in updateGame, 4 death paths — PASS
- Declared at L6347, nested inside `updateGame()` (the function body starts ~L6100, `checkPlayerDeath` at L6364 is nested within it). ✓
- Collision path: L6382 `if (!tryStreakChargeSave(wrappedHead)) return false;`
- Wall path: L6414 `if (!tryStreakChargeSave(wrappedHead)) return false;`
- Hazard path: L6450 `if (!tryStreakChargeSave(wrappedHead)) return false;`
- Rival path: L6497 `if (!tryStreakChargeSave(wrappedHead)) return false;`
All 4 paths call it. ✓

### 7. pigmentRushTimer decays in updateGame (tick loop), NOT in animateVisuals — PASS
L6130–6132: `if (pigmentRushActive) { pigmentRushTimer--; if (pigmentRushTimer <= 0) { pigmentRushActive = false; } }` — this is inside `updateGame()` (tick loop), NOT in `animateVisuals()`. ✓

### 8. Canvas save/restore in drawHazards gold ring and drawSnake chevrons — PASS
- drawHazards gold ring (L4640–4647): `ctx.save()` at L4640, `ctx.restore()` at L4647, both inside the `if (rdist > ...)` block. ✓
- drawSnake chevrons (L5197–5217): `ctx.save()` at L5197, `ctx.restore()` at L5217, both inside the `if (!calmModeEffective() && dirQueue.length > 0 ...)` block. ✓

### 9. Reset sites — PASS
- `hazardChainStreak`: resetGame L2094 ✓, resetWaveState L5589 ✓. Both sites present.
- Pigment rush (`hoardPigmentCount`/`pigmentRushTimer`/`pigmentRushActive`): resetGame L2207 only. ✓ (C is hoard-excluded — matches plan; resetWaveState correctly does NOT clear it, consistent with hoard precedent.)

### 10. No duplicate lines from edits — PASS
Adjacent-duplicate scan found only boilerplate (closing braces, blank lines, `ctx.restore();`, `currentY += 16`, panel HTML fragments) — all are legitimate repeated tokens across independent code blocks, NOT edit duplication. No repeated declarations or statements from the v11 edits. ✓

---

## Findings

### [MEDIUM] M1 — comboHeatColor ≥15 tier regression: alpha 0.25 < ≥10 tier's 0.4
**Location:** L5015–5016 (`comboHeatColor`).
```js
if (combo < 15) { ... return 'rgba(...,0.4)'; }   // combo 10–14: alpha 0.4
return 'rgba(255,55,0,0.25)';                     // combo 15+:   alpha 0.25  ← DIMMER
```
The v11 plan (B step 3) specifies the ≥10 branch should return "a brighter orange-red rgba (alpha cap 0.7 vs 0.25 ceiling)." The ≥10 tier (L5015) correctly brightens (alpha 0.4), but the ≥15 fallback (L5016, pre-existing v9 code) drops alpha back to 0.25 — the body tint gets DIMMER at the highest combo, contradicting "warms with comboCount" (AGENTS.md v9 C) and the v11 molten-tier intent. The head halo (L5040–5041) correctly raises alpha to 0.7 at ≥10, so only the body tint regresses.
**Fix:** Raise the ≥15 return at L5016 from `'rgba(255,55,0,0.25)'` to `'rgba(255,55,0,0.45)'` (or ≥ the 0.4 at L5015) so the body tint monotonically intensifies:
```js
return 'rgba(255,55,0,0.45)';
```

### [LOW] L1 — Wall death path lacks a shield save
**Location:** L6397–6416 (wall death branch).
The plan's collision-path enumeration (shield→vampire→streak→serpentine) is for `checkCollision` deaths; wall death is a separate branch offering only phoenix→streak→death. A player with an active shield who hits a wall dies despite the shield. This is pre-existing behavior (shields historically only block collision/hazard, not walls), and AGENTS.md documents wall death as out-of-bounds detection distinct from collision. Not a v11 regression, but worth noting since the streak-charge save (L6414) was added to the wall path while shield was not — the plan did not call for shield-in-wall, so this is consistent. No fix required; documented for completeness.

### [LOW] L2 — Daily seed: seededRandom still falls back to Math.random when seedPrng null (non-daily)
**Location:** L711 `return seedPrng ? seedPrng() : Math.random();`
The daily block (L2338–2339) sets `activeSeed`/`seedPrng`, making daily deterministic. ✓ Non-daily modes keep `seedPrng = null` (cleared in resetGame L2182) so they use `Math.random()` — unchanged per plan step D4. This is correct and intended, but `seededRandom()` is called by hazard spawn (L3477), hunter movement, and food spawn in ALL modes — in non-daily modes these are non-deterministic, which is the pre-existing design. No fix; confirms the fallback is deliberate.

### [LOW] L3 — Streak charge save does not reset hazardChainStreak on non-hazard saves
**Location:** tryStreakChargeSave (L6347–6361).
When a streak charge saves the player from a collision/wall/rival death, `hazardChainStreak` is NOT reset (only the hazard death path resets it at L6451). This is correct — a collision death isn't a hazard death, and the chain should persist across a non-hazard save (the player earned it). The melt branch (L6428) and hazard death (L6451) both reset it, which is the intended scope. No fix; documented to confirm the asymmetry is by design.

---

## Architecture Invariant Compliance

| Invariant | Status | Notes |
|---|---|---|
| Dual render loop / rAF read-only | ✓ | pigmentRushTimer decays in tick loop (L6130), not rAF (item 7) |
| Canvas save/restore | ✓ | Gold ring (L4640/4647), chevrons (L5197/5217) both balanced |
| Module scope (let/const lexical) | ✓ | All v11 state at module scope (L208-209, L765-766, L3504-3506) |
| Reset sites (resetGame AND resetWaveState) | ✓ | hazardChainStreak both (L2094, L5589); pigment resetGame-only (hoard-excluded) |
| Snapshot additive (no version bump) | ✓ | hazardChainStreak, streakCharges, seedOffset, pigment, hoard rush fields all additive |
| Death save chain order | ✓ | melt→shield→vampire→streak (hazard); shield→vampire→streak→serpentine (collision) |
| gameState single source of truth | ✓ | Chevrons gated on `gameState === 'playing'` (L5196) |

## Summary

All 10 checklist items PASS. The v11 implementation is faithful to the plan. One genuine bug found:

- **M1** (MEDIUM): `comboHeatColor` ≥15 body tint regresses to alpha 0.25, dimmer than the ≥10 tier's 0.4 — contradicts the "molten tier" intent and the v9 "warms with comboCount" invariant. One-line fix at L5016.

No CRITICAL or HIGH issues. Architecture invariants hold. No duplicate lines from edits.