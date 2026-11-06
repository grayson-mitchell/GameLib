---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 20
subsystem: steam-bridge
tags: [live-session, census, done-when, gap-closure]
requires: [53-17, 53-18, 53-19]
provides:
  - a scored 16-title re-run (items 36-53) on the 53-17..53-19 build
  - the verbatim post-session census line and an honest done-when judgement
affects: [53-UAT.md, .planning/todos/pending]
key-files:
  created:
    - .planning/todos/pending/2026-10-25-planet-crafter-joinfriend-exception-menu-disappears.md
  modified:
    - .planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-UAT.md
    - .planning/todos/pending/2026-10-25-overlooting-godot-null-call-before-shim.md
    - .planning/todos/pending/2026-10-24-x64-shim-lacks-interface-versions-ue5-titles-request.md
    - .planning/todos/pending/2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md
    - .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md
    - .planning/todos/pending/2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md
decisions:
  - "Done-when NOT met: 9 of 18 (majority: no); the criterion is unchanged and nothing was rerouted to bottled Steam"
metrics:
  completed: 2026-10-25
  tasks: 3
---

# Phase 53 Plan 20: Live re-run of the done-when Summary

The phase done-when is not met: `9 of 18 Steamworks-using rows verified (majority: no)`. The bar is 10, and Overlooting reached HELLO plus one identity call but the rule needs two distinct game-originated calls.

## Commits
- 8ec93895b docs(53-20): desk gate and re-run contract
- 4368235d9 docs(53-20): record launch state for live session
- 6dea9f10a docs(53-20): score re-run; census 9 of 18 (majority: no)

## Census line (verbatim, run after the session)

`9 of 18 Steamworks-using rows verified (majority: no)`

Verified: 1167950, 1284190, 1363080, 1603180, 1691190, 1782460, 230070, 427410, 648410. These are the same nine as 53-16; no regression and no gain.

## Per-title verdicts (operator word, then log-scored result)
- 3410180 Overlooting: reached menu; unverified (HELLO, 1 call SteamUser023.GetSteamID; needs 2). NvAPI crash fixed.
- 1691190, 1167950, 1782460, 1363080, 648410, 230070: reached menu; verified.
- 1284190 Planet Crafter: menu disappeared 3x; census verified, scored issue on the experience.
- 1603180 Mining Mechs: reached menu with error messages; census verified, scored issue (dialog text uncaptured).
- 427410 Abiotic Factor: hung at load screen; census verified (the hang is the open todo).
- 1119730 Ranch Simulator: failed to launch; no HELLO (SteamStub).
- 648800 Raft, 219990 Grim Dawn: DRM message; HELLO but no call (SteamStub).
- 206060 Avernum 6: reached menu; unverifiable by construction (imports only SteamAPI_Init/Shutdown).
- 411300 ELEX: hung at load screen; known-bad, HELLO plus 1 call.
- 284100 Unclaimed World: startup error; no HELLO.

## Findings
- **Overlooting (3410180):** the 53-19 override applied (`user.reg "nvapi64"=""`), no page fault, godot.log passes the driver lines to `Steam is running!` / `Usernam: `. One traced call only. Next-lever input: CALL list = [SteamUser023.GetSteamID], no NOVER, no evidence whether the scan-miss versions were requested, empty `Usernam:` with no GetPersonaName trace.
- **Planet Crafter (1284190):** four launches; the game's own `SteamRichPresence.JoinFriend` throws in the two retained logs (FormatException; ArgumentOutOfRangeException in `ParseConnectionString`). The shim's `GetFriendRichPresence` and `GetLaunchQueryParam` are stubs returning "". Hypothesis only. New todo created.
- **Ranch Simulator (1119730):** process gone after 3s, no HELLO, SteamStub class; exact wrapper message not in the logs.
- **Mining Mechs (1603180):** the same symptom as the open dialog todo; no log shows the dialog text. Evidence appended.
- **Unclaimed World (284100):** x86 exe, both shims placed, 51s alive, no HELLO. The WMP marker is present in the bottle, so the earlier dialog explanation does not apply; cause unidentified, needs the dialog text. Census Arch column prints x64 for a PE32 exe.

## Deviations from Plan

None in execution. Item 52 was scored `pass` as an informational listing. UAT top-of-file Summary counts were raised by the 18 new items (total 49, pass 23, issue 26) on top of the previous figures. `.planning/REQUIREMENTS.md` does not exist, so no requirement marking was done.

## Todos
- Overlooting: evidence appended, stays pending (row unverified).
- UE5 interface versions: evidence appended, stays pending (1119730 did not pass).
- x86 parity: Avernum 6 import block appended; `ready:` unchanged.
- Runtime components: 284100 evidence appended. Mining Mechs: reproduction appended.
- Created `2026-10-25-planet-crafter-joinfriend-exception-menu-disappears.md` (severity medium, platform macos, ready live-gate). `pnpm planning-gates`: 12/12 pass.

## Self-Check: PASSED
