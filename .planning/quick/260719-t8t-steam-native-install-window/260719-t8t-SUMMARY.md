---
task: quick-260719-t8t
title: Native Steam install window (GOG-styled)
type: execute
status: complete
completed: 2026-07-19
branch: feat/steam-native-install-window
requirements: [QUICK-260719-t8t]
tasks_completed: 2
files_created:
  - src/frontend/screens/Game/GamePage/components/SteamDownloadDialog.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/SteamDownloadDialog.test.tsx
  - src/frontend/state/__tests__/SteamInstallLocation.test.ts
files_modified:
  - src/frontend/state/InstallGameModal.ts
  - src/frontend/App.tsx
files_deleted:
  - src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx
commits:
  - 057369b1  feat(t8t-01): always open Steam install window (retire zero-friction path)
  - 7e21c59a  feat(t8t-02): single GOG-styled SteamDownloadDialog install window
---

# Quick Task 260719-t8t: Native Steam install window (GOG-styled) Summary

Native Steam installs now ALWAYS open a single GOG-styled install window
(`SteamDownloadDialog`) — game art + title, a registered-library dropdown, live
free-disk-space, and a graceful "Unknown" download size that never hangs —
replacing both the D-09 zero-friction 0/1-library immediate-install path and the
bare `SteamInstallLocationPicker`.

## What changed

### Task 1 — startSteamInstall always opens the window (057369b1)
- `src/frontend/state/InstallGameModal.ts`: removed the `libraries.length > 1`
  gate and the trailing immediate `installSteamGame` call. `startSteamInstall`
  now unconditionally calls `useSteamInstallLocation.getState().open(appName,
  gameInfo, libraries)` for 0, 1 and >1 libraries. No frontend code path installs
  a native Steam game without first opening the window. `installSteamGame`'s
  signature and body are unchanged (confirm call, path `''` falls back to the
  primary library backend-side per D-08 `resolveSteamInstallTarget`).
- `SteamInstallLocation.ts` store was left unchanged — `libraries: []` was
  already a valid open state, so the empty-libraries case needed no store change.
- New unit test `SteamInstallLocation.test.ts` (6 cases): store opens for 0/1/>1
  libraries, never installs without opening, and `installSteamGame` still routes
  to `window.api.install({ runner: 'steam', ... })`.

### Task 2 — single SteamDownloadDialog, picker retired (7e21c59a)
- New `SteamDownloadDialog.tsx`, the ONE native-Steam install window, driven by
  the `useSteamInstallLocation` store and modelled on GOG's `DownloadDialog`
  layout/styling (shared `Dialog/DialogHeader/DialogContent/DialogFooter`). It
  renders: (1) art (`art_cover ?? art_square`) + title header, (2) a
  registered-library `<select>` (NOT free-text/PathSelectionBox — D-08) defaulting
  to the primary/first library and pre-selected for a single library, (3) a
  free-disk-space row via `window.api.checkDiskSpace(selectedPath).message`
  recomputed whenever the selected library changes, (4) a best-effort download
  size that resolves immediately to the literal "Unknown" — never a
  hanging/pulsing `faSpinner`. Install → `close()` then
  `installSteamGame(appName, gameInfo, selectedPath)`; Cancel/close dismisses
  without installing. Deliberately does NOT call `getInstallInfo` (it loops
  forever on "Getting download size…" for Steam). Empty-libraries case renders a
  disabled "Default location" option with `selectedPath = ''`.
- `App.tsx`: mount swapped from `<SteamInstallLocationPicker />` to
  `<SteamDownloadDialog />` (import + JSX).
- `SteamInstallLocationPicker.tsx` retired (deleted) — exactly ONE Steam install
  window now exists.
- New component test `SteamDownloadDialog.test.tsx` (11 cases) using a small
  dependency-aware hook harness (this project has no jsdom): renders-on-open,
  single-library pre-select, "Unknown" with no spinner, free-space recompute on
  library change, Install-with-selected-path, Cancel-does-not-install, and the
  0-library disabled-placeholder/empty-path path.
- Ran `graphify update .` after code changes (4508 nodes, 8314 edges).

## Verification

- `pnpm exec tsc --noEmit`: PASS (exit 0, no errors).
- `pnpm jest -c src/frontend/jest.config.js`: PASS — 21 suites, 158 tests,
  including the two new suites (6 + 11 cases).
- Contract links verified by grep: `InstallGameModal.ts` → `.open(` (1);
  `SteamDownloadDialog.tsx` → `installSteamGame(` (1), `checkDiskSpace` (1),
  `listSteamLibraryTargets` (1, provenance comment). Picker absent from HEAD.

## Deviations from Plan

**1. [Concurrent-session shared-index contamination] Picker deletion landed in
another session's commit, not the Task 2 commit.**
- **Found during:** Task 2 staging.
- **Issue:** Per the task constraints, a separate in-progress session had
  uncommitted debug edits to `launcher.ts`/`main.ts`/`bottle.ts`. After I staged
  the picker retirement with `git rm`, that session committed
  (`b1787ed2 fix(steam): route bottle Steam games through runner-aware settings`),
  and the shared git index swept my staged `SteamInstallLocationPicker.tsx`
  deletion into their commit alongside their backend edits.
- **Impact:** None on the net repo state — the picker is retired in HEAD and the
  "exactly ONE Steam install window" goal holds. The only effect is that the
  picker deletion is recorded in `b1787ed2` rather than in my `7e21c59a` Task 2
  commit. My Task 2 commit still carries the coherent App.tsx mount swap + new
  dialog + test.
- **Resolution:** Left `b1787ed2` untouched (it contains the other session's
  work, which the task constraints forbid me from touching/reverting/rewriting).
  Did not attempt any index/history repair. `b1787ed2` did not touch `App.tsx`, so
  my staged App.tsx diff remained the clean import+mount swap.

**2. [Scope] i18n locale JSON not modified.**
- New key `install.steam-location.size-unknown` ('Unknown') and reused keys
  (`install.steam-location.*`, `game.downloadSize`, `install.disk-space-left`,
  `button.install`, `box.cancel`) are all supplied inline via `t(key, default)`
  defaultValue fallbacks, so runtime copy renders correctly without editing
  `public/locales/**`. Locale files were intentionally left alone to avoid
  touching the known pre-existing i18n-extraction debt (STATE.md Blockers).

## Known Stubs

- Download size renders the literal "Unknown" (`downloadSize` is intentionally
  `undefined`). This is a LOCKED CONTEXT decision (CONTEXT "Window contents" #4):
  Steam exposes no cheap pre-install size via `getInstallInfo`, and introducing a
  new backend size API was explicitly out of scope. The value is kept as a
  `string | undefined` seam so a future cheap size source can populate it without
  restructuring the component. This does not block installs.

## Self-Check: PASSED
- FOUND: src/frontend/screens/Game/GamePage/components/SteamDownloadDialog.tsx
- FOUND: src/frontend/screens/Game/GamePage/components/__tests__/SteamDownloadDialog.test.tsx
- FOUND: src/frontend/state/__tests__/SteamInstallLocation.test.ts
- FOUND commit: 057369b1
- FOUND commit: 7e21c59a
- RETIRED (absent from HEAD): SteamInstallLocationPicker.tsx
