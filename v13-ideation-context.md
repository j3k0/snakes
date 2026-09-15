# Snakes v13 — Ideation Brief

Brief handed to the three step-1 ideation agents (gameplay-mechanics / legibility / outside-view).
Baseline: master `e2851ac`, working branch `v13-rival-fairness`, `snake.html` 9174 lines,
174 assertions across 13 Playwright suites.

**Theme (JC, 2026-09-15):** *the rival must be fair, legible, and actually dangerous.*

> "focus on fixing rival gameplay (it starts too long, should warn before appearing) and bugs
> (I don't understand why I sometimes run through it, right after it appears, make it slower maybe?
> investigate ideas, pick the good ones). And fixing bugs!"

Three named symptoms, all player-facing:

1. **"It starts too long" / appears with no warning** — the rival materialises with zero telegraph.
2. **"I sometimes run through it, right after it appears"** — the player passes straight through the
   rival without dying, most often right after it spawns.
3. **"Make it slower maybe?"** — the rival may be too fast relative to the player, especially early.

## Verified seed findings

These are starting points, not finished analysis. Confirm or refute each before designing.

### F1 — CRITICAL: a head-on charge DESTROYS the rival instead of killing the player

Reproduced on `e2851ac`. This is the mechanism behind JC's *"I sometimes run through it"*, and it is
worse than a pass-through — it hands out a free kill.

Tick order in `updateGame()`: player moves → `checkPlayerDeath(wrappedHead, …)` (rival test at
~L7157-7205, comparing the player's **new** head against the rival's **old** segments) → **then**
`updateRival()` at ~L7787-7800. The two are never compared at the same instant.

| Scenario | Player | Rival | Result |
|---|---|---|---|
| Closing head-on from **2 tiles** | 100 → 120 | 140 → 120 | Player's new head (120) misses the rival's *old* tile (140); the rival then moves onto the player's tile and `updateRival`'s `playerHead === newHead` branch calls **`removeRival()`** → rival destroyed, player unharmed, `stats.rivalsDefeated++` |
| Closing head-on from **1 tile** | 100 → dies | 120 | Player's new head lands on the rival's old tile → player dies correctly |
| Rival fleeing | 100 → dies | 120 → 140 | Player steps into the vacated tile → player dies correctly |

Inverted risk curve: **charging a rival head-on is the safest way to kill it**, and it inflates
`RIVAL_SLAYER` / the 25 & 100 rival-defeat stat milestones. The likely reading of JC's report is
therefore not "I passed through it" but "I drove at it and it evaporated".

Fix directions to weigh: compare both post-move positions in the same tick (swept check), hoist
`updateRival()` above the player collision test, or resolve the collision once after both moved.
Whatever is chosen must (a) keep the documented death-save chain order (shield → vampire → streak
charge → phoenix → serpentine → death), (b) keep the leech-brew head-to-head steal working, and
(c) not turn the legitimate rival-defeat paths (self-collision, leech drain) into false deaths.

### F1b — `removeRival()` conflates "defeated" with "died"

`removeRival()` unconditionally credits a defeat when the rival was active, and it is reached from
several sites with different meanings (rival self-collision, leech drain, player-head overlap).
Whatever fixes F1 must decide explicitly which of those should award `rivalsDefeated`.

### F2 — the rival moves on the same tick cadence as the player, with a fixed 1-tile step

`updateRival()` is called once per tick and unshifts one new head per call → 1 tile/tick, the same
rate as the player's base speed. The player accelerates with score via `getEffectiveSpeed()`, so the
rival becomes *relatively* slower later and is at its most dangerous early — matching JC's
impression. There is no per-rival speed constant to tune today; a speed factor is a new concept and
must interact correctly with `slowMoActive`, speed food and the `rivalFreezeMs` hoard/pigment freeze.

### F3 — no spawn telegraph at all

`spawnRival()` sets `r.active = true` and the rival is lethal on the very next collision check. There
is no warning, no wind-up, no safe grace window. Compare with existing precedents for "something is
about to become dangerous": the v12 hazard pre-ignition cue (`phaseTimer <= 2` → amber dashed ring)
and the hazard grace period at run start (`HAZARD_GRACE_TICKS`).

### F4 — respawn separation is only 3 tiles

`spawnRival()` picks `findFreeTile(ph.x, ph.y, true)`, which rejects any tile within
**`3 * TILE_SIZE` Manhattan distance** of the player's head (`snake.html` ~L3241). A rival can
legally spawn 3 tiles away, and at 1 tile/tick each the player closes that in ~2 ticks. That is what
makes F1's undetected pass-through so visible "right after it appears". Consider whether the
separation should scale with the rival's speed, and whether the spawn deserves hazard-style grace.

## Ground rules (load-bearing)

- **Respect the AGENTS.md invariants.** Several were corrected in v12 (`HOARD_INTERVAL`/`HOARD_DURATION`,
  the dead `seedOffset`, the `drawOverlay` leak note).
- **Snapshot fields are additive — do NOT bump `SNAPSHOT_VERSION`.** Rival state already round-trips
  (`rivals:` in build ~L2943 / restore ~L3060); new per-rival fields must default safely.
- **Both reset sites.** Per-run state is cleared in `resetGame()` AND `resetWaveState()`.
- **Both session-end hooks.** Session-end logic goes in `gameOver()` AND `endZenSession()`.
- **Canvas save/restore** on all paths; v11 shipped unplayable from transform corruption.
  `test-v12.mjs` asserts save/restore depth returns to 0 across a hazard cycle — add the equivalent
  for any new rival rendering.
- **Verify in the running game.** Drive the real loop in Chromium and look at it. Assertions passing
  ≠ game working.
- **Never calibrate for 60fps.** Timers are tick-counted against the real ~120ms base interval.

## Out of scope

- Re-opening v12's decisions. It is merged and reviewed.
- New game modes, new currencies, new DOM panels (the 7-site cross-hide contract), or anything needing
  a backend. localStorage only, no new dependencies.
- Rewriting the rival AI wholesale. "Make it slower" and "warn before it appears" are tuning and
  telegraphing, not a pathfinding project — if the investigation shows the AI is fundamentally broken,
  say so and propose the smallest fix that works rather than a rewrite.
- Cosmetic-only changes with no gameplay effect.

## Harness

`test-helpers.mjs` exports `launch()`, `startGame(page, {mode, seed, clean})`, `waitForTicks`,
`driveTicks`, `pressDirection`, `placeFood`, `moveTowardFood`, `getGameState`, `collectErrors`,
`runTests`, `TILE_SIZE = 20`, `TICK_MS = 120`, `FILE`. `node_modules` + Chromium are provisioned.
