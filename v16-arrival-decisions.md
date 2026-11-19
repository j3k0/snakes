# v16 arrival — decisions and work specs

Split out of `v16-ideas-arrival.md` on 2026-11-18 so the ideation doc stays inside its word budget and this record can travel to the release train on its own. Decisions are JC's, taken 2026-11-18 in reply to the three questions Lens 1 raised; everything else here is spec, measurement, or a test someone still has to write.

## The decisions

1. **Extra attribution counter: yes.** One additive key plus host mapping is allowed, on the post-read train. Ad-SDK portals stay refused — no third-party ad or tracking SDK, ever.
2. **Link-preview copy rewrite: agreed.**
3. **Post-freeze launch plan: agreed**, and it lands **after** the 2026-12-15 read — any announcement restarts day 0 and would void FOV-2741.

The lens may not edit `snake.html` or any `test-*.mjs`, so all three are written here as specs for whoever implements them, each with its falsifiable check and mutation. Item A carries a blocker nobody had listed.

## A. The attribution key — and a blocker nobody listed

**Spec.** `snakeBump('chal_seen')`, once per page load, at the two sites that turn a URL into `challengeFromUrl` — `snake.html:10368` (load handler) and `snake.html:10387` (`hashchange`). Additive; load-scoped by the existing `_firedFunnel` Set; never part of a decision ratio; opt-out unchanged (`snake_nocount === '1'`). If a portal is ever used, its hostname goes into `channelForHost` (`snake.html:248`), where `ch_other` already exists as the fallback.

**Measured blocker.** A key that the report does not name is a key that never happened. `/opt/shared/reports/snakes/counter-snapshot.sh` enumerates its keys explicitly — the snapshot loop at line **343** (`KEYS="load start finish overlay_gone first_food … ch_github ch_itch ch_other"`) and the window/channel loop at line **258**. The full change is therefore **two edits in two places, in two different repos**: the bump in `snake.html`, and the new key added to both lists in JC's report script (outside this repo, outside this cycle's write scope).

A half-deployed key is worse than none: the game would be counting challenge opens that the report renders as nothing, which reads as a zero to anyone comparing the two. It belongs on the deploy checklist for that reason, not in a commit message.

**Test.** Host-mapped local origin (the v15 fixture pattern: `--host-resolver-rules MAP j3k0.github.io 127.0.0.1`, local server, `fetch` intercepted). Then:

- `…#classic~~500` → `chal_seen` present in the emitted key set.
- `…#classic` (not a challenge), `…#daily~~40` (daily is rejected by `parseChallengeUrl`), `…#bogus~~40` (unknown mode) → absent.
- Mutation: delete the non-null guard on `parseChallengeUrl`'s result and confirm the negative cases fail.
- Shell half: `counter-snapshot.sh --dry-run` must print the new key; mutate by removing it from `KEYS` to prove that check can fail.

## B. The copy — words for sign-off, and the gate that keeps them honest

Candidates (measured today, 2026-11-18, so the counts are current):

- `<title>` / `og:title`: **Snakes — a rival snake is racing you for the food**
- `og:description` / `description` / `twitter:description`: **One snake, one rival that eats your food first, rifts that ignite on a timer. Eight modes from Zen to a five-wave gauntlet. No install, no account, no ads, no trackers.**

Both counts are code, not prose: `MODE_CONFIG` (`snake.html:1662`) holds exactly **8** modes — classic, timeAttack, zen, daily, snap, walled, painter, gauntlet — and `GAUNTLET_WAVES` (`snake.html:1080`) holds exactly **5** waves, which is the same number the run-over overlay already prints (`Wave X/5`).

**Gate.**

- `og:description` must contain `"rival"`.
- Every count in the copy must be derived from its source symbol (`Object.keys(MODE_CONFIG).length`, `GAUNTLET_WAVES.length`) — never hand-typed. "Eight" is exactly the kind of number that goes stale the day a mode is cut, and modes have been cut before.
- The "no ads / no trackers" clause is backed by `grep -c '<script src' snake.html` == **0** — measured today: the artifact contains one inline script and no external script of any kind.
- v15 F9's absolute-URL assertions on `og:image` / `og:url` stay.

**Mutations to run.** Write "Nine modes" while `MODE_CONFIG` holds 8 → must fail. Add any `<script src="http…">` to the file → the no-trackers assertion must fail (that one also forces the copy to be re-justified, which is the point).

**Risks.** The card names two things a stranger meets inside the first minute and promises nothing else: no multiplayer, no accounts, no leaderboards, no cross-device save — each of which would be a lie. Click-through itself remains **deploy-gated**: after 2026-12-15, the check is a `start/load` delta on `ch_github` between two 30-day windows. Never a green tick now.

## C. The plan, with dates

| When | What |
|---|---|
| now → 2026-12-15 | Freeze holds. A and B land on `feat/v16-cycle`, are reviewed there, **are not deployed**. Launch note written; the ★ accounts in `v16-ideas-arrival.md` §6 checked (all of them need JC). |
| 2026-12-15 | `counter-snapshot.sh --window` → the FOV-2741 verdict (continue / patch-once / park). Nothing posted beforehand. |
| +1 → +7 days | One announcement window, several channels at once: a second itch post + Newgrounds (already mapped to `ch_other` by `snake.html:244`), r/WebGames only if JC un-defers it. One build — no per-channel variants. |
| ~2027-01-14 | Read `start/load` and `first_food/start` **per `ch_*`**. That is the answer to "which door has players behind it", and realistically the only arrival number this project will ever get. |

If the 2026-12-15 read says **park**, this document is the only arrival lever still on the table — which is why it is written now rather than after.
