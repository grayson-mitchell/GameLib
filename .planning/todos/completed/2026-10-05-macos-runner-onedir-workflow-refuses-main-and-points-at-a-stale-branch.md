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

## Resolution (2026-10-05)

Verified first on this checkout (`5927806`): `meta/buildRunnersOnedir.ts` exists on main and
`package.json:70` defines `build-runners-onedir`, so the guard's premise was stale and the defect
reproduced as described.

**What changed.**

- `.github/workflows/build-runners-onedir-macos.yml`: the "Refuse to run from the default branch"
  step is replaced by "Refuse to run from a ref without the onedir build script". It stays
  prepare-release's first step (so it still dies before `gh release create` and before any macOS
  runner starts), and prepare-release still has no checkout: it reads
  `meta/buildRunnersOnedir.ts` and `package.json` through `gh api repos/$GH_REPO/contents/...?ref=$SHA`,
  pinned to `github.sha`, and fails with `::error::` + `exit 1` if either is absent (or unreadable),
  or if `GH_REPO`/`SHA` resolve empty. The guard was kept rather than removed because a missing
  script would otherwise fail only after the release was created and a macOS runner had set up.
  No branch name appears anywhere in the file now.
- `meta/pinRunnerDigests.ts`: `warnOnTagDrift` → `assertNoTagDrift`. Any manifest tag that
  disagrees with live `RELEASE_TAGS` now throws (listing every drifted runner, both values and the
  run id) before the single `writeFile`, so nothing is written and the existing CLI entrypoint
  exits 1. Also null-safe on a `null` manifest entry.
- `meta/downloadHelperBinaries.ts` sentinel message: now says to dispatch from the ref whose
  `meta/releaseTags.ts` you intend to ship (normally main) and pin from that same ref.
- Tests: `runnersOnedirWorkflow.test.ts` drops `REQUIRED_REF` and the default-branch assertions;
  the new guard is **executed** against a stubbed `gh` serving a synthetic tree (passes with both
  present, passes against this checkout, fails on missing file / missing script / empty sha, and
  the stub rejects any ref other than the dispatched sha), plus env-not-interpolation and a raw-file
  check that neither `default_branch` nor the old branch name survives, comments included.
  `pinRunnerDigests.test.ts`'s "drift (non-fatal)" case became "drift (fatal)" (throws, writes
  nothing; and names every drifted runner). `downloadHelperBinaries.test.ts`'s sentinel case now
  asserts the message names the workflow and `meta/releaseTags.ts`.

**RED** (tests written first, product code unchanged): the three suites ran 14 failed / 105 passed —
every new guard test (9), both drift tests, the sentinel-message test, the concurrency test from
the sibling todo, and one environmental failure (below).

**GREEN**: 118 passed / 1 failed across the three suites; `pnpm codecheck` exit 0; `npx eslint`
on the five touched TS files 0 errors (11 pre-existing warnings, none on touched lines);
`npx prettier --check` over the workflow YAML (`--file-info`: `"ignored": false`, parser `yaml`) and
the five TS files passes; `fakeHomeIsolation.test.ts` 7/7.

The one remaining failure, `the real committed public/bin/.release_tags still parses...`, is
environmental and pre-existing: `public/bin/.release_tags` is produced by
`pnpm download-helper-binaries` and is absent from a fresh worktree (ENOENT); it fails identically
before and after this change.

**NOT verified.** The workflow itself was not dispatched — that needs a macOS runner and the
operator. In particular the real `gh api` behaviour (exit status on a 404 with `--silent`, and the
`application/vnd.github.raw+json` Accept header returning raw `package.json`) is modelled by the
stub, not observed live. `pnpm pin:runner-digests` was not run against the live release.
