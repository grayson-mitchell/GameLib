---
status: investigating
trigger: "The \"Playing on another device\" dialog has no \"Play here\" option, so taking over from the PC means walking over to it"
created: 2026-11-28
updated: 2026-11-28
source_todo: .planning/todos/pending/2026-11-22-play-here-on-the-other-device-prompt.md
predecessor: .planning/debug/resolved/bridged-launch-kicks-other-session.md
---

## Symptoms

- expected: With another device (the PC) of the same Steam account playing, pressing Play on a bridged game shows
  "Playing on another device" with a primary "Play here" next to Cancel. "Play here" stops the other device's game
  (Steam's own IClientUser::BKickOtherPlayingSession, as Mac Steam's prompt does), waits until
  `--steam-playing-session` reads clear (bounded), then launches on the Mac. Both devices stay signed in: no
  "Logged In Elsewhere" in connection_log on either, and the Mac game launches with Friends.
- actual: The dialog offers Cancel only. The user must walk to the other device and quit its game, or set
  `GAMELIB_STEAM_OTHER_SESSION_CHECK=off`, which brings back the unmediated kick.
- errors: none (by design).
- timeline: By design since fb7f9b243 (debug session bridged-launch-kicks-other-session, resolved 2026-11-22). The
  operator shipped tell-and-cancel (Option B) and filed this as Option A.
- reproduction: Play any game on the PC on the same Steam account, then press Play on a bridged game in GameLib on
  the Mac (`pnpm tauri:dev`).

## Constraints (from the todo and predecessor session)

- New helper subcommand calls BKickOtherPlayingSession the same way `--steam-playing-session` calls
  BIsOtherSessionPlaying (native/steam-bridge/helper/gamelib_playingsession.h): RTTI-checked IClientUser,
  function-ID-matched slot, never a hard-coded slot.
- Keep the cwd/env hardening (chdir "/", unset SteamAppId/SteamGameId/SteamOverlayGameId). An attach Steam tracks as
  a game is itself a kick. NEVER run the helper from the repo root (gitignored steam_appid.txt = 480 caused the
  05:53:47 kick in the predecessor session).
- BKickOtherPlayingSession's signature and side effects are inferred from client strings, not measured. Measure on a
  throwaway run first, with the operator at the PC (checkpoint).
- Rust/sidecar conventions: any spawn goes through the existing helper runner (bounded timeout); fake-HOME rule for
  new spawn tests (Skill gamelib-conventions). Live tests: `pnpm tauri:dev`, never `tauri:dev:run`; restart dev
  after sidecar changes.
- Files: native/steam-bridge/helper/gamelib_playingsession.h, native/steam-bridge/helper/bridge_helper.c,
  src/backend/storeManagers/steam/bridge/otherSessionPlaying.ts, src/backend/storeManagers/steam/bridge/helperProcess.ts,
  src/backend/storeManagers/steam/gameBridgeLaunch.ts,
  src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx, gamelib.json locale.

## Current Focus

hypothesis: Calling IClientUser::BKickOtherPlayingSession from a read-only, non-game-tracked helper process stops the
  other device's game without logging either session off, after which BIsOtherSessionPlaying reads 0 and a bridged
  launch proceeds without a kick.
test: operator-attended live measurement with the PC playing a throwaway game on the same account:
  `GL_KICK_OK=1 sh <scratchpad>/pk/measure-kick.sh` (baseline read, dry run, `--steam-kick-other-session --wait 20`,
  three reads after, Steam log deltas). Helper commit 28988b249 (`--steam-kick-other-session`); binary under test is
  `<scratchpad>/pk/helper-new`, built from that source.
expecting: kicked 1; returned 1; stillPlaying 0 (cleared 1) within a few seconds; the PC's game closes and the PC stays
  signed in; connection_log shows no `Logged In Elsewhere` / `RecvMsgClientLoggedOff` on the Mac; no new gameprocess_log
  tracking line for the helper. Any of: PC signed out, Mac signed out, stillPlaying never reaching 0, returned 0 with the
  game still running = hypothesis refuted, Option A needs another route.
next_action: CHECKPOINT REACHED (human-action): the operator puts a throwaway game on the PC (same account), saves, and
  replies "ready"; the continuation then runs measure-kick.sh with GL_KICK_OK=1 from "/", reads the output and the log
  deltas, asks the operator what the PC and Mac Steam show, and records Evidence. Only after the hypothesis is confirmed:
  Rust/TS IPC, backend `playHere`, dialog button, tests, live gate.
bug_class: Bohrbug (feature gap, deterministic; no SBFL: no failing test)

## Evidence

- timestamp: 2026-11-28 (session 1)
  checked: slot scan of the current Mac Steam build (steamclient.dylib dated Nov 13 15:05, 260 IClientUser slots) with the 084 probe `scan` mode, copied to the scratchpad, run from cwd "/" with SteamAppId/SteamGameId/SteamOverlayGameId unset (attach only, no method called)
  found: BLoggedOn slot 4 fid 0x65850106; BIsOtherSessionPlaying slot 221 fid 0x77870812; BKickOtherPlayingSession slot 222 fid 0x6a30922a. Each high half (0x6585 / 0x7787 / 0x6a30) matches exactly one slot in the scan.
  implication: the kick method resolves uniquely by function-ID high half 0x6a30, the same way the read does. The predecessor's slot map (084 slotmap.txt) put the pair at 220/221 on the older 259-slot build; the slot index moved by one, which is why the helper must never hard-code it.

- timestamp: 2026-11-28 (session 1)
  checked: otool -arch arm64 -tV disassembly of the BKickOtherPlayingSession proxy at 0x8e62c8 against the BIsOtherSessionPlaying proxy at 0x8e6134 (both in steamclient.dylib, same build)
  found: the 0x6a30 proxy serialises ONLY the user handle (`ldr w8,[x19,#8]`) and the two IPC ids (0x6a30922a, interface id 0x6ae5f48a); no further argument is written. It then reads the response, checks the return tag byte == 0xb, reads ONE byte into [sp+7] and returns it (`and w0,w19,#1`). Contrast the 0x7787 proxy, which also serialises `x1` as a 4-byte out pointer. Signature: `bool BKickOtherPlayingSession(void)` (this = IClientUser*, no other args, bool result).
  implication: the helper calls it as `(((int (*)(void *))uvt[slot])(cu) & 0xff) != 0` with no out pointer. A wrong guess here (extra argument) would be harmless to the proxy but the no-argument shape is what the proxy actually serialises, so no argument is passed. What the bool means (kick sent vs kick accepted), what the CM does on receipt (stop only the other game vs log the other session off), and whether it blocks until the other session has stopped are NOT readable from the proxy: they are the live measurement.

- timestamp: 2026-11-28 (session 1, implementation of the measurable half)
  checked: wrote `--steam-kick-other-session [--dry-run] [--wait 0..30]` in native/steam-bridge/helper/gamelib_playingsession.h (+ dispatch in bridge_helper.c), committed as 28988b249. Compiled to the scratchpad with the repo's flags (`clang -O2 -Wall -Werror=uninitialized -arch arm64`, no warnings from the new header). Ran against the live Mac Steam from cwd "/", with the kick NEVER invoked (only `--dry-run` and argument-rejection arms while the PC was not playing): `--steam-playing-session` -> `{"result":"ok","loggedOn":1,"otherSessionPlaying":0,"otherAppId":0}`; `--steam-kick-other-session --dry-run` (and with `--wait 5`) -> `{"result":"ok","loggedOn":1,"otherSessionPlaying":0,"kicked":0,"reason":"nobody-playing"}`; `--wait` / `--wait 31` / `--wait x` / `--wait 123` / `--bogus` -> usage lines, exit 64.
  found: all three slots resolved uniquely (a miss would have answered `method-unverified:*` before any read), the kick slot passed the BIsOtherSessionPlaying + 1 adjacency guard, and the helper added no new gameprocess_log tracking line (last line still the 17:39:31 AppID 1297900 exit, i.e. the cwd/env hardening holds for the new subcommand).
  implication: the resolution half is proven on the current build; the call itself, and everything it does to the CM, is not measured. The guard (kick only when BLoggedOn 1 AND BIsOtherSessionPlaying 1) means the kick cannot fire on an idle account, so the measurement needs the PC playing. `pnpm jest steamPlayingSessionHelper.test.ts`: 16/16 (13 new: steamclient-missing x5 incl. --dry-run/--wait, unknown-argument x3, bad-wait x5, under a fake HOME).

- timestamp: 2026-11-28 (session 1)
  checked: scratchpad/pk/measure-kick.sh abort path, run without GL_KICK_OK
  found: baseline read 0 -> the script printed `ABORT: baseline does not say another session is playing; nothing was kicked` and exited 3; a baseline of 1 without GL_KICK_OK=1 aborts with exit 4.
  implication: running the script can only kick when the operator has confirmed (GL_KICK_OK=1) AND the helper itself reads the PC playing.

## Eliminated

## Resolution
