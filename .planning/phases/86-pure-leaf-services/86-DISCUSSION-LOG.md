# Phase 86: Pure leaf services - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 86-pure-leaf-services
**Areas discussed:** Which slices are in 86, Slices with TS callers, Fixtures for network services, Rollback and live gate

---

## Which slices are in 86

| Option | Description | Selected |
|--------|-------------|----------|
| Roadmap SC set | The 8 SC slices; the extras go to the phases that port their callers | ✓ |
| SC set + small pure extras | Also runsForMe and appshell | |
| Full research list, split 86/86.1 | Everything, in two phases | |

| Option | Description | Selected |
|--------|-------------|----------|
| One gamelib-info crate | A module per slice, one dispatch, one -cli | ✓ |
| Crate per domain group | catalog / storesearch / artwork | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Replicate, then log a todo | Parity first; fixes come later and separately | ✓ |
| Fix in the port, record it | Deliberate deviation in the golden notes | |

**Follow-up (raised after the areas closed):** the umu lookup is shared by wiki and the store managers.
| Option | Description | Selected |
|--------|-------------|----------|
| Port with wiki in 86 | gamelib-info module; store managers use a shim; ownership row 87 → 86 | ✓ |
| Keep umu in TS until 87 | Reverse dependency for one phase | |

## Slices with TS callers

| Option | Description | Selected |
|--------|-------------|----------|
| Thin rustInvoke shim | TS impl deleted; same signature; shim dies with its last caller | ✓ |
| Callers import rustInvoke directly | No shim module | |
| Defer slices with TS callers | Shrinks 86 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Delete gate counts shims | Gate checks shim body + schedule test | ✓ |
| No extra gate | | |

| Option | Description | Selected |
|--------|-------------|----------|
| TS online_monitor triggers Rust | Rust has no online logic; 88 rewires | ✓ |
| Rust connectivity probe | Timing differs | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rust emits to renderer + tray | Relay only if a TS backend listener exists | ✓ |
| You decide | | |

## Fixtures for network services

| Option | Description | Selected |
|--------|-------------|----------|
| Recorded responses + TS output goldens | Real payloads, deterministic CI | ✓ |
| Reuse existing test mocks | | |
| Both | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pin URL, query, method, key headers | Catches endpoint drift in CI | ✓ |
| Output only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| TS golden harness, committed first | Rust reads the same goldens; harness deleted with its slice | ✓ |
| TS characterization tests first | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in -cli smoke, not CI | | ✓ |
| None | | |

## Rollback and live gate

| Option | Description | Selected |
|--------|-------------|----------|
| No flag, delete per slice | Fixture parity is the proof | ✓ |
| One flag for the whole phase | | |
| Flag only for risky slices | | |

Live gate items (multi-select): Game page info ✓, Store search + discounts ✓, Artwork + recent games ✓, Upgrade with no data change ✓

| Option | Description | Selected |
|--------|-------------|----------|
| Signed Phase 86 over signed 85 | | ✓ |
| Signed over v0.10 | | |
| Dev build is fine | | |

| Option | Description | Selected |
|--------|-------------|----------|
| CI only (Windows/Linux) | Live check rides with Phase 99 | ✓ |
| Add a Windows live leg | | |

## Claude's Discretion

- Slice order within the phase; module layout, op names and channel shapes; fixture format and redaction; how the anticheat MD5 skip and image-file caches map onto Rust.

## Deferred Ideas

- online_monitor/connectivityNow and gamedetails → 88; macArch → 89; signInProbe parsers → 91/92; runsForMe, appshell and cache.ts → their callers' phases.
- Fixes for copied TS quirks → individual todos.
