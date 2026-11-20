---
phase: 78-verification-records-and-test-health-after-v0-9
plan: 03
subsystem: steam-bridge
tags: [steam-bridge, verification-records, debt]
requires: []
provides:
  - "58 IN-01 fix, WR-03 source pins, IN-02 comment fix"
  - "58-VERIFICATION follow_ups reduced to the one open item"
affects: [58-VERIFICATION, 58-REVIEW-FIX]
tech-stack:
  added: []
  patterns: ["RED test commit before fix commit"]
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bridge/inviteBridge.ts
    - src/backend/storeManagers/steam/bridge/__tests__/inviteBridge.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/shimCoverage.ts
    - src/backend/knownFixReport.ts
    - .planning/milestones/v0.9-phases/58-steam-bridge-multiplayer/58-VERIFICATION.md
    - .planning/milestones/v0.9-phases/58-steam-bridge-multiplayer/58-REVIEW-FIX.md
key-decisions:
  - "WR-03 pins are pin-only (existing code already satisfied them)"
requirements-completed: [DEBT-05]
duration: 20min
completed: 2026-11-17
---

# Phase 78 Plan 03: 58 review items closed Summary

IN-01 persistent `socket.on('error')` fix with a failing-first test, WR-03 source pins, IN-02 comment, two stale comments corrected, and 58-VERIFICATION follow_ups reduced to the single genuinely open item.

## Commits

- `32c1eb938` test: IN-01 double-error test. RED failure: `expect(received).not.toThrow()` ... `Unhandled error. (Error: second`
- `ecc58d332` fix: `once` -> `on` in controlRoundTrip
- `ffe77b2c5` test/comment: WR-03 pins (`GL_SEND_TIMEOUT_USEC 250000`, `SO_SNDBUF`; pin-only) and IN-02 (`one poll loop, see gl_serve_forever`; poll() confirmed at bridge_helper.c:3139)
- `1d2b29e48` docs: shimCoverage.ts and knownFixReport.ts comments (comment-only diff, filter empty)
- `b492bfc28` docs: 58-VERIFICATION follow-up status and 58-REVIEW-FIX Phase 78 section

## Verification

- inviteBridge, helperIntegration, helperNetHarness, helperSpawn: 4 suites, 132 tests pass. knownFixReportUrl: 2 pass. Prettier clean on the TS paths. `pnpm planning-gates` 12/12.
- shimCoverage.test.ts: 1 failed / 117 passed both before and after (pre-existing steam_api.def export-list mismatch; Plan 05 D-17 todo). Unchanged by this plan.

## Re-measured file:line (grep by text at HEAD)

GL_AUTH_DEADLINE_SECONDS (305, eviction 3124), GL_SEND_TIMEOUT_USEC (313), SO_SNDTIMEO (3157), SO_SNDBUF (3165), `_Static_assert` (2327), GL_INVITE_BAD_ORDINAL (2481), `logts_f("INVITE","dialog appid` (2379), INVITE_DIALOG_LINE in helperSpawn.ts (49), `socket.on('error'` (inviteBridge.ts:65), tests by name in helperSpawn/helperNetHarness/helperIntegration.

## Deviations from Plan

- The WR-01 covering test is in helperSpawn.test.ts:232 (not only helperNetHarness); both cited.
- BSD sed failed on first helper edit; redone with python. No effect on results.

## Known Stubs

None.

## Self-Check: PASSED
