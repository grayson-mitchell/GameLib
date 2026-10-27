# Phase 56: Plan Outline

Bridge steamclient-layer DRM mode for SteamStub titles. Chunked planning: this outline is the
contract that each single-plan run must follow. File ownership below is exclusive within a wave.

| Plan ID | Objective | Wave | Depends On | Requirements |
|---------|-----------|------|------------|--------------|
| 56-01 | Early runner-clone probe (Open Q3 / A3 / Pitfall 4): APFS-clone the installed CrossOver into scratch, then run a stock-created bottle under the clone's Perl `bin/wine` with `CX_BOTTLE`. Confirm that no prefix update happens and that `WINEDLLPATH` and `WINEDLLOVERRIDES` reach the Wine process. Record the launch form (`bin/wine` or raw `WINELOADER`+`WINEPREFIX`) that later plans must use | 1 | none | D-08, D-11 |
| 56-02 | lsteamclient native build: pinned, digest-checked Proton `lsteamclient`, NotProton's three overlay files, and GameLib's D-15/D-16 `[drm-trace]` additions. A time-boxed build against the CrossOver 26.3.0 source drop, falling back to stock Wine 11.15 headers. Compile gates check size floors and that the `.so` is unsigned. Kept out of release CI | 1 | none | D-01, D-02, D-15, D-16, D-19 |
| 56-03 | Ported ntdll detour payload (`detour.c`/`shim.S`/`link.ld`, GPL-3, x64 only) with a per-build pinned payload sha; vendored dev-only `resolve.py` that derives the patch table; ported HKCU-only game-process helper `steam.exe` (BSD-3, pure Win32, zig) with no HKLM writes and no `steam_drm_thread` | 1 | none | D-01, D-03, D-07, D-08, D-21 |
| 56-04 | DRM-mode contracts: `resolveBridgeMode()`, the `DrmStep` union and `drm-<step>` reason strings, the shared typed `DrmStepResult`, the `drmPaths.ts` cache, runner, component and trace layout, plus the `peSteamDrm.ts` header fix | 1 | none | D-09, D-12, D-13 |
| 56-05 | Zero-import `drmTrace.ts` parser and the `meta/bridgeCensus.ts` `classifyBridgeEvidence` DRM branch. Lines are anchored and role-tagged; helper lines and forged lines are rejected. The census marks `.bind` rows as routed to DRM mode | 1 | none | D-15, D-16 |
| 56-06 | Table-driven ntdll patch applier (`ntdllPatch.ts`) plus the committed `ntdllPatchTable.ts` row for CrossOver 26.3.0.39832, which doubles as the D-09 allowlist (build string plus clean sha). Tested on a synthetic PE, with a real-CrossOver sha test that skips when CrossOver is absent | 1 | none | D-03, D-09 |
| 56-07 | `valveClient.ts`: the `steam_client_win64` manifest, then the `bins_win64` node, then an HTTPS host-allowlisted download, a streamed sha256 checked against the manifest `sha2`, extraction of exactly three named DLLs via `/usr/bin/unzip` under fake-HOME, and a per-manifest-version cache that is reused offline | 2 | 56-04 | D-04, D-05, D-06 |
| 56-08 | `runnerClone.ts`: CrossOver build detection (`CFBundleVersion` plus clean ntdll sha) against the allowlist, with unsupported versions failing closed. `cp -c -R` with a `cp -R` fallback, xattr scrub, ntdll patch, lsteamclient builtin install with its signature removed, and a loader re-sign that adds the dyld entitlement. A cheap per-launch verify; stale clones are pruned only when no process runs from them | 2 | 56-01, 56-04, 56-06 | D-08, D-09, D-10 |
| 56-09 | `stageDrmBottle.ts`: put the `.gamelib-orig` originals back over the shim, delete `gamelib_bridge.cfg` and the stray forwarder, and stage the genuine DLLs plus `lsteamclient.dll` plus the helper into `C:\Program Files (x86)\Steam\`. HKCU-only registry with `SteamClientDll64` pointing at the genuine DLL | 2 | 56-04 | D-07, D-11, D-21 |
| 56-10 | The lsteamclient component as an on-demand release asset: a catalogue (pinned release URL, archive and per-file sha), an installer modelled on `knownFixOverlayInstall.ts`, an archive builder, the component `NOTICE`, and a Steamworks SDK License section in `THIRD-PARTY-NOTICES.md` | 2 | 56-02, 56-03, 56-04 | D-02, D-18 |
| 56-11 | `drmLaunchSetup.ts` orchestrator. Ordered steps run Mac Steam check, then CrossOver allowlist, then component, then runner, then Valve client, then bottle staging. Each step returns a typed result. Progress uses the `redist` status with a context label. Adds a DRM variant of `getBridgeBottleSettings` that swaps `wineVersion` to the clone, so every wine spawn for the appId uses one runner | 3 | 56-07, 56-08, 56-09, 56-10 | D-05, D-11, D-12, D-13 |
| 56-12 | `games.ts` wiring: branch in `launchBridgeGame` before `placeShimForGame`, run `drmLaunchSetup`, write the `[bridge-drm]` launch anchor, pass `GAMELIB_DRM_TRACE_FILE`, launch the helper `steam.exe <game exe>`, re-log the trace after exit, and add `maybeNotifyDrmModeFailed` with `drm.*` i18n keys. Never calls `markBridgeFailedThisSession`; never reroutes to bottled Steam | 4 | 56-05, 56-11 | D-05, D-12, D-13, D-15 |
| 56-13 | D-14 forwarder removal (sidecar, build, i18n): forwarder placement and registry, `maybeNotifySteamStub{Forwarded,Unforwarded}`, `steamstub.*` i18n keys in every locale, `builtBridgeSteamClient64Path`, forwarder compile code in `buildSteamBridgeShims.ts`, `native/steam-bridge/steamclient/`. Tests rewritten for DRM mode | 5 | 56-12 | D-14 |
| 56-14 | D-20 shim-side removal: `GameLibBridge_CreateInterface`, `g_bridge_steamstub_path_active`, `CONTROL_SLOT_CREATE_INTERFACE`, then regenerate so the computed `SHIM_EXPORT_SET_VERSION` changes (one forced rescan). Also fixes the stale `.bind` comments and updates the stale "don't build lsteamclient" spike-skill guidance | 5 | 56-12 | D-14, D-20 |
| 56-15 | Live gate (`autonomous: false`): build and publish the component asset, reinstall Grim Dawn 219990 through the bridge, then launch with only Mac Steam running. It must reach the menu and pass the `bridge-census` D-15/D-16 verified verdict. Raft 648800 and Ranch Simulator 1119730 results are recorded. One HKLM diagnostic run is allowed only if Grim Dawn fails | 6 | 56-13, 56-14 | D-15, D-16, D-17, D-18, D-21 |

## Decision coverage

| Decision | Plans |
|----------|-------|
| D-01 | 56-02, 56-03 |
| D-02 | 56-02, 56-10 |
| D-03 | 56-03, 56-06 |
| D-04 | 56-07 |
| D-05 | 56-07, 56-11, 56-12 |
| D-06 | 56-07 |
| D-07 | 56-03, 56-09 |
| D-08 | 56-01, 56-03 (dev-time pattern finder), 56-08 |
| D-09 | 56-04, 56-06, 56-08 |
| D-10 | 56-08 |
| D-11 | 56-01, 56-09, 56-11 |
| D-12 | 56-04, 56-11, 56-12 |
| D-13 | 56-04, 56-11, 56-12 |
| D-14 | 56-13, 56-14 |
| D-15 | 56-02, 56-05, 56-12, 56-15 |
| D-16 | 56-02, 56-05, 56-15 |
| D-17 | 56-15 |
| D-18 | 56-10, 56-15 |
| D-19 | 56-02 |
| D-20 | 56-14 |
| D-21 | 56-03, 56-09, 56-15 |

Out of scope everywhere: patching game executables, decrypting DRM payloads, emulating Steam's
protocol, CEG / `STEAMSTART`, `detour32.c`, any route into bottled Steam, per-title overrides,
NotProton's Steam-side half (no `Steam.app` edits).

## Cross-plan contracts (single-plan runs must keep these identical)

`bridge/` = `src/backend/storeManagers/steam/bridge/`; `drm/` = `bridge/drm/`.

- **Step names and reasons (56-04 defines; 56-07..56-12 consume):** `DrmStep` =
  `steam-not-running | unsupported-crossover | component-missing | component-verify |
  runner-clone | runner-patch | valve-fetch | valve-verify | bottle-stage`. The log line is
  `[bridge-notice] appId=<id> reason=drm-<step> cause=<short>`. `DrmStepResult` =
  `{ status: 'ok', ... } | { status: 'error', step: DrmStep, cause: string }`, and steps never throw.
- **Paths (56-04 `drm/drmPaths.ts`, built from `appFolder`):**
  - `<appFolder>/steam-bridge/drm/valve-client/<manifest-version>/`
  - `<appFolder>/steam-bridge/drm/runners/crossover-<CFBundleVersion>/CrossOver`
  - `<appFolder>/steam-bridge/drm/component/<component-id>/`
  - `<appFolder>/steam-bridge/drm/trace/<appId>-<launch>.log`

  `src/backend/constants/paths.ts` is not edited by Wave 1–4 plans.
- **Trace grammar (56-02 writes; 56-05 parses; 56-12 anchors and re-logs):**
  - `[drm-trace] appId=<id> pid=<n> role=game|helper event=create-interface iface=<name>`
  - `[drm-trace] appId=<id> pid=<n> role=game|helper event=call name=<Iface_Ver_Method>`
  - `[bridge-drm] appId=<id> mode=steamclient-layer crossover=<build> client=<manifest-version> trace=<file>`

  Re-logged lines carry the prefix `bridge drm [<appid>]:`. The trace is written to the file named
  by env `GAMELIB_DRM_TRACE_FILE`, with role taken from `GetModuleFileNameW(NULL)` basename
  (`steam.exe` is the helper).
- **Component (56-02/56-03 produce; 56-10 packages; 56-08/56-09 consume):** one asset per
  allowlisted CrossOver build, `steamclient-layer-cx<build>`. It contains:
  - `lsteamclient.dll` and `lsteamclient.so` (Steamworks SDK License);
  - `detour-cx<build>.bin` (GPL-3);
  - helper `steam.exe` (BSD-3);
  - `LICENSE.lsteamclient` and `NOTICE`.

  It is never placed under `build/bin/*/darwin`, never signed, and never in the `.app` bundle.
- **Allowlist (56-06 `ntdllPatchTable.ts`):** each row is keyed by CrossOver `CFBundleVersion`
  plus the clean ntdll sha256. 26.3.0.39832 carries clean sha `6dff64c0…2387`, patched sha
  `c0e21a9a…e97e` and payload sha `e35b8344…1bfb`, and is the only row.
- **Launch form:** taken from the 56-01 SUMMARY. If A3 fails, 56-11/56-12 use the raw clone
  `WINELOADER` + `WINEPREFIX` instead of `CX_BOTTLE` through `bin/wine`.
- **Release CI:** `meta/buildSteamBridgeShims.ts` main and `release-tauri.yml` gain no
  mingw-w64/bison dependency. The native component is operator-built, and its prerequisites are
  named: mingw-w64 (`x86_64-w64-mingw32-gcc`) and bison 3 or later on PATH.

## Per-plan notes

### 56-01: Runner-clone probe (wave 1, autonomous)
- **Files:** scratchpad probe script only (not committed). Results go in `56-01-SUMMARY.md`.
- **Must_haves:**
  - the SUMMARY records whether `cp -c` cloned on the same volume;
  - it records whether a stock-created bottle ran `notepad.exe`/`cmd /c set` under the clone's
    `bin/wine` with `CX_BOTTLE`, with no prefix-update dialog;
  - it records whether `WINEDLLPATH`/`WINEDLLOVERRIDES` were visible in the Wine process;
  - it states a verdict on the launch form.
- **Fake-HOME:** the probe runs under `createFakeHomeProfile()`. The real CrossOver bottle access
  is the declared real-profile arm.

### 56-02: lsteamclient build (wave 1, autonomous)
- **Files:**
  - `native/steam-bridge/steamclient-layer/lsteamclient/{steamclient_main.c,unixlib.cpp,unix_steam_input_manual.cpp,PINS.md}`
  - `meta/buildLsteamclient.ts`
  - `meta/__tests__/buildLsteamclient.test.ts`
  - `package.json` (script `build:lsteamclient`)
- **Must_haves:**
  - Proton is pinned at `164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca` with tree digest `b286df1d…657bf`;
    Valve sources are fetched, never committed;
  - the trace additions live only in `steamclient_main.c` (`DllMain` role, `CreateInterface`
    first call, `steamclient_call` first-per-name capped at 64, plus identity names);
  - the build first tries `crossover-sources-26.3.0.tar.gz` under a time box, then falls back to
    `wine-11.15` @ `2df1ee28…`; the SUMMARY records the D-01 amendment (D-19);
  - compile gates: missing input, PE > 1,000,000 B, `.so` > 1,000,000 B, `.so` unsigned;
  - `x86_64` only.

### 56-03: ntdll payload, resolver, helper (wave 1, autonomous)
- **Files:**
  - `native/steam-bridge/steamclient-layer/ntdll-patch/{detour.c,shim.S,link.ld,COPYING}`
  - `native/steam-bridge/steamclient-layer/helper/{steam.c,LICENSE}`
  - `meta/ntdllResolve/{resolve.py,README.md}`
  - `meta/buildDrmNativeParts.ts`
  - `meta/__tests__/buildDrmNativeParts.test.ts`
- **Must_haves:**
  - the payload built for 26.3.0.39832 has sha `e35b8344…1bfb`, otherwise the gate fails;
  - helper argv: `zig cc -target x86_64-windows-gnu`;
  - the helper source contains no `HKEY_LOCAL_MACHINE`/`HKLM` (grep gate) and no DIPC thread;
  - the helper creates `Steam3Master_SharedMemLock` and `Global\Valve_SteamIPC_Class`, a hidden
    window, and HKCU `ActiveProcess\{pid,SteamClientDll64,SteamPath}`;
  - it calls `steamclient_init_registry` via `LoadLibraryW`/`GetProcAddress`;
  - it spawns the game and stays as the game's parent;
  - `resolve.py` is a documented developer procedure, not a runtime or CI dependency.

### 56-04: DRM contracts (wave 1, autonomous)
- **Files:**
  - `drm/steamclientLayerMode.ts`
  - `drm/drmPaths.ts`
  - `drm/__tests__/steamclientLayerMode.test.ts`
  - `bridge/peSteamDrm.ts` (header comment only)
- **Must_haves:**
  - `resolveBridgeMode('steamstub')` returns `'steamclient-layer'`; `'none'` or `undefined`
    returns `'tcp'`; CEG stays on the existing refusal path;
  - reason strings follow `drm-<step>`;
  - `peSteamDrm.ts` keeps zero imports, and its header no longer says `.bind` never changes routing.

### 56-05: Trace parser + census branch (wave 1, autonomous)
- **Files:**
  - `drm/drmTrace.ts`
  - `drm/__tests__/drmTrace.test.ts`
  - `meta/bridgeCensus.ts`
  - `meta/__tests__/bridgeCensus.test.ts`
- **Must_haves:**
  - `grep -c "^import" drmTrace.ts` = 0;
  - the census returns verified only with a `[bridge-drm]` anchor, plus a `role=game`
    `create-interface` line, plus at least one `role=game` `call` line (or a clean game-log init);
  - helper-only evidence, a missing anchor, an appId mismatch, oversize input and forged prefixes
    all give unverified;
  - `SetMinidumpSteamID [API loaded no]` never counts;
  - the `.bind` census comment and tests show DRM-mode routing.

### 56-06: ntdll applier + table (wave 1, autonomous)
- **Files:**
  - `drm/ntdllPatch.ts`
  - `drm/ntdllPatchTable.ts`
  - `drm/__tests__/ntdllPatch.test.ts`
  - `drm/__tests__/ntdllPatch.realCrossover.test.ts`
- **Must_haves:**
  - the applier never throws and returns `{status:'patched',bytes}|{status:'refused',reason}`;
  - it refuses on clean-sha mismatch, a non-pad cave, wrong stolen bytes, or an oversize payload;
  - it writes `E9 rel32` plus `0xCC` padding and appends the `.npdet` section (0x1000, 0x60000020);
  - it checks the patched sha before the caller writes;
  - no CrossOver ntdll is committed.

### 56-07: Valve client fetch (wave 2, autonomous)
- **Files:**
  - `drm/valveClient.ts`
  - `drm/__tests__/valveClient.test.ts`
  - fixtures (`drm/__tests__/fixtures/steam_client_win64.vdf`, a tiny three-entry zip)
- **Must_haves:**
  - only `bins_win64` is selected;
  - `file` matches `/^bins_win64\.zip\.[0-9a-f]{40}$/`, `sha2` matches `/^[0-9a-f]{64}$/`, and
    size is capped;
  - host allowlist: `client-update.akamai.steamstatic.com`, `steamcdn-a.akamaihd.net/client`,
    `media.steampowered.com/client`, over https only;
  - a sha mismatch installs nothing;
  - the cache is reused with no network; no sha is pinned in code (D-04);
  - the unref'd deadline is registered with the abort handler;
  - nothing at boot; no static import of `backend/launcher`/`backend/utils`;
  - the `unzip` spawn uses fake-HOME.

### 56-08: Runner clone (wave 2, autonomous)
- **Files:**
  - `drm/runnerClone.ts`
  - `drm/__tests__/runnerClone.test.ts`
- **Must_haves:**
  - an unlisted build or unknown clean sha returns `unsupported-crossover`, naming the installed
    and supported versions, and makes no clone;
  - `/Applications/CrossOver.app` is never written;
  - the old clone is removed only when no process runs from its path;
  - the verify step detects a tampered ntdll or a missing builtin;
  - `cp`/`codesign`/`xattr` spawns use fake-HOME, with an unref'd timer race.

### 56-09: Bottle staging (wave 2, autonomous)
- **Files:**
  - `drm/stageDrmBottle.ts`
  - `drm/__tests__/stageDrmBottle.test.ts`
- **Must_haves:**
  - the swap happens only when `isGameLibShimBytes` and `probeOriginalBackup` pass;
  - symlinks are refused via lstat;
  - `gamelib_bridge.cfg` is deleted (game dir, `compat/`, `x64/`), along with any forwarder
    `steamclient64.dll` beside the exe;
  - registry argv is HKCU only, with no `HKLM` in any argv (test asserts);
  - `SteamClientDll64` points at `C:\Program Files (x86)\Steam\steamclient64.dll`;
  - each staged file stays inside the bottle's `drive_c`.
- **Ownership:** `steamClientSetup.ts` is NOT edited here; it belongs to 56-13.

### 56-10: Component release asset + NOTICE (wave 2, autonomous)
- **Files:**
  - `src/common/steamclientLayerCatalogue.ts`
  - `drm/steamclientLayerInstall.ts`
  - `drm/__tests__/steamclientLayerInstall.test.ts`
  - `meta/buildSteamClientLayerArchive.ts`
  - `meta/__tests__/steamclientLayerNotice.test.ts`
  - `native/steam-bridge/steamclient-layer/NOTICE`
  - `THIRD-PARTY-NOTICES.md`
  - `package.json` (scripts `build:drm-native`, `build:steamclient-layer-archive`)
- **Must_haves:**
  - the pinned URL is `https://github.com/grayson-mitchell/GameLib/releases/tag/steamclient-layer-cx<build>`;
  - the archive sha and per-file sha are pinned in code;
  - after extraction, `codesign --remove-signature` runs on the `.so`;
  - the NOTICE lists the licence for each file and states that GPL code never links them;
  - a missing or mismatched asset gives `component-missing`/`component-verify`.

### 56-11: Launch-setup orchestrator (wave 3, autonomous)
- **Files:**
  - `drm/drmLaunchSetup.ts`
  - `drm/__tests__/drmLaunchSetup.test.ts`
  - `src/backend/storeManagers/steam/bottle.ts` (DRM bottle-settings variant)
  - `src/backend/storeManagers/steam/__tests__/bottle.test.ts`
- **Must_haves:**
  - steps run in the fixed order, and the first failure stops the run and is returned;
  - cached steps do no work on the second launch;
  - `sendGameStatusUpdate({status:'redist', context})` uses the contexts `Steam client files` and
    `Compatibility runner`;
  - every wine spawn for the appId uses the clone `wineVersion`;
  - nothing is fetched for a non-`.bind` title.

### 56-12: games.ts wiring (wave 4, autonomous)
- **Files:**
  - `src/backend/storeManagers/steam/games.ts`
  - `src/backend/storeManagers/steam/__tests__/games.test.ts`
  - `public/locales/en/gamelib.json` (`steam.bridge.drm.*` keys)
- **Must_haves:**
  - the DRM branch runs before `placeShimForGame` (callOrder test);
  - each failed step logs `[bridge-notice] appId=… reason=drm-<step>`, shows the dialog and notify
    once per session, does not launch, and does not call `markBridgeFailedThisSession`;
  - the `[bridge-drm]` anchor is logged at launch;
  - the trace file is re-logged after exit, size-capped with no symlinks;
  - the wine launch is a declared real-profile arm.
- **Ownership:** forwarder code is left in place here (removed in 56-13).

### 56-13: Forwarder removal (wave 5, autonomous)
- **Files:**
  - `bridge/steamClientSetup.ts` (delete or reduce) and `bridge/__tests__/steamClientSetup.test.ts`
  - `games.ts` and `games.test.ts`
  - `src/backend/constants/paths.ts`
  - `meta/buildSteamBridgeShims.ts` and `meta/__tests__/buildSteamBridgeShims.test.ts`
  - `native/steam-bridge/steamclient/` (delete)
  - `public/locales/*/gamelib.json` and `gamelib.mt.json`
- **Must_haves:**
  - `! grep -rnE "setupSteamClientForwarder|builtBridgeSteamClient64Path|forwardedTitle|steamclient_fwd" src meta native public/locales/en`;
  - the i18n churn guard and `lintTranslations` pass;
  - `export async function main` is preserved.

### 56-14: Shim-side removal + doc fixes (wave 5, autonomous)
- **Files:**
  - `meta/gen_vtables.ts` and `meta/__tests__/gen_vtables.test.ts`
  - `native/steam-bridge/generated/*`
  - `bridge/shimExports.generated.ts`
  - `bridge/protocol.ts`
  - `native/steam-bridge/bridge_helper.c`
  - `bridge/shimCoverage` tests
  - comment fixes in `bridge/peSections.ts`, `bridge/shimGenerate.ts` and `electronStores.ts`
  - `.claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md` (lines 14, 75)
- **Must_haves:**
  - no `GameLibBridge_CreateInterface|g_bridge_steamstub_path_active|CONTROL_SLOT_CREATE_INTERFACE`
    remains in `src meta native`;
  - a test asserts that `SHIM_EXPORT_SET_VERSION` differs from the pre-removal value, and that a
    stale scan rescans once.

### 56-15: Live gate (wave 6, `autonomous: false`)
- **Files:**
  - `56-15-LIVE-GATE.md`
  - the catalogue pin update if a rebuild changed the shas
- **Must_haves:**
  - prerequisites: `build:sidecar-sea` + `vite build`, and the dev restart is confirmed by the
    `sidecar.js` mtime;
  - the asset is published only after a `checkpoint:human-verify` approval;
  - the operator reinstalls Grim Dawn 219990 through the bridge (bottle absent);
  - `checkpoint:human-verify`: the menu is reached with only Mac Steam running, and
    `pnpm bridge-census` reports verified on D-15+D-16 evidence (game pid differs from helper pid);
  - Raft 648800 and Ranch Simulator 1119730 are recorded as verified, reached menu, or failed at
    step X;
  - an HKLM diagnostic run is recorded only if Grim Dawn fails (D-21).

## Threat-model baseline (every plan's `<threat_model>`, ASVS L1, block on high)

| Threat | Category | Mitigation |
|--------|----------|------------|
| Valve package substituted | T | HTTPS + host allowlist + sha2 + size cap + temp-then-rename |
| Zip slip | T | Three fixed entry names only, extracted into a fresh temp dir; outputs must be regular files |
| Wrong ntdll patched | T | Clean sha, cave, stolen-byte and patched-sha pins |
| Symlink/TOCTOU in swap or clone | T/E | lstat, `wx` flag, containment checks |
| Unsigned `.so` loaded | E | Lives in an app-support dir whose parent is 0700; the trust widening is documented |
| Trace forgery | S | Anchored grammar, role and appId set by lsteamclient, size and line caps, anchor required |
| Real HOME leaked into spawns | I | `createFakeHomeProfile()`, with the wine launch as the declared real-profile arm |
| Component asset tampering | T | Archive and per-file sha256 pinned in the signed app |

Every `<verify>` runs `npx prettier --check` scoped to the exact paths written, after a
`--file-info` probe. It omits `.c`/`.S`/`.py` under `native/`/`meta/ntdllResolve`, `.planning/`,
`.claude/` and `public/locales/`, saying so where they are omitted.

## OUTLINE COMPLETE
