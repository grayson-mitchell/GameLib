---
phase: 70
slug: split-gameinfo-into-shared-and-per-store-shapes
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-15
---

# Phase 70 - Security

Verified against current code (post phases 71-80). Paths are repo-relative. Where a Phase 70 mitigation moved or was superseded by a later phase, the row says so under "Drift". Targeted jest run on 2026-11-15: 14 suites, 631 tests pass (storeMigrations, gameInfoNarrowing, ipcSchemas install/settings/gameDetails/gameInfoParity/settingsParity/wineTools, meta narrowing ceiling + wiring, rendererZodGuard).

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| renderer -> sidecar IPC | install / updateGame / addNewApp carry a renderer-built GameInfo; writeConfig / setSetting / launch carry settings | GameInfo objects, AppSettings / GameSettings, launch options |
| disk -> sidecar | persisted library caches, download queue and settings written by older builds are loaded and rewritten | user library data, user settings |
| third-party metadata -> GameInfo | Steam store/PICS metadata and Epic metadata are merged into GameInfo | untrusted JSON |
| developer -> CI / pre-push gates | gate configuration is the only enforcement of the narrowing ceiling | gate scripts |
| test harness -> child process | tests spawn node / the real hook | env, PATH |

## Threat Register

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-70-01 | Tampering | mitigate | CLOSED | common/gameInfoNarrowing.ts:11-16 `isStoreGame` delegates to `isStore`; :22-27 `asStoreGame`; no throwing variant. common/__tests__/gameInfoNarrowing.test.ts:78 null/undefined/`{}` false case; Equal-based type guards :35-47. Test run: pass |
| T-70-02 | Info disclosure | mitigate | CLOSED | gameInfoNarrowing.ts imports only `isStore` and `import type`; frontend/helpers/stores.ts:18-21 type-only. meta/__tests__/rendererZodGuard.test.ts run: pass |
| T-70-SC | Tampering | accept | CLOSED | See Accepted Risks |
| T-70-03 | Info disclosure | mitigate | CLOSED | meta/__tests__/gameInfoNarrowingCeiling.test.ts:10,205-213 `createFakeHomeProfile` with `dispose()` in finally. fakeHomeIsolation.test.ts not separately run |
| T-70-04 | Repudiation | mitigate | CLOSED | meta/gameInfoNarrowingCeiling.cjs:235-243 `stale` and `unreviewed` failure kinds; header :26 "NO update flag"; grep finds no fs write call in the script |
| T-70-05 | Tampering | mitigate | CLOSED (superseded) | The probe was deleted by 8dd198b40 (70-11 "drop the flip probe"); meta/gameInfoFlipProbe.cjs does not exist and no package.json script or reference remains (grep). No write surface survives. Original in-memory design recorded in 70-03-SUMMARY key-decisions |
| T-70-06 | Repudiation | mitigate | CLOSED (superseded) | Same: `applyFlip` removed with the probe, so no false-green path remains. Drift: the probe-based "reader plans green" control was replaced by the real union flip plus `tsc` and the narrowing ceiling |
| T-70-07 | Tampering | mitigate | CLOSED | Steam SM typed natively by `SteamGameInfo` (steam/stores.ts, games.ts:158 `findGameInfo(): SteamGameInfo \| undefined`); external reads narrow via `asStoreGame(…, 'steam')` in frontend/backend readers (e.g. filterEngine.ts:375, librarySort.ts:209). Cast grep (`as (Steam\|Gog\|Legendary\|Nile\|Sideload)GameInfo`, non-test): 2 hits, neither a read cast: steam/library/rustRefresh.ts:153 (result of `stripToSchema`, then `invalidPaths` check) and sidecar/gameDetailsFlowRegistration.ts:297 (IPC arg already passed by the strict `addNewApp` tuple; see T-70-09). The `{} as GameInfo` sentinel in steam/games.ts:152 is the documented Pitfall-4 sentinel |
| T-70-08 | DoS | accept | CLOSED | See Accepted Risks |
| T-70-09 | Tampering | mitigate | CLOSED (drift) | Drift: the `isStoreGame(…, 'sideload')` check in `addNewApp` was superseded. storeManagers/sideload/library.ts:24-55 now takes `SideloadGameInfo`, builds the stored object field by field with `runner: 'sideload'` hard-coded, so another store's keys cannot be persisted. Boundary is the strict schema: common/types/ipc/gameDetails.ts:32 `addNewApp: z.tuple([sideloadGameInfoSchema])` (strict, gameInfoSchema.ts:223-229). `asStoreGame(…, 'sideload')` remains in storeManagerCommon/games.ts:69 |
| T-70-10 | DoS | accept | CLOSED | See Accepted Risks |
| T-70-11 | Tampering | mitigate | CLOSED (drift) | Legendary SM typed by `LegendaryGameInfo` (setup.ts:49,80 and games.ts:583-584 read `isEAManaged` from the typed manager value, not a raw IPC object); the IPC entry is strict per runner: ipc/install.ts:22 `gameInfo: gameInfoSchema`, discriminatedUnion gameInfoSchema.ts (legendary arm :201-210). Narrowing guards used at launcher.ts:789, downloadqueue.ts:326. Drift: the plan's `asStoreGame` at the setup site was replaced by native typing plus the strict IPC schema |
| T-70-12 | Info disclosure | mitigate | CLOSED | frontend/helpers/stores.ts:18-21 only `import type` from common/types/*; rendererZodGuard.test.ts pass |
| T-70-13 | Tampering | mitigate | CLOSED | hooks/hasAnticheatInfo.ts:10 `asStoreGame(gameInfo, 'legendary')?.namespace`; launcher.ts:789 same |
| T-70-14 | EoP | mitigate | CLOSED | Cast grep over non-test src (see T-70-07): no member-type cast in readers. ESLint runner-literal ban: eslint.config.mjs:176 `'no-restricted-syntax': ['error', ...runnerLiteral.SELECTORS]`. `pnpm lint` not re-run |
| T-70-15 | Tampering | mitigate | CLOSED (drift) | `is_windows_native === true` gate preserved at frontend/screens/Library/components/InstallModal/steamPlatformRow.ts:67 (moved from the original menu site by later Steam work). Live check: 70-UAT.md Windows-depot menu item, result: pass |
| T-70-16 | EoP | mitigate | CLOSED | Same cast grep and eslint ban as T-70-14 |
| T-70-17 | Tampering | mitigate | CLOSED | filterEngine.ts:375 and librarySort.ts:209 use `asStoreGame(…, 'steam')`; delisted facet and Metacritic sort UAT items pass (70-UAT.md, 70-16-SUMMARY "Live gate result"). Existing filterEngine/librarySort jest suites not re-run |
| T-70-18 | EoP | mitigate | CLOSED | Same cast grep and eslint ban as T-70-14 |
| T-70-19 | Repudiation | mitigate | CLOSED | .github/workflows/lint.yml:52-54 step "GameInfo narrowing ceiling"; package.json:53 script; .husky/pre-push:4; meta/__tests__/gameInfoNarrowingWiring.test.ts:44 (`!cancelled()` guard), :82/:93/:186 near-miss cases. Test run: pass |
| T-70-20 | Tampering | mitigate | CLOSED | meta/gameInfoNarrowingCeiling.cjs: exact-match counts, `stale`/`unreviewed` (:235-243), scanned-file floor (:35 `DEFAULT_MIN_FILES`), no update flag. See Observation O-1 (ratchet currently red on a dirty working-tree file, which is the ratchet working as designed) |
| T-70-21 | Tampering | mitigate | CLOSED | common/__tests__/gameInfoNarrowing.test.ts:43 `_NoDrift = Expect<Equal<GameInfoByRunner[Runner], GameInfo>>` with negative control `_DriftControl` :47 |
| T-70-22 | Repudiation | mitigate | PROCESS | Acceptance-time control ("no changed `expect(` lines in retyped tests") cannot be re-observed in current code; suites pass today (storeManagers/steam, gog, sideload, legendary per the plan SUMMARYs). Accepted as process evidence from 70-11-SUMMARY, same treatment as Phase 68 operational controls |
| T-70-23 | Info disclosure | accept | CLOSED | See Accepted Risks |
| T-70-24 | Tampering | mitigate | CLOSED | common/types/ipc/gameInfoSchema.ts:128-229 `z.strictObject` per runner (nested `install`, `extra`) joined by `z.discriminatedUnion('runner', …)` :231; ipc/install.ts:22,50,74 (`install`, `updateGame`); ipc/gameDetails.ts:32 (`addNewApp`). Per-store undeclared-key fixtures in sidecar/__tests__/ipcSchemas/install.test.ts and gameDetails.test.ts: pass |
| T-70-25 | Tampering | accept | CLOSED | See Accepted Risks |
| T-70-26 | DoS | mitigate | CLOSED | backend/testUtils/gameInfoFixtures.ts:49 "Exactly what SideloadDialog's handleInstall sends to addNewApp", used by gameDetails.test.ts (pass). Live gate: 70-UAT sideload add item pass; 70-16-SUMMARY "sideload 2 -> 3 (item-7 add)" |
| T-70-27 | DoS | mitigate | CLOSED | gameInfoSchema.ts:195 `save_path: str().nullable().optional()` (finding from the census: `save_path` null in 2 legendary entries, 70-13-SUMMARY:44-51); stripToSchema removes nulls on members that reject them (schemaStrip.ts:78) |
| T-70-28 | Info disclosure | mitigate | CLOSED | 70-13-SUMMARY "Null census (key paths and counts only, no values)" :44-49 (process evidence) |
| T-70-29 | Tampering | mitigate | CLOSED | common/types/ipc/settingsSchema.ts:197-198 `z.strictObject` for GameSettings / AppSettings; ipc/settings.ts:24 `configArg = appSettingsSchema.partial()`, :28-46 `setSettingArg` strict with per-key `appSettingsShape[arg.key]` validation; :74-76 `writeConfig` strict. Unknown-key invalid fixtures in ipcSchemas/settings.test.ts: pass |
| T-70-30 | DoS | mitigate | CLOSED | ipc/settings.ts:26-27,34-36 optional keys accept null/undefined; ipcSchemas/settingsParity.test.ts:222-240 per-key valid, null and absent-value loops: pass. Live settings gate items pass (70-UAT) |
| T-70-31 | DoS | mitigate | CLOSED | settingsParity.test.ts parity of `keyof AppSettings` / GameSettings against the schema shapes: pass; v1->v2 strip (see T-70-21-01 / T-70-22-01) covers persisted values. Backend-default-object assertion is covered by the parity suite, not located as a separate named test |
| T-70-32 | Tampering | accept | CLOSED | See Accepted Risks |
| T-70-33 | Tampering | mitigate | CLOSED | common/types/ipc/steam.ts:26-32 `launchParamsArg` `z.strictObject`; `launchOptionSchema` union of strictObjects at settingsSchema.ts:38-48 |
| T-70-34 | Tampering | mitigate | CLOSED | backend/storeMigrations/schemaStrip.ts:73-83 delete-only (keys from the schema `shape`, no value synthesis); :100-104 loose/catchall objects returned untouched so `dlcList` is never recursed; gameInfoLibraries.ts:109-130 `stripArrays` is `map`, count-preserving; gameInfoLibraries.test.ts:149,169 entry counts unchanged, :230 dlcList byte-for-byte: pass |
| T-70-35 | DoS | mitigate | CLOSED | schemaStrip.ts header "Pure and total: no mutation, no throw"; schemaStrip.test.ts:160 hostile-input totality. Engine backstop: storeVersioning/engine.ts markReadOnly on step failure (Phase 68 T-68-05/-06). Test run: pass |
| T-70-36 | Repudiation | mitigate | CLOSED | storeVersioning/__tests__/gameInfoLibrariesEngine.test.ts:78-81 backup exists, content equals original, mode 0o600; last-3 prune is Phase 68 T-68-04 |
| T-70-37 | DoS | accept | CLOSED | See Accepted Risks |
| T-70-38 | Tampering | mitigate | CLOSED (process) | 70-15-SUMMARY:34-36 snapshot taken before any migration code (mode 700, files 600); 70-16-SUMMARY "One pre-migration .bak per store exists"; no restore was needed. Observation O-2: the snapshot directory still exists (mode drwx------ verified by `ls -ld` only; contents not read) |
| T-70-39 | Info disclosure | mitigate | CLOSED (process) | 70-15-SUMMARY:34-36 and 70-16-SUMMARY post-gate table record versions and counts only; no values |
| T-70-40 | DoS | mitigate | CLOSED (partial evidence) | 70-16-SUMMARY: IPC_INVALID_ARGS count 0 in `gamelib.log`, `gamelib.log.old`, `gamelib-shell.log`. Limitation recorded there: the gate session's own sidecar log had rotated, so the grep covers later launches; the behavioural gate items (install starts, sideload add, setting writes) pass. Residual risk judged low, backed by the strict-schema fixtures and the real-key fixtures passing |
| T-70-41 | Tampering | mitigate | CLOSED | src/backend/storeMigrations/__tests__/fixtures/*-real-keys.json (7 library stores plus download-manager) consumed by gameInfoLibraries.test.ts; 70-15-SUMMARY deviation records the mutation check that proved the fixtures are not vacuous (f92e9524f). Test run: pass |
| T-70-42 | Info disclosure | mitigate | CLOSED | grep of src/backend/storeMigrations/__tests__ for `/Users/[a-z]` and the operator username: 0 hits |
| T-70-17-01 | Tampering | mitigate | CLOSED | lint.yml:52-54 `if: ${{ !cancelled() && steps.deps.outcome == 'success' }}`; gameInfoNarrowingWiring.test.ts:44,93 guard check and near-miss: pass |
| T-70-17-02 | Repudiation | mitigate | CLOSED | .husky/pre-push:2-12 `chain_status=$?` captured right after line 2, `narrowing_status=$?` right after line 4, combined into `checks_status`, `exit "$checks_status"`; wiring test :186 pre-fix near-miss: pass. Behavioural hook spawn test run (pass) |
| T-70-17-03 | Info disclosure | mitigate | CLOSED | gameInfoNarrowingWiring.test.ts:130 `createFakeHomeProfile`, :148 `PATH: \`${bin}:/usr/bin:/bin\``, :158 `profile.dispose()` |
| T-70-17-04 | EoP | accept | CLOSED | See Accepted Risks |
| T-70-18-01 | Tampering | mitigate | CLOSED | schemaStrip.ts:70-71 `Object.hasOwn(shape, key)` filter, :84 `Object.fromEntries`; schemaStrip.test.ts:160-165 `__proto__` JSON key test: pass |
| T-70-18-02 | DoS | accept | CLOSED | See Accepted Risks |
| T-70-18-03 | Tampering | mitigate | CLOSED | schemaStrip.ts:26 `dropInvalidOptional` is a required (non-optional) field of `StripOptions`; all four call sites pass it explicitly (gameInfoLibraries.ts:47, settingsStrip.ts:59, rustRefresh.ts:151, and lossless/lossy passes inside schemaStrip.ts:118-132); :81 drops only when `optional && !accepts`, so required members are never removed; schemaStrip.test.ts:76; Phase 68 0600 backup (T-70-36) |
| T-70-19-01 | DoS | mitigate | CLOSED | gameInfoLibraries.ts:105-107 `twoStep` registers v1->v2 and v2->v3 for steam, gog, gog installed, legendary, nile, sideload, download-manager; registered at storeMigrations/index.ts:34-46; gameInfoLibraries.test.ts control/result fixtures: pass |
| T-70-19-02 | Tampering | mitigate | CLOSED | Same evidence as T-70-36 plus gameInfoLibraries.test.ts:149,169 counts |
| T-70-19-03 | Tampering | mitigate | CLOSED | `*-real-keys.json` fixtures are consumed unchanged by the test; schemas are the single source (gameInfoLibraries.ts header). Test run: pass |
| T-70-20-01 | DoS | mitigate | CLOSED (drift) | Drift: the TS builder in steam/library/refresh.ts was replaced by the Phase 79 Rust refresh. The strip now runs at steam/library/rustRefresh.ts:151-155 (`stripToSchema(game, steamGameInfoSchema, { dropInvalidOptional: true })`, then `invalidPaths` warning) before `library.set` :160 and `pushGameToLibrary`; test: steam/__tests__/library.rustRefresh.test.ts:274 "strips a stray key from a Rust game before it reaches state". refresh.ts:264 persists a spread of an already-stripped entry |
| T-70-20-02 | Tampering | mitigate | CLOSED (drift) | Same site: undeclared keys and rejected nulls removed at build time, rustRefresh.ts:151 |
| T-70-20-03 | DoS | mitigate | CLOSED | storeManagers/legendary/library.ts:587-594 `raw.description ?? ''` (covers null and undefined); legendary/__tests__/getGameInfoForceReloadStaleness.test.ts:367-371 schema assertion for missing and null description |
| T-70-21-01 | DoS | mitigate | CLOSED | storeMigrations/settingsGame.ts:21-38 `settings-game-v1-v2` via `stripSettings(... gameSettingsSchema.partial() ...)` with `dropInvalidOptional: true` (settingsStrip.ts:60), registered index.ts:26; settingsGame.test.ts retired-key and invalid-value fixtures: pass |
| T-70-21-02 | Tampering | mitigate | CLOSED | Valid values preserved: settingsGame.test.ts deep-equal case; UAT items 17-18 pass (70-UAT.md:82-94) |
| T-70-21-03 | Tampering | mitigate | CLOSED | storeVersioning/__tests__/settingsFiles.test.ts (backup, byte-identical) and engine 0600 backup; UAT records `98800.v1.*.bak.json` created at rewrite |
| T-70-21-04 | DoS | accept | CLOSED | See Accepted Risks |
| T-70-22-01 | DoS | mitigate | CLOSED | settingsGlobal.ts:46-61 `settings-global-v1-v2` via `stripSettings(… appSettingsSchema.partial() …)`, registered index.ts:25; settingsGlobal.test.ts control/pass and per-key setSetting loop (ipcSchemas/settingsParity.test.ts:222-240): pass |
| T-70-22-02 | Tampering | mitigate | CLOSED | settingsStrip.ts:57-76 stderr names keys only and states the backup keeps the original; settingsFiles.test.ts backup byte-identical; focusRow null preserved (settingsGlobal.test.ts:143) |
| T-70-22-03 | Tampering | mitigate | CLOSED | settingsGlobal.ts chain order v0->v1 (to: 1, :24-44) then v1->v2 (to: 2); settingsGlobal.test.ts:143 "v0 -> v1 -> v2 keeps the tray and focusRow fold" over settings-global-v0.json: pass |
| T-70-22-04 | DoS | accept | CLOSED | See Accepted Risks |

Status: 65 of 65 CLOSED (6 marked superseded/drift, 4 backed by process evidence). Dispositions: 54 mitigate, 11 accept.

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-70-01 | T-70-SC | No package installs in this phase (RESEARCH Package Legitimacy Audit); nothing to verify | plan 70-01 | 2026-11-14 |
| AR-70-02 | T-70-08 | Type-only retype of persisted steam_library; values and key order unchanged | plan 70-04 | 2026-11-14 |
| AR-70-03 | T-70-10 | Type-only retype of gog_store/installed and sideload_apps/library; values unchanged | plan 70-05 | 2026-11-14 |
| AR-70-04 | T-70-23 | GOGLoginData type relocation carries no data; no runtime path or storage change | plan 70-12 | 2026-11-14 |
| AR-70-05 | T-70-25 | `dlcList` is a named loose boundary (gameInfoSchema.ts `epicDlcMetadataArg`, third-party Epic blob, no reader consumes it, bounded by `.max(4096)` and element type); verified present at gameInfoSchema.ts:~128 | plan 70-13 | 2026-11-14 |
| AR-70-06 | T-70-32 | `wineInstallationArg()` retained as the named loose boundary for legacy wineVersion keys (schemaTypes.ts:67, used by settingsSchema.ts:33) per 67-13 | plan 70-14 | 2026-11-14 |
| AR-70-07 | T-70-37 | Downgrade to an older build opens v2/v3 library files read-only with a notice (Phase 68 D-03); recorded in objective and UAT | plan 70-15 | 2026-11-14 |
| AR-70-08 | T-70-17-04 | Stub pnpm executable is written 0755 inside the 0700 fake profile root and deleted at dispose; never on the real PATH (gameInfoNarrowingWiring.test.ts:130-158) | plan 70-17 | 2026-11-14 |
| AR-70-09 | T-70-18-02 | Recursion depth is bounded by the schema depth, not the data; undeclared subtrees are dropped without descent (schemaStrip.ts `clean`) | plan 70-18 | 2026-11-14 |
| AR-70-10 | T-70-21-04 | Downgrade to a pre-plan build opens v2 GamesConfig read-only (Phase 68 D-03) | plan 70-21 | 2026-11-14 |
| AR-70-11 | T-70-22-04 | Downgrade to a pre-plan build opens v2 config.json read-only (Phase 68 D-03) | plan 70-22 | 2026-11-14 |

Accepted risks do not resurface in future audit runs.

## Observations (not threats, not blockers)

- O-1: `node meta/gameInfoNarrowingCeiling.cjs` currently exits non-zero: `FAIL [shrank]: lower src/frontend/screens/Game/GamePage/index.tsx to 4 in this commit (baseline 5)`. The file is modified and uncommitted in the working tree (git status at audit start), so this is in-flight work from another task, and it is the ratchet enforcing the shrink-only contract. The committed baseline must be lowered in the same commit; the pre-push hook will block until then.
- O-2: the 70-15 pre-gate snapshot `~/gamelib-phase70-pregate/` (mode 0700, real library cache copies) still exists. 70-15/70-16 did not require deletion, but it holds copies of the operator's library caches (non-token files); consider deleting it now that the gate has passed. Contents were not read.
- O-3: 70-UAT item 19 (legacy gamescope repair) is `skipped` with file evidence plus jest coverage; item 3 (Steam install start) is `issue`, triaged out of phase 70 scope (go-offline wrap untouched by phase 70).

## Unregistered Flags

70-13 and 70-14 `## Threat Flags` sections: "None new". No other SUMMARY carries a threat-flag entry. No unregistered flags.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 65 | 65 | 0 | gsd-security-auditor (Claude) |

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-15
