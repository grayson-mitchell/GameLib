---
created: 2026-08-31T18:45:00.000Z
title: "3 of 41 decompressPool tests FAIL — the native-LZMA path resolves 'pure-js' inside jest, though lzma-native loads fine outside it"
area: steam/decompression
status: OPEN
severity: major
files:
  - src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
  - src/backend/storeManagers/steam/lzmaLoader.ts
---

## Found

Phase 35's regression gate, 2026-08-31. **Not caused by Phase 35** — `git diff --name-only
7ad269368..HEAD` shows the gap-closure cycle (`35-20`..`35-29`) touched no lzma or decompression
file. Undocumented: no planning record found describing these as known or accepted failures.

## Measured

```
pnpm jest src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
JEST_EXIT=1
Tests: 3 failed, 38 passed, 41 total
```

Failing, all three on the **native** path:

1. `lzmaLoader (native-first decode with pure-JS fallback) › loadLzmaModule() resolves an
   LzmaModule whose decompressChunk output is byte-identical to the pure-JS lzma package
   (native re-enabled test)`
2. `lzmaLoader ... › lzmaDecoderKind() reports "native" after a successful load on a dev machine
   with the kill switch re-enabled, logged exactly once (logInfo, never logWarning)`
3. `lzmaLoader native-decode kill switch (default-off, Phase 23.1 plan 05) ›
   setNativeLzmaDecodeEnabledForTests(true) overrides the default for that test only, and
   resetLzmaLoaderForTests() clears the override back to off`

All three fail the same way: `Expected: "native"` / `Received: "pure-js"`.

## Two things ruled out

- **Not a full-suite load artifact.** This project has a recorded pattern of a full `pnpm test`
  manufacturing failures that a targeted run does not. Checked: the isolated single-suite run
  reproduces all three identically. It is real.
- **Not a missing or unbuildable native module.** `require('lzma-native')` succeeds under plain
  Node v26.2.0 arm64, returning 87 exports. The package is installed and its binding loads.

So the native module is loadable **outside** jest and resolves to `pure-js` **inside** it. The
cause is in the jest environment or in `lzmaLoader`'s gating, not in the dependency.

## Where to look — hypotheses, NOT measured

Phase 23.1 plan 05 (`5894aeb5d`) gated native lzma decode **off by default**, deliberately and
conservatively. These tests exercise the override that re-enables it. Candidate causes:

- the loader gates on something jest sandboxes per test file — note this project's finding that
  `process.env` is sandboxed per test FILE, and that a per-suite `jest.mock('os')` can be wholly
  inert (~30 dead assertions found previously);
- a moduleNameMapper / transform in one of the five jest projects intercepting the native require;
- the override function itself no longer reaching the state the loader reads.

Measure before fixing. Do not assume the kill switch is simply "working as intended" — if that were
so, these three tests would have been deleted or skipped, not left asserting `"native"`.

## Ownership

Unowned. **No `resolves_phase:` set deliberately** — this is Phase 23.1 territory surfaced by
Phase 35's regression gate, and must not auto-close when Phase 35 completes.

## 2026-09-05 (quick-260905-upz staleness audit) — DOES NOT CURRENTLY REPRODUCE, and that is the finding

Re-run during the pending-queue staleness audit. **The todo stays OPEN.** It was screened as a
discharge candidate and deliberately rejected as one.

```
$ npx jest --config src/backend/jest.config.js \
    --runTestsByPath src/backend/storeManagers/steam/__tests__/decompressPool.test.ts
Tests:       41 passed, 41 total
Test Suites: 1 passed, 1 total
```

All three tests named above now pass, including the two that assert `lzmaDecoderKind() === "native"`.

**Nothing that could explain the flip has changed:**

```
$ git log --oneline --since=2026-08-30 -- src/backend/storeManagers/steam/lzmaLoader.ts
(no output)
$ git log --oneline --since=2026-08-30 -- .../__tests__/decompressPool.test.ts
(no output)
$ node -v
v26.2.0                       # the same version this todo recorded on 2026-08-31
$ stat -f "%Sm" node_modules/lzma-native
Aug 23 20:47:49 2026          # predates this todo
$ git diff --quiet HEAD -- .../decompressPool.test.ts && echo CLEAN
CLEAN
```

Same loader, same test file, same Node, same native module — and a failure this todo explicitly
established as **deterministic** ("the isolated single-suite run reproduces all three identically.
It is real.") is now green.

### Why this does not close the todo

The central question is unchanged and unanswered: *why does `lzma-native` load fine outside jest
and resolve to `pure-js` inside it?* Nobody answered it; the symptom simply stopped presenting.
A green suite is not an answer, and with no code delta there is no mechanism to point at.

This todo's own instruction anticipated the trap — *"Do not assume the kill switch is simply
'working as intended' — if that were so, these three tests would have been deleted or skipped, not
left asserting `native`."* They still assert `native`. They now pass. With no code change, that
makes the **passing** result the one that needs explaining.

### What changed about this todo

Its subject. It was "3 tests fail"; it is now "this suite's native-path result is
environment-dependent and nobody knows on what." The second is the more serious defect, because it
means neither a red nor a green run of this suite currently carries information.

### For whoever picks it up

Establish what the result actually depends on before touching the loader. The two commits that
touched jest/package config in the window (`e98174032`, `90bb5a08d`) are unexamined and are the
only observed candidates, but neither was probed here and neither is implicated by evidence — they
are a starting point, not a hypothesis. Related: `flake-baselines-can-be-undiagnosed-bugs`.
