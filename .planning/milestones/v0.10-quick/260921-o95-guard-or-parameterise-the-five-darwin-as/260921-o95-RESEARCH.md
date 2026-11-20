# Research — the five suites that fail on the Linux CI runner

**Gathered:** 2026-09-21
**Method:** not inferred from the todo. Downloaded the log of the actual failing run —
`gh run view 34976019167 -R grayson-mitchell/GameLib --log-failed` — the `Test` workflow on
`fix/macos-hardened-runtime-jit-entitlements`, 2026-09-15T13:35:52Z, the run the todo was filed
from. Every cause below is a quoted assertion diff or a quoted `ENOENT`, not a guess.

The todo's own Verification section says these are grouped by symptom, not by cause, and that each
failure must be read individually before anything is changed. That has now been done, and it
matters: **the causes are three distinct classes, and one of the five is not a platform defect at
all.**

## The run, as measured

`Test Suites: 6 failed, 420 passed, 426 total` / `Tests: 5 failed, 6 skipped, 8572 passed, 8583
total` / `Time: 497.026 s`.

Six suites, not five. The sixth is `meta/__tests__/lintTranslations.test.ts`, which failed twice
in one file (`lintTranslations (REQ-41-02)` and `comparePresenceBaseline (REQ-41-01)`, both
`Received length: 816`, both listing `humbleKeys.*`). That is the 816-unlocalised-keys defect,
filed and closed separately as
`.planning/todos/completed/2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md`.
**Out of scope here.** Do not touch it.

## Cause class A — a macOS-only binary is absent (`ENOENT`), 3 suites

These are not assertion mismatches. The test process shells out to a binary that only ships on
macOS, and the spawn fails.

### A1. `src/backend/sidecar/__tests__/nativeImageShim.test.ts:85`

```
● Test suite failed to run
spawnSync /usr/bin/sips ENOENT
  > 85 | childProcess.execFileSync('/usr/bin/sips', [
```

Called from suite setup (frame at `:97:3`), so the **whole suite fails to run** — zero of its
tests execute. `sips` is the macOS Scriptable Image Processing System; it does not exist on Linux.

### A2. `src/backend/sidecar/__tests__/shortcutsFlows.test.ts:214`

```
/usr/bin/sips ENOENT
  212 | `gamelib-shortcuts-test-fixture-icon-${process.pid}.png`
  > 214 | execFileSync('/usr/bin/sips',
```

Same binary, same cause. Used to build a PNG icon fixture.

### A3. `meta/__tests__/verifyRunnerBundle.test.ts:340`

```
● verifyRunnerBundle › signature reporting is not enforcement: pass-case files are unsigned, ok stays true
expect(received).toBe(expected) // Object.is equality
Expected: "unsigned"
Received: "unknown:spawnSync codesign ENOENT"
```

`codesign` is macOS-only. Note the shape carefully: the product code **did not crash** — it
degraded to a `unknown:<reason>` status string, which is arguably the correct Linux answer. Only
the test's expectation of the literal `"unsigned"` is darwin-specific. The named behaviour under
test — *"signature reporting is not enforcement, `ok` stays true"* — is platform-independent and
genuinely worth keeping green on Linux. Guarding the whole suite would discard that.

## Cause class B — an assertion encodes one platform's path layout, 1 suite

### B1. `src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts:174`

```
● 260905-mv5 Task 1: premise re-verification (plan evidence item 5) ›
  shortcutFiles('') RETURNS a real non-empty path pair, does not throw
- "/tmp/gamelib-jest-run-NcntUw/gamelib-jest-home-nRkaXu/.local/share/applications/.desktop"
+ "/tmp/gamelib-jest-run-NcntUw/gamelib-jest-home-nRkaXu/Desktop/.desktop"
  > 174 | expect(desktopFile).toEqual(menuFile)
```

This is the one the todo quotes, and the todo's reading of it is correct: on darwin both paths
collapse to a single `~/Applications/<name>.app`; on Linux `menuFile` is under
`.local/share/applications/` and `desktopFile` is under `Desktop/`, so they must differ. The
surrounding claim the test is really making — *returns a real non-empty pair and does not throw* —
holds on both platforms. Only the `toEqual` collapse is darwin-specific.

(Incidentally: the `/tmp/gamelib-jest-run-*/gamelib-jest-home-*` paths in the diff confirm the
fake-HOME containment from `src/backend/jest.setupContainment.ts` is working on the runner.)

## Cause class C — NOT a platform defect. An arch-degenerate fixture, 1 suite

### C1. `src/backend/__tests__/utils.test.ts:146`

```
● backend/utils.ts › archSpecificBinary — existence-checked x64 fallback (Phase 34.5 G-1, plan 34.5-17)
  › falls back to the x64 path when the arch-native path is missing but x64 exists
  (unchanged behaviour -- the documented box64 compatibility-layer case)
arch-native "/tmp/public/bin/x64/linux/gogdl" ... x64 "/tmp/public/bin/x64/linux/gogdl" ... (resolved publicDir: "/tmp/public")
  at archSpecificBinary (src/backend/utils.ts:586:9)
  at Object.getGOGdlBin (src/backend/utils.ts:613:45)
  at Object.<anonymous> (src/backend/__tests__/utils.test.ts:146:34)
```

**Read the two paths in that message: they are byte-identical.** The test's premise is "arch-native
is missing, x64 exists" — but the CI runner is x64, so the arch-native path *is* the x64 path.
The scenario cannot be constructed there; the fixture creates neither file and the production code
correctly throws "neither exists on disk".

This suite is therefore **not darwin-asserting**. It is *non-x64-asserting*. It would fail
identically on an **x64 Mac**, and pass on **arm64 Linux**. The discriminator is `process.arch`,
not `process.platform`. A `process.platform === 'darwin'` guard here would be a green check
proving nothing on every Intel Mac, and would silently stop testing the box64 fallback on arm64
Linux — the exact platform the documented box64 case is about.

This is the single most important finding in this document. The todo grouped by symptom and
inferred "darwin"; the measurement says otherwise for this one suite.

## What this implies for the remedy

The todo offers three options; mapping the measured causes onto them:

| suite | class | remedy |
| --- | --- | --- |
| `nativeImageShim` | A | darwin-only — nothing meaningful survives without `sips` |
| `shortcutsFlows` | A | darwin-only for the `sips` fixture; keep any non-fixture coverage running |
| `verifyRunnerBundle` | A | **parameterise** — keep `ok stays true` on Linux, scope only the `"unsigned"` literal |
| `shortcutsExistsFallback` | B | **parameterise** — keep the non-empty/no-throw claim, scope only the `toEqual` collapse |
| `utils` | C | guard on `process.arch !== 'x64'`, **not** on platform |

Option 3 from the todo ("fix the CI environment") was hypothesised for `verifyRunnerBundle` on the
grounds that it "concerns bundled runner binaries that may simply be absent". The log refutes
that: the binaries are present and readable — it is `codesign` itself, the signing tool, that is
absent. Installing a `codesign` on Linux is not a thing. **No CI-environment change is warranted
for any of the five.**

## Traps for whoever implements this

- **A guard that skips everywhere is indistinguishable from deletion.** After guarding, each
  suite must be shown still running and passing on this Mac. `jest` prints skipped suites; prove
  the test count did not silently drop to zero.
- **`describe.skip` at the wrong nesting level** takes neighbouring platform-independent tests
  with it. In `verifyRunnerBundle` and `shortcutsExistsFallback` that is the whole risk — those
  two files carry coverage that *should* run on Linux.
- **`nativeImageShim` fails in setup, not in a test.** A guard placed inside a `test()` body will
  not help; the `sips` call at `:85` runs from the `:97` frame at suite scope and must itself be
  gated, or the suite will keep failing to run before any guard is reached.
- The arch case (C1) cannot be verified as fixed on this machine by running the suite — this Mac
  is arm64, where it already passes. The evidence that it is fixed is that the guard's condition
  is `arch`-based and reads correctly for an x64 host. Say so plainly rather than implying a
  measurement that was not taken.

## Sources

- Failing run log: `gh run view 34976019167 -R grayson-mitchell/GameLib --log-failed`
- The todo: `.planning/todos/pending/2026-09-15-darwin-asserting-suites-fail-on-the-linux-ci-runner.md`
- Sibling defect (out of scope):
  `.planning/todos/completed/2026-09-15-816-unlocalised-humblekeys-keys-ship-english-in-every-non-english-locale.md`
