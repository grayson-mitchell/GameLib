---
status: root-cause-found
trigger: "GameLib's steam-user logon signs the Mac Steam Friends list out (status stuck 'Offline') until Mac Steam is restarted — todo .planning/todos/pending/2026-10-24-friends-sign-out-steam-user-logon.md (src/backend/storeManagers/steam/user.ts client.logOn({ refreshToken }))"
created: 2026-10-25
updated: 2026-10-25
---

## Current Focus

hypothesis: the logon message steam-user sends (chat_mode=2 hardcoded; logonID 0; SteamClient-audience token; never setPersona) makes the CM treat GameLib as a competing Friends/chat endpoint. Not established offline.
test: operator A/B on Mac Steam with GAMELIB_STEAM_LOGON_VARIANT = default | nochat | logonid | both
expecting: a variant under which Friends stays signed in and status stays changeable identifies the mechanism; make it default
next_action: plan the fix as a phase (see todo 2026-10-24-friends-sign-out-steam-user-logon.md)
reasoning_checkpoint:
tdd_checkpoint:

## Symptoms

Prefilled from the todo `.planning/todos/pending/2026-10-24-friends-sign-out-steam-user-logon.md`
and `.planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-19-DIAGNOSIS.md`
(`## Gap 6: arms`, `## Gap 6: attribution`). Not re-asked of the user: these were captured in a
controlled four-arm gate on 2026-10-24.

- expected: GameLib's background steam-user session (library fetch via `getOwnedApps()`) coexists
  with the user's running Mac Steam client; Mac Steam's Friends list stays signed in and its
  persona status stays user-controllable.
- actual: within ~30 s of `SteamUser.loggedOn` (`user.ts` `client.logOn({ refreshToken })`, keyring
  refresh token, cold-connect ~3.1 s), Mac Steam's Friends list is signed out, or signed in but
  locked to 'Offline' and unchangeable. Persists while GameLib runs; restarting Mac Steam restores
  Friends even with GameLib still running (F3), and does not re-flip afterwards (a later bridge Play
  held ONLINE).
- errors: none. No "logged in elsewhere" notice. Mac Steam `connection_log.txt` shows no
  displacement / remote logoff — Mac Steam's own CM session stays Logged On throughout. The signed-out
  state is a Friends-UI / persona state, not an account logoff.
- timeline: reproduced 4 times (F1, F2, F3 on Age of Decadence 230070; once on ELEX 411300 in 52-24
  re-gate 2). The same logon existed since Phase 51, so not a phase-52 regression. Idle control (no
  GameLib) and the bridge helper alone (SteamAPI_Init against Mac Steam) did not flip.
- reproduction: Mac Steam running with Friends signed in → launch GameLib (no Play needed) → wait
  for `SteamUser.loggedOn` in the GameLib log → Friends flips within ~30 s.

Open questions from the todo: can the steam-user session avoid claiming the persona/Friends session
(e.g. logon options, refresh-token platform type/audience, logging on only when the library fetch
needs it and logging off after), and why does Mac Steam not recover without a restart?

Constraints: Steam stack is frozen (`.planning/research/STEAM-STACK.md`, steam-session + steam-user).
Live repro requires the operator (Mac Steam + real account) — use a checkpoint for any human-verify
step; do not attempt to log on to the real account autonomously.

## Eliminated

- hypothesis: chat_mode 2 in CMsgClientLogon (nochat variant)
  evidence: live A/B, nochat x2 still signed Friends out
  timestamp: 2026-10-25

- hypothesis: logonID 0 (logonid variant)
  evidence: live A/B, logonid still signed Friends out (and removed the LogonSessionReplaced error)
  timestamp: 2026-10-25

- hypothesis: autoRelogin/relog or a displaced session (logonID collision)
  evidence: Mac Steam connection_log shows no displacement; logonID default 0 differs from Mac Steam's IP-derived id
  timestamp: 2026-10-25

- hypothesis: session persona never set (online variant, setPersona(1) after loggedOn)
  evidence: live A/B 22:33, setPersona(1) logged, Friends still signed out
  timestamp: 2026-10-25

- hypothesis: persona Invisible (invisible variant, setPersona(7) after loggedOn)
  evidence: live A/B 22:34, setPersona(7) logged, Friends still signed out
  timestamp: 2026-10-25

- hypothesis: something else GameLib does at launch (not the logon) flips Friends
  evidence: nologon variant (logon skipped, everything else unchanged) -> Friends stayed signed in; control run in the same sitting -> signed out
  timestamp: 2026-10-25

- hypothesis: steam://open/friends recovers Friends after the flip (Playnite's Friends button)
  evidence: opens the window but status stays Offline and unchangeable
  timestamp: 2026-10-25

## Evidence

- checked: steam-user 5.3.0 components/09-logon.js logOn(); friends.js
  found: CMsgClientLogon hardcodes chat_mode: 2 ("enable new chat"), no option exposes it; logonID/machineName/clientOS are public options; README: setPersona must be called after logon "or else you'll show up as offline" (GameLib never calls it); user.ts logOn passes only { refreshToken }; token minted with EAuthTokenPlatformType.SteamClient (aud web+client, same as Mac Steam)
  implication: candidate mechanisms are chat_mode, logonID, token platform; flip happens at logon (not ongoing; Mac Steam restart recovers with GameLib still running), so logOff-after-fetch would not help, only not-logging-on would

- checked: operator live A/B 2026-10-25, ~/Library/Logs/GameLib/gamelib.log(.old)
  found: nochat 22:20 and 22:23 (patched: true) -> Friends signed out; control (no variant) 22:25 -> signed out; logonid 22:28 (patched: false) -> signed out. Every run flips as GameLib finishes loading, ~2-3 s after SteamUser.loggedOn. nochat and control runs logged `Steam client error, username unavailable: Error: LogonSessionReplaced` at logon; the logonid run did not (logonID 0 collided with GameLib's own previous dev-run session, not with Mac Steam)
  implication: chat_mode and logonID are not the mechanism; LogonSessionReplaced is a separate GameLib-vs-GameLib collision. Remaining candidates: persona state of a second SteamClient session (setPersona never called), something after logon (getPersonas, library fetch), or any CM session for the account

- checked: operator observation 2026-10-25
  found: the flip signs Friends out while Mac Steam itself stays online; the operator can sign back in to Friends by hand without restarting Steam
  implication: recovery is a Friends re-sign-in, not a Steam restart

- checked: Playnite (JosefNemec/PlayniteExtensions SteamLibrary)
  found: Friends button is steam://open/friends; owned games via Web API IPlayerService/GetOwnedGames with an access token (Services/PlayerService.cs:19); its only CM logon is LogOnAnonymous (SteamShared/SteamApiClient.cs:121)
  implication: an authenticated CM session is avoidable for the library list

## Resolution

root_cause: any authenticated steam-user CM logon for the account (SteamClient refresh token) signs Mac Steam's Friends out. Not tunable from the logon message: chat_mode 0, a distinct logonID, setPersona Online and setPersona Invisible each still flip; skipping the logon alone stops it. GameLib logs on at every launch (library refresh), so Friends drops on every launch.
fix: none in this session. The env-gated A/B variants (logonVariant.ts and its user.ts wiring) were diagnostic only and were removed. Fix handed to a phase: Web API library list, anonymous CM for public PICS reads, authenticated CM only for depot installs (see the todo's "Fix shape").
verification: live A/B 2026-10-25 (operator): nochat x2, logonid, online, invisible, control -> flip; nologon -> no flip
files_changed: []
