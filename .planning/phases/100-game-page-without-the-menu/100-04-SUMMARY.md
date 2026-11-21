---
phase: 100-game-page-without-the-menu
plan: 04
subsystem: ui
tags: [react, game-page, install-tab, fact-rows, gating, i18n]

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plan 01's InstallTab, RowFailure, installActionGates and rowAction; CONTEXT D-01/D-10..D-14/D-18/D-19"
provides:
  - "Hook-free FactRow and FactAction primitives (busy label, aria-disabled plus reason title, forwarded click event)"
  - "gateReasonText: every GateReason as a translated tooltip, one literal t() per reason"
  - "useInstallLocationActions: Open, Move... and Set install folder copied from the dots menu, with inline failure"
  - "LocationRow, SizeRow (owns ModifyInstallModal), VersionRow (Verify, Update, What's new) and the shared WhatsNewLink"
  - "GameStatus optional whatsNew slot beside the update prompt; InstallTab takes handleUpdate and hasUpdate"
affects: [100-05, 100-06, 100-08, 100-09, 100-10]

plan_head_before: 0d66d1375120d93fa4d4931710ee3b3fb5dc74d9
plan_head_after: 84a2bc2eb37265c3d73f6e6e4f04f0c76b551c5a

actuals:
  tokens: 10100
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "One gates object (installActionGates) computed in InstallTab and passed to every fact row"
    - "Busy labels derived from the game's status (is.moving, is.reparing, is.updating, is.installing) so GameStatus stays the only progress readout"
    - "aria-disabled plus an early-return click guard, so the reason tooltip shows and the control stays in the focus ring"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/InstallTab/FactRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/gateReasonText.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/LocationRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/SizeRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/WhatsNewLink.tsx
    - src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/FactRow.test.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts
  modified:
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
    - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
    - src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx
    - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/backend/__tests__/dialogOptionForwarding.test.ts
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Move busy reads is.moving and Set folder busy reads the changeInstallPath row phase (it has no status flag); Verify busy is the row phase OR is.reparing, so the label shows during the invoke and while the backend reports reparing"
  - "Retry on a failed Move or Set folder re-runs the picker body without a second yes/no: the confirmation (D-13) was already given for that attempt"
  - "When an update exists but gameInstallInfo carries no version, the Version row reads '· update available' rather than an empty '· {{version}} available'"
  - "InstalledInfo lost its path, size and version rows (and the now-unused runner, hasCapability and icon imports) so no fact shows twice"

patterns-established:
  - "Source gates over comment-stripped component source for hook-heavy rows when the repo has no jsdom"

requirements-completed: [D-01, D-10, D-11, D-12, D-13, D-14, D-18, D-19]

coverage:
  - id: D1
    description: "Location, Size and Version fact rows with Open, Move..., Wrong folder?, Modify..., Verify, Update and What's new, each shown only where installActionGates allows"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#LocationRow takes Move busy from is.moving and reads its gates (D-10, D-11)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#InstallTab renders Size then Version inside installFacts and hands VersionRow the update props"
        status: pass
    human_judgment: true
    rationale: "Row layout, ellipsised path and per-store button sets need a look at the rendered Install tab"
  - id: D2
    description: "Busy buttons read Moving.../Verifying.../Updating... from the game's status and conflicting actions are disabled with a reason tooltip; Open, What's new and the switch rows stay live"
    requirement: D-11
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/FactRow.test.tsx#busy: shows the busy label, marks aria-busy and ignores clicks (D-10)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/FactRow.test.tsx#disabled: carries the reason as its title and ignores clicks (D-11)"
        status: pass
    human_judgment: true
    rationale: "The live pulse and that GameStatus is the only progress readout during a real move or verify need the running app"
  - id: D3
    description: "Verify starts with no confirmation; Move and Set install folder keep theirs; rejections show inline text with Retry"
    requirement: D-13
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#VersionRow verifies through useRowAction with no confirmation and updates through handleUpdate (D-13, D-19)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#useInstallLocationActions confirms before each picker (D-13)"
        status: pass
    human_judgment: true
    rationale: "An inline failure replacing a dialog can only be seen by forcing a real rejection in the app"
  - id: D4
    description: "What's new opens the sanitised changelog from the Version row and the update status line"
    requirement: D-01
    verification:
      - kind: unit
        ref: "src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts#WhatsNewLink renders the changelog only through GameChangeLog (T-100-12)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The dots menu still offers Move, Change Install Location, Verify, Force Update, Modify and Show Changelog"
    requirement: D-14
    verification:
      - kind: command
        ref: "git diff 0d66d13..HEAD --stat -- src/frontend/screens/Game/GameSubMenu src/frontend/screens/Game/GamePage/components/DotsMenu.tsx (no output)"
        status: pass
    human_judgment: false
---

# Phase 100 Plan 04: Location, Size and Version fact rows Summary

**Install tab fact rows that carry the actions for the fact they change: Open / Move... / Wrong folder? on Location, Modify... on Size, Verify / Update / What's new on Version, gated by installActionGates with busy labels from game status and inline Retry failures where the renderer sees a rejection.**

## Performance

- **Duration:** about 25 min (2026-11-21T09:55Z to 10:21Z, approximate)
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 9 created, 11 modified

## Accomplishments

- FactRow and FactAction primitives: a busy action swaps to its busy label and pulses, a disabled one keeps its reason tooltip and focus (aria-disabled plus a click guard), and the click event is forwarded for menu anchoring (plan 05).
- Location row: ellipsised path with the full path in the tooltip; Open, Move... (confirm, picker, `is.moving` busy) and a "Wrong folder?" link (confirm, picker, own busy phase). Failures render fixed translated text with Retry; raw errors go to the log only.
- Size row owns ModifyInstallModal; Modify... is shown for Epic and GOG only and reads "Applying changes..." while the installed game reports installing.
- Version row: version plus "up to date" or "<version> available" in the warning colour; Verify runs at once through `useRowAction('repair')`, Update calls the page's `handleUpdate` unchanged, and What's new is shared with the update status line in GameStatus through a `whatsNew` slot.
- InstalledInfo lost its path, size and version rows; the dots menu is untouched (D-14).
- Seven files scoped into the i18n gate (fork-touched 458 to 465, scope 335 to 342, 0 violations).

## Task Commits

1. **Task 1 (tracer): Location row** - `6090a99d0` (feat)
2. **Task 2: Size row** - `3c306e58b` (feat)
3. **Task 3: Version row, What's new owner** - `71af33832` (feat)
4. **Fix: mount Size and Version rows** - `dc58485d8` (fix)
5. **i18n scope bookkeeping** - `84a2bc2eb` (chore)

The tracer gate: its `<verify>` was automated-only, so it was re-run end to end (jest, codecheck, prettier) before expanding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Size and Version rows were never mounted in InstallTab**
- **Found during:** Task 3 plan-end gates (`pnpm lint`: "'SizeRow' is defined but never used")
- **Issue:** My scripted insertion into `InstallTab/index.tsx` missed its anchor after prettier reformatted the JSX, so commits for Tasks 2 and 3 landed the components without rendering them; the source gate only pinned LocationRow so it stayed green.
- **Fix:** Mounted SizeRow and VersionRow (with handleUpdate and hasUpdate) inside `installFacts`, and added a source-gate test pinning Size then Version before `legacyRows` plus the update props.
- **Files modified:** InstallTab/index.tsx, InstallTab/__tests__/installTabSource.test.ts
- **Commit:** dc58485d8

**2. [Rule 3 - Blocker] Token spec read `white-space` as a colour keyword**
- **Found during:** Task 3 full Frontend jest run
- **Issue:** `themeTokens.test.ts` forbids `\b(?:black|white)\b` in the Install tab CSS; the fact value's ellipsis needs `white-space: nowrap`, which matched.
- **Fix:** Tightened that regex with `(?!-space)` and a comment; the property is not the colour keyword the spec guards against.
- **Files modified:** src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts (not in the plan's file list)
- **Commit:** dc58485d8

**3. [Rule 2 - Missing] Added a "· update available" fallback key**
- **Found during:** Task 3
- **Issue:** `{{version}} available` would render empty when `gameInstallInfo` carries no version.
- **Fix:** New `gamelib:gamepage.installTab.availableNoVersion`. Key list in the plan's artifacts is otherwise unchanged (plus `size`, `location`, `version` labels the plan implied).
- **Commit:** 71af33832

**Total deviations:** 3 auto-fixed (1 bug, 1 blocker, 1 missing). **Impact:** none on scope; the first would have shipped an Install tab with no Size or Version row had lint not caught it.

## Issues Encountered

- `pnpm exec jest --selectProjects Meta --testPathPattern 'genI18nGateScope|hardcodedStringGate'` takes about 210 s (the hardcoded-string gate), longer than the default tool timeout; it passed run in the background.

## Verification Results

- jest: FactRow, installTabSource, SwitchRow, dialogOptionForwarding (six files), GameStatus tests, full Frontend project (382 suites, 6601 tests) green; Meta genI18nGateScope and hardcodedStringGate green.
- `pnpm codecheck` clean, `pnpm lint` production PASS and tests PASS, `pnpm find-deadcode` PASS, `pnpm gameinfo-narrowing-ceiling` PASS, `backend-di-ceilings --shard frontend-screens-game` PASS (0 frontend FAIL lines), `pnpm i18n-churn-guard` clean, prettier `--check` clean over every non-ignored written path (`public/locales/en/gamelib.json` is prettier-ignored).
- Acceptance greps: `openDialog(` in useInstallLocationActions prints 2; `toHaveLength(6)` prints 1; `truncatedPath` in InstalledInfo prints 1; `ModifyInstallModal` in SizeRow prints 3; `info.size` and `info.version` in InstalledInfo print 0; `useRowAction('repair'` in VersionRow prints 1; `whatsNew` in GameStatus prints 3.

## Known Stubs

None.

## Threat Flags

None. T-100-10 to T-100-13 are mitigated as planned: pickers only via useOpenDialog (census-enforced), fixed translated failure strings with raw errors to the log, changelog only through GameChangeLog (source-gated), and FactAction ignores clicks while busy or aria-disabled.

## Next

Ready for 100-05 (engine row, static facts, cloud sync). The dialogOptionForwarding census stays at six files until plan 09 deletes GameSubMenu.

## Self-Check: PASSED

- Created files all present on disk (FactRow, gateReasonText, LocationRow, SizeRow, VersionRow, WhatsNewLink, useInstallLocationActions, both tests).
- Commits `6090a99d0`, `3c306e58b`, `71af33832`, `dc58485d8`, `84a2bc2eb` are ancestors of HEAD; GameSubMenu and DotsMenu have no diff.
