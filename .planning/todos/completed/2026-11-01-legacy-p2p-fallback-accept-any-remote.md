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

## Result

Fixed in quick-261101-iah (code commit 2238d27c6), helper only; no shim or generator change.

- The remote is now recorded per 1202 at slot-6 serve time into a FIFO, and each validated slot-10 1202 report pops exactly one entry, so every report accepts the remote of the 1202 it reports. The pump-time last-remote capture is gone.
- A fallback accept happens only if the remote is a peer the game sent a SendP2PPacket to, or a live member of a lobby the game entered (LobbyEnter response 1, membership checked live so a left lobby fails closed). Anything else is refused with a fixed-string log.
- Every bounded table fails closed: the sent-to ring (64) and lobby ring (4) evict oldest (an evicted peer is refused), served-FIFO overflow (32) is skipped in step so later reports still pair exactly. The accept-once table is removed: with one report per 1202 there is nothing to dedupe, a fresh 1202 means Steam has no session with that peer so a real listener would accept again, and after the allowlist it is not a security gate.
- Residual risk: a lost slot-10 report or two shim threads running callbacks concurrently can pair a report with an adjacent served 1202. The allowlist bounds the consequence to accepting a peer the game already sends to or shares a lobby with, never a stranger.
- Verification is harness-only (p2pfb-order, -stranger, -lobby, -listener, -empty, -reaccept, -sent-evict, -overflow, -strangers-flood), because no legacy-TCP-mode title is under live test.

The "Risk accepted" attack surface above is closed in code. M-03 stays "verified with caveats" because the legacy fallback is not live-verified.
