---
phase: quick-261025-vnf
plan: 01
subsystem: known-fixes
tags: [known-fixes, steam-bridge, allow-list]
requires: []
provides:
  - readKnownFixes (tier 1, layered, allow-listed)
  - readKnownFixProfile (tier 2, local + bundled only)
  - TIER1_KNOWN_FIX_KEYS, filterTier1KnownFixes
affects: [steam bridge launch, shared redist install, getKnownFixes IPC, launcher installFixes]
key-files:
  modified:
    - src/common/types.ts
    - src/backend/knownFixes.ts
    - src/backend/storeManagers/steam/bridgeKnownFixes.ts
    - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  renamed:
    - public/fixes/284100-steam.json -> public/fixes/284100-steam.profile.json
metrics:
  completed: 2026-10-25
---

# Quick 261025-vnf: Two-tier known fixes Summary

Known fixes split into tier 1 (`<id>-<store>.json`, local > bundled > remote, allow-listed at
every layer) and tier 2 (`<id>-<store>.profile.json`, local > bundled only), each with its own
reader; Steam bridge and shared-redist callers rewired; 284100 profile renamed.

## Commits

- b4d939ed1: feat - two types and two readers with the tier-1 allow-list (Task 1)
- 09ec9178f: feat - rewire Steam bridge and shared-redist callers, rename 284100 file (Task 2)
- 058244464: docs - close the todo (moved to `completed/`) and file the follow-up (Task 3)

## Decisions

- `readKnownFixes` kept its name and became the layered reader, so `launcher.ts` and the
  `getKnownFixes` IPC needed no edit.
- Misplaced-key warnings name `<appName>-<store>.json` / `.profile.json` with a literal
  `<store>` placeholder (the filter functions do not take a runner).
- `title` and `notes` are allowed in both tiers.

## Deviations from Plan

- [Rule 1 - test] `knownFixes.test.ts` asserted the exact message
  `'Known fixes could not be applied, ignoring.'`; the remote layer is now labelled, so the
  message reads `(remote layer)`. Loosened that assertion to the common prefix.
- Process slip, no effect on the result: Task 2's first commit captured only the `git mv`
  rename because an earlier `git add` in the chain failed on the old path; I amended my own
  just-created commit to include the remaining files before anything else was committed.

## Verification

- Jest (knownFixes, knownFixesLayered, steamBridgeKnownFixes, sharedRedistInstall,
  enrichmentFlows): 5 suites, 163 tests passed.
- `npx tsc --noEmit`: clean. `git grep readKnownFixesLayered|TRUSTED_ONLY_KNOWN_FIX_KEYS -- src`: empty.
- Prettier check on all touched `src/` and `public/fixes` paths: pass. `pnpm planning-gates`: 12/12.

## Known Stubs

None. `launchNotice` is typed and allow-listed but nothing renders it (as planned).

## Self-Check: PASSED
