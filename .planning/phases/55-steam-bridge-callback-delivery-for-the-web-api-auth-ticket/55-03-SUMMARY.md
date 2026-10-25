---
phase: 55-steam-bridge-callback-delivery-for-the-web-api-auth-ticket
plan: 03
subsystem: steam-bridge-helper
tags: [steam, bridge, native-helper, manual-dispatch, callbacks]
requires: []
provides:
  - "Helper captures callback 168 via Steamworks manual dispatch into an 8-slot allowlisted ring"
  - "CONTROL slot 6 (DRAIN_CALLBACKS) pull-only, one message per round trip"
  - "CONTROL_SLOT.drainCallbacks = 6 in protocol.ts"
affects: [55-04, 55-05, 55-07]
tech-stack:
  added: []
  patterns: ["header-only host-testable C ring", "closed callback allowlist", "volatile secure-zero on pop/evict"]
key-files:
  created:
    - native/steam-bridge/helper/gamelib_cbqueue.h
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/cbqueue_harness.c
    - src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
key-decisions:
  - "CBQ logging goes through a new variadic logts_f with a literal format at each call site so the integer-only pin is auditable"
  - "Pump on DRAIN and in WHOAMI warm-up only; RunCB is never called after ManualDispatch_Init"
requirements-completed: [P55-4, P55-5, P55-6]
duration: ~20min
completed: 2026-10-26
---

# Phase 55 Plan 03: Helper callback queue and DRAIN slot Summary

The helper now switches to Steamworks manual dispatch after a successful init, queues callback 168 (exactly 2572 bytes) in a bounded drop-oldest ring, and serves it on a new CONTROL slot 6 without sleeping or logging ticket bytes.

## Commits
- 4af3ef17b test: cbqueue ring harness (RED)
- 752093c66 feat: gamelib_cbqueue.h (GREEN)
- 14763e064 test: DRAIN integration and source pins (RED)
- 702277b07 feat: helper manual dispatch + slot 6 + protocol constant (GREEN)

## Verification
- cbqueue.test.ts: 17/17 pass on host clang (not skipped).
- helperIntegration.test.ts -t DRAIN: 2 pass; full cbqueue + helperIntegration + protocol suites: 54 pass (the other 8 helperIntegration tests are skipped in this environment's `-t` filter run only; they pass in the full run).
- fakeHomeIsolation.test.ts: 7/7 pass (no sibling-work failure to record).
- prettier --check clean on the TS files; C files excluded (no parser).

## Deviations from Plan
**1. [Rule 3 - Blocking/design] Added `logts_f` variadic helper.** The plan's source pin inspects the format string of each `logts("CBQ"` call, but `logts` takes a preformatted message. A literal-format variadic wrapper keeps the format visible at each call site; the pin regex matches `logts(_f)?("CBQ"`. Files: bridge_helper.c, helperIntegration.test.ts. Commit 702277b07.

Otherwise the plan executed as written.

## Notes
- `.planning/REQUIREMENTS.md` does not exist, so requirements mark-complete is a no-op.
- protocol.ts is bundled into the sidecar: restart the dev app and check `build/main/sidecar.js` mtime before live testing (carried by 55-07).
- T-55-10 (unauthenticated loopback port) accepted as pre-existing.

## Known Stubs
None.

## Self-Check: PASSED
