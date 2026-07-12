---
phase: quick-260712-lkn
plan: 01
subsystem: wiki-game-info / game-page-ui
tags: [crossover, codeweavers, cache, refresh, ipc, mui]
requires:
  - getWikiGameInfo backend + IPC
  - GameContext wikiInfo plumbing
  - AppleWikiInfo CrossOver pill
provides:
  - getWikiGameInfo forceRefresh cache-bypass
  - refreshWikiInfo GameContext callback
  - Refresh IconButton on CrossOver rating pill
affects:
  - src/backend/wiki_game_info
  - src/frontend/screens/Game
tech-stack:
  added: []
  patterns:
    - MUI IconButton + Refresh icon inside iconWithText pill
    - stopPropagation/preventDefault to suppress parent <a> navigation
key-files:
  created: []
  modified:
    - src/backend/wiki_game_info/wiki_game_info.ts
    - src/backend/wiki_game_info/ipc_handler.ts
    - src/common/types/ipc.ts
    - src/frontend/types.ts
    - src/frontend/screens/Game/GamePage/index.tsx
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
decisions:
  - "Refresh path accepts any non-null wiki result (unlike the initial useEffect gate) so a codeweavers-only update lands"
  - "IPC forceRefresh is optional; preload makeHandlerInvoker forwards extra args automatically (no preload edit needed)"
metrics:
  duration: ~10m
  completed: 2026-07-12
  tasks: 2
  files-modified: 6
---

# Quick 260712-lkn: Add refresh affordance for CrossOver compatibility rating Summary

Adds a user-facing MUI Refresh IconButton on the CrossOver rating pill (macOS/Linux) that force-refetches wiki info bypassing the 30-day cache, backed by a `forceRefresh` parameter threaded through `getWikiGameInfo` and its IPC handler — so a game cached as unrated (real `null` codeweavers rating) can be re-checked on demand instead of waiting for the TTL to expire.

## What Was Built

### Task 1 — forceRefresh plumbing (commit 7a477f16)
- `getWikiGameInfo(game, forceRefresh = false)` — the cached-response early return now guards on `!forceRefresh`, so a `true` value falls through to the fresh fetch and the existing `wikiGameInfoStore.set(...)` re-populates the cache.
- `ipc_handler.ts` threads `forceRefresh` from the IPC call into the backend.
- `ipc.ts` type signature carries the optional `forceRefresh?: boolean` arg. The preload `makeHandlerInvoker` forwards the extra arg automatically — no preload change required.

### Task 2 — Refresh button on the CrossOver pill (commit c474c4ee)
- `GameContextType` gains optional `refreshWikiInfo?: () => Promise<void>` (type-only; `initialContext` left as-is since the field is optional).
- `GamePage/index.tsx` defines a `useCallback` that calls `window.api.getWikiGameInfo(title, appName, runner, true)` and sets any non-null result — intentionally looser than the initial `useEffect` gate so a codeweavers-only update still lands. Wired into `contextValues`.
- `AppleWikiInfo.tsx` renders a small `IconButton` (size="small") with `<Refresh fontSize="small" />` inside the CrossOver pill. Its onClick calls `stopPropagation()` + `preventDefault()` (so the parent `<a onClick={onClickCrossover}>` does not open CodeWeavers), toggles a local `refreshing` state, awaits `refreshWikiInfo?.()`, and resets in a `finally`. The button is `disabled={refreshing}` while in flight. Uses the `t('info.refresh-rating', 'Refresh rating')` translation for both `title` and `aria-label`.

## Deviations from Plan

### Minor implementation adjustments (not behavioral deviations)
- **Event type import:** Used `import { MouseEvent } from 'react'` for the handler param instead of `React.MouseEvent`, since the component imports React named exports (no default `React` namespace in scope). Keeps tsc clean.
- **GameContext.tsx:** Listed in the plan's `files_modified`, but per the plan's own Task 2 step 2 the file needs no change (the new context field is optional). Left untouched — not committed.

## Verification

- `npx tsc --noEmit` — no new type errors in any edited file (wiki_game_info, ipc.ts, AppleWikiInfo, GamePage/index, GameContext, frontend/types).
- `npx eslint --cache` on all 6 edited files — exit 0. Frontend file emits only pre-existing warnings (floating-promise / exhaustive-deps) consistent with the rest of the file; no new errors.
- `npx jest src/backend/wiki_game_info/codeweavers/__tests__/utils.test.ts` — 17/17 pass, no regression.

## Known Stubs

None.

## Self-Check: PASSED
- Modified files present: all 6 confirmed on disk.
- Commits present: 7a477f16 (Task 1), c474c4ee (Task 2) confirmed in git log.
