# Deferred items -- quick 260924-swb

Out-of-scope findings surfaced while running this task's gate battery. Not fixed here
per the executor's scope boundary rule (only auto-fix issues directly caused by this
task's own diff).

## 1. `labelSuiteI18nCensus.test.ts` -- 2 pre-existing failures, unrelated to this diff

`npx jest --selectProjects Frontend` reports `src/frontend/screens/Game/GamePage/components/__tests__/labelSuiteI18nCensus.test.ts`
failing (2 tests) on every run in this session, both before and after every commit
this plan made. The failing assertions are about a `faithfulReactI18next()` helper's
i18next-mock shape and have nothing to do with `GameCard`, `GamesList`,
`cardVisibility.ts`, or `frontend/types.ts`.

Confirmed NOT caused by this task's diff:

- `git diff f3b856aa2 HEAD -- src/frontend/screens/Game/GamePage/components/__tests__/labelSuiteI18nCensus.test.ts`
  is empty -- this task never touched the file.
- `git show f3b856aa2:.../labelSuiteI18nCensus.test.ts` diffed byte-identical against
  the working-tree copy at the end of Task 2, confirming the failure already existed
  at the first commit this plan made (Task 1's RED commit) and is not a regression
  introduced by any commit in this plan.
- `cardVisibility.test.ts` -- the file this plan's tests actually target -- passes in
  full (18/18) on every run.

Conclusion: pre-existing, unrelated to `GameCard` card-art visibility. Not
investigated further or fixed here; flagged for whoever owns the i18n test-suite
mock shape.
