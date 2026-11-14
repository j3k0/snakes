// v15 test suite — "the first ten seconds" (FOV-2676).
//
// C1 (F1 funnel v2) gates. Every gate names its mutation in IMPL_PLAN_v15.md — the
// mutation is run once per gate by the implementer (delete the predicate, confirm the
// assertion fails, restore).
//
// Run: node test-v15.mjs
// The funnel-sequence fixture runs on a HOST-MAPPED origin
// (--host-resolver-rules MAP j3k0.github.io -> 127.0.0.1, served by a local HTTP
// server on :8099) so the REAL isCountedHost/channelForHost gate runs at module init
// and the init-time keys (load, day-*, ch_github) are observable. The file:// fixtures
// prove inertness. Never run any fixture against https://j3k0.github.io/ — that is
// counted production traffic.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.env.SNAKE_FILE || join(__dirname, 'snake.html');

let pass = 0, fail = 0;
function ok(name) { console.log('  PASS  ' + name); pass++; }
function fail_(name, msg) { console.log('  FAIL  ' + name + (msg ? ': ' + msg : '')); fail++; }
function check(name, cond, msg) { cond ? ok(name) : fail_(name, msg); }

const ABACUS = 'abacus.jasoncameron.dev';

// ---------------------------------------------------------------------------
// Fixture A: file:// — beacons must be inert (zero requests to the counting host).
// ---------------------------------------------------------------------------
{
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const hits = [];
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('https://' + ABACUS + '/**', route => {
        hits.push(route.request().url());
        return route.fulfill({ status: 200, body: '' });
    });
    await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    check('C1 file://: no page errors on load', errors.length === 0, errors.join('; '));
    check('C1 file://: zero requests to the counting host on load', hits.length === 0,
          'got: ' + hits.join(', '));

    // Drive a full visit by hand — nothing may reach Abacus even when the game runs.
    await page.evaluate(() => {
        welcomeOverlay = false;
        saveManager.set('snake_has_played', '1');
        gameMode = 'classic';
        resetGame(); startGame(); stopGameLoop();
        food = { x: snake[0].x + TILE_SIZE, y: snake[0].y, type: 'common', spawnTime: performance.now() };
        updateGame(); // eat the food
        updateGame(); updateGame();
        gameOver();
    });
    await page.waitForTimeout(200);
    check('C1 file://: zero requests after a full scripted visit', hits.length === 0,
          'got: ' + hits.join(', '));
    await browser.close();
}

// ---------------------------------------------------------------------------
// Fixture B: host-mapped origin (http://j3k0.github.io:8099) — the real gate runs;
// the full funnel sequence is observable with fetch intercepted.
// ---------------------------------------------------------------------------
{
    const server = http.createServer((req, res) => {
        if (req.url === '/snake.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(readFileSync(htmlPath));
        } else {
            res.writeHead(404); res.end();
        }
    });
    await new Promise(r => server.listen(8099, '127.0.0.1', r));

    const browser = await chromium.launch({
        args: ['--host-resolver-rules=MAP j3k0.github.io 127.0.0.1']
    });
    const page = await browser.newPage();
    const hits = [];
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('https://' + ABACUS + '/**', route => {
        hits.push(route.request().url().split('/hit/j3k0.github.io/')[1]);
        return route.fulfill({ status: 200, body: '' });
    });
    await page.goto('http://j3k0.github.io:8099/snake.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    check('C1 host-mapped: no page errors on load', errors.length === 0, errors.join('; '));
    const keysOf = (arr) => arr.filter(k => k && !k.startsWith('day-'));
    const initKeys = keysOf(hits.slice());
    check('C1 host-mapped: init keys fire once each (load, ch_github)',
          initKeys.filter(k => k === 'load').length === 1 &&
          initKeys.filter(k => k === 'ch_github').length === 1,
          'got: ' + hits.join(', '));
    check('C1 host-mapped: day-<today> fires once',
          hits.filter(k => k && k.startsWith('day-')).length === 1,
          'got: ' + hits.join(', '));

    // One trusted Enter dismisses the welcome overlay AND starts (current desktop
    // behaviour) — overlay_gone + start + keys all fire.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check('C1 host-mapped: Enter fires overlay_gone, start, keys exactly once each',
          hits.filter(k => k === 'overlay_gone').length === 1 &&
          hits.filter(k => k === 'start').length === 1 &&
          hits.filter(k => k === 'keys').length === 1,
          'got: ' + hits.join(', '));
    check('C1 host-mapped: gameState is playing after Enter', 
          await page.evaluate(() => gameState === 'playing'));

    // Eat the first food.
    await page.evaluate(() => {
        stopGameLoop();
        food = { x: snake[0].x + TILE_SIZE, y: snake[0].y, type: 'common', spawnTime: performance.now() };
        updateGame();
    });
    await page.waitForTimeout(200);
    check('C1 host-mapped: first_food fires once',
          hits.filter(k => k === 'first_food').length === 1,
          'got: ' + hits.join(', '));

    // A real death: drive the snake into the wall. Classic WRAPS — wall death needs
    // walled mode (wrap:false), where the out-of-bounds head is fatal.
    await page.evaluate(() => {
        stopGameLoop();
        gameMode = 'walled';
        resetGame(); startGame(); stopGameLoop();
        snake = [{ x: PLAY_WIDTH - TILE_SIZE, y: 10 * TILE_SIZE }];
        dx = TILE_SIZE; dy = 0; nextDirection = null; dirQueue = [];
        updateGame(); // head moves out of bounds -> wall death
    });
    await page.waitForTimeout(200);
    const gameState1 = await page.evaluate(() => ({ state: gameState, cause: lastDeathCause }));
    check('C1 host-mapped: the wall-death fixture actually died',
          gameState1.state === 'gameover' && gameState1.cause === 'Hit the wall!',
          JSON.stringify(gameState1));
    check('C1 host-mapped: exactly one die_wall, zero other buckets',
          hits.filter(k => k === 'die_wall').length === 1 &&
          hits.filter(k => k && k.startsWith('die_')).length === 1,
          'got: ' + hits.join(', '));

    // Second run in the same load: no duplicate start / first_food / bucket. The
    // second death is the SAME cause (die_wall) — the Set must suppress the repeat.
    await page.evaluate(() => {
        gameMode = 'walled';
        resetGame(); startGame(); stopGameLoop();
        food = { x: snake[0].x + TILE_SIZE, y: snake[0].y, type: 'common', spawnTime: performance.now() };
        updateGame(); // first_food already fired this load — must NOT refire
        snake = [{ x: PLAY_WIDTH - TILE_SIZE, y: 12 * TILE_SIZE }];
        dx = TILE_SIZE; dy = 0; nextDirection = null; dirQueue = [];
        updateGame(); // same wall death again
    });
    await page.waitForTimeout(200);
    check('C1 host-mapped: second run adds no duplicate start/first_food/bucket',
          hits.filter(k => k === 'start').length === 1 &&
          hits.filter(k => k === 'first_food').length === 1 &&
          hits.filter(k => k && k.startsWith('die_')).length === 1,
          'got: ' + hits.join(', '));

    // Double gameOver(): the Set holds — no ADDITIONAL finish, no additional bucket
    // (keys are load-scoped by design: one fire per page load, not per run).
    const beforeFinish = hits.filter(k => k === 'finish').length;
    await page.evaluate(() => { gameOver(); gameOver(); });
    await page.waitForTimeout(200);
    check('C1 host-mapped: double gameOver() adds no second finish',
          hits.filter(k => k === 'finish').length === beforeFinish,
          'got: ' + hits.join(', '));

    // Host gate units (the gate the funnel tests are blind to — itch must count).
    const gate = await page.evaluate(() => ({
        prod: isCountedHost('j3k0.github.io'),
        itch: isCountedHost('html.itch.zone') && isCountedHost('itch.zone'),
        ng: isCountedHost('www.newgrounds.com'),
        localhost: isCountedHost('localhost'),
        empty: isCountedHost(''),
        evil: isCountedHost('evil.com'),
        chProd: channelForHost('j3k0.github.io'),
        chItch: channelForHost('foo.itch.zone'),
        chNg: channelForHost('www.newgrounds.com'),
        chOff: channelForHost('localhost'),
        setHas: _firedFunnel instanceof Set
    }));
    check('C1 gate: isCountedHost accepts the allow-list (prod, itch, newgrounds)',
          gate.prod && gate.itch && gate.ng,
          JSON.stringify(gate));
    check('C1 gate: isCountedHost rejects localhost, empty, off-list hosts',
          !gate.localhost && !gate.empty && !gate.evil,
          JSON.stringify(gate));
    check('C1 gate: channelForHost maps github/itch/newgrounds and null off-list',
          gate.chProd === 'ch_github' && gate.chItch === 'ch_itch' &&
          gate.chNg === 'ch_other' && gate.chOff === null,
          JSON.stringify(gate));

    // touch/keys input-class fixtures.
    {
        const inputKeys = await page.evaluate(() => {
            const before = new Set(_firedFunnel);
            gameMode = 'classic';
            resetGame(); startGame(); stopGameLoop();
            // A synthetic keydown (the D-pad's mechanism) must NOT count as keys.
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
            return {
                keysFired: _firedFunnel.has('keys') && !before.has('keys'),
                touchFired: _firedFunnel.has('touch') && !before.has('touch')
            };
        });
        check('C1 input: a synthetic (D-pad) keydown does not fire keys',
              !inputKeys.keysFired, JSON.stringify(inputKeys));
    }

    await browser.close();
    server.close();
}

// ---------------------------------------------------------------------------
// Fixture B2: a FRESH host-mapped load for the rescue fixtures — keys already fired
// on a load cannot be distinguished from suppressed re-fires, so the shield-death
// sequence needs its own page (fresh _firedFunnel Set).
// ---------------------------------------------------------------------------
async function hostMappedPage() {
    const server = http.createServer((req, res) => {
        if (req.url === '/snake.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(readFileSync(htmlPath));
        } else { res.writeHead(404); res.end(); }
    });
    await new Promise(r => server.listen(8099, '127.0.0.1', r));
    const browser = await chromium.launch({
        args: ['--host-resolver-rules=MAP j3k0.github.io 127.0.0.1']
    });
    const page = await browser.newPage();
    const hits = [];
    await page.route('https://' + ABACUS + '/**', route => {
        hits.push(route.request().url().split('/hit/j3k0.github.io/')[1]);
        return route.fulfill({ status: 200, body: '' });
    });
    await page.goto('http://j3k0.github.io:8099/snake.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    return { server, browser, page, hits };
}
{
    const { server, browser, page, hits } = await hostMappedPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));

    // Rescue: shield saves an obstacle hit (classic), then a TRUE wall death (walled —
    // classic wraps) ends the run. Exactly one bucket, the true cause; and the save
    // itself fired nothing.
    const rescue2 = await page.evaluate(() => {
        const fired = (k) => _firedFunnel.has(k);
        gameMode = 'classic';
        resetGame(); startGame(); stopGameLoop();
        shieldActive = true;
        obstacles = [{ x: snake[0].x + TILE_SIZE, y: snake[0].y }];
        dx = TILE_SIZE; dy = 0; nextDirection = null; dirQueue = [];
        updateGame(); // obstacle hit -> shield save, no gameOver
        const saved = gameState === 'playing' && !shieldActive;
        const anyBucketAfterSave = ['die_wall','die_self','die_obs','die_rival','die_hazard','die_time','die_other'].some(fired);
        // Now a true death into the wall.
        gameMode = 'walled';
        resetGame(); startGame(); stopGameLoop();
        snake = [{ x: PLAY_WIDTH - TILE_SIZE, y: 12 * TILE_SIZE }];
        dx = TILE_SIZE; dy = 0; nextDirection = null; dirQueue = [];
        updateGame();
        return { saved, anyBucketAfterSave, died: gameState === 'gameover',
                 buckets: ['die_wall','die_self','die_obs','die_rival','die_hazard','die_time','die_other'].filter(fired),
                 cause: lastDeathCause, finish: fired('finish') };
    });
    check('C1 rescue: the shield actually saved the obstacle hit (consumed, run alive)',
          rescue2.saved, JSON.stringify(rescue2));
    check('C1 rescue: a shield save fires no death bucket',
          !rescue2.anyBucketAfterSave, JSON.stringify(rescue2));
    check('C1 rescue: shield save then true death — exactly one bucket, the true cause, and a finish',
          rescue2.died && rescue2.buckets.length === 1 &&
          rescue2.buckets[0] === 'die_wall' && rescue2.cause === 'Hit the wall!' &&
          rescue2.finish && hits.filter(k => k === 'finish').length === 1,
          JSON.stringify(rescue2) + ' hits=' + hits.join(','));

    check('C1 rescue: no page errors', errors.length === 0, errors.join('; '));

    await browser.close();
    server.close();
}

// ---------------------------------------------------------------------------
// Fixture B3: shield-saved run that QUITS — its own fresh load, because the fixture
// asserts ABSENCE of keys that the previous fixture legitimately fired.
// ---------------------------------------------------------------------------
{
    const { server, browser, page, hits } = await hostMappedPage();
    const rescue3 = await page.evaluate(() => {
        gameMode = 'classic';
        resetGame(); startGame(); stopGameLoop();
        shieldActive = true;
        obstacles = [{ x: snake[0].x + TILE_SIZE, y: snake[0].y }];
        dx = TILE_SIZE; dy = 0; nextDirection = null; dirQueue = [];
        updateGame(); // shield save
        const saved = gameState === 'playing' && !shieldActive;
        resetGame(); // quit to idle
        return { saved,
                 buckets: ['die_wall','die_self','die_obs','die_rival','die_hazard','die_time','die_other'].filter(k => _firedFunnel.has(k)),
                 finishFired: _firedFunnel.has('finish') };
    });
    check('C1 rescue: a shield-saved run that quits fires zero death keys and no finish',
          rescue3.saved && rescue3.buckets.length === 0 && !rescue3.finishFired,
          JSON.stringify(rescue3) + ' hits=' + hits.join(','));
    await browser.close();
    server.close();
}

// ---------------------------------------------------------------------------
// Fixture C: host-mapped origin + touchscreen — a real tap fires `touch`, never
// `keys`; and the snake_nocount opt-out suppresses everything.
// ---------------------------------------------------------------------------
{
    const server = http.createServer((req, res) => {
        if (req.url === '/snake.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(readFileSync(htmlPath));
        } else { res.writeHead(404); res.end(); }
    });
    await new Promise(r => server.listen(8099, '127.0.0.1', r));

    const browser = await chromium.launch({
        args: ['--host-resolver-rules=MAP j3k0.github.io 127.0.0.1']
    });
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 440, height: 700 } });
    const page = await ctx.newPage();
    const hits = [];
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('https://' + ABACUS + '/**', route => {
        hits.push(route.request().url().split('/hit/j3k0.github.io/')[1]);
        return route.fulfill({ status: 200, body: '' });
    });

    // First: the touch fixture.
    await page.goto('http://j3k0.github.io:8099/snake.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.evaluate(() => { localStorage.setItem('snake_has_played', '1'); location.reload(); });
    await page.waitForTimeout(700); // reload; init keys refire (new load)
    hits.length = 0;
    const box = await page.locator('#gameCanvas').boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height - 100);
    await page.waitForTimeout(400);
    const touchState = await page.evaluate(() => ({ state: gameState, touch: _firedFunnel.has('touch'), keys: _firedFunnel.has('keys') }));
    check('C1 touch: a real tap on the canvas fires touch (once) and never keys',
          touchState.touch && !touchState.keys, JSON.stringify(touchState));

    // Then the nocount opt-out, in a fresh context: nothing at all may send.
    await ctx.close();
    const ctx2 = await browser.newContext({ hasTouch: true });
    const page2 = await ctx2.newPage();
    await page2.route('https://' + ABACUS + '/**', route => {
        hits.push(route.request().url().split('/hit/j3k0.github.io/')[1]);
        return route.fulfill({ status: 200, body: '' });
    });
    await page2.goto('http://j3k0.github.io:8099/snake.html', { waitUntil: 'domcontentloaded' });
    await page2.evaluate(() => localStorage.setItem('snake_nocount', '1'));
    await page2.reload({ waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(500);
    hits.length = 0;
    await page2.evaluate(() => {
        welcomeOverlay = false;
        gameMode = 'classic';
        resetGame(); startGame(); stopGameLoop();
        gameOver();
    });
    await page2.waitForTimeout(300);
    check('C1 nocount: snake_nocount=1 suppresses every beacon (init + game events)',
          hits.length === 0, 'got: ' + hits.join(', '));
    const errors2 = [];
    page2.on('pageerror', e => errors2.push(String(e)));
    check('C1 nocount: no page errors', errors.length === 0 && errors2.length === 0,
          errors.concat(errors2).join('; '));
    await browser.close();
    server.close();
}

// ---------------------------------------------------------------------------
// Fixture D: F2 — the board fits the phone. Scale-only: the whole board (its
// border box) inside the visual viewport, computed from getBoundingClientRect,
// never from CSS. Four viewports × four states, plus the two mid-session cases.
// ---------------------------------------------------------------------------
const BOARD_STATES = ['welcome', 'idle', 'playing', 'gameover'];
async function enterState(page, st) {
    await page.evaluate((st) => {
        if (st === 'idle') { welcomeOverlay = false; gameState = 'idle'; resetGame(); }
        if (st === 'welcome') { welcomeOverlay = true; gameState = 'idle'; resetGame(); }
        if (st === 'playing') { gameMode = 'classic'; resetGame(); startGame(); stopGameLoop(); }
        if (st === 'gameover') { gameMode = 'classic'; resetGame(); startGame(); stopGameLoop(); gameOver(); }
        updateMenuFooter(); drawGame(1);
    }, st);
    await page.waitForTimeout(150);
}
async function boardRect(page) {
    return page.evaluate(() => {
        const c = document.querySelector('#gameCanvas').getBoundingClientRect();
        const dEl = document.getElementById('dpad');
        const dVisible = getComputedStyle(dEl).display !== 'none';
        const d = dVisible ? dEl.getBoundingClientRect() : null;
        return {
            top: c.top, bottom: c.bottom, h: c.height, innerH: window.innerHeight,
            compact: document.body.classList.contains('compact'),
            h1: getComputedStyle(document.querySelector('h1')).display !== 'none',
            scoreLine: getComputedStyle(document.getElementById('scoreLine')).display !== 'none',
            highScore: getComputedStyle(document.getElementById('highScore')).display !== 'none',
            dpad: d ? { top: d.top, bottom: d.bottom } : null
        };
    });
}
{
    const browser = await chromium.launch();
    for (const [w, h] of [[320, 568], [360, 640], [390, 844]]) {
        const ctx = await browser.newContext({ hasTouch: true, viewport: { width: w, height: h } });
        const page = await ctx.newPage();
        const errors = []; page.on('pageerror', e => errors.push(String(e)));
        await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);
        for (const st of BOARD_STATES) {
            await enterState(page, st);
            const r = await boardRect(page);
            const fits = r.top >= 0 && r.bottom <= r.innerH;
            check(`C2 ${w}x${h} [${st}]: whole board inside the visual viewport`, fits,
                  `top=${r.top.toFixed(1)} bottom=${r.bottom.toFixed(1)} innerH=${r.innerH}`);
        }
        const idle = await (async () => { await enterState(page, 'idle'); return boardRect(page); })();
        if (h < 700) {
            check(`C2 ${w}x${h}: compact fires on a short touch viewport (h1/score/high hidden)`,
                  idle.compact && !idle.h1 && !idle.scoreLine && !idle.highScore,
                  JSON.stringify(idle));
        } else {
            check(`C2 ${w}x${h}: the common phone keeps today's board (>=500px, h1 and score visible, no compact)`,
                  !idle.compact && idle.h1 && idle.scoreLine && idle.highScore && idle.h >= 500,
                  `h=${idle.h.toFixed(0)} compact=${idle.compact} h1=${idle.h1} score=${idle.scoreLine}`);
        }
        check(`C2 ${w}x${h}: no page errors`, errors.length === 0, errors.join('; '));
        await ctx.close();
    }
    // Desktop, fine pointer: no compact, title/score visible, board unchanged (600px box).
    for (const [w, h] of [[1366, 768], [1280, 650]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h } });
        const page = await ctx.newPage();
        await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);
        for (const st of ['idle', 'playing']) {
            await enterState(page, st);
            const r = await boardRect(page);
            const fits = r.top >= 0 && r.bottom <= r.innerH;
            check(`C2 ${w}x${h} fine-pointer [${st}]: board fits, no compact, h1/score visible`,
                  fits && !r.compact && r.h1 && r.scoreLine && r.highScore,
                  `top=${r.top.toFixed(1)} bottom=${r.bottom.toFixed(1)} compact=${r.compact} h1=${r.h1}`);
        }
        if (w === 1366) {
            const r = await boardRect(page);
            check('C2 1366x768: desktop board unchanged (600px style box + border)',
                  Math.abs(r.h - 604) <= 6, 'h=' + r.h.toFixed(1));
        }
        await ctx.close();
    }
    // Mid-session: URL-bar collapse mid-play, then rotation mid-play.
    {
        const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 320, height: 568 } });
        const page = await ctx.newPage();
        await page.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);
        await enterState(page, 'playing');
        await page.setViewportSize({ width: 320, height: 488 });
        await page.waitForTimeout(300);
        let r = await boardRect(page);
        check('C2 mid-session: URL-bar collapse (-80px) mid-play keeps the board visible',
              r.top >= 0 && r.bottom <= r.innerH,
              `top=${r.top.toFixed(1)} bottom=${r.bottom.toFixed(1)} innerH=${r.innerH}`);
        await page.setViewportSize({ width: 568, height: 320 });
        await page.waitForTimeout(300);
        r = await boardRect(page);
        check('C2 mid-session: rotation mid-play (568x320) keeps the board visible',
              r.top >= 0 && r.bottom <= r.innerH,
              `top=${r.top.toFixed(1)} bottom=${r.bottom.toFixed(1)} innerH=${r.innerH}`);
        check('C2 mid-session: rotation keeps the D-pad reachable (top edge on-screen)',
              r.dpad && r.dpad.top >= 0, JSON.stringify(r.dpad));
        await ctx.close();
    }
    await browser.close();
}

// ---------------------------------------------------------------------------
console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
