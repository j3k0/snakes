# Snake Game — v9 Implementation Plan

Implements the v9 design plan (DESIGN_v9.md) with all review fixes from the two design reviews incorporated. Seven features, order A → B → G → C → F → D → E, ~970 LOC.

## Review fixes incorporated (from DesignReviewer1 + DesignReviewer2)

1. **D & E (BLOCKER — shared `extraFoods[]` array):** The codebase has only one `food` object (line 200) + one `food2` (line 201, echo-brew-coupled). D (portal) and E (hoard) both need multiple food entities. **Fix:** D introduces a shared module-scope `let extraFoods = []` array. Every food-touching site iterates it: eat-block, `moveHunter` rejection, magnet pull, `drawFood`, snapshot serialization, `resetGame`/`resetWaveState`. E reuses this array for its 4 hoard foods. LOC revised: D ~180 (was ~120), E ~230 (was ~150).
2. **D (BLOCKER — body handling):** Teleporting `snake[0]` alone leaves a non-contiguous body → instant self-collision death. **Fix:** Phoenix-style full re-anchor — on portal eat, set `snake = [{exit.x, exit.y}]` (single-tile), then grow to min length 3. The snake rebirths at the exit with a short body.
3. **E (BLOCKER — `scoreMultiplier` stacking):** `addScore()` (line 1636) already chains pinnacle/overcharge/gauntlet/golden_food. **Fix:** add `scoreMultiplier` inside `addScore()` as a single outer multiplier: `score += Math.round(amount * multi * scoreMultiplier)`. Cap with `golden_food`: when golden_food is active, cap hoard multiplier at 1.5 (so Hoard + Golden Age = ×4.5, not ×6).
4. **E (WARNING — rival respawn timer):** Gate BOTH `updateRival()` AND the rival respawn-timer decrement (lines 5961-5966) on `!hoardActive`.
5. **D (WARNING — `moveHunter` rejection):** Add `extraFoods[]` tiles to `moveHunter()` rejection list (lines 1704-1708).
6. **E (WARNING — bounty serialization):** Suppress new bounty spawns during hoard (hold `bountyTickCounter` at 0 while `hoardActive`). Suppress urgency ring (F2) during hoard.
7. **E (WARNING — Snap exclusion):** Include Snap (it has `wrap:true`, `scoreIs:'points'` — structurally identical to Time Attack). Remove `resetWaveState()` reset for E (E is excluded from Gauntlet).
8. **E (WARNING — snapshot `extraFoods[]`):** Add `extraFoods` to snapshot as additive field. On restore, hoard foods are restored from `extraFoods[]`.
9. **C (NIT — z-order):** Draw combo halo BEFORE the segment loop (body renders on top). Cap alpha at 0.5; reduce by 50% when `shieldActive`. Draw at absolute head coords, not local origin.
10. **F2 (NIT — calm-mode gate):** Gate only the urgency oscillation, not the countdown arc.
11. **G (NIT — line reference):** The seed-setting block is at line ~7167 (input handler), not ~7173. Use `hashString`-equivalent computation (`.split('').reduce(...)` form at line 7174).
12. **D (WARNING — player onboarding):** Add first-time toast + welcome overlay update + prominent dashed purple connecting line + directional arrow.

---

## Feature A: Save Data Export/Import (~150 LOC)

### Step 1 — Export function
- New bare-name `function exportSaveData()` (module scope → `window.exportSaveData`).
- Collect keys: `const keys = {}; Object.keys(localStorage).filter(k => k.startsWith('snake_')).forEach(k => { keys[k] = localStorage.getItem(k); });`
- Build blob: `const data = { format: 'snakes-backup', version: 1, exportedAt: new Date().toISOString(), keys };`
- Download: `const blob = new Blob([JSON.stringify(data)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'snakes-backup-' + new Date().toISOString().slice(0,10) + '.json'; a.click(); URL.revokeObjectURL(url);`
- `queueToast('Backup exported!', 2000);`

### Step 2 — Import function
- New bare-name `function importSaveData(file)` (module scope → `window.importSaveData`).
- `const reader = new FileReader(); reader.onload = function(e) { ... }; reader.readAsText(file);`
- Inside onload: parse JSON, validate `format === 'snakes-backup'` and `version === 1`. If invalid, `queueToast('Invalid backup file', 2000); return;`.
- Confirm dialog: `if (!confirm('Importing will overwrite all current save data. Continue?')) return;`
- Apply: `Object.keys(data.keys).forEach(k => { localStorage.setItem(k, data.keys[k]); });`
- `queueToast('Backup imported! Reload to apply.', 3000);` — note: a reload is needed because module-scope `let`/`const` are already initialized from the old localStorage values; the imported values take effect on next page load.

### Step 3 — Settings panel buttons
- In `renderSettings()` (line 1528), after the particle density slider (line 1559), add:
  ```
  '<div style="padding:14px 0;border-bottom:1px solid #333;"><div style="font-size:13px;margin-bottom:8px;">Data Backup</div>' +
  '<div style="display:flex;gap:8px;">' +
  '<button onclick="exportSaveData()" style="...">⬇ Export</button>' +
  '<label style="..."><input type="file" accept=".json" style="display:none;" onchange="importSaveData(this.files[0])">⬆ Import</label>' +
  '</div></div>'
  ```
- Style buttons to match the existing panel button style (padding, border-radius, background, cursor).

### Verify
- Open Settings → Export → file downloads. Import the file → confirm dialog → keys written. Reload → data restored. `node test-bugfixes.mjs`.

---

## Feature B: Visibility-Safe Auto-Save (~10 LOC)

### Step 1 — Add saveSnapshot to visibilitychange
- In the `visibilitychange` handler (line 7107-7123), inside the `if (document.hidden && gameState === 'playing')` branch (line 7108), add `saveSnapshot();` BEFORE `autoPaused = true;` (line 7109):
  ```js
  if (document.hidden && gameState === 'playing') {
      saveSnapshot();          // v9 B: save before pausing so mobile backgrounding doesn't lose the run
      autoPaused = true;
      // ... rest unchanged
  }
  ```

### Verify
- Start a game, switch tabs → snapshot saved (check `localStorage.getItem('snake_snapshot')` is non-null). Return → game resumes. `node test-bugfixes.mjs`.

---

## Feature G: Diary Seed Replay (~60 LOC)

### Step 1 — retrySeedFromDiary function
- New bare-name `function retrySeedFromDiary(seed)` (module scope → `window.retrySeedFromDiary`).
- Mirror the seed-setting input handler at line 7167-7180:
  ```js
  function retrySeedFromDiary(seed) {
      if (!seed) return;
      var field = document.getElementById('seedField');
      if (field) field.value = seed;
      activeSeed = seed;
      var hash = seed.split('').reduce(function(h, c) { return ((h << 5) - h) + c.charCodeAt(0) | 0; }, 0);
      seedPrng = mulberry32(hash);
      closeAllPanels();
      gameState = 'idle';
      drawGame(1);
      updateMenuFooter();
      queueToast('Seed loaded: ' + seed, 2000);
  }
  ```

### Step 2 — Add button to renderDiary
- In `renderDiary()` (line 444-461), the diary entry HTML is built at line 458. After the stats `<div class="diary-stats">...</div>`, add a retry button (only when `entry.seed` exists):
  ```js
  var seedBtn = entry.seed ? '<button onclick="event.stopPropagation();retrySeedFromDiary(\'' + entry.seed.replace(/'/g, "\\'") + '\')" style="margin-top:8px;padding:6px 14px;border-radius:6px;border:1px solid #88AAFF;background:rgba(136,170,255,0.15);color:#88AAFF;cursor:pointer;font-size:12px;touch-action:manipulation;">↻ Retry Seed</button>' : '';
  ```
- Insert `seedBtn` into the diary-detail div content, after the diary-stats div and before the delete button.

### Verify
- Open diary → expand an entry with a seed → "Retry Seed" button visible → click → seed field populated, idle screen shown. Open diary → expand an entry without a seed → no button. `node test-bugfixes.mjs`.

---

## Feature C: Combo Heat Aura (~90 LOC)

### Step 1 — Combo tint helper
- New module-scope function:
  ```js
  function comboHeatColor(combo) {
      if (combo <= 0) return null;
      var frac = Math.min(1, combo / 15);
      // neutral → yellow (3) → orange (7) → red (15+)
      if (combo < 3) return null;
      if (combo < 7) { var t = (combo - 3) / 4; return 'rgba(255,' + Math.round(255 - t*100) + ',' + Math.round(255 - t*200) + ',0.15)'; }
      if (combo < 15) { var t2 = (combo - 7) / 8; return 'rgba(255,' + Math.round(155 - t2*100) + ',' + Math.round(55 - t2*55) + ',0.2)'; }
      return 'rgba(255,55,0,0.25)';
  }
  ```

### Step 2 — Body fill tint in drawSnake
- In `drawSnake()` (line 4306), inside the `snake.forEach` loop, after the evolution glow + fillStyle block (lines 4370-4388), add a combo tint overlay on the body fill:
  ```js
  // v9 C: Combo Heat Aura — body tint warms with comboCount
  var heatColor = comboHeatColor(comboCount);
  if (heatColor && index > 0) {
      ctx.fillStyle = heatColor;
      ctx.fillRect(drawX + segPad, drawY + segPad + wavyY, segSize, segSize);
  }
  ```
  Place this AFTER the main `ctx.fillRect` for the segment (line 4395 or 4397), so the tint overlays the base skin color. Use `globalAlpha` to blend rather than overwriting — OR just use semi-transparent rgba fill (the helper returns alpha-included rgba).

### Step 3 — Head halo (drawn BEFORE segment loop)
- Before the `snake.forEach` loop in `drawSnake()` (line 4320, after `let headDrawX = 0, headDrawY = 0;`), add:
  ```js
  // v9 C: Combo Heat halo — drawn before the body so the body covers the center
  if (comboCount >= 3 && snake.length > 0) {
      var comboFrac = Math.min(1, comboCount / 15);
      var haloAlpha = (0.3 + 0.2 * comboFrac) * (shieldActive ? 0.5 : 1);
      if (!calmModeEffective()) {
          var pulseR = TILE_SIZE * 0.6 + (calmModeEffective() ? 0 : Math.sin(renderTime * (0.005 + comboFrac * 0.01)) * 3);
      } else {
          var pulseR = TILE_SIZE * 0.6;
      }
      // head position is snake[0] — use segment.x/y directly (no interpolation needed for the halo)
      var hcx = snake[0].x + TILE_SIZE / 2;
      var hcy = snake[0].y + TILE_SIZE / 2;
      ctx.save();
      ctx.globalAlpha = haloAlpha;
      var haloColor = comboCount >= 15 ? '#FF4400' : comboCount >= 7 ? '#FF8800' : '#FFCC00';
      var grad = ctx.createRadialGradient(hcx, hcy, 0, hcx, hcy, pulseR);
      grad.addColorStop(0, haloColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(hcx - pulseR, hcy - pulseR, pulseR * 2, pulseR * 2);
      ctx.restore();
  }
  ```
  Note: this draws at absolute head coords (like the shield aura), NOT at local origin. The halo is the bottom z-layer; body+evolution glow render on top; shield aura renders last (top).

### Verify
- Eat 3 foods quickly → yellow tint appears on body + faint yellow halo behind head. Eat to 7 → orange. Eat to 15 → red. Activate shield → halo dims by 50%. Calm mode on → halo static (no pulse), body tint stays. Evolution glow (Titan/Apex) still visible through the halo. `node test-bugfixes.mjs`.

---

## Feature F: Visual Feedback Pack (~200 LOC)

### Step 1 — Shared transientRings array + render
- Module-scope: `let transientRings = [];`
- In `resetGame()` (line 1935ish), add `transientRings = [];` alongside `particles = []`.
- In `resetWaveState()` (line 4808), add `transientRings = [];` alongside `particles = []`.
- In `animateVisuals()` (line 3605), find the section between particles and floaters (search for `deathFragments` render or `floaters` render). Add the transient rings render + decay block:
  ```js
  // v9 F: Transient rings (hunter dust, bounty burst, power-up shockwave)
  if (transientRings.length > 0) {
      ctx.save();
      for (var tri = transientRings.length - 1; tri >= 0; tri--) {
          var tr = transientRings[tri];
          tr.life -= delta;
          if (tr.life <= 0) { transientRings.splice(tri, 1); continue; }
          var lifeFrac = tr.life / tr.maxLife;
          var r = tr.maxRadius * (1 - lifeFrac);
          var a = lifeFrac * tr.alpha;
          ctx.globalAlpha = a;
          ctx.strokeStyle = tr.color;
          ctx.lineWidth = tr.lineWidth || 2;
          if (tr.type === 'dust') {
              ctx.fillStyle = tr.color;
              ctx.globalAlpha = a * 0.5;
              ctx.beginPath();
              ctx.arc(tr.x, tr.y, r * 0.5, 0, 2 * Math.PI);
              ctx.fill();
          } else {
              ctx.beginPath();
              ctx.arc(tr.x, tr.y, r, 0, 2 * Math.PI);
              ctx.stroke();
          }
      }
      ctx.restore();
  }
  ```
- Helper to push a ring:
  ```js
  function pushTransientRing(x, y, maxRadius, color, maxLife, type, lineWidth) {
      if (transientRings.length >= 50) transientRings.shift();
      transientRings.push({ x: x, y: y, maxRadius: maxRadius, alpha: 0.8, color: color, life: maxLife, maxLife: maxLife, type: type || 'ring', lineWidth: lineWidth || 2 });
  }
  ```

### Step 2 — F1: Hunter flee-dust
- In `moveHunter()` (line 1692), right before `food.x = best.x; food.y = best.y;` (line 1719), push a dust ring at the current (pre-move) position:
  ```js
  if (best) {
      // v9 F1: dust trail at the vacated cell
      if (!calmModeEffective()) pushTransientRing(food.x + TILE_SIZE/2, food.y + TILE_SIZE/2, 6, '#8B7355', 300, 'dust');
      food.x = best.x; food.y = best.y; food.spawnTime = performance.now();
  }
  ```

### Step 3 — F2: Bounty ring urgency + cash-in burst
- In the bounty ring render block in `animateVisuals()` (lines 3743-3766), modify the ring drawing:
  ```js
  // v9 F2: urgency pulse when time is running low
  var urgencyActive = frac < 0.3 && !calmModeEffective() && !hoardActive;
  var ringR_eff = urgencyActive ? ringR + Math.sin(renderTime * 0.01) * 3 : ringR;
  var ringColor = urgencyActive ? '#FF4444' : (frac > 0.3 ? '#FFD700' : '#FF6B35');
  ```
  Replace the existing `ringR` with `ringR_eff` in the arc draws, and the color with `ringColor`.
- On bounty completion in `tickBounty()` — find the `checkBounty()` success path (search for `Bounty complete`). Add:
  ```js
  // v9 F2: cash-in burst at the head
  pushTransientRing(snake[0].x + TILE_SIZE/2, snake[0].y + TILE_SIZE/2, 20, '#FFD700', 400, 'ring', 3);
  spawnParticles(snake[0].x, snake[0].y, calmModeEffective() ? 6 : 15, '#FFD700');
  ```

### Step 4 — F3: Power-up activation shockwave
- In `activatePowerUp()` (line 1788), at the end of the `switch` block (after line 1810, before the toast), add:
  ```js
  // v9 F3: activation shockwave
  if (snake.length > 0) {
      pushTransientRing(snake[0].x + TILE_SIZE/2, snake[0].y + TILE_SIZE/2, 25, config.color || '#FFFFFF', 500, 'ring', 3);
      if (!calmModeEffective()) spawnParticles(snake[0].x, snake[0].y, 12, config.color || '#FFFFFF');
  }
  ```

### Verify
- Hunter food on board → moves → brown dust puffs at vacated cells. Bounty active → time < 30% → ring pulses red. Bounty completes → gold ring + particle burst at head. Power-up pickup → colored shockwave ring + particles at head. Calm mode → dust skipped, urgency pulse skipped (countdown arc stays), power-up shockwave ring skipped (particles reduced). `node test-bugfixes.mjs`.

---

## Feature D: Portal Food (~180 LOC)

### Step 1 — extraFoods[] array + infrastructure
- Module-scope: `let extraFoods = [];` (near line 200, after `let food = {};`).
- In `resetGame()` (line 1935ish), add `extraFoods = [];` alongside `food2 = null;`.
- In `resetWaveState()` (line 4786), add `extraFoods = [];` alongside `food = null;`.

### Step 2 — FOOD_TIERS portal flag
- In `FOOD_TIERS` (line 1161), add `portal: true` to the `epic` tier def:
  ```js
  epic: { pts: 50, xp: 70, weight: 0.03, color: '#AA44FF', pCount: 18, sound: 'bonus', glow: 14, portal: true },
  ```

### Step 3 — Portal food spawn in generateFood
- In `generateFood()` (line 1722), after `return newFood;` is computed (line 1766), add portal spawn:
  ```js
  // v9 D: epic food spawns a linked portal twin in extraFoods[]
  if (newFood && FOOD_TIERS[newFood.type] && FOOD_TIERS[newFood.type].portal && MODE_CONFIG[gameMode].wrap !== false) {
      var portalFood = findPortalTile(newFood, currentSnake);
      if (portalFood) {
          portalFood.type = 'portal';
          portalFood.spawnTime = performance.now();
          portalFood.portalLink = { x: newFood.x, y: newFood.y };
          newFood.portalLink = { x: portalFood.x, y: portalFood.y };
          extraFoods.push(portalFood);
      }
  }
  ```
- New `findPortalTile(epicFood, currentSnake)` helper:
  ```js
  function findPortalTile(epicFood, currentSnake) {
      var cols = PLAY_WIDTH / TILE_SIZE;
      var rows = PLAY_HEIGHT / TILE_SIZE;
      var minDist = 10 * TILE_SIZE; // minimum 10 tiles from the epic
      var candidates = [];
      for (var x = 0; x < cols; x++) {
          for (var y = 0; y < rows; y++) {
              var tx = x * TILE_SIZE, ty = y * TILE_SIZE;
              if (currentSnake.some(s => s.x === tx && s.y === ty)) continue;
              if (obstacles.some(o => o.x === tx && o.y === ty)) continue;
              if (food && food.x === tx && food.y === ty) continue;
              if (food2 && food2.x === tx && food2.y === ty) continue;
              if (powerUpPickup && powerUpPickup.x === tx && powerUpPickup.y === ty) continue;
              var d = Math.abs(tx - epicFood.x) + Math.abs(ty - epicFood.y);
              // wrap-aware distance
              if (d > PLAY_WIDTH / 2) d = Math.abs(d - PLAY_WIDTH);
              if (d >= minDist) candidates.push({ x: tx, y: ty });
          }
      }
      if (candidates.length === 0) return null;
      return candidates[Math.floor(seededRandom() * candidates.length)];
  }
  ```

### Step 4 — Eat-block: iterate extraFoods[]
- After the primary food eat block (line 5682-5846) and the food2 eat block (line 5849-5861), add `extraFoods[]` eat check:
  ```js
  // v9 D: extraFoods[] eat check (portal + hoard foods)
  for (var efi = extraFoods.length - 1; efi >= 0; efi--) {
      var ef = extraFoods[efi];
      if (wrappedHead.x === ef.x && wrappedHead.y === ef.y) {
          var efType = ef.type;
          // Portal food: teleport the entire snake (Phoenix-style re-anchor)
          if (ef.portalLink) {
              var exitX = ef.portalLink.x, exitY = ef.portalLink.y;
              // Snap to nearest free tile if the exit is now occupied
              var exitTile = snapToFreeTile(exitX, exitY);
              // Re-anchor: snake becomes a short segment at the exit
              snake = [{ x: exitTile.x, y: exitTile.y }];
              while (snake.length < 3) {
                  var tailSeg = { x: snake[snake.length-1].x - dx, y: snake[snake.length-1].y - dy };
                  tailSeg = wrapPosition(tailSeg);
                  // Ensure the tail seg doesn't overlap
                  if (snake.some(s => s.x === tailSeg.x && s.y === tailSeg.y)) break;
                  snake.push(tailSeg);
              }
              triggerEvolutionIfReady(); // re-evaluate evolution on new body
              spawnParticles(ef.x, ef.y, 18, '#AA44FF');
              spawnParticles(exitTile.x, exitTile.y, 18, '#AA44FF');
              playSound('bonus');
              // Remove both portal foods from extraFoods[]
              extraFoods.splice(efi, 1);
              for (var pi = extraFoods.length - 1; pi >= 0; pi--) {
                  if (extraFoods[pi].portalLink && extraFoods[pi].x === exitTile.x && extraFoods[pi].y === exitTile.y) {
                      extraFoods.splice(pi, 1);
                      break;
                  }
              }
              // Also remove the portal flag from the primary epic food if it was the eaten one
              queueToast('🌀 Teleported!', 1500);
          } else {
              // Hoard bonus food: normal eat logic
              snake.push(tail);
              snakeGrew = true;
              triggerEvolutionIfReady();
              if (activeSeed !== null) recordReplayGrow(gameTick);
              sessionFoodEaten++;
              stats.totalFoodEaten++;
              stats.bonusFoodEaten++;
              sessionBonusFood++;
              sessionFoodTypes.add('bonus');
              var efTier = FOOD_TIERS.bonus;
              if (gameMode !== 'zen' && gameMode !== 'painter') addScore(efTier.pts);
              spawnParticles(ef.x, ef.y, efTier.pCount, efTier.color);
              spawnFloater(ef.x, ef.y, '+30 BONUS!', '#FFD700', 18);
              playSound('bonus');
              extraFoods.splice(efi, 1);
          }
          break; // only eat one food per tick
      }
  }
  ```
- New `snapToFreeTile(x, y)` helper:
  ```js
  function snapToFreeTile(x, y) {
      if (!snake.some(s => s.x === x && s.y === y) &&
          !obstacles.some(o => o.x === x && o.y === y) &&
          !rivals.some(r => r.active && r.snake.some(s => s.x === x && s.y === y))) {
          return { x: x, y: y };
      }
      // Search 4-neighbors for a free tile
      var neighbors = [{x:x+TILE_SIZE,y:y},{x:x-TILE_SIZE,y:y},{x:x,y:y+TILE_SIZE},{x:x,y:y-TILE_SIZE}];
      for (var i = 0; i < neighbors.length; i++) {
          var n = wrapPosition(neighbors[i]);
          if (!snake.some(s => s.x === n.x && s.y === n.y) &&
              !obstacles.some(o => o.x === n.x && o.y === n.y) &&
              !rivals.some(r => r.active && r.snake.some(s => s.x === n.x && s.y === n.y))) {
              return n;
          }
      }
      return { x: x, y: y }; // fallback (rare)
  }
  ```

### Step 5 — moveHunter rejection list
- In `moveHunter()` (lines 1704-1708), after the `powerUpPickup` check (line 1709), add:
  ```js
  // v9 D: reject extraFoods[] tiles
  if (extraFoods.some(function(ef) { return ef.x === c.x && ef.y === c.y; })) continue;
  ```

### Step 6 — Magnet pull: handle extraFoods
- In the magnet pull block (line 5909), the condition currently checks `food && food.type !== 'hunter'`. After the primary `food` magnet pull, add a loop for `extraFoods[]` (pull hoard bonus foods, skip portal foods):
  ```js
  // v9 D: magnet also pulls extraFoods[] (bonus foods from hoard, not portal)
  if (magnetActive) {
      for (var efi2 = 0; efi2 < extraFoods.length; efi2++) {
          var ef2 = extraFoods[efi2];
          if (ef2.type === 'portal') continue;
          var head2 = snake[0];
          var dfx = head2.x - ef2.x, dfy = head2.y - ef2.y;
          if (Math.abs(dfx) > PLAY_WIDTH/2) dfx = dfx > 0 ? dfx - PLAY_WIDTH : dfx + PLAY_WIDTH;
          if (Math.abs(dfy) > PLAY_HEIGHT/2) dfy = dfy > 0 ? dfy - PLAY_HEIGHT : dfy + PLAY_HEIGHT;
          var d2 = Math.abs(dfx) + Math.abs(dfy);
          if (d2 > 0 && d2 <= 4 * TILE_SIZE) {
              var nfx = ef2.x, nfy = ef2.y;
              if (Math.abs(dfx) >= Math.abs(dfy)) nfx += dfx > 0 ? TILE_SIZE : -TILE_SIZE;
              else nfy += dfy > 0 ? TILE_SIZE : -TILE_SIZE;
              var wp = wrapPosition({x:nfx,y:nfy});
              if (!snake.some(s => s.x===wp.x && s.y===wp.y) && !obstacles.some(o => o.x===wp.x && o.y===wp.y)) {
                  ef2.x = wp.x; ef2.y = wp.y;
              }
          }
      }
  }
  ```

### Step 7 — drawFood: iterate extraFoods
- After the primary `drawFood()` (line 4051) draws `food` and `food2` (the food2 block is around line 4218), add an `extraFoods[]` draw loop:
  ```js
  // v9 D: draw extraFoods[] (portal + hoard foods)
  for (var efdi = 0; efdi < extraFoods.length; efdi++) {
      var ef = extraFoods[efdii];
      drawExtraFood(ef);
  }
  ```
- New `drawExtraFood(ef)` function:
  ```js
  function drawExtraFood(ef) {
      var cx = ef.x + TILE_SIZE / 2;
      var cy = ef.y + TILE_SIZE / 2;
      var calm = calmModeEffective();
      var spawnElapsed = performance.now() - (ef.spawnTime || 0);
      var spawnScale = calm ? 1 : (spawnElapsed < 250 ? Math.max(0, easeOutBack(spawnElapsed / 250)) : 1);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(spawnScale, spawnScale);
      if (ef.type === 'portal') {
          // Two concentric counter-rotating arcs (distinct from bonus pulse)
          ctx.strokeStyle = '#AA44FF';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#AA44FF';
          ctx.beginPath();
          ctx.arc(0, 0, TILE_SIZE * 0.35, renderTime * 0.003, renderTime * 0.003 + Math.PI * 1.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, TILE_SIZE * 0.25, -renderTime * 0.004, -renderTime * 0.004 + Math.PI * 1.5);
          ctx.stroke();
          ctx.shadowBlur = 0;
          // Directional arrow toward the twin
          if (ef.portalLink) {
              var adx = ef.portalLink.x - ef.x, ady = ef.portalLink.y - ef.y;
              if (Math.abs(adx) > PLAY_WIDTH/2) adx = adx > 0 ? adx - PLAY_WIDTH : adx + PLAY_WIDTH;
              if (Math.abs(ady) > PLAY_HEIGHT/2) ady = ady > 0 ? ady - PLAY_HEIGHT : ady + PLAY_HEIGHT;
              var angle = Math.atan2(ady, adx);
              ctx.rotate(angle);
              ctx.fillStyle = '#CC88FF';
              ctx.beginPath();
              ctx.moveTo(TILE_SIZE * 0.45, 0);
              ctx.lineTo(TILE_SIZE * 0.3, -3);
              ctx.lineTo(TILE_SIZE * 0.3, 3);
              ctx.closePath();
              ctx.fill();
              ctx.rotate(-angle);
          }
      } else {
          // Hoard bonus food: reuse the existing bonus case visual
          var efTier = FOOD_TIERS[ef.type] || FOOD_TIERS.bonus;
          var pulse = calm ? 1 : (1 + 0.5 * Math.sin(renderTime / 200));
          ctx.scale(pulse, pulse);
          ctx.fillStyle = efTier.color;
          if (efTier.glow) { ctx.shadowBlur = efTier.glow; ctx.shadowColor = efTier.color; }
          ctx.beginPath();
          ctx.arc(0, 0, TILE_SIZE * 0.3, 0, 2 * Math.PI);
          ctx.fill();
          ctx.shadowBlur = 0;
      }
      ctx.restore();
      // Label after restore (no transform)
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (ef.type === 'portal') ctx.fillText('P', cx, cy);
      else ctx.fillText('★', cx, cy);
  }
  ```
- Draw the connecting line between portal pairs (after drawing all extraFoods, before the label or in a separate pass):
  ```js
  // v9 D: portal connecting line (prominent, dashed, calm-safe)
  for (var pli = 0; pli < extraFoods.length; pli++) {
      if (extraFoods[pli].type === 'portal' && extraFoods[pli].portalLink) {
          ctx.save();
          ctx.strokeStyle = 'rgba(170,68,255,0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(extraFoods[pli].x + TILE_SIZE/2, extraFoods[pli].y + TILE_SIZE/2);
          ctx.lineTo(extraFoods[pli].portalLink.x + TILE_SIZE/2, extraFoods[pli].portalLink.y + TILE_SIZE/2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
      }
  }
  ```
  Draw this BEFORE the food shapes (so it's behind them), in `drawFood()` after the `food2` block.

### Step 8 — Echo-brew food2 coercion
- At the food2 spawn site (line 5839), extend the coercion:
  ```js
  var f2Type = (food.type === 'hunter' || food.type === 'portal') ? 'common' : food.type;
  ```

### Step 9 — Player onboarding
- Module-scope: `let hasSeenPortal = saveManager.get('snake_has_seen_portal', '') === '1';`
- In `generateFood()`, after pushing a portal food to `extraFoods[]`, add:
  ```js
  if (!hasSeenPortal) {
      hasSeenPortal = true;
      saveManager.set('snake_has_seen_portal', '1');
      queueToast('🌀 Portal food! Eat to teleport to its twin.', 3000);
  }
  ```
- In `drawWelcomeOverlay()` (line 3540), add a portal food row to the food info panel (find the food descriptions and add portal).

### Step 10 — Snapshot serialization
- In `buildSnapshotObject()` (line 2266), after `food2:` (line 2280), add:
  ```js
  extraFoods: extraFoods.map(function(ef) { return { x: ef.x, y: ef.y, type: ef.type, spawnTime: ef.spawnTime || 0, portalLink: ef.portalLink || null }; }),
  ```
- In `restoreFromSnapshot()` (line 2386), after `food2 = ...` (line 2418), add:
  ```js
  extraFoods = (data.extraFoods || []).map(function(ef) { return { x: ef.x, y: ef.y, type: ef.type, spawnTime: performance.now(), portalLink: ef.portalLink || null }; });
  ```

### Step 11 — Primary food eat: remove portal link
- When the primary `food` (an epic with portal) is eaten (line 5682), we need to also remove its portal twin from `extraFoods[]`. After the existing food eat block processes `food`, add:
  ```js
  // v9 D: if the eaten food was a portal epic, remove its twin from extraFoods[]
  if (eatenType === 'epic' && food && !food.portalLink) {
      // The epic was eaten normally (no portal twin existed or already consumed)
  } else if (eatenType === 'epic' && food.portalLink) {
      // Remove the portal twin
      for (var ptr = extraFoods.length - 1; ptr >= 0; ptr--) {
          if (extraFoods[ptr].portalLink && extraFoods[ptr].x === food.portalLink.x && extraFoods[ptr].y === food.portalLink.y) {
              spawnParticles(extraFoods[ptr].x, extraFoods[ptr].y, 10, '#AA44FF');
              extraFoods.splice(ptr, 1);
              break;
          }
      }
  }
  ```
  Note: this is tricky because `food` is reassigned at line 5824 (`food = generateFood(playerCombined)`) — the portal check must happen BEFORE that reassignment. Place this block right before `food = generateFood(...)` at line 5823.

  Actually, simpler approach: when an epic food spawns, it pushes a portal twin into `extraFoods[]`. The epic food itself is the primary `food`. If the player eats the epic food (primary), they get the epic bonus (normal behavior) and the portal twin in `extraFoods[]` should be removed (no portal effect — the portal is the twin, not the epic). If the player eats the portal twin from `extraFoods[]`, THAT triggers the teleport.

  So: eating the primary epic food = normal eat + remove the twin. Eating the portal twin = teleport. Two separate eat paths.

  For the primary epic eat, before `food = generateFood(...)`, check:
  ```js
  // v9 D: remove portal twin when the primary epic food is eaten
  if (eatenType === 'epic') {
      extraFoods = extraFoods.filter(function(ef) { return !ef.portalLink; });
  }
  ```

### Verify
- Epic food spawns → portal twin appears in a distant tile → dashed purple line connects them → first-time toast. Eat the epic → normal bonus + twin vanishes. Eat the portal twin → snake teleports to the epic's location as a short 3-tile segment. Hunter doesn't flee onto portal/extra foods. Magnet pulls hoard bonus foods but not portal foods. Snapshot save/restore preserves `extraFoods[]`. Walled mode: no portal foods (no `extraFoods[]` entries). `node test-bugfixes.mjs`.

---

## Feature E: Golden Hoard Event (~230 LOC)

### Step 1 — State + constants
- Module-scope:
  ```js
  let hoardActive = false;
  let hoardTimer = 0;
  let hoardTickCounter = 0;
  let scoreMultiplier = 1;
  const HOARD_INTERVAL = 5400; // ~90s at 60ms tick
  const HOARD_DURATION = 900;  // ~15s
  ```
- In `resetGame()` (line 1835), add:
  ```js
  hoardActive = false; hoardTimer = 0; hoardTickCounter = 0; scoreMultiplier = 1;
  ```
  Do NOT add to `resetWaveState()` (E is excluded from Gauntlet).

### Step 2 — Tick logic in updateGame
- In `updateGame()`, after the `tickBounty()` call (search for `tickBounty()`), add the hoard tick:
  ```js
  // v9 E: Golden Hoard event
  if (!hoardActive && MODE_CONFIG[gameMode].hoardEnabled) {
      hoardTickCounter++;
      if (hoardTickCounter >= HOARD_INTERVAL && gameState === 'playing') {
          activateHoard();
      }
  } else if (hoardActive) {
      hoardTimer--;
      if (hoardTimer <= 0) {
          endHoard();
      }
  }
  ```

### Step 3 — activateHoard / endHoard
- New functions:
  ```js
  function activateHoard() {
      hoardActive = true;
      hoardTimer = HOARD_DURATION;
      scoreMultiplier = 2;
      // Spawn 4 bonus foods into extraFoods[]
      for (var i = 0; i < 4; i++) {
          var hf = generateFood(snake.concat(rivalCombinedSnake()).concat(extraFoods));
          if (hf) { hf.type = 'bonus'; hf.spawnTime = performance.now(); extraFoods.push(hf); }
      }
      queueToast('⚡ Golden Hoard! 2x score!', 3000);
      queueGameEffect('flash', { color: '#FFD700', alpha: 0.3, priority: 'normal' });
      // Suppress bounty urgency ring during hoard (F2 checks hoardActive)
      // Hold bounty spawns: bountyTickCounter stays at 0 while hoardActive (tickBounty gate below)
  }
  function endHoard() {
      hoardActive = false;
      scoreMultiplier = 1;
      hoardTickCounter = 0;
      queueToast('Hoard ended', 1500);
  }
  ```

### Step 4 — Bounty suppression during hoard
- In `tickBounty()` (line 3074), the `bountyTickCounter++` line (line 3076) — gate it on `!hoardActive`:
  ```js
  if (!activeBounty) {
      if (!hoardActive) bountyTickCounter++;  // v9 E: suppress bounty spawns during hoard
      if (bountyTickCounter >= BOUNTY_INTERVAL && gameState === 'playing') {
  ```

### Step 5 — scoreMultiplier in addScore
- In `addScore()` (line 1636), modify the final score addition (line 1654):
  ```js
  // v9 E: hoard scoreMultiplier (cap with golden_food to prevent ×6 trivialization)
  var effectiveHoardMult = scoreMultiplier;
  if (activeMutators.indexOf('golden_food') !== -1 && scoreMultiplier > 1) {
      effectiveHoardMult = Math.min(scoreMultiplier, 1.5); // Hoard + Golden Age = ×4.5 max, not ×6
  }
  score += Math.round(amount * multi * effectiveHoardMult);
  ```

### Step 6 — Rival freeze (movement + respawn timer)
- In the rival respawn timer block (line 5961), gate on `!hoardActive`:
  ```js
  // v9 E: gate rival respawn during hoard
  if (!anyRivalAlive && rivals.length > 0 && rivals[0].respawnTimer > 0 && !hoardActive) {
  ```
- In the rival update block (line 5969), gate on `!hoardActive`:
  ```js
  if (anyRivalActive() && !hoardActive) {
  ```

### Step 7 — Post-FX golden tint
- In `drawPostFX()` (line 4569), after the slow-mo tint (line 4583), add:
  ```js
  // v9 E: Golden Hoard tint
  if (hoardActive) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.06)'; // subtle gold tint
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  ```
  Calm-mode gate: the tint is already subtle (0.06 alpha). For calm mode, make it even subtler or skip — but since it's informational (signals the active event), keep it at 0.03 in calm mode:
  ```js
  if (hoardActive) {
      ctx.fillStyle = calmModeEffective() ? 'rgba(255, 215, 0, 0.03)' : 'rgba(255, 215, 0, 0.06)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  ```

### Step 8 — Mode gating
- In `MODE_CONFIG`, add `hoardEnabled: true` to Classic, Time Attack, Daily, Snap. Add `hoardEnabled: false` (or omit) to Zen, Walled, Painter, Gauntlet.
- Search for `MODE_CONFIG` definition and add the field to each mode entry.

### Step 9 — Snapshot serialization
- In `buildSnapshotObject()` (line 2266), after the bounty fields (line 2350), add:
  ```js
  // v9 E: hoard state (additive — no SNAPSHOT_VERSION bump).
  hoardActive: hoardActive,
  hoardTimer: hoardTimer,
  hoardTickCounter: hoardTickCounter,
  scoreMultiplier: scoreMultiplier,
  ```
- In `restoreFromSnapshot()` (line 2386), after the bounty restore (line 2479), add:
  ```js
  // v9 E: hoard state
  hoardActive = !!data.hoardActive;
  hoardTimer = data.hoardTimer || 0;
  hoardTickCounter = data.hoardTickCounter || 0;
  scoreMultiplier = data.scoreMultiplier || 1;
  ```

### Verify
- Classic mode: play ~90s → Hoard activates → 4 bonus foods spawn, gold tint, 2x score. Bounty ring suppressed. Rival freezes (no movement, no respawn). After 15s → Hoard ends, tint disappears, rival resumes. Golden Age mutator + Hoard → score capped at ×4.5. Snapshot mid-hoard → restore → hoard resumes with foods. Zen/Walled/Painter/Gauntlet → no Hoard. Snap → Hoard fires. `node test-bugfixes.mjs`.

---

## AGENTS.md updates (cleanup phase, after smoke tests pass)
- Add sections for: Save Data Export/Import (settings panel buttons, version-1 format), Visibility-Safe Auto-Save (visibilitychange calls saveSnapshot before pause), Diary Seed Replay (retrySeedFromDiary mirrors input handler hash, not snapshot restore), Combo Heat Aura (z-order: halo before body, alpha cap, shield dim; absolute coords not local origin), Visual Feedback Pack (shared transientRings[] array, 3 sub-features, calm-mode gates), Portal Food (extraFoods[] shared array infrastructure, Phoenix-style body re-anchor, moveHunter rejection, magnet skip for portal, echo-brew coercion, player onboarding toast, welcome overlay update, snapshot additive), Golden Hoard Event (tick-counted, scoreMultiplier inside addScore with golden_food cap, bounty suppression, rival freeze gates respawn timer, mode gating, post-FX tint, snapshot additive).
- Update the "Dual Render Loops — rAF Write Boundary" section to note transientRings[] as a rAF-drained visual array (same pattern as deathFragments).
- Update the food system section to document the `extraFoods[]` array as the parallel food container for portal + hoard foods.

---

## Final steps (per process)
7. Code review by a subagent.
8. Iterate on review issues.
9. Commit + push to `feat/v9-cycle` (branch from `feat/v8-cycle`).
10. Ask the user for review (Multica comment, mention JC).
11. (Deferred to the next run, after JC approves) close the issue, schedule a new cycle, self-assign.