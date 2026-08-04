# AGENTS.md

## Game Loop (v6+)
- The game loop uses `setTimeout` chaining: `scheduleNextTick()` → `updateGame()` → `scheduleNextTick()` (no longer `setInterval`/`gameInterval`).
- `stopGameLoop()` clears `gameTimeout` to null and is the single exit path.
- `restartGameTimeout()` calls `stopGameLoop()` then `scheduleNextTick()` — use this for speed changes instead of manual clear+create.
- Speed changes still require clearing and re-scheduling the existing timeout chain.

## Dual Render Loops
- The game runs TWO concurrent loops: `setInterval` (50-120ms) for `updateGame()` → `drawGame()` (core game state), and `requestAnimationFrame` (60fps) for `animateVisuals()` (particles, score animation, screen effects)
- The rAF loop reads game state (particle array, score values, timer flags) but NEVER writes to game logic state — no write contention between loops
- `animateVisuals(timestamp)` receives the rAF timestamp automatically; compute delta via `Math.min(timestamp - lastFrameTime, 100)` and use it for all timer-based decays. Cap at 100ms to prevent jumps when resuming from tab-hidden state
- Hardcoded frame-rate assumptions (e.g., `16 / maxLife`) break on variable-refresh-rate displays — always use delta time

## Canvas Save/Restore Discipline
- Canvas state operations (`ctx.translate`, `ctx.shadowBlur`, `ctx.globalAlpha`, `ctx.scale`) mutate persistent context state
- Every `ctx.save()` must have a matching `ctx.restore()` on ALL code paths — an early return between them permanently corrupts the canvas transform
- For simple one-off state changes (e.g., shadowBlur on a single tile), prefer explicit reset (`ctx.shadowBlur = 0`) over save/restore

## Draw Order
- Canvas draw order is: grid → obstacles → food → snake → particles/trails → overlays (pause, gameover) → flash overlay
- Flash overlay must render LAST (on top of everything) to create the screen-covering effect
- Obstacles render behind food so eating near an obstacle is visually clear

## Food Generation
- `generateFood()` must check if the snake fills the board before entering the do-while loop, otherwise it infinite-loops
- When obstacles exist, the board-full guard must check `currentSnake.length + obstacles.length`, not just `currentSnake.length`
- The do-while condition must also reject obstacle tiles

## Food Tier System
- `FOOD_TIERS` is the global authority for food type distribution — per-mode `foodProbs` were removed
- All game modes use the same FOOD_TIERS weights for consistency
- Stat normalization: `common/uncommon/rare/epic` all map to `stats.normalFoodEaten` in the eat block's else branch

## State Management
- `gameState` (`idle`/`playing`/`paused`/`gameover`) is the single source of truth for all flow control; always check it before acting on input or updating

## Touch Controls
- Touch input uses two parallel paths:
  - **Virtual D-pad**: Dispatches `KeyboardEvent('keydown', {key})` to `document` — reuses the existing keydown handler and its input buffering, direction validation, and game-state guards
  - **Swipe detection**: Sets `nextDirection` directly (same buffer the keydown handler uses)
- D-pad `touchstart` listeners must use `{ passive: false }` and `e.preventDefault()` to suppress the subsequent `click` event (which would double-dispatch)
- Touch event listeners must be on the canvas element (not document) to avoid interfering with DOM panels

## Daily Challenge System
- Attempt is consumed on `startGame()`, not on page load or `gameOver()`
- If consumed on page load: tab-close mid-game loses the attempt
- If consumed on `gameOver()`: Zen mode (no death) lets player play indefinitely without consuming attempts
- Streak increments on consecutive daily game starts, tracked in `snake_streak_count`

## Toast Timer Sharing
- `window.achToastTimer` and `window.lvlToastTimer` are shared global timers used by achievements, level-ups, daily completion, and cosmetic unlocks
- When two toast systems fire in sequence (e.g., `checkAchievements()` + `checkDailyCompletion()` both from `gameOver()`), the second toast's `clearTimeout` on the shared timer suppresses the first toast's display

## Game Loop — Restart Helper
- `restartGameTimeout()` must call `stopGameLoop()` (which clears `gameTimeout` to null) before `scheduleNextTick()` — without the null-reset, a stale timeout handle lingers and calling `clearTimeout()` on it is a silent no-op. Do NOT write to `gameTimeout` directly; always use `stopGameLoop()`.

## Module Scope (no IIFE)
- Game code lives at plain `<script>` top-level scope (no IIFE wrapper). `function`/`var` declarations become `window` properties; top-level `let`/`const` live in the global lexical environment — accessible by bare name, but NOT as `window.*` properties.
- Tests use Playwright `page.evaluate(() => …)` and reference these by bare name (e.g. `snake`, `gameMode`, `triggerEvolutionIfReady`, `EVOLUTION_TIERS`). This works for both `let`/`const` lexical globals and `function`/`var` window globals.
- Consequence: any top-level `let`/`const` referenced before its declaration — or any typo'd identifier at module init — throws at load and halts the ENTIRE script (see "Load-Time Bindings"). Run `node test-bugfixes.mjs` ("No JS errors on load") as the first smoke check.

## Dual Render Loops — rAF Write Boundary
- The rAF loop's timer-decay section (lines ~1346-1352) writes `flashOverlay` from `levelUpFlash` and `snapLevelUpFlash` decay — this is a write to visual state inside the read-only rAF loop. Legitimate since it only writes the `flashOverlay` object (visual state), not game-logic state, but the pattern is fragile: any future code adding a `flashOverlay` write in this section creates a write-contention risk with the game-tick `flashOverlay` writes in `updateGame()`.
- `flashOverlay` is written by BOTH the game tick (food eat, combo milestone, line ~2229) AND the rAF loop (level-up decay). They coordinate implicitly through `levelUpFlash` timer overlap. If both write in the same frame, the rAF's level-up flash overwrites the game-tick's food-eat flash. Documented pattern, not a bug, but fragile.

## Canvas Save/Restore — Sub-Function Leaks
- `drawOverlay()` (lines ~1476-1571) sets `ctx.textAlign`, `ctx.textBaseline`, `ctx.font`, and `ctx.fillStyle` without save/restore. Its idle-state branch has an early return at line ~1542 that leaks these values into `animateVisuals()`. Any sub-function called from `drawGame()` or `animateVisuals()` that modifies text/alignment properties MUST wrap in save/restore.
- Common leak pattern: `ctx.textAlign = 'center'` and `ctx.textBaseline = 'middle'` in overlay/draw functions without save/restore. These persist into subsequent canvas text operations and silently misalign labels.
- `drawSnake()` mutates `ctx.globalAlpha`, `ctx.fillStyle`, and `ctx.strokeStyle` without save/restore. Safe because drawGame sets what it needs per frame, but fragile on exception paths.

## Draw Order — HUD Elements
- Background HUD (`drawMuteIndicator`, `drawXPBar`, `drawPrestigeBorder`) renders between grid and obstacles, at grid depth. This is intentional — they sit on the background behind game content. The core game-draw order (grid → obstacles → food → snake → trails → overlays → flash) defines only the game-content layering; HUD elements interleave at grid depth and do not follow the same sequence.

## Food Generation — Two-Source Rival Counting
- `generateFood(currentSnake)` reads rival snake state from TWO sources: the `currentSnake` parameter AND the global `rivalActive`/`rivalSnake` variables. The board-full guard `currentSnake.length + obstacles.length + rivalLength` double-counts rival segments when `currentSnake` already includes them (as in `updateRival()`'s `combinedSnake` call).
- Rule: if `currentSnake` already includes rival segments (caller concatenated them), `rivalLength` must not be added again. Preferred fix: remove `rivalLength` entirely and have ALL callers pass a complete `currentSnake` that includes rival segments when they should count toward board capacity.

## Speed Boost System
- Speed food changes are TEMPORARY and interact with PERMANENT speed modifiers (slowMo). Never store a snapshot of `tickInterval` and restore it later — intermediate state changes (slowMo activate/deactivate) make the snapshot stale. Always recompute from `getEffectiveSpeed()` at restoration time.
- Timed counters (`speedBoostCounter`) must decrement EVERY game tick, not only when the triggering event (food eat) occurs. Placing the decrement inside a conditional handler means the timer pauses when the event stops firing.
- Speed food sets `tickInterval = Math.max(MIN_SPEED, getEffectiveSpeed() - 30)` — the offset is always relative to `getEffectiveSpeed()`, which accounts for slowMo. This way slowMo activates and deactivations automatically adjust the boosted speed target.

## Magnet Power-Up — Wrap-Aware Distance
- The magnet pull uses Manhattan distance to move food toward the snake head. On a wrapping board, raw coordinate subtraction gives the WRONG direction when food is near a map edge (e.g., food at x=380, head at x=20: raw dx = -360, but shortest path is +20 across the wrap boundary).
- Always compute wrapped delta: if `|dx| > CANVAS_WIDTH/2`, the shortest path wraps. Use `dx = dx > 0 ? dx - CANVAS_WIDTH : dx + CANVAS_WIDTH` to get the true shortest-axis direction.

## Touch Controls — Android Chrome `click` Suppression
- `touchstart.preventDefault()` with `{ passive: false }` suppresses the synthetic `click` event on iOS Safari but NOT on Android Chrome. A `_touchDispatched` flag is required as a second defense: `touchstart` sets it to true, `click` checks it and returns early without dispatching.
- The `_touchDispatched` flag must be declared at module/script scope outside the `forEach` closure, because the click handler is a separate event callback that runs on a different event-loop turn. Inside the `forEach` callback, both the `touchstart` and `click` closures share the flag — this works because of closure capture, but the flag must be `let` at the top of the `querySelectorAll(...).forEach(...)` block.
- If the flag is declared once outside the `forEach`, it's a single global that ALL buttons share. This is intentional — only one touch interaction can be in flight at a time on a phone. If two buttons were touched simultaneously (extremely unlikely), the flag would suppress the second button's click, which is the correct behavior.

## State Management — Specific Bypasses
- `helpOverlayVisible` toggle (H key, lines ~2878-2888) has no `gameState` guard. During gameplay, it fills the canvas with `rgba(0,0,0,0.85)` while the game continues running — the player may die without seeing it. At gameover, it obscures the game-over screen.
- `Escape` key handler checks `gameState === 'gameover'` before `helpOverlayVisible`, so pressing Escape during an open help overlay at gameover transitions to idle instead of closing help first.

## Progression Systems — Zen Mode Gap
- `endZenSession()` calls `finalizeSession(true)` but does NOT call `checkAchievements()` or `checkDailyCompletion()`, unlike `gameOver()`. Zen-mode achievements that depend on session-end state (`CENTURY`, `ZEN_MASTER`, etc.) only trigger on food-eat ticks via `checkAchievements(score)` at line ~2276. If the player's last food-eat didn't trigger the condition, quitting Zen mode won't check it.
- `gameOver()` and `endZenSession()` are parallel session-end paths. Any new feature that adds session-end logic must be added to BOTH functions.

## Code Clarity — playSound() Switch Case
- `playSound()` can have duplicate `case` labels without a JavaScript error — the second case is simply unreachable dead code. The switch at lines ~1109-1206 had two `case 'combo_milestone':` blocks. The first (ascending C5→E5 arpeggio) always fires; the second (sustained 660Hz tone) never does. This makes the code confusing: a reader at line 1197 assumes that case is active.
- When adding new sounds to `playSound()`, grep for the case label first to check for duplicates.

## Walled Mode
- `wrapPosition()` checks `MODE_CONFIG[gameMode].wrap`. When `wrap: false`, it returns the raw (unmodified) position. The wall death check in `updateGame()` detects out-of-bounds positions.
- All modes with `wrap: true` (Classic, Time Attack, Zen, Daily, Snap) continue to wrap via the existing modulo arithmetic.
- Obstacles are disabled in Walled mode — walls are the obstacle.
- Rival snake disabled in Walled mode.
- Power-ups disabled in Walled mode (magnet wrapping logic conflicts with non-wrapping board).

## First-Time Onboarding
- `welcomeOverlay` flag initialized from `saveManager.get('snake_has_played', '')` at page load
- `drawWelcomeOverlay()` renders a 3-panel overlay with controls (keyboard vs touch-adapted), food info, and progression info
- Overlay dismissed on any keypress (idle state): sets `saveManager.set('snake_has_played', '1')`, then falls through for normal key processing (Enter starts game immediately on first press)
- On mobile: touch/click dismisses WITHOUT dispatching Enter (prevents accidental game start)
- `drawWelcomeOverlay()` MUST use `ctx.save()`/`ctx.restore()` for all text rendering per canvas save/restore discipline
- The welcome overlay only renders when `gameState === 'idle'` and replaces the normal idle screen entirely

## Pause Menu
- When `gameState === 'paused'`, the overlay shows three selectable options: Resume, Restart, Quit to Menu
- `pauseMenuSelection` tracks the currently highlighted option (0-2), reset when entering pause state
- ArrowUp/ArrowDown navigate; Enter selects; Escape cancels confirmation or resumes
- P/Space still toggles pause regardless of menu selection
- Confirmation sub-prompt (`pauseConfirmPending`/`pauseConfirmAction`) for Restart and Quit — shows Yes/No buttons
- Restart and Quit from pause do NOT count as deaths (no `totalDeaths++`, no `finalizeSession()` call)
- Touch hit regions on canvas for each menu item; also works during confirmation sub-prompt
- `pauseMenuSelection`, `pauseConfirmPending`, `pauseConfirmAction` must be reset in both `resetGame()` AND on entering paused state
- All pause menu text rendering must be wrapped in `ctx.save()`/`ctx.restore()`

## Obstacle Patterns & Progressive Spawning
- `OBSTACLE_PATTERNS` defines 5 pattern types (single, h_left, h_right, v_down, v_up) with weighted selection
- `generateObstacles()` places patterns as tile groups; if placement fails, falls back to single tiles
- `findFreeTile(headX, headY)` checks 3-tile Manhattan distance from snake head, snake body, obstacles, food, and rival
- Progressive obstacles spawn every `OBSTACLE_SPAWN_INTERVAL` (200) game ticks in Classic and Time Attack modes (excluded in zen, walled, daily)
- New obstacles have flash animation (1-second orange fade in `drawObstacles()`) and a toast ("⚠ New obstacles!")
- `MAX_OBSTACLE_PERCENT` (0.20) caps total obstacle count to prevent board filling
- `newObstacleFlash` array and `newObstacleToastTimer` are visual state (rAF-decayed), not game-logic state — follows rAF write boundary rules


## Evolution System (v7)
- `EVOLUTION_TIERS` (4 tiers: Swift@10, Serpentine@25, Titan@50, Apex@100) grants a permanent per-run bonus at each length milestone. Bonuses are CUMULATIVE — reaching Titan still keeps Swift's speed bonus, etc. The visible body morph reflects only the highest tier reached.
- Per-run state: `evolutionTier` (-1 = none) and `obstaclePassUsed` (Serpentine). Reset in BOTH `resetGame()` AND `resetWaveState()` (gauntlet waves reset the snake, so evolution must reset per wave too).
- Evolution is triggered by `triggerEvolutionIfReady()`, called after EVERY snake growth site — both the main food-eat block AND the Echo-brew `food2` block. The helper loops (`while`) so a multi-tier jump (e.g. food2 stacking) is handled, though normal food grows by 1.
- **Death interception order is explicit:** Shield → Vampire/Phoenix brew → Serpentine obstacle pass → actual death. The Serpentine branch sits inside `checkPlayerDeath()`'s `checkCollision()` true-branch, after the Vampire save and before the death return. `checkCollision()` MERGES obstacle + self collisions, so the Serpentine branch gates on `isObstacleCollision(wrappedHead)` (a separate obstacle-only helper) — otherwise it would wrongly save self-collisions. The pass is obstacle-only and one-use per run.
- **Swift speed direction gotcha:** `getEffectiveSpeed()` returns the tick interval in MS (smaller = faster; confirmed by slowMo doing `*2` = slower and speed-food doing `-30` = faster). A "+5% speed" bonus therefore DIVIDES the interval by `(1+speedBonus)`. The v7 impl plan's `speed *= (1+bonus)` was inverted (would slow the snake). The bonus is recomputed live every call, so it needs no snapshot/restore across slowMo changes (same pattern as the Speed Boost System).
- **Titan food proximity only matters with Rampage:** `generateFood()` reduces the active `minFoodSpawnDist` cap by `EVOLUTION_TIERS[2].foodProximity`. When Rampage isn't equipped, `minFoodSpawnDist` is `null` and Titan has no spawn effect by design (the design scopes it as "stacks with Rampage"). Note: `generateFood()`'s `MAX_ITERATIONS` fallback (linear free-tile scan) bypasses the proximity cap, so on a near-full board Titan's constraint can be violated — only test the cap with fractions, not maxima.
- **Apex combo floor:** on a broken eat window the combo resets to `EVOLUTION_TIERS[3].minCombo` (2) instead of 0. The next eat then climbs 2→3 and re-fires the x3 milestone naturally. `2` is deliberately NOT in `COMBO_MILESTONES` (`[3,5,7,10,15,20,30,50]`), so the floor itself never spuriously fires a milestone.
- **drawSnake morph discipline:** the evolution glow (`ctx.shadowBlur`/`shadowColor`) is set per segment right before the fill and reset to 0 immediately after, so the high-contrast outline and `drawEyes` stay crisp — follow the canvas save/restore rule. `segSize`/`segPad` encode the per-tier body cell (Swift = TILE_SIZE-2 padded; Titan/Apex = TILE_SIZE filling the cell); the Serpentine sine-wave bob (`wavyY`) applies to body segments only (index > 0), never the head.

## Quest Board (v7 Feature C)
- 3 daily + 3 weekly missions, deterministic per day/ISO-week seed (`generateQuests(period)` → `mulberry32(hashString(getDayString()|getISOWeekString() + '_quests_' + period))`). Same seed string → same 3 quests, picked as distinct templateIds from the period's pool. Run `node test-quests.mjs` to verify determinism.
- `QUEST_TEMPLATES` (20) is the config authority. Each template has `daily`/`weekly` target pools (empty pool = not offered that period), a `progressKey`, and `xpDaily`/`xpWeekly`. `QUEST_PROGRESS_MAP[progressKey](quest)` reads the live value; param-driven keys (`modeScore`, `modePlayed`) inspect `quest.param`. **Every template's progressKey MUST have a map reader** — the test suite enforces this invariant.
- **Progress is per-run-best, NOT cumulative across runs** (mirrors the existing daily-challenge semantics): `checkQuestProgress()` does `progress = Math.max(progress, current)`. So "Score 200+" completes when ANY single run that period hit 200; it does not sum partial runs. Run-based metrics (score, snakeLength, maxCombo, timeAlive, foodEaten, speedFood, bonusFood) track the best run; boolean metrics (modePlayed, mutatorUsed, brewUsed) latch once true.
- **`checkQuestProgress()` is a parallel session-end hook (AGENTS.md contract):** it MUST be called from BOTH `gameOver()` AND `endZenSession()` (per the Zen-Mode-Gap rule — both are parallel session-end paths). It is ALSO called from the food-eat block so length/food/combo movement updates live. `timeAlive`-based quests only resolve at session end because `sessionTimeAlive` is finalized in `finalizeSession()`, not mid-run.
- **`awardXP()` gates on `MODE_CONFIG[gameMode].earnXP`:** all modes currently set `earnXP:true`, so quest claims grant XP regardless of the idle-selected mode. If a future mode sets `earnXP:false`, quest XP claims from that mode's idle state would silently no-op — claims should bypass the mode check or guard against it.
- **Atomic claim:** `claimQuest(period, index)` sets `claimed`, calls `awardXP`, and `persistQuests()` synchronously (no await between them) — a crash mid-claim cannot leave a half-state. Second claim is a guarded no-op (`if (!q || !q.completed || q.claimed) return`), so it is idempotent. The claim button's inline `onclick` calls a bare-name global (`claimQuest`), which works because `function` declarations at top-level scope become `window` properties (see Module Scope).
- **Midnight boundary:** staleness is checked ONLY at page load (`syncQuestState()` after `syncDailyState()`) and on idle-screen render (`syncQuestState()` inside `updateMenuFooter()`), NOT during gameplay — a midnight rollover mid-run keeps the prior day's quests active until the run ends. A stale stored date triggers regeneration, which RESETS `completed`/`claimed`/`progress` for the new period (regenerated quests are identical to the old ones because generation depends only on today's date — the reset of completion/claim state is the observable signal).
- **Persistence keys:** `snake_daily_quests`, `snake_weekly_quests` (JSON arrays), `snake_daily_quest_date`, `snake_weekly_quest_date` (date strings). `persistQuests()` writes all four; `checkQuestProgress()` only persists when something changed (avoids 4 writes/food-eat).
- **Rewards are XP ONLY** (never mutator tokens) per design review — flooding the token economy would destroy its scarcity. The `DAILY_CHALLENGES` system (separate, daily-mode-only) remains unchanged; quests are an orthogonal always-on system.
- **Panel:** `#questsPanel` follows the cosmetics/achievements DOM-panel pattern (toggle via `showQuestsPanel()`, `Q` key idle/gameover only — blocked during `playing`). Every `show*Panel` function and `closeAllPanels()` hide `questsPanel`; `showQuestsPanel()` hides all siblings. Adding a new panel requires adding the cross-hide line to every existing show function (the pattern is explicit cross-hiding, not a shared helper — do NOT refactor to a shared `hideAllPanels()` without cause).

## Visual Polish Pack (v7 Feature D)
- **D1 food spawn pop + idle bob:** `generateFood()` (and the inline Echo-brew `food2` spawn) sets `food.spawnTime = performance.now()`. `drawFood()` computes `spawnScale = easeOutBack(elapsed/250)` for the first 250ms, then applies per-type idle bob (circle=vertical wobble, diamond=rotation, rare/epic=pulse, chevron=horizontal drift). The whole shape block is wrapped in `ctx.save()` → `translate(cx+bob)` → `scale(spawnScale*bobPulse)` → `rotate(bobRot)` → … → `ctx.restore()`. **Shapes draw at the LOCAL ORIGIN (0,0), not cx/cy** — any new food type added to the switch MUST draw at origin or it will be offset/scaled wrong. The letter labels render AFTER the restore at absolute cx/cy (no transform) for readability.
- **D2 ambient grid breathing:** a radial gradient centered on `snake[0]` with alpha `0.04 + 0.03*Math.sin(renderTime*0.002)` is drawn in `drawGame()` right after `drawGrid()` and before `drawPaintGrid()`, gated on `gameState==='playing' && snake.length>0`. It sits inside the play-area clip.
- **D3 post-FX replaces drawSlowMoTint:** `drawSlowMoTint()` was deleted; its job (and more) is now done by `drawPostFX()`, called as the LAST thing in `drawGame()` (before the flash overlay, which renders in `animateVisuals`). It draws an always-on vignette (transparent center → 0.15 black edges), a slow-mo purple tint when `slowMoActive`, and a death-vignette crush (`gameState==='gameover' && shakeTimer>0`) that intensifies as `shakeTimer` decreases. Uses `source-over` — `multiply` is NOT a valid Canvas 2D composite op.
- **D4 death fragments REPLACE death particles:** `gameOver()` no longer calls `spawnParticles()` for the death burst. Instead it iterates `snake[]` tail-first, pushing one `deathFragment` per segment into `deathFragments[]` with a per-segment `delay` so the decay ripples tail→head. Fragments use the SNAKE'S OWN SKIN colors (head segment larger/brighter) — NOT the `DEATH_EFFECTS` cosmetic color (that config is now vestigial for the death moment; it still cycles in the cosmetics UI panel). `ghost`/`rainbow` skins get representative colors (rainbow bursts per-segment hue). Capped at 400 fragments. Rendered in `animateVisuals()` between particles and floaters with `globalCompositeOperation='lighter'` for additive glow; **the `ctx.save()`/`ctx.restore()` around the block MUST stay paired** — removing restore leaks `lighter` composite + `shadowBlur` into every subsequent draw. Updated with delta time (frame-rate independent): `delay` and `life` decay via the rAF `delta`. `deathFragmentsActive` gates the render scan. Cleared in BOTH `resetGame()` AND `resetWaveState()` (gauntlet waves reset the snake, so a stale death sequence must not carry across waves).

## Load-Time Bindings (v7 fix)
- `hasTouch` (touch-device boolean) was referenced at module-init (`let isMobile = hasTouch || ...`) since the v5 refactor but never declared, throwing a ReferenceError that HALTED the entire game script on load — every later `let`/`const` landed in the temporal dead zone and the game never initialized. Fixed by declaring `const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)` before its first use. Any future module-init expression that references an undeclared identifier has the same game-breaking effect; run `node test-bugfixes.mjs` ("No JS errors on load") as the first smoke check.

## HiDPI/Retina Canvas Scaling (v8 A)
- `DPR` is a module-scope `let` (`Math.min(window.devicePixelRatio || 1, 3)`), NOT a const — `resizeCanvas` reassigns it when a window moves between displays, resizes the backing store, and nulls `gridCacheTheme` to force a rebuild.
- The base transform is set at the TOP of `drawGame()`: `ctx.setTransform(DPR, 0, 0, DPR, shakeOffsetX * DPR, shakeOffsetY * DPR)`. This is absolute, so `drawGame` is self-contained for every direct `drawGame(1)` call (~30 sites: menus, pause nav, gauntlet intermission, draft, restore, page-load) AND carries the shake when called from rAF. Do NOT add a separate `setTransform` in `animateVisuals`.
- The shake is FOLDED into the base transform via module-level `shakeOffsetX`/`shakeOffsetY` (visual state, written only in `animateVisuals`, read in `drawGame`). The old `save()`/`translate()`/`restore()` shake wrapper around the `drawGame(t)` call was REMOVED — a `setTransform` inside `drawGame` would wipe a separate translate. Calm mode (`calmModeEffective()`) and the `shakeIntensity` slider both gate the shake inside this single site.
- The grid cache (`ensureGridCache`) is DPR-scaled: `gridCacheCanvas.width/height = PLAY_WIDTH/HEIGHT * DPR`, `gctx.setTransform(DPR,...)`, and the cache key includes a `_dpr<N>` suffix. **The cache-key suffix is load-bearing** — `resizeCanvas` does NOT call `ensureGridCache`; the cache rebuilds only because the key mismatch triggers it on the next `drawGrid()`. `drawGrid()` blits with an explicit dest size: `ctx.drawImage(gridCacheCanvas, 0, 0, PLAY_WIDTH, PLAY_HEIGHT)`.

## Calm Mode / Reduced Motion (v8 B)
- `calmMode` ('auto'|'on'|'off') persists via saveManager; `calmModeEffective()` = `on` OR (`auto` AND `prefers-reduced-motion: reduce`). `prefersReducedMotion` is a `matchMedia` query with a `change` listener that sets `visualDirty`.
- Gating is INTENSITY-ONLY at choke points — timers still decay, logic state is unchanged (keeps replays/snapshots deterministic): shake (folded-shake line → 0), flash alpha (clamped ≤ 0.15 in the `animateVisuals` flash consumption block, NOT in `drainVisualQueue` which only returns the effect), food spawn pop + idle bob (gated in `drawFood()` AND the echo-brew `food2` pop path), grid breathing (skipped), death fragments (capped at 60 in the `gameOver()` spawn loop).

## Unified Settings Panel (v8 C)
- `#settingsPanel` follows the cosmetics/quests DOM-panel pattern. The cross-hide contract is now **7 sites**: `showDiaryPanel`, `showBrewsPanel`, `showQuestsPanel`, `showAchievementsPanel`, `showCosmeticsPanel`, `showStatsPanel`, and `closeAllPanels`. `closeAllPanels` now also hides `diaryPanel` and `brewsPanel` (fixing a pre-existing gap where those two were never hidden). Adding a new panel requires the cross-hide line in every `show*Panel`.
- `gridVisible` (`snake_grid_visible`) gates grid LINES only — the themed bg fill always paints (skipping `drawGrid()` entirely would remove the board background, which is baked into the cache). The cache key includes `_g`/`_bg` so toggling rebuilds bg-only vs full.
- `S` key opens settings in idle/gameover only; it MUST be placed AFTER the gauntlet-intermission block in the keydown handler so it doesn't collide with intermission's `s` navigation.
- `spawnParticles(x, y, count, color)` — the parameter is `count`, NOT `pCount`. The `particleDensity` slider scales it AFTER the `Math.min(count, 500 - particles.length)` perf clamp.

## Game-Over Recap Card (v8 D)
- `recapData` REPLACES `sessionSummary`/`sessionSummaryTimer` (both fully removed — construction in `gameOver`/`endZenSession`, the draw block in `animateVisuals`, AND the decay line in the rAF timer-decay section). When removing a decayed timer, grep for ALL three sites (build / draw / decay) or the leftover decay line throws a TDZ ReferenceError at load.
- `buildRecapData()` is called from BOTH `gameOver()` AND `endZenSession()` (Zen-Mode-Gap rule), but NOT for gauntlet deaths (`if (gameMode !== 'gauntlet')`) — gauntlet keeps its existing `drawOverlay('Run Over — Wave X/5', ...)` overlay. Gauntlet-complete shows `drawGauntletCompleteScreen`.
- `recapQuestBaseline` is snapshotted in `startGame()` (via `captureQuestBaseline()`); `buildRecapData` diffs per-quest `progress` to find the quests that moved (cap 3). `isNewBest = score > sessionModeHighStart` (the start-of-run best, NOT `modeHighScores[gameMode]` which may already be updated by `updateScoreDisplay`/`finalizeSession`). Zen shows length, no PB delta.
- `endZenSession` MUST still call `stopDrone()` + `stopPad()` (synesthesia audio) — these were easy to lose when removing the sessionSummary block that sat between them.

## Hunter Food / Fleeing Prey (v8 E)
- `FOOD_TIERS.hunter` (weight 0.05). The existing weights were REBALANCED to sum 0.95 (`common 0.40→0.37`, `bonus 0.15→0.13`) because `pickRandomFoodType` does a cumulative scan with NO normalization — hunter appended at weight 0.05 reaches band [0.95, 1.00).
- Hunter is excluded in Walled mode (`MODE_CONFIG[gameMode].wrap === false`) via TWO separate paths: the non-chaos path scans an `effectiveTiers` object filtered to drop `hunter`; the chaos path is handled SOLELY by a `shuffleFoodWeights()` filter (the chaos branch scans `chaosCurrentWeights`, NOT `effectiveTiers` — do not try to scan `effectiveTiers` there).
- The food INSTANCE is `{x, y, type, spawnTime}` — the `hunter: true` flag lives on the tier def, so movement checks MUST use `food.type === 'hunter'`, NOT `food.hunter`.
- `HUNTER_MOVE_INTERVAL = 3` is FIXED (no per-move random) so no extra food-snapshot field is needed. Movement uses `seededRandom()` for the tiebreak (NOT `Math.random()`) so seeded challenge runs stay deterministic. Wrap-aware flee math uses `PLAY_WIDTH`/`PLAY_HEIGHT` (NOT `CANVAS_WIDTH`).
- Echo-brew `food2` copies the parent food's `type` — coerce `food.type === 'hunter' ? 'common' : food.type` at the food2 spawn site so a static hunter food2 (never moves) can't spawn. Magnet pull skips hunter (`food.type !== 'hunter'`). The hunter rejection list includes `food2` and `powerUpPickup` (not just snake/obstacle/rival) to avoid stacked entities.
- `EXPLORER` stays at `sessionFoodTypes.size >= 6` (now 6-of-7 in non-Walled, all-6 in Walled) — do NOT bump to 7, it becomes uncompletable in Walled where hunter is excluded.

## Bounty Rush / Timed Contracts (v8 F)
- `activeBounty`/`bountyTickCounter` are game-logic state, written ONLY in the tick loop (`tickBounty()` from `updateGame`). The countdown ring in `animateVisuals` is READ-ONLY (never writes `activeBounty`). Bounties bank immediately on completion — NO session-end hook needed (deliberately avoids the dual `gameOver`/`endZenSession` burden); an active bounty simply dies with the run.
- Bounty windows are TICK-COUNTED (not wall-clock) — they swing under slowMo/dynamic speed; bounties never punish so farming is a non-issue. The `combo` bounty measures the LIVE `comboCount` reaching target (auto-completes if already past at spawn — acceptable), NOT a delta against `sessionMaxCombo` (which never decreases and would be uncompletable).
- Snapshot: `activeBounty`/`bountyTickCounter` are ADDITIVE fields (`data.activeBounty || null`). Do NOT bump `SNAPSHOT_VERSION` — `restoreFromSnapshot` enforces a strict version gate and would discard v1 saves; additive fields default safely. Reset in BOTH `resetGame()` AND `resetWaveState()`.
- Toast mechanism is `queueToast()` → `toastQueue` → `processToastQueue()`. The "Toast Timer Sharing" section above (referencing `window.achToastTimer`) is STALE — that symbol no longer exists; `queueToast` already serializes toasts. Bounty toasts call `queueToast`, no new timer.

## Canvas Save/Restore — New v8 Draw Functions
- `drawRecapCard()` (gameover branch of the gameover overlay), the hunter paw-print shape (new `drawFood()` case), and the bounty countdown ring (in `animateVisuals`) all wrap in `ctx.save()`/`ctx.restore()` and draw shapes at the local origin where a transform applies. Follow the existing D1 discipline.


## Save Data Export/Import (v9 A)
- `exportSaveData()` / `importSaveData(file)` are bare-name module-scope functions (become `window.*` for `onclick`). Export collects all `snake_*` localStorage keys into a versioned JSON backup (`{ format: 'snakes-backup', version: 1, ... }`). Import overwrites localStorage with a confirm dialog. Import requires a page reload to take effect (module-scope `let`/`const` are already initialized from old values). Buttons live in `renderSettings()` inside the existing `#settingsPanel` — no new panel, no cross-hide contract impact.

## Visibility-Safe Auto-Save (v9 B)
- The `visibilitychange` handler calls `saveSnapshot()` BEFORE setting `gameState = 'paused'` on tab hidden. This closes the mobile data-loss gap where `beforeunload`/`pagehide` don't fire reliably on mobile Safari/Chrome. The snapshot is only restored on explicit user action (R key or tap "Resume Run").

## Diary Seed Replay (v9 G)
- `retrySeedFromDiary(seed)` mirrors the seedField input handler's hash computation (`seed.split('').reduce(...)` form, NOT the snapshot-restore `hashString` form). Sets `seedField.value`, `activeSeed`, `seedPrng`, calls `closeAllPanels()`, returns to idle. The button appears only when `entry.seed` is non-empty. No new state, no new DOM panel.

## Combo Heat Aura (v9 C)
- `comboHeatColor(combo)` returns a semi-transparent rgba tint for combo ≥ 3 (yellow → orange → red at 15+). Applied as a body fill overlay in `drawSnake()` after the main segment fill.
- The head halo is a radial gradient drawn BEFORE the `snake.forEach` loop (z-order: halo bottom → body+evolution glow → shield aura top). Draws at ABSOLUTE head coords (like the shield aura), NOT at local origin. Alpha capped at 0.5; dimmed 50% when `shieldActive` so the shield remains the dominant head cue. Calm-mode gate: skip the pulse, keep the static tint.

## Visual Feedback Pack (v9 F)
- `transientRings[]` is a shared visual array (same pattern as `deathFragments`): delta-decayed in `animateVisuals`, capped at 50, reset in `resetGame()`/`resetWaveState()`. All pushes happen in the tick loop or event handlers (never from rAF). `pushTransientRing(x, y, maxRadius, color, maxLife, type, lineWidth)` is the helper.
- **F1 Hunter Dust**: `moveHunter()` pushes a brown dust puff at the vacated cell. Calm-mode: skip. Determinism-safe: dust is pure visual (rAF-only), never affects snapshots/replays.
- **F2 Bounty Ring Urgency**: the bounty countdown ring in `animateVisuals` oscillates radius + shifts to red when `ticksLeft < 0.3 * windowTicks`. Calm-mode gates ONLY the oscillation — the countdown arc (information) is NOT gated. Also suppressed during `hoardActive` (v9 E). Cash-in burst on bounty completion: `pushTransientRing` + `spawnParticles` at the head.
- **F3 Power-Up Shockwave**: `activatePowerUp()` pushes a one-shot shockwave ring + particle burst at the head. Calm-mode: skip the ring, keep reduced particles.

## Portal Food (v9 D)
- `extraFoods[]` is a shared module-scope array for portal + hoard foods. Every food-touching site iterates it: eat-block (after primary `food` + `food2` checks), `moveHunter` rejection, magnet pull (skip portal, pull bonus), `drawFood` (at end, calls `drawExtraFood` per entry), snapshot serialization (additive field), `resetGame`/`resetWaveState` clear.
- Epic food has `portal: true` in `FOOD_TIERS`. When an epic spawns (non-Walled only), `findPortalTile()` places a linked portal twin (min 10 tiles, wrap-aware per-axis distance) in `extraFoods[]`. Both foods get `portalLink` refs to each other.
- **Eating the portal twin grants the epic's bonus** (score + XP + stats) AND removes the primary epic `food` (regenerates a new primary food). The snake is teleported Phoenix-style: `snake = [{exit.x, exit.y}]` then grows to min length 3. The exit is `snapToFreeTile()`-ed to avoid occupying snake/obstacle/rival.
- **Eating the primary epic food** triggers the normal eat block, then `extraFoods = extraFoods.filter(ef => !ef.portalLink)` removes the portal twin.
- `drawExtraFood()` draws portal foods as two concentric counter-rotating arcs (distinct from bonus pulse) with a prominent dashed purple connecting line + directional arrow. The label block wraps in `ctx.save()`/`ctx.restore()` per the sub-function leak rule.
- Echo-brew `food2` coerces `food.type === 'portal'` to `'common'` (same as hunter). Magnet skips portal foods. `hasSeenPortal` flag gates a first-time toast (mirrors `snake_has_played` onboarding pattern).
- The primary `generateFood` call includes `extraFoods` in the collision-check `currentSnake` parameter to prevent spawning on top of existing extra foods.

## Golden Hoard Event (v9 E)
- `hoardActive`/`hoardTimer`/`hoardTickCounter`/`scoreMultiplier` are module-scope state declared early (line ~204) so Feature F can reference `hoardActive` before E is implemented. Constants: `HOARD_INTERVAL = 5400` (~90s), `HOARD_DURATION = 900` (~15s). `hoardEnabled: true` in `MODE_CONFIG` for Classic, Time Attack, Daily, Snap only.
- `activateHoard()` spawns 4 bonus foods into `extraFoods[]` via `generateHoardFood()` (direct placement, bypasses `generateFood`'s portal logic). Sets `scoreMultiplier = 2`, announces via `queueToast` + `queueGameEffect('flash')`.
- `endHoard()` resets `scoreMultiplier = 1`, `hoardTickCounter = 0`. Uneaten hoard foods remain in `extraFoods[]` (they're still valid bonus foods).
- **`scoreMultiplier` is inside `addScore()`** as a single outer multiplier: `score += Math.round(amount * multi * effectiveHoardMult)`. When `golden_food` mutator is active, the hoard multiplier is capped at 1.5 (Hoard + Golden Age = ×4.5 max, not ×6). Applies to ALL `addScore` calls (tier.pts, combustion, combo bonus, food2, bounty) — bounties are suppressed during hoard so bounty rewards don't fire.
- **Rival freeze**: BOTH `updateRival()` AND the rival respawn-timer decrement are gated on `!hoardActive`. A dead rival stays dead for the hoard duration.
- **Bounty suppression**: `tickBounty()` holds `bountyTickCounter` at 0 while `hoardActive` (no new bounties spawn). The urgency ring (F2) is also suppressed during hoard.
- **Post-FX golden tint**: `drawPostFX()` adds a subtle gold tint (`rgba(255,215,0,0.06)`, or 0.03 in calm mode) when `hoardActive`.
- **Snapshot**: `hoardActive`/`hoardTimer`/`hoardTickCounter`/`scoreMultiplier` are additive fields (no `SNAPSHOT_VERSION` bump). The 4 hoard foods are in `extraFoods[]` (snapshotted by D's infrastructure). Reset in `resetGame()` only (E is excluded from Gauntlet, so `resetWaveState()` is not needed).
- **No session-end hook** — the event dies with the run, like bounty.