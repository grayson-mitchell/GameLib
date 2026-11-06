# Phase 63: Rust migration pattern and executable scanners - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 63-rust-migration-pattern-and-executable-scanners
**Areas discussed:** Headless tool path, objdump in importScan, Boundary & signatures, Fallback flag & parity

---

## Headless tool path

| Option | Description | Selected |
|--------|-------------|----------|
| Rust CLI binary | Small bin, path in and JSON out, built from a shared library crate. One implementation | ✓ |
| Keep TS for headless | Two implementations forever, kept in step by the parity harness | |
| Node native addon (napi-rs) | A .node addon imported by both the sidecar and meta. Awkward inside the SEA, per-platform build | |

| Option | Description | Selected |
|--------|-------------|----------|
| Cargo workspace | gamelib-shell + Tauri-free scan library + thin CLI bin | ✓ |
| Second [[bin]] in gamelib-shell | One crate, but the CLI pulls in Tauri | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| App uses rustInvoke | In-process for the app, CLI only for headless tools | ✓ |
| Everything spawns the CLI | One call path, process spawns at launch time | |

Follow-up: "How do headless tools get the CLI built?" (build on demand / prebuilt + staleness
check) and "Jest: mock the boundary or spawn the real CLI?". **The user declined both questions**,
so they are Claude's discretion.

---

## objdump in importScan

| Option | Description | Selected |
|--------|-------------|----------|
| Parse natively in Rust | Read the import and delay-import tables directly, drop objdump | ✓ |
| Keep objdump, port only the parser | Keeps the external tool and the spawn | |
| Leave importScan in TS this phase | Port the other four only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Whole walk in Rust | One round-trip, only a description crosses the pipe | ✓ |
| Walk in TS, parse per-file in Rust | Many round-trips | |

| Option | Description | Selected |
|--------|-------------|----------|
| Investigate, don't auto-pick | A disagreement is a parity failure, and the flag stays on TS | ✓ |
| objdump is ground truth | Match objdump exactly, quirks included | |

---

## Boundary & signatures

| Option | Description | Selected |
|--------|-------------|----------|
| Caller entry points | One async channel per caller-facing operation, path in and small result out | ✓ |
| One "scan everything" channel | A single scanExecutable(path) | |
| Port every exported helper | 1:1 mirror, which means sending bytes over the pipe | |

| Option | Description | Selected |
|--------|-------------|----------|
| Make callers async | Same name and result type, now Promise and path-based | ✓ |
| Keep sync TS shims | Two live implementations | |

---

## Fallback flag & parity

| Option | Description | Selected |
|--------|-------------|----------|
| Per-scanner, default Rust | Each scanner held back on its own. Dev/advanced only | ✓ |
| One global flag | All or nothing | |
| Env var only | Developer escape hatch only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Both: synthetic + local library | Committed fixtures for CI plus a local sweep of installed games | ✓ |
| Synthetic only | | |
| Local library only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Zero diffs + live smoke | Delete TS inside this phase once the sweep and the live smoke pass | ✓ |
| Keep TS one more phase | | |

---

## Claude's Discretion

- How headless tools build the CLI, and whether Jest mocks the boundary or spawns the CLI (the user declined to choose)
- Crate and channel naming, result JSON shapes, `spawn_blocking`, the rustInvoke timeout for closure walks, CI on all three legs
- Whether objdump can be dropped from bundles or docs after verification

## Deferred Ideas

- The Steam depot download pipeline in Rust (migration step 2), which waits on its own spike
