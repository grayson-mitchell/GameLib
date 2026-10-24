---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
verified: 2026-10-25T00:00:00Z
status: gaps_found
score: 1/4 roadmap truths verified (done-when NOT met; 6 of 18 verified, majority: no)
overrides_applied: 0
gaps:
  - truth: "Done when the census Evidence column reads `verified` for a majority of the Steamworks-using titles in a re-run sample containing these seven"
    status: failed
    reason: "Re-ran `pnpm bridge-census`: `6 of 18 Steamworks-using rows verified (majority: no)`. Needs 10. Of the roadmap's seven, only 2 verify (Planet Crafter 1284190, Mining Mechs 1603180)."
    artifacts:
      - path: "native/steam-bridge/generated/steam_api_shim.c"
        issue: "Flat lookup `STEAMSCREENSHOTS_INTERFACE_VERSION003` is not served (NOVER x5 across 1691190, 1167950, 1284190, 1782460). Rogue Waters, Vampire's Fall and Hell Clock log `[Steamworks.NET] SteamAPI_Init() failed`."
    missing:
      - "Serve SteamScreenshots003 (manifest + flat accessor) so Steamworks.NET SteamAPI_Init succeeds for Unity titles 1691190, 1167950, 1782460; re-measure."
      - "Rogue Waters still hangs at load; former misses SteamController, SteamController006, SteamUtils009 (stubbed:SteamUtils) did not resolve. Trace after init fix."
      - "Overlooting 3410180 (Godot): no HELLO, Wine crash page fault rip=0 inside overlooting.exe; shim never entered. Diagnose the 0x0 call (not a post-init Steam fault)."
      - "Ranch Simulator 1119730 (UE): shipping exe exits <1s code 0x35 before any HELLO or UE log (EOSBootstrapper). Diagnose why the shim is never entered."
      - "Unclaimed World 284100: missing export SteamAPI_InitSafe (old-SDK todo). Raft/Grim Dawn are SteamStub DRM (Phase 52 scope)."
  - truth: "Flat C API exports are ABI-correct for every manifest method (D-53-01/D-53-05)"
    status: failed
    reason: "CR-01: gen_vtables.ts emitFlatExports treats a leading `_ret` param on `returnKind: 'pointer'` methods as an ordinary arg and skips the `class && structSize > 8` guard (meta/gen_vtables.ts:1866). Confirmed in output: native/steam-bridge/generated/steam_api_shim.c:17994 `void * SteamAPI_ISteamInput_GetAnalogActionData(void *self, void * a1, uint64_t a2, uint64_t a3)` and :17494 `SteamAPI_ISteamGameServer_GetPublicIP(void *self, void * a1)`. On Win64 a >8-byte by-value return passes the hidden ret ptr in RCX and self in RDX, so the self-compare never matches, the caller's struct is never written and RAX is NULL."
    artifacts:
      - path: "meta/gen_vtables.ts"
        issue: "flatRetType/emitFlatCase (1665-1690, 1757-1795) and size guard 1866 do not recognise `_ret`-modelled sret. Affects SteamInput006 GetDigitalActionData/GetAnalogActionData/GetMotionData and SteamGameServer014/015 GetPublicIP."
    missing:
      - "Treat leading `_ret` on a pointer return as sret (emit `Flat(void *ret, void *self, ...rest)` forwarding self, ret, rest and returning ret) or throw / list as unrepresentable; add `structSize` to those manifests (InputDigitalActionData_t <=8 returns in RAX)."
      - "Gen test failing on any x64 manifest method with params[0].name === '_ret' lacking explicit handling."
      - "WR-01/WR-08: vtable stubs for `_ret` pointer methods return NULL instead of zeroing *_ret and returning it; SteamFriends018 `class`+`_ret` shifts args into a pointer slot. WR-07: guard must fail closed on missing structSize (`method.structSize === undefined || > 8`)."
  - truth: "Census Evidence column honestly reflects each title's current run (D-53-12/D-53-13)"
    status: failed
    reason: "Stale-log defect: findUnrealSavedLogs (meta/bridgeCensus.ts:1287-1312) globs every `Saved/Logs/*.log`, including `*-backup-<date>.log` from prior sessions; failure markers in the stale file win. Abiotic Factor 427410 reports `init-failed (UE SteamAPI init failed)` though the current log is clean (UAT item 9). Corrected count is 7/18, still no majority. The Unity finder (findUnityPlayerLogs, ~1179) has a comment claiming Player.log only, but Player-prev.log exposure should be confirmed in the same fix."
    artifacts:
      - path: "meta/bridgeCensus.ts"
        issue: "findUnrealSavedLogs reads *-backup-*.log (and any prior-run log); no newest-only / exclude-backup selection."
    missing:
      - "Exclude `*-backup-*.log` and Player-prev.log; pick only the latest-run log per project (mtime or exact `<Project>.log`); add a bridgeCensus test with a stale backup carrying failure markers beside a clean current log."
  - truth: "`verified` means the game really initialised Steam (strict criterion, phase 51)"
    status: failed
    reason: "ELEX 411300 (known-bad does-not-run) is counted `verified` on ONE game-originated CALL (STEAMAPPS_INTERFACE_VERSION008.BIsSubscribedApp) although the operator reports 'game hangs when loading' and placeShimForGame recorded a coverage miss on SteamGameServer012. The D-53-13 one-CALL rule is too weak: it inflates the count and would let a hanging title pass. Also WR-03 (CALL regex requires per-chunk prefix, false negatives), WR-04 (helper logs CALL before dispatch succeeds, false positives; bridge_helper.c:567-571)."
    artifacts:
      - path: "meta/bridgeCensus.ts"
        issue: "classifyBridgeEvidence/findGameCall: a single CALL promotes to verified for non-Unity engines; no check against known-bad/coverage-miss or NOVER/missing-symbol evidence."
      - path: "native/steam-bridge/helper/bridge_helper.c"
        issue: "CALL trace emitted before bridge_dispatch result known."
    missing:
      - "Require a minimum distinct-CALL set (e.g. init-class call plus >=N calls) or a post-CALL clean-window, and downgrade when scan coverage miss / known-bad / NOVER present; log CALL after STATUS_OK; split relayed stderr per line (helperProcess.ts:301-303)."
  - truth: "Abiotic Factor hang at loading (D-53-14 sample)"
    status: failed
    reason: "Not a pass in UAT item 9: clean Saved log but hangs at loading after `Failed to acquire Steam auth session ticket for 0` (hypothesis: ISteamUser GetAuthSessionTicket; forward via wire-policy.json)."
    artifacts: []
    missing:
      - "Gap plan to confirm and fix GetAuthSessionTicket path."
human_verification: []
---

# Phase 53: Steam bridge coverage (modern-SDK exports, flat API) Verification Report

**Phase Goal:** Engine-wrapper titles using the native Steam bridge get Steam initialised inside the game (HELLO + clean game-side init log; no log = unverified; In-Game never counts). Done when the census Evidence column reads `verified` for a majority of Steamworks-using titles in a re-run sample containing the seven.
**Status:** gaps_found
**Re-verification:** No (initial)

## Goal Achievement

Re-ran `pnpm bridge-census` (read-only): `17 of 18 routed to the bridge; 6 of 18 verified running through the bridge (HELLO + clean game log; 4 init-failed, 8 unverified)` and `6 of 18 ... (majority: no)`. This matches the 53-09 SUMMARY claim that the done-when line is NOT met. Verified rows: 1284190, 1363080, 1603180, 230070, 411300 (suspect), 648410.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Done-when: census `verified` for a majority (>=10/18) | FAILED | 6/18; 7/18 corrected for stale-log defect |
| 2 | Modern-SDK four (Hell Clock, Mining Mechs, Overlooting, Ranch) get in-game Steam init | FAILED (1 of 4) | Mining Mechs verified (by CALL rule, no engine log); Hell Clock init-failed; Overlooting and Ranch no HELLO |
| 3 | Flat-API three (Vampire's Fall, Planet Crafter, Rogue Waters) | FAILED (1 of 3) | Planet Crafter verified; Vampire's Fall init-failed; Rogue Waters init-failed + hang |
| 4 | Census verdict honest for managed (DllImport) class | PARTIAL | managedImports reader implemented and reviewed correct; but stale-log, one-CALL, CALL-regex defects make Evidence column unreliable |

### Decision coverage (D-53-01..D-53-14)

| Decision | Status | Note |
|----------|--------|------|
| D-53-01 flat export every method | PARTIAL | generated, but ABI wrong for `_ret` pointer methods (CR-01) |
| D-53-02 generations chosen by census | IMPLEMENTED | flat names manifest; unserved SCREENSHOTS003 still missed |
| D-53-03 manifests serve vtable+flat | IMPLEMENTED | WR-01/WR-08 stub defects |
| D-53-04 managed scan (Mono) | IMPLEMENTED | reader reviewed correct; WR-05 verdict arch mix |
| D-53-05 flat calls proxy slot | PARTIAL | broken for sret/`_ret` (CR-01) |
| D-53-06 fix zeros when measured | IN PROGRESS | measured: SCREENSHOTS003, SteamUtils009 stubbed, GetAuthSessionTicket; unfixed |
| D-53-07 unknown version NULL | IMPLEMENTED | NOVER trace observed live |
| D-53-08 x64 null-object fallback | VERIFIED | Manor Lords no 0x0 crash |
| D-53-09 measure x86 | VERIFIED | census: 0 x86 titles needing modern/flat |
| D-53-10 AnyCPU as x64 | PARTIAL | WR-02 ignores ILONLY |
| D-53-11 UE5 versions | VERIFIED | Manor Lords, Colony Ship verified |
| D-53-12 census shares scan | PARTIAL | stale-log defect, Raft/AoD notes |
| D-53-13 per-engine evidence + trace | PARTIAL | trace present (UAT 12); rule too weak (ELEX), WR-03/WR-04 |
| D-53-14 sample of nine | MET | all nine run in UAT; only 3 UE/Unity pass among them |

### Anti-patterns / review
CR-01 (blocker) and WR-01..WR-08 per 53-REVIEW.md; none addressed. Full `pnpm test:ci` shows 4 failed suites/6 tests (testContainment, findDeadcode, genI18nGateScope, machineFillGamelib/pluralCategoriesFor) reported unrelated to phase 53 and not independently re-run here.

## Gaps Summary

The tooling (exports, managed scan, census, trace) was built, but the goal outcome was not reached: 6/18 (needs 10). Root causes, in order of reach: (1) `STEAMSCREENSHOTS_INTERFACE_VERSION003` not served, failing SteamAPI_Init for three Unity titles; (2) Godot/UE titles never reaching HELLO (Overlooting page fault rip=0, Ranch exit 0x35); (3) the census Evidence column is itself unreliable (stale backup logs, one-CALL verified for ELEX, CALL regex/trace ordering); (4) CR-01 ABI defect in flat exports for Input/GameServer; (5) Abiotic Factor auth-ticket hang. Out of scope/other phases: SteamStub DRM (Raft, Grim Dawn, Phase 52), Unreal bootstrap scan miss.

_Verified: 2026-10-25_
_Verifier: Claude (gsd-verifier)_
