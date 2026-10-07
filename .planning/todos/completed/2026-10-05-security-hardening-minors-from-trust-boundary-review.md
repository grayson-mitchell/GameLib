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

## Resolution (2026-10-05)

Items 1 and 2 are fixed. Item 3 (CSP) is **not** done here and was split out to
`pending/2026-10-05-set-a-restrictive-csp-on-the-tauri-webview.md` (`ready: live-gate`): a CSP set
without a live run can break the renderer, the store embeds and the dev server, and nothing on the
desk can show it does not.

**1. Zoom token mode.** Confirmed: `writeFileSync(tokenPath, token, { encoding: 'utf-8' })`, no
mode. Now `{ encoding: 'utf-8', mode: 0o600 }` plus `chmodSync(tokenPath, 0o600)` — `mode` only
applies when the file is created, so a 0644 token left by an older build is tightened on the next
login. RED: new `storeManagers/zoom/__tests__/user.test.ts` (real file in a `mkdtemp` dir,
`constants` mocked) — both cases failed with mode 420 (0644) vs expected 384 (0600). GREEN: 2/2.

**2. `removeFolder` containment.** Confirmed: it `rmSync`'d `${path}/${folderName}` recursively
with no check, and both values arrive from the renderer via the `removeFolder` send channel
(`shellFilesFlowRegistration.ts:245`). It now resolves the target through
`assertContainedPath(root, folderName, 'removeFolder')` from `sidecar/rendererPathGuard.ts` and
additionally refuses an empty root/name or a name that resolves to the root itself (`.`), logging
a warning and deleting nothing. Both the `'default'` and explicit-path branches are guarded; the
existing `'` stripping is kept. RED: four new cases in `sidecar/__tests__/shellFilesFlows.test.ts`
(real directories under `tmpdir()`, sent through the sidecar channel) — `../sibling` deleted the
sibling, and `..`, `''` and `.` deleted the root (`..` its parent too); all 4 failed. GREEN: 4/4,
and the two existing removeFolder pins (array-shape delete, positional no-op) still pass;
`downloadqueue.test.ts` passes. The guard module's header and its test's header were updated to
list `removeFolder` as the second production call site.

Checks: touched jest suites pass (`--runInBand`); `pnpm codecheck` exit 0; eslint 0 errors and no
new warnings on touched files; prettier `--check` clean on every touched path prettier sees.

**Not verified:** no live app run; the 0600 tests skip on Windows (POSIX modes), and
`removeFolder` was not exercised on Windows paths beyond `assertContainedPath`'s own backslash
normalisation tests.
