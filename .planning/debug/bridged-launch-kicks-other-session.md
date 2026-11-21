---
status: awaiting_human_verify
trigger: "A bridged launch while another device is playing gets one Steam session kicked (\"Logged In Elsewhere\") without Steam's own prompt. Source todo: .planning/todos/pending/2026-11-21-bridged-launch-kicks-the-other-steam-session.md"
created: 2026-11-21
updated: 2026-11-21
source_todo: .planning/todos/pending/2026-11-21-bridged-launch-kicks-the-other-steam-session.md
related:
  - .planning/debug/resolved/bridged-launch-steam-signed-out.md (fix e5fc84b8c; rounds 2-3 evidence of the kicks)
  - .planning/debug/resolved/whoami-probe-timeout-not-inited.md (fix bd9a1eb61)
---

# Debug: a bridged launch kicks the other Steam session

## Symptoms

- **expected:** Pressing Play on a bridged game while the same Steam account is playing on another
  device behaves like a native Mac Steam launch: the user is told the account is playing elsewhere
  and chooses, instead of a session silently being logged off.
- **actual:** The bridge helper's InitFlat registers "playing <appId>" with Mac Steam, and in the
  same second Steam's servers log one session off with `RecvMsgClientLoggedOff('Logged In
  Elsewhere')`. Three runs on 2026-11-21 (19:16, 19:50, 19:57) suggest the OLDER session is dropped
  (Mac kicked twice, PC once). No prompt from Steam or GameLib.
- **errors:** none surfaced; Mac Steam lands on its sign-in screen, or the PC is signed out.
- **timeline:** observed 2026-11-21; the Nov 20 06:03:50 kick during a bridged Avernum 6 run is
  plausibly the same thing.
- **repro:** same account signed in and playing a game on a PC; press Play on a bridged game in
  GameLib (Mac). Watch Mac Steam's `~/Library/Application Support/Steam/logs/connection_log.txt`
  and the PC.

Known residual race (from the signed-out fix): a WHOAMI answered before the kick lands still
passes, so the game can still start against a session that is about to die.

Direction from the todo:
1. Confirm the rule: bridged launch vs a native Mac Steam launch of the same game with the PC
   playing. Does Mac Steam's own launch prompt, and is there a pre-launch signal the helper or
   GameLib could read before InitFlat (e.g. playing-session state such as `playing_blocked` /
   `ClientPlayingSessionState`, or a Steamworks callback)?
2. If a signal exists, show GameLib's own "playing on another device" choice before spawning the
   helper.
3. At minimum close the race: re-check WHOAMI once just before the game is spawned, or watch for a
   SteamServersDisconnected callback in the helper during the first seconds.

Constraints: live repro needs the operator with a second device (PC) on the same account. Read
`Skill("spike-findings-gamelib")` (Mac Steam integration, Rust CM stack) and
`Skill("gamelib-conventions")` before code changes. The in-repo Rust CM stack (gamelib-steamcm on
steam-vent) is a candidate source of the playing-session state. Restart `pnpm tauri:dev` before
live tests (dev does not rebuild the sidecar; run `pnpm build:sidecar`, and `pnpm
build-steam-bridge` for helper changes). Say "ready for human" when handing a live step over.

## Current Focus

hypothesis: The bridge registers "playing <appId>" with Mac Steam (helper InitFlat with the real AppID, or the DRM-mode game process's lsteamclient) while another session of the account is playing, WITHOUT the pre-launch check Mac Steam's own launch does (IClientUser::BIsOtherSessionPlaying, then the user's choice, then BKickOtherPlayingSession). The CM then resolves the conflicting playing claim by logging one whole session off ("Logged In Elsewhere") instead of blocking the game.
test: fix applied (read-only pre-launch check, nothing registered while another session plays); automated gates green; live gate pending.
expecting: live (operator, PC playing the same account): (1) `steam-bridge-helper --steam-playing-session` reads otherSessionPlaying 1 while the PC plays and 0 while it is idle; (2) Play on a bridged game shows "Playing on another device", starts nothing, and Steam logs no new `Logged In Elsewhere`; (3) with the PC idle Play launches normally.
next_action: operator runs the live gate (checkpoint), then answers the "Play here" product decision. If step (1) reads 0 while the PC plays, the signal does not carry the PC's state: revert to investigating (candidate: ClientPlayingSessionState read from a signed-in GameLib CM session instead).
reasoning_checkpoint:
  hypothesis: "Registering 'playing' with Mac Steam past BIsOtherSessionPlaying makes Steam's CM log a session of the account off. The bridge helper's InitFlat(real AppID) does exactly that registration; Mac Steam's own launch does not skip the check."
  confirming_evidence:
    - "Three kicks (19:16:18, 19:57:33 Mac; 19:50:02 PC per operator) each land in the same second as the bridged game being tracked (gameprocess_log AppID 3205720 adding PID + SSGL InternalUpdateClientGame), and the 19:56:18 launch with no other session playing ran 58 s without a kick."
    - "No signed-in GameLib CM logon in gamelib-shell.log at any of the three times (only anonymous product-info sessions), so spike 077's logonID collision is not the kicker."
    - "steamclient.dylib carries BIsOtherSessionPlaying / BKickOtherPlayingSession / CMsgClientPlayingSessionState(playing_blocked) and 'ResumeSuspendedGames - Kicking remote session playing app': Mac Steam runs check-then-kick on its own launches; the helper never does."
  falsification_test: "With the PC playing, the new helper subcommand reads otherSessionPlaying 0 on a signed-in Mac Steam (signal does not carry the PC's state), OR the gate blocks a launch and a 'Logged In Elsewhere' still lands, OR the same launch with GAMELIB_STEAM_OTHER_SESSION_CHECK=off does NOT reproduce the kick."
  fix_rationale: "Moves the decision to before the one call that registers (InitFlat / DRM game start), using the very state Mac Steam consults, so nothing is registered and no session is dropped. It does not detect-and-recover from a kick after the fact."
  blind_spots: "BIsOtherSessionPlaying has not been read while another device plays (needs the operator). Which session the CM drops, and why it drops one instead of blocking, is not observable from the Mac. The 2 s post-sign-in settle is UNMEASURED. Whether Mac Steam's own launch really prompts in this state is read from strings, not observed."
  candidate_causes:
    - "code: bridge registers 'playing' without Steam's pre-launch check (the defect)"
    - "environment: another device of the same account playing, which is the trigger, not the defect"
    - "config/data: GameLib's signed-in CM session replacing the Mac session (eliminated: no signed-in logon at the kicks)"
    - "environment: Mac Steam holding a stale playing-session state (not excluded: the live read decides; fail-open on any helper doubt)"
  and_gate: "no for the kick itself: the bridged registration alone plus another playing session is sufficient. A second contributing condition (stale state, post-sign-in race) affects only the guard's reliability, not the cause."

## Evidence

- timestamp: 2026-11-21 (session 2)
  checked: Steam connection_log / gameprocess_log / console_log / steamui_login for 19:16, 19:50, 19:57
  found: 19:16:18 gameprocess `AppID 3205720 adding PID 47587` + `SSGL: InternalUpdateClientGame` + connection_log `RecvMsgClientLoggedOff('Logged In Elsewhere')` all in the same second; console_log `CAPIJobRequestUserStats - Server response failed 2` the same second. 19:57:33: game tracked (PID 84784) and `RecvMsgClientLoggedOff('Logged In Elsewhere')` the same second, UI `WaitingForCredentials - Logged In Elsewhere`. 19:50:02: game tracked, NO Mac kick (the PC was the one dropped, per operator).
  implication: the registration of "playing" and the kick are one event, three times out of three. The 19:56:18 launch (PC not yet playing) ran 58 s with no kick, so a launch by itself does not kick.

- timestamp: 2026-11-21 (session 2)
  checked: ~/Library/Logs/GameLib/gamelib-shell.log (epoch lines, converted to NZDT) 19:15-20:00
  found: only `CM logon mode=anonymous reason=product-info` sessions (19:16:14, 19:48:35, 19:49:59, 19:56:14, 19:57:29 ...) and their idle closes. No signed-in GameLib CM logon in the window.
  implication: GameLib's own Rust CM session did not log on as the account at any of the three kicks, so it is not the kicker (spike 077's logonID collision does not apply). Eliminates the "GameLib CM session replaced the Mac session" lead.

- timestamp: 2026-11-21 (session 2)
  checked: Mac Steam sign-in times in connection_log
  found: Mac Steam logged on at 19:07:57 (credentials JWT issued 19:07:57), 19:49:07, 19:59:03. Before the 19:16:18 kick the Mac session was 8.5 minutes old.
  implication: the todo's "Mac Steam signed in since the morning, the older session" for the 19:16 run is wrong; the "Steam drops the OLDER session" rule is therefore unproven for run 1 (the PC's sign-in time is not in the Mac logs). 19:50 (Mac newer 19:49:07, PC dropped) and 19:57 (PC newer, Mac dropped) still fit "older dropped". The fix does not depend on which session is chosen.

- timestamp: 2026-11-21 (session 2)
  checked: strings in ~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/steamclient.dylib
  found: `BIsOtherSessionPlaying`, `BKickOtherPlayingSession`, `PlayingSessionChanged_t`, `CMsgClientPlayingSessionState` (fields playing_blocked / playing_app), `CMsgClientKickPlayingSession`, "Other session playing", "ResumeSuspendedGames - Kicking remote session playing app %d", "ResumeSuspendedGames - Aborting, as user is playing app %d elsewhere".
  implication: Mac Steam itself runs a check-then-kick sequence before it starts a game; the bridge path (helper InitFlat registering "playing") never runs it. This is the pre-launch signal the todo asked for.

- timestamp: 2026-11-21 (session 2)
  checked: spike 084 slot map (.planning/spikes/084-owned-apps-from-running-steam/slotmap.txt) + live scan with the 084 probe on the current build (260 IClientUser slots) + otool disassembly of the slot-221 proxy
  found: IClientUser `BIsOtherSessionPlaying` = function-ID high half 0x7787 (slot 221 on this build, unique), `BKickOtherPlayingSession` = 0x6a30 (slot 222). The proxy serialises only the user handle, reads one return byte and then writes 4 bytes through its first argument unconditionally: signature `bool BIsOtherSessionPlaying(uint32_t *pOtherAppId)` (out pointer must be non-NULL). A live call with the real Steam (currently signed out, loggedOn 0) returned otherSessionPlaying 0 and overwrote the 0xdeadbeef sentinel with 0.
  implication: a read-only, no-registration pre-launch signal exists and is callable the same way `--steam-appstate` reads `BLoggedOn`. Whether it reads 1 while a PC is playing is NOT yet observed (needs the operator).

- timestamp: 2026-11-21 (session 2, implementation)
  checked: wrote the fix (see Resolution) and ran tests
  found: new tests pass; the first full-suite run exposed a REAL regression of my own: `ensureBridgeHelperReady` spawns its first helper synchronously on purpose (helperSpawn.test drives the child's stderr straight after the call), and my first guard did `await otherSessionBlocks()` even with no check supplied, deferring the spawn by a microtask. 33 failures in helperSpawn/helperRegistry/helperProcess; reproduced in a clean HEAD worktree + only my change set (HEAD alone: 81/81 pass), bisected to helperProcess.ts, fixed by making the check return `undefined` (not a resolved promise) when none is due, and pinned with a new "still spawns synchronously" test. After the fix: helperSpawn+helperRegistry+helperProcess 88/88; steam + backend/__tests__ + sidecar + common + frontend state/Game/SteamEngineLaunchNotice 505 suites, 11861 tests pass.
  implication: no existing behaviour moved for callers that pass no check; the guard only awaits when it is the thing being asked.

## Eliminated

- hypothesis: GameLib's own signed-in Rust CM session logged on and replaced the Mac session (spike 077 logonID collision)
  evidence: gamelib-shell.log shows only anonymous CM logons in 19:15-20:00; no signed-in logon at 19:16:18, 19:50 or 19:57:33.
  timestamp: 2026-11-21

## Resolution

root_cause: The bridge launch registers "playing <appId>" with Mac Steam without running the pre-launch check Mac Steam's own launch runs. The bridge helper's SteamAPI_InitFlat (real AppID; also the DRM-mode game process's lsteamclient) claims the play slot directly, skipping IClientUser::BIsOtherSessionPlaying, Steam's "playing on another computer" prompt and BKickOtherPlayingSession. While another session of the account is playing, Steam's CM answers the unmediated claim by logging one whole session off ("Logged In Elsewhere"): Mac at 19:16 and 19:57, PC at 19:50. The PC-side and CM-side decision is not observable from the Mac; the registration-to-kick coincidence (same second, 3 of 3) and the absence of any GameLib signed-in CM session are.
fix: (1) native/steam-bridge/helper/gamelib_playingsession.h + bridge_helper.c: new one-shot, read-only `--steam-playing-session` (BLoggedOn + IClientUser::BIsOtherSessionPlaying, both resolved by unique IPC function-ID high half 0x6585 / 0x7787, out-pointer signature `bool (uint32_t *)` read from the arm64 proxy); registers nothing; one JSON line. (2) bridge/otherSessionPlaying.ts: readOtherSessionPlaying (fail open: only a signed-in `playing` answer blocks) and createOtherSessionGuard (per launch; a first "clear" after a signed-out reading is re-read after 2 s, UNMEASURED); GAMELIB_STEAM_OTHER_SESSION_CHECK=off opts out. (3) helperProcess.ts: ensureBridgeHelperReady takes `checkOtherSessionPlaying` and asks before every real-AppID spawn (first, identity-only-replacement, each Steam-state-hold respawn), returning status 'other-session-playing' with nothing spawned; the first spawn stays synchronous when no check is supplied. (4) gameBridgeLaunch.ts: passes the guard, treats the new status like a Steam-state cause (session not poisoned, no bottled fallback, one steamBridgeSetupRequired), and checks once before launchDrmModeGame. (5) SteamBridgeSetup.tsx + gamelib.json: "Playing on another device" dialog (title + body, Cancel only, raw reason line suppressed). No "Play here" yet: product decision pending.
verification:
  target_test: { result: pass, tests: "bridge/__tests__/otherSessionPlaying.test.ts (27); helperProcess.test.ts 'bridged-launch-kicks-other-session' (8); games.test.ts other-session (TCP status x3 incl. new, guard wiring, DRM blocked + DRM clear); steamPlayingSessionHelper.test.ts real compiled helper under fake HOME (3)" }
  mutation_check: { result: skipped, reason_if_skipped: "Stryker is not configured; manual mutation instead (see revert_and_reconfirm)", mutant_killed: n/a }
  no_op_deletion: { result: pass, deletion_justified_by_rca: n/a, note: "additive: one subcommand, one module, one option, one status, one dialog branch; nothing removed" }
  adjacent_tests: { result: pass, suites_run: ["steam + backend/__tests__ + sidecar + common + frontend/state + frontend/screens/Game + SteamEngineLaunchNotice: 505 suites, 11861 tests", "helperSpawn + helperRegistry + helperProcess 88/88", "meta logSecretGate, hardcodedStringGate, i18nParserConfig, i18nCatalogChurnGuard, i18nGlossary, boundaryGates, gen_vtables, buildSteamBridgeShims"], note: "tsc src + meta clean; prettier clean on every changed TS path (gamelib.json is prettier-ignored); eslint 0 errors (1 pre-existing no-floating-promises warning in helperProcess.ts); pnpm find-deadcode PASS (312 baselined, unchanged). The first full run caught a regression of mine (guard awaited before the first spawn, breaking helperSpawn's synchronous-spawn contract, 33 failures); fixed and pinned by a test. pnpm lint-translations adds 2 keys to its pre-existing per-locale 'Missing translation' noise (other locales carry no gamelib catalog)." }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "unit level only: guard disabled in helperProcess.ts -> 4 of 8 new tests fail; re-check before the hold respawn removed -> 1 fails; guard not passed / DRM check removed in gameBridgeLaunch.ts -> 2 fail; all restored. The live equivalent is checkpoint step 4 (GAMELIB_STEAM_OTHER_SESSION_CHECK=off reproduces the kick)." }
  live: { result: pending, note: "needs the operator with a second device on the same account: see the checkpoint (signal read while the PC plays, gate, control)" }
  oracle_type: derived
  guardrail_verdict: accepted-pending-live
files_changed:
  - native/steam-bridge/helper/gamelib_playingsession.h (new)
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/otherSessionPlaying.ts (new)
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx
  - public/locales/en/gamelib.json (ONLY the two otherSessionPlaying* lines; the file also carries foreign key-reorder hunks that must not be staged)
  - src/backend/storeManagers/steam/bridge/__tests__/otherSessionPlaying.test.ts (new)
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - src/backend/storeManagers/steam/__tests__/steamPlayingSessionHelper.test.ts (new)
  - src/backend/storeManagers/steam/__tests__/games.test.ts
