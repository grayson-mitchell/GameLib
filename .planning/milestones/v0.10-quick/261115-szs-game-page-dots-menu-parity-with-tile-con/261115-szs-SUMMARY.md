---
status: complete
task: 261115-szs
---

# Quick 261115-szs: Game page dots menu parity with tile context menu

GameSubMenu (game page three-dot menu) now has Add/Remove Favourites, Hide/Unhide, Logs (installed, not uninstalling, non-browser) and an always-visible Edit Game, mirroring GameCard. A source-text guard (`tileMenuParity.test.ts`) pins all four; it failed (RED) before the change and passes after.

Files: `src/frontend/screens/Game/GameSubMenu/index.tsx`, `src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts`.

Verification: jest GameSubMenu 6 suites / 55 tests pass; tsc clean; eslint 0 errors (16 pre-existing warnings); prettier clean.

Deviations: none. Tasks 1 and 2 share one commit (test and implementation committed together).
