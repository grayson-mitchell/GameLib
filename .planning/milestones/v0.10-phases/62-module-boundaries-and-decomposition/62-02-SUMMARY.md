---
phase: 62-module-boundaries-and-decomposition
plan: 02
subsystem: testing
tags: [eslint, no-restricted-syntax, ratchet, runner-literals]
requires: []
provides:
  - meta/runnerLiteralSelectors.cjs (single source of selectors, STORE_LITERALS, scope and ignore globs)
  - meta/boundaryRatchet.cjs (equality-ceiling ratchet via ESLint Node API, --list)
affects: [62-13, 62-14..62-19, 62-20]
tech-stack:
  added: []
  patterns: ["equality ceiling: count above AND below the ceiling both fail"]
key-files:
  created:
    - meta/runnerLiteralSelectors.cjs
    - meta/boundaryRatchet.cjs
    - meta/__tests__/runnerLiteralSelectors.test.ts
    - meta/__tests__/boundaryRatchet.test.ts
  modified: []
key-decisions:
  - "NAME_DENYLIST is empty: no false positive found while measuring"
  - "ChainExpression handled (a?.runner) via .expression.property.name in the name matcher"
requirements-completed: [D-13, D-14, D-04, D-03]
duration: ~20min
completed: 2026-11-06
---

# Phase 62 Plan 02: runner-literal ratchet Summary

**An ESLint AST selector set (===, !==, ==, !=, switch, array .includes) bans store literals compared to runner/store-named values, held by a both-direction ceiling: FRONTEND_CEILING 136, BACKEND_CEILING 65.**

## Measured numbers (ratified selector, non-test, storeManagers excluded)
- Frontend: 136 sites in 448 files (FRONTEND_MIN_FILES 224)
- Backend: 65 sites in 231 files (BACKEND_MIN_FILES 115)
- Total 201; `--list` agrees. These replace the plan's estimates (127/61) for 62-13 and 62-14..62-19.

Frontend per directory: screens 110 (Game 43, Library 27, Settings 12, ConsoleMode 11, WebView 10, DownloadManager 4, Humble 2, Login 1), state 10, helpers 7, hooks 5, components 4.
Backend per directory: downloadmanager 16, launcher 14, sidecar 8, wiki_game_info 6, utils 4, gamedetails 4, shortcuts 3, protocol 3, tools 2, signInProbe 2, crossover_index 2, save_sync 1.

Known real sites confirmed in `--list`: downloadqueue.ts:344, GlobalState.tsx:1255-1257, useTauriOAuthLogin.ts:199/201/341/345, LoginWarning/index.tsx:34. No test or storeManagers path appears.

## Proof
- Selector test: 15 HIT + 14 NON-HIT cases plus literal-list check, all green. One HIT initially failed (`gameInfo?.runner == ...`): optional chaining wraps the member in a ChainExpression; fixed in the selector before any number was recorded.
- Ratchet: ceiling 135 and 137 both exit 1 (reverted); 136/65 exits 0. CLI test arm runs under `createFakeHomeProfile()`; `fakeHomeIsolation.test.ts` 7/7; codecheck, prettier, `pnpm lint` green; `meta/lintScoped.cjs` untouched (SRC 1130 / TESTS 661).
- The `.includes` near-miss was not run as a separate manual revert; the HIT cases for it cover the selector.

## Deviations from Plan
None of substance. The test casts the typescript-eslint parser `as never` to satisfy `tsc` (ESLint's parser type is stricter than the package's).

## Commits
- 36b0ce75b feat(62-02): runner-literal selector module with hit/non-hit test
- 4c4df427c feat(62-02): boundary ratchet with equality ceilings (frontend 136, backend 65)

## Self-Check: PASSED
