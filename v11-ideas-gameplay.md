# Snakes v11 — Gameplay Ideas (6–10)

All hook points are grep-verified against `snake.html` (8033 lines). Line numbers are real.
Angles: mechanics that change moment-to-moment movement / eating / dodging / scoring / risk-reward, each compounding with an existing system rather than standing alone.

---

## 1. Hazard Chain Bonus

**Concept** — Eating food while standing on (adjacent to) a pulsing on-phase Hazard Zone grants a "Hazard Harvest" score multiplier that stacks up to ×3 per consecutive hazard-adjacent eats. The multiplier resets if you eat a non-adjacent food or get hit. Turns the existing hazard zones from pure-penalty tiles into a risk/reward lane the player *opts into* — park next to lava for big points, but one wrong tick and the phase flips to lethal.

**LOC** — ~70

**Scores** — Impact 4 / Feasibility 5 / Risk 2 / Synergy 5

**Hook points**
- `tickHazards()` at L3362 — already iterates hazards each tick; add a `phase === 'on'` adjacency check vs `snake[0]` to set a `hazardAdjacencyStreak` counter.
- `isHazardCollision(pos)` L3402 — reuse its on-phase test pattern for the adjacency probe (same loop shape, different predicate).
- `addScore(amount)` L1800 — the `scoreMultiplier` / `effectiveHoardMult` path at L1796–L1800 is the existing multiplier injection site; chain a `hazardChainMult` there.
- Eat site L6484 (`comboCount > 0` bonus block) — natural place to bump/reset the streak and emit a floater.
- `resetGame()` L2055 + `resetWaveState()` L5419 — clear `hazardChainStreak` (both reset sites, per invariant).
- Snapshot additive: add `hazardChainStreak` to `captureSnapshot` L2580-area and `restoreSnapshot` L2722-area (missing → 0).

**Why now / why not** — Hazards (v10 C) are currently pure avoidance; giving them an upside completes the risk/reward loop the combo bank and hoard already model. Cheap because `tickHazards` + `isHazardCollision` already expose phase + position. Risk is low — multiplier is score-only, no new collision, no new food tier.

---

## 2. Combo Bank: Phase Shift (4th spend mode)

**Concept** — Add a 4th combo-bank spend mode (cycling X-key) that "Phase-Shifts" the next incoming hazard: it freezes one hazard's phase clock for 5 ticks and converts its tile into a temporary +30 score tile, paying 2 charges instead of 1. Gives the combo bank a defensive/utility lever that *targets hazards specifically*, so charges aren't only spent on food economy.

**LOC** — ~90

**Scores** — Impact 4 / Feasibility 4 / Risk 3 / Synergy 5

**Hook points**
- `comboBankSpendMode` cycle at L7429 (`(comboBankSpendMode + 1) % 3`) → extend to `% 4`; `modeNames` array at L7430 + L5166 (HUD) grows by one.
- `spendComboCharge()` L3796 — add `comboBankSpendMode === 3` branch; require `comboCharges >= 2`, decrement twice, find nearest on-phase hazard to head via the `isHazardCollision` scan pattern at L3402.
- `tickHazards()` L3362 — honor a per-hazard `frozenTicks` field (skip `h.phaseTimer--` while > 0, decrement it).
- `drawHazards()` L4508 — tint frozen hazards differently (CVD-safe via existing `calm` path).
- `hazards[]` objects are already snapshotted at L2667 — add `frozenTicks` (additive, missing → 0).
- `FOOD_TIERS` untouched (no weight change) — safe.

**Why now / why not** — Combo Bank (v10 A) has exactly 3 spend modes all aimed at food/obstacles; a hazard-specific mode ties the bank to v10 C, the freshest system. Risk: spend-mode UI parity and a 2-charge cost branch. Not premature — the bank + hazard pair is already shipped; this is depth, not new infra.

---

## 3. Hunter Stampede (rare hunter surge)

**Concept** — A low-probability food roll (no new `FOOD_TIERS` weight; gated on existing `hunter` tier) spawns *three* linked hunter foods in `extraFoods[]` that flee as a pack. Eating any one collapses the trio into a single +150 score burst and grants 1 combo charge. Reuses the portal-twin `extraFoods` plumbing and the hunter flee AI, but raises the stakes of the chase the player already does for lone hunters.

**LOC** — ~85

**Scores** — Impact 3 / Feasibility 4 / Risk 3 / Synergy 4

**Hook points**
- `pickRandomFoodType()` L1814 — add a `seededRandom() < 0.015` branch (post-normalization-safe: it fires *instead of* spawning the lone hunter, not in addition) that builds a stampede.
- `moveHunter()` L1838 — generalize to also move `extraFoods[]` entries with `stampedeId` (same flee vector relative to head).
- `extraFoods` eat loop L6589 — when eating a stampede member, splice siblings by `stampedeId`, award burst, and call the `comboCharges++` path at L6004.
- `generateFood()` L1874 exclusion already skips `extraFoods` tiles (L1857) — safe.
- `resetGame()` L2165 + `resetWaveState()` L5426 already clear `extraFoods` — no new reset site.
- Snapshot: `extraFoods` round-trips at L2508/L2656 and already preserves arbitrary `type`; `stampedeId` rides along as an additive field (missing → undefined → lone hunter).

**Why now / why not** — Hunter food (v8 E) + portal's twin pattern (v9 D) + combo bank charges (v10 A) make this a composition of three shipped systems. Risk: `pickRandomFoodType` has NO normalization (invariant) — must subtract the stampede probability from `hunter.weight` so the sum stays 1.0. Feasible because the flee AI is already wrap-aware.

---

## 4. Hoard Pigment (hoard foods tint the board)

**Concept** — During the Golden Hoard, each of the 4 bonus foods in `extraFoods[]` carries a hidden "pigment" tag; eating all 4 before the hoard timer expires unlocks a 5-second "Pigment Rush" — the entire board tints gold, all foods (including the primary `food`) score ×3, and rival freeze extends by 3s. Converts the hoard from a passive buffet into an active eating *combo within a combo*.

**LOC** — ~75

**Scores** — Impact 4 / Feasibility 4 / Risk 3 / Synergy 5

**Hook points**
- `activateHoard()` L3416 — tag the 4 hoard foods with `pigment: true` (or a pigment index) when pushing to `extraFoods` at L3424.
- `extraFoods` eat block L6589 — on eating a `pigment` food, increment `hoardPigmentCount`; at 4, set `pigmentRushTimer` and bump `scoreMultiplier` beyond the hoard's ×2 (extend the `effectiveHoardMult` cap at L1796–L1800).
- `endHoard()` L3429 — clear `hoardPigmentCount` / `pigmentRushTimer`.
- Rival freeze already keyed on `hoardActive` at L6769/L6777 — extend `rivals[rii].respawnTimer` by 3s when rush triggers.
- `drawGame()` L5219 (hoard tint) — add a stronger tint when `pigmentRushTimer > 0`.
- Snapshot: `hoardPigmentCount` + `pigmentRushTimer` are additive (missing → 0) alongside existing hoard fields at L2583/L2722.

**Why now / why not** — Hoard (v9 E) is already a timed event with a multiplier and rival freeze; this adds an internal objective so the player *plays* the hoard instead of idly collecting. Risk: the `golden_food` mutator cap at L1797 must also cap the rush multiplier. All plumbing (`extraFoods`, `scoreMultiplier`, snapshot) exists.

---

## 5. Bounty Hijack (hoard-vs-bounty interaction)

**Concept** — If the Golden Hoard begins *while* a Bounty Rush contract is active, the active bounty gets a "Hijack" flag: its reward doubles but its tick window is cut in half, and completing it during the hoard refunds a combo charge. Resolves the current mutual suppression (hoard pauses bounty spawning at L3338) into a positive interaction — a bounty already in flight becomes a high-pressure mini-game instead of being silently stalled.

**LOC** — ~55

**Scores** — Impact 3 / Feasibility 5 / Risk 2 / Synergy 5

**Hook points**
- `activateHoard()` L3416 — if `activeBounty` (L728) is non-null, set `activeBounty.hijacked = true` and halve `activeBounty.windowTicks`.
- `tickBounty()` L3336 — in the active branch (L3344+), when `hijacked` and completed, refund via the `comboCharges++` path L6004 (guarded `< 5`).
- `checkBounty()` L3314 — award double `reward` when `hijacked`.
- `endHoard()` L3429 — clear `hijacked` (bounty reverts to normal window if still alive) — or let it expire; design choice, either is additive.
- Snapshot: `activeBounty` already serializes at L2580; `hijacked` rides along (missing → undefined → falsy).

**Why now / why not** — The hoard-bounty suppression at L3338 is an existing invariant-aware interaction with no upside for the player; flipping it to a reward is pure depth. Very low risk — no new collision, no new food tier, only bounty-window arithmetic that already exists. Ripe because both systems are stable since v8/v9.

---

## 6. Evolution Apex Perk: Rift Step

**Concept** — At Apex tier (evolution 3, L941 `EVOLUTION_TIERS`), the snake gains a one-time-per-tier "Rift Step": pressing the combo-bank spend key (Z) while at full combo charges (5) consumes *all 5* charges to teleport the snake head across the board to the nearest food's tile (clearing the path). Gives the Apex tier a moment-to-moment *movement* tool, not just a passive combo floor (L6406), and gives maxed combo charges a high-value dump beyond the 3 standard spend modes.

**LOC** — ~80

**Scores** — Impact 4 / Feasibility 3 / Risk 4 / Synergy 5

**Hook points**
- `EVOLUTION_TIERS[3]` L941 — add a `riftStep: 1` field (Apex only).
- `spendComboCharge()` L3796 — new guard at top: if `evolutionTier === 3 && comboCharges === 5` and a mode flag is set, drain all 5 and teleport head to `food` (or nearest `extraFoods` entry) via `findFreeTile` L2835-style placement.
- Key handler L7429 — X cycles modes; add a 4th "Rift" mode visible *only* at Apex (so the HUD at L5164 conditionally shows it).
- Collision: after teleport, the existing `checkCollision` L6187 / `isHazardCollision` L6238 run normally on next tick (no bypass) — risk is intentional.
- `obstaclePassUsed` L6206 is the precedent for one-shot per-run gating; reuse the pattern with `riftStepUsed`.

**Why now / why not** — Evolution (v7) + combo bank (v10 A) are both mature, but Apex tier currently has no active button — it's a passive `minCombo` floor. A movement perk makes tiering up *feel* different in the hand. Risk is highest of the set: head teleport can skip into a hazard; design it as intentional risk (charges are the cost). Not premature — both systems are stable.

---

## 7. Daily Seed: Hazard Layout

**Concept** — The daily seed (already deterministic) now also seeds hazard spawn positions and phase offsets, so the Daily Challenge has a fixed, learnable hazard rhythm players can route over multiple diary replays. Turns hazards from random into a *memoizable* obstacle course in the daily mode — depth for the diary-replay loop without touching non-daily modes (which keep RNG hazards).

**LOC** — ~50

**Scores** — Impact 3 / Feasibility 5 / Risk 2 / Synergy 4

**Hook points**
- `tickHazards()` spawn branch L3381 (`hazardTickCounter >= HAZARD_INTERVAL`) — when `gameMode === 'daily'`, derive spawn position from `seededRandom()` (already seeded for daily) instead of `Math.random`; store a `dailyHazardIndex` so replays reproduce order.
- `hazards.push({...})` L3390 — add a `seed` field for deterministic phase offset (`HAZARD_ON_TICKS`/`OFF_TICKS` shifted by a seed-derived constant).
- Daily mode config L1230 already runs the deterministic RNG; no mode-config change.
- Diary replay path reuses `resetGame` → `startGame` with the stored seed; hazards just fall out of the same RNG stream.
- Snapshot unaffected — hazards already serialize at L2667; the determinism is a *spawn-time* property, not a per-tick state.

**Why now / why not** — Daily seed (shipped) + diary replay (shipped) + hazards (v10 C) are all live; wiring determinism is cheap and gives daily players a routing skill to grind. Risk: must confirm `seededRandom()` is the daily RNG used in `tickHazards` (currently it likely uses `Math.random` for hazard placement) — that's the only real change. Not premature; all three systems are stable.

---

## 8. Combo Heat → Hazard Melt

**Concept** — At combo ≥ 10 (where the painter rainbow already triggers, L6528), the snake's heat aura (L4916) becomes hot enough to *melt* hazards it overlaps: entering an on-phase hazard at combo ≥ 10 downgrades the hit from lethal to a combo-break (resets `comboCount` to 0, no death). A pure-movement risk/reward: keep your combo high and you can cross lava once; lose it and lava is deadly again. Ties the existing combo-heat visual to a mechanical payoff.

**LOC** — ~45

**Scores** — Impact 4 / Feasibility 4 / Risk 3 / Synergy 5

**Hook points**
- `isHazardCollision` death path L6238 — before the shield check, add: `if (comboCount >= 10) { comboCount = 0; lastComboMilestone = 0; lastDeathCause = 'Combo melted a hazard!'; spawnParticles(...); return false-from-check; }`. Concretely the `checkCollision`-style early return at L6187 is the template.
- `comboCount >= 3` aura at L4916 — extend the visual threshold ladder so ≥10 shows a distinct "molten" tint (CVD-safe via `foodColor`-style palette discipline, or a fixed high-contrast hue).
- `comboCount` reset sites L6406/L6429 — mirror the reset-on-melt.
- No new state, no snapshot change (reads existing `comboCount`).

**Why now / why not** — Combo heat aura (v7/v10) and hazards (v10 C) are both visual+mechanical systems with no crossover. This is the smallest idea that makes "maintaining combo" a *defensive* action, not just a scoring one. Risk: the death-path at L6238 is load-bearing (shield/vampire/phoenix cascade); the melt branch must slot *before* shield so a high-combo player isn't punished by also consuming their shield. Feasible; the cascade is already ordered.

---

## 9. Obstacle Quarry (combo-bank Clear rewards ore)

**Concept** — When the combo-bank "Clear" mode (L3800) destroys obstacles, each destroyed obstacle has a 25% chance to drop an "Ore" pickup (a transient tile in `extraFoods[]` worth +20 score, eaten by walking over it). Turns the existing Clear spend from a pure board-wipe into a *farming* action — spending a charge near a dense obstacle cluster yields score, not just safety. Compounds Clear with the `extraFoods` eating loop.

**LOC** — ~60

**Scores** — Impact 3 / Feasibility 4 / Risk 3 / Synergy 4

**Hook points**
- `spendComboCharge()` Clear branch L3800 — `obstacles.filter` loop at L3803 is where obstacles are removed; on removal, `seededRandom() < 0.25` → push an ore object to `extraFoods` (reuse `generateHoardFood`-style direct placement at L3436, no portal link).
- `extraFoods` eat loop L6589 — ore is a new `type` handled by an `ef.type === 'ore'` branch (no `FOOD_TIERS` entry needed; score awarded inline, bypassing `FOOD_TIERS` lookup like hoard foods at L6643).
- `drawExtraFood()` L4791 — add an ore glyph (CVD-safe fixed color, not via `foodColor` since ore isn't a tier — matches the portal `#AA44FF` exception pattern).
- Snapshot: `extraFoods` already serializes arbitrary types at L2508; `ore` round-trips with no new field.

**Why now / why not** — Clear mode (v10 A) currently only removes obstacles; the combo bank's three modes are all *instant*, none leaves a follow-up pickup. An ore drop makes the *position* you spend a charge matter (spend near clusters). Risk: introducing a non-`FOOD_TIERS` food type — must ensure the `extraFoods` eat loop (L6589) and magnet (L6728) handle it. Feasible; hoard foods already set the precedent.

---

## 10. Rival Bounty Hunter (rival targets active bounty food)

**Concept** — When a Bounty Rush contract is active and a rival snake is alive, the rival gains a "hunter" AI bias: it beelines toward the *current primary food* (the one the bounty wants eaten) at increased speed, racing the player for it. If the rival eats it first, the bounty's window shrinks by 25%. Turns the rival from ambient hazard into a *contested-objective* actor during bounty windows, compounding rival + bounty.

**LOC** — ~70

**Scores** — Impact 3 / Feasibility 3 / Risk 4 / Synergy 4

**Hook points**
- `updateRival(idx)` L2925 — add a branch: if `activeBounty` (L728) and `gameMode !== 'zen'`, bias `r.dx/r.dy` toward `food.x/food.y` (wrap-aware, same math as hunter flee at L1838 but inverted sign).
- `tickBounty()` L3336 / `checkBounty()` L3314 — on rival-eats-first (detected when food regenerates at L6811 while a bounty is active and the rival head was on `food`), shrink `activeBounty.windowTicks = Math.floor(windowTicks * 0.75)`.
- Rival-eat detection: the rival update path at L6777 already moves rivals; add a food-collision check mirroring the player's at L6545.
- `spawnRival` L2910 already parametrizes color/speed; add a `bountyHunter` flag for the AI gate.
- Snapshot: `activeBounty` serializes at L2580; rival `rivals[]` at L2533 — no new field, the bias is recomputed from `activeBounty` presence.

**Why now / why not** — Rival snake (shipped) and bounty (v8 F) never interact; the rival currently ignores objectives. This is the highest-synergy idea but also the riskiest — rival pathfinding is light and a food-seeking bias could make the rival too strong in small modes. Gate it to non-zen bounty-active windows only. Ripe because both systems are stable; risky because rival AI is delicate (wrap math, respawn timers at L6769).

---

### Summary table

| # | Name | LOC | Impact | Feasibility | Risk | Synergy |
|---|------|-----|--------|-------------|------|---------|
| 1 | Hazard Chain Bonus | 70 | 4 | 5 | 2 | 5 |
| 2 | Combo Bank: Phase Shift | 90 | 4 | 4 | 3 | 5 |
| 3 | Hunter Stampede | 85 | 3 | 4 | 3 | 4 |
| 4 | Hoard Pigment | 75 | 4 | 4 | 3 | 5 |
| 5 | Bounty Hijack | 55 | 3 | 5 | 2 | 5 |
| 6 | Apex Rift Step | 80 | 4 | 3 | 4 | 5 |
| 7 | Daily Seed: Hazard Layout | 50 | 3 | 5 | 2 | 4 |
| 8 | Combo Heat → Hazard Melt | 45 | 4 | 4 | 3 | 5 |
| 9 | Obstacle Quarry | 60 | 3 | 4 | 3 | 4 |
| 10 | Rival Bounty Hunter | 70 | 3 | 3 | 4 | 4 |

Highest synergy + lowest risk: **Hazard Chain Bonus (1)**, **Bounty Hijack (5)**, **Daily Seed: Hazard Layout (7)**.
Best "depth per LOC": **Combo Heat → Hazard Melt (8)** at 45 LOC.