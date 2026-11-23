# Phase 89: Steam library state - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-24
**Phase:** 89-steam-library-state
**Areas discussed:** TS readers until Phase 90, Phase 80 open warnings, Stale write-back rules, macOS live gate items

---

## TS readers until Phase 90

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only mirror | Rust is the only writer; the sidecar holds a read-only copy pushed by Rust; TS writes become async shims; the mirror is deleted in 90 | ✓ |
| Async shims everywhere | No TS copy; every read is a rustInvoke; getGameInfo and other sync callers go async | |
| Pull readers into 89 | Port bridgeInstallState, the macArch apply, resumeBreadcrumbs and the gameUninstall state parts too | |

| Option | Description | Selected |
|--------|-------------|----------|
| Write returns new state | The shim resolves after Rust has applied the change and the mirror holds it | ✓ |
| Eventually consistent | Fire-and-forget; the mirror catches up later | |
| You decide | | |

Owned state (multi-select): Library map + store ✓, Game-session maps ✓, Update-state cache ✓, Breadcrumbs + Mac arch ✓

| Option | Description | Selected |
|--------|-------------|----------|
| Rust state, TS prompt | Rust writes the verdict and emits an event; the i386 prompt and reinstall stay TS until 90 | ✓ |
| All of it in Rust now | Rust raises the prompt and calls install through a reverse shim | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stays TS until 90 | The metadata-fetch limiter belongs to the fetch path in games.ts | ✓ |
| Moves in 89 | Rust owns the limiter; TS acquires a slot through a shim | |

---

## Phase 80 open warnings

Finding presented: A-WR-01 was fixed in `c4a444479` and A-WR-02 in `4a4100057`, both after the re-review was written, each with a test. The TS bottle path is guarded by C/EXTRA-01. The poison cap was never added.

| Option | Description | Selected |
|--------|-------------|----------|
| Verify, then close | Check the full review case list, add missing cases as tests, then amend the ROADMAP flag and the 80 ledger | ✓ |
| Treat as closed now | Amend on the strength of the commits | |
| Re-review the crate | A fresh code review of gamelib-steampoll first | |

| Option | Description | Selected |
|--------|-------------|----------|
| Bound + log once | Truncate bounded fields; log once per (appId, kind) and drop; the next tick re-derives | ✓ |
| Retry with a cap | An in-process retry of N attempts, then drop | |

| Option | Description | Selected |
|--------|-------------|----------|
| Todos, not 89 | File each surviving Info finding as a todo | ✓ |
| Fix in 89, own plan | A separate fix plan before the port | |
| Only IN-03 in 89 | IN-03 belongs to SC3; the rest become todos | |

---

## Stale write-back rules

| Option | Description | Selected |
|--------|-------------|----------|
| Field ownership | One writer class per field group; Refresh merges only its own fields into the current entry | ✓ |
| Per-entry version check | Compare-and-swap on an entry version, with retry | |
| Single actor, last write wins | Serialized writes; does not stop a stale snapshot | |

| Option | Description | Selected |
|--------|-------------|----------|
| Run tokens | A status from a token that is no longer current is dropped; forward-only within a run | ✓ |
| Forward-only per game | A transition table only | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Coalesced atomic write | A ~250–500 ms window, atomic, flushed at exit inside the budget | ✓ |
| Write on every change | One atomic write per mutation | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Show store, reconcile after | Serve the persisted store, then a bounded ACF reconcile pushes corrections | ✓ |
| Reconcile before first read | Block the first read on the scan | |
| Same as TS today | Copy the TS boot order exactly | |

---

## macOS live gate items

Items (multi-select): Install → launch → uninstall ✗, Update badge + update ✓, Refresh during install ✓, Upgrade + crash survival ✓

| Option | Description | Selected |
|--------|-------------|----------|
| Native + one Mac Steam | One Mac Steam-managed title; the bridge is pinned by goldens | ✓ |
| All three kinds | Native, Mac Steam and a bridge-bottle game | |
| Native only | | |

Follow-up on the SC3 install and launch arms:

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into kept items | The Refresh-during-install item finishes the install and launches once; uninstall is proven by goldens plus Phase 90's gate | ✓ |
| Goldens + CI only | | |
| Add it back | | |

---

## Claude's Discretion

- Crate layout (`gamelib-steamlib` vs modules in `gamelib-steampoll`), the actor shape, op names
- The mirror's push granularity and frame format
- The coalescing window and the reconcile bound inside the decided limits
- Sub-slice order

## Deferred Ideas

- Live uninstall proof → Phase 90; live bridge-bottle proof → 95–97
- Surviving Phase 80 Info findings → todos
- 20 keyword-matched todos reviewed, none folded (listed in CONTEXT `<deferred>`)
