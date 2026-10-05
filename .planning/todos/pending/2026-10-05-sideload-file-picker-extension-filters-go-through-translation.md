---
created: 2026-10-05T00:00:00.000Z
title: "Sideload file-picker extension matchers (AppImage, app) are translatable strings — a translated locale hides every .app bundle or AppImage"
area: i18n
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.8"
files:
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/filters.ts:57-59
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/filters.ts:72
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/__tests__/index.test.tsx:93-108
  - public/locales/en/gamelib.json
---

## Problem

The 34.8 retrofit turned the native picker's `extensions` matchers into `t()` calls
(`sideload.filter.appExtension`, `appImageExtension`). They are ordinary catalogue entries, not in
`meta/i18nGlossary.json`; `fr` already translates the sibling `apps` → "Applications". The test at
`index.test.tsx:93-108` asserts the extensions go through `t` (the SENTINEL check), pinning the bug as
intended behaviour.

## Failure scenario

When `machine-fill-gamelib` or a translator fills the other 46 locales, a value like
`es: "Aplicación"` makes the macOS picker filter `*.Aplicación`, hiding every `.app`; the same for
AppImages on Linux. `de` and `fr` happen to keep them literal today.

## Suggested fix

Put the extensions back as literals (`['AppImage']`, `['app']`), delete the two keys from all three
`gamelib.json` files, and flip the sentinel assertion to require the extensions stay untranslated.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
