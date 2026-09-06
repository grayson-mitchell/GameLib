---
quick_id: 260906-hq8
title: 'Fix meta/runTs.cjs esbuild spawn on Windows — bin/esbuild stays a JS shim on win32'
date: 2026-09-06
status: complete
one_liner: 'Added the injectable-platform buildEsbuildSpawnArgv() win32 branch to meta/runTs.cjs, mirroring buildSidecarSea.ts, plus its first platform test coverage — mechanism confirmed from esbuild's own installer/tarball on macOS, never reproduced on Windows.'
key-files:
  created:
    - .planning/todos/pending/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md
  modified:
    - meta/runTs.cjs
    - meta/__tests__/runTs.test.ts
decisions:
  - 'buildEsbuildSpawnArgv(esbuildCli, esbuildArgs, platform = process.platform) mirrors buildSidecarSea.ts buildEsbuildArgv() exactly, including the injected platform parameter — required so both branches are assertable from a macOS test run, not just the host platform'
  - 'require.main === module guard added around main(), with module.exports = { buildEsbuildSpawnArgv } — lets the wrapper be require()d for testing with zero side effects while every real invocation (23 package.json scripts, plus runTsSignals.test.ts probe copies) is unaffected'
  - 'Did not touch meta/buildSidecarSea.ts (already correct) or the already-Windows-correct symlink junction / second process.execPath spawn in runTs.cjs'
metrics:
  duration: 'single session'
  completed: '2026-09-06'
---

# Quick Task 260906-hq8: Fix runTs.cjs esbuild spawn on Windows Summary

## What shipped

`meta/runTs.cjs` resolved `esbuild/bin/esbuild` and spawned it directly as
the command. On win32, esbuild's own installer (`install.js`'s
`maybeOptimizePackage()`) skips the hardlink swap that replaces that file
with a native binary on other platforms — so the published
`#!/usr/bin/env node` JS shim survives there, and Windows' `CreateProcess`
cannot execute a shebang script, surfacing as libuv errno `-4058` (ENOENT).
`meta/buildSidecarSea.ts` already had the correct win32-vs-other branch in
its `buildEsbuildArgv()`; `runTs.cjs` — the bootstrap all 23
`package.json` `meta/*.ts` scripts route through, including
`build:decompress-worker-dev` which `pnpm tauri:dev` runs — never did.

**Task 1 — `meta/runTs.cjs`:**
- Added `buildEsbuildSpawnArgv(esbuildCli, esbuildArgs, platform = process.platform)`,
  a pure function mirroring `buildEsbuildArgv()`'s shape exactly, including the
  injectable `platform` parameter. On `win32` it returns
  `{ command: process.execPath, args: [esbuildCli, ...esbuildArgs] }`;
  otherwise `{ command: esbuildCli, args: esbuildArgs }`.
- Wired it into the esbuild spawn call site, keeping the compile-failure
  short-circuit and argv-as-array (never a shell string) semantics
  byte-identical.
- Rewrote the comment above `require.resolve('esbuild/bin/esbuild')`: struck
  the false "NEVER a JS file to hand to `process.execPath`, on any platform"
  claim, and replaced it with the measured mechanism (esbuild 0.25.12's
  installer skipping the win32 hardlink swap, the 9351-byte published shim,
  the Mach-O binary confirmed on the authoring host) plus an explicit
  statement that the Windows failure was reported, not reproduced.
- Wrapped `main()` in `if (require.main === module)` and added
  `module.exports = { buildEsbuildSpawnArgv }`, so the file can be
  `require()`d for testing without triggering a real compile-and-run.

**Task 2 — `meta/__tests__/runTs.test.ts`:**
Added a new `describe` block (the two existing blocks are untouched) with 7
tests: win32-through-execPath, non-win32-direct, branches-differ-only-in-who-
is-spawned, default-follows-host, a non-vacuity control, a host-fact pin on
the real installed `esbuild/bin/esbuild`'s first bytes, and an installer
tripwire against esbuild's own `install.js`. None of the argv-shape
assertions (tests 1-5) are guarded by `if (process.platform === ...)` — the
`platform` parameter is what makes both branches assertable unconditionally
on this macOS host.

**Task 3 — regression proof + outstanding-work todo:**
Ran all listed regression gates (below) and filed
`.planning/todos/pending/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md`
recording the confirming commands, the three falsifiers (F1/F2/F3), and the
three macOS measurements (M1/M2/M3) from the plan's `<diagnosis_status>`.

## Honesty statement (required by the plan)

**The Windows failure that motivated this fix was never reproduced.** The
mechanism — esbuild's installer skipping the `bin/esbuild` hardlink swap on
win32, leaving a JS shim that `CreateProcess` cannot execute — was confirmed
today from esbuild 0.25.12's own bundled `install.js` and its published npm
tarball, and from the Mach-O header of the binary installed on this macOS
host. None of that establishes that this specific mechanism is what the
reporting machine actually hit. This SUMMARY does not claim the Windows bug
is fixed — only that it is addressed by a mechanism-confirmed change that is
awaiting confirmation on an actual Windows machine. That confirmation is
tracked in the pending todo above, not left implied-away here.

## RED proof (required — quoted, not assumed)

The win32 branch was temporarily reverted to the pre-fix unconditional shape
(`buildEsbuildSpawnArgv` returning `{ command: esbuildCli, args: esbuildArgs }`
regardless of `platform`), the new describe block was run, and the output was
captured before restoring the file via `git show`-free direct restore from a
scratch backup (never `git checkout --`, per this repo's post-checkout hook
constraint). Exactly tests 1, 3 and 5 went red, as predicted by the plan:

```
FAIL Meta meta/__tests__/runTs.test.ts
  meta/runTs.cjs esbuild spawn argv (quick task 260906-hq8)
    ✕ win32 branch runs the CLI through process.execPath (2 ms)
    ✓ non-win32 branches spawn the CLI directly
    ✕ the two branches differ only in who is spawned, never in the flags
    ✓ the default parameter follows the host platform
    ✕ non-vacuity control: the helper actually branches on platform
    ✓ host-fact pin: the installed esbuild/bin/esbuild matches this host branch (2 ms)
    ✓ installer tripwire: esbuild install.js still skips the hardlink swap on win32

  ● meta/runTs.cjs esbuild spawn argv (quick task 260906-hq8) › win32 branch runs the CLI through process.execPath

    expect(received).toBe(expected) // Object.is equality

    Expected: "/Users/graysonmitchell/.nvm/versions/node/v26.2.0/bin/node"
    Received: "/fake/project/node_modules/esbuild/bin/esbuild"

  ● meta/runTs.cjs esbuild spawn argv (quick task 260906-hq8) › the two branches differ only in who is spawned, never in the flags

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 0

      Array [
    -   "--bundle",
        "--outfile=/tmp/out.cjs",
        "/tmp/entry.ts",
      ]

  ● meta/runTs.cjs esbuild spawn argv (quick task 260906-hq8) › non-vacuity control: the helper actually branches on platform

    expect(received).not.toEqual(expected) // deep equality

    Expected: not {"args": ["--bundle", "--outfile=/tmp/out.cjs", "/tmp/entry.ts"], "command": "/fake/project/node_modules/esbuild/bin/esbuild"}

Test Suites: 1 failed, 1 total
Tests:       3 failed, 10 passed, 13 total
```

After capturing this, the file was restored from the pre-RED-proof backup and
`diff` confirmed byte-identical to the fixed state; the suite was re-run and
returned 13/13 green.

## Gate results

| Gate | Command | Result |
|---|---|---|
| Marker uniqueness (pre-edit baseline) | one-liner counting the 3 `<landmines>` literals | 1/1/1 against the unmodified file (measured before editing) |
| Marker uniqueness (post-edit) | same one-liner | 1/1/1 — unchanged after the comment rewrite |
| `node --check meta/runTs.cjs` | | pass |
| Branch/main-not-run assertion | require + assert one-liner | both branches correct, `main()` did not execute on require |
| End-to-end smoke | `node meta/runTs.cjs --bundle --platform=node --target=node21 <scratch entry.ts>` | exit 0, marker printed, no surviving `gamelib-runts-*` dir in `os.tmpdir()` |
| `npx jest --config meta/jest.config.js meta/__tests__/runTs.test.ts` | | 13/13 pass (was 6/6 before this task; +7 new tests) |
| `npx eslint meta/__tests__/runTs.test.ts --report-unused-disable-directives` | | exit 0, 0 errors, 33 warnings (all `@typescript-eslint/no-unsafe-*` from the `any`-typed `require()`d CJS module — same pattern as `meta/__tests__/i18nParserConfig.test.ts`'s existing `require()`-a-CJS-config idiom) |
| `npx prettier --check meta/runTs.cjs meta/__tests__/runTs.test.ts` | | clean |
| `npx jest --config meta/jest.config.js meta/__tests__/runTsSignals.test.ts` | | 8/8 pass (T1-T8), file unmodified (`git diff --stat` empty) |
| `npx jest --config meta/jest.config.js` (full Meta project) | | 36 suites passed / 36 total; 980 passed, 1 skipped, 981 total (baseline before this task: 973 passed, 1 skipped, 974 total — the +7 delta is exactly the new `runTs.test.ts` tests) |
| `pnpm codecheck` | `tsc --noEmit` | exit 0, no output |
| `test -f .planning/todos/pending/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md` | | present |

## Deviations from Plan

None — plan executed as written. The only judgment call made during
implementation: the plan's `<interfaces>` section showed an
`eslint-disable-next-line @typescript-eslint/no-require-imports` precedent
for `require()`-ing a whole CJS module; that comment was needed once, above
`const runTs = require('../runTs.cjs')`. It was NOT needed above the two
`require.resolve(...)` calls added in the host-fact pin and installer
tripwire tests — `require.resolve` does not trigger that rule, and eslint's
`--report-unused-disable-directives` flag caught the two spurious disables as
an error (`Unused eslint-disable directive`) on first run; both were removed.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary schema
changes. The argv stays an array (never a shell string), `spawn` is called
without `shell: true` (unchanged from the existing call site), and both
values passed through `buildEsbuildSpawnArgv` are already-trusted
(`process.execPath`, a `require.resolve`d path inside the project's own
`node_modules`) — matching the plan's `<threat_model>` disposition
(T-hq8-01 mitigate, T-hq8-02/03 accept).

## Self-Check: PASSED

- `meta/runTs.cjs` — FOUND
- `meta/__tests__/runTs.test.ts` — FOUND
- `.planning/todos/pending/2026-09-06-runts-win32-esbuild-fix-unconfirmed-on-windows.md` — FOUND
- Commit `8ed7b8ccd` (fix: runTs.cjs win32 branch) — FOUND in `git log`
- Commit `73d942c67` (test: runTs.test.ts platform coverage) — FOUND in `git log`
- Commit `e6b28f327` (docs: pending todo) — FOUND in `git log`
