# Snakes v11 — Meta/Retention Ideas

8 ideas focused on cross-session progression, goals, social comparison, collections, and economy. Each compounds with existing systems rather than standing alone. No backend (localStorage only). All hook points verified against snake.html (8033 lines, commit cfaf4f0).

Legend — Impact / Feasibility / Risk / Synergy, each 1–5 (Risk higher = riskier).

---

## 1. Prestige Perk Tree (reconsidered)

**Concept.** Each prestige/pinnacle rank (line 7439–7459) grants one permanent perk point spent in a small tree (~12 nodes) of passive bonuses that modify *existing* systems: "+1 daily quest slot", "start each run with 1 combo charge", "+10% XP from quests", "brews cost −1 token", "golden hoard interval −15s". The tree is the prestige reward — currently prestige only unlocks static cosmetics (line 7002), so the loop is "reset for a skin"; this makes it "reset for power that changes how you play."

**LOC estimate.** ~220 (tree def + render in cosmetics/achievements panel + apply-on-run-start hooks + save key `snake_perk_spent`).

**Scores.** Impact 5 · Feasibility 3 · Risk 3 · Synergy 5

**Hook points.**
- `prestigeLevel` / `pinnacleRank` award sites: line 7441, 7451 (grant a perk point alongside the level bump)
- `resetGame()` line 2055 + `resetWaveState()` line 5419 — apply start-of-run perks (combo charge, etc.)
- `claimQuest()` line 1497 — XP-boost perk scales `awardXP(q.reward.xp)` at line 1502
- `purchaseBrew()` line 952 — cost-reduction perk reads `mutatorTokens` / `brew.cost`
- `awardXP()` line 6879 — XP multiplier perk
- `BREWS_CONFIG` cost field (line 943 area) + `mutatorTokens` line 403
- New save key via `saveManager.set('snake_perk_points', …)` / `saveManager.getJSON('snake_perk_spent', {})`
- Cross-hide panel contract: add perks display to every `show*Panel` (lines 557–559, 1003–1006, 1604–1613, 1671–1679)

**Why now / why not.** Ripe: prestige currently has no mechanical payoff beyond cosmetics, so the reset loop is shallow; a perk tree is the canonical retention fix for prestige systems and feeds back into quests, XP, combo bank, and brews. Risk: perk balance could trivialize daily/quest difficulty — gates needed (no perk in daily mode, or perks scaled by `prestigeLevel` so they only matter after the reset).

---

## 2. Seasonal Ladder (reconsidered)

**Concept.** A rolling ~30-day season whose ladder rank is a composite score drawn from three systems already tracked: daily-seed leaderboard results (line 3064), quest completions (`checkQuestProgress` line 1478), and streak length (line 2271). Rank tiers (Bronze→Mythic) award a seasonal cosmetic border + a perk point (if Perk Tree ships) at season rollover. The ladder is personal-progress (no backend) but framed as a league, giving weekly/daily actions a shared long-arc meaning.

**LOC estimate.** ~180 (season state, score formula, rollover via `getDayString` delta, stats-panel render, `STREAK_UNLOCKS`-style cosmetic grant).

**Scores.** Impact 4 · Feasibility 4 · Risk 2 · Synergy 5

**Hook points.**
- Daily leaderboard write: line 3064–3070 (`snake_daily_lb`) → read for season points
- Quest completion: `checkQuestProgress()` line 1478 (count completed quests for season score)
- Streak: `saveManager.getInt('snake_streak_count', 0)` line 2271 → contributes to season score
- Season rollover: compare `saveManager.get('snake_season_start', '')` against `getDayString()` line 1354
- Cosmetic grant path: mirror `STREAK_UNLOCKS` loop at line 2297–2306 (push to `unlockedCosmetics`, `saveManager.setJSON('snake_unlocks', …)`)
- Display: `showStatsPanel()` line 7228 (add a season rank row) + `updateMenuFooter()` line ~2214 (season badge next to prestige info at line 2217)
- `BORDER_EFFECTS` line 1143 — add seasonal border cosmetic IDs

**Why now / why not.** Ripe: the game already has the three ingredient systems but no aggregation layer; players have no reason to care about daily leaderboard position beyond today. A seasonal arc ties daily play into a 30-day goal. Risk: low (pure read + display); the only balance concern is making the composite formula feel rewarding for casual vs. hardcore — solvable by capping streak contribution.

---

## 3. Weekly Seeded Gauntlet (reconsidered)

**Concept.** A deterministic weekly gauntlet run seeded from `getISOWeekString()` (line 1361) — one attempt per ISO week, scored on a persistent weekly leaderboard (`snake_weekly_gauntlet_lb`), distinct from the daily seed. It reuses the existing gauntlet wave engine (line 797, `GAUNTLET_WAVES`) and mastery points (line 830) but adds a weekly retention cadence alongside the daily one, so the most engaged players have a second anchored reason to return each week.

**LOC estimate.** ~140 (weekly seed wiring, attempt-limit gate, leaderboard read/write mirroring daily, idle-screen render row).

**Scores.** Impact 4 · Feasibility 4 · Risk 2 · Synergy 4

**Hook points.**
- `getISOWeekString()` line 1361 — weekly deterministic seed (mirrors `getDayString()` for daily)
- `GAUNTLET_WAVES` line 797, `resetWaveState()` line 5419 — reuse wave engine
- `gauntletMasteryPoints` line 830, increment at line 5480 — weekly contributes to mastery
- Daily leaderboard write pattern at line 3063–3070 — clone for `snake_weekly_gauntlet_lb`
- Attempt gate: mirror `dailyAttempts` / `syncDailyState()` line 6929–6944 (new `snake_weekly_gauntlet_attempts`, reset on ISO-week change via `getISOWeekString`)
- Idle render: the gauntlet block near line 4333 (daily panel) — add a weekly row
- `MODE_CONFIG.gauntlet` line 1245 — add a `weeklyGauntlet` mode variant or a flag

**Why now / why not.** Ripe: daily seed is the strongest retention hook but offers no weekly anchor; gauntlet already has a mastery track that feels underused. Risk: gauntlet is the most complex mode — a second seeded variant doubles test surface; mitigate by reusing `resetWaveState` and only differing in seed + attempt gating.

---

## 4. Run Code Cards (reconsidered)

**Concept.** Before each *daily* run, the player picks 1 of 3 deterministic "code cards" (seeded from `getDayString()` via `mulberry32`/`hashString`, line 680/1375) that stack a modifier onto the daily run: e.g., "Golden Hoard every 45s", "+1 combo charge capacity", "hunter food slowed 25%", "bounty contracts give +50% XP". Adds build-crafting to the daily — the most-played retention mode — so two players on the same seed have different runs and something to compare on the leaderboard.

**LOC estimate.** ~160 (card pool ~12, daily-only draft UI, apply hooks at run start, snapshot additive field for chosen card).

**Scores.** Impact 4 · Feasibility 4 · Risk 3 · Synergy 5

**Hook points.**
- Daily mode gate: `MODE_CONFIG.daily` line 1229 + `startGame()` daily block line 2256
- Deterministic draft: `mulberry32(hashString(getDayString() + '_cards'))` — same pattern as `generateQuests()` line 1455–1457
- Apply at run start: `resetGame()` line 2055 (set card-driven flags) — both `resetGame` and `resetWaveState` are reset sites (invariant)
- Golden Hoard: `hoardActive`/`hoardTimer`/`BOUNTY_INTERVAL`-style constants — card modifies interval (snapshot additive, line 2582–2585 pattern)
- Combo Bank capacity: `comboCharges` cap 5 (line 745) — card raises cap
- Bounty XP: `awardXP(b.reward.xp)` line 3325 — card multiplier
- Snapshot additive field: `buildSnapshotObject()` line 2493 — add `dailyCard` (additive, no `SNAPSHOT_VERSION` bump, line 2479)
- Daily leaderboard entry: line 3067 — store chosen card so leaderboard shows build diversity

**Why now / why not.** Ripe: the daily seed is deterministic-by-design but offers no per-player expression; cards make the shared seed a social-comparison surface (leaderboard shows card + score) without a backend. Risk: card modifiers touch many subsystems (hoard, combo, bounty) — must be gated daily-only and snapshotted so a resume preserves the card; balance so no card trivializes the daily challenge.

---

## 5. Per-Mode Mastery (reconsidered)

**Concept.** Each of the 8 modes (`MODE_CONFIG` line 1216) gets its own mastery XP track (separate from global `xp`/`level`) with 5 tiers; mastery XP scales with run score in that mode. Tier unlocks grant a mode-specific cosmetic + a mode-specific stat shown in the stats panel. `gauntletMasteryPoints` (line 830) is already a partial implementation — generalize it to all modes, turning mode breadth into per-mode depth and giving lapsed players a reason to revisit modes they've neglected.

**LOC estimate.** ~190 (per-mode mastery save map, earn-on-session-end, tier thresholds, stats-panel render, cosmetic grants).

**Scores.** Impact 3 · Feasibility 4 · Risk 2 · Synergy 4

**Hook points.**
- `MODE_CONFIG` line 1216 — 8 modes, each gets mastery thresholds
- `gauntletMasteryPoints` line 830 + increment line 5480 — existing pattern to generalize
- Session-end: `gameOver()` line 3076 + `endZenSession()` line 3158 (parallel hooks invariant) — award mode mastery XP from score
- Save: `saveManager.getJSON('snake_mode_mastery', {})` keyed by mode (mirrors `snake_mode_highs` line 1736)
- Cosmetic grant: `unlockedCosmetics.push` + `saveManager.setJSON('snake_unlocks', …)` pattern at line 6991–6992
- Display: `showStatsPanel()` line 7228 — per-mode mastery rows (already lists games per mode area, line 7253–7254 pattern)
- `SNAKE_SKINS` line 1108 / `DEATH_EFFECTS` line 1148 — add mode-mastery cosmetic IDs

**Why now / why not.** Ripe: gauntlet mastery proves the pattern works but it's isolated; generalizing it rewards cross-mode play and surfaces "you haven't touched Painter in 3 weeks." Risk: low (additive save, no loop changes); main cost is 8 × cosmetic art (can reuse existing palette variations). Could feel grindy if thresholds are too high — keep tiers modest.

---

## 6. Diary Milestones / Records Book (new)

**Concept.** A "Records" view mined from the diary (`snake_diary`, line 473) and `stats` (line 736) that surfaces personal bests per mode per constraint: highest combo, longest run, most food, best cascade-mutator score, etc., plus milestone badges ("First 200+ run", "10 runs over 150", "100 lifetime games"). The data is already collected — this makes long-term progress *visible*, turning the diary from a log into a dashboard and giving completionists a reason to chase the next badge.

**LOC estimate.** ~150 (records computation from diary + stats, badge definitions ~20, stats-panel or new panel render, milestone toast on earn).

**Scores.** Impact 3 · Feasibility 5 · Risk 1 · Synergy 4

**Hook points.**
- Diary source: `saveManager.getJSON('snake_diary', [])` line 473, 506 — 200-entry ring buffer already has mode/score/combo/length/seed/mutators (line 474–488)
- Stats source: `stats` line 736, `loadStats()` line 6902, `getDefaultStats()` line 6906
- Milestone pattern to mirror: `STAT_MILESTONES` line 1175 + `checkStatMilestones()` line 7063 (toast + cosmetic unlock at line 7072–7074)
- Earn hook: `gameOver()` line 3076 / `endZenSession()` line 3158 — call a new `checkDiaryMilestones()` alongside `checkStatMilestones()` at line 3105/3176
- Display: `showStatsPanel()` line 7228 (append a Records section) — no new panel needed, or a new panel with cross-hide contract (lines 557–559 etc.)
- `saveManager.setJSON('snake_records_badges', …)` for earned-badge persistence
- Recap card: `buildRecapData()` line 3194 — optionally surface a newly-earned record badge

**Why now / why not.** Ripe: the diary and stats already hold the data but nothing reads it for long-term goals; this is pure presentation + a lightweight badge engine with near-zero risk and high completionist appeal. Risk: only stale-data edge cases (diary capped at 200 — lifetime totals must come from `stats`, not diary). Pair with the existing recap card so badge earn feels immediate.

---

## 7. Streak Multiplier Ladder (new)

**Concept.** The daily streak (line 2271) currently only unlocks static cosmetics (`STREAK_UNLOCKS` line 1168). Extend it into a compounding economy: a streak-scaled XP multiplier (+1% per streak day, cap +30%) applied in `awardXP()` (line 6879), feeding directly into the overcharge loop (line 741/6885) and quest XP (line 1502). At 7/14/30-day thresholds, grant a "streak charge" — a one-time, bankable death insurance (survive one lethal hit) usable in any mode, stored as an additive snapshot field so a resume preserves it.

**LOC estimate.** ~130 (multiplier in `awardXP`, charge grant at streak thresholds, charge consume on death, snapshot field, menu-footer display).

**Scores.** Impact 4 · Feasibility 4 · Risk 3 · Synergy 5

**Hook points.**
- Streak source: `saveManager.getInt('snake_streak_count', 0)` line 2271, 2296
- XP award: `awardXP()` line 6879 — apply `1 + Math.min(0.30, streak * 0.01)` multiplier
- Overcharge: `xpOvercharge` line 741, written at line 6885 — multiplier amplifies overcharge gain
- Quest XP: `claimQuest()` → `awardXP(q.reward.xp)` line 1502 — inherits the multiplier automatically
- Threshold grant: extend `STREAK_UNLOCKS` loop at line 2297–2306 — grant a charge at 7/14/30 (new `snake_streak_charges` save key)
- Charge consume: death handling in `gameOver()` line 3076 — if charge held, cancel death, decrement, toast
- Snapshot additive: `buildSnapshotObject()` line 2493 — add `streakCharges` (additive, no version bump, line 2479)
- Display: streak block at line 4335–4340 + `updateMenuFooter()` line 2214 (show charges)

**Why now / why not.** Ripe: streak is the single biggest daily-return driver but its reward is static and front-loaded (cosmetics at 3/7/14/30 days then nothing); a compounding multiplier makes every consecutive day *more* valuable and the death-insurance charge gives a tangible mid-run reason to protect the streak. Risk: death insurance changes the feel of lethal modes (classic/walled) — must be opt-in (player chooses to spend, not automatic) and one-charge so it doesn't trivialize hazards/bombs.

---

## 8. Daily Seed Rival Ghost (new)

**Concept.** Before a daily run, replay your own best daily-seed run (from the replay system, `saveReplay()` line 444) as a translucent ghost snake you race against. Beat the ghost → bonus XP (line 6879) + a "ghost beaten" flag on the daily leaderboard entry (line 3067). Turns the personal top-5 leaderboard (line 3064) from a passive list into an active self-competition: the ghost is literally your prior best self on the same seed.

**LOC estimate.** ~170 (ghost replay playback engine reusing `replayEvents`, ghost render in `drawGame`, ghost-collision/finish detection, XP bonus + leaderboard flag, snapshot additive field for ghost state).

**Scores.** Impact 4 · Feasibility 3 · Risk 3 · Synergy 5

**Hook points.**
- Replay source: `saveReplay()` line 444, `loadReplays()` line 464 (`snake_replays_<mode>`), `replayEvents` array
- Daily leaderboard: `snake_daily_lb` line 3064 — find player's best entry for today's `getDayString()` (line 1354) to select the ghost
- Ghost render: `drawGame()` line 5756 — draw ghost snake at reduced alpha (must follow canvas save/restore discipline, invariant)
- Ghost update: `updateGame()` line 5959 — advance ghost one step per tick from replay events (read-only on game logic except a finish flag)
- Bonus on beat: `awardXP()` line 6879 in `gameOver()` line 3076 — if `ghostBeaten`, award bonus
- Leaderboard flag: write at line 3067 — add `ghostBeaten: true` to the entry
- Snapshot additive: `buildSnapshotObject()` line 2493 — add `ghostStep` (additive, no version bump) so a resume continues the ghost race
- Daily-only gate: `MODE_CONFIG.daily` line 1229 + `startGame()` line 2256 — ghost only seeds for daily mode

**Why now / why not.** Ripe: the replay system and daily leaderboard already exist but aren't connected; a ghost race is the single highest-impact way to make a personal leaderboard *active* without a backend (you always have your own best run to chase). Risk: replay playback must be deterministic and tick-locked to the game loop (`scheduleNextTick` line 246); a ghost that desyncs feels broken. Mitigate by storing replay as a direction-event stream (already the case, line 444–461) and replaying one event per tick. Medium complexity but compounds with diary seed-replay (line 536) — same "retry a seed" mental model extended to "race a seed."