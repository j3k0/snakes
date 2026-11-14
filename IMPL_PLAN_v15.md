# Implementation plan — v15 (the first ten seconds)

FOV-2676, step 4. Written 2026-11-14 against the game at `ee0e3f2` + the v15 docs
(`d19f055`..`1215178`), from `v15-design-plan.md` **rev 2** (both review rounds folded —
see its disposition table). **Step 5 (`v15-impl-review.md`) folded in:** the
funnel-sequence fixture now runs on a host-mapped origin instead of an after-load
monkeypatch (init-time keys cannot be resurrected); the `touch`/`keys` gate is
restored with a winner-suppression mutation; `compact` uses `matchMedia('(pointer:
coarse)')` (not `hasTouch`) with a 1280×650 fine-pointer fixture and a working pointer-gate
mutation; the C3 contrast gate specifies a min/max-luminance method; `paused_early`
is per-run (both resets), no per-load latch; the rotation fixture is a dimension swap;
`startBandRect` is nulled off-path. Line anchors below were verified against
`snake.html` as of `1215178` (the step-5 reviewer re-verified six of them); re-anchor
by symbol before editing.

## Contract (binds every commit)

- Snapshot fields additive, `SNAPSHOT_VERSION` untouched.
- Per-run state resets in BOTH `resetGame()` and `resetWaveState()`.
- Session-end logic in BOTH `gameOver()` and `endZenSession()`.
- Canvas save/restore paired on all paths; assertions on drawing state, not depth.
- Canvas text through `fillTextClipped`, never a tuned pixel offset.
- Beacons fire-and-forget, inert off the allow-list, `snake_nocount` respected.
- An assertion that cannot fail is not an assertion — every gate names its mutation.
- Baseline to keep green: 309 assertions / 14 suites (`node test-*.mjs`) on `ee0e3f2`.
- New suite: `test-v15.mjs` (Playwright, `file://` only — never open
  `https://j3k0.github.io/snakes/`, that is counted production traffic).

## Commit order (one feature per commit)

C1 F1 (counters) → C2 F2 (viewport) → C3 F3 (start band) → C4 F4 (onboarding) →
C5 F6 (opening lane) → C6 F7 (recap tap-guard) → C7 F9 (metadata) → C8 F10 (report +
rule) → C9 docs (`AGENTS.md` v15 section + `v15-code-review.md`).

F1 first is JC's rule: the counters land before any entry-path change. F3 needs F2
(a control in the canvas is invisible until the canvas fits). F4's string sweep needs
F3's touch copy on idle, so F4 follows F3. C4 and C6 touch the same gameover prompt;
C4 lands the touch variant, C6 the guard.

---

## C1 — F1: Funnel v2

**Anchors:** `_snakesCount` `:142`–`:146` (gate + `load` + `day-*`); `startGame` count
`:2590`; `gameOver` count `:3869`; `endZenSession` count `:3960`; eat block
(`sessionFoodEaten`) ~`:8160`; input handlers (`keydown` ~`:9126`, `touchend` `:9577`).

**Implementation.**

1. Replace the ternary `_snakesCount` with:
   - `isCountedHost(h)` — a plain function (window global, test-visible): `j3k0.github.io`
     → true; `*.itch.zone` → true; `*.newgrounds.com` → true; everything else false
     (`file://`, `localhost`, CI never match).
   - `channelForHost(h)` — `j3k0.github.io` → `ch_github`, `*.itch.zone` → `ch_itch`,
     `*.newgrounds.com` → `ch_other`, **any other counted host → `ch_other`** (the
     fallback is defined; on `file://` the gate runs first, but the test pins the
     fallback anyway — impl-review 1).
   - `snakeBump(key)` — the single send path: no-op when `!isCountedHost(location.hostname)`
     **resolved by bare name at call time — never captured at module init** (an
     init-time capture would freeze the `file://` answer and make the gate
     unpatchable for tests),
     no-op when `localStorage.snake_nocount === '1'`, no-op when `key` is in the
     once-per-load `Set` (module-scope `const _firedFunnel = new Set()`), else
     `fetch('https://abacus.jasoncameron.dev/hit/j3k0.github.io/' + key, { mode:
     'no-cors', keepalive: true })` and add to the set. The old `_snakesCount(key)`
     call sites become `snakeBump(key)` — same inert-on-`file://` behaviour, now via the
     allow-list.
2. New keys, each a single `snakeBump` at the site named:
   - `ch_*` — once at module init, from `channelForHost(location.hostname)`.
   - `overlay_gone` — on welcome-overlay dismissal (the F4 commit makes this the same
     tap that starts; semantics documented in F10).
   - `first_food` — in the primary eat block, once per load (the set enforces it).
   - `touch` / `keys` — first game-relevant input wins: first consumed `keydown` fires
     `keys`, first consumed tap/swipe fires `touch`; whichever fires first suppresses
     the other via the set.
   - `paused_early` — pause toggled within the first 50 ticks (~6 s at the 120 ms base
     interval) of **a run start** (a per-run tick counter, reset in BOTH `resetGame()`
     and `resetWaveState()`; the once-per-load `Set` enforces one `paused_early` per
     load, so no per-load latch is needed — impl-review 5).
   - death buckets in `gameOver()` (and only there — rescues never reach it): fixed map
     from `lastDeathCause`, never a substring of the cause string:
     | `lastDeathCause` | key |
     |---|---|
     | `'Hit the wall!'` | `die_wall` |
     | `'You ran into yourself!'` | `die_self` |
     | `'Hit an obstacle!'` | `die_obs` |
     | `'You charged the rival head-on!'`, `'You ran into the rival!'` | `die_rival` |
     | `'Caught in a hazard rift!'` | `die_hazard` |
     | `'Time\'s up!'` | `die_time` |
     | `'Starvation!'`, `'You shrunk to nothing!'`, `'Caught by the shrinking zone!'`, `'The board filled up!'` | `die_other` |
     `'Zen session ended.'` fires no bucket (no death). The map lives in one
     `DEATH_BUCKET` const so the review can check it in one place.
3. `snake_nocount`: set in every scripted live check (deploy verification), documented
   in the deploy note.

**Gate (`test-v15.mjs`):** stub `fetch` via `page.route`, then:
- **Init keys under a host-mapped origin — the funnel-sequence fixture (impl-review 1):**
  launch Chromium with `--host-resolver-rules="MAP j3k0.github.io 127.0.0.1"` and serve
  the game from a local HTTP server, `fetch` stubbed, so the REAL `isCountedHost` /
  `channelForHost` gate runs at module init and the init-time keys (`load`, `day-*`,
  `ch_github`) are observable. (Patching `isCountedHost` after load cannot resurrect
  init-time keys — they no-opped before the patch existed and nothing re-attempts them.
  After-load patching is used only for the C4 re-run of this gate.)
- scripted visit on `file://`: **zero requests to the counting host** (the `file://`
  inertness assertion);
- with `localStorage.snake_nocount = '1'` on the host-mapped origin: nothing sends,
  at init or after;
- on the host-mapped origin, drive the funnel end to end and assert the sequence:
  `load`, `day-*`, `ch_github`, `overlay_gone` (dismiss), `start` + `first_food`
  (start, eat), exactly one `die_*` (die), `touch` or `keys` (below); a second run in
  the same load → no duplicate `start`/`first_food`/`die_*` (the set holds);
- **first input — the design's `touch`/`keys` gate, restored (impl-review 2):** a
  tap-driven fixture fires `touch` and never `keys`; a keyboard-driven fixture fires
  `keys` and never `touch` (whichever fires first wins and the `Set` suppresses the
  other);
- double-`gameOver()` fixture (call it twice): one `finish`, one bucket.
- **rescue fixture (R2-4):** grant a shield, drive an obstacle hit that the shield
  saves, then a real wall death → exactly one bucket, `die_wall`, and no bucket for
  the saved hit; a shield-saved run that then quits to idle → zero death keys.
- **host gate units (R2-3):** `isCountedHost('j3k0.github.io')`,
  `isCountedHost('foo.itch.zone')`, `isCountedHost('www.newgrounds.com')` true;
  `isCountedHost('localhost')`, `isCountedHost('')` false (that is the `file://` case);
  `channelForHost` maps each to its `ch_*`.

**Mutations to verify the gate:** delete the `Set` membership check → the
second-run-no-duplicate assertion fails; add `lastSaveEvent` to the bucket map → the
rescue fixture fails; remove `*.itch.zone` from the gate → the host-gate unit fails;
delete the `touch`/`keys` send sites → the first-input assertions fail.

## C2 — F2: the board fits the phone (scale-only)

**Anchors:** `resizeCanvas` `:2833`–`:2861` (already aspect-fit: `scale =
min(scaleX, scaleY, 1)`, `Math.max(300, …)` floor — the mechanism exists; the bug is
that `chromeOffset` counts only `#score` + `#dpad` + 16 px); `body` CSS `:10`–`:21`;
`h1` `:22`; `@media (max-width: 480px)` `:42`; `#menuFooter` CSS `:50`–`:64`, DOM
`:77`; the standalone-hide block `:67`–`:72` (the design reference for `compact`).

**Implementation.**

1. Extend the chrome accounting in `resizeCanvas`: measure `h1`, `#highScore`,
   `#menuFooter`, `#score`, `#dpad` and the body padding (5 px mobile), each only while
   it is visible (`offsetHeight` is 0 once hidden), and subtract them plus real
   margins from `window.innerHeight`. Keep the existing `min(scaleX, scaleY, 1)`
   scale — **no clipping path may exist**: the canvas must always scale, never crop.
2. Expose the applied scale for tests and the touch handler:
   `document.documentElement.style.setProperty('--snakes-scale', String(scale))`.
3. `compact` body class, toggled in `resizeCanvas`:
   `window.matchMedia('(pointer: coarse)').matches && window.innerHeight < 700` —
   **`matchMedia`, not `hasTouch`** (they differ on fine-pointer touch laptops; R2-9
   named the media query — impl-review 3). The pointer gate means a 1366×768 laptop
   can never fire it. CSS: `.compact h1 { display: none; }` **only** at first;
   `#score`/`#highScore` join only if the 320×568 gate cannot pass without them
   (hiding the live score is a cost paid on demand — R1-3).
4. `overscroll-behavior-y: contain` on `body` (needed by C4; landed here because it is
   body CSS).
5. Resize is already debounced (`debouncedResize` `:2863`); URL-bar collapse and
   rotation arrive as resizes — nothing new to listen for, but `resizeCanvas` must
   not read cached chrome heights from before the class toggles (measure, toggle,
   re-measure in one pass).

**Gate:** for {320×568, 360×640} × {welcome, idle, playing, gameover}: board row 0 and
row 19 inside the visual viewport — compute from `getBoundingClientRect()` and the
canvas scale, never from CSS. 390×844 and 1366×768 unchanged (and at 1366×768,
`h1`/`#score`/`#highScore` visible — no `compact`). **Plus a fine-pointer case,
1280×650: no `compact` — the pointer gate must hold even where the height gate alone
would fire (impl-review 3).** Mid-session: shrink the viewport 80 px mid-play
(URL-bar collapse) and **swap the viewport dimensions mid-play** (568×320 with touch
emulation — rotation arrives as a resize; no `orientationchange` listener exists, so
`setViewportSize` is the whole fixture, impl-review 6) — the board stays fully visible
in both, and the C3 band still hit-tests at its new on-screen position (the existing
tap branches convert via `getBoundingClientRect` at event time, so they
self-correct).

**Mutations:** delete the `h1`/`#menuFooter` chrome terms → the 320×568 row assertions
fail; **delete the pointer gate → the 1280×650 fixture fails** (at 1366×768 the height
gate already blocks `compact`, so that viewport proves nothing — impl-review 3);
reintroduce any crop (e.g. `overflow: hidden` on the canvas) → the row assertions fail.

## C3 — F3: a start control, visible and tappable

**Anchors:** `drawOverlay` `:5336`; the idle call with the discarded subtext `:7229`
(`'Press ENTER to Start'` is received and never rendered); the `touchend` tap branch
`:9577`–`:9675`; the install-button `tapY` pattern `:9655`; footer
`updateMenuFooter` `:2547` (touch variant `:2583` already reads "👆 Tap to Start");
`.shortcut-dim` `:62` (`#555`, 2.13:1).

**Implementation.**

1. In the idle branch of `drawOverlay`, render the subtext through `fillTextClipped`
   inside a bordered button centred in the **lower third** of the play area: rect
   ~220×60 canvas px around y = 3·CANVAS_HEIGHT/4, ≥ 60 canvas px tall so it clears
   24 physical px at the worst 0.727 scale. Touch copy: `'👆 Tap to play'`; keyboard
   copy: `'Press ENTER to Start'` (chosen by `hasTouch`). `ctx.save()`/`ctx.restore()`
   around the button block.
2. Store the band in module-scope visual state (`startBandRect = {x, y, w, h}`, canvas
   coordinates) written on draw, read by the touch handler; **nulled on every draw
   path that does not render it** so a stale rect can never accept a tap
   (impl-review 7).
3. `touchend` idle branch: compute `tapX/tapY` (the `:9658` pattern) and start the game
   **only** inside `startBandRect` (dispatch the existing `Enter` keydown). **A tap
   outside the band at idle does nothing** (R2-1 — the band is load-bearing; today any
   idle tap starts). **`:9666` is one shared `idle || gameover` branch — C3 splits the
   idle half (band-only) and C6 splits the gameover half (500 ms guard); the split
   must not re-couple them (impl-review, anchors).** The keyboard path and the D-pad
   (which dispatch keydown) are unchanged. The install-button band (`:9655`) keeps
   priority in its own rect.
4. Footer: raise `.shortcut-dim` to `#999` (≥ 4.5:1 on `#222`), and change the touch
   variant `:2583` to `'👆 Tap the button to start'` — now literally true.

**Gate:** the band's rect intersects the visual viewport at 320×568 (asserted before
any tap — R2-10). **Contrast, specified method (R2-2 + impl-review 4): read back the
band-rect interior (minus the border stroke) with `getImageData`; take the minimum and
maximum relative-luminance pixels in that region; assert the ratio ≥ 4.5:1** — the
darkest and lightest pixels in the band are the text and its backdrop, so no glyph
discrimination or text bounding box (environment-dependent metrics — the v12 lesson)
is needed. Also assert the resolved footer text/background pair ≥ 4.5:1 at 320×568
and 390×844. Taps: band centre → `idle → playing`; a tap 200 canvas px away → stays
`idle` (**the negative case** — fails if the band's hit-test is deleted, which is
what makes this gate distinguishable from today's catch-all). Band ≥ 24 physical px
at 320×568.

**Mutations (as run):** the plan's original "fill `#555`" mutation cannot bite a
white-glyph design — white on `#555` is 7.5:1, still legal — so the contrast mutation
is the TEXT fill (`#777` on the green band → ratio 3.64, fails). Delete the band
hit-test (restore the catch-all) → the negative case fails. Move the band off-canvas
(`bandY = 700`) → the contrast read-back returns 1.00 (no band pixels) and the band
tap fails. Fixture note: the negative-case tap must land ON the canvas but outside
the band (canvas centre 220,300) — an off-canvas tap passes even with the catch-all
and proves nothing (caught in the first mutation run).

## C4 — F4: onboarding that tells the truth

**Anchors:** the welcome-dismiss early return `:9583`–`:9591`
(`return; // Touch/click: dismiss but don't start game`); tap discrimination is
already displacement-based (`Math.abs(dx)<10 && Math.abs(dy)<10` `:9582`);
`drawWelcomeOverlay` `:4995`; the progression panel copy `:5050`
(`'Press C for cosmetics!'`); recap prompt `:4154` (`'Press ENTER to retry'`).

**Implementation.**

1. Delete the early return so the tap falls through to the existing
   `idle → Enter` dispatch: one deliberate tap dismisses **and** starts. The copy that
   promises it becomes true. There is no 250 ms window (deleted by review — the page
   has nothing to scroll); discrimination is the existing 10 px displacement threshold:
   - tap (< 10 px) on the overlay → dismiss + start;
   - swipe (≥ 10 px) on the overlay → **dismiss without starting** (a deliberate
     non-tap still gets the visitor past the overlay);
   - `overscroll-behavior-y: contain` (landed in C2) keeps pull-to-refresh from
     eating the gesture before the handler sees it.
2. Replace the progression panel's touch copy (`:5050` and the surrounding lines) with
   the two facts that end run one: `'A rival hunts your food — ram its side, never its
   head.'` and `'Rifts pulse — cross while they're dim.'` Keyboard-visible copy keeps
   the XP line.
3. Recap prompt touch variant: `:4154` draws `'Tap to play again'` when `hasTouch`
   (C6 adds the guard; the copy lands here so the sweep below is green at this commit).
   Sweep every `Press ENTER|Press Enter|Press\s`-style string drawn on
   {welcome, idle, gameover} and give each a touch variant (gauntlet run-over overlay
   included, if it draws one).
4. `AGENTS.md` First-Time Onboarding section updated **in this commit** — it currently
   records the opposite behaviour ("on mobile touch dismisses without dispatching
   Enter").

**Gate:** touch context — assert the **exact drawn strings** (the two facts; the band
copy; the recap prompt), and no drawn string on {welcome, idle, gameover} matches
`/Press\s/`. One `touchscreen.tap` on the overlay → `gameState === 'playing'`. A swipe
fixture (drag 40 px on the overlay) → overlay dismissed, `gameState === 'idle'`.
Re-run C1's funnel sequence — `overlay_gone` and `start` now fire on the same tap
(documented semantics, not a double count: different keys).

**Mutations:** restore the early return → the tap assertion fails; keep the old panel
copy → the exact-string assertion fails; delete the swipe branch → the swipe fixture
starts a run and fails.

## C5 — F6: a survivable opening lane

**Anchors:** `generateObstacles` `:3360`; `OBSTACLE_PATTERNS` (5 patterns, four extend
beside their anchor); `generateObstaclesForWave` `:6633`; spawn `snake = [{10·TILE,
10·TILE}]` `:2434` (and the gauntlet wave reset `:6667`), initial `dx = TILE_SIZE`
(moving right).

**Implementation.**

1. In `generateObstacles` and `generateObstaclesForWave`, reject any candidate whose
   **pattern tile set** intersects the lane `{11..14}×TILE, y = 10·TILE}` (head at tile
   (10,10) moving right — recompute from the actual spawn constants, do not hard-code
   twice). The existing rule tests only the anchor; the pattern's tiles are what the
   snake meets.
2. Do NOT touch `findFreeTile`'s shared 3-tile guard (five death-save callers depend
   on it — `AGENTS.md` v13).
3. This changes the board for every seed (daily, diary, ghost arena). Accepted (no
   stranger history exists); the deploy date is recorded as the cut-over in C8.

**Gate:** a 3000-seed probe (mulberry32-pinned, like `test-v13.mjs`'s spawn fixtures):
0 classic boards with an obstacle in lane tiles 1–4; a wave-fixture probe:
`generateObstaclesForWave` fixtures likewise 0. Today's build measurably produces
blocked lanes, so the fixture can fail (it is not vacuous).

**Mutations:** drop the corridor test → the probe returns ~2.6–4.5% blocked; test only
the anchor → the 0.9% two-tile case survives and the probe fails; the wave probe is
the gate for the wave generator, so the sentence "check the wave generator" from rev 1
is now an assertion (R2-11).

## C6 — F7: the recap card survives its first tap

**Anchors:** `gameOver()` `:3869`; `endZenSession()` `:3960`; the gameover tap branch
`:9666`; `drawRecapCard` `:4052` (prompt `:4154`, touch variant landed in C4).

**Implementation.**

1. `let gameOverAt = 0` (module scope, per-run): set in **both** `gameOver()` and
   `endZenSession()` (both-hooks rule); reset in **both** `resetGame()` and
   `resetWaveState()`.
2. `touchend` gameover branch: ignore the tap when `Date.now() - gameOverAt < 500`.
   After 500 ms the existing dispatch (retry) runs. Keyboard `Enter` is unchanged —
   restarts immediately, stated in the review.
3. No Share control (left with F8 in review).

**Gate:** tap 150 ms after death → `gameState === 'gameover'`, `recapData` intact; tap
at 700 ms → restarts; keyboard `Enter` immediately after death → restarts.

**Mutation:** delete the 500 ms guard → the first assertion fails.

## C7 — F9: link-preview metadata

**Anchors:** `<head>` of `snake.html` (deployed as `index.html` in
`github.com/j3k0/snakes`); the public README's privacy line (fixed at deploy).

**Implementation.** `<title>Snakes</title>`; `<meta name="description" content="One
HTML file. Eight modes. A rival snake that eats your food.">`; `og:title`,
`og:description`, `og:url` (the canonical `https://j3k0.github.io/snakes/`),
`og:image` (absolute URL, one hand-picked 1200×630 PNG — a Playwright screenshot of a
real board state, letterboxed, committed to the deploy repo), `twitter:card
summary_large_image`. The README's stale "3 keys" line gets the wording that stays
true at ~10 keys ("the only network request the game makes is one anonymous,
cookie-less counter; no accounts, no analytics platform, no fingerprinting, no
personal data").

**Gate (after deploy):** fetch the page — all tags present; `og:image` absolute and
returns 200 `image/png`.

**Mutation:** make `og:image` relative → the gate fails (that is the trap the gate
exists to catch).

## C8 — F10: the report and the decision rule

**Anchors:** `/opt/shared/reports/snakes/counter-snapshot.sh` (in JC's crontab on this
shared box — dry-run first, old behaviour reachable by flag).

**Implementation.** Rewrite to: read **yesterday's** `day-*` key and every funnel key;
one append-only line per date into `counter-snapshots.jsonl` (skip a date already
present); `--backfill <since>` (2026-10-20 still readable); `--dry-run`; a printed
rate table (`start/load`, `first_food/start`, per channel). Every URL the script
fetches must be a `/get/` — asserted in the script, because a counting job in the
snapshot script would be the worst bug in this file. The report records the v15 deploy
date as **both** the funnel-version and the board-generation cut-over (R1-4, for C5).

**Decision matrix (written into the report header before the data exists):**
thresholds read `ch_github`; `ch_itch`/`ch_other` reported, never steering branches.

| Loads (`ch_github`) | `start/load` | `first_food/start` | Action |
|---|---|---|---|
| ≥ 20 | ≥ 30% | ≥ 70% | Continue (next cycle) |
| ≥ 20 | < 30% | — | Patch the door once (v15.1, entry-path only) |
| ≥ 20 | 30–100% | < 70% | Patch the opening run once (v15.1, `first_food`-targeted) |
| < 20, posts made | — | — | Park the game |
| < 20, posts NOT made | — | — | Posts first; window unstarted; no game work |

Caveats in the report: any denominator < 10 → advisory, JC decides (a 70% rate swings
on ~2 visitors); `die_*` right-censored on `ch_itch` (~90 s iframe lifetime); a Zen
quit is a `start` with no death key ("quit or still playing", never "still playing");
counts printed *with* rates, ours subtracted by name and date.

**Gate:** run against the live read-only API — a row for 2026-10-20 with
`day_loads = 2`, one for 2026-11-13 with 2, no row dated today; the rate table
asserted against fixture counts (R2-12), not by eye.

**Mutation:** point the date at today → the no-today-row assertion fails.

## C9 — docs

`AGENTS.md` v15 section (game loop touch points, the F1 gate map, the F3 negative-case
rule, the F4 behaviour reversal, the F7 guard, new test files and their mutations) +
`v15-code-review.md` — v14 left no code-review artifact; that gap is closed this cycle,
including the plain-words statement of the URL → moving-snake path (acceptance item 2).

## Deliberately not shipped (with F8/F5, per review R1-1)

- Touch entries for the seven panels (F5) — defers to v16; the line was arbitrary and
  no evidence says a first-visit player needs quests or cosmetics in ten seconds.
- Shareable runs (F8) — Share button, score-only challenge links, the landing
  overlay's Play/Not-now, the `shared` key — zero lifetime exercise (no run ever
  finished). Re-enters v16 with rev-1's gate plus the precedence fixture (R2-7).
- Pause-menu footer copy; seed-per-run minting; first-food spawn guarantee; hiding the
  seed field on touch; advice lines on the recap card; leaderboards/accounts/second
  analytics/custom domain/generated previews; v14's nine non-fixes.

## Done means (per issue, unchanged)

Full suite green (309 baseline + `test-v15.mjs`) plus live Chromium checks with
screenshots; acceptance items 1–6 of design-plan rev 2 pass; committed and pushed;
JC reviews → approves → deploy → counter check (our traffic excluded) → JC's posts,
day 0 = his last post. The ship date goes into the 2026-11-19 report.
