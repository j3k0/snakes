# v15 design review — falsifiability and measurement (reviewer 2)

Independent subagent review, 2026-11-13. Read `v15-design-plan.md` and `v15-ideation-context.md`; invariants per `AGENTS.md`. Nothing else opened, nothing executed, per brief.

**1. BLOCKER — F3's tap gate passes on a build with no band.** Context fact 1 measures that an idle-state canvas tap already starts the run. "A tap at the band's centre takes `idle → playing`" is therefore true on today's build, and the stated mutation ("remove the band, tap fails") is false — the catch-all still starts the game. The gate cannot distinguish a working band hit-test from a decorative rectangle.
**Required change:** decide whether an idle tap outside the band starts the game, and assert that negative case so the band's hit-test is load-bearing.

**2. BLOCKER — F3's contrast sample names no pixel pair.** "Pixel-sample the band" can be satisfied by sampling the fill against the band's own border (a ratio that never fails) while the glyph over its real backdrop is illegible — v12's environment-dependent-rendering trap again. The `.shortcut-dim` raise ("footer prompt legible" is in scope) has no assertion at all.
**Required change:** assert the darkest glyph pixel against the backdrop pixel directly under the band rect (board drawn first), and assert the resolved footer text/background pair at 320×568 and 390×844.

**3. BLOCKER — F1's gate is blind to the channel fix it exists for.** Every fixture runs on `file://`; a build whose allow-list still drops `*.itch.zone` — the measured invisibility (ctx 11) the feature claims to fix — passes every stated assertion, and the funnel that judges the cycle is then silently wrong for the primary distribution channel. Acceptance 5 proves github.io fires; nothing proves itch counts.
**Required change:** add a hostname-stubbed fixture asserting an itch-like origin attributes `ch_itch` and fires, and an off-list origin fires nothing.

**4. BLOCKER — F1's rescue mutation cannot fail as written.** The scripted visit contains no rescue, so deleting the rescue exclusion breaks no assertion. Worse, v12 C's `lastDeathCause`/`lastSaveEvent` split makes a correct bucket map structurally blind to rescues — the exclusion may be vacuous in code too, and an implementer who also maps `lastSaveEvent` ships a rescue-counting build that passes the gate.
**Required change:** add a rescue fixture — shield save then a later true death yields exactly one bucket with the true cause; rescued then quit yields zero death keys.

**5. BLOCKER — F10's decision rule is undecidable in the case the funnel exists to discriminate.** ≥20 loads with `start/load` between 30% and 100% and `first_food/start` < 70% matches no branch: the door works, the opening run loses them, and the rule says nothing. Also missing: the posts never being made leaves the window unstarted with no action, and at n≈20 the 70% threshold swings on ~2 visitors.
**Required change:** enumerate the full matrix — a named action for the 30–100%/<70% cell (first_food-targeted v15.1 or an explicit JC judgment), a no-posts-by-date fallback, and an n-margin or boundary clause on both thresholds.

**6. SHOULD — the rates are channel-structural; the rule never says which channel it reads.** Itch embeds can load unattended (viewport-triggered iframes), deflating `start/load` on `ch_itch` versus deliberate `ch_github` visits, so an aggregate can read <30% and trigger "fix the door" when the door is fine. The ~90 s iframe lifetime censors `die_*` on itch, so death buckets are not comparable across channels. There is no structural start-without-load — the distortion is loads without visitors. `first_food/start` is the right activation metric, per channel.
**Required change:** state in F10 that the thresholds read `ch_github` (or per channel, named per branch), and mark `die_*` right-censored on itch in the report.

**7. SHOULD — F8's gate never tests the visitor F8 exists for.** The welcome/challenge precedence fix has no gate case; a build where the welcome overlay still wins passes all six assertions, and a shared link to a brand-new friend — the distribution feature's actual first ten seconds — lands on the wrong screen.
**Required change:** add a fresh-profile + challenge-hash fixture asserting the landing overlay renders and the welcome overlay does not.

**8. SHOULD — F4's regex proves less than its title, and the swipe window is untested.** Absence of `/Press\s/` on the welcome frame passes any other wrong replacement copy and says nothing about "Press ENTER" copy on the idle or landing screens on touch; the 250 ms swipe guard — the mitigation risk 2 asks reviewers to challenge — has no fixture, so a build with no guard passes.
**Required change:** assert the exact drawn replacement strings, sweep all touch-context states for the regex, and add a swipe-on-overlay fixture that must not start a run.

**9. SHOULD — F2 has the worst regression-risk-to-benefit ratio in the plan, and its gate misses the class it newly regresses.** It is the owner's own #1 risk, touching every device, for a phone class with zero measured traffic (18 loads, mostly ours). Concretely: the compact class fires below ~700 CSS px, so a 1366×768 laptop (~660 px viewport with browser chrome) gets `h1`/`#score`/`#highScore` hidden — desktops that show them today — and no desktop viewport is in the gate set.
**Required change:** add a ~1366×768 case asserting those elements stay visible, or re-derive the threshold so it cannot fire on landscape desktops.

**10. SHOULD — F5/F3 tap tests prove routing, not visibility.** A band drawn below the fold passes a tap-at-coordinates test; F2's gate covers only board rows, not the control row.
**Required change:** assert each band's drawn rect intersects the visual viewport at 320×568 before the tap assertions.

**11. NIT — F6's gauntlet check is a sentence, not a gate.** "Check `generateObstaclesForWave` for the same corridor" has no fixture; the wave generator ships unfixed and green if it shares the anchor bug. (The 3000-seed probe itself is sound — today's build measurably produces blocked lanes, so the fixture can fail.)
**Required change:** gate the wave generator with its own probe or strike the sentence from scope.

**12. NIT — F10's rate table is prose.** Acceptance 6 ("computable without hand arithmetic") is a human check; the gate asserts rows and dates only.
**Required change:** assert the printed rates against fixture counts in the F10 gate.

**Verdict.** F7's gate is the strongest in the plan (its mutation is the bug it prevents) and F6's probe is sound. But three gates pass on builds whose feature is broken (F3 tap, F1 channel, F8 precedence), two named mutations cannot fail (F1 rescue, F3 band), and the decision rule has no branch for its central case. Fix the gates before any code lands under them.
