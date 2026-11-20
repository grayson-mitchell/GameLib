---
phase: 75-steam-local-file-formats-in-rust
plan: 24
subsystem: steam
tags: [steam, parity, rust-migration, sweep]
requires: [75-14, 75-17, 75-18, 75-23]
provides:
  - pnpm steamfiles-parity-sweep (local Tier 2 real-file sweep, deleted at the gate)
  - 75-PARITY.md with 16 operator-accepted divergences (APPROVED)
key-files:
  created:
    - meta/steamFilesParitySweep.ts
    - meta/__tests__/steamFilesParitySweep.test.ts
    - .planning/phases/75-steam-local-file-formats-in-rust/75-PARITY.md
  modified:
    - package.json
requirements-completed: [STEAM-03, P75-E]
duration: ~90min
completed: 2026-11-14
---

# Phase 75 Plan 24: Tier 2 parity sweep Summary

A redacted, read-only sweep compares the TS and Rust branches of every steamfiles wrapper over this Mac's real Steam files (35 steamapps dirs, 49 ACFs, registry, localconfig, 6 installscripts, shortcuts.vdf). It exits 0 with zero unexplained diffs, and the operator accepted all 16 listed divergences (DV-75-01..16).

## Commits
- b4db8df44: feat(75-24) sweep script, test, package script
- c43b47e40: docs(75-24) 75-PARITY.md (pending)
- acceptance commit: 75-PARITY.md set to APPROVED

## Decisions
- The real shortcuts.vdf round-trips byte-identically (1015 bytes); tag 0x0A (int64) is absent from it and remains unproven on real data (DV-75-14).
- Valve manifests: 0 real files (the manifest.vdf is a per-run temp file); parity rests on golden fixtures.

## Deviations from Plan
- [Rule 3] The backend logger had no writer outside the sidecar, so Rust branches silently fell to their catch path. The sweep initialises it under a throwaway HOME (real app log untouched).
- Wrapper modules are dynamically imported so the pure half is unit-testable.
- Sweep surfaced one real class not in the golden overrides, `integer-key-order` (DV-75-13); no Rust fix was needed.

## Known Stubs
None.

## Self-Check: PASSED
