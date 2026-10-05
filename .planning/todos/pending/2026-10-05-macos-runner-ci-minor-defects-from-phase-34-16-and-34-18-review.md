---
created: 2026-10-05T00:00:00.000Z
title: "macOS runner CI minor defects: post-publish checksum \"verification\", README disclosure test scope, weak x64 literal test, stale Intel/x64 text"
area: ci
severity: minor
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.18"
files:
  - .github/workflows/build-runners-onedir-macos.yml
  - meta/__tests__/readmeDisclosure.test.ts:30
  - meta/__tests__/downloadHelperBinaries.test.ts:570-577
  - src/frontend/screens/WineManager/index.tsx:129
  - src/frontend/screens/WineManager/index.tsx:139
  - public/locales/en/translation.json:1323-1325
  - .github/workflows/release-tauri.yml:1
  - meta/verifyRunnerBundle.ts:35
  - meta/verifyRunnerBundle.ts:376-378
  - meta/verifyRunnerBundle.ts:798
---

## Problem

1. **Checksum step can't catch anything**: "Print SHA256SUMS verification output" checks archives
   against a SHA256SUMS computed from those same archives, and runs after publishing.
2. **README disclosure test is whole-file** (`readmeDisclosure.test.ts:30`): its header says the
   sentence must sit inside `## Supported Operating Systems`, but it `toContain`s the whole README.
   Correctly placed today (`README.md:77`).
3. **Weak "no literal remains" test** (`downloadHelperBinaries.test.ts:570-577`): only rejects
   `${runner}_macOS_x86_64'` with a trailing single quote; double-quoted or template spellings pass.
4. **Stale Intel/x64 text**: WineManager copy and `translation.json:1323,1325` still call
   Wine-Crossover / Wine-Staging-macOS "recommended for Intel Macs" in an app that no longer supports
   Intel Macs; `release-tauri.yml:1` header says "macOS (arm64 & x64)"; `verifyRunnerBundle.ts:35,798`
   usage text offers `--arch=<x64|arm64>`; `:376-378` comment cites the Electron
   `app.asar.unpacked` path (behaviour unaffected — the lookup searches the tree).

## Failure scenario

Gates that look like assurance but can't fail, and user-facing copy that contradicts the app's
stated platform support.

## Suggested fix

1. Move the check before the upload, or relabel it log-only.
2. Slice the section out first, then assert.
3. Match the bare `_macOS_x86_64` token regardless of quoting.
4. Update the copy (new keys, per i18n practice), header, usage text and comment.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
