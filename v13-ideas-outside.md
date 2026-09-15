# v13 rival review — outside-view findings

Scope note: I have **no shell tool in this session**, so nothing was executed. Every claim below is a **static trace** (CONFIRMED = I read the code and it does exactly this; SUSPECTED = mechanism read, rate unverified). One-command repros are supplied at the end for the two findings that deserve dynamic proof. Board: `PLAY_WIDTH = PLAY_HEIGHT = 400`, `TILE_SIZE = 20` -> **20x20 = 400 tiles** (snake.html:137,145,146). `BASE_SPEED = 120`, `MIN_SPEED = 50` (149,150).

---

## 1. MARQUEE FINDING (new, severe) — the rival grows itself to RIVAL_MAX_LENGTH for free

```js
3404    r.snake.unshift(newHead);
3405    if (r.snake.length > RIVAL_MAX_LENGTH) r.snake.pop();
```
There is **no tail pop per move**. Contrast the player, whose movement is `const tail = snake.pop()` (7014) + `snake.push(tail)` only on eat (7297, 7554, 7619) — length conserved. The rival's only pop is the `> RIVAL_MAX_LENGTH` guard, so:

**CONFIRMED trace.** `spawnRival` creates `r.snake = [{x: spawnPos.x, y: spawnPos.y}]` (3329) — length 1. Each subsequent `updateRival` tick: self-hit test (nothing to hit) -> `unshift` -> length 2, 3, 4, ... The pop at 3405 first fires only when length would be 21, i.e. it never fires below the cap. **The rival reaches RIVAL_MAX_LENGTH = 20 (1218) on its 19th tick, about 2.3 s at the 120 ms base tick, without eating a single food.** It is a **fixed-length-20 worm** for the rest of its life; `RIVAL_MAX_LENGTH` is de facto its settled length, not a maximum.

Consequences, all confirmed by the same line:
- **JC's literal "it starts too long" is satisfied with no interpretation**: the rival visibly grows from a 1-tile dot into a 20-tile worm in 2.3 s of empty movement. (The brief reads "starts too long" as "no warning"; both readings are true and this one is concrete.)
- On a **20-wide row** the 20-length body covers every column of that row (offsets 0..19 mod 20), so the next straight step lands on `body[19]` = the tile the tail is about to vacate -> the self-hit test at 3393-3397 fires -> `removeRival` (3400) -> 10 s dead. **A rival travelling straight on a wrap-enabled board kills itself at exactly length 20.** (CONFIRMED arithmetic, board constants 145-146.)
- The body is a 20-tile lethal wall that the player must route around, moving at exactly the player's speed.
- `drawRivalHUD` prints `Rival: max(len)` (6116-6128) -> the badge reads **"Rival: 20"** permanently from ~2.3 s in, so it is information-free.
- The eat branch is a **net no-op at the cap**: `push(newHead)` -> 21 -> `pop` -> 20 (3408-3409). "Rival grows +1 per food" is unobservable.
- The 400-tile board is 5% covered by one rival; `generateFood`'s board-full guard counts those 20 tiles (2094).

**Sub-bug (CONFIRMED, same site):** below the cap the rival grows by **+2 per food** — 3404 unshifts the head, 3408 pushes a *duplicate of the same coordinates*. So one food = +2 length (design says +1), and the rival's body silently contains two identical cells. At the cap this becomes the invisible-growth no-op above.

**Smallest fix (design input, ~6 lines):** mirror the player. Take `var rTail = r.snake[r.snake.length - 1]`, unshift, always pop, then `if (willEat) r.snake.push(rTail)` with `var willEat = food && newHead.x === food.x && newHead.y === food.y` computed before the unshift. Do not forget `willEat` must stay consistent with the existing eat branch at 3407 (which also does the epic/portal-twin cleanup and the Pressure-Cooker shrink).

---

## 2. AI quality (bounded) — actual failure modes, each traced

The direction chooser is 3342-3380: `rand < 0.7` chase, `< 0.9` straight, else uniform random with a reverse check. All `seededRandom()` (718) so daily runs stay deterministic.

**2.1 A food directly astern deadlocks the chase — the rival drives away and keeps growing. (CONFIRMED; this is the `possible.length === 0` trace you asked for.)**
- State: rival head tile (5,5) = px(100,100), `r.dx = +20, r.dy = 0`; `food = {x: 80, y: 100}` one tile directly behind.
- 3346-3347: `dx_food = -20`, `dy_food = 0`. 3348-3355: `|dx_food| = 20 <= PLAY_WIDTH/2 = 200`, so no wrap adjustment.
- 3356-3359: `dx_food < 0` -> `possible = [{dx:-20, dy:0}]`. `dy_food === 0` -> **no y candidate is pushed** (`possible` is capped at one entry per axis).
- 3365: the reverse filter removes it (`-20 === -r.dx && 0 === -r.dy`). `possible.length === 0`.
- 3366: `if (possible.length > 0)` is false -> **there is no else** -> **`r.dx`/`r.dy` are left completely unchanged** (no zeroing, no fallback).
- 3384-3387: the rival steps to (120,100) — *away* from the food.
- Repeat each tick: `dx_food` goes -20, -40, ... until `|dx_food| > 200`, i.e. the rival travels a **half-lap (~10 tiles, half the 20-column board) before the wrap flips the sign and the chase resumes**. It is growing 1/tick the whole time, so this stall is exactly the runway that pushes it to length 20 and into the self-destruct in 1.3.
- Note the deadlock also means the 70 %/20 %/10 % split degrades: on those ticks the 70 % chase branch is a silently-equal-to-straight branch, so the effective mix skews toward straight.

**2.2 Zero body awareness — no self-collision rejection at all. (CONFIRMED mechanism; rate unquantified.)** The only filter anywhere is the 180° reversal guard (3365, 3376). With `possible` holding at most 2 candidates and no occupancy test, every chase turn is a coin-flip on whether the tile is its own body; the 10 % random branch (3374-3378) only excludes the neck. And the self-hit test at 3393-3397 scans **the whole body including the tail that is about to vacate** (pop is at 3405, *after* the test) — the player is tested against the post-pop body (pop 7014 -> test 7063/7214). **The rival therefore dies on moves the player would survive, every single time the tail cell is the entry tile.** The original spec (`docs/.../2026-05-18-snake-living-arena-design.md`, Feature 1: "The AI rejects moves that would cause immediate self-collision or obstacle collision. If all valid moves lead to collision, the rival dies") promised this and it was never implemented. Combined with 2.4 and section 1 this is why the rival's lifecycle is grow->suicide->10 s off-screen.
- No obstacle avoidance either (spec promised it): the rival walks through obstacles. It also walks through hazards and (in a non-wrap mode) would be unbounded — though no reachable mode has `wrap:false` with a rival (`walled` is excluded at 3313; `MODE_CONFIG` wrap flags 1402-1433), so **off-board movement is unreachable — non-issue**.

**2.3 Trapping/corner-stalling: the greedy 1-axis chase cannot route, but the board's wrap makes hard locks self-clearing. (CONFIRMED, benign)** The `possible` list never contains both directions of an axis, so the rival can only ever reduce the food distance one axis at a time; if the direct axis is blocked by its own body it has no alternative but "straight". With wrap, distance eventually flips sign (2.1) so it always escapes eventually. It does not spin in place — it moves every tick, so no permanent deadlock.

**2.4 Does the rival play competitively?** Yes mechanically: it eats the single global `food` at 3407, and after doing so regenerates the food excluding itself (3415-3420). It does **not** eat `food2` (echo brew), `extraFoods` (portal/hoard) or `powerUpPickup` — it can only ever steal the primary food. And it is never **heard** either: there is no particle, sound, floater or toast when the rival eats, so a player racing it sees the food simply vanish (see R7).

**2.5 Verdict + smallest fix.** Not fundamentally broken — the wrap-aware delta and reversal guard are correct and the chase works. It is missing three cheap things:
1. the tail-vacate pop (section 1, ~6 lines) — fixes growth, self-length, HUD truth;
2. a **1-ply occupancy filter** over the existing <=2 candidates plus the straight fallback (~10 lines): `possible.filter(d => !r.snake.some(s => s.x === head.x + d.dx && s.y === head.y + d.dy))`, and if the survivor set is empty, fall back to straight if that tile is free, else die — this is exactly the spec's rule, is not pathfinding, and directly reduces the self-suicide rate;
3. a **stern-deadlock breaker** (~5 lines): when `possible.length === 0` *and* the food is on the current axis directly behind (`dy_food === 0` when `dx_food !== 0`, or vice versa), push the two perpendicular candidates (still reverse-filtered) so the rival turns out of the deadlock instead of running half a lap. One perpendicular step makes the food diagonal, after which the normal chase resumes, so this cannot oscillate.

---

## 3. Interactions with other systems

| System | Verdict | Detail |
|---|---|---|
| `double_rival` | **CONFIRMED dead weight outside classic/timeAttack** | `spawnRival(1)` is gated `(gameMode === 'classic' \|\| gameMode === 'timeAttack')` at 2630, 8450, 8467. But `pickDraftOptions(count)` (6471-6473) draws from `unlockedMutators` with **no mode filter**, and the draft gate is only `draftModeEnabled && unlockedMutators.length > 0 && gameMode !== 'daily'` (8514). So in **gauntlet / zen / walled / painter / snap** the player can draft Double Rival, the HUD prints its name (6696-6701), and **no second rival ever spawns** (and in zen/walled/painter/snap `spawnRival` is inert anyway, 3313). This is a direct violation of v12's own rule for resonances: "the name the HUD shows is a mechanic that runs". Fix: either filter the draft pool by mode, or gate on "the rival is enabled in this mode" instead of a literal mode list. Note gauntlet truncates its mutator manifest to 1 (2634-2636) so it is reachable with a single-mutator draft. |
| Double-rival stacking | Non-issue | `findFreeTile` rejects `rivalCombinedSnake()` tiles (3243-3244), which include the already-spawned rival 0, so the two cannot stack. |
| Redundant spawn | Latent (cosmetic) | 8451 / 8468 call `spawnRival(1)` immediately before `startGame()`, which re-spawns idx 0 and then no-ops on idx 1 (`if (rivals[idx].active) return;`, 3312). Harmless, but it silently changes which rival claims the better tile. |
| Gauntlet waves | **CONFIRMED correct** | `resetWaveState()` clears `rivals = []` (6285) and `startNextWave()` respawns on `rival: true` waves (6335-6337); `startGame()` does the same for wave 1 (2646-2647). Waves 3/4/5 are the `rival: true` ones (847-849). `resetWaveState` does NOT reset `rivalFreezeMs` (6205-6265) — unreachable today because the hoard/pigment systems are gauntlet-excluded, but a latent footgun. |
| Hazards | **CONFIRMED the rival is immune** | `isHazardCollision(pos)` (3944-3952) has exactly **one** caller: the player path at 7122. `updateRival` never tests hazards. The rival walks through lethal rifts unharmed, while `generateFood` (2140) and `moveHunter` (2075) actively avoid them. Symmetric option for free: a hazard check in `updateRival` right after `newHead` (~8 lines) turns a rift into a weapon the player can bait the rival into. If taken, gate it on `rivalFreezeMs <= 0` so a frozen rival parked in a rift does not die the moment the freeze lifts. |
| Obstacles | **CONFIRMED the rival ignores them** | `updateRival` has no `obstacles` test anywhere. The rival spawns clear of them (`findFreeTile` 3241) but then walks through. Two asymmetries for the player: the rival can be inside an obstacle where the player cannot follow, and its body inside an obstacle is still lethal to the player. Also, `generateObstacles` (3248-3310) only checks snake/obstacles/food — **it does not check `rivals`**, so a progressive obstacle can materialise on top of a live rival's body, producing an overlapping obstacle+rival tile. |
| `hoardActive` freeze | Correct, one legibility consequence | Both the respawn decrement and the update are gated on `!hoardActive && rivalFreezeMs <= 0` (7788, 7797) and `rivalFreezeMs` decays unconditionally per tick (6815). So during a hoard the rival becomes a **static 20-tile lethal wall sitting in the middle of the food rush**, and there is no cue that it is frozen. `test-v9.mjs:232-246` pins the freeze. |
| `rivalFreezeMs` | Non-issue | Declared 3965, reset in `resetGame` (2436), snapshotted (2945 build / 3119 restore), decremented 6815. Complete. |
| Portal / hoard / extra foods | One genuine hole | The rival cannot eat `extraFoods`, but `findFreeTile` does **not** check `extraFoods`, `food2`, `hazards` or `powerUpPickup` (3232-3245). A rival can therefore respawn **directly on top of hoard food, portal food, a power-up, echo food, or inside an on-phase hazard** — the hoard food then becomes uncollectable-without-death. The sibling predicates are stricter: `findPortalTile` (2170-2181) rejects snake/obstacles/food/food2/powerUp/extraFoods/hazards, and `snapToFreeTile` (2193-2207) rejects snake/obstacles/rivals. Three different "free tile" predicates with three different occupancy sets — the rival path uses the weakest. (~6 lines to close.) |
| Rival eats epic | Correct cleanup, wrong silence | 3412-3414 removes the portal twin (`extraFoods.filter(ef => !ef.portalLink)`) — and the player loses an epic + its teleport twin with **zero cue**. Also: `generateFood` is called at 3420 without clearing `food` first, so the regenerated food also cannot land on the tile just vacated; the board-full fallback sets `food = null` (3423) and the passive regen at 7834 restores it — correct. |
| Magnet / bomb | Bomb is the only rival-aware tool | Bomb trims up to 3 rival tail segments within 2 tiles (7314-7322) — the **only** tail trim besides the leech, and it competes with the auto-growth: a bomb on a growing rival is barely visible. Magnet never touches rivals. |
| `shrinkZone` / `advanceShrinkZone` | Correct as designed; STALE COMMENT | `advanceShrinkZone` (2736-2753) tests `snake[0]` only; the rival is unaffected and can sit outside the zone. The `rivalShrink` (Pressure Cooker) call at 3432-3436 is wired, behaves per the descriptor (a rival eat can kill the player) and `test-v12.mjs:386-420` pins it behaviourally. **But the comment at 2733-2734 says "that rival-eat call site is NOT wired yet — only the shrink_zone timer path below calls this" — it is wired.** Delete it. |
| Leech head-on | **CONFIRMED bug (new)** | 7161-7177: on head contact with leech equipped, the drain loop pops at most 3 segments (`lsi < 3 && length > 1`, 7166) and only removes the rival if it ends at length <= 1 (7174). Then the **same iteration** falls through to the segment loop 7180-7207, which finds the rival's head still standing on the player's head tile. So: rival length 2-4 -> drained to 1 -> `removeRival` -> player survives (intended); **rival length >= 5 -> drained to >= 2 -> rival survives at that very tile -> the player dies** with `lastDeathCause = 'You were caught by the rival!'` (7206). The advertised "head-to-head counter" backfires above 4 length with no warning — and per section 1 the rival is almost always at length 20. Minimal fix: on a leech drain that leaves length > 1, still `removeRival(idx)` (the collision was resolved by the drain). Secondary: 7167 pushes copies of the *current tail coordinate* (3 stacked duplicate cells) rather than extending the body — permanent +3 length, visually no growth, three overlapping render cells for three ticks. |
| Wall mode | Non-issue | Rival excluded (3313); no non-wrap mode has a rival. |

---

## 4. State integrity

**Reset sites — all three present and correct. CONFIRMED.**
- `resetGame()` `rivals = []` (2356) — also clears `rivalFreezeMs` (2436).
- `gameOver()` `rivals = []` (3539).
- `resetWaveState()` `rivals = []` (6285).
Near-miss verified safe: after `gameOver()` empties `rivals`, the caller loop at 7797-7800 re-evaluates `rivals.length` on the next iteration test, so it exits rather than dereferencing `undefined.active`. `prevRivalSnake` is *not* reset in any of the three — irrelevant, it is dead (below).

**Snapshot — complete. CONFIRMED.** Build 2887 serialises `snake/dx/dy/active/respawnTimer/color`; restore 3060 rebuilds all six with safe defaults (`respawnTimer || 0`, `color || '#FF4444'`, `active: !!`). Every per-rival field is covered, so a per-rival cadence field added in v13 must be added to **both** sites (additive only, no `SNAPSHOT_VERSION` bump). One inherent pre-existing wart: a resumed run can re-defeat an already-credited rival, so `stats.rivalsDefeated` can double-count across save/resume — latent, consistent with existing resume semantics.

**`respawnTimer` semantics — intentional, not a bug.** `removeRival` sets 10000 ms (3459); a failed `spawnRival` re-arms at `Math.max(respawnTimer, 2000)` (3326). A deleted rival earns the full 10 s absence; a rival that could not find a free tile retries in 2 s. Both are decremented by the real `tickInterval` (7789), so they track wall-clock correctly under slow-mo/speed food. Two nits: unnamed magic numbers, and a failed spawn is completely silent, so an under-populated board is undiagnosable.

**`removeRival`'s defeat credit — every caller, and what it should do. CONFIRMED.**

| Caller | Line | Should award `stats.rivalsDefeated`? |
|---|---|---|
| Rival self-collision | 3400 | **NO** — the player did nothing; this is the RIVAL_SLAYER inflation. Today it credits (3463). |
| Head-on (`playerHead === newHead`) | 3443 | **NO as written** — today this is the F1 free kill. Under the spec fix this branch should not exist at all: head-on should be a **player death**, so no defeat is awarded. |
| Leech drain (`snake.length <= 1`) | 7174 | **YES** — a genuine, deliberate player-caused kill (the v6 design says a drained rival is defeated and respawns). |
| Bomb tail trim | 7319-7320 | Does **not** call `removeRival` — a bomb can reduce a rival to length 1 without killing it. Then the automatic growth (section 1) rebuilds it to 20 within seconds. |

Implementation note: make it explicit — `removeRival(idx, defeatedByPlayer)` with the flag required, and have the self-collision path emit a *different* cue ("the rival crashed") that does not credit. That keeps `RIVAL_SLAYER` (1261), `meta_rival_slayer` (1286) and the 25/100 milestones (1367-1371) honest: today all three are farmable by standing still waiting for the rival to tangle itself, which per section 1 it does within seconds of its 19-tick growth.

**`prevRivalSnake` is dead state. CONFIRMED.** Declared 427, assigned every tick at 6973 (`rivalCombinedSnake().map(...)`), and **never read anywhere** (whole-file grep: only those two sites). It costs an array + N object allocations **per tick** for nothing — delete both lines.

---

## 5. What would take the rival to the next level — ranked

Cost = lines of production code. All client-side, no new deps, no new modes/currencies/DOM panels.

**Tier 1 — do these (the theme's three words: fair / legible / dangerous)**
1. **Tail-vacate movement + eat-growth** (section 1) — ~6 lines, snapshot-safe (no new field). *Effect:* the rival stops being a free 20-tile worm; it starts small and grows only by eating, so "starts too long" is fixed at the root; the HUD badge becomes meaningful; the length-20 straight-line suicide disappears. *Risk:* keep `willEat` in sync with the 3407 branch (epic/portal cleanup + Pressure Cooker).
2. **Collision rules per the original spec: head-on = player death; rival-hits-player-body = rival death** (spec Feature 1, Collision Rules) — ~15 lines. *Effect:* kills F1 and simultaneously makes the rival actually dangerous (it can win a head-on) while giving the player the body-block counterplay the spec intended. *Risk:* the death-save chain (shield -> phoenix -> streak charge, 7182-7206) must stay intact, and the leech branch must be judged first. *Pair with:* a defeat reward (score/XP + floater + `queueToast`), also from the spec ("+100 XP + 50 bonus score, toast 'Rival Defeated!'"); today a defeat yields only particles (3454-3456).
3. **Spawn telegraph** (F3) — a per-rival `spawnGrace` tick counter: while graced the rival is drawn as a flicker/outline and is **skipped by the player's collision test**, so it cannot kill and cannot be killed until it solidifies. ~20 lines (spawnRival sets it, updateRival decrements + skips the head-on branch, the 7158 loop skips graced rivals, drawRival renders the ghost, additive snapshot field). *Effect:* JC's #1 ask, using the v12 hazard pre-ignition precedent (v12 B). *Risk:* never let the cue say "safe" while the rival is lethal — v12 B's exact lesson.
4. **1-ply self-collision rejection + stern-deadlock breaker** (2.5) — ~15 lines. *Effect:* the rival stops killing itself, so it survives long enough to be a threat; it is the spec's promised rule. *Risk:* makes the rival *less* likely to die, so combine with #2 to keep the body-block defeat loop reachable.
5. **`removeRival(idx, defeatedByPlayer)` split + a distinct self-crash cue** — ~15 lines. *Effect:* un-inflates RIVAL_SLAYER and the milestones; makes it clear *why* a rival vanished. *Risk:* update all 3 call sites (3400, 3443, 7174); note `probe-rival-cues.mjs:35` calls `removeRival(0)` directly, and make the new parameter's default deliberate and documented.

**Tier 2 — small, high value**
6. **Cues on every rival event** — red floater + particles + `playSound` when the rival eats (3407 block); a distinct cue/toast on respawn (pairs with #3) and on defeat. ~12 lines. *Effect:* the competition becomes readable; today the food just vanishes. *Risk:* route through `queueToast` at `'low'` priority (never a private `setTimeout`, v12 E) so achievement/level-up toasts are never evicted.
7. **HUD truth** — "Rival respawning: 4s" while dead (from `respawnTimer`, 6116-6128), per-rival length while alive, and a **distinct head colour per rival** (5853 paints *both* rivals' heads `#FF6666` while their bodies differ, so `double_rival` is ambiguous). ~15 lines, `ctx.save/restore`, no new state. *Effect:* converts the surprise complaint into anticipation, zero invariant risk.
8. **Rival vs hazards** (section 3) — ~8 lines. *Effect:* symmetry with the player, and a rift becomes a weapon. *Risk:* gate on `rivalFreezeMs <= 0`.
9. **Fix `findFreeTile`'s missing occupancy checks** (hazards/extraFoods/food2/powerUp) — ~6 lines. *Effect:* no more rivals materialising on hoard food. *Risk:* `findFreeTile` also serves the Phoenix/streak-charge saves (`ignoreObstacleCap=true`); extra rejections only marginally reduce save placement — worth a comment.
10. **`double_rival` truth** — filter the draft pool by mode (single choke point `pickDraftOptions`, 6471) or gate the spawn on "rival enabled here". ~8 lines. *Effect:* removes the last descriptor that lies.

**Tier 3**
11. **Explicit per-rival move cadence** (F2's real fix, and the only way to satisfy "make it slower"): a `moveEvery`/`movePhase` counter so the rival steps on 1 tick in N. *Risk:* **two existing suites hand-construct rivals and call `updateRival` directly expecting a move per call** — `test-v12.mjs:397-408` (A14, rival has `dx:20` but no phase field) and `test-evolution.mjs:187-189` (leech steal, rival has **no `dx`/`dy`/`respawnTimer` at all**). Make the cadence field undefined-safe (missing = step on the first call) so both stay green unedited, and snapshot it additively. Design note: section 1's growth is per *call*, so a slower rival also grows slower — until #1 lands, the two changes must be designed together.
12. **Delete `prevRivalSnake`** (427, 6973) — -2 lines, removes a per-tick allocation.

**Refinement of F2 the plan should state precisely:** the rival is not merely "the same base speed" — it moves exactly 1 tile per *player tick*, so it is **exactly** the player's speed at every setting. Speed food (-30 ms), slowMo (x2), the Swift evolution divider and Time Attack's fixed 80 ms all change `tickInterval`, and both snakes move once per tick, so **no speed asymmetry can ever exist in either direction**: the player can never outrun the rival and the rival can never fall behind. That is why "make it slower" needs a new explicit cadence concept rather than a constant tweak.

---

## 6. Triage

**SEVERE — fix in v13**
- R1 free growth to `RIVAL_MAX_LENGTH` (3404-3405) — root cause of "starts too long" and of the self-destruct loop.
- R2 no tail-vacate exemption in the rival's self-hit test (3393-3402 vs the player's 7014/7063).
- R3 F1 head-on (known) — reframed: the spec's collision rules were never implemented; the *replacement* rule is the fix, not an ordering patch.
- R4 zero self/obstacle awareness in the AI (spec-promised) — 3342-3380.
- R5 the astern deadlock (`possible.length === 0` leaves dx/dy unchanged and drives away, compensated only by the wrap) — 3356-3371.
- R6 `removeRival` credits self-crash defeats (3463) with three callers of three different meanings.
- R11 leech head-on kills the player vs any rival of length >= 5 (7161-7181).

**HIGH — small, plainly worth it**
- R7 no feedback on any rival event (eat 3407-3425, defeat 3449-3464, respawn 3313-3333).
- R8 rival eats the epic and silently deletes the portal twin (3412-3414).
- R9 +2 growth per food with an invisible head duplicate (3408).
- R10 `double_rival` is a no-op outside classic/timeAttack but is draftable and displayed (2630/8450/8467 vs 6471/8514).

**MEDIUM / latent — note in AGENTS.md**
- R12 `findFreeTile` misses hazards/extraFoods/food2/powerUp (3232-3245); three inconsistent "free tile" predicates.
- R13 rival immunity to hazards/obstacles + `generateObstacles` not checking rivals (3248-3310).
- R14 no cue that the rival is frozen during the hoard.
- R15 `drawRival` after `drawSnake` (6620-6621) occludes the player; identical head colours for both rivals (5853); `drawRivalHUD` shows max length only (6116-6128).
- R16 `prevRivalSnake` dead + allocating (427/6973).
- R17 stale comment claiming the rivalShrink call site is unwired (2733-2734) — it *is* wired at 3432 and pinned by `test-v12.mjs`.
- R18 `resetWaveState` does not clear `rivalFreezeMs` (unreachable today).

**NON-ISSUES (verified, do not spend time)**
- Reset sites 2356/3539/6285 all correct; snapshot round-trip complete (2887/3060); `rivalFreezeMs` fully wired.
- `respawnTimer` 10000 vs 2000 semantics are intentional and wall-clock-correct.
- No off-board rival movement (no reachable non-wrap mode with a rival).
- `double_rival` rivals never stack.
- `gameOver()` called from inside `updateRival` (3434) is safe: the caller loop re-evaluates `rivals.length` and exits.
- The 3-tile spawn separation (F4) is real but its *close-spawn* sting is F1's; the fix belongs with the telegraph (Tier 1 #3), optionally adding "not within 3 tiles of the player's forward ray".

**Doc drift to correct in AGENTS.md** — the section "Food Generation — Two-Source Rival Counting" describes `rivalActive`/`rivalSnake`/`rivalLength`, **none of which exist any more**; the guard is now `currentSnake.length + obstacles.length + extraFoods.length` (2094) and `test-bugfixes.mjs:141-146` is the surviving enforcement. Rewrite it as "all callers must pass a complete `currentSnake` including rival segments", listing the callers (2430, 3420, 6291, 7353, 7520, 7604, 7836).

---

## 7. Verification status and repros for the main agent

Nothing was executed (no shell tool in this session). The findings that most deserve dynamic proof, ready to paste into a throwaway script outside the repo (`node /tmp/x.mjs`):

```js
// R1 — free growth. Expect before=1, after=20: the rival grows 19 segments just by moving.
const r = await page.evaluate(() => {
  stopGameLoop(); gameMode = 'classic'; obstacles = []; hazards = []; extraFoods = [];
  food = { x: 20, y: 380, type: 'common', spawnTime: 0 };   // far away, never reached
  rivals = [{ snake: [{ x: 200, y: 200 }], dx: 20, dy: 0, active: true, respawnTimer: 0, color: '#FF4444' }];
  const before = rivals[0].snake.length;
  for (let i = 0; i < 19; i++) { if (!rivals[0].active) break; updateRival(0); }
  return { before, after: rivals[0].snake.length, active: rivals[0].active };
});
console.log(JSON.stringify(r));   // predicted: {before:1, after:20, active:true}
```

```js
// R5 — astern deadlock. Expect the rival to move AWAY: dir stays +20, head 100 -> 120, food at 80.
const s = await page.evaluate(() => {
  stopGameLoop(); gameMode = 'classic'; obstacles = []; hazards = []; extraFoods = []; activeMutators = [];
  snake = [{ x: 200, y: 200 }];
  food = { x: 80, y: 100, type: 'common', spawnTime: 0 };
  rivals = [{ snake: [{ x: 100, y: 100 }], dx: 20, dy: 0, active: true, respawnTimer: 0, color: '#FF4444' }];
  const orig = window.seededRandom; window.seededRandom = () => 0;   // force the chase branch
  updateRival(0);
  const head = { ...rivals[0].snake[0] }, dir = { dx: rivals[0].dx, dy: rivals[0].dy };
  window.seededRandom = orig;
  return { head, dir };
});
console.log(JSON.stringify(s));   // predicted: head {x:120,y:100}, dir {dx:20,dy:0}
```

```js
// R11 — leech head-on vs a long rival kills the player.
const l = await page.evaluate(() => {
  stopGameLoop(); gameMode = 'classic'; activeBrews = ['leech']; brewUsageFlags = { leechUsed: false };
  obstacles = []; hazards = []; extraFoods = []; dirQueue = [];
  snake = [{ x: 100, y: 100 }, { x: 80, y: 100 }, { x: 60, y: 100 }];
  dx = 20; dy = 0; lastConsumedDir = { dx: 20, dy: 0 };
  food = { x: 380, y: 380, type: 'common', spawnTime: 0 };
  rivals = [{ snake: [{ x: 120, y: 100 }, { x: 140, y: 100 }, { x: 160, y: 100 },
                      { x: 180, y: 100 }, { x: 200, y: 100 }],
              dx: 0, dy: 0, active: true, respawnTimer: 0, color: '#FF4444' }];
  updateGame();
  return { gameState, lastDeathCause,
           rivalActive: rivals[0].active, rivalLen: rivals[0].snake.length, playerLen: snake.length };
});
console.log(JSON.stringify(l));
// predicted: gameState 'gameover', cause 'You were caught by the rival!',
// rivalActive true, rivalLen 2, playerLen 6 (drained 3 then grew 3).
```

Report-only, no files written; the repo is unmodified. `probe-rival-cues.mjs` in the repo is a sibling's in-flight probe (they are already covering the F1 head-on cases and the spawn cue inventory) — I deliberately did not duplicate it, and my findings R1/R2/R5/R9/R11 are outside their scope.
