# Snake Game — v8 Implementation Plan

Implements the v8 design plan (DESIGN_v8.md) with all review fixes from the two design reviews AND the implementation-plan review incorporated. Six features, order A → B → C → D → E → F, ~1,300 LOC.

## Review fixes incorporated (from DesignReview1 + DesignReview2)

1. **Feature A (blocker — REVISED after impl-plan review):** `drawGame()` is called directly from ~30 non-rAF sites (mode-select 6230/6239, pause nav 6446-6507/6611/6628-6630, gauntlet intermission 6052-6085, draft 6094-6173, restore 6305/6644, resetGame 1796, page-load). With a DPR-scaled backing store it MUST establish its own base transform or every non-gameplay screen renders at 1/DPR scale. BUT a naive `setTransform` at the top of `drawGame()` wipes the shake translate that `animateVisuals` applies via `save()`/`translate()` wrapping the `drawGame(t)` call (3333-3340). **Resolution: fold the shake into the base transform.** Add module-level `let shakeOffsetX = 0, shakeOffsetY = 0;` (visual state, written by rAF only). `drawGame()` opens with `ctx.setTransform(DPR, 0, 0, DPR, shakeOffsetX * DPR, shakeOffsetY * DPR)`. Remove the `animateVisuals` shake `save()`/`translate()`/`restore()` block (3333-3340) and instead set `shakeOffsetX/Y` from the shake intensity there (read-only of `shakeTimer`). Direct `drawGame(1)` calls get `shakeOffset=0` → clean base transform; the rAF path gets the shake folded in. `drawGame`'s existing play-area `save()`/`translate()`/`clip()` (4752) and its `restore()` (4823) compose on top of the base transform and are unaffected.
2. **Feature A:** `drawGrid()` blits the grid cache via `ctx.drawImage(gridCacheCanvas, 0, 0)` at intrinsic size — with a DPR-scaled cache the blit MUST become `ctx.drawImage(gridCacheCanvas, 0, 0, PLAY_WIDTH, PLAY_HEIGHT)`. Add this to the plan.
3. **Feature A:** CSS size is dynamic (managed by `resizeCanvas`, lines 2029-2048) — don't claim it's "fixed logical". The backing store = `CANVAS_WIDTH*dpr`; `resizeCanvas` keeps managing CSS. Audit scope for `canvas.width`-as-logical reads is **1 site** (grid cache), not ~5. Touch hit math is DPR-safe (uses `getBoundingClientRect` ratio) — no change.
4. **Feature B:** Gate the echo-brew `food2` spawn-pop path (lines 3858-3862, `f2Scale` easeOutBack) with `calmModeEffective()` too, not just `drawFood()`.
5. **Feature C (major):** Grid-visibility toggle must NOT skip `drawGrid()` (that removes the themed board background baked into the cache at lines 159-160). Split: always blit the bg fill, gate only the grid-line pass. Approach — keep `ensureGridCache` as-is but add a `snake_grid_visible`-gated branch in `drawGrid()`: blit a bg-only cache OR blit the full cache only when visible. Chosen: build the cache bg-only when `!gridVisible`, full when visible (cache key includes the flag).
6. **Feature C:** Cross-hide checklist — 7 edit sites: `showDiaryPanel` (443), `showBrewsPanel` (873), `showQuestsPanel` (1453), `showAchievementsPanel` (5889), `showCosmeticsPanel` (5915), `showStatsPanel` (6006), `closeAllPanels` (5880). `closeAllPanels` today hides only 4 panels (misses diary + brews) — also fix the pre-existing diary/brews gap there while adding `settingsPanel`. `S` key binding is safe but MUST be placed after the gauntlet-intermission block (6040) so it doesn't collide with intermission nav.
7. **Feature C LOC:** ~230-260, not ~190.
8. **Feature D (major):** `drawRecapCard()` REPLACES the existing `sessionSummary` banner (built in `gameOver` 2680-2686 and `endZenSession` 2752-2756, drawn 3403-3414 on `sessionSummaryTimer`). Delete the old banner construction + its draw block, or suppress it. Recap is the new session-summary surface.
9. **Feature D:** `xpBreakdown` does not exist — `awardXP(amount)` (5680) takes a single number with no source tag, called from ~6 sites. EITHER add a source-tag plumbing through `awardXP` (uncounted, pushes LOC) OR drop `xpBreakdown` from the recap and show only total `sessionXP`. **Decision: drop the per-source breakdown**; show total XP earned this run + a one-line note of the biggest contributor (length bonus vs food vs quest claims vs achievements vs daily) computed cheaply by snapshotting `sessionXP` deltas at the known award sites. Keep D at ~220 LOC. (Alternative considered: full source-tagging of `awardXP` — rejected, scope creep.)
10. **Feature D:** Gauntlet gameover is a real session end that goes through `gameOver()`. Recap must render a gauntlet-aware variant preserving "Wave X/5" framing and the `gauntletScore + score` total — OR explicitly keep the existing `drawOverlay('Run Over - Wave X/5', ...)` for gauntlet deaths and only use the recap card for non-gauntlet ends. **Decision: gauntlet death keeps the existing gauntlet overlay** (preserves wave context that the recap card doesn't model); recap card is non-gauntlet only. Update `recapData` build to be conditional.
11. **Feature D:** Zen mode score = `snake.length` (mode `scoreIs:'length'`, `endZenSession` sets `score = snake.length` at 2736) — `recapData.score` already uses the live `score`, so this is correct by construction; just don't compute PB-delta against a non-length metric. Zen has no modeHighScore PB in the same sense — for Zen show the length and skip the "NEW BEST" delta.
12. **Feature E (blocker):** `FOOD_TIERS` weights sum to exactly 1.00 (0.40+0.25+0.12+0.03+0.15+0.05) and `pickRandomFoodType` (1554) does a cumulative scan with NO normalization. Hunter at weight 0.05 appended last → band [1.00,1.05) never reached → hunter NEVER spawns. **Fix: rebalance existing weights to sum to 0.95** — `common 0.40→0.37, bonus 0.15→0.13, hunter 0.05`. Renormalize-on-Walled stays optional (leftover mass falls through to common).
13. **Feature E (major):** `chaos_seed` path — `shuffleFoodWeights()` (4658) is self-normalizing (divides by `total`), so hunter DOES enter chaos rotation including Walled. **Fix: exclude `hunter` from `shuffleFoodWeights()`'s key list when `MODE_CONFIG[gameMode].wrap === false`**, and document that under chaos_seed in non-Walled modes hunter gets a reshuffled weight like everything else.
14. **Feature E:** Wrap-aware flee rule MUST use `PLAY_WIDTH`/`PLAY_HEIGHT` (400), NOT `CANVAS_WIDTH` (440) — the proven magnet math (2517-2522, 5523-5528) uses play dims.
15. **Feature E (blocker-ish):** Hunter movement check must be `food.type === 'hunter'` (food instance has `{x,y,type,spawnTime}`), NOT `food.hunter` (the flag lives on the tier def, not the instance).
16. **Feature E:** Echo-brew `food2` (5451) copies `food.type` — eating a hunter spawns a hunter-typed `food2` that never moves and renders as a plain circle. **Fix: coerce at the spawn site — `type: food.type === 'hunter' ? 'common' : food.type`.** (Explicit guard, not "keep as-is".)
17. **Feature E:** Hunter movement RNG MUST use `seededRandom()` (mulberry32 under `activeSeed`), NOT `Math.random()`, for both the move-tiebreak and the per-move interval — otherwise seeded challenge runs diverge. Ghost replays are immune (rebuildGhost replays dir/grow only, never food). Daily is currently unseeded so unaffected today.
18. **Feature E:** The 2-3 tick move interval, if randomized per-move, is new game-logic state on the food instance that must be serialized. **Decision: use a fixed `HUNTER_MOVE_INTERVAL = 3` ticks** (no per-move randomization), so no extra food-snapshot field beyond the existing `type`. Document.
19. **Feature E (major):** Magnet power-up (5517-5549) moves `food` 1 tile/tick toward the head with no food-type check — a fleeing hunter (1 tile / 3 ticks) gets pulled in as a free lunch. **Fix: exclude hunter from the magnet pull — `if (magnetActive && food && food.type !== 'hunter')`** (or make the hunter flee every tick under magnet; chosen: exclude — keeps the "challenge" intact).
20. **Feature E:** Hunter rejection list must include `food2` and `powerUpPickup` tiles, not just snake/obstacle/rival — moving the hunter onto an echo food or pickup stacks entities on one tile and double-triggers eats. Add those to the valid-tile filter.
21. **Feature E:** 7th food type loosens `EXPLORER` (size≥6, "Eat all 6 food types", 5820) to 6-of-7 and `HAT_TRICK` (size≥4, 938) marginally; `showFoodLegend` toast (5750) lists exactly six. **Decision: bump `EXPLORER` threshold to 7 and update its description to "Eat all 7 food types"; update the food legend toast to list hunter.** HAT_TRICK stays at ≥4 (intent is "variety", not "all").
22. **Feature E:** `lastEatTime` reset on hunter eat is automatic (shared eat block sets it on every eat, 5317-5324) — drop the redundant note from the spec.
23. **Feature F:** Toast mechanism is `queueToast()` → `toastQueue` → `processToastQueue()` (5755-5777). The AGENTS.md "Toast Timer Sharing" section referencing `window.achToastTimer` is stale (no such symbol). Bounty toasts call `queueToast` — no new timer, no achToastTimer.
24. **Feature F (blocker-adjacent):** `restoreFromSnapshot` (2217) enforces a STRICT `data.v !== SNAPSHOT_VERSION` gate and discards mismatches. "Bump SNAPSHOT_VERSION + migrate" is self-contradictory — a bumped version discards v1 saves; they never reach field-level restore. **Fix: do NOT bump SNAPSHOT_VERSION**; add `activeBounty` and `bountyTickCounter` as additive fields restored with `data.activeBounty || null` / `data.bountyTickCounter || 0` (consistent with every other restored field at 2295-2304).
25. **Feature F (major):** Tick-based bounty windows swing ~5x under slowMo (2× tick interval) and dynamic speed (50-120ms). Either scale `windowTicks` by current tickInterval, or accept it. **Decision: accept and document** — bounty windows are tick-counted by design (matches the existing tick-based speed-boost counter at 5404); targets are picked relative to current run state so the perceived difficulty is roughly stable. Note the slowMo-farming edge in AGENTS.md; bounties never punish so farming is a non-issue.
26. **Feature F:** Combo bounty baselined against `sessionMaxCombo` (per-run-best, never decreases) is either auto-completable or uncompletable. **Decision: combo bounty measures the LIVE `comboCount` reaching target DURING the window**, not a delta against `sessionMaxCombo`. At spawn, if live combo is already ≥ target, the bounty auto-completes immediately (acceptable — it's a "you're on fire" reward, not a punishment). State this explicitly.

---

## Feature A: HiDPI/Retina Canvas Scaling (~80 LOC)

### Step 1 — DPR detection + backing store
- After canvas element init: `const DPR = Math.min(window.devicePixelRatio || 1, 3);`
- Set backing store: `canvasEl.width = CANVAS_WIDTH * DPR; canvasEl.height = CANVAS_HEIGHT * DPR;` — on init and inside the existing `resizeCanvas` resize/orientationchange handlers (CSS size stays managed by `resizeCanvas`; do not touch `style.width/height`).
- Add a `matchMedia('(resolution: Xdppx)')` change listener OR re-run DPR setup on resize (resize handler already fires on DPR change in most browsers) — verify; simplest: recompute DPR in `resizeCanvas`.

### Step 2 — Base transform in drawGame, shake folded in
- Add module-scope: `let shakeOffsetX = 0, shakeOffsetY = 0;` (visual state — written only in `animateVisuals`, read in `drawGame`). Reset to 0 in `resetGame()` is unnecessary (rAF overwrites each frame) but harmless to leave.
- At the TOP of `drawGame()` (before `ctx.imageSmoothingEnabled = false;` at 4745): `ctx.setTransform(DPR, 0, 0, DPR, shakeOffsetX * DPR, shakeOffsetY * DPR);` — absolute base transform carrying the shake. This makes `drawGame` self-contained for all ~30 direct call sites (shakeOffset is 0 outside rAF → no shake) AND carries the shake when called from rAF.
- In `animateVisuals()`, REPLACE the shake `save()`/`translate()`/`didShake`/`restore()` block (3333-3340) with: `if (shakeTimer > 0 && gameState !== 'paused') { const intensity = (shakeTimer/200)*5 * (shakeIntensity/100); if (calmModeEffective()) intensity = 0; shakeOffsetX = (Math.random()-0.5)*2*intensity; shakeOffsetY = (Math.random()-0.5)*2*intensity; } else { shakeOffsetX = 0; shakeOffsetY = 0; }` then call `drawGame(t)` directly (no save/translate/restore wrapper). `needsRedraw` gate (3329) unchanged.
- This composes Feature B's calm-mode shake gate and Feature C's shake-intensity slider into the single shake site — implement A first, B/C amend this line.

### Step 3 — Grid cache at DPR
- `ensureGridCache` (152-172): `gridCacheCanvas.width = PLAY_WIDTH * DPR; gridCacheCanvas.height = PLAY_HEIGHT * DPR;` and `gctx.setTransform(DPR,0,0,DPR,0,0)`.
- Cache key (150) gains `+ (DPR !== 1 ? '_dpr'+DPR : '')`.
- **Hard dependency:** the Step 3 cache-key DPR suffix is load-bearing for Step 1's DPR-recompute-on-resize — `resizeCanvas` (2029-2048) does NOT call `ensureGridCache`; the cache rebuilds only because the cache-key mismatch (155) triggers it on the next `drawGrid()`. If the suffix is omitted, a DPR change leaves the grid blitting at the old DPR. Do not ship A without the suffix.
- `drawGrid()` blit (3668): `ctx.drawImage(gridCacheCanvas, 0, 0, PLAY_WIDTH, PLAY_HEIGHT)` (explicit dest size so it paints at logical dims regardless of backing size).

### Step 4 — Audit
- Grep `canvas.width|canvas.height|\.width\b` usages: only `gridCacheCanvas` (154) is a logical-dim write — handled. Main canvas reads use `CANVAS_WIDTH`/`CANVAS_HEIGHT` constants. Touch math uses `getBoundingClientRect` ratio — safe.

### Verify
- Load in browser, screenshot on a retina display: grid lines and text crisp. Shake still fires on combo≥10 and on death. Grid cache repaints on theme change.

---

## Feature B: Calm Mode / Reduced Motion (~140 LOC)

### Step 1 — State + detection
- `const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');`
- `let calmMode = saveManager.get('snake_calm_mode', 'auto');` // 'auto' | 'on' | 'off'
- `function calmModeEffective() { return calmMode === 'on' || (calmMode === 'auto' && prefersReducedMotion.matches); }`
- `prefersReducedMotion.addEventListener('change', () => { visualDirty = true; });`

### Step 2 — Gate at choke points (logic unchanged, intensity only)
- **Shake**: already gated inside the folded-shake line written in Feature A Step 2 (`if (calmModeEffective()) intensity = 0;`). No separate edit — Feature A's shake line already includes the calm gate and the `shakeIntensity/100` slider factor. When implementing B, just confirm that line is present (it is written as part of A's Step 2 so B's shake work is already done — B only adds the remaining gates below).
- **Flash alpha**: the flash is consumed in `animateVisuals()` at lines 3457-3463 (NOT inside `drainVisualQueue()`, which only returns the effect object at 284-294). Clamp there: after `const visualFX = drainVisualQueue();` and before `ctx.globalAlpha = Math.max(0, visualFX.flash.alpha);` (3461), insert `if (calmModeEffective() && visualFX.flash) visualFX.flash.alpha = Math.min(visualFX.flash.alpha, 0.15);`.
- **Food bob/pop** (`drawFood()` switch): when calm, `spawnScale = 1` and bob offsets = 0 (gate the `easeOutBack` and idle-bob math).
- **Grid breathing** (4768-4774): when calm, alpha = 0 (skip the radial gradient).
- **Death fragments**: in `gameOver()` spawn loop (2696-2720): `if (calmModeEffective()) break after 60 fragments;`
- **Echo food2 pop** (3858-3862): gate `f2Scale` easeOutBack with `calmModeEffective()`.
- Timers still decay in all paths — only rendering intensity is gated (keeps replays/snapshots deterministic).

### Verify
- Toggle calm mode on: shake disappears, flashes dim, food stops bobbing, fragments cap at 60. Game still plays identically. Run `node test-bugfixes.mjs`.

---

## Feature C: Unified Settings Panel (~240 LOC)

### Step 1 — DOM
- `<div id="settingsPanel" class="dom-panel">` cloned structurally from `#questsPanel`. Toggles: mute, high-contrast, calm mode (auto/on/off segmented), grid visible. Sliders: shake intensity (0-100), particle density (0-100). Each row has a label + control + inline `onclick` calling a bare-name global (module-scope `function` → window prop).

### Step 2 — State + persistence
- `let shakeIntensity = saveManager.getInt('snake_shake_intensity', 100);` (0-100)
- `let particleDensity = saveManager.getInt('snake_particle_density', 100);` (0-100)
- `let gridVisible = saveManager.get('snake_grid_visible', '1') === '1';`
- Mute/high-contrast already persisted (`snake_muted`, `snake_high_contrast`); calm mode persisted in B.

### Step 3 — Cross-hide (7 sites, exact list)
Add `document.getElementById('settingsPanel').style.display = 'none';` to: `showDiaryPanel`, `showBrewsPanel`, `showQuestsPanel`, `showAchievementsPanel`, `showCosmeticsPanel`, `showStatsPanel`. Add `settingsPanel` + `diaryPanel` + `brewsPanel` to `closeAllPanels` (fixes pre-existing diary/brews gap too).
`showSettingsPanel()` hides all siblings (diary, brews, quests, achievements, cosmetics, stats).

### Step 4 — Live effects
- Shake magnitude scaling: already folded into Feature A Step 2's shake line (`* (shakeIntensity/100)`). No separate edit when implementing C — confirm the factor is present.
- Particle density: `spawnParticles(x, y, count, color)` is the real signature (3105) — the parameter is `count`, NOT `pCount`. After the existing `count = Math.min(count, 500 - particles.length)` clamp (3106), add `count = Math.round(count * particleDensity / 100);` (gating before the clamp would let the clamp re-cap it; gating after preserves the perf cap). Re-grep the signature before editing in case of drift.
- Grid visible: in `drawGrid()` — `ensureGridCache` cache key gains `gridVisible ? '_g' : '_bg'`; when `!gridVisible` the cache paints ONLY the `theme.bg` fill (skip the line-drawing loop). Always blit the cache (so the themed bg stays).

### Step 5 — Gear button + S key
- Footer gear ⚙ button calls `showSettingsPanel()`.
- `S` key: in the keydown handler, AFTER the gauntlet-intermission block (6040), add an idle/gameover guard: `if ((gameState==='idle'||gameState==='gameover') && (e.key==='s'||e.key==='S')) { showSettingsPanel(); return; }`.

### Verify
- Open settings from gear and from S. Toggle each: mute, high-contrast, calm, grid off (lines vanish, themed bg stays), shake 0 (no shake), particles 0 (no particles). All other panels close when settings opens and vice versa.

---

## Feature D: Game-Over Recap Card (~220 LOC)

### Step 1 — Replace sessionSummary (THREE touch sites, not two)
- Remove the `sessionSummary` construction in `gameOver()` (2680-2686) and `endZenSession()` (2752-2756).
- Remove the `sessionSummaryTimer` draw block in `animateVisuals()` (3399-3414).
- **Remove the `sessionSummaryTimer` decay at line 3297** (`if (sessionSummaryTimer > 0) sessionSummaryTimer = Math.max(0, sessionSummaryTimer - delta);`) — if this line is left while the `let sessionSummaryTimer` declaration is removed, it throws a ReferenceError at load (module-scope TDZ halt, per AGENTS.md Load-Time Bindings). Either delete both the declaration and line 3297, OR keep the declaration and delete 3297 + the draw block. Chosen: delete the declaration, line 3297, both constructions, and the draw block (full removal — `sessionSummary`/`sessionSummaryTimer` are fully superseded by `recapData`).
- Grep `sessionSummary` after removal to confirm zero remaining readers.

### Step 2 — recapData build (BOTH session-end paths)
- `let recapData = null;` reset in `resetGame()`.
- In `gameOver()` and `endZenSession()`, set `recapData = { score, modeBest, isNewBest, xpEarned: sessionXP, evolutionTier, questDeltas }` — guarded for gauntlet (see Step 3). **No `topXpSource`** — the impl-plan review showed `awardXP(amount)` (5680) takes a single number with no source tag and is called from ~6 sites (some firing multiple sub-calls like `checkAchievements`); bracket-granular `sessionXP` snapshotting would mislabel the biggest contributor. Show total `sessionXP` only.
- `modeBest`: read `modeHighScores[gameMode]`; `isNewBest = score > prevBest`.
- `questDeltas`: snapshot `dailyQuests`/`weeklyQuests` progress arrays in `startGame()` into `recapQuestBaseline`; at session end, diff per-quest `progress` to find the quests that moved; cap at 3.

### Step 3 — Gauntlet guard
- Gauntlet death goes through `gameOver()` but keeps the existing `drawOverlay('Run Over - Wave X/5', ...)` (4922-4929). So: only build `recapData` when `gameMode !== 'gauntlet'`. Gauntlet deaths render the existing overlay. Wave intermissions (not session ends) already don't touch this.

### Step 4 — drawRecapCard()
- New function called from the gameover branch of `drawOverlay()` (replacing the current minimal gameover text) when `recapData && gameMode !== 'gauntlet'`. Full `ctx.save()`/`ctx.restore()`.
- Layout: title, score + PB delta line ("+43 NEW BEST!" green / "−12 vs best" muted), XP earned line ("+120 XP"), evolution tier line ("Tier: Titan 🐉"), up to 3 quest progress lines, "Press Enter to retry".
- Zen: score = length; skip PB delta (no length PB tracked the same way) — show "Length: N" instead.

### Verify
- Die in Classic: recap card shows with correct PB delta and XP. Die in Zen: length shown, no PB. Die in Gauntlet: existing "Run Over - Wave X/5" overlay (unchanged). `resetGame()` clears `recapData` so next run's idle screen is clean.

---

## Feature E: Hunter Food / Fleeing Prey (~270 LOC)

### Step 1 — FOOD_TIERS entry + rebalance
- `hunter: { pts: 50, xp: 60, weight: 0.05, color: '#FFAA00', pCount: 18, sound: 'eat', glow: 10, hunter: true }`
- Rebalance to sum 0.95+0.05=1.00: `common 0.40→0.37`, `bonus 0.15→0.13`. (Other tiers unchanged.)
- `pickRandomFoodType()` (1554): no code change needed (cumulative scan now reaches hunter).

### Step 2 — Walled + chaos exclusion (two SEPARATE paths)
- **Non-chaos path** in `pickRandomFoodType()` (1554-1570): the function scans `FOOD_TIERS` cumulatively (the `for...in` after the chaos branch). Wrap the non-chaos cumulative scan in an `effectiveTiers` that excludes `hunter` when `MODE_CONFIG[gameMode].wrap === false`: `const effectiveTiers = MODE_CONFIG[gameMode].wrap === false ? Object.fromEntries(Object.entries(FOOD_TIERS).filter(([k]) => k !== 'hunter')) : FOOD_TIERS;` then scan `effectiveTiers` (NOT `FOOD_TIERS`) in the non-chaos branch.
- **Chaos path**: the chaos branch (1556-1561) scans `chaosCurrentWeights`, NOT `effectiveTiers` — so `effectiveTiers` does NOT cover chaos. Chaos is handled SOLELY by the `shuffleFoodWeights()` filter below. Do NOT attempt to scan `effectiveTiers` in the chaos branch (that would require rewriting it to build a fresh cumulative distribution).
- **Chaos filter**: in `shuffleFoodWeights()` (4658): `var keys = Object.keys(FOOD_TIERS).filter(function(k){ return !(MODE_CONFIG[gameMode].wrap === false && k === 'hunter'); });` so `chaosCurrentWeights` never contains `hunter` in Walled mode. (Self-normalizing function divides by total, so excluding a key is safe.)

### Step 3 — Echo-brew guard
- At the food2 spawn (5451): `type: food.type === 'hunter' ? 'common' : food.type`.

### Step 4 — Movement hook (game tick only)
- `const HUNTER_MOVE_INTERVAL = 3;` (fixed, no per-move random → no extra snapshot field).
- In `updateGame()`, place the hunter move AFTER the snake has moved this tick (so it flees the NEW head position, not the old one) but BEFORE the eat check (~5290). Concretely: locate the snake-move block (the head `snake[0]` update + `unshift`/`pop`), then place `if (food && food.type === 'hunter' && gameTick % HUNTER_MOVE_INTERVAL === 0) moveHunter();` after it and before the eat block. Re-grep the snake-move site at implementation time to pin the exact line.
- `moveHunter()`: compute 4 neighbors of `food` (wrap via `wrapPosition`); reject tiles occupied by snake body, obstacles, rival, `food2`, `powerUpPickup`; score each by wrap-aware distance from head using `PLAY_WIDTH`/`PLAY_HEIGHT` (`dx = dx > 0 ? dx - PLAY_WIDTH : dx + PLAY_WIDTH`); pick the farthest valid tile with a `seededRandom()` tiebreak; move `food` there. If no valid tile, stay.

### Step 5 — Magnet exclusion
- At the magnet pull (5517-5549): `if (magnetActive && food && food.type !== 'hunter') { ... }`.

### Step 6 — Render
- New case in `drawFood()` switch: draws at LOCAL ORIGIN per D1, a double-chevron "paw" shape in `#FFAA00` with `glow:10`; spawn pop + a faster "nervous" idle bob (faster sine). Letter label 'H' after restore.
- Food2 is never hunter (Step 3), so no food2 case needed.

### Step 7 — Type-count consumers (EXPLORER stays 6-of-7)
- `EXPLORER` achievement (5820, `sessionFoodTypes.size >= 6`, "Eat all 6 food types"): **keep threshold at 6, do NOT bump to 7.** Rationale: hunter is excluded in Walled mode (Step 2), where only 6 types can spawn — bumping to 7 makes EXPLORER permanently uncompletable in Walled (which has `achievementsEnabled:true` so `checkAchievements` runs). With 7 types existing and threshold 6, EXPLORER becomes "eat 6 of 7" in non-Walled and "eat all 6" in Walled — strictly easier everywhere, never broken. Update the description to "Eat 6 different food types in one game" (was "all 6" — now accurate as "6 different" given 7 exist). Accept the marginal loosening as intended (hunter is a bonus type).
- `showFoodLegend` toast (5750): add hunter row.
- `HAT_TRICK` (938, `size >= 4`): unchanged (variety, not all).

### Step 8 — Snapshot
- Food instance serialized as-is (`{x,y,type,spawnTime}`); `type:'hunter'` round-trips. No schema change. On restore, hunter resumes moving on the next `HUNTER_MOVE_INTERVAL` tick.

### Verify
- Hunter spawns (~5% of foods) in Classic, flees the head, big points on eat. In Walled: no hunters. Under chaos_seed in Classic: hunters reshuffle like other types. Echo-brew on a hunter: food2 is common. Magnet: hunter not pulled. Seeded challenge link: two players see identical hunter movement. `EXPLORER` still completes at 6 types (now 6-of-7 in non-Walled, all-6 in Walled). `node test-bugfixes.mjs` + `node test-evolution.mjs` (food eat path).

---

## Feature F: Bounty Rush / Timed Contracts (~300 LOC)

### Step 1 — Templates
- `const BOUNTY_TEMPLATES = [ ... 6 templates ... ]`, each `{ id, desc, target, reward:{pts?,xp?}, windowTicks, kind }` where `kind` ∈ `score|food|combo|length|speedFood`. Targets scale at spawn-time to the current run (e.g. score+50, food+3, combo reach 5, length+2, speedFood+1).

### Step 2 — State (game-logic, tick-written only)
- `let activeBounty = null;` `let bountyTickCounter = 0;` `const BOUNTY_INTERVAL = 400;`
- Reset both in `resetGame()` AND `resetWaveState()`.

### Step 3 — Spawn / tick / resolve (in updateGame)
- Each tick: if `activeBounty`, `activeBounty.ticksLeft--`; if `<= 0`, expire (soft `queueToast("Bounty expired")`, `activeBounty = null`).
- `bountyTickCounter++`; if `!activeBounty && bountyTickCounter >= BOUNTY_INTERVAL && gameState==='playing'`: pick a template (weighted, exclude kinds irrelevant to the mode — e.g. speedFood in modes without speed food), scale target to run state, set `activeBounty = { ...template, ticksLeft: template.windowTicks, baseline: { score, sessionFoodEaten, comboCount, snakeLen: snake.length, sessionSpeedFood } }`. Reset `bountyTickCounter = 0`.
- Resolve check each tick (O(1) deltas): `combo` kind → live `comboCount >= target` (auto-completes if already past at spawn — acceptable). Others → delta against baseline ≥ target. On success: `addScore(reward.pts)` / `awardXP(reward.xp)` (note `earnXP` gate), `queueGameEffect` milestone flash, `queueToast("Bounty complete! +"+(reward.pts||reward.xp))`, `activeBounty = null`.

### Step 4 — Countdown ring (rAF, read-only)
- In `animateVisuals()`, read-only: if `activeBounty`, draw a small arc near the HUD showing `activeBounty.ticksLeft / activeBounty.windowTicks` + the desc text. Read-only — never writes `activeBounty`.

### Step 5 — Snapshot (additive, NO version bump)
- `buildSnapshot`: add `activeBounty, bountyTickCounter`.
- `restoreFromSnapshot`: `activeBounty = data.activeBounty || null; bountyTickCounter = data.bountyTickCounter || 0;` — do NOT bump `SNAPSHOT_VERSION` (additive, v1 saves keep working; missing fields default safely).

### Verify
- Bounties spawn ~every 400 ticks, countdown ring ticks down, completing banks reward + toast, expiring shows a soft toast. Save mid-bounty, reload: bounty resumes. slowMo active: window still tick-counted (documented). `node test-bugfixes.mjs`.

---

## Final steps (per process)

7. Code review by a subagent.
8. Iterate on review issues.
9. Commit + push (to `feat/v8-cycle`; this branch carries the unmerged v7 snapshot-engine commits forward — they land with the push).
10. Ask the user for review (Multica comment, mention JC).
11. (Deferred to the next run, after JC approves) close the issue, schedule a new cycle, self-assign.

## AGENTS.md updates (cleanup phase, after smoke tests pass)
- Add sections for: HiDPI canvas scaling (DPR base transform folded with shake in `drawGame`, grid cache DPR + blit dest size, cache-key hard dependency), Calm Mode (gating choke points + "intensity only, logic unchanged" rule + echo food2 pop gate), Settings Panel (cross-hide contract now 7 sites + closeAllPanels diary/brews fix), Recap Card (replaces sessionSummary + sessionSummaryTimer decay at 3297; gauntlet keeps its overlay; Zen length; no topXpSource), Hunter Food (FOOD_TIERS rebalance to 0.95+0.05, Walled non-chaos effectiveTiers + chaos shuffleFoodWeights filter, echo food2 guard, magnet exclusion, seededRandom movement, fixed HUNTER_MOVE_INTERVAL=3, EXPLORER stays 6-of-7), Bounty Rush (tick windows + slowMo note, queueToast not achToastTimer, additive snapshot NO version bump, live-combo bounty auto-completes).
- Mark the "Toast Timer Sharing" section as superseded by the `queueToast` path (stale `achToastTimer` reference).