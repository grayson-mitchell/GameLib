---
phase: 75-steam-local-file-formats-in-rust
plan: 31
subsystem: steam-local-files
tags: [delete-gate, p75-g, acf-fields, beta-key, adoption, config]
requires: [75-28, 75-29, 75-30]
provides: [Rust-only ACF-field, beta, adoption and config readers]
key-files:
  modified:
    - src/backend/storeManagers/steam/depot/betaBranch.ts
    - src/backend/storeManagers/steam/acfInstalledDepots.ts
    - src/backend/storeManagers/steam/library/acfUpdateState.ts
    - src/backend/storeManagers/steam/macSteamAdoption.ts
    - src/backend/config.ts
requirements-completed: [STEAM-03, P75-G, P75-A, P75-C]
completed: 2026-11-14
---

# Phase 75 Plan 31: ACF-field, beta, adoption and config readers Rust-only Summary

The text-flag TS branches and TS parsers are deleted. `readAcfBetaKey`, `readLocalConfigBetaKey`, `readAcfInstalledDepots`, `readAcfUpdateFieldsFromDir`, `readAcfSnapshot` and `steamRootDefault` have only their Rust path. Deleted: `parseAcfTree`, `acfString`, `acfBlock`, `AcfTree`, `parseAcfInstalledDepots`, `decodeUserAppConfigBetaKey` (with walkMap/readCString and the localconfig line regex), `parseAppState`, `getSteamCompatFolderTs`, `isFlatpakSteamInstalled`, `FLATPAK_STEAM_APP`. No `@node-steam/vdf` import remains in these files. Rust-path fail-soft behaviour is unchanged.

isSteamAdoptedAcf behaviour change: covered by DV-75-12 in 75-PARITY.md (accepted: yes, 2026-11-14); a snapshot without stateFlags/buildid now reads not-adopted. `steam_pending_adoption.json` is empty on the dev Mac.

## Commit

- 80f0cf135 refactor(75-31): production and test changes in one commit (the trimmed tests only pass against the Rust-only code).

## Deviations from Plan

**1. [Rule 3 - Blocking] Tests relying on the removed ts branch.**
- configFactoryDefaultsSpawnFree.test.ts imported `isFlatpakSteamInstalled`; its two flatpak-root cases were removed with the function (flatpak discovery is Rust-side).
- macSteamAdoption.test.ts: the `acf()` helper now sets `stateFlags`/`buildid` like a Rust-taken snapshot; added a case that a snapshot without them reads not-adopted; the pending-store round-trip baseline is `{mtimeMs, content}` (the store persists only those keys).
- stubRustDepot.ts (shared fixture) now answers `steamfiles_*` frames from `fsBackedSteamFiles()`, which fixes rustInstall's DLC-retire cases; rustInstall/depot.cmPlan logger mocks gained `logDebug`; depot.cmPlan's ACF BetaKey case routes `requestRustInvoke` to the file-backed double; updateDetection.exit deps spread `fsBackedSteamFiles()`; rustInstall's zero-depot finalize test counts `depot_finalize` calls (the beta ACF read now rides the same mock). The `GAMELIB_STEAMFILES_TEXT=rust` pin of the finalize describe is kept for plan 34.
- fixtureCopy.ts comment no longer names `parseAcfTree` (acceptance grep).

**2. Test cases deleted (ts-branch-only, Rust twin exists):**
- depot.betaBranch.test.ts: `decodeUserAppConfigBetaKey` describe (4 cases, decoder is Rust); "file readers and resolver" describe (readAcfBetaKey, readLocalConfigBetaKey, resolveUserBetaKey precedence; twins in "beta keys on Rust"). `steamId64ToAccountId` kept as its own describe.
- acfInstalledDepots.test.ts: `parseAcfInstalledDepots` describe (4 cases; Rust twin keeps 19-digit GID exactness).
- config.steamRootDefault.test.ts: "ignores the env var under the ts flag"; `GAMELIB_STEAMFILES_TEXT` removed from remaining cases.
- updateDetection.acf.test.ts, macSteamAdoption.test.ts: env pins only. updateEstimate.test.ts needed no change (mocks readAcfInstalledDepots).

## Gates

- tsc clean. eslint 0 errors (warning count above the cap is pre-existing across the repo). Prettier clean.
- find-deadcode: 5 findings, all pre-existing humble/* and WebView/storeExitRefresh.ts. steam-line-ceiling exit 0. backend-di-ceilings: 20 FAIL lines. No `jest.mock(` added or removed.
- Jest steam + sidecar + backend/__tests__: remaining failures are pre-existing or other sessions: tauriShellSource, moduleStateCensus, diPhaseGates, bridge shimCoverage/shimGenerate.

## Self-Check: PASSED
