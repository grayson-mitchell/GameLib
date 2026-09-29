---
phase: quick-260929-wyk
plan: 01
subsystem: humble-keys-tests
tags: [citation-hygiene, comment-only, test-files, humble]
status: complete
dependency-graph:
  requires: [260929-w93]
  provides: [stale-citation-family-closed]
  affects:
    - src/backend/humble/__tests__/keyTypePresentation.test.ts
    - src/backend/humble/__tests__/userAgent.test.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
tech-stack:
  added: []
  patterns:
    - "Comment-only citation anchoring: symbol/title/mock-specifier/selector, never a line number"
key-files:
  created:
    - .planning/quick/260929-wyk-finish-the-stale-citation-family-the-18-/260929-wyk-SUMMARY.md
  modified:
    - src/backend/humble/__tests__/keyTypePresentation.test.ts
    - src/backend/humble/__tests__/userAgent.test.ts
    - src/backend/humble/__tests__/library.test.ts
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
    - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
decisions:
  - "The 8 out-of-scope index.css stylesheet-to-stylesheet citations are deferred; the sound reason is that this task's mandate was always the file.ts(x):NNN family (task title + sibling's explicit deferral), not that the gate pattern would otherwise be unsatisfiable (gate design follows scope, not the reverse)"
  - "No Case B site found among the 18 citations — every one is Case A (moved, not replaced)"
metrics:
  duration: "~35 minutes"
  completed: 2026-09-29
actuals:
  tokens: 3451
  tasks: 3
  commits: 1
  plan_head_before: a4e9edbba
---

# Phase quick-260929-wyk Plan 01: Finish the stale-citation family (the 18) Summary

Re-anchored all 17 in-scope `file.ts(x):NNN` comment citations across six Humble
test files and one stylesheet to symbol/title/mock-specifier/selector form,
converting even the ones that were still numerically accurate — a correct
number today is rot-in-waiting, and leaving some while fixing others rebuilds
exactly the ambiguity this family exists to end.

## Census re-derived at execution time

18 citations across 7 files, matching the 18 measured at planning exactly —
no drift, no re-derivation of the site table required. Per-file: 1, 3, 2, 2,
5, 1, 4 = 18 (same per-file distribution reported by gate 2A at HEAD). 17 in
scope, 1 excluded by the ruling.

## Case A / Case B verdict — every citation

**No Case B site found.** All 18 sites (17 edited + 1 excluded) are Case A:
the cited thing still exists today, merely moved or drifted from the number
that once pointed at it. Re-confirmed each site by reading both the citing
sentence and the resolved target before editing, not by trusting the
planning table as authority:

| # | citing site | target confirmed | verdict |
|---|---|---|---|
| 1 | `keyTypePresentation.test.ts:275` | `KNOWN_GAME_KEY_TYPES` decl at `classify.ts:183` | A — accurate, converted |
| 2 | `userAgent.test.ts:5` | `standardBrowserUserAgent` decl at `userAgent.ts:26` | A — accurate, converted |
| 3 | `userAgent.test.ts:29` | UA template string at `userAgent.ts:35` | A — accurate, converted |
| 4 | `userAgent.test.ts:31` | platform-extraction regex at `userAgent.ts:28` | A — accurate, converted |
| 5 | `library.test.ts:2861` | `classifyTpk`'s server-truth branch (`classify.ts:56-60`), NOT line 409 (`const keys: HumbleKey[] = []`, unrelated) | **A — stale**, corrected |
| 6 | `library.test.ts:3501` (bare `HumbleKeyRow:116`) | `settleAction` prop, `HumbleKeyRow/index.tsx:121` | **A — stale, no extension**, corrected (gate 2B) |
| 7 | `library.test.ts:3502` | same `settleAction` prop, was pointing at docblock prose not the prop | **A — stale**, corrected |
| 8 | `Keys/index.css:187` | NavShell census `it(...)` still exists | A — accurate, converted |
| 9 | `Keys/index.css:188` | NavShell SANITY `it(...)` still exists | A — accurate, converted |
| 10 | `HumbleKeyRow/__tests__/index.test.tsx:14` | import-after-mocks convention (`import HumbleClaimWizard from '../index'` at line 144, not the explaining comment at 142) | **A — near-miss**, corrected to point at the import |
| 11 | `HumbleKeyRow/__tests__/index.test.tsx:23` | `jest.mock('react-i18next', …)` in `HumbleClaimWizard/__tests__/index.test.tsx` | A — accurate, converted |
| 12 | `HumbleKeyRow/__tests__/index.test.tsx:1087` (now ~1089) | `selectKeysWaiting` filter, `common/humble/viewFilters.ts:84` — original cited it inside the D-53 docblock, not the selector itself | **A — stale**, corrected |
| 13 | `HumbleKeyRow/__tests__/index.test.tsx:1105` (now ~1107) | settle-merge inside `fetchAndCommitOrder`, `library.ts:258-259` | A — accurate hit, converted anyway |
| 14 | `HumbleKeyRow/__tests__/index.test.tsx:1267` (now ~1271) | `gog_keyless` entry in `KEY_TYPE_PRESENTATIONS`, `common/humble/keyTypePresentation.ts:94` | A — accurate, converted |
| 15 | `HumbleClaimWizard/__tests__/index.test.tsx:747` | `humbleClaimWizardRejectedNote` paragraph on the terminal `step === 'rejected'` branch of `index.tsx` (~line 594) — original cited line 556, which is inside the confirm-step's prior-refusal-warning render, a different one of three occurrences of the same class name | **A — stale**, corrected |
| 16 | `humbleKeysStylesheet.test.ts:29` | NavShell census `it(...)`, title already quoted beneath | A — accurate, converted |
| 17 | `humbleKeysStylesheet.test.ts:32` | NavShell SANITY `it(...)`, title already quoted beneath | A — accurate, converted |
| — | `humbleKeysStylesheet.test.ts:101` | **IN-TITLE — excluded by ruling, untouched** | — |
| 18 | `humbleKeysStylesheet.test.ts:342` | the `it.each(...)` titled `'a generic-platform key in %s state resolves to the same scenario a steam key in that state would (REQ-43-01)'` — original cited a line inside the test body, not a title | **A — near-miss**, corrected |

Judgement calls confirmed by reading code (not assumed from the planning
table): the settle-merge's enclosing function is `fetchAndCommitOrder`
(nearest named function above the merge, no closer named function
intervenes); the rejected-step referent resolves to the third of three
`humbleClaimWizardRejectedNote` occurrences — the one gated on
`step === 'rejected'`, since that is the one the citing sentence calls
"terminal"; the scenario-resolution referent is the enclosing `it.each`
title, not a narrower nested title (there is none — the parameterised cases
run inside the one `it.each` block); the import-after-mocks referent is the
`import HumbleClaimWizard from '../index'` statement itself, two lines below
the comment that explains it.

## Citations that were already accurate, converted anyway

Rows 1-4, 8, 9, 11, 13, 14, 16, 17 (10 of the 17 edited sites) pointed at a
line number that is still correct today. All were converted anyway: a
correct number is rot-in-waiting exactly like a wrong one, and leaving
accurate numbers while fixing stale ones would leave a mixed convention in
the same files — reintroducing the ambiguity this family exists to end.

## Exclusion 1 — the in-title citation

`humbleKeysStylesheet.test.ts:101`'s citation lives inside an `it()` title
string and was deliberately **not** edited, per
`260929-wyk-SCOPE-DECISION.md`. Title stability outranks citation hygiene
here because an `it()` title is the test's identity — what
`--testNamePattern` filters on, what CI reports name — and renaming a test
is a decision that deserves its own blast-radius check, not absorption into
a comment-hygiene sweep. Gate 2A confirms exactly one comment-scoped
citation survives and that it is located at this site, so the exclusion
cannot silently widen into cover for a missed comment site.

## Exclusion 2 — the 8 stylesheet-to-stylesheet citations in `index.css`

`index.css` carries 8 further `file.css:NNN`-shaped citations pointing at
five other stylesheets (three at the app-level stylesheet, one each at
five component stylesheets). These are deliberately deferred and untouched.

**The sound reason, corrected from the plan's own framing:** this task's
mandate was the `file.ts(x):NNN` citation family from the outset — it is in
the task title and in the sibling task's (`260929-w93`) explicit deferral of
everything under `__tests__/`. The plan-check found the plan's stated
justification (that widening the gate pattern would make it unsatisfiable)
circular — that justifies scope by gate design rather than the reverse. The
gate's `\.tsx?:` pattern is scoped the way it is *because* the task's mandate
excludes `.css:NNN`-target citations, not the other way around. Sweeping
them here would also scatter edits through five unrelated comment regions of
a file whose in-scope work is two lines, making the diff materially harder
to audit against the "changed nothing that executes" constraint.

## Anchor convention used for test-file targets

Two forms were needed beyond the sibling's symbol-plus-path form:

- **`it`/`describe`/`it.each` title, plus bare path** (rows 8, 9, 16, 17, 18)
  — test files export nothing to anchor on, so the title is the only stable
  handle. Honest limitation: a title is mutable, not rot-proof. But it rots
  in the OPPOSITE direction from a line number — a number rots on every
  unrelated edit above it, silently, and stays wrong exactly when you would
  not think to check; a title survives unrelated edits untouched and changes
  precisely when the test's meaning changes, at which point the citing
  comment SHOULD be revisited, and a grep for the old title fails loudly
  instead of resolving to unrelated code. Rot-visible, not rot-proof.
- **`jest.mock('<specifier>', …)` call, plus bare path** (row 11) — this
  citation points at module-level test setup with no title at all, so the
  title form does not cover it.

## `stripSourceComments` finding — measured, not assumed

Confirmed during execution (not merely trusted from planning): `index.css`'s
comment-stripped content is byte-identical to HEAD after both edits
(gate 2C), proving the stylesheet's real assertions — which run entirely
against inline fixture strings, never the file itself, per direct reading of
all four SANITY tests in `humbleKeysStylesheet.test.ts` — cannot be affected
by these comment edits. The residual hazard was the `*/` delimiters, not the
prose; no delimiter was added, removed, or relocated in this edit, and gate
2C's strip-equivalence check (which would catch a moved boundary) passed
clean.

**Partial verification, reported as such per the plan-check note:** the
plan's claim that the sibling task's comment-only gate would have
FALSE-FAILED on this file set was corroborated **by inspection only** — read
`index.css` and confirmed it does use single-star `/* ... */` comment
openers (e.g. lines 15, 28, 82, 110, 126) against a hypothetical `/**`-only
allowlist — but the sibling gate script itself was not re-executed to
mechanically confirm the failure. This is corroboration, not measurement.

## Observed suite/test counts and title-diff result

Both projects at their measured baselines, both title sets byte-identical
before and after:

| project | suites | tests | titles | title diff |
|---|---|---|---|---|
| Backend (`humble/__tests__/(library\|keyTypePresentation\|userAgent)`) | 4 | 230 | 230 | **byte-identical** |
| Frontend (`screens/Humble/Keys`) | 4 | 209 | 209 | **byte-identical** |

Both runs' trailing line read "Ran all test suites matching /.../i.",
confirming the path filter applied rather than sweeping the whole project.
No non-comment content changed in any of the seven files (gate 2C, empty-diff
guard did not fire — a real diff was measured).

## Deviations from Plan

### Auto-fixed Issues

None beyond the task's own planned corrections. All edits were exactly the
comment-only re-anchoring the plan specified; no bug, blocker, or missing
functionality was discovered outside that scope.

One minor self-correction during execution: an early draft of the
`userAgent.ts` edit at `userAgent.test.ts:29-32` inadvertently trimmed an
unrelated same-file line-number reference ("on line 33", pointing at a line
within the same file, not part of the 18-citation family) while rewording
the surrounding sentence. Caught before verification and restored, since
that reference was out of this task's mandate and the constraint is to
replace pointers, not compress prose.

## Known Stubs

None. This plan touches only comment text.

## Threat Flags

None. Comment-only edits to test files and a stylesheet; no new network
endpoint, auth path, file access pattern, or schema change. Consistent with
the plan's own threat-model conclusion (no trust boundary, no data flow in
comment prose).

## Self-Check: PASSED

- All 7 modified files exist and contain the expected anchor text (spot
  verified via `grep` during execution — no stale-pattern hits remain,
  gate 2A/2B confirmed 0 unexpected).
- Commit `7acbb4208` exists in `git log --oneline` on `main`.
- `git diff --diff-filter=D HEAD~1 HEAD` reports no deletions.
- `git status --short` shows only the untracked planning directory remaining
  after commit — no other unintended changes.
