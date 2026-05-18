# Snake Evolved v3 — Design Spec

> **Status:** Final (reviewed)
> **Date:** 2026-05-18
> **Repository:** /Users/jeko/tmp/snakes/snake.html (single-file HTML/JS/CSS, ~2564 lines)

## Context

This design targets an already-feature-rich Snake game with: 5 game modes (Classic, Time Attack, Zen, Daily, Snap), XP/levels/prestige (5 levels), 35+ achievements, 6 food tiers (common/uncommon/rare/epic/bonus/speed), power-ups (shield/magnet/slow-mo), AI rival snake, cosmetics (skins/grids/trails/death effects/borders), particle system, screen shake, combo system, wall wrapping, input buffering, auto-pause, sound effects, touch controls, daily challenges with streaks, and per-mode high scores.

## Goals

1. **Fix critical bugs** that cause incorrect behavior or crashes
2. **Rebalance gameplay** for fairness, fun, and depth
3. **Add high-visibility QoL features** that dramatically improve player experience
4. **Improve mobile + accessibility** with minimal code changes
5. **Clean up code architecture** for maintainability

## Feature Package

### 1. Critical Bug Fixes

| # | Bug | Location | Issue | Fix |
|---|-----|----------|-------|-----|
| 1 | Streak day-boundary | Line 562 | `Math.round(diffMs/86400000)` rounds 0 on ~2hr diff across midnight | Use `Math.floor` — better yet, compare date string directly |
| 2 | Prestige load crash | Line 121 | `localStorage.getItem('snake_prestige')` has no try/catch | Wrap in try/catch like all other localStorage reads |
| 3 | Visibility no auto-resume | Lines 2543-2553 | Tab re-focus doesn't resume; corrupts sessionPauseStart | Add `!document.hidden` handler; extract `resumeGame()` helper to share with pause key handler |
| 4 | PowerUp spawns on rival | Lines 415-424 | `spawnPowerUpPickup()` excludes snake/obstacles/food but not rival | Add rival snake tile check to spawn loop |
| 5 | Rival-eats-last-food calls gameOver | Line 827 | `gameOver()` called when rival eats final food (`generateFood()` returns null) | Don't call gameOver; just set `food = null` — food regenerates next tick if space opens |
| 6 | Food/obstacle ordering | Lines 511-512 | `generateFood()` called BEFORE `generateObstacles()` in resetGame | Swap: generate obstacles first, then food |

### 2. Gameplay Rebalance

**Epic Food Buff** — Epic (3% weight, 30pts, 55XP) is worse than Bonus (15% weight, 30pts, 60XP). Fix:
- Epic → 50 points, 70 XP
- Epic → glow intensity increased from 8 to 14 (matching rare's visual weight)
- NO "epic burst" mechanic — descoped per review: the single-food model doesn't support converting "nearby food tiles" without a major food system redesign

**Zen Mode XP** — Zen has `earnXP: false`, punishing relaxation players. Fix:
- Enable XP in Zen mode at a fixed rate: 10 XP per food eaten (no combo multiplier)
- No tick-based XP (avoids making Zen the best XP farm)
- This rewards participation without creating a dominant grind strategy

**Shield Nerf** — Shield (8s invincibility) is ~2x the duration of Magnet (5s) and Slow-Mo (4s). Fix:
- Set `POWERUP_TYPES.shield.duration = 6000` (replace current `duration: 0`)
- Fix line 437 to use `POWERUP_TYPES.shield.duration` instead of hardcoded `8000`
- Fix line 1691 to use `POWERUP_TYPES[powerUpType].duration` instead of hardcoded `powerUpType === 'shield' ? 8000 : ...`
- This removes the last hardcoded-shield-duration workaround

**Snap Mode Curve** — Duration decays 20% per level, becoming unplayable at level 10+ (>80s). Fix:
- 12% decay per 12 seconds instead of 20% per 10 seconds
- Floor at 800ms minimum duration
- No cap on level progression — skilled players can push further

**Combo Score Bonus** — Combo only multiplies XP, not score. Fix:
- Add `score += Math.floor(comboCount * 2)` on combo eats in the eat block
- At 5× combo, that's +10 points — modest enough not to dominate scoring, but rewarding skilled chaining

### 3. Quality of Life

**Quick Restart** — After game over, pressing ENTER immediately starts a new game (calls `resetGame(); startGame();`). ESC returns to idle menu. Saves one keypress per death. State machine: gameover→Enter→playing, gameover→Esc→idle, idle→Enter→playing.

**In-Game Keyboard Reference** — Press H during any state to show a 2-second semi-transparent overlay with all keyboard shortcuts:
- Arrows/WASD = Move
- P/Space = Pause/Resume
- M = Mute
- H = Help
- Tab = Stats
- F = Achievements
- C = Cosmetics
- Enter = Start/Restart
The H key handler must be placed BEFORE the `if (gameState !== 'playing') return` guard (line 2441) to work during all states.

**Food Type Legend** — Press L on idle menu to show all 6 food types with colors, shapes, points, XP, and drop weight. Helps new players understand the food system. Reuses same color/shape constants from drawFood().

**Mute Visual Indicator** — When muted, show 🔇 in the top-right corner of the canvas (drawn in `drawGame()`). Mute state persists in localStorage as before.

**Mute Toggle Feedback** — Pressing M shows a 1.5s toast via `queueToast()`: "🔇 Muted" or "🔊 Sound On". Must use the toast queue (not raw setTimeout) to avoid timer-sharing conflict with achievement/level-up toasts.

**XP Progress Bar** — Replace text-only XP display with canvas-rendered progress bar: "Lv.5 ██████░░░░ 1200/1500". Draws in the canvas HUD area (consistent with time-attack timer, snap bar, power-up HUD). On prestige (XP resets to 0), show "Lv.1 ⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 0/100 — Prestiged!"

**Daily Challenge HUD** — During Daily mode gameplay, show challenge description at top of canvas with progress: "🎯 Score 200+ points | 145/200". Requires adding a `progressKey` field to each DAILY_CHALLENGES entry so the HUD can read the relevant stat from game state.

### 4. Mobile + Accessibility

**Viewport Meta Tag** — Add `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">` (NOT `user-scalable=no` — that's an accessibility violation per WCAG 2.1 SC 1.4.4). Prevents auto-zoom on mobile while allowing users with low vision to zoom.

**Haptic Feedback** — Add `navigator.vibrate()` calls:
- 15ms on eat
- 30ms on death
- 20ms on power-up collect
Guard with `if (navigator.vibrate)`. Throttle to max once per 300ms to prevent "continuous buzz" on rapid eats. Note: no-op on iOS Safari (no Vibration API support).

**Colorblind-Friendly Food Shapes** — Verify every food type has a DISTINCT shape in drawFood():
- Common: filled circle ✓
- Uncommon: diamond ✓
- Rare: up-triangle ✓
- Epic: hexagon ✓ (make hexagon more distinct from circle at small sizes by increasing line count/larger radius)
- Bonus: pulsing circle ✓ (add a distinctive "pulse ring" animation that alternates with the filled circle)
- Speed: double chevron >> ✓

**Food Labels — Text Outline Instead of Dark Circle Background** — Replace the 10px dark-circle background behind food letter labels with white text + thin black `ctx.strokeText()` outline. At 20px tile sizes, keep labels at 10px bold. Speed food already has distinctive chevrons — no label needed there (avoids visual clutter).

**Snap Timer Accessibility** — Supplement the green/yellow/red ring timer (color-only) with:
- Text: "SNAP LV.N" with matching color
- Percentage text under the ring

### 5. Code Architecture

**drawTrails() Data-Driven Refactor** — Replace 6 nearly-identical `if (cosmetics.trace === ...)` blocks in drawTrails() with a single config-driven loop. Config object name: `TRAIL_RENDER_CONFIG` (NOT `TRAIL_EFFECTS` — avoids collision with existing `TRACE_EFFECTS` cosmetics enum at line 214).

```js
const TRAIL_RENDER_CONFIG = {
  trace_ghost:   { alphaStart:0.15, alphaDecay:0.05, color: (idx, skin) => skin.head==='rainbow' ? '#00FF00' : skin.head },
  trace_fire:    { alphaStart:0.30, alphaDecay:0.10, color: (idx) => ['#FF6600','#CC3300','#880000'][idx] },
  trace_neon:    { alphaStart:0.25, alphaDecay:0.08, color: () => '#00FFFF' },
  trace_rainbow: { alphaStart:0.25, alphaDecay:0.08, color: (idx) => 'hsl('+((idx*20)+Date.now()*0.05)%360+',100%,50%)' },
  trace_galaxy:  { alphaStart:0.20, alphaDecay:0.06, color: (idx) => 'hsl('+(Date.now()*0.03+idx*30)%360+',80%,60%)' },
  trace_streak_3: { alphaStart:0.25, alphaDecay:0.08, color: () => '#FF6B35' },
};
```

Note: `trace_streak_3` "Ember Trail" (line 222) exists in the cosmetics enum but has NO rendering block in the current code — it's invisible. This refactor adds it. `trace_sparkle` is particle-only (rendered in `updateGame()`) and stays there.

**wrapPosition() Consistency** — Replace inline wrapping math at:
- Lines 763-764 (rival test position)
- Lines 775-778 (rival escape position)  
- Lines 797-799 (rival new head)
- Lines 1934-1935 (magnet pull food position)
with calls to the existing `wrapPosition()` function (line 623).

Note: wrapping logic in `drawSnake()` (lines 1401-1403, 1412-1413, 1417-1418) and `drawRival()` (lines 1521-1522, 1527-1528) uses a DIFFERENT heuristic (detecting wrap via `Math.abs(delta) > CANVAS_WIDTH/2`) and is NOT replaceable by wrapPosition. These stay as-is.

**finalizeSession() Extraction** — Extract only the shared bookkeeping from `gameOver()` and `endZenSession()` into a small helper:

```js
function finalizeSession() {
    sessionTimeAlive = Date.now() - sessionStartTime - sessionPausedTime;
    stats.gamesPlayed++;
    stats.totalScore += score;
    stats.totalDeaths++;
    stats.totalTimePlayed += sessionTimeAlive;
    if (score > stats.maxScore) stats.maxScore = score;
    if (sessionTimeAlive > stats.longestTimeAlive) stats.longestTimeAlive = sessionTimeAlive;
    if (snake.length > stats.longestLength) stats.longestLength = snake.length;
    saveAllState();
    if (score > (modeHighScores[gameMode] || 0)) {
        modeHighScores[gameMode] = score;
        try { localStorage.setItem('snake_mode_highs', JSON.stringify(modeHighScores)); } catch(e) {}
    }
    drawGame(1);
    visualDirty = true;
}
```

Each function then calls `finalizeSession()` then does its unique behavior (achievements, particles, sounds for `gameOver()`; `zenActive = false` for `endZenSession()`). NOT an options-bag approach — avoids accumulating booleans.

**restartGameInterval() Helper** — The pattern `clearInterval(gameInterval); gameInterval = setInterval(updateGame, tickInterval);` appears at 6 locations (lines 447, 463, 1858, 1864, 1875, 2404). Extract into:

```js
function restartGameInterval(speed) {
    clearInterval(gameInterval);
    gameInterval = setInterval(updateGame, speed);
}
```

This eliminates the dangerous copy-paste pattern where the interval ID could be stale.

**PowerUp Pickup Naming** — Rename `powerUp` (the on-field pickup variable) → `powerUpPickup` to distinguish from `powerUpType` (active effect). Update ~12 references: lines 138, 412, 422, 495, 880, 1343-1344, 1880-1882, 1945. Also rename `drawPowerUp()` → `drawPowerUpPickup()`.

### 6. Additional Cleanup (from Reviews)

**Eye-Drawing Function** — Extract duplicated eye-drawing at lines 1450-1471 (player snake) and 1537-1558 (rival snake) into:

```js
function drawEyes(x, y, dx, dy, scleraColor, pupilColor) {
    // calculate eye positions based on direction... same math as current code
}
```

**comboFadeTimer Optimization** — Move `clearTimeout(comboFadeTimer)` / `setTimeout()` combo fade from `animateVisuals()` (every rAF frame) to `updateGame()` (only when combo changes). Prevents 60 `clearTimeout` calls per second.

## Descoped Items (from Review)

The following items were proposed in the initial brainstorm but DESCCOED after review:

- **Dynamic Obstacles** — Adding obstacles mid-game would require spawn-safety zones, preview animations, invulnerability windows, and risks making the game feel unfair. Defers to a future iteration.
- **Epic Burst food conversion** — The single-food model makes "3 nearby food tiles convert" architecturally incompatible. Defers to a multi-food redesign.
- **endGame options-bag** — Would decrease maintainability by accumulating booleans. Extracted `finalizeSession()` helper instead.
- **Full dedup of gameOver/endZenSession** — The behavioral differences are significant enough that forced unification would be harder to read than two separate functions sharing a small helper.

## Edge Cases

- **Quick restart during particle animation:** `resetGame()` clears particles array — particles from prior death simply disappear. No state corruption.
- **XP bar with prestige:** At prestige, XP = 0, level = 1. Bar shows `Lv.1 || 0/100`. Toast signals "Prestige N!" to explain the reset.
- **Daily HUD with no challenge visible:** Only renders during `gameState === 'playing' && gameMode === 'daily'`. Not shown on idle or gameover screens.
- **Mute toast vs achievement toast:** Both use `queueToast()` which processes sequentially. No timer-sharing conflict (mute no longer uses raw setTimeout).
- **Haptic during auto-pause:** `navigator.vibrate()` fires during pause (death happens before pause). Acceptable — 30ms is too brief to be annoying.
- **Haptic rapid fire:** Throttled to max once per 300ms. Android Vibration API queues rapid calls — this prevents the "continuous buzz" issue.
- **Viewport `user-scalable=5`:** Allows zoom for accessibility while preventing accidental pinch-zoom during gameplay. The game already uses touch controls for D-pad and swipe — pinch-zoom interference is minimal.
- **`trace_streak_3` invisible in current code:** The refactor adds its rendering config. This is a bugfix, not a new feature.
- **Food labels on speed food:** Speed food already has distinctive chevrons. No "S" label needed — avoids visual clutter on small tiles.

## Implementation Order

All steps are independent. Implemented in this order for best integration:

| Step | Tasks | Risk | Effort |
|------|-------|------|--------|
| 1 | Bug fixes (6 items, all independent) | Low | Small |
| 2 | Rebalances (5 items, independent) | Medium | Small-Med |
| 3 | Architecture cleanup (6 items) | Low-Med | Small-Med |
| 4 | Mobile + Accessibility (5 items) | Low | Small |
| 5 | QoL features (7 items) | Low-Med | Small-Med |

## Success Criteria

1. All 6 bugs fixed — streak persists across midnight, no crash on localStorage failure, visibility auto-resumes, powerups never spawn on rival, rival eating final food doesn't end game, food never overlaps obstacles
2. Epic food feels rewarding (50pts, 70XP, strong glow)
3. Zen mode gives XP (10 per food) without becoming the best farm
4. Shield uses `POWERUP_TYPES` duration consistently
5. Snap mode playable past 120 seconds with skill
6. Quick restart saves one keypress per life
7. H key shows keyboard reference on every screen
8. Mute has persistent 🔇 indicator + queueToast feedback
9. XP bar shows progress visually
10. Daily mode shows challenge + progress during play
11. Game renders correctly on mobile without auto-zoom
12. Haptic fires on supported devices (throttled)
13. Every food type has a distinct, colorblind-friendly shape
14. Food labels use text outline instead of dark circle
15. drawTrails() is one data-driven loop (all 6 trail types + streak_3)
16. All inline wrapping uses wrapPosition() where appropriate
17. finalizeSession() extracted, gameOver()/endZenSession() share it
18. restartGameInterval() extracted, used at all 6 call sites
19. PowerUp variable renamed to powerUpPickup
20. Eye-drawing extracted to shared function
21. comboFadeTimer moved to updateGame() 
