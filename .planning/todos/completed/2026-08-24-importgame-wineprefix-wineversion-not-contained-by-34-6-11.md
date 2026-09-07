---
created: 2026-08-24T00:00:00.000Z
title: "importGame's winePrefix/wineVersion/wineCrossoverBottle are renderer-supplied filesystem paths NOT contained by Plan 34.6-11's T-34.5-C6-49-03 hardening"
area: sidecar-ipc
status: RESOLVED
resolved: 2026-09-07
resolved_by: quick 260907-seq
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

Gap plan 34.6-18 resolved the sibling question for `importGame`'s `path` argument by dropping `defaultInstallPath` containment in favour of a shape-only validator (`assertPlausibleAbsolutePath`), on the grounds that the root was renderer-writable and that the feature's own input is out-of-root — so "containment against `defaultInstallPath`" is no longer available as a default answer for `winePrefix`/`wineVersion`/`wineCrossoverBottle` either, and the open design question is now narrower (existence/type validation versus a different root entirely); note also that this todo's `planned_as: 34.6-14` field is now stale, since plan 34.6-14 closed without disposing of it.

## Disposition

Recorded here per Plan 34.6-11's Task 3 acceptance criteria ("if residual (c) is a real gap, file
a todo rather than silently leaving the gap"). Plan 34.6-14 (this phase's closing-artefacts plan)
owns disposing of this todo alongside the phase's other ledger rows.

## Resolution

**Verdict:** re-dispositioned, not discharged. This todo's open design question — what containment
policy is correct for `importGame`'s `winePrefix`/`wineVersion`/`wineCrossoverBottle` — is answered
NO GATE AT `importGame`. This is a DELIBERATE, ACCEPTED RESIDUAL, declared here, not a fix.

**Rationale:** `settingsFlowRegistration.ts:160` (`ipcMain.on('setSetting')`) and `:195`
(`ipcMain.handle('writeConfig')`) both gate only `appName` via `isContainedGameConfig`
(`settingsFlowRegistration.ts:108`) and never inspect the value being written. A renderer that can
call `importGame` can already call `setSetting` with `key: 'winePrefix'` (or `wineVersion`, or
`wineCrossoverBottle`) and persist the identical setting through that wider, unchecked, by-design
route. A gate on `importGame`'s three arguments therefore closes nothing while risking rejection of
legitimate configurations — a shared system Wine, a prefix under `~/.wine` — the exact failure mode
the 2026-08-25 path-containment todo already produced once for `defaultInstallPath`-rooted
containment. Note that `storeWriteHandlers.ts:169` already blocks the *raw store* write route for
these fields, so the typed `setSetting`/`writeConfig` route is the only one still open, and it is
open by design (it is how the Settings screen persists user edits).

**This todo's own premise defect:** the Context section above lists `wineCrossoverBottle` as a
path-shaped argument alongside `winePrefix`/`wineVersion`. That is wrong: `wineCrossoverBottle` is
a CrossOver bottle NAME, not a filesystem path (`launcher.ts:820`, passed as
`{ bottle_name: gameSettings.wineCrossoverBottle }`; also `launcher.ts:760`/`:807` use it the same
way). An absolute-path shape check applied to it would have BROKEN legitimate CrossOver
configurations. Anyone re-opening this design question in the future must not inherit that error.

**What was true all along, and what it cost:** `winePrefix` and `wineVersion.bin`/`.wineserver` ARE
filesystem paths, consumed at launch: `launcher.ts:1115`/`:1134`/`:1142` (`ret.WINEPREFIX =
winePrefix`), `launcher.ts:1136` (`ret.PROTONPATH = dirname(gameSettings.wineVersion.bin)`),
`launcher.ts:1510` (`wineBin = wineVersion.bin.replaceAll(...)`, spawned), `launcher.ts:1576`
(`spawn(wineVersion.wineserver!, ['--wait'], ...)`), and `utils.ts:919` (`env: { WINEPREFIX:
gameSettings.winePrefix }`). The source comment at `installFlowRegistration.ts`'s `importGame`
registration previously claimed the opposite — that these values were "used only for a config
write, never a filesystem path" — and has been corrected as part of this resolution. The residual
declared here is accepted on REACHABILITY grounds (the wider unchecked `setSetting`/`writeConfig`
route), NOT because these values are inert.

**Collateral records repaired:** the `installFlowRegistration.ts` `T-34.5-C6-49-03` comment block
(immediately above `ipcMain.handle('importGame', ...)`) and its file-header `importGame` bullet
were corrected to drop the false "never a filesystem path" claim and to point at this closed todo
instead of the pending path. `rendererPathGuard.ts`'s module docstring was corrected to stop naming
this todo as `assertContainedPath`'s future consumer. `assertContainedPath` is RETAINED — its
38-test suite (`rendererPathGuard.test.ts`) still exists and still passes — and now has no named
future consumer.

**Stale field:** `planned_as: 34.6-14` (in the frontmatter above) was already stale before this
resolution — plan 34.6-14 closed without disposing of this todo, as gap plan 34.6-18's own
disposition note (in the Suggested resolution section above) already flagged. It is closed here by
quick task 260907-seq instead.
