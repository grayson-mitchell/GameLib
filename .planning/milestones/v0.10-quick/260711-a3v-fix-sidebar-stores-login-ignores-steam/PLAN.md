---
quick_id: 260711-a3v
slug: fix-sidebar-stores-login-ignores-steam
date: 2026-07-10
type: quick
---

# Fix: sidebar/stores login state ignores Steam

## Problem

Logging in to **only** Steam left the app looking logged-out:
- The **"Log in"** item stayed visible in the sidebar.
- Clicking **Stores** opened the **Epic** store webview, which showed a "you are
  not logged in" warning (because the default store never resolved to Steam).

Root cause: `SidebarLinks/index.tsx` aggregated login state across
epic/gog/amazon/zoom but **never included Steam** — a pre-existing gap since
Steam was added as a store.

## Fix (single file: `src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx`)

1. Destructure `steam` from `ContextProvider`.
2. Add `steam.username` to the `loggedIn` aggregate → hides the "Log in" item
   when only Steam is connected.
3. Add a `defaultStore = 'steam'` branch for the Steam-only case → the Stores
   link opens the browse-only Steam store instead of Epic (no login warning).

## Verification

- `npm run codecheck` (tsc --noEmit) → 0 errors.
- `npx eslint` on the file (correct-case path) → 0 errors.
- Manual: logging into only Steam hides the sidebar "Log in" item and lands
  "Stores" on the Steam store (runtime re-check pending in the running app).
