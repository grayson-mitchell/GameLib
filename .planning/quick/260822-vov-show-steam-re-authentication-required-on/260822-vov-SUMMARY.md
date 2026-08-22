---
quick_id: 260822-vov
status: complete
date: 2026-08-22
---

# Quick Task 260822-vov — Summary

## What changed

The Manage Accounts tile stops presenting Steam as cleanly connected once the backend has
**proven** the stored credential is gone.

| Task | Commit | Files |
|---|---|---|
| 1 — latch the verdict | `2d5999c2d` | `steam/user.ts`, `common/types/electron_store.ts` |
| 2 — renderer read allowlist | `19726c79a` | `common/types/storePolicy.ts` |
| 3 — tile | `6fdea2532` | `Login/index.tsx`, `Login/steamTileState.ts`, `locales/en/gamelib.json` |
| 4 — tests | `bdf8261b3` | `steam/__tests__/credentialsMissing.test.ts`, `Login/__tests__/steamTileState.test.ts` |

### Root cause

`steamConfigStore.credentialsMissing` is set only in `user.ts`'s
`outcome.status === 'absent'` branch — a *successful* credential read that came back empty
while the session still says `isLoggedIn`. Cleared at four sites where a credential is proven
present: the canary-verified `ensureConnected` fast path, both `setToken` success sites, and
`logout()`.

The `unreadable` branch immediately above is deliberately untouched. A denied or timed-out
Keychain read is not evidence of a missing credential, and that file's own comment records
that reporting it as signed-out is a false state an earlier fix closed on purpose. Both
branches return `false`, so the *only* observable difference is the persisted flag — which is
why the negative test is the load-bearing one.

### Design deviation from the original request

The task asked for a third "signed-in-but-needs-re-authentication" tile state, surfaced
through `getSteamUserInfo()`. Both halves were changed after reading the code, and the plan
records why:

- **`Runner` has no third state.** It renders `buttonText` only in its not-logged-in branch
  (`Runner/index.tsx:107`/`:115`), and `Login/index.tsx:93-95` documents that this is exactly
  why Humble flips an expired tile to not-logged-in with a reconnect prompt. Adding a third
  state means changing the shared tile for all six stores.
- **Humble already solved this**, and its solution is load-bearing across five files
  (`electron_store.ts` type → `storePolicy.ts` allowlist → `GlobalState`/tile read →
  `buttonText`). This change mirrors it field for field instead of adding a parallel
  mechanism through `getUserDetails()`, which also keeps the flag away from `userData`.

**Census performed as required.** `configStore.set('userData', …)` overwrites the whole object
at `user.ts:339`/`:521`, `delete('userData')` at `:302`, sole reader `:309`; `SteamSignOut.ts`
treats `getSteamUserInfo() → undefined` as the signed-out signal. A flag inside `userData`
would be destroyed on every login and collide with that signal. A sibling key is the only safe
siting — and a test pins that `userData` is never written on this path.

### Freshness

The tile reads the store directly rather than `GlobalState`, because the backend latches the
flag during a routine library refresh long after `GlobalState` was constructed. The renderer
snapshot is kept live by `STORE_CHANGED_CHANNEL` (`backend/electron_store.ts:113` announces on
`set`, `:118` on `delete`) — the Task 2 allowlist entry is what lets that push through as well
as the read. The existing `steam?.username` effect re-reads it, so navigating to the accounts
screen always shows the current verdict. **No new IPC channel and no new Keychain read**;
startup still issues no `keyring_get`.

## Verification

- `pnpm exec jest src/frontend src/common` — 121 suites, 2008 tests, all pass.
- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar` — 87/88 suites pass;
  the one failure is pre-existing and unrelated (see below).
- `pnpm exec tsc --noEmit` — clean.
- eslint on the 7 changed source files — 0 errors (severity 2).
- `prettier --check` on all 8 changed files, measured in place — clean.
- Locale diff is 2 lines in `gamelib.json`; `translation.json` untouched.

## Pre-existing failures, NOT caused here and NOT fixed

Both were verified red before this task's first commit:

1. **`gameDetailsImportGate.test.ts` — `settingsFlowRegistration.ts` sha256 pin.** That file is
   modified in the working tree by a *concurrent session* (it was absent from this session's
   starting `git status`). Untouched here; all commits used `git commit --only`.
2. **`genI18nGateScope.test.ts` — `meta/i18nForkTouchedFiles.json` is stale by 12 files.** The
   artifact was last regenerated 2026-08-21 19:25; `DialogHandler/index.tsx` (Phase 37, the
   concurrent session) landed 2026-08-22 16:36, 5.5 h before this session's first commit. One
   of the 12, `state/InstallProgress.ts`, came from quick task `260822-uri` earlier today, and
   `Login/steamTileState.ts` will make a 13th. **Deliberately not regenerated** — running the
   generator to clear a stale-artifact gate is a recorded way to break the pins that guard it.
   Needs its own task, and belongs to whoever owns the other 11.

## Not done

- **Not UAT'd.** The flag is proven by unit test and by reading the observed log, not by
  watching the tile flip in the running app. The natural gate: delete the Keychain item
  (`security delete-generic-password -s com.gamelib.launcher -a steam-refresh-token`), trigger a
  library refresh, and confirm the tile reads "Sign-in expired — Reconnect".
- **Accepted weakness:** the flag is stale by construction — it is the last *proven* verdict,
  not the present one. The four clear sites cover the realistic restore paths.

## Out of scope (finding only)

`refreshLibrary` logs `refreshLibrary complete runner=steam managers=1` immediately after
`Steam client not ready, skipping library refresh` — it reports completion for a sync that did
nothing. Same class of defect as the tile, one layer down. Not fixed.
