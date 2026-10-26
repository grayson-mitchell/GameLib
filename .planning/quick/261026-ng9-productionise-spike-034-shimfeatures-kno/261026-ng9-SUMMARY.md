# Quick 261026-ng9: Productionise spike 034 shimFeatures Summary

Tier-2 `shimFeatures` profiles now reach the steam_api shim as `fix.` lines in `gamelib_bridge.cfg`; `shim_features.c` is compiled into both shims; Hoard's profile ships bundled.

## Commits
- 9e056f43f: backend wiring (prototype.patch applied cleanly), stale TIER1 comment fixed, `public/fixes/63000-steam.profile.json`, bundled-63000 test
- 9b9f2b5ef: `native/steam-bridge/shim/shim_features.c` + `SHIM_FEATURES_SOURCE_PATH` in both compile argvs + tests
- Uncommitted (docs, for orchestrator): `.planning/notes/per-game-compat-fixes-architecture.md` updated

## Decisions
- Placement: hand-written sibling (option b) at `native/steam-bridge/shim/`, not generated. gen_vtables.ts has no input for it, the steamclient_fwd.c precedent exists, and `pnpm gen-vtables` can never overwrite it. It owns the only DllMain; a future generator DllMain would fail the link with a duplicate symbol.
- Log file dropped: diagnostics go through `OutputDebugStringA` (no file in the game dir). Read via CrossOver's debug channels (`CX_DEBUGMSG=+debugstr` or `wine --cx-log <file> --debugmsg +debugstr`); WINEDEBUG is ignored by CrossOver's wine, and the file comment says so.
- `steam_api_shim.c` stays first source so zig's `.lib` byproduct names and prune lists are unchanged.

## Verification
- Jest: 7 backend suites green (533); meta buildSteamBridgeShims + gen_vtables green (282); full sweep `src/backend/__tests__ src/backend/storeManagers/steam meta buildSteamBridgeShims`: 116 suites, 3844 tests, 0 failures (testContainment not in scope of the sweep).
- tsc (`tsconfig.json`, `tsconfig.meta.json`) clean; prettier --check green on all .ts/.json paths.
- `pnpm build-steam-bridge`: all three compile gates passed; steam_api.dll and steam_api64.dll: 0 `misaligned address`/`panic:` strings, 1 `fix.wgl.hideExtensions=` string each; no stray .lib/.pdb; `git status public/bin` clean.
- `bridge-allowlist.json` untouched. `graphify update .` run.

## Deviations
None. Docs-only: the architecture note was left uncommitted per instructions.

## Follow-ups (not done)
- Packaged-build operator retest of Hoard with the bundled profile (reach single-player, strict bridge-verified bar); only then lift the does-not-run knownBad entry in `bridge-allowlist.json`.
- `launchNotice` candidate for the ~25s splash freeze.
- Option (b): overlays / dllOverrides / ledger.

## Self-Check: PASSED

## Live retest: packaged debug build (2026-10-26, operator)

Built with `pnpm tauri:dev:packaged`. The final updater-signing step failed (no `TAURI_SIGNING_PRIVATE_KEY`), but that runs after the `.app` is built, so it doesn't matter for this test. The bundle carried `Resources/build/fixes/63000-steam.profile.json` and both shims with the `fix.wgl.hideExtensions=` key and 0 UBSan strings. The sidecar carried the `shimFeatures` code. `fixes/local/` was empty.

The operator uninstalled Hoard, reinstalled it from the packaged app, and launched it. Their report: **"ran fine, reached menu"**. No crash dialog.

Evidence:
- `Reuben.exe` is `54be4b8c…`, the original.
- The placed shim is `02256cf5…`, the bundled `steam_api.dll`.
- The spike-era `gamelib_shimfix.log` is gone, and the redists were reinstalled, so it was a fresh bottle.
- The cfg ends with `fix.wgl.hideExtensions=WGL_ARB_create_context*`.
- `HELLO shim attached appid=63000`, then `GINIT fn=SteamAPI_Init ret=1 ok=1`.
- The game ran 97 s and ended normally.

The bundled profile alone makes Hoard run. Lifting the `does-not-run` knownBad entry is now unblocked.
