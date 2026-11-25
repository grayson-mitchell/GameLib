---
created: 2026-11-25T06:00:00.000Z
title: "Clicking a Steam-managed download row's title opens the game page with no router state, which throws"
area: ui
files:
  - src/frontend/screens/DownloadManager/components/SteamManagedItem/SteamManagedItemView.tsx:33-36 (the stateless Link)
  - src/frontend/screens/Game/GamePage/index.tsx:112 (destructures location.state unguarded)
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx:141-143 (the shape that works)
severity: medium
platform: any
ready: code
---

## Problem

In the Downloads screen, a Steam-managed row's title is a plain `<Link to={`/gamepage/steam/${appName}`}>` with no
router `state`. `GamePage/index.tsx:112` runs `const { gameInfo: locationGameInfo } = location.state`, and react-router
gives a stateless navigation `state === null`, so the destructure throws a TypeError on render. The route's
`errorElement` (`RouteErrorSurface`, `App.tsx:238`) catches it, so the user sees the route error page instead of the game.

Found by reading the code only. The quick-261125-pmb planner spotted it while working on the game page's Back control,
and the orchestrator confirmed the two lines. It has not been reproduced in the live app.

Every other in-app entry to the game page passes `{ gameInfo }`: `DownloadManagerItem` (`navigate(..., { state:
{ gameInfo } })`), `GameCard`, and `RedeemSteamKeyDialog` (`index.tsx:110`). `tabLocationMemory.ts` deliberately never
remembers a stateless game page for the same reason.

Workaround: open the game from the Library instead.

## To do

- Fix at one of these levels, or both:
  - Give the Steam-managed Link `state={{ gameInfo }}`, if the row has a `GameInfo` to hand.
  - Make `GamePage` tolerate missing state (`location.state?.gameInfo`) and resolve `gameInfo` from the library store by
    `runner`/`appName`. That also covers tray and deep-link entries, which the `tabLocationMemory` comment describes as
    stateless.
- Add a regression test: render GamePage, or extend `SteamManagedItemView.test.tsx`, with a stateless navigation, and
  assert it does not hit the error surface.
