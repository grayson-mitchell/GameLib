---
phase: quick-261105-ord
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - native/steam-bridge/helper/gamelib_installapp.h
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/__tests__/steamInstallAppHelper.test.ts
  - src/common/types.ts
  - src/backend/config.ts
  - src/backend/__tests__/configSteamExperimentalInstallAppDefault.test.ts
  - src/backend/storeManagers/steam/experimentalInstallAppSetting.ts
  - src/backend/storeManagers/steam/__tests__/experimentalInstallAppSetting.test.ts
  - src/backend/storeManagers/steam/steamInstallApp.ts
  - src/backend/storeManagers/steam/__tests__/steamInstallApp.test.ts
  - src/frontend/screens/Settings/components/SteamExperimentalInstallApp.tsx
  - src/frontend/screens/Settings/components/__tests__/SteamExperimentalInstallApp.test.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  - public/locales/en/translation.json
  - src/backend/storeManagers/steam/installLocation.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md
autonomous: true
requirements: [QUICK-261105-ord]

must_haves:
  truths:
    - "On macOS, Settings > General shows a 'Steam Experimental InstallApp Feature' toggle, default OFF, directly below the GameLib-downloader toggle, with an icon-only (i) help on the label line"
    - "On Windows/Linux the toggle does not render and isSteamExperimentalInstallAppEnabled() returns false whatever is persisted"
    - "`steam-bridge-helper --steam-installapp <appId> --library <root>` prints exactly one JSON result line: ok / unavailable(reason) / error(EAppUpdateError), and never calls an engine getter or app-manager method that runtime verification has not confirmed"
    - "Setting ON + downloader OFF: install() calls InstallApp instead of steam://install, keeps ACF polling, and falls back to the unchanged steam://install path on any 'unavailable'"
    - "Setting ON + downloader ON: after GameLib's depot download, with Steam running, InstallApp is called and no restart-on-Play record is written when it succeeds; any non-ok outcome records the pending adoption exactly as today"
    - "A non-zero EAppUpdateError on the downloader-OFF route is returned as an install error naming the code, not swallowed"
    - "Setting OFF: no helper is spawned and every pre-existing games.test.ts assertion passes unchanged"
  artifacts:
    - path: "native/steam-bridge/helper/gamelib_installapp.h"
      provides: "Runtime-resolved IClientEngine -> IClientAppManager::InstallApp caller (fork-isolated getter scan, IPC function-ID slot decode, library-folder lookup)"
      contains: "gamelib_installapp_main"
    - path: "src/backend/storeManagers/steam/steamInstallApp.ts"
      provides: "requestSteamInstallApp() — spawns the helper subcommand, parses its result line into a typed outcome"
      exports: ["requestSteamInstallApp"]
    - path: "src/backend/storeManagers/steam/experimentalInstallAppSetting.ts"
      provides: "Single backend read seam for steamExperimentalInstallApp (macOS only)"
      exports: ["isSteamExperimentalInstallAppEnabled"]
    - path: "src/frontend/screens/Settings/components/SteamExperimentalInstallApp.tsx"
      provides: "macOS-only toggle + (i) help"
      contains: "steamExperimentalInstallApp"
  key_links:
    - from: "native/steam-bridge/helper/bridge_helper.c"
      to: "gamelib_installapp.h"
      via: "argv[1] == --steam-installapp dispatch as main()'s first statement after signal(SIGPIPE)"
      pattern: "gamelib_installapp_main"
    - from: "src/backend/storeManagers/steam/steamInstallApp.ts"
      to: "steamBridgeHelperPath"
      via: "execFile with --steam-installapp argv, bounded timeout"
      pattern: "--steam-installapp"
    - from: "src/backend/storeManagers/steam/games.ts"
      to: "requestSteamInstallApp"
      via: "OFF route before openExternal; ON route before recordPendingAdoption"
      pattern: "requestSteamInstallApp\\("
---

<objective>
Implement the pending todo `.planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md`: an opt-in, macOS-only, default-OFF "Steam Experimental InstallApp Feature" setting that asks the running Mac Steam client to install/adopt an app through its internal `IClientAppManager::InstallApp` (spikes 065/066), for both native-Steam install routes, with today's behaviour as the automatic fallback.

Purpose: removes Steam's main window + install dialog on the downloader-OFF route and the quit-and-relaunch-Steam-on-Play step on the downloader-ON route.
Output: a bridge-helper subcommand, a backend caller + accessor, a Settings toggle, games.ts integration, unit tests, and an operator live-gate checklist in the SUMMARY. The todo stays in `pending/` (it is `ready: live-gate`).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md
@.planning/spikes/066-steamclient-register-install/probe.c
@.planning/spikes/066-steamclient-register-install/slotmap.txt
@.planning/spikes/065-steamclient-installapp/README.md

Load `Skill("gamelib-conventions")` before writing any spawn site, test that spawns, or `<verify>` step.

<interfaces>
Proven call chain (spikes 065/066, Steam build 2026-10-22, arm64):
- steamclient path: `$HOME/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/steamclient.dylib`, `dlopen(RTLD_NOW|RTLD_LOCAL)`, `dlsym("CreateInterface")`.
- `CreateInterface("CLIENTENGINE_INTERFACE_VERSION005", &rc)` -> engine (RTTI `12CSteamClient`).
- engine slot 0 `CreateSteamPipe(this) -> int32` (0 = Steam not running); slot 3 `ConnectToGlobalUser(this, pipe) -> int32` (0 = no signed-in user). These two are the stable vtable prefix and are guarded by their return values.
- GetIClientAppManager: `void* (this, HSteamUser, HSteamPipe)`, verified slot 43 on this build (header said 45). Calling a non-getter or wrong slot CAN crash (slots 42 and 48 crashed the spike).
- RTTI name: `*(const char**)((char*)vtable[-1] + 8)`; the app manager's is `20IClientAppManagerMap`.
- App-manager proxy methods load their IPC function ID as `movz wN,#lo` + `movk wN,#hi,lsl #16` with interface id 17. High halves (slotmap.txt): InstallApp 0xdd9a (slot 0), UninstallApp 0x4505 (slot 1), GetAppInstallState 0xeaf2 (slot 4), GetNumLibraryFolders 0xab50 (slot 75), GetLibraryFolderPath 0xf27c (slot 76).
- `InstallApp(this, uint32 appId, int32 libraryFolderIndex, bool bLegacy=false) -> uint32 EAppUpdateError` (0 = ok; 18 = k_EAppErrorNotInstalled seen in 066). Only folder index 0 has been tested.
- GetNumLibraryFolders / GetLibraryFolderPath were located (slots 75/76) but NEVER called in a spike; assumed shapes: `uint32 (this)` and `int32 (this, int32 index, char *buf, int32 cap)`.

From src/backend/storeManagers/steam/nativeInstallSetting.ts (precedent; its test asserts this module exports ONLY isSteamNativeInstallEnabled, so the new accessor goes in its own sibling file):
  export function isSteamNativeInstallEnabled(): boolean  // GlobalConfig.get().getSettings().enableSteamNativeInstall ?? true

From src/backend/constants/paths.ts:
  export const steamBridgeHelperPath  // public/bin/<arch>/darwin/steam-bridge-helper, built by `pnpm build-steam-bridge` from bridge_helper.c; HELPER_HEADERS_DIR (native/steam-bridge/helper) is already on its -I path, so a new header there needs no build-script change.

From src/backend/storeManagers/steam/installLocation.ts:
  export async function listSteamLibraryTargets(): Promise<SteamLibraryTarget[]>  // {path (library ROOT), steamappsDir, isPrimary}, primary first
  function resolveOverride(overridePath, libraries): SteamLibraryTarget          // private; D-08 registered-library-only rule

games.ts seams:
  - OFF route: install(), after `ensureSteamClientReady` succeeds and just before `logInfo('... delegating install ... via ${url}')` / `shell.openExternal(url)` / `startInstallPolling(this.appId, { delegatedToSteamClient: true })` (~line 2087-2104).
  - ON route: `if (deferredPoll.handoff && leasedResult.status === 'done')` block (~line 3329): `probeMacSteamPid()`; when pid !== null -> readAcfSnapshot + recordPendingAdoption; else clearPendingAdoption; then startInstallPolling(..., { isNativeHandoff, skippedDepots, macNativeRoute: true }). `handoff.manifestPath` is `<libraryRoot>/steamapps/appmanifest_<id>.acf`.

Precedents to mirror:
  - Toggle View+container, macOS-only: src/frontend/screens/Settings/components/ShareDetectedFixes.tsx and its __tests__/ShareDetectedFixes.test.tsx.
  - Config default test: src/backend/__tests__/configShareDetectedFixesDefault.test.ts.
  - Real-compiled-helper jest test under createFakeHomeProfile(): src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts beforeAll (~line 253: buildHelperCompileArgv() with `-o` swapped into a mkdtemp under profile.root, execFileSync with `env: profile.childEnv()`).
  - games.test.ts: module mocks at ~line 428 (macSteamAdoption), ~670 (nativeInstallSetting), ~690 (installLocation); describe 'SteamGame — quick 261029-ji2 pending Steam adoption' at ~14836 has the native-route beforeEach to reuse. jest `resetMocks: true` — mocked accessors return undefined unless set.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Native --steam-installapp subcommand in the bridge helper (runtime-resolved, no hard-coded getter/method slots)</name>
  <files>native/steam-bridge/helper/gamelib_installapp.h, native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/__tests__/steamInstallAppHelper.test.ts</files>
  <behavior>
    - Under a fresh fake HOME (no steamclient.dylib), `--steam-installapp 440 --library /tmp/x` prints exactly one stdout line `{"result":"unavailable","reason":"steamclient-missing"}` and exits 2; stderr has no `AUTH` line (dispatch runs before the secret block).
    - `--steam-installapp abc`, `--steam-installapp` with no appId, an appId over 10 digits, a relative `--library`, or a `--library` containing `..` segments -> `{"result":"usage",...}` and exit 64.
    - `--dry-run` is accepted and parsed (behaviour without Steam is the same unavailable line).
  </behavior>
  <action>
Host the caller in the existing bridge helper (per todo step 2 — it is already built, bundled, signed with `disable-library-validation`, and located at `steamBridgeHelperPath`, so no packaging change is needed). Put all logic in a new header `native/steam-bridge/helper/gamelib_installapp.h` (static functions, include guard, same style as the sibling `gamelib_*.h` headers), `#include` it after `gamelib_overlay_signal.h` in bridge_helper.c, and add one dispatch as the first statement in `main()` right after `signal(SIGPIPE, SIG_IGN)`: if `argc > 1 && strcmp(argv[1], "--steam-installapp") == 0` return `gamelib_installapp_main(argc, argv)`. That path must not touch the secret env block, steam_appid.txt, libsteam_api or the socket server.

Argv: `--steam-installapp <appId> [--library <absPath>] [--dry-run]`. appId 1-10 ASCII digits; library must start with '/', length < 1024, no `/../` or trailing `/..` segment. Bad argv -> usage line, exit 64.

Output contract (stdout, ONE final JSON line, flushed; diagnostics only on stderr): `{"result":"ok","appId":N,"folderIndex":I,"eAppUpdateError":0,"engineSlot":S,"installAppSlot":K}` exit 0; `{"result":"unavailable","reason":"<token>"}` exit 2; `{"result":"error","appId":N,"folderIndex":I,"eAppUpdateError":E}` exit 3; dry-run ok adds `"dryRun":true` and `"libraryFolders":[...]` and never calls InstallApp. Escape any path written into JSON (backslash and quote). Reason tokens: `unsupported-arch`, `steamclient-missing`, `dlopen-failed`, `no-create-interface`, `no-engine`, `steam-not-running`, `not-signed-in`, `app-manager-not-found`, `probe-timeout`, `method-unverified:<Name>`, `library-lookup-unverified`, `library-not-registered`.

Architecture: wrap the whole body in `#if defined(__aarch64__)`; on any other arch print `unsupported-arch` (the x64 helper slice is built too, and the function-ID decode below is arm64-only; Windows/Linux and x86_64 are out of scope per the todo).

Engine getter resolution (never trust a fixed slot, never call an unverified getter in the process that will do the install): BEFORE any dlopen in the parent, scan candidates by `fork()`ing one child per candidate slot. Each child does its own dlopen -> CreateInterface -> CreateSteamPipe -> ConnectToGlobalUser -> calls the candidate as `void*(this,user,pipe)` -> writes a short status to a pipe fd (`rtti:<name>` or the failing step's reason token) -> `_exit(0)`. Parent reads with `poll()` and a 3 s per-child timeout (SIGKILL + waitpid on timeout or crash; a crashed/timed-out child just means "not this slot"). If the first child reports a pre-getter failure (steamclient-missing, dlopen-failed, no-engine, steam-not-running, not-signed-in), stop and report that reason. Candidate order: 43 (last verified), 45 (header), then the remaining slots in 36..52 ordered by distance from 43; stop at the first child whose RTTI name contains `IClientAppManager`. None -> `app-manager-not-found`. Cap total scan wall time at 20 s -> `probe-timeout`. Document in a comment why fork-before-dlopen (an unverified getter crashed the 065 probe; the child is disposable, the parent never calls an unverified slot) and that engine slots 0/3 are the stable prefix guarded by return value.

Parent: dlopen, CreateInterface, pipe, user (re-checking each), call the verified getter slot, and re-verify the RTTI name before using the pointer.

App-manager method resolution by IPC function ID (reads code bytes only, calls nothing): for each slot 0..119 of the app-manager vtable, scan up to 32 instructions at the slot's code pointer for `movz wN,#lo` (`(insn & 0xFFE0001F) == (0x52800000 | N)`, hw=0) followed by `movk wN,#hi,lsl #16` on the SAME register (`(insn & 0xFFE0001F) == (0x72A00000 | N)`), hi = `(insn >> 5) & 0xFFFF`, and require an interface-id-17 load in the same window (`movz wM,#17`, i.e. `(insn & 0xFFFFFFE0) == 0x52800220`). A method is verified only if exactly one slot carries its high half. Arg-shape guard for InstallApp: its slot must be verified AND the next slot must carry UninstallApp's 0x4505 (the 065 neighbour order; serializer arg sizes are not decoded — say so in a comment). Unverified -> `method-unverified:<Name>`; never call it.

Library folder (todo step 5): with `--library`, resolve GetNumLibraryFolders (0xab50) and GetLibraryFolderPath (0xf27c); unverified -> `library-lookup-unverified`. Count must be 1..64 else `library-lookup-unverified`. For each index call GetLibraryFolderPath into a zeroed 1024-byte buffer, force NUL termination; a result that does not start with '/' or does not `stat` as a directory -> `library-lookup-unverified` (the shapes were never called in a spike). Match by `realpath()` equality of the folder path against the requested path, also accepting a request equal to `<folder>/steamapps`. No match -> `library-not-registered`. Without `--library`, use index 0 (the only tested value) and skip the lookup.

Then (not dry-run) call InstallApp as `uint32 (this, uint32 appId, int32 folderIndex, bool false)` and print ok / error by return value. Exit by returning from main (no pipe release — the spikes did the same and Steam reaps it).

Test (`src/backend/storeManagers/steam/__tests__/steamInstallAppHelper.test.ts`, darwin-only `describe` skipped elsewhere with the reason in its title, like helperIntegration.test.ts): compile the real helper with `buildHelperCompileArgv()` into a mkdtemp under a `createFakeHomeProfile()` root, run it with `execFileSync`/`spawnSync` using `env: profile.childEnv()` (never a hand-rolled env literal — fakeHomeIsolation gate), assert the behaviours above, `dispose()` in afterAll. This is the isolated arm; there is deliberately no real-profile arm in CI because a real-profile run would talk to the operator's live Steam — that arm is the live gate in the SUMMARY.

Optional, non-blocking, read-only: if Mac Steam is running and signed in on this machine, build into the scratchpad and run `--steam-installapp 440 --library "$HOME/Library/Application Support/Steam" --dry-run` once with the real HOME and paste the single JSON line into the SUMMARY (it calls no InstallApp; it does call the never-before-called GetLibraryFolderPath, which is why it is worth recording). Do not run without `--dry-run`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && clang -O2 -Werror=uninitialized -arch arm64 -I native/steam-bridge/generated -I native/steam-bridge/helper -o "$TMPDIR/gl-installapp-helper" native/steam-bridge/helper/bridge_helper.c && clang -O2 -Werror=uninitialized -arch x86_64 -I native/steam-bridge/generated -I native/steam-bridge/helper -o "$TMPDIR/gl-installapp-helper-x64" native/steam-bridge/helper/bridge_helper.c && pnpm test -- src/backend/storeManagers/steam/__tests__/steamInstallAppHelper.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && npx prettier --check src/backend/storeManagers/steam/__tests__/steamInstallAppHelper.test.ts</automated>
    Prettier: `--file-info` shows the .c/.h files have no inferable parser (not ignored, but `inferredParser: null`), so they are omitted from the check by design; only the .ts test is checked.
  </verify>
  <done>Both arch slices compile; the subcommand prints one well-formed result line for every path; the existing helperIntegration suite still passes; no getter or method is ever called without RTTI / function-ID verification.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Setting key, macOS-only accessor, Settings toggle with (i) help, and the backend helper caller</name>
  <files>src/common/types.ts, src/backend/config.ts, src/backend/__tests__/configSteamExperimentalInstallAppDefault.test.ts, src/backend/storeManagers/steam/experimentalInstallAppSetting.ts, src/backend/storeManagers/steam/__tests__/experimentalInstallAppSetting.test.ts, src/backend/storeManagers/steam/steamInstallApp.ts, src/backend/storeManagers/steam/__tests__/steamInstallApp.test.ts, src/frontend/screens/Settings/components/SteamExperimentalInstallApp.tsx, src/frontend/screens/Settings/components/__tests__/SteamExperimentalInstallApp.test.tsx, src/frontend/screens/Settings/components/index.ts, src/frontend/screens/Settings/sections/GeneralSettings/index.tsx, public/locales/en/translation.json</files>
  <behavior>
    - Factory default and a fresh config both report `steamExperimentalInstallApp === false`.
    - Accessor: unset/false -> false; true on macOS -> true; true with isMac false -> false.
    - View renders nothing when not macOS; renders the toggle + InfoIcon on macOS; toggling calls onToggle(!value).
    - requestSteamInstallApp: ok line -> {kind:'ok', folderIndex}; unavailable line -> {kind:'unavailable', reason}; error line -> {kind:'error', code}; spawn error / timeout / no JSON / helper path missing -> {kind:'unavailable', reason:'helper-failed' | 'helper-missing'}; argv is exactly ['--steam-installapp', appId, '--library', path] (library omitted when undefined); a non-digit appId never spawns.
  </behavior>
  <action>
Per todo step 1. Add `steamExperimentalInstallApp: boolean` to AppSettings in src/common/types.ts beside `enableSteamNativeInstall`, and `steamExperimentalInstallApp: false` beside `enableSteamNativeInstall: true` in config.ts factory defaults; mirror configShareDetectedFixesDefault.test.ts for the default test.

Accessor in a NEW sibling file `experimentalInstallAppSetting.ts` (not nativeInstallSetting.ts — that module's test pins its export list to one name): `isSteamExperimentalInstallAppEnabled()` returns `isMac && GlobalConfig.get().getSettings().steamExperimentalInstallApp === true` (isMac from backend/constants/environment). Header comment: the ONLY read of this key; undocumented Valve-internal API, default OFF, macOS only.

Toggle `SteamExperimentalInstallApp.tsx` following ShareDetectedFixes.tsx's View+container shape: exported `SteamExperimentalInstallAppView({isMac, value, onToggle, t})`; container uses `useSetting('steamExperimentalInstallApp', false)` and ContextProvider `platform === 'darwin'`, and like EnableSteamNativeInstall returns `<></>` when SettingsContext `isDefault` is false. Title key `setting.steamExperimentalInstallApp` = "Steam Experimental InstallApp Feature"; help key `help.steamExperimentalInstallApp` = "Off by default. Asks the running Steam app to install games through an undocumented internal Steam interface, so Steam's window and install dialog stay closed, and games GameLib downloads are added to Steam without restarting it. If Steam isn't running, you're signed out, or a Steam update changed the interface, GameLib falls back to the normal behaviour automatically." Help is the icon-only InfoIcon on the label line (memory rule: no "Help" text link). Add both keys to public/locales/en/translation.json under the same `help` / `setting` objects as `shareDetectedFixes`. Export from components/index.ts and render `<SteamExperimentalInstallApp />` directly after `<EnableSteamNativeInstall />` in GeneralSettings/index.tsx. Test mirrors ShareDetectedFixes.test.tsx.

Caller `steamInstallApp.ts`: export type `SteamInstallAppOutcome = {kind:'ok'; folderIndex:number} | {kind:'unavailable'; reason:string} | {kind:'error'; code:number}` and `requestSteamInstallApp(appId: string, opts: {libraryPath?: string}, deps?: {helperPath?: string; run?: (file, args, timeoutMs) => Promise<{stdout:string; stderr:string; code:number|null}>})`. Validate appId `/^\d{1,10}$/` (else unavailable 'bad-appid', no spawn). Missing helper file (existsSync) -> 'helper-missing' (dev tree without `pnpm build-steam-bridge`). Default runner: `execFile` from node:child_process with `{ timeout: 30000, maxBuffer: 64 * 1024 }` and NO `env` option (inherit; the helper needs the real HOME to find steamclient — and the fakeHomeIsolation gate forbids an env literal); it never rejects, it resolves code/stdout/stderr. User-triggered, bounded by timeout, so it satisfies the sidecar exit contract's no-unbounded-in-flight-work half. Parse the LAST non-empty stdout line as JSON and map strictly by `result`; anything else -> 'helper-failed'. Log every non-ok outcome with logWarning (LogPrefix.Steam) including the reason/code and trimmed stderr tail (no secrets are involved). Unit tests inject `run`; no real spawn.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm test -- src/backend/__tests__/configSteamExperimentalInstallAppDefault.test.ts src/backend/storeManagers/steam/__tests__/experimentalInstallAppSetting.test.ts src/backend/storeManagers/steam/__tests__/nativeInstallSetting.test.ts src/backend/storeManagers/steam/__tests__/steamInstallApp.test.ts src/frontend/screens/Settings/components/__tests__/SteamExperimentalInstallApp.test.tsx src/backend/__tests__/fakeHomeIsolation.test.ts && pnpm lint-translations:gamelib && npx prettier --check src/common/types.ts src/backend/config.ts src/backend/__tests__/configSteamExperimentalInstallAppDefault.test.ts src/backend/storeManagers/steam/experimentalInstallAppSetting.ts src/backend/storeManagers/steam/__tests__/experimentalInstallAppSetting.test.ts src/backend/storeManagers/steam/steamInstallApp.ts src/backend/storeManagers/steam/__tests__/steamInstallApp.test.ts src/frontend/screens/Settings/components/SteamExperimentalInstallApp.tsx src/frontend/screens/Settings/components/__tests__/SteamExperimentalInstallApp.test.tsx src/frontend/screens/Settings/components/index.ts src/frontend/screens/Settings/sections/GeneralSettings/index.tsx</automated>
    Prettier: public/locales/en/translation.json is prettier-ignored (`--file-info` -> ignored:true), so it is omitted. If lint-translations:gamelib reports new pairs for these keys, regenerate with `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`, confirm the diff adds only this task's keys, and add `npx prettier --check meta/i18nCatalogPresenceBaseline.json`.
  </verify>
  <done>New key defaults false; accessor is the single macOS-gated read; toggle renders only on macOS in global settings with (i) on the label line; caller maps every helper outcome to a typed result and never throws.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Wire InstallApp into both native install routes with automatic fallback</name>
  <files>src/backend/storeManagers/steam/installLocation.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, .planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md</files>
  <behavior>
    - OFF route, setting ON, outcome ok: no openExternal; startInstallPolling(appId, {delegatedToSteamClient:true}); returns {status:'done'}; requestSteamInstallApp called with the resolved library root.
    - OFF route, setting ON, outcome unavailable: openExternal(steam://install/<id>) and the same polling call as today.
    - OFF route, setting ON, outcome error code 2: returns {status:'error'} whose message contains "EAppUpdateError 2"; no openExternal, no polling.
    - OFF route, setting ON, ensureSteamClientReady needs-install: deferred exactly as today, helper never called.
    - ON route, setting ON, Steam running, outcome ok: recordPendingAdoption NOT called, clearPendingAdoption called, polling opts unchanged; called with libraryPath = dirname(dirname(manifestPath)).
    - ON route, setting ON, outcome unavailable or error: recordPendingAdoption called exactly as today.
    - ON route, setting ON, Steam not running: helper not called; clearPendingAdoption as today.
    - Setting OFF (mock returns false/undefined): requestSteamInstallApp never called on either route.
  </behavior>
  <action>
installLocation.ts: export `resolveSteamLibraryRoot(overridePath?: string): Promise<string | undefined>` = `resolveOverride(overridePath, await listSteamLibraryTargets())?.path`, returning undefined when there are no libraries — reuses the D-08 registered-library-only rule rather than duplicating it.

games.ts OFF route (todo step 3), inside install() after the `ensureSteamClientReady` gate and before the existing `logInfo(... delegating install ...)`: when `isSteamExperimentalInstallAppEnabled()`, call `requestSteamInstallApp(this.appId, { libraryPath: await resolveSteamLibraryRoot(args?.path) })` (catch a rejection of the root lookup as libraryPath undefined). `ok` -> logInfo that Steam is installing via InstallApp (folder index), `startInstallPolling(this.appId, { delegatedToSteamClient: true })`, return `{ status: 'done' }`. `error` -> logError and return `{ status: 'error', error: \`Steam refused the install of ${this.appId} (EAppUpdateError ${code})\` }` — the todo's live gate requires the code be surfaced, not swallowed; this is the one non-fallback outcome, because Steam itself answered. `unavailable` -> logInfo the reason and continue into the untouched steam://install code below. Do not modify the existing statements; setting OFF must skip the new block entirely (no helper spawn, no extra await before openExternal).

games.ts ON route (todo step 4), in the `deferredPoll.handoff && leasedResult.status === 'done'` block, inside the `pid !== null` arm before readAcfSnapshot: when the setting is ON, call `requestSteamInstallApp(this.appId, { libraryPath: dirname(dirname(handoff.manifestPath)) })`. `ok` -> `clearPendingAdoption(this.appId)` and logInfo that Steam adopted the install without a restart (Steam's validation also re-fetches anything GameLib wrote wrong); skip the record. Any other outcome -> logWarning with reason/code and fall through to the existing readAcfSnapshot + recordPendingAdoption code unchanged (the files are complete, so restart-on-Play is still the right fallback; an EAppUpdateError here does not fail an install that already succeeded). The final startInstallPolling call stays exactly as is on every arm. Steam-not-running arm unchanged.

Import the accessor and caller with named imports; import `dirname` from 'path' if not already imported. Update the comment above the ON-route block so "the ONLY place a pending-adoption record is written" stays true and mentions the InstallApp arm.

games.test.ts: add `jest.mock('../experimentalInstallAppSetting', () => ({ isSteamExperimentalInstallAppEnabled: jest.fn() }))` and `jest.mock('../steamInstallApp', () => ({ requestSteamInstallApp: jest.fn() }))` next to the nativeInstallSetting mock, and add `resolveSteamLibraryRoot: jest.fn()` to the installLocation mock factory. Add a new describe block after the ji2 describe that reuses its beforeEach shape and covers every behaviour above (one `it` each; the setting-OFF case asserts `requestSteamInstallApp` not called on both routes). Do not edit existing tests.

Todo step 6 (lost confirmations): on the ON route GameLib's SteamDialog already owns the library choice and free-space line. On the OFF route this task enforces the folder half in the backend (target is always a registered Steam library mapped to Steam's own index, never an arbitrary path; unmapped -> fallback to Steam's dialog). Surfacing the library dropdown and free-space line in the modal for the OFF+InstallApp route is NOT done here: the modal derives "GameLib installs this" from the `listSteamLibraryTargets` IPC list length (RESEARCH Pitfall 4 forbids a second settings read) and the same signal drives SteamDialog's sign-in gate and notice copy, so it needs its own IPC discriminator. Create `.planning/todos/pending/2026-11-05-steam-installapp-modal-owns-disk-and-folder.md` with frontmatter `created`, `title`, `area: steam-install`, `files` (installFlowRegistration.ts listSteamLibraryTargets handler, InstallModal/index.tsx steamNativeInstallOn, steamSectionGating.ts, SteamDialog/index.tsx signInRequired), then `severity: low`, `platform: macos`, `ready: yes` in that order, bare lowercase, plus Problem/Solution sections stating the above and linking the parent todo.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm test -- src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts src/backend/storeManagers/steam/__tests__/library.test.ts && pnpm codecheck && npx eslint src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/installLocation.ts src/backend/storeManagers/steam/steamInstallApp.ts src/backend/storeManagers/steam/experimentalInstallAppSetting.ts && pnpm planning-gates && npx prettier --check src/backend/storeManagers/steam/installLocation.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
    Prettier: the new .planning todo is prettier-ignored (`.planning` in .prettierignore), so it is omitted; `pnpm planning-gates` covers its triage frontmatter.
  </verify>
  <done>Both routes call InstallApp only when the macOS setting is ON, fall back to today's code on any unavailable outcome, surface a Steam-reported error on the OFF route, and the full games.test.ts suite passes with existing tests untouched; follow-up todo filed and passes planning-gates.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar -> steam-bridge-helper argv | appId and library path cross into a native process |
| helper -> user's steamclient.dylib | GameLib calls undocumented Valve-internal code in the user's own Steam install |
| helper -> running Steam (IPC) | an install request reaches the user's signed-in Steam session |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ord-01 | Tampering | helper argv parsing | mitigate | appId 1-10 digits validated in both steamInstallApp.ts and the helper; library absolute, < 1024 bytes, no `..` segments; execFile argv form, never a shell string |
| T-ord-02 | Denial of service | unverified vtable slot call | mitigate | getter scan runs only in forked disposable children; parent calls only RTTI-verified getter and function-ID-verified methods; else `unavailable` -> fallback |
| T-ord-03 | Denial of service | helper hang | mitigate | 3 s per-child, 20 s total scan cap in the helper; 30 s execFile timeout in the backend, mapped to `unavailable` |
| T-ord-04 | Elevation of privilege | install to unintended folder | mitigate | library root comes only from resolveSteamLibraryRoot (registered libraries, D-08) or the GameLib-written manifest's own library; helper requires a realpath match to one of Steam's own folders |
| T-ord-05 | Information disclosure | helper stdout/stderr in logs | accept | only appId, folder index, error code and library paths; no tokens or credentials pass through this path |
| T-ord-06 | Spoofing | dlopen of steamclient.dylib | accept | loads the user's own Steam install from its fixed per-user path, as libsteam_api already is; nothing Valve-licensed is shipped |
</threat_model>

<verification>
- `pnpm test` for every suite named in the three tasks passes; `pnpm codecheck` clean.
- Grep: `grep -n "requestSteamInstallApp(" src/backend/storeManagers/steam/games.ts` shows exactly two call sites, each inside an `isSteamExperimentalInstallAppEnabled()` branch.
- Grep: `grep -v '^\s*//' native/steam-bridge/helper/gamelib_installapp.h | grep -c "0xdd9a"` >= 1, and no app-manager method is invoked through a numeric slot literal.
- The todo `.planning/todos/pending/2026-11-03-steam-experimental-installapp-setting.md` is still in pending/.
</verification>

<success_criteria>
- Setting exists, defaults OFF, macOS-only in UI and accessor.
- Helper subcommand resolves everything at runtime and reports ok / unavailable(reason) / error(code).
- Both install routes use it when ON and fall back automatically; OFF is unchanged.
- SUMMARY carries the operator live-gate checklist below, verbatim in shape, every `result: pending`.
</success_criteria>

<output>
Create `.planning/quick/261105-ord-steam-experimental-installapp-setting-ma/261105-ord-SUMMARY.md`. It MUST include a "Live gate (operator)" section using the UAT item shape (`### N.` at column 0, `expected:` inline, `result: pending` on the next line), preceded by the prep note: run `pnpm build-steam-bridge`, then restart `pnpm tauri:dev` (dev does not rebuild the sidecar or helper), with Mac Steam running and signed in. Items:

### 1. Fresh install, setting ON + downloader OFF
expected: No Steam window or dialog appears; the game downloads in Steam; GameLib's Downloads view tracks progress to Installed.
result: pending

### 2. Adoption of a GameLib-downloaded install (downloader ON)
expected: After GameLib finishes the depot download, Steam shows the game Fully Installed within seconds with no restart and no window; Play does not restart Steam.
result: pending

### 3. Multi-depot adoption (XCOM 200510)
expected: Same as item 2 for a multi-depot title; Steam's content log shows pre-existing matching files and no full re-download.
result: pending

### 4. Non-default library folder
expected: Install into a second registered Steam library lands there (folder index > 0) and Steam reports it installed in that library.
result: pending

### 5. Steam not running
expected: OFF route falls back to steam://install (Steam launches with its dialog); ON route records restart-on-Play as before; no crash, log shows reason steam-not-running.
result: pending

### 6. Steam signed out
expected: Clean fallback as in item 5, log shows reason not-signed-in.
result: pending

### 7. Unowned or bad appId
expected: Install fails with a message naming the EAppUpdateError code; nothing is swallowed.
result: pending

### 8. Setting OFF
expected: Both routes behave exactly as before this change (steam://install dialog; restart-on-Play after a GameLib download).
result: pending

Also record: the optional Task 1 dry-run JSON line (or "not run"), and the Task 3 follow-up todo path. Do NOT move the parent todo to completed.
</output>
