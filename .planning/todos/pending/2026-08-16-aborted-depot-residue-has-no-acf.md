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

## Provenance

Split out of `.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md`
during execution of quick task `260816-vgc`, 2026-08-16 — the fourth "what good looks like"
bullet on that todo (partial-byte/`.acf` reconcilability) was explicitly out of scope for the
abort-routing fix. See that file's `## Resolution` section for the full closure/deferral
accounting.
