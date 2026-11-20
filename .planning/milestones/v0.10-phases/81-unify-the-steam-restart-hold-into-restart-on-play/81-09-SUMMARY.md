---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 09
subsystem: steam-adoption
status: complete
tags: [typescript, react, steam, adoption, ipc, push-channel, zustand, game-page]
requires: [81-08]
provides:
  - SteamInstallRuntime.adoption { pushSeq, signedIn } (per-boot closure containers)
  - pushSteamAdoptionStatus, noteAdoptionSignedIn, AdoptionStatusDeps, AdoptionPushDeps in adoptionStatus.ts; getSteamAdoptionStatus reads the signed-in cache
  - push channel steamAdoptionStatusChanged, type SteamAdoptionStatusPayload, preload handleSteamAdoptionStatusChanged
  - src/frontend/state/SteamAdoptionStatus.ts (useSteamAdoptionStatus, handleSteamAdoptionStatusChangedSignal)
affects: [81-10, 81-14, 81-18, 81-20]
requirements-completed: [D-03, D-07]
tech-stack:
  added: []
  patterns: [one push per record write and clear (strictly increasing seq per boot), renderer keeps the newest seq per app, a push wins over the query when its seq is newer than the store's at query issue time, a failed push never fails the write that caused it]
key-files:
  created:
    - src/frontend/state/SteamAdoptionStatus.ts
    - src/frontend/state/__tests__/SteamAdoptionStatus.test.ts
  modified:
    - src/backend/storeManagers/steam/steamInstallRuntime.ts
    - src/backend/storeManagers/steam/adoptionStatus.ts
    - src/backend/storeManagers/steam/adoptionWatch.ts
    - src/backend/sidecar/steamPollEventRegistration.ts
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/bootstrap.ts
    - src/common/types/steam.ts
    - src/common/types/ipc/steam.ts
    - src/preload/api/steam.ts
    - src/frontend/state/initStateSubscriptions.ts
    - src/frontend/screens/Game/GamePage/components/AdoptionNote.tsx
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - tests (adoptionStatus, adoptionWatch, steamPollEventRegistration, AdoptionNote, ipcDomainCensus, queueStorePush, steamFocusRefreshWire, games, playAdoption, genI18nGateScope)
decisions:
  - "The push is emitted from clearAndUnwatchPendingAdoption / recordAndWatchPendingAdoption themselves, so every one of the many call sites (install, uninstall, Play gate, Restart now, resume, Rust adopted event) pushes without each being edited"
  - "The adoptionState handler's adopted:true arm now calls clearAndUnwatchPendingAdoption (was clearPendingAdoption): it clears, drops the signed-in cache entry and pushes pending:false once. Unwatching an entry Rust already dropped is a no-op. adopted:false stores the reading through noteAdoptionSignedIn (one push)"
  - "AdoptionNote merges by seq floor: the query records the store's seq for the app when it is issued; a pushed entry with a higher seq wins. Every change pushes, so the latest push is always the latest state"
  - "The renderer test seeds the REAL zustand store and spies its hook rather than adding a jest.mock, so AdoptionNote.test.tsx stays at its 81-08 mock count (the backend-di-ceilings census counts jest.mock calls)"
metrics:
  tasks: 2
  files: 33
  completed: 2026-11-18
commits: 4
plan_head_before: 824d1d40b10519dab9577d97b8291014be416b6f
plan_head_after: aea1329188a949311a5a3d7f9bb3f78f5bfd6dce
actuals:
  tokens: 8000
  tasks: 2
  commits: 4
---

# Phase 81 Plan 09: the adoption note stays live Summary

The pending-adoption note on the game page now clears itself when Steam adopts the install and follows Steam's sign-in state, with no reload: every record write and clear, and every signed-in reading from the Rust watch, pushes `steamAdoptionStatusChanged` once with a strictly increasing seq.

## Commits

- 2fec149f1: feat(81-09) a cleared adoption record hides the game page note without a reload (tracer, Task 1)
- 9b585e4d3: chore(81-09) record the adoption-status push store in the i18n gate scope
- ae0e0f83f: feat(81-09) the Rust watch's signed-in reading reaches the game page note (Task 2)

`commits: 4` is the measured `rev-list` count from the ledger base to `plan_head_after`. One of the four (`aea132918`, phase 64 plan 03) belongs to another session that committed on main concurrently; this plan's own commits are the three above.

## What was built

- **Task 1 (tracer, D-07).** `SteamInstallRuntime` gained `adoption: { pushSeq: { last }, signedIn: Map }` (the test runtime builds it through the real factory). `adoptionStatus.ts` gained `pushSteamAdoptionStatus(deps, appId)`: one `steamAdoptionStatusChanged` `{appName, pending, steamSignedIn, seq}` with `seq = ++pushSeq.last`, never throwing. `recordAndWatchPendingAdoption` pushes after the store write; `clearAndUnwatchPendingAdoption` drops the cache entry and pushes after the clear. The channel (`SteamAdoptionStatusPayload`, zod tuple, preload `handleSteamAdoptionStatusChanged`) and a validated zustand store (`SteamAdoptionStatus.ts`: numeric appName, boolean pending, boolean-or-null signed-in, finite seq, newer-seq-wins per app) are registered beside `handleSteamRequestNotice`. `AdoptionNote` merges the query with the push entry. Rust's `adoptionState adopted:true` event now clears through `clearAndUnwatchPendingAdoption`, so the note disappears on adoption.
- **Task 2 (D-03).** `getSteamAdoptionStatus` answers the cached signed-in reading (null when none); `noteAdoptionSignedIn` stores a reading and pushes once; the `adoptionState` handler calls it for an unadopted event, so a signed-out reading switches the note to "Sign in to Steam to finish setup" with Open Steam and a later signed-in reading switches it back. Play stays available throughout (the button is only disabled while launching or playing).

## Tests

- adoptionStatus (+8): cache read, push payload and increasing seq, payload carries only appName/pending/steamSignedIn/seq, a throwing transport never throws, noteAdoptionSignedIn.
- adoptionWatch (+4): record push, clear push plus cache drop, increasing seq across write/clear/write, a failed push never fails the write.
- steamPollEventRegistration (+4): signed-out reading cached and pushed, later signed-in reading, adopted pushes pending:false and drops the cache, a stale event pushes nothing.
- SteamAdoptionStatus store (new, 22 cases): every validation drop, per-app newest-seq-wins.
- AdoptionNote (+6): push with pending false removes the block with no re-query, signed-out then signed-in switch, Play stays enabled, a push shows a not-pending query, a push at or below the issue-time floor loses, another game's push ignored.
- Pins moved for the new channel: `ipcDomainCensus` total 295 -> 296 and owner-less allowlist 65 -> 66, a `queueStorePush` fixture row, `genI18nGateScope` 412 -> 413 / 291 -> 292.

## Verification

- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/frontend/screens/Game src/frontend/state`: 8782 passed, 3 skipped, 1 failed (the logged `acfUpdateReplay`).
- `cargo test -p gamelib-steampoll`: all green. `pnpm codecheck` clean. `pnpm lint`: 0 errors, no new warning in a touched file. prettier `--check` clean on every touched path (none prettier-ignored). `meta/__tests__/genI18nGateScope.test.ts` and `lintTranslations.test.ts` green. `pnpm find-deadcode`: only the two logged `nativePortCatalogue.ts` findings plus `Misc.storeSetChecked` (phase 64 plan 03's, not this plan's).
- Acceptance greps: `handleSteamAdoptionStatusChanged` in initStateSubscriptions.ts 2, `pushSteamAdoptionStatus` in adoptionWatch.ts 3 (record + clear + import), `adoption:` in steamInstallRuntime.ts 2, `noteAdoptionSignedIn` in steamPollEventRegistration.ts 2, `signedIn.get` in adoptionStatus.ts 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] steamFlowRegistration.ts and handlers.ts carry the runtime**
- **Found during:** Task 1 (`pnpm codecheck`)
- **Issue:** `answerSteamAdoptionStatus` now needs the signed-in cache, but the registration passes `SteamFlowDeps`, which had no `steamInstallRuntime` (the plan note assumed it passed manager deps). Neither file is in `files_modified`.
- **Fix:** added `'steamInstallRuntime'` to the `SteamFlowDeps` Pick and one line in `registerHandlers` passing it; `steamFocusRefreshWire.test.ts`'s deps builder gained `createTestSteamInstallRuntime()`.
- **Files modified:** src/backend/sidecar/steamFlowRegistration.ts, src/backend/sidecar/handlers.ts, src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts
- **Commit:** 2fec149f1

**2. [Rule 3 - Blocking] The boot-time resume deps widened**
- **Found during:** Task 1 (`pnpm codecheck`)
- **Issue:** `AdoptionWatchDeps` now needs `sendFrontendMessage` and `steamInstallRuntime` (a stale-record clear at boot pushes too); `bootstrap.ts`'s `steam-adoption-resume` step built the deps without them.
- **Fix:** the step now passes `host.sendFrontendMessage` and `steamInstallRuntime` from `requireServices`. No timer or handle added (sidecar exit contract unchanged).
- **Files modified:** src/backend/sidecar/bootstrap.ts
- **Commit:** 2fec149f1

**3. [Rule 1 - Bug] Pins and fakes the new channel and deps moved**
- **Issue:** `ipcDomainCensus` (total and owner-less allowlist), the `queueStorePush` fixture table, `playAdoption`/`adoptionStatus` deps fakes (need `adoption`), and `games.test.ts`'s "uninstall() does NOT call sendFrontendMessage" (clearing a record now pushes the adoption status, which is not an optimistic install flip; the assertion now ignores only `steamAdoptionStatusChanged`).
- **Commit:** 2fec149f1

**4. [Rule 1 - Bug] New frontend file not in the i18n gate scope**
- **Issue:** A-17 anti-rot and A-03 ratchet need every new fork-touched file recorded. `SteamAdoptionStatus.ts` was hand-inserted in sorted position into `meta/i18nForkTouchedFiles.json` and `meta/i18nGateScope.json` (SCANNED, no user-facing strings), pins 412 -> 413 and 291 -> 292 with a dated comment, as 81-08 did.
- **Commit:** 9b585e4d3

**5. [Rule 3 - Blocking] knip finding for the new preload export**
- **Found during:** Task 2 (`pnpm find-deadcode`)
- **Fix:** `@public` JSDoc with a reason on `handleSteamAdoptionStatusChanged`, matching its siblings (the baseline file forbids adding lines).
- **Files modified:** src/preload/api/steam.ts
- **Commit:** ae0e0f83f

### Note on `ipc_contract.rs`

The pre-commit hook regenerates `src-tauri/src/ipc_contract.rs` from the working tree, which held phase 64 plan 03's uncommitted `sidecar:store-set-checked` channel. The regenerated file is left unstaged in the working tree (it is that session's one-line change); this plan's push channel is not a renderer-invoked channel and adds nothing to the contract.

## Deferred Issues

- Carried over from 81-08, not caused or grown here and not on the logged list: `pnpm backend-di-ceilings` reports `AdoptionNote.test.tsx has 5 (jestMock) and no baseline entry` (it was 5 before this plan, still 5), and `pnpm gameinfo-narrowing-ceiling` reports `AdoptionNote.tsx has 1, baseline 0` (the `isStore(gameInfo, 'steam')` call from 81-08). Both need a baseline/ceiling decision by the owner of that ratchet.
- Logged and untouched: `acfUpdateReplay`, `find-deadcode` (NativePortDataStyle, NativePortMac), `backend-di-ceilings` (launchWithoutSteam, NativePortInfo, LaunchWithoutSteam), `gameinfo-narrowing-ceiling` (NativePortInfo).
- Routed to the verifier, not attempted: the GameLib 1026 edge "Restart Steam now" no-op.
- A sidecar restart resets the push seq to 1 while a renderer that outlives it still holds a higher stored seq for an app; the push would then be dropped until the page re-queries (the query result still wins when its issue-time floor is >= the stored seq). Same property as `steamRequestNotice`; the shell restarts the renderer with the sidecar in practice.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-81-29 (the push carries appName, two booleans and a seq; a test pins the key set) and T-81-30 (the renderer validates shape and keeps only a newer seq per app) are implemented and tested. Owed to the 81-20 live gate: the 112100 sign-in case (Steam at its sign-in screen, the user signs in, the same pid adopts, the note clears by itself).

## Self-Check: PASSED

- FOUND: src/frontend/state/SteamAdoptionStatus.ts, src/frontend/state/__tests__/SteamAdoptionStatus.test.ts
- FOUND commits: 2fec149f1, 9b585e4d3, ae0e0f83f
