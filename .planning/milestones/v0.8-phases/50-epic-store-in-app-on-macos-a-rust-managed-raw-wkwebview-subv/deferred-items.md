# Deferred Items — Phase 50

Pre-existing failures observed during plan-wide verification that are out of scope for the
plan currently executing (Scope Boundary rule — only auto-fix issues directly caused by the
current task's changes).

## 50-05: `pnpm test:ci` full-suite run

Observed 2 failing tests in `meta/__tests__/lintTranslations.test.ts` during the Plan 05
wave-level `pnpm test:ci` run:

- `lintTranslations (REQ-41-02) › live tree › REQ-41-02: zero hard failures gamelib namespace against committed tree`
- `comparePresenceBaseline (REQ-41-01) › REQ-41-01 R13: zero drift between live tree committed baseline`

Both are locale/translation-presence gates in `meta/`, unrelated to this plan's files
(`src/frontend/screens/WebView/*`, `src/common/signInState.ts`,
`src/frontend/helpers/signInInputs.ts`). No locale/translation file was touched by Plan 05.
Not fixed here — logged for triage outside this plan's scope.

**CLOSED 2026-10-13 — both pass; no action needed.** Re-measured on `8d32de558` with a full,
unfiltered `pnpm test:ci`: **547 suites passed / 547 total, 11894 tests passed, 3 skipped, 0
failed**, `meta/__tests__/lintTranslations.test.ts` among them. The fix came in from another
session as `5b42b643e` ("i18n: regenerate the catalogue presence baseline for library.tileSize
keys") — both failures were baseline drift from the 48-locale `library.tileSize` fill
(`933c7ac3d`), not a defect in either gate. Corroborated by `pnpm i18n` reporting `Added keys: 0`
/ `Restored keys: 0` across all four namespaces and `pnpm i18n-churn-guard` reporting clean on the
same tree.
  status: acknowledged
