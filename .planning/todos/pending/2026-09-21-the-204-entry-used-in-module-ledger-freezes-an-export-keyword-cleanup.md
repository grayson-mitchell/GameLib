---
created: 2026-09-21T00:00:00.000Z
title: "The 204-entry `used-in-module` dead-code ledger freezes a mechanical `export`-keyword cleanup into perpetual one-line baseline edits"
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
---

## Precondition — check this first

This todo is about an artifact created by quick task `260922-9um`. **If
`meta/deadcode-baseline-used-in-module.txt` does not exist, that task did not land and this todo
is moot** — close it rather than reconstructing the premise.

## Measured

`260922-9um` replaced `ts-prune --error` with a two-population baseline ratchet. The larger
population is frozen in `meta/deadcode-baseline-used-in-module.txt`: **204 findings** at
`5c22b2566`, every one ending ` (used in module)`.

`(used in module)` does **not** mean dead code. It means the export **is** used — inside its own
file. ts-prune is reporting an unnecessarily-broad `export` keyword. The remedy is usually the
mechanical "drop the `export`", which is why freezing the population is worth revisiting: the
ledger is zero-headroom in both directions, so every un-export must be paired with deleting its
line from the baseline, forever, one line at a time.

That pairing is **self-enforcing, not a hazard** — `pnpm find-deadcode` is now in `.husky/pre-push`,
so an un-export without the paired baseline deletion goes red locally before it can reach CI. The
cost is friction, not risk.

## Triage — the 204 are not one population

Measured at `5c22b2566` against the captured ts-prune output (not re-read from the baseline file):

| bucket | count | what it is |
| ------ | ----- | ---------- |
| **A** | 21 | the finding lives in a `__tests__`/`__mocks__`/`*.test.ts` file — a test-internal helper. Un-exporting is trivially safe; nothing outside the file can want it. |
| **B** | 63 | production source, and the symbol name appears in ≥1 of the 459 test/mock TS files. **The `export` probably exists so a test can reach the symbol** — dropping it breaks the test. |
| **C** | 120 | production source, name appears in **no** test file. Candidates for a clean un-export. Split `src/` 105, `meta/` 15. |

**Both bucket boundaries are a proxy and are wrong in a known direction.** B/C is decided by a
whole-word name grep over test files, which:

- **inflates B** — a coincidental match (a same-named unrelated symbol, a string literal) counts as
  "a test needs it", so the true "needed by a test" count is **≤ 63** and C=120 is a **lower bound**
  on clean candidates;
- **can also leak into C** — a test reaching a symbol through a renamed barrel re-export, or
  dynamically, matches nothing.

No generic names (`default`, `Record`, `Props`, `State`, …) landed in either bucket, so the
contamination is smaller than it could have been — but **the remedy must re-derive these buckets,
not trust this table.** This repo has repeated lessons about a grep being confidently wrong in both
directions at once.

Densest clusters in bucket C, which is where a first batch should go:

```
 10  src/backend/storeManagers/steam/depot.ts
  7  src/backend/storeManagers/steam/depot/reconcile.ts
  6  meta/buildRunnersOnedir.ts
  4  meta/trayIconVariants.ts
  4  src/frontend/state/SteamSignOut.ts
  4  src/backend/storeManagers/steam/clientSetup.ts
  4  src/frontend/screens/Library/filterEngine.ts
  4  src/backend/storeManagers/steam/depot/hostHealth.ts
```

The two heaviest files overall are `meta/buildSidecarSea.ts` (25 findings) and
`meta/buildRunnersOnedir.ts` (14), across all buckets.

## The `meta/` half of bucket B needs a different remedy — tsconfig scope

`tsconfig.json` has `include: ["src"]`. Measured with ts-morph: the project loads 1141 source
files, of which exactly **7** live under `meta/` and **zero** under `meta/__tests__/`. Those 7 are
pulled in only because some `src/**/__tests__` file imports them.

Consequence: **a `meta/` export whose only importer is a `meta/__tests__` file is invisible to
ts-prune.** 51 of the 204 are `meta/` entries, and the split matters:

- **36** have a live `meta/__tests__` importer. The finding is a structural artifact, and
  un-exporting would break that test. Remedy is `// ts-prune-ignore-next` with a reason, not a
  source change.
- **15** have no importer anywhere. These are genuine over-broad exports and are the safe
  candidates — they are the `meta/` 15 of bucket C above, enumerated in the ledger's own cluster
  annotation.

Widening `tsconfig.json` to cover `meta/` would dissolve the 36 outright. That is a separate
decision with its own blast radius and is deliberately **not** proposed here.

## The two legitimate remedies, both already precedented here

1. **Drop the `export`** — the in-repo precedent is
   `src/frontend/screens/Game/GameSubMenu/repairFailure.ts:5`, which records the decision at the
   site: *"Not exported: used only within this module (ts-prune / `pnpm find-deadcode` flagged the
   previously-exported form as review finding IN-02 — there is no external consumer, so the export
   served no purpose)."* Copy that comment shape; a bare deletion loses the reasoning.
2. **`// ts-prune-ignore-next` with a reason** — for an export that is deliberate (bucket B, where
   a test is the only consumer). Already used at 4 sites: `src/backend/utils.ts:1809`,
   `src/backend/recent_games/recent_games.ts:64`, `src/common/types/ipc.ts:81` and `:185`.

Either remedy removes the finding, so **either one ends in deleting the matching baseline line** —
there is no third outcome where the line stays.

## Why `severity: minor`

Nothing is broken and nothing is contaminated. The ratchet works, the gate is green, and a new dead
export goes red. This is a backlog whose cost is friction: 204 lines of ledger that could be ~204
fewer, cleaned in batches. It is a rough edge with no live consequence.

## Suggested shape, if picked up

One commit per file cluster, not one sweep — un-export plus the paired baseline deletions in the
same commit, so `pnpm find-deadcode` is green at every commit. Start with bucket A (21, trivially
safe) and the `meta/` half of bucket C (15), which are build scripts with no runtime blast radius.
**Do not** attempt bucket B without checking each site's actual test importer first.

Deliberately **not** proposed: a `--update-baseline` flag to absorb the churn. `260922-9um`
rejected that on the record — it would destroy the `#` annotations in the ledger and be a
one-keystroke way to admit a genuinely new finding.
