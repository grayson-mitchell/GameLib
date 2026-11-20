---
phase: quick-261029-mbi
plan: 01
type: quick
autonomous: true
files_modified:
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
---

# Quick 261029-mbi: bridge install sends no early `done` from markBridgeGameInstalled

## Problem (live retest of 261029-exu, Grim Dawn 219990, 2026-10-29 14:24:51)

The game page went "Finishing install…" → Play → "Installing Redistributables". The log showed
`[refreshLibrary] origin=game-status` at 14:24:51, which the frontend only runs on a `done`/`error`
status. 261029-exu stopped the bridge ACF poller's `done`, but `installBridgeGameLeased` calls
`markBridgeGameInstalled()` right after shim placement, and that helper also sent
`gameStatusUpdate { done }`. That cleared the finishing status until the redist step's first
`'redist'` status arrived ~2-5 s later.

## Change

Drop the `done` from `markBridgeGameInstalled()` (its only caller is the bridge install tail). The
tail's `finally` already sends the one final `done`; the wrapper's `clearFinishing()` covers error
returns and throws.

## Tasks

### Task 1: remove the early done + regression test

<verify>
- `npx jest src/backend/storeManagers/steam` (new test fails on the old code: one frontend `done`)
- `npx tsc --noEmit -p .`
- `npx prettier --check` over the two written paths; eslint 0 errors
</verify>

<done>
A successful bridge install sends exactly one `done`, after the shared-redist step, and no
`gameStatusUpdate done` through `sendFrontendMessage`.
</done>
