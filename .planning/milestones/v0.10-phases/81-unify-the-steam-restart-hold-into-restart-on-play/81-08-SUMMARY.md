---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 08
subsystem: steam-adoption
status: complete
tags: [typescript, react, steam, adoption, restart-on-play, ipc, game-page]
requires: [81-07]
provides:
  - adoptionStatus.ts (getSteamAdoptionStatus, restartSteamNowForAdoption, openSteamForAdoption, answerSteamAdoptionStatus, answerSteamAdoptionRestartNow, answerSteamAdoptionOpenSteam)
  - sidecar invoke channels steamAdoptionStatus, steamAdoptionRestartNow, steamAdoptionOpenSteam (zod schema, window.api invokers, handlers, shell allow-list entries)
  - types SteamAdoptionStatus, SteamAdoptionRestartOutcome
  - playAdoption.ts pushAdoptRestartRefusal (the refusal notice, shared with Restart Steam now)
  - AdoptionNote.tsx + AdoptionNote.scss under GameStatus; CSS hooks steamAdoptionNote, steamAdoptionNote__text, steamAdoptionNote__action
  - i18n keys gamelib:steam.adoption.note.restartOnPlay, .note.signIn, .action.restartNow, .action.openSteam
affects: [81-09, 81-10, 81-14, 81-18, 81-20]
tech-stack:
  added: []
  patterns: [handler bodies live in the backend module as answer* functions so validation is testable without the heavy registration graph, restart-now shares the Steam launch single flight with Play and resolves false, relaunch of Steam itself through steam://open/main]
key-files:
  created:
    - src/backend/storeManagers/steam/adoptionStatus.ts
    - src/backend/storeManagers/steam/__tests__/adoptionStatus.test.ts
    - src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx
    - src/frontend/screens/Game/GamePage/components/AdoptionNote.scss
    - src/frontend/screens/Game/GamePage/components/__tests__/AdoptionNote.test.tsx
  modified:
    - src/backend/storeManagers/steam/playAdoption.ts
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/common/types/steam.ts
    - src/common/types/ipc/steam.ts
    - src/preload/api/steam.ts
    - src-tauri/src/ipc_contract.rs
    - src/frontend/screens/Game/GamePage/index.tsx
    - public/locales/en/gamelib.json
    - meta/i18nCatalogPresenceBaseline.json
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - tests (genI18nGateScope, ipcDomainCensus, flowRegistrationCensus, ipcSchemas/queueStorePush)
decisions:
  - "Handler bodies are answer* functions in adoptionStatus.ts (appId re-validated there, never throw); the registration lines are one-line delegations. steamFlowRegistration's import graph is too heavy to test validation through, so this is where the T-81-27 pins live"
  - "Restart Steam now relaunches with openExternal('steam://open/main') and no activate:false: the user pressed the button, so Steam comes up in front. The same URL serves Open Steam. Fallbacks if 81-20's live gate fails: open -b com.valvesoftware.steam, steam.exe with no args, plain steam"
  - "The restart flight resolves false so a Play that joined it records no recent game; a second click or a Play pressed meanwhile gets 'in-progress' for the click and the flight's false for Play (onJoin sets the flag)"
  - "i18n gate files were hand-edited for ONE file (AdoptionNote.tsx, fork-touched 407 -> 408, scope 286 -> 287) instead of regenerated: a phase 64 session had three more fork-touched files uncommitted and the derivation is all-or-nothing"
metrics:
  tasks: 2
  files: 21
  completed: 2026-11-18
commits: 8
plan_head_before: ff4f9d5db2ceae63077449d7da9f502f91f34e66
plan_head_after: a1fb0188397bd3db3938fff52f7bf45855b9133e
actuals:
  tokens: 16000
  tasks: 2
  commits: 8
---

# Phase 81 Plan 08: the unadopted state on the game page Summary

An installed Steam game with a pending-adoption record now shows its Installed badge, Play, and a quiet note under the status line, "Steam will restart once when you press Play.", with one secondary action beside it: "Restart Steam now" (quit Steam gracefully, relaunch Steam itself) or, when Steam is running but signed out, "Sign in to Steam to finish setup" with "Open Steam". All of it is backend-driven and prompt-free.

## Commits

- eedf309e9: feat(81-08) the game page shows the restart-once note for an unadopted install (tracer)
- a1fb01883: feat(81-08) Restart Steam now and Open Steam from the game page note, no prompt

`commits: 8` is the measured `rev-list` count from the ledger base to `plan_head_after`. Six of the eight (`2e3460388`, `f3f6311f3`, `480e20ad8`, `25614d9cc`, `595973590`, `54b567f6a`, all phase 64) belong to another session that committed on main concurrently; this plan's own commits are the two above.

## What was built

- **Task 1 (tracer).** `adoptionStatus.ts` answers `{pending, steamSignedIn}` from the stored record (`steamSignedIn` is `null` until 81-09 feeds it). The `steamAdoptionStatus` channel carries a zod `[/^\d{1,10}$/]` tuple, a preload invoker, the sidecar handler and the allow-list entry. `AdoptionNote` reads it on mount and whenever the game's `libraryStatus` changes (SteamUpdateInfo pattern, hooks before any return) and renders the D-01 note for an installed Steam game; nothing for non-Steam, not pending, not installed, or a rejected query. It is mounted between `GameStatus` and `.buttons`. The Play gate's refusal push was extracted to `pushAdoptRestartRefusal` for Task 2 to share.
- **Task 2.** `restartSteamNowForAdoption` runs `restartSteamForAdoption` (same `createRestartDeps` as the Play gate) inside `launchFlights.singleFlightLaunch('steam', appId, ...)` with `relaunch = openExternal('steam://open/main')`. No record answers `no-record`; `relaunched` clears and unwatches the record; a refusal (game running, wrap owed, 30 s quit timeout) pushes the 81-07 `adopt-restart-*` notice with `launchWithoutSteam: false`, keeps the record and returns the refusal kind; a join answers `in-progress`; a throw answers `error`. `openSteamForAdoption` calls `openExternal('steam://open/main')` with no second argument. `AdoptionNote` now renders one `button is-secondary steamAdoptionNote__action`: "Open Steam" plus the sign-in text when `steamSignedIn === false`, otherwise "Restart Steam now"; disabled while in flight or launching/playing; the status is re-read when the action resolves, so a relaunch removes the block. For the GameLib 1026 edge (installing, `steam-waiting-for-restart`) the block shows the action without the note. `AdoptionNote.scss` uses `--text-secondary`, `--secondary-font-family`, `--text-sm` and `--space-xs` only.

## Tests

- `adoptionStatus.test.ts` (28): status bullets, validation (non-numeric, 11 digits, empty, number, null, undefined, throwing store), each restart outcome on linux/macOS, only `steam://exit` then `steam://open/main` opened and never `rungameid`, status events `steam-starting` then `done`, a second click and a Play pressed meanwhile join (one restart, Play's body never runs, flight resolves false), Open Steam with one argument, handler bodies reject a bad appId before the game lookup.
- `AdoptionNote.test.tsx` (18): every render case, the re-query on `libraryStatus` change and after an action, disabled states, in-flight double click, the 1026 edge, a rejected action, no `confirm(`/`showDialog`, no literal colours in the stylesheet.
- Pins moved for the new channels: `ipcDomainCensus` 292 -> 295, `flowRegistrationCensus` steamFlowRegistration invoke 4 -> 7, a fixture row per channel in `queueStorePush`. `rendererAllowList` and `cargo test -p gamelib-shell ipc_contract` pass.

## Verification

- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/frontend/screens/Game src/frontend/state`: 8730 passed, only the logged `acfUpdateReplay` red.
- `pnpm codecheck` clean; `pnpm i18n --fail-on-update` exit 0; `pnpm lint` 0 errors, no warning in a touched file; `pnpm find-deadcode`: only the two logged `nativePortCatalogue.ts` findings; prettier `--check` clean on every touched path (none prettier-ignored).
- `meta/__tests__/lintTranslations.test.ts` and `genI18nGateScope.test.ts`: green except A-17 (see Deferred).
- Acceptance greps: `steam://open/main` 2, `rungameid` 0, allow-list entries 3, `confirm(`/`showDialog` 0, colour literals 0, locale keys present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18n presence baseline did not know the new keys**
- **Found during:** Task 2 verification (the meta suite, outside the plan's verify)
- **Issue:** `lintTranslations.test.ts` (REQ-41-02, R13) failed with 240 "new key not localised and not recorded" entries: 48 locales times the four new keys and 81-07's `steam.adoptRestart.launchWithoutSteam`, which 81-07 left unrecorded.
- **Fix:** `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib`; the diff is additions only (5 keys x 48 locales, 0 removed).
- **Files modified:** meta/i18nCatalogPresenceBaseline.json
- **Commit:** a1fb01883

**2. [Rule 1 - Bug] The new frontend file was not in the i18n gate scope**
- **Found during:** Task 2 verification
- **Issue:** A-17 anti-rot failed on `AdoptionNote.tsx` (committed fork-touched list lacked it). Task 1's commit introduced this.
- **Fix:** hand-inserted the file in sorted position into `meta/i18nForkTouchedFiles.json` and `meta/i18nGateScope.json` as SCANNED (every string uses `t()`), moved the test pins 286 -> 287 and 407 -> 408 with a dated comment. Not regenerated: see Decisions.
- **Files modified:** meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json, meta/__tests__/genI18nGateScope.test.ts
- **Commit:** a1fb01883

**3. [Rule 1 - Bug] Channel-count pins and the fixture table**
- **Found during:** Task 1 and Task 2
- **Issue:** `ipcDomainCensus`, `flowRegistrationCensus` and `queueStorePush` enumerate channels.
- **Fix:** 293 then 295; invoke 5 then 7; a fixture row per channel.
- **Commits:** eedf309e9, a1fb01883

## Deferred Issues

- `meta/__tests__/genI18nGateScope.test.ts` A-17 stays red for `customThemes/colour.ts`, `customThemes/contrastFloors.ts`, `customThemes/tokenResolve.ts` and `testUtils/scssTokenSource.ts`: new fork-touched files from a concurrent phase 64 session, not this plan's. That session records them (scan or declared debt) when it regenerates.
- Gap for 81-10 (not fixed here, by plan design): the GameLib 1026 waiting edge has no pending-adoption record, so `restartSteamNowForAdoption` answers `no-record` there and the button does nothing visible. The plan pins `no-record` for a missing record; making the 1026 button act needs 81-10's decision on what that path's record is.
- Already logged: `backend-di-ceilings`, `find-deadcode` (NativePortDataStyle, NativePortMac), `acfUpdateReplay`, `storeKinds.test.ts`, `themeTokens.test.ts` is-text census, `gameinfo-narrowing-ceiling`.

## Known Stubs

None. `steamSignedIn` is always `null` until 81-09 feeds it from the Rust watch, so the D-03 sign-in note is reachable only through the status contract (covered by tests) until then; that is the plan's stated sequencing, not a stub.

## Threat Flags

None beyond the plan's register. T-81-27 (appId: zod regex, the answer* re-check, library lookup only, allow-list entries) and T-81-28 (shared `singleFlightLaunch('steam', appId)`, button disabled in flight, the three refusals kept, Steam never killed) are implemented and tested. Owed to the 81-20 live gate: `steam://open/main` as the relaunch on all three OSes and the note reading in midnightMirage, gruvbox_dark and dracula.

## Self-Check: PASSED

- FOUND: adoptionStatus.ts, adoptionStatus.test.ts, AdoptionNote.tsx, AdoptionNote.scss, AdoptionNote.test.tsx
- FOUND commits: eedf309e9, a1fb01883
