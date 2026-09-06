# Deferred Items — Phase 41

Out-of-scope findings surfaced during plan execution, logged per the executor's scope-boundary
rule rather than fixed inline.

## 41-01: `pnpm lint` exceeds its `--max-warnings` ceiling repo-wide

- **Found during:** 41-01 overall verification (step 3: `pnpm lint`)
- **Observed:** `✖ 4199 problems (0 errors, 4199 warnings)` — `ESLint found too many warnings
  (maximum: 4157)`, exit code 1
- **Baseline:** measured at HEAD `d42d80730` (tip of 41-01's three task commits), which sits on
  top of `aff7ddf75` (`docs(quick-260906-hq8): complete runTs.cjs win32 esbuild spawn fix`) —
  the overage predates all three 41-01 commits
- **Scope check:** `npx eslint meta/__tests__/gamelibCatalogParity.test.ts` (the only source file
  41-01 modified) reports zero warnings/errors. `public/locales/en/gamelib.json` is a JSON data
  file with no ESLint applicability. Neither of 41-01's two changed files contributes to the
  4199 count.
- **Disposition:** out of scope for 41-01 per the executor's scope-boundary rule (only auto-fix
  issues directly caused by the current task's changes). Not fixed. Recorded here so a future
  phase (or the operator) can decide whether to raise the ceiling or burn down the warning count.

## 41-07: pre-existing eslint warning at `meta/lintTranslations.ts:155`

- **Found during:** 41-07 overall verification (step 5: `npx eslint meta/lintTranslations.ts
  meta/__tests__/lintTranslations.test.ts`)
- **Observed:** `155:5  warning  Unsafe return of a value of type `any`
  @typescript-eslint/no-unsafe-return` — 0 errors, 1 warning, exit 0
- **Scope check:** 41-07's diff (`git diff --stat HEAD`) spans only `meta/lintTranslations.ts`
  lines 732-769 (the CLI entry-point guard and its comment) and
  `meta/__tests__/lintTranslations.test.ts`'s R5 block. Line 155 sits inside `readCatalog()`'s
  `JSON.parse(raw)` return, in a function this plan's `<files>` declares in scope but whose body
  this plan did not touch or need to touch.
- **Disposition:** out of scope for 41-07 per the executor's scope-boundary rule (only auto-fix
  issues directly caused by the current task's changes). Not fixed. Recorded here so a future
  phase (or the operator) can decide whether to add a type guard or narrow `JSON.parse`'s return
  type at that call site.
