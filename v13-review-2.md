# Snakes v13 — Design Plan Review 2

## Verdict

**Approve with changes — the diagnosis is the best-grounded of the three cycles, and the flagship is
not buildable as written.** The regression cluster is real: every load-bearing claim about the rival
(lines, growth, the free kill, the ghost body, the wrap-unaware spawn) re-verified here against
`snake.html` and against a running game. Feature A is the right first move and its evidence is a git
diff, not an opinion.

But the plan's *verification layer* repeats the v11/v12 mistake in a new shape: two of the flagship's
six catches cannot fail (F-2, F-5), one is red forever on a path the plan never touches (F-3), and the
gate it sets for step 2 ("`test-v12.mjs` green, `test-evolution.mjs` green unedited") is measurably
unachievable once the hoist lands (F-1). Separately, Feature B's contact matrix and Feature B's own
running-game check describe two different games (F-4), and the plan's reading of JC's first sentence
is refuted by the line the plan cites to prove it (F-6).

Fixes are small and local: one comparison moved inside `checkPlayerDeath`, one teleport added to the
shield save, four assertions replaced. Nothing here argues for reopening the diagnosis, the feature
list, or the build order.

## Citation audit (the plan's credibility claim, checked)

The plan says every finding was re-checked by hand. Spot-checking the load-bearing citations:
`L3404-3405` (unshift + conditional pop), `L3393-3402`, `L3342-3380`, `L3440-3445`, `L3463`,
`L3307-3334`, `L3232`/`L3239`, `L7157-7207`, `L7161-7177`, `L7214`, `L2736`, `L7787-7793`,
`L7797-7801`, `L7803`, `L6815`, `L6793`, `L2887`/`L3060`, `L2628/2631/2647`, `L6336`, `L8450/8467`,
`L6471`, `L1441`, `L1261/1286/1367-1371`, `L1953`, `L427`/`L6973`, `L2731-2734`, `L4025-4107`,
`L5223-5245`, `L5847`/`L5850-5856`, `L3539`, `L2356`, `L6285` — **all verified at the cited line**,
including the two rival-defeat colour hexes (`FOOD_TIERS.common.color === '#FF4444'` at `L1441`,
rival 0's body literal at `L3310`) and the "six other `findFreeTile` callers" count (exactly six:
`L4428`, `L6194`, `L7047`, `L7104`, `L7192`, `L7871`).

Four citations are wrong, all typos rather than misreadings — **NIT**: `drawRivalHUD L6116-1130`
(`L363`; the function is `L6116-6130`), `L7161-1207` (`L181`; the segment-loop fall-through is
`L7180-7207`), `spawnRival (L3312)` for the *mode* list (`L400`; `L3312` is the `active` guard, the
mode list is `L3313`), and `playSound (L4025-4107)` (`L376`; the function is `L4007`, `L4025-4106` is
the case block).

## Part 1 — Does the design answer JC's three symptoms?

**Symptom 1, "it starts too long, should warn before appearing" — answered, but the plan's reading of
the first clause is wrong, and the second clause is a missing feature, not the same bug.**

- *"Should warn before appearing"* → **Feature C**. Observable: 1.6 s before the rival is lethal, a
  ghost tile with the hazard's dashed ring + countdown arc, `⚠ Rival in 1.4s` in the HUD slot, a
  `rival_warn` sound, and a screen-reader line. Direct, complete answer; it also reuses a vocabulary
  the player already knows. The one thing it inherits for free is correct (`spawnRival` is the single
  choke point, so every run-start/gauntlet/cascade spawn gets the warning).
- *"It starts too long"* → **Feature A**. Observable: `Rival: 2` two seconds after spawn instead of
  `Rival: 20`.

**F-6 (MAJOR) — the plan's evidence refutes the reading it asserts.** `L14-15` says "the first two are
the same bug wearing two hats", and `L38-40` calls "starts too long" **literal**, on the grounds that
the rival "inflates to a 20-tile worm in 2.3 s". Measured against `L3329`
(`r.snake = [{ x: spawnPos.x, y: spawnPos.y }]`) the rival *starts* at length 1 and *becomes* 20:
probe S4 reports `startLength: 1`, `lengthAfter: 20` over 19 calls. So "literal" is false as written —
the rival is never spawned long. This matters beyond pedantry: the second clause of JC's sentence is
an absent *feature* (`v13-ideas-legibility.md` §2C: `spawnRival` has no telegraph, no grace, no draw
state, and `r.active = true` is the only activation site), not a regression, and the plan needs both
A and C precisely because they are different things. Characterising them as one bug invites the
implementer to treat C as a symptom of A — and A alone would leave JC's actual request unbuilt.

Also missing from the plan, both readings: the design of record says the rival **starts at length 3**
(`docs/superpowers/specs/2026-05-18-snake-living-arena-design.md`, Feature 1 → Spawn). Feature A
keeps the ad-hoc 1 and grows only by eating, so a fresh rival is a single 20×20 px dot moving two
ticks in three (Feature E) — the least legible object on the board. **MINOR**: state the intended
start length and pick one (the spec's 3 is one line in `spawnRival`, `L3329`).

**Symptom 2, "I sometimes run through it, right after it appears" — answered, with a hole at exactly
the reported geometry.** Feature B (+A) is the right fix and the pre-image is confirmed here: probe S1
(a 2-tile head-on charge today) ends `state: playing, defeated: 1, rivalActive: false` — the rival
evaporates and the player is credited. Observable post-v13: charging a rival kills you (or the rival
dies credited when it rams you), and the rival's body stops being a ghost. The hole is F-4.

**Symptom 3, "make it slower maybe?" — answered by Feature E, which is the one feature the evidence
does not support.** Both actors move exactly one tile per tick at every setting (`tickInterval` at
`L1953`, recomputed at `L7862-7869`, scales both), so there is no speed asymmetry to correct, and
what JC felt was the 20-tile wall plus the same-tick spawn move — both of which A and C remove. See
Part 2(c).

## Part 2 — The three contested game-feel calls

### (a) Mutual destruction on head-on — reject as specified

**F-4 (MAJOR) — the rule as specified is not what the specified code does, and the plan's own two
descriptions disagree.** Feature B's matrix (`L142-145`) promises: *rival's head enters the player's
head → "mutual: rival dies (credited) and the player runs the save chain"*. Feature B's running-game
check (`L213-216`) promises: *"A scripted head-on in Classic from 2 tiles: the player must die and the
rival must survive."* Those are different outcomes for the same event, and the running-game text is
the one the code produces: under the hoist, `updateRival`'s head-on test compares the rival's
`newHead` against `snake[0]` **before** the player moves (`L3441-3443`), so for a 2-tile charge the
rival's new head equals the player's *destination*, not the player's *position* — no flag, rival
survives, and the player then dies on the segment test (`L7180-7207`).

The consequence is worse than a doc contradiction, because it also applies to the geometry the
ideation measured as benign. Probe S3 (the ideation's S3: player head `(200,200)` moving down, rival
head `(180,220)` moving right) confirms today's outcome is `playing`, player untouched, rival
destroyed, `defeated: 1`. Post-hoist, the rival arrives at `(200,220)` first and the player's
post-move head is `(200,220)`: the player dies on a tile the rival entered in the same tick, the
rival survives, and **no defeat is credited** — the matrix's row 3 promised a credited mutual kill.
So the plan's flagship rule is realised only in the geometry it should not be: when the rival steps
onto the tile the player is *leaving*. There, the player is moving away and is otherwise unhurt, and
the new `rivalHeadOnIdx` flag converts that into a death unless a save fires (the plan calls the
stale contact view "intended", `L184-190`; for food competition it is; for contact resolution it is
the same staleness the plan exists to remove, just pointing the other way).

It is also not the design of record: the spec's Collision Rules list *"Player head touches rival head
→ player dies"* and *"Rival head touches player head → player dies"*, with defeat reserved for *"rival
head touches player body"*. Mutual destruction is a new rule, and JC did not ask for it.

*Proposal (cheap, and what the matrix already claims):* delete `rivalHeadOnIdx` (step 3, `L158-162`),
and resolve the head-on where the two heads actually meet — inside `checkPlayerDeath`'s segment loop
(`L7180-7207`), where the colliding segment is the rival's head (`rcj === 0`): run the save chain as
today, and `removeRival(rci, true)` so the rival dies credited whether or not a save fired. Cost:
~10 lines, one file region, no new module state, no second reset site, and the frozen flag disappears
along with its two reset obligations. Keeping the hoist is still right (the player's head must be
tested against the rival's post-move body — that is what kills the free kill); it is the *flag* and
the one-sided comparison that are wrong.

### (b) The rival dies when its head enters the player's body — keep the rule, but it makes the rival weaker than the theme claims

The rule is the design of record (spec Feature 1, Collision Rules) and it is the counterplay that
gives the body a defensive use; probing it is not the problem. The problem is the composition with the
other two features, which the plan names only as a risk (`L454`) and never quantifies:

- today the rival's danger *is* its body: probe S4 shows a 1-segment rival becoming a 20-segment
  lethal wall in 19 ticks of empty movement, at exactly the player's speed;
- Feature A removes the growth, so the wall is gone unless the rival happens to eat;
- Feature E then makes it slower (2 of 3 ticks), so it also loses the food races that would let it eat;
- Feature B lets the player kill it by standing in its path, and Feature D keeps spawns 5 tiles away.

Net: the only surviving way the rival can kill you is *your* head entering *its* segment — i.e. only
player error remains. The theme's third word is "actually dangerous"; the design delivers "safe and
legible". The plan's mitigation ("re-checked in the running-game pass") is a screenshot, and F-5 shows
what a screenshot of a rival removes. **MINOR (design)**: keep the body rule, drop or soften Feature E,
and put one danger lever *in*: the spec's start-at-length-3 plus growth-by-eating means the rival can
be a real wall again if it is allowed to reach food (Feature A is that lever, but E defuses it).

### (c) The 2-of-3 cadence — not defensible as specified

Against it: the measured premise is absent (`v13-ideas-mechanics.md` §5: "1 tile/tick at every
configuration"; the rival "never chases the player"), so it does not fix a fairness problem; the
design of record's AI is explicitly a *resource competitor* ("The AI does NOT chase the player — it
competes for resources"), and a 2/3-speed competitor loses every food race against a full-speed
player, which removes the rival's only designed role; and the ideation's own ranked list puts it in
"NOT worth doing in v13", adding that "a stride is a balance lever, not a fairness fix". It is also
the only feature that *subtracts* from the theme. The plan knows all of this (`L222-228`) and includes
it anyway, which is defensible only if it is labelled as the balance change JC asked for rather than
as part of the fairness fix — and if the loss of menace is accepted in writing.

*Alternative if "slower" must ship:* the ideation's P1 (stride derived from the rival's own length:
1 tile/tick while short, 2-3 while long) keeps the food race at parity early and makes the long body
— the thing that was actually oppressive — the slow one. Cost: `gameTick` coupling, which the plan's
own `moveCounter` already solves (a length-derived stride can be counted per call the same way, so the
two direct-drive suites stay green).

## Part 3 — Scope

Seven features, ~330 production LOC. Ranked by value-per-line (value = does it move a symptom or the
theme; line = production LOC as the plan states it):

| Rank | Feature | LOC | Value/line | Basis |
|---|---|---|---|---|
| 1 | **A** movement integrity | ~14 | highest | root cause, git-verified against v4 `2608064`, and a prerequisite for every other claim about the rival |
| 2 | **C** spawn telegraph | ~30 | high | the literal ask; inert by construction; one choke point covers every spawn path |
| 3 | **B** contact resolution | ~75 | medium-high | kills the free kill and the ghost body, but ~15 of its 75 lines (the hoist + the flag) carry all the risk, and F-1/F-3/F-4 are all in that 15 |
| 4 | **F** (information half: HUD three-state, materialising draw, srSpeak, sound, colours) | ~20 | medium | the telegraph needs to be *visible*; the colour change fixes a measured confusion (`#FF4444` at `L1441` = rival 0 at `L3310`) |
| 5 | **G** item 1 only (`double_rival` truth) | ~8 | medium | the last player-visible lie; but see F-9 before implementing |
| 6 | **D** spawn separation | ~20 | low-medium | real (26 of 4000 spawns within 2 wrap tiles) but rare, and C's wind-up + activation deferral already makes a close spawn survivable |
| 7 | **F** (cosmetic half: outlines, fangs, per-rival identity, particles) | ~50 | low | no gameplay effect; the plan's own out-of-scope list forbids exactly this shape (`v13-ideation-context.md`, Out of scope) |
| 8 | **E** cadence | ~12 | negative | see Part 2(c): it buys a symptom that does not exist and costs the theme's third word |

**Weakest claim on the budget: E** (it is not a fairness fix by the plan's own admission, and its
only justification is JC's misdiagnosis) **and, per line, Feature F's cosmetic half** — ~50 lines of
outline/fang/particle work whose gameplay contribution is zero, in a plan that declares cosmetic-only
changes out of scope. **The two I would cut: E, and Feature F down to its information core** (keep the
telegraph draw, the three-state HUD, the two colour literals, the srSpeak lines; drop the fangs,
per-segment outlines, per-rival identity palettes, defeat particles and the new sound case). If a
full third (~110 lines) must go, D is the third cut — C's activation deferral (`L288-289`) already
covers the close-spawn sting that D's geometry fix addresses.

**Do the three symptoms survive the cut?** Yes. Symptom 1: A (growth) + C (warning) — cutting E and
F's cosmetics touches neither. Symptom 2: A + B. Symptom 3: **not answered literally**, and that is
the point of the cut — the measured evidence says there is no speed asymmetry to fix, and JC's felt
"speed" was A's wall arriving at spawn; A + C change what the player sees within the first two seconds.
Record the decision explicitly (the plan currently only records E's evidence, not the consequence of
dropping it), and note that E is a one-feature revert if the running-game pass disagrees.

## Part 4 — Verification design (the important one)

Building order and gates (`L429-445`) are sound in shape; the score is in whether each stated catch
can fail. Checked one by one:

| Feature | Stated catch | Can it fail? |
|---|---|---|
| A | 10 direct `updateRival` calls, food each step: +1 per eat, no two segments share a tile | **Yes** — behavioural, and it discriminates the duplicate-push mode. Keep. |
| A | straight-line body, 6 moves, "head tile equals the vacated tail tile for one tick" | **No** — **MINOR**, `L121-122`. In a straight line the head never re-enters the vacated tail tile, with or without the tail-vacate, so the assertion cannot observe the ordering it is for. Probe S7 is the geometry that can (below). |
| A | epic on the rival's next tile → portal twin removed | **Yes.** |
| B | Pressure Cooker: rival eats, player on the shrink boundary → `gameover`, no post-death effects | **Yes** for the guard; says nothing about contact staleness. |
| B | `rivalHeadOnIdx === -1` at 200 tick tails | **Vacuous** — **MINOR**; the flag is reset at the top of every tick regardless, so it cannot fail unless the reset line is missing; it does not test the flag firing in the *wrong* geometry (F-4). |
| B | one head-on per save type → `playing` + `lastSaveEvent` | **Partly.** Phoenix/streak teleport and are asserted; the **shield** save is omitted from the list and is the one save that leaves the head on the rival (probe S2). |
| B | 300-tick randomized soak: no tick-tail co-occupancy | **No, and it is unsatisfiable** — **BLOCKING**, F-2/F-3. |
| B | same seed twice, diff the tick-by-tick state | **Cannot fail for its stated reason** — **MAJOR**, F-5. |
| B | `test-v12.mjs` + `test-evolution.mjs` green unedited | **Unachievable** — **MAJOR**, F-1. |
| E | force a skip with food behind; `r.dx/r.dy` byte-identical | **Yes** — the right check (it pins the skip above the re-roll). |
| E | 30 calls on an empty board → 19-21 tiles | **Yes.** |
| C | stand on the telegraph tile for the whole wind-up; `playing` every tick; deferral fired | **Yes** — the strongest catch in the plan (it is exactly the v12 B lesson). |
| C | the telegraph branch "is asserted to emit draw calls" | **Unspecified** — no mechanism named; the screenshot is doing the work. The v12 precedent (wrapping `ctx.save`/`restore`, `test-v12.mjs:545-556`) is the cheap device. **MINOR.** |
| C | snapshot mid-wind-up, restore, still materialising, never double-activates | **Yes**, and it is the right test of the "no new snapshot state" claim. |
| F | port `test-v12.mjs`'s save/restore depth assertion to the rival cycle | **Portable and can fail** — B2 wraps the whole frame, not `drawHazards`, so driving `drawGame(1)` with a rival present (and the wind-up/active/defeated states staged via `respawnTimer`) is the same instrumentation. But it is blind to the state Feature F itself calls global: a leaked `setLineDash` leaves depth at 0 and corrupts every later stroke. |
| F | duplicate `playSound` case | Yes (grep). |
| D | save suites green + a direct `findFreeTile` call | Yes. |
| D | fill a row, force a spawn, assert the re-arm | **Yes, but the companion assertion under-samples**: `findFreeTile` returns `null` after 50 attempts (`L3235-3246`), and the plan does not require the ≥5-tile/40-spawn check to count *placed* spawns. **MINOR.** |
| G | "spawns a second rival where offered and is not offered where it cannot" | **Not satisfiable by the stated change** — **MINOR**, F-9. |

### F-1 (MAJOR) — the step-2 gate "`test-evolution.mjs` green, unedited" is not achievable, and the plan mis-reads that suite

`L204-206` says "`test-v12.mjs` A14 and `test-evolution.mjs`. **Both hand-build rivals and drive them
directly.**" Only A14 does. `test-evolution.mjs:175-196` builds a rival with **no `dx`/`dy`** at
`(240,200)`…`(300,200)`, an 8-segment player whose head is at `(200,200)` moving right, and calls
**`updateGame()`** — it asserts that the leech's ≈2-tile adjacency window (`L7163-7166`) catches the
rival's head *before* the rival moves.

The hoist moves the rival's step ahead of the leech test, so the geometry shifts by one tile and the
rival's randomly-rolled direction decides the outcome. Measured (probe, 200 samples, rival block run
first exactly as `L148-155` specifies): the leech would fire in **79/200** samples; in **75/200** the
rival's own first move lands on its own body segment `(260,200)` and it removes itself before the
player's check; in **46/200** the missing `dx`/`dy` plus the "continue straight" branch (`L3352-3353`)
produce a `NaN` head, which the leech arithmetic (`ldx <= TILE_SIZE`) silently rejects. Today that
suite is green (`ALL GREEN (11/11)` at HEAD) because the rival is read pre-move. Post-hoist the
assertion `evolutionTier === 0` fails most of the time, and the suite is not even deterministic.

Two fixes, and the plan needs both: (i) start the rival in that test with an explicit `dx`/`dy` (a
one-line edit in `test-evolution.mjs`, which means the gate must read "green after the two documented
test setups are made explicit" rather than "green unedited"); (ii) decide deliberately what the
adjacency window means post-hoist — a leech counter that fires on the rival's *pre-move* head is now
impossible, so the descriptor's "head-to-head" (`L1103`) should be restated as the post-move
proximity it will actually be.

### F-2 / F-3 (BLOCKING) — the no-co-occupancy soak is both vacuous and unsatisfiable

`L198-200` makes tick-tail co-occupancy "the invariant that makes JC's complaint impossible". Probes:

- **It cannot fail on the bug it is attached to.** S1 (the 2-tile charge, i.e. the F1 scenario) leaves
  `coOccupancy: []` because the rival has been *removed* before the tick tail. S3 likewise. Every F1
  shape the ideation measured ends with the rival dead or the player dead, never with two occupied
  bodies — because the bug is a *staleness* bug (which actor was tested against which snapshot), not
  an overlap bug. An overlap at the tick tail is not what the current code produces, so the soak is
  green today on a broken build.
- **It is red forever on a path Feature B does not touch.** S2: `shieldActive = true`, rival head at
  `(120,100)`, player head moves `(100,100) → (120,100)`. The shield branch (`L7182-7189`) consumes the
  shield and `return false`, and the caller then unshifts the head onto the rival's tile (`L7233`).
  Tick tail: `coOccupancy: [[0,1]]`, rival active, `gameState: 'playing'`. That is the ideation's F10,
  it is still true after v13, and the plan never mentions it. So the invariant is either false (if the
  soak ever draws a shield against a rival) or vacuous (if it never does) — neither is a catch.

*Fix (both halves):* make every save that absorbs a rival contact leave the head off the rival — the
phoenix/streak paths already do it by setting `teleportSavePos` (`L7190-7201`, `L7042-7060`); give the
shield branch the same treatment (`teleportSavePos = findFreeTile(wrappedHead.x, wrappedHead.y, true)`),
and then keep the soak as a *regression* guard, not as the primary evidence. The primary evidence must
be per-contact-type assertions of outcome (state, cause, save event, defeat delta), not geometry.

### F-5 (MAJOR) — the determinism catch is attached to a failure mode it cannot observe

`L201-202`: "The hoist flips food-competition order, so every seeded run's outcome changes — once …
**Catch:** run the same seed twice through the new code and diff the tick-by-tick state." A
deterministic reordering produces *identical* runs, so the diff is green by construction for the
failure mode it is paired with. Measured: two same-seed runs of 178 ticks, `firstDiffAt: -1`. The
catch does have power (it would catch a `Math.random()` or a `Date.now()` leaking into the reordered
region), but that is a different and smaller claim than the one it is filed under, and the plan offers
no pre-hoist baseline, so the "outcome changes — once" acceptance is unverifiable.

Two things worth asserting instead, both cheap: (i) the order flip is *intended* only for food
competition — assert the flip directly (`place food two tiles from both heads; assert the rival eats
it and the player's score is unchanged`), and (ii) the reproducibility claim needs the runs driven
identically (a synchronous `driveTicks` loop, as measured here); a wall-clock-driven pair is not
reproducible because combo windows read `Date.now()` (`lastEatTime`, `L7283`) and the harness's
`waitForTicks` would make the diff flaky.

### The running-game screenshots

`L213-218` (and the equivalents for C, D, F) rest on screenshots. For the flagship that is not a weak
check but an inverted one: probe S1's tick tail is not merely uninformative, it is *identical to a
legitimate kill* — `removeRival` fires the same 20-particle burst at the rival's head (`L3454`) for a
free kill as for a body-block kill, so the screenshot of JC's bug renders the bug as a success. A
pass-through is a single-tick event; there is no frame that contains it. Screenshots are the right
instrument for exactly one feature (F: fangs, outline, ring, countdown, frozen), and for everything
else the plan's own running-game pass should assert observable transitions: `stats.rivalsDefeated`
deltas, `lastDeathCause`, `lastSaveEvent`, `gameState`, and the tick-tail invariants of F-2.

### The three assertions the plan is missing (and one of them, run)

1. **Save-absorption position invariant** — after any rival contact that a save absorbs, the player's
   head must not be on a rival segment (and the rival must be accounted for). Fails today: probe S2
   `coOccupancy: [[0,1]]`. Pair it with the shield-save teleport fix above.
2. **Tail-vacate ordering, with geometry that can observe it** — the plan's straight-line version
   cannot (verified: probe S7).
3. **Canvas drawing-state, not just depth** — `ctx.getLineDash()` empty, `globalAlpha === 1`, and the
   transform unchanged at the end of a frame that draws a materialising, an active, a frozen and a
   defeated rival. Depth-0 passes while a leaked dash pattern corrupts every later stroke, and that is
   the specific hazard Feature F's own text names (`L380-381`: "dash state is global").

Also missing, and worth its own line: **nothing in Feature B's catch list touches
`stats.rivalsDefeated`**, even though "the honesty fix" (`L166-176`) is half the flagship. Probes S5
(a rival that tangles itself: `defeatedBefore 0 → defeatedAfter 1`) and S7 (the tail-vacate move:
`defeated: 1`) both fail the intended rule today, so the table has a measurable target and no
assertion. **MAJOR.**

## Part 5 — Bugs the plan leaves on the table

1. **`findFreeTile`'s missing occupancy checks (hazards, `extraFoods`, `food2`, `powerUpPickup`)** —
   `L3233-3245` checks distance, snake, obstacles, food and rival segments only. **MINOR (scope) — the
   strongest case for inclusion.** Feature D is *already editing this function*, the fix is ~6 lines, and the plan's own
   text calls it the weakest of three inconsistent "free tile" predicates — then leaves it. It is also
   about to get *more* visible: with Feature C the rival materialises on the power-up or hoard food
   the player was running for, with a countdown arc announcing it. "Untidy but not unfair" (`L421-424`)
   is the wrong call for a plan whose theme is fairness; if it is kept out, it belongs in the same
   sentence as the two deliberate non-fixes, with the reason.
2. **Rival immunity to obstacles and hazards** — **MINOR (scope)**; defensible as a design statement for obstacles (an
   obstacle-aware rival is the v4 trapped-rival rule and a sub-feature); for **hazards** it is weaker:
   `generateFood` (`L2140`-region) and `moveHunter` avoid rifts, the player dies in them, and Feature
   F teaches "dashed amber ring + countdown = danger here" — the rival standing unharmed in one
   undermines the vocabulary Feature C/F are built on. Record it, do not fix it (an 8-line
   `isHazardCollision` check in `updateRival`, gated on `rivalFreezeMs <= 0`, is the option to note).
3. **`gameOver()` clears `rivals` before the death frame** (`L3539`) — both ideation reports call it
   cosmetic, and the recap card names the cause, so leaving it is defensible; but the plan does not
   decide it, and its "two deliberate non-fixes" (`L456-461`) undercounts what is actually being left.
   **MINOR.**
4. **Two rivals overlapping** — **NIT (scope)**; cosmetic (they ignore each other by construction, and `findFreeTile`
   rejects the other rival's tiles at spawn, `L3243-3244`). Defensible to skip, but Feature F's
   per-rival identity work is precisely about telling the two rivals apart, so the plan should say
   whether the overlapping case is in F's acceptance.
5. **A frozen rival is still lethal** — **MAJOR**, see F-7; `checkPlayerDeath` has no freeze gate (`L7158-7181`); only the
   update loop is gated (`L7797`). This one is *not* a clean non-fix, because Feature F adds a cue for
   it: see F-7.

## Part 6 — Truth check

After v13, the advertised claims about the rival are honest in the places the plan names — the
`double_rival` gate (if F-9 is done properly), the rival HUD (three states instead of a permanent
`Rival: 20`), the defeat credit (`stats.rivalsDefeated` stops counting self-tangles), and
`RIVAL_SLAYER`/the 25/100 milestones (`L1261`, `L1286`, `L1368-1371`), which become real only once the
credit table exists *and* is asserted (see Part 4). Four rival-adjacent claims remain:

**F-7 (MAJOR) — Feature F adds a cue that says "stopped" on an object that is still lethal.** The HUD
row in `L363` appends `❄` when the rival is frozen by the hoard or `rivalFreezeMs`. The rival's
lethality is not gated by either (`L7158-7181` tests `active` only; `hoardActive`/`rivalFreezeMs`
gate the update loop at `L7797`), so during the Golden Hoard the rival is a static lethal wall that
the new cue now explicitly labels as frozen. The plan states the governing rule two pages earlier in
Feature C's failure modes (`L304-306`: "The cue says 'safe' while the rival is lethal. v12 B's exact
lesson") and then breaks it in Feature F. Either gate the collision on the freeze (making the cue
true — the hoard becomes a respite, which `test-v9.mjs:232-246` does not contradict, since it only
pins the timer), or word the cue so it does not read as inert ("❄ Rival frozen — still lethal", or
keep the proximity ring on while frozen and drop the flake).

**F-8 (MINOR) — the leech descriptor and the plan's own leech fix disagree.** `L1103` advertises
"Head-to-head vs rival steals 3 segments". The plan's fix (`L179-182`) makes a drain remove the rival
outright at any length, and the underlying mechanic is a ≤2-tile adjacency test (`L7163-7166`), not a
head-on. Neither is a lie against the player, but v13 is the cycle that claims "nothing advertised is
a lie", and the plan changes this mechanic without touching its string. Update the descriptor in the
same commit.

**F-9 (MINOR) — Feature G's `double_rival` gate is a conjunction the stated change cannot satisfy.**
`L396-403` proposes one `rivalEnabledInMode(mode)` helper "replacing the literal lists in `spawnRival`
(L3312) and the three spawn gates, plus the second-rival spawn in the Gauntlet wave path (L6336), so
the mutator *works* where it is offered and is not offered where it cannot (Zen/Walled/Painter/Snap)".
Those two clauses conflict in Gauntlet: `spawnRival`'s mode list allows gauntlet (`L3313`), the draft
pool (`pickDraftOptions`, `L6471`) has no mode filter, and the gauntlet wave path spawns only rival 0
(`L6335-6337`). The helper alone therefore either (i) keeps offering `double_rival` in Gauntlet and
still does nothing there — the lie survives — or (ii) requires a *new* per-mutator draft filter that
the plan does not specify. Pick one, name the branch, and make the step-7 gate test the branch that
was chosen. (`L3312` is also the wrong line for the mode list — the list is `L3313`.)

**F-10 (NIT) — the `Rival: N` slot and the mutator HUD.** Not a lie, but worth stating while the HUD
is being rewritten: `drawRivalHUD`'s early returns (`L6117-6122`) are what make the three-state
version non-trivial; the plan's "existing slot becomes three-state" hides a restructure of both guards.

## Probe (HEAD `e2851ac`, run once, deleted afterwards; `snake.html` untouched)

Throwaway Playwright script driving the real loop (`resetGame()` + `startGame()` + `stopGameLoop()`,
then real `updateGame()`), `seededRandom` pinned to the "continue straight" branch except where noted:

```
S1 head-on gap2 : {"state":"playing","cause":"","defeated":1,"playerSnake":[[120,100],[100,100],[80,100]],
                   "rivalActive":[false],"rivalSnake":[[]],"shield":false,"coOccupancy":[]}
S2 shield+rival : {"state":"playing","cause":"","defeated":0,"playerSnake":[[120,100],[100,100],[80,100]],
                   "rivalActive":[true],"rivalSnake":[[[140,100],[120,100]]],"shield":false,
                   "playerHead":[120,100],"coOccupancy":[[0,1]]}
S3 perpendicular: {"state":"playing","cause":"","defeated":1,"playerSnake":[[200,220],[200,200],[200,180]],
                   "rivalActive":[false],"rivalSnake":[[]],"coOccupancy":[]}
S4 growth       : {"startLength":1,"calls":19,"lengthAfter":20,"active":true}
S5 selfCredit   : {"defeatedBefore":0,"defeatedAfter":1,"active":false}
S7 tailVacate   : {"active":false,"length":0,"defeated":1}
S6 seed replay  : run1 ticks=178 run2 ticks=178 firstDiffAt=-1
```

Hoist emulation for `test-evolution.mjs:175-196` (call `updateRival(0)` first, then evaluate the leech
adjacency against the player's post-move head `(220,200)`; 200 samples):

```
test-evolution leech scenario, TODAY (one updateGame): {"tier":0,"len":11}
emulated hoist, 200 samples: leech fires = 79/200 | NaN rival heads = 46
rival head after its hoisted move: {"240,180":72,"NaN,NaN":46,"RIVAL_DEAD_AFTER_ITS_OWN_MOVE":75,
                                    "220,200":4,"240,220":3}
baseline: node test-evolution.mjs -> ALL GREEN (11/11)
```

## Approval conditions

1. **F-1**: state that the hoist moves the rival ahead of the leech/collision resolution; fix
   `test-evolution.mjs`'s hand-built rival (explicit `dx`/`dy`) and change the step-2 gate to "green
   after the two documented test setups are made explicit", not "green unedited". Correct `L203`'s
   claim that both suites drive `updateRival` directly.
2. **F-2/F-3**: replace the co-occupancy soak as primary evidence with per-contact-type outcome
   assertions, and add the shield-save position fix (mirror `L7190-7201`) so the invariant is
   achievable at all. Cite F10 as a fixed item or an explicit non-fix.
3. **F-4**: pick one head-on rule and make the matrix and the running-game text agree. Recommended:
   delete `rivalHeadOnIdx` and resolve the head-on inside `checkPlayerDeath`'s segment loop
   (`L7180-7207`, `rcj === 0`) so "mutual" happens where the post-move heads actually meet; note that
   this is a deviation from the spec's Collision Rules, or keep the spec rule and say so.
4. **F-5**: re-file the seed-replay diff (it tests determinism, not the reorder) and add the
   food-competition flip assertion; specify synchronous driving.
5. **F-6**: correct the "literal" reading (the rival starts at 1, `L3329`), decide the start length
   against the spec's 3, and separate "missing telegraph" (a feature) from the growth regression.
6. **F-7**: decide the frozen-rival semantics — gate the collision or fix the cue.
7. Part 3's cut: drop Feature E or restate it as a balance lever with the loss of menace recorded; cut
   Feature F to its information core.
8. **F-8/F-9**: update the leech descriptor with the leech fix; pick `double_rival`'s Gauntlet branch
   (draft filter or wave-path second spawn) and fix the `L3312`→`L3313` citation.
