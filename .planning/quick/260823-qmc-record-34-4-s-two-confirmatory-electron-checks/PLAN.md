---
quick_id: 260823-qmc
slug: record-34-4-s-two-confirmatory-electron-checks
description: Record the measured results of Phase 34.4's two outstanding confirmatory Electron checks — both RUN and both PASSED on 2026-08-23
created: 2026-08-23
status: in-progress
---

# Quick Task 260823-qmc — record 34.4's two confirmatory Electron checks

Docs only. **The measurements are already made** (this session, 2026-08-23, live under
`pnpm start` with `--remoteDebuggingPort=9222`, driven over CDP). No source changes, no
re-runs. What remains is recording them where the project tracks them.

## What was measured

Both items come from `34.4-LIVE-GATE.md` § "Outstanding confirmatory checks (non-blocking,
not gate items)" — open since 2026-07-27, never carried into any later phase, todo or audit.

### Check A — Electron parity spot-check for item 5's contradictory bottle pair — **PASS**

The gate asked to "run the same two calls under `npm start` to confirm Electron returns the
identical contradictory pair."

**The check as written had gone stale by STATE, not by line number.** On 2026-07-27 the Tauri
measurement was taken while `steamBottleConfigStore`'s `provisioned` flag was unset. Today that
flag is `true` on disk, so the first Electron run returned an *agreeing* pair:

```js
window.api.steamBottleStatus()        // → { provisioned: true, bottleName: "GameLibSteam" }
window.api.isSteamBottleProvisioned() // → true
```

Recording that as the parity result would have been a green-looking measurement that proves
nothing about the recorded defect. So the original precondition was restored — `provisioned`
flipped to `false` in `~/Library/Application Support/gamelib/steam_store/config.json`, with the
file backed up first — and the pair re-measured:

```js
window.api.steamBottleStatus()        // → { provisioned: false, bottleName: "GameLibSteam" }
window.api.isSteamBottleProvisioned() // → true          (cxbottle.conf present throughout)
```

**Identical to the Tauri gate's 2026-07-27 pair.** Flag restored to `true` immediately after and
re-probed. Parity confirmed by measurement, and independently by code read: both runtimes import
the *same* `steamBottleConfigStore` (`electronStores.ts:14`), the same `isBottleProvisioned()`
(`bottle.ts:191`) and the same `DEFAULT_STEAM_BOTTLE_NAME` — `main.ts:46,927-932` vs
`steamAuthFlowRegistration.ts:117-131,239-255`.

### Check B — Electron sign-out sanity — **PASS**

The item-2 fix (`1cf42d43b`) rerouted `GlobalState.steamLogout` through
`SteamSignOut.ts`'s `performSteamLogout`, which is shared frontend code — so it changed the
**Electron** logout path too, and nothing had exercised it live.

Driven through the REAL UI control (the Steam tile's `.runnerLogin.logged` div on `#/login`),
never a direct `window.api.logoutSteam()` call, which would have bypassed the very fix under test.

| observation | result |
|---|---|
| store keys before | `refreshToken`, `provisioned`, `wineVersion`, `isLoggedIn`, `userData` |
| store keys at t+1s | `provisioned`, `wineVersion` — the three session keys cleared |
| backend log | `19:05:58 [Steam]: Logging user out from Steam` — `SteamUser.logout()` ran |
| Steam tile | flipped to `Steam Login`, `connected: false` |
| failure dialog | none — the `onSignOutFailed` branch never fired |
| held for | 15s of polling, no revert |
| after full renderer reload | tile still `Steam Login`, store keys still cleared |

The last row is the one the fix exists for: the original defect's symptom was the tile *silently
reverting to "Logout" after reload*. It did not. GOG and Humble tiles stayed connected — the
targeted deletes did not over-clear the shared store.

**Session restored afterwards.** The signed-out state was reverted from the pre-run backup and the
restored refresh token was then proven live, not assumed: a deliberate refresh
(`origin: 'action-icons-refresh-button'`, the allowlisted trigger) produced
`SteamUser.loggedOn`, `fetched 381 owned games`, `Steam library sync complete`. Final
`steam_store/config.json` diffs **byte-identical** to the backup taken before the run. No
SteamGuard round-trip was spent.

Incidental confirmation: a first attempt using `origin: 'signout-check-restore'` correctly fell
through to the locked `'startup'` outcome and issued no keyring read — `authTrigger.ts`'s
allowlist behaving exactly as designed.

## Tasks

**T1 — `34.4-LIVE-GATE.md`.** Replace § "Outstanding confirmatory checks (non-blocking, not gate
items)" with the recorded results above, and update item 5's own trailing `**Outstanding:**` line
so the two statements cannot drift apart. Record the stale-precondition finding explicitly — a
future reader must not re-derive it.

**T2 — `ROADMAP.md`** (Phase 34.4 block, ~line 1719-1725). Drop "two unrun confirmatory Electron
checks" from the Open list. Everything else in that block stays.

**T3 — `STATE.md`** (carried-forward block, ~line 7384-7390). Same removal, plus correct the stale
claim that code-review **WR-01 is still open** — it was fixed in `1afef0345`, which `ROADMAP.md`
already records. Also re-file WR-02/WR-03: they name `WebviewUnavailablePanel.tsx`, which 34.4.1
plan 05 rewrote to remove every runner name; the defect substance now lives in
`TauriLoginPanel.tsx`.

## Commit discipline

The working tree carries unrelated modifications **and staged renames** from a concurrent session.
Every commit uses `git commit --only <path>` — never `-a`, never a bare `git commit` that would
absorb what is already staged.
