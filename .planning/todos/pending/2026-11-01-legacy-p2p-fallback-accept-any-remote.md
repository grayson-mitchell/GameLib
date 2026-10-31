---
created: 2026-11-01
title: 'Legacy P2P fallback accepts any remote, and the latest 1202 rather than the reported one (WR-07)'
area: steam-bridge
files: native/steam-bridge/helper/bridge_helper.c:1385-1396,1523-1526,2274
severity: major
platform: any
ready: code
---

58-REVIEW WR-07: `gl_p2p_fallback_accept` accepts `g_p2p_last_remote`, the most recent 1202 the pump saw, not the remote in the 1202 being reported. With two 1202s in flight the first peer is never accepted. When the game has no 1202 listener the helper accepts a session from any Steam user who sends one, so arbitrary peers can push packets into a non-listening game's `ReadP2PPacket`. Once 16 remotes are recorded the dedupe stops and every later 1202 is re-accepted.

Deferred in 58-27. The correct fix limits fallback accepts to peers the game has sent to, or current lobby members, with a per-1202 FIFO. That changes accept semantics for legacy TCP-mode titles, and none is under live test in this phase (Schedule I uses Sockets; Raft runs in DRM mode through the genuine client).

Risk accepted until then: the widened attack surface described above (any Steam user can push packets into a non-listening game). M-03 remains "verified with caveats" while WR-07 is open: the legacy-P2P fallback path is not verified for peer restriction, and M-03 must not be promoted to plain verified until this todo closes.
