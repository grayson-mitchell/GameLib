# Deferred items — quick-260816-a5o

Out-of-scope discoveries. Per the SCOPE BOUNDARY rule these were logged, NOT fixed.
This task changed only `src/backend/testUtils/rustQuoteBalance.ts`,
`src/backend/__tests__/longRunningChannels.test.ts`,
`src/backend/__tests__/tauriShellSource.test.ts` and one planning record.

## D-a5o-01 — 3 pre-existing `npx eslint` errors in the two touched test files

`npx eslint` on the three touched files reports 3 errors + 2 warnings. **All five sit
on lines this task never touched**, verified by diffing this task's commit range
against the pre-task HEAD `b59e111cd`:

```
src/backend/__tests__/longRunningChannels.test.ts
  677:3   warning  Unused eslint-disable directive (no problems were reported from 'no-new-func')
  678:17  error    Implied eval. Do not use the Function constructor to create functions   @typescript-eslint/no-implied-eval
  678:17  warning  Unsafe call of a(n) `Function` typed value                              @typescript-eslint/no-unsafe-call

src/backend/__tests__/tauriShellSource.test.ts
    47:7   error  'CARGO_TOML_PATH' is assigned a value but never used   @typescript-eslint/no-unused-vars
  1437:14  error  This assertion is unnecessary since it does not change the type of the expression
```

Line 677-678 is `parseMsConstantFromSource`'s deliberate `Function(...)` arithmetic
evaluator, which carries its own `// eslint-disable-next-line no-new-func` comment —
the disable names the WRONG rule (`no-new-func`, not
`@typescript-eslint/no-implied-eval`), which is why it reads as both "unused
directive" AND an unsuppressed error. That is a real, small defect, but it predates
this task and is unrelated to quote balance.

`pnpm test:ci` is green (278/278 suites) and `pnpm prettier --check` is clean on all
touched files, so nothing this task gates on is affected.

**Suggested owner:** whoever next touches either file for lint reasons.
