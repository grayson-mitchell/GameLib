---
phase: 77-runtime-hardening-from-the-v0-9-review-debt
depth: standard
reviewed: 2026-11-16
files_reviewed: [relay/src/readCappedBody.ts, relay/src/handler.ts, relay/src/__tests__/readCappedBody.test.ts, relay/src/__tests__/handler.test.ts]
critical: 0
warning: 4
info: 1
status: issues_found
---

# Phase 77 Code Review

Diff reviewed: `cd6f7946b~1..cc7df4830 -- relay/`. (Reviewer returned findings inline; orchestrator transcribed them here.)

## Verified correct

- Boundary: `total > max` — exactly `max` accepted, `max+1` rejected; matches the Content-Length `declared > MAX` check; both tested.
- UTF-8 split across chunks: bytes concatenated, decoded once — split multi-byte chars decode correctly (tested with "café" split mid-char).
- Cancellation: `reader.cancel()` on overflow, rejection swallowed; tested with a never-closing stream.
- Error propagation: stream error rejects → `handleReport` catch → 503; tested.
- Content-Length fast path: missing/lying/NaN header falls through to the capped read. Order is rate limit → 415 → CL → capped read, so over-cap bodies still count against the IP limit.

## Warnings

### WR-01: awaited `reader.cancel()` can stall the response (`readCappedBody.ts:16`)
A source whose `cancel()` never settles holds the response. Not reachable via the runtime's own request stream; reachable for wrapped/caller-supplied streams. Fix: `void reader.cancel().catch(() => undefined)` or race a short timeout.

### WR-02: one oversized chunk is buffered before the cap check (`readCappedBody.ts:12-15`)
Memory bound is `max + one chunk`, not `max`. Acceptable on Workers (platform request-size limits), but the "bounds the body" comment overstates it. Fix: document the bound.

### WR-03: client disconnect / malformed chunked body answers 503 (`handler.ts:61-67`, `readCappedBody.ts:12`)
A truncated body throws from `read()` and the generic catch answers 503 — looks like an outage, may prompt retries, adds 5xx noise. Fix: return `{ ok: false, reason: 'read-error' }` and answer 400; keep 503 for internal faults.

### WR-04: weak assertion in "accepts a chunked body under the cap" (`handler.test.ts:267-276`)
Compares against a string-body baseline and excludes `[411, 413, 400, 415]`; a shared wrong status (e.g. 422) would pass. Handler-level chunked fixtures are ASCII only. Fix: assert the explicit expected status; add a non-ASCII `note` split across chunks at handler level.

## Info

### IN-01: non-fatal `TextDecoder` (`readCappedBody.ts:27`)
Invalid UTF-8 becomes U+FFFD and a BOM is stripped — same as the prior `request.text()`, so no regression. `{ fatal: true }` would allow a 400 instead; worth an explicit choice.
