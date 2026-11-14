# Quick 261114-rc8: Show Steam ACF buildid as install version

Installed Steam games now carry `install.version` = the ACF `buildid`, so Install Info shows "Version: <buildid>" instead of an empty value. Backend only.

## Commits
- 77221bf47: producers carry buildid (`installedMap`, `readAcfState`) and the shared `installVersionField` helper
- 49fb075bc: `install.version` written at every install-block site, plus staleness refresh

## Changes
- `installVersionField(buildid)` returns `{version}` only for a non-empty, non-'0' trimmed buildid, otherwise `{}`.
- Spread into `refresh()`, `refreshInstallState()`, `pollInstallOnce` ('installed' tick) and the uninstall-poll survivor block.
- `refreshInstallState()` now also rewrites, persists and pushes when only the buildid changed (a Steam update). The arch-check backstop (`verifyMacArchGroundTruth`) is gated on `flipped`, so a version-only change does not re-fire it.
- `bridgeInstallState.ts` and `SteamInstallCopy` were left unchanged, as planned.

## Verification
- jest: 18 suites / 463 tests pass (`library.*` plus `steamFocusRefreshWire`).
- `tsc --noEmit`: clean.
- `prettier --check`: clean on all written paths.
- `graphify update .` run.

## Deviations
- The planned assertion that `verifyMacArchGroundTruth` is not called on a version-only change was dropped: `macArch` is not mocked in `library.refresh.test.ts`. The behavior is enforced by the `flipped &&` condition in code and is not directly unit-tested.

## Notes
- The 261114-obu working-tree changes were left untouched and unstaged.
- Live check: `pnpm build:sidecar`, restart `pnpm tauri:dev`, then open an installed Steam game's Install Info.
