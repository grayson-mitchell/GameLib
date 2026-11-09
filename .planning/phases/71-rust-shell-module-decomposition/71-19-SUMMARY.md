---
phase: 71-rust-shell-module-decomposition
plan: 19
subsystem: testing
tags: [jest, source-text-pins, rust-shell, gap-closure]
requires: []
provides:
  - readTauriShellProductionFile helper
  - non-vacuous D-01 sidecar EOF pin with mutation self-test
affects: [71-20]
tech-stack:
  added: []
  patterns: [production-only source readers; D-10 raw labels for deliberate test-text pins]
key-files:
  created: []
  modified:
    - src/backend/testUtils/tauriShellSource.ts
    - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/longRunningChannels.test.ts
    - src/backend/__tests__/loginChromeCssInjection.test.ts
    - meta/captureShellScrollback.ts
key-decisions:
  - "longRunningChannels.test.ts added to the main.rs-direct-read allow-list: it reads main.rs's own test module (WR-03)"
requirements-completed: [D-10]
duration: 25min
completed: 2026-11-09
---

# Phase 71 Plan 19: Close WR-01 vacuous D-01 pin Summary

The D-01 sidecar EOF pin now reads production-only `sidecar.rs`, requires the `on_sidecar_eof(` call inside `start_reader`'s body after the drain, and carries a permanent mutation self-test. Every other raw shell-source reader was moved to production text or labelled as a deliberate test-text pin.

## Commits
- b9cbec44f: Task 1, helper, non-vacuous pin, self-test
- 416f897cd: Task 2, loader-style readers
- 7d4f0f545: Task 3, one-line readers

## Demonstrated red (Task 1 step f)
With `on_sidecar_eof(&state.shutting_down` renamed to `sidecar_eof_removed(` in `src-tauri/src/sidecar.rs` (verified clean before and after, restored with `git checkout --`):

```
FAIL Backend src/backend/__tests__/sidecarShutdownFlagSource.test.ts
    ✕ the reader surfaces EOF after draining, and never respawns the sidecar (D-01)
    ✕ the old whole-file pin passes with the production call removed; the new one fails   (fails closed: replace no longer changes text)
    ✕ the new pin fails when the production call is moved out of start_reader               (same)
```
Restored: 10/10 pass. The self-test also proves in memory that the old pin passes on the mutated raw file (vacuity witness) while the new one fails, and that moving the call out of `start_reader` fails the new pin.

## Test counts
Pre-change (all raw-reader suites, 654 tests): 2 failed / 652 passed. Post-change: tests added only in sidecarShutdownFlagSource (+2 self-tests); none removed or skipped. Post: quitTeardownWiring now passes (C3 spawn-count pin was previously satisfied-wrong by test text: 3 vs 4); tauriShellSource.test.ts has 1 failure, pre-existing (see below).

## Vacuous pins found
- `tauriShellSource.test.ts` "clipboard_text_arg pure helper exists": `fn clipboard_text_arg` does not exist in production (replaced by generated `ClipboardWriteTextArgs`); the needle matched only the `fn clipboard_text_arg_*` cargo test names. Re-pointed to `ClipboardWriteTextArgs::from_args`.
- quitTeardownWiring C3 spawn-count (`.spawn()` == 3) was off by one from test text; passes on production text.

## Labelled raw (D-10 raw) reader sites
- loginChromeCssInjection.test.ts: cargo test fn survival pin (`readTauriShellSource`)
- tauriShellSource.test.ts: clipboard cargo test fn names; per-file strip proof (`readTauriShellFile(f)`); main.rs strip proof
- longRunningChannels.test.ts: `loadMainRsRaw` reads main.rs's own test module (via `listRustTestModuleBlocks`)
- sidecarShutdownFlagSource.test.ts: mutation self-test raw read
Final grep of non-production readers also lists comment lines in tauriShellSource.test.ts (4484, 4665).

## Deviations from Plan
- [Rule 3] Added `src/backend/__tests__/longRunningChannels.test.ts` to the "no test reads main.rs directly" allow-list in tauriShellSource.test.ts, because WR-03's prescribed `readTauriShellFile('main.rs')` otherwise trips that guard.
- Task 3 needed no raw sites or floor change; production source still exceeds the 100_000 floor in steamStartupKeyringDeferral.

## Deferred Issues
- tauriShellSource.test.ts "WR-07 ... no WebviewWindowBuilder chain passes a STRING LITERAL to .title(" fails before and after this plan (`.title(format!` match). Logged in `deferred-items.md`.

## Verification
`pnpm codecheck` exit 0; prettier --check clean on every edited file; `git diff -- src-tauri` empty.

## Self-Check: PASSED
