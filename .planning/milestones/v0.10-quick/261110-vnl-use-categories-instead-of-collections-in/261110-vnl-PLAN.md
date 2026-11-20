---
phase: quick-261110-vnl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - public/locales/*/gamelib.json (en + 48 non-en locales; only the 3 filterPanel keys + en tour key)
  - public/locales/en/translation.json
  - src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/components/UI/NavShell/__tests__/FilterCollectionList.test.tsx
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx
  - src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx
  - .planning/todos/pending/2026-11-10-collections-vs-categories-naming-inconsistent.md (moved to completed/)
autonomous: true
requirements: [TODO-2026-11-10-collections-vs-categories]

must_haves:
  truths:
    - "In en, the library filter panel group header reads 'Categories', its rows read '+ New category' and 'Manage categories'"
    - "The focus-row divider for the user's custom groups reads 'Categories' (same key as the panel header)"
    - "The library tour copy says 'browse your custom Categories.' instead of 'Collections'"
    - "In each non-en locale that already translates Categories, the panel uses that locale's own Categories wording (header.categories / categories-manager.title / category-settings.new-category)"
    - "No i18n key name, component name, type, or internal identifier containing 'collection' was renamed"
  artifacts:
    - path: "public/locales/en/gamelib.json"
      contains: "\"collections\": \"Categories\""
    - path: "src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx"
      contains: "'Manage categories'"
    - path: ".planning/todos/completed/2026-11-10-collections-vs-categories-naming-inconsistent.md"
      provides: "closed todo"
  key_links:
    - from: "FilterCollectionList/index.tsx + FilterFocusRow/index.tsx"
      to: "gamelib:library.filterPanel.collections / newCollection / manageCollections"
      via: "tGamelib(key, defaultValue) -- defaults must equal the new en values"
    - from: "LibraryTour.tsx"
      to: "gamelib:tour.library.quickFiltersCollections"
      via: "t(key, defaultValue)"
---

<objective>
Make the user's custom game groups one term -- "Categories" -- everywhere. Today the library filter
panel header, its "+ New collection" / "Manage collections" rows, the focus-row divider and the
library tour say "Collections", while the game submenu, game-card menu, the "Manage Categories"
dialog and settings say "Categories".

Locked operator decision: the single term is **Categories** (not Collections), because Categories
is already translated across the inherited locales in `translation.json`.

Scope: user-facing VALUES only. JSON key names (`filterPanel.collections`, `manageCollections`,
`newCollection`, `quickFiltersCollections`, `viewsCollections`), component names
(`FilterCollectionList`), types (`'collection'` chip kind, `currentCollection`), storage keys
(`libraryCollection`) and code comments stay as they are.

Output: updated locale values (en + every non-en locale that has a Categories translation),
updated t() defaultValues, updated test assertions, todo moved to completed/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-10-collections-vs-categories-naming-inconsistent.md

Survey already done by the planner (re-verify with the commands in each task, do not re-survey):

en values to change:
- `public/locales/en/gamelib.json` `library.filterPanel.collections` "Collections" -> "Categories"
- `library.filterPanel.manageCollections` "Manage collections" -> "Manage categories"
- `library.filterPanel.newCollection` "+ New collection" -> "+ New category"
- `tour.library.quickFiltersCollections` "Show only installed games or only native builds, or browse your custom Collections." -> "... or browse your custom Categories."
- `public/locales/en/translation.json` `tour.library.viewsCollections` (line ~1233) "...or browse your custom Collections." -> "...or browse your custom Categories." (stale key, no live src caller -- update the value anyway so no en string says Collections)

Non-en: `quickFiltersCollections` and `viewsCollections` exist ONLY in en (checked all 48 locales).
The three filterPanel keys exist exactly once in every locale's gamelib.json (translated: de
"Sammlungen", es "Colecciones", fr "Collections", ...). The same locale's translation.json carries
Categories wording at `header.categories`, `categories-manager.title`,
`category-settings.new-category`, but coverage is uneven:
- no `header.categories`: bs, eu, fa, he, ro, uz
- no `categories-manager.title`: az, bs, eu, fa, he, hr, ka, ml, sr, th, uz
- no `category-settings.new-category`: az, bs, eu, fa, he, hr, ka, sr, th, uz

Prettier: `public/locales/**` JSON reports `{ "ignored": true, "inferredParser": null }` (both
gamelib.json and translation.json measured), so a prettier check over locale files is vacuous and
is deliberately omitted for them (gamelib-conventions, formatter rule). The `.tsx` files report
`{ "ignored": false, "inferredParser": "typescript" }` and DO get a scoped check.

Call sites (src):
- FilterCollectionList/index.tsx:64 `tGamelib('gamelib:library.filterPanel.collections', 'Collections')`; :100-103 newCollection default '+ New collection'; :109-112 manageCollections default 'Manage collections'
- FilterFocusRow/index.tsx:123-126 `collectionsGroupLabel` default 'Collections'
- LibraryTour.tsx:95-98 quickFiltersCollections default '...browse your custom Collections.'

Tests asserting the old text:
- NavShell/__tests__/FilterCollectionList.test.tsx :167 title, :175 `toBe('Collections')`, :191-192, :296-297, :301, :304, :314, :317, :335, :338 ('+ New collection' / 'Manage collections' labels and test names)
- FilterFocusRow/__tests__/filterFocusRow.test.tsx :189, :197, :220, :223, :243, :251
- Library/__tests__/libraryTourAnchors.test.tsx :112 (the quick-filters copy)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite locale values to Categories (en + per-locale Categories wording)</name>
  <files>public/locales/en/gamelib.json, public/locales/en/translation.json, public/locales/{every non-en locale}/gamelib.json</files>
  <action>
Write a one-off Python script in the session scratchpad (NOT in the repo) and run it with
`python3 -I <script> /Users/graysonmitchell/Projects/GameLib/public/locales`. The script must do
TARGETED single-line text substitution, never json.load/json.dump round-tripping of whole files
(that would rewrite escapes, indentation and key order across 49 inherited files). For each
substitution: build the exact old line fragment as `"<key>": ` + json.dumps(old_value,
ensure_ascii=False), assert it occurs exactly once in the file, replace it with the same key and
json.dumps(new_value, ensure_ascii=False), write back with the original trailing newline. Use
json.load only READ-ONLY to obtain current values.

en (per the locked decision, term = Categories; sentence case kept for the panel rows to match the
panel's existing style):
- gamelib.json `collections` -> "Categories"; `manageCollections` -> "Manage categories";
  `newCollection` -> "+ New category"; `quickFiltersCollections` -> replace "custom Collections."
  with "custom Categories." (rest of sentence unchanged).
- translation.json `viewsCollections` -> replace "custom Collections." with "custom Categories.".

Each non-en locale (every directory under public/locales except en), sourcing wording from the
SAME locale's translation.json so the panel matches that locale's menus/dialog:
- `filterPanel.collections` <- `header.categories`
- `filterPanel.manageCollections` <- `categories-manager.title`
- `filterPanel.newCollection` <- "+ " + `category-settings.new-category`
- Fallback (planner's choice, keep it simple): if the source key is missing or an empty string,
  leave that one value UNCHANGED (do not substitute English -- that would regress a translated
  string to English). Each key is decided independently.
- Use the source string verbatim (do not re-case it; e.g. de manage becomes "Kategorien
  Verwalten", which is exactly the dialog title the user sees in de).

The script prints one line per locale listing which keys changed and which were skipped (with the
missing source key), and a final count. Paste that report into the SUMMARY. Expected skips from the
survey: collections skipped for bs, eu, fa, he, ro, uz; manageCollections skipped for az, bs, eu,
fa, he, hr, ka, ml, sr, th, uz; newCollection skipped for az, bs, eu, fa, he, hr, ka, sr, th, uz.
If the actual skip list differs, investigate before proceeding.

Do not touch any other key. Do not rename any key.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && for f in public/locales/*/gamelib.json public/locales/en/translation.json; do python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$f" || echo "BAD JSON $f"; done && grep -nE '"(collections|manageCollections|newCollection|quickFiltersCollections)":' public/locales/en/gamelib.json && grep -n '"viewsCollections":' public/locales/en/translation.json && test "$(grep -cE '": "[^"]*[Cc]ollection' public/locales/en/gamelib.json)" = "0" && test "$(grep -c 'custom Collections' public/locales/en/translation.json)" = "0" && grep -n '"collections":' public/locales/de/gamelib.json | grep -q '"Kategorien"' && grep -n '"newCollection":' public/locales/es/gamelib.json | grep -q '"+ Nueva categoría"' && git diff --stat -- public/locales && pnpm lint-translations:gamelib</automated>
    Prettier: omitted on purpose -- every path this task writes is under public/locales/ and `npx prettier --file-info` reports `{ "ignored": true, "inferredParser": null }` for them, so `--check` would be a vacuous green (gamelib-conventions formatter rule).
  </verify>
  <done>All 49 gamelib.json files plus en translation.json parse as JSON; en has no "Collections"/"collection" value left in those keys; de/es spot-checks show the locale's own Categories wording; `git diff --stat` touches only locale files with 1-4 changed lines each; `pnpm lint-translations:gamelib` reports no new findings for these keys (compare against `git stash`-free baseline if it reports pre-existing ones).</done>
</task>

<task type="auto">
  <name>Task 2: Update t() defaults in src and the tests that assert the old labels</name>
  <files>src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx, src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx, src/frontend/screens/Library/components/LibraryTour.tsx, src/frontend/components/UI/NavShell/__tests__/FilterCollectionList.test.tsx, src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx, src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx</files>
  <action>
Change only the defaultValue string arguments so they equal the new en values from Task 1:
- FilterCollectionList/index.tsx: 'Collections' -> 'Categories' (filterPanel.collections),
  '+ New collection' -> '+ New category', 'Manage collections' -> 'Manage categories'.
- FilterFocusRow/index.tsx: collectionsGroupLabel default 'Collections' -> 'Categories'. Keep the
  variable name `collectionsGroupLabel`.
- LibraryTour.tsx: quickFiltersCollections default -> 'Show only installed games or only native
  builds, or browse your custom Categories.'

Tests: update every literal assertion and every `props.label === ...` finder that matches the old
labels to the new labels, and update `it(...)` titles that name the UI labels ("titled Categories",
"clicking + New category", "clicking Manage categories", "Views, Categories, Store, Runnability",
"omits Categories wholesale", "Uncategorized last in the Categories sub-group"). CRITICAL: the
negative assertion at filterFocusRow.test.tsx:223 `not.toContain('Collections')` must become
`not.toContain('Categories')` -- leaving it on the old string would make it pass vacuously. Same
for every `toEqual([... 'Collections' ...])` divider-order array. Keep test variable names like
`newCollectionRow` (internal identifiers stay).

Do NOT rename keys, components, files, types or storage keys, and leave code comments that cite
the historical WR-08 labels (types.ts:240-241, Library/index.tsx:506-507,
CategoriesManager/index.tsx:202-203) alone -- they are incident records, not UI.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test "$(grep -hE "'(Collections|\+ New collection|Manage collections)'|custom Collections" src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx src/frontend/screens/Library/components/LibraryTour.tsx src/frontend/components/UI/NavShell/__tests__/FilterCollectionList.test.tsx src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx | grep -v '^\s*//' | wc -l | tr -d ' ')" = "0" && pnpm test -- src/frontend/components/UI/NavShell/__tests__/FilterCollectionList.test.tsx src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx src/frontend/screens/Library/components/FilterChipRow && npx prettier --check src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx src/frontend/screens/Library/components/LibraryTour.tsx src/frontend/components/UI/NavShell/__tests__/FilterCollectionList.test.tsx src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx && npx eslint src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx src/frontend/screens/Library/components/LibraryTour.tsx</automated>
  </verify>
  <done>No old label literal remains in the six files; the targeted jest suites (plus FilterChipRow, which shares the collection-chip key) pass; prettier --check passes on the exact six paths (all report ignored:false); eslint clean on the three source files. A repo-wide `grep -rnE "'(Collections|\+ New collection|Manage collections)'" src` returns nothing outside comments.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo</name>
  <files>.planning/todos/pending/2026-11-10-collections-vs-categories-naming-inconsistent.md -> .planning/todos/completed/2026-11-10-collections-vs-categories-naming-inconsistent.md</files>
  <action>
`git mv` the todo from `.planning/todos/pending/` to `.planning/todos/completed/`. Append a
`## Resolution` section: term chosen = Categories (operator decision, already translated in the
inherited locales); keys and identifiers unchanged; en values changed (list the 5); non-en locales
mapped from header.categories / categories-manager.title / "+ " + category-settings.new-category,
with the per-key skip list from Task 1's report (those locales keep their existing translation
because they have no Categories wording to borrow); resolved by quick task 261110-vnl. Keep the
existing frontmatter intact (completed/ is exempt from the triage gate, but do not strip the keys).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-10-collections-vs-categories-naming-inconsistent.md && grep -q '^## Resolution' .planning/todos/completed/2026-11-10-collections-vs-categories-naming-inconsistent.md && grep -q '261110-vnl' .planning/todos/completed/2026-11-10-collections-vs-categories-naming-inconsistent.md && pnpm planning-gates</automated>
    Prettier: omitted -- run `npx prettier --file-info .planning/todos/completed/2026-11-10-collections-vs-categories-naming-inconsistent.md` first; `.planning/` paths measure as ignored (gamelib-conventions cites `.planning/STATE.md` ignored:true). If it unexpectedly reports `"ignored": false`, add `npx prettier --check` on that one path.
  </verify>
  <done>Todo lives only in completed/ with a Resolution section naming 261110-vnl; `pnpm planning-gates` green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Copy-only change to static locale JSON and t() defaults; no input handling, IPC, or process spawn |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vnl-01 | Tampering | 49 locale JSON files rewritten by a script | mitigate | Targeted exact-once line substitution with assert (no whole-file re-serialisation); JSON parse check over every touched file; `git diff --stat` reviewed for 1-4 lines per file |
| T-vnl-02 | Denial of Service | i18next falls back to key text if a value is broken | mitigate | Parse check + `pnpm lint-translations:gamelib` (flags empty strings and en/locale key drift) |
</threat_model>

<verification>
- All locale JSON parses; en contains no "Collections" in the panel/tour values.
- Targeted jest suites green; prettier + eslint clean on the touched .tsx files.
- Todo moved to completed/ and planning-gates green.
</verification>

<success_criteria>
A user browsing the Games library sees "Categories", "+ New category", "Manage categories" in the
filter panel and "Categories" on the focus-row divider -- the same word as the game submenu, card
menu, "Manage Categories" dialog and settings -- in en and in every locale that already translates
Categories. No identifier or i18n key was renamed.
</success_criteria>

<output>
Create `.planning/quick/261110-vnl-use-categories-instead-of-collections-in/261110-vnl-SUMMARY.md` when done, including Task 1's per-locale change/skip report.
</output>
