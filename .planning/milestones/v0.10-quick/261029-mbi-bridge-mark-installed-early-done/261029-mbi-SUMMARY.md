---
phase: quick-261029-mbi
plan: 01
status: complete
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
metrics:
  completed: 2026-10-29
---

# Quick 261029-mbi summary

`markBridgeGameInstalled()` no longer sends `gameStatusUpdate { done }`. It still flips and persists
`is_installed` and pushes the game to the library. The bridge install's own `finally` sends the
only `done`, after the shared redists and DRM prefetch.

New test `quick 261029-mbi: the only done is the final one, after the redist step` failed on the
old code (one `sendFrontendMessage('gameStatusUpdate', {status:'done'})`) and passes now.

Verification: steam suites 91/91 (3475 passed), tsc clean, prettier clean, eslint 0 errors.
Live check passed 2026-10-29: Grim Dawn reinstall, the game page showed no Play until the install
finished.
