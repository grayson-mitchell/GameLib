---
phase: quick-260925-bq4
plan: 01
status: complete
subsystem: i18n
metrics:
  completed: 2026-09-24
---

# Quick 260925-bq4 Summary

Four shipped languages — `nb_NO`, `pt_BR`, `zh_Hans`, `zh_Hant` — rendered **every counted
string in English**. Not a degraded plural: the actual English text. Fixed by converting the
language code to BCP-47 at each i18next boundary and back again where `i18n.language` flows out.

## What the evidence showed

`Intl.PluralRules('nb_NO')` throws `RangeError: Invalid language tag`. i18next 22.5.1 passes the
code in raw and swallows the throw (`catch (_unused) { return; }`); the `getCleanedCode`
normaliser that would handle `_` only exists from v23. No rule -> `getSuffix` returns `''` ->
lookup is the **unsuffixed** key -> present in no catalog (only `_one`/`_other` are) -> `resolve()`
walks to `fallbackLng: 'en'`, recomputes the suffix *for `en`*, and hits.

`t('gamelib:humbleKeys.cooldown', { count: 5 })`, measured against real i18next and the real
catalogs, before and after:

| `lng`     | rule | suffix   | before                              | after                               |
| --------- | ---- | -------- | ----------------------------------- | ----------------------------------- |
| `en`      | yes  | `_other` | ...retry in 5 minutes               | unchanged                           |
| `nl`      | yes  | `_other` | ...probeer opnieuw over 5 minuten   | unchanged                           |
| `pt`      | yes  | `_other` | ...tente novamente em 5 minutos     | unchanged                           |
| `nb_NO`   | no   | `""`     | **English**                         | ...prøv igjen om 5 minutter         |
| `pt_BR`   | no   | `""`     | **English**                         | ...tente novamente em 5 minutos     |
| `zh_Hans` | no   | `""`     | **English**                         | 暂时不可用 — 请在 5 分钟后重试      |
| `zh_Hant` | no   | `""`     | **English**                         | 暫時無法使用 — 請於 5 分鐘後重試    |

Introduced by `ddd2b8ed0` (machine-fill emitting CLDR plural forms) — 8 plural key families x 4
locales, growing with every new plural key.

## Approach

Locale **directory names stay** (`public/locales/nb_NO`). They are the on-disk layout in two
trees, the persisted `configStore` value, the keys of `languageLabels`/`languageFlags`, and four
`meta/` tools walk them; renaming needs a config migration and is strictly worse for existing
users until it runs. Instead `src/common/languages.ts` gained `toI18nextCode` (in),
`toShippedLanguage` (out), `supportedLanguageTags`, and `i18nextLanguageOptions()` — which returns
`lng` and `supportedLngs` **together**, so the two init sites cannot drift on either half.

## Three things the work turned up that the plan had wrong

1. **`supportedLngs` had to be converted too, or the fix would have been worse than the bug.**
   A BCP-47 `lng` against the underscore `supportedLngs` list makes `toResolveHierarchy('nb-NO')`
   return `["en"]` — the locale is filtered out entirely and *everything* goes English, not just
   plurals. The handoff also claimed the renderer had no `supportedLngs`; it does, at
   `src/frontend/index.tsx:172`, and it is load-bearing.

2. **Init alone was not enough — the scope was four in-bound sites, not two.** Both
   `changeLanguage` paths (`LanguageSelector/index.tsx`, `appshell/language.ts`) would have
   re-broken plural resolution on a runtime language switch. Two out-bound sites also needed
   converting back, because `i18n.language` reaches persisted/UI surfaces keyed by the shipped
   code.

3. **`getLocaleSettings` would have silently changed people's currency.**
   `COUNTRY_CURRENCY_MAP` is keyed by the shipped code and falls back to the bare language part,
   so a `pt-BR` lookup misses and lands on `pt`: Brazil would have flipped **BR/BRL -> PT/EUR**,
   Norway **NO/NOK -> US/USD**. No error, just wrong prices. Caught by reading the map, not by any
   test — now pinned by `localeSettingsLanguageForm.test.ts` with a negative control.

## Two self-inflicted faults, both caught and both now pinned

- **The first version of the regression test passed vacuously.** `humbleKeys.cooldown` lives in
  the `gamelib` namespace while both inits use `defaultNS: 'translation'`, so *every* instance
  returned a bare key — and the negative control's "locale === English" assertion was satisfied by
  two identical bare keys. Fixed by namespacing the key and requiring the English instance to
  produce real text (`ENGLISH_FRAGMENT`) before any comparison against it counts.
- **`toI18nextCode(undefined)` threw and aborted the sidecar's entire i18next init.**
  `GlobalConfig`'s `language` is typed `string` but is absent in a fresh config; it previously
  reached i18next as `lng: undefined`, meaning "use fallbackLng". The throw happened inside the
  init's try block, so `t()` returned undefined for every backend string. Surfaced three layers
  away as a `null` dialog title in `shellFilesFlows.test.ts`. The helpers are now nullish-tolerant
  by overload, with a test pinning it.

## Incidental fixes

- `<html lang>` no longer emits the invalid `lang="pt_BR"`.
- `WebView/index.tsx` builds the Epic store URL from `i18n.language`; a `pt_BR` user was getting
  `epicgames.com/store/pt_BR/`. It is now `pt-BR` without that file being touched.
- The dead `addPath` in the sidecar init was removed rather than repointed — nothing sets
  `saveMissing`, and after this change it would have named a directory that does not exist. Same
  reasoning quick-260901-b8z used when removing the renderer's copy.
- `Discounts/index.tsx:599`'s `i18n.language.replace('_', '-')` is now a no-op. **Left in place**
  deliberately — it is defensive, `localeCompare` throws on an invalid tag, and removing it would
  widen this diff into an unrelated screen.

## Verification

- `pnpm codecheck`: exit 0.
- `npx jest --selectProjects Common Frontend Backend`: **8065 passed**, 3 skipped, 400 suites,
  exit 0. Preload + meta projects: exit 0.
- `pnpm lint`: exit 0, 0 errors; both ceilings PASS.
- `pnpm lint-translations`: 0 hard failures.
- `pnpm planning-gates`: 13/13.
- `npx prettier --check` over the 10 exact paths written: clean.
- End-to-end probe re-run through the shipped mapping: all four locales localised (table above).

**Honest caveat:** the new suites were not run RED against the pre-fix source in the conventional
order — the defect was measured first with a standalone probe, and the source fix landed before
the tests were finalised. The durable substitute is the **negative control** kept permanently in
both new files (the precedent in `chipLabels.realI18next.test.ts`): each asserts that the *old*
configuration produces the broken result, so the assertions are proven to distinguish the two
rather than passing unconditionally. Two of them did fail for real during the work — see the
self-inflicted faults above.

**Not verified live.** No app run. The renderer half rests on `i18next-http-backend`'s array
`loadPath` signature being exercised only in type and by inspection of its source (`:89-90`); the
sidecar half's scalar signature is exercised for real by the Backend suite.

## Filed, not fixed

`.planning/todos/pending/2026-09-24-zh-hans-hant-carry-unreachable-one-plural-keys.md` —
`zh_Hans`/`zh_Hant` carry `_one` keys that CLDR can never select (Chinese has only `other`). Dead
weight now that resolution works, and `machine-fill` will re-emit them unless its own plural-form
call site is fixed too. `minor` / `any` / `code`.
