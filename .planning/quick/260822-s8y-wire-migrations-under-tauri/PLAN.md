---
task: 260822-s8y
title: "Wire MigrationSystem into the Tauri sidecar, and close the failure-lock that wiring would otherwise ship"
date: 2026-08-22
branch: wt/smallstuff
resolves_todo: .planning/todos/pending/2026-08-16-legendary-config-migration-never-runs-under-tauri.md
files:
  - src/backend/migration/migrations/legendary.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/__tests__/migrationsWiring.test.ts
---

## Problem

`MigrationSystem.get().applyMigrations()` has exactly one call site — `src/backend/main.ts:412`,
inside Electron's `app.whenReady()`. The Tauri sidecar never runs that block, so:

1. `LegendaryGlobalConfigFolderMigration` has never run on the shipping runtime.
2. Any future `Migration` added to `getAllMigrations()` is a silent no-op there.

## Facts established at HEAD

| Claim | Evidence |
| --- | --- |
| One call site | `main.ts:412` (the todo said 418 — drifted). `grep` over `src`+`meta` finds no other. |
| `bootstrap.ts` `init()` does not call it | Read end to end: logger → shell-exe receipt → asset-root self-check → i18next → RPC → protocol → secret stores → online monitor → anticheat → releases → READY → protocol URL. No migrations. |
| The migration's deps are all satisfied under the sidecar | `app.getPath('appData')` is shimmed (`pathShim.ts` `resolveAppDataDir`); `userHome`, `isSnap`, `legendaryConfigPath` are plain path derivations; `access`/`cp`/`mkdir` are real `fs/promises`. **The todo's step-2 evaluation comes out clean.** |

## Decision on the todo's step 1 — keep the adoption

The todo offers deleting the machinery as a legitimate outcome. Keeping it, because Epic/Legendary
is live and primary in GameLib and this is upstream-inherited user-facing behaviour; removing
behaviour is the less reversible call. If it later turns out unwanted, deletion is strictly smaller
than this change.

## A latent failure-lock, which wiring would ship

`legendary.ts` does `mkdir(legendaryConfigPath, { recursive: true })` **before** `cp`. So any
failure after that mkdir — partial copy, crash, EACCES, disk full — leaves the destination
directory existing. On the next launch `hasHeroicSpecificConfig` is `true`, `run()` returns `true`
on its first line, and `MigrationSystem` records the migration as **permanently applied** over a
partial or empty config.

Empirically verified in the scratchpad: `fs.cp(src, dest, { recursive: true })` creates the
destination **and its intermediate directories** itself, so the pre-`mkdir` is redundant as well
as harmful.

Fixed by staging into a temp sibling and renaming into place, cleaning up staging on failure — a
failed migration then leaves no destination and retries next launch. Both existing
early-return-`true` branches stay: they are correct "nothing to do" answers, not failures.

## Wiring

`applyMigrations()` into `bootstrap.ts` `init()`, once-guarded with a module-level boolean like the
neighbouring `onlineMonitorInitialized` / `releasesFetchInitialized`, placed directly after the
`initLogger()` block (the migration logs, and `heroicLogWriter` is unset before that). `init()` is
synchronous and its signature does not change, so the promise is floated with an explicit
`.catch()` plus a `try`/`catch`, as `fetchLastestReleases()` is.

### What cannot be reproduced, stated plainly

Electron **awaits** migrations before `initStoreManagers()`. The sidecar cannot: `./handlers` is
imported at module scope long before `init()` runs, so store managers already exist — and
`initStoreManagers()` is itself dead under Tauri. The real constraint is "before the first
legendary config read", which arrives as an RPC call after `READY_SENTINEL`.

**READY is deliberately not delayed on the migration.** Acceptable because the migration only does
work when `legendaryConfigPath` is absent — i.e. the user has never logged into Epic in GameLib —
so a read that loses the race finds nothing, which is exactly today's behaviour, and the copy is
local I/O started milliseconds into boot. Recorded as a known bounded limitation, not as "fine".

## Tests

New `src/backend/sidecar/__tests__/migrationsWiring.test.ts`, modelled on the existing
`onlineMonitorWiring.test.ts` — including its `jest.mock('os')` disposable-tmp-homedir guard
(without it `pathShim` resolves the developer's real `~/Library/Application Support/GameLib/`, a
documented data-loss hazard) and its `jest.mock('electron')`/`jest.mock('electron-store')`
real-shim routing.

1. The runner **is** invoked on the sidecar boot path.
2. A second and third `init()` does not re-run it.
3. Failure-lock closed: a rejecting `cp` leaves **no** `legendaryConfigPath` on disk and is **not**
   recorded in `appliedMigrations`.

RED-proven against the unfixed code via a scratchpad copy — never `git stash`, never `git reset`.

## Gates to run after

`appShellImportGate.test.ts` (asserts `bootstrap.ts` never references `configStore` — the new
import reaches `migrationsStore`, a different store, but prove it), `structuralContainment.test.ts`,
`electronReachLedger.test.ts`, the full `src/backend/sidecar` suite, `tsc --noEmit`, and eslint
filtered to `severity === 2`.
