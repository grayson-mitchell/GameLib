---
phase: quick-261012-ca6
plan: 01
subsystem: shortcuts
tags: [ipc, invoke, sidecar, GameSubMenu, shortcuts]
requires: []
provides:
  - addShortcut/removeShortcut as invoke-kind channels resolving the shortcutsExists predicate after the work settles
  - toggleShortcuts renderer helper
  - removeShortcuts that awaits its deletions
affects: [src/frontend/screens/Game/GameSubMenu, src/backend/sidecar/shortcutsFlowRegistration.ts]
tech-stack:
  added: []
  patterns: ["state set from the sidecar's disk answer, not from the click"]
key-files:
  created:
    - src/frontend/screens/Game/GameSubMenu/shortcutsToggle.ts
    - src/frontend/screens/Game/GameSubMenu/__tests__/shortcutsToggle.test.ts
    - src/backend/shortcuts/__tests__/removeShortcutsOutcome.test.ts
  modified:
    - src/common/types/ipc.ts
    - src/preload/api/menu.ts
    - src/backend/shortcuts/ipc_handler.ts
    - src/backend/sidecar/shortcutsFlowRegistration.ts
    - src/backend/shortcuts/shortcuts/shortcuts.ts
    - src/frontend/screens/Game/GameSubMenu/index.tsx
    - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
    - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/invokeReturnValueSweep.test.ts
    - public/locales/en/translation.json
decisions:
  - "Both channels are invoke-kind and resolve shortcutsExists evaluated after the work settles (option 1 + 2 of the todo)"
  - "removeShortcuts never rejects for a failed deletion; it logs and continues"
metrics:
  tasks: 3
  commits: 2
  files: 14
status: complete
actuals:
  tokens: 60000
  tasks: 3
  commits: 2
plan_head_before: 5d79e61c86a5b0f9e36030b3837592fae4ab149b
plan_head_after: 2716f525e0ca6a922d2b1984447718b89b4dfab7
completed: 2026-10-12
---

# Phase quick-261012-ca6 Plan 01: GameSubMenu shortcuts flip only from the sidecar's disk answer Summary

`addShortcut` and `removeShortcut` are invoke-kind at every layer and resolve whether a shortcut exists on disk after the work has settled; `toggleShortcuts` sets `hasShortcuts` from `result === true` and from nothing else. The todo is moved to `completed/` (move NOT committed, see below).

## Commits

- `f36b7e64f` Task 1 (tracer): channel-kind change end to end, the renderer helper, the pins (11 paths).
- `2716f525e` Task 2: `removeShortcuts` awaits its deletions, the removal toast follows the disk answer, `box.shortcuts.error-remove` (en only) (5 paths).
- Task 3 (todo close-out) is a docs artifact and is not committed.

`commits: 2` is measured with `git rev-list --count 5d79e61c8..HEAD`.

## Todo move (uncommitted, for the orchestrator)

- Old: `.planning/todos/pending/2026-10-12-gamesubmenu-shows-remove-shortcuts-before-the-write-is-known.md`
- New: `.planning/todos/completed/2026-10-12-gamesubmenu-shows-remove-shortcuts-before-the-write-is-known.md`

Done with `git mv` (staged rename). Frontmatter (lines 1-15) is byte-identical to HEAD `5d79e61c8`; `## Fix (2026-10-12, quick 261012-ca6)` and the `**CLOSED ...**` line were appended. `pnpm planning-gates`: 12/12 passed.

## RED and GREEN

RED, recorded before production code:

- Task 1: `shortcutsToggle.test.ts` failed to load ("Cannot find module '../shortcutsToggle'", 1 suite failed, 0 tests). `shortcutsFlows.test.ts` had 8 failed / 22 passed / 4 skipped: the known containment test plus 7 new failures (2 registration-kind: `addShortcut` and `removeShortcut` not in `handlerRegistry`; 5 `261012-ca6` outcome cases).
- Task 2: `removeShortcutsOutcome.test.ts` 3 failed / 1 passed (the ENOENT case already held). The darwin case's first RED was partly caused by my `isMac` mock being frozen at false (a getter written next to an object spread is evaluated once by the compiled `Object.assign`); fixed with `Object.defineProperty`, after which it is green. `shortcutsFlows.test.ts` after adding the toast assertions: 3 failed (the known one plus 2 new: remove-remains and remove-rejects toast).

GREEN, local Windows box:

| file | result |
| --- | --- |
| `shortcutsToggle.test.ts` | 9/9 |
| `removeShortcutsOutcome.test.ts` | 4/4 |
| `addShortcutsOutcome.test.ts` | 4/4 |
| `shortcutsExistsFallback.test.ts` | 6/6 |
| `runnerSliceRegistration.test.ts` | 95/95 |
| `flowRegistrationCensus.test.ts` | 72/72 |
| `invokeReturnValueSweep.test.ts` | 7/7 |
| other GameSubMenu tests (3 files) | pass (53 tests across the Task 2 verify set) |
| `shortcutsFlows.test.ts` | 30 passed / 1 failed / 4 skipped, 6 `261012-ca6` cases pass |

The one `shortcutsFlows` failure is the known Describe 2 containment test ("getPath(desktop) never resolves under the developer real home"), caused by the OneDrive-redirected Desktop; it failed identically at baseline.

Also: `pnpm codecheck` exit 0 after each code task; `pnpm lint` production PASS and tests PASS (638 warnings, at the ceiling of 638; my first version of the new tests added two `require-await` warnings and exceeded it, so those two helpers were rewritten to return `Promise.resolve()`); scoped `eslint` 0 errors; scoped `prettier --check` clean (every path confirmed not ignored via `--file-info`; `public/locales/en/translation.json` is prettier-ignored so `--check` was omitted as vacuous and the key was verified with a node check instead); `lint-translations` has no finding naming `box.shortcuts.error-remove`; `git diff HEAD -- src/backend/storeManagers` is empty.

## Describe 5 was NOT run locally

The darwin-only Describe 5 in `shortcutsFlows.test.ts` ("addShortcut's darwin GAMELIB_SHELL_EXE pin") is skipped on win32 (`describeOnDarwin`). Only its invocation changed (it now awaits `handlerRegistry.get('addShortcut')?.(null, title, 'legendary', undefined)` instead of calling the listener and `flush()`); every assertion is untouched. `pnpm codecheck` is the only local check of that edit. The `UNSET` and `EMPTY` cases still assert a logged warning containing `addShortcut` and `GAMELIB_SHELL_EXE was not set`, which the new handler still produces via `logChannelFailure`, but this has not been run.

## Real Desktop leak (for the operator)

The pre-existing `260905-mv5 (no regression)` test had created this empty directory on the real Desktop (mtime 2026-10-08), and it is still there; I did not delete it:

`C:\Users\grays\OneDrive\Desktop\260905-mv5 Site 4 No-Regression Game.lnk`

That test now forces `process.platform` to darwin and asserts the path starts with `homedir()` before writing. After every jest run in this plan, `ls "C:\Users\grays\OneDrive\Desktop" | grep 261012-ca6` returned nothing.

## Deviations from Plan

**1. [Rule 1 - Bug] `isMac` test mock frozen at false.** Found during Task 2. A getter next to an object spread in a `jest.mock` factory is evaluated once by the compiled `Object.assign`. Fixed in `removeShortcutsOutcome.test.ts` with `Object.defineProperty`. Part of commit `2716f525e`.

**2. [Rule 3 - Blocking] Lint ceiling.** The new `shortcutsFlows.test.ts` helpers used `async` arrows with no `await`, taking the tests ceiling from 638 to 640. Rewritten to return `Promise.resolve()`. Part of commit `f36b7e64f`.

**3. Source-gate regex widened.** The plan's gate regex `shortcutsBusy ? refreshCircle()` does not match the house JSX form `shortcutsBusy ? (\n refreshCircle()`; the test regex allows an optional `(`.

**4. Line endings.** My first scripted edit rewrote `shortcutsFlows.test.ts` with CRLF on this Windows box; restored to LF before any commit. No CRLF reached git.

Otherwise the plan was executed as written. No auth gates, no checkpoints, no package installs.

## Not exercised (operator-only)

A live click in the running app, the busy spinner's render, the toasts' render, and the 60 s invoke-bound rejection path in a real shell.

## Known Stubs

None.

## Threat Flags

None. The change adds no new endpoint, path input or trust boundary; `shortcutFiles`/`sanitize-filename` are unchanged and the recursive `rm` stays in the darwin `.app` branch.

## Pre-existing uncommitted files

`.planning/state.json`, `.planning/debug/rust-test-ci-missing-sidecar.md` and `.planning/milestone.lock` were left exactly as found and never staged. `graphify update .` was run after the code changes.

## Self-Check: PASSED

- Created files exist: `shortcutsToggle.ts`, `shortcutsToggle.test.ts`, `removeShortcutsOutcome.test.ts` (confirmed by green runs).
- Commits `f36b7e64f` and `2716f525e` exist on branch `quick-261002-b63`; each touches exactly its planned paths (11 and 5).
