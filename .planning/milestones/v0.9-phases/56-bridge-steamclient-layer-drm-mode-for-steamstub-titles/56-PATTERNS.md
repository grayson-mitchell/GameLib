# Phase 56: Bridge steamclient-layer DRM mode - Pattern Map

**Mapped:** 2026-10-28
**Files analyzed:** 22 (new/modified/removed)
**Analogs found:** 19 / 22 (3 native components have no in-repo analog)

All line numbers verified against the working tree on 2026-10-28.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `bridge/drm/steamclientLayerMode.ts` (resolveBridgeMode + notice reasons) | utility (pure) | transform | `bridge/peSteamDrm.ts` + `bridge/bridgeRoute.ts` | role-match |
| `bridge/drm/valveClient.ts` (manifest, fetch, sha, unzip, cache) | service | file-I/O + request-response | `src/backend/knownFixOverlayInstall.ts` | exact |
| `bridge/drm/runnerClone.ts` (CX detect, allowlist, `cp -c`, prune) | service | file-I/O, spawn | `bridge/steamClientSetup.ts` (typed result + timer race) + `src/backend/tools/dxmt.ts` (fake-HOME spawn) | role-match |
| `bridge/drm/ntdllPatch.ts` + `ntdllPatchTable.ts` | utility (pure) | transform (bytes) | `bridge/peSteamDrm.ts` (bounds-checked byte reader, never throws) | partial |
| `bridge/drm/stageDrmBottle.ts` (swap originals, stage DLLs, HKCU reg) | service | file-I/O + request-response (wine reg) | `bridge/steamClientSetup.ts` + `bridge/originalRestore.ts` | exact |
| `bridge/drm/drmTrace.ts` (zero-import trace parser) | utility (pure) | transform | `bridge/peSteamDrm.ts` (zero imports, D-51-15) | exact |
| `bridge/peSteamDrm.ts` (header comment fix only) | utility | transform | self (lines 16-20) | modify |
| `games.ts` `launchBridgeGame` DRM branch + `maybeNotifyDrmMode*` | controller | request-response | `maybeNotifySteamStubForwarded/Unforwarded` (games.ts:2949-3043) | exact |
| `meta/buildSteamClientLayer.ts` (lsteamclient + payload + helper build) | build script | batch | `meta/buildSteamBridgeShims.ts` | exact |
| `meta/buildSteamBridgeShims.ts` (drop forwarder, call new builder) | build script | batch | self | modify |
| `meta/bridgeCensus.ts` `classifyBridgeEvidence` DRM branch | utility (pure) | transform | self, `findGameCalls`/`findGameInit` (888-960) | exact |
| `src/common/...` or `meta/` catalogue entry for the lsteamclient release asset (D-18) | config | request-response | `src/common/knownFixOverlayCatalogue.ts` + `meta/buildOverlayArchive.ts` | exact |
| `THIRD-PARTY-NOTICES.md` + `native/.../steamclient-layer/NOTICE` | doc | n/a | `THIRD-PARTY-NOTICES.md` lines 1-13 (gst-libav section) | exact |
| `native/steam-bridge/steamclient-layer/helper/steam.c(pp)` (game-process helper) | native (Win32) | event-driven | none in repo (NotProton `steam-shim`) | none |
| `native/.../lsteamclient/` overlay + trace additions | native | event-driven | none in repo (NotProton overlay) | none |
| `native/.../ntdll-patch/` (detour.c, shim.S) | native | transform | none in repo (NotProton) | none |
| Progress surface (first-launch fetch) | service call | event-driven | `sharedRedistInstall.ts:476-485` | exact |
| D-14 removals (see list below) | mixed | n/a | n/a | removal |
| Tests: `bridge/drm/__tests__/*.test.ts` | test | n/a | `bridge/__tests__/steamClientSetup.test.ts`, `__tests__/peSteamDrm.test.ts` | role-match |
| Tests: `meta/__tests__/bridgeCensus.test.ts` DRM cases | test | n/a | self (`describe` at 628, 969, 1624) | exact |
| Tests: `meta/__tests__/buildSteamClientLayer.test.ts` | test | n/a | `meta/__tests__/buildSteamBridgeShims.test.ts` | exact |
| Tests: `games.test.ts` DRM cases | test | n/a | `games.test.ts:2602-2700` (Phase 52 SteamStub describe) | exact |
| `SHIM_EXPORT_SET_VERSION` bump (D-20) | config | derived | `bridge/shimCoverage.ts:432` | derived, no manual edit |

(`bridge/` = `src/backend/storeManagers/steam/bridge/`)

## Pattern Assignments

### `bridge/drm/valveClient.ts` (service, file-I/O + request-response)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/src/backend/knownFixOverlayInstall.ts` (copy almost verbatim, per RESEARCH Pattern 3)

**Header contract to copy** (lines 1-21): fail-open/never rejects, bounded by unref'd deadline, registered with the abort handler, nothing at boot, lazy axios, must NOT statically import `backend/launcher` or `backend/utils`.

**Imports** (lines 23-36):
```typescript
import { createHash } from 'crypto'
import { createReadStream, promises as fsPromises } from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { knownFixOverlaysPath } from 'backend/constants/paths'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
```

**Injectable fetch + lazy axios** (lines 42-51, 134-151):
```typescript
export type OverlayArchiveFetch = (url: string, opts: { signal: AbortSignal; maxBytes: number }) => Promise<Buffer>
const defaultFetchArchive: OverlayArchiveFetch = async (url, { signal, maxBytes }) => {
  const { axiosClient } = await import('backend/utils')
  const response = await axiosClient.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer', signal, timeout: 30_000,
    maxContentLength: maxBytes, maxBodyLength: maxBytes, maxRedirects: 5,
    validateStatus: (s) => s === 200
  })
  return Buffer.from(response.data)
}
```

**Streamed sha** (lines 70-78): `hashFile()` using `createReadStream` + `createHash('sha256')`.

**Bounded download with unref'd deadline** (lines 157-183): `createAbortController(abortId)`, `setTimeout(...).unref?.()`, `Promise.race([fetching, aborted])`, `fetching.catch(() => undefined)`, `finally { clearTimeout; deleteAbortController }`.

**Temp dir, verify, atomic rename, in-flight dedupe** (lines 185-276): `inFlight` Map keyed by target, `mkdtemp(join(root, '.id.partial-'))`, write with `{ flag: 'wx' }`, verify temp, rename old target to `.stale-*`, rename temp to target, handle `EEXIST/ENOTEMPTY` race by re-verifying, `finally` removes temp.

**Public entry shape** (lines 279-308): containment check `rel === '' || rel.startsWith('..') || isAbsolute(rel)`, outer try/catch returning null. For Phase 56 return a typed result (`{status:'ok'|'error', step, cause}`) instead of null so D-13 can name the failed step.

**Differences to apply:** manifest via `@node-steam/vdf` `parse` (RESEARCH "Code Examples"), select only `bins_win64`, regex-validate `file` `/^bins_win64\.zip\.[0-9a-f]{40}$/`, `sha2` `/^[0-9a-f]{64}$/`, size cap; extract exactly three named entries with `/usr/bin/unzip` (new spawn site, must use `createFakeHomeProfile()`); cache at `<appFolder>/steam-bridge/drm/valve-client/<manifest-version>/`. Add a path const beside `knownFixOverlaysPath` (`src/backend/constants/paths.ts:63`).

---

### `bridge/drm/stageDrmBottle.ts` (service, file-I/O + wine reg)

**Analog 1:** `/Users/graysonmitchell/Projects/GameLib/src/backend/storeManagers/steam/bridge/steamClientSetup.ts`

**Keep (adapt) these pieces; delete the forwarder pieces (D-14).**

Typed result, no throw (lines 34-37 shape):
```typescript
type SteamClientSetupResult =
  | { status: 'placed'; forwarderPath: string; winPath: string }
  | { status: 'unavailable'; reason: ... }
  | { status: 'error'; error: string }
```
Header rules to carry (lines 9-16): HKCU ONLY, never name `HKLM\Software\Valve\Steam` in any argv (D-07, D-21), every failure typed.

Registry argv builder (lines 26-27, 48-72): `STEAMCLIENT_ACTIVE_PROCESS_KEY`, argv arrays (no shell), `/f`, input validation `^[A-Za-z]:\\` and `/["\r\n\0]/`. Extend with `SteamPath`; point `SteamClientDll64` at the genuine `C:\Program Files (x86)\Steam\steamclient64.dll`.

Contained-path helpers (lines 39-42, 79-88): `isContainedWithin` and `toBottleWindowsPath(bottleDir, absPath)` returning null outside `drive_c`.

Name/appId validation (lines 118-127): `NUMERIC_APP_ID`, `sanitizeBottleName`, `getBottleDir` from `../bottle`.

Unref'd timer race around each `runWineCommand` (lines 189-243):
```typescript
let timer: ReturnType<typeof setTimeout> | undefined
const timeout = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), REG_ADD_TIMEOUT_MS); timer.unref?.() })
try {
  const res = await Promise.race([
    runWineCommand({ gameSettings: opts.bottleSettings, commandParts, wait: false, protonVerb: 'run' }),
    timeout
  ])
  ...
} finally { if (timer) clearTimeout(timer) }
```
Note: `gameSettings` must carry the clone runner's `wineVersion` (RESEARCH "Runner clone", launcher.ts:1570, bottle.ts:1393) so reg writes and the launch use the same runner.

**Analog 2 (originals swap):** `/Users/graysonmitchell/Projects/GameLib/src/backend/storeManagers/steam/bridge/originalRestore.ts`
- Imports to reuse (lines 17-29): `findRuntimeLoadedSteamApiDlls`, `isContainedWithin` from `./bridgeScan`; `isGameLibShimBytes`, `probeOriginalBackup` from `./shimGenerate`; `BACKUP_SUFFIX = '.gamelib-orig'` (line 30).
- `restoreBridgeSteamApiOriginals(...)` (line 70) is exported and returns per-file outcomes, never throws. RESEARCH F2: it only writes `<shim>.gamelib-orig`; the new step must rename it over the live shim after `isGameLibShimBytes` + `probeOriginalBackup` pass, refuse symlinks (lstat), then delete `gamelib_bridge.cfg` (game dir, `compat/`, `x64/`) and the forwarder `steamclient64.dll`.

---

### `bridge/drm/runnerClone.ts` (service, file-I/O + spawn)

**Analog:** no exact; compose from three existing patterns.

1. Typed result + unref'd timer race: `steamClientSetup.ts:189-243` (above).
2. Fake-HOME spawn: `createFakeHomeProfile()` from `/Users/graysonmitchell/Projects/GameLib/src/backend/testUtils/fakeHomeProfile.ts` (spec, 8-var env set, fresh profile every call, no memo). In-repo spawn sites that already comply: `src/backend/tools/dxmt.ts`, `bridge/helperProcess.ts:260-378` (spread `process.env` or override env, add only one var; the gate `src/backend/__tests__/fakeHomeIsolation.test.ts` forbids hand-rolled home/config env blocks). Declare a named real-profile arm for the wine launch itself (RESEARCH Security table; `meta/bridgeCensus.ts` documents its own).
3. Containment check: `rel === '' || rel.startsWith('..') || isAbsolute(rel)` (`knownFixOverlayInstall.ts:288-291`).

Behavior: `cp -c -R` falling back to `cp -R` and logging which, scrub `com.apple.quarantine` and `com.apple.provenance`, key by Info.plist `CFBundleVersion` plus clean ntdll sha, remove stale clone only when no process runs from it, re-sign loader with dyld entitlement (RESEARCH Pitfalls 1, 2, 5, 6; F8).

---

### `bridge/drm/ntdllPatch.ts` + `ntdllPatchTable.ts` (utility, byte transform)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/src/backend/storeManagers/steam/bridge/peSteamDrm.ts` (discipline, not logic).

Copy: bounds-checked reader that throws an internal `BoundsError` and an outer try/catch so the public function never throws (lines 34-38, 75-80):
```typescript
class BoundsError extends Error {}
function readExact(read: PeReader, offset: number, length: number): DataView {
  if (!Number.isSafeInteger(offset) || offset < 0 || length < 0) { throw new BoundsError('bad offset') }
  ...
```
Public API should return a typed result (`{status:'patched', bytes} | {status:'refused', reason}`), verify patched sha256 against the table before the caller writes. Outline and the verified table row for CX 26.3.0.39832 are in RESEARCH Pattern 1. Table module is data-only (committed, generated by dev-time resolve.py).

---

### `bridge/drm/drmTrace.ts` (utility, zero imports)

**Analog:** `peSteamDrm.ts` lines 29-32 discipline:
```
Zero imports by design (D-51-15) ... meta/bridgeCensus.ts bundles this module with no backend module graph.
`grep -c "^import" peSteamDrm.ts` must print 0.
```
Add the same guard sentence to the header, and a test asserting zero `import` lines (see `__tests__/peSteamDrm.test.ts` for in-memory fixture style). Grammar and trust rules: RESEARCH "Evidence design" (anchored regex, `role=game`, matching appId, size and line-length caps, treat file as untrusted).

---

### `games.ts` DRM branch and notices (controller, request-response)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/src/backend/storeManagers/steam/games.ts`

**Notice pattern to copy** (`maybeNotifySteamStubForwarded`, lines 3016-3043; session-once Set at line 615):
```typescript
private maybeNotifySteamStubForwarded(): void {
  logInfo(`[bridge-notice] appId=${this.appId} reason=steamstub-forwarded:launch-check-unsatisfiable`, LogPrefix.Steam)
  if (steamStubForwardedNoticeShownThisSession.has(this.appId)) { return }
  steamStubForwardedNoticeShownThisSession.add(this.appId)
  const title = i18next.t('gamelib:steam.bridge.steamstub.forwardedTitle', 'Steam DRM check not supported')
  const body = i18next.t('gamelib:steam.bridge.steamstub.forwardedBody', "...")
  notify({ title, body })
  const dialogFrameSent = showDialogBoxModalAuto({ title, message: body, type: 'MESSAGE' })
  logInfo(`[bridge-notice] appId=${this.appId} dispatched=in-app-dialog+notify dialog-frame-sent=${dialogFrameSent} display=unconfirmed`, LogPrefix.Steam)
}
```
Log line ALWAYS fires every launch; the user-visible notice is once per session. New notice: `reason=drm-<step>` with cause in the body (D-13). Add new i18n keys (e.g. `gamelib:steam.bridge.drm.*`) with default strings as the second `t` argument, in `public/locales/en/gamelib.json` (existing block at 499-504); gates: `meta/i18nCatalogChurnGuard.ts`, `meta/lintTranslations.ts`.

**Unforwarded variant** (lines 2949-2975) shows the `cause` union + `notify` only (no dialog). Because D-13 means "does not launch", prefer the dialog variant.

**Routing seam** (RESEARCH F10): in `launchBridgeGame` (starts ~3045), branch after the bottle-ready/exe-exists gate (~3094) and BEFORE `placeShimForGame` (3121). Use `detectDrmWrapper(exePath)` (`bridge/shimGenerate.ts:487`, returns `'steamstub'|'none'|undefined`). CEG exe goes to the existing refusal path.

**Do NOT call `markBridgeFailedThisSession`** on DRM failures (games.ts:243 definition; RESEARCH A9). Follow the `steamStateCause` precedent at games.ts:3290-3295 and the comment near 3070 ("do NOT markBridgeFailedThisSession here").

**Final launch**: reuse `fireBridgeWineLaunch(exePath, bridgeBottleSettings)` (line 3417); it passes no `logWriters`, so evidence cannot rely on Wine stderr.

**Progress** (D-05): `sharedRedistInstall.ts:476-485`:
```typescript
onComponent: (label) =>
  sendGameStatusUpdate({ appName: appId, runner: 'steam', status: 'redist', context: label })
```
Use contexts like `Steam client files`, `Compatibility runner`.

**Test analog:** `games.test.ts:2602-2700` ("Phase 52: SteamStub forwarder setup"): per-test `freshId()` because notices are session-scoped, `callOrder` array to assert ordering (DRM branch before shim placement), `logInfo` mock to assert `[bridge-notice] appId=… reason=…`, `dialogMock` for `showDialogBoxModalAuto`. Rewrite, do not keep, per D-14.

---

### `meta/buildSteamClientLayer.ts` and edits to `meta/buildSteamBridgeShims.ts` (build, batch)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/meta/buildSteamBridgeShims.ts`

**Pure argv builders, exported for test** (lines 442-560): `buildHelperCompileArgv`, `buildShimCompileArgv`, `buildShim64CompileArgv`, `buildSteamClient64CompileArgv(zigBinPath, arch)` returning `{ command, args }`. Copy this shape for the helper (`zig cc -target x86_64-windows-gnu`), the detour payload, and the Wine make invocation.

**Arch resolution** (lines 128-162): `resolveBridgeArch()` honoring `GAMELIB_BRIDGE_TARGET_ARCH`; `machoArchFlag`. Note the x86_64 `lsteamclient.so` is built with `clang -arch x86_64` even on an arm64 CI leg.

**Output path + byproduct prune helpers** (lines 191-217, 255-300): `xOutputPath(arch)` = `join(bundledBinDir(arch), 'name')`, `XXX_BUILD_BYPRODUCTS` const, `pruneXByproducts()`.

**Compile gate** (lines 606-640 for shim; 680-711 for forwarder): check inputs exist (throw naming them), `downloadZig()`, `mkdirSync(bundledBinDir(), {recursive:true})`, log `Compile gate: cmd args`, `spawnArgv`, throw `COMPILE GATE FAILED (...)` on non-zero exit or missing output, then prune. Add Phase 56 gates from RESEARCH: size floors (PE > 1,000,000 B; `.so` > 1,000,000 B), `.so` unsigned, payload sha pin.

**spawnArgv** (lines ~548-566): collects stdout/stderr, resolves `{ code, stdout, stderr }`.

**main + JEST_WORKER_ID guard** (lines 713-735): keep verbatim; replace `await compileSteamClient64()` (line 721) with the new builder call. WARNING in the comment at 710-715: the test slices the source by the literal string `export async function main`; do not drop `export`.

**Test analog:** `meta/__tests__/buildSteamBridgeShims.test.ts` (imports the pure argv/path builders at lines 10-36, "structural source assertions (no real compile)"). Delete the forwarder imports (`buildSteamClient64CompileArgv`, `missingSteamClient64Inputs`, `pruneSteamClient64BuildByproducts`, `STEAMCLIENT64_BUILD_BYPRODUCTS`, `STEAMCLIENT_FWD_*`, `steamClient64*`) and mirror the remaining cases for the new builder.

---

### `meta/bridgeCensus.ts` DRM evidence branch (utility, transform)

**Analog:** same file, `/Users/graysonmitchell/Projects/GameLib/meta/bridgeCensus.ts`

**Anchoring discipline** (lines 820-834): HELLO matcher requires the payload to START with the token so game-supplied strings cannot forge it:
```typescript
function helloRegex(appid: string): RegExp {
  return new RegExp(`^\\[[^\\]]*\\]\\s+HELLO\\s+shim attached appid=${appid}(?![0-9])`)
}
```
Model the DRM anchors on this (`[bridge-drm] appId=<id> mode=steamclient-layer ...`, then `[drm-trace] appId=<id> pid=.. role=game event=create-interface|call ...`).

**Evidence collectors to mirror**: `findGameCalls` (888-904: distinct method set, scanned after the anchor, same-appid only), `findGameInit` (928-950: first success else first failure), `IDENTITY_CALL` (884). 

**Insertion point**: top of `classifyBridgeEvidence` (line 982), which currently starts with `if (!/^\d+$/.test(input.appid)) return {status:'unverified', detail:'no HELLO'}` then `hasHello`. Add a DRM branch BEFORE the no-HELLO return: anchor present => `verified` iff a `role=game` create-interface line AND at least one `role=game` call line (D-15, D-16); helper lines never count; no anchor and no HELLO => existing `unverified/no HELLO`. Return type `BridgeEvidence {status, detail}` with statuses `verified|unverified|init-failed`.

Also update the comment at ~324-341 ("never changes routing") and the `.bind` census tests at `bridgeCensus.test.ts:439-503`.

**Test analog:** `meta/__tests__/bridgeCensus.test.ts` `describe('quick 261024-f0w: classifyBridgeEvidence')` (line 628, call style at 638 `classifyBridgeEvidence({ appid, appLogTexts, gameLogTexts, ... })`) and `describe('53-18: anchored census evidence (WR-01)...')` (1560) for forged-line cases.

---

### `src/common/` catalogue entry for the lsteamclient component (config) and release workflow (D-18)

**Analog:** `/Users/graysonmitchell/Projects/GameLib/src/common/knownFixOverlayCatalogue.ts`

Pure data, no node/electron imports (header lines 1-12). Entry shape (lines 14-27, 35-80): `id`, `release: { repo: 'grayson-mitchell/GameLib', tag: 'overlay-gst-libav-1.24.13-x86_64', asset: '...tar.gz' }`, `archiveSha256`, `archiveSize`, per-file `{path, sha256, size}`; URL/sums pinned in code shipped in the signed app, never fetched. Consumed by `ensureOverlayInstalled` (`knownFixOverlayInstall.ts:279`) with install dir under `knownFixOverlaysPath = join(appFolder, 'overlays')` (`src/backend/constants/paths.ts:63`).

Archive builder: `meta/buildOverlayArchive.ts` (`pnpm build:overlay-archive --source <dir> --out <file> --id <id>`; prints `sha256=… size=…`, exit 3 on pin mismatch, "operator rebuilds and must see `pinned: match` before uploading"; uses `buildOverlayTarGz/readOverlayTarGz` from `src/backend/knownFixOverlayArchive.ts`, no child processes). Docs: `THIRD-PARTY-NOTICES.md` lines 1-13 (heading `## On-demand overlay: gst-libav-1.24.13 (macOS, x86_64)`, release URL `https://github.com/grayson-mitchell/GameLib/releases/tag/overlay-gst-libav-1.24.13-x86_64`). Copy this section shape for the Steamworks SDK License component.

NOTE: the overlay verifier has overlay-specific `target: 'gstreamer-plugin-path'` and `pluginSubdir` fields. The lsteamclient component needs a sibling catalogue (or widen the target union) rather than a new fetch implementation; `readOverlayTarGz` + `verifyInstalledOverlay` logic is reusable. A release workflow for the overlay was not found under `.github/workflows` by grep (upload is an operator step per the builder's header); the planner should confirm and, if so, document the same manual upload + `pinned: match` step rather than invent CI.

Caution: `lsteamclient.so` must be unsigned; after extraction run `codesign --remove-signature` (RESEARCH Pitfall 1, F6) and never place it under `build/bin/arm64/darwin` (signed by `meta/signMachOResources.ts`).

---

### D-14 / D-20 removal list (verified)

- `bridge/steamClientSetup.ts`: remove `setupSteamClientForwarder`, `chooseTargetDir`, `isByteIdentical`, `SteamClientSetupResult`, `BRIDGE_STEAMCLIENT64_FILENAME`, `SHIM64_FILENAME`, the `builtBridgeSteamClient64Path` import (line 21); keep `toBottleWindowsPath`, `buildSteamClientRegistryCommands` shape, `REG_ADD_TIMEOUT_MS`, `isContainedWithin` for the new staging module (rename file or fold into `drm/stageDrmBottle.ts`).
- `bridge/__tests__/steamClientSetup.test.ts` (uses `REG_ADD_TIMEOUT_MS` at line 275): rewrite for the new module.
- `games.ts`: `steamStubNoticeShownThisSession` (615) and the forwarded twin, `maybeNotifySteamStubUnforwarded` (2949), `maybeNotifySteamStubForwarded` (3016), calls at 3242 and 3390-3398, the forwarder block 3364-3400, import at ~118.
- `src/backend/constants/paths.ts:~132` `builtBridgeSteamClient64Path`.
- `meta/buildSteamBridgeShims.ts`: lines 228-300 forwarder consts/functions, 680-711 `compileSteamClient64`, call at 721.
- `native/steam-bridge/steamclient/` (steamclient_fwd.c/.rc).
- Shim side (D-20): `GameLibBridge_CreateInterface` and `g_bridge_steamstub_path_active` in `meta/gen_vtables.ts` (+ `meta/__tests__/gen_vtables.test.ts`), `bridge/shimExports.generated.ts`, `bridge/protocol.ts`, helper `CONTROL_SLOT_CREATE_INTERFACE` in `bridge_helper.c`. Regenerate via `pnpm gen-vtables`.
- **SHIM_EXPORT_SET_VERSION handling:** it is NOT a hand-edited constant. `bridge/shimCoverage.ts:432` computes it by hashing exported symbols, served versions and the null-object-fallback flag (`computeExportSetVersion`, ~line 425: `createHash('sha256').update(payload).digest('hex').slice(0,12)`). Removing `GameLibBridge_CreateInterface` from the generated export lists changes it automatically; the plan only needs to regenerate and add a test asserting the version changed (and that persisted scans with the old version rescan once, `electronStores.ts:~198`, `shimGenerate.ts:773`). Tests pinning a literal export-set hash must be updated.
- i18n: `gamelib:steam.bridge.steamstub.{title,body,forwardedTitle,forwardedBody}` in `public/locales/*/gamelib.json` and `gamelib.mt.json`.
- Comment fixes: `peSteamDrm.ts` lines 16-20 (the "`.bind` never changes routing" sentence), `peSections.ts:44-45`, `shimGenerate.ts:557-559,583`, `electronStores.ts:225`, `meta/bridgeCensus.ts:324-341`.
- Verification grep from RESEARCH: `! grep -rnE "setupSteamClientForwarder|builtBridgeSteamClient64Path|forwardedTitle|steamclient_fwd" src meta native public/locales/en`.

## Shared Patterns

### Typed results, never throw into launch
**Source:** `bridge/steamClientSetup.ts:34-37, 118-127, 163-172`
**Apply to:** every `bridge/drm/*` step. Return `{status:'ok'|'unavailable'|'error', step, cause}`; the `games.ts` branch maps `step` to the `[bridge-notice] reason=drm-<step>` line.

### Unref'd timer race for any awaited child/IO
**Source:** `bridge/steamClientSetup.ts:189-243` and `knownFixOverlayInstall.ts:157-183`
**Apply to:** clone, codesign, unzip, reg writes, download. `timer.unref?.()`, `clearTimeout` in `finally`. Leave no in-flight work at boot (sidecar exit contract).

### Fake-HOME for spawned processes
**Source:** `src/backend/testUtils/fakeHomeProfile.ts` (`createFakeHomeProfile()`), compliant callers `src/backend/tools/dxmt.ts`, `bridge/helperProcess.ts:260-378`; enforced by `src/backend/__tests__/fakeHomeIsolation.test.ts`.
**Apply to:** `cp`, `codesign`, `unzip`, build-tool spawns (build tools in `meta/` use `spawnArgv` and must too). The wine launch is a documented real-profile arm.

### Path containment
**Source:** `bridge/steamClientSetup.ts:39-42`, `knownFixOverlayInstall.ts:288-291`
```typescript
const rel = relative(root, candidate)
return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
```
**Apply to:** clone dir, valve cache, `.gamelib-orig` swap, trace file path, staged DLLs.

### Zero-import modules for meta reuse
**Source:** `bridge/peSteamDrm.ts:29-32`
**Apply to:** `drm/drmTrace.ts` (and anything `meta/bridgeCensus.ts` bundles).

### `[bridge-notice]` + session-once user notice
**Source:** `games.ts:3016-3043`, Set at 615
**Apply to:** all D-13 failure steps (fetch/verify, lsteamclient missing, unsupported CrossOver naming installed and supported versions, clone/patch incl. site-not-found, Mac Steam not running; reuse `isSteamRunning` dependency from `macSteamOffline.ts:165`).

### Prettier verify rule
**Source:** CLAUDE.md conventions: each `<verify>` runs `npx prettier --check` over the exact paths written; `--file-info` first; omit if all prettier-ignored.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `native/steam-bridge/steamclient-layer/helper/*` (Win32 `steam.exe`) | native | event-driven | No GameLib Win32 helper that creates named events/windows; closest compile recipe is `buildSteamClient64CompileArgv` (zig cc x86_64-windows-gnu); source from NotProton `steam-shim` (BSD-3), per RESEARCH F7 |
| `native/.../lsteamclient/` overlay + trace additions | native | event-driven | Proton/NotProton source; Wine make build not present in repo; use RESEARCH "Build pipeline" steps 1-3 |
| `native/.../ntdll-patch/` (detour.c, shim.S, link.ld) | native | transform | NotProton GPL-3 port; build recipe RESEARCH step 4 |
| `meta/ntdllResolve/` dev-only resolve.py | tooling | transform | Python + capstone, no Python build tooling in `meta/` except `runPlanningGates.py` |

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/bridge/`, `src/backend/storeManagers/steam/games.ts`, `src/backend/knownFixOverlayInstall.ts`, `src/common/knownFixOverlayCatalogue.ts`, `src/backend/constants/paths.ts`, `src/backend/testUtils`, `meta/`
**Pattern extraction date:** 2026-10-28
