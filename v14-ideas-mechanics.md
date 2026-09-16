# Snakes v14 — Gameplay-Mechanics Ideation

> Lens: core game feel, the rival system, food/economy, difficulty curve, power-ups/mutators/brews,
> and what is mechanically unsatisfying or unfair in the current build.
> Baseline: `feat/v14-cycle`, `snake.html` 9675 lines. Every factual claim below is cited to
> `snake.html:LINE` or measured live (three Playwright probes, run via `test-helpers.mjs`, then deleted;
> harness smoke `node test-harness-smoke.mjs` = 4/4 green first). Unverifiable claims are marked
> [INFERENCE].

## 0. Re-verification of the v13 backlog (measured in the live build)

| # | Backlog claim | Verdict | Evidence |
|---|---|---|---|
| 1 | Rival AI does not steer around obstacles | **CONFIRMED** | Probe: rival head crossed a solid obstacle tile (`crossed:true`, head 340,220 past obstacle 300,220). `updateRival` (3465-3643) never reads `obstacles` — the only body-build reads are `spawnRival`'s occupancy scan (3420, 3434). AGENTS.md documents immunity as deliberate; the legibility cost is real (the rival materialises out of walls). |
| 2 | Rival eating food emits no cue | **CONFIRMED** | Probe: driving `updateRival(0)` onto a food tile → `sounds: []`, `toasts: []`, `particlesDelta: 0`, `floatersDelta: 0`, food regenerates silently (eat block 3594-3632 contains no `playSound`/`queueToast`/`spawnParticles`/`spawnFloater` — grep confirmed). The player cannot tell they lost the race. |
| 3 | findFreeTile / findPortalTile / snapToFreeTile use three occupancy sets | **CONFIRMED** | `findFreeTile` (3265) is options-driven; `findPortalTile` (2189-2225) scans snake/obstacles/food/food2/powerUpPickup/extraFoods/hazards with NO rival check; `snapToFreeTile` (2228-2233) checks snake/obstacles/active-rivals only. A portal twin can land on a rival's body tile today. |
| 4 | Rival immune to hazards | **CONFIRMED** | Probe: rival head lands at (280,80) inside an on-phase rift (centre distance ≤ radius) — `rivalActive: true`, unharmed. Same tile kills the player (`playerSameTileWouldDie: true`, `isHazardCollision` predicate, AGENTS.md v10 C). |
| 5 | Mode-select clips its own text | **CONFIRMED, wider than recorded** | Probe at 13px: classic **416.2px**, walled **414.8px**, painter **552.7px**, gauntlet **517.4px** — canvas 440px (`CANVAS_WIDTH`, draw at 5248, centred, no clip). **classic and walled also overhang (440−416.2)/2 ≈ 11.9px each side** — the backlog's "only painter/gauntlet" is corrected: 4 of 8 descriptions clip. |
| 6 | Persisted Best is pre-cascade, recap headline post-cascade | **CONFIRMED** | Probe: score 100, 2 mutators → `bestAfter: 50` written by `updateScoreDisplay` (2477-2485, called from `addScore` 2034 mid-run at RAW score), while `finalizeSession`'s post-cascade write (3757-3760) loses (`50 > 50` false). Recap card reads `score=50`, `raw=100`, `cascade=0.5`. The "Best" line and the card disagree by exactly the cascade factor. |
| 7 | double_rival rivals can overlap; head colour shared | **PARTIALLY CONFIRMED / CORRECTED** | Probe: two rivals driven 40 ticks with identical PRNG stay at distinct tiles here ([360,300] vs [280,180]) because `spawnRival` now separates them and v13's sibling-rival body checks (3430-3431) run — the *overlap* claim is **no longer reproducible by this geometry**; overlap under `double_rival` remains possible only via per-rival stride desync crossing, which I could not force in 40 ticks [INFERENCE: residual, rare]. The colour claim is **CORRECTED**: rival 0 body `#B71C1C`, rival 1 body `#AD1457` (spawnRival 3378), heads BOTH `#FF5555` (drawRival 6121, 6140) — the *head* colour is shared between both rivals, exactly as recorded. |
| 8 | gameOver() clears rivals before the death frame | **CONFIRMED** | Probe: `rivalBefore: 1 → rivalsAfter: 0`; `rivals = []` at 3790 sits before the death frame draw (3856-3858). The screen that killed you shows no rival. |

Cadence stride re-verified live: len 6→60 moves/60 ticks, 7→30, 13→30, 14→20 — matches AGENTS.md's
stride 1/2/3 at lengths ≤6 / 7-13 / ≥14 (`RIVAL_CADENCE_MID=7` L1237, `RIVAL_CADENCE_LONG=14` L1238).
Snapshot rival fields round-trip with `color` (build 2911, restore 3087).

## 1. NEW mechanical findings (not on the backlog)

### N1 — The draft screen can offer a 2-card pool and the picker's mod arithmetic is fine, but Zen+cascade can deal `[]` [CLOSED]
v13's review Finding 7 flagged `pickDraftOptions` returning an empty pool; the shipped build already
carries the fix (`if (!pool.length) pool = unlockedMutators.slice();` at 6803-6804). Verified by read.
No action.

### N2 — The rival is a ghost to HAZARDS but the player's cue vocabulary treats hazards as universal
(covered by #4 above — the *player-facing* asymmetry is the point: dashed amber ring = "danger" for
one actor, decoration for the other.)

### N3 — The portal twin can spawn on a rival's body tile
`findPortalTile` (2189-2225) rejects snake/obstacles/food/food2/powerUpPickup/extraFoods/hazards but
never `rivals`/`rivalCombinedSnake()`. An epic eaten through its twin teleports the player via
`snapToFreeTile` (2228), which *does* check active rivals — so the entry tile is vetted and the exit
tile is vetted, but the twin's own resting tile can sit under a live rival and be eaten *through*
the rival's body tile. Minor, but it is the same "occupancy set inconsistency" family as backlog #3
and is a one-line fix.

### N4 — `resolveRivalRams` runs only on the plain-unshift branch (7743-7751)
On a teleport-save tick the call is skipped by design (7747-7749 comment) — documented, fine. But the
plain branch calls `resolveRivalRams()` (7751) with **no `gameState === 'playing'` re-check between
the unshift and the call**. On the tick the player dies via rule 1, `checkPlayerDeath` returns before
the unshift, so this is unreachable today — [INFERENCE: no live path], no action.

### N5 — The rival's body tail can land ~3 tiles from the player (documented) — but its HEAD is the only
part `RIVAL_MIN_SPAWN_TILES` protects (spawnRival 3392-3397 lays the body with occupancy only).
Already documented in AGENTS.md; reconfirmed by read. Candidate for a body-tail separation bump
(cheap: pass `minTiles` to the body scan too), but the 1.6 s wind-up makes it survivable today.

### N6 — Bomb food trims the rival but the rival eating food is silent (backlog #2) — the fix lands
in the *same* eat block (3594-3632), so they share one code review.

### N7 — v13's leftover: the gauntlet wave-completing tick still gives the rival one extra move
Documented as accepted (AGENTS.md "Accepted Behaviour Changes"). Re-verified by read of the gate
structure — no live probe (v13 code review measured it differentially; the gate structure at
7183-7185 is unchanged). Deliberately not re-litigated.

## 2. v14 theme

**"The board is a place, not a backdrop."**

v13 made the rival fair and legible; what is still missing is *the board participating in the
contest*. The rival phases through obstacles and hazards (probes B1/B4), the food economy has no
rival-presence cue (probe B2: zero particles/floaters/sounds/toasts on a rival eat), the portal twin
ignores the rival (N3), and the difficulty curve is a straight speed ramp with no texture
(`getSpeed()` 1974-1978: −5ms per 50 score, floored at 50). v14 should make the arena itself
express rules that both actors obey, so every object on the board means the same thing to everyone
on it. This is mechanically cheap (occupancy-set unification is mostly deletion-plus-one-predicate),
synergises with the legibility work of v12/v13, and does not reopen any v13 decision.

## 3. Ideas (scored 1-5; I = impact, F = feasibility, R = risk (higher = riskier), S = synergy)

### Idea A — Give the rival an eat cue (backlog #2) — **I 4 / F 5 / R 1 / S 5** (~8 LOC)
**Basis:** measured — a rival eat produces 0 sounds, 0 toasts, 0 particles, 0 floaters (probe B2/B2b);
the eat block is 3594-3632.
**Change:** in the eat block, after `generateFood` succeeds: `spawnParticles(food.x, food.y, 8,
r.color)`, `spawnFloater(food.x, food.y, 'rival', '#FF8888', 12, 0.8)`, and a short `playSound`
(reuse `'eat'` pitched down or a new quiet case). No snapshot fields. Calm-mode gate on the particles
per the v8 B pattern.
**Goes wrong:** too loud a cue teaches the player to track the rival obsessively; keep it quieter
than the player's own eat cue. The floater must not collide with the player's own '+10' floater
geometry (same tick, different tile — fine).

### Idea B — Rival steers around obstacles (backlog #1, the recorded ~3-line change) — **I 3 / F 5 / R 2 / S 4** (~6 LOC)
**Basis:** probe B1 (head crossed a solid tile); the 1-ply filter already exists for the chase branch
(bodyHit at 3540-3555); adding `obstacles.some(...)` to that predicate and to the perpendicular retry
is the recorded candidate.
**Decision needed:** keep hazard immunity (rifts pulse — steering there changes the design statement)
but steer around *solid* obstacles. The fallback (`safe.length === 0` → take the blocked move)
already exists, so a walled-in rival self-crashes uncredited — no v4 trap-rule reintroduction.
**Goes wrong:** obstacle-aware steering on a crowded late-game board makes the rival stall
(oscillating between two blocked axes); the perpendicular retry plus the existing "food directly
astern" fallback (3518-3528) covers most of it — probe the oscillation case before shipping.

### Idea C — Hazard symmetry for the rival (backlog #4, the ~8-line fix) — **I 4 / F 4 / R 2 / S 4** (~10 LOC)
**Basis:** probe B4b (rival sits in an on-phase rift unharmed; the same tile kills the player).
**Change:** in `updateRival`'s post-move section, if the rival's new head is inside an on-phase rift
*and* `rivalFreezeMs <= 0`, `removeRival(idx, false)` with a small particle puff. This is the fix
that makes the dashed-amber-ring vocabulary honest for both actors. It does NOT reintroduce the
trap-rule (the rival can still cross an *off*-phase rift safely, and the pulse cycle is the
telegraph).
**Goes wrong:** a rival standing on a rift tile at the moment of ignition dies without the player
touching it — that is correct behaviour (the player can now herd a rival into a rift, which is a NEW
counterplay tool and a good one), but credit must stay `false` (the player did not ram it).

### Idea D — Portal twin spawns off the rival (N3 + backlog #3 consolidation, scoped) — **I 2 / F 5 / R 1 / S 3** (~3 LOC)
**Basis:** read of 2189-2225 (no rival check) vs `snapToFreeTile` 2228-2233 (active-rival check).
**Change:** add `if (rivalCombinedSnake().some(...)) continue;` to `findPortalTile`. Do NOT attempt
the full three-occupancy-set consolidation this cycle — `findFreeTile`'s options object is load-bearing
for the five save/obstacle callers (AGENTS.md v13), and consolidating it is a separate project.

### Idea E — Post-cascade Best parity (backlog #6) — **I 3 / F 4 / R 2 / S 3** (~10 LOC)
**Basis:** probe B6 (best 50 vs recap 50-from-100-raw — the persisted Best is pre-cascade);
`updateScoreDisplay` 2477-2485 writes mid-run; `finalizeSession` 3757-3760 writes post-cascade but
`>` never wins.
**Change options:** (a) at `gameOver`, after the cascade multiply, write the *final* score back over
the mid-run Best when it is higher (one 3-line block); or (b) suppress the mid-run write for modes
with a cascade and write only at finalize. (a) is safer: it preserves the live "NEW BEST!" toast
(2482-2485) which (b) would delay to session end.
**Goes wrong:** daily mode's leaderboard (`snake_daily_lb`, 3762-3769) already records the post-
cascade score in `finalizeSession` — after (a) the two surfaces agree, which is the point. Do not
touch `isNewBest` in `buildRecapData` (3907-3909) — it correctly uses the start-of-run best.

### Idea F — Mode-select clip fix (backlog #5, corrected scope) — **I 2 / F 5 / R 1 / S 2** (~5 LOC)
**Basis:** probe B5 — 4 of 8 descriptions exceed 440px (classic 416.2, walled 414.8, painter 552.7,
gauntlet 517.4). The help overlay already ellipsises via `fillTextClipped` (4866-4869); the
mode-select draw at 5248 does not.
**Change:** reuse `fillTextClipped` at 5248 (it exists, it is the established pattern, the full text
stays for `srSpeak` at 9085/9094/9562). Zero new geometry decisions.
**Goes wrong:** clipped mid-sentence is still information loss; pair with a short-form mode desc for
painter/gauntlet (two `descs` entries) so the ellipsis rarely fires.

### Idea G — Rival eat → board reaction (Pressure Cooker generalisation, NEW) — **I 3 / F 3 / R 3 / S 4** (~15 LOC)
**Basis:** the Pressure Cooker resonance (`rivalShrink`, 3624-3630) already proves "the rival's meal
moves the board" is implementable and shipped; today that consequence is locked behind a 2-mutator
draft.
**Change:** with the eat cue from Idea A in place, make a rival's 5th consecutive eat (per-materialising
life) spawn ONE extra food adjacent to the rival's tail — the rival "earns" a small hoard, visibly.
This gives the player a reason to race the rival to a food *and* a reason to deny it, without any new
currency (the out-of-scope rule). Tick-counted counter, additive snapshot field.
**Goes wrong:** extra foods on the board raise the board-full risk for `generateFood` (the guard at
2103 already handles `extraFoods.length`); the counter must reset in BOTH `resetGame()` and
`resetWaveState()` and live in the snapshot additively. [INFERENCE: balance untested — needs a
playtest pass.]

### Idea H — Death-frame rival persistence (backlog #8) — **I 2 / F 4 / R 1 / S 2** (~4 LOC)
**Basis:** probe B8 (`rivals` 1→0 across `gameOver`); `rivals = []` at 3790.
**Change:** move the clear to *after* the death-frame draw (3856-3858), or keep a frozen
`deathRivals` copy for the recap frame only (visual array, rAF-only, reset in `resetGame()`).
The recap card already names the cause; this makes the *screen* agree with it.
**Goes wrong:** `rivals` is read by `drawGame` on later frames (idle/menu redraws) — the copy must be
frame-scoped or the dead rival will ghost into the idle screen. Prefer the post-draw clear.

### Idea I — Cadence stride shown on the HUD length readout (NEW, tiny) — **I 2 / F 5 / R 1 / S 3** (~3 LOC)
**Basis:** `drawRivalHUD` (6421-6438) prints `Rival: N` with no cadence hint; the stride boundaries
(7/14) are invisible to the player, yet stride is the one balance lever v13 shipped.
**Change:** `Rival: N ×½` / `×⅓` suffix at length ≥7/≥14. Zero new state (reads `r.snake.length`).
**Goes wrong:** HUD width; the string is short. This is the cheapest possible "the rival is
understandable" win.

## 4. Top 3 + build order

1. **Idea A (rival eat cue)** — smallest diff, highest felt-impact per line; it converts the rival
from a silent food thief into a readable competitor, which is the v14 theme's core claim. ~8 LOC.
2. **Idea C (hazard symmetry)** — the cue vocabulary becomes honest; unlocks herding counterplay.
~10 LOC, gated on `rivalFreezeMs <= 0`, credit stays `false`.
3. **Idea B (obstacle steering)** — completes "the board constrains the rival" with the solid layer.
~6 LOC with the existing fallback; needs the oscillation probe before shipping.

Build order: **A → C → B**. A is independent and testable alone (assert zero-cue before, cue
after). C changes removal semantics (new `removeRival(idx, false)` call site) and must ship before
B so that a rival dying to a rift is not confused with a rival dying to a blocked move. B last —
it has the widest behavioural surface (every chase tick on an obstacle board) and benefits from A+C's
cues being in place so the player can *see* the steering.

Deferred (good ideas, wrong cycle): E (Best parity — real but is a meta/UX surface, the legibility
agent's lane), G (rival hoard — needs balance playtest), D/F/H/I (small, bundle wherever there is
room; F is arguably the legibility agent's finding — it is recorded here for completeness with the
corrected 4-of-8 measurement).
