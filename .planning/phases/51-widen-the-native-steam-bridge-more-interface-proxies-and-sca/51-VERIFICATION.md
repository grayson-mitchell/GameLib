---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
verified: 2026-10-24T00:00:00Z
amended: 2026-10-25T00:00:00Z
status: passed
score: 7/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "Prescreen classifies depots by steam_api dll arch (2ba070588, 1df09a29d; live result=x64 on a subfolder DLL, item 19; todo closed)"
    - "Helper lifetime tied to game (b8a020087, b6012f368; todo 2026-10-22-bridge-process-monitor-starts-after-game-exits.md completed)"
    - "Persisted scan verdict correct and stable, CR-01..CR-04 (e56b66d7e, a3e2cc099, 1df09a29d)"
    - "D-51-14 acceptance anchor re-baselined: Hoard to knownBad does-not-run, replacement anchor The Age of Decadence 230070 passes (item 18)"
    - "XCOM CEG diagnosis confirmed through bottled Steam (item 17); 200510 knownBad drm-wrapped; CEG detection landed (br4)"
    - "Census separates routed from verified running; dual-arch scan fixed (quick 261024-f0w, 1b2f315b3, 4f65448a4)"
    - "Win64 core interfaces wired (547055ad6); ELEX now fails past the handshake and is knownBad does-not-run"
    - "Most Windows-only Steam games run through the bridge (ROADMAP goal, D-51-15): CLOSED 2026-10-25 by Phase 53. 10 of 18 verified running under the strict criterion, majority (53-VERIFICATION.md status passed, done-when MET; commits 271edc1c4, 4c17d5a9a). Operator 2026-10-25: 'lets close out phase 51. we have 10 passed games'"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
human_verification: []
---

# Phase 51: Widen the native Steam bridge: Verification Report

**Phase Goal:** Most Windows-only Steam games on macOS run through the Phase 24 bridge in their own per-game bottle; the shared Phase 17 `GameLibSteam` bottle becomes the fallback for a measured residue instead of the default.
**Verified:** 2026-10-24
**Status:** passed (amended 2026-10-25; was gaps_found 2026-10-24)
**Re-verification:** Yes, after gap-closure plans 51-20 through 51-30.

## Amendment 2026-10-25: gap closed by Phase 53

The one remaining gap, "Most Windows-only Steam games on macOS run through the bridge; bottled Steam is the fallback for a measured residue (ROADMAP goal, D-51-15)", was recorded NOT met on 2026-10-24, option unmet-follow-up. Original reason text, verbatim from the removed `gaps:` entry: "Operator decision 2026-10-24 (51-UAT items 19 and 20, 51-30-SUMMARY, STATE.md): recorded NOT met, option unmet-follow-up. Strict criterion (HELLO plus clean game-side Steam init; no game log is unverified; Mac Steam In-Game never counts). Closing census over the 19 installed titles: N=18 routed to the bridge, K=0 verified running, M=19 (1 init-failed, 18 unverified; 2 play recorded in the allowlist; 15 of 19 symbols covered by the static scan). Accepted, not re-litigated."

The follow-up is Phase 53 (`.planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-VERIFICATION.md`, status passed): 10 of 18 verified running on the same strict criterion, majority yes. Two titles were deferred by user-accepted override in Phase 53: Overlooting 3410180 to a pending todo, Ranch Simulator 1119730 to SteamStub/Phase 52. The operator closed Phase 51 on 2026-10-25: "lets close out phase 51. we have 10 passed games".

The 2026-10-24 re-verification had moved the score from 3/7 to 6/7; this amendment moves it to 7/7 and status from gaps_found to passed. The census numbers inside the original report below (N=18, K=0, M=19) are the 2026-10-24 measurement and are kept as history.

_(Historical, 2026-10-24; superseded by the 2026-10-25 amendment.)_ **Why `gaps_found` and not `human_needed`:** the one remaining item is not a pending human check. It is a recorded, observable failure of a must-have (K=0 of M=19), accepted by the operator as unmet and tracked to a follow-up phase. No human verification items remain (UAT pending: 0). `gaps_found` is the honest status; it is the explicit acceptance, not a hidden failure. Summary: the phase ships its mechanism; the "most" goal is unmet by recorded operator decision.

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Per-game bridge bottles, per-game helper with real AppID and ephemeral port (D-51-01/03) | VERIFIED | UAT 1, 7 (prior); AoD run in `GameLibSteamBridge-230070` with HELLO appid=230070 (item 18) |
| 2 | Eligibility is scan-derived, persisted, with known-bad and fallback (sub-decision 2) | VERIFIED | CR-01/03 fixed e56b66d7e (arch-scoped), CR-02 a3e2cc099, CR-04 1df09a29d; 12 of 12 sampled titles routed with recorded persisted verdicts (item 19) |
| 3 | Route visibility, force-bottled toggle, bottle cleanup, 480 fallback (D-51-09/10/12/04) | VERIFIED | UAT 8, 10, 12 (prior), unchanged |
| 4 | Interface set widened; D-51-14 acceptance anchor demonstrated (Apps/UserStats/RemoteStorage) | VERIFIED | Hoard retired to knownBad (63000 does-not-run); replacement anchor AoD 230070 passes item 18 (main menu, in-game, 452s) with allowlist entry present. Anchor played on its x64 runtime-lookup path, noted in the allowlist entry |
| 5 | Win64 hazard (a): fail closed, 64-bit shim reachable, core interfaces wired | VERIFIED | 547055ad6 wires SteamUser019/Friends015/Utils008/Apps008; AoD64 attaches via the 64-bit shim. ELEX now fails past the bridge handshake (loading-screen hang), tracked as knownBad, a title defect not a wiring gap |
| 6 | Prescreen classifies by arch before install | VERIFIED | `depot.ts:955` now `basename(file.filename.replace(/\\/g, '/'))`; live `result=x64` for Rogue Waters 1691190 subfolder DLL; todo in `completed/` |
| 7 | Helper lifetime tied to game | VERIFIED | b8a020087 monitor starts before awaiting the wine child; todo completed. Residual quit behaviour is a separate pending todo (Stop is a no-op), not this truth |
| G | "Most" Windows-only games run through the bridge (D-51-15, ROADMAP goal) | VERIFIED (closed by Phase 53, 2026-10-25) | N=18, K=0, M=19 strict; operator "Unmet, follow-up phase (Recommended)"; closed: Phase 53 10 of 18 verified running, majority (53-VERIFICATION.md) |

**Score:** 7/7 must-haves verified (amended 2026-10-25; was 6/7 with G failed-accepted on 2026-10-24).

## Closure checks requested

| Gap | Result | Evidence |
|---|---|---|
| AoD 230070 anchor (item 18) | CLOSED | Item 18 pass; `bridge-allowlist.json` seed contains 230070 with evidence string |
| XCOM CEG (item 17) | CLOSED | Item 17 pass: Enemy Within reaches menu under bottled Windows Steam; 200510 knownBad `drm-wrapped`; confirm-diagnosis todo completed |
| Prescreen todo | CLOSED | `todos/completed/2026-10-22-bridge-prescreen-always-returns-none.md`; absent from pending |
| Census dual-arch | CLOSED | quick 261024-f0w commits 4f65448a4, 1b2f315b3; closing census classifies every row |
| Hoard knownBad (prior gap) | CLOSED | knownBad now 200510 drm-wrapped, 63000 and 411300 does-not-run |

## Tests

Per the orchestrator, the bridge, census, shim-build and games suites ran green (741 tests, 16 suites); I did not re-run them. Pre-existing failures excluded by instruction: preload-surface-gate, lzmaNativeBinding, lzmaNativeSeaRealBuild, genI18nGateScope, machineFillGamelib, and two no-regex-spaces lint errors in `meta/__tests__/gen_vtables.test.ts`.

## Failing-title defect classes (tracked by pending todos; no new gaps opened)

- `2026-10-22-wire-win64-core-steam-interfaces.md` (ELEX hang past handshake)
- `2026-10-23-x64-shim-lacks-modern-sdk-steaminternal-exports-and-scan-misses-dll-importers.md`
- `2026-10-23-bridge-shim-lacks-steamworks-flat-api-for-unity-steamworks-net-games.md`
- `2026-10-24-bridge-scan-reads-unreal-bootstrap-exe-and-misses-the-shipping-binary.md`
- `2026-10-23-forwarding-steamclient-dll-for-steamstub-titles.md`
- `2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`
- `2026-10-24-stop-is-a-no-op-for-bridge-launched-games.md`
- `2026-10-23-wire-steam-bridge-launch-into-known-fixes.md`
- Bottled-route defects: `2026-10-23-bottled-launch-gives-up-after-20s-while-steam-is-still-starting-the-game.md`, `2026-10-23-bottled-route-restart-steam-to-finish-is-a-dead-end.md`, `2026-10-23-game-page-stuck-on-launching-after-bottled-steam-game-exits.md`, `2026-10-22-waiting-for-steam-misses-sign-in-prompt-and-update-download.md`
- Other: `2026-10-22-unresolved-cross-depot-file-collisions-leave-install-stuck-at-1026.md`, `2026-10-24-play-button-flickers-back-to-play-between-launching-and-playing.md`

## Anti-patterns

None blocking found in the spot checks. Census blind spot noted in item 20: static class labels can read `no-steam-api` for titles whose scan misses a loaded DLL (covered by the engine-layout/DLL-importer todos above).

## Gaps Summary

The mechanism half is delivered and verified: per-game bottles, scan-derived persisted routing, known-bad list, visible route, a strict-criterion census, and a working x64 path (AoD). All previously open defects (CR-01..04, prescreen, monitor ordering, anchor, census) are closed with commits and evidence. The outcome half, "most" games running through the bridge, is not achieved: 18 of 19 titles route to the bridge but none is verified running on the strict criterion. This is the operator's recorded decision (unmet-follow-up) and is not re-opened. Recommended next step: a follow-up phase scoped from the pending todos above, with the goal restated against the strict census. The "most" goal gap was closed 2026-10-25 by Phase 53 (see Amendment).

---
_Verified: 2026-10-24_
_Amended: 2026-10-25 (gap closed by Phase 53; operator close-out)_
_Verifier: Claude (gsd-verifier)_
