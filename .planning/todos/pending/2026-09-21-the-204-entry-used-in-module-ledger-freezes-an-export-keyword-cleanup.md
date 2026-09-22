---
created: 2026-09-21T00:00:00.000Z
title: "The used-in-module dead-code ledger (170 identities remaining, down from the 203 this todo was filed against) still freezes a mechanical `export`-keyword cleanup into perpetual one-line baseline edits"
area: tooling
severity: minor
platform: any
ready: code
found_by: "quick-260922-9um (planner concern, raised during planning and deliberately not bundled)"
files:
  - meta/deadcode-baseline-used-in-module.txt
  - meta/findDeadcode.cjs
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/depot/reconcile.ts
  - meta/buildRunnersOnedir.ts
  - meta/buildSidecarSea.ts
  - meta/releaseTags.ts
---

## Precondition — check this first

This todo is about an artifact created by quick task `260922-9um`. **If
`meta/deadcode-baseline-used-in-module.txt` does not exist, that task did not land and this todo
is moot** — close it rather than reconstructing the premise.

## Status — 33 of 203 shipped by quick task `260922-k2o` (2026-09-22)

This task is NOT closed by that work: `260922-k2o` shipped bucket A (21 test-internal symbols) and
the safe two-thirds of the `meta/` half of bucket C (12 symbols), landing at commits `a76bfbb5d`,
`f7269b413`, `5938867ac`, `6a8f3ef89`. `pnpm find-deadcode` is green throughout:
`unreachable: 47 OK | used-in-module: 170 OK` (was 203; `unreachable` never moved). The remaining
scope below — bucket B (64), the 2 parked `meta/` entries in bucket C, and the `src/` half of
bucket C (104) — is untouched and is what picking this todo back up means.

**The re-derivation also corrected the ledger's own annotation, and that correction matters for
the next reader as much as the count does**: 3 of the 15 entries the ledger called "safe
candidates" were NOT safe, and are recorded by name below.

## Measured

`260922-9um` replaced `ts-prune --error` with a two-population baseline ratchet. The larger
population is frozen in `meta/deadcode-baseline-used-in-module.txt`: **204 findings** at
`5c22b2566` (203 after `260922-e01`'s parse-artifact exclusion; **170** after `260922-k2o`), every
one ending ` (used in module)`.

`(used in module)` does **not** mean dead code. It means the export **is** used — inside its own
file. ts-prune is reporting an unnecessarily-broad `export` keyword. The remedy is usually the
mechanical "drop the `export`", which is why freezing the population is worth revisiting: the
ledger is zero-headroom in both directions, so every un-export must be paired with deleting its
line from the baseline, forever, one line at a time.

That pairing is **self-enforcing, not a hazard** — `pnpm find-deadcode` is now in `.husky/pre-push`,
so an un-export without the paired baseline deletion goes red locally before it can reach CI. The
cost is friction, not risk.

## Triage — the (now 170) remaining are not one population

Re-derived by `260922-k2o` at `6c220b99f`, by `require`-ing `meta/findDeadcode.cjs`'s own exported
helpers (`collectFindings` → `parseFinding` → `excludeKnownParseArtifacts` → `partitionFindings`),
so the population is the gate's population by construction, not a re-implementation of it. Bucketed
by whole-word name search over **all 1218 tracked `.ts`/`.tsx` files**, split 463 test / 755
non-test:

| bucket | 2026-09-21 count | re-derived (`260922-k2o`) | shipped | remaining | what it is |
| ------ | ----------------- | -------------------------- | ------- | --------- | ---------- |
| A | 21 | 21 | 21 | **0** | finding lives in a test/mock/fixture file — DONE |
| B | 63 | 64 | 0 | **64** | production source, name also appears in ≥1 test file |
| C (`meta/`) | 15 | 14, then found to be 12 safe + 2 NOT safe | 12 | **2, and NOT safe** | see below |
| C (`src/`) | 105 | 104 | 0 | **104** | production source under `src/`, no test-file match |

`DownloadedBinary` is the third named trap below, but it is counted in bucket B, not
`C (meta/)`: `meta/__tests__/findDeadcode.test.ts` mentions it in a prose comment, which is
enough for the test-file whole-word search to land it in B. So the reconciliation is
B + C(`meta/`) + C(`src/`) = 64 + 2 + 104 = **170**, matching `find-deadcode` exactly. The
earlier draft of this table double-counted it under `C (meta/)` as a 3rd "not safe" row and
also carried over a stale `15` instead of the re-derived `14`, which together produced a 171
that never reconciled.

**Both bucket boundaries are still a proxy and still wrong in a known direction** for the remaining
population — see the original triage note preserved below. **The remedy must re-derive these
buckets at pickup time, not trust this table.** This repo has repeated lessons about a grep being
confidently wrong in both directions at once, and this todo's own history is now itself an example
of that: see "3 of the ledger's 15 'safe candidates' were NOT safe" below.

### The 3 `meta/` entries that looked safe and are NOT — stay exported, stay in the ledger

The original 2026-09-21 triage enumerated 15 `meta/` entries as *"NO importer anywhere — not in
meta/\_\_tests\_\_, not in src/\*\*/\_\_tests\_\_, nowhere."* That search was over **test/mock
files only**. It never looked at non-test `meta/` files, and three entries have a live non-test
importer or a deliberate re-export. `260922-k2o` shipped the other 12 and left these 3 exported:

| entry | why it is NOT safe to un-export |
| ----- | -------------------------------- |
| `meta/buildRunnersOnedir.ts - InvocationForm` | `meta/runnerBuildInvocations.ts:62` does `import type { InvocationForm, OnedirRunnerName } from './buildRunnersOnedir'`. Invisible to ts-prune only because `tsconfig.json`'s `include: ["src"]` never loads that importer. |
| `meta/buildSidecarSea.ts - DECOMPRESS_WORKER_ENTRY_PATH` | Not a declaration at all — a **deliberate re-export** (`buildSidecarSea.ts:159-166`) of a symbol owned by `meta/esbuildWorkerBundleShared.ts:31`, carrying an in-situ comment explaining why the block exists. |
| `meta/releaseTags.ts - DownloadedBinary` | `meta/downloadHelperBinaries.ts:15` imports the type. Same tsconfig-scope invisibility. |

**Do not attempt these three again without a materially different check** — the failure mode that
put them on the "safe" list once (test/mock-only importer search) is exactly the failure mode this
correction fixed, and re-running the same kind of search will reproduce the same wrong answer.

Two bucket-A entries pointed the other way in the original triage — the name-grep *inflated* them
and they turned out to be safe (both shipped in `260922-k2o`):

- `constants.test.ts - overrideProcessPlatform` (4 other test files hit) — each hit was a
  **separately declared** `function overrideProcessPlatform` in that file, not an import.
- `sidecarHarness.ts - collectFrames` (4 other test files hit) — likewise, each of the four
  declared its own local `function collectFrames`.

## The `meta/` half of bucket B needs a different remedy — tsconfig scope

`tsconfig.json` has `include: ["src"]`. Measured with ts-morph: the project loads 1141 source
files, of which exactly **7** live under `meta/` and **zero** under `meta/__tests__/`. Those 7 are
pulled in only because some `src/**/__tests__` file imports them.

Consequence: **a `meta/` export whose only importer is a `meta/__tests__` file is invisible to
ts-prune.** The `meta/` entries remaining in the ledger split into two kinds, and the split
matters:

- **36** have a live `meta/__tests__` importer. The finding is a structural artifact, and
  un-exporting would break that test. Remedy is `// ts-prune-ignore-next` with a reason, not a
  source change.
- **3** (the table above) have a live non-test importer, invisible for the same tsconfig-scope
  reason. These are NOT bucket-B in the traditional "a test needs it" sense — no test imports them
  — but they are equally not safe to un-export.

Widening `tsconfig.json` to cover `meta/` would dissolve the 36 outright. That is a separate
decision with its own blast radius and is deliberately **not** proposed here.

## The two legitimate remedies, both already precedented here

1. **Drop the `export`** — the in-repo precedent is
   `src/frontend/screens/Game/GameSubMenu/repairFailure.ts:5`, which records the decision at the
   site: *"Not exported: used only within this module (ts-prune / `pnpm find-deadcode` flagged the
   previously-exported form as review finding IN-02 — there is no external consumer, so the export
   served no purpose)."* Copy that comment shape; a bare deletion loses the reasoning. `260922-k2o`
   used this shape at all 33 sites it touched.
2. **`// ts-prune-ignore-next` with a reason** — for an export that is deliberate (bucket B, where
   a test is the only consumer). Already used at 4 sites: `src/backend/utils.ts:1809`,
   `src/backend/recent_games/recent_games.ts:64`, `src/common/types/ipc.ts:81` and `:185`.

Either remedy removes the finding, so **either one ends in deleting the matching baseline line** —
there is no third outcome where the line stays.

## Why `severity: minor`

Nothing is broken and nothing is contaminated. The ratchet works, the gate is green, and a new dead
export goes red. This is a backlog whose cost is friction: 170 lines of ledger that could be
fewer, cleaned in batches. It is a rough edge with no live consequence.

## Suggested shape, if picked up

Remaining scope: bucket B (64), the 2 parked `meta/` entries in bucket C, and the `src/` half of
bucket C (104). One commit per file cluster,
not one sweep — un-export plus the paired baseline deletions in the same commit, so
`pnpm find-deadcode` is green at every commit. **Do not** attempt bucket B without checking each
site's actual test importer first, and **do not** re-attempt the 3 named `meta/` entries above
without a check that actually covers non-test files this time.

Densest clusters, per the original 2026-09-21 capture (re-derive before acting):

```
 10  src/backend/storeManagers/steam/depot.ts
  7  src/backend/storeManagers/steam/depot/reconcile.ts
  4  src/frontend/state/SteamSignOut.ts
  4  src/backend/storeManagers/steam/clientSetup.ts
  4  src/frontend/screens/Library/filterEngine.ts
  4  src/backend/storeManagers/steam/depot/hostHealth.ts
```

Deliberately **not** proposed: a `--update-baseline` flag to absorb the churn. `260922-9um`
rejected that on the record — it would destroy the `#` annotations in the ledger and be a
one-keystroke way to admit a genuinely new finding. `260922-k2o` re-rejected it on the same
grounds.
