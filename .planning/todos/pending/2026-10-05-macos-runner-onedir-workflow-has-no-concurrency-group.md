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
