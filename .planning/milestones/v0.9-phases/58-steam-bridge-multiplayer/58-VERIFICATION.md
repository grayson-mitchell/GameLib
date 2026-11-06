---
phase: 58-steam-bridge-multiplayer
verified: 2026-11-01T00:00:00Z
status: passed
score: 7/7 requirements met (caveats recorded)
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/7
  gaps_closed:
    - "M-01 TCP mode Direction A (Mac hosts): 58-34 re-gate Verdict PASS, host=1"
    - "M-05 CR-01 self-initialised iface: fixed at bridge_helper.c:1145 (now : GL_NET_IFACE_SOCKETS); CR-01 recv re-check in 58-33 item 3: Sockets recv 9, Messages recv 0"
    - "CR-02 oversize legacy packet (commit 78b4c0b7c)"
    - "steamclientLayerNotice.test.ts: now 35/35 passing"
  gaps_remaining: []
  regressions: []
gaps: []
follow_ups:
  - "WR-01 (58-REVIEW): picker trigger rides on a log line capped at 16 per helper process; after 16 '+' presses the picker never opens. Not goal-blocking (live gate used 8 presses). File as todo."
  - "WR-02..WR-05, IN-01/02 from 58-REVIEW (connection-slot exhaustion, blocking send, friend ordinal reassignment, unanchored INVITE regex)."
  - "Todo 2026-11-01-callback-1298-on-bridge-join-path (D-09 unlisted callback 1298)."
  - "58-33 item 2(e) passed only under an operator amendment (main-menu '+' refuses cleanly with INVITE refused reason=no-pending); would be 'issue' under the original criterion. Item 3 path=unknown (lsof showed no remote endpoint)."
human_verification: []
---

# Phase 58: Steam bridge multiplayer - Verification Report

**Phase Goal:** A Steam multiplayer title run through the macOS native bridge can host, find and join an online session with a second Steam account, in TCP shim mode and DRM mode. Done when, on this Mac, one TCP-mode title and one DRM-mode title each host a session that a second account joins and plays in, with the join visible in the bridge trace.
**Status:** passed. **Re-verification:** yes (gap plans 58-25..58-37 executed).

## Done-when, per mode

| Mode | Title | Requirement of done-when | Live evidence | Result |
|------|-------|--------------------------|---------------|--------|
| TCP shim | Schedule I (3205720) | Mac hosts, second account joins and plays; join visible in trace | 58-33-LIVE-GATE Verdict PASS (58-34). Launch 1 (Mac hosts): game-originated `AcceptConnection` + `NET role=game kind=join iface=Sockets cb=1221` after `INVITE sent`, role=game send/recv Sockets n>0, operator "same world, both saw movement", census `verified join=1 send=1 recv=1 path=relayed oversize=0 host=1 client=0`. Launch 2 (separate launch, PC hosts, Mac joins): `CBDISP 333 targets=1 held=0`, JoinLobby, cb=504, ConnectP2P, cb=1221, send 9 / recv 9 Sockets, census `verified ... client=1`. | MET |
| DRM (lsteamclient) | Raft (648800) | Mac hosts, second account joins and plays; join in trace | 58-08-LIVE-GATE Verdict PASS (58-09), operator Approve. Launch 1 Mac host: trace `id=1202 peer=1`, accept ok=1, read/send, census `verified join=1 send=1 recv=1`; launch 2 PC hosts, Mac joins, send/read N>0, mutual movement. | MET |

Caveats on the TCP half: 2(e) (menu-press refuses cleanly) scored pass only under an operator amendment recorded in 58-33-LIVE-GATE.md; path field `unknown` for Direction B (relayed for Direction A). The contract's cb=1221/ConnectP2P ordering was a contract-text error, recorded. Neither blocks the roadmap done-when, which concerns host + join + play + trace visibility.

## Requirements

| ID | Status | Evidence |
|----|--------|----------|
| M-01 TCP title passes D-08 both directions | MET | 58-34 re-gate PASS: Direction A host=1 (separate launch), Direction B client=1 (separate launch). 58-37 proved the invite leg (picker raised 8/8, display=confirmed, PC joined). |
| M-02 DRM title passes D-08 both directions | MET | Raft, 58-08 gate PASS, both directions, p58b component, operator approved. |
| M-03 Matchmaking/Servers/Networking/Sockets/Utils/Messages wired; callbacks and call results | MET (server browser not live-exercised) | Plans 58-12..58-20 summaries; live: Matchmaking009, Sockets013, Utils, Messages, callbacks 333/504/1221/1281 delivered held=0. MatchmakingServers not exercised live (unit tested only); not required by done-when. |
| M-04 InitRelayNetworkAccess served; incoming sessions accepted | MET | 1281 delivered; incoming session now accepted in TCP mode (game-originated AcceptConnection, host=1, 58-34) and DRM mode (1202 + accept ok=1). Title itself made 0 InitRelayNetworkAccess calls in 58-22; served path covered by tests. |
| M-05 Greppable role=game|helper evidence with path marker, fed to census | MET | Emitter/classifier ran in both gates; CR-01 fixed (line 1145 verified in source); Sockets-title recv attributed Sockets (9) not Messages (0); census separates host/client per launch. |
| M-06 serialized005 decision from live DRM evidence | MET | 0/0 hits across six Raft captures; decision "not needed". |
| M-07 D-12 only for live-verified titles; D-13 unchanged | MET | Bundled knownBad pinned `[]` (no-op, D-16 pin test); D-13 notice unchanged. Whether Schedule I should now be added as live-verified is a product decision, not required. |

## Spot-checks
- `grep "const int iface =" bridge_helper.c`: single hit, line 1145, correct ternary (CR-01 fixed).
- `npx jest meta/__tests__/steamclientLayerNotice.test.ts`: 35/35 pass (previously 2 failing).
- No TBD/FIXME/XXX in bridge_helper.c.
- Review (58-REVIEW.md): 0 critical, 5 warnings, 2 info.

## WR-01 decision
WR-01 is a follow-up, not a goal gap. The done-when and live gates are satisfied (8 presses in the 58-37 run, 3 in 58-33); the defect only bites after 16 presses in one helper lifetime and is a robustness regression for long sessions. Recommend a fix (separate signal from log cap) before shipping to users, tracked as a todo.

## Anti-patterns
No blockers remaining. Open warnings listed in follow_ups.

---
_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
