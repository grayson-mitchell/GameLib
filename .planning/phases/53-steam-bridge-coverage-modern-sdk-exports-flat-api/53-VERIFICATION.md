---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
verified: 2026-10-25T01:00:00Z
status: gaps_found
score: "1/4 roadmap truths verified; done-when NOT met (9 of 18 verified, bar 10, majority: no)"
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "6 of 18 verified (1/4 roadmap truths)"
  gaps_closed:
    - "Flat-API three (Vampire's Fall 1167950, Planet Crafter 1284190, Rogue Waters 1691190) now verified; SteamScreenshots003 served"
    - "Hell Clock 1782460 and Mining Mechs 1603180 verified (Hell Clock was init-failed)"
    - "Abiotic Factor 427410 verified; stale-backup-log defect fixed"
    - "ELEX 411300 no longer counted verified (one-CALL rule tightened: needs 2 calls incl. identity)"
    - "Flat-export ABI defect for hidden-pointer returns (prior CR-01) fixed"
    - "Prior WR-01/WR-03/WR-04/WR-07/WR-08 review findings fixed"
  gaps_remaining:
    - "Done-when majority: 9 of 18, one short of 10"
    - "Overlooting 3410180 and Ranch Simulator 1119730 never reach HELLO"
    - "Avernum 6 206060 has no game-originated call"
    - "New review CR-01: GameServer012 GetPublicIP flat fallback memsets 20 bytes"
  regressions: []
gaps:
  - truth: "Done when the census Evidence column reads verified for a majority of the Steamworks-using titles in a re-run sample containing these seven"
    status: failed
    reason: "Re-ran pnpm bridge-census in this verification: '9 of 18 Steamworks-using rows verified (majority: no)'. Bar is 10 of 18. Unchanged from 53-16 claim; criterion not relaxed. Of the roadmap's seven, five verify (1167950, 1284190, 1603180, 1691190, 1782460); Overlooting 3410180 and Ranch Simulator 1119730 do not (no HELLO)."
    artifacts:
      - path: "meta/bridgeCensus.ts"
        issue: "Measured output: 200510/206020 no per-game bridge bottle; 1119730, 3410180, 284100 no HELLO; 206060, 219990 no game-originated call; 411300 one game call (known-bad); 648800 no game log."
    missing:
      - "Overlooting (Godot) rip=0 page fault before shim entry: diagnose the 0x0 call."
      - "Ranch Simulator (UE shipping exe) exits before HELLO: diagnose why shim is never entered (UE5 interface-versions todo kept open)."
      - "Avernum 6 (x86): reaches HELLO but no game-originated call; any one of these three reaches 10."
  - truth: "Shim never corrupts its own state for dropped/excluded flat-export versions (D-53-01/D-53-05 ABI correctness)"
    status: failed
    reason: "53-GAP-REVIEW CR-01 confirmed in generated output: native/steam-bridge/generated/steam_api_shim.c:23503 memset(ret, 0, 20) in SteamAPI_ISteamGameServer_GetPublicIP. A SteamGameServer012-era caller passes self in RCX as 'ret', so the fallback zeroes 20 bytes over g_steamgameserver012_instance (vtable pointer) and subsequent calls crash inside the shim."
    artifacts:
      - path: "meta/gen_vtables.ts"
        issue: "FLAT_UNREPRESENTABLE_CASES exclusion (~1661-1667, 2050-2099) falls through to memset(ret) with no guard for the dropped RAX-convention version."
    missing:
      - "Guard fallback: never write through ret when it is a shim instance; dispatch the 012 RAX-form through RCX or return 0. Add gen_vtables test."
  - truth: "Census evidence cannot be forged by game-supplied strings (strict criterion, D-53-13)"
    status: partial
    reason: "53-GAP-REVIEW WR-01: findGameCalls/findNover/appLogSegmentFor regexes are unanchored; FWD/NOVER lines carry game-supplied version strings. Checked actual logs (~/Library/Logs/GameLib/gamelib.log*): no FWD/NOVER line contains an embedded CALL/HELLO/NOVER payload, and sampled verified rows (230070, 1603180) have genuine helper CALL and HELLO lines. So none of the nine verdicts is shown to be forged today, but the defect is real and latent."
    artifacts:
      - path: "meta/bridgeCensus.ts"
        issue: "Lines ~832-878: substring match instead of category-anchored match."
    missing:
      - "Anchor CALL/NOVER/HELLO regexes to the attributed payload start; add injected-string test."
      - "Also WR-02 (pcbTicket independent of copied bytes), WR-03 (char* NUL off-by-one, latent), WR-04 (stale static out-buffer), WR-05 (line carry-over across stderr chunks)."
human_verification: []
---

# Phase 53: Steam bridge coverage (modern-SDK exports, flat API) Verification Report

**Phase Goal:** Engine-wrapper titles using the native Steam bridge get Steam initialised inside the game (HELLO + clean game-side init log; no log = unverified; In-Game never counts). Done when the census Evidence column reads `verified` for a majority of Steamworks-using titles in a re-run sample containing the seven.
**Verified:** 2026-10-25
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure plans 53-10..53-16

## Goal Achievement

I re-ran `pnpm bridge-census` (read-only) myself. Output: `17 of 18 routed to the bridge; 9 of 18 verified running through the bridge (HELLO + clean game log; 0 init-failed, 9 unverified)` and `9 of 18 Steamworks-using rows verified (majority: no)`. The bar is 10. This matches the 53-16 SUMMARY. The criterion was not relaxed and nothing was rerouted to bottled Steam.

Verified rows: 1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 230070, 427410, 648410.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Done-when: majority (>=10/18) verified | FAILED | 9/18 measured |
| 2 | Modern-SDK four (Hell Clock, Mining Mechs, Overlooting, Ranch) | FAILED (2 of 4) | Hell Clock and Mining Mechs verified; Overlooting, Ranch: no HELLO |
| 3 | Flat-API three (Vampire's Fall, Planet Crafter, Rogue Waters) | VERIFIED (3 of 3) | all three `verified` in the census |
| 4 | Census verdict honest for the managed (DllImport) class | PARTIAL | stale-log and one-CALL defects fixed; regex forgeability (WR-01) latent, not exploited in the real logs |

### Verdict integrity check (WR-01)

I grepped the real logs for FWD or NOVER lines containing an embedded `CALL`, `HELLO` or `NOVER ver=` payload and found none. Sampled non-Unity rows (Age of Decadence 230070: `SteamUser019.BLoggedOn`, `SteamUtils008.GetAppID`; Mining Mechs 1603180: several distinct genuine CALLs) have genuine helper-originated lines. The nine verdicts stand. Per the strict memory rule, non-Unity CALL-based verification relies on D-53-13 (the game-originated bridge call may count) and is not an in-game Steam-init log; this remains a softer bar for 230070, 1603180, 1363080 and 648410.

### Decision coverage (D-53-01..D-53-14)

| Decision | Status | Note |
|----------|--------|------|
| D-53-01 flat export per method | PARTIAL | hidden-pointer returns fixed; GetPublicIP fallback memset (new CR-01) |
| D-53-02 generations by census | IMPLEMENTED | SCREENSHOTS003 now served |
| D-53-03 manifests serve vtable+flat | IMPLEMENTED | stub zeroing fixed |
| D-53-04 managed scan | IMPLEMENTED | |
| D-53-05 flat proxies slot | PARTIAL | same GetPublicIP hazard |
| D-53-06 fix zeros when measured | IMPLEMENTED | SCREENSHOTS003, out-buffer marshalling (GetAuthSessionTicket) |
| D-53-07 unknown version NULL | IMPLEMENTED | |
| D-53-08 x64 null-object fallback | VERIFIED | |
| D-53-09 measure x86 | VERIFIED | 0 x86 titles needing modern/flat |
| D-53-10 AnyCPU as x64 | IMPLEMENTED | ILONLY fix reported by review |
| D-53-11 UE5 versions | PARTIAL | Manor Lords, Colony Ship, Abiotic verified; Ranch Simulator not |
| D-53-12 census shares scan | IMPLEMENTED | stale backup logs excluded |
| D-53-13 per-engine evidence + trace | PARTIAL | ELEX tightened; regex anchoring outstanding (WR-01) |
| D-53-14 sample of nine | MET | |

### Anti-Patterns / Gates

`pnpm planning-gates`: 11/12 when run before this file was rewritten (the sole failure was the old 53-VERIFICATION.md frontmatter parse at 4:82). This file's frontmatter quotes all free-text values so it parses as YAML; re-run the gate to confirm. Gap review (53-GAP-REVIEW.md): 1 critical, 6 warnings, 6 info; none fixed. No TBD/FIXME debt-marker scan was performed on phase files. Four pre-existing unrelated test suites reportedly fail (not re-run here).

## Gaps Summary

Real progress: 6 to 9 of 18, the three flat-API Unity titles, Hell Clock and Abiotic now verify, and the evidence column is more honest. The done-when is still unmet by one row. The shortest path is any one of Overlooting (Godot rip=0 crash), Ranch Simulator (UE exe exits before HELLO) or Avernum 6 (x86 HELLO but no game call). Separately, the new CR-01 memory-corruption path in the GameServer012 `GetPublicIP` flat fallback must be fixed, and the census regexes should be anchored (WR-01). Out of scope: SteamStub DRM (Raft, Grim Dawn, Phase 52) and Abiotic's loading hang (tracked todo).

_Verified: 2026-10-25_
_Verifier: Claude (gsd-verifier)_
