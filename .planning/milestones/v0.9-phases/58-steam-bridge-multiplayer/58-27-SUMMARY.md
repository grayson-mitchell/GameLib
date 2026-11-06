---
phase: 58-steam-bridge-multiplayer
plan: 27
subsystem: steam-bridge
tags: [census, drm-trace, gap-closure, todos]
requires: []
provides:
  - "drmTrace apps event grammar (WR-01)"
  - "bridge-census --log and host/client direction fields"
  - "WR-02/05/07 deferral todos"
affects: [58-33-LIVE-GATE]
tech-stack:
  added: []
  patterns: ["anchored bounded regex for trace grammar"]
key-files:
  created:
    - .planning/todos/pending/2026-11-01-drm-getappbuildid-manifest-lookup-default-library-only.md
    - .planning/todos/pending/2026-11-01-mmservers-getserverdetails-shared-buffer.md
    - .planning/todos/pending/2026-11-01-legacy-p2p-fallback-accept-any-remote.md
  modified:
    - meta/__tests__/steamclientLayerNotice.test.ts
    - src/backend/storeManagers/steam/bridge/drm/drmTrace.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmTrace.test.ts
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
key-decisions:
  - "host/client are reported only and never change census status"
  - "WR-07 todo is severity: major; M-03 stays verified with caveats until it closes"
requirements-completed: [M-05, M-02, M-03]
duration: 20min
completed: 2026-11-01
---

# Phase 58 Plan 27: Desk-only TypeScript closures Summary

Repinned the stale -p58b regression test, parsed `event=apps` trace lines (WR-01), gave the census `--log <file>` plus `host=`/`client=` direction fields, and recorded WR-02/05/07 as triaged todos.

## Commits
- cfdfc895e: fix(58-27) repin -p58b expectations, parse apps trace lines
- b8fc90d63: feat(58-27) census --log and direction fields
- Task 3 todos commit: docs(58-27) (see git log)

## Notes
- `extractDrmEvidence` previously treated any non-create/p2p/callback event as a call; narrowed to `event === 'call'` so apps events do not pollute gameCalls.
- `--log` reads exactly one regular file, capped at the 32 MiB app-log cap, exit 2 with fixed messages on refusal (T-58-86).
- CALL lines are game-originated: bridge_helper.c logs them only after a STATUS_OK shim dispatch.

## Deviations from Plan
None - plan executed as written (one minor addition: the apps-event narrowing above, required for type correctness).

## Verification
steamclientLayerNotice, drmTrace, bridgeCensus suites green; `pnpm planning-gates` 12/12.

## Self-Check: PASSED
