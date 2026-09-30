---
slug: epic-sibling-apex-non-destructive-discharge
status: resolved
trigger: "action todo: D-35-19-15 Epic sibling-apex — can the live gate be discharged WITHOUT the operator's Epic credentials, and without signing them out?"
created: 2026-09-28
updated: 2026-09-30
origin: "Extends .planning/debug/resolved/epic-sibling-apex-seeding.md (2026-09-26), which corrected the todo's blocked_by/trigger_phase but was explicitly a DOCUMENTATION-only fix: its own verification records that the live login+logout jar re-test 'was NOT performed here'. That session never examined whether the sweep half needs credentials at all, nor whether a non-destructive invocation path exists. Both are new ground and both are now measured below."
---

# Debug: is D-35-19-15's live gate actually credential-gated?

## Symptoms

`.planning/todos/pending/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md`
is `ready: live-gate`, and its `blocked_by` states the discharge condition requires

> a live, human-run Epic login (real credentials/2FA) followed by an independent jar read, then a
> logout followed by another independent jar read

Two separate claims are bundled there — that **seeding** needs a real login, and that **the sweep**
needs a logout (hence an authenticated session). The second is measurably false, and the first is
narrower than stated. This session separates them.

The discharge condition itself is NOT being relaxed: a cookie must still be confirmed PRESENT on
one of `fortnite.com` / `unrealengine.com` / `twinmotion.com` / `metahuman.com` in GameLib's own
jar, then confirmed ABSENT after the sweep, both by an independent jar read. A bare `matched=0`
still discharges nothing.

## Goal

Decide which of the four remaining steps genuinely need the operator, and reduce the gate to the
smallest step that actually does. Do not close the todo on a vacuous zero.

## Evidence

All measured 2026-09-28 at HEAD `023e10346`.

### E-1 — the sweep is reachable with NO authenticated Epic session (refutes half the blocker)

`LegendaryUser.logout()` (`src/backend/storeManagers/legendary/user.ts:150`) runs
`legendary auth --delete` first and **returns early** on `res.error || res.abort`, before any
cookie-side cleanup. So whether the cookie sweep runs at all depends on that CLI call's exit
status when unauthenticated.

Measured directly against the bundled binary, `./build/bin/arm64/darwin/legendary/legendary`, in an
isolated `mkdtemp` 0700 fake profile (all eight variables from `jest.setupContainment.ts` set via
`env -i`, profile shredded immediately after — the two-profile rule's isolated-by-default half, and
mandatory here because the same command against the real profile would have destroyed a live
session):

```
[cli] INFO: User data deleted.
EXIT=0
```

`auth --delete` with no session exits **0**. Therefore `res.error` is falsy, `logout()` does NOT
return early, and `clearEpicCookies` is reached. **The sweep half of the discharge condition was
never credential-gated.**

### E-2 — the four apexes are at zero in both live jars right now (the "before" is vacuous)

Read IN PLACE (never copied — an attempt to copy a jar into a scratchpad was correctly denied this
session as PII handling, and this repo has a recorded incident of leaving 103 MB of unredacted
captures on disk). Aggregate per-domain counts only; no cookie names, no values, no other domains.

| jar | records | mtime | epicgames | fortnite | unrealengine | twinmotion | metahuman |
| --- | ------- | ----- | --------- | -------- | ------------ | ---------- | --------- |
| `~/Library/HTTPStorages/gamelib-shell.binarycookies` (dev) | 76 | 2026-09-25 12:49 | **5** | 0 | 0 | 0 | 0 |
| `~/Library/HTTPStorages/com.gamelib.shell.binarycookies` (packaged) | 42 | 2026-09-24 12:59 | 0 | 0 | 0 | 0 | 0 |

Newest `epicgames.com` record created 2026-09-13 02:13.

A real Epic session DOES exist — `~/Library/Application Support/gamelib/legendaryConfig/legendary/user.json`
carries `access_token`, `refresh_token` and `displayName` (6055 bytes; keys inspected, no values
read). So a past login did not leave sibling-apex cookies behind, or they have since expired or
been cleared. **The seeding precondition is not satisfied today**, which is exactly the
`before(matched=0)` the todo warns is evidence of nothing.

### E-3 — the sweep can be driven for ONE domain, non-destructively

`EPIC_COOKIE_HOSTS` (`legendary/user.ts:96`) sweeps by **host**, not by cookie name, so any cookie
on one of the four apexes is a valid fixture — its provenance is irrelevant to whether the sweep
clears it.

`humble_login_clear_cookies` is an arm of `dispatch_rust_channel(channel, args, app)`
(`src-tauri/src/main.rs:5657`, arm at `:7128`) taking `[label, domain]`. That dispatcher answers
sidecar-initiated `kind == "rustInvoke"` requests (`:10033`, dispatched at `:10203`), so the channel
is callable by name with an arbitrary domain. The domain-scoped implementation is
`clear_default_data_store_cookies_for_domain` (`:4181`), and `:3567` documents that
`EPIC_COOKIE_HOSTS`' values are precisely what get passed as `domain`.

The default-data-store path is gated on `existing_window.is_none() && epic_cookie_domain_matches(domain)`.
`EPIC_LOGOUT_WINDOW_LABEL` (`legendary/user.ts:41-52`) is structurally outside
`next_login_window_label()`'s range, so it resolves to `None` for the life of the process — that
`None` is the precondition the macOS cookie arms require, not a degradation.

**Consequence:** the sweep can be exercised against `fortnite.com` alone, without calling
`LegendaryUser.logout()`, without running `auth --delete`, and without touching the operator's Epic
session. The gate does not have to be destructive.

### E-4 — the independent reader already exists; nothing needs building

`.planning/quick/260909-p4m-correct-the-stale-record-on-the-gog-amaz/gate-evidence/binarycookies-index-walk.py`
(48 lines) takes a jar path as `argv[1]`, index-walks the pages and extracts
domain/name/path/flags/expiry/created. It extracts **no cookie values**. The todo's "independent jar
read rather than the product's own census" requirement is already instrumented.

### E-5 — the credential-free probe is NEGATIVE, decisively (run 2026-09-28)

Built a minimal standalone `WKWebView` probe (Swift 6.4, `WKWebsiteDataStore.default()`, offscreen
`NSWindow` so JS and subresources actually run), navigated it to the byte-identical
`EPIC_LOGIN_URL`, let it settle 30s, and read `WKHTTPCookieStore.getAllCookies` filtered to the five
Epic hosts. **No credentials were entered and no authentication occurred.**

```
total cookies in store: 9
  epicgames.com      count=9 names=[EPIC_DEVICE,EPIC_LOGIN_ID,EPIC_SESSION_AP,XSRF-TOKEN,
                                    __cf_bm,__cf_bm,_epicSID,_tald,cf_clearance]
  fortnite.com       count=0
  unrealengine.com   count=0
  twinmotion.com     count=0
  metahuman.com      count=0
SIBLING_APEX_SEEDED=NO
```

The main navigation reached `didFinish`. The cookie set is a superset of exactly what
`legendary/user.ts:27-39` predicted from its own live measurement (`__cf_bm`, `EPIC_DEVICE`,
`EPIC_LOGIN_ID`, `_epicSID`, `_tald`), which is good evidence the probe faithfully reproduced the
pre-auth navigation rather than being blocked — note `cf_clearance` is present, so Cloudflare was
satisfied, unlike a plain `curl` of the same URL which gets **HTTP 403** and only `__cf_bm`.

**Every one of the 9 cookies is on `epicgames.com`. None is on any sibling apex.** This is also what
cookie semantics require: a response from `epicgames.com` cannot set a cookie for `fortnite.com` —
different registrable domains — so a sibling-apex cookie can only come from a request served BY one
of those four domains, and merely loading the login page issues none.

**Conclusion.** The sibling-apex cookies `35-AB-RETEST.md` Item 7 observed came from Epic's
**authenticated** SSO cookie-sync across its properties, not from loading the login page. A
credential-free seed is therefore impossible by this vehicle, and the seeding half of the discharge
condition genuinely does require an authenticated Epic login.

**Scope limit, stated rather than glossed:** this was a bare `WKWebView`, not GameLib's own
`open_pristine_epic_login_window`. It navigates the identical URL on the identical engine, so it is
a faithful stand-in for the PRE-AUTH step, but it is not proof about GameLib's window specifically.
That distinction does not change the conclusion, because the negative rests on the cookie-domain
rule above, which is engine-independent.

### E-6 — the eight-variable fake HOME does NOT contain WebKit storage on macOS

The probe was launched via `env -i` with all eight containment variables from
`jest.setupContainment.ts` pointed at a `mkdtemp` 0700 profile. **WebKit ignored them.** Zero
`*.binarycookies` appeared under the fake HOME, and three artifacts appeared in the REAL profile:

```
~/Library/HTTPStorages/epicprobe.binarycookies
~/Library/Caches/epicprobe
~/Library/WebKit/epicprobe
```

macOS resolves those via `NSHomeDirectory()`/the app container, not the `HOME` environment variable,
for a non-sandboxed binary. All three were removed immediately and their absence re-verified; the
operator's own two GameLib jars were confirmed untouched by mtime (`gamelib-shell` Sep 25 12:49,
`com.gamelib.shell` Sep 24 12:59, both unchanged across the probe).

**This is a real gap in the two-profile rule as written** — it is stated in terms of eight
environment variables, and any probe that drives a `WKWebView`, `WKWebsiteDataStore` or any WebKit
storage API escapes that containment silently. Anything of this shape needs either a sandboxed
container or explicit post-run cleanup of `~/Library/{HTTPStorages,Caches,WebKit}/<procname>`.

### E-7 — the sweep WORKS end-to-end on live Epic cookies, and a real login seeded NO sibling apex

The operator ran a live gate 2026-09-28: logged into Epic (authenticated login confirmed by
`legendary status --json` — account present, 6 games available, `user.json` rewritten 10:38), quit
the app to force a jar flush, then relaunched and logged out.

Post-login jar read, after the quit forced a flush (jar mtime moved 09-25 12:49 -> **09-28
10:39:08**, so the flush demonstrably happened):

| host | count |
| ---- | ----- |
| `epicgames.com` | 8 (`EPIC_DEVICE`, `EPIC_LOGIN_ID`, `EPIC_RECEIPT_*`, `EPIC_SESSION_AP`, `__cf_bm`, `_epicSID`, `_tald`, `cf_clearance`) |
| `fortnite.com` | **0** |
| `unrealengine.com` | **0** |
| `twinmotion.com` | **0** |
| `metahuman.com` | **0** |

Whole-jar domain inventory for anything Epic-ish returned exactly two domains: `.epicgames.com` and
`.www.epicgames.com`.

Then the logout's own **in-memory** per-host before/after census — the instrument that does not lag,
because it is a live `WKWebsiteDataStore` re-read rather than a file read:

```
cleared 8 epicgames.com cookie(s)  before(total=70, matched=8) after(total=62, matched=0)
cleared 0 fortnite.com    cookie(s)  before(matched=0) after(matched=0)
cleared 0 unrealengine.com cookie(s) before(matched=0) after(matched=0)
cleared 0 twinmotion.com  cookie(s)  before(matched=0) after(matched=0)
cleared 0 metahuman.com   cookie(s)  before(matched=0) after(matched=0)
Epic cookie clear removed 8 cookie(s) across 5 Epic-owned domain(s)
post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)
```

**Two results, and the first one is new.**

1. **The `EPIC_COOKIE_HOSTS` sweep is proven to work end-to-end on real, live Epic cookies** — 8
   removed, measured as an in-memory delta (`matched=8` -> `matched=0`), not asserted from the
   removal call's own return. No prior test or gate had shown that; the `epicgames.com` suffix half
   was previously only unit-exercised.
2. **A genuine authenticated Epic login seeded NONE of the four sibling apexes**, contradicting
   `35-AB-RETEST.md` Item 7 (2026-08-29), which found `EPIC_DEVICE` present with value length 32 on
   all four. Either Epic's cross-property cookie-sync changed between 2026-08-29 and 2026-09-28, or
   Item 7's session had also visited those properties. Not resolved here; what matters for this
   session is that the seeding step no longer produces the fixture.

**Honest limit: measurement B never ran.** The login and the logout were in different app sessions
(a quit between them, needed to force the flush), so a **session-scoped** sibling cookie would have
been discarded at quit and would not appear in either instrument. That gap is now moot in practice —
see E-8, the login that would create one can no longer be driven — but it is a gap, not a proof of
absence.

### E-8 — the seeding step is BLOCKED by a separate, known defect: Epic pre-auth login times out

Immediately after the logout in E-7 cleared all 8 `epicgames.com` cookies, the operator attempted to
sign back in. It failed:

```
10:45:52  [oauthLoginCapture] runner=legendary label=loginwin-1-...
10:45:53  [oauthLoginCapture] runner=legendary nav host=www.epicgames.com
10:50:52  [oauthLoginCapture] runner=legendary status=timeout
```

Exactly 300s, a single `nav host=`, and a blurred skeleton form — operator verbatim: *"window was
blank (white for a few seconds, now is sitting on preloaded login page)"*.

This is `F-34.5-G6-01` reproducing on the half its own resolved session says was never verified.
`.planning/debug/resolved/epic-login-non-interactive.md` is `finding_status: CLOSED`, but its
`root_cause_scope` states the fix covers the POST-AUTHENTICATION half only and that the pre-auth half
"is UNVERIFIED… nobody has ever driven this shell through a fresh, logged-out Epic sign-in", and its
Branch B arm already identified the cause as *"the deterministic Talon anti-bot 403"*. That
diagnosis was never filed as a tracked item; it is now
`.planning/todos/pending/2026-09-28-epic-pre-auth-login-times-out-on-a-cold-cookie-jar.md`.

Warm jar vs cold jar, same build, ~7 minutes apart, is the discriminator:

| time | Epic cookies before the attempt | outcome |
| ---- | ------------------------------- | ------- |
| 10:38 | 5 stale (created 2026-09-13, incl. `cf_clearance`) | login SUCCEEDED |
| 10:45:52 | 0 (the logout removed all 8) | `status=timeout` after 300s |

Note the contrast with E-5: a bare standalone `WKWebView` on a cold store was **not** blocked that
same morning — it obtained `cf_clearance` and `EPIC_SESSION_AP`. So this is not "WKWebView cannot
pass Talon"; something about GameLib's login window differs, and that asymmetry is the live
diagnostic lead recorded in the new todo.

**Cost incurred, recorded rather than buried:** the operator was signed into Epic before this gate
and is signed out after it, with no working way back in. The instruction to log out was given without
first checking this repo's own evidence that the pre-auth path was unverified — the evidence was
present and was not consulted.

### E-9 — the seeding vehicle's full call chain confirmed, by source, to reach the shared process-wide store (2026-09-30)

**Not run live — the honest scope of this entry.** This is a full source-level trace of every hop
`window.api.oauthCaptureLogin({ runner: 'legendary', url: 'https://www.fortnite.com/' })` would
take, cross-checked against an explicit prior-author doc comment that reasoned through the exact
same mechanism while fixing a related defect. It is not a live measurement; why a live measurement
was not attempted is recorded below the trace.

**The chain, hop by hop:**

1. `useTauriOAuthLogin.ts`'s React hook hardcodes `url = EPIC_LOGIN_URL` for the `legendary`
   runner (`:209`) — but that hardcoding lives in the HOOK, not in the preload API it calls.
   Calling `window.api.oauthCaptureLogin({ runner, url })` directly (bypassing the hook, e.g. from
   DevTools) reaches `captureOAuthLogin(runner: OAuthRunner, loginUrl: string, ...)`
   (`src/backend/sidecar/oauthLoginCapture.ts:207`), which takes `loginUrl` as a plain, unvalidated
   string parameter — no runner-to-URL shape check exists at this layer.
2. `captureOAuthLogin` calls `getLoginWindowSeamOrThrow().open(...)` (`loginWindowSeam.ts:125`),
   documented at `:10` as "a handle reached only via a `rustInvoke` round-trip" and at `:51` as
   pushing onto "the SAME `LOGIN_WINDOW_EVENTS` queue via the SAME... `humble_login_open` arm" —
   i.e. this is the same dispatch surface E-3 already established as callable by channel name.
3. In Rust, `"humble_login_open"` (`main.rs:6284`) computes `is_epic_login = url.host_str() ==
   Some(EPIC_LOGIN_HOST)` (`:6291`), and `EPIC_LOGIN_HOST` is the exact string literal
   `"www.epicgames.com"` (`:2976`) — a full-hostname equality check, not a suffix or wildcard
   match. For `url = https://www.fortnite.com/`, `is_epic_login` is `false`.
4. `#[cfg(target_os = "macos")] if is_epic_login { return open_pristine_epic_login_window(...) }`
   (`:6314-6317`) is therefore NOT taken. Execution falls through to the arm's own, the comment
   calls it, "existing, completely untouched code below" (`:6310-6311`) — the ordinary
   `tauri::WebviewWindowBuilder::new(app, &label, tauri::WebviewUrl::External(url))` at `:6413`.
5. That builder call sets `.user_agent(...)` and `.visible(...)` and, further down, `.title()` /
   `.inner_size()` / positioning — **no `data_store_identifier`, no custom `websiteDataStore`, no
   incognito/private flag, anywhere in the builder chain.** Confirmed by grep across the whole
   file (`data_store_identifier`, `website_data_store`, `incognito` — zero hits) and across
   `src-tauri/tauri.conf.json` (same three terms — zero hits): nothing in this codebase ever
   requests a non-default WebKit data store for ANY window.
6. The doc comment on `clear_default_data_store_cookies_for_domain` (`:4152-4182`), written by a
   prior session fixing a real, live-observed Epic logout defect (F-6 Defect B) that required
   reasoning through this exact mechanism, states it generally rather than narrowly: "the pristine
   webview's `WKWebViewConfiguration::new(mtm)` uses no custom `websiteDataStore` override, so its
   cookies live in the SAME process-wide `WKWebsiteDataStore::defaultDataStore()` **every
   Tauri-managed window already shares**" (`:4159-4161`, emphasis on the generalizing clause). The
   ordinary `WebviewWindowBuilder`-built window from step 4 is exactly such a window.
7. `clear_default_data_store_cookies_for_domain` (`:4184`) and its read-only sibling
   `default_data_store_cookies_for_domain` (`:4414`) both call
   `objc2_web_kit::WKWebsiteDataStore::defaultDataStore(mtm)` directly (`:4198`, `:4263` per the
   grep census) — the identical API surface a WKWebView falls back to when its configuration sets
   no override. This is the same store E-1/E-3 already proved the non-destructive per-host sweep
   (`humble_login_clear_cookies` with a sentinel label, gated `existing_window.is_none() &&
   epic_cookie_domain_matches(domain)` at `:7235-7237`) reads and clears.

**Conclusion:** every hop is confirmed structurally consistent — a plain navigation to
`https://www.fortnite.com/` via `window.api.oauthCaptureLogin({ runner: 'legendary', url:
'https://www.fortnite.com/' })` would write any cookies `fortnite.com` sets into the exact store
the non-destructive sweep already reads. Item 4 of the 2026-09-30 re-open's "Current Focus" is
CONFIRMED by source, not merely assumed.

**Why the live DevTools run was not attempted.** `ax-is-blind-to-the-tauri-native-dialog`
(project memory, 2026-09-24 addendum) measured that GameLib's own webview content is invisible to
macOS accessibility (`get name of every UI element` returns 4 unnamed elements; a raw coordinate
click fails with error -25208) and concluded "any live gate whose steps include 'click something
inside GameLib' needs a person" — with the one exception being a *named, reusable bypass* (a deep
link or an RPC entry point that reaches the same code without a UI hop). No such bypass exists for
this specific action: `oauthCaptureLogin` is only reachable from JS running inside the actual
renderer context (Tauri's IPC bridge is origin-scoped to that context), so triggering it requires
either a human typing into DevTools, or driving WebKit's remote inspector — neither of which this
session attempted, given (a) the source-level evidence above is already about as strong as
non-live evidence gets — the identical mechanism, reasoned through by this codebase's own prior
authors while fixing a real defect in this exact area — and (b) the action touches the live
process whose defaultDataStore also holds the operator's real Epic session cookies, and this
session's own E-8 record shows what an unreviewed live-gate mistake here has already cost once
(an 8-hour Epic lockout). The literal empirical PRESENT-then-ABSENT measurement therefore still
has not been run and the todo is being corrected, not closed, below.

### E-10 — DISCHARGED LIVE, 2026-09-30: seeded credential-free, swept per-host, Epic session intact

The full gate was driven end-to-end on this Mac at HEAD + the dev channel below. **No Epic
credentials were used, no logout was run, and `legendary auth --delete` was never invoked.**

**Seed.** From the main window's DevTools:
`window.api.oauthCaptureLogin({ runner: 'legendary', url: 'https://www.fortnite.com/' })`.
The shell log confirms the branch E-9 predicted by source — `humble_login_open: visible login
window '...' armed`, plus the cancel-strip / origin-banner / chrome-CSS injections that fire in the
VISIBLE builder's `if visible` block only, and **no `pristine` line at all**. So `is_epic_login`
was false and `open_pristine_epic_login_window` was never entered. `origin banner updated len=24`
matches `len('https://www.fortnite.com')` exactly, and `title change applied len=54` shows the page
served its own `document.title` rather than stalling.

**Instrument.** The existing independent reader,
`.planning/quick/260909-p4m-correct-the-stale-record-on-the-gog-amaz/gate-evidence/binarycookies-index-walk.py`,
against `~/Library/HTTPStorages/gamelib-shell.binarycookies`, read IN PLACE. Per-host counts and
cookie NAMES only; no values were read or recorded anywhere.

| host | baseline (Sep 28 jar) | after seed | after per-host sweep |
| ---- | --------------------- | ---------- | -------------------- |
| `.fortnite.com` | **0** | **5** | **0** |
| `.epicgames.com` | 5 | 5 | **5 — untouched** |
| `.www.epicgames.com` | 2 | 2 | 1 (see caveat) |
| `.unrealengine.com` / `.twinmotion.com` / `.metahuman.com` | 0 | 0 | 0 |

The five seeded `.fortnite.com` cookies were all PERSISTENT — they survived a full app quit and
relaunch, so the disk jar was a valid instrument here and the session-scoped hazard the re-open
flagged did not arm.

**Sweep.** `sidecar_invoke` -> `devSweepEpicCookieDomain` with `['fortnite.com']` (the dev-only
channel added by this session, below). Shell-side confirmation:

```
[shell] humble_login_clear_cookies: default-store evicting cookies + HTTP disk/memory cache
        for 1 matching data record(s) (domain-scoped, count only)
```

`1 matching data record` is WebKit's per-DOMAIN data-record granularity, not a per-cookie count —
one record carried all five `.fortnite.com` cookies.

**Non-destructiveness, verified rather than assumed.** `.epicgames.com` still holds its 5 session
cookies after the sweep, and `legendaryConfig/legendary/user.json` is still 6055 bytes and was
never deleted (its mtime moved to Sep 30 10:14:38 at app start, when legendary refreshed the token
— normal startup behaviour, not this sweep).

**Two honest caveats, neither affecting the verdict.**

1. `.www.epicgames.com` dropped from 2 to 1 (`__cf_bm` gone, `cf_clearance` remaining). This was
   **not** the sweep: the arm reported exactly `1 matching data record`, and a domain-scoped
   removal for `fortnite.com` cannot reach `.www.epicgames.com`. `__cf_bm` carries a ~30-minute
   Cloudflare TTL and ~51 minutes elapsed between the two reads, so it expired on its own.
2. The dev channel's own sidecar-side `logInfo` line was **never observed** — no `*.log` under
   `~/Library/Application Support/gamelib` contains it, and `logInfo` does not reach the dev
   harness's `[sidecar:err]` capture. The evidence above therefore rests on the Rust arm's own log
   line plus the two independent jar reads, NOT on that line. Do not cite it as an instrument.

**Verdict: D-35-19-15's discharge condition is MET.** A non-primary Epic apex cookie was confirmed
PRESENT in GameLib's own jar by an independent read, then confirmed ABSENT after the
`EPIC_COOKIE_HOSTS` sweep by the same independent read. This is not a `matched=0` — the "before"
was 5, measured.

### E-11 — the sweep had no non-destructive route until this session; one was added

`clearEpicCookies` existed ONLY as a step inside `LegendaryUser.logout()`
(`legendary/user.ts:275`), which runs `legendary auth --delete` first and unconditionally, and
sweeps all five hosts at once. So exercising the sweep meant destroying the operator's real Epic
session and could not isolate one apex. `dispatch_rust_channel` is deliberately NOT a
`#[tauri::command]` (`main.rs:8077-8080`, D-02's zero-renderer-capability-grant stance), so the
Rust arm is unreachable from the renderer directly.

Added: `src/backend/sidecar/devEpicCookieSweepRegistration.ts` — a dev-only `ipcMain` channel,
`devSweepEpicCookieDomain`, taking one domain and calling `seam.clearCookies()` with
`legendary/user.ts:57`'s `'epic-cookie-clear-no-window'` sentinel label. Registered from
`handlers.ts`. Three independent bounds: it is not registered at all in a packaged sidecar
(`isPackagedSidecar()`); the Rust arm's own `epic_cookie_domain_matches(domain)` gate means a
non-Epic domain cannot be cleared through it regardless of what is passed; and it clears cookies
only, never credentials. Deliberately NOT on the preload surface — `sidecar_invoke` already reaches
any registered channel by name, so a `window.api` entry would widen the documented renderer surface
(and the `IPC-PORT-INVENTORY.md` reconciliation `preload-surface-gate.py` enforces) for a
debugging instrument.

**One defect found in the added code, by the suite, and worth recording:** the first draft logged a
one-line "dev channel registered" banner at registration time. `handlers.ts` calls the registrar at
module scope, so registration time IS import time, and under Jest `heroicLogWriter` is not yet
initialised — it took **26 sidecar suites** down with
`TypeError: Cannot read properties of undefined (reading 'logWarning')`. Removed; the module now
documents the hazard. Same class as the import-time guard `appShellFlowRegistration.ts` documents.

**Gate evidence for the code:** `pnpm codecheck` exit 0; `npx prettier --check` clean on both files
with `--file-info` confirming `{ "ignored": false, "inferredParser": "typescript" }` for each (so
the green is non-vacuous); `pnpm lint` exit 0, `production: PASS | tests: PASS`; `pnpm find-deadcode`
exit 0 after dropping a dead `export` the gate correctly rejected; `pnpm jest src/backend/sidecar/__tests__`
66/66 suites, 1461/1461 tests; `pnpm planning-gates` 12/12.

## Eliminated

- hypothesis: "The sweep half of the discharge condition requires an authenticated Epic session."
  evidence: E-1 — `auth --delete` exits 0 unauthenticated, so `logout()` does not return early;
  and E-3 — the domain-scoped clear is independently invocable by channel name anyway, bypassing
  `logout()` entirely. timestamp: 2026-09-28
- hypothesis: "An independent jar-read instrument has to be written before the gate can run."
  evidence: E-4 — it exists in-repo and extracts no values. timestamp: 2026-09-28
- hypothesis: "A sibling apex can be seeded WITHOUT Epic credentials, by opening the login window
  and not authenticating."
  evidence: E-5 — measured NEGATIVE. A pre-auth WKWebView navigation to EPIC_LOGIN_URL sets 9
    cookies, all on epicgames.com, none on any of the four apexes; and a response from
    epicgames.com cannot set a cookie for a different registrable domain, so no navigation of
    that page could ever seed them. The Item 7 sibling cookies come from Epic's AUTHENTICATED
    SSO cookie-sync. timestamp: 2026-09-28
- hypothesis: "An authenticated Epic login seeds the four sibling apexes on this build, as
  35-AB-RETEST Item 7 measured on 2026-08-29."
  evidence: E-7 — a confirmed authenticated login (status --json: account present, 6 games) left
    0 cookies on all four apexes in the flushed jar, and the logout's in-memory census reported
    matched=0 for all four while correctly clearing 8 on epicgames.com. The sweep works; the
    fixture no longer appears. timestamp: 2026-09-28
- hypothesis: "The gate can be completed now that we know only an authenticated login is needed."
  evidence: E-8 — a cold-jar Epic sign-in cannot complete at all (300s timeout, single nav host),
    which is F-34.5-G6-01's never-verified pre-auth half and a separate tracked defect as of
    2026-09-28. The seeding step is unreachable, so the discharge condition is unsatisfiable on
    this build. timestamp: 2026-09-28
- hypothesis: "The seeding half genuinely does require an authenticated Epic login, because a
  credential-free navigation to the Epic login page seeds none of the four sibling apexes (E-5)."
  evidence: E-9 (2026-09-30 re-open) — this was a non-sequitur from E-5's own correctly-derived
    rule ("only a request served BY a sibling apex can set a cookie on it"). E-5 tested exactly
    one vehicle (the epicgames.com login page) and wrongly generalised the negative result to
    every vehicle. A plain navigation to https://www.fortnite.com/ itself IS a request served by
    a sibling apex and needs no Epic credentials at all — confirmed by a full source-level trace
    of window.api.oauthCaptureLogin -> captureOAuthLogin -> humble_login_open -> is_epic_login
    (false for a fortnite.com URL) -> the ordinary WebviewWindowBuilder path, which shares the
    process-wide WKWebsiteDataStore::defaultDataStore() the non-destructive sweep already reads.
    timestamp: 2026-09-30

## Resolution (SUPERSEDED 2026-09-30 — see "Current Focus" at the end of this file)

status: "investigating -> BLOCKED on an external defect, D-35-19-15 NOT closed (SUPERSEDED: the blocker closed, and the reasoning below contains a non-sequitur corrected in Current Focus)"

outcome: "D-35-19-15's discharge condition is UNSATISFIABLE on this build, for a THIRD distinct
  reason from the two already on record. It is not 'no seeding vehicle exists' (the filing premise,
  corrected 2026-09-26) and it is not 'needs real credentials/2FA' (this session's own starting
  framing, refuted by E-1/E-3 and then made moot): it is that a fresh Epic sign-in cannot complete
  on a cold cookie jar at all (E-8), and a login that DOES complete on a warm jar seeds none of the
  four sibling apexes (E-7). The todo stays OPEN and is NOT closed on a zero — a bare matched=0 was
  explicitly ruled insufficient by its own discharge condition, and that ruling still holds."

what_this_session_did_establish:
  - "E-1/E-3: the sweep half was never credential-gated, and is invocable per-host without logout.
    `legendary auth --delete` exits 0 unauthenticated; humble_login_clear_cookies is a
    dispatch_rust_channel arm reachable by name."
  - "E-4: the independent jar-read instrument already existed; nothing needed building."
  - "E-5: a credential-free seed is impossible by the login-window vehicle — measured, and required
    by the cookie-domain rule regardless."
  - "E-7 (NEW, and the most valuable result here): the EPIC_COOKIE_HOSTS sweep is proven to work
    end-to-end on 8 real live Epic cookies, measured as an in-memory before/after delta. That had
    never been shown outside unit tests."
  - "E-8: the pre-auth Epic login defect — F-34.5-G6-01's unverified half — reproduced with a real
    account, and filed as its own todo. It is materially more important than D-35-19-15: a
    logged-out user cannot add an Epic account on macOS."

blocked_on: ".planning/todos/pending/2026-09-28-epic-pre-auth-login-times-out-on-a-cold-cookie-jar.md
  — until a cold-jar Epic sign-in can complete, the seeding step of D-35-19-15 cannot be performed by
  anyone, with or without credentials."

residual_gap: "Measurement B (login and logout within ONE app session, so the in-memory census sees
  session-scoped cookies) was never run, because the login required for it can no longer be driven.
  A session-scoped sibling-apex cookie is therefore formally unexcluded. State it as unexcluded; do
  not record E-7 as proving absence in memory as well as on disk."

files_changed:
  - ".planning/debug/epic-sibling-apex-non-destructive-discharge.md"
  - ".planning/todos/pending/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md"
  - ".planning/todos/pending/2026-09-28-epic-pre-auth-login-times-out-on-a-cold-cookie-jar.md"

## Current Focus (re-opened 2026-09-30)

hypothesis: "A sibling apex can be seeded with ZERO Epic credentials by navigating GameLib's own
  login window to https://www.fortnite.com/ — a request served BY a sibling apex. E-5 derived the
  correct rule and then drew a non-sequitur from it."

test: "Dev run. From DevTools: window.api.oauthCaptureLogin({ runner: 'legendary', url:
  'https://www.fortnite.com/' }). Let the navigation settle, cancel the window (the capture will
  never resolve — the cookies are already written). Then read the per-host census."

expecting: "fortnite.com count >= 1 in GameLib's own default WKWebsiteDataStore. Any cookie name
  counts — EPIC_COOKIE_HOSTS sweeps by HOST, not by name (this session's own E-3)."

next_action: "Confirm the seeding vehicle reaches the process-wide defaultDataStore, then decide the
  sweep half: per-host non-destructive route preferred, logout only with explicit operator consent."

### Why this session re-opened, and what is LOCKED

**1. The blocker named in `blocked_on` above is CLOSED.** `2026-09-28-epic-pre-auth-login-times-out-on-a-cold-cookie-jar.md`
is in `.planning/todos/completed/`, the widened eviction (`WKWebsiteDataTypeDiskCache` +
`WKWebsiteDataTypeMemoryCache`) is in the tree at `src-tauri/src/main.rs:4325` and `:7499`, and the
operator's `legendaryConfig/legendary/user.json` was rewritten **2026-09-28 18:48:34** — a cold-jar
Epic sign-in demonstrably succeeded on this machine after the fix. E-8 no longer blocks anything.

**2. E-5's conclusion is a NON-SEQUITUR from E-5's own correct rule.** The rule it established is
sound and stands: *only a request served BY `fortnite.com` / `unrealengine.com` / `twinmotion.com` /
`metahuman.com` can set a cookie on that apex, because a response from `epicgames.com` cannot set a
cookie for a different registrable domain.* The inference drawn from it — "therefore the seeding
half genuinely does require an authenticated Epic login" — does not follow. **Those four apexes are
public, Epic-run websites.** A plain navigation to one of them IS a request served by a sibling
apex, and needs no credentials, no 2FA, and no SSO cookie-sync. E-5 measured the wrong vehicle
(the login page at `epicgames.com`) and generalised the result to all vehicles.

**3. The fixture does not have to be `EPIC_DEVICE`.** E-3, in this same session, already established
that `EPIC_COOKIE_HOSTS` sweeps **by host, not by cookie name**, so *any* cookie on one of the four
apexes is a valid fixture. The chase for Item 7's specific SSO-synced `EPIC_DEVICE` cookie was never
necessary.

**4. A vehicle for an arbitrary-URL navigation already exists** — `window.api.oauthCaptureLogin({
runner, url })` (`src/frontend/screens/WebView/useTauriOAuthLogin.ts:251`). The URL is validated
https-only in Rust by `login_window_url_arg` (`main.rs:2055`), and `is_epic_login` (`main.rs:6291`)
matches host `www.epicgames.com` ONLY — so a `fortnite.com` URL takes the ordinary visible Tauri
window builder rather than `open_pristine_epic_login_window`. That builder shares the process-wide
`WKWebsiteDataStore::defaultDataStore()`; the standing evidence is that `STORE_LOGOUT_COOKIE_DOMAINS`
exists precisely to sweep GOG/Amazon cookies that ordinary Tauri login windows left in that store.
**Verify this rather than assume it** — it is the one structural claim in this re-open that has not
been measured.

### Constraints carried forward (not re-litigated)

- **Discharge condition is NOT relaxed.** PRESENT on a sibling apex in GameLib's own jar, then
  ABSENT after the sweep, both by an independent read. A bare `matched=0` discharges nothing.
- **Instrument, persistent-vs-session.** The disk jar LAGS (E-7 needed an app quit to flush), so a
  session-scoped `fortnite.com` cookie would die at quit and be invisible to it. Prefer the sweep's
  own in-memory `WKWebsiteDataStore` per-host census for the PRESENT/ABSENT pair **within one app
  session**, with the disk-jar read as corroboration. Always say which instrument saw what.
- **Reader already exists; build nothing.** `.planning/quick/260909-p4m-correct-the-stale-record-on-the-gog-amaz/gate-evidence/binarycookies-index-walk.py`.
- **PII.** Read jars IN PLACE, never copy them, report per-domain COUNTS only, never cookie values.
  This repo has a 103 MB unredacted-capture incident on record.
- **E-6 still applies to any standalone probe:** WebKit storage escapes the eight-variable fake-HOME
  containment (it resolves via `NSHomeDirectory()`/process name), so a probe leaves artifacts in the
  REAL profile under `~/Library/{HTTPStorages,Caches,WebKit}/<procname>` that must be cleaned up by
  hand and verified absent.

### The sweep half — decide, and ASK before anything destructive

Preferred: the **non-destructive per-host route**. `humble_login_clear_cookies` is a
`dispatch_rust_channel` arm (`main.rs:5657`, arm `:7128`) taking `[label, domain]`, so
`fortnite.com` alone can be swept, leaving the operator's live Epic session and their
`epicgames.com` cookies untouched.

Fallback, **requiring explicit operator consent**: the in-app Epic logout, which sweeps all five
hosts — it destroys the live `epicgames.com` cookies AND runs `legendary auth --delete` against the
REAL profile, killing the session in `user.json`. A live session exists right now
(`user.json`, 6055 bytes, mtime 2026-09-28 18:48:34). When asking, state plainly that the cold-jar
login path is now proven on this machine post-fix, so the logout is reversible — **that precondition
is exactly what was missing on 2026-09-28, when this gate's logout step cost the operator an 8-hour
Epic lockout.**

Also price a third option honestly: a small dev-only or test-only route to the per-host arm may be
cheaper and safer than either.

### Deliverable when this closes

Rewrite the todo's rotten `blocked_by` and discharge prose in
`.planning/todos/pending/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md`
rather than merely ticking it, so the "needs an authenticated Epic login" premise does not outlive
this session. Correct E-5's conclusion in place, above, too — its rule stays, its inference goes.

## Resolution (2026-09-30 disposition — this re-open's own work, NOT a discharge of D-35-19-15)

status: "investigating -> the re-open's two open questions (seeding-vehicle mechanism, sweep-half
  choice) are answered by source; the todo's premise is corrected; D-35-19-15 itself remains OPEN
  and un-discharged — the live PRESENT-then-ABSENT measurement has still never been run."

outcome: "Item 4 (E-9) is CONFIRMED by a complete source-level trace, not live-measured: a plain
  navigation to https://www.fortnite.com/ via window.api.oauthCaptureLogin reaches the ordinary
  WebviewWindowBuilder path (is_epic_login is false for that host), which shares the SAME
  process-wide WKWebsiteDataStore::defaultDataStore() the non-destructive sweep already reads and
  clears — confirmed by tracing every hop, by grep showing no data-store override exists anywhere
  in this codebase, and by a prior-author doc comment reasoning through the identical mechanism
  while fixing a real, related defect. The sweep half is decided: PREFER the non-destructive
  per-host route (humble_login_clear_cookies with the Epic sentinel label + domain='fortnite.com'
  alone), already proven reachable without logout by E-1/E-3 in this same file — no new code is
  needed for it. The live DevTools run itself (opening the window, letting the navigation settle,
  reading the per-host census) was deliberately NOT attempted by this agent: GameLib's own webview
  is AX-blind (project memory `ax-is-blind-to-the-tauri-native-dialog`), no named bypass exists for
  this specific action (oauthCaptureLogin is only reachable from JS inside the real renderer
  context), and the action touches the same live process whose defaultDataStore holds the
  operator's real Epic session — the exact class of action E-8 already showed can go wrong
  expensively when driven without care."

what_this_session_did_establish:
  - "E-9: the seeding-vehicle structural claim (item 4 of the 2026-09-30 re-open) is CONFIRMED by
    a complete, hop-by-hop source trace — not assumed, and distinguished explicitly from a live
    measurement."
  - "E-5's non-sequitur is corrected in this file's Eliminated section and in the todo below: its
    RULE stands (only a request served by a sibling apex can set a cookie there), its INFERENCE
    that this requires authenticated Epic credentials does not — a plain public-site navigation
    satisfies the rule with zero credentials."
  - "The sweep-half decision is made: the non-destructive per-host route is preferred, requires no
    new code, and leaves the operator's live Epic session and epicgames.com cookies untouched."
  - "The todo's blocked_by/discharge prose is rewritten (see files_changed) so the 'needs an
    authenticated Epic login' premise does not outlive this session, per the deliverable
    instruction above."

not_done_and_why: "The literal empirical live-gate run (open a window to a sibling apex, read the
  per-host census, confirm PRESENT, sweep just that host, confirm ABSENT, both by the independent
  reader) was not executed by this agent. It requires driving GameLib's own DevTools console, which
  is a GUI action this project's own measured evidence says needs a person (AX cannot enumerate or
  click inside GameLib's webview). The recipe is now fully specified, non-destructive, needs no
  credentials, and needs no logout — cheap for the operator or a future session with explicit
  consent to run."

blocked_on: "NOTHING structural. D-35-19-15 is not blocked; it is a ready:live-gate item with a now
  fully-specified, non-destructive, credential-free recipe (see the todo's rewritten body and this
  file's 'The sweep half' section above)."

files_changed:
  - ".planning/debug/epic-sibling-apex-non-destructive-discharge.md"
  - ".planning/todos/pending/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md"

## Resolution (FINAL, 2026-09-30)

status: "resolved — D-35-19-15's discharge condition MET live, todo closed"

root_cause: "The todo was never blocked by a missing capability. Its premise — that seeding a
  sibling-apex cookie requires an authenticated Epic login — was a non-sequitur drawn from E-5's own
  correct rule. E-5 established that only a request served BY one of the four apexes can set a cookie
  there, tested exactly ONE vehicle for such a request (the Epic login page at epicgames.com, which
  by that rule can never satisfy it), and generalised the negative to every vehicle. The four apexes
  are public, Epic-run websites; navigating to one satisfies the rule with zero credentials. The
  refutation was already in the same file two entries earlier: E-3 had established the sweep matches
  by HOST, not by cookie name, so Item 7's SSO-synced EPIC_DEVICE was never required."

fix: "Two parts. (1) No product defect existed — the EPIC_COOKIE_HOSTS sweep was correct all along
  and is now proven on a real sibling-apex cookie (E-10). (2) The missing piece was a non-destructive
  way to EXERCISE it: added src/backend/sidecar/devEpicCookieSweepRegistration.ts, a dev-only
  single-host sweep channel, because clearEpicCookies previously existed only inside logout() behind
  an unconditional `legendary auth --delete` (E-11)."

verification: "E-10. .fortnite.com measured 0 -> 5 -> 0 by an independent binarycookies read, with
  .epicgames.com's 5 cookies and user.json intact throughout. Not a vacuous zero: the 'before' was 5,
  measured. Code gates in E-11."

cost_to_the_operator: "None. No credentials entered, no logout, no re-login, no account risk — in
  deliberate contrast to the 2026-09-28 attempt at this same gate, which cost an 8-hour Epic lockout."

residual_gap: "The 2026-09-28 residual (measurement B — login and logout within ONE app session, so
  a session-scoped sibling cookie would be visible) is now MOOT rather than open: the five seeded
  .fortnite.com cookies were all persistent and survived a quit/relaunch, so the disk instrument was
  valid for this fixture and the session-scoped hazard never armed. It remains formally unexcluded
  for a hypothetical session-scoped cookie, which nothing now depends on."

superseded_claims:
  - "E-5's CONCLUSION ('a credential-free seed is impossible', 'the seeding half genuinely does
    require an authenticated Epic login') — refuted by E-10. E-5's RULE stands unchanged."
  - "`blocked_on` (the cold-jar login todo) — that todo is in completed/ and the eviction fix is in
    the tree at main.rs:4325 and :7499."
  - "The 2026-09-28 Resolution block's 'UNSATISFIABLE on this build' — marked SUPERSEDED in place."

files_changed:
  - "src/backend/sidecar/devEpicCookieSweepRegistration.ts (new, dev-only)"
  - "src/backend/sidecar/handlers.ts (import + one guarded registration call)"
  - ".planning/debug/epic-sibling-apex-non-destructive-discharge.md"
  - ".planning/todos/completed/2026-09-02-d-35-19-15-sibling-apex-seeding-unqueued-and-unreproducible-.md (moved from pending/)"
