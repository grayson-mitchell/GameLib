---
created: 2026-08-23
title: "A per-suite jest.mock('os') is INERT in every backend suite — ~30 files carry a dead containment mock"
area: testing
status: "RESOLVED 2026-09-05 by quick task 260905-jg4. Rule adopted: jest.setupContainment.ts SHADOWS every per-suite os mock; the 24 suite-level declarations are inert-but-retained defence in depth, NOT deleted. False documentation corrected in loggerFlows.test.ts and testContainment.test.ts; canonical rule added to jest.setupContainment.ts; a 6-test SHADOWING gate added to structuralContainment.test.ts."
severity: minor
files:
  - src/backend/jest.setupContainment.ts
  - src/backend/sidecar/__tests__/loggerFlows.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - src/backend/sidecar/__tests__/structuralContainment.test.ts
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

---

## RESOLUTION (quick task 260905-jg4, 2026-09-05)

**Finding re-verified at HEAD before acting.** The `loggerFlows.test.ts`
inertness pin still passes, so the measurement above still holds.

**Census corrected.** The todo's "31 files" was a raw `grep` and over-counted.
By COMMENT-STRIPPED source there are 26 code-level declarers; two are not
shadowed suite mocks (`jest.setupContainment.ts` is the effective registration,
`stripSourceComments.test.ts` holds string-literal fixtures). The real figure is
**24** shadowed suite-level declarations, plus 9 files naming one only in prose.

**Step 1 of "What to do" — the rule.** Neither of the two options offered was
adopted verbatim. Making per-suite mocks effective was rejected (it would fight
the structural mechanism this repo built precisely because per-suite containment
rotted). Deleting them was ALSO rejected: they are genuine defence in depth that
becomes effective again if the `setupFiles` entry is ever removed, so deleting
24 of them trades a documentation defect for a containment regression risk.

Adopted: **`jest.setupContainment.ts` shadows every per-suite `os` mock.
Suite-level `os` mocks are inert-but-retained. No suite may describe its own as
load-bearing.** Stated canonically in `jest.setupContainment.ts`'s new SHADOWING
section.

**Step 3 — `testContainment.test.ts` Block A: NOT exercising a dead factory.**
Audited directly. Block A's two assertions are RED-PROOFed (recorded in-file
from 34.2-18-SUMMARY.md) against the `../pathShim` and `backend/logger/paths`
mocks ONLY, both of which ARE effective. Its docstring already stated that the
property it proves is one "a bare `os.homedir()` mock does NOT have". No
re-pointing of assertions was needed. What WAS false was the inline comment
above that file's own `os` mock, which claimed it redirected `homedir()` —
corrected in place. Block B does not gate on `jest.mock('os'` at all, so the
deletion option would not have broken it either.

**Regression gate.** `structuralContainment.test.ts` gained a 6-test SHADOWING
block: a census floor over comment-stripped source, presence of the canonical
rule, presence of the behavioural pin, and three self-tests. Two legs were
RED-PROOFed by hand (mutate, observe red, restore, `git diff` clean).

Leg 3's FIRST version was a false gate and is recorded as such in-file: it
matched RAW source, so its RED-PROOF stayed GREEN — the docstring's mention of
the pin satisfied it, meaning it would have kept passing after the test it
exists to hold in place was deleted. Fixed to match comment-stripped source and
re-proved red. The gate's own self-test C also caught the block matching its own
census twice (a literal in leg 3, then the `describe` title).

**Gates at close:** Backend 195/195 suites 4513 passed; Meta 36/36 suites 973
passed; `eslint --max-warnings 4157` exit 0 at **4145** — unchanged from the
Phase 40 baseline, so this task returns zero lint debt; `tsc --noEmit` exit 0;
prettier clean.
