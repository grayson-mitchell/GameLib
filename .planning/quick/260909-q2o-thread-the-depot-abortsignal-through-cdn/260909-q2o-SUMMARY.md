---
phase: quick-260909-q2o
plan: 01
subsystem: steam-depot
tags: [steam, cdnAuth, AbortSignal, decompress, tdd]
requires: []
provides:
  - "CdnAuthTokenCache.getToken(depotId, host, signal?) — optional AbortSignal, never throws"
affects:
  - src/backend/storeManagers/steam/depot/decompress.ts
  - .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md
tech-stack:
  added: []
  patterns:
    - "awaitOrAbort(fetchPromise, signal) — Promise.race against a listener-backed abort promise that never disturbs or cancels the raced-against promise; listener always removed in a finally"
    - "pending.delete detached from the awaiting caller via `void fetchPromise.finally(...)` so an aborting caller cannot strand the single-flight key for a concurrent no-signal caller"
key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot/cdnAuth.ts
    - src/backend/storeManagers/steam/depot/decompress.ts
    - src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts
    - src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts
    - .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md
decisions:
  - "getToken degrades to '' on abort and never throws — an aborted token fetch must never look like a token-endpoint failure to any caller"
  - "An abort never writes a CDN_AUTH_TOKEN_FAILURE_COOLDOWN_MS entry into negativeCache — cancelling is not evidence a host is bad"
  - "The shared in-flight _send fetch is never cancelled on an aborting caller's behalf, only stopped being awaited by that caller — a concurrent no-signal caller must still get the real token from exactly one _send"
  - "pending.delete is tied to the fetch promise's own settlement (void fetchPromise.finally(...)), not to the awaiting caller's completion, so an aborting caller cannot strand the single-flight key"
  - "callGetCDNAuthToken (the manual _send bypass around steam-user 5.3.0's missing protobuf map entry) is deliberately left un-threaded — it is Steam-CM protocol plumbing, not the cancellation surface"
  - "The abort listener registered in awaitOrAbort is always removed in a finally, whether the race is won by the fetch or by the abort — prevents a per-call listener leak on a long-lived signal"
metrics:
  duration: "~70 minutes (includes an incomplete-then-resolved investigation of a pre-existing lint ceiling breach)"
  completed: 2026-09-09
---

# Phase quick-260909-q2o Plan 01: Thread the depot AbortSignal through CDN auth Summary

Closed the one unobserved `await` inside an otherwise abort-aware `fetchChunk` — `CdnAuthTokenCache.getToken` now accepts an optional third `AbortSignal` and `decompress.ts` forwards `fetchChunk`'s own signal into it by reference. **This closes a bounded (`CDN_AUTH_TOKEN_FETCH_TIMEOUT_MS` = 3000ms per attempt) latency window, not an unbounded loop.** It discharges the code half of the pending todo `.planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md`'s "Hypothesis B" — neutralising it (it can no longer produce an orphaned loop even if it was true) rather than testing it (no live reproduction of the 2026-08-27 empty-auth-token wedge was attempted or achieved).

## What was built

**Task 1 — `CdnAuthTokenCache.getToken` becomes abort-aware (`cdnAuth.ts`).** New optional third parameter `signal?: AbortSignal`. An already-aborted signal short-circuits to `''` before any network attempt or map mutation. A mid-flight abort races the in-flight fetch against a new `awaitOrAbort` helper — `Promise.race([fetchPromise, abortPromise])` — which resolves the *caller's* await to `''` without touching the shared fetch itself; the listener registered on `signal` is always removed in a `finally`. `pending.delete` was detached from the awaiting caller (`void fetchPromise.finally(() => this.pending.delete(key))`) so a concurrent no-signal caller sharing the same in-flight fetch still gets the real token from exactly one `_send`, even if the first caller aborts. 8 new tests added to `cdnAuth.test.ts` covering D1-D7 (already-aborted short-circuit, cache/pending non-corruption after an aborted call, mid-flight abort resolving promptly rather than after the 3000ms bound, never-throws, single-flight survival under a concurrent no-signal caller, pending-lifetime tracking the fetch not the caller, no-cooldown-on-abort).

**Task 2 — `fetchChunk` forwards its own signal (`decompress.ts:1055-1058`).** Single-expression change: `await cdnAuth.getToken(depotId, host)` → `await cdnAuth.getToken(depotId, host, signal)`, forwarding the same `AbortSignal` `fetchChunk` already received and already checks at the top of every attempt and in its catch block. No new `AbortController`, no second cancellation mechanism. 3 new wiring tests added to `depotPrimitives.test.ts`: a spy-based reference-equality proof that `fetchChunk` passes its *own* signal object into `getToken`; a fake-timer race test proving a cancel that fires during the token await is not gated behind the 3000ms timeout and results in exactly one `fetch()` call; a regression check that omitting `signal` (no caller changes) still appends the token to the URL exactly as before.

**Task 3 — the todo narrowed, not closed.** `.planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md` stays in `pending/` (not moved to `completed/` — closing it is the operator's call). `ready: live-gate` → `ready: human` (the gate that name referred to — a re-drive with the wedge inside the empty-auth-token rotation loop — is no longer the discharge condition, since that path is now bounded by construction and unit-tested; what's left is a judgement call about an unidentified cause with both named hypotheses off the table). `severity: major` and `platform: any` are unchanged, reasoned inline rather than defaulted. `files:` gained the two production files this task touched. A new dated section `## Code-side abort-blindness CLOSED — 2026-09-09, quick 260909-q2o` records exactly what shipped, the six design decisions, the honest size of the win, and states plainly that no live gate was run. The `### Hypothesis B is NARROWED, not settled` section was annotated (not deleted or rewritten) with a pointer to the new section. A new `## Residual (rewritten 2026-09-09 — supersedes the 2026-09-08 section below)` was added above the existing 2026-09-08 Residual, which was retitled to mark it superseded — following the file's own established annotate-and-supersede discipline.

## RED evidence (Task 1, against unmodified `cdnAuth.ts`)

`npx jest --selectProjects Backend --runInBand -t "abort awareness"` against the pre-Task-1 `cdnAuth.ts`: 8 of the 8 new tests failed (behavioural failures — e.g. `getToken` accepting a signal argument that the unmodified 2-arg function silently ignored, `client._send` being called despite an already-aborted signal, the mid-flight-abort tests timing out at the then-unavoidable 3000ms bound rather than resolving promptly). Committed as `a1cbe297d` (test-only diff).

## GREEN evidence (Task 1)

After the `cdnAuth.ts` implementation (`c44c6cf7c`): full `cdnAuth.test.ts` run → **28/28 passed** (20 pre-existing + 8 new). `npx tsc --noEmit` clean.

## RED evidence (Task 2, against unmodified `decompress.ts`)

`npx jest --selectProjects Backend --runInBand -t "quick 260909-q2o"` against the pre-Task-2 `decompress.ts`: 2 of the 3 new wiring tests failed (the reference-equality spy assertion mismatched because the unmodified call site never forwarded `signal`; the mid-flight-cancel race test hit the full 5000ms Jest timeout because the abort was never observed inside the token await). The third (no-signal regression) passed, as expected since it exercises unchanged behavior. Committed as `c1286f392` (test-only diff).

## GREEN evidence (Task 2)

After the `decompress.ts` wiring (`8897e0e4b`): full `depotPrimitives.test.ts` run → **73/73 passed** (70 pre-existing + 3 new). `grep -q 'cdnAuth\.getToken(depotId, host, signal)' src/backend/storeManagers/steam/depot/decompress.ts` matches. `npx tsc --noEmit` clean.

## Before/after test counts (plan-required)

| File | Before | After | Delta |
|---|---|---|---|
| `cdnAuth.test.ts` | 20 | 28 | +8 |
| `depotPrimitives.test.ts` | 70 | 73 | +3 |

## Full-suite verification

Command: `npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/`

```
Test Suites: 38 passed, 38 total
Tests:       2 skipped, 1424 passed, 1426 total
```

- `npx jest --selectProjects Backend --runInBand src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts` → 2 suites, **101/101 passed** (28 + 73).
- `npx tsc --noEmit` → clean, no output.
- `pnpm planning-gates` → `9/9 planning gates passed.`
- `git diff --name-only` across every commit this task made shows exactly five files touched, one per commit: `cdnAuth.test.ts`, `cdnAuth.ts`, `depotPrimitives.test.ts`, `decompress.ts`, and the todo file. None of the five commits touches `.planning/STATE.md` or `.planning/ROADMAP.md`.

## `pnpm lint` — pre-existing ceiling breach, this task's own marginal contribution measured and disclosed

`pnpm lint` currently reports **4253 warnings against the `--max-warnings 4157` ceiling in `package.json`**, exit code 1. **This ceiling was already breached before this task started** — the project's own memory record (`backend-suite-and-lint-are-red-at-head.md`) documents the ratchet breached since at least 2026-09-06 (4166 → 4188-4199 warnings, growing), unrelated to this diff, and unowned debt on this branch (`fix/steam-native-install-stability`).

I measured this task's own marginal contribution by holding each commit's parent constant and swapping in the pre-edit version of each touched file (per the project's own "hold the commit constant, vary the tree" technique, not `git stash`):

| File | Warnings before my edit | Warnings after my edit |
|---|---|---|
| `cdnAuth.ts` | 0 | 0 |
| `decompress.ts` | 0 | 0 |
| `depotPrimitives.test.ts` | 11 | 11 |
| `cdnAuth.test.ts` | 7 | 11 (**+4**) |

The +4 are all `@typescript-eslint/unbound-method` warnings on `expect(client._send)...` assertions in the 9 new tests — the exact same pattern the file's own pre-existing SECURITY tests already use (2 of the pre-existing 7 warnings are this same rule on this same `client._send` reference shape). I did not restructure these tests to suppress the warning, because doing so would mean deviating from this file's own established fixture convention for a marginal addition to a gate that was already red by ~30-90 warnings before this task touched anything. **This is disclosed rather than fixed**: `pnpm lint` was red at HEAD before this task, is still red after it, and this task's own contribution to the total is +4 warnings, 0 errors.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] `depotPrimitives.test.ts`'s new tests could not reuse `makeFakeSendClient`**
- **Found during:** Task 2 test-writing
- **Issue:** `makeFakeSendClient` (from `cdnAuthSendFixture.ts`) is imported by `cdnAuth.test.ts` but not by `depotPrimitives.test.ts`; using it as initially written would fail to resolve.
- **Fix:** Built hand-rolled `CDNAuthTokenClient` fakes using this file's own already-in-scope `encodeCdnAuthTokenResponse()` helper, mirroring the file's existing `makeFakeCdnClient` pattern.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts`
- **Committed in:** `c1286f392`

**2. [Rule 1 - Bug] The plan's suggested mock shape for the mid-flight-cancel wiring test would have hung**
- **Found during:** Task 2 test-writing, before running any test
- **Issue:** The plan pointed at "the existing mock shape at ~L2107" for the mid-flight-cancel test. Reasoning through the execution order: the external signal's `'abort'` event fires *during* the token await, which synchronously aborts `fetchChunk`'s own inner per-attempt `AbortController` before `fetch()` is ever called. A mock that only registers a future `'abort'` listener (never checking `.aborted` synchronously up front) would never resolve when handed a signal that is already aborted at call time — because a listener added to an already-fired event never invokes. This would hang the test.
- **Fix:** Extended the `global.fetch` mock to check `opts?.signal?.aborted` synchronously first and reject immediately if true, matching real native `fetch()` semantics, before falling back to a listener for the not-yet-aborted case.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts`
- **Committed in:** `c1286f392`
- **Verification:** test passed with no timeout, full file 73/73 green.

**3. [Not a code deviation — verification finding, disclosed above]** The `pnpm lint` ceiling was already breached before this task; this task's own marginal contribution (+4 warnings, all in `cdnAuth.test.ts`) was measured and disclosed rather than fixed, per the reasoning in the `pnpm lint` section above.

## Accuracy notes (explicit, per this task's own instructions)

- **The 2026-08-27 stall is NOT explained, reproduced, or fixed by this task.** What closed is a bounded per-attempt latency window inside `cdnAuth.getToken` (3000ms max), not an unbounded rotation loop. Hypothesis B is **neutralised** (it can no longer produce an orphaned loop) — it was never **tested** against the original 2026-08-27 conditions, and no attempt was made to reproduce them here.
- **No live/hardware verification was performed for this task.** Every verification claim above (`tsc`, `jest`, `eslint`, `pnpm planning-gates`) was run against the desk/CI-reachable toolchain in this working tree. No Steam client, no live download, no Tauri sidecar was launched.
- **`pnpm lint` fails at 4253/4157 warnings, exit 1 — reported here plainly rather than glossed over.** It was already failing before this task (documented pre-existing debt since 2026-09-06); this task's own diff adds +4 warnings to that existing total (measured and detailed above), 0 errors.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/depot/cdnAuth.ts (modified)
- FOUND: src/backend/storeManagers/steam/depot/decompress.ts (modified)
- FOUND: src/backend/storeManagers/steam/__tests__/cdnAuth.test.ts (modified)
- FOUND: src/backend/storeManagers/steam/__tests__/depotPrimitives.test.ts (modified)
- FOUND: .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md (modified, status: OPEN, ready: human)
- FOUND commit a1cbe297d (Task 1 — test, RED)
- FOUND commit c44c6cf7c (Task 1 — feat, GREEN)
- FOUND commit c1286f392 (Task 2 — test, RED)
- FOUND commit 8897e0e4b (Task 2 — feat, GREEN)
- FOUND commit eeff144e5 (Task 3 — docs)
