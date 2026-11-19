# v16 ideas — Lens 3: the outsider (hostile review, no context, no credit)

Written 2026-11-16 on `feat/v16-cycle`. I read `v16-ideation-context.md`, `AGENTS.md`
(§Deliberate non-fixes, §v15 Features, §Shareable Runs, §Touch Panel Menu) and skimmed
`v15-design-plan.md` for the evidence bar. Then I stopped reading and played it.

**Measured, not remembered.** Two throwaway Playwright probes against `file://`
(now deleted; the repo is clean — `git status --porcelain` shows only the pre-existing
untracked context file). Chromium headless, `page.evaluate` + a `fillText` recorder
around `drawGame(0)`, plus a 390×844 / `deviceScaleFactor` 2–3 touch context. Commands
were `node .outsider-probe.mjs` and `node .outsider-probe2.mjs`, both: `chromium.launch()`
→ `page.goto('file://…/snake.html')` → capture drawn strings → drive `updateGame()`.
External: Poki's current developer docs (`developers.poki.com/guide/easy-access`,
`/guide/player-fit-test`, `/guide/what-we-look-for`) and two 2026 HTML5 best-practice
checklists, 3 lookups. I did not open the live or itch URLs.

## Top 5

1. **Land in a run, not a menu**: first visit should be playing Classic inside 2 s; the eight-mode selector is a returning-player screen (measured: today a visitor needs a dismissal **and** a start before the snake moves).
2. **Delete the shortcut wall** — `↑↓ Select | ENTER Start | TAB Stats | F Achievements | C Cosmetics | B Brews | Q Quests | S Settings` on screen zero (measured DOM), and the welcome panel's "Press C for cosmetics!" — six keys advertised to someone who has not moved yet.
3. **A stray thumb tap on the board must not pause the run** — `snake.html:10241-10243`: during `playing`, any canvas tap under 10 px dispatches Space. Measured: `playing → paused` from one centre tap. The copy at `snake.html:5335` names only ⏸.
4. **The recap card ends with no reason to go again** — measured card text is 12 rows, good on "vs best", silent on "today". One row closes it.
5. **Cut the opening load: 3 of 8 food tiers and 5 of 8 modes are invisible to a first-timer anyway** — hide, don't delete, and the 12 cycles of depth arrive when the player has earned them.

## The clock (what a stranger is actually doing)

| t | desktop 1280×900 | phone 390×844 |
|---|---|---|
| 0 s | 164 ms to first frame, no page errors. Title "Snake Game". | 172 ms, `--snakes-scale` 0.84, board tile 17 CSS px (34 physical at dpr 2) |
| 0–5 s | A 3-panel text wall: *Controls / Food / Progression*, closing "Press any key or tap to start playing". Nothing moves. The snake is not visible. | Same wall; copy differs and *does* promise a tap-start |
| 5–15 s | Press any key → idle screen: **8 mode names**, only the selected one's description drawn, "Press ENTER to Start", and the six-key DOM shortcut strip. Two deliberate inputs before a snake appears. | One tap → **playing** (v15 F4 works; credit where due) |
| 15–60 s | First food ~1.5 s after start (measured: greedy-bot pacing 49 ticks for 5 foods ≈ 5.9 s; median 13 ticks between foods). Then a bomb, a hunter, a portal, a rift — each explained by a toast that appears once, mid-run, while you are steering. | Same, at 17 px/tile, with a D-pad under a board the thumb keeps touching |
| death | Recap card is genuinely good: `★ NEW BEST! ★ / Score: 240 / ＋240 vs best / You ran into yourself! / ＋677 XP / ▸ Survive 5 minutes in one run (+46) / Share my run (K) / Press ENTER to retry`. | `Tap to play again` |

First real fun: **the second food**, once input → motion is reflex rather than thought. Everything before it — the two text screens — is friction that the game does not need and the genre does not forgive. Poki's onboarding guide is blunt: *"Skip the menu. For first-time players especially, skip splash screens, title screens, and level selects"* and *"Reveal actions and buttons over the first few levels instead of front-loading everything at once. Overwhelmed players end their session"*.

## What the game asks a stranger to know

| Mechanic | What teaches it | What a first-timer does |
|---|---|---|
| Move | Welcome panel text | Fine |
| 8 modes | Idle list; description only for the selected row | Picks row 1 or taps randomly; never returns to the list knowingly |
| 8 food tiers | "Different colored food = different points" + the `L` legend (key unknown) | Eats everything, including the bomb |
| Rival (3 states) | One-shot `snake_has_seen_rival` / `_rival_head_on` toast, fires on first encounter | Dies to it, or eats next to a telegraph |
| Hazard rifts | One-shot `snake_has_seen_hazard` toast | Reads the violet glow as decoration |
| Combo bank (`X`/`Z`) | One-shot toast on first charge | Never spends; the HUD badge is unread |
| Mutator draft (`D`) + resonances | `snake_has_seen_resonance` toast — after a draft you were never told exists | Never sees it |
| Evolution tiers | A flash at a length milestone | Sees colours change |
| Hoard + pigment rush | Toasts mid-run | Panics at the screen going gold |
| Streak death-save charges | An idle-screen line that renders only when `streakCount > 0` (measured: absent on a fresh profile) | Has no idea death has insurance |
| Quests / cosmetics / diary | 1 key each (`Q C B J`), 6 advertised on screen zero | Ignores all of it |

`HELP_BINDINGS` (`snake.html:5167-5193`) is **25 bindings**. My first two screens showed **4**. The teaching surface is **8 one-shot toasts** (`grep -o snake_has_seen_` → bomb, combo_bank, hazard, pigment_rush, portal, resonance, rival, rival_head_on), and seven of those require the mechanic to *bite you first*. Genre contract 2026: Poki's own fit bar is *average playtime > 3 min and 25% of plays over 3 min*; it names *"confusing controls, an unclear goal, or a slow start"* as why the first columns fill. Twelve cycles of depth that arrives via toast-on-harm is the exact profile that fills column 1.

## 1. Cold start: land in a Classic run

**What.** First visit (no `snake_has_played`): skip both the welcome overlay and the mode list, start a Classic run, and draw a fading "Arrow keys to move" / "Swipe to turn" prompt over the first 3 seconds of a board with no obstacles, no rival, no hazards, no bomb/hunter/portal. Returning visitors get today's screen unchanged.
**Why.** Measured: two deliberate inputs and ~5 s of static text before the snake exists. Poki `/guide/easy-access`: "skip splash screens, title screens, and level selects"; `/guide/what-we-look-for`: "players decide in seconds, so … an immediate, playable opening matter as much as the game underneath". `AGENTS.md` already reversed the welcome tap to start the run (v15 F4) — this finishes that move by deleting the intermediate screen.
**How.** `startGame()` already has a clean-board path (`resetGame()` → `generateObstacles()`/`generateFood()`); gate the first 60 ticks on the existing per-mode `false` flags (obstacles/rival/hazards/hunger all have named config booleans). `drawWelcomeOverlay()` becomes a 3-second overlay over live play rather than a replacement for it (`drawOverlay`'s idle branch already writes the start band, `snake.html:5775`).
**Fails-today test.** Fresh profile, `file://`, 390×844: after `page.goto` + **zero** inputs, wait 2 s and assert `gameState === 'playing' && snake.length >= 3 && obstacles.length === 0 && rivals.length === 0 && hazards.length === 0`, and that a `fillText` recorder captured a movement prompt. Mutation: delete the first-visit gate → the assertion fails on `gameState`.
**Risks.** The daily-attempt and streak logic hangs off `startGame()` (AGENTS §Daily Challenge: attempt consumed on start) — a zero-intent auto-start must not burn an attempt; auto-start only when `gameMode === 'classic'` and the daily is untouched. Cost: this is the largest item on the list, and it is the only one I would fight for.

## 2. Delete the shortcut wall (pure subtraction, ~20 lines)

**What.** Remove the six-key strip (`TAB/F/C/B/Q/S`) from the first-run DOM, and "Press C for cosmetics!" from the welcome panel. Keep `ENTER Start`. Panels stay reachable — FOV-2728's ☰ (already on this branch, measured present at 390 px) and `HELP_BINDINGS`/`H` remain the discovery path.
**Why.** Measured DOM on a brand-new desktop visitor: `↑↓ Select | ENTER Start | TAB Stats | F Achievements | C Cosmetics | B Brews | Q Quests | S Settings`. Five of six keys are never used by anyone who is not already invested; selling *cosmetics* before the first move is the single most amateur-looking thing on screen. Poki: "Reveal actions and buttons … instead of front-loading everything at once."
**How.** The strip is in `updateMenuFooter()`; add a `!hasPlayedRecently` (or simply `streakCount === 0 && totalGamesPlayed < 1`) gate.
**Fails-today test.** Fresh profile: assert the visible `document.body.innerText` contains no `/TAB Stats/` and no `C Cosmetics`, and still contains `ENTER Start`; second visit (2 games played) it may appear.
**Risks.** Discoverability of Quests for a player who wants them — mitigated by ☰ on touch and by the recap card, which already lists quest deltas. Do not also hide it from returning players.

## 3. Board tap must not pause on touch

**What.** In `playing`, a canvas tap should do nothing (or turn). Pause stays on the dedicated ⏸ D-pad button (`snake.html:144`) and `P`/`Space`.
**Why.** Measured on a phone: `{"g":"playing"} → {"g":"paused"}` from one tap at canvas centre; `snake.html:10241-10243` dispatches Space for any tap under 10 px. The board is where a thumb rests on a 374 px-wide canvas, and the on-screen copy at `snake.html:5335` says *"Tap ⏸ to pause"* — so the pause the player gets is an unadvertised second control that fires on accident. Two controls for one action, one of them invisible, is a bug-shaped thing.
**How.** Delete that `else if (gameState === 'playing')` branch. Keep the gauntlet-intermission branch above it (it needs Enter).
**Fails-today test.** Phone context, `startGame()`, tap canvas centre, assert `gameState === 'playing'`; then tap the ⏸ button and assert `gameState === 'paused'`. Mutation: restore the branch → first assertion fails.
**Risks.** Someone who liked tapping to freeze (a common habit: a phone player *does* want one reachable pause — which ⏸ is). Check no test pins it; `test-touchmenu.mjs` pins the ⏸ button's presence.

## 4. The recap card: one "go again now" row

**What.** Below `Press ENTER to retry`, one row, chosen by rule: (a) if the daily is unplayed — "Daily Challenge: N players today, 1 attempt left"; (b) else the gap to the best — "9 points from your best"; (c) else the streak — "Day 4 — play tomorrow for day 5". Never more than one.
**Why.** Measured card text: it nails "vs best" (`＋240 vs best`) and the cause of death, and says nothing about tomorrow. The context file's own read is that the one real visitor played 29 runs in an afternoon and left "with no record, no streak, no daily, no 'you were 12 points short'". The card is the highest-attention screen in the game and it currently spends it on quest deltas for quests the player never read.
**How.** `buildRecapData()` (called from both session-end hooks per AGENTS §v8 D); one extra string field, one row in `drawRecapCard()`'s running cursor (no fixed offsets — AGENTS is explicit). No new save key; all three facts are already computed.
**Fails-today test.** Capture the drawn strings at gameover with (i) daily unplayed, (ii) score 1 below best, (iii) streak 4, and assert each yields exactly its intended row and never a second row. Mutation: drop the rule cascade → one of the three fails.
**Risks.** Overlaps FOV-2729's Share row for vertical space — `recapCardRect` already exists to assert the worst-case card fits (AGENTS §Shareable Runs); adding a row must re-run that assertion.

## 5. Deletion pass: what to hide for a first-timer

Three concrete candidates. All are **hide-until-earned**, not delete: no save key, achievement or test goes away.

- **Five of eight modes** (painter, gauntlet, snap, walled, walled-adjacent, zen) for the first 3 games. *Breaks:* `test-v14`'s mode-select fixtures assert 8 descriptions draw — they set `welcomeOverlay = false` and would need `totalGamesPlayed` seeded. *Cost to keep:* the stranger scans 8 unfamiliar nouns and picks arbitrarily; zen/gauntlet are the two a confused player can lose 5 minutes in without understanding why. *Gain:* one mode, one meaning.
- **Bomb, hunter and portal food** for the first ~40 ticks. *Breaks:* `EXPLORER` needs 6 of 7 food types (AGENTS §v8 E, explicitly "do NOT bump") — the gate must not shrink the pool a session can draw from, so gate on the first 40 ticks of a **first-ever** run, and the achievement survives every later run. `snake_has_seen_*` toasts for portal/bomb stop being able to fire in that window. *Cost to keep:* a first-timer's first three deaths are a bomb, a rift and a rival — all unearned surprises. *Gain:* the opening is a snake game, then it becomes this game.
- **"NEW BEST!" on a first record.** Measured: a first-ever run printed `★ NEW BEST! ★ / ＋240 vs best` — comparing you to 0. *Breaks:* AGENTS §v14 D2 removed the old `prevBest &&` guard *deliberately*, so this re-adds a narrower version (only when the prior best is 0/undefined). *Cost to keep:* a badge worth nothing the first time teaches that the game's praise is inflated. *Gain:* the first honest "best".

Plus two cheap nits an outsider spots immediately: (a) `DPR` is capped at **3** (AGENTS §HiDPI) where the 2026 checklists say cap at 2 because "3× overdraw is fill-rate death on cheap phones" — one character, verify frame time on a throttled phone context; (b) there is **no visible sound control on the first two screens** — `muted` defaults to 0 (`snake.html:448`) and the AudioContext is created lazily (`snake.html:4672`, correctly post-gesture), but the only mute affordance is `M` and a ⏸-row button. Both 2026 checklists say "always offer a visible sound button".

## Rejected (with reasons)

- **A tutorial / level-select / guided first run.** Poki: "walls of text intimidate"; the game already has an 8-toast one-shot system — the fix is sequencing, not more teaching. And v15 spent a cycle on the first ten seconds; adding to it instead of subtracting is the wrong direction.
- **Ghost arena, `G`, drafts, prestige (`X` idle L20) surfaced earlier.** These are the depth that justifies the twelve cycles; they should be *discovered*, not advertised. Hiding them from nobody costs nothing; showing them to a first-timer costs the session.
- **Portals/leaderboards/social.** Backend, accounts, or a portal SDK call: out of scope by hard constraint, and lens 1's territory. Not proposed; flagged only so nobody thinks I missed it.
- **Re-skinning or a new visual identity.** Load is 164 ms and there are no page errors; the art is not the arrival problem.
- **Changing the recap card's score semantics or the cascade disclosure.** v14 D2 and v12 C settled both with evidence; re-opening them is not an outsider's call.
- **Removing the ⏸ tap-target on the board instead** — that *is* §3; listed once.
