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
