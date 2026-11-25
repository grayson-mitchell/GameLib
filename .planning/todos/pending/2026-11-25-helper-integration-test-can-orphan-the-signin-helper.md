---
created: 2026-11-25T16:00:00.000Z
title: "helperIntegration can orphan `steam-bridge-helper-signin`"
area: testing
files:
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts (the sign-in helper build and run, around lines 2840-2910)
severity: medium
platform: macos
ready: code
---

## Problem

Observation O2 from the 87-69 re-run 1 gate (2026-11-24). At P2 of that run (the check that no GameLib process is left before
a launch), one `steam-bridge-helper-signin` process was found with ppid 1, about 11 hours old. It came from the helperIntegration
jest run: the test builds and runs the sign-in helper, and a run that ends early or is killed leaves the helper behind. It was
killed by pid and recorded.

An orphaned helper is a leftover process holding a Steam sign-in surface, and it makes a live gate's one-instance check
(`pgrep`) fail until someone removes it by hand.

## Not fixed in Phase 87

The user decided on 2026-11-25 that O1 to O3 are observations, not findings against the re-run items, so this is tracked here
and not planned in Phase 87.

## To do

Find where the test spawns the sign-in helper and make its teardown unconditional: an `afterAll` and an `afterEach` that kill the
child, and a spawn that does not outlive the jest worker (the test's own spawn goes through the fake-HOME profile harness, which
disposes the profile but does not stop a child). Add a check that no `steam-bridge-helper-signin` remains after the suite.
