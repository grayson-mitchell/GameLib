---
created: 2026-10-29
title: "Offline dev tool to import umu-protonfixes as candidate local fixes"
area: known-fixes
severity: minor
platform: any
ready: code
source: "quick 261029-8ws external fix-format research, 2026-10-29"
files:
  - meta/ (new script)
---

## Problem

protonfixes is the one large open per-game fix dataset (314 gamefixes-steam files), but it is Python for Proton on Linux and not Mac-validated.

## Context

See "External formats (researched 2026-10-29)" in `.planning/notes/per-game-compat-fixes-architecture.md`. Depends on: 2026-10-29-known-fix-dlloverrides-key.md and 2026-10-29-known-fix-launchargs-exeoverride-keys.md for the keys it emits.

## Next

Write an offline script under `meta/` or `scripts/` that translates the declarative subset of gamefixes-steam into candidate local fix files for Mac testing: protontricks to `winetricks`, set_environment to `envVariables`, winedll_override to `dllOverrides`, regedit_add to `registry`, append_argument/replace_command to `launchArgs`/`exeOverride`. Skip esync/fsync/nvapi. Keep the BSD-2-Clause attribution in every generated file. Not a runtime feature. A tested candidate is promoted through the Phase 57 PR flow (`.planning/ROADMAP.md` Phase 57) or a bundled-fix PR. If the script spawns child processes, it falls under the fake-HOME isolation convention (`createFakeHomeProfile()`).
