# Snakes v11 — Ideation Context (shared)

## Game state at v10 merge (commit cfaf4f0)

snake.html: 8033 lines, single-file architecture (no build, no bundler). Tests: 94 total via Playwright (`node test-*.mjs`).

### Already shipped (v7–v10, 20 features)
- Unified render scheduler (queue-based `flashOverlay` via `queueGameEffect`/`drainVisualQueue`)
- Evolution system (4 cumulative tiers: Swift/Serpentine/Titan/Apex, per-run bonuses)
- Quest Board (3 daily + 3 weekly, deterministic seed, XP-only rewards, 20 templates)
- Visual Polish Pack (food spawn pop + idle bob, ambient grid breathing, post-FX vignette/slowmo/death, death fragments)
- GameState Snapshot Engine (save/resume mid-run, additive fields, no version bump)
- PWA Shell (installable + offline)
- HiDPI/Retina canvas scaling (DPR-aware, grid cache keyed by DPR)
- Calm Mode / Reduced Motion (intensity-only gating at choke points)
- Unified Settings Panel (7-panel cross-hide contract)
- Game-Over Recap Card (replaces sessionSummary, diffs quest baselines)
- Hunter Food / Fleeing Prey (hunter moves away from head, wrap-aware flee)
- Bounty Rush / Timed Contracts (tick-counted windows, bank immediately, no session-end hook)
- Save Data Export/Import (versioned JSON backup)
- Visibility-Safe Auto-Save (snapshot on tab-hide)
- Diary Seed Replay (retry from diary entry)
- Combo Heat Aura (body tint + head halo at combo ≥ 3)
- Portal Food (epic twin teleport, extraFoods[] shared array)
- Golden Hoard Event (~90s interval, ×2 score, 4 bonus foods, rival freeze)
- Visual Feedback Pack (transient rings: hunter dust, bounty urgency, power-up shockwave)
- Input Buffer Queue (2-deep dirQueue, reverse-check)
- Colorblind Palettes (CVD_PALETTES, Okabe-Ito, foodColor() helper)
- Meta-Achievements (second-tier, read `achievements` map by closure)
- Daily Seed Leaderboard (per-day top-5, localStorage)
- Bomb Food (0-score obstacle/rival clear)
- Combo Bank (comboCharges cap 5, Z-key spend: Clear/Magnet/Teleport)
- Hazard Zones (pulsing lava tiles, on/off phase, lethal on-phase)

### Architecture invariants (load-bearing — do not break)
- `gameState` single source of truth (idle/playing/paused/gameover)
- Game loop: `setTimeout` chaining via `scheduleNextTick()`/`stopGameLoop()`/`restartGameTimeout()`
- Dual render loops: tick loop (updateGame→drawGame) + rAF (animateVisuals, read-only on game logic)
- `flashOverlay` written by BOTH tick loop and rAF (level-up decay) — coordinated via `levelUpFlash` overlap
- Module scope (no IIFE): top-level `let`/`const` are lexical globals (bare-name accessible, NOT `window.*`); `function`/`var` become `window.*`. Tests use bare names.
- Canvas save/restore discipline: every `ctx.save()` needs matching `ctx.restore()` on ALL paths; sub-functions that set text/alignment MUST wrap
- Draw order: grid → HUD-at-grid-depth → obstacles → hazards → food → snake → trails → overlays → flash
- `FOOD_TIERS` is the global authority for food distribution; `pickRandomFoodType` has NO normalization (weights must sum to 1.0)
- Parallel session-end hooks: `gameOver()` AND `endZenSession()` both need new session-end logic
- Reset sites: `resetGame()` AND `resetWaveState()` both clear per-run state
- Snapshot: additive fields (no `SNAPSHOT_VERSION` bump); restore must default safely
- Cross-hide panel contract: adding a panel requires the cross-hide line in EVERY existing `show*Panel` + `closeAllPanels`
- `foodColor(type)` MUST be used at ALL `tier.color` read sites (portal uses hardcoded #AA44FF by design)

### Previously rejected ideas (now ripe for reconsideration, but new ideas welcome)
Snake Split, Prestige Perk Tree, Keyboard Remapping, Seasonal Ladder, Contract Wagers, Adaptive Quality Scaling, Web Share API, Recap Card Stagger-In, Territory Clash, Hot-Seat Tournament, Run Code Cards, Weekly Seeded Gauntlet, Per-Mode Mastery, Hoard Overload, Phantom Rival, Evolution Branching, Save Corruption Auto-Recovery, Mobile Haptic Feedback

## Your job

Generate **6–10 ideas** in your assigned angle. For each idea give:
- **Name** (short)
- **Concept** (2–3 sentences: what it does, the player-facing hook)
- **LOC estimate** (rough, be honest)
- **Scores** — Impact (1–5), Feasibility (1–5), Risk (1–5, higher=more risky), Synergy (1–5, how it compounds with existing systems)
- **Hook points** — concrete functions/arrays/lines in snake.html it would touch (grep these to confirm feasibility)
- **Why now / why not** — what makes it ripe or premature at v11

Prefer ideas that COMPOUND with existing systems (evolution, quests, bounty, hoard, hazards, combo bank, diary, daily seed) over standalone features. The game already has 20 features — depth and polish over breadth. Avoid ideas that need a backend (no server, localStorage only).