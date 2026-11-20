---
phase: quick-261102-pgy
plan: 01
subsystem: console-mode / steam
tags: [console-mode, steam, client-setup, gamepad, hand-off]
requires:
  - quick 261102-21x (D-UAT-15 steamClientSetupRecheck on the desktop quick install)
provides:
  - steamClientSetupCause (shared client-cause predicate)
  - Console Mode "Set up Steam in desktop mode" hand-off chip
  - releaseUnclaimedSteamClientSetup (no stray desktop dialog after a dismissed card)
affects:
  - src/frontend/screens/ConsoleMode/InstallOverlay
  - src/frontend/state/InstallGameModal.ts
tech-stack:
  added: []
  patterns: [throwing source-gate helpers with RED specimens, open-store-before-navigate]
key-files:
  created: []
  modified:
    - src/frontend/state/InstallGameModal.ts
    - src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts
    - src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx
    - src/frontend/screens/ConsoleMode/index.tsx
    - src/frontend/screens/ConsoleMode/InstallOverlay/__tests__/consoleSteamTarget.test.ts
    - public/locales/en/gamelib.json
    - src/frontend/state/SteamClientSetup.ts
    - src/frontend/screens/Game/GamePage/components/SteamClientSetup.tsx
    - src/common/types/ipc.ts
    - .planning/todos/completed/2026-11-02-console-mode-steam-client-setup-unreachable.md
decisions:
  - "Operator decision 2026-11-02: hand off to desktop mode (console-native card and accepting the copy rejected)"
  - "Open the setup store before calling ConsoleMode quit, so the desktop dialog renders on first mount"
  - "clientSetup sits on the probe verdict, not inside degrade (A6/B4 shape gates stay intact)"
metrics:
  duration: ~25m
  completed: 2026-11-02
status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 5
plan_head_before: c9c1b5352e704c27e57d5e83fabf4e68c79153a4
plan_head_after: 352ff9126745a25986ee5c8c53bc282f260f9ff0
commits: 5
---

# Phase quick-261102-pgy Plan 01: Console Mode hands Steam client setup off to desktop mode Summary

When the Steam client (not the drive) is why the library looks missing, the Console Mode install card now offers a controller-focused "Set up Steam in desktop mode" action that opens the client-setup store and leaves Console Mode, so the desktop D-10/D-11 dialog runs.

## What changed

- `InstallGameModal.ts`: exported `steamClientSetupCause(appName)` returning `'install' | 'launch-once' | undefined` (ready false, no error, needs-install / needs-launch only; fail-open, never throws). The desktop `steamClientSetupPending` is now its boolean view, so desktop and Console Mode share one predicate.
- `consoleSteamTarget.ts`: probe verdict carries optional `clientSetup` on a library-missing verdict when an appName is given; `setupSteam` FocusKey and `handoff` intent; `handOffSteamClientSetupToDesktop` (store open first, exit second); `releaseUnclaimedSteamClientSetup` (closes only a session for the same appName).
- `InstallOverlay/index.tsx`: `onExitConsole` prop; hand-off chip rendered only when the verdict offers it, focused by default, wired for gamepad A, Enter/Space and click; left/right toggles the last two rows; unmount cleanup (and the in-flight cancelled branch) releases a store the overlay did not hand off.
- `ConsoleMode/index.tsx`: passes its existing `quit` as `onExitConsole`.
- `public/locales/en/gamelib.json`: `consoleMode.steamClientSetupHandOff` (en only, per the 261102-21x precedent).
- Comments in `SteamClientSetup.ts`, `SteamClientSetup.tsx` and `ipc.ts` now name Console Mode's hand-off as the second opener of the store.
- Todo moved to `.planning/todos/completed/` with the decision, both fix hashes and the controller live gate (`ready: live-gate`).

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 RED | 0ebe889dd | test: pin the Console Mode client-cause hand-off |
| 1 GREEN | c85f4cbeb | feat: Console Mode hands Steam client setup off to desktop mode |
| 2 RED | 637441f2d | test: pin the unclaimed-store release and catalog default |
| 2 GREEN | 9e1c966af | fix: a dismissed client-cause card leaves no stray desktop dialog |
| 3 | 352ff9126 | docs: record the hand-off decision and fix; correct store comments |

## Verification

- Four targeted Frontend suites: 136 passed (consoleSteamTarget, InstallGameModal, SteamClientSetup, SteamClientSetup.waitingDialog). New specs A10, A11, B5, H1/H2, H3, D9 (+2 RED), D10 (+RED), D11 (+2 RED), I1 were seen failing before the implementation (A12/A13 pin fall-through behaviour that already held and passed from the start).
- `tsc --noEmit` clean; ESLint 0 errors / 0 warnings over the touched code paths; prettier clean on all `src/` paths (gamelib.json and the todo are prettier-ignored, confirmed with `--file-info`); `findDeadcode` and `i18n-churn-guard` exit 0; planning gates FAIL only on the baseline `state-sdk-field-anchor-gate.py`.
- Not run: `hardcodedStringGate.test.ts` (Meta project, ~260s; the chip uses the gate-exempt key/default shape) and `graphify update .` was run (local only).

## Deviations from Plan

### Branch

**1. [Rule 3 - Blocking] Committed on `agent-quick-261102-pgy`, not `main`**
- **Found during:** first commit
- **Issue:** the pre-commit HEAD assertion (`git.base-branch --is-protected main` returned true; `git.allow_default_branch_commits` is not set in `.planning/config.json`). The prompt said to run on the main tree but gave no override of that config.
- **Fix:** `git switch -c agent-quick-261102-pgy` from `main` (c9c1b5352) before any commit. All 5 commits are on that branch. `main` is untouched; fast-forward `main` to this branch (or set the override) to land them.
- **Files modified:** none

No other deviations. No auth gates, no package installs, no stubs.

## Known Stubs

None.

## Threat Flags

None. The hand-off adds no endpoint, route or path; the appId still goes through the unchanged server-side numeric guard.

## Live gate still owed

Controller run (any OS): with the Steam client absent (D-10) or installed but never launched (D-11), enter Console Mode and press A on an uninstalled Steam game. The card should show "Set up Steam in desktop mode" focused; A leaves Console Mode into the D-10 consent / D-11 waiting dialog; B closes the card with no stray dialog after leaving Console Mode. Recorded in the completed todo.

## Self-Check: PASSED

- Commits 0ebe889dd, c85f4cbeb, 637441f2d, 9e1c966af, 352ff9126 exist on `agent-quick-261102-pgy`.
- Todo present only under `.planning/todos/completed/`; `gamelib.json` carries the new key.
