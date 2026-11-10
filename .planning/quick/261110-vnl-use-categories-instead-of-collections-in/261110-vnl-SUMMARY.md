# Quick 261110-vnl: Categories instead of Collections Summary

Filter panel header and rows, the focus-row divider and the library tour copy now say "Categories" (en and locales that already translate it). No keys, components or types renamed.

## Commits
- Task 1: locale values (43 files, 116 lines changed)
- Task 2: t() defaults and test assertions (6 .tsx files)
- Task 3: todo `git mv` to completed/ was swept into the Task 2 commit (it was staged); the appended `## Resolution` section is unstaged for the orchestrator's docs commit.

## Task 1 locale report (scratchpad script `loc.py`, targeted single-line substitution)
en: 5 values changed. Non-en, keys left unchanged where the locale has no Categories wording:
- collections skipped: br, bs, eu, fa, he, ro, sl, uz
- manageCollections skipped: az, br, bs, eu, fa, he, hr, ka, sl, sr, th, uz
- newCollection skipped: az, br, bs, eu, fa, he, hr, ka, sl, sr, th, uz
- ml changed collections+newCollection; ro changed manage+new; az/hr/ka/sr/th changed collections only.

## Deviations
- br and sl were fully skipped beyond the survey (br has no translation.json; sl has no Categories keys). Harmless: they keep existing translations.
- ml `manageCollections` skipped matches the survey.

## Verification
- All locale JSON parses; the diff touches 1-4 lines per file.
- Jest: 5 suites, 144 tests passed. Prettier and eslint clean.
- `pnpm lint-translations:gamelib` fails on pre-existing missing translations (e.g. quickFiltersCollections exists only in en, as the plan noted). No new finding.
- `pnpm planning-gates`: 11/12; the failing gate is `state-sdk-field-anchor-gate.py` (STATE.md bold Status duplicate), unrelated to this task.
- Other unrelated modified files in src/backend and Settings were left untouched and unstaged.
