---
task: 260822-s8y
title: "Wire MigrationSystem into the Tauri sidecar, and close the failure-lock that wiring would otherwise ship"
status: complete
date: 2026-08-22
branch: wt/smallstuff
resolves_todo: .planning/todos/completed/2026-08-16-legendary-config-migration-never-runs-under-tauri.md
files_modified:
  - src/backend/migration/migrations/legendary.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/__tests__/migrationsWiring.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
  - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
---

## What changed

`applyMigrations()` now runs under Tauri. It is wired into `sidecar/bootstrap.ts`'s `init()`,
once-guarded by `migrationsInitialized`, placed directly after `initLogger()` — matching Electron's
own ordering, where migrations are the very next statement after its `initLogger()`.

Before that could ship safely, `LegendaryGlobalConfigFolderMigration` had to be fixed.

## The todo's step 1, decided: keep the adoption

The todo offered deleting the machinery as a legitimate outcome ("dead machinery that presents as
live is the actual defect here"). Kept, because Epic/Legendary is live and primary in GameLib and
this is upstream-inherited user-facing behaviour — removing behaviour is the less reversible call to
make unilaterally. Deletion remains strictly smaller than this change if it is later wanted.

The todo's step 2 (verify the migration behaves under the sidecar before wiring) came out **clean on
paths**: `app.getPath('appData')` is shimmed by `pathShim.ts`'s `resolveAppDataDir`, and `userHome` /
`isSnap` / `legendaryConfigPath` are plain derivations. It did **not** come out clean on failure
handling.

## The failure-lock — the part that made this more than a wiring change

`legendary.ts` did `mkdir(legendaryConfigPath, { recursive: true })` **before** `cp`. Any failure
after that mkdir — partial copy, EACCES, disk full, a crash mid-copy — left the destination
directory existing. On the next launch the `hasHeroicSpecificConfig` check at the top of `run()`
answered `true`, so `run()` returned `true` on its first line and `MigrationSystem` recorded the
migration as **applied forever**, over a partial or empty config. Failure was indistinguishable from
success and could never retry.

Latent on Electron for as long as this migration has existed; wiring it into Tauri would have been
its first-ever run on the shipping runtime, with that behaviour intact.

Fixed by staging into a sibling `${legendaryConfigPath}.migrating` and `rename`-ing into place,
cleaning up staging on failure and rethrowing. A failed migration now leaves no destination and
retries next launch. The `mkdir` was also **redundant** — verified against the installed Node, not
assumed: `fs.cp(src, dest, { recursive: true })` creates the destination and its intermediate
directories itself. A sibling rather than `os.tmpdir()` because `rename` is only atomic within a
filesystem.

## What is deliberately NOT reproduced from Electron

Electron **awaits** migrations before `initStoreManagers()`. The sidecar cannot: `./handlers` is
imported at module scope, long before `init()` is ever called, so every store manager already exists
by then — and `initStoreManagers()` is itself dead under Tauri. `init()` is also synchronous by
contract, so the promise is floated as `fetchLastestReleases()` is.

**READY is not delayed on the migration**, and that is recorded in the code as a bounded limitation
rather than as proof of safety: the migration only does work when `legendaryConfigPath` is absent —
i.e. the user has never logged into Epic in GameLib — so a read that loses the race finds nothing,
which is exactly today's behaviour. A future migration needing a hard happens-before guarantee
against a handler will require `init()` to become async.

## Three problems the full-suite run surfaced

Running the whole `src/backend/sidecar` project (not just the new file) was what caught these. The
first is the one that matters.

**1. A regression I shipped in the previous commit.** `enrichmentFlows.test.ts`'s `getWikiGameInfo`
test was **already failing at HEAD** — established by reverting all three of this task's files and
re-running, which left exactly that one failure. Cause: quick task `260822-rc8`'s `staleWikiFetch`
rule treats a cached entry with no `fetchStatus` as a 403-era entry and re-fetches it, and this
fixture predates the field. I fixed two fixtures of exactly this class inside
`wiki_game_info.test.ts` and missed a third in a different directory, because I verified that commit
with `jest src/backend/wiki_game_info` alone. Fixture corrected, with a comment saying why the field
is load-bearing rather than noise.

**2. A latent race in `bootstrapWirings.test.ts`, exposed not created.** Its anticheat test did
`waitFor(() => existsSync(path))` and then asserted on the file's *contents*.
`downloadAntiCheatData` writes through `fs/promises.writeFile`, which opens with `O_TRUNC|O_CREAT`
and only then writes — so the file exists and is empty for a window, and the wait could return
inside it. Adding the migration's filesystem work to `init()` shifted scheduling enough to make it
fire intermittently (it passed alone and when paired, failed in the full run). Fixed by waiting on a
non-empty read — the condition the assertion actually depends on. Not papered over with a retry or a
sleep.

**3. `testContainment.test.ts` Block C fired correctly.** A new `*.test.ts` must be classified into
one of two declared lists. Added `migrationsWiring.test.ts` to `STRUCTURALLY_CONTAINED_SUITES` with
the docblock entry the convention requires, including the recount (47 files = 4 in-scope + 43). Worth
noting *why* it belongs there: it does real filesystem work under `homedir()` and declares no
`jest.mock('os')` of its own, relying entirely on `jest.setupContainment.ts`'s project-wide
disposable root — the exact "contained by construction" guarantee Block C exists to prove.

## Verification

- `pnpm exec jest src/backend` — **3920 passed, 2 skipped, 170 suites, 0 failed**.
- `pnpm exec jest src/backend/sidecar` run **three consecutive times** — 1023/1023, 47 suites, clean
  each time. Three runs specifically because problem 2 was intermittent; one green run would not
  have been evidence.
- **RED-proven in two independent halves**, each by reverting one file to its HEAD version with
  `git show` (no `git stash`, no `git reset` — the stash stack is shared with concurrent sessions)
  and restoring from a scratchpad copy:
  - Revert **`bootstrap.ts`** → **1 failed / 3 passed**: only "runs the Legendary adoption on the
    sidecar boot path" fails (it times out, because with no wiring the copy never happens).
  - Revert **`legendary.ts`** → **2 failed / 2 passed**: both failure-lock tests fail; the two
    wiring tests still pass, correctly, since the happy path is unaffected by the staging change.
- `pnpm exec tsc --noEmit` — exit 0.
- `eslint -f json` over all six changed files, filtered to `severity === 2` — 0 errors.

## Known vacuity, recorded in the test rather than hidden

`migrationsWiring.test.ts`'s idempotency test **also passes against a `bootstrap.ts` with no wiring
at all** — RED-proof 1 failed only its sibling. It is meaningful solely in sequence with the test
above it, which is what establishes that migrations run at all. That is stated in the test body so
nobody reads a green there as evidence of wiring.

A second self-check caught before commit: the retry test's final content assertion was written as a
bare `expect(promise).resolves.toBe(...)` with no `await` — an assertion that can never fail.
Corrected, with the reason noted inline.
