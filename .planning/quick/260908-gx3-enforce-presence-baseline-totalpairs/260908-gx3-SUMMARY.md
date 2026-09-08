---
phase: quick
plan: 260908-gx3
subsystem: meta-i18n-gates
tags: [lintTranslations, presence-baseline, i18n, gate, comment-drift]
requires: []
provides: [checkPresenceBaselineSelfConsistency]
affects:
  - meta/lintTranslations.ts
  - meta/i18nCatalogPresenceBaseline.json
tech-stack:
  added: []
patterns:
  - "Self-consistency gate: assert two halves of ONE committed artifact agree, never the artifact against a separately-evolving tree. Keeps the drift-prone artifact/pin coupling out while still closing the 'inert field looks enforced' hazard."
  - "Test pins derived at run time from the artifact under test, not hard-coded, so regenerating that artifact cannot break them."
  - "Two negative controls per wired gate: neutralise the helper (proves the assertions), then remove only the call site (proves the wiring)."
key-files:
  created: []
  modified:
    - meta/lintTranslations.ts
    - meta/__tests__/lintTranslations.test.ts
    - meta/i18nCatalogPresenceBaseline.json
    - .planning/todos/pending/2026-09-07-presence-baseline-totalpairs-is-unenforced-prose.md (moved to completed/)
    - .planning/todos/pending/2026-09-07-linttranslations-header-comment-cites-794-pairs-now-zero.md (moved to completed/)
decisions:
  - "Routed the self-consistency failure to `hardFailures`, not `findings` — a deliberate deviation from the todo's wording, recorded in the todo itself. `findings` do not reach the exit code; a check that cannot fail the run is a gesture. Safe here because the predicate is a pure function of one committed file the writer always emits consistently."
  - "Renamed the new arms R15a-d -> R21a-d after discovering R15 was already taken by the baseline write-guard test. An ambiguous test ID is a records defect waiting to happen."
  - "Regenerated the artifact via LINT_TRANSLATIONS_WRITE_BASELINE=1 rather than hand-editing the `reason` string, so the writer and the shipped file cannot diverge."
  - "Fixed a third stale-794 site (the CANONICAL_LOCALES_PATH comment) that neither todo enumerated — same defect, two lines away."
metrics:
  duration: "~1 session"
  completed: 2026-09-08
---

# Quick 260908-gx3: enforce presence-baseline `totalPairs`, de-stale the 794-pair prose

Actioned `2026-09-07-presence-baseline-totalpairs-is-unenforced-prose` plus the sibling it names,
`2026-09-07-linttranslations-header-comment-cites-794-pairs-now-zero`. Both landed in the same
writer block; the primary todo instructed fixing them together, and the `reason` string was being
rewritten for the primary fix regardless.

## 1. `checkPresenceBaselineSelfConsistency()` — `meta/lintTranslations.ts`

`comparePresenceBaseline()` derives its entire comparison from `baseline.missing` and never reads
`baseline.totalPairs`. That is correct and was left untouched. The gap was narrower than "the gate
is broken": an inert field whose name reads like an invariant invites a maintainer to see
`totalPairs: 0` and conclude the gate asserts zero missing pairs.

The new check asserts `totalPairs` is a finite number and equals `sum(missing[*].length)`. It is a
statement about the FILE's internal agreement — it opens no locale, derives nothing live, and
cannot be tripped by translation state. The only way to fire it is a hand-edit.

Took **disposition 1** of the three the todo offered. The coupling it introduces is within one
JSON object, never between the artifact and a separately-evolving tree — categorically unlike the
artifact/pin coupling this repo has already paid for. Confirmed in practice: the artifact was
regenerated in this same task and no pin broke.

### Deviation, stated rather than buried

The todo said "reported as a finding about the *file* rather than about the catalogs". That is
ambiguous between the message's *subject* and its *channel*. I took the first and routed to
`result.hardFailures`, because `findings` do not contribute to the exit code. Recorded in the todo
alongside the reasoning.

## 2. R21a-d, with both negative controls actually run

| Arm | Claim |
| --- | --- |
| R21a | desynced hand-edited copy → reported, naming both numbers |
| R21b | `totalPairs` absent entirely → reported |
| R21c | the real committed baseline → `[]` |
| R21d | the desync reaches `hardFailures` through the real `lintTranslations()` entry point |

| Control | Result |
| --- | --- |
| helper neutralised to `return []` | a, b, d RED; c GREEN (as designed) |
| call site removed, helper intact | d alone RED — proving d is the wiring arm |

Without R21d, a-c would have passed identically against a helper nothing called. No expected
number is hard-coded; each is derived at run time from whatever the committed baseline holds.

## 3. Three stale-794 sites, one more than filed

1. Header (~:52) — mechanism-first rewrite; 794 survives only in an explicitly-historical
   parenthetical naming `260906-u8i`, and the comment now says the baseline, never a comment, is
   where the current figure lives.
2. `CANONICAL_LOCALES_PATH` (~:420) — **not enumerated by either todo**. Now baseline-agnostic.
3. The `reason` string — worst of the three because it is written *into* the generated JSON, so
   the stale claim shipped in the artifact and was re-emitted by every regeneration. The "out of
   Phase 41's unattended scope" constraint was lifted on a phase since closed; replaced with the
   file's real contract plus what `totalPairs` now is.

Regenerated with `LINT_TRANSLATIONS_WRITE_BASELINE=1`; diff confined to `reason` and `generatedAt`,
with `totalPairs: 0` and `missing: {}` unchanged.

## Verification

- `pnpm codecheck` — clean
- `npx jest --config meta/jest.config.js` — **38 suites, 1040 passed, 1 skipped**
- `pnpm lint-translations:gamelib` — `0 findings, 0 hard failures`, exit 0
- `npx prettier --check` on both touched files — clean
- `npx eslint` — 0 errors; the one warning I briefly introduced (a helper param named `use`
  tripping `react-hooks/rules-of-hooks`) was renamed away before commit
- `grep -rn 794 meta/` — exactly one line, the historical parenthetical

## Commits

- `592a753cc` feat: the check, its call site, R21a-d
- `64459ea44` docs: the three prose sites + regenerated artifact
