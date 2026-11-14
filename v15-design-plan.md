# v15 design plan — the first ten seconds (rev 2)

Issue FOV-2676. Rev 1 written 2026-11-13 by the issue owner (step 2) on `36f2504`, game
`ee0e3f2`. **Rev 2, 2026-11-14: folded the two step-3 reviews** (`v15-review-1.md` —
scope/risk, `v15-review-2.md` — falsifiability) after JC's model switch (FOV-2676d).
Inputs: `v15-ideation-context.md` (measured facts) and the three lenses.

## Review dispositions (step 4)

Every reviewer finding and what happened to it. BLOCKERs all accepted unless noted.

| Finding | Tag | Disposition |
|---|---|---|
| R1-1 ten features too large; cut F5 + F8; F9 before F8 in drop order; Share leaves F7 | BLOCKER | **Accepted.** v15 ships 8 features: F1, F2, F3, F4, F6, F7, F9, F10. F5 and F8 move to the deferred list with context fail-today tests 5/6. |
| R1-2 250 ms swipe window guards a gesture this page cannot produce | BLOCKER | **Accepted.** Displacement threshold (the swipe handler's own) + `overscroll-behavior-y: contain`; 250 ms window deleted. |
| R1-3 F2 must be scale-only; URL-bar/rotation gates; hide `h1` alone; min physical tap size | BLOCKER | **Accepted.** Scale-only, mid-session resize gates added, `compact` narrowed to touch pointers, tap-target assertion added. |
| R1-4 record the F6 seed cut-over date where baselines are read | SHOULD | **Accepted.** F10 records the deploy date as the board-generation cut-over. |
| R1-5 F1-first kept with honest reason; load-scoped semantics + Zen-quit gap unstated | SHOULD | **Accepted.** Semantics written into F1 and F10. |
| R2-1 F3 tap gate passes with no band (idle catch-all already starts) | BLOCKER | **Accepted — design decision:** an idle tap outside the band does nothing; the band is the start control on touch. Negative case asserted. |
| R2-2 contrast sample names no pixel pair; footer prompt unasserted | BLOCKER | **Accepted.** Pixel pair named; footer pair asserted at two viewports. |
| R2-3 F1 gate blind to the itch channel fix | BLOCKER | **Accepted.** Hostname-stubbed fixtures added (itch fires `ch_itch`; off-list inert). |
| R2-4 F1 rescue mutation cannot fail | BLOCKER | **Accepted.** Rescue fixture added (save-then-death → one bucket, true cause; rescued-then-quit → zero death keys). |
| R2-5 decision rule has no branch for its central case | BLOCKER | **Accepted.** Full matrix in F10, with channel, censoring and low-n clauses. |
| R2-6 rule never says which channel it reads; `die_*` censored on itch | SHOULD | **Accepted.** Thresholds read `ch_github`; itch reported separately and censored. |
| R2-7 F8 precedence has no gate | SHOULD | **Moot** — F8 cut (R1-1); re-enters the plan with F8. |
| R2-8 F4 regex proves less than its title; swipe guard untested | SHOULD | **Accepted.** Exact strings asserted, sweep over welcome/idle/gameover, swipe fixture added. |
| R2-9 F2 compact class would fire on 1366×768 laptops | SHOULD | **Accepted.** `compact` gated on `(pointer: coarse)` so it cannot fire on a desktop; desktop viewport added to the gate. |
| R2-10 tap tests prove routing, not visibility | SHOULD | **Accepted** (F5 is cut); F3's band asserted inside the viewport before tap assertions. |
| R2-11 F6 gauntlet check is a sentence, not a gate | NIT | **Accepted.** The wave generator gets its own probe. |
| R2-12 F10 rate table is prose | NIT | **Accepted.** Rates asserted against fixture counts. |

## Goal and the one sentence test

A stranger on a phone opens the URL, sees a control, taps, moves the snake, does not die
before they can react. Every load that happens after the change produces numbers that say
which of those steps is failing — and the numbers do not include us. (Sharing a run
explicitly left for v16: no run has ever been finished, so the path has zero lifetime
exercise — R1-1.)

## Scope — what ships, in order

Eight features (rev 1 had ten; F5 and F8 were cut in review — see dispositions). Each is
one commit, each lands with its gate. Ordering is not cosmetic: F1 ships before any
entry-path change (JC's rule — the cycle cannot be judged without its counters, and
landing them first makes them structurally uncuttable in any descope), and F3 ships after
F2 because a control placed in the canvas is invisible on exactly the screens F2 fixes.

| # | Feature | Source ideas | Size |
|---|---|---|---|
| **F1** | Funnel v2: one-shot keys, channel from hostname, opt-out for our own traffic | measurement 1, 2, 5, 6, 8, 10 | M |
| **F2** | The board fits the phone — scale-only, touch-narrowed chrome | first-contact 1 | M |
| **F3** | A start control in the canvas, lower third, tappable; footer prompt legible | first-contact 2, 9 | S |
| **F4** | Onboarding that tells the truth on touch, and teaches the two things that kill you | first-contact 3 | S |
| **F6** | A survivable opening lane | first-contact 5 | S |
| **F7** | The recap card survives its first tap | first-contact 6 | S |
| **F9** | Link-preview metadata, real title, one preview image | distribution 1 | S |
| **F10** | A daily funnel report and a written decision rule | measurement 3, 4, 9 | S–M |

### F1 — Funnel v2

Add to the four existing Abacus keys: `overlay_gone`, `first_food`, `touch` / `keys`,
`paused_early`, death buckets (`die_wall`, `die_self`, `die_obs`, `die_rival`,
`die_hazard`, `die_time`, `die_other`), and channel (`ch_github`, `ch_itch`, `ch_other`).
The `shared` key leaves with F8.

- One `bump(key)` wrapper owning a `Set` of keys already fired this **page load**, so no
  step double-counts — `gameOver()` has no double-call guard and `finish` is its first
  statement (`:3869`).
- **Load-scoped semantics, written down (R1-5):** every funnel key is once per page load,
  not per run — five runs in one visit produce one `start`, one `first_food` (the first),
  one death bucket (the first). A Zen quit (`endZenSession`, no death) leaves a `start`
  with no death key: in the report that is "still playing or quit", never "still playing".
- Beacons stay `keepalive`, never awaited, off the tick body except behind an
  already-cheap flag check (`sessionFoodEaten`, `gameTick`).
- The gate becomes a hostname allow-list (`j3k0.github.io`, `*.itch.zone`,
  `*.newgrounds.com`) instead of one equality: an itch player currently counts nothing,
  and query parameters are not available (itch does not pass them into the game iframe;
  the hash is reserved for challenge links). `file://`, `localhost` and CI stay outside
  the map, so "inert in tests" survives.
- `localStorage.snake_nocount === '1'` suppresses all beacons; every scripted live check
  sets it. Suites keep running on `file://`.
- Death buckets are a fixed map from `lastDeathCause` (its own field since v12 C), never
  the cause string. Rescues are structurally excluded — a rescue never reaches
  `gameOver()` — and a fixture now pins it (R2-4), so nobody can later map
  `lastSaveEvent` into a bucket without turning the suite red.
- F4 will redefine `overlay_gone` (the same tap that starts the run dismisses the
  overlay); F1's gate is re-run as part of F4's commit.

**Gate:** a scripted visit asserts one `load`, one `overlay_gone`, one `start`, one
`first_food`, exactly one death-bucket key, one `touch`; zero requests to the counting
host on `file://` and zero with `snake_nocount` set; a double-`gameOver()` fixture still
produces one death key. Plus (R2-3): a **hostname-stubbed** fixture where an itch-like
origin fires and attributes `ch_itch`, and an off-list origin fires nothing — the
all-`file://` gate was blind to the channel fix the feature exists for. Plus (R2-4): a
rescue fixture — shield save then a later true death yields exactly one bucket with the
true cause; rescued then quit-to-idle yields zero death keys. Mutation targets: the
once-per-load `Set`, the rescue exclusion, and the allow-list entry itself (delete
`*.itch.zone` → the itch fixture fails).

### F2 — The board fits the phone (scale-only)

`resizeCanvas()` already handles `DPR`, the backing store and `gridCacheTheme`; extend it
to cap the canvas's CSS height at `window.innerHeight` minus the measured visible DOM
chrome, exposed as a CSS custom property. **Scale, never clip (R1-3):** the canvas is
scaled by CSS to fit both dimensions; no `overflow` cut may hide a row — if any
implementation clips, the gate below fails by construction. The measured-chrome
calculation re-derives on every resize, so URL-bar collapse and rotation mid-play are
just resize events.

The `compact` body class: **`(pointer: coarse)` AND viewport height below ~700 CSS px**
(R2-9) — it cannot fire on a 1366×768 laptop. It hides `h1` alone first; `#score` and
`#highScore` hide only if the height cap fails the 320×568 gate without them (hiding the
live score during play is a cost, paid only if the gate demands it — R1-3).

**Gate:** for {320×568, 360×640} × {welcome, idle, playing, gameover}, assert board row 0
and row 19 are inside the visual viewport (computed from `getBoundingClientRect()` and the
canvas scale, not from CSS). Assert 390×844 unchanged and **1366×768 unchanged with
`h1`/`#score`/`#highScore` visible**. Add mid-session cases (R1-3): URL-bar collapse
(viewport height −80 px mid-play) and 90° rotation mid-play — board fully visible in both,
and the F3 tap band still hit-tests at its new on-screen position. Mutation: delete the
cap and the two small viewports fail; delete the pointer gate and the laptop case fails.

### F3 — A start control, visible and tappable

`drawOverlay`'s idle branch (`:5336`) receives `'Press ENTER to Start'` from `:7229` and
never renders it. Render the subtext through `fillTextClipped` inside a bordered button in
the **lower third** of the play area, at ≥ 4.5:1 on the backdrop it is actually painted
over, plus a tap band accepted in the `touchend` handler (the install-button `tapY` code
at `:9655` is the pattern). Touch variant copy: "👆 Tap to play". Keyboard path unchanged.

**Design decision (R2-1):** on a touch device at idle, a tap **outside** the band does
nothing — the band is the start control, not decoration. (Today any idle canvas tap
starts the run; that catch-all is what made the band unfalsifiable.) Returning visitors
tap the visible band instead of anywhere; the control is large and labelled. Keyboard
`Enter` keeps starting from anywhere.

Also raise `.shortcut-dim` (`#555`, 2.13:1) to ≥ 4.5:1, and give the idle footer prompt
a touch variant ("Tap the button above" wording) so the string sweep (F4) passes.

**Gate:** the band's rect intersects the visual viewport at 320×568 **before** any tap
assertion (R2-10). Contrast is asserted on a **named pixel pair** (R2-2): the darkest
glyph pixel in the band text vs the backdrop pixel directly under the band rect (board
drawn first) — sampling fill against the band's own border is not the test. The footer
prompt's resolved text/background pair is asserted ≥ 4.5:1 at 320×568 and 390×844. Tap
assertions: the band's centre takes `idle → playing`; a tap 200 px away leaves
`gameState === 'idle'` (the negative case — this is the assertion that fails if the band's
hit-test is removed). Physical size (R1-3): band height ≥ 24 physical px at 320×568
(WCAG 2.5.8 floor; design it ≥ 60 canvas px so it clears comfortably). Mutations: change
the fill to `#555` (contrast fails); remove the band hit-test (negative case fails);
move the band off-screen (viewport assertion fails).

### F4 — Onboarding that is true, and useful

Two decisions, both copy-and-a-few-lines:

1. **The first tap on the welcome overlay dismisses *and* starts** (remove the early
   `return` at `:9583`–`:9591` on the touch path, falling through to the existing
   `idle` → `Enter` dispatch). One deliberate tap, and the copy that promises it is then true. **Swipe
   discrimination is displacement-based, not time-based (R1-2):** the touch handler
   already owns a swipe displacement threshold — a touch that crosses it is a swipe and
   never a start; a tap that does not, starts. The realistic accidental gesture on a
   full-viewport, `overflow: hidden` page is pull-to-refresh or an address-bar drag —
   both are drags, both cross the threshold, and `overscroll-behavior-y: contain` is
   added on `body` so the browser stops pull-to-refresh at the document edge. (Rev 1's
   250 ms window is deleted: the page has nothing to scroll, so the "scrolling visitor"
   it guarded cannot exist.)
2. **Replace the "Progression" panel's touch text.** "Press C for cosmetics!" (`:5050`) is
   both unreachable (F5 deferred) and irrelevant in run one; put the two facts that end
   run one: *"A rival hunts your food — ram its side, never its head."* and *"Rifts pulse
   — cross while they're dim."* No new system, no mechanic: copy from facts the game
   already enforces.

**Gate:** on a touch context assert the exact drawn replacement strings (not a regex
alone — R2-8), **and** that no drawn string on the touch-context screens {welcome, idle,
gameover} matches `/Press\s/` (idle via F3's touch copy, gameover via F7's). Exactly one
`touchscreen.tap` on the welcome overlay yields `gameState === 'playing'`. A swipe
fixture (drag past the existing displacement threshold, on the overlay) does **not**
start a run. Mutations: restore the `return` (tap assertion fails); keep the old copy
(exact-string assertion fails); delete the displacement check (swipe fixture fails).
**Same commit** updates the `AGENTS.md` First-Time Onboarding note, which currently
records the opposite behaviour. Re-run F1's gate here (`overlay_gone` semantics changed).

### F6 — A survivable opening lane

No obstacle may occupy `{head.x + k·TILE, head.y}` for k = 1..4 at spawn. Test the
**pattern's tile set**, not its anchor — that is the actual bug: `generateObstacles()`
(`:3360`) applies the 3-tile Manhattan rule to the anchor while four of the five
`OBSTACLE_PATTERNS` extend beside it. **`generateObstaclesForWave` (gauntlet) gets its
own probe, not a sentence (R2-11).** Do not touch `findFreeTile`'s shared 3-tile guard —
five death-save callers depend on it (`AGENTS.md`, v13 spawn geometry).

Changes the board for every seed (daily, diary, ghost arena). Accepted: no stranger
history exists to invalidate (all local-device), and this is the only free window to fix
it. **The deploy date is recorded as the board-generation cut-over in F10's report
(R1-4)** so the first funnel read cannot attribute a board change to a UX change.

**Gate:** the 3000-seed probe as a test — 0 boards with an obstacle in lane tiles 1–4 —
plus the same probe against `generateObstaclesForWave` fixtures. Mutation: drop the
corridor test (2.6%/4.5% return); test only the anchor (the 0.9% two-tile case
survives), which is why the assertion is tiles 1–4.

### F7 — The recap card survives its first tap

Share leaves with F8 (R1-1): this feature is the tap-guard alone — the measured bug is
that a reflex tap destroys the card before the player can read their score.

`gameOverAt` recorded in `gameOver()` **and** `endZenSession()` (both-hooks rule). The
`gameover` tap branch (`:9666`) ignores a restart tap for 500 ms after death. Keyboard
`Enter` at game over keeps restarting immediately — stated, not silently changed. The
recap prompt gets a touch variant ("Tap to play again") so F4's string sweep passes.

**Gate:** a tap 150 ms after death leaves `gameState === 'gameover'` and `recapData`
intact; a tap at 700 ms restarts; keyboard `Enter` immediately after death restarts.
Mutation: delete the 500 ms guard (first assertion fails).

### F9 — Link previews

`<title>Snakes</title>`, `<meta name="description">`, `og:title`, `og:description`,
`og:url`, `og:image` (absolute URL), `twitter:card`, plus one hand-picked 1200×630 PNG
in the deploy repo. Also corrects the repo README's stale "3 keys" privacy line to the
real list using the wording that stays true. **Not cuttable (R1-1):** this is the only
feature aimed at JC's posts, the sole traffic source and the start of the 30-day window.

**Gate:** after deploy, fetch the page and assert the tags exist and `og:image` returns
200 with `image/png`. A relative `og:image` must fail the check — that is the trap.

### F10 — The report and the decision rule

Rewrite `/opt/shared/reports/snakes/counter-snapshot.sh`: read **yesterday's** `day-*` key
and every funnel key, one append-only line per described date (skip a date already
present), `--backfill <since>` for gaps (2026-10-20 is still readable from Abacus),
`--dry-run`, and a printed rate table (`start/load`, `first_food/start`). Guard: the
script asserts every URL it fetches is a `/get/` — a counting job in the snapshot script
would be the worst bug in this file. **The v15 deploy date is recorded in the report as
the board-generation cut-over (R1-4, for F6) and the funnel-version cut-over (for F1).**

**Decision rule, full matrix (R2-5, R2-6)** — window = 30 days from JC's last post;
thresholds read `ch_github` (a deliberate visit); `ch_itch` and `ch_other` are reported
alongside but do not steer the branches:

| Loads (`ch_github`) | `start/load` | `first_food/start` | Action |
|---|---|---|---|
| ≥ 20 | ≥ 30% | ≥ 70% | **Continue** (next cycle) |
| ≥ 20 | < 30% | — | **Patch the door once** (v15.1, entry-path only) |
| ≥ 20 | 30–100% | < 70% | **Patch the opening run once** (v15.1 targeted at `first_food`) |
| < 20 | — | — | **Park the game** (with the posts actually made) |
| < 20 | — | — | and posts **not** made: the window has not started — post first, then read; no game work |

Caveats written into the report, not the fine print: at n < 10 in any denominator the
branch is advisory and goes to JC (a 70% rate swings on ~2 visitors); `die_*` on
`ch_itch` is right-censored by the ~90 s iframe lifetime, so death buckets are not
comparable across channels; a Zen quit is a `start` with no death key (R1-5). Report
format: counts *with* rates ("23 loads, 9 started (39%), 7 ate a first food"), never a
bare percentage at n≈30, and our known-ours loads subtracted by name and date.

**Gate:** run against the live read-only API and assert a row for 2026-10-20 with
`day_loads = 2`, one for 2026-11-13 with 2, and no row dated today; assert the printed
rate table against fixture counts, not by eye (R2-12). Mutation: point it at today and
the last assertion fails.

## Explicitly not in v15

- **F5 — touch entries for the panels** (rev 1 cut, R1-1): the unreachability is real (25
  taps opened nothing) but nothing in the evidence says a first-visit player needs
  Quests or Cosmetics in ten seconds; the plan's own "other four stay keyboard-only"
  conceded the line was arbitrary. Defers to v16 with everything else meta, along with
  context fail-today test 6.
- **F8 — a run you can send** (rev 1 cut, R1-1): M-sized, serving a path with zero
  lifetime exercise — no run has ever been finished, so no challenge link has ever been
  sent or received. Share leaves F7 with it, along with the landing-overlay
  Play/Not-now work and context fail-today test 5. Re-enters with its rev-1 gate plus
  R2-7's precedence fixture (fresh profile + challenge hash must show the challenge, not
  the welcome overlay).
- **Pause-menu footer copy** ("↑↓ Navigate | Enter Select…"): describes real keyboard
  bindings and sits beside real touch hit regions; deferred with F5 as a mid-run meta
  surface, not a first-ten-seconds one.
- **Minting a seed per run.** Rejected with evidence (`ctx §9`): too late (the seed is
  derived in `resetGame()`), too wide (`:8114` deletes speed food for everyone), and it
  writes a replay per run.
- **First-food spawn guarantee** (first-contact 10). A second board-changing change in
  one release for a metric we have not read yet. Revisit after the December read.
- **Hiding the seed field on touch** (first-contact 7). Park it with the deferred-items
  list rather than risk a silent seed applying invisibly.
- **Advice lines on the recap card** (first-contact 8). If the funnel shows deaths
  clustered in run one, this is the first thing to add back.
- **Leaderboards, accounts, a second analytics service, a custom domain, generated
  preview images.** All either need a backend, break the privacy rule, or change the
  measurement origin mid-window.
- **v14's nine recorded non-fixes** stay parked.

## Acceptance for the theme (must be true, measured, before we call it done)

1. The context file's fail-today tests that belong to shipped features pass: **1, 2, 3,
   4, 7** (tests 5 and 6 defer with F8 and F5).
2. A phone visitor on a fresh profile goes URL → moving snake in **one deliberate tap**
   (F4), measured in an emulated mobile context, with the path written in plain words in
   `v15-code-review.md`.
3. The whole board is on screen at 320×568 in all four states, and stays on screen
   through URL-bar collapse and rotation.
4. 0 of 3000 opening boards kill the run before the second input (classic spawn **and**
   gauntlet wave 1).
5. The funnel returns distinct step values on the deployed origin from a scripted visit
   with `snake_nocount` **off** — one load only, recorded in the deploy note — and our
   automated traffic never reaches Abacus.
6. `start / load` and `first_food / start` are computable from `counter-snapshot.sh`
   output without hand arithmetic — asserted against fixtures, not by eye.

## Ground rules that bind this plan

Beacons inert off the production origin (F1's allow-list is a narrowing of the same rule,
documented, not a loosening) and fire-and-forget; snapshot fields additive, never
`SNAPSHOT_VERSION`; per-run state resets in BOTH `resetGame()` and `resetWaveState()`;
session-end logic in BOTH `gameOver()` and `endZenSession()` (F7); canvas save/restore on
all paths and assertions on drawing state, not depth (F3, F7); nothing calibrated for
60fps; `fillTextClipped` for text, never a tuned pixel offset (v12's
environment-dependent metrics lesson); an assertion that cannot fail is not an
assertion; nothing advertised is a lie — F4 and F9 are that standard applied to
onboarding and to the post copy.

## Risks, honestly

1. **F2 changes layout for every device.** Still the largest regression surface —
   mitigated by scale-only, the touch-narrowed `compact` class, the 390×844 and 1366×768
   unchanged-assertions, the mid-session resize cases, and screenshots at four viewports.
2. **F4 reverses a documented mobile behaviour.** The accidental-start concern is
   answered with displacement discrimination + `overscroll-behavior-y: contain` (R1-2),
   and the welcome overlay appears once per device; the `AGENTS.md` note is updated in
   the same commit.
3. **F3's negative case changes idle-touch behaviour** (taps outside the band no longer
   start). Deliberate: the band must be load-bearing to be testable, and a visible
   labelled control beats an invisible catch-all. Keyboard path unchanged.
4. **F1 widens the beacon host set.** A privacy-relevant change; the allow-list must be
   reviewable in one line and the copy in F9 must match it.
5. **F6 changes every seeded board.** Accepted once; the cut-over date is recorded (R1-4).
6. **F10 edits a file in `jeko`'s crontab on a shared box.** Dry-run first, old behaviour
   reachable by flag.

## Done means

Full suite green (309 baseline + the new v15 assertions) plus the live Chromium checks
with screenshots; `AGENTS.md` carries a v15 section; `v15-code-review.md` exists (v14 left
no artifact — that gap is a process defect, closed this cycle); committed and pushed;
JC reviews → approves → deploy through `github.com/j3k0/snakes` (`index.html`) → counter
check with our traffic excluded → JC's posts, day 0 = his last post (FOV-2676a). The ship
date is recorded in the 2026-11-19 report as both the funnel and the board cut-over.
