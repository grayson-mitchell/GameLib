---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
verified: 2026-11-16T08:00:00Z
status: gaps_found
score: 9/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A SteamStub title never launches in DRM mode over a bottle the Wine-Staging fallback engine initialised (ROADMAP goal / DEBT-01)"
    status: failed
    reason: "Pinned-engine bottle creation writes no .gamelib-engine.json. preflightCrossover's demo-status probe runs before prepareBottleForEngine and makes CrossOver add a Timestamp to cxbottle.conf, so inferMarker (engineSwitch.ts ~L422) infers 'crossover', identity matches, the marker is written silently (~L693) and {ok:true, changed:false} is returned. No switch runs; Staging DXVK-macOS stays; marker mislabelled crossover. Live UAT 2026-11-16 item 3 confirmed (no 'engine switch for ...' log line; current_dxvk-macOS unchanged). Same as 76-REVIEW CR-01. Affects every bottle the pinned engine creates at install today."
    artifacts:
      - path: "src/backend/engine/engineSwitch.ts"
        issue: "inferMarker trusts the Timestamp in cxbottle.conf, which CrossOver's own probe adds; marker-less bottle is mislabelled before comparison"
      - path: "src/backend/storeManagers/steam/gameBridgeLaunch.ts"
        issue: "preflightCrossover (L199) touches the bottle before prepareDrmBottleForCrossover (L208) runs"
      - path: "src/backend/storeManagers/steam/gameLaunch.ts"
        issue: "prepareDrmBottleForCrossover relies on marker/infer; unit tests seed markers and never exercise inferMarker"
    missing:
      - "Write the engine marker at pinned-engine bottle creation (provisionBridgeBottle), so a pinned bottle is never marker-less"
      - "Infer-and-persist the marker (before any CrossOver probe touches cxbottle.conf) ahead of drmOfflinePrecheck/preflightCrossover in the DRM branch"
      - "A test using the REAL engineSwitch against a temp bottle dir: marker-less pinned bottle, then cxbottle.conf gains Timestamp, then prepareBottleForEngine to crossover must switch (kill pinned wineserver, remove Staging DXVK) and log 'engine switch for'"
human_verification: []
---

# Phase 76: Engine-correct bottle for DRM-mode launches - Verification Report

**Phase Goal:** A SteamStub title never launches in DRM mode over a bottle the Wine-Staging fallback engine initialised (call prepareBottleForEngine in the DRM branch, or refuse with a clear message).
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DRM branch calls prepareBottleForEngine (next.kind crossover) after healthy preflight | VERIFIED (wiring) | gameBridgeLaunch.ts L187/L199/L208: drmOfflinePrecheck, preflightCrossover, prepareDrmBottleForCrossover |
| 2 | Every ok:false reason refuses the launch, one dialog, terminal done | VERIFIED | unit tests per 76-01 SUMMARY; code path present |
| 3 | Offline restore-needs-absent-pin refused before preflight | VERIFIED | drmOfflinePrecheck wired before preflightCrossover |
| 4 | Already-CrossOver bottle launches without dialog | VERIFIED | UAT item 4 (trivially) |
| 5 | DRM path never calls decideLaunchEngine / selection setters | VERIFIED | no calls in the branch |
| 6 | Real switch is silent | VERIFIED (unit); NOT exercised live | UAT 3 never reached a real switch |
| 7 | Dialog strings reuse existing keys + drmSwitchRefused | VERIFIED | locale key present |
| 8 | Install-time engine choice untouched | VERIFIED | per plan |
| 9 | CrossOver unhealthy still refuses via notifyCrossoverRequired | VERIFIED | UAT item 2 pass |
| 10 | (ROADMAP goal) DRM never runs over a Staging-initialised bottle | FAILED (BLOCKER) | Live UAT item 3 and CR-01: marker-less pinned bottle is mislabelled crossover by CrossOver's own probe; no switch; Staging DXVK-macOS left; game launched in DRM mode over it |

TCP regression: UAT item 5 pass.

**Score:** 9/10. The failing truth is the roadmap contract itself, so the phase goal is not achieved.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| DEBT-01 | 76-01 (frontmatter), 76-02 | BLOCKED | Mechanism exists and works only for bottles with a marker; fails for marker-less pinned bottles (all pinned-created bottles today). No orphaned requirement IDs for Phase 76 in REQUIREMENTS.md. |

**REQUIREMENTS.md action:** DEBT-01 was marked complete by 76-01 (checkbox at L56 `[x]` and traceability row L94 "Complete"). It should be reverted to pending (`[ ]` and "Pending") until the gap is closed.

### Anti-Patterns

Unit tests seed markers and never traverse inferMarker or the real engineSwitch (test-gap root cause). No TBD/FIXME debt markers checked beyond this scope.

### Gaps Summary

The DRM branch wiring is correct and every refusal path works, but the fix keys on the bottle marker, which pinned bottle creation never writes. CrossOver's preflight probe then adds a Timestamp that inferMarker reads as proof of CrossOver. Closing options (for /gsd-plan-phase 76 --gaps): (a) write the marker at pinned bottle creation; (b) infer-and-persist the marker before drmOfflinePrecheck/preflightCrossover; (c) add the real-engineSwitch temp-bottle test, and re-run UAT item 3 live (expect an `engine switch for "GameLibSteamBridge-219990": ... -> crossover` log line and Staging DXVK-macOS removed). Option (a)+(b) together also cover bottles already created by earlier builds.

---

_Verified: 2026-11-16T08:00:00Z_
_Verifier: Claude (gsd-verifier)_
