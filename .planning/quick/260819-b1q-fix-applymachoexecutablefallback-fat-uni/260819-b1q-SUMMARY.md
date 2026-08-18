---
phase: quick-260819-b1q
plan: 01
subsystem: infra
tags: [steam, macos, mach-o, depot, fs, native-install]

# Dependency graph
requires:
  - phase: quick-260818-v81
    provides: healReconciledFileModes applying the Mach-O fallback on the reconciled/skipped-download heal path
provides:
  - "Two-stage Mach-O probe (classifyMachOProbe / isThinMachOExecutable) that correctly chmod's fat/universal binaries whose first slice sits beyond the 4096-byte probe"
  - "RED-proven test fixtures at realistic (16384) and adversarial (1 MiB) slice offsets, pinning the fix against a 'just enlarge the fixed buffer' non-fix"
affects: [steam-native-macos-install, humankind-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure Buffer classifier + a second, small, bounded positional FileHandle.read at an attacker-influenced-but-bounded file offset, owned by the caller that already has the handle open"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts

key-decisions:
  - "Rejected raising MACHO_PROBE_BYTES; kept it a pure classifier + a second bounded positional read on the already-open FileHandle instead, per the plan's design_decision"
  - "Bounded the untrusted fat_arch.offset three ways before any I/O: structurally (nfatArch in [1,32], offset past its own fat_header/fat_arch table), against an absolute 64 MiB cap, and against the real file size via handle.stat()"

patterns-established:
  - "MachOProbeVerdict discriminated union (executable/declined/slice) separates pure classification from the I/O the caller must perform for the slice case"

requirements-completed: [QUICK-260819-B1Q]

# Metrics
duration: ~35min
completed: 2026-08-19
---

# Quick Task 260819-b1q: Fix applyMachOExecutableFallback for fat/universal Mach-O Summary

**Two-stage Mach-O probe (pure classifier + bounded second positional read) so fat/universal binaries whose first slice sits beyond the 4096-byte probe — including `Humankind.app/Contents/MacOS/Humankind` at offset 16384 — actually get `chmod 0o755`.**

## Performance

- **Duration:** ~35 min (session resumed once mid-execution after an unrelated API error; task work itself was continuous)
- **Tasks:** 3/3 completed
- **Files modified:** 2

## Accomplishments
- Closed the root cause of "The application Humankind cannot be opened" on macOS native Steam installs: `isExecutableMachO` read a fat binary's `fat_arch.offset` and then tried to classify the slice header AT THAT FILE OFFSET out of a buffer holding only the first 4096 bytes — silently declining every fat binary whose slice sat beyond the probe, which HUMANKIND's own live census showed was 15 of 15.
- Replaced it with `classifyMachOProbe` (pure `Buffer` classifier, unchanged behavior for in-probe fat slices) + a second, small, bounded positional `handle.read()` in `applyMachOExecutableFallback` for slices beyond the probe, reusing the already-open `FileHandle`.
- Bounded the untrusted, attacker-influenced `fat_arch.offset` three separate ways before it can drive any I/O: structurally (`nfatArch` in `[1,32]`, offset must sit past its own `fat_header`/`fat_arch` table), against an absolute 64 MiB cap, and against the file's real size via `handle.stat()`.
- Proved the fix with RED-first fixtures at HUMANKIND's real offset (16384) and at 1 MiB — the 1 MiB case exists specifically so a lazy "just enlarge `MACHO_PROBE_BYTES`" fix cannot pass it.
- Neither call site (`downloadSingleFile`, `healReconciledFileModes`) needed any edit — both benefit for free, closing the gap on the fresh-download path and the reconciled-heal path (quick-260818-v81) simultaneously.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — realistic-offset fat fixtures that fail against today's depot.ts** - `86a33ae61` (test)
2. **Task 2: GREEN — two-stage bounded Mach-O probe in depot.ts** - `9f0b2fa6c` (fix)
3. **Task 3: Regression gate — clear the one lint error the new code introduced** - `3f85ffdae` (fix)

**Plan metadata:** (docs commit handled by the orchestrator in a later step)

_Note: this is a TDD-tagged task; Task 1 (`test`) and Task 2 (`fix`, the GREEN step) form the RED/GREEN pair. Task 3 is the plan's regression-gate task, which surfaced and fixed one lint error rather than a refactor._

## Files Created/Modified
- `src/backend/storeManagers/steam/depot.ts` — replaced `isExecutableMachO` with `classifyMachOProbe`/`isThinMachOExecutable`/`MachOProbeVerdict`, added `MACHO_HEADER_BYTES`/`MACHO_MAX_FAT_ARCH`/`MACHO_MAX_SLICE_OFFSET` constants, and taught `applyMachOExecutableFallback` to issue a second bounded positional read on its already-open handle. `MACHO_PROBE_BYTES` unchanged at 4096.
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` — parameterized `buildFatMachOHeader(filetype, sliceOffset = 64, nfatArch = 1)` (default preserves every pre-existing fixture byte-for-byte) and added 6 tests: beyond-probe EXECUTE/DYLIB @16384, EXECUTE @1 MiB, BUNDLE-still-declines @16384, offset-past-EOF-declines-without-throwing, and a heal-path (reconciled/skipped-download) beyond-probe EXECUTE test proving the second call site benefits with zero edits.

## Decisions Made
- Followed the plan's `<design_decision>` exactly: a pure `Buffer` classifier plus a second I/O-owning read at the call site, rather than making the classifier itself async/reader-based (keeps header parsing synchronous, pure, and unit-testable against plain `Buffer`s) and rather than raising `MACHO_PROBE_BYTES` (a fixed buffer is a guess that reproduces the same bug with a bigger number, and multiplies per-file read cost across ~18.5k files).
- `FAT_MAGIC_64` (64-bit slice offsets) stays a documented non-goal — no shipped game binary has a slice past 4 GiB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/lint error] `prefer-const` eslint error introduced by Task 2's own code**
- **Found during:** Task 3 (regression gate — `pnpm lint`)
- **Issue:** `let bytesRead: number` followed by a destructuring-assignment expression statement (`;({ bytesRead } = await handle.read(...))`) trips `prefer-const` since `bytesRead` is only ever assigned once.
- **Fix:** Destructure directly into a `const`: `const { bytesRead } = await handle.read(buf, 0, MACHO_PROBE_BYTES, 0)`. No behavior change.
- **Files modified:** `src/backend/storeManagers/steam/depot.ts`
- **Verification:** `pnpm lint` now reports 0 errors (3864 pre-existing warnings elsewhere, unaffected); `depot.test.ts` + `depotPrimitives.test.ts` (198 tests) still green; `tsc --noEmit` clean.
- **Committed in:** `3f85ffdae`

---

**Total deviations:** 1 auto-fixed (Rule 1 — lint error in our own new code)
**Impact on plan:** Purely mechanical (let→const), no scope creep.

## Issues Encountered

**Task 3's specified verify command (`depot.test.ts` + `depot.finalize.test.ts` + `depotPrimitives.test.ts` in one jest invocation) OOMs the worker process**, and even run alone `depot.finalize.test.ts` has two tests (Test D, Test E) that fail on timeout with a dangling-timer `TypeError: sendProgressUpdate is not a function` firing after test teardown. I confirmed this is pre-existing and unrelated to this task's changes by exporting the pre-plan baseline commit (`9cd72e40c`, via `git archive` into an isolated scratch directory with a symlinked `node_modules` — no working-tree mutation) and reproducing the identical `2 failed, 2 passed, 4 total` result there. `classifyMachOProbe`/`isThinMachOExecutable`/`applyMachOExecutableFallback` (this task's only edits) are nowhere near the StateFlags/`emitProgress` code path this failure lives in. Ran `depot.test.ts` + `depotPrimitives.test.ts` (198 tests, including all 16 in the Mach-O describe block) together instead — both pass cleanly. Logged to [deferred-items.md](./deferred-items.md), left unfixed per the executor scope boundary.

## Next Phase Readiness
- The macOS native-install +x gap for fat/universal Mach-O binaries is closed on both the fresh-download and reconciled-heal paths. HUMANKIND's own `CFBundleExecutable` (and any other title whose fat slice sits beyond 4096 bytes) should now land with `+x` without a re-download.
- `depot.finalize.test.ts`'s Tests D/E hang/dangling-timer defect remains open and unowned — worth a dedicated debug/fix task since it currently prevents that suite from running cleanly in CI-equivalent conditions (see deferred-items.md).
- Live hardware verification (actually installing HUMANKIND and confirming `Humankind.app/Contents/MacOS/Humankind` carries `+x` and launches) was not performed as part of this quick task — the plan's scope was the code fix + RED/GREEN test proof, not a live install cycle.

---
*Phase: quick-260819-b1q*
*Completed: 2026-08-19*

## Self-Check: PASSED

All created/modified files verified present on disk; all three task commit hashes
(86a33ae61, 9f0b2fa6c, 3f85ffdae) verified present in git log.
