# Phase 58: Steam bridge multiplayer - Context

**Gathered:** 2026-10-30
**Status:** Ready for research

<domain>
## Phase Boundary

A Steam multiplayer title run through the macOS native bridge hosts, finds and joins an online
session with a second Steam account, in both bridge modes:

- **TCP shim mode** (every DRM-free title): wire `ISteamMatchmaking`, `ISteamMatchmakingServers`,
  the legacy `ISteamNetworking`, and `ISteamNetworkingSockets`/`Utils`/`Messages` through the
  helper to the real `libsteam_api.dylib`. Deliver their callbacks and call results the way quick
  261027-k51 delivered `UserStatsReceived_t`. Handle `InitRelayNetworkAccess()` and accepting
  incoming sessions.
- **`lsteamclient` DRM mode** (Phase 56, SteamStub titles): networking already passes through to the
  genuine Mac `steamclient.dylib`. The work is proving it live, and deciding whether 56-02's
  omitted `serialized005.patch` must be carried.

This phase lifts 24-SPEC's "P2P join out of scope" rule. Anti-cheat titles (EAC, BattlEye) stay
out of scope.

**Done when:** on this Mac, one TCP-mode title and one DRM-mode title each pass the D-08 evidence
bar in both directions (D-05): the GameLib side hosts a session the peer joins, and joins a
session the peer hosts.

</domain>

<decisions>
## Implementation Decisions

### Test titles
- **D-01:** The operator is creating a second Steam account for testing, so the test set must be
  **free titles: demos or free-to-play.** Each side needs its own entitlement, and the new account
  owns nothing. Free-to-play titles with anti-cheat are still excluded.
- **D-02:** **Research proposes and the operator approves.** Research builds a shortlist of free
  co-op/multiplayer titles. For each one it records:
  - whether the launch exe carries `.bind` (`peSteamDrm.ts`), which decides TCP mode vs DRM mode;
  - its architecture (prefer x64, per D-11);
  - which matchmaking and networking interface versions it imports (`importScan.ts`);
  - whether its multiplayer actually runs over Steam matchmaking/networking rather than EOS or
    the developer's own servers.

  The operator approves one TCP-mode title and one DRM-mode title before planning.
- **D-03:** If no free co-op title is SteamStub-wrapped, the second account **buys a second copy of
  a Phase 56 title** (Raft 648800, Grim Dawn 219990 or Ranch Simulator 1119730), and that title is
  the DRM-mode test title. The purchase also lifts the new account's "limited" status.
- **Research note:** a new account stays limited until it has spent $5. Research must confirm what
  a limited account can do: whether it can send and accept friend requests, receive lobby and
  game invites, and join friends' sessions. It must also confirm whether each candidate's join
  flow needs a friendship.

### Second account / peer
- **D-04:** The second account runs on a **Windows or Linux PC with real Steam** as a known-good
  peer, so any failure points at the bridge on this Mac. A Mac-to-Mac bridge pair is not part of
  this phase.
- **D-05:** **Both directions are gated.** The GameLib side hosts once (the peer joins), then joins
  once (the peer hosts). This covers both accepting incoming sessions and connecting out.
- **D-06:** The peer is on the **same LAN, and any connection path is accepted.** A relayed (SDR)
  join is not required. The trace or evidence must record whether each join was direct or
  relayed. `InitRelayNetworkAccess()` still has to be served correctly, but it does not have to be
  proven live on a relayed path.

### Wiring breadth (TCP shim mode)
- **D-07:** Wire **the interface versions the test titles import, plus the current SDK version of
  each in-scope family** (matchmaking, matchmaking servers, networking, and NetworkingSockets/Utils/
  Messages), so that modern titles get coverage. Older versions stay `mode: 'stub'` until a title
  needs them (the D-53-09 pattern). The `meta/sdk/wire-policy.json` and `shimCoverage.ts` served
  tables change to match.
- **D-08 (evidence bar):** a session counts as joined and played only with all three of:
  1. **A game-originated join callback in the bridge trace:** `LobbyEnter_t`, or
     `SteamNetConnectionStatusChangedCallback_t` reaching the connected state, whichever the title
     uses.
  2. **At least one game-originated send and one game-originated receive** on the networking
     interface, in the trace.
  3. **The operator confirms** that both players are in the same world and can see each other
     move.

  Helper-originated calls never count, and neither does Mac Steam's In-Game status
  (D-53-13 / D-56-16). In DRM mode the trace comes from GameLib's `lsteamclient` (`role=game`).
- **D-09:** The baseline is the roadmap's family list. **Other families come in only when a chosen
  test title is measured calling them on its host or join path.** Examples:
  - `ISteamFriends` invite and overlay calls (`ActivateGameOverlayInviteDialog`,
    `GameLobbyJoinRequested_t`, rich presence `connect`);
  - `SteamGameServer*` for listen-server hosting.

  Nothing beyond the roadmap list is wired speculatively.
- **D-10:** `SteamGameServer*` families are wired **only if a test title hosts through them.**
  The D-09 rule applies to them like any other family.
- **D-11:** **Prefer 64-bit titles.** Do x86 shim work only if no suitable free x64 title exists.
  x86 callback dispatch has still not run live (Phase 55), and modern-SDK parity on x86 stays
  deferred (D-53-09).

### User-facing behaviour
- **D-12:** A known-bad `p2p-required` entry (Hoard 63000 today) is dropped **only for a title
  whose own multiplayer has been live-verified** to the D-08 bar. Other entries keep their notice.
  The category itself stays.
- **D-13:** The D-51-02 one-time "stubbed interface" notice is **unchanged.** It still fires for
  any version that is still stubbed. Wired versions simply stop triggering it, and the copy is not
  made multiplayer-specific.

### Carried forward (not re-asked)
- Strict bridge-verified criterion (D-53-13, D-56-15/16): only game-originated calls count.
- No reroute to bottled Steam (memory: bottled Steam is a narrow fallback).
- Live gates are operator-run on the Mac. The gate's author is not its runner (56-15 / 56-16
  split). Restart `tauri dev` before live runs, because it does not rebuild the sidecar.

### Operator approvals after research (2026-10-30)
- **D-14 (D-02 outcome):** TCP-mode test title is **Schedule I: Free Sample (3205720)**. Its
  `.bind`, architecture, imports and networking stack are unmeasured at research time; plan 58-01
  measures them after the operator installs it. If it turns out SteamStub-wrapped, x86, or not on
  Steam networking, fall back to Shift At Midnight Multiplayer Demo (4050060).
- **D-15 (D-03 outcome):** DRM-mode test title is **Raft (648800)**; the second account buys a copy.
- **D-16 (D-12 outcome):** `bridge-allowlist.json` already has `knownBad: []` (Hoard lifted in
  quick 261026-ous, `90ebe6db7`), so D-12 is a **no-op**. Plans record it; no task removes an
  entry. The `p2p-required` category stays.

### Claude's Discretion
- The trace format for join callbacks, peer send/receive and the direct-vs-relayed marker, in both
  modes. It must be greppable by `meta/bridgeCensus.ts` (`classifyBridgeEvidence`) and carry
  `role=game|helper`.
- How call results (`LobbyCreated_t`, `LobbyMatchList_t`) and broadcast callbacks
  (`LobbyEnter_t`, `LobbyChatUpdate_t`, `LobbyDataUpdate_t`, `P2PSessionRequest_t`,
  `SteamNetConnectionStatusChangedCallback_t`) map onto the k51 / Phase 55 delivery mechanism.
- How networking payload buffers (`SendP2PPacket` / `ReadP2PPacket`, `SendMessageToConnection`,
  `ReceiveMessagesOnConnection` and `SteamNetworkingMessage_t` ownership/`Release`) cross the TCP
  wire.
- Whether 56-02's `serialized005.patch` is needed, decided by what the DRM-mode test title does
  live.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and lifted rule
- `.planning/ROADMAP.md` §Phase 58: the goal, both modes, and the open questions answered here.
- `.planning/milestones/v0.7-phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-SPEC.md`:
  the original "P2P join out of scope" rule, which this phase lifts.

### Prior phase decisions this builds on
- `.planning/phases/51-widen-the-native-steam-bridge-more-interface-proxies-and-sca/51-CONTEXT.md`:
  D-51-02 stub notice, 51-14 sub-decision 1 (matchmaking/networking as stubs), D-51-08 known-bad
  categories.
- `.planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-CONTEXT.md`:
  D-53-09 (x86 parity deferred) and D-53-13 (per-engine evidence plus bridge trace).
- `.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-CONTEXT.md`:
  DRM mode, D-15 to D-17 evidence in that mode, `role=game|helper` trace lines.
- `.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-02-SUMMARY.md`
  and `56-RESEARCH.md`: the omitted `serialized005.patch`.
- `.planning/phases/56-bridge-steamclient-layer-drm-mode-for-steamstub-titles/56-15-LIVE-GATE.md`
  item 10: the networking lead, with no signal in single-player runs.

### Callback delivery precedent
- `.planning/quick/261027-k51-forward-userstatsreceived-t-1101-from-he/`: helper-to-shim
  forwarding of a callback (`UserStatsReceived_t`), the pattern for this phase's lobby and
  networking callbacks.
- Phase 55 (STATE.md entry): manual dispatch, CONTROL slot 6, MSVC `Run(void*)` slot.

### Project skills
- `Skill("spike-findings-gamelib")`: macOS native Steam bridge patterns.
- `Skill("gamelib-conventions")`: fake-HOME isolation, the sidecar exit contract, UAT item shape,
  and the `<verify>` prettier rule.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/bridge/shimCoverage.ts`: the served-version tables
  (`SHIM_SERVED_INTERFACE_VERSIONS`, `SHIM64_SERVED_INTERFACE_VERSIONS`). `SteamMatchMaking009`,
  `SteamMatchMakingServers002` and `SteamNetworking005` are `mode: 'stub'` today, and there is no
  NetworkingSockets entry. Flat stub exports such as `SteamAPI_SteamMatchMaking_v009` live here too.
- `meta/sdk/isteammatchmaking009`, `isteammatchmakingservers002`, `isteamnetworking005/006`,
  `isteamgameserver012/014/015` `.manifest.json` and `meta/sdk/wire-policy.json`: the per-version
  manifests and the stub/wire policy. There are no NetworkingSockets/Utils/Messages manifests yet.
- `meta/gen_vtables.ts` and `meta/buildSteamBridgeShims.ts`: the shim generator, including
  `GAMESERVER_FLAT_STUBS`. `extractProtonInventory.ts` supplies Proton bodies (51-14).
- `src/backend/storeManagers/steam/bridge/importScan.ts` / `interfaceVersions.ts`: per-title
  imported-version scan, used for D-02 candidate measurement.
- `src/backend/storeManagers/steam/bridge/peSteamDrm.ts`: `.bind` detection, which decides the
  mode for D-02.
- `meta/bridgeCensus.ts` (`classifyBridgeEvidence`) and `bridge/bridgeVerdict.ts`: the strict
  evidence classifier that D-08 trace lines must feed.
- `bridge/bridgeRoute.ts` and the `p2p-required` known-bad display (`SteamBridgeRouteNotice.ts`,
  `steamBridgeRouteLine.ts`, `bridgeRouteDisplay.ts`): the D-12 entry removal touches these only
  through data.

### Established Patterns
- `SHIM_EXPORT_SET_VERSION` bumps when the export set changes (D-20 precedent).
- `isScanVerdictNowCovered` decides whether a previously stubbed title is now covered.
- Callbacks are queued in the helper and served to the shim's `RunCallbacks` (Phase 55, k51).

### Integration Points
- The helper (`native/steam-bridge/helper`) gains the real `libsteam_api.dylib` calls. The shim
  (`native/steam-bridge/shim`, generated) gains the wire stubs.
- DRM mode: `native/steam-bridge/steamclient-layer` (`lsteamclient`) trace points for D-08.

</code_context>

<specifics>
## Specific Ideas

- The operator is setting up a second Steam account specifically for this phase. That account
  runs on a Windows/Linux PC on the same LAN.
- Raft 648800 is the natural paid fallback for D-03, because it is small-group co-op and already
  verified in DRM mode.

</specifics>

<deferred>
## Deferred Ideas

- A Mac-to-Mac pair with both sides through the bridge (not chosen for D-04).
- Proving a relayed (SDR) join live by forcing the relay path (D-06 accepts any path).
- Wiring every SDK version of the matchmaking and networking families, or the `SteamGameServer*`
  families, without a measured need (D-07, D-10).
- A multiplayer-specific wording for the stub notice (D-13).
- x86 multiplayer (D-11), unless no free x64 candidate exists.

### Reviewed Todos (not folded)
- `2026-10-25-x86-shim-modern-sdk-and-flat-api-parity-deferred.md`: stays deferred (D-11).
- `2026-10-28-steamclient-wire-policy-unreachable-after-phase-56.md`: about the SteamClient
  wire policy, not multiplayer.
- The other keyword matches (Phase 21 UAT, Windows signing, blank packaged app, install routing,
  optionaldlc) are unrelated.

</deferred>

---

*Phase: 58-steam-bridge-multiplayer*
*Context gathered: 2026-10-30*
