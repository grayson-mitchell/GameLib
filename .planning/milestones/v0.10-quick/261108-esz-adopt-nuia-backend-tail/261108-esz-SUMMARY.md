---
quick: 261108-esz
status: complete
completed: 2026-11-08
---

# Quick 261108-esz: noUncheckedIndexedAccess adoption, backend tail (19 buckets)

All three tasks done. 19 per-bucket commits on main, ratchet exit 0 after every commit. No drift-reconcile commit was needed. Baseline total after: 1435 (todo updated to match, still in pending/, frontmatter intact).

## Commits

Task 1: wine e54700da3 (creates `src/backend/testUtils/indexed.ts`, exports `defined` only), utils 639a5da38, utils.ts f288259b9.
Task 2: testUtils fd39c6b63, downloadmanager 433f71108, knownFixesRegistry.ts bbf6d2318, launcher.ts add6a189e, knownFixOverlayArchive.ts 4bfe36fd7, save_sync.ts 7757b5b7d.
Task 3: storeSearch c609418b9, wiki_game_info d4bee6ed7, signInProbe 245f93371, scanners dd923a8ef, storeManagers/sideload 177bd3b72, appshell 9942daad6, logger 648cf7cc0, platform a019cf212, steamgrid e768c37d1, storeManagers/nile c32392a42.

## Error-path behaviour notes (valid input unchanged)

- semverGt: NaN defaults / early `return false`; differential-tested against the old function over 676 input pairs (identical).
- wine/manager/utils.ts removeWineVersion: binds the stored entry and still removes only its recorded installDir (T-01).
- wine downloader: no `-latest` entry when the release list is empty.
- utils/filesystem/unix.ts: `df` output with no data line throws an explicit Error (was TypeError). systeminfo: no CPUs throws explicit Error (was TypeError).
- utils/openDialog.ts and platform types.usage mirror: not-cancelled with empty filePaths now returns `false` (was `undefined`).
- compat layers GPTK: empty `mdfind` result skips (existsSync(undefined) was false).
- launcher.ts: PowerShell redaction skips when `-ArgumentList` is last (was TypeError); `appNameFromCommandParts` out-of-range gives `''`.
- knownFixOverlayArchive: missing header byte throws `overlay archive: truncated header`.
- save_sync: missing variable group skipped. sideload library: empty MacOS dir leaves executable unchanged (was TypeError).
- HLTB parsers: `)![1]` non-null assertions replaced by a throwing `captureGroup` (still caught, logged, returns null).
- signInProbe/classify: an absent status is never "expired" (T-03). logger: unreachable missing escape maps to `''`, never lets a raw line break through (T-02).
- testUtils parsers throw descriptive Errors on a missing regex group.

## Verification (run once after Task 3, not per task)

ratchet PASS; `pnpm codecheck` 0; eslint on all changed src files 0; `pnpm boundaries` 0; `pnpm find-deadcode` 0 (green); jest per bucket green (all touched suites incl. src/backend/sidecar/__tests__, 108 suites); prettier check on changed files clean; added-lines scan finds no non-null `!` and no `as any/unknown`.
`pnpm planning-gates`: 11/12; failing gate is `.planning/STATE.md` frontmatter (unindented line 7, from quick 261108-eps), not touched by this plan. Left alone.
`graphify update .` not run.

## Deviations

- Per-task verification ran once at the end, not after each task.
- Where two buckets were finished together (knownFixOverlayArchive/save_sync, sideload/nile, and the last five), the not-yet-committed file was temporarily restored from a scratchpad copy so each commit kept the ratchet green.
- The baseline-empty case did not arise; the todo remains open with remaining buckets.

## Known Stubs

None.
