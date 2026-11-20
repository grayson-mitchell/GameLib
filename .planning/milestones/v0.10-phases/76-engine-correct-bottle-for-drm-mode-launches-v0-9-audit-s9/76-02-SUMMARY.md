---
phase: 76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9
plan: 02
subsystem: steam-bridge-launch
tags: [drm-mode, engine-switch, crossover, uat, audit-s9]
requires: [76-01]
provides:
  - 76-UAT.md with live results (4 pass, 1 issue)
affects: [76-01 engine switch gap]
key-files:
  created:
    - .planning/phases/76-engine-correct-bottle-for-drm-mode-launches-v0-9-audit-s9/76-UAT.md
    - .planning/todos/pending/2026-11-16-engine-notice-dialogs-have-no-dismiss-button.md
decisions:
  - Item 3 gap is left to verification and gap closure; no todo filed for it
metrics:
  tasks: 2
  completed: 2026-11-16
---

# Phase 76 Plan 02: Live UAT of engine-correct DRM launches Summary

The live UAT of 76-01 passed 4 of 5 items; item 3 found a major gap, so **DEBT-01's goal is NOT fully met live**.

## Results

- Item 1 pass: with CrossOver truly hidden, install logged `bottle creation engine pinned (cx-missing)` and created the bottle with Wine-Staging 11.20 + DXVK-macOS 1.10.3.
- Item 2 pass: `tag=crossover-required-drm` refusal with the expected text, no engine switch, no bottled Steam.
- Item 3 issue (major): the game launched and the strict DRM criterion was met (pid=416 role=game create-interface SteamClient017, 35 game calls), but the bottle was not switched to CrossOver.
- Item 4 pass (trivially, the bottle was already mislabeled crossover).
- Item 5 pass: Avernum 6 TCP bridge launch unaffected.

## Gap (item 3)

Pinned-engine bottle creation writes no `.gamelib-engine.json`. preflightCrossover's demo-status probe runs first and makes CrossOver add `Timestamp` to cxbottle.conf. prepareBottleForEngine then infers the engine via inferMarker (engineSwitch.ts:422) as crossover, the identity matches, and it writes the marker silently (engineSwitch.ts:693) and returns `{ok:true, changed:false}`. The pinned wineserver is never killed and the Staging DXVK-macOS stays in place. 76-01's unit tests seeded markers and never exercised inferMarker. Candidate fixes: write the marker at pinned-bottle creation and/or run prepareBottleForEngine before the preflight. Verification should route this to gap closure.

**DEBT-01 discrepancy:** 76-01 marked DEBT-01 complete in REQUIREMENTS.md; the live result contradicts that. REQUIREMENTS.md is left unchanged for the verifier and gap closure.

## Deviations from Plan

**UAT procedure defect (fixed in 76-UAT.md):** renaming /Applications/CrossOver.app does not hide CrossOver, because GameLib finds it by Spotlight bundle ID. The first two install attempts (06:53:40, 07:09:07) logged `bottle creation engine crossover`. The UAT now uses `~/cx-hidden.noindex/` plus an `mdfind` check. The expected text for item 1 was also corrected: no marker is written at creation.

## Other output

- Pending todo filed for the engine-notice dialog having no dismiss button (severity minor, platform macos, ready code); `pnpm planning-gates` passes 12/12.

## Known Stubs

None.

## Self-Check: PASSED
