---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
verified: 2026-10-28T23:10:00Z
status: gaps_found
score: "1/2 roadmap done-when conditions verified (menu reached: FAILED; strict-verified: VERIFIED)"
overrides_applied: 0
gaps:
  - truth: "Grim Dawn 219990 reaches its interactive main menu through DRM mode with only Mac Steam running"
    status: failed
    reason: "Live gate item 4 (56-15-LIVE-GATE.md, run by 56-16): Grim Dawn crashed with c0000005 (null read 0x18) at grim dawn.exe+0x1d10a immediately after the last traced call ISteamController_SteamController008_GetActionSetHandle (following ISteamController_SteamController008_Init). The black window was the game's crash reporter. The trace has no role=helper lines; the game opened SteamClient014 then SteamClient023. Census says verified, but the done-when requires the menu AND strict-verified."
    artifacts:
      - path: ".planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-15-LIVE-GATE.md"
        issue: "Item 4 result: issue; Gap 7 and Gap 13 (blocking); Verdict FAIL"
    missing:
      - "Diagnose what grim dawn.exe+0x1d10a dereferences (minidump memory) and whether the layer returns a null ISteamController interface"
      - "Re-run the live gate after a fix; a green test suite does not close it"
    todo: ".planning/todos/pending/2026-10-28-grim-dawn-drm-crash-after-getactionsethandle.md"
  - truth: "Repeat DRM launches in the same bottle work (DRM mode is usable beyond first launch)"
    status: failed
    reason: "Gap 9 (blocking for DRM mode): a second or later DRM launch hangs at drm-bottle-stage. A reg add under the clone runner times out after 15000 ms while the bottle session runs wineboot.exe --init and a winedevice.exe spins near 100% CPU. Seen for Grim Dawn (22:49:14, 22:55:43) and Raft (22:52:09) after each had a successful first launch. wineserver -k with CX_BOTTLE alone did not stop it. This also made gate item 11 (HKLM diagnostic) yield no signal."
    artifacts:
      - path: "src/backend/storeManagers/steam/bridge/drm/"
        issue: "stageDrmBottle / bottle session teardown does not survive a second launch (unit tests pass; live behavior fails)"
    missing:
      - "Sample the spinning winedevice; check whether stock and clone wineservers share the bottle; test killing the bottle session after game exit (D-11)"
    todo: ".planning/todos/pending/2026-10-28-drm-second-launch-bottle-stage-hang.md"
  - truth: "Install through the bridge leaves the game playable (status settles after the shared-redist step)"
    status: failed
    reason: "Gap 3 (blocking for install UX): after a bridge install the game is stuck in 'redist' (Installing DirectX Jun2010) and Play is disabled; the Steam download-queue 'done' is suppressed and nothing sends a final status after redists. A dev restart was needed; the first launch-1 delimiter was voided."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "~2327-2341 redist step sends no final status"
    missing:
      - "Send a final status after the redist step"
    todo: ".planning/todos/pending/2026-10-28-stale-redist-status-after-bridge-install-disables-play.md"
  - truth: "Install route notice is accurate for DRM-mode titles"
    status: failed
    reason: "Gap 2 (non-blocking): the install route notice shows the stale scan-miss 'may not work with the native Steam bridge' warning for a DRM-mode title; operator had to click through."
    artifacts:
      - path: "src/backend/storeManagers/steam/games.ts"
        issue: "route notice does not consult DRM routing"
    missing:
      - "Make the route notice consult the DRM routing"
    todo: ".planning/todos/pending/2026-10-28-install-route-notice-unaware-of-drm-mode.md"
  - truth: "A dispatched bridge-notice dialog is actually displayed to the operator"
    status: partial
    reason: "Gap 10 (non-blocking): for the 22:49:14 Grim Dawn failure the notice was dispatched (dialog-frame-sent=true) with display=unconfirmed and the operator saw nothing; for the Raft failure it was seen."
    artifacts: []
    missing:
      - "Investigate why a dispatched notice is sometimes not shown"
    todo: ".planning/todos/pending/2026-10-28-bridge-notice-dialog-display-unconfirmed.md"
  - truth: "Ranch Simulator 1119730 (non-blocking comparison target) launches in DRM mode"
    status: failed
    reason: "Gap 11 (non-blocking, routing): Ranch took the ordinary bridge path (reason=stubbed:SteamHTMLSurface,SteamHTTP,...), exited in 2-3 s twice; census unverified / no HELLO. Gate item 9 result: issue. A listed phase target."
    artifacts: []
    missing:
      - "Check Ranch routing and whether the stubbed families cause the exit (spike 040 exit-53 variant)"
    todo: "NONE: no pending todo for Gap 11 exists in .planning/todos/pending/ (candidate: 2026-10-28-steamclient-wire-policy-unreachable-after-phase-56.md is related to routing but is a different concern)"
  - truth: "Gate contract items are scorable as written (items 7, 11, PC for pre-installed copies)"
    status: partial
    reason: "Gaps 1, 5, 12 (non-blocking, contract defects): preflight never checked Grim Dawn was uninstalled elsewhere; item 7's regex counts shared-redist HasRun marks under Apps\\CommonRedist (scored literally as issue, count 5; no InstallPath keys present at launch 1); item 11's key removal with reg delete /f wipes the redist marks."
    artifacts:
      - path: ".planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-15-LIVE-GATE.md"
        issue: "Sections 1-3 and 5 item 7/11 need amended wording before the re-run"
    missing:
      - "Add a not-installed-elsewhere PC; anchor item 7 regex on bare key with InstallPath value / exclude CommonRedist; use /v InstallPath removal in item 11"
    todo: "NONE: contract defects, to be fixed in the gate document on re-authoring (no pending todo)"
---

# Phase 56: Bridge steamclient-layer DRM mode for SteamStub titles - Verification Report

**Phase Goal:** A SteamStub-wrapped title launches through the native Mac Steam bridge with no Windows Steam client, via a second bridge mode (genuine Valve steamclient fetched from CDN, trampolined to lsteamclient, cloned/patched CrossOver runner, x86_64 Mac steamclient.dylib host). Done when (live gate): Grim Dawn reaches its menu through this mode with only Mac Steam running, and it meets the strict bridge-verified criterion.
**Verified:** 2026-10-28
**Status:** gaps_found
**Re-verification:** No, initial verification

## Goal Achievement

ROADMAP has no `success_criteria` array; the done-when line is the contract.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Grim Dawn reaches its interactive menu in DRM mode with only Mac Steam running | FAILED | Gate item 4 `result: issue`. Crash c0000005 at grim dawn.exe+0x1d10a after `ISteamController_SteamController008_GetActionSetHandle`. Gate Verdict line: FAIL at item 4. |
| 2 | Grim Dawn meets the strict bridge-verified criterion (D-15/D-16) | VERIFIED | Items 5 and 6 pass: one role=game `create-interface SteamClient017` line (pid 240), zero role=helper lines; census row 219990 `verified`, detail `game call ISteamUser_SteamUser017_GetSteamID`. Verified here from the gate record, not re-run. |
| 3 | Component fetched from the published release, not shipped (D-18) | VERIFIED | Item 1 pass: six expected names, sha256 matches the pin, `component=download`. |
| 4 | Reinstall via the bridge and DRM setup complete | VERIFIED (with defect) | Items 2 and 3 pass, but Gap 3 (stuck 'redist', Play disabled) needed a dev restart. |
| 5 | DRM mode works on repeat launches | FAILED | Gap 9: every second launch in a bottle hangs at drm-bottle-stage. |
| 6 | Other targets: Raft 648800 / Ranch 1119730 | PARTIAL | Raft: DRM mode, menu reached, verified (first launch only). Ranch: not routed to DRM, unverified. Both non-blocking per the gate. |

**Score:** 1 of 2 done-when conditions verified. The menu condition is the blocking one, so the phase goal is not achieved.

### Behavioral Spot-Checks / Tests

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Phase 56 DRM unit suites | `npx jest src/backend/storeManagers/steam/bridge/drm` | 9 suites, 252 passed, 1 skipped | PASS (does not close the live gate) |
| Planning gates | `pnpm planning-gates` | 12/12 passed | PASS |
| Live gate | (not re-run, by instruction) | Verdict FAIL at item 4 | FAILED |

The green unit suite coexists with a live crash and a live hang: unit tests mock the bottle and the game, so they do not cover either defect.

### Probe Execution

No probes declared for this phase. Step 7c skipped.

### Requirements Coverage

ROADMAP requirements field is `TBD`; no requirement IDs to cross-reference.

### Anti-Patterns

Not scanned in depth; the blockers are live-behavior failures, not code smells. Gate 56-15-LIVE-GATE.md carries no unreferenced TBD/FIXME debt markers relevant to the verdict.

### Human Verification Required

None can substitute for the failed gate. After fixes, the live gate must be re-run by a plan like 56-16 (items 4, 11, and a repeat-launch check for Gap 9).

### Gaps Summary

The phase delivered the plumbing (component fetch, runner clone, bottle staging, layer mode, trace and census) and it is demonstrably live up to Steam init: Grim Dawn passes D-15/D-16. It fails the done-when because the game crashes before its menu (Gap 7, null read right after the Steam controller `GetActionSetHandle`), and DRM mode is not repeatable (Gap 9, bottle-stage hang on every second launch). Gap 3 additionally leaves Play disabled after a bridge install. Closure plans should target, in order: the Grim Dawn crash, the second-launch hang, the redist final status, then the non-blocking items. Gap 11 (Ranch) and the contract defects (Gaps 1, 5, 12) have no pending todo.

---

_Verified: 2026-10-28_
_Verifier: Claude (gsd-verifier)_
