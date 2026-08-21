---
created: 2026-08-21T08:15:00.000Z
title: 'Steam depot residue predating the 260821-rb5 breadcrumb has no record at all — only a filesystem orphan scan can find it'
area: steam-depot
files:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/installLocation.ts
resolves_phase: 37
planned_as: 37-07
---

## Problem

Quick task `260821-rb5` (2026-08-21) closed **case C** of the aborted-depot-residue todo —
a native depot install hard-killed by `kill -9`/crash/power-loss, where no JavaScript runs at
teardown, so `finalizeToSteam` never fires and no `appmanifest_*.acf` is ever written. The fix
persists a crash-surviving breadcrumb (`steamResumePending` + the resolved
`{targetSteamappsDir, installdir}`) to `steamLibraryStore` at install **start**, and
`SteamLibraryManager.init()` unions those breadcrumb appIds with `scanDownloadingAppIds()`'s
ACF-derived list so the residue is surfaced as resumable on the next launch.

**That fix is forward-only by construction.** It can only surface residue for installs that
started *after* it shipped, because the breadcrumb has to have been written. Any partial
install directory left by a hard kill **before** 2026-08-21 has:

- no `appmanifest_*.acf` (case C never writes one), so `scanDownloadingAppIds()`
  (`library.ts`, the loop that only ever opens `appmanifest_*.acf` and tests `StateFlags & 4`)
  cannot see it;
- no breadcrumb in `steamLibraryStore`, because that writer did not exist yet;
- no in-memory trace, since `nativeInstallsInFlight` died with the process that was killed.

So it is bytes under `steamapps/common/<installdir>` with **zero record anywhere** — exactly
the original todo's complaint, for the pre-fix population. The only thing that can find it is a
direct scan of the filesystem. This was explicitly DEFERRED (not rejected) during
`260821-rb5`'s design pass.

Split out of `.planning/todos/completed/2026-08-16-aborted-depot-residue-has-no-acf.md`
(closed 2026-08-21) — this was the sole remaining scope keeping that todo open. See its
`## Design decision (2026-08-21)` and `## Resolution (260821-rb5)` sections for the full
case A/B/C taxonomy and what shipped.

## Why this is NOT just "walk steamapps/common"

Two hard constraints, both established at HEAD during the `260821-rb5` design pass. A plan
that ignores either will produce a scan that is unsafe or that cannot identify anything.

**1. A `.acf`-less directory is not self-evidently residue.** It is indistinguishable, from the
filesystem alone, from a user-moved install, a Steam-broken install, or a manual copy. This is
why auto-deletion was rejected under every option considered, and why the scan must never run
destructively. Also note this repo's ledgered macOS finding that a "false completion" is
usually a bottle path — the bottle/bridge steamapps roots are separate from the native one and
must be handled deliberately, not assumed away.

**2. There is no offline `installdir -> appId` map.** `installdir` is resolved from PICS at run
time (`installLocation.ts`, `fetchInstalldir` / `sanitizeInstalldir` feeding
`resolveSteamInstallTarget`) and is not persisted anywhere for the pre-fix population. So an
offline scan can find a suspicious directory but cannot say which appId it belongs to without
a network PICS read — and a startup path that needs the network is exactly the shape that
caused the confirmed `steam-startup-resume-crash` regression, which is why `init()`'s resume
path was softened to surface-only in the first place.

Note the `sanitizeInstalldir` fallback: when PICS returns nothing usable the installdir is
derived from the appId, so *some* residue directories may be back-mappable to an appId offline.
That is a partial route worth measuring before assuming a network read is mandatory.

## Solution

TBD — needs its own design pass. Constraints that are already settled and should not be
re-litigated:

- **User-invoked, not startup.** The scan reports; it does not run unattended on launch. This
  keeps it off the crash-prone startup path and makes a false positive harmless.
- **Never auto-delete.** Deletion, if offered at all, is an explicit per-item user action.
  Reconciling over existing content is what made phase 23.2's live gate cost 71.5s and zero
  bytes instead of 90GB — deleting residue turns every retry into a full re-download.
- **Do not touch `depot.ts`'s manifest-write ordering**, `finalizeToSteam`,
  `shouldFinalizeAfterThrow`, `buildAppManifestText`, or `reconcilePartialState`. Staying out
  of Phase 23's hardening is why the `260821-rb5` design was chosen over writing a `1026` stub
  up front.

Open questions for the design pass:

- Where does it surface — a Settings action, a library-level notice, or a dev/debug-only tool?
- Does it attempt appId attribution at all, or just report "N directories, M GB, no manifest"?
  A size-only report may be enough to be useful and avoids the PICS dependency entirely.
- How does it avoid flagging the bottle and bridge steamapps roots as orphans when those are
  legitimately structured differently?

## What good looks like

- A user can discover, on demand, that pre-fix partial installs are consuming disk, and can act
  on each one deliberately.
- The scan cannot delete anything on its own, and a false positive costs the user nothing.
- It does not run at startup and does not require the network to produce a useful report.
