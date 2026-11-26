# Phase 91: Epic (legendary) runner - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-27
**Phase:** 91-epic-legendary-runner
**Areas discussed:** Real transcript capture, EOS overlay proof, Live gate shape, Sign-in/out & cookie sweep

---

## Todo cross-reference

| Option | Description | Selected |
|--------|-------------|----------|
| major_outage rule | Epic status check counts only literal "major" as offline | ✓ |
| Absent-component warning | Absent component warns "offline", then launches online | ✓ |

**User's choice:** Both folded as deliberate changes recorded in `deltas.json`.

---

## Real transcript capture

| Option | Description | Selected |
|--------|-------------|----------|
| Claude, on a config copy | Read-only commands against a scratch copy of the signed-in legendaryConfig | ✓ |
| Operator runs a script | Operator runs a capture script | |
| Synthetic only | Transcripts built by hand; does not meet SC3 "real" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Committed, redacted | 94 D-05 precedent; leak-check test | ✓ |
| Local only, gitignored | CI replays synthetic only | |

Mutating captures (multi-select): Install + uninstall small title ✓, Repair / verify ✓, Update ✓, Move + import ✓

| Option | Description | Selected |
|--------|-------------|----------|
| Real where safe, else synthetic | Network-down live, corrupted-token copy, rest labelled synthetic | ✓ |
| All synthetic | From existing TS test strings | |

| Option | Description | Selected |
|--------|-------------|----------|
| Claude, into scratch | Scratch install dir, operator picks the title | ✓ |
| You, in GameLib | Through the TS build with capture on | |

| Option | Description | Selected |
|--------|-------------|----------|
| Path-rewritten Mac captures | Real Win/Linux output in Phase 99 | ✓ |
| Capture on another machine | Capture now on Windows/Linux | |

---

## EOS overlay proof

| Option | Description | Selected |
|--------|-------------|----------|
| Mac lifecycle + goldens; in-game in 99 | Amend SC2 like 88 D-16 | ✓ |
| Live Windows/Linux check now | Signed 91 build on another machine | |
| Goldens only | No live overlay item | |

| Option | Description | Selected |
|--------|-------------|----------|
| Out of scope, note it | Port the Linux-only lookup as is | |
| File a todo | Same, plus a pending todo | ✓ |

---

## Live gate shape

| Option | Description | Selected |
|--------|-------------|----------|
| Own gate at end of 91 | Signed 91 over signed 88.3 | ✓ |
| Merge into 92's gate | 89 → 90.2 shape | |

Items (multi-select): Upgrade survival ✓, Install → launch → uninstall ✓, Update/repair/move/import ✓, Sign-out/in + EOS lifecycle ✓

| Option | Description | Selected |
|--------|-------------|----------|
| Native Mac + CrossOver | Two launches, operator picks titles | ✓ |
| One title only | | |
| Native + CrossOver + offline | Adds an offline launch | |

| Option | Description | Selected |
|--------|-------------|----------|
| One phase; planner may split | 88 D-30 shape | ✓ |
| Split now: 91 / 91.1 | | |

---

## Sign-in/out & cookie sweep

| Option | Description | Selected |
|--------|-------------|----------|
| Exact sequence, golden-pinned | Same steps and order; incident tests port | ✓ |
| Simplify while porting | One Rust op; deliberate delta | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh login page + cookie census | Visible check plus logged census | ✓ |
| Fresh login page only | | |

---

## Claude's Discretion

- Crate layout (`gamelib-legendary` + cli), parser design, fixture format and redaction tooling
- How the Rust sign-out reaches the login-window ops in-process
- Library reads from legendary's on-disk JSON vs `legendary list --json`
- Plan and wave breakdown

## Deferred Ideas

- The in-game EOS overlay on macOS (todo filed)
- The in-game EOS overlay check and real Win/Linux legendary output → Phase 99
- Install/update shims → 93; `ManagerHooks` channel → 92
