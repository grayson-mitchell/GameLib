---
phase: 77-runtime-hardening-from-the-v0-9-review-debt
plan: 02
subsystem: sidecar-exit-contract, overlay, records
tags: [sidecar-exit-contract, overlay, evidence-closure, records]
requires: []
provides:
  - DEBT-03 and DEBT-04 closed on evidence
key-files:
  modified:
    - .planning/milestones/v0.9-phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-VERIFICATION.md
    - .planning/milestones/v0.9-phases/60-steam-overlay-in-bridged-games-on-macos/60-VERIFICATION.md
    - .planning/milestones/v0.9-MILESTONE-AUDIT.md
    - .planning/REQUIREMENTS.md
decisions:
  - No new live runs (D-01); original record text kept, resolved-by notes appended (D-02)
metrics:
  completed: 2026-11-16
---

# Phase 77 Plan 02: DEBT-03/04 evidence closure Summary

DEBT-03 (56 WR-02) and DEBT-04 (60 WR-01) closed on evidence: covering tests re-run, D-03 spawn-bypass check ran with no bypass, stale v0.9 records annotated with commit hashes, requirements ticked.

## Fix commits cited

- 4f41cfab7 fix(56): WR-02 release the event loop from the stage listing children
- 0d5742ed3 feat(66.2-10): bounded listings on the process runner
- 2d3f1f5e8 fix(60): WR-01 close the overlay when its publisher helper is provably gone
- 1ba023f7f docs(60): record WR-01 live spot-check pass

Docs commit: see `git log` for "docs(77): close DEBT-03/04 on evidence and annotate the v0.9 records".

## D-03 check ran: no bypass

`grep -rnE "child_process|execFile\(|execFileSync\(|spawn\(|spawnSync\(|\bexec\(" src/backend --include='*.ts'` (non-test), classified:

- Runtime owner (allowed): `src/backend/process/runner.ts` (import line 18; spawnSync line 67; spawn lines 156, 306, 372).
- Test utility, not runtime: `src/backend/testUtils/childBackedRunner.ts:54`.
- Comment-only: `spawnAsync.ts:11`, `macArch.ts:6`, `utils/os/processes/index.ts:9`, `sidecar/installFlowRegistration.ts:617`, `sidecar/wineToolsFlowRegistration.ts:164,445`, `sidecar/steamAuthFlowRegistration.ts:104`, `bridge/helperRegistry.ts:64`, `process/registry.ts:12`, `process/runner.ts:4`, `utils/compatibility_layers.ts:36,41`.
- All remaining hits are `RegExp.exec(...)` (not process spawns).
- Runtime bypass: none.

Timer/watcher/socket scan over the named files: `appShellFlowRegistration.ts:301` uses the injected clock with clear on re-arm and stop; `:664` is `.unref()`'d; `humbleLoginFlowRegistration.ts:447,479` are short one-shot smoke-gate timers (0 ms and 2 s), not long-lived. No ref'd handle held at stdin EOF found.

## Test results

| Suite | Result |
| --- | --- |
| runner.test.ts, describe "C-02 WR-01 drain grace and caller capabilities" (13 tests) | PASSED |
| boundedListing.test.ts, describe "contract on the real runner" (7 tests) incl. control and pending-listing exit tests | PASSED |
| meta/__tests__/overlaySignal.test.ts | PASSED (1) |
| meta/__tests__/overlayInputSmoke.test.ts, including both "WR-01:" cases (live publisher never closes; dead publisher closes once) | SKIPPED (whole suite is `describe.skip`: desktop-interactive smoke, needs `GAMELIB_DESKTOP_SMOKE=1`; it warps the cursor and opens windows) |

Combined run: 3 suites passed, 1 skipped; 51 tests passed, 7 skipped, 0 failed. The WR-01 smoke cases did not run and are not counted as passes. DEBT-04 evidence therefore rests on the 2026-11-04 live spot-check (1ba023f7f), the passing overlaySignal test, and the fix still present on main (`publisher_check` x2 and `ESRCH` x2 in `native/steam-bridge/overlay-input/overlay_input.m`).

## Deviations from Plan

None. No bypass found, so no code was written.

## Self-Check: PASSED

Four annotated files committed together; YAML frontmatters of 56-VERIFICATION and the audit parse; original phrases retained; DEBT-02 left Pending. STATE.md and ROADMAP.md untouched.
