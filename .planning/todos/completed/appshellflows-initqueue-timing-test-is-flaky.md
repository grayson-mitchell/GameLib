---
created: 2026-10-05T00:00:00.000Z
title: "appShellFlows 'synchronous throw from detectVCRedist does not skip initQueue(true)' fails intermittently — isolatedInitQueue called twice"
area: testing
severity: minor
platform: any
ready: code
found_by: "Hit independently by three fix agents and the orchestrating session, 2026-10-05"
status: "RESOLVED 2026-10-08. Root cause: jest.isolateModules re-uses the main registry's already-built `initQueue` mock, so it is ONE jest.fn across every isolated registration; two frontendReady deliveries made under REAL timers (the D-11 marker test and the CR-02 Snap test) each armed a real 5s `initQueue(true)` setTimeout that fired mid-run against that shared mock. Reproduced deterministically by inserting a 5.2s real wait before the test: received 3 (1 fake + 2 real). Fixed by running both deliveries under fake timers (the stream-based one with nextTick/queueMicrotask/setImmediate kept real) and by `mockClear()`-ing immediately before `advanceTimersByTime(5000)` so the assertion counts only that advance."
files:
  - src/backend/sidecar/__tests__/appShellFlows.test.ts:1400-1435
---

## Problem

`appShellFlows.test.ts` → "260922-v2e: detectVCRedist wiring › a synchronous throw from
detectVCRedist does not skip initQueue(true) scheduled at 5s (ordering, D2)" asserts
`isolatedInitQueue` was called once after `jest.advanceTimersByTime(5000)` and sometimes receives
2 calls. On 2026-10-05 it failed 3/3 runs on its own (with and without unrelated changes), and
passed inside a full `pnpm test:ci` run the same day — so it is order- or timing-dependent, not
tied to one change. Other agents saw a different initQueue call-count test in the same suite fail
the same way.

## Failure scenario

Unrelated changes look like they broke the sidecar boot path; reviewers chase noise, or learn to
ignore a red `appShellFlows`.

## Suggested fix

Find where the second `initQueue` call comes from — likely a timer or module-level registration
leaking from an earlier test in the file (isolateModules + fake timers installed after the module
schedules its own timer). Reset timers and the mock per test, and assert on calls made after the
advance only.
