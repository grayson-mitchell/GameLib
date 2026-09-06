---
created: 2026-09-07
title: "i18nCatalogPresenceBaseline.json's totalPairs is documentary only — nothing catches it drifting out of sync with `missing`"
area: meta-i18n-gates
status: OPEN
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
