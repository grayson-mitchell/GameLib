# Phase 49 deferred items

Out-of-scope discoveries logged during execution; not fixed by the plan that found them.

## Found during 49-09

1. `meta/__tests__/hardcodedStringGate.test.ts` > "scans the whole committed scope and finds zero violations outside the allowlist" fails with one violation: `src/frontend/index.tsx:88:46` (`'(inline)'` argument in the CSP `securitypolicyviolation` listener, added by `e4c943461 fix(48): IN-10`). Pre-existing and unrelated to Phase 49's files.
2. `pnpm lint-translations:gamelib` reports 720 findings (missing translations in non-en locales, e.g. `tour.*`, `wineExplanation.*`). None concern the Phase 49 keys. Also the pnpm script starts with `export`, which fails under the Windows pnpm shell; running `LINT_TRANSLATIONS_NAMESPACES=gamelib node meta/runTs.cjs --bundle --platform=node --target=node21 meta/lintTranslations.ts` from bash works.
