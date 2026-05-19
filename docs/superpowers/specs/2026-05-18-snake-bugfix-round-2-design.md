# Snake Bugfix Round 2 — Design Document

> **Status:** Revised
> **Date:** 2026-05-18
> **Repository:** `/Users/jeko/tmp/snakes/snake.html`
> **Context:** This spec targets bugs introduced or exposed by the Phase A-D progression overhaul (combo unlock, achievements, pinnacle, overcharge, stat milestones, mobile polish)
> **Reviews:** 3 (Correctness, Risk, Completeness) — all applied.

## Bug Audit Results

Six independent agents (3 review + 3 explore) analyzed the codebase identifying ~30 potential issues. After triage, 10 confirmed bugs are targeted. They fall into 5 groups:

| Group | Bugs | Severity |
|-------|------|----------|
| 1. Persistence | saveAllState incomplete, pinnacle doesn't save xpOvercharge, daily attempts stale | 🔴 Critical |
| 2. Rendering Logic | Body segment interpolation, rival pathfinding | 🟡 Moderate |
| 3. Gameplay | Combo flash priority bypass, updateScoreDisplay triple-call, speed boost on resume | 🟡 Moderate |
| 4. Minor UX | Common food label, pixelated retina, overflow:hidden | 🟡 Moderate |
| 5. Idle Screen Layout | 3 collision zones between daily challenge hardcoded Y and currentY flowing layout | 🔴 Critical |

## Core Principles

1. **Fix don't refactor** — touch only the buggy lines. No restructuring, no new features.
2. **No scope creep** — each fix is scoped to 2-15 lines. If a fix needs >15 lines, split it.
3. **Verify each fix** — each task is reviewed before moving to the next.

## Bug 1: Idle Screen Layout Collision

### Problem
The idle screen mixes hardcoded Y positions (daily challenge info at `CANVAS_HEIGHT - 100`, `-82`, `-64`, `-46`) with a `currentY` flowing layout (pinnacle/overcharge/XP/prestige prompt starting at `CANVAS_HEIGHT - 95`). When both sections are visible (daily mode + prestige/pinnacle), they overlap in the Y 300-360 region. 3 separate collision zones exist, plus the bottom instruction text at `CANVAS_HEIGHT - 40` overlaps `currentY` content.

### Fix
Integrate the daily challenge section into the `currentY` flow. Replace 4 hardcoded Y offsets with a single `y = currentY; currentY += 16` pattern. Also integrate the bottom instruction text line into `currentY` flow. This means removing:
- `CANVAS_HEIGHT - 100`, `-82`, `-64`, `-46` for daily info
- `CANVAS_HEIGHT - 40` for instruction text
- The prestige/pinnacle/overcharge/XP/prestige-prompt all use `currentY`

The final idle screen layout in order:
1. Mode selection list (lines 1571-1586, hardcoded at Y 130+ — these are at the top, don't touch)
2. Daily challenge info (only if `gameMode === 'daily'`) — move to `currentY` flow
3. Prestige/Pinnacle badge — already uses `currentY`
4. Overcharge — already uses `currentY`
5. Level/XP — already uses `currentY`
6. Prestige/Pinnacle prompt — already uses `currentY` 
7. Instruction text — move to `currentY` from `CANVAS_HEIGHT - 40`
8. Mobile hint — move to `currentY` from `CANVAS_HEIGHT - 24`

## Bug 2: Persistence Issues

### Problems
- `saveAllState()` only saves `snake_pinnacle`, `snake_xp_overcharge`, and `snake_stats` — misses `snake_xp` and `snake_prestige`
- Pinnacle activation (keydown X at prestige >= 5) does NOT save `xpOvercharge` to localStorage — if browser crashes between pinnacle and next game, overcharge is lost
- Daily attempts are only synced at page boot (`syncDailyState()` at line 3203) — if page stays open past midnight, in-memory `dailyAttempts` is stale

### Fixes
- **2a:** Add `saveManager.set('snake_xp', xp)` and `saveManager.set('snake_prestige', prestigeLevel)` to `saveAllState()`
- **2b:** Add `saveManager.set('snake_xp_overcharge', xpOvercharge)` to the pinnacle branch (else clause of X key handler)
- **2c:** Re-call `syncDailyState()` at the top of `startGame()` (before checking `dailyAttempts`) so daily state refreshes even after midnight

## Bug 3: Body Segment Interpolation Wrong Index

### Problem
In `drawSnake()`, when no food is eaten (no growth), the snake body segments' indices shift by 1 relative to `prevSnake`. The code at the else-if branch uses `prevSnake[index]` for body segments in the non-food case, but it should use `prevSnake[index - 1]` (same as the `snakeGrew` branch). This causes a persistent ~20px wobble on every body segment.

### Fix
In the body interpolation else-if branch (search for `prevSnake[index]` in the non-snakeGrew, non-head case), change `prevSnake[index]` to `prevSnake[index - 1]` in BOTH the condition AND the array access in the non-snakeGrew body interpolation branch.

## Bug 4: Rival AI Non-Wrapping Food-Seeking

### Problem
Rival pathfinding uses raw coordinate subtraction to find the nearest food. When food is closer across a wrap boundary (e.g., rival head at x=380, food at x=20), the rival moves away from the food instead of toward it.

### Fix
In `updateRival()`, in the `nearestFood` pathfinding section, apply wrapped delta before choosing direction. Specifically, compute `dx_food` and `dy_food` and then apply: `if (Math.abs(dx_food) > CANVAS_WIDTH/2) { dx_food = dx_food > 0 ? dx_food - CANVAS_WIDTH : dx_food + CANVAS_WIDTH; }` (same for `dy_food`). This is the same pattern used by the magnet power-up.

## Bug 5: Common Food 'C' Label

### Problem
Phase D added `common: 'C'` to the food labels. The comment above it says "Letter labels for non-common types" — the original intent was that common food should be visually distinct by NOT having a letter, making labeled foods stand out. The 'C' on 40% of all food spawns creates visual clutter and reduces legibility of the food shape.

### Fix
Remove `common: 'C'` from labels. Keep `speed: 'S'`.

## Bug 6: image-rendering: pixelated Degrades Canvas Text/Arcs

### Problem
Phase D added `image-rendering: pixelated` to the canvas CSS. The game uses `ctx.arc()` for circles, Arial font text, and rotated/curved shapes — all benefiting from sub-pixel anti-aliasing. With `pixelated`, these render with jagged stairstepping on retina displays. The 10px food labels and overlay text become significantly harder to read at 2x+ scaling.

### Fix
Remove `image-rendering: pixelated` from the `#gameCanvas` CSS. The original rendering (default 'auto') provides proper anti-aliasing for the game's vector content.

## Bug 7: body overflow:hidden Missing

### Problem
No `overflow: hidden` on the `<body>` element. On small mobile phones, the total content height (h1 + canvas + score + d-pad) can exceed the viewport, causing the page to scroll vertically. This is disastrous on mobile because touch events on the canvas trigger both swipe controls AND page scrolls, creating erratic input.

### Fix
Add `overflow: hidden;` to the `body` CSS block.

## Bug 8: Combo Milestone Flash Priority Bypass

### Problem
The combo milestone flash at line ~2341 writes `flashOverlay = { color, alpha, priority: ... }` unconditionally. It does NOT check the current `flashOverlay.priority` before overwriting. If a level-up flash (priority 'critical') is active, the combo flash replaces it for ~1 frame until the rAF loop re-asserts the critical flash.

### Fix
Guard the combo milestone flash assignment:
```js
if (!flashOverlay || flashOverlay.priority !== 'critical') {
    flashOverlay = { color, alpha, priority: comboCount >= 10 ? 'high' : 'normal' };
}
```

## Bug 9: updateScoreDisplay Triple-Called

### Problem
Every food-eat triggers `updateScoreDisplay()` 3 times:
1. From `addScore(tier.pts)` — internal call
2. From `addScore(comboBonus)` — internal call  
3. Direct call at line ~2399

Each call writes to localStorage. This is wasteful and the line 2399 call is redundant.

### Fix
Remove the redundant `updateScoreDisplay()` at line ~2399 AND add `updateScoreDisplay()` call in `addScore`'s Zen-mode branch (after `score = snake.length`) so Zen mode still updates the score display.

## Bug 10: Speed Boost Dropped on Pause/Resume

### Problem
`resumeGame()` unconditionally sets `tickInterval = getEffectiveSpeed()`, which drops the -30 speed boost offset. The `speedBoostCounter` continues counting down, and at 0 restores `tickInterval = getEffectiveSpeed()` (which is a no-op). Player loses ~2s of speed boost per pause.

### Fix
In `resumeGame()`, check `speedBoostCounter` before setting `tickInterval`:
```js
if (speedBoostCounter > 0) {
    tickInterval = Math.max(MIN_SPEED, getEffectiveSpeed() - 30);
} else {
    tickInterval = getEffectiveSpeed();
}
```

## Scope Boundaries

NOT fixing (deferred):
- Rival defeat toast bypasses queueToast — cosmetic, minor
- sessionScore || score falsy coercion — extremely rare (score=0)
- ASCENDED uses global prestigeLevel not ctx — works correctly today

Also NOT fixing:
- Body scroll for non-mobile viewports (mobile-only fix)
- Rival spawn body not checking obstacles (extremely rare, low impact)
- generateFood off-by-one iteration (performance, not correctness)
- Toast queue with 0-duration (latent, no current trigger)
- localStorage quota handling (out of scope)
- Shield consumed before rival check (design choice, documented in AGENTS.md)

## Implementation Order

All bugs are independent. Implementation order by risk and priority:
1. **Group 1 — Persistence (Bug 2):** Data integrity first. Without correct saves, progression loss makes all other bugs worse.
2. **Group 2 — Interpolation + Rival pathfinding (Bugs 3, 4):** Visual/logic bugs that affect every frame.
3. **Group 3 — Combo flash + updateScoreDisplay + speed boost (Bugs 8, 9, 10):** Gameplay bugs with targeted fixes.
4. **Group 4 — Minor UX (Bugs 5, 6, 7):** Low-risk, isolated CSS/config changes.
5. **Group 5 — Idle Screen Layout (Bug 1):** Highest risk (large layout restructure), do last.