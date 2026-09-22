---
created: 2026-09-21T00:00:00.000Z
title: "The used-in-module dead-code ledger is down to 67 (from the 203 this todo was filed against); the mechanical `export`-keyword cleanup is DONE and only bucket B — where a test may be the sole consumer — remains"
area: tooling
severity: minor
platform: any
ready: code
found_by: "quick-260922-9um (planner concern, raised during planning and deliberately not bundled)"
files:
  - meta/deadcode-baseline-used-in-module.txt
  - meta/findDeadcode.cjs
  - meta/buildRunnersOnedir.ts
  - meta/buildSidecarSea.ts
  - meta/releaseTags.ts
  - src/backend/testUtils/fakeHomeProfile.ts
---

## Precondition — check this first

This todo is about an artifact created by quick task `260922-9um`. **If
`meta/deadcode-baseline-used-in-module.txt` does not exist, that task did not land and this todo
is moot** — close it rather than reconstructing the premise.

## Status — 136 of 203 shipped; 67 remain

| task | date | shipped | ledger after |
| ---- | ---- | ------- | ------------- |
| `260922-9um` | 2026-09-21 | built the ratchet | 204 (203 after `260922-e01`) |
| `260922-k2o` | 2026-09-22 | 33 — bucket A (21) + `meta/` bucket C (12) | **170** |
| `260922-lh4` | 2026-09-22 | 103 — the whole `src/` half of bucket C | **67** |

`pnpm find-deadcode` green throughout: `unreachable: 47 OK | used-in-module: 67 OK`. **`unreachable`
has never moved off 47**, and **no line has ever been ADDED to either baseline** — verified by
diffing each task's full commit range.

**The mechanical half of this todo is finished.** Bucket C is exhausted apart from three entries
that are permanently parked (below). What remains is bucket B, which is *not* mechanical.

## What remains — 67 = bucket B (64) + 3 parked

Re-derived at `69fbc76ad` by `require`-ing `meta/findDeadcode.cjs`'s own exported helpers
(`collectFindings` → `parseFinding` → `excludeKnownParseArtifacts` → `partitionFindings`), so the
population is the gate's population by construction. Bucketed over all 1218 tracked `.ts`/`.tsx`
files (463 test / 755 non-test).

| bucket | remaining | split | what it is |
| ------ | --------- | ----- | ---------- |
| A | **0** | — | DONE by `260922-k2o` |
| B | **64** | `meta/` 37, `src/` 27 | the symbol name appears in ≥1 test file — a test may be the only consumer |
| C | **3** | `meta/` 2, `src/` 1 | the parked traps below. **Not safe. Do not retry.** |

Ledger file split: `meta/` 39, `src/` 28. Reconciles: 64 + 3 = 67. ✓

## The 4 parked entries — stay exported, stay in the ledger

Each has a live importer that ts-prune cannot see. **Three sit in bucket C; `DownloadedBinary`
sits in bucket B** because a `meta/__tests__/findDeadcode.test.ts` prose comment mentions its name
— which is why bucket C shows 3, not 4.

| entry | the importer ts-prune cannot see |
| ----- | -------------------------------- |
| `meta/buildRunnersOnedir.ts - InvocationForm` | `meta/runnerBuildInvocations.ts:62` — `import type { InvocationForm, OnedirRunnerName }` |
| `meta/buildSidecarSea.ts - DECOMPRESS_WORKER_ENTRY_PATH` | not a declaration — a **deliberate re-export** (`buildSidecarSea.ts:159-166`) of a symbol owned by `meta/esbuildWorkerBundleShared.ts:31` |
| `meta/releaseTags.ts - DownloadedBinary` | `meta/downloadHelperBinaries.ts:15` |
| `src/backend/testUtils/fakeHomeProfile.ts - FakeHomeEnvKey` | `meta/captureShellScrollback.ts:71-72`, used at `:596`. That file is only ever **spawned**, never imported — `src/backend/__tests__/shellDiagPersistence.test.ts` names it as a string literal — so it is outside the analysed project. |

### The mechanism, and the correction it forced

`tsconfig.json` has `include: ["src"]`. A file outside that set is not analysed, so **an import
made from it is invisible to ts-prune** and the imported symbol is reported as merely
"used in module".

`260922-lh4`'s own plan asserted this blind spot "cannot apply under `src/`, because everything
under `src/` is in the analysed project." **That is wrong, and `FakeHomeEnvKey` disproves it:**
the symbol is declared in `src/`, but its only importer is a non-test `meta/` file. **What matters
is where the IMPORTER lives, not where the declaration lives.** Any future triage must apply the
check on that basis.

## Method that works — use it, do not trust any table in this file

1. Derive the population from the gate's own helpers (above). Never re-implement the parse.
2. Check each candidate against **all tracked files** — `git ls-files '*.ts' '*.tsx'` plus
   `.cjs/.mjs/.js/.json/.yml/.rs` — not just test files.
3. **Strip comments before judging.** Measured across both tasks: the large majority of
   "this symbol is referenced elsewhere" hits were **prose comments** or **separately declared
   same-named locals**, not imports. Examples: `passesCollection`, `DepotDownloadOutcome`,
   `ChunkAttemptEvent`, `WinetricksRowState`, `passesStore` (all comment-only);
   `maxRecentGames`, `SteamLibraryTarget`, `overrideProcessPlatform`, `collectFrames` (all
   separately declared locals).
4. **Open every candidate the search calls contended AND every one it calls clean.** This file's
   own history is the cautionary tale: its original "15 safe candidates" list was derived from a
   test-file-only grep and was wrong in both directions at once.

## Remedies — both precedented here

1. **Drop the `export`** — precedent `src/frontend/screens/Game/GameSubMenu/repairFailure.ts:5`.
   Copy that comment shape; a bare deletion loses the reasoning. Used at all 136 sites so far.
2. **`// ts-prune-ignore-next` with a reason** — for a deliberate export. Used at
   `src/backend/utils.ts:1809`, `src/backend/recent_games/recent_games.ts:64`,
   `src/common/types/ipc.ts:81` and `:185`.

Either removes the finding, so **either ends in deleting the matching baseline line.** There is no
third outcome.

## Picking up bucket B — what makes it different

Bucket B is **not** a mechanical sweep, and the todo has said so since it was filed:
**do not un-export a bucket-B entry without opening its actual test importer first.**

- **`meta/` 37 of the 64.** Measured: 36 have a live `meta/__tests__` importer. Un-exporting
  breaks that test. The remedy is `// ts-prune-ignore-next` with a reason — *or* widening
  `tsconfig.json` to cover `meta/`, which would dissolve all 36 outright. **That widening is the
  single highest-leverage move left on this todo and is still an open decision** with its own
  blast radius; it is deliberately not proposed here.
- **`src/` 27 of the 64.** Each needs its named test opened individually. Some will be genuine
  test-only consumers (keep the export, ignore-next); some will be comment/coincidental matches
  like the ones above (safe to un-export).

## Two gotchas measured while shipping the 136

- **Un-exporting can trip `no-unused-vars`.** `WINETRICKS_CHANNELS`
  (`src/frontend/helpers/declaredUnavailable.ts`) is referenced only as
  `(typeof WINETRICKS_CHANNELS)[number]`. An **exported** binding is exempt from that rule; a
  module-private one is not, so the un-export surfaced a latent error. Fixed with a reasoned
  `// eslint-disable-next-line`, negative-controlled (removing it errors) so it is not an orphaned
  suppression. Expect this wherever the only use is type-level.
- **Un-exporting can shorten a line under prettier's wrap threshold**, turning a multi-line
  signature into a one-liner prettier then demands. Hit `encodeRgba`, `StoreSearchStatus`,
  `HumbleOrderCacheEntryInternal`. Run `npx prettier --check meta/ src/` before every commit.

## Why `severity: minor`

Nothing is broken and nothing is contaminated. The ratchet works, the gate is green, a new dead
export goes red, and the ledger has only ever shrunk. The cost is friction, not risk.

## Non-negotiables

- **The ledger may only shrink.** No code path adds to it; neither should you.
- **Un-export + baseline deletion in the SAME commit**, so `find-deadcode` is green at every
  commit — `.husky/pre-push` runs it.
- **No `--update-baseline` flag.** Rejected on the record by `260922-9um` and again by
  `260922-k2o`: it would destroy the `#` annotations and be a one-keystroke way to admit a real
  finding.
- Do not touch `meta/deadcode-baseline-unreachable.txt` or `meta/findDeadcode.cjs` — the gate is
  correct; only its input population shrinks.
