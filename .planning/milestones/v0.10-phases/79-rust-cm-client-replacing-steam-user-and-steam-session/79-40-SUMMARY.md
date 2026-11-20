---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 40
subsystem: steam-auth
tags: [steam, sign-in, rust, depot, cleanup, delete-gate]
requires: [79-39]
provides:
  - Rust-only Steam sign-in (no steam-session import, no LoginSession)
  - TS go-offline wrap and owed-record versioning deleted
  - steam-user-free depot code (no CDN token workaround, no _send tap)
affects: [79-41]
tech-stack:
  added: []
  patterns: ["leaf helper macSteamClient.ts for the Mac Steam running probe and guided Continue"]
key-files:
  created:
    - src/backend/storeManagers/steam/macSteamClient.ts
    - src/backend/storeManagers/steam/__tests__/macSteamClient.test.ts
  modified:
    - src/backend/storeManagers/steam/userSignIn.ts
    - src/backend/storeManagers/steam/userSignInState.ts
    - src/backend/storeManagers/steam/steamProcesses.ts
    - src/backend/storeManagers/steam/depot/appinfoOrder.ts
    - src/backend/sidecar/depotHostRegistration.ts
  deleted:
    - src/backend/storeManagers/steam/macSteamOffline.ts
    - src/backend/storeVersioning/macSteamOfflineOwedFile.ts
    - src/backend/storeManagers/steam/depot/cdnAuth.ts
key-decisions:
  - "macSteamOffline slice replaced by a read-only macSteam helper; steamGoOfflineCancel kept as a no-op"
  - "cdnAuth.ts deleted outright, with tokenCache removed from every depot job"
requirements-completed: [CF-01, CF-06, D-05, D-09, D-10]
duration: one session
completed: 2026-11-15
---

# Phase 79 Plan 40: Rust-only sign-in, wrap and depot deletion Summary

Steam sign-in is Rust-only, the TypeScript go-offline wrap and its owed-record versioning are gone, and the depot pipeline carries no steam-user specifics.

## Commits
- `c85f177bf` Task 1: Rust-only sign-in, TS wrap deleted
- `52a17abf6` Task 2: steam-user-free depot code
- `74c1e01db` ceiling ratchet and dead constant removal
- The wrap module and its tests were deleted by `git rm`. The operator session's commit `ad5a128ad` swept those staged deletions into itself, so they land there rather than in `c85f177bf`.

## What was deleted
- **Sign-in:** the steam-session `LoginSession` branches of `userSignIn.ts` (`finishAuth` and the TS QR/credential/guard flows). In `userSignInState.ts`, the `kind: 'ts'` variant (the session slot is now just `{flowId, lastChallengeUrl?, finalize?}`) and the credential settle callbacks. `steamCmSignInImpl` is no longer consulted here. `QR_LOGIN_TIMEOUT_MS` is dead and removed. The rust half of `userSignIn.ts` is untouched apart from renames (so the `finalizing` race fix stays).
- **Wrap:** `macSteamOffline.ts`, `storeVersioning/macSteamOfflineOwedFile.ts` and the `steam/mac-steam-offline-owed` entry in `STORE_MIGRATIONS`. Rust owns the owed record (D-09 PASS branch: `RestoreOnlyWrap`).
- **Wrap tests and harness:** `macSteamOfflineWrap.test.ts`, `macSteamOnlineDebt.test.ts`, `macSteamOfflineOwedFile.test.ts`, `testUtils/macSteamOfflineHarness.ts`.
- **Depot:** `depot/cdnAuth.ts` (`_send` token fetch, schema cache), `cdnAuth.test.ts`, `fixtures/cdnAuthSendFixture.ts`, the raw-VDF `_send` tap and `extractDepotOrder` in `appinfoOrder.ts` (its old test too), `SteamUserDepotExtras`/`SteamUserDepotClient` in `planModel.ts`, the `SteamUserFitsSteamCmClient` assertion, the `cdnSchema` slice of `SteamInstallRuntime`.
- **Rewritten:**
  - `user.test.ts` lost its TS sign-in describes (rust coverage is `userSignIn.rustEngine.test.ts`) and drives the credentials sign-in through the Rust flow.
  - `credentialsMissing.test.ts` lost its two TS-engine tests.
  - The wrap mocks were removed from user, credentialsMissing, probeCredentialPresence, steamStartupKeyringDeferral and appShellFlows.

## Decisions Made
- **Surviving module `steam/macSteamClient.ts`** replaces the wrap instance (`steamProcesses.macSteamOffline` became `steamProcesses.macSteam`). It holds `readMacSteamCmState`, the pgrep running probe, `openUrlDetached` and `checkGuidedOfflineReady`, which only reads: it arms nothing and writes no record. `isOwnUserPidAlive` had no non-wrap user and was deleted.
- `MacSteamRestoreOutcome` is gone. `SteamUser.releaseForShutdown()` now resolves void, since the shell owns the shutdown restore.
- **Guided dialog:** the `steamGoOfflineRequired` push in `user.ts` is unchanged. `steamGoOfflineRetry` goes through `macSteamClient`. `steamGoOfflineCancel` is a no-op, because no sidecar-side guided arm exists. Rust runs `RestoreOnlyWrap` (D-09 PASS), so go-offline-required is not produced in practice.
- **Depot token path deleted rather than kept as a stub:** all jobs lose `tokenCache`, and `depotCdnToken` answers `''` for a known job and `null` for an unknown one.
- Edited depot importers: `depotRust/{install,secondary,updateEstimate,jobRegistry,rustDepot}.ts`, `depot/sharedRedist.ts` (`SharedRedistHostInfo` is now a type alias), `steamInstallRuntime.ts`.

## Deviations from Plan
- **[Rule 3]** The plan did not mention the `userTypes.ts` move of `MacSteamRestoreOutcome`; the type was removed instead, because nothing needs it any more.
- **[Rule 3]** DI-ceiling JSON entries were lowered or removed for the deleted and edited tests (`meta/backendDiCeilings/*`).
- The acceptance grep `steam-session ... | wc -l == 0` cannot reach 0 literally. Boot-step names (`'steam-session-state'`) and comments still contain the string. There is no import or require of the package left in `src`, only dead `jest.mock('steam-session')` stubs in five tests (`user.rustEngine`, `steamStartupKeyringDeferral`, `credentialsMissing`, `tokenStore`, `probeCredentialPresence`). Those are left for 79-41, which removes the dependency.
- The wrap deletions were committed in the operator session's commit `ad5a128ad` (see Commits).

## Verification
- `tsc`: green.
- `pnpm exec jest src/backend src/frontend/screens/Login`: all green except the known failures: epicOfflineMode, shimCoverage, shimGenerate and tauriShellSource, plus `flowRegistrationCensus` and `ipcDomainCensus`. The two census failures predate this plan's task 2 and come from outside it (appShell and shellFiles send counts, ipc total 291 vs 297); no census-counted channel was added or removed here.
- Gates: `codecheck`, `lint`, `prettier`, `boundaries` and `steam-line-ceiling` pass in the working tree. In a `git archive HEAD` export, `i18n --fail-on-update`, `find-deadcode`, `backend-di-ceilings` and `gameinfo-narrowing-ceiling` pass. In the dirty working tree they fail only on the operator's GamePage files.
- `smoke:exit-check` skipped (needs a live app).

## Threat model
- T-79-116: the Rust restore at boot and shutdown still reads the owed record (no TS owner left).
- T-79-117: `RestoreOnlyWrap` means no wrapped logon exists. The D-09 retest passed, UAT B item 13.

## Self-Check: PASSED
- Files present: `macSteamClient.ts`, `macSteamClient.test.ts`. Deleted files confirmed absent.
- Commits `c85f177bf`, `52a17abf6`, `74c1e01db` exist.
