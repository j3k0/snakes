# Snakes v11 — Polish / Accessibility / Tech Ideas

Generated for the v11 cycle. Each idea is verified against real line numbers in `snake.html` (8033 lines). Focus: feel, accessibility, robustness, performance, data safety, onboarding — compounding with existing systems (Calm Mode, Settings Panel, CVD palettes, HiDPI scaling, snapshot engine, save export/import, recap card, death fragments, transient rings, input buffer).

---

## 1. Keyboard Remapping

**Concept:** Let players rebind the four movement keys, pause, and combo-spend keys (Z/X) via a new Settings sub-panel, persisted in localStorage as `snake_keymap`. A `resolveKey(action)` indirection layer replaces the ~40 hardcoded `e.key === 'ArrowUp'` / `e.key === 'w'` checks in the keydown handler with a single lookup against the active keymap, falling back to the current defaults. This is the single most-requested accessibility gap — one-handed players, AZERTY users (WASD is QZSD), and players with motor impairments who want larger/clustered keys all currently cannot play comfortably.

**LOC estimate:** ~180 (keymap object + resolveKey + settings UI rows + 6 setter handlers + replace ~40 key checks)

**Scores:** Impact 4 / Feasibility 3 / Risk 3 / Synergy 3

**Hook points:**
- `document.addEventListener('keydown', (e) => {` — line 7261: the monolithic handler; ~40 `e.key ===` checks across 7261–7660 need to route through `resolveKey(action, e.key)`.
- `setNextDirection(newDx, newDy)` — line 3784: the buffer push target; the 8 direction dispatch sites (ArrowUp/W/w/ArrowDown/S/s/etc.) collapse to `resolveKey('up', e.key)`.
- `renderSettings()` — line 1621: add a "Controls" section with 6 rebindable rows, each with a "Press key…" capture flow.
- `showSettingsPanel()` — line 1666: cross-hide contract (already includes settings; no new panel needed).
- `saveManager.getJSON('snake_keymap', ...)` — pattern from line 408 (`snake_mutator_unlocks` validator): use the same validated-JSON pattern with a `validateKeymap` function.
- `updateMenuFooter()` — line 2243: shortcut display should reflect remapped keys.

**Why now / why not:** Previously rejected as "too invasive for 40+ keydown branches," but the codebase has stabilized — the keydown handler (7261–7660) is a single contiguous block with a clear pattern, and `setNextDirection` (3784) already centralizes the buffer logic. The Settings Panel (1621) has a mature `toggle`/`slider`/`seg` widget vocabulary to reuse. AZERTY/DVORAK players are a real accessibility gap today. Risk: the 7 gauntlet-intermission direction checks (7273–7292) and mode-selection checks (7471–7483) share the same keys, so `resolveKey` must handle game-state-dependent action mapping, not just global key→direction.

---

## 2. Adaptive Quality Scaling

**Concept:** Monitor rAF frame timing in `animateVisuals` and auto-downgrade visual fidelity when sustained frame drops are detected: reduce `particleDensity` cap, skip transient rings, disable ambient grid breathing, and lower death-fragment cap. A rolling 60-frame average of `delta` (line 4025) drives a `qualityTier` state (high/medium/low); the existing `calmModeEffective()` gates become a template for `qualityTier` gates at the same call sites. Manual settings sliders remain as overrides; auto-detect only kicks in when the user hasn't explicitly lowered a slider.

**LOC estimate:** ~120 (frame-time tracker + qualityTier state + 8–10 gate insertions + Settings toggle for "Auto Quality")

**Scores:** Impact 3 / Feasibility 4 / Risk 2 / Synergy 4

**Hook points:**
- `animateVisuals(timestamp)` — line 4023: `delta` (4025) already computed; add a rolling window and update `qualityTier`.
- `const needsRedraw = ...` — line 4076: the gate that decides whether to call `drawGame(t)`; quality can skip sub-frame visual updates.
- `spawnParticles(x, y, count, color)` — line 3845: `count = Math.min(count, 500 - particles.length)` (3846) + `count = Math.round(count * particleDensity / 100)` (3848); add a `qualityTier` multiplier here.
- `pushTransientRing(...)` — line 3865: `if (transientRings.length >= 50) transientRings.shift()` (3866); gate on qualityTier to skip entirely at low tier.
- Ambient grid breathing — line 5780: `if (gameState === 'playing' && snake.length > 0 && !calmModeEffective())` → add `&& qualityTier !== 'low'`.
- `var fragCap = calmModeEffective() ? 60 : 400;` — line 3124: add quality tier to the cap.
- `renderSettings()` — line 1621: add an "Auto Quality" toggle row using the existing `toggle()` widget (1633).
- `let shakeIntensity = saveManager.getInt(...)` — line 332, `let particleDensity = ...` — line 333: add `let autoQuality = saveManager.get('snake_auto_quality', 'on')` following the same pattern.

**Why now / why not:** Previously rejected for "complexity vs. payoff," but the visual gate sites are now well-established — `calmModeEffective()` is called at 12+ sites (4084, 4193, 4552, 4919, 5220, 5780, 3124, 3869, 2030, 3331) and provides a proven template for conditional gating. The game runs on a 2014-era i7-4750HQ (per workstation specs) and HiDPI scaling (line 144, capped at DPR 3) already creates perf pressure. Synergy with the existing shake/particle sliders: auto-detect complements manual control rather than fighting it. Risk: low — all gates are additive booleans on existing conditionals.

---

## 3. Save Corruption Auto-Recovery

**Concept:** Wrap every `saveManager.getJSON` call with a schema validator that, on parse failure or shape mismatch, quarantines the bad key to `snake_corrupt_<key>` (for user inspection/export) and restores the default — instead of silently returning the default and losing the data. Add a one-time toast on next load: "Save data issue detected — backed up corrupted keys, settings reset." The existing `exportSaveData()` (line 1692) already iterates all `snake_*` keys, so quarantined keys are included in exports for manual recovery. This is a robustness/UX improvement that compounds with the existing snapshot engine and export/import.

**LOC estimate:** ~90 (quarantine helper + 4–6 validator upgrades + toast + Settings "Restore Corrupted" button)

**Scores:** Impact 3 / Feasibility 4 / Risk 2 / Synergy 4

**Hook points:**
- `saveManager.getJSON(key, defaultVal, validator)` — line 225: already accepts a `validator` callback but returns `defaultVal` silently on failure; add quarantine logic in the catch/validator-fail path.
- `saveManager.set(key, value)` — line 217: add a `quarantineKey(key)` helper that copies the raw string to `snake_corrupt_<key>` before the bad data is overwritten.
- `restoreFromSnapshot(data, fromStorage)` — line 2622: `if (fromStorage) clearSnapshot()` (2624) on bad data — before clearing, quarantine so the run isn't lost forever.
- `exportSaveData()` — line 1692: `Object.keys(localStorage).filter(k => k.indexOf('snake_') === 0)` (1695) — quarantined keys are automatically included.
- `importSaveData(file)` — line 1709: on import, validate each key; quarantine failures with a toast listing which keys were rejected.
- `queueToast(message, duration)` — line 6955: reuse for the "corruption detected" notification.
- `renderSettings()` — line 1621: add a "Restore Backed-Up Data" button if any `snake_corrupt_*` keys exist.

**Why now / why not:** Previously rejected as "edge case," but the snapshot engine (line 2598 `saveSnapshot`, line 2622 `restoreFromSnapshot`) and export/import (1692/1709) are now load-bearing persistence features. A corrupted snapshot silently cleared at line 2624 loses a mid-run save with no recourse; a corrupted `snake_achievements` (line 1212, no validator) silently wipes all achievement progress. The `validator` parameter already exists on `getJSON` (line 225) — only `snake_mutator_unlocks` (408) and `snake_unlocks` (1204) use it today. The fix is primarily in one function (225) plus a handful of validator additions. Risk: quarantine keys must use the `snake_corrupt_` prefix to avoid infinite re-quarantine loops.

---

## 4. Mobile Haptic Feedback Refinement

**Concept:** Replace the single fixed-intensity `vibrate(duration)` calls (line 1804) with a haptic vocabulary — distinct patterns for eat (short tick), combo milestone (double pulse), power-up (ascending), game-over (long descending), and bomb (sharp burst). Add a haptic-intensity slider in Settings (parallel to `shakeIntensity` at line 332 and `particleDensity` at 333) so players can scale or disable haptics independently from sound and visual effects. A `hapticIntensity` multiplier gates every `vibrate()` call, and Calm Mode zeroes it (like it zeroes shake at line 4084).

**LOC estimate:** ~70 (hapticIntensity state + 5 named patterns + slider + gate vibrate() + apply at 7 call sites)

**Scores:** Impact 3 / Feasibility 5 / Risk 1 / Synergy 4

**Hook points:**
- `function vibrate(duration)` — line 1804: the single choke point; add `if (hapticIntensity === 0) return;` and `duration = Math.round(duration * hapticIntensity / 100)`.
- `if (navigator.vibrate)` — line 1805: also gate on a new `hapticEnabled` flag.
- 7 `vibrate()` call sites: line 2004 (power-up), 2042 (power-down), 2390 (evolution), 3114 (death), 5989 (combo), 6506 (eat), 6523 (big eat), 6982 (level-up), 7059 (achievement).
- `let shakeIntensity = saveManager.getInt('snake_shake_intensity', 100)` — line 332: add `let hapticIntensity = saveManager.getInt('snake_haptic_intensity', 100)` alongside.
- `calmModeEffective() ? 0 : (shakeTimer / 200) * 5 * (shakeIntensity / 100)` — line 4084: the pattern for calm-mode zeroing; replicate in `vibrate()`.
- `renderSettings()` — line 1621: add a slider using the existing `slider(label, val, onchange)` widget (line 1639).
- `setShakeIntensity(v)` — line 1688: add `setHapticIntensity(v)` following the identical pattern.
- `isMobile` / `hasTouch` — line 401–402: only show the haptic slider when touch is detected (haptics are mobile-only).

**Why now / why not:** Previously rejected as "platform-limited," but `navigator.vibrate` is already used at 7+ sites (1804–1809) — the infrastructure exists, it's just undifferentiated (every event gets a flat 15–50ms buzz). The Settings Panel now has a mature slider widget (1639) and two intensity sliders already (shake, particles), so the UI pattern is proven. A haptic vocabulary makes mobile play feel tactile without adding visual clutter. Risk: near-zero — `navigator.vibrate` no-ops gracefully on desktop, and the gate is additive.

---

## 5. Recap Card Stagger-In

**Concept:** When the game-over recap card (`drawRecapCard`, line 3225) appears, animate its elements in with a staggered reveal — title fades/scales in first, then score, then XP line, then each quest delta row slides up with a 80ms offset — rather than the current instant full-card draw. Use the existing `easeOutBack` (line 4537) for the title pop and a simple alpha lerp for subsequent rows. A `recapAnimTime` timestamp (captured when `recapData` is set in `buildRecapData` at line 3196) drives the stagger; each row's alpha/offset is computed from `(now - recapAnimTime - rowDelay) / rowDuration`.

**LOC estimate:** ~60 (recapAnimTime state + per-row alpha/offset in drawRecapCard + reset in buildRecapData)

**Scores:** Impact 2 / Feasibility 5 / Risk 1 / Synergy 3

**Hook points:**
- `function drawRecapCard()` — line 3225: the entire card draw; each `ctx.fillText` (3242, 3247, 3252, 3259, 3267, 3273) gets a per-row alpha gate + Y-offset based on stagger timing.
- `buildRecapData()` — line 3196 (function starts ~3196): set `recapAnimTime = performance.now()` when `recapData` is assigned (line 3215).
- `function easeOutBack(t)` — line 4537: reuse for the title scale-in.
- `animateVisuals(timestamp)` — line 4023: `renderTime = timestamp` (4027) is already available; the recap card reads `renderTime` for its animation progress.
- `const needsRedraw = ...` — line 4076: add `|| (recapData && recapAnimTime > 0 && performance.now() - recapAnimTime < 800)` so the card keeps redrawing during the stagger.
- `resetGame()` — line 2055: reset `recapAnimTime = 0` alongside `recapData = null` (2065).
- `calmModeEffective()` — line 326: if calm mode is on, skip the stagger and draw instantly (accessibility: reduced motion).

**Why now / why not:** Previously rejected as "polish fluff," but the recap card (3225–3275) is the emotional climax of every run and currently appears as a static snap — it feels abrupt after the dramatic death-fragment cascade (4107–4128). The `easeOutBack` function (4537) and the rAF-driven `needsRedraw` gate (4076) make this trivial to implement correctly. The stagger also helps the eye parse the information hierarchy (title → score → XP → quests). Calm Mode integration ensures accessibility. Risk: near-zero — purely additive alpha/offset math in an already-saved/restored ctx block.

---

## 6. Web Share API for Recap

**Concept:** Add a "Share Result" option to the game-over screen that calls `navigator.share()` (with a canvas screenshot fallback via `canvas.toDataURL()` for platforms without Web Share) to post the recap — score, mode, tier, new-best flag — as text + image. On the recap card (line 3225), add a "📤 Share" prompt below the existing "Press ENTER to retry" (line 3273); on keypress S or tap, invoke the share API. Falls back to copying a text summary to clipboard if `navigator.share` is unavailable. Compounds with the recap card, daily seed leaderboard, and diary — sharing a daily seed result drives re-engagement.

**LOC estimate:** ~80 (share handler + canvas-to-blob + clipboard fallback + key/tap binding + share text formatter)

**Scores:** Impact 3 / Feasibility 4 / Risk 2 / Synergy 4

**Hook points:**
- `function drawRecapCard()` — line 3225: add "S Share" prompt at line 3273 area, alongside "Press ENTER to retry."
- `document.addEventListener('keydown', (e) => {` — line 7261: add a `gameState === 'gameover'` branch for `e.key === 's' || e.key === 'S'` that calls `shareRecap()`.
- `canvas` — line 187: `canvas.toBlob()` / `canvas.toDataURL('image/png')` for the screenshot; the canvas backing store is already DPR-scaled (line 188).
- `recapData` — line 723: the data object with `score`, `isZen`, `isNewBest`, `xpEarned`, `evolutionTier`, `questDeltas` (3215–3224); format these into a share text string.
- `queueToast(message, duration)` — line 6955: show "Shared!" / "Copied to clipboard" confirmation.
- `MODE_CONFIG[gameMode].name` — used at line 4459 in drawOverlay; reuse for the share text.
- `getDayString()` — line 3065 area (daily leaderboard): include the daily seed date in the share text for daily mode.
- Touch handler — line 7917 area (`canvas.addEventListener('touchstart'`): add a tap zone for the share prompt on the game-over screen.

**Why now / why not:** Previously rejected as "backend-adjacent," but Web Share API is entirely client-side — `navigator.share()` needs no server, and clipboard fallback is universal. The daily seed leaderboard (line 3064) and diary (line 473) create natural share-worthy moments. Mobile PWA (line 7 manifest) is the primary install target, and `navigator.share` is most useful on mobile. Risk: `navigator.share` requires a user gesture (the keypress/tap provides it) and HTTPS (PWA already requires it); `canvas.toBlob` may need `willReadFrequently` context flag for perf, but this is a one-shot operation.

---

## 7. Input Buffer Visualization

**Concept:** Show a subtle directional chevron indicator at the snake's head when the 2-deep `dirQueue` (line 261) has pending turns queued, so players can see that their buffered input was registered — especially important at high speeds where a queued turn might feel "eaten." The indicator draws a small semi-transparent arrow offset 4px from the head in the queued direction, fading in when a turn is buffered and out when consumed. Compounds directly with the Input Buffer Queue (v10 G) and the existing touch swipe indicator (line 4161–4166).

**LOC estimate:** ~50 (draw logic in drawSnake + alpha state in animateVisuals + calm-mode gate)

**Scores:** Impact 3 / Feasibility 5 / Risk 1 / Synergy 5

**Hook points:**
- `let dirQueue = []` — line 261: the buffer; read its length and contents for the indicator.
- `dirQueue.length > 0` consumed at line 6148: the consumption site; this is where the indicator should fade out.
- `function setNextDirection(newDx, newDy)` — line 3784: the push site; the indicator fades in here (conceptually — rendering is in drawSnake).
- `function drawSnake(t)` — line 4898: draw the chevron after the head, using `snake[0]` position.
- Touch swipe indicator — line 4161–4166: the existing pattern for a fading directional indicator at the head; reuse the `touchIndicatorTimer` alpha approach.
- `calmModeEffective()` — line 326: gate the indicator off in Calm Mode (it's a motion cue).
- `animateVisuals(timestamp)` — line 4023: if a `bufferIndicatorAlpha` state is used, decay it here like `touchIndicatorTimer` (4045).

**Why now / why not:** The Input Buffer Queue (v10 G, lines 261, 3784–3793, 6148–6152) is the newest input feature and a core feel improvement, but it's invisible — players at high tick speeds can't tell if their second queued turn registered or was dropped by the 2-cap (line 3793). A visual confirmation closes the feedback loop and makes the buffer feel intentional rather than buggy. The touch indicator (4161) already proves the pattern works. Risk: minimal — it's a tiny additive draw that only appears when `dirQueue.length > 0`.

---

## 8. DPR-Aware Toast & Panel Font Scaling

**Concept:** The toast (line 101) and all HTML panels (statsPanel 102, achievementsPanel 103, cosmeticsPanel 104, questsPanel 105, settingsPanel 106) use fixed CSS font sizes that don't scale with the DPR-aware canvas. On HiDPI displays where the canvas backing store is 2–3x (line 144, `DPR = Math.min(window.devicePixelRatio || 1, 3)`), the canvas game renders crisply but the HTML overlay panels and toast text appear relatively small. Inject a `--snake-dpr` CSS custom property on `document.documentElement` that scales panel font-size, padding, and the toast font-size proportionally, recomputed in `resizeCanvas()` (line 2413) alongside the existing DPR recalculation (line 2434).

**LOC estimate:** ~40 (CSS var injection + resizeCanvas update + 6 panel style tweaks)

**Scores:** Impact 2 / Feasibility 5 / Risk 1 / Synergy 4

**Hook points:**
- `let DPR = Math.min(window.devicePixelRatio || 1, 3)` — line 144: the DPR source of truth.
- `function resizeCanvas()` — line 2413: after `var newDpr = Math.min(window.devicePixelRatio || 1, 3)` (2434) and `DPR = newDpr` (2436), add `document.documentElement.style.setProperty('--snake-dpr', DPR)`.
- Toast style — line 101: `font-size:24px` → `font-size:calc(24px * var(--snake-dpr, 1))`.
- Panel styles — lines 102–106: add `font-size:calc(14px * var(--snake-dpr, 1))` baseline.
- `renderSettings()` — line 1621: the inline styles in the generated HTML (e.g., `font-size:12px` at 1627, 1636) would need to incorporate the DPR var.
- `drawHelpOverlay()` — line 3870: canvas-drawn text already uses `ctx.font` which is DPR-scaled via the base transform (5762); this is the reference for "correct" scaling.

**Why now / why not:** The HiDPI scaling system (lines 140–168, 2431–2441) is mature and handles the canvas beautifully, but the HTML overlays were never updated to match — it's a visible inconsistency on Retina displays. The fix is a single CSS custom property updated in one function (`resizeCanvas`). The Settings Panel's inline styles (renderSettings, line 1621) are the main complexity, but they're generated strings that can template the var. Risk: low — CSS custom properties with fallback values degrade gracefully; the var defaults to 1 if unset.

---

## 9. Snapshot Health Check & Expiry Badge

**Concept:** When a saved snapshot exists (`hasSnapshot()` at line 2613), show an "age badge" on the idle screen's "Resume Run" prompt (line 4364) — e.g., "Resume Run (2h ago)" or "Resume Run (3d ago — stale)" — computed from `snap.savedAt` (line 2497). If the snapshot is older than a configurable threshold (default 24h), tint the prompt yellow and add a warning. On restore, validate the snapshot's `savedAt` against the current time and, if stale, show a toast: "Resuming a run from N hours ago." This makes the snapshot engine's resume feature more trustworthy and prevents confusion when a user returns to a days-old run they forgot about.

**LOC estimate:** ~50 (time-ago formatter + idle-screen badge + stale toast + threshold setting)

**Scores:** Impact 2 / Feasibility 5 / Risk 1 / Synergy 4

**Hook points:**
- `function hasSnapshot()` — line 2613: currently returns boolean; add a `getSnapshotAge()` helper that reads `saveManager.getJSON(SNAPSHOT_KEY, null)` and extracts `savedAt` (line 2497).
- `if (hasSnapshot())` — line 4360: the idle-screen resume prompt; add age badge text after the existing `'\u25B6 Resume Run  (R)'` (4364).
- `resumeRunTextY = currentY` — line 4361: the tap zone for resume; the badge should be part of the same tap target.
- `restoreFromSnapshot(data, fromStorage)` — line 2622: after successful restore, check `data.savedAt` age and queue a toast if stale.
- `var snap = saveManager.getJSON(SNAPSHOT_KEY, null)` — line 7543 (R-key resume) and line 7883 (tap resume): both already read the snapshot; reuse for age display.
- `queueToast(message, duration)` — line 6955: for the "resuming old run" notification.
- `buildSnapshotObject()` — line 2493: `savedAt: Date.now()` (2497) is already captured; no snapshot change needed.
- `formatDuration(secs)` — line 494: existing duration formatter; add a `formatTimeAgo(timestamp)` sibling.

**Why now / why not:** The snapshot engine (2493–2614) is a v7 feature that's now load-bearing — it saves on tab-hide (line 7944) and is the primary resume mechanism. But a snapshot from 3 days ago (e.g., a daily seed run abandoned mid-session) is confusing to resume blindly, especially since the PRNG state diverges post-restore (documented at line 2636–2641). The age badge is a tiny, high-clarity improvement. Risk: near-zero — it's a read-only display computed from an existing field.

---

## 10. Audio Ducking on Calm Mode

**Concept:** When Calm Mode is active (`calmModeEffective()`, line 326), automatically lower the `playSound` gain (line 3466: `gain.gain.value = 0.2`) to a calmer 0.10 and disable the drone/pad audio layers (lines 3723 `startDrone`, 3682 `startPad`) that build tension near hazards. This extends the reduced-motion philosophy to reduced-audio: players who opt into Calm Mode for visual calm also get a gentler soundscape, rather than having to separately find and mute the drone. A new "Calm Audio" setting (auto/on/off, defaulting to "auto" = follows Calm Mode) lets players decouple if they want calm visuals but full audio.

**LOC estimate:** ~55 (calmAudio state + gain gate in playSound + drone/pad gates + Settings segmented control)

**Scores:** Impact 3 / Feasibility 5 / Risk 2 / Synergy 5

**Hook points:**
- `function playSound(name)` — line 3452: `gain.gain.value = 0.2` (3466); change to `gain.gain.value = calmAudioEffective() ? 0.10 : 0.2`.
- `function calmModeEffective()` — line 326: the template for a new `calmAudioEffective()` that checks `calmAudio === 'auto' ? calmModeEffective() : calmAudio === 'on'`.
- `let calmMode = saveManager.get('snake_calm_mode', 'auto')` — line 323: add `let calmAudio = saveManager.get('snake_calm_audio', 'auto')` alongside.
- `function startDrone()` — line 3723: `if (!audioCtx || droneActive) return` (3724); add `if (calmAudioEffective()) return;`.
- `function startPad()` — line 3682: `if (!audioCtx || padActive) return` (3683); add `if (calmAudioEffective()) return;`.
- `renderSettings()` — line 1621: add a "Calm Audio" segmented control using the existing `seg(label, val)` pattern (1625), placed right after the Calm Mode section (1656–1659).
- `setCalmMode(v)` — line 1687: add `setCalmAudio(v)` following the identical pattern.
- `if (synesthesiaMode) startPad()` — line 2761: pad is started on resume; the calm gate in `startPad` handles this.
- Drone proximity logic — line 3756–3760: `if (!droneActive) startDrone()`; the gate in `startDrone` prevents it from starting, so this path is safe.

**Why now / why not:** Calm Mode (line 323–328) is the flagship accessibility feature and gates 12+ visual sites, but audio is completely untouched — a Calm Mode player still gets the full-intensity hazard drone (3723) and 0.2-gain eat sounds (3466), which is jarring against the visual calm. The `seg()` widget (1625) and `setCalmMode` pattern (1687) make the Settings UI trivial. The drone/pad are tension-building audio layers that directly conflict with the Calm Mode intent. Risk: low — `calmAudioEffective()` defaults to following Calm Mode, so existing behavior changes only for players who already opted into calm; the "off" override preserves current behavior for users who want it.