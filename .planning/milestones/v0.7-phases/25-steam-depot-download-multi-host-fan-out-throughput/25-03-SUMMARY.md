---
phase: 25-steam-depot-download-multi-host-fan-out-throughput
plan: 03
subsystem: infra
tags: [steam, depot-download, host-selection, throughput, hardware-verification, checkpoint]

# Dependency graph
requires:
  - phase: 25-steam-depot-download-multi-host-fan-out-throughput
    provides: "Plan 25-01 pickHost top-N fan-out (TOP_N_FANOUT=3) + Plan 25-02 live worker-slot threading through both depot.ts concurrency pools"
provides:
  - "MHOST-04 acceptance evidence: real macOS/Apple Silicon multi-depot install shows sustained hosts=3, err=0, downSpeedMiBs ~10 (vs ~1.5-2.9 baseline)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Cancel-mid-run regression criterion accepted without a fresh re-test: the abort/cancel path is unchanged by Phase 25 (fan-out only alters host selection at attempt 0) and was hardware-verified in the prior Steam install stabilization work (fix/steam-native-install-stability, cancel/abort thread FIXED + hardware-verified). User explicitly elected to accept on the throughput evidence."

requirements-completed: [MHOST-04]

# Metrics
duration: manual hardware run
completed: 2026-07-19
---

# Phase 25 Plan 03: Real-hardware before/after throughput measurement Summary

**On a real macOS/Apple Silicon build with the Steam native-install opt-in ON, a fresh multi-depot install sustained `hosts=3` with `err=0` across all `chunk-stream stats` ticks at ~10 MiB/s — a 3.5–6.7× gain over the ~1.5–2.9 MiB/s single-host pre-fix baseline — confirming the Plan 25-01/25-02 fan-out fix breaks the single-host throughput cap against live Steam CDN infrastructure. MHOST-04 accepted.**

## Performance

- **Type:** Manual human-verify checkpoint (blocking gate — cannot be reproduced in jest; depends on live Steam CM + real CDN edges + a large real depot)
- **Files modified:** 0 (validation only — no new instrumentation added; the existing `chunk-stream stats` log line already reports `hosts=`, `downSpeedMiBs`, and per-host `wl=/avgMs=/unhealthy`)

## Accomplishments
- **Fan-out engaged under real load:** `hosts=3` sustained across multiple ticks (not a one-tick blip) — attempt-0 requests spread across the full `TOP_N_FANOUT=3` width, exactly the mechanism Plans 25-01/25-02 built.
- **Throughput materially higher:** `downSpeedMiBs` ~10 vs the ~1.5–2.9 MiB/s pre-fix baseline recorded in the resolved debug session — a 3.5–6.7× improvement.
- **Integrity preserved:** per-host `err=0` across all ticks — distributing chunks across more hosts did not weaken SHA1 chunk verification or introduce decode errors.
- **No host-set widening (T-25-01):** the fanned-out hosts are drawn from the same authenticated `getContentServers` set; fan-out selects among vetted edges only, it does not reach off-list hosts.

## Evidence (chunk-stream stats)

- **Baseline (pre-Phase-25, from resolved debug session):** `hosts=1`, `downSpeedMiBs` ~1.5–2.9
- **After (this build):** `hosts=3` sustained, `err=0` across all ticks, `downSpeedMiBs` ~10

## Decisions Made
- **Cancel-mid-run regression accepted without fresh re-test.** The plan's acceptance list includes a cancel/abort regression guard. Phase 25 modifies only host selection at attempt 0 (`pickHost` fan-out + worker-slot threading) and does not touch the abort/cancel path, which was already hardware-verified in the prior stabilization work. The user explicitly elected to accept the gate on the throughput evidence rather than re-run the cancel test this session.

## Deviations from Plan
None — checkpoint executed as specified; the optional fresh BEFORE capture was skipped in favor of the accepted ~1.5–2.9 MiB/s baseline from the resolved debug session, as the plan explicitly permits.

## Issues Encountered
None. Initial reaction was that ~10 MiB/s "looks slow," but relative to the ~1.5–2.9 MiB/s baseline it is a 3.5–6.7× gain and clears the acceptance bar. If a higher ceiling is desired later, the next bottleneck would be chunk-decode CPU or `CHUNK_CONCURRENCY`, not host fan-out — out of scope for this gate.

## User Setup Required
None.

## Next Phase Readiness
- MHOST-04 satisfied — Phase 25 acceptance gate passed on real hardware.
- All four Phase 25 requirements (MHOST-01..04) are now complete.
- No blockers. Automated suites from Plans 25-01/25-02 remain green (`npm test -- --testPathPattern=steam`, 724 tests).

---
*Phase: 25-steam-depot-download-multi-host-fan-out-throughput*
*Completed: 2026-07-19*
