# The Living Arena Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Snake game with an AI rival snake, power-up drops, a Snap survival mode, and technical polish — all within the existing single-file HTML architecture.

**Architecture:** All changes are additive to the existing 1504-line `snake.html`. New feature sections are inserted with clear comment headers. The existing dual-loop architecture (setInterval for game logic, requestAnimationFrame for visuals) is preserved. All new features reuse existing systems (particles, collision, drawing, sounds).

**Tech Stack:** Vanilla HTML5 Canvas, JavaScript, Web Audio API, localStorage

**Depends On:** Design doc at `docs/superpowers/specs/2026-05-18-snake-living-arena-design.md`

---

### Task 1: Technical Quick Wins

**Files:**
- Modify: `snake.html`

**Description:** Four small technical improvements with minimal risk. Can be done in any order.

- [ ] **1.1: Batched grid rendering**

  In `drawGrid()` function (around line 774), consolidate the grid line drawing from separate `beginPath()`/`stroke()` per line into a single batched path:

  ```js
  // BEFORE (lines 780-791):
  for (let x = 0; x <= CANVAS_WIDTH; x += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
  }

  // AFTER:
  ctx.beginPath();
  for (let x = 0; x <= CANVAS_WIDTH; x += TILE_SIZE) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
  }
  for (let y = 0; y <= CANVAS_HEIGHT; y += TILE_SIZE) {
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
  }
  ctx.stroke();
  ```

- [ ] **1.2: Fix `gameInterval = null` in `gameOver()`**

  In `gameOver()` (around line 460-461), change:
  ```js
  clearInterval(gameInterval);
  ```
  To:
  ```js
  clearInterval(gameInterval);
  gameInterval = null;
  ```

- [ ] **1.3: Fix flash overlay draw order**

  In `animateVisuals()` (around lines 618-656), the flash overlay code at lines 626-629 runs before the particle draw code at lines 650-656. Move the flash overlay block to be the ABSOLUTE LAST draw operation in `animateVisuals()`, after all particle rendering.

  The current order (simplified):
  1. Shake save/restore wrapping `drawGame()`
  2. Flash overlay alpha update (lines 626-629)
  3. Ghost trail draw (lines 631-643)
  4. Sparkle trail particles (lines 645-648)
  5. Particle rendering (lines 650-656)
  6. Score animation (658-665)
  7. Combo display (667-677)

  Change to:
  1. Shake save/restore wrapping `drawGame()`
  2. Ghost trail draw
  3. Sparkle trail particles
  4. Particle rendering
  5. Score animation
  6. Combo display
  7. Flash overlay alpha update + render (MUST render after everything else)

  The flash overlay render code (lines 900-905 in `drawGame()`) should remain in `drawGame()` since it's also called from game ticks. But in `animateVisuals()`, the alpha update should happen early (so it decays during the frame) and the render should be the last thing. Actually, the simplest fix: move the flash overlay alpha decay BEFORE `drawGame()` call, and keep the flash overlay render in `drawGame()` (already is at line 900-905 which is after particles in the game-tick draw path too).

  Wait — checking more carefully: In `drawGame()`, the draw order is: grid → obstacles → food → snake → time HUD → overlays → flash overlay. The flash overlay IS already last in `drawGame()`. The issue is in `animateVisuals()` where the flash overlay alpha check runs before particle rendering. Let me check again...

  Actually the `drawGame()` already has the correct order (flash overlay at line 900 is after everything). And `animateVisuals()` calls `drawGame()` at line 623, then draws particles at lines 650+. And the flash overlay ALPHA UPDATE is at line 626. The issue is that `animateVisuals()` draws particles AFTER `drawGame()` but the flash overlay in `drawGame()` should still be on top because it's a full-screen fillRect with alpha.

  Actually, looking at this more carefully: `drawGame()` at line 900 draws the flash overlay with `ctx.globalAlpha`. Then `animateVisuals()` draws particles at lines 650-656 after `drawGame()` has already returned. This means particles are on TOP of the flash overlay. THAT'S the bug.

  **Fix:** Move the particle draw in `animateVisuals()` to BEFORE the `drawGame()` call, or put the flash overlay render LAST in `animateVisuals()`. Simplest approach: move the `drawGame()` call to AFTER all particle rendering, and keep the flash overlay in `drawGame()`.

  ```js
  // In animateVisuals(), restructure so drawGame() is called LAST:
  
  // 1. Update flashOverlay alpha
  if (flashOverlay) {
      flashOverlay.alpha -= delta * 0.004;
      if (flashOverlay.alpha <= 0) flashOverlay = null;
  }
  
  // 2. Draw ghost trail
  if (cosmetics.trace === 'trace_ghost' && ...) { ... }
  
  // 3. Draw sparkle particles  
  if (cosmetics.trace === 'trace_sparkle' && ...) { ... }
  
  // 4. Render particles
  for (const p of particles) { ... }
  
  // 5. Draw game (grid, obstacles, food, snake, overlays, flash overlay)
  if (shakeTimer > 0 && gameState !== 'paused') {
      ctx.save();
      ctx.translate(...);
  }
  drawGame();
  if (shakeTimer > 0 && gameState !== 'paused') ctx.restore();
  
  // 6. Score animation
  // 7. Combo display
  ```

- [ ] **1.4: Extract shared direction utility**

  The direction reversal check is duplicated in the keydown handler (lines 1426-1429) and the touch swipe handler (lines 1482-1485). Extract into a shared function:

  ```js
  function setNextDirection(newDx, newDy) {
      const currentDir = nextDirection ?? { dx, dy };
      if (newDx !== -currentDir.dx || newDy !== -currentDir.dy) {
          nextDirection = { dx: newDx, dy: newDy };
      }
  }
  ```

  Replace both usage sites with `setNextDirection(newDx, newDy)`.

  In the keydown handler (around line 1426), replace:
  ```js
  const currentDir = nextDirection ?? { dx, dy };
  if (newDx !== -currentDir.dx || newDy !== -currentDir.dy) {
      nextDirection = { dx: newDx, dy: newDy };
  }
  ```
  With:
  ```js
  setNextDirection(newDx, newDy);
  ```

  In the touch swipe handler (around line 1482), replace the same pattern with `setNextDirection(newDx, newDy)`.

**Verification:**
1. Load `snake.html` in browser. Grid should render identically but faster.
2. Play a game, let it end. Press ENTER to restart. Should work (no timer race).
3. Eat food — flash overlay should appear on top of everything.
4. Test both keyboard and touch controls — direction changes should work.

---

### Task 2: Snap Mode

**Files:**
- Modify: `snake.html`

**Description:** Add Snap Mode — a new game mode where the snake shrinks every 3 seconds and eating is required for survival.

**Context:** This feature adds a 5th game mode to the MODE_CONFIG and MODE_ORDER arrays, a shrink timer variable, shrink logic in the update loop, and visual indicators.

- [ ] **2.1: Add MODE_CONFIG entry and MODE_ORDER entry**

  Add to `MODE_CONFIG` object (around line 205):
  ```js
  snap: {
      name:'Snap', speed:90, selfCollision:true, wallDeath:false, wrap:true,
      timer:null, scoreIs:'points', earnXP:true, achievementsEnabled:true
  }
  ```

  Add `'snap'` to `MODE_ORDER` array (around line 233):
  ```js
  const MODE_ORDER = ['classic', 'timeAttack', 'snap', 'zen', 'daily'];
  ```

  Add description in `getModeDesc()` (around line 270):
  ```js
  snap: 'Snake shrinks every 3s — keep eating to survive!',
  ```

- [ ] **2.2: Add shrink timer global variable**

  Add near other globals (around line 120):
  ```js
  let shrinkTimer = 3000;
  ```

- [ ] **2.3: Initialize shrinkTimer in resetGame()**

  In `resetGame()` (around line 313), add:
  ```js
  shrinkTimer = 3000;
  ```

- [ ] **2.4: Add shrink logic in updateGame()**

  In `updateGame()` (around line 908), after the movement and collision checks but before the drawGame() call, add:

  ```js
  // Snap mode shrink logic
  if (gameMode === 'snap') {
      shrinkTimer -= getSpeed(); // subtract one tick's worth of time
      if (shrinkTimer <= 0) {
          if (snake.length <= 1) {
              gameOver();
              return;
          }
          snake.pop();
          shrinkTimer = 3000;
          spawnParticles(tail.x, tail.y, 6, '#FF4444');
          playSound('eat');
      }
  }
  ```

  Also modify the eat block (around line 946-1004): when food is eaten in snap mode, reset `shrinkTimer = 3000`. Additionally, for rare/epic foods, add +1000ms (capped at 5000). For bonus foods, add +2000ms (capped at 5000):

  ```js
  // In the eat block, after score update:
  if (gameMode === 'snap') {
      shrinkTimer = 3000;
      if (eatenType === 'rare' || eatenType === 'epic') {
          shrinkTimer = Math.min(5000, shrinkTimer + 1000);
      } else if (eatenType === 'bonus') {
          shrinkTimer = Math.min(5000, shrinkTimer + 2000);
      }
  }
  ```

- [ ] **2.5: Add timer ring drawing to drawSnake()**

  In `drawSnake()` (around line 833), after drawing the head, if `gameMode === 'snap'`:

  Draw a circular timer ring around the snake head:
  ```js
  if (gameMode === 'snap') {
      const head = snake[0];
      const cx = head.x + TILE_SIZE / 2;
      const cy = head.y + TILE_SIZE / 2;
      const radius = TILE_SIZE * 0.8;
      const fraction = shrinkTimer / 3000;
      
      // Choose color based on remaining time
      let ringColor;
      if (fraction > 0.5) ringColor = '#44FF44';       // green
      else if (fraction > 0.25) ringColor = '#FFAA00';   // yellow
      else ringColor = '#FF4444';                         // red
      
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + fraction * 2 * Math.PI);
      ctx.stroke();
  }
  ```

- [ ] **2.6: Add Snap mode HUD to drawGame()**

  In `drawGame()` (around line 876), after the Time Attack HUD section, add:
  ```js
  if (gameMode === 'snap' && gameState === 'playing') {
      const fraction = shrinkTimer / 3000;
      ctx.fillStyle = fraction > 0.5 ? '#44FF44' : fraction > 0.25 ? '#FFAA00' : '#FF4444';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('SNAP', CANVAS_WIDTH - 5, 5);
      
      // Timer bar
      const barWidth = 80;
      const barHeight = 6;
      const barX = CANVAS_WIDTH - 10 - barWidth;
      const barY = 22;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = fraction > 0.5 ? '#44FF44' : fraction > 0.25 ? '#FFAA00' : '#FF4444';
      ctx.fillRect(barX, barY, barWidth * fraction, barHeight);
  }
  ```

**Verification:**
1. Load `snake.html`. Arrow up/down on idle screen — "Snap" should appear in mode list.
2. Select Snap mode, press ENTER to start. Snake should shrink every 3s.
3. Eat food — shrink timer should reset to 3s.
4. Let snake shrink to length 1, then one more shrink → game over.
5. Eat rare food — timer should show bonus time.
6. Visual timer ring should appear on snake head.

---

### Task 3: Power-Up Drops

**Files:**
- Modify: `snake.html`

**Description:** Add a power-up system with three types (Shield, Magnet, Slow-Motion) that spawn as special pickups on the grid.

**Context:** This feature extends `generateFood()` to sometimes spawn a power-up instead of food, adds power-up state management, visual effects, and HUD elements.

- [ ] **3.1: Add POWERUP_TYPES config**

  Near `FOOD_TIERS` (around line 224), add:
  ```js
  const POWERUP_TYPES = {
      shield: { name: 'Shield', color: '#4488FF', shape: 'circle', duration: 0 },
      magnet: { name: 'Magnet', color: '#44FF44', shape: 'star', duration: 5000 },
      slowmo: { name: 'Slow-Motion', color: '#AA44FF', shape: 'diamond', duration: 4000 },
  };
  ```

- [ ] **3.2: Add power-up global variables**

  Near other globals (around line 98):
  ```js
  let powerUp = null;              // { type: 'shield'|'magnet'|'slowmo', x, y } when on grid
  let shieldActive = false;
  let magnetActive = false;
  let slowMoActive = false;
  let powerUpTimer = 0;
  let powerUpType = null;          // currently active power-up type string
  let savedInterval = null;        // for slow-mo speed restore
  ```

  Initialize in `resetGame()`:
  ```js
  powerUp = null;
  shieldActive = false;
  magnetActive = false;
  slowMoActive = false;
  powerUpTimer = 0;
  powerUpType = null;
  ```

- [ ] **3.3: Modify generateFood() for power-up spawns**

  In `generateFood()` (around line 288), at the start of the function, add a power-up spawn chance:

  ```js
  // 8% chance to spawn a power-up instead of food
  if (Math.random() < 0.08 && !powerUp) {
      const types = Object.keys(POWERUP_TYPES);
      const type = types[Math.floor(Math.random() * types.length)];
      let newPowerUp;
      do {
          newPowerUp = {
              x: Math.floor(Math.random() * (CANVAS_WIDTH / TILE_SIZE)) * TILE_SIZE,
              y: Math.floor(Math.random() * (CANVAS_HEIGHT / TILE_SIZE)) * TILE_SIZE,
              type: type
          };
      } while (currentSnake.some(s => s.x === newPowerUp.x && s.y === newPowerUp.y) ||
               obstacles.some(o => o.x === newPowerUp.x && o.y === newPowerUp.y));
      powerUp = newPowerUp;
      
      // Still generate normal food too
      // (the food generation continues below)
  }
  ```

  Actually, simpler approach: modify the spawn logic so when a power-up spawns, we skip normal food:

  ```js
  // Power-up spawn chance
  if (!powerUp && Math.random() < 0.08) {
      const types = Object.keys(POWERUP_TYPES);
      const type = types[Math.floor(Math.random() * types.length)];
      let pu;
      do {
          pu = { x: /* random */, y: /* random */, type };
      } while (/* position valid */);
      powerUp = pu;
      // Return the power-up as the "food" result — the eat handler will detect type 'powerup'
      return { x: pu.x, y: pu.y, type: 'powerup', powerupType: type };
  }
  ```

  Wait, this is getting complex for modifying generateFood. Let me think about the cleanest approach.

  **Cleanest approach:** Keep `generateFood()` mostly unchanged. The power-up is a SEPARATE entity on the board — it exists alongside food. When the snake's head touches a power-up tile, it activates.

  In `updateGame()` after the snake moves, add a separate power-up collection check:

  ```js
  // Check power-up collection
  if (powerUp && wrappedHead.x === powerUp.x && wrappedHead.y === powerUp.y) {
      activatePowerUp(powerUp.type);
      powerUp = null;
      spawnParticles(wrappedHead.x, wrappedHead.y, 12, '#FFFFFF');
      playSound('bonus');
  }
  ```

  Power-ups spawn on a timer or when a condition is met (not in generateFood):

  ```js
  // In updateGame() or a timer:
  if (!powerUp && !shieldActive && !magnetActive && !slowMoActive && Math.random() < 0.002) {
      spawnPowerUpPickup();
  }
  ```

  Actually, let me keep it simpler. Add a `powerUpSpawnCounter` that increments each tick. Every ~500 ticks (about every 10 seconds of play), spawn a power-up if none exists:

  ```js
  let powerUpSpawnCounter = 0;
  
  // In updateGame():
  if (!powerUp && !shieldActive && !magnetActive && !slowMoActive) {
      powerUpSpawnCounter++;
      if (powerUpSpawnCounter >= 500) {  // ~every 10 seconds at 50-120ms per tick
          powerUpSpawnCounter = 0;
          spawnPowerUpPickup();
      }
  }
  ```

  Where `spawnPowerUpPickup()` finds a valid random position and picks a random type.

  This is cleaner — power-ups are a time-based spawn, not food-replacement.

- [ ] **3.4: Add spawnPowerUpPickup() function**

  ```js
  function spawnPowerUpPickup() {
      if (powerUp) return;
      const types = Object.keys(POWERUP_TYPES);
      const type = types[Math.floor(Math.random() * types.length)];
      const maxAttempts = 50;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const x = Math.floor(Math.random() * (CANVAS_WIDTH / TILE_SIZE)) * TILE_SIZE;
          const y = Math.floor(Math.random() * (CANVAS_HEIGHT / TILE_SIZE)) * TILE_SIZE;
          // Check no overlap
          if (snake.some(s => s.x === x && s.y === y)) continue;
          if (obstacles.some(o => o.x === x && o.y === y)) continue;
          if (food && food.x === x && food.y === y) continue;
          if (rivalActive && rivalSnake.some(s => s.x === x && s.y === y)) continue; // safe check
          powerUp = { x, y, type };
          return;
      }
  }
  ```

- [ ] **3.5: Add activatePowerUp() function**

  ```js
  function activatePowerUp(type) {
      // Deactivate previous power-up if any
      deactivatePowerUp();
      
      powerUpType = type;
      const config = POWERUP_TYPES[type];
      
      switch (type) {
          case 'shield':
              shieldActive = true;
              powerUpTimer = 8000; // shield lasts 8 seconds or until used
              break;
          case 'magnet':
              magnetActive = true;
              powerUpTimer = config.duration;
              break;
          case 'slowmo':
              slowMoActive = true;
              powerUpTimer = config.duration;
              // Halve the game speed (double the interval)
              clearInterval(gameInterval);
              gameInterval = setInterval(updateGame, getSpeed() * 2);
              break;
      }
      
      const el = document.getElementById('toast');
      if (el) {
          el.textContent = '⚡ ' + config.name + ' Activated!';
          el.style.display = 'block';
          setTimeout(function() { el.style.display = 'none'; }, 2000);
      }
  }
  ```

- [ ] **3.6: Add deactivatePowerUp() function**

  ```js
  function deactivatePowerUp() {
      if (slowMoActive) {
          clearInterval(gameInterval);
          gameInterval = setInterval(updateGame, getSpeed());
      }
      shieldActive = false;
      magnetActive = false;
      slowMoActive = false;
      powerUpTimer = 0;
      powerUpType = null;
  }
  ```

- [ ] **3.7: Add power-up update logic in updateGame()**

  Add after the eat block but before `drawGame()`:

  ```js
  // Power-up timer update
  if (powerUpType) {
      powerUpTimer -= getSpeed();
      if (powerUpTimer <= 0) {
          deactivatePowerUp();
      }
  }
  
  // Magnet effect: pull food toward snake
  if (magnetActive && food) {
      const head = snake[0];
      const dx_food = head.x - food.x;
      const dy_food = head.y - food.y;
      const dist = Math.abs(dx_food) + Math.abs(dy_food);
      if (dist > 0 && dist <= 4 * TILE_SIZE) {
          // Move food 1 tile toward head
          let newFX = food.x;
          let newFY = food.y;
          if (Math.abs(dx_food) >= Math.abs(dy_food)) {
              newFX += dx_food > 0 ? TILE_SIZE : -TILE_SIZE;
          } else {
              newFY += dy_food > 0 ? TILE_SIZE : -TILE_SIZE;
          }
          // Validate new position
          const wrappedFX = ((newFX % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH;
          const wrappedFY = ((newFY % CANVAS_HEIGHT) + CANVAS_HEIGHT) % CANVAS_HEIGHT;
          if (!snake.some(s => s.x === wrappedFX && s.y === wrappedFY) &&
              !obstacles.some(o => o.x === wrappedFX && o.y === wrappedFY)) {
              food.x = wrappedFX;
              food.y = wrappedFY;
          }
      }
  }
  
  // Power-up spawn timer
  if (!powerUp && !powerUpType) {
      powerUpSpawnCounter++;
      if (powerUpSpawnCounter >= 500) {
          powerUpSpawnCounter = 0;
          spawnPowerUpPickup();
      }
  }
  ```

  Also add shield collision negation in the collision path. Modify `checkCollision()` to accept a `checkShield` parameter, or add shield logic in `updateGame()`:

  ```js
  // In updateGame(), when collision is detected:
  if (checkCollision(wrappedHead)) {
      if (shieldActive) {
          shieldActive = false;
          powerUpTimer = 0;
          powerUpType = null;
          spawnParticles(wrappedHead.x, wrappedHead.y, 15, '#4488FF');
          playSound('bonus');
          // Don't die — shield absorbed it
          // Continue the game
      } else {
          snake.push(tail);
          gameOver();
          return;
      }
  }
  ```

- [ ] **3.8: Add power-up collection check in updateGame()**

  After the snake moves (after line 946), add:
  ```js
  // Check power-up collection
  if (powerUp && wrappedHead.x === powerUp.x && wrappedHead.y === powerUp.y) {
      activatePowerUp(powerUp.type);
      powerUp = null;
      spawnParticles(wrappedHead.x, wrappedHead.y, 12, '#FFFFFF');
      playSound('bonus');
  }
  ```

- [ ] **3.9: Add power-up drawing**

  Add a `drawPowerUp()` function and call it in `drawGame()` after `drawFood()`:

  ```js
  function drawPowerUp() {
      if (!powerUp) return;
      const config = POWERUP_TYPES[powerUp.type];
      const cx = powerUp.x + TILE_SIZE / 2;
      const cy = powerUp.y + TILE_SIZE / 2;
      
      // Glow
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = config.color;
      
      ctx.fillStyle = config.color;
      
      // Draw shape based on type
      const r = TILE_SIZE * 0.35;
      if (powerUp.type === 'shield') {
          // Circle
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, 2 * Math.PI);
          ctx.fill();
          // Inner S
          ctx.fillStyle = '#FFF';
          ctx.font = 'bold 14px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S', cx, cy);
      } else if (powerUp.type === 'magnet') {
          // Star shape (4-pointed)
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
      } else if (powerUp.type === 'slowmo') {
          // Diamond
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

  Add `drawPowerUp();` call in `drawGame()` after `drawFood();`.

- [ ] **3.10: Add power-up HUD to drawGame()**

  In `drawGame()`, after the Snap mode HUD, add:
  ```js
  // Active power-up HUD
  if (powerUpType) {
      const config = POWERUP_TYPES[powerUpType];
      const fraction = powerUpType === 'shield' ? 1 : powerUpTimer / config.duration;
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
  ```

- [ ] **3.11: Add shield visual to drawSnake()**

  In `drawSnake()`, after drawing the snake, add:
  ```js
  // Shield aura around head
  if (shieldActive && snake.length > 0) {
      const head = snake[0];
      ctx.save();
      ctx.strokeStyle = '#4488FF';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#4488FF';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(head.x + TILE_SIZE / 2, head.y + TILE_SIZE / 2, TILE_SIZE * 0.7, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
  }
  ```

- [ ] **3.12: Add slow-mo visual to drawGame()**

  In `drawGame()`, at the very start, if slowMoActive:
  ```js
  if (slowMoActive) {
      ctx.fillStyle = 'rgba(170, 68, 255, 0.05)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  ```

- [ ] **3.13: Modify animateVisuals for slow-mo particle speed**

  In `animateVisuals()`, when updating particles, if `slowMoActive`, multiply the velocity decay by 0.5:
  ```js
  p.vy += 0.05;
  p.life -= delta / (p.maxLife * 1000) * (slowMoActive ? 0.5 : 1);
  ```

**Verification:**
1. Load `snake.html`, start a game. Wait for a power-up to appear (~10 seconds of play).
2. Collect shield — shield aura should appear around snake head. Hit an obstacle — shield should absorb it.
3. Collect magnet — food should move toward snake head.
4. Collect slow-mo — game speed should visibly halve.
5. Power-up HUD should show at top-left of canvas.
6. Multiple power-ups: collecting a new one should replace the current.

---

### Task 4: Rival Snake (AI Nemesis)

**Files:**
- Modify: `snake.html`

**Description:** Add an AI-controlled rival snake that competes for food, grows, and creates dynamic spatial tension.

**Context:** This is the most complex addition. It adds a second snake to the game with AI, collision rules, rendering, and respawning. The rival reuses the existing food system, particle system, and sound system.

- [ ] **4.1: Add rival snake global variables**

  Near other globals (around line 82):
  ```js
  let rivalSnake = [];
  let rivalDx = 0;
  let rivalDy = 0;
  let rivalActive = false;
  let rivalRespawnTimer = 0;
  const RIVAL_MAX_LENGTH = 20;
  ```

  Initialize in `resetGame()`:
  ```js
  rivalSnake = [];
  rivalDx = 0;
  rivalDy = 0;
  rivalActive = false;
  rivalRespawnTimer = 0;
  ```

- [ ] **4.2: Add spawnRival() function**

  ```js
  function spawnRival() {
      if (rivalActive) return;
      if (gameMode === 'zen' || gameMode === 'snap' || gameMode === 'daily') return; // only classic/timeAttack for now
      
      // Find a starting position far from player starting position
      const startX = 10 * TILE_SIZE;
      const startY = 10 * TILE_SIZE;
      const candidatePositions = [];
      
      // Try opposite corners
      const corners = [
          { x: 2 * TILE_SIZE, y: 2 * TILE_SIZE },
          { x: 17 * TILE_SIZE, y: 2 * TILE_SIZE },
          { x: 2 * TILE_SIZE, y: 17 * TILE_SIZE },
          { x: 17 * TILE_SIZE, y: 17 * TILE_SIZE },
      ];
      
      for (const corner of corners) {
          const dist = Math.abs(corner.x - startX) + Math.abs(corner.y - startY);
          if (dist >= 8 * TILE_SIZE) {
              // Check no obstacle at this position
              if (!obstacles.some(o => o.x === corner.x && o.y === corner.y)) {
                  candidatePositions.push(corner);
              }
          }
      }
      
      if (candidatePositions.length === 0) return; // no valid spawn
      
      const pos = candidatePositions[Math.floor(Math.random() * candidatePositions.length)];
      
      rivalSnake = [
          { x: pos.x, y: pos.y },
          { x: pos.x, y: pos.y + TILE_SIZE },
          { x: pos.x, y: pos.y + 2 * TILE_SIZE },
      ];
      rivalDx = 0;
      rivalDy = -TILE_SIZE; // moves up initially
      rivalActive = true;
  }
  ```

- [ ] **4.3: Add updateRival() function**

  ```js
  function updateRival() {
      if (!rivalActive) return;
      
      // AI decision making
      const head = rivalSnake[0];
      
      // Find nearest food
      let nearestFood = null;
      let nearestDist = Infinity;
      if (food) {
          const dist = Math.abs(food.x - head.x) + Math.abs(food.y - head.y);
          if (dist < nearestDist) {
              nearestDist = dist;
              nearestFood = food;
          }
      }
      
      // Decide direction
      const directionChoices = [
          { dx: TILE_SIZE, dy: 0 },
          { dx: -TILE_SIZE, dy: 0 },
          { dx: 0, dy: TILE_SIZE },
          { dx: 0, dy: -TILE_SIZE },
      ];
      
      // Filter out reverse of current direction
      const validChoices = directionChoices.filter(d => 
          !(d.dx === -rivalDx && d.dy === -rivalDy)
      );
      
      let chosenDirection;
      const rand = Math.random();
      
      if (rand < 0.70 && nearestFood) {
          // Move toward food
          const dx_food = nearestFood.x - head.x;
          const dy_food = nearestFood.y - head.y;
          
          if (Math.abs(dx_food) >= Math.abs(dy_food)) {
              chosenDirection = { dx: dx_food > 0 ? TILE_SIZE : -TILE_SIZE, dy: 0 };
          } else {
              chosenDirection = { dx: 0, dy: dy_food > 0 ? TILE_SIZE : -TILE_SIZE };
          }
          
          // Don't reverse
          if (chosenDirection.dx === -rivalDx && chosenDirection.dy === -rivalDy) {
              chosenDirection = null;
          }
      }
      
      if (!chosenDirection || rand >= 0.70) {
          if (rand < 0.90) {
              // Continue same direction (maintain momentum)
              chosenDirection = { dx: rivalDx, dy: rivalDy };
          } else {
              // Random valid turn
              const shuffled = [...validChoices].sort(() => Math.random() - 0.5);
              chosenDirection = shuffled[0] || { dx: rivalDx, dy: rivalDy };
          }
      }
      
      // Further validate: check if chosen direction leads to collision
      const testPos = { x: head.x + chosenDirection.dx, y: head.y + chosenDirection.dy };
      const wrappedTest = wrapPosition(testPos);
      
      // Check self-collision (rival)
      const selfCollision = rivalSnake.some(s => s.x === wrappedTest.x && s.y === wrappedTest.y);
      // Check obstacle collision
      const obsCollision = obstacles.some(o => o.x === wrappedTest.x && o.y === wrappedTest.y);
      
      if (selfCollision || obsCollision) {
          // Try other valid directions
          let found = false;
          for (const dir of validChoices) {
              const tp = wrapPosition({ x: head.x + dir.dx, y: head.y + dir.dy });
              if (!rivalSnake.some(s => s.x === tp.x && s.y === tp.y) &&
                  !obstacles.some(o => o.x === tp.x && o.y === tp.y)) {
                  chosenDirection = dir;
                  found = true;
                  break;
              }
          }
          if (!found) {
              // Rival is trapped — remove it
              removeRival();
              return;
          }
      }
      
      rivalDx = chosenDirection.dx;
      rivalDy = chosenDirection.dy;
      
      // Move rival
      const rTail = rivalSnake.pop();
      const rNewHead = wrapPosition({ x: head.x + rivalDx, y: head.y + rivalDy });
      
      // Check collision with player
      const playerCollision = snake.some(s => s.x === rNewHead.x && s.y === rNewHead.y);
      if (playerCollision) {
          // Rival head touched player body → rival dies
          spawnParticles(rNewHead.x, rNewHead.y, 20, '#FF4444');
          awardXP(100);
          if (gameMode !== 'zen') score += 50;
          updateScoreDisplay();
          const el = document.getElementById('toast');
          if (el) {
              el.textContent = '💀 Rival Defeated! +50 pts +100 XP';
              el.style.display = 'block';
              setTimeout(function() { el.style.display = 'none'; }, 3000);
          }
          removeRival();
          return;
      }
      
      rivalSnake.unshift(rNewHead);
      
      // Check if rival eats food
      if (food && rNewHead.x === food.x && rNewHead.y === food.y) {
          rivalSnake.push(rTail);
          if (rivalSnake.length < RIVAL_MAX_LENGTH) {
              // Grow rival: add an extra segment at tail
              const last = rivalSnake[rivalSnake.length - 1];
              rivalSnake.push({ x: last.x, y: last.y });
          }
          // Remove food, generate new one
          food = generateFood([...snake, ...rivalSnake]);
          if (!food) { gameOver(); return; }
          playSound('eat');
      }
      
      // Check rival self-collision
      const rivalHead = rivalSnake[0];
      const selfHit = rivalSnake.slice(1).some(s => s.x === rivalHead.x && s.y === rivalHead.y);
      if (selfHit) {
          removeRival();
          return;
      }
  }
  ```

- [ ] **4.4: Add removeRival() function**

  ```js
  function removeRival() {
      if (rivalActive && rivalSnake.length > 0) {
          spawnParticles(rivalSnake[0].x, rivalSnake[0].y, 20, '#FF4444');
      }
      rivalSnake = [];
      rivalActive = false;
      rivalRespawnTimer = 10000; // respawn in 10 seconds
  }
  ```

- [ ] **4.5: Integrate rival into updateGame()**

  In `updateGame()`, after the player movement and eat logic, add:

  ```js
  // Rival respawn timer
  if (!rivalActive && rivalRespawnTimer > 0) {
      rivalRespawnTimer -= getSpeed();
      if (rivalRespawnTimer <= 0) {
          spawnRival();
      }
  }
  
  // Update rival
  if (rivalActive) {
      updateRival();
  }
  ```

  Also add rival collision check for the PLAYER. In the existing collision check (around line 938), modify to also check rival:

  ```js
  if (checkCollision(wrappedHead)) {
      // Check if shield absorbs it
      if (shieldActive) {
          shieldActive = false;
          powerUpTimer = 0;
          powerUpType = null;
          spawnParticles(wrappedHead.x, wrappedHead.y, 15, '#4488FF');
          playSound('bonus');
      } else {
          snake.push(tail);
          gameOver();
          return;
      }
  }
  
  // Check player collision with rival body
  if (rivalActive) {
      const rivalBodyHit = rivalSnake.some(s => s.x === wrappedHead.x && s.y === wrappedHead.y);
      if (rivalBodyHit) {
          snake.push(tail);
          gameOver();
          return;
      }
  }
  ```

- [ ] **4.6: Add rival drawing to drawSnake()**

  Modify `drawSnake()` (or add a separate `drawRival()` function called after it):

  ```js
  function drawRival() {
      if (!rivalActive || rivalSnake.length === 0) return;
      
      rivalSnake.forEach(function(segment, index) {
          ctx.fillStyle = index === 0 ? '#FF6600' : '#CC3300';
          ctx.fillRect(segment.x, segment.y, TILE_SIZE - 1, TILE_SIZE - 1);
          
          if (index === 0) {
              // Eyes
              let ex1, ey1, ex2, ey2;
              const ddx = rivalDx;
              const ddy = rivalDy;
              if (ddx > 0) {
                  ex1 = segment.x + 12; ey1 = segment.y + 4;
                  ex2 = segment.x + 12; ey2 = segment.y + 12;
              } else if (ddx < 0) {
                  ex1 = segment.x + 4; ey1 = segment.y + 4;
                  ex2 = segment.x + 4; ey2 = segment.y + 12;
              } else if (ddy < 0) {
                  ex1 = segment.x + 4; ey1 = segment.y + 4;
                  ex2 = segment.x + 12; ey2 = segment.y + 4;
              } else {
                  ex1 = segment.x + 4; ey1 = segment.y + 12;
                  ex2 = segment.x + 12; ey2 = segment.y + 12;
              }
              ctx.fillStyle = '#FFD700';
              ctx.beginPath(); ctx.arc(ex1, ey1, 4, 0, 2 * Math.PI); ctx.fill();
              ctx.beginPath(); ctx.arc(ex2, ey2, 4, 0, 2 * Math.PI); ctx.fill();
              ctx.fillStyle = '#000';
              ctx.beginPath(); ctx.arc(ex1, ey1, 2, 0, 2 * Math.PI); ctx.fill();
              ctx.beginPath(); ctx.arc(ex2, ey2, 2, 0, 2 * Math.PI); ctx.fill();
          }
      });
  }
  ```

  Call `drawRival()` in `drawGame()` after `drawSnake()`.

- [ ] **4.7: Modify generateFood() board-full check**

  Update the board-full guard in `generateFood()` (line 290):
  ```js
  const rivalLength = rivalActive ? rivalSnake.length : 0;
  if (currentSnake.length + obstacles.length + rivalLength >= totalTiles) return null;
  ```

- [ ] **4.8: Start rival on game start**

  In `startGame()` (around line 360), after the game starts, add:
  ```js
  if (gameMode === 'classic' || gameMode === 'timeAttack') {
      spawnRival();
  }
  ```

- [ ] **4.9: Clean up rival in gameOver()**

  In `gameOver()`, add:
  ```js
  if (rivalActive) {
      rivalSnake = [];
      rivalActive = false;
  }
  rivalRespawnTimer = 0;
  ```

- [ ] **4.10: Add rival length HUD**

  In `drawGame()`, after the power-up HUD, add a rival length comparison:

  ```js
  // Rival HUD
  if (rivalActive) {
      ctx.fillStyle = '#FF6600';
      ctx.font = '12px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Rival: ' + rivalSnake.length, CANVAS_WIDTH - 5, CANVAS_HEIGHT - 60);
      ctx.fillStyle = '#00FF00';
      ctx.fillText('You: ' + snake.length, CANVAS_WIDTH - 5, CANVAS_HEIGHT - 45);
  }
  ```

**Verification:**
1. Load `snake.html`, start Classic mode. Rival should spawn on opposite side of board.
2. Rival should move toward food and eat it (food disappears, rival grows).
3. Player head touches rival body → game over.
4. Player touches rival → ONLY if player head touches rival body. Test this.
5. Rival head touches player body → rival dies with particles + toast "Rival Defeated!".
6. After rival dies, it should respawn in ~10 seconds.
7. Rival should not spawn in Zen, Snap, or Daily modes.
8. Rival should avoid obstacles and self-collision.
9. Rival should wrap around walls.
10. Board-full check should include rival length.

---

### Task 5: Final Integration & Polish

**Files:**
- None (verification pass)

**Description:** Load the game, play through all modes, verify all features work together, check for regressions.

- [ ] **5.1: Load `snake.html` in browser**
- [ ] **5.2: Play Classic mode** — verify rival spawns, moves, eats, dies, respawns. Verify power-ups spawn, collect each type. Verify grid renders correctly (batched).
- [ ] **5.3: Play Snap mode** — verify shrink timer works, eating resets timer, game over at length 1.
- [ ] **5.4: Play Zen mode** — verify no rival spawns. Verify no power-ups (or power-ups can appear but have no rival interaction).
- [ ] **5.5: Play Time Attack mode** — verify rival works in Time Attack too.
- [ ] **5.6: Check touch controls** — verify swipe detection works (setNextDirection function).
- [ ] **5.7: Verify all localStorage state loads correctly** — high scores, stats, achievements.
- [ ] **5.8: Check console for any errors** — verify no runtime exceptions.
