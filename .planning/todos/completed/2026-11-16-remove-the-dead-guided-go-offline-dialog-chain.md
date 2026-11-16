---
created: 2026-11-16T00:00:00Z
title: 'Remove the dead guided Go Offline dialog chain (steamGoOfflineCancel and its siblings)'
area: steam-auth
severity: minor
platform: any
ready: human
source: 79-REVIEW C2/IN-03 (skipped in 79-REVIEW-FIX-INFO-C, tracked here)
files: [src/backend/sidecar/steamAuthFlowRegistration.ts, src/frontend/screens/Game/GamePage/components/SteamGoOfflineNotice.tsx, src/frontend/state/SteamGoOfflineNotice.ts, src/common/types/ipc/steamAuth.ts, src/preload/api/steam.ts, src-tauri/src/ipc_contract.rs, src/backend/storeManagers/steam/user.ts]
---

## Problem

`steamGoOfflineCancel` is a no-op IPC channel. It is kept only so the guided Go Offline dialog's
channel contract is unchanged, and the dialog still calls it on Cancel/close
(`SteamGoOfflineNotice.tsx`), logging a `54 steamGoOfflineCancel failed` line if it ever rejects.

The channel is the visible end of a larger dead chain. After Phase 79 the Rust session's
production logon wrap is `RestoreOnlyWrap` on macOS and `NoWrap` elsewhere
(`gamelib-steamcm/src/facade.rs`). Neither ever refuses a logon, so Rust never returns
`Refusal::GoOfflineRequired`. As a result, nothing in production reaches any of these:

- the TS `go-offline-required` lease reason (`userTypes.ts`, `userRedeem.ts`,
  `gameInstallDepot.ts`, `library/refresh.ts`);
- the `steamGoOfflineRequired` push (`user.ts`);
- the dialog and its store (`SteamGoOfflineNotice.tsx`, `state/SteamGoOfflineNotice.ts`);
- the `steamGoOfflineRetry` and `steamGoOfflineCancel` channels.

## Why it was not removed in the review fix

Removing only `steamGoOfflineCancel` would leave the dialog half-plumbed. Removing the whole
chain spans the Rust shell's IPC allow-list (`src-tauri/src/ipc_contract.rs`), the zod schemas,
preload, the frontend, the census baselines (`flowRegistrationCensus`, `ipcDomainCensus`, both
already red on main, so a regression there cannot be told apart) and `meta/knip-baseline.txt`.

It also needs a decision first: whether a go-offline wrap could ever come back. The D-09 PASS
branch says Mac Steam stays signed in without one, but the Rust `LogonWrap` trait and
`WrapRefused` are still in place.

## Done when

- A decision is recorded: delete the chain, or keep it as a dormant path with a named reason.
- If it is deleted, the channels, schema entries, preload invokers, frontend dialog and store,
  TS refusal branches and allow-list entries go in one change, and `pnpm check:ipc-contract`
  and the census tests are updated to the new counts.

## Decision

Deleted on 2026-11-16 (user decision), including the Rust refusal: `Refusal::GoOfflineRequired`, `WrapRefused` and `LogonErr::WrapRefused` are gone and `LogonWrap::before_logon` returns `WrapTicket` infallibly. The `LogonWrap` trait is kept because `RestoreOnlyWrap` uses it for the owed-record restore (boot and shutdown). Removed in quick 261116-vt7: the steamGoOfflineRetry/steamGoOfflineCancel channels and allow-list entries, the steamGoOfflineRequired push, SteamGoOfflineNotice (dialog + store), the go-offline-required lease reason and its branches, the guidedAction/installPath/forceWindowsViaBottle acquire opts, checkGuidedOfflineReady/readMacSteamCmState, the steam-go-offline-retry refresh origin, and the steam.goOffline i18n keys.
