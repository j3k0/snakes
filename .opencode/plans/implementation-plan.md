# Implementation Plan: Snake Next Level

## Execution Order

Each task is self-contained and can be implemented by a subagent. Review subagent reviews each task before moving on.

### Task 1: Panel Close Buttons + Backdrop (Feature 5A)
- Add `<div id="panelBackdrop">` to HTML
- Add `closeAllPanels()` function
- Add ✕ close button to each panel (stats, achievements, cosmetics)
- Show backdrop in each `show*Panel()`, hide in `closeAllPanels()`
- Backdrop click handler calls `closeAllPanels()`
- Important: `e.stopPropagation()` on backdrop click to prevent canvas events
- Important: `closeAllPanels()` must set panels to `display:none` directly (not toggle)

### Task 2: Touch Mode Selection + Touch Guard (Feature 5B)
- Add idle-state swipe detection to canvas touchend handler
- Vertical swipes in idle: cycle game mode
- Add `gameState === 'playing'` guard before `setNextDirection()` in touchend
- Return early in idle state for non-vertical swipes

### Task 3: Remove Double Render + Visual Dirty Flag (Feature 2)
- Add `let visualDirty = true;` global
- Remove `drawGame()` call from end of `updateGame()` (line ~1623)
- Set `visualDirty = true` at ALL 10 state-mutation sites (documented in design)
- Add `needsRedraw` check in `animateVisuals()` gating `drawGame()`
- Move sparkle particle spawn (`gameTick % 5`) from animateVisuals to updateGame (side-effect in render is wrong)
- Move ghost/sparkle trail rendering INTO drawGame as `drawTrails()` function (z-order fix)

### Task 4: Smooth Snake Interpolation (Feature 1)
- Add globals: `prevSnake`, `prevRivalSnake`, `lastTickTime`, `tickInterval`, `snakeGrew`
- Save prevSnake/prevRivalSnake at start of updateGame()
- Set `lastTickTime = performance.now()` at end of updateGame()
- Update `tickInterval` at all 7 setInterval locations
- Add `snakeGrew = false` flag, set true when food is eaten
- Pass interpolation `t` from animateVisuals to drawGame to drawSnake/drawRival
- Implement corrected interpolation in drawSnake (head, body, growth cases)
- Handle wrap-around skip (|delta| > CANVAS_WIDTH/2)
- Handle prevSnake empty / rival removal cases
- Draw game(1) for non-playing states

### Task 5: Smooth Rival Snake Interpolation (Feature 1, continued)
- Save prevRivalSnake at start of updateGame()
- Interpolate rival in drawRival(t) with same logic as player snake
- Handle rivalActive=false and rivalSnake.length=0 cases

### Task 6: Shape-Coded Food Rendering (Feature 6)
- Rewrite drawFood() with distinct shapes per tier
- Circle (common), Diamond (uncommon), Triangle (rare), Hexagon (epic), Pulsing circle (bonus), Chevron (speed)
- Add 10px bold letter labels with dark background circle for non-common tiers
- Wrap entire drawFood body in ctx.save()/ctx.restore()
- Helper functions: drawStar, drawHexagon, drawChevron, drawDiamond

### Task 7: New Stats Tracking (Feature 4, part 1)
- Add new fields to getDefaultStats(): rivalsDefeated, shieldBlocks, magnetEats, dailyCompleted, epicFoodEaten
- Fix loadStats() to use Object.assign(getDefaultStats(), saved) for migration safety
- Increment rivalsDefeated ONLY at the player-head-hits-rival line (~724)
- Increment shieldBlocks at lines ~1433 and ~1451
- Increment magnetEats in food-eating block when magnetActive is true
- Increment dailyCompleted in checkDailyCompletion()
- Increment epicFoodEaten when eatenType === 'epic'
- Save in saveAllState()

### Task 8: New Achievements (Feature 4, part 2)
- Add 15 new achievements to ACHIEVEMENTS object
- Modify checkAchievements() to pass gameMode as 3rd parameter
- Change Zen mode to achievementsEnabled: true (keep earnXP: false)
- Make achievement checks pass gameMode for mode-specific ones
- Fix toast timer conflict: implement simple toast queue

### Task 9: Fill Unlock Curve — 9 New Cosmetics (Feature 3A)
- Add to SNAKE_SKINS: snake_midnight, snake_lava
- Add to GRID_THEMES: grid_void, grid_cyberpunk
- Add to TRACE_EFFECTS: trace_fire, trace_neon, trace_rainbow
- Add to DEATH_EFFECTS: death_frost, death_gold
- Update LEVEL_UNLOCKS to fill all gaps (5,6,8,11,14,16,17,18,19)

### Task 10: Streak Cosmetic Rewards (Feature 3C)
- Add STREAK_UNLOCKS object
- Add streak cosmetic items to respective categories
- Check streak milestones on daily game start
- Show toast when streak unlocks a new cosmetic
- Add to unlockedCosmetics array

### Task 11: Prestige System (Feature 3B)
- Add prestigeLevel (localStorage snake_prestige), prestigeUnlocks (localStorage snake_prestige_unlocks)
- Add PRESTIGE_REWARDS object
- Add border cosmetic category (BORDER_EFFECTS) with border_gold etc.
- Add border_none default
- Update cosmetics panel to show border category (5 categories now)
- Add prestige UI on idle screen (visible at level 20+)
- Implement doPrestige(): reset XP to 0, level to 1, increment prestigeLevel, unlock cosmetic
- Add `border` to cosmetics default equipped
- Draw prestige border in drawGame()

### Task 12: Trail Rendering Refactor (drawTrails)
- Move ghost trail rendering from animateVisuals into drawGame as drawTrails()
- Move sparkle trail spawn check from animateVisuals to updateGame()
- Ensure drawTrails uses interpolated snake positions when available
- This is part of Task 3 but called out separately for clarity