# v15 ideas — lens 1: first contact (a stranger's first ten seconds on a phone)

Written 2026-11-13 by the issue owner, against `d19f055` / game `ee0e3f2`.

**Process note, stated plainly:** this cycle's step 1 calls for three independent
subagents. Three were launched with these briefs and none returned — two died with a
connection error at zero tokens, one timed out after 20 minutes, and a trivial
health-check probe afterwards still took 8 minutes for 3 tool uses. The subagent
endpoint is degraded. Rather than stall the cycle, the three lenses below are written
by me, from the measured evidence in `v15-ideation-context.md`. Independent review
(step 3) is where a single author is actually caught out, so it must not be skipped —
and the reviewers should be told the ideas are self-authored.

Facts are cited as `ctx §n` (`v15-ideation-context.md`) or as a `snake.html` line.

## Top 5

1. **Fit the board on a phone.** Everything else in this file is decoration if the
   player cannot see a fifth of the board (ctx §5). Cost M, risk low-medium (layout).
2. **Draw the start control in the canvas.** The string already exists and is thrown
   away; a two-line fix plus a hit area (ctx §2). Cost S, risk low.
3. **Make the touch instructions true.** Three strings on the welcome overlay are
   false on the device they are shown on (ctx §3, §4). Cost S, risk low.
4. **One reachable menu on touch.** All seven panels are keyboard-only; a phone player
   cannot reach Quests, Settings or Cosmetics at all (ctx §4). Cost M, risk low.
5. **Fair opening lane.** 2.6% of boards kill a run 360 ms after `Enter` (ctx §6).
   Cost S, risk medium (changes every seed's board — accepted).

---

## 1. The board must fit the viewport

- **What.** Cap the canvas so the whole 440×600 element fits the visual viewport, and
  on short viewports collapse the DOM chrome (`h1`, `#score`, `#highScore`, the seed
  row) instead of the game area. Target: at 320×568 and 360×640 all 20 rows are
  visible in all four states (welcome, idle, playing, game over).
- **Why.** ctx §5: rows off-screen of 20 — 4.4 at the menu / 1.5 in play at 320×568;
  3.7 / 1.3 at 360×640; a finger drag does not reveal them (`body` is
  `height: 100vh; overflow: hidden`, flex-centred, and `#gameCanvas` has no
  `max-height`). Food, obstacles, the rival and your own snake sit in rows nobody can
  see, and the "SNAKE" title is cut at the menu. A real phone is worse than measured —
  browser chrome eats 40–90 px more.
- **How.** CSS only, plus one JS hook: `#gameCanvas { max-height: <viewport minus
  chrome>px }` needs a chrome measurement that CSS alone cannot express with a
  `width: auto; aspect-ratio` element, so extend the existing `resizeCanvas()` (it
  already re-runs on `resize`, reassigns `DPR` and invalidates `gridCacheTheme`) to
  set a CSS custom property (`--board-max-h`) from `window.innerHeight` minus the
  measured height of the visible DOM siblings. Under a height threshold
  (~700 CSS px) add a `compact` class on `<body>` that hides `h1`, `#score`,
  `#highScore` — the same elements standalone mode already hides (`:67`–`:72`), so the
  design already exists; it is just gated on install instead of on height. Score stays
  visible because the canvas already paints its own HUD.
- **Verify.** A Playwright assertion that reads the board, not the CSS: for each
  viewport in {320×568, 360×640} and each state in {welcome, idle, playing, gameover},
  compute `canvasRect.top + row*TILE_SIZE*scale >= 0` for row 0 and
  `canvasRect.bottom - (19 rows) >= 0` — assert all four. To prove it bites: delete the
  `max-height` assignment and confirm 320×568 and 360×640 fail while 390×844 still
  passes (it must not — a change that breaks the big-phone case is a bug).
- **Cost** M. **Risk.** The canvas is DPR-scaled and the grid cache is keyed on size;
  a new height cap must not fight `resizeCanvas`'s backing-store math (`DPR` is
  reassigned there deliberately, `gridCacheTheme` nulled). Also the touch tap
  coordinate math uses `getBoundingClientRect()` scaling (`:9668`) — verified still
  correct, but that's where a subtle hit-area offset would hide.

## 2. A start control in the canvas

- **What.** Draw a real Play affordance in the canvas — in the **lower third** of the
  board area, ≥ 4.5:1 against the backdrop it is actually painted on, and tappable.
- **Why.** ctx §2: `drawOverlay('SNAKE', 'Press ENTER to Start')` (`:7229`) hands the
  string to `drawOverlay` and the idle branch (`:5336`) returns without ever rendering
  `subtext`. The only visible prompt is `#menuFooter` at 2.13:1 (`#555` on `#222`).
  The lower third because idea 1's clipping means the top of the canvas is off-screen
  on small phones.
- **How.** In `drawOverlay`'s idle branch, render the subtext with
  `fillTextClipped` (the v12 helper that measures at draw time — no tuned pixel
  offsets) inside a rounded rect at `y = PLAY_HEIGHT - 60`, and accept a tap anywhere
  in that band in the `touchend` handler (it already has a `tapY` computation for the
  install button at `:9655`, so the pattern exists). Keep the keyboard path untouched.
- **Verify.** Assert on the *rendered* result: pixel-sample the band and assert a
  contrast ratio ≥ 4.5:1 between the brightest glyph pixels and the surrounding fill;
  then a tap at the band's centre moves `gameState` from `idle` to `playing`. Mutation:
  change the fill colour to `#555` and confirm the contrast assertion fails; remove the
  hit band and confirm the tap assertion fails.
- **Cost** S. **Risk.** Low. Must respect canvas save/restore (the idle branch already
  wraps) and the draw order — the CTA is part of the overlay layer, drawn after the
  grid, before the flash overlay.

## 3. Instructions that are true on touch

- **What.** On a touch device the welcome overlay must name only inputs a touch device
  has, and each named action must do what it says.
- **Why.** ctx §3: "Tap canvas to start" (`:5029`) and "Press any key or tap to start
  playing" (`:5055`) — the first tap only dismisses (`:9663` returns early by design,
  to avoid accidental starts); "Press C for cosmetics!" (`:5050`) — no key, and no
  route to the panel (idea 4). This is the v12 "nothing advertised is a lie" standard
  applied to the first screen a stranger sees.
- **How.** Two options; the design plan should pick one explicitly:
  (a) **make it true** — the first tap on the overlay dismisses *and* starts the run
  (delete the `return` in the `welcomeOverlay` branch at `:9663` and fall through to
  the existing `idle` → `Enter` dispatch). One tap to play, and the copy stays as
  written;
  (b) **say what happens** — "Tap to close" / "Then tap Play", which is honest but adds
  a step and a screen that still says two things.
  I recommend (a) with the copy "👆 Tap to play", plus a 250 ms window in which a swipe
  started on the overlay is treated as a swipe, not a start, so a scrolling visitor
  does not begin a run. Whatever is chosen, "Press C for cosmetics!" must go from the
  touch variant (or become "Cosmetics" once idea 4 lands).
- **Verify.** A test that fails today and can only pass the intended way: with
  `hasTouch` on, assert that no string drawn by `drawWelcomeOverlay` matches
  `/Press\s/` (a key press), and that after exactly one `touchscreen.tap` either
  `gameState === 'playing'` **or** the visible copy contains the word the tap actually
  performs. Mutation: restore the current copy → the regex assertion fails; delete the
  `return` but leave the copy as "Press any key or tap to start playing" → the copy
  assertion must still fail.
- **Cost** S. **Risk.** Option (a) changes the long-standing "mobile tap dismisses
  without starting" behaviour recorded in `AGENTS.md` (First-Time Onboarding) — that
  note must be updated in the same commit, not silently contradicted.

## 4. Make the panels reachable by touch

- **What.** Three tappable entries on the idle screen — Quests, Cosmetics, Settings —
  in the canvas (or a small DOM row that fits the compact layout from idea 1).
- **Why.** ctx §4: every `show*Panel()` call lives in the `keydown` handler
  (`:9126`–`:9402`); 25 taps at every point of the idle screen open nothing, while
  `S` opens Settings. Verified. The panels are already touch-ready (buttons with
  `touch-action: manipulation`, ✕ close) — they are simply unreachable. On a phone
  that hides Quests (the daily return hook), Settings (sound, reduced motion, the
  colour-blind palettes) and Cosmetics (the entire visible progression).
- **How.** Canvas hit bands next to the CTA from idea 2 (the idle screen has room at
  `y ≈ PLAY_HEIGHT - 24`), or a DOM row under the canvas in `#menuFooter`. Prefer
  canvas: `#menuFooter` is 2.13:1 and shares the row with the mode hints. Escape/✕
  already closes panels; the panel backdrop already has a click handler (`:9732`).
- **Verify.** With `hasTouch: true` on, for each of the three labels assert that a tap
  at its measured band sets that panel's `display !== 'none'`. Today it fails for all
  seven panels. Mutation: remove the hit band → assertion fails; move the band 200 px →
  the wrong panel or none opens, so the assertion still bites.
- **Cost** M. **Risk.** Screen real estate on a 320-wide phone (idea 1 must land
  first, or these land off-screen). The cross-hide contract (`show*Panel` hides every
  sibling — 7 sites) must keep working for the new entries.

## 5. The opening lane must be survivable

- **What.** No obstacle in the first 4 tiles straight ahead of the spawn head, and the
  first food not unreachable at t=0.
- **Why.** ctx §6: 2.6% of 3000 opening Classic boards have an obstacle in the lane
  within 3 tiles, 4.5% within 4, 0.9% within 2 — 360 ms from `Enter` to death at the
  120 ms opening tick. Cause: `generateObstacles()` (`:3360`) applies the 3-tile
  Manhattan rule to the pattern *anchor*, while four of five `OBSTACLE_PATTERNS` add a
  tile beside the anchor, so the rule does not cover the shape. 0 of 3000 boards block
  both turns: the problem is reaction time, not a trap.
- **How.** In `generateObstacles`, after the anchor test, reject any pattern whose
  *tile set* intersects the corridor `{head.x + k*TILE | k in 1..4, head.y}` (the head
  direction is known at spawn: `dx = TILE_SIZE`). Test tiles, not anchors — that is the
  actual bug. Note this changes the board for every seed (daily, diary replays, ghost
  arena) — accepted in ctx: no players are affected today, and this is the only moment
  it was cheap.
- **Verify.** The 3000-seed probe from the context file, as a test: 0 boards with an
  obstacle in tiles 1–4 of the lane. Mutation: drop the corridor test → 2.6%/4.5% come
  back; make it only the anchor test → 0.9% (the 2-tile case) survives, which is why
  the assertion must be tiles-4, not tiles-3.
- **Cost** S. **Risk.** Medium: `findFreeTile` shares the 3-tile rule with five
  death-save callers (`AGENTS.md`, v13 spawn geometry) — those must keep their
  existing behaviour, so change the obstacle generator only, not the shared guard.
  `generateObstaclesForWave` (gauntlet) should be checked for the same corridor.

## 6. The recap card must survive its own first tap

- **What.** A ~500 ms input guard on `gameover` plus a Share hit area checked *before*
  the catch-all tap.
- **Why.** ctx §7: every canvas tap at `gameover` is forwarded as `Enter` (`:9666`)
  with no delay, so the recap card — the only screen showing the score and the only
  place a Share control can live — is destroyed by a reflex tap. One tap currently
  means three different things depending on hidden state.
- **How.** Record `gameOverAt = performance.now()` in `gameOver()` (and the Zen
  session end, per the both-hooks rule); the tap handler ignores a restart tap for
  500 ms and the recap's own hit areas are evaluated before the fallback.
- **Verify.** Assert that a tap 150 ms after `gameState === 'gameover'` leaves
  `gameState === 'gameover'` and `recapData !== null`, and that a tap at 700 ms
  restarts. Mutation: delete the guard → first assertion fails.
- **Cost** S. **Risk.** Must not break the keyboard path (Enter at game over restarts
  immediately today; a matching guard there would be a deliberate, stated change —
  recommend keyboard stays instant).

## 7. Take the seed field off the front door for touch users

- **What.** Hide `#seedField` / `#seedRandomBtn` / `#seedClearBtn` on touch devices, or
  move them into Settings.
- **Why.** ctx §14: the row is visible on phones at idle on a page already taller than
  the screen (idea 1), and a first-timer cannot interpret "Seed…". It also feeds
  `resetGame`'s manual-seed branch, so a stray tap there silently makes the run
  deterministic and changes the reward behaviour at `:8114`.
- **How.** `hasTouch` gate at init plus a Settings entry (the seed stays reachable for
  the people who use it). `resetGame` reads `seedField.value`, so a hidden-but-populated
  field must be cleared when hidden — otherwise the value persists invisibly.
- **Verify.** With `hasTouch`, assert the three elements are not visible on the idle
  screen and that `activeSeed === null` after a fresh `resetGame()`. Mutation: hide with
  CSS only → the second assertion fails (a hidden seed still applies), which is the
  part that would otherwise bite a user later.
- **Cost** S. **Risk.** Diary "Retry Seed" (`:564`) and the challenge-link accept path
  (`:9136`) both write `seedField.value` — they must keep working, so gate the *display*,
  not the element.

## 8. Teach the thing that killed you, once

- **What.** The recap card already names the cause of death; add one line of advice for
  the first three deaths only (e.g. "Rifts pulse — cross while they're dim"), reusing
  the existing one-shot toast mechanism rather than a new system.
- **Why.** ctx §3: the welcome overlay's third panel is "Press C for cosmetics!" and
  never mentions the rival, the rifts, or what kills you — the three things that end
  run one. `snake_has_seen_rival_head_on` (v13) proves the pattern works and is cheap.
- **How.** A small table keyed by death cause (`lastDeathCause` is now its own field —
  v12 C split it from `lastSaveEvent`, which is what makes this possible), a
  `snake_death_tips_shown` counter in `saveManager`, and one row drawn under the cause
  in `drawRecapCard()`. Both session-end hooks stay untouched (the card is built in
  both already).
- **Verify.** Assert that a first death by `'You ran into a hazard zone'` renders the
  rift advice line, a fourth death renders nothing, and no advice line renders for a
  save event (the v12 split is what keeps a rescue from looking like a cause).
  Mutation: read `lastSaveEvent` instead of `lastDeathCause` and confirm the
  "rescue is not a cause" assertion fails.
- **Cost** S–M. **Risk.** `drawRecapCard()` uses a running cursor since v12 C — a new
  row must extend it, not use fixed offsets.

## 9. The footer prompt must be readable

- **What.** Raise `#menuFooter`'s dim text from 2.13:1 to ≥ 4.5:1 (one colour change,
  `#555` → about `#9aa0a6`), and keep the touch variant's copy truthful.
- **Why.** ctx §2 and VD's review: `#555` on `#222` is 2.13:1 at 13 px, and on touch
  `@media (pointer: coarse)` shrinks `#menuFooter` to 12 px (the span keeps 13 px).
- **How.** One CSS rule; the touch copy follows idea 3's decision.
- **Verify.** The same measured-contrast assertion as idea 2, applied to the footer
  span, on a touch context. Mutation: set it back to `#555` → fails.
- **Cost** S. **Risk.** None — the only user-visible change is legibility.

## 10. Make the ten seconds mean something: a first food inside the first two seconds

- **What.** Guarantee the opening food is within a few tiles of the spawn head.
- **Why.** `start` already fires but nothing measures "did the player understand". The
  first food is the moment the game explains itself; ctx §1 makes clear the run must
  begin fast, and the lane fix (idea 5) is only half of "the first three seconds are
  not fatal".
- **How.** `generateFood()` already takes a `currentSnake` occupancy list and a
  `minFoodSpawnDist` cap; add a *maximum* first-food distance for `gameTick === 0`
  spawns (e.g. ≤ 8 tiles, wrap-aware — the v10 magnet math lesson applies).
- **Verify.** Over 3000 opening boards, assert every opening food is within 8 tiles
  (wrap-aware). Mutation: drop the max → the assertion fails on some seeds.
- **Cost** S. **Risk.** Changes every seed's board like idea 5 (accepted). Must not
  break the portal-twin placement distance (`findPortalTile`'s minimum 10 tiles) — the
  *epic* first food and its twin must both stay legal, so apply the max to the primary
  food only, and assert both constraints in the same fixture.

---

## Rejected (with reasons)

- **Skip the welcome overlay entirely / a 3-step interactive tutorial.** A tutorial is
  the mechanic v15 forbids, and it inserts friction into the exact ten seconds we are
  trying to shorten. Making the overlay *true* (idea 3) is the same win at a tenth of
  the cost.
- **A big pulsing "TAP TO PLAY" at the top-centre of the canvas.** Where ctx §5 shows
  the canvas top is off-screen on small phones — a top-anchored CTA is invisible
  precisely where the problem is.
- **Auto-start the run on page load.** Removes the mode choice, breaks the daily
  attempt-consumption rule (`AGENTS.md`: the attempt is consumed on `startGame()`), and
  would fire the `start` counter for visitors who never meant to play — corrupting the
  one rate this cycle exists to measure.
- **Touch route to all seven panels as a slide-out drawer.** Six of seven
  (Diary, Stats, Achievements, Brews, Quests, Cosmetics) are meta; on a first visit the
  answer is three entries (idea 4), not a navigation system. The rest can follow if the
  funnel shows people want them.
- **Hiding the d-pad until the run starts.** Reasonable polish, but the d-pad is a
  legitimate first-visit affordance and the space it costs is recovered by idea 1.
- **Per-device viewport telemetry to tune the layout.** Fingerprinting-adjacent and
  against the no-personal-data rule; idea 1's geometric assertion is the test.
- **Belonging to lens 2:** anything about keys, targets or reports.
- **Belonging to lens 3:** share links, link previews, channel attribution, the itch
  embed settings.
