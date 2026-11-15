# v15 code review — the first ten seconds

FOV-2676, step 9. Written 2026-11-15 against master `084c86e` (features
`e988e2d`..`f9477d5`, one commit per feature C1-C8). Reviewer: JC. The full
process record (reviews, dispositions, mutations) is in `IMPL_PLAN_v15.md`, the
review files, and the AGENTS.md v15 section; this file is the code-review
artifact v14 failed to leave, plus the plain-words acceptance statement.

## The path, in plain words (acceptance item 2)

A stranger opens the URL on a phone with a fresh profile:

1. **The page loads** (~200 KB on the wire, one file, no console errors). The
   whole board is on screen — the canvas scales to fit, and the game anchors to
   the top of the window instead of letting the browser clip it (before v15,
   the top rows were cut off on every small phone).
2. **The welcome overlay** says "Swipe to move | Tap ⏸ to pause", the two facts
   that kill a run one (the rival's head, live rifts), and "**Tap to start
   playing**" — which is now literally true: one tap dismisses the overlay AND
   starts the run. (A deliberate swipe — 10 px or more of drag — dismisses
   without starting.)
3. **The run begins.** If they die and tap reflexively to "do something", the
   tap is ignored for half a second so the recap card — their score — stays on
   screen; the prompt reads "Tap to play again".
4. If they back out to the menu instead, there is a **green "Tap to play"
   button** in the lower third — the first visible call to action the idle
   screen has ever had; on touch it is the only tap target that starts a run.

One deliberate tap, URL to moving snake. Measured in an emulated 320×568 touch
context; screenshots at four viewports are attached to the issue.

## What shipped (8 features, one commit each)

| Commit | Feature | In one sentence |
|---|---|---|
| `e988e2d` | F1 funnel | One-shot, load-scoped, cookie-less keys with channel attribution (github/itch/newgrounds) and a `snake_nocount` opt-out so our own checks never count. |
| `f95ba6f` | F2 viewport | Scale (never clip) to fit: measured chrome cap, `safe center` top-anchoring, a touch-narrowed `compact` mode. |
| `b96321b` | F3 start button | The idle screen's first visible control, contrast-checked by pixel read-back, and the ONLY idle tap target on touch. |
| `1b9b576` | F4 onboarding | The welcome tap starts (copy now true); swipe = displacement; the touch panel teaches the two things that end run one. |
| `cfcd194` | F6 opening lane | No obstacle in the four tiles ahead of spawn — was killing 3.6% of classic and 9.1% of gauntlet first boards. |
| `025e0ce` | F7 recap guard | A reflex tap within 500 ms of death can no longer destroy the scorecard. |
| `8590027` | F9 metadata | Real title, description, og:image (1200×630 PNG from a live frame) — pasted links now render as cards. |
| `f9477d5` | F10 report | Daily append-only funnel snapshot + the written continue/patch/park matrix, fixed before the data exists. |

**Cut in review** (R1-1, deferred to v16 with the plan's evidence): touch panel
entries (F5) and shareable runs (F8, taking the Share button and the `shared`
key with it). F9 was ruled uncuttable — it serves the posts, the only traffic
source.

## The deviations from the plan, all found by mutation runs (read this first)

1. **F2's `compact` hides h1 AND the two DOM score lines** (the standalone-mode
   three), not "h1 alone first": at 320×568 the h1-only cap leaves a ~216 px
   board, too small for F3's ≥24-physical-px button. The F3 gate itself demands
   it. The score stays visible during play ON THE CANVAS HUD; the redundant DOM
   lines hide.
2. **F3's contrast mutation is the text colour, not the fill**: the plan's
   "fill #555" cannot bite a white-glyph design (white on #555 is 7.5:1, legal).
   The tap-negative fixture also had to tap ON the canvas — an off-canvas tap
   passes even with the old catch-all restored (found live in the first
   mutation run).
3. **F6's probe must define the lane inline**, not read the shipped predicate —
   a probe that tests the predicate it reads is vacuous under mutation (found
   live; the lane-units assertion caught it).
4. **F10's /hit/ guard was swallowed**: `exit 1` inside a command substitution
   only ends the subshell — the mutated script printed the refusal 18 times and
   exited 0. The guard now checks the URL constant at top level. The walk also
   refetched 16 keys per date (450 requests per backfill) and tripped Abacus's
   rate limit; totals now fetch once per run.
5. **The "no row dated today" invariant is over-determined** (two independent
   bounds) — no single mutation can fail it; recorded as an invariant.
6. **F7's resets are defensive, not load-bearing**: write-before-read by
   construction; the gate pins the STAMP invariant directly instead.
7. **The 2026-11-13 day count in the F10 gate reads the live value**, not the
   plan's hard-coded 2 — it was already stale by one visitor when the gate was
   written.

## Acceptance status (design-plan rev 2)

| Item | Status |
|---|---|
| 1. Context fail-today tests 1, 2, 3, 4, 7 pass (5, 6 deferred with F8/F5) | ✅ asserted in `test-v15.mjs` (102 assertions) |
| 2. Phone visitor: URL → moving snake in one deliberate tap, stated in plain words | ✅ this file, section above |
| 3. Whole board on screen at 320×568 in all four states, and through URL-bar collapse and rotation | ✅ C2 gate |
| 4. 0 of 3000 opening boards kill before the second input (classic + gauntlet wave) | ✅ C5 gate (pre-v15: 109/3000 + 91/1000) |
| 5. Funnel returns distinct values on the deployed origin, one scripted load, `snake_nocount` off | ⏳ at deploy (deploy note records the load; `snake_nocount` on for every other scripted check) |
| 6. `start/load` and `first_food/start` computable from `counter-snapshot.sh` without hand arithmetic | ✅ C10 gate asserts the printed math |

Full suite: baseline 309 / 14 suites green on `ee0e3f2`, still green; v15 adds
`test-v15.mjs` (102). Every gate's named mutation was run once and failed
exactly its intended assertion.

## Deploy checklist (after JC's approval — release order FOV-2676a)

1. `snake.html` → `index.html` on `github.com/j3k0/snakes` (branch `main`), same
   route as 2026-10-19; **push `og-image.png` to the repo root** or every card
   renders with a broken image.
2. Fix the public README's stale "3 keys" privacy line with the wording that
   stays true at ~10 keys ("the only network request the game makes is one
   anonymous, cookie-less counter; no accounts, no analytics platform, no
   fingerprinting, no personal data").
3. One scripted load with `snake_nocount` OFF (the deploy verification), then
   `snake_nocount` ON for everything else; record the ship date.
4. Fill the three CUT-OVERS blanks in `counter-snapshot.sh` (funnel keys, board
   generation, day 0 = JC's last post) — the first funnel read depends on them.
5. Counter check with our traffic excluded, then JC's posts (drafts:
   `/opt/shared/reports/snakes/community-posts-2026-11.md`); attach the
   `og-image.png` to each post.
6. The 2026-11-19 report states the pre-v15 baseline honestly; month two reads
   what changed.
