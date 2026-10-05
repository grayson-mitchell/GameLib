---
created: 2026-10-05T00:00:00.000Z
title: "build-runners-onedir-macos refuses to run from main and redirects to a branch 1,510 commits behind — runner builds drift from RELEASE_TAGS"
area: ci
severity: major
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.16"
files:
  - .github/workflows/build-runners-onedir-macos.yml:51-66
  - src/backend/__tests__/runnersOnedirWorkflow.test.ts:353-377
  - meta/pinRunnerDigests.ts:180-200
  - meta/downloadHelperBinaries.ts:254-257
---

## Problem

The "Refuse to run from the default branch" step says `main` lacks `meta/buildRunnersOnedir.ts` and the
`build-runners-onedir` script. Both now exist on `main`. The step still refuses `main` and tells the
operator to re-dispatch with `--ref fix/steam-native-install-stability`, which the review measured
via `gh api compare` as ahead 13 / behind 1510 / diverged. The test pins this as `REQUIRED_REF`.

`pnpm pin:runner-digests`'s tag-drift check (`pinRunnerDigests.ts:180-200`) only `console.warn`s
and carries on.

## Failure scenario

Someone bumps `RELEASE_TAGS` in `meta/releaseTags.ts` on `main`. Dispatch on `main` is refused;
dispatch on the stale branch builds the OLD runner versions and publishes them; the pin tool pins
those archives with only a warning. Shipped macOS runners silently disagree with `RELEASE_TAGS`.

Also: `downloadHelperBinaries.ts:254-257`'s placeholder-digest error tells the operator to dispatch
"on the default branch", which the workflow refuses.

## Suggested fix

- Remove the guard, or make it check that the build script exists rather than comparing branch names.
- Make tag drift in the pin tool a hard failure.
- Update the test's `REQUIRED_REF` and the `downloadHelperBinaries.ts` message.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.
