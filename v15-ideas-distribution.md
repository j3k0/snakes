# v15 ideas — lens 3: distribution and the return path

Written 2026-11-13 by the issue owner, against `d19f055` / game `ee0e3f2`. Same process
note as `v15-ideas-first-contact.md`: self-authored because the three ideation subagents
all failed on a degraded endpoint.

Venue facts are from itch.io's own docs (https://itch.io/docs/creators/html5, fetched
2026-11-13) and an itch.io community thread; where I could not verify something it says
so. Game facts are `snake.html` lines or `ctx §n`
(`v15-ideation-context.md`).

## Top 5

1. **Link-preview metadata.** The URL currently produces no card anywhere it gets
   pasted — the cheapest click-through win available and the one that makes JC's posts
   work. Cost S.
2. **A shareable run that exists:** a score-only challenge link plus a hard-coded
   canonical URL. Today sharing is `K`, at game over, only if the run was seeded — so
   for every real player, sharing does not exist (ctx §8, §9). Cost S–M.
3. **Channel from the hostname, not the URL.** itch does not pass query parameters into
   the game iframe, so a `?ch=itch` marker never arrives; the beacon gate has to become
   a hostname allow-list. Cost S.
4. **The share moment on the recap card,** with a hit area tested before the catch-all
   tap and a guard so the card survives a reflex tap (ctx §7). Cost S.
5. **The right itch embed settings for a 440×600 portrait canvas** — and an honest
   statement of what "under ten seconds" means when itch inserts a click of its own.
   Cost S (settings) — no code.

---

## 1. Link preview metadata

- **What.** Add `<meta name="description">`, `og:title`, `og:description`,
  `og:image`, `og:url`, `twitter:card`; change `<title>Snake Game</title>` to the name
  the project actually uses; commit one 1200×630 preview image to the deploy repo.
- **Why.** Verified in the deployed file: the head is `charset`, `viewport`, `title`,
  the inline manifest and `theme-color` — **no description, no Open Graph, no Twitter
  card**. A pasted link to Reddit, Discord, Discord-likes or Twitter therefore renders
  no preview: the post is a bare blue line among screenshots. This is the only idea in
  v15 that changes how the *post itself* performs. It also affects the itch page (itch
  takes its own cover, but the game-page title is ours).
- **How.** ~8 lines in the head of `snake.html` (so the deploy copy carries them), an
  absolute `og:image` URL on the Pages origin (`https://j3k0.github.io/snakes/preview.png`)
  — no relative URL, cards do not resolve them — plus the PNG in the deploy repo next to
  `index.html`. The image is one screenshot of a mid-run frame, chosen by hand; do not
  build a generator.
- **Verify.** After deploy, fetch the page and assert the five tags exist and that
  `og:image` resolves (a HEAD request returns 200 with `image/png` and a sane size).
  Today every one of those assertions fails. Mutation: make `og:image` relative and the
  resolution assertion fails — which is the trap this assertion exists for.
- **Cost** S. **Risk.** None functional. The image must not contain anything we would
  not want public (it will be cached by third-party services).

## 2. A shareable run that actually exists

- **What.** A **score-only challenge link**: `https://j3k0.github.io/snakes/#classic~~120`
  meaning "beat 120 in Classic", minted by a control on the recap card. Seeded links keep
  working as they do today.
- **Why.** ctx §8: `K` (`:9420`) copies a link only when `activeSeed !== null` *and* at
  game over — an ordinary run has no seed, so for a normal player the share feature does
  not exist. ctx §9 rules out minting a seed per run (too late — the seed is derived in
  `resetGame()` — and too wide: it would delete the speed-food boost at `:8114` for
  everyone and write a replay for every run). The format already carries a score
  (`parseChallengeUrl` reads `parts[2]` at `:636`) and the in-game target HUD (`:7203`)
  never reads the seed — so a score-only link is nearly free. Only `:635`
  (`if (!seed …) return null`) blocks it.
- **How.** Accept an empty seed when `parts[2]` is present; the accept path (`:9132`)
  then leaves `seedField.value` empty instead of setting a seed, so the run stays
  non-deterministic and `activeSeed` stays `null` — the whole seeded-only surface
  (replays, ghosts, speed food) is untouched. Keep `CHALLENGE_URL_VERSION` at 1 and note
  the two forms in the code comment. Daily stays rejected (a shared daily would collide
  with the attempt/streak rules). Canonical URL: build share text from a
  `CANONICAL_BASE = 'https://j3k0.github.io/snakes/'` constant, never from
  `location.origin` — in an iframe `location.origin` is `*.itch.zone`, and itch's own
  community says those nested links change between versions
  (`https://itch.io/post/15113047`), so an itch player would share a link that rots.
- **Verify.** Assert `parseChallengeUrl('classic~~120')` returns
  `{mode:'classic', seed:'', targetScore:120}`, that `classic~~` (no score) is still
  rejected, that `daily~~500` is still rejected, that `zen~abc~50` parses unchanged, and
  — the one that matters — that after accepting a score-only challenge
  `activeSeed === null` and `tickInterval === getEffectiveSpeed()` (i.e. speed food still
  works). Mutation: set `seedField.value = seed` unconditionally in the accept path and
  watch that last assertion fail.
- **Cost** S–M. **Risk.** Silent behaviour change in a parser that has one version field;
  the seeded path must stay byte-identical, which is what the third assertion is for.

## 3. Channel from the hostname

- **What.** Derive the funnel channel from `location.hostname`, and change the beacon gate
  from "only `j3k0.github.io`" to an explicit allow-list: `j3k0.github.io` plus the game
  hosts itch and Newgrounds serve from.
- **Why.** The gate is one hostname today (`:142`), so an itch or Newgrounds player counts
  **nothing** — the two channels JC is about to post to would be invisible, and
  "did the itch post bring loads" would be answered by zero. Query parameters are not an
  alternative: itch's own community carries an open request for passing them into the game
  iframe (`Pass the query parameters down to iframe`), i.e. today they are not passed. And
  the hash is already taken by the challenge format, so `#ch=itch` would be parsed as a
  mode and rejected — that is a real collision, not a style note.
- **How.** A `CHANNEL_BY_HOSTNAME` map (`j3k0.github.io` → `github`,
  `*.itch.zone` → `itch`, `*.newgrounds.com` → `newgrounds`, else `other`) read at module
  init; the beacon fires for any hostname in the map. `localhost`/`file://`/CI hosts stay
  outside the map, so the "inert in tests" rule is preserved — the allow-list is a
  narrowing of the same idea, not a loosening. Cross-posted mirrors on other game sites
  land in `other` and are still a signal.
- **Verify.** In Chromium, load the page from `http://localhost:<port>` and assert **no**
  request to the counting host; then load with the hostname check stubbed to
  `j3k0.github.io` and to `foo.itch.zone` and assert one request each, with the channel
  key differing. Mutation: change the gate back to a single equality and the itch case
  produces no `ch_itch` — the assertion fails.
- **Cost** S. **Risk.** A deliberate change to a recorded invariant ("beacons stay inert
  off `j3k0.github.io`") — `AGENTS.md` and `DEPLOY-2026-10-19.md` must both be updated in
  the same commit, and the privacy statement has to stay exactly true: same anonymous
  keys, no cookies, no fingerprint, no IP collected by us.

## 4. The share moment, where the player is

- **What.** Two controls on the recap card: **Copy challenge** (idea 2's link) and
  **Copy link**. Each needs a hit area tested before the `gameover` catch-all, plus the
  ~500 ms guard from lens 1.
- **Why.** The recap card is the only screen that shows a score, and the only moment a
  player wants to say something about it (ctx §7). Today a tap there restarts, so the card
  is not a surface anything can live on; `K` is undiscoverable and does nothing for an
  unseeded run.
- **How.** `drawRecapCard()` already runs a running cursor since v12 C, so a row of two
  labelled buttons fits the existing layout; the `touchend` handler's game-over branch
  (`:9666`) evaluates those rects first and returns, then falls through to `Enter`.
  Copy text: `Beat my 120 in Snakes — <canonical link>`, with no score for a 0-score run.
  Reuse the existing `fallbackCopy` path (`:651`) so HTTP contexts still work.
- **Verify.** Assert (a) a Share tap leaves `gameState === 'gameover'`, (b) the clipboard
  text equals the expected string with the canonical host, and (c) a tap outside the
  buttons still restarts. Mutation: move the Share check below the catch-all and (a)
  fails — which is precisely the bug this idea would otherwise ship with.
- **Cost** S. **Risk.** Clipboard writes need a user gesture and a secure context; the
  existing fallback covers the rest. On itch the copy is the canonical Pages link, so
  shares leave itch — intended, and worth saying out loud to JC.

## 5. The itch embed settings that fit this game

- **What.** On the itch project: upload the game as a **single HTML file named
  `index.html`**, mark the project **Mobile Friendly**, use **Click to launch in
  fullscreen** as the mobile behaviour, set the embed-in-page viewport to **440×600**,
  leave **Click to Play** on, and turn the itch **fullscreen button** on.
- **Why.** From itch's docs: an HTML5 project is embedded as an iframe pointing at our
  uploaded code, uploaded either as a ZIP with an `index.html` entry or as **a single HTML
  file containing the entire game** (this is us — the file is self-contained); the embed
  options are "Embed in page" (you provide the dimensions) or "Click to launch in
  fullscreen"; and when a project is marked **Mobile Friendly**, itch uses fullscreen
  launch on mobile — which is exactly what a 440×600 portrait canvas needs, and it is the
  difference between a playable phone frame and a 300-px strip. Scrollbars are hidden by
  default, which we want: our own layout bug (ctx §5) must not be made scrollable-in-an-
  iframe instead of fixed.
- **Honest cost to the theme.** Click to Play means an itch visitor clicks once before
  the game's own load starts. v15's "URL to moving snake in under ten seconds" is measured
  from the game document's load, **not** from the itch page — say that in the code review
  and in the post, or the claim is a lie by framing.
- **How (no code).** Itch settings only, plus a naming rule in the deploy step: the file
  uploaded is `index.html`, which makes the single-file route and the ZIP route
  interchangeable if we ever need assets.
- **Verify.** After the account exists: open the itch page on a mobile viewport
  (emulated is enough for layout), launch, and assert the game canvas height in the iframe
  is at least 80% of the frame height — and run the lens-1 viewport-fit assertions inside
  the iframe. This is the only idea in v15 that can only be *fully* verified by a human
  with an account.
- **Cost** S. **Risk.** Unverified: whether itch's iframe gets **storage partitioning**,
  i.e. whether localStorage written inside the itch frame persists across sessions and
  whether it is separate from the Pages copy. Modern browsers partition third-party
  storage, so plan for "progress made on itch lives on itch". Consequence: XP, unlocks,
  quests and the diary do not carry between itch and the web URL, and a player will report
  that as a bug. **Check it explicitly** once the page exists (play a run, reload, read
  `snake_xp`), and if it is partitioned, decide whether to keep the itch build or point
  itch at the Pages URL in its description.

## 6. Keep the public copy true before and after v15

- **What.** One wording for the tracking claim that is accurate today and after the funnel
  keys ship; fix the deploy repo's stale README.
- **Why.** The current draft says "no tracking beyond an anonymous hit counter"
  (`/opt/shared/reports/snakes/community-post-draft.md`) and the deploy `README.md` says
  "3 keys: page loads, games started, games finished". Both are already slightly wrong —
  there are four (the per-UTC-day key exists), and v15 takes it to about ten. A post that
  overstates privacy is the v12 standard failing on the marketing side.
- **How.** Use: *"the only network request the game makes is one anonymous, cookie-less
  counter — no accounts, no analytics platform, no fingerprinting, no personal data."*
  That sentence is true at 4 keys and at 10. Update the README with the actual key list at
  deploy time, and link it from the post so the claim is checkable.
- **Verify.** A grep assertion in the suite that the file contains no counting host except
  in the one constant (lens 2, idea 8) — so the copy can never quietly outrun the code.
  Human: the post text lives next to the code it describes in `/opt/shared/reports/snakes/`.
- **Cost** S. **Risk.** Low; the failure mode is embarrassment.

## 7. The challenge landing screen needs two buttons, not one key

- **What.** On the "Challenge!" landing overlay: **Play** and **Not now**, tappable.
- **Why.** ctx §8: the overlay says "Press Enter to accept challenge" / "Press Escape to
  dismiss" (`:6628`). On a phone a tap accepts (the idle tap dispatches `Enter`, `:9666`)
  and **there is no way to decline** — a friend's link is a trap you cannot get out of,
  which is a bad first screen for exactly the visitor idea 2 is trying to create.
- **How.** The overlay already draws at fixed y positions in the canvas and the tap handler
  already maps taps to canvas coordinates; accept and dismiss set/clear `challengeFromUrl`
  the same way `Enter`/`Escape` do (`:9132`), with `history.replaceState` to clean the URL.
- **Verify.** Assert a tap on "Not now" leaves `gameState === 'idle'`,
  `challengeFromUrl === null`, and the hash cleared; a tap on "Play" starts the challenged
  mode with the target HUD visible. Today both fail on a touch context.
- **Cost** S. **Risk.** Must not collide with the welcome overlay, which also swallows the
  first tap on a fresh profile — decide the precedence explicitly (a challenge link to a
  brand-new visitor should show the challenge, not the welcome overlay; today
  `drawChallengeOverlay` is drawn *instead of* the idle menu but the welcome overlay still
  covers the canvas — verify, do not assume).

## 8. Newgrounds: same shape as itch, less verified

- **What.** Submit to Newgrounds' games area as an HTML5 project; expect an embed served
  from their domain, and the same funnel treatment as itch (idea 3's hostname map).
- **Why / status.** **I could not verify Newgrounds' current HTML5 submission mechanics
  from here** as of 2026-11-13, so I am not writing steps I have not checked. What is safe
  to say: whatever host they serve the game from, it is not `j3k0.github.io`, so the
  beacon gate must cover it (idea 3) or the post is unmeasurable, and the share text must
  be canonical (idea 2).
- **How.** One line in the deploy checklist: "verify the serving hostname from the live
  embed, add it to `CHANNEL_BY_HOSTNAME`, then re-check the counter for that channel".
- **Verify.** After the post: the channel key for Newgrounds is non-zero. If it is zero
  while people report playing, the hostname is not in the map — a finding, not a mystery.
- **Cost** S. **Risk.** Unverified venue mechanics; do not promise a Newgrounds date in the
  post copy.

## 9. What the post must contain so the first tap lands somewhere sane

- **What.** Each post links **the Pages URL directly** (not the itch page, not the nested
  iframe URL), says "plays in the browser, no install, works on a phone", and carries one
  screenshot or GIF.
- **Why.** Three different URLs are available and one of them rots (idea 2). The nested
  `itch.zone` link is unstable between versions per itch's own community, the itch page
  adds a click and a store frame around a free game, and the Pages URL is the one place
  the funnel is honest (`ch_github`) and progress persists unpartitioned. itch and
  Newgrounds still matter for *discovery* — they are where people browse — but the shared
  link should be one URL.
- **How.** Post text (drafted separately in
  `/opt/shared/reports/snakes/community-posts-2026-11.md`), with the itch page still
  carrying the canonical URL in its description so the two routes agree.
- **Verify.** Every published post contains the same literal URL; a month later the funnel
  shows both `ch_github` (from the posts) and `ch_itch` (from browsing) — which is exactly
  the split idea 3 exists to make visible.
- **Cost** S. **Risk.** Directing itch traffic to Pages loses itch's own discovery surface
  inside the game. Accepted: the itch page is the discovery surface, not the game frame.

## 10. A vanity domain is not a v15 item

- **What.** Say it and leave it: no custom domain this cycle.
- **Why.** `snakes.fovea.cc` or similar is a short job for the owner, but it changes the
  origin the funnel is anchored to (idea 3's map, the canonical constant, the beacon gate)
  mid-window — i.e. it breaks the measurement the cycle exists to make, in exchange for a
  prettier URL.
- **How.** Revisit after the December read, when a stable origin and a distribution
  decision can be made together.
- **Cost** S. **Risk.** None, as long as the reason is written down.

---

## Rejected (with reasons)

- **A leaderboard or "beat my score" server.** Needs a backend, accounts and moderation —
  explicitly out of scope, and the score-only link already delivers the social hook with
  zero infrastructure.
- **UTM-style query parameters for attribution.** itch does not pass query params into the
  game iframe, so half the channels would lose them; the hash is occupied by the challenge
  format. Hostname gives the same answer honestly (idea 3).
- **An automated og:image / cover generator** (Playwright screenshot on deploy). One
  hand-picked image is enough; a generator is a build step in disguise.
- **Cross-posting to every game aggregator.** The plan allows one post per venue; spamming
  small communities is how a free game gets reported, and it would make the channel data
  meaningless.
- **Pricing or donations on itch.** itch HTML5 games are donation-only anyway
  (per their docs), and monetisation is out of scope for v15.
- **Making progress carry between itch and the web URL.** Needs an account system and a
  backend; and it would change the privacy promise. If storage turns out partitioned
  (idea 5), the answer is to keep the itch build honest, not to build sync.
- **Belonging to lens 1:** the CTA, viewport fit, panel reachability, the tap guard.
- **Belonging to lens 2:** the key set, the opt-out, the report, the decision rule.
