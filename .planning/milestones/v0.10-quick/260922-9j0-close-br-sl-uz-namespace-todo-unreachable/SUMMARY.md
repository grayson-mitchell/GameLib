---
quick_id: 260922-9j0
slug: close-br-sl-uz-namespace-todo-unreachable
date: 2026-09-21
status: complete
resolves_todo: .planning/todos/completed/2026-09-21-br-and-sl-ship-with-two-whole-namespaces-missing.md
source_changes: none
---

# 260922-9j0 — closed as not-a-defect; the decision was already made

## Outcome

The todo asked for a choice between three options. **The choice was moot**: its premise
("Both are already selectable") is false, and the option it named as the costly one — dropping
`br`/`sl` from the offered language list — has always been the shipped state.

No source file changed. The todo was rewritten with the measurement and moved to `completed/`;
two residual findings were filed.

## What was measured

**All four language lists agree exactly, and none contains the locales in question.**

```
src/frontend/index.tsx          supportedLngs        43
src/common/languages.ts         supportedLanguages   43
LanguageSelector/index.tsx      languageLabels       43
LanguageSelector/index.tsx      languageFlags        43
public/locales/ directories     49

pairwise symmetric difference: empty
dirs in NO list: br, da, ka, sl, th, uz
```

**The first parse of this was wrong and said 0.** Splitting the source on `}` to bound the object
literal hits the type annotation `{ [key: string]: string }` first, so `languageLabels` measured as
0 keys. Brace-matching gave the real 43. A grep here is confidently wrong in both directions.

**No path reaches the six.** `index.tsx:148-152` `.use()`s only `Backend` and `initReactI18next`;
`i18next-browser-languageDetector` appears solely in a comment on line 151. `lng` comes from
`configStore`/`localStorage`, default `'en'`.

**`supportedLngs` refuses the code even when stored** — run against the repo's own installed
i18next rather than cited from docs:

```
lng:'br', supportedLngs excluding 'br'
  resolvedLanguage       -> undefined
  languages hierarchy    -> ["en"]
  isSupportedCode('br')  -> false
  isSupportedCode('de')  -> true
```

The hierarchy is `["en"]`, so the `br`/`sl` catalogs are **never requested**. The missing
namespaces have no user-visible effect — and neither do the namespaces that *are* present.

**Root cause.** `git log -S"'sl',"` / `-S"'uz',"` over `index.tsx` and `common/languages.ts`
return **zero commits in all history**: these codes were never in any list. The directories come
from upstream Weblate sync (`[i18n] Updated Translations` #5098, #5583), which creates a directory
as soon as a translator starts a language. `3b3d813f2` then machine-filled `gamelib.json` across
"48 locales" *by directory listing*, which is how `br`/`sl` hold a fork-owned namespace while
holding no upstream ones.

## Lessons

**A `ready: human` blocker can be rotten in a third way: moot.** The recorded shapes were "stale"
and "already fixed". This one was neither — the decision it described had already been taken, years
of commits ago, and three parsed files plus one `i18next.init()` settled it. Sharper still: the
todo was filed by the *immediately preceding* task, so one session both created and dissolved it.
Filing a decision without first checking whether the system had already decided it is the failure.

**`git mv` fired the recorded trap.** After rewriting the todo, `git mv` staged the **HEAD** body,
not the rewrite: working tree `grep -c "## Resolution"` = 1, index = 0. Committing there would have
shipped a rename carrying the old, false text. Re-staged explicitly, then re-asserted the index.

**A "documented fallback" can describe a mechanism that is not running.** The todo's option 2 was
the right outcome reached by a wrong explanation. Adopting its wording verbatim would have left a
false mechanism on record as a deliberate decision.

## Residuals filed

- `2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md` (`minor`, `human`) — the
  six dirs ship via `tauri.conf.json:42` mapping `../build/locales/` wholesale: 532K of dead
  bundle weight, and four are largely empty (`ka` 657/812 keys empty, `th` 749/810, `uz` 395/841,
  `da` 100/892), so adoption is not a switch-flip. Left `human` because deletion is undone by the
  next Weblate sync unless the sync policy is known — the note states what would make it `code`.
- `2026-09-21-the-43-language-list-is-hand-maintained-in-four-places.md` (`minor`, `code`) — the
  same 43 codes in four literals across three files with no gate, `index.tsx` re-declaring the
  list instead of importing the `common/languages.ts` constant that exists and has exactly one
  importer. This is the mechanism that let the six accumulate unnoticed; the suggested fix makes
  the `public/locales/` cross-check the load-bearing half, since cross-checking the four literals
  alone would pass today and still miss a new directory.

## Verification

- `pnpm planning-gates` — **12/12 PASS**, before and after the STATE.md edit.
- STATE.md frontmatter re-parsed after the `stopped_at` prepend: YAML valid, 8 keys, suffix
  preserved, prior chain intact, scalar not wrapped.
- New table row asserted at 5 columns, matching its neighbours.
- No source change, so no typecheck/lint/test movement is claimed.
