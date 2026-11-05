---
phase: quick-261105-pnh
plan: 01
subsystem: frontend/WebView store-exit refresh
tags: [amazon, epic, gog, library-refresh]
key-files:
  modified:
    - src/frontend/screens/WebView/storeExitRefresh.ts
    - src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts
    - src/frontend/screens/WebView/index.tsx
    - .planning/todos/completed/2026-11-02-amazon-store-exit-should-refresh-epic-and-gog.md (moved from pending/)
completed: 2026-11-05
---

# Quick 261105-pnh: Amazon store exit refreshes Epic and GOG

Store-exit rows now carry `targets`, so leaving `/store/amazon` runs scoped refreshes for nile, legendary and gog. Each runner has its own sign-in gate. The in-flight guard is keyed per runner, and there is no time throttle.

## Commits

- 37563875e test: failing tests for multi-runner store exit (RED)
- c2666b23a feat: `StoreExitTarget`, multi-target rows, per-runner in-flight, `runStoreExitRefreshAll` (GREEN)
- 60d3d880f feat: `onStoreExit` in `index.tsx` calls `runStoreExitRefreshAll`
- 3b12170e1 docs: todo moved to `completed/` with a Closed section

## Verification (real output)

- `storeExitRefresh.test.ts` passes (106 tests). The three WebView suites pass (198 tests).
- `pnpm codecheck` is clean.
- eslint reports 0 errors. The one warning is `react-hooks/exhaustive-deps` at `index.tsx:463`. It sits in a different effect from the one I edited, so I left it.
- `prettier --check` passes on all three source files. All were confirmed not ignored.
- `pnpm planning-gates` passes 12/12. The todo path is prettier-ignored, so no `--check` was run on it.
- `graphify update .` was run.

## Deviations

- Each outcome log line gains ` runner=<r>` as specified. The pre-existing assertions use `toContain`, so they stay green.
- The existing test blocks were not edited. Only the import list changed, in the RED commit.

## Live check: NOT done (human step)

Leave `/store/amazon` after an Epic-delivered Prime claim, without a manual Refresh. Confirm the claim appears and the log shows `origin=amazon-store-exit runner=legendary` and `[refreshLibrary] runner=legendary origin=amazon-store-exit`. Run it under `pnpm tauri:dev`. No sidecar rebuild is needed.

## Known stubs

None.

## Self-Check: PASSED

Commits 37563875e, c2666b23a, 60d3d880f and 3b12170e1 exist. The todo is under `completed/` only.
