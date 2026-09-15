# Snakes v13 — Design Plan

> **Revision 2.** Incorporates both independent design reviews (`v13-review-1.md` correctness /
> `v13-review-2.md` design). Every blocking finding was re-verified against `snake.html` by hand
> before being accepted; the changes are marked **[R1]** / **[R2]** / **[R1+R2]** inline. Both reviews
> converged on the same two fatal defects, and both proposed the same structural fix: **delete the
> `rivalHeadOnIdx` flag and resolve every contact where the post-move positions actually meet.**

## Overview

**Theme: the rival must be fair, legible, and actually dangerous.**

JC's report was three symptoms: *"it starts too long, should warn before appearing"*, *"I don't
understand why I sometimes run through it, right after it appears"*, and *"make it slower maybe?"*.
The investigation says the first two are real and separable, and the third is a misdiagnosis of the
first — but the fix it implies is still worth shipping, for a different reason.

**Baseline:** master `e2851ac`, `snake.html` 9174 lines, 174 assertions across 13 Playwright suites —
**all green, verified before any edit** (22 s for the full sweep). That is precisely the point: v11 and
v12 both shipped green over a broken game.

**Selected:** 7 items, ~230 LOC production + a new `test-v13.mjs`.

### What the investigation found

The rival is a **v5-refactor regression cluster**, not a tuning problem. `git log -S` pins commit
`6c8857b` ("feat: v5 …") as the moment three load-bearing behaviours changed, and all three are still
wrong today:

| v4 (`2608064:snake.html`) | today (`snake.html`) | consequence |
|---|---|---|
| `rivalSnake.pop()` then `unshift(rNewHead)` — a real 1-tile/tick move | `r.snake.unshift(newHead); if (r.snake.length > RIVAL_MAX_LENGTH) r.snake.pop();` (**L3404-3405**) — the pop only fires past length 20 | **the rival grows +1 segment every tick, reaching length 20 in 19 ticks (~2.3 s) without eating anything** |
| `playerBodyHit` → rival dies when it rams the player's body (+50 pts, +100 XP) | **deleted entirely** | the rival is a ghost through your body |
| 1-ply look-ahead (`selfCollision \|\| obsCollision` → re-route) | food-axis chase only (**L3342-3380**) | the rival suicides, and stalls steering *away* from food |

So the shipped rival is **a 20-tile wall that phases through the player, through obstacles and through
hazards, and evaporates on contact with the player's head** — the inverse of the designed "AI nemesis",
and it explains all three of JC's symptoms:

- **"starts too long"** — **[R2] corrected reading.** The rival does not *start* long; it starts at
  **length 1** (`L3329`, measured `startLength: 1`) and inflates to 20 in 19 ticks of empty movement.
  The plan previously called JC's phrase "literal", which its own evidence refutes. What *is* true is
  that within two seconds the rival has silently become a 20-tile wall, and `drawRivalHUD` prints
  `Rival: 20` from then on. Feature A fixes that curve; Feature C is a **new feature** (the missing
  telegraph), not a symptom of A. Keeping them separate matters: A alone leaves JC's actual request
  unbuilt.
- **"I sometimes run through it"** — it is not a pass-through; it is an **inverted collision**
  (finding F1). Charging the rival head-on *destroys the rival* and credits you with a kill.
- **"make it slower"** — **[REFUTED as stated]**. Measured: both actors move exactly 1 tile/tick at
  *every* setting (`tickInterval` scales both identically), so no speed asymmetry can exist in either
  direction. The player never outruns the rival; the *wall* is what felt fast. Feature E is retained
  but re-specified: it must be defensible on its own terms (**[R2]** — see Feature E).

### F1 — the inverted collision, measured

Tick order today: player moves → `checkPlayerDeath(wrappedHead, …)` at **L7214** (the rival test at
**L7157-7207** compares the player's *new* head against the rival's *pre-move* segments) → **then**
`updateRival` at **L7797-7801**, ~590 lines later. The two are never compared at the same instant.

| Scenario | Measured (probe, this tree) | Issue's claim |
|---|---|---|
| Head-on, gap **2** tiles | `playing`, rival `active=false`, **`stats.rivalsDefeated` +1**, cause empty | CONFIRMED |
| Head-on, gap **1** tile | `gameover`, `'You were caught by the rival!'`, no credit | CONFIRMED |
| Rival **rams** a perpendicular player head | player untouched, rival destroyed, **+1 credit** | new (same root cause) |
| Rival tangles itself (`S5`) | rival removed, **+1 credit**, player never involved | new — the inflation source |

`updateRival`'s head-on branch (L3440-3445) is the culprit: `playerHead === newHead` → `removeRival`,
and `removeRival` (L3463) unconditionally credits a defeat. **Charging a rival head-on is the safest
way to kill it**, and it inflates `RIVAL_SLAYER`, `meta_rival_slayer` and the 25/100 rival milestones.

### The design of record

`docs/superpowers/specs/2026-05-18-snake-living-arena-design.md` L26-35 states the collision contract
that was never implemented. v13 restores it **verbatim**, because it is already complete, symmetric
and legible — and because it settles the game-feel question the reviews raised:

```
- Player head touches rival body → player dies
- Player head touches rival head → player dies
- Rival head touches player body → rival dies with particle explosion + bonus XP
- Rival head touches player head → player dies
- Rival self-collision             → rival dies
- Rival Death: 20 particles, +100 XP + 50 bonus score, toast "Rival Defeated!"
- Rival Growth: +1 segment per food eaten, max length 20
```

**No mutual destruction.** **[R2]** rejected the original plan's "both die" rule: it is a new rule JC
did not ask for and it contradicts the spec. Under the spec rule the rival *wins* a head-on, which is
what makes it dangerous; the counterplay is to block it with your body, which is also what makes the
body worth having.

### Three more findings the issue did not list

- **Self-crash is credited to the player.** The self-hit path (L3399-3401) routes through the same
  `removeRival`, so a rival that tangles itself pays you a defeat (measured `S5`: 0 → 1). With the
  growth bug this is the *dominant* defeat source.
- **The leech counter-kill backfires above length 4.** L7161-7177 drains ≤3 segments and only removes
  the rival at length ≤1; the same loop iteration then falls through to the segment test (L7180-7207)
  and finds the rival's head still on the player's tile → **the player dies**. With the growth bug the
  rival is almost always length 20, so the advertised head-to-head counter is a death sentence.
- **The rival's body colour is the most common food's colour.** `FOOD_TIERS.common.color === '#FF4444'`
  (L1443) and rival 0's body is `'#FF4444'` (L3310). Visually confirmed on a rendered board.

---

## Feature A — Rival movement integrity (the root cause)

**Concept.** Mirror the player's movement contract exactly: vacate the tail, grow only by eating.

Three defects in two lines (L3404-3409): (1) no per-move tail vacate → free growth; (2) the eat branch
pushes a **duplicate of the head's own coordinates**, so one food = **+2** length and the body silently
holds two identical cells (measured: a length-3 rival eating ends at **5**, `dupes: true`); (3) the
self-hit test (L3393-3402) runs *before* any vacate, so the rival dies on moves the player survives
(compare the player: pop at L7014, test at L7063/L7214).

**Why this lands first.** One line region, a git-verifiable v4 baseline, and *every other finding in
this plan is reasoned on top of it*: "1 tile/tick", "3 tiles away", "the leech counter works", "the HUD
says Rival: 20" are all statements about a creature that is 20 segments long two seconds after spawn.

**Change.**
1. `willEat` computed from `newHead` **before** the move.
2. `rTail = r.snake.pop()` — vacate *before* the self test (player parity).
3. Self-hit scan over the vacated body; on hit → `removeRival(idx, false)`.
4. `unshift(newHead)`; if `willEat` → `push(rTail)` and run the eat block.
5. **[R1] Delete L3408's `r.snake.push({ x: newHead.x, y: newHead.y })`.** The old plan said "run the
   existing eat block unchanged", which would have re-shipped the exact duplicate-push defect the
   feature exists to delete (+2 per eat, two identical cells) and left the rival permanently one
   segment over `RIVAL_MAX_LENGTH` (pop→19, unshift→20, push(rTail)→21, push(newHead)→22, pop→21).
   With step 4 applying the growth, L3409's cap stays.
6. **[R2] Spawn at length 3** (`RIVAL_SPAWN_LENGTH`), per the spec's "Rival Growth" section, laid
   backwards from the spawn tile along `−dx` with wrap normalization, truncating to whatever prefix is
   free. With growth-by-eating restored, a fresh rival must have *some* presence — otherwise Feature F
   is drawing a single 20×20 px dot as "the least legible object on the board". The telegraph ghost
   renders the whole 3-tile body, so the length-3 start is telegraphed too.

**Hook points.** `updateRival` L3393-3409; `spawnRival` L3329.

**LOC:** ~20.

**Scores:** Impact 5 / Feasibility 5 / Risk 2 / Synergy 5.

**Failure modes.**
- *The eat block's duplicate push survives.* One food grows the rival by 2 and stacks cells.
  **Catch:** drive 10 direct `updateRival` calls with food on each step; assert **+1** length per eat
  and `new Set(body.map(JSON.stringify)).size === body.length`.
- *The self test runs before the vacate.* **Catch (geometry that can actually observe it — [R2]: the
  original "straight line" version could not, because in a straight line the head never re-enters the
  vacated tail tile):** lay a length-4 rival in a **U-turn** so its next head tile *is* its own tail
  cell; drive one standalone move; assert the rival is still active. Then repeat with a rival whose
  next tile is its own *neck* (`body[1]`); assert it dies.
- *`willEat` drifts from the eat block.* The epic/portal-twin cleanup and the Pressure Cooker
  resonance live in that block. **Catch:** place an epic on the rival's next tile; assert the portal
  twin is removed and the shrink zone advanced (`test-v12.mjs` A14 already does the latter).

**Verification in the running game.** Force-spawn on an empty board, let it run 40 real ticks with the
player parked: the drawn length must stay ≤ 3 and `drawRivalHUD` must not read `Rival: 20`. Screenshot.

---

## Feature B — Contact resolution, rebuilt to the design of record (flagship)

**Concept.** Two changes, one idea: **the rival moves first, and every contact is resolved where the
post-move positions actually meet.** No flags, no new module state, no reset obligations.

**B1 — hoist the rival block.** Move the respawn-timer loop (L7787-7793), the `updateRival` loop
(L7797-7801) and the `if (gameState !== 'playing') return;` guard (L7803) to immediately after the
`rivalFreezeMs` decay at **L6815**. The player's move, direction consumption and `snake.pop()`
(L6997-7020) stay put, so `checkPlayerDeath` at L7214 now runs against the rival's **post-move** body
and the save chain is reached exactly as today.

*Why hoist rather than duplicate:* `checkPlayerDeath` (L7061) and `tryStreakChargeSave` (L7045) are
closures declared inside `updateGame` over `teleportSavePos`/`wrappedHead`; `updateRival` is
top-level and cannot call them. Hoisting keeps **one** copy of the load-bearing
shield → phoenix → streak → death order.

**B2 — delete `updateRival`'s head-on branch** (L3440-3445) and resolve every contact in
`checkPlayerDeath`'s rival loop, where both post-move positions are known. **[R1+R2] This replaces the
original plan's `rivalHeadOnIdx` flag entirely.** Both reviews independently showed the flag could not
work: it was set by the branch that calls `removeRival`, which empties the body and clears `active`,
and *both* guards the consumer sits behind (`if (rivals[rci].active)` L7159, the
`rcj < rivals[rci].snake.length` bound L7180) are then false. Measured with the hoist emulated: the
gap-1 swap still yielded `{"state":"playing","defeated":+1,"rivalActive":false}` — the free kill the
feature is named for, shipped inert. The flag also manufactured a *new* kill class: with the hoist,
`snake[0]` is the tile the player is about to vacate, so the head-on predicate fired on pure
near-misses (measured: today `playing`/no change → hoisted `defeated:+1`). Deleting it removes the
flag, both reset obligations, and the whole class.

**B3 — the three contact rules, all evaluated on post-move positions.**

| # | Rule | Implementation site | Outcome |
|---|---|---|---|
| 1 | Player's post-move head ∈ any active rival's post-move body | existing segment loop, L7180-7207, unchanged | **player dies** (shield → phoenix → streak → death). Covers both "player head → rival body" and "→ rival head" — when the heads meet, `rcj === 0` and the same chain runs. |
| 2 | Rival's post-move head ∈ the player's post-move body | **new** `resolveRivalRams()`, called once after the player's move is committed | **rival dies, credited, rewarded** (`removeRival(idx, true)`) |
| 3 | Rival self-collision | `updateRival`, L3399-3401 | **rival dies, NOT credited** (`removeRival(idx, false)`) |

Rule 2 needs no new state: `checkPlayerDeath` runs with `snake` already popped (L7014), so the player's
post-move occupancy is exactly `wrappedHead ∪ snake`. Rule 2 is therefore `r.snake[0] ∈ snake` **after
the head is committed** — and because rule 1 runs first and returns on a hit, reaching rule 2 proves
`rivalHead !== playerHead`, so the head-on case can never be double-resolved. **[R1]** The original
plan tested the rival's head against the player's *pre-move* body inside `updateRival` (which the hoist
makes `snake` *before* the pop), so a rival simply following the player was destroyed — and credited —
for entering the tile the player was vacating. Testing after the commit removes that class.

**B4 — `removeRival(idx, defeatedByPlayer)`** — the flag becomes a required argument, and the credit
table becomes explicit:

| Caller | Credit | Why |
|---|---|---|
| Rival self-collision (L3400) | **no** | the player did nothing; this is the `RIVAL_SLAYER` inflation |
| Rival rams the player's body (new) | **yes** | the design of record's explicit reward |
| Leech drain to ≤1, or a drain that resolves a lethal overlap (L7174) | **yes** | the v6 design of record |
| Head-on (heads meet) | **n/a** | the player dies; the rival is **not** removed at all |

A credited removal also pays the spec's reward — `addScore(50)`, `awardXP(100)`, a floater and
`queueToast('⚔️ Rival defeated!', 1500)`. Today a kill yields only 20 particles (L3454-3456), which is
why "actually dangerous" needs it: the rival must be worth killing.

**B5 — the leech fix.** On a drain that leaves the rival at length > 1 **and** the player's head on the
rival's head tile, `removeRival(rci, true)` and `continue` past the segment test — the drain *resolved*
that contact. **[R1]** The original plan removed the rival on *any* drain above length 1, silently
turning the Brew into an unconditional delete; this narrower rule keeps the partial drain intact.
**[R2] Update the `leech` descriptor** (L1103, "Head-to-head with rival → steal 3 segments") in the
same commit, since v13 is the cycle that claims nothing advertised is a lie.

**[R1+R2] The hoist's accepted consequences, stated rather than discovered:**
- Food competition flips in the rival's favour by one tick (the rival's eat now precedes the player's).
  That is a deliberate part of "actually dangerous", and it is asserted directly (Feature B's gates).
- `checkAchievements`/`checkQuestProgress` (L7496-7497) now see the same tick's `stats.rivalsDefeated`
  increment — a one-tick-earlier `RIVAL_SLAYER`/quest unlock. Accepted.
- The `gameState` guard's skipped set changes: a rival-eat that ends the run through the Pressure
  Cooker (L3432-3436) now skips `tickResonance()`, `gameTick++`, the direction consume, the Time
  Attack clock, `lastTickTime` and `visualDirty`. The frame is not stale (`gameOver()` sets
  `visualDirty` and calls `drawGame(1)`), and with `double_rival` rival 1 still moves after rival 0's
  kill because the guard stays *after* the loop. The in-code comment at L3429-3431 ("the caller's
  tick-tail guard") must be corrected.
- **`test-evolution.mjs` is invalidated and must be fixed in the same change. [R1+R2]** Only
  `test-v12.mjs` A14 drives `updateRival` directly; `test-evolution.mjs:175-196` builds a rival with
  **no `dx`/`dy`** and calls `updateGame()`, relying on the leech adjacency reading the rival's
  pre-move head. Measured over 200 samples with the hoist emulated: the leech fires **79/200**;
  **75/200** the rival's own first move lands on its own body segment and it self-removes; **46/200**
  produce a `NaN` head. The fixture gets an explicit `dx`/`dy` and a geometry that holds post-hoist.

**LOC:** ~75.

**Scores:** Impact 5 / Feasibility 3 / Risk 4 / Synergy 5.

**Failure modes and their catches.**
- *A free kill survives in some geometry.* **Catch:** the contact matrix as four explicit
  assertions — charge from 1 tile, charge from 2 tiles, perpendicular ram while the player flees, and
  the two-heads-same-tile case. Each asserts `gameState`, `lastDeathCause`, `lastSaveEvent` and the
  `stats.rivalsDefeated` **delta**. The plan previously offered a screenshot here; **[R2]** showed
  that is inverted — the free kill's tick tail is byte-identical to a legitimate kill
  (`removeRival` fires the same 20-particle burst), so a screenshot of JC's bug renders it as success.
- *A save is bypassed on the new paths.* **Catch:** one head-on per save type — **including shield**,
  which the original list omitted and which is the only save that leaves the head where it was.
  Assert `playing` + `lastSaveEvent` + `lastDeathCause !== 'You were caught by the rival!'` (the v12 C
  rule).
- ***[R2] The no-co-occupancy invariant, corrected.** It was proposed as "no tick tail ends with the
  player's head on a rival segment". Measured: it is **vacuous** on the bug it was attached to (every
  F1 shape ends with the rival *removed*, `coOccupancy: []`, so it is green on today's broken build)
  and **unsatisfiable** on the shield path (S2: `coOccupancy: [[0,1]]` because the shield branch
  consumes the shield and returns without relocating, and the caller then unshifts onto the rival's
  tile — ideation F10). The shield's "one free pass" is its **existing, uniform semantics** for
  obstacles and self-collision too, so changing it is out of scope. Restated as: **the player's head
  never ends a tick on a rival segment unless a save absorbed that contact this tick** — and asserted
  only in the no-shield geometries, with the per-contact-type outcome assertions as the primary
  evidence. The shield pass-through is recorded in AGENTS.md, not fixed.
- *A rival following the player is destroyed and credited.* **Catch:** park the player in a straight
  run; drive 20 ticks with a rival chasing the tail; assert zero defeats and no removal.
- *The leech backfires above length 4.* **Catch:** rival at length 5, player head stepping exactly
  onto its head with `leech` equipped → `playing`, rival removed.
- *Determinism.* **[R2] The original catch was vacuous** — a deterministic reorder produces *identical*
  runs, so "run the same seed twice and diff" is green by construction for the failure mode it was
  filed under (measured: two 178-tick runs, `firstDiffAt: -1`). Re-filed as two claims: (i) no new
  `Math.random()`/`Date.now()` enters the reordered region (grep + a same-seed double run driven by a
  **synchronous** `driveTicks` loop — a wall-clock pair is not reproducible because the combo window
  reads `Date.now()`); (ii) the order flip is asserted directly: place food two tiles from both heads,
  assert the rival eats it and the player's score is unchanged.
- *The hoist breaks an unrelated system.* **Catch:** full suite sweep green (all 13 suites).

**Verification in the running game.** Reproduce the issue's own setup — charge a rival head-on at the
spawn moment, and run straight through where the rival was — and confirm both now kill the player.
Then block a rival with the body and confirm the rival dies with the reward cue. Screenshots.

---

## Feature C — Spawn telegraph (the rival announces itself)

**Concept.** A rival has two stages: **materialising** (inert, drawn as a ghost with a dashed ring and
a countdown arc, cannot kill and cannot be killed) for `RIVAL_WINDUP_MS = 1600` (~13 ticks), then
**active**.

**Why this shape.** The issue asks for a warning, and the codebase already has the vocabulary for
"something is about to become dangerous": the v12 hazard pre-ignition cue — a dashed ring and a
countdown arc, information that always renders while only the *brightness* is calm-gated. v13 reuses
that language so one legend covers both.

**Change — no new snapshot state.**
**[R1] The original premise is corrected:** `!active && snake.length > 0` is not an "impossible state"
— `test-v9.mjs:236` constructs exactly that. It is, however, an *unused* one, and v13 makes it the
materialising state, so `snake`, `active` and `respawnTimer` (all three already round-tripped) carry it
for free.

- `spawnRival` picks the tile and the 3-segment body, leaves `active = false`, sets
  `respawnTimer = RIVAL_WINDUP_MS` and `moveCounter = 0`. Its guard becomes
  `if (rivals[idx].active || rivals[idx].snake.length > 0) return;` so a materialising rival cannot be
  re-picked.
- The respawn loop becomes two-stage: **dead** (`snake.length === 0`) counts down and calls
  `spawnRival` once `respawnTimer <= RIVAL_WINDUP_MS`; **materialising** (`!active && snake.length > 0`)
  counts down and activates at ≤ 0. Total dead→active stays `RIVAL_RESPAWN_MS = 10000`.
- **[R1] Activation is explicit about `respawnTimer`:** activation sets `active = true` and
  `respawnTimer = 0` (today's `spawnRival` semantic), so `test-v9.mjs:236`'s fixture behaves as it
  does now. **[R2] That suite's fixture is added to the invalidated list** along with
  `test-evolution.mjs`'s, and both are re-checked in the same commit.
- **Activation deferral, widened per [R1+R2]:** the original "defer while the player's head occupies the
  tile" is not provably fair — the player can be *adjacent* at activation, and the new head-on rule is
  lethal. Defer while the player's head is inside the Feature D radius (**5 wrap-aware tiles**) of the
  telegraph tile, re-measured at the activation instant, adding one `tickInterval` each time.
- Every spawn path (`startGame` L2628/L2631/L2647, gauntlet L6336, cascade L8451/L8468) goes through
  `spawnRival`, so every rival gets the warning uniformly — including the run-start one.
- The wind-up decrement lives inside the existing respawn loop, so it inherits the
  `!hoardActive && rivalFreezeMs <= 0` gate: the telegraph **pauses** during a freeze but stays drawn.

**Hooks.** `spawnRival` L3307-3334; the respawn loop L7787-7793 (hoisted by B1); `drawRival` L5847.

**LOC:** ~30.

**Scores:** Impact 5 / Feasibility 4 / Risk 3 / Synergy 4.

**Failure modes.**
- *The cue says "safe" while the rival is lethal.* v12 B's exact lesson. The materialising branch must
  be inert on **both** sides: `checkPlayerDeath` tests `rivals[rci].active` (L7159), and rule 2's
  `resolveRivalRams` must skip `!active` rivals too. **Catch:** stand on the telegraph tile for the
  whole wind-up; assert `playing` every tick and that the deferral fired (the rival did not activate
  while the player was inside the radius).
- *A materialising rival is invisible.* `drawRival` returns early on `!r.active` (L5850) **and**
  `drawRivalHUD` returns early twice (L6120 `if (rivals[ri].active)`, L6122 `if (rivalLen === 0)`).
  **[R1] The plan previously named only the first.** **Catch:** the telegraph branch is asserted to
  emit draw calls via the save/restore instrumentation (Feature F), and the HUD's three states are
  asserted on their rendered strings.
- *Dead→active time drifts.* **Catch:** measure `removeRival` → `active === true`; assert 10000 ms ± 1
  tick.
- *The wind-up leaks past a save/restore.* **Catch:** snapshot mid-wind-up, restore, assert the rival
  is still materialising with a sane countdown and never activates twice.

**Verification in the running game.** Force a respawn and watch the full sequence in Chromium —
countdown, ghost, solidify, first step — screenshotting each phase.

---

## Feature D — Spawn geometry: wrap-aware and far enough

**Concept.** The spawn floor rises from **3 raw tiles** to **5 wrap-aware tiles**, and the rival stops
materialising on things it should not.

**Why.** `findFreeTile` (L3232) filters on raw Manhattan (L3239) with no wrap correction, on a board
that wraps. Measured: from head `(0,10)` it returns tile `(19,10)` — 19 tiles raw, **1 tile** across
the seam; a 4000-sample sweep found 26 spawns within 2 wrap tiles. And because the spawn tick also
*moved* the rival, it was never drawn at its spawn tile: measured first frame was `separation − 1` with
a body already 2 long. C and E fix the *timing*; this fixes the *geometry*.

**Change — options object, defaults unchanged.**
`findFreeTile(headX, headY, ignoreObstacleCap)` gains a third parameter that is either the legacy
boolean or an options object, defaulting to today's exact behaviour:

```js
function findFreeTile(headX, headY, opts) {
    // legacy boolean kept: findFreeTile(x, y, true)
    var o = (opts === true || opts === false) ? { ignoreObstacleCap: opts } : (opts || {});
    var minTiles   = o.minTiles === undefined ? 3 : o.minTiles;
    var wrapAware  = !!o.wrapAware;
    var avoidExtras = !!o.avoidExtras;
```

`spawnRival` passes `{ ignoreObstacleCap: true, minTiles: 5, wrapAware: true, avoidExtras: true }`.
The five save/obstacle callers (L4428, L6194, L7047, L7104, L7192, L7871) are untouched and keep
3 raw tiles and today's occupancy set — **[R1]** the shared guard must not tighten for Phoenix/streak,
or a crowded board silently loses a death save.

**[R2] `avoidExtras` closes the occupancy gap at the same time** — `findFreeTile` today ignores
`hazards`, `extraFoods`, `food2` and `powerUpPickup`, so a rival can materialise on the hoard food the
player is running for, announced by Feature C's countdown arc. It is the strongest of the left-on-the-
table items because Feature D is already editing this function and Feature C makes the symptom
visible. Scoped to the rival spawn via `avoidExtras`, so no save path changes behaviour.

**LOC:** ~20.

**Scores:** Impact 4 / Feasibility 5 / Risk 2 / Synergy 4.

**Failure modes.** *The shared guard tightens for saves.* **Catch:** `findFreeTile(h, h + 2*TILE_SIZE)`
still returns a tile; the save suites stay green. *A crowded board can no longer spawn.* `spawnRival`
already re-arms at 2000 ms (L3326). **Catch:** fill a row, force a spawn, assert the re-arm rather than
a crash or an off-board tile. *The ≥5-tile check under-samples.* **[R2]** `findFreeTile` returns `null`
after 50 attempts, so the sample counts **placed** spawns — assert on those.

**Verification in the running game.** Force 40 respawns with the player hugged against each wrap seam;
assert the minimum wrap-aware distance is ≥ 5 tiles and the rival is never drawn inside the player.

---

## Feature E — Rival cadence: the long rival is the slow one

**Concept.** The rival's step cadence derives from its **own length**: 1 tile/tick while short, slower
as it grows.

| Rival length | Stride | Effective speed |
|---|---|---|
| ≤ 6 | 1 | 1.0 tiles/tick (parity with the player) |
| 7-13 | 2 | 0.5 |
| ≥ 14 | 3 | 0.33 |

**Why this version and not the original. [R2] rejected the original 2-of-3 flat cadence**, and the
case is sound: the measured premise is absent (there is no speed asymmetry to correct), the spec's AI
is explicitly a *resource competitor* ("the AI does NOT chase the player"), and a uniformly slower
competitor simply loses every food race — which removes the rival's only designed role, subtracts from
the theme's third word, and is the one feature that makes the game worse. The original plan knew all of
this and shipped it anyway.

The length-derived version is different in kind, and it is what makes "make it slower" defensible: the
thing JC actually experienced as too fast was **a 20-tile wall at full player speed**, and this rule
slows exactly that object while leaving a short rival at parity so the food competition stays real.
A rival that is *winning* gets slower; a rival that is losing keeps up. It is self-balancing, and it is
a **balance lever** — recorded as such, with a one-line revert path if the running-game pass disagrees.

**Change.** A per-rival `moveCounter`, incremented at the top of `updateRival`; when
`moveCounter % stride !== 0`, return early. `stride` is computed from `r.snake.length`. The skip is
placed **before** the AI direction re-roll (L3342-3380) so a skipped tick cannot turn the rival in
place.

**Why a counter and not `gameTick`.** `test-v12.mjs` A14 drives `updateRival` directly without
advancing `gameTick`. **[R1] The original justification was half wrong** — `test-evolution.mjs` calls
`updateGame()`, which *does* advance `gameTick` (L6975). The counter is still right (A14 alone proves
it), and it is undefined-safe (`r.moveCounter || 0`) and snapshot-additive.

**Interaction rules.** `slowMoActive`, speed food, the Swift divider and Time Attack all change
`tickInterval`, and the cadence is tick-counted, so it scales with the player correctly in every case;
no `tickInterval` snapshot is taken (the v9 Speed Boost rule). `rivalFreezeMs`/`hoardActive` keep
skipping the whole loop. The respawn timer (L7789) is untouched.

**LOC:** ~14.

**Scores:** Impact 3 / Feasibility 5 / Risk 2 / Synergy 3.

**Failure modes.** *The rival turns in place on a skip.* **Catch:** force a skip with food behind;
assert `r.dx`/`r.dy` are byte-identical before and after. *A14 breaks.* A14's rival is length 2 →
stride 1 → unaffected; **catch:** the suite still green. *The cadence becomes 0 moves.* **Catch:**
drive 30 calls on a length-2 rival; assert exactly 30 tiles advanced, then repeat at length 20 and
assert 10.

**Verification in the running game.** Let a rival eat to length ≥ 14 (or hand-build one) and confirm
the stride change is visible; confirm a short rival still races you to food.

---

## Feature F — Legibility pack

**Concept.** Make the rival read as a solid creature rather than as food, and make its
absent / materialising / approaching / present states legible.

**[R2] Trimmed to its information core** — the cosmetic half (fangs, per-segment outlines, per-rival
identity palettes, extra defeat particles) is dropped: it has no gameplay effect, the cycle's own
out-of-scope list forbids that shape, and the budget is better spent on B.

| Cue | Detail | Gating |
|---|---|---|
| **Colour** | rival 0 body `#B71C1C`, rival 1 `#AD1457` — off the food axis, fixing the measured `#FF4444` collision with `FOOD_TIERS.common`; head retains a brighter `#FF5555`. Colour alone, no new shapes. | information |
| **Telegraph** | in the materialising branch of `drawRival`: ghost fill of the 3-segment body at `alpha = 0.15 + 0.35·(1 − windFrac)`, dashed ring at radius 15 px, countdown arc sweeping `2π·windFrac` — the hazard cue's exact vocabulary (L5223-5245) | ring/arc always; only the alpha brighten calm-gated |
| **Proximity** | wrap-aware head distance ≤ 3 tiles → dashed ring on the rival's head, radius `TILE_SIZE·1.1`, `rgba(255,60,60,0.85)` | information |
| **HUD** | `drawRivalHUD` (L6116-6130) becomes three-state — `Rival: N` live, `⚠ Rival in 1.4s` materialising, `Rival ⧗ 6.4s` dead. **[R2] No `❄` frozen state:** the collision test is not gated by the freeze, so labelling a frozen rival as stopped would be a cue that says "safe" on a lethal object — exactly the failure v12 B exists to prevent. | information |
| **Sound** | one new `case 'rival_warn':` at wind-up start (233→196 Hz, colliding with none of the 12 existing pitches); `powerdown` reused on defeat | information |
| **Screen reader** | `srSpeak('Rival incoming, right, 7 tiles')` at wind-up start (wrap-aware direction word); `srSpeak('Rival destroyed')` on any removal — neutral, because a removal is not always a player kill | information |
| **Onboarding** | one-shot `snake_has_seen_rival` toast on the first materialisation, mirroring `hasSeenHazard` | information |

**Hooks.** `drawRival` L5847-5856 (**including the L5850 `!r.active` early return — [R1] the telegraph
is invisible without it**), `drawRivalHUD` L6116-6130 (**both** L6120 and L6122 guards), `playSound`
L4025-4106 (**grep for the label first — v12 found dead duplicate cases in this switch**).

**LOC:** ~45.

**Scores:** Impact 4 / Feasibility 4 / Risk 2 / Synergy 5.

**Failure modes.** *Canvas transform corruption.* v11 shipped unplayable this way. **Catch:**
**[R2] drawing state, not just depth** — port `test-v12.mjs`'s save/restore depth assertion *and* add
`ctx.getLineDash()` empty, `globalAlpha === 1` and the transform unchanged at the end of a frame that
draws a materialising, an active and a defeated rival. Depth-0 passes while a leaked dash pattern
corrupts every later stroke, and dash state is exactly what the new telegraph sets.
*A duplicate `playSound` case.* **Catch:** assert exactly one `case 'rival_warn':`.

**Verification in the running game.** Screenshots of materialising, active adjacent (proximity ring),
and defeated; plus a CVD pass with each `CVD_PALETTES` entry active.

---

## Feature G — Truth repairs and AI sanity

Four small items. **[R2] G's second half is the only cost-effective place to fix the two AI defects**
that make the rival kill itself and stall away from food:

1. **Rival AI — two bounded fixes, no pathfinding.** (a) *Stern deadlock:* when the food is directly
   astern the reverse filter empties `possible`, there is **no `else`**, and `r.dx`/`r.dy` are left
   unchanged — so the rival drives *away from the food* for up to a half-lap while growing (traced:
   food at (80,100), rival at (100,100) facing +x → moves to (120,100)). Fix: fall back to the two
   perpendicular candidates, which makes the food diagonal and ends the stall. (b) *1-ply self-rejection:*
   filter the ≤2 candidates against the rival's own body — the rule the arena spec promised and never
   got.
2. **`removeRival`'s call sites** — covered by B4's credit table.
3. **`double_rival` is a lie where it is offered.** **[R2] The original change could not satisfy its own
   claim**: `spawnRival` allows gauntlet (L3313) while the gauntlet wave path spawns only rival 0
   (L6335-6337), so a helper alone either keeps offering the mutator in Gauntlet and still does nothing,
   or needs a per-mutator filter the plan did not specify. Chosen branch: **`double_rival` works where
   it is offered** — `pickDraftOptions` (L6471) drops `double_rival` when the rival is not enabled in
   the current mode (Zen/Walled/Painter/Snap/Daily, via the same `rivalEnabledInMode()` helper that
   replaces the literal mode lists at L2630/L8450/L8467 and `spawnRival` L3313), **and** the gauntlet
   wave path (L6335-6337) spawns rival 1 when the mutator is drafted. Step 7's gate tests exactly that
   branch.
4. **Dead state and stale docs.** `prevRivalSnake` (declared L427, written every tick at L6973 with a
   fresh `.map()` allocation, **read nowhere**) is deleted — one array + N object allocations per tick.
   The `advanceShrinkZone` comment (L2731-2734) claiming the rival-eat call site "is NOT wired yet" is
   false (wired at L3432, pinned by `test-v12.mjs`). AGENTS.md's `rivalActive`/`rivalSnake`/`rivalLength`
   section is stale (the real guard is
   `currentSnake.length + obstacles.length + extraFoods.length`, L2094) — rewritten with the caller list.

**LOC:** ~45.

**Scores:** Impact 3 / Feasibility 4 / Risk 2 / Synergy 4.

**Deliberate non-fixes, recorded in AGENTS.md with their evidence rather than half-done:**
- **Rival immunity to obstacles.** A design statement ("the board does not constrain it"); making it
  obstacle-aware re-introduces the v4 trapped-rival rule as a whole sub-feature.
- **Rival immunity to hazards.** Weaker than the obstacle case — the rival standing unharmed in a rift
  undercuts the vocabulary C and F build on — but fixing it adds a rival death path that interacts with
  the shrink and cadence code, and it answers none of JC's three symptoms. Recorded with the 8-line
  option.
- **`gameOver()` clears `rivals` before the death frame** (L3539). Cosmetic; the recap card names the
  cause.
- **Two rivals can overlap** under `double_rival` (`findFreeTile` rejects the other rival's tiles at
  spawn, L3243-3244, so they start apart and then ignore each other). Cosmetic.
- **A frozen rival is still lethal.** Its existing "one free pass" semantics are uniform across shield
  and collision types; the fix is the cue, not the gate — see Feature F.

---

## Build order and gates

Each step lands and is verified before the next begins.

| # | Step | Gate |
|---|---|---|
| 1 | **A** movement integrity | +1 per eat, no duplicate cells; U-turn tail-exempt test; `test-v12.mjs` A14 green; spawn length 3 |
| 2 | **B** contact resolution | the four-case contact matrix by outcome (state / cause / save event / defeat delta); no-shield co-occupancy; the giant-follows-player regression; every save type incl. shield; full suite sweep green **after** the two documented test fixtures are made explicit |
| 3 | **E** cadence | 30 calls at length 2 → 30 tiles; at length 20 → 10 tiles; no turn in place on a skip |
| 4 | **C** telegraph | four phases observed in the running game; dead→active still 10 s; `test-v9.mjs` fixture re-checked |
| 5 | **D** geometry | ≥ 5 wrap-aware tiles over 40 *placed* spawns from each seam; save callers unchanged |
| 6 | **F** legibility | save/restore **depth and drawing state** clean across a full rival cycle; four screenshots |
| 7 | **G** truth | `double_rival` demonstrably spawns two rivals where offered and is not offered where it cannot; stern-deadlock fixed; `test-bugfixes.mjs` load check green |

A, B, E are the *mechanics* gate; C, D the *fairness* gate; F the *legibility* gate; G hygiene. If
time-boxed, G is the droppable tail — A, B, C are the issue's actual ask.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| The tick hoist changes food-competition order and every seeded outcome | Medium | Accepted and documented once; no wall-clock enters the new code. Asserted directly (food two tiles from both heads → the rival eats it). |
| The hoist invalidates two hand-built test fixtures | Medium | Named explicitly (`test-evolution.mjs:175-196`, `test-v9.mjs:236`); both fixed in the same commit; the step-2 gate is worded as "green after those two fixtures are made explicit", not "green unedited". |
| A save is bypassed on a new contact path | High impact | One head-on per save type, shield included; the exit chain is byte-identical to today's. |
| The rival becomes *less* dangerous (no free growth, slower when long) | Medium | Length-derived cadence keeps a short rival at parity; body-ram death is counterplay the player must choose; head-on is now lethal to the player; the reward makes killing it worthwhile. Re-checked in the running-game pass. |
| Canvas corruption from the new rival drawing | High impact, low likelihood | Depth **and** drawing-state assertions (dash, alpha, transform) across a full rival cycle. |

## Nothing else

No new game modes, currencies, DOM panels (the 7-site cross-hide contract is untouched), food tiers,
snapshot version, dependencies or backend. `SNAPSHOT_VERSION` is **not** bumped; every new per-rival
field (`moveCounter`) is additive and defaults safely (`r.moveCounter || 0`), and the materialising
state reuses three fields that already round-trip. AGENTS.md gains a v13 section covering the restored
collision contract, the two-stage spawn, the length-derived cadence, the defeat-credit table, the
shield pass-through and the three deliberate non-fixes.
