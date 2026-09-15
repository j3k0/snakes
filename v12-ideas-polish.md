# Snakes v12 — Ideas (FEEL, POLISH, ACCESSIBILITY & SYSTEM INTEGRITY)

Angle: game feel, visual/audio polish, accessibility, robustness, and **system integrity** — including finishing or removing systems the game already advertises. Every line number below was read in the current `snake.html` (8594 lines) during this pass; stale claims in `AGENTS.md` are called out explicitly where I found them.

Bias of this list: **the game is at ~34 features; the highest-value work left is not new features, it is making the advertised ones true and the communicated ones readable.** Six of the nine ideas are repair/completion, not addition.

---

## 1. Resonance Delivery Pass (implement or unadvertise the inert resonances)

**Concept:** `RESONANCES` (L881–890) advertises 8 mutator-pair synergies with flavour text describing real mechanical behaviour. Only 2 of 8 have any code, and one of those is a lie. `activeResonance.effect` is consumed at exactly one site (L6462–6473): `invertControls` only flashes a white overlay (it does **not** invert controls), and `feastFamine`'s body is an empty `if` with a comment. `intangiblePhase`, `doubleGold`, `rivalShrink`, `quantumToggle`, `rapidDoom`, `chaosCycle` are detected, named in the HUD (L6249–6255), and do nothing. This idea gives each effect a real, minimal implementation through the hook the existing mutator already uses — plus a hard rule: **any effect that cannot be made real gets its descriptor rewritten to match reality** (or the pair removed), so the HUD never names a synergy the game does not have.

Effect → hook mapping I verified:

| effect | desc claims | real hook that exists today |
|---|---|---|
| `invertControls` | "Direction inverts randomly every 10–15 ticks" | `setNextDirection(dx,dy)` L4052–4063 is the **single choke point** for keyboard (L8335), D-pad (synthetic keydown L8341), and swipe (L8499). A `controlsInverted` window flips `newDx` here. Mirror already flips at L8331–8333, so inversion must be applied in exactly one of the two places. |
| `intangiblePhase` | "Phase-shift ticks pause hunger; snake becomes intangible" | `skipSelfCollision` L6422–6425; hunger block L6427–6442 (`hungerTickCounter++`). Gate the increment on the resonance and force `skipSelfCollision = true`. |
| `doubleGold` | "All food 2x points and 2x XP" | `addScore` L1832–1863 (golden_food ×3 already at L1847–1849; the `totalMult` cap at L1860 is ×4) and `awardXP` L7386–7397 (`streakMult` slots in the same way). |
| `rivalShrink` | "Rivals also trigger board shrinking" | Rival eat is L3211–3218 in `updateRival` — **the file's own comment at L2556–2558 admits this call site "is NOT wired yet"**. `advanceShrinkZone()` L2559–2578 already exists for exactly this. |
| `feastFamine` | "4x food points but hunger ticks every 30" | hunger interval is the literal `50` at L6434; the score ×4 goes through `addScore`. |
| `quantumToggle` | "Every 15 ticks: mirror toggles or food reshuffles" | `gameTick % 15` in the mutator block L6417–6459; toggle the `controlsInverted` flag or call `shuffleFoodWeights()` (L6025). |
| `chaosCycle` | "Three effects cycle every 5 ticks" | same block; cycle an index over gravity/mirror/phase_shift (all three already implemented at L6417–6425). |
| `rapidDoom` | "Shrink accelerates on each hunger tick" | call `advanceShrinkZone()` from the hunger branch L6432–6440. |

**LOC estimate:** 180–230 in `snake.html` only. ~120 for the seven effect bodies + a shared `resonanceState` object; ~40 for `invertControls` touching `setNextDirection` (L4052) and reconciling with the mirror flip (L8331); ~30 for HUD/floaters so each effect announces itself when it fires; ~30 for descriptor corrections. Also: reset the new per-run resonance state in **both** `resetGame()` (L2135) and `resetWaveState()` (L5774), and add it to the snapshot build/restore (additive fields only — never bump `SNAPSHOT_VERSION`).

**Scores:** Impact 5 / Feasibility 3 / Risk 3 / Synergy 5

**Hook points (all read this pass):**
- `RESONANCES` L881–890; `activeResonance` L891; `detectResonance()` L896–900.
- Consumption site L6462–6473 (verified: `invertControls` → `flashOverlay` + `queueGameEffect('flash')` only; `feastFamine` → empty `if`).
- HUD name display L6249–6255 (`'✦ ' + activeResonance.name` at L6255) — this is what makes the inertness a *lie to the player* rather than a missing feature.
- `setNextDirection()` L4052–4063; keyboard mirror flip L8331–8333; swipe `setNextDirection` L8499.
- Mutator block L6417–6459; hunger L6427–6442; `advanceShrinkZone()` L2559–2578; its only current caller L6446–6453.
- `addScore()` L1832–1863; `awardXP()` L7386–7397; rival-eat site L3211–3218.
- `resetGame()` L2135; `resetWaveState()` L5774; snapshot build L2673/L2675 and restore L2840/L2842.
- Design intent reference: `DESIGN_v6.md` L103–130 (the `invertControls` desc there is *"Direction controls invert randomly… Screen flashes briefly"* — the flash was implemented, the inversion never was).

**Failure modes:**
- *Input inversion applied in the wrong place*: flipping in `setNextDirection` **and** leaving the mirror flip at L8331 double-inverts under `gravity~mirror` (mirror is a member of that very resonance), so the player sees no change and reports the bug as "still inert". Catch: in Chromium, force `activeMutators = ['gravity','mirror']`, drive the inverse window, press ArrowLeft, then read `await page.evaluate(() => dirQueue)` — assert the queued dx is `+TILE_SIZE` (un-mirrored) and not `-TILE_SIZE`.
- *Effect ordering breaks the death chain*: `intangiblePhase`/`rapidDoom` touch `skipSelfCollision` and a shrink death. If `advanceShrinkZone()` returns true mid-tick, the existing code calls `gameOver()` and `return`s (L6449–6452) — calling it from the hunger branch must preserve that early return or the tick continues with a dead snake. Catch: enter Apocalypse (`golden_food~hunger_clock~shrink_zone`), park the head on the shrink boundary, `driveTicks` until the zone passes it, assert `gameState === 'gameover'` and `collectErrors` is empty.
- *Score inflation*: `doubleGold` ×2 stacks on `golden_food` ×3 (already active in that pair) and the hoard ×2 / pigment ×3 — the existing global cap `Math.min(..., 4)` at L1860 must be respected or a `golden_food~chaos_seed` run during a Pigment Rush pays ~×12.
- *Hunger pause makes the run immortal*: `intangiblePhase` pausing hunger while also skipping self-collision removes both loss conditions. Requirement: hunger pauses only during phase-shift ticks (every 5th), which the design text already says. Catch: run Ethereal for 300 ticks and assert `snake.length` still decreases.
- Snapshot: new fields must be additive; verify by loading a pre-change snapshot into the changed build and asserting the run restores (strict version gate at `restoreFromSnapshot` L2843-area discards on version mismatch).

**Why now / why not:** The v12 context names this as open gap #1 and states the verdict outright — "a synergy that advertises behaviour it does not have is worse than no synergy." It is also the only open gap whose payoff compounds with three existing systems at once (mutators, draft screen, mutation tokens, HUD). Why not: it is the riskiest idea here — it edits the input path, the score path, and both death-relevant branches (hunger + shrink), and it is the kind of feature whose bugs hide behind green assertions (v11 shipped an unplayable game with 129 passing assertions). Recommend splitting: land the four non-input effects (`doubleGold`, `rivalShrink`, `rapidDoom`, `intangiblePhase`) first — they are pure state/score edits — then the three input-mutating ones (`invertControls`, `quantumToggle`, `chaosCycle`) as a second, separately verified pass. If a second pass is not affordable, ship the descriptor rewrite alone: it costs ~30 LOC and removes the lie.

---

## 2. Death Cause Restored to the Game-Over Screen

**Concept:** `lastDeathCause` is set at 16 sites across the death chain (L6438 "Starvation!", L6597 "Hit an obstacle!" / "You ran into yourself!", L6602 "Hit the wall!", L6655 "Caught in a hazard rift!", L6689 "You were caught by the rival!", L6853/L7009/L7090 "The board filled up!", L7156 "You shrunk to nothing!"), is spoken to screen readers (L3327), and is persisted to the diary (L514). But it is **only rendered on the gauntlet path (L6302) and the legacy fallback overlay (L6308)**. Since v8 D, every non-gauntlet death takes the `drawRecapCard()` branch at L6305, and `drawRecapCard` (L3467–3517) shows score, PB delta, XP, evolution tier and quest deltas — **never the cause**. The single most-asked question after a death ("what killed me?") is answered only in the two paths almost nobody sees. This idea adds a cause line to the recap card and, for the session-end paths where the answer is ambiguous, keeps the last *death* message distinct from the mid-run *save* messages that currently overwrite the same variable (`'🛡 Streak charge saved you!'` L6556, `'Vampire Brew saved you!'` L6580/L6648, `'Serpentine phased through an obstacle!'` L6591, `'Phoenix Brew resurrected!'` L6610/L6697).

**LOC estimate:** 35–45. ~12 for a `deathCause` field in `buildRecapData()` (L3436–3466; the `recapData` literal is L3457–3465) + one `ctx.fillText` in `drawRecapCard()` (L3467–3517) with the `cardH = 168` at L3471 reflowed — content currently ends at `cardY + 128` (3 quest rows, L3505–3511) with the retry prompt at L3515 (`cardY + cardH - 22`), so a new row needs +14–20px of card height and the retry prompt moved down. ~15 to split `lastDeathCause` into `lastSaveEvent` (the four "saved you" messages) and `lastDeathCause` (actual causes), so the diary and the recap stop reporting a rescue as a death. ~10 to route the gauntlet overlay (L6302) through the same field.

**Scores:** Impact 4 / Feasibility 5 / Risk 1 / Synergy 4

**Hook points (verified):**
- `let lastDeathCause = ''` L745; cleared only in `resetGame()` L2137 (`gameOver()` at L3312 deliberately does *not* clear it, since the gameover overlay needs it).
- All 16 assignment sites listed above (grepped `lastDeathCause`).
- Rendering gap: L6294–6311 — gauntlet L6301–6304 (uses it), recap L6305–6307 (**drops it**), fallback L6308–6310 (uses it).
- `buildRecapData()` L3436–3466 — `recapData` object literal at L3457–3465.
- `drawRecapCard()` L3467–3517 — `cardH = 168` L3471, quest rows L3505–3511, retry prompt L3515.
- `saveDiaryEntry` death-cause write: L514 (`deathCause: lastDeathCause || 'quit'`).
- Screen-reader parity already exists: L3327; `endZenSession()` L3393 speaks length only (L3425) — for Zen the cause should be "session ended", not a stale rescue message.

**Failure modes:**
- *Layout overflow*: the card is a fixed 168px box; adding a row without reflowing pushes the retry prompt off the bottom edge. Catch: `page.screenshot()` the canvas at gameover in Chromium with 3 quest deltas present, and read the pixel row at `cardY + cardH` to confirm the border is drawn and the prompt text is inside it.
- *Stale cause on Zen*: `endZenSession()` (L3393) never sets `lastDeathCause`, so the recap would show whatever rescue message happened last. Must set an explicit "session ended" cause there — this is the parallel `gameOver`/`endZenSession` hook contract documented in AGENTS.md.
- *Diary schema*: L514 writes `deathCause` into diary entries; renaming the variable must not change the *stored* diary schema, or old entries become unreadable and the diary panel (which renders them) shows blanks.
- Catch-all: `collectErrors` must stay empty through a full death → recap render.

**Why now / why not:** This is the highest return-per-LOC idea in the list: the data already exists, is already correct, is already saved, and is simply not shown on the screen where it matters. It is a v8 D regression (the recap card replaced the overlay that carried the message) so it is squarely "system integrity", not new scope. Why not: it is small. That is the point — pair it with idea 3 or 5 so one verification pass covers three repairs in the same screen.

---

## 3. Screen-Reader Announcement Channel (verbosity tiers + priority FIFO)

**Concept:** `srSpeak()` (L933–951) has three verified problems. (a) **It constantly spams**: `srSpeak('Ate ' + eatenType + '. Score ' + score)` fires on *every* food eat (L6870) — roughly once per second at base speed, faster with speed food — so a screen-reader player hears an unbroken stream of "Ate common. Score 40" over the top of every other announcement. (b) **It silently drops messages**: the queue is a single string (`srQueue`, L932) with last-write-wins, gated at 500ms (L937), drained by a 500ms `setInterval` (L942–949) — three announcements inside one second lose all but two. (c) **It under-covers the events that matter**: hoard start/end (L3692/L3701), bounty spawn/complete (L3554/L3569), pigment rush (L7128), portal spawn (L2009), hazard spawn (L3649), combo charge banked (L6377) and spend-mode cycling (L7957) all reach `queueToast` and *never* reach `srSpeak` — a screen-reader player gets no notification that a hazard just spawned or that they have a banked charge. This idea replaces the one-slot string with a small priority FIFO and introduces a persisted **verbosity setting** (`snake_sr_verbosity`: `essential` / `normal` / `verbose`, default `normal`) that decides which events speak at all.

Proposed mapping: `essential` = death, save/rescue, hazard spawn, level up; `normal` = + hoard/bounty/pigment/portal/evolution/combo milestones (drop per-eat score spam entirely); `verbose` = + per-eat and per-score-change (today's behaviour, opt-in).

**LOC estimate:** 90–120. ~45 to rewrite `srSpeak` (L933–951) into a priority queue with a per-priority minimum gap and coalescing of identical consecutive messages; ~15 for the `srVerbosity` module variable at the top of the file (pattern: `let highContrast = saveManager.get('snake_high_contrast', '') === '1'` L368) plus a `setSrVerbosity(v)` handler beside `setCalmMode` (L1725); ~15 for a Settings row reusing the `seg()` widget (L1662) and the `cvdSeg()` precedent (L1666); ~30 to route the ~10 missing events through a single `announce(msg, priority)` helper instead of bare `queueToast`.

**Scores:** Impact 4 / Feasibility 4 / Risk 3 / Synergy 4

**Hook points (verified):**
- `srSpeak()` L933–951, `lastSrSpeak`/`srQueue` L931–932 (the single-slot string is the drop bug), drain interval L942–949.
- `#srAnnounce` DOM node: L109 (`aria-live="polite" aria-atomic="true"`).
- The over-verbose call: L6870 (per-eat). Existing S/R call sites: L607, L1048, L1652, L1719, L2364, L2953, L3280, L3327, L3425, L6359 (combo), L6854, L7407 (level up), L7617, L7999, L8008, L8031, L8481.
- Toast-only events that need an announcement channel: L2009 (portal), L3554/L3569/L3591 (bounty), L3649 (hazard), L3692/L3701 (hoard), L6377 (combo charge), L7128 (pigment rush), L7957 (spend-mode cycle).
- Settings surface: `renderSettings()` L1658–1702; widget helpers `seg` L1662, `cvdSeg` L1666, `toggle` L1670, `slider` L1676; handler precedent `setCalmMode` L1725; `saveManager.get` precedent L368.

**Failure modes:**
- *Speech starvation inverted*: making `normal` too quiet means a player misses a hazard spawn. Mitigation: hazard spawn, death and rescue stay `essential` and bypass the verbosity gate. Catch: in Chromium, set `srVerbosity = 'essential'`, `driveTicks` a hazard spawn (past `HAZARD_GRACE_TICKS = 125`, L3604), then read `document.getElementById('srAnnounce').textContent` and assert it contains the hazard text.
- *Reintroducing the drop*: a FIFO that is capped too small (or a priority preempt that discards the loser) reproduces the original bug in a new disguise. Requirement: preemption may reorder, never discard — and `important` messages must never be evicted by an `informational` flood. Catch: fire death + level-up + achievement + quest-complete back-to-back (all reachable from one `gameOver()`), then assert all four appear in `srAnnounce` across the following 2s, in priority order.
- *Double-speaking*: routing an event through both a bare `srSpeak` and the new `announce()` speaks it twice. Mitigation: `announce()` must be the only writer; grep for remaining bare `srSpeak(` calls.
- *Calm Mode interaction*: Calm Mode is a visual/motion setting; the verbosity setting must be independent, or a visually-calm player loses their audio feed too. Do **not** couple them.

**Why now / why not:** Screen-reader support (L933) is the game's oldest accessibility feature and it was never audited against the ~20 events added in v7–v11 — the coverage gap is a direct artifact of four feature cycles landing without touching the announcement channel. The `seg()` widget vocabulary (L1662) and the `snake_*` settings pattern make the UI cost trivial. Why not: this is the idea most likely to be under-verified, because the failure is *audio* — a test can read `#srAnnounce.textContent`, but only a human can judge whether the result is usable. Recommend landing the priority FIFO + verbosity gate, then manually driving five events in Chromium and reading the DOM after each.

---

## 4. Help & Legend Truth Pass (config-derived, not hand-copied)

**Concept:** `drawHelpOverlay()` (L4146–4231) and `showFoodLegend()` (L7458–7465) both hand-copy facts that live in `FOOD_TIERS` (L1288–1301), and both are now wrong. Verified drift: the help overlay prints **"40%"** for Common (L4194) and **"15%"** for Bonus (L4198) while the real weights are **0.33** and **0.13** (L1291, L1295) — the v8 E hunter rebalance and the v10 B bomb rebalance moved them and never updated the text. The tier list omits **hunter** and **bomb** entirely (food added in v8/v10 that a player cannot identify from the help screen). The controls column (L4164–4175) documents 10 bindings; the keydown handler implements roughly 22 — it is missing `Q` quests (L8184), `B` brews (L8162), `J` diary (L8177), `S` settings (L7905), `X` cycle combo-bank mode (L7954), `Z` spend a charge (L7960), `K` copy challenge link (L8205), `G` ghost toggle (L8118), `R` resume saved run (L8068), `D` draft mode (L8060). It also never mentions the high-contrast mode's per-food letter labels (L5020: `hcLabels = {common:'C', …, hunter:'H', bomb:'X'}`), which is exactly the cue a player needs when colour alone is not readable. Fix: render the food table **from `FOOD_TIERS`** (`pts`, `xp`, `weight`, plus a new `icon`/`blurb` per tier) and render the controls column from a single `HELP_BINDINGS` table colocated with the keydown handler.

**LOC estimate:** 80–110. ~30 to replace the literal `foodInfo` array (L4193–4200) with a `FOOD_TIERS`-driven loop (weight → `Math.round(weight*100)+'%'`, so the rebalance can never desync again) plus `icon`/`blurb` fields on the 8 tier defs (L1289–1300); ~25 for a `HELP_BINDINGS` array and its second consumer; ~20 to add hunter/bomb/portal blurbs and the high-contrast letters note (the left column has room: `controlY = 34` L4156 and the 10-row controls table ends at L4156+20+9×18 ≈ 216, while the mode list only starts at `modeY` L4212); ~15 to make `showFoodLegend()` (L7458) consume the same derived string so the `L` legend and the help panel can never disagree.

**Scores:** Impact 4 / Feasibility 5 / Risk 1 / Synergy 3

**Hook points (verified):**
- `drawHelpOverlay()` L4146–4231: controls array L4164–4175, `foodInfo` literal L4193–4200 (weights at L4194 and L4198), `ctx.fillText(info, …)` L4208, `modeY` L4212, mode rows L4219–4224, footer L4230.
- `foodColor()` at L335 and the index-based colour call at L4205 (`foodColor(Object.keys(FOOD_TIERS)[i])`) — colours are index-derived while the *names* are hard-coded, so inserting any tier silently miscolours the whole table. This is a live trap, not a hypothetical.
- `FOOD_TIERS` L1288–1301 (weights `common .33`, `uncommon .25`, `rare .12`, `epic .03`, `bonus .13`, `speed .05`, `hunter .05`, `bomb .04`).
- `showFoodLegend()` L7458–7465 (its own hard-coded string).
- Real bindings to document: L7905 (S), L7954 (X), L7960 (Z), L8019 (P/Space), L8039 (M), L8060 (D), L8068 (R), L8118 (G), L8126 (Tab), L8135 (Escape), L8155 (C), L8162 (B), L8169 (F), L8177 (J), L8184 (Q), L8191 (H), L8205 (K), L8219 (L), L8331+ (arrows/WASD).
- High-contrast letters: `hcLabels` L5020, rendered L5027/L5029.
- `highContrast` flag L368; toggled by `toggleHighContrast()` L1723.

**Failure modes:**
- *Overflow*: every row below the controls table is offset from `modeY` (L4212 = `controlY + 20 + controls.length * 18 + 10`), so adding rows to `controls` pushes `modeY` down. The mode list runs one 16px row per mode from L4219–4224 and the footer sits at `CANVAS_HEIGHT - 10` (L4230). Adding ~12 control rows to an 18px rhythm will collide with the mode list. Catch: open help in Chromium at the smallest supported canvas size (`resizeCanvas` L2580 clamps to 300px wide) and `page.screenshot()` — check that no two text runs overlap and the footer is visible.
- *Index/colour desync*: if the derived table keeps the `Object.keys(FOOD_TIERS)[i]` colour lookup while rendering a filtered/sorted list, colours attach to the wrong rows. Derive colour from the same key being rendered.
- *Two sources still*: leaving `showFoodLegend()` hard-coded means the fix halves the drift rather than removing it. Both must read one builder.
- *Ink budget*: the overlay is already dense; a naive dump of 8 tiers × 4 numbers is unreadable. Two-column layout with the blurbs only for hunter/bomb/portal.

**Why now / why not:** This is the cheapest way to raise the "does the shipped game actually work" floor: the game currently documents the wrong probabilities to every player who presses `H`, and hides two of its nine food types. `FOOD_TIERS` was explicitly designated the "global authority for food distribution" — the help overlay is the last place that still copies it by hand. Why not: none, other than that it is unglamorous. It is also the safest idea in the list (pure text/layout, no game state), which makes it a good candidate to land while the riskier ideas are still under verification.

---

## 5. Cascade Penalty Visibility (show the ×0.5 the game already applies)

**Concept:** `getCascadeMultiplier()` (L902–905) halves the run's score whenever 2+ mutators are active, and `gameOver()` applies it at L3320–3323 — `if (activeMutators.length > 1) score = Math.floor(score * getCascadeMultiplier(activeMutators.length))` (L3320, with `var cascMult` at L3321 and the floor-multiply at L3322). Three verified problems. (a) **The player never sees it happen**: `addScore()` (L1832–1863) calls `updateScoreDisplay()` on every point earned with no cascade factor, so the HUD reads e.g. `1200` all run and the recap card says `600` — a silent 50% haircut at the exact moment the player is looking at the score. (b) **The design spec required a HUD badge and it was never built**: `DESIGN_v6.md` L184 says *"Score multiplier shown in the HUD during cascade runs: small ×0.25 badge near the score display."* (c) **The implemented curve diverges from the spec**: `DESIGN_v6.md` L117 defines `count === 1 ? 1.0 : count === 2 ? 0.5 : 0.25`, but L904 returns `0.5` for *any* count > 1, so a full 3-mutator cascade is penalised half as much as designed. This idea adds the live badge, a recap line that names the deduction, and reconciles the formula.

**LOC estimate:** 40–55. ~15 for a `drawCascadeBadge()` in the grid-depth HUD band (call it right after `drawComboBankHUD()`, which `drawGame` calls at L6218 between `drawXPBar()` at L6217 and `drawPrestigeBorder()` at L6219; same `ctx.save()`/`ctx.restore()` discipline as `drawComboBankHUD` L5507–5520); ~10 for `cascadeMult` in `buildRecapData()` (L3457–3465) + a `'Cascade ×0.5 (−250)'` line in `drawRecapCard()` (L3467–3517) sharing the layout reflow from idea 2; ~5 for the formula correction at L902–905; ~10 to show the factor on the draft screen beside the existing "C: Cascade ON (pick 3)" line (L6083–6086) so the penalty is disclosed *before* the run starts.

**Scores:** Impact 3 / Feasibility 5 / Risk 2 / Synergy 4

**Hook points (verified):**
- `getCascadeMultiplier()` L902–905 (returns `0.5` for all `count > 1`); single caller L3320–3323 inside `gameOver()` (L3312).
- `activeMutators` declared L909; truncated to 1 for gauntlet at L2475; set by draft at L7873; cascade gating at L7853–7890.
- HUD draw band inside `drawGame`: `drawMuteIndicator()` L6204, `drawXPBar()` L6217, `drawComboBankHUD()` L6218, `drawPrestigeBorder()` L6219 — a badge slots between L6218 and L6219.
- Draft-screen disclosure point: L6083–6086 (the "C: Cascade ON (pick 3)" line, drawn under the draft cards at L6060–6081).
- Recap: `buildRecapData()` L3436–3466, `drawRecapCard()` L3467–3517.
- Cascade unlock path: `checkMutatorUnlocks()` L5995–6009 (writes `snake_cascade_unlocked` at L6005 — *contra* the v12 context file, which says this key "is written nowhere"; it is written, and the C-key toggle at L7833–7835 does set `cascadeMode = true`, so `cascadeMode` is live, not dead. The context's open-gap #2 on this point is stale and should be corrected before anyone acts on it.)
- `endZenSession()` L3393–3429: does **not** apply the multiplier (it overwrites `score = snake.length` at L3397) — correct, and worth stating in the comment so the next reader does not "fix" the asymmetry.

**Failure modes:**
- *Double display*: showing the factor in the HUD without applying it in `addScore` means the HUD badge and the running score disagree in the other direction. Requirement: the badge displays the *factor*, the score stays unfactored, and the recap shows the arithmetic (`raw → final`). Label the badge explicitly `⚠ ×0.5 score` rather than a bare `×0.5`.
- *Formula change alters balance and existing records*: applying `0.25` at 3 mutators makes cascade runs strictly worse and invalidates the implicit scale of any comparison against existing `modeHighScores` / `snake_daily_lb` entries. This is a balance decision, not a bug fix — call it out and, if in doubt, leave the formula at `0.5` and only fix the disclosure.
- *Badge collides with existing HUD*: the region already hosts `drawComboBankHUD` (L5507, bottom-left `badgeY = CANVAS_HEIGHT - 28`), mute indicator (L6204), XP bar (L6217) and the prestige border (L6219). Catch: enable cascade with 5 banked combo charges and screenshot — the two badges must not overlap.
- *Gauntlet*: gauntlet truncates to 1 mutator (L2475) so the badge must not appear there; assert it is absent in a gauntlet run.

**Why now / why not:** It is a one-screen, fully-verified repair of a "the game did something to your score that you were never told about" defect, and it is the last unimplemented line item from the v6 design doc for a system that *is* shipped. Why not: it touches scoring semantics, so it needs an explicit call on whether to also correct the 3-mutator curve — an idea that ships only the badge is safe; one that ships the badge and the curve is a balance change that should be signed off.

---

## 6. Hazard Phase Telegraph and Countdown

**Concept:** Hazard Zones are lethal only during an on-phase (`isHazardCollision` L3657–3666 gates on `h.phase === 'on'`), and the on/off cycle is 15/10 ticks (L3602–3603, ~1.8s on / ~1.2s off). Three readability problems are verified in `drawHazards()` (L4802–4844). (a) **No advance warning**: a hazard snaps from off to lethal on one tick, so a player who steps into an off-phase rift gets zero information about when it fires. (b) **The pulse amplitude crosses the lethality threshold**: the on-phase alpha is `0.25 + 0.15 * Math.sin(renderTime / 150)` (L4807), i.e. it dips to `0.10`, while the off-phase alpha is a flat `0.08` (same line) — at the trough of the pulse a *lethal* hazard looks nearly identical to a *safe* one. (c) In Calm Mode the border ring is skipped entirely (`if (h.phase === 'on' && !calm)` L4817) and the pulse is replaced by a flat `0.35` — which is actually the *more* readable configuration, proving the point that the animated version's floor is too low. Fix: a 2-tick pre-ignition flash, a floor on the on-phase alpha so it can never approach the off-phase value, and a phase-countdown arc reusing the already-proven read-only bounty-ring vocabulary (L4476–4503).

**LOC estimate:** 55–70, all inside `drawHazards()` plus a small state read. ~20 for the pre-ignition cue (read `h.phaseTimer` and `h.phase` live — both already exist, L3600/L3614–3617 — no new state, no snapshot change); ~10 to raise the pulse floor (`0.25 + 0.15*sin` → `0.28 + 0.12*sin`, or clamp to `max(0.20, …)`); ~25 for the countdown arc on the hazard circle (bounty ring draws at absolute canvas coords L4476–4497 — hazards are already drawn in the play-area translate, so the arc must use `h.cx + TILE_SIZE/2`, matching the existing gradient centre at L4808); ~10 for Calm Mode parity (keep the arc — it is information, matching the F2 precedent that Calm Mode gates *oscillation* but never the countdown arc).

**Scores:** Impact 3 / Feasibility 5 / Risk 2 / Synergy 4

**Hook points (verified):**
- `drawHazards()` L4802–4844: alpha expression L4807, gradient L4808–4811, lethal border L4817–4823, the hazard loop's own `ctx.save()`/`ctx.restore()` pair L4806/L4824, and the v11 A adjacency ring block L4826–4843 with a second, independent pair L4833/L4840 — new drawing must stay inside the right one.
- Phase state, no new fields needed: `phaseTimer`/`phase` toggled in `tickHazards()` L3614–3617; constants `HAZARD_ON_TICKS = 15` L3602, `HAZARD_OFF_TICKS = 10` L3603, `HAZARD_MAX_LIFE = 42` L3600.
- Countdown-ring template: the bounty ring L4476–4503 (`frac = Math.max(0, activeBounty.ticksLeft / activeBounty.windowTicks)` L4479; urgency gating `!calmModeEffective()` L4481 — Calm Mode keeps the arc, drops the pulse).
- Lethality check to keep visual and logic in sync: `isHazardCollision()` L3657–3666.
- Calm Mode gate reference: `calmModeEffective()` L356, used at L4803.
- Draw order: `drawHazards` sits between `drawObstacles()` (L4774) and `drawFood()` (L4853) — hazards render *under* food and the snake, so any added cue must survive occlusion.

**Failure modes:**
- *Telegraph disagrees with lethality*: the visual cue is driven by `phaseTimer`, the kill check by `phase`; if the pre-ignition flash is derived from the wrong field, the game flashes "safe" while lethal. Catch: `driveTicks` in Chromium while sampling `page.evaluate(() => ({phase: hazards[0].phase, timer: hazards[0].phaseTimer}))` on every tick, and assert the flash window is exactly the 2 ticks before `phase` flips to `'on'`.
- *Per-frame allocation*: `drawHazards` already allocates a `createRadialGradient` per hazard per frame (L4808); adding an arc must not add a second gradient. Reuse `ctx.strokeStyle` with a flat colour like the bounty ring does.
- *Clutter*: 2 concurrent hazards × (fill + ring + arc + pre-flash) can read as noise, and `HAZARD_MAX_RADIUS = 2.5 * TILE_SIZE` (L3601) means the arc is large. Keep the countdown arc thin (2px) and low-alpha, and never draw it for off-phase hazards outside the warning window.
- *Snapshot/determinism*: the idea needs no new state, so it cannot break snapshot restore or seeded replay — verify by confirming no new fields were added to the hazard object build (L3645) or restore (L2858).

**Why now / why not:** Readability of the lethal mechanic is the fairness prerequisite for the entire Hazard family shipped in v10 and v11 (Hazard Zones, Hazard Chain, Hazard Melt) — three features now rest on a telegraph that is ambiguous at the pulse trough and silent at the moment of ignition. The countdown-ring vocabulary is already proven and already Calm-Mode-aware (L4476–4503), so this is assembly rather than invention. Why not: it is a pure-feel change with no correctness defect behind it — if a v12 budget has to cut something, this is the idea that can defer without breaking anything (unlike ideas 1–5, which fix things that are currently wrong).

---

## 7. Toast Pipeline Integrity (priority, coalescing, and stop bypassing the queue)

**Concept:** `queueToast()`/`processToastQueue()` (L7466–7488) serialize toasts by shifting one message and holding it for its full duration with no cap, no priority and no clearing. Three verified defects. (a) **Unbounded, uncleared backlog**: an achievement (4000ms, L7571), a level-up (3000ms, L7494), a quest complete (2800ms, L1529), a cosmetic unlock (3000–4000ms, L7507/L2424), a meta-achievement (4000ms) and a daily-complete (4000ms, L7602) can all queue from a single `gameOver()`; `toastQueue` is declared at L1081 and **nothing clears it** — `resetGame()` (L2135) does not touch it. Press Enter to retry and stale "Achievement unlocked" toasts keep appearing 15+ seconds into the new run, drawn over the board. (b) **A bypass corrupts the in-flight toast**: `showFoodLegend()` (L7458–7465) writes `toastEl.textContent` directly and hides the element on its own 5s timer, stomping whatever message the queue is currently showing — that message is then lost, because the queue only advances on its own timeout. Triggered by `L` (L8219–8223). (c) **No coalescing**: repeated identical messages (e.g. horde/freeze or quest-progress toasts firing on consecutive eats) each get a full duration. Fix: a priority field on `queueToast`, a length cap that drops the lowest-priority oldest entry, consecutive-duplicate coalescing, a `clearToasts()` call in `resetGame()`/`resetWaveState()`, and routing `showFoodLegend()` through the queue as a priority-0 message.

**LOC estimate:** 65–85 in `snake.html` only. ~30 to extend `queueToast(message, duration, priority)` and `processToastQueue()` (L7466–7488) with a cap + coalescing + priority ordering (an array sort or a two-lane array — no new dependencies); ~10 for `clearToasts()` (clear `toastQueue`, `toastActive = false`, hide `toastEl` L194) called from `resetGame()` L2135 and `resetWaveState()` L5774; ~15 to convert `showFoodLegend()` (L7458) into a queued priority-0 message via `queueToast`; ~20 to annotate the ~12 highest-frequency call sites with a priority argument (default `normal` preserves current behaviour for the rest).

**Scores:** Impact 3 / Feasibility 5 / Risk 1 / Synergy 3

**Hook points (verified):**
- `let toastQueue = []` L1081; `let toastActive = false` L1082; `const toastEl = document.getElementById('toast')` L194; `#toast` markup L101.
- `queueToast()` L7466–7470; `processToastQueue()` L7472–7488.
- The bypass: `showFoodLegend()` L7458–7465 (direct `toastEl.textContent` + own `setTimeout(…, 5000)`), reached from the `L` key L8219–8223.
- Burst sources at session end: L7571, L7602, L7494, L2424, L7507, L1529, L7585.
- Reset sites that must clear the queue: `resetGame()` L2135, `resetWaveState()` L5774 (the dual-reset contract).
- Precedent for a queue that *is* bounded, in the same file: `pushTransientRing` caps at 50 and `spawnParticles` clamps at `500 - particles.length` — the toast queue is the outlier with no cap at all.

**Failure modes:**
- *Dropping a message the player needs*: a length cap that evicts blindly can drop "New mutator unlocked" in favour of three cosmetic toasts. Requirement: evict lowest-priority-then-oldest, and never evict while the queue is under cap.
- *Coalescing hides a real repeat*: two genuinely distinct achievements with different text must not merge. Coalesce on exact message equality only, and update the displayed duration rather than concatenating.
- *Clearing on reset kills a legitimate gameover toast*: `clearToasts()` in `resetGame()` runs when the player presses Enter to retry — correct — but must not be reachable from `startGame()` alone, since the recap card and its toasts render in the gameover state *before* Enter. Sequence-test it.
- *Race with the legend*: after routing the legend through the queue, `L` during an in-flight toast must queue rather than overwrite. Catch: in Chromium, `page.evaluate(() => { queueToast('SENTINEL A', 4000); queueToast('SENTINEL B', 4000); showFoodLegend(); })`, then sample `document.getElementById('toast').textContent` every 250ms and assert the sequence contains `SENTINEL A`, then the legend, then `SENTINEL B` — no message lost.

**Why now / why not:** Toasts are the game's only non-canvas notification channel and they are now the delivery mechanism for ~12 systems (achievements, quests, cosmetics, brews, mutators, cascade, hazards, hoard, pigment rush, bounty, portal, bomb, boss unlocks). v11 alone added two more producers (L6377 combo charge, L7128 pigment rush) without touching the consumer. The fix is contained to one function pair and two reset sites. Why not: low drama, and the "unbounded backlog" repro needs a burst of session-end events to observe — budget one deliberately stacked gameover (achievement + level-up + quest) rather than hoping it happens.

---

## 8. Canvas State Leak Guard (self-healing + reported)

**Concept:** The single worst class of shipped bug in this codebase's history is canvas state corruption (the v11 context notes the suite was green while the game was unplayable, partly from "canvas transform corruption"). The structural cause is documented and still present: `drawGame()` opens a play-area `ctx.save()` + `translate` + `clip` (L6126–6130) and ~20 sub-functions then mutate `globalAlpha`, `shadowBlur`, `font`, `textAlign`, `lineWidth` and `globalCompositeOperation`. A missed `ctx.restore()` leaks properties; an *extra* `ctx.restore()` pops the play-area clip/translate and shifts every subsequent draw by `(-PLAY_MARGIN_LEFT, -PLAY_MARGIN_TOP)`. `ctx.restore()` on an empty stack is a silent no-op, so nothing throws and nothing logs. This idea makes the invariant checkable and self-healing: wrap the main context's `save`/`restore` with a depth counter, and at the end of `drawGame()` (and at the end of each `animateVisuals` frame) assert the depth returned to its entry value; if not, log once, emit a single toast, and force-restore to the entry depth so the frame cannot corrupt the next one.

I verified two live hazards that make this worth building rather than hypothetical:
1. `checkAchievements()` (L7522) declares `const ctx = { …sessionFoodEaten… }` at L7526 — **shadowing the canvas context** for the whole function, including the `ach.check(stats, ctx)` loop and every `showAchievementToast`/`awardXP` call inside it. Today nothing in that chain draws, so it works; the first person to add a `spawnParticles`-style canvas call or a `drawGame(1)` inside an achievement path gets `ctx.fillRect is not a function` at runtime, not at lint time.
2. `drawFloaters(ctx)` (L6095) takes a parameter named `ctx` and is invoked as `drawFloaters(ctx)` (L4445) — a second shadowing site with the same failure shape.

**LOC estimate:** 70–90. ~25 for the depth-counter wrapper around `ctx.save`/`ctx.restore` installed once where `ctx` is created (L190) and inert unless a flag is on; ~15 for the end-of-`drawGame` assertion + forced restore (place it immediately before the `drawPostFX()` call at L6314, and mirror it at the end of the `animateVisuals` draw block after the flash consumption at L4540–4544); ~15 for a one-shot console report + toast on the first violation per run (reuse `queueToast` L7466); ~20 for a settings/debug toggle or a `?canvascheck` URL flag (the codebase already parses a URL hash for challenge links, so a query/flag read at init is idiomatic); ~10 optional: rename the two shadowing `ctx` identifiers (L7526, L6095).

**Scores:** Impact 4 / Feasibility 4 / Risk 2 / Synergy 3

**Hook points (verified):**
- Context creation and base transform: `const canvas = …` L187, `const ctx = canvas.getContext('2d')` L190, `drawGame(t)` L6114, base `setTransform` L6120, play-area `save()`/`translate`/`clip` L6126–6130.
- The hot sub-functions whose balance the guard is really checking: `drawGrid` L4768, `drawObstacles` L4774, `drawHazards` L4802 (its own pair L4806/L4824 plus a second pair L4833/L4840), `drawFood` L4853, `drawPowerUpPickup` L5059, `drawExtraFood` L5105, `drawSnake` L5214 (sets/clears `shadowBlur` at L5303/L5334, `globalAlpha` at L5310/L5336), `drawTrails` L5428 (globalAlpha reset at L5440), `drawMuteIndicator` L5443, `drawXPBar` L5469, `drawComboBankHUD` L5507, `drawPrestigeBorder` L5524, `drawPostFX` L5546, `drawOverlay` L4575 (balanced — save L4576, idle early-return restore L4580, nested pair L4677/L4719, final restore L4720; the older "drawOverlay leaks" note is stale), `drawHelpOverlay` L4146, `drawFloaters` L6095.
- Draw order inside the play-area clip, for reference: `drawPaintGrid()` L6151, `drawObstacles()` L6152, `drawHazards()` L6153, `drawFood()` L6154, `drawPowerUpPickup()` L6155, `drawSnake(t)` L6156, `drawRival(t)` L6157, ghosts L6160/L6171, `drawTrails()` L6191, HUD L6204–6219, overlays, `drawPostFX()` L6314.
- rAF consumers with their own save/restore: banner L4384–4388, death fragments L4396–4413, particles L4426–4431, touch indicator L4450, bounty ring L4476–4503, flash overlay L4541–4543.
- Shadowing sites to fix or at least flag: L7526, L6095/L4445.
- `animateVisuals` frame boundary for the second assertion: `needsRedraw` L4357, draw call L4372, flash consumption L4540–4544.

**Failure modes:**
- *The guard itself breaks rendering*: patching `ctx.save`/`ctx.restore` changes identity for anything that stores a reference (e.g. `ctx.save.bind(ctx)`) or relies on `Function.prototype.toString`. Catch: `collectErrors` must stay empty across load + a full run with the flag on and off, and a `page.screenshot()` hash of a deterministic seeded run must be identical with the flag off.
- *False positives from legitimate asymmetry*: `drawGame` intentionally leaves *some* state at its base because it `setTransform`s absolutely on entry (L6120) — a naive "state must equal baseline" assertion flags those. Restrict the assertion to the depth counter plus the properties that are not re-established at the top of `drawGame`; do not assert `fillStyle`/`font`/`textAlign`.
- *Forced restore changes behaviour on the surface it is meant to protect*: auto-restoring to the entry depth will silently mask a leak instead of exposing it, so the report must fire every time, and the flag must be off by default in normal play if it turns out any existing leak is load-bearing for visuals.
- *Which loop to instrument*: only the main `ctx` (L190) — `gctx` (L167, the grid cache) is a different context inside `ensureGridCache()` (L154) and must not share the counter.
- Catch: deliberately introduce one `ctx.save()` without a restore inside `drawHazards()` on a scratch copy, confirm the guard reports it at the exact frame and that the following frame renders correctly — that is the regression proof that the guard detects the v11-class bug and heals it.

**Why now / why not:** The context file's own wording is the argument — "Assertions passing ≠ game working. Any new feature must be verified by driving the real game in Chromium and observing pixels/state." This idea converts that discipline into a runtime invariant, so the next feature that leaks canvas state reports itself instead of shipping. It is also the only idea here that hardens the engine rather than a feature, which matters at feature #35. Why not: it is a diagnostic, so its value is negative-work (bugs it prevents) rather than player-visible improvement; and it must not become a permanent per-frame tax — the depth counter is two integer ops per save/restore, which is nothing, but the flag-gating needs to be honest about when the check is on.

---

## 9. Tick Cadence Telemetry and Drift Normalization

**Concept:** Every timing constant in the game is expressed in ticks with a comment asserting a wall-clock equivalent — `HOARD_INTERVAL = 750 // ~90s at 120ms tick` (L3667), `HOARD_DURATION = 125 // ~15s at 120ms tick` (L3668), `HAZARD_INTERVAL = 500 // ~60s at 120ms tick` (L3599), `HAZARD_MAX_LIFE = 42 // ~5s` (L3600), `HAZARD_GRACE_TICKS = 125 // ~15s` (L3604), `HAZARD_ON_TICKS = 15 // ~1.8s` (L3602). All of those equalities are exactly true only if `scheduleNextTick()` (L274–284) fires every `tickInterval` ms on the nose. It uses a bare `setTimeout(cb, tickInterval)` chain, so the real cadence is `tickInterval + updateGame cost + timer/frame quantization`; the render load shares the same main thread (the rAF loop draws every frame while `gameState === 'playing'`, L4357/L4372), so a heavy frame delays the next tick. Result: real durations are systematically longer than documented, by an amount that varies with device and DPR — which is precisely the "calibrating for the wrong frame rate" bug the tick-count refactor was meant to end, reintroduced through the scheduler instead of through the constants. This idea (a) measures it — a rolling report of observed tick interval vs nominal, surfaced in the recap card and/or a debug flag — and (b) normalizes it by targeting a monotonic next-fire timestamp with a bounded catch-up (at most one catch-up tick per fire; reset the baseline if the gap exceeds ~4 intervals, which is the tab-throttle case where catch-up would otherwise burst).

**LOC estimate:** 50–70. ~25 to replace the `scheduleNextTick()` body (L274–284) with a `nextTickAt` baseline + clamped catch-up, keeping `stopGameLoop()` (L286–288) as the single exit path and `restartGameTimeout()` (L2631–2635) as the speed-change entry point (both are load-bearing; the `gameTimeout` non-null guard at L275 must stay or the chain can fork). ~10 for telemetry accumulators (observed-vs-nominal interval, drift %, worst frame) updated in `updateGame`. ~15 to surface it — the recap card is the natural home and already has an `xpEarned`/`evolutionTier` line block to extend (L3496–3501). ~10 for a debug flag to print the raw numbers.

**Scores:** Impact 2 / Feasibility 4 / Risk 3 / Synergy 3

**Hook points (verified):**
- `let gameTimeout = null` L272; `scheduleNextTick()` L274–284 (`setTimeout(…, tickInterval)` L283); `stopGameLoop()` L286–288; `restartGameTimeout()` L2631–2635.
- `tickInterval` declared L425 (default 120); recomputed by `getEffectiveSpeed()` L1806 and written at L2102/L2125/L2454/L3272/L3274/L5832/L5878/L6959/L6986/L7339/L7342 — a normalization change must not fight these (they assign the *nominal* interval; only the scheduler decides the actual fire time).
- Tick-counted constants for the honesty check: L3599–3604, L3667–3668.
- Places that already assume `tickInterval` *is* elapsed time and would arguably get **more** correct under normalization: `shrinkTimer -= tickInterval` L7153, `snapTimeSinceDecrease += tickInterval` L7167, `rivalFreezeMs -= tickInterval` L6341, `ticksPerShrink = Math.floor(30000 / getEffectiveSpeed())` L6447, `const tickDuration = tickInterval` L7181.
- Interpolation factor `t` (kept as-is): `const elapsed = timestamp - lastTickTime` L4349, `t` L4350, consumed at `drawGame(t)` L4372.
- Wall-clock timers that deliberately do **not** use the tick model — a normalization must not touch them: `lastEatTime` rebase L2853 and the combo window, `timeAttackEnd` L2885.

**Failure modes:**
- *Spiral of death*: if the main thread stalls (tab backgrounded, GC, a long draw), naive "catch up to now" fires N ticks back-to-back, and each tick's own work extends the stall. Requirement: hard cap of one catch-up per fire, plus a baseline reset when the gap exceeds ~4 intervals. Catch: in Chromium, `page.evaluate(() => { /* block the main thread 3s */ const t0 = Date.now(); while (Date.now() - t0 < 3000) {} })` while a run is active, then assert `gameTick` advanced by no more than ~2-3 and the game did not die instantly from a burst of moves.
- *Forked chains*: two concurrent `setTimeout` chains double the tick rate — this is exactly what the `if (gameTimeout) return` guard at L275 prevents. Any rewrite must preserve that guard and route every speed change through `restartGameTimeout()`.
- *Determinism/seed replay*: the game's determinism is per-tick (seeded PRNG advanced inside `updateGame`), so changing *when* ticks fire must not change *how many* fire for the same input sequence — otherwise Daily Seed determinism (v11 D) and ghost replays shift. Verify by running the same seeded daily run twice with the same `driveTicks` count and diffing food positions.
- *Snapshot fields*: `tickInterval` is snapshotted (build L2676, restore L2843) and restored as a nominal value — do not start serializing the scheduler baseline, or a resume would replay a stale wall clock.
- *Tests that assume wall-clock cadence*: `waitForTicks` polls until `gameTick` advances, so it tolerates normalization; but any suite asserting a duration in wall-clock ms (e.g. a hoard window) becomes **more** accurate, not less — check for suites that were calibrated against the drifting behaviour and would now fail.

**Why now / why not:** The whole tick-count refactor (v9→v11, and the `HOARD_INTERVAL` 5400→750 recalibration) was an investment in "the numbers in the comments are the numbers in the game". The scheduler is the last place that is not held to that standard, and it is the one that decides whether the investment pays out. It also makes Time Attack (`timeAttackEnd`, `Date.now()`-based) align with tick-counted content. Why not: honestly the weakest impact of the nine — the drift is probably a few percent, not a rewrite-the-constants problem, and the fix carries real risk to the loop that everything else runs on. **Recommend splitting: ship the telemetry first** (measure the actual drift over a 60-second run in Chromium and print observed-vs-nominal in the recap card, ~20 LOC, near-zero risk). If the measured drift is under ~3%, stop there and fix nothing; if it is large, the normalization earns its risk. Do not land the scheduler change on the assumption that drift is bad — measure it.

---

## Top 3 picks

**1. Resonance Delivery Pass (idea 1).** The only idea here that pays off against four systems at once (mutators, draft, tokens, HUD), and the only one the v12 context already flags as a defect rather than a candidate. It also has the clearest "correct" endpoint: after it, every name the HUD can display corresponds to behaviour that exists. It is simultaneously the riskiest idea in the list, which is why it is first with an explicit sequencing plan — the four non-input effects first (`doubleGold`, `rivalShrink`, `rapidDoom`, `intangiblePhase`, all pure state/score edits through hooks that already exist, notably the `advanceShrinkZone()` call site the file's own comment at L2556–2558 admits is unwired), then the three input-mutating ones. If the second half cannot be verified properly in Chromium, the descriptor rewrite (~30 LOC) removes the lie and costs nothing.

**2. Death Cause Restored to the Game-Over Screen (idea 2).** Best return per line in the entire list: ~40 LOC to surface data that already exists (`lastDeathCause`, 16 assignment sites), is already persisted (`saveDiaryEntry` L514), is already spoken (L3327), and was silently dropped from the default game-over screen by the v8 D recap card (the recap branch at L6305 never renders it, while the two rarely-seen branches at L6302/L6308 do). It is a verified regression rather than an enhancement, the risk is essentially layout-only, and it fixes the question every player asks first. Land it together with idea 5 so one layout reflow of `drawRecapCard` covers both.

**3. Screen-Reader Announcement Channel (idea 3).** The largest genuine accessibility hole: the announcement channel predates ~20 events added in v7–v11, it drops messages when three fire inside a second (one-slot `srQueue` L932 + 500ms gate L937), and it buries everything under a per-food-eat announcement (L6870) that fires about once per second. That combination means the game is not actually playable with a screen reader today, which is a harder failure than anything visual. It ranks third only because its verification is the least automatable — a test can assert what lands in `#srAnnounce` (L109), but usability needs a human listening — so it needs a manual Chromium pass on top of any suite.

*Runner-up:* **Help & Legend Truth Pass (idea 4)** — the lowest-risk idea in the list and the one that stops the shipped game from documenting wrong probabilities (Common printed as 40%, actually 0.33; L4194 vs L1291) and hiding two of its nine food types. If the v12 budget has room for four items, this is the fourth, because it can be verified entirely by screenshot and it cannot break gameplay.

**Corrections to the shared context file found during this pass** (worth folding back before anyone acts on them):
- Open gap #2 is stale: `snake_cascade_unlocked` **is** written (L6005) and `cascadeMode` **is** settable (L7833–7835); `getCascadeMultiplier` is not dead (called at L3321). The live issue with cascade is disclosure (idea 5), not dead code.
- `AGENTS.md`'s "`drawOverlay()` leaks text/alignment" note is stale: `drawOverlay` now wraps correctly (save L4576, idle early-return restore L4580, nested pair L4677/L4719, final restore L4720) — as does the help overlay's `gameState` guard (L8194), which AGENTS also lists as unguarded.
- `AGENTS.md`'s v9 Golden Hoard section still documents `HOARD_INTERVAL = 5400` / `HOARD_DURATION = 900`; the shipped values are `750` / `125` (L3667–3668, and these are the *post*-recalibration tick counts, so the docs moved backwards, not the code).
- The `playSound()` duplicate `combo_milestone` case documented in AGENTS.md is gone — a single case remains at L3798.
