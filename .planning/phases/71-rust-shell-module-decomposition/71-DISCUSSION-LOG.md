# Phase 71: Rust shell module decomposition - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 71-rust-shell-module-decomposition
**Areas discussed:** Sequencing vs 67/72, The rustInvoke dispatcher, main.rs's test module, Module granularity/layout

---

## Sequencing vs 67/72

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-gate on 67 | Honour D-19; don't execute 71 until 67 lands | ✓ |
| Split 71: non-dispatcher first | login_window, epic embed and tests now; the dispatcher waits for 67 | |
| Start now, ignore D-19 | Do everything now and keep the markers; 67 rebases | |

| Option | Description | Selected |
|--------|-------------|----------|
| 71 adds the Linux leg first | Plan 1 adds a Linux cargo check+test leg unless 72 already has; 72 drops the item | ✓ |
| Gate on 72's leg | Wait for 72's CI group | |
| Grep audit only | ab1-style, no compile coverage | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per wave | Local macOS per move; push and require Windows+Linux CI at wave end | ✓ |
| Per move | Push and wait on CI after every move | |
| Once at the end | A single push after all moves | |

---

## The rustInvoke dispatcher

| Option | Description | Selected |
|--------|-------------|----------|
| Thin router + handler fns | rust_dispatch.rs: a flat match, one-line arms calling domain handlers | ✓ |
| Router + per-domain sub-dispatchers | Match on prefix, delegate to each module's dispatch() | |
| Move it whole, don't split | Move it to rust_dispatch.rs unchanged | |

| Option | Description | Selected |
|--------|-------------|----------|
| Body verbatim, signature only | The proof diff admits only signature, call-site and indent lines | ✓ |
| Allow light tidying | Dedupe parsing and share helpers during extraction | |

| Option | Description | Selected |
|--------|-------------|----------|
| Extract whole, split later | One fn per huge arm, plus a todo each | ✓ |
| Split into sub-fns now | Break the biggest handlers into steps inside 71 | |

| Option | Description | Selected |
|--------|-------------|----------|
| New small domain modules | dialogs, shell_open, app_lifecycle, scan handlers near scanners | ✓ |
| Leave in rust_dispatch.rs | Small arms stay inline in the router | |
| You decide | Planner picks per arm | |

---

## main.rs's test module

| Option | Description | Selected |
|--------|-------------|----------|
| Co-locate in each module | #[cfg(test)] mod tests at the bottom of each module | ✓ |
| Sibling test files | tests/*.rs or #[path] test modules | |
| Leave tests in main.rs | Split only production code | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stay in main.rs | Tests that read SHELL_SOURCE or span modules stay beside the guard | ✓ |
| New shell_contract_tests.rs | A dedicated module for cross-cutting tests | |

| Option | Description | Selected |
|--------|-------------|----------|
| Helper strips per file | readTauriShellProductionSource(), guard test, needle-count parity | ✓ |
| Tests-file convention instead | Keep `mod tests` out of production files | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep excluded, by prefix | macos_epic_embed pieces stay outside the combined source | ✓ |
| Include them now | Re-baseline counts and absence assertions | |

---

## Module granularity/layout

| Option | Description | Selected |
|--------|-------------|----------|
| Directories for split files | login_window.rs + login_window/{…}; small modules stay flat | ✓ |
| Flat siblings everywhere | login_window_humble.rs etc. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Soft ~1,000 production lines | Tests excluded; overruns justified in the plan | ✓ |
| Hard 1,500 total lines | Tests included | |
| Seams only, no number | Report sizes after the split | |

| Option | Description | Selected |
|--------|-------------|----------|
| One target per wave | Wave 0 CI+helper; then dispatcher, login_window, store_embed, epic embed, tests | ✓ |
| Fewer, bigger waves | 2–3 waves grouped by surface | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parent re-exports, call sites untouched | `pub(crate) use sub::*;` in the parent | ✓ |
| Update call sites to full paths | Explicit module::sub::x | |

---

## Claude's Discretion

- Submodule names and seam boundaries (from the cluster map), the new domain module names, the placement of shared helpers, and the move-proof diff script.

## Deferred Ideas

- Split the oversized handlers into sub-steps (a todo each).
- Dispatcher argument-parsing tidy-up after Phase 67.
- Include the pre-split siblings in combined source-text coverage.
- Remove the Linux-leg item from Phase 72 once D-02 lands.
