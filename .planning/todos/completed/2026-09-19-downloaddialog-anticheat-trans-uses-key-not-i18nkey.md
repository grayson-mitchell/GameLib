---
created: 2026-09-19T00:00:00.000Z
completed: 2026-09-20T00:00:00.000Z
title: "DownloadDialog's anticheat-warning <Trans> passes key= instead of i18nKey=, so its 35 translated copies are dead"
area: i18n
severity: minor
platform: any
ready: code
found_by: "quick-260919-u23"
resolved_by: "quick-260921-jfk"
files:
  - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
---

## Observed

`DownloadDialog/index.tsx:229` writes:

```tsx
<Trans
  key="install.anticheat-warning.disabled_installation"
  i18n={i18n}
>
```

`key` is React's reserved reconciliation prop — `Trans` never sees it, so there is no `i18nKey` to
resolve and the inline English `children` render in every locale.

Found while fixing the identical defect in `SideloadDialog` (`quick-260919-u23`). Filed separately
rather than bundled.

## Measured

- The key **does** resolve: `install.anticheat-warning.disabled_installation` exists in
  `public/locales/en/gamepage.json`.
- **35 non-English locales carry a non-empty translation** of it (counted by parsing every
  `public/locales/*/gamepage.json`). All 35 are currently dead.

This is the widest-reaching of the three instances by translation count, and the copy matters: it
tells the user that multiplayer will not work and that nothing can be done about it. Showing that
in English to a user who has selected another language is the whole cost of the defect.

## Why this is probably a genuine one-line fix — unlike its sibling

The `SideloadDialog` instance required a namespace migration and a 48-locale fill because its
translations quoted a since-renamed button. **No such staleness applies here** — this string
describes anticheat behaviour, which has not changed. Flipping the prop should light up 35 existing
human translations with **no catalog change**, and therefore no `i18n-churn-guard` involvement.

## Solution

1. Rename `key=` to `i18nKey=` at `DownloadDialog/index.tsx:229`.
2. **Verify the namespace.** i18next has no `defaultNS`, so it falls back to `translation`, while
   this key lives in `gamepage`. Add an explicit `ns="gamepage"` unless the component's own
   `useTranslation(...)` already resolves there. A wrong namespace fails silently — English
   children, no error.
3. ~~Check child-index parity between the catalog value's numbered tags and the `<Trans>`
   children~~ — **corrected at resolution, this hedge did not apply.** Measured across all 36
   non-empty locale values: every one is a single string containing literal `<br /><br />`, which
   react-i18next preserves via its default `transKeepBasicHtmlNodesFor` (`['br','strong','i','p']`)
   without any numbered `<0/>`-style tag. There is nothing indexed to disturb, so no parity check
   was needed. This step is left struck through, not deleted, so the correction is visible.
4. Do **not** hand-edit `gamepage.json`. `REQ-34.8-04`'s response to churn there is
   `git checkout -- public/locales/`, never a hand-edit.
5. Verify against a real i18next engine and the real catalog, not by reading the diff or rendering
   the dialog by eye. `ns="gamelib"` and `ns="gamepage"` produce byte-identical-looking diffs and
   the wrong one still renders English with no error, no warning, and no type failure.

Related: `.planning/todos/completed/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md`,
and the `GamePage` wikilink instance, which stays open under its own todo (see Resolution below).

## Resolution (`quick-260921-jfk`)

1. `DownloadDialog/index.tsx:228-231`'s `<Trans>` now passes `i18nKey="install.anticheat-warning.disabled_installation"` and an explicit `ns="gamepage"` in place of the reserved `key=` prop, with an explanatory comment mirroring the one at `SideloadDialog/index.tsx:376-383`. No catalog edit was needed or made — `git status --porcelain public/locales/` stayed empty throughout, confirming the "genuine one-line fix" prediction above held.
2. A new test, `DownloadDialog/__tests__/anticheatWarningTrans.realI18next.test.ts`, reads the `(i18nKey, ns)` pair straight out of the production source and renders it through a fresh, real `i18next.createInstance()` against the real `public/locales/de/gamepage.json` catalog — closing this todo's own point that a diff review cannot distinguish a fixed instance from a broken one.
3. Two negative controls were run by hand and observed RED before being restored: reverting `i18nKey` to `key` reproduced the extractor's "no i18nKey attribute found" failure; changing `ns="gamepage"` to `ns="gamelib"` reproduced the sentinel (English-fallback) failure. Both prove the test actually discriminates the defect shapes this todo describes, not just that it passes once.

## Not fixed here

The sibling `GamePage` wikilink `<Trans>` instance has the identical defect shape but is a
separate, untouched todo:
`.planning/todos/pending/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md`. Nothing in
this resolution touches that file or that todo.
