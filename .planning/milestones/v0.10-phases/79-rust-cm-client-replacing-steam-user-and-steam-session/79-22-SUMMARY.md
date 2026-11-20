---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 22
subsystem: steam-depot
tags: [steam, depot, rust-cm, cdn-auth, appinfo]
requires: [79-17, 79-18]
provides:
  - depot pipeline typed against SteamCmClient
  - Rust depotOrder capture
  - engine-aware depot host handlers
key-files:
  modified:
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depot/contentServers.ts
    - src/backend/storeManagers/steam/depot/appinfoOrder.ts
    - src/backend/storeManagers/steam/depot/cdnAuth.ts
    - src/backend/sidecar/depotHostRegistration.ts
  created:
    - src/backend/storeManagers/steam/depot/__tests__/appinfoOrder.rust.test.ts
    - src/backend/sidecar/__tests__/depotHostRegistration.rust.test.ts
metrics:
  tasks: 2
  completed: 2026-11-15
---

# Phase 79 Plan 22: Depot pipeline on a Rust lease Summary

The depot pipeline now takes the lease's `SteamCmClient`, reads the appinfo depot order from Rust product-info results, and answers no CDN token on cm=rust.

## Commits

- 255ac07ff: depot types, appinfoOrder, cdnAuth
- 28743ec21: engine-aware host handlers and tests

## CDN token evidence (advisory, counts only, no token values)

Searched `~/Library/Logs/GameLib/gamelib.log*` (7 files), all from the cm=ts transport:

- non-empty token acquired ("CDN auth token acquired", tokenLen): 0
- "no CDN auth token required" (empty token, eresult=OK): 0
- "empty token field in decoded GetCDNAuthToken response": 115
- "GetCDNAuthToken failed" warnings: 115 (fastly 51, alibaba 38, akamai 26)

No non-empty token was ever used in production, so no CF-06 conflict was found and **no todo was created**. Recorded in the cdnAuth.ts doc block.

## What changed

- `plan.ts`, `contentServers.ts`: `SteamUserDepotClient` replaced by `SteamCmClient`. `SteamUserDepotClient` stays in planModel.ts as the steam-user extras type (it is still what the compile-time assignability check in SteamCmClient.ts uses).
- `appinfoOrder.ts`: a client without `_send` (Rust) has `apps[id].depotOrder` recorded from the result; the `_send` tap is installed only for steam-user.
- `cdnAuth.ts`: `CdnAuthTokenCache` accepts either client and returns '' when the client has no `_send`. The `_send` path stays for cm=ts until the delete gate.
- `depotHostRegistration.ts`: on cm=rust `depotCdnToken` answers '' (job lookup and arg validation kept, no client touched). On a failed request code, `steamcmKind` of timeout, network or leaseUnknown replies `{unavailable: kind}`; eresult 40 still replies `{eresult: 40}`. cm=ts unchanged.

The job's `refreshRequestCode` already called `getManifestRequestCode` on the lease client via `requestCodeRefresher(getDepotClient(...))`, so no job-builder change was needed. The install/update state machines are untouched (D-17).

## Deviations from Plan

None material. planModel.ts was left unmodified (the type swap happened at the use sites), and no pending todo was created because the evidence was empty.

## Verification

Steam-subtree jest: 175 suites pass; the only failures are the known pre-existing shimCoverage, shimGenerate and libraryReplay. `pnpm tsc --noEmit` and prettier clean. Log-grep acceptance count is 0.

## Self-Check: PASSED
