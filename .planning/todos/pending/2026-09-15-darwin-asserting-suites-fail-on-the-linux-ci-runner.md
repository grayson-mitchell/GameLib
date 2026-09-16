---
created: 2026-09-15T00:00:00.000Z
title: 'Five suites pass on macOS and fail on the Linux CI runner — darwin-specific assertions with no platform guard, so `ci` is permanently red'
area: test
severity: minor
platform: any
ready: code
status: OPEN
found_by: 'quick-260914-vbw, 2026-09-15 — surfaced by PR #5, the first pull_request ever opened against fix/steam-native-install-stability and therefore the first ci run on that branch'
files:
  - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
  - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
  - src/backend/sidecar/__tests__/nativeImageShim.test.ts
  - src/backend/__tests__/utils.test.ts
  - meta/__tests__/verifyRunnerBundle.test.ts
---

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
