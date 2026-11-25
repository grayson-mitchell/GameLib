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

## Resolution (2026-11-25): the game page resolves its own game

GamePage is now a thin outer component around `GamePageGate`, which takes the router state's `gameInfo` when it is present,
else the runner's library store list, else `getGameInfo(appName, runner)`. It shows the loading spinner while that resolves
and a "GameLib couldn't find this game." state with a Back to Library link when nothing comes back (null, a rejection, or a
runner the URL made up), so opening the page without router state no longer reaches the route's error surface. The page body
seeds from an `initialGameInfo` prop and is keyed by runner/appName, so moving between game pages remounts it.

Tests: the gate is rendered under jsdom with a probe child, and a source gate pins the `index.tsx` wiring; the 830-line body
itself is not rendered under jest. See `src/frontend/screens/Game/GamePage/__tests__/gamePageGate.test.tsx`.

tabLocationMemory still declines to remember a stateless game page. That is unchanged and is an optional follow-up, now safe
to take.

Fix commits, by subject because the branch is rebased before merge:
`fix(quick-261125-r0j): game page loads the game itself when opened without router state` and
`fix(quick-261125-r0j): catalogue the game page not-found string`.
