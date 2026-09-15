# Snakes v13 — Implementation Plan Review

**Scope.** `IMPL_PLAN_v13.md` read line-by-line against `snake.html` @ `e2851ac` (9174 lines) and against
the design plan revision 2 and both design reviews. Every snippet, symbol and line cite in the plan was
checked against the file; nine throwaway Playwright probes were run against a pinned copy of the
baseline (`/tmp/v13probe/snake.html`, deleted afterwards) — no tracked file was touched. Probe output is
pasted verbatim where cited.

**Line-cite convention.** Every `snake.html:LINE` here is the **HEAD (`e2851ac`) numbering**, because the
working tree is being edited concurrently (at the time of writing `git diff --stat` on `snake.html`
already showed **113 insertions / 20 deletions**, i.e. Step 1 and part of a later step have landed
uncommitted). The plan's cites were verified against HEAD and all resolve; the implementer must re-anchor
them against the moving file.

**Severity labels.** BLOCKING = the plan cannot be implemented as written / its own gate is red on a
correct implementation; MAJOR = will ship a wrong behaviour or lose a documented feature; MINOR = local
defect with a one-line fix; NIT = wording/citation.

## Verdict

The plan is buildable and its structure is right: it is faithful to design revision 2's two
load-bearing decisions (rival moves first; **no `rivalHeadOnIdx` flag**; every contact resolved where
the post-move positions meet), it fixes the two defects the design reviews proved, and Steps 3 and 5 are
ready as written. Two things keep it from being ready:

1. **Its flagship gate B9 cannot pass** (the shield row asserts a `lastSaveEvent` the shield path never
   writes), and the same shield path keeps a **credited free kill** — the exact symptom the cycle exists
   to remove — which B9's wording hides.
2. **Step 2a's blast radius is under-analysed.** The hoist moves the rival block above two gauntlet
   `return`s, above the Pigment-Rush freeze write, and above the player's move — so the rival is no
   longer frozen behind the wave-pick screen, gets a free move at every freeze start, and the
   `advanceShrinkZone()` kill inside its eat block is now evaluated against a **one-tick-stale player
   head**. The last one is a new unfair death, reproduced below (probe P7); none of it appears in the
   plan's risk register or in the design's accepted-consequences list.

Steps 1 and 4 additionally need the fixes in findings 4, 6, 7, 10, 11 before they land.

## Probe output (verbatim; probe files deleted)

```
P1 head-on charge, both arrive on the same tile (B2) = {"today":{"state":"playing","cause":"","defeatedDelta":1,"rivalActive":false,"rivalSegs":0,"playerHead":"120,200"},"hoisted":{"state":"gameover","cause":"You were caught by the rival!","defeatedDelta":0,"rivalActive":"cleared by gameOver","rivalSegs":"-","playerHead":"100,200"}}

P2 gauntlet intermission, 3 updateGame calls = {"today":{"state":"playing","movedTiles":0,"deadRivalTimerDelta":0},"hoisted":{"state":"playing","movedTiles":3,"deadRivalTimerDelta":0}}

P4 end-of-frame drawing state (current code, active rival + hazards) = {"uniqueDepths":[0],"alphas":[1],"dashLens":[0],"transforms":["matrix(1, 0, 0, 1, 0"]}

P5 max tick interval (slowMo on, no Swift) = {"table":[{"mode":"classic","maxInterval":240},{"mode":"timeAttack","maxInterval":160},{"mode":"zen","maxInterval":300},{"mode":"daily","maxInterval":240},{"mode":"snap","maxInterval":180},{"mode":"walled","maxInterval":240},{"mode":"painter","maxInterval":160},{"mode":"gauntlet","maxInterval":240}],"max":300}

P6 dead->active under the plan 4b loop = [{"tick":50,"ms":10000,"spawnCalls":1},{"tick":85,"ms":10030,"spawnCalls":1},{"tick":100,"ms":10000,"spawnCalls":1},{"tick":120,"ms":10080,"spawnCalls":1},{"tick":240,"ms":10080,"spawnCalls":1},{"tick":300,"ms":10200,"spawnCalls":1}]

P7 rival-eat shrink kill: player moves INTO the zone on the eat tick = {"today":{"state":"playing","cause":"","shrink":"6/0","rivalHead":"220,300","playerHeadBefore":100,"playerHeadAfter":120},"hoisted":{"state":"gameover","cause":"Caught by the shrinking zone!","shrink":"6/0","rivalHead":"-","playerHeadBefore":100,"playerHeadAfter":100}}

P8 shielded head-on (hoisted), shield/lastSaveEvent evidence = {"state":"playing","shieldActive":false,"shieldBlocksDelta":1,"lastSaveEvent":"","cause":"","headX":120,"rivalHeadX":120}

P9 source scan for a shield lastSaveEvent assignment = {"hasShieldSaveEvent":false}
```

P1 = B2's "fails before" claim, confirmed. P2, P5, P6, P7, P8 are new evidence for findings 2, 3, 10.
The P2/P7/P8 "hoisted" runs emulate the relocation in-page (`updateRival(0)` first, then `updateGame()`
with its own update loop neutralised through `anyRivalActive`); no file was edited.

## Verified claims (item 1: each snippet, symbol by symbol)

| # | Question | Result |
|---|---|---|
| 1 | `updateRival` lines and eat branch at `L3393-3409`, `unshift`/`pop` at `L3404-3405`, eat `push` at `L3408` | VERIFIED at the cited lines |
| 2 | **(a)** the self test moved after the vacate preserves the old semantics minus the tail | **VERIFIED.** The post-`pop` array is still `[oldHead, b1 … b(n-2)]`, so the scan is the old scan minus exactly the tail tile; a zero/NaN-direction rival is unaffected (it still matches `oldHead`, unless the body was length 1, which is the tail-exemption fix `test-v9.mjs:236` depends on) |
| 3 | **(b)** `rTail` defined on the eat path at length 1 | **VERIFIED SAFE.** The eat branch is only reachable after `unshift`, so the body is non-empty and `pop()` returns an element; an *active* rival with an empty body is unreachable (`removeRival` empties the body and clears `active` together, `snake.html:3459-3472`) |
| 4 | **(c)** `resolveRivalRams` mutating `rivals` while iterating | **VERIFIED SAFE.** `removeRival` clears fields in place and never splices (`snake.html:3459-3472`), so no index is skipped and the loop bound is stable |
| 5 | **(d)** recursion / double-award from the reward path | **NO RECURSION. NO DOUBLE-AWARD.** `removeRival` calls nothing that re-enters it; every removal sets `active=false` in place, so the leech's `continue` and `resolveRivalRams`'s `!active` guard each skip an already-removed rival. The one real *re-attribution* is the shield path — finding 1 |
| 6 | **(e)** `addScore(50)` / `awardXP(100)` vs the v12 funnel | **VERIFIED OK.** `addScore` applies `Math.min(multi × hoard × hazardChain, 4)` and calls `updateScoreDisplay()` (`snake.html:1982-2010`); zen/painter short-circuit and carry no rivals. `awardXP` is streak-scaled and diverts to `xpOvercharge` at level ≥ 20 (`7904-7929`) — B3's "XP +100" is exact only on a clean save with `level < 20` |
| 7 | **(f)** can the 4b loop skip the wind-up or double-fire `spawnRival`? | **NO.** Max `tickInterval` is 300 ms (probe P5: zen 150 × slowMo 2; gauntlet's `wave.speedBase` peaks at 120 and is recomputed every tick at `7862-7869`), far under `RIVAL_WINDUP_MS = 1600`. Probe P6: dead→active ∈ [10000, 10200] ms with exactly one `spawnRival` per cycle at 50/85/100/120/240/300 ms |
| 8 | **(g)** wrap-aware `playerInsideRivalSpawnRadius`, and does the plan say so? | The plan says wrap-aware (L337) and never justifies it. **Harmless as written**: every mode that can spawn a rival wraps (`wrap:false` is Walled only — `snake.html:1423` — and `spawnRival` returns early for walled/zen/snap/daily/painter, `3313`). A one-line justification belongs in the plan |
| 9 | **(h)** does `drawRivalHUD` (L457-470) compile and render a decreasing countdown? | **YES.** `windup` accumulates `RIVAL_WINDUP_MS − respawnTimer` (elapsed) and the text re-subtracts to the remaining ms; `windFrac`/`windup`/`RIVAL_WINDUP_MS`/`rival_warn`/`moveCounter`/`RIVAL_MIN_SPAWN_TILES`/`RIVAL_SPAWN_LENGTH`/`snake_has_seen_rival` collide with nothing in the file (grep: zero hits before this plan) |
| 10 | `spawnFloater(x,y,text,color,size,duration)` at `L1055`, capped at 8 (`L1066`) | VERIFIED |
| 11 | `findFreeTile` callers: the plan says six in Step 5 prose (4428, 6194, 7047, 7104, 7192, 7871) and "the five" in D3 | both correct in substance — six call sites exist; D3's "five" is a miscount |
| 12 | `removeRival` call sites | **THREE** — `3400` self-hit, `3443` head-on (deleted by 2b), `7174` leech. See finding 4: 1c updates none of them |
| 13 | The hoist's moved range `L7787-7803` | WRONG: the respawn loop is 7787-7794, the update loop 7797-7801, and the guard itself is **7804** (comment 7802-7803). See finding 9 |
| 14 | 2b's deleted range `L3440-3445` | WRONG: 3440 is the `if (snake.length > 0) {` wrapper; deleting 3440-3445 leaves the wrapper's closing `}` orphaned. See finding 8 |
| 15 | B9's shield row | **CANNOT PASS.** The rival-loop shield branch (`snake.html:7182-7188`) writes `shieldActive`, `stats.shieldBlocks`, particles and a sound — **never `lastSaveEvent`**. Probe P9: no shield `lastSaveEvent` assignment exists anywhere. See finding 1 |
| 16 | F1's drawing-state assertion achievability on the current code | **ACHIEVABLE.** Probe P4: across 24 frames drawing an active rival plus an on/off hazard cycle, save/restore depth is a constant 0, `globalAlpha` a constant 1, `getLineDash()` empty, transform unchanged. The existing hazard vocabulary (`5225-5232`, `5237-5245`) already restores its own state, so following it is safe — but see finding 5 for what F1 does *not* observe |
| 17 | Step 4's `test-v9.mjs:236` interaction | **PASSES** with the plan's loop: `hoardActive` freezes it (`during === before`), then `endHoard()`→`updateGame()` decrements 100 by `tickInterval` to ≤ 0, takes the activation branch (the player is 10+ tiles away, so no deferral) and sets `respawnTimer = 0` → `after < during` holds. Step 1 additionally rescues it: today's self test would fire on the fixture's zero direction, the new post-`pop` test cannot (length-1 body) |
| 18 | Step 3's `moveCounter || 0` arithmetic on `test-v12.mjs` A14 (fixture has no `moveCounter`, length 2 → stride 1) | VERIFIED: `1 % 1 === 0` → moves on the first call, as the plan says |

## Findings

### 1. BLOCKING — B9's shield row cannot pass, and the shield path keeps a credited free kill

**Plan anchors:** `IMPL_PLAN_v13.md:250` (B9), `IMPL_PLAN_v13.md:199-236` (2d).

Two separate defects in one gate row. **(i)** B9 asserts `lastSaveEvent` "names the save" for all three
save types. The shield branch that absorbs a rival contact is
`snake.html:7182-7188` — it sets `shieldActive = false`, `powerUpTimer = 0`, `powerUpType = null`,
`stats.shieldBlocks++`, spawns particles and plays a sound, and returns `false` **without writing
`lastSaveEvent`**. Probe P9 confirms no shield `lastSaveEvent` assignment exists in the source, and probe
P8's hoisted run shows the shield absorbing a rival head-on (`shieldBlocksDelta: 1`, `shieldActive:
false`) with `lastSaveEvent: ""`. B9 as written is red on a correct implementation, so the implementer
will either delete the clause or add a `lastSaveEvent` write to game code — exactly the scope creep the
plan forbids.

**(ii)** The clause is also the only thing standing where the rival's fate should be. Because the shield
branch does not relocate the head, the player ends the tick **on the rival's head tile**; the plan's
`resolveRivalRams` (rule 2 as written: `rivalHead ∈ snake`) then fires and calls
`removeRival(ri, true)` → defeat +1, +50 score, +100 XP. Probe P8 (hoisted, shield absorbing):
`{"state":"playing","shieldActive":false,"shieldBlocksDelta":1,"lastSaveEvent":"","headX":120,"rivalHeadX":120}`
— the rule-2 predicate is true on a *save* path. Today the identical geometry also ends with the rival
dead and credited (probe P1's `today` row shows the same outcome through `updateRival`'s head-on branch),
so this is **not a new bug** — but the plan's claim that Step 2 "removes the free kill" is false for the
shield case, the RIVAL_SLAYER/milestone inflation the cycle exists to stop survives on that path, and
the new comment in 2d ("reaching here proves the heads are not on the same tile") is false as written.
B10's worth is unaffected (it runs `shieldActive = false`).

Required change: assert `playing` + `stats.shieldBlocks` delta 1 + `lastDeathCause !== 'You were caught
by the rival!'` + **the rival still `active` with `stats.rivalsDefeated` delta 0** for the shield row
(drop `lastSaveEvent` there, or use the phoenix/streak rows for it), and make `resolveRivalRams` skip
the player's head segment so a save is never scored as a body-ram:

```js
for (var si = 1; si < snake.length; si++) {   // si = 1: the head tile is rule 1's business
```

### 2. MAJOR — the hoist makes the rival-eat shrink kill read a one-tick-stale player head

**Plan anchor:** `IMPL_PLAN_v13.md:147-163` (2a).

`advanceShrinkZone()` tests the player's head (`snake.html:2744`) and is called from `updateRival`'s eat
block (`snake.html:3442-3447`). Today the rival block runs at the tick tail (`7797-7801`), so that read
is the **post-move** head; after the hoist the block sits above the direction consume and `snake.pop()`
(`7005-7014`), so the same lethal test now reads the **pre-move** head and the player then moves. The
plan's 2a text claims contacts are resolved "where the post-move positions actually meet"; this one
moves the other way, and neither the plan's risk register nor the design's accepted-consequences list
mentions it.

Probe P7 (player at x=100 moving to x=120 into a zone whose edge becomes x=120 this tick; the rival eats
on the same tick, Pressure Cooker live):

```
today   {"state":"playing","shrink":"6/0","rivalHead":"220,300","playerHeadAfter":120}
hoisted {"state":"gameover","cause":"Caught by the shrinking zone!","shrink":"6/0","playerHeadAfter":100}
```

The player is inside the zone at the tick tail and still dies, because the check used the tile they had
already left; the reverse case (a player stepping *out* of the zone on the eat tick) silently survives a rival eat. Note the other
two `advanceShrinkZone` callers (hunger `rapidDoom`, the `shrink_zone` timer at `6964-6972`) already run
before the player's move, so the hoist makes the rival path *consistent* with them — which is defensible
only if it is stated.

Required change: add it to the plan's accepted-consequences list, and if post-move semantics are wanted,
evaluate the `resonanceActive('rivalShrink')` kill in the player's phase (after the move commit at
`7233`, beside `resolveRivalRams`) instead of inside `updateRival`.

### 3. MAJOR — the hoist puts the rival block above the gauntlet intermission, the wave returns, and the freeze write

**Plan anchors:** `IMPL_PLAN_v13.md:147-163` (2a), `IMPL_PLAN_v13.md:533-543` (risk register).

The hoisted position is `6816`, immediately after the `rivalFreezeMs` decay. Everything below it now runs
*after* the rival moves, including three things that used to run before it:

- `if (gauntletIntermission) return;` (`6871`) and the four wave-objective `return`s (`6873-6885`).
  Probe P2 (gauntlet, `gauntletIntermission = true`, three `updateGame()` calls):

  ```
  today   {"state":"playing","movedTiles":0}
  hoisted {"state":"playing","movedTiles":3}
  ```

  The rival is no longer frozen behind the wave-pick screen: it advances, competes for food, and — with
  the Pressure Cooker resonance live — can call `gameOver()` from behind the intermission overlay. The
  same relocation lets it move on the tick a wave objective completes.
- `rivalFreezeMs = 3000` in the Pigment-Rush climax (`7642`). The hoisted block runs first, so the rival
  now gets one move on every freeze-start tick, where today the write precedes the tail check
  `rivalFreezeMs <= 0` and blocks it. (Its respawn table likewise keeps ticking during intermissions.)

Neither is in the plan's risk register — whose mitigation column narrows the hoist risk to the
food-order flip and the two fixtures — nor in the design plan's accepted-consequences list.

Required change: add both to the accepted list, or gate the hoisted block with `!gauntletIntermission`
and evaluate the freeze start before the block; either way state which, because "the rival is frozen
during the intermission / during the freeze" is a promise Feature C's telegraph also leans on
("the wind-up **pauses** during a freeze while staying drawn").

### 4. MAJOR — Step 1c strands the credit path for both of its unchanged call sites

**Plan anchors:** `IMPL_PLAN_v13.md:94-130` (1c), `IMPL_PLAN_v13.md:527-531` (rollback).

`removeRival` has exactly three call sites (`snake.html:3400`, `3443`, `7174`). Step 1c turns
`stats.rivalsDefeated++` **and** the new `addScore(50)` / `awardXP(100)` / floater / toast behind
`wasActive && defeatedByPlayer`, but Step 1 updates none of those call sites: only Step 2c's leech edit
passes `true`, and 2b deletes the head-on site. Between Step 1 and Step 2 every rival kill is therefore
reward- and credit-free — including the leech kill the design's credit table pins to `true` — and
`removeRival`'s own comment (`snake.html:3469-3472`) records that this increment is the *only* site for
RIVAL_SLAYER, `meta_rival_slayer` and the 25/100 rival milestones. The plan's rollback ("keep the hoist
and revert only 2b-2d", `529-531`) makes it permanent, and no Step 1 gate can notice: A4 asserts a delta
of **zero** for the self-crash and nothing asserts a nonzero delta anywhere in Step 1.

Required change: make the signature change atomic with its call sites — land the leech edit
(`removeRival(rci, true)`) inside Step 1 with 1c, and delete the head-on call site in the same commit
(i.e. move 2b's deletion into Step 1, or make 1c's call-site updates explicit in its own step).

### 5. MAJOR — F1 cannot observe the failure mode it is filed under, and F3 names no mechanism

**Plan anchors:** `IMPL_PLAN_v13.md:481-489` (F1-F5), `IMPL_PLAN_v13.md:424-455` (Step 6).

F1 asserts save/restore depth 0, an empty dash, `globalAlpha === 1` and an unchanged transform at the end
of a frame that *stages* materialising / active / proximate / defeated rivals. Probe P4 shows the current
code already satisfies all of it, and — the point — a frame in which the telegraph branch **never
executes** satisfies it identically (depth 0, dash empty, alpha 1). So the plan's own Step 4/6 failure
mode "a materialising rival is invisible" *(drawRival returns early on `!r.active`, `snake.html:5850`)*,
which the design plan required be "asserted to emit draw calls", is covered in the impl plan by… nothing
but the F5 screenshot. F3 ("`drawRivalHUD` renders each of the three strings") is the right idea but
names no mechanism; the only automatable one is wrapping `ctx.fillText`.

Required change: wrap `ctx.fillRect` / `ctx.arc` / `ctx.fillText`, and assert ≥ 1 body fill and ≥ 2 arcs
(dashed ring + countdown) for the materialising state, 0 of each for a dead rival, and the three HUD
strings captured from `fillText` — keep F1's depth/dash/alpha/transform assertion as the second half.

### 6. MINOR — the telegraph ghost body is drawn with no `fillStyle`

**Plan anchor:** `IMPL_PLAN_v13.md:428-450` (the `drawRival` telegraph branch).

The snippet sets `globalAlpha`, loops `ctx.fillRect(r.snake[rw].x + 1, …)` and never assigns a fill
colour. The original body loop it replaces does (`snake.html:5853`: `ctx.fillStyle = rj === 0 ? '#FF6666'
: r.color;`), so the telegraph is painted in whatever colour the previous draw call left in the context —
it changes frame to frame with the HUD, food and effect passes. Design plan Feature F pins the ghost to
the rival's colour.

Required change: `ctx.fillStyle = r.color;` before the ghost body loop.

### 7. MINOR — `rival_warn` plays at activation, not at wind-up start

**Plan anchor:** `IMPL_PLAN_v13.md:312-343` (4b), contradicting `IMPL_PLAN_v13.md:344-348` and 6.6.

4b's activation branch plays `playSound('rival_warn')` and `srSpeak('Rival incoming.')`, while the same
section's prose says the positional line is emitted "once when the wind-up *starts* (inside `spawnRival`),
not at activation", and design revision 2 (Feature F) pins the sound to wind-up start. A warning tone at
the instant the rival becomes lethal is not a warning — the audible cue arrives 1600 ms late, when the
player has already had to react.

Required change: move `playSound('rival_warn')` into `spawnRival` beside the positional `srSpeak`, and
keep the activation branch to the solidification cue (particles) only.

### 8. MINOR — 2b's literal delete range unbalances the function

**Plan anchor:** `IMPL_PLAN_v13.md:165-169`.

At HEAD the region is

```
3440            if (snake.length > 0) {
3441                var playerHead = snake[0];
3442                if (playerHead.x === newHead.x && playerHead.y === newHead.y) {
3443                    removeRival(idx);
3444                    return;
3445                }
3446            }
3447        }
```

so deleting exactly `L3440-3445` as written removes the wrapper's opening brace and leaves 3446's `}` to
close `updateRival`, with 3447's `}` left over → `SyntaxError`. The quoted code in the same sentence is
3441-3445.

Required change: delete `L3440-3446`.

### 9. MINOR — 2a's moved range omits the guard it claims to move

**Plan anchor:** `IMPL_PLAN_v13.md:147-153`.

"Move **L7787-7803** (the respawn-timer loop, the `updateRival` loop, and the `if (gameState !==
'playing') return;` guard)" — the guard is at **7804**; 7803 is its comment's last line. Moving the stated
range hoists the block *without* the guard and leaves `if (gameState !== 'playing') return;` at the old
tick-tail position, where it cannot stop the mid-tick effects the design says the guard must stop.

Required change: move `L7781-7804` (the explanatory comment rides along) or `L7787-7804`.

### 10. MINOR — the 3-segment spawn body is not filtered like the head tile

**Plan anchors:** `IMPL_PLAN_v13.md:73-92` (1b), `IMPL_PLAN_v13.md:420` (D5).

Step 1b's backward scan rejects only `snake` and `obstacles`, while Step 5 spends the whole option set and
D5's rationale ("a rival never materialises on the hoard food … or inside an on-phase hazard the player
is running for") is implemented only for the head tile through `avoidExtras`. Result: a rival can spawn
with its tail segments over the hoard food, a portal twin or an on-phase rift, and the telegraph ghost
then draws on top of it — precisely the confusion D5 was added to remove. D5 as written ("a rival never
materialises on an `extraFoods` tile") is false for the body unless the assertion is narrowed to the head.

Required change: run the same rejection set for `seg` (at minimum `extraFoods` / `food2` /
`powerUpPickup` / on-phase hazards, matching `avoidExtras`), or restate D5 as "the head tile".

### 11. MINOR — the rollback claims are wrong in two of three places

**Plan anchor:** `IMPL_PLAN_v13.md:527-531`.

- Step 2: "keep the hoist and revert only 2b-2d … restores today's exact behaviour" — false. Restoring
  2b re-creates `updateRival`'s head-on test against `snake[0]` **at the hoisted position**, which is the
  player's pre-move head, i.e. the exact new kill class design review 1 measured (a rival stepping onto
  the tile the player vacates is destroyed and credited). The restorable fallback is reverting 2a, not
  2b-2d; if Step 1's signature has landed, 2d cannot be reverted alone either (finding 4).
- Step 4: "reverts by removing the wind-up branch" — the guard (`active || snake.length > 0`) and the
  two-stage loop are a single edit region; reverting only `spawnRival` leaves the pre-empt branch firing
  at `respawnTimer <= RIVAL_WINDUP_MS`, so rivals respawn ~1600 ms early. Reverting Step 4 means
  restoring the one-stage loop (`snake.html:7788-7793`) as well.

### 12. NIT — citation drift

`IMPL_PLAN_v13.md:154` — the stale comment is `snake.html:3428-3431`, not 3429-3431.
`IMPL_PLAN_v13.md:428` — `drawRival`'s head colour is `snake.html:5853`, not 5852.
`IMPL_PLAN_v13.md:418` — D3 says "the five save/obstacle callers"; six exist (Step 5's own prose lists
all six).
`IMPL_PLAN_v13.md:27` — 1a's "L3404-3405" and "L3407-3409" are correct; its "self test (L3393-3402)" is
correct. No other drift found in Steps 1-3.

### 13. NIT — the activation deferral is unbounded, and its countdown stalls at 0.0 s

**Plan anchors:** `IMPL_PLAN_v13.md:312-341` (4b), `IMPL_PLAN_v13.md:457-470` (6.4).

`playerInsideRivalSpawnRadius` re-defers by one `tickInterval` each time the player's head is inside a
5-tile radius with no cap. A player who simply stands near a telegraph tile — or camps on it, which the
deferral makes safe (probe-independent: the activation branch runs before the player's move, so the
radius check can never be undershot by a move into the tile) — disarms that rival indefinitely, and the
HUD (whose arithmetic is otherwise correct, see claim 9) reads a frozen `Rival in 0.0s`. Feature C's
purpose is "the rival announces itself and then becomes dangerous"; a permanent deferral is neither.

Required change: cap the deferral (e.g. force activation after N refusals, or re-pick the telegraph tile
with `findFreeTile`), and say what the HUD shows while deferred.

### 14. NIT — gate wording that cannot be written as stated

- A1 (`IMPL_PLAN_v13.md:135`: "stays **1** at spawn length 1 / stays at its spawn length") contradicts
  Step 1b's spawn length 3. Since A1-A4 hand-build the rival, state the fixture's length explicitly
  (`RIVAL_SPAWN_LENGTH`, 3) and assert `length === 3 && length < RIVAL_MAX_LENGTH`.
- C1 (`353`) measures dead→active while C3 (`355`) makes the same interval unbounded; C1 must state the
  fixture (player ≥ 5 tiles from the telegraph), otherwise the two gates disagree.
- G2 (`511`: "measured self-crash rate drops") is statistical; the deterministic form is a rival whose
  food-axis candidate is its own segment, asserting the chosen direction is not that candidate.
- B3 (`244`: "XP **+100**") is exact only with a zero streak count and `level < 20`; assert the
  `xp + xpOvercharge` sum.

## Acceptance-gate audit (item 4)

Can it fail on the pre-change code where the plan claims it does, and does it observe what it names?

| Gate | Fails before as claimed? | Observes what it names? |
|---|---|---|
| A1-A7 | ✓ (probe-free traces: A2 +2/duplicate cells, A3 no tail exemption, A4 credited +1) | A1's wording, see NIT 14; otherwise yes |
| B1, B3, B6, B7, B8, B11, B13 | ✓ | yes (B2 verified by probe P1) |
| B4, B5 | Not against today's code — they are forward guards against a wrong hoist, which the plan half-admits for B10 | yes, and they can fail |
| **B9** | n/a (regression guard) | **NO — the shield row is red forever on a correct implementation and blind to the rival's fate (finding 1)** |
| B10 | Self-qualified; with `shieldActive = false` it is a forward guard | yes |
| B12 | Re-filed correctly (the same-seed diff is green by construction for the order flip; the food-flip clause is the discriminating half) | yes |
| C1-C8 | ✓ (C2-C7 are discriminating; C8 verified) | C1's fixture, see NIT 14 |
| D1-D4 | ✓ (`findFreeTile` returns `null` after 50 attempts, so D1 correctly counts *placed* spawns) | yes |
| **D5** | ✓ today (a rival can spawn on extras) | **NO for the body — only the head tile is filtered (finding 10)** |
| E1-E5 | ✓ (E4's arithmetic verified) | yes |
| **F1** | n/a | **NO for invisibility — depth 0 is also what a never-executed branch produces (finding 5)** |
| F2, F4 | ✓ (`rival_warn` does not exist yet; the colour collision is real) | yes |
| **F3** | n/a | Right idea, no mechanism named; F5's screenshot is otherwise the only proof |
| **G2** | ✓ statistically | **NO — "rate drops" is not a deterministic assertion (NIT 14)** |
| G1, G3, G4, G5 | ✓ (G3 is satisfiable through the design's chosen branch) | yes |

**The three assertions the plan is missing** (in priority order):

1. **A save that absorbs a rival contact is never scored as a ram.** Nothing asserts the rival's fate on
   a save path (B9 asserts only the player's). Assert, for each save type: `stats.shieldBlocks` (or the
   brew flag) consumed, `playing`, `stats.rivalsDefeated` delta 0, the rival still `active` — the shield
   row then fails today, which is the point (finding 1).
2. **The reward fires exactly once per removal.** The plan's own invariant list says "the reward path
   never double-fires"; no gate tests it. With `double_rival`, stage one rival removed by the leech drain
   and the other ramming the player in the same tick and assert exactly two increments of
   `stats.rivalsDefeated` and exactly +100 score / +200 XP — the only shape that can catch an
   index-shifted credit, which is also why `removeRival`'s non-splicing property (claim 4) should be
   pinned.
3. **The telegraph actually draws.** Count `fillRect`/`arc` calls in the materialising state (finding 5);
   without it Feature C's only automated evidence is a screenshot of a 20×20 px ghost.

## Design-plan cross-check (item 6)

Honoured: the reward numbers (+50 score / +100 XP / floater / `⚔️ Rival defeated!` toast / `powerdown`);
`RIVAL_SPAWN_LENGTH = 3` (the spec's Feature 1 spawn, correcting the ad-hoc 1); deletion of the
`rivalHeadOnIdx` flag; `respawnTimer = 0` on activation; the 5-tile deferral radius; the three E
thresholds (≤6→1, 7-13→2, ≥14→3); the `moveCounter` snapshot-additive decision with no
`SNAPSHOT_VERSION` bump; the `drawRivalHUD` guard changes and the deliberate absence of a `❄` frozen
state; the `double_rival` "works where it is offered" branch including `startNextWave`; the deliberate
non-fixes list (which the plan honours by not writing code for them).

Dropped or contradicted:

- **The accepted-consequences list is gone.** Design revision 2 (Feature B, "[R1+R2] The hoist's accepted
  consequences, stated rather than discovered") enumerates the new skipped set and the one-tick-earlier
  `checkAchievements`/`checkQuestProgress` unlock. The impl plan's risk register (`533-543`) keeps only
  the food-order flip. Findings 2 and 3 are the two consequences that list still misses even after being
  restored — which is the argument for writing it down rather than inheriting it.
- **AGENTS.md's required content.** The design pins "the shield pass-through and the three deliberate
  non-fixes" to AGENTS.md; Step 7.4 (`503`) says only "rewrite AGENTS.md's stale
  `rivalActive`/`rivalSnake`/`rivalLength` section and add the v13 section". The pass-through is the only
  place the B9/finding-1 behaviour is documented; name it explicitly.
- **The `leech` descriptor update moved into the droppable tail.** Design revision 2 requires the
  descriptor (L1103, "Head-to-head with rival → steal 3 segments") be updated *in the same commit* as B5,
  because B5 changes what the drain does (it now resolves the contact). The impl plan puts it in Step 7,
  which the design plan itself calls the drop-if-time-boxed tail — leaving the lie advertised by the very
  cycle whose theme is "nothing advertised is a lie".
- **`rival_warn` timing** — contradicted (finding 7).

## Per-step verdicts

| Step | Verdict | Exact change required |
|---|---|---|
| 1 — Feature A | **implement with changes** | Land 1c together with its call sites (finding 4); filter the 3-segment body or narrow D5 (finding 10); reword A1 (NIT 14). The movement semantics themselves are verified correct (claims 2, 3, 4, 6) |
| 2 — Feature B | **implement with changes** | Rewrite B9's shield row and skip the head segment in `resolveRivalRams` (finding 1); add the shrink-kill staleness to the accepted list (finding 2); add the intermission/freeze-start consequences (finding 3); fix the two moved/deleted ranges (findings 8, 9); restate the rollback (finding 11) |
| 3 — Feature E | **ready to implement** | None. Thresholds, counter arithmetic, snapshot shape and A14/E4 all verify |
| 4 — Feature C | **implement with changes** | Move `rival_warn` to wind-up start (finding 7); cap the deferral and define the deferred HUD state (NIT 13); state C1's fixture (NIT 14). The `test-v9` fixture and the 4b loop arithmetic are verified (claims 7, 17) |
| 5 — Feature D | **ready to implement** | Only the D5 body scope (finding 10) and D3's "five"/six miscount (NIT 12); the legacy-boolean compatibility and the untouched callers verify |
| 6 — Feature F | **implement with changes** | Add `ctx.fillStyle` in the telegraph branch (finding 6); replace F1 with a draw-call count (finding 5); name the F3 mechanism |
| 7 — Feature G | **ready to implement** | Pull the two truth-repair items the design pinned to Feature B (the `leech` descriptor, the AGENTS.md pass-through entry) forward, or move Step 7 out of "droppable" |

## The five changes that most reduce the chance of shipping something broken

1. **Make 1c atomic with its call sites** (`removeRival(rci, true)` for the leech; delete the head-on
   branch in the same commit). Otherwise every rival kill silently stops counting — the exact
   structurally-unachievable-milestone defect `removeRival`'s comment warns about — and the plan's own
   rollback path makes it permanent.
2. **Fix the shield row: assert `stats.shieldBlocks` + a surviving, uncredited rival (not
   `lastSaveEvent`), and skip the head segment in `resolveRivalRams`.** Today's probe P1/P8 geometry is
   JC's reported bug with a shield: charge head-on, survive, get a credited kill.
3. **Add the two hoist consequences the plan never names and gate them**: the rival must not move during
   a gauntlet intermission (probe P2), and the rival-eat shrink kill must be evaluated against the
   post-move head or its pre-move semantics accepted in writing (probe P7 — an unfair death).
4. **Count the telegraph's draw calls** (plus F1's depth/dash/alpha/transform assertion) — otherwise
   Feature C, the issue's literal request, ships verified only by a screenshot.
5. **Re-anchor the two load-bearing ranges** (2b: `3440-3446`; 2a: `7787-7804`) and reconcile the three
   statements the plan's own text contradicts (A1's "stays 1", Step 3's "the first call then moves",
   Step 4's revert).
