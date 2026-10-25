---
phase: quick-261026-avw
plan: 01
subsystem: known-fixes
tags: [known-fixes, steam, fetcher, uninstall]
requires: [quick 261025-vnf]
provides: [fetchRemoteKnownFixes, known-fixes-README]
affects: [downloadmanager install flow, uninstaller]
key-files:
  created:
    - src/backend/knownFixesFetcher.ts
    - src/backend/__tests__/knownFixesFetcher.test.ts
    - src/backend/utils/__tests__/uninstaller.test.ts
    - .planning/quick/261026-avw-gamelib-known-fixes-repo-fetcher-downloa/known-fixes-README.md
  modified:
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts
    - src/backend/utils/uninstaller.ts
    - .planning/todos/completed/2026-10-24-gamelib-own-known-fixes-repo-for-steam-and-complex-fixes.md
decisions:
  - Filter at write AND at read (recorded in the fetcher docstring)
  - README key-list jest test skipped deliberately; one-off node check proved verbatim list
duration: ~15m
completed: 2026-10-26
---

# Quick 261026-avw: GameLib-first known-fixes fetcher

Install-time known-fixes fetch now tries `grayson-mitchell/known-fixes` first for every store, falls back to Heroic's feed only on a GameLib 404 for epic/gog/amazon, and no longer skips Steam; `removeFixFile` covers Steam.

## Commits

- 0cf81f42c test: failing fetcher tests (RED)
- 5523927c1 feat: knownFixesFetcher module (GREEN)
- 5654d0243 feat: downloadFixesFor wired to fetcher; removeFixFile covers Steam; uninstaller tests
- ebc8b48df docs: todo moved to completed with closure note

## Behavior

- 404 continues to next source; throw/5xx/403/malformed/non-object stops with no write, no delete, no fallback.
- Stale downloaded file deleted only when every applicable source answers 404.
- Bodies filtered through `filterTier1KnownFixes` before atomic write (`.tmp-<pid>` + rename).
- Containment guard: dest must be a direct child of fixesPath; sideload (no store dir) is skipped.
- `downloadFixesFor` is fire-and-forget with `.catch`; fetcher never rejects.

## Verification

- jest (fetcher, knownFixes, knownFixesLayered, steamBridgeKnownFixes, downloadmanager utils, uninstaller): 6 suites, 156 tests pass.
- `npx tsc --noEmit` clean; prettier clean on all six src paths; `pnpm planning-gates` 12/12; grep checks in Task 2 done-criteria print nothing; `graphify update .` run.

## Deviations from Plan

- [Rule 3] The downloadmanager test file has `resetMocks: true`, so the fetcher mock's resolved value is re-applied in the file-scope `beforeEach` (first run failed 18 tests with `undefined.catch` before this).
- The RED commit was initially rejected by the husky prettier hook; formatted and recommitted (no `--no-verify`).
- Plan's Task 3 verify omitted prettier for `.planning` paths (ignored), as planned.

## Pending (orchestrator)

- README push to `grayson-mitchell/known-fixes` not done (per constraints). The README and the todo closure note say "pending".
- `known-fixes-README.md` and this SUMMARY are untracked in the quick dir (orchestrator docs commit).

## Known Stubs

None.

## Self-Check: PASSED
