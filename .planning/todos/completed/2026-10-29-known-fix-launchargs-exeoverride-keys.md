---
created: 2026-10-29
title: "Add launchArgs and exeOverride known-fix keys"
area: known-fixes
severity: minor
platform: any
ready: human
source: "quick 261029-8ws external fix-format research, 2026-10-29"
files:
  - src/backend/knownFixes.ts
---

## Problem

append_argument (39) + replace_command (49) = 88 protonfixes files have no GameLib equivalent.

## Context

Neither key runs new code, so both are tier-1 candidates. `ready: human` because tier placement (tier 1 vs tier 2) is an operator decision. See "External formats (researched 2026-10-29)" in `.planning/notes/per-game-compat-fixes-architecture.md`.

## Next

Operator decides the tier, then implement the keys in the matching key list.

## Resolution

2026-10-29, quick 261029-mbl (commits 108c408e9, 2c93c4901, e19f24c8c). Operator decision: both keys are TIER 1 (remote-reachable), added to `TIER1_KNOWN_FIX_KEYS`, and count for the GameLib row (fixes, not routing keys). `launchArgs` is validated as `string[]`; `exeOverride` is shape-checked (relative, no drive letter, no `..`, no NUL) and at launch realpath-contained to the install folder and required to be an existing regular file (`src/backend/knownFixLaunch.ts`).

Wired into GOG, Amazon (nile), Epic (legendary), Zoom and the non-DRM Steam bridge. Exe precedence: per-launch altExe > user targetExe > known-fix exeOverride > default. Ordering: legendary/nile put known-fix args after the `--` marker (before passthrough args); gogdl drops `--`-prefixed entries and places the rest before the user's launcherArgs; zoom places them before launcherArgs. Sideload is not wired (storeMap.sideload is undefined, no tier-1 file can match).

Tests: knownFixes.test.ts (launchArgs/exeOverride describe), knownFixesGamelibStatus.test.ts, knownFixLaunch.test.ts (real temp dirs, symlink escapes), runnerLaunchArgv.test.ts, steamBridgeKnownFixes.test.ts (steamBridgeLaunchCommandParts).

Steam gaps: (1) DRM mode applies neither key (helper-forwarded argv unverified); (2) `steam://rungameid` launches (native/bottled Steam) are owned by the Steam client, nothing applies; (3) the bridge shim is placed beside the PICS launch exe, so an exeOverride in another directory may run without the shim; (4) the Steam bridge has no user launcherArgs setting, so no ordering question.
