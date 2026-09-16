# Snakes v14 — Ideation Brief

Brief handed to the three step-1 ideation agents (gameplay-mechanics / legibility-UX / outside-view).
Baseline: master `c3289a1`, working branch `feat/v14-cycle`, `snake.html` 9675 lines,
270 assertions across 13 Playwright suites (`node test-*.mjs`), all green.

**No theme has been set by the user for v14.** Your first job is to propose one.

v13 (merged) shipped under *"the rival must be fair, legible, and actually dangerous"* — the collision
contract restored verbatim, a 1.6 s spawn telegraph, wrap-aware 5-tile spawn separation, length-derived
cadence, defeat-credit repair, and a legibility pack. v12 shipped mutator resonances, hazard telegraphs,
toast pipeline, death-cause vs save-event split, cascade disclosure, help/legend truth.

## Candidate backlog (starting points, NOT the finished analysis)

These are the recorded, evidence-backed items from v13's investigation that were deliberately left.
**Re-verify each claim against `snake.html` before designing on it** — three of v13's seed findings were
refuted or corrected by measurement, and the strongest v13 findings were *not* in the original list.

1. **The rival's AI does not steer around obstacles.** It is immune by design ("a spirit the board does
   not constrain"); on obstacle-heavy boards it visibly walks through solid geometry, undercutting the
   legibility vocabulary. Recorded v14 candidate: ~3-line change (add obstacles to the 1-ply candidate
   filter, keeping the fallback). Open question: keep immunity (walk through) or steer (re-introduces
   the v4 trapped-rival rule as a sub-feature).
2. **The rival eating food emits no cue at all.** Verified in v13: `updateRival`'s eat branch calls no
   `playSound`, `queueToast`, `spawnParticles` or `spawnFloater`. The food vanishes; the player cannot
   tell they lost a race.
3. **`findFreeTile` / `findPortalTile` / `snapToFreeTile` use three different occupancy sets.**
   Documented as inconsistent-by-design; a consolidation candidate.
4. **The rival is immune to hazards.** A rift is lethal to the player, harmless to the rival — the cue
   vocabulary ("dashed amber ring + countdown = danger") is not symmetric. Recorded as an ~8-line fix,
   gated on `rivalFreezeMs <= 0`.
5. **The mode-select screen clips its own text.** `getModeDesc(mode)` drawn centred at 13px; 'painter'
   (552.7px) and 'gauntlet' (517.4px) overhang a 440px canvas by 56.3px / 38.7px on each side.
   Fix needs a wrap or short-form decision.
6. **The persisted "Best" and the recap headline disagree.** `updateScoreDisplay()` writes the RAW score
   into `modeHighScores` during the run while `finalizeSession()`'s post-cascade write never wins —
   the persisted best is pre-cascade, the recap card is post-cascade.
7. **Two rivals can overlap** under `double_rival` (they ignore each other by construction), and a live
   rival's head colour is shared between both rivals. Related v13 code-review Finding 13: a
   materialising rival is not in `rivalCombinedSnake()`'s occupancy set for a second spawn.
8. **`gameOver()` clears `rivals` before the death frame**, so the screen that killed you shows no rival.

## Where to look beyond the list

- Read `AGENTS.md` (the architecture record — includes the v13 sections and the "Accepted Behaviour
  Changes" lists with deliberate non-fixes).
- Read `v13-design-plan.md`, `IMPL_PLAN_v13.md` and `v13-code-review.md` for what was left on the table.
- v13's code review left open threads: the gauntlet wave-completing tick gives the rival one extra move
  (documented, not gated); the 1-ply self-rejection is chase-branch-only (0.38% residual self-crashes);
  the leech descriptor; the HUD `⚠ Rival in 0.0s` frozen display during a deferral; the crowded-board
  re-arm interval (~480ms, documented); the double-`gameOver()` risk closed only accidentally.
- Player-facing surface: what does the game NOT have that a 2026 browser snake should? Ideas must fit
  the out-of-scope rules below.

## Ground rules (load-bearing)

- **Respect the architecture invariants in AGENTS.md.** Several were corrected across v12/v13.
- **Snapshot fields are additive — do NOT bump `SNAPSHOT_VERSION`.** New fields must default safely.
- **Both reset sites** (`resetGame()` AND `resetWaveState()`); **both session-end hooks**
  (`gameOver()` AND `endZenSession()`).
- **Canvas save/restore** on all paths; assert the *drawing state* (dash, alpha, transform), not just depth.
- **Verify in the running game.** Drive the real `setTimeout` chain in Chromium and look at it.
- **Never calibrate for 60fps.** Timers are tick-counted against the real ~120ms base interval.
- **An assertion that cannot fail is not an assertion.** Mutation-test your claims.

## Out of scope

- Re-opening v13's or v12's decisions. Both are merged and reviewed.
- New game modes, new currencies, new DOM panels (the 7-site cross-hide contract), or anything needing a
  backend. localStorage only, no new dependencies.
- Cosmetic-only changes with no gameplay or legibility effect.
- Rewriting the rival AI wholesale (no pathfinding project).

## Harness

`test-helpers.mjs` exports `launch()`, `startGame(page, {mode, seed, clean})`, `waitForTicks`,
`driveTicks`, `pressDirection`, `placeFood`, `moveTowardFood`, `getGameState`, `collectErrors`,
`runTests`, `TILE_SIZE = 20`, `TICK_MS = 120`, `FILE`. `node_modules` + Chromium are provisioned.

## Deliverable

A markdown report (write it to the filename you are told) proposing:
1. A **theme** for v14 (one sentence) and the reasoning.
2. **5-10 concrete ideas**, each with: the verified factual basis (measured, with line numbers), the
   proposed change (sketch, ~LOC estimate), impact/feasibility/risk/synergy scores (1-5), and what could
   go wrong. Mark which backlog items you re-verified and what you found (confirm/refute/correct).
3. A recommended **top 3** with a build order sketch.