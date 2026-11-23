# Phase 88: Launch pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-24
**Phase:** 88-launch-pipeline
**Areas discussed:** Where 88 ends vs managers, Game lifetime and quit, Golden trace oracle, Live gate across 3 OSes

---

## Where 88 ends vs managers

| Option | Description | Selected |
|--------|-------------|----------|
| Shared pipeline + spawn | Rust owns funnel, builders, wrappers, gamescope, known-fix env/overlays and the spawn; manager launch() stays TS via shims until 91/92 | ✓ |
| One Rust launch op per game | TS manager supplies runner-specific args only; pulls 91/92 logic into 88 | |
| Builders only | Rust builds argv/env, TS keeps spawning; conflicts with SC4 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Port it, streaming shim | Rust owns every runner spawn; TS shim streams lines to onOutput until 91/92; commandRunner deleted in 88 | ✓ |
| Keep a slim TS runner until 91/92 | Only the launch spawn moves; SC4 amended | |

| Option | Description | Selected |
|--------|-------------|----------|
| All of it, bridge via shims | Known-fixes fully ported; bridge modules shimmed until 97 | ✓ |
| Launch-facing parts only | Reader/layering stays TS for the bridge until 97 | |

**User's choice:** the recommended option each time.

---

## Game lifetime and quit

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as before: ask, then kill | Same dialog; Yes kills the game tree via gamelib-proc; only crash survival changes | ✓ |
| Let games survive quit | Quit never kills a running game | |
| Ask with a choice | Dialog offers leave-running vs close-game | |

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing, as before | A surviving game shows as not running | |
| Re-adopt the running game | Boot finds surviving Game-class trees and shows them as Playing | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Status + playtime + after-script | pid + start-time record; Playing; playtime and after-script on exit; no log resume | ✓ |
| Status only | | |
| Defer to its own phase | | |

**Notes:** re-adoption was flagged as new capability beyond parity; the user kept it in 88.

---

## Golden trace oracle

| Option | Description | Selected |
|--------|-------------|----------|
| Pinned base env, full compare | Fixed synthetic base env; golden stores the full env | ✓ |
| Delta only | Store only added/changed variables | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inject platform, record anywhere | All targets recorded on one machine; Rust replays on three-OS CI | ✓ |
| Record each OS on its own CI leg | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-axis + pairwise | Every axis value, all toggle pairs, named incident scenarios | ✓ |
| Full cartesian | | |
| You decide | | |

---

## Live gate across 3 OSes

| Option | Description | Selected |
|--------|-------------|----------|
| Operator live check on all three | Real Windows and Linux machines | |
| macOS live, Win/Linux CI + Phase 99 | Golden replay + stub-game CI smoke; SC2 amended | ✓ |
| macOS + one other OS live | | |

macOS gate items selected (multi-select): native + CrossOver/Staging launch; single flight + quit; Force Quit survival + re-adopt; known fix + pre/post scripts (all four).

---

## Claude's Discretion

- Crate layout, sub-slice order, op names, streaming shim transport, per-launch record format,
  recorder/fixture format, pairwise generator, and anti-cheat coverage approach.

## Deferred Ideas

- Real-title Windows/Linux launch checks → Phase 99.
- Resuming log capture for a re-adopted game.
- Quirk fixes → individual todos.
