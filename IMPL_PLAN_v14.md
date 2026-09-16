# Snakes v14 — Implementation Plan

> Companion to `v14-design-plan.md` (rev 2). Line numbers are the tree at rev 2
> (branch `feat/v14-cycle`, `snake.html` 9675 lines, master `c3289a1`). Line numbers SHIFT as
> hunks land — every step re-anchors by symbol/grep before editing, never by a stale number.
> Each step lands, its gate passes, and it is committed before the next begins.

**Zero snapshot fields. Zero SNAPSHOT_VERSION bump.** New module state (`sessionNewBestAnnounced`,
`sessionRunMaxRaw`, `deathRivals`) is per-run or frame-scoped, re-derived/reset at the named sites.

---

## Step 1 — Feature A: rival eat cue

**Edits** (grep-anchored):
1. `updateRival` eat block — after `if (newFood) { food = newFood; } else { food = null; }`
   (the regen at ~3611-3616), before the `resonanceActive('rivalShrink')` block (~3624):
   ```js
   // v14 A: the rival's meal is a player-facing event — you just lost a race.
   // Deliberately quieter than the player's own eat cue (4 particles vs 8-18,
   // a floater phrase not a '+pts', one short blip), and NO toast (ambient
   // information, not an interruption).
   spawnFloater(newHead.x, newHead.y, 'rival ate', '#FF8888', 12, 0.8);
   spawnParticles(newHead.x, newHead.y, 4, r.color);
   playSound('rival_eat');
   srSpeak('Rival ate');
   ```
   Placement note: the Pressure Cooker branch (3624-3629) can `gameOver(); return;` — put the cue
   AFTER the food regen but that is fine either way; simplest is immediately after the
   `if (newFood) … else …` block. The cue fires for every food type (epic included).
2. `playSound` switch (~4272-4340): add `case 'rival_eat':` — 196 Hz, 0.1s, gain ramp to 0.001,
   `osc.start(now); osc.stop(now + 0.1);`. **Grep `case 'rival_eat'` first** — must be exactly 1.

**Test** (`test-v14.mjs`, new file, harness = test-helpers.mjs):
- `A1`: fixture — rival at 2 tiles from food, `dx` toward it, floaters pinned empty
  (`page.evaluate(() => { floaters.length = 0; })`), sound log via `playSound` stub capture.
  Drive one `updateRival(0)` call. Assert: `floaters.length === 1 && floaters[0].text === 'rival
  ate'`; sounds contains exactly one 'rival_eat'; particles delta === 4.
- `A2` (mutation gate): same fixture on the pre-A build must produce 0/0/0. Run by
  `git show c3289a1:snake.html > /tmp/pre-v14.html`, sed-rewrite `FILE` — v13's differential
  pattern.

**Gate:** A1 green on this tree, red on `c3289a1`. Commit `feat(v14): rival eat cue`.

---

## Step 2 — G1 + G2.1-4: truth pass

**Test edits:**
1. Delete `test-v12.mjs:619-637` (C3) — C2 (605-612) already drives the split behaviourally.
2. `test-bugfixes.mjs:98-102` (B3): replace `typeof startGame === 'function'` with:
   `Object.keys(MODE_CONFIG).length === 8` and `getModeDesc('painter').length > 0` — via
   `page.evaluate`.
3. `test-feature-d.mjs:70-73`: replace the `typeof f.spawnTime === 'number'` tautology with a
   window assert: `spawnTime <= performance.now() && performance.now() - spawnTime < 1000` on a
   fresh `generateFood` call (or delete if the surrounding test pins the pop; decide at edit time
   by reading the surrounding assertions).
4. `test-v11.mjs:202-206`: replace `src.includes('0.30')` with a behavioural check if cheap
   (drive `awardXP(100)` at `streakCount = 30` → +30%: assert the multiplier against a control);
   otherwise delete the substring assert. Same treatment for any sibling `src.includes` in
   test-v10.mjs (only the 4 named sites).

**Doc edits (AGENTS.md):**
1. "State Management — Specific Bypasses" (AGENTS.md:160-162): the H-key bullet is false —
   `snake.html` 9278-9288 guards `if (gameState !== 'idle') return;`. Rewrite to the real
   behaviour; delete the stale hazard warning.
2. "Dual Render Loops" first paragraph: rewrite the setInterval claim to the setTimeout chain
   (281-296); the only surviving `setInterval` is the srSpeak drain (1094).
3. "Code Clarity — playSound() Switch Case": only one `case 'combo_milestone'` exists (4343);
   rewrite the note as historical or delete it.
4. "Help & Legend Truth" (AGENTS.md:512): delete the "test-v12.mjs asserts zero overflow at
   1.0x/1.15x/1.35x" claim — no such test exists.

**Gate:** all 13 suites green after the edits; each rewritten assertion demonstrated failable
(Comment out the behaviour it guards → assert fails). Commit `test(v14): truth pass`.

---

## Step 3 — Feature B: obstacle steering + hazard kill + SR credit line

**Edits:**
1. `updateRival` chase branch (~3526-3545). Add beside `bodyHit`:
   ```js
   // v14 B1: the rival steers around SOLID geometry when a free move exists. It
   // is never fatal: when nothing is safe the fallback below takes the blocked
   // move (the "spirit" escape hatch — the v4 trapped-rival rule stays dead).
   var obstacleHit = function(d) {
       var nx = head.x + d.dx, ny = head.y + d.dy;
       if (MODE_CONFIG[gameMode].wrap) {
           nx = ((nx % PLAY_WIDTH) + PLAY_WIDTH) % PLAY_WIDTH;
           ny = ((ny % PLAY_HEIGHT) + PLAY_HEIGHT) % PLAY_HEIGHT;
       }
       for (var oi = 0; oi < obstacles.length; oi++) {
           if (obstacles[oi].x === nx && obstacles[oi].y === ny) return true;
       }
       return false;
   };
   ```
   Fold into both filters: `var safe = possible.filter(function(d) { return !bodyHit(d) &&
   !obstacleHit(d); });` and the perpendicular retry
   `safe = perpCandidates().filter(function(d) { return !bodyHit(d) && !obstacleHit(d); });`.
   The 20%/10% branches are UNTOUCHED.
2. Post-move hazard kill (~3590-3592, after `unshift` + cap pop, before the eat block):
   ```js
   // v14 B2: the rift is lethal to everyone standing in it — the rift's lethal
   // ring means what it says for every actor on the board. Credit stays false:
   // the player did not ram it, and this must not pay a defeat.
   // (Call-site invariant: updateRival only runs when !hoardActive &&
   // rivalFreezeMs <= 0 && !gauntletIntermission — the hoisted block at the top
   // of updateGame owns those gates.)
   if (MODE_CONFIG[gameMode].hazardsEnabled && isHazardCollision(newHead)) {
       removeRival(idx, false);
       return;
   }
   ```
3. `removeRival` (~3668): `srSpeak(defeatedByPlayer ? 'Rival destroyed' : 'Rival destroyed itself');`
   — credit-aware SR line (the toast at 3666 is already credit-gated).

**Tests** (`test-v14.mjs`):
- `B1`: rival next to an obstacle wall, food beyond it — chase-branch geometry; assert the rival
  does NOT enter an obstacle tile over 20 ticks (position never equals any obstacle tile).
- `B2a`: hazard kill — place an on-phase rift, force the rival's next move into it. Assert
  `rivals[0].active === false`, `stats.rivalsDefeated` delta === 0, score delta === 0.
- `B2b` (mutation): same fixture with `false` → `true` in the new call must produce delta 1 —
  run as a source-mutation check in the review phase, not per-run.
- `B3` (time-to-food, the [R1] replacement for the vacuous stall gate): paired-seed probe — pin
  `seedPrng` (mulberry32), obstacle-heavy board, drive 300 ticks, record ticks-to-eat; run the
  same seed against the pre-B build (`/tmp/pre-B.html` variant). Assert `meanAfter <= meanBefore
  * 1.25` and phase-throughs (rival head on an obstacle tile) === 0 after.
- `B4`: self-crash inside a rift fires `removeRival(false)` exactly once (srSpeak 'destroyed
  itself', no double particles).
- `B5`: a rival stepping OUT of an igniting rift survives (post-move semantics pin).

**Gate:** suite green incl. test-v13 (96). Commit `feat(v14): the board constrains the rival`.

---

## Step 3 — Feature C: snapToFreeTile respects telegraphs

**Edit:** `snapToFreeTile` (2216-2232): replace both `rivals.some(function(r) { return r.active &&
… })` predicates (2219, 2227) with `rivalCombinedSnake().some(...)`. `rivalCombinedSnake` is
defined at 821-828 (hoisted function declaration — safe to call from any earlier-positioned call).

**Test:**
- `C1`: construct a materialising rival whose head sits on the portal exit candidate; call
  `snapToFreeTile(x, y)`; assert the return is NOT on any `rivalCombinedSnake()` tile.
  50-seed sweep, assert 50/50.
- `C2` (regression): an ACTIVE rival still causes the snap-off (the existing probe shape, 50/51
  today).

**Gate:** suite green. Commit `feat(v14): portal exit avoids materialising telegraphs`.

---

## Step 4 — Feature D1: mode-select clip

**Edits:**
1. `snake.html` ~5245-5249: inside the existing `if (isSelected)` block, replace
   `ctx.fillText(getModeDesc(mode), CANVAS_WIDTH / 2, y + 20);` with:
   ```js
   ctx.save();
   ctx.textAlign = 'left';
   fillTextClipped(getModeDesc(mode), 10, y + 20, CANVAS_WIDTH - 10); // v14 D1
   ctx.restore();
   ```
   (`fillTextClipped` measures under the CURRENT font — the 13px font set at 5247 stays.)
2. `getModeDesc` (~1956-1969): trim the two strings:
   - painter → `'Paint the board! Trail is permanent. No self-collision. Score = coverage %.'`
   - gauntlet → `'5 waves, unique objectives. Death ends the run!'`

**Tests:**
- `D1a`: for each of the 8 modes (drive the mode-select screen, one at a time via
  `modeSelectIndex` + drawGame(1)): assert a fillText call happened for the description (stub
  counting) and `ctx.measureText` of the full string against the drawn prefix — no drawn glyph
  extends beyond `CANVAS_WIDTH - 10`.
- `D1b` (mutation): on the pre-D1 build, painter/gauntlet exceed the canvas (the negative
  half of the same probe).

**Gate:** suite green. Commit `feat(v14): mode-select descriptions draw within bounds`.

---

## Step 5 — Feature D2: cascade correction + once-per-run toast

**Edits:**
1. Module state (near `sessionModeHighStart` at 798): `let sessionNewBestAnnounced = false;`
   and `let sessionRunMaxRaw = 0;`
2. `startGame()` (~2633, beside `sessionModeHighStart = …`): reset both
   (`sessionNewBestAnnounced = false; sessionRunMaxRaw = 0;`).
3. `restoreFromSnapshot` (~3130, beside the `sessionModeHighStart` restore):
   `sessionNewBestAnnounced = score > sessionModeHighStart;`
   `sessionRunMaxRaw = Math.max(sessionModeHighStart, score);`
   (a resumed run never re-fires the toast below the crossing and still corrects its cascade).
4. `updateScoreDisplay` (2477-2496):
   - Keep the persistence block (2478-2481) EXACTLY as-is; inside it, add
     `sessionRunMaxRaw = score;` (records what this run persisted).
   - Replace the toast gate (2482-2485) with:
     ```js
     // v14 D2: ONE celebration per run, at the first crossing. The per-crossing
     // form fired 19 toasts in a 40-eat record run (58 queued vs a cap of 20) and
     // never fired at all in a fresh mode (the old `prevBest &&` term failed when
     // prevBest was undefined — the run most deserving of one).
     if (score > sessionModeHighStart && !sessionNewBestAnnounced) {
         sessionNewBestAnnounced = true;
         queueToast('🏆 NEW BEST! ' + MODE_CONFIG[gameMode].name + ': ' + score, 3000);
         playSound('achievement');
     }
     ```
     (The `sessionModeHighStart > 0` term is DROPPED deliberately — fresh modes get their toast;
     `score > 0` in a fresh mode is a genuine crossing. Guard: score 0 runs never fire because
     `score > 0` fails at score 0. A fresh-mode run that eats once has score > 0 = start → fires.)
5. `finalizeSession` (3749-3752): after the existing write, add the cascade correction:
   ```js
   // v14 D2: the mid-run best was banked from the RAW score; the cascade can
   // lower it. If THIS run's mid-run write is the persisted value and the
   // post-cascade score is lower, correct it so the mode-select Best agrees
   // with the recap card. (Pause-quit and gauntlet wave banking are untouched.)
   if (sessionCascadeMult < 1 && sessionRunMaxRaw > 0 &&
       modeHighScores[gameMode] === sessionRunMaxRaw && sessionRunMaxRaw > score) {
       modeHighScores[gameMode] = Math.max(score, sessionModeHighStart);
       saveManager.setJSON('snake_mode_highs', modeHighScores);
   }
   ```
   Zen: `sessionCascadeMult = 1` (3864) → no-op. Gauntlet: 1-mutator cap (2656) → mult 1 → no-op.

**Tests:**
- `D2a` (once-per-run): drive a record run (eats past the start best); assert exactly one
  NEW BEST toast queued (stub capture of `queueToast` args). Mutation: revert the flag → N toasts.
- `D2b` (fresh mode): clean profile, snap mode, first run with start best 0 → one toast at the
  first crossing.
- `D2c` (pause-quit unchanged): best 500 → run 700 → pause-quit → `snake_mode_highs.classic ===
  700`.
- `D2d` (cascade correction): 2-mutator run, raw 100, cascade 0.5 → after gameOver,
  `snake_mode_highs[mode] === 50` and the recap card's best-delta reads against 50.
- `D2e` (no-cascade no-op): 1-mutator run → persisted value === the raw score (unchanged).
- `D2f` (resume): save at score 500 with start best 200, restore, assert
  `sessionNewBestAnnounced === true` (no re-fire), then one more eat does not queue a toast.

**Gate:** suite green. Commit `feat(v14): one NEW BEST per run + cascade-corrected best`.

---

## Step 6 — Feature E: srSpeak depth 2

**Edits** (`snake.html` 1083-1100): replace `let srQueue = '';` with `let srQueue = [];`; rewrite
`srSpeak` and the drain interval per the design plan's snippet (FIFO push cap 2; drain shifts one
per tick and stamps `lastSrSpeak`).

**Tests:**
- `E1`: force `lastSrSpeak = Date.now() - 1000` inside `page.evaluate`, call `srSpeak('FIRST')` +
  `srSpeak('SECOND')` in the same window, then wait ~600ms twice and assert `srAnnounce`
  received 'FIRST' then 'SECOND' in order.
- `E2` (cap): fire 5 rapid `srSpeak` calls inside one window; assert `srQueue.length === 2`.
- `E3` (regression): the single-slot build drops the first (mutation gate on the pre-E build:
  `srQueue === 'SECOND'`).

**Gate:** suite green. Commit `feat(v14): screen-reader queue depth 2`.

---

## Step 6 — Features F + H: death-frame rival + per-rival head colours

**Edits:**
1. Module state (beside `recapData`, ~766): `let deathRivals = [];`
2. `gameOver()` (~3787): before `rivals = [];`:
   ```js
   // v14 F: the frame that killed you shows what killed you. Frame-scoped copy —
   // rendered only while gameState === 'gameover', so no idle path can ghost it.
   deathRivals = rivals.map(function (r) {
       return { snake: r.snake.slice(), color: r.color, active: r.active };
   });
   ```
3. `drawRival` (6110-6113): iterate `(gameState === 'gameover' ? deathRivals : rivals)` instead
   of `rivals` for the whole function body. The function's other reads (`r.active`, `r.snake`,
   `r.color`, `r.respawnTimer`) exist on the copy — the materialising branch needs
   `respawnTimer`, so copy it too. Simplest: `return { snake: r.snake.slice(), color: r.color,
   active: r.active, respawnTimer: r.respawnTimer };`
4. `resetGame()` (~2378) AND `resetWaveState()` (~6601): `deathRivals = [];` (both reset sites).
5. `drawRival` head colours (6121, 6140): replace the shared `'#FF5555'` with per-rival
   constants — add `RIVAL_HEAD_COLORS = ['#FF6655', '#FF66AA']` beside `RIVAL_MAX_LENGTH`
   (~1231) and index `ri === 0 ? … : …`. Under double_rival the two heads are distinguishable;
   single-rival boards render rival 0's head in the same red family as today.

**Tests:**
- `F1` (pixel gate): build a rival body at a tile outside the recap card's 320px box, drive a
  real death, `drawGame(1)`; assert the pixel at the rival tile is reddish. Press Escape → idle;
  assert the same pixel is background.
- `F2` (mutation): pre-F build → gameover frame pixel is background (the discrimination).
- `H1`: two rivals on board → the two head fillStyles differ (stub capture of `ctx.fillStyle`
  per frame, or read the constants + assert both used).

**Gate:** suite green. Commit `feat(v14): the death frame keeps its rival; per-rival head colours`.

---

## Step 7 — G2.5: the v14 AGENTS.md section

Append a `## v14 Features` section: the eat cue (weight justification + the measured no-throttle
evidence), obstacle steering (chase-branch only, blocked-move fallback, the measured time-to-food
parity), hazard lethality for the rival (post-move semantics, uncredited, classic+timeAttack
domain), the once-per-run NEW BEST toast (design change: 19→1) + the cascade correction (the
`=== sessionRunMaxRaw` guard), the snap-telegraph fix, srSpeak depth 2, the death-frame copy, the
head colours — each with its accepted-behaviour notes. Plus the deliberate non-fixes list
(rev-2's eight items) and the CURRENT hazard vocabulary note (violet lethal rift; dashed orange =
pre-ignition keyframe only). Cite current lines.

**Gate:** every cited line resolves; `node test-bugfixes.mjs` load check green.
Commit `docs(v14): AGENTS.md v14 section`.

---

## Step 8 — Live-game verification + full sweep

1. Full suite: `node test-bugfixes.mjs && node test-bughunt.mjs && node test-evolution.mjs &&
   node test-feature-d.mjs && node test-gameloop.mjs && node test-gameplay.mjs &&
   node test-harness-smoke.mjs && node test-quests.mjs && node test-v9.mjs && node test-v10.mjs
   && node test-v11.mjs && node test-v12.mjs && node test-v13.mjs && node test-v14.mjs` —
   all green, N runs, identical pass/fail SET.
2. Differential: `test-v14.mjs` against `/tmp/pre-v14.html` (sed-rewritten `FILE`) — record the
   fail/pass figure; the set must be stable across 2 runs.
3. Live loop in Chromium (`launch()` + real `setTimeout` chain):
   - rival eats: floater + blip observed (screenshot);
   - rival routes around an obstacle wall (before/after screenshots);
   - rival dies in a rift, uncredited (state assertion + screenshot);
   - mode-select: all 8 descriptions visible, no cut glyphs (screenshot);
   - record run: exactly one NEW BEST toast; recap Best agrees with the mode-select Best;
   - gameover frame shows the rival (screenshot), idle does not.

## Dispositions of review findings (this plan's own review follows)

To be filled after the impl-plan review: a disposition table per finding (accepted / rejected +
reason), v13-style.