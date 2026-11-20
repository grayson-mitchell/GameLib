---
phase: 77-runtime-hardening-from-the-v0-9-review-debt
plan: 01
subsystem: relay
tags: [relay, cloudflare-worker, streams, dos]
requires: []
provides:
  - readCappedBody capped stream read for the known-fix relay
affects: [relay/src/handler.ts]
key-files:
  created:
    - relay/src/readCappedBody.ts
    - relay/src/__tests__/readCappedBody.test.ts
  modified:
    - relay/src/handler.ts
    - relay/src/__tests__/handler.test.ts
requirements-completed: []
completed: 2026-11-16
---

# Phase 77 Plan 01: Relay capped body read Summary

The relay now bounds every request body at 2048 bytes with a capped stream read that cancels on overflow, replacing the unbounded `request.text()`.

## Tasks

1. readCappedBody module and 7 unit tests (cd6f7946b)
2. Chunked-body handler cases and wiring into handle() (see git log, "bound the relay request body")

## Notes

- Content-Length > max fast path, checkIpLimit order and the 503 catch are unchanged; no 411 branch.
- Over-cap branch logs the fixed string `relay: body over cap -> 413` (no IP/header/body) for the plan 77-03 probe.
- DEBT-02 is NOT marked complete: plan 77-03 deploys and probes it (D-07).
- Verification: `pnpm exec jest --selectProjects Relay` 183/183, relay tsc exit 0, prettier clean.

## Deviations from Plan

None. The RED step for Task 2 was not run separately (the test edit and handler edit were verified together, green).

## Self-Check: PASSED
