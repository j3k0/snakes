# AGENTS.md

## Game Loop (v6+)
- The game loop uses `setTimeout` chaining: `scheduleNextTick()` → `updateGame()` → `scheduleNextTick()` (no longer `setInterval`/`gameInterval`).
- `stopGameLoop()` clears `gameTimeout` to null and is the single exit path.
- `restartGameTimeout()` calls `stopGameLoop()` then `scheduleNextTick()` — use this for speed changes instead of manual clear+create.
- Speed changes still require clearing and re-scheduling the existing timeout chain.

## Dual Render Loops
- The game runs TWO concurrent loops: `setInterval` (50-120ms) for `updateGame()` → `drawGame()` (core game state), and `requestAnimationFrame` (60fps) for `animateVisuals()` (particles, score animation, screen effects)
- The rAF loop reads game state (particle array, score values, timer flags) but NEVER writes to game logic state — no write contention between loops
- `animateVisuals(timestamp)` receives the rAF timestamp automatically; compute delta via `Math.min(timestamp - lastFrameTime, 100)` and use it for all timer-based decays. Cap at 100ms to prevent jumps when resuming from tab-hidden state
- Hardcoded frame-rate assumptions (e.g., `16 / maxLife`) break on variable-refresh-rate displays — always use delta time

## Canvas Save/Restore Discipline
- Canvas state operations (`ctx.translate`, `ctx.shadowBlur`, `ctx.globalAlpha`, `ctx.scale`) mutate persistent context state
- Every `ctx.save()` must have a matching `ctx.restore()` on ALL code paths — an early return between them permanently corrupts the canvas transform
- For simple one-off state changes (e.g., shadowBlur on a single tile), prefer explicit reset (`ctx.shadowBlur = 0`) over save/restore

## Draw Order
- Canvas draw order is: grid → obstacles → food → snake → particles/trails → overlays (pause, gameover) → flash overlay
- Flash overlay must render LAST (on top of everything) to create the screen-covering effect
- Obstacles render behind food so eating near an obstacle is visually clear

## Food Generation
- `generateFood()` must check if the snake fills the board before entering the do-while loop, otherwise it infinite-loops
- When obstacles exist, the board-full guard must check `currentSnake.length + obstacles.length`, not just `currentSnake.length`
- The do-while condition must also reject obstacle tiles

## Food Tier System
- `FOOD_TIERS` is the global authority for food type distribution — per-mode `foodProbs` were removed
- All game modes use the same FOOD_TIERS weights for consistency
- Stat normalization: `common/uncommon/rare/epic` all map to `stats.normalFoodEaten` in the eat block's else branch

## State Management
- `gameState` (`idle`/`playing`/`paused`/`gameover`) is the single source of truth for all flow control; always check it before acting on input or updating

## Touch Controls
- Touch input uses two parallel paths:
  - **Virtual D-pad**: Dispatches `KeyboardEvent('keydown', {key})` to `document` — reuses the existing keydown handler and its input buffering, direction validation, and game-state guards
  - **Swipe detection**: Sets `nextDirection` directly (same buffer the keydown handler uses)
- D-pad `touchstart` listeners must use `{ passive: false }` and `e.preventDefault()` to suppress the subsequent `click` event (which would double-dispatch)
- Touch event listeners must be on the canvas element (not document) to avoid interfering with DOM panels

## Daily Challenge System
- Attempt is consumed on `startGame()`, not on page load or `gameOver()`
- If consumed on page load: tab-close mid-game loses the attempt
- If consumed on `gameOver()`: Zen mode (no death) lets player play indefinitely without consuming attempts
- Streak increments on consecutive daily game starts, tracked in `snake_streak_count`

## Toast Timer Sharing
- `window.achToastTimer` and `window.lvlToastTimer` are shared global timers used by achievements, level-ups, daily completion, and cosmetic unlocks
- When two toast systems fire in sequence (e.g., `checkAchievements()` + `checkDailyCompletion()` both from `gameOver()`), the second toast's `clearTimeout` on the shared timer suppresses the first toast's display

## Game Loop — Restart Helper
- `restartGameTimeout()` must call `stopGameLoop()` (which clears `gameTimeout` to null) before `scheduleNextTick()` — without the null-reset, a stale timeout handle lingers and calling `clearTimeout()` on it is a silent no-op. Do NOT write to `gameTimeout` directly; always use `stopGameLoop()`.

## Module Scope (no IIFE)
- Game code lives at plain `<script>` top-level scope (no IIFE wrapper). `function`/`var` declarations become `window` properties; top-level `let`/`const` live in the global lexical environment — accessible by bare name, but NOT as `window.*` properties.
- Tests use Playwright `page.evaluate(() => …)` and reference these by bare name (e.g. `snake`, `gameMode`, `triggerEvolutionIfReady`, `EVOLUTION_TIERS`). This works for both `let`/`const` lexical globals and `function`/`var` window globals.
- Consequence: any top-level `let`/`const` referenced before its declaration — or any typo'd identifier at module init — throws at load and halts the ENTIRE script (see "Load-Time Bindings"). Run `node test-bugfixes.mjs` ("No JS errors on load") as the first smoke check.

## Dual Render Loops — rAF Write Boundary
- The rAF loop's timer-decay section (lines ~1346-1352) writes `flashOverlay` from `levelUpFlash` and `snapLevelUpFlash` decay — this is a write to visual state inside the read-only rAF loop. Legitimate since it only writes the `flashOverlay` object (visual state), not game-logic state, but the pattern is fragile: any future code adding a `flashOverlay` write in this section creates a write-contention risk with the game-tick `flashOverlay` writes in `updateGame()`.
- `flashOverlay` is written by BOTH the game tick (food eat, combo milestone, line ~2229) AND the rAF loop (level-up decay). They coordinate implicitly through `levelUpFlash` timer overlap. If both write in the same frame, the rAF's level-up flash overwrites the game-tick's food-eat flash. Documented pattern, not a bug, but fragile.

## Canvas Save/Restore — Sub-Function Leaks
- **STALE NOTE, CORRECTED IN v12:** the old claim that `drawOverlay()` leaks text state is no longer true — it wraps correctly (save at the top, a matching restore on the idle early-return, a nested pair for the pause menu, and a final restore). The rule itself still stands: any sub-function called from `drawGame()` or `animateVisuals()` that modifies text/alignment properties MUST wrap in save/restore.
- Common leak pattern: `ctx.textAlign = 'center'` and `ctx.textBaseline = 'middle'` in overlay/draw functions without save/restore. These persist into subsequent canvas text operations and silently misalign labels.
- `drawSnake()` mutates `ctx.globalAlpha`, `ctx.fillStyle`, and `ctx.strokeStyle` without save/restore. Safe because drawGame sets what it needs per frame, but fragile on exception paths.

## Draw Order — HUD Elements
- Background HUD (`drawMuteIndicator`, `drawXPBar`, `drawPrestigeBorder`) renders between grid and obstacles, at grid depth. This is intentional — they sit on the background behind game content. The core game-draw order (grid → obstacles → food → snake → trails → overlays → flash) defines only the game-content layering; HUD elements interleave at grid depth and do not follow the same sequence.

## Food Generation — Rival Segments in the Board-Full Guard
- **STALE NOTE, CORRECTED IN v13:** the old text here described a two-source read via `rivalActive`/`rivalSnake`/`rivalLength`. **None of those symbols exist any more** (the v5 refactor replaced them with the `rivals[]` array). The guard is now `currentSnake.length + obstacles.length + extraFoods.length`; there is no separate rival-length term to double-count.
- Rule that still holds: **every caller must pass a complete `currentSnake` that already includes rival segments when they should count toward board capacity.** Callers do this with `snake.concat(rivalCombinedSnake()).concat(extraFoods)`.
- `test-bugfixes.mjs` pins that `generateFood` no longer references `rivalLength` — that is the surviving enforcement of this rule.
- Caller list (all pass `snake.concat(rivalCombinedSnake()).concat(extraFoods)` or the equivalent): the rival's own eat block (`updateRival`), the quit-to-idle reset, `resetWaveState`, the bomb eat, the primary food-eat block, the portal-twin regen, and the passive regen. (`startGame` does not call `generateFood` directly — it reaches it through the reset path.)

## Rival System — Collision Contract (v13, load-bearing)
- **The rival moves FIRST in `updateGame()`.** The respawn-timer loop, the `updateRival` loop and the `if (gameState !== 'playing') return;` guard sit immediately after the `rivalFreezeMs` decay at the TOP of the tick, not at the tail. This is what makes the player's collision test at `checkPlayerDeath` compare against the rival's **post-move** body. The old tail position meant the two were never compared at the same instant — which produced the inverted collision: charging a rival head-on **destroyed the rival and credited a kill** instead of killing the player.
- **Never move that block back to the tick tail.** If it must move, the three contact rules below all become stale-positional again.
- **The contact rules are the arena spec's, restored verbatim** (`docs/superpowers/specs/2026-05-18-snake-living-arena-design.md` §Feature 1): player head → rival body/head = player dies; rival head → player **body** = rival dies (credited + rewarded); rival self-collision = rival dies (NOT credited). There is **no mutual destruction** and **no `rivalHeadOnIdx` flag** — an earlier design draft proposed both and both were proven wrong in review (the flag could never be consumed, because the branch that set it called `removeRival`, which cleared `active` and emptied the body).
- Rule 2 lives in `resolveRivalRams()`, called once immediately **after the player's move is committed** so `snake` is the real post-move occupancy. It is **not** called on a tick that consumed a Phoenix/streak-charge teleport: the teleport relocated the player *into* the board rather than being rammed, and the rebuilt three-tile body is laid down without an occupancy check, so resolving rams there could credit a kill the player never earned. The rebuild also stops before a rival segment (its only `findFreeTile`-vetted tile is the head).
- **Rule 2 skips the rival rule 1 already adjudicated this tick** (`rivalHeadContactIdx`, reset per tick in the tick prologue and set in `checkPlayerDeath`'s segment loop). Its scan **starts at index 1** — the head tile belongs to rule 1. The `si = 1` skip alone is NOT sufficient: in a head-on **swap** the two snakes trade tiles, so the rival's new head lands on the tile the player just left, which after the unshift is `snake[1]` — the neck. A shield cancels rule 1 *without relocating*, so that geometry paid a credited, rewarded kill (+1 defeat, +50 score) on a build where the base gave none. Both guards are needed; the head-tile skip covers a non-swap contact, the index suppression covers a swap.
- **The death cause distinguishes the two lethal geometries:** `'You charged the rival head-on!'` (190px) vs `'You ran into the rival!'` (133px). A head-on is the rival's head on the player's **head**, or on the tile the player just **vacated** (`prevSnake[0]`) — the swap. Testing "a rival head anywhere on the player's body" instead used rule 2's body-ram predicate to label a rule-1 death, mislabelling ~7% of them and firing the `ram its SIDE` toast on deaths that were already a side ram. `test-v13.mjs`'s B16 pins the toast. **Known limitation, deliberate:** when both heads step into the same previously-empty tile (a mutual perpendicular convergence), neither actor "charged" the other, so the string reports the charge wording. Both strings would be wrong there and the actionable advice ("ram its side") is the same either way, so this is not special-cased. One shared string taught the player nothing about a rule that v13 made lethal, and `gameOver()` clears `rivals` so the death frame shows no rival either. **Keep both strings short:** the recap card is a fixed 320px and a descriptive form ("…— hit its side instead!") measures 323px at `bold 13px Arial`. The counterplay itself is taught by a one-shot `snake_has_seen_rival_head_on` toast.
- Testing it from inside `updateRival` instead would read the player's PRE-move body, which still holds the tile the player is about to vacate — a rival merely following the player was destroyed and credited.
- **`removeRival(idx, defeatedByPlayer)` takes a REQUIRED second argument.** Credit is explicit: self-crash `false`; body ram `true`; leech `true`. Credit is the only `stats.rivalsDefeated` increment and pays the spec's reward (+50 score, +100 XP, floater, toast, `powerdown`). Before v13 the increment was unconditional, so a rival that tangled itself paid the player a defeat — with the growth bug (below) that was the dominant source of `RIVAL_SLAYER` and the 25/100 rival milestones.

## Rival System — Movement, Growth and Cadence (v13)
- `updateRival` **mirrors the player's movement contract**: pop the tail, THEN run the self test, then unshift, and grow only by eating (the vacated tail is returned to the body). The old form unshifted and popped only *past* `RIVAL_MAX_LENGTH`, so the rival gained a segment per tick of empty movement and saturated at 20 in ~19 ticks (2.3s) without eating — and its body could hold two identical cells (one food = +2 length).
- The self test therefore scans the **post-pop** array, which is the pre-move body minus the tail — the same tail exemption the player has.
- **Spawn length is `RIVAL_SPAWN_LENGTH` (3)**, laid backwards along `−dx` and truncated at the first blocked tile (snake / obstacles / its own body / `extraFoods` / `food2` / `powerUpPickup` / an on-phase hazard). The body gets the SAME occupancy set as the head tile, or the telegraph ghost would be drawn over the hoard food the player is running for.
- **The AI's 1-ply self-rejection applies to the 70% chase branch, when an alternative exists.** It filters the axis candidates against the rival's own body (indices 0..n-2 — the tail is exempt because the pop vacates it), and when every axis candidate is blocked it retries the perpendiculars. If *nothing* is free the rival takes the blocked move and self-destructs (uncounted, as self-crashes must be). The 20% "continue straight" and 10% random branches still filter only the 180° reversal, so a self-crash remains possible on those — measured residual ~0.4% of moves, 0 credited. `test-v13.mjs`'s G2 pins the chase-branch case.
- **Cadence is length-derived and tick-counted:** `moveCounter % stride`, stride 1 (≤6), 2 (7-13), 3 (≥14). This is a *balance lever*, not a fairness fix — both actors are otherwise exactly 1 tile/tick at every speed setting, because `tickInterval` scales them identically. It slows the 20-tile wall that actually felt oppressive while keeping a short rival at food-race parity. The skip is placed **before** the AI re-roll so a skipped tick cannot turn the rival in place. `moveCounter` is snapshot-additive (`r.moveCounter || 0`).
- `removeRival` no longer needs the pop; the growth is the tail push in the eat branch.

## Rival System — Spawn Telegraph (v13)
- **A rival has three states, and the middle one is new:** dead (`snake = []`, `active = false`), **materialising** (`snake.length > 0`, `active = false` — inert, drawn as a ghost with a dashed ring and a countdown arc), and active.
- **`rivalCombinedSnake()` includes materialising rivals** (`snake.length > 0`, not `active`), because a telegraph occupies its tiles as much as a live rival does: it keeps two telegraphs from stacking, keeps food from spawning underneath, and counts toward the board-full guard.
- The materialising state is built **entirely from fields that already round-trip** (`snake`, `active`, `respawnTimer`), so a mid-wind-up save/restore resumes correctly with **zero snapshot changes**. `spawnRival` is now the materialising step; the respawn loop's activation branch promotes the rival to active.
- **Dead → active still totals `RIVAL_RESPAWN_MS` (10s)**: the respawn loop calls `spawnRival` early (once `respawnTimer <= RIVAL_WINDUP_MS`) so the wind-up is carved out of the existing 10s, not added to it.
- Every spawn path goes through `spawnRival`, so `startGame`, gauntlet waves and the cascade all get the warning uniformly.
- **Activation is deferred while the player is inside `RIVAL_MIN_SPAWN_TILES`**, re-measured at the activation instant — a telegraph that activates inside the player is an ambush, not a warning. The deferral is **capped at `RIVAL_MAX_DEFERRALS`**; at the cap the telegraph is relocated and re-armed. That bounds a *stationary* camp, not a determined one: a player who follows the relocated telegraph can suppress the rival indefinitely (measured: 2000 ticks of following → 40 relocations, 0 activations). Accepted — the cost is that the player spends the run chasing a ghost.
- The wind-up decrement lives inside the respawn loop, so it inherits the `!hoardActive && rivalFreezeMs <= 0` gate (the telegraph **pauses** during a freeze but stays drawn) and the `!gauntletIntermission` gate.
- Cue vocabulary is the v12 hazard one (dashed ring + countdown arc), so one legend covers both. **Calm mode gates only the brightness ramp** — the ring and the arc are information and always render.
- `drawRivalHUD` is three-state (`Rival: N` live / `⚠ Rival in N.Ns` materialising / `Rival ⧗ N.Ns` dead). There is deliberately **no frozen `❄` state**: the collision test is not gated by the freeze, so labelling a frozen rival as stopped would be a cue that says "safe" on a lethal object.

## Rival System — Spawn Geometry (v13)
- `findFreeTile(headX, headY, opts)` now accepts an options object — `{ ignoreObstacleCap, minTiles, wrapAware, avoidExtras }` — while the **legacy boolean form (`findFreeTile(x, y, true)`) behaves exactly as before** (3 raw tiles, today's occupancy set). The five save/obstacle callers depend on that default: tightening the shared guard would silently cost a death save its only free tile on a crowded board.
- `spawnRival` passes `{ minTiles: RIVAL_MIN_SPAWN_TILES (5), wrapAware: true, avoidExtras: true }`. **The 5-tile floor applies to the HEAD tile only** — the body is laid backwards along `−dx` and gets the same *occupancy* set (snake / obstacles / own body / `food` / `extraFoods` / `food2` / `powerUpPickup` / on-phase hazards / sibling rivals) but no separation test, so a tail can land ~3 tiles from the player (measured). Survivable: the body is inert through the 1.6 s wind-up and activation defers while the player is inside 5 tiles of the head.
- **`wrapAware` is load-bearing on a wrapping board:** raw Manhattan measured "3 tiles away" for a tile 1 step across the seam (head `(0,10)` → tile `(19,10)`: raw 19, wrap-aware 1).
- `avoidExtras` rejects `hazards` (on-phase), `extraFoods`, `food2` and `powerUpPickup`, which the predicate previously ignored — a rival could materialise on the hoard food it was about to be announced next to.

## Rival System — Accepted Behaviour Changes (v13, do not "fix" without a reason)
- **The rival's food competition now precedes the player's by one tick** — a consequence of moving it to the top of the tick. Intended.
- **`checkAchievements`/`checkQuestProgress` see the same tick's `stats.rivalsDefeated` increment** — a one-tick-earlier `RIVAL_SLAYER`/quest unlock. Accepted.
- **The Pressure Cooker shrink kill (`advanceShrinkZone` from the rival's eat block) now evaluates the PRE-move head.** This **matches the two existing callers** — the `shrink_zone` timer and the rapidDoom hunger pop both run in the tick prologue, ahead of the player's move — so the rival path is now consistent with them instead of the odd one out.
- **A freeze STARTED later in the same tick** (the Pigment Rush climax writes `rivalFreezeMs`) has not yet been observed, so the rival takes one further move on that single tick. Bounded and rare.
- **The gauntlet tick that COMPLETES a wave gives the rival one extra move.** The rival block sits above both the intermission `return` and the four wave-objective `return`s, so on the tick an objective is met the rival has already stepped. Player death is still resolved normally (the player's collision test runs before the objective check), and the following ticks are frozen by the `!gauntletIntermission` gate. Documented rather than gated: gating it would move the objective check above the rival block and complete waves a tick earlier, which is a larger behaviour change than the one it removes.
- **A telegraph held open by the activation deferral renders `⚠ Rival in 0.0s`** for up to `RIVAL_MAX_DEFERRALS` ticks. The countdown arc is full and the dashed ring is drawn, so the cue still reads as imminent — which it is; the rival is held only because the player is standing inside the spawn radius. Deliberately not special-cased: a "held" string would flicker for the one-tick deferrals a passing player triggers.
- **The shield save leaves the player's head on the rival's tile** (it cancels the hit without relocating, unlike phoenix/streak-charge which set `teleportSavePos`). This is the shield's existing uniform semantics for obstacles and self-collision too, so it is documented rather than changed — and `resolveRivalRams` skips the head tile precisely so it is never scored as a ram.
- **`removeRival`'s second argument is mandatory by contract, not enforced.** All three call sites pass it (`false` for a self-crash, `true` for a body ram and for the leech); a forgotten argument silently credits nothing rather than throwing.
- **The crowded-board spawn re-arm retries every ~4 ticks (~480 ms), not the 2000 ms the code suggests.** The failure path runs after the timer has already crossed below `RIVAL_WINDUP_MS`, so the pre-empt branch re-enters it almost immediately and the timer holds around `RIVAL_WINDUP_MS - 4·tickInterval`. The invariant holds (never stuck, never active, always retrying — 40 relocations over 2000 ticks on a permanently-full board) but each retry costs 50 `findFreeTile` attempts.
- **The rival's AI does not STEER around obstacles either** (it is immune to them, so it walks through). The v4 AI rejected `selfCollision || obsCollision`; v13 restored only the self half. The rival is still immune by design, but "drives through solid geometry" undercuts the legibility goal on obstacle-heavy boards. A ~3-line change (add obstacles to the 1-ply candidate filter, with the existing fallback) is the v14 candidate; it is deliberately not in v13 because the obstacle interaction is documented as out of scope for this cycle.
- **The rival stays immune to obstacles and hazards.** A design statement ("a spirit the board does not constrain"); making it obstacle-aware re-introduces the v4 trapped-rival rule as a whole sub-feature. `findFreeTile`'s other predicates remain inconsistent with each other by design (`findPortalTile` and `snapToFreeTile` use different occupancy sets).
- **`gameOver()` still clears `rivals`** before the death frame; the recap card names the cause.
- **`double_rival` is gated on `rivalEnabledInMode()`** — classic / timeAttack / gauntlet — and `pickDraftOptions` drops it where the rival cannot exist. It was previously draftable in Zen/Walled/Painter/Snap and in the Gauntlet, where no second rival ever spawned: an advertised mutator that did nothing. (Daily never reached the draft screen at all — it is gated out before `pickDraftOptions`.) The filter falls back to the unfiltered pool if it would empty it, so a degenerate unlock set cannot produce a NaN draft selection.
- **The `leech` drain has TWO removal clauses and they must NOT share a guard.** (1) `rival length <= 1` after the drain — **unconditional**, exactly as in the base build (`if (rivals[rci].snake.length <= 1) removeRival(rci)`): you drained it to nothing, so it is gone and the segment test below can no longer kill you. (2) `the rival's head left on the player's head tile` — requires **`movedThisTick`**: the rival is still standing (>= 2 segments) and its head occupies the player's tile, so the segment test would kill the player, but only a rival that *moved* got there on its own. A stationary rival (cadence stride skipped, or frozen by the hoard/Pigment Rush) keeps its head on the tile the player charged into, and resolving that as a kill survived-and-collected a contact the unbrewed player dies on — flipping on the rival's invisible `moveCounter`, the same phase-dependent "sometimes I run through it" texture this cycle exists to remove. When the rival DID move, its pre-move body cannot hold the tile it now occupies (that would be a self-hit), so the base build also survived the charge and removed the rival: base-consistent, with only the reward new.
  - Gating clause 1 as well is a **regression** (shipped, then caught in review): a frozen rival of length <= 4 drained to nothing left the player dying with the drain already applied — the "the counter backfires" defect this cycle deletes. `test-v13.mjs`'s B18 pins it; B17 cannot, because every B17 fixture uses a length-7 rival where the drain leaves 4 and clause 1 is unreachable.
  - **Never test the whole body** either: the leech window is the 3x3 box around the rival's head, so its neck is always inside it, and a whole-body test made a plain charge (the snakes swap tiles, landing the player on the neck) survive a contact that kills you without the brew.
  - **Geometries are pinned individually** because they are different tests: moving-convergence and adjacent by B7/B7c/B7d, the swap by B7/B7b, the **stationary** case (cadence skip + freeze, long rival) by B17/B17b, and the **drain-to-nothing on a stationary short rival** by B18.
  - The descriptor reads "Steal 3 segments on head-to-head; destroys a rival that steps onto your tile" — clause 2's case; a rival you drained to nothing is removed by clause 1 without stepping onto anything.

## v13 Verification Notes
- `node test-v13.mjs` — 90 assertions, the rival suite (the sweep total is 264 across 13 suites). Behavioural throughout: it drives the real `updateGame()`/`updateRival()` and asserts observable outcomes (`gameState`, `lastDeathCause`, `lastSaveEvent`, the `stats.rivalsDefeated` delta, score, body contents, counted draw calls).
- **A canvas save/restore DEPTH assertion cannot see an invisible cue.** v12's depth-returns-to-0 check passes on a frame where the drawing branch never executes, so `test-v13.mjs` counts `fillRect`/`arc` calls against a no-rival baseline for the telegraph, and keeps the depth **plus** dash/alpha/transform check alongside it (the telegraph sets a dash pattern, and depth-0 survives a leaked dash).
- **Differential evidence:** running `test-v13.mjs` against the pre-v13 build (`e2851ac`) gives **56 fail / 30 pass**, and the pass/fail SET is now identical across runs — the D5/D6/D7 spawn-loop fixtures pin `seedPrng` with `mulberry32`, because a single-sample fixture on live randomness can pass by luck on a build where the predicate does not exist yet (that is what made this figure wobble between 55/25 and 57/26 in review). **Re-derive it per revision**; the figure moves with the suite and must never be quoted from an earlier commit.
- **Feedback is real but easily mistaken for a bug in tests:** `updateGame`'s passive food regen repopulates a nulled `food`; `roadStraight()`-style PRNG overrides leak across `page.evaluate` calls and make `findFreeTile` sample one tile 50 times and return `null` (so no rival can ever spawn) — `test-v13.mjs` restores the pinned original every run.


## Speed Boost System
- Speed food changes are TEMPORARY and interact with PERMANENT speed modifiers (slowMo). Never store a snapshot of `tickInterval` and restore it later — intermediate state changes (slowMo activate/deactivate) make the snapshot stale. Always recompute from `getEffectiveSpeed()` at restoration time.
- Timed counters (`speedBoostCounter`) must decrement EVERY game tick, not only when the triggering event (food eat) occurs. Placing the decrement inside a conditional handler means the timer pauses when the event stops firing.
- Speed food sets `tickInterval = Math.max(MIN_SPEED, getEffectiveSpeed() - 30)` — the offset is always relative to `getEffectiveSpeed()`, which accounts for slowMo. This way slowMo activates and deactivations automatically adjust the boosted speed target.

## Magnet Power-Up — Wrap-Aware Distance
- The magnet pull uses Manhattan distance to move food toward the snake head. On a wrapping board, raw coordinate subtraction gives the WRONG direction when food is near a map edge (e.g., food at x=380, head at x=20: raw dx = -360, but shortest path is +20 across the wrap boundary).
- Always compute wrapped delta: if `|dx| > CANVAS_WIDTH/2`, the shortest path wraps. Use `dx = dx > 0 ? dx - CANVAS_WIDTH : dx + CANVAS_WIDTH` to get the true shortest-axis direction.

## Touch Controls — Android Chrome `click` Suppression
- `touchstart.preventDefault()` with `{ passive: false }` suppresses the synthetic `click` event on iOS Safari but NOT on Android Chrome. A `_touchDispatched` flag is required as a second defense: `touchstart` sets it to true, `click` checks it and returns early without dispatching.
- The `_touchDispatched` flag must be declared at module/script scope outside the `forEach` closure, because the click handler is a separate event callback that runs on a different event-loop turn. Inside the `forEach` callback, both the `touchstart` and `click` closures share the flag — this works because of closure capture, but the flag must be `let` at the top of the `querySelectorAll(...).forEach(...)` block.
- If the flag is declared once outside the `forEach`, it's a single global that ALL buttons share. This is intentional — only one touch interaction can be in flight at a time on a phone. If two buttons were touched simultaneously (extremely unlikely), the flag would suppress the second button's click, which is the correct behavior.

## State Management — Specific Bypasses
- `helpOverlayVisible` toggle (H key, lines ~2878-2888) has no `gameState` guard. During gameplay, it fills the canvas with `rgba(0,0,0,0.85)` while the game continues running — the player may die without seeing it. At gameover, it obscures the game-over screen.
- `Escape` key handler checks `gameState === 'gameover'` before `helpOverlayVisible`, so pressing Escape during an open help overlay at gameover transitions to idle instead of closing help first.

## Progression Systems — Zen Mode Gap
- `endZenSession()` calls `finalizeSession(true)` but does NOT call `checkAchievements()` or `checkDailyCompletion()`, unlike `gameOver()`. Zen-mode achievements that depend on session-end state (`CENTURY`, `ZEN_MASTER`, etc.) only trigger on food-eat ticks via `checkAchievements(score)` at line ~2276. If the player's last food-eat didn't trigger the condition, quitting Zen mode won't check it.
- `gameOver()` and `endZenSession()` are parallel session-end paths. Any new feature that adds session-end logic must be added to BOTH functions.

## Code Clarity — playSound() Switch Case
- `playSound()` can have duplicate `case` labels without a JavaScript error — the second case is simply unreachable dead code. The switch at lines ~1109-1206 had two `case 'combo_milestone':` blocks. The first (ascending C5→E5 arpeggio) always fires; the second (sustained 660Hz tone) never does. This makes the code confusing: a reader at line 1197 assumes that case is active.
- When adding new sounds to `playSound()`, grep for the case label first to check for duplicates.

## Walled Mode
- `wrapPosition()` checks `MODE_CONFIG[gameMode].wrap`. When `wrap: false`, it returns the raw (unmodified) position. The wall death check in `updateGame()` detects out-of-bounds positions.
- All modes with `wrap: true` (Classic, Time Attack, Zen, Daily, Snap) continue to wrap via the existing modulo arithmetic.
- Obstacles are disabled in Walled mode — walls are the obstacle.
- Rival snake disabled in Walled mode.
- Power-ups disabled in Walled mode (magnet wrapping logic conflicts with non-wrapping board).

## First-Time Onboarding
- `welcomeOverlay` flag initialized from `saveManager.get('snake_has_played', '')` at page load
- `drawWelcomeOverlay()` renders a 3-panel overlay with controls (keyboard vs touch-adapted), food info, and progression info
- Overlay dismissed on any keypress (idle state): sets `saveManager.set('snake_has_played', '1')`, then falls through for normal key processing (Enter starts game immediately on first press)
- On mobile: touch/click dismisses WITHOUT dispatching Enter (prevents accidental game start)
- `drawWelcomeOverlay()` MUST use `ctx.save()`/`ctx.restore()` for all text rendering per canvas save/restore discipline
- The welcome overlay only renders when `gameState === 'idle'` and replaces the normal idle screen entirely

## Pause Menu
- When `gameState === 'paused'`, the overlay shows three selectable options: Resume, Restart, Quit to Menu
- `pauseMenuSelection` tracks the currently highlighted option (0-2), reset when entering pause state
- ArrowUp/ArrowDown navigate; Enter selects; Escape cancels confirmation or resumes
- P/Space still toggles pause regardless of menu selection
- Confirmation sub-prompt (`pauseConfirmPending`/`pauseConfirmAction`) for Restart and Quit — shows Yes/No buttons
- Restart and Quit from pause do NOT count as deaths (no `totalDeaths++`, no `finalizeSession()` call)
- Touch hit regions on canvas for each menu item; also works during confirmation sub-prompt
- `pauseMenuSelection`, `pauseConfirmPending`, `pauseConfirmAction` must be reset in both `resetGame()` AND on entering paused state
- All pause menu text rendering must be wrapped in `ctx.save()`/`ctx.restore()`

## Obstacle Patterns & Progressive Spawning
- `OBSTACLE_PATTERNS` defines 5 pattern types (single, h_left, h_right, v_down, v_up) with weighted selection
- `generateObstacles()` places patterns as tile groups; if placement fails, falls back to single tiles
- `findFreeTile(headX, headY)` checks 3-tile Manhattan distance from snake head, snake body, obstacles, food, and rival
- Progressive obstacles spawn every `OBSTACLE_SPAWN_INTERVAL` (200) game ticks in Classic and Time Attack modes (excluded in zen, walled, daily)
- New obstacles have flash animation (1-second orange fade in `drawObstacles()`) and a toast ("⚠ New obstacles!")
- `MAX_OBSTACLE_PERCENT` (0.20) caps total obstacle count to prevent board filling
- `newObstacleFlash` array and `newObstacleToastTimer` are visual state (rAF-decayed), not game-logic state — follows rAF write boundary rules


## Evolution System (v7)
- `EVOLUTION_TIERS` (4 tiers: Swift@10, Serpentine@25, Titan@50, Apex@100) grants a permanent per-run bonus at each length milestone. Bonuses are CUMULATIVE — reaching Titan still keeps Swift's speed bonus, etc. The visible body morph reflects only the highest tier reached.
- Per-run state: `evolutionTier` (-1 = none) and `obstaclePassUsed` (Serpentine). Reset in BOTH `resetGame()` AND `resetWaveState()` (gauntlet waves reset the snake, so evolution must reset per wave too).
- Evolution is triggered by `triggerEvolutionIfReady()`, called after EVERY snake growth site — both the main food-eat block AND the Echo-brew `food2` block. The helper loops (`while`) so a multi-tier jump (e.g. food2 stacking) is handled, though normal food grows by 1.
- **Death interception order is explicit:** Shield → Vampire/Phoenix brew → Serpentine obstacle pass → actual death. The Serpentine branch sits inside `checkPlayerDeath()`'s `checkCollision()` true-branch, after the Vampire save and before the death return. `checkCollision()` MERGES obstacle + self collisions, so the Serpentine branch gates on `isObstacleCollision(wrappedHead)` (a separate obstacle-only helper) — otherwise it would wrongly save self-collisions. The pass is obstacle-only and one-use per run.
- **Swift speed direction gotcha:** `getEffectiveSpeed()` returns the tick interval in MS (smaller = faster; confirmed by slowMo doing `*2` = slower and speed-food doing `-30` = faster). A "+5% speed" bonus therefore DIVIDES the interval by `(1+speedBonus)`. The v7 impl plan's `speed *= (1+bonus)` was inverted (would slow the snake). The bonus is recomputed live every call, so it needs no snapshot/restore across slowMo changes (same pattern as the Speed Boost System).
- **Titan food proximity only matters with Rampage:** `generateFood()` reduces the active `minFoodSpawnDist` cap by `EVOLUTION_TIERS[2].foodProximity`. When Rampage isn't equipped, `minFoodSpawnDist` is `null` and Titan has no spawn effect by design (the design scopes it as "stacks with Rampage"). Note: `generateFood()`'s `MAX_ITERATIONS` fallback (linear free-tile scan) bypasses the proximity cap, so on a near-full board Titan's constraint can be violated — only test the cap with fractions, not maxima.
- **Apex combo floor:** on a broken eat window the combo resets to `EVOLUTION_TIERS[3].minCombo` (2) instead of 0. The next eat then climbs 2→3 and re-fires the x3 milestone naturally. `2` is deliberately NOT in `COMBO_MILESTONES` (`[3,5,7,10,15,20,30,50]`), so the floor itself never spuriously fires a milestone.
- **drawSnake morph discipline:** the evolution glow (`ctx.shadowBlur`/`shadowColor`) is set per segment right before the fill and reset to 0 immediately after, so the high-contrast outline and `drawEyes` stay crisp — follow the canvas save/restore rule. `segSize`/`segPad` encode the per-tier body cell (Swift = TILE_SIZE-2 padded; Titan/Apex = TILE_SIZE filling the cell); the Serpentine sine-wave bob (`wavyY`) applies to body segments only (index > 0), never the head.

## Quest Board (v7 Feature C)
- 3 daily + 3 weekly missions, deterministic per day/ISO-week seed (`generateQuests(period)` → `mulberry32(hashString(getDayString()|getISOWeekString() + '_quests_' + period))`). Same seed string → same 3 quests, picked as distinct templateIds from the period's pool. Run `node test-quests.mjs` to verify determinism.
- `QUEST_TEMPLATES` (20) is the config authority. Each template has `daily`/`weekly` target pools (empty pool = not offered that period), a `progressKey`, and `xpDaily`/`xpWeekly`. `QUEST_PROGRESS_MAP[progressKey](quest)` reads the live value; param-driven keys (`modeScore`, `modePlayed`) inspect `quest.param`. **Every template's progressKey MUST have a map reader** — the test suite enforces this invariant.
- **Progress is per-run-best, NOT cumulative across runs** (mirrors the existing daily-challenge semantics): `checkQuestProgress()` does `progress = Math.max(progress, current)`. So "Score 200+" completes when ANY single run that period hit 200; it does not sum partial runs. Run-based metrics (score, snakeLength, maxCombo, timeAlive, foodEaten, speedFood, bonusFood) track the best run; boolean metrics (modePlayed, mutatorUsed, brewUsed) latch once true.
- **`checkQuestProgress()` is a parallel session-end hook (AGENTS.md contract):** it MUST be called from BOTH `gameOver()` AND `endZenSession()` (per the Zen-Mode-Gap rule — both are parallel session-end paths). It is ALSO called from the food-eat block so length/food/combo movement updates live. `timeAlive`-based quests only resolve at session end because `sessionTimeAlive` is finalized in `finalizeSession()`, not mid-run.
- **`awardXP()` gates on `MODE_CONFIG[gameMode].earnXP`:** all modes currently set `earnXP:true`, so quest claims grant XP regardless of the idle-selected mode. If a future mode sets `earnXP:false`, quest XP claims from that mode's idle state would silently no-op — claims should bypass the mode check or guard against it.
- **Atomic claim:** `claimQuest(period, index)` sets `claimed`, calls `awardXP`, and `persistQuests()` synchronously (no await between them) — a crash mid-claim cannot leave a half-state. Second claim is a guarded no-op (`if (!q || !q.completed || q.claimed) return`), so it is idempotent. The claim button's inline `onclick` calls a bare-name global (`claimQuest`), which works because `function` declarations at top-level scope become `window` properties (see Module Scope).
- **Midnight boundary:** staleness is checked ONLY at page load (`syncQuestState()` after `syncDailyState()`) and on idle-screen render (`syncQuestState()` inside `updateMenuFooter()`), NOT during gameplay — a midnight rollover mid-run keeps the prior day's quests active until the run ends. A stale stored date triggers regeneration, which RESETS `completed`/`claimed`/`progress` for the new period (regenerated quests are identical to the old ones because generation depends only on today's date — the reset of completion/claim state is the observable signal).
- **Persistence keys:** `snake_daily_quests`, `snake_weekly_quests` (JSON arrays), `snake_daily_quest_date`, `snake_weekly_quest_date` (date strings). `persistQuests()` writes all four; `checkQuestProgress()` only persists when something changed (avoids 4 writes/food-eat).
- **Rewards are XP ONLY** (never mutator tokens) per design review — flooding the token economy would destroy its scarcity. The `DAILY_CHALLENGES` system (separate, daily-mode-only) remains unchanged; quests are an orthogonal always-on system.
- **Panel:** `#questsPanel` follows the cosmetics/achievements DOM-panel pattern (toggle via `showQuestsPanel()`, `Q` key idle/gameover only — blocked during `playing`). Every `show*Panel` function and `closeAllPanels()` hide `questsPanel`; `showQuestsPanel()` hides all siblings. Adding a new panel requires adding the cross-hide line to every existing show function (the pattern is explicit cross-hiding, not a shared helper — do NOT refactor to a shared `hideAllPanels()` without cause).

## Visual Polish Pack (v7 Feature D)
- **D1 food spawn pop + idle bob:** `generateFood()` (and the inline Echo-brew `food2` spawn) sets `food.spawnTime = performance.now()`. `drawFood()` computes `spawnScale = easeOutBack(elapsed/250)` for the first 250ms, then applies per-type idle bob (circle=vertical wobble, diamond=rotation, rare/epic=pulse, chevron=horizontal drift). The whole shape block is wrapped in `ctx.save()` → `translate(cx+bob)` → `scale(spawnScale*bobPulse)` → `rotate(bobRot)` → … → `ctx.restore()`. **Shapes draw at the LOCAL ORIGIN (0,0), not cx/cy** — any new food type added to the switch MUST draw at origin or it will be offset/scaled wrong. The letter labels render AFTER the restore at absolute cx/cy (no transform) for readability.
- **D2 ambient grid breathing:** a radial gradient centered on `snake[0]` with alpha `0.04 + 0.03*Math.sin(renderTime*0.002)` is drawn in `drawGame()` right after `drawGrid()` and before `drawPaintGrid()`, gated on `gameState==='playing' && snake.length>0`. It sits inside the play-area clip.
- **D3 post-FX replaces drawSlowMoTint:** `drawSlowMoTint()` was deleted; its job (and more) is now done by `drawPostFX()`, called as the LAST thing in `drawGame()` (before the flash overlay, which renders in `animateVisuals`). It draws an always-on vignette (transparent center → 0.15 black edges), a slow-mo purple tint when `slowMoActive`, and a death-vignette crush (`gameState==='gameover' && shakeTimer>0`) that intensifies as `shakeTimer` decreases. Uses `source-over` — `multiply` is NOT a valid Canvas 2D composite op.
- **D4 death fragments REPLACE death particles:** `gameOver()` no longer calls `spawnParticles()` for the death burst. Instead it iterates `snake[]` tail-first, pushing one `deathFragment` per segment into `deathFragments[]` with a per-segment `delay` so the decay ripples tail→head. Fragments use the SNAKE'S OWN SKIN colors (head segment larger/brighter) — NOT the `DEATH_EFFECTS` cosmetic color (that config is now vestigial for the death moment; it still cycles in the cosmetics UI panel). `ghost`/`rainbow` skins get representative colors (rainbow bursts per-segment hue). Capped at 400 fragments. Rendered in `animateVisuals()` between particles and floaters with `globalCompositeOperation='lighter'` for additive glow; **the `ctx.save()`/`ctx.restore()` around the block MUST stay paired** — removing restore leaks `lighter` composite + `shadowBlur` into every subsequent draw. Updated with delta time (frame-rate independent): `delay` and `life` decay via the rAF `delta`. `deathFragmentsActive` gates the render scan. Cleared in BOTH `resetGame()` AND `resetWaveState()` (gauntlet waves reset the snake, so a stale death sequence must not carry across waves).

## Load-Time Bindings (v7 fix)
- `hasTouch` (touch-device boolean) was referenced at module-init (`let isMobile = hasTouch || ...`) since the v5 refactor but never declared, throwing a ReferenceError that HALTED the entire game script on load — every later `let`/`const` landed in the temporal dead zone and the game never initialized. Fixed by declaring `const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)` before its first use. Any future module-init expression that references an undeclared identifier has the same game-breaking effect; run `node test-bugfixes.mjs` ("No JS errors on load") as the first smoke check.

## HiDPI/Retina Canvas Scaling (v8 A)
- `DPR` is a module-scope `let` (`Math.min(window.devicePixelRatio || 1, 3)`), NOT a const — `resizeCanvas` reassigns it when a window moves between displays, resizes the backing store, and nulls `gridCacheTheme` to force a rebuild.
- The base transform is set at the TOP of `drawGame()`: `ctx.setTransform(DPR, 0, 0, DPR, shakeOffsetX * DPR, shakeOffsetY * DPR)`. This is absolute, so `drawGame` is self-contained for every direct `drawGame(1)` call (~30 sites: menus, pause nav, gauntlet intermission, draft, restore, page-load) AND carries the shake when called from rAF. Do NOT add a separate `setTransform` in `animateVisuals`.
- The shake is FOLDED into the base transform via module-level `shakeOffsetX`/`shakeOffsetY` (visual state, written only in `animateVisuals`, read in `drawGame`). The old `save()`/`translate()`/`restore()` shake wrapper around the `drawGame(t)` call was REMOVED — a `setTransform` inside `drawGame` would wipe a separate translate. Calm mode (`calmModeEffective()`) and the `shakeIntensity` slider both gate the shake inside this single site.
- The grid cache (`ensureGridCache`) is DPR-scaled: `gridCacheCanvas.width/height = PLAY_WIDTH/HEIGHT * DPR`, `gctx.setTransform(DPR,...)`, and the cache key includes a `_dpr<N>` suffix. **The cache-key suffix is load-bearing** — `resizeCanvas` does NOT call `ensureGridCache`; the cache rebuilds only because the key mismatch triggers it on the next `drawGrid()`. `drawGrid()` blits with an explicit dest size: `ctx.drawImage(gridCacheCanvas, 0, 0, PLAY_WIDTH, PLAY_HEIGHT)`.

## Calm Mode / Reduced Motion (v8 B)
- `calmMode` ('auto'|'on'|'off') persists via saveManager; `calmModeEffective()` = `on` OR (`auto` AND `prefers-reduced-motion: reduce`). `prefersReducedMotion` is a `matchMedia` query with a `change` listener that sets `visualDirty`.
- Gating is INTENSITY-ONLY at choke points — timers still decay, logic state is unchanged (keeps replays/snapshots deterministic): shake (folded-shake line → 0), flash alpha (clamped ≤ 0.15 in the `animateVisuals` flash consumption block, NOT in `drainVisualQueue` which only returns the effect), food spawn pop + idle bob (gated in `drawFood()` AND the echo-brew `food2` pop path), grid breathing (skipped), death fragments (capped at 60 in the `gameOver()` spawn loop).

## Unified Settings Panel (v8 C)
- `#settingsPanel` follows the cosmetics/quests DOM-panel pattern. The cross-hide contract is now **7 sites**: `showDiaryPanel`, `showBrewsPanel`, `showQuestsPanel`, `showAchievementsPanel`, `showCosmeticsPanel`, `showStatsPanel`, and `closeAllPanels`. `closeAllPanels` now also hides `diaryPanel` and `brewsPanel` (fixing a pre-existing gap where those two were never hidden). Adding a new panel requires the cross-hide line in every `show*Panel`.
- `gridVisible` (`snake_grid_visible`) gates grid LINES only — the themed bg fill always paints (skipping `drawGrid()` entirely would remove the board background, which is baked into the cache). The cache key includes `_g`/`_bg` so toggling rebuilds bg-only vs full.
- `S` key opens settings in idle/gameover only; it MUST be placed AFTER the gauntlet-intermission block in the keydown handler so it doesn't collide with intermission's `s` navigation.
- `spawnParticles(x, y, count, color)` — the parameter is `count`, NOT `pCount`. The `particleDensity` slider scales it AFTER the `Math.min(count, 500 - particles.length)` perf clamp.

## Game-Over Recap Card (v8 D)
- `recapData` REPLACES `sessionSummary`/`sessionSummaryTimer` (both fully removed — construction in `gameOver`/`endZenSession`, the draw block in `animateVisuals`, AND the decay line in the rAF timer-decay section). When removing a decayed timer, grep for ALL three sites (build / draw / decay) or the leftover decay line throws a TDZ ReferenceError at load.
- `buildRecapData()` is called from BOTH `gameOver()` AND `endZenSession()` (Zen-Mode-Gap rule), but NOT for gauntlet deaths (`if (gameMode !== 'gauntlet')`) — gauntlet keeps its existing `drawOverlay('Run Over — Wave X/5', ...)` overlay. Gauntlet-complete shows `drawGauntletCompleteScreen`.
- `recapQuestBaseline` is snapshotted in `startGame()` (via `captureQuestBaseline()`); `buildRecapData` diffs per-quest `progress` to find the quests that moved (cap 3). `isNewBest = score > sessionModeHighStart` (the start-of-run best, NOT `modeHighScores[gameMode]` which may already be updated by `updateScoreDisplay`/`finalizeSession`). Zen shows length, no PB delta.
- `endZenSession` MUST still call `stopDrone()` + `stopPad()` (synesthesia audio) — these were easy to lose when removing the sessionSummary block that sat between them.

## Hunter Food / Fleeing Prey (v8 E)
- `FOOD_TIERS.hunter` (weight 0.05). The existing weights were REBALANCED to sum 0.95 (`common 0.40→0.37`, `bonus 0.15→0.13`) because `pickRandomFoodType` does a cumulative scan with NO normalization — hunter appended at weight 0.05 reaches band [0.95, 1.00).
- Hunter is excluded in Walled mode (`MODE_CONFIG[gameMode].wrap === false`) via TWO separate paths: the non-chaos path scans an `effectiveTiers` object filtered to drop `hunter`; the chaos path is handled SOLELY by a `shuffleFoodWeights()` filter (the chaos branch scans `chaosCurrentWeights`, NOT `effectiveTiers` — do not try to scan `effectiveTiers` there).
- The food INSTANCE is `{x, y, type, spawnTime}` — the `hunter: true` flag lives on the tier def, so movement checks MUST use `food.type === 'hunter'`, NOT `food.hunter`.
- `HUNTER_MOVE_INTERVAL = 3` is FIXED (no per-move random) so no extra food-snapshot field is needed. Movement uses `seededRandom()` for the tiebreak (NOT `Math.random()`) so seeded challenge runs stay deterministic. Wrap-aware flee math uses `PLAY_WIDTH`/`PLAY_HEIGHT` (NOT `CANVAS_WIDTH`).
- Echo-brew `food2` copies the parent food's `type` — coerce `food.type === 'hunter' ? 'common' : food.type` at the food2 spawn site so a static hunter food2 (never moves) can't spawn. Magnet pull skips hunter (`food.type !== 'hunter'`). The hunter rejection list includes `food2` and `powerUpPickup` (not just snake/obstacle/rival) to avoid stacked entities.
- `EXPLORER` stays at `sessionFoodTypes.size >= 6` (now 6-of-7 in non-Walled, all-6 in Walled) — do NOT bump to 7, it becomes uncompletable in Walled where hunter is excluded.

## Bounty Rush / Timed Contracts (v8 F)
- `activeBounty`/`bountyTickCounter` are game-logic state, written ONLY in the tick loop (`tickBounty()` from `updateGame`). The countdown ring in `animateVisuals` is READ-ONLY (never writes `activeBounty`). Bounties bank immediately on completion — NO session-end hook needed (deliberately avoids the dual `gameOver`/`endZenSession` burden); an active bounty simply dies with the run.
- Bounty windows are TICK-COUNTED (not wall-clock) — they swing under slowMo/dynamic speed; bounties never punish so farming is a non-issue. The `combo` bounty measures the LIVE `comboCount` reaching target (auto-completes if already past at spawn — acceptable), NOT a delta against `sessionMaxCombo` (which never decreases and would be uncompletable).
- Snapshot: `activeBounty`/`bountyTickCounter` are ADDITIVE fields (`data.activeBounty || null`). Do NOT bump `SNAPSHOT_VERSION` — `restoreFromSnapshot` enforces a strict version gate and would discard v1 saves; additive fields default safely. Reset in BOTH `resetGame()` AND `resetWaveState()`.
- Toast mechanism is `queueToast()` → `toastQueue` → `processToastQueue()`. The "Toast Timer Sharing" section above (referencing `window.achToastTimer`) is STALE — that symbol no longer exists; `queueToast` already serializes toasts. Bounty toasts call `queueToast`, no new timer.

## Canvas Save/Restore — New v8 Draw Functions
- `drawRecapCard()` (gameover branch of the gameover overlay), the hunter paw-print shape (new `drawFood()` case), and the bounty countdown ring (in `animateVisuals`) all wrap in `ctx.save()`/`ctx.restore()` and draw shapes at the local origin where a transform applies. Follow the existing D1 discipline.


## Save Data Export/Import (v9 A)
- `exportSaveData()` / `importSaveData(file)` are bare-name module-scope functions (become `window.*` for `onclick`). Export collects all `snake_*` localStorage keys into a versioned JSON backup (`{ format: 'snakes-backup', version: 1, ... }`). Import overwrites localStorage with a confirm dialog. Import requires a page reload to take effect (module-scope `let`/`const` are already initialized from old values). Buttons live in `renderSettings()` inside the existing `#settingsPanel` — no new panel, no cross-hide contract impact.

## Visibility-Safe Auto-Save (v9 B)
- The `visibilitychange` handler calls `saveSnapshot()` BEFORE setting `gameState = 'paused'` on tab hidden. This closes the mobile data-loss gap where `beforeunload`/`pagehide` don't fire reliably on mobile Safari/Chrome. The snapshot is only restored on explicit user action (R key or tap "Resume Run").

## Diary Seed Replay (v9 G)
- `retrySeedFromDiary(seed)` mirrors the seedField input handler's hash computation (`seed.split('').reduce(...)` form, NOT the snapshot-restore `hashString` form). Sets `seedField.value`, `activeSeed`, `seedPrng`, calls `closeAllPanels()`, returns to idle. The button appears only when `entry.seed` is non-empty. No new state, no new DOM panel.

## Combo Heat Aura (v9 C)
- `comboHeatColor(combo)` returns a semi-transparent rgba tint for combo ≥ 3 (yellow → orange → red at 15+). Applied as a body fill overlay in `drawSnake()` after the main segment fill.
- The head halo is a radial gradient drawn BEFORE the `snake.forEach` loop (z-order: halo bottom → body+evolution glow → shield aura top). Draws at ABSOLUTE head coords (like the shield aura), NOT at local origin. Alpha capped at 0.5; dimmed 50% when `shieldActive` so the shield remains the dominant head cue. Calm-mode gate: skip the pulse, keep the static tint.

## Visual Feedback Pack (v9 F)
- `transientRings[]` is a shared visual array (same pattern as `deathFragments`): delta-decayed in `animateVisuals`, capped at 50, reset in `resetGame()`/`resetWaveState()`. All pushes happen in the tick loop or event handlers (never from rAF). `pushTransientRing(x, y, maxRadius, color, maxLife, type, lineWidth)` is the helper.
- **F1 Hunter Dust**: `moveHunter()` pushes a brown dust puff at the vacated cell. Calm-mode: skip. Determinism-safe: dust is pure visual (rAF-only), never affects snapshots/replays.
- **F2 Bounty Ring Urgency**: the bounty countdown ring in `animateVisuals` oscillates radius + shifts to red when `ticksLeft < 0.3 * windowTicks`. Calm-mode gates ONLY the oscillation — the countdown arc (information) is NOT gated. Also suppressed during `hoardActive` (v9 E). Cash-in burst on bounty completion: `pushTransientRing` + `spawnParticles` at the head.
- **F3 Power-Up Shockwave**: `activatePowerUp()` pushes a one-shot shockwave ring + particle burst at the head. Calm-mode: skip the ring, keep reduced particles.

## Portal Food (v9 D)
- `extraFoods[]` is a shared module-scope array for portal + hoard foods. Every food-touching site iterates it: eat-block (after primary `food` + `food2` checks), `moveHunter` rejection, magnet pull (skip portal, pull bonus), `drawFood` (at end, calls `drawExtraFood` per entry), snapshot serialization (additive field), `resetGame`/`resetWaveState` clear.
- Epic food has `portal: true` in `FOOD_TIERS`. When an epic spawns (non-Walled only), `findPortalTile()` places a linked portal twin (min 10 tiles, wrap-aware per-axis distance) in `extraFoods[]`. Both foods get `portalLink` refs to each other.
- **Eating the portal twin grants the epic's bonus** (score + XP + stats) AND removes the primary epic `food` (regenerates a new primary food). The snake is teleported Phoenix-style: `snake = [{exit.x, exit.y}]` then grows to min length 3. The exit is `snapToFreeTile()`-ed to avoid occupying snake/obstacle/rival.
- **Eating the primary epic food** triggers the normal eat block, then `extraFoods = extraFoods.filter(ef => !ef.portalLink)` removes the portal twin.
- `drawExtraFood()` draws portal foods as two concentric counter-rotating arcs (distinct from bonus pulse) with a prominent dashed purple connecting line + directional arrow. The label block wraps in `ctx.save()`/`ctx.restore()` per the sub-function leak rule.
- Echo-brew `food2` coerces `food.type === 'portal'` to `'common'` (same as hunter). Magnet skips portal foods. `hasSeenPortal` flag gates a first-time toast (mirrors `snake_has_played` onboarding pattern).
- The primary `generateFood` call includes `extraFoods` in the collision-check `currentSnake` parameter to prevent spawning on top of existing extra foods.

## Golden Hoard Event (v9 E)
- `hoardActive`/`hoardTimer`/`hoardTickCounter`/`scoreMultiplier` are module-scope state declared early (line ~204) so Feature F can reference `hoardActive` before E is implemented. Constants: `HOARD_INTERVAL = 750` (~90s at the 120ms base tick), `HOARD_DURATION = 125` (~15s). (The v9 docs said 5400/900 — those were 60fps calibrations and were ~7x too long; corrected in the v11 audit.) `hoardEnabled: true` in `MODE_CONFIG` for Classic, Time Attack, Daily, Snap only.
- `activateHoard()` spawns 4 bonus foods into `extraFoods[]` via `generateHoardFood()` (direct placement, bypasses `generateFood`'s portal logic). Sets `scoreMultiplier = 2`, announces via `queueToast` + `queueGameEffect('flash')`.
- `endHoard()` resets `scoreMultiplier = 1`, `hoardTickCounter = 0`. Uneaten hoard foods remain in `extraFoods[]` (they're still valid bonus foods).
- **`scoreMultiplier` is inside `addScore()`** as a single outer multiplier: `score += Math.round(amount * multi * effectiveHoardMult)`. When `golden_food` mutator is active, the hoard multiplier is capped at 1.5 (Hoard + Golden Age = ×4.5 max, not ×6). Applies to ALL `addScore` calls (tier.pts, combustion, combo bonus, food2, bounty) — bounties are suppressed during hoard so bounty rewards don't fire.
- **Rival freeze**: BOTH `updateRival()` AND the rival respawn-timer decrement are gated on `!hoardActive`. A dead rival stays dead for the hoard duration.
- **Bounty suppression**: `tickBounty()` holds `bountyTickCounter` at 0 while `hoardActive` (no new bounties spawn). The urgency ring (F2) is also suppressed during hoard.
- **Post-FX golden tint**: `drawPostFX()` adds a subtle gold tint (`rgba(255,215,0,0.06)`, or 0.03 in calm mode) when `hoardActive`.
- **Snapshot**: `hoardActive`/`hoardTimer`/`hoardTickCounter`/`scoreMultiplier` are additive fields (no `SNAPSHOT_VERSION` bump). The 4 hoard foods are in `extraFoods[]` (snapshotted by D's infrastructure). Reset in `resetGame()` only (E is excluded from Gauntlet, so `resetWaveState()` is not needed).
- **No session-end hook** — the event dies with the run, like bounty.

## v10 Features

## Input Buffer Queue (v10 G)
- `dirQueue[]` (cap 2) replaces the single-slot `nextDirection`. `setNextDirection()` pushes to the queue with reverse-check against the effective tail (last queued direction, or `lastConsumedDir` if queue empty). The tick loop shifts from the front.
- Reverse-check prevents 180° self-collision: compares new direction against the queue tail (not current `dx`/`dy`), since the tail is the direction that will be in effect when the new press executes.
- Cap of 2: a 3rd press is silently dropped (2 pending turns max). Documented behavior, not a bug.
- The swipe handler already calls `setNextDirection()` — no separate edit needed (it was already routing through the function pre-v10).
- Snapshot: `dirQueue` replaces `nextDirection` (additive, no `SNAPSHOT_VERSION` bump). Restore is backward-compatible: `dirQueue = data.dirQueue || (data.nextDirection ? [data.nextDirection] : [])`.
- Reset sites: `resetGame()` and `resetWaveState()` both clear `dirQueue = []`. The tick consumption site shifts from the queue and sets `lastConsumedDir`.

## Colorblind Food Palettes (v10 F)
- `CVD_PALETTES` (protan/deutan/tritan/off) remap food-tier colors to Okabe-Ito confusion-line-safe hues. Persisted via `saveManager.set('snake_cvd_palette', 'off')`.
- `foodColor(type)` helper: returns palette color if active, else `FOOD_TIERS[type].color`. MUST be used at ALL `tier.color` read sites: `drawFood()` (shadow, fill, stroke), `drawExtraFood()` (hoard bonus), eat-block (floater, flash, particles, synesthesia), help overlay legend, painter mode `currentPaintColor`.
- Portal food uses hardcoded `#AA44FF` (not `tier.color`) — `foodColor()` does NOT affect portal visuals by design.
- Grid cache key includes `_cvd<palette>` suffix so toggling rebuilds the cache.
- Hazard Zones (v10 C) use blue/violet `#6B3FA0` as default color — CVD-safe without remapping.
- Settings UI: 4-button selector (Off/Protan/Deutan/Tritan) in `renderSettings()` via `cvdSeg()` helper. `setCvdPalette()` invalidates `gridCacheTheme`.

## Meta-Achievements (v10 E)
- `META_ACHIEVEMENTS` map (same shape as `ACHIEVEMENTS`) with `check` functions that read the module-scope `achievements` map by closure (NOT `stats`/`ctx` like base achievements).
- Evaluated in `checkAchievements()` as a second loop AFTER the base loop, INSIDE the `achievementsEnabled` guard. Base achievements unlocked in the current tick are immediately visible to meta-checks (same-tick, intentional).
- Token reward: +1 mutator token per meta (NOT a "large bundle" — avoids economy flooding per AGENTS.md Quest Board precedent). Includes `saveManager.set('snake_mutator_tokens', ...)` + `checkMutatorUnlocks()` per unlock.
- Persisted in `snake_achievements` (meta IDs namespaced `meta_*`). Auto-included in `exportSaveData()`.
- Meta `check` functions use EXISTING achievement IDs (e.g. `COMBO_3`, `COMBO_5`, `COMBO_10`, `RIVAL_SLAYER`, `SHIELD_MASTER`, `LONG_LEGACY`, `GLUTTON_II`). No new base achievements were added.

## Daily Seed Leaderboard (v10 D)
- `snake_daily_lb` — localStorage JSON map keyed by date string from `getDayString()`. Each day stores top-5 entries `{score, time, foodEaten, maxCombo, ts}`.
- Written in `finalizeSession()` (single hook — covers both `gameOver()` and `endZenSession()` paths). Gated on `gameMode === 'daily'`.
- Sort: score desc, maxCombo desc, ts asc (first-finished ranks higher on tie).
- Rendered on the idle screen when daily mode is selected (top-3 visible), below streak info.
- New localStorage key — no cross-version contamination with pre-v10 runs.

## Bomb Food (v10 B)
- `FOOD_TIERS.bomb` (weight 0.04, pts: 0, xp: 0). Rebalance: `common` 0.37→0.33 so weights sum to exactly 1.00. `pickRandomFoodType` has `return 'common'` fallback at line ~1751.
- Bomb eat branch: BEFORE score/XP/combo award. Clears obstacles within 2-tile Manhattan radius, trims rival tails by `min(3, rival.length - 1)` segments. Skips score (`addScore`), XP (`awardXP`), and stat-bucketing (uses `stats.bombsEaten` instead of `normalFoodEaten`). Combo timer continues (bomb is an eat).
- The bomb eat block is an `if (eatenType === 'bomb') { ... } else { ...normal eat... }` split inside the food-eat `if` block. The `else` closes before the food2 eat check.
- Magnet skip: `food.type !== 'hunter' && food.type !== 'bomb'` (both primary food and extraFoods paths).
- Echo-brew `food2` coerces `food.type === 'bomb'` to `'common'` (same as hunter/portal).
- Walled exclusion: non-chaos path (`effectiveTiers` filter drops `k !== 'hunter' && k !== 'bomb'`), chaos path (`shuffleFoodWeights` filter drops `(k === 'hunter' || k === 'bomb')` when `wrap === false`).
- `hasSeenBomb` first-time toast (mirrors `hasSeenPortal` pattern).
- `EXPLORER` stays at `sessionFoodTypes.size >= 6` (now 6-of-8 non-Walled) — do NOT bump.
- drawFood `bomb` case: pulsing dark-orange circle with fuse spark. Drawn at local origin per D1 discipline. Uses `foodColor('bomb')`.

## Combo Bank (v10 A)
- `comboCharges` (int, cap 5) + `comboBankSpendMode` (0=Clear, 1=Magnet, 2=Teleport). Declared beside `comboCount`. Reset in BOTH `resetGame()` AND `resetWaveState()`.
- Charge banking: in `handleComboMilestone()`, after the existing floater, on ALL `COMBO_MILESTONES` entries (not a subset). Cap at 5 — overflow shows "FULL" in HUD.
- **Spend-mode selector**: `X` key cycles mode (gated on `gameState === 'playing'` — no collision with Prestige's `X` on `idle`). `Z` key spends 1 charge on the current mode. Both are bare-name module-scope functions.
- `spendComboCharge()`: Clear (3-tile obstacle clear, cyan ring), Magnet Pulse (instant 6-tile pull with 1-tile gap, skips hunter/bomb/portal, magenta ring), Food Teleport (relocate food via `findFreeTile`, skips portal epics, yellow ring).
- Magnet Pulse is a NEW multi-step loop (NOT a reuse of the existing 1-tile/tick magnet). Instantly moves food to 1-tile gap from head (not onto head, to avoid auto-eat).
- HUD badge: `drawComboBankHUD()` called after `drawXPBar()` in `drawGame()`. Shows `⚡[Mode] x<charges>` with mode-specific color. Wraps in `ctx.save()`/`ctx.restore()`.
- `hasSeenComboBank` first-time toast on first charge banked.
- Snapshot: `comboCharges`/`comboBankSpendMode` as additive fields (no `SNAPSHOT_VERSION` bump). Restore defaults to 0.
- Zen mode: charges accrue (comboCount increments), but spend is inert (no obstacles/score). By design.

## Hazard Zones (v10 C)
- `hazards[]` array (entries: `{cx, cy, radius, phase, phaseTimer, lifeTimer, maxLife}`). Declared early (~line 205). Reset in `resetGame()` ONLY (Gauntlet-excluded, matching hoard precedent).
- `hazardsEnabled` on ALL 8 `MODE_CONFIG` entries: Classic/TimeAttack/Daily/Snap = `true`, Zen/Walled/Painter/Gauntlet = `false`.
- `tickHazards()`: called from `updateGame()` after `tickBounty()`, gated on `hazardsEnabled`. Advances phase timers (on for `HAZARD_ON_TICKS`=15, off for `HAZARD_OFF_TICKS`=10), expands/contracts radius over lifetime. Spawns new hazards on `HAZARD_INTERVAL`=3600 tick counter, cap 2 concurrent, min 4-tile Manhattan from snake head, 15s grace at run start (`HAZARD_GRACE_TICKS`=250).
- **Lethality**: lethal when `phase === 'on'` AND head within `radius`. No linger counter — the pulse cycle IS the telegraph. The off-phase is the escape window. Fair at all speeds because the player can see the pulse and time movement.
- **Death save chain**: shield → vampire → death. NO Serpentine (hazards aren't obstacles). NO Phoenix (hazard is not wall/rival death).
- `isHazardCollision(pos)`: iterates `hazards[]`, returns true if `phase === 'on'` and Manhattan distance ≤ `radius`.
- `drawHazards()`: drawn between `drawObstacles()` and `drawFood()` in `drawGame()`. Blue/violet `#6B3FA0` radial gradient (CVD-safe default). Pulsing alpha when on, dim when off. Calm mode: steady tint, no pulse. `ctx.save()`/`ctx.restore()`.
- `generateFood()`: rejects active hazard tiles in the do-while collision check. `generateHoardFood()`: does NOT reject hazards (intentional emergent tension — hoard foods can spawn in active hazards).
- `hasSeenHazard` first-time toast on first hazard spawn.
- Snapshot: `hazards` as additive field (no `SNAPSHOT_VERSION` bump). Restore: `hazards = data.hazards || []`.

## v11 Features

## Input Buffer Visualization (v11 G)
- `drawSnake()` draws directional chevrons at the snake head when `dirQueue.length > 0` (the v10 G input buffer). Chevrons are semi-transparent triangles offset 6px/11px from the head center in the queued direction, colored `#FFEE88` (CVD-safe fixed color, NOT a food tier).
- Gated on `!calmModeEffective() && dirQueue.length > 0 && gameState === 'playing'`. Reads `dirQueue` live (no new state). Wrapped in `ctx.save()`/`ctx.restore()`.
- No snapshot or reset changes — pure rendering of existing `dirQueue` state.

## Save Corruption Auto-Recovery (v11 F)
- `quarantinedKeys` (module-scope `Set`) tracks keys that failed `getJSON` parse or validation. Populated during module init (load-time `getJSON` calls).
- `quarantineKey(key)` copies the raw localStorage string to `snake_corrupt_<key>` before the bad data is overwritten. Re-quarantine guard: `if (key.startsWith('snake_corrupt_'))` returns default without re-quarantining.
- `saveManager.getJSON(key, defaultVal, validator)` now calls `quarantineKey` on parse failure or validator-fail (both the catch block and the validator-false path). Previously returned `defaultVal` silently.
- `restoreFromSnapshot` calls `quarantineKey(SNAPSHOT_KEY)` before `clearSnapshot()` on validation failure (L2642-area), so a corrupted snapshot is backed up, not lost.
- Load-time toast: after `requestAnimationFrame(animateVisuals)`, if `quarantinedKeys.size > 0`, `queueToast` fires once. The toast lists the count of corrupted keys.
- Settings: `renderSettings()` shows a "⚠ N corrupted key(s) backed up" section with an "Export Backed-Up Data" button when `quarantinedKeys.size > 0`. The button calls `exportSaveData()` (quarantined keys are `snake_corrupt_*` and included in the export filter `k.indexOf('snake_') === 0`).
- No new DOM panel (button is inside `#settingsPanel`) — cross-hide contract NOT triggered.

## Daily Seed Determinism (v11 D)
- **CRITICAL fix:** `seedPrng` was NEVER set in `startGame()` daily block before v11. `seededRandom()` (L689) falls back to `Math.random()` when `seedPrng === null`, so daily mode was fully non-deterministic — food, hazard, rival, and hunter spawns all used `Math.random()`. The daily leaderboard compared runs on different boards.
- `startGame()` daily block (after L2313) now sets `activeSeed = String(getDailySeed())` and `seedPrng = mulberry32(getDailySeed())`. This makes ALL daily `seededRandom()` calls deterministic per date.
- `resetGame()` (L2064-area) now clears `activeSeed = null; seedPrng = null;` — WITHOUT this, a daily run's `seedPrng` leaks into Classic/TimeAttack/Snap (which must stay non-deterministic). The seedField/seedRandomBtn handlers re-seed before `startGame` when the player sets a manual seed.
- Hazard snapshot: `seedOffset` is WRITTEN at spawn and serialised (build/restore). **It is never read by `tickHazards()`** — the v9 claim that it provides a deterministic per-hazard phase offset is false; v12 B's telegraph reads `phaseTimer` instead. Left in place (harmless, additive), but do not cite it as a phase control.
- Snapshot-restore caveat: `restoreFromSnapshot` (L2635-area) does NOT snapshot the PRNG stream position — a resumed daily run diverges post-restore. Acceptable for save/resume.

## Hazard Chain Bonus (v11 A)
- `hazardChainStreak` (int) + `hazardAdjacentThisTick` (boolean) are module-scope state declared near L207.
- `hazardAdjacentThisTick` is reset to `false` at the TOP of `updateGame()` (L6023) every tick, then set `true` in `tickHazards()` if the snake head is within a 1-tile buffer beyond an on-phase hazard's lethal radius (`dist > h.radius && dist <= h.radius + TILE_SIZE`, Manhattan).
- `addScore(amount)` (L1797): `hazardChainMult = (hazardAdjacentThisTick && hazardChainStreak > 0) ? (1 + Math.min(hazardChainStreak, 3) * 0.5) : 1`. The L1828 product is `var totalMult = Math.min(multi * effectiveHoardMult * hazardChainMult, 4)` — a global ×4 cap prevents ×7.5 compounding (hazard ×2.5 × hoard ×2 × pigment ×3).
- Eat block (after combo-bonus `addScore` at L6567, before `checkAchievements` at L6616): if `eatenType === 'bomb'` resets `hazardChainStreak = 0`; else if `hazardAdjacentThisTick` increments and emits a floater; else resets to 0.
- `checkPlayerDeath()` hazard branch (L6413): on hazard death, `hazardChainStreak = 0` (before the death return).
- Reset: `hazardChainStreak = 0` in BOTH `resetGame()` (L2088) AND `resetWaveState()` (L5511).
- Snapshot: `hazardChainStreak` is additive (build L2575, restore L2724). No `SNAPSHOT_VERSION` bump.
- `drawHazards()` draws a gold ring (`#FFD700`) around the adjacent hazard when `hazardAdjacentThisTick && hazardChainStreak > 0`. Wrapped in `ctx.save()`/`ctx.restore()`.

## Combo Heat → Hazard Melt (v11 B)
- At `comboCount >= 10`, entering an on-phase hazard downgrades the hit from lethal to a combo-break: `comboCount = 0`, `lastComboMilestone = 0`, `hazardChainStreak = 0`, no death. Emits particles + ring + toast "🔥 Melted a hazard!" and returns `false` from `checkPlayerDeath()`.
- Melt is HAZARD-ONLY — only the hazard death branch (L6359) gets the melt check. Self/wall/rival deaths at combo ≥ 10 are NOT melted (thematically correct: "melt" lava, not walls).
- Melt slots BEFORE shield in the hazard death path, so a high-combo player isn't punished by also consuming their shield.
- `comboHeatColor(combo)` (L5011): extended with a molten tier at combo ≥ 10 (alpha 0.4, brighter orange-red). The ≥ 15 tier is alpha 0.45 (brighter than ≥ 10).
- Inline `haloColor` ladder (L4994): `#FF6600` at combo ≥ 10 (between ≥ 7 `#FF8800` and ≥ 15 `#FF4400`). `haloAlpha` cap raised to 0.7 at combo ≥ 10.
- No new state, no snapshot change (reads existing `comboCount`).

## Death Save Chain (v11 final order, load-bearing)
- **Hazard death path** (L6359): `melt (combo ≥ 10, v11 B) → shield → vampire → streak charge (v11 E) → death`
- **Collision death path** (L6364): `shield → vampire → streak charge (v11 E) → serpentine → death`
- **Wall death path** (L6359-area): `phoenix → streak charge (v11 E) → death` (no shield/vampire — wall death has only phoenix)
- **Rival collision path** (L6444-area): `shield → phoenix → streak charge (v11 E) → death` (no vampire/serpentine)
- Serpentine is ABSENT from the hazard, wall, and rival paths (hazards aren't obstacles; wall/rival have no serpentine code).
- Melt is hazard-only.
- Streak charge is AFTER per-run saves (shield, vampire), before serpentine (obstacle-specific). This preserves per-run resources first.

## Streak Multiplier Ladder (v11 E)
- `streakCharges` (int) + `streakChargeGranted` (int, -1 sentinel) are module-scope state declared at L764-766. Persistent meta-resources (NOT reset in `resetGame`/`resetWaveState`).
- `awardXP(amount)` (L7005): `const streakMult = 1 + Math.min(0.30, streakCount * 0.01)` — +1% XP per streak day, cap +30%. Applied to `amount` BEFORE the level-20 check (L7012), so it applies to both the overcharge and main paths. Quest XP inherits automatically (calls `awardXP`).
- `startGame()` (L2353-area): re-reads `streakCharges` and `streakChargeGranted` from `saveManager`. Grants a charge at 7/14/30-day thresholds (`STREAK_CHARGE_DAYS = [7, 14, 30]`) via `streakChargeGranted < sci` check. Resets `streakChargeGranted = -1` on broken/first streak (streak resets to 1, not 0 — per codebase convention at L2304/L2325).
- `tryStreakChargeSave(wrappedHead)` (L6306, nested inside `updateGame`): if `streakCharges > 0`, decrements, persists via `saveManager.set`, repositions head to a free tile (Phoenix-style), toasts, returns `false` (saved). Returns `true` (no save) if no charges. **Auto-fire design** — no prompt; the charge is banked for exactly this purpose.
- Called in ALL 4 death paths: collision (L6344, after vampire, before serpentine), wall (L6376, after phoenix, before death), hazard (L6412, after vampire, before death), rival (L6459, after phoenix, before death).
- Snapshot: `streakCharges` is additive (build L2576, restore L2725). The snapshot stores the in-run value; the persistent source is `snake_streak_charges` save key.
- Display: streak block at L4416 (idle screen) shows "🛡×N death insurance" when `streakCharges > 0`.

## Hoard Pigment Rush (v11 C)
- `hoardPigmentCount` (int), `pigmentRushTimer` (int), `pigmentRushActive` (boolean) are module-scope state declared at L3502-3504.
- `activateHoard()` (L3508): resets `hoardPigmentCount = 0` and tags each of the 4 hoard foods with `pigment: true` when pushing to `extraFoods[]`.
- `extraFoods` eat block (L6840): on eating an `ef.pigment` food, increments `hoardPigmentCount`. At 4, sets `pigmentRushActive = true`, `pigmentRushTimer = 300` (~5s), extends rival `respawnTimer` by 3000ms, toasts "🎨 Pigment Rush! ×3 score!", flashes. `hasSeenPigmentRush` gates a first-time toast.
- `addScore(amount)` (L1823): when `pigmentRushActive`, `effectiveHoardMult = 3` (replaces hoard ×2, not stacks). With `golden_food` mutator, capped at ×2 (Golden Age + Rush = ×4 max, not ×6). The global ×4 cap from Feature A also applies.
- `pigmentRushTimer` decays in the TICK LOOP (`updateGame()`, L6114), NOT in `animateVisuals()` (rAF) — it's game-logic state (affects `addScore`).
- `endHoard()` (L3523): clears `hoardPigmentCount` but does NOT clear `pigmentRushTimer`/`pigmentRushActive` if rush is active (the rush outlives the hoard — design choice so triggering at the last second isn't punished).
- `drawPostFX()` (L5369): stronger gold tint when `pigmentRushActive` (alpha 0.12, or 0.06 in calm mode vs the normal hoard 0.06/0.03).
- `extraFoods` snapshot: `pigment: ef.pigment || false` added to build (L2571) and restore (L2721). Additive.
- Hoard snapshot: `hoardPigmentCount`, `pigmentRushTimer`, `pigmentRushActive` added to build (L2652) and restore (L2797). Additive.
- Reset: `resetGame()` ONLY (L2207 — hoard is Gauntlet-excluded, matching hoard precedent). NOT `resetWaveState()`.
- `hasSeenPigmentRush` first-time toast. Save key: `snake_has_seen_pigment_rush`.
## v12 Features

## Mutator Resonances (v12 A) — load-bearing
- **CRITICAL pre-v12 bug this fixes:** `RESONANCES` was authored in hand-written order but `detectResonance()` sorts the drafted mutators before joining them. 5 of the 8 keys were therefore **unreachable** (e.g. the table held `golden_food~chaos_seed` while a lookup of those two mutators builds `chaos_seed~golden_food`). Only the 3 keys that happened to be written in sorted order could ever match — and none of those three had a working effect, so **no resonance ever did anything**. Fixed by canonicalising the table once at load into `RESONANCE_BY_KEY` (sorted-key map); `detectResonance()` reads that. Authored order is now irrelevant.
- All 8 effects have real implementations. Rewritten descriptors live on each entry; the rule is **the name the HUD shows is a mechanic that runs**. `RESONANCE_BY_KEY` must be rebuilt (it is, automatically) if the table changes — never look up `RESONANCES` by raw key.
- **`resonanceActive(effect)` is the required reader.** The mutator blocks that consume resonance state (gravity ~L6711, phase_shift, **hunger ~L6726**) execute ABOVE the tick's resonance recomputation, so reading the `activeResonance` global there gives the PREVIOUS tick's value. Use `resonanceActive()`, which re-derives from `activeMutators`.
- **Never store cadence state on `activeResonance`.** `tickResonance()` rebuilds that object every tick (via `detectResonance`), so any field on it resets ~8x/second. All cadence state is module-scope: `intangibleWindowTicks`, `resonanceInvertTicks`, `resonanceInvertCooldown`, `resonanceToggleTick`, `resonanceMirrorSuspended`, `chaosCycleIndex`. All six are reset in BOTH `resetGame()` and `resetWaveState()`, and all six are additive snapshot fields.
- Effect map: `intangiblePhase` (Ethereal — hunger paused on phase ticks, self-collision window widened to 3-in-5, body rendered translucent); `doubleGold` (Chaos Gold — food ×2 points/XP, chaos reshuffle cadence 20→10); `rivalShrink` (Pressure Cooker — rival eat calls `advanceShrinkZone()`); `feastFamine` (Famine Feast — `hungerInterval()` 50→30, food ×4); `rapidDoom` (Apocalypse — hunger pop also calls `advanceShrinkZone()`); `chaosCycle` (Chaos Theory — one of gravity/mirror/phase_shift live per 5 ticks); `invertControls` (Quantum — axis swap, see below); `quantumToggle` (Schrodinger — alternates mirror suspension and a real `chaosCurrentWeights` reshuffle).
- **`chaosCycleAllows(name)` is an ADDITIVE gate** — always written as `mutatorIsOn && chaosCycleAllows(name)`, never as a replacement of the mutator check. A player who drafted a SUBSET of gravity/mirror/phase_shift can never enter the branch (the resonance keys on the sorted full set) and must be completely unaffected.
- **Quantum axis-swap safety is an INPUT-DOMAIN invariant, not an algebraic one.** Both input callers emit axis-aligned unit vectors, and the swap of an axis-aligned vector is its perpendicular — never its reverse, so it cannot self-kill. The code guards `(newDx === 0 || newDy === 0)` to keep that true if a future input surface yields diagonals. Do not remove that guard on the assumption that a swap can never reverse: `(dy,dx) = (−dx,−dy)` IS satisfiable by a diagonal input.
- Ordering inside `setNextDirection` is load-bearing: **axis swap FIRST, then the mirror flip.** Mirror negates `dx` alone while the swap changes which axis `dx` is, so they compose. A 180-degree rotation would cancel against the mirror exactly (the pair that owns Quantum always has mirror drafted).
- **Food multipliers are applied at the FOOD AWARD SITES** (`foodResonanceMult()` in the primary eat block, the echo `food2` award, the portal-twin epic award, the hoard-bonus award) — **never inside `addScore`**. `addScore` also serves bounties, quests, achievements, the survival drip and the session-end bonus, and the descriptors promise *food* points/XP. Keeping it out of `addScore` also keeps the v11 source-text assertions on `addScore` valid.
- `golden_food`'s ×3 is applied to `amount` **before** `addScore`'s `Math.min(totalMult, 4)` cap, so that cap does **not** bound the resonance multiplier. Reference value: one common food under Chaos Gold (no prestige/hoard/pigment) adds **exactly 60** (10 × 2 × 3); with pigment rush it is **120**, not 180, because `golden_food` caps the hoard multiplier at ×2.
- `shuffleFoodWeights()` now draws from `seededRandom()` (was `Math.random()`), closing a determinism leak that already existed for `chaos_seed` runs and that the Chaos Gold / Schrodinger resonances would have widened.
- `hasSeenResonance` fires a one-shot onboarding toast the first time any resonance goes live. Save key `snake_has_seen_resonance`.
- **The HUD resonance label shows the live state**, not just the name: `[SWAPPED]` (Quantum window open), `[MIRROR OFF]` (Schrodinger suspension), `[PHASE]` (Ethereal ghost window), or `[GRAVITY]`/`[MIRROR]`/`[PHASE_SHIFT]` (which sub-effect the Chaos Theory 5-tick window is on). The name alone was all that existed pre-v12, while the effect did nothing.
- **Ethereal's counter is the ghost window's source of truth.** `intangibleWindowTicks` is set to 3 on the phase tick and decays at the START of each later tick, so it reads 3/2/1 exactly while `skipSelfCollision` is in force — `drawSnake` keys the translucency on it. Decrementing it in the same expression that consumes it leaves the last ghost tick rendered opaque.
- **Hunger must be paused for BOTH the increment and the pop test.** Skipping only the increment leaves `hungerTickCounter` sitting on an exact multiple of the interval, so the next tick re-fires the pop that just landed: two segments lost on consecutive ticks, and a `'Starvation!'` death at length 2 on a tick the descriptor says cannot bite. Caught by `test-v12.mjs`'s 500-tick Ethereal probe (asserts 300 ghost ticks and zero consecutive length losses).

## Death Cause vs Save Event (v12 C)
- `lastDeathCause` (10 death writes) and `lastSaveEvent` (7 save writes: streak-charge, vampire×2, phoenix×2, serpentine, melt) are **separate fields**. Before v12 the save messages were written into `lastDeathCause`, so whenever a rescue was the last thing written before the run ended the recap card reported the rescue as the cause of death — most visibly in the hazard path with the Vampire brew. `lastSaveEvent` is cleared in BOTH `resetGame()` and `resetWaveState()`.
- `endZenSession()` sets `lastDeathCause = 'Zen session ended.'` explicitly; it previously wrote nothing, so the card showed a stale rescue message.
- The diary's `deathCause` key (written by `saveDiaryEntry`) keeps its name and meaning — after the split it simply stops recording rescues as deaths.
- **A cause must never be written before the saves that might cancel it.** The wall and rival branches write `lastDeathCause` AFTER the phoenix/streak-charge attempts; writing it first left a stale `'Hit the wall!'` / `'You were caught by the rival!'` behind whenever a save rescued the player, and any later ending that sets no cause of its own then reported a death that never happened. The Time Attack clock ending sets `'Time's up!'` for exactly that reason.

## Cascade Disclosure (v12 C)
- `gameOver()` captures `sessionRawScore = score` **immediately before** the cascade multiply and records `sessionCascadeMult` there. `score / 0.5` is NOT a substitute: the `Math.floor` loss is unrecoverable and wrong for odd scores.
- **Decision: disclose, do not rebalance.** The ×0.5 formula is unchanged — altering it would invalidate the scale of every existing `modeHighScores` and `snake_daily_lb` entry.
- `endZenSession()` sets `sessionCascadeMult = 1` explicitly: Zen never applies the cascade (it funnels through `finalizeSession(true)` after `score = snake.length`), so deriving the factor from the drafted mutator count would render a false `Cascade ×0.5` row on a score that was never halved. Zen is draftable, so this is reachable.
- **The cascade row is gated on the FACTOR, not the mode** (`recapData.cascadeMult < 1`, not `!isZen && …`). `gameOver()` applies the cascade on a Zen death too (Zen is draftable), so keying it on `!isZen` suppressed the explanation in exactly the case that needed it: a Zen starvation death with 2+ mutators halved the length score and the card said nothing. `endZenSession()` forces the factor to 1, so a manual Zen quit still shows no row. Asserted by capturing the strings `drawRecapCard()` actually draws.
- The HUD disclosure is **appended to `drawComboBankHUD()`**, not a second badge — there is no free HUD slot (bottom-left is the combo badge and the XP bar, top-right is the mutator/resonance list). The appended part sets its own colour: inheriting the badge's `comboCharges > 0 ? … : '#555'` would render the warning near-invisible in exactly the state (`comboCharges === 0`) that v12 newly enables.
- **Known pre-existing inconsistency, deliberately not "fixed":** `updateScoreDisplay()` persists the RAW score into `modeHighScores` during the run while `finalizeSession()`'s post-cascade write never wins, so the persisted "Best" is pre-cascade while the card headline is post-cascade. The new `raw → final` row makes this visible. Changing PB semantics is a separate balance decision.
- `drawRecapCard()` uses a running cursor and derives `cardH` from the row count. The old fixed `cardH = 168` with hard-coded offsets (XP at +80, quests at +100, prompt at `cardH-22`) would have overprinted the retry prompt once the cause/save/cascade rows were added. Do not reintroduce fixed offsets.

## Hazard Phase Telegraph (v12 B)
- `drawHazards()` now draws a dashed amber pre-ignition ring when `phase === 'off' && phaseTimer <= 2`, and a countdown arc from `phaseTimer`. `phaseTimer` decrements then flips at ≤0 with a full-duration reset, so while off the rendered values are `OFF-1 … 1` — `<= 2` is exactly the two ticks before ignition.
- The cue reads `phaseTimer`, the kill check reads `phase`. Deriving the cue from the wrong field would flash "safe" while lethal.
- The pulse floor was raised (`0.28 ± 0.12`, trough 0.16) because the old trough (0.10) sat barely above the off-phase 0.08, making a lethal rift look safe at the bottom of the pulse. The solid lethal border is the other half of the cue — keep both.
- Calm mode gates the **pulse only**; the countdown arc and the pre-ignition ring are information and always render (matching the v9 F2 bounty-ring precedent).
- `drawHazards` now has **three** save/restore surfaces (hazard loop, v11 A adjacency ring, and the new cue). v11 corrupted this exact function. `test-v12.mjs` asserts the canvas `save`/`restore` depth returns to 0 on every frame across a full hazard cycle — the old single-`drawGame` "did not throw" assertion could not see that class of bug.

## Toast Pipeline (v12 E)
- `queueToast(message, duration, priority)` takes an optional third argument (`'low' | 'normal' | 'high'`, default `'normal'`). The queue is **bounded at 20** and evicts lowest-priority-then-oldest; a `high` message is never evicted while a lower-priority one exists. Identical consecutive messages coalesce.
- The hide timer is held in `toastTimerHandle` (via `scheduleToastHide`), so a coalesced repeat can EXTEND the on-screen display rather than re-showing it after expiry, and `clearToasts()` can cancel it outright. `toastGeneration` remains as a second defence: a stale callback must not hide a message queued by the NEXT run nor re-enter the drain loop.
- Coalescing applies to BOTH the queued entries and the message currently on screen.
- **`clearToasts()` is called from `resetGame()` ONLY — never `resetWaveState()`.** `completeGauntletWave()` queues "Wave N Complete!" (2000ms) and the intermission's confirm handler calls `startNextWave()` → `resetWaveState()`, so clearing there destroys the only feedback for completing a wave in the common case. A single `gameOver()` can queue ~22s of toasts from six systems, which is what `resetGame()` must clear.
- Only two code paths may write the toast element: `processToastQueue` (render) and `clearToasts` (clear). `showFoodLegend()` and `activatePowerUp()` used to bypass the queue with their own private `setTimeout`s — that corrupted any in-flight toast. `test-v12.mjs` asserts the direct-write count is exactly 2.

## Risk Income (v12 F)
- `bankComboCharge(source)` is the **single** `comboCharges++` site (cap 5). Combo milestones, bounty completions, every third consecutive hazard-chain eat, the Hoard Pigment Rush trigger, and first reaching Titan all bank through it.
- The hazard-chain source requires `hazardChainStreak > 0 && % 3 === 0`. The `> 0` guard keeps `0 % 3 === 0` from banking on a broken chain, so the rule does not depend on the increment running first.
- `triggerEvolutionIfReady()` samples `evolutionTier` BEFORE its `while` loop and banks at most one charge after it — a multi-tier jump (Echo-brew `food2` stacking) must not mint two.

## Help & Legend Truth (v12 D)
- `buildFoodTableRows()` derives the help overlay's tier table from `FOOD_TIERS`; `buildFoodLegendText()` derives the `L` legend from the same source. Neither may be hand-copied again — before v12 the overlay printed stale weights (Common 40% vs the real 0.33, Bonus 15% vs 0.13) and omitted hunter and bomb.
- Food-tier colours are looked up **by the key being rendered**, never by an array index — the old `foodColor(Object.keys(FOOD_TIERS)[i])` miscoloured the whole table the moment a tier was inserted.
- `HELP_BINDINGS` is the controls-table source. It is **hand-maintained**: add an entry when adding a binding. Context-scoped keys are labelled (`C (idle)` vs `C (draft)`, `X (playing)` vs `X (idle L20)`, `R (idle)` vs `R (draft)`, `S (idle)`).
- **Help overlay geometry — never trust a hardcoded text offset.** Two columns of 13 rows at 14px pitch, column 2 at `x = 235`; descriptions at `x + 92` (col 1) and `x + 67` (col 2). **Canvas text metrics are environment-dependent**: `'Cycle combo-bank mode'` measures 132.7px in one Chromium build and 149.1px in another, so any fixed offset that fits in one clips mid-glyph in the other — this was found and re-found across two review rounds. All help text therefore goes through `fillTextClipped(text, x, y, maxX)`, which measures at draw time and truncates with an ellipsis. `test-v12.mjs` asserts zero overflow at 1.0x, 1.15x and 1.35x simulated font widths. Do not replace it with a tuned constant.
- A single 25-row controls column is NOT an option — at 12px pitch it puts `modeY` at ~456 and the last mode row on the footer. The mode rows also ellipsise (their descriptions are full sentences).
- **Known pre-existing clipping, NOT from v12:** the mode-select screen draws `getModeDesc(mode)` centred at 13px (`snake.html` ~L4986). 'painter' (552.7px) and 'gauntlet' (517.4px) overhang a 440px canvas by 56.3px and 38.7px **on each side**. The help overlay truncates cleanly; the mode-select screen does not. Fixing it properly needs a wrap/short-form decision — deliberately left for a later cycle.

## Mirror Flip Relocation (v12 Feature 0)
- The mirror mutator's flip lives in **`setNextDirection()`**, not the keydown handler. It previously lived only in keydown, so the D-pad (which dispatches a synthetic keydown) inherited it while the **swipe handler silently ignored the mutator**. `setNextDirection` is the single choke point shared by all three input paths.
- It runs **before** the reverse-check, because that check validates the candidate direction against the effective tail.
- Gates: `chaosCycleAllows('mirror')` and `resonanceMirrorSuspended === 0`, both additive.

## v12 Load-Time Note
- `RESONANCE_BY_KEY` is built by an IIFE immediately after `RESONANCES`. It must stay after the table and before `detectResonance`'s first call. Any new module-init expression referencing an undeclared identifier still halts the whole script — `node test-bugfixes.mjs` ("No JS errors on load") remains the first smoke check, now alongside `node test-v12.mjs`.
