---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 08
subsystem: infra
tags: [tauri, sea, node, sidecar, cross-compile, macos, ci, packaging]

# Dependency graph
requires:
  - phase: 34 (plans 02/05/06)
    provides: "meta/buildSidecarSea.ts (SEA legacy 2-step compile script), the macos-latest matrix leg building both aarch64-apple-darwin and x86_64-apple-darwin"
provides:
  - "GAMELIB_SIDECAR_TARGET_TRIPLE-driven output triple (resolveTriple(), CR-01 fix)"
  - "Checksum-verified cross-arch Node base binary acquisition (obtainCrossNodeBinary(), official nodejs.org SHASUMS256.txt verification)"
  - "lipo -archs post-injection arch verification gate (verifyBinaryArch(), T-34-14)"
  - "Target-driven (not host-driven) postject/codesign platform selection in injectBlob()"
  - "Regression test coverage for hostTriple()/resolveTriple()/nodeDistName()/nodeDistUrls()/triplePlatform()/expectedMachoArch()"
affects: ["34-11 (release-tauri.yml matrix wiring the GAMELIB_SIDECAR_TARGET_TRIPLE env var per leg)", "34-07 (live tag-push gate, which would have failed the x86_64-apple-darwin leg without this fix)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Target-triple env override with host-triple fallback for cross-compile build scripts (GAMELIB_SIDECAR_TARGET_TRIPLE)"
    - "Checksum-verified official upstream binary acquisition (fetch + SHASUMS256.txt + node:crypto sha256) instead of relabeling a host binary for cross-arch builds"
    - "Post-build real-artifact arch verification gate (lipo -archs) as a COMPILE GATE, not a shipped-and-hoped assumption"

key-files:
  created: []
  modified:
    - meta/buildSidecarSea.ts
    - meta/__tests__/buildSidecarSea.test.ts

key-decisions:
  - "Per GAP-D-02: fix CR-01 properly (target-triple override + checksum-verified official Node binary), keep Intel Mac support -- dropping the x86_64 leg and using Rosetta were both explicitly rejected"
  - "obtainCrossNodeBinary() fails loud for a Windows target triple (cross-building Windows is out of scope; the release matrix builds Windows natively on windows-latest)"
  - "nodeDistUrls() defaults version to process.version so the cross-arch base binary always matches the Node version generating the SEA blob"

patterns-established:
  - "Cross-arch build base binaries are sourced from the official upstream distributor with checksum verification, never copied/relabeled from the host -- reusable pattern for any future cross-compile step in this repo"

requirements-completed: [REQ-34-03]

# Metrics
duration: ~15min
completed: 2026-07-24
---

# Phase 34 Plan 08: Cross-Arch SEA Sidecar Triple Resolution + Arch Gate Summary

**Closed CR-01 (BLOCKER): `meta/buildSidecarSea.ts` now derives its output triple from `GAMELIB_SIDECAR_TARGET_TRIPLE` (falling back to the host triple), sources a checksum-verified official nodejs.org Node binary for cross-arch builds instead of relabeling `process.execPath`, and gates the produced binary's real Mach-O arch with `lipo -archs` before it can ship — empirically proven on this arm64 Mac (x86_64 leg produces real x86_64 bytes; native arm64 leg is unregressed).**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-24T07:00Z (approx, session start)
- **Completed:** 2026-07-24T07:08Z
- **Tasks:** 3 (2 code tasks + 1 empirical verification task)
- **Files modified:** 2

## Accomplishments

- `hostTriple()` is now exported and test-covered (previously private and untested).
- Added `resolveTriple()`, `triplePlatform()`, `expectedMachoArch()`, `nodeDistName()`, `nodeDistUrls()` — pure, exported helpers covering the triple/dist/arch contract, all with new regression tests (26 total tests, all passing).
- `main()` resolves the target triple via `resolveTriple()` (target-driven), logs whether the run is a cross-build, and no longer silently derives the output triple from the CI runner's own architecture.
- `copyNodeBinary()` copies `process.execPath` ONLY on the native/host-triple branch; a cross-arch target now calls the new `obtainCrossNodeBinary()`, which downloads the official nodejs.org dist archive for the target triple, verifies it against `SHASUMS256.txt` (SHA-256), extracts only the needed binary member via argv-form `tar`, and fails loud (deletes the bad file) on a checksum mismatch.
- `injectBlob()` now derives its platform from the TARGET triple (`triplePlatform()`) instead of `process.platform` — fixing the same host-vs-target bug family the review flagged for the output-filename bug, since it previously decided `--macho-segment-name`/codesign gating from the CI runner's platform.
- New `verifyBinaryArch()` runs `lipo -archs` on darwin targets immediately after injection and throws a `COMPILE GATE FAILED (D-06/T-34-14)` error if the real Mach-O architecture doesn't match the triple — a relabeled/wrong-arch binary can no longer reach users.
- **Empirically proven on this arm64 dev Mac** (Task 3): the `x86_64-apple-darwin` override produced a binary that `lipo -archs` reports as genuinely `x86_64`; a subsequent no-override run still produced the `aarch64-apple-darwin` binary reporting `arm64` — the native/dev path is unregressed.

## Task Commits

1. **Task 1: Export target-triple + Node-dist resolution helpers and cover them with tests** - `a2a12ac0` (feat)
2. **Task 2: Use a checksum-verified official Node binary for the target triple, and gate on real arch** - `47346504` (fix)
3. **Task 3: Prove the cross-arch build locally on the arm64 dev Mac** - no commit (verification-only task; produced artifacts are gitignored per `src-tauri/binaries/.gitignore`)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `meta/buildSidecarSea.ts` — exported `hostTriple()`; added `resolveTriple()`, `triplePlatform()`, `expectedMachoArch()`, `nodeDistName()`, `nodeDistUrls()`; added `NODE_DIST_CACHE_DIR` constant; added `obtainCrossNodeBinary()`; rewired `copyNodeBinary()` to branch native-vs-cross-arch; changed `injectBlob()` signature to take `triple` and derive platform from it; added `verifyBinaryArch()`; updated `main()` to call `resolveTriple()`, log cross-build status, and run the new arch gate; updated the file header comment with a CR-01 provenance note.
- `meta/__tests__/buildSidecarSea.test.ts` — appended 8 new describe blocks (18 new tests) covering `resolveTriple`, `hostTriple`, `nodeDistName`, `nodeDistUrls`, `triplePlatform`, `expectedMachoArch`, including the named CR-01 regression test asserting the `x86_64-apple-darwin` override yields `gamelib-sidecar-x86_64-apple-darwin`, not the aarch64 filename. No existing tests were modified or deleted.

## Decisions Made

- Followed the plan's `GAMELIB_SIDECAR_TARGET_TRIPLE` env-override + `hostTriple()`-fallback design exactly, per user decision GAP-D-02 (fix properly, keep Intel Mac support; dropping the x86_64 leg and Rosetta were both explicitly rejected).
- `obtainCrossNodeBinary()` throws a documented, fail-loud error for Windows target triples rather than attempting a cross-build — the release matrix always builds Windows natively on `windows-latest`, so this is a deliberate scope limit, not a silent fallback.
- No new npm/pip/cargo dependency was added — the whole cross-arch acquisition path uses global `fetch`, `node:crypto`, and the system `tar` binary, matching the plan's threat-register commitment (`git diff package.json` stayed empty).

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria for both code tasks (Task 1 export/test coverage, Task 2 grep-verifiable exact-match counts + `tsc --noEmit` clean) passed on the first attempt, and Task 3's empirical local build matched the plan's expected outcome (no `postject`/`codesign` failure on the cross-arch Mach-O was encountered, so the plan's FAILURE HANDLING branch was not needed).

## Issues Encountered

None.

## Verbatim Task 3 Evidence

Cross-arch build (`GAMELIB_SIDECAR_TARGET_TRIPLE=x86_64-apple-darwin pnpm build:sidecar-sea`):

```
[build:sidecar-sea] Resolved target triple: x86_64-apple-darwin (cross-build, host is aarch64-apple-darwin)
SEA sidecar arch verified: x86_64 (x86_64-apple-darwin)
SEA sidecar compiled -> src-tauri/binaries/gamelib-sidecar-x86_64-apple-darwin
```

`lipo -archs src-tauri/binaries/gamelib-sidecar-x86_64-apple-darwin`:
```
x86_64
```

Native build, no override (`pnpm build:sidecar-sea`):

```
[build:sidecar-sea] Resolved target triple: aarch64-apple-darwin (native build)
SEA sidecar arch verified: arm64 (aarch64-apple-darwin)
SEA sidecar compiled -> src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin
```

`lipo -archs src-tauri/binaries/gamelib-sidecar-aarch64-apple-darwin`:
```
arm64
```

`git status --porcelain src-tauri/binaries` printed nothing after both runs — both artifacts stayed gitignored, as expected.

## User Setup Required

None — no external service configuration required. (Cross-arch builds require outbound network access to `nodejs.org` at build time, already required by this environment's package manager and other tooling.)

## Next Phase Readiness

- CR-01 is closed with hardware-proven evidence on the exact runner shape (Apple-Silicon Mac) that caused the original bug.
- 34-11 must set `GAMELIB_SIDECAR_TARGET_TRIPLE` per matrix leg in `.github/workflows/release-tauri.yml` for this fix to take effect in CI — this plan only lands the consuming script side.
- The remaining gap-closure plans (34-09..34-11) and the deferred 34-07 live tag-push gate can now proceed; the live gate would previously have failed the macOS x86_64 leg without this fix.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: meta/buildSidecarSea.ts
- FOUND: meta/__tests__/buildSidecarSea.test.ts
- FOUND: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-08-SUMMARY.md
- FOUND: a2a12ac0 (Task 1 commit)
- FOUND: 47346504 (Task 2 commit)
- FOUND: dd7805f3 (SUMMARY commit)
