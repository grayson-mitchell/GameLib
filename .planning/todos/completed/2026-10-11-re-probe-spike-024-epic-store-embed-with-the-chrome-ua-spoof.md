---
created: 2026-10-11T10:07:47.627Z
title: 'Re-probe spike 024 with the Chrome UA spoof OFF — all five Epic-store runs stamped a Chrome 131 UA onto WebKit and the README never names it as a variable'
area: webview/store-embed
severity: medium
platform: macos
ready: live-gate
status: completed
resolution: measured-still-challenged
resolved: 2026-10-11
resolved_by: "quick-261011-w8j"
found_by: 'Session review 2026-10-11, re-reading spike 024 against its own harness code and run logs after the question "have we exhausted options before moving on"'
files:
  - .planning/spikes/024-epic-store-in-embedded-child-webview/README.md:146-156
  - .planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs:29
  - .planning/spikes/024-epic-store-in-embedded-child-webview/app/src/main.rs:258-260
  - .planning/spikes/024-epic-store-in-embedded-child-webview/app/dist/index.html:53
  - src/frontend/screens/WebView/index.tsx:549
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx:37-52
  - src/frontend/screens/WebView/storeEmbedOrigins.ts:48
  - src/backend/storeManagers/legendary/games.ts:137
---

## RESOLUTION — measured, still challenged, 2026-10-11 (quick `261011-w8j`)

**Arm 1 ran; the outcome is the table's second row.** Three fresh-container autoruns with no UA
override (runs 6–8), plus the optional second arm as two more fresh containers — the login window's
`EpicGamesLauncher` string (run 9) and a complete Safari 26.6 string (run 10) — were **all
challenged**, with the Steam positive control rendering in every run. The user agent is ruled out.
WONTFIX stands with better evidence; the runs are appended to the spike README (`### Runs 6–10`)
and to the WONTFIX todo, not reopened.

Two corrections to this todo's own text, recorded so the next reader does not inherit them:

- WKWebView's default UA does **not** carry `Version/x Safari/x`. With no
  `applicationNameForUserAgent` it is a bare `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
  AppleWebKit/605.1.15 (KHTML, like Gecko)`. Run 10 sent the full Safari string to cover that.
- "IP reputation is the surviving candidate" is now sharper: a warm, signed-in Safari jar on the
  same IP and engine **was served** during the same session (CGWindowList title = the real store
  title). So the IP is not blanket-blocked; what is challenged is a cold jar from this IP in this
  embedded webview. Separating "cold jar on this IP" from "the embedded webview itself" needs a
  Safari Private Window control or a different network — operator work, not run here (AppleScript
  to Safari was not authorised from the session).

The interactive arm was **not** run: with every unattended arm challenged there was no new
condition for a human to click under, and runs 4–5 already measured the click.

Part 2 (wording) landed: README consequence section, the `store === 'epic'` guard comment in
`WebView/index.tsx`, and the `reason="epic"` docstring in `WebviewUnavailablePanel.tsx` now say
"measured" with the reopen condition stated, not "permanent". Part 3's two alternatives (native
Epic storefront via the GraphQL catalog; the store in the pristine login `WKWebView`) remain
recorded below and unactioned.

## Problem

Spike 024 closed `/store/epic` as **permanently** scoped out of the embed: five runs, the store
rendered once on first contact, every later run hit a Cloudflare Turnstile challenge, and in the
interactive arm (runs 4–5) a human clicked "Verify you are human" and the challenge **re-issued**
rather than cleared. The README names two candidate causes — cookie state (falsified by run 3's
fresh container) and IP reputation (surviving, untested) — and concludes that only a change in
Epic's posture could reopen the question.

**The spike held a third variable constant across all five runs and never named it.** The
harness builder does `builder.user_agent(CHROME_UA)` when `spoof_ua` is true
(`app/src/main.rs:258`), with `CHROME_UA` a Chrome 131 on macOS string (`main.rs:29`). The panel
checkbox `spoof Chrome UA` defaults to **checked** (`dist/index.html:53`). The run logs confirm it:

```
grep -h -o '"spoofUa":[a-z]*' run*.log events-export.json | sort | uniq -c
  12 "spoofUa":true      # 0 occurrences of false
```

So every run presented a Chrome user agent from a WebKit engine. A UA string that claims Chrome
while the TLS fingerprint, JavaScript engine and feature surface say Safari is a known Cloudflare
bot-management signal, and it fits the observed shape better than IP reputation does:

- A reputation-triggered managed challenge normally **clears** when a human clicks it. A challenge
  that **re-issues indefinitely** after a click is the signature of a hard fingerprint fail that no
  click can satisfy.
- Run 1 passing on first contact is consistent with escalation on repeat anomalous visits.
- **In-repo counter-evidence the spike did not weigh:** the Epic login window — a pristine
  `WKWebView` sending the `EpicGamesLauncher` UA (`oauthLoginCapture.ts:71`), on the same engine,
  same machine, same residential IP — completed sign-in with `cf_clearance` ×3 **present** in the
  jar (memory `logging-out-of-epic-is-a-one-way-door-on-a-cold-jar`, 2026-09-28). That is a
  Cloudflare challenge **passed**, not bypassed, by a WebKit window on the IP the spike called
  spent. (That same investigation also recorded a UA hypothesis as a dead end — but for the login
  **timeout**, which turned out to be a disk-cache replay. It says nothing about the store.)

None of this proves the UA is the cause. It proves the spike cannot distinguish "Tauri webview is
blocked" from "a Chrome-on-WebKit UA is blocked", and that the cheaper of the two explanations was
never tested. "Permanent" is therefore overstated in three places: the README's
`## Consequence for /store/epic`, the `store === 'epic'` guard comment in `WebView/index.tsx`,
and the `reason="epic"` docstring in `WebviewUnavailablePanel.tsx`. As written they will stop the
next reader from looking.

## Solution

**1. The re-probe (the whole point).** Same harness, one flag flipped, nothing else changed:

```bash
cd .planning/spikes/024-epic-store-in-embedded-child-webview/app
CARGO_TARGET_DIR=../../../../src-tauri/target cargo run
# interactive panel: UNTICK "spoof Chrome UA", keep everything else as the README's runs 4-5
```

- Three unattended runs plus one interactive, per the README's own "re-run the interactive arm
  more than once" rule. Change `identifier` in `tauri.conf.json` per run for a fresh data store.
- Run the Steam positive control first each session, as runs 1–5 did.
- Capture the embed at a pixel-verified full viewport; the log cannot corroborate bounds
  (`set_embed_bounds` only logs when `!quiet`), which is what invalidated run 4.
- Record `navigatorUserAgent` from the probe so the arm is self-describing — WKWebView's default
  UA carries `Version/x Safari/x` and no `Chrome/` token.
- Optional second arm if the first still loops: send **no** `user_agent()` override at all versus
  the explicit `EpicGamesLauncher` string the login window already passes Talon with.

**Outcomes and what each does:**

| Result | Consequence |
|---|---|
| Store renders and stays rendered across ≥3 runs incl. the interactive one | Un-gate `/store/epic`: remove the `index.tsx:549` guard AND flip `storeEmbedOrigins.ts:48` together (the sibling todo records why both must move); wake `2026-09-15-epic-in-embed-sign-in-button-has-no-decided-behaviour`; the shipped embed must then NOT send a Chrome UA for Epic |
| Still challenged / still loops | IP reputation is the surviving candidate again, now with the UA ruled out. WONTFIX stands with better evidence; append the runs to the README |
| Mixed | Record it; do not generalise from one pass again — that is exactly how the first draft of the README went wrong |

**2. Soften the wording either way.** The README consequence section, the guard comment at
`index.tsx:549`, and the panel docstring all say the scope-out is permanent and only Epic's posture
could reopen it. Rewrite to "pending the UA re-probe (todo 2026-10-11)" before the re-probe, and
to whatever was measured after it. Comment-only edits to the two source files; prove identity with
a strip-comment diff as quick `261003-vgl` did.

**3. Two alternatives the spike never considered — record, do not action here.** Both land Epic
in-app without embedding the web storefront at all, so neither depends on the re-probe:

- **Native Epic storefront.** `legendary/games.ts:137` already calls
  `https://launcher.store.epicgames.com/graphql` from the backend with no Turnstile in the way,
  and the free-games promotions endpoint is a public JSON feed. Sales, free games and a product
  card with open-in-browser is most of what a store tab is for. Spike-sized question: does the
  catalog GraphQL surface enough for a browse page without a sign-in?
- **Load the store in the pristine login-window `WKWebView`** (`open_pristine_epic_login_window`,
  `src-tauri/src/main.rs`) instead of the Tauri child webview. Weaker lead — the injected globals
  were ruled out as the cause — but it is one config change and it is the window that already
  passes Cloudflare.

## Do not re-derive

- The Talon 403 on `/id/api/email/exists` is **login-scoped**; the store gate is **Turnstile**.
  Different mechanisms, different evidence. Spike 024 established this and it still holds.
- `embeddable: false` does **not** gate the direct route; only the `index.tsx:549` guard does.
  The sibling todo documents the trap.
- The WONTFIX todo is at
  `.planning/todos/completed/2026-09-05-store-epic-blocked-by-cloudflare-turnstile-in-the-embed.md`.
  Reopening it is the right move only if arm 1 passes; otherwise append to it, don't reopen it.
- The `webview.unavailable.epic.*` locale keys stay even if Epic is un-gated —
  `i18nCatalogChurnGuard` rejects non-`gamelib.json` removals and `removing-a-locale-key-has-three-traps`
  applies.
