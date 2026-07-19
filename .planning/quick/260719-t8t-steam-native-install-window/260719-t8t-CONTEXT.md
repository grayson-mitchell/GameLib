# Quick Task 260719-t8t: Native Steam install window (GOG-styled) - Context

**Gathered:** 2026-07-19
**Status:** Ready for planning

<domain>
## Task Boundary

When doing a native Steam install in GameLib, show a proper install window/dialog
styled like the GOG install window (`DownloadDialog`), replacing today's flow
(zero-friction single-library install with no window + a bare
`SteamInstallLocationPicker` dropdown for multi-library).
</domain>

<decisions>
## Implementation Decisions (LOCKED — do not revisit)

### When the window shows
- **ALWAYS** show the install window for every native Steam install — even when
  there is only 0 or 1 registered Steam library.
- This intentionally **reverses the D-09 "zero-friction" single-library path** in
  `openInstallGameModal` / `startSteamInstall` (src/frontend/state/InstallGameModal.ts).
  The single-library case previously called `installSteamGame(...)` immediately;
  it must now open the window first with the (single) library pre-selected.

### Build approach
- Build a **NEW dedicated Steam install dialog** (e.g. `SteamDownloadDialog`)
  that **reuses GOG's `DownloadDialog` layout, styling, and shared UI components**
  (game header art, install-location box styling, disk-space row, footer buttons)
  but has **Steam-specific logic**.
- **Do NOT** route `runner === 'steam'` through the existing shared `DownloadDialog`
  component — that component calls `getInstallInfo`, which loops forever on
  "Getting download size…" for Steam (documented constraint in
  InstallGameModal.ts). A dedicated dialog avoids that shared-component risk.
- The new dialog effectively **replaces / supersedes** the current
  `SteamInstallLocationPicker` (src/frontend/screens/Game/GamePage/components/).
  Either evolve that picker into the full dialog or add a new component and retire
  the picker — planner's discretion, but there must be ONE Steam install window.

### Window contents (all four requested)
1. **Game art + title header** — header/cover art + title, matching GOG's window.
2. **Install location picker** — REQUIRED. Keep the registered-Steam-library
   dropdown (`listSteamLibraryTargets()`), NOT a free-text/native-file browser —
   Steam only adopts installs inside a library it already knows about (D-08).
   Default to the primary library. With 1 library, show it pre-selected.
3. **Disk space available** — free space on the selected library's drive. Compute
   locally (no Steam dependency); recompute when the selected library changes.
4. **Download size** — attempt to show install/download size. NOTE: Steam does not
   expose size via `getInstallInfo`. Source it from the native depot manifest data
   if available (see backend depot path: `downloadSteamDepots` /
   `runNativeDepotDownload` in src/backend/storeManagers/steam/). If size is not
   readily available, **gracefully show "Unknown" — do NOT block the install and
   do NOT introduce a spinner that can hang.** Do not over-engineer new backend
   size APIs if it balloons scope; a best-effort/"Unknown" fallback is acceptable.

### Confirm behavior
- The Install button calls the existing `installSteamGame(appName, gameInfo, path)`
  with the selected library path (same call the current picker's confirm uses).
- Cancel/close dismisses without installing.
</decisions>

<specifics>
## Specific Ideas / Anchors (current code)

- Entry chokepoint: `openInstallGameModal` in
  `src/frontend/state/InstallGameModal.ts` (steam branch → `startSteamInstall`).
- `startSteamInstall` / `installSteamGame` in same file — reuse `installSteamGame`
  for the actual install call.
- Current minimal picker + its zustand store:
  - `src/frontend/screens/Game/GamePage/components/SteamInstallLocationPicker.tsx`
  - `src/frontend/state/SteamInstallLocation.ts` (open/close store, holds
    appName/gameInfo/libraries)
  - Mounted in `src/frontend/App.tsx`.
- GOG install window to model on:
  - `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx`
    and siblings; shared `Dialog` components in
    `src/frontend/components/UI/Dialog/`.
- Library targets API: `window.api.listSteamLibraryTargets()` (returns
  `{ path, isPrimary }[]`; empty when native-install opt-in is OFF).
- Disk space: look for existing frontend/backend free-space helpers (GOG's
  DownloadDialog already displays available space — reuse that mechanism).

## Backend / project constraints
- Electron + React + TypeScript (must stay mergeable with Heroic upstream).
- Follow existing project skills — read `.claude/skills/` (esp.
  `spike-findings-gamelib`) for Steam native install gotchas.
</specifics>

<canonical_refs>
## Canonical References
- CLAUDE.md (project constraints, Steam tech-stack decisions).
- No external specs — requirements fully captured in decisions above.
</canonical_refs>
