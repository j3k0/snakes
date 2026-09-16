# v14 Ideation — Legibility & UX lens

NOTE (budget): this run hit its request ceiling before live Playwright probes could be executed (harness smoke test confirmed working, exit 0). All claims below are verified against `snake.html` source with line numbers on this tree (feat/v14-cycle, file = 9675 lines). Live-visual items are marked [INFERENCE] where only a screenshot could confirm.

## CRITICAL CORRECTION to the brief's backlog: v13 ALREADY shipped most of it
The brief's candidate list describes the PRE-v13 tree. This branch already contains v13's legibility pack. Re-verification results per backlog item:

1. **Rival AI ignores obstacles — CONFIRMED, still open.** `updateRival`'s chase branch (snake.html:3497-3546) filters candidates only against the 180° reversal and the rival's own body (`bodyHit`, 3525-3538); no obstacle/hazard predicate. AGENTS.md:126-127 documents the immunity as deliberate. ~3-line fix stands.
2. **Rival eating food emits no cue — CONFIRMED, still open.** The eat branch (3594-3632) contains zero `playSound`/`queueToast`/`spawnFloater` calls; the only side effect is board-shrink under the Pressure Cooker resonance (3628-3633). The food simply vanishes. (v13 added defeat cues — 'powerdown' + toast + floater at 3662-3666 — but not eat cues.)
3. **Three inconsistent occupancy sets — CONFIRMED.** `findFreeTile` (3265-3310) checks snake/obstacles/food/rivals/+extras opt-in; `findPortalTile` (2189-2209) checks a *different* set (incl. food2, extraFoods, hazards, but NOT rivals); `snapToFreeTile` (2216-2224) checks only snake/obstacles/active-rivals. Inconsistent-by-design per AGENTS.md:127.
4. **Rival immune to hazards — CONFIRMED.** `updateRival`'s move (3563-3576) wraps the new head but never tests `isHazardCollision` (4192-4197, player-only, called at 7544). Cue asymmetry stands.
5. **Mode-select text clipping — CORRECTED.** The help overlay's Game Modes list got v13's `fillTextClipped` (4866-4869, comment names 'painter'/'gauntlet' as the overflower). But the MODE-SELECT screen still raw-draws: `ctx.fillText(getModeDesc(mode), CANVAS_WIDTH / 2, y + 20)` at 13px centred (5247-5248) — no clip, no wrap. Half-fixed; the select screen is the visible half. [INFERENCE: pixel overhang ~56px on painter, per v13 measurement — same strings, same font size, same 440px canvas.]
6. **Persisted Best vs recap headline — CONFIRMED.** `updateScoreDisplay()` writes the RAW (pre-cascade) score into `modeHighScores` on every addScore during the run (2477-2481); `finalizeSession`'s post-cascade write (3749-3752) never wins because the cascade (mult < 1, 3779-3784) can only lower the score below what the run already persisted. Recap card shows the post-cascade score + arithmetic (4013). So the mode-select '(Best: N)' is pre-cascade while the recap says otherwise.
7. **Two rivals overlap + shared head colour — LARGELY FIXED by v13.** Colours now distinct: rival 0 `#B71C1C`, rival 1 `#AD1457` (3377). Spawn checks sibling occupancy (head via `rivalCombinedSnake`, 3388-3395; body explicitly, 3429-3430). Movement still lets two active rivals pass through each other (updateRival tests only self + food) — visible on a double_rival board as two snakes intersecting. [INFERENCE: visual.] Minor residual.
8. **gameOver() clears rivals before death frame — CONFIRMED still true** (3786, `rivals = []`), documented as accepted (AGENTS.md:128).

## New gaps found (not in the backlog)
- **N1 — the frozen rival is visually identical to a live one.** `hoardActive`/`rivalFreezeMs > 0` gate `updateRival` and the respawn loop (7231-7233, 7186) but `drawRival` (6110-6157) has NO freeze branch: the rival renders exactly as when moving while remaining fully lethal (collision test at 7652 is not freeze-gated). v13 deliberately refused a HUD `❄` (comment 6417-6420: a 'stopped' cue on a lethal object lies) — correct on the HUD, but the board itself still shows a motionless red snake the player must learn is *dangerous-but-coming*. Nothing distinguishes 'frozen' from 'about to stride'.
- **N2 — one rival death looks like every other.** `removeRival`'s only universal cue is a 20-particle burst in `r.color` (3652-3654). A self-crash and a player ram are identical on the board; the +50 floater (3654-3656) is the only differentiator and it spawns at the same spot.
- **N3 — the srSpeak pipeline drops all but one message.** `srSpeak` (1085-1093) throttles to 500ms and holds a SINGLE pending slot (`srQueue`, 1084, 1089): a second message inside the window OVERWRITES the first. During a busy tick (eat + rival spawn + toast), e.g. 'Ate Common…' replaces 'Rival incoming…' or vice versa. v13 added rival speech (3455, 3668) which makes the loss *likely*, not rare.
- **N4 — the food legend is an idle-only toast.** 'L' → `showFoodLegend()` is gated `gameState === 'idle'` (9305-9308) and just queues a 5000ms toast (8489-8491, derived from FOOD_TIERS — good). Mid-run a new player cannot consult the legend (and a 5s toast under fire is not a reference). The help overlay (H) has no food section beyond the help-table rows drawn at 11px (4841-4849).
- **N5 — toast coalescing can silently swallow distinct events.** `queueToast` coalesces on exact message equality (8501-8510) and evicts lowest-priority-then-oldest past the cap (~8512-8520). Two different system events with near-identical strings merge; a full queue of 'high' messages evicts 'normal' ones with no trace. Documented in v12, but it remains a legibility surface no one has audited end-to-end.
- **N6 — head-on cause teaches the rule only once, on death.** The teaching toast (7710-7713, one-shot `hasSeenRivalHeadOn`) is good, but the head-on/side distinction (`rivalHeadOn` 7695-7704) is invisible in the board state — the player sees two heads converge; the recap/cause string is the only channel. No live cue differentiates 'flank = I can ram it' from 'head-on = I die'.
- **N7 — CVD palettes do not cover the rival.** `CVD_PALETTES` (306-334) keys food types only; `drawRival` (6119-6141) hardcodes `#FF5555` head / `r.color` body with no palette or high-contrast treatment. Red-family rival on red-ish foods is the pre-v13 colour conflict for every CVD player; v13 recoloured the rival (#B71C1C/#AD1457) but still within the red family, and protanopia collapses it further toward dark. [INFERENCE on perception; the code fact is verified.]
- **N8 — `drawRivalHUD` under double_rival shows one line for two rivals** (max over rivals, 6424-6440). A live rival's length masks a second rival's countdown only when the windup is absent — v13's priority fix covers windup>live, but two materialising rivals collapse to one countdown.

## Theme proposal
**"Nothing on the board lies by omission"** — v14 closes the honesty gap between what the game's objects ARE (lethal/immune/competing) and what their cues SAY: frozen rivals, silent rival meals, hazards the rival ignores, a mode-select that clips its own pitch.

## Ideas (scored 1-5; impact / feasibility / risk-as-safety / synergy)

**L1. Rival obstacle-awareness in the 1-ply filter** (~6 LOC). Add an `obstacleHit(d)` filter alongside `bodyHit` in the chase branch (3539-3546, plus the perpendicular retry at 3549-3551). The rival still takes a blocked move when nothing is free (existing fallback), so it can never trap itself. Fixes 'walks through solid geometry' on obstacle boards. **4/5/5/4.** Risk: rival gets slower/more survivable on pattern-heavy boards; needs the trapped-fallback kept (AGENTS.md:126 warns re-introducing v4's trapped-rival rule as a *feature* — the fallback already is that rule in miniature).

**L2. Rival-eat cue: one floater + one reused sound** (~4 LOC). In the eat branch (3594), add `spawnFloater(newHead.x, newHead.y, 'rival', r.color, 12, 0.8)` and a short new case or reuse 'eat' pitched down. The player must be able to tell they lost a race (backlog #2). **4/5/5/3.** Risk: floater spam if the rival eats often — throttle to one per N ticks or reuse the existing cooldown patterns.

**L3. Frozen-rival visual state** (~10 LOC). In `drawRival`'s active branch (6139+), when `hoardActive || rivalFreezeMs > 0`, add a dashed grey-white outline or a light 'ice' overlay — information-shaped ('not moving NOW'), not a safety claim; keep the lethal semantics untouched and do NOT add HUD ❄ (v13's reasoning at 6418-6420 stands). **4/4/4/3.** Risk: the AGENTS.md line was written against a HUD cue; a board cue saying 'motionless' is factually true and does not imply 'safe' — word the legend carefully.

**L4. Mode-select description wrap** (~8 LOC). At 5247-5248 replace the raw centred `fillText` with the existing `fillTextClipped` or a two-line wrap under `ctx.measureText`. Half of this already shipped (help overlay, 4866-4869); finish the cutover. **3/5/5/2.** Risk: near-zero; layout-only, measured at draw time per the v12 rule.

**L5. Fix the Best-score disagreement** (~5 LOC). `updateScoreDisplay` should not persist a mid-run best that the cascade can undercut: either persist only at session ends (drop the 2478-2481 write; the NEW BEST toast can read from a session var), or persist `Math.max(modeHighScores, score)` at both ends with the cascade applied first. Aligns the select-screen '(Best: N)' with the recap. **4/4/4/2.** Risk: sessionModeHighStart toast logic (2482-2484) must keep firing on the in-run crossing — gate the toast on the live comparison, persist only at the end.

**L6. srSpeak overflow slot → 2-deep queue** (~6 LOC). Replace the single `srQueue` string (1084, 1089) with a small array drained by the existing 500ms interval (1094-1100). Prevents 'Rival incoming' being eaten by 'Ate X' in the same window. **3/5/5/4** (multiplies the value of everything v13 shipped for SR users).

**L7. In-game legend for rivals+entities, not just food** (~25 LOC). Extend the 'L' key to playing state with a compact overlay (or reuse `buildFoodLegendText` + a rival line: 'dashed ring = lethal, countdown = spawning'). Closes N4; one legend must cover hazards AND the rival (the shared dashed-ring vocabulary, 6147-6155). **3/4/4/4.** Risk: no new DOM panel allowed — must be canvas; keep it `H`-dismissable.

**L8. Distinct defeat presentation for self-crash vs ram** (~5 LOC). Self-crash currently pays the same particle burst (3652) with no floater; add a grey/desaturated particle colour or a small '⤫' floater for the uncredited case. Teaches 'my kill vs its accident' honestly. **2/5/4/2.** Risk: cosmetic-adjacent; only worth bundling.

**L9. Rival + CVD palettes** (~8 LOC). Add a `rival` entry to each `CVD_PALETTES` set and consume it in `drawRival` (6119-6141), mirroring `foodColor` (339-347). Distinct-from-food identity for colour-blind players. **3/4/4/3.** Risk: snapshot-safe (pure render); must verify all three palettes keep rival ≠ common-food contrast.

**L10. double_rival HUD line** (~10 LOC). When two rivals are alive/materialising, render the HUD line with a compact prefix per rival (`⚠1.4s ⚠2.1s` or `R:6 ⧗3.2s`). **2/3/3/2.** Risk: top HUD band is genuinely full (v13 §4 analysis); only do it if a measured overflow exists.

## Top 3 + build order
1. **L1 (rival steers around obstacles)** — the single largest honesty defect left on the board, cheap, and v13 already scoped the change. Do the obstacle filter with the existing perpendicular fallback; no hazard immunity change (AGENTS.md:127 stands).
2. **L2 (rival-eat cue)** — pairs with L1 in the same function; together they make the rival a *readable competitor* rather than a ghost. Build order: L2 first (pure cue, zero rules change), then L1 (behaviour), test both with the real-loop harness.
3. **L5 + L4 (the two bookkeeping lies)** — persisted-best disagreement and the select-screen clip are both 'nothing advertised is a lie' defects, both tiny, both verifiable with one screenshot + one localStorage probe each.

Deliberately deferred: L6/L7 are good but additive rather than corrective; L3 needs a design decision about what 'frozen' may imply; L8-L10 are polish. If the parent wants a fourth, take L6 — it protects the SR channel everything else depends on.

## Re-verification table (backlog → status)
| # | Brief claim | Verdict |
|---|---|---|
| 1 | AI ignores obstacles | CONFIRMED (3525-3546; AGENTS.md:126) |
| 2 | rival eat silent | CONFIRMED (3594-3632, zero cue calls) |
| 3 | 3 occupancy sets | CONFIRMED (3265 / 2189 / 2216) |
| 4 | rival hazard-immune | CONFIRMED (3563-3576 vs 4192) |
| 5 | mode-select clips | CORRECTED — help overlay fixed, select screen still raw (5247-5248) |
| 6 | Best vs recap disagree | CONFIRMED (2477-2481 vs 3749-3752; cascade mult <1 at 3779-3784) |
| 7 | rivals overlap / same colour | MOSTLY FIXED (3377 colours; sibling checks 3429-3430); pass-through remains |
| 8 | gameOver clears rivals | CONFIRMED (3786), documented accepted |