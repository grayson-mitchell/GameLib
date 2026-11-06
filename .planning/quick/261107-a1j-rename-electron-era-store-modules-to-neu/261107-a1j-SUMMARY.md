---
phase: quick-261107-a1j
plan: 01
tags: [rename, electron-removal, sidecar]
key-files:
  modified: [src/backend/typed_store.ts, src/common/types/typed_store.ts, src/frontend/helpers/stores.ts, src/backend/sidecar/bootstrap.ts]
  deleted: [src/backend/sidecar/installElectronHook.ts]
completed: 2026-11-07
---

# Quick 261107-a1j: Rename Electron-era store modules, retire the electron require hook

Renamed the 20 Electron-named store modules (19 + the humble test) to `stores.ts` / `typed_store.ts`, rewrote ~270 referencing files, and deleted `installElectronHook.ts` (0 runtime callers).

## Commits
- 86451c8da refactor: rename Electron-era store modules to neutral names (20 renames detected)
- d056981fc refactor: retire the electron require hook (bootstrap keeps `import '../platform'` first). The `git rm` of `installElectronHook.ts` was staged in the shared index and swept into concurrent docs commit 82b153915 (62-21); the file is gone from HEAD either way.
- 46a1a11ad docs: close the todo (moved to completed with Resolution; the pending-to-completed rename itself landed in an earlier concurrent commit)

## Safety checks
- On-disk identity: before/after diff of every `cwd:`/`name:`/`configName:` and `new *Store(` first-argument literal across all modules: empty (the one file with no constructors, the humble test, has no baseline file, nothing to compare).
- Only rename lines changed in the moved modules (filtered diff clean).
- Hook verdict: 0 runtime `electron` specifier callers in src/meta; 0 `require("electron")`/`import("electron")` in `build/main/sidecar.js`.

## Deviations
1. [Rule 3] Two sha256 pins in `gameDetailsImportGate.test.ts` (settingsFlowRegistration.ts, electronUntouched.test.ts) re-pinned; both files changed only by rename. Previous digests recorded in the comments.
2. [Rule 3] `meta/i18nForkTouchedFiles.json` / `i18nGateScope.json`: `helpers/stores.ts` re-inserted in sorted position.
3. [Rule 3] Prettier `--write` on 7 files whose shorter import paths now collapse onto one line (formatting only).
4. Doc line 1 of `typed_store.md`: "Electron Stores" prose -> "stores".

## Gate results
- `pnpm codecheck`: pass. `pnpm boundaries`: pass. `pnpm find-deadcode`: pass (44 OK). `pnpm smoke:sidecar`: PASS (exit 0). `pnpm planning-gates`: 12/12.
- `pnpm lint`: 1 error, `src/backend/storeManagers/steam/__tests__/games.test.ts:25 no-unnecessary-type-assertion` (line not touched by this plan; `games.test.ts` also fails at HEAD~ in a clean worktree: pre-existing).
- Prettier: pass over all changed paths (`src-tauri/src/relay_commands.rs` has no parser and is skipped by `--ignore-unknown`; `.planning/` is prettier-ignored, so no check on the todo).
- Full jest (`pnpm test:ci`): 6 suites / 6 tests fail, none caused by this plan:
  - `tauriShellSource.test.ts` (WR-07 `.title(format!`), `macArchKnownFixRouting.test.ts` (`steam://install/63000`), `games.test.ts`: confirmed failing at pre-change HEAD in a clean worktree.
  - `bottle.test.ts` and the Phase 56 channel-constants test: ENOENT on `.planning/phases/56-.../56-01-SUMMARY.md` (directory absent).
  - `genI18nGateScope.test.ts` A-17 anti-rot: the live git derivation differs from the snapshot by 16 unrelated files.
  - `x86CallbackWineHarness.test.ts` (live Wine, no reference to renamed code; passed once in a clean worktree, failed here: environmental).

## Human-only live check
Restart `pnpm tauri:dev` (it rebuilds the sidecar), then confirm the window renders the library rather than a blank screen and Settings opens.

## Self-Check: PASSED
Commits 86451c8da, d056981fc, 46a1a11ad exist; old paths absent; `installElectronHook.ts` absent.
