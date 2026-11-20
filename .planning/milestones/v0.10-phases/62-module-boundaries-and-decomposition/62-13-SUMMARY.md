---
phase: 62-module-boundaries-and-decomposition
plan: 13
subsystem: common
tags: [capabilities, store-identity, ratchet, classification]
requires: [62-02, 62-12]
provides:
  - src/common/storeCapabilities.ts (storeCapabilities table, StoreKey, isStore, hasCapability, isHandOffInstall)
  - 62-SITE-CLASSIFICATION.md (all 201 runner-literal sites with owning plan and target)
affects: [62-14, 62-15, 62-16, 62-17, 62-18, 62-19]
key-files:
  created:
    - src/common/storeCapabilities.ts
    - src/common/__tests__/storeCapabilities.test.ts
    - .planning/phases/62-module-boundaries-and-decomposition/62-SITE-CLASSIFICATION.md
key-decisions:
  - "15 day-one flags, one per distinct behaviour; nine are steam-only, three are legendary+gog, hasStoreCatalog (not sideload), canAddSteamShortcut and winePrefixToolsAvailable (not steam)"
  - "Narrowing sites (gameInfo.runner !== 'sideload' reading install.is_dlc) are classed identity; converting plans must preserve the type narrowing"
  - "Per-store switches classed identity, converted to Record<Runner|StoreKey,...> lookups (not counted by the ratchet)"
  - "StoreKey and CapabilityFlag carry ts-prune-ignore-next with a reason instead of baseline entries"
requirements-completed: [D-01, D-02, D-03, D-16]
completed: 2026-11-07
---

# Phase 62 Plan 13: storeCapabilities and site classification Summary

**A single `satisfies Record<Runner, StoreCapabilities>` table with 15 behaviour flags, an `isStore` identity helper and a fail-safe `hasCapability` accessor, plus a classification of all 201 ratchet sites (98 behaviour, 103 identity) split across 62-14..62-19.**

## Classification totals
62-14: 14, 62-15: 27, 62-16: 24, 62-17: 52, 62-18: 43, 62-19: 41. Frontend sum 136, backend sum 65 (reconcile to the ratchet ceilings). Row count equals `--list` (201).

## Tasks
1. Classification: `ca3cb899c`
2. Table, helpers and test (33 tests): `01c875c1e`

## Deviations from Plan
- No separate RED commit: the test imports a module that did not exist and the pre-commit hook runs the type check, so test and implementation landed together after confirming RED locally (module-not-found).
- find-deadcode flagged `StoreKey` and `CapabilityFlag` as used-in-module; resolved at the source with `// ts-prune-ignore-next` plus reason, so the baseline files were not touched.
- `hasCapability` takes `string | null | undefined` (typescript-eslint rejects `Runner | string` as redundant).
- `isHandOffInstall` is the only common-type compound predicate; frontend-state compounds are deferred to 62-17 as planned.

## Verification
codecheck, boundaries (ratchet 136/65, 9 known depcruise entries), find-deadcode, eslint on new files green. Full jest: exactly the 6 baseline failures.

## Self-Check: PASSED
