# v16 ideas — Lens 1: arrival (how players find Snakes without JC posting it)

Written 2026-11-16 on `feat/v16-cycle`. Read: `v16-ideation-context.md`, `AGENTS.md` (§Deliberate non-fixes / v15 / Shareable Runs / Touch Panel Menu), `v15-design-plan.md` (style), `v16-ideas-outsider.md` headers (it owns cold start, the shortcut wall, tap-to-pause, the recap row; not repeated here).

Measured, not remembered (read-only; **no browser launched** — time budget, so every fails-today test is written for the implementer and none is green):

- `grep -n -i "<meta|og:|twitter" snake.html` → the link-preview tags, lines 12–21, quoted in §4.
- `sed -n '236,265p' snake.html` → `isCountedHost` / `channelForHost`: exactly three hosts (`j3k0.github.io` → `ch_github`, `*.itch.zone` → `ch_itch`, `*.newgrounds.com` → `ch_other`). Everything else returns **before the `load` key** (`snake.html:258`) — an unlisted host is 100 % invisible.
- `grep -n "snakeBump("` → 21 sites, 15 keys (`load`, `day-*`, `ch_*`, `start`, `finish`, 6 death buckets, `first_food`, `keys`, `touch`, `overlay_gone`, `paused_early`) — **no key for a challenge link opened or accepted.**
- `sed -n '806,820p'` → `parseChallengeUrl` (`mode~~score`, live on this branch). `ls og-image.png` → 76,966 bytes, present.
- Node strip-tag count: **48 words of DOM text outside `<canvas>`/`<script>`/`<style>`**, mostly hidden panel chrome and D-pad glyphs. `ls robots.txt sitemap.xml` → neither; `grep noindex` → none. Indexable, and silent.
- External (6 queries / 2 searches; one follow-up fetch 404'd): `developers.poki.com/guide/sdk-html5`, `/sdk-overview`, `/how-monetization-works`; CrazyGames docs + Portal T&Cs 18.08.2025; GameDistribution SDK + partnership; Newgrounds / Game Jolt submission.

## Top 5

1. **CrazyGames Basic Launch is the only large-portal door open to this build as it stands** — SDK optional, monetisation disabled, ≤50 MB initial download against our 571 KB single file.
2. **Poki, GameDistribution and CrazyGames Full Launch are a FINDING, not a workaround**: each makes a third-party ad + telemetry SDK mandatory, which breaks "no monetisation, no third-party analytics".
3. **Newgrounds is already instrumented** (`snake.html:244` maps `*.newgrounds.com` → `ch_other`) and needs **no SDK at all** — the cheapest post-freeze arrival test exists in code today and is blocked only on an account and JC's 2026-11-15 deferral.
4. **After deploy we cannot say which channel worked**: three hosts are counted, a portal is not, and a shared link has no key. That gap has to be raised before anyone submits anything.
5. **Fix the copy that is already served before building more arrival**: the crawlable page is 48 words and every shared link renders the same generic card, because a `#mode~~score` fragment never reaches a crawler.

## 1. Portal triage: what each portal demands, and every violation by name

**What.** Which arrival surfaces a single-file, no-build, cookie-less, ad-free, account-free game can technically and legally stand on.

**Why.** Current docs, quoted:

| Portal | Technical demands on our file | Process & terms | Funnel? | Compatible? |
|---|---|---|---|---|
| **Poki** | remote SDK; `init`, `gameLoadingFinished`, `gameplayStart/Stop`, `commercialBreak`, `rewardedBreak`; mute + input-off during ads; `preventDefault` on arrows/space/wheel; a mobile "Poki Pill" (46×62–92×64 px) over the game, never below 50 % of its area | self-serve upload + Inspector, then "send us a review request and we'll play the game" (human, undocumented bar); ad revenue share, account + contract | **No** — not in `isCountedHost` | **No** (ad SDK, telemetry, monetisation) |
| **CrazyGames Basic Launch** | ≤50 MB initial / ≤250 MB total / ≤1500 files; visual QA; "Land directly in gameplay"; PEGI12. SDK + `GameplayStart` only at **Full Launch**: "The CrazyGames SDK is optional and monetization is not available" | 2-step; upgrade "determined solely by CrazyGames based on editorial, quality, and/or performance criteria"; Portal T&Cs 18.08.2025 grant publisher rights — **exclusivity terms unverifiable, fetch 404'd** | No | **Conditionally yes** |
| **CrazyGames Full Launch** | own SDK only, ads only through it, works with AdBlock, account link + avatar + auto-login | as above | No | **No** |
| **GameDistribution** | SDK load **before gameplay**, mandatory ("mandatory for all games to have our SDK implemented"); per-game `gameId`; pre/mid-rolls via `showAd()` behind mouseUp; mute+pause on `SDK_GAME_PAUSE`; GDPR tracking events; approval needs a demo ad watched in full in their iframe | upload + QA + "no identical games in our catalog"; revenue share; marketing claims "most of our publishers work exclusively with GD" | No | **No** |
| **Newgrounds** | zip with `index.html` at the root; relative paths; iframe on their domain; self-rating + cover + tags | self-serve, but **public judgment: "if a sufficient score is not achieved … the submission will be blammed, aka deleted"**; site ToS | **Yes** → `ch_other`, already | **Yes** (no SDK) |
| **Game Jolt** | account, zip, set main file, iframe player | self-serve; site ToS | No | Yes technically, uncounted |
| **itch.io** | live today (upload 20562214), iframe on `*.itch.zone` | live | **Yes** → `ch_itch` | **Yes** |
| **Playgama / GameTree** | not verified in budget | — | No | unknown |

Two facts worth more than the table: Poki and CrazyGames both require "land directly in gameplay" / first-input `gameplayStart()` — independently corroborating the outsider's cold-start item, since a portal will not accept the current intro screen. And CrazyGames offers hands-on support only **after 50 k combined plays**: the arrival problem in one line.

**How.** No `snake.html` change. `isCountedHost` (`snake.html:241`) is where a host gets mapped and `channelForHost` already has a `ch_other` fallback, so **a portal costs one string, not a feature** — but that string is a funnel-key change, so it is JC's.

**Fails-today test.** Playwright on `file://` with a stubbed `fetch` and `isCountedHost = () => true` patched, asserting the key set per hostname (`poki.com` → **zero** keys today; mapped → `ch_other`). Mutation: delete the `.itch.zone` line and confirm the itch fixture stops counting `load`.

**Risks.** A portal iframe re-scopes `localStorage` to their origin: streaks, quests, diary, export and the save snapshot silently start empty. That is a string-accuracy problem too — nothing may promise "your progress is saved" where another site's save is unreachable. Check on the itch build after the freeze (deploy-gated).

## 2. FINDING (report, do not work around): the ad networks cannot take this game

**What.** Poki, GameDistribution and CrazyGames-Full-Launch — the three highest-reach self-serve HTML5 surfaces — each make a third-party ad SDK with telemetry a condition of publication. The biggest arrival channels sit outside this cycle's constraints.

**Why.** Cited above: Poki's SDK *is* the ad + metrics system; GD says "mandatory for all games"; CrazyGames: "Only ads served through our SDK are allowed". Poki's API also carries accounts (`getUser`, `getToken`, `login`) and `enableEventTracking()`.

**Fails-today test.** None — a decision, not a feature. The falsifiable artefact is a written answer from JC: submit-with-SDK, or nothing. **deploy-gated** if he submits: post 12-15, "the build served from the portal origin emits `load` + `ch_other` + `start`" (needs §1's mapping).

**The workaround I am not proposing.** A portal-flavoured copy with the SDK injected at upload is possible with no build step, and wrong: two artifacts whose strings drift is a "nothing advertised is a lie" failure mode, plus ads on a game promised ad-free.

## 3. Nothing in the product can tell us whether arrival worked

**What.** Two cheap gaps: (a) hosts outside the three-host allow-list are invisible, so a successful portal or Game Jolt launch produces literally zero counters; (b) opening a challenge link fires no key, so "did Share ever bring anyone" is unanswerable in perpetuity.

**Why.** Measured: 21 `snakeBump` sites, no challenge key; `snakeBump` returns before the `load` fetch on an unlisted host (`snake.html:258`). The decision rule reads `ch_github` loads plus two ratios — portal traffic **cannot** satisfy the rule even if it existed. Worth saying before anyone treats a portal as a way to save the verdict.

**How.** One additive key (`chal_seen`, once per load when `parseChallengeUrl` returns non-null — the hash handlers, `snake.html:10368` / `10387`) and, if a portal is used, its hostname in `channelForHost`. Neither moves a threshold or a ratio. **Both are funnel-key changes → JC's call, tagged not done.**

**Fails-today test.** Host-mapped local origin (the v15 fixture pattern: `--host-resolver-rules` + intercepted fetch): load `…#classic~~500`, assert `chal_seen` in the emitted set; load `…#classic`, assert it is absent. Mutation: delete the `parseChallengeUrl` guard and confirm the negative case fails.

**Risks.** More keys on a ~3-load sample is noise, not signal. If JC keeps the keys frozen (his right), the correct output here is a release note stating that share attribution is permanently unknown.

## 4. The copy that is already served: link previews and the fragment ceiling

**What.** Rewrite the tags that ship today so a pasted link sells the *game* rather than the artifact, and record what no-backend architecture makes impossible.

**Why.** Served today (`snake.html:12–21`, verbatim): `<title>Snakes</title>`, `og:title "Snakes"`, and `og:description` / `description` / `twitter:description` all identical — `"One HTML file. Eight modes. A rival snake that eats your food."` — with absolute `og:image`/`twitter:image`. Two problems. The copy addresses a developer reading a repo link: "One HTML file" is the implementation, and next to arcade cards that promise a feeling it loses. The truthful player-facing version of that line is the rival mechanic — the only thing in it a stranger meets inside sixty seconds. Second, structural: `parseChallengeUrl` puts the challenge in the **fragment** (`CANONICAL_SHARE_BASE + '#' + hash`, `snake.html:659`), and fragments never reach a crawler, so every challenge link renders the same generic card with no score. **That half cannot be fixed without a backend** (FINDING: a rendered per-link preview means a second service) — and it is already honestly covered: `copyChallengeLink`'s text ("Beat my 480 in Classic — link") carries the score into the message the recipient actually reads.

**How.** Lines 6 and 12–14: a `<title>`/`og:title` naming game + hook, one description naming a mechanic a first-timer meets in a minute, `twitter` inheriting the same strings. Zero layout cost, zero board-height cost.

**Fails-today test.** A gate that reads the tags *and the config objects they describe*: `og:description` must contain "rival", and every count in it must equal its source (`Object.keys(MODE_CONFIG).length === 8`). Mutation: write "nine modes" and watch it fail. v15 F9's absolute-URL checks stay.

**Risks.** "Nothing advertised is a lie" cuts both ways — a card promising multiplayer, leaderboards or accounts is a lie; "a rival snake that eats your food" is true and testable. Click-through itself is **deploy-gated**: post 12-15, a `start/load` delta on `ch_github` between two 30-day windows. Never a green tick now.

## 5. Forty-eight words of page: search arrival, and what it is worth

**What.** Do the zero-cost half (title + description, §4) and stop there.

**Why.** Measured: no `robots.txt` / `sitemap.xml`, no `noindex`, 48 non-canvas DOM words, a 6-character `<title>` — twelve cycles of mechanics painted into a bitmap. Portal/social arrival dwarfs this channel (GameDistribution alone markets +350M monthly gameplays).

**How.** Title + `meta description` (§4) and nothing more: a prose block below the canvas **costs board height** (`resizeCanvas` measures essential chrome above and below; `updateMenuFooter` re-runs it), and CSS-hiding it is Google-classified hidden text that buys nothing durable.

**Fails-today test.** Re-run the strip-tag count and assert `<h1>` + `meta description` name a real mechanic and that no new text sits in a `display:none` container. Mutation: delete the description and watch it fail.

## 6. The honest objection, and the ranking

**What.** At ~3 loads per window, no mechanism inside a product brings arrival. Rank routes by documented reach ÷ effort, and split them by who can open them.

**Why.** Both large portals gate on a human editorial call with an undocumented bar (Poki: "we'll play the game"; CrazyGames: the upgrade is "solely" theirs, on performance). Portals amplify a signal we do not have yet — build quality is not the blocker; the missing thing is a *post*. One announcement has ever existed (itch, 2026-11-15) and `ch_github` has never fired: the canonical URL has had **zero deliberate visits** in the window — smaller than "nobody found us", and far cheaper.

**Ranking (reach ÷ effort; JC-only marked ★):** 1. **Newgrounds post** — counted (`ch_other`), no SDK, self-serve★; risk: public judgment can delete it. 2. **Second itch announcement / collections + awesome-happenings** — counted (`ch_itch`), zero code★. 3. **CrazyGames Basic Launch** — no SDK, our build fits the size rules; developer account★, terms unverified, uncounted. 4. **Game Jolt**★ — same, lower reach. 5. **r/WebGames**★ (JC deferred it; not mine to re-litigate). 6. **Poki / GD**★ — highest reach, blocked by §2. 7. **Search** — last.

**Sequencing (what the funnel makes non-obvious):** the channel keys already isolate each surface, so posting on several channels in one window does **not** contaminate the `ch_github` read — it measures each separately. But any announcement restarts day 0, so the post-freeze playbook is one decision: pick channels, post in one window, read `start/load` per `ch_*` at +30 days.

**Fails-today test.** None in code — the deliverable is a launch note listing channels, the ★ accounts needed, and the per-channel check to run 2027-01-14 (**deploy-gated**).

## Rejected (with reasons)

- **Poki / GD / CrazyGames Full Launch integration now.** Mandatory third-party ad + telemetry SDK; breaks no-monetisation and no-third-party-analytics. Reported as a finding (§2), not worked around.
- **A forked "portal build" with the SDK injected at upload.** Two artifacts whose strings drift; a silent lie about an ad-free game.
- **Server-rendered per-challenge OG previews.** Needs a backend. The sender's copy text already carries the score.
- **New share machinery (replay links, ghost challenges, invite codes).** FOV-2729 ships the link and the recap Share button on this branch, undeployed; the loop is closed except measurement (§3).
- **Crawlable prose under the canvas.** Costs board height against the v15 F2 cap; CSS-hidden text buys nothing.
- **Leaderboard / lobby integration.** Third-party account APIs; `getUser`/`login` is not optional once you want Poki's players.
- **In-game "share to X" buttons, referral codes.** Third-party calls, no backend to verify a referral — a promise we cannot keep.
- **The r/WebGames / Newgrounds posts as v16 work items.** Deferred by JC 2026-11-15; §6 lists them only as routes he can open.

---

*Decisions on these questions (2026-11-18) and the resulting work specs — the attribution key and its report-side blocker, the link-preview copy with its truthfulness gate, and the dated launch plan — live in [`v16-arrival-decisions.md`](v16-arrival-decisions.md).*
