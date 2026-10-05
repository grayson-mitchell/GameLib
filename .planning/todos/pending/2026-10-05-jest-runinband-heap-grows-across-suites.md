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
