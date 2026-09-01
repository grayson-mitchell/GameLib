---
created: 2026-08-15T08:50:00.000Z
title: "Audit: do the login webview and store browser share one data store, and does logout clear it?"
area: auth/webview
needs: audit-then-maybe-fix
status: RESOLVED
severity: none (audit; the defect it found is filed separately)
upstream:
  - 68eb1adde (Heroic v2.22.1 — Unify webview session partitions so login credentials carry over to stores, #5752) — CONCEPT ONLY, code is not portable
files:
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
  - src/frontend/screens/WebView/index.tsx
---

## Problem

Upstream `68eb1adde` fixed two defects in Heroic's webview session handling:

1. **Login credentials did not carry from the login webview into the store pages**, because the
   two used different Electron session partitions (`persist:epicstore` vs `persist:epic`).
2. **Logout did not clear the store's session** — no `clearStorageData()`, `clearCache()`, or
   `clearAuthCache()`.

The upstream **code is not portable** — it is Electron `session.fromPartition()`, and GameLib's
surface is WKWebView/wry. But the **bug class is one GameLib plausibly has**, because GameLib
likewise runs a separate login window *and* an embedded in-app store browser, so the same split
between "where you logged in" and "where the session is read" exists.

Two existing open items point the same direction:
- the **"Epic logout unobserved"** carry-forward from Phase 34.5, and
- the known **"wry cookie delete lies about deleting"** gotcha — `.cookies()` deletion silently
  no-ops; the working path is `WKWebsiteDataStore.removeData(for:)`.

## Solution

This is an **audit**, and may or may not produce a fix. Two questions to answer with evidence,
not by reading intent:

1. Do the login webview and the embedded store browser resolve to **one shared
   `WKWebsiteDataStore`**, or separate ones? If separate, a completed login won't be visible to
   the store browser.
2. Does logout actually call `WKWebsiteDataStore.removeData(for:)` for the right data types and
   domains — and is that **observed**, not just reported? Per the standing lesson, never accept a
   mutating call's own success report as proof of effect; verify by re-reading the store.

Read `git show 68eb1adde` first for the shape of the upstream bug (Heroic upstream is git remote
`origin`), then test GameLib's own surface directly.

If the audit finds the surfaces are already unified and logout genuinely clears, close this with
the evidence recorded — a negative result is worth writing down, since this question keeps
resurfacing.

## PARTIAL ANSWERS from the Phase 35 live-gate re-run, 2026-08-31 (plan 35-29, criterion 21)

> **SUPERSEDED 2026-09-02 by the closure record at the bottom of this file.** Answer 3 below
> ("PARTIALLY — cookies not entirely") was true when written and is now WRONG: its cause was
> found and fixed on 2026-08-31 21:03. Answers 1, 2 and 4 still hold. Kept unaltered because it
> is the record of what was believed, not because it is current.

Measured while running criterion 21. These do not close this audit, but they remove guesswork from
parts of it.

1. **The store-browser half of the question is currently MOOT.** The Tauri build embeds no browser
   view for store/wiki pages at all (`WebviewUnavailablePanel.tsx:43`); it offers only a
   system-browser handoff. So there is no in-app store webview whose data store could be shared or
   not shared. This question becomes live again only when the embedded browser returns.

2. **The jar that logout clears is bundle-id keyed:**
   `~/Library/HTTPStorages/com.gamelib.shell.binarycookies`. Confirmed live — it was written by the
   running packaged instance, while the process-name-keyed `gamelib-shell.binarycookies` stayed
   stale. Note this holds even when the binary is launched directly from a terminal rather than via
   `open`, because the executable sits inside the `.app` and `CFBundleIdentifier` still resolves.

3. **"Does logout clear it?" — PARTIALLY. Authentication yes, cookies not entirely.** After Epic
   logout, credentials WERE required again (no silent re-auth), but an independent read of that jar
   still showed `_epicSID`, `_tald`, `EPIC_DEVICE`, `EPIC_LOGIN_ID` on `epicgames.com` hosts. Cause
   not established. Filed as `D-35-29-02` in
   `.planning/phases/35-electron-cutover-remove-the-electron-build/deferred-items.md`.

4. **The in-product probe that would answer this properly is currently inert.** The Epic cookie
   census cannot read the jar during logout — it requires a login window and logout has none
   (`D-35-29-01`). Fixing that is a prerequisite for auditing this cleanly from inside the product;
   until then, use the on-disk jar read.

---

## CLOSURE RECORD — audited 2026-09-02, quick task `260902-8i2`

Both questions answered with evidence. **This audit produced no fix of its own**; it produced one
new defect, filed separately as
`.planning/todos/pending/2026-09-02-gog-and-amazon-logout-never-clear-the-shared-cookie-jar.md`.

### Q1 — "one shared `WKWebsiteDataStore`, or separate ones?" → **ONE. Shared.**

The store-browser half stays MOOT for the same reason as 2026-08-31: `WebView/index.tsx:528`
still returns `WebviewUnavailablePanel`, so no in-app store webview exists to diverge (D-05).
But the underlying question was answered anyway, positively, and for a wider set of surfaces
than the todo asked about:

- **Code.** The pristine Epic login window builds `WKWebViewConfiguration::new(mtm)` with **no
  `websiteDataStore` override** (`src-tauri/src/main.rs:3021`; stated outright in the doc comment
  at `:3753-3756` — "its cookies live in the SAME process-wide
  `WKWebsiteDataStore::defaultDataStore()` every Tauri-managed window already shares"). There are
  **zero** `incognito` / private-store / custom `data_directory` settings on any window builder in
  `main.rs`, so no surface opts out.
- **Live.** An index-walking binarycookies parse (never `strings` — see
  [[wry-cookie-delete-lies-about-deleting]]'s sibling lesson on remnants) of both jars on
  2026-09-02 shows every surface's cookies sharing **one file per build**:

  | jar | live records | contents |
  |---|---|---|
  | `com.gamelib.shell.binarycookies` (packaged) | 24 | `epicgames.com/_epicSID`, 22 × humblebundle.com, `api.hcaptcha.com/hmt_id` |
  | `gamelib-shell.binarycookies` (dev) | 51 | `login.gog.com` (`galaxy-login-al/-s/-tsa`), `gog.com` (`gog-al`), `amazon.com` (`session-token`, `session-id`, `ubid-main`, `sst-main`), `humblebundle.com` (`_simpleauth_sess`), **plus** applegamingwiki / metacritic / youtube / codeweavers / rtb.mx from non-login traffic |

  Four runners' login sessions and the main window's ordinary web traffic coexist in one jar.
  That is the shared store, demonstrated rather than inferred.

**Forward-looking consequence, worth keeping when the embedded browser returns:** it will land in
this same default store *by default*. Upstream defect #1 (login not carrying into store pages) is
therefore **structurally absent** in GameLib — unless whoever builds the browser deliberately opts
into a custom store. The risk here is the mirror image of Heroic's: not partition splitting, but
that everything shares one jar whether or not that was intended.

### Q2 — "does logout actually clear it, observed not reported?" → **Epic and Humble yes; GOG and Amazon NO.**

- **Epic: YES — answer 3 above is superseded.** `D-35-29-02` is **RESOLVED**, live-verified PASS
  2026-08-31 21:03 (debug session `epic-cookie-clear-read-divergence`). The four "surviving"
  cookies never survived a clear — the logout's own hidden webview on Epic's live login page
  re-created them. Post-fix: product reports 0 Epic-owned cookies remaining, and an independent
  parse of the same jar agrees (0 by domain, 0 by name, 0 raw byte occurrences, 0 `__cf_bm`).
  That is the "observed, not reported" standard this todo demanded, met.
- **Humble: YES** — `seam.clearCookies` + `seam.clearStorage` at `src/backend/humble/user.ts:1127`
  and `:1212`.
- **GOG, Amazon (nile): NO.** Repo-wide there are exactly **six** non-test
  `.clearCookies(` / `.clearStorage(` call sites and all six are in those two files
  (`humble/user.ts:1011,1127,1212`; `legendary/user.ts:199,259,408`). `GOGUser.logout()`
  (`gog/user.ts:263`) and `NileUser.logout()` (`nile/user.ts:171`) clear `configStore`,
  `clearCache()` and on-disk token files only — nothing reaches the cookie jar. Both nonetheless
  open a real login webview into it
  (`sidecar/oauthLoginCapture.ts` covers `legendary`/`gog`/`nile`/`zoom`, `seam.open(...)` at
  `:323`), and their session cookies are in the dev jar right now.

This is upstream defect #2 — the half of `68eb1adde` this todo was filed to look for — present in
GameLib for two of its live login surfaces. It was invisible to every prior investigation because
all of them scoped to Epic.

**Correction, same day.** This record first named THREE runners, adding Zoom. Zoom's
`ZoomUser.logout()` (`zoom/user.ts:90`) is the same shape and clears no cookies either, but it is
**unreachable**: `authZoom`/`getZoomUserInfo`/`logoutZoom` have preload invokers and **zero**
backend registrations, dropped permanently by Phase 34.5 D-02 — already recorded at
`STATE.md:2711` and at `runnerMiscFlowRegistration.ts:25`. Zoom cannot log in under Tauri, so it
cannot deposit the cookies at issue. Demoted to a documented non-finding in the new todo, which
notes it becomes real the moment those three channels are ported. The lesson this audit is about
bit the audit itself: **reachability is part of a call-site census, not a follow-up to it.**

**What is NOT established:** whether the surviving `galaxy-login-*` / Amazon `session-token`
records actually permit a silent re-auth with no credential prompt. Nobody has run that gesture.
The harm is plausible and untested; severity lives in the new todo, which carries the test rather
than the conclusion.

### Why the fix is not in this task

Any fix must honour two constraints the Epic work paid for, or it recreates `D-35-29-02`:
(1) on macOS open **no** live-origin window for the cookie step — pass a label that cannot resolve,
which is the Rust fallback's own precondition; (2) run storage clearing **before** cookie clearing,
because storage clearing must load the origin and will therefore mint cookies. Plus a final
post-clear census after the last mutation decides the outcome. Three runners × that contract is
phase work, not a quick task.
