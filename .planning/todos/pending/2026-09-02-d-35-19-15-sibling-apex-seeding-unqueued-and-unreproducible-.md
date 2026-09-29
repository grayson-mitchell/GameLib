---
created: 2026-09-02
title: "D-35-19-15's four Epic sibling apexes were never proven cleared — CORRECTED 2026-09-30: a CREDENTIAL-FREE, NON-DESTRUCTIVE seeding+sweep recipe exists (a plain window.api.oauthCaptureLogin navigation to a sibling apex, then the per-host sweep alone) — no Epic login, no logout, needed"
area: auth/webview
status: pending
severity: medium
platform: any
ready: live-gate
blocked_by: "NOT BLOCKED — unscheduled, ready:live-gate. CORRECTED 2026-09-30 (debug session
  epic-sibling-apex-non-destructive-discharge, re-opened): the previous form of this field (below,
  retained as SUPERSEDED HISTORY) said the only remaining open question was 'whether a cookie can
  be placed on one of the four apexes without an authenticated Epic login — untested'. That
  framing was itself wrong, and it was wrong because 2026-09-28's own E-5 measurement drew a
  non-sequitur from its own correct rule. The rule E-5 established is sound and stands: only a
  request served BY fortnite.com/unrealengine.com/twinmotion.com/metahuman.com can set a cookie on
  that apex, because a response from epicgames.com cannot set a cookie for a different registrable
  domain. But E-5 tested exactly ONE vehicle for such a request — the Epic login page at
  epicgames.com, which of course cannot satisfy that rule — and wrongly generalised the negative
  result to every vehicle. THOSE FOUR APEXES ARE PUBLIC, EPIC-RUN WEBSITES. A plain navigation to
  one of them (e.g. https://www.fortnite.com/) IS a request served by a sibling apex, and needs NO
  Epic credentials, no 2FA, no SSO cookie-sync, and no authenticated login at all.
  The vehicle for an arbitrary-URL navigation already exists:
  window.api.oauthCaptureLogin({ runner: 'legendary', url: 'https://www.fortnite.com/' }) (backend
  entry captureOAuthLogin, src/backend/sidecar/oauthLoginCapture.ts:207, which takes loginUrl as a
  plain unvalidated string — the runner-hardcoded EPIC_LOGIN_URL lives only in the React hook,
  useTauriOAuthLogin.ts:209, not in the preload API itself). In Rust, humble_login_open
  (main.rs:6284) computes is_epic_login = url.host_str() == Some(EPIC_LOGIN_HOST) (:6291), and
  EPIC_LOGIN_HOST is the exact string 'www.epicgames.com' (:2976) — a full-hostname equality
  check. For a fortnite.com URL, is_epic_login is false, so the pristine-webview branch
  (open_pristine_epic_login_window) is never taken; the ordinary
  tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url)) path (:6413)
  runs instead. That builder sets no data_store_identifier, no custom websiteDataStore, no
  incognito/private flag (confirmed by grep across main.rs and tauri.conf.json — zero hits for all
  three terms anywhere in this codebase), so per this file's OWN doc comment on
  clear_default_data_store_cookies_for_domain (main.rs:4159-4161): 'its cookies live in the SAME
  process-wide WKWebsiteDataStore::defaultDataStore() every Tauri-managed window already shares' —
  the exact store the non-destructive per-host sweep (below) already reads and clears.
  THE SWEEP DOES NOT NEED A LOGOUT EITHER, unchanged from the 2026-09-28 finding: humble_login_clear_cookies
  is a dispatch_rust_channel arm (main.rs:5657, arm :7128) taking [label, domain]; called with the
  Epic sentinel label and domain='fortnite.com' alone, it routes (existing_window.is_none() &&
  epic_cookie_domain_matches(domain), :7235-7237) to clear_default_data_store_cookies_for_domain,
  sweeping ONLY that one host — leaving the operator's live Epic session and epicgames.com cookies
  completely untouched. THE FULL RECIPE IS THEREFORE, FOR THE FIRST TIME: (1) from DevTools, call
  window.api.oauthCaptureLogin({ runner: 'legendary', url: 'https://www.fortnite.com/' }) and let
  the navigation settle (the capture promise itself never resolves without a matching redirect —
  cancel/close the window once settled; the cookies are already written by then); (2) read the
  per-host census (the existing independent reader,
  .planning/quick/260909-p4m-correct-the-stale-record-on-the-gog-amaz/gate-evidence/binarycookies-index-walk.py,
  against the flushed disk jar, OR the sweep's own in-memory before/after census if run within the
  same app session) and confirm fortnite.com is PRESENT; (3) dispatch humble_login_clear_cookies
  with the Epic sentinel label and domain='fortnite.com' alone; (4) re-read and confirm ABSENT.
  NO Epic credentials, no 2FA, no logout, and no destructive step anywhere in this recipe — it
  needs a live app run (DevTools access), which is why ready stays live-gate rather than code, but
  it needs nothing from the operator's actual Epic account. This was CONFIRMED BY A FULL
  SOURCE-LEVEL TRACE (debug session epic-sibling-apex-non-destructive-discharge, evidence E-9), not
  yet by a live run — the live run itself was deliberately not attempted by the debugging agent,
  because GameLib's own webview content is invisible to macOS accessibility (project memory
  ax-is-blind-to-the-tauri-native-dialog: `get name of every UI element` returns 4 unnamed
  elements; a raw coordinate click fails with error -25208) and no reusable bypass exists for this
  specific action (oauthCaptureLogin is only reachable from JS running inside the actual renderer
  context) — so this remains, deliberately, a live-gate item for a human at the keyboard, just a
  much cheaper and completely credential-free one than every prior version of this field described.
  (SUPERSEDED HISTORY FOLLOWS, retained deliberately: where it disagrees with the text above, the
  text above is the current, corrected understanding.) BLOCKED on another defect as of 2026-09-28:
  a fresh Epic sign-in cannot complete on
  a cold cookie jar (300s timeout, single nav host — see
  2026-09-28-epic-pre-auth-login-times-out-on-a-cold-cookie-jar.md; NOTE: that defect is now
  CLOSED, completed/, so even the SUPERSEDED text's own blocker no longer applies), so the seeding step cannot
  be performed by ANYONE, with or without credentials. Separately measured the same day: a login
  that DOES complete on a warm jar seeds NONE of the four apexes, contradicting 35-AB-RETEST
  Item 7. The sweep itself is now PROVEN to work end-to-end on 8 real live Epic cookies (in-memory
  before/after delta), so the code under test is not the problem. Previously this field read
  'needs the OPERATOR to log into Epic once (real credentials/2FA) and nothing else',
  The credential-free alternative was tried and MEASURED NEGATIVE 2026-09-28: a pre-auth
  WKWebView navigation to EPIC_LOGIN_URL sets 9 cookies, ALL on epicgames.com, NONE on any of
  the four apexes (SIBLING_APEX_SEEDED=NO), and a response from epicgames.com cannot set a
  cookie for a different registrable domain anyway — so no navigation of that page can ever
  seed them. Item 7's sibling cookies come from Epic's AUTHENTICATED SSO cookie-sync.
  IMPORTANTLY the operator does NOT have to log out: the sweep half is invocable per-host via
  the humble_login_clear_cookies dispatch_rust_channel arm, so they log in once and STAY logged
  in. CORRECTED AGAIN 2026-09-28 (debug session
  epic-sibling-apex-non-destructive-discharge): the 'then a logout' half of the sentence this
  field used to carry is MEASURABLY FALSE, and 'real credentials/2FA' is not yet known to be
  required. (a) `legendary auth --delete` exits 0 with NO session (measured against the bundled
  binary in an isolated 0700 fake profile), so logout() does not take its early return and the
  sweep was never credential-gated; (b) the domain-scoped sweep is independently invocable by
  channel name — `humble_login_clear_cookies` is a `dispatch_rust_channel` arm (main.rs:5657,
  arm :7128) taking [label, domain], answered for sidecar-initiated rustInvoke at :10203 — so
  ONE host can be swept without calling logout() and without destroying the operator's live
  Epic session; (c) the independent reader already exists and needs no building (see the
  2026-09-28 section in the body). What is left is ONLY whether a cookie can be placed on one of
  the four apexes without an authenticated Epic login — untested, and the one thing that still
  needs a live run. Unscheduled, not blocked. CORRECTED 2026-09-26 (debug session epic-sibling-apex-seeding): the 'no seeding
  vehicle exists' claim below is stale/false. The Epic OAuth login window
  (src/frontend/screens/WebView/useTauriOAuthLogin.ts, Phase 34.5, landed 2026-08-20 — 13 days
  BEFORE this todo was filed) navigates to the exact same URL
  ('https://www.epicgames.com/id/login?responseType=code') the removed hidden clear-window used to
  navigate to, and on macOS is routed (src-tauri/src/main.rs's humble_login_open arm,
  is_epic_login check) through open_pristine_epic_login_window, whose own doc comment states its
  cookies land in the SAME process-wide WKWebsiteDataStore::defaultDataStore() the cookie-clear/read
  machinery already reads — i.e. GameLib's own jar. This exact login-then-seed mechanism was
  already measured live in 35-AB-RETEST.md Item 7 (Phase 35, predating this todo): after logging
  in through that same window, an independent structured jar read found EPIC_DEVICE present
  (value length 32) on all four of .fortnite.com, .twinmotion.com, .unrealengine.com and
  .metahuman.com. Phase 40 was never going to be the trigger either way — it scopes /store/epic
  out of its embed on every platform (D-05/D-08), and the Cloudflare-embed follow-up
  (2026-09-05-store-epic-blocked-by-cloudflare-turnstile-in-the-embed.md) was closed WONTFIX
  2026-09-15: a human clicking the Turnstile widget gets re-challenged, not cleared, so Epic in the
  embed is permanently dead. What remains blocking full discharge is executional, not structural:
  the discharge condition (seed one, observe present, logout, observe absent — both by an
  independent jar read) requires a live app run with a real, human-driven Epic login, which is why
  this is a live-gate item rather than a blocked one."
trigger_phase: "NONE — see blocked_by. No future phase unblocks this; the vehicle already exists
  today. (Superseded field, kept only for history: this used to read '40'.)"
owner: "NONE — D-35-19-15 has no owning phase and needs none; it needs a human to run the live
  gate, not a phase to land."
files:
  - src/backend/storeManagers/legendary/user.ts:97
  - src/backend/storeManagers/legendary/user.ts:406
  - src/backend/storeManagers/legendary/__tests__/epicLogoutDomains.test.ts:549
  - src/frontend/screens/WebView/components/WebviewUnavailablePanel.tsx:43
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts:209
  - src/frontend/screens/WebView/loginRoutes.ts:45
  - src-tauri/src/main.rs:6252
  - src/backend/sidecar/oauthLoginCapture.ts:207
  - src/backend/humble/loginWindowSeam.ts:125
  - src-tauri/src/main.rs:6291
  - src-tauri/src/main.rs:4159
---

# D-35-19-15 — the four sibling apexes, unqueued and unreproducible

## CORRECTION 2026-09-26 (debug session `epic-sibling-apex-seeding`)

**This todo's central premise — "no seeding vehicle exists on this build" — is stale/false, and
"Phase 40 is the trigger that unblocks it" was never true even when written.** Both are corrected
in the frontmatter (`blocked_by`, `trigger_phase`, `ready`, `owner`) above; this section records
why, for anyone reading the body sections below, which are left otherwise intact as the historical
record of the reasoning that led here.

1. **A seeding vehicle exists today, and always has since before this todo was filed.** The Epic
   OAuth login window (`src/frontend/screens/WebView/useTauriOAuthLogin.ts`, Phase 34.5, landed
   2026-08-20 — 13 days before this todo's 2026-09-02 filing date) navigates to
   `https://www.epicgames.com/id/login?responseType=code`, byte-identical to the URL the removed
   hidden clear-window (`EPIC_LOGIN_ORIGIN`, `legendary/user.ts:39`) used to navigate to before
   `b5b3464bd`. On macOS this is routed, unconditionally for any Epic login
   (`src-tauri/src/main.rs`'s `humble_login_open` arm, `is_epic_login` check at :6252), through
   `open_pristine_epic_login_window`, whose own doc comment (:4154-4167) states its cookies land in
   the SAME process-wide `WKWebsiteDataStore::defaultDataStore()` the cookie-clear/read machinery
   already reads — i.e. GameLib's own jar, exactly what the discharge condition below requires.
2. **This exact mechanism was already measured live, once, predating this todo.**
   `35-AB-RETEST.md` Item 7 (Phase 35, 2026-08-29ish) logged into Epic through this same window,
   then independently parsed the on-disk binarycookies jar (not the app's self-report) and found
   `EPIC_DEVICE` PRESENT (value length 32) on all four of `.fortnite.com`, `.twinmotion.com`,
   `.unrealengine.com` and `.metahuman.com` after that login. The "before(matched=1)" observation
   the body below attributes solely to "the removed window" is consistent with either the
   clear-window OR the login window, since both navigate to the identical origin — the body's own
   inference that it must have been the clear-window specifically was never actually
   differentiated, and the Item 7 evidence shows the login window alone produces the same effect.
3. **Phase 40 was never going to be the trigger, independent of point 1.** Phase 40 shipped
   2026-09-05 scoping `/store/epic` out of its embed on every platform, by design (D-05/D-08,
   `WebView/index.tsx:468`), and the one follow-up that might have un-gated it
   (`2026-09-05-store-epic-blocked-by-cloudflare-turnstile-in-the-embed.md`) was closed WONTFIX
   2026-09-15 — a human clicking Cloudflare's Turnstile widget gets re-challenged, not cleared, so
   Epic in the embed is permanently dead. The "Phase 40 is the TRIGGER" section below was already
   wrong on the day Phase 40 shipped; this correction is not contingent on point 1 at all.
4. **What is NOT corrected: the discharge condition itself still cannot be executed here.**
   Confirming this live — seed one of the four cookies via a real Epic login, read the jar, log
   out, read the jar again, all by an independent read — requires real Epic credentials/2FA that
   are not available in this sandboxed debugging environment. That gate is not being faked, mocked,
   or skipped; it is why `ready` is now `live-gate` rather than `blocked`. Some human with real Epic
   credentials, on a machine that can run the packaged app, still needs to perform this.

## CORRECTION 2026-09-28 (debug session `epic-sibling-apex-non-destructive-discharge`)

**The 2026-09-26 correction above got the structural picture right and the EXECUTION picture wrong.**
It concluded that "what remains blocking full discharge is executional" and that the discharge
condition "requires a live app run with a real, human-driven Epic login". Two of the three steps it
bundled into that sentence turn out not to need credentials at all. Measured 2026-09-28 at HEAD
`023e10346`; full evidence in
`.planning/debug/epic-sibling-apex-non-destructive-discharge.md`.

1. **The SWEEP half was never credential-gated.** `logout()` (`legendary/user.ts:150`) runs
   `legendary auth --delete` first and returns early on `res.error || res.abort`. Measured against
   the bundled binary `./build/bin/arm64/darwin/legendary/legendary` in an isolated `mkdtemp` 0700
   fake profile (all eight containment variables set, profile shredded after — required, since the
   same command against the real profile would have destroyed a live session): with NO session it
   prints `[cli] INFO: User data deleted.` and exits **0**. So `res.error` is falsy, the early
   return is not taken, and `clearEpicCookies` is reached without any authenticated session.

2. **The sweep does not even need `logout()`, and does not have to be destructive.**
   `EPIC_COOKIE_HOSTS` sweeps by HOST, not by cookie name, so ANY cookie on one of the four apexes
   is a valid fixture. `humble_login_clear_cookies` is an arm of `dispatch_rust_channel`
   (`src-tauri/src/main.rs:5657`, arm at `:7128`) taking `[label, domain]`, answered for
   sidecar-initiated `rustInvoke` at `:10203`; the domain-scoped implementation is
   `clear_default_data_store_cookies_for_domain` (`:4181`) and `:3567` records that
   `EPIC_COOKIE_HOSTS`' values are exactly what get passed as `domain`. Its default-data-store path
   is gated on `existing_window.is_none() && epic_cookie_domain_matches(domain)`, and
   `EPIC_LOGOUT_WINDOW_LABEL` resolves to `None` for the life of the process by construction. So one
   host can be swept on its own, without signing the operator out of Epic.

3. **No instrument needs building.** The "independent jar read" the discharge condition demands
   already exists:
   `.planning/quick/260909-p4m-correct-the-stale-record-on-the-gog-amaz/gate-evidence/binarycookies-index-walk.py`
   (48 lines, jar path as `argv[1]`, extracts NO cookie values).

4. **The current "before" is a vacuous zero, measured.** Read in place, counts only (never copied —
   a copy attempt was correctly refused as PII handling): the dev jar
   (`~/Library/HTTPStorages/gamelib-shell.binarycookies`, 76 records) has `epicgames.com`=5 and all
   four sibling apexes at **0**; the packaged jar (`com.gamelib.shell.binarycookies`, 42 records) has
   all five hosts at 0. A live Epic session nonetheless exists in `legendaryConfig/legendary/user.json`
   — so a past login left no surviving sibling-apex cookies.

**What actually remains — one step, and it is not the one this todo has claimed since 2026-09-02.**
Whether a cookie can be placed on one of the four apexes WITHOUT an authenticated Epic login.
`legendary/user.ts:27-39` records that merely building a `WKWebView` on the Epic login URL is a
navigation that Epic + Cloudflare answer with `__cf_bm`/`EPIC_DEVICE`/`EPIC_LOGIN_ID`/`_epicSID`/`_tald`
— but never establishes which HOSTS those land on. The credential-free probe (open the Epic login
window, do NOT authenticate, re-read the jars) has never been run. If it seeds any sibling apex, the
whole gate discharges with no credentials and no logout. If it does not, only then does this need the
operator's real Epic credentials.

**UPDATE later the same day — the credential-free probe was RUN, and is NEGATIVE.** A standalone
`WKWebView` (Swift, `WKWebsiteDataStore.default()`, offscreen window so JS runs) navigated to the
byte-identical `EPIC_LOGIN_URL` with no credentials and settled 30s. Result: **9 cookies, every one
on `epicgames.com`** (`EPIC_DEVICE`, `EPIC_LOGIN_ID`, `EPIC_SESSION_AP`, `XSRF-TOKEN`, `__cf_bm` x2,
`_epicSID`, `_tald`, `cf_clearance` — a superset of what `user.ts:27-39` predicted, and
`cf_clearance` proves Cloudflare was satisfied rather than the probe being 403'd as a bare `curl`
is), and **0 on all four sibling apexes**. `SIBLING_APEX_SEEDED=NO`.

That closes the credential-free path, and cookie semantics say it was never open: a response from
`epicgames.com` cannot set a cookie for `fortnite.com` — different registrable domains — so only a
request served BY one of the four apexes can seed one. Item 7's sibling cookies therefore came from
Epic's **authenticated** SSO cookie-sync.

## CORRECTION 2026-09-28 (second update, after the live gate was actually driven)

**The live gate was run with the operator's real account, and it did not discharge this todo — it
blocked on a different defect and refuted a premise this todo has carried since Phase 35.**

1. **The sweep WORKS, proven end-to-end for the first time.** The logout's own in-memory per-host
   census (a live `WKWebsiteDataStore` re-read, not the lagging jar and not the removal call's own
   return) reported `cleared 8 epicgames.com cookie(s)`, `before(matched=8) after(matched=0)`, and
   `cleared 0` for each of the four sibling apexes with `before(matched=0)`. Outside unit tests,
   nothing had previously shown this sweep removing a real Epic cookie.

2. **A genuine authenticated login seeded NONE of the four apexes.** Login confirmed by
   `legendary status --json` (account present, 6 games, `user.json` rewritten 10:38); the app was
   then quit to force a jar flush (mtime moved to 2026-09-28 10:39:08, so the flush happened); the
   flushed jar held 8 cookies on `epicgames.com` and **0** on every sibling apex, with a whole-jar
   inventory returning only `.epicgames.com` and `.www.epicgames.com`. This **contradicts
   `35-AB-RETEST.md` Item 7**, which found `EPIC_DEVICE` (value length 32) on all four on
   2026-08-29. Either Epic's cross-property cookie-sync changed, or Item 7's session had also
   visited those properties.

3. **The seeding step is now unreachable by anyone.** Immediately after that logout cleared the 8
   cookies, signing back in failed: one `nav host=www.epicgames.com`, a blurred skeleton form, and
   `status=timeout` after exactly 300s. That is `F-34.5-G6-01` reproducing on the PRE-AUTH half its
   own resolved session says was never verified, with the cause its Branch B arm already named (a
   deterministic Talon anti-bot 403). Filed as
   `2026-09-28-epic-pre-auth-login-times-out-on-a-cold-cookie-jar.md`.

**So this todo is blocked, not dischargeable, and still NOT closed.** Its own discharge condition
rules out closing on a `matched=0`, and that ruling is respected here: the four apexes read 0 in both
instruments, and that remains evidence of nothing being there rather than evidence of clearing.

**One gap stated rather than glossed:** the login and the logout were in different app sessions (a
quit between them was required to force the flush), so a **session-scoped** sibling-apex cookie would
have been discarded at quit and seen by neither instrument. Formally unexcluded. Moot in practice
only because the login needed to create one can no longer be driven.

**What changed for the better:** point 1 means the code this todo guards is no longer unverified in
its working half. What remains unproven is narrowly the four sibling hosts, and they are now unprovable
for an external reason.

**So the gate needs exactly one thing: the operator logging into Epic once.** And thanks to the
sweep being per-host invocable, they do NOT need to log out afterwards — see the procedure in
`.planning/debug/epic-sibling-apex-non-destructive-discharge.md` § Current Focus.

`ready:` stays `live-gate`: the remaining step needs a live app run. It is not `code`, not `blocked`.

**Not done, deliberately:** no logout and no `auth --delete` has been run against the real profile.
A live Epic session exists and that would destroy it; it requires the operator's explicit
confirmation.

## CORRECTION 2026-09-30 (debug session `epic-sibling-apex-non-destructive-discharge`, re-opened)

**The 2026-09-28 corrections above got the sweep right and the seeding conclusion wrong.** They
concluded "only then does this need the operator's real Epic credentials" and, after the
credential-free probe measured negative, that "the operator logging into Epic once" was the one
remaining requirement. That conclusion was a non-sequitur from a correctly-derived rule, and this
correction fixes the inference without touching the rule.

**The rule (E-5, 2026-09-28) stands, unedited:** only a request served BY `fortnite.com`,
`unrealengine.com`, `twinmotion.com`, or `metahuman.com` can set a cookie on that apex, because a
response from `epicgames.com` cannot set a cookie for a different registrable domain.

**The inference drawn from it did not follow, and here is why.** E-5 tested exactly one vehicle —
a `WKWebView` navigated to Epic's own login page at `epicgames.com` — and generalised its negative
result ("no sibling-apex cookies") to every possible vehicle. **Those four apexes are public,
Epic-run websites.** A plain navigation to one of them, e.g. `https://www.fortnite.com/`, IS a
request served by a sibling apex. It satisfies E-5's own rule directly, and needs no Epic
credentials, no 2FA, and no authenticated SSO cookie-sync — that machinery was only ever needed to
explain HOW a login-page navigation could theoretically reach a sibling apex indirectly (it
cannot); it was never a precondition for a DIRECT navigation to reach one.

**The vehicle for that direct navigation already exists — verify, don't assume.** Full
hop-by-hop source trace (debug session's own E-9), not yet a live measurement:

1. `window.api.oauthCaptureLogin({ runner: 'legendary', url: 'https://www.fortnite.com/' })` calls
   `captureOAuthLogin(runner, loginUrl, ...)` (`src/backend/sidecar/oauthLoginCapture.ts:207`),
   which takes `loginUrl` as a plain string — no runner-to-URL validation at this layer. (The
   React hook `useTauriOAuthLogin.ts:209` hardcodes `EPIC_LOGIN_URL` for the `legendary` runner,
   but only inside the hook; calling the preload API directly bypasses that hardcoding.)
2. `captureOAuthLogin` opens the window through `getLoginWindowSeamOrThrow().open(...)`
   (`loginWindowSeam.ts:125`), a `rustInvoke`-backed call reaching the SAME `humble_login_open`
   Rust arm E-3 already proved reachable by channel name.
3. In Rust (`main.rs:6284`), `is_epic_login = url.host_str() == Some(EPIC_LOGIN_HOST)` (`:6291`),
   and `EPIC_LOGIN_HOST` is the exact string `"www.epicgames.com"` (`:2976`) — a full-hostname
   equality check. For a `fortnite.com` URL this is `false`, so
   `open_pristine_epic_login_window` (the Epic-only branch) is never taken.
4. Execution falls through to the arm's ordinary
   `tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))` (`:6413`) —
   no `data_store_identifier`, no custom `websiteDataStore`, no incognito flag anywhere in that
   builder chain (confirmed by grep across `main.rs` and `tauri.conf.json` — zero hits for all
   three terms in this entire codebase).
5. This file's own doc comment on `clear_default_data_store_cookies_for_domain`
   (`main.rs:4159-4161`), written by a prior session fixing a real, related defect, states the
   mechanism generally: cookies from a window built this way "live in the SAME process-wide
   `WKWebsiteDataStore::defaultDataStore()` every Tauri-managed window already shares" — the exact
   store the non-destructive per-host sweep already reads and clears (E-1/E-3).

**So the full recipe needs zero Epic credentials, zero 2FA, and zero logout — a strict
simplification of every prior version of this field:**

1. From DevTools: `window.api.oauthCaptureLogin({ runner: 'legendary', url:
   'https://www.fortnite.com/' })`. Let the navigation settle (the capture promise itself only
   resolves on a matching OAuth redirect, which `fortnite.com` will never produce — cancel/close
   the window once settled; the cookie is already written by then).
2. Read the per-host census — the existing independent reader
   (`.planning/quick/260909-p4m-correct-the-stale-record-on-the-gog-amaz/gate-evidence/binarycookies-index-walk.py`)
   against the flushed disk jar, or the sweep's own in-memory before/after census if kept within
   one app session (the disk jar lags — E-7 needed a quit to flush it). Confirm `fortnite.com`
   PRESENT.
3. Dispatch `humble_login_clear_cookies` with the Epic sentinel label and `domain='fortnite.com'`
   alone (per E-1/E-3, reachable by channel name, no logout required).
4. Re-read. Confirm `fortnite.com` ABSENT. `epicgames.com` and the operator's live Epic session are
   untouched throughout.

**Not run live, and why.** GameLib's own webview content is invisible to macOS accessibility
(project memory `ax-is-blind-to-the-tauri-native-dialog`: `get name of every UI element` returns 4
unnamed elements; a raw coordinate click fails with error -25208), and no reusable bypass (deep
link, bundled-binary invocation, RPC entry point) exists for this specific action —
`oauthCaptureLogin` is reachable only from JS running inside the real renderer context. This
remains, deliberately, a live-gate item for a human at the keyboard — just now a completely
credential-free, non-destructive, ~2-minute one, rather than the login-and-maybe-logout gate every
prior version of this field described.

## Why this is being filed on 2026-09-02, and why filing it is not optional

A census taken today found `D-35-19-15` in **25 planning files and ZERO queues**:

| queue | hits |
|---|---|
| `.planning/todos/pending/` | **0** |
| `.planning/seeds/` | **0** |
| Phase 38 (the collection phase for deferred UAT) | **0** |
| Phase 39 | **0** |
| `.planning/todos/completed/` | 2 — **both closed today by quick `260902-9el`** |
| Phase 35 artifacts, `ROADMAP`/`REQUIREMENTS`/`STATE`/`debug` prose | 122 |

Everything above the fold is a **closed-phase artifact, an archived quick-task record, or prose**.
Until today the item at least rode along inside two *pending* todos; quick `260902-9el` moved both
to `completed/`, so its only todo-shaped mentions are now archived. **That closure is what makes
this filing necessary now** — it restores visibility the closure removed, and the closure was
correct on its own terms (both its carve-outs say in writing that `D-35-19-15` survives open).

This is the same shape Phase 40's own ROADMAP entry was filed to fix: an item living in
"three prose locations and **zero** queues: no todo, no seed, no backlog row, no `D-35-*` ledger
entry." Same family as the `blocked_by`/`parked_to_phase` rot this repo keeps producing, but a
distinct member of it: not a stale field, an item with **no field anywhere**.

## What the gap actually is — narrower than its name suggests

`EPIC_COOKIE_HOSTS` (`src/backend/storeManagers/legendary/user.ts:97`, pinned by
`epicLogoutDomains.test.ts:549`) sweeps five hosts on Epic logout. The **domain-suffix half is
exercised**: one `epicgames.com` step demonstrably sweeps `.epicgames.com`, `.www.epicgames.com`
and `.ecosec.on.epicgames.com`.

What has **never** been proven is the four non-primary sibling **apexes**:

```
fortnite.com    unrealengine.com    twinmotion.com    metahuman.com
```

All four report `before(matched=0)` on every run to date. A bare zero is not evidence of clearing —
it is evidence of nothing being there, which is exactly the "vacuous zero" this project has had to
argue down before (`35-LIVE-GATE.md:1241`).

## Why it is blocked — a real external precondition, not a symptom (STALE — see CORRECTION above)

**This section's conclusion is corrected above (2026-09-26): a seeding vehicle does exist.** Left
intact below as the historical record of the reasoning at filing time.

`35-LIVE-GATE.md:1729`:

> **SEEDING STEP — BLOCKED, NO VEHICLE EXISTS ON THIS BUILD.** D-35-19-15 prescribes driving the
> webview to a non-primary Epic domain. The Tauri build embeds **no browser view**:
> `WebviewUnavailablePanel.tsx:43` … and offers only a system-browser handoff, which seeds Safari's
> jar, not GameLib's. **On this build no user action can create a non-primary Epic cookie**, so the
> `EPIC_COOKIE_HOSTS` widening is currently unreachable-by-construction: correct defensive code
> awaiting the browser's return.

It moved from *unexercised* to *unreproducible* by a fix that was right: **`b5b3464bd`** removed the
hidden logout webview that was the only thing ever seeding those four apexes during a logout. Before
that commit each showed `before(matched=1)` — **and those cookies were set by the removed window
itself.** Removing the defect removed the only thing that populated them.

Contrast with the stale blocker corrected on `2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md`:
that one described its own symptom and made the todo permanently un-actionable. This one names a
precondition that genuinely does not exist yet and identifies what creates it.

## Phase 40 is the TRIGGER, not the owner (STALE — see CORRECTION above)

**This section's title claim is corrected above (2026-09-26): Phase 40 was never going to be the
trigger.** Left intact below as the historical record of the reasoning at filing time.

Phase 40 (*In-app store and wiki browsing under Tauri — embedded child webview*, filed 2026-09-02)
restores `/store/*` and `/wiki` as embedded child webviews. **That is the seeding vehicle
returning** — and at that moment the `EPIC_COOKIE_HOSTS` widening stops being dormant defensive code
and starts guarding a surface users can actually reach.

**The connection is currently unmade.** Phase 40's ROADMAP entry discusses cookie jars at length —
spike 018's one-default-jar-per-process finding, quick `260902-8i2`'s live confirmation against both
real jars, Epic's pre-auth 403 inside an embed — and **never names `D-35-19-15` or
`EPIC_COOKIE_HOSTS`**. Whoever plans Phase 40 should pick this up as an explicit item; do not assign
Phase 40 as this item's owner on the strength of that alone. `D-35-19-15` has no owning phase.

## MUST NOT be used to reopen REQ-35-07

**REQ-35-07 is Complete** (`REQUIREMENTS.md:429` and `:1143`, quick `260901-vuy`, both clauses
live-proven on a genuine release artifact 2026-08-31 22:54). Two independent adjudication passes —
Phase 35's **fourth** and **fifth** — ruled that the sibling-apex seeding is `D-35-19-15`'s **own
sub-criterion and NOT a clause of REQ-35-07**; the sixth pass reaffirmed it a third time from the
requirement's own text. That ruling is why REQ-35-07 could close without it.

Anyone tempted to treat this todo as evidence against REQ-35-07 should read those three passes
first. It is a separate, narrower item.

## Discharge condition — a seeded fixture, not another zero

A non-primary Epic apex cookie (one of the four above) confirmed **PRESENT in GameLib's own jar
before logout**, then confirmed **absent after**, by an **independent jar read** rather than the
product's own census. Both halves are required: this repo has twice been misled by a count line that
matched, and by a `matched=0` that was accurate about an instant that stopped being true.

A green unit suite does not discharge this. Neither does another run reporting `before(matched=0)`.

## Related but distinct

- **`38-W06`** owns **off-macOS (Windows/Linux) Epic logout** — a different gap. `b5b3464bd`
  deliberately keeps a window off macOS (pointed at `https://gamelib.invalid/`); that leg is
  unexercised for its own reasons and is not this item.
- `.planning/todos/completed/2026-08-23-epic-logout-cookie-clear-unobserved-and-unowned.md`
  carve-out 2, and the matching carve-out in the `2026-08-24` closure — the two records that kept
  this item alive in writing before this todo existed.

## Sources

- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-LIVE-GATE.md:1714-1745`
  (criterion 21 — PASS on its contract, `D-35-19-15` NOT closed) and `:1876` (the
  unreproducible-by-construction addendum)
- `.planning/debug/resolved/epic-sibling-apex-seeding.md` — 2026-09-26 debug session that produced
  the CORRECTION section above: confirms the OAuth login window as a live seeding vehicle
  (`useTauriOAuthLogin.ts`, `main.rs`'s `open_pristine_epic_login_window`), that Phase 40 was never
  the trigger, and that the live login+logout jar test itself is a confirmed non-executable-here
  dependency (real Epic credentials required)
- `.planning/phases/35-electron-cutover-remove-the-electron-build/35-VERIFICATION.md` — sixth
  adjudication; `bears_on_req_35_07: "No"` recorded twice, by two different passes
- `.planning/REQUIREMENTS.md:429`, `:1143` — REQ-35-07 Complete, `D-35-19-15` struck as a condition
