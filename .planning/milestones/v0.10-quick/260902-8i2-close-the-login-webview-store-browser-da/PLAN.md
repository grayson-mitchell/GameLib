---
quick_id: 260902-8i2
slug: close-the-login-webview-store-browser-da
created: 2026-09-02
description: Close the login-webview/store-browser data-store audit todo with evidence, and file the GOG/nile/Zoom logout cookie gap it found
mode: quick (no research, no plan-check, no verifier)
---

# Quick Task 260902-8i2

## Scope

`.planning/todos/pending/audit-login-webview-store-browser-data-store-sharing.md` asked two
questions. Both are now answered with evidence. This task records the answers and files the one
new defect the audit surfaced. **Documentation only — no source change.** The fix the audit
implies is deliberately NOT bundled: it is a security-relevant behaviour change across three
runners and it must carry the D-35-29-02 ordering constraints, which is more than a quick task.

## Evidence gathered (2026-09-02)

### Q1 — one shared data store? YES, and the store-browser half stays moot

- No embedded store/wiki browser exists under Tauri. `src/frontend/screens/WebView/index.tsx:528`
  returns `WebviewUnavailablePanel`, whose only escape is `window.api.openExternalUrl` (D-05).
  So there is still no in-app store webview whose store could diverge. Unchanged since the
  todo's 2026-08-31 partial answer.
- The store itself is provably shared, by code AND by a live read:
  - the pristine Epic login window builds `WKWebViewConfiguration::new(mtm)` with **no**
    `websiteDataStore` override (`src-tauri/src/main.rs:3021`, stated outright at `:3753-3756`);
  - **zero** occurrences of `incognito` / private-store / custom `data_directory` on any window
    builder in `src-tauri/src/main.rs`;
  - an index-walking binarycookies parse of both live jars shows every surface's cookies sharing
    one file per build (see table below).
- Consequence worth recording: when the embedded browser returns it will land in this same
  default store **by default**, so upstream defect #1 (login not carrying into store pages) is
  structurally absent here unless the returning browser opts into a custom store.

Live jars, parsed by index walk (never `strings`), 2026-09-02:

| jar | live records | notable |
|---|---|---|
| `com.gamelib.shell.binarycookies` (packaged) | 24 | `epicgames.com/_epicSID`, 22 × humblebundle.com |
| `gamelib-shell.binarycookies` (dev) | 51 | `login.gog.com` `galaxy-login-al/-s/-tsa`, `gog.com` `gog-al`, `amazon.com` `session-token`/`session-id`/`ubid-main`, `humblebundle.com` `_simpleauth_sess`, plus applegamingwiki/metacritic/youtube/codeweavers/rtb.mx |

### Q2 — does logout clear it? Epic and Humble YES; GOG, Amazon and Zoom NO

- **Epic: resolved.** D-35-29-02 is RESOLVED, live-verified PASS 2026-08-31 21:03. The todo's own
  answer #3 ("PARTIALLY — cookies not entirely") is **stale** and must be superseded, not repeated.
- **Repo-wide there are exactly six non-test `.clearCookies(` / `.clearStorage(` call sites**, all
  in two files: `src/backend/humble/user.ts` (`:1011`, `:1127`, `:1212`) and
  `src/backend/storeManagers/legendary/user.ts` (`:199`, `:259`, `:408`).
- `GOGUser.logout()` (`src/backend/storeManagers/gog/user.ts:263`), `NileUser.logout()`
  (`src/backend/storeManagers/nile/user.ts:171`) and `ZoomUser.logout()`
  (`src/backend/storeManagers/zoom/user.ts:90`) clear only `configStore`, `clearCache()` and
  on-disk token files. None touches the cookie jar.
- All three nevertheless open a real login webview into that shared store:
  `src/backend/sidecar/oauthLoginCapture.ts` covers `legendary`/`gog`/`nile`/`zoom` and calls
  `seam.open(loginUrl, { visible: true, ... })` at `:323`.
- Live corroboration: GOG and Amazon session cookies are in the dev jar right now.

**Untested consequence, stated as a prediction and NOT as a finding:** the surviving
`galaxy-login-*` / Amazon `session-token` records could let a later login silently re-auth with no
credential prompt (upstream defect #2's actual harm). Nobody has run that gesture. The new todo
must carry the test, not the conclusion.

## Tasks

1. **Supersede the audit todo and complete it.** Rewrite its status to RESOLVED, append a closure
   record carrying the evidence above, explicitly mark the 2026-08-31 "PARTIALLY" answer as
   superseded, and `git mv` it to `.planning/todos/completed/`. Commit.
2. **File the new gap** as `.planning/todos/pending/2026-09-02-gog-nile-zoom-logout-never-clear-the-shared-cookie-jar.md`,
   carrying the call-site evidence, the untested-consequence caveat, and the two D-35-29-02
   ordering constraints any fix must honour. Commit.
3. **Record the task**: SUMMARY.md + STATE.md "Quick Tasks Completed" row. Commit.

## Success criteria

- The audit todo is in `completed/` with `status: RESOLVED` and answers to BOTH questions.
- The stale "PARTIALLY" answer is marked superseded in place, not deleted (it is the record of
  what was believed).
- A pending todo exists for the GOG/nile/Zoom gap, naming all three `logout()` sites.
- No source file is modified.
