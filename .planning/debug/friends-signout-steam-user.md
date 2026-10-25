---
status: root-cause-found
trigger: "GameLib's steam-user logon signs the Mac Steam Friends list out (status stuck 'Offline') until Mac Steam is restarted — todo .planning/todos/pending/2026-10-24-friends-sign-out-steam-user-logon.md (src/backend/storeManagers/steam/user.ts client.logOn({ refreshToken }))"
created: 2026-10-25
updated: 2026-10-26
---

## Current Focus

hypothesis: the damage happens at the moment an authenticated GameLib logon lands while Mac Steam's Friends is connected; nothing afterwards except a Mac Steam restart undoes it. Mac Steam being offline at the moment of GameLib's logon avoids it ("go-offline trick"); Mac Steam may come back online while GameLib's session stays open (n=2, see Evidence).
test: can GameLib drive Mac Steam offline/online itself; does a GameLib re-logon (reconnect) while Mac Steam is online flip again
expecting: re-logon while online flips (same mechanism)
next_action: re-scope Phase 54 (deterministic no-logon launch, anonymous PICS, platform-routed installs, guided offline step around authenticated work; Web API library list dropped) — see "## Follow-up 2026-10-26"
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

- hypothesis: steam://friends/status/online recovers Friends after the flip
  evidence: operator 2026-10-26 ~08:35, after the 08:32:48 logon flipped Friends: Friends signs back in but status stays Offline and unchangeable
  timestamp: 2026-10-26

- hypothesis: a Mac Steam reconnect (Go Offline -> Go Online, no restart) recovers Friends while GameLib is still connected
  evidence: GameLib logon 12:24:27 (Refresh) flipped Friends (control); Mac Steam connection_log LogOff 12:24:58, logon complete 12:25:03, same steam_osx process (started 12:03:14) -> still stuck
  timestamp: 2026-10-26

- hypothesis: a Mac Steam reconnect recovers Friends once GameLib's session has ended
  evidence: GameLib quit 12:27:20 (sidecar "quit"); Mac Steam LogOff 12:27:31, logon complete 12:27:36, same process -> still stuck
  timestamp: 2026-10-26

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

- checked: ~/Library/Logs/GameLib/gamelib.log, runs 2026-10-26 08:30, 08:32:44, 12:04:52, 12:24:07
  found: the launch logon is a race. library.ts refresh() is gated by authTrigger.ts; the boot sign-in probe (user.ts probeCredentialPresence) notes the sticky 'boot-probe' trigger (Phase 49 D-14). When the probe lands before the frontend's `[refreshLibrary] runner=all origin=mount`, the mount refresh logs on (08:32:48 SteamUser.loggedOn -> flip). When the mount refresh lands first it logs "library refresh deferred ... (trigger=startup)" and no logon happens (12:04:52, and the 08:30 run the operator saw as "did not log out")
  implication: launch behaviour is nondeterministic today; making the deferral deterministic (probe must not unlock the boot/mount refresh) removes the launch logon without the Web API

- checked: steam-session 1.9.4 JSDoc, node-steam-session issue #56 (Phase 54 research, 54-RESEARCH.md)
  found: since 2025-04-30 refreshAccessToken()/getWebCookies() fail AccessDenied for SteamClient-platform refresh tokens unless sent over an authenticated CM session
  implication: the Web API GetOwnedGames path cannot be fed from GameLib's stored token without the logon it is meant to replace. Playnite avoids this by using a store-page webapi_token from a web-view login (SteamStoreService.cs), and installs via steam://install (no depot download, no CM logon)

- checked: operator go-offline trick 2026-10-26 (Mac Steam connection_log + gamelib.log)
  found: Mac Steam Go Offline 12:20:34 (LogOff, "not auto reconnecting due to user initiated logoff") -> GameLib Refresh logon 12:21:15 (385 owned games) -> GameLib quit -> Mac Steam Go Online 12:22:07 -> Friends signed in, status changeable. Go Offline/Online does NOT restart Steam (steam_osx start time unchanged 12:03:14), it is a CM logoff/logon on the same process. LogonSessionReplaced at 12:21:15 was a GameLib-vs-GameLib collision (two sidecars running: a stale tauri-dev one, PID 5341, and the live one)
  implication: n=1. The only clean sequence found is Mac Steam offline for the whole of GameLib's authenticated session. Unknown: whether GameLib can drive Mac Steam offline/online itself (no known steam:// URL)

- checked: operator go-offline trick repeat 2026-10-26, GameLib NOT quit before Go Online
  found: Mac Steam restarted 12:30:29 (online 12:30:32) -> Go Offline 12:31:32 -> GameLib launch logon 12:31:45 (probe won the launch race; 385 games) -> Refresh 12:31:55 reused the session ("already connected (fast path, canary OK)", no new logon) -> Mac Steam Go Online 12:32:07 with gamelib-shell (PID 57003) still running and connected -> Friends signed in, status changeable
  implication: n=2 clean. Quitting GameLib is not part of the trick: what matters is Mac Steam being offline at the moment of GameLib's logon. Mac Steam then rejoins alongside the live GameLib session without damage. For installs, Mac Steam need only be offline for the seconds around the logon, not the whole download. Risk: any later GameLib re-logon (reconnect after a drop, a new client) while Mac Steam is online presumably flips again

- checked: operator observation 2026-10-26
  found: the post-logon symptom varies: sometimes Friends & Chat is signed out with status not stuck (a manual sign-in fixes it), sometimes signed in but stuck Offline (only a restart fixes it). No pattern found yet
  implication: any recovery UX must cover both states; the stuck-Offline state has no programmatic recovery found

## Follow-up 2026-10-26

Recovery after the flip is ruled out short of a Mac Steam restart (steam://open/friends,
steam://friends/status/online, reconnect with GameLib connected, reconnect after GameLib quit).
Prevention is the only route:

1. Launch, browsing, game page, Play: no authenticated logon. Make the startup/mount refresh
   deferral deterministic; move public PICS reads to an anonymous CM session (probed working in
   54-RESEARCH.md; whether anonymous leaves Friends alone is still untested).
2. Explicit Refresh and native depot installs still need an authenticated session (depot keys,
   manifest request codes, CDN auth; no non-refresh-token credential avoids a CM logon). Keep
   them clean with the go-offline trick: Mac Steam offline only around the moment of GameLib's
   logon, then back online while GameLib's session stays open (n=2). Guided or automated; the
   session must not silently re-logon while Mac Steam is online.
3. Route installs by platform: titles Mac Steam can install itself go to steam://install (no
   GameLib logon); native download only for Windows-only titles. `enableSteamNativeInstall`
   (nativeInstallSetting.ts) is the existing switch.
4. Web API library list (IPlayerService/GetOwnedGames) dropped from the phase: blocked for
   SteamClient tokens (see Evidence).

Open: can GameLib toggle Mac Steam offline/online; does a GameLib re-logon while Mac Steam is
online flip again; does an
anonymous CM session leave Friends alone; Steam console `download_depot` as a logon-free
replacement for native Windows-only installs (spike).

## Resolution

root_cause: any authenticated steam-user CM logon for the account (SteamClient refresh token) signs Mac Steam's Friends out. Not tunable from the logon message: chat_mode 0, a distinct logonID, setPersona Online and setPersona Invisible each still flip; skipping the logon alone stops it. GameLib logs on at every launch (library refresh), so Friends drops on every launch.
fix: none in this session. The env-gated A/B variants (logonVariant.ts and its user.ts wiring) were diagnostic only and were removed. Fix handed to a phase: Web API library list, anonymous CM for public PICS reads, authenticated CM only for depot installs (see the todo's "Fix shape"). Superseded 2026-10-26: the Web API half is blocked for SteamClient tokens and dropped; see "## Follow-up 2026-10-26" for the re-scoped fix shape.
verification: live A/B 2026-10-25 (operator): nochat x2, logonid, online, invisible, control -> flip; nologon -> no flip
files_changed: []
