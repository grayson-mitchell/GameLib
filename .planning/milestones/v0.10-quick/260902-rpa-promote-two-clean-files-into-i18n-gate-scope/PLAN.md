---
id: 260902-rpa
slug: promote-two-clean-files-into-i18n-gate-scope
date: 2026-09-02
status: in-progress
---

# Quick Task 260902-rpa — promote the two measured-clean files into the i18n gate scope

Closes the follow-up quick `260902-qs4` deliberately left open: `hooks/useOpenDialog.ts` and
`Settings/components/CustomWineProton.tsx` both measure ZERO violations, so they belong in the
BLOCKING scope rather than in a comment-only debt register. The user is making this curation
decision explicitly; `260902-qs4` declined to make it as a side effect of a red-suite fix.

## Pre-measurement (taken BEFORE any edit, against the post-`21dd66e4c` gate)

| | value |
|---|---|
| baseline `scannedFiles` | 161 |
| baseline `violations` | 0 |
| audit `scanScope({ extraFiles: [both] })` `scannedFiles` | 163 |
| audit `violations` total | 0 |
| `useOpenDialog.ts` | **0** |
| `CustomWineProton.tsx` | **0** |
| violations in any OTHER file | 0 |

The earlier 0/0 measurement predated the gate change in `21dd66e4c`, so it was re-taken rather
than trusted.

## Tasks

1. `meta/i18nGateScope.json` — insert the two paths in sorted position, `files` 161 -> 163.
   `baseCommit`/`baseVersion`/`generatedAt`/`generatedBy`/`excluded` byte-identical (the A5
   provenance ratchet asserts `generatedBy` still reads as hand-curated).
2. `meta/__tests__/genI18nGateScope.test.ts` — drop the same two paths from
   `DECLARED_UNSCANNED_DEBT` (46 -> 44, since 207 - 163 = 44); update the FOUR literal `161`
   pins (:653 comment, :679 title, :680 assertion, :708 title) to 163; APPEND a new dated
   doc-comment entry. Historical lines (:124, :126, :136, :141, :144, :161) left standing —
   they are a log, not pins.
3. Verify + commit with explicit pathspecs.

## Constraints

- No `pnpm gen-i18n-gate-scope` / `gen-i18n-scope:rewrite` (regen turns 1 failure into 5).
- No `git checkout -- <file>` / `git stash` / `git reset --hard` (post-checkout hook throws).
- No `gsd-sdk query state.*` / `roadmap.update-plan-progress` / `phase.complete`.
- `meta/i18nGateAllowlist.json` must show NO diff (pinned at exactly 2 entries by T-34.8-30).
- Lint ratchet is `--max-warnings 4145`.

## Success criteria

- `npx jest --selectProjects Meta` green (36/36 suites); full `pnpm test` 0 failing suites.
- The gate genuinely scans **163** files, so the widening is not vacuous.
- tsc, eslint, prettier clean on every changed file.
