# Snake Game — v9 Design Plan

## Vision

v7 gave us a unified render scheduler, evolution morphs, a quest board, a visual polish pack, a snapshot engine, and a PWA shell. v8 added HiDPI/Retina scaling, Calm Mode, a Unified Settings Panel, a Game-Over Recap Card, Hunter Food, and Bounty Rush. The game is deep, persistent, installable, and visually polished.

v9 focuses on **data safety, core-mechanic juice, spatial gameplay depth, and run pacing** — still in the single HTML file.

Seven features were selected from a 20-idea cross-domain brainstorm (gameplay, visual/juice, technical/UX) using priority = impact × feasibility / risk, plus cross-feature synergy:

| Dimension | Feature | Priority | Est. LOC |
|---|---|---|---|
| Data Safety | A: Save Data Export/Import | 24.0 | ~150 |
| Data Safety | B: Visibility-Safe Auto-Save | 27.0 | ~60 |
| Core Juice | C: Combo Heat Aura | 24.0 | ~90 |
| Spatial Gameplay | D: Portal Food | 18.7 | ~180 |
| Run Pacing | E: Golden Hoard Event | 18.7 | ~230 |
| Visual Feedback | F: Visual Feedback Pack (Hunter Dust + Bounty Ring + Power-Up Shockwave) | 23.5 | ~200 |
| QoL | G: Diary Seed Replay | 22.5 | ~60 |
| **Total** | | | **~970** |

### Implementation Order

A → B → G → C → F → D → E

- **A, B first**: Data safety features with zero gameplay coupling; surgical additions.
- **G**: QoL feature with no dependencies; reuses existing seed infrastructure.
- **C before F**: Combo Heat Aura is a standalone visual tint; F's Visual Feedback Pack establishes a shared `transientRings[]` array that C doesn't need but F's sub-features share.
- **F before D**: The transient ring array from F is available for D's portal eat-effect.
- **D before E (hard dependency)**: D introduces the shared `extraFoods[]` array with all its plumbing (eat-block iteration, `moveHunter` rejection, magnet skip, `drawFood` loop, snapshot serialization, `resetGame`/`resetWaveState` clear). E reuses this array for its 4 hoard foods — E cannot function without D's array infrastructure.

### Ideas Considered and Rejected

| Idea | Priority | Reason rejected |
|---|---|---|
| Snake Split (two-head power-up) | 5.7 | Risk 7 — touches the core movement/collision system; revisit when collision refactor lands |
| Daily Seed Leaderboard | 8.4 | Risk 5 — ghost tile exclusion in `generateFood` needs verification; revisit when arena ghost system is hardened |
| Prestige Perk Tree | 9.6 | 250 LOC + balance risk (scoreboard invalidation); revisit when prestige economy metrics exist |
| Keyboard Remapping | 9.8 | Risk 5 — ~30 keydown branches to migrate across ~600 lines; defer to a dedicated refactor cycle |
| Adaptive Quality Scaling | 6.0 | Risk 6 — rAF write-boundary sensitivity; revisit when frame-drop reports appear |
| Web Share API | 13.3 | Low impact (5); clipboard fallback works; revisit when mobile share is requested |
| Eat Squash-&-Stretch + Ripple | 15.75 | Touched the hot `drawSnake` head path; the F pack's ripple covers the eat moment more cheaply |
| Combo Chain Store | 14.0 | New DOM panel (9th cross-hide site) + combo milestone desync risk; revisit when combo economy is rebalanced |
| Hazard Zones | 10.5 | Overlaps with obstacle + shrink_zone; defer to v10 when hazard-specific gameplay is designed |
| Recap Card Stagger-In | 10.5 | Polish-only, no mechanic; revisit if budget allows after core features |

---

## Feature A: Save Data Export/Import

### Overview

All player progression (stats, achievements, cosmetics, diary, replays, quests, snapshots, settings, prestige, tokens) is localStorage-bound with zero export path. Add download-as-JSON and restore-from-upload to the Settings panel.

### Why It's Next-Level

A user clearing browser data, switching browsers, or hitting a storage quota loses everything. This is the single biggest data-safety gap — the progression systems are mature enough that players have meaningful investment to protect.

### Design

- Collect all `snake_*` keys via `Object.keys(localStorage).filter(k => k.startsWith('snake_'))`.
- Export: `Blob` + `URL.createObjectURL` + `<a download="snakes-backup-YYYY-MM-DD.json">`. Format: `{ format: 'snakes-backup', version: 1, exportedAt: ISO, keys: { ... } }`.
- Import: `<input type="file" accept=".json">` + `FileReader` → parse → confirm dialog → per-key `localStorage.setItem`. Version field enables future migration.
- Two buttons in `renderSettings()` (line ~1528) inside the existing `#settingsPanel` — no new panel, no cross-hide contract impact.
- New bare-name functions `exportSaveData()` / `importSaveData(file)` (module scope, become `window.*` for `onclick`).

### Risks

- Import overwrites localStorage — guard with a confirm dialog and a version check. Export is read-only.

---

## Feature B: Visibility-Safe Auto-Save

### Overview

The existing `visibilitychange` handler auto-pauses the game but does NOT call `saveSnapshot()`. Mobile crashes, OS-level tab suspension, and aggressive backgrounding silently lose in-progress runs.

### Why It's Next-Level

The v7 snapshot engine was meant to prevent data loss, but its trigger coverage is incomplete. This is a small, surgical fix that closes a real mobile data-loss gap.

### Design

- One addition to the `visibilitychange` handler (line ~7107): in the `document.hidden && gameState === 'playing'` branch, call `saveSnapshot()` before setting `gameState = 'paused'`.
- `saveSnapshot()` (line ~2362) already exists, is idempotent, and handles localStorage-unavailable gracefully. No new functions, no new state, no new DOM.

### Risks

- Extremely low. `saveSnapshot()` is already called from `autoSaveOnClose()` and `saveAndQuit()`. A third call site in the same condition is purely additive. The snapshot is only restored on explicit user action.

---

## Feature C: Combo Heat Aura

### Overview

The snake's body and a radial halo behind the head warm through neutral → yellow → orange → red as `comboCount` climbs, pulsing faster at higher combos — the snake itself becomes the combo meter.

### Why It's Next-Level

v7 added evolution glow (tier-gated) and v8 added hunter/bounty loops that sustain long combos, but the snake shows zero live combo state on the board — the only feedback is the off-canvas `comboDisplayEl` text. Closing this gap makes the most-played mechanic finally feel alive mid-run.

### Design

- `drawSnake()` body fill tint: per-segment hue lerp keyed on `comboCount` (neutral at 0, yellow at 3, orange at 7, red at 15+). Computed from module-scope `comboCount` — no new state.
- Head halo: a radial gradient drawn **before** the segment loop in `drawSnake()` (so the body renders on top of the halo center, leaving only the outer glow visible — matching the "behind the head" description). This is a different draw-order site than the shield aura (which draws *after* the body loop, on top of the head).
- **Z-order with existing head auras**: the head can carry up to three visual layers: evolution glow (`ctx.shadowBlur` per segment, set before fill, reset after), shield aura (`ctx.arc` stroke after body loop), and the new combo halo (radial gradient before body loop). The halo is drawn first (bottom layer), the body+evolution glow renders on top, and the shield aura renders last (top layer — the life-saving cue stays dominant).
- **Alpha capping**: halo `globalAlpha = 0.3 + 0.2 * comboFrac` (capped at 0.5), so it never fully occludes the evolution glow. When `shieldActive`, reduce halo alpha by 50% so the shield remains the dominant head cue.
- The halo draws at **absolute head coordinates** (like the shield aura at `snake.html:4443-4453`), NOT at local origin — the local-origin rule applies to food shapes only.
- Pulse frequency scales with `comboCount`, driven by `renderTime` (already passed to draw functions).
- Calm-mode gate: skip the halo pulse, keep the static tint (intensity-only gating at the choke point).
- `ctx.save()`/`ctx.restore()` discipline per AGENTS.md.

### Risks

- Low risk — pure additive tint, no new state, no new arrays, no game-logic writes. Calm-mode-safe by design. The only coordination needed is z-order with the evolution glow and shield aura, handled by draw order (halo first) and alpha capping.

---

## Feature D: Portal Food (Linked Pair Gates)

### Overview

When an `epic` food spawns, a second linked portal food spawns at a distant board location. Eating one teleports the **entire snake** to the other location as a short contiguous segment and grants the epic's bonus. Creates a risk/reward positioning decision: the portal exit may be near a rival or obstacle cluster.

### Why It's Next-Level

v8 added hunter food (fleeing prey) which enriched the food taxonomy; portal food extends it with a spatial mechanic that the existing epic tier underuses. No existing system provides repositioning — the snake is locked to contiguous movement. This is the lowest-risk high-impact food addition available.

### Design

- **Shared `extraFoods[]` array** (introduced by D, reused by E): module-scope `let extraFoods = []`. Each entry is a food object `{x, y, type, spawnTime, portalLink}`. This array holds portal food(s) and, during a Golden Hoard, the 4 bonus foods. All food-touching sites must iterate this array in addition to the primary `food`/`food2`:
  - **Eat-block** in `updateGame()`: after the primary `food` eat check, loop `extraFoods[]` — if `wrappedHead.x === ef.x && wrappedHead.y === ef.y`, eat that food.
  - **`moveHunter()` rejection list** (lines ~1704-1708): reject `extraFoods[]` tiles (same pattern as `food2` at line 1708) so hunter doesn't flee onto a portal/hoard food.
  - **Magnet pull**: skip `extraFoods[]` entries with `type === 'portal'` (same as hunter), but pull `type === 'bonus'` hoard foods (they're normal bonus foods, just in the array).
  - **`drawFood()`**: after drawing the primary `food` and `food2`, loop `extraFoods[]` and draw each (portal foods use the portal visual; hoard bonus foods use the existing `bonus` case).
  - **Snapshot serialization** (lines ~2279-2280): add `extraFoods` as an additive field (no `SNAPSHOT_VERSION` bump per v8 F pattern). Serialize as array of `{x, y, type, spawnTime, portalLink}`.
  - **`resetGame()` AND `resetWaveState()`**: clear `extraFoods = []`.
- `generateFood()`: when an epic food spawns, also spawn a linked portal food via `findFreeTile` with a min-distance constraint (≥ 10 tiles from the epic). Push the portal food into `extraFoods[]`. The epic food gets a `portalLink` ref to the portal food (and vice versa).
- `FOOD_TIERS`: add a `portal` flag to the epic tier, or add a new `portal` food type with a low weight.
- **Body handling on portal eat** (Phoenix-style full re-anchor): when the eaten food has `portalLink`, teleport the **entire snake** to the portal exit as a short contiguous segment: `snake = [{x: exit.x, y: exit.y}]` (single-tile), then grow back to a minimum length of 3 by pushing trailing tiles in the opposite direction of `currentDirection`. This follows the Phoenix Brew resurrection pattern (`snake[0]` set + body truncated, lines ~5557/5602) — the body is NOT left stretched across the board. Evolution-tier-gated length bonuses (Swift/Serpentine/Titan/Apex) re-apply on the new short body. This is a design decision: portal food is a "rebirth" — repositioning at the cost of body length.
- Spawn particles at both the eat site and the exit site. Remove both foods (the eaten one and its `portalLink` partner) from `extraFoods[]`.
- **Visual**: portal food renders as two concentric counter-rotating arcs (distinct from the bonus food's single pulsing circle), drawn at local origin per D1 discipline. A **prominent dashed purple line** (matching the epic tier color `#AA44FF`, always-on, static, calm-mode-safe) connects the pair when both are on-screen — not a "faint" line. A small arrow on the portal food points toward its twin so the player can assess the exit before committing.
- **Player onboarding**: first-time toast `queueToast('🌀 Portal food! Eat to teleport to its twin.', 3000)` — one-shot per session via a `snake_has_seen_portal` flag (mirrors the `snake_has_played` onboarding pattern). Add portal food to the welcome overlay food panel.
- `resetGame()`: clear portal state (`extraFoods[]` cleared, `snake_has_seen_portal` persists).
- Excluded from Walled mode (non-wrapping teleport conflicts) — gate via `MODE_CONFIG[gameMode].wrap`. Portal foods do not spawn in Walled mode; `extraFoods[]` stays empty.
- Echo-brew `food2` spawn: coerce `food.type === 'portal' ? 'common' : food.type` (same pattern as hunter) so a static portal food2 can't spawn.

### Risks

- **Body handling is the critical design decision**: teleporting `snake[0]` alone (the original plan) leaves a non-contiguous body that causes instant self-collision death on the next tick. The Phoenix-style full re-anchor (teleport entire snake as short segment) avoids this — the snake rebirths at the exit with a short body. This changes portal from "reposition" to "rebirth", which is a deliberate design call (the player trades length for repositioning).
- Must ensure the teleport destination is valid (not on snake body, obstacle, or rival — `findFreeTile` guarantees this at spawn, but the board may change between spawn and eat; if the destination is now occupied, snap to the nearest free tile via `findFreeTile`).
- Magnet pull skips portal food (`type !== 'portal'`), same as hunter. Hoard bonus foods in `extraFoods[]` ARE pulled by magnet.
- `moveHunter()` must reject `extraFoods[]` tiles to prevent hunter-portal stacking.

---

## Feature E: Golden Hoard Event (Timed Food Bonanza)

### Overview

Every ~90 seconds of active play, a 15-second "Golden Hoard" event fires: 4 bonus foods spawn simultaneously into `extraFoods[]`, score multiplier ×2, and the rival snake (if active) freezes. Announced with a banner toast + screen tint. Creates rhythm/pacing peaks within a run.

### Why It's Next-Level

v8's bounty rush proved that tick-counted timed events work cleanly within the dual-loop architecture. A periodic environment event (not a player contract) is the natural next layer and addresses the flat mid-run pacing that bounty alone doesn't fix.

### Design

- **Depends on D's `extraFoods[]` array**: the 4 hoard bonus foods are pushed into `extraFoods[]` (introduced by Feature D). All plumbing (eat-block iteration, `moveHunter` rejection, magnet, `drawFood`, snapshot) is already in place from D.
- Game-logic state: `hoardActive` (bool), `hoardTimer` (ticks remaining), `hoardTickCounter` (ticks since last event). `HOARD_INTERVAL = 5400` ticks (~90s at 60ms tick), `HOARD_DURATION = 900` ticks (~15s).
- `updateGame()`: increment `hoardTickCounter`; when it hits `HOARD_INTERVAL` and `!hoardActive && gameState === 'playing'`, activate: set `hoardActive = true`, `hoardTimer = HOARD_DURATION`, spawn 4 `bonus` foods via `generateFood` (forced type) into `extraFoods[]`, set `scoreMultiplier = 2` (new module-scope `let`, default 1), freeze rival. Announce via `queueToast('⚡ Golden Hoard! 2x score!')` + `queueGameEffect('flash', ...)`.
- **Rival freeze**: gate BOTH `updateRival()` AND the rival respawn-timer decrement block (lines ~5961-5968) on `!hoardActive`. A dead rival's respawn timer must NOT tick during hoard — otherwise the rival respawns mid-hoard and is frozen in place (still collidable). The freeze is total: no movement, no respawn.
- **`scoreMultiplier` integration** (applied inside `addScore()`): add `scoreMultiplier` as a single outer multiplier in `addScore()` (line ~1636): `score += Math.round(amount * multi * scoreMultiplier)`. This composes once, cleanly, with the existing chain (pinnacle/overcharge/gauntlet/golden_food). Document the stacking: `scoreMultiplier` multiplies the final `amount * multi` result.
  - **Golden Age mutator interaction**: the `golden_food` mutator (×3) and `scoreMultiplier` (×2) stack multiplicatively (×6). To prevent trivializing scoring, **cap the effective food multiplier at ×3** during hoard when `golden_food` is active: `const effectiveHoardMult = (goldenFoodActive ? Math.min(scoreMultiplier, 1.5) : scoreMultiplier)` — so Hoard + Golden Age = ×4.5 max, not ×6. State this in the code comment.
  - **Scope**: `scoreMultiplier` applies to ALL `addScore()` calls (tier.pts, combustion bonus, combo bonus, food2, bounty reward) since it's inside `addScore()`. This is intentional — the Hoard is a global score frenzy. However, bounties are suppressed during Hoard (see below), so bounty rewards don't fire during the multiplier window.
- **Bounty serialization during Hoard**: when `hoardActive` becomes true, **suppress new bounty spawns** for the Hoard duration (hold `bountyTickCounter` at 0 while `hoardActive`). Any *currently active* bounty continues but its urgency ring (F2) is suppressed during the Hoard so only one timed-event UI is prominent. After the Hoard ends, resume bounty cadence. The Hoard banner toast and bounty ring are vertically offset (Hoard banner at `CANVAS_HEIGHT/2 - 30`, bounty ring stays at `y=38`) so they don't visually collide.
- During hoard: `hoardTimer` decrements each tick. On expiry: `hoardActive = false`, `scoreMultiplier = 1`, unfreeze rival (resume respawn timer), `hoardTickCounter = 0`. Soft toast: `queueToast('Hoard ended')`.
- Visual: golden tint overlay via `drawPostFX()` (add a `hoardActive` branch to the existing post-FX function). Calm-mode gate: skip the tint, keep the score multiplier (logic unchanged).
- Reset in `resetGame()` (clear `hoardActive`, `hoardTimer`, `hoardTickCounter`, `scoreMultiplier = 1`). `resetWaveState()` is NOT needed — E is excluded from Gauntlet (see mode gating below), so the resetWaveState line is unnecessary and is not added.
- **Snapshot engine**: add `hoardActive`/`hoardTimer`/`hoardTickCounter`/`scoreMultiplier` as additive fields (no `SNAPSHOT_VERSION` bump). The 4 hoard foods are in `extraFoods[]` (snapshotted by D's infrastructure). On restore, if `hoardActive` is true, the foods are restored from `extraFoods[]` — the bonanza resumes correctly.
- No session-end hook needed — the event dies with the run, like bounty.
- **Mode gating**: active in Classic, Time Attack, Daily, Snap. Excluded in Zen (no time pressure), Walled (non-wrapping board), Painter (coverage scoring, not points), Gauntlet (wave objectives). Snap is included because it has `wrap:true` and `scoreIs:'points'` (identical structure to Time Attack); its shrink mechanic doesn't conflict with a food bonanza (shrink reduces the board, which makes the bonanza more intense, not broken).

### Risks

- **`scoreMultiplier` stacking**: the multiplier composes inside `addScore()` with the existing chain. The Golden Age cap prevents the worst-case ×6 trivialization. The combo economy doubles during Hoard (combo bonus goes through `addScore`), which is intentional — the Hoard is a frenzy window. The optimal strategy ("survive until the 2nd Hoard") is mitigated by the 90s interval and 15s duration (the Hoard is 1/6 of the run, not farmable).
- **Bounty + Hoard overlap**: suppressed by holding bounty spawns during Hoard and suppressing the urgency ring. The player sees only one timed-event UI at a time.
- **Rival respawn during Hoard**: gated by `!hoardActive` on the respawn-timer block — a dead rival stays dead for the Hoard duration and respawns after.

---

## Feature F: Visual Feedback Pack (Hunter Dust + Bounty Ring + Power-Up Shockwave)

### Overview

Three small visual enhancements that share a `transientRings[]` array (delta-decayed, capped, calm-gated, drained in `animateVisuals` between particles and floaters):

1. **Hunter Flee-Dust Trails**: Hunter food leaves a brief fading dust puff at each vacated cell so the player can read the fleeing prey's path.
2. **Bounty Ring Urgency + Cash-In Burst**: The bounty countdown ring pulses (radius oscillation + color shift to red) when `ticksLeft < 30%` of `windowTicks`, and a particle burst + ring pop fires at the head when a bounty banks.
3. **Power-Up Activation Shockwave**: When shield/magnet/slowMo activates, a radial shockwave ring + tier-colored particle burst fires at the head.

### Why It's Next-Level

v8 shipped bounty rush (passive ring), hunter food (teleporting prey with no trail), and power-up pickups (silent activation). These are the three v8 moments that most need spatial juice. The shared `transientRings[]` array (mirroring the `deathFragments` pattern) avoids parallel arrays.

### Design

- **Shared infrastructure**: `transientRings[]` array — each entry `{ x, y, radius, maxRadius, alpha, color, lineWidth, decay, type }`. Drained in `animateVisuals()` timer-decay section with delta time. Rendered between particles and floaters. Capped at 50. Reset in `resetGame()` alongside `deathFragments`. `ctx.save()`/`ctx.restore()` around the render block.
- **Hunter Dust** (F1): in the hunter move block (`HUNTER_MOVE_INTERVAL=3` site in `updateGame()`), on each move, push the previous `{x, y}` into `transientRings[]` with `type: 'dust'`, small `maxRadius`, brown color. Calm-mode gate: reduce to 1 puff or skip. Determinism-safe: dust is pure visual (rAF-only), never affects snapshots/replays.
- **Bounty Ring Urgency** (F2): the bounty ring render in `animateVisuals()` (`snake.html:3743-3766`) — read-only use of `activeBounty.ticksLeft`/`windowTicks` (already read there; rAF write-boundary respected — no `activeBounty` writes). When `ticksLeft < 0.3 * windowTicks`: oscillate radius (`baseRadius + Math.sin(renderTime * 0.01) * 3`), shift color from green/yellow to red. On bounty completion in `tickBounty()`: push a ring into `transientRings[]` at the head position + `spawnParticles()` burst. Calm-mode gate: skip the urgency oscillation only — the countdown arc (the `frac`-based stroke) is information, not motion, and is NOT gated. Only the new oscillation is calm-mode-gated.
- **Power-Up Shockwave** (F3): in the power-up activate `switch` (`snake.html:1797` pickup, `snake.html:4769` gauntlet wave_shield) — push a one-shot shockwave into `transientRings[]` at the head + `spawnParticles()` (already the established burst API, density-slider-scaled). Calm-mode gate: skip the shockwave ring, keep the particle burst at reduced count.

### Risks

- The `transientRings[]` array is visual state only — no game-logic writes from the rAF loop. All pushes happen in the tick loop (`updateGame`/`tickBounty`/activate switch) or in `animateVisuals` (read-only render). Calm-mode gates at each spawn site, not in the render.

---

## Feature G: Diary Seed Replay

### Overview

Add a one-click "Retry Seed" button to diary entries that have a seed, which populates the seed field, sets `activeSeed`/`seedPrng`, and returns to the idle screen ready to start — eliminating the manual copy-paste workflow.

### Why It's Next-Level

The diary already stores seeds; making those seeds actionable closes the loop from "review past runs" → "immediately retry the same conditions." A small, surgical quality-of-life improvement that leverages existing infrastructure.

### Design

- `renderDiary()` (line ~446): add a "↻ Retry Seed" button (only shown when `entry.seed` is non-empty) in the expandable detail section. `onclick` calls `retrySeedFromDiary(seed)`.
- New `retrySeedFromDiary(seed)` bare-name function (module scope, becomes `window.*`): sets `seedField.value = seed`, `activeSeed = seed`, `seedPrng = mulberry32(hashString(seed))` — mirroring the **input handler's** hash computation at line ~7168 (NOT the snapshot-restore variant at line ~2408 which uses a different `.split('').reduce(...)` form). Then calls `closeAllPanels()`, sets `gameState = 'idle'`, calls `drawGame(1)` + `updateMenuFooter()`.
- No new state, no new DOM panel.

### Risks

- Very low. The seed-setting logic already exists and is well-tested. The only new code is the button in `renderDiary()` and the 10-line `retrySeedFromDiary()` function. Must use `hashString(seed)` (the input-handler form), not the snapshot-restore reduce form.

---

## Cross-Feature Architecture Compliance (all seven)

- Game-logic writes stay in the tick loop; rAF loop reads/decays visual timers only.
- All new canvas text/shape blocks use `ctx.save()`/`ctx.restore()`; food shapes draw at local origin. The combo halo (C) draws at absolute head coords (like the shield aura) — the local-origin rule applies to food shapes only.
- Session-end features hook BOTH `gameOver()` and `endZenSession()` — none of the v9 features need session-end hooks (A is settings-only, B is auto-save trigger, C-G are mid-run or rAF-local).
- Per-run state resets in `resetGame()` (and `resetWaveState()` where gauntlet-relevant: `extraFoods[]`, `transientRings[]`; `hoardActive`/`hoardTimer`/`hoardTickCounter` reset in `resetGame()` only since E is excluded from Gauntlet).
- Screen flashes go through `queueGameEffect()`/`queueRAFEffect()`, never direct `flashOverlay` writes.
- Food distribution changes go through `FOOD_TIERS` only. Portal food is a new type/flag in `FOOD_TIERS`; hoard foods are forced `bonus` type.
- New DOM elements: none (A uses existing settings panel, G uses existing diary panel). No new cross-hide contract sites.
- New persistence keys go through saveManager with the `snake_` prefix — only `snake_has_seen_portal` (D's first-time toast flag).
- Module-scope no-IIFE: no new module-init expressions referencing undeclared identifiers; `node test-bugfixes.mjs` "No JS errors on load" is the first smoke check after every feature.
- Snapshot engine: additive fields only (D: `extraFoods[]` with `portalLink`; E: `hoardActive`/`hoardTimer`/`hoardTickCounter`/`scoreMultiplier`), no `SNAPSHOT_VERSION` bump.

## Out of scope

- Snake Split power-up (risk 7 to collision core; revisit when collision refactor lands).
- Prestige Perk Tree (250 LOC + balance risk; revisit when prestige economy metrics exist).
- Keyboard Remapping (risk 5, ~30 branch migration; defer to a dedicated refactor cycle).
- Daily Seed Leaderboard (ghost tile exclusion needs verification; revisit when arena ghost system is hardened).
- Combo Chain Store (new DOM panel + combo milestone desync risk; revisit when combo economy is rebalanced).
- Adaptive Quality Scaling (rAF write-boundary sensitivity; revisit when frame-drop reports appear).
- Web Share API (low impact; revisit when mobile share is requested).