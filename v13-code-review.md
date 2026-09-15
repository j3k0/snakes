# Snakes v13 — Code Review (commit `32f9c68`, branch `v13-rival-fairness`)

**Scope.** `git show 32f9c68 -- snake.html` (+515/−79) traced hunk-by-hunk against the working tree
(`snake.html`, 9539 lines), plus `AGENTS.md`'s new "Rival System" sections, `test-v13.mjs` (1016 lines),
`test-evolution.mjs`'s fixture change, `v13-design-plan.md` rev 2 and `IMPL_PLAN_v13.md`'s disposition
table. Eleven throwaway Playwright probes were run from the repo root; real output is pasted where
cited and every probe file is deleted (`git status --short` is clean, no tracked file touched).

**Method for the "fails before?" question.** The whole suite was run against the *pre-v13* build
(`git show e2851ac:snake.html` → an untracked copy, with `test-v13.mjs` sed-rewritten to point at it;
both files deleted). That is real falsification evidence, not a reading of the commit message.

**Suite results (real).**

```
node test-v13.mjs          → Results: 62 passed, 0 failed      (5 consecutive runs, identical)
node test-v12.mjs          → 45 passed, 0 failed
node test-evolution.mjs    → ALL GREEN (11/11)
node test-v9.mjs           → ALL GREEN (19/19)
test-v13.mjs vs e2851ac    → Results: 16 passed, 41 failed     ← the discrimination claim holds
```

No assertion was flaky over 5 runs. The 16 that survive on the pre-v13 build are the fixture-driven
regression guards plus the always-true ones; 5 more were skipped because their `try` block aborted on
the first reference to a symbol v13 introduces (`rivalTileDistance`, `RIVAL_WINDUP_MS`, `rivalEnabledInMode`).
`B12` is the instructive case: it **fails** on the pre-v13 build (`delta 1, score 0`) and **passes**
here (`delta 0, score 0`) — it catches the old reward bug, but its fixture no longer produces a removal
at all, so it cannot catch the double-credit it is named for (Finding 1).

## Verdict

**SHIP WITH FIXES.** The mechanics are right. Every player-facing behaviour the commit claims was
verified independently by probe and differential-tested against `e2851ac`: the free growth is gone
(40 moves, length unchanged), the inverted collision is gone (a charge now kills the player and the
rival survives, delta 0), the body-ram kill exists and pays +50/+100 exactly once per removal, the
self-crash is uncredited, the leech no longer backfires, the telegraph is inert on both sides and
materialises for exactly `RIVAL_WINDUP_MS`, dead→active is still 10 s, the cadence boundaries are 1/0.5/0.33
at the lengths advertised, the snapshot needs no version bump, and the canvas is left clean.
A 400-trial / 14 891-tick randomised soak found **no** tick tail where the player's head sits on an
active rival segment without a save having absorbed it.

The defects are in the *evidence* and in three omissions, not in the collision contract:

- **2 of the 62 assertions cannot fail** — the commit's "62 behavioural assertions … key gates were
  falsified to prove they discriminate" is false for `B11` (a bare `typeof … === 'boolean'` tautology)
  and for `B12` (passes with zero defeats and zero score — probe: `delta 0, score 0, assertion true`).
- **The gauntlet wave-completing tick is now an extra rival move** and is not in AGENTS.md's
  "Accepted Behaviour Changes" list (probe: v13 100→120, pre-v13 100→100). The `!gauntletIntermission`
  gate covers the intermission `return` (L7241), not the four objective `return`s (L7243-7255).
- **The phoenix/streak relocation can hand out a credited, rewarded kill** through the rebuilt tail
  body — the exact "removal the player did not earn" class v13 exists to delete (controlled probe:
  `delta 1, score 53`).

Nothing found is a crash, a soft-lock, a save-bypass, a snapshot regression, or a canvas-corruption
path. Two AGENTS.md claims are over-claims ("rejects 1-ply self-collisions"; the leech descriptor's
"destroy it") and the crowded-board re-arm interval is ~4× shorter than documented. Minimum change
set at the end.

## Verified claims

| # | Claim (AGENTS.md / commit) | Result |
|---|---|---|
| 1 | "The rival moves FIRST … immediately after the `rivalFreezeMs` decay at the TOP of the tick" | VERIFIED — L7104-7185, `updateGame` prologue (`if (gameState !== 'playing') return;` L7082) |
| 2 | "the `if (gameState !== 'playing') return;` guard sit immediately after" | VERIFIED — L7185, immediately after the update loop |
| 3 | "Rule 2 lives in `resolveRivalRams()`, called once immediately after the player's move is committed" | VERIFIED — L3669 def, L7619 call, after BOTH the teleport branch (L7612) and the plain `unshift` (L7617) |
| 4 | "Its scan starts at index 1 — the head tile belongs to rule 1" | VERIFIED — L3673 `for (var si = 1; …)`; probe with the shield: `head 120,100 == rivalHead 120,100`, `delta 0`, rival alive |
| 5 | "Credit is the only `stats.rivalsDefeated` increment" | VERIFIED — grep: L3633 is the sole increment |
| 6 | "+50 score, +100 XP, floater, toast, `powerdown`" | VERIFIED — probe: `score +50, xp +100, floater "+50", toast "⚔️ Rival defeated!", sound "powerdown"`, exactly one of each per credited removal |
| 7 | "`awardXP('100')` at level ≥ 20" (overcharge) | VERIFIED — `level 20` probe: `xpOvercharge +100, sessionXP +100`, no level-up loop |
| 8 | "a save is never scored as a ram" (shield included) | VERIFIED — shield probe `delta 0`, B9b green for shield/phoenix/streak |
| 9 | Cadence "stride 1 (≤6), 2 (7-13), 3 (≥14)" | VERIFIED — 60 calls: len 1→60, 6→60, 7→30, 13→30, 14→20, 20→20 moves |
| 10 | "`moveCounter` is snapshot-additive (`r.moveCounter \|\| 0`)" | VERIFIED — build L2898, restore L3074; **non-zero** round-trip probe: `snapMc 1 → restored 1`, next call skips (stride 2), the call after moves |
| 11 | "the materialising state … reuses three fields that already round-trip … zero snapshot changes" | VERIFIED — restore at fractions 0/0.3/0.6/0.9 → `active:false, len:3`, timers preserved, activation after exactly the residual wind-up (14/10/6/2 ticks) |
| 12 | "a pre-v13 snapshot restores safely" | VERIFIED — a rival entry with no `moveCounter`/`deferCount`, a snapshot with no `rivals` key: no throw, `moveCounter 0`, the rival moves |
| 13 | "Dead → active still totals `RIVAL_RESPAWN_MS` (10s)" | VERIFIED — `elapsed ≥ 10000 && < 11600` (C1b), and the pre-empt branch fires only at `≤ RIVAL_WINDUP_MS` (L7172) |
| 14 | "Activation is deferred … capped at `RIVAL_MAX_DEFERRALS`; at the cap the telegraph is relocated and re-armed" | VERIFIED — camping probe: 2 relocations, then activation; the camper cannot disarm the rival |
| 15 | "`spawnRival` … never on hoard food or in a live rift" / "the body gets the SAME occupancy set" | VERIFIED — L3398-3416 rejects `extraFoods`, `food2`, `powerUpPickup`, on-phase `hazards` (L3411-3414); D5 green |
| 16 | "`findFreeTile(x, y, true)` behaves exactly as before (3 raw tiles, today's occupancy set)" | VERIFIED — L3253-3256 normalises the legacy boolean; the new predicates sit behind `if (avoidExtras)` |
| 17 | "`wrapAware` is load-bearing … head (0,10) → tile (19,10): raw 19, wrap-aware 1" | VERIFIED — L3266-3271 |
| 18 | "Some canvas state is left clean (dash/alpha/transform)" | VERIFIED — F1/F1b/F1c/F1d green; the telegraph's `setLineDash([5,5])` is paired with `setLineDash([])` on both branches (L6094/L6098 materialising; L6116/L6123 proximity) |
| 19 | "no NEW `Math.random()` in game logic" | VERIFIED — `grep '^+.*Math\.random'` on the diff: no matches |
| 20 | "the `advanceShrinkZone` comment claiming the rival-eat call site is NOT wired is false" | VERIFIED — the comment is corrected (L2744-2746); the call site is L3596 |
| 21 | "AGENTS.md's `rivalActive`/`rivalSnake`/`rivalLength` section is stale" | VERIFIED — none of those symbols exists any more; the guard is `currentSnake.length + obstacles.length + extraFoods.length` (L2103), as AGENTS now says |
| 22 | "Per-run state cleared in BOTH `resetGame()` and `resetWaveState()`" | VERIFIED — `rivals = []` at L2365 (resetGame) and L6565 (resetWaveState); v13 adds no per-run module state (per-rival fields die with the array) |
| 23 | "no double gameOver when a rival eat ends the run via the Pressure Cooker" (not claimed; verified because it was a risk) | VERIFIED — 2 rivals eating in one tick with the resonance live: `overCalls 1`, `gamesPlayed +1`, `totalDeaths +1` |
| 24 | "the AI … rejects 1-ply self-collisions" | **OVER-CLAIM** — see Finding 5 |
| 25 | The `leech` descriptor "steal 3 segments, destroy it" | **OVER-CLAIM** — see Finding 6 |

## Targeted hunts (the five the review asked for)

| Hunt | Result |
|---|---|
| **Unreachable branches** | None found that matter. Two *dead conditions* exist: `removeRival`'s `wasActive` and `if (r.active && r.snake.length > 0)` (L3625/L3632) are always true because all three call sites require an active rival (L3558, L3675, L7557). `drawRivalHUD`'s `else return` (L6402) is reachable (a `rivals` entry created but never spawned has `snake:[] , respawnTimer:0`). |
| **Wrong closure capture in the `for`-body scan** | Clean. `spawnRival`'s L3398-3416 scan closes over `seg` (a function-scoped `var` reassigned per iteration), never over the loop variable `sl`, and every callback runs synchronously inside `some()` in the same iteration. `findFreeTile`'s rename `o → o2` (L3273) correctly avoids shadowing the new options object. Behaviourally confirmed: a 3-segment body that truncates at the first blocked tile (A5, D5). |
| **Off-by-one in the cadence** | Clean. `moveCounter = (moveCounter \|\| 0) + 1; if (moveCounter % rStride !== 0) return;` (L3459-3460) moves on the 1st call at stride 1 (spawn resets the counter to 0, L3391), on the 2nd at stride 2, the 3rd at stride 3; measured 60/60, 30/60, 20/60. The boundary lengths are 7 and 14 inclusive, exactly as AGENTS.md states. |
| **A `continue` that skips too much** | Clean. Three new `continue`s: L7155 and L7165 (inside the per-rival respawn iteration — nothing else in that iteration to skip), and L7558 (the leech), which skips exactly the `rcj` segment test for that rival and nothing else — `triggerEvolutionIfReady()` was moved *above* it deliberately (L7543-7548, green on the pre-v13 build too). |
| **A new `return` that short-circuits the tick** | Two, both intended and both documented in code: L3460 (the cadence skip, placed before the AI re-roll so a skipped tick cannot turn the rival — E3 green) and L7185 (the post-hoist guard). The guard's skipped set is exactly what AGENTS.md lists; `gameOver()` sets `visualDirty` + `drawGame(1)`, so the frame is not stale. |

## Findings

### 1. MAJOR — `test-v13.mjs` B12 cannot fail (vacuous assertion)

`test-v13.mjs:525-526`:

```js
check('B12: the defeat reward fires once per removal (not doubled)',
      r.delta * 50 === r.score, JSON.stringify(r));
```

`delta === 0 && score === 0` satisfies it. In the shipped fixture it does exactly that: rival 0 is
constructed with `dx: 0, dy: 0`, so its `newHead` is its own head tile — `updateRival`'s self test
(L3550-3558) fires first and removes it *uncredited*, before `checkPlayerDeath` can reach the leech.
Probe on the exact fixture:

```
P2_b12: {"delta":0,"score":0,"state":"playing","active":[false,true],"assertion":true}
```

The behaviour the assertion is meant to defend is real and correct — I rebuilt it with a rival that
actually moves into the player's head tile and two rivals ramming the body in one tick:

```
D2_doubleRam: {"delta":2,"score":100,"active":[false,false],"state":"playing"}
```

**Fix.** Give rival 0 a non-zero `dx`/`dy` (and a post-move head on the player's head tile), then
assert the count explicitly: `r.delta === 2 && r.score === 100`, or `r.delta >= 1 && r.score === r.delta * 50`.

### 2. MAJOR — `test-v13.mjs` B11 is a tautology

`test-v13.mjs:491-496`:

```js
return { ate: score > scoreBefore, rivalLen: rivals[0].snake.length };
…
check('B11: food competition still resolves deterministically (documented flip)',
      typeof r.ate === 'boolean', JSON.stringify(r));
```

`typeof x === 'boolean'` is true for every boolean `x`; this assertion passes on the pre-v13 build,
on a broken build, and on a build where the rival agent is deleted. The measured value in the shipped
fixture is `ate: false`, i.e. the *opposite* of the flip the test names:

```
P10: {"ate":false,"typeofAte":"boolean","assertionAlwaysTrue":true,
      "playerHead":"220,220","rivalHead":"240,200","rivalLen":3,"score":0}
```

The `IMPL_PLAN_v13.md` disposition table claims B11 documents the food-competition flip; as shipped it
documents nothing.

**Fix.** Assert the flip's observable outcome (the rival's length grows and the player's score does not
on a tick where both heads are two tiles from the same food), or delete the assertion rather than keep
a green no-op.

### 3. MAJOR — the gauntlet wave-completing tick gains an extra rival move (undocumented)

The `!gauntletIntermission` gates (L7140, L7178) cover the intermission `return` at L7241 — the case the
earlier review's disposition #3 was about — but **not** the four wave-objective `return`s at L7243-7255,
which sit far below the hoisted block. On the tick a wave objective completes, the rival now takes a
step that the tick-tail ordering denied it. Differential probe, identical fixture, only the build
differs:

```
v13     wave0 {"objective":"survive","before":100,"after":120,"moved":true,"intermission":true}
pre-v13 wave0 {"objective":"survive","before":100,"after":100,"moved":false,"intermission":true}
```

`duringIntermission: moved false` on both builds — the gate itself is correct. The consequence is
bounded but player-visible: the rival can now step onto the player's next head tile on the very tick
the wave ends (rule 1, death, run over at wave N) where pre-v13 it could not, and the extra step is
unavoidably absent from AGENTS.md's "Accepted Behaviour Changes" list, which the section presents as
the exhaustive record of the hoist's costs.

**Fix (either).** (a) Move the gauntlet objective block (L7239-7256) above the rival block so a
completing tick returns before the rival moves — note this changes what the objective reads
(`sessionFoodEaten` / `comboCount` / `score` are set during the player's phase, so the wave would
complete one tick earlier), which needs its own verification; or (b) add the behaviour to AGENTS.md's
accepted-changes list with the one-tick exposure and accept it. Do not leave it undocumented.

### 4. MINOR — a phoenix/streak relocation can hand out a credited, rewarded kill

`snake = [{x: teleportSavePos}]` then `while (snake.length < 3)` walks the body backwards along
`dx`/`dy` checking only the player's own body (L7612-7616). The head tile came from `findFreeTile`,
which rejects active rival segments — but the two **tail** tiles are unfiltered. `resolveRivalRams`
then runs on that rebuilt body (L7619) and credits any rival head it covers. Controlled probe (the
relocation tile stubbed to `(300,300)`, a second rival whose post-move head is `(280,300)`):

```
P6_phoenix.controlled: {"delta":1,"score":53,"snake":["300,300","280,300","260,300"],
                        "rivalB":{"active":false,"len":0},"phoenixUsed":true,"state":"playing"}
```

Uncontrolled over 300 real phoenix saves the intersection is rare (`hits 0/300`), so this is a corner,
not a leak — but it is the same class the commit deletes ("a rival that tangled itself paid the player
a defeat"), and it pays the full +50/+100 reward.

**Fix.** Either build the teleport body through the same occupancy filter as the head (it is three
tiles; `findFreeTile`-style rejection of `rivalCombinedSnake()` per tile is enough), or skip
`resolveRivalRams` for the tick that consumed `teleportSavePos`.

### 5. MINOR — the 1-ply self-rejection is partial; AGENTS.md over-claims it

AGENTS.md and the commit message say the AI "rejects 1-ply self-collisions". The guard is real
(`bodyHit`, L3505-3515) but it exists **only in the 70 % chase branch**, and even there it is
best-effort: `if (safe.length > 0) possible = safe;` (L3517) falls back to the unsafe candidate when
nothing is safe. Probes on a coiled rival whose forward tile is its own body index 3:

```
straightBranch (rand 0.75)        {"active":false,"len":0,"credited":0}   ← drives into itself
randomBranch  (rand 0.90…0.99)    {"active":false,"credited":0}           ← only the 180° reversal is filtered
chaseBranch, no alternative       {"active":false,"len":0}                ← safe=[] so the unsafe move stands
chaseBranch, alternative exists   {"active":true,"len":7,"head":"20,40"}  ← correctly diverted
```

Residual rate over 4000 real moves: **15 self-crashes (0.38 %), 0 credited** (correct — self-crashes
must not pay). So the v4 defect the plan describes ("the rival suicides constantly") is fixed, but the
absolute claim is not, and the plan's `G2` assertion ("a candidate move onto the rival's own body is
rejected") was dropped from the shipped suite — nothing pins this behaviour at all.
**Fix.** Reword AGENTS.md to "the chase branch rejects a 1-ply self-collision when an alternative
exists", and add the dropped assertion for the chase branch (it is one probe and it discriminates).

### 6. MINOR — the `leech` descriptor over-claims ("destroy it")

`BREWS_CONFIG` now reads `'Head-to-head vs rival: steal 3 segments, destroy it'` (L1103). The code
destroys the rival only when the drain leaves ≤1 segment **or** the heads share a tile (L7555-7559);
a diagonal head-to-head at length ≥5 drains and leaves the rival alive — the same geometry
`test-v13.mjs` B8 protects as "partial drain preserved":

```
P9: {"state":"playing","rivalActive":true,"rivalLen":5,"delta":0,"score":0,
     "descriptor":"Head-to-head vs rival: steal 3 segments, destroy it"}
```

The code's own leech predicate (`ldx<=TILE_SIZE && ldy<=TILE_SIZE && ldx+ldy<=2*TILE_SIZE`) calls
that geometry head-to-head, so a player who reads the brew panel and steps diagonally into a long
rival is told they will destroy it and does not. This is precisely the v12 "nothing advertised is a
lie" defect the cycle cites. **Fix.** `'Head-to-head vs rival: steal 3 segments; destroys a drained rival'`,
or make the destroy unconditional for the case the descriptor names.

### 7. MINOR — `pickDraftOptions` can now return an EMPTY pool

`pickDraftOptions` (L6754-6763) filters `double_rival` out when the mode has no rival, then
`if (pool.length <= count) return pool;`. It can therefore return `[]`:

```
P12: zenPool ["gravity","mirror"]   classicPool ["double_rival","gravity","mirror"]
     zenDegeneratePool []           ← unlockedMutators = ['double_rival'], gameMode = 'zen'
```

An empty pool is not handled: `draftOptions = []`, `draftSelection = (0-1+0)%0 = NaN` on ArrowLeft,
and Enter assigns `activeMutators = [undefined]` (L8828). It is **unreachable with shipped defaults** —
`unlockedMutators` initialises to three mutators with a `length > 0` validator (L437) and only ever
grows (L6740-6742) — so this is a latent robustness regression, not a live bug. A 2-entry pool
(Zen + cascade, count 3) *is* live and is handled correctly: `drawDraftScreen` iterates
`draftOptions.length` (L6806) and the navigation is modulo (L8799/L8804).
**Fix.** One line: `if (!pool.length) pool = unlockedMutators.slice();` — or drop only when the pool
would remain non-empty.

### 8. MINOR — the three-state HUD has no test, and shows a frozen `0.0s` while a telegraph is deferred

Feature F's HUD is asserted **nowhere** in `test-v13.mjs`: grep for `Rival in`, `drawRivalHUD` or
`fillText` returns nothing, even though `v13-design-plan.md`'s F3 promised "each of the three strings"
and the disposition table records F3 as applied. The strings do render correctly (probe):

```
noRival []    live ["Rival: 3"]    materialising ["⚠ Rival in 1.2s"]    dead ["Rival ⧗ 6.4s"]
```

But during a deferral the timer sits one tick above zero and the HUD pins at `⚠ Rival in 0.0s` for up
to `RIVAL_MAX_DEFERRALS` ticks (~2.4 s at the base tick), which reads as a frozen clock:

```
duringDeferral: {i:12,timer:40,defer:0,hud:"⚠ Rival in 0.0s"} … {i:27,timer:40,defer:15,hud:"⚠ Rival in 0.0s"}
```

**Fix.** Add the three-string assertion (it is the only player-facing channel for the telegraph), and
either show the held state (`⚠ Rival held`) or freeze the ring so the display does not claim progress
it is not making.

### 9. NIT — the crowded-board re-arm interval is ~480 ms, not the documented 2000 ms

`spawnRival`'s failure path is `r.respawnTimer = Math.max(r.respawnTimer, 2000)` (L3386-3389) and it is
reached *after* the timer has already crossed below `RIVAL_WINDUP_MS`, so the pre-empt branch fires
again ~4 ticks later. With `findFreeTile` permanently null:

```
P15: {"afterFirst":{"len":0,"active":false,"timer":2000},
      "seen":[9880,7480,5080,2680,1640,1640,1640,1640,1640,1640],"stuck":null,"materialised":false}
```

The invariant holds (never active, never stuck, always re-arming — the answer to the "can a crowded
board make it oscillate forever?" question is: it oscillates, but visibly and terminally on the death
of the free tile). The cost is 50 `findFreeTile` attempts, each allocating a fresh
`rivalCombinedSnake()`, roughly twice a second on a full board. D4 passes because it samples the timer
immediately after the call. Harmless; worth a comment so the next reader does not trust "2000 ms".

### 10. NIT — `removeRival`'s second argument is documented as REQUIRED but is not enforced

AGENTS.md: "`removeRival(idx, defeatedByPlayer)` takes a REQUIRED second argument." There is no guard;
`removeRival(0)` silently credits nothing (`{"delta":0}`) rather than failing loudly. All three call
sites pass it correctly (L3558 `false`, L3675 `true`, L7557 `true`), so this is a documentation
convention only. Say "the second argument is mandatory by contract" or add a dev-time assertion.

### 11. NIT — `v13-design-plan.md`'s `rivalEnabledInMode` claim is stale

The plan says the helper "replaces the literal mode lists at L2630/L8450/L8467 and `spawnRival` L3313".
`snake.html:2636` still carries `(gameMode === 'classic' || gameMode === 'timeAttack') && gameMode !== 'painter'`
— deliberately, since the gauntlet spawns through its own path (L2657) and swapping in
`rivalEnabledInMode` would make that line fire in the gauntlet too. Harmless (the gauntlet's
`resetWaveState()` clears `rivals` first — verified: `startNextWave()` leaves exactly the rivals the
wave spawns), but the plan sentence should not be quoted as fact. AGENTS.md does not repeat it.

### 12. NIT — the defeat toast can be buried behind a level-up toast

A credited removal calls `awardXP(100)`; at low level that is a level-up, and the probe's cue capture
shows the queue order `["⚡ LEVEL UP! Level 2 ⚡", "🎨 Unlocked: Cyan!", "⚔️ Rival defeated!"]`. The
reward cue therefore arrives third. Existing `queueToast` semantics, consistent across the game;
recorded for the running-game pass.

### 13. NIT — a materialising rival is not in the occupancy set for a second spawn

`rivalCombinedSnake()` (L821-828) collects only `active` rivals, and `spawnRival` relies on it through
`findFreeTile`. So under `double_rival` a respawning telegraph can be placed on another rival's
telegraph (or have the other one placed on it). Cosmetic and in the same class as the already-accepted
"two rivals can overlap", but the accepted list attributes that to active rivals ignoring each other,
which is a different mechanism.

### 14. NIT — the double-`gameOver()` risk is closed by an accident worth a comment

Two rivals eating in one tick with the Pressure Cooker live both reach `advanceShrinkZone()` → `true`
→ `gameOver()`; probe shows one call, not two, because `gameOver()` does `rivals = []` (L3755) and the
update loop's condition re-reads `rivals.length` (L7179), ending the loop mid-iteration. Correct
today, one line-move away from being a double `finalizeSession` + a squared cascade multiplier.
A one-line comment at L7178 ("`gameOver()` empties `rivals`, which is what stops this loop") or a
`if (gameState !== 'playing') return;` inside the loop would make it deliberate.

## Notes on things that are *not* defects (checked because they looked like ones)

- **The Pressure Cooker's pre-move head.** Differential probe: a player whose pre-move head is outside
  the first shrink boundary and whose post-move head is inside it dies in v13 (`'Caught by the
  shrinking zone!'`) and survives on `e2851ac`. That is a real behaviour change, it is documented in
  AGENTS.md and in-code, and the justification (the shrink timer and `rapidDoom` both run in the tick
  prologue — L7321 and L7303, both ahead of the player's move at L7383) is correct. Accepted; no action.
- **`deferCount` is not snapshotted** and does not need to be: `(rr.deferCount || 0) + 1` (L7152) is
  undefined-safe, and a mid-deferral restore restarts the deferral (probe: `active false, timer 100,
  defer undefined` → activates normally). Cell (6) of the assignment is answered: `deferCount` is
  correctly *not* required.
- **Gauntlet + `double_rival` works end to end**: at run start `rivals` is empty (wave 0 has no rival),
  and `startNextWave()` on wave index 2 yields two materialising rivals. `pickDraftOptions` keeps
  `double_rival` in the pool for classic/timeAttack/gauntlet and drops it in Zen (probe P12).
- **The board-full guard** is `currentSnake.length + obstacles.length + extraFoods.length` (L2103) and
  the seven callers listed in AGENTS.md pass a complete `currentSnake` — the corrected AGENTS note is
  accurate.
- **The remaining item-9 interactions**, traced rather than probed because each is a straight code
  path: **hazards** — `updateRival` contains no hazard test and `isHazardCollision` is only ever
  applied to the player's head, so the rival is immune exactly as AGENTS.md says. **Bomb** — the only
  bomb special case is `if (eatenType === 'bomb')` at L7689, inside the *player's* eat handling; the
  rival's eat branch (L3563-3598) has none, so a rival that eats a bomb simply consumes it (pre-existing,
  unchanged). **Portal food** — a rival eating an epic removes the player's portal twin (L3574-3576);
  the twin is then gone without the player receiving the epic bonus, which is the documented
  one-tick food-competition flip, not a new defect. **Magnet** — the magnet pull (L8094) targets the
  player's head, excludes hunter/bomb/portal and never reads `rivals`, so the only interaction is
  pre-existing food competition. **Hoard / Pigment-Rush freeze** — both rival loops are gated on
  `!hoardActive && rivalFreezeMs <= 0` (L7140, L7178) and the wind-up pauses with them (C6 green).
  **Shrink zone** — the pre-move-head change, covered above.

## Minimum change set for SHIP

1. `test-v13.mjs` **B12**: give rival 0 a real direction and assert `delta === 2 && score === 100`
   (or `delta >= 1 && score === delta * 50`). — Finding 1
2. `test-v13.mjs` **B11**: replace `typeof r.ate === 'boolean'` with the flip's observable outcome, or
   delete the assertion. — Finding 2
3. **Gauntlet completing tick** (L7140/L7178 vs L7243-7255): either gate the rival move on the wave
   objective or add the behaviour to AGENTS.md's accepted-changes list. — Finding 3
4. `AGENTS.md`: reword "rejects 1-ply self-collisions" to the chase-branch, alternative-exists form, and
   add the dropped self-rejection assertion. — Finding 5
5. `snake.html:1103`: fix the `leech` descriptor wording. — Finding 6
6. `pickDraftOptions`: keep the pool non-empty. — Finding 7
7. `test-v13.mjs`: assert the three HUD strings; consider unfreezing the `0.0s` display. — Finding 8

Items 4-7 are one-liners. Item 3 is a decision (fix or document); item 1-2 are test truth repairs.
Everything else is a note. The mechanics themselves do not need another cycle.
