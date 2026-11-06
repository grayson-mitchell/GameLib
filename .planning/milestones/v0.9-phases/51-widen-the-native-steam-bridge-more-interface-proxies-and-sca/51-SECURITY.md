---
phase: 51
slug: widen-the-native-steam-bridge-more-interface-proxies-and-sca
status: verified
threats_open: 0
asvs_level: 1
created: 2026-11-04
---

# Phase 51 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Paths are relative to the repo root. `B` = `src/backend/storeManagers/steam/bridge`, `S` = `src/backend/storeManagers/steam`, `H` = `native/steam-bridge/helper/bridge_helper.c`, `D` = `native/steam-bridge/generated/bridge_dispatch.h`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| bottle PE shim -> helper loopback socket | game process (untrusted code) speaks the wire frame to the helper | binary request frames |
| backend -> game install dir | `gamelib_bridge.cfg` and shim DLLs written inside the bottle | config, DLL bytes |
| helper stderr -> backend | LISTEN/READY lines parsed to learn the port | text lines |
| game binaries -> parsers | exe/dll bytes and objdump output are attacker-shaped | PE bytes, text |
| bundled JSON / persisted store -> routing | allowlist asset (build-time) and on-disk verdicts (untrusted at read) | JSON |
| renderer -> IPC | untrusted args write persisted routing state | appId, userRoute enum |
| removal / scan-miss -> filesystem deletion | a user action or scan miss deletes a CrossOver bottle dir | bottle path |
| game code -> generated stubs / helper -> shim | MSVC ABI expectations; response bytes written into game buffers | stack frames, buffers |
| bottle logs / Steam CM metadata -> backend | third-party text and network filenames | log text, filenames |
| live-gate / census / probe output -> committed records | may carry account identifiers and local paths | SteamID64, persona, paths |

---

## Threat Register

Severity as declared in each PLAN (inferred conservatively where the plan had no column: DoS/Tampering with a deletion or ABI effect = high-leaning, otherwise medium).

| Threat ID | Category | Component | Disposition | Mitigation / Evidence | Status |
|-----------|----------|-----------|-------------|-----------------------|--------|
| T-51-01 | Elevation of Privilege | bridge_helper.c bind | mitigate | `H:3265` `htonl(INADDR_LOOPBACK)`, no `INADDR_ANY` anywhere in H; ephemeral port via bind port 0 (`H:21`) | closed |
| T-51-02 | Tampering | writeBridgeConfig | mitigate | `B/bridgeConfig.ts:146,153,172-199` numeric appId, port 1024..65535, sanitizeBottleName, `isContainedWithin` on exePath and every shimPath; tmp+`renameSync` at `:239` | closed |
| T-51-03 | Tampering | helperProcess spawn argv | mitigate | `B/helperProcess.ts:906` NUMERIC_APP_ID before spawn; argv-array spawn `:370-382`; helper `is_valid_appid` (`H:415`, used `H:3210,3221`, len <= MAX_APPID_DIGITS) | closed |
| T-51-04 | Denial of Service | helper lifetime | mitigate | `B/helperProcess.ts:342` per-appId existing-entry guard, `:593` `registerLongLivedChild`, `:156-157` bounded ports; monitor `onStopped` -> `stopBridgeHelper` (`S/games.ts:4557`) | closed |
| T-51-05 | Spoofing | LISTEN line parse | mitigate | `B/helperProcess.ts:505-520` appid must equal `expectedListenAppId`, port range check, child's own stderr only | closed |
| T-51-06 | Tampering | scanSteamApiImports | mitigate | `B/importScan.ts:105,215` argv-form `spawnAsync(OBJDUMP_BIN,[...])`, `:205` NUMERIC_APP_ID guard, `:49,114,243` conflicting headings -> typed conflict | closed |
| T-51-07 | Denial of Service | readInterfaceVersionStrings | mitigate | `B/interfaceVersions.ts:144-145` 512 MiB cap + 1 MiB chunks, `:28` `{2,40}` token cap, `:218` stat, `:275-276` close in finally | closed |
| T-51-08 | Tampering | allowlist load | mitigate | `B/allowlist.ts:74` closed reason enum, `:115` `z.literal(2)`, `:132` `.parse()`; test `__tests__/allowlist.test.ts` | closed |
| T-51-09 | Tampering | readBridgeVerdict | mitigate | `B/bridgeVerdict.ts:119-121` `safeParse` + `logWarning`, malformed -> undefined | closed |
| T-51-10 | Tampering | IPC contracts | accept | Type-only here; runtime validation landed in 51-13 (see T-51-30). Accepted Risks Log AR-01 | closed |
| T-51-11 | Tampering | locale catalogs | mitigate | `meta/lintTranslations.ts` / validateTranslation gate; no phase-51 file uses `dangerouslySetInnerHTML` (grep: SteamBridgeRouteNotice.tsx, SteamBridgeSetup.tsx, SteamDialog/index.tsx all 0; the three existing consumers are unrelated pre-phase screens) | closed |
| T-51-12 | Tampering | removeSteamInstallCopy -> removePerGameBridgeBottle | mitigate | `S/library.ts:2499,2578-2585` called only for `source==='bridge'` with resolved per-game name != legacy; guard chain `S/bottle.ts:1862-1925` (numeric, sanitize, forbidden set legacy/Phase17/shared, Bottles-root containment) | closed |
| T-51-13 | Tampering | stub ABI | mitigate | `meta/gen_vtables.ts:394-396,709-712` computeRetN === stackBytes, `:5006` stubs use stackBytes, `:8424-8430` generation exits 1 on validation errors | closed |
| T-51-14 | Tampering | shim cfg parser | mitigate | `D:6590` BRIDGE_CFG_READ_MAX 4096, `:6666-6668` 64 entries / 256-byte line / 64-byte field, `:6757` port 1024..65535 | closed |
| T-51-15 | Tampering | out-buffer copy | mitigate | `D:2551-2553` capacity capped at WIRE_OUT_BUFFER_MAX_BYTES (4096) and response scratch; `H:210,3018` MAX_FRAME_BYTES checked before body read | closed |
| T-51-16 | Elevation of Privilege | coverage check | mitigate | `B/shimGenerate.ts:919,1282` shim-not-built fail-closed; `__tests__/shimGenerate.test.ts:755-765` "nothing copied" | closed |
| T-51-17 | Tampering | steam_api64.dll placement | mitigate | `B/shimGenerate.ts:842` NUMERIC_APP_ID, `:478` sanitizeBottleName, `:663-664,715` isContainedWithin on target and backup, byte-identity helper `:359-377` | closed |
| T-51-18 | Denial of Service | readBoundedTail | mitigate | `S/bottleLaunchSignals.ts:55,65-92` 64 KiB tail, missing -> `''`, fixed paths `:115`; `WAITING_RECHECK_MS=15000` `:52` | closed |
| T-51-19 | Spoofing | steamBottleLaunchWaiting payload | mitigate | `S/bottleProcessMonitor.ts:496` payload is `{appName, detectedCause}` only; `src/common/types/ipc.ts:838-843` cause is a closed enum or null | closed |
| T-51-20 | Tampering | scan-miss bottle deletion | mitigate | `S/games.ts:2784,2837` only `removePerGameBridgeBottle`; `:2370-2380` install targets `bridgeBottleNameFor` | closed |
| T-51-21 | Tampering | metadata carry-forward | mitigate | `S/__tests__/metadataCapture.test.ts:212-216` pins `existingMeta?.bridge` carry-forward | closed |
| T-51-22 | Denial of Service | D-05 fallback loop | mitigate | `S/games.ts:368,2381,2579` `markBridgeFailedThisSession` on miss paths | closed |
| T-51-23 | Tampering | bridge_dispatch frame decode | mitigate | `D:7130-7131` default -> status 1 (STATUS_ERR), per-method argLen checks (e.g. `:7119-7123`), `H:3018` frame cap; `B/__tests__/helperIntegration.test.ts:409` bad ordinal test | closed |
| T-51-24 | Tampering | in-string / out-buffer decode | mitigate | `meta/gen_vtables.ts:973-997` 4096 caps; `D:2551-2553` capacity clamp; bounded local buffers | closed |
| T-51-25 | Tampering | identity-only mode | mitigate | `D:2743` reports real AppID; `D:2866,2890,2914,2938` SteamUserStats refused when `g_bd_identity_only`. SteamRemoteStorage has no forwarding dispatch (local stub per 51-14) so cannot write to 480 | closed |
| T-51-26 | Tampering | extractProtonInventory fetch | mitigate | `meta/sdk/*.json` every manifest carries a pinned 40-hex `source.ref` (two SHAs; the second is the documented 58-03 D-07 ref, `meta/extractProtonInventory.ts:64-72`); extractor not wired in build | closed |
| T-51-27 | Tampering | manifest stack widths | mitigate | `meta/gen_vtables.ts:709-712` validateManifest cross-check; generation refuses (`:8424-8430`) | closed |
| T-51-28 | Spoofing | identity fallback | mitigate | `B/helperProcess.ts:185-188,867-873,992,1043` fallback only after full-mode not-inited and identity-helper ready; test `__tests__/helperProcess.test.ts:557`; stats refused (T-51-25) | closed |
| T-51-29 | Repudiation | limited-features notice | mitigate | `S/games.ts:4124,4194-4206` `[bridge-notice]` logged on every attempt | closed |
| T-51-30 | Tampering | handleSetSteamBridgeUserRoute | mitigate | `S/installFormIpc.ts:335-384` typeof + NUMERIC_APP_ID, closed userRoute enum, acknowledgeReason set membership, no write before all pass; registered at `src/backend/sidecar/steamAuthFlowRegistration.ts:159,359` | closed |
| T-51-31 | Elevation of Privilege | known-bad bypass | mitigate | bypass only via persisted userRoute written by T-51-30 handler; miss clears it (`S/games.ts:2775` `setBridgeUserRoute(appId, undefined)`) | closed |
| T-51-32 | Spoofing | GameServer / Matchmaking / Networking / RemoteStorage stubs | mitigate | `meta/__tests__/gen_vtables.test.ts:907-909` asserts `SteamGameServer_Init` returns 0 and accessors NULL | closed |
| T-51-33 | Tampering | x64 class-return convention | mitigate | `meta/gen_vtables.ts:5005-5055` sretOut signature; `meta/__tests__/shimAbiGate.test.ts:184-227` asserts rdx->rax and plain ret on generated stub | closed |
| T-51-34 | Tampering | steam_api64.dll placement | mitigate | same guards as T-51-17 (`B/shimGenerate.ts:842,663,715`); `:919` and test `:755-765` absent x64 shim fails closed | closed |
| T-51-35 | Spoofing | x64 null-object | accept | Accepted Risks Log AR-02 | closed |
| T-51-36 | Tampering | missing-symbol rendering | mitigate | `src/frontend/screens/Game/GamePage/components/SteamBridgeRouteNotice.tsx:45,173` symbols interpolated as text; zero `dangerouslySetInnerHTML` in the three phase-51 UI files | closed |
| T-51-37 | Denial of Service | prescreenBridgeDepots | mitigate | `S/depot.ts:1071-1090` reuses `buildDepotPlan`, any throw -> `'unknown'`; `S/games.ts:1928` runs only when `steamApi===undefined` | closed |
| T-51-38 | Tampering | depot filename classification | mitigate | `S/depot.ts:1040-1042` `basename(...).toLowerCase()` comparison only, never joined into a path | closed |
| T-51-39 | Information Disclosure | bridgeCensus output | mitigate | `meta/bridgeCensus.ts:164-180` row fields limited; `meta/__tests__/bridgeCensus.test.ts:265,1877` no-path/no-account tests | closed |
| T-51-40 | Information Disclosure | 51-UAT / STATE evidence (plans 19, 27, 28, 30) | mitigate | `51-UAT.md:56,111` SteamID64 recorded as "matches account, …7096"; no 17-digit IDs in any phase-51 `.md` or `.planning/STATE.md`; no persona names (26-SUMMARY records persona as byte length); no home paths in 51-UAT.md or SUMMARYs. See Observation 1 | closed |
| T-51-41 | Denial of Service | isScanVerdictNowCovered | mitigate | `B/shimCoverage.ts:741-746` per-arch export set; `__tests__/shimCoverage.test.ts:779-790` pins x86 `SteamInternal_CreateInterface` false | closed |
| T-51-42 | Tampering | persisted scan.arch | accept | Accepted Risks Log AR-03 | closed |
| T-51-43 | Denial of Service | resolve_bare_iface | mitigate | `meta/__tests__/gen_vtables.test.ts:782-825` family spelling pin with negative control | closed |
| T-51-44 | Tampering | regenerated native sources | mitigate | `51-21-SUMMARY.md:34` generated diff exactly 4 lines in steam_api_shim.c, no .h/.def change | closed |
| T-51-45 | Denial of Service | install-tree walk | mitigate | `B/bridgeScan.ts:89,104-135` depth <= 4, skips symlinks, async `readdir`; root via `resolveWalkRoot` bottle-contained (`:244-255`) | closed |
| T-51-46 | Tampering | prescreen basename | mitigate | `S/depot.ts:1040-1042` string-only separator normalisation, no disk/network | closed |
| T-51-47 | Information Disclosure | miss marker in logs/dialog | accept | Accepted Risks Log AR-04 | closed |
| T-51-48 | Denial of Service | readBoundedTail on steamui_login.txt | mitigate | `S/bottleLaunchSignals.ts:65-92,115` reused 64 KiB bounded tail, missing -> `''` | closed |
| T-51-49 | Information Disclosure | login log lines | mitigate | `S/bottleProcessMonitor.ts:492-500` logs only `appId` + `cause`; frontend gets cause enum only | closed |
| T-51-50 | Elevation of Privilege | leaked helper outliving its game | mitigate | `S/games.ts:5657-5662,5990-6000` monitor started before wine child is awaited; `S/bottleProcessMonitor.ts:284-293,418` onStopped fire-once incl. give-up path (WR-05) | closed |
| T-51-51 | Denial of Service | un-awaited wine promise | mitigate | `S/games.ts:5662` settlement routed to `launcherExited()` (both arms handled); `S/__tests__/games.test.ts` unhandledRejection spy tests | closed |
| T-51-52 | Information Disclosure | CensusRow | mitigate | `meta/bridgeCensus.ts:176-179` evidence/evidenceDetail "never a path or log line"; test `meta/__tests__/bridgeCensus.test.ts:265,1877` | closed |
| T-51-53 | Repudiation | playVerified claims | mitigate | `B/allowlist.ts:101-104` non-empty evidence + date regex; `__tests__/allowlist.test.ts:258` every seed playVerified cites a UAT item | closed |
| T-51-54 | Information Disclosure | probe tables | mitigate | `51-26-SUMMARY.md:41,65` SteamID64 last 4 only, persona as length, raw captures deleted | closed |
| T-51-55 | Elevation of Privilege | newly wired methods | mitigate | `51-26-SUMMARY.md:9,31` only wire-policy methods wired mirroring x86 siblings; helper loopback-only (T-51-01) | closed |
| T-51-56 | Spoofing | invented accessor | mitigate | `51-26-SUMMARY.md:9,23,31,60` helperInterface copied from x86 sibling, live probe against AppID 411300, operator-accepted | closed |
| T-51-57 | Repudiation | seed growth | mitigate | `B/__tests__/allowlist.test.ts:222-227,258` seed playVerified cites UAT item (AoD -> item 18) | closed |
| T-51-58 | Repudiation | anchor change | mitigate | `51-28-SUMMARY.md:29-31` operator answers verbatim with date; `.planning/STATE.md:306` records the decision | closed |
| T-51-59 | Elevation of Privilege | XCOM CEG in GameLibSteam | accept | Accepted Risks Log AR-05 | closed |
| T-51-60 | Information Disclosure | library cache projection | mitigate | `51-29-SUMMARY.md:8,25` rule-drawn sample list only (appid/title/developer/size); no account fields found in phase docs (17-digit ID grep empty) | closed |
| T-51-61 | Repudiation | sample selection | mitigate | `51-29-SUMMARY.md:15,27,77` rule (seed gamelib-51-29, sha256 ascending, 12 titles, <=2/dev, <=15 GB) fixed before install; redraw recorded | closed |
| T-51-62 | Repudiation | goal verdict | mitigate | `51-30-SUMMARY.md:16,25,29` operator answer verbatim with census numbers (N=18, K=0, M=19) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-51-10 | IPC contracts are type-only in 51-03; runtime validation of appId / userRoute enum is implemented and tested where handlers land (51-13, T-51-30) | phase plan 51-03 | 2026-11-04 |
| AR-02 | T-51-35 | x64 null-object answers zero on every slot; a rare class-returning call on a null object may see RAX=0. Accepted for interfaces the game only fetches during context init; reported as stubbed so the D-51-02 notice fires | phase plan 51-15 | 2026-11-04 |
| AR-03 | T-51-42 | Verdict store is local, written only by GameLib; a tampered arch can at worst route one title to the wrong bottle, same blast radius as today | phase plan 51-20 | 2026-11-04 |
| AR-04 | T-51-47 | Miss marker carries only the DLL file name, never an absolute path | phase plan 51-22 | 2026-11-04 |
| AR-05 | T-51-59 | XCOM CEG in GameLibSteam is the existing Phase 17 bottled path the known-bad route already used; no new privilege | phase plan 51-28 | 2026-11-04 |

*Accepted risks do not resurface in future audit runs.*

---

## Observations (non-blocking)

1. `.planning/STATE.md:267` (a 51-01 Task 3 note, predating the T-51-40 plans) contains the local developer checkout path to a debug app bundle (a `/Users/<name>/Projects/GameLib/...` path). It is outside the 51-UAT evidence that T-51-40 governs and carries no account identifier, so it is not counted as an open threat. Consider redacting it if the planning tree is published.
2. `meta/sdk/*.json` includes one manifest family pinned to a second Proton SHA (58-03 D-07 branch exception). Both refs are full 40-hex commit SHAs, so T-51-26 holds.
3. No SUMMARY `## Threat Flags` introduced new attack surface (both flags files report none), so there are no unregistered flags.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-04 | 64 | 64 | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
