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

## Resolution (quick-260922-iyj)

**Weakness 2 was closed by quick task 260922-hjb, not by this task.** Commit `03e196fdb`
(same day this todo was filed) added `meta/__tests__/pruneUnofferedLocales.test.ts`, which
already carries the named exclusion ledger `UNREACHABLE_CODES = ['br','da','ka','sl','th','uz']`
and pins it live in both directions: `computeUnofferedLocaleDirs(public/locales,
supportedLanguages)` equals exactly that ledger, plus the reverse direction (every offered code
has a directory under `public/locales`). This task deliberately added no second copy of that
ledger -- a duplicated ledger is precisely the trap this task exists to remove.

**Weakness 1 is closed by this task.** `src/frontend/index.tsx` now imports
`supportedLanguages` from `common/languages` and passes it directly as `supportedLngs` --
its 44-line inline array is gone. The under-`src/` census
(`grep -rnE "^[[:space:]]*'[a-z]{2}(_[A-Za-z]{2,4})?',?$" src --include="*.ts" --include="*.tsx"
| cut -d: -f1 | sort | uniq -c | sort -rn | awk '$1 >= 40 {print}'`) went from two 43-code list
literals (`src/frontend/index.tsx`, `src/common/languages.ts`) to exactly one
(`src/common/languages.ts`).

**The labels/flags half is enforced by the type system, not by a test.**
`src/common/languages.ts`'s `supportedLanguages` is now `as const`, with `SupportedLanguage`
exported as `(typeof supportedLanguages)[number]`. `LanguageSelector/index.tsx`'s
`languageLabels` and `languageFlags` are typed `Record<SupportedLanguage, string>` instead of
`{ [key: string]: string }`. This catches a missing key AND an extra key at compile time --
strictly stronger than a set-equality test -- demonstrated in both directions:

- Deleting `languageLabels.zh_Hant` produced (`pnpm codecheck`, exit 2):
  `error TS2741: Property 'zh_Hant' is missing in type '{ ... }' but required in type
  'Record<"id" | "en" | ... | "zh_Hant", string>'.`
- Adding `languageFlags.xx = 'Nonesuch'` produced (`pnpm codecheck`, exit 2):
  `error TS2353: Object literal may only specify known properties, and 'xx' does not exist in
  type 'Record<"id" | "en" | ... | "zh_Hant", string>'.`

Both experiments were reverted; `pnpm codecheck` is green afterward. The missing-key direction
doubles as proof that the `as const` is load-bearing: if `SupportedLanguage` had widened to
`string`, deleting a map key would not have produced a type error at all.

This enforcement depends on `as const` staying on `supportedLanguages` in `languages.ts`, and
**nothing gates that** -- only the header comment above the array in that file records it as a
load-bearing, unenforced invariant.

No new test file was added: adding one was a live risk given the tests lint ceiling sat at
638/638 with zero headroom (measured at `cdc69c1ca`, unchanged after this task).

**Final shape:** one list literal (`src/common/languages.ts`) plus two compiler-checked maps
(`LanguageSelector/index.tsx`), down from four hand-maintained literals. The maps are still 86
hand-written label/flag *values* -- that is by design; only their key sets are now enforced.

**One incidental correction, recorded not fixed:** `bootstrap.ts`'s divergence comment named an
`src/backend/main.ts` Electron leg that no longer exists (Rust/Tauri rearchitecture), and its
"both init sites must change together" line was actually about the `ns` list, not the
`supportedLngs` list -- the renderer legitimately does not mirror `ns`/`defaultNS`, because it
lazy-loads the `gamelib` namespace via `useTranslation('gamelib')` (react-i18next's
`loadNamespaces`), used at `src/frontend/App.tsx:189` and ~30 further call sites. The comment
was corrected in this task's Task 2 to name the live sibling (`src/frontend/index.tsx`), state
the `supportedLngs` half is now structurally closed, and explain why the `ns` half is not a gap.
No new todo is warranted -- this was a stale comment, not a defect.
