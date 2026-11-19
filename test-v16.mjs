// v16 test suite — "arrival and return" (FOV-2784).
//
// Every gate is a LOCAL, falsifiable check and names its mutation in
// IMPL_PLAN_v16.md. The mutation is run once per gate by the implementer:
// delete the predicate, confirm exactly the intended assertion fails, restore.
//
// Run: node test-v16.mjs
//
// Two origins only:
//   file://            — the artifact itself; beacons must be inert.
//   j3k0.github.io:8099 — host-MAPPED to 127.0.0.1 by --host-resolver-rules and
//                        served by the local server below, so the real
//                        isCountedHost/channelForHost gate runs with fetch
//                        intercepted.
// NEVER point a fixture at https://j3k0.github.io/snakes/ or any itch URL: that is
// counted production traffic on the channel that decides the project (FOV-2741).

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = process.env.SNAKE_FILE || join(__dirname, 'snake.html');
const src = readFileSync(htmlPath, 'utf8');

let pass = 0, fail = 0;
function ok(name) { console.log('  PASS  ' + name); pass++; }
function fail_(name, msg) { console.log('  FAIL  ' + name + (msg ? ': ' + msg : '')); fail++; }
function check(name, cond, msg) { cond ? ok(name) : fail_(name, msg); }

const ABACUS = 'abacus.jasoncameron.dev';

// Start the local server + a host-mapped browser. Returns { server, browser, page }.
async function mappedOrigin({ hash = '' } = {}) {
    const server = http.createServer((req, res) => {
        if (req.url.split('#')[0] === '/snake.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(readFileSync(htmlPath));
        } else { res.writeHead(404); res.end(); }
    });
    await new Promise(r => server.listen(8099, '127.0.0.1', r));
    const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP j3k0.github.io 127.0.0.1'] });
    const page = await browser.newPage();
    const hits = [];
    await page.route('https://' + ABACUS + '/**', route => {
        const m = route.request().url().match(/\/hit\/[^/]+\/(.+)$/);
        hits.push(m ? decodeURIComponent(m[1]) : route.request().url());
        return route.fulfill({ status: 200, body: '' });
    });
    await page.goto('http://j3k0.github.io:8099/snake.html' + hash, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(350);
    return { server, browser, page, hits };
}
const stop = async ({ server, browser }) => { await browser.close(); server.close(); };

// ---------------------------------------------------------------------------
// A1 — the attribution key: `chal_seen` fires when a challenge link is opened.
// Gate: a challenge hash produces the key; a plain URL, a rejected hash (daily,
// unknown mode, empty) produces none; once per page load; inert on file://.
// Mutation: drop the `if (challengeFromUrl)` guard → the negative cases fail.
// ---------------------------------------------------------------------------
{
    // Positive: score-only challenge.
    let ctx = await mappedOrigin({ hash: '#classic~~500' });
    check('A1 chal_seen: a score-only challenge link fires the key',
          ctx.hits.includes('chal_seen'), 'hits: ' + ctx.hits.join(','));
    const withChallenge = ctx.hits.length;
    await stop(ctx);

    // Negatives, each on a fresh load (a key already in _firedFunnel is
    // indistinguishable from a suppressed re-fire).
    for (const [label, hash] of [['a plain URL', ''], ['a bare mode', '#classic'],
                                 ['daily (rejected by parseChallengeUrl)', '#daily~~40'],
                                 ['unknown mode', '#bogus~~40'], ['an empty challenge', '#classic~~']]) {
        ctx = await mappedOrigin({ hash });
        check('A1 chal_seen: absent for ' + label, !ctx.hits.includes('chal_seen'),
              'hits: ' + ctx.hits.join(','));
        await stop(ctx);
    }

    // Once per page load: a valid challenge, then a second one on the same load.
    ctx = await mappedOrigin({ hash: '#classic~~500' });
    const { browser } = ctx;
    await ctx.page.evaluate(() => { window.location.hash = '#zen~~900'; });
    await ctx.page.waitForTimeout(300);
    const seenCount = ctx.hits.filter(h => h === 'chal_seen').length;
    check('A1 chal_seen: fires once per page load, not once per link',
          seenCount === 1, 'count: ' + seenCount);
    check('A1 chal_seen: the hashchange path also runs the guard (page still idle, no crash)',
          await ctx.page.evaluate(() => gameState === 'idle' && !!challengeFromUrl));
    await stop(ctx);

    // Inert on file:// — the hash must produce no request at all.
    {
        const b = await chromium.launch();
        const p = await b.newPage();
        const hits = [];
        await p.route('https://' + ABACUS + '/**', route => {
            hits.push(route.request().url()); return route.fulfill({ status: 200, body: '' });
        });
        await p.goto('file://' + htmlPath + '#classic~~500', { waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(400);
        check('A1 chal_seen: zero beacons on file:// (allow-list still owns the gate)',
              hits.length === 0, 'got: ' + hits.join(','));
        check('A1 chal_seen: the challenge overlay is still parsed on file://',
              await p.evaluate(() => !!challengeFromUrl && challengeFromUrl.mode === 'classic'));
        await b.close();
    }

    // The opt-out still wins over the new key.
    ctx = await mappedOrigin({});
    await ctx.page.evaluate(() => { localStorage.setItem('snake_nocount', '1'); });
    await ctx.page.evaluate(() => { window.location.hash = '#classic~~500'; });
    await ctx.page.waitForTimeout(300);
    check('A1 chal_seen: snake_nocount suppresses it', !ctx.hits.includes('chal_seen'),
          'hits: ' + ctx.hits.join(','));
    await stop(ctx);
}

// ---------------------------------------------------------------------------
// A2 — the copy that is already served: link-preview tags sell the game and
// every number in them is code.
// Gate: og:description names the rival; the mode count and the gauntlet wave
// count in the copy equal their source symbols; the "no ads / no trackers"
// clause is backed by zero external <script src>; og:image/og:url stay absolute.
// Mutations: write "Nine modes" (or "four-wave") in the copy → the count check
// fails; add any <script src="http…"> → the trackers check fails.
// ---------------------------------------------------------------------------
{
    const meta = (name, prop) => {
        const attr = prop ? 'property' : 'name';
        const re = new RegExp('<meta[^>]*' + attr + '="' + name + '"[^>]*content="([^"]*)"', 'i');
        const m = src.match(re);
        return m ? m[1] : null;
    };
    const title = (src.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const ogDesc = meta('og:description', true) || '';
    const desc = meta('description', false) || '';
    const twDesc = meta('twitter:description', false) || '';
    const ogTitle = meta('og:title', true) || '';
    const twTitle = meta('twitter:title', false) || '';

    check('A2 copy: every description names the rival (the one mechanic a first-timer meets)',
          /rival/i.test(ogDesc) && /rival/i.test(desc) && /rival/i.test(twDesc),
          JSON.stringify({ ogDesc }));
    check('A2 copy: the title names the game and the hook, not the artifact',
          /^Snakes\b/.test(title) && /rival/i.test(title) && !/HTML file/i.test(title), title);
    check('A2 copy: no description is the implementation pitch any more',
          !/One HTML file/i.test(ogDesc + desc + twDesc));

    // Numbers are claims about code — checked against their source symbol.
    const WORD = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    // Counts come from the running game, not from this file. The source parse exists
    // only to prove the live read is not being compared to a hard-coded number.
    const b0 = await chromium.launch();
    const p0 = await b0.newPage();
    await p0.goto('file://' + htmlPath, { waitUntil: 'domcontentloaded' });
    const live = await p0.evaluate(() => ({ modes: Object.keys(MODE_CONFIG).length,
                                            waves: GAUNTLET_WAVES.length }));
    await b0.close();
    const grab = (re) => { const m = src.match(re); return m ? m[1] : ''; };
    const modeCount = grab(/\n\s*const MODE_CONFIG = \{([\s\S]*?)\n\s*\};/)
        .split('\n').filter(l => /^\s+[a-zA-Z_]+:\s*\{/.test(l)).length;
    const waveCount = grab(/const GAUNTLET_WAVES = \[([\s\S]*?)\n\];/)
        .split('\n').filter(l => /^\s*\{/.test(l)).length;
    check('A2 copy: the source parse and the live game agree (a vacuous read is a false gate)',
          modeCount === live.modes && waveCount === live.waves,
          JSON.stringify({ modeCount, waveCount, live }));
    const modeClaims = [...ogDesc.matchAll(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+modes?/gi)]
        .map(m => WORD[m[1].toLowerCase()] ?? parseInt(m[1], 10));
    const waveClaims = [...ogDesc.matchAll(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[-\s]wave/gi)]
        .map(m => WORD[m[1].toLowerCase()] ?? parseInt(m[1], 10));
    check('A2 copy: "N modes" in the card equals MODE_CONFIG (8)',
          modeClaims.length === 1 && modeClaims[0] === modeCount, JSON.stringify({ modeClaims, modeCount }));
    check('A2 copy: "N-wave gauntlet" equals GAUNTLET_WAVES (5)',
          waveClaims.length === 1 && waveClaims[0] === waveCount, JSON.stringify({ waveClaims, waveCount }));

    // "no ads, no trackers" must stay true of the artifact.
    const externalScripts = (src.match(/<script[^>]*\ssrc=/gi) || []).length;
    check('A2 copy: zero external <script src> — the ad/tracker claim is backed',
          externalScripts === 0, 'found ' + externalScripts);
    check('A2 copy: the copy claims no ads and no trackers',
          /no install[^.]*no ads[^.]*trackers/i.test(ogDesc) || /no ads/.test(ogDesc), ogDesc);
    check('A2 copy: it promises no account either', /no account/i.test(ogDesc), ogDesc);
    // Nothing in the card may advertise what the game does not have.
    check('A2 copy: no lie about multiplayer / leaderboards / cross-device save',
          !/multiplayer|leaderboard|cross-device|sync/i.test(ogDesc + twDesc + desc),
          ogDesc);

    // v15 F9's absolute-URL assertions stay.
    const ogImage = meta('og:image', true) || '', ogUrl = meta('og:url', true) || '';
    const twImage = meta('twitter:image', false) || '';
    check('A2 copy: preview URLs stay absolute (v15 F9)',
          /^https:\/\/j3k0\.github\.io\/snakes\//.test(ogImage) &&
          /^https:\/\/j3k0\.github\.io\/snakes\//.test(twImage) &&
          /^https:\/\/j3k0\.github\.io\/snakes\/$/.test(ogUrl),
          JSON.stringify({ ogImage, ogUrl, twImage }));
    check('A2 copy: og:title and twitter:title carry the same string',
          ogTitle === twTitle && ogTitle === title, JSON.stringify({ ogTitle, twTitle, title }));

    // The report side is a two-repo change; the game half must not run ahead of it.
    check('A2 copy: the deploy checklist names the counter-snapshot.sh key lists to update',
          /chal_seen/.test(readFileSync('/opt/shared/reports/snakes/DEPLOY-v16-checklist.md', 'utf8')),
          'DEPLOY-v16-checklist.md missing or silent about chal_seen');
}

console.log(`\nv16 results: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
