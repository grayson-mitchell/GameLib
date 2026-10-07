---
created: 2026-10-05T00:00:00.000Z
title: "jest --runInBand heap grows across suites — main already peaks at 4078 MB, the edge of CI's default V8 limit"
area: testing
severity: medium
platform: any
ready: code
found_by: "PR grayson-mitchell/GameLib#8 CI, 2026-10-05: the `ci` job died with 'JavaScript heap out of memory' (exit 134)"
files:
  - package.json
  - .github/workflows/test.yml
  - jest.config.js
---

## Problem

`pnpm test:ci` runs `jest --runInBand`, and the heap grows from suite to suite instead of being
reclaimed between them. Measured on 2026-10-05 with `--logHeapUsage` and an 8 GB ceiling:

| tree | suites | peak heap |
|---|---|---|
| `main` (`5927806`) | 450 | 4078 MB |
| PR #8 branch | 473 | 5120 MB |

The default V8 limit on GitHub's 16 GB ubuntu runner is about 4 GB, so `main` was passing with
almost no headroom; adding ~20 suites and some dependency upgrades pushed the PR over it and the
`ci` job died before reporting any test result. Average growth in the full run is roughly 40 MB
per suite; no single suite accounts for it (each of the three new suites, prepended to a fixed
37-suite subset, grew that subset by the same ~370 MB as `main`'s own subset).

`.github/workflows/test.yml` now sets `NODE_OPTIONS=--max-old-space-size=8192` on the
`Test CI` step to restore headroom. That treats the symptom.

## Failure scenario

The suite keeps growing; at ~8 GB the job OOMs again, or it starts swapping on the runner. Local
runs on machines with less memory already sit closer to the limit.

## Suggested fix

Find what retains each suite's module graph: a module-scope `process.on(...)` listener or global
added by a commonly imported module, a timer/handle that survives the suite, or a mock factory
that closes over large objects. `--logHeapUsage` plus `node --expose-gc --inspect` heap snapshots
between two suites will show the retainer. Alternatively, drop `--runInBand` for CI and use
workers with `workerIdleMemoryLimit` — check first why `--runInBand` was chosen.

## Resolution (2026-10-08)

`--runInBand` was inherited from Heroic (`6a35318e8`, 2021-06, `#275`); GameLib never chose it,
and `pnpm test` already runs the same suites in parallel locally, so nothing depended on it.

The retainer is not in app code: the only two `process.on(` hits outside `__tests__` in
`src/backend` and `src/common` are comments. It is jest-runtime 29.7 itself —
`createScriptFromCode` compiles every CJS module as a `vm.Script` with an
`importModuleDynamically` closure over the Runtime, and Node ≥ 16.11 pins the script, and with
it the suite's whole module registry, through those host-defined options. That is why the growth
is per suite and proportional to the suite's module graph: Jest schedules the biggest suites
first, so the Backend project alone climbed ~48 MB/suite for the first 100 suites and then
flattened.

Measured 2026-10-08 on the Backend project (234 suites, 5285 tests, all green both ways):

| run | peak heap | wall |
|---|---|---|
| `--runInBand` (`--expose-gc --logHeapUsage`, 8 GB ceiling) | 4179 MB (41 MB at suite 1) | 335 s |
| `--maxWorkers=2 --workerIdleMemoryLimit=1GB` | 1019 MB per worker | 66 s |

Fix: `test:ci` is `jest --maxWorkers=2 --silent`; root `jest.config.js` sets
`workerIdleMemoryLimit: '1GB'` (also bounds the 9 workers of a local `pnpm test`); the
`NODE_OPTIONS=--max-old-space-size=8192` band-aid is removed from `.github/workflows/test.yml`.
