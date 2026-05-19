# Prestige & Shortcuts Footer — Design Spec

## Problem

In the idle/main menu state, prestige info (level, pinnacle rank, "Press X to Prestige") and keyboard shortcuts are rendered as canvas text in the bottom ~55px of the 400x400 canvas. This crams the mode selector and daily challenge info, leaving no breathing room.

## Solution

Move prestige info and keyboard shortcuts out of the canvas into a DOM footer below the canvas. Keep a tiny `P{level}` badge on the canvas XP bar as the always-visible anchor.

## Design

### Canvas Changes (drawOverlay, idle branch)

**Delete** the block starting with `if (prestigeLevel > 0 || pinnacleRank > 0)` through the end of keyboard/touch shortcut text rendering. This removes: prestige/pinnacle text, overcharge text, level/XP text, "Press X to Prestige" hint, and shortcut lines.

The tiny `P{level}` badge in `drawXPBar()` (bottom-left of XP bar) stays unchanged.

### HTML

Insert between `<canvas>` and `<div id="dpad">`:

```html
<div id="menuFooter">
  <div id="prestigeInfo"></div>
  <div id="shortcutInfo"></div>
</div>
```

### CSS

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

### JS Logic (event-driven, NOT per-frame)

New function `updateMenuFooter()` called on:
1. Entering idle state (in `resetGame()`)
2. X key prestige action (in keydown handler)
3. Level/XP/overcharge changes during idle (if applicable — currently these only change on prestige action during idle, so covered by #2)

Function behavior:
- If `gameState === 'idle'`: set `display: block`, build innerHTML from current state
- If `gameState !== 'idle'`: hide footer (`display: none`)

Default state: `display: none` (set in CSS). No per-frame updates.

### Content Mapping

**prestigeInfo** (idle only):
- If `pinnacleRank > 0`: `⚡ Pinnacle {pinnacleRank} (+{pinnacleRank*2}%)` in `.prestige-gold`
- Else if `prestigeLevel > 0`: `⭐ Prestige {prestigeLevel}` in `.prestige-gold`
- If `xpOvercharge > 0`: `⚡ Overcharge: {xpOvercharge}` in `.prestige-purple`
- `Lv.{level} | XP: {xp}` in `.prestige-gray`
- If `level >= 20`: `Press X to Prestige` (or `X → Pinnacle Rank {n} (+2% Score)` if pinnacle path) in `.prestige-gold`

**shortcutInfo** (idle only):
- Desktop: `↑↓ Select | ENTER Start | TAB Stats | F Achievements | C Cosmetics`
- Mobile (`hasTouch`): `👆 Tap to Start | Swipe ↑↓ to change mode`

### Mobile Overflow

On small screens (iPhone SE 667px), total vertical: canvas(70vh ≈ 467px) + footer(~30px) + dpad(~180px) + score(~50px) = ~727px, which overflows.

Solution: `@media (pointer: coarse) and (max-height: 700px)` reduces canvas `max-height` to `55vh`, giving: canvas(~367px) + footer(~24px) + dpad(~180px) + score(~50px) = ~621px, which fits.

### Out of Scope

- Mobile prestige trigger (X key only — existing tech debt, separate feature)
- Overcharge display during gameplay (was never shown during play)
- Changes to gameover overlay (footer stays hidden during gameover)