# Scope decision: the one in-title citation is OUT of scope

Written by the orchestrator before planning, because it resolves a conflict between three
constraints this task would otherwise carry simultaneously. Recorded here rather than left in
chat so the planner, executor and verifier all read the same ruling.

## The conflict

A first planning attempt stalled, but not before finding this, and it is correct:

`src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts:101` carries its
citation **inside an `it()` title string**, not in a comment:

```js
it("no no-fallback var(--divider) is introduced -- mirrors appShellLayout.test.ts:245-268's repo-wide rule at this file's scope", () => {
```

Three of the task's constraints are mutually unsatisfiable at that one site:

1. no `*.ts(x):NNN` citation survives in the files touched
2. the set of test titles is byte-identical before and after
3. the diff is comment-only

Satisfying (1) requires violating (2) and (3).

## Measured scope of the conflict

Scanned every citation-bearing file under `src/backend/humble/__tests__/`,
`src/common/humble/__tests__/` and `src/frontend/screens/Humble/`, classifying each citation
line as in-title or in-comment:

| classification | count |
| -------------- | ----- |
| IN-TITLE       | 1     |
| comment        | 17    |
| **total**      | 18    |

It is one site, not a pattern.

## Ruling

**`humbleKeysStylesheet.test.ts:101` is OUT of this task's edit scope.** Constraints (2) and (3)
win over (1). Scope is 17 of 18.

**Why title stability outranks citation hygiene here.** An `it()` title is not prose — it is the
test's identity. It is what `--testNamePattern` filters on, what CI reports name, and what any
todo or planning artifact referencing this test would quote. Editing it is a behavioural change
to the suite's surface, and this task's entire premise is that it must not silently change what
the tests verify or how they are identified. Trading that for the removal of one line number is
a bad exchange.

It is also a **different defect with a different fix**. The other 17 are comments that can be
reworded freely. This one requires renaming a test — a decision that deserves to be made on its
own merits, with its own blast-radius check, not absorbed into a comment-hygiene sweep.

## Consequence for the gates — this part is load-bearing

**The "no citation survives" gate MUST be scoped to comment lines, not whole files.** A
whole-file gate is *unsatisfiable* while this site is out of scope: it could only ever go green
by editing the `it()` title, which is precisely what the ruling forbids. That is the
"gate that can only pass by deleting legitimate code" shape this project has already been
caught by once (quick task `260929-k5e`, whose gate grepped a literal file-wide and matched four
pre-existing unrelated teardown calls, making it impossible to satisfy honestly).

Strip comment lines' content for the assertion, or exclude the known in-title line explicitly and
assert its count is exactly 1 so the exclusion cannot silently widen.

## What must be recorded downstream

The SUMMARY must name this site as **deliberately excluded with a reason**, not omitted — the
same disclosure standard the plan-checker enforced on quick task `260929-vmb`, where a narrowed
scope that did not name what it left out drew a warning.
