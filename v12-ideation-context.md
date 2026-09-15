# Snakes v12 — Ideation Context (shared)

## Game state at v11 merge (master @ 23a427e)

`snake.html`: 8594 lines, single-file architecture (no build, no bundler, no server; localStorage only).
Tests: 129 assertions across 11 Playwright suites (`node test-*.mjs`), harness at `test-helpers.mjs`.

### Already shipped (v7–v11, ~34 features)

**v7**: Unified render scheduler (`queueGameEffect`/`drainVisualQueue`), Evolution system (Swift/Serpentine/Titan/Apex, cumulative per-run bonuses), Quest Board (3 daily + 3 weekly, deterministic seed, XP-only), Visual Polish Pack (food spawn pop + idle bob, grid breathing, post-FX, death fragments), GameState Snapshot Engine (mid-run save/resume), PWA shell.

**v8**: HiDPI/Retina scaling (DPR-aware grid cache), Calm Mode / Reduced Motion, Unified Settings Panel (7-panel cross-hide contract), Game-Over Recap Card, Hunter Food (fleeing prey), Bounty Rush (tick-counted timed contracts).

**v9**: Save Export/Import (versioned JSON), Visibility-Safe Auto-Save (snapshot on tab-hide), Diary Seed Replay, Combo Heat Aura, Visual Feedback Pack (transient rings), Portal Food (epic twin teleport into `extraFoods[]`), Golden Hoard (×2 score event, 4 bonus foods, rival freeze).

**v10**: Input Buffer Queue (2-deep `dirQueue`), Colorblind palettes (`CVD_PALETTES` + `foodColor()`), Meta-Achievements, Daily Seed Leaderboard, Bomb Food, Combo Bank (5 charges, Z-spend: Clear/Magnet/Teleport), Hazard Zones (pulsing lethal lava).

**v11**: Hazard Chain Bonus, Combo Heat → Hazard Melt, Hoard Pigment Rush, Daily Seed Determinism (fixed a real bug: daily mode was fully non-deterministic), Streak Multiplier Ladder (+1% XP/streak day, cap +30%, charges at 7/14/30), Save Corruption Auto-Recovery (`quarantineKey`), Input Buffer Visualization (head chevrons).

**Pre-v7 legacy systems still live**: 8 mutators + MUTATOR_DEFS draft, 8 RESONANCES (mutator-pair synergies), Cascade mode, 7 Brews (equipped, 2 max), power-ups, obstacles (5 patterns, progressive spawning), modes (Classic, Time Attack, Zen, Walled, Daily, Snap, Painter, Gauntlet), achievements (~60 + meta), stats panel, diary, cosmetics, reflections, XP/level/prestige, screen-reader announcements, synesthesia audio, touch D-pad + swipe.

### Architecture invariants (load-bearing — do not break)

- `gameState` single source of truth (idle/playing/paused/gameover)
- Game loop: `setTimeout` chaining via `scheduleNextTick()`/`stopGameLoop()`/`restartGameTimeout()`; `gameTimeout` guard at top of `scheduleNextTick`
- Dual render loops: tick loop (`updateGame` → `drawGame`) + rAF (`animateVisuals`, read-only on game logic)
- `flashOverlay` written by BOTH the tick loop and the rAF level-up decay
- Module scope (no IIFE): top-level `function`/`var` become `window.*`; top-level `let`/`const` are lexical globals accessible by bare name. Tests use bare names.
- Canvas save/restore discipline: every `ctx.save()` needs a matching `ctx.restore()` on ALL paths; sub-functions that set text/alignment/fillStyle MUST wrap
- Draw order: grid → HUD-at-grid-depth → obstacles → hazards → food → snake → trails → overlays → flash → post-FX
- `FOOD_TIERS` is the global authority for food distribution; `pickRandomFoodType` has NO normalization (weights must sum to 1.00)
- Parallel session-end hooks: new session-end logic must go in BOTH `gameOver()` AND `endZenSession()`
- Reset sites: per-run state must be cleared in BOTH `resetGame()` AND `resetWaveState()` (Gauntlet waves reset the snake)
- Snapshot: additive fields ONLY — never bump `SNAPSHOT_VERSION` (strict version gate discards saves)
- Cross-hide panel contract: adding a panel requires the cross-hide line in EVERY existing `show*Panel` + `closeAllPanels` (currently 7 sites)
- `foodColor(type)` MUST be used at ALL food-tier color read sites (portal uses hardcoded `#AA44FF` by design)
- Tick-count all timers relative to the actual tick interval (~120ms base), NOT 60fps. `HOARD_INTERVAL=750`, `HOARD_DURATION=125`, `HAZARD_INTERVAL=500`, `HAZARD_MAX_LIFE=42`. Calibrating for 60fps was a real shipped bug twice.
- rAF loop reads game state but NEVER writes game-logic state (visual state only)

### Known open gaps (candidates, not mandates)

1. **5 of 7 mutator resonances are advertised but inert.** `RESONANCES` (snake.html L881-890) declares 8 combos with `effect` tags. `activeResonance.effect` is consumed in exactly ONE place (the tick loop, ~L6461-6472) and only for `invertControls` (which merely flashes a white overlay — it does not actually invert controls) and `feastFamine` (whose body is an empty `if` with a comment). `intangiblePhase`, `doubleGold`, `rivalShrink`, `quantumToggle`, `rapidDoom`, `chaosCycle` are detected, displayed in the HUD, and do nothing. A synergy that advertises behaviour it does not have is worse than no synergy.
2. **Cascade penalty is invisible.** `getCascadeMultiplier()` (L902-905) halves the run's score whenever 2+ mutators are active, applied only in `gameOver()` (L3321). CORRECTION (verified during v12 ideation): `cascadeMode` **is** live — toggled by the C key at L7834, unlocked via `saveManager.set('snake_cascade_unlocked', 'true')` at L6005, and `getCascadeMultiplier` is called at L3321. The live defect is *disclosure*: `addScore()` calls `updateScoreDisplay()` with no cascade factor, so the HUD reads the raw score all run and the recap card shows the halved value — a silent 50% haircut the player never sees.
3. Remaining MEDIUM/LOW audit findings from the v11 passes (see `audit-fixes.md`, `audit-fixes-round2.md` "NOT Fixed" section) — LOW visual/scope issues only.
4. **Verify in the running game.** The v11 suite was green while the shipped game was unplayable (invisible portal/hoard foods, canvas transform corruption, rival spawning on the player's tile). Assertions passing ≠ game working. Any new feature must be verified by driving the real game in Chromium and observing pixels/state.

### Do NOT re-propose (already rejected or already shipped)

Already shipped in v7–v11 (proposing these again is noise): Save Corruption Auto-Recovery, Input Buffer Visualization, Daily Seed Determinism, Hoard Pigment Rush, Hazard Chain, Hazard Melt, Streak Multiplier Ladder.

Previously rejected, may be ripe but justify hard: Snake Split, Prestige Perk Tree, Keyboard Remapping, Seasonal Ladder, Contract Wagers, Adaptive Quality Scaling, Web Share API, Recap Card Stagger-In, Territory Clash, Hot-Seat Tournament, Run Code Cards, Weekly Seeded Gauntlet, Per-Mode Mastery, Hoard Overload, Phantom Rival, Evolution Branching, Mobile Haptic Feedback, Audio Ducking on Calm Mode, Combo Bank Phase Shift, Hunter Stampede, Bounty Hijack, Apex Rift Step, Obstacle Quarry, Rival Bounty Hunter, Diary Milestones, Snapshot Health Badge, DPR-aware toast font scaling.

## Your job

Generate **6–10 ideas** in your assigned angle. For EACH idea give exactly these fields:

- **Name** (short)
- **Concept** (2–4 sentences: what it does mechanically, and the player-facing hook)
- **LOC estimate** (honest, with the files/functions it touches)
- **Scores** — Impact (1–5), Feasibility (1–5), Risk (1–5, higher = more risky), Synergy (1–5)
- **Hook points** — CONCRETE functions/arrays/line numbers in `snake.html` it touches. You MUST actually grep/read the file to verify each hook exists and behaves as you claim. State the line numbers you verified.
- **Failure modes** — what could go wrong at runtime, and how a test would catch it (be specific: what in the real game would break and how you'd observe it in Chromium)
- **Why now / why not** — what makes it ripe or premature at v12

### Angle guidance

- Prefer ideas that **compound with existing systems** (evolution, quests, bounty, hoard, hazards, combo bank, diary, daily seed, mutators, brews, resonance) over standalone new systems.
- The game already has ~34 features. **Depth and correctness beat breadth.** An idea that fixes/complete an advertised-but-inert system scores high on Synergy.
- No backend. localStorage only. No new npm dependencies.
- Ideas must be verifiable in the running game (screenshot or observable state change), not just via unit assertion.
- Be honest about LOC. A 200-LOC idea is fine if the impact justifies it, but say so.
