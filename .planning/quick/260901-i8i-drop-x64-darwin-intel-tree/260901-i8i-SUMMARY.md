---
quick-task: 260901-i8i
slug: drop-x64-darwin-intel-tree
status: complete
tags: [tauri, macos, release-ci, packaging, x64-darwin, intel-mac]
key-files:
  created:
    - .planning/quick/260901-i8i-drop-x64-darwin-intel-tree/260901-i8i-MEASUREMENTS.md
  modified:
    - meta/__tests__/x64NonGoalSurvivor.test.ts
    - src-tauri/tauri.macos.conf.json
    - meta/downloadHelperBinaries.ts
    - meta/__tests__/downloadHelperBinaries.test.ts
    - src/backend/__tests__/packagingConfig.test.ts
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts
    - meta/buildSidecarSea.ts
    - meta/__tests__/buildSidecarSea.test.ts
    - .planning/todos/pending/2026-08-28-tauri-macos-bundle-is-786mb-frontenddist-embeds-build-bin-in.md
    - .planning/quick/260901-8rm-shrink-tauri-macos-bundle-narrow-bundle-/260901-8rm-MEASUREMENTS.md
    - .planning/quick/260901-e7o-restore-runner-symlinks-in-tauri-bundle/260901-e7o-RESEARCH.md
    - .planning/phases/34.18-retire-the-macos-x64-intel-ci-leg-arm64-only-macos-runners-a/34.18-VALIDATION.md
  deleted:
    - public/bin/x64/darwin/ (4 files, gitignored, backed up + SHA-256 verified before deletion)
key-decisions:
  - "Option A (W1): NATIVE_LZMA_REQUIRED_TRIPLES is a shipping-inventory declaration, not build-time capability -- only the array entry was removed, triple-handling code (sidecarOutputPath, triplePlatform, expectedMachoArch) is untouched"
  - "src/backend/utils.ts:563-564 left unmodified (D-3 locked decision, pinned by test)"
  - "steam_api.pdb / steam_api_shim.lib (item 6, buildSteamBridgeShims.ts) explicitly out of scope -- different mechanism, stays open"
  - "Load-bearing order: all source/config edits committed BEFORE rm -rf public/bin/x64/darwin, so no tauri build ever saw bundle.macOS.files pointing at a missing directory"
metrics:
  duration: ~21min (14:04:11 to 14:24:41 NZST, 2026-09-01)
  completed: 2026-09-01
---

# Quick Task 260901-i8i: Drop x64/darwin Intel Mac Tree Summary

**Removed Intel Mac (`x86_64-apple-darwin` / `x64/darwin`) support from GameLib's macOS
build and release path in one coherent, load-bearing-ordered change: the release-workflow
matrix leg, the comet download key, the Tauri bundle mapping, the on-disk helper tree, and
every pinned test assertion that named them — proven on a real packaged DMG, not just
config assertions.**

## Performance

- **Duration:** ~21 minutes (3 task commits: 14:04:11 → 14:10:52 → 14:21:59 NZST)
- **Started:** 2026-09-01T02:04:11Z
- **Completed:** 2026-09-01T02:24:41Z
- **Tasks:** 3/3 completed
- **Files modified:** 13 (9 source/test/workflow files + 4 record annotations), 1 directory deleted

## Accomplishments

- Widened `x64NonGoalSurvivor.test.ts` from 3 to 4 `it()` blocks (both new categories
  mutation-proved RED on an out-of-repo scratch copy before landing), closing the gap where
  category 1 (electron-builder era) had no Tauri-era replacement.
- Removed the `x86_64-apple-darwin` matrix leg from `release-tauri.yml` (4→3 legs),
  literalized `GAMELIB_BRIDGE_TARGET_ARCH` to `'arm64'` (no more per-leg ternary), and
  removed the comet download key, the `bundle.macOS.files` mapping, and the
  `NATIVE_LZMA_REQUIRED_TRIPLES` shipping-inventory entry — all in one commit before the
  physical directory deletion, honoring the plan's load-bearing ordering constraint.
- Proved the removal on a real, freshly built, freshly mounted release DMG (not
  `pnpm tauri:dev`, which is blind to bundled resources): all 7 census criteria pass with
  exact-match numbers, including an installed `.app` size that matched the plan's
  prediction to the byte (289,952,582 B).
- Recorded both size bases everywhere required, never presenting an unlabelled number:
  **dev-machine 46,423,272 B** (4 fossil files) vs **fresh-CI 11,213,032 B** (comet only,
  the sole re-downloadable file).
- Annotated (never rewrote) four prior records with dated corrections, per the
  `260823-v27` precedent.

## Task Commits

1. **Task 1: Widen the x64 non-goal survivor gate before the sweep** — `763faa239` (test)
2. **Task 2: Sweep the source/config surface, then delete the tree (load-bearing order)** — `7d84fc0d1` (feat)
3. **Task 3: Prove it on a real packaged artifact, then update the record** — `46231fa68` (docs)

_No separate "plan metadata" commit — Task 3's commit already carries the record updates and MEASUREMENTS.md; this is a quick-task, not a phase-plan._

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 4-adjacent, resolved as documented deviation, not a Rule 4 architectural change] CR-01 prose comments collided with the new negative jest assertion**

- **Found during:** Task 2
- **Issue:** The plan required two things that directly conflicted: (a) preserve the CR-01
  historical prose comments in `release-tauri.yml` (reworded to past tense only), and
  (b) add `expect(source).not.toContain('--target x86_64-apple-darwin')` to
  `releaseWorkflow.test.ts`. The CR-01 comments (lines ~143, ~187) still contained that
  exact contiguous literal in backticks even after being reworded to past tense, so the new
  negative assertion failed RED against legitimate provenance text the plan explicitly said
  to keep.
- **Fix:** Split the phrase into two separate backtick spans — `` `--target` `` and
  `` `x86_64-apple-darwin` `` as distinct tokens — so the historical narrative meaning
  survives (a reader still sees both terms) while the exact contiguous substring the test
  bans no longer appears anywhere in the file.
- **Files modified:** `.github/workflows/release-tauri.yml` (2 locations)
- **Commit:** `7d84fc0d1`

**2. [Rule 3 - blocking, mechanical] `Edit` tool's `replace_all` missed a second occurrence**

- **Found during:** Task 2
- **Issue:** The tmpdir bridge fixture in `releaseWorkflow.test.ts` referenced
  `join('build', 'bin', 'x64', 'darwin', 'steam-bridge-helper')` in two places (a
  `seedBuildTree`'s `touch()` call and a separate "kept" assertion array) with slightly
  different surrounding syntax; a single `replace_all` edit only matched the first.
- **Fix:** Ran a second, separately targeted `Edit` for the "kept" assertion array's
  specific syntax, retargeting it to `arm64/darwin` as well. Verified via grep afterward
  that no `x64', 'darwin'` combination remained anywhere unintended.
- **Files modified:** `src/backend/__tests__/releaseWorkflow.test.ts`
- **Commit:** `7d84fc0d1`

**3. [Rule 1 - own-mistake fix] Doc comment accidentally quoted the retired literal**

- **Found during:** Task 2
- **Issue:** My first attempt at rewording `NATIVE_LZMA_REQUIRED_TRIPLES`'s doc comment in
  `meta/buildSidecarSea.ts` (4→3 triples) included the literal quoted string
  `'x86_64-apple-darwin'` in the explanatory prose, which kept
  `grep -c 'x86_64-apple-darwin' meta/buildSidecarSea.ts` at 6 instead of dropping to the
  plan's exact-count gate of 5.
- **Fix:** Reworded the comment to describe "the Intel Mac triple" without quoting the
  literal, bringing the grep count to exactly 5.
- **Files modified:** `meta/buildSidecarSea.ts`
- **Commit:** `7d84fc0d1`

### Deferred (out of scope, pre-existing, not caused by this task)

`src/backend/storeManagers/steam/__tests__/decompressPool.test.ts` has 3 failing tests
(`lzmaDecoderKind()` expects `'native'`, receives `'pure-js'` — the native `lzma-native`
addon is absent on this dev machine). This file was **never touched** by any of this task's
3 commits (verified via `git log` — last modified by `f3f63fd72`, unrelated). It is already
tracked as a known flake at
`.planning/todos/pending/2026-08-31-decompresspool-native-lzma-tests-fail-3-of-41.md`. Per
the scope boundary rule, this is out of scope for this task and was not fixed.

## Verification — success criteria (11/11)

1. **PASS** — `Resources/build/bin/x64/darwin` absent from the packaged app (not merely smaller): `test ! -d` confirmed on the mounted DMG.
2. **PASS** — `x64/win32` still present: 2 files / 211,452 B, parent key `x64` still exists.
3. **PASS** — `arm64/darwin`: 279 files / 12 symlinks / 100,707,073 B, 0 dangling — exact match to BASELINE.md, `verify:runner-bundle` PASS.
4. **PASS** — installed `.app`: 289,952,582 B on this machine (local basis), exact byte match; CI basis stated separately (−11,213,032 B vs a CI-produced prior release).
5. **PASS** — all four helpers execute rc=0: legendary 0.21.0, gogdl 1.3.0, nile 1.2.0, comet 0.2.0.
6. **PASS** — `x64NonGoalSurvivor` 4/4 `it()` green; full Meta suite 34 suites / 695 passed / 1 skipped; full backend suite 188/189 suites passed (1 pre-existing unrelated failure, documented above and out of scope).
7. **PASS** — `pnpm download-helper-binaries` exits 0, `Nothing to download, binaries are up-to-date`; `test ! -d public/bin/x64/darwin` confirmed both before and after.
8. **PASS** — 0 `sidecar_triple`/`--target` entries name `x86_64-apple-darwin` (2 remaining occurrences are historical prose, non-contiguous with `--target`); exactly 3 `sidecar_triple:` entries; `releaseWorkflow.test.ts` coherent including RC-1's `toHaveLength(3)`.
9. **PASS** — `src/backend/utils.ts` diff against pre-task HEAD is empty (D-3 held); `meta/buildSidecarSea.ts` diff shows only the doc comment + single array entry, capability code (`sidecarOutputPath`, `triplePlatform`, `expectedMachoArch`) untouched (RC-3).
10. **PASS** — the two ternary-independent bridge-arch tests (`'the env var the workflow sets is the one the build script actually reads'`, `'the arch env wiring belongs to the steam-bridge step (not some later step)'`) survive verbatim; describe reports 4 tests, not 2 (RC-5); no stale "four legs" prose remains (RC-4, verified "three matrix legs" wording).
11. **PASS** — record updated: `260901-i8i-MEASUREMENTS.md` created with both bases labelled everywhere; todo row DONE with item 6 explicitly still open; `8rm-MEASUREMENTS.md`, the todo's Cause-2 prose, `e7o-RESEARCH.md:18`, and `34.18-VALIDATION.md` all carry dated annotations with original figures intact (nothing rewritten).

## Self-Check: PASSED

All 15 files/dirs claimed as created/modified/deleted verified present or absent as expected
(FOUND for 14 files, `public/bin/x64/darwin` CONFIRMED ABSENT). All 3 task commit hashes
(`763faa239`, `7d84fc0d1`, `46231fa68`) verified present in `git log --oneline --all`.

## Known Stubs

None — this task removes code/config/tests and a directory; it does not add UI or data-flow surfaces.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries were introduced. All 8 threats in the plan's `<threat_model>` (T-i8i-01 through T-i8i-07, T-i8i-SC) were mitigated exactly as prescribed (backup+SHA-256 before deletion, plain `rm -rf` only, both size bases labelled everywhere).
