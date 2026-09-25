---
created: 2026-09-25
title: "fakeHomeIsolation.test.ts compares POSIX-literal paths against path.relative() output and fails on Windows"
found_during: phase 46 regression gate (execute-phase 46, 2026-09-25)
severity: medium
platform: windows
ready: code
area: tests
files:
  - src/backend/__tests__/fakeHomeIsolation.test.ts
---

# fakeHomeIsolation.test.ts fails on Windows: POSIX-literal paths vs `path.relative()`

## Evidence

Run on the operator's Windows 11 machine during phase 46's regression gate, 2026-09-25:

```
npx jest src/backend/__tests__/fakeHomeIsolation.test.ts
× scanned a real population, including the helper it exists to enforce
  Expected value: "src/backend/testUtils/fakeHomeProfile.ts"
  Received array: ["src\\backend\\anticheat\\ipc_handler.ts", ...]
Tests: 1 failed, 4 passed, 5 total
```

Not a phase 46 regression: the gate has compared this way since it landed in `d0479c148`
(quick 260913-arr). It is presumably green on macOS/Linux and in CI, where `path.relative()`
returns `/`-separated paths.

## Mechanism

`scannedRelPaths` (line 143) and `rel` (line 151) are built with `relative(REPO_ROOT, f)`, which
returns `\`-separated paths on Windows. They are compared against `/`-separated literals:
`HELPER_REL_PATH` (line 55), `'meta/sidecarStartupSmoke.cjs'` (line 201), `ALLOWED_TO_ASSIGN`,
and the `EXEMPTIONS` table's `file` keys (line 152).

## The part that matters more than the red test

Line 152's allowlist/exemption check has the same mismatch, so on Windows **no exemption can ever
match**. Yet the enforcing test, "no in-repo file spawns a child with a hand-rolled
home/config/state env block", was **green** on Windows in the same run. If the exemption were
load-bearing, the exempt file `meta/sidecarStartupSmoke.cjs` should have been reported as an
offender. Either the exemption is dead (the file no longer trips the detector), or the detector
cannot see that file's env block. The gate may be proving less than it claims. Answer this
before normalizing the paths, because normalizing hides the signal.

## Fix sketch

Normalize once at the source, e.g. `relative(REPO_ROOT, f).split(sep).join('/')` (or
`path.posix`-style normalization) for both `scannedRelPaths` and `rel`. Then prove the exemption
is still load-bearing: temporarily drop it and confirm the enforcing test goes RED on every OS.
