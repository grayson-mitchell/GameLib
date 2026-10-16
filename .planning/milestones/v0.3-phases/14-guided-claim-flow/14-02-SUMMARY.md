---
phase: 14-guided-claim-flow
plan: 02
subsystem: api
tags: [humble-bundle, adapter, zod, axios, classify, electron-store, csrf, claim-flow]

# Dependency graph
requires:
  - phase: 14-guided-claim-flow (Plan 01)
    provides: HUMBLE_REDEEM_PATH constant, AdapterResult/RevealOutcome/RedeemOutcome/ClaimAnnotation types, HUMBLE_CLASSIFIER_VERSION bump to 4, humbleAuditStore/humbleLocalRedeemedStore scaffolding
provides:
  - "revealKey() — the codebase's first write-style Humble adapter call (POST /humbler/redeemkey), typed AdapterResult, C4-redacted logging"
  - "humblePostRequest — POST transport sibling to humbleRequest, form-encoded body + optional csrf-prevention-token header"
  - "OrderDetailTpkSchema keyindex field (tolerant string|number union)"
  - "classifyTpk D-77 local-redeemed precedence tier (below server truth, above local REVEALED)"
  - "classifyOrder keyIndexByComposite backend-only side-channel (gamekey:machineName -> keyindex), never on HumbleKey"
  - "HumbleUser csrf_cookie capture at login + getCsrfToken() accessor, main-process-only"
affects: [14-03, 14-04, 14-05, 14-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional trailing-parameter defaulting to preserve backward compatibility when widening a heavily-called pure function's signature/return type (classifyOrder)"
    - "Composite-key (gamekey:machineName) side-channel lookup map, kept off the public broadcast type, mirroring the isRevealed injected-predicate pattern"

key-files:
  created: []
  modified:
    - src/backend/humble/adapter.ts
    - src/backend/humble/__tests__/adapter.test.ts
    - src/backend/humble/classify.ts
    - src/backend/humble/__tests__/classify.test.ts
    - src/backend/humble/user.ts
    - src/backend/humble/__tests__/user.test.ts
    - src/common/types/electron_store.ts

key-decisions:
  - "classifyOrder's new isLocallyRedeemed predicate is inserted as an optional 4th positional parameter AFTER now (not immediately after isRevealed), defaulting to always-false, and the return type is widened via an intersection type rather than reshaped to {entry, keyIndexByComposite} — this keeps library.ts's existing 3-arg call site (out of scope this plan, deferred to Plan 03) fully type-correct and behaviorally unchanged with zero edits, while still satisfying every behavioral/acceptance requirement."
  - "classifyTpk's isLocallyRedeemed parameter is a REQUIRED 3rd positional argument (matches RESEARCH.md Pattern 5 exactly) since it is only called directly from a small, fully-owned set of test sites plus classifyOrder itself — all updated in this plan."
  - "Added csrfToken?: string to the humbleConfigStore schema in common/types/electron_store.ts (not in files_modified) — a minimal, non-architectural Rule 3 fix required for configStore.set/get_nodefault('csrfToken', ...) to type-check under TypeCheckedStoreBackend's generic key constraints."

patterns-established:
  - "First write-style Humble adapter call (revealKey) establishes the POST-transport pattern (humblePostRequest) other Phase 14/15 write endpoints will reuse."

requirements-completed: [HCLAIM-01, HCLAIM-03]

# Metrics
duration: ~20min
completed: 2026-07-08
---

# Phase 14 Plan 02: Reveal Adapter, keyindex Side-Channel, CSRF Capture Summary

**revealKey() POST adapter call + humblePostRequest transport, keyindex schema/side-channel extraction, classifyTpk D-77 local-redeemed tier, and opportunistic csrf_cookie capture — all redaction-tested, zero breakage to existing 3-file/346-test Humble suite.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed
- **Files modified:** 7 (6 planned + 1 deviation: `common/types/electron_store.ts`)

## Accomplishments
- Added `revealKey()` — the codebase's FIRST write-style Humble adapter call — behind `AdapterResult`, with a new `humblePostRequest` POST transport sibling mirroring `humbleRequest`'s discipline (finite timeout, string-body JSON coercion, header shape). Naming trap honored: the `keytype` form field carries `machineName`, not the platform label.
- `OrderDetailTpkSchema` now tolerates a `keyindex: string | number` field; `classifyOrder` extracts it into a new backend-only `keyIndexByComposite` map keyed by `gamekey:machineName` — never placed on the broadcast `HumbleKey` type.
- `classifyTpk` gained the D-77 local-redeemed precedence tier (server truth still wins; local-redeemed beats local-revealed) with a 4-param signature matching RESEARCH.md's Pattern 5 exactly.
- `classifyOrder`'s widened signature/return type is 100% backward compatible — `pnpm codecheck` and the pre-existing `library.test.ts`/`library.realstore.test.ts` (which call the OLD 3-arg signature, untouched) both pass with zero edits to `library.ts`.
- `HumbleUser` now opportunistically captures `csrf_cookie` at the same login moment as `_simpleauth_sess` (same `safeStorage` encryption treatment), with a new `getCsrfToken()` accessor mirroring `getCredentials()`. Absence is non-fatal; the value is wiped by `disconnect()`'s existing wholesale `configStore.clear()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add revealKey() write call + humblePostRequest + keyindex schema field** - `2b9e291e` (feat)
2. **Task 2: Extend classify with keyindex side-channel and isLocallyRedeemed tier** - `bbc4f21b` (feat)
3. **Task 3: Capture csrf_cookie at login** - `b16d3545` (feat)

_No TDD RED/GREEN/REFACTOR split — plan tasks are `type="auto" tdd="true"`/`type="auto"` with tests co-authored per-task per the plan's own action/behavior blocks, not a strict RED-first TDD gate._

## Files Created/Modified
- `src/backend/humble/adapter.ts` — `humblePostRequest`, `revealKey()`, `RevealResponseSchema`, `OrderDetailTpkSchema.keyindex`
- `src/backend/humble/__tests__/adapter.test.ts` — `revealKey` describe block (outcome branches + header/body/redaction assertions); axios mock gains `post`
- `src/backend/humble/classify.ts` — `classifyTpk` D-77 tier (4-param signature), `classifyOrder` `isLocallyRedeemed`/`keyIndexByComposite`
- `src/backend/humble/__tests__/classify.test.ts` — updated all 7 direct `classifyTpk` calls to the new 4-param signature + new precedence tests; 2 new `describe` blocks for `keyIndexByComposite` and the composite `isLocallyRedeemed` predicate
- `src/backend/humble/user.ts` — csrf_cookie capture in `finishLogin`, `HumbleUser.getCsrfToken()`
- `src/backend/humble/__tests__/user.test.ts` — csrf capture/absence/disconnect/redaction tests
- `src/common/types/electron_store.ts` — `humbleConfigStore.csrfToken?: string` (deviation, see below)

## Decisions Made
- **classifyOrder backward-compatibility strategy**: rather than reshaping the return to `{entry, keyIndexByComposite}` (which would have forced edits to ~50 existing `classify.test.ts` call sites plus the out-of-scope `library.ts`), the return type is widened via TypeScript intersection (`HumbleOrderCacheEntry & { keyIndexByComposite }`). Structural typing means `entry.keys`/`entry.allTerminal` reads and `humbleLibraryStore.set(gamekey, entry)` writes in untouched code keep compiling and behaving identically. `isLocallyRedeemed` is likewise an optional 4th positional param (after `now`, not immediately after `isRevealed`) defaulting to `() => false`, so `library.ts`'s existing 3-arg call is untouched this plan (per plan text: "library.ts call-site updates land in Plan 03") while still fully exercisable by new tests that pass all 4 args explicitly.
- **classifyTpk stays a required-param change** (no default) since RESEARCH.md's Pattern 5 code example shows exactly this 4-param shape and every call site is inside files this plan owns (`classify.ts` itself, `classify.test.ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `csrfToken?: string` to the `humbleConfigStore` schema**
- **Found during:** Task 3 (csrf_cookie capture)
- **Issue:** `configStore.set('csrfToken', ...)` and `configStore.get_nodefault('csrfToken')` failed `pnpm codecheck` with `TS2345: Argument of type 'string' is not assignable to parameter of type 'never'` — `TypeCheckedStoreBackend`'s generics constrain valid keys to the `StoreStructure['humbleConfigStore']` interface in `common/types/electron_store.ts`, which did not yet declare `csrfToken`.
- **Fix:** Added `csrfToken?: string` to the `humbleConfigStore` interface, following the exact same `sessionCookie?: string` comment convention (safeStorage-encrypted, `humble:v1:` prefix).
- **Files modified:** `src/common/types/electron_store.ts`
- **Verification:** `pnpm codecheck` exits 0; `pnpm jest src/backend/humble/__tests__/user.test.ts` (38 tests) exits 0.
- **Committed in:** `b16d3545` (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking type error)
**Impact on plan:** Necessary for the plan's own stated goal (persist an encrypted csrfToken under configStore) to type-check at all. No scope creep — a single interface field addition, not a new store or architectural change.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `revealKey()`/`humblePostRequest` are ready for Plan 03's orchestration (IPC handler, write-ahead audit, direct cache-projection patch) to call.
- `keyIndexByComposite` is available from `classifyOrder` for Plan 03's `library.ts` wiring to consume when it updates the (currently untouched) 3-arg call site to the full 4-arg form and threads `humbleLocalRedeemedStore`'s lookup into `isLocallyRedeemed`.
- `HumbleUser.getCsrfToken()` is ready for Plan 03/06 to thread into `revealKey`'s `csrfToken` parameter; the reveal endpoint's actual CSRF requirement remains unconfirmed until the Plan 06 live validation checkpoint (T-14-07, accepted disposition per the plan's threat model).
- No blockers. Full Humble backend test suite (11 suites, 346 tests) and `pnpm codecheck` both pass.

---
*Phase: 14-guided-claim-flow*
*Completed: 2026-07-08*

## Self-Check: PASSED
