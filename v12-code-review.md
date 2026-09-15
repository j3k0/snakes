# Snakes v12 — Code Review

**Scope reviewed:** `git diff` of `snake.html` (818 changed lines) and `AGENTS.md` (67), read hunk by hunk and re-verified against the file; `test-v12.mjs` (791 lines, 42 assertions, `node test-v12.mjs` → 42 passed / 0 failed).

**Method.** Besides reading, three runtime probes against the real page were used, and every claim below is reproduced by one of them:

1. **Base-vs-head frame diff.** `git show HEAD:snake.html` → `/tmp/base/snake.html`; both builds are driven with an identical script (classic, pinned `seedPrng`, pinned `Date.now`, scripted turns, forced food placement) and a per-tick state vector is compared (gameState, score, snake cells, primary food, `food2`, `extraFoods`, hazards, rivals incl. bodies, obstacles, combo, charges, tier, hunger counter, session food, XP, shrink state). Result: **identical over 352 frames** with 46 player eats, 42 portal-twin frames, 233 rival eats, one evolution tier and 5 combo charges; `gravity`-only identical over 142 frames; no-mutator identical over 209 frames in a separate run. Sensitivity control: the `chaos_seed` run diverges (intended, see below).
2. **In-page probes** driving `updateGame()` / `checkPlayerDeath()` on the real build.
3. **`ctx.measureText` probe** using the same font the help overlay sets.

No file other than this review was created or modified; nothing was committed.

## Verdict

**Fix before commit.** The flagship is real — all eight resonances now have implementations, `RESONANCE_BY_KEY` makes all eight reachable, and the common no-mutator path is behaviourally unchanged (proved frame-for-frame against `HEAD`). But four shipped behaviours contradict what the game tells the player, which is the one thing this cycle exists to eliminate:

* **Most important finding: #1 — Ethereal's "phase ticks pause hunger" double-fires the hunger pop it just applied** (an extra length loss on two consecutive ticks, ~once per 125 ticks; can kill at length 2). It survives the suite because `test-v12.mjs:200-212` re-implements the two lines it is supposed to be testing instead of driving `updateGame()`.
* #2 and #4 are the same class of lie on smaller surfaces: Chaos Gold does not double echo-brew food points, and the recap card can name a rescue as the cause of death.
* #3 is a layout defect that clips two rows of the help overlay — the feature whose *only* job is to tell the truth about the game.

There is no P0 here: no state corruption, no crash, no unavoidable death, and the non-resonance game is untouched. #1 is the only P1; #2-#4 are P2 and #5-#6 are P3.

## Findings

### 1. HIGH — Ethereal's hunger pause re-fires the pop it just applied

**File:** `snake.html:6867-6872` (`updateGame`, hunger block). Introduced by the v12 `intangiblePhase` guard.

**What is wrong.** The guard skips the counter *increment* on a phase tick, but the pop test is then evaluated against the unchanged counter:

```js
if (!(resonanceActive('intangiblePhase') && gameTick % 5 === 0)) {
    hungerTickCounter++;
}
if (hungerTickCounter > 0 && hungerTickCounter % hungerInterval() === 0) {
```

Whenever a pop lands on the tick immediately before a phase tick, the counter is still an exact multiple of 50 on the phase tick, so the same pop fires a second time on the next tick. The advertised mechanic is "Phase-shift ticks pause hunger" (`RESONANCES['phase_shift~hunger_clock']`, `snake.html:899`); what ships is a *deferred duplicate*.

**Evidence** (probe: `gameMode='classic'`, `activeMutators=['phase_shift','hunger_clock']`, `hungerStarted=true`, 12-segment snake, `updateGame()` driven 200 ticks with `gameTick` pinned per tick; log of every length change, `t:counter:phase`):

```
t=62  phase=false counter=50  len 12 -> 11
t=124 phase=false counter=100 len 11 -> 10
t=125 phase=true  counter=100 len 10 ->  9     <-- the same pop, re-fired on the paused tick
t=187 phase=false counter=150 len  9 ->  8
```

Impact: under Ethereal the player loses two segments on two consecutive ticks roughly once per 100 hunger ticks instead of one. At length 2 the duplicate pop falls into the `else` branch (`snake.length > 1` is now false) and reports `'Starvation!'` — a death the mechanic says cannot happen on a phase tick.

**Fix.** Skip the pop on the paused tick as well:

```js
                    if (!(resonanceActive('intangiblePhase') && gameTick % 5 === 0)) {
                        hungerTickCounter++;
                    }
                    if (hungerTickCounter > 0 && hungerTickCounter % hungerInterval() === 0 &&
                        !(resonanceActive('intangiblePhase') && gameTick % 5 === 0)) {
```

(The suite's `A: Ethereal` assertion at `test-v12.mjs:212` will keep passing either way — see the assertion section.)

### 2. MEDIUM — Chaos Gold / Famine Feast never multiply the Echo-brew `food2` award (dead fallback)

**File:** `snake.html:7504`.

**What is wrong.**

```js
addScore(food2.pts || Math.floor(FOOD_TIERS[food2.type].pts / 2 * foodResonanceMult()));
```

`food2.pts` is set at every construction site (`snake.html:7482`, restore `snake.html:3022`) to `Math.floor(tier.pts / 2)`, which is ≥ 2 for all eight tiers, so the `||` right-hand side — the only place `foodResonanceMult()` appears in this statement — is unreachable. `impl` plan step 6 item 4 names "echo-brew `food2` (L7054)" as one of the five food-award sites, and the Chaos Gold descriptor promises "Food gives 2x points".

**Evidence** (probe: `activeMutators=['golden_food','chaos_seed']`, `activeBrews=['echo']`, head at `(100,100)` moving right, `food2 = {x:120,y:100,type:'common',pts:5}`, one `updateGame()`):

```
scoreDelta: 15   (5 x 3 from golden_food only)
foodResonanceMult(): 2   -> the descriptor requires +30
```

**Fix.**

```js
                addScore(Math.floor((food2.pts || FOOD_TIERS[food2.type].pts / 2) * foodResonanceMult()));
```

### 3. MEDIUM — The help overlay's second controls column is clipped off the canvas

**File:** `snake.html:4526-4537` (the new two-column `HELP_BINDINGS` loop; description drawn at `snake.html:4535`).

**What is wrong.** The loop lays out two columns of 13 rows, the second at `x = 235` with the description at `x + 92 = 327`, on a 440 px canvas (`CANVAS_WIDTH`). Two descriptions extend past the right edge and are cut by the canvas boundary. The design plan (step 3 item 5) and the AGENTS.md text added by this patch both specify the opposite — "a single dense controls column at 12px pitch — two columns do not fit in 440px" — so the shipped layout is not the one the docs describe either.

**Evidence** (`ctx.measureText` with `ctx.font = '12px Arial'`, the font the loop sets at `snake.html:4524`; `end = x + 92 + width`):

```
X (playing)  'Cycle combo-bank mode'  end = 460  (> 440)
Z (playing)  'Spend combo charge'     end = 441  (> 440)
```

Everything else (all column-1 rows, all 8 food rows in both columns) ends < 440.

**Fix** (keeps the two-column layout, pulls only the second description column in; the longest column-2 description then ends at 435, and the widest column-2 key ends at 292 < 302 so no self-collision):

```js
                ctx.fillText(b.desc, x + (col === 0 ? 92 : 67), y);
```

If the intent really is the documented single column, the food table and mode list must move with it — at 12 px pitch 25 rows put `modeY` at ~456, which pushes the last mode row (588) onto the footer at `CANVAS_HEIGHT - 10` (590). The one-line change above is the minimal fix.

### 4. MEDIUM — The recap card can name a rescue as the cause of death

**File:** `snake.html:3686-3687` (the new `deathCause`/`saveEvent` fields), with the defect at `snake.html:7128` and `snake.html:7041`.

**What is wrong.** `lastDeathCause` is written *before* the phoenix / streak-charge save attempts in the wall branch (`snake.html:7041`, saves at `7049` and `7052`) and in the rival branch (`snake.html:7128`, saves at `7136`/`7144`). A successful save returns without clearing the field, so it survives as a stale value; most endings overwrite it, but the Time Attack clock does not (`snake.html:6939-6940`: `if (remaining <= 0) { gameOver(); return; }`). Feature C's stated purpose is "the recap card never says what killed you"; this path makes it say the wrong thing, next to a line saying you survived it.

**Evidence** (probe on the real build: Time Attack — which always spawns rival 0, `snake.html:2624`, so no mutator is needed — `activeBrews=['phoenix']`, rival head moved onto the player's next tile, then `timeAttackEnd = 1; updateGame()`):

```
after the collision:  lastDeathCause = 'You were caught by the rival!'
                      lastSaveEvent = 'Phoenix Brew resurrected!'   (player alive)
recapData:            deathCause = 'You were caught by the rival!'
                      saveEvent  = 'Phoenix Brew resurrected!'
```

The card renders both rows (`snake.html:3759` and `3767`), i.e. "You were caught by the rival!" above "Phoenix Brew resurrected! (survived)" for a run that ended on the clock.

**Fix.** Give the clock ending a cause, and stop writing the cause before the saves have been tried.

(a) `snake.html:6940`:

```js
                if (remaining <= 0) { lastDeathCause = "Time's up!"; gameOver(); return; }
```

(b) rival branch — move the cause write below the save attempts (same edit shape at `snake.html:7041` for the wall branch):

```js
                                // v6: Phoenix Brew in rival collision
                                if (activeBrews.indexOf('phoenix') !== -1 && !brewUsageFlags.phoenixUsed) {
                                    var freePos2 = findFreeTile(wrappedHead.x, wrappedHead.y, true);
                                    if (freePos2) {
                                        brewUsageFlags.phoenixUsed = true;
                                        teleportSavePos = freePos2;
                                        score = 0;
                                        lastSaveEvent = 'Phoenix Brew resurrected!';
                                        spawnParticles(freePos2.x, freePos2.y, 25, '#FF8800');
                                        return false;
                                    }
                                }
                                // v11 E: Streak charge save (after phoenix, before death)
                                if (!tryStreakChargeSave(wrappedHead)) return false;
                                lastDeathCause = 'You were caught by the rival!';
                                return true;
```

### 5. LOW — `activeResonance` is derived from the pre-restore mutators on snapshot resume

**File:** `snake.html:3039`, versus `snake.html:3059`.

**What is wrong.** `activeResonance = detectResonance(activeMutators)` sits inside the new additive restore block at line 3039, twenty lines *above* `activeMutators = (data.activeMutators || []).slice();` at line 3059. On resume it therefore computes the resonance from the mutators the *previous* session had (normally `[]`, thanks to `resetGame()`), not the snapshot's. Effects are unaffected (they all route through `resonanceActive()`), but the HUD resonance label (`snake.html:6680`) is missing for the first frame(s) after a resume, and the first `updateGame()` silently repairs it a tick later.

**Fix.** Delete line 3039 and place the assignment after the mutator restore:

```js
                activeMutators = (data.activeMutators || []).slice();
                activeResonance = detectResonance(activeMutators);
```

### 6. LOW — Ethereal translucency misses the last of the three ghost ticks

**File:** `snake.html:5613` (`etherealAlpha`), consumed at `snake.html:6862`.

**What is wrong.** `updateGame` sets `intangibleWindowTicks = 3` and then decrements it in the same expression that consumes it, so at draw time the counter reads 2, 1, 0 across the three self-exempt ticks. `drawSnake` keys the translucency on `intangibleWindowTicks > 0`, so the third ghost tick is rendered fully opaque — the visual advertises a 2-tick window for a 3-tick mechanic (the same tick at which `skipSelfCollision` is still true).

**Fix.** Open the window without consuming it, and decay at the *start* of each later tick (the window stays exactly 3 exempt ticks, and the counter now reads 3/2/1 while the player is actually ghosting):

```js
            if (resonanceActive('intangiblePhase') && gameTick % 5 === 0) intangibleWindowTicks = 3;
            else if (intangibleWindowTicks > 0) intangibleWindowTicks--;
            if (intangibleWindowTicks > 0) skipSelfCollision = true;
```

## Assertions that would pass on a broken implementation

Ordered by how much coverage they appear to add versus what they actually prove. Every line reference is `test-v12.mjs`.

* **A: Ethereal window (line 212).** The loop re-implements the production lines verbatim (`if (resonanceActive('intangiblePhase') && gameTick % 5 === 0) intangibleWindowTicks = 3; if (intangibleWindowTicks > 0) { exempt++; intangibleWindowTicks--; }`) and counts its own copy. It would pass with the whole block deleted from `updateGame` — and it *does* pass with Finding 1 live, because it never calls `updateGame`. This is the assertion that was supposed to guard the flagship's second effect.
* **F: risk income, hazard-chain half (line 766).** Same shape: an `eat(s)` closure in the test re-implements `hazardChainStreak > 0 && hazardChainStreak % 3 === 0` and calls `bankComboCharge` itself, so the real call site at `snake.html:7449` is never exercised. (The cap and evolution-jump halves of this assertion do drive real code.)
* **E: toast bypasses (line 727).** Counts `/toastEl\.(textContent|style\.display)\s*=/g` and requires exactly 2. Both matches are inside `clearToasts` (`snake.html:7992-7993`); the render path writes through the local alias `el` (`snake.html:7968-7970`). The two bypasses this feature removed were *alias*-based (`const el = toastEl; el.textContent = …`), so a reintroduced bypass of exactly that shape leaves the count at 2 and the assertion green. It also cannot see a bypass via any other alias name.
* **C: death cause coverage (line 477).** Sets `lastDeathCause` by hand for each of the six named deaths and asserts `recapData.deathCause` equals it. That proves the field is copied into `recapData`; it cannot detect a death path writing the wrong string (Finding 4 is exactly that, and this assertion is green for it).
* **C: save field (line 512).** `for (const s of saves) { lastSaveEvent = s; if (lastSaveEvent !== s) okAll = false; }` is an assignment followed by an identity check on the same field — a tautology. Only the `cleared: lastSaveEvent === ''` half is real.
* **A: placement discriminator (lines 133/148) — partially.** A3/A4 re-derive the award arithmetic in the test (`addScore(t.pts * foodResonanceMult())`) instead of eating a food, so they stay green if the eat block at `snake.html:7369` never applied `resMult`. A5 (line 165) is the one that actually discriminates placement, and it does.
* **A: effect coverage (line 117).** Compares `Object.values(RESONANCES).map(x => x.effect)` against a list hard-coded in the test, and checks four helper *names* resolve. `tickResonance()` could be an empty function and this passes. The claim "no advertised resonance is inert" is not tested here.
* **B: countdown arc (line 451).** `drawHazards.toString().includes('phaseTimer')` is satisfied by the pre-ignition cue alone, and the `gated` value the probe computes is never asserted. Passes with the countdown arc deleted, and passes with the arc gated behind calm mode (the property the comment claims).
* **C: recap card balance (line 560).** Measures `ctx.save`/`restore` depth, not layout. Passes on a card whose rows overprint the retry prompt — the failure mode the plan named.
* **D: derived food table / stale weights / missing tiers (lines 576, 587, 597).** All three call `buildFoodTableRows()` directly rather than reading the drawn overlay, so a regression where `drawHelpOverlay` stops rendering the derived rows (or renders 6 of 8) keeps them green. D6 (line 627) is a substring check on that same helper.
* **Source-text assertions (lines 176, 339, 382, 627, 727, 777).** `A6`, `A14`, `A17`, `D6`, `E6`, `F2` assert on `.toString()`/regex of production source. `A17` and `D6` pass if the identifier appears only in a comment; `A14` passes if the call is unreachable (the plan explicitly asked for "reached at least once, not the call site exists"); their invariants have no observable surface, which the plan acknowledged, but they should not be counted as coverage.
* **E: queue cap/priority (line 648).** `URGENT` is drained into the display by the first `queueToast` (queue empty, `toastActive` false), so the 40-message flood never has a high-priority *queued* entry to protect; the eviction policy's stated invariant is not exercised.

Assertions that do discriminate, for balance: `A1` (all 8 keys detectable — fails on the pre-v12 table), `A5`, `A10` (sign-pinned axis swap plus a reversal sweep over all heading/press pairs), `A11`, `A12`, `A16`, `B1` (`warnTicks === 2 * flips`), `B2` (save/restore depth across a full hazard cycle, driving `drawGame` 60 times), `C4`, `E2`, `E5`, `D5`.

## Verified correct

To be explicit about what was checked and found sound:

**Feature 0 / input path.** The mirror flip now exists at exactly one site (`snake.html:4357-4359`); the keydown copy is gone; `setNextDirection` is reached from the keydown dispatcher (`snake.html:8831`) and the swipe handler (`snake.html:8995`), and the D-pad goes through the synthetic keydown — so all three paths flip once, and the flip runs before the reverse-check, which is required because that check validates against the effective tail.

**No regression in the common case.** Identical per-tick state against `HEAD` for: no-mutator classic (352 frames, 46 eats, portal twins, rival eats, evolution, charges), no-mutator (209 frames), and `gravity`-only (142 frames). The only divergence anywhere is `chaos_seed`, where `chaosCurrentWeights` differs from frame 0 — the intended `Math.random()` → `seededRandom()` change at `snake.html:6452`; no other state diverges before that point. The v12 code consumes no PRNG draws on a path with no mutators (`tickResonance` returns before any `seededRandom` call when `activeResonance` is null).

**The hoist rule holds.** Every consumer that executes above the tick's recomputation reads via `resonanceActive()`: the gravity and phase_shift gates (`snake.html:6845, 6849`), `chaosCycleAllows` (`snake.html:984`), the Ethereal window and hunger pause (`snake.html:6858, 6867, 6871`), `rapidDoom` (`snake.html:6876`), the chaos cadence (`snake.html:6901`), `rivalShrink` (`snake.html:3425`), and every food site via `foodResonanceMult()`. The only readers of the `activeResonance` global are the HUD (post-tick, display-only), `tickResonance` itself, and the restore path (Finding 5).

**`RESONANCE_BY_KEY`.** Canonicalisation is total and collision-free: mutator names contain no `~`, so the sorted join of a multiset is unique; all eight keys map to distinct canonical keys and `detectResonance` finds each of them from its own key (test A1). No key can now collide that previously did not.

**Cadence counters.** None can re-arm per tick: `resonanceInvertTicks` is re-armed only when it and `resonanceInvertCooldown` are both 0, and the cooldown is 10-15; `chaosCycleIndex` and `resonanceToggleTick` are modular; `intangibleWindowTicks` is set only on `gameTick % 5 === 0`. None overflows. `intangibleWindowTicks` has exactly one decrement site (`snake.html:6862`) and is read-only in `drawSnake`, so it is not consumed twice. All six counters are reset in **both** `resetGame()` (`snake.html:2292-2298`) and `resetWaveState()` (`snake.html:6200-6206`), and all six are additive snapshot fields (`snake.html:2859-2864`, restored at `3033-3038` with `|| 0` defaults; `SNAPSHOT_VERSION` untouched, verified by test A15).

**`chaosCycleAllows`.** Purely additive: it returns `true` unconditionally unless the *exact* three-mutator key matches, so a subset drafter gets no gating at all (test A9 plus the code); and because the resonance key is the sorted full set, `chaosCycle` and `invertControls` (whose key is the two-set) can never be active together.

**Quantum's axis swap.** The `(newDx === 0 || newDy === 0)` guard is sufficient (the swap of an axis-aligned vector is its perpendicular, never its reverse) and necessary (a diagonal such as `(1,-1)` swaps to `(-1,1)`, an exact reversal). Ordering is swap-then-mirror, so the composition is sign-pinned by test A10 and cannot cancel: mirror negates `dx` only, the swap changes which component `dx` is.

**`rivalShrink` and `rapidDoom` death returns.** `advanceShrinkZone()` returns `true` only after setting `lastDeathCause = 'Caught by the shrinking zone!'`, and both call sites do `gameOver(); return;`. In `updateRival` the remaining-rival concern is moot: `gameOver()` reassigns `rivals = []` (`snake.html:3533`), so the caller's `for (var rii = 0; rii < rivals.length; rii++)` (`snake.html:7733-7736`) terminates immediately and the tick-tail guard at `snake.html:7739` returns; the rival's own new food was already generated before the resonance call, so no inconsistent state is left. In the hunger branch the early return ends the tick exactly like the pre-existing starvation path.

**Canvas discipline.** `drawSnake`'s Ethereal wrapper (`save` at `5615`, `restore` at `5803`) has a matching restore on every path — there is no `return` anywhere between them, and the ghost-skin alpha reset now uses `etherealAlpha` (`5725`) rather than `1`, so the chosen skin no longer cancels the translucency. `drawHazards` has three balanced save/restore pairs; the new pre-ignition pair is nested inside the per-hazard pair, its `setLineDash` cannot leak because it is inside the save, and the countdown arc is drawn on the outer context before its restore. `drawRecapCard`'s single pair wraps the whole body (the `if (!recapData) return;` precedes the save) and `drawComboBankHUD`'s pair is balanced.

**Recap card geometry.** The running cursor and the `contentH` formula agree exactly with the draw arithmetic (top pad 10 + 26 + 26, optional 15/15/16/15, XP 17, quests 14 each); worst case (3 quest rows + cause + save + cascade) is `cardH = 208`, `cardY = 202`, bottom at 410 < 600, and the prompt anchored at `cardY + cardH - 22` lands 4 px below the last quest row. The cascade row is suppressed for Zen (`!recapData.isZen`), and `endZenSession` sets `sessionCascadeMult = 1` and an explicit cause.

**Score multipliers.** `addScore` is untouched (so the v11 source assertions stay valid); the multiplier is applied once per award at the primary eat (`7369`), portal-twin epic (`7524-7525`, score and XP, one award each), and hoard bonus (`7560`); no path can award it twice for one food, since only one `extraFoods` entry is consumed per tick (`break` at `7576`) and `food`/`food2` occupy distinct tiles.

**C splits.** Exactly 7 `lastSaveEvent` writes (streak charge, vampire ×2, serpentine, phoenix ×2, melt) and 10 `lastDeathCause` writes plus the Zen-cause write, matching the plan's classification; `lastSaveEvent` is cleared in both reset sites; the diary keeps its `deathCause` key and meaning.

**Toast pipeline.** `toastGeneration` invalidates the in-flight hide timer; `clearToasts()` is called from `resetGame()` only (`snake.html:2309`) and `resetWaveState()` is untouched, preserving the gauntlet wave toast; the cap-20 eviction picks the lowest rank, oldest-first; the picker is highest-rank, FIFO within a rank; `resetWaveState` never clears.

**Snapshot back-compat.** Additive only; a snapshot with the six resonance fields deleted restores (`|| 0` defaults on every one).

## Plan deltas

Shipped beyond the plan (all fine, listed for completeness): the HUD also suffixes the live resonance state (`[SWAPPED]` / `[MIRROR OFF]` / `[PHASE]`, `snake.html:6681-6683`); the two remaining direct-write toast bypasses in the daily "no attempts" paths were also routed through the queue (`snake.html:2529`, `snake.html:8439`) — a third bypass the plan did not list; hoard and pigment-rush toasts were given `high` priority.

Promised but missing or half-done:

1. **`toastCurrentMessage` (plan step 1 item 2) is not implemented.** Coalescing only looks at the *queued* entries, so a repeat of the message currently on screen is queued and shown again after the current one expires, instead of extending its display — the behaviour item 2 specified.
2. **No chaosCycle HUD phase marker.** Plan step 6 item 12 promises "a glyph for the live resonance state", and the verification section names "the chaosCycle HUD phase marker" as a screenshot target; the three suffixes that shipped only cover Quantum, Schrodinger and Ethereal. Nothing tells the player which of gravity/mirror/phase_shift is live in the 5-tick window.
3. **Help-overlay geometry contradicts the plan.** Step 3 item 5 prescribed a single dense controls column at 12 px pitch and explicitly ruled out two columns; the code ships two columns at 14 px pitch (Finding 3), and the AGENTS.md section added by this patch documents the prescribed version as if it were shipped.
4. **`blurb` is dead.** Plan step 3 item 1 promises a `blurb` on each of the eight `FOOD_TIERS` entries and ~15 LOC of hunter/bomb blurbs; `buildFoodTableRows()` returns `blurb: t.blurb || ''` (`snake.html:4469`) but no tier defines it and nothing renders it.
5. **Pressure Cooker acceptance is a source check, not the promised behavioural one.** Plan step 6 acceptance: "drive a real run with a rival until it eats → assert `advanceShrinkZone` was reached at least once. Do not assert only the call site". `test-v12.mjs:339` asserts `updateRival.toString()` contains two substrings — exactly the call-site check the plan prohibited.
6. **Assertion budget.** The plan reconciled on ~64 assertions; the suite ships 42 (`ok(` call sites), of which the entries listed above carry no discriminating power.
7. **Pre-ignition cue brightness inversion (minor, deliberate or not).** `snake.html:5183` sets `warnA = h.phaseTimer === 2 ? 0.5 : 0.9`, so the cue is *dimmer* two ticks out and brightens only on the final tick; the plan said "a two-tick pre-ignition flash" with no brightness schedule. Worth confirming this is the intended telegraph before commit, since the ring also shares the hazard's hue family with the amber "chain" ring at `snake.html:5206`.
