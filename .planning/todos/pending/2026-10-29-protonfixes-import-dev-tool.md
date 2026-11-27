---
created: 2026-10-29
title: "Offline dev tool to import umu-protonfixes as candidate local fixes"
area: known-fixes
severity: minor
platform: any
ready: blocked
source: "quick 261029-8ws external fix-format research, 2026-10-29"
related_seed: SEED-001
files:
  - meta/ (new script)
audit_acknowledged:
  milestone: v0.10
  at: 2026-11-20
---

## Problem

protonfixes is the one large open per-game fix dataset (314 gamefixes-steam files), but it is Python for Proton on Linux and not Mac-validated.

## Context

See "External formats (researched 2026-10-29)" in `.planning/notes/per-game-compat-fixes-architecture.md`. Depends on: 2026-10-29-known-fix-dlloverrides-key.md and 2026-10-29-known-fix-launchargs-exeoverride-keys.md for the keys it emits.

## Retargeted 2026-11-15: GameLib-Dashboard

This importer is now planned as the first consumer of the separate **GameLib-Dashboard** project (`.planning/seeds/SEED-001-gamelib-dashboard-upstream-monitoring.md`). The dashboard's repo watch flags changed files under umu-protonfixes `gamefixes-steam/`; the importer re-runs on those files only and opens a candidate PR against GameLib. Every candidate is still Mac-tested by hand and promoted through Phase 57.

What stays in GameLib: the two key-schema dependencies (`dllOverrides`, `launchArgs`/`exeOverride`) and the promotion path. Undecided (SEED-001 open question): whether the importer script lives in the dashboard repo or stays in GameLib `meta/` and reads the dashboard's output. The translation spec below holds either way. Building it standalone in `meta/` first is still valid if the dashboard has not started.

## Next

Write an offline script under `meta/` or `scripts/` that translates the declarative subset of gamefixes-steam into candidate local fix files for Mac testing: protontricks to `winetricks`, set_environment to `envVariables`, winedll_override to `dllOverrides`, regedit_add to `registry`, append_argument/replace_command to `launchArgs`/`exeOverride`. Skip esync/fsync/nvapi. Keep the BSD-2-Clause attribution in every generated file. Not a runtime feature. A tested candidate is promoted through the Phase 57 PR flow (`.planning/ROADMAP.md` Phase 57) or a bundled-fix PR. If the script spawns child processes, it falls under the fake-HOME isolation convention (`createFakeHomeProfile()`).

## Progress (2026-11-27, quick 261127-vy3)

The standalone importer is built: `meta/importProtonfixes.ts`, run as `pnpm import-protonfixes --source <checkout> --out <dir>`, with `--only <appIds>` for re-runs on changed files and `--overwrite` to replace its own earlier output. It is offline and data-only (it reads the Python as text, never runs it), every emitted file keeps the BSD-2-Clause attribution, and a jest suite plus a drift test against `gamelib-knownfix/src/types.rs` pin the output to GameLib's accept rules.

First real run, umu-protonfixes `d4912aee4bc2f98dab47d8cdf843a6ca9e85978c` (`gamefixes-steam/`, 319 entries): 184 translated, 35 partial, 100 skipped. It wrote 213 tier-1 files and 7 tier-2 profiles to `scratchpad/protonfixes-candidates/` (gitignored). The skip reasons were nothing-mapped 72, no-main 13, only-not-applicable 10, empty-main 3 and not-an-appid-file 2.

`dllOverrides` needs a hand-supplied exe when upstream gives none: protonfixes overrides are bottle-wide and GameLib's key is per-exe only, so 34 overrides in 27 files were left out as `dll-override-exe-unknown` and are listed in each candidate's `protonfixes-unmapped` note.

What remains: the GameLib-Dashboard integration (repo watch, re-run on changed files, candidate PR) and where the importer finally lives (SEED-001 open question). `ready:` moved to `blocked` for that reason.
