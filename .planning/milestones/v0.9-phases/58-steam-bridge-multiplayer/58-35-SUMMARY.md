---
phase: 58-steam-bridge-multiplayer
plan: 35
subsystem: steam-bridge-helper
tags: [gap-closure, invite, poll, concurrency, native-helper]
requires: [58-32]
provides:
  - single-threaded poll() multiplexed connection loop in bridge_helper.c (GL_MAX_CONNS 16)
affects: [native/steam-bridge/helper/bridge_helper.c]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
decisions:
  - "Per-connection state lives in struct gl_conn slots; dispatch_and_respond signature and all handlers unchanged"
  - "g_send_failed flag set in send_all closes only the failing connection, so the ~48 send_response call sites needed no edits"
metrics:
  tasks: 2
  completed: 2026-11-01
requirements: [M-01]
---

# Phase 58 Plan 35: Concurrent helper connections Summary

The helper now serves the game's shim connection and the backend's invite control connection at once, using one poll() loop on the main thread with a 16-slot connection table, per-connection framing and auth state. This is the code fix for the 58-32 live-check failure; the live invite leg itself has not been re-run.

## What changed

- `bridge_helper.c`: `serve_connection`, `recv_all`, `g_argbuf` and the blocking accept loop are replaced by `gl_serve_forever`, `gl_conn_service` and `struct gl_conn`. Reads use `recv(..., MSG_DONTWAIT)`, never past the current frame. The listen fd is non-blocking and the accepted fd is made blocking again (`& ~O_NONBLOCK`) with `SO_SNDTIMEO`. Slots with no bytes for `RECV_TIMEOUT_SECONDS` are closed silently, preserving the old reconnect cadence. A full table closes the new connection at once (log capped at 16). Both T-24-03 ABORT strings are unchanged. Stale comments updated.
- `helperIntegration.test.ts`: real-binary tests for the held shim plus control slots 13/14, auth isolation, interleaving, stalled partial frame, idle-close window (4-7 s), connection cap, and source pins.

## TDD

Tests were written first. Against the unfixed helper, the held-shim test, auth isolation, interleaving and stall tests failed (frame response timed out, stall close at 11.2 s); the idle test passed as expected since it pins unchanged behaviour. After the change all pass.

## Verification

- `pnpm build-steam-bridge` clean (clang -Werror=uninitialized); rebuilt helper contains `connection table full`.
- `pnpm exec jest src/backend/storeManagers/steam/bridge`: 36 suites passed, 1329 tests passed, 1 skipped.
- Greps: no pthread_create/fork, one usleep (unchanged), prettier clean on the test file.

## Deviations from Plan

- Tasks 1 and 2 were implemented and committed together in one commit (da4c7476d) because the loop's inactivity close, cap and send-timeout behaviour were written as one unit.
- The cap test opens a single 17th connection (asserting exactly one `connection table full` line), since the log is per rejected connection.
- Test G (source pins) was merged into one `58-35 source pins` test.

## Commits

- da4c7476d fix(58-35): serve concurrent helper connections with one poll() loop

## Notes

M-01 live re-verification (pressing '+' in game with a real session) is still outstanding and is the next step.

## Self-Check: PASSED
