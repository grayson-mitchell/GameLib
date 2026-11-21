---
status: resolved
trigger: "A bridged game can launch while Mac Steam is at its login screen, and then has no friends until restarted. Source todo: .planning/todos/pending/2026-11-20-bridged-game-launches-while-mac-steam-signed-out.md"
created: 2026-11-21
updated: 2026-11-21
source_todo: .planning/todos/pending/2026-11-20-bridged-game-launches-while-mac-steam-signed-out.md
---

# Debug: bridged game launches while Mac Steam is signed out

## Symptoms

- **expected:** A bridged game launched from GameLib gets a signed-in Steam session (friends,
  invites), or GameLib stops/warns before launching when Mac Steam is not signed in.
- **actual:** On 2026-11-20 (live invite-picker test, CrossOver-engine bridged game) Mac Steam was
  at its login screen when the game came up. The game ran anyway; Steam's invite picker opened with
  no friends. Signing in to Steam while the game ran did not help. Restarting the game with Steam
  signed in fixed it (invite sent, other account joined).
- **errors:** None surfaced to the user. Helper LISTEN/READY/INIT log lines for the signed-out
  launch not yet captured.
- **timeline:** First seen 2026-11-20. Unknown whether it ever behaved differently.
- **repro:** Sign out of Mac Steam (or leave it at its login screen), then launch a bridged game
  from GameLib. Observe helper logs and in-game friends/invite picker.

Open question from the todo: did GameLib start Steam (and leave it at its login screen), or was
Steam already sitting there signed out?

Candidate fixes from the todo: (a) pre-launch check that Mac Steam is signed in — hold the launch
or prompt sign-in; (b) at minimum, tell the user to sign in to Steam and restart the game.

Relevant files: `src/backend/storeManagers/steam/bridge/helperSpawn.ts`,
`native/steam-bridge/helper/bridge_helper.c`.

Constraints: live repro needs the operator (macOS, Mac Steam). Follow repo conventions
(`Skill("gamelib-conventions")`) for any child-process spawn or sidecar handle; the user's
memories say restart `pnpm tauri:dev` before live-testing backend changes (dev does not rebuild
the sidecar) and use "ready for human" when handing a live step to the operator.

## Current Focus

hypothesis: CONFIRMED statically and by forensics, live sign-in-screen proof pending (human-verify). The bridge readiness gate (ensureBridgeHelperReady) treated "helper InitFlat succeeded + CONTROL WHOAMI answered STATUS_OK" as "Mac Steam is signed in". Neither proves it: InitFlat / ConnectToGlobalUser succeed against a Steam parked at its sign-in screen (261105-ord gate item 6, Phase 81 D-08), and the helper's WHOAMI answered STATUS_OK with whatever GetSteamID returned (account 0 when signed out) while the backend read only the status byte.
test: fix applied; unit + real-compiled-helper integration tests green; revert-and-reconfirm done; live signed-in sanity run against the real Mac Steam done. Round 1 live (operator, explicit Steam sign-out): hold + steamNotSignedIn dialog worked, wait invisible (notify() system notification never seen) -> round 2 moved it in-app. Remaining: operator re-runs the sign-out repro and the Nov 20 'Logged In Elsewhere' repro (steps in the checkpoint).
expecting: with Steam at the sign-in screen, Play shows the in-app "Waiting for Steam" notice (bottom-right stack, hourglass, no countdown bar), holds up to 60 s, launches once the operator signs in (fresh helper, real session, friends present), or ends in the existing steamNotSignedIn dialog. The helper logs `INIT   user loggedOn=0 accountPresent=0` for each held attempt.
next_action: none -- resolved 2026-11-21 (operator confirmed (a), (b), (c) live). Follow-up todo: 2026-11-21-bridged-launch-kicks-the-other-steam-session.md.
reasoning_checkpoint:
  hypothesis: "The launch gate has no signal for 'Mac Steam running but signed out': InitFlat/ConnectToGlobalUser succeed at Steam's sign-in screen, so READY init=ok and WHOAMI STATUS_OK follow, and the backend probe reads only the status byte, so the existing 261027-aue wait loop (entered only on the INIT text `ConnectToGlobalUser failed`) never runs. The game starts, reads the dead session once, and has no friends."
  confirming_evidence:
    - "Steam gameprocess_log: Schedule I 3205720 tracked at 17:02:48, 'logged on while running' at 17:04:12, relaunch 17:05:29 works. The game launched immediately, not after the 60 s Steam-wait budget (which returns false and never launches)."
    - "Steam connection_log/steamui_login: Steam sat at the sign-in screen (WaitingForCredentials) from 06:03:50 to 17:04:12; its process was not started by GameLib (bootstrap_log: unbroken 2026-11-19 21:01 to 2026-11-20 18:39)."
    - "261105-ord SUMMARY item 6 and 81-HUMAN-UAT 1b: a signed-out Steam still returns a user handle from ConnectToGlobalUser; BLoggedOn reads 0 there."
    - "Code: probeHealthAndWhoami `whoamiOk: decoded.status === STATUS_OK`; bridge_helper.c WHOAMI sends STATUS_OK + GetSteamID bytes unconditionally once g_inited and the accessor resolve."
  falsification_test: "With Steam at its sign-in screen the fixed helper logs `INIT   user loggedOn=1` or `accountPresent=1`, or Play still launches the game at once. Either means the signed-out reading is not (BLoggedOn 0 and account 0) and the rule must change (e.g. gate on BLoggedOn alone)."
  fix_rationale: "Teaches the gate the missing signal at the one place that proves a live session (WHOAMI, evaluated live on every probe, so a reused helper is re-checked too) and routes it into the existing bounded hold, toast and dialog (candidate fix (a) of the todo). Not a symptom patch: it does not suppress the dialog or add a launch-time sleep."
  blind_spots: "The sign-in-screen reading (BLoggedOn 0, account id 0) is inferred from 261105-ord/Phase 81 plus the signed-in reading measured now, not measured at the sign-in screen with this helper. Who kicked Steam out at 06:03:50 ('Logged In Elsewhere': another device or GameLib's CM session) is not established. DRM-mode launches (launchDrmModeGame) have no sign-in check at all and are not covered."
  candidate_causes:
    - "code: gate trusts InitFlat + STATUS_OK as 'signed in' (confirmed)"
    - "environment: Steam parked at its sign-in screen after a 'Logged In Elsewhere' logoff 11 h earlier (confirmed, the trigger, not the defect)"
    - "config: wait budget too short (eliminated: the launch did not wait at all)"
    - "data: stale helper entry reused with an old session (eliminated as the main path: helpers are stopped at game exit; the fix also re-asks WHOAMI live on reuse)"
  and_gate: "no for the defect: the missing sign-in check alone lets the launch through whenever Steam is signed out, whatever signed it out. The 'Logged In Elsewhere' kick is the upstream trigger and is a separate lead, not a second contributing cause of this gap."

## Evidence

- timestamp: 2026-11-21
  checked: ~/Library/Application Support/Steam/logs/gameprocess_log.txt (Nov 20)
  found: AppID 3205720 (Schedule I Demo, CrossOver bridged game) tracked from 17:02:48; "SSGL: logged on while running" at 17:04:12; game exit 17:05:02; relaunch 17:05:29 (the working run). Matches the todo timeline exactly.
  implication: the failing launch was 17:02:48, and Steam logged on 84 s after the game started. The game launched at once, i.e. the bridge gate returned ready, not after the 60 s Steam-wait budget.

- timestamp: 2026-11-21
  checked: Steam connection_log.txt + steamui_login.txt (Nov 20 06:00-17:05)
  found: 06:03:50 `RecvMsgClientLoggedOff('Logged In Elsewhere')`, UI state `WaitingForCredentials - Logged In Elsewhere`, then "UI Request: connect" every ~70 s (login screen) until 17:04:12 `LogOn() called; already connected, sending credentials` with a JWT issued 17:04:11 (operator typed credentials). The Steam process itself ran unbroken from 2026-11-19 21:01 to 2026-11-20 18:39 (bootstrap_log: Startup 21:01:13, Shutdown 18:39:17).
  implication: answers the todo's open question. GameLib did not start Steam. Steam was already sitting at its sign-in screen (signed out by a "Logged In Elsewhere" kick 11 h earlier at 06:03:50, during a bridged Avernum 6 run) when Schedule I launched. WHO the other session was is not in Steam's logs (could be a second device or a GameLib CM session); that is a separate lead, not needed for this fix.

- timestamp: 2026-11-21
  checked: helperProcess.ts ensureBridgeHelperReady / probeHelperReadiness, gameBridgeLaunch.ts:523-573, SteamBridgeSetup.tsx
  found: a complete Steam-state hold already exists (261027-aue): bounded 60 s wait, "Waiting for Steam" toast, fresh helper every 3 s, steamNotSignedIn dialog on budget end. It is entered ONLY when the helper's `INIT InitFlat failed ... err=ConnectToGlobalUser failed` line is parsed. probeHealthAndWhoami returns `whoamiOk: decoded.status === STATUS_OK` and never looks at the SteamID.
  implication: the gate has no signal for "Steam running, signed out" other than an InitFlat failure.

- timestamp: 2026-11-21
  checked: native/steam-bridge/helper/gamelib_appstate.h header + .planning/milestones/v0.10-quick/261105-ord-*/261105-ord-SUMMARY.md item 6 + 81-CONTEXT D-08 + 81-HUMAN-UAT item 1
  found: "a signed-out Steam still returned a user handle" (ConnectToGlobalUser <= 0 does NOT track the sign-in screen); BLoggedOn=0 is the live-measured sign-in-screen reading (81-HUMAN-UAT 1b: `{"loggedOn":0,...}` at the sign-in screen, 1a `loggedOn:1` signed in).
  implication: InitFlat (which calls ConnectToGlobalUser) very likely succeeds at the sign-in screen, so READY init=ok and WHOAMI STATUS_OK follow, and the helper reports ready. The k6o gate (`ConnectToGlobalUser failed`) measured only the "launched while still signing in" window.

- timestamp: 2026-11-21
  checked: bridge_helper.c WHOAMI handler (line ~2461-2488) and header comment (line 70)
  found: WHOAMI sends STATUS_OK + 8 raw bytes of `SteamAPI_ISteamUser_GetSteamID(self)` with no validity check, although the header comment claims it "proves init succeeded against a live signed-in Mac Steam".
  implication: the documented contract and the implementation disagree; the contract is what the backend relies on.

- timestamp: 2026-11-21
  checked: GameLib logs for the failing launch
  found: not recoverable. gamelib.log is rotated on every boot (current .old starts 23:07:10 Nov 20); the 17:02 helper LISTEN/READY/INIT lines are gone.
  implication: the live-gate step in the checkpoint must capture the helper INIT lines (the fix adds one carrying loggedOn / accountPresent flags, never the SteamID).

- timestamp: 2026-11-21
  checked: fix applied + tests
  found: bridge_helper.c WHOAMI now computes loggedOn (flat BLoggedOn, masked & 0xff) and accountPresent (SteamID low 32 bits != 0); signed out = neither -> STATUS_ERR + one-byte reason 0x03 (WHOAMI_ERR_REASON_NOT_SIGNED_IN, mirrored in protocol.ts with a parity test). helperProcess.ts probe maps it to the existing 'steam-wait' / 'steam-not-signed-in' outcome (full-AppID helpers only). One `INIT   user loggedOn=%d accountPresent=%d` line per helper (cap 4), flags only. Tests: helperProcess.test.ts 43/43 (4 new + parity), helperIntegration.test.ts (6 new against the REAL compiled helper and a fake libsteam_api in four states: signedout, signedout-nil, online, offline), whole steam bridge dir + games.test.ts + fakeHomeIsolation: 2284 passed; meta gen_vtables + buildSteamBridgeShims 446 passed; tsc (src and meta) clean; prettier clean on changed TS; eslint: 2 warnings, both pre-existing lines.
  implication: offline-mode (BLoggedOn 0, account kept) keeps launching, so the fix does not regress offline play.

- timestamp: 2026-11-21
  checked: live signed-in sanity run (read-only): fixed helper built to the scratchpad, spawned against the REAL running Mac Steam with --appid 480 (Spacewar, no game of the operator's), probe-role HELLO then WHOAMI
  found: helloStatus 0, whoamiStatus 0, 8 bytes, account id non-zero; helper log `INIT   user loggedOn=1 accountPresent=1`. `--steam-appstate` read `loggedOn:1`. The real libsteam_api exports SteamAPI_ISteamUser_BLoggedOn (loggedOn=1 proves it resolved).
  implication: the signed-in path is unchanged on real Steam. The signed-out reading still needs the operator (Steam sign-out restarts Steam and needs credentials, so it was not driven from here).

- timestamp: 2026-11-21 15:28-15:29 (operator live run, human-verify round 1)
  checked: operator signed Mac Steam out via Steam > Sign out, pressed Play on Schedule I 3205720; gamelib.log lines 455-631
  found: every helper logged `INIT InitFlat failed ... ConnectToGlobalUser failed` + `READY init=failed` (old 261027-aue path, NOT the new WHOAMI path -- no `INIT   user` line). Hold ran 15:28:46-15:29:46, gave up with steam-not-signed-in, game did NOT launch, and the operator confirmed the steamNotSignedIn dialog appeared. BUT the operator saw no "Waiting for Steam" message: it is sent via notify() = tauri-plugin-notification (macOS system notification, log says "delivery not confirmable"); the operator saw no macOS notification. For the whole minute the UI showed only "Launching".
  implication: (1) the hold itself works for an explicit sign-out; (2) the wait is invisible -- the 261027-aue notify() (commit 4f3208b14, 2026-10-27) predates the in-app NoticeStack (e4b4ec81b, 2026-11-06) and was never moved onto it; (3) the new WHOAMI branch (the Nov 20 "Logged In Elsewhere" state, where InitFlat succeeds) is still not live-exercised. Operator asked: why a macOS notification rather than a toast. Precedent for the in-app route: pushDirectLaunchNotice / SteamRequestNotice kinds ('direct-launch-needs-steam') rendered by SteamEngineLaunchNotice in AppNoticeStack.

- timestamp: 2026-11-21 (round 2, in-app wait notice)
  checked: code paths for the wait message: gameBridgeLaunch.ts onWaitingForSteam, helperProcess.ts ensureBridgeHelperReady wait loop (onWaitingForSteam fires once, `steamBridgeSetupRequired` is sent inside the loop on budget end, then the function returns), SteamEngineLaunchNotice request slot, SteamRequestNotice store, noticeSeq
  found: the request slot is single (one shown + one pending), 8 s auto-hide with countdown bar, seq-ordered store (`latest`, older/equal dropped). A hold can last 60 s, so the notice must be persistent, and it needs a retraction signal (the request stream had none).
  implication: design = three new SteamRequestNoticePayload kinds. `bridge-wait-steam-not-running` / `bridge-wait-steam-not-signed-in` render persistent (no auto-hide, no hairline, hourglass icon, title + body from the EXISTING gamelib steam.bridge.waiting.* keys, so no locale change). `bridge-wait-end` renders nothing; it starts the leave of the shown wait notice for the same appId (and drops a queued one). Backend: new steam/bridgeWaitNotice.ts (begin from onWaitingForSteam, end() takes its seq only after the start push so it is always newer); gameBridgeLaunch.ts wraps ensureBridgeHelperReady in try/finally and fires `void waitNotice.end()` so the launch never waits on a notice and a throw still retracts. End fires right after the `steamBridgeSetupRequired` dialog push (inside ensureBridgeHelperReady) on the dialog path and before writeBridgeConfig on the launch path.
  decision_notify: notify() DROPPED for this message. Reasons: (1) it is the surface that failed (system notification, "delivery not confirmable", not seen by the operator; `tauri dev` never delivers one); (2) keeping it would double-announce wherever notifications do work, and a system notification cannot be retracted when the hold ends, so it would linger after the launch; (3) precedent 261106-pvk / 59-UAT G6 moved the equivalent notices from system notification to the in-app stack for the same reason.

- timestamp: 2026-11-21 (round 2 verification)
  checked: tests, typecheck, formatting, lint, mutation, sidecar build
  found: tsc (src) clean, tsc (meta, tsconfig.meta.json) clean. Jest: src/backend/storeManagers/steam + src/backend/sidecar + fakeHomeIsolation + src/frontend/components/UI + src/frontend/state + src/frontend/dev + src/common = 430 suites passed, 10192 tests passed, 3 skipped (pre-existing). New/changed tests: steam/__tests__/bridgeWaitNotice.test.ts (8), games.test.ts 'the in-app wait notice' block (6 incl. 2 dialog causes + throw; replaces the old notify() test), SteamEngineLaunchNotice.test.tsx 'bridge wait notice' (13), SteamRequestNotice.test.ts (+3 accepted kinds). Mutation: gameBridgeLaunch.ts reverted to HEAD -> 5 of the 6 new games tests fail (the 6th, 'never waits pushes nothing', correctly passes); notice index.tsx auto-hide guard removed -> 'does not auto-hide' fails; end handling disabled -> 2 end tests fail; all restored. prettier --check clean on all 10 changed paths (file-info: all not ignored, typescript). eslint on changed files: 0 errors, 4 warnings all pre-existing (3 exhaustive-deps in index.tsx, 1 no-unsafe-argument in the old test helper). `pnpm build:sidecar` run: build/main/sidecar.js contains `bridge-wait-steam-not-signed-in` and no longer the `gamelib:steam.bridge.waiting` notify strings.
  also: `pnpm find-deadcode` (knip ratchet) PASS (312 baselined; new module exports only createBridgeWaitNotice). meta hardcodedStringGate, boundaryGates, i18nParserConfig, logSecretGate PASS. meta/__tests__/genI18nGateScope.test.ts failed ONCE mid-run on its A-17 live-git anti-rot case and passed on two isolated re-runs; the cause is another session editing meta/i18nForkTouchedFiles.json, meta/i18nGateScope.json and meta/__tests__/genI18nGateScope.test.ts (quick 261121-lco, files modified 15:41-15:42 while this ran). Those three meta files are NOT ours: do not stage them. `pnpm lint-translations` exits 1 on pre-existing upstream-locale noise (0 lines mention the waiting keys or the touched files).
  implication: automated gates green; the live behaviour (notice visible, retracted on both exits) is the operator's checkpoint.

- timestamp: 2026-11-21 19:16 (operator live run, human-verify round 2)
  checked: (a) explicit sign-out + wait out the hold, (b) sign in during the hold; then (c) the "Logged In Elsewhere" repro: same account signed in and playing on a PC, then Play on Schedule I 3205720 in GameLib. gamelib.log 470-571, Steam connection_log 29122-29153, steamui_login, gameprocess_log, config/loginusers.vdf
  found: (a) PASS, (b) PASS (operator). (c) FAIL: the game launched. Sequence: 19:16:18 helper InitFlat (real appid) -> Mac Steam tracks 3205720 ("InternalUpdateClientGame indicates change to games list") -> SAME SECOND `RecvMsgClientLoggedOff('Logged In Elsewhere')`, UI `WaitingForCredentials - Logged In Elsewhere`; 19:16:19 helper `INIT   user loggedOn=0 accountPresent=1` -> WHOAMI STATUS_OK (offline-mode rule) -> launch. loginusers.vdf `WantsOfflineMode "0"`.
  implication: (1) FALSIFICATION TEST FIRED: the kicked sign-in screen reads loggedOn=0 accountPresent=1 (Steam keeps the account id after a kick), the same reading as deliberate offline mode, so "loggedOn OR accountPresent" is wrong. Offline mode is told apart by loginusers.vdf `WantsOfflineMode=1` (Phase 54: Mac Steam persists Go Offline there). (2) NEW: the kick was CAUSED by GameLib's own launch: the helper's InitFlat registered "playing 3205720" while the PC was playing, bypassing Mac Steam's own "playing on another computer" prompt, and Steam's CM logged Mac Steam off. Plausibly also the Nov 20 06:03:50 trigger (kick during a bridged Avernum 6 run). (3) The WHOAMI read landed ~1 s after the kick; a WHOAMI that beats the kick would still pass (race, residual).

- timestamp: 2026-11-21 (round 3 fix + verification)
  checked: fix applied for the 19:16 falsification
  found: helper WHOAMI answers ok ONLY when BLoggedOn; not logged on + account 0 -> 0x03 NOT_SIGNED_IN (unchanged), not logged on + account kept -> new 0x04 WHOAMI_ERR_REASON_NOT_LOGGED_ON. Backend: probeHelperReadiness asks the caller's `steamOfflineByChoice` on 0x04 (full-AppID helpers): true -> ready, false -> steam-wait/steam-not-signed-in (same hold, notice, dialog); option absent -> ready (old rule). gameBridgeLaunch supplies it: `connectivity.offline || readSteamWantsOfflineMode(...) !== false` (no network or unreadable file -> launch). New Rust op `steamfiles_read_loginusers_offline_mode` in gamelib-steamfiles (MostRecent user, else sole user; WantsOfflineMode "1"; fail-soft null) wired through sidecarTransport/rustInvoke/steamFilesTypes, generated ipc_contract.rs, rust_dispatch/steamfiles_dispatch/main.rs; new TS steam/bridge/steamOfflineMode.ts. CLI against the real Mac file: {"wantsOfflineMode":false}.
  tests: cargo test gamelib-steamfiles (all, incl. 2 new reader tests, security prefix sweep over the new op), gamelib-steamfiles-cli, gamelib-shell 573 pass; clippy clean; cargo fmt applied to the steamfiles crates. Jest: steam + sidecar + backend/__tests__ + common + frontend/state + SteamEngineLaunchNotice 455 suites pass; the ONE failing suite, sidecar/__tests__/gameDetailsImportGate.test.ts (settingsFlowRegistration.ts sha256 + channel-count pin), fails at HEAD from commit 92ad8ec5b (84-05), file untouched here -- NOT ours. New tests: helperProcess round-3 describe (4) + 0x04 parity, helperIntegration offline-state WHOAMI now 0x04 + 2 through-ensureBridgeHelperReady (kicked holds / offline-by-choice ready) against the real compiled helper, games.test.ts steamOfflineByChoice matrix (4), steamOfflineMode.test.ts (5). Count pins bumped: tauriShellSource rust_dispatch arms 119->120, rustInvokeSchemas channels 119->120, steamfiles-cli ops 12->13, crate OPS 12->13. Mutation: steamOfflineByChoice forced true -> 2 round-3 tests fail; restored. tsc src + meta clean, check:ipc-contract up to date, prettier clean on changed TS, knip PASS, eslint 0 errors (1 pre-existing warning line 294). Helper rebuilt (pnpm build-steam-bridge) and sidecar rebuilt 19:35.
  residual: race -- a WHOAMI answered before Steam's kick lands still passes (19:16 kick landed in the same second as InitFlat, WHOAMI ~1 s later). Separate lead: the bridge's InitFlat registers "playing" past Mac Steam's own "playing on another computer" prompt, which is what kicked Mac Steam.

- timestamp: 2026-11-21 19:50-19:58 (operator live run, human-verify round 3)
  checked: gamelib.log, Steam connection_log / steamui_login, operator report
  found: 19:50 run (Mac signed in at 19:49, newer than the PC session): helper `loggedOn=1 accountPresent=1`, launched, Steam kicked the PC session instead -- correct, live session. 19:57 run (PC re-signed-in, so newer, and playing): 19:57:33 Mac Steam `RecvMsgClientLoggedOff('Logged In Elsewhere')`; 19:57:37 `not offline by choice (signed out), holding`; fresh helper every ~3 s reading `loggedOn=0 accountPresent=1`, game not launched; operator signed in to Mac Steam during the hold -> game launched WITH friends. Operator: (a) PASS, (b) PASS, (c) PASS.
  implication: confirmed fixed live for the Nov 20 state. Observed (2 runs, not proven): Steam kicks the OLDER signed-in session when the bridge registers "playing" while the other device is playing.

## Eliminated

- hypothesis: GameLib started Steam and left it at its login screen
  evidence: Steam process unbroken 2026-11-19 21:01 to 2026-11-20 18:39 (bootstrap_log); sign-in screen entered at 06:03:50 by a "Logged In Elsewhere" logoff, not by a startup.
  timestamp: 2026-11-21

- hypothesis: the launch waited out the 60 s Steam-wait budget and launched anyway
  evidence: gameBridgeLaunch returns false on budget exhaustion (no launch); game tracked at 17:02:48 while Steam logged on only at 17:04:12 (84 s later), and the picker opened with no friends, so the gate returned ready immediately.
  timestamp: 2026-11-21

## Resolution

root_cause: The bridge launch gate (ensureBridgeHelperReady) treated "helper InitFlat succeeded and CONTROL WHOAMI answered STATUS_OK" as "Mac Steam is signed in". InitFlat/ConnectToGlobalUser succeed against Steam's sign-in screen and WHOAMI answered STATUS_OK unconditionally (the backend read only the status byte), so a signed-out Steam passed the gate. After a "Logged In Elsewhere" kick Steam also keeps the account id, so even an account check reads it like offline mode. The game then read a dead session once at startup and had no friends until restarted. Trigger (Nov 20 and the 19:16 repro): the bridged launch itself, registering "playing" while another device was playing, got Mac Steam kicked.
fix: (1) bridge_helper.c WHOAMI: signed in = flat BLoggedOn OR SteamID account id (low 32 bits) non-zero; otherwise STATUS_ERR with the one-byte reason WHOAMI_ERR_REASON_NOT_SIGNED_IN (0x03); one flags-only `INIT user loggedOn= accountPresent=` log line per helper. (2) protocol.ts: WHOAMI_ERR_REASON_NOT_SIGNED_IN = 0x03 (C/TS parity test). (3) helperProcess.ts: probeHealthAndWhoami decodes the reason; probeHelperReadiness returns outcome 'steam-wait' / cause 'steam-not-signed-in' for a full-AppID helper, which feeds the existing bounded wait (toast, fresh helper per interval, 60 s budget, steamNotSignedIn dialog, no 480 fallback, no bottled-Steam offer). (4) Round 2, visibility: the hold's "Waiting for Steam" message moved from notify() (macOS system notification, never seen) to the in-app AppNoticeStack: new request kinds `bridge-wait-steam-not-running` / `bridge-wait-steam-not-signed-in` (persistent, no countdown) and `bridge-wait-end` (retraction, matched by appId), pushed by the new steam/bridgeWaitNotice.ts from gameBridgeLaunch.ts (end fires in a finally, fire-and-forget); the renderer reuses the existing gamelib steam.bridge.waiting.* strings (no locale change). notify() dropped. (5) Round 3: WHOAMI is ok only when BLoggedOn; not logged on + account kept answers WHOAMI_ERR_REASON_NOT_LOGGED_ON (0x04) and the backend decides from loginusers.vdf WantsOfflineMode via the new Rust op steamfiles_read_loginusers_offline_mode (offline by choice or no network -> launch; otherwise the same hold). Round 3 replaced (1)'s OR-account rule.
verification:
  target_test: { result: pass, tests: "helperProcess.test.ts 'bridged launch while Mac Steam is signed out' x4 + parity; helperIntegration.test.ts 'WHOAMI sign-in state' x6 (real compiled helper, fake libsteam_api)" }
  mutation_check: { result: skipped, reason_if_skipped: "Stryker is not configured in this repo; manual mutation instead (see revert_and_reconfirm)", mutant_killed: n/a }
  no_op_deletion: { result: pass, deletion_justified_by_rca: n/a, note: "additive: one new reason code, one new probe branch, one new check in WHOAMI; nothing removed" }
  adjacent_tests: { result: pass, suites_run: ["src/backend/storeManagers/steam/bridge (all)", "steam/__tests__/games.test.ts", "steam/__tests__/macArchKnownFixRouting.test.ts", "src/backend/__tests__/fakeHomeIsolation.test.ts", "meta gen_vtables + buildSteamBridgeShims"] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "helperProcess.ts reverted to HEAD -> 3 of 4 new unit tests fail; bridge_helper.c reverted to HEAD -> the signedout and signedout-nil integration tests plus the through-ensureBridgeHelperReady test fail; both reapplied -> all green" }
  live: { result: pass, note: "round 3, 2026-11-21 19:57: kicked Mac Steam held (not offline by choice), sign-in during the hold launched the game with friends; (a) and (b) passed in round 2. Residual: a WHOAMI answered before the kick lands still passes" }
  live_history: { result: superseded, note: "round 1 (operator): explicit sign-out -> hold + steamNotSignedIn dialog worked, wait invisible. Round 2 fix (in-app notice) awaits the operator's re-run; the Nov 20 'Logged In Elsewhere' WHOAMI branch is still not live-exercised" }
  oracle_type: derived
  guardrail_verdict: accepted
files_changed:
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/protocol.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
  # round 2 (in-app wait notice). public/locales/en/gamelib.json is NOT in this list: no locale key was added or edited; its dirty hunks belong to something else and must not be staged.
  - src/common/types/steam.ts
  - src/backend/storeManagers/steam/bridgeWaitNotice.ts (new)
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/frontend/state/SteamRequestNotice.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx
  - src/frontend/dev/noticePreview.ts (comment only)
  - src/backend/storeManagers/steam/__tests__/bridgeWaitNotice.test.ts (new)
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/components/UI/SteamEngineLaunchNotice/__tests__/SteamEngineLaunchNotice.test.tsx
  - src/frontend/state/__tests__/SteamRequestNotice.test.ts
  # round 3 (offline mode vs signed out)
  - src-tauri/crates/gamelib-steamfiles/src/lib.rs
  - src-tauri/crates/gamelib-steamfiles/src/readers.rs
  - src-tauri/crates/gamelib-steamfiles/tests/readers.rs
  - src-tauri/crates/gamelib-steamfiles/tests/security.rs
  - src-tauri/crates/gamelib-steamfiles-cli/tests/cli.rs
  - src-tauri/src/ipc_contract.rs (generated)
  - src-tauri/src/main.rs
  - src-tauri/src/rust_dispatch.rs
  - src-tauri/src/steamfiles_dispatch.rs
  - src/common/types/sidecarTransport.ts
  - src/common/types/ipc/rustInvoke.ts
  - src/backend/storeManagers/steam/localFiles/steamFilesTypes.ts
  - src/backend/storeManagers/steam/bridge/steamOfflineMode.ts (new)
  - src/backend/storeManagers/steam/bridge/__tests__/steamOfflineMode.test.ts (new)
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts
