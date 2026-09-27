---
slug: epic-sibling-apex-non-destructive-discharge
status: investigating
trigger: "action todo: D-35-19-15 Epic sibling-apex — can the live gate be discharged WITHOUT the operator's Epic credentials, and without signing them out?"
created: 2026-09-28
updated: 2026-09-28
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

## Current Focus

**The credential-free path is closed (E-5). The gate now reduces to exactly one step that only the
operator can perform: an authenticated Epic login.**

Post-E-5 status of the four steps:

| step | status |
| ---- | ------ |
| Instrument an independent jar read | DONE — already existed (E-4) |
| Seed a sibling apex without credentials | **IMPOSSIBLE by this vehicle (E-5)** |
| Sweep one host non-destructively | AVAILABLE — `humble_login_clear_cookies` by channel name (E-3) |
| Seed a sibling apex WITH an authenticated login | **the only remaining step; needs the operator** |

The remaining procedure, if the operator chooses to run it:

1. Operator logs into Epic through GameLib's own OAuth login window (real credentials/2FA).
2. Independent jar read, counts only, for the four apexes — expect ≥1 present (that is what
   `35-AB-RETEST.md` Item 7 measured). This is the "confirmed PRESENT" half.
3. Sweep that ONE host via E-3's channel (`humble_login_clear_cookies` with `[<sentinel-label>, '<apex>']`)
   — **not** `logout()`, so the operator's freshly-created Epic session survives the test.
4. Independent jar read again — expect that host at 0. This is the "confirmed ABSENT" half, and it
   discharges D-35-19-15.

Step 3 is what E-1 and E-3 bought: the discharge no longer requires signing out. The operator logs
in once and stays logged in.

`ready:` stays `live-gate`.

## Operator decision required

Step 1 above is safe and non-destructive. It is not yet run because it needs a live app run, and
because the branch beyond it touches the operator's own account:

- **A full login+logout gate would sign the operator out of Epic.** A live session exists (E-2).
  `LegendaryUser.logout()` runs `auth --delete`, which destroys it. That has NOT been run and must
  not be, without explicit confirmation.
- Whether to spend real credentials/2FA on this at all is the operator's call, and per E-3 it may
  not be necessary.
