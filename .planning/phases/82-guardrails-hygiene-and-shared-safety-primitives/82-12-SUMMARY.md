---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 12
subsystem: testing
tags: [ci, ledger, decision, windows, linux, flake, supply-chain]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-11 proof head, push, and the first per-leg CI record"
provides:
  - "Per-suite operator decisions (2026-11-21, keep-fixing for all five entries) recorded in 82-TEST-LEDGER.md"
  - "Fixes for every CI red found: shimCoverage module state, Windows steamcm test, Linux steamLaunchRuntime, Linux callback-registry harness, Windows clippy ratchet, cargo-deny advisories, installer-timeout load flakes"
  - "Closed ledger: ## Verdict names final sha 2345c268686399287ac5d504e7f03999dbfe5b48 with Rust test, Test, Code check, Lint and Supply-chain audit all green on every leg"
affects: [83, 84]

status: complete
actuals:
  tokens: 60000
  tasks: 3
  commits: 15
plan_head_before: 2c72b10a74e4a4f6f1000c1362a5f42d1746acce
plan_head_after: 2345c268686399287ac5d504e7f03999dbfe5b48

tech-stack:
  added: []
  patterns:
    - "Inject the host platform (optional dep, default process.platform) instead of reading isMac, so a macOS-only code path is testable on any OS"
    - "Prove a 'zeroed after use' property on live memory (probe on a later pull, or run on a harness-owned stack), never by reading a dead stack frame"

key-files:
  created:
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-12-SUMMARY.md
  modified:
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-TEST-LEDGER.md
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/storeManagers/steam/bottledSteam.ts
    - src/backend/storeManagers/steam/steamLaunchRuntime.ts
    - src/backend/storeManagers/steam/__tests__/bottledSteam.test.ts
    - src/backend/storeManagers/steam/__tests__/steamLaunchRuntime.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
    - meta/__tests__/fixtures/callback_registry_harness.c
    - src-tauri/crates/gamelib-steamcm/src/wrap.rs
    - src-tauri/crates/gamelib-safety/src/safe_path.rs
    - src-tauri/crates/gamelib-depot/tests/post.rs
    - src-tauri/deny.toml

key-decisions:
  - "Operator decided keep-fixing for entries (a)-(e) on 2026-11-21; nothing retired, no skip list, retirement file or widened ceiling"
  - "cargo-deny: operator ACCEPTED the zip 4.6.1 risk (RUSTSEC-2026-0545, -0548) with the same reason text as the earlier zip 4.x ignores"
  - "Callback-registry zeroing cases run the registry on a harness-owned pthread stack; the cr case probes a later pull of the same run"

patterns-established:
  - "Second diagnosis rather than retirement: a fix whose Linux proof moved the red to a sibling case led to the structural cause (four dead-frame readers) and one shared remedy"

requirements-completed: [FND-01]

duration: 75min
completed: 2026-11-21
---

# Phase 82 Plan 12: Per-suite decisions and the closed ledger Summary

**Every CI red left after 82-11 fixed by cause under the operator's keep-fixing decision (nothing retired), and the ledger closed at 2345c2686 with Rust test (3 legs), Test, Code check, Lint and Supply-chain audit all green.**

## Performance

- **Duration:** about 75 min (continuation; Task 1 was committed earlier as `11ac78f9b`)
- **Tasks:** 3 (tracer, decision checkpoint, apply and prove)
- **Push rounds used:** 3 of 4 (standing authority; fast-forward only, pre-push hook every time, never `--no-verify`)

## Accomplishments

- Task 2 (D-03): the operator decided each entry on 2026-11-21 and the ledger records it with the date: keep-fixing (a) shimCoverage module state, (b) Windows steamcm test, (c) steamLaunchRuntime on Linux, (d) callbackRegistryHost `cr_buffer_zeroed`; and (e) cargo-deny accepted as a risk.
- (a) `x86NullObjectVersionSet()` replaces the module-level `new Set` (`11996d3ed`); `moduleStateCensus` and `diPhaseGates` pass; `SANCTIONED` untouched.
- (b) `NO_HOME` is absolute on Windows and the test picks a per-OS usable home (`8f32bcb9d`); the Windows multi-crate step now runs past steamcm for the first time and passes.
- (c) optional injected `platform` for the bottled-Steam raiser (`eac686d51`); the forced-linux reproduction and the whole steam test tree pass; no `jest.mock` added.
- (d) the Linux harness red took two rounds: round 1 fixed `cr_buffer_zeroed` (live-memory probe, `5ff4c193c`) and moved the red to `no_hold_168`; the second diagnosis found four cases reading dead stack frames and ran those on a harness-owned stack (`9ab56bdbe`). Removing either `gl_cb_zero` in `gen_vtables.ts` fails the matching case (checked locally, restored).
- (e) `RUSTSEC-2026-0545` and `RUSTSEC-2026-0548` added to `src-tauri/deny.toml` (`606d761ac`); Supply-chain audit green.
- Windows clippy ratchet (surfaced once steamcm passed): `#[cfg(unix)]` on the unix-only helpers in `gamelib-safety` and `gamelib-depot/tests/post.rs` (`b7a411b6a`); no ceiling touched.
- `sharedRedistInstall` per-test timeouts on the three wait-loop tests (`5b969edd8`), after the second red of that shape.

## Task Commits

1. **Task 1: tracer, decision brief** - `11ac78f9b` (docs)
2. **Task 2: decisions recorded** - `633217fa8` (docs; checkpoint decision supplied by the operator)
3. **Task 3: fixes, proof, Verdict** - `11996d3ed`, `eac686d51`, `8f32bcb9d`, `5ff4c193c`, `606d761ac`, `9ab56bdbe`, `b7a411b6a`, `5b969edd8`; CI records `964e2b7f7`, `2345c2686`; Verdict in the final docs commit.

Other sessions' commits carried by the pushes (not this plan's): `2c72b10a7`, `f16f58990`, `7c61e07e0`, `2e443f0e6` (quick-261121-97s, round 1). The measured `commits: 15` counts three of them (`f16f58990`, `7c61e07e0`, `2e443f0e6`) because `plan_head_before` sits just under `11ac78f9b`; 12 are this plan's.

## CI proof

| Round | Sha | Result |
| --- | --- | --- |
| 1 | `633217fa8` | Supply-chain green; Rust test red on the Windows clippy ratchet only; Test red on the Linux harness only |
| 2 | `964e2b7f7` | Rust test green on all three legs; Test red on one `sharedRedistInstall` load flake |
| 3 | `2345c2686` | Test, Code check, Lint, Supply-chain green; Rust test green on all three legs (macos on attempt 2 after one `steampoll` watchdog timing flake) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dead-frame readers in the callback-registry harness**
- **Found during:** Task 3 (round 1 CI)
- **Issue:** the `cr_buffer_zeroed` fix moved the Linux red to `no_hold_168`: three more cases scan a drain buffer through a pointer into a dead stack frame; which one reds follows the stack layout.
- **Fix:** run those cases' registry call on a harness-owned pthread stack; mutation-checked.
- **Files modified:** `meta/__tests__/fixtures/callback_registry_harness.c`
- **Commit:** `9ab56bdbe`

**2. [Rule 1 - Bug] Windows clippy ratchet reds (3 dead_code, 1 unused_imports)**
- **Found during:** Task 3 (round 1 CI; reachable only after the steamcm test was fixed)
- **Fix:** `#[cfg(unix)]` on the helpers only unix callers use. **Commit:** `b7a411b6a`

**3. [Rule 1 - Bug] Load flake per-test timeouts** - applied to three tests of one shape on the operator's standing instruction. **Commit:** `5b969edd8`

**4. Ledger correction:** the earlier note read `cr_buffer_zeroed left == 0:1311` as 1311 leftover bytes; 1311 is the harness source line. Corrected in the ledger.

**Total deviations:** 3 auto-fixed bugs, 1 correction. Impact: the plan needed three push rounds instead of one.

## Issues Encountered

- A one-off macOS flake in `gamelib-steampoll` `watchdog_real::still_kills_the_grandchild_when_the_middle_process_dies_first` at the final sha; passed on a same-sha job rerun and 6 of 6 locally. Recorded in the ledger's "Observed flaky" with a fix direction; not retired.
- cargo-deny is not installed on this host; the zip advisories were proven by CI only.

## Known Stubs

None.

## Threat Flags

None. The only security-relevant change is the operator-accepted advisory ignore (T-82-36 and T-82-37 mitigated: no suite retired; the Verdict names the final sha and run ids).

## Next Phase Readiness

FND-01 criterion 1 holds at `2345c268686399287ac5d504e7f03999dbfe5b48`. Owed, not blocking: the live sidecar-to-shell safety round trip, `fileStore.ts` deletion (todo `2026-11-21-migrate-filestore-test-mocks-then-delete-filestore.md`), and the `steampoll` watchdog test's first-child selection if it reds again.

## Self-Check: PASSED

All twelve listed 82-12 commits verified as ancestors of HEAD; the files above exist; ledger contains `## Verdict`.
