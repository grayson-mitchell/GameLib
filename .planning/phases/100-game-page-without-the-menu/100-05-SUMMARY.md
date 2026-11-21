---
phase: 100-game-page-without-the-menu
plan: 05
subsystem: ui
tags: [react, game-page, install-tab, fact-rows, cloud-saves, i18n]

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plan 01 SwitchRow, useRowAction and IntegrationRows; plan 04 FactRow, FactAction, gateReasonText and the installActionGates object InstallTab passes to every row"
provides:
  - "actions/cloudSync.ts: SYNC_TYPES, cloudSavesValue, needsForceConfirm, cloudSavesPathMissing and executeCloudSync (syncSaves injected)"
  - "CloudSavesSync reshaped into a Cloud saves fact row: value Syncing / Auto-sync on / Manual / Unsupported, click-only Sync now menu, Open saves folder, inline failure with Retry"
  - "Auto-sync saves SwitchRow in Library & integration, disabled until a saves folder is set"
  - "EngineRow (Wine name, bottle or prefix, Open prefix), OnlineRequiredRow and ThirdPartyRow as action-less facts, PlatformSupport as a Platforms fact"
  - "NotInstalledFacts: sizes, Platforms, Third-party manager and the Already installed elsewhere? link opening the import door"
  - "HumbleOriginInfo and NativePortInfo as neutral installNote notes between the facts and Library & integration"
affects: [100-06, 100-08, 100-09, 100-10]

plan_head_before: 461656dbec1dcc9d36ac672052e65cd143f5f66f
plan_head_after: e67e0ca1e183922771e79e02ecd8a737022f0f35

actuals:
  tokens: 18971
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "A pure action module (cloudSync.ts) with the renderer helper injected, so the module never imports frontend/helpers and stays mock-free to test"
    - "Rows that render no action reuse FactRow with value as children; a help icon in a value uses a fact--withHelp modifier so the popover is not clipped by the value's ellipsis"
    - "Notes carry a shared installNote class so one rule styles both without touching the census-pinned is-text buttons"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/actions/cloudSync.ts
    - src/frontend/screens/Game/GamePage/actions/__tests__/cloudSync.test.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/EngineRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/StaticFactRows.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/NotInstalledFacts.tsx
  modified:
    - src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx
    - src/frontend/screens/Game/GamePage/components/PlatformSupport.tsx
    - src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx
    - src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx
    - src/frontend/screens/Game/GamePage/components/NativePortInfo.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
    - src/frontend/screens/Game/GamePage/components/InstallTab/IntegrationRows.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts
    - src/frontend/screens/Settings/sections/SyncSaves/index.tsx
    - src/frontend/screens/Settings/sections/SyncSaves/legendary.tsx
    - src/frontend/screens/Settings/sections/SyncSaves/gog.tsx
    - meta/gameInfoNarrowingBaseline.json
    - meta/backendDiCeilings/frontend-screens-game.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts
    - public/locales/en/gamelib.json
  deleted:
    - src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx
    - src/frontend/screens/Game/GamePage/components/__tests__/cloudSavesSyncFailure.test.tsx

key-decisions:
  - "Retry on a failed sync goes back through handleSync, so a failed force-download or force-upload asks for its overwrite confirmation again rather than re-running destructively on one click (T-100-14)"
  - "The cloud-saves label key is gamepage.installTab.cloudSaves.label, not cloudSaves: i18next nests keys on '.', so a leaf named cloudSaves cannot coexist with cloudSaves.syncing"
  - "Installed and not-installed games get separate fact lists in InstallTab (a ternary on is_installed) so the not-installed order is sizes, Platforms, Third-party, Locate link"
  - "ThirdPartyRow renders for installed and not-installed games alike; DownloadSizeInfo's old third-party branch now returns null"
  - "The orphaned setting.enable-quick-sync-menu key stays in public/locales/en/translation.json: pnpm i18n only reports unreferenced keys and does not prune them"

patterns-established:
  - "Source gates pin that a row has no hover handler, no hex colour and no stored-setting read it was reshaped to drop"

requirements-completed: [D-01, D-03, D-05, D-06, D-10, D-11, D-12, D-14, D-18, D-21]

coverage:
  - id: D1
    description: "Cloud saves is a fact row whose value reads Syncing, Auto-sync on, Manual or Unsupported, with a click-only Sync now menu and Open saves folder; no hover-opened menu and no hidden action"
    requirement: D-03
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/actions/__tests__/cloudSync.test.ts#cloudSavesValue reads each state"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#CloudSavesSync opens its menu on click only, with no hover handler, hex colour or quick-menu setting (D-03, D-21)"
        status: pass
    human_judgment: true
    rationale: "The menu anchoring, row layout and the Unsupported help popover need a look in the running app"
  - id: D2
    description: "Force download and force upload keep their overwrite confirmation; a rejected sync shows red text with Retry under the row instead of an error dialog"
    requirement: D-12
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/actions/__tests__/cloudSync.test.ts#needsForceConfirm confirms only the two overwriting commands (T-100-14)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#CloudSavesSync syncs through executeCloudSync and confirms only the forced commands (T-100-14)"
        status: pass
    human_judgment: true
    rationale: "Forcing a real sync rejection to see the inline text needs the running app"
  - id: D3
    description: "Auto-sync saves is a switch row under Library & integration, and the inert quick-sync-menu toggle is gone from the Cloud Saves Sync settings"
    requirement: D-21
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#IntegrationRows drives the Auto-sync saves switch from useSetting (D-03)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#the Settings Cloud Saves Sync section no longer offers the quick-sync-menu toggle (D-21)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Installed rows continue Location, Size, Version with Engine, Cloud saves, Platforms, Online required and Third-party manager; InstalledInfo is deleted with nothing lost"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#InstalledInfo is gone and the InstallTab renders every re-homed fact in order (D-14)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#EngineRow offers Open prefix only through gates.openPrefix (D-01, D-11)"
        status: pass
    human_judgment: true
    rationale: "Which rows appear for a Wine game versus a native one, and the platform glyph outline inside the value cell, need a look at the rendered tab"
  - id: D5
    description: "A not-installed game shows Download size, Install size, Platforms, Third-party manager when it applies, and an Already installed elsewhere? link that opens Locate existing installation"
    requirement: D-05
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#NotInstalledFacts opens the import door behind gates.locate (D-01)"
        status: pass
    human_judgment: true
    rationale: "The link's placement under the fact rows and the sizes while the manifest loads need the running app"
  - id: D6
    description: "The native-port hint and the Humble key origin read as neutral accent-tinted notes after the facts and before Library & integration"
    requirement: D-06
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#InstallTab branches installed and not-installed facts and places the notes before the legacy rows (D-06)"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts (is-text census 39 unchanged)"
        status: pass
    human_judgment: true
    rationale: "The tint and contrast against each theme need a visual check"

duration: 16min
completed: 2026-11-21
status: complete
---

# Phase 100 Plan 05: Cloud saves, Engine and not-installed facts Summary

**Cloud saves, Engine, Platforms, Online required and Third-party manager join the Install tab as fact rows, with Auto-sync as a switch row, a not-installed fact list with a Locate link, and InstalledInfo and the inert quick-sync toggle deleted**

## Performance

- **Duration:** 16 min
- **Tasks:** 3 of 3
- **Files:** 25 changed (5 created, 2 deleted)

## Accomplishments

- Cloud saves reads Syncing…, Auto-sync on, Manual or Unsupported (no invented last-sync time). [Sync now ▾] opens the four existing sync commands on click only; [Open saves folder] sits beside it. Force commands keep their overwrite confirmation, and a rejected sync shows fixed text with Retry under the row rather than an error dialog.
- Auto-sync saves is a SwitchRow at the top of Library & integration, disabled with a reason until a saves folder is set.
- EngineRow shows the Wine name and the bottle or prefix path with Open prefix beside it; Online required and Third-party manager are action-less facts; Platforms is a fact row; InstalledInfo is gone.
- A not-installed game now shows Download size, Install size (Steam: the estimate), Platforms, Third-party manager when it applies, and "Already installed elsewhere?" opening the import flow.
- The Humble origin and native-port hint are neutral accent-tinted notes. The NativePortInfo census sites (three `button is-text`) are byte-identical; themeTokens still reads 39.
- The `QuickSavesToggle` and its `enableQuickSavesMenu` plumbing are removed from Settings Cloud Saves Sync (the stored key stays in the backend schema, out of scope).

## Task Commits

1. **Task 1 (tracer): Cloud saves fact row and Auto-sync switch** - `cd3bd0093`
2. **Task 2: Engine, Platforms, Online required, Third-party; retire InstalledInfo** - `d0bea0771`
3. **Task 3: not-installed facts, Locate link, notes, toggle removed** - `4dc1da652`
4. **i18n scope bookkeeping (fork-touched 465 to 468, scope 342 to 345)** - `e67e0ca1e`

The tracer's `<verify>` passed end to end before expansion (jest, codecheck, narrowing ceiling, DI shard, prettier).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cloud saves label key renamed to `cloudSaves.label`**
- **Found during:** Task 1
- **Issue:** the plan lists both `installTab.cloudSaves` (the label) and `installTab.cloudSaves.syncing` and siblings. The catalog is nested on `.`, so a leaf and an object cannot share the name `cloudSaves`.
- **Fix:** label key is `gamepage.installTab.cloudSaves.label`; the other `cloudSaves.*` keys are as planned. Also added `cloudSaves.needsFolder` for the disabled tooltip.
- **Files modified:** CloudSavesSync.tsx, public/locales/en/gamelib.json
- **Commit:** cd3bd0093

**2. [Rule 2 - Missing critical] Retry of a failed forced sync re-confirms**
- **Found during:** Task 1
- **Issue:** routing Retry straight to the runner would re-run a force-download (erases local saves) or force-upload (overwrites cloud saves) on one click with no prompt, against T-100-14.
- **Fix:** Retry calls `handleSync(lastSyncType)`, so forced types ask again.
- **Files modified:** CloudSavesSync.tsx
- **Commit:** cd3bd0093

**3. [Rule 3 - Blocking] `fact--withHelp` modifier**
- **Found during:** Task 1
- **Issue:** `.fact__value` is `overflow: hidden; white-space: nowrap`, which would clip the Unsupported state's help popover.
- **Fix:** a CSS modifier that lets that one value overflow and wrap.
- **Files modified:** InstallTab/index.css
- **Commit:** cd3bd0093

**4. [Plan observation] No barrel export to remove**
- `components/index.tsx` never exported InstalledInfo (the acceptance count was already 0). Deleting the file and its single import in InstallTab/index.tsx was enough.

**5. [Plan observation] Narrowing baseline moved further than listed**
- CloudSavesSync's count fell to 0 (calls moved to cloudSync.ts on an identifier named `runner`), so its entry was removed, not lowered. DownloadSizeInfo's entry was also removed once its third-party `asStoreGame` branch moved to StaticFactRows.

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking), 2 observations. **Impact:** none on scope.

## Known Stubs

None.

## Issues Encountered

None. One scoping slip: the Settings quick-sync source gate first used one `..` too many and failed at once on a missing path; fixed before the commit.

## Notes for Later Plans

- `setting.enable-quick-sync-menu` is orphaned in `public/locales/*/translation.json`; i18n tooling reports but does not prune it.
- `ROADMAP.md` carries another session's uncommitted phase-85 hunk, so it was not staged by this plan. See the final report.

## Threat Flags

None. The only boundary touched is the existing renderer-to-sidecar sync command path, unchanged in shape; T-100-14, T-100-15 and T-100-16 are covered by `needsForceConfirm` plus the source gate, fixed failure text with `logError`-only details, and `useRowAction` clearing busy on rejection.

## Self-Check: PASSED

- Created files exist: cloudSync.ts, cloudSync.test.ts, EngineRow.tsx, StaticFactRows.tsx, NotInstalledFacts.tsx.
- Deleted: InstalledInfo.tsx and cloudSavesSyncFailure.test.tsx absent.
- Commits `cd3bd0093`, `d0bea0771`, `4dc1da652`, `e67e0ca1e` are ancestors of HEAD.
- Acceptance criteria: all counts as specified (onMouseEnter 0, enableQuickSavesMenu 0 in both files, cloudSavesSyncFailure 0, InstalledInfo 0, installNote 1, is-text 3, StaticFactRows entry present).
- Plan gates: full Frontend jest 6620 passed, Meta i18n suites passed, codecheck, lint (0 errors), find-deadcode, narrowing ceiling, DI shard and frontend DI check, i18n churn guard, prettier over all touched paths.
