---
created: 2026-08-16T23:40:00.000Z
title: "MigrationSystem is dead code under Tauri — applyMigrations() is wired only into Electron's app.whenReady(), so the Legendary config migration has never run on the Tauri build and any future Migration ships as a silent no-op"
area: backend
severity: low
found_by: "Quick task 260816-hdg (pre-D-17 steam_metadata residue fix, 2026-08-16) — while evaluating the todo's proposed startup-migration option"
files:
  - src/backend/main.ts
  - src/backend/migration/index.ts
  - src/backend/migration/migrations/legendary.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/storeRegistration.ts
---

## Problem

`MigrationSystem.get().applyMigrations()` has exactly ONE call site in the repo:

- `src/backend/main.ts:418`, inside `app.whenReady().then(async () => { … })`

The Tauri sidecar never runs that block. `src/backend/sidecar/bootstrap.ts` replicates the
Electron `whenReady` inits **one at a time** (`initOnlineMonitor()`, `installTokenStore()`, …,
each with its own placement comment explaining why it sits where it does) — and migrations are
**not** among them.

Two consequences:

1. **`LegendaryGlobalConfigFolderMigration` — the only shipped migration — has never run on the
   Tauri build.** It adopts a pre-existing global Legendary config folder
   (`join(app.getPath('appData'), 'legendary')` on Linux, `~/.config/legendary` everywhere else) into
   `legendaryConfigPath` when GameLib has no config of its own. On Tauri that adoption silently
   does not happen: a user with an existing Legendary install starts from an empty config
   instead of inheriting it.
2. **Any future `Migration` class added to `getAllMigrations()` ships as a silent no-op** in the
   shipping runtime — code that reviews as correct, passes its tests, and changes nothing.

## Why it is easy to miss

`src/backend/sidecar/storeRegistration.ts:109,191` imports and registers `migrationsStore`
(from `migration/electronStores.ts`, which exists as a separate thin module precisely so
registration can import it without instantiating `MigrationSystem`). So the migration system
**looks wired into the sidecar** when you grep for `migration` — but only its *store* is
registered, never its *runner*.

This is the same class of defect as phase 33's `initOnlineMonitor()` gap: an Electron
`app.whenReady()` init that the headless sidecar never replicates, producing no error and no
log line. Migrations are an unnoticed casualty of that same audit.

## Impact

Low and latent — there is no reported symptom, and the single existing migration is a
convenience adoption rather than a correctness requirement. The severity is in the **trap it
sets for future work**: this is dead machinery that presents as live, and the next person to
write a data migration will get a silent no-op.

Quick task `260816-hdg` hit exactly this: the pre-D-17 `steam_metadata` residue todo proposed
"stamp a cache version / clear the flag on startup" as its cleanest option. That option was
rejected on this evidence and replaced with read-boundary normalization, which is
runtime-independent and needs no startup wiring.

## How to fix

**Do not assume the obvious fix is safe.** Wiring `await MigrationSystem.get().applyMigrations()`
into `sidecar/bootstrap.ts`'s `init()` would make the system live under Tauri — but it would
also **start running `LegendaryGlobalConfigFolderMigration` in the sidecar for the first time
ever**. That migration does a recursive `cp` of a directory outside GameLib's own config root.
Its behaviour under the sidecar (path resolution via the `electronStub`'s `app.getPath`, the
`isLinux` branch, and what happens if the copy partially fails) has never been exercised and
must be evaluated, not assumed.

So, in order:

1. Decide whether the Legendary adoption is still wanted at all on the Tauri build. If it is
   not, delete the migration and the system rather than wiring it — dead machinery that
   presents as live is the actual defect here.
2. If it is wanted: verify `LegendaryGlobalConfigFolderMigration.run()` behaves correctly under
   the sidecar (paths, the `isLinux` branch, partial-copy failure) BEFORE wiring anything.
3. Only then wire `applyMigrations()` into `bootstrap.ts` `init()`, once-guarded the way
   `initOnlineMonitor()` is, and placed with the same kind of explanatory comment the
   neighbouring inits carry.
4. Add a test asserting the runner is invoked on the sidecar path, so this cannot silently
   regress a third time.

**Prefer normalizing at the read boundary** for any new data-shape fix, rather than adding a
migration — it works in both runtimes with no wiring, as `steam/metadataCapture.ts` now
demonstrates.

## Resolution — CLOSED (2026-08-22, quick task 260822-s8y)

Summary: `.planning/quick/260822-s8y-wire-migrations-under-tauri/SUMMARY.md`

All four of this todo's steps discharged, in the order it specified.

**Step 1 — decided: KEEP the adoption, do not delete the system.** Epic/Legendary is live and
primary in GameLib, and this is upstream-inherited user-facing behaviour; removing behaviour is the
less reversible call. Deletion remains strictly smaller than the change that was made, if it is
ever wanted.

**Step 2 — evaluated BEFORE wiring, as this todo insisted. Paths clean, failure handling NOT.**
Path resolution under the sidecar is fine: `app.getPath('appData')` is shimmed by `pathShim.ts`'s
`resolveAppDataDir`, and `userHome`/`isSnap`/`legendaryConfigPath` are plain derivations. But the
partial-copy question this todo raised has a bad answer: `mkdir(legendaryConfigPath)` ran BEFORE
`cp`, so any post-mkdir failure left the destination existing, making the next launch's
`hasHeroicSpecificConfig` check return true and recording the migration as applied FOREVER over a
partial or empty config. Latent on Electron; wiring would have been its first real run.
**Fixed first**, by staging into `${legendaryConfigPath}.migrating` and renaming into place. The
`mkdir` was also redundant — `fs.cp(..., {recursive:true})` creates the destination itself
(verified against the installed Node, not assumed).

**Step 3 — wired** into `sidecar/bootstrap.ts` `init()`, once-guarded like `initOnlineMonitor()`,
directly after `initLogger()`. The placement comment records what CANNOT be reproduced: Electron
awaits migrations before `initStoreManagers()`, but `./handlers` is imported at module scope long
before `init()` runs, so store managers already exist. READY is deliberately not delayed — written
up as a bounded limitation, not as safety.

**Step 4 — tested.** `src/backend/sidecar/__tests__/migrationsWiring.test.ts` drives the REAL
migration against a real (containment-rooted) filesystem rather than asserting a mocked runner was
called. RED-proven in two independent halves: reverting `bootstrap.ts` fails only the wiring test;
reverting `legendary.ts` fails only the two failure-lock tests.

**Two defects surfaced by running the FULL sidecar project rather than just the new file**, both
fixed here and both worth knowing about:

1. `enrichmentFlows.test.ts` was **already red at HEAD** — a regression from quick task 260822-rc8
   the day before. Its `staleWikiFetch` rule re-fetches any cached entry lacking `fetchStatus`, and
   this fixture predates the field. Two fixtures of that class were fixed inside
   `wiki_game_info.test.ts`; this third one, in another directory, was missed because that commit
   was verified with `jest src/backend/wiki_game_info` alone.
2. `bootstrapWirings.test.ts` carried a latent race — it waited on `existsSync` and asserted on file
   CONTENTS, while `writeFile` opens `O_TRUNC|O_CREAT` before writing. Adding migration I/O to
   `init()` shifted scheduling enough to expose it. Now waits on a non-empty read.

The todo's closing advice stands unchanged and was NOT weakened by this fix: **prefer normalizing at
the read boundary for any new data-shape fix.** A migration is now genuinely live under Tauri, but
it still runs fire-and-forget with no happens-before guarantee against a handler — read-boundary
normalization needs no wiring and no ordering argument at all.
