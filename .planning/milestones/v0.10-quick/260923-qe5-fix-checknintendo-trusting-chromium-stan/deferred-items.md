# Deferred Items -- quick-260923-qe5

## Pre-existing, out-of-scope test failure: `labelSuiteI18nCensus.test.ts`

Found during: Task 3 verify (`npx jest --selectProjects Frontend`).

`src/frontend/screens/Game/GamePage/components/__tests__/labelSuiteI18nCensus.test.ts`
fails 2 of its assertions:
  - `C-21: no label suite measures the inline t() default > ... does not return
    the inline default from t`
  - `C-21: no label suite measures the inline t() default > RED: the real
    pre-fix mock shape DERIVED FROM THE CENSUS fails both obligations`

Confirmed **unrelated to this plan**: it fails identically when run in total
isolation (`npx jest --selectProjects Frontend --testPathPattern
labelSuiteI18nCensus`), and this plan touches no file under
`src/frontend/screens/Game/GamePage/` or any i18n/translation source. The
test appears to be self-referentially matching its own source text when it
scans sibling suite files in its directory.

Per CLAUDE.md/executor SCOPE BOUNDARY: not fixed here. Recorded so Task 3's
verify-block failure is not mistaken for a regression caused by this change.
