# Snake Game — Next Level Design Plan (v2)

## Vision
Transform the basic Snake game into a polished, immersive experience with visual flair, deeper gameplay, and satisfying feedback — all within a single HTML file.

---

## Architectural Decision: Dual Render Loops

The game will use **two rendering paths**:

1. **Game tick** (`setInterval`, 50-120ms): Runs `updateGame()` → calls `drawGame()` for core game state (snake, food, grid, overlays)
2. **Visual refresh** (`requestAnimationFrame`, 60fps): Runs `animateVisuals()` for particles and score counter animation

This decouples game logic speed from visual smoothness. Particles and score animation run at 60fps regardless of game speed. Both loops coexist without conflict — the rAF loop reads game state (particle array, score values) but never writes to game logic.

---

## Feature Package

### 1. Particle System (Death Explosion + Food Burst — NO trail)
**Difficulty:** Medium

**Implementation:**
- Global `particles: Array<{x, y, vx, vy, life, maxLife, color}>`
- **Food Burst:** When food eaten, spawn 12 particles at food position with random velocity, bright green/gold. Lifetime 0.5s.
- **Death Explosion:** When `gameOver()` triggers, spawn 30 particles at snake head with red/orange. Lifetime 1s.
- **NO trail particles** — they add visual noise on a 20×20 grid and the tail position is lost after `snake.pop()`.
- Update and render particles in the rAF `animateVisuals()` loop (60fps), not in the game-tick `drawGame()`.
- Each frame: update position, reduce life, calc alpha = life/maxLife, draw fading circles.

### 2. Snake Head with Eyes
**Difficulty:** Easy

**Implementation:**
- In `drawGame()`, after drawing the head rectangle, draw two 4px white circles + 2px black pupils (even pixels for crisp rendering).
- Eye position depends on direction (`dx`, `dy`):
  - Moving right: right side, vertically centered
  - Moving left: left side
  - Moving up: top
  - Moving down: bottom
- Defensive default: if `dx === 0 && dy === 0`, default eyes to "right" position.

### 3. Grid Background
**Difficulty:** Easy

**Implementation:**
- In `drawGame()`, after `ctx.clearRect()`, draw faint grid lines: `rgba(255, 255, 255, 0.04)`, lineWidth 1.
- 20×20 grid on 400×400 canvas — 40 line segments total, negligible performance cost.

### 4. Special Food Types (3 types — NO combo timer)
**Difficulty:** Medium

**Implementation:**
- `food` object gains `type` field: `'normal' | 'bonus' | 'speed'`
- **Normal** (80%): green, +10 points
- **Bonus** (15%): gold, +30 points. Subtle pulse via `Math.sin(Date.now() / 200)` scaled to max 1.5× tile size. Collision hitbox remains 1×1 tile. The visual extends into adjacent tiles but collision is exact grid position. **Document this mismatch.**
- **Speed** (5%): blue/cyan, +5 points, but **NO combo timer** — just gives the snake a 2-second speed boost (reduce interval further, then restore). This creates actual speed gameplay without invisible timer state.
- `generateFood()` uses weighted random selection.
- `drawGame()` renders different colors. Bonus food uses the pulse scale.
- `updateGame()` applies type-specific scoring and (for speed food) temporarily adjusts the interval with a `setTimeout` restore.

**Why NO combo timer:** The combo mechanic introduced time-based state that interacted badly with auto-pause, wall wrapping, and had no visual affordance. Pure speed boost is simpler, more visible, and more fun.

### 5. Wall Wrapping
**Difficulty:** Easy

**Implementation:**
- **DO NOT modify `checkCollision()`.** Keep it as a pure predicate (returns boolean, no side effects).
- Add new function `wrapPosition(pos)` that returns a wrapped position:
  ```
  function wrapPosition(pos) {
      return {
          x: ((pos.x % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH,
          y: ((pos.y % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT
      };
  }
  ```
- In `updateGame()`, call explicitly: `const wrappedHead = wrapPosition(newHead);` then `if (checkCollision(wrappedHead))`.
- `checkCollision()` only checks self-collision (wall hits wrap instead).
- Wall wrapping changes the game feel fundamentally — self-collision becomes the only death. This is acceptable for this version.

### 6. Web Audio API Sound Effects
**Difficulty:** Medium

**Implementation:**
- **ALL sounds use sine waves** — no square, sawtooth, or triangle (avoid harshness).
- `AudioContext` lazy-initialized on first user interaction.
- `playSound(name)` dispatcher that maps sound names to oscillator configs. Call sites use `playSound('eat')`, not raw oscillators.
- High-level wrapper `playSound(name)`:
  - `'eat'`: sine 523Hz (C5), 80ms
  - `'bonus'`: sine ascending 523→1047Hz, 150ms sweep
  - `'speed'`: sine 440Hz, 60ms
  - `'gameover'`: sine descending 440→220Hz, 500ms sweep
  - `'pause'`: sine 330Hz, 50ms
  - `'resume'`: sine 440Hz, 50ms
- **NO direction-change sound** — it creates audio clutter during fast play.
- Frequency sweeps: use `oscillator.frequency.linearRampToValueAtTime(endFreq, audioCtx.currentTime + duration)`.
- **Mute toggle**: Press `M` to mute/unmute. Store preference in `localStorage` key `'snake_muted'`. When muted, `playSound()` returns early.
- Gain: 0.2 (slightly quieter than original 0.3).

### 7. Animated Score Counter
**Difficulty:** Medium

**Implementation:**
- `displayedScore` global variable.
- When `score` increases, set a target.
- In the rAF `animateVisuals()` loop: `delta = score - displayedScore; if (delta > 0) displayedScore += Math.ceil(delta * 0.3);`
- **Snap**: if `delta < 1`, snap to `displayedScore = score`.
- Use `Math.ceil()` to prevent crawling on the last few points. The counter always moves at least 1 point per rAF frame until convergence.
- Update DOM: `scoreEl.textContent = displayedScore` in the rAF loop.
- No `animatingScore` boolean needed — just check `displayedScore !== score`.

### 8. Window Focus Handling (Auto-Pause)
**Difficulty:** Easy

**Implementation:**
- `document.addEventListener('visibilitychange', ...)`
- When `document.hidden === true && gameState === 'playing'`:
  - `gameState = 'paused'`
  - `clearInterval(gameInterval)`
  - `gameInterval = null`
  - **Call `drawGame()`** to show "PAUSED" overlay immediately.
- Resume via existing P/Space key handler (already checks `gameState === 'paused'` and restarts interval).

### 9. Input Buffering
**Difficulty:** Medium

**Implementation:**
- Global `nextDirection: {dx, dy} | null`
- On keydown: **relax the reversal check** — store direction in `nextDirection` without immediate validation.
- In `updateGame()`, at the very start:
  - Validate against current `dx/dy`: if `nextDirection.dx === -dx && nextDirection.dy === -dy`, it's a reversal — ignore.
  - Otherwise: `dx = nextDirection.dx; dy = nextDirection.dy; nextDirection = null`
- Keydown handler checks reversal against **`nextDirection ?? dx/dy`** — i.e., if a buffer already exists, validate against the buffered direction, not current `dx/dy`. This prevents "Right → Down → [next tick, Right consumed] → Up rejected because current dx=Right" scenario.
- Single-slot buffer: rapid inputs overwrite each other. Documented as intentional.

---

## Data Flow Changes

### New Globals
```
particles: Array                // rAF: particle system
nextDirection: {dx,dy} | null   // input buffering
displayedScore: number          // rAF: score animation
audioCtx: AudioContext | null   // lazy init
muted: boolean                  // from localStorage
```

### Modified Functions

| Function | Change |
|----------|--------|
| `generateFood()` | Add weighted random type selection |
| `checkCollision()` | **No change** — keep pure. Wall death removed, only self-collision |
| `updateGame()` | Apply input buffer, wall wrap via `wrapPosition()`, special food scoring, speed boost, trigger sounds call |
| `drawGame()` (formerly `draw()`) | Grid background, snake eyes, food type rendering (colors, bonus pulse). State overlays unchanged |
| `gameOver()` | Spawn death particles, play game over sound |
| `resetGame()` | Clear particles, reset displayedScore, clear nextDirection |

### New Functions

| Function | Purpose |
|----------|---------|
| `wrapPosition(pos)` | Pure function: wrap coordinates modulo canvas bounds |
| `spawnParticles(x, y, count, color)` | Populate particle array |
| `animateVisuals()` | rAF loop: update particles, animate score. Called from `requestAnimationFrame` |
| `playSound(name)` | Dispatches sound configs to Web Audio API |
| `drawGame()` | Renamed from `draw()` — game state rendering only |

### Decomposed `drawGame()` Sub-functions
- `drawGrid()`
- `drawFood()`
- `drawSnake()` (includes eyes)
- `drawOverlays()` (state-dependent text)

### Decomposed `updateGame()` Extraction
- Input buffer application (inline, 3 lines)
- Wall wrapping via `wrapPosition` (1 line)
- Special food scoring in `updateGame()` with branching

---

## Implementation Order

| Order | Task | Depends On | Risk |
|-------|------|------------|------|
| 1 | Add `wrapPosition()` function | — | Low |
| 2 | Modify `updateGame()`: wall wrap + rename draw() | 1 | Low |
| 3 | Input buffering: `nextDirection` + keydown handler fix | — | Low |
| 4 | Grid background | — | Low |
| 5 | Snake head with eyes | — | Low |
| 6 | Window focus handling (auto-pause) | — | Low |
| 7 | Rename `draw()` → `drawGame()` + decompose into sub-functions | 2 | Medium |
| 8 | Special food types (3 types, no combo) | 7 | Medium |
| 9 | Web Audio API: `playSound()`, mute toggle, all sound triggers | — | Medium |
| 10 | Add rAF `animateVisuals()` loop | 7 | Medium |
| 11 | Animated score counter (rides rAF) | 10 | Medium |
| 12 | Particle system (food burst + death, rides rAF) | 10 | High |

---

## Edge Cases & Cross-Feature Interactions

| Interaction | Handling |
|---|---|
| Speed food speed boost + auto-pause | `setTimeout` for boost restore is NOT paused. Acceptable — boost expires in 2s real time. |
| Bonus food 1.5× visual vs 1× hitbox | Visual extends into adjacent tiles. Doc: "hitbox is the exact grid tile, not the visual". |
| Mute state persisted across sessions | `localStorage` key `'snake_muted'`. Check on init. |
| Input buffer overwritten by rapid keys | Single-slot design. Last valid direction wins. |
| rAF + setInterval both running | rAF calls `animateVisuals()` which reads `displayedScore` and `particles`. Game tick calls `drawGame()`. No write contention — rAF never writes game state. |
| Particle cleanup on reset/game over | `resetGame()` sets `particles = []`. |
