---
phase: 39
slug: repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-02
---

# Phase 39 — Validation Strategy

> Per-phase validation contract feedback sampling during execution.
> Derived from `39-RESEARCH.md` `## Validation Architecture` (measured 2026-09-02).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (`ts-jest` preset), 5 projects: `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta` |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `pnpm test --selectProjects Backend` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | quick ~60s · full suite several minutes |

**Project-name hazard (standing project rule):** `--selectProjects` is **case-sensitive and exits 0
on a name it does not recognise** — a typo'd project name is a silent green. Confirm the selector
actually collected the intended suites before reading its exit code as proof.

---

## Sampling Rate

- **After task commit:** `pnpm codecheck` (fast; catches unused-import/type breaks from the seam
  collapse) **plus** the one gate command scoped to that task's requirement —
  `pnpm lint` for REQ-39-01, `python3 meta/runPlanningGates.py` for REQ-39-02,
  `pnpm test --selectProjects Backend` for REQ-39-03.
- **After plan wave / workstream merge:** the full triplet — `pnpm lint`,
  `python3 meta/runPlanningGates.py`, `pnpm test` (full suite, not just Backend: Task 6's test
  rewrite could be collected under a different project — verify it stays in Backend's collection).
- **Before `/gsd:verify-work`:** all three terminal commands green **in the same session, measured
  live**. Standing project rule: a mutating command's own report is never accepted as proof of its
  own effect.
- **Max feedback latency:** ~60 seconds (quick run).

---

## Per-Task Verification Map

Refined against the 9 plans written 2026-09-02. Rows are plan-level; task-level status is tracked
in each PLAN.md.

| Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------|-------------------|-------------|--------|
| 39-01 | 1 | REQ-39-02 | verification-integrity | script gate | `python3 meta/runPlanningGates.py` → preload gate green; **6/7 expected here, not 7/7** | ✅ | ⬜ pending |
| 39-02 | 1 | REQ-39-03 | verification-integrity | unit | `pnpm test --selectProjects Backend` + collected-suite assertion | ✅ | ⬜ pending |
| 39-03 | 2 | REQ-39-03 | verification-integrity | unit | `pnpm test --selectProjects Backend` + collected-suite assertion | ✅ | ⬜ pending |
| 39-04 | 2 | REQ-39-03 | verification-integrity | unit | `pnpm test --selectProjects Backend` + collected-suite assertion | ✅ | ⬜ pending |
| 39-05 | 3 | REQ-39-03 | verification-integrity | unit | `pnpm test --selectProjects Backend` + collected-suite assertion | ✅ | ⬜ pending |
| 39-06 | 4 | REQ-39-03 | verification-integrity | unit | `pnpm test --selectProjects Backend` + collected-suite assertion | ✅ | ⬜ pending |
| 39-07 | 5 | REQ-39-03 | vacuous-pass | source gate | new zero-match predicate gate, **two per-root vacuity controls** + pre-collapse RED proof | ❌ W0 | ⬜ pending |
| 39-08 | 6 | REQ-39-02 | verification-integrity | script gate | `python3 meta/runPlanningGates.py` → `7/7 planning gates passed.`, exit 0 | ✅ | ⬜ pending |
| 39-09 | 7 | REQ-39-01 | ratchet-above-true-count | lint gate | `pnpm lint` → exit 0; `--max-warnings N` present **and proven to bite at N-1** | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Why 39-01 lands at 6/7, deliberately.** `seam-parity-sweep-gate.py` carries `EXPECTED_AXIS_A_SITES`,
a floor listing eight `getLoginWindowSeam()` call sites that REQ-39-03 deletes seven of. Repairing
that gate in wave 1 would make it pass and then this phase's own collapse would break it again — a
red that reads as a regression the collapse introduced. Its disposition is therefore in wave 6,
after the collapse. Do not treat the interim 6/7 as a failure.

**`pnpm codecheck` is `tsc --noEmit` and says nothing about lint** (ROADMAP hazard 1). It is listed
here only as a compile guard for the seam collapse's removed imports — never as lint evidence.

---

## Wave 0 Requirements

- [ ] New or extended zero-match test — a sibling to `meta/__tests__/isTauriRemoved.test.ts`
      asserting **0 matches** for the seam-predicate family (`seam === null`, `seam !== null`,
      `!seam`, and the local-assignment + optional-chaining forms) under `src/backend/humble` and
      `src/backend/storeManagers`, **with its own vacuity control** proving the search can fail.
      This is WR-01's own prescribed fix and does not yet exist on disk.
- [x] No new test file needed for REQ-39-01 or REQ-39-02 — both verify by re-running existing
      scripts (`pnpm lint`, `python3 meta/runPlanningGates.py`).
- [x] No framework install needed — Jest, ESLint, and Python 3 all confirmed working 2026-09-02.

**Vacuity control is mandatory, not optional.** A grep gate that matches nothing because its
pattern is wrong looks identical to one that matches nothing because the code is clean. This
project has recorded that failure four times.

---

## Terminal Acceptance — REQ-39-01 restated

`pnpm lint` **already exits 0** as of 2026-09-02 (0 errors, 4190 warnings), before any code change.
The honest acceptance is therefore not "drive it to 0" but:

1. `pnpm lint` **continues** to exit 0 after the seam collapse lands.
2. A `--max-warnings` ratchet is present, set to the **freshly re-measured** count.
   **Do not hardcode 4190** — that figure is pre-seam-collapse; re-measure after Workstream 3.
3. **A zero-warning bar is not a realistic target for this phase.** ~85% of warnings are
   `@typescript-eslint/no-unsafe-*` against `any`-typed Jest mocks. Eliminating them means either
   typing every mock (large, diffuse, outside the scope fence) or suppressing the rule for tests
   (masks genuine `any` bugs in the ~28% of warnings that are production code). The honest target
   is **zero errors plus a documented, ratcheted warning count**.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gate 1 clears fully after the re-point | REQ-39-02 | The current failure is an unhandled `FileNotFoundError`, not the gate's own `fail()` — nothing downstream of `parse_electron_stub_safestorage()` has executed against the live tree since the `git mv`. A passing path edit does not prove a passing gate. | Run `python3 meta/runPlanningGates.py` after the re-point and confirm Gate 1 reaches a verdict rather than crashing. Do not mark the task done on the edit alone. |

*All other phase behaviors have automated verification.*
