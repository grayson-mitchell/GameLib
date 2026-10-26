---
created: 2026-10-26
title: "Bridge helper's callback ring is drainable by any local process and outlives the connection that queued it (Phase 55 WR-03)"
source: 55-REVIEW.md WR-03, skipped in 55-REVIEW-FIX.md
area: steam-bridge
files:
  - native/steam-bridge/helper/bridge_helper.c
  - native/steam-bridge/helper/gamelib_cbqueue.h
  - meta/gen_vtables.ts
  - src/backend/storeManagers/steam/bridge/protocol.ts
severity: medium
platform: macos
ready: human
---

## Problem

The helper's callback ring (`g_cbq`, `gamelib_cbqueue.h`) holds the
`GetTicketForWebApiResponse_t` (callback 168) that Phase 55 delivers to the game. That payload is
a Steam web-API auth ticket, so it is a credential.

- The loopback listener has no authentication. Its only guard is `SO_RCVTIMEO`, with no token or
  nonce. Any local process that connects can send CONTROL slot 6 (DRAIN) and pop a queued ticket.
- The ring is never cleared when a connection is accepted or closed. A ticket produced on one
  connection can be delivered to the next.
- The ring is never zeroed at exit. That part has no effect: the accept loop is `for (;;)` and the
  helper is only ever stopped by a signal.

Review references (lines as of the review): `bridge_helper.c:694-719` (DRAIN), accept loop
`bridge_helper.c:922`, `gamelib_cbqueue.h:97`.

## Why the review's quick fix was rejected

The review suggested clearing the ring (with a secure zero) on every accept and every close. That
would cause the very failure Phase 55 fixed. The helper's 5 s `SO_RCVTIMEO` closes idle
connections, and the shim reconnects on its own after any transport failure. Since WR-02
(`46767cfdc`) that includes an oversized reply. So the "next connection" is almost always the same
game, and clearing on reconnect can throw away the ticket it is waiting for.

## Solution

Bind the ring to an authenticated launch instead of to a socket:

1. GameLib generates a per-launch secret and passes it to both the helper (argv or env) and the
   shim (the env the game is launched with).
2. HELLO carries the secret. The helper refuses CONTROL and interface dispatch on a connection
   whose HELLO did not match.
3. A matching reconnect keeps the ring. A failed or missing HELLO never sees it.

This is a protocol change on both sides: the generator-emitted shim in `meta/gen_vtables.ts` and
the helper. `protocol.ts` only needs to change if the secret goes into the wire layout.

Decisions for the operator before code:

- Where the secret travels (env vs argv vs a file with 0600 permissions), and whether it may be
  seen in `ps` output.
- Whether hardening a loopback credential is worth a protocol bump now, or whether a local
  attacker is out of scope for the bridge.

Verifying it needs a live run on this Mac with a game that calls GetAuthTicketForWebApi
(Phase 55's live-gate titles). It must show the ticket still arrives across an idle reconnect, and
that a second, unauthenticated client gets nothing.

## Resolution

Closed by quick `261027-9vr` (2026-10-27), on the operator's decisions: harden now; the threat model is
other OS users and processes that cannot read the user's files (a same-user attacker can read the cfg
and the stored Steam refresh token, and is out of reach). The secret travels as `GAMELIB_BRIDGE_SECRET`
in the helper's env (never argv) and as `secret=` in a 0600 `gamelib_bridge.cfg` for the shim. HELLO
carries it; the helper answers only HEALTH and HELLO until a constant-time match, so DRAIN never sees
the ring unauthenticated. The ring is not cleared on accept or close, and a re-authenticated reconnect
keeps it. Commits `bad35fc50`, `36f015607`, `26d37a064`, `50c3024cc`.

The live check is not done yet. It is filed as
`2026-10-27-bridge-hello-secret-live-gate-on-a-phase-55-ticket-title.md`.
