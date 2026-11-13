# v15 ideation context — the first ten seconds

Written 2026-11-13 on `ee0e3f2` (master = the deployed build). Issue: FOV-2676.
Every number below was measured, not assumed; the measurement method is named so it
can be re-derived. Two independent reviews (agent VD and the issue owner) agree on
this context; the plan's two original errors are corrected here.

## Theme

**A stranger goes from URL to playing in under ten seconds — and can tell a friend
afterwards.** Twelve cycles made the game deeper. Nobody has played it. v15 adds no
mechanics; it fixes the door and the instruments.

## The situation (measured)

| | |
|---|---|
| Public URL | **https://j3k0.github.io/snakes/** — 200 OK, 528,716 bytes, last modified 2026-10-19 |
| Deploy repo | https://github.com/j3k0/snakes (public: `index.html` + `README.md`, Pages from `main`). Source of truth: `snake.html` here; the deploy copies it to `index.html` via `gh`. |
| Page loads | 20 (`load`), of which 15 landed on deploy day (our own verification) and 2 on 2026-11-12 (this plan's own probe). **At most 3 loads could have been anyone else.** |
| Games started / finished | 1 (`start`, also ours) / never (`finish` key does not exist) |
| Visiting days | 4 (`day-2026-10-19`=15, `10-20`=2, `10-21`=1, `11-12`=2) |
| Distribution | itch.io, r/WebGames, Newgrounds: all need an account only JC owns, so none happened. JC committed 2026-11-13: he will post soon, **after** the v15 deploy. |
| Test baseline | 309 assertions / 14 suites, all green |

Read that honestly: we cannot tell "nobody is interested" from "nobody was told".
v15 fixes the half we control, and instruments it so the next read is decidable.

## Facts about the first visit (all re-measured on `file://`, so the live counters stayed untouched)

1. **Two taps already reach a moving snake.** iPhone 13 / Pixel 7 / Moto G4, fresh
   profile: tap 1 dismisses the welcome overlay (`gameState` stays `idle`), tap 2
   starts a run and the snake moves. *"≤ 2 taps" is therefore not an acceptance
   test* — it passes on today's build.
2. **The canvas has no start CTA, and the page's one is nearly invisible.**
   `drawOverlay('SNAKE', 'Press ENTER to Start')` (`snake.html:7229`) passes the
   string and the idle branch of `drawOverlay` (`:5336`) never renders its `subtext`
   argument — a two-line omission, not missing copy. The only visible prompt is
   `#menuFooter`: "👆 Tap to Start | Swipe ↑↓ to change mode" in `#555` on `#222`
   = **2.13:1** at 13px. (So "zero call to action", as the issue said, was wrong;
   "no CTA in the canvas and a 2.13:1 one below it" is right.)
3. **Three instructions on the welcome overlay are false on touch** (the v12
   "nothing advertised is a lie" standard): "Tap canvas to start" (`:5029`) and
   "Press any key or tap to start playing" (`:5055`) — the first tap does neither;
   "Press C for cosmetics!" (`:5050`) — see next point.
4. **A touch device has no route to any panel.** All seven `show*Panel()` calls
   (Settings, Cosmetics, Brews, Quests, Stats, Achievements, Diary) live inside the
   `keydown` handler (`:9126`–`:9402`). Verified: 25 taps at every place on the idle
   screen opened nothing; keyboard `S` opened Settings. The panels themselves are
   touch-ready (buttons, `touch-action: manipulation`, ✕ close) — they are simply
   unreachable. Consequences: on a phone nobody can reach **Quests** (the daily
   return hook), **Settings** (sound, reduced motion, colour-blind palette), or
   **Cosmetics** (the progression the overlay advertises, by a key they don't have).
5. **The board does not fit the screen on phones under ~700 px tall.**
   `body { height: 100vh; overflow: hidden }` + flex centring, and `#gameCanvas` has
   no `max-height`. Board rows off-screen, of 20:

   | viewport | at the menu | during play |
   |---|---|---|
   | 320×568 | 4.4 | 1.5 |
   | 360×640 (Moto G4) | 3.7 | 1.3 |
   | 375×667 | 3.4 | 1.2 |
   | 390×844 (iPhone 13) | 0 | 0 |

   A finger drag does not reveal them (canvas top −51 → −51). Food, obstacles, the
   rival and the player's own snake can sit in rows nobody can see. A real phone is
   worse — the browser's own chrome takes another 40–90 px. (Standalone mode hides
   `h1`/`#score`/`#highScore` and would recover most of it, but install is never
   offered — see point 10.)
6. **A first run can end before the player can react.** 3000 seeds through
   `resetGame()`: an obstacle sits in the lane straight ahead within 3 tiles on
   **2.6%** of boards, within 4 tiles on **4.5%**, within 2 tiles on **0.9%**. Cause:
   `generateObstacles()` (`:3376`) applies the 3-tile Manhattan rule to the pattern's
   *anchor* only, while 4 of the 5 `OBSTACLE_PATTERNS` add a tile beside the anchor.
   At the 120 ms opening tick that is 360 ms from `Enter` to death. 0 of 3000 boards
   block both turns, so it is a reaction-time problem, not a trapped start. A fix
   changes the board for every seed (daily, diary replays, ghost arena included) —
   accepted: no players are affected today, and that is the only time it was cheap.
7. **Game over: one tap restarts, with no delay guard.** Every canvas tap at
   `gameover` is forwarded as `Enter` (`:9666`). So the recap card — the only screen
   that shows your score and the only place a Share control can live — dies to a
   reflex tap. Any new hit area must be tested *before* that catch-all, or the tap
   meant for Share starts a run. (A tap during play pauses, `:9676`, so one tap means
   three different things depending on state.)
8. **Sharing exists and is unreachable.** `K` copies a challenge link only when the
   run is seeded *and* at game over (`:9420`); ordinary runs are unseeded, so for a
   normal player `K` does nothing. `#mode~seed~score` already parses on arrival
   (`parseChallengeUrl`, `:628`–`:638`) but rejects an empty seed (`:635`), while the
   target HUD (`:7203`) never reads the seed. The landing screen is keyboard-worded
   ("Press Enter to accept challenge" / "Press Escape to dismiss", `:6628`): on touch
   a tap accepts and **there is no way to decline**.
9. **"Mint a seed at `startGame()`" is the wrong fix** (the issue's original item 5).
   The seed is derived inside `resetGame()` *because* board generation reads it (the
   v11 D fix), so minting one in `startGame()` is too late; and 16 places test
   seeded-ness (13 positive, 3 negative) — `if (activeSeed === null)` at `:8114` would
   silently delete the speed-food boost for every player while speed food keeps
   spawning and the overlay keeps promising a burst; `saveReplay` would write an event
   list for every run; Ghost Arena (`Shift+G`) would start working for everyone; and
   the daily branch already owns `activeSeed`. A **score-only link** ("beat 120 in
   Classic") is the honest option and costs one parser tweak plus accept-path handling.
10. **Installability is a non-issue — dropped.** `⬇ Install App` only draws after the
    browser fires `beforeinstallprompt` (`:5431`) and its tap handler is gated the same
    way (`:9655`), so an origin that cannot install shows the player nothing false.
11. **itch.io is invisible to us as gated.** itch serves HTML5 uploads from
    `html-classic.itch.zone` inside an iframe, so `location.hostname === 'j3k0.github.io'`
    never matches there and `location.origin` share links would point at the iframe
    (itch's own docs call those direct links unstable). The funnel needs a **channel**
    dimension and the share link needs a hard-coded canonical URL.
12. **The counters cannot support a decision.** Four keys only — a load that dismissed
    the overlay is indistinguishable from a load that died at the first tick. Our own
    traffic has no opt-out. The daily snapshot (`/opt/shared/reports/snakes/counter-snapshot.sh`,
    cron 12:00 local) reads the *current* UTC day, so it only ever sees a partial day:
    every row after 2026-10-19 has `day_loads: null`, and the 2026-10-20 row is missing
    although Abacus has 10-20 = 2.
13. **Closed: the XP anomaly.** The issue recorded "+1110 XP / LEVEL 5 at score 90".
    A fresh-profile first run at that score can reach at most FIRST_BITE 25 + COMBO_3
    150 + HAT_TRICK 150 + SURVIVOR 100 from achievements plus `snake.length * 10`
    (`:3895`), so +1110 needs a ~100-segment snake: a manipulated fixture, not a
    double `gameOver()`.
14. **A development affordance sits on the front door for phone users:** the
    `#seedField` row ("Seed…" + 🎲 + ✕) is visible on touch at idle, on a page that is
    already taller than the screen.

## Acceptance tests that fail today (a change must turn at least one of them green)

1. The whole 20×20 board is inside the visual viewport at 320×568 and 360×640, in all
   four states (welcome, idle, playing, game over).
2. 0 of 3000 opening seeds put an obstacle in the first 4 tiles of the lane ahead.
3. A start control is drawn inside the canvas, in the lower half at 360×640, at
   ≥ 4.5:1 against the backdrop it is actually painted on.
4. No string rendered on a touch device names an input a touch device does not have.
5. A recap-card Share tap copies a link and does **not** start a run.
6. Every one of the seven panels is reachable by touch.
7. The funnel counters return distinct values for overlay-dismissed / run-started /
   first-food / death / share-copied from one scripted visit, with our own traffic
   excluded, and carry a channel.

## Decisions already taken — do not relitigate

- Theme A (funnel). No new modes, mechanics, currencies.
- Deploy order: owner review → deploy → counter check with our traffic excluded → JC's
  posts. v16 stays parked until the funnel can be read, ~30 days after the last post.
- Ship v15 **before** the posts, and judge the cycle on **rates, not volumes**
  (`start / load`, `first_food / start`): a rate survives a change of traffic source.
- Funnel keys ship before or with any entry-path change, or the cycle cannot be judged.
- Beacons stay inert off `j3k0.github.io` (plus a test opt-out) and fire-and-forget.
- Score-only challenge link over a minted seed (design plan to confirm the format).
- v14's nine recorded "deliberate non-fixes" stay parked; the installability item is
  dropped. No backend, accounts, monetisation, third-party analytics, new dependencies,
  no split of `snake.html`, no build step.

## Ground rules (load-bearing, from AGENTS.md)

- Respect the architecture invariants in `AGENTS.md` — read the v12/v13/v14 sections
  before proposing edits.
- Snapshot fields are **additive**; never bump `SNAPSHOT_VERSION`. Per-run state resets
  in BOTH `resetGame()` and `resetWaveState()`; session-end logic runs in BOTH
  `gameOver()` and `endZenSession()`.
- Canvas save/restore on all paths; assert the drawing state (dash, alpha, transform),
  not just that depth returns to 0.
- Nothing may be calibrated for 60fps — timers are tick-counted against ~120 ms.
- Verify in the running game in Chromium (mobile emulation, fresh profile). A green
  suite is not evidence the game plays right.
- An assertion that cannot fail is not an assertion — the test is mutation: delete the
  predicate and confirm the assertion fails.
- Nothing advertised is a lie. Applies literally to onboarding copy this cycle.
- No personal data: cookie-less, no fingerprinting, no accounts, no server-side
  analytics.
