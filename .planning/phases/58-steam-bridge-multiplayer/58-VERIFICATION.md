---
phase: 58-steam-bridge-multiplayer
verified: 2026-11-01T00:00:00Z
status: gaps_found
score: 4/7 requirements verified (M-02, M-04 partial-live, M-05, M-06 verified; M-03 verified by tests+live Direction B; M-01 failed; M-07 verified as no-op)
overrides_applied: 0
gaps:
  - truth: "M-01 / roadmap done-when: a TCP-mode title (Schedule I) hosts a session a second account joins and plays in, both directions (D-05), join visible in bridge trace"
    status: failed
    reason: "58-22-LIVE-GATE Verdict FAIL. Direction A (Mac hosts, PC joins): A1 game '+' box no visible effect, A2 Mac Steam 'Invite to Game' missing, A3 PC 'Join Game' missing. No peer ever entered the Mac's lobby; no 1202/AcceptConnection observed (item 4: 0/0). Direction B (PC hosts, Mac joins) passes: 333 relayed (held=0), JoinLobby, ConnectP2P, 12 send / 17 recv role=game, operator saw mutual movement."
    artifacts:
      - path: ".planning/phases/58-steam-bridge-multiplayer/58-22-LIVE-GATE.md"
        issue: "Section 5 gap 1, Verdict: FAIL"
    missing:
      - "An alternative Direction A join path: set rich presence / lobby 'connect' (relay 337 GameRichPresenceJoinRequested_t) so the PC can 'Join Game', or drive the game's own join/code menu; plan so the peer actually reaches the Mac-hosted lobby"
      - "Re-run live gate with Direction A in its own launch and a clean separate Direction B launch"
      - "Evidence that attests direction: census must separate directions (or per-launch logs); raise/segment the NET cap of 32 which was exhausted 5 s into the session"
  - truth: "M-05: greppable role=game NET evidence fed to the census classifier is trustworthy (strict-verified D-08)"
    status: failed
    reason: "CR-01 still present at native/steam-bridge/helper/bridge_helper.c:1070: `const int iface = which == 2 ? GL_NET_IFACE_MESSAGES : iface;` (self-initialised, UB). Sockets recv/oversize NET lines are mislabelled iface=Messages (or dropped). The Schedule I recv evidence ('kind=recv iface=Messages x17') for a Sockets-transport title is therefore plausibly mislabelled; the strict census 'verified' depends on it. The test at helperIntegration.test.ts:2096 pins call text only."
    artifacts:
      - path: "native/steam-bridge/helper/bridge_helper.c"
        issue: "line 1070 self-initialised iface; introduced in 81d9130b4 (58-16)"
    missing:
      - "Fix to `: GL_NET_IFACE_SOCKETS`; add -Werror=uninitialized to buildHelperCompileArgv; host-harness test asserting iface=Sockets for gl_nets_receive(0,...)"
      - "Re-check Schedule I recv attribution after fix (Direction B recv iface)"
  - truth: "Legacy P2P wired path (M-03 SteamNetworking006) does not wedge on large packets"
    status: failed
    reason: "CR-02: ReadP2PPacket returns ret=0 without consuming a packet above the 61440 limit while IsP2PPacketAvailable keeps reporting it; channel stalls or read loop spins. Not hit in the Raft gate (oversize=0) but a latent defect in a wired family."
    artifacts:
      - path: "native/steam-bridge/helper/bridge_helper.c"
        issue: "lines 656-671 oversize packet left at channel head"
    missing:
      - "Consume-and-discard oversize legacy packet (REVIEW fix) plus a test"
  - truth: "Regression gate green for Phase 58 code"
    status: failed
    reason: "meta/__tests__/steamclientLayerNotice.test.ts: 2 tests still expect the Phase 56 asset name; catalogue repinned to -p58b by 58-08/58-09. Confirmed by running the suite (Received URL ends -p58b.tar.gz)."
    artifacts:
      - path: "meta/__tests__/steamclientLayerNotice.test.ts"
        issue: "stale expected URL/asset name"
    missing:
      - "Update the two expectations to the -p58b asset"
  - truth: "Review warnings WR-01..WR-09 (correctness of wired bridge behaviour)"
    status: partial
    reason: "9 open warnings in 58-REVIEW.md, notably WR-06 (32-line NET budget can starve join/recv evidence; observed live in 58-22) and WR-03/04/05/08/09 (server browser pool recycling, handle ring eviction, buffer overwrite, silent drops, 333 never expires). Not goal-blocking individually but WR-06 directly degraded gate evidence."
    artifacts:
      - path: ".planning/phases/58-steam-bridge-multiplayer/58-REVIEW.md"
        issue: "WR-01..WR-09 unresolved"
    missing:
      - "Triage; at minimum fix WR-06 before the re-gate"
human_verification: []
---

# Phase 58: Steam bridge multiplayer Verification Report

**Phase Goal:** A Steam multiplayer title run through the macOS native bridge can host, find and join an online session with a second Steam account, in TCP shim mode and lsteamclient DRM mode. Done when one TCP-mode title and one DRM-mode title each host a session that a second account joins and plays in, with the join visible in the bridge trace.
**Verified:** 2026-11-01
**Status:** gaps_found
**Re-verification:** No (initial)

## Goal Achievement

### Requirements / observable truths

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| M-01 | TCP-mode title passes D-08 in both directions | FAILED | 58-22-LIVE-GATE Verdict FAIL. Direction A unreachable (no invite path); Direction B pass (333 relay, JoinLobby, ConnectP2P, send/recv, mutual movement) but scored from a mixed launch, accepted by operator 2026-11-01. |
| M-02 | DRM-mode title passes D-08 both directions | VERIFIED | 58-08-LIVE-GATE Verdict PASS (Raft 648800): launch 1 Mac host census `verified join=1 send=1 recv=1`, launch 2 PC host Mac joins send/recv N>0, operator confirmed same world both directions; p58b component sums match catalogue. Operator approved. |
| M-03 | Matchmaking/Servers/Networking/Sockets/Utils/Messages wired, callbacks and call results delivered | VERIFIED with caveats | Plans 58-12..58-20 summaries; live Direction B exercised Matchmaking009, Sockets013, Messages, Utils004, callbacks 333/504/1221/1281. Servers (server browser) and Direction A host paths (CreateListenSocketP2P accept, 1202) not exercised live; CR-02 and WR-03/04/05/08 open. |
| M-04 | InitRelayNetworkAccess served, incoming sessions accepted | PARTIAL | 1281 delivered (4x, held=0). InitRelayNetworkAccess call count 0 in the title; incoming-session accept (1202 / AcceptConnection) was 0 in TCP mode (no peer reached the Mac). Raft DRM mode: 1202 + p2p accept ok=1 observed (legacy, genuine steamclient). Incoming accept in TCP mode unproven live. |
| M-05 | Greppable role=game evidence fed to census | FAILED (quality) | Emitter/grammar/classifier exist and ran. CR-01 UB at bridge_helper.c:1070 (verified present) mislabels or drops Sockets recv lines; NET cap (WR-06) exhausted at 19:09:22Z; census cannot separate directions. Raft DRM evidence (separate trace path) is unaffected. |
| M-06 | serialized005 decision from live DRM evidence | VERIFIED | 0 hits of both strings across 6 Raft captures; decision "not needed" recorded in PINS.md (58-24). |
| M-07 | D-12 known-bad change only for live-verified titles; D-13 unchanged | VERIFIED | 58-24: no-op, bundled knownBad pinned `[]`, D-16 pin test; Schedule I not live-verified so no entry is correct. D-13 notice fired for Schedule I via stubbed interfaces as unchanged. |

**Score:** M-02, M-03 (caveated), M-06, M-07 verified; M-01 failed; M-04 partial; M-05 failed on evidence quality.

### Roadmap done-when
- DRM half: MET (Raft).
- TCP half: NOT MET (only one direction proven, via a mixed launch; Direction A never joined). Phase must not be marked done.

### Behavioral spot-checks / anti-patterns

| Check | Result |
|-------|--------|
| `npx jest meta/__tests__/steamclientLayerNotice.test.ts` | 2 failed (stale Phase 56 asset name vs -p58b) - Phase 58 caused |
| grep `const int iface = ... : iface;` in bridge_helper.c | Present at line 1070 (CR-01 unfixed, last touching commits 81d9130b4/8ebdf786c) |
| Other orchestrator regressions (findDeadcode, genI18nGateScope, i18nCatalogChurnGuard, lintTranslations, comparePresenceBaseline) | Not attributed to Phase 58; git status shows uncommitted public/locales/en/gamepage.json from concurrent work. Not independently re-run. |

### Probe execution
No phase-declared probe scripts evaluated; live gates are the declared verification (operator-run). Skipped.

### Anti-patterns
| File | Line | Pattern | Severity |
|------|------|---------|----------|
| native/steam-bridge/helper/bridge_helper.c | 1070 | self-initialised const (UB) | Blocker |
| native/steam-bridge/helper/bridge_helper.c | 656-671 | oversize packet left unconsumed | Blocker (latent) |
| meta/__tests__/steamclientLayerNotice.test.ts | - | stale expectation | Warning |

### Other open items from 58-22 section 5 (non-blocking, for planning)
Unlisted callback 1298 (D-09 follow-up); NET cap hit 5 s into session; ~81 s initial load; PC8/PC9 preflight not confirmed.

### Gaps Summary
DRM mode is genuinely proven. TCP mode is half proven: Schedule I Mac-joins-PC works with real role=game send/recv, but the Mac cannot host a session a peer can join because no invite/Join Game path exists (the game sets no rich presence; 337 is not relayed; Mac Steam shows no invite). Separately, CR-01 undermines confidence in the Sockets recv attribution that the strict-verified criterion relies on, and a stale test fails. Route: `/gsd-plan-phase 58 --gaps`.

---
_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
