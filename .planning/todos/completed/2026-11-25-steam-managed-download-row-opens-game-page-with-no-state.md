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

## Resolution (2026-11-25): row-level fix, GamePage not hardened

Fixed at the row level, the todo's first option. The Steam-managed row now keeps the GameInfo it finds in
`steam.library` by `app_name`, and its title link passes `state={{ gameInfo }}`, the same shape DownloadManagerItem
and GameCard already use. When the game is not in `steam.library`, the title is plain text with the same
`steamManagedItem__title` class, so the row no longer offers a stateless way into the game page.

The guard is two new tests in
`src/frontend/screens/DownloadManager/components/SteamManagedItem/__tests__/SteamManagedItemView.test.tsx`: the title
link carries `{ gameInfo }` in its router state, and without a GameInfo no link renders. This is the todo's second
regression-test option, scoped to the row.

Fix commit, by subject because this branch may be rebased on merge: "fix(quick-261125-qp9): Steam-managed download row opens the game page with its gameInfo".

Not done, as a follow-up: the todo's second fix option. `GamePage/index.tsx` still destructures `location.state`
without a guard (line 112 at 0a6ac61c9), so any other stateless entry, such as the tray and deep-link entries that
tabLocationMemory's comment describes, still lands on RouteErrorSurface. Hardening it means reading
`location.state?.gameInfo`, resolving the GameInfo from the library store by `runner` and `appName`, and adding a
loading state, because the page reads `gameInfo.*` synchronously while it renders. That was out of scope for this
quick task.

Like the finding itself, the fix was made from reading the code, not from a live reproduction.
