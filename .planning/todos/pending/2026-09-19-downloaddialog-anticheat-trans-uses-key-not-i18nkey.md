---
created: 2026-09-19T00:00:00.000Z
title: "DownloadDialog's anticheat-warning <Trans> passes key= instead of i18nKey=, so its 35 translated copies are dead"
area: i18n
severity: minor
platform: any
ready: code
found_by: "quick-260919-u23"
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
3. Check child-index parity between the catalog value's numbered tags and the `<Trans>` children
   (this block contains multiple `<br />` elements, so the indices are easier to disturb here than
   in the other two instances). A mismatch breaks all 35 translations simultaneously.
4. Do **not** hand-edit `gamepage.json`. `REQ-34.8-04`'s response to churn there is
   `git checkout -- public/locales/`, never a hand-edit.
5. Verify by rendering the dialog under a non-English locale. Reading the diff cannot distinguish a
   fixed instance from a broken one.

Related: `.planning/todos/completed/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md`,
and the `GamePage` instance filed alongside this one.
