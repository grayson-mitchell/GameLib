---
task: 260827-vpl-close-out-phase-34-11-final-three-residu
reconstructed: true
reconstructed_by: "verification subagent (goal-backward verifier), post-hoc"
reconstructed_on: 2026-08-28
reconstructed_reason: >
  The original executor stalled mid-verification of Task 3 and never wrote
  this file. This SUMMARY.md was reconstructed entirely from the committed
  git history (commits 7bf5c2f89, b04601b8a, 4e975f3b9, e52a6759c) and from
  independent measurement (test runs, diffs, arithmetic re-derivation)
  performed by the verifier, NOT from any executor-authored notes. Treat
  every claim below as externally re-derived evidence, not self-report.
commits:
  - sha: 7bf5c2f89
    subject: "test(34.11-quick-vpl): add failing assertions WR-10/WR-11/D-08a (alphabet letter filter)"
  - sha: b04601b8a
    subject: "feat(34.11-quick-vpl): WR-10/WR-11/D-08a -- alphabet letter behaves like filter it"
  - sha: 4e975f3b9
    subject: "test(34.11-quick-vpl): measured ratchet closes WR-18 without touching pinned i18n config"
  - sha: e52a6759c
    subject: "docs(34.11-quick-vpl): close ledger -- all_fixed, 22 fixed / 0 open / 1 invalid"
base_commit: 51716f88f
concurrent_session_commits_excluded: [f36e21cff, af09a6bb3]
requirements: [WR-10, WR-11, WR-18]
---

# 260827-vpl: Close out Phase 34.11's final three residual findings — SUMMARY (reconstructed)

**This file was not written by the executor.** The executor stalled mid-verification of
Task 3 and never produced a SUMMARY.md. This document was assembled after the fact by a
verification subagent, from the actual commits on disk plus independent re-measurement.
Where the original plan's intent and the commit contents agree, that is stated as fact.
Where anything could not be independently confirmed, it is called out explicitly rather
than assumed.

## What was done (per commit, as verified)

### Task 1 — RED tests (`7bf5c2f89`)

Added `src/frontend/screens/Library/__tests__/alphabetLetterIsAFilter.test.ts`, a new
source-gate test file with 4 tests (S1–S4) asserting, against the pre-fix source:

- S1: `clearAllFilters` must call `setAlphabetFilterLetter(null)` (WR-11).
- S2: `handleToggleAlphabetFilter` must call `setAlphabetFilterLetter(null)` when hiding
  the strip (D-08a, a new consequence identified during planning, not in the original
  Phase 34.11 review).
- S3: the zero-state branch must match `/activeFilterCount > 0 \|\| alphabetFilterLetter/`
  after comment-stripping (WR-10).
- S4: non-vacuity — each of S1–S3 is proven to fail against a deliberately sabotaged copy
  of its own extracted text.

Also extended `FilterChipRow/__tests__/index.test.tsx` with a new
`describe('FilterZeroResult admits the alphabet letter (WR-10 / WR-11 / D-08a)')` block
(tests B1–B5) covering the rendered zero-state label text for both a bare letter and the
`'#'` (numeric-start) case, label ordering when combined with other active filters, a
regression guard for the no-letter case, and guard-order preservation.

**Independently confirmed:** these tests were genuinely RED before the Task 2 fix — the
verifier reconstructed the pre-fix `Library/index.tsx` via `git show 51716f88f:...`,
replayed S1–S3's assertions against it in a scratch jest file, and observed real failures,
then deleted the scratch file and confirmed a clean `git status`.

### Task 2 — the fix (`b04601b8a`)

Modified `src/frontend/screens/Library/index.tsx`:
- `clearAllFilters` now also calls `setAlphabetFilterLetter(null)`.
- `handleToggleAlphabetFilter` now calls `setAlphabetFilterLetter(null)` whenever the
  strip is being hidden (the new `newValue === false` branch), per D-08a.
- The zero-state render branch condition was widened from `activeFilterCount > 0` to
  `activeFilterCount > 0 || alphabetFilterLetter`, so a letter-only zero result routes to
  `FilterZeroResult` instead of the generic `EmptyLibraryMessage` (WR-10).
- The pre-existing `const activeFilterCount = activeFilterDescriptors.length` invariant
  (D-26) is untouched — confirmed byte-identical at that line.

Modified `src/frontend/screens/Library/components/FilterZeroResult/index.tsx`:
- Widened its early-return guard from `activeFilterCount === 0` to
  `activeFilterCount === 0 && !alphabetFilterLetter`.
- Added label-append logic distinguishing the `'#'` (numeric) case from a lettered case,
  using two new i18n keys under `library.filterPanel`: `emptyAlphabetLetter` and
  `emptyAlphabetNumber`.

Added the two new keys to `public/locales/en/gamelib.json` only.

**Independently confirmed:** all 4 RED tests from Task 1 now pass (82/82 in the combined
`alphabetLetterIsAFilter.test.ts` + `FilterChipRow/__tests__/index.test.tsx` run), the
D-26 invariant (`activeFilterCount === activeFilterDescriptors.length`) is intact, and the
pre-existing `FilterChipRow` UI-SPEC source gate (which forbids
`sortDescending|sortInstalled|alphabetFilterLetter|showAlphabetFilter` vocabulary appearing
in `FilterChipRow/index.tsx`'s own source) still passes — the new alphabet-filter logic
lives in `Library/index.tsx` and `FilterZeroResult`, not in `FilterChipRow` itself.

**Gap identified by the verifier (not disclosed anywhere in the commits themselves):** the
two new i18n keys (`emptyAlphabetLetter`, `emptyAlphabetNumber`) exist only in
`en/gamelib.json`. They are absent from `de/gamelib.json` and `fr/gamelib.json` (the only
other locales carrying a `gamelib.json`), even though other pre-existing keys in the same
file are translated into both. `pnpm machine-fill-gamelib` does not appear to have been run
for these two keys. See "Gaps" below — classified WARNING, not blocking.

### Task 3 — WR-18 ratchet (`4e975f3b9`)

Task 3 is the task the executor stalled while verifying. The commit itself is complete and
was independently re-verified in full by this verifier (see VERIFICATION.md).

Added a new `describe('measured ratchet over facetLabels.ts / chipLabels.ts (WR-18,
DECISION 3, quick 260827-vpl)')` block to `meta/__tests__/hardcodedStringGate.test.ts`,
pinning:
- `facetLabels.ts` produces exactly 8 gate violations, `chipLabels.ts` exactly 35.
- A sorted, de-duplicated 33-entry text-set snapshot of what the gate currently flags in
  those two files.
- Zero collateral violations outside the two named files.
- A non-vacuity test that sabotages a scratch copy of `chipLabels.ts` (via `mkdtempSync`,
  never the real file) and confirms the ratchet's count/text-set assertions genuinely fail
  against the sabotaged copy.

Also made a comment-only addition to `meta/__tests__/genI18nGateScope.test.ts`'s
`DECLARED_UNSCANNED_DEBT` header comment, documenting that these two files' debt is now
covered by the measured ratchet above. The `DECLARED_UNSCANNED_DEBT` array's actual
contents are unchanged (confirmed via diff — only comment lines were added).

Per DECISION 3 in the plan, WR-18 was explicitly NOT closed via
`meta/i18nGateAllowlist.json` (ruled the wrong register — that file is for genuine,
deliberately-deferred untranslated debt, not for pinning a gate false positive), and NOT
by widening `meta/i18nGateScope.json`. A new pending todo,
`.planning/todos/pending/2026-08-27-i18n-gate-flags-declaration-site-literals-as-violations.md`,
was created to carry the underlying gate-heuristic limitation (the gate cannot distinguish
a `[key, defaultText]` data table from genuinely untranslated UI copy) as a separate,
explicitly cross-cutting, non-blocking piece of work. Its frontmatter has no
`resolves_phase:` field, matching this project's own established convention (several other
pending todos, e.g. the 2026-08-17 keyring/humble ones, omit the field the same way) for
"does not hold any phase open."

**Independently confirmed:** the sabotage/restore non-vacuity proof was re-run live by the
verifier (append a canary literal directly to the real `facetLabels.ts`, observe the W2/W3
assertions genuinely fail with the expected diff, restore from a backup, confirm
`git diff` on the file is empty). All 133 tests in `hardcodedStringGate.test.ts` pass
against the clean tree. All pinned config files
(`meta/i18nGateScope.json`, `meta/i18nGateAllowlist.json`, `meta/i18nForkTouchedFiles.json`)
show zero diff across this task.

### Ledger closure (`e52a6759c`)

- `.planning/phases/34.11-.../34.11-REVIEW-FIX.md`: flipped `status: all_fixed`, updated
  `dispositions` to `{fixed: 22, open: 0, invalid: 1, total: 23}`, added
  `re-swept-4`/`re-swept-4_by`/`re-swept-4_against` frontmatter naming this quick task and
  its three code/test commits. Only the WR-10, WR-11, and WR-18 rows in the Warnings table
  changed; the Criticals table and WR-17's pre-existing INVALID disposition are untouched.
- `.planning/phases/34.11-.../34.11-CONTEXT.md`: D-08 amended via a dated blockquote
  extension (not a rewrite) — premise revised for the alphabet control specifically,
  placement conclusion upheld, both commit SHAs cited.
- `.planning/phases/34.11-.../34.11-VERIFICATION.md`: stale WR-18 row and one combined
  stale row corrected to point at the live ledger; the file's own `status: passed` /
  17/17 scoring left untouched, as required.
- `.planning/todos/pending/2026-08-25-phase-34-11-residual-review-warnings.md` renamed
  (via `git mv`, confirmed via `--summary -M`, 66% similarity) to
  `.planning/todos/completed/`, with `status: completed`, `completed: 2026-08-27`,
  appended closing note.
- New pending todo created for the WR-18 gate-heuristic limitation (see Task 3 above).

**Independently re-derived:** the verifier counted every row in the Criticals and
Warnings tables of `34.11-REVIEW-FIX.md` by hand and got 4 Criticals (all FIXED) + 19
Warnings (18 FIXED + 1 INVALID [WR-17] + 0 OPEN) = 22 fixed / 0 open / 1 invalid / 23
total, exactly matching the committed frontmatter. This was not taken on faith from the
commit message.

## Test evidence (independently run by the verifier, not the executor)

- `alphabetLetterIsAFilter.test.ts` + `FilterChipRow/__tests__/index.test.tsx`: pass.
- `hardcodedStringGate.test.ts`: 133/133 pass.
- Full `meta/jest.config.js` suite: 610 tests, 608 pass, 1 pre-existing known-red
  (A-17 ANTI-ROT staleness guard in `genI18nGateScope.test.ts`, naming exactly the 3 files
  already documented as Phase 34.17 drift in project memory — not a regression from this
  task; the only change this task made to that file was comment-only), 1 skipped.
- Full `src/frontend/jest.config.js` scoped to `src/frontend/screens/Library`: 29 suites,
  687/687 tests pass.
- `pnpm codecheck` (tsc): clean.
- `eslint` on all 6 files touched by this task: 0 errors, 28 warnings, all pre-existing
  `@typescript-eslint/no-unsafe-assignment`/similar patterns endemic to this large,
  loosely-typed file — none attributable to the new code added by this task (the new
  logic itself is plain boolean/string control flow, not `any`-typed).

## Gaps (see VERIFICATION.md for full disposition)

1. **de/fr translation fill missing (WARNING, non-blocking).** The two new
   `en/gamelib.json` keys were not propagated to `de`/`fr` via `pnpm machine-fill-gamelib`.
   `pnpm lint-translations:gamelib` will not catch this — it only validates a translated
   file's own keys against English, and structurally cannot detect a key present in
   English but absent from a translation (confirmed by reading `meta/lintTranslations.ts`
   in full). This is a real, if narrow, incompleteness relative to the plan's own Task 1
   `<done>` criteria.

## What is NOT claimed

This summary does not claim the executor completed a self-review of Task 3 — it did not;
it stalled. Every piece of evidence above was re-derived independently by the verifier
after the fact, from the commits and the working tree, not copied from any executor note
(none existed to copy from).
