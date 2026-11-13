# v15 ideas — lens 2: instrumentation (make the December read decidable)

Written 2026-11-13 by the issue owner, against `d19f055` / game `ee0e3f2`. Same process
note as `v15-ideas-first-contact.md`: the three ideation subagents all failed on a
degraded endpoint, so these are self-authored and must be reviewed as such.

Facts cited as `ctx §n`, or a `snake.html` line, or a live counter read
(`curl https://abacus.jasoncameron.dev/get/j3k0.github.io/<key>`, read-only).

## Top 5

1. **Ten funnel keys, one-shot per page load, split by input, channel from hostname.**
   Today four keys cannot answer a single question about the entry path (ctx §12).
2. **A real opt-out for our own traffic.** 15 of 20 loads are ours; the number is
   currently untrustworthy in the direction that matters (ctx §"situation").
3. **Rewrite the snapshot job to read *yesterday*, all keys, one append-only line.**
   The current job only ever sees a partial day and lost 2026-10-20 entirely (ctx §12).
4. **A written decision rule with a stop rule, sized for n in the dozens.** "Worked"
   is undefined; without a stop rule this project drifts.
5. **`first_food` as the activation metric.** `start` measures a tap; the first food
   measures understanding. That is the rate the entry-path work is for.

---

## 1. The funnel key set

- **What.** Add the ~8 missing steps to the 4 existing keys. One-shot per page load
  (an in-memory flag, nothing stored), each key carrying the input kind, with the
  channel derived from the hostname.
- **Why.** ctx §12: `load` / `start` / `finish` / `day-*` cannot distinguish "dismissed
  the overlay and left" from "started and died at the first tick" — which is exactly the
  question v15 asks. And the owner's decision for this cycle is to judge on
  `start / load` and `first_food / start`, which today cannot be computed at all.
- **How.** The helper is 5 lines at the top of the file (`_snakesCount`, `:142`),
  already `keepalive`, already inert off `j3k0.github.io`. Proposed keys (namespace
  unchanged, all additive — Abacus creates a key on first hit, so nothing migrates):

  | key | fires | where | once per |
  |---|---|---|---|
  | `load` | page load | `:145` (exists) | — |
  | `day-YYYY-MM-DD` | page load, UTC day | `:146` (exists) | — |
  | `start` | run started | `startGame()` `:2590` (exists) | — |
  | `finish` | run ended | `gameOver()` `:3869` + `endZenSession()` `:3960` (exists) | — |
  | `touch` / `keys` | first input kind seen | the `keydown` handler and the `touchend`/swipe handler, whichever fires first | page load |
  | `overlay_gone` | welcome overlay dismissed | the `welcomeOverlay = false` sites (overlay tap `:9663`, keydown `:9013`) | page load |
  | `first_food` | first food eaten in a run | the food-eat block, gated on `sessionFoodEaten === 1` | page load |
  | `die_wall` / `die_self` / `die_obs` / `die_rival` / `die_hazard` / `die_time` | death bucket | `gameOver()`, from `lastDeathCause` mapped to a bucket | page load |
  | `shared` | a link was copied | the `K` copy path `:9420` and the new recap Share | page load |
  | `ch_github` / `ch_itch` / `ch_other` | channel = `location.hostname` | module init, next to `load` | page load |
  | `paused_early` | a pause inside the first 10 s of a run | the pause path | page load |

  Rules: a single `bump(key)` wrapper holding a `Set` of keys already fired this load,
  so a step cannot double-count (`gameOver()` has no double-call guard today — `finish`
  is its first statement at `:3869` — which is a real risk of a doubled bucket);
  the death buckets are a fixed enumeration, never the free-text cause (a cause string
  in a counter namespace is how you get 60 unreadable keys); the channel comes from the
  hostname because itch does not pass query params into its game iframe (lens 3).
- **Verify.** A scripted visit in Chromium that asserts *distinctness and ordering*, not
  just non-zero: one `load`, one `overlay_gone`, one `start`, one `first_food`, one
  death-bucket key, one `touch`; and the same keys **absent** on `file://` (the beacon
  gate). To prove the assertions bite: delete the once-per-load `Set` and confirm the
  double-death fixture produces 2.
- **Cost** M. **Risk.** Every new beacon is a `fetch` on the critical path — they must
  stay fire-and-forget and never awaited (the AGENTS.md frame rule). A first-food key
  firing inside the eat block sits in the hot tick, so keep it to one `Set` check.
  Abacus keys expire after 6 months of inactivity: fine for this window, and the
  snapshot (idea 3) is the hedge.

## 2. Keep our own traffic out of the numbers

- **What.** A shipped, honourable opt-out that the automated checks and our own manual
  verifications set — so a deploy verification visit does not move a public number.
- **Why.** ctx "situation": of 20 `load`s, 15 are the 2026-10-19 deploy verification and
  2 are this plan's own probe, so **at most 3 loads could have been a stranger**. After
  v15 we will verify the deploy *again* (it's in the agreed order), which would contaminate
  the very first post-deploy numbers — the ones the whole read depends on.
- **How.** Compare the two candidates:
  (a) *block the counting host in Playwright* (`page.route(..., abort)`) — covers the
  suites and scripted checks, is not visible to the user, and is already the effective
  situation off-origin; it does **not** cover a human opening the live URL to look at it.
  (b) *a flag the shipped page honours* — `localStorage.setItem('snake_nocount','1')`
  read once at module init. A URL fragment is **not** usable: `location.hash` is already
  the challenge-link carrier (`#mode~seed~score`, `parseChallengeUrl` `:628`), and a
  query param would be stripped by itch's iframe anyway.
  Recommendation: (a) + (b) together, plus one stated convention — the post-deploy
  verification is *one* real browser load, and the report subtracts the known-ours loads
  by name and date.
- **Verify.** A test that loads the page with `snake_nocount` set and asserts zero
  requests to the counting host (`page.on('request')`), and one without it asserting
  exactly one `load`. Mutation: read the flag after the `load` beacon and the second
  assertion fails.
- **Cost** S. **Risk.** A user who finds the flag can hide from the counter — acceptable
  and honest (this is a cookie-less counter, not a surveillance system), and worth one
  line in the privacy note.

## 3. Rewrite the snapshot job, and make a report

- **What.** Replace the daily one-liner with a job that reads **yesterday's** keys plus
  all funnel keys, appends one line per day, and can regenerate the whole table from the
  file.
- **Why.** ctx §12: `counter-snapshot.sh` reads the *current* UTC day (cron 12:00 local
  ≈ 10:00 UTC, so always a partial day); every row after 2026-10-19 has
  `day_loads: null`; the 2026-10-20 row is missing entirely while Abacus still has
  `day-2026-10-20 = 2`. The hedge therefore hedges nothing about the day shape.
- **How.** In `/opt/shared/reports/snakes/counter-snapshot.sh`: iterate the key list
  (a constant in the script, same enumeration as idea 1), query `day-<yesterday>` and
  every funnel key, emit one JSON line with a `date` field for the day it describes, and
  skip a duplicate date rather than appending a second row. Keep the append-only
  `.jsonl` (diffable, survives a bad edit), add `--backfill <since>` for missing days —
  Abacus answers reads for existing keys, so 10-20 is still recoverable — and have the
  script print the rate table (`start/load`, `first_food/start`) at the end so a human
  reading the cron output sees the funnel, not four integers.
- **Verify.** Run the rewritten script against the live (read-only) API and assert: a
  row for 2026-10-20 with `day_loads = 2`, a row for 2026-10-19 with 15, and no row
  where `date == today`. Mutation: point it at the current day and confirm the last
  assertion fails. Also assert the script performs no `hit` requests (a snapshot job
  that counts is the worst possible bug here) — `page.on` equivalent: log the method
  and URL and assert the path prefix is `/get/`.
- **Cost** S–M. **Risk.** It edits a shared file on a shared box and runs in `jeko`'s
  crontab: land it with the old script kept (`counter-snapshot.sh.bak` is not enough —
  keep the old behaviour reachable by a flag) and never run it with write intent until
  a `--dry-run` print looks right.

## 4. Define "worked", and define "stop"

- **What.** One paragraph, written now, with a date and numbers a person can check.
- **Why.** Twelve cycles improved the game with no reader. Without a written rule the
  December read becomes another conversation, and the project neither continues nor
  stops — the worst outcome.
- **How.** A proposal for the owner to approve (his call, recorded on the issue):
  - Window: the 30 days after JC's **last** post (agreed). Day 0 = last post date.
  - Primary metric: `start / load` for non-our loads, and `first_food / start`.
  - Because n will be in the dozens, quote **counts with the rate**, e.g.
    "23 loads, 9 started (39%), 7 ate a first food (78% of starts)" — never a bare
    percentage, and never a difference of a few points as a finding.
  - Continue if: ≥ 20 real loads **and** `first_food / start` ≥ 70% — the entry path
    works and the game has a reader worth building for.
  - Fix-and-repost once if: loads ≥ 20 but `start / load` < 30% — the door, not the
    game, is the problem; that is a v15.1-sized patch, not a new cycle.
  - Stop (or park the game and keep the code) if: < 20 real loads in 30 days with the
    posts actually made. Distribution then demonstrably isn't the missing piece and
    more work on the game cannot fix it.
  - The existing **2026-11-19** wakeup: its job was "did anyone play" for the pre-v15
    build. It should report the honest baseline — three weeks with essentially no
    distribution, 3 possible-stranger loads, no finishes — and say that this is the
    before-number the funnel read will use. That keeps the commitment instead of
    cancelling it.
- **Verify.** The rule is checkable by one command: the report from idea 3 prints the
  two rates and the continue/fix/stop verdict against these thresholds.
- **Cost** S (writing). **Risk.** Thresholds picked now can be wrong; that is the point
  of choosing them before the data exists.

## 5. `first_food` is the activation metric — instrument the dead time too

- **What.** Alongside `first_food`, a `paused_early` key and (optionally) a
  "no input in a run" key.
- **Why.** `start` counts a tap that a curious visitor makes by accident; a first food
  eaten means the player read the board and moved with intent. `paused_early` catches
  the trap in ctx §7 (a tap during play pauses, `:9676`) — a newcomer who taps to do
  *something* lands in a pause menu worded for a keyboard.
- **How.** `sessionFoodEaten === 1` inside the eat block (already tracked per session);
  `paused_early` = pause entered while `gameTick < 83` (~10 s at 120 ms) — tick-counted,
  not wall-clock, per the no-60fps rule.
- **Verify.** Assert a scripted run that eats nothing fires `start` and not
  `first_food`; one that eats one food fires it exactly once across two runs in the same
  page load (once-per-load, not per-run); and a pause at `gameTick = 3` fires
  `paused_early` while one at `gameTick = 200` does not. Mutation: gate on
  `sessionFoodEaten > 1` and confirm the single-food case fails.
- **Cost** S. **Risk.** Two more keys against the ~10 budget; drop `paused_early` if the
  budget tightens.

## 6. Bucket the deaths, keep the causes in the game

- **What.** Fixed-enumeration death-bucket keys; cause strings stay in `lastDeathCause`
  and the recap card only.
- **Why.** `lastDeathCause` (split from `lastSaveEvent` in v12 C) is a good product
  feature and a terrible counter namespace: "You charged the rival head-on!" and "You ran
  into the rival!" differ by 57 px of text and would be two keys nobody can read at a
  glance.
- **How.** A `DEATH_BUCKETS` map from the known causes → bucket; called once in
  `gameOver()`; unknown causes go to `die_other` (a growing `die_other` is itself a
  signal that the map went stale).
- **Verify.** Assert each of the four collision causes maps to a distinct bucket key and
  that a rescue (shield/phoenix/serpentine/melt) fires **no** death key at all. The
  second half is the assertion that catches the v12 class of bug.
- **Cost** S. **Risk.** Adding a cause without a bucket silently lands in `die_other` —
  which is why the `die_other` count matters.

## 7. No per-run id, and what that costs

- **What.** State it explicitly: no run id, no session id, no fingerprint.
- **Why.** The rule is no personal data and no fingerprinting. It also means some
  questions are unanswerable and the design must not pretend otherwise.
- **How / consequence.** Step *ordering within a visit* is still recoverable, because
  each step fires at most once per load: `overlay_gone ≥ start` and
  `first_food ≤ start` are implied by construction, so the funnel is a set of nested
  counters rather than a joined table. What we lose: per-visitor drop-off paths,
  return-visitor identification (so "did the itch crowd convert worse than Reddit" is
  answerable only as *rates per channel*, never as a cohort), and time-in-run data
  beyond tick-derived buckets. Say this in the report so nobody asks for an id later
  and gets one.
- **Verify.** Nothing to verify in code; the check is that the report's claims never
  exceed what nested counters support.
- **Cost** S. **Risk.** The temptation to add an id after the first read — record the
  reason here so the answer is already written.

## 8. One counting service, and the argument for keeping it

- **What.** Do not add a second analytics service.
- **Why.** Abacus is free, cookie-less, CORS, no signup, and already deployed
  (`DEPLOY-2026-10-19.md`). A real analytics platform would be the fastest way to break
  the no-personal-data rule and the "no new dependencies" constraint, and would change
  the public promise in the post copy ("no tracking beyond an anonymous counter").
- **How.** If Abacus dies mid-window, the snapshot file is the record and the keys can
  be re-created in the same namespace on the same service — no code change beyond the
  base URL constant at `:142`.
- **Verify.** Assert the counting host appears in exactly one place in the file (a grep
  assertion in the suite, like the existing "one `case 'rival_eat'`" check).
- **Cost** S. **Risk.** A third-party dependency with no SLA. Accepted for a 30-day
  window with a local snapshot.

## 9. Prove a counter works without polluting the number

- **What.** A written verification procedure for deploy day.
- **Why.** The agreed order ends with "a counter check without our own traffic" — and a
  counter check is by definition our own traffic.
- **How.** Three-layer proof: (i) suites on `file://` assert the beacon is *absent*
  (already true, `:142`), which is where 309 assertions live; (ii) a scripted load with
  `snake_nocount` asserts zero requests leave the page (idea 2), which is where the
  *logic* is proven; (iii) exactly **one** real load on the deployed origin, whose
  `load` delta of +1 is recorded in the deploy note with its timestamp and subtracted in
  the report. After that, no more live loads until the posts.
- **Verify.** The deploy note must contain the before/after values of every key. If
  `load` moved by more than the number of verification loads recorded, the note is
  wrong — and the discrepancy is a finding in itself.
- **Cost** S. **Risk.** Someone (me) doing a second live check and not writing it down.

## 10. Keep the counters out of the frame path

- **What.** A rule with a test: no beacon inside a per-tick loop body except behind an
  already-satisfied one-shot check.
- **Why.** The `first_food` and `paused_early` hooks sit in the tick and the input path.
  A beacon is a `fetch` with `keepalive`; the AGENTS.md rule is fire-and-forget, never
  awaited, because a stalled request must not delay a frame.
- **How.** Put the bump calls where cheap session flags already live (`sessionFoodEaten`,
  `gameTick`) and keep `bump()` a `Set` add + one `fetch` — no string building on the
  hot path.
- **Verify.** Assert tick timing does not regress: run 200 ticks with the counting host
  blocked (`page.route` abort, the worst case) and assert the mean tick stays within
  10% of the same run with the host unreachable-by-name. That is the mutation-proof form:
  it fails the moment someone awaits a beacon.
- **Cost** S. **Risk.** Low, but this is the class of bug that only shows up on a bad
  network.

---

## Rejected (with reasons)

- **A per-visitor id / cohort tracking.** Personal data by any reading, and against the
  explicit rule. Idea 7 records what we lose so the choice is informed.
- **Self-hosted analytics (Plausible/Matomo).** A backend, a server to run, and a second
  service — three constraints at once, for precision n=30 does not need.
- **Rich event payloads (score in the key, mode in the key).** Key explosion: mode ×
  score × step is unreadable and Abacus keys expire. Keep the counter a step and let the
  game's own localStorage features hold detail.
- **Sampling wall-clock time-in-state.** Wall-clock timers break the tick-counted rule
  (AGENTS.md) and add a second clock to reason about.
- **A dashboard.** For ~10 keys and one reader, a printed table in the cron output beats
  a UI. Belongs to no lens's budget.
- **Belonging to lens 1:** the fixes the funnel measures (CTA, viewport, lane, panels).
- **Belonging to lens 3:** channel attribution mechanics and the share link — this file
  only states the constraint (channel must come from the hostname, and a hash marker is
  not available).
