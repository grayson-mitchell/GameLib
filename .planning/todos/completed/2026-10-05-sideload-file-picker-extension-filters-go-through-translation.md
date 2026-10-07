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

## Resolution (2026-10-05)

**Confirmed, and already live — not hypothetical.** The machine fill had reached the two keys
in many locales before this fix: `pl` `appExtension: "Aplikacja"`, `gl` `"Aplicación"`, `fi`
`"Sovellus"`, among others. In those locales the macOS sideload picker was filtering `*.Aplikacja`
etc. and hiding every `.app` bundle.

**What changed.**

- `SideloadDialog/filters.ts`: the two extension matchers are literals again (`'AppImage'`,
  `'App'` — the exact English values the picker received before, so en behaviour is
  byte-identical). They live in one top-level `PICKER_EXTENSIONS` statement carrying an
  `i18n-gate-exempt:` declaration-level marker with its reason: without it the hardcoded-string
  gate flags both capitalized literals (measured — the whole-scope test reported exactly
  `filters.ts` `AppImage` and `App` before the marker was added). The lowercase extensions
  (`sh`, `jpg`, …) were already exempt by shape.
- `sideload.filter.appExtension` / `appImageExtension` removed from all 49
  `public/locales/*/gamelib.json` and from the 48 `gamelib.mt.json` manifests that listed them
  (`gamelibCatalogParity`'s "lists only keys that still exist" requires the latter). `pnpm i18n`
  afterwards makes no further change (`keepRemoved: true`, so removal had to be by hand).
- The test that pinned the bug (`routes every name and every stringly-typed extension through t`)
  now asserts names only, and a new test asserts that under a `t` returning `SENTINEL` for
  everything, no extension (file or image filters) is `SENTINEL`, and linux/osx are exactly
  `['AppImage']` / `['App']`.

**RED.** The new test failed on the unfixed code: `Expected value: not "SENTINEL"`,
`Received array: ["SENTINEL"]` (1 failed, 13 passed).

**GREEN.** `SideloadDialog/__tests__/index.test.tsx` 14/14; `gamelibCatalogParity.test.ts` green;
`hardcodedStringGate.test.ts -t "scans the whole committed scope"` green; `pnpm codecheck`,
eslint and prettier on the touched TS files clean.

**Not verified.** No live picker run on macOS or Linux. The todo suggested lowercasing to
`'app'`; that was deliberately not done — it would change what the native picker receives on
macOS and cannot be checked here.
