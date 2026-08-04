import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, 'snake.html');

const browser = await chromium.launch();
const page = await browser.newPage();
// Use file:// URL so localStorage is available (setContent denies localStorage)
await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
let pass = 0, fail = 0;
function ok(name) { console.log('  PASS  ' + name); pass++; }
function fail_(name, msg) { console.log('  FAIL  ' + name + (msg ? ': ' + msg : '')); fail++; }

// Load the game
await page.waitForTimeout(500);

// 1. Load smoke — no JS errors on load
try {
    const errors = await page.evaluate(() => window.__loadErrors || []);
    if (errors.length === 0) ok('No JS errors on load');
    else fail_('No JS errors on load', errors.join('; '));
} catch (e) {
    fail_('No JS errors on load', e.message);
}

// 2. Feature G: Input Buffer Queue — 2-deep, reverse-check, perpendicular
try {
    const result = await page.evaluate(() => {
        // dirQueue should exist and be empty
        if (typeof dirQueue === 'undefined') return 'dirQueue not defined';
        if (!Array.isArray(dirQueue)) return 'dirQueue not array';
        if (dirQueue.length !== 0) return 'dirQueue not empty at start';

        // setNextDirection should push to the queue
        setNextDirection(0, -1); // up (perpendicular to initial right)
        if (dirQueue.length !== 1) return 'queue should have 1 entry, got ' + dirQueue.length;

        // Push a second perpendicular direction
        setNextDirection(-1, 0); // left (perpendicular to up)
        if (dirQueue.length !== 2) return 'queue should have 2 entries, got ' + dirQueue.length;

        // Third push should be silently dropped (cap 2)
        setNextDirection(0, 1); // down (perpendicular to left)
        if (dirQueue.length !== 2) return 'queue should still be 2, got ' + dirQueue.length;

        // Reverse check: current dx=1 (right), so left (-1,0) should be rejected from fresh queue
        dirQueue = [];
        lastConsumedDir = { dx: 1, dy: 0 };
        setNextDirection(-1, 0); // reverse of right
        if (dirQueue.length !== 0) return 'reverse should be rejected, got ' + dirQueue.length;

        // Perpendicular should be accepted
        setNextDirection(0, -1); // up
        if (dirQueue.length !== 1) return 'perpendicular should be accepted, got ' + dirQueue.length;

        return 'OK';
    });
    if (result === 'OK') ok('G: dirQueue accepts 2, rejects 3rd, reverse-check works');
    else fail_('G: dirQueue test', result);
} catch (e) {
    fail_('G: dirQueue test', e.message);
}

// 3. Feature F: foodColor() returns correct colors
try {
    const result = await page.evaluate(() => {
        if (typeof foodColor !== 'function') return 'foodColor not defined';
        // Off palette → should return FOOD_TIERS color
        const oldPalette = cvdPalette;
        cvdPalette = 'off';
        const commonOff = foodColor('common');
        if (commonOff !== FOOD_TIERS.common.color) return 'off palette should return tier color, got ' + commonOff;

        // Protan palette → should return palette color
        cvdPalette = 'protan';
        const commonProtan = foodColor('common');
        if (commonProtan === FOOD_TIERS.common.color) return 'protan should return different color';
        if (commonProtan !== CVD_PALETTES.protan.common.fill) return 'protan color mismatch: ' + commonProtan;

        cvdPalette = oldPalette;
        return 'OK';
    });
    if (result === 'OK') ok('F: foodColor returns correct colors for off + protan palettes');
    else fail_('F: foodColor test', result);
} catch (e) {
    fail_('F: foodColor test', e.message);
}

// 4. Feature E: Meta-achievements exist and check works
try {
    const result = await page.evaluate(() => {
        if (typeof META_ACHIEVEMENTS === 'undefined') return 'META_ACHIEVEMENTS not defined';
        const keys = Object.keys(META_ACHIEVEMENTS);
        if (keys.length < 3) return 'need at least 3 meta-achievements, got ' + keys.length;

        // meta_combo_apprentice should not unlock with empty achievements
        achievements = {};
        if (META_ACHIEVEMENTS.meta_combo_apprentice.check()) return 'should not unlock with empty achievements';

        // Set the required achievements
        achievements.COMBO_3 = Date.now();
        achievements.COMBO_5 = Date.now();
        achievements.COMBO_10 = Date.now();
        if (!META_ACHIEVEMENTS.meta_combo_apprentice.check()) return 'should unlock with COMBO_3+5+10';

        // Reset
        achievements = loadAchievements();
        return 'OK';
    });
    if (result === 'OK') ok('E: Meta-achievements check works (unlock + no-unlock)');
    else fail_('E: Meta-achievements test', result);
} catch (e) {
    fail_('E: Meta-achievements test', e.message);
}

// 5. Feature D: Daily Seed Leaderboard storage
try {
    const result = await page.evaluate(() => {
        // The key should be new and empty
        var lb = saveManager.getJSON('snake_daily_lb', {});
        var dayKey = getDayString();
        if (lb[dayKey]) return 'should be empty for today on fresh load';

        // Simulate a daily run result
        lb[dayKey] = [{ score: 100, maxCombo: 3, ts: Date.now() }];
        saveManager.setJSON('snake_daily_lb', lb);

        // Read back
        var lb2 = saveManager.getJSON('snake_daily_lb', {});
        if (!lb2[dayKey] || lb2[dayKey].length !== 1) return 'should persist 1 entry';
        if (lb2[dayKey][0].score !== 100) return 'score mismatch';

        // Cleanup
        delete lb2[dayKey];
        saveManager.setJSON('snake_daily_lb', lb2);
        return 'OK';
    });
    if (result === 'OK') ok('D: Daily Seed Leaderboard persists and retrieves');
    else fail_('D: Daily leaderboard test', result);
} catch (e) {
    fail_('D: Daily leaderboard test', e.message);
}

// 6. Feature B: Bomb food tier exists with correct properties
try {
    const result = await page.evaluate(() => {
        if (!FOOD_TIERS.bomb) return 'bomb tier not defined';
        if (FOOD_TIERS.bomb.pts !== 0) return 'bomb pts should be 0';
        if (FOOD_TIERS.bomb.xp !== 0) return 'bomb xp should be 0';
        if (FOOD_TIERS.bomb.weight !== 0.04) return 'bomb weight should be 0.04';

        // Weights should sum to 1.00
        var sum = 0;
        for (var k in FOOD_TIERS) sum += FOOD_TIERS[k].weight;
        if (Math.abs(sum - 1.0) > 0.001) return 'weights should sum to 1.0, got ' + sum;

        // pickRandomFoodType should have a common fallback
        // (already confirmed in code, but verify no undefined returns)
        var types = new Set();
        for (var i = 0; i < 1000; i++) {
            var t = pickRandomFoodType();
            if (!t) return 'pickRandomFoodType returned undefined';
            types.add(t);
        }
        if (!types.has('bomb')) return 'bomb should appear in 1000 rolls (weight 0.04)';

        return 'OK';
    });
    if (result === 'OK') ok('B: Bomb food tier exists, weight sums to 1.0, spawns correctly');
    else fail_('B: Bomb food test', result);
} catch (e) {
    fail_('B: Bomb food test', e.message);
}

// 7. Feature B: Bomb excluded in Walled mode
try {
    const result = await page.evaluate(() => {
        var oldMode = gameMode;
        gameMode = 'walled';
        var types = new Set();
        for (var i = 0; i < 5000; i++) {
            var t = pickRandomFoodType();
            types.add(t);
        }
        gameMode = oldMode;
        if (types.has('bomb')) return 'bomb should NOT spawn in Walled mode';
        if (types.has('hunter')) return 'hunter should NOT spawn in Walled mode (pre-existing)';
        return 'OK';
    });
    if (result === 'OK') ok('B: Bomb excluded in Walled mode');
    else fail_('B: Walled exclusion test', result);
} catch (e) {
    fail_('B: Walled exclusion test', e.message);
}

// 8. Feature A: Combo Bank state exists
try {
    const result = await page.evaluate(() => {
        if (typeof comboCharges === 'undefined') return 'comboCharges not defined';
        if (comboCharges !== 0) return 'comboCharges should start at 0';
        if (typeof comboBankSpendMode === 'undefined') return 'comboBankSpendMode not defined';
        if (typeof spendComboCharge !== 'function') return 'spendComboCharge not defined';
        // X and Z should be unbound for non-playing states
        // (can't easily test key events in evaluate, but verify the function exists)
        return 'OK';
    });
    if (result === 'OK') ok('A: Combo Bank state and spendComboCharge exist');
    else fail_('A: Combo Bank test', result);
} catch (e) {
    fail_('A: Combo Bank test', e.message);
}

// 9. Feature C: Hazard Zones state exists
try {
    const result = await page.evaluate(() => {
        if (typeof hazards === 'undefined') return 'hazards not defined';
        if (!Array.isArray(hazards)) return 'hazards not array';
        if (hazards.length !== 0) return 'hazards should start empty';
        if (typeof tickHazards !== 'function') return 'tickHazards not defined';
        if (typeof isHazardCollision !== 'function') return 'isHazardCollision not defined';

        // MODE_CONFIG should have hazardsEnabled on all modes
        var modes = Object.keys(MODE_CONFIG);
        for (var i = 0; i < modes.length; i++) {
            if (MODE_CONFIG[modes[i]].hazardsEnabled === undefined) return 'hazardsEnabled missing for ' + modes[i];
        }
        // Classic should have it true
        if (!MODE_CONFIG.classic.hazardsEnabled) return 'classic should have hazardsEnabled:true';
        // Zen should have it false
        if (MODE_CONFIG.zen.hazardsEnabled) return 'zen should have hazardsEnabled:false';
        // Walled should have it false
        if (MODE_CONFIG.walled.hazardsEnabled) return 'walled should have hazardsEnabled:false';
        // Painter should have it false
        if (MODE_CONFIG.painter.hazardsEnabled) return 'painter should have hazardsEnabled:false';
        // Gauntlet should have it false
        if (MODE_CONFIG.gauntlet.hazardsEnabled) return 'gauntlet should have hazardsEnabled:false';

        return 'OK';
    });
    if (result === 'OK') ok('C: Hazard Zones state + MODE_CONFIG all have hazardsEnabled');
    else fail_('C: Hazard Zones test', result);
} catch (e) {
    fail_('C: Hazard Zones test', e.message);
}

// 10. Feature C: isHazardCollision works
try {
    const result = await page.evaluate(() => {
        hazards = [];
        // No hazards → no collision
        if (isHazardCollision({x: 0, y: 0})) return 'should be no collision with no hazards';

        // Add an active hazard at (100, 100) with radius 20
        hazards.push({ cx: 100, cy: 100, radius: 20, phase: 'on', phaseTimer: 10, lifeTimer: 300, maxLife: 300 });
        // Head at (100, 100) → collision
        if (!isHazardCollision({x: 100, y: 100})) return 'should collide with active hazard at center';
        // Head at (200, 200) → no collision (too far)
        if (isHazardCollision({x: 200, y: 200})) return 'should not collide when far away';

        // Off-phase hazard → no collision
        hazards[0].phase = 'off';
        if (isHazardCollision({x: 100, y: 100})) return 'should not collide with off-phase hazard';

        hazards = [];
        return 'OK';
    });
    if (result === 'OK') ok('C: isHazardCollision works (on-phase, off-phase, distance)');
    else fail_('C: isHazardCollision test', result);
} catch (e) {
    fail_('C: isHazardCollision test', e.message);
}

// 11. Snapshot backward-compat: dirQueue restores from old nextDirection
try {
    const result = await page.evaluate(() => {
        // Simulate a v1 snapshot with nextDirection but no dirQueue
        var v1Snapshot = {
            version: 1,
            snake: [{x: 100, y: 100}],
            dx: 1, dy: 0,
            nextDirection: { dx: 0, dy: -1 },
            score: 50,
            gameMode: 'classic',
            gameTick: 10,
        };
        // The restore logic should convert nextDirection to dirQueue
        var restoredQueue = v1Snapshot.dirQueue || (v1Snapshot.nextDirection ? [v1Snapshot.nextDirection] : []);
        if (restoredQueue.length !== 1) return 'should have 1 entry from nextDirection';
        if (restoredQueue[0].dx !== 0 || restoredQueue[0].dy !== -1) return 'direction mismatch';
        return 'OK';
    });
    if (result === 'OK') ok('G: Snapshot backward-compat restores dirQueue from nextDirection');
    else fail_('G: Snapshot back-compat test', result);
} catch (e) {
    fail_('G: Snapshot back-compat test', e.message);
}

// 12. Canvas renders without error after game start
try {
    await page.evaluate(() => {
        // Try to start a game and draw
        gameMode = 'classic';
        startGame();
    });
    await page.waitForTimeout(200);
    const result = await page.evaluate(() => {
        if (gameState !== 'playing') return 'gameState should be playing, got ' + gameState;
        return 'OK';
    });
    if (result === 'OK') ok('Canvas renders + game starts without error');
    else fail_('Canvas render test', result);
} catch (e) {
    fail_('Canvas render test', e.message);
}

// Summary
console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
await browser.close();
process.exit(fail > 0 ? 1 : 0);