---
created: 2026-09-21T00:00:00.000Z
title: 'Confirm on the next pull_request run that the five guarded/parameterised suites (shortcutsExistsFallback, shortcutsFlows, nativeImageShim, utils, verifyRunnerBundle) are green on the Linux CI runner, including the 30 tests that have never executed there before'
area: test
severity: minor
platform: linux
ready: blocked
source: quick-260921-o95
files:
  - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
  - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
  - src/backend/sidecar/__tests__/nativeImageShim.test.ts
  - src/backend/__tests__/utils.test.ts
  - meta/__tests__/verifyRunnerBundle.test.ts
---

## Why `ready: blocked`

The confirmation this todo asks for needs the Linux CI runner — hardware not to hand on this
machine — and `ci`/`lint` fire on `pull_request` only (per the parent todo's own closing line),
so nothing short of an actual PR run can produce the evidence. It is not `code` (there is nothing
left to edit — quick-260921-o95 already applied every remedy), not `live-gate` (no live app run
on this Mac can produce a Linux CI result), and not `human` (no decision is pending, only a
measurement).

## What to check on the next `pull_request` run

- All five suites — `shortcutsExistsFallback`, `shortcutsFlows`, `nativeImageShim`, `utils`,
  `verifyRunnerBundle` — report green.
- Separately, the skip counts on the two gated suites: `nativeImageShim` should show **9 skipped**
  (its darwin-only describe), `shortcutsFlows` should show **4 skipped** (Describe 5, the darwin
  `GAMELIB_SHELL_EXE` pin). Neither should show any OTHER skip.

## Why this is not a formality

Both sips-dependent suites (`shortcutsFlows`, `nativeImageShim`) have, at every point in this
project's history so far, only ever **failed at import** on the Linux runner — the `/usr/bin/sips`
ENOENT happened before a single test in either file ran. That means **30 tests will execute on
Linux for the first time on the next `pull_request` run**: 27 in `shortcutsFlows` (every describe
except the now-gated Describe 5) and 3 in `nativeImageShim` (the hoisted converter-free describe).
New, genuine Linux findings in any of those 30 are possible and would NOT be a regression from
quick-260921-o95 — they would be the first real measurement this project has ever taken of that
code on that platform. Read them on their own merits if they appear; do not assume they are
noise just because this todo predicted the suites would go green.

The `utils` fix's x64 arm is similarly unmeasured on real hardware: this machine is arm64, so the
box64/x64-fallback arch case was never run on an actual x64 host, Linux or otherwise. The evidence
it is fixed is a local RED→GREEN reproduction with `process.arch` forced — first to `x64` (which
reproduced the CI failure message verbatim: both candidate paths byte-identical), then to `arm64`
(which passed) — plus the fix being arch-pinned (`process.arch`) rather than host-derived
(`process.platform`), so it is structurally correct for any x64 host including Linux CI, not just
observed to work on this Mac.

## Comparison baseline — macOS, this machine, after quick-260921-o95

All five suites at their full HEAD counts, zero skipped:

| suite | tests |
| --- | --- |
| `shortcutsExistsFallback` | 6 |
| `shortcutsFlows` | 31 |
| `nativeImageShim` | 12 |
| `utils` | 22 |
| `verifyRunnerBundle` | 36 |

## Related, explicitly not evidence either way

The sixth failure in the 2026-09-15 CI run that surfaced all of this, `lintTranslations`
(`meta/__tests__/lintTranslations.test.ts`), is a separate, already-closed defect
(`.planning/todos/completed/2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md`).
It was deliberately left untouched by quick-260921-o95 and its outcome on the next CI run says
nothing about whether this todo's confirmation succeeded.
