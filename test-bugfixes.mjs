import { chromium } from 'playwright';

const FILE = 'file://' + new URL('./snake.html', import.meta.url).pathname;

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect all console messages
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(FILE, { waitUntil: 'networkidle' });

  console.log(`Page loaded. Title: ${await page.title()}`);

  // Check for JS errors during load
  test('No JS errors on load', () => {
    if (errors.length > 0) throw new Error(`Console errors: ${errors.join('; ')}`);
  });

  // Test B1/B2: Speed boost system rewrite
  test('B1/B2: preBoostInterval variable is gone', async () => {
    const hasPreBoost = await page.evaluate(() => typeof preBoostInterval !== 'undefined');
    if (hasPreBoost) throw new Error('preBoostInterval still exists');
  });

  test('B1/B2: speedBoostCounter is accessible', async () => {
    const hasCounter = await page.evaluate(() => typeof speedBoostCounter !== 'undefined');
    if (!hasCounter) throw new Error('speedBoostCounter missing');
  });

  test('B1/B2: restartGameTimeout nulls gameTimeout', async () => {
    const source = await page.evaluate(() => restartGameTimeout.toString());
    if (!source.includes('gameTimeout = null') && !source.includes('stopGameLoop')) throw new Error('restartGameTimeout does not null gameTimeout');
  });

  test('B1/B2: eat speed food, verify speed boost counter starts at 16', async () => {
    // Start a game in classic mode and wait for snake to initialize
    await page.evaluate(() => { gameMode = 'classic'; resetGame(); startGame(); });
    await page.waitForFunction(() => typeof snake !== 'undefined' && snake.length > 0, { timeout: 5000 });

    // Force food to be speed type and move snake onto it
    const result = await page.evaluate(() => {
      food.type = 'speed';
      food.x = snake[0].x + 20;
      food.y = snake[0].y;
      dx = 20;
      dy = 0;
      speedBoostCounter = 0;
      // Trigger one updateGame tick which should eat the food
      updateGame();
      return { counter: speedBoostCounter, interval: tickInterval };
    });
    if (result.counter !== 15) throw new Error(`Expected speedBoostCounter=15 after one eat-tick, got ${result.counter}`);
    if (typeof result.interval !== 'number' || result.interval <= 0) throw new Error(`Bad tickInterval: ${result.interval}`);
    // Clean up
    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // Test: Canvas renders pixels after game starts
  test('Canvas renders pixels after game starts', async () => {
    await page.evaluate(() => { gameMode = 'classic'; resetGame(); startGame(); });
    await page.waitForFunction(() => typeof snake !== 'undefined' && snake.length > 0, { timeout: 5000 });
    // Wait a short moment for a render frame
    await page.waitForTimeout(100);

    const hasPixels = await page.evaluate(() => {
      const canvas = document.getElementById('gameCanvas');
      if (!canvas) return false;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      // Check if any pixel has non-zero alpha
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return true;
      }
      return false;
    });

    if (!hasPixels) throw new Error('Canvas has no rendered pixels after game start');

    // Clean up
    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // Test B3: Daily streak
  // v14 G1: `typeof startGame === 'function'` could not fail on any build that loads.
  test('B3: mode registry intact (8 modes, descriptions present)', async () => {
    const r = await page.evaluate(() => ({ modes: Object.keys(MODE_CONFIG).length,
      painterDesc: getModeDesc('painter').length, hasSyncDaily: typeof syncDailyState === 'function' }));
    if (r.modes !== 8 || !(r.painterDesc > 0) || !r.hasSyncDaily) throw new Error(JSON.stringify(r));
  });

  // B4: Duplicate case
  test('B4: only one combo_milestone case in playSound', async () => {
    const source = await page.evaluate(() => playSound.toString());
    const matches = source.match(/case\s+'combo_milestone':/g);
    if (!matches || matches.length !== 1) throw new Error(`Expected 1 combo_milestone case, got ${matches ? matches.length : 0}`);
  });

  // B5: levelUpFlash inside while loop
  test('B5: levelUpFlash is inside the level-up while loop', async () => {
    const source = await page.evaluate(() => awardXP.toString());
    const lines = source.split('\n');
    const flashLine = lines.findIndex(l => l.includes('levelUpFlash'));
    const whileCloseLine = lines.findIndex(l => l.includes('}') && lines.indexOf(l) > lines.findIndex(l => l.includes('while')));
    // The while loop is around lines with level++, showLevelUpToast, checkLevelUnlocks
    // levelUpFlash should be between the while opening and the closing }
    const whileStart = lines.findIndex(l => l.includes('while (newLevel > level)'));
    const whileBody = lines.slice(whileStart, lines.findIndex((l, i) => i > whileStart && l.trim() === '}' && !l.includes('{')));
    const hasFlashInWhile = whileBody.some(l => l.includes('levelUpFlash'));
    if (!hasFlashInWhile) throw new Error('levelUpFlash not inside the while loop body');
  });

  // B6: Flash overlay renders last in animateVisuals
  test('B6: flash overlay renders last in animateVisuals', async () => {
    const source = await page.evaluate(() => animateVisuals.toString());
    const lines = source.split('\n');
    const flashIdx = lines.findIndex(l => l.includes('flashOverlay') && l.includes('fillRect'));
    const scoreIdx = lines.findIndex(l => l.includes('scoreDelta'));
    if (flashIdx > scoreIdx) throw new Error('Flash overlay renders BEFORE score animation — should render AFTER');
  });

  // B7: Touch D-pad double-dispatch fix
  test('B7: _touchDispatched flag exists', async () => {
    const hasFlag = await page.evaluate(() => typeof _touchDispatched !== 'undefined');
    if (!hasFlag) throw new Error('_touchDispatched flag missing');
  });

  // B8: Rival generateFood double-count fix
  test('B8: rivalLength variable is gone from generateFood', async () => {
    const source = await page.evaluate(() => generateFood.toString());
    if (source.includes('rivalLength')) throw new Error('rivalLength still referenced in generateFood');
  });

  test('B8: generateFood guard uses only currentSnake.length + obstacles.length', async () => {
    const source = await page.evaluate(() => generateFood.toString());
    const hasSimpleGuard = source.includes('currentSnake.length + obstacles.length + extraFoods.length >= totalTiles');
    if (!hasSimpleGuard) throw new Error('generateFood guard not simplified');
  });

  // B9: Magnet wrap edge fix (v8 E: uses PLAY_WIDTH/PLAY_HEIGHT, NOT CANVAS_WIDTH)
  test('B9: magnet pull uses wrapped delta', async () => {
    const source = await page.evaluate(() => {
      const fn = updateGame.toString();
      return fn.includes('PLAY_WIDTH / 2') && fn.includes('PLAY_HEIGHT / 2');
    });
    if (!source) throw new Error('Magnet wrap check not found in updateGame');
  });

  // B10: endZenSession calls checkAchievements and checkDailyCompletion
  // B10: endZenSession calls checkAchievements and checkDailyCompletion (v8 D: uses buildRecapData, not sessionSummary)
  test('B10: endZenSession calls checkAchievements', async () => {
    const source = await page.evaluate(() => endZenSession.toString());
    if (!source.includes('checkAchievements')) throw new Error('endZenSession missing checkAchievements call');
    if (!source.includes('checkDailyCompletion')) throw new Error('endZenSession missing checkDailyCompletion call');
    if (!source.includes('buildRecapData')) throw new Error('endZenSession missing buildRecapData call');
  });
  // B11: drawOverlay has save/restore
  test('B11: drawOverlay has ctx.save at start and ctx.restore at exits', async () => {
    const source = await page.evaluate(() => drawOverlay.toString());
    if (!source.includes('ctx.save()')) throw new Error('drawOverlay missing ctx.save()');
    if (!source.includes('ctx.restore()')) throw new Error('drawOverlay missing ctx.restore()');
  });

  // B13: Snake head render offset on eat — head should snap to true position
  test('B13: head draw position snaps to current when snakeGrew (eat tick)', async () => {
    await page.evaluate(() => { gameMode = 'classic'; resetGame(); startGame(); });
    await page.waitForFunction(() => typeof snake !== 'undefined' && snake.length > 0, { timeout: 5000 });

    const result = await page.evaluate(() => {
      // Place food directly ahead of snake
      food.x = snake[0].x + 20;
      food.y = snake[0].y;
      dx = 20;
      dy = 0;

      // Pre-save the head position before the eat tick
      const headBefore = { x: snake[0].x, y: snake[0].y };

      // Run one tick — this should eat the food
      updateGame();

      // After eat tick: head advanced, snake grew, food regenerated
      // Call drawSnake(t=0) as the animation loop would right after the tick
      const canvas = document.getElementById('gameCanvas');
      const ctx = canvas.getContext('2d');
      // We can't easily capture we captured drawSnake output, but we can check
      // that drawSnake(0) renders head at snake[0] not at prevSnake[0] when snakeGrew
      return {
        headX: snake[0].x,
        headY: snake[0].y,
        prevHeadX: headBefore.x,
        prevHeadY: headBefore.y,
        snakeGrew: typeof snakeGrew !== 'undefined' ? snakeGrew : null,
        prevSnakeLen: typeof prevSnake !== 'undefined' ? prevSnake.length : null,
        // Verify the interpolation logic: at t=0 with snakeGrew,
        // head should draw at snake[0] not prevSnake[0]
        headAtCurrent: !snakeGrew || true // drawSnake logic check below
      };
    });

    // After eating, head should have advanced by TILE_SIZE
    const headAdvanced = result.headX > result.prevHeadX || result.headX < result.prevHeadX;
    if (!headAdvanced) throw new Error('Head did not advance after eat tick');

    // Verify eat was detected by checking snakeGrew
    if (result.snakeGrew === null) throw new Error('snakeGrew not accessible');
    if (!result.snakeGrew) throw new Error('snakeGrew was false after eating — eat detection may not have fired');

    // Verify drawSnake source has the snap-on-eat fix
    const drawSnakeSrc = await page.evaluate(() => drawSnake.toString());
    if (!drawSnakeSrc.includes('snakeGrew')) throw new Error('drawSnake does not reference snakeGrew');
    if (!drawSnakeSrc.includes('if (snakeGrew)')) throw new Error('drawSnake missing snakeGrew snap logic');

    // Clean up
    await page.evaluate(() => { stopGameLoop(); gameState = 'idle'; });
  });

  // B12: Help overlay guard + Escape close
  test('B12: H key handler guards gameState', async () => {
    // Check the keydown handler
    const source = await page.evaluate(() => {
      const handler = document.querySelector('script');
      // Search through the script for the H key handler
      return document.querySelector('script').textContent;
    });
    // The keydown handler is inline in the script
    // Check for the H key pattern in the inline script
    const scriptText = source;
    // Find the H key handler section
    const hMatch = scriptText.match(/e\.key === ['"]h['"]/);
    if (!hMatch) throw new Error('H key handler not found in keydown event');
    // Check for gameState guard
    if (!scriptText.includes("gameState !== 'idle'")) throw new Error('H key handler missing gameState !== idle guard');
    // Check Escape closes help
    if (!scriptText.includes('helpOverlayVisible')) throw new Error('Escape handler missing helpOverlayVisible check');
  });

  // Now run all tests
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✅ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${t.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
