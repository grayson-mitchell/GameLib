---
created: 2026-10-29
title: "The stage process-listing children still hold the sidecar's event loop; child.unref() alone has no effect"
area: sidecar
severity: minor
platform: any
ready: code
source: "phase 56 code review round 3 (56-REVIEW.md WR-02; prior WR-03 still open), 2026-10-29"
files:
  - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
  - src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts
---

## Problem

56-32 added `child.unref?.()` to the `ps`/`lsof` listing children at `stageDrmBottle.ts:528-535` and `:631-638`, to keep the sidecar exit contract (half 1: unref every handle). It has no effect. `ChildProcess.unref()` unrefs only the process handle; `execFile` also creates ref'd `stdout`/`stderr` pipes, and its `timeout` option arms a ref'd kill timer. The reviewer measured this on Node v22.23.4:

| Setup | Process exits after |
| --- | --- |
| `execFile('/bin/sleep',['2'],{timeout:3000}); c.unref()` | 2008 ms |
| same, plus `c.stdout.unref(); c.stderr.unref()` | 2012 ms (the timeout timer still holds) |
| no `timeout`, `c.unref()` plus both stdio unrefs | 3 ms |

So at stdin EOF after a timed-out stage, the sidecar can still wait up to 3 s for the listing, and the in-code comment "never hold the event loop open" is false. `smoke:sidecar` cannot see a slow exit, so nothing catches this.

## Next

Factor one helper used by both listing sites:

- drop `execFile`'s `timeout` option;
- bound the child with its own unref'd `setTimeout` that sends SIGKILL, cleared in the callback;
- unref the child plus its `stdout` and `stderr`.

Add a test that spawns a node child calling the helper on `sleep 2` and asserts it exits in well under 2 s. Child spawns in tests follow the fake-HOME rule (`createFakeHomeProfile()`).
