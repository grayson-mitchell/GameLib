---
phase: 61
slug: unified-macos-engine-for-all-stores
status: verified
threats_total: 85
threats_closed: 85
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-11-08
---

# Phase 61 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Source register: 86 rows across plans 61-01..61-27; T-61-27 appears in both 61-09 and 61-10 with the same mitigation and is counted once, giving 85 unique threats (76 mitigate, 9 accept). Evidence was checked against the CURRENT code (engine code now lives under `src/backend/engine/`).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Renderer -> sidecar IPC (engine/settings/install/tools channels) | Untrusted renderer supplies runner, appName, engineOverride, commandParts, dismissal args | Identity strings, engine ids, bottle-name hints |
| Sidecar -> child processes (cxbottle, wine, wineserver, ps, pgrep) | argv-form spawns against bottle paths under the CrossOver Bottles root | Bottle names, install paths, process listings |
| Config on disk -> engine decision | `GamesConfig/<appName>.json` is hand-editable | engineOverride, wineVersion, wineCrossoverBottle, bottle marker JSON |
| Sidecar -> renderer push (`engineStateChanged`) | EngineState payload | Labels, ids, bottle names; never filesystem paths |
| Spike scripts -> real profile | Spike 068/060 harness reads real CrossOver bottles/licence | `ps` lines, bottle clones |

---

## Threat Register

Status: all CLOSED. Evidence is file:line in the current tree (paths relative to repo root).

| Threat ID | Category | Disp. | Evidence | Status |
|-----------|----------|-------|----------|--------|
| T-61-01 | Info disclosure | mitigate | `.planning/spikes/068-nonsteam-first-match-signal/run.sh:27` greps `ps` for fixed MATCH strings only into a sample file; `:16` `redact()` swaps `$HOME` for `~` | closed |
| T-61-02 | Tampering | mitigate | `run.sh:21` `cp -cR` clones into fake HOME `state/` (`.gitignore:1 state/`); `ls ~/Library/Application Support/CrossOver/Bottles` has no `Spike068*` | closed |
| T-61-03 | DoS | mitigate | `run.sh:18-19` EXIT trap runs `wineserver -k`; `:40` `alarm 45`, `:53` `alarm 120` | closed |
| T-61-04 | Tampering | mitigate | steam `games.test.ts:423,736,752,757` mock the new `backend/engine/*` specifiers; no stale old-path mocks remain | closed |
| T-61-05 | EoP | accept | See Accepted Risks Log | closed |
| T-61-06 | Tampering | mitigate | `engine/bottlePrimitives.ts:47-60` `sanitizeBottleName`; `:93-96` `killBottleWineServerWith` containment `relative(bottlesRoot,...) !== bottleName`; `bottlePrimitives.test.ts` exists | closed |
| T-61-07 | DoS | mitigate | engine test suite mocks kills via `killWith` deps (`engineSwitch.ts:52,114`); `engine/__tests__/` covers all moved modules | closed |
| T-61-08 | Info disclosure | accept | See Accepted Risks Log | closed |
| T-61-09 | Tampering | accept | See Accepted Risks Log | closed |
| T-61-10 | Tampering | mitigate | `engine/gameKey.ts:15-25,36-43` `isCleanAppName` (len 1-255, no `/ \\ NUL ..`), `isKnownRunner` allowlist from `storeCapabilities` | closed |
| T-61-11 | DoS | mitigate | `engine/bottleLedger.ts:15-45` validated mark/stop/others; `launchEngine.ts:428` mark, `:567-571` clear in `endEngineLaunch`; `bottleLedger.test.ts` | closed |
| T-61-12 | DoS (exit) | mitigate | `bottleLedger.ts` has no timers/IO; `launchDeadline.ts:105` and `gameProcessWatch.ts:132,191` `unref?.()` | closed |
| T-61-13 | EoP | mitigate | `engine/engineConfig.ts:231-233` `isWritableEngineOverride`; `sidecar/settingsFlowRegistration.ts:179` (setSetting incl. `appName==='default'`) and `:226-229` (writeConfig) | closed |
| T-61-14 | Tampering | mitigate | `engineConfig.ts:77-92` appName rejects `/ \\ NUL ..`, >255, plus `relative(root,target)` containment | closed |
| T-61-15 | Tampering | mitigate | `engineConfig.ts:162,170` every stored read through `parseEngineOverride`; `engineIds.ts:16-32` closed grammar, anything else -> `automatic` | closed |
| T-61-16 | Repudiation/data loss | mitigate | `engineConfig.ts:185-210` `readEngineForGame` is read-only (no write calls); `legacyBottleUntouched.test.ts` | closed |
| T-61-17 | Tampering | mitigate | `engine/perGameBottle.ts:55-86` byte-wise `_xx` escaping, `..` run escaping, sha256-hash truncation, final `sanitizeBottleName(name) === name` | closed |
| T-61-18 | Tampering | mitigate | `perGameBottle.ts:134-138` `spawnAsync(join(binDir,'cxbottle'), ['--create','--bottle',bottleName,...])` argv form after `:102` sanitize | closed |
| T-61-19 | DoS | mitigate | `engineDecision.ts:40` `CX_CREATE_CAP_MS=120_000`; `perGameBottle.ts:134-150` timeout -> `cleanup()` removes created dir; `:307-311` non-abort create failure falls back to pinned | closed |
| T-61-20 | Tampering/data loss | mitigate | `engine/gamePrefix.ts:60-66` case (4) returns fresh bottle with `previousPrefix`, never reuses old prefix as a bottle; `legacyBottleUntouched.test.ts` | closed |
| T-61-21 | Info disclosure | mitigate | `perGameBottle.test.ts:4-6` uses `createFakeHomeProfile`; fakeHomeIsolation gate | closed |
| T-61-22 | DoS/data loss | mitigate | `engine/engineSwitch.ts:445-453,511,519-521` `busyRefusal()` precedes `killPrevious` (`:555`) and every `killWith` | closed |
| T-61-23 | EoP | mitigate | `engineDecision.ts:435` `parseEngineOverride(d.readOverride(...))`; `launchEngine.ts:282` overlay `readOverride: () => effective.id` where effective came from `readEngineForGame` | closed |
| T-61-24 | Tampering | mitigate | `storeManagers/steam/engine/steamEngineDeps.ts:31-36` Steam reader keeps legacy key fallback, same decision path; steam `games.test.ts` mocks intact | closed |
| T-61-25 | Tampering | mitigate | `engineState.ts:244-246` `engineKeyFor` before any read; `sidecar/engineFlowRegistration.ts:34-40` | closed |
| T-61-26 | Tampering | mitigate | `engineState.ts:40,500-510` `BUILD_RE` + closed `kind` union in `dismissEngineNotice` | closed |
| T-61-27 | Info disclosure | mitigate | `common/types/engine.ts:1-5,24-85` EngineState fields are ids/labels/names only; `perGameBottleName` is a name | closed |
| T-61-28 | Repudiation | mitigate | `engine/engineNoticeStore.ts:11-12` CacheStore name `steam_engine_notices` unchanged | closed |
| T-61-29 | Tampering | mitigate | `gameKey.ts` + `engineConfig.ts:77-92` (see T-61-10, T-61-14); `engineFlowRegistration.ts:36-40` | closed |
| T-61-30 | Info disclosure | mitigate | `common/types/engine.ts` (EngineOption: id/kind/label flags); `gameEngineState.ts:14` documents and returns ids/labels/bottle names only | closed |
| T-61-31 | EoP | mitigate | `frontend/.../EngineOverride.tsx:142,273` Legacy item disabled and never sent; backend `settingsFlowRegistration.ts:179,226` rejects `legacy:*` via grammar | closed |
| T-61-32 | DoS | mitigate | `engineState.ts:64,276` bottle-keyed `inflight` dedupe; `:240-243` returns null with no bottle (`stateWithoutBottle` gate) | closed |
| T-61-33 | EoP | mitigate | `engineSwitch.ts`/`enginePins.ts:18,40,48` pins carry sha256 (`fallbackEngine.ts:2` streaming sha256); `engineDecision.ts:382-410` `resolveWineManagerStaging` containment under `wineManagerRoot`; `engineRegistry.ts:19-26` `setEngineSelection` re-checks `existsSync` | closed |
| T-61-34 | DoS/data loss | mitigate | `engineSwitch.ts:519-521` busy refusal before kill; `launchEngine.ts:415-430` refusal path | closed |
| T-61-35 | Tampering | mitigate | `engine/launchSettings.ts` overlay is in-memory (no setSetting/writeConfig); `launchSettings.test.ts` | closed |
| T-61-36 | DoS | accept | See Accepted Risks Log | closed |
| T-61-37 | Tampering | mitigate | `engineFlowRegistration.ts:34-40` args[0] uncast to `engineKeyFor`, null before any `getGame` | closed |
| T-61-38 | Info disclosure | mitigate | `gameEngineState.ts` / `common/types/engine.ts` ids, labels, names only | closed |
| T-61-39 | Spoofing | mitigate | `engineFlowRegistration.ts:67-92` `ipcMain.handle` for invokes, `sendFrontendMessage('engineStateChanged')` for push | closed |
| T-61-40 | DoS (exit) | mitigate | `engineFlowRegistration.ts:64-92` registers closures only; no timers/IO | closed |
| T-61-41 | Tampering | mitigate | `backend/launcher.ts:244-247` `checkWineBeforeLaunch` guarded by `!engineControlled` | closed |
| T-61-42 | Data loss | mitigate | `engine/__tests__/legacyBottleUntouched.test.ts` snapshot test | closed |
| T-61-43 | Tampering | mitigate | `engine/__tests__/launcherOverlayCensus.test.ts:21,92-125` source census | closed |
| T-61-44 | DoS | mitigate | `launcher.ts:235-237,310,329` `releaseEngine` on exception and in `.finally`; `gog/setup.ts:135`, `nile/setup.ts:112` `finally { endEngineLaunch }`; `launchEngine.ts:563-573` | closed |
| T-61-45 | Tampering | mitigate | `engine/__tests__/managerOverlayCensus.test.ts:40-44` five-file census | closed |
| T-61-46 | Tampering | mitigate | `storeManagers/gog/setup.ts:112-140` engine-controlled setup skips `checkWineBeforeLaunch` | closed |
| T-61-47 | DoS | mitigate | `gog/setup.ts:134-136`, `nile/setup.ts:111-113` `finally` release | closed |
| T-61-48 | DoS | mitigate | Superseded by 61-21: `launchEngine.ts:477-515` deadline kills nothing; `launchEngine.ts:557` `bindDeadlineToMonitor` stands down on null watcher; `gameProcessWatch.ts:50-72,86-100` trailing-separator matching | closed |
| T-61-49 | DoS | mitigate | Superseded by 61-21: deadline path has no kill (`launchEngine.ts:486` "not stopping anything"); `:532` only bottle-prefix launches armed; `bottlePrimitives.ts:93-96` containment remains for the other kill sites | closed |
| T-61-50 | Info disclosure | mitigate | `gameProcessWatch.ts:155-161` logs pid only | closed |
| T-61-51 | DoS (exit) | mitigate | `gameProcessWatch.ts:132,171,191` unref'd timers, `maxDurationMs` cap, `MAX_CONSECUTIVE_LISTING_FAILURES=20`; `launchDeadline.ts:105` | closed |
| T-61-52 | Tampering | mitigate | `frontend/state/EngineState.ts:52-63` shape guard on runner/appName before `set()` | closed |
| T-61-53 | Spoofing | mitigate | `frontend/screens/Game/GamePage/components/EngineNotices.tsx:10,23` and `WelcomeModal/index.tsx:8,109` hard-coded `CROSSOVER_URL` const | closed |
| T-61-54 | Info disclosure | accept | See Accepted Risks Log | closed |
| T-61-55 | EoP | mitigate | `EngineOverride.tsx:31,142,273` + backend guard `settingsFlowRegistration.ts:179,226` | closed |
| T-61-56 | Tampering | mitigate | `EngineOverride.tsx:277-297` bottle value is `state.perGameBottleName` from backend; launch re-derives (`gamePrefix.ts`, `perGameBottle.ts:85`) | closed |
| T-61-57 | Repudiation/data loss | mitigate | `EngineOverride.tsx:272-306` confirm dialog before `setOverride/setBottle`; `legacyBottleUntouched.test.ts` | closed |
| T-61-58 | EoP | mitigate | `installFlowRegistration.ts:634-636` `isWritableEngineOverride`; `engine/importEngineSettings.ts:16`; writeConfig guard | closed |
| T-61-59 | Tampering | mitigate | `importEngineSettings.ts:17-21` bottle computed by `getPerGameBottleNameFor`; renderer name never trusted on the engine path | closed |
| T-61-60 | Info disclosure | accept | See Accepted Risks Log | closed |
| T-61-61 | Tampering | mitigate | Spike 060 UAT record `61-20-SUMMARY.md:59` licence mtime unchanged (Oct 22 19:57); read denial only | closed |
| T-61-62 | Data loss | mitigate | `61-20-SUMMARY.md:59,63` throwaway bottle only, InstallTime restored | closed |
| T-61-63 | Tampering | mitigate | `tools/index.ts:888,1293,1566` route Winetricks / Run EXE / tool reads through `resolveToolSettings` (`engine/toolSettings.ts:102`) to the game's real bottle and engine; the settings read passes `ensureBottle: false` (`tools/index.ts:1294`, honoured at `toolSettings.ts:183`), so a read never creates a bottle; `launcherOverlayCensus.test.ts:92-116` asserts every `game.getSettings()` read in tools/index.ts goes through the resolver. Added by orchestrator after the audit omitted this row | closed |
| T-61-21-01 | DoS | mitigate | `launchEngine.ts:477-515` no `killWith`, no `game.stop`; `DeadlineDeps` (`:451-455`) has only watch/showNotice/publishNotice; `launchEngine.deadline.test.ts` | closed |
| T-61-21-02 | Info disclosure | mitigate | `gameProcessWatch.ts:155-161` pid-only log; C: form adds no logging | closed |
| T-61-21-03 | DoS | mitigate | `launchEngine.ts:550-554` `onGiveUp` -> `cancelLaunchDeadline(key,'monitor-unavailable')` | closed |
| T-61-22-01 | Tampering | mitigate | `engine/demoStatus.ts:93-98` `sanitizeBottleName` + `BOTTLE_NAME_MAX=255`; `:115` name passed via `env.CX_BOTTLE`, argv fixed `['--demo-status']` | closed |
| T-61-22-02 | DoS | mitigate | `engineDecision.ts:509-600` inconclusive branch keeps marker engine / launches CrossOver, `cx-broken` kill-and-rewrite path (`:640,666`) only for conclusive breakage | closed |
| T-61-22-03 | Spoofing | accept | See Accepted Risks Log | closed |
| T-61-23-01 | Tampering | mitigate | No `engineOverride` default anywhere in game_config/config (`grep` hits only engine, steam, frontend, types files) | closed |
| T-61-23-02 | DoS | mitigate | `engineConfig.ts:182-210` existing games never inherit global `engineOverride` (only global `wineVersion` derivation); doc at `:185-189` | closed |
| T-61-23-03 | Repudiation | mitigate | `61-UAT.md:37` records `needsFreshBottleConfirm` true for legacy (61-23), unit-asserted in `engineOverrideLogic.test.ts`; `EngineOverride.tsx:274-298` dialog | closed |
| T-61-24-01 | EoP | mitigate | `tools/index.ts:1596-1608` `isStore(args.runner,'sideload')` else log and empty result | closed |
| T-61-24-02 | Tampering | mitigate | `tools/index.ts:1610-1615` `resolveToolSettingsForId(..., {ensureBottle:true})` from stored config | closed |
| T-61-24-03 | Tampering | mitigate | `sidecar/wineToolsFlowRegistration.ts:389,396-401` `assertCommandParts` first; `wait === true`, `pendingInstall === true` | closed |
| T-61-24-04 | Info disclosure | mitigate | `tools/index.ts:1604,1618-1620` logs runner/appName/reason only | closed |
| T-61-25-01 | Repudiation | mitigate | `61-UAT.md:15,37,56-57,84-87` records G-1 resolution and no-kill deadline branch | closed |
| T-61-26-01 | Tampering | mitigate | `engineSwitch.ts:149-180` `readBottleEngineMarkerSummary`: sanitize guard, try/catch -> null, wineserver confined to pinned root + basename; `engineDecision.ts:513-520` pin id compared with `ENGINE_PINS` only | closed |
| T-61-26-02 | DoS | mitigate | `engineDecision.ts:517-583` non-crossover-marker bottle keeps its engine on inconclusive; no switch, so no kill/DXVK rewrite | closed |
| T-61-26-03 | Repudiation | mitigate | `engineDecision.ts:531,547,568,591` `reason: 'cx-inconclusive'` + detail line; logged at `launchEngine.ts:179` / decision log | closed |
| T-61-26-04 | Spoofing | accept | See Accepted Risks Log | closed |
| T-61-27-01 | Tampering | mitigate | `frontend/components/UI/SteamEngineLaunchNotice/index.tsx:341-347` type checks on title/seconds/seq; no `dangerouslySetInnerHTML` in file; `engineState.ts:476-478` `title.slice(0,200)` | closed |
| T-61-27-02 | Info disclosure | mitigate | `engineState.ts:473-481` push adds title and numbers only (`common/types/engine.ts:79`) | closed |
| T-61-27-03 | DoS | mitigate | `launchEngine.ts:451-455` `DeadlineDeps` has no `showDialog`; `:477-515` no raise/modal, log says `raise=false`; `launchEngine.deadline.test.ts` | closed |
| T-61-27-04 | Repudiation | accept | See Accepted Risks Log | closed |

*Status: open - closed. Disposition: mitigate (implementation required) - accept (documented risk) - transfer (third-party).*

---

## Accepted Risks Log

Recorded with the operator's approval of the plan-time dispositions.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-61-01 | T-61-05 | 61-02 is a pure move: no behaviour, validation or IPC change; `parseEngineOverride`'s closed grammar moves byte-identical | operator (plan 61-02) | 2026-11-08 |
| AR-61-02 | T-61-08 | `processListing` moved byte-identical; output is matched in memory only and never logged whole (existing behaviour) | operator (plan 61-04) | 2026-11-08 |
| AR-61-03 | T-61-09 | `runTool` is a pure move of an argv-form spawn helper; no new caller in that plan | operator (plan 61-04) | 2026-11-08 |
| AR-61-04 | T-61-36 | Engine dialogs are limited by a once-per-session ack Set, preventing dialog floods; same as Steam | operator (plan 61-12) | 2026-11-08 |
| AR-61-05 | T-61-54 | The engine badge tooltip shows engine labels only; no paths cross in the payload (61-09/10/11) | operator (plan 61-17) | 2026-11-08 |
| AR-61-06 | T-61-60 | The new install/import fields send no paths to or from the renderer | operator (plan 61-19) | 2026-11-08 |
| AR-61-07 | T-61-22-03 | An inconclusive pre-flight launching on a located CrossOver can hit an expired-trial dialog; the log records `inconclusive` and the user sees CrossOver's own dialog. Lower harm than killing and rewriting a healthy bottle | operator (plan 61-22) | 2026-11-08 |
| AR-61-08 | T-61-26-04 | Same residual as AR-61-07 for a crossover/absent marker, now labelled honestly as `cx-inconclusive` | operator (plan 61-26) | 2026-11-08 |
| AR-61-09 | T-61-27-04 | The in-app toast has no display-ack; the sidecar log records `surface=in-app pushed=<bool> raise=false`, enough to tell whether it was dispatched (`launchEngine.ts:510-513`) | operator (plan 61-27) | 2026-11-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

SUMMARY `## Threat Flags` for 61-17, 61-18, 61-19 and 61-24 all state "None" and map to existing IDs (T-61-52..54, T-61-55..57, T-61-58..60, T-61-24-xx). No unregistered flags.

Review notes (informational, not threats in the register): `installFlowRegistration.ts:640-646` still persists the renderer-supplied `wineCrossoverBottle` on the legacy (non-engine) wine-prefix branch. That is the pre-phase path outside T-61-59's scope (engine path computes the name server-side) and the name is sanitized at launch.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-08 | 85 | 85 | 0 | gsd-security-auditor (Claude) |
| 2026-11-08 | 85 | 85 | 0 | orchestrator spot-check: T-61-63 row was missing from the auditor's register (84 rows vs 85 claimed); verified and added. Test suites not run in this audit |

---

## Sign-Off

- [x] All threats have a disposition (76 mitigate, 9 accept, 0 transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-08
