# Snakes v13 — Implementation Plan

Source of truth: `v13-design-plan.md` (revision 2), which incorporates `v13-review-1.md` (correctness)
and `v13-review-2.md` (design). Where those disagree, revision 2's resolution is authoritative and this
plan implements it.

**Baseline:** master `e2851ac`. `snake.html` 9174 lines. Full sweep verified **green before any edit**:

```
test-bugfixes 18/18  test-bughunt 10/10  test-evolution 11/11  test-feature-d 14/14
test-gameloop  1/1   test-gameplay 5/5   test-harness-smoke 4/4 test-quests 21/21
test-v9 19/19        test-v10 12/12      test-v11 14/14         test-v12 45/45
```
174 assertions, ~22 s for the sweep.

**Non-negotiable invariants (each asserted at its gate):** additive snapshot fields, no
`SNAPSHOT_VERSION` bump; both reset sites; canvas save/restore **and drawing state**; the death-save
chain order (collision: shield → vampire → streak → serpentine → death; rival: shield → phoenix →
streak → death); tick-counted timers, never 60fps; the reward path never double-fires.

---

## Step 1 — Feature A: rival movement integrity

**File:** `snake.html`, `updateRival` L3393-3409, `spawnRival` L3329.

### 1a. Movement (replace L3404-3405 and the eat branch's growth)

Today:

```js
3404    r.snake.unshift(newHead);
3405    if (r.snake.length > RIVAL_MAX_LENGTH) r.snake.pop();
...
3407    if (food && newHead.x === food.x && newHead.y === food.y) {
3408        r.snake.push({ x: newHead.x, y: newHead.y });
3409        if (r.snake.length > RIVAL_MAX_LENGTH) r.snake.pop();
```

Becomes — the self test (L3393-3402) moves **after** the vacate, and growth moves to the eat branch:

```js
// v13: mirror the player's movement contract (pop at L7014, unshift at L7233, grow only
// on eat). The old form unshifted and popped only PAST the cap, so the rival grew a
// segment per tick of empty movement and saturated at RIVAL_MAX_LENGTH in 19 ticks.
var rTail = r.snake.pop();
var selfHit = false;
for (var rs = 0; rs < r.snake.length; rs++) {
    if (r.snake[rs].x === newHead.x && r.snake[rs].y === newHead.y) { selfHit = true; break; }
}
if (selfHit) { removeRival(idx, false); return; }   // 1c: self-crash is not a player kill

r.snake.unshift(newHead);
if (r.snake.length > RIVAL_MAX_LENGTH) r.snake.pop();
```

and the eat branch's first two lines (L3408-3409) are **deleted** — replaced by the growth applied
where the eat is detected, *after* `unshift`:

```js
if (food && newHead.x === food.x && newHead.y === food.y) {
    // v13: growth is the vacated tail returned to the body — the old `push(newHead)`
    // duplicated the head's own tile (+2 length, two identical cells, and one segment
    // permanently over RIVAL_MAX_LENGTH at the cap).
    r.snake.push(rTail);
    if (r.snake.length > RIVAL_MAX_LENGTH) r.snake.pop();
    ... existing epic/portal cleanup + Pressure Cooker, unchanged ...
}
```

`selfHit` is scanned against the **post-pop** body, so the tail-exemption matches the player's.

### 1b. Spawn length 3 (the spec's "Rival Growth" section)

`spawnRival` L3329 becomes a short body laid backwards along `−dx`, wrap-normalized, truncating on the
first blocked tile:

```js
var RIVAL_SPAWN_LENGTH = 3;   // module scope, beside RIVAL_MAX_LENGTH (L1218)
...
r.snake = [{ x: spawnPos.x, y: spawnPos.y }];
r.dx = TILE_SIZE; r.dy = 0;
for (var sl = 1; sl < RIVAL_SPAWN_LENGTH; sl++) {
    var seg = MODE_CONFIG[gameMode].wrap
        ? wrapPosition({ x: r.snake[sl-1].x - r.dx, y: r.snake[sl-1].y - r.dy })
        : { x: r.snake[sl-1].x - r.dx, y: r.snake[sl-1].y - r.dy };
    if (seg.x < 0 || seg.x >= PLAY_WIDTH || seg.y < 0 || seg.y >= PLAY_HEIGHT) break;
    if (snake.some(function (s) { return s.x === seg.x && s.y === seg.y; })) break;
    if (obstacles.some(function (o) { return o.x === seg.x && o.y === seg.y; })) break;
    r.snake.push(seg);
}
```

### 1c. `removeRival(idx, defeatedByPlayer)` — signature and reward

`removeRival` L3449-3464:

```js
function removeRival(idx, defeatedByPlayer) {
    if (idx === undefined) idx = 0;
    if (idx >= rivals.length) return;
    var r = rivals[idx];
    var wasActive = r.active;
    // The spec's "particle explosion" — must run while r.snake[0] still exists.
    if (r.active && r.snake.length > 0) {
        spawnParticles(r.snake[0].x, r.snake[0].y, 20, r.color);
        if (wasActive && defeatedByPlayer) {
            spawnFloater(r.snake[0].x, r.snake[0].y - TILE_SIZE, '+50', '#FF8888', 14, 0.9);
        }
    }
    r.snake = [];
    r.active = false;
    r.respawnTimer = RIVAL_RESPAWN_MS;   // named constant, was the literal 10000
    // v13: credit is now EXPLICIT. Only player-caused removals count — a rival that
    // tangles itself must not pay the player a defeat (it was the dominant source of
    // RIVAL_SLAYER and the 25 / 100 milestones, and the growth bug made it constant).
    if (wasActive && defeatedByPlayer) {
        stats.rivalsDefeated++;
        addScore(50);                     // spec: +50 bonus score
        awardXP(100);                     // spec: +100 XP
        playSound('powerdown');           // reused — no new sound case for the defeat
        queueToast('\u2694\uFE0F Rival defeated!', 1500);
    }
    srSpeak('Rival destroyed');
}
```

`spawnFloater(x, y, text, color, size, duration)` exists at L1055 and is capped at 8 live floaters
(L1066) — no new helper needed, and no ring (the particle burst is the spec's explosion).

### Step 1 acceptance

| # | Assertion | Fails before? |
|---|---|---|
| A1 | 40 direct `updateRival` calls with the player parked and food far away → the rival's length stays **1** at spawn length 1 / stays at its spawn length, and never reaches 20 | yes (reaches 20 in 19 calls) |
| A2 | 10 calls with food placed on each next tile → length increases by **exactly 1** per eat; `new Set(body.map(JSON.stringify)).size === body.length` | yes (+2 and a duplicate cell) |
| A3 | **U-turn geometry:** a length-4 rival whose next head tile is its own tail cell survives one standalone move | yes (no tail exemption) |
| A4 | A rival whose next head tile is its own neck (`body[1]`) dies on that move with `stats.rivalsDefeated` **unchanged** | yes (credited +1) |
| A5 | `spawnRival` produces a body of length 3 (or a shorter prefix when blocked) | n/a — new |
| A6 | Epic on the rival's next tile → the portal twin is removed (`extraFoods` filtered) | regression guard |
| A7 | `test-v12.mjs` A14 (Pressure Cooker) still green | regression guard |

---

## Step 2 — Feature B: contact resolution

### 2a. Hoist the rival block

Move **L7787-7803** (the respawn-timer loop, the `updateRival` loop, and the
`if (gameState !== 'playing') return;` guard) to immediately after the `rivalFreezeMs` decay at
**L6815**, then delete them from the tail. The hoisted code is unchanged except for the `moveCounter`
decrement it will gain in Step 3.

Correct the stale comment at L3429-3431 ("the caller's tick-tail guard") to name the hoisted position.

Also add, at the top of the hoisted block:

```js
// v13: the rival moves FIRST, so the player's collision test at L7214 compares against
// the rival's post-move body — the two are no longer a tick out of phase (that staleness
// was the free kill). The guard below must stay immediately after this block: a rival
// eat can end the run through the Pressure Cooker resonance.
```

### 2b. Delete `updateRival`'s head-on branch

Delete L3440-3445 (`if (playerHead.x === newHead.x && playerHead.y === newHead.y) { removeRival(idx); return; }`).
Contact resolution moves entirely to the player's phase. This removes the free kill, the flag the
design review rejected, and one of the two rival-caused death paths.

### 2c. Rules 1 and the leech fix — `checkPlayerDeath`'s rival loop (L7157-7207)

Rule 1 needs **no code change**: with 2a in place, `wrappedHead` is tested against the rival's
post-move body automatically.

The leech branch gains the resolution guard (design plan B5):

```js
if (ldx <= TILE_SIZE && ldy <= TILE_SIZE && ldx + ldy <= TILE_SIZE * 2) {
    for (var lsi = 0; lsi < 3 && rivals[rci].snake.length > 1; lsi++) {
        snake.push({ x: snake[snake.length - 1].x, y: snake[snake.length - 1].y });
        rivals[rci].snake.pop();
    }
    // v13: the drain RESOLVES this contact. If the player's head is on the rival's head
    // tile the segment test below would kill them — the advertised head-to-head counter
    // backfired above length 4 (drain leaves >=2, rival survives, player dies).
    if (rivals[rci].snake.length <= 1 ||
        (wrappedHead.x === rHead.x && wrappedHead.y === rHead.y)) {
        removeRival(rci, true);
        continue;   // resolved — skip the segment test for this rival
    }
    spawnParticles(wrappedHead.x, wrappedHead.y, 10, '#44FF88');
    triggerEvolutionIfReady();
}
```

(`continue` is safe: it skips only the remainder of this `rci` iteration.)

### 2d. Rule 2 — `resolveRivalRams()`

New module-scope function, called once immediately after the player's move is committed (after the
`if (teleportSavePos) … else { snake.unshift(wrappedHead); }` block at L7220-7233):

```js
// v13: the rival rams the player's BODY → the rival dies, credited and rewarded
// (the arena spec's "Rival head touches player body"). Evaluated AFTER the player's move
// is committed, so `snake` is the player's real post-move occupancy — testing it
// pre-move (inside updateRival) destroyed and credited any rival that simply followed
// the player into the tile they were vacating. Rule 1 runs first and returns on a hit,
// so reaching here proves the heads are not on the same tile: the head-on case is
// never double-resolved.
function resolveRivalRams() {
    for (var ri = 0; ri < rivals.length; ri++) {
        if (!rivals[ri].active || rivals[ri].snake.length === 0) continue;
        var rHead = rivals[ri].snake[0];
        for (var si = 0; si < snake.length; si++) {
            if (snake[si].x === rHead.x && snake[si].y === rHead.y) {
                removeRival(ri, true);
                break;
            }
        }
    }
}
```

Call site, inside `updateGame`:

```js
            } else {
                snake.unshift(wrappedHead);
            }
            resolveRivalRams();   // v13
```

**`!active` guard is load-bearing:** it keeps the materialising rival (Step 4) inert on the rival
side, mirroring rule 1's `rivals[rci].active` guard.

### Step 2 acceptance

| # | Assertion | Fails before? |
|---|---|---|
| B1 | **Charge head-on from 1 tile** → `gameover`, `lastDeathCause === 'You were caught by the rival!'`, rival **still active**, defeat delta **0** | no (already correct) |
| B2 | **Charge head-on from 2 tiles** → `gameover`, cause `'You were caught by the rival!'`, rival **survives**, defeat delta **0** | **yes** — today `playing`, rival dead, delta +1 |
| B3 | **Rival rams the player's body** (player stationary/fleeing, rival steps into a body tile) → `playing`, rival removed, defeat delta **+1**, score **+50**, XP **+100** | **yes** — today nothing happens |
| B4 | **Rival crosses the tile the player vacates this tick** → nothing happens (no removal, no credit, `playing`) | **yes** — the hoist alone would destroy and credit it |
| B5 | **Rival follows the player's tail for 20 ticks** → 0 defeats, rival still active | **yes** (same class as B4) |
| B6 | **Self-collision** → rival removed, defeat delta **0** | **yes** (delta +1 today) |
| B7 | **Leech, rival length 5, player head lands exactly on the rival's head** → `playing`, rival removed, defeat delta **+1** | **yes** (player dies today) |
| B8 | **Leech, rival length 8, player head adjacent but not overlapping** → rival drained to 5, still active, delta **0** | regression guard (partial drain preserved) |
| B9 | **Each save type on a head-on** — shield, phoenix, streak charge → `playing`, `lastSaveEvent` names the save, `lastDeathCause !== 'You were caught by the rival!'` | regression guard, **shield included** |
| B10 | **No-shield co-occupancy:** over a 300-tick randomized soak with `shieldActive = false`, no tick tail ends with the player's head on an active rival segment | **yes** today for the free-kill shapes? No — today the rival is removed. This is a *forward* guard; it fails only if Step 2 is implemented wrong. |
| B11 | **Food-competition flip:** food two tiles from both heads → the rival eats it, player score unchanged | documents the intended change |
| B12 | **Determinism:** same seed, two runs driven by a synchronous `driveTicks` loop → identical state; and grep proves no new `Math.random()`/`Date.now()` in the reordered region | regression guard |
| B13 | **Full suite sweep green** after `test-evolution.mjs:175-196`'s rival is given an explicit `dx`/`dy` and `test-v9.mjs:236`'s fixture is re-checked | gate |

**Documented test edits (Step 2 owns them):**
- `test-evolution.mjs:175-196` — the hand-built rival has no `dx`/`dy`, so once the rival moves first
  its next head is `NaN` (46/200) or its own segment (75/200) and the leech fires 79/200. Give it an
  explicit direction and a geometry that holds post-hoist.
- `test-v9.mjs:236` — the fixture `{snake:[{x:0,y:0}], active:false, respawnTimer:100}` becomes the
  materialising state in Step 4. Re-check that its `after < during` assertion still holds once
  activation zeroes `respawnTimer`.

---

## Step 3 — Feature E: length-derived cadence

`updateRival` top, before the AI re-roll (L3342):

```js
// v13: the rival's stride is derived from its OWN length — a short rival competes for food
// at full parity, a long one is the slow wall it should be. Tick-counted (never wall-clock),
// so slowMo / speed food / the Swift divider / Time Attack's fixed cadence all scale the
// rival with the player, the same way they always did.
var RIVAL_CADENCE_LONG = 14, RIVAL_CADENCE_MID = 7;   // module scope
...
var rStride = r.snake.length >= RIVAL_CADENCE_LONG ? 3 : r.snake.length >= RIVAL_CADENCE_MID ? 2 : 1;
r.moveCounter = (r.moveCounter || 0) + 1;
if (r.moveCounter % rStride !== 0) return;   // BEFORE the AI re-roll: no turning in place
```

`spawnRival` and the Step 4 activation set `r.moveCounter = 0` (the first call then moves).
`moveCounter` is snapshot-additive: add `moveCounter: r.moveCounter || 0` to the build (L2887) and
`moveCounter: r.moveCounter || 0` to the restore (L3060), undefined-safe. **No `SNAPSHOT_VERSION` bump.**

### Step 3 acceptance

| # | Assertion | Fails before? |
|---|---|---|
| E1 | length 2 → 30 calls advance exactly 30 tiles | n/a (new behavior) |
| E2 | length 20 → 30 calls advance exactly 10 tiles | n/a |
| E3 | Force a skip with food directly behind; `r.dx`/`r.dy` are byte-identical before and after | n/a |
| E4 | `test-v12.mjs` A14 green (its rival is length 2 → stride 1) | regression guard |
| E5 | Snapshot round-trip: `moveCounter` survives build→restore; a snapshot without the field restores to 0 | n/a |

---

## Step 4 — Feature C: spawn telegraph

### 4a. `spawnRival` becomes the materialising step

Changes to L3307-3334:
- Guard becomes `if (rivals[idx].active || rivals[idx].snake.length > 0) return;`
- Picks the tile + the 3-segment body (Step 1b), then **leaves `active = false`** and sets
  `respawnTimer = RIVAL_WINDUP_MS` (1600) and `moveCounter = 0`.
- The tile search passes the Feature D options (Step 5).

```js
var RIVAL_RESPAWN_MS = 10000, RIVAL_WINDUP_MS = 1600;   // module scope, named
```

### 4b. Two-stage respawn loop (in the hoisted block)

```js
for (var rri = 0; rri < rivals.length; rri++) {
    var rr = rivals[rri];
    if (rr.active || !(rr.respawnTimer > 0) || hoardActive || rivalFreezeMs > 0) continue;
    rr.respawnTimer -= tickInterval;
    if (rr.respawnTimer <= 0) {
        if (rr.snake.length === 0) {
            spawnRival(rri);            // dead → materialising (re-arms at RIVAL_WINDUP_MS)
        } else {
            // materialising → active, DEFERRED while the player is inside the spawn radius
            if (playerInsideRivalSpawnRadius(rr)) { rr.respawnTimer += tickInterval; continue; }
            rr.active = true;
            rr.respawnTimer = 0;
            spawnParticles(rr.snake[0].x, rr.snake[0].y, 12, rr.color);
            playSound('rival_warn');
            srSpeak('Rival incoming.');
        }
    } else if (rr.snake.length === 0 && rr.respawnTimer <= RIVAL_WINDUP_MS) {
        spawnRival(rri);                // pre-empt: start the wind-up so dead→active stays 10 s
    }
}
```

`playerInsideRivalSpawnRadius(rr)` measures wrap-aware Manhattan from `snake[0]` to `rr.snake[0]`
against `RIVAL_MIN_SPAWN_TILES * TILE_SIZE`. The wind-up inherit's the loop's
`!hoardActive && rivalFreezeMs <= 0` gate, so it **pauses** during a freeze while staying drawn.

The `srSpeak` positional line (`'Rival incoming, right, 7 tiles'`) is emitted once when the wind-up
*starts* (inside `spawnRival`), not at activation.

### 4c. First-materialisation onboarding

`snake_has_seen_rival` + `queueToast('⚠ Rival incoming — avoid the dashed ring!', 3000, 'high')`,
mirroring `hasSeenHazard` (L3933-3936). Fires once per save, not per spawn.

### Step 4 acceptance

| # | Assertion | Fails before? |
|---|---|---|
| C1 | Dead→active measures `RIVAL_RESPAWN_MS` ± 1 tick (from `removeRival` to `active === true`) | n/a |
| C2 | During the whole wind-up the rival is `active === false` and the player standing on the telegraph tile survives every tick | n/a |
| C3 | Activation defers while the player's head is within `RIVAL_MIN_SPAWN_TILES` of the telegraph tile (assert ≥1 deferral) | n/a |
| C4 | A materialising rival is inert on **both** sides: the player's head on its body → no death; its head on the player's body → no removal | n/a |
| C5 | Snapshot mid-wind-up → restore → still materialising, countdown sane, activates exactly once | n/a |
| C6 | The wind-up pauses (does not advance) during `hoardActive` / `rivalFreezeMs > 0` | n/a |
| C7 | Every spawn path materialises: `startGame` (classic + `double_rival`), gauntlet wave 3, cascade | n/a |
| C8 | `test-v9.mjs` (hoard freeze fixture) green | regression gate |

---

## Step 5 — Feature D: spawn geometry

`findFreeTile` L3232-3246 gains an options third parameter with legacy-boolean compatibility:

```js
function findFreeTile(headX, headY, opts) {
    var o = (opts === true || opts === false) ? { ignoreObstacleCap: opts } : (opts || {});
    var minTiles = o.minTiles === undefined ? 3 : o.minTiles;
    var wrapAware = !!o.wrapAware;
    var avoidExtras = !!o.avoidExtras;
    const cols = PLAY_WIDTH / TILE_SIZE, rows = PLAY_HEIGHT / TILE_SIZE;
    const maxObs = Math.floor((cols * rows) * MAX_OBSTACLE_PERCENT);
    if (!o.ignoreObstacleCap && obstacles.length >= maxObs) return null;
    for (let attempt = 0; attempt < 50; attempt++) {
        const x = Math.floor(seededRandom() * cols) * TILE_SIZE;
        const y = Math.floor(seededRandom() * rows) * TILE_SIZE;
        var ddx = Math.abs(x - headX), ddy = Math.abs(y - headY);
        if (wrapAware) {
            ddx = Math.min(ddx, PLAY_WIDTH - ddx);
            ddy = Math.min(ddy, PLAY_HEIGHT - ddy);
        }
        if (ddx + ddy < minTiles * TILE_SIZE) continue;
        ... existing snake / obstacles / food / rival rejections, unchanged ...
        if (avoidExtras) {
            // v13: so a rival never materialises on the hoard food, portal twin, echo food,
            // power-up or inside an on-phase hazard the player is running for.
            if (hazards.some(h => h.phase === 'on' && Math.abs(h.cx - x) + Math.abs(h.cy - y) <= h.radius)) continue;
            if (extraFoods.some(function (ef) { return ef.x === x && ef.y === y; })) continue;
            if (food2 && food2.x === x && food2.y === y) continue;
            if (powerUpPickup && powerUpPickup.x === x && powerUpPickup.y === y) continue;
        }
        return { x, y };
    }
    return null;
}
```

`spawnRival` calls:

```js
var spawnPos = findFreeTile(ph.x, ph.y, {
    ignoreObstacleCap: true, minTiles: RIVAL_MIN_SPAWN_TILES, wrapAware: true, avoidExtras: true
});
```

`RIVAL_MIN_SPAWN_TILES = 5`. **Every other caller is untouched** (L4428, L6194, L7047, L7104, L7192,
L7871) — they keep 3 raw tiles and today's occupancy set, so no death save silently loses its tile.

### Step 5 acceptance

| # | Assertion | Fails before? |
|---|---|---|
| D1 | 40 **placed** respawns with the player against each of the four wrap seams → minimum wrap-aware distance ≥ 5 tiles | **yes** (1-tile seam spawns measured) |
| D2 | `findFreeTile(h, h + 2*TILE_SIZE)` still returns a tile (legacy 3-tile default) | regression guard |
| D3 | The five save/obstacle callers' behaviour is byte-identical (same seeded PRNG draw count) | regression guard |
| D4 | A full row → `spawnRival` re-arms at 2000 ms instead of crashing / placing off-board | regression guard |
| D5 | A rival never materialises on an `extraFoods` tile or inside an on-phase hazard | **yes** (today it can) |

---

## Step 6 — Feature F: legibility

1. **Colours.** `spawnRival` L3310: `color: idx === 0 ? '#B71C1C' : '#AD1457'`; `drawRival` L5852 head
   `'#FF5555'`. (Fixes the measured `#FF4444` collision with `FOOD_TIERS.common`, L1443.)
2. **`drawRival` telegraph branch.** Change the L5850 guard to
   `if (r.snake.length === 0) continue;` and add, before the active body loop:

```js
if (!r.active) {
    // materialising: ghost body + dashed ring + countdown arc — the v12 hazard vocabulary
    var windFrac = 1 - Math.max(0, Math.min(1, r.respawnTimer / RIVAL_WINDUP_MS));
    ctx.save();
    ctx.globalAlpha = calmModeEffective() ? 0.5 : 0.15 + 0.35 * (1 - windFrac);
    for (var rw = 0; rw < r.snake.length; rw++) ctx.fillRect(r.snake[rw].x + 1, r.snake[rw].y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    if (r.snake.length > 0) {
        var hx = r.snake[0].x + TILE_SIZE / 2, hy = r.snake[0].y + TILE_SIZE / 2;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,90,90,' + (calmModeEffective() ? 0.7 : 0.35 + 0.45 * (1 - windFrac)) + ')';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.arc(hx, hy, TILE_SIZE * 0.75, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);                       // MUST reset — dash state is global
        ctx.strokeStyle = 'rgba(255,120,120,0.75)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hx, hy, TILE_SIZE * 0.75, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * windFrac); ctx.stroke();
    }
    ctx.restore();
    continue;
}
```
   **Calm mode gates only the brighten**; the ring and the arc always render (information).
3. **Proximity ring** — inside the active path, wrap-aware head distance ≤ 3 tiles → dashed ring
   radius `TILE_SIZE * 1.1`, `rgba(255,60,60,0.85)`, own `save`/`restore` + `setLineDash([])` reset.
   Not calm-gated (information).
4. **`drawRivalHUD`** L6116-6130 — restructure both early returns:

```js
var live = 0, windup = null, soonest = Infinity;
for (var ri = 0; ri < rivals.length; ri++) {
    var r = rivals[ri];
    if (r.active) live = Math.max(live, r.snake.length);
    else if (r.snake.length > 0) windup = Math.max(windup === null ? 0 : windup, RIVAL_WINDUP_MS - r.respawnTimer);
    else if (r.respawnTimer > 0) soonest = Math.min(soonest, r.respawnTimer);
}
var text = live > 0 ? 'Rival: ' + live
         : windup !== null ? '\u26A0 Rival in ' + (Math.max(0, RIVAL_WINDUP_MS - windup) / 1000).toFixed(1) + 's'
         : soonest < Infinity ? 'Rival \u29D7 ' + (soonest / 1000).toFixed(1) + 's'
         : null;
if (text === null) return;
```
   Draw `text` in the existing slot (5, 40), `#FF8888`, or `#FFB0B0` while materialising.
   **No frozen `❄` state** — see the design plan.
5. **Sound:** one new `case 'rival_warn':` in `playSound` (grep the label first). `powerdown` is
   reused on a credited defeat via the existing `removeRival` → add `playSound('powerdown')` there.
6. **`srSpeak`:** `'Rival incoming, <dir>, <n> tiles'` at wind-up start; `'Rival destroyed'` in
   `removeRival`.
7. **Onboarding toast:** `snake_has_seen_rival` (Step 4c).

### Step 6 acceptance

| # | Assertion | Fails before? |
|---|---|---|
| F1 | Canvas **save/restore depth returns to 0** and `ctx.getLineDash()` is empty, `globalAlpha === 1`, `transform` unchanged, at the end of a frame drawing materialising + active + proximate + defeated rivals | n/a |
| F2 | Exactly one `case 'rival_warn':` in `playSound` | n/a |
| F3 | `drawRivalHUD` renders each of the three strings in its state | n/a |
| F4 | Rival body colour ≠ `FOOD_TIERS.common.color` for every palette | **yes** (identical today) |
| F5 | Screenshots: materialising, active+proximate, defeated; plus one CVD palette pass | n/a |

---

## Step 7 — Feature G: truth repairs and AI sanity

1. **Stern deadlock** (L3356-3371): when `possible.length === 0` after the reverse filter, push the two
   perpendicular candidates (still reverse-filtered).
2. **1-ply self-rejection** (L3360-3378): filter candidates against `r.snake` occupancy.
3. **`double_rival` truth:** `rivalEnabledInMode(mode)` helper (classic / timeAttack / gauntlet only)
   replacing the literal lists at L3313, L2630, L8450, L8467 and gating `spawnRival`; `pickDraftOptions`
   (L6471) drops `double_rival` when `!rivalEnabledInMode(gameMode)`; `startNextWave` (L6335-6337)
   also spawns rival 1 when `double_rival` is drafted.
4. **Cleanup:** delete `prevRivalSnake` (L427, L6973); fix the stale `advanceShrinkZone` comment
   (L2731-2734); update the `leech` descriptor (L1103) to match B5; rewrite AGENTS.md's stale
   `rivalActive`/`rivalSnake`/`rivalLength` section and add the v13 section.

### Step 7 acceptance

| # | Assertion | Fails before? |
|---|---|---|
| G1 | Food directly astern → the rival turns perpendicular instead of driving away (head does not increase its distance to the food) | **yes** |
| G2 | A candidate move onto the rival's own body is rejected (measured self-crash rate drops) | **yes** |
| G3 | Classic + `double_rival` → two rivals; Zen + draft pool → `double_rival` never offered; Gauntlet wave 3 + `double_rival` → two rivals | **yes** |
| G4 | `prevRivalSnake` no longer referenced anywhere | n/a |
| G5 | `test-bugfixes.mjs` "No JS errors on load" green | gate |

---

## Ordering, gates and rollback

Steps land in the order above. **Step 2 owns the two test-fixture edits** — Step 2's gate ("full suite
sweep green") cannot pass before them, so they land inside Step 2, not later. Step 3 is independent of
Step 2 if the `moveCounter` is added to the hoisted block.

Full sweep (`for f in test-*.mjs; do node $f; done` excluding `test-helpers.mjs`) runs at the end of
every step; any RED is fixed before the next step starts.

**Rollback:** every step is a self-contained edit region. Step 3 reverts with one line (force
`rStride = 1`). Step 4 reverts by removing the wind-up branch (`spawnRival` sets `active = true` and
`respawnTimer = 0` again). Step 2 does not revert cleanly (it is the cycle's point) — if the hoist
proves unsound the fallback is to keep the hoist and revert only 2b-2d, which restores today's exact
behaviour.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| The hoist changes food-competition order and every seeded outcome, once | Medium | Accepted and documented; asserted directly (B11); no wall-clock in the new code (B12). |
| Two hand-built test fixtures are invalidated | Medium | Named (`test-evolution.mjs:175-196`, `test-v9.mjs:236`); fixed inside Step 2 and Step 4; the gate says "after the fixtures are made explicit". |
| A save is bypassed on a new contact path | High impact | B9 covers all three save types including shield; the exit chain is byte-identical. |
| `resolveRivalRams` fires on the player's vacated tail tile | High | It runs **after** the move commit, so `snake` is the real post-move body — B4/B5 are the regressions. |
| Canvas corruption from the new draw paths | High impact, low likelihood | F1 asserts drawing state (dash/alpha/transform), not just depth. |
| The cadence makes the rival too weak | Medium | Length-derived: a short rival keeps full parity; recorded as a balance lever with a one-line revert. |
| Repeated `spawnRival` failures on a crowded board | Low | The existing 2000 ms re-arm covers it (D4). |

---

## Review dispositions (applied during implementation)

`v13-impl-review.md` reviewed this plan before implementation finished. Dispositions:

| Review finding | Disposition |
|---|---|
| **1 (BLOCKING)** B9's shield row cannot pass — the shield branch never writes `lastSaveEvent`; and the shield path keeps a credited free kill | **Applied.** `resolveRivalRams` now scans `si = 1` (the head tile is rule 1's business), so a save is never scored as a body ram. B9's shield row asserts `stats.shieldBlocks` consumption instead of `lastSaveEvent`, plus the new **B9b** (`rivalActive && delta === 0`). Falsified: with `si = 0` restored, B9b fails (`delta: 1, rivalActive: false`). |
| **2 (MAJOR)** the hoist makes the rival-eat shrink kill read a pre-move head | **Applied, with the consistency argument.** Documented in code and AGENTS.md: the two existing `advanceShrinkZone` callers (shrink timer, rapidDoom) already run in the tick prologue ahead of the player's move, so the rival path is now *consistent* with them rather than the odd one out. No deferred-kill flag added. |
| **3 (MAJOR)** the hoist lifts the rival above the gauntlet intermission `return` and the Pigment-Rush freeze write | **Applied in part.** Both rival loops are now gated `&& !gauntletIntermission`, restoring today's freeze behind the wave-pick screen. The freeze-*start* tick (one extra rival move when the Pigment Rush writes `rivalFreezeMs` later in the same tick) is **documented as accepted** — bounded, rare, not unfair. |
| **4 (MAJOR)** Step 1c strands the credit path for its unchanged call sites | **Applied.** The signature change landed atomically with its call sites: the leech call passes `true` and the head-on branch was deleted in the same edit, so no window exists where kills stop counting. |
| **5 (MAJOR)** F1 cannot observe an invisible cue; F3 names no mechanism | **Applied.** `test-v13.mjs` counts `fillRect`/`arc` calls against a **no-rival baseline** (F3/F3b/F3c/F3d) and keeps the depth + dash + alpha + transform assertion alongside. Falsified: restoring `drawRival`'s old `if (!r.active …) continue;` fails F3/F3b while **F1 still passes** — exactly the blindness the review predicted. |
| **6 (MINOR)** telegraph ghost drawn with no `fillStyle` | **Not applicable** — a defect in this plan's snippet only; the shipped code sets `fillStyle` per segment. |
| **7 (MINOR)** `rival_warn` played at activation | **Applied.** The sound fires from `spawnRival` (wind-up start) via `announceRivalIncoming`; the activation branch plays particles only. |
| **8, 9 (MINOR)** the literal delete/move ranges were off by one | **Applied** — handled correctly in the actual edits (whole `if` wrapper removed; the `gameState` guard moved with the block). |
| **10 (MINOR)** the 3-segment spawn body is not filtered like the head tile | **Applied.** The body now rejects `extraFoods`, `food2`, `powerUpPickup` and on-phase hazards, matching `avoidExtras`. |
| **11 (MINOR)** rollback claims wrong | **Noted** — the real rollback is reverting the hoist, not 2b-2d. |
| **13 (NIT)** the activation deferral is unbounded and the HUD stalls at 0.0s | **Applied.** `RIVAL_MAX_DEFERRALS` (20) caps it; at the cap the telegraph is **relocated and re-armed** rather than ambushing the camper or deferring forever. Covered by C7. |
| Missing assertion 1 — a save is never scored as a ram | **Applied** (B9b). |
| Missing assertion 2 — the reward fires exactly once per removal | **Applied** (B12: two rivals removed in one tick; `delta × 50 === score`). |
| Missing assertion 3 — the telegraph actually draws | **Applied** (F3/F3b/F3c/F3d). |
| NIT 12, 14 — gate wording (`A1`'s "stays 1", D3's "five" vs six, G2's statistical phrasing) | **Noted**; the shipped assertions in `test-v13.mjs` were written against the final behaviour rather than this plan's draft wording. |

---

## Code-review dispositions (round 2 — `v13-code-review.md` on commit `32f9c68`)

The code review returned **SHIP WITH FIXES** (no blocking findings; 41 of 62 assertions falsified
against the pre-v13 build by differential run). All items were applied:

| Finding | Disposition |
|---|---|
| **1 (MAJOR)** B12 was vacuous (`delta 0 && score 0` satisfies `delta × 50 === score`; the fixture's rival had `dx: 0, dy: 0` and self-destructed before the leech) | **Fixed.** Rival 0 now moves onto the player's head and rival 1 is one tile from the player's body. B12 asserts `delta === 2 && score === 100`. Differential: pre-v13 gives `delta 1, score 0`. |
| **2 (MAJOR)** B11 was a tautology (`typeof r.ate === 'boolean'`) | **Fixed.** Now asserts the flip's outcome — the rival takes the contested tile and grows by exactly one while the player's score stays 0. Differential: pre-v13 gives `score 10` (the player ate it). |
| **3 (MAJOR)** the gauntlet wave-*completing* tick gains an extra rival move, undocumented | **Documented** in AGENTS.md's accepted-changes list with the reasoning for not gating it (gating moves the objective check above the rival block and completes waves a tick earlier). |
| **4 (MINOR)** a Phoenix/streak relocation could credit a ram through the rebuilt, unfiltered tail body | **Fixed.** `resolveRivalRams()` now runs only on the plain-move branch; a teleport tick is a save, not a ram. |
| **5 (MINOR)** the 1-ply self-rejection was partial and over-claimed | **Fixed, both halves.** The code now retries the perpendiculars when every axis candidate is blocked (the previous fallback accepted a self-hit); AGENTS.md scopes the claim to the chase branch and to the alternatives-exist case; **G2** now pins it. |
| **6 (MINOR)** the `leech` descriptor over-claimed "destroy it" | **Fixed** — "steal 3 segments; destroys a drained rival". |
| **7 (MINOR)** `pickDraftOptions` could return an empty pool | **Fixed** — falls back to the unfiltered list when the filter empties it. |
| **8 (MINOR)** the three-state HUD had no assertion | **Fixed** — F5/F5b/F5c/F5d/F5e capture the rendered strings for all three states and assert they are distinct. The deferred `0.0s` display is documented in AGENTS.md rather than special-cased (a "held" string would flicker for one-tick deferrals). |
| **9, 10, 11, 13, 14 (NIT)** re-arm interval, unenforced argument, stale plan sentence, telegraph occupancy, loop-termination dependency | **Applied.** `rivalCombinedSnake()` now includes materialising rivals (so telegraphs cannot stack and food cannot spawn under one); a comment records why the update loop is single-`gameOver`; AGENTS.md notes the ~wind-up re-arm and that the second argument is mandatory by contract. |
| **12 (NIT)** the defeat toast can sit behind level-up/unlock toasts | **Noted** — existing `queueToast` semantics, consistent across the game; recorded for the running-game pass. |

---

## Reviewer round 3 (independent review of `32f9c68` + `e0873f2`)

Verdict was **do not merge yet**: two blocking findings, both in the collision contract, plus nine
advisories. Both blocking findings were reproduced by the leader before any change was made, and both
confirmed exactly as reported.

| Finding | Disposition |
|---|---|
| **BLOCKING 1** a shielded head-on **swap** paid a credited, rewarded kill (+1 defeat, +50 score) where the base build gave none. `si = 1` covers the head tile, but in a swap the rival's new head lands on the tile the player just left — `snake[1]`, the neck — so rule 2 scored the very contact rule 1 had already adjudicated and the shield had absorbed. | **Fixed.** New per-tick `rivalHeadContactIdx` (reset in the tick prologue, set in `checkPlayerDeath`'s segment loop) suppresses rule 2 for that rival. B13/B13b pin it; both fail on the pre-fix build with `delta 1, score 50`. |
| **BLOCKING 2** the leech counter still backfired against a **moving** rival — byte-identical to `e2851ac` — and B7 could not see it: its fixture used `dx: 0, dy: 0`, so the rival self-destructed during the update phase before the leech could run, and `state === 'playing' && rivalActive === false` was satisfied by that self-crash. | **Fixed.** The drain now resolves the contact when the player's head ends the tick on **any** surviving rival segment (not just the rival's head tile), which is the swap geometry. B7 gets a moving rival and asserts the drain itself (`grew === 3`, rival length 5 before); it fails on the pre-fix build with `gameover`. |
| **Advisory (condition)** the collision contract is correct but **unteachable**: `gameOver()` clears `rivals`, and one cause string covered both lethal geometries. | **Fixed.** The cause now distinguishes `'You charged the rival head-on!'` from `'You ran into the rival!'` (B14/B14b), plus a one-shot toast teaching the counterplay (B16). The descriptive form was measured at 323px against the fixed 320px recap card and reverted to the short form; B14c pins the width. |
| **Advisory 1** telegraph body could land on the primary food (5/800). | **Fixed** — the body loop now rejects `food`; D6 asserts 0/800 (fails pre-fix). |
| **Advisory 3** two telegraphs could overlap. | **Fixed** — the body loop now rejects sibling rivals (it already rejected its own body); the head tile respected `rivalCombinedSnake()`. |
| **Advisory 5** one HUD line meant a live rival masked a materialising rival's countdown for its whole window. | **Fixed** — the telegraph outranks the live length; F6/F6b assert both orderings. |
| **Advisory 7** the Phoenix/streak rebuild's two tail tiles are unfiltered (the same-tick skip was not enough). | **Fixed** — the rebuild stops before a rival segment; B15 pins it (fails pre-fix with `len 3, onRival true`). |
| **Advisory 6** a player who *follows* the telegraph suppresses the rival indefinitely (2000 ticks → 40 relocations, 0 activations). | **Documented** — AGENTS.md no longer claims camping cannot disarm the rival, and states the follower case and why it is accepted. |
| **Advisory 9** the crowded-board retry is ~4 ticks (~480 ms), not `RIVAL_WINDUP_MS`. | **Documented** with the measured figure. |
| **Advisory 8** `deferCount` is not snapshotted. | **Documented in code** — verified harmless: undefined-safe, the relocation cap still fires, and the rival can never activate inside the player. |
| **Advisory 2** the telegraph body can be ~3 tiles from the player (the 5-tile floor is the head tile). | **Documented** — AGENTS.md now scopes the floor to the head and gives the measured tail case. |
| **Advisory 4** the AI does not steer around obstacles (only the self half of the v4 `selfCollision \|\| obsCollision` rule was restored). | **Documented as a v14 candidate**, with the ~3-line option. Deliberately not implemented: the obstacle interaction is out of scope for this cycle, and the plan's disposition for it is a design statement, not an oversight. |
| **Evidence truth**: "249 assertions" (really 242 at that revision), the stale "41 fail pre-v13" figure quoted in an "evidence truth" commit, AGENTS.md's "62 assertions", the Daily draft claim, the Food-Generation caller mis-attribution. | **All corrected**, and the figures in THIS round are re-derived per the round-4 review rather than copied: at that revision the sweep was 252 / `test-v13.mjs` 78 / pre-v13 **53 fail / 21 pass**. Final figures after round 4 are in AGENTS.md. |
| **Test quality**: B5 could pass on a wrongly-destroyed-but-uncredited rival; D2 passed for any radius ≥ 0; D5 asserted hazard avoidance with `hazards = []`; F2 grepped source text and was the suite's entire sound coverage; G4 pinned an internal variable name. | **Fixed**: B5 also asserts the rival is alive; D2 samples the real 3-tile floor against the opt-in 5; D5 places a live rift and adds D5b; F2 is behavioural (intercepts `playSound`, asserts the tone fires at wind-up start and not at activation); G4 deleted. |

---

## Reviewer round 4 (`7e1824b`)

The leech fix from round 3 was **wrong** and was reverted. Blocking-1 (the shielded swap) was confirmed
fixed and per-rival; the evidence-truth corrections were confirmed; the teachability condition was
confirmed satisfied. One new blocking finding, reproduced before any change.

| Finding | Disposition |
|---|---|
| **BLOCKING** the round-3 leech fix turned a lethal contact into the best move in the game. Testing the player's head against the rival's **whole** post-drain body meant any charge resolved as a leech kill, because the leech window is the 3×3 box around the rival's head and the rival's neck is always inside it. Measured: swap-tile and one-turn-old-flank contacts became `{playing, delta 1, +50 score, +100 XP, +3 segments}` where base kills the player. | **Reverted to the head-tile comparison.** Differential across four geometries now matches base exactly (death/delta 0 on the swap and the one-turn-old flank; survive+credited on the true same-tile head-on; drain-only when merely adjacent). The +50/+100 reward on the genuine kill is the only intended difference. |
| **BLOCKING (test)** B7 encoded the violation as expected behaviour and would have failed the moment it was fixed. | **Rewritten** as a three-geometry contract (swap → dies, same-tile → destroyed and credited, adjacent → drain only) with the credit delta asserted, so it can no longer pass on a rival that dies uncredited. Both swap assertions fail on `7e1824b`. |
| **Advisory** the cause classifier's clause (ii) used the rule-2 body-ram predicate to label a rule-1 player death, so ~7.4% of "head-on" deaths were mislabelled and the `ram its SIDE` toast fired on deaths that were already a side ram — a worse lesson than the generic string. | **Fixed.** A head-on is now the rival's head on the player's **head**, or on the tile the player just **vacated** (the swap). Verified: a constructed body-ram-with-a-stray-rival-head death reports the flank cause while a genuine head-on reports the charge cause. |
| **Advisory** stale figures in round 3's own dispositions (251/77/53-20) plus a quoted cause string that is not in the code. | **Fixed**, and the numbers are now re-derived per round rather than copied forward. |
| **Advisory** coverage gaps: sibling-telegraph rejection untested; the one-shot teach toast untested (string, once-only, persistence key); B7 asserted no credit delta. | **Fixed** — D7 (400 spawns, 0 overlaps), B16/B16b/B16c (fires once with the SIDE wording, silent on a later death, flag persists), and B7 now asserts the delta. |

---

## Reviewer round 5 (`345ebfa`)

The revert and the classifier fix were confirmed clean (0/115 mislabels; 258/84 green; the suite fails
exactly 2 against `7e1824b`). One residual divergence remained, phase-dependent, and it was fixed rather
than documented.

| Finding | Disposition |
|---|---|
| **Residual** the leech's early-removal clause fired on a tick when the rival did NOT move (its cadence stride skipped, or a real freeze). A stationary rival keeps its head on the tile the player charges into, so `wrappedHead === rHead` was true, the drain left ≥2 segments, and the player survived with a credited, rewarded kill where the base build kills them. Measured 16 occurrences in ~78k ticks, and it flipped on the rival's invisible `moveCounter` — the same phase-dependent texture as JC's original report. | **Fixed.** New per-rival `movedThisTick`, reset for every rival in the tick prologue and set in `updateRival` when the move is committed; the clause is now gated on it. Reproduced first (skip, freeze, and the moving-convergence contrast), then verified: skip and freeze now both give `gameover, delta 0` exactly as the unbrewed player gets, while the moving convergence still pays. Justification recorded in code and AGENTS.md: when the rival moved, its pre-move body cannot hold its new tile (that would be a self-hit), so base survived the charge too — the removal was always base-consistent and only the reward is new. |
| **Doc** AGENTS.md claimed "base parity across the four geometries is pinned by the B7 family" — false for the stationary shape, since B7's `same` geometry uses a moving rival. | **Corrected** — the four pinned geometries are now named individually, with an explicit warning not to read B7 as covering the stationary case. |
| **Doc** the pre-v13 differential was 55/25, not 56/24. | **Corrected and re-derived** (now 57/26 for 87 assertions; run twice, consistent). |
| **Nit** the classifier cannot distinguish "I charged it" from "it charged me" in a mutual perpendicular convergence. | **Documented as a deliberate non-fix** in AGENTS.md: both actors moved into the same previously-empty tile, neither string would be right, and the actionable advice is identical. |
| **Nit** the leech descriptor's "sharing your tile" did not cover the convergence. | **Reworded** to "destroys a rival that steps onto your tile", which is now literally accurate given the `movedThisTick` gate. |
| **Confirmed** the reviewer retracted their round-4 suggestion (pre-move-head comparison) as carrying the same hole. | Noted — the post-move `rHead` comparison is the correct one and is what the code uses. |

---

## Reviewer round 6 (`543f3db`)

The `movedThisTick` gate was sound but **over-reached**: it wrapped BOTH disjuncts of the leech's
removal clause, and base's `length <= 1` clause is unconditional. That removed a base rescue.

| Finding | Disposition |
|---|---|
| **BLOCKING** the gate suppressed clause 1, so a frozen (or stride-skipping) rival of length <= 4 drained to nothing now killed the player with the drain already applied — base removes the rival and the player lives. Measured across the lengths: base `playing def 1` at len 2/3/4, `gameover` at len 5+, while the shipped build gave `gameover` on all five. Reachability in review: 6 of 13 hoards had an active rival of length <= 4, 46% of hoard ticks. | **Fixed** — the gate moved to the head-equality disjunct only. Verified against base across five lengths and every stride phase: `playing def 1` (clause 1, = base) at len 2/3/4, `gameover def 0` (= base) at len 5/6, all skip-tick rows `gameover` (= base), moving convergence `def 1 +50` (the intended reward), swap `gameover`. |
| **Advisory** B17 could not catch it: every fixture used a length-7 rival, where the drain leaves 4 and clause 1 is unreachable by construction. | **Fixed** — new **B18/B18b/B18c**: a frozen length-2/3/4 rival drained to nothing is removed (not a death), and the length-6 contrast asserts the boundary. Falsified by re-introducing the over-suppression: B18/B18b fail, B18c still passes. |
| **Advisory** two contradictory bullets in AGENTS.md asserted both the gated and the ungated rule. | **Folded into one** bullet that states both clauses, which one carries the gate, why, and that gating clause 1 is a regression. |
| **Nit** the differential figure is non-deterministic (56/27, 56/27, 57/26, 55/28 measured in review). | **Fixed at the source, not by wording.** The variance was D5b and D7 — single-sample and 400-sample spawn fixtures on live randomness, which can pass by luck on a build where the predicate does not exist. All three spawn-loop fixtures (D5/D6/D7) now pin `seedPrng` with `mulberry32`. The differential is **56 fail / 30 pass with an identical pass/fail set across 8 runs**, and the current build is identical across 6 runs. |
| **Nit** the descriptor's "steps onto your tile" covers clause 2 only. | **Fixed** — "destroys a drained rival or one stepping onto you" covers both clauses. (The brew panel is plain DOM and wraps; only canvas text has the fixed-width constraint.) |

---

## Reviewer round 7 (`951b88e`)

Production was confirmed unfalsifiable: a 47-row sweep (every rival length 1-20 x every stride phase,
plus freeze/hoard/swap/convergence/shielded-swap/rule-2) differs from base on **only the 2 intended
contract changes**, the differential is deterministic at 30/56 across 8 runs, and B18 falsifies correctly
against the over-suppressed build. The findings were all in the tests and one descriptor.

| Finding | Disposition |
|---|---|
| **ADVISORY** D5 was vacuous: `extraFoods = []` sat under a comment promising a flooded board, so `extraFoods.some(...)` was `false` by construction on every build. | **Fixed.** Rewritten as a multi-sample loop (300 spawns) over a board scattered with 20 extra foods and 6 on-phase rifts. Mutation-verified: deleting the `extraFoods` and hazard rejections from BOTH spawn loops now yields `onExtra 48, inHazard 87` and fails; with the predicates present, 0. |
| **ADVISORY** D5b did not discriminate: its pinned single sample placed the rival 180 tiles from the rift, so the hazard predicate could not matter. | **Fixed by the same rewrite** — the rift check now runs over 300 spawns with 6 rifts. The predicate itself was already sound (review measured 0/2000 leaks on the current build vs 121/2000 with it deleted), so this was purely an assertion-quality fix. |
| **NIT** the descriptor over-claimed: only a drain to <= 1 segment destroys the rival, and measured over a diagonal-adjacency drain **8 of 12 (67%) leave it alive**. | **Fixed** — "destroys a rival drained to nothing, or one stepping onto you". Both halves are now stated, and AGENTS.md records the measured split so the next editor does not re-shorten it. |
| **Lesson** — the reviewer's observation that all three rounds' blind spots were single-axis sweeps. | **Recorded in AGENTS.md's Verification Notes:** a single-sample fixture is not an assertion; the test is mutation (delete the predicate, confirm the assertion fails). Multi-sample loops with a pinned `seedPrng` are the shape that discriminates. |

| **Also found by auditing the same pattern** C4b passed for the wrong reason: its fixture placed the materialising rival's head on the player's HEAD tile (si=0), which rule 1 owns and `si = 1` skips anyway — so removing the `!active` guard in `resolveRivalRams` left it green. The credit was separately suppressed by `removeRival`'s `wasActive` check, so `delta === 0` could not observe it either. | **Fixed.** C4/C4b now place the rival BOTH on the destination tile and on the player's NECK (si >= 1) and assert the telegraph's body survives intact, which is the observable that proves inertness. Verified: with the `!active` guard deleted, `onBody.len` collapses to 0 and C4b fails. |
