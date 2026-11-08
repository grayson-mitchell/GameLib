---
phase: 71-rust-shell-module-decomposition
plan: 02
subsystem: testing
tags: [jest, rust-source-text, test-helpers]
requires: [71-01]
provides:
  - readTauriShellProductionSource, stripRustTestModules, listRustTestModuleBlocks
  - readTopLevelFnBody, readHandlerBody (throw on missing/duplicate/short body)
  - readMacosEpicEmbedSource, prefix-aware isExcludedShellFile
affects: [71-03, later Phase 71 waves]
key-files:
  modified:
    - src/backend/testUtils/tauriShellSource.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/loginChromeCssInjection.test.ts
    - src/backend/__tests__/macosEpicEmbedSource.test.ts
    - src/backend/__tests__/macosEpicEmbedDiagPersistence.test.ts
key-decisions:
  - "Cut rule: column-0 #[cfg(test)] + column-0 `mod <ident> {` through next line exactly `}`; applied per file before concatenation"
requirements-completed: [D-10, D-11]
duration: 20min
completed: 2026-11-08
---

# Phase 71 Plan 02: Production-source reader and slicer migration Summary

A per-file test-module cutter and production reader replace the `indexOf('mod tests {')` idiom, proven equal to the old slice on the unmoved tree, with a guard against reintroduction.

## Accomplishments
- Helper gains 7 exports; `isExcludedShellFile` also excludes `macos_epic_embed/**` (D-11). File list unchanged (main.rs last).
- Three `productionCode` slicers migrated to `readTauriShellProductionSource()`; both Epic embed suites read via `readMacosEpicEmbedSource()` (byte-identical today).
- Proof describe: per-file strip equals ranges removed; enumerated non-main test mods are `relay_allow_list_tests`, `shell_open_tests`; main.rs stripped equals old slice modulo trailing newline.
- Needle counts, measured old slice vs new reader vs full source, all identical old/new: `fn login_chrome_css_script(` defs 1 (full 1); calls 1 (full 10); `install_native_login_bar(` calls 2 (full 2); `.makeKeyAndOrderFront(None)` 0; `register_presented_login_sheet(` 3; `request_login_sheet_cancel(` 2.
- No-slicer guard ALLOWED map has 2 entries (helper, this test file). `longRunningChannels.test.ts` untouched.
- jestpins.sh over the 5 suites: 349 passed, 1 failed (known WR-07), 0 unknown. prettier, eslint, `pnpm codecheck` clean.

## Task Commits
1. e7761b8ab helper readers + unit tests
2. 7beb301b7 slicer migration, proof, guard
3. 0c0daa75b Epic embed readers (the readMacosEpicEmbedSource equality case lives in the task 2 commit's proof describe)

## Deviations from Plan
- [Measured] `install_native_login_bar(` whole-source count is 2, not 1 as quoted (the plan's 1 is the arm-body scope); live number pinned.
- The Epic reader proof case was committed with Task 2 (same test file) rather than Task 3.
- Task 1 initially left two new imports unused; they were added in Task 2 to keep each commit lint-clean.

## Known Stubs
None.

## Self-Check: PASSED
