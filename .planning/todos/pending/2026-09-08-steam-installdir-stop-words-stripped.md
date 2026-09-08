---
created: 2026-09-08
title: "Steam installdir vs on-disk directory name diverge by stop-word stripping — authorship of the on-disk names is UNESTABLISHED"
area: steam-depot
severity: medium
platform: any
ready: code
split_from: .planning/todos/pending/2026-09-07-acf-claims-stateflags-4-over-grossly-incomplete-installs.md
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/manifest.ts
---

## Observed

While correcting the 2026-09-07 ACF-authorship todo, 718850's Steam-written
ACF carries `installdir "Age Wonders Planetfall"` while the actual tree lives
at `common/Age Wonders Planetfall` — the stop words "of" and "'s" (or similar)
are missing from the on-disk directory name relative to the game's full
title. Sibling directories under the same `common/` root are stripped the
same way: `7 Days Die` (from "7 Days to Die"), `Amnesia Dark Descent` (from
"Amnesia: A Machine for Pigs" / "The Dark Descent" family), `Avadon Black
Fortress` (from "Avadon: The Black Fortress").

## NOT established — must not be assumed

Whether GameLib created any of these on-disk directory names, or whether
Steam itself stores this stripped form as `installdir` against a directory it
also named the same stripped way. Both readings fit the evidence gathered so
far. No systematic sweep of `installdir` vs directory-name pairs has been
run — this is a single-title observation plus three visually similar
siblings, not a census.

## Why this could matter

`finalizeToSteam` (`src/backend/storeManagers/steam/depot.ts`) resolves
`installRoot` as `<steamapps>/common/<opts.installdir>` and writes the same
`opts.installdir` string into the ACF's `installdir` field. If GameLib's own
`installdir` derivation ever diverges from the directory name it actually
creates on disk, `measureInstalledBytes` would walk the wrong (missing or
empty) root and silently measure `0` real bytes — a structurally different
failure mode than either damaged install in the parent todo, and one the new
`verifyStructuralIntegrity` post-download check (quick 260908-nbd) would not
catch either, since it also resolves paths from the same plan-derived
`installRoot`.

## First step (desk-only, hence `ready: code`)

Trace where `installdir` originates in `buildDepotPlan` (PICS
`config.installdir`? the app's display name? some sanitiser step?) and diff
it against the directory name GameLib actually creates for a fresh install,
for the three named sibling titles plus 718850. This is a desk-level trace
against existing PICS data already on this machine — no live install run is
required for this first step.

## Scope note

Do not treat this as a duplicate of its parent todo. The parent's item 3
("establish 718850's shape") is now answered by the correction recorded
there (both damaged ACFs are Steam-written, not GameLib-written) — this todo
exists because answering that question exposed a second, separate,
unresolved question (installdir/directory-name divergence) as residue, not
because the parent's own defect remains open here.
