---
created: 2026-09-07
title: "i18nCatalogPresenceBaseline.json's totalPairs is documentary only — nothing catches it drifting out of sync with `missing`"
area: meta-i18n-gates
status: "RESOLVED 2026-09-08 by quick task 260908-gx3. Took disposition 1 (derive at write time, assert at read time as a self-consistency check only). Deviation from this todo's wording, deliberate: routed to hardFailures, not findings -- findings do not reach the exit code. See the Resolution section below."
severity: minor
source: "41-REVIEW.md IN-01, carried forward by 41-REVIEW-FIX.md (outstanding)"
files:
  - meta/i18nCatalogPresenceBaseline.json (totalPairs)
  - meta/lintTranslations.ts (comparePresenceBaseline; the writer at ~:488-497)
resolves_phase: null
---

# `totalPairs` is prose that looks like a gate

## The observation

`comparePresenceBaseline()` derives its entire comparison from `baseline.missing` and never reads
`baseline.totalPairs`. The artifact's own embedded `reason` string says so explicitly: "The
assertion is over `missing`, never over `totalPairs` -- do not 'fix' the gate by comparing
counts."

**That design is correct and should not be changed.** Making a redundant count load-bearing is
exactly the drift-prone coupling the comment is warning against, and this repo has already paid
for artifact/pin coupling once — regenerating `meta/i18nGateScope.json` breaks the hard-coded
counts in `genI18nGateScope.test.ts` ([[regenerating-an-artifact-breaks-the-pins-that-guard-it]]).

## The actual risk, which is small and real

Nothing catches `totalPairs` silently disagreeing with `missing` if the file is ever hand-edited.
At that point it is a number in a JSON file that a future maintainer can reasonably mistake for
an enforced invariant — the field name gives no signal that it is inert.

The failure mode is not "the gate breaks". It is "someone reads `totalPairs: 0`, concludes the
gate is asserting zero missing pairs, and builds on that assumption."

## Cheapest sufficient dispositions, in order of preference

1. **Derive it at write time and assert it at read time as a self-consistency check only** —
   `totalPairs === sum(missing[*].length)`, reported as a finding about the *file* rather than
   about the catalogs. Keeps the comparison over `missing` untouched.
2. **Rename it** to something that reads as non-load-bearing (`totalPairsAtRecord`) and say so in
   the `reason` string.
3. **Drop the field.** It is not read by anything.

Option 1 is the only one that adds a gate; if it is taken, it must go RED against a hand-edited
fixture where the count and the map disagree, or it is [[gate-failure-mechanisms]] all over again.

## Note

The `reason` string this todo quotes is itself stale for an unrelated sentence — see the sibling
todo on the 794-pair comment drift. Both live in the same writer block; fix them together.

---

## Resolution — 2026-09-08, quick task 260908-gx3

**Disposition taken: option 1.** `checkPresenceBaselineSelfConsistency(baselinePath)` in
`meta/lintTranslations.ts` asserts `totalPairs` is a finite number and equals
`sum(missing[*].length)`. `comparePresenceBaseline()` was not touched — the drift comparison is
still derived from `missing` alone, exactly as this todo insisted.

The coupling this adds is *within one JSON object*, never between the artifact and the live
catalogs. That is what makes it categorically unlike
[[regenerating-an-artifact-breaks-the-pins-that-guard-it]], where a committed count had to track a
separately-evolving tree. Confirmed in practice: the artifact was regenerated as part of this same
task and no pin broke.

### Deviation from this todo's wording, stated rather than buried

This todo said the result should be "reported as a finding about the *file* rather than about the
catalogs". Two readings: the *subject* of the message, or the *channel*. The fix takes the first
and routes to `result.hardFailures`, because `findings` do not contribute to the exit code — a
check whose only effect is a line nobody reads is precisely [[gate-failure-mechanisms]]. It is
safe on the hard-failure path because the predicate is a pure function of one committed file the
writer always emits consistently; the only way to fire it is the hand-edit this todo describes.

### The RED this todo demanded, plus its negative controls

R21a-d in `meta/__tests__/lintTranslations.test.ts` (R15 was already taken by the write-guard
test):

- **R21a** desynced hand-edited copy → reported
- **R21b** `totalPairs` absent entirely → reported
- **R21c** the real committed baseline → `[]`
- **R21d** the desync reaches `hardFailures` through the real `lintTranslations()` entry point

Both controls were run, not assumed:

| Control | Result |
| --- | --- |
| helper neutralised to `return []` | a, b, d RED; c GREEN (as designed) |
| call site removed, helper intact | d alone RED — proving d is the wiring arm |

Without R21d, a-c would have passed identically against a helper nothing called
([[a-pass-can-cover-an-unreachable-surface]]).

No expected number is hard-coded in the tests; each is derived from whatever the committed
baseline holds at run time, so regenerating that artifact cannot break these pins.
