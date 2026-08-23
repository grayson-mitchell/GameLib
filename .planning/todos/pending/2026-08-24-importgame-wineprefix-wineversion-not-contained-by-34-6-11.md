---
created: 2026-08-24T00:00:00.000Z
title: "importGame's winePrefix/wineVersion/wineCrossoverBottle are renderer-supplied filesystem paths NOT contained by Plan 34.6-11's T-34.5-C6-49-03 hardening"
area: sidecar-ipc
status: OPEN
severity: minor
resolves_phase: 34.6
planned_as: 34.6-14
files:
  - src/backend/sidecar/installFlowRegistration.ts
---

## Context

Plan 34.6-11 (Phase 34.6, REQ-34.6-05) discharged `T-34.5-C6-49-03` for `importGame`'s `path`
argument by adding `assertContainedPath()` against the app's own configured
`defaultInstallPath` — see `installFlowRegistration.ts`'s `importGame` handler and
`34.6-11-SUMMARY.md`.

That plan's own residual (c) records, honestly, that this containment does **not** extend to
`importGame`'s other path-shaped arguments:

- `winePrefix` (a plain `string` — a filesystem directory used as `WINEPREFIX`)
- `wineVersion` (a `WineInstallation` object whose `bin`/`lib`/`lib32`/`wineserver` fields are
  filesystem paths to Wine binaries)
- `wineCrossoverBottle` (a plain `string`)

All three are destructured directly from the renderer-supplied `ImportGameArgs` payload
(`installFlowRegistration.ts`, `importGame` handler) and flow — unchecked — into
`writeConfig(appName, { ...gameSettings, winePrefix, wineVersion, wineCrossoverBottle })`. From
there they become part of the game's persisted settings and are later read back whenever the game
is launched or a Wine command is run against it (e.g. as `WINEPREFIX`, or as the Wine binary
invoked). Plan 34.6-11 deliberately scoped its containment check to `path` only — these three were
out of scope for that plan, not an oversight it silently dropped.

## Why this wasn't fixed in 34.6-11

`assertContainedPath()`'s containment root is the app's own configured install location, which is
a sensible root for a game's install directory. It is not obviously the right root for a Wine
prefix or a Wine binary path — those can legitimately live outside the install tree (e.g. a
shared system Wine install, or a prefix under `~/.wine`). Picking the wrong containment root here
risks breaking legitimate configurations, which is why this was deferred rather than bolted on
without a considered design.

## Suggested resolution

When this is picked up, decide (and record) what containment policy — if any — is correct for a
Wine prefix path and a Wine binary path, given they are not naturally rooted under the game
install directory the way `moveInstall`/`importGame`'s `path` argument is. This may end up being a
narrower validation than full containment (e.g. asserting the path exists and is a directory /
executable, rather than a root-relative containment check) — the design work is the open part,
not just wiring in the existing `assertContainedPath` primitive.

## Disposition

Recorded here per Plan 34.6-11's Task 3 acceptance criteria ("if residual (c) is a real gap, file
a todo rather than silently leaving the gap"). Plan 34.6-14 (this phase's closing-artefacts plan)
owns disposing of this todo alongside the phase's other ledger rows.
