---
phase: 57-opt-in-known-fix-sharing-via-relay
plan: 01
subsystem: known-fixes
tags: [zod, schema, relay, known-fixes, tdd]
requires: []
provides:
  - "src/common/knownFixReport.ts shared wire schema (D-03)"
  - "readKnownFixesWithLayer + exported TIER1_ROUTING_KEYS"
affects: [57-04, 57-05]
tech-stack:
  added: []
  patterns: ["single zod-only shared module for client and relay", "drift test against tier-1 filter"]
key-files:
  created:
    - src/common/knownFixReport.ts
    - src/common/__tests__/knownFixReport.test.ts
    - src/backend/__tests__/knownFixReportDrift.test.ts
    - src/backend/__tests__/knownFixesWithLayer.test.ts
  modified:
    - src/backend/knownFixes.ts
decisions:
  - "Schema is strict and carries no title (D-19)"
metrics:
  completed: 2026-11-02
---

# Phase 57 Plan 01: Shared known-fix report schema Summary

Strict zod-only report schema (macArch/32, drm/ceg, add/remove, digits-only appId, no title) shared by client and relay, plus a layer-aware `readKnownFixesWithLayer` and a drift test tying the allow-list to the tier-1 filter.

## Commits
- a27168b95 test: failing schema tests
- f8930c335 feat: shared schema
- 690430899 test: failing drift + layer tests
- eac90d715 feat: readKnownFixesWithLayer + exported TIER1_ROUTING_KEYS
- follow-up fix: tsc casts in drift test

## Deviations from Plan

**[Rule 1 - Bug]** The drift test initially failed `tsc --noEmit` on a type cast; fixed with an `as unknown as` cast in a separate commit. The RED test commit therefore did not typecheck on its own.

Also, `readKnownFixes` was left untouched; the new function duplicates its loop as the plan specified.

## Verification
22 schema tests, 5 drift tests, layer tests and the existing knownFixes suites pass; `tsc --noEmit` and prettier clean. `graphify update .` run.

## Known Stubs
None.

## Self-Check: PASSED
