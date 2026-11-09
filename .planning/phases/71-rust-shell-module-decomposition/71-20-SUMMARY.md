---
phase: 71-rust-shell-module-decomposition
plan: 20
subsystem: testing
tags: [jest, rust-shell, source-text-pins, gap-closure]
requires: ["71-19"]
provides:
  - fail-closed test-module cutters (jest and Rust)
  - RAW_SHELL_READ_ALLOWLIST guard
affects: []
key-files:
  modified:
    - src/backend/testUtils/tauriShellSource.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src-tauri/src/main.rs
requirements-completed: [D-10]
duration: 30min
completed: 2026-11-09
---

# Phase 71 Plan 20: WR-02 fail-closed cutters and raw-reader allow-list Summary

Both test-module cutters now cut `#[cfg(all(test, ...))]` and stacked-attribute test mods (so `terminate_reply_tests` is no longer production text) and throw/panic on any other `cfg` mentioning `test`. A new allow-list guard fails on any unlisted raw `readTauriShellSource(`/`readTauriShellFile(` read in src/ or meta/.

## Commits
- 0c68109ab: Task 1, cutters on both sides, fixtures, cross-check guard
- 5dec6a105: Task 2, raw-reader allow-list guard

## Counts
- cargo test --bin gamelib-shell: before 445 passed / 2 ignored; after 448 passed / 0 failed / 2 ignored (+3 Rust tests).
- main.rs diff hunks all start at line 1987 or later, inside `mod tests` (opens 1878); only main.rs changed in src-tauri.

## Demonstrated red (Task 2)
Appending `const _probe = readTauriShellSource()` to capabilitiesDefault.test.ts made the allow-list test fail with `+ "src/backend/__tests__/capabilitiesDefault.test.ts": 1`. Reverted with `git checkout --`; `git diff --quiet` exits 0.

The Task 1 red-side is covered by fixtures: `#[cfg(any(test, ...))]` and `#[cfg(not(test))]` throw `ambiguous test cfg` (jest) and panic (Rust, `should_panic`).

## Allow-list
tauriShellSource.test.ts: 4 (strip proofs, terminate_veto raw proof, clipboard cargo fn names), sidecarShutdownFlagSource.test.ts: 1, loginChromeCssInjection.test.ts: 1, longRunningChannels.test.ts: 1. The scan visits at least 100 files and includes `.cjs`/`.mjs`.

## Deviations from Plan
- Allow-list count for tauriShellSource.test.ts is 4 (plan guessed fewer); set from an actual run.
- The cross-check guard reads files with `readFileSync` directly (not the helpers), so it does not add to the raw-reader count.

## Deferred / pre-existing
- tauriShellSource.test.ts WR-07 `.title(` string-literal failure persists (known, in deferred-items.md).
- Full `npx jest` shows failures in genI18nGateScope, gamelibCatalogParity (sl locale), macArchKnownFixRouting, logSecretGate, x86CallbackWineHarness. None reference the shell-source helpers; not investigated further or caused by this plan (test-only edits). Full jest run did not complete within the timeout in my session.

## Verification
`pnpm codecheck` exit 0; prettier --check clean on both .ts files; targeted jest (tauriShellSource, sidecarShutdownFlagSource) passes except WR-07.

## Self-Check: PASSED
