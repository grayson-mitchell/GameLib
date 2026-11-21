---
spike: 092
idea: store-mirror-protocol
name: store-mirror-protocol
type: standard
validates: "Given a Rust-owned store file, a sidecar mirror cell with pending ops and a renderer that writes directly, when sends, applies and deliveries interleave arbitrarily, then every view converges to Rust's state and the sidecar reads its own writes at every step"
verdict: VALIDATED
related: [085]
tags: [store, mirror, rebase, read-your-writes, ordering, model-check, phase-85]
---

# Spike 092: Mirror protocol under randomized interleavings (phase 85, S1)

## What This Validates

**Given** one Rust-owned store file with a single writer, a sidecar `MirrorCell` (base, pending ops, view = pending
over base) and a renderer that writes straight to Rust,
**when** sidecar writes, renderer writes, Rust applies, event deliveries, push deliveries, snapshot fetches and
persist failures interleave in any order,
**then** every view converges to Rust's state, the sidecar reads its own write at every step until a later op
supersedes it, and no observer ever shows an older value after a newer one.

85-RESEARCH.md rated this design MEDIUM and said it needed this model before the TS mirror plan (85-10) is frozen.

## How to Run

```bash
node sim.mjs --runs 10000 --seed 85     # the result below; exits 0, or 1 with "counterexample" and a trace
node sim.mjs --selftest                 # every deliberately broken variant must be caught (exits 0 when all are)
node sim.mjs --runs 10000 --mutant no-nack   # one broken variant, to read its counterexample
```

Plain Node ESM, no dependencies, no files read or written. It touches no operator profile.

## The Model

One file, two TS names (A and B) over it. `sim.mjs` carries the full protocol in its header comment. In short:

- **Rust** is the only writer. `rustApply` computes the next state, persists, and only then commits `rev + 1` and emits
  `{rev, op, originSeq?}` to the sidecar queue and the renderer push queue (persist before emit). A failed persist
  rolls the op back, consumes no rev and sends the originating sidecar a `nack{originSeq}`.
- **Sidecar frames** reach Rust FIFO; **renderer writes** are applied whenever they arrive; **events and pushes**
  are delivered in order per queue; **snapshots** travel a separate route and arrive in any order relative to
  pushes (the `changesDuringFetch` situation in `tauriTransport.ts`).
- **Mirror cell**, one per file path: drops an event with `rev <= baseRev` (cell created late, event already in what
  it loaded), otherwise requires `rev == baseRev + 1`, applies it to `base` and removes the pending op named by
  `originSeq`; a nack removes the pending op.
- **Renderer**: buffers pushes until the first snapshot, replays those with `rev > snapshot.rev`; afterwards drops
  `rev <= lastRev` and requires `rev == lastRev + 1`; a re-fetched snapshot applies only if `rev > lastRev`.
- **Ops** are state-assigning: `set`, `delete`, `clear`, `replace(object)`.

Checked after every action: **P** mirror base and renderer view equal Rust's history at the rev they claim;
**G** applied revs are gapless; **V** a local write is visible at once through both TS names; **R** per key the view
is the effect of the last unacked local op touching it, else base (computed independently of the mirror).
At quiescence: **C** every view equals Rust's state and nothing is pending.

## Result (2026-11-22, macOS, Node)

| Run | Outcome |
|-----|---------|
| Fixed trace: renderer `set a=1` reaches Rust before the sidecar's earlier-sent `set a=2` | converged to a=2; the sidecar read a=2 before and after the renderer's event |
| `--runs 10000 --seed 85` | all invariants held; 9,995 distinct interleavings, 109,037 ops, 101,710 events applied |
| seeds 1, 2, 3, 7, 2026 at 10,000 runs each | all invariants held |

Coverage of the interesting situations inside the seed-85 run: 33,585 renderer writes landed while a sidecar op was
unacked (the conflict case), 4,972 events dropped as already reflected by a late-created cell, 7,438 stale pushes
and 5,380 stale snapshots dropped by the rev rules, 3,878 persist failures injected with 1,959 nacks delivered.

**Verdict: the protocol converges and keeps read-your-writes. No counterexample.**

## The Checker Can Fail

`--selftest` runs each rule's removal and requires a violation:

| Broken variant | Caught | By |
|---|---|---|
| `no-pending` (view ignores unacked local writes) | fixed trace | V, R |
| `no-ack` (an event never clears its `originSeq`) | fixed trace | R, C |
| `per-instance` (one cell per TS name) | fixed trace | V (write via A not seen via B) |
| `no-nack` (failed persist never reported) | random run 23 | C: the op stays pending forever |
| `emit-first` (emit before persist) | random run 7 | P: observers hold a rev Rust rolled back and then reused |
| `no-rev-filter` (observers skip the rev checks) | random run 1 | P/G: stale push or late event re-applied |

Two of those are findings, not just coverage:

- **`no-nack`**. Without a nack, a persist failure strands the sidecar's optimistic op in `pending` for good and the
  mirror shows a value Rust never stored. The sim's counterexample is a sidecar `replace` whose persist failed.
  The protocol therefore needs a rejection message, and the sidecar must drop the op (reverting to base) and
  surface the failure.
- **`emit-first`**. A failed persist after an emit means observers hold rev N while Rust reuses N for a different
  op: silent divergence that no later event repairs. Persist before emit, and consume no rev on failure.

## Not Modelled

- Byte-level JSON, number formatting and key order (the golden fixtures of 85-01/85-03 cover those).
- Frame loss from a dead sidecar or a Rust crash: both processes die together, so no observer outlives the state it
  saw; the flush barrier and exit drain are 85-10 / 85-11 concerns (Pitfall 9).
- Cross-store ordering: the protocol is per file; nothing here relies on order across stores.
