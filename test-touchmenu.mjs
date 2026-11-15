// FOV-2728 test suite — "phone players cannot open any menu panel".
//
// The gate: in an emulated phone, a defined touch gesture opens each of the
// seven panels (Settings, Quests, Achievements, Cosmetics, Brews, Diary, Stats);
// a tap on the play area still starts the game and opens nothing; every
// instruction rendered on touch names an input touch actually has.
//
// Run: node test-touchmenu.mjs
// file:// only — none of these fixtures touch the funnel. Never run a fixture
// against https://j3k0.github.io/snakes/ — a visit there is counted traffic.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.env.SNAKE_FILE || join(__dirname, 'snake.html');

let pass = 0, fail = 0;
function ok(name) { console.log('  PASS  ' + name); pass++; }
function fail_(name, msg) { console.log('  FAIL  ' + name + (msg ? ': ' + msg : '')); fail++; }
function check(name, cond, msg) { cond ? ok(name) : fail_(name, msg); }

const PANELS = {
    settings: 'settingsPanel',
    quests: 'questsPanel',
    achievements: 'achievementsPanel',
    cosmetics: 'cosmeticsPanel',
    brews: 'brewsPanel',
    diary: 'diaryPanel',
    stats: 'statsPanel'
};
const ALL_PANEL_IDS = Object.values(PANELS);

// Skip the first-run welcome overlay without eating attempts or starting a run.
async function enterIdle(page) {
    await page.evaluate(() => {
        welcomeOverlay = false;
        saveManager.set('snake_has_played', '1');
        updateMenuFooter();
        drawGame(1);
    });
    await page.waitForTimeout(100);
}

// Canvas coords -> page coords (the canvas is CSS-scaled).
async function tapCanvasAt(page, cx, cy) {
    const box = await page.evaluate(([x, y]) => {
        const rect = document.getElementById('gameCanvas').getBoundingClientRect();
        return { x: rect.left + (x / CANVAS_WIDTH) * rect.width,
                 y: rect.top + (y / CANVAS_HEIGHT) * rect.height };
    }, [cx, cy]);
    await page.touchscreen.tap(box.x, box.y);
    await page.waitForTimeout(120);
}

async function startFillTextRecorder(page) {
    await page.evaluate(() => {
        window.__strings = [];
        if (!window.__origFillText) {
            window.__origFillText = CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText = function(t) {
                window.__strings.push(String(t));
                return window.__origFillText.apply(this, arguments);
            };
        }
    });
}

// ---------------------------------------------------------------------------
// Fixture A: emulated phone 320x568, fresh profile — the gate.
// ---------------------------------------------------------------------------
{
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 320, height: 568 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    check('A: no page errors on load', errors.length === 0, errors.join('; '));

    check('A: ☰ button visible at idle on touch',
          await page.evaluate(() => document.getElementById('touchMenuBtn').style.display !== 'none'));

    // The ☰ lives in the D-pad row (zero board cost): both must sit inside the
    // viewport at 320x568 (v15 F2 contract with the new control).
    const barFits = await page.evaluate(() => {
        const r = document.getElementById('touchMenuBtn').getBoundingClientRect();
        return r.bottom <= window.innerHeight && r.height > 0;
    });
    check('A: ☰ button inside the viewport at 320x568', barFits);
    // If the ☰ cost the board height (the standalone-bar design did — it broke
    // the v15 C2/C3 gates), the canvas grows and pushes the D-PAD off-screen
    // (body anchors to the top on overflow).
    const dpadFits = await page.evaluate(() => {
        const r = document.getElementById('dpad').getBoundingClientRect();
        return r.bottom <= window.innerHeight + 1;
    });
    check('A: D-pad still inside the viewport at 320x568 with the bar', dpadFits);
    // v15 C3 parity: the ☰ must cost the board nothing — the band floor (48 canvas
    // px at the scale the 320x568 cap allows) needs >= 24 PHYSICAL px. A standalone
    // menu bar cost 36px of cap and broke this (measured 21.4). Replaced by v15.
    const bandH = await page.evaluate(() => {
        // Fresh profile: the welcome overlay replaces the idle draw (no band) —
        // dismiss it the way a player does, then read the drawn band.
        welcomeOverlay = false; saveManager.set('snake_has_played', '1'); drawGame(1);
        const rect = document.getElementById('gameCanvas').getBoundingClientRect();
        return startBandRect ? startBandRect.h * (rect.height / CANVAS_HEIGHT) : -1;
    });
    check('A: v15 parity — start band >= 24 physical px at 320x568', bandH >= 24,
          'band=' + bandH.toFixed(1));
    // v15 C2 parity: a common phone (390x844, non-compact) keeps today's board
    // (>=500px, h1 and the DOM score lines visible) with the ☰ in the D-pad row.
    {
        const ctxP = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
        const pageP = await ctxP.newPage();
        await pageP.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
        await pageP.waitForTimeout(400);
        const r = await pageP.evaluate(() => {
            const c = document.getElementById('gameCanvas').getBoundingClientRect();
            return { h: c.height, top: c.top, bottom: c.bottom, innerH: window.innerHeight,
                     compact: document.body.classList.contains('compact'),
                     h1: getComputedStyle(document.querySelector('h1')).display !== 'none',
                     scoreLine: getComputedStyle(document.getElementById('scoreLine')).display !== 'none' };
        });
        check('A: v15 parity — 390x844 board >= 500px, h1/score visible, no compact',
              !r.compact && r.h1 && r.scoreLine && r.h >= 500, JSON.stringify(r));
        check('A: v15 parity — 390x844 whole board inside the viewport',
              r.top >= 0 && r.bottom <= r.innerH, JSON.stringify(r));
    }
    const scale = await page.evaluate(() =>
        parseFloat(document.documentElement.style.getPropertyValue('--snakes-scale')));
    check('A: board scale stays >= 0.4 at 320x568 with the bar (measured chrome counts it)',
          scale >= 0.4, 'scale was ' + scale);

    await enterIdle(page);

    // Tap the play area (canvas centre — outside the start band): still NOTHING.
    await startFillTextRecorder(page);
    await tapCanvasAt(page, 220, 300);
    const afterScatter = await page.evaluate(() => ({
        state: gameState,
        anyPanel: ['statsPanel','achievementsPanel','cosmeticsPanel','questsPanel','settingsPanel','brewsPanel','diaryPanel'].some(id => document.getElementById(id).style.display === 'block'),
        picker: document.getElementById('touchMenuList').style.display
    }));
    check('A: a tap on the play area at idle starts nothing',
          afterScatter.state === 'idle' && !afterScatter.anyPanel && afterScatter.picker === 'none',
          JSON.stringify(afterScatter));

    // Tap the start band: the run STARTS (F3 unaffected) and the bar hides.
    const bandPagePos = await page.evaluate(() => {
        const rect = document.getElementById('gameCanvas').getBoundingClientRect();
        const mid = { x: startBandRect.x + startBandRect.w / 2, y: startBandRect.y + startBandRect.h / 2 };
        return { x: rect.left + (mid.x / CANVAS_WIDTH) * rect.width,
                 y: rect.top + (mid.y / CANVAS_HEIGHT) * rect.height };
    });
    await page.touchscreen.tap(bandPagePos.x, bandPagePos.y);
    await page.waitForTimeout(300);
    check('A: tapping the start band still starts the game',
          await page.evaluate(() => gameState === 'playing'));
    check('A: ☰ button hidden while playing',
          await page.evaluate(() => document.getElementById('touchMenuBtn').style.display === 'none'));

    // Back to gameover — the bar returns (the keys stay gated there too).
    await page.evaluate(() => { stopGameLoop(); gameOver(); });
    await page.waitForTimeout(200);
    check('A: ☰ button visible at gameover',
          await page.evaluate(() => document.getElementById('touchMenuBtn').style.display !== 'none'));

    // Enter idle again and walk all seven panels: ☰ -> picker -> row -> panel.
    await page.evaluate(() => { resetGame(); });
    await page.waitForTimeout(150);
    await enterIdle(page);
    const btnBox = await page.evaluate(() => {
        const r = document.getElementById('touchMenuBtn').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    for (const [panelKey, panelId] of Object.entries(PANELS)) {
        await page.touchscreen.tap(btnBox.x, btnBox.y);
        await page.waitForTimeout(120);
        const pickerOpen = await page.evaluate(() =>
            document.getElementById('touchMenuList').style.display === 'flex' &&
            document.getElementById('touchMenuList').querySelectorAll('[data-panel]').length === 7);
        if (!pickerOpen) { fail_('A: picker opens on ☰ tap (' + panelKey + ')'); break; }
        const row = await page.evaluate((key) => {
            const el = document.getElementById('touchMenuList').querySelector('[data-panel="' + key + '"]');
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }, panelKey);
        await page.touchscreen.tap(row.x, row.y);
        await page.waitForTimeout(200);
        const st = await page.evaluate((pid) => ({ open: document.getElementById(pid).style.display === 'block',
                                                   picker: document.getElementById('touchMenuList').style.display,
                                                   backdrop: document.getElementById('panelBackdrop').style.display }), panelId);
        check('A: tapping "' + panelKey + '" opens its panel', st.open && st.picker === 'none' && st.backdrop === 'block',
              JSON.stringify(st));
        // Backdrop tap closes it — the top sliver above any clamped panel
        // (panels cap to 80vh on phones; panel top ≥ 40px there).
        await page.touchscreen.tap(160, 5);
        await page.waitForTimeout(120);
        const closed = await page.evaluate((pid) =>
            document.getElementById(pid).style.display === 'none' &&
            document.getElementById('panelBackdrop').style.display === 'none' &&
            document.getElementById('touchMenuList').style.display === 'none', panelId);
        check('A: backdrop tap closes "' + panelKey + '"', closed);
    }
    check('A: no page errors after the panel walk', errors.length === 0, errors.join('; '));

    // The bar is gated: a keyboard-only (desktop) profile never sees it.
    const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const bpage = await bctx.newPage();
    await bpage.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
    await bpage.waitForTimeout(400);
    check('A: ☰ button hidden on a non-touch (desktop) profile',
          await bpage.evaluate(() => document.getElementById('touchMenuBtn').style.display === 'none'));
    await browser.close();
}

// ---------------------------------------------------------------------------
// Fixture B: play-area tap does not open panels DURING the run, and the bar
// cannot open a panel from a state the keys cannot.
// ---------------------------------------------------------------------------
{
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 320, height: 568 } });
    const page = await ctx.newPage();
    await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    await enterIdle(page);

    // Force the gate: click the picker row handlers while playing. The bar is
    // hidden, but the guards must hold if anything ever calls them.
    await page.evaluate(() => { resetGame(); startGame(); stopGameLoop(); });
    const guarded = await page.evaluate(() => {
        document.getElementById('touchMenuList').style.display = 'flex';
        document.getElementById('touchMenuList')
            .querySelector('[data-panel="settings"]').click();
        return {
            open: document.getElementById('settingsPanel').style.display === 'block',
            state: gameState
        };
    });
    check('B: picker rows refuse to open a panel while playing',
          guarded.state === 'playing' && !guarded.open, JSON.stringify(guarded));

    // A tap on the play area while playing is a direction/pause input — never a panel.
    await tapCanvasAt(page, 220, 300);
    check('B: during play, a canvas tap never opens a panel',
          await page.evaluate(() => gameState === 'playing' &&
              ['statsPanel','achievementsPanel','cosmeticsPanel','questsPanel','settingsPanel','brewsPanel','diaryPanel']
                  .every(id => document.getElementById(id).style.display === 'none')));

    // Pause menu copy truth: rendered strings must name taps, not keys.
    await startFillTextRecorder(page);
    await page.evaluate(() => {
        gameState = 'paused';
        drawGame(1);
        pauseConfirmPending = true; pauseConfirmAction = 'restart';
        window.__strings.length = 0;
        drawGame(1);
    });
    await page.waitForTimeout(100);
    const pauseStrings = await page.evaluate(() => window.__strings.slice());
    check('B: pause confirm prompt names taps on touch',
          pauseStrings.some(s => s.indexOf('Tap Yes or No') !== -1),
          pauseStrings.join(' | '));
    check('B: pause confirm prompt never names keys on touch',
          pauseStrings.every(s => s.indexOf('Enter = Yes') === -1),
          pauseStrings.join(' | '));
    await page.evaluate(() => {
        pauseConfirmPending = false; pauseConfirmAction = null;
        window.__strings.length = 0;
        drawGame(1);
    });
    const pauseFooter = await page.evaluate(() => window.__strings.slice());
    check('B: pause menu footer names taps on touch',
          pauseFooter.some(s => s.indexOf('Tap an option') !== -1) &&
          pauseFooter.every(s => s.indexOf('Enter Select') === -1),
          pauseFooter.join(' | '));

    // Gameover fallback overlay (the no-recap path) and gauntlet screens.
    await startFillTextRecorder(page);
    await page.evaluate(() => {
        recapData = null;
        gameState = 'gameover';
        window.__strings.length = 0;
        drawGame(1);
    });
    const goStrings = await page.evaluate(() => window.__strings.slice());
    check('B: gameover fallback names a tap on touch',
          goStrings.some(s => s.indexOf('Tap to Restart') !== -1) && goStrings.every(s => s.indexOf('Press') === -1),
          JSON.stringify(goStrings));

    await startFillTextRecorder(page);
    await page.evaluate(() => {
        gameMode = 'gauntlet'; gauntletWave = GAUNTLET_WAVES.length - 1;
        window.__strings.length = 0;
        drawGame(1);
    });
    const gcStrings = await page.evaluate(() => window.__strings.slice());
    check('B: gauntlet-complete screen names a tap on touch',
          gcStrings.some(s => s === 'Tap for menu') && gcStrings.every(s => s.indexOf('Press Enter') === -1),
          gcStrings.join(' | '));

    // Resume Run row: tap work is already wired; the (R) hint must not render on touch.
    await startFillTextRecorder(page);
    await page.evaluate(() => {
        resetGame();
        startGame(); stopGameLoop();
        saveSnapshot();
        resetGame();
        window.__strings.length = 0;
        drawGame(1);
    });
    const idleStrings = await page.evaluate(() => window.__strings.slice());
    const resumeIdx = idleStrings.findIndex(s => s.indexOf('Resume Run') !== -1);
    check('B: Resume Run row drops the (R) key hint on touch',
          resumeIdx !== -1 && idleStrings.some(s => s === '▶ Resume Run') &&
          idleStrings.every(s => s.indexOf('(R)') === -1),
          idleStrings.filter(s => s.indexOf('Resume') !== -1).join(' | '));

    // Idle footer hint names the menu.
    const hint = await page.evaluate(() => document.getElementById('shortcutInfo').innerText);
    check('B: idle footer hint names the ☰ menu on touch', hint.indexOf('☰') !== -1, hint);

    // Panel close hints: tap-gated, never key-only, when opened on touch.
    await page.evaluate(() => { welcomeOverlay = false; }); // already idle
    for (const [key, fn] of [['stats', 'showStatsPanel'], ['achievements', 'showAchievementsPanel'],
                             ['cosmetics', 'showCosmeticsPanel'], ['settings', 'showSettingsPanel']]) {
        await page.evaluate((f) => { closeAllPanels(); window[f](); window.__strings = undefined; }, fn);
        const txt = await page.evaluate((pid) => document.getElementById(pid).innerText, PANELS[key]);
        check('B: ' + key + ' panel close hint names ✕ on touch', txt.indexOf('Tap ✕') !== -1, txt);
        check('B: ' + key + ' panel close hint names no key on touch', txt.indexOf('Press') === -1, txt);
    }
    await page.evaluate(() => closeAllPanels());
    await browser.close();
}

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
