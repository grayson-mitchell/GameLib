---
phase: quick-261030-qqh
plan: 01
status: code-complete-live-gate-open
completed: 2026-10-30
commits:
  - 4be6400bd
  - e34ad8668
key-files:
  created:
    - src/frontend/screens/WebView/steamStoreExitRefresh.ts
    - src/frontend/screens/WebView/__tests__/steamStoreExitRefresh.test.ts
  modified:
    - src/backend/storeManagers/steam/authTrigger.ts
    - src/backend/storeManagers/steam/__tests__/authTrigger.test.ts
    - src/frontend/screens/WebView/useStoreEmbedHost.ts
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WebView/__tests__/useStoreEmbedHost.test.tsx
    - src/frontend/screens/WebView/__tests__/storeEmbedReloadLoop.test.tsx
---

# Quick 261030-qqh: Refresh the Steam library when leaving the in-app Steam store

Leaving the Steam store embed (route leave or store switch) after the main frame loaded a Steam
app, cart or checkout page now runs the Redeem-key refresh shape,
`refreshLibrary({ library: 'steam', origin: 'steam-store-exit' })`, behind sign-in, in-flight and
2-minute throttle gates. The backend allowlist maps the origin to `user-refresh` so the refresh gets
its on-demand CM logon.

## What changed

- `steamStoreExitRefresh.ts`: pure module (`isSteamPurchaseIntentUrl`, `runSteamStoreExitRefresh`,
  origin and throttle constants, reset seam). https + exact host equality; module-level throttle and
  in-flight state; one log line per call.
- `authTrigger.ts`: one row `'steam-store-exit': 'user-refresh'`.
- `useStoreEmbedHost.ts`: optional `onSteamStoreExit`; arms from EVERY drained event and from
  `applyNavResult`; fires from the cleanup of a `[storeKey]` effect (store switch or unmount), never
  on `beforeunload` teardown or suppression.
- `index.tsx`: passes `onSteamStoreExit`, deriving `steamSignInState` from the hoisted
  `collectSignInInputs` result.

## Deviations

- [Rule 3] `storeEmbedReloadLoop.test.tsx` has a structural regex pinning the exact
  `useStoreEmbedHost({...})` argument list; it was extended to accept `onSteamStoreExit`. Not in the
  plan's file list.
- The decision-module tests and implementation were written together rather than strictly
  red-first.

## Verification

- `npx jest src/frontend/screens/WebView src/backend/storeManagers/steam/__tests__/authTrigger.test.ts`:
  24 suites, 555 tests pass.
- `pnpm codecheck`, scoped eslint (0 errors; one pre-existing `exhaustive-deps` warning in
  `index.tsx` ~L458, not from this change) and scoped prettier pass.
- GlobalState.tsx, Header/index.tsx and RedeemSteamKeyDialog/index.tsx untouched.
- `graphify update .` run.

## Live gate (open)

In a dev build signed in to Steam, open the in-app Steam store, open a free-to-own app page, click
Add to Library, leave the store (Games tab or switch to GOG). The game appears in the library with
no manual Refresh, and gamelib.log shows `[refreshLibrary] runner=steam origin=steam-store-exit`
and `[steamStoreExitRefresh] origin=steam-store-exit outcome=refreshed`. Also note whether the
guided Go Offline dialog appeared (macOS with Mac Steam signed in; same on-demand logon path the
Redeem refresh uses). `tauri dev` does not rebuild the sidecar (authTrigger.ts changed): restart
dev before the live gate. The todo stays in `pending/` with `ready: live-gate`.
