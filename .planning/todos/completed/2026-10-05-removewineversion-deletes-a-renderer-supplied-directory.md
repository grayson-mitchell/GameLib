---
created: 2026-10-05T00:00:00.000Z
title: "removeWineVersion recursively deletes a renderer-supplied installDir with no containment check"
area: security
severity: medium
platform: any
ready: code
found_by: "Code review of phase 34.5 (non-Steam runners, Wine and shortcuts), 2026-10-05"
files:
  - src/backend/sidecar/wineToolsFlowRegistration.ts:216-226
  - src/backend/wine/manager/utils.ts:354-356
---

## Problem

`rmSync(release.installDir, { recursive: true })` runs on a path taken from the renderer payload.
Phase 34.6 hardened `importGame`, `moveInstall` and `runWineCommandForGame` against tampered renderer
paths; this channel was missed.

## Failure scenario

A compromised or buggy renderer deletes any directory the user owns.

## Suggested fix

Look the release up by `version` in `wineDownloaderInfoStore` and use the stored `installDir`, or
apply `assertContainedPath` against the Wine tools root.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Reproduced.** `wine/manager/utils.ts`'s `removeWineVersion` ran
`rmSync(release.installDir, { recursive: true })` on the `installDir` of the renderer-supplied
`WineVersionInfo`, and it did so before it looked the version up in `wineDownloaderInfoStore`, so a
version absent from the store still had its directory removed. Both the sidecar's
`removeWineVersion` channel and the Electron `wine/manager/ipc_handler.ts` route through this one
function, so the fix lives here rather than in the registration module.

**Change.** `removeWineVersion` now looks the release up by `version` first. Unknown version: log,
return `false`, delete nothing. Known version: remove only the stored entry's `installDir`. The
`wineVersionUninstalled` event now carries a copy of the stored entry, not the renderer object, so
the DXMT listener's `${installDir}-DXMT` removal (`tools/dxmt.ts:67-71`) no longer takes the
renderer's path either. That second path had the same defect and was not named in this todo.

**RED.** New suite `src/backend/wine/manager/__tests__/removeWineVersion.test.ts`, run against the
unchanged product code: 2 of 3 failed. With `ignores a tampered installDir...` and
`removes nothing when the version is not in the store`, `existsSync(victimDir)` expected `true` but
received `false`: the renderer-named directory was deleted. The third test, the legitimate removal,
passed.

**GREEN.** That suite passes 3/3, and `wineToolsFlows.test.ts` passes too (29/29 across the two).
`pnpm codecheck` exits 0. `npx eslint` on both files: 0 errors. It shows 1 warning,
`require-await` on `removeWineVersion`, which the original function also had. `npx prettier --check`
passes on both files.

**Not verified.** There was no live app run. The wine-manager UI flow (WineItem "remove") was not
exercised end to end.
