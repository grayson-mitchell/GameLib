---
created: 2026-10-05T00:00:00.000Z
title: "Security hardening minors: Zoom token written 0644, removeFolder joins unchecked names, csp null with withGlobalTauri"
area: security
severity: minor
platform: any
ready: code
found_by: "Security review of the webview / sidecar / Rust trust boundary, 2026-10-05"
files:
  - src/backend/storeManagers/zoom/user.ts:29
  - src/backend/utils.ts:1409-1428
  - src-tauri/tauri.conf.json
---

## Problem

1. `zoom/user.ts:29` writes `.zoom.token` with no mode (usually 0644); other secrets use the
   keyring or `fileStore.ts` at 0600.
2. `removeFolder` (`utils.ts:1409-1428`) builds `${path}/${folderName}` and `rmSync`s it
   recursively; nothing stops `..` or an empty `folderName`.
3. `tauri.conf.json` has `csp: null` with `withGlobalTauri: true`; any XSS in the main renderer
   reaches `sidecar_invoke`, which has no Rust-side channel allow-list. No live XSS sink was found
   (MessageBoxModal decodes via textarea, GameChangeLog uses sanitize-html).

## Failure scenario

1. Another local user can read the Zoom token. 2. A crafted folder name deletes outside the
intended directory. 3. Defence in depth only.

## Suggested fix

1. `{ mode: 0o600 }` or move to the keyring. 2. Apply `assertContainedPath` from
`rendererPathGuard.ts`. 3. Set a restrictive CSP (test the embeds and dev server).

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
