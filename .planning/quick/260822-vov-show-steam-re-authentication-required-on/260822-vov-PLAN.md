---
quick_id: 260822-vov
description: Show Steam re-authentication required on the accounts screen when the stored credential is proven gone
date: 2026-08-22
mode: quick
---

# Quick Task 260822-vov: surface a proven-missing Steam credential on the accounts tile

## Problem

Observed live (2026-08-22, `~/Library/Logs/GameLib/gamelib.log`): `steam_store/config.json`
held `isLoggedIn: true` + `userData`, but the Keychain slot `com.gamelib.launcher` /
`steam-refresh-token` was empty. The accounts screen showed Steam as cleanly signed in while
every install failed with "You are not signed in to Steam."

The condition was **detected four times before the install was ever attempted**, by the
routine library refresh, and discarded each time:

```
[refreshLibrary] runner=steam origin=game-status
  → getToken(): ... trigger=user-refresh
  → WARNING: Steam: logged in but no stored refresh token — cannot reconnect
  → WARNING: Steam client not ready, skipping library refresh
  → INFO:    refreshLibrary complete runner=steam managers=1
```

`SteamUser.isLoggedIn()` reads `configStore.get_nodefault('isLoggedIn')` and the tile is
driven off `steam?.username` — neither knows anything about the credential the installer
actually needs.

## Design: follow the Humble expired-session precedent exactly

Humble already solved this identical problem and its solution is load-bearing in four
places. **Do not invent a parallel mechanism.**

| Concern | Humble (existing) | Steam (this task) |
|---|---|---|
| Backend persists the verdict | `humbleConfigStore.expired`, set by the 401 health check | `steamConfigStore.credentialsMissing`, set at the `absent` branch |
| Type | `electron_store.ts:107` `expired?: boolean` | `electron_store.ts:85` `credentialsMissing?: boolean` |
| Renderer read allowlist | `storePolicy.ts:133` `'expired'` | `storePolicy.ts:116` += `'credentialsMissing'` |
| Renderer reads it back | `GlobalState.tsx:296` `humbleConfigStore.get_nodefault('expired') ?? false` | same shape on `steamConfigStore` |
| Tile | `Login/index.tsx:102` `Boolean(isLoggedIn) && !expired` | `Boolean(steam?.username) && !steam?.credentialsMissing` |
| Label | `:299` `expired ? 'Session expired — Reconnect' : 'Humble Bundle Login'` | same shape |

**Scope correction against the original ask.** The task description asked for a third,
"signed-in-but-needs-re-authentication" tile state routed through `getSteamUserInfo()`.
Both halves of that are wrong against the codebase and are deliberately not built:

1. `Runner` (`Login/components/Runner/index.tsx:107`/`:115`) renders `buttonText` **only in
   its not-logged-in branch**. It has no third state, and `Login/index.tsx:93-95` documents
   that this is exactly why Humble flips the expired tile to not-logged-in rather than
   inventing one. Adding a third state would mean changing the shared tile for all six
   stores — far beyond this task.
2. Routing through `getSteamUserInfo()` would mean composing the flag into
   `SteamUser.getUserDetails()`'s return. Humble instead reads the config store directly in
   the renderer, which is simpler and leaves `userData` untouched. That also sidesteps the
   original concern about polluting the persisted `userData` object, since the flag never
   goes near it.

**Census performed** (the task description required it before siting the flag).
`configStore.set('userData', …)` overwrites the whole object at `user.ts:339` and `:521`;
`configStore.delete('userData')` at `:302`; the sole reader is `:309`. `SteamSignOut.ts`
treats `getSteamUserInfo()` → `undefined` as the signed-out signal. A flag stored *inside*
`userData` would therefore be destroyed on every login and collide with the sign-out signal.
A sibling key is the only safe siting — which is what Humble does.

## Constraints

- **Zero new Keychain reads.** The login screen renders at startup and startup deliberately
  issues no `keyring_get` (`log:21` — "library refresh deferred until a deliberate Steam
  action"). The flag is written only from reads that already happen on deliberate actions
  (`trigger=game-page` / `user-install` / `user-refresh`) and read back from config.
- **`absent` only, never `unreadable`.** `user.ts:178`'s own comment records that treating a
  failed/denied/timed-out keyring read as "signed out" is a false state a previous fix
  deliberately closed. Only `outcome.status === 'absent'` — a *successful* read returning
  empty — is proof.
- Frontend jest is `testEnvironment: 'node'` with no jsdom, so no component rendering.

## Tasks

### Task 1 — Persist the verdict

**files:** `src/backend/storeManagers/steam/user.ts`, `src/common/types/electron_store.ts`

**action:** Add `credentialsMissing?: boolean` to the `steamConfigStore` type, documented in
the same shape as `humbleConfigStore.expired`. In `user.ts`, set it in the
`outcome.status === 'absent'` branch (`:195`) and clear it wherever the credential is proven
present: the `ensureConnected` fast-path success (`:115`), both `setToken` success sites
(`:333`, `:498`), and `logout()` (`:300`) so a stale `true` cannot survive into the next
session. Do **not** touch the `unreadable` branch (`:178`).

**verify:** `pnpm exec tsc --noEmit`; the `unreadable` branch is untouched in the diff.

**done:** The flag records the last proven verdict and nothing else.

### Task 2 — Allow the renderer to read it

**files:** `src/common/types/storePolicy.ts`

**action:** Add `'credentialsMissing'` to `STORE_ALLOWLIST.steamConfigStore` (`:116`), which
is currently `['isLoggedIn', 'userData']`. This is a non-secret boolean, so
`src/preload/api/misc.ts:228`'s Electron **deny**-list (`steamConfigStore: ['refreshToken']`)
needs no change — non-secret keys pass it by default.

**verify:** `pnpm exec jest src/common` — `storePolicy.test.ts` has mirrored expectations
(`:131` asserts unknown fields are refused, `:207` a `[store, field]` pair list); confirm
none go red.

**done:** `isAllowedStoreField('steamConfigStore', 'credentialsMissing') === true`.

### Task 3 — Flip the tile

**files:** `src/frontend/state/GlobalState.tsx`, `src/frontend/screens/Login/index.tsx`,
`public/locales/en/gamelib.json`

**action:** In `GlobalState.tsx`, read `credentialsMissing` into the steam slice exactly as
Humble does at `:296`. In `Login/index.tsx`, make `isSteamLoggedIn` be
`Boolean(steam?.username) && !steam?.credentialsMissing` (both the `useState` initialiser at
`:91` and the effect at `:134`, plus the dep array), and give the Steam tile a `buttonText`
that switches to a reconnect prompt, mirroring `:298-302`. Add the new locale key —
a `t()` default alone is inert once the key exists.

**verify:** `pnpm exec jest src/frontend`; `pnpm exec tsc --noEmit`.

**done:** With the flag set, the Steam tile reads as needing reconnection rather than as
cleanly signed in.

### Task 4 — Tests

**files:** `src/backend/storeManagers/steam/__tests__/`, `src/frontend/screens/Login/__tests__/`

**action:** Cover: flag set on `absent`; **not** set on `unreadable`; cleared at each of the
four success/logout sites; and the tile predicate (`username && !credentialsMissing`) as a
pure function. Red-prove the `unreadable` case — it is the one that silently regresses.

**done:** A regression to percent-style over-eager signalling fails the suite.

## Must haves

- `credentialsMissing` is set **only** on a successful-but-empty keyring read.
- Zero new `keyring_get` calls; no Keychain prompt at startup.
- `userData` is never mutated to carry the flag.
- The Steam tile stops claiming a clean signed-in state while the credential is proven gone.
- `pnpm exec jest`, `tsc --noEmit`, eslint and prettier all clean.

## Out of scope (finding, not fixed)

`refreshLibrary` logs `refreshLibrary complete runner=steam managers=1` immediately after
`Steam client not ready, skipping library refresh` — it reports completion for a sync that
did nothing. Same class of defect as the tile, one layer down. Recorded here, not fixed.
