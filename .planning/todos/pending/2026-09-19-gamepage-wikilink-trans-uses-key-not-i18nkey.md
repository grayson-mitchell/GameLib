---
created: 2026-09-19T00:00:00.000Z
title: "GamePage's wikiLink <Trans> passes key= instead of i18nKey=, so its 31 translated copies are dead"
area: i18n
severity: minor
platform: any
ready: code
found_by: "quick-260919-u23"
files:
  - src/frontend/screens/Game/GamePage/index.tsx
---

## Observed

`GamePage/index.tsx:452` writes:

```tsx
<Trans key="wikiLink" i18n={i18n}>
```

`key` is React's reserved reconciliation prop — `Trans` never sees it in its own props, so there
is no `i18nKey` to look up, and the component falls through to rendering its inline English
`children` in every locale.

Found while fixing the identical defect in `SideloadDialog` (`quick-260919-u23`). Filed separately
rather than bundled, matching `260919-9gu`'s refusal to widen scope mid-task.

## Measured

- The key **does** resolve: `wikiLink` exists in `public/locales/en/gamepage.json` as
  `"Important information about this game, read this:&nbsp;<1>Open page</1>"`.
- **31 non-English locales carry a non-empty translation** of it (counted by parsing every
  `public/locales/*/gamepage.json`, not by grep). All 31 are currently dead.

## Why this one is probably a genuine one-line fix — unlike its sibling

The `SideloadDialog` instance needed a full namespace migration plus a 48-locale fill, because its
translated copies quoted a button name that had since been renamed — resolving them would have
started telling users to click a button that no longer exists. **That does not apply here.** The
`wikiLink` translations are not stale: they describe a link, and the link is still a link.

So flipping the prop should simply light up 31 existing human translations with **no catalog change
at all** — which also means no `i18n-churn-guard` involvement, since nothing under
`public/locales/` needs to be touched.

## Solution

1. Rename `key=` to `i18nKey=` at `GamePage/index.tsx:452`.
2. **Verify the namespace before assuming the bare key is enough.** i18next has no `defaultNS`
   configured, so it defaults to `translation`, while this key lives in `gamepage`. Check what
   `useTranslation(...)` this component actually calls and add an explicit `ns="gamepage"` if the
   resolved default is anything else. Getting this wrong fails silently — English children again,
   with no error.
3. Confirm the child indices still line up: the catalog value uses `<1>`, which must correspond to
   the `<Link>` element among the `<Trans>` children. If a child is added or reordered, all 31
   translations break at once.
4. Do **not** hand-edit `gamepage.json` for any of this. `REQ-34.8-04`'s response to churn there is
   `git checkout -- public/locales/`, never a hand-edit.
5. Verify by rendering under a non-English locale, not by reading the diff — the failure mode of
   this defect is that everything looks correct and renders English.

Related: `.planning/todos/completed/2026-09-16-sideload-import-hint-trans-uses-key-not-i18nkey.md`,
and the third instance filed alongside this one for `DownloadDialog`.
