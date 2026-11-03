---
created: 2026-11-03T12:00:00.000Z
title: "Strict DXVK restore: judge 'already absent' from the registry, not truncated process output"
area: steam-engine
files:
  - src/backend/tools/index.ts:359-373
  - src/backend/tools/__tests__/dxvkInstallRemove.test.ts
severity: minor
platform: macos
ready: code
---

## Problem

Phase 59 round-6 review WR-01 (`59-REVIEW.md`). The source-pinned DXVK restore (59-51, G30)
runs each `reg delete` with `resolveOnExit: true`, which destroys the child's pipes 250 ms after
`exit`. The restore's "unable to find" tolerance (an override already absent counts as success)
is read from the captured stderr/stdout. If that text arrives after the pipes close, it is
missed. A restore retried after a partial earlier run then reports failure for a value that is
already gone.

Impact is bounded: the marker records `dxvk: 'failed'`, the launch does not proceed on
CrossOver on a half-restored bottle, and the next launch repairs it. UAT 44 ran the strict
restore live without hitting it.

## Solution

Decide "already absent" from state instead of text. Query the value (`reg query`), or read the
bottle's `user.reg` `[Software\\Wine\\DllOverrides]` section after the delete. Add a test where the
stub's stderr arrives after `exit`.
