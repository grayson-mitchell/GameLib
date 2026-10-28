---
created: 2026-10-29
title: "Add the dllOverrides known-fix key (tier 2)"
area: known-fixes
severity: medium
platform: any
ready: code
source: "quick 261029-8ws external fix-format research, 2026-10-29"
files:
  - src/backend/knownFixes.ts
  - src/backend/knownFixesRegistry.ts
---

## Problem

Decision 3 of the per-game compat fixes note lists `dllOverrides`, but it is unbuilt. It is the second most-used protonfixes helper (winedll_override, 91 of 490 files).

## Context

See "External formats (researched 2026-10-29)" in `.planning/notes/per-game-compat-fixes-architecture.md`.

## Next

Implement as a registry-backed key writing `AppDefaults\<exe>\DllOverrides`, because CrossOver's wine wrapper drops WINEDLLOVERRIDES (spike 031). Reuse the existing registry applier path in `knownFixesRegistry.ts` (`applyRegistryFixes` / `applyKnownFixProfileRegistry`) where possible. Add `dllOverrides` to `TIER2_PROFILE_KEYS` and never to `TIER1_KNOWN_FIX_KEYS`, and update the comments in `knownFixes.ts` that say it is not built yet.

## Resolution (2026-10-29)

Resolved by quick 261029-gow. Value shape `[{ exe, dlls: { <dll>: <mode> } }]`; modes `native`, `builtin`, `native,builtin`, `builtin,native`, `disabled` (`disabled` writes ''). Written as `HKCU\Software\Wine\AppDefaults\<exe>\DllOverrides` REG_SZ via `applyRegistryFixes` (views [64]) from both `applyKnownFixProfileRegistry` and `applySteamBridgeKnownFixes`. No bottle-wide fallback; an entry without a valid exe is skipped. No reversal (the decision 5 ledger is still unbuilt). The hardcoded 3410180 table in `bridge/bottleDllOverrides.ts` is left as is.
