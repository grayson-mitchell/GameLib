---
phase: 53
slug: steam-bridge-coverage-modern-sdk-exports-flat-api
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-04
---

# Phase 53 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register source: the `<threat_model>` tables of 53-01..53-20 (77 threats, authored at plan time), verified against the code on `main` after the review rounds recorded in 53-REVIEW-FIX.md, 53-GAP-REVIEW-FIX.md and 53-GAP2-REVIEW-FIX.md and the later phases (54-60) that touched the same files.
>
> Path legend: `B/` = `src/backend/storeManagers/steam/bridge/`, `G` = `meta/gen_vtables.ts`, `C` = `meta/bridgeCensus.ts`, `H` = `native/steam-bridge/helper/bridge_helper.c`, `SHIM` = `native/steam-bridge/generated/steam_api_shim.c` (read with `grep -a`: the file contains non-text bytes so plain `grep` reports "binary file matches"), `P/` = this phase directory. Line numbers are against current `main`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Network -> extractor | Proton thunk sources fetched over HTTPS at a pinned SHA | Source text (read-only, scratch only) |
| Game install / bottle files -> managed reader, scan walks, census | Game assemblies, exes, directory layouts and engine logs are attacker-controllable (modded or corrupt installs, game-written logs) | PE/CLR bytes, directory trees, log text |
| Game process -> shim flat export / vtable proxy | `self`, hidden-return pointer, version strings, buffers and handles come from game code | Pointers, version strings, buffer lengths |
| Shim -> helper (loopback TCP, wire + CONTROL) | Every request frame (incl. REPORT_VERSION slot 4) is game-controlled bytes | Frames, version strings, buffer capacities |
| Helper stderr/stdout -> sidecar -> gamelib.log -> census | Log lines persist on disk and are re-read as evidence; arbitrary chunking from the child | Log lines |
| Persisted `steam_metadata.json` -> routing | Verdict is untrusted disk content | zod-validated verdict |
| GameLib -> CrossOver bottle registry | `reg add` DllOverrides write into a per-app bottle | Fixed dll/exe names |
| Diagnosis/UAT harness -> operator's real bottles and logs | Traces and UAT text can carry user data | Bottle-relative paths, method names, counts |

---

## Threat Register

Evidence conventions: "test" names a suite that passed on 2026-11-04 (`npx jest` over `meta/__tests__/bridgeCensus.test.ts`, `meta/__tests__/gen_vtables.test.ts`, `B/__tests__/{managedImports,bridgeScan,bottleDllOverrides,helperProcess,bridgeVerdict}.test.ts`: 7 suites, 654 tests, all passing). No native artifact was built; native sources were read directly.

| Threat ID | Category | Component | Severity | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|----------|-------------|-----------------------|--------|
| T-53-01 | Tampering | extractProtonInventory fetch | medium | mitigate | `meta/extractProtonInventory.ts:68` `PINNED_PROTON_SHA` (2c620c0f...); `:899` URL built from the ref, `:720` falls back to the pinned SHA; `G:500` `validateManifest`, run over every manifest at `G:8424` | closed |
| T-53-02 | Denial of Service | Step A read of 300+ MB exes | low | mitigate | `B/interfaceVersions.ts:144-145` 512 MiB cap + 1 MiB chunks; `:210` `readInterfaceVersionStrings` chunked, no read-all path | closed |
| T-53-03 | Elevation of Privilege | new wire methods reaching the helper | medium | mitigate | `meta/extractProtonInventory.ts:979,998` applies `meta/sdk/wire-policy.json` as the only wire-mode source; `G:7518-7521` generator throws if a dispatch-eligible wire method has no `helperInterface`; `bridge_dispatch.h:1370-1374` + `:2743,2866,2890,...` identity-only gating retained | closed |
| T-53-04 | Tampering | SteamInternal_GameServer_Init args | low | accept | AR-01. Verified body: `G:4788-4793` every argument `(void)`-ignored, `return 0` | closed |
| T-53-05 | Tampering | readManagedSteamApiImports offsets | high | mitigate | `B/managedImports.ts:60-67` `readExact` rejects unsafe/negative offsets and short reads; `:318` stream range checked against `metadataSize`, `:353,372,392` heap reads via `readExact`; hostile-input tests `managedImports.test.ts:58-82,161-196` (truncated `#~`, stream offset past blob, row count past EOF, `#Strings` index past heap, garbage) | closed |
| T-53-06 | Denial of Service | row counts / heap sizes | high | mitigate | `B/managedImports.ts:51-56` `MAX_STREAMS 16`, `MAX_ROWS 1<<22`, `MAX_METADATA_BYTES 64 MiB`, `MAX_STRING_BYTES 512`; enforced `:296,303,338,430`; tests "row count above the cap", "oversized #Strings heap", "more than MAX_STREAMS" (`managedImports.test.ts:182-191`) | closed |
| T-53-07 | Elevation of Privilege | managed code execution | high | mitigate | `B/managedImports.ts` parses bytes only; grep for `spawn`, `reflect`, `dotnet`, `mono` in the module finds no execution path (only prose) | closed |
| T-53-08 | Information Disclosure | names fixture | low | mitigate | `B/__tests__/fixtures/steamworksNetFlatNames.json` holds API identifiers only; a separator scan finds none (0 matching lines). The plan's one-off node check is not a persisted test; closed on the fixture content, see Notes | closed |
| T-53-09 | Spoofing | game log forging a CALL line | medium | mitigate | `C:1604-1617` CALL read only from `gamelib.log*` in `APP_LOG_DIR`; `C:896-912` `findGameCalls` takes CALLs only after the HELLO in the same attributed payload list, appid bracket-anchored via `HELPER_PREFIX` (`C:807`); census test "53-18 forged CALL in a FWD version string yields no game calls" (`bridgeCensus.test.ts:1589`) | closed |
| T-53-10 | Denial of Service | huge or many log files | medium | mitigate | `C:1280-1282` `MAX_APP_LOGS 12`, `MAX_APP_LOG_BYTES 32 MiB`, `MAX_ENGINE_LOGS 16`; `C:1616-1617` slice + `readTail`; `C:1690,1710` engine-log cap | closed |
| T-53-11 | Information Disclosure | census output | medium | mitigate | `C:42,162-178` row field set (T-51-39), detail "never a path or log line"; `C:1996` basenames only; test `bridgeCensus.test.ts:1877` "never puts a path in a DRM-branch detail (T-51-39)" | closed |
| T-53-12 | Tampering | symlinked log entries | low | mitigate | `C:1607-1608,1636-1637,1681-1682,1771-1772` `lstatSync` + `isFile() && !isSymbolicLink()` | closed |
| T-53-13 | Tampering | flat export with forged `self` | high | mitigate | `SHIM:34595-34610` (and every flat body) dispatches only when `self == &g_<iface>_instance`, else `return 0/NULL` without dereference; generator `G:6270-6360` `emitFlat*` | closed |
| T-53-14 | Tampering | version string to helper | medium | mitigate | `G:7166-7180` (`SHIM:34038-34049`) length loop bounded to `FWD_VERSION_LOG_MAX_BYTES` (128, `G:7574`) before `memcpy`; helper re-validates and sanitises `H:2578-2591`, `sanitize_ver` `H:2485-2491`; test `helperIntegration.test.ts:543` | closed |
| T-53-15 | Denial of Service | report flood | low | mitigate | `SHIM:34041,34046` `g_flat_version_reports >= 16` return; result discarded `(void)bridge_transact` | closed |
| T-53-16 | Elevation of Privilege | flat path bypassing wire policy | high | mitigate | flat bodies call the proxy's own vtable slot (`SHIM` e.g. `vt[33]` at `SteamAPI_ISteamGameServer_GetPublicIP`; design note `G:5955-5960`); wire forwarding only via `wire-policy.json`; no new dispatch entries (`G:7518`) | closed |
| T-53-17 | Tampering | ABI mismatch on sret / cross-version signatures | medium | mitigate | `G:5055,5844` sret stubs `memset(sretOut, 0, structSize)`; `G:6395-6403` throws on a class return with no `structSize` (WR-07); `G:6460-6470` throws when a version cannot be represented in C; `G:329` `isSretReturn`; tests `gen_vtables.test.ts:2704-2780` ("reconcile mix ... throw") and `shimAbiGate.test.ts:459` export-table compile gate | closed |
| T-53-36 | Denial of Service | lifecycle no-op exports | low | accept | AR-02. Verified: `G:2925-2955` no-op bodies only zero the return and NUL-terminate declared out buffers | closed |
| T-53-18 | Tampering | Managed dir walk | high | mitigate | `B/bridgeScan.ts:398` `MANAGED_MAX_FILES 256`; `:464-467` `isRealDir` (lstat, not symlink) + `isContainedWithin(bottleDir, ...)`; `:494,501,510` symlink and cap checks; test "skips a symlinked Managed dir" (`bridgeScan.test.ts:282`) | closed |
| T-53-19 | Denial of Service | managed dll reads | medium | mitigate | managed reads go through the capped `readManagedSteamApiImports` reader (T-53-05/06); `B/shimGenerate.ts:1016` one `scanManagedSteamApi` per considered dll name per placement | closed |
| T-53-20 | Tampering | verdict field | medium | mitigate | `B/bridgeVerdict.ts:53-62` zod `managedScan` discriminated union (`kind: literal`, non-negative int counts, fixed `reason` literal); no imported names persisted | closed |
| T-53-21 | Elevation of Privilege | guard bypass by managed names | medium | mitigate | `B/shimGenerate.ts:1008-1014` managed names join `merged` only and are "never added to `delayMissingAll`"; grep of `bridgeScan.ts`/`shimCoverage.ts` shows no managed path into `delayMissingAll`/`unservableAll` | closed |
| T-53-22 | Tampering | REPORT_VERSION length | high | mitigate | `H:2578` `vlen == 0 \|\| vlen > 128 \|\| 4 + vlen > argLen` -> `STATUS_ERR` before `memcpy` into `char ver[129]` (`H:2587-2589`); integration test `helperIntegration.test.ts:543-657` (malformed frames rejected without logging) | closed |
| T-53-23 | Tampering | log injection via version string | medium | mitigate | `H:2591-2593` `sanitize_ver` (printable ASCII only, else `?`) before `logts("NOVER", ...)`; CALL name from `bd_call_name(ci)` (`H:2956`), table generated from manifest identifiers; test asserts `ver=Bad?FAKE?Line` | closed |
| T-53-24 | Information Disclosure | CALL trace | medium | mitigate | `H:2956` `logts("CALL", bd_call_name(ci))` name only; CALL regex `C:901` accepts only `Interface.Method` | closed |
| T-53-25 | Denial of Service | log volume | low | mitigate | `H:1848,2953-2956` `g_call_seen[BD_CALL_COUNT]` once-per-method latch (`BD_CALL_COUNT 352`); NOVER capped (T-53-47) | closed |
| T-53-26 | Spoofing | forged CALL to fake evidence | low | accept | AR-03. Verified the compensating control: census reads app logs only (`C:1604`), requires HELLO + 2 distinct calls incl. identity (`C:1156`) | closed |
| T-53-27 | Tampering | walks over bottle trees | high | mitigate | steam_api, runtime-dll, importer and managed walks all come from `bridgeScan` (`C:2046,2080,2088`: `findRuntimeLoadedSteamApiDlls`, `scanManagedSteamApi`, `findSteamApiImporterPes`). One census-local `walkExes` remains (`C:1384-1403`) for stand-in exe selection: depth-bounded (`MAX_EXE_DEPTH 4`, `C:1284`) and built on `Dirent` types, so symlinks are neither recursed into nor collected. Judgement: see Notes | closed |
| T-53-28 | Denial of Service | 322 MB Overlooting exe | medium | mitigate | ranged fd reads through the shared scan; `C:1419` objdump `maxBuffer: 64 * 1024 * 1024` unchanged | closed |
| T-53-29 | Information Disclosure | rows and footer | medium | mitigate | `C:42,162-178` T-51-39 field set; test `bridgeCensus.test.ts:1877` | closed |
| T-53-30 | Elevation of Privilege | objdump spawn | low | accept | AR-04. Verified: `C:1283,1416-1420` fixed `/usr/bin/objdump`, argv form, no `env` | closed |
| T-53-31 | Repudiation | desk gate | low | mitigate | `P/53-UAT.md:25-40` desk gate records phase base, gate HEAD, command list and outcomes, artifact sizes | closed |
| T-53-32 | Information Disclosure | UAT text | low | mitigate | `P/53-UAT.md` scan: no `/Users` path, no SteamID64, no token; items name appids, symbols and log markers | closed |
| T-53-33 | Information Disclosure | evidence copied into UAT | medium | mitigate | `P/53-UAT.md:116-144,205-209` record counts, appids and `Interface.Method` names; no persona name, SteamID or token | closed |
| T-53-34 | Repudiation | scoring | low | mitigate | `P/53-UAT.md:147-148,312-314` each pass/issue cites census Evidence and the operator outcome verbatim | closed |
| T-53-35 | Tampering | inflating the count | medium | mitigate | `P/53-UAT.md:22-23` contract "never rerouted to bottled Steam"; 219990 and 284100 scored `issue` and "kept in the denominator" (`:140,196`); census denominator stays 18 | closed |
| T-53-40 | Tampering | flat hidden-pointer stubs (memset(ret, N)) | - | mitigate | `P/53-10-SUMMARY.md:41-46` measured sizes with Proton line cites; `G:6395-6403` unsized class fails closed; `G:5055,5844` memset uses the manifest `structSize` (28 manifests carry it); test `gen_vtables.test.ts:2751` | closed |
| T-53-41 | Elevation of Privilege | Friends018 argument shift into a pointer slot | - | mitigate | `G:580-584` `validateManifest` refuses an x64 manifest whose first param is `_ret`; test `gen_vtables.test.ts:2756,2772` ("no x64 committed manifest ... leading `_ret`"); remaining `_ret` params only in x86-only `isteamfriends011/013.manifest.json` | closed |
| T-53-42 | Tampering | Proton fetch | - | accept | AR-05. Verified: pinned SHA (`meta/extractProtonInventory.ts:68`), scratch output | closed |
| T-53-43 | Spoofing | CALL attribution by continuation line | - | mitigate | `C:807-832` `attributeHelperLines` attributes continuation lines to the nearest preceding prefix for the same appid only; tests `bridgeCensus.test.ts:1424,1433,1981` | closed |
| T-53-44 | Repudiation | stale logs inflating or deflating verdicts | - | mitigate | `C:1642-1653` `selectLatestUnrealLogs` drops `-backup-` logs; `C:1532` Player.log only, not Player-prev; `C:861-889` `appLogSegmentFor` slices from the LAST HELLO; tests `bridgeCensus.test.ts:1332-1365` | closed |
| T-53-45 | Denial of Service | log reads | - | mitigate | `C:1280-1282` caps; `C:1607-1608,1636-1637,1681-1682` lstat regular files only | closed |
| T-53-46 | Information Disclosure | CensusRow detail | - | mitigate | `C:961-969` `findNover` captures `[A-Za-z0-9_]+` only; `C:178` detail is a token or fixed reason | closed |
| T-53-51 | Tampering | extractProtonInventory fetch | - | mitigate | same controls as T-53-01 (`PINNED_PROTON_SHA`, `validateManifest` incl. the `_ret` refusal) | closed |
| T-53-52 | Denial of Service | measurement over game dlls | - | mitigate | reuses the bounded `managedImports`/`interfaceVersions` readers (T-53-02/05/06); test `interfaceVersions.test.ts:107` | closed |
| T-53-53 | Tampering | stub proxies writing caller memory | - | mitigate | `G:5040-5060` all-stub sret bodies `memset(sretOut, 0, structSize)` only; `G:5040` text-out stubs write only `[0] = '\0'` when `cb > 0` | closed |
| T-53-54 | Spoofing | aliasing a neighbour version | - | mitigate | `SHIM:33817-33825` `resolve_iface_by_exact_version` uses `strcmp` over the served table; unknown version -> `NULL` + report; no alias table | closed |
| T-53-47 | Denial of Service | REPORT_VERSION NOVER logging | - | mitigate | `H:1851,2582-2586` `g_nover_logged >= 16` still answers `STATUS_OK`; test `helperIntegration.test.ts:665-721` (exactly 16 NOVER lines) | closed |
| T-53-48 | Spoofing | CALL trace as evidence | - | mitigate | `H:2943-2956` CALL logged only when `status == STATUS_OK`; census needs >= 2 distinct calls incl. identity (`C:1156`) | closed |
| T-53-49 | Tampering | log injection via relayed lines | - | mitigate | `H:2485` sanitiser; `B/helperProcess.ts:563,569` relay prepends `bridge helper [<appId>]:` and logs the trimmed line verbatim, never interpreting content | closed |
| T-53-50 | Tampering | wrong-arch shim for mixed-mode CLR | - | mitigate | `B/managedImports.ts:38,171-180` ILONLY flag required for AnyCPU x64; test "keeps mixed-mode (no ILONLY) x86" (`managedImports.test.ts:37`) | closed |
| T-53-55 | Information Disclosure | auth ticket bytes | - | accept | AR-06. Verified: CALL logs the name only (`H:2956`); ticket crosses loopback only | closed |
| T-53-56 | Tampering | out-buffer overflow | - | mitigate | `G:4895-4905` shim `cap = (size < 0) ? 0 : size`, clamped to `WIRE_OUT_BUFFER_MAX_BYTES`; `G:7749-7765` helper clamps to the macro and the response scratch (`respCap - fixed`) | closed |
| T-53-57 | Elevation of Privilege | identity pointer across processes | - | mitigate | `G:753-760` `null-in` kind never sent, validator restricts it to `const SteamNetworkingIdentity*`; helper passes NULL | closed |
| T-53-58 | Tampering | shim swap for the discriminator | - | mitigate | `P/53-15-DIAGNOSIS.md:13-15` backed up, restored, `cmp`-verified, final sizes recorded | closed |
| T-53-59 | Information Disclosure | Wine traces in DIAGNOSIS.md | - | mitigate | `P/53-15-DIAGNOSIS.md` (113 lines, 3 short fenced excerpts) has no `/Users` path, SteamID or token; bottle-relative paths only | closed |
| T-53-60 | Denial of Service | runaway game or wineserver | - | mitigate | `P/53-15-DIAGNOSIS.md:4` `perl alarm 45` per run, scoped `wineserver -k`, `:15` `pgrep` empty | closed |
| T-53-61 | Repudiation | done-when claim | - | mitigate | `P/53-UAT.md:312-314,345-347` majority line quoted verbatim (`9 of 18 ... majority: no`), reported NOT MET | closed |
| T-53-62 | Spoofing | Mac Steam In-Game / friends presence as evidence | - | mitigate | `P/53-UAT.md:22,99-111` "In-Game in Mac Steam never counts"; `C:1108` helper lines and Mac Steam never count | closed |
| T-53-63 | Information Disclosure | log excerpts in UAT | - | mitigate | `P/53-UAT.md` excerpts are method names, version strings, loader lines; no account fields | closed |
| T-53-64 | Tampering | `SteamAPI_ISteamGameServer_GetPublicIP` fallback | - | mitigate | `SHIM:37362-37383` order: `ret == NULL` return, 012 RAX form dispatched, `ret == &g_steamgameserver014/015_instance` return NULL, then `memset(ret, 0, 20)`; tests `gen_vtables.test.ts:2994-3115` | closed |
| T-53-65 | Tampering | dropped RAX-form with params | - | mitigate | `G:6340-6356` throws `fail closed, 53-17` for params and for non-scalar returns; tests `gen_vtables.test.ts:3033,3049` | closed |
| T-53-66 | Information Disclosure | helper static out-buffer | - | mitigate | `G:7781` `memset(buf, 0, cap)` before the native call; test `gen_vtables.test.ts:3153` (53-17 WR-04) | closed |
| T-53-67 | Tampering | `char*` NUL write and `*pcbTicket` over-claim | - | mitigate | `G:5563` `*pcb = min(lenVal, copied)`; NUL clamped to `cap - 1` and skipped at cap 0; tests `gen_vtables.test.ts:3127,3142` | closed |
| T-53-68 | Spoofing | census CALL/HELLO evidence | - | mitigate | `C:834-842` `helloRegex` anchored `^\[ts\]\s+HELLO` on the attributed payload; `C:901` CALL regex anchored; tests `bridgeCensus.test.ts:1589,1600,1608` | closed |
| T-53-69 | Repudiation | census verdict after rotation | - | mitigate | `C:870-888` segment appends every newer file in ascending mtime order; test `bridgeCensus.test.ts:1619` | closed |
| T-53-70 | Tampering | split LISTEN/CALL lines | - | mitigate | `B/helperProcess.ts:535-558` per-stream carry, only whole lines parsed/logged, single flush on `end`/`close`; tests `helperProcess.test.ts:1109-1170` | closed |
| T-53-71 | Denial of Service | unbounded carry growth | - | accept | AR-07. Verified the carry is flushed once at stream end (`helperProcess.ts:544-558`); the plan text says "dropped", see Notes | closed |
| T-53-72 | Tampering | `reg add` argument injection | - | mitigate | `B/bottleDllOverrides.ts:39,55` numeric appId guard; `:30-37` frozen one-entry table; `:44-49` argv-array `buildOverrideCommandParts`; test `bottleDllOverrides.test.ts:178-182` asserts `/^[a-z0-9_]+$/` | closed |
| T-53-73 | Tampering | Task 1 leaves the real bottle modified | - | mitigate | `P/53-19-NVAPI.md:8-9,39-45` backed up + hashed, restored, `cmp` identical, sha256 before/after, `pgrep` empty | closed |
| T-53-74 | Denial of Service | override failure blocks launch | - | mitigate | `B/bottleDllOverrides.ts:79-91` try/catch + `logWarning`, never rejects; `games.ts:5738-5747` `.catch` fallback returns `fixedSettings`; tests `bottleDllOverrides.test.ts:85-163` | closed |
| T-53-75 | Elevation of Privilege | bottle-wide override breaking other titles | - | mitigate | `B/bottleDllOverrides.ts:30-37` per-appId table, one measured entry (3410180) with `exe: 'Overlooting.exe'`; `:44-47` per-exe AppDefaults key; test `bottleDllOverrides.test.ts:62-77` | closed |
| T-53-76 | Information Disclosure | traces in the scratchpad | - | mitigate | `P/53-19-NVAPI.md:45` raw traces deleted; document has no user path or account id | closed |
| T-53-77 | Repudiation | done-when claim | - | mitigate | `P/53-UAT.md:462-466,503-505` majority line verbatim (`9 of 18 ... majority: no`), "Not met"; row-by-row records `:394-456` | closed |
| T-53-78 | Spoofing | Mac Steam In-Game / forged FWD/NOVER strings | - | mitigate | contract `P/53-UAT.md:22`; 53-18 anchoring (`C:834-842`; tests `bridgeCensus.test.ts:1600,1608`) | closed |
| T-53-79 | Information Disclosure | log excerpts in UAT | - | mitigate | `P/53-UAT.md:394-456` excerpts limited to method names, versions, loader lines, fixed reasons | closed |
| T-53-80 | Elevation of Privilege | rerouting a title to bottled Steam to raise the count | - | mitigate | `P/53-UAT.md:22-23,451-456` every row stays on its bridge route; DRM titles recorded as `issue`; denominator unchanged at 18 | closed |

*Status: open / closed. Disposition: mitigate / accept / transfer. Severity "-" = the plan block carried no Severity column.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-53-04 | `SteamInternal_GameServer_Init`: every argument ignored, constant return, no memory written. | phase plan (53-01) | 2026-11-04 |
| AR-02 | T-53-36 | Lifecycle no-op exports only zero their return and NUL-terminate declared out buffers; ManualDispatch answering false means no callbacks, the same outcome as the existing no-op RunCallbacks. | phase plan (53-04) | 2026-11-04 |
| AR-03 | T-53-26 | A forged CALL needs a live shim connection to this appid's helper, which already proves HELLO; the census reads app logs only (T-53-09). | phase plan (53-06) | 2026-11-04 |
| AR-04 | T-53-30 | objdump spawn is unchanged: argv form with no env, the declared real-profile arm. | phase plan (53-07) | 2026-11-04 |
| AR-05 | T-53-42 | Proton fetch is pinned to a SHA, read-only into the scratchpad, values reviewed in the SUMMARY; nothing fetched lands in the repo. | phase plan (53-10) | 2026-11-04 |
| AR-06 | T-53-55 | The auth ticket is minted for this game's own appid (helper initialised with the game's real AppID, D-51-01), exactly what real Steam hands the game; it stays on the loopback socket and is never logged (CALL logs the name only). | phase plan (53-14) | 2026-11-04 |
| AR-07 | T-53-71 | The helper is GameLib's own binary and emits newline-terminated lines; the carry is released at stream end. | phase plan (53-18) | 2026-11-04 |

---

## Unregistered Flags

SUMMARY `## Threat Flags` sections exist only in 53-02-SUMMARY.md and 53-04-SUMMARY.md; both state nothing new beyond the plan's threat model. No unregistered attack surface.

Informational (not blockers): the REVIEW rounds (53-REVIEW, 53-GAP-REVIEW, 53-GAP2-REVIEW) found and fixed defects in surfaces the plan-time register already covers (hidden-pointer writes, out-buffer length, log anchoring, line carry-over); each is now carried as a separate register row (T-53-64..71) and verified above.

---

## Security Audit 2026-11-04

| Metric | Count |
|--------|-------|
| Threats found | 77 |
| Closed | 77 (70 mitigate verified in code/test/UAT record, 7 accept recorded above) |
| Open | 0 |

Method: each `mitigate` threat was checked against the code on `main` by file and line: the Proton extractor and generator under `meta/`, the generated shim and dispatch header under `native/steam-bridge/generated/`, the helper `native/steam-bridge/helper/bridge_helper.c`, the managed reader/scan/verdict/helper-process/DLL-override modules under `B/`, the census `meta/bridgeCensus.ts`, and the `games.ts` call site. Documentary threats (T-53-31..35, 58..63, 73, 76..80) were checked against `53-UAT.md`, `53-15-DIAGNOSIS.md` and `53-19-NVAPI.md`, with the code-side invariants (no bottled-Steam reroute, anchored census evidence) verified separately. Regression run: 7 jest suites, 654 tests, all passing; no native artifact was built.

Notes (no action required to close):
- T-53-27: the plan text says "no census-local walk remains", but the census keeps `walkExes` (`C:1384`) to pick the stand-in exe. Judged closed: the walk is depth-bounded and uses `Dirent` file types, which do not follow symlinks, and every walk that feeds the verdict (steam_api, runtime dlls, importers, Managed) is the shared `bridgeScan` one. A cap on file count there would be a hardening follow-up, not a missing mitigation.
- T-53-08: the "node check rejects path separators" was a plan acceptance step, not a persisted test. The fixture currently holds identifiers only.
- T-53-71: the plan rationale says the carry is "dropped on stream end"; the code flushes it once. The accepted risk (no cap on a newline-less child) is the same either way.
- T-53-36 / lifecycle no-ops: later phases (55, 58) replaced several no-op bodies with real callback and networking handling; their threats belong to those phases' registers, not 53's.
- `native/steam-bridge/generated/steam_api_shim.c` contains non-text bytes, so plain `grep` reports "binary file matches" and prints nothing. Always `grep -a` it. Not a security finding.
- Done-when for the phase (census majority) was NOT met in the UAT (9 of 18). That is an honest verification outcome recorded by T-53-61/77, not a security gap.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
