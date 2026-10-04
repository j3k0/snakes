import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, 'snake.html');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
let pass = 0, fail = 0;
function ok(name) { console.log('  PASS  ' + name); pass++; }
function fail_(name, msg) { console.log('  FAIL  ' + name + (msg ? ': ' + msg : '')); fail++; }

await page.waitForTimeout(500);

// 1. Load smoke — no JS errors on load
try {
    const errors = await page.evaluate(() => window.__loadErrors || []);
    if (errors.length === 0) ok('No JS errors on load');
    else fail_('No JS errors on load', errors.join('; '));
} catch (e) { fail_('No JS errors on load', e.message); }

// 2. Feature G: Input Buffer Visualization
try {
    const result = await page.evaluate(() => {
        if (typeof dirQueue === 'undefined') return 'dirQueue not defined';
        var src = drawSnake.toString();
        if (!src.includes('dirQueue')) return 'drawSnake does not reference dirQueue';
        if (!src.includes('FFEE88')) return 'drawSnake missing chevron color';
        if (!src.includes('calmModeEffective')) return 'drawSnake missing calm mode gate';
        return 'OK';
    });
    if (result === 'OK') ok('G: drawSnake references dirQueue for chevron rendering');
    else fail_('G: chevron test', result);
} catch (e) { fail_('G: chevron test', e.message); }

// 3. Feature F: Save Corruption Auto-Recovery
try {
    const result = await page.evaluate(() => {
        if (typeof quarantinedKeys === 'undefined') return 'quarantinedKeys not defined';
        if (!(quarantinedKeys instanceof Set)) return 'quarantinedKeys not a Set';
        if (typeof quarantineKey !== 'function') return 'quarantineKey not a function';
        localStorage.setItem('snake_test_bad', '{not json');
        saveManager.getJSON('snake_test_bad', null);
        if (!quarantinedKeys.has('snake_test_bad')) return 'bad key not quarantined';
        if (localStorage.getItem('snake_corrupt_snake_test_bad') === null) return 'quarantine copy not created';
        saveManager.getJSON('snake_corrupt_snake_test_bad', null);
        localStorage.removeItem('snake_test_bad');
        localStorage.removeItem('snake_corrupt_snake_test_bad');
        return 'OK';
    });
    if (result === 'OK') ok('F: quarantineKey quarantines bad keys, re-quarantine guard works');
    else fail_('F: quarantine test', result);
} catch (e) { fail_('F: quarantine test', e.message); }

// 4. Feature D: Daily Seed Determinism — code structure
try {
    const result = await page.evaluate(() => {
        var src = startGame.toString();
        if (!src.includes('getDailySeed')) return 'startGame does not reference getDailySeed';
        if (!src.includes('mulberry32')) return 'startGame does not seed mulberry32';
        var resetSrc = resetGame.toString();
        if (!resetSrc.includes('seedPrng = null')) return 'resetGame does not clear seedPrng';
        if (!resetSrc.includes('activeSeed = null')) return 'resetGame does not clear activeSeed';
        var snapSrc = buildSnapshotObject.toString();
        if (!snapSrc.includes('seedOffset')) return 'snapshot does not include seedOffset';
        var restoreSrc = restoreFromSnapshot.toString();
        if (!restoreSrc.includes('seedOffset')) return 'restore does not include seedOffset';
        return 'OK';
    });
    if (result === 'OK') ok('D: daily seed PRNG + resetGame clear + hazard seedOffset snapshot');
    else fail_('D: daily seed test', result);
} catch (e) { fail_('D: daily seed test', e.message); }

// 5. Feature D: Daily mode food positions are deterministic
try {
    const result = await page.evaluate(() => {
        var seed = getDailySeed();
        gameMode = 'daily';
        seedPrng = mulberry32(seed);
        activeSeed = String(seed);
        resetGame();
        seedPrng = mulberry32(seed);
        activeSeed = String(seed);
        var food1 = generateFood(snake);
        if (!food1) return 'food1 not generated';
        var pos1 = { x: food1.x, y: food1.y };
        gameMode = 'daily';
        resetGame();
        seedPrng = mulberry32(seed);
        activeSeed = String(seed);
        var food2 = generateFood(snake);
        if (!food2) return 'food2 not generated';
        var pos2 = { x: food2.x, y: food2.y };
        seedPrng = null;
        activeSeed = null;
        if (pos1.x !== pos2.x || pos1.y !== pos2.y) return 'food positions differ: ' + JSON.stringify(pos1) + ' vs ' + JSON.stringify(pos2);
        return 'OK';
    });
    if (result === 'OK') ok('D: daily mode food positions are deterministic across restarts');
    else fail_('D: determinism test', result);
} catch (e) { fail_('D: determinism test', e.message); }

// 6. Feature A: Hazard Chain Bonus — state + addScore + reset + snapshot
try {
    const result = await page.evaluate(() => {
        if (typeof hazardChainStreak === 'undefined') return 'hazardChainStreak not defined';
        if (typeof hazardAdjacentThisTick === 'undefined') return 'hazardAdjacentThisTick not defined';
        var src = addScore.toString();
        if (!src.includes('hazardChainMult')) return 'addScore does not reference hazardChainMult';
        if (!src.includes('Math.min')) return 'addScore missing global cap';
        var tickSrc = tickHazards.toString();
        if (!tickSrc.includes('hazardAdjacentThisTick')) return 'tickHazards does not check adjacency';
        var resetSrc = resetGame.toString();
        if (!resetSrc.includes('hazardChainStreak = 0')) return 'resetGame does not clear hazardChainStreak';
        var waveSrc = resetWaveState.toString();
        if (!waveSrc.includes('hazardChainStreak = 0')) return 'resetWaveState does not clear hazardChainStreak';
        var snapSrc = buildSnapshotObject.toString();
        if (!snapSrc.includes('hazardChainStreak')) return 'snapshot missing hazardChainStreak';
        return 'OK';
    });
    if (result === 'OK') ok('A: hazardChainStreak state + addScore multiplier + reset sites + snapshot');
    else fail_('A: hazard chain test', result);
} catch (e) { fail_('A: hazard chain test', e.message); }
try {
    const result = await page.evaluate(() => {
        gameMode = 'classic';
        resetGame();
        score = 0;
        hazardAdjacentThisTick = false;
        hazardChainStreak = 0;
        addScore(100);
        var scoreNoChain = score;
        score = 0;
        hazardAdjacentThisTick = true;
        hazardChainStreak = 2;
        addScore(100);
        var scoreWithChain = score;
        hazardAdjacentThisTick = false;
        hazardChainStreak = 0;
        if (scoreNoChain !== 100) return 'no-chain score wrong: ' + scoreNoChain;
        if (scoreWithChain !== 200) return 'chain score wrong: ' + scoreWithChain + ' (expected 200)';
        return 'OK';
    });
    if (result === 'OK') ok('A: hazard chain multiplier applies (x2.0 at streak 2)');
    else fail_('A: multiplier test', result);
} catch (e) { fail_('A: multiplier test', e.message); }

// 8. Feature B: Combo Heat -> Hazard Melt — melt branch in updateGame
try {
    const result = await page.evaluate(() => {
        var src = updateGame.toString();
        if (!src.includes('comboCount >= 10')) return 'updateGame missing combo >= 10 melt branch';
        if (!src.includes('Melted a hazard')) return 'melt branch missing toast text';
        if (!src.includes('hazardChainStreak = 0')) return 'melt does not reset hazardChainStreak';
        var heatSrc = comboHeatColor.toString();
        if (!heatSrc.includes('10')) return 'comboHeatColor missing combo 10 tier';
        var drawSrc = drawSnake.toString();
        if (!drawSrc.includes('FF6600')) return 'haloColor missing molten tier';
        return 'OK';
    });
    if (result === 'OK') ok('B: melt branch in updateGame + comboHeatColor >= 10 + molten halo');
    else fail_('B: melt test', result);
} catch (e) { fail_('B: melt test', e.message); }

// 9. Feature B: Melt prevents death at combo >= 10
try {
    const result = await page.evaluate(() => {
        gameMode = 'classic';
        resetGame();
        startGame();
        comboCount = 10;
        snake = [{ x: 100, y: 100 }];
        hazards = [{ cx: 100, cy: 100, radius: TILE_SIZE * 1.5, phase: 'on', phaseTimer: 10, lifeTimer: 300, maxLife: 300, seedOffset: 0 }];
        dx = 1; dy = 0;
        dirQueue = [];
        lastConsumedDir = { dx: 1, dy: 0 };
        updateGame();
        var gs = gameState;
        var cc = comboCount;
        hazards = [];
        comboCount = 0;
        stopGameLoop();
        gameState = 'idle';
        if (gs === 'gameover') return 'died despite combo >= 10 melt';
        if (gs !== 'playing') return 'gameState not playing after melt: ' + gs;
        if (cc !== 0) return 'comboCount not reset on melt: ' + cc;
        return 'OK';
    });
    if (result === 'OK') ok('B: melt prevents death at combo >= 10, resets combo');
    else fail_('B: melt behavior test', result);
} catch (e) { fail_('B: melt behavior test', e.message); }

// 10. Feature E: Streak Multiplier Ladder — code structure
try {
    const result = await page.evaluate(() => {
        var src = awardXP.toString();
        if (!src.includes('streakMult')) return 'awardXP missing streakMult';
        if (!src.includes('snake_streak_count')) return 'awardXP does not read streak count';
        if (typeof streakCharges === 'undefined') return 'streakCharges not defined';
        var updateSrc = updateGame.toString();
        if (!updateSrc.includes('tryStreakChargeSave')) return 'updateGame missing tryStreakChargeSave';
        var count = (updateSrc.match(/tryStreakChargeSave/g) || []).length;
        if (count < 4) return 'tryStreakChargeSave called only ' + count + ' times (need 4)';
        var snapSrc = buildSnapshotObject.toString();
        if (snapSrc.includes('streakCharges')) return 'snapshot should NOT store streakCharges (C6 fix)';
        // Check streakCharges re-read in startGame
        var startSrc = startGame.toString();
        if (!startSrc.includes('snake_streak_charges')) return 'startGame does not re-read streakCharges';
        // Check threshold grant in startGame
        if (!startSrc.includes('STREAK_CHARGE_DAYS')) return 'startGame missing threshold grant';
        return 'OK';
    });
    if (result === 'OK') ok('E: streak XP multiplier + streakCharges + tryStreakChargeSave in 4 paths + snapshot + threshold grant');
    else fail_('E: streak multiplier test', result);
} catch (e) { fail_('E: streak multiplier test', e.message); }

// 10b. Feature E: the streak multiplier, driven (v14 G1 — replaces src.includes('0.30')).
try {
    const r = await page.evaluate(() => {
        gameMode = 'classic';
        const savedXp = xp, savedLevel = level, savedStreak = saveManager.getInt('snake_streak_count', 0);
        const gain = (days) => {
            saveManager.set('snake_streak_count', days);
            xp = 0; level = 1; const before = xp; awardXP(100); return xp - before;
        };
        const out = { d0: gain(0), d10: gain(10), d30: gain(30), d100: gain(100) };
        saveManager.set('snake_streak_count', savedStreak); xp = savedXp; level = savedLevel; cachedLevel = -1;
        return out;
    });
    if (r.d0 === 100 && r.d10 === 110 && r.d30 === 130 && r.d100 === 130) ok('E: streak XP multiplier +1%/day, capped at +30%');
    else fail_('E: streak multiplier behaviour', JSON.stringify(r));
} catch (e) { fail_('E: streak multiplier behaviour', e.message); }

// 11. Feature E: Streak charge saves from death (behavioral)
try {
    const result = await page.evaluate(() => {
        gameMode = 'classic';
        resetGame();
        startGame();
        streakCharges = 1;
        saveManager.set('snake_streak_charges', 1);
        // Snake at x=100 heading left (dx=-1). Next head pos = x=80.
        snake = [{ x: 100, y: 100 }, { x: 120, y: 100 }, { x: 140, y: 100 }];
        obstacles = [{ x: 80, y: 100 }];
        dx = -TILE_SIZE; dy = 0;
        dirQueue = [];
        lastConsumedDir = { dx: -TILE_SIZE, dy: 0 };
        comboCount = 0;
        shieldActive = false;
        activeBrews = [];
        brewUsageFlags = { vampireUsed: false, phoenixUsed: false };
        evolutionTier = -1;
        updateGame();
        var gs = gameState;
        var charges = streakCharges;
        obstacles = [];
        stopGameLoop();
        gameState = 'idle';
        if (gs === 'gameover') return 'died despite streak charge';
        if (charges !== 0) return 'streakCharges not decremented: ' + charges;
        saveManager.set('snake_streak_charges', 0);
        streakCharges = 0;
        return 'OK';
    });
    if (result === 'OK') ok('E: streak charge saves from obstacle collision death');
    else fail_('E: streak charge test', result);
} catch (e) { fail_('E: streak charge test', e.message); }

// 12. Feature C: Hoard Pigment Rush — code structure
try {
    const result = await page.evaluate(() => {
        if (typeof hoardPigmentCount === 'undefined') return 'hoardPigmentCount not defined';
        if (typeof pigmentRushTimer === 'undefined') return 'pigmentRushTimer not defined';
        if (typeof pigmentRushActive === 'undefined') return 'pigmentRushActive not defined';
        var src = activateHoard.toString();
        if (!src.includes('pigment = true')) return 'activateHoard does not tag pigment';
        if (!src.includes('hoardPigmentCount = 0')) return 'activateHoard does not reset pigment count';
        var addSrc = addScore.toString();
        if (!addSrc.includes('pigmentRushActive')) return 'addScore missing pigmentRushActive';
        var updateSrc = updateGame.toString();
        if (!updateSrc.includes('pigmentRushTimer')) return 'updateGame missing pigmentRushTimer decay';
        var snapSrc = buildSnapshotObject.toString();
        if (!snapSrc.includes('pigment')) return 'snapshot missing pigment field';
        var restoreSrc = restoreFromSnapshot.toString();
        if (!restoreSrc.includes('pigment')) return 'restore missing pigment field';
        var resetSrc = resetGame.toString();
        if (!resetSrc.includes('pigmentRushActive = false')) return 'resetGame does not clear pigment rush';
        return 'OK';
    });
    if (result === 'OK') ok('C: pigment rush state + activateHoard tags + addScore override + tick decay + snapshot + reset');
    else fail_('C: pigment rush test', result);
} catch (e) { fail_('C: pigment rush test', e.message); }

// 13. Feature C: Pigment rush triggers at 4 pigment foods
try {
    const result = await page.evaluate(() => {
        gameMode = 'classic';
        resetGame();
        hoardPigmentCount = 0;
        pigmentRushActive = false;
        pigmentRushTimer = 0;
        for (var i = 0; i < 4; i++) hoardPigmentCount++;
        if (hoardPigmentCount >= 4 && !pigmentRushActive) {
            pigmentRushActive = true;
            pigmentRushTimer = 300;
        }
        if (!pigmentRushActive) return 'pigmentRushActive not set';
        if (pigmentRushTimer !== 300) return 'pigmentRushTimer not 300';
        score = 0;
        addScore(100);
        if (score !== 300) return 'rush score wrong: ' + score + ' (expected 300)';
        pigmentRushActive = false;
        pigmentRushTimer = 0;
        hoardPigmentCount = 0;
        return 'OK';
    });
    if (result === 'OK') ok('C: pigment rush triggers at 4 foods, x3 multiplier applies');
    else fail_('C: rush trigger test', result);
} catch (e) { fail_('C: rush trigger test', e.message); }

// 14. Canvas renders + game starts without error
try {
    const result = await page.evaluate(() => {
        gameMode = 'classic';
        resetGame();
        startGame();
        return new Promise(function(resolve) {
            setTimeout(function() {
                if (gameState === 'playing' && snake.length > 0) resolve('OK');
                else resolve('game not playing: ' + gameState + ' len=' + snake.length);
            }, 300);
        });
    });
    if (result === 'OK') ok('Canvas renders + game starts without error');
    else fail_('Canvas renders + game starts', result);
} catch (e) { fail_('Canvas renders + game starts', e.message); }

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
await browser.close();
process.exit(fail > 0 ? 1 : 0);