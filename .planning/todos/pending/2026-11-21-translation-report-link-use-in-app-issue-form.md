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
