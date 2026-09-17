---
created: 2026-09-16T00:00:00.000Z
title: "SideloadDialog's import hint <Trans> passes key= instead of i18nKey=, so it never localises and its 47 translated copies are dead"
area: i18n
severity: minor
platform: any
ready: code
found_by: "quick-260916-cdb"
files:
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx
---

## Observed

`SideloadDialog/index.tsx:376`'s `<Trans>` element is written as:

```tsx
<Trans i18n={i18n} key="sideload.import-hint.content">
```

`react-i18next`'s `<Trans>` component resolves its translation via the `i18nKey` prop, not `key`
(`key` is React's own reserved reconciliation prop and is invisible to the component's own props —
`Trans` never sees it). With no `i18nKey`, `Trans` has nothing to look up in any catalog and always
falls through to rendering its own inline English `children` verbatim, in every locale, for every
user, regardless of their selected language.

Found live while relabelling the SideloadDialog hint's quoted button-name text during
`quick-260916-cdb` (rename "Import Game" to "Locate existing installation…", demote the MainButton
door into `GameSubMenu`). That quick deliberately changed ONLY the quoted label text inside this
`<Trans>` block — per its own plan's `<latent_bug_do_not_fix>` instruction — leaving this `key=` vs
`i18nKey=` defect exactly as found. Not fixed there; filed here instead.

## Why this is not a one-line fix

The obvious repair — rename the prop from `key` to `i18nKey` — is a trap. All 47 non-English
translated copies of `sideload.import-hint.content` (in each locale's `translation.json` or
equivalent catalog) still quote the **OLD** "Import Game" label, because they were translated
before this quick's rename and this quick did not touch them (its Task 1/2 scope was `gamelib.json`
only, and this key does not live there). If the prop is fixed in isolation, `Trans` would start
resolving those 47 stale catalog entries — and 47 locales would start telling users to click a
button named "Import Game" that no longer exists anywhere in the app (it was renamed to "Locate
existing installation…" by the same quick that filed this todo). That is strictly worse than the
current dead-but-harmless state, where every locale at least shows the (English, but currently
accurate) inline children.

A correct fix needs both halves together, in one change:
1. `key=` → `i18nKey=` on the `<Trans>` element.
2. A sweep of all 47 translated `sideload.import-hint.content` values to match the new "Locate
   existing installation…" wording, matching the pattern already used for the door label's own
   48-locale hand-translation (see `quick-260916-cdb`'s SUMMARY for that precedent and its
   per-locale ellipsis convention).

## Solution

TBD:
1. Rename `key=` to `i18nKey=` at `SideloadDialog/index.tsx:376`.
2. In the same change, update all 47 non-English `sideload.import-hint.content` translations to
   reference the new door label wording, not the old "Import Game" text — by hand, per-locale,
   matching the conventions established for `installFlows.importDoorLabel`.
3. Re-run whatever gate covers `<Trans>` prop correctness (if any exists) plus a targeted
   i18n-catalog test for this key across all 49 locales, to confirm the fix does not silently ship
   a partial sweep.
