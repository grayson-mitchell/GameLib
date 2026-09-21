---
created: 2026-09-21T00:00:00.000Z
title: "The 43-language list is hand-maintained in four places with no gate, and the frontend ignores the shared constant that exists"
area: i18n
severity: minor
platform: any
ready: code
found_by: "quick-260922-9j0"
files:
  - src/common/languages.ts
  - src/frontend/index.tsx
  - src/frontend/components/UI/LanguageSelector/index.tsx
---

## Observed / Measured

The same 43 language codes are declared in four separate literals across three files:

```
src/common/languages.ts:1                    supportedLanguages   43
src/frontend/index.tsx:164                   supportedLngs        43   (inline array)
LanguageSelector/index.tsx:23                languageLabels       43   (keys)
LanguageSelector/index.tsx:67                languageFlags        43   (keys)
```

Measured 2026-09-21 by brace-matched parse: **all four currently agree exactly** -- every pairwise
symmetric difference is empty. So this is a latent trap, not a live defect.

Two specific weaknesses:

1. **`src/frontend/index.tsx` re-declares the list instead of importing the constant that already
   exists for exactly this purpose.** `common/languages.ts` has a single importer --
   `src/backend/sidecar/bootstrap.ts:41` -- and the frontend i18next init, which needs the identical
   list, hand-rolls its own copy. The comment at `bootstrap.ts:1006-1010` already warns that "both
   i18next init sites must change together -- a one-sided change is a build divergence", which is
   the same hazard one import would remove.

2. **Nothing gates the lists against `public/locales/`.** A grep for `supportedLngs`,
   `languageLabels` and `languageFlags` across `src/`, `meta/` and `.github/` returns only the three
   declaring files -- no test, no meta script. So a locale directory added to `public/locales/` is
   silently never offered, and a code added to one list but not the others degrades quietly (a
   missing `languageFlags` entry renders `undefined` into the option label under
   `FlagPosition.PREPEND`).

Weakness 2 is not hypothetical: it is the mechanism that produced the six unreachable directories
in `2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md`.

## Suggested fix (desk-ready)

1. Import `supportedLanguages` from `common/languages` in `src/frontend/index.tsx` and delete the
   inline array; derive `languageLabels`/`languageFlags` key coverage from the same constant.
2. Add a test asserting the lists agree with each other **and** that every directory in
   `public/locales/` is either in `supportedLanguages` or on an explicit, named exclusion ledger.

The exclusion ledger is the load-bearing half -- a test that only cross-checks the four literals
would pass today and would still not see a new Weblate-seeded directory. Derive the directory
population with a filesystem read, and note the recorded trap that `ls public/locales/` gives 49
while `translation.json` exists in only 47.

## Related

- `.planning/todos/pending/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md` --
  the six directories this gap allowed to accumulate.
- `.planning/todos/completed/2026-09-21-br-and-sl-ship-with-two-whole-namespaces-missing.md` -- the
  todo whose resolution measured these lists.
