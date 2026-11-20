# Phase 83: Native seam, gamelib-core and process/shutdown contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-20
**Phase:** 83-native-seam-gamelib-core-and-process-shutdown-contract
**Areas discussed:** Proof channel(s), Fallback semantics, What counts as orphan, Quit drain + proof

---

## Proof channel(s)

| Option | Description | Selected |
|--------|-------------|----------|
| openExternalUrl + 1 invoke | Send-kind with Rust allow-list, plus getHeroicVersion to prove invoke | ✓ |
| Whole URL-opener group | openExternalUrl + four constant openers, all send-kind | |
| getHeroicVersion only | Smallest proof; leaves send ordering and validation unproven | |

| Option | Description | Selected |
|--------|-------------|----------|
| FIFO per native slice | One ordered queue per slice; no cross native/sidecar ordering; spike checks dependence | ✓ |
| Global FIFO across both | One queue for all sends; freeze risk | |
| You decide after spike | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same marker as today | Reuse `[GAMELIB_IPC_INVALID_CHANNEL]` and string shape | ✓ |
| New typed error | Structured error; two shapes until sidecar gone | |

---

## Fallback semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Routing-only fallback | Unowned channels relay; native never falls back | ✓ |
| Env-flag rollback window | GAMELIB_<SLICE>=ts routes back to sidecar | |
| Runtime error fallback | Retry via sidecar on native error | |

| Option | Description | Selected |
|--------|-------------|----------|
| Gate template only | *PortComplete template now; flag helper when first needed | ✓ |
| Both now | Flag helper with no caller | |
| Neither | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Committed snapshot | Generated channel/kind/owner/schema snapshot; CI fails on drift | ✓ |
| Snapshot + approval note | Plus a reasoned changelog entry | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rust serde struct | deny_unknown_fields struct is authority; zod entry deleted | ✓ |
| TS zod generates Rust | Single TS source plus a generator to retire in 99 | |

---

## What counts as orphan

| Option | Description | Selected |
|--------|-------------|----------|
| The game's whole tree | Game, wine/wineserver, bridge helper, launch wrapper survive | ✓ |
| Game process only | Wrapper/helpers die; could break running games | |

| Option | Description | Selected |
|--------|-------------|----------|
| Killed, resumed later | Helpers; bounded finalize on graceful quit; resume is Phase 93 | ✓ |
| Killed + quit prompt | Adds a confirm dialog | |

| Option | Description | Selected |
|--------|-------------|----------|
| Research picks, I set the bar | No orphan after parent SIGKILL, games excepted, automated test | ✓ |
| Reaper process | Watchdog holding a pipe to the app | |
| Boot-time sweep is enough | Kill survivors at next launch | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, cover them now | TS-sidecar-spawned helpers included in the proof | ✓ |
| Rust-owned children only | TS helpers a known gap closed per slice | |

---

## Quit drain + proof

| Option | Description | Selected |
|--------|-------------|----------|
| One hard cap, ~5 s total | Shared deadline; kill-tree past it; log what remained | ✓ |
| Per-subsystem budgets | Each registrant declares grace | |
| Shorter, ~2 s | Risks depot finalize and steamcm logoff | |

| Option | Description | Selected |
|--------|-------------|----------|
| CI + one macOS live check | Three-OS harness plus Force Quit + ps live gate | ✓ |
| CI only | As Phase 82 | |
| CI + live on all three | Needs Windows/Linux session | |

| Option | Description | Selected |
|--------|-------------|----------|
| Add Rust rule now | CLAUDE.md row + conventions skill; sidecar row stays to 99 | ✓ |
| README only | Crate recipe only | |

---

## Claude's Discretion

- gamelib-core module layout and trait shapes
- Re-homing gamelib-safety into core in this phase
- Hoisting steampoll's Clock/ProcessRunner
- Router table and generated NATIVE_*_CHANNELS placement; snapshot format/location

## Deferred Ideas

- GAMELIB_<SLICE> flag helper (first slice needing a rollback window)
- Quit-during-download prompt (not added)
- Remaining four URL openers to native (later app-shell slice)
