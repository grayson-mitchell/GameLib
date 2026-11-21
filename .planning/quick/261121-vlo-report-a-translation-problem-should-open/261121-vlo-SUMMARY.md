---
phase: quick-261121-vlo
plan: 01
subsystem: frontend-settings
tags: [i18n, report-problem, language-selector, react-router]
requires: []
provides:
  - "Language picker 'Report a translation problem' opens Settings > Report a problem, prefilled"
affects:
  - src/frontend/components/UI/LanguageSelector
  - src/frontend/screens/Settings/sections/ReportProblem
key-files:
  created:
    - src/frontend/components/UI/LanguageSelector/__tests__/reportLinkWiring.test.ts
  modified:
    - src/frontend/components/UI/LanguageSelector/translationIssue.ts
    - src/frontend/components/UI/LanguageSelector/index.tsx
    - src/frontend/components/UI/LanguageSelector/__tests__/translationIssue.test.ts
    - src/frontend/screens/Settings/sections/ReportProblem/index.tsx
    - src/frontend/screens/Settings/sections/ReportProblem/__tests__/ReportProblem.test.tsx
decisions:
  - "Drop GitHub for the translation report link entirely (operator choice relayed by orchestrator)"
  - "Prefill alone enables Send (canSend rule unchanged)"
metrics:
  completed: 2026-11-21
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 4
plan_head_before: 4ae914609f731c94074139db4391d79a43ef5b89
plan_head_after: 8c4a9b66f
---

# Phase quick-261121-vlo Plan 01: Translation report link opens the in-app form Summary

The language picker's "Report a translation problem" link now navigates to Settings > Report a problem with the "What happened?" box prefilled as `[Translation] <label> (<code>): `, instead of opening a GitHub new-issue page.

## What changed

- `translationIssue.ts`: the GitHub URL builder and its two constants are gone. `shouldShowMtNotice` is unchanged. New `buildTranslationReportMessage(code, label)` and `reportTranslationProblem(navigate, code, label)`, which calls `navigate('/settings/report', { state: { reportMessage } })`. The navigate parameter type is module-private.
- `LanguageSelector/index.tsx`: uses `useNavigate()`; the handler is now `reportTranslationProblem(navigate, currentLanguage, label)`. The `window.api.openExternalUrl` call is deleted. The anchor and its Enter/Space keyboard path are untouched.
- `ReportProblem/index.tsx`: reads `location.state.reportMessage` as `unknown` and seeds the message textarea only when it is a string (same guard shape as `reportGame`). `useLocation()` moved above the message `useState`.
- Tests: new unit cases for the two helpers, four ReportProblem route-state cases, a contract test (real helper's navigate state fed to ReportProblem, then typed and submitted), and `reportLinkWiring.test.ts` (comment-stripped source scan with SANITY non-vacuity cases and route reachability).
- Todo `2026-11-21-translation-report-link-use-in-app-issue-form.md` moved to `.planning/todos/completed/` with frontmatter unchanged and a Resolution section.

## Notes required by the plan

- The Phase 83 live gate's external-URL test subject (this link) is gone. Candidate replacements are listed in the todo's Resolution: the CrossOver link in `WelcomeModal/index.tsx` and `GamePage/components/EngineNotices.tsx`, and the NativePortInfo entry link.
- `canSend` discretion: the prefill alone enables Send. The existing non-whitespace rule is unchanged, since a report naming only the language still identifies it.
- `.github/ISSUE_TEMPLATE/translation_problem.yaml` was left in place for people who file directly on GitHub. Nothing in the app links to it any more.
- No i18n key or i18n gate artifact changed. No new user-facing literal was added to the scanned `ReportProblem/index.tsx`.

## Verification

- jest (translationIssue, ReportProblem, reportLinkWiring): all pass. `pnpm codecheck`, `pnpm find-deadcode` (312 baselined, PASS), `pnpm lint` (production 949, tests 628, both PASS), `pnpm planning-gates` (12/12) green.
- `backend-di-ceilings`: still red for the three unrelated src/backend steam tests (as at HEAD); no output line names LanguageSelector or ReportProblem. No jest.mock call added or removed.
- Scoped eslint over the five Task 1 files: 10 warnings, all pre-existing in kind (including a `no-floating-promises` on `i18n.changeLanguage` in `LanguageSelector/index.tsx`); the new tests add none.
- `meta/__tests__/hardcodedStringGate.test.ts`: 178 of 178 pass.

## Deviations from Plan

**1. [Rule 1 - Bug] Contract test used an untyped mock read** — the first draft read `mockSubmit.mock.calls[0][0]`, adding an `no-unsafe-member-access` warning (scoped eslint hit 11 against a 10 ceiling). Rewrote the assertion as `toHaveBeenCalledWith(expect.objectContaining(...))`. Also guarded `navigate.mock.calls[0]` for `noUncheckedIndexedAccess`.

**2. Jest case count baseline** — the plan's `>25` expectation did not hold (24 across the two suites). The plan itself has the nine URL-builder cases replaced by four new helper cases, so the count falls by design. The new `reportLinkWiring.test.ts` adds 9 more.

**3. Commit count** — `git rev-list` over the ledger range shows 7 because the Phase 100 session committed three of its own commits in the same window. This plan's own commits are four: `6453ac05f` (RED), `c72bb25cd` (GREEN), `4d85125c5` (wiring test), `8c4a9b66f` (todo close). `commits: 4` and `plan_head_after` reflect those.

**4. Task 2 todo-move commit** — the first attempt staged only the rename (a pathspec for the vanished pending path aborted `git add`), so the Resolution text was added by amending that unpushed commit; its content is one commit, `8c4a9b66f`.

## Self-Check: PASSED

All five modified files, the new test and the moved todo exist; the four commits are ancestors of HEAD.
