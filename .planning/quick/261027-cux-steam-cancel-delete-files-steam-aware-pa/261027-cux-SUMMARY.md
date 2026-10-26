# Quick 261027-cux: Steam Cancel Delete Files Summary

Steam "Delete Files" on a cancelled native download now removes `common/<installdir>`, `appmanifest_<id>.acf` and `.acf.tmp` after the aborted run settles, clears the resume breadcrumb, and the button is back in the cancel dialog.

## Commits

- 6b8db906f: `steam/cancelDelete.ts` + 17 tests (real temp dir)
- eceb1ef9b: `downloadqueue.ts` Steam branch in `cancelCurrentDownload` + 3 tests
- 9271b7e67: dialog shows Delete Files for every runner, `messageSteam` removed, todo moved to completed

## Notes

- Native layout: no staging tree. Only the three paths above are removed; `downloading/`, `temp/`, `depotcache/` and the shared redist cache are untouched.
- Settle wait is bounded (60s, unref'd timer). Timeout or any refusal keeps files and the resume flag.
- `gamelib.json`: only the `messageSteam` line was staged (index-blob). The working tree keeps the 261027-aue hunks plus the removal. `games.ts` was not touched by this plan.

## Deviations

- [Rule 1 - lint] Typed the `parse()` result in `cancelDelete.ts` to clear two no-unsafe lint warnings.
- The `Skill` tool was unavailable; `gamelib-conventions` rules were applied from the CLAUDE.md index and the plan text.

## Verification

cancelDelete (17), downloadqueue (22), handleStopInstallation, MainButton routing and catalog parity tests pass. `pnpm codecheck`, eslint (new warnings: none), prettier on written code files, and `pnpm planning-gates` (12/12) are green. No prettier check on `gamelib.json` or todo files (prettier-ignored).

## Self-Check: PASSED
