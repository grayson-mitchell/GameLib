---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
fixed_at: 2026-10-25T00:00:00Z
review_path: .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-GAP2-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 53: Gap-Closure Code Review 2 Fix Report

**Fixed at:** 2026-10-25 (ledger written 2026-10-26)
**Source review:** .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-GAP2-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 2 (WR-01, WR-02; IN-01..IN-04 out of scope)
- Fixed: 2
- Skipped: 0

`/gsd-code-review --fix` did not apply these fixes. Quick task 261025-kon did, and
`53-VERIFICATION.md` § "WR-01 / WR-02 confirmed in code" confirms both. This ledger was written
afterwards to map each finding to its commit.

## Fixed Issues

### WR-01: `emitHiddenFallback` dispatches a dropped RAX-form version without checking its return class

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`
**Commit:** 007bb1ffd (quick 261025-kon)
**Applied fix:** Generation now throws for any dropped RAX-form version whose `returnKind` is not int32, int64, pointer or string. This adds to the existing throw for params > 0. Six new tests cover it.

### WR-02: Override failures that carry no truthy exit code are logged as nothing

**Files modified:** `src/backend/storeManagers/steam/bridge/bottleDllOverrides.ts`, `src/backend/storeManagers/steam/bridge/__tests__/bottleDllOverrides.test.ts`, `meta/__tests__/logSecretGate.test.ts`
**Commit:** 2a2d0935d, 06bbd6955 (log-secret gate exemption) (quick 261025-kon)
**Applied fix:** Success requires `result?.code === 0`. A missing, null or nonzero code is a failure, and the log line carries the code and truncated stderr.

## Out-of-scope items

| Finding | Disposition |
|---------|-------------|
| IN-01: Generated comment and generator error text still say GameServer012 `GetPublicIP` is "not dispatched" | Fixed in 007bb1ffd (kon) via `isHiddenFallbackDispatched` |
| IN-02: A `char*` out-buffer is left unterminated on the skip and transport-failure paths | Skipped, advisory |
| IN-03: HELLO acceptance differs between `hasHello` and `appLogSegmentFor`; `HELPER_PREFIX` not anchored to the logger header | Skipped, advisory |
| IN-04: The override is keyed on a hard-coded exe basename never checked against the launched exe | Skipped, advisory |

---

_Fixed: 2026-10-25_
_Ledger: Claude, 2026-10-26_
