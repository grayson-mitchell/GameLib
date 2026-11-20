---
quick_id: 260902-8i2
status: complete
date: 2026-09-02
commits:
  - 1e4720c08 docs(quick-260902-8i2): close the webview data-store audit with its evidence
  - 254898fa7 docs(quick-260902-8i2): file the GOG/nile/Zoom logout cookie-jar gap
source_files_changed: 0
---

# Quick Task 260902-8i2 — Summary

Audited `.planning/todos/pending/audit-login-webview-store-browser-data-store-sharing.md` and
closed it. The audit answered both of its questions and found one new defect.

## Q1 — one shared `WKWebsiteDataStore`? **YES**

Demonstrated two independent ways:

- **Code.** The pristine Epic login window builds `WKWebViewConfiguration::new(mtm)` with no
  `websiteDataStore` override (`src-tauri/src/main.rs:3021`; the doc comment at `:3753-3756`
  states it outright). Zero `incognito` / private-store / custom `data_directory` settings exist
  on any window builder in `main.rs`, so no surface opts out.
- **Live.** An index-walking binarycookies parse of both jars shows four runners' login sessions
  and the main window's ordinary web traffic sharing one file per build: dev jar 51 live records
  (`login.gog.com`, `gog.com`, `amazon.com`, `humblebundle.com`, plus applegamingwiki / metacritic
  / youtube / codeweavers / rtb.mx), packaged jar 24 (`epicgames.com/_epicSID`, humblebundle.com).

The store-browser half of the question stays moot — no embedded browser exists
(`WebView/index.tsx:528`, D-05). But the shared store means **upstream defect #1 is structurally
absent** when the browser returns, unless it opts into a custom store. GameLib's exposure is the
mirror image of Heroic's: not partitions splitting apart, but everything sharing one jar whether
or not that was intended.

## Q2 — does logout clear it? **Epic and Humble yes; GOG and Amazon no**

Exactly six non-test `.clearCookies(` / `.clearStorage(` call sites exist repo-wide, all in
`humble/user.ts` and `legendary/user.ts`. `GOGUser.logout()` and `NileUser.logout()` clear only
`configStore`, `clearCache()` and on-disk tokens; both open real login webviews into the shared
store via `oauthLoginCapture.ts`, and their session cookies are in the dev jar now.

This is upstream `68eb1adde`'s defect #2 — the thing the todo was filed to look for — present for
three of five login surfaces. **It was invisible to every prior investigation because all of them
scoped to Epic** (`D-35-29-01`, `D-35-29-02`, `35-AB-RETEST`, the `epic-cookie-clear-read-divergence`
debug session). Filed as
`.planning/todos/pending/2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar.md`.

The todo's own 2026-08-31 answer 3 ("PARTIALLY — cookies not entirely") is marked **superseded in
place, not deleted**: `D-35-29-02` was resolved and live-verified at 21:03 that night, so the
answer is now wrong while remaining the record of what was believed.

## Correction, hours after filing — Zoom was wrong

The first version of this task named **three** runners. Zoom is a non-finding:
`authZoom`/`getZoomUserInfo`/`logoutZoom` have preload invokers but **zero** backend
registrations (against 1-2 each for the GOG/Amazon/Epic equivalents), dropped permanently by
Phase 34.5 D-02 — recorded at `runnerMiscFlowRegistration.ts:25` and `STATE.md:2711`, neither of
which the filing checked. `ZoomUser.logout()` is real code nothing under Tauri can reach, so Zoom
cannot deposit the cookies at issue. The runner itself is otherwise live (1564 LOC, registered in
`storeManagers/index.ts:19`, gated on `experimentalFeatures.zoomPlatform`); it is the auth
channels specifically that are gone, and the defect becomes real if they are ever ported.

The GOG and Amazon findings are unaffected — both have live auth and logout channels.

**This is the task's own lesson recurring inside the task.** It was filed on the premise that a
call-site census beats going deep on one instance; the census then counted a call site that no
caller can reach. **Reachability is part of the census, not a follow-up to it** — a `logout()` that
exists and a `logout()` that runs are different facts, and only the second one can hold a defect.

## What was deliberately not done

- **No fix.** Three runners × a security-relevant behaviour change is phase work, and any fix must
  carry four constraints from `D-35-29-02` or recreate it verbatim (no live-origin window on macOS
  for the cookie step; storage clears before cookies; a final census after the last mutation
  decides the outcome; do not over-clear — `amazon.com` is the user's shopping session too). All
  four are written into the new todo.
- **No severity assigned.** The established finding is that nothing clears these cookies. Whether
  that *matters* is untested — nobody has run log-out-then-log-back-in to see whether GOG re-auths
  silently. The new todo carries that gesture rather than a conclusion drawn without it.
- **Zero source files touched.**

## Method note worth keeping

The jar was read with a purpose-written index-walking parser (walks the file's own page/offset
index and filters by expiry), never `strings`. A byte match over a binary format can surface
unreferenced remnants as if they were live records — precisely the caveat that let `D-35-29-02`
stand undiagnosed across two runs.
