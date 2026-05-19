# Prestige & Shortcuts Footer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move prestige info and keyboard shortcuts from the 400×400 canvas idle overlay into a DOM footer element below the canvas.

**Architecture:** Delete canvas text rendering for prestige/shortcuts in `drawOverlay()`, add a `<div id="menuFooter">` below the canvas, create an `updateMenuFooter()` function called on state transitions (not per-frame), and add CSS for styling + mobile overflow mitigation.

**Tech Stack:** Vanilla JS, HTML, CSS (single-file game at `snake.html`)

---

### Task 1: Add HTML footer element

**Files:**
- Modify: `snake.html:51-52` (between `<canvas>` and `<div id="dpad">`)

- [ ] **Step 1: Insert menuFooter div after canvas element**

In `snake.html`, after line 51 (`<canvas id="gameCanvas" width="400" height="400"></canvas>`) and before line 52 (`<div id="dpad"...`), insert:

```html
    <div id="menuFooter">
      <div id="prestigeInfo"></div>
      <div id="shortcutInfo"></div>
    </div>
```

- [ ] **Step 2: Verify the footer appears in the DOM (even though hidden)**

Open `snake.html` in a browser. The footer should not be visible (no content, no height). No visual change expected yet.

---

### Task 2: Add CSS styles for menuFooter

**Files:**
- Modify: `snake.html:7-47` (inside the `<style>` block)

- [ ] **Step 1: Add menuFooter styles before the closing `</style>` tag**

Before the closing `</style>` tag (line 47), add:

```css
        #menuFooter {
            display: none;
            margin-top: 4px;
            text-align: center;
            user-select: none;
            line-height: 1.5;
            font-family: Arial, sans-serif;
            max-width: 400px;
        }
        .prestige-gold { color: #FFD700; font-weight: bold; font-size: 14px; }
        .prestige-purple { color: #AA44FF; font-weight: bold; font-size: 13px; }
        .prestige-gray { color: #888; font-size: 14px; }
        .shortcut-dim { color: #555; font-size: 13px; }
        @media (pointer: coarse) {
            #menuFooter { font-size: 12px; line-height: 1.3; max-width: calc(100vw - 20px); }
        }
        @media (pointer: coarse) and (max-height: 700px) {
            #gameCanvas { max-height: 55vh; }
        }
```

- [ ] **Step 2: Verify no visual regression**

Load the page. The footer is still `display: none`. Canvas, dpad, and score elements should appear unchanged.

---

### Task 3: Create updateMenuFooter() function

**Files:**
- Modify: `snake.html` (in the `<script>` section, after `updateScoreDisplay()` near line 780)

- [ ] **Step 1: Add the updateMenuFooter function**

After `updateScoreDisplay()` (line 780), add:

```javascript
        function updateMenuFooter() {
            var footer = document.getElementById('menuFooter');
            if (!footer) return;
            if (gameState !== 'idle') {
                footer.style.display = 'none';
                return;
            }
            footer.style.display = 'block';
            var prestigeInfo = document.getElementById('prestigeInfo');
            var shortcutInfo = document.getElementById('shortcutInfo');
            var info = '';
            if (pinnacleRank > 0) {
                info += '<span class="prestige-gold">\u26A1 Pinnacle ' + pinnacleRank + ' (+' + (pinnacleRank * 2) + '%)</span> ';
            } else if (prestigeLevel > 0) {
                info += '<span class="prestige-gold">\u2B50 Prestige ' + prestigeLevel + '</span> ';
            }
            if (xpOvercharge > 0) {
                var bonusPct = Math.min(50, Math.floor(xpOvercharge / 1000));
                info += '<span class="prestige-purple">\u26A1 Overcharge: ' + xpOvercharge.toLocaleString() + ' (+' + bonusPct + '%)</span> ';
            }
            info += '<span class="prestige-gray">Lv.' + level + ' | XP: ' + xp.toLocaleString() + '</span> ';
            if (level >= 20) {
                if (pinnacleRank > 0) {
                    info += '<span class="prestige-gold">X \u2192 Pinnacle Rank ' + (pinnacleRank + 1) + ' (+2% Score)</span>';
                } else if (prestigeLevel >= 5) {
                    info += '<span class="prestige-gold">X \u2192 Pinnacle Rank 1 (+2% Score)</span>';
                } else {
                    info += '<span class="prestige-gold">Press X to Prestige</span>';
                }
            }
            prestigeInfo.innerHTML = info;
            if (hasTouch) {
                shortcutInfo.innerHTML = '<span class="shortcut-dim">\uD83D\uDC46 Tap to Start | Swipe \u2191\u2193 to change mode</span>';
            } else {
                shortcutInfo.innerHTML = '<span class="shortcut-dim">\u2191\u2193 Select  |  ENTER Start  |  TAB Stats  |  F Achievements  |  C Cosmetics</span>';
            }
        }
```

- [ ] **Step 2: Verify the function loads without syntax errors**

Open browser console. No errors on page load. The footer still won't show because no one calls it yet.

---

### Task 4: Hook updateMenuFooter() into state transitions

**Files:**
- Modify: `snake.html` (3 call sites)

- [ ] **Step 1: Call updateMenuFooter() when entering idle state**

In `resetGame()` (line 698), after `gameState = 'idle';` (line 756), add:

```javascript
            updateMenuFooter();
```

- [ ] **Step 2: Call updateMenuFooter() when leaving idle (startGame)**

In `startGame()` (line 782), after `gameState = 'playing';` (line 845), add:

```javascript
            updateMenuFooter();
```

- [ ] **Step 3: Call updateMenuFooter() after prestige action**

In the X key handler (line 3223), between `drawGame(1);` (line 3244) and `return;` (line 3245), insert `updateMenuFooter();`:

Change:
```javascript
                drawGame(1);
                return;
```
To:
```javascript
                drawGame(1);
                updateMenuFooter();
                return;
```

- [ ] **Step 4: Call updateMenuFooter() on gameover**

In `gameOver()` (line 1190), after `gameState = 'gameover';` (line 1194), add:

```javascript
            updateMenuFooter();
```

- [ ] **Step 5: Call updateMenuFooter() on Escape back to idle**

Find the line where `gameState = 'idle'` is set on Escape (line 3314 or wherever the idle transition from paused/gameover happens). After that line, add:

```javascript
            updateMenuFooter();
```

Note: there may be multiple `gameState = 'idle'` transitions. Search for all of them and add the call after each one. The key ones are:
- `resetGame()` line 756 — already covered in Step 1
- Escape handler line 3314 — add `updateMenuFooter();` after it
- Any other `gameState = 'idle'` assignments — check lines 756, 3314 and any others

- [ ] **Step 6: Verify footer appears on idle and hides on gameplay**

Load page → footer should show prestige info + shortcuts. Press Enter → footer should hide. Press Escape → footer should show again. Press X when level >= 20 → footer should update with new prestige level.

---

### Task 5: Delete canvas text from drawOverlay() idle branch

**Files:**
- Modify: `snake.html:1790-1833` (the prestige/shortcuts text block in `drawOverlay()`)

- [ ] **Step 1: Delete the prestige/shortcuts block**

Delete lines 1790-1833 entirely. This is the block from `if (prestigeLevel > 0 || pinnacleRank > 0) {` through the keyboard/touch shortcut `fillText` call, inclusive. The line after the deleted block should be `ctx.restore();` (currently line 1834).

The deleted code covers:
- Prestige/pinnacle text (lines 1790-1800)
- Overcharge text (lines 1801-1807)
- Level/XP text (lines 1808-1811)
- "Press X to Prestige" hint (lines 1812-1825)
- Keyboard/touch shortcuts (lines 1826-1833)

- [ ] **Step 2: Verify canvas idle screen shows clean mode list without prestige/shortcuts**

Load page. The idle screen should show only:
- "SNAKE" title at top
- Mode selectors (6 modes)
- Daily challenge info (if in daily mode)
- Clean dark background below the mode list

The footer (below the canvas) should show prestige info and shortcuts.

- [ ] **Step 3: Verify gameplay canvas is unaffected**

Start a game. The canvas should show gameplay with the P-badge still on the XP bar (bottom-left). The footer should be hidden.

- [ ] **Step 4: Verify prestige action still shows toast**

Press X when level >= 20. The toast should appear. The footer should update with new prestige level.

---

### Task 6: Handle Welcome overlay edge case

**Files:**
- Modify: `snake.html:3490-3493` (touch dismiss handler)

There are two welcome overlay dismiss paths:
1. **Keydown (line 3194-3196)**: Sets `welcomeOverlay = false`, then the key falls through to normal processing (Enter → `startGame()` or Escape → idle transition). These paths already call `updateMenuFooter()` via Task 4 hooks. No change needed.
2. **Touch (line 3490-3493)**: Sets `welcomeOverlay = false`, then immediately `return`s. No state transition happens — the player stays idle. The footer must be explicitly shown here.

- [ ] **Step 1: Add updateMenuFooter() call to touch dismiss path**

At line 3491, after `welcomeOverlay = false;` and `saveManager.set('snake_has_played', '1');` (line 3492), add `updateMenuFooter();` before the `return;` on line 3493:

Change:
```javascript
              welcomeOverlay = false;
              saveManager.set('snake_has_played', '1');
              return; // Touch/click: dismiss but don't start game
```
To:
```javascript
              welcomeOverlay = false;
              saveManager.set('snake_has_played', '1');
              updateMenuFooter();
              return; // Touch/click: dismiss but don't start game
```

- [ ] **Step 2: Verify welcome overlay dismiss shows footer on mobile**

If testing with a fresh browser (clear `snake_has_played` from localStorage), the welcome overlay should appear. On tap dismiss, the footer should show prestige info and the mobile touch hint.

---

### Task 7: Mobile testing verification

- [ ] **Step 1: Verify mobile footer shows touch hints instead of keyboard shortcuts**

If `hasTouch` is true, the `shortcutInfo` div should show "👆 Tap to Start | Swipe ↑↓ to change mode" instead of the keyboard text. Test by using browser DevTools device emulation.

- [ ] **Step 2: Verify mobile short viewport shrinks canvas**

On a viewport with `pointer: coarse` and `max-height: 700px`, the canvas should use `max-height: 55vh` instead of `70vh`, making room for the footer and dpad.

- [ ] **Step 3: Verify footer hides during gameplay on mobile**

Start a game on mobile. The footer should disappear. The dpad and score should remain visible.

---

### Task 8: Commit

- [ ] **Step 1: Stage and commit all changes**

```bash
git add snake.html
git commit -m "feat: move prestige info and keyboard shortcuts from canvas to DOM footer"
```