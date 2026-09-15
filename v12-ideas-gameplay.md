# Snakes v12 — Ideas (GAMEPLAY & MECHANICS DEPTH)

Angle: pure moment-to-moment play. Every idea below changes *how the snake is driven, routed, or scored* and is built out of systems that already ship. Hook points are grep-verified against `snake.html` (8594 lines); every line number was read, not inferred. Where I claim a symbol is inert or unwired I quote the code that proves it.

Guiding bias: the game has ~34 features and 8 modes. The highest-value v12 work is not another feature, it is making the *advertised* systems actually pay out and giving the existing risk systems (hazards, mutators, bounties, cascade) a reward curve so that playing dangerously is a decision instead of a mistake.

| # | Idea | LOC | Impact | Feas | Risk | Synergy |
|---|------|-----|--------|------|------|---------|
| 1 | Resonance Completion | ~210 | 5 | 3 | 4 | 5 |
| 2 | Mutator Contracts | ~180 | 4 | 3 | 4 | 5 |
| 3 | Rift Harvest | ~110 | 4 | 4 | 3 | 5 |
| 4 | Gauntlet Wave Modifiers | ~120 | 4 | 4 | 3 | 5 |
| 5 | Threat Clock | ~120 | 4 | 3 | 4 | 4 |
| 6 | Bounty Streak | ~80 | 3 | 4 | 3 | 4 |
| 7 | Rift-Tainted Food | ~110 | 3 | 3 | 3 | 4 |
| 8 | Risk Income (charge sources) | ~45 | 3 | 5 | 2 | 5 |

---

## 1. Resonance Completion — make all 8 mutator synergies real

**Name** — Resonance Completion

**Concept** — `RESONANCES` (L881–890) advertises eight mutator-pair combos. Today the player drafts 2–3 mutators, the HUD prints an excited `✦ Quantum` label (L6249–6258), and five of the eight do literally nothing. This idea gives every entry a real, observable mechanic, so the combo is a thing you *play around* rather than a decorative string. The design principle: each effect must be readable in one glance (floater/HUD), must telegraph before it can kill you, and must be checkable from state that already exists.

Concretely, per effect tag (all tags verified at L882–889):

- `invertControls` (Quantum, gravity+mirror) — currently the whole effect is a white screen flash (L6464). Replace with a **real forced 90° turn**: every 10–15 ticks the snake auto-rotates its heading one quarter-turn (never 180°, so it cannot self-kill on the spot), telegraphed 3 ticks ahead by a chevron pulse + floater. Applied at the direction-consumption block (L6504–6515) so it composes with the input queue instead of fighting it.
- `intangiblePhase` (Ethereal, phase_shift+hunger_clock) — during phase ticks (`gameTick % 5 === 0`, L6423) hunger pauses (the `hungerTickCounter++` at L6433 is skipped), the self-collision grace window extends from "this tick" to "this tick + 2", and the body renders translucent. Verified problem it fixes: the tag's own description promises "pause hunger; snake becomes intangible" and neither happens.
- `doubleGold` (Chaos Gold, golden_food+chaos_seed) — food score ×2 AND XP ×2 on top of golden_food's ×3 (the `Math.min(..., 4)` global cap at L1860 keeps this honest) and the chaos reshuffle cadence halves (20 → 10 ticks, L6456).
- `rivalShrink` (Pressure Cooker, shrink_zone+double_rival) — the code *already documents this as unwired*: `advanceShrinkZone`'s comment (L2554–2557) says "that rival-eat call site is NOT wired yet". Wire it at the rival-eat site in `updateRival` (L3218–3236), including the player-caught death check.
- `feastFamine` (Famine Feast, hunger_clock+golden_food) — the current body is a comment-only `if` (L6468–6471). Make it real: hunger interval 50 → 30 and food points ×4, with the interval read from a helper instead of the literal `% 50` at L6434.
- `quantumToggle` (Schrodinger, mirror+chaos_seed) — every 15 ticks alternate between "mirror is inverted" (a `resonanceMirrorFlip` flag consulted at the mirror flip site, L8331) and "food weights reshuffled" (`shuffleFoodWeights`, L6025).
- `chaosCycle` (Chaos Theory, gravity+mirror+phase_shift) — rotate the three sub-effects through 5-tick windows with a HUD phase glyph.
- `rapidDoom` (Apocalypse, golden_food+hunger_clock+shrink_zone) — each hunger pop also calls `advanceShrinkZone()` (L2559) with the death check.

Also fix a latent determinism leak found while reading: L6464 uses `Math.random()` for the invert cadence. Mutators are excluded from Daily (L7924 `gameMode !== 'daily'`), so today it only breaks *seeded* Classic runs with draft mutators — which is exactly the door this feature opens wider.

**LOC estimate** — ~210 in `snake.html`. A new `tickResonance()` helper (~80), the eight effect bodies and their hooks (~60: addScore L1843–1860, hunger L6427–6443, `advanceShrinkZone` call site L3218–3236, keydown mirror flip L8331, dirQueue consumption L6504–6515, `drawSnake` alpha), HUD + onboarding (~25: L6236–6258), six additive snapshot fields (~10: L2681–2692 / L2847–2858 restore), reset sites (~8: `resetGame` L2137–2206, `resetWaveState` L5775–5807). Plus a mutator suite extension (~80 lines of Playwright) — this is the largest item here and I'd ship it in two passes.

**Scores** — Impact **5** / Feasibility **3** / Risk **4** / Synergy **5**

**Hook points (verified)**
- `RESONANCES` L881–890; `activeResonance` L891; `detectResonance()` L896–900; `activeMutators` L909.
- The single consumption site: `updateGame` L6461–6473 — `activeResonance = detectResonance(activeMutators)` re-runs **every tick** (L6462), so any per-effect timer must live in its own counter; storing it on `activeResonance` resets it 8 ticks a second.
- Direction consumption (real Quantum invert): L6504–6515 (`dirQueue.shift()` + `lastConsumedDir`).
- Keydown mirror flip (Schrodinger): L8330–8333 (`if (activeMutators.indexOf('mirror') !== -1) newDx = -newDx;`).
- Phase/self-collision window (Ethereal): L6423–6425 (`skipSelfCollision`), consumed by `checkPlayerDeath` L6565–6567 (`var hitSelf = !skipSelfCollision && checkCollision(wrappedHead)`).
- Hunger (Ethereal pause / Famine Feast value): L6427–6443, pop at L6434 (`% 50 === 0`).
- Shrink hooks: `advanceShrinkZone()` L2559–2578; timer path L6446–6454; **counterpart unwired** — `updateRival` food-eat site L3218–3236.
- Chaos reshuffle: L6456–6459 + `shuffleFoodWeights()` L6025–6037; `chaosShuffleTick` L956.
- Score/XP multipliers: `addScore` L1832–1863 (`golden_food` ×3 at L1847; hoard clamp L1852–1857; `hazardChainMult` + the `Math.min(..., 4)` cap at L1858–1860); `awardXP` L7386–7412.
- HUD: mutator list L6236–6247, resonance label L6249–6258 (`ctx.save()`/`restore()` already correct).
- Snapshot additive: `comboCharges`/`hazardChainStreak` neighbours L2681–2683; restore L2847–2849; hazards array L2691 / L2858.
- Reset sites: `resetGame` L2140–2142, `resetWaveState` L5789–5793.
- Reachability of 2–3 mutator runs: draft gate L7924, cascade multi-pick L7855–7867, cascade unlock L6004–6009, cascade score penalty L3319–3323.

**Failure modes** — (1) *Unexplained deaths*: an auto-turn (Quantum/Chaos Theory) can steer into the body or a wall. A 90°-only rotation plus a 3-tick telegraph bounds it; the Chromium test is "draft gravity+mirror, play 60s, confirm no death without a preceding telegraph floater". (2) *Timer reset trap*: effects that re-arm every tick because `activeResonance` is recomputed at L6462 — observable as an effect that fires every tick instead of every 10–15 (white flash spam). (3) *Hunger coupling*: changing the pop interval must not make the `% 50` assumption anywhere else wrong — grep `hungerTickCounter` shows only L6430–6443 and L6469, so it is contained. (4) *Ethereal intangibility vs hazards*: `skipSelfCollision` must not leak into `isHazardCollision` (L3657) or the resonance becomes a free lava pass; assert in the running game that standing in an on-phase rift during a phase tick still kills. (5) *Determinism*: seeded runs must use `seededRandom()` for all cadences; verify by playing the same manual seed twice with the same mutators and diffing the hazard/food sequence. (6) *Snapshot*: all six new fields are additive with `|| 0` defaults, no `SNAPSHOT_VERSION` bump, so a v11 save resumes with resonances simply inactive.

**Why now / why not** — This is the #1 documented open gap and the only item that converts a *false claim in the UI* into a mechanic; for a depth-focused v12 it is the strongest single Synergy score available. The reachability story is also new: draft mode (L7924) plus the cascade unlock (L6004) means 2–3 mutator runs are actually playable now, so inert combos are no longer theoretical. Why it might wait: it is the biggest and touchiest item here — three of the eight effects sit on the death path (self-collision, hazard collision, board shrink), and each needs its own verification pass in the running game. A two-pass split (intangible/gold/quantum first, then rivalShrink/apocalypse/chaosCycle) de-risks it without shrinking scope.

---

## 2. Mutator Contracts — mutators pay out for playing into them

**Name** — Mutator Contracts

**Concept** — Every mutator currently only takes. Worse, choosing *more* of them is punished: `gameOver()` multiplies the final score by `getCascadeMultiplier()` which returns `0.5` for any count > 1 (L902–905, applied L3319–3323). So the draft screen (L6039–6092) is a menu of handicaps with a score tax, and no player picks a mutator except to satisfy the `use_mutator` quest (L1441). This idea gives each of the 8 mutators one explicit, checkable **contract** for the run — a goal that can only be met *because* the mutator is on — shown as a progress badge in the existing mutator HUD. Completing a contract pays a combo charge + score + XP; the cascade ×0.5 penalty stays, so a 3-mutator run is a wager you can win by completing contracts, not a straight loss.

Contract examples, each checkable from state that already exists: gravity → 8 eats made while falling (`dy === TILE_SIZE` at eat time); mirror → 15 eats without a rejected input (rejections already detected in `setNextDirection` L4052–4062); phase_shift → 3 eats landed on a phase tick (`gameTick % 5 === 0`); hunger_clock → 5 eats at length ≤ 5; double_rival → 5 eats while a rival is alive; golden_food → 6 rare-or-better eats; shrink_zone → 5 eats within 3 tiles of the live shrink boundary (`shrinkCols`/`shrinkRows`, L952–953); chaos_seed → 8 eats within 5 ticks of a reshuffle (`chaosShuffleTick`, L956).

**LOC estimate** — ~180 in `snake.html`: a `MUTATOR_CONTRACTS` table + `checkMutatorContracts(eatenType)` helper (~70), call sites in the eat block (normal eat L6843+; bomb branch L6804 separate; hoard/portal `extraFoods` eats L7103–7131), the HUD badge inside the existing L6236–6247 loop (~20), completion payout via `addScore`/`awardXP`/charge bank (~15), reset + snapshot (~15), plus a Playwright extension (~70).

**Scores** — Impact **4** / Feasibility **3** / Risk **4** / Synergy **5**

**Hook points (verified)**
- `MUTATOR_DEFS` L869–877 (8 mutators with icons/names — the table that would gain `contract` text).
- Draft flow: `pickDraftOptions()` L6011; `drawDraftScreen()` L6039–6092 (card render at L6059–6076 reads `def.desc`); selection handlers L7842–7890; cascade multi-pick L7855–7867; `cascadeMode` L892, unlock L6004–6009; cascade score penalty L3319–3323.
- Mutator activation sites (the conditions the contracts must be evaluated against): gravity L6417, phase_shift L6423, hunger_clock L6427, shrink_zone L6446, chaos_seed L6456, mirror L8331, `golden_food` reward L1847, `double_rival` spawn L2470.
- Eat block: bomb branch L6804–6842, normal eat L6843+, `handleComboMilestone()` L6346–6386, `hazardChainStreak` eat hook L6993–7001, `extraFoods` eats L7103–7131, echo-brew food2 eat L7043–7062.
- HUD: L6236–6247 (already loops `activeMutators` and wraps in `ctx.save()`/`ctx.restore()`).
- Reset: `resetGame` L2188–2196 (`activeMutators = []`, `draftScreenVisible`, `draftModeEnabled`), `resetWaveState` L5775–5807. Snapshot: `activeMutators` is serialized with the run; contract counters are additive fields beside L2681.
- Quest coupling already exists: `use_mutator` template L1441, `mutatorUsed` reader L1465.

**Failure modes** — (1) *Counter wired into one of four eat paths*: the eat block has a bomb branch (L6804), a normal branch (L6843), an echo `food2` eat (L7043) and an `extraFoods` eat (L7103). A contract counter in only the normal branch silently misses hoard/portal/echo eats — observable as a badge that stalls while the player is visibly eating; assert by eating a hoard bonus food and watching the badge. (2) *Contract completion during cascade re-pick*: `activeMutators.push` happens before `startGame()` (L7855–7867), so per-run contract state must be initialised in `resetGame`/`startGame`, not lazily — otherwise wave 1 of cascade inherits counters. (3) *Cascade penalty math*: the ×0.5 at L3319–3323 applies at `gameOver` only and would feel like a rug-pull if contracts paid during the run; the payout must be visibly larger than 1.5× the taxed amount, or the design is dishonest. (4) *HUD text overflow*: badges at `CANVAS_WIDTH - 5` right-aligned (L6242) with one line per mutator — a second line per mutator can collide with the resonance label at L6255 which uses the same right margin at `20 + activeMutators.length * 14`; verify in Chromium at 3 mutators that no label overlaps. (5) *Reset sites*: both `resetGame` and `resetWaveState` (invariant) must clear contracts, or a gauntlet wave inherits a completed contract and pays twice.

**Why now / why not** — Mutators are the oldest un-deepened system in the file (pre-v7), they are gated behind a token economy (`MUTATOR_DEFS.tokenCost`, `checkMutatorUnlocks` L5994) and a draft screen that already exists, and they are the only system whose *sole* score interaction is a penalty. Fixing that is pure depth with zero new UI. Why it might wait: eight bespoke counters is a wide surface for one feature, and the natural MVP is the three free mutators (`MUTATOR_BASE_POOL` L907: gravity/mirror/phase_shift) — ship those three, then extend if the contract loop reads well in play.

---

## 3. Rift Harvest — bank score by standing inside a hazard while it is safe

**Name** — Rift Harvest

**Concept** — Hazards (v10 C) already run a two-phase metronome: on for 15 ticks, off for 10 (L3602–3603). Both v11 reward systems monetise the hazard's *border* — chain bonus for adjacency (L3622–3631), combo melt for surviving entry at combo ≥ 10 (L6623–6636) — but nothing rewards entering the volume on purpose. Rift Harvest makes the **off phase** a greed window: each tick the head spends inside a hazard's radius while it is off-phase banks one "attunement" point (capped per hazard life); when the hazard flips to on, all banked points cash out as score, with a ×1.5 bonus if the player escaped to the ring's outer edge on the flip tick. Still inside at the flip = death, exactly as today. The countdown the player needs already exists in the data (`phaseTimer`), so the whole mechanic is "read the clock, decide to be greedy".
<br>Player-facing hook: a filling arc around the rift while attuning, a "HARVEST ×N" floater on cash-out, and a distinct last-2-ticks pulse so the escape is a skill, not a coin flip.

**LOC estimate** — ~110: `attune`/`banked` fields on hazard objects + the tick check and cash-out inside `tickHazards()` (L3606–3655) (~50), draw arc + escape pulse in `drawHazards()` (L4802–4846) (~30), floaters/toast plumbing (~10), snapshot additive fields (L2691 / L2858) (~6), reset (`resetGame` L2244, plus a new `hazards = []` in `resetWaveState`) (~4).

**Scores** — Impact **4** / Feasibility **4** / Risk **3** / Synergy **5**

**Hook points (verified)**
- Lifecycle + constants: `HAZARD_INTERVAL` 500 / `HAZARD_MAX_LIFE` 42 / `HAZARD_MAX_RADIUS` / `HAZARD_ON_TICKS` 15 / `HAZARD_OFF_TICKS` 10 / `HAZARD_GRACE_TICKS` 125 at L3599–3604; `hazardTickCounter` L3605; `tickHazards()` L3606–3655.
- Phase toggle (the cash-out moment): L3614–3617 (`h.phaseTimer--; if (h.phaseTimer <= 0) h.phase = ...`), radius bell curve L3619–3620.
- Existing adjacency probe (template for the inside probe): L3622–3631; `hazardAdjacentThisTick` L209, consumed by `addScore` L1859 and the gold ring L4828.
- Lethality: `isHazardCollision()` L3657–3668 (phase `'on'` + `dist <= h.radius`), called from `checkPlayerDeath` L6620 (hazard block L6620–6657, melt sub-block L6623–6636), with the Melt/shield/vampire/streak save chain.
- Spawn geometry (why a player-positioned rift is different): spawn loop L3634–3654, minimum head distance of 4 tiles at L3644, hazard literal L3645.
- Cap that the mechanic must respect: `hazards.length < 2` L3636; hazard object literal L3645.
- Rendering: `drawHazards()` L4802–4846 (calm-mode gating at L4804/L4810 is the precedent for the new arc).
- Reward plumbing: `addScore()` L1832–1863; `spawnFloater()` L916; `pushTransientRing()` L4141; `queueToast()` L7466.
- Snapshot: hazards array L2691 (add fields); restore L2858.
- Mode availability: `hazardsEnabled` true at L1256 (Classic), L1261 (Time Attack), L1269 (Daily), L1273 (Snap); false at L1265 (Zen), L1277 (Walled), L1281 (Painter), L1284 (Gauntlet) — consumed by the gate at L6323.

**Failure modes** — (1) *Phase-ordering bug*: the cash-out must fire on the exact toggle inside L3614–3617. Checking `h.phase === 'on'` after the loop reads the *new* phase and pays one tick late — observable by banking attunement and watching where the score floater lands relative to the visible flip. (2) *Free lava pass*: cash-out must never bypass `isHazardCollision` (L3657). A player parked in the centre at the flip must die with no payout — Chromium check: park inside, confirm death + zero score + the death cause string ("Caught in a hazard rift!", L6655). (3) *Score exploit*: attunement must cap per hazard life and pay once; without a cap, a wave 2 hazard's 42-tick life is 42 free points per cycle forever. (4) *Interaction with Melt (L6623–6636)*: at combo ≥ 10 the player can already survive a hazard — that must consume/zero the bank, or Melt+Harvest becomes a safe money printer; assert that entering on-phase at combo 10 pays nothing. (5) *Gauntlet leak*: `resetWaveState` (L5774–5833) does not clear `hazards` today (verified: `hazards = []` exists only at L2244) — that is harmless while hazards are off in gauntlet (L1284), and becomes a cross-wave leak the moment hazards are enabled there (see idea 4). (6) *Snapshot*: additive `attune`/`banked` on the hazard objects; a v11 save restores with zeros.

**Why now / why not** — Depth-per-LOC is the best in this document: the phase clock, the radius, the collision test and the render function all exist; the idea only adds a second way to interact with them. It also finally gives the *interior* of a hazard a purpose, complementing (not duplicating) v11's border-based chain bonus. Why it might wait: a mechanic that asks players to stand inside lava needs an unmistakable telegraph or it reads as unfair — the safe window is only ~1.2 s (10 ticks, L3603) and hazards are off in 4 of 8 modes, so the feature lands in Classic/Time Attack/Daily/Snap only.

---

## 4. Gauntlet Wave Modifiers — draft the danger systems into waves

**Name** — Gauntlet Wave Modifiers

**Concept** — Gauntlet is the mode designed for structured, escalating objectives, and it is the mode where every v9–v11 system is hard-disabled: `hazardsEnabled: false` (L1284) and no `hoardEnabled` key at all (so the hoard gate at L6325 reads `undefined` → off). Its intermission picker (L5893–5930) offers six stat buffs, three of which are handled in one loop (`applyGauntletPicks`, L5753–5772). This idea adds 4 picks that *enable a danger system for the next wave and pay for it*: **Rift Wave** (hazards on, ×1.3 wave score), **Hoard Rush** (hoard interval 750 → 250 ticks, ×1.2), **Contract Wave** (bounty interval 400 → 250 and bounty rewards ×2), **Blackout Wave** (hazards + obstacle regen halved, ×1.5). The intermission card text states the trade in one line; an active-modifier chip renders in the wave HUD. It converts the intermission from "pick a stat" into "underwrite your own danger", and it makes gauntlet the showcase for three shipped systems instead of the mode that hides them.

**LOC estimate** — ~120: 4 `GAUNTLET_PICKS` entries (~12), a per-wave modifier set consumed by the three gates (hazards L6323, hoard L6325, bounty interval L759 read at L3581) (~30), `applyGauntletPicks` cases (~15), `resetWaveState` clearing (hazards + `hazardTickCounter` + modifiers) (~10), wave-score multiplier in the `gauntlet` branch of `addScore` (L1843–1849) (~8), intermission card + HUD chip (~35), plus a Playwright extension (~60).

**Scores** — Impact **4** / Feasibility **4** / Risk **3** / Synergy **5**

**Hook points (verified)**
- `GAUNTLET_WAVES` L829–838; `GAUNTLET_PICKS` L840–847; `GAUNTLET_MASTERY_TIERS` L849–856; `gauntletPicks` L860.
- `generateObstaclesForWave()` L5743; `applyGauntletPicks()` L5753–5772 (handles `extra_length`/`wave_shield`/`slow_pace` only); `resetWaveState()` L5774–5833 (calls `applyGauntletPicks` L5830, sets `tickInterval = wave.speedBase` L5832, and **does not clear `hazards`/`hazardTickCounter`**); `completeGauntletWave()` L5835–5851; `pickRandomGauntletPicks()` L5853–5868; `startNextWave()` L5870–5880.
- Danger-system gates: hazards L6323 (`MODE_CONFIG[gameMode].hazardsEnabled`), hoard L6325–6333 (`hoardEnabled` + `HOARD_INTERVAL` L3667 / `HOARD_DURATION` L3668), bounty `BOUNTY_INTERVAL` L759 consumed in `tickBounty` L3581, obstacle timer `OBSTACLE_SPAWN_INTERVAL` L152 consumed at L7346–7362.
- `MODE_CONFIG.gauntlet` L1282–1285 (`hazardsEnabled:false`; no `hoardEnabled`).
- Score plumbing for the wave multiplier: the `gauntlet` `score_boost` block L1843–1849 is the existing precedent for a gauntlet-only score modifier.
- UI: `drawGauntletIntermission()` L5893; `drawGauntletHUD()` L5930; `drawGauntletCompleteScreen()` L5971.
- Per-wave reset reality: `gameTick = 0` in `resetWaveState` (L5806) means `HAZARD_GRACE_TICKS = 125` (L3604) would suppress hazards for an entire short wave.

**Failure modes** — (1) *Cross-wave hazard leak* — the highest-probability shipped bug here: `hazards = []` appears **only** at L2244 (`resetGame`); `resetWaveState` never clears them. Today it cannot bite because gauntlet has hazards off; the moment a pick turns them on, a rift from wave 3 is still lethal on wave 4's fresh board. Chromium check: pick Rift Wave, finish the wave, screenshot wave 4's board and assert zero rifts. (2) *Pick does nothing*: with `gameTick` reset to 0 (L5806) and `HAZARD_GRACE_TICKS` 125 (L3604), wave 1 (duration 125, L834) ends before a single hazard spawns → the pick is a silent no-op. The modifier must override the grace. Observable: pick Rift Wave and count hazards in the first 30 s. (3) *Const intervals*: `HOARD_INTERVAL`/`HOARD_DURATION`/`HAZARD_*`/`BOUNTY_INTERVAL` are `const`s consumed deep in tick functions; a wave-scoped override must be read at those consumption sites, or a "short hoard" runs 90 s. (4) *True→false flip*: turning `hoardEnabled`/`hazardsEnabled` into a function of the current wave means the *previously* stored `hoardActive`/hazards must be cleaned when the modifier expires, or wave 5 inherits wave 4's active hoard. (5) *Score honesty*: the wave multiplier is applied in `addScore` while `gauntletWaveScore`/`gauntletScore` accumulate at L5836–5837 — verify the recap/total shows the multiplied value once, not twice.

**Why now / why not** — Gauntlet has the least content of any mode (5 fixed waves, 6 picks, 3 implemented), while every system it would showcase is already tick-counted and gated behind a single boolean read at one site each — the wiring cost is unusually low and the mode gets a reason to exist beyond mastery points. It also *forces* the latent `resetWaveState` hazard-clearing gap to be fixed, which is a real correctness win. Why it might wait: a run-death-ends-all mode plus two new sources of instant death can be punishing; the score multipliers must be tuned so a Rift Wave is a choice rather than a trap.

---

## 5. Threat Clock — an escalation ladder that pays the player for danger

**Name** — Threat Clock

**Concept** — Every danger system in the game runs on a fixed cadence forever (`HAZARD_INTERVAL` 500 L3599, `HOARD_INTERVAL` 750 L3667, `BOUNTY_INTERVAL` 400 L759, obstacles every 200 L152). The only thing that scales with player skill inside a run is snake speed (`getSpeed()` L1800). So a 10-minute run is *safer* than a 3-minute run once the player knows the board. Threat Clock adds a score-derived escalation ladder (0–4): each step tightens the hazard/hoard/bounty cadences by ~12 %, raises the concurrent hazard cap, and adds a matching score multiplier (+8 % per step, injected beside `hazardChainMult` in `addScore`, under the existing ×4 cap). The HUD shows `THREAT 3 ×1.24` next to the combo-bank badge, and each step-up fires a flash + toast. It's a run arc: the player earns more danger and more points at the same time, and the reward for a long run becomes visible instead of implicit.

**LOC estimate** — ~120: a `THREAT_TIERS` table + `getThreatLevel()` (score-derived, no new per-run state beyond a `lastThreatLevel` for the step-up event) (~35), a `threatAdjusted(interval)` helper replacing the raw const reads at the three consumption sites (L3581, L3636, L6328) plus the obstacle timer (~20), hazard cap + grace scaling (~12), `addScore` multiplier injection (~8), HUD badge modeled on `drawComboBankHUD` (~30), step-up toast/flash + reset (~15).

**Scores** — Impact **4** / Feasibility **3** / Risk **4** / Synergy **4**

**Hook points (verified)**
- Fixed cadences (the things being laddered): `HAZARD_INTERVAL` L3599 / `HAZARD_GRACE_TICKS` L3604 / spawn branch L3634–3654 / cap `hazards.length < 2` L3636; `HOARD_INTERVAL` L3667 / `HOARD_DURATION` L3668 / gate L6325–6333; `BOUNTY_INTERVAL` L759 / consumed L3581; `OBSTACLE_SPAWN_INTERVAL` L152 / consumed L7346–7362.
- Score injection: `addScore` L1832–1863 — `hazardChainMult` at L1858–1860 and the `Math.min(totalMult, 4)` cap are the exact seam for a threat multiplier.
- Skill-scaling precedent (what NOT to double up on): `getSpeed()` L1800, `getEffectiveSpeed()` L1806–1815.
- HUD precedent: `drawComboBankHUD()` L5507–5522 (`ctx.save()`/`ctx.restore()` discipline, called after `drawXPBar` L5469); grid-depth HUD convention documented in AGENTS.md.
- Visual escalation: `drawPostFX()` L5546 (existing tint seam), `queueGameEffect('flash', ...)` L388.
- Reset: `resetGame` L2135–2288 (`lastThreatLevel` must go here); `resetWaveState` L5774–5833 for gauntlet waves.
- Mode gating to respect: `hazardsEnabled` per mode L1256–1284 and the hazard gate L6323.

**Failure modes** — (1) *Cornering the player*: `hazards.length < 2` (L3636) is a hardcoded cap; raising it to `1 + threat` on a 30×20 board with only `isHazardCollision` (L3657) as a safety net can seal off the food lane. Cap by board area and re-verify visually at threat 4 with two rifts on-phase. (2) *Tick calibration trap*: the context file calls out that calibrating cadences for 60 fps shipped as a bug twice. A percentage shortening of an existing tick count is safe; hardcoding new absolutes is not — the helper must scale the *existing* tick constants, never replace them with ms values. (3) *Daily determinism regression*: the ladder is score-derived and score is deterministic in daily, but shortened intervals change hoard/bounty *order*, which the v11 determinism test covers. Verify by running the same daily seed twice and diffing hazard positions at a fixed tick — if the "same board for all players" claim breaks, that is a shipped regression, not a new feature. (4) *Promise mismatch in hazard-free modes*: Zen/Walled/Painter/Gauntlet must not display `THREAT 4` while nothing can spawn; either gate the ladder per mode or drive those modes from the multiplier only. (5) *Flash contention*: `flashOverlay` is written by both loops (documented fragile pattern); a step-up flash during a level-up decay can be swallowed — acceptable, but do not add a third writer.

**Why now / why not** — Every danger system already reads one interval at one gate, so a single escalation multiplier reaches all of them for very little code; v11's streak ladder shows the project is comfortable with visible progress ladders. Why it might wait: it is the most balance-sensitive idea here (the numbers need playtesting) and it touches the Daily determinism guarantee, which is a *shipped* promise — the one item on this list where a mistake is a regression rather than a missing feature.

---

## 6. Bounty Streak — contracts chain inside a run

**Name** — Bounty Streak

**Concept** — Bounties are fire-and-forget: one spawns every 400 ticks (L759) from five templates (L3519–3525), and it either completes or expires into a toast (L3590–3594). Nothing carries between contracts. Add a per-run chain: completing a contract without letting one expire increments `bountyStreak`; each level raises the next contract's reward by +25 % and its target by +1, so the chain gets harder and richer, and at streak 3 and 5 the completion also banks a combo charge. Expiring any contract resets the streak with a distinct toast. The player now has a reason to prioritise the contract over the food they were already chasing, and the chain gives the bounty system a reason to exist past the first completion.

**LOC estimate** — ~80: `bountyStreak` state beside `activeBounty` (L757) (~3), target/reward scaling in `spawnBounty()` (L3536–3554) (~12), increment + charge bank in `checkBounty()` (L3556–3576) (~15), reset-on-expiry in `tickBounty()` (L3578–3597) (~6), snapshot additive (~4 at L2750 / L2912), resets (~4: L2151, L5799), HUD/streak label in the bounty ring (~20 in `animateVisuals`) or a floater, plus a Playwright extension (~40).

**Scores** — Impact **3** / Feasibility **4** / Risk **3** / Synergy **4**

**Hook points (verified)**
- `BOUNTY_TEMPLATES` L3519–3525 (5 kinds: score/food/combo/length/speedFood); `pickBountyTemplate()` L3526–3535 (filters `speedFood` out of zen/painter/walled); `spawnBounty()` L3536–3554 (already scales `target` from live state at L3540–3543 and stores `baseline`); `checkBounty()` L3556–3576 (completion payout L3565–3575, cash-in ring L3572–3573); `tickBounty()` L3578–3597 (`hoardActive` stasis at L3588, expiry L3590–3594); `activeBounty` L757; `BOUNTY_INTERVAL` L759.
- Payout seams: `addScore` L1832, `awardXP` L7386, combo-charge banking cap at L6372–6373.
- Snapshot: `activeBounty: activeBounty` L2750, restore `data.activeBounty || null` L2912; reset `resetGame` L2151–2152, `resetWaveState` L5799–5800.
- HUD precedent for the ring/urgency display: v9 F2 in `animateVisuals`, plus `spawnFloater` L916 and `queueToast` L7466.

**Failure modes** — (1) *Unbeatable targets*: `spawnBounty` already adds score-scaled difficulty (L3540–3543); multiplying a streak bonus on top can produce "score +400 in 120 ticks". Clamp the compounded target and verify in Chromium that a streak-4 score contract is still completable. (2) *Hoard freeze breaking the chain*: `tickBounty` returns early during `hoardActive` (L3588), so the countdown does not tick — the streak reset must not fire from that frozen state (observable: complete a chain, trigger a hoard, watch the streak reset with no expiry toast). (3) *Charge cap*: banking must respect the existing `< 5` guard (L6372). (4) *Wrong reset site*: a gauntlet wave restart (L5799) should clear the streak; a Classic death obviously must. (5) *Rejected-idea overlap*: this is neither hijack (no cross-system override) nor rival-hunting (no AI change) — state that explicitly in the design doc, since the reviewers rejected two bounty-adjacent ideas in v11.

**Why now / why not** — Bounty is the thinnest post-v8 system (5 templates, zero within-run progression) and its `baseline` snapshot (L3552) already stores everything a scaling scheme needs; the payout currency (combo charges) already exists. Why it might wait: bounty has already attracted two rejections, so a reviewer may read any bounty work as re-treading — the honest pitch is "self-contained chaining inside one system", not "bounty interacts with everything".

---

## 7. Rift-Tainted Food — uneaten food poisons the spot where you left it

**Name** — Rift-Tainted Food

**Concept** — Ignoring food is currently free: a food never expires, and the regen path only fills an empty slot (L7316–7321). Only one food type carries an *eat-or-skip* decision today (bomb, 0 pts, L6804). Rift-Tainted Food adds a second: a rare tier whose timer is tick-counted and visible; eat it in time for a premium payout and a "Defused!" floater, or leave it and it erupts **on its own tile** into a hazard — typically on the route you were using. Because hazards otherwise spawn at least 4 tiles from the head (L3644) and at most 2 at a time (L3636), a player-created rift at a chosen board position is a genuinely different pressure: it is *your* routing that decided where the lava goes.

**LOC estimate** — ~110: `FOOD_TIERS.taint` entry + weight rebalance (~6), Walled exclusions in `pickRandomFoodType` (L1887–1890) and `shuffleFoodWeights` (L6029) (~4), timer + eruption beside the hunter tick (L6750–6752) (~25), eruption → `hazards.push` with cap handling + replacement food + telegraph ring (~25), eat-side premium + `hasSeenTaint` toast (pattern L742–744) (~15), `drawFood` case + labels (~20), echo-brew coercion (L7033) (~2), snapshot additive `taintAt` (~6), plus a Playwright extension (~50).

**Scores** — Impact **3** / Feasibility **3** / Risk **3** / Synergy **4**

**Hook points (verified)**
- `FOOD_TIERS` L1288–1303 (weights currently sum to 1.00: common .33 / uncommon .25 / rare .12 / epic .03 / bonus .13 / speed .05 / hunter .05 / bomb .04 — the invariant; `pickRandomFoodType` L1875–1899 now normalizes by `totalW` L1891–1897, but the Walled-filtered table must stay sane).
- Walled filters: L1887–1890 (`k !== 'hunter' && k !== 'bomb'`) and `shuffleFoodWeights` L6029.
- Spawn/timer seams: `generateFood()` L1942–2016 (`spawnTime` set at L1938 in the placement path; hunter/portal handling L1995–2006); the hunter tick site L6750–6752 (`food.type === 'hunter' && gameTick % HUNTER_MOVE_INTERVAL === 0`) is the template for a tick-counted taint timer; `HUNTER_MOVE_INTERVAL` L1902.
- Eruption target: `hazards.push({...})` L3645 with the cap at L3636 and grace at L3604; `pushTransientRing` L4141 for the telegraph.
- Eat paths that must handle the new type: bomb branch L6804–6842, normal eat L6843+, echo-brew coercion `f2Type` L7033, `extraFoods` eats L7103–7131.
- Rendering: `drawFood()` L4853–5058 — note the `default:` case at L4996 draws a plain square, so a tier without a case still renders (badly); labels `L5005` (absence = no letter) and `hcLabels` L5020 (absence = `'?'`). Legend L4205 auto-includes new keys; painter color picker `tierKeys` L6979 also auto-includes.
- Snapshot: `food` object L2673 (has `spawnTime` from the rAF clock — the taint countdown must be tick-based, so it needs an additive `taintAt` or it desyncs under slow-mo/speed food).
- Magnet behaviour to decide: L7191 (primary food skip list) — a tainted food should probably be *pullable*.

**Failure modes** — (1) *Weight-table arithmetic*: `common` must drop by exactly the new tier's weight or the last tier in iteration order absorbs the drift. Verify by sampling 2000 `pickRandomFoodType()` calls in the console and comparing frequencies. (2) *Eruption past the hazard cap*: a naive `hazards.push` creates a third concurrent rift and silently retires the `hazards.length < 2` invariant the spawner relies on. Handle by extending an existing rift's life or skipping the eruption with a fizzle. (3) *Instant death*: if the head is standing on the food tile when it erupts (it cannot eat it without triggering, since eating clears the taint — but the *adjacent* tile can be lethal) — require a one-tick telegraph ring and exclude the head tile. Chromium check: let a tainted food expire while circling it; confirm the rift appears with a ring and that death is survivable by stepping out. (4) *Snapshot desync*: using `spawnTime` (`performance.now()`, L2673) for the countdown makes it wall-clock and breaks under slow-mo — the timer must be `gameTick`-based per the tick-counting invariant. (5) *Walled mode*: hazards are off there (L1279 `hazardsEnabled:false`), so an eruption would create a lethal rift in a mode with no hazard support and no hazard rendering path — exclude the tier (L1887) and verify in Walled. (6) *EXPLORER*: context says keep the 6-type threshold; a 9th type must not change it.

**Why now / why not** — It creates the game's second genuine eat-or-skip decision and it couples the food table with the newest danger system; the eruption-is-where-you-left-it twist is a routing mechanic, not a spawn tweak. Why it might wait: adding a `FOOD_TIERS` entry touches the most-cited fragile invariant in the codebase plus six peripheral sites (Walled filters ×2, echo coercion, magnet, legend, painter picker, `EXPLORER`), so the coupling cost is higher than the ~110 LOC suggests.

---

## 8. Risk Income — combo charges earned by taking risks, not only by eating safely

**Name** — Risk Income

**Concept** — Combo Bank charges are banked on exactly one event: a combo milestone (L6370–6380). That means the bank's three abilities are fed exclusively by the *safest* play pattern — continuous eating. Turn the bank into a risk ledger by banking a charge from events that already exist and are already dangerous: completing a bounty (L3565–3575), every third consecutive hazard-chain eat (L6993–7001), triggering the Hoard Pigment Rush (L7120–7131), and reaching Titan/Apex (L2532–2537). The cap (5), the X/Z controls (L7954–7962), the HUD (L5507–5522) and the snapshot all stay exactly as they are — no new UI, no new state, no new mechanic, just new income. The gameplay effect is that routing toward danger now pays in *agency* (Clears, Magnet pulses, Teleports) rather than only in score.

**LOC estimate** — ~45: one `bankComboCharge(source)` helper (~15), four insertions at existing event sites (~12), the first-time toast guard reuse (`hasSeenComboBank` L779, L6375–6378) (~8), and nothing else — `comboCharges` already round-trips through the snapshot (L2681 / L2847) and both reset sites (L2140 / L5789).

**Scores** — Impact **3** / Feasibility **5** / Risk **2** / Synergy **5**

**Hook points (verified)**
- Banking site: `handleComboMilestone()` L6346–6386, charge bank + onboarding at L6370–6379 (`if (comboCharges < 5) { comboCharges++; ... }`).
- New income sites: `checkBounty()` completion L3565–3575; hazard-chain increment at the eat site L6993–7001 (note the counter also resets at L7001, L6844, L6631, L6654); pigment-rush trigger L7120–7131; `triggerEvolutionIfReady()` L2532–2537 (a `while` loop, so a multi-tier jump must bank at most one charge).
- Spend side (unchanged): `spendComboCharge()` L4064–4119 (Clear/Magnet/Teleport with per-mode no-op guards), key handler L7954–7962.
- HUD (unchanged): `drawComboBankHUD()` L5507–5522 (`⚡[FULL] x5` at L5518 already handles the cap).
- Snapshot/reset (unchanged): L2681, L2847, L2140, L5789.

**Failure modes** — (1) *Charge inflation*: with bounties every ~400 ticks and hoards every ~750, a long Classic run could keep the HUD at `FULL` permanently (L5518), turning Clear into a spam button that deletes obstacles as fast as they spawn (L7346–7362). Play a 5-minute Chromium run and count spends; if it reads FULL most of the time, raise the cost of Magnet/Clear to 2 charges. (2) *Stale chain reads*: `hazardChainStreak` is reset in four places (L6631 hazard-melt, L6654 hazard death, L6844 bomb eat, L7001 non-adjacent eat) — the "every third" banking must read the streak at the eat moment, not from a cached value, or a broken chain still pays. (3) *Double-banking*: the evolution trigger is a `while` loop (L2532–2537); a food2 stack that jumps two tiers would bank twice in one tick — clamp per call. (4) *Gauntlet parity*: `resetWaveState` already zeroes `comboCharges` (L5789), so wave-scoped inflation is self-limiting; confirm the bounty-completion site does not pay on the bounty *that was cleared by the wave transition*.

**Why now / why not** — Cheapest high-synergy change in this document: it makes v11's two hazard systems (chain bonus, combo melt) feed v10's bank, closing a loop between three shipped systems with no new state, no new UI and no snapshot change. Why it might not be a headline: it is tuning, not a mechanic — the right home for it is as a supporting change riding along with idea 1 or idea 3, and if it lands, the spend-mode costs may need an explicit balance pass (which is a design-owner decision, not an implementation detail).

---

## Top 3 picks

**1. Resonance Completion (idea 1).** It is the only item on this list that converts something the game *already tells the player* into something true. `RESONANCES` L881–890 advertises eight synergies, the HUD proudly prints their names (L6249–6258), and five of them are dead code — including one, `rivalShrink`, whose own unwired call site is documented in a comment at L2554–2557. It also scores highest on Synergy by construction: it plugs into score (L1847–1860), hunger (L6427–6443), shrink (L2559), self-collision (L6565), inputs (L6504–6515), rendering and the snapshot, and it removes a latent `Math.random()` determinism leak at L6464 while doing it. Ship it in two passes (Ethereal/Chaos Gold/Quantum first, then Pressure Cooker/Famine Feast/Chaos Theory/Apocalypse) and it stops being a risk-4 item.

**2. Rift Harvest (idea 3).** Best depth-per-LOC in this document. Hazards already have a phase metronome (L3602–3603), a radius (L3619–3620), a collision test (L3657) and a render function (L4802) — v11 taught players to hug the *border* of a rift for chain bonus, and this teaches them to step *inside* it on a clock. ~110 LOC, no new entity, no new UI panel, and the only new hazard-math is a cap and a cash-out on the flip tick. It also pairs naturally with idea 8 (Risk Income) so danger pays twice: score and charges.

**3. Gauntlet Wave Modifiers (idea 4).** The only idea that adds *content* to the mode with the least of it, using three systems that are each gated behind a single boolean — and it forces a real correctness fix that nothing else will: `resetWaveState` (L5774–5833) never clears `hazards` (verified: `hazards = []` exists only at L2244). Turning hazards on in a wave is exactly the change that would expose that leak, so the feature and the bug fix land together. It also makes the intermission a design surface (risk for wave score) rather than a stat menu, which is the deepest thing gauntlet can do without new waves.

*(Honourable mention, cheap rider: **Risk Income**, idea 8 — 45 LOC, risk 2, and it closes the hazard → bank loop that v10/v11 left open. If v12 ships only three items, this is the one to fold into another.)*
