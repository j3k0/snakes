# Implementation Plan: Snake Next Level v5

**Date:** 2026-05-18
**Repository:** `/Users/jeko/tmp/snakes/snake.html` (single-file HTML/JS/CSS, 2644 lines)
**Design Spec:** `/Users/jeko/tmp/snakes/docs/superpowers/specs/2026-05-18-snake-next-level-v5-design.md`
**Conventions:** `/Users/jeko/tmp/snakes/AGENTS.md`

---

## Phase 1: Architectural Refactoring (Tasks 1-6)

---

### Task 1: Speed Calculation Centralization (Section 1a + Amendment E)

**Goal:** Create `getEffectiveSpeed()` function and replace 6 of 7 inline `slowMoActive ? getSpeed() * 2 : getSpeed()` formulas. Keep explicit `getSpeed()` at `deactivatePowerUp()` per amendment E.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 1.1 — Add `getEffectiveSpeed()` after `getSpeed()` (~line 409)**

Insert after line 409 (`return Math.max(...)` at end of `getSpeed()` function):

```js
        function getEffectiveSpeed() {
            return slowMoActive ? getSpeed() * 2 : getSpeed();
        }
```

**Step 1.2 — Replace line 484 in `activatePowerUp()` slowMo case**

Line 484: `tickInterval = getSpeed() * 2;`

Replace with:
```js
                    tickInterval = getEffectiveSpeed();
```

**Step 1.3 — Keep explicit `getSpeed()` at line 499 in `deactivatePowerUp()` per amendment E**

Line 499: `tickInterval = getSpeed();` — KEEP as-is, do NOT change to `getEffectiveSpeed()`. Add comment:

```js
                // NOTE: getSpeed() NOT getEffectiveSpeed() — slowMoActive is still true here,
                // and we want the base speed. slowMoActive is set to false on the next line.
                tickInterval = getSpeed();
```

**Step 1.4 — Replace line 640 in `startGame()`**

Line 640: `tickInterval = getSpeed();`

Replace with:
```js
            tickInterval = getEffectiveSpeed();
```

**Step 1.5 — Replace line 897 in `resumeGame()`**

Line 897: `tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed();`

Replace with:
```js
    tickInterval = getEffectiveSpeed();
```

**Step 1.6 — Replace line 1913 in speed food setTimeout restore**

Line 1913: `tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed();`

Replace with:
```js
                            tickInterval = getEffectiveSpeed();
```

*(Note: This line will be modified again in Task 14 when the setTimeout is replaced with a counter approach — this task just does the formula substitution so the intermediate state is clean.)*

**Step 1.7 — Replace line 1923 in normal eat restore**

Line 1923: `tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed();`

Replace with:
```js
                    tickInterval = getEffectiveSpeed();
```

*(Note: This will also be guarded in Task 14 with `if (speedBoostCounter <= 0)`.)*

**Step 1.8 — Replace line 1963 in power-up timer tick**

Line 1963: `const tickDuration = slowMoActive ? getSpeed() * 2 : getSpeed();`

Replace with:
```js
                const tickDuration = getEffectiveSpeed();
```

**Step 1.9 — Verify the special case at line 1908**

Line 1908: `tickInterval = Math.max(MIN_SPEED, getSpeed() - 30);` — keep this `getSpeed()` call as-is. It intentionally does NOT use `getEffectiveSpeed()` because the speed food boost overrides slowMo.

**Verification:**
```bash
rg 'slowMoActive \? getSpeed\(\) \* 2 : getSpeed\(\)' snake.html
```
Should return zero results after all replacements (except possibly in comments).

**Commit:**
```bash
git add snake.html && git commit -m "task 1: centralize speed calculation with getEffectiveSpeed()"
```

---

### Task 2: Extract drawGame Sub-Functions (Section 1b)

**Goal:** Reduce `drawGame()` from ~160 lines to ~25 lines by extracting 9 HUD/overlay functions.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 2.1 — Add `drawTimeAttackHUD()` before `drawGame()` (~line 1603)**

```js
        function drawTimeAttackHUD() {
            if (gameMode === 'timeAttack' && gameState === 'playing' && timeAttackEnd > 0) {
                const remaining = Math.max(0, Math.ceil((timeAttackEnd - Date.now()) / 1000));
                ctx.fillStyle = remaining <= 10 ? '#FF4444' : '#FFD700';
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText('TIME: ' + remaining + 's', CANVAS_WIDTH / 2, 5);
            }
        }
```

**Step 2.2 — Add `drawSnapHUD()` before `drawGame()`**

```js
        function drawSnapHUD() {
            if (gameMode === 'snap' && gameState === 'playing') {
                const fraction = Math.min(shrinkTimer, snapDuration) / snapDuration;
                ctx.fillStyle = fraction > 0.5 ? '#44FF44' : fraction > 0.25 ? '#FFAA00' : '#FF4444';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'top';
                ctx.fillText('SNAP LV.' + snapLevel, CANVAS_WIDTH - 5, 5);

                const barWidth = 80;
                const barHeight = 6;
                const barX = CANVAS_WIDTH - 10 - barWidth;
                const barY = 22;
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                ctx.fillStyle = fraction > 0.5 ? '#44FF44' : fraction > 0.25 ? '#FFAA00' : '#FF4444';
                ctx.fillRect(barX, barY, barWidth * fraction, barHeight);
            }
        }
```

**Step 2.3 — Add `drawDailyHUD()` before `drawGame()`**

```js
        function drawDailyHUD() {
            if (gameMode === 'daily' && gameState === 'playing') {
                const seed = getDailySeed();
                const challenge = DAILY_CHALLENGES[seed % DAILY_CHALLENGES.length];
                const progress = getDailyProgress(challenge);
                ctx.fillStyle = '#FFD700';
                ctx.font = '11px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText('\uD83C\uDFAF ' + challenge.desc, CANVAS_WIDTH / 2, 2);
                if (challenge.progressTarget) {
                    const fraction = Math.min(progress / challenge.progressTarget, 1);
                    ctx.fillStyle = fraction >= 1 ? '#4CAF50' : '#AAA';
                    ctx.font = '10px Arial';
                    ctx.fillText('Progress: ' + Math.min(progress, challenge.progressTarget) + '/' + challenge.progressTarget, CANVAS_WIDTH / 2, 18);
                }
            }
        }
```

**Step 2.4 — Add `drawPowerUpHUD()` before `drawGame()`**

```js
        function drawPowerUpHUD() {
            if (powerUpType) {
                const config = POWERUP_TYPES[powerUpType];
                const timerDuration = POWERUP_TYPES[powerUpType].duration;
                const fraction = Math.max(0, powerUpTimer / timerDuration);
                const barX = 5;
                const barY = 5;
                const barWidth = 100;
                const barHeight = 14;

                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

                ctx.fillStyle = config.color;
                ctx.globalAlpha = 0.3;
                ctx.fillRect(barX, barY, barWidth * fraction, barHeight);
                ctx.globalAlpha = 1;

                ctx.fillStyle = '#FFF';
                ctx.font = 'bold 11px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(config.name, barX + 4, barY + barHeight / 2);
            }
        }
```

**Step 2.5 — Add `drawRivalHUD()` before `drawGame()`**

```js
        function drawRivalHUD() {
            if (rivalActive) {
                ctx.fillStyle = '#FF6600';
                ctx.font = '12px Arial';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText('Rival: ' + rivalSnake.length, CANVAS_WIDTH - 5, CANVAS_HEIGHT - 60);
                ctx.fillStyle = '#00FF00';
                ctx.fillText('You: ' + snake.length, CANVAS_WIDTH - 5, CANVAS_HEIGHT - 45);
            }
        }
```

**Step 2.6 — Add `drawXPBar()` before `drawGame()`**

```js
        function drawXPBar() {
            if (level < 20) {
                const xpForThisLevel = 100 * level * (level + 1) / 2;
                const xpForPrevLevel = level > 1 ? 100 * (level - 1) * level / 2 : 0;
                const xpInLevel = xp - xpForPrevLevel;
                const xpNeeded = xpForThisLevel - xpForPrevLevel;
                const progress = xpInLevel / xpNeeded;

                const barX = 5;
                const barY = CANVAS_HEIGHT - 22;
                const barWidth = 120;
                const barHeight = 12;

                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

                ctx.fillStyle = 'rgba(255,215,0,0.3)';
                ctx.fillRect(barX, barY, barWidth * Math.min(progress, 1), barHeight);

                ctx.strokeStyle = 'rgba(255,215,0,0.5)';
                ctx.lineWidth = 1;
                ctx.strokeRect(barX, barY, barWidth, barHeight);

                ctx.fillStyle = '#FFD700';
                ctx.font = 'bold 9px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Lv.' + level + ' ' + xpInLevel + '/' + xpNeeded, barX + barWidth/2, barY + barHeight/2);
            }
        }
```

**Step 2.7 — Add `drawMuteIndicator()` before `drawGame()`**

```js
        function drawMuteIndicator() {
            if (muted) {
                ctx.fillStyle = '#888';
                ctx.font = '16px Arial';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'top';
                ctx.fillText('\uD83D\uDD07', CANVAS_WIDTH - 8, 8);
            }
        }
```

**Step 2.8 — Add `drawPrestigeBorder()` before `drawGame()`**

```js
        function drawPrestigeBorder() {
            if (cosmetics.border && cosmetics.border !== 'border_none') {
                const borderConfig = BORDER_EFFECTS[cosmetics.border];
                if (borderConfig) {
                    if (cosmetics.border === 'border_gold') {
                        ctx.save();
                        ctx.strokeStyle = '#FFD700';
                        ctx.lineWidth = 3;
                        ctx.shadowBlur = 8;
                        ctx.shadowColor = '#FFD700';
                        ctx.strokeRect(1.5, 1.5, CANVAS_WIDTH - 3, CANVAS_HEIGHT - 3);
                        ctx.restore();
                    }
                }
            }
        }
```

**Step 2.9 — Add `drawSlowMoTint()` before `drawGame()`**

```js
        function drawSlowMoTint() {
            if (slowMoActive) {
                ctx.fillStyle = 'rgba(170, 68, 255, 0.05)';
                ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            }
        }
```

**Step 2.10 — Replace `drawGame()` body (~lines 1604-1764)**

Replace the entire `drawGame(t)` function body with delegated calls:

```js
        function drawGame(t) {
            drawGrid();
            drawMuteIndicator();
            drawXPBar();
            drawPrestigeBorder();
            drawObstacles();
            drawFood();
            drawPowerUpPickup();
            drawSnake(t);
            drawRival(t);
            drawTrails();
            drawSlowMoTint();
            drawTimeAttackHUD();
            drawSnapHUD();
            drawDailyHUD();
            drawPowerUpHUD();
            drawRivalHUD();
            if (gameState === 'idle') {
                drawOverlay('SNAKE', 'Press ENTER to Start');
            } else if (gameState === 'paused') {
                drawOverlay('PAUSED', 'Press P or SPACE to Resume');
            } else if (gameState === 'gameover') {
                drawOverlay('GAME OVER', 'Score: ' + score + ' | Press ENTER to Restart');
            }
        }
```

**Verification:**
- The draw order in the plan follows AGENTS.md: grid → obstacles → food → snake → particles/trails → overlays → flash. HUD elements (mute, XP bar, time attack, snap, daily, power-up, rival) draw BEFORE overlays.

**Commit:**
```bash
git add snake.html && git commit -m "task 2: extract drawGame sub-functions (HUD, XP, mute, border, tint)"
```

---

### Task 3: Cache DOM References (Section 1c)

**Goal:** Cache DOM element references at module scope to eliminate ~15 `document.getElementById()` calls, particularly in the 60fps rAF hot path.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 3.1 — Add cached references after existing cached elements (~line 82)**

After `const highScoreEl = document.getElementById('highScore');` add:

```js
        const toastEl = document.getElementById('toast');
        const comboDisplayEl = document.getElementById('comboDisplay');
        const xpDisplayEl = document.getElementById('xpDisplay');
        const panelBackdropEl = document.getElementById('panelBackdrop');
```

**Step 3.2 — Replace `document.getElementById('toast')` calls**

Search for all occurrences and replace with `toastEl`:

- Line 489: `const el = document.getElementById('toast');` → `const el = toastEl;`
- Line 582: `const el = document.getElementById('toast');` → `const el = toastEl;`
- Line 845: `const el = document.getElementById('toast');` → `const el = toastEl;`
- Line 2119: `const el = document.getElementById('toast');` → `const el = toastEl;`
- Line 2139: `const el = document.getElementById('toast');` → `const el = toastEl;`
- Line 2145: `const el2 = document.getElementById('toast');` → `const el2 = toastEl;`
- Line 2382: `const el = document.getElementById('toast');` → `const el = toastEl;`
- Line 2497: `const toastEl = document.getElementById('toast');` → (conflict — rename the local variable to `el`): `const el = toastEl;`

Also replace:
- Line 844: `document.getElementById('toast')` → `toastEl`

**Step 3.3 — Replace `document.getElementById('comboDisplay')` calls**

- Line 1127: `const comboEl = document.getElementById('comboDisplay');` → remove this line, use `comboDisplayEl`
- Line 1867: `document.getElementById('comboDisplay')` → `comboDisplayEl`

**Step 3.4 — Replace `document.getElementById('xpDisplay')` calls**

- Line 1132: `const xpEl = document.getElementById('xpDisplay');` → remove this line, use `xpDisplayEl`

**Step 3.5 — Replace `document.getElementById('panelBackdrop')` calls**

- Line 2228: `document.getElementById('panelBackdrop')` → `panelBackdropEl`
- Line 2234: `document.getElementById('panelBackdrop')` → `panelBackdropEl`
- Line 2235: `document.getElementById('panelBackdrop')` → `panelBackdropEl`
- Line 2259: `document.getElementById('panelBackdrop')` → `panelBackdropEl`
- Line 2260: `document.getElementById('panelBackdrop')` → `panelBackdropEl`
- Line 2348: `document.getElementById('panelBackdrop')` → `panelBackdropEl`
- Line 2349: `document.getElementById('panelBackdrop')` → `panelBackdropEl`
- Line 2635: `document.getElementById('panelBackdrop')` → `panelBackdropEl`

**Verification:**
```bash
rg 'document\.getElementById\(' snake.html | head -30
```
Should show only remaining calls for `statsPanel`, `achievementsPanel`, `cosmeticsPanel`, `dpad`, `gameCanvas`, `score`, `highScore` — these are NOT in the rAF hot path and can stay.

**Commit:**
```bash
git add snake.html && git commit -m "task 3: cache DOM references (toast, combo, xp, panelBackdrop)"
```

---

### Task 4: Consolidate localStorage (Section 1d + Amendment D)

**Goal:** Create `saveManager` utility with optional validator parameter (amendment D) and replace all ~38 localstorage access patterns.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 4.1 — Add `saveManager` at the top of the script block, before any other code (~line 72, after `<script>` and the first few constants)**

Add after `const MIN_SPEED = 50;` (~line 77):

```js
        const saveManager = {
            get(key, defaultVal) {
                try {
                    const val = localStorage.getItem(key);
                    return val !== null ? val : defaultVal;
                } catch(e) { return defaultVal; }
            },
            set(key, value) {
                try { localStorage.setItem(key, String(value)); }
                catch(e) { /* storage unavailable */ }
            },
            getJSON(key, defaultVal, validator) {
                try {
                    const val = localStorage.getItem(key);
                    if (val === null) return defaultVal;
                    const parsed = JSON.parse(val);
                    if (validator) return validator(parsed) ? parsed : defaultVal;
                    return parsed !== null && parsed !== undefined ? parsed : defaultVal;
                } catch(e) { return defaultVal; }
            },
            setJSON(key, value) {
                try { localStorage.setItem(key, JSON.stringify(value)); }
                catch(e) { /* storage unavailable */ }
            },
            remove(key) {
                try { localStorage.removeItem(key); }
                catch(e) { /* storage unavailable */ }
            }
        };
```

**Step 4.2 — Replace localStorage access at line 90**

```js
// BEFORE:
try { highScore = parseInt(localStorage.getItem('snake_high_score')) || 0; } catch(e) { highScore = 0; }
// AFTER:
highScore = parseInt(saveManager.get('snake_high_score', '0'));
```

**Step 4.3 — Replace localStorage access at line 96**

```js
// BEFORE:
try { muted = parseInt(localStorage.getItem('snake_muted')) || 0; } catch(e) { muted = 0; }
// AFTER:
muted = parseInt(saveManager.get('snake_muted', '0'));
```

**Step 4.4 — Replace localStorage at line 122**

```js
// BEFORE:
try { xp = parseInt(localStorage.getItem('snake_xp')) || 0; } catch(e) { xp = 0; }
// AFTER:
xp = parseInt(saveManager.get('snake_xp', '0'));
```

**Step 4.5 — Replace localStorage at line 125**

```js
// BEFORE:
try { prestigeLevel = parseInt(localStorage.getItem('snake_prestige')) || 0; } catch(e) { prestigeLevel = 0; }
// AFTER:
prestigeLevel = parseInt(saveManager.get('snake_prestige', '0'));
```

**Step 4.6 — Replace all `localStorage.setItem()` patterns (~14 locations)**

Replace patterns like:
```js
try { localStorage.setItem('snake_high_score', highScore); } catch(e) { /* localStorage unavailable */ }
```
with:
```js
saveManager.set('snake_high_score', highScore);
```

Affected lines (by grep search `localStorage.setItem`):
- Line 566: mode_highs
- Line 570: snake_high_score
- Line 591: snake_daily_attempts_remaining
- Line 607: snake_streak_count
- Line 609: snake_streak_count
- Line 613: snake_streak_count
- Line 625: snake_unlocks
- Line 2062: snake_xp
- Line 2087: snake_stats
- Line 2101-2103: snake_daily_date, snake_daily_done, snake_daily_attempts_remaining
- Line 2161: snake_unlocks
- Line 2175: snake_unlocks
- Line 2198: snake_achievements
- Line 2219: snake_daily_done
- Line 2335: snake_equipped
- Line 2408-2409: snake_prestige, snake_xp
- Line 2461: snake_muted

**Step 4.7 — Replace `localStorage.getItem()` in remaining scattered patterns**

- Line 1178 (in drawOverlay): `localStorage.getItem('snake_streak_count')` → `saveManager.get('snake_streak_count', '0')`
- Line 2094 (syncDailyState): `localStorage.getItem('snake_daily_date')` → `saveManager.get('snake_daily_date', '')`
- Line 2110 (syncDailyState): `localStorage.getItem('snake_daily_attempts_remaining')` → `saveManager.get('snake_daily_attempts_remaining', '3')`
- Line 2113 (syncDailyState): `localStorage.getItem('snake_daily_done')` → `saveManager.get('snake_daily_done', 'false')`

**Step 4.8 — Replace JSON parse patterns with `saveManager.getJSON()`**

`loadUnlocked()` at line 272-278:
```js
function loadUnlocked() {
    const data = saveManager.getJSON('snake_unlocks', null, v => Array.isArray(v) && v.length > 0);
    if (data) return data;
    return ['snake_green','grid_classic','trace_none','death_classic','border_none'];
}
```

`loadEquipped()` at line 280-286:
```js
function loadEquipped() {
    const data = saveManager.getJSON('snake_equipped', null);
    if (data && data.snake) return data;
    return { snake:'snake_green', grid:'grid_classic', trace:'trace_none', death:'death_classic', border:'border_none' };
}
```

`loadAchievements()` at line 288-291:
```js
function loadAchievements() {
    return saveManager.getJSON('snake_achievements', {});
}
```

`loadModeHighScores()` at line 387-390:
```js
function loadModeHighScores() {
    return saveManager.getJSON('snake_mode_highs', {});
}
```

`loadStats()` at line 2065-2070:
```js
function loadStats() {
    const saved = saveManager.getJSON('snake_stats', null);
    return saved ? Object.assign(getDefaultStats(), saved) : getDefaultStats();
}
```

**Verification:**
```bash
rg 'localStorage\.(get|set)Item' snake.html
```
Should return zero results after all replacements.

**Commit:**
```bash
git add snake.html && git commit -m "task 4: consolidate localStorage with saveManager utility"
```

---

### Task 5: Guard Canvas Save/Restore (Section 1e)

**Goal:** Add `didShake` guard variable to ensure save/restore pairing in the shake translation block.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 5.1 — Modify the shake block in `animateVisuals()` (~lines 1077-1086)**

Replace:
```js
            const needsRedraw = visualDirty || particles.length > 0 || flashOverlay || shakeTimer > 0 || eatAnimTimer > 0 || snapLevelUpFlash > 0 || (gameMode === 'snap' && gameState === 'playing');
            if (needsRedraw) {
                visualDirty = false;
                if (shakeTimer > 0 && gameState !== 'paused') {
                    const intensity = (shakeTimer / 200) * 5;
                    ctx.save();
                    ctx.translate((Math.random() - 0.5) * 2 * intensity, (Math.random() - 0.5) * 2 * intensity);
                }
                drawGame(t);
                if (shakeTimer > 0 && gameState !== 'paused') ctx.restore();
            }
```

With:
```js
            const needsRedraw = visualDirty || particles.length > 0 || flashOverlay || shakeTimer > 0 || eatAnimTimer > 0 || snapLevelUpFlash > 0 || (gameMode === 'snap' && gameState === 'playing');
            if (needsRedraw) {
                visualDirty = false;
                let didShake = false;
                if (shakeTimer > 0 && gameState !== 'paused') {
                    didShake = true;
                    const intensity = (shakeTimer / 200) * 5;
                    ctx.save();
                    ctx.translate((Math.random() - 0.5) * 2 * intensity, (Math.random() - 0.5) * 2 * intensity);
                }
                drawGame(t);
                if (didShake) ctx.restore();
            }
```

**Verification:**
- The `didShake` variable is set to `true` inside the save block.
- `ctx.restore()` is called only when `didShake` is true.
- Even if `shakeTimer` or `gameState` changes during `drawGame()`, the guard variable ensures correct pairing.

**Commit:**
```bash
git add snake.html && git commit -m "task 5: guard canvas save/restore with didShake variable"
```

---

### Task 6: Prestige Endgame (Section 1f + Amendment H)

**Goal:** Cap prestige at level 5, show "Max Prestige Reached!" toast, display prestige info in XP bar and gameover overlay.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 6.1 — Add cap check before prestige increment (~line 2403)**

Replace:
```js
            if ((e.key === 'x' || e.key === 'X') && gameState === 'idle' && level >= 20) {
                prestigeLevel++;
                xp = 0;
                level = 1;
```

With:
```js
            if ((e.key === 'x' || e.key === 'X') && gameState === 'idle' && level >= 20) {
                if (prestigeLevel >= 5) {
                    queueToast('\u2B50 Max Prestige Reached! You are at the peak.', 3000);
                    return;
                }
                prestigeLevel++;
                xp = 0;
                level = 1;
```

**Step 6.2 — Add prestige display to XP bar HUD (in `drawXPBar()`)**

After the XP bar text `'Lv.' + level + ' ' + xpInLevel + '/' + xpNeeded`, modify to include prestige when `prestigeLevel > 0`:

Replace the `fillText` line in `drawXPBar()`:
```js
                ctx.fillText('Lv.' + level + ' ' + xpInLevel + '/' + xpNeeded, barX + barWidth/2, barY + barHeight/2);
```

With:
```js
                const prestigeText = prestigeLevel > 0 ? ' | P' + prestigeLevel : '';
                ctx.fillText('Lv.' + level + prestigeText + ' ' + xpInLevel + '/' + xpNeeded, barX + barWidth/2, barY + barHeight/2);
```

**Step 6.3 — Add prestige multiplier to gameover overlay (in `drawOverlay()`)**

After line 1225 (`ctx.fillText('Mode: ' ...)`) in the `gameState === 'gameover'` section, add:

```js
                if (prestigeLevel > 0) {
                    ctx.font = '13px Arial';
                    ctx.fillStyle = '#FFD700';
                    const multiplier = 1 + prestigeLevel * 0.1;
                    ctx.fillText('Prestige ' + prestigeLevel + ' (x' + multiplier.toFixed(1) + ' multiplier)', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 75);
                }
```

*(Note: Since the daily section below this starts at `CANVAS_HEIGHT / 2 + 80`, and the mode line is at `+ 55`, the prestige line at `+ 75` fits between them. If daily is active, the daily lines at +80/+100 need to shift down. But in practice, daily mode and prestige both being displayed simultaneously is unusual — the code handles this implicitly because the daily section draws at higher offsets.)*

**Commit:**
```bash
git add snake.html && git commit -m "task 6: add prestige cap at 5, show max prestige toast, display prestige in HUD"
```

---

## Phase 2: Performance Optimization (Tasks 7-11)

---

### Task 7: Offscreen Canvas for Grid (Section 2a)

**Goal:** Create a cached off-screen canvas for grid rendering, redrawing only when the grid theme changes.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 7.1 — Add grid cache variables after existing module variables (~line 99 area)**

```js
        let gridCacheCanvas = null;
        let currentGridTheme = null;
```

**Step 7.2 — Add `ensureGridCache()` function before `drawGrid()`**

```js
        function ensureGridCache() {
            const theme = GRID_THEMES[cosmetics.grid] || GRID_THEMES.grid_classic;
            if (gridCacheCanvas && currentGridTheme === cosmetics.grid) return;

            if (!gridCacheCanvas) {
                gridCacheCanvas = document.createElement('canvas');
                gridCacheCanvas.width = CANVAS_WIDTH;
                gridCacheCanvas.height = CANVAS_HEIGHT;
            }

            const gCtx = gridCacheCanvas.getContext('2d');
            gCtx.strokeStyle = theme.stroke;
            gCtx.lineWidth = 1;
            gCtx.fillStyle = theme.bg;
            gCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            gCtx.beginPath();
            for (let x = 0; x <= CANVAS_WIDTH; x += TILE_SIZE) {
                gCtx.moveTo(x, 0);
                gCtx.lineTo(x, CANVAS_HEIGHT);
            }
            for (let y = 0; y <= CANVAS_HEIGHT; y += TILE_SIZE) {
                gCtx.moveTo(0, y);
                gCtx.lineTo(CANVAS_WIDTH, y);
            }
            gCtx.stroke();

            currentGridTheme = cosmetics.grid;
        }
```

**Step 7.3 — Replace `drawGrid()` body**

Replace the existing `drawGrid()` body with:
```js
        function drawGrid() {
            ensureGridCache();
            ctx.drawImage(gridCacheCanvas, 0, 0);
        }
```

**Verification:**
- The cache invalidates when `cosmetics.grid` changes (handled by `currentGridTheme !== cosmetics.grid` check).
- The cosmetics panel handler at line 2327 changes `cosmetics.grid` — after clicking left/right, `renderPanel()` is called which triggers a redraw, which calls `drawGame()`, which calls `drawGrid()`, which calls `ensureGridCache()` and detects the theme change.
- First frame: `gridCacheCanvas` is null, so `ensureGridCache()` creates the offscreen canvas and renders.
- Subsequent frames: returns immediately because `currentGridTheme === cosmetics.grid`.

**Commit:**
```bash
git add snake.html && git commit -m "task 7: offscreen canvas for grid rendering with theme invalidation"
```

---

### Task 8: Eliminate Date.now() in Render Path (Section 2b + Amendment A)

**Goal:** Set `renderTime` from rAF timestamp and replace `Date.now()` in cosmetic render functions. Keep `Date.now()` for wall-clock uses (Time Attack timer, game tick logic).

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 8.1 — Add `renderTime` module variable (~line 99 area)**

```js
        let renderTime = 0;
```

**Step 8.2 — Set `renderTime` at top of `animateVisuals()` (~line 1048)**

After `function animateVisuals(timestamp) {` add:
```js
            renderTime = timestamp || performance.now();
```

**Step 8.3 — Replace `Date.now()` in `drawFood()` pulse (~line 1330)**

Replace:
```js
                    const pulse = 1 + 0.5 * Math.sin(Date.now() / 200);
```
With:
```js
                    const pulse = 1 + 0.5 * Math.sin(renderTime / 200);
```

**Step 8.4 — Replace `Date.now()` in `drawSnake()` rainbow hue (~line 1491)**

Replace:
```js
                    const hue = (index * 20 + Date.now() * 0.05) % 360;
```
With:
```js
                    const hue = (index * 20 + renderTime * 0.05) % 360;
```

**Step 8.5 — Replace `Date.now()` in `TRAIL_RENDER_CONFIG` color functions (~lines 330-331)**

Replace line 330:
```js
  trace_rainbow: { alphaStart:0.25, alphaDecay:0.08, color: (idx) => 'hsl('+((idx*20)+Date.now()*0.05)%360+',100%,50%)' },
```
With:
```js
  trace_rainbow: { alphaStart:0.25, alphaDecay:0.08, color: (idx) => 'hsl('+((idx*20)+renderTime*0.05)%360+',100%,50%)' },
```

Replace line 331:
```js
  trace_galaxy:  { alphaStart:0.20, alphaDecay:0.06, color: (idx) => 'hsl('+(Date.now()*0.03+idx*30)%360+',80%,60%)' },
```
With:
```js
  trace_galaxy:  { alphaStart:0.20, alphaDecay:0.06, color: (idx) => 'hsl('+(renderTime*0.03+idx*30)%360+',80%,60%)' },
```

**Step 8.6 — Also replace `Date.now()` in `updateGame()` trace particle colors (~line 2025)**

Replace:
```js
                const color = ['#FF0000','#FF8800','#FFFF00','#00FF00','#0088FF','#8800FF'][Math.floor(Date.now() / 200) % 6];
```
With:
```js
                const color = ['#FF0000','#FF8800','#FFFF00','#00FF00','#0088FF','#8800FF'][Math.floor(renderTime / 200) % 6];
```
*(Note: This is in `updateGame()` which runs from setInterval, not rAF. But `renderTime` is a module variable that's updated every rAF frame. In practice, `updateGame()` runs at most every 50ms and reads the last `renderTime` value, which was set at most 16ms ago. The visual difference is imperceptible.)*

**Step 8.7 — Keep `Date.now()` at line 1676 (Time Attack HUD)**

The Time Attack HUD uses `Date.now()` for wall-clock countdown:
```js
const remaining = Math.max(0, Math.ceil((timeAttackEnd - Date.now()) / 1000));
```
This is correct — it uses wall-clock time for countdown display. KEEP AS-IS.

**Step 8.8 — Keep `Date.now()` in game tick logic**

These locations use `Date.now()` for timing (not rendering):
- Line 636: `timeAttackEnd = Date.now() + mc.timer;`
- Line 638: `sessionStartTime = Date.now();`
- Line 889: `const pauseDuration = Date.now() - sessionPauseStart;`
- Line 893: `timeAttackEnd += pauseDuration;`
- Line 905: `sessionTimeAlive = Date.now() - sessionStartTime - sessionPausedTime;`
- Line 1784: `const remaining = timeAttackEnd - Date.now();`
- Line 1858: `const now = Date.now();`
- Line 2197: `achievements[id] = Date.now();`
- Line 2448: `sessionPauseStart = Date.now();`
- Line 2622: `sessionPauseStart = Date.now();`

All of these are wall-clock operations. KEEP AS-IS.

**Verification:**
```bash
rg 'Date\.now\(\)' snake.html
```
Should return only the wall-clock lines listed above, NOT cosmetic render lines.

**Commit:**
```bash
git add snake.html && git commit -m "task 8: replace Date.now() in render path with rAF renderTime"
```

---

### Task 9: Particle Upper Bound (Section 2e + Amendment I)

**Goal:** Add graceful cap to `spawnParticles()` — spawn as many as capacity allows, up to the requested count.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 9.1 — Add guard at the top of `spawnParticles()` (~line 1033)**

Replace:
```js
        function spawnParticles(x, y, count, color) {
            for (let i = 0; i < count; i++) {
```

With:
```js
        function spawnParticles(x, y, count, color) {
            count = Math.min(count, 500 - particles.length);
            if (count <= 0) return;
            for (let i = 0; i < count; i++) {
```

**Verification:**
- If particles.length = 490 and count = 30, the cap adjusts count to 10.
- If particles.length >= 500, count becomes 0 and the function returns early.
- This prevents frame drops from thousands of particles while still rendering as many as possible.

**Commit:**
```bash
git add snake.html && git commit -m "task 9: add graceful particle upper bound at 500"
```

---

### Task 10: Cache XP Bar Math (Section 2f)

**Goal:** Compute `xpForThisLevel` and `xpForPrevLevel` only on level change, cache in module variables.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 10.1 — Add cached XP variables (~line 99 area)**

```js
        let cachedLevel = 0;
        let cachedXpForThisLevel = 0;
        let cachedXpForPrevLevel = 0;
```

**Step 10.2 — Add `updateXpCache()` function after `awardXP()` (~line 2063 area)**

```js
        function updateXpCache() {
            if (level === cachedLevel) return;
            cachedLevel = level;
            cachedXpForThisLevel = 100 * level * (level + 1) / 2;
            cachedXpForPrevLevel = level > 1 ? 100 * (level - 1) * level / 2 : 0;
        }
```

**Step 10.3 — Call `updateXpCache()` at end of `awardXP()` (~line 2062)**

After `try { localStorage... }` add:
```js
            updateXpCache();
```

**Step 10.4 — Also call `updateXpCache()` in the prestige handler (~line 2408)**

In the prestige block, after `level = 1;` and before `saveManager.set(...)`:
```js
                updateXpCache();
```

**Step 10.5 — Also call `updateXpCache()` in `resetGame()` or on page load after stats/xp load**

Since level is set from xp on page load (line 123), call `updateXpCache()` after `level = getLevelFromXP(xp);` at line 123. Replace:
```js
        let level = getLevelFromXP(xp);
```
With:
```js
        let level = getLevelFromXP(xp);
        updateXpCache();
```

**Step 10.6 — Modify `drawXPBar()` to use cached values**

In `drawXPBar()`, replace:
```js
                const xpForThisLevel = 100 * level * (level + 1) / 2;
                const xpForPrevLevel = level > 1 ? 100 * (level - 1) * level / 2 : 0;
```
With:
```js
                updateXpCache(); // ensure cache is fresh
                const xpForThisLevel = cachedXpForThisLevel;
                const xpForPrevLevel = cachedXpForPrevLevel;
```

**Verification:**
- On page load, `updateXpCache()` is called once after level is computed.
- On XP award, `updateXpCache()` is called only if level changed.
- On each `drawXPBar()` call, `updateXpCache()` is called but returns immediately (no-op) if level hasn't changed.
- This eliminates ~1000 computations of the same formula over a typical game session.

**Commit:**
```bash
git add snake.html && git commit -m "task 10: cache XP bar math, compute only on level change"
```

---

### Task 11: Guard rAF DOM Writes (Section 2g)

**Goal:** Guard `textContent` and `style.display` writes in rAF hot path to only update when values actually change.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 11.1 — Guard combo display write (~line 1127-1131)**

Replace:
```js
            const comboEl = document.getElementById('comboDisplay');
            if (comboEl) {
                const mul = 1 + comboCount * 0.5;
                comboEl.textContent = comboCount > 0 ? 'x' + mul.toFixed(1) + ' COMBO!' : '';
            }
```

With (using the cached `comboDisplayEl` from Task 3):
```js
            if (comboDisplayEl) {
                const mul = 1 + comboCount * 0.5;
                const comboText = comboCount > 0 ? 'x' + mul.toFixed(1) + ' COMBO!' : '';
                if (comboDisplayEl.textContent !== comboText) {
                    comboDisplayEl.textContent = comboText;
                }
            }
```

**Step 11.2 — Guard XP display write (~line 1132-1135)**

Replace:
```js
            const xpEl = document.getElementById('xpDisplay');
            if (xpEl) {
                xpEl.style.display = 'none';
            }
```

With (using the cached `xpDisplayEl` from Task 3):
```js
            if (xpDisplayEl && xpDisplayEl.style.display !== 'none') {
                xpDisplayEl.style.display = 'none';
            }
```

**Step 11.3 — Also add a last known combo text variable to avoid the string check entirely in most frames (optional optimization)**

Add after other module variables:
```js
        let lastComboText = '';
```

And in the combo guard:
```js
            if (comboDisplayEl) {
                const mul = 1 + comboCount * 0.5;
                const comboText = comboCount > 0 ? 'x' + mul.toFixed(1) + ' COMBO!' : '';
                if (comboDisplayEl.textContent !== comboText) {
                    comboDisplayEl.textContent = comboText;
                }
            }
```

**Verification:**
- During idle state, `comboDisplayEl.textContent` is empty string. The guard checks `textContent !== ''` which is false (it IS empty), so no DOM write.
- During gameplay with no combo, same behavior.
- When combo fires, textContent changes once, then stays at that value for the duration.
- `xpDisplayEl.style.display`: initially none, checked once. If already 'none', no write.

**Commit:**
```bash
git add snake.html && git commit -m "task 11: guard rAF DOM writes with value-change checks"
```

---

## Phase 3: Bug Fixes (Tasks 12-16)

---

### Task 12: Power-Up Pickup Despawn (Section 3a + Amendment L)

**Goal:** Add timer-based despawn for power-up pickups with blink visual, and fix sound overlap in deactivatePowerUp.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 12.1 — Add despawn counter variable (~line 148, near other power-up variables)**

```js
        let powerUpDespawnCounter = 0;
        const POWERUP_DESPAWN_TICKS = 125; // ~15s at 120ms tick
```

**Step 12.2 — Set counter in `spawnPowerUpPickup()` (~line 460)**

After `powerUpPickup = { x, y, type };` add:
```js
            powerUpDespawnCounter = POWERUP_DESPAWN_TICKS;
```

**Step 12.3 — Add despawn decrement in `updateGame()` (~line 2002 area)**

After the power-up spawn timer block (line 2002), add:
```js
            // Power-up pickup despawn
            if (powerUpPickup) {
                powerUpDespawnCounter--;
                if (powerUpDespawnCounter <= 0) {
                    powerUpPickup = null;
                    powerUpSpawnCounter = 0; // reset spawn timer for consistent spacing
                }
            }
```

**Step 12.4 — Add blink visual in `drawPowerUpPickup()` (~line 1378)**

Replace the function to add blink behavior when < 20 ticks remaining:
```js
        function drawPowerUpPickup() {
            if (!powerUpPickup) return;
            const config = POWERUP_TYPES[powerUpPickup.type];
            const cx = powerUpPickup.x + TILE_SIZE / 2;
            const cy = powerUpPickup.y + TILE_SIZE / 2;

            ctx.save();

            const ticksLeft = powerUpDespawnCounter / POWERUP_DESPAWN_TICKS;
            if (ticksLeft < 0.2) {
                // Blink when < 20 ticks (~3s) remaining
                const alpha = (Math.sin(renderTime / 80) * 0.5 + 0.5) * 0.8 + 0.2;
                ctx.globalAlpha = alpha;
            }

            ctx.shadowBlur = 10;
            ctx.shadowColor = config.color;
            ctx.fillStyle = config.color;

            const r = TILE_SIZE * 0.35;
            if (powerUpPickup.type === 'shield') {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = '#FFF';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('S', cx, cy);
            } else if (powerUpPickup.type === 'magnet') {
                ctx.beginPath();
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI / 2) - Math.PI / 2;
                    const outerR = r;
                    const innerR = r * 0.4;
                    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
                    ctx.lineTo(cx + Math.cos(angle + Math.PI / 4) * innerR, cy + Math.sin(angle + Math.PI / 4) * innerR);
                }
                ctx.closePath();
                ctx.fill();
            } else if (powerUpPickup.type === 'slowmo') {
                ctx.beginPath();
                ctx.moveTo(cx, cy - r);
                ctx.lineTo(cx + r, cy);
                ctx.lineTo(cx, cy + r);
                ctx.lineTo(cx - r, cy);
                ctx.closePath();
                ctx.fill();
            }

            ctx.restore();
        }
```

**Step 12.5 — Modify `deactivatePowerUp()` to reset spawn counter (~line 497)**

Add `powerUpSpawnCounter = 0;` inside `deactivatePowerUp()`:
```js
        function deactivatePowerUp(silentDeactivate) {
            if (!silentDeactivate) playSound('powerdown'); // per amendment L
            if (slowMoActive) {
                // NOTE: getSpeed() NOT getEffectiveSpeed() — slowMoActive is still true here
                tickInterval = getSpeed();
                restartGameInterval(tickInterval);
            }
            shieldActive = false;
            magnetActive = false;
            slowMoActive = false;
            powerUpTimer = 0;
            powerUpType = null;
            powerUpSpawnCounter = 0; // reset spawn timer for consistent spacing
        }
```

*(Note: The `silentDeactivate` parameter will be fully integrated in Task 18 when power-up sounds are added. For now, define the parameter but don't pass it yet.)*

**Step 12.6 — Update call from `activatePowerUp()` for `silentDeactivate`**

At line 467 (`deactivatePowerUp();`), add the silent flag:
```js
            deactivatePowerUp(true); // silent — don't play powerdown during activation swap
```

*(Note: This requires `deactivatePowerUp()` to accept the `silentDeactivate` parameter as defined in Step 12.5. This correctly implements amendment L.)*

**Step 12.7 — Reset despawn counter in `resetGame()` (~line 532)**

After `powerUpPickup = null;` add:
```js
            powerUpDespawnCounter = 0;
```

**Verification:**
- Spawn pickup → wait ~15s → pickup disappears (despawn counter reaches 0).
- Reset `powerUpSpawnCounter` ensures consistent spacing before next spawn attempt.
- Blink effect activates when `ticksLeft < 0.2` (~last 3 seconds).

**Commit:**
```bash
git add snake.html && git commit -m "task 12: add power-up pickup despawn with blink visual"
```

---

### Task 13: Food Generation Iteration Limit (Section 3b)

**Goal:** Add maximum iteration counter (200) to `generateFood()` do-while loop with linear scan fallback. Extract `pickRandomFoodType()` for reuse.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 13.1 — Replace `generateFood()` body**

Replace the entire `generateFood()` function (~lines 421-446):

```js
        function pickRandomFoodType() {
            const rand = Math.random();
            let cumulative = 0;
            for (const typeKey in FOOD_TIERS) {
                cumulative += FOOD_TIERS[typeKey].weight;
                if (rand < cumulative) return typeKey;
            }
            return 'common';
        }

        function generateFood(currentSnake) {
            const totalTiles = (CANVAS_WIDTH / TILE_SIZE) * (CANVAS_HEIGHT / TILE_SIZE);
            const rivalLength = rivalActive ? rivalSnake.length : 0;
            if (currentSnake.length + obstacles.length + rivalLength >= totalTiles) return null;

            const MAX_ITERATIONS = 200;
            let iterations = 0;
            let newFood;
            do {
                if (iterations++ > MAX_ITERATIONS) {
                    // Linear scan fallback: collect free tiles
                    const freeTiles = [];
                    const gridW = CANVAS_WIDTH / TILE_SIZE;
                    const gridH = CANVAS_HEIGHT / TILE_SIZE;
                    for (let x = 0; x < gridW; x++) {
                        for (let y = 0; y < gridH; y++) {
                            const px = x * TILE_SIZE;
                            const py = y * TILE_SIZE;
                            if (currentSnake.some(s => s.x === px && s.y === py)) continue;
                            if (obstacles.some(o => o.x === px && o.y === py)) continue;
                            if (rivalActive && rivalSnake.some(s => s.x === px && s.y === py)) continue;
                            freeTiles.push({ x: px, y: py });
                        }
                    }
                    if (freeTiles.length === 0) return null;
                    const tile = freeTiles[Math.floor(Math.random() * freeTiles.length)];
                    return {
                        x: tile.x,
                        y: tile.y,
                        type: pickRandomFoodType()
                    };
                }

                const type = pickRandomFoodType();
                newFood = {
                    x: Math.floor(Math.random() * (CANVAS_WIDTH / TILE_SIZE)) * TILE_SIZE,
                    y: Math.floor(Math.random() * (CANVAS_HEIGHT / TILE_SIZE)) * TILE_SIZE,
                    type: type
                };
            } while (
                currentSnake.some(segment => segment.x === newFood.x && segment.y === newFood.y) ||
                obstacles.some(o => o.x === newFood.x && o.y === newFood.y) ||
                (rivalActive && rivalSnake.some(s => s.x === newFood.x && s.y === newFood.y))
            );
            return newFood;
        }
```

**Verification:**
- On normal (sparse) boards, the do-while loop finds a free tile in 1-5 iterations (random approach).
- On near-full boards, after 200 failed attempts, the linear scan collects all free tiles (~400 checks) and picks randomly.
- The board-full guard at the top (`>= totalTiles`) still prevents infinite loops on completely full boards.
- `pickRandomFoodType()` is reusable for other contexts (e.g., the fallback in this function, and potentially the food legend data).

**Commit:**
```bash
git add snake.html && git commit -m "task 13: add iteration limit to generateFood with linear scan fallback"
```

---

### Task 14: Speed Boost Restore via Counter (Section 3c + Amendment B)

**Goal:** Replace `setTimeout` closure with counter-based approach for speed food boost restore. Guard normal eat speed restoration.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 14.1 — Add speed boost variables (~line 99 area)**

```js
        let speedBoostCounter = 0;
        const SPEED_BOOST_TICKS = 16; // ~2s at 120ms tick
```

**Step 14.2 — Replace the setTimeout in eat block (~lines 1907-1916)**

Replace:
```js
                if (eatenType === 'speed') {
                    tickInterval = Math.max(MIN_SPEED, getSpeed() - 30);
                    restartGameInterval(tickInterval);
                    const ci = gameInterval;
                    setTimeout(() => {
                        if (gameInterval === ci && gameState === 'playing') {
                            tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed();
                            restartGameInterval(tickInterval);
                        }
                    }, 2000);
                }
```

With:
```js
                if (eatenType === 'speed') {
                    tickInterval = Math.max(MIN_SPEED, getSpeed() - 30);
                    restartGameInterval(tickInterval);
                    speedBoostCounter = SPEED_BOOST_TICKS;
                }
```

**Step 14.3 — Add counter decrement in `updateGame()` (~after the collision checks, before the eat block — around ~line 1778 area)**

Add at the top of `updateGame()` (after the game tick increment at line 1780 or in a dedicated section):
```js
            // Speed boost counter
            if (speedBoostCounter > 0) {
                speedBoostCounter--;
                if (speedBoostCounter === 0) {
                    tickInterval = getEffectiveSpeed();
                    restartGameInterval(tickInterval);
                }
            }
```

**Step 14.4 — Guard normal eat speed restore with `if (speedBoostCounter <= 0)` per amendment B (~lines 1922-1925)**

Replace:
```js
                if (eatenType !== 'speed') {
                    tickInterval = slowMoActive ? getSpeed() * 2 : getSpeed();
                    restartGameInterval(tickInterval);
                }
```

With:
```js                if (eatenType !== 'speed' && speedBoostCounter <= 0) {
                    tickInterval = getEffectiveSpeed();
                    restartGameInterval(tickInterval);
                }
```

**Step 14.5 — Reset speed boost counter in `resetGame()` (~line 515 area)**

Add after `gameTick = 0;`:
```js
            speedBoostCounter = 0;
```

**Verification:**
- Eat speed food → speedBoostCounter = 16, interval set to getSpeed()-30.
- Each game tick decrements the counter. After 16 ticks, restore to `getEffectiveSpeed()`.
- Pausing the game pauses the setInterval, so the counter doesn't decrement during pause.
- Eating a normal (non-speed) food while speed boost is active: the guard `speedBoostCounter <= 0` prevents the normal eat handler from resetting the interval.
- Eating another speed food while boost is active: counter resets to 16, extending the boost.

**Commit:**
```bash
git add snake.html && git commit -m "task 14: replace speed boost setTimeout with counter-based restore"
```

---

### Task 15: Rival Eats Last Food Softlock (Section 3d + Amendment C)

**Goal:** When rival eats last food and `generateFood` returns null, set `food = null`. Remove `if (!food) return;` guard. Add passive food regeneration with tick cooldown.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 15.1 — Modify rival eat block in `updateRival()` (~lines 857-868)**

Replace:
```js
            if (food && rNewHead.x === food.x && rNewHead.y === food.y) {
                const combinedSnake = snake.concat(rivalSnake);
                const newFood = generateFood(combinedSnake);
                if (newFood) {
                    if (rivalSnake.length < RIVAL_MAX_LENGTH) {
                        rivalSnake.push(rTail);
                    }
                    food = newFood;
                    playSound('eat');
                }
                // If board is full, rival doesn't eat the food — food stays on board
            }
```

With:
```js
            if (food && rNewHead.x === food.x && rNewHead.y === food.y) {
                const combinedSnake = snake.concat(rivalSnake);
                const newFood = generateFood(combinedSnake);
                if (newFood) {
                    if (rivalSnake.length < RIVAL_MAX_LENGTH) {
                        rivalSnake.push(rTail);
                    }
                    food = newFood;
                    playSound('eat');
                } else {
                    // Board is full — food disappears, rival doesn't grow
                    food = null;
                }
            }
```

**Step 15.2 — Remove `if (!food) return;` guard (~line 2015)**

Replace:
```js
            if (!food) return;
```
With nothing (remove this line entirely).

**Step 15.3 — Add passive food regeneration at end of `updateGame()` (~line 2015 area, before `visualDirty = true`)**

Add after the rival update block and before the trace particle spawning:
```js
            // Passive food regeneration (every 10th tick to limit performance impact)
            if (!food && gameTick % 10 === 0 && gameState === 'playing') {
                const combinedSnake = snake.concat(rivalActive ? rivalSnake : []);
                const newFood = generateFood(combinedSnake);
                if (newFood) food = newFood;
            }
```

**Verification:**
- Rival eats last food → `food` set to `null` (not stuck).
- `if (!food) return;` removed — game continues even without food.
- Passive regeneration fires every 10 ticks (~0.5-1.2s), checking if space opened.
- When board space opens (snake moves, rival dies, etc.), new food spawns.
- `drawFood()` already handles `if (!food) return;` — no crash.

**Commit:**
```bash
git add snake.html && git commit -m "task 15: fix rival eats last food softlock with passive food regen"
```

---

### Task 16: EndZenSession Death Count (Section 3e)

**Goal:** Add `isVoluntary` parameter to `finalizeSession()` to skip `stats.totalDeaths++` for voluntary Zen mode quits.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 16.1 — Modify `finalizeSession()` signature and logic (~lines 904-920)**

Replace:
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

With:
```js
        function finalizeSession(isVoluntary) {
            sessionTimeAlive = Date.now() - sessionStartTime - sessionPausedTime;
            stats.gamesPlayed++;
            stats.totalScore += score;
            if (!isVoluntary) stats.totalDeaths++;
            stats.totalTimePlayed += sessionTimeAlive;
            if (score > stats.maxScore) stats.maxScore = score;
            if (sessionTimeAlive > stats.longestTimeAlive) stats.longestTimeAlive = sessionTimeAlive;
            if (snake.length > stats.longestLength) stats.longestLength = snake.length;
            saveAllState();
            if (score > (modeHighScores[gameMode] || 0)) {
                modeHighScores[gameMode] = score;
                saveManager.setJSON('snake_mode_highs', modeHighScores);
            }
            drawGame(1);
            visualDirty = true;
        }
```

**Step 16.2 — Update `gameOver()` call at line 929**

Replace:
```js
            finalizeSession();
```
With:
```js
            finalizeSession(false);
```

**Step 16.3 — Update `endZenSession()` call at line 963**

Replace:
```js
            finalizeSession();
```
With:
```js
            finalizeSession(true);
```

**Verification:**
- Normal death: `finalizeSession(false)` → `stats.totalDeaths++` fires.
- Zen mode quit: `finalizeSession(true)` → `stats.totalDeaths++` is skipped.
- All other stats (gamesPlayed, totalScore, totalTimePlayed, maxScore, etc.) still update in both cases.

**Commit:**
```bash
git add snake.html && git commit -m "task 16: add isVoluntary param to finalizeSession for Zen death count fix"
```

---

## Phase 4: Polish & Feedback (Tasks 17-21)

---

### Task 17: Level-Up Visual Flash (Section 4a)

**Goal:** Add gold `levelUpFlash` text overlay (like `snapLevelUpFlash`) and gold flash overlay on level-up.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 17.1 — Add `levelUpFlash` variable (~line 117 area)**

```js
        let levelUpFlash = 0;
```

**Step 17.2 — Add `levelUpFlash` timer decay in `animateVisuals()` (~line 1067)**

After:
```js
            if (snapLevelUpFlash > 0) snapLevelUpFlash = Math.max(0, snapLevelUpFlash - delta);
```
Add:
```js
            if (levelUpFlash > 0) levelUpFlash = Math.max(0, levelUpFlash - delta);
```

**Step 17.3 — Add `levelUpFlash` to the needsRedraw check (~line 1077)**

Add `levelUpFlash > 0` to the condition:
```js
            const needsRedraw = visualDirty || particles.length > 0 || flashOverlay || shakeTimer > 0 || eatAnimTimer > 0 || snapLevelUpFlash > 0 || levelUpFlash > 0 || (gameMode === 'snap' && gameState === 'playing');
```

**Step 17.4 — Render level-up flash in `animateVisuals()` (~after snap level-up flash at line 1116)**

After the snap level-up flash block (after `}` at line 1116), add:
```js
            // Level-up flash overlay
            if (levelUpFlash > 0) {
                const alpha = Math.min(1, levelUpFlash / 500);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#FFD700';
                ctx.font = 'bold 28px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowBlur = 12;
                ctx.shadowColor = '#FFD700';
                ctx.fillText('\u2B50 LEVEL ' + level + '! \u2B50', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
                ctx.restore();
            }
```

**Step 17.5 — Set `levelUpFlash` and flash overlay in `awardXP()` (~line 2057)**

Replace the level-up block:
```js
            while (newLevel > level) {
                level++;
                showLevelUpToast(level);
                checkLevelUnlocks(level);
            }
```

With:
```js
            while (newLevel > level) {
                level++;
                levelUpFlash = 1500; // show "LEVEL N!" for 1.5s
                flashOverlay = { color: '#FFD700', alpha: 0.3 }; // gold flash
                playSound('levelup');
                showLevelUpToast(level);
                checkLevelUnlocks(level);
            }
```

**Step 17.6 — Reset `levelUpFlash` in `resetGame()` (~line 527 area)**

Add after `snapLevelUpFlash = 0;`:
```js
            levelUpFlash = 0;
```

**Commit:**
```bash
git add snake.html && git commit -m "task 17: add level-up gold flash overlay and text animation"
```

---

### Task 18: New Sounds (Sections 4b, 4c, 4d + Amendment L)

**Goal:** Add `'achievement'`, `'levelup'`, `'powerup'`, `'powerdown'`, `'rare_spawn'`, `'combo_milestone'` sound cases to `playSound()`. Call sounds at correct times. Implement `silentDeactivate` parameter.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 18.1 — Add `'achievement'` sound case to `playSound()` (~line 1023, before the closing `}` of the switch)**

```js
                case 'achievement':
                    // Ascending arpeggio: C5 -> E5 -> G5, 0.4s
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.linearRampToValueAtTime(659, now + 0.13);
                    osc.frequency.linearRampToValueAtTime(784, now + 0.27);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
                    osc.start(now);
                    osc.stop(now + 0.4);
                    break;
```

**Step 18.2 — Add `'levelup'` sound case**

```js
                case 'levelup':
                    // Two-tone ascending: C5 -> C6, 0.3s
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.linearRampToValueAtTime(1047, now + 0.15);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
                    osc.start(now);
                    osc.stop(now + 0.3);
                    break;
```

**Step 18.3 — Add `'powerup'` sound case**

```js
                case 'powerup':
                    // Quick ascending sweep: 440 -> 880, 0.15s
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
                    gain.gain.setValueAtTime(0.2, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.start(now);
                    osc.stop(now + 0.15);
                    break;
```

**Step 18.4 — Add `'powerdown'` sound case**

```js
                case 'powerdown':
                    // Short descending: 660 -> 330, 0.1s
                    osc.frequency.setValueAtTime(660, now);
                    osc.frequency.exponentialRampToValueAtTime(330, now + 0.1);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                    osc.start(now);
                    osc.stop(now + 0.1);
                    break;
```

**Step 18.5 — Add `'rare_spawn'` sound case**

```js
                case 'rare_spawn':
                    // Two quick ascending notes: C5 -> E5, 0.2s
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.setValueAtTime(659, now + 0.1);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                    break;
```

**Step 18.6 — Add `'combo_milestone'` sound case**

```js
                case 'combo_milestone':
                    // Ascending two-tone: C5 -> E5, 0.2s
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.linearRampToValueAtTime(659, now + 0.1);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
                    osc.start(now);
                    osc.stop(now + 0.2);
                    break;
```

**Step 18.7 — Add `playSound('achievement')` call in `checkAchievements()` (~line 2200)**

After `showAchievementToast(ach);` add:
```js
                    playSound('achievement');
```

**Step 18.8 — Add `playSound('levelup')` in `awardXP()`**

Already included in Step 17.5 — `playSound('levelup')` is called on level increase.

**Step 18.9 — Add `playSound('powerup')` in `activatePowerUp()` (~line 466)**

After `vibrate(20);` add:
```js
            playSound('powerup');
```

**Step 18.10 — Implement `silentDeactivate` parameter in `deactivatePowerUp()`**

The function signature and logic already updated in Step 12.5. Confirm:

```js
        function deactivatePowerUp(silentDeactivate) {
            if (!silentDeactivate) playSound('powerdown');
            // ... rest of function
```

**Step 18.11 — Update `activatePowerUp()` to pass `true` for silent deactivation**

Already included in Step 12.6.

**Step 18.12 — Add `'rare_spawn'` sound to `generateFood()`**

In the new `generateFood()` (from Task 13), after determining the food type but before returning (`pickRandomFoodType()` does the type selection), we need to play the sound from within `generateFood()`. Since `generateFood()` is called from multiple places and sound should play for all of them:

In `generateFood()`, before the `do {` loop or in `pickRandomFoodType()`, the cleanest approach is to add the sound in `generateFood()` itself, right after the type is selected. However, `generateFood()` can return before getting to the sound call (via the board-full guard). The most reliable approach is to play the sound right before returning the food object:

In the main return path (not the linear scan fallback):
```js
            } while (...);
            if (newFood.type === 'rare' || newFood.type === 'epic') {
                playSound('rare_spawn');
            }
            return newFood;
```

And also in the linear scan fallback return:
```js
                    const result = {
                        x: tile.x,
                        y: tile.y,
                        type: pickRandomFoodType()
                    };
                    if (result.type === 'rare' || result.type === 'epic') {
                        playSound('rare_spawn');
                    }
                    return result;
```

**Step 18.13 — Add `'combo_milestone'` sound in eat block**

In the combo logic (~line 1858-1864), after comboCount is updated, check if a milestone was hit:

```js
                // Combo logic
                const now = Date.now();
                if (now - lastEatTime < 3000 && lastEatTime > 0) {
                    comboCount = Math.min(5, comboCount + 1);
                } else {
                    comboCount = 0;
                }
                lastEatTime = now;
```

After this block, add:
```js
                // Combo milestone sound
                if (comboCount === 3 || comboCount === 5) {
                    playSound('combo_milestone');
                }
```

**Verification:**
- All new sounds play correctly across muted/unmuted states.
- `activatePowerUp()` plays `powerup` + silently calls `deactivatePowerUp(true)`.
- `deactivatePowerUp()` (non-silent path) plays `powerdown`.
- Rare/epic food spawn triggers `rare_spawn`.
- Combo milestones (3x, 5x) trigger `combo_milestone`.

**Commit:**
```bash
git add snake.html && git commit -m "task 18: add achievement/levelup/powerup/powerdown/rare_spawn/combo_milestone sounds"
```

---

### Task 19: Help System Overhaul (Section 4e + Amendment F)

**Goal:** Replace single-line toast help with canvas-drawn overlay showing controls, food tiers, game modes, and prestige info. Render in `animateVisuals()` after flash overlay per amendment F.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 19.1 — Add `helpOverlayVisible` variable (~line 99 area)**

```js
        let helpOverlayVisible = false;
```

**Step 19.2 — Replace H key handler (~lines 2495-2508)**

Replace:
```js
            if (e.key === 'h' || e.key === 'H') {
                const ref = 'Arrows/WASD=Move Space=Pause M=Mute H=Help Tab=Stats F=Achiev C=Cosm Esc=Back';
                const toastEl = document.getElementById('toast');
                if (toastEl) {
                    toastEl.textContent = ref;
                    toastEl.style.display = 'block';
                    setTimeout(function() {
                        if (toastEl && toastEl.textContent === ref) {
                            toastEl.style.display = 'none';
                        }
                    }, 4000);
                }
                return;
            }
```

With:
```js
            if (e.key === 'h' || e.key === 'H') {
                helpOverlayVisible = !helpOverlayVisible;
                drawGame(1);
                visualDirty = true;
                return;
            }
```

**Step 19.3 — Add `drawHelpOverlay()` function before `drawGame()` (~line 1603 area)**

```js
        function drawHelpOverlay() {
            if (!helpOverlayVisible) return;

            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            const col1X = 15;
            const col2X = 210;
            let y = 15;
            const lineH = 19;
            const headerH = 24;

            // Title
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('CONTROLS & INFO', CANVAS_WIDTH / 2, y);
            y += headerH + 5;

            ctx.textAlign = 'left';
            ctx.font = '12px Arial';

            // Column 1: Controls
            let y1 = y;
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('CONTROLS', col1X, y1);
            ctx.font = '12px Arial';
            y1 += lineH;

            const controls = [
                ['Arrows / WASD', 'Move snake'],
                ['P / Space', 'Pause / Resume'],
                ['Enter', 'Start / Restart'],
                ['Esc', 'Back to menu'],
                ['M', 'Toggle mute'],
                ['H', 'Toggle this help'],
                ['Tab', 'Stats panel'],
                ['F', 'Achievements'],
                ['C', 'Cosmetics'],
                ['X', 'Prestige (Lv.20+)'],
                ['L', 'Food legend (menu)'],
            ];

            ctx.fillStyle = '#CCC';
            for (const [key, action] of controls) {
                ctx.fillStyle = '#FFD700';
                ctx.fillText(key, col1X, y1);
                const keyWidth = ctx.measureText(key).width;
                ctx.fillStyle = '#888';
                ctx.fillText('  ' + action, col1X + keyWidth + 2, y1);
                y1 += lineH;
            }

            // Column 2: Food tiers + Game modes
            let y2 = y;
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('FOOD TIERS', col2X, y2);
            ctx.font = '12px Arial';
            y2 += lineH;

            const foods = [
                ['Common', '10pts / 25XP / 40%'],
                ['Uncommon', '15pts / 30XP / 25%'],
                ['Rare', '20pts / 40XP / 12%'],
                ['Epic', '50pts / 70XP / 3%'],
                ['Bonus', '30pts / 60XP / 15%'],
                ['Speed', '5pts / 40XP / 5%'],
            ];

            for (const [name, info] of foods) {
                const tierKey = name.toLowerCase();
                ctx.fillStyle = FOOD_TIERS[tierKey] ? FOOD_TIERS[tierKey].color : '#FFF';
                ctx.fillText(name, col2X, y2);
                ctx.fillStyle = '#888';
                ctx.fillText('  ' + info, col2X + ctx.measureText(name).width + 4, y2);
                y2 += lineH;
            }

            y2 += 5;
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('GAME MODES', col2X, y2);
            ctx.font = '12px Arial';
            y2 += lineH;

            for (const mode of MODE_ORDER) {
                const cfg = MODE_CONFIG[mode];
                ctx.fillStyle = '#CCC';
                ctx.fillText(cfg.name, col2X, y2);
                ctx.fillStyle = '#888';
                ctx.fillText('  ' + getModeDesc(mode), col2X + ctx.measureText(cfg.name).width + 4, y2);
                y2 += lineH;
            }

            // Footer
            if (prestigeLevel > 0) {
                const footerY = CANVAS_HEIGHT - 50;
                ctx.fillStyle = '#FFD700';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Prestige ' + prestigeLevel + ' — Multiplier active', CANVAS_WIDTH / 2, footerY);
            }

            ctx.fillStyle = '#555';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Press H or ESC to close', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 15);

            ctx.restore();
        }
```

**Step 19.4 — Add `drawHelpOverlay()` call in `animateVisuals()` per amendment F**

Replace the section after flash overlay and snap level-up flash (~after line 1116) to add the help overlay as the final render step. In `animateVisuals()`, the order becomes:

1. Shake save/translate (existing)
2. `drawGame(t)` (existing)
3. Shake restore (existing)
4. Particle rendering loop (existing)
5. Flash overlay (existing)
6. Snap level-up flash (existing)
7. Level-up flash (from Task 17)
8. `drawHelpOverlay()` — NEW, on top of everything

Add after the level-up flash block (from Task 17):
```js
            // Help overlay (renders last, on top of everything)
            drawHelpOverlay();
```

**Step 19.5 — Close help overlay on game state changes**

Add `helpOverlayVisible = false;` in `resetGame()` (~line 553 area):
```js
            helpOverlayVisible = false;
```

And in the ESC key handler (~line 2472):
```js
            if (e.key === 'Escape') {
                helpOverlayVisible = false;
                if (gameState === 'gameover') {
                    // ...
```

**Step 19.6 — Update drawOverlay idle menu to remove the controls line (since help overlay replaces it)**

The idle overlay line 1201 shows a condensed controls line. Replace it to reference the help overlay:
```js
                ctx.fillStyle = '#555';
                ctx.font = '13px Arial';
                ctx.fillText('H for Help  |  ENTER Start  |  TAB Stats  |  F Achievements  |  C Cosmetics', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40);
```

**Verification:**
- Press H → help overlay appears over any game state.
- Press H again → help overlay disappears.
- Start a new game → help overlay auto-closes.
- ESC → help overlay closes.
- Touch swipe (`touchend` handler) should also close the help overlay.

**Commit:**
```bash
git add snake.html && git commit -m "task 19: canvas-drawn help overlay with controls, food tiers, game modes"
```

---

### Task 20: Death Cause + Combo Milestones (Amendments G.1, G.2, G.3)

**Goal:** Track `lastDeathCause`, display it in gameover overlay. Add combo milestone flash at 3x and 5x. Add power-up expiration warning flicker.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 20.1 — Add `lastDeathCause` variable (~line 99 area)**

```js
        let lastDeathCause = '';
```

**Step 20.2 — Set death cause in all game-over paths within `updateGame()`**

In the collision check at ~line 1806 (self-collision without shield):
```js
                } else {
                    snake.push(tail);
                    lastDeathCause = 'self-collision';
                    gameOver();
                    return;
                }
```

In the rival hit at ~line 1832 (rival body collision without shield):
```js
                    } else {
                        snake.push(tail);
                        lastDeathCause = 'rival';
                        gameOver();
                        return;
                    }
```

In the Snap mode shrink-to-death at ~line 1941:
```js
                    if (snake.length <= 1) {
                        lastDeathCause = 'snap-shrink';
                        gameOver();
                        return;
                    }
```

**Step 20.3 — Display death cause in gameover overlay (`drawOverlay()`)**

After the gameover section (after `ctx.fillText('Mode: ' ...)` at ~line 1225), add:
```js
                if (lastDeathCause) {
                    const deathMessages = {
                        'self-collision': 'You hit yourself!',
                        'rival': 'You were caught by the rival!',
                        'snap-shrink': 'You shrunk to nothing!',
                    };
                    ctx.font = '14px Arial';
                    ctx.fillStyle = '#FF6B35';
                    ctx.fillText(deathMessages[lastDeathCause] || '', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 75);
                }
```

*(Note: If prestige is also displayed, shift these down. See Task 6's note about positioning.)*

**Step 20.4 — Add combo milestone flash**

Add `lastComboMilestone` variable:
```js
        let lastComboMilestone = 0;
```

In the eat block combo logic (~line 1859-1864), after comboCount is determined, add:
```js
                // Combo milestone flash
                if ((comboCount === 3 || comboCount === 5) && comboCount !== lastComboMilestone) {
                    lastComboMilestone = comboCount;
                    const milestoneColors = { 3: '#44BB44', 5: '#FF8800' };
                    flashOverlay = { color: milestoneColors[comboCount], alpha: 0.25 };
                    vibrate(30);
                }
```

Reset `lastComboMilestone` in `resetGame()`:
```js
            lastComboMilestone = 0;
```

*(Note: `playSound('combo_milestone')` was already added in Task 18.)*

**Step 20.5 — Add power-up expiration warning flicker in `drawPowerUpHUD()`**

In `drawPowerUpHUD()` (from Task 2), modify the bar drawing to add flicker when `powerUpTimer < 2000ms`:

Replace the bar fill section:
```js
                ctx.fillStyle = config.color;
                ctx.globalAlpha = 0.3;
                ctx.fillRect(barX, barY, barWidth * fraction, barHeight);
                ctx.globalAlpha = 1;
```

With:
```js
                ctx.fillStyle = config.color;
                if (powerUpTimer < 2000 && powerUpTimer > 0) {
                    // Flicker when < 2s remaining
                    ctx.globalAlpha = (Math.sin(renderTime / 60) * 0.3 + 0.5) * 0.6;
                } else {
                    ctx.globalAlpha = 0.3;
                }
                ctx.fillRect(barX, barY, barWidth * fraction, barHeight);
                ctx.globalAlpha = 1;
```

**Step 20.6 — Reset death cause in `resetGame()`**

```js
            lastDeathCause = '';
```

**Commit:**
```bash
git add snake.html && git commit -m "task 20: death cause display, combo milestone flash, power-up expiration flicker"
```

---

### Task 21: Session Summary Overlay (Section 4f + Amendment K)

**Goal:** Display brief session stats overlay on gameover, clear on startGame per amendment K.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 21.1 — Add session summary variables (~line 99 area)**

```js
        let sessionSummaryTimer = 0;
        let sessionSummary = null;
```

**Step 21.2 — Populate `sessionSummary` in `gameOver()` (~line 929 area)**

After `finalizeSession(false);` add:
```js
            sessionSummary = {
                timeSurvived: sessionTimeAlive,
                foodEaten: sessionFoodEaten,
                foodTypes: sessionFoodTypes.size,
                maxCombo: sessionMaxCombo,
                xpEarned: sessionXP,
                score: score,
                length: snake.length,
            };
            sessionSummaryTimer = 3000; // show for 3s, then fade to normal overlay
```

**Step 21.3 — Clear in `startGame()` per amendment K (~line 579)**

At the top of `startGame()`, add:
```js
            sessionSummary = null;
            sessionSummaryTimer = 0;
```

**Step 21.4 — Add timer decay in `animateVisuals()` (~after existing timer decays at line 1067)**

Add:
```js
            if (sessionSummaryTimer > 0) sessionSummaryTimer = Math.max(0, sessionSummaryTimer - delta);
```

**Step 21.5 — Add `findNextAchievement()` helper (~line 2208 area)**

```js
        function findNextAchievement() {
            const mc = MODE_CONFIG[gameMode];
            if (!mc.achievementsEnabled) return null;
            for (const id in ACHIEVEMENTS) {
                if (!achievements[id]) return ACHIEVEMENTS[id];
            }
            return null;
        }
```

**Step 21.6 — Render session summary in `drawOverlay()` gameover section (~in the `if (gameState === 'gameover')` block)**

After the existing gameover code at ~line 1225, add:
```js
            if (gameState === 'gameover' && sessionSummary && sessionSummaryTimer > 0) {
                const alpha = Math.min(1, sessionSummaryTimer / 500); // fade out in last 0.5s
                ctx.save();
                ctx.globalAlpha = alpha;

                const yBase = CANVAS_HEIGHT / 2 + 55;
                ctx.fillStyle = '#FFD700';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('SESSION SUMMARY', CANVAS_WIDTH / 2, yBase);

                ctx.fillStyle = '#CCC';
                ctx.font = '12px Arial';
                const statsLines = [
                    'Time: ' + Math.floor(sessionSummary.timeSurvived / 1000) + 's',
                    'Food: ' + sessionSummary.foodEaten + ' (' + sessionSummary.foodTypes + ' types)',
                    'Max Combo: ' + sessionSummary.maxCombo + 'x',
                    'Length: ' + sessionSummary.length,
                    'XP Earned: ' + sessionSummary.xpEarned,
                ];
                for (let i = 0; i < statsLines.length; i++) {
                    ctx.fillText(statsLines[i], CANVAS_WIDTH / 2, yBase + 20 + i * 18);
                }

                // Next achievement hint
                const nextAch = findNextAchievement();
                if (nextAch) {
                    ctx.fillStyle = '#9B59B6';
                    ctx.font = '11px Arial';
                    ctx.fillText('Next: ' + nextAch.name + ' \u2014 ' + nextAch.desc + ' (+' + nextAch.xp + ' XP)', CANVAS_WIDTH / 2, yBase + 20 + statsLines.length * 18 + 8);
                }

                ctx.restore();
            }
```

**Verification:**
- On gameover, session summary shows for 3 seconds, then fades over 0.5s.
- Starting a new game clears the summary data.
- The summary appears above the "Press ENTER to Restart" prompt.

**Commit:**
```bash
git add snake.html && git commit -m "task 21: add session summary overlay on gameover with fade-out"
```

---

## Phase 5: Mobile & Accessibility (Tasks 22-24)

---

### Task 22: Vibration Feedback (Section 5a)

**Goal:** Add vibration on achievement (50ms), level-up (40ms), combo milestone (30ms), power-down (15ms). Respect 300ms debounce.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 22.1 — Add vibration for achievement unlock**

In `checkAchievements()` (~line 2200), after `playSound('achievement');` add:
```js
                    vibrate(50);
```

**Step 22.2 — Add vibration for level-up**

In `awardXP()` (in the level-up block from Task 17), add after `playSound('levelup');`:
```js
                    vibrate(40);
```

**Step 22.3 — Add vibration for combo milestone**

Already included in Task 20.4 — `vibrate(30)` was added in the combo milestone block.

**Step 22.4 — Add vibration for power-down**

In `deactivatePowerUp()`, inside the `if (!silentDeactivate)` block (so it fires on timer expiry or manual deactivation, not during activation swap):

The current code has:
```js
            if (!silentDeactivate) playSound('powerdown');
```

Add:
```js
            if (!silentDeactivate) {
                playSound('powerdown');
                vibrate(15);
            }
```

**Verification:**
- Existing `vibrate()` function (lines 411-419) has 300ms debounce on `lastVibrateTime`.
- Achievement fires at 50ms (most noticeable).
- Level-up fires at 40ms.
- Combo milestone fires at 30ms.
- Power-down fires at 15ms (short buzz).
- If achievement + level-up fire simultaneously (e.g., XP award triggers both), the 300ms debounce ensures only the first vibration plays.

**Commit:**
```bash
git add snake.html && git commit -m "task 22: add vibration feedback for achievement, levelup, combo, powerdown"
```

---

### Task 23: HUD Text Scaling (Section 5b)

**Goal:** Create `hudFont()` helper that scales font sizes by 1.3x on mobile. Apply to all HUD text drawing.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 23.1 — Add mobile detection and HUD scale constant (~line 99 area)**

```js
        const isMobile = window.innerWidth < 500 || ('ontouchstart' in window && window.innerWidth < 700);
        const HUD_SCALE = isMobile ? 1.3 : 1.0;
```

**Step 23.2 — Add `hudFont()` helper**

```js
        function hudFont(weight, size) {
            return (weight || '') + ' ' + Math.round(size * HUD_SCALE) + 'px Arial';
        }
```

**Step 23.3 — Update HUD functions to use `hudFont()`**

`drawTimeAttackHUD()` line 1678:
```js
                ctx.font = 'bold 18px Arial';
```
Replace with:
```js
                ctx.font = hudFont('bold', 18);
```

`drawSnapHUD()` lines 1688, 1692:
```js
                ctx.font = 'bold 14px Arial';
                ctx.fillText('SNAP LV.' + snapLevel, ...
```
Replace with:
```js
                ctx.font = hudFont('bold', 14);
```

`drawDailyHUD()` lines 1709, 1716:
```js
                ctx.font = 'bold 11px Arial';
                ...
                ctx.font = '10px Arial';
```
Replace with:
```js
                ctx.font = hudFont('bold', 11);
                ...
                ctx.font = hudFont('', 10);
```

`drawPowerUpHUD()` line 1740:
```js
                ctx.font = 'bold 11px Arial';
```
Replace with:
```js
                ctx.font = hudFont('bold', 11);
```

`drawRivalHUD()` lines 1749, 1754:
```js
                ctx.font = '12px Arial';
                ...
                ctx.font = '12px Arial';
```
Replace with:
```js
                ctx.font = hudFont('', 12);
```

`drawXPBar()` line 1640:
```js
                ctx.font = 'bold 9px Arial';
```
Replace with:
```js
                ctx.font = hudFont('bold', 9);
```

`drawMuteIndicator()` line 1610:
```js
                ctx.font = '16px Arial';
```
Replace with:
```js
                ctx.font = hudFont('', 16);
```

**Step 23.4 — Update `drawOverlay()` for minimal scaling**

The overlay text uses large fonts (32px, 20px, 22px, etc.) — these are already large enough. Only the subtext (13px, 14px) needs scaling.

In `drawOverlay()`, for the smaller fonts:
- `ctx.font = '13px Arial';` → `ctx.font = hudFont('', 13);`
- `ctx.font = '14px Arial';` → `ctx.font = hudFont('', 14);`
- `ctx.font = '12px Arial';` → `ctx.font = hudFont('', 12);`
- `ctx.font = '11px Arial';` → `ctx.font = hudFont('', 11);`
- `ctx.font = '10px Arial';` → `ctx.font = hudFont('', 10);`

Keep large fonts (32px, 36px, 20px, 22px, 24px, 28px) as-is.

**Step 23.5 — Update `drawHelpOverlay()` to use `hudFont()`**

All fonts in `drawHelpOverlay()` use 12px, 11px, 16px — replace with `hudFont()` calls.

**Verification:**
- On desktop (viewport > 500px), `HUD_SCALE = 1.0` → no visible change.
- On mobile (viewport < 500px or touch device < 700px), HUD_SCALE = 1.3 → text sizes are 1.3x larger.
- The `hudFont()` helper generates correct strings like `'bold 12px Arial'` for size 9 on mobile.

**Commit:**
```bash
git add snake.html && git commit -m "task 23: add hudFont helper for mobile HUD text scaling"
```

---

### Task 24: Touch Indicator (Section 5c)

**Goal:** Add brief blue flash on swipe detection for visual feedback.

**Files Modified:** `/Users/jeko/tmp/snakes/snake.html`

**Steps:**

**Step 24.1 — Add `touchIndicatorTimer` variable (~line 99 area)**

```js
        let touchIndicatorTimer = 0;
```

**Step 24.2 — Set timer on swipe detection in `touchend` handler (~line 2614)**

Replace:
```js
          if (gameState === 'playing') {
            setNextDirection(newDx, newDy);
          }
```

With:
```js
          if (gameState === 'playing') {
            setNextDirection(newDx, newDy);
            touchIndicatorTimer = 80; // 80ms indicator
          }
```

**Step 24.3 — Add timer decay in `animateVisuals()` (~after other timer decays)**

Add:
```js
            if (touchIndicatorTimer > 0) touchIndicatorTimer = Math.max(0, touchIndicatorTimer - delta);
```

**Step 24.4 — Add `touchIndicatorTimer` to `needsRedraw` check**

Add `touchIndicatorTimer > 0` to the condition:
```js
            const needsRedraw = visualDirty || particles.length > 0 || flashOverlay || shakeTimer > 0 || eatAnimTimer > 0 || snapLevelUpFlash > 0 || levelUpFlash > 0 || touchIndicatorTimer > 0 || (gameMode === 'snap' && gameState === 'playing');
```

**Step 24.5 — Draw touch indicator in `drawGame()` (after game entities, before overlays)**

Add a `drawTouchIndicator()` function and call it from `drawGame()`:

```js
        function drawTouchIndicator() {
            if (touchIndicatorTimer <= 0) return;
            const alpha = (touchIndicatorTimer / 80) * 0.3;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#4488FF';
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.restore();
        }
```

In `drawGame()`, call it after the HUD elements but before overlays:
```js
            drawRivalHUD();
            drawTouchIndicator(); // <-- NEW
            if (gameState === 'idle') {
```

**Verification:**
- Swipe while playing → blue tint flash appears for 80ms.
- The alpha decays from ~0.3 down to 0 over 80ms.
- The indicator only shows during gameplay (not in idle/paused/gameover).
- Visual feedback is subtle but confirms gesture registration.

**Commit:**
```bash
git add snake.html && git commit -m "task 24: add touch indicator flash on swipe detection"
```

---

## Final Integration

**Goal:** Run through all 24 tasks and verify they work together.

**Steps:**

**Step F.1 — Verify game loads without console errors**

Open `snake.html` in a browser, check for any console errors (F12 → Console tab).

**Step F.2 — Verify each game mode starts and plays**

- Classic: Start → eat food → verify score/speed/combo
- Time Attack: Start → verify countdown HUD
- Zen: Start → verify no death, ENTER to quit
- Daily: Start → verify challenge HUD
- Snap: Start → verify shrink timer and snap HUD

**Step F.3 — Verify all 7 speed locations**

```bash
rg 'getEffectiveSpeed' snake.html
```
Should show 6 call sites. Plus the 1 explicit `getSpeed()` in `deactivatePowerUp()`.

**Step F.4 — Verify all DOM references cached**

```bash
rg 'document\.getElementById\(' snake.html
```
Should only show: `statsPanel`, `achievementsPanel`, `cosmeticsPanel`, `dpad`, `gameCanvas`, `score`, `highScore`.

**Step F.5 — Verify localStorage all uses `saveManager`**

```bash
rg 'localStorage\.' snake.html
```
Should return zero results.

**Step F.6 — Verify particle cap**

Trigger death with Fireworks effect (50 particles) when particles is near 500.

**Step F.7 — Verify help overlay toggle**

Press H in idle, playing, paused, gameover — overlay appears. Press H again — disappears. Start game — closes automatically.

**Step F.8 — Verify no regressions in rAF (no write contention)**

The rAF loop (`animateVisuals`) reads game state but NEVER writes to it (except `renderTime` which is write-only from rAF, and the decay timers which are expected). Verify no `gameState =`, `dx =`, `dy =`, `food =`, `score +=`, etc. in `animateVisuals`.

```bash
git add snake.html && git commit -m "v5: final integration and verification"
```
