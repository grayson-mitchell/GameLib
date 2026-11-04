---
phase: 52
slug: bridge-backed-steamclient-dll-for-steamstub-titles
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-11-04
---

# Phase 52 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Built from the `<threat_model>` blocks of all 37 plans (52-01..52-37; pre-extracted register, 153 rows, IDs unique) and verified
> against the implementation by three parallel gsd-security-auditor passes (plans 01-12, 13-24, 25-37). No new-threat scan was
> performed. No 52-NN-SUMMARY.md carries a `## Threat Flags` section, so there are no unregistered flags.
>
> **Much of Phase 52's surface no longer exists.** Phase 56 (D-14/D-20; commits `553ff6781`, `f8a00423a`, `d5827a33e`, `e35fb9d74`,
> plan 56-13/56-14) deleted the steamclient64 forwarder (`native/steam-bridge/steamclient/`, its compile path in
> `meta/buildSteamBridgeShims.ts`, `steamClientSetup.ts`), `GameLibBridge_CreateInterface`, `g_bridge_steamstub_path_active`,
> helper CONTROL slot 3 (`bridge_helper.c:138` now refuses it as unknown), and the steamstub/forwarded notices and their locale
> keys. quick-261102-ht4 (`47224dc4f`) returned the SteamClient014/017 manifests to stub mode, removing the GetISteam* forwarding
> cases. Threats against that surface are marked **CLOSED (surface removed)**: the attack surface is gone (verified by grep and,
> where present, by absence-pinning tests such as `gen_vtables.test.ts:2190-2201,2282,2297` and `games.test.ts:3116`), not because
> the original mitigation is still in code. Mitigations were verified against current code, not plan text.

**Path shorthand:** `S` = `src/backend/storeManagers/steam`, `NB` = `native/steam-bridge`, `GATE` = `P/gate/scratch-run.sh`,
`P` = `.planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles`.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Game process (Wine) -> shim -> helper (TCP 127.0.0.1, CONTROL frames) | Version strings, handle ints and CONTROL payloads from untrusted game code cross into the native helper; decoded with bounded lengths, NULL-tolerant dispatch |
| Helper -> signed-in Mac Steam client | Forwarded calls act with the user's real Steam session; identity-only mode refuses stats/storage families |
| Helper / sidecar stderr -> gamelib.log | Logged strings are game-controlled; sanitized (`bd_fwd_sanitize`, `sanitize_ver`), no SteamIDs |
| Game install tree -> backend (PE read, import scan, objdump argv, shim placement) | Hostile PE headers and paths; bounded reads, containment checks, argv-form spawn, symlink refusal |
| Persisted bridge verdict / store -> launch behaviour | zod-validated (`drmWrapper` enum) before it can steer routing |
| Generator -> committed generated C | Manifests drive codegen; generation refuses SteamClient wire methods |
| Harness -> CrossOver bottles (scratch clone vs product bottle) | `GATE` fixes the clone to `GameLibGate52GD`, refuses CLONE==SRC, HKCU-only registry writes |
| Investigation -> SteamStub wrapper / genuine Valve DLLs | Header dumps only (`objdump -p`); no disassembly, unpacking or redistribution |
| Evidence / logs / operator decisions -> repo (UAT, DIAGNOSIS, todos) | Committed evidence must carry no SteamID64, tokens or signing material; verdicts not over-claimed |
| Backend -> user (notices, OS notifications, dialogs) | Wording must not over-claim; once-per-session gating; notification body never logged |

---

## Threat Register

| Threat ID | Plan | Category | Component | Severity | Disposition | Status | Evidence |
|-----------|------|----------|-----------|----------|-------------|--------|----------|
| T-52-01 | 52-01 | Tampering | generated in-string decode for pchVersion | medium | mitigate | CLOSED (surface removed) | GetISteam* forwarding removed (47224dc4f; meta/sdk/isteamclient017.manifest.json mode=stub; no SteamClient cases in bridge_dispatch.h). Generic bounded in-string decode (T-51-24) remains in generated dispatch. |
| T-52-02 | 52-01 | Spoofing | forwarded GetISteam* | high | mitigate | CLOSED (surface removed) | No forwarded GetISteam* path exists; stub mode is the pre-Phase-52 behaviour, nothing in the shim/helper claims a native answer. Note: the "proxy only on native presence" mitigation is not present, because the forwarding it guarded is gone. |
| T-52-03 | 52-01 | Elevation of Privilege | identity-only helper mode | medium | mitigate | CLOSED (surface removed) | Forwarded GetISteamUserStats/RemoteStorage/GameServerStats cases removed. Identity-only guard (T-51-25) still gates the app-scoped cases: bridge_dispatch.h:2866,2890,... `if (g_bd_identity_only) { *respLen = 0; return 1; }`; bridge_helper.c:2837,2870,2897,2911. |
| T-52-04 | 52-01 | Information Disclosure | FWD log lines | medium | mitigate | CLOSED | Sanitizer retained: bridge_dispatch.h:22-33 bd_fwd_sanitize (128-char cap, non-printable -> '?'); bridge_helper.c:2485 sanitize_ver used at 2591,2658,2701-2702 for all remaining game-string log lines. FWD GetISteam* log lines themselves removed. |
| T-52-05 | 52-01 | Denial of Service | game-issued BReleaseSteamPipe/ReleaseUser/BShutdownIfAllPipesClosed reaching the native client | low | accept | CLOSED (accepted) | accepted risk: helper's own InitFlat pipe never handed out; calls FWD-logged and watched in live gate. (Moot now: forwarding removed.) |
| T-52-06 | 52-01 | Tampering | unresolved flat symbols | low | mitigate | CLOSED (surface removed) | Forwarded dispatch removed; remaining dispatch keeps NULL-tolerant pattern (T-51-23) from Phase 51. |
| T-52-07 | 52-02 | Tampering | CREATE_INTERFACE decode | high | mitigate | CLOSED (surface removed) | Slot retired: bridge_helper.c:138 refused as unknown slot; grep CREATE_INTERFACE/CreateInterface in bridge_helper.c, protocol.ts: 0 hits. |
| T-52-08 | 52-02 | Spoofing | interface acceptance | high | mitigate | CLOSED (surface removed) | Same: no CREATE_INTERFACE slot, no local table. bridge_helper.c:138. |
| T-52-09 | 52-02 | Information Disclosure | FWD log line | low | mitigate | CLOSED (surface removed) | Log site removed with the slot; sanitizer retained (bridge_dispatch.h:25). |
| T-52-10 | 52-02 | Denial of Service | missing symbol in a future Steam build | low | mitigate | CLOSED (surface removed) | dlsym of SteamInternal_CreateInterface in helper removed with slot 3. |
| T-52-11 | 52-03 | Spoofing | forwarder answers | high | mitigate | CLOSED (surface removed) | native/steam-bridge/steamclient/ deleted (d5827a33e); `find` finds no steamclient_fwd.c outside spikes/worktrees. |
| T-52-12 | 52-03 | Tampering | path build in resolver | medium | mitigate | CLOSED (surface removed) | steamclient_fwd.c deleted. |
| T-52-13 | 52-03 | Tampering | second shim instance / second helper connection | medium | mitigate | CLOSED (surface removed) | steamclient_fwd.c deleted. |
| T-52-14 | 52-03 | Tampering | build byproducts in bundle | low | mitigate | CLOSED (surface removed) | compileSteamClient64 + prune code removed from meta/buildSteamBridgeShims.ts (d5827a33e); grep steamclient64 in file: 0 hits. |
| T-52-15 | 52-04 | Denial of Service | parsePeSectionNames | medium | mitigate | CLOSED | src/backend/storeManagers/steam/bridge/peSections.ts:11-13 (PE_SECTION_SCAN_BYTES 8192, MAX_PE_SECTIONS 96), :19-36 overflow-safe `buf.length - 24` / `- SECTION_ENTRY_SIZE` checks; shimGenerate.ts:524 reads <= PE_SECTION_SCAN_BYTES. Tests: peSections.test.ts hostile-header cases (short buffer, e_lfanew past buffer, lying count, 96 cap, truncated table). |
| T-52-16 | 52-04 | Tampering | verdict store | low | mitigate | CLOSED | bridgeVerdict.ts:50 `drmWrapper: z.enum(['steamstub']).optional()`; bridgeVerdict.test.ts:555 "rejects an unknown drmWrapper value (whole verdict undefined)"; round trip :545. |
| T-52-17 | 52-04 | Elevation of Privilege | routing taxonomy | low | mitigate | CLOSED | No KNOWN_BAD reason added for steamstub (grep KNOWN_BAD/steamstub in bridgeRoute.ts: only a Phase 56 DRM-mode comment at :114, which is a later deliberate routing change under 56 D-12, not Phase 52's field). |
| T-52-18 | 52-05 | Tampering | followed DLL name | high | mitigate | CLOSED | importScan.ts:67-69 isFollowableName rejects `[\\/]` and `..`; :74-76 isContainedWithin via relative(); :102 `join(dir,name)` + containment + existsSync; :107 argv-form `spawnAsync(OBJDUMP_BIN, ['--private-headers', full])`. Tests: importScan.test.ts:398 describe "static-import closure". |
| T-52-19 | 52-05 | Denial of Service | closure fan-out | medium | mitigate | CLOSED | importScan.ts:51-52 CLOSURE_MAX_DEPTH=2, CLOSURE_MAX_DLLS=32; :101 cap check; :67-72 system DLL / api-ms-/ext-ms- skipped. |
| T-52-20 | 52-05 | Tampering | arch confusion | low | mitigate | CLOSED | importScan.ts:48 CONFLICTING_HEADINGS_ERROR returned at :245-248, :266-269, :287-290. |
| T-52-21 | 52-06 | Tampering | locale catalogs | low | mitigate | CLOSED (surface removed) | The steam.bridge.steamstub.title/body strings were removed (D-14); grep steamstub in public/locales/*/gamelib.json: 0 files. |
| T-52-22 | 52-07 | Spoofing | GameLibBridge_CreateInterface | high | mitigate | CLOSED (surface removed) | grep GameLibBridge_CreateInterface in native/ meta/ src/: 0 hits outside planning docs (D-20). |
| T-52-23 | 52-07 | Tampering | name length into request buffer | medium | mitigate | CLOSED (surface removed) | Export removed (D-20). |
| T-52-24 | 52-07 | Tampering | pOutErrMsg writes | medium | mitigate | CLOSED (surface removed) | Export removed (D-20). |
| T-52-25 | 52-07 | Denial of Service | SteamInternal_ContextInit | low | accept | CLOSED (accepted) | accepted risk: calls game's own pFn exactly as SDK does; NULL-checked; constant counter only. |
| T-52-26 | 52-08 | Tampering | registry argv | high | mitigate | CLOSED (surface removed) | steamClientSetup.ts deleted (f8a00423a). The surviving ActiveProcess writer is Phase 56 stageDrmBottle.ts (ACTIVE_PROCESS_KEY at :93, HKCU only); its hardening belongs to the Phase 56 register, not verified here. |
| T-52-27 | 52-08 | Elevation of Privilege | HKLM write | high | mitigate | CLOSED | No HKLM Valve write anywhere: only `HKCU\\Software\\Valve\\Steam\\ActiveProcess` (stageDrmBottle.ts:93); sole HKLM string in steam backend is sharedRedists.ts:69 (read-side CommonRedist check, unrelated). Harness scratch-run.sh:104,144 uses HKCU only. |
| T-52-28 | 52-08 | Tampering | forwarder copy target | high | mitigate | CLOSED (surface removed) | steamClientSetup.ts deleted; no forwarder copy exists. |
| T-52-29 | 52-08 | Denial of Service | detectDrmWrapper read | low | mitigate | CLOSED | shimGenerate.ts:517-541: openSync/readSync <= PE_SECTION_SCAN_BYTES, closeSync in finally, try/catch returns undefined; callers confine to contained real path (detectLaunchDrmWrapper / containedGameExeReal, shimGenerate.ts:492-496, docstring :509-514). Tests in shimGenerate.test.ts. |
| T-52-30 | 52-08 | Spoofing | live-process pid stand-in | high | mitigate | CLOSED | No pid writer in product code: grep ActiveProcess in src/meta/native yields only steamClientProcess.ts:31 (comment: explicitly not using ...\\pid) and stageDrmBottle (SteamClientDll64/Universe values). UAT records "No pid writer exists in the repo" (52-UAT.md:227). Harness PID_ARM is clone-only diagnostic (scratch-run.sh:67-69). |
| T-52-31 | 52-09 | Tampering | gating on stored verdict | low | mitigate | CLOSED | Zod re-validation on read (bridgeVerdict.ts:50, test :555); setup consumer removed with D-14. |
| T-52-32 | 52-09 | Repudiation | silent failure | low | mitigate | CLOSED (surface removed) | `[bridge-notice]` steamstub path removed with the forwarder (games.test.ts:3116 "D-14 (56-13): Phase 52 forwarder removed" pins absence of steamstub trace). |
| T-52-33 | 52-09 | Denial of Service | launch abort on setup failure | low | accept | CLOSED (accepted) | accepted risk: launch proceeds rather than blocking. (Moot: setup removed.) |
| T-52-34 | 52-10 | Tampering | product bottle | high | mitigate | CLOSED | gate/scratch-run.sh:60 refuse CLONE==SRC; :61 path must end /GameLibGate52GD; :112,:69 target guards; :96-97 rm/cp only on CLONE_PFX; DRY_RUN prints only (:73). |
| T-52-35 | 52-10 | Information Disclosure | captured gamelib.log / helper logs | medium | mitigate | CLOSED | Captures under /tmp session dirs (52-UAT.md evidence paths /tmp/gamelib-gate-52*); regex `7656119\d{10}` over phase dir: 0 hits. |
| T-52-36 | 52-10 | Repudiation | gate evidence integrity | medium | mitigate | CLOSED | scratch-run.sh append-only (`>>` at :123,:149,:168), :63-64 single-instance refusal; UAT records per-launch delimiters (`=== GATE ROUND/LAUNCH`). |
| T-52-37 | 52-10 | Spoofing | stand-in creep during iteration | high | mitigate | CLOSED | 52-UAT.md:143 forbidden list (HKLM, hand edits to product bottle ...); Phase 52 boundary rows in 52-VERIFICATION.md:80,142,197 (no HKLM, no genuine DLL, exe unmodified). Code audit above confirms no pid writer / HKLM. |
| T-52-38 | 52-11 | Spoofing | iteration changes | high | mitigate | CLOSED | 52-UAT.md iteration records enumerate files per round (e.g. :264 "no HKLM ... no Grim Dawn.exe in the diff"); 52-VERIFICATION.md:142 gap-round diff touches only generator/shim/shimGenerate. |
| T-52-39 | 52-11 | Tampering | product bottle | high | mitigate | CLOSED | Same harness guards as T-52-34 (scratch-run.sh:60-61). |
| T-52-40 | 52-11 | Information Disclosure | evidence excerpts | medium | mitigate | CLOSED | No SteamID64 pattern in phase dir; excerpts are FWD/cxlog lines only. |
| T-52-41 | 52-11 | Elevation of Privilege | pid writer | high | mitigate | CLOSED | UAT :227 operator decision option-c (no pid writer); none in code (see T-52-30). |
| T-52-42 | 52-11 | Denial of Service | game-issued pipe/user release reaching the real client | low | mitigate | CLOSED | Moot after forwarding removal (no forwarded BReleaseSteamPipe etc.); UAT records Mac Steam health checks per round (52-UAT.md:172,177 "Mac Steam process still running"). |
| T-52-43 | 52-12 | Information Disclosure | gamelib.log excerpts | medium | mitigate | CLOSED | No SteamID64 in phase dir (grep 0 hits); full logs kept in /tmp. |
| T-52-44 | 52-12 | Repudiation | false pass from mixed instances or rotated logs | medium | mitigate | CLOSED | scratch-run.sh:63-64 single-instance refusals; UAT items archive per-launch logs (gamelib-launch-1.log, gamelib-relaunch-2.log, "copied after quit"). |
| T-52-45 | 52-12 | Tampering | product bottle | high | mitigate | CLOSED | Item 8/11/25 read-only checks recorded; item 7 on clone via guarded harness (scratch-run.sh:60-61). |
| T-52-46 | 52-12 | Elevation of Privilege | HKLM divert | high | mitigate | CLOSED | UAT item 11/25 "no HKLM Valve key in system.reg" pass (52-VERIFICATION.md:76,193); code has no HKLM Valve write (see T-52-27). |
| T-52-47 | 52-13 | Tampering | extract-proton-inventory fetch | medium | mitigate | CLOSED | meta/extractProtonInventory.ts:68 PINNED_PROTON_SHA; :892-897 fetchProtonSource throws unless ref in ALLOWED_PROTON_REFS; URL built from ref (:900). meta/gen_vtables.ts has no fetch(. Manifests isteamnetworking006/isteamremotestorage016 carry source.ref = pinned SHA, name/slot data only. |
| T-52-48 | 52-13 | Spoofing | SteamUser023 x64 wire | medium | mitigate | CLOSED | meta/sdk/isteamuser.manifest.json:9-10 flatAccessor/helperInterface SteamAPI_SteamUser_v023; native/steam-bridge/helper/bridge_helper.c:2562 identity from g_bd_flat_SteamUser023_GetSteamID(native session); no SteamID constant in generated/steam_api_shim.c (grep SteamID/7656 empty). |
| T-52-49 | 52-13 | Information Disclosure | RemoteStorage016 / Networking006 | low | mitigate | CLOSED | meta/sdk/isteamremotestorage016.manifest.json and isteamnetworking006.manifest.json: mode=stub, arches=[x64], 0 wired methods (no wire path to native client). |
| T-52-50 | 52-13 | Tampering | x86 shim | low | mitigate | CLOSED | 52-13 commit 3e37a6e2b touches only steam_api64.def (git show --stat); steam_api.def last changed by 371659f38 (phase 58), not by 52-13. |
| T-52-51 | 52-14 | Spoofing | SteamStub check | high | mitigate | CLOSED (surface removed) | GameLibBridge_CreateInterface removed by e35fb9d74. meta/__tests__/gen_vtables.test.ts:2190-2201 pins neither .def nor shim C contains the entry point, path flag or slot-3 define. No export means the null object is unreachable that way. |
| T-52-52 | 52-14 | Denial of Service | ordinary x64 titles | high | mitigate | CLOSED | SHIM_X64_NULL_OBJECT_FALLBACK path pinned in meta/__tests__/gen_vtables.test.ts:445,505,526 and committed-vs-regenerated pin :5065; x64 SteamClient bodies compile only the local answer (test :2282-2291, "no vt_SteamClient body contains bridge_transact("). |
| T-52-53 | 52-14 | Tampering | flag set by a non-stub caller | low | accept | CLOSED (accepted) | accepted risk: any in-process caller setting the flag only gets stricter forwarded behaviour, no capability gained. Flag since deleted (e35fb9d74), so moot. |
| T-52-54 | 52-14 | Elevation of Privilege | identity-only bypass (WR-08) | medium | accept | CLOSED (accepted) | accepted risk: deferred, recorded in .planning/phases/52-*/deferred-items.md:52 (WR-08); each family's dispatch gate still blocks method calls. Also moot after the Phase 56 removal of CONTROL slot 3. |
| T-52-55 | 52-15 | Tampering | .gamelib-orig backup | high | mitigate | CLOSED | src/backend/storeManagers/steam/bridge/shimGenerate.ts:708-733 probeOriginalBackup: isContainedWithin for target and backup (:714-716), lstatSync non-symlink regular file (:722-727), isGameLibShimBytes -> 'refused' (:730); restore at :660-680 same checks; withholdIfRestorable :762-768 only withholds if every probe is 'restorable'. Tests in shimGenerate.test.ts (~:2065 restore/withhold cases). |
| T-52-56 | 52-15 | Repudiation | withheld log line | medium | mitigate | CLOSED | shimGenerate.ts:782-799 withhold(): restore loop returns status 'error' on any failed restore (:786-793) before logWarning "launching with the game's own steam_api" (:795); no-original path logs separate truthful warning at :770-775 and returns null. |
| T-52-57 | 52-15 | Denial of Service | refresh path | low | accept | CLOSED (accepted) | accepted risk: a refreshed shim with gaps may still fail in-game; placed-miss names the gaps and the bridge-limited notice surfaces them (shimGenerate.ts:1425-1426 placedMissing). |
| T-52-58 | 52-15 | Elevation of Privilege | routing | medium | mitigate | CLOSED | No reroute added: games.ts:5444-5448 launches withheld via the bridge bottle directly ("via the Steam bridge bottle directly"); bridgeRoute.ts routes bottled Steam only for drm/CEG and explicit toggle (comment :100,:236). |
| T-52-59 | 52-16 | Repudiation | setupSteamClientForwarder 'placed' | high | mitigate | CLOSED (surface removed) | steamClientSetup.ts deleted in f8a00423a (grep for setupSteamClientForwarder in src/backend: none). No forwarder placement or "placed" claim remains. |
| T-52-60 | 52-16 | Denial of Service | Play hangs on wineserver --wait | high | mitigate | CLOSED (surface removed) | Same: steamClientSetup.ts and its reg add children deleted (f8a00423a). |
| T-52-61 | 52-16 | Elevation of Privilege | HKLM divert | high | mitigate | CLOSED (surface removed) | Forwarder registry writer deleted; no HKLM write in the Phase 52 path. Note: HKLM strings that remain are sharedRedists.ts:69 (CommonRedist key) and the Phase 56 DRM staging (drm/stageDrmBottle.ts), which are other phases' threat models, not audited here. |
| T-52-62 | 52-16 | Tampering | wrong-arch registration | medium | mitigate | CLOSED (surface removed) | arch-derived forwarder registration deleted with games.ts forwarder block (f8a00423a). |
| T-52-63 | 52-16 | Information Disclosure | reg stderr in logs | low | mitigate | CLOSED (surface removed) | reg.exe caller deleted (f8a00423a). |
| T-52-64 | 52-17 | Information Disclosure | gamelib.log / cxlog excerpts | medium | mitigate | CLOSED | grep -rn "7656119[0-9]{8,}" over .planning/phases/52-* returns 0 hits; .planning/todos also none. |
| T-52-65 | 52-17 | Repudiation | false pass (mixed instances, rotated log, In-Game-only) | high | mitigate | CLOSED | 52-UAT.md:243 item 17 result "skipped", not pass; items 18/19 also skipped (:247,:251); strict rule text in expected lines (:242 "In-Game is recorded but not counted"). No false pass recorded. |
| T-52-66 | 52-17 | Tampering | product bottle | high | mitigate | CLOSED | UAT results record product bottle read-only/clone harness use (item 18/trace results reference `cp -cR` clone, clone-state cmp assertions, UAT:273). No product-bottle mutation claimed. |
| T-52-67 | 52-17 | Elevation of Privilege | HKLM divert | high | mitigate | CLOSED | Hygiene check item 19 skipped honestly (UAT:251); no HKLM write exists in code (see T-52-61). Check was a procedural assertion; no code mitigation required. |
| T-52-68 | 52-18 | Information Disclosure | log excerpts | medium | mitigate | CLOSED | Same SteamID64 grep: 0 hits in phase dir. |
| T-52-69 | 52-18 | Repudiation | ELEX scored as verified from In-Game | high | mitigate | CLOSED | UAT:223 and :255 record "Bridge-verified: no (HELLO present, no game Steam-init log; In-Game never counts)". |
| T-52-70 | 52-18 | Spoofing | pid writer | high | mitigate | CLOSED | No pid writer implemented: 52-22 summary "git diff over native/ and src/ is empty"; grep for ActiveProcess/pid writing in src shows only DRM-phase and steamClientProcess code unrelated to a fabricated pid; operator decision recorded UAT item 16 (:239). |
| T-52-71 | 52-18 | Elevation of Privilege | rerouting to bottled Steam | medium | mitigate | CLOSED | UAT:223/:255 ELEX launched through GameLibSteamBridge-411300 with no routing change; code evidence as T-52-58. |
| T-52-72 | 52-19 | Tampering | product bottle GameLibSteamBridge-219990 | high | mitigate | CLOSED | 52-19-DIAGNOSIS.md/SUMMARY and UAT trace results use MODE=trace on a cp -cR clone (UAT:273 "clone of the source bottle only"); no product mutation recorded. Procedural, evidence is recorded results. |
| T-52-73 | 52-19 | Elevation of Privilege | locked boundary (stand-in, HKLM, pid) | high | mitigate | CLOSED | 52-19 was diagnosis-only; no shim/helper/gen change from it. No HKLM/pid/extra export in current code (T-52-61, T-52-70). |
| T-52-74 | 52-19 | Information Disclosure | relay args, Mac Steam logs, helper logs | medium | mitigate | CLOSED | 7656119 grep over 52-19-DIAGNOSIS.md, 52-UAT.md and all phase files: 0 hits. |
| T-52-75 | 52-19 | Tampering | genuine steamclient64.dll in the GameLibSteam bottle | high | mitigate | CLOSED | git ls-files shows no *.dll tracked in the repo. |
| T-52-76 | 52-19 | Repudiation | false attribution of the Friends sign-out | medium | mitigate | CLOSED | UAT:255 attributes only per 52-19 arm method and records "CAUSE UNKNOWN" where unproven (:223); routed to a pending todo rather than asserted. |
| T-52-77 | 52-19 | Information Disclosure | arm-c helper under the real HOME | low | accept | CLOSED (accepted) | accepted risk: named real-profile arm; helper must reach the operator's Mac Steam and writes only to a /tmp session dir. |
| T-52-78 | 52-20 | Denial of Service | helper native session (ReleaseUser/BReleaseSteamPipe/BShutdownIfAllPipesClosed with 1/1 handles) | high | mitigate | CLOSED (surface hardened further) | x64 SteamClient family is now stub-only with no wire path: meta/__tests__/gen_vtables.test.ts:2237-2260 (only pipe methods carry helperFallback), :2282-2291 no bridge_transact in any vt_SteamClient body (>100 bodies), :2293 dispatch header has no SteamClient case. Stronger than the planned off-path gate. |
| T-52-79 | 52-20 | Tampering | locked boundary on the SteamStub path | medium | mitigate | CLOSED (surface removed) | SteamStub path flag and forwarded SteamClient lookups removed (e35fb9d74, quick 261102-ht4); tests :2190-2201 pin absence. |
| T-52-80 | 52-20 | Elevation of Privilege | future SteamClient wire method silently forwarded | medium | mitigate | CLOSED | gen_vtables.test.ts:2297-2302 "generation refuses a SteamClient wire method with no helperFallback" (throws "SteamClient has no wire path since Phase 56"). |
| T-52-81 | 52-21 | Repudiation | false "game's own steam_api" log line | medium | mitigate | CLOSED | shimGenerate.ts:1412-1425 withholdIfRestorable only when targetExists; tests shimGenerate.test.ts:2075-2095 expectNoFallbackLog (no own-steam_api warning, no cannot-withhold, no backup) for the no-dll cases. |
| T-52-82 | 52-21 | Tampering | game-original dll overwritten without backup | medium | mitigate | CLOSED | shimGenerate.ts:1437-1440 backupOriginalBeforeOverwrite before overwrite, error returned if backup not ok; existing game-original withhold test ~:2065-2073 asserts original bytes kept. |
| T-52-83 | 52-21 | Denial of Service | exe launched with no steam_api at all | low | mitigate | CLOSED | shimGenerate.ts:1335,1412-1425 no target -> null withhold -> shim placed with placed-miss verdict (:1463). |
| T-52-84 | 52-22 | Spoofing | stand-in answer (fabricated success in forwarder or pid naming a non-Steam process) | high | mitigate | CLOSED | 52-22 chose option-other, no implementation (52-22-SUMMARY "git diff over native/ and src/ is empty"); no success constant or fabricated pid introduced; forwarder since deleted. |
| T-52-85 | 52-22 | Tampering / Elevation of Privilege | helper CONTROL slot 4 arg decoding and dlsym | high | mitigate | CLOSED | Planned decoder never built (52-22 no code). Slot 4 today = CONTROL_SLOT_REPORT_VERSION, native/steam-bridge/helper/bridge_helper.c:2568-2595: argBlob NULL/len<4 -> ERR, vlen 0 or >128 or 4+vlen>argLen -> ERR (:2576-2579), 16-report cap (:2581), sanitize_ver before log; log-only, no dlsym of client string. dlsym calls take compile-time names (:497-508, gl_netu_sym :817-819). |
| T-52-86 | 52-22 | Elevation of Privilege | HKLM divert (spike 036) | high | mitigate | CLOSED | No steamClientSetup.ts / forwarder exists; no code change in 52-22. |
| T-52-87 | 52-22 | Tampering | game exe or a Windows Steam client in the bottle | high | mitigate | CLOSED | No exe write or genuine steamclient64.dll copy in this path: no tracked *.dll; 52-22 no code. |
| T-52-88 | 52-22 | Denial of Service | scope blow-up of option-flat | medium | mitigate | CLOSED | Stop rule moot: option-flat not implemented (item 16 option-other). |
| T-52-89 | 52-23 | Repudiation | false pass (In-Game only, harness-flow evidence, rotated log, two instances) | high | mitigate | CLOSED | UAT items 17-19 "skipped" (:243,:247,:251); item 24 trace (:273) explicitly "bridge-verified is NOT achieved"; no harness-flow pass. |
| T-52-90 | 52-23 | Tampering | product bottle | high | mitigate | CLOSED | No Grim Dawn launch or trace made by 52-23 (UAT:243); item 24 run on a clone (:273). |
| T-52-91 | 52-23 | Elevation of Privilege | HKLM divert / Windows Steam client in the bottle | high | mitigate | CLOSED | Item 19 skipped, no HKLM/steam.exe claim made; no code path (see T-52-61). |
| T-52-92 | 52-23 | Information Disclosure | gamelib.log / cxlog excerpts | medium | mitigate | CLOSED | 0 SteamID64 hits in phase dir. |
| T-52-93 | 52-24 | Repudiation | ELEX scored as verified from In-Game, or Friends sign-out hidden | high | mitigate | CLOSED | UAT:223 scored `issue` on Friends sign-out and records "Bridge-verified: no" (:223, :255); sign-out routed to pending todo 2026-10-24-friends-sign-out-steam-user-logon.md. |
| T-52-94 | 52-24 | Repudiation | phase marked complete on partial evidence | high | mitigate | CLOSED (with note) | Literal rule "complete only when 17-20 all pass" was NOT met: 52-UAT.md:2 status complete while items 17-19 skipped, 20 pass-with-Friends caveat. Mitigation intent met by recorded done-when amendment (UAT:23 "Amended 2026-10-24 (item 29)", items 30-32) and the forwarding todo was not moved (.planning/todos/pending/2026-10-23-forwarding-steamclient-dll-for-steamstub-titles.md still pending). Flag for orchestrator as a documented deviation, not a code gap. |
| T-52-95 | 52-24 | Information Disclosure | log excerpts | medium | mitigate | CLOSED | SteamID64 grep over phase dir and .planning/todos: 0 hits. |
| T-52-96 | 52-24 | Elevation of Privilege | rerouting ELEX to bottled Steam | medium | mitigate | CLOSED | No routing change; ELEX launches through the bridge bottle (UAT:223,:255); bridgeRoute.ts reroutes only drm-wrapped/explicit toggle. |
| T-52-97 | 52-25 | Tampering | product bottle GameLibSteamBridge-219990 | high | mitigate | CLOSED | H:44,60-61,97 (CLONE=GameLibGate52GD fixed, refuses CLONE==SRC / path not ending GameLibGate52GD, `cp -cR` clone); H:111-112 RelayInclude refused unless CLONE==GameLibGate52GD; UAT items 24/25 and 52-25 SUMMARY record preflight/post-run sha256 + clone cmp. |
| T-52-98 | 52-25 | Elevation of Privilege | locked boundary (DRM reverse engineering) | high | mitigate | CLOSED | P/52-25-DIAGNOSIS.md:117 states disassembly/unpacking forbidden and not done; only `objdump -p` (header dump) used, no `objdump -d`/steamless/.bind decode hits in 52-25/52-30 DIAGNOSIS (grep). |
| T-52-99 | 52-25 | Tampering | genuine steamclient64.dll | high | mitigate | CLOSED | 52-25-DIAGNOSIS.md:6 "read in place, never copied"; no repo-tracked steamclient64.dll (`git ls-files native` empty); H clone-only writes. |
| T-52-100 | 52-25 | Information Disclosure | certificate fields, relay args, helper logs | medium | mitigate | CLOSED | DIAGNOSIS files contain no serial/thumbprint (hashes truncated e.g. `d84cb744...`); SteamID64 grep 0 hits over P and pending todos. |
| T-52-101 | 52-25 | Repudiation | over-reading public claims as observed fact | medium | mitigate | CLOSED | 52-25-DIAGNOSIS.md: 10 `public-claim` labels; :112 classification table with strength column; :117 "not observable" accepted as an answer. |
| T-52-102 | 52-26 | Spoofing | forwarder identity (Valve version strings, Valve signer) | high | mitigate | CLOSED | Operator chose option-versioninfo with GameLib strings (52-26 SUMMARY: CompanyName "GameLib", no "Valve" string); no Valve signature attempted. Forwarder code later removed entirely (d5827a33e). |
| T-52-103 | 52-26 | Tampering | genuine Valve binary or exe in a bridge bottle | high | mitigate | CLOSED | 52-26 SUMMARY boundary checks (no Grim Dawn.exe in diff, no .dll in diff, no HKLM); UAT item 25 pass (forwarder differs from genuine DLL, exe sha256 equals preflight). Current code: no forwarder/steamclient compile in meta/buildSteamBridgeShims.ts. |
| T-52-104 | 52-26 | Information Disclosure | signing key material (option-sign) | high | mitigate | CLOSED | option-sign not chosen; `git ls-files \| grep -E '\.(pfx\|p12\|key\|pem)$'` empty; no signing env/code in meta/buildSteamBridgeShims.ts. |
| T-52-105 | 52-26 | Tampering / Elevation of Privilege | helper CONTROL slot arg decoding (option-flat) | high | mitigate | CLOSED | option-flat not chosen (52-26 SUMMARY: option-versioninfo); no helper change in 52-26 commit list. N/A surface. |
| T-52-106 | 52-26 | Tampering | post-link checksum writer touching the wrong artefact | medium | mitigate | CLOSED (surface removed) | No writePeChecksum code exists (option-sign/checksum not implemented); forwarder compile removed by d5827a33e (meta/buildSteamBridgeShims.ts has no steamclient64/compileSteamClient64 refs). |
| T-52-107 | 52-26 | Denial of Service | scope blow-up | medium | mitigate | CLOSED | 52-26 SUMMARY: all stop-rules clear, scope limited to .rc + meta build files; 52-28 SUMMARY name-only file list confirms. |
| T-52-108 | 52-27 | Repudiation | false pass (In-Game only, missing In-Game, harness-flow evidence, rotated log, two instances, stale forwarder) | high | mitigate | CLOSED | UAT:267-271 items 23/24 carry strict rule (In-Game conjunct in 23, excluded from 24); item 23/24 scored `issue` (52-27 SUMMARY) not pass; H:63-64 single-instance refusal. |
| T-52-109 | 52-27 | Tampering | product bottle | high | mitigate | CLOSED | H:60-64,94-97 guarded clone harness; UAT item 25 pass (exe sha256 equals preflight). |
| T-52-110 | 52-27 | Elevation of Privilege | HKLM divert / Windows Steam client in the bottle | high | mitigate | CLOSED | UAT item 25 pass: 0 system.reg Valve keys, no steam.exe/steamclient*.dll in Steam root (52-27 SUMMARY); no HKLM in native/steam-bridge/steamclient (52-26 SUMMARY). |
| T-52-111 | 52-27 | Information Disclosure | gamelib.log / cxlog excerpts | medium | mitigate | CLOSED | SteamID64 grep over P + pending todos = 0 hits. |
| T-52-112 | 52-28 | Repudiation | phase marked complete on partial, In-Game-only, or In-Game-missing evidence | high | mitigate | CLOSED | 52-28 SUMMARY: UAT stayed `diagnosed`, todo stayed pending after re-gate 3 failure; completion only after item-29 amendment (UAT:295 `amendment-approved:`) and items 31/32 pass; bridge-verified recorded as "not claimed". |
| T-52-113 | 52-28 | Repudiation | skipping ELEX when the change could reach it | medium | mitigate | CLOSED | 52-28 SUMMARY:25 computed skip condition from `git show --name-only` of 52-26 commits; UAT item 26 `skipped`. |
| T-52-114 | 52-28 | Information Disclosure | log excerpts | medium | mitigate | CLOSED | SteamID64 grep 0 hits in P and pending todos; 52-28 SUMMARY "no SteamID64 in UAT or pending todos". |
| T-52-115 | 52-28 | Elevation of Privilege | rerouting ELEX or Grim Dawn to bottled Steam | medium | mitigate | CLOSED | 52-28 made no routing change (only UAT/deferred/todo files per SUMMARY key-files). |
| T-52-116 | 52-29 | Tampering | import-lib prune (argv order) | low | mitigate | CLOSED (surface removed) | Superseded: forwarder argv/byproduct pruning deleted (d5827a33e); surface gone. 52-29 SUMMARY records the RED/GREEN test at the time (46 passed). |
| T-52-117 | 52-29 | Denial of Service | build with a missing .rc | low | mitigate | CLOSED (surface removed) | Superseded: compileSteamClient64 and missingSteamClient64Inputs removed (d5827a33e); no steamclient refs in meta/*.ts. 52-29 SUMMARY records guard + tests at the time. |
| T-52-118 | 52-29 | Tampering | concurrent live trace (52-30) comparing forwarder bytes | medium | mitigate | CLOSED | 52-29 SUMMARY: `git diff --quiet -- native public` holds, no rebuild. |
| T-52-119 | 52-30 | Tampering | product bottle GameLibSteamBridge-219990 | high | mitigate | CLOSED | H:60-64,97 (trace clone, cp -cR); 52-30 SUMMARY/DIAGNOSIS P1-P6 compared; 52-30 key-files touch only gate/DIAGNOSIS/UAT (no native/src/meta/public). |
| T-52-120 | 52-30 | Elevation of Privilege | locked boundary (DRM reverse engineering) | high | mitigate | CLOSED | 52-30-DIAGNOSIS.md:176 `## Boundary note`; no disassembly/unpacker terms in DIAGNOSIS (grep). |
| T-52-121 | 52-30 | Spoofing | diagnostic pid as a shipped stand-in | high | mitigate | CLOSED | H:66-69 PID_ARM refused unless =live, MODE=trace, CLONE==GameLibGate52GD; H:142-158 writes clone-only; 52-30/52-31 DIAGNOSIS boundary note; 52-31 O1 result says pid writer not indicated. |
| T-52-122 | 52-30 | Information Disclosure | relay args, certificate/IPC names, helper logs | medium | mitigate | CLOSED | SteamID64 grep 0 hits. |
| T-52-123 | 52-30 | Repudiation | reading an unobservable check as a known cause | medium | mitigate | CLOSED | 52-30-DIAGNOSIS.md:3,39 pre-registration with O1-O4 before arm B; "No fix chosen; O1-O4 not applied until arm B" (52-30 SUMMARY). |
| T-52-124 | 52-31 | Tampering | product bottle GameLibSteamBridge-219990 | high | mitigate | CLOSED | 52-31 SUMMARY: P1-P6 equal before/after, product holds no pid, git diff clean over native/src/meta/public; H guards. |
| T-52-125 | 52-31 | Spoofing | diagnostic pid taken as a shipped answer | high | mitigate | CLOSED | H:66-69,142-158 clone only; 52-30-DIAGNOSIS.md:176 Boundary note; 52-31 SUMMARY "A product pid writer is not indicated". |
| T-52-126 | 52-31 | Repudiation | rewriting the rule after seeing the result (p-hacking) | high | mitigate | CLOSED | 52-31-DIAGNOSIS.md:112 (52-30-DIAGNOSIS) PREREG 08064e3f1 byte-equal (empty diff) before arm B; :168 class quotes pre-registered O1 verbatim. |
| T-52-127 | 52-31 | Elevation of Privilege | locked boundary (DRM reverse engineering) | high | mitigate | CLOSED | 52-30-DIAGNOSIS.md:172,176 close-out, no disassembly, no bottled reroute; 52-31 "No fix was implemented". |
| T-52-128 | 52-31 | Information Disclosure | relay args, IPC/object names, helper logs | medium | mitigate | CLOSED | SteamID64 grep 0 hits. |
| T-52-129 | 52-32 | Repudiation | phase marked complete or done-when silently dropped | high | mitigate | CLOSED | UAT:291-295 item 29 records verbatim operator approval `amendment-approved:`; 52-32 SUMMARY: status stayed diagnosed, done-when amended in ROADMAP only after approval. (UAT later `complete` only after items 31/32 under the amended done-when.) |
| T-52-130 | 52-32 | Elevation of Privilege | an option crossing the locked boundary (product pid this round, Valve DLL, HKLM, bottled-Steam reroute) | high | mitigate | CLOSED | 52-32 SUMMARY: Excluded routes block in item 29, no fix implemented; 52-32 key-files docs only. |
| T-52-131 | 52-32 | Tampering | editing a committed diagnosis or widening todo frontmatter vocabulary | medium | mitigate | CLOSED | 52-32 SUMMARY: planning-gates 12/12; item 29 cites 52-31 result; pending todos carry triage frontmatter (pnpm planning-gates). |
| T-52-132 | 52-32 | Information Disclosure | log excerpts in UAT/todo | medium | mitigate | CLOSED | SteamID64 grep 0 hits over P + pending todos. |
| T-52-133 | 52-33 | Tampering | locale catalogs | low | mitigate | CLOSED (surface removed) | 52-33 SUMMARY: 96/96 validateTranslation + sabotage control rejected. Current: forwardedTitle/forwardedBody strings no longer in public/locales or src (removed with forwarder), so no residual surface. |
| T-52-134 | 52-33 | Repudiation | notice wording | medium | mitigate | CLOSED (surface removed) | 52-33 SUMMARY keeps "probably", 52-06 strings untouched; strings since removed in 56-13 (surface gone). |
| T-52-135 | 52-34 | Repudiation | maybeNotifySteamStubForwarded wording/trigger | medium | mitigate | CLOSED (surface removed) | 52-34 SUMMARY (deterministic trigger, "probably"); function `maybeNotifySteamStubForwarded` removed by f8a00423a — grep over src/meta/src-tauri for SteamStubForwarded / launch-check-unsatisfiable = 0 hits. |
| T-52-136 | 52-34 | Elevation of Privilege | locked boundary | high | mitigate | CLOSED | `git show --name-only` of 52-34 commits (76b9d1deb, 09a48a2e6): only games.ts + games.test.ts; no native/meta/steam/bridge change. |
| T-52-137 | 52-34 | Denial of Service | notification spam | low | mitigate | CLOSED (surface removed) | Original per-title Set removed with the notice; equivalent once-per-session gate pattern persists for successors: games.ts:4168-4177 `drmModeNoticeShownThisSession` Set. |
| T-52-138 | 52-34 | Information Disclosure | log line | low | accept | CLOSED (accepted) | accepted risk: log line carries only appId and a fixed reason; no SteamID, persona or token (line itself since removed). |
| T-52-139 | 52-35 | Tampering | product bottle | high | mitigate | CLOSED | UAT item 31 (UAT:317) ran DRY_RUN first, fresh clone, clone assertions cmp-equal; H guards; 52-35 SUMMARY. |
| T-52-140 | 52-35 | Information Disclosure | gamelib.log / cxlog excerpts | medium | mitigate | CLOSED | SteamID64 grep 0 hits. |
| T-52-141 | 52-35 | Repudiation | item 2, todo closure, bridge-verified | medium | mitigate | CLOSED | UAT:177 item 2 `skipped — superseded` (not pass); items 30/31/32 each state `bridge-verified: not claimed`; item 30 scored `issue`, not pass. |
| T-52-142 | 52-35 | Elevation of Privilege | locked boundary | high | mitigate | CLOSED | 52-35 key-files are docs only (UAT/deferred/todo/STATE/ROADMAP), no code change. |
| T-52-143 | 52-36 | Repudiation | notice delivery claim | medium | mitigate | CLOSED | src/backend/dialog/dialog.ts:164-179 'show' listener logs backend label and "delivery not confirmable" for plugin/unknown; :152-161 failed path; games.ts:4206/4245 `dispatched=in-app-dialog+notify`; main.rs:8336-8351 resolves backend label. |
| T-52-144 | 52-36 | Information Disclosure | notify() delivery log | low | mitigate | CLOSED | dialog.ts:163 comment + :164-179 logs title and fixed label only, never body; skipped path :188 title+reason only. Test: src/backend/__tests__/notificationFailureLogging.test.ts. |
| T-52-145 | 52-36 | Tampering | notification_show resolve value | low | accept | CLOSED (accepted) | accepted risk: value is a fixed label from a pure fn (notification_backend.rs:40-43 `backend_label` -> &'static str; UN arm appends fixed-format settings fields); shim passes only strings (platform/index.ts:664 `typeof result === 'string'`), else undefined; dialog.ts:136-141 parses defensively. |
| T-52-146 | 52-36 | Denial of Service | dialog spam | low | mitigate | CLOSED (surface removed) | 52-36 gate was inside per-title session gate (52-36 SUMMARY); forwarded notice removed; same once-per-(app,step) gate on successor dialog at games.ts:4168-4177 before notify/dialog. |
| T-52-147 | 52-36 | Elevation of Privilege | locked boundary | high | mitigate | CLOSED | `git log --grep='(52-36)' --name-only`: 99798077c/1b2b4ab69 (games.ts/test), 8fdd8cdb2 (main.rs, notification_backend.rs, dialog.ts, platform/index.ts, sidecarTransport.ts), 40e7093a9 (notification_backend.rs, notificationFailureLogging.test.ts), ff6766369 (docs) = the planned eight files, no bridge/forwarder/shim/helper/registry code. |
| T-52-148 | 52-37 | Repudiation | launch-mode claim | medium | mitigate | CLOSED | UAT:321 item 32 records bundle freshness greps (`accepted by UserNotifications` x2, `dispatched=` x2 in bundled sidecar; `user-notifications` x3 in shell), no raw gamelib-shell running, launch-mode scoring rule in expected (UAT:320). |
| T-52-149 | 52-37 | Repudiation | item-31 carry | medium | mitigate | CLOSED | UAT:321 carries steam://run conjunct on the 52-36 git-log gate; re-verified now (name-only list above). |
| T-52-150 | 52-37 | Information Disclosure | log excerpts | medium | mitigate | CLOSED | SteamID64 grep 0 hits. |
| T-52-151 | 52-37 | Tampering | product bottle | high | mitigate | CLOSED | 52-37 SUMMARY: preflight read-only, no harness run this round (key-files docs only). |
| T-52-152 | 52-37 | Elevation of Privilege | locked boundary | high | mitigate | CLOSED | 52-37 key-files: UAT/deferred/STATE/ROADMAP + new todo only; no code. |
| T-52-SC | 52-03 | Tampering | package installs | n/a | accept | CLOSED (accepted) | accepted risk: no npm/pip/cargo install in plan 52-03 (Package Legitimacy Audit: none). |

*Status: CLOSED = mitigation verified in current code or recorded evidence · CLOSED (surface removed) = component deleted after Phase 52 · CLOSED (accepted) = see Accepted Risks Log*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-52-01 | T-52-05 | the helper's own InitFlat pipe is never handed out (shim SteamAPI_GetHSteamPipe stays constant); calls are FWD-logged and watched in the live gate (52-11) | plan 52-01 | 2026-11-04 |
| AR-52-02 | T-52-25 | calls the game's own pFn exactly as the SDK does; NULL-checked; no shim state beyond a constant counter | plan 52-07 | 2026-11-04 |
| AR-52-03 | T-52-33 | launch proceeds (behaves as today) rather than blocking the user; the notice explains the likely exit | plan 52-09 | 2026-11-04 |
| AR-52-04 | T-52-53 | any in-process caller that sets the flag only gets the stricter forwarded behaviour (NULL instead of the null object); this grants no capability | plan 52-14 | 2026-11-04 |
| AR-52-05 | T-52-54 | deferred and recorded in deferred-items.md by 52-16; each family's dispatch gate still blocks method calls | plan 52-14 | 2026-11-04 |
| AR-52-06 | T-52-57 | a refreshed shim with gaps may still fail in-game; placed-miss names the gaps, and the existing bridge-limited notice surfaces them | plan 52-15 | 2026-11-04 |
| AR-52-07 | T-52-77 | the named real-profile arm: the helper must reach the operator's Mac Steam; it writes only to the session dir in /tmp | plan 52-19 | 2026-11-04 |
| AR-52-08 | T-52-138 | the line carries only the appId and a fixed reason; no SteamID, persona or token | plan 52-34 | 2026-11-04 |
| AR-52-09 | T-52-145 | value is a fixed `&'static str` from a pure fn; the shim passes through only strings (`typeof result === 'string'`), else undefined | plan 52-36 | 2026-11-04 |
| AR-52-10 | T-52-SC | no npm/pip/cargo install in this plan (RESEARCH Package Legitimacy Audit: none) | plan 52-03 | 2026-11-04 |

*AR-52-05 (WR-08, identity-only bypass via `GetISteamGenericInterface` / CONTROL slot 3) is now moot as well: slot 3 was retired in Phase 56 and is refused as an unknown slot (`NB/helper/bridge_helper.c:138`).*

---

## Unregistered Flags

None. No 52-NN-SUMMARY.md has a `## Threat Flags` section.

---

## Evidence Hygiene

- SteamID64 grep (`7656119[0-9]{10}`) over `P/` and `.planning/todos/`: 0 hits.
- `git ls-files` contains no `.pfx`/`.p12`/`.key`/`.pem` files and no tracked DLLs; option-sign was never chosen (T-52-104).
- `52-25-DIAGNOSIS.md` and `52-30-DIAGNOSIS.md` contain only `objdump -p` header output: no disassembly, unpacked stub, or `.bind` decode, and no certificate serials or thumbprints.
- Live gate captures under `/tmp/gamelib-gate-52*` are not in the repo; sha256 and registry-hygiene claims for T-52-66/72/90 rest on the committed UAT/SUMMARY records (no contradicting evidence found).

---

## Notes (non-blocking)

- **T-52-94 (UAT completion):** `52-UAT.md` is `status: complete` although items 17-19 were skipped and item 20 passed with a Friends caveat. The done-when was formally amended 2026-10-24 (item 29 `amendment-approved:`, items 30-32 `bridge-verified: not claimed`), and the forwarding todo remains pending. A documentation deviation, not a code gap.
- **Item 32 notification authorization:** `granted=false` vs the operator's report that notifications are enabled is unresolved; not a security gap.
- **Out of scope:** Phase 56's DRM staging (`S/drm/stageDrmBottle.ts`, the live ActiveProcess registry writer) and the steamstub -> DRM-mode route (`S/bridge/bridgeRoute.ts:114`) belong to Phase 56's register and were not audited here.

---

## Open Items

None.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-04 | 153 | 153 | 0 | gsd-security-auditor x3 (Claude): 107 verified, 34 surface removed, 10 accepted, 2 closed with notes |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-04
