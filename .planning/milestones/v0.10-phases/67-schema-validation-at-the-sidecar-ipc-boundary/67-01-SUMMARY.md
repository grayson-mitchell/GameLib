---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 01
subsystem: backend
tags: [zod, dependency, security]
requires: []
provides: [zod-4-baseline]
affects: [67-02, 67-03]
tech-stack:
  added: []
  patterns: [z.looseObject, z.strictObject, z.url, z.iso.datetime]
key-files:
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/backend/crossover_index/schema.ts
    - src/backend/logger/uploader.ts
    - src/backend/humble/adapter.ts
    - src/backend/storeManagers/legendary/commands/base.ts
    - src/backend/storeManagers/steam/bridge/allowlist.ts
    - src/common/knownFixReport.ts
decisions:
  - "zod 4.6.7 (npm latest at execution); single copy in tree (knip also resolves 4.6.7)"
metrics:
  completed: 2026-11-07
requirements: [V67-A]
---

# Phase 67 Plan 01: zod 4 bump and port Summary

zod bumped 3.25.6 to 4.6.7 (closes the <4.6.6 memory-exhaustion advisory) and the deprecated zod 3 forms in the zod-using files were ported to zod 4.

## Commits
- 8857952cd: bump + crossover_index/schema, logger/uploader, humble/adapter
- 97746e988: legendary base, steam allowlist, knownFixReport

## What changed
- `npm view zod version` = 4.6.7; `pnpm why zod` shows one copy (knip depends on the same).
- `.passthrough()` to `z.looseObject` (humble adapter, 6 sites); `.strict()` to `z.strictObject` (allowlist knownBad entry, built from `allowlistEntrySchema.shape`; knownFixReport); `z.string().url()` to `z.url()`; `z.string().datetime()` to `z.iso.datetime()`; `ZodIssueCode.custom` to `'custom'` plus `input: undefined`.
- The other seven listed files (schemas.ts, protocol.ts, fetcher.ts, filesystem/windows, gpu/linux, gpu/windows, osInfo/windows, bridgeVerdict, eos_overlay) held no deprecated forms; they compile unchanged on zod 4.
- No test asserted zod 3 message text; no test edits.

## Verification
- `pnpm codecheck` green; prettier clean on touched files; grep for `zod/v3|ZodIssueCode|.passthrough()` in non-test src/meta is empty.
- Jest (Backend+Common zod-touching selection): 5874 pass, 3 fail, all in steam tests unrelated to zod.

## Deviations
- Pre-existing failures: games.test.ts "channel constants equal the 56-01 SUMMARY values" (missing 56-01-SUMMARY.md, as expected) plus two others the plan did not list: bottle.test.ts "DRM_LAUNCH_FORM equals launch_form in 56-01-SUMMARY.md" (same missing file) and macArchKnownFixRouting "Intel: never seeds..." (host-dependent). Both fail identically with the original source files, so they are not port regressions. Not fixed (out of scope).
- Process slip: I ran `git stash` once to compare baseline, then immediately popped it; working tree restored intact, no loss.

## Known Stubs
None.

## Self-Check: PASSED
