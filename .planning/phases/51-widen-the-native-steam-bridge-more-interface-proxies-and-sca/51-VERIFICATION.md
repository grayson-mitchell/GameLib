---
phase: 51-widen-the-native-steam-bridge-more-interface-proxies-and-sca
verified: 2026-10-22T00:00:00Z
status: gaps_found
score: 3/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Most Windows-only Steam games on macOS run through the bridge; bottled Steam is the fallback for a measured residue (ROADMAP goal)"
    status: failed
    reason: "Census reports '3 of 6 routed (bridge=3, known-bad=1, missing-symbols=1, unknown-version=1)', but routed is not runs. Of the 3 routed, only Avernum 6 plays; Avernum 5 is unplayable under wine (seed kept by operator decision); ELEX fails at boot; Avernum 4 was installed via bottled Steam. Effective working set is 1 of 6 (2 counting Avernum 5 loosely). Mechanism (per-game bottles, scan-derived routing, fallback) works; the 'most' outcome is not shown."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/shimCoverage.ts"
        issue: "SHIM64_SERVED_INTERFACE_VERSIONS serves SteamUser019/SteamApps008/SteamUtils008/SteamClient017 as stub only"
    missing:
      - "Win64 core interfaces wired after a live accessor probe (todo 2026-10-22-wire-win64-core-steam-interfaces.md)"
      - "Census must count only titles proven to run; re-run on a representative owned library (6 titles, 1 working, is too small and too Spiderweb-weighted)"
  - truth: "D-51-14 acceptance: Hoard (63000) playable through the bridge (24-UAT Gate 4 re-run)"
    status: failed
    reason: "UAT item 4: Hoard crashes under wine regardless of the bridge. Bridge half passed (LISTEN/INIT/HELLO, stubbed notice). Part B (USER/FRIENDS dispatch) never observed. The locked acceptance anchor is unmet and no replacement anchor was nominated."
    artifacts: []
    missing:
      - "Operator decision to retire Hoard as anchor, plus a replacement title proven to run with Apps/UserStats/RemoteStorage via the bridge"
      - "Add 63000 to knownBad with item 4 as evidence (UAT says Task 2 should; allowlist currently lists only 200510)"
  - truth: "Acceptance title per added interface (Apps, UserStats, RemoteStorage) runs through the bridge (D-51-14)"
    status: failed
    reason: "XCOM is CEG DRM (knownBad drm-wrapped, confirmed only by a cx-log trace; bottled-Steam confirmation todo still open). ELEX fails 'not subscribed' because Win64 core interfaces are stub-only. No gate shows a non-Avernum title playing."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/bridge-allowlist.json"
        issue: "seed has only Avernum 5 and 6, the same two as before the phase; seed growth is the stated phase growth mechanism and produced zero new entries"
    missing:
      - "At least one non-Spiderweb title demonstrated to play via the bridge"
  - truth: "Prescreen (D-51-06/17) classifies depots by steam_api dll arch before install"
    status: failed
    reason: "screenDepotPlanForSteamApi (depot.ts:~951) uses POSIX basename() on backslash depot paths, so any steam_api*.dll in a subfolder returns 'none'. Live: Hoard, XCOM, ELEX all logged result=none. Code confirmed still present in the repo. Review CR-04 also notes exe-only scans send runtime-loaded steam_api titles to the bridge with no shim and erase prescreen evidence."
    artifacts:
      - path: "src/backend/storeManagers/steam/depot.ts"
        issue: "basename(file.filename) does not split on backslash"
    missing:
      - "Normalise separators before basename (todo 2026-10-22-bridge-prescreen-always-returns-none.md)"
      - "Fix review CR-04"
  - truth: "Quitting a bridge game frees its per-game helper (D-51-01/D-51-03 lifetime)"
    status: failed
    reason: "UAT item 2: on first launch the helper kept LISTENing 6m39s after the game was gone; bridge process monitor starts only after runWineCommand resolves (game exit). Subsequent launches stop the previous helper late, so helpers leak."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "fireBridgeWineLaunch awaits wine child before starting monitor"
      - path: "src/backend/storeManagers/steam/bottleProcessMonitor.ts"
        issue: "monitor start ordering"
    missing:
      - "Start monitor without awaiting the wine child (todo 2026-10-22-bridge-process-monitor-starts-after-game-exits.md)"
  - truth: "Persisted scan verdict is correct and stable (D-51-07)"
    status: failed
    reason: "Code review CR-01 (isScanVerdictNowCovered ignores arch; a persisted miss auto-clears and loops a full re-download), CR-02 (Matchmaking bare accessors return NULL because family casing differs between backend and shim; confirmed by the orchestrator), CR-03 (x64 coverage reports unserved bare-accessor version as stubbed while shim returns NULL). 51-REVIEW.md lists no resolution commit for these; only 18ac8cda1 (regression gate) landed after. Verify and fix before closing."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/shimCoverage.ts"
        issue: "arch-blind isScanVerdictNowCovered; stubbed vs NULL mismatch on x64"
    missing:
      - "Fix CR-01..CR-04 or record explicit overrides/deferrals"
  - truth: "D-51-16 Waiting for Steam names the detected cause"
    status: partial
    reason: "Waiting state appears within ~20s and clears (verified live) but cause=login is never named for a sign-in prompt and self-update download phase is unnamed (classifyBottledSteamBlock too narrow). Minor."
    artifacts:
      - path: "src/backend/storeManagers/steam/bottleLaunchSignals.ts"
        issue: "matches only LogonFailure and 'Installing update...'"
    missing:
      - "Sign-in prompt and update-download detection"
human_verification: []
---

# Phase 51: Widen the native Steam bridge — Verification Report

**Phase Goal:** Most Windows-only Steam games on macOS run through the Phase 24 bridge in their own per-game bottle; the shared Phase 17 `GameLibSteam` bottle becomes the fallback for a measured residue instead of the default.
**Status:** gaps_found
**Re-verification:** No, initial.
**Contract note:** The ROADMAP lists requirements as TBD and no IDs were minted. The contract used is the ROADMAP goal and sub-decisions, the plan must_haves, and CONTEXT D-51-* decisions. I did not read all 19 PLAN/SUMMARY files line by line; the verdict leans on the live UAT (13 gates on real hardware), the code review, and spot checks of the repo (below).

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Per-game bridge bottles, per-game helper with real AppID and ephemeral port (D-51-01/03) | VERIFIED | UAT 1, 7 pass: distinct helpers/ports, real SteamID, HELLO/INIT |
| 2 | Eligibility is scan-derived, persisted, with known-bad and D-05 fallback (sub-decision 2) | VERIFIED (mechanism) / WARNING | Route resolver, verdict store, census and UAT 8/10 show the mechanism. CR-01/02/03 undermine correctness; UAT 9 skipped so route-notice dialog not exercised live |
| 3 | Route visibility and force-bottled toggle (D-51-09/10), remove-all-copies bottle cleanup (D-51-12), 480 identity fallback (D-51-04) | VERIFIED | UAT 8, 10, 12 pass |
| 4 | Interface set widened so the Hoard set works; Hoard Gate 4 playable (sub-decision 1, D-51-14) | FAILED | UAT 4: Hoard crashes under wine; Part B unobserved |
| 5 | Win64 hazard (a): fail closed and 64-bit shim reachable | FAILED (partial) | Shim64 builds, loads and attaches (ELEX HELLO), but core interfaces stub-only, so ELEX cannot run; prescreen misses subfolder dlls |
| 6 | "Most" measured, bridge default, bottled Steam is residue (D-51-15, goal) | FAILED | 3 of 6 routed, ~1 of 6 plays. Residue is the majority in practice |
| 7 | Helper lifetime tied to game | FAILED | UAT 2 teardown leak |

**Score:** 3/7 (truths 1, 3 fully; 2 counted verified mechanism-only).

## Spot checks against the repo (not taken on faith)

- `depot.ts` ~951: `basename(file.filename)` still present, so the prescreen backslash bug is real and unfixed.
- `shimCoverage.ts` 268-280: Win64 `SteamUser019`, `SteamUtils008`, `STEAMAPPS_INTERFACE_VERSION008`, `SteamClient017` are `mode: 'stub'`; only UserStats011 is wired. Matches the ELEX failure.
- `bridge-allowlist.json`: seed still Avernum 5 and 6 only; knownBad has only 200510 (Hoard not added despite UAT note).
- Thirteen `2026-10-22-*` todos exist under `.planning/todos/pending/` (13 counted).
- Regression gate: not re-run by me; I accept the orchestrator's account that the residual failures predate the phase or are load flakes.

## Anti-patterns / blockers

- Review CR-01..CR-04 are open blockers unless resolved (no evidence of resolution).
- `deferred-items.md` records pre-existing lint ceiling and test failures; informational.

## Deferred items

None matched. No later milestone phase was confirmed to cover Win64 core interfaces or non-Spiderweb acceptance; I did not find explicit coverage, so these remain gaps.

## Gaps Summary

The infrastructure half of the phase is delivered and live-verified: per-game bottles, scan-derived routing, known-bad list, UI route visibility, census tooling. The outcome half is not. The phase goal is that most Windows-only titles run through the bridge, and across the six titles measured, one (Avernum 6) demonstrably plays. The locked acceptance anchor (Hoard) fails for a reason outside the bridge, but the acceptance set was never substituted with a title that works. Recommend `/gsd-plan-phase 51 --gaps` for: (1) CR-01..04 fixes, (2) prescreen separator fix, (3) monitor-start ordering, (4) Win64 core-interface wiring with live probe and ELEX re-gate, (5) acceptance re-baseline: retire Hoard (add to knownBad), nominate a replacement, and make the census distinguish routed from verified-running. Gap 7 (waiting-cause naming) is minor and could be deferred by explicit override.

Overrides available if the operator accepts them: Hoard-as-anchor (alternative evidence: bridge half passes, crash is wine-level) is a plausible override once a replacement or explicit retirement is recorded.

---
_Verified: 2026-10-22_
_Verifier: Claude (gsd-verifier)_
