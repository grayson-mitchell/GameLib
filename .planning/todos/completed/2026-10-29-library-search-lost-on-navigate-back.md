---
created: 2026-10-29
title: "Games tab search text is lost when you open a game and navigate back"
area: frontend-library
severity: minor
platform: any
ready: code
source: "operator request 2026-10-29"
files:
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/components/UI/LibrarySearchBar/index.tsx
---

## Problem

On the Games tab, type a search, open a result's game page, then go back. The search box is empty and the full library shows again. You have to retype the search to get back to where you were.

## Cause (likely)

`filterText` is a plain `useState('')` in the Library screen (`src/frontend/screens/Library/index.tsx:370`). Opening a game page unmounts the Library screen, so the state is thrown away. It is session-only on purpose: it has no localStorage key (D-22 / WR-11, quick 260827-vpl; see the comment near `:1056`). That decision is about not persisting the search across launches. It does not require dropping the search on an in-app round trip.

## Directions

- Keep the search for the session in state that outlives the Library screen: an app-level context, a module-level variable, or `sessionStorage`. Do not use a localStorage key, so the D-22 session-only decision still holds.
- Check `alphabetFilterLetter`, which is session-only in the same way and likely has the same problem. It should probably come back too.
- Restoring the scroll position to the game you opened would be a nice extra, but it is out of scope here.
- Keep "clear all filters" (the handler near `:1050`) clearing the kept search.

## Done when

Search "portal" on the Games tab, open a result, and press back. The box still says "portal" and the list is still filtered. After an app restart, the search is empty.

## Operator addition (2026-10-29)

If you are on a game page and switch to another app tab, coming back to that tab should land you on that same game page again. Each tab remembers where you were in it, and that memory lasts for the session only. Today, coming back always lands you on the tab's root screen. When you do return to the Games tab root, the kept search from above should still apply.

## Resolution

2026-10-29: fixed by quick 261029-n4v (code commits 7a86b8c0c, 931051f98).
- The Games `filterText` and `alphabetFilterLetter` now live in an in-memory module store (`Library/librarySessionSearch.ts`). There is no localStorage or sessionStorage key, so D-22 holds and a restart clears both. `clearAllFilters` still clears the kept copy.
- Each app tab now remembers its last location for the session (`NavShell/tabLocationMemory.ts`). The rule for which tab owns a location: the tab `resolveActiveTab` lights for it. So every game page belongs to Games, whichever way you opened it.
- Clicking the tab you are already on goes to its root.
- Game pages with no `gameInfo` (tray or deeplink) and `/loginweb` are never remembered.
- Scroll restore is left out, as before.

Not yet checked live in `tauri dev`. The "Done when" steps above are the manual check.
