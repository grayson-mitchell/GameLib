---
phase: quick-260919-tms
plan: 01
subsystem: frontend
tags: [react, eos-overlay, callOrDeclare, tauri-ipc, guard-test, todo-correction]

requires:
  - phase: 34.5-48
    provides: "callOrDeclare() and the DECLARED_UNAVAILABLE_MARKER contract in declaredUnavailable.ts"
provides:
  - "GameSubMenu's 5 EOS window.api.* call sites wrapped in callOrDeclare (D-03)"
  - "Shared EOS_FEATURE export in declaredUnavailable.ts, out of i18n gate scope"
  - "GameSubMenuEosDeclineCallSiteGuard.test.ts, a GameSubMenu-scoped sibling to AdvancedSettings' guard"
  - "Corrected, closed todo at .planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md"
affects: [gamesubmenu, declared-unavailable, eos-overlay, i18n-gate]

tech-stack:
  added: []
  patterns:
    - "Whitespace-tolerant call-site regex (window\\.api\\s*\\.\\s*(<channel>)) for a Prettier method-chain break, proven by a dedicated self-test"
    - "Shared feature/deferral display constants centralized in declaredUnavailable.ts to stay out of meta/i18nGateScope.json-scoped files"

key-files:
  created:
    - src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts
  modified:
    - src/frontend/helpers/declaredUnavailable.ts
    - src/frontend/screens/Game/GameSubMenu/index.tsx
    - .planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md (moved from pending/)

key-decisions:
  - "New separately-named sibling guard (GameSubMenuEosDeclineCallSiteGuard.test.ts) instead of editing AdvancedSettings' EosDeclineCallSiteGuard.test.ts, whose componentPath hard-binds it to AdvancedSettings/index.tsx and made the source todo's own discharge instruction unbuildable."
  - "EOS_FEATURE exported from declaredUnavailable.ts rather than declared locally in GameSubMenu, because GameSubMenu/index.tsx is in meta/i18nGateScope.json and a local two-word string constant there is a blocking hardcoded-string gate violation."
  - "No eosOverlayUnavailable UI state or visible decline text added to GameSubMenu (unlike AdvancedSettings) -- deliberately declined scope, recorded in the closed todo for a future task to pick up if wanted."

requirements-completed:
  - TODO-2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux

duration: ~15min
completed: 2026-09-19
---

# Quick Task 260919-tms: Wrap GameSubMenu's 5 EOS Overlay Call Sites Summary

**GameSubMenu's five `window.api.*` EOS overlay calls now route through `callOrDeclare` (D-03), so a Tauri rejection writes one durable `gamelib.log` line and releases the "refreshing" spinner instead of silently sticking, closing a todo that had undercounted its own scope by two call sites.**

## Performance

- **Duration:** ~15 min (commits span 2026-09-19T21:32:47-07:00 to 2026-09-19T21:39:18-07:00, plus exploration/verification before and after)
- **Tasks:** 3/3 completed
- **Files modified:** 3 (1 created, 2 modified) + 1 todo moved and rewritten

## Accomplishments

- Wrote and captured a REAL pre-edit RED for a new GameSubMenu-scoped guard test before touching any source file.
- Wrapped all 5 EOS `window.api.*` call sites in `callOrDeclare`, releasing the "refreshing" spinner on every `!result.ok` decline path.
- Corrected four false claims and one unbuildable instruction in the source todo, then closed it.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the GameSubMenu-scoped EOS call-site guard, and capture its RED** - `0737cf724` (test)
2. **Task 2: Export EOS_FEATURE and wrap all 5 GameSubMenu EOS call sites** - `c612680ab` (feat)
3. **Task 3: Correct the source todo and move it to completed/** - `6ca059cb2` (docs)

_No plan metadata commit in this run — the orchestrator owns that commit separately for quick tasks (SUMMARY.md/STATE.md are explicitly excluded from executor commits per this run's constraints)._

## Files Created/Modified

- `src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts` - New source-text structural gate, scoped to GameSubMenu/index.tsx alone, with a whitespace-tolerant regex and a self-test proving the tolerance
- `src/frontend/helpers/declaredUnavailable.ts` - Added `export const EOS_FEATURE = 'EOS Overlay'`, extending the existing SteamGridDB/winetricks doc comment
- `src/frontend/screens/Game/GameSubMenu/index.tsx` - Added the `callOrDeclare`/`DEFERRAL_D03`/`EOS_FEATURE` import; rewrote `handleEosOverlay()` and the `useEffect` `isEosOverlayEnabled` probe so all 5 EOS calls are `callOrDeclare` thunks with spinner-release on decline
- `.planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md` - Moved from `pending/`; corrected call-site count (3->5), stale line numbers, deferral id, the unbuildable discharge condition, and added `status: completed`/`resolved`/`resolved_by`

## Decisions Made

- **Separately-named sibling guard, not a shared-total edit.** The source todo's own discharge condition ("update `EosDeclineCallSiteGuard.test.ts`'s anchor to reflect the new total across both files") was unbuildable: that guard's `componentPath = join(__dirname, '..', 'index.tsx')` hard-binds it to `AdvancedSettings/index.tsx`, and 5 of its 6 assertions are AdvancedSettings-specific (`eosOverlayUnavailable`, `getMainEosText()`, `window.api.abort`). Discharged instead with `GameSubMenuEosDeclineCallSiteGuard.test.ts`, leaving `EXPECTED_EOS_CALL_SITES = 11` on the original guard untouched.
- **`EOS_FEATURE` centralized in `declaredUnavailable.ts`, not declared locally in GameSubMenu.** `GameSubMenu/index.tsx` is listed in `meta/i18nGateScope.json` (unlike `AdvancedSettings/index.tsx`, which is not and keeps its own local duplicate). A local `const EOS_FEATURE = 'EOS Overlay'` inside GameSubMenu would fail `isTechnicalToken()`'s single-word-camelCase exemption and be flagged as a blocking hardcoded-string violation.
- **Pinned exact counts (5 call sites, 6 spinner releases), not an inequality**, in the new guard's spinner-release assertion, since the post-edit shape made an exact number honest and an inequality would have passed even against the unfixed pre-edit source (a vacuity risk explicitly called out in the plan).
- **No `eosOverlayUnavailable` UI state added to GameSubMenu.** Deliberately out of scope (C5) -- `EOS_FEATURE` only ever reaches `callOrDeclare`'s internal `window.api.logError` line, never rendered. Recorded in the closed todo as a future, separate todo if wanted.

## Deviations from Plan

**None** - plan executed exactly as written, including the C6 `git mv`-then-edit ordering. One process note worth recording for future executors: the first attempt to stage the corrected `completed/` file used a single `git add <completed-path> <pending-path>` command; because the `pending/` path no longer existed on disk (already removed by `git mv`), the whole `git add` invocation failed atomically with `fatal: pathspec ... did not match any files` and staged nothing from that call -- silently leaving the index holding the `git mv`-carried HEAD (pre-edit, `status: pending`) content instead of the corrected working-tree content. This was the C6 trap manifesting through a different mechanism (a failed multi-path `git add`, not `git mv` itself) and was caught immediately by the plan's own mandated verification step (`git diff --cached -- .planning/todos/completed/...`), which showed the stale "three EOS overlay call sites" title still in the index. Fixed by re-running `git add` with only the `completed/` path, then re-verifying by content before committing. No commit was made with the wrong content at any point.

Separately, two literal `D-08` substrings in the "what was corrected" prose (naming the original report's wrong deferral id, so a future reader would know exactly what was wrong) tripped the Task 3 automated verification's `! grep -q 'D-08'` check, which requires the corrected file to be entirely free of the string. Rephrased both occurrences to describe the original error without repeating the literal wrong id (e.g. "the original report misnamed this id" / "a different, incorrect single-digit deferral id") -- the correction's substance (D-03 is the real id) is preserved without the banned substring.

## Verification Evidence

### Step 1 (Task 1): Pre-edit RED, verbatim

Captured by running `npx jest --selectProjects Frontend --runInBand src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts` against the untouched pre-edit source:

```
npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
Running one project: Frontend
FAIL Frontend src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts
  GameSubMenu EOS decline call-site gate
    ✓ non-vacuity anchor: exactly EXPECTED_EOS_CALL_SITES EOS call sites exist, and that is greater than zero (1 ms)
    ✕ every EOS call site is the call thunk of a callOrDeclare(...) invocation
    ✕ imports callOrDeclare from frontend/helpers/declaredUnavailable
    ✕ every decline branch that owns the "refreshing" spinner releases it on the not-ok path (C4)
    self-test (anti-vacuity, RED-proof precursors)
      ✓ the non-vacuity anchor fires on a synthetic source with one call site renamed away (1 ms)
      ✓ the call-site invariant fires on a synthetic bare, unwrapped EOS call
      ✓ the whitespace-tolerant regex matches a Prettier method-chain break, proving C3

  ● GameSubMenu EOS decline call-site gate › every EOS call site is the call thunk of a callOrDeclare(...) invocation

    expect(received).toContain(expected) // indexOf

    Expected substring: "callOrDeclare("
    Received string:    "EditGameDialog gameInfo={gameInfo} backdropClick={() => showDialogModal({ showDialog: false })} /> ) }) } async function handleEosOverlay() { setEosOverlayRefresh(true) if (eosOverlayEnabled) { await "

      105 |       const windowStart = Math.max(0, index - CALL_SITE_WINDOW)
      106 |       const preceding = collapsed.slice(windowStart, index)
    > 107 |       expect(preceding).toContain('callOrDeclare(')
          |                         ^
      108 |     }
      109 |   })
      110 |

      at Object.<anonymous> (src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts:107:25)

  ● GameSubMenu EOS decline call-site gate › imports callOrDeclare from frontend/helpers/declaredUnavailable

    expect(received).toMatch(expected)

    Expected pattern: /import \{[^}]*\bcallOrDeclare\b[^}]*\} from 'frontend\/helpers\/declaredUnavailable'/
    Received string:  (full collapsed pre-edit source of GameSubMenu/index.tsx -- no "callOrDeclare" import present)

      112 |     const importPattern =
      113 |       /import \{[^}]*\bcallOrDeclare\b[^}]*\} from 'frontend\/helpers\/declaredUnavailable'/
    > 114 |     expect(collapsed).toMatch(importPattern)
          |                       ^
      115 |   })
      116 |
      117 |   it('every decline branch that owns the "refreshing" spinner releases it on the not-ok path (C4)', () => {

      at Object.<anonymous> (src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts:114:23)

  ● GameSubMenu EOS decline call-site gate › every decline branch that owns the "refreshing" spinner releases it on the not-ok path (C4)

    expect(received).toBe(expected) // Object.is equality

    Expected: 5
    Received: 0

      121 |       collapsed.match(/setEosOverlayRefresh\(false\)/g) ?? []
      122 |     ).length
    > 123 |     expect(callOrDeclareCount).toBe(EXPECTED_EOS_CALL_SITES)
          |                                ^
      124 |     // One fewer than the call-site count: the isEosOverlayEnabled probe owns no spinner.
      125 |     expect(callOrDeclareCount - 1).toBe(EXPECTED_EOS_CALL_SITES - 1)
      126 |     expect(spinnerReleaseCount).toBe(EXPECTED_SPINNER_RELEASES)

      at Object.<anonymous> (src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts:123:32)

Test Suites: 1 failed, 1 total
Tests:       3 failed, 4 passed, 7 total
Snapshots:   0 total
Time:        0.184 s, estimated 1 s
Ran all test suites matching /src\/frontend\/screens\/Game\/GameSubMenu\/__tests__\/GameSubMenuEosDeclineCallSiteGuard.test.ts/i.
```

(The import-assertion failure's "Received string" was the entire collapsed pre-edit component source, ~10,500 characters, with no `callOrDeclare` import substring anywhere in it; elided here for length but reproducible by re-running the command against commit `318817a88`.)

### Step 1 (post-edit), Step 2, and Step 7: GREEN suite/test counts

- **Step 1** (`GameSubMenuEosDeclineCallSiteGuard.test.ts` alone, post-edit): included in the Step 2 run below — PASS, part of 4 suites / 31 tests.
- **Step 2** (the new guard + the three neighbouring guards, unchanged): `npx jest --selectProjects Frontend --runInBand src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts src/frontend/screens/Settings/sections/AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts src/frontend/helpers/__tests__/DeferredChannelCallSiteGuard.test.ts src/frontend/helpers/__tests__/declaredUnavailable.test.ts` →
  ```
  Test Suites: 4 passed, 4 total
  Tests:       31 passed, 31 total
  ```
- **Step 7** (full Frontend project, proving nothing else regressed): `npx jest --selectProjects Frontend --runInBand` →
  ```
  Test Suites: 167 passed, 167 total
  Tests:       2660 passed, 2660 total
  ```
  (167 suites / 2660 tests, exactly +1 suite / +7 tests over the pre-existing baseline, matching the one new guard file added.)

### Step 3: Meta hardcoded-string/i18n gates

`npx jest --selectProjects Meta --runInBand meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/genI18nGateScope.test.ts` →
```
Test Suites: 2 passed, 2 total
Tests:       1 skipped, 177 passed, 178 total
```
Zero hardcoded-string/i18n violations across the whole committed scope, including `GameSubMenu/index.tsx`.

### Step 4: `pnpm codecheck`

`tsc --noEmit` exited 0 with no output — clean.

### Step 5: `pnpm lint` (both ceilings, verbatim summary lines)

```
✖ 1119 problems (0 errors, 1119 warnings)   <- production scope, SRC_CEILING = 1124
✖ 638 problems (0 errors, 638 warnings)     <- tests scope, TESTS_CEILING = 638
production: PASS | tests: PASS
```
Exit code 0. Neither ceiling was raised; the tests-scope count landed exactly at the existing, unchanged ceiling (638), and production landed 5 under its ceiling (1119 of 1124).

### Step 6: `pnpm planning-gates`

```
11/11 planning gates passed.
```
Exit code 0, including `.planning/todos/todo-frontmatter-gate.py` and `.planning/planning-frontmatter-gate.py` against the corrected, moved todo.

## What Was NOT Verified

**Nothing about this fix was exercised live.** The EOS overlay menu item in `GameSubMenu/index.tsx` renders only under `isLinux && runner === 'legendary'` (`{isLinux && runner === 'legendary' && (...)}`), and this entire plan was executed on a macOS machine. There was no live click-through of the "Enable/Disable EOS Overlay" button, no live install-confirmation dialog interaction, and no observation of `gamelib.log` receiving a real `[GAMELIB_DECLARED_UNAVAILABLE]` line from these five call sites.

The spinner-release and logging behaviour is proven **structurally**, by two independent things:
1. The new guard's source-text assertions (`GameSubMenuEosDeclineCallSiteGuard.test.ts`), which read the real, committed source and assert the call-site/wrapper/spinner-release shape directly.
2. `callOrDeclare`'s own unit-tested contract (`declaredUnavailable.test.ts`, unchanged and still passing) that it never throws and always resolves a discriminated `{ok, ...}` result.

A structural pass is not a live pass. If a Linux machine becomes available, a live click-through of both the Enable and Disable paths (including the "not installed, install now?" dialog's Yes/No branches) with the sidecar's EOS channels deliberately failing would be the first live verification this fix has ever received.

## Not Run Here

Per the plan's own scope: the backend/common/preload jest projects (untouched by this plan) and `pnpm test:ci` as a whole were not run in this execution — the orchestrator re-runs gates independently.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced by this plan's changes.

## Threat Flags

None. This plan's edits are confined to the two file paths and the todo move the plan's `<files_modified>` frontmatter declared; no new network endpoint, auth path, file-access pattern, or schema change at a trust boundary was introduced. The plan's own `<threat_model>` (T-tms-01 through T-tms-03, informational disclosure / DoS / repudiation, all `mitigate`, all inherited from `callOrDeclare`'s existing contract) fully covers the surface touched.

## Self-Check

- `test -f src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts` → FOUND
- `test -f src/frontend/helpers/declaredUnavailable.ts` → FOUND (grep confirms `export const EOS_FEATURE`)
- `test -f src/frontend/screens/Game/GameSubMenu/index.tsx` → FOUND (grep confirms 5x `callOrDeclare(`)
- `test -f .planning/todos/completed/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md` → FOUND
- `test ! -f .planning/todos/pending/2026-08-25-eos-overlay-gamesubmenu-bypasses-callordeclare-on-linux.md` → CONFIRMED ABSENT
- `git log --oneline --all | grep 0737cf7` → FOUND
- `git log --oneline --all | grep c612680` → FOUND
- `git log --oneline --all | grep 6ca059c` → FOUND

## Self-Check: PASSED
