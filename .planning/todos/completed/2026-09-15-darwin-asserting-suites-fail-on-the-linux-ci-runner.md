---
created: 2026-09-15T00:00:00.000Z
title: 'Five suites pass on macOS and fail on the Linux CI runner — darwin-specific assertions with no platform guard, so `ci` is permanently red'
area: test
severity: minor
platform: any
ready: code
status: CLOSED
closed: 2026-09-21
closed_by: quick-260921-o95
closing_commits: 'b57eb48a9 (Task 1: gate the two sips suites), 3c55ad8f4 (Task 2: parameterise verifyRunnerBundle/shortcutsExistsFallback/utils)'
found_by: 'quick-260914-vbw, 2026-09-15 — surfaced by PR #5, the first pull_request ever opened against fix/steam-native-install-stability and therefore the first ci run on that branch'
files:
  - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
  - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
  - src/backend/sidecar/__tests__/nativeImageShim.test.ts
  - src/backend/__tests__/utils.test.ts
  - meta/__tests__/verifyRunnerBundle.test.ts
---

> **CLOSED 2026-09-21 — actioned by quick task `260921-o95`.**
>
> Per-suite remedy actually applied, grouped by CAUSE (per this todo's own Verification section,
> which demanded reading each failure individually rather than trusting the symptom grouping
> below):
>
> | suite | cause | remedy applied |
> | --- | --- | --- |
> | `nativeImageShim` | `/usr/bin/sips` ENOENT at import | module-scope darwin gate (`HOST_IS_DARWIN`/`describeOnDarwin`); 3 converter-free tests hoisted to an ungated describe |
> | `shortcutsFlows` | `/usr/bin/sips` ENOENT at import | module-scope darwin gate on the fixture spawn + Describe 5 only; 27 of 31 tests stay ungated |
> | `verifyRunnerBundle` | `codesign` absent → `unknown:spawnSync codesign ENOENT` | parameterised on `HOST_HAS_CODESIGN`; nothing skipped; `summary.ok`/`machoCount` (`ok stays true`) still asserted unconditionally on Linux |
> | `shortcutsExistsFallback` | darwin path collapse (`shortcuts.ts:159-176`) | parameterised on `process.platform`; nothing skipped; non-empty/no-throw (`toBeTruthy()`) still asserted unconditionally on Linux |
> | `utils` | **not a platform defect at all** — arch-degenerate fixture on an x64 host | `process.arch` pinned to `'arm64'` via `setArch`, restored in `afterEach`; **no `process.platform` guard** |
>
> **The correction, stated plainly:** this todo grouped by symptom (passes on macOS, fails on
> Linux) and inferred "darwin" for all five. Measurement against the real failing CI log
> (`.planning/quick/260921-o95-guard-or-parameterise-the-five-darwin-as/260921-o95-RESEARCH.md`)
> showed `utils.test.ts` is **not darwin-asserting — it is non-x64-asserting.** On an x64 host,
> `archSpecificBinary`'s arch-native candidate (built from `process.arch`) and its x64 fallback
> (built from the literal `'x64'`) collapse to the same path, so the "arch-native missing, x64
> present" fixture is unconstructible; this would fail identically on an **x64 Mac** and pass on
> **arm64 Linux**. A `process.platform === 'darwin'` guard there would have been a green check
> proving nothing on every Intel Mac, and would have silently stopped exercising the documented
> box64 x64-fallback case on arm64 Linux — the exact platform that case is about.
>
> **This todo's own option 3 (fix the CI environment) was refuted from the log**, for the one
> suite it was proposed for (`verifyRunnerBundle`, "concerns bundled runner binaries that may
> simply be absent"): the log shows the runner binaries are present and readable — it is
> `codesign`, the signing tool itself, that is absent, and there is no `codesign` to install on
> Linux. No CI workflow file, jest config, or production source file was changed by `260921-o95`.
>
> **What was NOT measured, named plainly:** no Linux run of anything (every Linux-side
> expectation is derived from the 2026-09-15 log's verbatim output plus the production source, and
> from a forced-non-darwin local arm on this Mac, which does not reproduce Linux path layout); no
> x64-host run of the `utils` case (this machine is arm64 — the evidence is a local RED→GREEN
> reproduction with `process.arch` forced, not a real x64 run); and the 30 tests newly unblocked
> in the two sips suites (27 in `shortcutsFlows`, 3 in `nativeImageShim`) have never executed on
> Linux at all — both suites have only ever failed at import there. The follow-up todo
> `2026-09-21-confirm-the-five-guarded-suites-run-green-on-the-linux-ci-runner.md` carries this
> confirmation forward as a separate, `ready: blocked` item.
>
> **macOS counts, before and after, unchanged:** `shortcutsExistsFallback` 6, `shortcutsFlows` 31,
> `nativeImageShim` 12, `utils` 22, `verifyRunnerBundle` 36 — all five ran these exact counts at
> HEAD and still do after the remedy, zero skipped in any of them, proving no coverage was
> discarded.
>
> `lintTranslations` (the sixth failure in the same CI run) was deliberately left untouched — it
> is a separately-filed and already-closed defect
> (`.planning/todos/completed/2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md`).

## Problem

The `ci` job reported `Test Suites: 6 failed, 420 passed` / `Tests: 5 failed`. Five of those six
**pass on macOS** and fail only on the Linux runner. Measured locally at the same sha, run serially:

| suite | local (macOS) | CI (Linux) |
| --- | --- | --- |
| `shortcutsExistsFallback` | PASS | FAIL |
| `utils` | PASS | FAIL |
| `shortcutsFlows` | PASS | FAIL |
| `nativeImageShim` | PASS | FAIL |
| `verifyRunnerBundle` | PASS | FAIL |

(The sixth, `lintTranslations`, is a genuine defect and is filed separately.)

The mechanism is written into the test that fails most legibly —
`shortcutsExistsFallback.test.ts:174`:

```
// Plan evidence item 5: on darwin this is a SHARED path
// (~/Applications/.app) for desktopFile and menuFile alike.
expect(desktopFile).toEqual(menuFile)
```

That assertion encodes **darwin** behaviour and carries no platform guard, so on Linux — where the
two paths differ — it must fail. It is not a bug in the code under test; it is a test asserting one
platform's behaviour while running on another.

## Why it matters, and why it is only `minor`

The live consequence is nil: the product is fine and the macOS behaviour these tests assert is
correct. The cost is that **`ci` is permanently red on this branch**, which is corrosive in a
specific way — a permanently-red gate stops being read, and the *real* defect found in the same
run (816 unlocalised keys, a shipped user-facing gap) was sitting in the same failure list. A red
that is always red hides the red that matters.

## Direction

The question is **not** "make them pass on Linux". Decide, per suite, which of these it is:

1. **Genuinely darwin-only behaviour** → guard the test (`process.platform === 'darwin'` skip, or
   a darwin-scoped `describe`) so Linux neither runs nor fails it. Most likely correct for
   `shortcutsExistsFallback`.
2. **Behaviour that should be platform-parameterised** → give the test per-platform expectations
   rather than one platform's constants.
3. **An environment gap on the runner** (missing binaries, unset paths) → fix the CI environment
   instead of the test. `verifyRunnerBundle` is the likeliest candidate, since it concerns bundled
   runner binaries that may simply be absent on the Linux runner.

Do **not** delete or blanket-skip them to get green; that discards real macOS coverage and is how
a suite quietly stops testing the platform the product actually ships on first.

## Verification

- Read each CI failure individually before changing anything — they are grouped here by symptom
  (passes on macOS, fails on Linux), **not** by cause, and the causes above are different.
- After guarding: confirm the suite still runs and passes on macOS (a guard that skips everywhere
  is indistinguishable from deletion), and that CI goes green for these five specifically.
- Beware the load artifact seen while diagnosing this: a concurrent full run made 8 suites fail
  where a serial run on an idle machine failed only 2. Re-run serially before trusting any count.

## Related

- Pre-existing; not introduced by quick-260914-vbw, whose diff contains zero `.ts`/`.tsx` files.
- `2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md` — the
  real defect from the same CI run.
- `ci` and `lint` fire on `pull_request` only, so this branch had never been measured until PR #5.
