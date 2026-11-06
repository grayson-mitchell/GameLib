# Phase 58: Steam bridge multiplayer - Research

**Researched:** 2026-10-30
**Domain:** macOS native Steam bridge (generated Win32/Win64 `steam_api` shim <-> TCP <-> arm64 helper <-> real `libsteam_api.dylib`) plus the Phase 56 `lsteamclient` DRM mode, applied to lobbies, P2P and Steam Networking Sockets
**Confidence:** MEDIUM. Codebase mechanics and the DRM-mode candidates are HIGH (read or measured here). The free TCP-mode candidates are LOW to MEDIUM: nothing free was installed, so their `.bind`, architecture and imports are inferred.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The operator is creating a second Steam account for testing, so the test set must be **free titles: demos or free-to-play.** Each side needs its own entitlement, and the new account owns nothing. Free-to-play titles with anti-cheat are still excluded.
- **D-02:** **Research proposes and the operator approves.** Research builds a shortlist of free co-op/multiplayer titles. For each one it records: whether the launch exe carries `.bind` (`peSteamDrm.ts`), which decides TCP mode vs DRM mode; its architecture (prefer x64, per D-11); which matchmaking and networking interface versions it imports (`importScan.ts`); whether its multiplayer actually runs over Steam matchmaking/networking rather than EOS or the developer's own servers. The operator approves one TCP-mode title and one DRM-mode title before planning.
- **D-03:** If no free co-op title is SteamStub-wrapped, the second account **buys a second copy of a Phase 56 title** (Raft 648800, Grim Dawn 219990 or Ranch Simulator 1119730), and that title is the DRM-mode test title. The purchase also lifts the new account's "limited" status.
- **Research note:** a new account stays limited until it has spent $5. Research must confirm what a limited account can do: whether it can send and accept friend requests, receive lobby and game invites, and join friends' sessions. It must also confirm whether each candidate's join flow needs a friendship.
- **D-04:** The second account runs on a **Windows or Linux PC with real Steam** as a known-good peer, so any failure points at the bridge on this Mac. A Mac-to-Mac bridge pair is not part of this phase.
- **D-05:** **Both directions are gated.** The GameLib side hosts once (the peer joins), then joins once (the peer hosts). This covers both accepting incoming sessions and connecting out.
- **D-06:** The peer is on the **same LAN, and any connection path is accepted.** A relayed (SDR) join is not required. The trace or evidence must record whether each join was direct or relayed. `InitRelayNetworkAccess()` still has to be served correctly, but it does not have to be proven live on a relayed path.
- **D-07:** Wire **the interface versions the test titles import, plus the current SDK version of each in-scope family** (matchmaking, matchmaking servers, networking, and NetworkingSockets/Utils/Messages), so that modern titles get coverage. Older versions stay `mode: 'stub'` until a title needs them (the D-53-09 pattern). The `meta/sdk/wire-policy.json` and `shimCoverage.ts` served tables change to match.
- **D-08 (evidence bar):** a session counts as joined and played only with all three of: (1) a game-originated join callback in the bridge trace: `LobbyEnter_t`, or `SteamNetConnectionStatusChangedCallback_t` reaching the connected state, whichever the title uses; (2) at least one game-originated send and one game-originated receive on the networking interface, in the trace; (3) the operator confirms that both players are in the same world and can see each other move. Helper-originated calls never count, and neither does Mac Steam's In-Game status (D-53-13 / D-56-16). In DRM mode the trace comes from GameLib's `lsteamclient` (`role=game`).
- **D-09:** The baseline is the roadmap's family list. **Other families come in only when a chosen test title is measured calling them on its host or join path.** Examples: `ISteamFriends` invite and overlay calls (`ActivateGameOverlayInviteDialog`, `GameLobbyJoinRequested_t`, rich presence `connect`); `SteamGameServer*` for listen-server hosting. Nothing beyond the roadmap list is wired speculatively.
- **D-10:** `SteamGameServer*` families are wired **only if a test title hosts through them.** The D-09 rule applies to them like any other family.
- **D-11:** **Prefer 64-bit titles.** Do x86 shim work only if no suitable free x64 title exists. x86 callback dispatch has still not run live (Phase 55), and modern-SDK parity on x86 stays deferred (D-53-09).
- **D-12:** A known-bad `p2p-required` entry (Hoard 63000 today) is dropped **only for a title whose own multiplayer has been live-verified** to the D-08 bar. Other entries keep their notice. The category itself stays.
- **D-13:** The D-51-02 one-time "stubbed interface" notice is **unchanged.** It still fires for any version that is still stubbed. Wired versions simply stop triggering it, and the copy is not made multiplayer-specific.
- Carried forward: strict bridge-verified criterion (D-53-13, D-56-15/16): only game-originated calls count. No reroute to bottled Steam. Live gates are operator-run on the Mac; the gate's author is not its runner (56-15 / 56-16 split). Restart `tauri dev` before live runs, because it does not rebuild the sidecar.

### Claude's Discretion
- The trace format for join callbacks, peer send/receive and the direct-vs-relayed marker, in both modes. It must be greppable by `meta/bridgeCensus.ts` (`classifyBridgeEvidence`) and carry `role=game|helper`.
- How call results (`LobbyCreated_t`, `LobbyMatchList_t`) and broadcast callbacks (`LobbyEnter_t`, `LobbyChatUpdate_t`, `LobbyDataUpdate_t`, `P2PSessionRequest_t`, `SteamNetConnectionStatusChangedCallback_t`) map onto the k51 / Phase 55 delivery mechanism.
- How networking payload buffers (`SendP2PPacket` / `ReadP2PPacket`, `SendMessageToConnection`, `ReceiveMessagesOnConnection` and `SteamNetworkingMessage_t` ownership/`Release`) cross the TCP wire.
- Whether 56-02's `serialized005.patch` is needed, decided by what the DRM-mode test title does live.

### Deferred Ideas (OUT OF SCOPE)
- A Mac-to-Mac pair with both sides through the bridge (not chosen for D-04).
- Proving a relayed (SDR) join live by forcing the relay path (D-06 accepts any path).
- Wiring every SDK version of the matchmaking and networking families, or the `SteamGameServer*` families, without a measured need (D-07, D-10).
- A multiplayer-specific wording for the stub notice (D-13).
- x86 multiplayer (D-11), unless no free x64 candidate exists.
- Reviewed todos not folded: `2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md` (stays deferred), `2026-10-28-steamclient-wire-policy-unreachable-after-phase-56.md` (SteamClient wire policy, not multiplayer).
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are assigned (Requirements: TBD). The must-haves below are derived from the roadmap "Done when" and D-01..D-13. The planner should use them as the traceability set.

| ID | Description | Research Support |
|----|-------------|------------------|
| M-01 | A TCP-mode title passes the D-08 bar in both directions (D-05) on this Mac | Sections "Current bridge state", "Wire design", "Trace format", D-02 shortlist |
| M-02 | A DRM-mode title passes the D-08 bar in both directions | Section "DRM mode", Raft measured |
| M-03 | Matchmaking, MatchmakingServers, legacy Networking, NetworkingSockets/Utils/Messages wired in TCP mode at the D-07 version set; callbacks and call results delivered | "Architecture Patterns", "Interface version matrix" |
| M-04 | `InitRelayNetworkAccess()` served and incoming sessions accepted | Pattern 4, Pitfall 7 |
| M-05 | Greppable `role=game|helper` evidence with direct/relayed marker, fed to the census classifier | "Trace format" |
| M-06 | `serialized005.patch` decision made from live DRM-mode evidence | "DRM mode" |
| M-07 | D-12 known-bad change applied only for live-verified titles; D-13 notice unchanged | "D-12 / D-13 data path" (note the Hoard discrepancy) |
</phase_requirements>

## Summary

Today every matchmaking and networking call is answered locally. `SteamMatchMaking009`, `SteamMatchMakingServers002`, `SteamNetworking005`/`006` are served as `mode: 'stub'` (shimCoverage.ts:200-205 for x86, :254-266 for x64) and there is no NetworkingSockets/Utils/Messages manifest at all (`ls meta/sdk` shows none) [VERIFIED: codebase grep]. The callback side is more limited than the CONTEXT assumes. The k51 mechanism is a **closed allowlist of two broadcast callbacks** (168 and 1101, `gamelib_cbqueue.h:93-95`, `gen_vtables.ts:893-896`) drained one message per round trip through CONTROL slot 6. The shim's `SteamAPI_RegisterCallResult` and `SteamAPI_UnregisterCallResult` are **empty no-ops** (`gen_vtables.ts:1286-1289`) and the `ManualDispatch_*` exports answer false (`gen_vtables.ts:722-730`). **No call-result delivery exists yet.** `CreateLobby` and `RequestLobbyList` return `SteamAPICall_t` handles whose results the game reads through `CCallResult`, so call-result delivery is new infrastructure and the first thing the plans must build. The slot-0 3-argument `Run(void*, bool, SteamAPICall_t)` is already measured (`MSVC_CCALLBACKBASE_VSLOT_RUN_3ARG = 0`, `msvcCallbackLayout.ts:19`).

The real Mac `libsteam_api.dylib` in the Steam bundle already exports exactly the current families: `SteamMatchMaking009`, `SteamMatchMakingServers003`, `SteamNetworking006`, `SteamNetworkingSockets013`, `SteamNetworkingUtils004`, `SteamNetworkingMessages002`, with flat accessors `SteamAPI_SteamMatchmaking_v009`, `SteamAPI_SteamMatchmakingServers_v003`, `SteamAPI_SteamNetworking_v006`, `SteamAPI_SteamNetworkingSockets_SteamAPI_v013`, `SteamAPI_SteamNetworkingUtils_SteamAPI_v004`, `SteamAPI_SteamNetworkingMessages_SteamAPI_v002` [VERIFIED: `nm -gU` on `Steam Helper.app/.../libsteam_api.dylib`, 2026-10-30]. There is **no** `SteamAPI_SteamNetworking_v005` and **no** `SteamAPI_SteamMatchmakingServers_v002`; older version manifests must carry `helperInterface` pointing at the newest accessor, exactly as `STEAMUSERSTATS_INTERFACE_VERSION011` points at `SteamAPI_SteamUserStats_v013` (manifest field `helperInterface`, `gen_vtables.ts:214,3934`). Note the case difference: existing stub manifests say `SteamAPI_SteamMatchMaking_v009` but the Mac export is `SteamAPI_SteamMatchmaking_v009`.

The hard parts, in order: (1) call-result and broadcast-callback delivery with Mac pack(4) to MSVC pack(8) repack per struct, (2) variable-length payloads, because the wire has a 64 KiB frame cap and **4 KiB caps on in-string, out-buffer and the helper response scratch** (`gen_vtables.ts:537-545,3749`, `bridge_helper.c:197`), and (3) `SteamNetworkingMessage_t`, which must be materialised shim-side (Proton's own `networking_message_pool` is the precedent). The D-02 finding: **no free title could be confirmed SteamStub-wrapped without installing it**, so the DRM-mode title is almost certainly the D-03 purchase, and **Raft is the right one** (measured below: x64, `.bind`, Steam P2P). Ranch Simulator is disqualified in practice because it appears to run multiplayer over EOS.

**Primary recommendation:** Treat call-result delivery as plan 1 of the wire work. Build the callback-layout table first (zig measurement, k51 fixture pattern), then manifests and generator param kinds, then lobbies, then legacy P2P, then Sockets/Utils/Messages, then MatchmakingServers last. Ship fail-closed payload caps (a measured reject, never a silent truncation). Use Raft for DRM mode, and ask the operator to approve Schedule I: Free Sample (primary) with Supermarket Together (backup) for TCP mode, subject to a 58-01 measurement of `.bind` and imports.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Game calls `ISteamMatchmaking`/`ISteamNetworking*` via C++ vtable | Win shim (generated `steam_api(64).dll`) | none | Game links the shim; vtable stubs are generated from manifests |
| Real lobby, P2P and socket state, Steam auth, relay | Mac helper + `libsteam_api.dylib` | Mac Steam client | The only process with a real Steam session (D-53-13 "helper calls never count") |
| Callback and call-result registry, dispatch into game objects | Win shim | helper queue | Game objects live in the Wine process; Run() must be called there (gen_vtables.ts:939 registry) |
| Payload buffers and `SteamNetworkingMessage_t` objects | Win shim (allocates, owns Release) | helper (copies, Releases Mac msg at once) | Release fn pointer and `m_pData` must be game-process memory; no Mac pointer may cross |
| Mac vs MSVC struct repack | helper | shim | k51 repacks in the helper (`gamelib_cbqueue.h:42-60`); keep that rule |
| DRM-mode networking | genuine Mac `steamclient.dylib` via `lsteamclient` | none | No GameLib shim in DRM mode (drmTrace.ts header) |
| Evidence trace (TCP) | helper log (`NET`, `CBDISP`) | shim reports over CONTROL | Helper sees real results; shim is the only proof a game handler ran |
| Evidence trace (DRM) | `lsteamclient` `[drm-trace]` | sidecar re-log | `steamclient_main.c` trace blocks |
| Evidence classification | `meta/bridgeCensus.ts` (pure, offline) | `drm/drmTrace.ts` | Existing split |
| Known-bad data | `bridge-allowlist.json` | frontend notice code (data only) | D-12 touches data, not code |

## D-02 test-title shortlist (gates planning)

**Provenance of each field is marked: M = measured on this Mac this session, C = cited public source, I = inferred.** Nothing was installed or downloaded and Steam was not signed in. The Store API (`store.steampowered.com/api/appdetails`, read-only GET) supplied price, platforms, categories and listed requirements. A throwaway PE scanner (section names `.bind`, machine type, interface-version strings; same logic as `peSteamDrm.ts`) ran over already-installed binaries in the operator's per-game bottles.

### Honest headline

1. **No free title can be shown to carry `.bind` without installing it.** Remote sources (Store API, SteamDB, PCGamingWiki) do not expose SteamStub wrapping. Free F2P and demo titles rarely wrap, so the free shortlist below is TCP-mode by expectation, not by measurement. `.bind`, architecture and imports for every free row are therefore **unmeasured** and must be measured by plan 58-01 after the operator installs the approved title(s).
2. **The DRM-mode title will be the D-03 purchase.** Raft, Grim Dawn and Ranch Simulator are all measured `.bind` on this Mac (below). Raft is the clear pick.
3. Titles that already have a macOS build (Unturned, Crab Game, Muck) are excluded: the phase needs a Windows build run through the bridge.

### A. TCP-mode candidates (free, Windows-only, no anti-cheat listed)

| Rank | Title (appid) | Price / platforms | `.bind` | Arch | Matchmaking / networking imports | Multiplayer runs on Steam networking? | Join flow needs friendship? |
|------|---------------|-------------------|---------|------|----------------------------------|----------------------------------------|------------------------------|
| 1 | **Schedule I: Free Sample (3205720)** | free demo, win only (C: Store API) | unmeasured (I: likely none) | x64 (C: listed "Requires a 64-bit processor") | unmeasured | Co-op is in the demo, 4 players (C: store page and guides). Stack not confirmed: Unity; probably Steam transport (A1) | **Yes**: invite from the Steam friends list (C: guides) |
| 2 | **Shift At Midnight Multiplayer Demo (4050060)** | free demo, win only (C: Store API) | unmeasured | x64 (C: listed "Requires a 64-bit processor") | unmeasured | "invite up to 2 others via Steam" (C: store page text) | **Yes** (Steam invite) |
| 3 | **Supermarket Together (2709570)** | free-to-play, win only (C: Store API); categories Co-op + Online Co-op, no anti-cheat category | unmeasured | unmeasured | unmeasured | Host picks matchmaking "Only Friends" and shares a code from the pause menu (C: Steam discussion). Steam lobby inferred | Only if host chose "Only Friends" (C), so a public lobby may not |
| 4 | Alien Swarm: Reactive Drop (563560) | free, win only (C: Store API); listed categories include Online Co-op, LAN Co-op, no anti-cheat category | unmeasured | likely x86 (I: Source 2013-era). **Conflicts with D-11** | unmeasured | Valve Source networking with Steam matchmaking and a server browser (C: wiki and community). Exercises `ISteamMatchmakingServers` and probably `SteamGameServer*` (D-10 trigger) | Public matchmaking exists, so friendship may not be needed (I) |
| 5 | Spacewar (480) | free Valve SDK sample app; availability as an installable app not verified (C: community thread says it is on every account, hidden, launched with `steam://run/480`) | unmeasured | unmeasured | The SDK sample exercises lobbies, matchmaking servers, P2P and a game server | Yes by construction (Valve sample) | No; but app 480 lobby lists are shared by every developer testing, so filter strictly |

Excluded after checking: Sven Co-op 225840 (the Store API lists "Valve Anti-Cheat enabled", which is an anti-cheat; also x86 and own server protocol), Unturned 304930 and Muck 1625450 (have Mac builds), Core Keeper (the free trial was time-limited; not free now), Ranch Simulator as a free title (it is paid).

**Recommendation for approval:** TCP-mode = **Schedule I: Free Sample (3205720)**, backup **Shift At Midnight Multiplayer Demo (4050060)**, then Supermarket Together. Reason: both demos are listed x64 (satisfying D-11), both put the join on a Steam friend invite (so the peer-hosts direction needs `GameLobbyJoinRequested_t` or a lobby invite, which D-09 only wires if measured), and both have large reviewed audiences so failure reports exist. Their risk is the unconfirmed networking stack; plan 58-01 must settle it before wiring beyond the baseline. Reactive Drop is the right pick only if the operator wants the server-browser path covered, and it would force x86 work.

### B. DRM-mode candidates (all MEASURED on this Mac from the operator's installed bottles)

Interface strings are what the binaries contain, not proof of what the game calls (Steamworks.NET lists every version it knows).

| Title (appid) | `.bind` (M) | Arch (M) | Interface strings (M) | Multiplayer path (C/I) | Friendship |
|---------------|-------------|----------|-----------------------|-------------------------|------------|
| **Raft (648800)** | `Raft.exe` has `.bind` | x64 | Steamworks.NET dll: `SteamMatchMaking009`, `SteamMatchMakingServers002`, `SteamNetworking006`, `SteamNetworkingSockets012`, `SteamNetworkingMessages002`, `SteamNetworkingUtils004`, `SteamGameServer015`; bundled `steam_api64.dll`: same set | Unity P2P on the Steamworks networking API; Steam P2P is listed as a connection method in dev patch notes; no dedicated servers; **friends only** (C: web search of Steam patch notes and community threads) | **Yes**: friend-list "Invite to game / Join Game"; invitee must own the game |
| Grim Dawn (219990) | `Grim Dawn.exe` x86, `compat/Grim Dawn.exe` x64 and `x64/Grim Dawn.exe` x64: all `.bind` | x86 and x64 | `x64/Engine.dll`: `SteamMatchMaking009`, `SteamMatchMakingServers003`, `SteamNetworking006`, `SteamNetworkingSockets013`, `SteamNetworkingMessages002`, `SteamNetworkingUtils004`, `SteamGameServer015`; `compat/` uses `...Servers002`, `Sockets012` | Host registers with Steam; friend or server-list join; UPnP port 27016; "Internet" reported greyed out under Proton (C: Crate forum). Hosting looks like `SteamGameServer*` (I), a D-10 trigger | Not strictly; lists open sessions |
| Ranch Simulator (1119730) | `Ranch_Simulator-Win64-Shipping.exe` has `.bind` (the launcher exe does not) | x64 | `...Shipping.exe`: `SteamMatchMaking009`, `SteamMatchMakingServers002`, `SteamNetworking006`, `SteamNetworkingMessages002`, `SteamNetworkingSockets012`, `SteamNetworkingUtils004` | **Appears to use Epic Online Services** for multiplayer: `EpicOnlineServicesInstaller.exe` sits in the install dir (M) and a player thread says EOS is required for the multiplayer functionality (C, unofficial) | Unknown |

**Recommendation for approval:** DRM-mode = **Raft**, bought as a second copy on the peer account per D-03. It is x64, `.bind` (so `peSteamDrm.ts` routes it to DRM mode), already verified in DRM mode in Phase 56 (CONTEXT), and its multiplayer is plain Steam P2P. Raft's join needs a friendship, which the purchase unblocks anyway. Ranch Simulator should not be used. Grim Dawn is the fallback and would additionally put `SteamGameServer*` on the path.

### C. Titles already installed that give extra TCP-mode measurement (paid; not D-01 compliant)

Measured, no `.bind`, x64: Core Keeper 1621690 (CoreKeeper.exe; steam_api64 lists every legacy version), Abiotic Factor 427410 (UE, `SteamMatchMaking009`, `SteamMatchMakingServers002`, `SteamNetworking006` strings), Planet Crafter 1284190 and Vampire's Fall 1167950 (Steamworks.NET: Sockets012, Messages002, Utils004). Useful only to size the version set; do not propose them (they cost the peer account money, though that would also lift "limited").

### Imports measured vs inferred summary

The version set for the TCP baseline (D-07, "current version per family") does not depend on which free title is picked. Only the "older versions the title imports" addition does. Measured Steamworks.NET titles all contain `Sockets012`, so plan for **both 012 and 013** NetworkingSockets manifests if the chosen Unity title ships Steamworks.NET (A2).

## Limited-account research note (D-03)

| Question | Finding | Confidence |
|----------|---------|------------|
| Can a limited account **send** friend requests? | **No.** Steam Support: "limited user accounts cannot send friend invites" [CITED: help.steampowered.com/faqs/view/71D3-35C2-AD96-AA3A, via search excerpt; the page itself is JS-rendered and could not be fetched whole] | MEDIUM |
| Can it **receive** and **accept** friend requests? | **Yes.** Support states every account can receive invites [CITED: same page, via search excerpt]; secondary guides agree accepting is unrestricted | MEDIUM |
| Workaround | Limited accounts can still create "Quick Invite" links; clicking one adds the friend immediately [CITED: same page] | MEDIUM |
| What lifts the limit | Spending $5 (wallet top-up, purchases or a purchased gift). Receiving a gift, activating a retail key, playing free demos and adding a non-Steam shortcut do **not** [CITED: Steam Support via search] | MEDIUM |
| Lobby and game invites, joining friends' sessions | **Not documented.** Support lists restrictions on friend invites, group chat, Market, reviews and voting. Guides disagree on multiplayer ("play multiplayer normally" vs "invitations may behave inconsistently") | LOW, `[ASSUMED]` that invite and join work |
| Practical consequence | **The operator's main (non-limited) account sends the friend request; the limited second account accepts.** No purchase is needed to become friends. All TCP-mode candidates need only that | MEDIUM |

Per-candidate join need: Schedule I Free Sample and Shift At Midnight need a friendship (invite from friend list). Supermarket Together needs one only for "Only Friends" lobbies. Raft needs one (friends only). Preflight task for 58-01: friend the two accounts, then verify a game invite and "Join Game" using Mac Steam and the PC peer **before** debugging any bridge behaviour, so a Steam-side limitation is not blamed on the bridge.

## Standard Stack

### Core
| Component | Version | Purpose | Why standard |
|-----------|---------|---------|--------------|
| `meta/gen_vtables.ts`, `meta/buildSteamBridgeShims.ts` | in repo | Generates shim C, `bridge_dispatch.h` and `.def` from `meta/sdk/*.manifest.json` | The only sanctioned way to add interface surface (51-10) |
| `meta/extractProtonInventory.ts` | in repo | Creates schema-v2 manifests from the pinned Proton `lsteamclient/winI*.c` | Already lists `SteamNetworkingSockets`, `SteamNetworkingMessages`, `SteamNetworkingUtils` families (`extractProtonInventory.ts:691-700`) |
| `native/steam-bridge/helper/bridge_helper.c` + `gamelib_cbqueue.h` | in repo | helper, callback ring | k51/55 precedent |
| zig `0.16.0` (`/opt/homebrew/bin/zig`) | installed | MSVC-triple struct layout measurement | Used by `msvcCallbackLayout.ts` and the `steam_callback_structs.cpp` fixture |
| Apple clang 21.0.0 | installed | helper compile gate, host-compiled harnesses | Existing harnesses |
| Jest (`pnpm test`) with Meta and Backend projects | in repo | all desk gates | Existing |

### Supporting
| Item | Purpose | When |
|------|---------|------|
| Pinned Proton tree under `build/lsteamclient-work/proton-extract` (SDK 165 headers: `steamworks_sdk_165`) | Method order, signatures, and the **`networking_message_pool` precedent** in `steam_networking_manual.c` | Reading only; Valve files are never committed |
| `pnpm bridge-census` | Read-only census of installed titles and their evidence rows | Measurement step and evidence classification |

### Alternatives Considered
| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Wire every Networking method | Wire the whole family minus function-pointer, debug-output and custom-signaling methods (keep those local stubs) | Matches D-09; those methods carry Windows function pointers that cannot run in the helper |
| Raise `MAX_FRAME_BYTES` | Fail-closed with the existing 64 KiB cap, raise only if the chosen title trips it | Cheaper and safer first; see Pitfall 4 |

**Installation:** none. No new npm, pip or cargo packages are needed.

## Package Legitimacy Audit

No external packages are installed by this phase (C code, generated shim, TypeScript in existing modules). zig and clang are already present (Environment Availability). `slopcheck` was not run because there is nothing to check.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Current bridge state

### How matchmaking and networking are stubbed
- Served-version tables: `SHIM_SERVED_INTERFACE_VERSIONS` (`shimCoverage.ts:161`) and `SHIM64_SERVED_INTERFACE_VERSIONS` (`:233`). Entries `SteamMatchMaking009`, `SteamMatchMakingServers002`, `SteamNetworking005` are `mode: 'stub'`; `SteamNetworking006` is x64-only stub; flat stub exports (`SteamAPI_SteamMatchMaking_v009` ...) at `:108-115`. `SteamGameServer014/015` are x64 stubs. `SHIM_EXPORT_SET_VERSION` at `:432` must bump when the export set changes.
- Manifests: `meta/sdk/isteammatchmaking009` (38 methods), `isteammatchmakingservers002` (17), `isteamnetworking005`/`006` (22 each), `isteamgameserver012/014/015`; all `mode: stub`, ordinals 12/13/14/23/33/34/56 (`ordinals.json`, 68 entries, append-only).
- `meta/sdk/wire-policy.json` has only six families: SteamUser, SteamFriends, SteamUtils, SteamApps, SteamUserStats, SteamClient. **Matchmaking and Networking families have no entry.** A wire method needs `helperFlat` plus per-param `kind`.
- Param kinds that exist: `in-string` (cap 4096), `out-value` (scalar), `out-buffer` (cap 4096, `sizeParam`, `lenParam`), `null-in` (`gen_vtables.ts:80-86,537-545`). **Missing and required:** `in-buffer` (void* plus length), fixed-size `in-struct`/`out-struct`, and a message-array return.
- Helper wire cap `MAX_FRAME_BYTES 65536` (`bridge_helper.c:197`, `protocol.ts:98`); response scratch `BRIDGE_DISPATCH_RESP_SCRATCH_BYTES 4096` (`gen_vtables.ts:3749`).

### How k51 / Phase 55 callback delivery works end to end
1. Helper runs `ManualDispatch` only (never `RunCB`, `bridge_helper.c:388-398`). `gl_manual_pump_into_ring()` (`:547`) drains `GetNextCallback` up to 64 messages, and offers each to `gl_cbq_offer` (`gamelib_cbqueue.h`), which accepts only allowlisted ids with an **exact** byte size, 8 slots, secure-zeroed on pop. Unlisted callbacks are dropped.
2. 1101 is special: Mac struct is 20 bytes (pack 4), wire is 24 (MSVC pack 8); `gl_stats_on_observed` repacks before queueing. Repack is per-struct hand code today.
3. Shim `SteamAPI_RunCallbacks` calls `gl_cb_run_callbacks()`, which sends CONTROL slot 6 (`drainCallbacks`) at most every `CALLBACK_DRAIN_MIN_INTERVAL_MS = 30` and up to `CALLBACK_DRAIN_MAX_PER_RUN = 4` times per call. Reply is `[u32 count (0|1)][i32 iCallback][u32 cub][bytes]`, one message per round trip (`gamelib_cbqueue.h:1-15`).
4. Shim resolves live listeners by `iCallback` (`gl_cb_deliver`, `gen_vtables.ts:1090+`) and calls vtable slot `MSVC_CCALLBACKBASE_VSLOT_RUN_1ARG = 1` outside the registry lock. `hold: true` rows keep one latest message when no listener exists yet (1101 only; 168 is never held, credential hygiene).
5. Shim reports each dispatch with CONTROL slot 10 (`reportCbDispatch`, `{i32 iCallback, u32 ndispatched, u32 held}`); helper logs `CBDISP` (max 32 lines). Slot 9 is `requestCurrentStats`. Slots 7, 8 are reports; slot 3 is retired and must never be reused.
6. Old-helper/new-shim and new-helper/old-shim are tolerated because unknown slots answer `STATUS_ERR` and the shim treats that as harmless. Keep that property for any new slot.

**Consequence for this phase:** delivering a *broadcast* callback (LobbyEnter_t 504, P2PSessionRequest_t 1202, 1221, ...) is a table extension of the existing mechanism plus a per-struct repack. Delivering a *call result* is **new**: the shim must record `(CCallbackBase*, hAPICall)` in `SteamAPI_RegisterCallResult`, the helper must complete the real `SteamAPICall_t` (703 `SteamAPICallCompleted_t` plus `GetAPICallResult`, which the helper already does for the stats fetch at `bridge_helper.c:567-590`), and the shim must call slot 0 `Run(void*, bool bIOFailure, SteamAPICall_t)` with the matching handle.

### Variable-length payloads on the wire
- Fixed request/response frame with a 4-byte length cap check before allocation (T-24-03). Anything larger than 64 KiB cannot pass without changing `MAX_FRAME_BYTES` in three places (`protocol.ts`, `bridge_helper.c`, generated shim).
- Legacy P2P: unreliable packets are at most 1200 bytes in practice and reliable up to 1 MiB; `SteamNetworkingSockets` messages up to `k_cbMaxSteamNetworkingSocketsMessageSizeSend = 512 * 1024` [VERIFIED: SDK 165 header `steamnetworkingtypes.h`, `isteamnetworking.h`]. With the current 4 KiB response scratch, a `ReadP2PPacket` into a 1 MiB game buffer would be capped to 4 KiB by the generator's `out-buffer` rule and silently truncated. This must be made explicit (Pitfall 4).
- `SteamNetworkingMessage_t` ownership (the hard one), measured from the header: fields `m_pData`, `m_cbSize`, `m_conn`, `m_identityPeer` (136 bytes), `m_nConnUserData`, `m_usecTimeReceived`, `m_nMessageNumber`, `m_pfnFreeData`, `m_pfnRelease`, `m_nChannel`, `m_nFlags`, `m_nUserData`, `m_idxLane`. It is declared **outside** the `VALVE_CALLBACK_PACK_*` region (`steamnetworkingtypes.h:831` pops the pack before `:843`), so Mac arm64 and Win64 should share one 216-byte layout (A3, must be zig-measured). The pointers and function pointers must be Windows-process pointers. Therefore: the helper copies payload and metadata out of the Mac message, calls the Mac `Release` immediately, and sends a flat record; the shim allocates a Win-side struct with its own `m_pfnRelease`/`m_pfnFreeData`, exactly as Proton's `steam_networking_manual.c` does (`networking_message_pool`, `w_SteamNetworkingMessage_t_144_Release`).

## Interface version matrix (SDK and Proton)

| Family | Current SDK version (Proton SDK 165 headers, Mac dylib) | Manifest today | Needs generation | Proton `lsteamclient` has |
|--------|-----------------------------------------------------------|----------------|------------------|-----------------------------|
| ISteamMatchmaking | `SteamMatchMaking009` [VERIFIED: header and dylib string] | 009 stub | repoint to wire | 001-009 `cppISteamMatchmaking_*` |
| ISteamMatchmakingServers | **003** | 002 stub only | **003 is new**; Reactive Drop/Grim Dawn x64 reference it, Raft uses 002 | 001, 002, 003 |
| ISteamNetworking (legacy) | `SteamNetworking006` | 005, 006 stub | repoint | 001-006 |
| ISteamNetworkingSockets | **013** (Mac dylib and header); installed titles show **012** and 013 | none | **012 and 013 new** | 002, 004, 006, 008, 009, 012, 013 |
| ISteamNetworkingUtils | `SteamNetworkingUtils004` | none | **new** | 001-004 |
| ISteamNetworkingMessages | `SteamNetworkingMessages002` | none | **new** | 002 |
| ISteamGameServer | `SteamGameServer015` | 012/014/015 stub | only if a title hosts through it (D-10) | 002-015 |

Per-family method counts (virtual declarations in the 165 headers): matchmaking 82 (including callback classes), networking 22, networkingsockets 51, utils 25, messages 6. Plan to generate all via `pnpm extract-proton-inventory --versions ...`, then author wire policy per method.

## Architecture Patterns

### System Architecture Diagram

```
 Peer PC (real Steam, other account)
        |  LAN (direct) or Valve relay (SDR)
        v
 Mac Steam client  <--IPC-->  steam-bridge-helper (arm64, one per appId)
                                |  libsteam_api.dylib flat API:
                                |   CreateLobby / JoinLobby / SendP2PPacket /
                                |   ReceiveMessagesOnConnection / InitRelayNetworkAccess
                                |  ManualDispatch pump -> callback ring + call-result table
                                |     (repack Mac pack4 -> MSVC pack8, per-struct)
                                |  logs: CALL, CBDISP, NET role=game|helper ...
        ^   TCP 127.0.0.1, framed, per-spawn secret, one conn, SRWLOCK-serialised
        |   - request: (ordinal, slot, args)      -> response (status, ret, outs)
        |   - CONTROL 6: drain broadcast callbacks (+ NEW: call results)
        |   - CONTROL 10: shim reports each game-handler dispatch
        v
 Wine process (game + generated steam_api64.dll shim)
   game --C++ vtable--> shim stubs (generated)   game <-- Run(void*) / Run(void*,bool,hCall)
                           |                                  ^ slots 1 and 0
                           +-- local: struct helpers, config-callback pointers,
                               SteamNetworkingMessage_t allocation + Release
 DRM mode (SteamStub): no shim. game --> lsteamclient.dll --> genuine Mac steamclient.dylib
   evidence: [drm-trace] role=game lines written by lsteamclient to GAMELIB_DRM_TRACE_FILE
```

### Recommended project structure
```
meta/sdk/                         # new isteammatchmakingservers003, isteamnetworkingsockets012/013,
                                  # isteamnetworkingutils004, isteamnetworkingmessages002 manifests;
                                  # wire-policy.json gains SteamMatchmaking, SteamMatchmakingServers,
                                  # SteamNetworking, SteamNetworkingSockets/Utils/Messages
meta/gen_vtables.ts               # new ParamKinds, callback relay table, call-result registry
meta/msvcCallbackLayout.ts        # generalise USER_STATS_RECEIVED_LAYOUT into a layout table
meta/__tests__/fixtures/          # extend steam_callback_structs.cpp + .layout.txt with the new structs
native/steam-bridge/helper/       # gamelib_cbqueue.h (allowlist rows with mac/win sizes + repack fn),
                                  # bridge_helper.c (call-result completion, NET log, new CONTROL slot)
native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c  # DRM trace block 6
src/backend/storeManagers/steam/bridge/  # shimCoverage.ts tables, protocol.ts slots, drm/drmTrace.ts grammar
meta/bridgeCensus.ts              # classifyMultiplayerEvidence next to classifyBridgeEvidence
```

### Pattern 1: Broadcast callback relay (extends k51)
**What:** Replace the two-row allowlist with rows `{id, macSize, wireSize, repack}`; repack once in the helper; mark `hold` only for ids where a late-registering listener must still see them (LobbyEnter_t is a call result, so no hold; 1202 and 1221 are time-sensitive, no hold).
**When:** `LobbyInvite_t 503`, `LobbyEnter_t 504` (also posted as a broadcast on join), `LobbyDataUpdate_t 505`, `LobbyChatUpdate_t 506`, `LobbyChatMsg_t 507`, `P2PSessionRequest_t 1202`, `P2PSessionConnectFail_t 1203`, `SteamNetConnectionStatusChangedCallback_t 1221`, `SteamNetAuthenticationStatus_t 1222`, `SteamNetworkingMessagesSessionRequest_t 1251`, `SessionFailed 1252`, `SteamRelayNetworkStatus_t 1281`. Ids are `k_iSteam*Callbacks + n` [VERIFIED: SDK 165 headers]; confirm each numerically with the zig fixture.
**Constraint:** drain is one message per round trip with a 30 ms floor. That is fine for lobby/connection events; it is not a data path. Never carry payload through callbacks.

### Pattern 2: Call-result delivery (new)
1. Shim `SteamAPI_RegisterCallResult(pCb, hCall)` records `(pCb, hCall)` in a bounded table under the registry lock; `UnregisterCallResult` removes it. No wire traffic.
2. Wire methods that return `SteamAPICall_t` (`CreateLobby`, `JoinLobby`, `RequestLobbyList`, `RequestLobbyData`...) return the **real Mac handle** as `int64`; it is opaque to the game.
3. Helper tracks handles it returned. On a `703 SteamAPICallCompleted_t` whose `m_hAsyncCall` matches, it calls `ManualDispatch_GetAPICallResult` with the right struct size (`m_cubParam` from the 703 payload), repacks, and queues `{kind=callresult, hCall, iCallback, ioFailure, bytes}`. Reuse the stats code path (`bridge_helper.c:567-590`).
4. New CONTROL slot **11** (next free; keep 3 retired) drains call results, or extend slot 6's reply with a leading kind byte. Prefer slot 11 so an old shim never sees an unknown payload shape.
5. Shim finds the registered `(pCb, hCall)`, calls vtable slot 0 `Run(void*, bool, SteamAPICall_t)` outside the lock, then removes the entry. **Hold results whose handle is not yet registered** for a bounded time (Steamworks.NET registers after the call returns; the result can win the race). Never hold a credential-bearing id (168 stays unhold-able).
6. Also serve `ISteamUtils::IsAPICallCompleted` and `GetAPICallResult` for games that poll instead of using `CCallResult`; they are not in wire-policy today.
Call-result structs to measure: `LobbyCreated_t 513`, `LobbyMatchList_t 510`, `LobbyEnter_t 504`, `LobbyDataUpdate_t 505` (request-data completion), `LobbyKicked_t 512`.

### Pattern 3: Variable-length parameter kinds (new generator kinds)
Add to `ParamKind` and to `WIRE_LAYOUT_DOC`:
- `in-buffer`: `[u32 len][len bytes]`, with `lenParam` naming the sibling length argument. Over the cap it is refused, never truncated (the 55 WR-04 rule for strings).
- `in-struct`/`out-struct` with a literal byte size, for `SteamNetworkingIdentity` (136), `SteamNetworkingIPAddr`, `SteamNetConnectionInfo_t`, `P2PSessionState_t`, `SteamNetConnectionRealTimeStatus_t`. Per-struct pack must be measured before use; a struct whose Mac and MSVC layouts differ gets a named repack in the helper, not a raw copy.
- `out-messages`: `[u32 n]` then `n` records `{u32 cbSize, u32 conn, u8 identity[136], i64 connUserData, i64 usecTimeReceived, i64 messageNumber, i32 channel, i32 flags, u16 lane, u16 pad, payload}`. The shim builds Win-side `SteamNetworkingMessage_t` objects from these.
Keep `null-in` for the `const SteamNetworkingIdentity*` precedent (53-14).

### Pattern 4: `InitRelayNetworkAccess` and incoming sessions
- `ISteamNetworkingUtils::InitRelayNetworkAccess` and `GetRelayNetworkStatus` are plain wire calls to `SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess`/`...GetRelayNetworkStatus` (both exported by the Mac dylib [VERIFIED: nm]). Relay readiness arrives as `SteamRelayNetworkStatus_t 1281` and must be relayed.
- Incoming legacy P2P: the helper receives `P2PSessionRequest_t 1202`; relay it, and let the **game's** handler call `AcceptP2PSessionWithUser` over the wire. The spike's "proactive Accept" note (skill `macos-steam-bridge.md:97`) is the fallback if the game never registers a 1202 handler within a bounded window. Incoming Sockets: relay `1221` (state Connecting on a listen socket) and let the game call `AcceptConnection`.
- A game that sets a **connection-status callback function pointer** (`SetConfigValue`/`SetGlobalConfigValuePtr`/`SetConnectionConfigValue*` with `Callback_ConnectionStatusChanged`, or `SetGlobalCallback_*`) gives the shim a *Windows* pointer. Never send it to the helper. Keep those methods shim-local: store the pointer, and call it from the shim when the 1221 callback is drained inside `ISteamNetworkingSockets::RunCallbacks` and `SteamAPI_RunCallbacks`. (SDK doc: with no config callback set, status changes are posted to Steam's callback system [CITED: `isteamnetworkingsockets.h` RunCallbacks comment, SDK 165].)

### Pattern 5: `ISteamMatchmakingServers` response objects (do last)
`RequestInternetServerList`/`RequestLANServerList`... take a **game-side** `ISteamMatchmakingServerListResponse*` (three virtuals: `ServerResponded`, `ServerFailedToRespond`, `RefreshComplete`). The helper cannot call a Windows vtable. Create a helper-side C response object with its own three-slot vtable for the Mac call, queue each event, and have the shim invoke the game object's vtable. Proton does the equivalent Windows-side in `steam_matchmaking_manual.c` plus `execute_pending_callbacks`. Required only if the chosen TCP title browses servers (D-09). `GetServerDetails` returns a `gameserveritem_t` that needs measured layout.

### Anti-Patterns to Avoid
- **Reusing `GL_CBQ_MAX_PARAM_BYTES`/the 1-message ring for payloads.** Callbacks are signals; data goes through request/response calls.
- **Passing any Mac pointer (message, vtable, `m_pData`) across the wire.**
- **Aliasing an older interface version to the newest manifest's methods.** D-53-03/D-53-11: each version is extracted from its own Proton block. Older versions only share the helper accessor via `helperInterface`.
- **Wiring `SteamGameServer*` or `ISteamFriends` invite calls speculatively** (D-09, D-10).
- **Logging SteamIDs, IPs, handles, or payload bytes.** The existing STATS/CBQ lines forbid it by source pin (k51 summary, deviation 4). Keep `NET` lines to ids, enums, counts and booleans.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Interface method order and signatures | Hand-typed vtables | `pnpm extract-proton-inventory` against the pinned Proton tree | Slot order and stack sizes are exactly what breaks silently |
| Struct layouts across ABIs | Eyeballed offsets | zig `-ast-record-layouts` dump plus the `steam_callback_structs.cpp` fixture (two-arm test) | k51 caught Mac 20 vs MSVC 24 this way |
| Message object lifetime | Custom allocator scheme | Proton's `networking_message_pool` pattern (single heap block, refcounted, Release frees) | Already field-tested for the same SDK |
| Frame parsing/bounds | Ad hoc `memcpy` sizes | the generator's cap-checked encode/decode and `WIRE_LAYOUT_DOC` | T-24-03 |
| Evidence parsing | New regex scattered in tests | `drm/drmTrace.ts` grammar + `meta/bridgeCensus.ts` helpers | Strict classifier, zero imports by design |
| Identity struct helpers (`SteamNetworkingIdentity_SetSteamID64` ...) | wire calls | local shim implementations | They are pure struct manipulation; today they are no-op stubs returning 0 (`gen_vtables.ts:722-760`), which breaks flat-API users |

**Key insight:** every defect in this phase will be a size, layout or ownership mismatch, not a logic bug. Measure first, generate second.

## Runtime State Inventory

Not a rename/refactor/migration phase. Skipped. (D-12 touches one JSON array; see below.)

## Common Pitfalls

### Pitfall 1: Assuming call results already flow
**What goes wrong:** Lobby create/list never completes; the game waits forever.
**Why:** `SteamAPI_RegisterCallResult` is a no-op and the allowlist is two broadcast ids.
**How to avoid:** Build Pattern 2 first; unit-test it in the host-compiled registry harness before any wiring.
**Warning signs:** `CALL ...CreateLobby` logged but no `CBDISP` for 513.

### Pitfall 2: Pack(4)/pack(8) per struct
**What goes wrong:** Handlers read garbage `m_ulSteamIDLobby`.
**Why:** Mac is `VALVE_CALLBACK_PACK_SMALL`, Windows `LARGE`. Differences arise only where an int64 follows a non-8-aligned field. Estimated (A3, must measure): `LobbyEnter_t` 20 vs 24, `LobbyCreated_t` 12 vs 16, `P2PSessionConnectFail_t` 12 vs 16, `SteamNetConnectionStatusChangedCallback_t` about 704 vs 712 (`m_info` 8-aligned after `m_hConn`). `SteamNetConnectionInfo_t` itself should be identical (its int64 sits at offset 136).
**How to avoid:** Extend the fixture and layout test; never hand-copy. A size mismatch must drop the callback (the allowlist already does) and be logged once.

### Pitfall 3: `ISteamNetworkingSockets` callback via function pointer
See Pattern 4. Sending a Windows pointer to the helper crashes it, and a stubbed `SetConfigValue` makes UE and FishNet-style transports hang at "connecting".

### Pitfall 4: Silent truncation of larger payloads
**What goes wrong:** `ReadP2PPacket(buf, 1 MiB, ...)` returns a 4 KiB prefix.
**Why:** `WIRE_OUT_BUFFER_MAX_BYTES = 4096` and a 4 KiB response scratch.
**How to avoid:** Prescriptive: first ship **fail-closed** within the existing 64 KiB frame (`IsP2PPacketAvailable` reports the real size; the helper refuses a read it cannot fit, logs `NET kind=oversize`, returns false). Raise caps (one constant mirrored in `protocol.ts`, `bridge_helper.c`, the generator, with the shim transact buffer made static) only if the approved title trips `oversize`. Unreliable game traffic is below 1.2 KB.

### Pitfall 5: Round-trip cost
Every call is a blocking TCP round trip under one SRWLOCK; the helper serves one connection. A game polling `IsP2PPacketAvailable` plus `ReadP2PPacket` plus `ReceiveMessages...` every frame is the throughput limit. Do not add helper sleeps (`pump_callbacks` sleeps 3 x 50 ms and is reserved for WHOAMI, `bridge_helper.c:388-398`). Measure frame time in the live gate.

### Pitfall 6: Wrong accessor name / missing accessor
Existing stub manifests name `SteamAPI_SteamMatchMaking_v009`, `SteamAPI_SteamNetworking_v005`, `SteamAPI_SteamMatchMakingServers_v002` as the *game-facing* flat accessors. The *Mac* exports are `...Matchmaking_v009` (lowercase m), `Networking_v006`, `MatchmakingServers_v003`. Set `helperInterface` on each manifest; a wrong dlsym leaves `self` NULL and every call returns `STATUS_ERR`.

### Pitfall 7: Mac vs Win identity of the host
In TCP mode the *helper* is the Steam peer. The peer sees the operator's Mac account, not a Wine process. Anything that needs the game's own process (overlay-based invites, `GameLobbyJoinRequested_t` from the friends list) arrives at the helper's pipe and must be relayed, or it is silently lost. This is the D-09 measured-need trigger for `ISteamFriends` families. Prefer a join path that does not need it for the first title (lobby code or server list), otherwise relay `GameLobbyJoinRequested_t 333`/`GameRichPresenceJoinRequested_t 337` as additional allowlist rows once measured.

### Pitfall 8: macOS Local Network privacy
Direct LAN connections to the peer need the responsible app to hold Local Network permission on current macOS. The application firewall is **disabled** on this Mac (`socketfilterfw --getglobalstate`: disabled, macOS 27.0.1) so the prompt path is the thing to watch, not the firewall. Record any "would like to find devices on your local network" prompt in the gate. Diagnose with `/usr/bin/log show --info` (memory: macos-tcc-diagnosis).

### Pitfall 9: Stale sidecar and helper
`tauri dev` does not rebuild the sidecar, and a fresh worktree needs `build:sidecar-sea` plus `vite build` before the first run (memory entries). A gate run against old binaries proves nothing. Record helper and shim mtimes in the gate evidence (k51 did).

### Pitfall 10: Hoard is not a `p2p-required` known-bad entry any more
See "D-12 / D-13 data path".

## Code Examples

### Wire record for received messages (proposal, `out-messages`)
```c
/* one record, little-endian, then cbSize payload bytes; n records after a u32 count */
#pragma pack(push, 1)
typedef struct {
  uint32_t cbSize;
  uint32_t conn;
  uint8_t  identityPeer[136];   /* SteamNetworkingIdentity, no pointers, layout identical on both ABIs (verify) */
  int64_t  connUserData, usecTimeReceived, messageNumber;
  int32_t  channel, flags;
  uint16_t lane, pad;
} gl_net_msg_rec;
#pragma pack(pop)
```

### Call-result completion in the helper (extends the existing stats path)
```c
/* bridge_helper.c, inside gl_manual_pump_into_ring, branch for 703: */
if (done.m_hAsyncCall is a handle we returned) {
  uint8_t buf[GL_CBQ_MAX_PARAM_BYTES]; bool failed = false;
  bool got = g_md_get_api_call_result(g_hpipe, done.m_hAsyncCall, buf, done.m_cubParam,
                                       done.m_iCallback, &failed);
  /* repack by iCallback (mac -> msvc pack8), then gl_cr_queue(hCall, iCallback, failed, bytes) */
}
```

### Trace grammar proposal (see next section) and the existing DRM regex it extends
```ts
// Source: src/backend/storeManagers/steam/bridge/drm/drmTrace.ts:62-66
const TRACE_CALL_RE =
  /^\[drm-trace\] appId=(\d{1,10}) pid=([1-9]\d{0,9}) role=(game|helper) event=call name=([A-Za-z0-9_]{1,128})$/
```

## Trace format (D-08) and census integration

### TCP mode (helper log, appid-attributed like `CALL`, `CBDISP`)
`findGameCalls` reads `[ts] CALL Interface.Method` lines that follow a `HELLO` for the appid (`bridgeCensus.ts:898-912`). Add one new line type with the same attribution and a **closed vocabulary**:

```
[ts] NET  role=<game|helper> kind=<join|send|recv|path|oversize> iface=<Matchmaking|Networking|Sockets|Messages> cb=<int|0> n=<int> path=<direct|relayed|unknown>
```
- `role=game`: emitted for a wire request from the shim (only the shim sends wire requests, so game-originated by construction, same argument as `bridge_helper.c:1076-1080`), or when the shim reports a handler dispatch (slot 10 `CBDISP`, or the new call-result report) with `targets >= 1`.
- `role=helper`: the helper observed it itself (a pumped callback, a connection state change nobody handled). Never counts.
- `kind=join`: LobbyEnter_t (504) `response == k_EChatRoomEnterResponseSuccess` delivered to a game handler, or 1221 with `m_info.m_eState == Connected (3)` and old state != Connected delivered to a game handler. The helper parses the state at pop time (it popped the message), then promotes it to `role=game` when the matching `CBDISP` arrives with `targets >= 1`.
- `kind=send`/`recv`: logged only on `ok=1` (the real Steam call returned true or a count > 0), first per `(iface, kind)` plus a cap of 32 lines and one cap line (`recv` fires only when data was actually returned, which closes the "polled an empty queue" hole).
- `path`: direct or relayed from `SteamNetConnectionInfo_t.m_nFlags & k_nSteamNetworkConnectionInfoFlags_Relayed (16)` (SDK header) for Sockets, `P2PSessionState_t.m_bUsingRelay` for legacy P2P. Carried on the join/recv lines; `unknown` is allowed. Corroborate in the gate with `lsof -nP -iUDP` on the helper pid: a LAN peer address versus a Valve relay address.
- Never log SteamIDs, IPs, handles or payload bytes.

### DRM mode (`[drm-trace]`, written by `steamclient_main.c`)
The current trace logs the first call of each distinct `ISteam*` method name (`gamelib_trace_call`, `steamclient_main.c:~201-257`) with role from the module name (`steam.exe` is helper). For D-08:
1. **Join callback:** add a sixth trace block in `Steam_BGetCallback` (`steamclient_main.c:715`): when `STEAMCLIENT_CALL` returns true, log `[drm-trace] appId=%s pid=%lu role=%s event=callback id=<int>` for a closed id set (504, 1221, 1202, 1251, 333). This is the game's own pipe being drained, so `role=game` is genuine. Dedupe per id.
2. **Send / receive:** `event=call name=ISteamNetworking_SteamNetworking006_SendP2PPacket` / `ReadP2PPacket` / `ISteamNetworkingSockets_..._SendMessageToConnection` / `ReceiveMessagesOnConnection` already appear through the existing mechanism, with no new overlay code. A call line does not prove data moved; D-08 item 3 (operator sees the same world) is the proof of data, the trace proves the *game*, not the helper, drove it. If result-aware receive is wanted, the only hook point is the Windows-side message pool in `steam_networking_manual.c`, which is **not** one of the three overlay files (`PINS.md`), so it needs an explicit PINS and D-01 amendment. Recommend not doing it unless the live gate shows a polling-only false positive.
3. Extend `drmTrace.ts` with `TRACE_CALLBACK_RE` (`event=callback id=(\d{1,5})`) and carry the strip-rule count in `PINS.md` ("exactly five blocks" becomes six) and `NOTICE`.
4. DRM `path` marker: no in-process hook. Use the operator `lsof` corroboration and record it in the gate.

### `classifyBridgeEvidence`
Leave `classifyBridgeEvidence` (`bridgeCensus.ts:1110`) untouched: it is the strict init criterion and a multiplayer rule inside it would change every existing verdict. Add `classifyMultiplayerEvidence({appid, appLogTexts, drmMode})` beside it returning `{status: 'verified'|'unverified', join, send, recv, path, detail}`. It composes the same attribution helpers (`attributeHelperLines`, `extractDrmEvidence`). `verified` requires all three D-08 machine items with `role=game`; item 3 stays an operator `result:` in the UAT file. Unit-test with fixture log text only.

## D-12 / D-13 data path

- **Discrepancy:** CONTEXT says Hoard 63000 is a known-bad `p2p-required` entry "today". It is not. `bridge-allowlist.json` has `"knownBad": []`, and Hoard was lifted by quick 261026-ous (commit `90ebe6db7`). The category `p2p-required` still exists in the closed taxonomy (`allowlist.ts:68-90`, `common/types/steam.ts:109`) with the notice display wiring (`SteamBridgeRouteNotice.ts`, `steamBridgeRouteLine.ts`, `bridgeRouteDisplay.ts`). So D-12 is currently a no-op: there is nothing to drop. Confirm with the operator whether to treat D-12 as "nothing to change, keep the category", or as a different title that should be listed. Either way the change path is data only: remove the object from the `knownBad` array in `bridge-allowlist.json` and update the real-bundle assertions in the allowlist tests. No frontend code changes.
- **D-13:** no copy change. Wiring a version in `SHIM_SERVED_INTERFACE_VERSIONS`/`SHIM64_SERVED_INTERFACE_VERSIONS` (changing `mode: 'stub'` to `'wire'`, or adding the new keys) is the whole effect; `isScanVerdictNowCovered` (`shimCoverage.ts`, used at `bridgeRoute.ts:254`) re-evaluates old scan verdicts; bump `SHIM_EXPORT_SET_VERSION` (`:432`, recomputed from the export set) when exports change.

## DRM mode

- Networking already passes through to the genuine Mac `steamclient.dylib`. The work is proof, not wiring. Raft's interface strings (Sockets012, Messages002, Utils004, MM009, MMServers002, Networking006) are all present in the pinned Proton tree (`cppISteamNetworkingSockets_SteamNetworkingSockets012.cpp` etc.).
- **`serialized005.patch`:** upstream adds `SteamNetworkingSocketsSerialized005` (11 methods: `SendP2PRendezvous`, `SendP2PConnectionFailure`, `GetCertAsync`, `GetNetworkConfigJSON`, `CacheRelayTicket`, `GetCachedRelayTicketCount`, `GetCachedRelayTicket`, `PostConnectionStateMsg`, `GetSTUNServer`, `AllowDirectConnectToPeer`, `BeginAsyncRequestFakeIP`) plus a `165x` SDK entry [CITED: NotProton `lsteamclient/serialized005.patch` @ `8db22ad`]. It is the interface Valve's networking library uses to rendezvous through the Steam client. 56-15 item 10 counted `SteamNetworkingSocketsSerialized005` as 0 in every single-player capture, which says only that single-player never reached it. **Prescription:** do not carry it. Decide from the Raft gate: grep the Wine log for `Don't recognize interface name:` (the `ERR` in `create_interface`/`find_iface_constructor` path, `steamclient_main.c`) and for `Serialized005`. If either appears during a join, carry the patch in a follow-up plan; if the join completes without it, record "not needed" with the log evidence. `[ASSUMED]` that a Windows game process using `SteamNetworkingSockets012` through lsteamclient does not need it; the evidence is deliberately left to the live run.
- Roles: lsteamclient also initialises inside the bottle's `steam.exe` (`role=helper`); only `role=game` lines count (Pitfall 10 of Phase 56; `drmTrace.ts` header).
- Likely DRM-mode surprises (live gate checks): `get_unix_buffer` handling for buffers above the 32-bit range, message-pool conversion bugs in `steam_networking_manual.c`, and Local Network permission for the Wine process.

## State of the Art

| Old | Current | Change | Impact |
|-----|---------|--------|--------|
| `ISteamNetworking` legacy P2P | `ISteamNetworkingSockets`/`Messages` over SDR | Valve deprecated legacy P2P in SDK 1.4x | Modern games import Sockets012/013; legacy still used by Raft/older Unity |
| `SteamMatchMakingServers002` | `003` (Mac dylib and Proton SDK 165) | recent SDK | Needs a new manifest; older titles still import 002 |
| `SteamNetworkingSockets012` | `013` | recent SDK | Both appear in installed titles |

**Deprecated:** none relevant; Mac dylib has no `SteamNetworking_v005`/`MatchmakingServers_v002` accessors, so older versions are always served through the newest helper accessor.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Schedule I: Free Sample and Shift At Midnight use Steam transports (lobbies, SDR/P2P), not their own servers | D-02 shortlist | The TCP title would not exercise the wiring; 58-01 must read the imports before approval is final |
| A2 | The chosen Unity free title ships Steamworks.NET (Sockets012 and 013 strings) | Interface matrix | Might need only 013, or only legacy P2P; wasted manifest if wrong, cheap to drop |
| A3 | Callback struct size deltas (LobbyEnter 20/24, LobbyCreated 12/16, 1221 about 704/712, SteamNetworkingMessage_t 216 on both ABIs) | Pitfall 2, Pattern 3 | Wrong repack. Mitigation: they are measured by plan 58-02 before any code uses them |
| A4 | Limited accounts can receive game invites and join sessions | Limited-account note | Peer account cannot join; mitigated by the preflight and by D-03 purchase |
| A5 | Free titles are not SteamStub wrapped | D-02 | If one is wrapped it becomes a free DRM-mode title (good news); plan 58-01 measures |
| A6 | `serialized005.patch` is not needed for Windows-game Sockets use | DRM mode | A Raft or Sockets title fails to connect; resolved by the live grep |
| A7 | Spacewar 480 is installable | D-02 | Drop it from the shortlist |
| A8 | `lsof -nP -iUDP` shows a LAN peer vs relay address on this Mac | Trace format | Weaker direct/relayed record; fall back to the in-game/info flags |
| A9 | Local Network permission applies to the helper/Wine process | Pitfall 8 | A silent connect failure on a LAN is mis-diagnosed |

## Open Questions (RESOLVED)

1. **D-12 target.** RESOLVED by D-16 (operator, 2026-10-30): `knownBad` is already `[]` (Hoard lifted in quick 261026-ous, `90ebe6db7`), so D-12 is a recorded no-op; no entry is removed and the `p2p-required` category stays. 58-24 pins both facts in `allowlist.test.ts`.
2. **Raise payload caps now or fail closed?** RESOLVED by the fail-closed rule (Pitfall 4): ship within the existing 64 KiB frame with a 61440-byte per-field cap (`WIRE_LARGE_MAX_BYTES`, 58-06); oversize is refused and logged `NET kind=oversize`, never truncated (58-13, 58-15, 58-16). Caps are raised only if a live gate records an oversize line (58-23 item 5 turns any count above 0 into a Gap).
3. **Which TCP free title?** RESOLVED by D-14: Schedule I: Free Sample (3205720), measured and confirmed by 58-01 (stop rule: `.bind`, x86, anti-cheat or no Steam networking stops for an operator re-pick; Shift At Midnight 4050060 is the unapproved research backup).
4. **Does Mac Steam post `GameLobbyJoinRequested_t` to the helper's pipe on a friends-list invite?** RESOLVED as settled live, not at research time: 58-17 (re-measure on the wired bridge) Task 1 has the peer invite the main account from the PC's friends list while Schedule I runs through the bridge; the 58-07 unlisted-id log (`CBQ unlisted iCallback=333`) or, once relayed by 58-18, the CBDISP line records whether it arrives. 58-23 (TCP gate, direction B) confirms it on the scored join.
5. **Spacewar (480) as a smoke harness:** DROPPED. It is not a gate title, its installability is unverified (A7), and the host-compiled harnesses (cbqueue, callbackRegistryHost, networkingLocalHost) plus the two live gates already cover what a smoke harness would. No plan uses it.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| zig | layout measurement, shim cross-compile | yes | 0.16.0 (`/opt/homebrew/bin/zig`) | build/ downloaded copy via `meta/downloadZig.ts` |
| Apple clang | helper compile gate, harnesses | yes | 21.0.0 | none needed |
| node, pnpm | all gates | yes | v22.23.4, 10.28.0 | none |
| Mac Steam, signed in | helper `SteamAPI_InitFlat` (live) | running at research time (`steam_osx` pid present) | Steam Helper `libsteam_api.dylib` universal | none; live gates need it |
| CrossOver | Wine bottles, lsteamclient | yes (`/Applications/CrossOver.app`) | 26.3 base | none |
| Windows or Linux peer PC with real Steam, second account | live gates | not verifiable from here | n/a | **blocking for live gates** (D-04) |
| Python 3 | planning gates, research scanner | yes | 3.15 | none |
| macOS application firewall | incoming LAN connections | disabled | n/a | n/a |

**Missing dependencies with no fallback:** the peer PC and second account (operator is preparing them).
**Missing with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (projects `Meta`, `Backend`, frontend), host-compiled C harnesses inside Jest, zig cross-compile gate |
| Config file | repo `jest` config; `meta/jest.config.js` for Meta |
| Quick run command | `pnpm exec jest meta/__tests__/gen_vtables.test.ts meta/__tests__/callbackRegistryHost.test.ts meta/__tests__/msvcCallbackBaseLayout.test.ts meta/__tests__/bridgeCensus.test.ts` |
| Full suite command | `pnpm test:ci` then `pnpm codecheck`, `pnpm planning-gates`, `pnpm find-deadcode`, `pnpm lint` |
| Build gate | `pnpm gen-vtables && pnpm build-steam-bridge` (compile gate for `steam_api.dll`, `steam_api64.dll`, `steamclient64.dll`) |

### Phase Requirements to Test Map
| Req | Behavior | Test type | Automated command | File exists? |
|-----|----------|-----------|-------------------|--------------|
| M-03 | New manifests validate; wire-policy resolves; generated dispatch has new kinds; `WIRE_LAYOUT_DOC` pins | unit | `pnpm exec jest meta/__tests__/gen_vtables.test.ts meta/__tests__/extractProtonInventory.test.ts` | yes (extend) |
| M-03 | Callback layout rows (mac vs msvc, both triples) | unit (zig arm) | `pnpm exec jest meta/__tests__/msvcCallbackBaseLayout.test.ts` | yes (extend fixture) |
| M-03 | Call-result register / hold / dispatch slot 0 / race with late registration | host-compiled C harness | `pnpm exec jest meta/__tests__/callbackRegistryHost.test.ts` | yes (extend) |
| M-03 | CBQ allowlist rows with mac and wire size, repack, zero-on-pop | host-compiled C harness | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/cbqueue.test.ts` | yes (extend) |
| M-03 | New CONTROL slot and any new frame shape; old/new peer tolerance | unit + helper integration (spawns helper under fake HOME) | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts` | yes (extend) |
| M-03 | Shim ABI and compile gate for new stubs, `ret N` for x86 and x64 | gate | `pnpm exec jest meta/__tests__/shimAbiGate.test.ts` | yes |
| M-03 | Served-version tables, export-set version bump, `isScanVerdictNowCovered` | unit | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/shimCoverage.test.ts` | check name in `__tests__` |
| M-05 | `NET` and `[drm-trace] ... event=callback` grammar; closed vocabulary; no SteamID/IP/handle | unit (pure) | `pnpm exec jest meta/__tests__/bridgeCensus.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/drmTrace.test.ts` | extend |
| M-05 | Source pin: no `%s` of ids/handles in NET format strings (k51 deviation 4 precedent) | source-pin unit | same suites | extend |
| M-06 | DRM trace block present, strip rule reproduces upstream bytes (six blocks) | unit | `pnpm exec jest meta/__tests__/buildLsteamclient.test.ts` | yes (update count) |
| M-07 | D-12 data change, D-13 notice unchanged | unit | `pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/allowlist.test.ts src/frontend/state/__tests__/SteamBridgeRouteNotice.test.ts` | yes |
| M-01, M-02 | Hosts and joins with a second account, both directions, both modes | **operator-run live gate** | `58-NN-LIVE-GATE.md` UAT items; evidence via `pnpm bridge-census` | no (Wave 5) |

Not unit-testable (live gate only): real lobby creation against Steam, `P2PSessionRequest_t` timing, direct vs relayed path, Local Network permission, frame time under per-frame polling, `GameLobbyJoinRequested_t` delivery, and D-08 item 3 (the operator seeing both players in the same world).

### Sampling Rate
- **Per task commit:** the quick run command plus `npx prettier --check <exact paths>` per the repo rule (scoped, never `.`; run `--file-info` first and omit the check where every path is ignored).
- **Per wave merge:** `pnpm gen-vtables && pnpm build-steam-bridge`, the full Jest bridge and Meta suites, `pnpm codecheck`.
- **Phase gate:** full suite green, `pnpm planning-gates`, then operator live gates.

### Wave 0 Gaps
- [ ] Extend `meta/__tests__/fixtures/steam_callback_structs.cpp` (+ `.layout.txt`) with every relayed callback struct and `SteamNetworkingMessage_t`; generalise `msvcCallbackLayout.ts` beyond `USER_STATS_RECEIVED_LAYOUT`.
- [ ] Add a call-result harness case set to `callbackRegistryHost.test.ts` (register, complete, late-register hold, unregister race).
- [ ] Fixture log text for `NET` and `[drm-trace] event=callback` lines for the census tests.
- [ ] No new framework install.

## Security Domain

`security_enforcement` is absent from config, so treated as enabled. The bridge is a loopback service that accepts game-controlled bytes.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard control |
|---------------|---------|-----------------|
| V2 Authentication | yes (existing) | Per-spawn 256-bit secret in HELLO, constant-time compare; new slots and every new ordinal inherit "authenticated only" |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | New CONTROL slot refused until HELLO matched; keep `STATUS_ERR` on unknown slots |
| V5 Input Validation | yes | Declared-length cap checked before allocation (T-24-03); every new `in-buffer`/`out-messages` length validated against the cap and against the declared struct size; refuse, never truncate |
| V6 Cryptography | no | Steam handles transport encryption; do not log tickets or secrets |
| V7 Error handling / logging | yes | `NET`/trace lines carry no SteamID, IP, handle or payload; add a source pin; run `logSecretGate` |

### Known Threat Patterns
| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Oversized or lying length in an `in-buffer`/message record from a malicious game process | DoS / Tampering | cap-before-alloc, fixed static buffers, refuse on mismatch |
| Windows function pointer forwarded to the helper | Elevation / DoS | shim-local handling of every config-callback setter (Pattern 4) |
| Unlisted callback ids reaching the game | Spoofing | closed allowlist with exact sizes (existing) |
| Payload or peer identity in logs | Info disclosure | closed-vocabulary trace, source pin |
| Held call results keeping stale data | Info disclosure | bounded hold table, secure-zero on delivery or expiry |
| Other local user connecting to the helper port | Spoofing | existing HELLO secret (WR-03) |

## Project Constraints (from CLAUDE.md)

- Tech stack is React + TypeScript on a Rust/Tauri shell; GameLib is independent of upstream Heroic, so upstream mergeability is not a concern and must not be raised as a caveat.
- Steam stack is frozen (`.planning/research/STEAM-STACK.md`); this phase touches only the native bridge, not steam-session/steam-user auth.
- **Conventions (load `Skill("gamelib-conventions")` before acting):**
  - `<verify>` blocks: `npx prettier --check` over exact paths written, never `.`; run `--file-info` first; omit the check if every path is prettier-ignored (`.c`, `.h`, `.cpp` and `.layout.txt` have no parser, as in k51).
  - Child processes spawned from `src/` or `meta/` (tests, harnesses) use `createFakeHomeProfile()`; no hand-rolled `env` literal; declare a named real-profile arm where a defect only arms under a populated profile (the census and live gates are such arms and declare themselves).
  - Sidecar timers, watchers, sockets, child handles: `unref()` and no unbounded in-flight work at boot; exit by event-loop drain at stdin EOF.
  - `*-UAT.md` items: `### N.` at column 0, `expected:` inline, `result:` opening with a bare or bracketed status word. The live-gate contract pattern is in `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md` (gate author is not its runner, 56-15/56-16).
  - Todos under `.planning/todos/pending/` carry `severity:`, `platform:`, `ready:` by hand.
- Run `graphify update .` after code changes; do not read `GRAPH_REPORT.md` or `graph.json` whole.
- Direct repo edits happen only inside a GSD workflow.
- Memory directives: do not reroute to bottled Steam; bridge "verified" is strict (HELLO plus clean game log, no In-Game credit); restart `tauri dev` before live-testing backend changes; fresh worktrees need `build:sidecar-sea`, `vite build`, `build-steam-bridge`.

## Suggested plan decomposition and wave ordering

Operator pre-planning gate: approve one TCP-mode and one DRM-mode title from the D-02 section. Wiring work in waves 1-3 is designed to be **independent of which title is approved** (baseline = current SDK version per family) so the planner is not blocked on measurement. Title-specific older versions are added by 58-08 once 58-01 reports.

| Wave | Plan | Content | Type |
|------|------|---------|------|
| 0 | 58-01 | Operator installs the approved free title(s); run `pnpm bridge-census` and PE scan; write measured `.bind`, arch, imports, join flow into a titles file; account preflight (friend, invite, join between the two accounts with plain Steam); settle A1/A2/A5; decide whether `GameLobbyJoinRequested_t` is on the join path. **Own early plan: imports cannot be measured at research time.** | `ready: human` + `live-gate` |
| 0 | 58-02 | Callback and message layout measurement: extend the zig fixture, layout table, tests (A3). Pure desk | `ready: code` |
| 0 | 58-03 | Manifests: `extract-proton-inventory` for MMServers003, Sockets012/013, Utils004, Messages002; set `helperInterface` on all existing stub manifests of the in-scope families; ordinals; no wire policy yet | `ready: code` |
| 1 | 58-04 | Generator: new ParamKinds (`in-buffer`, `in/out-struct`, `out-messages`), `WIRE_LAYOUT_DOC`, cap policy and `oversize` fail-closed, golden tests | `ready: code` |
| 1 | 58-05 | Callback infrastructure: allowlist rows with mac/wire size and repack; call-result registry in the shim, new CONTROL slot 11, helper completion via 703 plus `GetAPICallResult`, held-result table, `IsAPICallCompleted`/`GetAPICallResult` wire; protocol.ts; host harnesses | `ready: code` |
| 2 | 58-06 | Matchmaking: wire policy for `ISteamMatchmaking` 009, lobby call results, broadcast 503-507; `NET` lines; census `classifyMultiplayerEvidence` | `ready: code` |
| 2 | 58-07 | Legacy `ISteamNetworking` 005/006: P2P send/read/session, 1202/1203 relay, accept flow, `GetP2PSessionState` path marker | `ready: code` |
| 3 | 58-08 | Title-specific older versions from 58-01; flat `SteamNetworkingIdentity_*`/`IPAddr_*` real local implementations | `ready: code` |
| 3 | 58-09 | `ISteamNetworkingSockets` 012/013, Utils 004, Messages 002: message ownership, config-callback pointers kept shim-local, 1221/1222/1251/1252/1281 relay, `InitRelayNetworkAccess` | `ready: code` |
| 3 | 58-10 | `ISteamMatchmakingServers` response-object relay and `gameserveritem_t`; **only if** 58-01 shows the title browses (D-09); otherwise wire the non-callback methods and leave the rest stub | `ready: code`, conditional |
| 4 | 58-11 | DRM trace block 6 (`event=callback`), `drmTrace.ts` grammar, PINS/NOTICE six-block rule, rebuild the lsteamclient archive | `ready: code` |
| 4 | 58-12 | Build everything; shim/export-set bump; served tables flip; D-13 behaviour test; record artifact mtimes | `ready: code` |
| 5 | 58-13 | Live-gate contract and UAT file for TCP title, both directions (author) | `ready: code` |
| 5 | 58-14 | TCP live gate (operator-run, separate from author) | `ready: live-gate` |
| 5 | 58-15 | Raft DRM live gate contract + operator run; `Serialized005` grep decision | `ready: live-gate` |
| 6 | 58-16 | D-12 data decision, STATE/ROADMAP/REQUIREMENTS updates, serialized005 outcome, todo triage | `ready: code` |

x86 (D-11) is not planned; revisit only if 58-01 finds no suitable x64 free title.

## Sources

### Primary (HIGH confidence)
- Codebase reads (all in `/Users/graysonmitchell/Projects/GameLib`): `src/backend/storeManagers/steam/bridge/shimCoverage.ts`, `protocol.ts`, `drm/drmTrace.ts`, `allowlist.ts`, `bridge-allowlist.json`; `meta/gen_vtables.ts`, `meta/bridgeCensus.ts`, `meta/msvcCallbackLayout.ts`, `meta/extractProtonInventory.ts`, `meta/sdk/*.manifest.json`, `meta/sdk/wire-policy.json`; `native/steam-bridge/helper/bridge_helper.c`, `gamelib_cbqueue.h`; `native/steam-bridge/steamclient-layer/lsteamclient/steamclient_main.c`, `PINS.md`; `.planning/quick/261027-k51-*/SUMMARY`; `56-02-SUMMARY.md`, `56-15-LIVE-GATE.md`.
- Mac `libsteam_api.dylib` export list (`nm -gU`) and interface strings from the Steam bundle on this Mac, 2026-10-30.
- Valve SDK 165 headers and Proton `lsteamclient` tree in `build/lsteamclient-work/` (read-only, uncommitted): interface versions, method counts, callback id enums, `SteamNetworkingMessage_t`, `networking_message_pool`.
- Local PE scan of installed bottles (Raft, Grim Dawn, Ranch Simulator, Core Keeper, Abiotic Factor, Planet Crafter, others): `.bind`, machine type, version strings.
- Steam Store API (`appdetails`, `storesearch`, `search/results`), 2026-10-30: price, platforms, categories, listed requirements for the free candidates.

### Secondary (MEDIUM confidence)
- NotProton `lsteamclient/serialized005.patch` @ `8db22ad` (raw GitHub): what Serialized005 adds.
- Steam Support, Limited User Accounts (help.steampowered.com/faqs/view/71D3-35C2-AD96-AA3A), via search excerpts (page not renderable by fetch): friend-invite limits, Quick Invite, how to lift.
- Steam community and press pages for Raft P2P and friends-only join, Schedule I demo co-op and invites, Supermarket Together code join, Shift At Midnight demo invites.

### Tertiary (LOW confidence)
- Ranch Simulator EOS usage (player thread plus the installer in the install dir), Grim Dawn host/UPnP details (forum posts 2016-2020), Spacewar availability (community thread), limited-account multiplayer behaviour (guides disagree).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new packages, tooling verified present.
- Architecture: MEDIUM-HIGH, every mechanism read in the source; the new call-result and message-ownership designs are proposals grounded in the Proton precedent, not yet built.
- Titles: LOW-MEDIUM for the free candidates (unmeasured), HIGH for the DRM candidates (measured).
- Pitfalls: MEDIUM, size deltas are estimates until 58-02.

**Research date:** 2026-10-30
**Valid until:** 2026-11-13 (Steam store content and the Mac client bundle change often; re-run the `nm` export check if Steam updates before planning)
