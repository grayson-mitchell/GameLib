---
phase: 57-opt-in-known-fix-sharing-via-relay
verified: 2026-11-02T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
human_verification:
  - test: "Decide whether to add a D1 Time Travel caveat to the 'about two hours' help text / PRIVACY.md"
    expected: "Operator decision: D1 Time Travel keeps up to 30 days of restorable history containing hashed IP buckets"
    why_human: "Privacy-copy judgement, not verifiable programmatically"
---

# Phase 57 Verification

**Goal:** opt-in relay sharing of detected fixes; PR opened on known-fixes; nothing sent when off.

## Evidence
- Relay: `cd relay && npx jest` 9 suites / 172 tests pass; `tsc --noEmit` clean.
- Root: `npx jest knownFix macArch ShareDetectedFixes` 26 suites / 480 tests pass.
- Detector hooks at HEAD: `reportDetectedFix` called in steam/library.ts (Mach-O add and contradiction remove, lines ~2012/2027) and steam/games.ts (CEG, ~2768); client module `src/backend/knownFixReport.ts`; settings toggle `ShareDetectedFixes.tsx`; PRIVACY.md section present.
- Mach-O locator prefers Info.plist CFBundleExecutable at HEAD (macArch.ts).
- Production relay reachable: POST /v1/reports with `{}` and no JSON content type gives 415 (validation active); operator reports 422 on empty JSON.
- Done-when gate: PR https://github.com/grayson-mitchell/Known-Fixes/pull/1 is OPEN, adds only `steam/98800-steam.json`; UAT 57-UAT.md items 1-5 all pass (on: PR created; reinstall: nothing sent; off: nothing sent).

## Truths
| # | Truth | Status |
|---|-------|--------|
| 1 | Setting off by default, macOS-only toggle | VERIFIED (UAT 1, component) |
| 2 | Mach-O 32-bit, CEG, and removal detectors report | VERIFIED (hooks + tests) |
| 3 | Report minimal (no user id/path/log); D-12/D-16-18 skips | VERIFIED (knownFixReport tests, UAT 4) |
| 4 | Relay holds credential, validates tier-1 keys, rate-limits, dedupes, opens PR | VERIFIED (172 relay tests, live PR #1) |
| 5 | Fresh 32-bit install with setting ON opens correct PR | VERIFIED (PR #1) |
| 6 | Setting OFF sends nothing | VERIFIED (UAT 5) |

## Regression / other
Other-phase jest failures (cargoFeatures, skeletonFlows, steamFlows, etc.) were stated to fail on clean HEAD; none are in phase-57 test globs, which pass. Phase-57 dead-code findings fixed in ae6f4ee00. Skipped review items (WR-04/05/06/09/10, IN-01..04) are operator-scoped out, not gaps.

## Human verification
1. Privacy caveat (open): D1 Time Travel keeps up to 30 days of restorable history containing hashed IP buckets, which the "about two hours" help text does not mention. Operator has not decided whether to add a caveat.

No gaps found.
