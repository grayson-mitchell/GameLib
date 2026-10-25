---
status: root_cause_found
trigger: "Abiotic Factor (427410) still hangs at loading after GetAuthSessionTicket is forwarded and succeeds"
created: 2026-10-26
updated: 2026-10-26
source_todo: .planning/todos/pending/2026-10-25-abiotic-factor-loading-hang-after-auth-ticket.md
---

## Symptoms

<!-- DATA_START -->
- expected: Abiotic Factor (427410), launched through the macOS native Steam bridge (bottle shim -> bridge), gets past the loading screen into the main menu.
- actual: Game hangs at loading. Operator, verbatim: "still hangs at loading".
- errors:
  - Before the 53-14 fix: Saved log (AbioticFactor.log) had `Failed to acquire Steam auth session ticket for 0` twice. After the fix: zero such lines, and three `LogOnlineIdentity: STEAM: Obtained steam authticket` (23.12.03, 23.12.45, 23.16.04).
  - gamelib.log: HELLO, then CALL BIsSubscribed, GetAppID, GetSteamID, GetPersonaName, BLoggedOn, GetAuthSessionTicket (12:12:03). No further CALL lines for the remaining ~4 minutes.
  - Around the ticket: `LogEOSEcom: Purchase flow is disabled due to overlay setup failure (EOS_NotConfigured)` and repeated `LogEOSRTC: TickTracker Tick is delayed` (10 s periods).
  - Bottle shim is the 497664-byte built shim.
- timeline: Never worked. 53-UAT item 9 hypothesised the failed ticket caused the hang; 53-14 fixed the ticket and the hang survived, so that hypothesis is REFUTED.
- reproduction: Launch Abiotic Factor (427410) from GameLib on macOS via the native Steam bridge; watch the loading screen and gamelib.log / AbioticFactor.log.
- constraints: Do not reroute to bottled Steam on this evidence; no DRM is involved (see memory: bottled Steam is a narrow fallback). Bridge "verified" is strict: HELLO + clean game Steam-init log.
- relevant_files:
  - meta/sdk/wire-policy.json
  - native/steam-bridge/generated/bridge_dispatch.h
  - src/backend/storeManagers/steam/bridge
<!-- DATA_END -->

## Current Focus

- hypothesis: (none yet) candidates in priority order:
  1. GetAuthSessionTicketResponse_t (k_iSteamUserCallbacks+63 = 163) is never delivered to the game by the bridge callback relay; UE's OnlineSubsystemSteam may wait on it.
  2. EOS login waits on a Steam-derived ticket verified by a backend (EOS Connect with a Steam session ticket).
  3. Non-Steam fault (shader compile, Wine graphics) at the loading screen; capture a wine +err trace.
- test: Read the callback relay code path for user callbacks and check whether the shim/bridge posts callback 163 after GetAuthSessionTicket.
- expecting: Either the relay has no path for 163 (confirms 1) or it does (move to 2/3).
- next_action: fix deferred to a planned phase (operator choice). Lock committed as hardening; diagnostic trace saved as abiotic-factor-loading-hang.trace.patch. The bottle still has the diagnostic Engine.ini (verbose online logging) for phase verification.
- fix_applied (unverified): meta/gen_vtables.ts. bridge_transact is serialized with a static SRWLOCK (SRWLOCK_INIT; TryAcquire first to record contention). The body moved to bridge_transact_locked. SteamAPI_Shutdown takes the same lock. Capped (512-line) per-process trace gamelib_bridge_trace.log beside the DLL: t, tid, ord, slot, contended, ok. Regenerated (pnpm gen-vtables) and rebuilt (pnpm build-steam-bridge: x86, x64, steamclient64 compile gates PASSED; steam_api64.dll 500224 bytes). jest: gen_vtables + steam/bridge 21 suites / 895 tests pass. placeShimForGame redeploys on byte mismatch, and no sidecar code changed, so no dev restart is needed.

## Evidence

- checked: native/steam-bridge/generated/steam_api_shim.c ~L22404
  found: SteamAPI_RunCallbacks, RegisterCallback, UnregisterCallback, RegisterCallResult are empty stubs. No game-side Steam callback (incl. 163) can ever be delivered; the helper pumps callbacks only for its own process (bridge_helper.c pump_callbacks).
  implication: candidate 1 is structurally true but UNPROVEN as the cause.
- checked: AbioticFactor.log (Oct 25 21.03 UTC run, the 345 s session)
  found: LoadMap /Game/Maps/MainMenu completes 21.03.05; "Engine is initialized" 21.03.17; LoadingScreen hidden after 12 s; GetWorldEntries count 0. Engine frames keep advancing (frame 974 at 21.03.37, ~50 fps ticks). Steam calls: GetPersonaName 21.03.05, then BLoggedOn+GetAuthSessionTicket 21.03.20 (15 s gap; main thread stalled ~10-14 s 21.03.07-21.03.17, EOSRTC tick delayed 14.45 s with 1 tick). Ticket re-requested 12 s later (21.03.32).
  implication: the engine's own loading screen DOES drop; the game reaches MainMenu. "Hangs at loading" is therefore likely a menu-level wait (online/world-list/EOS) or a visual issue, not an engine boot hang. UE GetAuthToken is synchronous, so the ticket line is informational; the 12 s re-request suggests a retry loop upstream (EOS Connect login with Steam ticket, candidate 2).
- checked: web search of the log line
  found: no source showing UE waits on callback 163 for this line.
  implication: candidate 1 weakened; needs operator observation to discriminate.

- checked: operator relaunch 10:13:48 NZDT 2026-10-26 (live, game still running at 10:17)
  found: game now stops at the seizure-warning screen, earlier than every prior run. AbioticFactor.log ends at 21.13.54 UTC on frame 0 (Browse /Game/Maps/MainMenu, ShaderPipelineCache done), no further lines. gamelib.log: HELLO, GINIT, BIsSubscribed, GetAppID, GetSteamID (10:13:53), then nothing. In the 10:03 run GetPersonaName followed GetSteamID immediately. Game process idle (~1.6% CPU, all threads sleeping).
  implication: the game is blocked, not rendering slowly.
- checked: helper state during the hang (sample + lsof, pid 14415)
  found: helper main thread is in accept(), so it is idle and serving nobody. The game's socket to the helper (127.0.0.1:54988->54985) is CLOSED. The helper's 5 s SO_RCVTIMEO (bridge_helper.c:172, :816) also covers the idle wait for the next frame header (:647), so it closes any connection idle for 5 s; the shim reconnects once on transport failure (steam_api_shim.c bridge_transact).
  implication: the game is not mid-call in the helper.
- checked: shim thread safety (generated/steam_api_shim.c)
  found: no lock anywhere. g_bridge_sock, g_next_request_id and the send/recv pair in bridge_transact_once are unguarded globals, and recv uses MSG_WAITALL with no timeout. The helper is single-client (one connection at a time, accept backlog for others).
  implication: NEW HYPOTHESIS. UE calls Steam from more than one thread (game thread + online async task thread). Two concurrent bridge_transact calls can interleave frames on one socket, or race bridge_ensure_connected into two sockets, the second of which sits in the backlog until the first idles out (5 s steps would explain the 10-15 s stalls in the 10:03 run). A thread whose response was consumed by another thread blocks in recv forever. Not yet proven: needs a game-side thread backtrace (winedbg) or a shim build with a lock + per-call trace.
- checked: what changed between runs
  found: no code or bottle change from this debug session (it made zero edits besides this file). The bottle steam_api64.dll is 522752 bytes (mtime 10:00), the public/bin build from Oct 25 21:25 (t7i/kax/kon/53-17 era), not the 497664-byte shim named in the todo. The 10:03 and 10:13 runs used the same shim (placeShimForGame: already current).
  implication: the earlier-stop is run-to-run variation, consistent with a thread race.

- checked: relaunch 10:22 on the locked shim + gamelib_bridge_trace.log (121 lines)
  found: every call is on ONE thread (tid=228), contended=0 throughout, ok=1 throughout, and each call returns in 0-2 ms. GetSteamID is called ~111 times. The 12 s stall (t=335949391 -> 335961522) falls BETWEEN calls, not inside one. Last call at about +17 s (GetAuthSessionTicket, GetSteamID, BLoggedOn), then silence. The game got past the seizure screen to the usual "Loading" point. AbioticFactor.log: MainMenu loaded, loading screen hidden after 12.02 s, frames advance (483 at 21.22.46), GetWorldEntries 0, "Obtained steam authticket", then only EOSRTC tick-delay warnings.
  implication: the shim thread race is REFUTED for this title (the lock stays as hardening). The seizure-screen stop was run-to-run variation. "Loading" is a menu-level online wait with the engine running, which points to candidate 2 (EOS Connect login with the Steam ticket). wire-policy.json maps GetAuthSessionTicket's pSteamNetworkingIdentity to null-in, so any identity the game passes is dropped. If EOS verifies the ticket with an identity, that verification would fail.
- action: created Saved/Config/Windows/Engine.ini in the bottle (did not exist) with [Core.Log] Verbose for LogEOSSDK, LogEOS, LogEOSSubsystem, LogOnline, LogOnlineIdentity, LogOnlineSession, LogHttp. Delete the file to revert.

- checked: relaunch 10:25 with verbose online logging
  found: the EOS platform boots, SDKConfig succeeds, and the EOSAuth TokenGrant + "ConnectClientAuthTask Success" (client credentials, not a user) arrive at 21.26.13. "Obtained steam authticket" at 21.26.16. After that, NO LogEOSConnect / LogEOSAuth user-login line, no error, only EOSRTC tick warnings, and the log goes silent.
  implication: the game never hands the Steam ticket to EOS. It is waiting on something before the EOS user login.
- checked: game exe strings
  found: UE OnlineSubsystemSteam with GetLinkedAccountAuthToken (TokenType Session/WebAPI, DefaultLinkedAccountAuthTokenType), FOnlineAsyncEventSteamGetTicketForWebApiResponse, "AUTH: Failed to get Steam auth ticket for web api". Shim: GetAuthTicketForWebApi is a STUB returning 0. RunCallbacks, Register*, and ManualDispatch_* are all no-ops. Stub calls never reach bridge_transact, so the trace cannot see them.
- action: diagnostic shim (NOT for commit): BRIDGE_TRACE_ONCE in every vtable stub and helperFallback body, RegisterCallback/RegisterCallResult log iCallback/handle, RunCallbacks traced once. gen_vtables.test.ts has 1 expected failure (pins the CreateSteamPipe fallback body). Revert the stub tracing after diagnosis; keep the lock.

- checked: relaunch 10:30 with the stub-traced shim (gamelib_bridge_trace.log, 159 lines)
  found: at init the game registers callbacks 1202, 1203, 101, 103, 102, 115, 168, 143, 337, 333, 504, 506, 505, 1101, 1102, 1108, 331, 704, 336, 304. 163 (GetAuthSessionTicketResponse_t) is NOT registered. 168 (GetTicketForWebApiResponse_t) IS. RunCallbacks runs on tid 444 (the OSS Steam thread). Loop on tid 220: BLoggedOn, GetAuthSessionTicket (slot 13, forwarded, ok), GetSteamID, BLoggedOn, then vt_SteamUser023_GetAuthTicketForWebApi (STUB, returns handle 0). About 10 s later the same sequence repeats (t=336454649 -> 336464505), matching the paired "Obtained steam authticket" lines 10 s apart (21.30.49, 21.30.59) and the EOSRTC 10 s tick warnings.
  implication: ROOT CAUSE. The EOS user login runs through UE GetLinkedAccountAuthToken with TokenType WebAPI. The shim stubs GetAuthTicketForWebApi (handle 0), and no callback path can deliver GetTicketForWebApiResponse_t (168). The game never gets a web-API ticket for EOS Connect, so it retries every ~10 s and the menu sits at "Loading".

## Eliminated

- hypothesis: Concurrent shim callers interleave frames on the shared socket (thread race).
  evidence: Trace shows a single calling thread, zero contention, and all calls ok in ms.

- hypothesis: The failed GetAuthSessionTicket itself causes the hang (53-UAT item 9).
  evidence: After 53-14 the ticket succeeds 3x and the hang survives.

## Resolution

- root_cause: GetAuthTicketForWebApi is a shim stub returning k_HAuthTicketInvalid, and the shim has no callback delivery (RunCallbacks / RegisterCallback are no-ops), so GetTicketForWebApiResponse_t (168) never reaches the game. UE's EOSPlus login waits on that web-API ticket and retries every ~10 s; the menu shows "Loading" indefinitely.
- fix (proposed, not built): (1) forward GetAuthTicketForWebApi(pchIdentity) to real Mac Steam through the helper; (2) the helper captures 168 from its own callback pump and queues it; (3) the shim's SteamAPI_RunCallbacks drains the queued callbacks over a new CONTROL slot and dispatches each to the CCallbackBase objects registered for its iCallback (record them in SteamAPI_RegisterCallback). The MSVC vtable slot of CCallbackBase::Run(void*) must be measured, not assumed.
- verification: pending
- files_changed: meta/gen_vtables.ts + regenerated steam_api_shim.c (SRWLOCK serialization of bridge_transact and SteamAPI_Shutdown, committed as hardening). The diagnostic trace was reverted and saved as a patch.
