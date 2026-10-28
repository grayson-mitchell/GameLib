---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 24
subsystem: drm-mode
tags: [gap-closure, superseded, gap-7]
requires: [56-22, 56-23]
provides:
  - "Gap 7 closed by 98837f09b, which landed before this plan executed; the component is not changed"
affects: [56-25, 56-26]
key-files:
  created: []
  modified: []
decisions:
  - "Operator ruling 2026-10-29: close 56-24 as superseded"
  - "No lsteamclient rebuild or re-pin: the ISteamController/GetActionSetHandle path is excluded as the cause, so the published component stays as 56-16 left it"
metrics:
  duration: "0m"
  completed: 2026-10-29
requirements: []
---

# Phase 56 Plan 24: Gap 7 fix (Grim Dawn crash before menu) Summary

Superseded. The crash was caused by the working directory, not by the controller interface. Grim Dawn
was started from `Grim Dawn\x64\` and could not find `database.arz`. `98837f09b` (fix(bridge): launch Steam
games from the install root, not the exe's folder) fixes it in `launchTarget.ts` and `bridgeVerdict.ts`,
with tests in `launchTarget.test.ts`, `bridgeVerdict.test.ts` and `games.test.ts`. Record:
`.planning/debug/resolved/grim-dawn-drm-actionset-crash.md`. The Gap 7 todo is in
`.planning/todos/completed/`.

None of this plan's candidate branches were taken. There is no known-fix entry (`public/fixes/219990-steam.json`),
no `steamclient_main.c` change, no PINS.md or catalogue re-pin and no THIRD-PARTY-NOTICES edit. 56-25 has no new
component archive to publish.

## Deviations from Plan

**1. [Operator ruling] Whole plan superseded.** No tasks executed, no code changed.

## Self-Check: PASSED
Verified that `98837f09b` exists and touches `launchTarget.ts` and its test.
