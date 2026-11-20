---
quick_id: 260905-jg4
title: "Resolve the inert per-suite jest.mock('os') todo — declare the rule, correct the false docs, gate it"
date: 2026-09-05
status: complete
source_todo: .planning/todos/completed/per-suite-jest-mock-os-is-inert-in-backend-suites.md
---

# Quick Task 260905-jg4 — Summary

## What the todo asked, and what was actually true

Re-verified the finding at HEAD before acting: the `loggerFlows.test.ts`
inertness pin still passes, so the 2026-08-23 measurement still holds.

Two of the todo's own statements needed correcting first:

- **The census was wrong.** "31 files" came from a raw `grep`, which counts
  prose. By comment-stripped source there are 26 code-level declarers, of which
  `jest.setupContainment.ts` is the EFFECTIVE registration and
  `stripSourceComments.test.ts` holds string-literal fixtures. The real figure is
  **24** shadowed suite-level declarations (+ 9 prose-only files).
- **Block A was not exercising a dead factory.** The todo flagged this as
  needing re-reading, and the answer is no. Block A's two assertions are
  RED-PROOFed in-file against the `../pathShim` and `backend/logger/paths` mocks,
  both effective; its docstring already said the proven property is one "a bare
  `os.homedir()` mock does NOT have". No assertions needed re-pointing.

## The rule (neither option the todo offered)

The todo offered "make them effective" or "declare them dead and delete them".
Both rejected. Making them effective fights the structural mechanism this repo
built *because* per-suite containment rotted. Deleting them removes real defence
in depth — they become effective again if the `setupFiles` entry is ever
removed — trading a documentation defect for a containment regression risk
across 24 files. (Deletion would not have broken Block B, which gates on
`../pathShim` / `backend/logger/paths` / `getLogFilePath({})`, not on the `os`
mock. That was checked, not assumed.)

**Adopted:** `jest.setupContainment.ts` SHADOWS every per-suite `os` mock.
Suite-level `os` mocks are inert-but-retained defence in depth. No suite may
describe its own as load-bearing.

## Changes

| File | Change |
| --- | --- |
| `src/backend/jest.setupContainment.ts` | New SHADOWING section: the rule, the mechanism, the scope (both `'os'` and `'node:os'`), the census, and "containment is NOT weakened". |
| `src/backend/sidecar/__tests__/loggerFlows.test.ts` | Kit item 1 corrected — INERT and retained, element carried by `setupFiles`. Item 2's back-reference generalised. Pin comment updated to record closure. |
| `src/backend/sidecar/__tests__/testContainment.test.ts` | Block A verdict recorded in the docstring; the false inline comment above its own `os` mock corrected in place. |
| `src/backend/sidecar/__tests__/structuralContainment.test.ts` | New 6-test SHADOWING gate (3 legs + 3 self-tests). No `jest.mock`, no new top-level import — the file's mock-free import graph is load-bearing for WR-05. |

## The gate found two defects in itself, and one was a false gate

- Self-test C caught the block matching its **own census** twice: first a
  literal in leg 3, then the `describe` title. Both also tripped the WR-05
  import-graph gate, which greps the same `jest` + `.mock(` fragment. Fixed by
  runtime concatenation and a reworded title, both annotated in-file.
- **Leg 3's first version was a false gate.** It matched RAW source, and its
  RED-PROOF stayed GREEN: renaming the `it(...)` it exists to hold in place did
  not fail it, because `loggerFlows.test.ts` also names the pin in its
  docstring, and prose satisfied a raw match. It would have gone on passing
  after its subject was deleted. Re-pointed at comment-stripped source and
  re-proved red (title renamed, docstring mention left intact, `grep -c` = 1).

Legs 2 and 3 were both RED-PROOFed by hand — mutate, observe red, restore,
`git diff` clean. Leg 1 is a floor (≥20), not an exact pin, so adding or
removing a suite does not force it red; its correctness is carried by self-tests
A/B/C, which prove the census matches code and not documentation in both
directions.

## Gates at close (all re-measured)

- Backend jest project: **195/195 suites, 4513 passed**, 2 skipped
- Meta project: **36/36 suites, 973 passed**, 1 skipped
- `eslint --cache --max-warnings 4157 .`: **exit 0 at 4145 warnings, 0 errors** —
  identical to the Phase 40 close baseline, so this task returns **zero lint debt**
- `tsc --noEmit`: exit 0
- `prettier --check` on all four changed files: clean

## Follow-on

None. The todo is closed at
`.planning/todos/completed/per-suite-jest-mock-os-is-inert-in-backend-suites.md`
with the full resolution recorded.
