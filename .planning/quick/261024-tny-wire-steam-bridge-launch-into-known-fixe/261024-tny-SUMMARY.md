---
status: complete
quick_id: 261024-tny
completed: 2026-10-24
commits: [2b3b54b55, 7670a5990, a25bafc43, 604972a36, 056271410]
---

# Quick 261024-tny: Wire Steam bridge launch into known-fixes

`fixes/<appId>-steam.json` is now read under that name (`storeMap.steam = 'steam'`). On a bridge launch, `applySteamBridgeKnownFixes` runs winetricks verbs and runInPrefix entries against `GameLibSteamBridge-<appId>` and passes `envVariables` through a per-launch copy of the bridge settings, before the process monitor and the wine launch.

## Commits
- 2b3b54b55 feat: storeMap.steam, D1 skip in downloadFixesFor, removeFixFile and gamesdb guards, new pending todo, tests
- 7670a5990 test: applier tests and explicit-settings Winetricks test
- a25bafc43 feat: `bridgeKnownFixes.ts` and the `Winetricks.install`/`runWithArgs` trailing explicit-settings parameter
- 604972a36 feat: call the applier from `fireBridgeWineLaunch` (+ games.test.ts cases)
- 056271410 chore: close the source todo (moved to completed/ with a close note)

## Verification
- jest: knownFixes, downloadmanager utils, wiki_game_info, tools, steamBridgeKnownFixes and the whole steam tree all pass (last run 2318 tests).
- `pnpm codecheck` clean, `pnpm planning-gates` 12/12, eslint 0 errors (warnings pre-existing), prettier clean and every path prettier-seen.
- `graphify update .` run.

## Deviations
- [Rule 3] `winetricksInstallPathInvariant.test.ts` Invariant 1 allowlisted only `winetricksQueue.ts` and `launcher.ts` as `Winetricks.install(` callers. The new backend-only caller `steam/bridgeKnownFixes.ts` tripped it, so I added it to the allowlist with a comment. This edits a pre-existing assertion (needed, and the invariant's renderer-reachability intent still holds).
- TDD ordering: the explicit-settings Winetricks test was written after the tools/index.ts edit, so it was never seen red. The other new tests were seen red or are regression guards (the gamesdb steam case passed before the fix, as `storeMap.steam` was undefined). Task 2 test and feat were committed as separate commits; Task 1 as one commit.
- games.test.ts uses one file-scope passthrough `beforeEach` for the applier mock instead of per-describe ones (covers every describe).

## Not done (per plan)
Applied-fix ledger, complex keys, local/bundled layers, live Mac check with a real fixes file.
