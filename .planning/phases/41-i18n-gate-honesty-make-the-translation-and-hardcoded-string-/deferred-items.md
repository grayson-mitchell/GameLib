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
