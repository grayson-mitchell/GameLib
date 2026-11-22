---
phase: 85
fixed_at: 2026-11-22T00:00:00Z
review_path: .planning/phases/85-store-host-config-and-versioned-migrations/85-REVIEW.md
iteration: 3
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 85: Code Review Fix Report

**Fixed at:** 2026-11-22
**Source review:** .planning/phases/85-store-host-config-and-versioned-migrations/85-REVIEW.md
**Iteration:** 3

**Summary:**
- Findings in scope: 1 (E-WR-01; E-IN-01 and E-IN-02 were excluded by the caller)
- Fixed: 1
- Skipped: 0

## Fixed Issues

### E-WR-01: `settleRefetches` returns while a queued second re-fetch is still starting (reopens D-WR-03)

**Files modified:** `src/preload/tauriTransport.ts`, `src/preload/__tests__/tauriTransport.test.ts`
**Commit:** 8ec57de30
**Status:** fixed: requires human verification (microtask-ordering logic fix)
**Applied fix:** Took the review's "sturdier" option. A new `queuedRefetch` map records the re-fetch the `invalidated` listener queues behind a running fetch (`running.then(() => hydrateStore(store))`), cleared by a `finally` once it settles. `settleRefetches` now follows `queuedRefetch.get(store) ?? inflight.get(store)` each pass, so it no longer depends on the order in which promise reactions on the finished fetch run. The 5 s `BOOT_REFETCH_WAIT_MS` race and the `finally`-cleared timer are unchanged, so boot still cannot hang.

**Regression test:** `E-WR-01: a second invalidated push after the boot wait parked on the running re-fetch is still waited for`. It parks the boot wait on the first re-fetch, sends a second `invalidated` push, resolves the first fetch (discarded by the epoch check), asserts `hydrateStoreSnapshot` has not returned, then resolves the second fetch and asserts the store holds the second fetch's value with no warning. It sits between the two D-WR-03 cases because the stale-push guard and `inflight` are module state, and the "never answers" case leaves a stuck fetch behind. Run against the unfixed `tauriTransport.ts` (HEAD version), it fails (1 failed, 48 passed); with the fix, 49 of 49 pass.

**Verification:** run in the main checkout (`workflow.use_worktrees` is false, no worktree used). `npx prettier --check` on both TS paths passed. `pnpm jest src/preload` passed: 217 of 217.

---

_Fixed: 2026-11-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
