# Phase 75: Steam local file formats in Rust - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-13
**Phase:** 75-steam-local-file-formats-in-rust
**Areas discussed:** How much of steam/library moves, Which VDF consumers are in scope, shortcuts.vdf writer fidelity, Steam path discovery

---

## How much of steam/library moves

| Option | Description | Selected |
|--------|-------------|----------|
| Typed readers + scan | Rust owns parsing and file-level operations; TS keeps the polling and state machines | ✓ |
| Parser seam only | Rust returns a parsed tree; TS keeps field-picking | |
| Move the state machines too | Port about 2.5k lines of polling and policy | |

| Option | Description | Selected |
|--------|-------------|----------|
| Owned apps and enrichment stay in TS | They need steam-user and axios; CM replacement is a separate spike | ✓ |
| Move enrichment to Rust | Port the axios fetches now | |

| Option | Description | Selected |
|--------|-------------|----------|
| Retire the TS ACF writer and route it to Rust | Delete appManifest.ts and finalizeAcf.ts | ✓ |
| Leave it for later | Readers only | |

**User's choice:** all recommended options.

---

## Which VDF consumers are in scope

| Option | Description | Selected |
|--------|-------------|----------|
| Valve manifest moves, with the same guards in Rust | Size cap, shape checks, forbidden-key reject | ✓ |
| Keep it in TS with a local parser | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fold parseKv1 in | Order- and duplicate-preserving core tree; readers choose a view | ✓ |
| Leave parseKv1 in TS | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Investigate; Steam-correct wins | As in 63 D-07, with divergences recorded | ✓ |
| Match @node-steam/vdf exactly | Bug-for-bug | |

| Option | Description | Selected |
|--------|-------------|----------|
| Two flags: text VDF and shortcuts | | ✓ |
| One flag for everything | | |
| One flag per consumer | | |

**User's choice:** all recommended options.

---

## shortcuts.vdf writer fidelity

| Option | Description | Selected |
|--------|-------------|----------|
| Lossless tree, byte-identical | Keep types, order and unknown fields | ✓ |
| Typed model, known fields only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Steam's bytes plus logical TS parity | Byte round-trip for unmodified files; by-value for edits | ✓ |
| Byte-match steam-shortcut-editor | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic temp file and rename | | ✓ |
| Atomic plus a .bak | | |
| Keep the in-place write | | |

**User's choice:** all recommended options.

---

## Steam path discovery

| Option | Description | Selected |
|--------|-------------|----------|
| Rust, with the TS setting still overriding | | ✓ |
| Stay in TS config | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Windows: registry SteamPath first, then Program Files | | ✓ |
| Keep Program Files only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Linux: Flatpak, ~/.steam/steam, ~/.local/share/Steam, Snap | | ✓ |
| Keep today's two candidates | | |

**User's choice:** all recommended options.

---

## Claude's Discretion

- Crate placement, constrained to one shared ACF codec
- Channel names and result shapes
- Hot-path read batching
- How the shortcuts mutation is expressed over the wire
- The Windows registry crate
- The Jest mocking strategy

## Deferred Ideas

- Porting the polling state machines to Rust (a later slice)
- Moving owned-apps and enrichment, which goes with the CM-client replacement spike
