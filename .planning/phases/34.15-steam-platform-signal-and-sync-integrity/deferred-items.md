# Deferred items — Phase 34.15 Plan 09 reconciliation

Logged per the SCOPE BOUNDARY rule: out-of-scope discoveries are recorded here, not fixed.

## `eslint --cache .` — 51 pre-existing errors, 3768 pre-existing warnings, project-wide

Run 2026-08-16 as part of Plan 09's Task 1 lint step. **Zero** of the 51 errors and **zero** of
the warnings fall in any file this phase (34.15, Plans 01-09) created or modified — verified by
cross-referencing the full list of every file touched across all nine plans' SUMMARY.md
`key-files` sections against every file path eslint reported an error or warning for. None
overlap.

All 51 errors and every warning live in files this phase never opened, spanning `meta/`
(`buildSidecarSea.ts`, `hardcodedStringGate.ts`, `lintTranslations.ts`, `sidecarSeaFsShim.ts`,
two test files), `src/backend/` (`downloadqueue.ts`, `humble/dedup.ts`, `gog/redist.ts`,
`sidecar/electronStub.ts`, `sidecar/handlers.ts`, `sidecar/humbleFlowRegistration.ts`,
`sidecar/steamFlowRegistration.ts`, `sidecar/storeWriteHandlers.ts`, and roughly a dozen
`sidecar/__tests__/*.ts` files), and `src/preload/` (`api/misc.ts`,
`__tests__/framelessRuntime.test.ts` — the one file with a real `error`-severity
`no-this-alias` finding, not merely a warning — plus five other preload test files carrying only
`no-unsafe-*`/`no-floating-promises`/`require-await` warnings).

Not fixed, per this project's own scope-boundary rule ("Only auto-fix issues DIRECTLY caused by
the current task's changes"). Recorded here rather than silently ignored so a future reader does
not mistake this reconciliation plan's lint run as having missed them.

**Full lint output preserved at** `/tmp/lint-out.log` for this session only (not committed;
regenerate with `npx eslint --cache .` if needed for triage).
