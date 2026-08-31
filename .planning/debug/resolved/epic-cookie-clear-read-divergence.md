---
status: resolved
trigger: "Epic cookie clear reports matched=0 / 7 removed, but an index-walking binarycookies parse of the live jar written 3s later still finds 6-7 LIVE Epic records including EPIC_SESSION_AP"
created: 2026-08-31T20:15:00Z
updated: 2026-08-31T20:15:00Z
---

## Current Focus

hypothesis: CONFIRMED and FIXED (see Resolution). The Epic logout re-created the cookies it deleted, using its own two hidden webviews pointed at Epic's live login page.
test: LIVE GATE — operator logs in to Epic on the running dev build (pid 85098), then logs out; the product's post-clear report is then compared against an independent index-walking parse of ~/Library/HTTPStorages/gamelib-shell.binarycookies
expecting: zero Epic-owned live records in the jar after the logout, a `post-clear verification — 0 Epic-owned cookie(s) remain` log line, and no record whose `created` timestamp lands on or after the clear
next_action: CHECKPOINT — request the login and logout gestures from the operator, then parse the jar and diff against gamelib.log


## Symptoms

expected: after an Epic logout, the on-disk cookie jar contains zero Epic-owned live records; product's reported post-clear state matches an independent parse
actual: product logs per-host `after(total=54, matched=0, verdict=SUPPORTED_NONEMPTY)` and summary "Epic cookie clear removed 7 cookie(s) across 5 Epic-owned domain(s)", but an index-walking binarycookies parse of the jar written 3s later finds 6 (dev) / 7 (packaged) LIVE Epic-owned records
errors: no thrown error — silent false-success. Census self-inconsistency: total moves 57 -> 51 (drop of 6) while run reports 7 cleared; fortnite.com step logged `cleared 1` with total unchanged
reproduction: run pnpm tauri:dev (commit 9106ccbea), log in to Epic, log out, then parse ~/Library/HTTPStorages/gamelib-shell.binarycookies with the index-walking parser at scratchpad/bc.js
started: divergence invisible before commit 9106ccbea (census returned UNSUPPORTED_OR_ERROR on every host, producing no readings) — so newly VISIBLE, not newly introduced

### Measured data (2026-08-31)

| jar | clear at | jar mtime | live Epic records AFTER |
| --- | --- | --- | --- |
| ~/Library/HTTPStorages/gamelib-shell.binarycookies (dev) | 19:27:14 | 19:27:18 | 6 |
| ~/Library/HTTPStorages/com.gamelib.shell.binarycookies (packaged) | 18:15:15 | 18:17:28 | 7 |

Survivors: `_epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID`, and `EPIC_SESSION_AP`
(.epicgames.com, path=/id, vlen=1310, created=2026-08-31T06:17:18 — nine hours before logout, so it SURVIVED rather than being re-created).

## Eliminated

- hypothesis: "unreferenced remnant" — the bytes are dead records left behind by rewrite, not live cookies
  evidence: index-walking parse shows every record is LIVE per the file's own page/offset index; each name occurs exactly once, so live-record count == byte-occurrence count
  timestamp: 2026-08-31 (pre-session, supplied)

- hypothesis: "matched=0 means the read is name-scoped and simply did not look for these names"
  evidence: user.ts:243 calls seam.cookiesForDomain(label, host, []) with an EMPTY names array; Rust arm gates on `filter_names.is_empty() || ...` (main.rs:4015, :6537) so matched counts EVERY domain-matching cookie. cookie_domain_matches strips leading dot and suffix-matches, so all six Epic records match target epicgames.com
  timestamp: 2026-08-31 (pre-session, verified in source)

- hypothesis: H1 — the clear+census operate on the WKWebView WKWebsiteDataStore while the on-disk ~/Library/HTTPStorages/*.binarycookies is a DIFFERENT (NSHTTPCookieStorage) jar that neither touches
  evidence: NUMERIC FINGERPRINT MATCH. The dev jar holds 56 live records; exactly 2 of them are expired (`.www.epicgames.com __cf_bm` exp 07:57:15Z and `.ecosec.on.epicgames.com __cf_bm` exp 07:57:16Z, both long past). 56 - 2 expired = 54, which is EXACTLY the census `after(total=54)`. The jar also carries cookies from every other surface the app browses (.humblebundle.com, .gog.com, .amazon.com, .applegamingwiki.com, .metacritic.com, .youtube.com). One shared store, not two.
  timestamp: 2026-08-31T20:40Z

- hypothesis: H2 — the delete reports success without deleting (the recorded wry-cookie-delete-lies-about-deleting shape)
  evidence: The delete DOES delete. The census re-read after each clear returns matched=0 against a jar that is provably alive (total=54..57), and the jar total falls monotonically across the sweep (57 -> 54 -> 54 -> 53 -> 52 -> 51). Deletion is real and observable. The failure is that the jar is REPOPULATED after the observation window closes.
  timestamp: 2026-08-31T20:40Z

- hypothesis: EPIC_SESSION_AP (packaged jar, created 2026-08-31T06:17:18Z) SURVIVED the 18:15:15 clear because it was created nine hours earlier
  evidence: TIMEZONE MISREAD in the original report. The parser emits UTC; the machine and gamelib.log are Pacific/Auckland = UTC+12 on 2026-08-31 (verified via Intl longOffset). 06:17:18Z = 18:17:18 LOCAL — two minutes AFTER the 18:15:15 clear, not nine hours before. The packaged log shows the operator RE-LOGGED IN at 18:16:34 (`[oauthLoginCapture] runner=legendary label=loginwin-2-...`), nav to www.epicgames.com at 18:16:35, and `status=captured` at 18:17:19. EPIC_SESSION_AP was minted at 18:17:18, one second before that capture completed. It is the new login's own session cookie.
  timestamp: 2026-08-31T20:40Z

## Evidence

- timestamp: 2026-08-31T20:15:00Z
  checked: session bootstrap
  found: symptoms prefilled from measured operator data; two rival hypotheses supplied (H1 two distinct cookie stores; H2 delete lies per recorded finding wry-cookie-delete-lies-about-deleting) — BOTH unmeasured
  implication: must design an experiment that SEPARATES H1 from H2 rather than confirming either; a third explanation is live

- timestamp: 2026-08-31T20:35Z
  checked: parsed the LIVE dev jar ~/Library/HTTPStorages/gamelib-shell.binarycookies (mtime 19:27:18) with the index-walking parser
  found: 56 live records total; 6 Epic-owned. Two of the 56 are already expired (both __cf_bm, 30-minute Cloudflare TTL). 56 - 2 = 54 == the census's reported after(total=54).
  implication: census and jar are THE SAME STORE. H1 (two distinct cookie stores) is falsified. The census read is healthy and is reading the very file the parser reads.

- timestamp: 2026-08-31T20:42Z
  checked: converted every Epic record's `created` field from the parser's UTC output into Pacific/Auckland (UTC+12 on 2026-08-31)
  found: DEV jar (clear ran 19:27:14-19:27:15 per gamelib.log):
            .www.epicgames.com      __cf_bm        created 19:27:14 LOCAL
            .epicgames.com          EPIC_DEVICE    created 19:27:15 LOCAL
            .epicgames.com          EPIC_LOGIN_ID  created 19:27:15 LOCAL
            .epicgames.com          _epicSID       created 19:27:15 LOCAL
            .ecosec.on.epicgames.com __cf_bm       created 19:27:15 LOCAL
            .epicgames.com          _tald          created 19:27:16 LOCAL
          PACKAGED jar (clear ran 18:15:15):
            __cf_bm / EPIC_DEVICE / EPIC_LOGIN_ID / _epicSID  created 18:15:16 LOCAL
            _tald                                             created 18:15:17 LOCAL
            EPIC_SESSION_AP                                   created 18:17:18 LOCAL
  implication: EVERY surviving record was minted DURING or IMMEDIATELY AFTER its own clear, to the second. Nothing survived. The jar was repopulated. Corroborating: both __cf_bm records carry exactly a 30-minute expiry from their creation second — Cloudflare's bot-management TTL — which only a LIVE HTTPS request to Epic can mint.

- timestamp: 2026-08-31T20:45Z
  checked: src/backend/storeManagers/legendary/user.ts:197 and :414 — what the two wipeSteps actually open
  found: step 1 `clearEpicCookies` runs `const label = await seam.open(EPIC_LOGIN_ORIGIN, { visible: false, userAgent: standardBrowserUserAgent() })` where EPIC_LOGIN_ORIGIN = 'https://www.epicgames.com/id/login?responseType=code' (user.ts:23). Step 2 `clearEpicStorage` runs `seam.clearStorage(EPIC_LOGIN_ORIGIN, ...)`, which opens its OWN window at the SAME live URL, and runs AFTER the cookie loop has finished with no subsequent clear.
  implication: the logout opens a hidden browser AT EPIC'S LOGIN PAGE, purely to obtain a window handle for the cookie API. That navigation is a real network fetch. Epic + Cloudflare set fresh cookies on it while the clear loop is still running, and keep setting them after the loop's final census. Step 2 then re-seeds a second time with nothing left to clear after it.

- timestamp: 2026-08-31T20:47Z
  checked: whether the concurrent-write mechanism also explains the census's self-inconsistencies
  found: it explains all three. (a) `fortnite.com before(matched=1)` on a jar that ends with zero fortnite.com records — a cookie set by the loading Epic page, then successfully cleared. (b) `fortnite.com cleared 1` with `total` flat at 54 -> 54 — one removed and one concurrently added in the same instant. (c) summed `total` 57 -> 51 (net -6) against a reported 7 cleared — the missing 1 is a concurrent addition.
  implication: single mechanism, not several defects. Every anomaly in the run is a concurrent write from the app's own hidden Epic-navigating windows.

- timestamp: 2026-08-31T20:48Z
  checked: whether any OTHER surface could be the writer
  found: the packaged log records `[WebView] in-app store/wiki browsing unavailable under Tauri (pathname=/store/epic)` (D-05) — the in-app store browser is disabled. The main window is a tauri:// / localhost webview. legendary is a separate Python binary that cannot write macOS HTTPStorages. The only webviews that navigate to epicgames.com during a logout are the two the logout itself opens.
  implication: the logout is the sole writer. Root cause is confirmed and exclusive.

- timestamp: 2026-08-31T21:03Z
  checked: LIVE GATE. Operator logged IN to Epic then OUT on the fixed dev build (pid 85098, started 20:59). Live jar identified by which mtime MOVED — ~/Library/HTTPStorages/gamelib-shell.binarycookies went 20:48 -> 21:03 (14407 -> 13084 bytes); the packaged com.gamelib.shell.binarycookies stayed at 18:17 and is NOT this run's jar. Every count below is pinned to the dev jar alone. Machine offset re-confirmed at gate time: `date` -> NZST +1200.
  found: |
    Product's report (gamelib.log, local time):
      21:03:12  cleared storage — localStorage=3, ...            <- STORAGE RAN FIRST
      21:03:13  epicgames.com     cleared 8  before(total=59, matched=8) after(total=51, matched=0)
      21:03:13  fortnite.com      cleared 0  before(total=51, matched=0) after(total=51, matched=0)
      21:03:13  unrealengine.com  cleared 0  before(total=51, matched=0) after(total=51, matched=0)
      21:03:13  twinmotion.com    cleared 0  before(total=51, matched=0) after(total=51, matched=0)
      21:03:13  metahuman.com     cleared 0  before(total=51, matched=0) after(total=51, matched=0)
      21:03:13  removed 8 cookie(s) — epicgames.com=8, others=0
      21:03:13  post-clear verification — 0 Epic-owned cookie(s) remain across 5 domain(s)

    Independent index-walking parse of that same jar: 51 live records, 0 expired,
    ZERO Epic-owned. Zero by domain suffix, zero by domain substring, zero by cookie
    NAME containing "epic" (the check that would catch an unknown survivor the way
    EPIC_SESSION_AP escaped every earlier pass), and zero raw BYTE occurrences of
    EPIC_SESSION_AP, _epicSID, _tald, EPIC_DEVICE, EPIC_LOGIN_ID.
  implication: The product's reported post-clear state MATCHES the independent parse. Definition of done met.

- timestamp: 2026-08-31T21:05Z
  checked: the four arithmetic reconciliations the PRE-FIX run failed
  found: |
      (1) jar total across the sweep      59 -> 51 = drop of 8; reported cleared 8.  RECONCILES
          (pre-fix: dropped 6 while reporting 7 — did not reconcile)
      (2) per-host deltas sum             8+0+0+0+0 = 8 = reported total 8.          RECONCILES
      (3) each host's own before/after    epicgames 59->51 (-8, cleared 8); the four
                                          siblings 51->51 (-0, cleared 0). Every
                                          per-host delta matches its own census.     RECONCILES
          (pre-fix: fortnite.com logged `cleared 1` with total unchanged — did not)
      (4) parse vs census                 51 live records - 0 expired = 51 =
                                          census after(total=51).                    RECONCILES EXACTLY
          (pre-fix needed a "minus 2 expired" correction to reach 54; this run has
           no expired records at all, so it matches directly)
  implication: all four reconcile. This is not a partial fix.

- timestamp: 2026-08-31T21:06Z
  checked: the RE-CREATION test — the diagnostic that produced this session's root cause
  found: no Epic-owned record exists at all, so there is nothing whose `created` second could land on the clear. The positive form of the same test: ZERO `__cf_bm` records anywhere in the jar. `__cf_bm` carries a 30-minute Cloudflare TTL from creation and only a live HTTPS round trip to Epic can mint one — pre-fix, two were minted at 19:27:14/19:27:15, on the clear's own seconds. Their total absence is direct evidence that no page load to Epic happens anywhere in the teardown any more.
  implication: the re-seeding mechanism is gone, not merely out-run.

- timestamp: 2026-08-31T21:06Z
  checked: whether the fixture was real, or whether a clean jar merely reflects a vacuous run with nothing to clear
  found: real. Login at 21:02:21-21:03:01 (`label=loginwin-0-...`, `host=www.epicgames.com`, capture, `legendary auth --code`), library refreshed to 15 games. The logout's own BEFORE census measured `matched=8` on epicgames.com — eight genuine Epic cookies present, versus only 3 in the pre-fix baseline. A new `api.hcaptcha.com hmt_id` record created 21:02:41 (Epic's login captcha provider) independently corroborates that a real Epic login page was exercised. All 8 were removed.
  implication: the gate cleared a genuinely populated jar, not an empty one.

- timestamp: 2026-08-31T21:07Z
  checked: collateral damage — D-09-CORRECTED scope and the REQ-34.4.1-06 harm (this jar is app-wide and holds Humble/GOG/Amazon sessions)
  found: |
      non-Epic records   BEFORE 50   AFTER 51
      Epic-owned         BEFORE  6   AFTER  0
      LOST across the run: (none)
      GAINED: api.hcaptcha.com hmt_id, created 21:02:41 (the login's own captcha cookie)
    `.humblebundle.com _simpleauth_sess`, the GOG galaxy-login trio and the Amazon
    session set are all still present and untouched.
  implication: the clear stayed inside its approved scope. No storefront the logout never touched was signed out.

- timestamp: 2026-08-31T21:08Z
  checked: the single remaining raw byte occurrence of the string "epicgames" in the post-logout jar (offset 7604) — chased rather than dismissed, because an unexplained Epic string is exactly what would trigger a false alarm on the next pass
  found: it is inside the VALUE of `api.hcaptcha.com` / `hmt_id`, in a WebKit bplist carrying `StoragePartition` + `AccessTime` + `https://epicgames.com`. It is a partitioned third-party cookie whose PARTITION KEY is Epic — the record's own domain is `api.hcaptcha.com` and its name is `hmt_id`. It carries no Epic session; it is an hCaptcha device identifier.
  implication: NOT in scope and correctly left alone — hcaptcha.com is not Epic-owned, and clearing it would sign the user out of hCaptcha across every other site that uses it, precisely the REQ-34.4.1-06 harm D-09-CORRECTED forbids. Recorded here so a future `grep epicgames` over this jar does not re-open a closed defect.

## Resolution

verdict: PASS — live-verified 2026-08-31 21:03. Reported state matches an independent parse.

residuals: |
  1. D-35-19-15 REMAINS UNEXERCISED. Its ask is a non-primary Epic domain cookie
     confirmed PRESENT before a logout and then cleared. This run seeded none: all four
     sibling hosts reported before(matched=0). Note WHY, because it is a consequence of
     the fix rather than an accident — pre-fix, those four each showed before(matched=1),
     and those cookies were set by the logout's OWN hidden window loading Epic's login
     page. Removing that window removed the only thing that had ever populated them in a
     logout. The sibling domains stay in EPIC_COOKIE_HOSTS (D-09-CORRECTED, measured
     against 35-AB-RETEST Item 7), but proving they clear needs a deliberately seeded
     fixture, not an opportunistic one.
  2. NON-MACOS IS UNVERIFIED. Windows and Linux still open a real window (the Rust
     default-data-store fallback is `#[cfg(target_os = "macos")]`), now pointed at
     `https://gamelib.invalid/` instead of Epic. Strictly less network than before, but
     no live leg exists on either platform until Phase 38.
  3. An `api.hcaptcha.com` / `hmt_id` cookie PARTITIONED to `https://epicgames.com`
     survives logout. Correctly out of scope (hcaptcha.com is not Epic-owned; clearing it
     is the REQ-34.4.1-06 harm) and it carries no Epic session — but it means the string
     `epicgames` still appears once in the jar's bytes after a clean logout.
  4. A residual race remains in principle: a cookie written by the storage window
     microseconds before its close could land after the final census. The verification
     sweep is what would surface it, loudly, as a failed logout rather than a false
     success.

root_cause: |
  The Epic logout re-creates the cookies it deletes, using its own hidden webviews.

  `clearEpicCookies` (src/backend/storeManagers/legendary/user.ts:197) opens a hidden
  WKWebView navigated to `EPIC_LOGIN_ORIGIN` — Epic's LIVE login page — solely to obtain a
  window handle. On macOS that handle is never used: `open_pristine_epic_login_window` never
  registers the window with Tauri, so `app.get_webview_window(label)` is None for any label,
  and both cookie arms therefore take their `existing_window.is_none() && epic_cookie_domain_matches`
  fallback, which operates directly on `WKWebsiteDataStore::defaultDataStore()` and is
  documented in main.rs as "deliberately label-independent".

  The navigation, however, is real network traffic. Epic and Cloudflare set fresh cookies on
  it — `__cf_bm`, `EPIC_DEVICE`, `EPIC_LOGIN_ID`, `_epicSID`, `_tald` — while the clear loop
  is still running and for a further ~1-2 seconds after its last census. `clearEpicStorage`
  then opens a SECOND live window at the same URL and runs AFTER the cookie step, so its own
  residue is never cleared at all.

  The census was therefore telling the truth about the instant it measured and nothing about
  the instant after. `matched=0` was correct; the jar was repopulated by the app itself
  moments later. Neither rival hypothesis was right: the store is shared (falsified
  numerically — 56 jar records minus 2 expired equals the census's own 54), and the delete
  genuinely deletes (the jar total falls monotonically 57->54->54->53->52->51 across the
  sweep). The source comment on EPIC_LOGIN_ORIGIN encoded the false premise directly:
  "no navigation/login flow ever runs against this url".

fix: |
  Three changes in src/backend/storeManagers/legendary/user.ts, each aimed at the
  mechanism rather than the report.

  1. The cookie step no longer opens a window at Epic. On macOS it opens NO window
     at all — it passes `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`, a label that cannot
     resolve, which is exactly the precondition both Rust cookie arms require
     (`existing_window.is_none() && epic_cookie_domain_matches`) to take their
     `WKWebsiteDataStore::defaultDataStore()` path. That is the same Rust code every
     previous live run already executed, since the pristine Epic webview was never
     Tauri-registered; the only thing removed is the live page load. Off macOS a real
     window is still required (the fallback is `#[cfg(target_os = "macos")]`), so one
     is still opened — but at `https://gamelib.invalid/`, an RFC 2606 reserved host
     that cannot resolve, instead of Epic's login page.
  2. `clearEpicStorage` now runs BEFORE `clearEpicCookies`. The storage step has no
     choice but to load a real document from Epic's origin, so it will always mint
     cookies; running the cookie sweep after it is what removes them. The previous
     order meant nothing ever swept up behind the storage window.
  3. A final post-clear verification census over all five Epic hosts, taken after
     every mutation in the step, decides the reported outcome. A residual throws, and
     `clearEpicCookies` is `FATAL_WIPE_STEP`. This is REQ-35-07's literal contract;
     the per-host before/after pair could not satisfy it because both members are
     taken mid-sweep.

  Tests updated to the corrected contract and RED-proven against three separate
  mutations (each reintroducing one half of the defect): removing the verification
  throw fails 2 tests, restoring the Epic-pointed window fails 6, restoring the step
  order fails 1. All 50 pass when restored.

verification: |
  UNIT: 50/50 across epicCookieCensus.test.ts (16), epicLogoutDomains.test.ts (20),
  user.test.ts (14). tsc --noEmit exit 0. eslint exit 0 (warnings only, pre-existing
  shape). All three mutations RED-proven — see fix above.

  BUNDLE: the running dev bundle build/main/sidecar.js was checked directly, not
  assumed — `epic-cookie-clear-no-window` x1, `gamelib.invalid` x1, `post-clear
  verification` x2, and the wipeSteps registration has clearEpicStorage (offset
  911042) before clearEpicCookies (911624).

  LIVE: PASS (2026-08-31 21:03, dev build pid 85098). Operator logged in to Epic then
  out. The product reported `post-clear verification — 0 Epic-owned cookie(s) remain`;
  an independent index-walking parse of the same jar found 0 Epic-owned live records,
  0 by name-substring, and 0 raw byte occurrences of any Epic cookie name. The reported
  state MATCHES the parse — the definition of done.

  All four arithmetic reconciliations that the pre-fix run failed now hold: jar total
  59->51 = 8 = reported cleared 8; per-host deltas sum to 8; every per-host delta
  matches its own census; and 51 live records - 0 expired = the census's after(total=51).

  Not vacuous: the BEFORE census measured matched=8 on epicgames.com (pre-fix baseline
  was 3), and all 8 were removed. No collateral damage — 0 non-Epic records lost;
  Humble/GOG/Amazon sessions intact.

  ZERO `__cf_bm` in the post-logout jar. That cookie carries a 30-minute Cloudflare TTL
  and only a live HTTPS round trip can mint one; two were minted on the clear's own
  seconds pre-fix. Its absence is the positive evidence that the re-seeding page load
  is gone rather than merely out-run.

  NOT exercised by this run: D-35-19-15's sibling-domain sub-criterion. All four of
  fortnite/unrealengine/twinmotion/metahuman reported before(matched=0), so no
  non-primary Epic domain cookie was present to clear. See the Resolution's residuals.

files_changed:
  - src/backend/storeManagers/legendary/user.ts
  - src/backend/storeManagers/legendary/__tests__/epicCookieCensus.test.ts
  - src/backend/storeManagers/legendary/__tests__/epicLogoutDomains.test.ts
  - src/backend/storeManagers/legendary/__tests__/user.test.ts
