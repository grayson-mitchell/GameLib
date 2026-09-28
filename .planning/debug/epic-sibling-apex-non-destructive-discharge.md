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

## Resolution

status: "investigating -> BLOCKED on an external defect, D-35-19-15 NOT closed"

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
