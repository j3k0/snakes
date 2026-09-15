# v13 RIVAL FAIRNESS — EVIDENCE-BACKED IDEATION (bug hunt + F1 repro)

All claims are `snake.html:LINE` or a measured probe result. Probes were run with the Playwright harness (`test-helpers.mjs`), drove real `updateGame()` ticks, then were deleted. No tracked file was modified.

## 0. HEADLINE

The rival is not one bug, it is a **v5-refactor regression cluster**. `git log -S` pinpoints commit `6c8857b` ("feat: v5 …") as the moment three load-bearing lines changed:

| v4 code (`2608064:snake.html`) | v5+ code (`snake.html` today) |
|---|---|
| `const rTail = rivalSnake.pop();` **then** `unshift(rNewHead)` — a real 1-tile/tick MOVE; on eating, `push(rTail)` to GROW | `r.snake.unshift(newHead); if (r.snake.length > RIVAL_MAX_LENGTH) r.snake.pop();` (`snake.html:3404-3405`) — **the tail is only popped past length 20, so every rival grows +1/tick from len 1 to len 20** |
| `const playerBodyHit = snake.some(s => s === rNewHead); if (playerBodyHit) { awardXP(100); addScore(50); … removeRival(); }` — rival dies when it rams the player's body | **deleted.** No player-body check exists anywhere in `updateRival` |
| AI look-ahead: `selfCollision || obsCollision` → re-route; if no direction is free → `removeRival()` (a trapped rival died) | Simple food-axis chase only (`snake.html:3342-3379`); no obstacle/body awareness |

Consequence: today's rival is a **20-tile wall that phases through the player's body, through obstacles and through hazards, and commits suicide against your head** — the exact inverse of the intended "AI nemesis".

---

## 1. F1 REPRODUCTION (measured, not the issue's table)

Probe method: `startGame({mode:'classic', clean:true})`, then per scenario an in-page setup (`stopGameLoop()`, clear obstacles/hazards/food/extraFoods, `food = null`, `stats.rivalsDefeated = 0`, `activeBrews/activeMutators = []`, `shieldActive = false`), **`window.seededRandom = () => 0.75`** so `updateRival`'s AI takes the documented "continue straight" branch (`snake.html:3352-3353`) and the rival holds the direction the scenario sets, then real ticks. Cell coords are tiles (x20 = px).

RAW OUTPUT (probe #1):
```
=== S1 head-on, gap 2 tiles, rival moves INTO the player ===
  t1 state=playing player=[11,10 10,10 9,10 8,10] pHead=11,10
       rival=[DEAD] rHead=null active=false defeated=1 cause="" shield=false
=== S1b (same config) (via harness driveTicks) ===
  after 3 real ticks: state=playing cause=""
    player len=4 head=13,10 body=[13,10 12,10 11,10 10,10]
    rivalActive=false (rivals cleared by gameOver: count=1) defeated=1
=== S2 head-on, gap 1 tile (player head enters rival head tile) ===
  t1 state=gameover player=[10,10 9,10 8,10 7,10] pHead=10,10
       rival=[DEAD] rHead=null active=null defeated=0 cause="You were caught by the rival!"
=== S3 rival RAMS a perpendicular-moving player head (player not charging) ===
  setup: player head 10,10 dir 0,1 len 4 | rival head 9,11 dir 1,0 len 1
  t1 state=playing player=[10,11 10,10 10,9 10,8] pHead=10,11
       rival=[DEAD] rHead=null active=false defeated=1 cause=""
=== S4 player chases a fleeing rival from 2 tiles (both +x) ===
  t1 state=playing player=[7,10 6,10 5,10] rival=[11,10 10,10 9,10 8,10] active=true defeated=0
  t2 state=gameover player=[7,10 6,10 5,10] rival=[DEAD] defeated=0 cause="You were caught by the rival!"
```

| # | Scenario | Result (measured) | Seed-claim verdict |
|---|---|---|---|
| S1 | head-on, gap 2, rival moves into player | player survives (`state=playing`), rival `active=false`, **`defeated=1`**, no score/XP | **CONFIRMED** |
| S2 | head-on, gap 1 (player enters rival's tile) | `state=gameover`, `cause='You were caught by the rival!'`, `defeated=0` | **CONFIRMED** |
| S3 | rival rams perpendicular player head; player not charging | player untouched, rival destroyed, `defeated=1` | NEW (same root cause as S1, cleaner) |
| S4 | player chases a fleeing rival from 2 tiles | `gameover` at t2, `defeated=0` | NEW — see §3 F5; **the "1 tile/tick" premise is wrong** |

**Also confirmed by probe #3:** a head-on ram is worth `score=0 xp=0 defeated=1` — the v4 reward (+50 pts, +100 XP, `2608064`) was lost in the same refactor.

Exact mechanism (`snake.html:3440-3446`): `updateRival` runs at `7797-7801`, i.e. **~590 lines after** `checkPlayerDeath(wrappedHead, …)` is called at `7214`. So the player's collision test at `7157-7205` compares the player's NEW head against the rival's **pre-move** body, and the rival's own move is then resolved only against the player's head (`3442`), never against the player's body. Two inversions follow:
1. Player moves into a tile the rival will occupy → rival dies, player credited (`defeated++` at `3463`). **Ramming is strictly safe and rewarding.**
2. Player moves into a tile the rival just left (the frame the rival is drawn off it) → player dies.

---

## 2. SEED FINDINGS: CONFIRMED vs REFUTED

**CONFIRMED** — F1 free-kill inversion; `checkPlayerDeath` uses pre-move rival segments; `removeRival` is the only `stats.rivalsDefeated` site and is reached from self-collision, leech drain and head-on; the rival is enabled only in classic/timeAttack/gauntlet + `double_rival`; `spawnRival` has no telegraph and `r.active = true` is immediately lethal; `findFreeTile` uses RAW Manhattan.

**REFUTED / MATERIALITY CORRECTED**
- **"The rival is 1 tile/tick, the same cadence as the player"** — only the HEAD is 1 tile/tick. **The rival's tail never moves until length 20** (`3404-3405`), so its body does not translate at all for the first 19 ticks. Measured (probe #2, PART 10): `t1 len=2 head=11,15 tail=10,15` … `t19 len=20 head=9,15 tail=10,15`.
- **F2's premise ("the player accelerates with score, so the rival is relatively harmless later")** — REFUTED. Measured (probe #1, PART 7): at `score=0`, `score=1000`, `slowMo=true` and `speedBoostCounter=1`, "player 10 tiles/10 ticks, rival 10 tiles/10 ticks". Both are exactly 1 tile/tick at every speed; `tickInterval` (120→50ms, `snake.html:1953`) scales both identically. The player never outruns the rival, early or late. See §5.
- **F4's "3 tiles" separation** is worse than stated: the spawn tick also MOVES the rival (`7787-7793` spawn, `7797-7801` move, same tick) and the growth bug adds a second segment. Measured (probe #2, PART 14): `findFreeTile returned tile 15,15; after that SAME tick: rival body = [16,15 15,15] (len 2)`. The rival is never rendered at its spawn tile; effective first-frame separation is 2 tiles with a 2-tile body.
- Line-number corrections: `findFreeTile` is `3232` (raw filter `3239`), `checkPlayerDeath` call is `7214` (not 7224), `RIVAL_MAX_LENGTH` `1218` ✔.

---

## 3. OTHER GENUINE RIVAL BUGS (ranked by severity)

### F5 — CRITICAL: the rival grows +1 segment/tick to 20 (movement regression)
`snake.html:3404-3405`. `unshift` + conditional `pop` ⇒ the tail is frozen while the head advances. Measured: 1 → 20 in 19 ticks (~2.3 s at 120 ms, **~0.95 s at 50 ms**). At `t20` the probe rival self-destructed: it had wrapped its full 20-tile row, so its next head tile was its own tail.
- Every “1 tile/tick” fairness analysis of the rival is invalid while this stands.
- Lethal area per tick is ~7× the intended 3-segment rival within 2 seconds of spawn; S4's chase death at t2 is a direct consequence (the rival's tail never got out of the way).
- Git-proven fix: 1 line — pop the tail every tick, and restore the eat-grow (`push`) path. This is the single highest-value v13 change.

### F6 — HIGH: a rival's self-collision is credited to the player
`removeRival` increments `stats.rivalsDefeated` for **any** removal of an active rival (`3463`); the self-hit path at `3399-3401` routes through it. Measured (probe #2, PART 13): rival head (10,10) steers into its OWN segment (10,11) → `active=false respawnTimer=10000`, `stats.rivalsDefeated 0 -> 1` with the player never touching it.
Fix interaction: F5 makes the body 20 long, so self-hits are far more common → F6 currently mints `RIVAL_SLAYER` (5, `1261`), `meta_rival_slayer` (`1286`) and the 25/100 milestones (`1368`) partly for free. Fix F5 and F6 together; they compound.

### F7 — HIGH: the rival can never kill you by moving; the player's body is a ghost to it
No code path outside `checkPlayerDeath` writes `'You were caught by the rival!'` (`7203` is the only site), and the only check there is the player's head vs the rival's pre-move body. Measured (probe #2, PART 12): a rival headed down column 10 lands on `(10,10)` at t2 while the player's body is `[12,10 11,10 10,10 9,10 8,10]` — the rival head IS a player body tile, `defeated=0`, nothing happens; it keeps crossing at t3/t4. v4 killed the rival on this (and paid +50/+100).

### F8 — MEDIUM: the rival ignores obstacles and hazards
`updateRival` never reads `obstacles`/`hazards`. Measured (probe #2, PART 16): a solid obstacle column at x=11, rows 8-12 — the rival walks `9,10 → 10,10 → 11,10 → 12,10` straight through it. Probe #3: the rival sits at distance **0** from an ON-phase hazard centre (radius 40, lethal to the player) and is unharmed. Player-visible consequence: the rival materialises out of walls/lava, so its path is not predictable from the arena state.

### F9 — MEDIUM: no spawn grace + spawn lands in the player's path
`spawnRival` sets `active = true` with no invulnerability window and no telegraph (`3328-3331`). Measured (probe #2, PART 15): rival spawned exactly 3 tiles ahead on the player's line — t1 `[14,10 13,10]`, t2 `[15,10 14,10 13,10]`, t3 `state=gameover` on the rival's tail tile (the tile `findFreeTile` picked). Reaction budget: 3 ticks = **360 ms at score 0, 150 ms at score 1000**. With the seam bug (§6) it can be 120 ms.

### F10 — MEDIUM: the shield save leaves the player's head inside the rival
`snake.html:7182-7189` consumes the shield and `return false` — the move then proceeds onto the rival segment (unlike Phoenix/streak charge, which set `teleportSavePos`, `7190-7201` / `7042-7060`). Measured (probe #2, PART 17): t2 `shield=false player=[10,10 9,10 8,10] rival=[14,10 13,10 12,10 11,10 10,10]` — the player head sits ON a rival segment; t3 `gameover`. The “save” buys exactly one tick and all but forces a turn.

### F11 — LOW/MEDIUM: `gameOver()` deletes the rival before the death frame
`rivals = []` at `3539`. Measured in every probe scenario that died for a rival reason: `rivalCount=0`, `rivalActive=null` after death. The player dies looking at an empty tile.

### F12 — LOW: two rivals can occupy the same tile
No rival-vs-rival check. Measured (probe #1, PART 9): two `double_rival` rivals seeded on identical tiles stayed identical (`rival0=[12,10 11,10 10,10 9,10] rival1=` same) and mutually pass through. Visual/legibility only (no lethality interaction).

### F13 — LOW: dead state + stale docs
- `prevRivalSnake` (`427`) is written every tick (`6973`, an allocation via `rivalCombinedSnake().map()`) and **read nowhere** → the rival has no render interpolation and the write is pure garbage.
- `advanceShrinkZone`'s comment (`2731-2732`) says the rival-eat call site “is NOT wired yet”, but it IS wired at `3430-3435` (v12 A).
- `AGENTS.md:76` (the `generateFood` two-source `rivalLength` note) is stale — the guard is now `currentSnake.length + obstacles.length + extraFoods.length` (`2094`).
- `drawRival` (`5847`) draws nothing for an inactive/spawning rival: no spawn cue, and the only HUD cue is the length readout (`6116`), which after F5 reads “Rival: 20” two seconds after spawn.

---

## 4. DESIGN SPACE FOR F1 (each option × the six axes)

Implementation constraint that dominates everything: `checkPlayerDeath` (`7061`) and `tryStreakChargeSave` (`7042`) are **closures declared inside `updateGame`**, over `teleportSavePos`/`wrappedHead`. `updateRival`/`removeRival` are top-level and **cannot call the save chain**. Any option that lets the rival's move kill the player must therefore either (a) defer the kill to the player's own collision phase inside `updateGame`, or (b) extract the whole rival-collision + save chain to module scope. Duplicating the chain inside `updateRival` is a non-starter (the chain is the load-bearing v11/v12 order `shield → phoenix → streak → death`, `AGENTS.md`).

**(a) Hoist `updateRival` above the player's collision test.** Cheapest real fix: relocate the block at `7797-7801` to just before the player's move (`~7011`), keeping it inside `updateGame`. The player's `wrappedHead` check then sees the rival's **post-move** body.
- (i) death-save chain: untouched (still one copy, same order inside the rival branch `7157-7205`). Must ADD the existing tail guard `if (gameState !== 'playing') return;` (`7803`) immediately after the relocated call — the moved rival can still kill via `advanceShrinkZone` + `gameOver()` (`3430-3435`).
- (ii) leech: `7161-7180` would compare post-move heads → geometrically correct head-to-head, and the drain would target the post-move body. Behavior change: the adjacency window is now evaluated after the rival has closed 1 tile.
- (iii) legit defeat paths: self-collision and leech drain unchanged; the head-on branch as written still awards a free kill (it now fires before the player moves, i.e. it becomes “the rival stepped onto my head” — semantically the ram). Fixing the inversion still needs a decision.
- (iv) `rivalsDefeated`: unchanged mechanically, but the “ram” circumstance becomes far more visible/legible.
- (v) determinism/snapshot: order is what it is — deterministic. But every seeded/recorded run's *outcome* changes, and the rival's move now precedes the player's food eat (food competition order flips: the rival may win a food tile the player would have eaten). No snapshot field changes; `rivals` already round-trips `dx/dy/active/respawnTimer/snake` (`2887`/`3060`).
- (vi) can the rival kill you by moving? Not by itself — only the body is now authoritative; the head-on branch still needs (c).

**(b) Swept / merged check — resolve both post-move positions in one step.** Compute the player's `wrappedHead` and every rival's `newHead` first, then resolve in a fixed order: player head ∈ rival post-body (excluding the rival's new head) → player dies via the normal chain; rival new-head ∈ player post-body → rival dies; heads equal or swapped → the head-on rule. This is the only symmetric model.
- (i) chain: preserved, but now reached from a single resolution step; the phoenix/streak teleport mutates the player's position, so the resolution must fix an order (recommend: resolve rival contact → if a save fires, the rival survives, repositioned player is re-checked once). Risk: this is the invasive option and it touches the `7089`-`7214` extraction boundary.
- (ii) leech: fires on the true simultaneous head-to-head (tile swap included) — the mechanic finally matches its descriptor (“head-to-head with rival”).
- (iii) legit paths: self-collision unchanged; leech unchanged; the player-body kill is restored (F7) so the “defeat” set grows and is genuinely player-caused.
- (iv) `rivalsDefeated`: becomes meaningful *if* paired with F6 (exclude self-kills).
- (v) determinism: safe if the resolution order is fixed (player, then rival 0..n) and no wall-clock enters it.
- (vi) yes — by design: ramming the player's head/body becomes lethal to the player (head-on) and to the rival (body hit).
- Cost: highest (~1 extraction + a 2-phase move); the reward is that F1 + F7 + F10 all collapse into one correct model.

**(c) Keep the order; make the `playerHead === newHead` branch lethal instead of a free kill.** Correct in spirit (the inverted case is the whole bug) but blocked by the closure constraint: the kill must be deferred. Practical form: set a module-scope `rivalRamPending = { idx, head }` at `3442` instead of `removeRival`, and consume it in `checkPlayerDeath`'s rival branch (same tick's next phase is impossible — the check already ran) → so it must be consumed at the START of the next tick, which adds a 1-tick lag and a new snapshot field.
- (i) chain: reused, no duplication — but a 1-tick-deferred death inside a game that also does `snake.pop()`/`unshift` in between means the death fires when the player has already moved again. Ugly; a save consumed a tick later than it should be.
- (vi) yes for the head only. Cheapest conceptually, messiest mechanically. Note `removeRival` currently fires *after* `r.snake.unshift` (`3404`) — a `return` there leaves the rival in a half-moved state unless the branch is moved above the unshift.

**(d) Move the rival to an earlier phase of the tick wholesale (before the direction consumption/`snake.pop()`).** Consequences are (a)'s, plus: the rival now always sees the player's previous-tick position, the head-on branch semantics shift again, the rival's food eat precedes everything player-related (including the player's obstacle/progressive-spawn checks), and `gameState`-change propagation needs the same guard. Highest blast radius, no extra fairness benefit over (a). Do not do this.

**PICK: (b), scoped as (a)+ram-flag if the budget is tight.** Rationale: (a) alone fixes the two `removeRival`-inversion symptoms (free kill via the body path) but leaves the head-on rule ambiguous; (b) is the only model where "the rival is a rival" — it can kill you by hunting, it dies by ramming you, and neither death is decided by 1-tick staleness. (c)/(d) are rejected for arcane state (a pending-kill flag) or blast radius. If v13 must ship small: do (a) + change the head-on branch to `dealRivalContact(idx)` deferred into the same tick by relocating the whole rival resolution **into** `updateGame`'s move section (i.e. inline it where `checkPlayerDeath` can see it) — that is (b) with the extraction kept local.

Head-on rule recommendation: **mutual destruction** (the rival dies and the player runs the normal save chain; shield/phoenix/streak may rescue). It is readable, matches the “head-on collision” fiction, and it removes the free kill without making random AI turns an instant loss. Do NOT make it a pure player death — the rival's 3% random turn branch (`3355-3362`) plus 7% food chase gives it no aiming, so an unsaved instant death reads as arbitrary.

---

## 5. F2 — RIVAL SPEED MODEL

Measurements first (probe #1 PART 7): both actors are exactly 1 tile/tick at every configuration; `tickInterval` = `getEffectiveSpeed()` (`1953`: `max(50, 120 − floor(score/50)*5)`) scales them together, and `slowMoActive`/speed food multiply/offset the interval (`1973`, `3480`) — again both. So the rival's **relative** speed is constant and F2 as written is unfounded. What a speed model can do is change the rival's *absolute* tiles/tick (make it a pursuer = >1, or a chaseable wall = <1). Keep it tick-counted; all three proposals are stride-based and therefore immune to `slowMoActive`, `speedBoostCounter`, `rivalFreezeMs` and hoard freeze (each of which either multiplies `tickInterval` or skips the update wholesale at `7788`/`7797`):

- **P1 — stride from the rival's own length (recommended).** `stride = r.snake.length >= 14 ? 3 : r.snake.length >= 7 ? 2 : 1`, move only when `(gameTick + idx) % stride === 0`. Synergises with F5: a short (freshly spawned) rival is full speed, a long rival is a slow wall → the “huge body + full speed” compounding that exists today disappears. Needs no new snapshot field (`length` and `gameTick` are both in the snapshot, `2845`/`3014`).
- **P2 — stride from player score (run-progression).** `stride = score >= 300 ? 2 : 1`, keyed on `score` (monotone) and NOT on `getEffectiveSpeed()`, so slowMo/speed food cannot flip the rival into a speed-up. Gives the late run a survivable rival; the early run stays as-is.
- **P3 — stride from elapsed ticks.** `stride = 1 + min(2, floor(gameTick / 1500))`. Simplest and pause-safe (`gameTick` only advances in `updateGame`), no snapshot change, but it ignores player state entirely (a high-skill player still gets a full-speed rival at tick 1499).

Interaction rules that must be stated in the plan: (1) the AI direction re-roll is INSIDE `updateRival` (`3343-3379`) — on a stride-skipped tick, return BEFORE the re-roll so the rival does not turn in place; (2) `rivalFreezeMs`/hoard freeze must keep skipping everything (they already gate the whole loop); (3) the respawn timer (`7789`, wall-clock ms ÷ `tickInterval`) is unaffected — do not fold the stride into it; (4) the head-on branch must only be evaluated on move ticks. Do NOT add a second `updateRival` call per tick — keep one call site (`7799`).

---

## 6. F4 — SPAWN SEPARATION (wrap seam CONFIRMED)

`findFreeTile` (`3232`) filters on **raw** Manhattan: `if (Math.abs(x - headX) + Math.abs(y - headY) < 3 * TILE_SIZE) continue;` (`3239`). No wrap correction exists — verified by reading and by measurement (probe #1, PART 6):
```
  scripted findFreeTile from head (0,10) -> tile (19,10)
    raw Manhattan = 19 tiles (passes the >=3-tile filter)
    WRAP-AWARE    = 1 tiles (spawns 1 tile from the head, across the seam)
  statistical sweep, 4000 respawns, 20x20 board, head (0,10): 26 landed <=2 wrap tiles away
```
So: CONFIRMED, and legally a rival can spawn **1 tile** from the player's head (across the seam), then move on the same tick. (Same class of bug at `3928-3931` for hazard spawns, mitigated there by a 250-tick grace + the visible pulse.)

**Should separation scale with the rival's speed? Yes — but separation alone cannot make spawns fair.** With both actors at 1 tile/tick and the spawn tick also moving the rival (§2), the on-screen first frame is `separation − 1` tiles with a 2-long body. Minimum fair distance in tiles, wrap-aware, at a 1-tile/tick stride: **≥ 5 tiles** gives 4 ticks (≈480 ms at score 0) — and only **200 ms at score 1000**, where the tick is 50 ms. Human reaction is ~250 ms, so distance alone is unsatisfiable at high score. Therefore the plan must pair:
1. **wrap-aware** distance in `findFreeTile` (or a dedicated `minSep` param for the rival call at `3320`): `min(|dx|, W−|dx|) + min(|dy|, H−|dy|) >= 5 * TILE_SIZE`;
2. a **spawn grace**: `spawnGraceTicks` (I suggest 6 ticks ≈ 720 ms at base cadence) during which the rival does not move and is non-lethal, rendered as a flashing translucent outline (uses the existing `drawRival`), with the counter decremented in the respawn/update block and added as an **additive** snapshot field (no `SNAPSHOT_VERSION` bump, per AGENTS.md).
With a grace you may safely keep the 3-4 tile separation; without a grace no distance is enough. Also delete/neutralise the same-tick move so the grace is not consumed before the rival is drawn.

---

## 7. RANKED — WHAT TO DO IN v13

1. **F5 rival growth/movement regression** (`3404-3405`). CRITICAL. 1 line + git-proven against v4. Everything else about the rival (speed, spawn, lethality) is being reasoned about on false premises until this lands. Also restores the tail vacating, which is what makes the S4 chase death survivable.
2. **F6 self-kill credited to the player** (`3463`). HIGH. 1 line: pass a `credited` flag (`removeRival(idx, credited)`) — `updateRival`'s self-hit (`3399`) and any “unfair-spawn cleanup” pass `false`; leech drain and the (future) head-on pass `true`. Protects `RIVAL_SLAYER`/`meta_rival_slayer`/25/100 from inflation, which F5 otherwise amplifies.
3. **F4 + F9 wrap-aware separation + spawn grace/telegraph.** HIGH value, small diff, pure fairness win, and it is the one change a player feels immediately (“the rival no longer appears on top of me”). Snapshot-additive.
4. **F1 head-on inversion — option (b) (or (a)+ram-flag).** HIGH value, medium/large diff. This is the thematic core of v13 and the only fix that makes the risk curve correct. Do it after 1-3 so the semantics you are tuning actually hold.
5. **F7 restore the player-body kill rule** (`playerBodyHit`, v4). MEDIUM: it is the same code path as 4 and should ship with it; without it the rival stays a ghost through your own body.

**NOT worth doing in v13:**
- **F2 speed model you asked for** — the premise is refuted by measurement (both are 1 tile/tick at every score/speed/slowMo config). A stride is a *balance* lever, not a fairness fix; if v13 wants one, P1 is the only version that also defuses the F5 body-size problem — otherwise defer it.
- **F8 obstacle/hazard immunity** — real, but it is a design statement (“the rival is a spirit the board does not constrain”), not a fairness bug, and making the rival obstacle-aware re-introduces the v4 trap-death rule (`removeRival` when boxed in) which is a whole sub-feature. Document the intent instead; revisit in v14.
- **F11** (rivals cleared on `gameOver`, `3539`) — cosmetic.
- **F12** (rivals overlap under `double_rival`) — cosmetic; the rivals ignore each other by construction.
- **F13** (`prevRivalSnake` dead write at `427`/`6973`, stale `advanceShrinkZone` comment `2731`, stale `AGENTS.md:76`) — cleanup only; bundle with 1 if convenient. Note the `prevRivalSnake` deletion also removes one array allocation per tick.

## 8. FACTS THE DESIGN PLAN MAY RELY ON (all measured or line-cited)
- Rival enables: `spawnRival` early-returns for zen/snap/daily/walled/painter (`3312`); classic/timeAttack at run start (`2628`), `double_rival` adds `rivals[1]` (`2631`), gauntlet waves 3-5 (`6336`, `841-846`).
- One rival call site per tick (`7797-7801`); gated by `anyRivalActive() && !hoardActive && rivalFreezeMs <= 0`.
- Rival death → `respawnTimer = 10000` ms (`3459`) decremented by `tickInterval` (`7789`) ⇒ 10 s wall-clock / fewer ticks at high score.
- Snapshot round-trips `{snake, dx, dy, active, respawnTimer, color}` (`2887` build / `3060` restore); `gameTick` is in the snapshot (`2845`/`3014`) so tick-strided models survive save/resume.
- The only rival death cause string is `'You were caught by the rival!'` (`7203`); the rival-path save chain is shield → phoenix → streak → death (`7182`/`7190`/`7202`), with no vampire and no serpentine (matches `AGENTS.md`).

