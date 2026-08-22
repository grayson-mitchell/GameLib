---
created: 2026-08-23
title: "A per-suite jest.mock('os') is INERT in every backend suite — ~30 files carry a dead containment mock"
area: testing
status: OPEN
severity: minor
files:
  - src/backend/jest.setupContainment.ts
  - src/backend/sidecar/__tests__/loggerFlows.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
---

## What was measured

Found on 2026-08-23 while closing 34.2 gap-cycle-4 WR-02, and pinned by a test at
`src/backend/sidecar/__tests__/loggerFlows.test.ts` ("this file's own
jest.mock('os') is INERT").

A backend test file that declares its own `jest.mock('os', factory)` does **not**
get that factory. Probed with a scratch suite declaring a factory returning a
distinct `mkdtemp` root:

```
file-local mockRoot      : /var/folders/.../T/probe-NYQ2ml
top-level import homedir : /var/folders/.../T/gamelib-jest-run-.../gamelib-jest-home-...
require('os').homedir()  : /var/folders/.../T/gamelib-jest-run-.../gamelib-jest-home-...
require('node:os').home  : /var/folders/.../T/gamelib-jest-run-.../gamelib-jest-home-...
```

The file's own root appears nowhere. `jest.setupContainment.ts` wins for the
top-level import **and** for a test-body `require`, both specifiers.

Likely mechanism: `setupContainment` runs from `setupFiles` and `require`s `'os'`
inside its own precondition block, so the mocked module is already instantiated
in jest's registry by the time the test file's hoisted `jest.mock('os', ...)`
registers a new factory — `require('os')` returns the cached instance. The
measurement is the fact; the mechanism is the best available explanation.

## Why this is minor, not urgent

**Containment is not weakened.** `homedir()` still resolves inside a disposable
tmp root — `setupContainment`'s rather than the suite's own — so nothing reaches
the developer's real home. Every existing suite is as safe as it was.

What is false is the documentation. `loggerFlows.test.ts`'s docstring calls its
`os` mock "containment kit element 1"; that element is actually carried by
`setupFiles`. `testContainment.test.ts`'s Block A describes "the four in-scope
suites' own kit" and exists to prove that shape stays safe under adversarial
`process.platform` and env vars — worth re-reading in this light, since it may be
exercising a factory that is never installed.

## What to do

1. Decide the rule: either make per-suite `os` mocks effective (an explicit
   `jest.resetModules()` or `jest.isolateModules` at the suite's own entry, if
   that even works — verify, do not assume), or declare them dead and delete
   them.
2. Grep is `grep -rln "jest.mock('os'" src/backend --include='*.test.ts'` — 31
   files matched on 2026-08-23, though that count includes files where the string
   only appears in prose.
3. Re-read `testContainment.test.ts` Block A specifically. If its subject is a
   mock that is never installed, the block needs re-pointing at the mock that IS.

Related: `[[refresh-rebuilds-from-disk-and-wipes-flagless-state]]` is a different
shape of the same lesson — a mechanism everyone assumes is in effect, that is not.
