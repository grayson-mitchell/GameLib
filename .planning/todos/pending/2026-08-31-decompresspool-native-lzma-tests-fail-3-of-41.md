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
