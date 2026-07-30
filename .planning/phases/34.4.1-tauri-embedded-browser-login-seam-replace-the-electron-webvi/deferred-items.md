# Deferred Items

Out-of-scope discoveries logged here per the executor's scope-boundary rule (only auto-fix
issues directly caused by the current task's changes).

## Plan 15 — `depot.test.ts` full-suite-only flake (2026-07-30)

- **Found during:** Plan 15's `npm run test:ci` verification run.
- **Symptom:** `src/backend/storeManagers/steam/__tests__/depot.test.ts` — test `D-UAT-06: a
  PERSISTENT CM drop during plan-build exhausts the bounded retry and resolves status error
  (classified, actionable message) — never cancelled, never an unhandled throw` failed once in a
  full `npm run test:ci` run (1 failed / 3350 passed / 3351 total).
- **Isolation check performed** (per project memory `flake-baselines-can-be-undiagnosed-bugs` —
  never accept a baseline flake without running the single-file repro first): `npx jest
  src/backend/storeManagers/steam/__tests__/depot.test.ts` in isolation → **106/106 passed**,
  including this exact test.
- **Scope:** `src/backend/storeManagers/steam/depot.ts` and its test file are entirely outside
  this plan's `files_modified` (`src-tauri/src/main.rs`,
  `src/common/types/sidecarTransport.ts`, `src/backend/humble/loginWindowSeam.ts`,
  `src/backend/sidecar/humbleLoginFlowRegistration.ts`,
  `src/backend/sidecar/__tests__/humbleLoginFlows.test.ts`, plus the three out-of-scope
  interface-completeness follow-throughs listed in this plan's SUMMARY). Not fixed here per the
  scope-boundary rule.
- **Disposition:** logged, not fixed. A future session touching `depot.test.ts` or its
  suite-ordering/timing assumptions should re-run this repro before assuming it is unrelated.
