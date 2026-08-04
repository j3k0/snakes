# Snakes v11 Design Plan — Review 2

Scope discipline, cross-feature synergy, implementation order, meta/retention coverage.
All line references verified against `snake.html` (8033 lines, commit cfaf4f0).

---

## [CRITICAL]

### C1. Feature D's core premise is false — `tickHazards` already uses `seededRandom()`

**Reference:** Plan §Feature D, hook point L3381; plan's "Determinism audit" at L94.

The plan states: *"tickHazards currently uses Math.random() for spawn position. The change is: in the daily branch, replace Math.random() calls with seededRandom()."*

**Verified reality:** `tickHazards()` spawn branch (L3386–L3387) already calls `seededRandom()` for both `hx` and `hy`. It does NOT use `Math.random()`. Since `seededRandom()` (L689–690) returns `seedPrng ? seedPrng() : Math.random()`, and `seedPrng` is set for daily mode in `startGame()` (L2256 block → `seedPrng = mulberry32(hash)` at L543), **daily hazard spawns are already deterministic today.**

This means Feature D's ~50 LOC is largely a no-op: the determinism the plan claims to add already exists. The only novel piece is the `seedOffset` for deterministic phase offset, but the base spawn positions are already seeded.

**Suggestion:** Either (a) reframe Feature D as "verify + document existing determinism and add phase-offset seeding" (reducing LOC to ~15–20, the `seedOffset` field only), or (b) replace Feature D with a higher-value feature. The plan's own Out-of-Scope list admits Daily Seed Rival Ghost (I4/F3/R3/S5) "needs the daily hazard determinism (Feature D) proven first" — but if determinism already exists, that prerequisite is already met and the ghost could be promoted.

### C2. Death save chain: the plan's "corrected" order is wrong for the hazard path — serpentine is absent there

**Reference:** Plan §Feature B L50, §Feature E L116–L118; codebase L6238–L6254 (hazard death path), L6187–L6214 (collision death path).

The plan states the corrected death save chain order as: `melt → shield → vampire → streak charge → serpentine → death`.

**Verified reality:** There are TWO separate death save chains in the codebase, not one:

1. **Collision/wall death path** (`checkCollision` at L6187, wall death after L6214): shield → vampire → serpentine → death. Serpentine (L6206) is gated on `isObstacleCollision(wrappedHead)` — it only fires for obstacle/self collisions.

2. **Hazard death path** (L6238–L6254): shield → vampire → death. **No serpentine branch exists.** The comment at L6238 explicitly says: *"Save chain: shield → vampire → death (no serpentine — hazards aren't obstacles)."*

The plan's chain order lists serpentine after streak charge, implying serpentine is a downstream save for hazards. It is not. For hazards, the chain is: `melt → shield → vampire → streak charge → death`. Serpentine is irrelevant to the hazard path.

**Suggestion:** The plan must document two chains explicitly:
- Hazard death: `melt → shield → vampire → streak charge → death`
- Collision death: `melt → shield → vampire → streak charge → serpentine → death`

Feature B's melt must slot before shield in BOTH paths. Feature E's streak charge must slot after vampire in BOTH paths. The single-chain ordering in the plan is misleading and will cause implementation errors when wiring the hazard path (which lacks serpentine).

### C3. Feature E's streak charge consume in `gameOver()` is architecturally wrong — death is finalized before `gameOver()` is called

**Reference:** Plan §Feature E L112 ("Charge consume: death handling in `gameOver()` L3076"); codebase L6306–L6309, L3076–L3082.

The plan proposes consuming the streak charge in `gameOver()` to "cancel death, decrement `streakCharges`, resume the run (`gameState = 'playing'`)."

**Verified reality:** `gameOver()` (L3076) is called AFTER `checkPlayerDeath()` returns `true` (L6306–L6309). By the time `gameOver()` runs, `gameState` is set to `'gameover'`, `stopGameLoop()` is called, and the snapshot is cleared (L3082: `clearSnapshot()`). The run is already dead. Resuming from `gameOver()` would require: re-calling `startGameLoop()`, restoring `gameState`, and undoing `clearSnapshot()` — this is a resurrection, not a save.

Every other death save in the codebase operates by returning `false` from `checkPlayerDeath()` BEFORE `gameOver()` is called (shield at L6196, vampire at L6201, serpentine at L6206, hazard shield at L6240, hazard vampire at L6247). The streak charge MUST follow this same pattern — it must be a gate inside `checkPlayerDeath()` that returns `false`, not a post-hoc resurrection in `gameOver()`.

**Suggestion:** Move the streak charge consume into `checkPlayerDeath()`, as a gate after the vampire branch in both the collision path (after L6214) and the hazard path (after L6252). Remove the `gameOver()` hook entirely. This is a fundamental placement error that would break the run-resume semantics.

---

## [HIGH]

### H1. Feature A's adjacency probe reuses `isHazardCollision` but changes the distance metric inconsistently

**Reference:** Plan §Feature A L23 ("reuse its on-phase test pattern... different predicate: distance ≤ `radius + TILE_SIZE` instead of ≤ `radius`").

**Verified reality:** `isHazardCollision` (L3402–L3410) uses **Manhattan distance** (`Math.abs(pos.x - h.cx) + Math.abs(pos.y - h.cy)`) compared against `h.radius`. The plan says the adjacency probe should use "Manhattan ≤ TILE_SIZE" (L22) but also says "distance ≤ `radius + TILE_SIZE`" (L23) for the reuse pattern. These are different:
- L22: adjacency = head within 1 tile of hazard center (Manhattan ≤ TILE_SIZE)
- L23: adjacency = head within `h.radius + TILE_SIZE` of hazard center

The `radius + TILE_SIZE` version expands the lethal zone by one tile to detect "adjacent," which means the player gets the chain bonus when standing in the ring around the hazard — but `h.radius` is dynamic (bell-curve expansion, L3375: `0.8` to `HAZARD_MAX_RADIUS = 2.5 * TILE_SIZE`). At max radius, the adjacency ring is at 3.5 tiles; at min radius, it's 1.8 tiles. This creates a wildly inconsistent adjacency zone that grows and shrinks with the hazard's lifecycle.

**Suggestion:** Define adjacency as a fixed Manhattan distance from the hazard center (e.g., `dist <= h.radius + TILE_SIZE` is fine for the collision-style reuse, but for the chain bonus, use a fixed ring: `dist > h.radius && dist <= h.radius + TILE_SIZE` — i.e., "near but not in"). Better: use a simple fixed `dist <= h.cx ± TILE_SIZE` adjacency that doesn't scale with radius. The plan must pick one and specify it precisely; the current description is contradictory.

### H2. Feature A and Feature C both inject into the same `addScore` multiplier path — interaction is underspecified

**Reference:** Plan §Feature A L24 (addScore L1796–L1800, `hazardChainMult`); Plan §Feature C L66–L68 (addScore L1796, `pigmentRushActive` flag, `effectiveHoardMult` path).

Both Feature A and Feature C modify the `addScore()` multiplier path at L1796–L1800. The current code:
```js
var effectiveHoardMult = scoreMultiplier;  // L1796
if (activeMutators.indexOf('golden_food') !== -1 && scoreMultiplier > 1) {
    effectiveHoardMult = Math.min(scoreMultiplier, 1.5);  // L1798
}
score += Math.round(amount * multi * effectiveHoardMult);  // L1800
```

Feature A adds `hazardChainMult` (1 + min(streak,3)*0.5, so ×1.5–×2.5). Feature C adds `pigmentRushActive` ×3 (capped at ×2 with golden_food). The plan says Feature C "bump `scoreMultiplier` via a new `pigmentRushActive` flag checked in addScore's `effectiveHoardMult` path" — but `scoreMultiplier` is the hoard's ×2, and the rush is ×3. Does the rush REPLACE the hoard ×2 or STACK on top?

The plan says (L68): "the multiplier is ×3" during rush, and "Golden Age + Rush = ×4 max." But if `hazardChainMult` is also active during a hoard (hazard-adjacent eats during a pigment rush), the total becomes `amount × multi × hazardChainMult(×2.5) × effectiveHoardMult(×3)` = ×7.5 per eat. The plan doesn't address this compound. The `golden_food` cap at L1798 only caps `effectiveHoardMult`, not `hazardChainMult`.

**Suggestion:** Specify whether multipliers are additive or multiplicative in the chain. Either (a) `hazardChainMult` and `effectiveHoardMult` are applied sequentially (compounding, needs a global cap), or (b) they're combined into a single `totalMult = 1 + (hazardChainMult - 1) + (effectiveHoardMult - 1)` (additive, bounded). The plan must specify the interaction and a global score-multiplier cap to prevent ×7.5 trivialization. Implementation order (A before C, per L172) makes this conflict likely to surface late.

### H3. Feature B's melt branch at combo ≥ 10 creates a combo-reset paradox with Feature A's chain

**Reference:** Plan §Feature B L44 (melt sets `comboCount = 0`); Plan §Feature A L25 (chain resets if "get hit by a hazard").

Feature B melts a hazard by resetting `comboCount` to 0. Feature A resets `hazardChainStreak` to 0 on hazard death (L26). But melt is NOT a death — it's a combo-break that prevents death. The plan says Feature A resets the chain "on hazard death" (L26, `checkPlayerDeath` hazard branch L6238). Since melt fires BEFORE the hazard death branch (it returns `false` from `checkPlayerDeath`), the hazard death branch never executes when melt fires.

So: when a player melts a hazard, `comboCount` resets to 0 (Feature B), but `hazardChainStreak` does NOT reset (Feature A's reset is in the death branch, which is skipped). This means a player can melt a hazard, lose their combo, but KEEP their hazard chain streak — then immediately rebuild combo and continue the chain. The melt becomes a free reset of the combo cost without losing the chain bonus.

**Suggestion:** Either (a) explicitly reset `hazardChainStreak = 0` in the melt branch (Feature B's hook), so melting a hazard also breaks the chain, or (b) document that the chain survives a melt as a deliberate synergy (high-combo players can melt AND keep their chain — a reward for maintaining combo ≥ 10). The plan is silent on this interaction; it must be a conscious design decision, not an emergent accident.

### H4. Feature E's streak charge as auto-fire death insurance conflicts with the "opt-in" design stated in the ideation source

**Reference:** Plan §Feature E L112 ("Design decision: automatic with toast — a prompt mid-death is bad UX"); ideation source v11-ideas-meta.md §7 L155 ("must be opt-in (player chooses to spend, not automatic)").

The ideation source explicitly says the streak charge "must be opt-in (player chooses to spend, not automatic) and one-charge so it doesn't trivialize hazards/bombs." The plan reverses this to auto-fire, justifying it as "the charge is the insurance, spending it IS the point."

Auto-fire is a significant design reversal that the plan doesn't acknowledge as a departure from the ideation. Auto-fire means a player who banks a charge to save for a critical moment (e.g., a high-score daily run) has it consumed by the first lethal hit — which might be a trivial self-collision, not the hazard they were saving for. This is worse UX than a prompt, not better.

**Suggestion:** If auto-fire is the decision, justify why it's better than the opt-in the ideation proposed. Consider a middle ground: auto-fire only in non-daily modes (where a death is less costly), opt-in in daily mode (where the player has one attempt and the charge matters more). Or: auto-fire but with a minimum-score threshold (don't waste a charge on a 50-point run). The plan's blanket auto-fire is too coarse.

---

## [MEDIUM]

### M1. Cross-feature synergy is strong with prior-cycle systems but weak AMONG the 7 features

**Reference:** Plan §Implementation Order L164 ("Features have minimal cross-dependencies").

The plan's own admission — "minimal cross-dependencies" — is both a strength (safe to implement) and a weakness (the 7 features are largely parallel, not compounding). Verified synergies:

- A ↔ B: Both touch hazards, but in different modes of interaction (A = scoring adjacency, B = defensive melt). They share the hazard system but don't compound each other.
- A ↔ C: Both touch `addScore`, but this is a conflict (H2), not a synergy.
- D ↔ A: D makes hazards deterministic; A rewards hazard adjacency. This is genuine synergy — daily players can route hazard-adjacent eats. But D is ~15 LOC of real work (C1), so the synergy is thin.
- E ↔ B: Both touch the death save chain, but in the same path (B before E), not compounding — they're sequential gates, not interacting systems.
- G ↔ nothing: G (input buffer viz) is pure polish, compounds only with v10 G.

No feature PAIR creates a new emergent interaction. The "connected web" described in the overview (L9: "hazards, hoard, combo bank, streaks, and diary become a connected web") is aspirational — the features connect to prior systems but not to each other in a way that creates new gameplay loops.

**Suggestion:** This is acceptable for a depth cycle, but the plan should be honest: the 7 features deepen individual systems, they don't form a web. If cross-feature synergy is a selection criterion, consider promoting Bounty Hijack (I3/F5/R2/S5, 55 LOC) — it creates a direct hoard↔bounty interaction that the current set lacks.

### M2. Meta/retention coverage is too thin — 1 meta feature (E) vs 5 gameplay/polish

**Reference:** Plan §Overview L5 ("coverage across all three angles"); plan's feature list: A,B,C,D,G = gameplay/polish (5), E = meta (1), F = robustness (1).

The cycle has 5 gameplay/polish features, 1 meta feature, and 1 robustness feature. The "depth over breadth" theme is gameplay-centric. Feature E (streak multiplier) is the only retention feature, and it's a progression tweak, not a new retention loop. The ideation source generated 8 meta ideas, of which only 1 was selected — and it's the one most coupled to gameplay (death save chain).

For a v11 cycle where the stated goal is retention ("the cycle where streaks and diary become connected"), there is no diary feature. The diary (v9 G) is mentioned in Feature D's rationale (L81: "depth for the diary-replay loop") but no feature actually extends the diary system. Daily Seed Rival Ghost (I4/F3/R3/S5, 170 LOC) was rejected for "replay playback determinism risk," but C1 shows the determinism prerequisite is already met.

**Suggestion:** Replace one lower-impact gameplay feature with a meta feature. Candidates:
- Replace **Feature D** (Impact 3, and largely a no-op per C1) with **Daily Seed Rival Ghost** (Impact 4, Synergy 5, and its prerequisite is already satisfied).
- Replace **Feature G** (Impact 3, pure polish) with **Seasonal Ladder** (Impact 4, Synergy 5, 180 LOC) — the plan admits E is a "prerequisite building block" for it, but E is in the same cycle, so the ladder could ship in v11 if E lands first.

This rebalances to 4 gameplay/polish, 2 meta, 1 robustness — closer to the "all three angles" coverage the overview claims.

### M3. Out-of-scope rejection of Daily Seed Rival Ghost is premature — its stated prerequisite is already met

**Reference:** Plan §Out of Scope L182 ("Needs the daily hazard determinism (Feature D) proven first; revisit in v12").

Per C1, daily hazard determinism already exists in the codebase (`tickHazards` uses `seededRandom()`). The plan rejects Rival Ghost because D needs to be "proven first," but D is largely a no-op. This makes the rejection circular: D is selected to prove determinism that already exists, and Ghost is rejected because D hasn't proven it yet.

**Suggestion:** Re-examine the Rival Ghost rejection. If the determinism prerequisite is met, the remaining risk is "replay playback determinism" — verify whether `replayEvents` (L444) is a deterministic direction-event stream (it is, per the ideation source's hook analysis). The rejection may be based on a stale risk assessment.

### M4. Out-of-scope rejection of Prestige Perk Tree is sound, but the "v12 flagship" framing masks a dependency

**Reference:** Plan §Out of Scope L176 ("Better as a v12 flagship after the hazard/hoard/streak depth from v11 is playtested").

The plan says Prestige Perk Tree (220 LOC) is deferred to v12 because it "touches many systems (XP, quests, brews, combo bank, hoard)." This is sound scope discipline. However, Feature E (streak multiplier) modifies `awardXP()` (L6879) — the same function the Perk Tree would hook for XP-boost perks. If E ships in v11 and the Perk Tree ships in v12, the v12 perk tree must account for E's streak multiplier already being in the `awardXP` path.

**Suggestion:** Not a blocker for v11, but note in the plan that Feature E's `awardXP` modification creates a v12 dependency: the Perk Tree's XP-boost perk must compose with (not override) E's streak multiplier. This is a forward-compatibility note, not a v11 change.

### M5. Feature C's `pigmentRushTimer` decay location is ambiguous — plan says "game-tick" but references `animateVisuals()`

**Reference:** Plan §Feature C L71 ("animateVisuals() timer-decay section — decrement `pigmentRushTimer` per tick (game-tick, not rAF — this is game-logic state... like `hoardTimer`)").

The plan says to decay `pigmentRushTimer` in `animateVisuals()` but calls it "game-tick, not rAF." `animateVisuals()` (L4023) is the rAF callback — it's not the game tick. The game tick runs in `updateGame()` (L5959-area). `hoardTimer` is decremented in the tick loop, not in `animateVisuals()`. If `pigmentRushTimer` is game-logic state (it affects `addScore`), it must decay in the game tick, not in the rAF render loop — otherwise the rush duration depends on frame rate, not game speed.

**Suggestion:** Move the `pigmentRushTimer` decrement to the game tick loop (where `hoardTimer` is decremented), not `animateVisuals()`. The plan's hook point is wrong; the rationale ("like `hoardTimer`") is correct but contradicts the stated location.

---

## [LOW]

### L1. Feature B's `comboCount >= 10` threshold overlaps with existing combo milestone tiers

**Reference:** Plan §Feature B L45 (combo ≥ 10 triggers molten tint); codebase L4916 (combo aura: ≥3 = yellow, ≥7 = orange, ≥15 = red).

The existing combo heat aura (L4920–L4922) has thresholds at 3, 7, and 15. Feature B adds a threshold at 10 (molten tint) and a mechanical effect at 10 (melt). The visual at 10 sits between the existing 7 (orange) and 15 (red) tiers. The plan says "brighter orange-red, higher alpha cap 0.7" — but L4921 already uses `#FF4400` (red) at ≥15. A "molten" tint at ≥10 needs to be visually distinct from both the ≥7 orange and the ≥15 red, or it muddies the visual ladder.

**Suggestion:** Align the melt threshold with an existing visual tier (either ≥7 or ≥15) to avoid inserting a new visual step, OR make the molten tint structurally different (e.g., pulsing intensity, not just color) so it doesn't compete with the existing hue ladder.

### L2. LOC estimates are mostly realistic but Feature E is underestimated

**Reference:** Plan §Feature E L102 (~130 LOC).

Feature E touches: `awardXP()` multiplier (L6879), `STREAK_UNLOCKS` loop extension (L2297–L2306), `gameOver()`/`checkPlayerDeath()` death-save gate (C3 says this must be in `checkPlayerDeath`, which has two paths), snapshot additive field (L2493), save key read/write, display in streak block (L4335) + menu footer (L2214), and the auto-fire toast. Given C3's correction (the charge must be wired into two `checkPlayerDeath` paths, not `gameOver()`), plus the 7/14/30 threshold grant logic, the realistic LOC is ~160–180, not 130.

**Suggestion:** Revise Feature E's estimate to ~170 LOC. The other estimates (A: 70, B: 45, C: 75, D: 50→15 per C1, F: 90, G: 50) are reasonable.

### L3. Feature F's quarantine prefix guard is correct but the "Restore Backed-Up Data" button is misleading

**Reference:** Plan §Feature F L137 ("add a 'Restore Backed-Up Data' button... no separate restore flow (corrupted data is by definition untrustworthy)").

The button calls `exportSaveData()` so the user can download corrupted keys. But the button label "Restore Backed-Up Data" implies restoration, when the actual action is "Export Corrupted Data for Manual Inspection." This is a UX mismatch.

**Suggestion:** Rename the button to "Export Backed-Up Data" or "Download Corrupted Save Data." The current label will confuse users who expect a restore action.

### L4. Implementation order is sound but G-first is suboptimal for testing velocity

**Reference:** Plan §Implementation Order L166 (G first, then F, then D...).

Starting with G (input buffer viz) is lowest-risk but provides no infrastructure for testing the other features. Starting with F (save corruption recovery) first would de-risk the snapshot engine before Features A–E add new snapshot fields (A: `hazardChainStreak`, C: `hoardPigmentCount`/`pigmentRushTimer`, E: `streakCharges`). If F ships first, the new additive snapshot fields in A/C/E are automatically covered by the quarantine layer.

**Suggestion:** Swap F and G in the implementation order: F first (protects the snapshot engine before new fields are added), then G. This is minor but provides better fault isolation for the snapshot-heavy features that follow.

### L5. Feature A's "Hazards-enabled modes only" gate is correct but should also gate the floater

**Reference:** Plan §Feature A L31 (gated on `MODE_CONFIG[gameMode].hazardsEnabled`); L25 (floater emitted when streak ≥ 1).

The plan gates `hazardAdjacentThisTick` on hazards-enabled modes (L31), which correctly no-ops the multiplier. But the floater ("×N Hazard Harvest!") is emitted at the eat site (L25) — if the gate is only on the adjacency check, the floater code should also be gated, or it could fire in a non-hazard mode if `hazardChainStreak` is non-zero from a prior hazard-mode run (it shouldn't be, since `resetGame` clears it, but defensive gating is cheap).

**Suggestion:** Gate the floater emission on `hazardAdjacentThisTick && hazardChainStreak > 0` (which it already is, implicitly, since the streak only increments when adjacency is true). This is a minor robustness note, not a real bug.