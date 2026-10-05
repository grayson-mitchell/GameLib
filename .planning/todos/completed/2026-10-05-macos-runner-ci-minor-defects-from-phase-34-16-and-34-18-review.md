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

## Resolution (2026-10-05)

All four items were checked against the code and reproduced, then fixed.

1. **Checksum step** (`build-runners-onedir-macos.yml`): moved before the
   `gh release upload` step and renamed `Check archives against this run's SHA256SUMS
   (self-consistency, pre-publish)`. The comment now says what it can catch (a missing, truncated or
   rewritten-after-digest archive) and that the independent check is the pinned digest
   `downloadHelperBinaries.ts` verifies at fetch time. It also `cat`s the SHA256SUMS file: the old
   step said it "surfaces the published digests", but `shasum -c` only prints `name: OK`.
2. **README disclosure test**: now slices out the `## Supported Operating Systems` section (heading
   to the next `## ` or EOF) and asserts against that section only.
3. **x64 literal test** (`downloadHelperBinaries.test.ts`): now matches the bare
   `${runner}_macOS_x86_64` token whatever the quoting, and `${runner}_macOS_arm64` unless it is
   followed by `_onedir`.
4. **Stale Intel/x64 text**: WineManager's Wine-Crossover and Wine-Staging-macOS explanations moved to
   new `gamelib:wineExplanation.*` keys with the "for Intel Macs" clause removed. The en entries
   came from `pnpm i18n`, and the gamelib presence baseline was regenerated
   (`LINT_TRANSLATIONS_WRITE_BASELINE=1`). The old `translation:wineExplanation.*` entries stay,
   because `keepRemoved: true`. Also changed: the `release-tauri.yml` line-1 header (now "macOS
   (Apple Silicon, arm64)"), the `verifyRunnerBundle.ts` usage text at both sites (`[--arch=arm64]`),
   and the comment on where the tree sits (now Tauri's `Contents/Resources/build/bin/arm64/darwin`,
   from `tauri.macos.conf.json`).

**RED.**
- Item 1: new `runnersOnedirWorkflow.test.ts` tests failed on the unfixed workflow. The check sat at
  step index 8, after the upload at index 7, and its name `Print SHA256SUMS verification output`
  matched `/verif/i`.
- Items 2 and 3, by mutating product files: the README sentence was moved out of its section to
  EOF, and `"legendary_macOS_x86_64"` was appended to `meta/downloadHelperBinaries.ts`. Both new
  tests failed, while the old assertions, evaluated against the same mutated text, still passed.
  Both mutations were reverted.
- Item 4: the new `WineManager/__tests__/wineExplanationCopy.test.ts` failed 3/3 before the copy
  change.

**GREEN.** These six suites pass under `--runInBand`: runnersOnedirWorkflow,
readmeDisclosure, downloadHelperBinaries, verifyRunnerBundle, releaseWorkflow and
wineExplanationCopy (256 tests). The other checks:
- `pnpm codecheck` exit 0.
- eslint: 0 errors. The two warnings in `downloadHelperBinaries.test.ts` are pre-existing and not in
  changed lines.
- prettier `--check`: clean on every touched path it sees.
- `pnpm i18n --fail-on-update` exit 0.
- `pnpm lint-translations`: 0 hard failures.

**Not verified.**
- The workflow change has not run on a real macOS runner. Only its YAML structure is tested.
- The WineManager copy was not checked in a running app.
- The usage-text, header and comment edits have no test of their own.
- The regenerated presence baseline also records the 7 `gamelib:box.protocol.launch.*` keys that
  were already on the branch without a baseline entry. Another branch that regenerates it will
  conflict, and the fix is to regenerate again after the merge.
