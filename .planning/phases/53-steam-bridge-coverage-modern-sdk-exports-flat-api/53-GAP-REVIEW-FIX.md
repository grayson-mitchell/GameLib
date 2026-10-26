---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
fixed_at: 2026-10-25T00:00:00Z
review_path: .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-GAP-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 53: Gap-Closure Code Review Fix Report

**Fixed at:** 2026-10-25 (ledger written 2026-10-26)
**Source review:** .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-GAP-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 7 (CR-01, WR-01..WR-06; IN-01..IN-06 out of scope)
- Fixed: 7
- Skipped: 0

`/gsd-code-review --fix` did not apply these fixes. Gap-closure plans 53-17 and 53-18 did,
closing VERIFICATION gaps 2 and 3. This ledger was written afterwards to map every finding to
its commit. Their tests are green as of the 2026-10-26 validation audit (`53-VALIDATION.md`).

## Fixed Issues

### CR-01: The 012 exclusion of the hidden-pointer `GetPublicIP` export writes 20 bytes over `g_steamgameserver012_instance`

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`
**Commit:** 25196be0e (plan 53-17)
**Applied fix:** The hidden-pointer flat fallback is guarded, so it no longer writes over the shim's instances. GameServer012 `GetPublicIP` is now dispatched and gives callers a real answer.

### WR-01: The census CALL regex is no longer anchored, so game-supplied version strings can forge CALL, HELLO and NOVER evidence

**Files modified:** `meta/bridgeCensus.ts`, `meta/__tests__/bridgeCensus.test.ts`
**Commit:** 6789d13d9 (plan 53-18)
**Applied fix:** Evidence is anchored to the helper's own `[ts] CATEGORY` payload, so text inside a FWD or NOVER payload cannot forge CALL, NOVER or HELLO.

### WR-02: The shim reports `*pcbTicket` independently of the bytes it actually copied

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`
**Commit:** a23f96439 (plan 53-17)
**Applied fix:** The reported length is the number of bytes actually copied.

### WR-03: The `char*` out-buffer NUL terminator writes one byte past the caller's capacity

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`
**Commit:** a23f96439 (plan 53-17)
**Applied fix:** The NUL is written inside the caller's capacity.

### WR-04: Helper out-buffer without `lenParam` returns `cap` bytes of a never-cleared static buffer

**Files modified:** `meta/gen_vtables.ts`, `meta/__tests__/gen_vtables.test.ts`
**Commit:** a23f96439 (plan 53-17)
**Applied fix:** The scratch buffer is cleared, so no stale bytes leak into the reply.

### WR-05: Per-chunk splitting still loses CALL and HELLO lines that straddle a `data` boundary

**Files modified:** `src/backend/storeManagers/steam/bridge/helperProcess.ts`, `src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts`
**Commit:** eeafd0fa3 (plan 53-18)
**Applied fix:** The stdout/stderr relay carries a partial line over to the next chunk and reassembles it.

### WR-06: `appLogSegmentFor` drops evidence written after a log rotation

**Files modified:** `meta/bridgeCensus.ts`, `meta/__tests__/bridgeCensus.test.ts`
**Commit:** 6789d13d9 (plan 53-18)
**Applied fix:** The launch segment spans `gamelib.log` rotation.

## Out-of-scope items (advisory, not fixed)

| Finding | Disposition |
|---------|-------------|
| IN-01: Out-buffer guard reuses an error message that says "'out-value'" | Skipped, advisory |
| IN-02: `helperTrailingNullArgs` always types the extra native params as `const void *` | Skipped, advisory |
| IN-03: T-52-09 comment still detached from `sanitize_ver` | Skipped, advisory |
| IN-04: A test insertion split a comment block in `helperProcess.test.ts` | Skipped, advisory |
| IN-05: `(size < 0)` capacity guard is tautological for unsigned `sizeParam` types | Skipped, advisory |
| IN-06: Section span ignores `SizeOfRawData` when `VirtualSize > SizeOfRawData` | Skipped, advisory |

---

_Fixed: 2026-10-25_
_Ledger: Claude, 2026-10-26_
