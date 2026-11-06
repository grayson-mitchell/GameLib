---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 05
subsystem: steam-bridge
tags: [drm-mode, census, evidence, trace-grammar]
requires: []
provides:
  - drm/drmTrace.ts zero-import trace and anchor grammar (consumed by 56-12)
  - bridgeCensus DRM evidence branch (consumed by 56-15)
affects: [56-12, 56-15]
tech-stack:
  added: []
  patterns: [zero-import pure parser, anchored-at-payload-start log evidence]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/drmTrace.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmTrace.test.ts
  modified:
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
key-decisions:
  - "ISteamClient_* and SetMinidumpSteamID calls are not counting calls (D-16, Claude's discretion)"
requirements-completed: [D-15, D-16]
duration: 15min
completed: 2026-10-28
---

# Phase 56 Plan 05: DRM-mode census evidence Summary

Zero-import `drmTrace.ts` grammar plus a DRM branch in `classifyBridgeEvidence`: a DRM-mode title verifies only on a `[bridge-drm]` anchor, a role=game create-interface, and a game call beyond init (or a clean game-log init line).

## Final exported signatures (drmTrace.ts, for 56-12)

- `DRM_TRACE_ENV = 'GAMELIB_DRM_TRACE_FILE'`; `MAX_DRM_TRACE_BYTES = 262144`, `MAX_DRM_TRACE_LINES = 1024`, `MAX_DRM_TRACE_LINE_CHARS = 512`, `MAX_DRM_ANCHOR_CHARS = 1280`
- `parseDrmTraceLine(line: string): DrmTraceEvent | null`
- `formatDrmTraceLine(ev: DrmTraceEvent): string`
- `parseDrmLaunchAnchor(payload: string): DrmLaunchAnchor | null` (trace = rest of line, spaces included; no anchor formatter, 56-04 owns it)
- `drmRelogPrefix(appId: string): string` returns `bridge drm [<id>]: `
- `parseDrmTraceFile(text, appId): { status: 'ok'; events; rejected } | { status: 'oversize' }`
- `appLogPayload(line: string): string`
- `extractDrmEvidence(appId, appLogText): DrmEvidence`
- Census: `drmAppLogSegmentFor(appid, files)` exported; `classifyBridgeEvidence` input gained optional `drmMode`.

## Counting-call rule (for 56-15 to check against the live trace)

A role=game `call` counts toward D-16 unless its name starts with `ISteamClient_` (pipe/user/accessor plumbing SteamAPI_Init performs) or matches `/SetMinidumpSteamID/i`. Preferred detail name matches `_(GetSteamID|BLoggedOn|GetPersonaName)$`. Alternative arm: `UE_INIT_OK` line in the game log gives `game log init`. Verdict order: no anchor, pid conflict, no game create-interface (or helper-only), game-log failure (init-failed), counting call, game-log init, else `no game-originated call`. No DRM detail contains a path.

## Task commits

1. Task 1: 1bfd0d49c (drmTrace.ts + 15 tests)
2. Task 2: 2088e4dd3 (census DRM branch, drmAppLogSegmentFor, .bind routing text)

## Deviations from Plan

- TDD note: tests and implementation were written together and committed as one `feat` per task, so there are no separate RED `test(...)` commits. Tests were run green before commit.
- Test fixture fix: first draft of the UE init test used a log line that does not match the existing `UE_INIT_OK` regex; corrected the test, not the regex.

## Notes

- `.bind` suffix is now `SteamStub .bind: routed to DRM mode (steamclient-layer)`; the "never changes routing" docblock wording is removed.
- `collectEvidence` still requires the per-game bottle name `GameLibSteamBridge-<appid>` before reading evidence; if DRM-mode bottles are named differently, 56-15 will need to adjust (not exercised here).
- `pnpm bridge-census` live run not performed (belongs to 56-15).
- `gsd-sdk requirements.mark-complete` reports REQUIREMENTS.md missing (known).

## Self-Check: PASSED

Verified: jest (157 tests across census + drm), `pnpm codecheck`, prettier check, `grep -c '^import' drmTrace.ts` = 0.
