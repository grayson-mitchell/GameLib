---
created: 2026-09-22T00:00:00.000Z
title: "`meta/` is outside the only tsconfig, so ~60 build and release scripts have NEVER been typechecked — enabling it surfaces 12 real errors in 6 files"
area: tooling
severity: medium
platform: any
ready: code
found_by: "quick-260922-n7s (measured while correcting a false claim in the dead-code ledger todo)"
files:
  - tsconfig.json
  - package.json
  - meta/hardcodedStringGate.ts
  - meta/machineFillGamelib.ts
  - meta/pruneStaleHelperBinaries.ts
  - meta/rebrandUpstreamCatalogs.ts
---

## Measured

`tsconfig.json` is the **only** tsconfig in the repo and carries `include: ["src"]`.
`pnpm codecheck` is bare `tsc --noEmit`, so it compiles exactly that set.

Consequence: **nothing typechecks `meta/`.** Measured with ts-morph during `260922-9um`, the
project loads 1141 source files, of which exactly **7** live under `meta/` and **zero** under
`meta/__tests__/` — and those 7 are pulled in only because some `src/**/__tests__` file imports
them. Every other `meta/` script — the build, release, signing, packaging, locale and gate
tooling — is compiled by nothing.

They are not unused. `package.json` runs them through `meta/runTs.cjs`, and several are release
blockers.

## What turning it on costs — 12 errors, 6 files

`npx tsc -p` against `{"extends":"./tsconfig.json","include":["src","meta"]}` exits **2**:

| code | count |
| ---- | ----- |
| TS2339 (property does not exist) | 4 |
| TS2345 (argument not assignable) | 3 |
| TS2322 (type not assignable) | 2 |
| TS2365 (operator cannot be applied) | 1 |
| TS2352 (conversion may be a mistake) | 1 |
| TS1501 | 1 |

Files: `meta/hardcodedStringGate.ts`, `meta/machineFillGamelib.ts`,
`meta/pruneStaleHelperBinaries.ts`, `meta/rebrandUpstreamCatalogs.ts`,
`meta/__tests__/lintTranslations.test.ts`, `meta/__tests__/machineFillGamelib.test.ts`.

Sample messages, verbatim:

```
Type 'null' is not assignable to type 'number | undefined'.
Type 'object' is not comparable to type 'string'.
Type 'string | number | null | undefined' is not assignable to type 'number | undefined'.
Property 'merged' is incompatible with index signature.
Type 'null' is not assignable to type 'MtManifest | undefined'.
Types of parameters 'code' and 'code' are incompatible.
```

12 errors across ~60 never-compiled files is a **small** blast radius — this is tractable, not a
quagmire.

## Reproduction

```bash
cat > tsconfig.measure.json <<'EOF'
{"extends":"./tsconfig.json","include":["src","meta"]}
EOF
npx tsc -p tsconfig.measure.json --noEmit   # exits 2, 12 errors
rm tsconfig.measure.json
```

## THE TRAP — this change turns `pnpm find-deadcode` RED

**Do not widen the tsconfig without planning for this.** Widening makes ~60 `meta/` scripts
analysed by ts-prune for the first time, so their own exports become findings. Measured in the
same run (quick `260922-n7s`):

| population | today | after widening | dissolved | newly exposed |
| ---------- | ----- | -------------- | --------- | -------------- |
| used-in-module | 67 | **108** | 32 | **73** |
| unreachable | 47 | 45 | 3 | 1 |

Both baselines are **zero-headroom in both directions**, so 74 `added` identities fail the gate
instantly, and `pnpm find-deadcode` sits in `.husky/pre-push`. Whoever takes this must resolve
those 74 at the source in the same change — the ledgers have **no** code path that admits an
entry, and adding one is explicitly rejected on the record.

This is why the dead-code todo does **not** own this work:
`2026-09-21-the-204-entry-used-in-module-ledger-freezes-an-export-keyword-cleanup.md` previously
called widening "the single highest-leverage move left," which the measurement above disproved.
**Typecheck coverage and ledger reduction are two different goods; widening delivers only the
first, and makes the second worse.** Judge this todo purely on the coverage.

## Options, none yet chosen

1. **Widen `include` to `["src", "meta"]`.** One project, everything checked. Fix 12 errors and
   resolve 74 new dead-code findings in the same change. Also changes what `baseUrl: "./src/"`
   means for `meta/` imports — verify.
2. **A second `tsconfig.meta.json` and a second `tsc` invocation in `codecheck`.** Keeps the app
   project's shape untouched and leaves `find-deadcode`'s population alone, since
   `meta/findDeadcode.cjs` hardcodes `TS_PRUNE_PROJECT = 'tsconfig.json'`. **Probably the cheaper
   path, and it decouples the two goods** — but it is a second source of compiler settings that
   can drift from the first, which is the kind of divergence this repo has recorded lessons about.
3. **Do nothing, deliberately.** Then record that `meta/` is unchecked where someone editing a
   build script will see it — an unwritten gap is worse than a declared one.

Option 2 is the recommendation, on the strength of leaving the ledger alone. Not decided.

## Why `severity: medium`

Nothing is currently broken — the scripts run, and their tests pass. But 12 real type errors are
sitting in release tooling with no gate able to see them, and the repo already has release legs
failing on both Linux and Windows. A defect class that no gate can observe is worth more than
`minor`; it is not `major` because nothing is measurably contaminated today.
