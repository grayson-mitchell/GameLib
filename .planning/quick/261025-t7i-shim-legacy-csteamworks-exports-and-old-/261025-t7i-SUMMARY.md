# Quick 261025-t7i: Legacy CSteamworks64 exports + SDK 1.34 interface versions

**Status:** Complete. Task 1 code `99eaac2f3`; a fix found during the live check `4d26c70d1` (debug uw-284100-no-iface-pins); Tasks 2 and 3 run with the operator on 2026-10-25. Steam path works on x64. Recorded as working but unverified under the unchanged 53-11 rule (operator decision). The game itself still exits on a Media Foundation video error, which is a separate follow-up.

## Task 1 (done)

The x64 shim now exports all 29 names CSteamworks64.dll imports from steam_api64.dll. The 6 that were
missing are added: `SteamAPI_InitSafe`, `SteamGameServer_InitSafe`, `Steam_RunCallbacks`,
`Steam_RegisterInterfaceFuncs`, `Steam_GetHSteamUserCurrent`, `g_pSteamClientGameServer`. They are x64-only.

- `SteamAPI_InitSafe`: marker keepalive, `gamelib_bridge_hello()`, then one `gamelib_report_init(GAMELIB_INIT_FN_STEAMAPI_INITSAFE, 1)` (code 2). It never calls `SteamAPI_Init()`.
- `SteamGameServer_InitSafe` returns 0, `Steam_GetHSteamUserCurrent` returns 1, the two callbacks are no-ops, `g_pSteamClientGameServer` is `void *... = NULL` (plain name in the .def, no DATA needed: objdump shows it exported).
- 10 manifests extracted at the pinned Proton SHA, each from its own block. Slot counts match RESEARCH exactly: 25/26/24/52/58/25/7/36/24/2. Ordinals 59-68, append-only.
- 10 rows in `SHIM64_SERVED_INTERFACE_VERSIONS`.
- Export count: x64 1012 -> 1028 (6 legacy + 10 flat accessors). x86 .def byte-identical, 45 exports.

### Verification (all run, results as observed)

- Export diff gate (W5): new `pnpm check-csteamworks64-exports` (`meta/checkCsteamworks64Exports.cjs`, non-zero on failure): `x64: 29/29 CSteamworks64 imports exported (1028 total exports)`, `x86: 45 exports, 45 in steam_api.def`, no x64-only legacy name leaked into x86. Exit 0. It parses `objdump -p` of the built DLLs, so it needs a prior `pnpm build-steam-bridge`.
- W1 pins (shimCoverage.test.ts): SteamUser018 BLoggedOn slot 1 and GetSteamID slot 2 `wire`; SteamUtils007 GetAppID slot 9 `wire`; slot counts for all ten; `findUnservableInterfaceVersions` returns `[]` for the CSteamworks64 import set and a 22-version map. Extractor and RESEARCH agreed, nothing was adjusted.
- W3 (read-only, copied to scratchpad `.../scratchpad/w3/CSteamworks64.dll`; the bottle was only read): IAT slot for `g_pSteamClientGameServer` is 0x180014278. `objdump -d` shows 9 references:
  - 7 in the game-server context-init routine at 0x1800013c0-0x180001520, whose only caller is `GameServer_InitSafe` (0x180001934), reached only after `SteamGameServer_InitSafe` returns true. We return 0.
  - 1 in `GameServer_InitSafe` itself (0x180001920: `cmpq $0,(%rax)`), which derefs our valid NULL variable and returns false.
  - 1 in the exported `SteamClientGameServer()` accessor (0x1800019e0), which returns NULL. It has no caller inside the DLL.
  - No non-game-server path dereferences it. A4 holds.
- Jest `meta/` + `src/backend/storeManagers/steam/bridge`: 66 of 69 suites pass; 2400 tests pass, 5 fail, 1 skipped. The three failing suites are not caused by this work:
  - `findDeadcode.test.ts` "exits 0 against the real repo": lists 9 dead exports in `sidecarTransport.ts`, `knownFixes.ts`, `delayImportPe.ts`, `sharedRedists.ts`, `types.ts`, `crossoverInstallRisk.ts`. None are in files I touched.
  - `genI18nGateScope.test.ts` A-17 anti-rot (fork-touched-files vs live git derivation).
  - `machineFillGamelib.test.ts` `pluralCategoriesFor` (ar, ru, underscore code) x3.
  - I did not fix them (out of scope). The targeted suites (gen_vtables, extractProtonInventory, bridge `__tests__/`, 22 suites, 922 tests) all pass.
- `pnpm codecheck`: exit 0. Scoped `npx prettier --check` over all touched JSON/TS/cjs/package.json: pass (the manifests are not ignored). `pnpm planning-gates`: 12/12 pass.
- `graphify update .` run. `git status` after the commit shows only the untracked quick-task dir.

## Deviations

1. **[Rule 3 - blocking] `helperInterface` added by hand to 3 manifests.** The extractor does not emit it, and `generateDispatchHeader` throws without it for wire manifests. Added `SteamAPI_SteamUser_v023` (User018), `SteamAPI_SteamUtils_v011` (Utils007), `SteamAPI_SteamApps_v009` (Apps007), matching the neighbouring versions. A re-run of the extractor on these three would drop the line.
2. **[Plan adjustment] `STEAMAPPS_INTERFACE_VERSION007` is `wire`, not `stub`.** The manifest carries 14 wire methods, so the 53-12 rule ("wire only where the manifest carries a wire method") makes it wire, like Apps008. User018 and Utils007 are wire as planned.
3. **[Rule 1 - test] An existing j4l test used `STEAMHTTP_INTERFACE_VERSION002` as the "unserved" stand-in.** It is now served, so the test uses `...VERSION001`.
4. **TDD order:** the implementation was written before the new tests, so there was no observed RED run. The tests pin the behaviour and pass.
5. `acceptance-interface-versions.json` was reformatted by my first write and re-run through prettier. The final diff is +50 lines only.

## Not committed / left alone

- `public/bin/arm64/darwin/steam_api64.dll`, `steam_api.dll` (and the helper, rebuilt unchanged from source) are gitignored (`public/bin/.gitignore`). They are rebuilt on disk and not in the commit. The plan listed the two DLLs under files_modified; there is nothing to commit for them.
- No bottle was written. The only bottle access was the read-only copy of `CSteamworks64.dll`.
- Pre-existing dead-export and i18n/plural failures are logged above, not fixed.

## Commits

- `99eaac2f3` feat(quick-261025-t7i): x64 legacy CSteamworks64 exports and 10 SDK 1.34 interface versions
- `4d26c70d1` fix(debug-uw-284100): ignore export-table 'DLL name:' when scanning PE imports (found by the live check, `.planning/debug/resolved/uw-284100-no-iface-pins.md`)

## Task 2 (done, 2026-10-25): restore originals from depot 284101

- The bottle ACF named depot 284101, manifest 3159369609451446961.
- The operator ran `download_depot 284100 284101 3159369609451446961` in the Mac Steam console. The Mac console does fetch a Windows depot. Files landed in `Steam.AppBundle/Steam/Contents/MacOS/steamapps/content/app_284100/depot_284101/`. The console printed the path with Windows backslashes, but the directory is a normal one.
- Both originals had 0 GameLib markers. shasums: steam_api64.dll 59ac74f6…, steam_api.dll a150b754…
- steam_api64.dll names SteamClient017 and 15 other versions. All are served on x64 except STEAMUNIFIEDMESSAGES001, which is a family with no served version and so is eligible for the null object.
- The shims were backed up to the scratchpad, then the originals copied in. `pnpm bridge-census` classed 284100 as `bridge`.
- Placement then kept both originals as `.gamelib-orig`.

## Task 3 (done, 2026-10-25): live check

### 1. Unclaimed World 284100 bridge launch reaches Steam through CSteamworks64
expected: no `unimplemented function` crash; HELLO; `GINIT fn=SteamAPI_InitSafe ok=1`; cfg pins `iface.SteamClient=SteamClient017`; Steamworks.NET init succeeds; game-originated CALLs
result: pass — working, but NOT verified under the unchanged 53-11 rule, which needs 2 or more game calls including an identity call (operator decision: keep the rule).

Run 1, 21:43:
- The InitSafe crash is gone: HELLO, then `GINIT fn=SteamAPI_InitSafe ret=1 ok=1`, the window was raised and the process lived 210 s.
- `gamelib_bridge.cfg` had no `iface.` lines, so `Errors.txt` logged `[Steamworks.NET] SteamAPI_Init() failed`.
- Debug session uw-284100-no-iface-pins found the cause: `importParse.ts` matched the export table's `DLL name: CSteamworks.dll` line as an import. That produced a conflicting-headings error, the x64 importer was dropped, and placement took the marker-only miss path with `interfaceVersions {}`. Fixed in `4d26c70d1`, with a regression test.

Run 2, 22:00, after restoring the originals again and restarting tauri dev:
- Placement logged `covered by importer PE(s) CSteamworks.dll, CSteamworks64.dll -- shim placed`, with no conflicting or miss warnings.
- The cfg has 22 `iface.` lines (SteamClient017, SteamUser018, SteamFriends015, SteamUtils007, STEAMUSERSTATS011, STEAMAPPS007 and others; 16 stubbed).
- HELLO and GINIT ok, then the first game-originated call: `CALL SteamUtils007.GetAppID`.
- No new `SteamAPI_Init() failed` line was written.
- Census: `unverified (1 game call; needs 2 incl. identity)`.

Separate from the Steam path: in both runs the game then shows "Whoops - fatal error … HRESULT: [0xC00D36BB]". `Errors.txt` traces it to `SharpDX.MediaFoundation.SourceResolver.CreateObjectFromURL`, from `Video.PlatformInitialize`, from `BackgroundScreen.LoadContent`. The file is the main-menu background `Content/MainMenu/TauCetiMainMenu.wmv` (ASF/WMV), and Wine Media Foundation cannot open it. This is the "does music and video play" question the runtime-components todo left open. Filed as `2026-10-25-unclaimed-world-mainmenu-wmv-fails-in-wine-media-foundation.md`.

Census side note: after this run Manor Lords 1363080 showed `unverified (no HELLO)`. The cause is log rotation, not this change: two tauri dev restarts pushed its 20:55 launches out of every log the census reads, and its class column is unchanged. No other row changed.

## Follow-ups filed

- `.planning/todos/pending/2026-10-25-unclaimed-world-mainmenu-wmv-fails-in-wine-media-foundation.md`
- `.planning/todos/pending/2026-10-25-bridge-shims-placed-without-gamelib-orig-backup.md`
