---
created: 2026-10-05T00:00:00.000Z
title: "Sidecar i18n loadPath joins the language code into a filesystem path unchecked — the i18next-fs-backend traversal fix does not cover a function loadPath"
area: security
severity: minor
platform: any
ready: code
found_by: "Dependency-advisory fix (2026-10-05), while upgrading i18next-fs-backend to 2.6.8"
files:
  - src/backend/sidecar/bootstrap.ts:1025-1031
  - src/common/languages.ts:106-112
---

## Problem

`loadPath` in the sidecar's i18next init is a function that builds
`join(publicDir, 'locales', toShippedLanguage(language), `${namespace}.json`)`.
`toShippedLanguage` passes any unrecognised code through unchanged. The path-traversal check
i18next-fs-backend added in 2.6.4 only sanitises the `{{lng}}` / `{{ns}}` placeholder form, so it
does not apply to a function `loadPath`; upgrading the dependency (done 2026-10-05) fixed the
prototype-pollution advisories but not this.

Today the only thing keeping `language` to known values is i18next's `supportedLngs` filtering
(set via `i18nextLanguageOptions`), so this is defence in depth rather than a live hole.

## Failure scenario

If `supportedLngs` filtering is ever bypassed or loosened (a config change, `nonExplicitSupportedLngs`,
an i18next behaviour change), a renderer-settable language such as `../../x` makes the sidecar read
`<publicDir>/locales/../../x/<ns>.json`.

## Suggested fix

In `loadPath`, only accept a language whose shipped name is in `supportedLanguages` (or matches
`^[A-Za-z]{2,3}([_-][A-Za-z0-9]+)*$`) and fall back to `en` otherwise; same check for `namespace`
against the known namespace list. Unit-test with a traversal-shaped code.

## Resolution (2026-10-05)

Added `localeFileSegments(language, namespace)` to `src/common/languages.ts` and used it in the
sidecar's `loadPath` (`src/backend/sidecar/bootstrap.ts`). An unsupported or traversal-shaped
language falls back to `en`; a namespace that is not a bare identifier falls back to
`translation`, so neither can put a separator or `..` into the path.

- **RED:** on the old code `toShippedLanguage('../../etc')` returned `'../../etc'` unchanged,
  which `loadPath` joined straight into the path.
- **GREEN:** new `src/common/__tests__/localeFileSegments.test.ts` (traversal language, unknown
  language, `cimode`, traversal namespace, and the `pt-BR` → `pt_BR` mapping) passes with
  `languages.realI18next` and `gamelibNamespaceLoad` (28/28). `pnpm codecheck`, eslint (0
  errors), prettier, and `find-deadcode` pass.
- **Not verified:** no live sidecar run. `appShellFlows`'s detectVCRedist/initQueue test fails
  with or without this change (filed separately as a flaky test).
