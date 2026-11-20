# Phase 61: Unified macOS engine for all stores - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 61-unified-macos-engine-for-all-stores
**Areas discussed:** Bottle/prefix model, Migrating wineVersion, Control shape & options, Unsupported wording

---

## Bottle/prefix model

| Option | Description | Selected |
|--------|-------------|----------|
| Per-game bottle | Own bottle in CrossOver's Bottles dir, like Steam | ✓ |
| Keep shared 'GameLib' bottle | All non-Steam CrossOver games share one bottle and one trial clock | |
| Keep today's split | Shared bottle for CrossOver, per-game prefix otherwise | |

| Option | Description | Selected |
|--------|-------------|----------|
| New games only; old stay put | No copying; legacy games keep their bottle/prefix | ✓ |
| Copy into per-game bottles | Clone on first launch; multi-GB, save risk | |
| Offer a one-click move | Old stay put, optional move action | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same as Steam | 59 D-01..D-03 creation and adoption path | ✓ |
| Plain prefix until CrossOver arrives | GameLib-owned prefix, no adoption | |

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate to an explicit override | Plain-prefix games keep their Wine, marked Unsupported | ✓ |
| Adopt the prefix as a bottle | Symlink plus cxbottle.conf; save-path risk | |

**User's choice:** Recommended option on every question.

---

## Migrating wineVersion

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic | CrossOver games become Automatic on their existing bottle | ✓ |
| Explicit CrossOver override | Keep the pick, no fallback, Unsupported | |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep running as 'Legacy: <name>' | Read-only override, unchanged launches, Unsupported | ✓ |
| Force to Automatic | Fresh bottle, saves stay behind | |
| Map to the closest listed option | Hybrid | |

| Option | Description | Selected |
|--------|-------------|----------|
| Derive at read time, write on save | No stored migration; wineVersion untouched | ✓ |
| One-off migration via the runner | src/backend/migration rewrite | |
| Wait for Phase 68 | Versioned-store migration | |

| Option | Description | Selected |
|--------|-------------|----------|
| Global Engine default = Automatic | Global control replaces the global Wine selector on macOS | ✓ |
| Always Automatic, no global setting | Per-game override only | |

---

## Control shape & options

| Option | Description | Selected |
|--------|-------------|----------|
| One shared Engine control | Replaces WineVersionSelector + CrossoverBottle on macOS | ✓ |
| Engine control + keep bottle picker | Picker under Advanced, Unsupported | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same list as Steam | Automatic, CrossOver, pins, WM Staging, plus Legacy | ✓ |
| Steam list + any Wine Manager build | Also non-Staging WM builds | |

| Option | Description | Selected |
|--------|-------------|----------|
| Identical, shared components | Lift EngineBadge/SteamEngineNotices, keyed by game | ✓ |
| Toast and badge only | No trial or untested notices for non-Steam | |

| Option | Description | Selected |
|--------|-------------|----------|
| src/backend/engine/ | Store-agnostic top-level module | |
| You decide | Planner picks within the dependency-cruiser rules | ✓ |

---

## Unsupported wording

Finding presented: known fixes already apply to every store (tier-2, `knownFixesRegistry.ts`).

| Option | Description | Selected |
|--------|-------------|----------|
| Same text for every store | Identical warning and badge | ✓ |
| Neutral, store-agnostic text | Softer "may not apply" for all stores | |
| Per-store text | Steam keeps wording; others "not tested by GameLib" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same badge | Legacy games show Unsupported right after the update | ✓ |
| Softer 'Legacy engine' badge | Distinct, quieter badge | |

## Claude's Discretion

- Location and API of the engine decision module
- Per-game bottle naming, the engine config key, the presentation of the saves-stay-behind warning, and the fate of `steam/engine/`

## Deferred Ideas

- One-click "Move to its own bottle" for legacy shared-bottle games
- Ordering relative to Phases 65 and 68 (not discussed)
