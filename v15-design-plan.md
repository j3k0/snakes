# v15 design plan — the first ten seconds

Issue FOV-2676. Written 2026-11-13 by the issue owner (step 2), on `36f2504`, game
`ee0e3f2`. Inputs: `v15-ideation-context.md` (measured facts), and the three lenses
`v15-ideas-first-contact.md`, `v15-ideas-measurement.md`, `v15-ideas-distribution.md`.

**Authorship warning for the reviewers (step 3):** step 1 normally comes from three
independent subagents. All three failed on a degraded endpoint, so the lenses are
single-authored by me. Reviewers: be harder than usual on whether each change is worth
its risk, and on whether the ordering assumption below (measurement first, viewport
before canvas placement) actually holds.

## Goal and the one sentence test

A stranger on a phone opens the URL, sees a control, taps, moves the snake, does not die
before they can react, and can send a friend a link that means something. Every load that
happens after the change produces numbers that say which of those steps is failing — and
the numbers do not include us.

## Scope — what ships, in order

Ten features. Each is one commit, each lands with its gate. Ordering is not cosmetic:
F1 ships before any entry-path change (the rule the owner set — ship the counters with or
before the change or the cycle cannot be judged), and F3/F5 ship after F2 because a
control placed in the canvas is invisible on exactly the screens F2 fixes.

| # | Feature | Source ideas | Size |
|---|---|---|---|
| **F1** | Funnel v2: ~10 one-shot keys, channel from hostname, opt-out for our own traffic | measurement 1, 2, 5, 6, 8, 10 | M |
| **F2** | The board fits the phone (canvas height cap + compact chrome) | first-contact 1 | M |
| **F3** | A start control in the canvas, lower third, ≥ 4.5:1, tappable; footer prompt legible | first-contact 2, 9 | S |
| **F4** | Onboarding that tells the truth on touch, and teaches the two things that kill you | first-contact 3 | S |
| **F5** | Quests, Cosmetics, Settings within one tap on touch | first-contact 4 | M |
| **F6** | A survivable opening lane | first-contact 5 | S |
| **F7** | The recap card survives its first tap, and carries Share | first-contact 6, distribution 4 | S |
| **F8** | A run you can send: score-only challenge link, canonical URL, Play/Not-now landing | distribution 2, 7 | M |
| **F9** | Link-preview metadata, real title, one preview image | distribution 1 | S |
| **F10** | A daily funnel report and a written decision rule | measurement 3, 4, 9 | S–M |

### F1 — Funnel v2

Add to the four existing Abacus keys: `overlay_gone`, `first_food`, `touch` / `keys`,
`shared`, `paused_early`, death buckets (`die_wall`, `die_self`, `die_obs`, `die_rival`,
`die_hazard`, `die_time`, `die_other`), and channel (`ch_github`, `ch_itch`, `ch_other`).

- One `bump(key)` wrapper owning a `Set` of keys already fired this **page load**, so no
  step double-counts — `gameOver()` has no double-call guard and `finish` is its first
  statement (`:3869`).
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
  the cause string, and a rescue fires no death key.

**Gate:** a scripted visit asserts one `load`, one `overlay_gone`, one `start`, one
`first_food`, exactly one death-bucket key, one `touch`; zero requests to the counting
host on `file://` and zero with `snake_nocount` set; a double-`gameOver()` fixture still
produces one death key. Mutation targets: the once-per-load `Set`, and the rescue
exclusion.

### F2 — The board fits the phone

`resizeCanvas()` already handles `DPR`, the backing store and `gridCacheTheme`; extend it
to cap the canvas's CSS height at `window.innerHeight` minus the measured visible DOM
chrome, exposed as a CSS custom property, and to add a `compact` body class below ~700
CSS px of viewport height that hides `h1`, `#score`, `#highScore` — the same three
elements standalone mode already hides (`:67`–`:72`), so the design exists and is only
gated on the wrong condition today.

**Gate:** for {320×568, 360×640} × {welcome, idle, playing, gameover}, assert board row 0
and row 19 are inside the visual viewport (computed from `getBoundingClientRect()` and the
canvas scale, not from CSS). Also assert 390×844 is unchanged — a fix that breaks the
common phone is a bug, not a win. Mutation: delete the cap and confirm the two small
viewports fail.

### F3 — A start control, visible and tappable

`drawOverlay`'s idle branch (`:5336`) receives `'Press ENTER to Start'` from `:7229` and
never renders it. Render the subtext through `fillTextClipped` inside a bordered button in
the **lower third** of the play area (below the F2 clip line by construction), at
≥ 4.5:1 on the backdrop it is actually painted over, plus a tap band accepted in the
`touchend` handler (the install-button `tapY` code at `:9655` is the pattern). Touch
variant copy: "👆 Tap to play". Keyboard path unchanged. Also raise `.shortcut-dim`
(`#555`, 2.13:1) to ≥ 4.5:1.

**Gate:** pixel-sample the band and assert the contrast ratio ≥ 4.5:1; assert a tap at the
band's centre takes `gameState` from `idle` to `playing`. Mutation: change the fill to
`#555` (contrast fails) and remove the band (tap fails).

### F4 — Onboarding that is true, and useful

Two decisions, both copy-and-one-line:

1. **The first tap on the welcome overlay dismisses *and* starts** (remove the early
   `return` at `:9663` on the touch path, falling through to the existing `idle` → `Enter`
   dispatch). One deliberate tap, and the copy that promises it is then true. A swipe
   started on the overlay within 250 ms is still a swipe, so a scrolling visitor does not
   accidentally start a run.
2. **Replace the "Progression" panel's touch text.** "Press C for cosmetics!" (`:5050`) is
   both unreachable and irrelevant in run one; put the two facts that end run one:
   *"A rival hunts your food — ram its side, never its head."* and *"Rifts pulse — cross
   while they're dim."* No new system, no mechanic: copy from facts the game already
   enforces.

**Gate:** on a touch context assert no drawn welcome string matches `/Press\s/`, and that
exactly one `touchscreen.tap` yields `gameState === 'playing'`. Mutation: restore the
`return` and the second assertion fails; keep the old copy and the regex assertion fails.
**Same commit** must update the `AGENTS.md` First-Time Onboarding note, which currently
records the opposite behaviour ("on mobile touch dismisses without dispatching Enter").

### F5 — Quests, Cosmetics, Settings within one tap

All seven `show*Panel()` calls are keyboard-only (`:9126`–`:9402`); a phone player can
reach none. Ship three entries on the idle screen — a canvas row beside the F3 control
(Quests, Cosmetics, Settings). The other four (Stats, Achievements, Brews, Diary) stay
keyboard-only this cycle: meta-surfaces, not first-visit surfaces.

**Gate:** with `hasTouch`, assert a tap on each labelled band sets that panel's
`display !== 'none'`, and that opening one hides the others (the explicit cross-hide
contract). Mutation: move a band 200 px and the assertion fails on the wrong panel.

### F6 — A survivable opening lane

No obstacle may occupy `{head.x + k·TILE, head.y}` for k = 1..4 at spawn. Test the
**pattern's tile set**, not its anchor — that is the actual bug: `generateObstacles()`
(`:3360`) applies the 3-tile Manhattan rule to the anchor while four of the five
`OBSTACLE_PATTERNS` extend beside it. Check `generateObstaclesForWave` (gauntlet) for the
same corridor. Do not touch `findFreeTile`'s shared 3-tile guard — five death-save callers
depend on it (`AGENTS.md`, v13 spawn geometry).

Changes the board for every seed (daily, diary, ghost arena). Accepted: no players are
affected today, and the acceptance test cannot pass otherwise.

**Gate:** the 3000-seed probe as a test — 0 boards with an obstacle in lane tiles 1–4.
Mutation: drop the corridor test (2.6%/4.5% return); test only the anchor (the 0.9%
two-tile case survives), which is why the assertion is tiles 1–4.

### F7 — The recap card survives its first tap, and can be shared

`gameOverAt` recorded in `gameOver()` **and** `endZenSession()` (both-hooks rule). The
`gameover` tap branch (`:9666`) evaluates the card's own hit areas first, then ignores a
restart tap for 500 ms. Keyboard `Enter` at game over keeps restarting immediately —
stated, not silently changed.

**Gate:** a tap 150 ms after death leaves `gameState === 'gameover'` and `recapData`
intact; a tap at 700 ms restarts; a Share tap copies and does not restart. Mutation: move
the Share check below the catch-all and the third assertion fails — the bug this feature
exists to avoid.

### F8 — A run you can send a friend

- `CANONICAL_BASE = 'https://j3k0.github.io/snakes/'` — share text is built from it, never
  from `location.origin` (inside an itch iframe that is `*.itch.zone`, and those nested
  links change between versions).
- **Score-only challenge link**: `#classic~~120`. `parseChallengeUrl` (`:628`) accepts an
  empty seed when a score is present (`:635` is the only blocker); the accept path (`:9132`)
  leaves `seedField` empty, so the run stays unseeded and the whole seeded surface
  (replays, ghosts, the speed-food gate at `:8114`) is untouched. `daily` stays rejected.
  `CHALLENGE_URL_VERSION` stays 1 with both forms documented.
- The landing overlay (`:6628`) gets **Play** and **Not now**, tappable; Not-now clears
  `challengeFromUrl` and the hash. Fix the precedence with the welcome overlay so a
  challenge link to a brand-new visitor shows the challenge, not the welcome screen.

**Gate:** the four parser cases plus the two behaviour cases (Not-now leaves `idle` with a
clean hash; Play shows the target HUD) plus the load-bearing one — after accepting a
score-only challenge, `activeSeed === null` and `tickInterval === getEffectiveSpeed()`.
Mutation: set `seedField.value = seed` unconditionally and the last assertion fails.

### F9 — Link previews

`<title>Snakes</title>`, `<meta name="description">`, `og:title`, `og:description`,
`og:url`, `og:image` (absolute URL), `twitter:card`, plus one hand-picked 1200×630 PNG in
the deploy repo. Also corrects the repo README's stale "3 keys" privacy line to the real
list (it will be ~10 after F1) using the wording that stays true.

**Gate:** after deploy, fetch the page and assert the tags exist and `og:image` returns
200 with `image/png`. A relative `og:image` must fail the check — that is the trap.

### F10 — The report and the decision rule

Rewrite `/opt/shared/reports/snakes/counter-snapshot.sh`: read **yesterday's** `day-*` key
and every funnel key, one append-only line per described date (skip a date already
present), `--backfill <since>` for gaps (2026-10-20 is still readable from Abacus),
`--dry-run`, and a printed rate table (`start/load`, `first_food/start`). Guard: the
script asserts every URL it fetches is a `/get/` — a counting job in the snapshot script
would be the worst bug in this file.

Decision rule (owner to approve; thresholds fixed **before** the data exists), window =
30 days from JC's last post:
- **Continue** if ≥ 20 non-our loads and `first_food / start` ≥ 70%.
- **Fix the door once** if ≥ 20 loads but `start / load` < 30% — a v15.1 patch, not a
  cycle.
- **Park the game** if < 20 non-our loads with the posts actually made: distribution is
  demonstrably not the missing piece and more game work cannot fix it.
- Report format: counts *with* rates ("23 loads, 9 started (39%), 7 ate a first food"),
  never a bare percentage at n≈30, and our known-ours loads subtracted by name and date.

**Gate:** run against the live read-only API and assert a row for 2026-10-20 with
`day_loads = 2`, one for 2026-10-19 with 15, and no row dated today. Mutation: point it at
today and the last assertion fails.

## Explicitly not in v15

- **Minting a seed per run.** Rejected with evidence (`ctx §9`): too late (the seed is
  derived in `resetGame()`), too wide (`:8114` deletes speed food for everyone), and it
  writes a replay per run.
- **First-food spawn guarantee** (first-contact 10). A second board-changing change in one
  release for a metric we have not read yet. Revisit after the December read.
- **Hiding the seed field on touch** (first-contact 7). Small, but it touches the
  manual-seed path that the diary and challenge accept both write to. Park it with the
  deferred-items list rather than risk a silent seed applying invisibly.
- **Advice lines on the recap card** (first-contact 8). The card already names the cause;
  F4 teaches at first contact. If the funnel shows deaths clustered in run one, this is
  the first thing to add back.
- **Touch entries for Stats, Achievements, Brews, Diary.** Meta surfaces; three is the
  first-visit answer.
- **Leaderboards, accounts, a second analytics service, a custom domain, generated preview
  images.** All either need a backend, break the privacy rule, or change the measurement
  origin mid-window (`ctx §"decisions"`).
- **v14's nine recorded non-fixes** stay parked.

## Acceptance for the theme (must be true, measured, before we call it done)

1. The context file's seven "fail today" tests all pass.
2. A phone visitor on a fresh profile goes URL → moving snake in **one deliberate tap**
   (F4), measured in an emulated mobile context, with the path written in plain words in
   `v15-code-review.md`.
3. The whole board is on screen at 320×568 in all four states.
4. 0 of 3000 opening boards kill the run before the second input.
5. The funnel returns distinct step values on the deployed origin from a scripted visit
   with `snake_nocount` **off** — one load only, recorded in the deploy note — and our
   automated traffic never reaches Abacus.
6. `start / load` and `first_food / start` are computable from `counter-snapshot.sh`
   output without hand arithmetic.

## Ground rules that bind this plan

Beacons inert off the production origin (F1's allow-list is a narrowing of the same rule,
documented, not a loosening) and fire-and-forget; snapshot fields additive, never
`SNAPSHOT_VERSION`; per-run state resets in BOTH `resetGame()` and `resetWaveState()`;
session-end logic in BOTH `gameOver()` and `endZenSession()` (F7); canvas save/restore on
all paths and assertions on drawing state, not depth (F3, F5, F7); nothing calibrated for
60fps; `fillTextClipped` for text, never a tuned pixel offset (v12's environment-dependent
metrics lesson); an assertion that cannot fail is not an assertion; nothing advertised is
a lie — F4 and F9 are that standard applied to onboarding and to the post copy.

## Risks, honestly

1. **F2 changes layout for every device.** The largest regression surface in the cycle.
   Mitigated by the 390×844 unchanged-assertion and screenshots at four viewports.
2. **F4 reverses a documented mobile behaviour.** If the accidental-start concern was real
   (it is recorded in `AGENTS.md`), the 250 ms swipe window is the mitigation; the reviewer
   should challenge that specifically.
3. **F1 widens the beacon host set.** A privacy-relevant change; the allow-list must be
   reviewable in one line and the copy in F9 must match it.
4. **F6 and (deferred) first-food proximity change every seeded board.** Accepted once;
   the reason to stop at one.
5. **F10 edits a file in `jeko`'s crontab on a shared box.** Dry-run first, old behaviour
   reachable by flag.
6. **Single-authored ideation.** The real mitigation is step 3; if the reviewers find the
   scope too large, the drop order is F5, then F9 → deferred, then F4's option (a) →
   option (b).

## Done means

Full suite green (309 baseline + the new v15 assertions) plus the live Chromium checks
with screenshots; `AGENTS.md` carries a v15 section; `v15-code-review.md` exists (v14 left
no artifact — that gap is a process defect, closed this cycle); committed and pushed;
JC reviews → approves → deploy through `github.com/j3k0/snakes` (`index.html`) → counter
check with our traffic excluded → JC's posts, day 0 = his last post (FOV-2676a).
