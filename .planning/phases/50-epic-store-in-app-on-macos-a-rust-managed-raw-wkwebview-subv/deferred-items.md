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
