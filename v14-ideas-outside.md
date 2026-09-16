# Snakes v14 ideation — outside-view lens

Agent: ShyMuskox (read-only + throwaway probes; probe processes deleted, repo untouched except this file).
Method: full re-read of AGENTS.md / v13-code-review / v13-impl-review / both v13 idea reports; all 13 suites re-run (§1); seven live Playwright probes against the running game (outputs pasted). Line cites are the working tree (snake.html, 9675 lines, branch feat/v14-cycle).

## 0. Harness check

`node test-harness-smoke.mjs` → 4 passed, 0 failed (ran first, before any probing).

## 1. Test-suite truth (measured)

Full sweep, real runs:

| suite | assertions |
|---|---|
| test-bugfixes 18, test-bughunt 10, test-evolution 11, test-feature-d 14, test-gameloop 1, test-gameplay 5, test-harness-smoke 4, test-quests 21, test-v10 12, test-v11 14, test-v12 45, test-v13 96, test-v9 19 | TOTAL 270, all green |

- Brief says 270 across 13 suites — matches exactly.
- v13's two vacuous assertions are REPAIRED, not open. B11 now asserts the real flip (rival length +1, score 0; test-v13.mjs:853-855) and B12 asserts delta === 2 && score === 100 on a two-removal fixture (:887-888). Code-review Findings 1/2 fixes landed.
- The F5 three-string HUD assertion exists (:1428-1435) including a distinctness check F5e — Finding 8's "no test" half is closed.
- Remaining weak assertions found (new, medium severity):
  - test-v12.mjs:619-637 (C3): asserts `lastSaveEvent !== undefined && lastSaveEvent !== undefined`, then hand-assigns strings into the field and reads them back. It cannot fail on any build that declares the variable — it is today's B11. The title claims "exactly 7 of the 18 lastDeathCause writes are saves"; nothing in the body counts writes.
  - test-bugfixes.mjs:98-102 (B3): `typeof startGame === 'function'` existence checks — smoke-only, cannot catch any behaviour regression.
  - test-v11.mjs:202-206 and test-v10/v11 symbol probes assert `src.includes('0.30')` / `typeof x === 'undefined'` — source-substring assertions; they pass on any build that still contains the substring, regardless of behaviour. v13's own verification notes call this class out; survivors remain.
  - test-feature-d.mjs:70-73: `typeof f.spawnTime === 'number'` — a tautology once v7 D1 landed; the field is set unconditionally in generateFood.
- The 0.0s HUD and the extra gauntlet move are DOCUMENTED accepted behaviour, not open defects: AGENTS.md:121-122 record both. Re-verified the code: rival block at snake.html:7231-7235 sits above the four objective returns at 7293-7310; drawRivalHUD (6421-6455) renders windupLeft, which a deferral holds at one tick. v14 may only reopen them with a reason.

## 2. Backlog re-verification (measured where cheap)

| # | Item | Verdict |
|---|---|---|
| 1 | Rival does not steer around obstacles | CONFIRMED (probe). Rival at x=0 heading +x, obstacle wall across the row → head walked 0→380 straight through 9 obstacle tiles, active:true. AGENTS.md:126 documents it as the v14 candidate. |
| 2 | Rival eat emits no cue | CONFIRMED. The eat block (snake.html:3594-3630) contains zero calls to playSound/queueToast/spawnParticles/spawnFloater/srSpeak (grep over 3594-3645: zero matches). The food vanishes; the player only sees the HUD length tick up. |
| 3 | Three occupancy sets | CONFIRMED + one NEW hole. findFreeTile (3265-3322): snake/obstacles/food/rivalCombined (+avoidExtras). findPortalTile (2189-2215): NEVER checks rivals at all — a portal twin can materialise on a live rival's body (uncollectable-without-death). snapToFreeTile (2216-2231): only snake/obstacles/ACTIVE rivals — ignores a materialising telegraph's tiles (rivalCombinedSnake includes them, 834-840), and ignores food/food2/hazards/extraFoods. |
| 4 | Rival immune to hazards | CONFIRMED. isHazardCollision (4192-4202) has exactly one caller: the player path (7544). No hazards test anywhere in updateRival (3465-3640). |
| 5 | Mode-select clips its text | CONFIRMED, and AGENTS.md:514 already records it as a known pre-existing with the measured overhangs; drawOverlay snake.html:5248 draws getModeDesc(mode) centred at 13px with no clip, while the help overlay (4869) uses fillTextClipped. Deliberately deferred — a v14 candidate with a wrap decision. |
| 6 | Best vs recap disagree | CONFIRMED (probe). With cascade live (2 mutators, score 500): updateScoreDisplay persisted best=500 (pre-cascade raw, 2478-2481), finalizeSession write (3749-3751) never wins, recap shows score=250 / rawScore=500. Persisted "Best: 500" vs recap "250". |
| 7 | Two rivals overlap + shared head colour | CONFIRMED (draw code). Both rivals' heads painted #FF5555 (6121, 6140); bodies #B71C1C/#AD1457 (3377). During play they ignore each other's bodies (updateRival tests only its own body, 3580-3584); only spawn-time placement respects sibling occupancy (3445-3446). |
| 8 | gameOver clears rivals before the death frame | CONFIRMED. rivals = [] at 3781, before the recap/death-fragment draws (3834/3849). |
| — | leech descriptor over-claim | RESOLVED in v13 — descriptor now truthful (snake.html:1116: "destroys a rival drained to nothing, or one stepping onto you"); AGENTS.md leech section matches. Do not reopen. |
| — | double_rival draftable where it can't spawn | RESOLVED — rivalEnabledInMode (3346-3348) + pickDraftOptions filter, AGENTS.md:129. |

## 3. New findings (outside the gameplay/legibility lens)

- N1 — AGENTS.md drift (3 verified sites):
  - AGENTS.md:161 claims the H-key toggle "has no gameState guard" — false: snake.html:9277-9288 guards `if (gameState !== 'idle') return;`. The documented hazard was fixed and the doc kept the fear.
  - AGENTS.md "Dual Render Loops" (top section) still says a setInterval (50-120ms) drives updateGame(). The loop is the setTimeout chain (281-290); the only setInterval left (1094) drains the screen-reader queue. The corrected "Game Loop" section contradicts the older one in the same file.
  - AGENTS.md:169's duplicate-`case 'combo_milestone'` note: only one case exists now (snake.html:4343). Historical note, but it cites line numbers that no longer resolve.
- N2 — findPortalTile's missing rival check (backlog-adjacent, new): epic spawn → portal twin can land on a live rival's body. Severity low (the rival moves off it) but it breaks the "collect both" contract of portal food.
- N3 — snapshot surface is large and the additive-only discipline is holding: buildSnapshotObject has 91 keys (probe). Rival round-trip probe: 8-segment rival + moveCounter 8 restored exactly (restoredLen 8, restoredMc 8). No gaps found; v14 features should keep costing zero snapshot fields wherever possible (the telegraph's reuse-existing-fields pattern is the model).
- N4 — gauntlet wave 1 has rival: false (GAUNTLET_WAVES, snake.html:851-855): the rival only exists in waves 3-5. Rival-legibility work disproportionately pays off in the last half of gauntlet — worth knowing when prioritising.
- N5 — stride-2/3 rivals can sit still for multiple consecutive ticks near cadence boundaries: probe with a length-1 rival (stride 1) showed consecutive no-move ticks mid-sequence (positions 300,300 for 6 straight calls with a +x direction). [INFERENCE: this is the AI re-rolling into the blocked/zero-progress axis each call; the cadence skip alone does not explain it at stride 1.] Not a defect per se, but a HUD that promises "Rival: 1" while the rival visually stalls for several ticks is part of the legibility residue.

## 4. Theme proposal

**"Symmetry: make every invisible event visible, and every visible claim true."**
v13 made the rival legible when it arrives and dies. The remaining blind spots are (a) symmetric events the player experiences but cannot read — the rival eating, a portal twin colliding with a rival, the rival driving through obstacles, the best-score arithmetic — and (b) the evidence layer: tests that cannot fail and docs that describe already-fixed bugs. Everything below is additive, localStorage-only, no new panels, no SNAPSHOT_VERSION bump.

## 5. Ideas (scored 1-5; I = impact, F = feasibility, R = regression risk)

**V1 — Cue on the rival eating food** (backlog #2, CONFIRMED). ~8 LOC at snake.html:3594: spawnFloater('rival ate!', '#FF8888') + small particle puff + reuse an existing sound case (no new pitch needed); optional srSpeak. I5 F5 R1. Wrong if: too noisy under double_rival — throttle to one floater per tick. Synergy: makes B11's food race readable to a human, not just a test.

**V2 — Rival steers around obstacles (1-ply)** (backlog #1, CONFIRMED). ~4 LOC in the chase-branch filter (3514-3535): add an obstacles test to bodyHit, keep the existing fallback. I3 F5 R2. What could go wrong: re-introduces the v4 trapped-rival rule in miniature — a rival walled in by obstacles plus its own body takes the blocked move and self-destructs uncredited (documented accepted behaviour); AGENTS.md:126-127 must be rewritten either way. Hazards stay separate (V3).

**V3 — Hazards kill the rival** (backlog #4, CONFIRMED). ~8 LOC after 3590: `if (isHazardCollision(newHead)) { removeRival(idx, false); return; }` gated on rivalFreezeMs <= 0. I4 F5 R2. Risk: a rift becomes a free rival-removal tool — mitigated by uncredited (matches self-crash semantics) and the rift being lethal to the player too, so baiting is real counterplay, not farming.

**V4 — One occupancy predicate** (backlog #3 + N2). ~30 LOC: extract tileOccupied(x, y, {forSpawn|forPortal|forSave}) used by findFreeTile/findPortalTile/snapToFreeTile; closes the portal-twin-on-rival hole. I3 F3 R3. Risk: findFreeTile's legacy boolean form is load-bearing for five save callers (AGENTS.md documents this); the legacy path must byte-for-byte preserve today's set — differential-test with the existing D5/D6/D7 spawn fixtures.

**V5 — Best-score timing fix** (backlog #6, CONFIRMED by probe). ~10 LOC: updateScoreDisplay (2477-2495) stops writing modeHighScores (display only, no persist, no toast); the NEW-BEST toast + persist move to finalizeSession post-cascade (3749). I3 F4 R2. Careful: sessionModeHighStart (2633) and buildRecapData's isNewBest (3907-3909) read the pre-cascade best deliberately — keep that; only persistence timing changes. Probe after: mid-run HUD best stays stale until session end by design.

**V6 — Per-rival head colour** (backlog #7). ~2 LOC: drop the shared `#FF5555` head (6121, 6140), brighten body per rival instead. I2 F5 R1. Pairs with any double_rival legibility work.

**V7 — Rival visible on the death frame** (backlog #8). ~10 LOC: in gameOver() move the `rivals = []` clear after the first drawGame(1) (3781 vs 3849), or capture the rival bodies for drawRival to render once. I3 F3 R2. Risk: the death frame currently relies on rivals=[] for the update-loop exit invariant noted at 7229-7231 — only the array-clear position moves, not the loop guard.

**V8 — Test-truth pass** (v13-review class). 0 prod LOC, ~40 test LOC: rewrite test-v12 C3 as a behavioural assert (drive a real save branch → recap split), replace test-bugfixes B3 and test-feature-d spawnTime existence checks with value/behaviour asserts, re-derive the pre-v13 differential figure for the shipped suite. I4 F5 R1. Cheapest insurance in the cycle.

**V9 — AGENTS.md drift sweep** (N1). 0 prod LOC: fix the H-key claim (AGENTS.md:161), the Dual Render Loops setInterval text, the stale playSound note, and cite-check the remaining ~Lxxxx refs. I2 (future-reader impact) F5 R1.

**V10 — Mode-select text wrap** (backlog #5). ~15 LOC: short-form descriptions on the mode-select screen (the help overlay already ellipsises cleanly). I2 F4 R1. AGENTS.md:514 explicitly deferred it "for a later cycle" — this is that cycle.

## 6. Top 3 + build order

1. V1 rival-eat cue — highest impact per line, pure additive, no state. Lands the theme with one visible change.
2. V8 + V9 truth pass — do it second, while no production changes are in flight: fix the C3/B3/feature-d tautologies and the doc drift, so the rest of the cycle is built on assertions that can fail.
3. V2 + V3 board-constraint symmetry — one commit: obstacles steered, hazards lethal (both gated exactly as AGENTS.md documents), with the v4-trapped-rival caveat recorded in the accepted-changes list.

Build order: V8/V9 (evidence) → V1 → V6/V7 (low risk) → V2+V3 → V4 (predicate consolidation, needs the spawn fixtures green) → V5 (persist timing, needs a fresh probe) → V10 last.

Explicitly not recommended for v14: reopening the gauntlet extra-move or the 0.0s deferral HUD (both documented accepted behaviour, AGENTS.md:121-122); any snapshot-version, mode, currency or DOM-panel work (ground rules).