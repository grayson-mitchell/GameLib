---
phase: quick-261029-gow
plan: 01
status: complete
completed: 2026-10-29
commits:
  - 67063aea7
requirements: [TODO-2026-10-29-known-fix-dlloverrides-key]
---

# Quick 261029-gow: dllOverrides tier-2 known-fix key

`dllOverrides` is now a tier-2-only key (`[{ exe, dlls: { <dll>: <mode> } }]`) that compiles to `HKCU\Software\Wine\AppDefaults\<exe>\DllOverrides` REG_SZ values (views [64]) and is applied on every launch through `applyRegistryFixes`, on both the non-Steam Wine path and the Steam bridge path.

## What changed (commit 67063aea7)
- `src/common/types.ts`: `KnownFixDllOverrideMode`, `KnownFixProfile.dllOverrides`.
- `src/backend/knownFixes.ts`: `'dllOverrides'` added to `TIER2_PROFILE_KEYS` only; comments updated. Tier-1 filter still drops it at every layer.
- `src/backend/knownFixesRegistry.ts`: `dllOverridesToRegistryFixes`, `knownFixProfileRegistryFixes` (registry first, then overrides; same-reference return for registry-only profiles), `DLL_OVERRIDE_MODES`, exported `RegistryFixLogContext`; `applyKnownFixProfileRegistry` uses the new gate.
- `src/backend/storeManagers/steam/bridgeKnownFixes.ts`: same gate swap.
- Tests added in `knownFixesLayered`, `knownFixesRegistry`, `steamBridgeKnownFixes` test files.
- Not in the code commit: todo moved to `.planning/todos/completed/` with a Resolution section; note `per-game-compat-fixes-architecture.md` marks dllOverrides built.

## Verification
- jest (knownFixes*, steamBridgeKnownFixes): 10 suites, 254 tests pass.
- `tsc --noEmit`, scoped prettier --check and eslint on the 7 src files: clean.
- `pnpm planning-gates`: 12/12 pass. `graphify update .` run.
- Sharing-list grep: no other tier-2 key enumeration exists (only knownFixes.ts, types.ts, sharedRedistInstall.ts which consume steamSharedRedists).

## Deviations
None. The `bottleDllOverrides.ts` 3410180 table is untouched, as planned.

## Self-Check: PASSED
