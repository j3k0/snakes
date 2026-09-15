## 1. Current cue inventory (what the player actually gets)

| Moment | Visual | Audio | SR |
|---|---|---|---|
| Dead rival, respawn timer ticking | **Nothing.** `drawRivalHUD` (snake.html:6116) returns early when no rival is `active` (6120-6122) — the whole 'Rival' line disappears and no countdown exists. `drawRival` skips inactive rivals (5850). | none | none |
| Rival spawns | **Nothing.** `spawnRival` (3307-3334) picks a tile (3321), sets `active = true` (3332) with no telegraph, no grace, no draw state. Probe: 40 forced spawns produced manhattan distances 3-26 tiles (median ~13); the floor is the 3-tile `findFreeTile` guard (3243). | none | none |
| Rival active on board | `drawRival` (5847-5855): head `#FF6666` (5852), body `r.color` = `#FF4444` / `#FF8844` (3310). Flat `fillRect` squares, no outline, no glow, no eyes (`drawEyes` at 5603 is used only for the player head at 5777), no `highContrast` treatment (obstacles get cross-hatch at 5177, the rival gets nothing). HUD: `'Rival: ' + maxActiveLength` at (5,40) in `#FF8888` (6123-6129). | none on respawn/appearance | none |
| Rival defeated | 20 particles at the rival head (3455). That is the *only* cue; it is the same burst used for every kill, so 'I killed it' and 'it suicided' look identical. | none | none |
| Player killed by rival | normal death path (`lastDeathCause = 'You were caught by the rival!'`, 7204) → `gameOver()` → `srSpeak('Game over. Score N. <cause>')` (3540). This is the ONE rival moment with an announcement. | gameover tone (4007) | yes (3540) |

Absent, concretely: (a) any pre-activation warning of any kind; (b) any positional information about an inactive rival; (c) any rival sound (`playSound`'s switch, 4022-4107, has 12 cases — `eat bonus speed achievement levelup powerup powerdown rare_spawn combo_milestone gameover pause resume` — and **no rival case**); (d) any `srSpeak` for spawn/defeat; (e) any CVD handling (the rival is **not** in `CVD_PALETTES`, 299-331, which only keys food types; `foodColor()`/`foodOutlineColor()` are never used by `drawRival`); (f) any telegraph/grace tick budget analogous to `HAZARD_GRACE_TICKS` (3891).

**Hard finding — the rival shares its colour with the most common food.** `FOOD_TIERS.common.color === '#FF4444'` (1441) and rival 0's body is `'#FF4444'` (3310). Confirmed visually: a rendered board with a 3-segment rival and one common food adjacent reads as the identical red (vision check on the probe screenshot; HUD read back `Rival: 3`). So the game's most frequent food teaches 'bright pure red = eat me' while the most lethal object uses the same hex. Rival 1 (`#FF8844`, 3310) sits in the same family as bomb `#FF6600` (1452) and hunter `#FFAA00` (1449).

**Second finding — the frozen rival reads as a non-threat.** `hoardActive`/`rivalFreezeMs` skip `updateRival` (7797-7801) but do **not** skip the collision test (7158-7181), so a rival frozen by the Golden Hoard / Pigment Rush stops moving while remaining fully lethal, with no visual difference from a live one.

## 2. Spawn telegraph — options and the pick

**A. Wind-up state on a new rival field** (`r.windup`/`r.spawning`, `active` stays false). Clean naming, but needs a new field in the snapshot build (2887) *and* restore (3060). Save/restore mid-wind-up then yields an inert snake that never activates — an invisible permanent rival for that run if the restore map is missed. Rejected on snapshot-risk grounds (this codebase's additive-snapshot discipline exists precisely to avoid this class).

**B. Reuse `respawnTimer` + the already-snapshotted `snake` array (PICK THIS).** Two-stage respawn, no new state at all:
- `removeRival` keeps `snake = []`, `respawnTimer = 10000` (3457-3458) — unchanged.
- The respawn loop (7787-7793) gains a pre-pick branch: once `respawnTimer <= RIVAL_TELEGRAPH_MS`, call `spawnRival(rri)` which now picks the tile and sets `snake = [tile]` **but leaves `active = false`** and sets `respawnTimer = RIVAL_WINDUP_MS`. At `respawnTimer <= 0`, if `snake.length > 0` set `active = true; respawnTimer = 0` (instead of re-picking).
- `spawnRival` therefore always produces an inert, telegraphed rival — the run-start calls (2628, 2631, 2647, 6336, 8451, 8468) get the warning for free, uniformly.

Why B wins: `!active && snake.length > 0` is an unambiguous new *state* built from *existing* fields, so a mid-wind-up save/restore (3060 restores `active`, `snake`, `respawnTimer`) resumes correctly with **zero snapshot changes** — no `SNAPSHOT_VERSION` concern at all. The wind-up is inert by construction: `checkPlayerDeath` only tests `rivals[rci].active` (7159), `drawRival` skips inactive (5850), `anyRivalActive` (815-820) is unaffected, and `r.active = true` has exactly one site in the file (3332). Total dead→live time stays 10s; only its last 2.6s gain meaning.

Add `if (rivals[idx].active || rivals[idx].snake.length > 0) return;` to `spawnRival` (replacing the `active`-only guard at 3312) so a materialising rival can never be re-spawned over. Raise the spawn floor locally in `spawnRival` to `>= 4 * TILE_SIZE` (re-roll loop) to match the hazard precedent (`headDist >= 4 * TILE_SIZE`, 3931) — do **not** touch `findFreeTile`'s shared 3-tile guard (3243), which Phoenix/combo-bank saves depend on.

**C. Off-screen / directional indicator** — rejected outright: the whole board is always visible (canvas 440x600, play area 400x400 at PLAY_MARGIN 20/50, 145-148; there is no camera), so the rival is never off-screen. A HUD banner alone is also rejected as the *primary* cue: it is non-spatial, and the top HUD band is full (see §4).

**Freeze interaction (required):** put the wind-up decrement inside the existing respawn loop, so it inherits the `!hoardActive && rivalFreezeMs <= 0` gate (7788) and the `respawnTimer -= tickInterval` (7789) — i.e. the telegraph **pauses** during a freeze, exactly like the respawn timer, and its countdown is display-only. It stays *visible* while paused (`drawRival` has no freeze gate), which is the right read: 'this is about to happen here, but not yet'. (Precedent: `rivalFreezeMs` decays with the real cadence at 6813-6815.)

**Wind-up edge case that the collision fix must cover:** if the player is standing on the telegraph tile at the instant of activation, the rival appears inside them. Today that is harmless only because of the head-on inversion (below). The activation step should defer one tick while `snake[0]` occupies the tile (`respawnTimer += tickInterval`) — cheap, provably fair, and independent of which F1 fix lands.

## 3. Making the danger read instantly

**Rejected premise:** the rival is *not* fast (1 tile/tick, same cadence as the player's base speed — `updateRival` unshifts one head per call, 3404; same loop count as the player's move, and the rival's own timer reasoning at 7784-7789). It is a slow, saturated-threat object, so it needs *identity* + *proximity* cues, not continuous alarm.

- **Identity (information, always render).** Move the rival off the food-red axis and give it the 'solid object' treatment the codebase already uses: body `#C62828` (rival 0) / `#AD1457` (rival 1), drawn as today's `fillRect(x+1,y+1,TILE-2,TILE-2)` (5853) **plus** a 1px `rgba(0,0,0,0.6)` `strokeRect`; head keeps the bright `#FF6666` and gains two white fang triangles (`drawEyes` exists at 5603 but is player-only). Rationale the player can learn without a legend: food *glows* (`tier.glow` → `shadowBlur`, 5295-5298) and obstacles *are outlined* (`#555`/`#777` + optional cross-hatch, 5171-5177) — the rival becomes 'outlined + fanged + never glowing'. Cost: ≤2 extra path ops per segment, ≤40 for two max-length rivals.
- **Proximity (information, always render).** When wrap-aware head distance ≤ 3 tiles, draw a dashed ring on the rival's head at radius `TILE_SIZE * 1.1` = 22px, `rgba(255,60,60,0.85)`, lineWidth 2, `setLineDash([5,5])` — the same dashed-ring vocabulary as the hazard pre-ignition keyframe (5223-5232), so one legend covers both.
- **Telegraph (information + a gated intensity ramp).** At the pre-picked tile: tile ghost fill in `r.color` at `alpha = 0.15 + 0.35 * (1 - windFrac)`; dashed ring radius `TILE_SIZE * 0.75` = 15px, lineWidth 3, `rgba(255,90,90, α)` with `α = calm ? 0.7 : 0.35 + 0.45 * (1 - windFrac)` (base 0.35 always renders; only the brighten is gated — mirrors `warnA` at 5224); countdown arc radius 15px, from `-π/2`, sweep `2π * windFrac`, `rgba(255,120,120,0.75)`, lineWidth 2 — a direct clone of the hazard countdown arc (5237-5245) which is explicitly **not** calm-gated (comment at 5236). All of it goes in a new `if (!r.active && r.snake.length > 0)` branch inside `drawRival`, which already wraps in `ctx.save()/restore()` (5851/5854) — nest another pair for the dash state, per the save/restore discipline.
- **Sound.** Add exactly one case, `case 'rival_warn':`, fired at wind-up start (pitch pair 233→196 Hz over 0.25 s, gain 0.18 — no collision with any existing pitch: 220/330/440/523/660/784/880/1047/1100 at 4022-4107). For the defeat, **reuse** `powerdown` (660→330, 4100-4106) — no new case. v12's duplicate-case hazard applies: grep `case 'rival_warn':` before adding; the switch currently has no duplicates. `playSound` early-returns when muted (4008), so sound is never the only channel. Optional `vibrate(30)` at materialisation (self-throttled to 300 ms, 2018; not calm-gated by existing precedent).

## 4. HUD

`drawRivalHUD` (6116-6130) shows one thing: `'Rival: N'` where N is the max **active** rival length, at (5,40), `hudFont(10)` (`isMobile` 1.3x, 722-724), `#FF8888`, left/top — and nothing at all when every rival is dead (6120-6122). No distance, no countdown, no per-rival identity.

Ship, in the *same single line and same slot* (no new DOM panel; the top band 0-50px already carries the powerup bar (5,5,100x14, 6086-6090), the SYN badge (5,15, 6678), this line (5,40) and the right-aligned mutator/resonance lists from y=20 (6705-6709); gauntlet separately uses (5,50) and (5,72) at 6399/6404 — so there is **no room for a second row**, and on mobile the 13px font already fills 40-53):
- live: `Rival: N` (unchanged);
- materialising: `⚠ Rival in 1.4s` in `#FFB0B0` (derivable from `respawnTimer / RIVAL_WINDUP_MS`);
- dead/awaiting: `Rival ⧗ 6.4s` in `#FF8888` (respawnTimer counts real ms and only decrements outside freezes, 7788-7789);
- frozen (hoard / `rivalFreezeMs > 0`): append `❄` — explains why the rival stopped without implying it is harmless.

Defer: rival length in the HUD (it is already `Rival: N`), rival distance in the HUD (spatial ring is strictly better; the HUD slot is the entire budget), per-rival rows for `double_rival`, and any rival entry flash/shake (intensity-only, carries no information a player can act on).

## 5. Accessibility (`srSpeak`)

`srSpeak` (1072-1080) writes an `aria-live="polite"` region (109), throttled to 500 ms with a single pending slot (`srQueue`, 1076, drained at 1082-1087). Today it announces every food eat ('Ate X. Score N', 7371) and nothing about the rival. Add, at wind-up start, one wrap-aware positional line: `srSpeak('Rival incoming, ' + dirWord + ', ' + tiles + ' tiles')` (dirWord from the sign of the shortest wrapped delta; 'left/right/up/down, same row/column'). It fits the ~13-tick wind-up against the 500 ms cadence. At `removeRival`'s last line (3463) add `srSpeak('Rival destroyed')` — neutral wording, because the defeat can also be a rival self-collision (3399-3402) rather than a player kill. No continuous 'rival is near' announcement (spam, and the proximity ring covers it visually). The player-death case is already correct via 3540 + 7204.

One-shot onboarding: mirror the `hasSeenHazard` pattern (743-744, 3933-3936) with `snake_has_seen_rival` and `queueToast('⚠ Rival incoming — avoid the dashed ring!', 3000, 'high')` on the first materialisation of the session. Do **not** toast on every materialisation — rivals respawn every ~10 s by design (3458) and `queueToast` coalesces only on exact-message equality (7992-8010), so a per-spawn toast would flood a `high` slot.

## 6. Ranked shortlist

**Ship in v13** (in order):
1. **B-stage spawn** — `RIVAL_TELEGRAPH_MS = 2600` (~22 ticks), `RIVAL_WINDUP_MS = 1600` (~13 ticks), both ms decremented by `tickInterval` (tick-counted against the real cadence, per 7789); name the existing `10000` respawn constant (3458). Mechanics: §2B + the activation-deferral guard.
2. **Telegraph draw** — §3 geometry, new branch in `drawRival` at 5850. Information; only the alpha brighten is calm-gated.
3. **Rival identity** — body `#C62828`/`#AD1457` + 1px black outline; white fangs on the head. Information; never calm-gated.
4. **Proximity ring** — ≤3 tiles, 22px dashed red. Information; never calm-gated.
5. **HUD countdown line** — §4. Information; never calm-gated.
6. **`rival_warn` sound + reuse `powerdown` on defeat + `spawnParticles` at materialisation** — particles calm-gated (precedent: 2087, 2259), sound not (calm is a motion setting; every existing sound site fires under calm).
7. **`srSpeak` spawn/defeat lines** + one-shot first-materialisation toast. Information; never gated.

**Defer:** off-screen/directional HUD indicator (impossible surface — the board is always fully visible); rival path/eye-direction preview (the AI is a 70 % food-seek / 20 % straight / 10 % random walk, 3342-3379 — prediction would be a lie); per-rival HUD rows; entry shake/flash; any change to `findFreeTile`'s shared 3-tile radius.

**Cross-agent note (owner: collision mechanics).** The telegraph's value depends on the F1 inversion being fixed. I re-verified it on this tree: player charges right from (100,100), rival at (140,100) moving left — gap **2 tiles** → `gameState` stays `'playing'`, `rivals[0].active === false`, `stats.rivalsDefeated` **+1**, `lastDeathCause` empty. Gap **1 tile** → `gameover`, `lastDeathCause = 'You were caught by the rival!'`, defeatsDelta 0. Gaps 3-4 → no interaction. Cause is the same one already documented: `checkPlayerDeath` (7158-7181) tests the player's new head against the rival's **pre-move** segments because `updateRival` runs ~600 lines later (7797-7801); the rival then steps onto the player's tile and hits the head-on branch (3438-3445) → `removeRival` (3449) → free kill + `rivalsDefeated++` (3463). With a wind-up but no F1 fix, the wind-up becomes a *second* free-kill window: the telegraph tile is inert, so a charging player passes through it unharmed and takes the kill when the rival activates and steps into them.
