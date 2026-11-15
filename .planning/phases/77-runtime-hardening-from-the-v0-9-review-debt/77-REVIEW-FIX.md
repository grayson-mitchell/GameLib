---
phase: 77
fixed_at: 2026-11-16T00:00:00Z
review_path: .planning/phases/77-runtime-hardening-from-the-v0-9-review-debt/77-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 77: Code Review Fix Report

**Source review:** 77-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

Verification per fix: `pnpm exec jest --selectProjects Relay` (184 passing at the end), `npx tsc -p relay/tsconfig.json --noEmit`, scoped `prettier --check`. Not deployed; the Worker behaviour changes (WR-01, WR-03) take effect only when the user deploys.

## Fixed Issues

### WR-01: awaited `reader.cancel()` can stall the response
**Files modified:** `relay/src/readCappedBody.ts`
**Commit:** 0f9996889
**Applied fix:** `void reader.cancel().catch(() => undefined)`, so a cancel that never settles cannot hold the response.

### WR-02: one oversized chunk buffered before the cap check
**Files modified:** `relay/src/readCappedBody.ts`
**Commit:** c0a81059b
**Applied fix:** Comment now states the bound is max plus one chunk, not exactly max. Documentation only.

### WR-03: stream read error answered 503
**Files modified:** `relay/src/readCappedBody.ts`, `relay/src/handler.ts`, `relay/src/__tests__/readCappedBody.test.ts`, `relay/src/__tests__/handler.test.ts`
**Commit:** d29d9067b
**Applied fix:** `readCappedBody` now returns `{ ok: false, reason: 'too-large' | 'read-error' }`; a read error returns `read-error`. The handler answers 400 `{status:'rejected', detail:'unreadable body'}` with log `relay: body read failed -> 400`. The `relay: body over cap -> 413` marker is unchanged, and other internal faults still go to 503. Tests updated to pin 400 and the new return shapes. Status changed from 503 to 400 for this case: requires human verification of intent (logic change).

### WR-04: weak chunked-body assertion
**Files modified:** `relay/src/__tests__/handler.test.ts`
**Commit:** 17424f423
**Applied fix:** The under-cap chunked test now asserts 201 and `created`. Added a handler-level test that splits a multibyte character across chunks and requires the same status and body as the string path, and not 400. Deviation: the report schema is a strict object with no free-text `note` field, so the fixture uses a non-ASCII `gamelibVersion` (rejected by schema, compared for parity) rather than a `note`.

## Skipped Issues

None. IN-01 (Info) was out of scope for `critical_warning`.

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
