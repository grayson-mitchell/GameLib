---
quick_id: 260711-a3v
slug: fix-sidebar-stores-login-ignores-steam
date: 2026-07-10
status: complete
files_modified:
  - src/frontend/components/UI/Sidebar/components/SidebarLinks/index.tsx
---

# Summary

Fixed the sidebar/stores login aggregation to account for Steam. Found during
Phase 17 macOS UAT: after logging in to only Steam, the "Log in" sidebar item
stayed visible and the Stores link opened the Epic webview with a "not logged
in" warning.

## Changes (`SidebarLinks/index.tsx`)

1. Destructured `steam` from `ContextProvider`.
2. `loggedIn` now includes `steam.username` → the "Log in" sidebar item hides
   when only Steam is connected.
3. Added a Steam-only branch to `defaultStore` (`!epic && !gog && !amazon &&
   steam.username → 'steam'`) so the Stores link opens the browse-only Steam
   store instead of Epic, avoiding the spurious login warning.

## Verification

- `npm run codecheck` (tsc --noEmit): exit 0.
- `npx eslint` on the file (correct-case path `.../Sidebar/...`): exit 0.
  (Note: linting via a wrong-case path `SideBar` falsely reports
  `import-x/no-unresolved` casing errors on untouched sibling imports — a
  case-insensitive-FS artifact, not a code issue.)

## Notes

- Pre-existing bug, not Phase 17 scope; surfaced during the 17-07 UAT.
- Steam store remains browse-only (no login gate), consistent with the v0.2
  STORE-01 decision.
- Runtime re-check pending in the running dev app.

## Self-Check: PASSED
