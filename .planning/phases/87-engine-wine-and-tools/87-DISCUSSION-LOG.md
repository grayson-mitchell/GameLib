# Phase 87: Engine, Wine and tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 87-engine-wine-and-tools
**Areas discussed:** Where 87 ends, Rollback window, Parity oracle, Live gate on real engines

---

## Where 87 ends

| Option | Description | Selected |
|--------|-------------|----------|
| 87, called by TS | Launch-step engine code ports in 87; launcher.ts and gog/nile setup.ts call it through a shim until 88 | ✓ |
| 88, with the launcher | 87 ports decision/bottles/downloads/tools; launch-time orchestration ports with launcher.ts | |
| Split | Decision/preflight/fallback in 87; deadline, process watch, dialogs with 88 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Port now, shim the bridge | Rust owns bridge-used engine modules; bridge calls typed shims scheduled for 95–97; research counts sync call sites | ✓ |
| Generic in 87, bridge-only later | engineSwitch, runTool, bridge-only primitives stay TS until 96 (roadmap amendment) | |
| Port now, leave a TS copy for the bridge | Two implementations; violates no-dual-path | |

| Option | Description | Selected |
|--------|-------------|----------|
| gamelib-engine + gamelib-wine | Two crates, one-way dependency | ✓ |
| One gamelib-engine crate | Single crate like gamelib-info | |
| You decide | Research picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Move to 88 | pci_ids rows move with their only consumer, launcher.ts | ✓ |
| Port in 87 | Keep ownership table as written | |

**User's choice:** all recommended options.

---

## Rollback window

| Option | Description | Selected |
|--------|-------------|----------|
| No flag, delete once proven | Same as 86 D-13 | ✓ |
| GAMELIB_ENGINE flag, window inside 87 | Build the 83 D-05 helper; TS selectable until the live gate | |
| Flag window runs into 88 | TS path kept until 88 goldens pass (roadmap amendment) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Byte-compatible, StoreHost version gate | Same files byte for byte; never overwrite newer markers; corrupt kept | ✓ |
| You decide | Research recommends | |

| Option | Description | Selected |
|--------|-------------|----------|
| On goldens, as in 86 | Delete each sub-slice's TS once its goldens pass; live gate at the end | ✓ |
| After an early live checkpoint | Mid-phase operator check before deleting engine TS | |

**User's choice:** all recommended options.

---

## Parity oracle

| Option | Description | Selected |
|--------|-------------|----------|
| TS goldens + selected Rust tests | Scenario-matrix goldens (decisions, fake-HOME trees, spawn traces, replayed HTTP) plus incident tests ported to Rust | ✓ |
| Port the TS tests as Rust tests | 1:1 translation | |
| Goldens only | No hand-ported Rust tests | |

| Option | Description | Selected |
|--------|-------------|----------|
| Research only, no new spike | Work from spikes 059/060/068 and Phase 59/61 records | ✓ |
| Spike first | Record real CrossOver/Staging traces before planning | |
| You decide | Research decides | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same events, renderer untouched | Same names/payloads; sequence pinned, cadence tolerant | ✓ |
| Exact cadence too | Also pin progress frequency | |
| Reshape freely | Change payloads with renderer updates | |

**User's choice:** all recommended options.

---

## Live gate on real engines

| Option | Description | Selected |
|--------|-------------|----------|
| CrossOver healthy + no-CrossOver fallback | SC1 with non-Steam and bridge titles | ✓ |
| Expired trial → Staging | nolicence.sb + backdate.py | ✓ |
| Bottles: reuse and sibling-safe removal | SC2 | ✓ |
| Tools and downloads | SC3 | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Signed 87 over signed 86 | Proves upgrade and signed-app spawns | ✓ |
| pnpm tauri:dev is enough | Faster; no upgrade proof | |

**User's choice:** all four items; signed upgrade build.

---

## Claude's Discretion

- Sub-slice port order, module layout, op names, channel shapes, fixture format, and per-call-site sync vs async for bridge shims.

## Deferred Ideas

- GPU system info → Phase 88. Linux live check of wine-manager/runtimes downloads → Phase 99. Copied quirks → todos.
