---
phase: 35-electron-cutover-remove-the-electron-build
plan: 22
subsystem: ui
tags: [tauri, preload, i18n, react, logout, platform-detection]

# Dependency graph
requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "35-REVIEW.md's CR-03/CR-04 findings, plan 35-09's fatal-Epic-logout throw, the existing showDialogModal/ContextProvider house dialog pattern"
provides:
  - "A three-arm, single-sourced window.platform derivation (darwin/win32/linux) so the shipped NSIS build no longer falls through to 'linux'"
  - "Two new gamelib.json keys (login.logoutFailedTitle, login.logoutFailedMessage) for plan 35-29 to reference"
  - "A failed Epic logout now reaches gamelib.log via window.api.logError and raises a user-visible ERROR dialog, with console.error fully removed from the path"
  - "src/preload/index.ts deleted (dead code, verified zero real importers)"
affects: [35-23, 35-29]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-signal never-throw platform predicates in platformDetect.ts (navigator.platform OR navigator.userAgent), single-sourced for every window.platform-branching consumer"
    - "A failed security-relevant action (logout) must route through window.api.logError (sidecar log sink) AND showDialogModal (user-visible), never bare console.* under Tauri"

key-files:
  created:
    - src/frontend/screens/Login/components/Runner/__tests__/logoutFailureSurface.test.tsx
  modified:
    - src/preload/platformDetect.ts
    - src/preload/tauriAttach.ts
    - src/preload/__tests__/tauriAttach.test.ts
    - src/frontend/screens/Login/components/Runner/index.tsx
    - src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx
    - public/locales/en/gamelib.json
    - .unimportedrc.json
  deleted:
    - src/preload/index.ts

key-decisions:
  - "src/preload/index.ts deleted outright (not just re-labelled) — its own header already admitted it was never loaded by the Tauri webview, and a grep across src/, meta/, and config/JSON found zero real importers, only descriptive comment mentions"
  - "Used props.class (not props.runner, which RunnerProps does not have) as the logout-failure log identifier, confirmed against real call sites in Login/index.tsx ('epic', 'gog', 'nile', 'zoom', 'steam', 'humble')"
  - "The error text itself is kept out of the dialog body (may carry an internal path or domain list); only the gamelib.log line gets that detail — the dialog uses fixed catalogue strings only"

patterns-established:
  - "isWindowsWebview() alongside isMacWebview() in platformDetect.ts — any future OS-branching predicate belongs there, not re-derived at the call site"

requirements-completed: [REQ-35-07, REQ-35-20]

# Metrics
duration: ~15min
completed: 2026-08-30
---

# Phase 35 Plan 22: CR-03 win32 platform arm + CR-04 renderer-half logout failure surfacing Summary

**`window.platform` now derives a real `'win32'` arm from two independent signals in `platformDetect.ts`, and a failed Epic logout now reaches `gamelib.log` and a user-visible ERROR dialog instead of a renderer `console.error` that Tauri never surfaces anywhere.**

## Performance

- **Duration:** ~15 min (task-commit span 19:03:44+12:00 → 19:11:03+12:00, plus RED-proof reproduction and summary authoring)
- **Started:** 2026-08-30T07:03:44Z
- **Completed:** 2026-08-30T07:17:14Z
- **Tasks:** 3/3
- **Files modified:** 7 (1 created, 5 modified, 1 deleted, plus `.unimportedrc.json`)

## Accomplishments

- CR-03 closed: `window.platform` gains a reachable `'win32'` arm, derived once in `platformDetect.ts` and consumed by `tauriAttach.ts` — no re-inlined predicate.
- CR-04 renderer half closed: `Runner/index.tsx`'s `handleLogout` catch now calls `window.api.logError(...)` (reaches `gamelib.log`) and `showDialogModal({ type: 'ERROR', ... })` (user-visible), with the bare `console.error` fully removed.
- Dead code removed: `src/preload/index.ts` deleted, its only real reference being a stale `.unimportedrc.json` build-scan entry (also removed).
- Two new `gamelib.json` catalogue keys added for the failed-logout dialog, verified absent from `translation.json` and free of `{{count}}`.
- Both RED-proofs reproduced live in this session (not merely referenced from a prior claim) and recorded verbatim below.

## Task Commits

Each task was committed atomically:

1. **Task 1: Derive `win32` in `platformDetect.ts` and consume it from `tauriAttach.ts` (CR-03)** - `f20b90af6` (fix)
2. **Task 2: Add the sign-out-incomplete strings to `gamelib.json`** - `bbbdb92fd` (docs)
3. **Task 3: Route a failed logout to the backend log and a user-visible dialog (CR-04, renderer half)** - `635151971` (fix)

**Plan metadata:** (this commit, made immediately after this SUMMARY)

## Files Created/Modified

- `src/preload/platformDetect.ts` - added `isWindowsWebview()` (never-throw, two-signal: `navigator.platform` `/win/i` OR `navigator.userAgent` contains `Windows`), alongside the existing `isMacWebview()`.
- `src/preload/tauriAttach.ts` - `window.platform` now `isMacWebview() ? 'darwin' : isWindowsWebview() ? 'win32' : 'linux'`; imports `isWindowsWebview` from `platformDetect.ts`.
- `src/preload/index.ts` - **deleted**. See "Disposition of `src/preload/index.ts`" below.
- `.unimportedrc.json` - removed the now-stale `"src/preload/index.ts"` `entry` array item (edited via `python3 json.load`/`json.dump` since the file is compact single-line JSON that the exact-string Edit tool could not match).
- `src/preload/__tests__/tauriAttach.test.ts` - `installWindowStub()` now accepts optional `{platform, userAgent}` overrides; added a `describe('window.platform derivation (CR-03)', ...)` block with 5 new tests (darwin; win32 via `navigator.platform`; win32 via `navigator.userAgent` alone; linux fallback; never-throw when reading `navigator` throws).
- `public/locales/en/gamelib.json` - added `login.logoutFailedTitle` and `login.logoutFailedMessage` (see exact dotted paths below).
- `src/frontend/screens/Login/components/Runner/index.tsx` - `handleLogout`'s catch now calls `window.api.logError(...)` then `showDialogModal({ type: 'ERROR', title: tGamelib('gamelib:login.logoutFailedTitle', ...), message: tGamelib('gamelib:login.logoutFailedMessage', ...) })`; added `useContext(ContextProvider)` for `showDialogModal`; `console.error` removed entirely; `G-30-01` comment updated to name both responsibilities (button release + visibility).
- `src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx` - added a no-op `useContext: () => ({ showDialogModal: jest.fn() })` override to its existing `react` mock (Rule 1 fix — see Deviations).
- `src/frontend/screens/Login/components/Runner/__tests__/logoutFailureSurface.test.tsx` - **new**, 5 tests covering the CR-04 failure surface (logError call, showDialogModal call/keys, button-release guarantee, resolving-path no-op, source gate against `console.error`).

## Dotted paths of the two new `gamelib.json` keys (for plan 35-29)

- `login.logoutFailedTitle` → `"Sign-out incomplete"`
- `login.logoutFailedMessage` → `"Your account was signed out on this device, but the browser session could not be fully cleared. On a shared computer, sign out again or clear your browser data for this site to make sure your session doesn't stay accessible."`

Verified: `grep -c "logoutFailed" public/locales/en/translation.json` → `0`. Neither value contains `{{count}}`. `pnpm lint-translations:gamelib` exits 0 (unrelated pre-existing `ENOENT` stack traces for other locales' missing `gamelib.json` files are noise — process exit code is 0). `pnpm i18n-churn-guard` → `i18n-churn-guard: clean -- no upstream public/locales/ catalog changed.`

## Disposition of `src/preload/index.ts`: DELETED

Justification, re-verified live in this session:

```
$ grep -rn "preload/index" src/ meta/ --include="*.ts" --include="*.tsx" --include="*.json"
src/backend/main_window.ts:9: * sized against `screen.getPrimaryDisplay()` and wired to `build/preload/index.js`. Under
src/backend/platform/__tests__/types.usage.test.ts:459:      preload: '/app/build/preload/index.js'
src/preload/tauriAttach.ts:22: * Deliberately its OWN file, separate from `src/preload/index.ts`: that file's top-level
src/preload/tauriTransport.ts:18: * OR `__TAURI_INTERNALS__` as ground truth) that `ipc.ts`/`misc.ts`/`preload/index.ts`/
```

Every hit is either a comment mentioning the filename descriptively, or an unrelated `build/preload/index.js` build-artifact path string (not an import of the deleted source module). No real importer exists. `.unimportedrc.json`'s `entry` array listed it only as a build-scan entry point, not an actual import-graph edge — that stale entry was removed alongside the deletion. The file's own header already stated the bundle "was never loaded by the Tauri webview at runtime."

## Before/after render decisions for the two named spot-check consumers

- **`src/frontend/screens/Settings/components/EnableFsync.tsx:13`** — `const isLinux = platform === 'linux'`; component returns `<></>` unless `isLinux && !isLinuxNative`. **Before:** on the shipped Windows NSIS build, `platform` fell through to `'linux'`, so `isLinux` was incorrectly `true` and the Linux-only Fsync toggle rendered on Windows. **After:** `platform` correctly resolves to `'win32'`, `isLinux` is `false`, and the toggle is correctly hidden on Windows.
- **`src/frontend/screens/Settings/sections/SyncSaves/index.tsx:15`** — `const isWin = platform === 'win32'`. **Before:** `isWin` could never be `true` on the shipped Windows build (platform always resolved to `'linux'`), so the Windows save-path branch was dead code in production. **After:** `isWin` correctly evaluates `true` on Windows, and that branch is now reachable.

Neither file was modified — both are read-only spot-checks per the plan's `<action>`.

## RED-proof 1 (Task 1, CR-03): `'win32'` cases fail against the pre-fix two-arm expression

Reverted `src/preload/tauriAttach.ts:73` (via `cp` backup + `python3` string-replace, never `git checkout --`) to:
```ts
window.platform = (isMacWebview() ? 'darwin' : 'linux') as NodeJS.Platform
```
Ran `pnpm test --selectProjects Preload -t "window.platform derivation"`:

```
 ● tauriAttach (BLOCKER-1 fix, 27-01) › window.platform derivation (CR-03) › resolves to 'win32' when navigator.platform is 'Win32'

    expect(received).toBe(expected) // Object.is equality

    Expected: "win32"
    Received: "linux"

      141 |       await import('../tauriAttach')
      142 |
    > 143 |       expect(readWindowStub().platform).toBe('win32')
          |                                         ^

 ● tauriAttach (BLOCKER-1 fix, 27-01) › window.platform derivation (CR-03) › resolves to 'win32' from the userAgent signal alone, proving the second signal is live and not decorative

    expect(received).toBe(expected) // Object.is equality

    Expected: "win32"
    Received: "linux"

      152 |       await import('../tauriAttach')
      153 |
    > 154 |       expect(readWindowStub().platform).toBe('win32')
          |                                         ^

Test Suites: 1 failed, 8 skipped, 1 of 9 total
Tests:       2 failed, 139 skipped, 3 passed, 144 total
```

Both `'win32'` cases failed for the right reason (received `'linux'`); the darwin, linux-fallback, and never-throw cases still passed, as expected since the two-arm form only lacks the win32 branch. Restored the fixed file via `cp` from the scratchpad backup; re-ran the same filter afterward — `Tests: 5 passed, 5 total`.

## RED-proof 2 (Task 3, CR-04 renderer half): failure-surface tests fail against the pre-fix `console.error` body

Reverted `src/frontend/screens/Login/components/Runner/index.tsx`'s catch block (via `cp` backup + `python3` string-replace with an `assert` guard, never `git checkout --`) to:
```tsx
} catch (error) {
  console.error('[GameLib] logoutAction failed:', error)
} finally {
```
Ran `pnpm test --selectProjects Frontend -t "Runner: logout failure surface"`:

```
 ● Runner: logout failure surface (Phase 35 gap closure, plan 35-22, CR-04) › a rejecting logoutAction calls window.api.logError exactly once, with the runner identifier in the message

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 1
    Received number of calls: 0

 ● Runner: logout failure surface (Phase 35 gap closure, plan 35-22, CR-04) › a rejecting logoutAction calls showDialogModal exactly once with type ERROR and both new gamelib keys requested from the translator

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 1
    Received number of calls: 0

 ● Runner: logout failure surface (Phase 35 gap closure, plan 35-22, CR-04) › source gate: no console.error remains in the logout failure path

    expect(received).not.toContain(expected) // indexOf

    Expected substring: not "console.error"
    Received string:        "import { useContext, useState } from 'react'
    ...

Test Suites: 1 failed, 130 skipped, 1 of 131 total
Tests:       3 failed, 2097 skipped, 2 passed, 2102 total
```

3 of 5 tests failed for the right reason (logError not called, showDialogModal not called, source gate finding the literal `console.error`). The other 2 tests (button-release guarantee on the rejecting path, and the resolving-path no-op) still passed, correctly — the `finally` block and the resolving branch are unaffected by this specific catch-body change. Restored the fixed file via `cp` from the scratchpad backup; re-ran the same filter afterward — `Tests: 5 passed, 5 total`.

## Decisions Made

- `src/preload/index.ts`: delete outright rather than relabel (see disposition section above).
- Use `props.class` instead of the plan snippet's `props.runner` (which does not exist on `RunnerProps`) as the logout-failure log identifier — confirmed via grep of real call sites.
- Keep the caught error's `String(error)` text confined to the `logError` call; the dialog body uses only the fixed catalogue strings, per the plan's information-disclosure guidance (T-35-110).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing sibling test file broken by adding `useContext` to `Runner/index.tsx`**
- **Found during:** Task 3
- **Issue:** `src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx`'s `jest.mock('react', ...)` spread `actualReact` for everything except its own `useState` override, so the newly-added real `useContext(ContextProvider)` call in `Runner/index.tsx` hit React's real (null, no-render-context) dispatcher and threw, failing 19/20 tests in that file.
- **Fix:** Added `useContext: () => ({ showDialogModal: jest.fn() })` to that file's existing `react` mock, with a comment explaining the scope boundary (that file covers login/logout navigation, not the failure-dialog path — that's `logoutFailureSurface.test.tsx`).
- **Files modified:** `src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx`
- **Verification:** All 20 tests in that file pass after the fix.
- **Committed in:** `635151971` (Task 3 commit)

**2. [Rule 1 - Bug] Self-inflicted acceptance-criteria failure via a literal string inside a comment**
- **Found during:** Task 3 (self-caught before finalizing, no separate commit)
- **Issue:** The first draft of the updated `G-30-01` comment used the backticked literal `` `console.error` `` while explaining why it was removed. This caused both the plan's own acceptance criterion (`grep -c 'console.error' ...` expected `0`) and this plan's own new source-gate test to fail, since neither distinguishes code from comments.
- **Fix:** Reworded the comment to say "console logging" instead of the literal string.
- **Files modified:** `src/frontend/screens/Login/components/Runner/index.tsx`
- **Verification:** `grep -c "console.error" src/frontend/screens/Login/components/Runner/index.tsx` → `0`.
- **Committed in:** `635151971` (Task 3 commit, folded into the same commit since caught pre-commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — one a pre-existing sibling test broken by this plan's own change, one a self-inflicted comment-wording bug caught before commit)
**Impact on plan:** Both fixes necessary for correctness of the test suite and the acceptance criteria themselves. No scope creep — CR-04's backend half (plan 35-23) was not touched.

## Issues Encountered

- `.unimportedrc.json` is a compact single-line JSON file; the `Edit` tool's exact-string match failed against it. Worked around with a `python3 -c` `json.load`/`json.dump` round-trip using `separators=(',', ':')` to preserve the compact format.
- None of the RED-proof reversions left any residue: `git status --short` and `git diff --stat` are both empty after each `cp`-restore, confirmed live in this session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan `35-23` (REQ-35-07, CR-04 backend half) can proceed independently — it owns `legendary/user.ts`'s fatal-logout predicate and was not touched here.
- Plan `35-29`'s criterion-21 re-run can reference the two `gamelib.json` dotted paths recorded above verbatim.
- REQ-35-20 remains Partial — this plan does not perform the blocking live-gate re-run; that is still owned by a later gap-closure plan.

---
*Phase: 35-electron-cutover-remove-the-electron-build*
*Completed: 2026-08-30*
