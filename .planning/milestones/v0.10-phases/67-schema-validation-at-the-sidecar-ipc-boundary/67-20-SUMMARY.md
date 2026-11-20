---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 20
subsystem: ipc
tags: [ipc, verification, gate, decision-audit]
requires: [67-19]
provides: [phase-67-gate-results]
key-files:
  created: []
  modified: []
decisions:
  - "Phase 67 gate passes: all 8 test:ci failures are pre-existing and none touch phase 67 files; operator live check approved."
metrics:
  completed: 2026-11-08
requirements: [V67-A, V67-B, V67-C, V67-D, V67-E, V67-F]
---

# Phase 67 Plan 20: Phase gate and operator live check

Verification-only plan. Task 1 (automated gate) produced no commit. Task 2 (operator live check, checkpoint:human-verify) was answered by the operator with: "approved".

## Gate results
- `codecheck`: green (tsc --noEmit, both tsconfigs).
- `test:ci`: 19705 passed, 8 failed, 17 skipped. All 8 failures (7 suites) are pre-existing; none is a phase 67 regression (evidence below).
- `check:ipc-contract`: up to date. `cargo test --bin gamelib-shell`: 429 passed, 0 failed, 2 ignored.
- `build:sidecar`: build/main/sidecar.js written 08:34, after the last commit (08:26). `smoke:sidecar`: PASS (READY, exit 0 at stdin EOF).
- `clippyRatchet`: CI-only (needs clippy JSON); not run locally.
- `graphify update`: done. Working tree clean.

## Pre-existing failures
| Suite | Failure | Evidence it is not phase 67 |
|---|---|---|
| steam games.test.ts | channel constants | unrelated to ipc schemas |
| bottle.test.ts | DRM_LAUNCH_FORM vs 56-01-SUMMARY | phase 56 contract |
| macArchKnownFixRouting | Intel never seeds | unrelated |
| logSecretGate (x2) | uninstaller.ts:131 logs result.stderr | file untouched by phase 67 |
| tauriShellSource | `.title(format!` over store_embed.rs | call present at base 6b2e4815d |
| genI18nGateScope A-17 | NoticeStack derivation | phase 67 touches neither side |
| x86CallbackWineHarness | "fake helper saw HELLO, one 168 drain and CBDISP 168/3/0" | fails alone twice on the phase tree; a scratch worktree of base 6b2e4815d with `.build-tools` symlinked fails identically (Received [2,6,10]; 1 failed, 11 passed). An earlier base pass was a false pass (test skips without .build-tools/zig). Scratch worktree removed. |

## Decision audit
| Decision | Result | Basis |
|---|---|---|
| D-01 | pass | zod 4.6.7 (grep) |
| D-02 | pass | `zod/v3` grep empty |
| D-03 | deferred | deferred by CONTEXT; ROADMAP edit is not a phase 67 plan |
| D-04 | pass | no `interface *Sync/Async/FrontendMessages {` under src/common/types/ipc |
| D-05/D-06 | pass | strict objects with cheap invariants, src/common/types/ipc/*.ts (artifacts) |
| D-07 | pass | 7 `phase70Passthrough(` matches |
| D-08/09/10 | pass | src/backend/sidecar/ipcValidation.ts (artifacts) |
| D-11 | pass | validation in the dispatch funnel (artifacts) |
| D-12 | pass | FrontendMessages schemas in src/common/types/ipc |
| D-13 | pass | rustInvoke.ts + generated structs |
| D-14 | pass | RENDERER_CHANNELS allow-list in the Rust relay (67-19) |
| D-15/D-20 | pass | ipcSchemaCoverage.test.ts `toEqual([])` at lines 126 and 139 |
| D-16 | pass | meta/genIpcContract.ts -> src-tauri/src/ipc_contract.rs |
| D-17 | pass | no `transport-mirror` in src-tauri/src; transportParity.test.ts absent |
| D-18 | DEPARTURE (intentional, D-04/D-17) | only Rust is generated; src-tauri/src/ipc_contract.rs is the phase's generated file. check:ipc-contract wired at .github/workflows/codecheck.yml:30 and .husky/pre-commit:50 |
| D-19 | pass | ordering (artifacts) |

## Deviations from Plan
Orchestrator-applied fixes during the phase:
- d3246efb0 `test(67)`: repaired testContainment classification and steamFocusRefreshWire T-A after 67-02/67-03.
- 0a3a6df72 `fix(67-19)`: renamed relay_commands.rs `mod tests` to `mod relay_allow_list_tests` (a bare `mod tests {` in a module sorted before store_embed.rs truncated productionCode() for 4 source pins).
- Phase execution moved to this worktree after 67-02 because a concurrent phase-65 session was committing to main.

## Operator response
"approved"

## Self-Check: PASSED
