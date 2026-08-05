---
phase: quick-260805-t0s
plan: 01
subsystem: ui, ipc
tags: [electron, tauri-sidecar, ipc, react, fortawesome, funding-metadata]

# Dependency graph
requires: []
provides:
  - Patreon sidebar entry removed from the community menu block
  - openPatreonPage IPC channel deleted end-to-end (frontend, preload, common types, Electron main, Tauri sidecar)
  - patreonPage URL constant deleted
  - Sidecar channel-contract test reconciled to 20 total / 9 constant openers
  - Funding metadata (.github/FUNDING.yml, Support.md, snap/snapcraft.yaml) stripped of Patreon references
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
    - src/preload/api/misc.ts
    - src/common/types/ipc.ts
    - src/backend/main.ts
    - src/backend/constants/urls.ts
    - src/backend/sidecar/shellFilesFlowRegistration.ts
    - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
    - .github/FUNDING.yml
    - Support.md
    - snap/snapcraft.yaml

key-decisions:
  - "Deleted the openPatreonPage member from IpcListeners rather than stubbing it, so any surviving caller becomes a tsc compile error instead of a silent sidecar no-op (D-1)"
  - "Included the three non-src funding files (FUNDING.yml, Support.md, snapcraft.yaml) in scope since they are the only remaining Patreon references and leaving them would make repo-wide removal unverifiable by a single grep (D-2)"
  - "Corrected the sidecar docstring/test channel counts (21/29 -> 20/28, 18 -> 17 send, 12 -> 11 openers, 10 -> 9 constant openers) rather than leaving them stale (D-4)"

patterns-established: []

requirements-completed:
  - REQ-Q-t0s-01
  - REQ-Q-t0s-02
  - REQ-Q-t0s-03
  - REQ-Q-t0s-04

duration: 25min
completed: 2026-08-05
---

# Quick Task 260805-t0s: Remove Patreon from menu and all references Summary

**Deleted the `openPatreonPage` IPC channel end-to-end (frontend sidebar item, preload, common types, Electron main, Tauri sidecar) plus the `patreonPage` URL constant and three funding-metadata lines, leaving zero `patreon` occurrences in the repo outside `.planning/`.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-05 (session start)
- **Completed:** 2026-08-05
- **Tasks:** 3 completed
- **Files modified:** 10

## Accomplishments
- Sidebar community block now renders Discord, Ko-fi, GitHub Sponsors only — no Patreon entry, `faPatreon` import dropped
- `openPatreonPage` channel deleted from every layer it crossed: preload export, `IpcListeners`/`SyncIPCFunctions` type, Electron `main.ts` listener, Tauri sidecar registration
- `patreonPage` URL constant removed from `src/backend/constants/urls.ts`
- Sidecar module docstrings and the channel-contract test reconciled to the new counts (20 channels / 28 slice total, 17 send, 11 URL openers, 9 constant openers)
- `.github/FUNDING.yml`, `Support.md`, `snap/snapcraft.yaml` lost their single Patreon line each; sibling Ko-fi/GitHub Sponsors/crypto entries untouched
- `pnpm codecheck` clean, full `pnpm test:ci` green (191 suites / 3741 tests)
- `graphify update .` run per CLAUDE.md (best-effort, AST-only)

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete the openPatreonPage channel across all four layers** - `beb20a320` (feat)
2. **Task 2: Reconcile the sidecar channel-contract test** - `9b01870ff` (test)
3. **Task 3: Strip the three funding-metadata references and prove repo-wide absence** - `7278aa4a6` (chore)

_No TDD flow used — plan type is a straightforward deletion/reconciliation task._

## Files Created/Modified
- `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx` - Removed the Patreon `<SidebarItem>` and `faPatreon` import
- `src/preload/api/misc.ts` - Removed `openPatreonPage` export
- `src/common/types/ipc.ts` - Removed `openPatreonPage` from `SyncIPCFunctions`
- `src/backend/main.ts` - Removed `patreonPage` import and `addListener('openPatreonPage', ...)`
- `src/backend/constants/urls.ts` - Removed `patreonPage` export
- `src/backend/sidecar/shellFilesFlowRegistration.ts` - Removed the sidecar registration, import, docstring bullet; decremented all channel counts
- `src/backend/sidecar/__tests__/shellFilesFlows.test.ts` - Removed the three table rows and the import; decremented `toHaveLength` assertions
- `.github/FUNDING.yml` - Removed `patreon: heroicgameslauncher`
- `Support.md` - Removed the "Support Monthly: Patreon Page" heading
- `snap/snapcraft.yaml` - Removed the Patreon donation URL

## Decisions Made
See `key-decisions` in frontmatter (D-1, D-2, D-4 from the plan, carried through unchanged).

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched the discovery findings precisely; no additional Patreon references were found beyond the 10 files the planner had already identified.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
This was a standalone quick task with no downstream phase dependency. Repo-wide `patreon` grep (excluding `.planning/`, `node_modules/`, `.git/`, `dist/`, `build/`, `target/`, `graphify-out/`) returns zero matches; `pnpm codecheck` and `pnpm test:ci` are both green.

---
*Quick task: 260805-t0s*
*Completed: 2026-08-05*

## Self-Check: PASSED

All 10 modified files verified present on disk; all 3 task commit hashes (`beb20a320`, `9b01870ff`, `7278aa4a6`) verified present in `git log`.
