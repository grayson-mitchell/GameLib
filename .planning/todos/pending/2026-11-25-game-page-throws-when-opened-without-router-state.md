---
created: 2026-11-25T07:00:00.000Z
title: "The game page throws when opened without router state instead of loading the game itself"
area: ui
files:
  - src/frontend/screens/Game/GamePage/index.tsx:112 (const { gameInfo } = location.state, unguarded)
  - src/frontend/screens/Game/GamePage/index.tsx:126-131 (useState(locationGameInfo), then gameInfo.* read during render)
  - src/frontend/components/UI/NavShell/tabLocationMemory.ts (never remembers a stateless game page for this reason)
  - src/frontend/App.tsx:238 (RouteErrorSurface catches the throw)
severity: minor
platform: any
ready: code
---

## Problem

`GamePage` gets its `GameInfo` only from router state: `const { gameInfo: locationGameInfo } = location.state`
(`index.tsx:112`). It seeds `useState(locationGameInfo)` with that value and reads `gameInfo.is_installed`,
`gameInfo.extra` and similar fields synchronously while rendering. With no state, `location.state` is `null`, the
destructure throws, and the route's `errorElement` (`RouteErrorSurface`) replaces the page.

Every page needs to be opened with state today. The page cannot recover by itself, even though `runner` and `appName`
are in the URL and `getGameInfo(appName, runner)` (already used at :266) could resolve the game.

## Current exposure: none known (latent)

Checked 2026-11-25 by grepping `gamepage/` across `src/frontend` and `src-tauri/src`. Every in-app entry passes
`{ gameInfo }`:

- `DownloadManagerItem`
- `GameCard` (:471 and :615)
- `RedeemSteamKeyDialog` (:110)
- `SteamManagedItemView`, since quick 261125-qp9, which closed the one live crash

No tray or deep-link code that opens a game page was found. The "tray/deeplink shape" in the `tabLocationMemory.ts`
comment is unverified. The next entry point added without state will crash the page again.

## To do

- Read `location.state?.gameInfo`. When it is missing, resolve the game from the library stores by `runner`/`appName`, or
  call `getGameInfo(appName, runner)`, and render a loading state until it resolves. Show a "game not found" state if
  nothing comes back.
- Keep the existing state fast path, so there is no flash when state is present.
- Add a test that renders GamePage with a stateless navigation and asserts it neither throws nor hits RouteErrorSurface.
- Once GamePage handles stateless entry, `tabLocationMemory.ts` could remember stateless game pages too, but that is
  optional.
