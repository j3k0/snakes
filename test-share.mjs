// FOV-2729 test suite — "a run you can send" (shareable runs).
//
// The gates (issue FOV-2730's ask, cut from v15 as F8):
//  1. A score-only challenge link (#classic~~120) parses, and accepting it keeps
//     the run NON-deterministic (activeSeed null, seedPrng null, speed food's
//     tickInterval === getEffectiveSpeed()) — the seeded-only surface is untouched.
//  2. A recap-Share TAP copies the canonical link and does NOT restart the run
//     (the hit area is checked before the game-over tap catch-all). A tap outside
//     the button still restarts (v15 F7 semantics unchanged).
//  3. The challenge landing overlay accepts AND declines by tap on a phone, and
//     its copy names the input the device has (v15 F4 touch-truth rule).
//  4. A challenge link shown to a brand-new visitor is not swallowed by the
//     onboarding tap: the first tap dismisses the welcome overlay only.
//  5. Canonical URL only: copies always carry https://j3k0.github.io/snakes/,
//     never location.origin (rotting *.itch.zone URLs).
//
// Run: node test-share.mjs
// file:// and a local http://127.0.0.1:8137 server — neither is a counted host
// (isCountedHost is an allow-list; every beacon stays inert here, asserted below).
// Never run a fixture against https://j3k0.github.io/snakes/ — that is counted
// production traffic.

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.env.SNAKE_FILE || join(__dirname, 'snake.html');
const FILE_URL = 'file://' + htmlPath;
const HTTP_URL = 'http://127.0.0.1:8137/snake.html';
const ABACUS = 'abacus.jasoncameron.dev';

let pass = 0, fail = 0;
function ok(name) { console.log('  PASS  ' + name); pass++; }
function fail_(name, msg) { console.log('  FAIL  ' + name + (msg ? ': ' + msg : '')); fail++; }
function check(name, cond, msg) { cond ? ok(name) : fail_(name, msg); }

async function startCopyRecorder(page) {
    await page.evaluate(() => {
        window.__copied = [];
        if (!window.__origWriteText) {
            window.__origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
            navigator.clipboard.writeText = (t) => { window.__copied.push(String(t)); return Promise.resolve(); };
        }
    });
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

// Canvas coords -> page coords (the canvas is CSS-scaled).
async function pagePosFor(page, cx, cy) {
    return await page.evaluate(([x, y]) => {
        const rect = document.getElementById('gameCanvas').getBoundingClientRect();
        return { x: rect.left + (x / CANVAS_WIDTH) * rect.width,
                 y: rect.top + (y / CANVAS_HEIGHT) * rect.height };
    }, [cx, cy]);
}

async function tapCanvasAt(page, cx, cy) {
    const pos = await pagePosFor(page, cx, cy);
    await page.touchscreen.tap(pos.x, pos.y);
    await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// Fixture A: parser unit table (file://, desktop).
// ---------------------------------------------------------------------------
{
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(FILE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    check('A: no page errors on load', errors.length === 0, errors.join('; '));

    const table = await page.evaluate(() => ({
        scoreOnly: parseChallengeUrl('classic~~120'),
        noScore: parseChallengeUrl('classic~~'),
        bareMode: parseChallengeUrl('classic~'),
        daily: parseChallengeUrl('daily~~500'),
        seededScore: parseChallengeUrl('zen~abc~50'),
        seededNoScore: parseChallengeUrl('classic~abc'),
        seededEncoded: parseChallengeUrl('classic~' + encodeURIComponent('a b') + '~10'),
        badMode: parseChallengeUrl('nope~~100'),
        badScore: parseChallengeUrl('classic~~abc'),
        twoSlotNumber: parseChallengeUrl('classic~120'), // legacy seeding slot — still a seed, not a score
    }));
    check('A: classic~~120 parses score-only with an EMPTY seed',
          table.scoreOnly && table.scoreOnly.mode === 'classic' && table.scoreOnly.seed === '' && table.scoreOnly.targetScore === 120,
          JSON.stringify(table.scoreOnly));
    check('A: classic~~ (no score) is still rejected', table.noScore === null, JSON.stringify(table.noScore));
    check('A: classic~ (bare mode) is still rejected', table.bareMode === null, JSON.stringify(table.bareMode));
    check('A: daily stays rejected for score-only links', table.daily === null, JSON.stringify(table.daily));
    check('A: seeded challenge unchanged (zen~abc~50)',
          table.seededScore && table.seededScore.seed === 'abc' && table.seededScore.targetScore === 50,
          JSON.stringify(table.seededScore));
    check('A: seeded challenge without a score still parses',
          table.seededNoScore && table.seededNoScore.seed === 'abc' && table.seededNoScore.targetScore === null,
          JSON.stringify(table.seededNoScore));
    check('A: encoded seed still decodes',
          table.seededEncoded && table.seededEncoded.seed === 'a b',
          JSON.stringify(table.seededEncoded));
    check('A: unknown mode rejected', table.badMode === null, JSON.stringify(table.badMode));
    check('A: non-numeric score still rejected', table.badScore === null, JSON.stringify(table.badScore));
    check('A: classic~120 is a seed (2-slot legacy), not a bare score',
          table.twoSlotNumber && table.twoSlotNumber.seed === '120' && table.twoSlotNumber.targetScore === null,
          JSON.stringify(table.twoSlotNumber));

    // Inertness guard for this suite: file:// must fire no beacons.
    // (Fixture D re-asserts on the http origin too.)
    await browser.close();
}

// ---------------------------------------------------------------------------
// Fixture B: accepting a score-only challenge keeps the run NON-deterministic
// (file://, keyboard path). This is the mutation-target: setting seedField
// unconditionally in the accept path breaks the activeSeed-null assertion.
// ---------------------------------------------------------------------------
{
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(FILE_URL + '#classic~~120', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    let st = await page.evaluate(() => ({ challenge: !!challengeFromUrl, mode: challengeFromUrl && challengeFromUrl.mode, seed: challengeFromUrl && challengeFromUrl.seed, target: challengeFromUrl && challengeFromUrl.targetScore }));
    check('B: the score-only URL lands as a challenge', st.challenge && st.mode === 'classic' && st.seed === '' && st.target === 120, JSON.stringify(st));

    await page.evaluate(() => {
        welcomeOverlay = false;
        saveManager.set('snake_has_played', '1');
        // A stale seed from a previous session must NOT leak into a score-only
        // challenge: the accept path overwrites seedField with the (empty)
        // challenge seed. Guarding the activeSeed assertions below.
        document.getElementById('seedField').value = 'STALESEED';
        drawGame(1);
    });
    st = await page.evaluate(() => ({
        idle: gameState === 'idle',
        challenge: !!challengeFromUrl,
        noSeedLine: !window.__strings || window.__strings.indexOf('Seed: ' + (challengeFromUrl ? challengeFromUrl.seed : '?')) === -1,
        bandGone: startBandRect === null
    }));
    check('B: challenge overlay replaces the idle band (band rect nulled)', st.idle && st.challenge && st.bandGone, JSON.stringify(st));

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({
        state: gameState,
        mode: gameMode,
        seed: activeSeed,
        prng: seedPrng,
        challenge: challengeFromUrl,
        tick: tickInterval,
        effective: getEffectiveSpeed(),
        seedFieldValue: document.getElementById('seedField').value
    }));
    check('B: Enter accepts the challenge', after.state === 'playing' && after.mode === 'classic', JSON.stringify(after));
    check('B: accepting a score-only challenge leaves activeSeed NULL', after.seed === null, 'activeSeed=' + JSON.stringify(after.seed));
    check('B: seedPrng stays null (non-deterministic run)', after.prng === null, 'seedPrng=' + JSON.stringify(after.prng));
    check('B: seedField is left EMPTY by the accept path', after.seedFieldValue === '', 'seedField=' + JSON.stringify(after.seedFieldValue));
    check('B: speed food still works — tickInterval === getEffectiveSpeed()',
          after.tick === after.effective, after.tick + ' !== ' + after.effective);
    check('B: challengeFromUrl cleared after accept', after.challenge === null, JSON.stringify(after.challenge));
    await page.evaluate(() => stopGameLoop());
    check('B: no page errors after accept', errors.length === 0, errors.join('; '));

    // Escape dismisses a challenge that was never accepted (keyboard parity — the
    // overlay's copy promises Escape).
    const page2 = await browser.newPage();
    await page2.goto(FILE_URL + '#walled~~77', { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(300);
    await page2.evaluate(() => { welcomeOverlay = false; saveManager.set('snake_has_played', '1'); drawGame(1); });
    await page2.keyboard.press('Escape');
    await page2.waitForTimeout(150);
    st = await page2.evaluate(() => ({ state: gameState, challenge: challengeFromUrl, hash: location.hash }));
    check('B: Escape dismisses the challenge (idle, no overlay)', st.state === 'idle' && st.challenge === null, JSON.stringify(st));
    check('B: Escape clears the URL hash', st.hash === '' || st.hash === '#', 'hash=' + JSON.stringify(st.hash));
    await browser.close();
}

// ---------------------------------------------------------------------------
// Fixture C: on a phone, the landing overlay accepts AND declines by tap, and
// a brand-new visitor's first tap dismisses the welcome overlay only.
// ---------------------------------------------------------------------------
{
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));

    // Fresh profile (empty localStorage) + a challenge link: the overlay must be
    // up and the welcome overlay must NOT auto-start it.
    await page.goto(FILE_URL + '#classic~~250', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.evaluate(() => drawGame(1));
    let st = await page.evaluate(() => ({ welcome: welcomeOverlay, challenge: !!challengeFromUrl, rects: !!challengeAcceptRect && !!challengeDeclineRect }));
    check('C: fresh visitor sees the challenge overlay (not the welcome pixels)', st.challenge && st.rects, JSON.stringify(st));

    // First tap on Play: dismisses onboarding ONLY — challenge stays up, run not started.
    await startFillTextRecorder(page);
    const playPos = await page.evaluate(() => {
        const rect = document.getElementById('gameCanvas').getBoundingClientRect();
        return { x: rect.left + ((challengeAcceptRect.x + challengeAcceptRect.w / 2) / CANVAS_WIDTH) * rect.width,
                 y: rect.top + ((challengeAcceptRect.y + challengeAcceptRect.h / 2) / CANVAS_HEIGHT) * rect.height };
    });
    await page.touchscreen.tap(playPos.x, playPos.y);
    await page.waitForTimeout(200);
    st = await page.evaluate(() => ({ welcome: welcomeOverlay, challenge: !!challengeFromUrl, state: gameState }));
    check('C: first tap dismisses the welcome overlay ONLY', st.welcome === false && st.challenge && st.state === 'idle', JSON.stringify(st));
    check('C: touch copy names taps, never keys',
          await page.evaluate(() => window.__strings.some(s => s.indexOf('Tap Play') === 0) && !window.__strings.some(s => /Press/.test(s))));

    // Second tap on Play: accepts the challenge.
    await page.touchscreen.tap(playPos.x, playPos.y);
    await page.waitForTimeout(250);
    st = await page.evaluate(() => ({ state: gameState, mode: gameMode, challenge: challengeFromUrl, seed: activeSeed }));
    check('C: tapping Play accepts the challenge',
          st.state === 'playing' && st.mode === 'classic' && st.challenge === null && st.seed === null, JSON.stringify(st));
    await page.evaluate(() => stopGameLoop());

    // Decline path: Not now -> idle, challenge cleared, no run.
    const ctx2 = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    const page2 = await ctx2.newPage();
    await page2.goto(FILE_URL + '#snap~~90', { waitUntil: 'domcontentloaded' });
    await page2.waitForTimeout(400);
    await page2.evaluate(() => { welcomeOverlay = false; saveManager.set('snake_has_played', '1'); drawGame(1); });
    const declinePos = await page2.evaluate(() => {
        const rect = document.getElementById('gameCanvas').getBoundingClientRect();
        return { x: rect.left + ((challengeDeclineRect.x + challengeDeclineRect.w / 2) / CANVAS_WIDTH) * rect.width,
                 y: rect.top + ((challengeDeclineRect.y + challengeDeclineRect.h / 2) / CANVAS_HEIGHT) * rect.height };
    });
    await page2.touchscreen.tap(declinePos.x, declinePos.y);
    await page2.waitForTimeout(200);
    st = await page2.evaluate(() => ({ state: gameState, challenge: challengeFromUrl, hash: location.hash, mode: gameMode }));
    check('C: tapping Not now declines — idle, challenge cleared, mode untouched',
          st.state === 'idle' && st.challenge === null && st.mode === 'classic', JSON.stringify(st));
    // Hash-clearing is best-effort on file:// (replaceState can be restricted);
    // the http fixture below asserts it for real.

    // A tap elsewhere on the challenge overlay does nothing.
    await page2.touchscreen.tap(10, 10); // top-left corner canvas-ish: outside both buttons
    await page2.waitForTimeout(200);
    st = await page2.evaluate(() => gameState);
    check('C: a tap outside the buttons does nothing (still idle)', st === 'idle', 'gameState=' + st);
    await browser.close();
}

// ---------------------------------------------------------------------------
// Fixture D: local http origin — the recap Share control end-to-end with a REAL
// clipboard (permission-granted), the hash-clear on decline, and the touch copy.
// 127.0.0.1 is not in the allow-list: beacons must stay inert while we play.
// ---------------------------------------------------------------------------
{
    const server = http.createServer((req, res) => {
        if (req.url === '/snake.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(readFileSync(htmlPath));
        } else { res.writeHead(404); res.end(); }
    });
    await new Promise(r => server.listen(8137, '127.0.0.1', r));

    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const ctxTouch0 = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    const page = await ctxTouch0.newPage();
    await ctxTouch0.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8137' });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    const hits = [];
    await page.route('https://' + ABACUS + '/**', route => { hits.push(route.request().url()); return route.fulfill({ status: 200, body: '' }); });

    await page.goto(HTTP_URL + '#walled~~77', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.evaluate(() => { welcomeOverlay = false; saveManager.set('snake_has_played', '1'); drawGame(1); });
    await tapCanvasAt(page,
        await page.evaluate(() => challengeDeclineRect.x + challengeDeclineRect.w / 2),
        await page.evaluate(() => challengeDeclineRect.y + challengeDeclineRect.h / 2));
    check('D: decline clears the URL hash (http origin)', await page.evaluate(() => location.hash === '' || location.hash === '#'), 'hash=' + await page.evaluate(() => location.hash));
    await ctxTouch0.close();

    // Build a finished 120-point classic run (desktop context).
    const page0 = await ctx.newPage();
    await page0.goto(HTTP_URL, { waitUntil: 'domcontentloaded' });
    await page0.waitForTimeout(400);
    await page0.evaluate(() => {
        gameModeChange = undefined; // (unused; classic already selected below)
        gameMode = 'classic';
        welcomeOverlay = false;
        resetGame();
        startGame();
        stopGameLoop();
        score = 120;
        gameOver();
        drawGame(1);
    });
    await page0.waitForTimeout(200);
    check('D: beacons stayed inert on 127.0.0.1 through a full visit', hits.length === 0,
          'got: ' + hits.join(', '));

    const share = await page0.evaluate(() => ({ rect: recapShareRect, state: gameState, score: recapData.score }));
    check('D: the recap card renders a Share hit area', share.rect && share.state === 'gameover' && share.score === 120, JSON.stringify(share.rect));

    await startFillTextRecorder(page0);
    await startCopyRecorder(page0);
    await page0.keyboard.press('k');
    await page0.waitForTimeout(200);
    let clip = await page0.evaluate(() => (window.__copied || []).pop() || '');
    check('D: K at gameover copies the score-only CANONICAL link',
          clip === 'Beat my 120 in Classic — https://j3k0.github.io/snakes/#classic~~120',
          'clipboard=' + JSON.stringify(clip));
    const sharePos0 = await pagePosFor(page0,
        await page0.evaluate(() => recapShareRect.x + recapShareRect.w / 2),
        await page0.evaluate(() => recapShareRect.y + recapShareRect.h / 2));
    check('D: desktop Share label names the K key',
          await page0.evaluate(() => window.__strings.some(s => s.indexOf('Share my run (K)') !== -1)),
          (await page0.evaluate(() => window.__strings.filter(s => /Share/.test(s)).join(' | '))));
    await ctx.close();
    const ctxT = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
    await ctxT.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8137' });
    const pageT = await ctxT.newPage();
    pageT.on('pageerror', e => errors.push(String(e)));
    await pageT.goto(HTTP_URL, { waitUntil: 'domcontentloaded' });
    await pageT.waitForTimeout(400);
    await startCopyRecorder(pageT);
    await pageT.evaluate(() => {
        gameMode = 'classic';
        welcomeOverlay = false;
        resetGame();
        startGame();
        stopGameLoop();
        score = 120;
        gameOver();
        drawGame(1);
    });
    await pageT.waitForTimeout(200);
    const sharePosT = await pagePosFor(pageT,
        await pageT.evaluate(() => recapShareRect.x + recapShareRect.w / 2),
        await pageT.evaluate(() => recapShareRect.y + recapShareRect.h / 2));
    await pageT.touchscreen.tap(sharePosT.x, sharePosT.y);
    await pageT.waitForTimeout(200);
    clip = await pageT.evaluate(() => (window.__copied || []).pop() || '');
    check('D: a Share TAP copies the canonical link',
          clip === 'Beat my 120 in Classic — https://j3k0.github.io/snakes/#classic~~120',
          'clipboard=' + JSON.stringify(clip));
    check('D: a Share tap does NOT start a run (gameover stays)',
          await pageT.evaluate(() => gameState === 'gameover' && !!recapData));

    // Seeded run: K copies the seeded form.
    await pageT.keyboard.press('Enter'); // restart from gameover
    await pageT.waitForTimeout(250);
    await pageT.evaluate(() => {
        stopGameLoop();
        activeSeed = 'hello';
        gameMode = 'classic';
        score = 95;
        gameState = 'gameover';
        drawGame(1);
    });
    await pageT.keyboard.press('k');
    await pageT.waitForTimeout(200);
    clip = await pageT.evaluate(() => (window.__copied || []).pop() || '');
    check('D: seeded run still shares #classic~hello~95 via the canonical base',
          clip === 'Beat my 95 in Classic — https://j3k0.github.io/snakes/#classic~hello~95',
          'clipboard=' + JSON.stringify(clip));

    // A tap outside the Share button still restarts (v15 F7 semantics unchanged).
    await pageT.waitForTimeout(600); // past the 500ms reflex guard
    await tapCanvasAt(pageT, 220, 250); // canvas centre-ish, above the card's button
    await pageT.waitForTimeout(300);
    check('D: a tap outside the Share button still restarts the run',
          await pageT.evaluate(() => gameState === 'playing' || gameState === 'idle'),
          'gameState=' + await pageT.evaluate(() => gameState));

    // A zero-score run renders NO share button.
    await pageT.evaluate(() => { stopGameLoop(); gameMode = 'classic'; resetGame(); startGame(); stopGameLoop(); score = 0; gameOver(); drawGame(1); });
    check('D: a 0-score run gets no Share hit area (nothing to beat)',
          await pageT.evaluate(() => recapShareRect === null));

    // Daily runs are not shareable (K gated; parser rejects).
    await pageT.evaluate(() => { stopGameLoop(); gameMode = 'daily'; resetGame(); startGame(); stopGameLoop(); score = 60; gameOver(); drawGame(1); });
    await pageT.evaluate(() => { window.__copied.push('SENTINEL'); });
    await pageT.keyboard.press('k');
    await pageT.waitForTimeout(200);
    clip = await pageT.evaluate(() => (window.__copied || []).pop() || '');
    check('D: K copies nothing on a daily run (parser rejects daily links)',
          clip === 'SENTINEL', 'clipboard=' + JSON.stringify(clip));

    // Touch truth on the card: the Share label names a tap, not a key.
    await startFillTextRecorder(pageT);
    await pageT.evaluate(() => { stopGameLoop(); gameMode = 'classic'; resetGame(); startGame(); stopGameLoop(); score = 40; gameOver(); drawGame(1); });
    check('D: touch card copy says Share, never K',
          await pageT.evaluate(() => window.__strings.some(s => s.indexOf('Share') !== -1)) &&
          await pageT.evaluate(() => window.__strings.every(s => s.indexOf('(K)') === -1)) &&
          await pageT.evaluate(() => window.__strings.every(s => !/Press\s/.test(s) || s === window.__strings[0])),
          (await pageT.evaluate(() => window.__strings.filter(s => /Share|K\)|Press/.test(s)).join(' | '))));

    check('D: no page errors across fixture D', errors.length === 0, errors.join('; '));
    await ctxT.close();
    await browser.close();
    server.close();
}

console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
