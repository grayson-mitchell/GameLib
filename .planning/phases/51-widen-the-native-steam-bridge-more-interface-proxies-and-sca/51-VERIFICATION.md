---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
verified: 2026-10-24T00:00:00Z
status: gaps_found
score: 6/7 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/7
  gaps_closed:
    - "Prescreen classifies depots by steam_api dll arch (2ba070588, 1df09a29d; live result=x64 on a subfolder DLL, item 19; todo closed)"
    - "Helper lifetime tied to game (b8a020087, b6012f368; todo 2026-10-22-bridge-process-monitor-starts-after-game-exits.md completed)"
    - "Persisted scan verdict correct and stable, CR-01..CR-04 (e56b66d7e, a3e2cc099, 1df09a29d)"
    - "D-51-14 acceptance anchor re-baselined: Hoard to knownBad does-not-run, replacement anchor The Age of Decadence 230070 passes (item 18)"
    - "XCOM CEG diagnosis confirmed through bottled Steam (item 17); 200510 knownBad drm-wrapped; CEG detection landed (br4)"
    - "Census separates routed from verified running; dual-arch scan fixed (quick 261024-f0w, 1b2f315b3, 4f65448a4)"
    - "Win64 core interfaces wired (547055ad6); ELEX now fails past the handshake and is knownBad does-not-run"
  gaps_remaining:
    - "Most Windows-only Steam games run through the bridge (ROADMAP goal): recorded NOT met by operator decision 2026-10-24, tracked to a follow-up phase"
  regressions: []
gaps:
  - truth: "Most Windows-only Steam games on macOS run through the bridge; bottled Steam is the fallback for a measured residue (ROADMAP goal, D-51-15)"
    status: failed
    reason: "Operator decision 2026-10-24 (51-UAT items 19 and 20, 51-30-SUMMARY, STATE.md): recorded NOT met, option unmet-follow-up. Strict criterion (HELLO plus clean game-side Steam init; no game log is unverified; Mac Steam In-Game never counts). Closing census over the 19 installed titles: N=18 routed to the bridge, K=0 verified running, M=19 (1 init-failed, 18 unverified; 2 play recorded in the allowlist; 15 of 19 symbols covered by the static scan). Accepted, not re-litigated."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/bridge-allowlist.json"
        issue: "seed is Avernum 5/6 plus AoD 230070 (AoD and Avernum 6 recorded as played with shim attached but unverified); no title meets the strict criterion"
    missing:
      - "Follow-up phase: Steam bridge coverage (modern-SDK exports, flat API, engine-layout scan, SteamStub forwarding); see pending todos below"
deferred: []
human_verification: []
---

# Phase 51: Widen the native Steam bridge: Verification Report

**Phase Goal:** Most Windows-only Steam games on macOS run through the Phase 24 bridge in their own per-game bottle; the shared Phase 17 `GameLibSteam` bottle becomes the fallback for a measured residue instead of the default.
**Verified:** 2026-10-24
**Status:** gaps_found
**Re-verification:** Yes, after gap-closure plans 51-20 through 51-30.

**Why `gaps_found` and not `human_needed`:** the one remaining item is not a pending human check. It is a recorded, observable failure of a must-have (K=0 of M=19), accepted by the operator as unmet and tracked to a follow-up phase. No human verification items remain (UAT pending: 0). `gaps_found` is the honest status; it is the explicit acceptance, not a hidden failure. Summary: the phase ships its mechanism; the "most" goal is unmet by recorded operator decision.

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
| G | "Most" Windows-only games run through the bridge (D-51-15, ROADMAP goal) | FAILED (accepted) | N=18, K=0, M=19 strict; operator "Unmet, follow-up phase (Recommended)" |

**Score:** 6/7 must-haves verified (G is the ROADMAP goal and is counted as the one failure; truths 1-7 are the plan contract).

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

The mechanism half is delivered and verified: per-game bottles, scan-derived persisted routing, known-bad list, visible route, a strict-criterion census, and a working x64 path (AoD). All previously open defects (CR-01..04, prescreen, monitor ordering, anchor, census) are closed with commits and evidence. The outcome half, "most" games running through the bridge, is not achieved: 18 of 19 titles route to the bridge but none is verified running on the strict criterion. This is the operator's recorded decision (unmet-follow-up) and is not re-opened. Recommended next step: a follow-up phase scoped from the pending todos above, with the goal restated against the strict census.

---
_Verified: 2026-10-24_
_Verifier: Claude (gsd-verifier)_
