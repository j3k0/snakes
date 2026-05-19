# Snake Progression Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the meta-game progression systems — infinite pinnacle ranks post-prestige-5, XP overcharge post-level-20, uncapped combos with 8 milestone tiers, 13 new achievements, stat milestone rewards, mobile UI polish, and 1 bug fix.

**Architecture:** All changes go into the single-file `snake.html`. Changes are organized into 4 independent phases that can be implemented sequentially with review gates between them.

**Tech Stack:** Vanilla JS (ES6), Canvas 2D, Web Audio API, localStorage

---

## Phase A: Combo Unlock + New Achievements

### Task A1: Remove Combo Cap and Extend Milestones

**File:** `snake.html`

- [ ] **Step 1: Remove the 5x combo cap**

At line 2234, find:
```js
comboCount = Math.min(5, comboCount + 1);
```
Replace with:
```js
comboCount = Math.min(50, comboCount + 1);
```

- [ ] **Step 2: Reset lastComboMilestone on combo break**

At line 2236, find:
```js
} else {
    comboCount = 0;
}
```
Change to:
```js
} else {
    comboCount = 0;
    lastComboMilestone = 0;
}
```

- [ ] **Step 3: Replace the binary milestone flash with the 8-tier system**

At lines 2247–2252, find:
```js
if (comboCount >= 3 && comboCount > lastComboMilestone) {
    lastComboMilestone = comboCount;
    flashOverlay = { color: comboCount >= 5 ? '#FF8800' : '#44BB44', alpha: 0.3 };
    vibrate(30);
    playSound('combo_milestone');
}
```

Replace with:
```js
const COMBO_MILESTONES = [3, 5, 7, 10, 15, 20, 30, 50];
const COMBO_FLASH_COLORS = {
    3:  '#44BB44',
    5:  '#FF8800',
    7:  '#FF6600',
    10: '#FF4444',
    15: '#AA44FF',
    20: '#FFD700',
    30: 'rainbow',
    50: '#FFFFFF'
};
if (COMBO_MILESTONES.includes(comboCount) && comboCount > lastComboMilestone) {
    lastComboMilestone = comboCount;
    const color = COMBO_FLASH_COLORS[comboCount] || '#44BB44';
    const alpha = comboCount >= 20 ? 0.5 : comboCount >= 10 ? 0.4 : 0.3;
    flashOverlay = { color, alpha, priority: comboCount >= 10 ? 'high' : 'normal' };
    if (comboCount >= 10) {
        shakeTimer = Math.min(300, 100 + comboCount * 5);
    }
    vibrate(30);
    playSound('combo_milestone');
}
```

- [ ] **Step 4: Add combo score scaling brackets**

At lines 2274–2276, find:
```js
if (comboCount > 0 && gameMode !== 'zen') {
    score += Math.floor(comboCount * 2);
}
```

Replace with:
```js
if (comboCount > 0 && gameMode !== 'zen') {
    let comboBonus;
    if (comboCount >= 20) {
        comboBonus = Math.floor(comboCount * 5);
    } else if (comboCount >= 10) {
        comboBonus = Math.floor(comboCount * 3);
    } else {
        comboBonus = Math.floor(comboCount * 2);
    }
    addScore(comboBonus);
}
```

Note: this uses `addScore()` from Phase B. During Phase A implementation, if Phase B is not yet done, use `score += comboBonus;` temporarily and switch to `addScore(comboBonus);` in Phase B.

- [ ] **Step 5: Add flashOverlay priority handling in animateVisuals**

At lines 1457–1463, find:
```js
// Flash overlay — renders last on top of everything
if (flashOverlay) {
    ctx.fillStyle = flashOverlay.color;
    ctx.globalAlpha = Math.max(0, flashOverlay.alpha);
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalAlpha = 1;
}
```

Replace with:
```js
// Flash overlay — renders last on top of everything
// Priority: 'high' (level-up, milestone 10+) overrides 'normal' (food eat, milestone <10)
if (flashOverlay) {
    ctx.fillStyle = flashOverlay.color === 'rainbow'
        ? 'hsl(' + (Date.now() % 2000 / 2000 * 360) + ', 100%, 50%)'
        : flashOverlay.color;
    ctx.globalAlpha = Math.max(0, flashOverlay.alpha);
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.globalAlpha = 1;
}
```

- [ ] **Step 6: Verify changes**

Search for `Math.min(5, comboCount + 1)` — should return 0 results.
Search for `lastComboMilestone = 0` — should have 3 occurrences (decl line 192, resetGame line 617, combo break line 2236).
Search for `COMBO_MILESTONES` — should have 1 definition + 1 usage at `includes`.

### Task A2: Add 13 New Achievements

**File:** `snake.html`

- [ ] **Step 1: Add new achievements to the ACHIEVEMENTS object**

Find the ACHIEVEMENTS object starting at line 240. The object ends with `};` at line 270. Add these 13 entries before the closing `};`:

```js
ASCENDED: { name:'Ascended', desc:'Reach Prestige 1', xp:500, icon:'⭐', check:function(s,c){return prestigeLevel>=1;} },
TRANSCENDED: { name:'Transcended', desc:'Reach Prestige 3', xp:750, icon:'🌟', check:function(s,c){return prestigeLevel>=3;} },
GODLIKE: { name:'Godlike', desc:'Reach Prestige 5', xp:1000, icon:'👑', check:function(s,c){return prestigeLevel>=5;} },
COMBO_10: { name:'Combo King', desc:'Reach 10x combo', xp:500, icon:'🔥', check:function(s,c){return c.maxCombo>=10;} },
COMBO_20: { name:'Combo God', desc:'Reach 20x combo', xp:1000, icon:'💥', check:function(s,c){return c.maxCombo>=20;} },
COMBO_50: { name:'Combo Deity', desc:'Reach 50x combo', xp:2000, icon:'⚡', check:function(s,c){return c.maxCombo>=50;} },
GLUTTON_II: { name:'Bottomless Pit', desc:'Eat 50 foods in one game', xp:300, icon:'🤤', check:function(s,c){return c.sessionFoodEaten>=50;} },
IMMORTAL: { name:'Immortal', desc:'Survive 5 minutes in one game', xp:400, icon:'⏱️', check:function(s,c){return c.sessionTimeAlive>=300000;} },
SPEED_DEMON_II: { name:'Speed Runner', desc:'Eat 25 speed foods total', xp:350, icon:'⚡', check:function(s,c){return s.speedFoodEaten>=25;} },
BONUS_HUNTER: { name:'Bonus Hunter', desc:'Eat 25 bonus foods total', xp:350, icon:'🎯', check:function(s,c){return s.bonusFoodEaten>=25;} },
EXPLORER: { name:'Explorer', desc:'Eat all 6 food types in one game', xp:250, icon:'🗺️', check:function(s,c){return c.eatAllTypes;} },
DEDICATED: { name:'Dedicated', desc:'Play 200 games', xp:500, icon:'🎮', check:function(s,c){return s.gamesPlayed>=200;} },
LEGENDARY: { name:'Legendary', desc:'Eat 1000 total food', xp:600, icon:'🏆', check:function(s,c){return s.totalFoodEaten>=1000;} },
```

- [ ] **Step 2: Extend the checkAchievements context object**

At lines 2588–2596, find the `ctx` object inside `checkAchievements`:
```js
const ctx = {
    sessionFoodEaten: sessionFoodEaten,
    sessionTimeAlive: sessionTimeAlive,
    snakeLength: snake.length,
    hatTrickEligible: sessionFoodTypes.size >= 4,
    maxCombo: sessionMaxCombo,
    sessionScore: sessionScore || score,
    snapLevel: snapLevel,
};
```

Replace with:
```js
const ctx = {
    sessionFoodEaten: sessionFoodEaten,
    sessionTimeAlive: sessionTimeAlive,
    snakeLength: snake.length,
    hatTrickEligible: sessionFoodTypes.size >= 4,
    eatAllTypes: sessionFoodTypes.size >= 6,
    maxCombo: sessionMaxCombo,
    sessionScore: sessionScore || score,
    snapLevel: snapLevel,
    prestigeLevel: prestigeLevel,
};
```

Changes: added `eatAllTypes` property (for EXPLORER), added `prestigeLevel` property (for ASCENDED/TRANSCENDED/GODLIKE). Kept `hatTrickEligible` since existing achievements still use it.

- [ ] **Step 3: Verify achievements load correctly**

Open `snake.html` in a browser, press F, verify that the achievements panel shows 40 entries (27 original + 13 new). Check that the new entries display their names, descriptions, and icons.

---

## Phase B: Endgame Loop (Pinnacle + XP Overcharge)

### Task B1: Add Level-20 Cap and XP Overcharge Divert

**File:** `snake.html`

- [ ] **Step 1: Add xpOvercharge global and persistence**

After line 200 (`let prestigeLevel = ...`), add:
```js
let xpOvercharge = saveManager.getInt('snake_xp_overcharge', 0);
```

- [ ] **Step 2: Modify awardXP to divert at level 20**

At lines 2464–2478, find the `awardXP` function:
```js
function awardXP(amount) {
    const mc = MODE_CONFIG[gameMode];
    if (!mc.earnXP) return;
    xp += amount;
    sessionXP += amount;
    const newLevel = getLevelFromXP(xp);
    while (newLevel > level) {
        level++;
        levelUpFlash = 1500; // show "LEVEL N!" for 1.5 seconds
        showLevelUpToast(level);
        checkLevelUnlocks(level);
    }
    cachedLevel = -1; // invalidate XP cache on level change
    saveManager.set('snake_xp', xp);
}
```

Replace with:
```js
function awardXP(amount) {
    const mc = MODE_CONFIG[gameMode];
    if (!mc.earnXP) return;
    if (level >= 20) {
        xpOvercharge += amount;
        saveManager.set('snake_xp_overcharge', xpOvercharge);
        return;
    }
    xp += amount;
    sessionXP += amount;
    const newLevel = getLevelFromXP(xp);
    while (newLevel > level) {
        level++;
        levelUpFlash = 1500;
        showLevelUpToast(level);
        checkLevelUnlocks(level);
    }
    cachedLevel = -1;
    saveManager.set('snake_xp', xp);
}
```

- [ ] **Step 3: Add getOverchargeMultiplier function**

After line 483 (after the `getEffectiveSpeed` function closing brace), add:
```js
function getOverchargeMultiplier() {
    if (level < 20) return 1;
    const bonus = Math.min(0.50, Math.floor(xpOvercharge / 1000) * 0.01);
    return 1 + bonus;
}
```

- [ ] **Step 4: Add addScore helper function**

After the new `getOverchargeMultiplier` function, add:
```js
function addScore(amount) {
    if (gameMode === 'zen') {
        score = snake.length;
        return;
    }
    const multi = (pinnacleRank > 0 ? (1 + pinnacleRank * 0.02) : 1) * getOverchargeMultiplier();
    score += Math.round(amount * multi);
    updateScoreDisplay();
}
```

Note: `pinnacleRank` is declared in Task B2. If implementing B1 before B2, declare `let pinnacleRank = 0;` near the other globals (after `xpOvercharge`) so `addScore` compiles.

- [ ] **Step 5: Replace direct score += calls with addScore**

Find and replace these score lines:

1. Line ~2272: `if (gameMode !== 'zen') score += tier.pts;`
   → `if (gameMode !== 'zen') addScore(tier.pts);`
   Also remove the `updateScoreDisplay()` call on the next line if it exists right after this line (check context — the food eat block may have its own `updateScoreDisplay()` that should be removed since `addScore` calls it internally).

2. Lines ~2274–2276 (the combo block — already modified by Phase A Step 4):
   The final form should be `addScore(comboBonus);` inside the combo `if` block.

3. Line ~958: `if (gameMode !== 'zen') score += 50;`
   → `if (gameMode !== 'zen') addScore(50);`
   And remove the `updateScoreDisplay();` call on line 959 immediately after it.

**Important:** `addScore` already calls `updateScoreDisplay()`, so any standalone `updateScoreDisplay()` calls immediately following these `score +=` lines must be removed to avoid double-calling. Check each call site for adjacent `updateScoreDisplay()` and remove it.

- [ ] **Step 6: Save overcharge on game end**

In `saveAllState()` (line ~2498), add before the existing saves:
```js
saveManager.set('snake_xp_overcharge', xpOvercharge);
```

In `finalizeSession()` (line ~1030), after `saveAllState();`, add:
```js
saveManager.set('snake_xp_overcharge', xpOvercharge);
```

- [ ] **Step 7: Display overcharge on idle screen**

In `drawOverlay()`, after the XP line at line ~1547 (`ctx.fillText('Lv.' + level + ' | XP: ' + xp.toLocaleString()...)`), add:
```js
if (xpOvercharge > 0) {
    const bonusPct = Math.min(50, Math.floor(xpOvercharge / 1000));
    ctx.fillStyle = '#AA44FF';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('⚡ Overcharge: ' + xpOvercharge.toLocaleString() + ' (+' + bonusPct + '%)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 85);
}
```

### Task B2: Add Pinnacle System (Post-Prestige-5)

**File:** `snake.html`

- [ ] **Step 1: Add pinnacleRank global and persistence**

After the `xpOvercharge` global declaration (added in B1 Step 1), add:
```js
let pinnacleRank = saveManager.getInt('snake_pinnacle', 0);
```

- [ ] **Step 2: Modify prestige handler for pinnacle activation**

At lines 2810–2822, find:
```js
if ((e.key === 'x' || e.key === 'X') && gameState === 'idle' && level >= 20) {
    if (prestigeLevel >= 5) {
        queueToast('⭐ Max Prestige Reached!', 3000);
        return;
    }
    prestigeLevel++;
    xp = 0;
    level = 1;
    saveManager.set('snake_prestige', prestigeLevel);
    saveManager.set('snake_xp', '0');
    checkPrestigeUnlocks();
    drawGame(1);
    return;
}
```

Replace with:
```js
if ((e.key === 'x' || e.key === 'X') && gameState === 'idle' && level >= 20) {
    if (prestigeLevel < 5) {
        prestigeLevel++;
        xp = 0;
        level = 1;
        xpOvercharge = 0;
        saveManager.set('snake_prestige', prestigeLevel);
        saveManager.set('snake_xp', '0');
        saveManager.set('snake_xp_overcharge', 0);
        checkPrestigeUnlocks();
        queueToast('🌟 Prestige ' + prestigeLevel + '!', 3000);
    } else {
        pinnacleRank++;
        xp = 0;
        level = 1;
        // Overcharge preserved for pinnacle ranks
        saveManager.set('snake_pinnacle', pinnacleRank);
        saveManager.set('snake_xp', '0');
        queueToast('⚡ Pinnacle Rank ' + pinnacleRank + '! Score +' + (pinnacleRank * 2) + '%', 4000);
    }
    drawGame(1);
    return;
}
```

Key differences:
- Prestige (level < 5): `xpOvercharge = 0` — resets overcharge as per design doc
- Pinnacle (level >= 5): overcharge is preserved — the incentive to keep building it
- Prestige now shows a confirmation toast (was silent before)

- [ ] **Step 3: Save pinnacleRank**

In `saveAllState()`, add alongside the other saves:
```js
saveManager.set('snake_pinnacle', pinnacleRank);
```

- [ ] **Step 4: Update idle screen display for pinnacle**

At lines 1540–1543, find:
```js
if (prestigeLevel > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('\u2B50 Prestige ' + prestigeLevel, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 88);
}
```

Replace with:
```js
if (prestigeLevel > 0 || pinnacleRank > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    if (pinnacleRank > 0) {
        ctx.fillText('⚡ Pinnacle ' + pinnacleRank + ' (+' + (pinnacleRank * 2) + '%)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 88);
    } else {
        ctx.fillText('\u2B50 Prestige ' + prestigeLevel, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 88);
    }
}
```

At lines 1548–1552, find:
```js
if (level >= 20) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Press X to Prestige', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55);
}
```

Replace with:
```js
if (level >= 20) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px Arial';
    if (pinnacleRank > 0) {
        ctx.fillText('X → Pinnacle Rank ' + (pinnacleRank + 1) + ' (+2% Score)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55);
    } else if (prestigeLevel >= 5) {
        ctx.fillText('X → Pinnacle Rank 1 (+2% Score)', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55);
    } else {
        ctx.fillText('Press X to Prestige', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55);
    }
}
```

- [ ] **Step 5: Add pinnacle to stats panel**

In the stats panel HTML (line ~2776, before `'</table>'`), add:
```js
(pinnacleRank > 0 ? '<tr><td style="padding:4px 8px;">Pinnacle Rank</td><td style="text-align:right;padding:4px 8px;">' + pinnacleRank + '</td></tr>' : '') +
'<tr><td style="padding:4px 8px;">XP Overcharge</td><td style="text-align:right;padding:4px 8px;">' + xpOvercharge.toLocaleString() + '</td></tr>' +
```

This goes right before the closing `'</table>' +` string on line 2776.

---

## Phase C: Stat Milestone Rewards

### Task C1: Add Stat Milestone System

**File:** `snake.html`

- [ ] **Step 1: Add STAT_MILESTONES object**

After line 339 (after `STREAK_UNLOCKS`), add:
```js
const STAT_MILESTONES = {
    totalDistance: {
        5000: { id: 'milestone_distance_5k', name: 'Wanderer', icon: '\u{1F6B6}', msg: 'Traveled 5,000 tiles!' },
        25000: { id: 'milestone_distance_25k', name: 'Globetrotter', icon: '\u{1F30D}', msg: 'Traveled 25,000 tiles!' },
    },
    totalFoodEaten: {
        1000: { id: 'milestone_food_1k', name: 'Gourmet', icon: '\u{1F372}', msg: 'Ate 1,000 total food!' },
    },
    rivalsDefeated: {
        25: { id: 'milestone_rivals_25', name: 'Rival Hunter', icon: '\u2694', msg: 'Defeated 25 rivals!' },
        100: { id: 'milestone_rivals_100', name: 'Rival Slayer', icon: '\u{1F5E1}', msg: 'Defeated 100 rivals!' },
    },
    gamesPlayed: {
        200: { id: 'milestone_games_200', name: 'Veteran', icon: '\u{1F3AE}', msg: 'Played 200 games!' },
    },
};
```

- [ ] **Step 2: Add checkStatMilestones function**

After `checkAchievements` (after line 2607), add:
```js
function checkStatMilestones() {
    for (const statKey in STAT_MILESTONES) {
        const statValue = stats[statKey];
        if (statValue === undefined) continue;
        const thresholds = STAT_MILESTONES[statKey];
        for (const threshold in thresholds) {
            if (statValue >= parseInt(threshold)) {
                const milestone = thresholds[threshold];
                if (unlockedCosmetics.indexOf(milestone.id) === -1) {
                    unlockedCosmetics.push(milestone.id);
                    saveManager.setJSON('snake_unlocks', unlockedCosmetics);
                    queueToast(milestone.icon + ' ' + milestone.name + ': ' + milestone.msg, 4000);
                }
            }
        }
    }
}
```

- [ ] **Step 3: Call checkStatMilestones from game-over path**

In `gameOver()` (line ~1049), after `checkAchievements(score)` and `checkDailyCompletion(...)`, add:
```js
checkStatMilestones();
```

In `endZenSession()` (line ~1093, after `checkAchievements(score)` and `checkDailyCompletion(...)`), add:
```js
checkStatMilestones();
```

Both session-end paths (`gameOver` and `endZenSession`) must call this, per AGENTS.md guidance on parallel session-end paths.

- [ ] **Step 4: Verify milestone tracking**

Open the game in a browser. Play one game and die. Verify no console errors. Check that `checkStatMilestones` appears in both `gameOver` and `endZenSession`.

---

## Phase D: Mobile Polish + Bug Fixes

### Task D1: Mobile UI Quick Wins

**File:** `snake.html`

- [ ] **Step 1: Add food letter labels for common and speed**

At line 1706, find:
```js
const labels = { uncommon: 'U', rare: 'R', epic: 'E', bonus: 'B' };
```

Change to:
```js
const labels = { common: 'C', uncommon: 'U', rare: 'R', epic: 'E', bonus: 'B', speed: 'S' };
```

- [ ] **Step 2: Add tap-to-start text on mobile idle screen**

At lines 1553–1560, find:
```js
ctx.fillStyle = '#555';
ctx.font = '13px Arial';
ctx.fillText('↑↓ Select  |  ENTER Start  |  TAB Stats  |  F Achievements  |  C Cosmetics', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40);
if (hasTouch) {
    ctx.fillStyle = '#555';
    ctx.font = '12px Arial';
    ctx.fillText('Swipe ↑↓ to change mode', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 24);
}
```

Replace with:
```js
if (hasTouch) {
    ctx.fillStyle = '#555';
    ctx.font = '13px Arial';
    ctx.fillText('👆 Tap to Start  |  Swipe ↑↓ to change mode', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40);
} else {
    ctx.fillStyle = '#555';
    ctx.font = '13px Arial';
    ctx.fillText('↑↓ Select  |  ENTER Start  |  TAB Stats  |  F Achievements  |  C Cosmetics', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40);
}
```

- [ ] **Step 3: Add pixel-rendered canvas CSS**

At lines 22–29, find:
```css
#gameCanvas {
    border: 2px solid #333;
    background-color: #111;
    display: block;
    max-width: calc(100vw - 20px);
    max-height: 70vh;
    touch-action: none;
}
```

Change to:
```css
#gameCanvas {
    border: 2px solid #333;
    background-color: #111;
    display: block;
    max-width: calc(100vw - 20px);
    max-height: 70vh;
    touch-action: none;
    image-rendering: pixelated;
}
```

- [ ] **Step 4: Fix stats panel overflow**

At line 67, find:
```html
<div id="statsPanel" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.95);border:2px solid #555;border-radius:10px;padding:20px;color:white;font-family:monospace;z-index:100;min-width:300px;max-width:400px;"></div>
```

Change to:
```html
<div id="statsPanel" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.95);border:2px solid #555;border-radius:10px;padding:20px;color:white;font-family:monospace;z-index:100;min-width:300px;max-width:400px;max-height:70vh;overflow-y:auto;"></div>
```

- [ ] **Step 5: Fix toast safe-area**

At line 66, find:
```html
<div id="toast" style="display:none;position:fixed;top:20px;left:50%;transform:translateX(-50%);color:#FFD700;font-size:24px;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.8);z-index:1000;pointer-events:none;text-align:center;"></div>
```

Change `top:20px` to `top:max(20px, env(safe-area-inset-top, 0px))`:
```html
<div id="toast" style="display:none;position:fixed;top:max(20px, env(safe-area-inset-top, 0px));left:50%;transform:translateX(-50%);color:#FFD700;font-size:24px;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.8);z-index:1000;pointer-events:none;text-align:center;"></div>
```

### Task D2: Bug Fix — H Key Guard

**File:** `snake.html`

- [ ] **Step 1: Add gameState guard to H key handler**

At lines 2910–2927, find:
```js
if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    if (gameState !== 'idle') {
        // Help overlay is only meaningful on the menu screen
        if (helpOverlayVisible) {
            helpOverlayVisible = false;
            visualDirty = true;
        }
        return;
    }
    if (helpOverlayVisible) {
        helpOverlayVisible = false;
        visualDirty = true;
    } else {
        helpOverlayVisible = true;
        visualDirty = true;
    }
    return;
}
```

Replace with:
```js
if (e.key === 'h' || e.key === 'H') {
    e.preventDefault();
    // Only toggle help on idle screen — prevents obscuring gameplay/gameover
    if (gameState !== 'idle') return;
    if (helpOverlayVisible) {
        helpOverlayVisible = false;
        visualDirty = true;
    } else {
        helpOverlayVisible = true;
        visualDirty = true;
    }
    return;
}
```

The original code had a half-measure: during non-idle states it would close the overlay but not open it. The fix simplifies this: H key does nothing during gameplay/gameover. This aligns with the AGENTS.md note that the overlay "may die without seeing it" and "obscures the game-over screen" when open during non-idle states.

---

## Verification

### After All Phases

- [ ] Open `snake.html` in a browser
- [ ] Start a Classic game, eat food — verify combo counter shows above 5x
- [ ] Reach 3x, 5x, 7x, 10x combo — verify flash overlay colors change (green, orange, dark orange, red)
- [ ] Press F — verify achievements panel shows 40 achievements including new ones (ASCENDED, COMBO_10, etc.)
- [ ] Reach level 20 — verify XP goes to overcharge instead of continuing to level
- [ ] Reach level 20 then prestige — verify overcharge resets to 0
- [ ] Reach Prestige 5 + Level 20 — press X, verify Pinnacle Rank 1 toast
- [ ] Press X again at Pinnacle 1 + Level 20 — verify Pinnacle Rank 2 toast, overcharge preserved
- [ ] View stats panel — verify Pinnacle and XP Overcharge rows display
- [ ] On mobile viewport — verify pixelated canvas rendering
- [ ] Check stats panel — verify it scrolls with overflow-y:auto
- [ ] Check toast positioning on iPhone — verify safe-area inset works
- [ ] Press H during gameplay — verify help overlay does NOT open
- [ ] Press H on idle screen — verify help overlay toggles normally