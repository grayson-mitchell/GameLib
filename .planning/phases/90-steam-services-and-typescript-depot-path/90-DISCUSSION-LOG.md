# Phase 90: Steam services and TypeScript depot path - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-24
**Phase:** 90-steam-services-and-typescript-depot-path
**Areas discussed:** Phase shape, Bridge seam, Shared-redist code, Live gate items

---

## Todos

| Option                 | Description                                                      | Selected |
| ---------------------- | ---------------------------------------------------------------- | -------- |
| Fold none              | None of the 20 generic-keyword matches is a Phase 90 port        | ✓        |
| Fold the SIGKILL todo  | Also prove Steam launches survive a GameLib SIGKILL              |          |

## Phase shape

| Option               | Description                                                                 | Selected |
| -------------------- | --------------------------------------------------------------------------- | -------- |
| Split into 3         | 90 session/sign-in/redeem; 90.1 install/update/uninstall/depot; 90.2 launch/adoption/games.ts | ✓ |
| One phase, sub-slices | One roadmap entry, about 60+ plans, one gate                               |          |
| Split into 2         | Session+install+depot, then launch+adoption                                 |          |

| Order                       | Selected |
| --------------------------- | -------- |
| Session → install → launch  | ✓        |
| Session → launch → install  |          |

| Gates                                 | Selected |
| ------------------------------------- | -------- |
| Each sub-phase its own signed gate    |          |
| Goldens only, then one final gate     | ✓        |

| Record                                  | Selected |
| --------------------------------------- | -------- |
| One CONTEXT, roadmap amended now        | ✓        |
| One CONTEXT, roadmap later              |          |
| Separate discuss per sub-phase          |          |

## Bridge seam

| Option                          | Description                                                                 | Selected |
| ------------------------------- | --------------------------------------------------------------------------- | -------- |
| Thin TS router until 97         | Router asks Rust for the route; bridge TS or Rust shims; SteamGameHandle    | ✓        |
| Rust routes, calls bridge TS back | Native entry for all; a Rust→TS operation channel                         |          |
| Keep games.ts until 97          | Amend SC4                                                                   |          |

| Route verdict              | Selected |
| -------------------------- | -------- |
| Rust, ported in 90         | ✓        |
| TS until the bridge ports  |          |

| Entry for non-bridge ops     | Selected |
| ---------------------------- | -------- |
| Native channels              | ✓        |
| Everything through the router |         |

| 89 mirror and shims          | Selected |
| ---------------------------- | -------- |
| Re-schedule per user         | ✓        |
| Keep the mirror whole until 97 |        |

## Shared-redist code

| Option                          | Selected |
| ------------------------------- | -------- |
| Port the download, move the lock | ✓       |
| Move both to bridge/ for 95     |          |

## Live gate items

| Redeem                                   | Selected |
| ---------------------------------------- | -------- |
| Real key if spare, else error paths      |          |
| Error paths only                         | ✓        |
| Real key required                        |          |

| Sign-in                          | Selected |
| -------------------------------- | -------- |
| QR, then credentials + Guard     | ✓        |
| Upgrade survival plus one sign-in |         |

**Gate items (free text):** "these are the same tests as 89, prefer to do here rather than 89...
remove choices from 89 and move to 90." Confirmed: 89 becomes goldens-only (89-CONTEXT D-14/D-15
amended), and the single 90.2 gate runs six merged items on a signed 90.2 build over a signed 88
build.

## Claude's Discretion

Crate layout, the in-process `JobHost` replacement, the `SteamGameHandle` shape and router
location, plan/wave breakdown, and the wording of the 90.1/90.2 roadmap SCs.

## Deferred Ideas

Live redeem success (never spends a key); bridge router branches and bridge-used mirror rows to
95–97; the shared-redist lock and install to 95; copied quirks to todos.
