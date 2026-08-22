---
quick_id: 260822-vov
status: complete
uat: passed 6/6 (2026-08-23)
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

**UAT: 6/6 PASS against a real build and a real Keychain — see the UAT section below.**

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

## UAT — run 2026-08-23 against a real build and a real Keychain

Run on macOS with `pnpm tauri:dev`, observed by the user, evidence read from
`~/Library/Logs/GameLib/gamelib.log` and the live Keychain.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Tile renders the reconnect state | **PASS** | Flag hand-planted in config; tile read "Sign-in expired — Reconnect". Proves allowlist → store read → predicate → `gamelib.json` key. |
| 2 | Backend latches on a real absent read | **PASS** | Keychain item deleted for real; `keyring_get ok present=false len=0 trigger=user-refresh` → `logged in but no stored refresh token` → `credentialsMissing: True` appeared in config.json. |
| 3 | Tile reflects the latched (not planted) flag | **PASS** | Manage Accounts read "Sign-in expired — Reconnect", earned end to end. |
| 4 | Startup issues no `keyring_get` | **PASS** | `library refresh deferred until a deliberate Steam action` at 07:08:10; no Keychain prompt at launch. |
| 5 | An empty slot does not prompt | **PASS** | `elapsed=4ms` on the empty read vs `elapsed=8480ms` when the slot was populated and macOS prompted. |
| 6 | Clear path on re-login | **PASS** | Reconnect → sign-in → `setToken(): keyring_set ok len=494` at 07:23:07; `credentialsMissing` gone from config.json; Keychain slot restored. Also restored the credential the test destroyed — no leftover state. |

### Finding: the detection window is narrower than this summary first claimed

The first attempt at item 2 produced **no** latch, and the reason is behavioural, not a test
artifact. The Keychain item was deleted while the app already held an authenticated
`steam-user` client, so `ensureConnected` took the canary fast path
(`already connected (fast path, canary OK)`) and never read the stored token.

That is **correct**: a live CM session is genuinely valid, and the stored token is only needed
to *re-establish* one. But it means `credentialsMissing` answers *"can I reconnect?"*, not
*"is my stored credential intact?"* — a credential that vanishes mid-session goes unnoticed
until the connection drops or the app restarts. Reproducing the original report required
restarting the app first. The body of this summary previously implied a routine refresh would
always catch it; it will not while a connection is live.

### Correction to a claim made about the tile

An earlier note said the tile would flip "live" via `STORE_CHANGED_CHANNEL`. It does not. The
effect that re-reads the flag is keyed on `[…usernames…, t]` (`Login/index.tsx:155-163`) —
nothing in that list changes when the flag flips — so the value is picked up on **mount**, i.e.
on navigating to Manage Accounts. Correct for the real use case, but not a live in-place
update. The snapshot itself is kept current; only the re-render trigger is missing.

## Not done

- **Accepted weakness:** the flag is stale by construction — it is the last *proven* verdict,
  not the present one. The four clear sites cover the realistic restore paths.
- **Gap noticed during UAT planning, not fixed:** the flag is not cleared on a successful
  *cold* connect (`status: 'present'` → `connectSteamUserClient` succeeds). It clears on the
  next `ensureConnected` fast path. Re-login clears it via `setToken`, which is the realistic
  restore path, so this is cosmetic — but it is a real asymmetry among the clear sites.

## Out of scope (finding only) — CORRECTED during UAT

**As originally written this finding was wrong.** It said `refreshLibrary` "reports completion
for a sync that did nothing" and characterised the failure as surfacing nothing to the user,
by analogy with the tile. The UAT disproved the user-facing half: a failed Steam sync **does**
raise a visible banner, "Couldn't sync your Steam library", with a Steam-scoped retry —
`SteamSyncNotice` in `'failed'` mode (`Library/components/SteamSyncNotice/index.tsx`, mounted
via `resolveSteamSyncIndicator`). It is pre-existing (`d9cea762b`, 2026-08-16, phase 34.15-08,
ancestor of HEAD), so it was also present in the build that produced the original report.

What survives is narrower and log-only: `refreshLibrary complete runner=steam managers=1` is
logged immediately after `Steam client not ready, skipping library refresh`, so the log claims
completion for a refresh that skipped. Misleading when reading logs; not a user-facing gap.

This also sharpens the original diagnosis. The sync failure was never silent — the accounts
tile *contradicting* it is what made the state confusing, which is exactly what this task
fixed.
