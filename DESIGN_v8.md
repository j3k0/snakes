# Snake Game — v8 Design Plan

## Vision

v7 gave us a unified render scheduler, evolution morphs, a quest board, a visual polish pack, a snapshot engine, and a PWA shell. The game is deep, persistent, and installable. v8 focuses on **visual fidelity, accessibility, settings discoverability, session feedback, and mid-run excitement** — still in the single HTML file.

Six features were selected from an 18-idea cross-domain brainstorm (gameplay, visual/juice, technical architecture) using priority = impact × feasibility / risk, plus cross-feature synergy:

| Dimension | Feature | Priority | Est. LOC |
|---|---|---|---|
| Rendering Foundation | A: HiDPI/Retina Canvas Scaling | 24.0 | ~80 |
| Accessibility | B: Calm Mode (Reduced Motion) | 36.0 | ~140 |
| UX Discoverability | C: Unified Settings Panel | 31.5 | ~190 |
| Session Feedback | D: Game-Over Recap Card | 28.0 | ~220 |
| Gameplay Mechanic | E: Hunter Food (Fleeing Prey) | 21.3 | ~250 |
| Mid-Run Excitement | F: Bounty Rush (Timed Contracts) | 36.0 | ~300 |
| **Total** | | | **~1,180** |

### Implementation Order

A → B → C → D → E → F

- **A first**: Display-fixing foundation; every visual feature after it renders sharper.
- **B before C**: Calm Mode's toggle is surfaced in the Settings Panel, so the setting must exist first.
- **C after B**: Settings Panel exposes calm mode alongside the existing hidden toggles (mute, high-contrast).
- **D, E, F independent**: recap card, hunter food, and bounties touch disjoint systems (session-end UI, food system, quest/toast systems).

### Ideas Considered and Rejected

| Idea | Priority | Reason rejected |
|---|---|---|
| Unified test runner + snapshot round-trip suite | 20.0 | Dev tooling, not player-facing; revisit when snapshot schema churns again |
| Hot-Seat Tournament | 18.7 | ~450 LOC for a pass-and-play niche; revisit if social play is requested |
| Danger Telegraph | 18.7 | Red pulse on lethal tiles conflicts with Calm Mode flash gating; design would need rework once B exists — defer to v9 |
| Self-healing loop error containment | 16.0 | No reported crashers; revisit after first real loop-crash report |
| Progressive first-run hints | 16.0 | Welcome overlay covers onboarding; revisit if new-player drop-off is observed |
| Contract Wagers | 14.0 | Token-economy inflation risk; needs economy metrics first |
| Seasonal Weekly Ladder | 12.25 | Overlaps daily challenge + weekly quests; revisit if engagement data says otherwise |
| Two-deep input queue | 9.8 | Risk 5 (input-buffer rewrite mid-speed); revisit if dropped-turn complaints appear |
| Territory Clash | 9.6 | Risk 5: rival painting needs a second paint-grid layer in the rAF path |
| Consolidated versioned save document | 6.0 | Risk 7 migration across ~40 keys for invisible benefit |

---

## Feature A: HiDPI/Retina Canvas Scaling

### Overview

The canvas is fixed at 440×600 logical pixels with no `devicePixelRatio` handling — blurry on every retina/HiDPI display. Scale the backing store by `devicePixelRatio` (capped at 3) and `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` once per frame so all existing draw code keeps working in logical coordinates unchanged.

### Why It's Next-Level

Every visual feature shipped in v7 (food pop, grid breathing, death fragments, post-FX) renders at half resolution on modern phones and laptops. This is the single highest visible-quality-per-line change available.

### Design

- On init (and on `resize`/`devicePixelRatio` change): `canvas.width = CANVAS_WIDTH * dpr; canvas.height = CANVAS_HEIGHT * dpr;` CSS size stays logical.
- At the top of `drawGame()` and `animateVisuals()`: `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` — replaces any existing `setTransform(1,0,0,1,0,0)` reset. Screen shake applies its translate *after* this base transform.
- The grid cache canvas (`gridCacheCanvas`) must be created at DPR scale too, with its own `gctx.setTransform`.
- Snapshot engine untouched (no state change). Touch hit-region math uses logical coordinates already (getBoundingClientRect ratio) — verify, no change expected.

### Risks

- Any code path using `canvas.width` as a logical dimension breaks — audit the ~5 uses; they must use `CANVAS_WIDTH`/`PLAY_WIDTH` constants.
- The offscreen grid cache must be invalidated when DPR changes (cache key already includes theme; add DPR).

---

## Feature B: Calm Mode (Reduced Motion)

### Overview

No `prefers-reduced-motion` handling exists anywhere. Calm Mode auto-initializes from `matchMedia('(prefers-reduced-motion: reduce)')` and can be toggled manually (persisted via saveManager, same idiom as `snake_high_contrast`). When active it gates: screen shake, flash overlay alpha (capped), food idle bob/spawn pop, ambient grid breathing, and death-fragment count.

### Why It's Next-Level

Accessibility is table stakes for a game with this much screen flash; it also doubles as a "performance mode" on weak hardware.

### Design

- `let calmMode = saveManager.get('snake_calm_mode', 'auto');` — tri-state: `'auto' | 'on' | 'off'`. Effective value: `calmMode === 'on' || (calmMode === 'auto' && prefersReducedMotion.matches)`.
- Gating at choke points only (no per-callsite sprawl):
  - Shake: where the shake translate is applied in `animateVisuals()` — skip when calm.
  - Flash alpha: inside `drainVisualQueue()` consumption — clamp alpha to ≤ 0.15 when calm.
  - Bob/pop/breathing: `drawFood()` and the grid-breathing block read a module-level `calmModeEffective()` helper.
  - Death fragments: cap fragment count at 60 when calm (spawn site in `gameOver()`).
- `prefersReducedMotion` listener updates the effective value live; `visualDirty = true` on change.

### Risks

- Gating must not skip *updates* (timers still decay) — only *rendering intensity*. Logic state stays identical; this keeps replays/snapshots consistent.

---

## Feature C: Unified Settings Panel

### Overview

Settings are scattered as hidden keyboard toggles (M = mute, V = high-contrast) with no UI surface. Add a `#settingsPanel` DOM panel following the exact cosmetics/quests panel pattern, exposing: mute toggle, high-contrast toggle, calm mode (auto/on/off), screen-shake intensity slider (0–100%), particle density slider (0–100%), and grid visibility toggle.

### Why It's Next-Level

Two existing features (mute, high-contrast) are undiscoverable; Calm Mode (B) needs a home; shake/particle intensity were requested-adjacent since the visual polish pack.

### Design

- DOM: `<div id="settingsPanel">` cloned structurally from `#questsPanel`; backdrop reuse via `panelBackdropEl`.
- `showSettingsPanel()` follows the panel contract: hides ALL sibling panels explicitly; **every** existing `show*Panel()` and `closeAllPanels()` gains the `settingsPanel` hide line (AGENTS.md: explicit cross-hiding, no shared helper refactor).
- Gear button (⚙) in the footer next to existing panel buttons; `S` key opens it in idle/gameover (blocked during `playing`, same guard as `Q`).
- Sliders persist via saveManager: `snake_shake_intensity` (default 100), `snake_particle_density` (default 100), `snake_grid_visible` (default 1).
- Shake intensity scales the shake translate magnitude; particle density scales spawn counts in `spawnParticles()`; grid visibility skips `drawGrid()`/grid-breathing (grid cache untouched).

### Risks

- The cross-hide contract is manual — miss one `show*Panel()` and panels overlap. Checklist in impl plan must enumerate every show function.
- Slider changes must apply live (`visualDirty = true`), no restart.

---

## Feature D: Game-Over Recap Card

### Overview

The game-over overlay currently shows score and little else. Replace it with a recap card: final score with personal-best delta ("+43 NEW BEST!" / "−12 vs best"), XP earned breakdown, evolution tier reached, quest progress moved this run, and a clear retry prompt.

### Why It's Next-Level

Session-end is the highest-emotion moment; today it wastes the progression systems (XP, evolution, quests) that v7 built. The recap converts a death into a reason to retry.

### Design

- `drawRecapCard()` replaces the gameover branch of `drawOverlay()`, full `ctx.save()`/`ctx.restore()` discipline.
- Data captured at session end into a `recapData` object in BOTH `gameOver()` and `endZenSession()` (AGENTS.md Zen-Mode-Gap rule — parallel session-end paths): `{ score, modeBest, isNewBest, xpEarned, xpBreakdown, evolutionTier, questDeltas }`.
- Quest deltas: `checkQuestProgress()` already computes progress movement; capture per-quest before/after at session end (read `dailyQuests`/`weeklyQuests` arrays, diff against a snapshot taken in `startGame()`).
- Retry affordance: Enter restarts (existing), card shows "Press Enter to retry".
- Gauntlet wave transitions are not session ends — no recap there.

### Risks

- `recapData` must be reset in `resetGame()`; stale data would show the previous run's recap.
- Long quest lists must not overflow the card — cap at 3 quests with progress movement, "•••" otherwise.

---

## Feature E: Hunter Food (Fleeing Prey)

### Overview

A new `FOOD_TIERS.hunter` entry (weight ~0.05): prey that takes one random valid step every 2–3 ticks, biased away from the snake head using the wrap-aware Manhattan-delta math already proven for the Magnet power-up. Catching it pays big points (50) + XP and resets the combo eat window.

### Why It's Next-Level

Every food today is static; the hunt is only about pathing. Fleeing prey creates pursuit moments — the most "alive" a snake board can feel.

### Design

- `FOOD_TIERS.hunter = { pts: 50, xp: 60, weight: 0.05, color: '#FFAA00', pCount: 18, sound: 'eat', glow: 10, hunter: true }`.
- Movement hook in `updateGame()` (game tick only — rAF never writes): every `HUNTER_MOVE_INTERVAL` ticks, if `food.hunter`, compute candidate 4-neighbors; reject snake body, obstacles, rival; score each by wrap-aware distance from head (`dx = dx > 0 ? dx - CANVAS_WIDTH : dx + CANVAS_WIDTH` rule); pick the farthest valid tile with small random tiebreak. No move if no valid tile.
- `generateFood()` board-full guard and obstacle rejection unchanged; hunter uses same placement.
- Render: new case in `drawFood()` switch — **draws at local origin** per D1 discipline (a paw/chevron-double shape), gets spawn pop and a faster "nervous" idle bob.
- Eating: `sessionFoodTypes.add('hunter')`, resets `lastEatTime = Date.now()` (combo window refresh), stat normalization to `stats.normalFoodEaten` per the FOOD_TIERS stat rule.
- Excluded from Walled mode (non-wrapping movement bias conflicts) — `FOOD_TIERS` weight selection already mode-agnostic, so gate hunter's weight to 0 when `MODE_CONFIG[gameMode].wrap === false` and renormalize.

### Risks

- Hunter stepping onto the *next* tile the head enters same tick → eating order: movement runs before collision in the same tick, so worst case the hunter flees the head's landing tile — acceptable, even desirable.
- Snapshot engine: `food` object is already serialized; hunter needs no schema change beyond the `type` string.
- Echo-brew `food2` spawn path must not create hunters (inline spawn bypasses `FOOD_TIERS` weighting — keep as-is).

---

## Feature F: Bounty Rush (Timed Contracts)

### Overview

Every ~400 ticks during a run, a timed bounty contract appears ("Eat the next food within 8 ticks: +40 pts", "Reach 5x combo within 15 ticks: +50 XP") with an on-canvas countdown ring near the HUD. Completing banks the reward immediately with a milestone flash; failing just expires it — never punishes.

### Why It's Next-Level

Quests are per-period; combos are self-driven. Bounties inject directed goals *mid-run*, every run, without touching any economy.

### Design

- `BOUNTY_TEMPLATES`: ~6 contract types, each a `{ desc, target, reward: {pts?, xp?}, windowTicks, check(ctx) }` reusing `QUEST_PROGRESS_MAP`-style readers (score delta, food eaten delta, combo reached, snake length delta, speed food eaten delta).
- `BOUNTY_INTERVAL = 400` ticks; on expiry of a slot, if none active and `gameState === 'playing'`, pick a template scaled to current run (targets scale with snake length/score bands).
- Active bounty state: `activeBounty = { templateId, desc, target, reward, ticksLeft, startSnapshot }` — game-logic state, written only in the tick loop. `startSnapshot` captures baseline counters (sessionFoodEaten, score, sessionMaxCombo, snake.length) so `check()` measures deltas.
- Completion: reward applied immediately (`addScore`/`awardXP` — note the `MODE_CONFIG[gameMode].earnXP` gate), `queueGameEffect` milestone flash, toast ("Bounty complete! +40"). Expiry: soft toast, no penalty.
- Countdown ring renders in rAF loop read-only from `activeBounty.ticksLeft` — respects the write boundary.
- **No session-end logic** — bounties bank immediately, so no `gameOver()`/`endZenSession()` hook needed (deliberately avoids the dual-hook burden). An active bounty simply dies with the run.
- Snapshot engine: add `activeBounty` + `bountyTickCounter` to the snapshot schema (bump `SNAPSHOT_VERSION`, migrate by treating missing fields as no-active-bounty).

### Risks

- Bounty `check()` runs every tick — keep it O(1) (counter deltas only, no board scans).
- Toast timer sharing (`window.achToastTimer`): bounty toasts must join the existing shared-timer discipline, not add a new timer.
- Zen mode: bounties active (Zen has no death but runs still end via `endZenSession()`) — fine since nothing settles at session end.

---

## Cross-Feature Architecture Compliance (all six)

- Game-logic writes stay in the tick loop; rAF loop reads/decays visual timers only.
- All new canvas text/shape blocks use `ctx.save()`/`ctx.restore()`; food shapes draw at local origin.
- Session-end features hook BOTH `gameOver()` and `endZenSession()` (D only; F deliberately needs neither).
- Per-run state resets in `resetGame()` (and `resetWaveState()` where gauntlet-relevant: `recapData`, `activeBounty`, hunter is just `food.type`).
- Screen flashes go through `queueGameEffect()`/`queueRAFEffect()`, never direct `flashOverlay` writes.
- Food distribution changes go through `FOOD_TIERS` only.
- New DOM panel requires the explicit cross-hide line in every `show*Panel()` and `closeAllPanels()`.
- New persistence keys go through saveManager with the `snake_` prefix.
- Module-scope no-IIFE: no new module-init expressions referencing undeclared identifiers; `node test-bugfixes.mjs` "No JS errors on load" is the first smoke check after every feature.

## Out of scope

- Persisting bounties across sessions (bounties are per-run by design; revisit if players ask for "contracts" as a meta system).
- Multiplayer/tournament play (needs a second input path; revisit on explicit social-play request).
- Input-queue rewrite (risk 5; revisit if dropped-turn complaints appear).
- Save-format consolidation (risk 7 migration; no player-visible benefit this cycle).
- Unified test runner (dev tooling; revisit when the suite grows past 4 files).
