---
phase: 81-unify-the-steam-restart-hold-into-restart-on-play
plan: 07
subsystem: steam-adoption
status: complete
tags: [typescript, steam, adoption, restart-on-play, notice-stack, ipc, launch-without-steam]
requires: [81-06]
provides:
  - request-notice kinds adopt-restart-game-running, adopt-restart-busy, adopt-restart-quit-timeout and payload field launchWithoutSteam
  - sidecar invoke channel steamLaunchWithoutSteamOnce (schema, window.api invoker, handler, shell allow-list entry)
  - dispatchSteamLaunchWithoutSteamOnce in launchDispatch.ts
  - renderSlot optional action and the class hook steamEngineLaunchNoticeAction
  - noticeSeq.ts (noticeSeq moved out of gameUninstall.ts)
  - i18n key gamelib:steam.adoptRestart.launchWithoutSteam
affects: [81-10, 81-14, 81-18]
tech-stack:
  added: []
  patterns: [closed notice kinds mapped to catalogue strings in the renderer, backend re-derives the verdict at click time, shared Steam single flight for the one-shot]
key-files:
  created:
    - src/backend/storeManagers/steam/noticeSeq.ts
  modified:
    - src/backend/storeManagers/steam/playAdoption.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/launchDispatch.ts
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/common/types/steam.ts
    - src/common/types/ipc/steam.ts
    - src/preload/api/steam.ts
    - src/frontend/state/SteamRequestNotice.ts
    - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
    - src-tauri/src/ipc_contract.rs
    - public/locales/en/gamelib.json
    - tests (playAdoption, launchDispatch, games, pollsRustBranch.uninstallRunning, SteamEngineLaunchNotice, SteamRequestNotice, ipcDomainCensus, flowRegistrationCensus, ipcSchemas/queueStorePush)
decisions:
  - "Open Question 2 settled: launch-without-Steam landed as a per-game setting, so the refused-restart notice offers a one-shot 'Launch without Steam' for games the backend's direct-launch verdict marks eligible; the one-shot never flips the setting (D-06)"
  - "The OS notification for the three refusals is replaced by the in-app notice (an OS notification cannot carry an action); the copy is unchanged"
  - "noticeSeq moved to noticeSeq.ts: playAdoption.ts pushes a notice, and gameUninstall.ts already imports hostPlatform from playAdoption.ts, so importing noticeSeq from gameUninstall would have been a cycle"
  - "The notice's button hides itself the moment the notice starts leaving (phase guard), so a double click cannot launch twice; the single flight is the second guard"
metrics:
  tasks: 2
  files: 24
  completed: 2026-11-18
commits: 3
plan_head_before: 24aeeb10d6eca12148f400eaa168fb8177e82ee7
plan_head_after: acbc27eb882360df65cd68e68d8c4b2f863bb935
actuals:
  tokens: 40000
  tasks: 2
  commits: 3
---

# Phase 81 Plan 07: refused restart becomes an in-app notice Summary

A refused Play restart (game running in Steam, sign-in/go-offline wrap owed, Steam not quitting in 30 s) now shows an in-app notice in the bottom-right stack with the same catalogue copy as before, and for games the backend marks eligible it carries a one-shot "Launch without Steam" button that launches through a new single-flight sidecar channel and never through Steam.

## Commits

- 213d01e53: feat(81-07) a refused Play restart becomes an in-app notice with today's copy (tracer)
- acbc27eb8: feat(81-07) Launch without Steam on the refused-restart notice, for eligible games only

`commits: 3` is the measured `rev-list` count from the ledger base to `plan_head_after`. One of the three (`966a56cab`, `docs(64): create phase plan`) belongs to another session that committed on main concurrently; this plan's own commits are the two above.

## What was built

- **Task 1 (tracer).** `playAdoption.ts` no longer calls the OS `notify`; the three refusal outcomes map to the closed kinds `adopt-restart-game-running | adopt-restart-busy | adopt-restart-quit-timeout` and send one `steamRequestNotice {appId, title, kind, seq}` (seq from `noticeSeq`, title from `libraryState`). Play still never opens a `rungameid` URL on a refusal and the record stays. `SteamRequestNotice.ts` and `SteamEngineLaunchNotice/index.tsx` accept the kinds (the closed-set check is unchanged: unknown kinds, non-numeric appIds and stale seqs are dropped) and three `requestBody` cases render the existing `steam.adoptRestart.*` strings with `{{game}}` where they had it. Dismiss, the 8 s auto-hide and wait-for-focus are unchanged because the kinds ride the existing request slot.
- **Task 2.** `playAdoption.ts` adds `launchWithoutSteam` to the push: true only when `getDirectLaunchVerdict()` resolves with `applies: true` (false on not-applicable or rejection). `dispatchSteamLaunchWithoutSteamOnce(deps, appId)` shares `launchFlights.singleFlightLaunch('steam', ...)` with Play (a second press joins and gets the "already starting" notice), re-derives the verdict, returns false with a log line when it does not apply, otherwise calls `launchWithoutSteam()` and records the recent game on true. It never touches the per-game setting and never calls the Steam launch. The `steamLaunchWithoutSteamOnce` channel: zod tuple `[/^\d{1,10}$/]`, `Promise<boolean>` return, a `@public`-tagged preload invoker, a handler that re-validates the appId with `DIRECT_LAUNCH_APP_ID` and catches to false, and the entry in `ipc_contract.rs`' allow-list. The notice renders a `noticeStackAction steamEngineLaunchNoticeAction` button (shared class, no new colours) before dismiss for `adopt-restart-*` kinds with the flag; clicking calls `window.api.steamLaunchWithoutSteamOnce(appId)` once and starts the leave. `pnpm i18n` added `steam.adoptRestart.launchWithoutSteam`.

## Tests

- `playAdoption.test.ts`: the three refusals now assert the push (kind, title, seq, `launchWithoutSteam`) with no OS notification and no rungameid open; a verdict applies / does not apply / rejects case for the flag.
- `launchDispatch.test.ts`: ineligible launches nothing, eligible launches without Steam only and records the recent game, a failed launch records nothing, the setting is never read, and a second press joins the flight (one launch, one notice).
- `SteamEngineLaunchNotice.test.tsx`: one render test per new kind, button shown only for adopt-restart kinds with the flag, click calls the channel once with the appId and starts the leave, a click on the leaving notice does nothing. `SteamRequestNotice.test.ts`: the three kinds accepted.
- `games.test.ts`: the three refusal cases now expect the in-app push. `ipcDomainCensus` 291 -> 292, `flowRegistrationCensus` steamFlowRegistration 3 -> 4 invokes, `queueStorePush` fixture for the new channel. `rendererAllowList` and `cargo test -p gamelib-shell ipc_contract` pass.

## Verification

- `pnpm exec jest src/backend/storeManagers/steam src/backend/sidecar src/frontend/screens/Game src/frontend/components/UI/SteamEngineLaunchNotice src/frontend/state`: only the logged `acfUpdateReplay` red remains.
- `pnpm codecheck` clean; `pnpm i18n --fail-on-update` exit 0; `pnpm lint` 0 errors; prettier `--check` clean on every touched path (none prettier-ignored, `gamelib.json` left out as the plan notes).
- `pnpm find-deadcode` and `pnpm backend-di-ceilings`: only the logged pre-existing reds. `pnpm steam-line-ceiling` passes.
- Acceptance greps: `notify(` in playAdoption.ts 0; `'adopt-restart-` in SteamRequestNotice.ts 3; `steam.adoptRestart.` in the notice 4; `steamLaunchWithoutSteamOnce` present in preload, ipc types, flow registration and `ipc_contract.rs`; `noticeStackAction` 1; the locale key present; `game.launch(` in the one-shot dispatch 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] noticeSeq moved to its own module**
- **Found during:** Task 1
- **Issue:** importing `noticeSeq` from `gameUninstall.ts` into `playAdoption.ts` closes a cycle (`gameUninstall.ts` imports `hostPlatform` from `playAdoption.ts`, and its header says imports go forward only).
- **Fix:** `noticeSeq.ts` holds the function (body verbatim); `gameUninstall.ts` and `playAdoption.ts` import it; `pollsRustBranch.uninstallRunning.test.ts` imports it from there. The orphaned `failUninstall` doc comment was put back above `failUninstall`.
- **Files modified:** noticeSeq.ts (new), gameUninstall.ts, playAdoption.ts, pollsRustBranch.uninstallRunning.test.ts
- **Commit:** 213d01e53

**2. [Rule 1 - Bug] games.test.ts refusal tests asserted the OS notification**
- **Found during:** Task 1
- **Issue:** the three launch-refusal tests expected `notify` once; the refusal is now the in-app push.
- **Fix:** they assert the `steamRequestNotice` push with the mapped kind and no `notify`.
- **Commit:** 213d01e53

**3. [Rule 1 - Bug] Channel-count pins and the fixture table for the new channel**
- **Found during:** Task 2
- **Issue:** `ipcDomainCensus` (291), `flowRegistrationCensus` (steamFlowRegistration invoke 3) and the `FixtureTable` in `queueStorePush.test.ts` enumerate channels.
- **Fix:** 292, 4, and a `steamLaunchWithoutSteamOnce` fixture row, each with the plan reference.
- **Commit:** acbc27eb8

## Deferred Issues

- `themeTokens.test.ts` render-site census expects 34 `is-text` sites and finds 37 (`NativePortInfo.tsx` carries 3 the census does not list); `pnpm gameinfo-narrowing-ceiling` fails on the same file. Neither is touched by this plan. Logged in deferred-items.md.
- Already logged: `backend-di-ceilings` (launchWithoutSteam.test.ts, NativePortInfo.test.tsx, LaunchWithoutSteam.test.tsx), `find-deadcode` (NativePortDataStyle, NativePortMac), `acfUpdateReplay`, `storeKinds.test.ts`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-81-23 (appId validated by the zod regex and again in the handler, library lookup only), T-81-24 (the dispatch re-derives `getDirectLaunchVerdict()` at click time; the renderer flag only decides whether the button shows; no steam_api is written), T-81-25 (shares `singleFlightLaunch('steam', appId)`), T-81-26 (closed kind sets on both renderer layers) are each implemented and tested.

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/noticeSeq.ts
- FOUND commits: 213d01e53, acbc27eb8
