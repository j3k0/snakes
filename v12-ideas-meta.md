# Snakes v12 — Ideas (META / PROGRESSION & RETENTION)

Angle: meta-progression and reasons to come back tomorrow. Every idea below reuses
existing meta state (quests, streak, diary, stats, achievements, XP/level/prestige,
cosmetics, mode PBs, daily leaderboard) rather than introducing a new parallel
currency. Line numbers are from `snake.html` @ 8594 lines (v11 merge) and were read
directly while writing this document.

Baseline facts used throughout (all verified by reading `snake.html`):

- XP flows through one funnel: `awardXP(amount)` L7386, with 11 call sites
  (L1539 quests, L3329/L3401 session-end length bonus, L3567 bounty, L6496 survival
  drip `awardXP(1)` every 10 ticks, L6901 food, L7078 epic food, L7543 base
  achievement, L7558 meta-achievement, L7600 daily challenge). `sessionXP` (L769,
  reset L2157) is the run total; it is snapshotted (L2746 / restore L2905).
- Streak lives in `snake_streak_count` / `snake_daily_date`, mutated only in the
  `startGame()` daily block L2377–L2402 (`streak = 1; // Broken streak` at L2393).
  `snake_streak_count` feeds `STREAK_UNLOCKS` (L1205), `STREAK_CHARGE_DAYS` (L2432),
  and the `streakMult` inside `awardXP` (L7389–L7392, cap +30%).
- Quest Board: `QUEST_TEMPLATES` L1425, `QUEST_PROGRESS_MAP` L1454,
  `instantiateQuest` L1469, `generateQuests` L1492, `checkQuestProgress` L1515,
  `claimQuest` L1534, `persistQuests` L1546, `syncQuestState` L1557,
  `renderQuestRow` L1592, `renderQuests` L1615, `showQuestsPanel` L1633.
  Persistence keys `snake_daily_quests` / `snake_weekly_quests` (+ `_date`).
- Diary: `saveDiaryEntry` L501 (skips daily mode L502, stores mode/score/date/duration/
  foodEaten/maxCombo/level/prestige/mutators/brews/seed), cap `MAX_DIARY_ENTRIES = 200`
  L500, `renderDiary` L533, `showDiaryPanel` L580.
- Cosmetics tables: `SNAKE_SKINS` L1146, `GRID_THEMES` L1159, `TRACE_EFFECTS` L1169,
  `BORDER_EFFECTS` L1180, `DEATH_EFFECTS` L1185; unlock sources `LEVEL_UNLOCKS` L1195,
  `STREAK_UNLOCKS` L1205, `STAT_MILESTONES` L1212, `PRESTIGE_REWARDS` L1229.
- `stats` L765 / `getDefaultStats` L7417 / `saveAllState` L7432 / `checkStatMilestones`
  L7574; Stats panel DOM render `showStatsPanel` L7747.

---

## 1. Streak Freeze Vault

**Name** — Streak Freeze Vault

**Concept**
Add a small (`cap 3`) vault of "streak freezes" that spends one to preserve the daily
streak when the player misses exactly one day. Mechanically: in the `startGame()` daily
streak branch, when `storedDate` is *two* days old (one missed day) and a freeze is
banked, consume the freeze and `streak++` instead of resetting to 1 — with a distinct
`❄ Streak protected! (N left)` toast. Freezes are earned by claiming weekly quests
(1 per weekly claim, cap 3), which converts the weakest quest tier into streak
insurance. Player hook: the player who has a 12-day streak and misses Tuesday no longer
loses `STREAK_UNLOCKS` progress (`snake_veteran` at 14, `death_fireworks` at 30) and
their banking progress toward `STREAK_CHARGE_DAYS` 14/30.

**LOC estimate**
~60–75 LOC, all in `snake.html`:
- new keys `snake_streak_freeze` + `snake_streak_freeze_granted`; helper pair
  `grantStreakFreeze()` / `consumeStreakFreezeIfAvailable(storedDate, today)` (~25).
- `startGame()` branch at L2383–L2400 (~15, must not touch the `!storedDate`
  first-ever path L2396–L2400).
- `claimQuest()` L1534 (~10, `period === 'weekly'` → grant).
- idle canvas display beside the streak charge line L4623–L4635 (~6) and/or the DOM
  footer `updateMenuFooter()` L2311 (~4).
- toasts via `queueToast` L7466 (~4).
No reset-site changes (persistent meta resource, same class as `streakCharges` at L773).

**Scores**
Impact 4 · Feasibility 5 · Risk 2 · Synergy 4

**Hook points**
- `snake.html:2383` `if (storedDate && storedDate !== todayStr) {` — the day-gap branch;
  verified it computes `yesterdayStr` (L2389) and only compares one day back.
- `snake.html:2393` `streak = 1; // Broken streak, restart` — the exact reset line the
  freeze must intercept (gap-2 case: `storedDate !== yesterdayStr` but `storedDate ===
  twoDaysAgoStr`).
- `snake.html:2395` / `2399` / `2402` — the three `saveManager.set` writes for
  `snake_streak_count` / `snake_daily_date`; the freeze path must still write the
  streak and the date.
- `snake.html:2432` `const STREAK_CHARGE_DAYS = [7, 14, 30];` and L2434 grant loop —
  untouched, but this is what a preserved streak keeps feeding (visible proof the
  feature compounds).
- `snake.html:1534` `function claimQuest(period, index)` — grants freeze on weekly
  claims; already atomic (sets `claimed`, `awardXP`, `persistQuests` synchronously).
- `snake.html:4623–4635` idle-screen streak block (`🔥 N day streak!` + `🛡×N death
  insurance`) — where `❄×N freeze` is appended inside the same `currentY` flow.
- `saveManager.getInt` / `set` pattern as used at L773–774 (`streakCharges`).

**Failure modes**
- *Off-by-one in the gap math*: computing the "two days ago" string with the same
  local-date arithmetic as L2386–2389. If wrong, the freeze never fires (streak still
  resets) or fires on a 1-day gap (double-incrementing the streak). Observable in
  Chromium: set `snake_daily_date` to two days ago, `snake_streak_count=5`,
  `snake_streak_freeze=1`, press Enter on Daily, then read
  `saveManager.getInt('snake_streak_count') === 6` and
  `getInt('snake_streak_freeze') === 0` plus the toast text; then repeat with a
  one-day-old date and a five-day-old date (must increment / must reset respectively).
- *Freeze spent with no streak to protect*: guard `streak > 1` so a lapsed player with
  `streak === 0/1` doesn't burn a freeze. Catch: seed `snake_streak_count=1` + 2-day-old
  date + 1 freeze, start daily → freeze count must be unchanged.
- *Freeze leak across the daily-attempt guard*: the daily "no attempts" early return at
  L2365–L2376 happens *before* the streak block; the freeze must not be consumed by a
  run that never starts. Catch: set `snake_daily_attempts_remaining=0`, start daily →
  freeze unchanged.
- *Cosmetic-unlock double-toast*: `startGame()` also runs the `STREAK_UNLOCKS` loop
  L2413–L2427 and the charge loop L2432–L2440; a freeze that bumps the streak may fire
  those toasts out of order. `queueToast` serializes (L7466–L7484), so the failure is
  cosmetic — but verify by screenshotting the 14-day boundary case.

**Why now / why not**
Ripe: the streak is already load-bearing (4 cosmetics + death insurance + XP
multiplier) yet its only failure mode is "miss one day, lose everything" — a
retention cliff the game currently does nothing about. It is also nearly free to
build because the reset site is a single, well-isolated branch (L2383–L2402) in the
same block that v11 already edited for daily seeding. Not: it is a *forgiveness*
mechanic, so if the streak is meant to be brutal, this softens the only real
consequence the meta layer has.

---

## 2. Quest Cadence Ladder

**Name** — Quest Cadence Ladder

**Concept**
Add a consecutive-days counter for *finishing* the Quest Board: when the third daily
quest of a day is claimed, if yesterday was also a full-clear day, `cadence++`;
otherwise `cadence = 1`. On cadence 7/14/30 the player earns +1 `streakCharges`
(reusing the existing death-insurance resource and its `STREAK_CHARGE_DAYS` thresholds
rather than minting a new reward). The Quests panel and the idle screen show
`🔥 Cadence: N days · next charge at M`. Player hook: the quest board currently has no
memory — this gives finishing all 3 dailies a multi-week arc, and pays it out in a
resource that changes actual runs (auto-firing death saves in all four death paths).

**LOC estimate**
~80–100 LOC:
- module state `questCadence`, `questCadenceDate`, `questCadenceChargeGranted` next to
  `streakCharges` (L773) (~8).
- `recordQuestCadence()` helper (~30: day-string compare via `getDayString()` L1391,
  staleness guard against `snake_daily_quest_date`).
- `claimQuest()` L1534 hook: after the atomic claim, detect "all 3 dailies claimed and
  date !== today" then call the helper (~15).
- Quests panel line in `renderQuests()` L1615 (~8) and idle canvas line in the
  `drawOverlay` idle branch L4623–L4635 flow (~8).
- `streakCharges` grant + `saveManager.set('snake_streak_charges', …)` mirroring
  L2434–L2440 (~12), toast (~4).

**Scores**
Impact 4 · Feasibility 4 · Risk 3 · Synergy 5

**Hook points**
- `snake.html:1534–1544` `claimQuest(period, index)` — verified: guards
  `!q || !q.completed || q.claimed` (idempotent), sets `claimed`, `awardXP`, then
  `persistQuests()`. The cadence check belongs immediately after `claimQuest`'s
  `persistQuests()` so a crash can't record a cadence day without the claim.
- `snake.html:1515` `checkQuestProgress()` and `snake.html:1492` `generateQuests` —
  must stay untouched (determinism invariant); cadence reads `dailyQuests[i].claimed`
  only.
- `snake.html:1557` `syncQuestState()` — the staleness authority; the cadence check
  should refuse to count a day when
  `saveManager.get('snake_daily_quest_date', '') !== getDayString()` (stale board still
  on screen after midnight).
- `snake.html:1391` `getDayString()` / `snake.html:1398` `getISOWeekString()` — the
  existing date-string helpers (do not invent a new format; these are what
  `persistQuests` L1549–1550 already writes).
- `snake.html:773–774` `streakCharges` / `streakChargeGranted` and
  `snake.html:2432–2440` the charge-grant loop — the reward pattern to mirror.
- `snake.html:6548–6560` `tryStreakChargeSave(wrappedHead)` — the consumer; a cadence
  charge becomes a real death save in all four paths — verified call sites L6585
  (collision), L6616 (wall), L6653 (hazard), L6703 (rival).
- `snake.html:1615` `renderQuests()` / `snake.html:1592` `renderQuestRow(q, period,
  index)` — where the cadence line + "claim to continue the cadence" hint render.
- `snake.html:4623–4635` — idle canvas streak block, same `currentY` flow.

**Failure modes**
- *Midnight double-count*: quests rotate only at `syncQuestState()` (page load + idle
  render + panel open), so a player can claim yesterday's third quest at 00:05 today.
  Without the `snake_daily_quest_date` guard the cadence would count two days for one
  day of play. Catch in Chromium: seed `snake_daily_quest_date` to yesterday with all
  three dailies `completed && !claimed`, call `claimQuest('daily', i)` three times via
  `page.evaluate`, then assert the cadence key is unchanged.
- *Cadence inflation*: claiming a 4th/5th quest (panel re-render, double click) must
  not increment twice — gate on the stored cadence date (`!== today`), verified by
  calling `claimQuest` twice on the same index (already a no-op) and then on an index
  of the weekly list (must not count).
- *Charge-grant sticky state*: like `streakChargeGranted` (L774), the granted-index
  sentinel must reset when the cadence breaks, or rank 7 can never be earned twice.
  Catch: set cadence to 6 + date=yesterday, claim 3 dailies, assert
  `snake_streak_charges` +1 and the granted key set; then simulate a broken cadence and
  assert the sentinel reset.
- *Snapshot drift*: verified `streakCharges` is **not** snapshotted —
  `restoreFromSnapshot` re-reads it from the save key at L2850
  (`streakCharges = saveManager.getInt('snake_streak_charges', 0); // v11 E: re-read
  from saveManager, not snapshot`). The cadence counters must follow the same rule
  (persistent-only, never snapshot fields), otherwise a resumed run can double-grant.
- *Panel row layout*: `renderQuestRow` builds one flex row per quest (L1592); a cadence
  line added per-row would repeat 3× — put it once in `renderQuests()` header.

**Why now / why not**
Ripe: the Quest Board is the newest meta surface (v7) and is currently a flat daily
checklist with zero longitudinal memory, while the *daily challenge* streak (v6/v11)
already proves the ladder pattern works in this codebase. It also gives XP-only quests
a second payoff without flooding the token economy (the AGENTS.md constraint). Not:
it is a second streak next to `snake_streak_count`, and two adjacent streaks can read
as confusing duplication unless the panel labels them clearly ("daily run streak" vs
"quest cadence").

---

## 3. Achievement Progress Meters

**Name** — Achievement Progress Meters

**Concept**
`ACHIEVEMENTS` (L1089) is 42 boolean predicates (counted: L1089–L1134, one `check:function` each); the panel
(`showAchievementsPanel` L7620) shows only 🔒/✅. Add an additive
`ACHIEVEMENT_PROGRESS` map (id → `(stats, ctx) => [current, target]`) covering the
numeric ones (score, length, combo, food counts, time, games, deaths, distance), render
a bar plus `12 / 20` on locked rows, and add a single `Next up: 🏅 Quintessence 340/500`
line to the recap card (`drawRecapCard` L3467). Player hook: the biggest existing meta
surface (42 × XP + a mutator token each) currently gives the player no
sense of distance; a visible ratio converts "impossible" into "two more games".

**LOC estimate**
~120–150 LOC:
- `ACHIEVEMENT_PROGRESS` map, ~40 one-line entries (~45).
- shared ctx builder extracted from `checkAchievements` L7526–7538 (~15, reused by
  panel + recap so the bars and the unlock agree by construction).
- `showAchievementsPanel` L7620 row rendering: bar + counter for locked rows (~25).
- `buildRecapData` L3436 + `drawRecapCard` L3467: pick the closest locked achievement,
  add the line and grow `cardH` from 168 (L3471) (~25). Note the quest-delta lines start
  at `cardY + 100` (L3505) and the retry prompt is anchored at `cardY + cardH - 22`
  (L3515), so the card must grow, not overprint.
- guard/fallback for entries with no progress reader (~10).

**Scores**
Impact 4 · Feasibility 4 · Risk 2 · Synergy 4

**Hook points**
- `snake.html:1089` `const ACHIEVEMENTS = {` — every `check(s,c)` receives `(stats, ctx)`;
  a progress map must use the same two inputs, so bars cannot disagree with unlocks.
- `snake.html:7522–7542` `checkAchievements` — verified it builds
  `ctx = { sessionFoodEaten, sessionTimeAlive, snakeLength, hatTrickEligible,
  eatAllTypes, maxCombo, sessionScore, snapLevel, prestigeLevel }` locally; extract it.
- `snake.html:7574` `checkStatMilestones()` — the toast format precedent for "next
  milestone" messaging.
- `snake.html:7620–7644` `showAchievementsPanel` — verified row template includes a
  `+XP` span for locked rows; the bar replaces/augments that span.
- `snake.html:3436` `buildRecapData()` / `snake.html:3467` `drawRecapCard()` — recap
  already carries `questDeltas`, `isNewBest`, `xpEarned`, `evolutionTier`; add
  `nextAchievement: {icon,name,current,target}`.
- `snake.html:7417` `getDefaultStats()` — the `stats` keys the progress readers use
  (e.g. `normalFoodEaten`, `longestLength`, `totalDistance`, `rivalDefeateds`→
  `rivalsDefeated`).
- `snake.html:1135` `META_ACHIEVEMENTS` — meta rows are set-completions; show
  `2/3` style progress from `achievements[id]` after the base loop (L7553-area).

**Failure modes**
- *Panel render throw*: `showAchievementsPanel` builds one HTML string; a progress
  reader throwing (e.g. `stats.rivalsDefeated` undefined on an old save) blanks the
  whole panel. `getDefaultStats()` L7417 + `loadStats()` L7413 (Object.assign over
  defaults) covers it, but readers must still use `|| 0`. Catch: seed an old-shaped
  `snake_stats` JSON (no `bombsEaten`), open the panel with `F`, screenshot.
- *Bar disagrees with unlock*: if the panel ctx is built differently than
  `checkAchievements`' ctx (e.g. idle render with `snake = []` from L199 → length 0,
  while the unlock ran at gameover with the real body), the row shows `0/20` on an
  achievement that just unlocked. Catch: unlock `LONG_BOI` in a real run, note the
  gameover recap/panel shows `20/20`, and that the row is ✅.
- *Recap overprint*: forgetting the `cardH` change makes the new line collide with
  `Press ENTER to retry` (L3515). Catch: screenshot the gameover screen at 800×600 and
  at a small viewport.
- *Perf*: computing 42 progress readers inside `checkAchievements` on every food eat
  is pointless; only compute on panel/recap render. Catch: assert the eat path still
  runs (combo of ~20 foods in Chromium without frame stalls) — not a unit concern.
- *Source-text trap*: do NOT implement progress by regexing the achievement `desc`
  (e.g. parsing "Survive 3 minutes") — descriptors change and locale-formatting makes
  it brittle; explicit map entries only.

**Why now / why not**
Ripe: the achievement list is the largest content surface in the file (42 entries +
5 meta) and the recap card (v8 D) is already the natural place to surface "next up" —
the plumbing exists, only the numbers don't. Not: it is presentation-only; it changes
no player behavior other than direction, so it must be paired with something that pays
out (a completion-set reward already exists as `META_ACHIEVEMENTS`).

---

## 4. Weekly Wrap Card

**Name** — Weekly Wrap Card

**Concept**
On the first idle/gameover after the ISO week rolls over, show a dismissible canvas
card summarizing the *previous* week: runs played, best score + mode, XP earned,
dailies completed, quests claimed, total time, longest run, and the streak at week end
— computed from the diary (L500–L520) plus a tiny new per-week XP accumulator. Dismissal
mirrors `welcomeOverlay` exactly (any keypress dismisses and falls through, so Enter
still starts a game). Player hook: a Monday ritual that answers "did I actually
progress?" and names one goal for the coming week ("best streak this week: 4 · beats
your previous 3").

**LOC estimate**
~130–160 LOC:
- per-week accumulator `snake_week_key` / `snake_week_xp` + rollover in `awardXP`
  L7386 (flush alongside the existing `saveManager.set('snake_xp', xp)` L7410 /
  `snake_xp_overcharge` L7396) (~20).
- `buildWeeklyWrap()` reading `snake_diary` (L501 writes, L533 reads) filtered by ISO
  date within the previous `getISOWeekString()` (L1398) window (~50).
- `drawWeeklyWrap()` (~45) following `drawRecapCard`'s canvas discipline (L3467:
  single `ctx.save()/restore()`, absolute coords, `textAlign` set inside).
- `weeklyWrapPending` flag + dismissal in the keydown handler (precedent L7793–L7798:
  `welcomeOverlay` flag is cleared, `snake_has_played` saved, then the key falls
  through to normal processing) and a `drawOverlay` idle-branch call (L4577–L4581
  precedent) (~20).
- week-rollover detection at load/idle (`syncQuestState` L1557 is already called from
  `updateMenuFooter` L2311 and on page load).

**Scores**
Impact 4 · Feasibility 3 · Risk 3 · Synergy 4

**Hook points**
- `snake.html:501–520` `saveDiaryEntry()` — verified fields: `date` (ISO string),
  `mode`, `score` (painter stores `paintCoveredCount`), `duration`, `foodEaten`,
  `maxCombo`, `level`, `mutators`, `brews`, `seed`; daily mode is skipped (L502), so
  daily/weekly-wrap counts must come from `snake_daily_lb` (written L3297–L3307).
- `snake.html:500` `MAX_DIARY_ENTRIES = 200` — a heavy player can drop a week's entries
  only if they play >200 runs in a week (unlikely, but the card must say "partial data"
  when the oldest entry is newer than the week start).
- `snake.html:7386–7410` `awardXP` — the single XP funnel; the week accumulator must
  live here (all 11 call sites already route through it).
- `snake.html:1398` `getISOWeekString()` — the week key; do not invent a second week
  definition (quests already use it at L1493/L1549).
- `snake.html:4577–4581` idle branch of `drawOverlay` (`if (welcomeOverlay) {
  drawWelcomeOverlay(); ctx.restore(); return; }`) — the exact precedence slot a wrap
  card should occupy (wrap first, then welcome for a brand-new player).
- `snake.html:7792–7801` keydown welcome-dismissal block — the dismissal contract to
  copy verbatim (flag + save key + fall-through).
- `snake.html:4234` `drawWelcomeOverlay()` — the multi-panel canvas card precedent
  (save/restore discipline, canvas-only, no DOM panel ⇒ no cross-hide contract).
- `snake.html:7413/7432` `loadStats()` / `saveAllState()` — where the two new keys get
  flushed with the existing state writes.
- `snake.html:7466` `queueToast` — for the "Week wrapped!" nudge on gameover.

**Failure modes**
- *Wrong-week rollover*: if the rollover is only checked at page load, a player who
  keeps the tab open across Sunday→Monday never sees the card (or sees last-last week).
  Catch: seed `snake_week_key` to last week with `snake_week_xp=1234` and two diary
  entries dated last week, load the page, screenshot the idle screen (card must show
  1234 XP and 2 runs); then call `syncQuestState()` after rewriting the key and verify
  the accumulator resets exactly once.
- *Blocked input*: a card that swallows Enter (or fails to clear its flag) makes the
  idle screen unusable — the worst outcome here. Catch: Chromium `page.keyboard.press('Enter')`
  right after the card appears must transition to `gameState === 'playing'` and clear
  the pending key; also `page.keyboard.press('ArrowDown')` must still change the
  selected mode.
- *Canvas leak*: the card sets `textAlign`/`font`/`fillStyle`; without
  `ctx.save()/restore()` the idle mode list (L4587–L4600) misaligns afterwards (the
  documented `drawOverlay` leak pattern). Catch: screenshot the idle screen after
  dismissal and compare text alignment with a fresh load.
- *Diary coverage holes*: `saveDiaryEntry` skips daily mode (L502) and stores painter
  coverage as `score` (L508); the wrap must label these clearly or the "best score"
  line is misleading. Catch: seed diary entries with `mode:'painter'` and
  `mode:'daily'` absent, open the wrap, screenshot.
- *XP double count on resume*: `sessionXP` is snapshotted (L2746/L2905); if the wrap
  accumulator were also derived from `sessionXP` at session end, a resumed run would
  double-count. The accumulator must be incremented inside `awardXP` only.

**Why now / why not**
Ripe: the raw material is already on disk (diary + stats + quest dates + leaderboard)
and v8 D proved a canvas card can be rendered and dismissed cleanly — but the game has
never once told a returning player what they did *last* week. Retention-wise this is
the "come back on Monday" hook the meta layer is missing. Not: it introduces the first
per-week accumulator and a second idle-screen overlay state; if the week rollover is
implemented sloppily it will misfire around timezone/midnight boundaries and can block
the idle screen (highest blast radius of the ideas here).

---

## 5. Records Board (per-mode PB ledger + trend)

**Name** — Records Board (per-mode PB ledger + trend)

**Concept**
Add a Records section to the Stats panel: for each of the 8 modes, best score, the
date the best was set (from the diary), average of the last 5 runs, and "runs since
PB" — plus today's daily leaderboard entry. `stats` (L765) only aggregates globally and
`modeHighScores` (L1778) stores bare numbers, so the *when* and the *trend* are
currently unknowable to the player. Player hook: a per-mode improvement readout turns
the mode select screen into a ladder ("Walled: PB 210 (3 days ago) · last 5 avg 150").

**LOC estimate**
~70–90 LOC:
- `computeModeRecords()` (~35): iterate `modeHighScores` (L1778), scan
  `saveManager.getJSON('snake_diary', [])` (L501/L533 pattern) per mode for the best
  entry's date and the last-5 average, and `snake_daily_lb` (L3297) for today.
- `showStatsPanel` L7747 table extension (~30), plus a fallback row when the diary is
  empty.
- optional: backfill "PB date" for players whose best predates the diary (show "—").

**Scores**
Impact 3 · Feasibility 5 · Risk 2 · Synergy 3

**Hook points**
- `snake.html:7747–7780` `showStatsPanel` — verified the whole panel is one HTML string
  with one `<tr>` per stat (`stats.gamesPlayed`, `bestScore`, `longestLength`, …); a
  Records block appends `<tr>`s per mode after `Daily Challenges` (L7776) and before the
  conditional Pinnacle/Overcharge rows (L7777–7778).
- `snake.html:1778` `modeHighScores` / `snake.html:1780` `loadModeHighScores()` — the
  best-score authority; written by `updateScoreDisplay` L2293–L2294 and
  `finalizeSession` L3294–L3295, persisted as `snake_mode_highs`.
- `snake.html:501` `saveDiaryEntry` (dates + per-mode score) and `snake.html:500`
  `MAX_DIARY_ENTRIES = 200` — the trend source and its hard cap.
- `snake.html:3297–3307` daily leaderboard write (top-5 per `getDayString()` key with
  `score/time/foodEaten/maxCombo/ts`) — the daily-specific rows.
- `snake.html:1253` `MODE_CONFIG` / `snake.html:1340` `MODE_ORDER` — iterate modes in
  the canonical order for a stable table.
- `snake.html:1402`-area `hashString` / `snake.html:1355` `getDailySeed` — not needed;
  listed to note the diary `date` field is a full ISO timestamp, so date formatting
  must use `new Date(entry.date)` (as `renderDiary` L546 does).
- `snake.html:2290` `updateScoreDisplay` — the NEW BEST toast already fires live; the
  Records board is its historical counterpart.

**Failure modes**
- *Misleading trends from a capped diary*: after 200 entries the oldest runs vanish, so
  "runs since PB" can be wrong. Catch: seed exactly 200 diary entries with the PB in
  the oldest slot and screenshot (must degrade to "—" rather than a wrong count).
- *Mode name mismatch*: diary stores `mode` strings (`classic`, `timeAttack`, `zen`,
  `painter`, `gauntlet`, `daily` absent, `walled`, `snap`) used by the diary filter
  list at L597; a Records board keyed off `MODE_ORDER` (L1340) must map
  `MODE_CONFIG[mode].name` for display (mode ids are camelCase: `timeAttack`).
- *Painter coverage leak*: painter mode stores coverage in `score` (L508), so its
  "PB" is coverage, not points — if `MODE_CONFIG.painter.scoreIs === 'coverage'`
  (L1280) isn't respected, the panel compares apples to oranges. Catch: play a
  painter run, open TAB, screenshot.
- *DOM size*: the panel already has `max-height:70vh` with `overflow-y:auto`
  (L102); 8 extra rows fit, but a per-mode sparkline would not — keep it tabular.

**Why now / why not**
Ripe: pure read of data already persisted — no new keys, no new systems, nothing to
migrate, and the Stats panel is the one meta surface that hasn't grown since v6. Not:
it is the lowest-impact idea here; it informs and motivates but never *changes* play,
and the diary's 200-entry cap means the trend is only truthful for recent runs.

---

## 6. Session XP Ledger

**Name** — Session XP Ledger

**Concept**
`sessionXP` (L769) is a single number shown as `＋N XP` on the recap card (L3499
`xpLine`, built at L3462). Tag every `awardXP` call with a source and accumulate a
per-run ledger (food / survival drip / bounty / achievements / quests / daily /
session-end bonus), then render the top 3 sources on the recap card and a full
breakdown in the Stats panel. Player hook: it makes the meta economy legible — the
player learns that the `awardXP(1)` survival drip at L6496 and quest claims are worth
far more than food, which changes what they optimize tomorrow.

**LOC estimate**
~90–110 LOC:
- `awardXP(amount, source)` signature + `xpLedger` object; default `source='other'`
  (~12).
- tag 11 call sites (L1539, L3329, L3401, L3567, L6496, L6901, L7078, L7543, L7558,
  L7600) (~15, mechanical).
- reset in `resetGame()` beside `sessionXP = 0` (L2157) and in `resetWaveState()`
  (L5774) (~6).
- snapshot additive fields in `saveSnapshot` near `sessionXP: sessionXP` (L2746) and
  `restoreFromSnapshot` near L2905 (~8).
- recap card: replace the single XP line with 3 short lines, grow `cardH` (L3471) (~20).
- Stats panel "Last session XP" section (~20).

**Scores**
Impact 3 · Feasibility 4 · Risk 2 · Synergy 4

**Hook points**
- `snake.html:7386` `awardXP(amount)` — verified the whole XP path: streak multiplier
  (L7389–7392), level-20 overcharge branch (L7393–L7397), level-up loop (L7402–L7408),
  and the two `sessionXP += amount` writes (L7395, L7400). Adding a `source` parameter
  and one ledger increment is additive for all callers.
- `snake.html:6496` `if (gameTick % 10 === 0) awardXP(1);` — the survival drip; it runs
  every 10 ticks (~1.2 s at the 120 ms base tick) and will dominate the ledger in long
  runs. Worth its own labelled row, not lumped into "other".
- `snake.html:1539` quest claim, `snake.html:3567` bounty reward, `snake.html:7543` /
  `7558` achievements + meta, `snake.html:7600` daily challenge, `snake.html:3329` /
  `3401` session-end `snake.length * 10`, `snake.html:6901` / `7078` food.
- `snake.html:2157` `sessionXP = 0;` inside `resetGame()` — verified this is the only
  `sessionXP` reset in the file (grep: 769 declare, 2157 reset, 2746/2905 snapshot,
  3462 display, 7395/7400 accumulate). `resetWaveState()` (`snake.html:5774`) does NOT
  touch `sessionXP`, so the ledger needs its own reset added there (Gauntlet waves reset
  the snake, so a per-wave ledger must be cleared too — the double-reset invariant from
  AGENTS.md).
- `snake.html:2746` snapshot build (`sessionXP: sessionXP`) / `snake.html:2905`
  restore — additive fields only; do NOT bump `SNAPSHOT_VERSION`.
- `snake.html:3462` `xpEarned: sessionXP || 0` in `buildRecapData` / `snake.html:3500`–
  `3506` the `xpLine` draw — the display site.
- `snake.html:7747` `showStatsPanel` — where the full breakdown lives.

**Failure modes**
- *Mis-tagged source*: the ledger total silently diverges from `sessionXP` when a call
  site is missed (they are computed independently). Catch: in Chromium, run a scripted
  session (eat one common food, complete one bounty, take the gameover bonus), then
  assert `sum(Object.values(xpLedger)) === sessionXP` and screenshot the recap card.
- *Ledger vs snapshot*: a run resumed from a snapshot (v7 E) starts with a zeroed
  ledger unless it is snapshotted — the recap would then under-report. Catch: start,
  eat, save `saveSnapshot()`, `location.reload()`, `restoreFromSnapshot()`, finish, and
  compare the recap breakdown to the pre-reload ledger.
- *Level-20 overcharge path*: the `return` at L7397 must still increment the ledger
  before returning, or maxed players see an empty breakdown. Catch: set `xp` above the
  level-20 threshold, eat food, screenshot the recap.
- *Recap card height*: three lines instead of one need `cardH` growth or they overprint
  the quest-delta lines (L3498–L3504) and the retry prompt (L3507). Catch: screenshot
  gameover with 3 quest deltas *and* a full ledger.
- *Tag cost in the hot path*: one extra object increment per food eat is negligible,
  but the ledger must NOT be persisted on every eat (`saveManager.set` per eat already
  happens for `snake_xp` L7410 — do not add a second write).

**Why now / why not**
Ripe: the XP economy has grown to eleven sources across six versions and is now
opaque — a single number the player cannot attribute. `sessionXP` instrumentation is
also the cheapest possible way to rebalance later (you cannot tune what you cannot
measure). Not: it is diagnostics-flavored; it changes no balance, so a player who
already understands XP gains little, and it dilutes the recap card's job of celebrating
the run.

---

## 7. PB Chase HUD

**Name** — PB Chase HUD

**Concept**
Show the player's personal best for the current mode on the in-run HUD with a live
delta: `🏆 PB 250 · 190 (60 to go)`, flipping to a gold `★ +12 over PB` once passed,
plus a `pushTransientRing` burst and the existing `playSound('achievement')` at the
crossing moment. The best value is frozen at run start via `sessionModeHighStart`
(L2451), so mid-run PB writes from `updateScoreDisplay` (L2290) can't corrupt the
target. Player hook: gives every run a mid-term goal even when the mode's high score is
far away — the single cheapest way to convert a leaderboard number into in-run tension.

**LOC estimate**
~40–60 LOC:
- `drawPBChaseHUD()` (~30) modeled on `drawDailyHUD` (L5619) — one `ctx.save()/restore()`,
  `hudFont` (L722), reads `sessionModeHighStart`, `score`/`snake.length`, and
  `MODE_CONFIG[gameMode].scoreIs` for the label.
- call from the HUD block in `drawGame` (L6217–L6224) (~1).
- crossing detection in `updateScoreDisplay` (L2290) or the eat block (~10):
  `sessionModeHighStart > 0 && score > sessionModeHighStart && !pbCrossedThisRun`.
- optional ring via `pushTransientRing` (L4141) (~5).
- `pbCrossedThisRun` reset in `resetGame()` L2135 / `resetWaveState()` L5774 (~4).

**Scores**
Impact 4 · Feasibility 5 · Risk 1 · Synergy 3

**Hook points**
- `snake.html:6217–6224` HUD call block in `drawGame`: `drawXPBar()`,
  `drawComboBankHUD()`, `drawPrestigeBorder()`, `drawTimeAttackHUD()`, `drawSnapHUD()`,
  `drawDailyHUD()`, `drawPowerUpHUD()`, `drawRivalHUD()`, `drawGauntletHUD()` — verified
  by reading; a PB line slots here.
- `snake.html:5619–5637` `drawDailyHUD` — verified it already paints
  `🎯 <challenge desc>` at `y=2` and `Progress: x/y` at `y=18`, centered. A PB line must
  NOT also go top-center or it collides in daily mode; bottom-center or left edge is the
  free space (the XP bar owns `CANVAS_HEIGHT-22` at `x=5..125`, L5476–L5481, and the
  combo bank badge owns `CANVAS_HEIGHT-28` at `x=5`, L5515–L5518).
- `snake.html:783` `let sessionModeHighStart = 0;`, set at `snake.html:2451`
  (`sessionModeHighStart = modeHighScores[gameMode] || 0;`), snapshotted L2765,
  restored L2907 — the frozen PB target already exists and is resume-correct.
- `snake.html:2290–2297` `updateScoreDisplay` — verified the live NEW BEST toast
  (`🏆 NEW BEST! <mode>: <score>` + `playSound('achievement')`) fires only when
  `sessionModeHighStart > 0 && prevBest && score > prevBest`; the HUD crossing must use
  the same guard so "first ever run in a mode" doesn't celebrate a PB of 0.
- `snake.html:1832` `addScore` — the score funnel (return value of `pinnacleRank`/
  overcharge multipliers is applied at L1838); reading `score` in the HUD is safe
  (read-only draw, no rAF write).
- `snake.html:4141` `pushTransientRing` — the shared ring helper for the crossing burst.
- `snake.html:2135` `resetGame` + `snake.html:5774` `resetWaveState` — the two reset
  sites for `pbCrossedThisRun`.
- `MODE_CONFIG[gameMode].scoreIs` at `snake.html:1253` (values: `'points'`, `'length'`
  for zen, `'coverage'` for painter) — the label switch.

**Failure modes**
- *HUD collision*: top-center is taken by `drawDailyHUD` (L5629/L5635) and the mutator /
  resonance lists paint along `CANVAS_WIDTH - 5` (L6242–L6258) — a naive top-left PB
  line also collides with `drawMuteIndicator`/`SYN` (L5443, L6206–L6215). Catch:
  screenshot in daily mode with a mutator active and check no overlap.
- *Wrong label per mode*: zen scores by length (L1264) and painter by coverage (L1280);
  printing "PB 250 pts" in zen is nonsense. Catch: start zen with a seeded
  `snake_mode_highs.zen`, screenshot the HUD.
- *First-run PB of 0*: without the `sessionModeHighStart > 0` guard the HUD reads
  `PB 0 · 10 (0 to go)` and flips to "over PB" on the first food. Catch: clear
  `snake_mode_highs`, start a fresh mode, eat once, screenshot.
- *Negative delta after a resume*: `restoreFromSnapshot` re-reads
  `sessionModeHighStart` (L2907) from the snapshot; if a snapshot written before a PB
  increase is restored, the delta can read oddly. Catch: verify the HUD immediately
  after a snapshot restore shows the snapshot's frozen PB, not the live one.
- *PB flash spam*: the crossing fires once per run (guard `pbCrossedThisRun`) — a
  repeated ring + sound on every subsequent eat is the obvious bug. Catch: eat 5 foods
  after crossing, assert exactly one ring is present in `transientRings`.

**Why now / why not**
Ripe: it needs no new state (sessionModeHighStart, modeHighScores, addScore,
pushTransientRing all exist), has the lowest risk of any idea here, and gives an
in-run payoff to a meta number that currently only rewards at session end. Not: it is
shallow — a pure HUD readout with no new progression; if the team wants depth over
breadth, this is the idea to take *last*, even though it is the cheapest.

---

## 8. Collection Index

**Name** — Collection Index

**Concept**
The Cosmetics panel only ever shows what the player already owns: `cycle()`
(L7665–L7676) skips locked ids entirely, so locked skins/grids/trails/deaths/borders are
invisible — and the ids minted by `STAT_MILESTONES` (L1212) are not in any category map
at all, so they can never render anywhere. Add a Collection section to the cosmetics
panel: per-category `N/M unlocked`, and a compact list of locked items with their
source (`Lv.12`, `streak 7`, `Prestige 4`, `5,000 tiles`). Player hook: a visible
collection with named sources converts the 4 already-implemented unlock ladders into
concrete goals instead of luck.

**LOC estimate**
~90–120 LOC:
- `cosmeticSource(id)` resolver (~35): invert `LEVEL_UNLOCKS` (L1195), `STREAK_UNLOCKS`
  (L1205), `PRESTIGE_REWARDS` (L1229), `STAT_MILESTONES` (L1212); handle both the
  numeric `unlock:` values present in `SNAKE_SKINS`/`GRID_THEMES` (e.g. `unlock: 18`)
  and the string sentinels (`'prestige_2'`, `'streak_14'`).
- section render inside `showCosmeticsPanel`'s `renderPanel()` (L7678) (~50).
- counts only — no new persistence (`unlockedCosmetics` L1237 is the authority).

**Scores**
Impact 3 · Feasibility 5 · Risk 1 · Synergy 4

**Hook points**
- `snake.html:7660–7672` `cycle(currentId, categoryMap, direction)` inside
  `showCosmeticsPanel` — verified it iterates `Object.keys(map)` and returns only ids
  present in `unlockedCosmetics` (L1237); locked items are structurally unreachable.
- `snake.html:1146–1192` `SNAKE_SKINS` / `GRID_THEMES` / `TRACE_EFFECTS` /
  `BORDER_EFFECTS` / `DEATH_EFFECTS` — the full item space (10 + 7 + 8 + 2 + 7 = 34
  entries) with mixed `unlock:` types (numbers for level gating, strings for
  streak/prestige).
- `snake.html:1195–1203` `LEVEL_UNLOCKS` (levels 2–20) — the level→id map, also consumed
  by `checkLevelUnlocks` L7497.
- `snake.html:1205–1210` `STREAK_UNLOCKS` (`{3,7,14,30}`) — consumed by the loop in
  `startGame` L2413–L2427.
- `snake.html:1229–1235` `PRESTIGE_REWARDS` (1–5) — consumed by `checkPrestigeUnlocks`
  L7513.
- `snake.html:1212–1227` `STAT_MILESTONES` (`milestone_distance_5k`, …) — verified its
  ids are pushed into `unlockedCosmetics` by `checkStatMilestones` L7574–L7590 but
  belong to no category map, so they are permanently invisible today. This is the
  concrete pre-existing gap the Collection Index fixes.
- `snake.html:1237` `unlockedCosmetics` / `snake.html:1238` `cosmetics` (equipped);
  persistence keys `snake_unlocks` / `snake_equipped` (L1241–L1244).
- `snake.html:7620` / `snake.html:7606` — the DOM panel + `closeAllPanels`; adding rows
  to an existing panel does NOT trigger the cross-hide contract (only new panels do).

**Failure modes**
- *Wrong source attribution*: the skin tables carry `unlock:` numbers that duplicate
  `LEVEL_UNLOCKS` (e.g. `snake_lava: unlock 18` and `LEVEL_UNLOCKS[18] =
  ['snake_lava']`); a resolver reading the table instead of the map can show stale
  text if the two ever diverge. Mitigation: resolve from the maps, treat the table
  `unlock` field as display-only. Catch: assert every id in a category resolves to a
  non-"??" source in the panel (screenshot) and spot-check `snake_ghost` → "Prestige 2".
- *Unreachable items shown as reachable*: `trace_galaxy`/`snake_ghost`/`grid_tron` are
  prestige-only and `death_fireworks` is streak-30; a resolver that falls back to
  "Level ?" would mislead. Catch: screenshot the locked list for a fresh save.
- *Count drift*: `unlockedCosmetics` may contain milestone ids that aren't in any
  category, inflating "N/M" if the count is taken from the array length rather than the
  category intersection. Catch: seed `snake_unlocks` with `milestone_distance_5k` +
  `snake_green` and assert the snake category reads `1/10`, not `2/10`.
- *Panel growth*: `#cosmeticsPanel` (L104) has no `max-height` (unlike the quests and
  settings panels); a 34-row collection can overflow a phone viewport. Catch: resize the
  Chromium viewport to 360×640 and screenshot.

**Why now / why not**
Ripe: four unlock systems (level, streak, prestige, milestones) already write into
`unlockedCosmetics`, and one of them (milestones) currently renders nowhere — so this
is partly a correctness fix dressed as a collection screen. It also strengthens the new
streak/prestige features from v11 by making their payoffs visible. Not: it is
cosmetic-direction UI with no mechanical consequence; if the priority is *gameplay*
depth, this is filler.

---

## 9. Milestone Wall

**Name** — Milestone Wall

**Concept**
`STAT_MILESTONES` (L1212) fires a one-time toast at each threshold and then becomes
invisible (its ids land in `unlockedCosmetics` with no renderer — see idea 8). Add the
missing half: a "Next milestones" block in the Stats panel showing each tracked stat's
distance to its next threshold (`Wanderer 3,412 / 5,000 tiles`) and a trophy list of the
achieved ones. Player hook: it gives the lifetime stats a visible horizon — currently
`totalDistance`, `totalFoodEaten`, `rivalsDefeated`, and `gamesPlayed` climb forever
with nothing to aim at after the last achievement.

**LOC estimate**
~55–75 LOC:
- `nextStatMilestones()` helper (~30): for each key in `STAT_MILESTONES`, find the
  lowest threshold above `stats[key]` and the previous one for bar progress.
- `showStatsPanel` L7747 section (~25): a "Next up" table plus an achieved-trophies
  line, reusing `milestone.icon`/`name` from the config.
- optional idle-screen one-liner (~10).

**Scores**
Impact 3 · Feasibility 5 · Risk 1 · Synergy 3

**Hook points**
- `snake.html:1212–1227` `STAT_MILESTONES` — verified shape
  `{ totalDistance: {5000:{id,name,icon,msg}, 25000:{…}}, totalFoodEaten: {1000:…},
  rivalsDefeated: {25:…,100:…}, gamesPlayed: {200:…} }`; the keys are exactly the
  `stats` fields incremented in the tick loop (`stats.totalDistance++` at L6495,
  `stats.rivalsDefeated++` at L3255, `stats.totalFoodEaten` at L6806/L6860, and
  `stats.gamesPlayed++` in `finalizeSession` L3285).
- `snake.html:7574–7590` `checkStatMilestones()` — verified it is called from BOTH
  session ends (`gameOver` L3340, `endZenSession` L3412) and pushes ids into
  `unlockedCosmetics` (L1237) with a `queueToast(milestone.icon + ' ' + milestone.name
  + ': ' + milestone.msg, 4000)`. Note: milestones are therefore *only* evaluated at
  session end — a stat that crosses a threshold mid-run is announced at death, which
  the Wall should keep consistent.
- `snake.html:7747–7780` `showStatsPanel` — the render site (single HTML string;
  append after the existing 16 `<tr>` rows).
- `snake.html:7413` `loadStats()` / `snake.html:7417` `getDefaultStats()` — every
  tracked key has a default, so no undefined guards beyond the existing `continue`.
- `snake.html:7432` `saveAllState()` — no changes needed (stats already persisted).
- `snake.html:7574` also writes no dedicated key; the Wall must NOT add persistence
  (it is a pure view over `stats` + `unlockedCosmetics`).

**Failure modes**
- *Threshold ordering*: thresholds are numeric object keys; iterating them requires
  `parseInt` (the existing code does `parseInt(threshold)` at L7580) — string-sorted
  keys would compare "1000" < "5000" incorrectly if compared as strings. Catch: seed
  `snake_stats.totalFoodEaten = 900`, open TAB, assert the panel shows "Gourmet … 900 /
  1,000" (not 1,000 already reached); then set 1500 and assert it shows as achieved.
- *Stale panel after a run*: `showStatsPanel` re-renders on open (verified: it
  reassigns `el.innerHTML` every call), so no caching bug — but if the Wall were cached
  at load it would show pre-run numbers. Catch: play a run, open TAB, compare to
  `stats.totalFoodEaten` read via `page.evaluate`.
- *Milestone toast regression*: touching `checkStatMilestones` for the helper risks
  double-toasting (it currently checks `unlockedCosmetics.indexOf(milestone.id) === -1`
  before toasting). Catch: cross a threshold in a real run (drive ticks) and assert
  exactly one toast text appears (`processToastQueue` L7472 serializes them).
- *Formatting*: `totalDistance` is tiles and `gamesPlayed` is a count; a generic
  `toLocaleString()` render is fine, but XP-like abbreviations would be wrong. Catch:
  screenshot.

**Why now / why not**
Ripe: the config already exists and is already evaluated at both session ends; only the
display half was never built, so this is the smallest possible completion of an
existing system rather than a new one. Not: the payoff is thin — four stat keys with
six thresholds total, so the "wall" is really a short shelf; if the team wants a long
ladder, the config needs more thresholds first (which is also cheap, but is content,
not code).

---

## 10. Quest Reroll (token sink)

**Name** — Quest Reroll (token sink)

**Concept**
Some daily boards are unwinnable-ish in one sitting ("Play a Walled run" ×3 when you
have five minutes). Add a `↻ Reroll (1 ⚡)` button on each unclaimed quest row that
swaps the quest for a different template/target from the same period pool, spending one
`mutatorTokens` (L433) — the same currency already spent on brew unlocks (L988), mutator
draft re-rolls (L7891), and mutator unlocks (L5997). The rerolled quest is persisted with
an additive `rerolled: true` field so the board survives a reload, while
`generateQuests` (L1492) and its determinism stay untouched for un-rerolled quests.

**LOC estimate**
~75–95 LOC:
- `rerollQuest(period, index)` (~40): guard `gameState` not playing (mirror the panel
  key guard), require `mutatorTokens > 0` and `!q.completed`, build the pool excluding
  already-present `templateId`s from `QUEST_TEMPLATES` (L1425) filtered by
  `(period === 'daily' ? t.daily : t.weekly).length > 0`, pick with a
  `Math.random()`/`hashString`-seeded index, replace the array slot via
  `instantiateQuest` (L1469) so `progressKey`/`reward` stay well-formed, set
  `rerolled = true`, decrement tokens + `saveManager.set('snake_mutator_tokens', …)`,
  `persistQuests()` (L1546), `renderQuestRow`/`renderQuests` re-render (~10).
- button in `renderQuestRow` (L1592) beside the existing `Claim` button (~15).
- token balance display in `renderQuests` (L1615) (~6).

**Scores**
Impact 3 · Feasibility 3 · Risk 4 · Synergy 4

**Hook points**
- `snake.html:1425–1451` `QUEST_TEMPLATES` (20 entries with `daily`/`weekly` target
  pools) and `snake.html:1454–1465` `QUEST_PROGRESS_MAP` — verified every template's
  `progressKey` has a reader; a reroll must pick from the same pool so the invariant
  holds automatically.
- `snake.html:1469–1490` `instantiateQuest(template, target, period)` — the constructor
  that sets `id/templateId/desc/param/progress/target/completed/claimed/reward/period`;
  reroll must go through it (hand-coding a quest object is how `progressKey`/`reward`
  drift appears).
- `snake.html:1492–1512` `generateQuests(period)` — the determinism contract
  (`mulberry32(hashString(getDayString() + '_quests_daily'))`); must NOT be modified.
  The reroll is a post-generation mutation of the persisted array.
- `snake.html:1534` `claimQuest` / `snake.html:1546` `persistQuests` — the atomic-claim
  pattern to copy; `persistQuests` writes `snake_daily_quests`/`snake_weekly_quests` +
  both date keys, so `rerolled` rides along free.
- `snake.html:1557–1574` `syncQuestState()` — verified it restores the persisted array
  when `snake_daily_quest_date === today` and only regenerates otherwise; a rerolled
  board therefore persists across reloads within the same day. (Cross-midnight it is
  correctly discarded.)
- `snake.html:1592–1613` `renderQuestRow(q, period, index)` — verified the Claim
  button is an inline `onclick="claimQuest('daily',0)"` calling a bare-name global; the
  reroll button follows the same pattern (`function` declarations become `window.*`).
- `snake.html:433` `let mutatorTokens = saveManager.getInt('snake_mutator_tokens', 0);`
  and `snake.html:7891–7896` the draft re-roll spend (decrement + `saveManager.set` +
  `queueToast('Re-rolled! (Tokens: N)')`) — the sink precedent.
- `snake.html:5997` / `snake.html:988` — other token sinks, to price the reroll
  against (mutator unlock costs, brew costs from `BREWS_CONFIG` L960).

**Failure modes**
- *Determinism invariant break*: if the reroll rewrites the *seed* or is evaluated
  inside `generateQuests`, the "same day ⇒ same 3 quests" property asserted by
  `node test-quests.mjs` dies. Keep `generateQuests` pure; verify by running the daily
  quest generation twice in Chromium (`syncQuestState()` after clearing the date keys)
  and asserting identical `templateId`s for an un-rerolled board.
- *Duplicate/absent quests after reroll*: picking a template already on the board makes
  the board show the same goal twice; picking one with an empty pool for the period
  yields `target: undefined` and a NaN progress bar. Catch: reroll 20× in a loop via
  `page.evaluate` and assert every quest has a finite `target` and distinct
  `templateId`s per period.
- *Token drain / negative balance*: the button must be disabled at 0 tokens and must
  re-check inside `rerollQuest` (the inline `onclick` can fire twice on a slow tap).
  Catch: set tokens to 1, double-click the button, assert tokens === 0 and the quest
  changed once.
- *Reroll after completion*: rerolling a completed-but-unclaimed quest would let a
  player re-roll away a finished goal; restrict to `!q.completed && !q.claimed`.
  Catch: complete a quest by driving the run, then assert the reroll button is absent.
- *Panel re-render vs. progress*: `checkQuestProgress` (L1515) is called from the eat
  block and both session ends; a rerolled quest starts at `progress: 0` and must climb
  again from live readers (not resume the old quest's value). Catch: reroll
  `score_target` → `reach_length`, eat food, assert the new quest's `progress` tracks
  `snake.length` and not the old score.
- *Economy collision*: tokens are also the mutator-progression currency; pricing the
  reroll at 1 makes it cheap enough to spam rerolls into a favourable board. This is a
  balance risk, not a bug — an honest mitigation is pricing at 2 tokens or capping
  rerolls per period (e.g. 3/day), at the cost of one more stored counter.

**Why now / why not**
Ripe: the Quest Board is XP-only precisely because the design review refused to flood
the token economy — a reroll is the *sink* that economy has been missing, and quest
determinism (v11 D) means reroll frustration is now reproducible and therefore
visible. Not: it deliberately pokes the one invariant the quest system was built to
protect, and it is the only idea here whose failure mode can silently corrupt the
board (undefined target / duplicate templates). If the team is not willing to add the
per-period cap and the pool-exclusion logic, skip it.

---

## Top 3 picks

1. **Streak Freeze Vault (#1)** — the only idea that removes a hard retention cliff
   rather than adding content. The streak already gates four cosmetics
   (`STREAK_UNLOCKS` L1205), the death-insurance charges (L2432), and an XP multiplier
   (L7389), so a single missed day currently erases progress across three systems at
   once. The interception point is one branch (L2383–L2402) in a block v11 already
   touched, the reward source (weekly quest claims, L1534) gives the weakest quest tier
   a reason to exist, and the whole thing is verifiable by seeding three localStorage
   date scenarios and pressing Enter. Ranks first on impact-per-LOC and on retention.
2. **Quest Cadence Ladder (#2)** — the deepest compounding idea: it turns the Quest
   Board from a daily checklist into a multi-week arc and pays out in `streakCharges`,
   which feed directly back into all four death paths (`tryStreakChargeSave` L6548,
   called at L6585/L6616/L6653/L6703). It reuses existing date
   helpers (`getDayString` L1391), existing persistence shape, and existing thresholds
   (L2432), so there is no new currency and no new UI surface. It ranks below the
   freeze only because two adjacent streaks risk confusing labelling, and because the
   staleness guard (claiming after midnight) is the kind of edge the last two releases
   have been bitten by.
3. **Achievement Progress Meters (#3)** — highest reach of the "make existing meta
   compound" ideas: it upgrades the largest content surface in the file (42
   achievements + 5 meta, L1089/L1135), plugs into the recap card that already exists
   (L3436/L3467), and can share one ctx builder with the unlock check so bars and
   unlocks cannot disagree. It is presentation-only, which is exactly why it is cheap
   and safe — but it is third, not first, because it changes direction rather than
   consequence.

**Cheapest-strong alternative:** PB Chase HUD (#7). If only one small change ships this
cycle, it is this one — ~40 LOC, one new flag, zero new state, lowest risk of the set,
and it makes every single run (not just session ends) feel like it is chasing something.
It is not in the top three purely because it adds no progression depth.
