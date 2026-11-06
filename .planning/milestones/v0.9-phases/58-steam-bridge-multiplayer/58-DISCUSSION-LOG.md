# Phase 58: Steam bridge multiplayer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-30
**Phase:** 58-steam-bridge-multiplayer
**Areas discussed:** Test titles, Second account / peer, Wiring breadth, Done-when & UX

---

## Test titles

The first question offered owned titles (Raft / Grim Dawn / Ranch Simulator for DRM mode,
Hoard / Abiotic Factor for TCP mode). The operator stopped it to say: "I will create another steam
account to test, so want to use demo titles."

| Option | Description | Selected |
|--------|-------------|----------|
| Demos and free-to-play | Larger pool; F2P anti-cheat titles still excluded | ✓ |
| Demos only | Strictly demos | |

| Option | Description | Selected |
|--------|-------------|----------|
| Research proposes, I approve | Shortlist with `.bind`, arch, imports, networking path | ✓ |
| I have titles in mind | Operator names them | |

| Option | Description | Selected |
|--------|-------------|----------|
| Buy a second copy of a Phase 56 title | Also lifts limited-account status | ✓ |
| Defer the DRM-mode half | Close on TCP mode only | |
| Ask me then | Decide after research | |

**User's choice:** free titles (demos + F2P), research shortlist, paid Phase 56 fallback for DRM mode.

---

## Second account / peer

| Option | Description | Selected |
|--------|-------------|----------|
| Windows/Linux PC, real Steam | Known-good peer | ✓ |
| A second Mac through GameLib | Bridge on both ends | |
| Same Mac, second macOS user | Two Mac Steam sessions | |
| A VM on this Mac | Windows VM peer | |

| Option | Description | Selected |
|--------|-------------|----------|
| Both: host once, join once | Covers accept and connect-out | ✓ |
| Host only | Literal roadmap done-when | |
| Join only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same LAN, accept whatever path | Trace records direct vs relayed | ✓ |
| Same LAN, force relay once | Prove the SDR path | |
| Different networks | Natural NAT/relay | |

---

## Wiring breadth

| Option | Description | Selected |
|--------|-------------|----------|
| Test-title imports + current SDK | Older versions stay stubs | ✓ |
| Only what the test titles import | Smallest surface | |
| Every known version | Broadest, mostly unexercised | |

Families (multi-select): the operator ticked "None beyond the roadmap", "Only if a test title needs
it" and "SteamGameServer* families". Claude flagged the conflict. The follow-up on GameServer
families got "Only if a test title needs it", so the resolved rule is: roadmap baseline plus
measured need.

| Option | Description | Selected |
|--------|-------------|----------|
| Prefer 64-bit; x86 only if forced | | ✓ |
| x64 only | | |
| Both architectures | | |

---

## Done-when & UX

| Option | Description | Selected |
|--------|-------------|----------|
| Trace + peer data + operator | Join callback, a send and a receive, operator sees both players | ✓ |
| Trace callback + operator | | |
| Operator observation only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Drop `p2p-required` only for live-proven titles | | ✓ |
| Retire `p2p-required` entirely | | |
| Leave known-bad alone | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep stub notice as is | | ✓ |
| Name multiplayer specifically | | |

---

## Claude's Discretion

- Trace line format for join, send/receive and direct-vs-relayed in both modes.
- How lobby and networking callbacks map onto the k51 / Phase 55 delivery mechanism.
- How payload buffers and `SteamNetworkingMessage_t` ownership cross the TCP wire.
- Whether `serialized005.patch` is needed, decided by live behaviour.

## Deferred Ideas

- Mac-to-Mac bridge pair; forced-relay proof; speculative wiring of all versions or GameServer
  families; multiplayer-specific stub notice copy; x86 multiplayer unless forced.
