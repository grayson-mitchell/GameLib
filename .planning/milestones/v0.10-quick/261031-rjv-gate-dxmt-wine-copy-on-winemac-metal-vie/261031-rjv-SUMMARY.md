---
phase: quick-261031-rjv
plan: 01
status: complete
completed: 2026-10-31
commits: [657d5ae4a, 91096d713]
---

# Quick 261031-rjv: Gate DXMT Wine copy on winemac metal-view exports

An in-process Mach-O export reader now gates both DXMT listeners in `dxmt.ts`, so no `-DXMT` copy is created or updated for a Wine whose `winemac.so` lacks the macdrv metal-view exports.

## Commits
- 657d5ae4a: `src/backend/tools/machoExports.ts` and its test (13 tests).
- 91096d713: gate in `dxmt.ts`, new `dxmtExportGate.test.ts`, `dxmtBootFetch.test.ts` updated.

## Behaviour
- Install: the check runs on `join(installDir, version)` before `DXMT.getLatest()`. On failure, one `ToolInstaller` warning (version, winemac.so path, reason, missing symbols) and no download or copy.
- Update (`releasesInfoReady`): the census is now installed Staging wines whose `-DXMT` copy exists and passes. An empty list returns before the download. Failing copies get a warning and are left untouched.
- `rmSync` is never called by the gate. The uninstall listener is unchanged, with a regression test.
- No child process is spawned (no `nm`/xcrun).

## Verify
- jest, 3 files: 23/23 pass. `tsc --noEmit` clean. Prettier is clean on the 5 files. ESLint has 0 errors; 3 warnings sit on pre-existing lines in `dxmt.ts`.
- Real-binary probe: Gcenx Staging `winemac.so` returns ok:false with all four symbols missing, which agrees with `nm -gU` (it defines only `___wine_unix_call_*`). The parser on CrossOver's `winemac.so` includes `_macdrv_functions`.
- Grep: 3 non-comment references to `checkWinemacMetalViewExports` in `dxmt.ts`.

## Deviations
- None to behaviour. A non-null assertion in the parser was initially flagged by an unused eslint-disable; the directive was removed.
- Tightened the 260916-9vh gate as planned (D-C): a staging install with no `-DXMT` copy no longer triggers the boot fetch. The comment in `dxmt.ts` records this.

## Remaining gate for the operator (todo stays pending, ready: live-gate)
Live gate: restart `tauri dev` (it does not rebuild the sidecar; check sidecar.js mtime), then install or reinstall Wine-Staging-macOS from the Wine Manager on this Mac. Confirm (1) no new `-DXMT` engine appears (the existing `Wine-Staging-macOS-latest-DXMT` copy stays on disk untouched), and (2) the ToolInstaller log shows the skip warning naming `_macdrv_functions` and the three `_macdrv_view_*` symbols. An uninstall-then-install removes the old `-DXMT` copy via the unchanged uninstall listener; that is pre-existing behaviour, not this gate.

## Self-Check: PASSED
Files and both commits exist; `graphify update .` ran.
