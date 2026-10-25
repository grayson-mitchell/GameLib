---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
verified: 2026-10-25T12:00:00Z
status: gaps_found
score: "1/4 roadmap truths verified; done-when NOT met (9 of 18 verified, bar 10, majority: no)"
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "9 of 18 verified (1/4 roadmap truths)"
  gaps_closed:
    - "GameServer012 GetPublicIP flat fallback memset corruption (prior CR-01): generated shim now NULL-guards, dispatches the 012 instance through vt[36], returns NULL for 014/015 (steam_api_shim.c:23511-23518)"
    - "Census regex forgeability (prior WR-01) and WR-02..WR-06 per 53-GAP2-REVIEW fixed-list"
    - "Overlooting 3410180 moved from rip=0 crash to menu with HELLO + 1 identity call (nvapi64 override, 53-19)"
  gaps_remaining:
    - "Done-when majority: 9 of 18, still one short of 10 (re-run in this verification)"
    - "Overlooting 3410180 has 1 game call, needs 2"
    - "D-53-15 init-only rule (Avernum 6 206060) decided but not implemented"
  regressions: []
gaps:
  - truth: "Done when the census Evidence column reads verified for a majority of the Steamworks-using titles in a re-run sample containing these seven"
    status: failed
    reason: "Re-ran pnpm bridge-census in this verification: '9 of 18 Steamworks-using rows verified (majority: no)'. Bar is 10. Same nine rows as 53-16 (1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 230070, 427410, 648410). Of the roadmap's seven, five verify; Overlooting is 'unverified (1 game call; needs 2 incl. identity)' and Ranch Simulator is 'unverified (no HELLO)'. Criterion not relaxed; nothing rerouted to bottled Steam."
    artifacts:
      - path: "meta/bridgeCensus.ts"
        issue: "Measured: 200510/206020 no bottle; 1119730, 284100 no HELLO; 206060, 219990 no game-originated call; 3410180 and 411300 one call; 648800 no game log."
    missing:
      - "Any one additional verified row reaches 10: Overlooting (second distinct game call; empty Username in godot.log, no GetPersonaName trace; find the stubbed slot or missing version slot, D-53-06/D-53-03), or Avernum 6 via D-53-15, or 284100 (no HELLO, cause unknown)."
  - truth: "D-53-15: init-only titles count HELLO + shim-logged game SteamAPI_Init success"
    status: failed
    reason: "Decision recorded in 53-CONTEXT.md (commit 7436d24a1) but no implementation: grep for D-53-15/initOnly in meta/, native/, src-tauri/ finds nothing. Census still prints '206060 unverified (no game-originated call)'. Must be limited to rows whose steam_api imports name only init/shutdown; helper-originated init and In-Game never count; failed/missing init line is unverified."
    artifacts:
      - path: "meta/bridgeCensus.ts"
        issue: "No init-only branch; no consumer of a shim init-success trace line."
      - path: "native/steam-bridge (x86 and x64 shim)"
        issue: "Shim does not log the return value of the game's own SteamAPI_Init / InitSafe / InitFlat as a trace line (not found)."
    missing:
      - "Shim: log SteamAPI_Init/InitSafe/InitFlat return from the game process (x86 + x64)."
      - "Census: accept HELLO + that line only when the shared runtime scan shows steam_api imports limited to init/shutdown; tests including negative cases (extra imports, failed init, helper-originated). Note: even with this, 9+1 = 10 of 18, which is exactly the bar, so Avernum 6 alone would reach the majority if it verifies live; denominator stays 18."
  - truth: "emitHiddenFallback is fail-closed for every return kind of a dropped RAX-form version (53-GAP2-REVIEW WR-01)"
    status: partial
    reason: "Only params.length>0 is checked; zero-param dropped versions with class/float/double/void returns get the integer-scalar emission and would write through an arbitrary RDX or return garbage. Unreachable from today's manifests (only 012 uint32). Latent, same class as the fixed prior CR-01."
    artifacts:
      - path: "meta/gen_vtables.ts"
        issue: "emitHiddenFallback ~2021-2048 lacks a return-class guard; no test for zero-param class/float/void drop."
    missing:
      - "Fail closed at generation time (throw) for non-scalar return kinds; add gen_vtables tests."
  - truth: "bottleDllOverrides reports failure when the override registration did not succeed (53-GAP2-REVIEW WR-02)"
    status: partial
    reason: "Failure detection checks only a truthy exit code, so missing/null code (signal kill, spawn error) is treated as success and the nvapi64 fix can silently not apply. The Overlooting fix depends on this path."
    artifacts:
      - path: "bottleDllOverrides (53-19 change; see 53-GAP2-REVIEW.md WR-02)"
        issue: "success inferred from absence of truthy code."
    missing:
      - "Treat exit code !== 0 (including null/undefined) as failure and log it; add test."
human_verification: []
---

# Phase 53: Steam bridge coverage (modern-SDK exports, flat API) Verification Report

**Phase Goal:** Engine-wrapper titles using the native Steam bridge get Steam initialised inside the game (HELLO + clean game-side init log; no log = unverified; In-Game never counts). Done when the census Evidence column reads `verified` for a majority of Steamworks-using titles in a re-run sample containing the seven.
**Verified:** 2026-10-25
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure plans 53-17..53-20

## Goal Achievement

I re-ran `pnpm bridge-census` myself (read-only). Output: `17 of 18 routed to the bridge; 9 of 18 verified running through the bridge` and `9 of 18 Steamworks-using rows verified (majority: no)`. Bar is 10. It matches the 53-20 SUMMARY and UAT "Done-when (53-20)". The criterion was not relaxed; nothing was rerouted to bottled Steam.

Verified rows: 1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 230070, 427410, 648410.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Done-when: majority (>=10/18) verified | FAILED | 9/18 measured, unchanged from 53-16 |
| 2 | Modern-SDK four (Hell Clock, Mining Mechs, Overlooting, Ranch) | FAILED (2 of 4) | Hell Clock and Mining Mechs verified. Overlooting: HELLO + 1 call (progress: crash fixed). Ranch: no HELLO, SteamStub class |
| 3 | Flat-API three (Vampire's Fall, Planet Crafter, Rogue Waters) | VERIFIED (3 of 3) | all `verified` in census. Caveat: Planet Crafter menu disappears (JoinFriend exception, todo created) and Mining Mechs shows error dialogs; census criterion is met but the experience is degraded |
| 4 | Census verdict honest for the managed (DllImport) class | VERIFIED | regex anchoring (WR-01) and carry/stale-log fixes landed per 53-GAP2-REVIEW; ELEX correctly demoted |

Score: 1/4 roadmap truths.

### Gap closure since last verification
- GameServer012 `GetPublicIP` hazard fixed: confirmed in generated `native/steam-bridge/generated/steam_api_shim.c:23510-23518` (NULL guard, 012 dispatch via `vt[36]`, NULL for 014/015 before the `memset`).
- Overlooting's rip=0 NvAPI crash fixed (53-19 `nvapi64` override); it now reaches the menu but only one distinct game call is traced.
- No row changed status in the census, so the phase goal is no closer by the metric.

### Decision coverage (D-53-01..D-53-15)

| Decision | Status | Note |
|----------|--------|------|
| D-53-01 flat export per method | IMPLEMENTED | GetPublicIP fallback fixed; non-scalar fallback generalisation latent (WR-01) |
| D-53-02 generations by census | IMPLEMENTED | |
| D-53-03 manifests serve vtable+flat | IMPLEMENTED | |
| D-53-04 managed scan | IMPLEMENTED | |
| D-53-05 flat proxies slot | IMPLEMENTED | |
| D-53-06 fix zeros when measured | IMPLEMENTED | next candidate: Overlooting name call |
| D-53-07 unknown version NULL | IMPLEMENTED | |
| D-53-08 x64 null-object fallback | VERIFIED | |
| D-53-09 measure x86 | VERIFIED | 0 x86 titles needing modern/flat |
| D-53-10 AnyCPU as x64 | IMPLEMENTED | |
| D-53-11 UE5 versions | PARTIAL | Manor Lords, Colony Ship, Abiotic verified; Ranch Simulator not |
| D-53-12 census shares scan | IMPLEMENTED | |
| D-53-13 per-engine evidence + trace | IMPLEMENTED | strict; anchored |
| D-53-14 sample of nine | MET | |
| D-53-15 init-only titles count shim init success | NOT IMPLEMENTED | decided 2026-10-25; no code (see gap) |

### Behavioral spot-check

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Done-when census | `pnpm bridge-census` | `9 of 18 ... (majority: no)` | FAIL |
| GetPublicIP fallback guard | read generated shim 23510-23518 | guards present | PASS |

### Anti-patterns / notes
- Code review 53-GAP2-REVIEW: status issues_found, 0 critical, 2 warnings (carried as gaps above), 4 info (IN-01 stale "not dispatched" comment, IN-02 unterminated char* on skip/failure paths, IN-03 HELLO acceptance inconsistency, IN-04 override keyed on hard-coded exe basename): advisory.
- Known full-suite failures (findDeadcode, testContainment, genI18nGateScope, machineFillGamelib) originate from phase 52 / quick-261024, not attributed to phase 53. Not re-run here.
- Out of scope for this phase: SteamStub DRM (Raft 648800, Grim Dawn 219990, Ranch 1119730 are Phase 52), known-bad (ELEX 411300, XCOM 200510), Planet Crafter JoinFriend, Abiotic loading hang (tracked todos).
- Missing REQUIREMENTS.md is not a failure.

## Gaps Summary

The done-when is unmet by exactly one row, unchanged across three gap rounds. Three routes to 10: (1) Overlooting needs a second distinct game call (empty Username with no GetPersonaName trace suggests a stubbed or unserved slot after GetSteamID); (2) implement D-53-15 so Avernum 6 206060 can verify with HELLO + shim-logged SteamAPI_Init success (restricted to init/shutdown-only importers), which on its own would give exactly 10 of 18 if it verifies live; (3) diagnose Unclaimed World 284100 (no HELLO). Recommend a next gap plan covering D-53-15 implementation plus the Overlooting second-call investigation, with the two review warnings (WR-01 emitHiddenFallback return-class guard; WR-02 bottleDllOverrides exit-code handling, which the Overlooting fix depends on) folded in, then a live re-run.

_Verified: 2026-10-25_
_Verifier: Claude (gsd-verifier)_
