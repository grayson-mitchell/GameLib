---
phase: 35-electron-cutover-remove-the-electron-build
plan: 16
subsystem: preload
tags: [electron-cutover, secret-policy, preload, typescript, backend-platform]

requires:
  - 35-13 (backend/platform module and its first-party electron type declarations)
  - 35-14 (point of no return: Electron entry points deleted)
  - 35-15 (67-file mechanical import rewrite + reach-ledger baseline)
provides:
  - "one fail-closed secret-field policy (isAllowedStoreField) as the only access control on the storeGet boundary"
  - "preload/ipc.ts and preload/api/misc.ts with zero isTauri() branches, zero require('electron'), zero electron-store"
  - "every bare Electron. namespace reference in src retyped to a named backend/platform import"
  - "NodeJS.Process.getSystemVersion/getSystemMemoryInfo declared as first-party ambient types, independent of the electron package"
affects:
  - "35-17 (isTauri() collapse across the other 26 files / ~136 references, outside misc.ts and ipc.ts)"
  - "35-18 (removing the electron package/devDependency — this plan cleared the two grep-invisible import forms that would otherwise dangle)"

tech-stack:
  added: []
  patterns:
    - "declare global augmentation in backend/platform/types.ts as the first-party replacement for an ambient type electron.d.ts stops supplying once its last real import is gone"
    - "fail-closed allow-list (isAllowedStoreField) as the single secret-field policy, replacing a parallel Electron-only deny-list"

key-files:
  created: []
  modified:
    - src/common/types/__tests__/storePolicy.test.ts
    - src/preload/api/misc.ts
    - src/preload/ipc.ts
    - src/backend/platform/types.ts
    - src/preload/api/tauriGamepadInput.ts
    - src/common/typedefs/extra-mock-function.ts
    - src/preload/__tests__/gamepadActionRouting.test.ts
    - src/preload/__tests__/storeApi.test.ts
    - src/preload/__tests__/childWindows.test.ts
    - src/preload/__tests__/framelessRuntime.test.ts
    - src/preload/__tests__/steamInstallFormApi.test.ts
    - src/preload/tauriTransport.ts

key-decisions:
  - "D-01/D-02/D-04/D-08 convergence landed in ONE commit (3f31b37fd) per 35-PATTERNS.md Pitfall 2: splitting the isTauri() collapse, the electron-store require removal, and the deny-list deletion across commits/waves would let the second or third silently revert or conflict with the first"
  - "Task 3's scope was widened past the plan's own files_modified list into backend/ and common/ files, because the plan's own grep-based acceptance criteria are unscoped over those directories and the machine-checked criteria are authoritative — same stance Task 2 took for isTauri()"
  - "backend/platform/types.ts required a genuinely NEW SECTION 9 (a declare global NodeJS.Process augmentation) that no prior plan anticipated, found and fixed inside this plan rather than deferred, because it was a regression this plan's own Task 3 caused"

requirements-completed: [REQ-35-18, REQ-35-02]

duration: "~3 hours across two sessions"
completed: 2026-08-29
---

# Phase 35 Plan 16: Preload Surface Collapse Summary

Unified the two divergent secret-field policies onto the fail-closed allow-list, removed every `isTauri()`/`require('electron')` branch from `preload/misc.ts` and `preload/ipc.ts`, and retyped all 32+ bare `Electron.` namespace references and remaining `import type ... from 'electron'` sites in `src` to first-party `backend/platform` types — discovering and fixing a genuine regression (a vanished `NodeJS.Process` ambient augmentation) along the way.

## Performance

- Duration: ~3 hours across two sessions (session 1: Tasks 1-3 code-complete plus the initial verify pass; session 2: the systeminfo regression root-cause/fix, a second grep-gate false positive, and all closing documentation)
- Tasks: 3/3 complete
- Files modified: 12 (2 test-infra, 4 preload runtime, 1 platform types, 1 preload comment, 1 declaration-merge shim, 3 preload test rewrites — see `key-files`)
- Commits: 4 (1 test, 2 feat, 1 fix)

## Accomplishments

- **Task 1** — Proved by extension, not assumption, that `storePolicy.ts`'s fail-closed `STORE_ALLOWLIST` blocks every field the old Electron-only `SECRET_STORE_KEYS` deny-list named. Extended `storePolicy.test.ts` with a separately-named assertion per field (`humbleConfigStore.sessionCookie`, `humbleConfigStore.csrfToken`, `steamConfigStore.refreshToken`, `gogConfigStore.credentials`, `zoomConfigStore.credentials`), a nested-path case per field, and an explicit fail-closed control on a never-listed field name. RED-proven on a scratch copy: temporarily adding `steamConfigStore.refreshToken` to `STORE_ALLOWLIST` failed 6 assertions. `misc.ts` was untouched by this task, satisfying the plan's ordering gate (T-35-72).
- **Task 2** — Collapsed `preload/api/misc.ts`'s three colliding concerns in one commit: deleted `SECRET_STORE_KEYS`/`isSecretStoreKey`, routed `storeGet` through `isAllowedStoreField`, unwrapped every `isTauri()` branch pair (`storeNew`/`storeGet`/`storeSet`/`storeHas`/`storeDelete` plus window-chrome and gamepad-action functions) to its Tauri-only body, and removed the now-dead lazy `require('electron-store')` and the `import type Store from 'electron-store'`. Added `storeApi.test.ts` covering `storeGet`'s blocked/nested-path/permitted paths and the other four functions' unconditional delegation; rewrote `gamepadActionRouting.test.ts` since its premise (an `isTauri()` routing decision) no longer exists.
- **Task 3** — Killed all 4 lazy `require('electron')` calls in `preload/ipc.ts` (`:27, :39, :54, :59`) and collapsed its `isTauri()` branch pairs to unconditional Tauri-transport bodies, matching Task 2's shape. Rewrote every `import type ... from 'electron'` site (Form 2) and every bare `Electron.` namespace reference (Form 3, 32 sites across 22 files) to named imports from `backend/platform`. Discovered and fixed a genuine regression this same task introduced: removing the last real `electron` import in `src` stopped TypeScript from folding `electron.d.ts`'s ambient `NodeJS.Process` augmentation into the program, breaking `process.getSystemVersion()`/`process.getSystemMemoryInfo()` at two live systeminfo call sites. Root-caused via a `git worktree` build at the pre-Task-3 commit (confirmed `tsc --noEmit` was clean there), then fixed with a narrowly-scoped first-party `declare global` in `backend/platform/types.ts` naming only the two members actually read.

## Task Commits

| # | Task | Type | Hash | Summary |
|---|------|------|------|---------|
| 1 | Prove allow-list subsumes deny-list | test | `8dafd8d91` | Per-field named assertions + nested-path cases + fail-closed control, RED-proven |
| 2 | Collapse `misc.ts` | feat | `3f31b37fd` | D-01/D-02/D-04/D-08 convergence in one commit |
| 3 | Kill Form 2/3/4 in `ipc.ts` + repo-wide retyping | feat | `e975bb456` | 4 lazy requires removed, 32 `Electron.` sites retyped |
| 3 (fix) | Restore `NodeJS.Process` typing | fix | `5dfd07e07` | Root-caused and fixed a regression Task 3 introduced |

Final metadata commit (this document, STATE.md, ROADMAP.md, REQUIREMENTS.md): recorded below after this document lands.

## Files Created/Modified

- `src/common/types/__tests__/storePolicy.test.ts` — Task 1's per-field allow/deny convergence assertions
- `src/preload/api/misc.ts` — one secret policy, zero `isTauri`, zero `electron-store`
- `src/preload/ipc.ts` — zero `require('electron')`, zero `isTauri`
- `src/backend/platform/types.ts` — new SECTION 9 (`declare global` `NodeJS.Process` augmentation); no other widening needed — every other type this plan required (`IpcRendererEvent`, `WebviewTag`, `DidFailLoadEvent`, `IpcMainInvokeEvent`, `ShortcutDetails`, `Rectangle`, `TitleBarOverlay`, `OpenDialogOptions`, `FileFilter`, `BrowserWindowConstructorOptions`, `MenuItemConstructorOptions`) was already declared by plan 35-13
- `src/preload/api/tauriGamepadInput.ts` — comment reworded to eliminate a literal-grep-gate false positive
- `src/common/typedefs/extra-mock-function.ts` — its two declaration-merged members now import `BrowserWindowConstructorOptions`/`MenuItemConstructorOptions` from `backend/platform` directly
- `src/preload/tauriTransport.ts` — a D-08 comment updated, now stale re: an Electron path that no longer diverges
- `src/preload/__tests__/gamepadActionRouting.test.ts`, `storeApi.test.ts` (new), `childWindows.test.ts`, `framelessRuntime.test.ts`, `steamInstallFormApi.test.ts` — rewritten to assert the transport `ipc.ts`/`misc.ts` now actually reach, since their own `isTauri()` checks (in `helpers.ts`, `settings.ts`, `steam.ts`) are untouched but the branch `ipc.ts` used to route through is gone

### `backend/platform/types.ts` widening — named per Task 3's own acceptance criterion

Added (Task 3 follow-up fix, commit `5dfd07e07`):

```typescript
declare global {
  namespace NodeJS {
    interface Process {
      getSystemVersion(): string
      getSystemMemoryInfo(): {
        total: number
        free: number
      }
    }
  }
}
```

- **Motivating sites:** `src/backend/utils/systeminfo/index.ts:131` (`process.getSystemVersion()`), `src/backend/utils/systeminfo/memory/windows.ts:6` (`const { total, free } = process.getSystemMemoryInfo()`)
- **Why it was needed:** `node_modules/electron/electron.d.ts` is a global script `.d.ts` (no top-level `import`/`export`); TypeScript only folds its declarations — including this `NodeJS.Process` augmentation — into the compiled program when some file under `src` still resolves the module specifier `'electron'`. Task 3's own Form 2 rewrite removed the last such import anywhere in `src`, and the augmentation vanished as a side effect.
- **Scope:** only the two members actually read are declared. `electron.d.ts`'s real `SystemMemoryInfo` interface has additional fields (`fileBacked` darwin-only, `purgeable`, `swapped`) that nothing in this tree reads — not declared here.
- **Both call sites are live, reachable production code** (`getSystemInfo`/`formatSystemInfo` are reached from the frontend boot IPC call, per that module's own header comment), not dead Electron-main-process-only code retired by this migration.

## Decisions Made

- **D-01/D-02/D-04/D-08 landed in one commit, not staged across tasks or waves** — `misc.ts`'s three concerns (isTauri collapse, electron-store require removal, deny-list deletion) are documented in `35-PATTERNS.md` as a named pitfall (Pitfall 2) precisely because staging them lets the second or third silently revert or conflict with the first.
- **Task 3's scope was widened into `backend/`/`common/` files not on the plan's `files_modified` list** — the plan's own acceptance criteria (`grep -rn "Electron\." src`, `grep -rn "from 'electron'" src/frontend src/preload src/common`) are unscoped over those directories, and per this plan's own precedent (Task 2 took the same stance for `isTauri()`), the machine-checked criteria are authoritative over the file list.
- **The systeminfo regression was fixed in a new commit, not by amending `e975bb456`** — per project convention, always create new commits rather than amending. Commit `e975bb456`'s own message asserted "two pre-existing, untouched systeminfo errors excluded"; this claim is now known to be false (a `git worktree` build at the immediately-prior commit `3f31b37fd` showed `tsc --noEmit` clean there) and is corrected here rather than by rewriting history: **the systeminfo errors were a regression this task introduced, not a pre-existing condition.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `NodeJS.Process.getSystemVersion`/`getSystemMemoryInfo` typing regression**
- **Found during:** Task 3, discovered while running the full automated verify script for the first time (it had previously short-circuited earlier on `pnpm codecheck`)
- **Issue:** Task 3's Form 2 rewrite removed the last real `import ... from 'electron'` in `src`, which stopped TypeScript from folding `electron.d.ts`'s `NodeJS.Process` ambient augmentation into the program, breaking two live systeminfo call sites with TS2339
- **Fix:** Added a narrowly-scoped first-party `declare global` in `backend/platform/types.ts` (SECTION 9), declaring only the two members actually read
- **Files modified:** `src/backend/platform/types.ts`
- **Commit:** `5dfd07e07`

**2. [Rule 1 - Bug] Literal-grep-gate false positive in `tauriGamepadInput.ts`**
- **Found during:** Task 3, same verify-script run as above
- **Issue:** A comment reading "This module imports nothing from `electron` ..." literally matched the verify script's `grep -rln "from .electron." ` regex (`.` as single-char wildcard matched the backtick-quoted "from `electron`")
- **Fix:** Reworded the comment to "This module has no electron dependency ..." — same meaning, no literal substring match
- **Files modified:** `src/preload/api/tauriGamepadInput.ts`
- **Commit:** `5dfd07e07`

**3. [Rule 2 - Missing functionality] Task 3's widened scope into `backend/`/`common/` files**
- **Found during:** Task 3
- **Issue:** The plan's own machine-checked acceptance criteria (repo-wide `Electron.` grep, `src/frontend`+`src/preload`+`src/common` electron-import grep) are broader than the plan's `files_modified` list
- **Fix:** Retyped `Electron.` sites and rewrote `import type ... from 'electron'` sites wherever the criteria are checked, not just the listed files
- **Files modified:** see `key-files.modified` above
- **Commit:** `e975bb456`

### Stale documentation corrected outside this plan's own commits (found during closing pass)

`.planning/ROADMAP.md`'s plan checklist for 35-13/35-14/35-15/35-16 and the phase's "Plans:" summary line were stale (`[ ]` unchecked / "12/19") despite those plans being complete — those closing commits deliberately left ROADMAP.md untouched (per `bcf257600`'s own commit message: "the orchestrator owns those"). Corrected in this plan's closing pass, following the established precedent (`e58efe8ea docs(35): wave 4 complete — 9/19 plans, and tick 8 boxes that had drifted`).

## Surviving `electron` string matches (Task 3's grep acceptance criterion)

`grep -rn "electron" src/frontend src/preload src/common` returns 104 matches across 41 files after this plan. None are Form 2/3/4 (real imports, ambient namespace references, or lazy requires). Every surviving match falls into one of five categories, given here with a one-word reason so plan 35-18's D-03 grep gate can distinguish these from real references:

| Reason | What it covers | Representative files |
|--------|-----------------|----------------------|
| `identifier` | The `electronStores` module/variable name (a renderer-mirror name, not an electron-store consumer) and test-local variables built from it (`electronStoresPath`, `rawElectronStores`, `electronApi`, `electronArmReturnsEmptyFragment`) | `src/frontend/index.tsx`, `src/frontend/state/GlobalState.tsx`, `src/frontend/screens/**/index.tsx` (12 files importing named stores from `frontend/helpers/electronStores`), `src/preload/__tests__/tauriAttach.test.ts`, `src/frontend/state/__tests__/GlobalStateSteamCacheHydration.test.ts`, `src/frontend/screens/WebView/components/__tests__/WebviewUnavailablePanel.test.tsx` |
| `mock` | Deliberate negative-mock harnesses: `jest.mock('electron', () => { throw new Error('electron must not be resolved on the Tauri path (T-27-07)') })`, proving `electron` is never resolved | `childWindows.test.ts`, `steamInstallFormApi.test.ts`, `framelessRuntime.test.ts`, `gamepadActionRouting.test.ts`, `tauriTransport.test.ts`, `storeApi.test.ts`, `windowChrome.test.ts` (7 files) |
| `comment` | Architecture/rationale prose mentioning `electron` or the separate `electron-store` npm package by name (a different package from `electron` itself) | `src/frontend/screens/Settings/index.tsx`, `src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts`, `src/frontend/screens/Login/index.tsx`, `src/frontend/screens/Accessibility/__tests__/index.test.tsx`, `src/frontend/components/UI/CachedImage/index.tsx`, `src/preload/tauriTransport.ts`, `src/preload/ipc.ts`, `src/preload/index.ts`, `src/preload/api/steam.ts`, `src/common/types/steam.ts`, `src/common/types/storePolicy.ts`, `src/common/types/sidecarTransport.ts` (9 comment lines referencing `electronStub.ts`), `src/common/types/__tests__/storePolicy.test.ts`, `src/common/typedefs/extra-mock-function.ts` |
| `filename` | References to the `electron_store.ts`/`electronStores.ts` filenames themselves (the files, not the package) | `src/preload/api/misc.ts:114` (`import type { StoreOptions } from 'common/types/electron_store'`), `src/common/types/electron_store.ts` (self-referential header comments), `src/common/types/storePolicy.ts:32` (`import type { ValidStoreName } from './electron_store'`) |
| `reference` | A pre-existing, out-of-scope triple-slash ambient type reference to the unrelated `electron-vite` transitive dev dependency — not Form 2/3/4, not touched by this task | `src/common/typedefs/vite.d.ts:2` (`/// <reference types="electron-vite/node" />`) |

## Threat Model Disposition (from this plan's own STRIDE register)

All 9 registered threats (`T-35-72` through `T-35-78`, `T-35-SC`) are mitigated as planned:

- **T-35-72/73/74/75** (secret-policy convergence risks) — closed by Task 1's ordering gate and per-field named assertions, verified green before Task 2 touched `misc.ts`.
- **T-35-76** (split-commit reversion risk) — closed by landing all three `misc.ts` concerns in one commit (`3f31b37fd`).
- **T-35-77** (`: any` widening to force a compile) — verified zero `: any` introduced across all touched files (`git diff` count = 0).
- **T-35-78** (Form 3/4 surviving into a build without `electron`) — verified zero `Electron.` references repo-wide and zero `from 'electron'` imports in `src/frontend`/`src/preload`/`src/common`.
- **T-35-SC** (accept — no new dependency added).

No new threat surface (network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries) was introduced beyond what the plan's own threat model anticipated. The `NodeJS.Process` `declare global` addition is a compile-time type declaration only — it does not add or change runtime behavior, and is itself an artifact of the trust boundary the plan's own register already named ("ambient `Electron` type namespace -> compile-time checking").

## Known Stubs

None. This plan removes dead code paths (Electron branches that never ran) rather than introducing placeholders.

## Issues Encountered

- A genuine regression this plan's own Task 3 introduced (the systeminfo typing break) was not caught by Task 3's own verify script on first run, because that script short-circuits at `pnpm codecheck` — the script never reached its later `grep` steps until the regression was fixed. This meant the `tauriGamepadInput.ts` literal-grep-gate false positive was also not discovered until this session, after the codecheck fix let the script run to completion for the first time.
- `e975bb456`'s own commit message asserted the systeminfo errors were "pre-existing, untouched" — this is corrected in the historical record via `5dfd07e07`'s commit message and restated plainly here, per project convention of never amending a landed commit.

## User Setup Required

None. No new environment variables, credentials, or manual steps.

## Next Phase Readiness

Plan 35-17 (the broader `isTauri()` collapse across the remaining ~26 files / ~136 references, outside `preload/api/misc.ts` and `preload/ipc.ts`) is unblocked. Plan 35-18 (removing the `electron` package/devDependency) is one step closer: the two grep-invisible import forms (Form 2/3 bare namespace references, Form 4 lazy requires) that would otherwise dangle when the package is removed are now cleared in the preload layer, and the surviving-match reason table above gives 35-18's D-03 grep gate the categorization it needs to distinguish real references from prose/identifiers/mocks.

## Self-Check

- `src/preload/api/misc.ts`: FOUND
- `src/preload/ipc.ts`: FOUND
- `src/backend/platform/types.ts`: FOUND
- `src/preload/api/tauriGamepadInput.ts`: FOUND
- `src/common/types/storePolicy.ts`: FOUND
- `src/common/types/__tests__/storePolicy.test.ts`: FOUND
- Commit `8dafd8d91`: FOUND in git log
- Commit `3f31b37fd`: FOUND in git log
- Commit `e975bb456`: FOUND in git log
- Commit `5dfd07e07`: FOUND in git log
- `pnpm codecheck`: 0 errors
- `pnpm test --selectProjects Preload Frontend Common`: 140/140 suites, 2297/2297 tests passing
- `grep -rn "Electron\." src` (excluding electron_store/electronStore/electronStub identifiers): none
- `grep -rln "from 'electron'" src/frontend src/preload src/common`: none
- `grep -n "require('electron')" src/preload/ipc.ts`: none
- `grep -c "isTauri" src/preload/ipc.ts src/preload/api/misc.ts`: 0, 0
- `git diff` `: any` count across touched files: 0

## Self-Check: PASSED
