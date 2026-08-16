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
`appmanifest_*.acf` ever written — the `.acf` is only written on a successful completion.
Phase 23-03's reconciler keys off the presence of an `.acf` to identify installed/resumable
Steam games, so a partial directory with no manifest is invisible to it: not resumable
through the normal path, not cleaned up, not surfaced to the user as anything other than
silent disk usage.

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
