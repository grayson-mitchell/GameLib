---
created: 2026-08-21T08:15:00.000Z
title: 'Steam depot residue predating the 260821-rb5 breadcrumb has no record at all — only a filesystem orphan scan can find it'
area: steam-depot
files:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/installLocation.ts
resolves_phase: 37
planned_as: 37-07  # DROPPED by 37-CONTEXT.md D-01 — see note below
---

> **DROPPED, NOT DELIVERED — 2026-08-22.** Phase 37 completed, and this todo carries
> `resolves_phase: 37`, but plan 37-07 was **dropped** by `37-CONTEXT.md` D-01 — not deferred,
> not descoped to a later phase, and no REQ ID was ever minted for it. **Do not let a
> `resolves_phase` auto-close record this as done.**
>
> Decided on measurement, not preference: the signal ratio is **1.2%** — 425 MB of real GameLib
> residue against 35.6 GB of directories any scan would have to flag. The external user population
> is empty by construction, because the `260821-rb5` breadcrumb fix shipped 2026-08-21, so any
> future user's first install postdates it. Cited as an explicit non-goal in `37-10-PLAN.md`.
>
> This stayed filed as **won't-do-now**, not as pending work.
>
> **CLOSED 2026-08-22** — not by shipping a scan, but by the by-hand cleanup D-01 prescribed.
> 2.65 GB reclaimed, the 1.2% signal ratio confirmed on the real filesystem, and two state
> defects left open. See `## Resolution (2026-08-22)` at the end of this file.


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

## Resolution (2026-08-22) — cleaned by hand, as D-01 prescribed

Closed by the **manual cleanup D-01 called for** ("the residue is cleaned by hand after 37-10
lands"), not by shipping a scan. Nothing was added to the app; `library.ts` and
`installLocation.ts` are untouched. The `resolves_phase: 37` warning above still stands — this
was closed by a deliberate human-run cleanup, not by a phase auto-close.

**Scan performed:** all five registered `steamapps` roots — the native root, `/Volumes/blank`
and `/Volumes/NO NAME` from `libraryfolders.vdf`, and both CrossOver bottles
(`GameLibSteam`, `GameLibSteamBridge`). Method was read-only: every `common/*` directory
diffed against the `installdir` of every `appmanifest_*.acf`, then each unclaimed directory
cross-referenced against `libraryfolders.vdf`'s app list and GameLib's persisted
`store_cache/steam_library.json` (`is_installed`, `install_path`, `steamResumePending`).

**Result: 12 unclaimed directories, ~36 GB — of which only 2.65 GB was residue.** The 1.2%
signal ratio in D-01 was confirmed almost exactly. Moved to
`~/.Trash/gamelib-steam-residue-20260822-224214/` (moved, never `rm -rf`):

- **Husks (48 KB)** — `app_8930`, `Sid Meier's Civilization VII`, `Tomb Raider`,
  `Wasteland 2 Director's Cut`. Contents were `.DS_Store` plus a stray `installscript.vdf`.
- **Confirmed residue (429 MB)** — matching D-01's 425 MB measurement:
  - `app_259130` (378 MB), a pure duplicate: GameLib points 259130 at the ACF-claimed
    `common/Wasteland`, which exists and is complete.
  - `app_228280` (47 MB), partial BG:EE. The `app_<id>` name is `sanitizeInstalldir`'s
    fallback — Steam never names a directory this way, so it is GameLib-authored by construction.
  - `Balrum` (4 MB), partial against a ~700 MB game.
- **Unregistered but complete (2.21 GB)** — `ATOM RPG` (2.1 GB) and `ADOM` (110 MB): intact
  `.app` bundles with no ACF and `is_installed: false`. Judgement call, deleted knowingly;
  cost is a re-download.

**Deliberately preserved** — the false-positive mass D-01 predicted: `War3zuk-AIO Overhaul`
(33 GB, a user-built 7 Days to Die mod install with its own `Mods/` and `serverconfig.xml`,
created 2026-04-11) and `Steam Controller Configs` (Steam infrastructure, not a game).
`app_25900` / `app_257350` were never flagged — their ACFs claim them, exactly as D-05 recorded.

## The near-miss this produced — a scan snapshot is not safe to delete from

The scan measured `common/Sid Meier's Civilization V` at **4.0 KB, one file** and classified it
a dead husk. Seven minutes later a **concurrent GameLib session** (`pnpm tauri:dev`) installed
Civ V into that exact directory — 843 MB plus a new `appmanifest_8930.acf` at `StateFlags=1026`
— and five minutes after that the cleanup moved the **live install** to Trash off the stale
snapshot.

It was caught only because the cleanup script printed a fresh `du` per item as it moved, so
`MOVED 843M` visibly contradicted the 4.0 KB the report had promised. Restored immediately and
verified: 843 MB back in place, `Civilization V.app/Contents` intact, no nesting, ACF
`installdir` matching. The last write was 22:37:36 against a move at 22:42:14, so no open write
was interrupted. All nine remaining moved items still had no ACF and sizes matching the
original measurement.

The orphan verdict rested on three facts — no ACF, `is_installed: false`, no breadcrumb — and
one concurrent action flipped **all three**. The ACF count going 19 → 20 was the tell and
nothing re-read it before deleting. **Any future scan of this shape must re-verify each target's
discriminator inside the deleting step**, abort on a changed ACF count, and echo the live size
per item.

## Left open — surfaced by the scan, NOT addressed

Neither is disk residue; both are state edits, deferred because a concurrent session was live
in that store:

- **Two stale breadcrumbs that will nag at every launch.** Balrum (424250) and Civ VI (289070)
  carry `steamResumePending` pointing at `app_424250` / `app_289070`, **neither of which exists
  on disk**. `breadcrumbAppIsFullyInstalledOnDisk()` only clears on a `StateFlags=4` ACF, so a
  breadcrumb whose directory vanished entirely never self-heals and surfaces as resumable
  forever. This is a real gap in the `260821-rb5` self-heal, not a data problem.
- **Cyberpunk 2077 (1091500) is a phantom install.** Its ACF reads `StateFlags=4` and GameLib
  reports 83.73 GiB installed, but `common/Cyberpunk 2077` is empty (0 B).

Also unverified: `/Volumes/NO NAME/SteamLibrary` is registered in `libraryfolders.vdf` but was
not mounted, so that root is unscanned — not proven clean.
