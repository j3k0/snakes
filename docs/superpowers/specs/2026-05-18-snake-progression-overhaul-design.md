# Snake Progression Overhaul — Design Document

> **Status:** Revised
> **Date:** 2026-05-18
> **Repository:** `/Users/jeko/tmp/snakes/snake.html` (single-file HTML/JS/CSS, ~3070 lines)
> **Evolution:** Previous specs focused on mechanics (Living Arena) and refactoring (v5). This spec targets the meta-game.
> **Reviews:** 3 (Technical Feasibility, UX/Game Feel, Scope/Consistency) — all applied.

## Context

The Snake game at `/Users/jeko/tmp/snakes/snake.html` is already feature-rich: 5 game modes, 6 food tiers, rival AI snake, 3 power-ups, XP/leveling (max level 20), 27 achievements, cosmetics (skins/grids/trails/death effects/borders), prestige (max 5), combo system (cap 5), daily challenges, streak system, and 15 tracked stats.

**Problem:** The progression curve plateaus too fast:
- Level 20 is reachable in ~30-60 minutes
- Prestige 5 (the absolute cap) is reachable in ~5-8 hours
- 15 of 27 achievements unlock in the first 1-3 games
- XP is meaningless after level 20
- Stats are decorative — they track 15 values but unlock nothing
- Two cosmetic categories (border, death) have minimal depth
- Several stats track data with no achievements using them (sessionSpeedFood, sessionBonusFood)

### Core Principles

1. **Deepen, don't widen** — zero new game modes, food types, power-ups, or core mechanics. Everything extends existing systems.
2. **Infinite endgame** — remove the hard cap on progression. Players should always have something to work toward.
3. **Stats become rewards** — every tracked stat should have at least one associated milestone or achievement.
4. **Progressive difficulty** — new achievements scale from easy to extremely hard, filling the mid-game gap.
5. **Bug fixes + polish** — fix known bugs and mobile UX issues alongside progression work.

## Feature 1: Infinite Pinnacle System (Post-Prestige)

### Summary

After reaching Prestige 5 (the current max), instead of a dead-end toast, players enter an infinite "Pinnacle" track. Each Pinnacle rank requires a mini-prestige cycle and grants a permanent +2% score multiplier, and every Nth rank unlocks a cosmetic reward.

### Design

**Activation:** When a player at Prestige 5 with Level 20 presses X:
- `xp = 0; level = 1; pinnacleRank++` (same as a prestige reset)
- `xpOvercharge` is preserved (not reset) — this is the incentive to keep building overcharge
- Toast: "⚡ Pinnacle Rank {rank}! Score +{2*rank}%"

**Display:**
- On idle screen: replace "Prestige 5" with "Pinnacle ∞" (or "Pinnacle 12" if at rank 12)
- In stats panel: show `Pinnacle: 12` as a new row
- On XP bar (after level 20): show `Pinnacle ∞` badge

**Scaling:**
- Each pinnacle rank grants: +2% score multiplier (additive)
- `totalMultiplier = 1 + (pinnacleRank * 0.02) + Math.min(0.50, Math.floor(xpOvercharge / 1000) * 0.01)`
- This is additive, not multiplicative. Max at Pinnacle 50 + overcharge cap = 1 + 1.0 + 0.5 = 2.5x.
- Score multiplier applies to: all food points, combo bonuses, milestone score awards
- Does NOT apply to: XP, length-based scoring (Zen)

**Cosmetic Rewards:**
- Every 10 Pinnacle ranks: border tint variant (`border_pinnacle_10` etc. — or a new effect that cycles through colors)
- Every 25 Pinnacle ranks: trail particle color shift
- Every 50 Pinnacle ranks: special death effect

**Save format backward compatibility:**
- New key: `snake_pinnacle` (integer, default 0)
- The existing `snake_prestige` key stays at 5 (doesn't increase) — Pinnacle repurposes the X key press that would have been dead

**Implementation:**
- New global: `pinnacleRank` (integer, default 0)
- Load/save: `saveManager.getInt('snake_pinnacle', 0)` / `saveManager.set('snake_pinnacle', pinnacleRank)`
- Modify prestige handler: if `prestigeLevel >= 5 && level >= 20`, increment `pinnacleRank` instead
- New function: `getScoreMultiplier()` returns `1 + (pinnacleRank * 0.02) + Math.min(0.50, Math.floor(xpOvercharge / 1000) * 0.01)`
- Apply multiplier in: food eat score calculation, combo milestone score, Time Attack end score

### Centralized Score Multiplier

An `addScore(amount)` helper function applies all multipliers and tracks total score changes. This single function is called from the 3 score-award sites: food eat (line ~2272), combo bonus (line ~2275), rival defeat (line ~959). It must NOT apply in Zen mode (guard on `gameMode === 'zen'`).

## Feature 2: New Achievement Tier (12 new achievements)

### Summary

12 new achievements extending into the mid-game and end-game, using currently-tracked-but-unused stats and filling the plateau zone.

### Complete List

| ID | Name | Description | XP | Check |
|----|------|-------------|-----|-------|
| `ASCENDED` | Ascended | Reach Prestige 1 | 500 | `prestigeLevel >= 1` |
| `TRANSCENDED` | Transcended | Reach Prestige 3 | 750 | `prestigeLevel >= 3` |
| `GODLIKE` | Godlike | Reach Prestige 5 | 1000 | `prestigeLevel >= 5` |
| `COMBO_10` | Combo King | Reach 10x combo | 500 | `maxCombo >= 10` |
| `COMBO_20` | Combo God | Reach 20x combo | 1000 | `maxCombo >= 20` |
| `COMBO_50` | Combo Deity | Reach 50x combo | 2000 | `maxCombo >= 50` |
| `GLUTTON_II` | Bottomless Pit | Eat 50 foods in one game | 300 | `sessionFoodEaten >= 50` |
| `IMMORTAL` | Immortal | Survive 5 minutes in one game | 400 | `sessionTimeAlive >= 300000` |
| `SPEED_DEMON_II` | Speed Runner | Eat 25 speed foods total | 350 | `speedFoodEaten >= 25` |
| `BONUS_HUNTER` | Bonus Hunter | Eat 25 bonus foods total | 350 | `bonusFoodEaten >= 25` |
| `EXPLORER` | Explorer | Eat all 6 food types in one game | 250 | `sessionFoodTypes.size >= 6` |
| `DEDICATED` | Dedicated | Play 200 games | 500 | `gamesPlayed >= 200` |
| `LEGENDARY` | Legendary | Eat 1000 total food | 600 | `totalFoodEaten >= 1000` |

**Note:** `SPEED_DEMON_II` checks `stats.speedFoodEaten >= 25` (uses the existing stat, but note: the existing `SPEED_DEMON` achievement checks the same stat at 10. This new one extends it.)

### Implementation Notes

- All 12 achievements follow the existing pattern: `check: function(s, c) { return condition; }`
- The `ACHIEVEMENTS` object gets 12 new entries inserted (appended to end is fine)
- The ctx object in `checkAchievements()` needs two new properties:
  - `prestigeLevel: prestigeLevel` (for ASCENDED, TRANSCENDED, GODLIKE)
  - `sessionFoodTypes: sessionFoodTypes` (for EXPLORER)
- Existing `achievements` JS object uses string keys, these get added as new properties

## Feature 3: Stat Milestone Rewards

### Summary

Tracked stats currently unlock nothing on their own. This feature adds a `STAT_MILESTONES` system where reaching certain stat thresholds automatically unlocks new cosmetic variants and grants toast notifications.

### Design

```javascript
const STAT_MILESTONES = {
    totalDistance: {
        5000: { id: 'milestone_distance_5k', name: 'Wanderer', message: 'Traveled 5,000 tiles!', type: 'trail' },
        25000: { id: 'milestone_distance_25k', name: 'Explorer', message: 'Traveled 25,000 tiles!', type: 'trail' },
    },
    totalFoodEaten: {
        1000: { id: 'milestone_food_1k', name: 'Foodie', message: 'Ate 1,000 total food!', type: 'grid' },
    },
    rivalsDefeated: {
        25: { id: 'milestone_rivals_25', name: 'Rival Hunter', message: 'Defeated 25 rivals!', type: 'death' },
        100: { id: 'milestone_rivals_100', name: 'Rival Slayer', message: 'Defeated 100 rivals!', type: 'death' },
    },
    gamesPlayed: {
        200: { id: 'milestone_games_200', name: 'Veteran', message: 'Played 200 games!', type: 'border' },
    },
};
```

**Reward Types:** Each milestone unlocks a cosmetic item. The unlock ID is added to `unlockedCosmetics` array. Since we don't have matching cosmetic objects for these IDs (they're "virtual" unlocks), we define them as simple cosmetic variations:
- `milestone_distance_5k`: A trail color variant — applied as a tint override on the current trail
- `milestone_distance_25k`: A different trail variant
- `milestone_food_1k`: A grid overlay unlock (minor tint on grid cells)
- `milestone_rivals_25`: A death effect variant
- `milestone_rivals_100`: A different death effect variant  
- `milestone_games_200`: A border effect variant

**Rendering virtual cosmetics:** Virtual cosmetics (milestone unlocks without an entry in the cosmetics objects) will be stored as a `cosmeticOverrides` map. Rendering functions check this map for overrides before applying the equipped cosmetic. If no override exists, the equipped cosmetic is used normally. This avoids modifying 4+ draw functions.

**Implementation:**
- New object: `STAT_MILESTONES` with nested threshold→reward mapping
- New function: `checkStatMilestones()` called from `checkAchievements()` (at game-end and food-eat time) AND from `endZenSession()`
- Milestones should only fire at session end (not mid-game) to avoid toast overload
- Uses same unlock pattern as `checkLevelUnlocks()` and streak unlocks
- Each milestone triggers a toast via `queueToast()`
- Milestones check against `unlockedCosmetics` to prevent re-firing

## Feature 4: XP Overcharge (Post-Level-20)

### Summary

After reaching level 20 (the XP cap), XP accumulation becomes meaningful again. Instead of going to waste, XP fills an "overcharge" meter that provides incremental score bonuses for future runs.

### Design

**Prerequisite:** `awardXP()` must check `if (level >= 20) { divert to overcharge; return; }`. The existing code has no such guard and would continue promoting beyond level 20.

**Meter Display:**
- On the idle screen, below the XP line: show "⚡ Overcharge: 1,200 / 5,000" when overcharge > 0
- When overcharge is 0 (after prestige or first playthrough), don't show anything

**Thresholds:**
- Every 1,000 XP overcharge: +1% starting score multiplier (caps at +50%)
- Overcharge resets to 0 on prestige (to keep prestige meaningful)

**Display of active bonuses on idle screen:**
- "+12% Score" if at 12,000 overcharge

**Implementation:**
- New global `xpOvercharge` (integer, default 0) — separate from `xp` which stays at max level 20 XP
- On `awardXP()`: if `level >= 20`, add XP to `xpOvercharge` instead of `xp`
- On prestige: `xpOvercharge = 0`
- On save: save as `snake_xp_overcharge`
- New function: `getOverchargeMultiplier()` returns `Math.min(50, Math.floor(xpOvercharge / 1000))` / 100 (i.e., +1% per 1K, max +50%)
- Applied alongside pinnacle multiplier on score calculation

## Feature 5: Combo Unlock

### Summary

The combo system currently hard-caps at 5x with only 2 milestone checks (≥3, ≥5). This feature removes the cap, adds dynamic scaling, and provides visual feedback at higher tiers.

### Design

**Remove cap:**
- Remove the `Math.min(5, comboCount + 1)` limit in the combo logic
- Keep the existing 3-second eat window
- Cap at `comboCount = 50` as a safety limit

**Add milestone scale:**
```javascript
const COMBO_MILESTONES = [3, 5, 7, 10, 15, 20, 30, 50];
```

**Visual feedback:**
- 3x: green flash (exists)
- 5x: orange flash (exists)  
- 7x: orange tint intensify
- 10x: red flash + screen shake
- 15x: purple flash + big shake
- 20x: gold flash + "MAX COMBO" indicator
- 30x+: rainbow cycling flash

**Score scaling:**
- Current formula: `comboCount * 2` bonus per eat
- Keep linear scaling: `comboCount * 3` at 10+, `comboCount * 5` at 20+

**Combo milestone flash — priority system:**
Combo milestone flashOverlay writes and level-up flash writes can conflict. The design uses a priority queue: level-up flashes take priority over combo flashes. Use `flashOverlayPriority` field alongside the existing flashOverlay color/alpha. rAF loop only renders the highest-priority flash.

**Reset `lastComboMilestone` on combo break:**
When `comboCount` resets to 0 (line 2236), also reset `lastComboMilestone = 0`. This ensures milestone flash toasts re-fire if a player builds combo from scratch after a break.

## Feature 6: Mobile UI Polish (Quick Wins)

### Summary

Low-effort, high-visibility mobile improvements identified from a UX audit.

### Changes

1. **Food letter labels:** Add 'C' label for common food and 'S' label for speed food (currently only U, R, E, B have labels). Simple one-line addition in `drawFood()`.

2. **Tap-to-start/restart on mobile:** On idle screen when `hasTouch`, show "👆 Tap to Start" instead of or alongside "Press ENTER to Start". On gameover when `hasTouch`, show "👆 Tap to Restart".

3. **Stats panel overflow:** Add `max-height: 70vh; overflow-y: auto` inline style to the stats panel to prevent overflow on small screens.

4. **Canvas pixel rendering:** Add `image-rendering: pixelated` to canvas CSS for crisp pixel scaling on retina displays.

5. **Toast safe-area:** Update toast `top: 20px` to use `env(safe-area-inset-top, 20px)`.

## Feature 7: Known Bug Fixes

### Summary

Fixes for documented bugs from AGENTS.md.

### Bug List

1. **H key handler has no gameState guard:** The H key handler has no `gameState` guard — help overlay can open during gameplay/gameover, obscuring the screen while the game continues running. Fix: add a `gameState` guard to the H key handler.

## Architecture Considerations

All changes remain within the single-file structure. The game is ~3070 lines. We add approximately:
- +60 lines: Pinnacle system (globals, save/load, prestige handler, display, multiplier)
- +120 lines: 12 new achievements (definitions only, no new check infrastructure needed)
- +60 lines: Stat milestones (object + check function + cosmetic integration)
- +30 lines: XP overcharge (globals, save/load, award hook, display, multiplier)
- +30 lines: Combo unlock (remove cap, milestone array, extended visual checks)
- +20 lines: Mobile quick wins (labels, text changes, CSS)
- +5 lines: Bug fixes

Total: ~325 new lines (file grows from 3070 to ~3395).

## Spec Self-Review

- **Placeholder scan:** All sections complete. One TBD on pinnacle cosmetic implementation (deferred to implementation).
- **Internal consistency:** Core principles updated. Pinnacle has a cost (mini-prestige). Multiplier stacking defined as additive. Overcharge power-up start deferred. Combo unlock accepted as core mechanic change.
- **Scope check:** 6 features, all scoped to deepening existing systems. Feature 4 power-up start removed. Feature 7 reduced to 1 real bug. Focused enough for a single implementation plan.
- **Ambiguity check:** All cross-system interactions defined (pinnacle + overcharge additive, overcharge preserved on pinnacle, combo milestones + level-up flash priority).

## Implementation Phases

- **Phase A (Combo + Achievements):** Feature 5 (Combo Unlock) + Feature 2 (New Achievements) — co-dependent
- **Phase B (Endgame Loop):** Feature 1 (Pinnacle) + Feature 4 (XP Overcharge) — co-dependent
- **Phase C (Rewards):** Feature 3 (Stat Milestones) — depends on Phase B's infrastructure
- **Phase D (Polish):** Feature 6 (Mobile Quick Wins) + Feature 7 (Bug #2) — independent, low-risk

Each phase is independently implementable and testable.