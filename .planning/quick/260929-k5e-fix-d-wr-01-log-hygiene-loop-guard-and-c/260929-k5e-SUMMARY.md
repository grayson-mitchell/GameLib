---
phase: quick
plan: 260929-k5e
subsystem: backend/sidecar, frontend/webview-tests
status: complete
tags: [sidecar-exit-contract, unref, log-hygiene, non-vacuity-guard, mutation-proof]
dependency-graph:
  requires: []
  provides: [WR-01-timer-unref-guards, D-WR-01-log-hygiene-non-vacuity-guard]
  affects:
    - src/backend/humble/adapter.ts
    - src/backend/humble/user.ts
    - src/backend/sidecar/oauthLoginCapture.ts
    - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
tech-stack:
  added: []
  patterns:
    - ".unref?.() optional-call spelling (jest fake timers do not implement unref())"
    - "non-vacuity guard before an assertion loop (expect(calls.length).toBeGreaterThan(0))"
key-files:
  created: []
  modified:
    - src/backend/humble/adapter.ts
    - src/backend/humble/user.ts
    - src/backend/sidecar/oauthLoginCapture.ts
    - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
decisions:
  - "Task 2 gate 2 was rewritten mid-execution by the coordinator (not by me) from a file-wide grep to a diff-scoped grep, after I halted rather than self-editing an unsatisfiable gate. See 'Deviations' below."
metrics:
  duration: "~1h10m (across a halt-and-report / coordinator-correction cycle)"
  completed: 2026-09-29
actuals:
  tokens: 994
  tasks: 2
  commits: 2
---

# Quick Task 260929-k5e: Login Timer unref Guards and Log-Hygiene Loop Guard Summary

Guarded five sidecar/backend timer handles with `.unref?.()` per the sidecar's stdin-EOF exit contract, and added a non-vacuity guard before a log-hygiene assertion loop in a frontend OAuth-login test, proving the guard load-bearing by mutation.

## What Was Built

**Task 1 (WR-01)** — added `.unref?.()` (never the bare `.unref()`, since jest's fake-timer substitute does not implement `unref()`) to all five timer handles in scope, each with a short comment tying the change to the sidecar's exit contract:

- `src/backend/humble/adapter.ts` — `timeoutHandle` (the reveal-POST timeout inside `humblePostRequestViaSeam()`'s `new Promise` executor).
- `src/backend/humble/user.ts` — `pollInterval` (the `setInterval` poll loop) and `watchDeadline` (the `setTimeout` deadline inside `armDeadline()`, which re-arms on every `forceRevalidate()` call — so the guard had to live inside the function body, not just at the initial call site).
- `src/backend/sidecar/oauthLoginCapture.ts` — `deadlineTimer` (the capture deadline) and `pollInterval` (the poll loop inside the `seam.open(...).then()` callback).

Diff against BASE (`a6ab9d98f`) is a pure insertion across the three files — confirmed via `git diff -U0` (0 non-comment lines removed). Committed as `da5bb2bd9`.

**Task 2 (D-WR-01)** — added a non-vacuity guard immediately before the log-hygiene assertion loop in `useTauriOAuthLogin.test.tsx`'s "every logInfo argument uses only the permitted key vocabulary" test:

```tsx
// D-WR-01: iterating an EMPTY call list runs the loop below zero times and passes while
// asserting nothing. This test's whole purpose is that no secret ever reaches a log line,
// so it must go red the moment this path stops logging, not quietly stop checking.
expect(mockApi.logInfo.mock.calls.length).toBeGreaterThan(0)
```

Diff against BASE is a pure insertion (0 removed, 1 added non-comment line). Committed as `578662f59`.

### Mutation proof (Task 2)

Proved the guard load-bearing, not vacuous, by breaking it deliberately and confirming red, then reverting:

1. Temporarily inserted `mockApi.logInfo.mockClear()` immediately before the guard.
2. Ran `npx jest src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx -t "every logInfo argument uses only the permitted key vocabulary"`. Captured failure, verbatim:

```
● useTauriOAuthLogin — cancellation-window instrumentation (Plan 34.5-34 Task 1) › every logInfo argument uses only permitted key vocabulary -- never code, token, redirect URL, or raw username

    expect(received).toBeGreaterThan(expected)

    Expected: > 0
    Received: 0

      1077 |     // so it must go red the moment this path stops logging, not quietly stop checking.
      1078 |     mockApi.logInfo.mockClear() // TEMP MUTATION for proof capture -- reverted immediately after
    > 1079 |     expect(mockApi.logInfo.mock.calls.length).toBeGreaterThan(0)
           |                                               ^
      1080 |
      1081 |     for (const [line] of mockApi.logInfo.mock.calls) {

      at Object.<anonymous> (src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx:1079:47)
```

3. Reverted the `mockClear()` mutation. Re-ran the same scoped test — passed.
4. Separately instrumented (temporarily) with `console.error('D-WR-01 CALL COUNT:', mockApi.logInfo.mock.calls.length)` in place of the mutation, to establish the real (unmutated) count this flow produces: **3** logInfo calls. That instrumentation was also reverted; the committed file contains neither the `mockClear()` mutation nor the `console.error` probe — confirmed via `git status --short` / `git diff --stat` showing only the coordinator-owned PLAN.md as modified after revert, with the test file matching the committed blob exactly.

This demonstrates the guard fires (goes red) exactly when the call list is empty, and does not fire against the real 3-call flow — it is load-bearing, not decoration.

## Deviations from Plan

### Plan-authoring defect (not a code defect) — Task 2 gate 2

**Found during:** Task 2 verification.

**Issue:** Task 2's original gate 2 grepped the entire test file for the literal `logInfo.mockClear()` and required a count of `0`. This was unconditionally unsatisfiable by any implementation: the file already contains four pre-existing, unrelated `mockApi.logInfo.mockClear()` calls at BASE (`a6ab9d98f`), at lines 902, 941, 980 and 1316 — each a legitimate `unmount()` → `mockClear()` teardown idiom in a different, unrelated test. Confirmed via `git show a6ab9d98f:<file> | grep -c 'logInfo.mockClear()'` → `4`. The gate could only ever have gone green by deleting legitimate unrelated code, which was out of scope and would have been a regression.

**Action taken:** Per the explicit instruction to run every `<verify>` block as written and never adjust a gate to make it pass, I did not edit the gate myself. I ran gates 1, 3, and 4 individually (all passed), captured the mutation-proof transcript separately, and halted, reporting the situation rather than committing Task 2 or writing this SUMMARY.

**Resolution:** The coordinator corrected gate 2 in the PLAN.md — not a relaxation to admit a failing result, but a stricter, diff-scoped check: it now greps only the lines this change *added* (`git diff -U0 "$BASE" -- "$T"` filtered to `^+`, excluding `^+++`) for `logInfo.mockClear()`, requiring `0`. The pre-existing four lines are unchanged context, so `git diff -U0` never emits them as added lines. This is stricter than the original intent (catches a mutation left anywhere in the file, not just inside the test region) while no longer asserting anything about pre-existing, out-of-scope code.

Before acting on the correction, I independently verified — rather than trusting the coordinator's report — that: (a) the PLAN.md had actually been modified on disk, (b) my own transcription of the corrected gate script was byte-identical to the live file (`diff` exit 0), and (c) running the corrected gate 2/3/4 block end-to-end myself produced a clean pass: `EXIT: 0`, `ALL_GATES_PASS`, with `Test Suites: 1 passed, 1 total`, `Tests: 72 passed, 72 total`, lint at `638 problems (0 errors, 638 warnings)` / `production: PASS | tests: PASS` (baseline-matching, zero new warnings against the zero-headroom ceiling), prettier clean, and `12/12 planning gates passed`.

**Files modified:** none by me (the coordinator edited `260929-k5e-PLAN.md`; not committed by me per this round's explicit instruction that the coordinator owns the docs commit).

**Commit:** N/A (plan-file correction, not a code change; not committed as part of this SUMMARY's scope).

### Observed baseline (not attributable to this change)

`src/backend/storeManagers/steam/__tests__/lzmaNativeSeaRealBuild.test.ts` carries a pre-existing worker-exit warning (documented in that file's own comments, tracing back to a 2026-08-18 worker-thread logger-init investigation). It is unrelated to the sidecar-timer or log-hygiene surface touched by this task and is noted here only as an observed baseline condition, not a result of this change and not something this task claims credit for addressing.

No other deviations. All five Task 1 handles and the Task 2 guard were implemented as pure insertions, per the plan's `<non_negotiable_technical_constraint>`.

## Verification Results

**Task 1:** `<verify>` block run as written — additive-only diff confirmed (0 non-comment lines removed across the three files), all five `.unref?.()` sites present with the required optional-call spelling, `pnpm codecheck` exit 0, backend suite green, lint held at baseline, prettier clean, planning-gates 12/12.

**Task 2:** `<verify>` block (corrected gate 2, see Deviations) run independently, exact output:

```
EXIT: 0
Test Suites: 1 passed, 1 total
Tests:       72 passed, 72 total
✖ 1107 problems (0 errors, 1107 warnings)   [production ceiling — unrelated to this diff]
✖ 638 problems (0 errors, 638 warnings)     [tests ceiling — baseline match, zero headroom]
production: PASS | tests: PASS
All matched files use Prettier code style!
12/12 planning gates passed.
ALL_GATES_PASS
```

Gate 1 (guard present, region ≤ 50 lines): passed. Gate 2 (no mutation left behind, diff-scoped): passed. Gate 3 (pure insertion, REM=0, ADD=1): passed. Gate 4 (suite/codecheck/lint/prettier/planning-gates): passed, all counts above.

## Honest Ceiling — What Is and Is Not Proven

No gate in this repository proves that the sidecar's actual exit behavior improved. What is gated, and only what is gated:

- The five call sites exist, at the correct symbols, in the correct three files.
- Each uses the `.unref?.()` spelling (not bare `.unref()`).
- All five edits, and the Task 2 test edit, are additive-only against BASE — nothing was removed or restructured.
- Nothing broke: `pnpm codecheck`, `pnpm lint` (both ceilings), the affected jest suites, `npx prettier --check` over the written paths, and `pnpm planning-gates` all hold at or above baseline.
- The Task 2 guard is load-bearing by mutation proof (see above), not that the log-hygiene assertion itself is complete or exhaustive.

This task did not run — and no artifact here should be read as claiming — a live measurement of sidecar process exit timing or the event-loop-drain behavior itself (per the plan's explicit non-goal: half 2 of the exit contract, unbounded in-flight boot work, is out of scope for this task, and no `smoke:sidecar`-style timing run was part of this task's verification).

## Self-Check: PASSED

- `src/backend/humble/adapter.ts` — FOUND
- `src/backend/humble/user.ts` — FOUND
- `src/backend/sidecar/oauthLoginCapture.ts` — FOUND
- `src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx` — FOUND
- Commit `da5bb2bd9` — FOUND in `git log --oneline --all`
- Commit `578662f59` — FOUND in `git log --oneline --all`
- Working tree — test file matches committed blob exactly (mutation-proof instrumentation fully reverted)
