---
phase: 59
slug: steam-engine-fallback-when-crossover-is-unavailable
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-04
---

# Phase 59 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register source: the `<threat_model>` tables of 59-01..59-53 (173 threats, authored at plan time), verified against the code on `main` after the review fixes recorded in 59-REVIEW-FIX.md and the round 4-6 gap-closure plans (59-44..59-53).
>
> Path legend: `E/` = `src/backend/storeManagers/steam/engine/`, `S/` = `src/backend/storeManagers/steam/`, `FE/` = `src/frontend/`. `W0/` = `.planning/phases/59-steam-engine-fallback-when-crossover-is-unavailable/wave0/`. Line numbers are against current `main`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Sidecar -> CrossOver `bin/wine`, `bin/cxbottle`, `bin/wineserver` | GameLib spawns third-party binaries with the real HOME (declared real-profile arm) | Bottle name (argv/env), engine stdout |
| CrossOver stdout -> parser / log | Engine output decides the engine route and is copied into one log line | `--demo-status` text, nonzero-exit text |
| GitHub release CDN -> sidecar | Downloaded Wine-Staging and DXVK archives are untrusted until hashed | ~230 MB archives |
| Archive contents -> filesystem | tar entries and symlinks could escape the extraction root | Files under `tools/steam-engines` |
| Renderer -> sidecar IPC | `getSteamEngineState`, `listSteamEngineOptions`, `dismissSteamEngineNotice`, `setSetting(steamEngineOverride)` | appId, notice kind, build string, override id |
| Per-game config / Wine Manager store / persisted notice store -> decision | `steamEngineOverride`, installed WM list, dismissed-builds list are on-disk, hand-editable | Override id, version strings |
| `.gamelib-engine.json` marker in user bottle -> spawn | Marker names a wineserver binary and a DXVK copy dir | Absolute paths (validated on read) |
| Sidecar -> per-game bottle processes | `wineserver -k` kills every process in a prefix; launch deadline can fire it | WINEPREFIX, wineserver path |
| Sidecar -> CrossOver Bottles directory | Directory create/remove and `cxbottle.conf` write in CrossOver's tree | Bottle dir, conf |
| OS network state / DNS -> launch refusal | Interface list and lookups gate an early offline refusal | Reachability verdict |
| Sidecar -> renderer push | `steamEngineStateChanged`, `engine-download` status, `gameSettingWriteFailed`, dialog frames | Closed enums, rounded percent, appName/key |
| Install flow -> route integrity | Install/launch failures must never reroute a title to bottled Steam | `markBridgeFailedThisSession`, `steamBridgeSetupRequired` |
| Live UAT / wave-0 harness -> operator's CrossOver install, licence, bottles | Real user data on the operator's Mac | CrossOver.app, licence file, bottles, pinned engine dir |

---

## Threat Register

Evidence conventions: "test" names a suite that passed on 2026-11-04 (`npx jest` over `E/__tests__`, `connectivityNow`, `engineTempSweepBootWire`, `flowRegistrationCensus`, `gameSettingWrite`, `engineDownloadLabel`, `SteamEngineLaunchNotice`: 17 suites, 367 tests, all passing).

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-59-01 | Tampering | run-wave0.sh engine calls | mitigate | `W0/run-wave0.sh:3-4,46,50` header + every CrossOver call sets `CX_BOTTLE_PATH="$WORK/Bottles"`, every Staging call `WINEPREFIX="$p"` inside `$WORK`; real bottles only `cp -c -R` sources (`:56,156,170,180`); `rm` calls only target `$WORK` paths (`:38,126-128,168,202`) | closed |
| T-59-02 | Tampering | CrossOver licence | mitigate | Harness has no licence access; spike 060 read-deny `nolicence.sb` used for expiry runs; `59-01-SUMMARY.md:57` records licence mtime unchanged before and after | closed |
| T-59-03 | Denial of service | wine stdout capture | mitigate | `W0/run-wave0.sh:22` `WINEDEBUG=-all MVK_CONFIG_LOG_LEVEL=0`, `:24` perl `alarm` bound `T()`, `:25` `cap() { head -c 1048576; }` used on captured runs (`:76,90,114,143-144`) | closed |
| T-59-04 | Repudiation | licence prompts | accept | See Accepted Risks log (AR-01) | closed |
| T-59-05 | Information disclosure | logs | accept | See Accepted Risks log (AR-02) | closed |
| T-59-06 | Tampering | probeDemoStatus argv/env | mitigate | `E/demoStatus.ts:20` `BOTTLE_RE`, `:84` rejects before spawn; `:104-108` `spawn(join(binDir,'wine'), ['--demo-status'], {env:{...baseEnv, CX_BOTTLE}})` argv form, no shell | closed |
| T-59-07 | Spoofing | parseDemoStatus | mitigate | `E/demoStatus.ts:33-48` anchored regexes on the last trimmed line, else `unrecognised`; `engineDecision.ts` maps `unrecognised` to `broken` (never licensed); `demoStatus.test.ts` | closed |
| T-59-08 | Denial of service | probe hang / output flood | mitigate | `E/demoStatus.ts:17,19` 15 s / 64 KiB caps, `:116-118,138` child/pipes/timer unref'd, `:127` SIGKILL, `:94-101` `settled` guard resolves once | closed |
| T-59-09 | Tampering | steamEngineNoticeStore values | mitigate | `E/testedCrossoverVersions.ts:50-54` string[] filter, `:68` `BUILD_RE` on dismiss, `:71` `slice(-50)` cap | closed |
| T-59-10 | Information disclosure | probe log line | accept | See Accepted Risks log (AR-03) | closed |
| T-59-11 | Tampering | ensurePinnedEngine | mitigate | `E/enginePins.ts:35-60` size+sha256 in source, versioned URLs (no `latest`); `E/fallbackEngine.ts:223-234` size check, streaming `sha256OfFile`, `rmSync(archive)` on mismatch before extraction at `:238` | closed |
| T-59-12 | Tampering / EoP | extraction | mitigate | `E/fallbackEngine.ts:187` `mkdtempSync` temp dir, `:138-164` `assertContained` lstat walk + symlink `isContained`/`realpath` checks, `:249` run before `:263` `renameSync` into place; `fallbackEngine.test.ts` | closed |
| T-59-13 | Elevation | steamEngineOverride | mitigate | `E/engineIds.ts:16-37` closed grammar (`pinnedById`, `WM_VERSION_RE`, no `..`, `-DXMT`/gptk rejected, unknown -> `automatic`); `engineDecision.ts:359-360` WM id resolved against installed list with `relative()` containment; `engineIds.test.ts` | closed |
| T-59-14 | Denial of service | concurrent downloads / disk | mitigate | `E/fallbackEngine.ts:280,322-339` single-flight `inFlight` map per pin id; `:309-311` prune only after success; `:397-401` keeps current+previous | closed |
| T-59-15 | Denial of service | sidecar exit | mitigate | `E/fallbackEngine.ts:1-8,280` no module-load work, in-flight map empty at boot, download only inside `ensurePinnedEngine` | closed |
| T-59-SC | Tampering | package installs | accept | See Accepted Risks log (AR-04) | closed |
| T-59-16 | Denial of service | launch deadline on a running game | mitigate | `E/launchDeadline.ts:72,84` state machine (`cancel`/fire only from `armed`); `S/games.ts:5959-5972` `onFirstMatch` cancels; `bottleProcessMonitor.ts:19,34` keeps LD-4 (no deadline); `launchDeadline.test.ts` | closed |
| T-59-17 | Denial of service | sidecar exit | mitigate | `E/launchDeadline.ts:105` `handle.unref?.()`, `:38` empty map at load, `:119` `__activeLaunchDeadlineCount` asserted in `launchDeadline.test.ts` | closed |
| T-59-18 | Tampering | appId as map key / log | mitigate | `E/launchDeadline.ts:37,48-50` `^[0-9]{1,10}$` guard throws | closed |
| T-59-19 | Repudiation | silent kills | mitigate | `E/launchDeadline.ts:76-79` cancel logs appId + reason, `:87-90` fire logs appId + elapsed ms (cancel line carries no elapsed; reason and appId present, accepted as sufficient) | closed |
| T-59-20 | Elevation | setEngineSelection | mitigate | `E/engineRegistry.ts:19-37` numeric appId, `existsSync` on wine/wineserver; selections built only from `ENGINE_PINS`/WM list in `engineDecision.ts:339-353,425-480`; IPC (`sidecar/steamAuthFlowRegistration.ts:372-387`) has no selection-setting channel | closed |
| T-59-21 | Denial of service | killBottleWineServerWith | mitigate | `S/bottle.ts:734-770` `sanitizeBottleName` round-trip + `relative(bottlesRoot, dir) === bottleName`, `...extraEnv` before `WINEPREFIX` (last), `timeout: timeoutMs` | closed |
| T-59-22 | Tampering | fallback settings env | mitigate | `S/bottle.ts:1713-1722` `FALLBACK_STRIPPED_ENV_KEYS` (USER, WINEPREFIX, CX_*, WINELOADER, WINESERVER, ...) filtered at `:1736` before engine values appended | closed |
| T-59-23 | Tampering | user profile | mitigate | `S/bottle.ts` `buildFallbackGameSettings` appends `{key:'USER', value:'crossover'}`; same `USER: 'crossover'` on every `killBottleWineServerWith` caller | closed |
| T-59-24 | Tampering | writeCxbottleConf | mitigate | `E/adoptBottle.ts:37` requires `system.reg`, `:44` refuses existing conf, `:54-55` `flag:'wx'` tmp + `renameSync`; `adoptBottle.test.ts` | closed |
| T-59-25 | Denial of service | partial-bottle cleanup | mitigate | `S/bottle.ts:2249-2270` `removeCreatedBottleDir`: `sanitizeBottleName` round-trip + `relative(bottlesRoot, dir) === bottleName`; callers gate on `createdHere` (`:2300,2477`) | closed |
| T-59-26 | Elevation | marker wineserverBin | mitigate | `E/engineSwitch.ts:301-312` `killPrevious` allows only `isInside(pinnedEngineRoot())`, `toolsPath/wine`, or CrossOver's own wineserver; otherwise logs and ignores | closed |
| T-59-27 | Tampering | user's CrossOver.app | mitigate | Only executions are `cxbottleIn(binDir)` (`S/bottle.ts:2500`) and `binDir/wineserver`; `crossoverLocation.ts` has no write calls; `games.test.ts:15753` asserts no `NagTime` handling; conf is written under the Bottles dir only | closed |
| T-59-28 | Denial of service | cxbottle --create hang | mitigate | `S/bottle.ts:2500-2520` `timeout: createTimeoutMs`, `killBottleWineServer` (15 s), `CROSSOVER_CREATE_TIMEOUT` (`:91`); `engineDecision.ts` `CX_CREATE_CAP_MS` | closed |
| T-59-29 | Denial of service | killing a running game | mitigate | `E/engineSwitch.ts:419-426` `prepareBottleForEngine` returns `game-running` when the monitor phase is non-null, before any kill | closed |
| T-59-30 | Elevation | decideLaunchEngine override | mitigate | `E/engineDecision.ts:403` `parseEngineOverride(readOverride)`, `:421-437` pinned ids only from `d.pins`, `:439-480` WM via `resolveWineManagerStaging` (installed list + `relative()` containment `:359-360`), unresolvable -> `unavailable` | closed |
| T-59-31 | Spoofing | pre-flight mapping | mitigate | `E/engineDecision.ts:330-336` unrecognised -> `broken`; `:267-299` timeout stops that bottle's wineserver (`stopWineserver`) | closed |
| T-59-32 | Tampering | dismissSteamEngineNotice | mitigate | `E/engineState.ts:401-423` object check, closed kind set (`no-crossover`/`untested-crossover`), `BUILD_RE` | closed |
| T-59-33 | Denial of service | page-open pre-flight | mitigate | `E/engineState.ts:57,271-287` `inflight` map one probe per bottle, `preflightCache`, `ENGINE_PREFLIGHT_UNHEALTHY_TTL_MS`; on demand only; 15 s probe cap | closed |
| T-59-34 | Repudiation | engine choice | mitigate | `E/engineDecision.ts:408-418` `engineLogLabel` + `untestedCrossoverLogLine` in `logLines`; `S/games.ts:4498` logs every line | closed |
| T-59-35 | Tampering | getSteamEngineState / dismissSteamEngineNotice | mitigate | `sidecar/steamAuthFlowRegistration.ts:372-387` `args[0]` passed uncast; `engineState.ts:248` numeric appId guard first | closed |
| T-59-36 | Elevation | listSteamEngineOptions | mitigate | `sidecar/steamAuthFlowRegistration.ts:379-381` ignores renderer args; `E/engineDecision.ts:569-620` returns `id/kind/label/available/installed/isPreviousPin` only, no paths | closed |
| T-59-37 | Information disclosure | steamEngineStateChanged payload | accept | See Accepted Risks log (AR-05) | closed |
| T-59-38 | Repudiation | census drift | mitigate | `sidecar/__tests__/flowRegistrationCensus.test.ts:106` EXPECTED updated to 25 invoke channels; suite passes | closed |
| T-59-39 | Tampering | engine download | mitigate | Only `ensurePinnedEngine` downloads engines (`S/games.ts:2286-2307`, `engineSwitch.ts:99`); `downloadFile` called only at `E/fallbackEngine.ts:204` | closed |
| T-59-40 | Denial of service | cxbottle --create | mitigate | `S/games.ts:2508-2565` `decideCreationEngine` supplies `createTimeoutMs`; timeout/missing/failed falls through to `ensureBuiltInEngineForInstall` + built-in creation | closed |
| T-59-41 | Elevation via routing | bottled-Steam fallback | mitigate | `S/games.ts:2358-2366` engine download failure returns an error result with no `markBridgeFailedThisSession`; abort path `:2333-2342` returns `abort`; only a bottle-provision failure (`:2579`) marks | closed |
| T-59-42 | Denial of service | status flood | mitigate | `S/games.ts:2288-2306` `sendEngineContext` returns when `context === lastContext`; monotonic `highest` percent | closed |
| T-59-43 | Denial of service | deadline kill | mitigate | `S/games.ts:5676-5684` armed only when `installRoot` (a monitor exists); `:5959-5972` first match cancels; `:4556` kill via `killBridgeBottleWineServer` (`S/bottle.ts:2134-2150`, per-game guard, 15 s) | closed |
| T-59-44 | Elevation via routing | deadline / download failure | mitigate | `S/games.ts:4531-4574` `onBridgeLaunchDeadline` has no `markBridgeFailedThisSession`/`steamBridgeSetupRequired`; engine-download failure path in `selectLaunchEngine` (`:4396-4410`) only shows a dialog | closed |
| T-59-45 | Repudiation | engine used | mitigate | `S/games.ts:4498` logs each `decision.logLines` entry (engineLogLabel, untested line); `engineRegistry.ts:34-37` logs selection | closed |
| T-59-46 | Tampering / legal | CrossOver trial prompts | mitigate | `rg NagTime src` finds only the comment `S/games.ts:4524` and the guard test `__tests__/games.test.ts:15753` (`not.toMatch(/nagNotice\|NagTime/)`) | closed |
| T-59-47 | Denial of service | sidecar exit | mitigate | `E/launchDeadline.ts:105` unref; `E/demoStatus.ts:116-138` unref'd; no module-load work in `E/*`; `engineTempSweepBootWire.test.ts` | closed |
| T-59-48 | Tampering | DRM / bottled on built-in engine | mitigate | `S/games.ts:3971-3978` bottled path and `:5222-5229` DRM path call `preflightCrossover` and `notifyCrossoverRequired` and return; `decideLaunchEngine` called only from `selectLaunchEngine` (`:4370`) and install redist prep (`:2635`) | closed |
| T-59-49 | Tampering | handleSteamEngineStateChangedSignal | mitigate | `FE/state/SteamEngineState.ts:43-49` drops payloads without string numeric appId (`^[0-9]{1,10}$`); strings go through i18next | closed |
| T-59-50 | Spoofing | Buy CrossOver link | mitigate | `FE/screens/Game/GamePage/components/SteamEngineNotices.tsx:10,23` `CROSSOVER_URL` constant passed to `openExternalUrl`, never from payload | closed |
| T-59-51 | Denial of service | game page fetch | mitigate | `FE/screens/Game/GamePage/index.tsx:228-245` single effect keyed on `[appName, runner, isMac, launchEnded, settingsModalProps.isOpen]`, no interval | closed |
| T-59-52 | Elevation | steamEngineOverride value | mitigate | `FE/screens/Settings/components/SteamEngineOverride.tsx:207` options from `listSteamEngineOptions`; backend `E/engineIds.ts:16-37` and `engineDecision.ts:403` reject everything else to `automatic` | closed |
| T-59-53 | Repudiation | unsupported engine use | mitigate | `SteamEngineOverride.tsx:161-164` override warning on selection; `E/engineState.ts:171-190` `engine='unsupported'` badge; launch log label (T-59-34) | closed |
| T-59-54 | Tampering | CrossOver.app (UAT 59-13) | mitigate | `W0/no-crossover.sb` is a read-deny profile only (`:6`, comment: nothing renamed/moved/modified); `59-UAT.md` restore notes "CrossOver.app untouched" | closed |
| T-59-55 | Tampering | CrossOver licence (UAT 59-13) | mitigate | `59-UAT.md:16` mtime recorded first; restore notes (`:234-244`) "licence unchanged (304 bytes, Oct 22 19:57)" | closed |
| T-59-56 | Tampering | user's bottles (UAT 59-13) | mitigate | `59-UAT.md:234-236` backdate only on a named throwaway bottle, undone/removed; "Bottles list identical to the session-start snapshot" (`:238`) | closed |
| T-59-57 | Information disclosure | captured logs | accept | See Accepted Risks log (AR-06) | closed |
| T-59-60 | Tampering | marker `dxvk.dir` | mitigate | `E/engineSwitch.ts:198-212` `readMarker` keeps `dxvk.dir` only when `isInside(pinnedEngineRoot(), dir)` (absolute, inside, not root) and version matches regex; `engineSwitch.test.ts` | closed |
| T-59-61 | Denial of service | engine switch on a shared bottle | mitigate | `E/engineSwitch.ts:472-480` `shared-bottle` refusal before `killPrevious` (`:504`) | closed |
| T-59-62 | Tampering | restore on expired CrossOver | mitigate | `E/engineSwitch.ts:516-531` `crossoverHealthy:false` restores via `fallbackSettings`; no licence/NagTime/registry touch (T-59-46) | closed |
| T-59-63 | Denial of service | page preflight | mitigate | `E/engineState.ts:121-123` page preflight `killOnTimeout:false`; `E/engineDecision.ts:251-264,277-286` no kill on page read or while a monitor is active (`d.monitorPhase`) | closed |
| T-59-64 | Tampering | appId argument | mitigate | `E/engineState.ts:248` numeric guard first; `:252` eligibility via `findBridgeInstallBottle` (`S/bottle.ts:1379-1400`, GameLib bottle names + `appmanifest_<id>.acf`) | closed |
| T-59-65 | Information disclosure | launchNotice payload | accept | See Accepted Risks log (AR-07) | closed |
| T-59-66 | Denial of service | download after quit | mitigate | `E/fallbackEngine.ts:330-337` `createAbortController('steam-engine-download:<id>')`, `:380` its signal drives `doEnsure`; `sidecar/stdinEofRelease.ts:50` `callAllAbortControllers()` aborts it at stdin EOF | closed |
| T-59-67 | Tampering | .tmp-* prune | mitigate | `E/fallbackEngine.ts:404-409` `isContained(root, full)`, `full !== root`, `lstatSync(full).isDirectory()` (symlink is not a directory), skips active temp while installing | closed |
| T-59-68 | Denial of service | partial bottle dir | mitigate | `S/bottle.ts:2300,2319,2333,2484-2548` `removeCreatedBottleDir` only when `createdHere` | closed |
| T-59-69 | Tampering | interpolated {{title}}/{{engine}} | accept | See Accepted Risks log (AR-08) | closed |
| T-59-70 | Elevation | stored-unavailable entry | mitigate | `FE/screens/Settings/components/SteamEngineOverride.tsx:135` synthetic `MenuItem ... disabled` showing only the stored id; backend still validates (T-59-13) | closed |
| T-59-71 | Repudiation | CrossOver override no longer flagged | accept | See Accepted Risks log (AR-09) | closed |
| T-59-72 | Spoofing | launchNotice reason | mitigate | `FE/components/UI/SteamEngineLaunchNotice/index.tsx:84-86,105-110` `isReason` accepts only the three closed values; `SteamEngineLaunchNotice.test.tsx` passes; non-numeric appId dropped (T-59-49) | closed |
| T-59-73 | Denial of service | launch deadline | mitigate | `E/launchDeadline.ts:129-141` `bindDeadlineToMonitor` cancels with `monitor-unavailable`; `S/games.ts:5959-5962` | closed |
| T-59-74 | Denial of service | shared bottle switch | mitigate | `S/games.ts:4468-4475` `shared-bottle` -> dialog, return `{ok:false}`; enforced in `E/engineSwitch.ts:474-480` | closed |
| T-59-75 | Repudiation | silent Play failures | mitigate | `S/games.ts:4337-4366,4376-4392,4414-4465` each hard failure calls `showEngineDialog` with a key; `FE/components/UI/DialogHandler/index.tsx:103,129,149` `[dialog]` ack log lines | closed |
| T-59-76 | Tampering | redist step engine | mitigate | `S/games.ts:2625-2660` install redist settings from `installEngine` or `decideLaunchEngine` + `prepareBottleForEngine` (`buildFallbackGameSettings` for non-CrossOver, stock only when CrossOver was selected) | closed |
| T-59-77 | Elevation | auth lease scope | mitigate | `S/games.ts:2392-2400` lease acquired once (refusal returns before any work), `:2470-2472` `lease.release()` in the single outer `finally` | closed |
| T-59-78 | Denial of service | work after quit | mitigate | `S/games.ts:2520-2526,2559-2565` `'status' in engine` returns before `provisionBridgeBottle`; `signal?.aborted` re-checks | closed |
| T-59-79 | Tampering | status context parsing | mitigate | `FE/hooks/engineDownloadLabel.ts:13-44` fixed phase names, else `^(?:downloading:)?(\d{1,3})$` clamped to 100, else 0%; `engineDownloadLabel.test.ts` | closed |
| T-59-80 | Tampering | CrossOver.app / licence (UAT 59-23) | mitigate | `W0/no-crossover.sb`; `59-UAT.md:234` "licence unchanged ... no CrossOver.app changes" | closed |
| T-59-81 | Tampering | trial clock / GamesConfig / pinned dir | mitigate | `59-UAT.md:234,236` Restore step done: 38400 backdate undone, overrides reset, pinned engine present | closed |
| T-59-90 | Information disclosure | steam.engine.restoreFailed interpolation | mitigate | `public/locales/en/gamelib.json:630` only `{{title}}`; `S/games.ts:4458` passes `{ title }` only | closed |
| T-59-91 | Tampering | translation.json operator edits | mitigate | No phase 59-24 commit touches `translation.json` (`git log --grep '59-24\|59-34' --name-only` lists none) | closed |
| T-59-92 | Information disclosure | `[G17-probe]` log lines | mitigate | `grep -rn 'G17-probe' src` returns zero matches (probes removed) | closed |
| T-59-93 | Tampering | steamEngineOverride value | accept | See Accepted Risks log (AR-10) | closed |
| T-59-94 | Tampering | `.gamelib-engine.json` failed-restore rewrite | mitigate | `E/engineSwitch.ts:566-568` `writeMarker(bottleDir, {...prev, dxvk:'failed'})` from `readMarker`-validated `prev`; `writeMarker` tmp+rename (`:219-228`) | closed |
| T-59-95 | Tampering | source-pinned backup recopy | mitigate | `E/engineSwitch.ts:322-358` source is `pinnedEnginePaths` or `prev.dxvk` already constrained by `isInside(pinnedEngineRoot())` (`:206`); destination is the bottle's own prefix (`winePrefix: bottleDir`, `:518,529`) | closed |
| T-59-96 | Denial of service | launch blocked after a failed restore | accept | See Accepted Risks log (AR-11) | closed |
| T-59-97 | Denial of service | stopping an unrelated wineserver | mitigate | `E/engineSwitch.ts:556-561` restore stops only `source.wineserverBin` (pin-derived) and `killPrevious` keeps the allowlist (`:301-312`) | closed |
| T-59-98 | Tampering | partial-bottle removal on abort | mitigate | `S/bottle.ts:2249` guard reused by `discardNewBridgeBottle` (`:2277-2283`); `S/games.ts:2438-2441` discards only `provisioned.createdHere` | closed |
| T-59-99 | Denial of service | orphan wineserver after failed/aborted create | mitigate | `S/bottle.ts:2318-2319,2332-2333` (fallback) and `:2475-2548` (CrossOver) kill (15 s) before `removeCreatedBottleDir` on fail and abort branches | closed |
| T-59-100 | Denial of service | sidecar kept alive after quit | mitigate | `E/fallbackEngine.ts:229-230,243-244,260-261` abort checks after hash, extract, before rename; `S/bottle.ts:2347-2362` `signal` passed to `spawnAsync` for wineboot and `wineserver -w` | closed |
| T-59-101 | Information disclosure | overrideWarning payload | mitigate | `common/types/steam.ts:261` `'cx-expired' \| 'cx-broken' \| null`; `FE/.../SteamEngineNotices.tsx:90-103` maps to catalogue strings only | closed |
| T-59-102 | Spoofing | badge truthfulness (D-06) | mitigate | `E/engineState.ts:275,291-292,325-329` inconclusive `broken` not cached and rendered as no badge; `engineState.test.ts` | closed |
| T-59-103 | Tampering | hand-edited verdict steering eligibility | accept | See Accepted Risks log (AR-12) | closed |
| T-59-104 | EoP (route integrity) | markBridgeFailedThisSession on abort | mitigate | `S/games.ts:2701-2703` `if (downloadResult.status === 'abort') return downloadResult` before the mark at `:2705`; `:2520-2526` abort returns before any mark | closed |
| T-59-105 | Denial of service | headless depot download after cancel | mitigate | `S/games.ts:2681-2693` synchronous `signal?.aborted` check before `installDepotDownload`; `:2455-2461` controller kept registered until the depot run replaces it | closed |
| T-59-106 | Tampering | bottle discard after cancelled first install | mitigate | `S/games.ts:2438-2441` only `createdHere`, via `discardNewBridgeBottle` (guarded, `S/bottle.ts:2277`) | closed |
| T-59-107 | Tampering | CrossOver.app / licence (UAT 59-30) | mitigate | `W0/no-crossover.sb`; `59-UAT.md:238` "licence still 304 bytes Oct 22 19:57" | closed |
| T-59-108 | Tampering | trial clock / GamesConfig / metadata / pinned dir | mitigate | `59-UAT.md:238` Re-UAT 2 restore done (InstallTime restored, overrides reset, Bottles list identical) | closed |
| T-59-109 | EoP (route integrity) | reinstall after cancel | mitigate | Code: abort never marks (T-59-104); `59-UAT.md:238` UAT item 24 recorded with no bottled-Steam route line | closed |
| T-59-110 | Denial of service | endPerGameBridgeBottleSession engine hint | mitigate | `S/bottle.ts:2070-2088` hint only selects the binary, requires `isAbsolute` + `existsSync` else ignored; `killBottleWineServerWith` keeps WINEPREFIX last and the sanitize/containment guard | closed |
| T-59-111 | Tampering | hint path from GameSettings | accept | See Accepted Risks log (AR-13) | closed |
| T-59-112 | Information disclosure | launcher.ts log change | accept | See Accepted Risks log (AR-14) | closed |
| T-59-113 | Tampering | Branch A "installed" check | mitigate | Branch A was not shipped (59-32 diagnosis: none of A/B/C fit; fix is Wine Mono registration). Success criteria are unchanged: `S/bridge/sharedRedists.ts:487-496` `isRedistSuccessExit` accepts only exit 0 (plus 3010/1638 for vcredist); no sentinel-based success grant exists | closed |
| T-59-114 | EoP | Branch B alternative args | mitigate | Branch B not shipped; the only new spawn is a constant `msiexec /i Z:<engine path>` built by `S/bridge/sharedRedists.ts:555-559` `buildMonoSupportMsiParts` (absolute path, no quote or control chars, path found inside the engine's own tree `sharedRedistInstall.ts:350-366`); depot args still go through `buildRedistProcessCommandParts` containment (`sharedRedistInstall.ts:754`) | closed |
| T-59-115 | Denial of service | Branch C skip | accept | See Accepted Risks log (AR-15) | closed |
| T-59-116 | Information disclosure | diagnosis reproduction | mitigate | `59-32-SUMMARY.md` records a disposable prefix/HOME reproduction ("Disposable-prefix repro"); no real-bottle write path added in code | closed |
| T-59-117 | Tampering | sweepStaleEngineTemps | mitigate | `E/fallbackEngine.ts:433-440` only `.tmp-` names directly under `pinnedEngineRoot()`, `isContained`, `lstatSync(...).isDirectory()`; pin dirs never match the prefix | closed |
| T-59-118 | Denial of service | boot path | mitigate | `E/fallbackEngine.ts:427-457` synchronous, per-entry and outer try/catch; `sidecar/bootstrap.ts:1297-1304` try/catch; `engineTempSweepBootWire.test.ts` (throwing sweep does not fail `init`) | closed |
| T-59-119 | Tampering | race with an engine install | mitigate | `E/fallbackEngine.ts:429` returns when `activeArtifactInstalls > 0 \|\| inFlight.size > 0`; runs in `init()` (`bootstrap.ts:1300`) before any engine work | closed |
| T-59-120 | EoP (route integrity) | isDrmModeFromVerdict | mitigate | `E/engineState.ts:137-146` CEG (`drm === 'ceg'`) checked first; DRM mode stays CrossOver-only (`S/games.ts:5217-5229`) | closed |
| T-59-121 | Repudiation | notice wording | accept | See Accepted Risks log (AR-16) | closed |
| T-59-122 | Tampering | translation.json operator edits | mitigate | Same evidence as T-59-91: no 59-34 commit touches `translation.json` | closed |
| T-59-123 | Tampering | in-memory GameConfig after failed write | mitigate | `src/backend/game_config.ts:337-356` `setSetting` records `had`, restores the prior value or deletes the key when the flush throws, rethrows | closed |
| T-59-124 | Information disclosure | gameSettingWriteFailed payload | accept | See Accepted Risks log (AR-17) | closed |
| T-59-125 | Denial of service | renderer re-fetch loop | mitigate | `src/backend/sidecar/gameSettingWrite.ts:21-39` one push, only after attempt 2, never on success; `FE/hooks/useSettingsContext.ts:40-52,139` refetch only for matching appName; `gameSettingWrite.test.ts` | closed |
| T-59-126 | Denial of service | depot download after cancel | mitigate | `S/games.ts:2461-2463` ownership-checked `getAbortSignal(...) === signal` delete; `:2681` signal re-checked before the depot run registers | closed |
| T-59-127 | EoP (route integrity) | cancel during the races | mitigate | `S/games.ts:2701-2703` abort returns before `markBridgeFailedThisSession` | closed |
| T-59-128 | Repudiation | stale stage status | mitigate | `S/games.ts:2409-2415` `stop()` sends `done`; `:2333-2342,2587-2593` `done`/`installing` on each return path | closed |
| T-59-129 | Tampering | context string in a label | mitigate | `FE/hooks/engineDownloadLabel.ts:13-44` (see T-59-79); only the parsed 0-100 integer is interpolated | closed |
| T-59-130 | Spoofing | UI-only change | accept | See Accepted Risks log (AR-18) | closed |
| T-59-131 | Tampering | engine marker read | mitigate | `E/engineSwitch.ts:133-144` `readBottleEngineMarkerKind`: sanitized name, read-only, null on absent/unreadable; `offlineRefusal.ts:20-22` only refuses | closed |
| T-59-132 | Denial of service | stale isOnline() | accept | See Accepted Risks log (AR-19) | closed |
| T-59-133 | EoP (decision integrity) | D-09 probe skipped | mitigate | `S/games.ts:4337-4367` refusal arms run only when `offlineLaunchCertainlyBlocked` proves no branch can launch (truth-table `offlineRefusal.test.ts`); every other launch reaches `decideLaunchEngine` -> `preflightCrossover` | closed |
| T-59-134 | Tampering | CrossOver.app / licence (UAT 59-39) | mitigate | `W0/no-crossover.sb`; `59-UAT.md:240` "licence still 304 bytes Oct 22 19:57" | closed |
| T-59-135 | Tampering | ledger / pinned engine dir / network | mitigate | `59-UAT.md:240` Re-UAT 3 restore: pin moved back, ledger backup, network on, Bottles list equal | closed |
| T-59-136 | EoP (route integrity) | reinstall after cancel (item 35) | mitigate | Code per T-59-104/127; `59-UAT.md:240` records no bottled-Steam route line | closed |
| T-59-137 | Denial of service | false offline from checkConnectivityNow | mitigate | `src/backend/connectivityNow.ts:144-145,157-158,166-167` timeout and any error -> `offline:false`; offline only on no routable interface (`:109`) or every probe host failing (`:148-156`); `connectivityNow.test.ts` | closed |
| T-59-138 | Denial of service | sidecar exit (exit contract) | mitigate | `connectivityNow.ts:145` `timer.unref?.()`, `:162-164` cleared in `finally`; invoked only from `S/games.ts:5123` at Play | closed |
| T-59-139 | Tampering | hostname input | accept | See Accepted Risks log (AR-20) | closed |
| T-59-140 | Information disclosure | DNS lookup | accept | See Accepted Risks log (AR-21) | closed |
| T-59-141 | EoP (decision integrity) | offlineLaunchCertainlyBlocked | mitigate | `E/offlineRefusal.ts:35-56` pure predicate returning only `{blocked}`; truth-table `offlineRefusal.test.ts` | closed |
| T-59-142 | Denial of service | isCrossoverMissing false positive | mitigate | `E/engineDecision.ts:189-205` missing only when `binDir === undefined` or `bin/wine` absent; `catch { return false }` | closed |
| T-59-143 | Tampering | marker / DXVK dir | accept | See Accepted Risks log (AR-22) | closed |
| T-59-144 | Tampering | stored launch target used offline | mitigate | `S/bridge/launchTarget.ts:184-193` stored record used offline, then `:268-272` `sanitizeInstalldir` (denylist + containment) on every source; unchanged existsSync/bridge-ready gate before wine | closed |
| T-59-145 | Denial of service | false offline at Play | mitigate | `connectivityNow.ts` fail-open on timeout/error (T-59-137); `launchTarget.ts:184` uses stored target only when one exists, else normal PICS path | closed |
| T-59-146 | EoP (decision integrity) | D-09 probe skipped | mitigate | Same as T-59-133; refusal returns `{ok:false}` (`S/games.ts:4366`), selects nothing and routes nothing | closed |
| T-59-147 | Denial of service | sidecar exit contract | accept | See Accepted Risks log (AR-23) | closed |
| T-59-148 | Tampering | CrossOver.app / licence (UAT 59-43) | mitigate | `W0/no-crossover.sb`; `59-UAT.md:242` "licence unchanged ... nothing touched /Applications/CrossOver.app" | closed |
| T-59-149 | Tampering | pinned dir / DXVK copy / network | mitigate | `59-UAT.md:242` Re-UAT 4 restore: folders moved back (move, not delete), Wi-Fi on, bottle count unchanged | closed |
| T-59-150 | EoP (route integrity) | offline launches (items 36-38) | mitigate | Code per T-59-133/146 (refusal returns before any route); `59-UAT.md:242` no bottled-Steam route line | closed |
| T-59-151 | Denial of service | false offline refusal (CR-01, WR-01) | mitigate | `connectivityNow.ts:7-13,107-111,148` only monitor `'offline'`, no routable interface, or all hosts failing; `'check-online'` falls through (CR-01 test in `connectivityNow.test.ts`) | closed |
| T-59-152 | Denial of service | sidecar exit contract | mitigate | `connectivityNow.ts:120-164` one unref'd, finally-cleared timer; runs only at an action | closed |
| T-59-153 | Tampering | lookup hosts | accept | See Accepted Risks log (AR-24) | closed |
| T-59-154 | EoP (route integrity) | offlineRefusal predicate | mitigate | `E/offlineRefusal.ts:35-56` refuse-only; WR-02 arm (`:49-53`) gated on `override`/`markerKind`/`restoreNeedsAbsentPin` certainty (`engineSwitch.ts:152-176`) | closed |
| T-59-155 | Repudiation | engine-notice display ack | mitigate | `FE/components/UI/DialogHandler/index.tsx:103-106,129-131,149-151` logs frame received, current, and closed per `ackId` | closed |
| T-59-156 | Information disclosure | renderer log lines | mitigate | Same lines log `ackId`/`key`; the title only where it was already logged (`:103`), never the body | closed |
| T-59-157 | Denial of service | dialog queue | accept | See Accepted Risks log (AR-25) | closed |
| T-59-158 | Tampering | bridge bottle during concurrent switches | mitigate | `S/games.ts:304` `bridgeLaunchesInFlight` Map; `:5076-5099` set synchronously in `launchBridgeGame` before any await; second call returns the first promise; plus per-bottle `inFlightSwitches` (`E/engineSwitch.ts:364-391`) | closed |
| T-59-159 | Denial of service | guard never released | mitigate | `S/games.ts:5098-5103` `.finally` deletes only when the entry is still `run`; resolve and reject both covered | closed |
| T-59-160 | EoP (route integrity) | join path | mitigate | `S/games.ts:5077-5093` join path only logs, `notify`s and returns `existing`; no mark/`steamBridgeSetupRequired` | closed |
| T-59-161 | Tampering (decision integrity) | D-09 | mitigate | `59-47-SUMMARY.md` "G27 decision: accept" - operator chose to keep D-09; no code change shipped (`rg probeSkipped src` empty) | closed |
| T-59-162 | Denial of service | unprobed CrossOver launch on expired trial (skip only) | mitigate | Skip branch was not shipped, so every CrossOver launch is probed (`E/engineDecision.ts:481-486`); D-10 deadline still bounds a hang (T-59-43) | closed |
| T-59-163 | Info disclosure / integrity | trial notice (skip only) | mitigate | No `probeSkipped` preflight exists in `src`; nothing invented can be cached (T-59-102) | closed |
| T-59-164 | EoP (route integrity) | engine selection | mitigate | No skip path exists; engine selection never routes to bottled Steam (T-59-41/44) | closed |
| T-59-165 | Tampering | CrossOver.app / licence (UAT 59-48) | mitigate | `W0/no-crossover.sb`; `59-UAT.md:244` "licence unchanged (304 bytes, Oct 22 19:57), CrossOver.app untouched" | closed |
| T-59-166 | Tampering | pinned dir / DXVK copy / network | mitigate | `59-UAT.md:244` Re-UAT 5 restore: folders moved back, network on, bottle count unchanged (30) | closed |
| T-59-167 | EoP (route integrity) | offline and double launches (items 40-43) | mitigate | Code per T-59-133/160; `59-UAT.md:244` "no bottled-Steam route line" | closed |
| T-59-168 | EoP (unintended action) | launch-option picker stale copies | mitigate | `FE/helpers/library.ts:344,364,391,410` single `dialogId`, targeted close; `FE/state/dialogQueue.ts:39-67` same-id replaces in place; `launchOptionPicker.test.ts`, `dialogQueue.test.ts` | closed |
| T-59-169 | Repudiation | engine-notice display ack | mitigate | `FE/state/dialogQueue.ts:28,39-46` targeted close cannot discard a promoted dialog; `DialogHandler/index.tsx:149` close logged | closed |
| T-59-170 | Denial of service | dialog queue | accept | See Accepted Risks log (AR-26) | closed |
| T-59-171 | Tampering (wrong engine) | preflightCrossover | mitigate | `E/engineDecision.ts:49-52,267-316` one retry with stop + settle before demotion; `noKillReason` blocks a kill for page reads and running games; `engineDecision.test.ts` | closed |
| T-59-172 | Denial of service | probe retry | mitigate | `E/engineDecision.ts:49` `PROBE_ATTEMPTS = 2` (each capped 15 s, `demoStatus.ts:17`); `:253-259` settle timer `unref`'d and bounded | closed |
| T-59-173 | Information disclosure | nonzero-exit log line | accept | See Accepted Risks log (AR-27) | closed |
| T-59-174 | Tampering (log injection) | nonzero-exit log line | mitigate | `E/demoStatus.ts:55-57,145` `oneLine()` collapses whitespace/newlines and caps (200/400) before the detail enters the log | closed |
| T-59-175 | Tampering (half-switched bottle) | concurrent prepareBottleForEngine | mitigate | `E/engineSwitch.ts:364-391` per-bottle `inFlightSwitches` chain; `:460` waiting call re-reads the marker in the body; `engineSwitch.test.ts` | closed |
| T-59-176 | Tampering (runner mismatch) | lingering CrossOver wineserver after restore | mitigate | `E/engineSwitch.ts:533-554` one explicit CrossOver wineserver stop after the healthy restore, on both outcomes | closed |
| T-59-177 | Denial of service | waiting switch behind a hung one | accept | See Accepted Risks log (AR-28) | closed |
| T-59-178 | Denial of service | checkConnectivityNow with no hosts | mitigate | `connectivityNow.ts:112-118` empty host list -> `offline:false`, no hook fired; `connectivityNow.test.ts` | closed |
| T-59-179 | Repudiation | refusal log | mitigate | `S/games.ts:4352-4362` per-arm `why` text names what is missing and is logged with the arm | closed |
| T-59-180 | Tampering | CrossOver.app / licence (UAT 59-53) | mitigate | `59-UAT.md:246` "licence unchanged (304 bytes, Oct 22 19:57, before and after); CrossOver.app untouched" | closed |
| T-59-181 | Tampering | GamesConfig saved launch option (item 46) | mitigate | `59-UAT.md:246` item 46 skipped, no saved launch option touched | closed |
| T-59-182 | EoP (route integrity) | re-Plays and restores (items 44-45) | mitigate | `59-UAT.md:246` every re-Play stayed on CrossOver; code per T-59-133/160 | closed |

*Status: open / closed. Disposition: mitigate / accept / transfer.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-59-04 | The wave-0 harness observes the CrossOver nag but never edits NagTime, the registry or the licence; interfering with CodeWeavers' trial prompts is out of bounds (RESEARCH D-12). The product code carries the same rule and a test (`games.test.ts:15753`). | phase plan (59-01) | 2026-11-04 |
| AR-02 | T-59-05 | Wave-0 logs hold engine output and bottle paths only, under `.planning`; no credentials are read. | phase plan (59-01) | 2026-11-04 |
| AR-03 | T-59-10 | The probe log line carries bottle name, outcome and at most 700 chars of detail; no licence data is read by GameLib. | phase plan (59-02) | 2026-11-04 |
| AR-04 | T-59-SC | No npm/pip/cargo packages added in this phase (RESEARCH Package Legitimacy Audit: none). | phase plan (59-03) | 2026-11-04 |
| AR-05 | T-59-37 | `steamEngineStateChanged` payload holds engine kind, reason, trial days and a CrossOver build string; no paths or licence data. | phase plan (59-08) | 2026-11-04 |
| AR-06 | T-59-57 | UAT logs stay local under `.planning` and the app's log dir; no credentials are captured by the UAT commands. | phase plan (59-13) | 2026-11-04 |
| AR-07 | T-59-65 | `launchNotice` carries only a closed reason enum and a counter; no paths or user data. | phase plan (59-15) | 2026-11-04 |
| AR-08 | T-59-69 | i18next escapes interpolations by default; values are the game title and engine label the app already displays. | phase plan (59-17) | 2026-11-04 |
| AR-09 | T-59-71 | Operator decision G9: CrossOver is the supported engine; the launch log still records `reason=override` with engine and build. | operator (UAT G9) | 2026-11-02 |
| AR-10 | T-59-93 | The backend never trusts the stored string: `parseEngineOverride` validates at read (T-59-52); the fix does not widen what is sent. | phase plan (59-25) | 2026-11-04 |
| AR-11 | T-59-96 | Blocking a launch after a failed restore is the safe direction (D-03); the dialog says why, the switch is retried each launch, the user can choose an override. | phase plan (59-26) | 2026-11-04 |
| AR-12 | T-59-103 | The bridge verdict is zod-validated by `readBridgeVerdict`; a hand edit can only show or hide the override control, and the launch path re-resolves the mode itself. | phase plan (59-28) | 2026-11-04 |
| AR-13 | T-59-111 | The kill hint is built in-process by `buildFallbackGameSettings` from GameLib's own engine root, not user input; `isAbsolute` + `existsSync` bound it. | phase plan (59-31) | 2026-11-04 |
| AR-14 | T-59-112 | `launcher.ts` change only removes a log line; no env value changes. | phase plan (59-31) | 2026-11-04 |
| AR-15 | T-59-115 | Branch C was not shipped (59-32 fixed DirectX by registering Wine Mono); residual risk is that DirectX setup may still fail best-effort on the built-in engine, which the phase goal accepts. CrossOver runs it on the next CrossOver launch. | phase plan (59-32) | 2026-11-04 |
| AR-16 | T-59-121 | Copy-only change; no behaviour change. | phase plan (59-34) | 2026-11-04 |
| AR-17 | T-59-124 | `gameSettingWriteFailed` carries only appName and key; no value, error text or path. | phase plan (59-35) | 2026-11-04 |
| AR-18 | T-59-130 | UI-only change; no backend or route change. | phase plan (59-37) | 2026-11-04 |
| AR-19 | T-59-132 | A false offline reading costs one refused launch with a "check your connection" dialog; the next launch re-checks; the same `isOnline()` already gates the download. | phase plan (59-38) | 2026-11-04 |
| AR-20 | T-59-139 | The lookup hosts are constants; no user or remote input reaches them. | phase plan (59-40) | 2026-11-04 |
| AR-21 | T-59-140 | A lookup of github.com / gog.com reveals nothing beyond the engine download and store traffic GameLib already performs. | phase plan (59-40) | 2026-11-04 |
| AR-22 | T-59-143 | Marker and DXVK dir are read through the sanitized, never-throwing 59-38 accessors; a tampered marker can at most cause one refused launch. | phase plan (59-41) | 2026-11-04 |
| AR-23 | T-59-147 | No new timers or sockets in 59-42; `checkConnectivityNow`'s cap timer is unref'd and fewer CM connects are opened. | phase plan (59-42) | 2026-11-04 |
| AR-24 | T-59-153 | Probe hosts (`github.com`, `gog.com`) are constants in `connectivityNow.ts`; no user or remote input reaches them. | phase plan (59-44) | 2026-11-04 |
| AR-25 | T-59-157 | Dialog queue length is bounded by user actions and backend notices; the ack logging adds no growth path. | phase plan (59-45) | 2026-11-04 |
| AR-26 | T-59-170 | Same-id dialog requests now replace instead of append, which shrinks the queue. | phase plan (59-49) | 2026-11-04 |
| AR-27 | T-59-173 | The nonzero-exit text is whitespace-collapsed and capped at 400 chars; it holds CrossOver's own error text and bottle paths, the same class of data the log already carries. | phase plan (59-50) | 2026-11-04 |
| AR-28 | T-59-177 | Each wine step is bounded by its own process exit and the D-10 launch deadline; the same hang already blocked the single caller. | phase plan (59-51) | 2026-11-04 |

---

## Unregistered Flags

SUMMARY `## Threat Flags` sections exist only in 59-06-SUMMARY.md ("None beyond the plan's threat model") and 59-10-SUMMARY.md ("None. The deadline kill uses the per-game guarded `killBridgeBottleWineServer`"). Both map to the existing register; no unregistered attack surface.

Informational (not blockers, no flag raised by the executors): the `msiexec /i` Mono-support spawn added by 59-32 is a new spawn site not covered by a plan-time threat; it is constrained by `buildMonoSupportMsiParts` (absolute engine-tree path, no quote/control chars) and runs bounded (`REG_TIMEOUT_MS`), so it is recorded under T-59-114 rather than as an open item.

---

## Security Audit 2026-11-04

| Metric | Count |
|--------|-------|
| Threats found | 173 |
| Closed | 173 (145 mitigate verified in code/harness/UAT record, 28 accept recorded above) |
| Open | 0 |

Method: each `mitigate` threat was checked against the code on `main` by file and line (the engine modules under `E/`, `S/bottle.ts`, `S/games.ts`, `S/bridge/*`, `sidecar/*`, `connectivityNow.ts`, `game_config.ts`, and the frontend notice/override/dialog code). Threats whose mitigation lives in the wave-0 harness (T-59-01..03) were checked in `W0/run-wave0.sh`. Operator-session threats (T-59-54..56, 80/81, 107..109, 134..136, 148..150, 165..167, 180..182) were checked against the restore/licence-mtime records in `59-UAT.md` and 59-01-SUMMARY, with the code-side route-integrity invariant verified separately. Regression run: 17 jest suites, 367 tests, all passing.

Notes (no action required to close):
- T-59-113/114/115 describe DirectX Branch A/B/C outcomes; 59-32 shipped none of them (Wine Mono registration instead), so the threatened weakening of redist success criteria does not exist. The new `msiexec` spawn is covered under T-59-114.
- T-59-161..164 are conditional on the D-09 probe skip; the operator chose "accept" (59-47), the skip was never shipped, so each is satisfied vacuously and verified by the absence of any skip code.
- T-59-19: the cancel log line carries appId and reason but not elapsed ms (the fire line does); judged sufficient for the repudiation goal.
- T-59-12: containment relies on the post-extract symlink walk as planned; `tar` entry-path traversal is not separately re-checked in this phase (pre-existing `extractFiles`, outside the declared mitigation).
- Operator-session evidence (UAT restore records) is documentary by nature; the code-side invariants those threats protect (no bottled-Steam reroute, no licence/NagTime edits) are independently verified in code (T-59-44, T-59-46, T-59-104).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
