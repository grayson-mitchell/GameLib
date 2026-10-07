---
created: 2026-10-05T00:00:00.000Z
title: "build-runners-onedir-macos has no concurrency group — overlapping dispatches can publish archives and checksums from different runs"
area: ci
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.16"
files:
  - .github/workflows/build-runners-onedir-macos.yml:33-37
---

## Problem

There is no `concurrency:` key. The comment at `:33-37` says the separate release-creation job guards
against overlapping dispatches; it only makes the create step idempotent. Two runs can interleave
their `gh release upload --clobber` calls.

## Failure scenario

Run A uploads its tarballs, then run B overwrites `SHA256SUMS-arm64` and `BUILD-MANIFEST-arm64.json`.
The pin tool reads B's digests and run id while the release holds A's archives; every
`download-helper-binaries` then fails with a sha256 mismatch.

## Suggested fix

Add `concurrency: { group: runners-onedir-macos, cancel-in-progress: false }` at workflow level and
correct the comment.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

Mechanism confirmed before fixing: the workflow had no `concurrency:` key at any level, and the
only cross-run protection was `gh release view || gh release create`, which makes creation
idempotent but does nothing for the fixed-name `gh release upload --clobber` calls in the build
leg. Two overlapping dispatches could interleave those uploads exactly as described.

**What changed.**

- `.github/workflows/build-runners-onedir-macos.yml`: workflow-level
  `concurrency: { group: runners-onedir-macos, cancel-in-progress: false }`, with a comment saying
  why it is workflow-level (serialises the whole prepare-release -> build chain) and why it queues
  rather than cancels (never kills an in-flight upload half-way). The prepare-release comment that
  claimed the job isolation guarded against overlapping dispatches now says it only makes the create
  step idempotent and points at the concurrency group.
- `src/backend/__tests__/runnersOnedirWorkflow.test.ts`: a parsed-YAML test pins the top-level
  `concurrency` to exactly `{ group: 'runners-onedir-macos', 'cancel-in-progress': false }`.

**RED**: with the test in place and the workflow at the sibling fix's commit (no concurrency key),
the suite ran 1 failed / 44 passed — `Expected: {"cancel-in-progress": false, "group":
"runners-onedir-macos"}`, `Received: undefined`.

**GREEN**: 45/45 in the suite; `npx prettier --check` over the workflow YAML (`--file-info`:
`"ignored": false`, parser `yaml`) and the test passes; `npx eslint` on the test clean.

**NOT verified.** The workflow itself was not dispatched — that needs a macOS runner and the
operator — so GitHub's actual queueing of a second dispatch behind a running one is not observed.
Note GitHub keeps at most one *pending* run per concurrency group: a third dispatch made while one
run is in progress and another is queued replaces the queued one (it is cancelled, not run).
