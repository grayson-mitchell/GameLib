---
phase: 85-store-host-config-and-versioned-migrations
plan: 04
subsystem: infra
tags: [spike, store, mirror-protocol, model-check, boot-sweep, sync_all, fsync, frame-throughput, macos]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: "85-RESEARCH.md Pattern 3, Pitfalls 6-10 and assumptions A3/A4/A7 that these spikes settle"
provides:
  - "S1 verdict: the mirror/rebase protocol converges and keeps read-your-writes over 10,000 randomized interleavings (no counterexample), with ten protocol rules for 85-10 and 85-17"
  - "S3-S5 numbers on the operator's Mac and the constants BOOT_SWEEP_MAX_FILES 10000, BOOT_SWEEP_MAX_MS 2000, STORE_QUEUE_HIGH_WATER 256"
  - "D-21 durability policy confirmed with its cost: sync_all about 4 ms per write at 1 KB and 600 KB"
affects: [85-09, 85-10, 85-11, 85-17, 85-19]

plan_head_before: e9644e1955a7b867897a436c418acf2f3987e1f8
plan_head_after: 051ecb0daeb05dab4cf6299cc3412634ccd5a294
commits: 2

actuals:
  tokens: 14300
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Protocol model with an independent oracle and mutation self-test: every rule is removed in turn and the checker must fail"
    - "Persist before emit; consume no rev and send a nack to the originating sidecar when persist fails"

key-files:
  created:
    - .planning/spikes/092-store-mirror-protocol/README.md
    - .planning/spikes/092-store-mirror-protocol/sim.mjs
    - .planning/spikes/093-store-boot-durability-costs/README.md
    - .planning/spikes/093-store-boot-durability-costs/bench/Cargo.toml
    - .planning/spikes/093-store-boot-durability-costs/bench/Cargo.lock
    - .planning/spikes/093-store-boot-durability-costs/bench/.gitignore
    - .planning/spikes/093-store-boot-durability-costs/bench/src/bin/sweep.rs
    - .planning/spikes/093-store-boot-durability-costs/bench/src/bin/sync.rs
    - .planning/spikes/093-store-boot-durability-costs/bench/src/bin/frames.rs
    - .planning/phases/85-store-host-config-and-versioned-migrations/85-SPIKES.md
  modified: []

key-decisions:
  - "Mirror protocol rules frozen from the model: persist before emit, rev under one lock, one FIFO dispatcher, idempotent state-assigning ops, one MirrorCell per file path, originSeq acks, a nack when persist fails, mirror rev rule (drop rev <= baseRev, require rev == baseRev + 1), renderer push rev filter"
  - "A persist failure needs an explicit nack to the sidecar: without it the optimistic op is stranded in pending and the mirror shows a value Rust never stored (found by the no-nack mutant)"
  - "BOOT_SWEEP_MAX_FILES = 10000 (20x the 106 measured files rounded up to a power of ten); BOOT_SWEEP_MAX_MS = 2000 (10x the 6.77 ms median is 68 ms, so the 2000 ms floor applies)"
  - "STORE_QUEUE_HIGH_WATER = 256 frames (4x the worst measured burst high-water of 44, rounded up); a counted warning only, the queue stays unbounded and never drops a store write"
  - "D-21 confirmed: sync_all for user-state, settings and account stores (about 4 ms per write, below the 50 ms line), none for caches (burst of 50 x 600 KB: 0.146 s unsynced vs 0.346 s)"

patterns-established:
  - "Spike scripts print counts and timings only; the operator profile is copied before it is read and nothing from it is recorded"

requirements-completed: [FND-06]

coverage:
  - id: D1
    description: "Mirror protocol model-checked over 10,000 seeded interleavings (plus seeds 1, 2, 3, 7, 2026) with a fixed renderer-vs-sidecar trace; every broken variant is caught by the checker"
    requirement: FND-06
    verification:
      - kind: other
        ref: "node .planning/spikes/092-store-mirror-protocol/sim.mjs --runs 10000 --seed 85"
        status: pass
      - kind: other
        ref: "node .planning/spikes/092-store-mirror-protocol/sim.mjs --selftest"
        status: pass
    human_judgment: false
  - id: D2
    description: "S3-S5 measured on the operator's Mac and recorded with numbers in 85-SPIKES.md, with the three constants and the D-21 confirmation"
    requirement: FND-06
    verification:
      - kind: other
        ref: "grep -cE 'BOOT_SWEEP_MAX_FILES|BOOT_SWEEP_MAX_MS|STORE_QUEUE_HIGH_WATER' 85-SPIKES.md (5); cargo build --release in bench"
        status: pass
    human_judgment: false
  - id: D3
    description: "S2 (Windows rename with an open handle) recorded as measured by gamelib-store's atomic::windows test on the 85-19 CI Windows leg"
    requirement: FND-06
    verification: []
    human_judgment: true
    rationale: "Not measurable on this machine; the number does not exist until the Windows CI leg of 85-19 runs"

duration: 9min
completed: 2026-11-22
status: complete
---

# Phase 85 Plan 04: Store spikes Summary

**The mirror/rebase protocol survives 10,000 randomized interleavings (with persist-before-emit and a nack on failed persist as load-bearing rules), a 106-file profile sweeps in about 7 ms, `sync_all` costs about 4 ms per write, and the boot cap, queue warning level and durability policy are set from those numbers.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-21T16:49:00Z (approximate; start time was not captured at the first tool call)
- **Completed:** 2026-11-21T16:59:00Z
- **Tasks:** 2
- **Files created:** 10

## Accomplishments

- S1: `sim.mjs` models one Rust-owned store file, a sidecar mirror cell with pending ops, two TS names over the file, a renderer writing straight to Rust, late-created cells, snapshots racing pushes and injected persist failures. 10,000 seeded runs (9,995 distinct interleavings, 109,037 ops, 33,585 renderer writes landing while a sidecar op was unacked) plus five more seeds at 10,000 runs found no counterexample. `--selftest` removes each rule in turn and every removal is caught (three by the fixed trace, three within 23 random runs), so the checker can fail.
- S3: 695 KB frames across a pipe into a parse-and-queue reader: 474 frames/s with a parse-only worker, 144.5 frames/s with an atomic write plus `sync_all` per frame; a 50-frame burst peaks at queue depth 27 to 44.
- S4: 106 live JSON files (2.35 MB) read, parsed in order and re-serialized in a median 6.77 ms (first cold read 12.84 ms). All parse. The A3 sweep-cost worry and the A4 eager-`GamesConfig` objection both fall away.
- S5: `sync_all` adds a flat ~4 ms per write at 1 KB and at 600 KB (about 26x to 40x the unsynced write); the 600 KB median is far below the plan's 50 ms line.
- 85-SPIKES.md carries S1 through S5, the three constants each with its measurement, and the D-21 confirmation.

## Task Commits

1. **Task 1: Tracer, S1 protocol model** - `5eb9d6e7c` (docs). Tracer gate: interactive run, `<verify>` is automated-only, so it was re-run (sim.mjs 10,000 runs exit 0, `^## S1` count 1, `persist before emit` count 1) and passed; expansion continued.
2. **Task 2: S3, S4, S5 measurements and constants** - `051ecb0da` (docs)

**Plan metadata:** committed with this SUMMARY (docs: complete plan).

## Files Created/Modified

- `.planning/spikes/092-store-mirror-protocol/sim.mjs` - the randomized protocol model, mutation self-test included
- `.planning/spikes/092-store-mirror-protocol/README.md` - model, invariants, results, the mutant table and what is not modelled
- `.planning/spikes/093-store-boot-durability-costs/bench/` - scratch crate (own `[workspace]` and `Cargo.lock`, `target/` ignored) with binaries `sweep`, `sync`, `frames`
- `.planning/spikes/093-store-boot-durability-costs/README.md` - raw numbers and method
- `.planning/phases/85-store-host-config-and-versioned-migrations/85-SPIKES.md` - S1-S5, Constants, D-21

## Decisions Made

See `key-decisions`. The two non-obvious ones: a failed persist must be reported to the originating sidecar (a nack), and the mirror must treat `rev == baseRev + 1` as an invariant and surface a gap rather than apply across it.

## Deviations from Plan

None - plan executed exactly as written. Two small points inside the plan's latitude:

- Spike numbers 092 and 093 were free, as the plan assumed.
- `sweep` was run against a scratchpad copy of the JSON files first (operator-profile read rule: copy first) and then against the live directory read-only; both gave identical counts. The bench has its own `Cargo.lock` (a copy of src-tauri's, pruned by cargo to the bench's own three dependencies) so the versions match; src-tauri's `Cargo.lock` is untouched (`git -C src-tauri diff --stat -- Cargo.lock | wc -l` is 0).

## Issues Encountered

- `indexmap` needed its `serde` feature for the ordered parse in `sweep.rs`; enabled in the bench's `Cargo.toml` (a feature on an already-locked package, not a new package).
- Known pre-existing failure, not touched: `pnpm backend-di-ceilings` fails on three steam bridge test files from commit `fb7f9b243` (already in this phase's `deferred-items.md`). This plan changes no source and does not run it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 85-09 adopts `BOOT_SWEEP_MAX_FILES = 10000` and `BOOT_SWEEP_MAX_MS = 2000` (stop sweeping at either cap, leave the rest to lazy first-touch migration, one counted log line).
- 85-10 and 85-17 implement the ten protocol rules in 85-SPIKES.md S1, including the nack and persist-before-emit; 85-10 adopts `STORE_QUEUE_HIGH_WATER = 256` (counted warning, queue stays unbounded).
- 85-11 / the writer adopts the D-21 policy per kind.
- 85-19 measures S2 on the Windows CI leg. Windows NTFS and Linux ext4 `sync_all` costs are not measured; the policy is per kind so it does not change.
- No source was changed; nothing here blocks the other Wave 1 plans. Plan 85-05 (open at a human checkpoint) and its files were not touched.

## Known Stubs

None.

## Threat Flags

None. The sweep opened files read-only and printed counts, bytes and timings only (T-85-09); no store value, account name or token appears in any committed output.

## Self-Check: PASSED

- FOUND: `.planning/spikes/092-store-mirror-protocol/sim.mjs`, `README.md`
- FOUND: `.planning/spikes/093-store-boot-durability-costs/README.md`, `bench/Cargo.toml`, `bench/src/bin/{sweep,sync,frames}.rs`
- FOUND: `.planning/phases/85-store-host-config-and-versioned-migrations/85-SPIKES.md` (5 `## S` sections, `## Constants`)
- FOUND commits: `5eb9d6e7c`, `051ecb0da` (`git merge-base --is-ancestor` both on HEAD)
- Acceptance: `^## S1` count 1; constants grep count 5 (>= 3); bench `[workspace]` count 1; src-tauri `Cargo.lock` diff 0 lines

---
*Phase: 85-store-host-config-and-versioned-migrations*
*Completed: 2026-11-22*
