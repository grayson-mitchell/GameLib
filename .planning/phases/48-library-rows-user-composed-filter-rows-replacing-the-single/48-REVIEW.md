---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
reviewed: 2026-10-07T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/common/focusRowMigration.ts
  - src/frontend/state/GlobalState.tsx
  - src/backend/sidecar/__tests__/focusRowFirstLaunchHydration.test.ts
  - src/frontend/state/__tests__/GlobalStateFocusRowHydration.test.ts
  - src/common/__tests__/focusRowMigration.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 48: Code Review Report (incremental, 48-07 gap closure)

**Reviewed:** 2026-10-07
**Depth:** standard
**Files Reviewed:** 7 (diff `f6d850366..6e474fb3d`)
**Status:** issues_found

## Summary

Incremental review of gap-closure plan 48-07 (CR-01 first-launch hydration, WR-01 view whitelist, WR-02 present-key disarm). The fixes are correct on the points the brief asked about. I traced each one against the real backend path (`settingsFlowRegistration.ts` handlers, `GlobalConfigV0.getSettings()`/`setSetting()`/`flush()` in `config.ts`):

- **Hydration vs user-pick race:** `hasUserPicked()` is read after the `await`, and `handleFocusRow` sets `focusRowPickedThisSession` synchronously before it persists. A pick made while the IPC is in flight wins and is persisted by the pick itself. Correct. The unit test covers it.
- **Rejected `requestAppSettings`:** the `await` is inside the single `try`, so the rejection is caught, reported through `onError`, and the helper resolves `undefined`. `void` is therefore safe for that path. One gap remains (WR-03 below).
- **Re-fire:** `needsMigratedValue` is computed once at module scope, and `componentDidMount` runs once per mount. The root `GlobalState` mounts once per page load, and `StrictMode` is commented out in `index.tsx`. A page reload re-reads the mirror, which hydration has by then written, so it does not re-fire. A same-page remount would re-fire (IN-06), but harmlessly.
- **Write scope:** the only write is `setSetting({appName:'default', key:'focusRow'})`. `setSetting` spreads the existing mirror, so `games.*` and the other settings are untouched. The real-path test asserts this.
- **WR-01 whitelist:** `FOCUS_ROW_VIEW_VALUES` matches `LibraryView` (`frontend/types.ts:432`, four members) exactly.
- **WR-02:** the present-key short-circuit in `migrateFocusRowSelection` and in `seedFocusRowFromMirror` is consistent on both sides.

No security issues. No critical issues.

## Warnings

### WR-03: `hydrateFocusRowSelection` "NEVER rejects" contract is broken if `onError` throws

**File:** `src/common/focusRowMigration.ts:215-218` (caller: `src/frontend/state/GlobalState.tsx:1495-1505`)
**Issue:** The `catch` block calls `deps.onError(error)` unguarded. The JSDoc, the `void` at the call site and the comment "`void` is safe ONLY because hydrateFocusRowSelection never rejects" all rest on the promise never rejecting. `onError` is `window.api.logError(...)`, which is a bridge call. The failure that lands in this `catch` is typically "the backend is unreachable or not ready". That is the case where a second bridge call is most likely to fail too. If `logError` throws, the async function rejects and `void` turns it into an `unhandledrejection`. The test suite only covers a throwing `applyFocusRow`, not a throwing `onError`. The project already has a documented history of `void p` handling nothing and of unhandled rejections surfacing as random failures.
**Fix:**
```ts
  } catch (error) {
    try {
      deps.onError(error)
    } catch {
      // The reporter failed too; there is nowhere left to report to. Resolve.
    }
    return undefined
  }
```
Add a unit test where `onError` throws and assert `resolves.toBeUndefined()`.

## Info

### IN-05: `testContainment.test.ts` bookkeeping not maintained for the new suite

**File:** `src/backend/sidecar/__tests__/testContainment.test.ts:911-923, 933`
**Issue:** The new entry `'focusRowFirstLaunchHydration.test.ts'` is inserted before `'electronReachLedger.test.ts'` and `'eosOverlayFlows.test.ts'`, so the list is no longer alphabetical like its neighbours. The running tally in the preceding doc comment ("69 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 65 below") was not advanced. The directory is at 70 files, so it is now 4 + 66. The drift gate compares sets, so nothing fails. The tally and ordering are only convention, but the tally is the thing a later contributor uses to sanity-check a `readdirSync` recount.
**Fix:** Move the entry after `'eosOverlayFlows.test.ts'`, to its sorted position. Append "70 `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 66 below." to the new paragraph.

### IN-06: Hydration guard is per-module, not per-mount; the "once" claim holds per page load only

**File:** `src/frontend/state/GlobalState.tsx:64, 1494-1506`
**Issue:** `focusRowMirrorSeed.needsMigratedValue` is a module-level constant and `focusRowPickedThisSession` is an instance field. If `GlobalState` is ever remounted without a page reload (HMR in dev, a future route-level remount), the constant is still `true` and the new instance has `focusRowPickedThisSession === false`. Hydration then re-runs, re-reads the backend, and re-applies and re-writes the persisted value. This is harmless today because any earlier user pick was persisted and the backend returns it, so the value is identical. But the "never overwrite a user pick" invariant then depends on the persisted value matching the in-memory one, not on the flag.
**Fix:** Optional hardening. Flip a module-level `focusRowHydrationStarted` flag when the call is dispatched, or set `focusRowMirrorSeed.needsMigratedValue` false after the first dispatch. Not required.

### IN-07: Drift-guard comment overstates what `pnpm codecheck` catches

**File:** `src/common/focusRowMigration.ts:24-29`; `focusRowSelectors.test.ts:63-75`
**Issue:** The comment says the `satisfies Record<LibraryView, true>` case "fails `pnpm codecheck` if `LibraryView` gains a member this list lacks". Strictly, `tsc` fails when `LibraryView` gains a member that the test's own `ALL_VIEWS` literal lacks. It is the jest assertion on the following lines that then fails if `FOCUS_ROW_VIEW_VALUES` lacks the member. The whitelist is never type-linked to `LibraryView`, so the guard is two steps, and the second step is a test run, not codecheck. The guard does work, but a reader who trusts the comment will skip the test run.
**Fix:** Reword to "`tsc` forces `ALL_VIEWS` in `focusRowSelectors.test.ts` to gain the member, and that test then fails if this list lacks it."

---

_Reviewed: 2026-10-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
