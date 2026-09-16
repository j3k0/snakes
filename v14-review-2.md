# Snakes v14 — Design Plan Review 2 (game design & player-experience lens)

**Verdict: approve with changes.** The theme is the right consolidation of the three lenses, the
feature set is well chosen, and the measured evidence base is the strongest of any cycle plan so
far. Two spec-level defects must be fixed before any implementation starts (R-2: the D1 code
sketch draws nothing; R-1: the D2 acceptance gate contradicts both today's build and the plan's
own sketch), one theme-relevant cue lie is introduced by B2 as specified (R-4), and the build
order table asks for documentation of unbuilt features (R-6). Everything else is small-bore.

All feel claims below were measured against the running game (`feat/v14-cycle`, harness smoke 4/4
green first). Probe scripts were throwaway and deleted.

---

## Part 1 — Does the theme hold together, and would JC notice?

**The theme holds, and it is the honest successor to v13.** "The board obeys its own rules — and
every cue tells the truth" is exactly the residue v13 left: v13 made the *rival* fair and legible
at its arrival and death; what remains is the *board's* relationship to the rival (phasing through
obstacles, immune to rifts, invisible meals) and a handful of surfaces that contradict themselves
(the Best line vs the recap, the mode-select clipping its own pitch, the death frame erasing the
killer). The 7 features are a faithful expression of it. Two of them (A, B) are the only ones that
change what the *playing* player experiences second-to-second, and they are correctly ranked at the
top of the impact column.

**What JC would notice in v14**, ranked by felt value:

1. **Feature A — yes, immediately.** JC's v13 report was ultimately "the rival feels arbitrary."
   A rival silently eating the food the player was two tiles from is the most arbitrary-feeling
   event left in the game: the food vanishes with no cause. The floater+blip+puff converts it into
   a readable "you lost a race." This is the best feature in the plan.
2. **Feature B1 — yes, on classic.** JC plays classic (obstacles + hazards both enabled). The rival
   materialising out of a wall is a "the board's rules don't apply to it" moment; steering fixes it.
3. **Feature B2 — rarely.** Measured: the rival's head enters an on-phase rift about once per
   ~750 ticks on a 2-rift board (probe: 1 visit in 751 ticks; on a deliberately rift-crossed
   chase path, 1 crossing death per ~2000 ticks). It will read as an occasional free rival
   removal, not a new tool. See R-5.
4. **D1, D2, C, E, F — not in-run.** Menu polish, bookkeeping, a rare spawn-hole, SR channel depth,
   and the death-frame tableau. All correct, all below JC's noticing threshold except the NEW BEST
   toast, which D2 touches without fixing (R-1).

**Where the plan violates its own theme, in the plan itself:** the D1 sketch as written emits *no*
cue at all (R-2 — "every cue tells the truth" becomes "no cue"); and B2 as specified makes
`removeRival` announce **"Rival destroyed"** over a death the player did not cause and cannot
distinguish from a kill (R-4 — the exact "one rival death looks like every other" lie the
legibility lens named its N2). The theme is good; two of its seven features need one-line fixes to
actually meet it.

---

## Part 2 — Balance and feel (the three contested calls)

### (a) Feature A's cue weight under double_rival — the plan's call is CONFIRMED by measurement

Measured on a live double_rival board with a passive player (the rival-eat worst case):

| metric | measured |
|---|---|
| combined rival eats (2 rivals) | **10–18/min** (two runs: 9.7/min over 2165 ticks; 17.8/min over 535 ticks) |
| mean gap between rival eats | 27–51 ticks (**3–6 seconds**) |
| both rivals eating in the SAME tick | **0 occurrences in ~2700 ticks** |
| floater channel cap | 8 (splice, 1073); eat floaters live ~0.8s |
| particle budget | 4/eat vs the player's 8–18; 500-particle perf clamp |

The plan's "no throttle needed at 2 rivals max" (plan L79-80) is correct: one quiet floater + one
short 196 Hz blip every 3–6 seconds is ambient, not noise. The pitch choice is verified correct —
no existing case uses a lone short 196 Hz blip (`rival_warn` is a 233→196 two-tone over 0.25s;
grep confirms no `case 'rival_eat'` exists today). **The weight is right.** Three nits inside it:
R-8 (the floater text is specified twice, inconsistently), R-7 (the calm-mode justification is a
false claim about the code), and the floater colour `#FF8888` matching the HUD/defeat vocabulary is
a good choice that the plan should state as deliberate.

### (b) B2 — is a hazard-killed rival satisfying or cheap? Does herding trivialise the rival?

**Cheap-looking, but bounded — and the plan oversells it.** Measurements:

- **Passive death rate is low.** On a hazard-heavy board with one persistent on-phase rift directly
  on the rival's chase path: **1 death per ~2000 ticks (~0.25/min)**. On a natural 2-rift board:
  1 head-in-hazard visit per ~750 ticks. The rival will not evaporate constantly.
- **"Herding" is mostly not a thing.** The player cannot place food, so baiting requires the rift
  to be on-phase exactly when the rival crosses it while food lies beyond — luck, not skill. What
  the player will actually see: a rival chasing food *through* a rift dies mid-chase (probe: rival
  at (160,200) chasing food at (240,200) through an on-phase rift at (200,200) walks straight in —
  it eats today, it would die on tick 1 post-B2). That is the board occasionally deleting the
  rival, uncredited, respawn 10s. Satisfying? Mildly — it reads as "the rift is real." Cheap? No:
  **uncredited**, so no RIVAL_SLAYER, no +50, no toast. v13's credit discipline holds.
- **"Actually dangerous" survives.** The removal is uncredited and rare; the food-race parity of a
  short rival (stride 1) is untouched; and in the **gauntlet** — where rival play is most
  concentrated (waves 3–5) — B2 can never fire at all: `MODE_CONFIG.gauntlet.hazardsEnabled: false`
  (L1454). B2's live domain is **classic and timeAttack only** (daily/snap have hazards but no
  rival; gauntlet has a rival but no hazards). The plan never states this domain overlap; it should
  (it both bounds the balance risk and deflates the Impact 4 score a little).
- **A food tile inside an on-phase rift becomes a rival shredder** (rival dies before eating, respawns,
  chases again) — bounded by `HAZARD_MAX_LIFE` ≈ 5s, so at most ~1 death per such food. The plan's
  own failure mode covers the ordering; fine.

**B1's stall fear is measured-away.** Six per-seed paired simulations of today's filter vs the
plan's added `obstacleHit` (identical PRNG, obstacle-heavy board, 800 ticks each): progress toward
food **identical or better** in 5/6 seeds (200/200, 240/240, 200/200, 200/200, 200 vs 240, 200/200),
zero stalls, and obstacle phase-throughs dropped from 1–4 per seed to **0**. The perpendicular
retry + blocked-move fallback machinery handles it. The plan's oscillation gate is satisfiable as
written.

### (c) D2 — does delaying the persist hurt the NEW BEST dopamine?

**No — because the plan doesn't delay the toast. It delays only persistence.** The toast stays
in-run on the live comparison (plan L248), the recap's `★ NEW BEST! ★` stays post-cascade and
unchanged. The dopamine *timing* is untouched. But the plan has walked into the real problem
without noticing it, and its own gate exposes it — see R-1: the NEW BEST toast fires on **every
scoring event** of a record run (measured: **19 toasts in a 40-eat run**, 23 in a 15-eat
2-mutator run, 8 in a 5-eat run — each with a different score, so the toast queue's
exact-string coalescing never merges them; 58 queued toasts total in the 40-eat run against a
queue cap of 20). By toast #6 the player has stopped reading the channel — this is the single
biggest dopamine defect in the game today, D2's sketch *preserves* it, and D2's gate
("exactly once") forbids it. One of the two is wrong.

---

## Part 3 — Feature selection: are the drops right?

| dropped item | verdict | evidence |
|---|---|---|
| Full occupancy consolidation | **right to drop** | `findFreeTile`'s options object is load-bearing for 5 save/obstacle callers (AGENTS.md v13); scoping to the two player-facing holes (portal twin, snap exit) is the correct cut |
| L10 double_rival HUD second line | **right to drop** | v13 already prioritises windup>live; two-live-rival masking is rare; the top band is full |
| Idea G rival hoard | **right to drop** | needs a balance playtest and interacts with the board-full guard; wrong cycle |
| L9 CVD rival palettes | **right to drop this cycle** | real gap, but 3 palettes × contrast-vs-8-food-types needs visual verification; additive |
| **L3 frozen-rival board cue** | **the one contested drop** | see below |
| **Shared rival head colour `#FF5555`** | **not dropped — lost** | see R-9 |

**L3 (frozen rival looks live)** is the one I'd contest on player value. The freeze is a frequent,
decision-relevant state: the Golden Hoard freezes the rival for ~15s every ~90s in hoard modes
(classic/timeAttack/daily/snap) plus the 5s Pigment Rush climax — up to ~20s per cycle where the
rival is fully lethal yet visually identical to a moving one. A board cue saying "not moving NOW"
is information the player acts on (dashing past a frozen rival is safe for the window), and it is
an in-run legibility win of exactly the class this theme names ("nothing lies by omission"). The
plan's reason for deferring ("needs a legend/colour decision that interacts with the refused HUD ❄")
is honest but thin: v13 refused the *HUD* cue because "stopped" would imply "safe"; a *board* cue
stating motionlessness is factually true and implies nothing about lethality — the legibility lens
itself proposed the wording discipline ("information-shaped, not a safety claim"). If the parent
wants one swap at the same budget, L3 (~10 LOC) over D1 (~5 LOC) buys more in-run truth per line.
If the design decision is genuinely not ready, the drop stands — but record it as a cost the
"nothing lies by omission" theme knowingly pays in hoard modes.

**R-9 — the head-colour residual was neither kept nor dropped.** The re-verification table records
it ("residual: both heads `#FF5555` (6121, 6140)"), it is the most-watched tile on the board, it
is a 2-line fix (outside ideation V6), and it appears in **neither** the feature list **nor** the
deliberate non-fixes. The plan's own ground rule — non-fixes "recorded, with the evidence" — is
violated by this one item. Scope it (2 LOC, trivially assertable: two rivals render different
head colours) or record the drop with a reason.

---

## Part 4 — The ordering: is G-first right?

**G-first is half right, and the build table as written contains a contradiction.** The plan's
protection argument for G-first ("assertions that can fail before the features land") is weaker
than it sounds: the four G1 repairs (test-v12 C3, test-bugfixes B3, feature-d spawnTime, v10/v11
substring asserts) and the three G2 doc repairs target *pre-v13* code — none of them covers a
path A–F touches. They are order-independent of the features, so "first" buys integrity, not
protection of this cycle's changes. That is still a defensible reason (a repaired suite is the
instrument the gates read), and G is cheap.

But the build table makes **all of G step 1, including G2.4 — "Add the v14 section" to AGENTS.md**
(plan L396-435, build row 1 at L469). G2.4 documents the eat cue, the obstacle steering, the
hazard lethality, the persistence change, the portal occupancy, the srSpeak depth, and the
death-frame rival — none of which exist at step 1. Writing that section first produces exactly
the class of documentation the theme condemns: docs describing behaviour the tree does not have.
R-6: split G — **G1 + G2.1–3 land first (or in the same commit as A), G2.4 moves to after step 8.**

On player-value front-loading: as the player's advocate I'd put **A before or beside G** — A is
~10 LOC, the highest felt-impact line in the plan, and fully independent of the G repairs. If the
cycle is interrupted after one commit, G-first leaves the player nothing where A-first leaves the
rival readable. This is sequencing taste, not a defect; the contradiction above is.

---

## Part 5 — Findings

### R-1 (BLOCKING) — D2's acceptance gate contradicts today's build AND the plan's own sketch
`v14-design-plan.md:287-291`
The gate: "assert the toast fires mid-run **exactly once**". Measured today: the NEW BEST toast
fires on **every** scoring event of a record run — 19 toasts in a 40-eat record run (best 200 →
score 725), 23 in a 15-eat 2-mutator run, 8 in a 5-eat run — because `updateScoreDisplay`'s gate is
`score > modeHighScores[gameMode]`, which every new-best eat satisfies, and each toast carries a
different score so `queueToast`'s exact-string coalescing never merges them (58 queued toasts in
the 40-eat run against `TOAST_QUEUE_CAP = 20` — the run's other normal-priority toasts are evicted
or deferred for its duration). The D2 sketch (L254-262) **preserves** this: `score > sessionLiveBest`
re-fires on every eat past the best. So the gate will fail against the plan's own implementation,
and an implementer "fixing" to satisfy the gate would silently make a significant undocumented
design change. Pick one: (a) keep per-crossing spam and rewrite the gate to "fires on every
new-best crossing, ≥1"; or (b) recommended as the player's advocate — once per run at the first
crossing (a `sessionNewBestAnnounced` flag), which also fixes a second measured defect: **the
first-ever run in a mode fires no toast at all** (the `prevBest &&` term fails when `prevBest` is
undefined — probed: fresh snap mode, 4 eats, best 52, zero toasts), the run most deserving of one.
If (b), the persistence change is unaffected either way.

### R-2 (BLOCKING) — D1's code sketch draws nothing: the coordinates are self-negating
`v14-design-plan.md:231`
The sketch is `fillTextClipped(getModeDesc(mode), CANVAS_WIDTH - 8, y + 20, CANVAS_WIDTH - 20)`.
`fillTextClipped(text, x, y, maxX)` computes `avail = maxX - x` = `(440−20) − (440−8)` = **−12 ≤ 0
→ early return, no draw** (verified against the helper at 4781-4794 and by arithmetic probe). An
implementer copying the sketch ships an idle screen where **no mode has a description** — worse
than today's two clipped ones. The prose two lines later is correct ("Left-anchored at x=10 with
maxX=CANVAS_WIDTH-10 gives ~420px"); the sketch is wrong. Fix: `fillTextClipped(getModeDesc(mode),
10, y + 20, CANVAS_WIDTH - 10)` with the textAlign set/restore the plan already specifies. The
D1 gate (L299) also passes vacuously on the broken sketch — "no drawn description extends beyond
CANVAS_WIDTH−10" is true when nothing is drawn — so add a positive assertion (each of the 8 modes
produces a fillText call / measured drawn width > 0).

### R-3 (MAJOR) — D1's ellipsis deletes each overflowing mode's most load-bearing clause
`v14-design-plan.md:233-234`
Simulated at the plan's own geometry (13px Arial, avail 420px): painter renders
"Paint the board! Eat food to grow. Your trail is permanent. No self-colli…" — losing
"**sion. Score = coverage %**", the mode's scoring rule; gauntlet renders "5 waves, each with a
unique objective. Pick bonuses between waves. …" — losing "**Death ends the run!**", the mode's
one unique stakes statement. The select screen is where mode choice happens; the help overlay
(already clipped, measured: same strings, same loss) is not where a new player looks first. The
plan's mitigation ("the full text stays available to the screen reader") covers SR users only.
Fix within the same budget: trim the two `descs` strings (a two-line edit — e.g. painter:
"Paint the board! Trail is permanent. No self-collision. Score = coverage %.", gauntlet:
"5 waves, unique objectives. Death ends the run!") so the ellipsis becomes a never-fired safety
net. Keep `fillTextClipped` regardless.

### R-4 (MAJOR) — B2 makes the SR channel announce a kill the player did not earn
`v14-design-plan.md:128-133`
`removeRival` calls `srSpeak('Rival destroyed')` **unconditionally** (3668, outside the
`defeatedByPlayer` gate — verified). B2 adds a whole new class of uncredited deaths (rift kills)
that will speak the same "Rival destroyed" as a credited defeat — for a screen-reader user the
rival's death-by-rift is indistinguishable from their own kill, the exact "one rival death looks
like every other" lie (legibility N2/L8) that v13's credit discipline exists to prevent. The toast
is correctly credit-gated ('⚔️ Rival defeated!' only when `defeatedByPlayer`) — the SR line is the
one channel left lying, in the same function B2 already touches. Fix (~1 LOC, inside `removeRival`):
`srSpeak(defeatedByPlayer ? 'Rival destroyed' : 'Rival destroyed itself')` — this also repairs the
pre-existing self-crash path, and belongs in this cycle's theme.

### R-5 (MAJOR) — B2's "herd it in" framing oversells an occasional passive removal
`v14-design-plan.md:147-148`
"A rift becomes a rival-removal tool the player can bait — genuine counterplay." Measured: the
player cannot place food, the rival's 1-ply filter ignores rifts entirely (B1 deliberately
excludes hazards; probe: rival chasing food beyond an on-phase rift walks straight through it and
eats — post-B2 it dies mid-chase), and the passive death rate is ~1 per 2000 ticks (~0.25/min) on
a deliberately rift-crossed path. The real player-facing change is "the board occasionally
removes the rival for free, uncredited" — a legibility win (the rift is real for everyone), not a
skill tool. Rewrite the "What changes for the player" paragraph to the measured reality, and state
the live domain the plan omits: B2 fires in **classic and timeAttack only** (gauntlet, the
rival-heavy mode, has `hazardsEnabled: false`; daily/snap have hazards but no rival). B1's domain,
for contrast, is classic + timeAttack + gauntlet waves 3–5.

### R-6 (MAJOR) — Build order puts G2.4 (the v14 AGENTS.md section) before the features it documents
`v14-design-plan.md:469` (build table row 1) vs `396-435`
G as step 1 includes "Add the v14 section: the eat cue, obstacle steering, hazard lethality,
persistence-timing change, portal-twin occupancy, srSpeak depth, death-frame rival — each with its
accepted-behaviour notes." None of that exists at step 1; writing it first produces documentation
of unbuilt behaviour — the exact class G2 exists to purge, inverted. Split G: G1 + G2.1–3 (the
pre-v13 test repairs and the three verified doc-drift fixes) land first or beside A; **G2.4 moves
to after step 8**. Also consider A before G on player-value grounds (§Part 4).

### R-7 (MINOR) — Feature A's calm-mode justification is a false claim about the code
`v14-design-plan.md:63`
"NOT calm-gated individually (the whole rAF particle system is already the calm surface)" — false:
calm mode gates particles at the spawn sites (powerup at 2281, `if (!calmModeEffective())`;
activation burst at 4108, `calm ? 6 : 15`; hunter dust at 2109; death fragments capped at 60 in
calm at 3820). There is no system-level calm gate; the v8 B pattern is intensity-gating at
choke points. 4 particles is genuinely below the noise floor, so the *decision* is defensible —
but either gate it like its neighbours (`if (!calmModeEffective())`) for pattern-consistency, or
correct the justification to "4 particles is beneath the calm noise floor (death fragments cap at
60 in calm)". As written it teaches the next contributor a false invariant.

### R-8 (MINOR) — Feature A specifies two different floater texts, and the worse one is in the spec
`v14-design-plan.md:56` vs `:91`
The change list says the floater text is `'rival'`; the running-game verification says "watch the
**'!'** floater rise." Pick one. `'rival'` as a lone floating word over the rival's head reads as
a label/tag, not an event; the player's own floaters are all events ('+10', '+30 BONUS!',
'+5 SPEED!'). Recommend `'rival ate'` (pairs with the `srSpeak('Rival ate')` the plan already
adds) — 2 words, unambiguous, still never confusable with `+pts`. The colour `#FF8888` is a good
deliberate choice (matches the defeat floater and the HUD's rival lines — one rival-red
vocabulary); say so.

### R-9 (MINOR) — The shared rival head colour is acknowledged in evidence, then lost between scope and non-fixes
`v14-design-plan.md:47-48` (table) vs `445-461` (non-fixes)
The re-verification table records "residual: both heads `#FF5555` (6121, 6140)" — the lethal,
most-watched tile on the board is the one part of a double_rival pair the player cannot tell
apart. It is a 2-line fix (outside ideation V6: brighten the head per rival, e.g. derive from
`r.color`), it is in neither the feature list nor the deliberate non-fixes, and the plan's own
ground rule requires non-fixes be recorded with evidence. Scope it or record the drop.

### R-10 (MINOR) — The evidence table's "4 of 8 exceed the 440px canvas" is arithmetically wrong
`v14-design-plan.md:42-43`
Classic measures 416.2px and walled 414.8px — both **under** 440, so neither exceeds the canvas
(the ideation's "(440−416.2)/2 ≈ 11.9px each side" is the *margin*, not an overhang). Centred at
x=220, classic spans 11.9–428.1 — fully on-canvas. **2 of 8** descriptions exceed the canvas today
(painter 552.7, gauntlet 517.4 — glyphs physically cut at both edges); 4 of 8 exceed the ~420px
usable band the plan later adopts. The fix is unchanged (clip all 8), but the plan's
"CONFIRMED and WIDENED" verdict misstates the defect it measured, in the table whose job is
credibility.

### R-11 (MINOR) — B2's code comment embeds a cue description the game no longer renders
`v14-design-plan.md:124-125`
"the dashed-amber cue means what it says" — but the current lethal rift is a **violet** radial
gradient with a solid purple border (`drawHazards`, 5455-5472: `rgba(107,63,160,…)`); the dashed
**orange** ring (`rgba(255,170,60)`, 5475-5485) is the pre-ignition keyframe only, and the
onboarding toast says "glowing rifts". The backlog's "dashed amber ring" vocabulary is v10-era.
The plan repeated it without re-verifying against `drawHazards` — the one class of miss in a plan
whose stated discipline is re-verification. Fix the comment ("the rift's lethal ring means what it
says for every actor"), and note it in G2 as a vocabulary check for the legend.

### R-12 (MINOR) — D2 creates a redundant NEW BEST toast on the resume path; add it to the failure modes
`v14-design-plan.md:266-268`
The plan re-derives `sessionLiveBest` from `sessionModeHighStart` on snapshot restore. A run saved
at score 500 with a start-best of 200, resumed, then eating once (510 > 200) fires the NEW BEST
toast **again** — the player already celebrated the 500 crossing pre-save. Today's build does not
re-fire below the persisted best (the gate reads the persisted value). Bounded (one redundant toast
per resume, resume is rare), but it is a behaviour change D2 introduces and its failure-mode list
does not name. Trivial fix: re-derive `sessionLiveBest = Math.max(sessionModeHighStart, score)` on
restore, or accept and record.

---

## Minimum change set

1. **R-2 (must):** Fix the D1 sketch to `fillTextClipped(getModeDesc(mode), 10, y + 20,
   CANVAS_WIDTH - 10)` (matching the plan's own prose), keep the textAlign save/restore, and add
   a positive "all 8 descriptions draw" assertion to the D1 gate.
2. **R-1 (must):** Resolve the D2 gate-vs-sketch contradiction. Recommended: once-per-run toast at
   the first crossing (`sessionNewBestAnnounced` flag), which also fixes the measured fresh-mode
   no-toast gap; otherwise restate the gate as "fires on every new-best crossing" and record the
   19-toasts-per-run spam as accepted. In both cases add R-12 (resume-path toast) to the failure
   modes with its one-line fix.
3. **R-4 (should, theme):** Make `removeRival`'s SR line credit-aware
   (`defeatedByPlayer ? 'Rival destroyed' : 'Rival destroyed itself'`) so B2's uncredited rift
   deaths stop announcing a kill.
4. **R-3 (should):** Trim the painter/gauntlet `descs` so the select-screen ellipsis never fires;
   keep `fillTextClipped` as the safety net.
5. **R-6 (should):** Split G in the build order — G1 + G2.1–3 first (or with A), G2.4 after step 8.
   Prefer A ahead of or beside G on player-value grounds.
6. **R-5 (should):** Rewrite B2's player-value paragraph to the measured reality (occasional
   uncredited passive removal; baiting rare), and state B2's live domain (classic + timeAttack;
   gauntlet has no hazards) and B1's (classic, timeAttack, gauntlet waves 3–5).
7. **R-9 (nice):** Scope the 2-LOC per-rival head colour fix or add it to the non-fixes with a
   reason.
8. **R-7, R-8, R-10, R-11, R-12 (nice):** correct the calm-mode claim or gate the puff; pick one
   floater string (recommend `'rival ate'`); fix the 2-of-8 arithmetic in the evidence table;
   replace "dashed-amber" with the real lethal-cue description; record the resume-toast change.

**What not to change:** Features A, B1, B2, C, E, F as scoped are sound — A's weight and no-throttle
call are measurement-confirmed, B1's stall risk is measured-away (6-seed paired probe: no stall,
no progress regression, phase-throughs 1–4 → 0), B2 is correctly uncredited and bounded by its
rarity, the C/E/F hooks and audits are accurate. The drops of the full occupancy consolidation,
L9, L10, and Idea G are right. L3 is the one defensible swap if the parent wants more in-run
truth per line (over D1); otherwise the 7-feature selection stands.
