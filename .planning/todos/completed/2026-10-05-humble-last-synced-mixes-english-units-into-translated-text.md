---
created: 2026-10-05T00:00:00.000Z
title: "Humble \"Last synced\" builds English minute/hour/day units and feeds them into translated strings (\"vor 5 minutes\")"
area: i18n
severity: medium
platform: any
ready: code
found_by: "Code-review sweep of phases that never had a review step (07, 23.1, 25, 27, 33, 34.8, 34.12, 34.16, 34.17, 34.18, 36, 44), 2026-10-04 — phase 34.8"
files:
  - src/frontend/screens/Humble/Keys/index.tsx:49-57
  - meta/hardcodedStringGate.ts:268
---

## Problem

Only the `'less than a minute'` branch of `formatRelativeTime` was retrofitted. The minute/hour/day
branches still build English (`` `${minutes} ${... 'minute' : 'minutes'}` ``) and that text is
interpolated into the translated `humbleKeys.lastSynced` and `syncError` strings. The hardcoded-string
gate missed it because `LOWERCASE_TOKEN_RE` (`hardcodedStringGate.ts:268`) exempts single lowercase
tokens — a structural blind spot for unit words.

## Failure scenario

A German user sees "Letzte Synchronisierung vor 5 minutes"; French shows "il y a 5 minutes".

## Suggested fix

Add plural keys (`_one`/`_other` for minutes, hours, days with `{{count}}`), or use
`Intl.RelativeTimeFormat` with `i18n.language`. Consider whether the gate's blind spot needs its own
todo.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Confirmed.** `formatRelativeTime` in `Humble/Keys/index.tsx` built `5 minutes` / `3 hours` /
`4 days` from English literals and the result was interpolated as `{{time}}` into the translated
`humbleKeys.lastSynced` ("Letzte Synchronisierung vor {{time}}") and `syncError` strings.

**What changed.**

- The helper moved, first unchanged, into a leaf module `Humble/Keys/syncAge.ts` as
  `formatSyncAge(ms, t, language)` (so it can be tested without the screen's CSS imports), and the
  screen passes `i18n.language` from its existing `useTranslation('gamelib')` call.
- The minute/hour/day branches now use `Intl.NumberFormat(lang, { style: 'unit', unit,
  unitDisplay: 'long' })`, which yields the BARE localized duration ("5 Minuten", "3 heures",
  "4 dias"). `Intl.RelativeTimeFormat` was considered first, as preferred, and rejected:
  it emits its own "ago"/"vor"/"il y a" wrapper, which every catalogue already supplies around
  `{{time}}` — it would have printed "Last synced 5 minutes ago ago". No catalogue change was
  needed, so no plural keys were added.
- `i18n.language` is a shipped directory code (`pt_BR`, `zh_Hant`); it goes through the existing
  `toI18nextCode` (underscore → dash) and an unusable tag falls back to `en` instead of throwing.
- `less than a minute` keeps its existing `humble.lessThanAMinute` key.

**RED.** With the helper extracted unchanged, `__tests__/syncAge.test.ts` failed 2 of 4:
`Expected: "5 Minuten"  Received: "5 minutes"` and `Expected: "4 dias"  Received: "4 days"`.
After the fix, a product-code mutation (restoring English unit words inside `formatUnit`) turns
3 tests red, including the new screen-level test in `__tests__/index.test.tsx` that mounts the
Keys screen with `i18n.language = 'de'` and asserts the indicator text contains `5 Minuten` and no
`minute(s)`.

**GREEN.** `src/frontend/screens/Humble/Keys` 5 suites / 214 tests; `pnpm codecheck` clean;
eslint on touched files 0 errors (1 pre-existing `exhaustive-deps` warning at `index.tsx:241`);
prettier clean; `pnpm i18n` makes no catalogue change.

**Not verified / left alone.**

- No live run in a non-English UI. `Intl.NumberFormat` unit style needs WebKit 14.1+/Chromium
  77+; all three shell webviews are newer, but this was not observed live.
- Grammatical case: the unit comes out in the form ICU uses after a number (nominative/genitive
  count form), which reads correctly after "vor"/"il y a"/"sitten" in the languages checked; a
  language needing a different case inside its sentence would need translator-facing plural keys.
- `components/UI/Header/index.tsx:60-71` has its own English-only `formatRelativeTime`
  (`"5 minutes ago"`), the one this helper's old comment said it mirrored. Out of this todo's
  scope; not touched.
- The hardcoded-string gate's `LOWERCASE_TOKEN_RE` blind spot for unit words is unchanged.
