---
created: 2026-11-21T03:50:00.000Z
title: "Report a translation problem" should open GameLib's in-app issue form, not GitHub
area: ui
severity: minor
platform: any
ready: human
files:
  - src/frontend/components/UI/LanguageSelector/index.tsx
  - src/frontend/components/UI/LanguageSelector/translationIssue.ts
  - src/frontend/screens/Settings/sections/ReportProblem/index.tsx
---

## Problem

In a non-English language, Settings → General → Language shows the machine-translation notice. Its
"Report a translation problem" link (`LanguageSelector/index.tsx:183-199`) calls
`openExternalUrl(buildTranslationIssueUrl(...))`, which opens a GitHub new-issue URL
(`GAMELIB_ISSUES_NEW_URL`, `translationIssue.ts:17`). A signed-out user lands on GitHub's sign-in page.

The operator observed this during the Phase 83 live gate (83-11, item 3, 2026-11-21) and said: "that
report a problem should probably go to the issue form we have created, only a small % of users will
know what github is".

## Solution direction

Route the link to the existing in-app report flow (Settings → Report a Problem,
`screens/Settings/sections/ReportProblem`), prefilled with the language code and label that
`buildTranslationIssueUrl` currently puts in the query string. Whether to keep GitHub as a secondary
option is a design call, so this todo is `ready: human`. Note: the Phase 83 gate used this link as its
`openExternalUrl` test subject. If the link stops calling `openExternalUrl`, any later live gate
exercising that channel needs a different subject.

## Resolution

Resolved 2026-11-21 by quick task 261121-vlo (commits 6453ac05f, c72bb25cd, 4d85125c5).

- Design call: the orchestrator relayed the operator's choice to drop GitHub for this link entirely, with no
  secondary option ("only a small % of users will know what github is").
- The link now navigates in-app to Settings > Report a problem (`/settings/report`) with the "What happened?" box
  prefilled as `[Translation] <label> (<code>): `. The language code and label travel as router state
  (`reportMessage`), the same mechanism the game page's link uses for `reportGame`. ReportProblem reads it as
  `unknown` and uses it only when it is a string. The GitHub URL builder and its constants are deleted.
- The Phase 83 live gate's test subject for the external-URL IPC channel (this link) is gone, so a later live gate
  exercising that channel needs a different subject. Candidates measured at planning: the CrossOver link in
  `src/frontend/components/UI/WelcomeModal/index.tsx` and in
  `src/frontend/screens/Game/GamePage/components/EngineNotices.tsx`, and the NativePortInfo entry link.
- `.github/ISSUE_TEMPLATE/translation_problem.yaml` is left in place for people who file directly on GitHub.
  Nothing in the app links to it any more.
