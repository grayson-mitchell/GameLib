---
created: 2026-08-16T09:45:00.000Z
title: "An aborted/failed native depot run leaves partial bytes on disk with no appmanifest_*.acf — invisible to the reconciler"
area: steam-depot
files:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/library.ts
---

## Problem

Quick task `260816-vgc` (`fix(steam): abort in-flight depot download on install failure`)
made a DownloadManager install failure route through the same abort a user Cancel already
uses — `callAbortController(appName)` for every runner, plus `SteamGame.stop(false)` for
Steam, which flips `nativeInstallsInFlight`'s `aborted` flag and unwinds
`runNativeDepotDownload`. This **stops the residue from growing**: the chunk-stream loop
now observes the abort and halts within a bounded time instead of running for minutes past
a declared failure.

**It does not make the residue reconcilable or clean it up.** An aborted/failed native depot
run still leaves partial bytes under `steamapps/common/<installdir>` with **no**
`appmanifest_*.acf` ever written — ~~the `.acf` is only written on a successful completion~~
**(this sentence is FALSE as a generalisation — see the `## Correction` section below).**
Phase 23-03's reconciler keys off the presence of an `.acf` to identify installed/resumable
Steam games, so a partial directory with no manifest is invisible to it: not resumable
through the normal path, not cleaned up, not surfaced to the user as anything other than
silent disk usage.

## Correction (2026-08-19, phase 23.2-01)

This Correction retracts the sentence struck above without deleting it, per this project's
standing rule that a wrong record must remain readable, not silently rewritten.

`.planning/phases/23.2-steam-depot-selection-required-vs-optional-depots-and-skip-a/23.2-MANIFEST-WRITE-TAXONOMY.md`
(source-anchored, `downloadSteamDepots`/`finalizeToSteam`/`buildAppManifestText`) establishes three
distinguishable outcomes, not the two this todo assumed:

- **Case A — `buildDepotPlan` throws (plan-build failure, zero bytes downloaded).** The catch
  block's unconditional `finalize()` call (`depot.ts:2836`) DOES write a manifest here — a
  `StateFlags "1026"` / `buildid "0"` / present-but-empty-`InstalledDepots` stub. This is FALSE
  for "only written on a successful completion" — nothing succeeded, and a manifest was still
  written. (This is the defect the 2026-08-19 todo tracks, folded into D-08 of phase 23.2.)
- **Case B — a graceful failure or cancel AFTER the plan was built.** Also writes a manifest — the
  legitimate Phase 21 `1026` verify-handoff, with the real attempted-depot list. Also FALSE for
  "only written on a successful completion."
- **Case C — the process dies (`kill -9`, crash, power loss).** No `.acf` is written, because no
  JS runs to reach `finalize()` at all. **This is the ONLY case where the original sentence is
  true**, and 23-UAT.md Gate 3 (2026-08-19) is the recorded instance of it.

**The corrected premise, and what survives of this todo's argument:** a manifest IS written for
cases A and B, so the reconciler CAN see that residue via the `.acf` for those cases — this todo's
reconciler-invisibility argument does NOT generalise to every aborted/failed install as originally
written. It only holds for case C (a hard process kill). The todo stays OPEN because case C's
residue concern is real and unaddressed; its scope is narrower than originally stated.

**One correction of a related detail, because it affects a future fix's test assertions:** the
"present but EMPTY `InstalledDepots` block" language above is deliberate — `buildAppManifestText`
(`depot/manifest.ts:174-177`) emits the `InstalledDepots` key unconditionally even for zero
entries. A test asserting mere key presence would be vacuous against a case-A stub.

## What `260816-vgc` DID buy

The abort now routes into `runNativeDepotDownload`'s `cancelled` branch (`games.ts`
L1509-1518), which calls `markSteamInstallIncomplete(appId)` — so the **persisted library
entry** is correctly marked incomplete/resumable in GameLib's own state. The remaining gap
is strictly the **on-disk residue**: bytes that exist with no manifest backing them.

## Why this was deferred, honestly

Closing it means one of two things, and neither is safe to bolt onto an abort-routing fix:

- **Writing a partial `.acf`** on abort — this touches `depot.ts`'s manifest write ordering,
  which Phase 23 spent ten plans hardening (stateFlags=4, full-ownership install scope,
  cache-hydration deferral, etc.). A partial/synthetic manifest written at the wrong point
  in that sequence risks re-opening defects Phase 23 closed.
- **Deleting the partial install directory** on abort — destructive, and would break resume
  for a case where the user intended to retry the same install (immediate retry is one of
  `260816-vgc`'s own proven behaviors — an immediate retry now starts a fresh run rather
  than joining the tearing-down one).

This is a scope call, not a difficulty call: both fixes are plausible, but each needs its
own design pass against depot.ts's manifest-write invariants, not an addendum to a
failure-path abort fix.

## What good looks like

- An aborted/failed native depot run's partial bytes are either cleaned up automatically, or
  made reconcilable (e.g. a partial/staging manifest the reconciler can recognize as
  incomplete rather than absent).
- Either resolution must be verified against Phase 23's existing manifest-write hardening —
  do not regress stateFlags=4 handling, the full-ownership install scope, or the
  cache-hydration deferral.

## Design decision (2026-08-21) — persist a breadcrumb at install start

Approach CHOSEN after a brainstorm pass against HEAD. This section records the decision and
the two rejected alternatives; it does not narrow the `## What good looks like` acceptance.

**Verified at HEAD before deciding** (the facts the decision rests on):

- `scanDownloadingAppIds` (`library.ts:2836`) only ever opens `appmanifest_*.acf` and reads
  `StateFlags & 4`. There is no filesystem branch — this single loop IS the invisibility.
- `nativeInstallsInFlight` (`games.ts:117`) is in-memory only and dies with the process.
  `markSteamInstallIncomplete` (`library.ts:502`) persists `steamResumePending` to
  `steamLibraryStore`, but is called from exactly ONE site — the graceful `cancelled` branch
  (`games.ts:1625`). Nothing is persisted at install START, so a hard kill loses the `.acf`,
  the in-flight registry, and the store flag at once. Case C has no record ANYWHERE.
- `installdir` is resolved from PICS at run time (`installLocation.ts:246`) and never
  persisted, so no cached `installdir -> appId` map exists for an offline filesystem scan.

**CHOSEN — persist `steamResumePending` + the resolved `{targetSteamappsDir, installdir}`
at install start**, immediately after `resolveSteamInstallTarget` returns and BEFORE
`downloadSteamDepots` is awaited; clear on successful finalize. `init()` then unions the
store-flagged appIds with `scanDownloadingAppIds()`'s ACF-derived list.

Chosen for what it does NOT touch: `depot.ts`'s manifest-write ordering, which is the entire
reason this todo was deferred. It reuses a field the frontend already renders and a surfacing
path (`library.ts:543-610`) that already notifies. Makes the residue RECONCILABLE — the
second of this todo's two acceptance branches, not the cleanup branch.

**The load-bearing part is CLEARING, not setting.** Clear on success, AND self-heal at
startup: if a `StateFlags=4` `.acf` exists for a flagged appId, clear rather than surface.
Without the self-heal a killed-then-Steam-completed install nags on every launch forever.

**REJECTED — write the `1026` manifest up-front instead of at finalize.** Would make case C
visible with zero scanner change, and is what Steam itself does. Rejected because
`shouldFinalizeAfterThrow`'s own doc comment (`depot.ts:1085`) records that the manifest write
is an atomic rename that UNCONDITIONALLY replaces whatever `.acf` was already at that path: on
an update/reinstall it would clobber a complete install's `StateFlags=4` record before one byte
transferred, re-opening 23.2-02's defect from the other end. Steam also adopts `.acf` only at
startup, so a Steam restart mid-download could adopt the stub and start its own download.

**DEFERRED (not rejected) — startup filesystem orphan scan.** The ONLY option that catches
residue predating the breadcrumb, so it stays on the table as a follow-up. Not viable at
startup: a `.acf`-less dir under `steamapps/common` is indistinguishable from a user-moved
install, a Steam-broken install, or a manual copy, and offline it cannot resolve the appId at
all (see the `installdir` fact above). Safe only as a USER-INVOKED reporting action.

**Auto-deletion stays rejected under every option.** Reconciling over existing content is what
made 23.2's live gate cost 71.5s and zero bytes rather than 90GB; deleting residue turns every
retry into a full re-download and undoes `260816-vgc`'s proven immediate-retry behaviour.
Deletion belongs as an explicit user action on the surfaced entry, never as policy.

**Two traps for whoever writes the tests:**

- The `## Correction` section above says case A writes a `1026`/`buildid 0` stub. That is NO
  LONGER TRUE at HEAD — 23.2-02 gated it off (`depot.ts:2993`), so that stub is not available
  as a fixture. The Correction is left intact per the standing wrong-record rule.
- A case-C test must simulate "no JS ran at teardown" — never call `finalize()` at all — and
  assert on the STORE contents, not a manifest diff. The gate must prove the residue is
  actually SURFACED on the next `init()`; a call-site tick on the persist helper would pass
  against a flag that startup never reads.

## Provenance

Split out of `.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md`
during execution of quick task `260816-vgc`, 2026-08-16 — the fourth "what good looks like"
bullet on that todo (partial-byte/`.acf` reconcilability) was explicitly out of scope for the
abort-routing fix. See that file's `## Resolution` section for the full closure/deferral
accounting.

## Resolution (260821-rb5)

Case C is now reconcilable. Quick task `260821-rb5` implemented the `## Design decision
(2026-08-21)` above exactly as recorded: `markSteamNativeInstallStarted` persists
`steamResumePending` plus the resolved `{targetSteamappsDir, installdir}` to
`steamLibraryStore` immediately after `resolveSteamInstallTarget` returns and before
`downloadSteamDepots` is awaited (`games.ts`), and `clearSteamResumeBreadcrumb` clears it on
a successful depot-download outcome. `SteamLibraryManager.init()`'s surfacing loop now unions
`getSteamResumeBreadcrumbAppIds()` with `scanDownloadingAppIds()`'s ACF-derived list, so a
hard-killed install (no `.acf` at all) is surfaced on the next launch even though the ACF scan
alone would never see it. The self-heal (`breadcrumbAppIsFullyInstalledOnDisk`) clears a
breadcrumb whose on-disk manifest turns out `StateFlags & 4` complete, so a
killed-then-completed install does not nag forever.

A pre-existing resume-trigger regression was caught and fixed in the same plan: setting
`steamResumePending: true` at install start reused a field `SteamGame.install()` already
read to decide whether to run `resumeInterruptedSteamInstall()`, so a live install's own
just-written breadcrumb could misidentify itself as a startup-detected resume and race its
own in-flight run. Fixed by gating that check on `!isNativeInstallInFlight(appId)`.

**Still open, narrowed scope:** the `## Design decision`'s DEFERRED startup filesystem orphan
scan — the only option that catches residue predating this breadcrumb (i.e. any install
already killed before this fix shipped) — remains unaddressed. This todo stays pending for
that reason; it is not being closed. See `.planning/quick/260821-rb5-steam-case-c-residue-persist-a-resume-br/260821-rb5-SUMMARY.md`
for the full task-by-task execution record.
