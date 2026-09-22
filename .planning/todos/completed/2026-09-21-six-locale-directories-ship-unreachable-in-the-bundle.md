---
created: 2026-09-21T00:00:00.000Z
title: "Six locale directories ship into the app bundle while being unreachable, and four are mostly empty"
area: i18n
severity: minor
platform: any
ready: human
found_by: "quick-260922-9j0"
files:
  - public/locales/br
  - public/locales/da
  - public/locales/ka
  - public/locales/sl
  - public/locales/th
  - public/locales/uz
---

## Observed / Measured

Measured during `quick-260922-9j0` by brace-matched parse of every language list in the repo (not
by grep -- the naive `[A-Za-z_]+:` parse returns 0 keys here because the type annotation
`{ [key: string]: string }` breaks a split on `}`):

```
src/frontend/index.tsx          supportedLngs        43
src/common/languages.ts         supportedLanguages   43
LanguageSelector/index.tsx      languageLabels       43
LanguageSelector/index.tsx      languageFlags        43
public/locales/ directories     49

dirs present but in NO list: br, da, ka, sl, th, uz
```

These six are unreachable: not offered in the selector, no `languageDetector` is registered
(`index.tsx:148-152` `.use()`s only `Backend` and `initReactI18next`), and `supportedLngs` resolves
an excluded code to `["en"]` -- verified against the repo's installed i18next, hierarchy `["en"]`,
`isSupportedCode('br') === false`.

They are nonetheless shipped. `src-tauri/tauri.conf.json:42` maps `../build/locales/` into the
bundle wholesale, so all six ride along:

```
br 44K   da 124K   ka 112K   sl 44K   th 108K   uz 100K   = 532K
(public/locales total: 6.2M)
```

And four of them are substantially unfilled, so adopting them is not a matter of flipping a switch
(`translation.json`, flattened, against `en`'s 901 keys):

```
        keys   empty
da       892     100
ka       812     657
th       810     749
uz       841     395
br    no translation.json
sl    no translation.json
(de, for scale: 883 keys, 0 empty)
```

## Why this is filed rather than fixed

The two candidate fixes point in opposite directions and neither is obviously right:

- **Delete the six directories.** But they arrive from upstream Heroic's Weblate sync (`[i18n]
  Updated Translations` #5098, #5583), which creates a directory as soon as a translator starts a
  language. A delete is undone by the next sync unless a sync-side exclusion exists, so this is
  not a stable fix from inside the repo.
- **Adopt them into the 43-list.** `da` is plausibly close (100 empty of 892); `ka`, `th` and `uz`
  are not (657, 749, 395 empty), and `br`/`sl` have no upstream catalogs at all.

The blocker is therefore a real external question -- **what the Weblate sync policy is, and whether
a partially-filled locale should be offered** -- not a coding step someone has failed to take. The
cost of doing nothing is 532K of dead bundle weight and nothing else; no user-visible defect
exists, because the locales are never resolved.

**What would settle it:** confirmation of whether this fork still consumes upstream Weblate syncs
at all (`origin` is the fork, and `HEROIC IS NOT UPSTREAM` is recorded convention). If it does not,
deletion is stable and this becomes `ready: code`.

## Resolution (quick task 260922-hjb, 2026-09-22)

The 532K figure above was an undercount: it measured only `public/locales`, i.e. one shipped
copy. The six unreachable directories actually ship **twice** -- once via
`src-tauri/tauri.conf.json`'s wholesale `../build/locales/` resource mapping into `build/locales`,
and again via `build/renderer/locales` under `frontendDist` (assembled by
`meta/assembleRendererDist.ts`'s `STATIC_RENDERER_DIRS` copy). Both trees were measured at 49
directories before this fix; the real shipped weight is ~1000K across the two trees, not 532K
across one.

The Weblate sync policy question this todo blocked on -- whether the fork still consumes upstream
syncs, and whether a partially-filled locale should be offered -- is **not** answered by this fix
and remains genuinely open. It is now moot for the specific defect this todo tracks, though:
`meta/pruneUnofferedLocalesPlugin()` (wired into `vite.config.ts`, `closeBundle`, ahead of
`assembleRendererDistPlugin` on the normal enforce tier) prunes both `build/locales` and
`build/renderer/locales` down to exactly the 43 codes in `src/common/languages.ts`'s
`supportedLanguages` on every build, regardless of what upstream sync does to `public/locales`.
`public/locales` itself is deliberately left untouched -- still 49 directories, no diff -- so a
sync-driven regrowth there no longer costs any shipped bundle weight; a newly-added unreachable
locale is pruned automatically and turns `meta/__tests__/pruneUnofferedLocales.test.ts`'s live-pin
test red instead of shipping silently.

If the Weblate policy question is still worth settling on its own merits (trimming `public/locales`
itself, or adopting `da`/`ka`/`th`/`uz` into the 43-list), that is now source-tree hygiene rather
than a shipped-bundle defect, and belongs in a new todo rather than reopening this one.

## Related

- `.planning/todos/completed/2026-09-21-br-and-sl-ship-with-two-whole-namespaces-missing.md` -- the
  todo whose resolution uncovered this; it covers `br`/`sl`/`uz` only and treats them as a
  completeness problem rather than a reachability one.
- `.planning/todos/pending/2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md` --
  the ungated duplication that let these six accumulate unnoticed.
