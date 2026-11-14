# v15 implementation-plan review (step 5)

Independent reviewer subagent, 2026-11-14. Read `IMPL_PLAN_v15.md`, `v15-design-plan.md` rev 2 (with disposition table), and spot-checked the six anchors in `snake.html`.

1. **BLOCKER — C1's funnel-sequence test cannot pass as specified.** `load`, `day-*` and `ch_*` fire at module init; on `file://` they no-op *before* the after-load `page.evaluate` monkeypatch exists, and nothing re-attempts them — the asserted sequence is unobservable. Also, with only `isCountedHost` patched, `channelForHost('')` (the `file://` hostname) has no defined fallback, so the expected `ch_github` cannot arise. Fix: assert init keys under a host-mapped local origin (Chromium `--host-resolver-rules` mapping `j3k0.github.io` to `127.0.0.1`, `fetch` stubbed) so the real gate and `channelForHost` run; use after-load patching only for call-time keys; mandate `snakeBump` resolves `isCountedHost` by bare name at call time (no init-time capture) and define `channelForHost`'s fallback.

2. **BLOCKER — C1 silently drops the design's `touch`/`keys` gate.** Design F1 asserts one `touch`; the impl plan defines both keys but gates neither, so a build where `touch` never fires stays green. Add first-input assertions (tap → `touch`, key → `keys`, winner suppresses loser) and a winner-suppression mutation.

3. **BLOCKER — C2's pointer-gate mutation cannot fail.** At 1366×768 the height gate (768 ≥ 700) already blocks `compact`; deleting the pointer gate leaves that assertion green. Also `hasTouch` silently substitutes R2-9's `(pointer: coarse)` (they differ on fine-pointer touch laptops) — undocumented. Fix: assert no-`compact` on a fine-pointer viewport under 700 px (e.g. 1280×650), use `matchMedia('(pointer: coarse)')` or document the substitution, and rewrite the mutation line to match.

4. **SHOULD — C3's contrast sampling is not findable as worded.** "Darkest glyph pixel inside the band text's bounding box" needs an in-test text bounding box (environment-dependent metrics — the v12 lesson) plus glyph discrimination; "backdrop pixel directly under the band rect" is ambiguous. Specify the method: read back the band-rect interior minus the border stroke; require min/max luminance ratio ≥ 4.5 (symmetric; no glyph test needed).

5. **SHOULD — `paused_early` state is unnamed and ungated.** "FIRST started run of the load" needs a per-load latch that must NOT reset in `resetGame()`/`resetWaveState()`. Either name that latch and gate the key, or simplify to "pause within 50 ticks of a run start" (per-run counter reset in both; the Set enforces once-per-load) — and assert it either way.

6. **NIT — C2 rotation fixture:** a `setViewportSize` dimension swap (320×568 → 568×320, touch emulation) is sufficient — rotation arrives as resize; no `orientationchange` listener exists. Say so.

7. **NIT — C3 hit-test source:** existing tap branches convert via `CANVAS_HEIGHT / rect.height` from `getBoundingClientRect` at event time (`snake.html:9634`, `:9657`) — self-correcting. Keep `--snakes-scale` test-only, not a second hit-test source. `startBandRect`: name its clear site (null in the idle draw's else path).

Anchors: all six verified (`:142`, `:9589`, `:9666`, `:2434`, `:3360`, `:4154`); design rev 2's `:9663` is stale but no step depends on it. `:9666` is the shared `idle || gameover` tap branch — C3 and C6 must split it. Other state classifications (`_firedFunnel` per-load, `gameOverAt` per-run both-resets, `--snakes-scale` per-resize) are correct.
