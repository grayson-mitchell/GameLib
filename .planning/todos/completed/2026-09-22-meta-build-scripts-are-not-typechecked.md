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

---

## Closed — 2026-09-23

Actioned by quick `260923-814`. Commit range `c43d6bdaf..f2033875a` (seven commits; note that
`d75429d15`, a `260923-89z` docs commit, interleaved in that range and belongs to a different
task).

### Option 2 chosen (D1)

A separate `tsconfig.meta.json` plus a second `tsc` invocation in `codecheck`. Option 1 was
rejected exactly on this todo's own measurement — widening `include` to `["src","meta"]` drags
~60 `meta/` scripts into ts-prune's population and exposes 73 used-in-module identities against a
ledger that closed at **0** the day before (quick `260922-vzw`). **`tsconfig.json` was not edited
at all**: `git diff c43d6bdaf..HEAD -- tsconfig.json` is empty. Both dead-code baselines are
likewise untouched, and `pnpm find-deadcode` read `unreachable: 47 OK | used-in-module: 0 OK`
after every one of the six commits.

### The include set is `["meta","src/common/typedefs/*.d.ts"]` (D2) — measured, not guessed

| include                                 | result |
| --------------------------------------- | ------ |
| `["src","meta"]` (this todo's recipe)   | 12 errors — the target set |
| `["meta"]`                              | **13** — adds a FABRICATED `meta/__tests__/ciTriggerWiring.test.ts(14,22) TS7016: Could not find a declaration file for module 'js-yaml'` |
| `["meta","src/common/typedefs"]`        | **13** — adds a FABRICATED `src/common/typedefs/extra-mock-function.ts(47,16) TS2664: Invalid module name in augmentation, module 'backend/config' cannot be found` |
| `["meta","src/common/typedefs/*.d.ts"]` | **12, identical to the target set** — chosen |

The repo's ambient module declarations live in `src/common/typedefs/`; a meta-only program drops
them, so `meta/` code importing an untyped package fails with a TS7016 that is an **artefact of
the config, not a defect**. The `*.d.ts` glob is load-bearing in the other direction too: that
directory also holds two non-declaration files, and `extra-mock-function.ts` augments
`backend/config`, which is not in this program. `src/frontend/typedefs/react-inert.d.ts` is not
needed — measured, not assumed. **Named negative signal for anyone touching this later: 13 errors
means the CONFIG is wrong, not that there is a 13th error to fix.**

Two inherited settings, confirmed by inspection rather than assumed:

- `baseUrl: "./src/"` is inherited and MUST stay inherited. `extends` resolves `baseUrl` relative
  to the file that DECLARES it, so it keeps pointing at `<root>/src/`. This is not incidental:
  `meta/__tests__/hardcodedStringGate.test.ts:1122` carries a baseUrl-relative specifier
  `'common/types/humble'`, which a redeclared `baseUrl` would break. The absence of any TS2307
  anywhere in the 12 is the positive evidence.
- `exclude: ["vite.config.ts","**/__mocks__/**","sign"]` is inherited too. **No `meta/**/__mocks__/**`
  path exists** (`find meta -path '*__mocks__*'` returns nothing), so that pattern silently
  excludes nothing from the new project today. It would start doing so the moment someone adds a
  `meta/__mocks__/` directory.

### Option 2's one weakness is closed structurally

`tsconfig.meta.json` declares **no `compilerOptions` at all** — its key set is exactly
`extends` + `include`, matching `tsconfig.eslint.json`'s shape. Every compiler setting is
inherited, so divergence from the app project is not expressible, not merely discouraged.
`meta/__tests__/tsconfigMeta.test.ts` asserts that key set, the `extends` target, the `*.d.ts`
glob (and that it is NOT the bare directory), and that `scripts.codecheck` still invokes both
projects. Its header states plainly what it does not prove: it never runs `tsc`.

### TS1501 was fixed at the source; `target` was NOT bumped (D3)

`meta/rebrandUpstreamCatalogs.ts:275` used `entry.split(/:(.*)/s)`; the `s` flag needs
`target: es2018+` and the inherited target is es2017. Rewritten as `/:([\s\S]*)/` and verified
equivalent at runtime over six inputs including embedded newlines.

The counter-argument was weighed and is real — these scripts run through `meta/runTs.cjs` at
`--target=node21/node22`, so es2017 is an inherited browser-era setting that does not describe
them. It loses anyway: a zero-`compilerOptions` config is the only version of option 2 with no
drift surface, which is the precise weakness this todo named. If `meta/` later genuinely needs
es2018+ **syntax**, that is a deliberate change with its own todo, not a side effect of this one.

### Correction to this todo: the real file set is 7, not 6

The `files:` frontmatter above lists 6 and **omits `meta/sidecarSeaFsShim.ts`, which owns 2 of
the 12** (both TS2322 at line 65). The per-code count table is correct; the file list was not.
That file is the highest-risk site in the set — it is `--inject`ed into the SEA bundle and
patches production `fs.readFileSync` — so omitting it from the file list understated the change's
blast radius. Its fix was verified by running the esbuild-bundled shim and comparing
`readFileSync` results before and after the patch across Buffer reads, encoding strings, options
objects, explicit `null` options, file-descriptor reads, ENOENT propagation and the zero-argument
`ERR_INVALID_ARG_TYPE` edge; the passthrough remains `.apply(fsModule, <the caller's own args>)`
and the `system.pem` short-circuit is untouched.

All 12 were fixed at the source. No `@ts-ignore`, no new `@ts-expect-error`, no `as any`, no new
`as unknown as`, and no compilerOption loosened or added anywhere.

### Negative control — the new gate can actually go red

With the wiring in place and the tree clean, the `/s` flag was reintroduced at
`rebrandUpstreamCatalogs.ts:278` and `pnpm codecheck` re-run:

```
> tsc --noEmit && tsc -p tsconfig.meta.json --noEmit
meta/rebrandUpstreamCatalogs.ts(278,54): error TS1501: This regular expression flag is only available when targeting 'es2018' or later.
 ELIFECYCLE  Command failed with exit code 2.
codecheck exit=2
```

Reverted, `pnpm codecheck` exit=0 again. The broken state was never committed. Without this the
wiring would be a green check proving nothing.

### Census addition

The `tsc`/`codecheck` call-site census was re-run before wiring. It found one site the plan did
not name: `.vscode/tasks.json:38` also runs `pnpm codecheck`. Like `.husky/pre-push:2` and
`.github/workflows/codecheck.yml:26`, it invokes the SCRIPT, so it picked up the second project
with no edit.
