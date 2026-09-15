# Snakes v13 — Design Plan Review 1 (correctness)

**Scope.** `v13-design-plan.md` (revision 1) read line-by-line against `snake.html` @ `e2851ac`
(9174 lines) plus `test-v12.mjs`, `test-evolution.mjs`, `test-v9.mjs`, `test-helpers.mjs`.
Five throwaway Playwright probes were run; real output is pasted where cited and the probe files are
deleted. In the probe output `stats.rivalsDefeated` is cumulative within one page load, so only the
deltas are meaningful.

**Method for the hoist probes.** Feature B moves the rival block from the tick tail (L7787-7803) to
just after the `rivalFreezeMs` decay (L6815). That order was emulated in-page without touching
`snake.html`: `updateRival(0)` is called first (the hoisted block), then `updateGame()` with its own
tail rival loop neutralised for that tick, so exactly one rival move still happens per tick.

## Verdict

The diagnosis is right and unusually well-verified. The v5 regression cluster is real, and I
reproduced the plan's central measurements (free growth to the cap, the duplicated head cell in the
rival's eat branch, the gap-1/gap-2 asymmetry, the leech fall-through). Feature A's direction and the
**rival-moves-first / one save chain** structure of Feature B are the correct designs.

But the flagship's two load-bearing mechanisms do not work as specified. `rivalHeadOnIdx` can never be
consumed: the head-on branch it is set from calls `removeRival`, which clears `active` and empties the
body, and *both* guards that would read it are false by the time `checkPlayerDeath` runs. And
Feature A's step 4 ("run the existing eat block unchanged") re-ships the exact duplicate-push defect
the feature exists to delete. Worse, the hoisted head-on predicate compares the rival's new head
against a player head the tick is about to vacate, which manufactures a kill class that does not exist
today. Features D, E and G are sound; E's stated justification is factually wrong but its conclusion
holds; C's "impossible state" premise is false and its deferral is not "provably fair".

## Verified claims

| # | Claim | Result |
|---|---|---|
| 1 | `snake.html` 9174 lines, master `e2851ac` | VERIFIED |
| 2 | Tick order: `checkPlayerDeath` call L7214 < rival block L7797-7800 | VERIFIED — F1's premise holds |
| 3 | `r.snake.unshift` with no per-tick vacate, L3404-3405 | VERIFIED — free growth to the cap |
| 4 | Eat branch pushes the head's own tile, L3408 | VERIFIED — probe: a length-3 rival eating ends at **5** with `["120,100","100,100","80,100","60,100","120,100"]` (`dupes:true`) |
| 5 | `removeRival` credits every active removal, L3463 | VERIFIED |
| 6 | Head-on free kill L3440-3445 | VERIFIED (probe 2, "today" row) |
| 7 | Leech fall-through kills the player at rival length ≥ 5 | VERIFIED by trace: the drain loop (L7166) pops `min(3, L-1)`, so L=4 → 1 → `removeRival`; L=5 → 2 → the segment test at L7181 finds the rival's head under the player's head → death |
| 8 | `prevRivalSnake` written L6973, read nowhere | VERIFIED (only L427 declaration + L6973 write) |
| 9 | The `advanceShrinkZone` comment L2731-2734 is stale | VERIFIED — wired at L3432, pinned by `test-v12.mjs:386-418` |
| 10 | `double_rival` gated on a literal mode list L2630/L8450/L8467, no mode filter in `pickDraftOptions` L6471 | VERIFIED |
| 11 | `drawRival` skips `!r.active` at L5850 | VERIFIED |
| 12 | `hazardAdjacentThisTick` declared L209, reset only at L6793 (never in `resetGame` L2282-2450 or `resetWaveState` L6220) | VERIFIED |
| 13 | Rival snapshot fields at build L2887 / restore L3060 | VERIFIED — and `moveCounter` is absent from both |
| 14 | No test pins seeded replay/ghost positions, so the hoist's RNG reshuffle is contained | VERIFIED |
| 15 | `spawnTime: performance.now()` is wall-clock but read only by draw code (L5286/L5459/L5530) | VERIFIED — the determinism claim survives |
| 16 | Feature C's "`!active && snake.length > 0` is currently an impossible state" (plan L276) | **REFUTED** — `test-v9.mjs:236` constructs exactly that |
| 17 | "`test-v12.mjs` A14 and `test-evolution.mjs` drive `updateRival` directly without advancing `gameTick`" (plan L236) | **HALF** — A14 does (L407); `test-evolution.mjs` calls `updateGame()` (L196), which advances `gameTick` at L6975 |
| 18 | Plan L213 "a scripted head-on from 2 tiles: the player must die and the rival must survive" versus the matrix | CONSISTENT, not a contradiction — at gap 2 the player dies via case 1 (the rival's post-move head is under the player's new head) and the rival survives; the matrix's "mutual" is the gap-1 swap. Verified both by trace. |
| 19 | Line citations: `tryStreakChargeSave` L7045 (plan says L7042); `advanceShrinkZone` reads `snake[0]` at L2744 (plan says L2736 = the declaration); `FOOD_TIERS.common.color` L1443 (plan says L1441); `drawRivalHUD` L6116-**6130** (plan writes "L6116-1130") | NITs — four off-by-a-few, no argument depends on them |

## Blocking

**1. `rivalHeadOnIdx` can never be consumed — case 3 of the contact matrix is inert (plan L144, L157, L158-160, L192).**
The flag is set where the head-on resolves, i.e. the branch at L3440-3445. That branch calls
`removeRival(idx)`, and `removeRival` (L3455-3458) sets `r.snake = []` and `r.active = false`. The
consumer is `checkPlayerDeath`'s rival loop, guarded twice: `if (rivals[rci].active)` (L7159) and
`for (var rcj = 0; rcj < rivals[rci].snake.length; rcj++)` (L7180). After a head-on, the first is false
and the second runs zero iterations, so **no placement of the OR inside that block can fire** —
including the outer guard, because the body is empty too. Probe 2 (gap-1 swap, the exact case the
matrix calls "mutual"):

```
today   {"state":"gameover","cause":"You were caught by the rival!","defeated":4}
hoisted {"state":"playing","cause":"","defeated":5,"rivalActive":false,"rivalSegs":0,
         "playerHead":"{\"x\":220,\"y\":200}"}
```

So under the plan as written the swap still yields "rival destroyed, `stats.rivalsDefeated` +1, player
unharmed" — the F1 defect, unchanged, at the one geometry the feature is named for. The plan's own
catch for this (L192, "assert `rivalHeadOnIdx === -1` at the tick tail") passes vacuously, and the
scripted case-3 check (L213) uses gap 2, where the player dies through case 1 whether or not the flag
works. **No stated catch detects this.**
Fix: give `checkPlayerDeath` an explicit hit term that does not depend on `active` or on body length,
e.g. replace L7180-7181 with
`var hit = (rivalHeadOnIdx === rci);` / `for (var rcj = 0; !hit && rcj < rivals[rci].snake.length; rcj++) { if (...) hit = true; }` / `if (hit) { ...existing shield/phoenix/streak/cause chain... }`
and enter the block for that index (`if (rivals[rci].active || rivalHeadOnIdx === rci)`), so the
delta-pinned save order is reached exactly as it is for a live rival.

**2. Feature A step 4 keeps the duplicate push it exists to delete (plan L107).**
"run the existing eat block **unchanged**" is the defect: L3408 is
`r.snake.push({ x: newHead.x, y: newHead.y });` — a second cell on the head's own tile. With the plan's
steps 2+4 the sequence for a length-3 rival eating once is pop(2) → unshift(3) → `push(rTail)`(4) →
the eat block's `push(newHead)`(5): **+2 length and two identical cells**, i.e. precisely the failure
mode the plan lists at L123-127 while its change text mandates it. Probe 3 shows the block doing the
push on today's code (3 → 5, `dupes:true`); the plan's own steps add the extra `push(rTail)`.
The cap consequence the task asked about: at `RIVAL_MAX_LENGTH` = 20 the single `pop()` at L3409
(pop→19, unshift→20, push(rTail)→21, push(newHead)→22, pop→21) leaves the rival **permanently one
segment over the cap**, since a non-eating tick is now length-neutral.
Fix: delete L3408 (growth is already applied by step 4) and keep L3409's cap.

## Major

**3. The hoisted head-on test fires against a player head the tick then vacates — a new kill for a pure near-miss (plan L144, L158-160).**
With the rival block hoisted, `var playerHead = snake[0]` (L3441) is the player's **pre-move** head,
i.e. the tile the player leaves this tick. Probe 5 — player head (200,200) moving north, rival head
(180,200) moving east, so the rival's new head is the player's vacated tile:

```
today   {"state":"playing","cause":"","defeated":0,"rivalActive":true,  "head":"{\"x\":200,\"y\":180}"}
hoisted {"state":"playing","cause":"","defeated":1,"rivalActive":false, "rivalSegs":0}
```

Today nothing happens (correct: no co-occupancy at the tick tail, and the player never entered a rival
segment). Hoisted, the head-on branch fires and destroys the rival — and once B1's flag is made to
work, the same predicate kills the player too. The tick ends with the player one tile away
perpendicular, so this contradicts the plan's own case-1 rule (the player did not enter a rival
segment), its case-3 wording ("the rival's head enters the player's **head**"), and its
no-co-occupancy principle. Fix: gate the head-on on the swap — record the rival's pre-move head tile
at L3383 and set `rivalHeadOnIdx` only when `newHead === playerPreHead` **and** the player's new head
lands on the rival's pre-move head tile (`prevSnake[0]` at L6971 is the same tile and is available at
the consume site), or, at minimum, record the contact tile and require the player's **new** head to be
in the rival's **pre-move** body.

**4. The rival's body-contact test reads the player's pre-move body, so it kills a rival that enters any tile the player vacates this tick (plan L143).** At the hoisted moment `snake[snake.length-1]`
is exactly the tile the player pops at L7014 — the classic tail-follow. Probe 4 (rival head entering
the player's tail tile; the player's tail ends the tick at (160,200) while the rival entered
(140,200)) shows the geometry the plan's `removeRival(idx, true)` would fire on. Consequence: a rival
simply chasing the player is destroyed (and credited) for entering a tile nobody occupies at the tick
tail, so the advertised counterplay ("park your body in the rival's path", L216) fires when the player
runs away. Fix: evaluate the rival's body test against the player's **post-move** body — i.e. resolve
it after L7233's `snake.unshift(wrappedHead)` (which also makes both actors symmetric with case 1) — or,
if it must stay inside `updateRival`, compare against `snake.slice(0, -1)` and leave the head tile to
finding 3.

**5. The leech fix changes the counter's contract while the credit table calls it unchanged (plan L173, L193-196).**
"On a drain that leaves the rival at length > 1, still `removeRival(idx, true)`" means *every* leech
head-to-head removes the rival; today only a drain to ≤1 does (L7174). The 3-segment drain becomes
cosmetic and `stats.rivalsDefeated` inflates for every leech player, while the table row reads "Leech
drain to ≤1 | L7174 | yes — unchanged, the v6 design of record". Fix: correct the row to "leech
head-to-head, any length" and either state the balance change as deliberate or keep the partial drain
(rival survives at length > 1 → the player still dies at L7181, so if the drain is kept the
fall-through must be suppressed differently).

**6. "Both suites green, unedited" is false for `test-evolution.mjs` (plan L204-208, L435).**
That suite hand-builds a 4-segment rival at x=240/260/280/300 (`test-evolution.mjs:187-191`) with food
at (20,20) and calls `updateGame()` (L196). Under the hoisted order the rival moves **before** the
leech drain, and its next tile east is its own second segment, so it self-destructs at L3399-3400
before the player can drain it. Probe 1:

```
today   {"tier":0,"len":11,...}   suite asserts tier===0 && len>=10 -> PASS
hoisted {"tier":-1,"len":8,...}   -> FAIL (both assertions)
```

(variant with a well-formed `dx`/`dy` on the rival: same FAIL). Fix: either state that
`test-evolution.mjs`'s leech fixture is invalidated and must be rewritten in the same change (give the
rival a body that is not its own next tile), or test the leech against a pre-move rival — the plan
cannot claim the suite unedited. Separately, the *reason* given for a counter over `gameTick` (L236)
is wrong for this suite: it calls `updateGame()`, which advances `gameTick` (L6975). The counter is
still the right choice (A14 does drive `updateRival` directly), so keep it, fix the sentence.

## Minor

**7. Feature C redefines a state that an existing suite constructs (plan L276-280, L435).**
`test-v9.mjs:236` builds `{snake:[{x:0,y:0}], dx:0, dy:0, active:false, respawnTimer:100}`. Under
Feature C that rival is *materialising*, so `updateGame()` activates it in place with the fixture's
stale (0,0) direction instead of calling `spawnRival` (which today re-tiles it and zeroes the timer).
The test's `after < during` assertion then depends on unspecified details: whether activation zeroes
`respawnTimer`, and whether the same tick's rival loop then moves a (0,0)-direction rival into
`removeRival` (which resets the timer to 10000 and would fail the assertion). Fix: state the
activation's effect on `respawnTimer` explicitly and add `test-v9.mjs` to the list of suites whose
fixtures the change invalidates.

**8. Feature C's deferral is not "provably fair" (plan L288-291).** The telegraph tile is fixed 1600 ms
before activation (with Feature D's floor measured at spawn, against the player's **pre-move** head
once the hoist lands), and the deferral only rewinds when the player is on that exact tile. A player
walking toward or past the telegraph can be adjacent at activation, and the next tick's head-on test
(finding 3) then produces the mutual death the plan's risk register already worries about. Fix:
re-check the wrap-aware separation against the player's current head at the activation instant and
defer while it is inside the Feature D radius, not only while co-occupied.

**9. The no-co-occupancy invariant is over-strict and would fire on a legitimate save (plan L198-201).**
The shield path (L7182-7188) cancels the hit without relocating the player, so any shield block against
a rival body leaves the player's head sharing a tile with an active rival segment at the tick tail —
which is exactly what the 300-tick soak asserts cannot happen. State the invariant as "no tick tail
ends co-occupied unless a save fired", or nudge the player to a free tile on the save.

**10. The hoisted guard now skips the mid-tick, not just the tail (plan L146-152, L186-191).** Today a
rival-eat that kills the player through the Pressure Cooker (L3432-3436) has already run everything
from L6795 down; after the hoist it has run only L6793-6822, so the skipped set additionally includes
`tickResonance()` (L6969), `gameTick++` (L6975), the direction consume + replay record (L6997-7010),
`stats.totalDistance`/`awardXP(1)` (L6976-6977), the Time Attack clock (L7002), `lastTickTime` (L7850)
and `visualDirty` (L7851). The frame is not stale (`gameOver()` sets `visualDirty` and calls
`drawGame(1)` at L3600-3601), and with `double_rival` rival 1 still moves after rival 0's kill (the
guard stays after the loop, as today). Also `checkAchievements`/`checkQuestProgress` (L7496-7497) now
see the same tick's `stats.rivalsDefeated` increment, which today lands after them — a 1-tick-earlier
RIVAL_SLAYER/quest unlock. All acceptable, but the plan's L188 says "no post-death tick effects ran"
and its risk register says "nothing else changes"; both sentences need the new scope, and the in-code
comment at L3429-3431 ("the caller's tick-tail guard") becomes wrong.

## Nit

**11.** `moveCounter` is not in the rival snapshot (build L2887 / restore L3060); the plan's
"snapshot-additive (build L2887 / restore L3060)" reads as if it were. The restore's explicit field
list makes the omission safe (`undefined` → `|| 0`), and no `SNAPSHOT_VERSION` bump is needed either
way — say which you intend.

**12.** `drawRivalHUD` cannot render the plan's three states until L6120 (`if (rivals[ri].active)`) and
L6122 (`if (rivalLen === 0) return;`) change; the plan names only `drawRival` L5850. Feature F's
failure-mode catch ("the telegraph branch is asserted to emit draw calls") will not catch a HUD that
still prints nothing during the wind-up.

**13.** Citation fixes: `tryStreakChargeSave` L7045 (not L7042), `advanceShrinkZone`'s `snake[0]` read
L2744 (not L2736), `FOOD_TIERS.common.color` L1443 (not L1441), `drawRivalHUD` L6116-6130 (not
"L6116-1130"), Feature D's "streak charge L7047 / Phoenix L7104" → L7051 / L7107.

## Feature verdicts

| Feature | Verdict | Required change |
|---|---|---|
| **A** movement integrity | **accept with changes** | Delete the eat block's head-push (L3408); state the cap's behaviour at 20; `removeRival(idx, false)` on self-hit is right |
| **B** contact resolution | **accept with changes** (structure accepted: hoist + one save chain) | Fix the flag's consumption (finding 1); make the head-on the swap, not any vacated tile (3); move the rival's body test post-player-move (4); fix the leech row and the suite claim (5, 6); re-scope the verification/invariant/catch text (9, 10) |
| **C** spawn telegraph | **accept with changes** | Drop the "impossible state" premise; specify activation's `respawnTimer` handling; re-check separation at activation; add `test-v9.mjs` to the invalidated fixtures; name the `drawRivalHUD` guards |
| **D** spawn separation | **accept with changes** | Keep the default at 3 raw tiles as written, but measure the floor at the **activation** instant (or fold it into C's deferral) — the current catch measures spawn time only |
| **E** cadence | **accept** | Keep the per-rival counter and the `RIVAL_MOVE_CADENCE - 1` spawn value (A14 passes: `moveCounter || 0` → 1 → 1 % 3 ≠ 0 → the first call moves); fix the `test-evolution.mjs` justification; decide on the snapshot field |
| **F** legibility | **accept with changes** | Add the `drawRivalHUD` guard changes; add the `drawRival` L5850 guard to the hooks (the telegraph is invisible without it) |
| **G** truth repairs | **accept** | All four items verified against the code (10, 8, 9 above); no change |
| — | **reject: nothing** | No feature is wrong in kind; only the two flagship mechanisms above are wrong as specified |

## Invariant audit

- **No `SNAPSHOT_VERSION` bump** — CONFIRMED. `moveCounter` and the re-used materialising
  (`active=false`, `snake=[tile]`, `respawnTimer`) state all round-trip or default safely through
  L3060's explicit map; `respawnTimer: r.respawnTimer || 0` and `active: !!r.active` are already
  undefined-safe.
- **Both reset sites** — CONFIRMED for per-rival state (`resetGame` L2356, `resetWaveState` L6295 both
  set `rivals = []`). `rivalHeadOnIdx` does **not** need adding to them: it is set and consumed in the
  same tick, and every early return between them leaves `gameState !== 'playing'`, so the L6793 reset
  (which precedes the hoisted block) clears any stale value before a consumer — the same reason
  `hazardAdjacentThisTick` (L209) is not reset there either. It must, however, be reset *before* the
  hoisted rival block, which L6793 is.
- **Canvas save/restore** — CONFIRMED for `drawRival` (L5851/L5856); the new dashed-ring/arc branches
  need their own pairs (dash and alpha are global), and the plan says so. Not covered: the
  `drawRivalHUD` state change (nit 12).
- **Death-save chain order** — CONFIRMED, provided finding 1's fix routes the flag through the
  existing L7182-7205 block rather than duplicating it (shield → phoenix → streak → death on the rival
  path; shield → vampire → streak → serpentine → death on the collision path, unchanged). The leech
  change (5) does not touch the order, only the removal condition.
- **No 60fps calibration** — CONFIRMED. The cadence is a per-rival call counter; the wind-up is
  `RIVAL_WINDUP_MS` minus `tickInterval` inside the existing respawn loop; the deferral adds
  `tickInterval`. Nothing new reads `Date.now()`.
- **No `Math.random()` in game logic** — CONFIRMED. The new code adds none; the only new non-determinism
  is the RNG *order* change from the hoist (`updateRival`'s `seededRandom()` calls now precede the
  player's eat/`generateFood`), which the plan already accepts, and no test pins a seeded replay or
  ghost position (verified).

## What to change, in order

1. **Make the flag reachable and narrow** — an explicit `hit` term in `checkPlayerDeath` that does not
   depend on `active`/body length, gated on the gap-1 swap (findings 1 + 3). Without this, Feature B's
   headline case ships inert and untested.
2. **Delete the eat block's head-push** (finding 2), and state the `RIVAL_MAX_LENGTH` behaviour at 20.
3. **Resolve the rival's contacts against the player's post-move body** (finding 4), which also removes
   the need to reason about which tiles the player is vacating.
4. **Reword the two claims that are false** — "both suites green unedited" (6) and the leech row (5) —
   before they are used as gates.
5. **Give Feature C an activation-time separation check** (8) and stop calling the deferral "provably
   fair"; add `test-v9.mjs`'s fixture to the invalidated list (7).
