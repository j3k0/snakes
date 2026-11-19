# v16 ideation context — arrival and return

Written 2026-11-16 on `feat/v16-cycle` (branched from `master` = `8b5f013`).
Issue: FOV-2784 (v16). Predecessor: FOV-2676 (v15, live). Judgment issue: FOV-2741.
(Corrected 2026-11-19: this line said FOV-2743, which is a Triominos support ticket.)
Every number below was read today, from a named source, and can be re-derived.
Where something is NOT measured it says so.

## Theme

**The game is worth playing and nobody is playing it.** Twelve cycles made Snakes deep.
The measured bottleneck since the 2026-10-19 deploy is not the game — it is that nobody
arrives, and nothing in the product brings back the rare person who does. v16 works the
two ends of the funnel that the last cycle could not: how players find it, and what makes
a second visit happen.

v16 runs **as a separate track behind a deploy freeze** (JC, 2026-11-16: "we want to keep
working… v16 as a separate track"). Progress is real; the live build does not move.

## The freeze contract (this is what makes the cycle safe)

v15 deployed 2026-11-15 and JC's itch announcement landed the same day. That day is
**day 0 of the 30-day window** that decides continue / patch-once / park (FOV-2741; the
thresholds were fixed 2026-11-14, before any data existed, so they cannot be fitted to it).

| | |
|---|---|
| Live URL | https://j3k0.github.io/snakes/ — deploy commit **`f2f9254`** (Pages, `main`). Verified today: 200, 546,876 bytes, contains `snakeBump`/`startBandRect` (v15) and **not** `touchMenuBtn`/`copyChallengeUrl` |
| Live itch build | upload id **20562214** (v15), served from `html-classic.itch.zone` |
| Window | day 0 = 2026-11-15, read due **2026-12-15** with `counter-snapshot.sh --window` |
| The rule | `ch_github` loads ≥ 20 **and** `start/load` ≥ 30% **and** `first_food/start` ≥ 70% → continue. `< 20` loads with the posts made → **park the game** |
| Day 1 of that read (2026-11-16T14:46Z) | `ch_github` **absent** (no deliberate visit to the canonical URL since deploy). 3 all-channel loads, **1** in-window `start`, **1** `first_food`, 1 `finish`, 1 `keys`, 3 distinct death buckets, `ch_itch` = 2. Two decision keys read UNKNOWN under an Abacus degradation — `--window` exits 3 rather than guess |

Therefore, for the whole cycle:

- **No deploy of anything, to Pages or itch, before 2026-12-15.** Nothing a v16 commit
  does may change that without JC explicitly lifting the freeze — and note the rule
  already says *a new announcement restarts day 0*, so the window is his to void.
- **No script opens the live or itch page** (it is counted traffic on the one channel
  that steers the verdict). Probe on `file://` or the host-mapped local origin; a real
  LIVE check requires `snake_nocount = '1'` set via Playwright `page.addInitScript`
  *before* the page script runs, and must be recorded the day it happens in
  `/opt/shared/reports/snakes/counter-snapshot.sh`'s `OURS` block.
- **Every acceptance test must be runnable locally.** Anything that can only be proven
  in production (a portal SDK sandbox, a real leaderboard, a referral) is tagged
  **deploy-gated**: it ships with a written release note and a falsifiable check to run
  after 12-15, never with a green tick.
- Work lands on `feat/v16-cycle`, is reviewed there, and joins the release train that
  leaves after the read.

## The situation (read honestly)

- **Traffic history, all of it:** ~20 loads 2026-10-19 → 11-13, of which 15 were our own
  deploy verification; one real visitor around 2026-11-12 played **29 runs on one load**;
  the v15 window (11-15 →) holds 3 loads, all from itch. Two announcement channels
  (r/WebGames, Newgrounds) were **deferred by JC on 2026-11-15**, not pending.
- **What that one visitor proves:** per-visit engagement is not the problem. 29 runs on
  a single page load is a person the game held. What is missing in front of that is
  *arrival*, and behind it is *a reason to come back tomorrow* — the visit was one
  afternoon, with no record, no streak, no daily, no "you were 12 points short".
- **Two reviewed features are already on this branch and are NOT live:** FOV-2728 (a
  phone menu — before it, none of the seven panels were reachable by touch, so Quests,
  Settings and Cosmetics did not exist for a phone player) and FOV-2729 (score-only
  challenge links + a recap Share button). They ride the v16 train. v15 cut both to v16
  (R1-1) and they are done and reviewed — so anything proposed here that duplicates them
  must say so.
- **Test baseline on this branch:** 18 suites (`test-*.mjs`), `node test-bugfixes.mjs`
  green at branch creation (18/18). Recorded totals: 309 assertions / 14 suites
  (v15 baseline) + 102 (v15) + 48 (share) + 45 (touch menu).
- **The artifact:** `snake.html` is one file, **10,427 lines / 571 KB**, no build step,
  no dependencies beyond Playwright for tests. That is a fact to design with, not against.

## What the game already has (so nobody proposes it twice)

8 modes (classic, timeAttack, zen, walled, daily, painter, snap, gauntlet) · 8 food tiers
incl. hunter/bomb/portal · rival snake with telegraphs · hazard rifts · golden hoard +
pigment rush · bounties · combo bank · mutator draft + resonances · evolution tiers ·
XP/levels · daily streak w/ death-save charges · daily + weekly quest board · ~60
achievements + metas · cosmetics · brews · diary · save/resume snapshot · export/import ·
local daily leaderboard · PWA install · screen-reader announcements · calm mode · CVD
palettes · challenge URLs (`#mode~seed~score`) · funnel v2 counters with channels.

## Deferred, parked and explicitly-not-doing (start here, do not re-derive)

- **v14's nine deliberate non-fixes** (`AGENTS.md` §Deliberate non-fixes), incl. the
  frozen-rival board cue, rival hoard mechanic ("needs a balance playtest"), two rivals
  passing through each other, CVD palettes for the rival, the cascade-agnostic global
  high-score write.
- **v15 deferred:** the DOM score lines / seed row / combo line still clip off the
  bottom on small phones (`AGENTS.md` §v15 F2 — "hiding them is a deferred item").
- **v15 dropped as a non-issue:** installability (the button only appears when the
  browser offers it).
- **Not up for debate this cycle:** no backend, no accounts, no monetisation, no
  third-party analytics, no new npm dependency, no split of `snake.html`, no build step,
  no change to the funnel keys, the thresholds or the decision rule (FOV-2741 owns
  those). If a portal or a platform demands one of these, that is a **finding to report
  to JC**, not a silent exception.

## Open questions the lenses should try to answer (with evidence, not opinion)

1. **Where are the players, concretely?** Which HTML5 portals actually take a
   self-serve submission today (Poki, CrazyGames, GameDistribution, Newgrounds, itch
   collections, Game Jolt, Poki-style networks), what does each *require* of the game
   (SDK calls, `gameplayStart/Stop`, fullscreen rules, loading, content rating, exclusivity),
   what does each cost us against the constraints above, and what does a reasonable
   arrival volume look like per channel. **Portal SDK APIs change — cite current docs, do
   not write from memory.**
2. **What does a returning player see?** Measured, not assumed: open the game with a
   save that has a streak and unfinished quests. Is the daily visible in the first
   second, or is it behind a panel? Does anything say "come back tomorrow"?
   (Playwright on `file://` answers this; the touch menu from FOV-2728 is on this branch.)
3. **Does the depth surface at all?** Twelve cycles of content behind keyboard
   shortcuts. What fraction of it does a first-time player encounter in a normal 60-second
   run, and what is the cheapest honest way to introduce it without a tutorial wall?
4. **Is a share ever sent?** FOV-2729 gives a Share button that copies a link. Nothing
   measures whether a link is opened, and nothing makes the recipient play *the same
   thing*. What closes that loop without a backend?
5. **What would an outsider say?** Somebody who ships arcade games for a living, or who
   plays them on a bus: what does Snakes do that reads amateur, what does it lack that a
   2026 portal game is expected to have, and what of that is fixable in one file with no
   build step?

## Ground rules (from `AGENTS.md`, load-bearing)

- Read the v12/v13/v14/v15 sections before proposing edits to `snake.html`.
- Snapshot fields are **additive**; never bump `SNAPSHOT_VERSION`. Per-run state resets
  in BOTH `resetGame()` and `resetWaveState()`; session-end logic runs in BOTH
  `gameOver()` and `endZenSession()`.
- Canvas `save()`/`restore()` on all paths; assert what was drawn, not that depth
  returned to 0. Nothing calibrated for 60fps — timers are tick-counted against ~120 ms.
- Verify in the running game in Chromium (mobile emulation, fresh profile). A green
  suite is not evidence the game plays right.
- **An assertion that cannot fail is not an assertion** — the test is mutation: delete
  the predicate and confirm the assertion fails.
- **Nothing advertised is a lie.** Every string a player can see is a promise.
- No personal data: cookie-less, no fingerprinting, no accounts, no server-side
  analytics, and any new counter must keep the existing opt-out.
- **Prefer removing scope to adding it** (JC, v15). Twelve cycles of additions is a
  reason to weigh subtraction seriously.
