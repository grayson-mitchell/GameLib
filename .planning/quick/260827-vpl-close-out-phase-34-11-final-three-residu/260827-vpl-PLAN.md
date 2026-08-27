---
phase: quick/260827-vpl
plan: 01
quick_id: 260827-vpl
type: execute
mode: quick-full
wave: 1
depends_on: []
autonomous: true
requirements: [WR-10, WR-11, WR-18]
phase_touched: "34.11-library-filtering-search-views-collections-and-cross-store-f"
files_modified:
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/components/FilterZeroResult/index.tsx
  - public/locales/en/gamelib.json
  - src/frontend/screens/Library/__tests__/alphabetLetterIsAFilter.test.ts
  - src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx
  - meta/__tests__/hardcodedStringGate.test.ts
  - meta/__tests__/genI18nGateScope.test.ts
  - .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-CONTEXT.md
  - .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md
  - .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-VERIFICATION.md
  - .planning/todos/completed/2026-08-25-phase-34-11-residual-review-warnings.md

must_haves:
  truths:
    - "With only an alphabet letter selected and zero matches, the user is told the LETTER is why -- not that their library is empty."
    - "`Clear all` clears the alphabet letter, so no path through the zero state can leave the grid empty with the button already spent."
    - "Hiding the alphabet strip cannot leave a live, invisible letter filter applied."
    - "A new untranslated English literal added to `facetLabels.ts` or `chipLabels.ts` fails a blocking gate by name."
    - "`meta/i18nGateScope.json` and `meta/i18nGateAllowlist.json` are byte-identical after this task."
    - "`34.11-REVIEW-FIX.md` reads `all_fixed` only if fixed+invalid+open arithmetic re-derived from its own rows sums to 23 with open == 0."
  artifacts:
    - path: "src/frontend/screens/Library/__tests__/alphabetLetterIsAFilter.test.ts"
      provides: "Three source gates over Library/index.tsx: clearAllFilters resets the letter, the zero-state branch admits the letter, hiding the strip clears the letter"
      contains: "setAlphabetFilterLetter(null)"
    - path: "src/frontend/screens/Library/components/FilterZeroResult/index.tsx"
      provides: "Zero-state sentence that names the alphabet letter"
      contains: "alphabetFilterLetter"
    - path: "meta/__tests__/hardcodedStringGate.test.ts"
      provides: "Measured, blocking ratchet over the two i18n default-text declaration sites"
      contains: "facetLabels.ts"
  key_links:
    - from: "src/frontend/screens/Library/index.tsx"
      to: "src/frontend/screens/Library/components/FilterZeroResult/index.tsx"
      via: "zero-state branch condition admits alphabetFilterLetter"
      pattern: "activeFilterCount > 0 \\|\\| alphabetFilterLetter"
    - from: "src/frontend/screens/Library/components/FilterZeroResult/index.tsx"
      to: "public/locales/en/gamelib.json"
      via: "literal tGamelib() call site for the letter label"
      pattern: "emptyAlphabet"
    - from: "meta/__tests__/hardcodedStringGate.test.ts"
      to: "meta/hardcodedStringGate.ts"
      via: "scanScope({ extraFiles }) audit mode, committed scope untouched"
      pattern: "extraFiles"
---

<objective>
Close Phase 34.11's final three residual review findings — WR-10, WR-11 (both parked
behind decision D-08) and WR-18 (i18n gate scope) — and flip `34.11-REVIEW-FIX.md` to
`all_fixed` so the phase folder finally renders green.

This task's real deliverable is **three documented decisions plus the code that follows
from them**. Every one was taken on evidence gathered during planning and is recorded
below with that evidence. The executor implements the decisions; it does not re-litigate
them, and it does not silently widen them.

Purpose: the phase has been functionally complete since 2026-08-10 (`34.11-VERIFICATION.md`
`status: passed`, 17/17) and has spent seventeen days yellow behind a residual ledger.
Output: two user-facing defect fixes, one new blocking gate over previously-unmeasured
files, an amended D-08, a closed ledger and a resolved todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md
@.planning/todos/pending/2026-08-25-phase-34-11-residual-review-warnings.md

Read `Skill("sketch-findings-gamelib")` before touching the chip row or the filter panel.
You will not need to touch either — see DECISION 1 — but read it so you can tell if a
proposed edit strays into sketch-governed surface.
</context>

<decisions>

These three decisions were taken during planning, on evidence read out of the code at
`51716f88f`. They are the spec for the tasks below.

---

## DECISION 1 — The alphabet control is a **FILTER**, not an index/jump. D-08's premise is **REVISED**; D-08's placement conclusion is **UPHELD**.

**The question:** does the alphabet control remove games from the rendered set, or does it
seek/scroll within a set that stays whole?

**Evidence (read, not inferred from the name):**

- `src/frontend/screens/Library/index.tsx`, inside the `libraryToShow` memo: when
  `alphabetFilterLetter` is truthy the code calls `library.filter(...)` and keeps only
  titles whose first alphanumeric character (after stripping a leading `the `) matches the
  letter, or is a digit when the letter is `#`. The result is what `<GamesList library={libraryToShow}>`
  renders. Games are **removed from the rendered set**.
- `components/AlphabetFilter/index.tsx` contains no `scrollTo`, no `scrollIntoView`, no
  ref, and no anchor. `handleClick` only calls `onFilterChange(value)` / `onFilterChange(null)`.
  There is no jump behaviour anywhere in the component.

**Verdict:** it is a filter. It answers "which games", which is exactly the question D-08
assigns to the panel and denies to the header row.

**What that does and does not overturn.** D-08 as written in `34.11-CONTEXT.md` is:

> **D-08:** The alphabet filter, sort (`sortDescending` / `sortInstalled`) and grid-vs-list
> `layout` are **not filters** and stay out of the panel, in the grid header near the chip
> row. The panel answers "which games"; those answer "how shown".

Two separable claims:

| Claim | Verdict | Why |
|---|---|---|
| **Placement** — the alphabet strip stays in the grid header, not in the 204px panel | **UPHELD** | Independently supported: a 27-button strip does not fit the panel, and Sketch 004 places no such control there. Nothing found during planning disturbs this. It is also true of sort and layout, for which the whole decision is correct as written. |
| **Premise** — "the alphabet filter is not a filter" | **REVISED — false as to the alphabet member** | It demonstrably removes games. The premise is correct for `sortDescending`/`sortInstalled`/`layout` (reordering and re-rendering the same set) and false for the letter, which was folded into the same bullet with them. |

**Consequences that follow, and are implemented here:** the zero state must name the letter
(WR-10), and `clearAllFilters` must clear it (WR-11).

**One consequence deliberately NOT taken — bounced to the developer.** The letter does
**not** become an `ActiveFilterDescriptor` and therefore does **not** get a chip in
`FilterChipRow`, and `activeFilterCount` is unchanged. Reasons, in order of weight:

1. `activeFilterCount` is `activeFilterDescriptors.length` **by design** (D-26, reinforced
   by WR-12's fix in `4ba13c636`/`a0e7dfed7`: "the count IS that list's length"). Adding
   the letter to the count without adding it to the descriptor list would break that
   invariant and regress a finding closed six hours ago. Adding it to the descriptor list
   means it renders as a chip — there is no third option inside the current architecture.
2. A chip is **sketch-governed surface**. `34.11-UI-SPEC.md:166` places the chip row's
   contents by D-08, and a committed source gate
   (`FilterChipRow/__tests__/index.test.tsx:777-782`) asserts the component's source holds
   no `sortDescending|sortInstalled|alphabetFilterLetter|showAlphabetFilter` vocabulary.
   Changing what the chip row displays is a UI-SPEC change, and this task has no mandate
   for one.
3. The reviewer's own first prescribed fix for WR-10 is precisely the non-chip route:
   *"include the letter in the zero-state branch condition (`activeFilterCount > 0 ||
   alphabetFilterLetter`) and pass it into the sentence."* Taking it is not a reduction of
   the finding; it is the finding's own remedy.

**Open question returned to the developer, NOT recorded as a review finding:** should the
alphabet letter also appear as a removable chip, and should `LibraryHeader` switch to its
"X of Y" form when only a letter is applied? Both require the descriptor/count change
above and therefore a UI-SPEC amendment. Neither is a defect; both are design.

---

## DECISION 2 — WR-11 is a defect and is fixed unconditionally. Its fix carries one extra consequence (D-08a) that is load-bearing for DECISION 1.

WR-11 stands on its own merits regardless of DECISION 1. Evidence beyond "Clear all should
clear things":

- `clearAllFilters`'s own doc comment states D-25 as *"clears AND PERSISTS every filter to
  its default -- whatever the chip row shows is what comes back next launch."* The letter
  is a filter (DECISION 1) and is not cleared, so the comment is false about the visible
  result set.
- **A reachable dead end, not a tidiness complaint.** With a letter *and* a facet applied
  and zero matches, `FilterZeroResult` renders and offers `Clear all filters`. Clicking it
  clears the facets, `activeFilterCount` falls to 0, `FilterZeroResult` unmounts — and if
  the letter alone still matches nothing, `EmptyLibraryMessage` replaces it, telling the
  user the library is empty. The escape hatch consumes itself and leaves the user worse
  informed than before they pressed it.
- The fix has an exact in-file precedent: `filterText` is session-only (D-22, no
  localStorage key) and is cleared with a bare `setFilterText('')` inside the same
  function. `alphabetFilterLetter` is likewise plain `useState(null)` with no persisted
  key, so `setAlphabetFilterLetter(null)` is the same shape, not a new one.

**D-08a (new, dated 2026-08-27):** hiding the alphabet strip clears the selected letter.

This is not incidental scope. DECISION 1 withholds a chip on the argument that *the strip
is itself the letter's always-visible active indicator* (`alphabet-filter-button--active`).
That argument is **false today**: `showAlphabetFilter` is a user toggle, `{showAlphabetFilter && <AlphabetFilter />}`
gates the render, and `handleToggleAlphabetFilter` does not clear the letter — so a user
can hide the strip and be left with a live filter that nothing on screen represents. Ship
DECISION 1 without D-08a and the mitigation's rationale is the false part. Fixed here.

---

## DECISION 3 — WR-18's prescribed fix is invalid; the allowlist is the **wrong register**; the finding is closed by giving both declaration sites a real measured ratchet.

The user's prior was "two `meta/i18nGateAllowlist.json` entries with `expected` counts,
rather than rewriting the gate heuristic." That prior was verified against the mechanism
and is **overturned**, on the project's own written rule.

**(a) The allowlist mechanically supports it.** `scanScope()` in `meta/hardcodedStringGate.ts`
scans every allowlist entry *regardless of the committed scope*, keeps its violations out
of `report.violations`, and pushes any `measured !== expectedCount` into `staleExemptions`.
An entry alone would bring a file into the scan without touching `meta/i18nGateScope.json`.
So the mechanism exists and behaves as the user expected.

**(b) But the project has already ruled that register out for this exact shape.**
`meta/__tests__/genI18nGateScope.test.ts:66-72`, about `helpers/gamepad.ts`'s three CSS-selector
false positives:

> *"These are gate false positives, not untranslated UI text, so they must NOT be parked in
> `meta/i18nGateAllowlist.json` -- that file is a DEFERRAL register (`expectedCount` + a
> blocking reason), and a false positive recorded there would read as real deferred debt
> forever."*

WR-18's violations are the same shape — see (d). Parking 43 false positives there would
record them as untranslated UI debt in perpetuity.

**(c) And the register is pinned shut against exactly this.**
`meta/__tests__/hardcodedStringGate.test.ts:1329` (threat T-34.8-30) asserts
`expect(allowlist).toHaveLength(2)` and pins both paths by name, under the title *"growing
it is a decision, not a way to reach green."* Growing it to four would be that decision.
It is not the right one.

**(d) The 43 residual violations were re-measured during planning and are all key/default
pairs.** Reference measurement at `51716f88f` via `scanScope({ extraFiles })` (audit mode,
committed scope untouched): `facetLabels.ts` **8** (all `argument`), `chipLabels.ts` **35**
(`object-property` + `argument`), zero violations anywhere else in the 163-file committed
scope. Every one is either an i18n key literal (`gamelib:library.filterPanel.viewInstalled`,
`header.show_updates_only`) or its paired English `defaultText` (`Installed`,
`Show games with updates only`). None is an untranslated string rendered to a user.

> **The previously-recorded 8 + 27 = 35 is STALE.** `chipLabels.ts` grew from 27 to 35
> when quick tasks `260827-t9c` and `260827-ua7` collapsed `resolveLabel` into it (WR-07)
> and reworked WR-12. The number in this plan is a reference only — Task 2 **measures and
> pins its own**.

**(e) The review's own prescribed fix — *"add both paths in the same regeneration as
WR-17"* — is invalid for the reason WR-17 itself was reclassified invalid:** the
regeneration would disarm `isHandCuratedProvenance()`'s default-deny veto and widen a
blocking gate. That is settled in `34.11-REVIEW-FIX.md`'s WR-17 row and is not reopened.

**(f) The omission is already declared and ratcheted, but never measured.** Both files are
already in `DECLARED_UNSCANNED_DEBT` (`genI18nGateScope.test.ts:91` and `:95`) and the
A-03/A-17 ratchet fails by name if either drifts. So they are not *unowned*. But nothing
anywhere measures their contents — a genuinely untranslated string added to either file
today is caught by nothing.

**The decision:** close WR-18 by supplying the one thing actually missing — a **measured,
blocking ratchet** over both declaration sites, pinned by count *and* by the exact set of
literal texts, running in audit mode so neither `meta/i18nGateScope.json` (163-file pin,
provenance veto) nor `meta/i18nGateAllowlist.json` (T-34.8-30 pin) is touched. After this,
adding a new English literal to either file fails by name. That is what the finding was
reaching for; the route it named was closed.

**Residual routed out, not buried:** a spec-table-aware gate heuristic (the fix
`genI18nGateScope.test.ts:72` calls "the right fix", which would also retire
`helpers/gamepad.ts`'s three CSS-selector false positives) remains desirable and is
cross-cutting, pre-dating and outliving Phase 34.11. Task 3 opens a **new** todo for it.
It is not a 34.11 residual and does not hold the phase open — the project already carries
this same residual for `gamepad.ts` without it blocking any phase.

</decisions>

<hazards>

Re-read before starting. All are live.

1. **Line numbers are stale four times over.** Quick tasks `260827-s8z`, `260827-t9c`,
   `260827-ua7` all edited these files today, and a **concurrent session is committing
   34.13 work to this same branch** — `HEAD` moved from `985a554cc` to `51716f88f` during
   planning. Locate every edit by SYMBOL (`const clearAllFilters = () => {`,
   `const handleToggleAlphabetFilter = () => {`, `libraryToShow.length === 0 &&`), never by
   line number, including the line numbers quoted in this plan.
2. **Every behaviour change needs a named assertion that FAILS against current code**, plus
   a non-vacuity proof. Run each new test against unmodified source FIRST and record the
   failure text in the SUMMARY. This phase's history is tests that could not fail.
3. **No jsdom, no react-test-renderer.** Component tests call the function component
   directly and inspect the returned element graph, mocking `react`'s `useContext` and
   `react-i18next`'s `useTranslation` at module level. `FilterChipRow/__tests__/index.test.tsx`
   already does exactly this — extend it, do not invent a harness.
4. **`t()`'s default arg is INERT when the key exists.** Renaming an existing string via
   the default is a silent no-op. The two keys in Task 1 are NEW, so this does not bite —
   but do not "fix" any existing wording via a default.
5. **New user-facing strings go in `public/locales/en/gamelib.json`, NEVER
   `translation.json`.** `pnpm lint-translations:gamelib` must stay green.
6. **i18next 22.5.1 plural trap:** a `_one`/`_other` key whose call site passes no `count`
   silently returns the inline English default and discards every translation. Neither new
   key is pluralised and neither takes `count`. Do not introduce one.
7. **`pnpm codecheck` says nothing about CI lint.** Run `pnpm exec eslint <changed files>`
   separately. Jest **by path with an explicit `--config`** (proven working:
   `pnpm exec jest --config src/frontend/jest.config.js <path>`); never a full `pnpm test`;
   never `--selectProjects`. Assert non-zero test counts in every run you report.
8. **Known-red, NOT yours:** `meta/__tests__/genI18nGateScope.test.ts` A-17 ANTI-ROT fails
   from Phase 34.17 drift and currently names 3 files (2 pre-existing +
   `CategoriesManager/index.tsx` from quick `ua7`). **Capture the exact failure output
   BEFORE any edit** and diff it after. Task 2 touches this same file — comment-only — so
   precision about which failure is which is mandatory. Tolerate exactly that failure; fail
   on anything else.
9. **No `git stash`, no `git reset`, no `git checkout -- <file>`** (the post-checkout hook
   fires `download-helper-binaries`, which throws on sentinels). Revert via
   `git show HEAD:<path> > <path>`. **Do not push.** A concurrent session shares this
   branch — stage only your own files, by explicit path, and never `git add -A`.
10. **No `eslint-disable` as a fix.**

</hazards>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: WR-10 + WR-11 + D-08a — the alphabet letter behaves like the filter it is</name>
  <files>
src/frontend/screens/Library/index.tsx
src/frontend/screens/Library/components/FilterZeroResult/index.tsx
public/locales/en/gamelib.json
src/frontend/screens/Library/__tests__/alphabetLetterIsAFilter.test.ts
src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx
  </files>

  <behavior>
Write these tests FIRST and watch each fail against unmodified source.

Behavioural (append a new `describe` to `FilterChipRow/__tests__/index.test.tsx`, reusing
its existing `makeChipRowContextValue` / `chipRowContextValue` / `collectElements` /
`FilterZeroResultImport` harness; add `alphabetFilterLetter: null` to the factory's
defaults so every pre-existing case keeps its current meaning explicitly):

- **B1** `activeFilterCount: 0`, `activeFilterDescriptors: []`, `alphabetFilterLetter: 'A'`
  -> returns a non-null tree whose `FilterZeroResult__body` text contains
  `Starting with "A"`.
  *Fails today:* the component returns `null` at `if (activeFilterCount === 0)`.
- **B2** same but `alphabetFilterLetter: '#'` -> body contains `Starting with a number`
  and does NOT contain a literal `#` glyph as the letter token.
- **B3** one real descriptor (e.g. `showUpdatesOnly`) AND `alphabetFilterLetter: 'A'` ->
  body contains BOTH labels joined by the D-30 separator ` + `, letter label LAST.
- **B4 (regression guard)** `activeFilterCount: 0`, descriptors `[]`,
  `alphabetFilterLetter: null` -> still returns `null`. This must PASS before and after;
  say so explicitly in the SUMMARY.
- **B5 (guard order preserved)** `__isDefaultLibraryContext: true` **and**
  `alphabetFilterLetter: 'A'` -> returns `null` and `console.error` fires exactly once
  naming `FilterZeroResult`. The sentinel guard stays FIRST; the letter must not smuggle a
  render past a dead context.

Source gates (new file `src/frontend/screens/Library/__tests__/alphabetLetterIsAFilter.test.ts`).
Reuse `clearAllFiltersCoverage.test.ts`'s brace-matching extractor idiom — copy the
`indexOf(<signature>)` + depth-count loop, and throw a loud "this gate has rotted" error if
a signature is not found, exactly as that file does:

- **S1** the body of `const clearAllFilters = () => {` contains `setAlphabetFilterLetter(null)`.
  *Fails today.*
- **S2** the body of `const handleToggleAlphabetFilter = () => {` contains
  `setAlphabetFilterLetter(null)`. *Fails today.*
- **S3** `Library/index.tsx`'s zero-state branch admits the letter — the source contains
  `activeFilterCount > 0 || alphabetFilterLetter`. *Fails today.* Strip comments before
  asserting (use `stripSourceComments` from `backend/testUtils/stripSourceComments`, the
  idiom `libraryHeaderVisibility.test.ts` already uses) so the gate cannot be satisfied by
  the prose in a comment — including the prose this very plan adds.
- **S4** non-vacuity for S1/S2/S3: sabotage a COPY of each extracted string (replace the
  asserted token) and assert the sabotaged copy no longer contains it.
  </behavior>

  <action>
Implement per DECISION 1, DECISION 2 and D-08a. Four edits.

**(1) `public/locales/en/gamelib.json`** — add two keys under `library.filterPanel`,
alongside the existing `emptyBody` / `emptyClearAll` / `emptyHeading`:

- `emptyAlphabetLetter` = `Starting with "{{letter}}"`
- `emptyAlphabetNumber` = `Starting with a number`

Title-Case token shape, matching the existing chip vocabulary — `joinChipLabels` joins with
a literal ` + `, so the sentence reads `No games match Installed + Starting with "A".`
Neither key is pluralised and neither takes `count` (hazard 6). `letter` is not a reserved
interpolation name; `count` is.

**(2) `src/frontend/screens/Library/components/FilterZeroResult/index.tsx`** —
pull `alphabetFilterLetter` off `LibraryContext` (it is already published there; no
plumbing needed). Then, in this order:

- leave the `__isDefaultLibraryContext` sentinel guard exactly where it is, FIRST;
- widen the early return to `if (activeFilterCount === 0 && !alphabetFilterLetter) return null`;
- after the existing descriptor -> `chipLabelSpec` -> `resolveLabel` mapping, append the
  letter's label when `alphabetFilterLetter` is set: `'#'` takes the
  `emptyAlphabetNumber` key, any other letter takes `emptyAlphabetLetter` with
  `{ letter: alphabetFilterLetter }`. **Both must be literal `tGamelib('gamelib:...', '...')`
  call sites in this file** — i18next-parser's JavascriptLexer only resolves string-literal
  arguments, and a variable-keyed call extracts nothing or an empty default (the module
  comment at `chipLabels.ts:248-257` records this being hit twice already this phase). This
  file is already inside `meta/i18nGateScope.json`, so `t()`-wrapped literals are correct
  there and a bare literal would not be;
- keep the `labels.length === 0` guard AFTER the append.

**Revise this file's own header doc-comment in the same edit.** It currently asserts *"the
sentence can never name a filter the chip row does not also show as a chip."* That
invariant is now deliberately broken in exactly one place. Replace it with the new,
narrower truth and the reason: per D-08 (amended 2026-08-27) the alphabet letter is a
filter but is not an `ActiveFilterDescriptor`, so it is named here — the only surface where
its absence produced a dead end — and nowhere else; the strip is its indicator elsewhere,
which is why D-08a clears it when the strip is hidden. Leaving the old sentence standing
would make the file's stated rationale the false part.

**(3) `src/frontend/screens/Library/index.tsx` — zero-state branch.** Change the
`libraryToShow.length === 0` ternary's condition from `activeFilterCount > 0` to
`activeFilterCount > 0 || alphabetFilterLetter`, so a letter-only zero result reaches
`FilterZeroResult` instead of `EmptyLibraryMessage`. This is WR-10's own prescribed fix,
verbatim.

**(4) `src/frontend/screens/Library/index.tsx` — two resets.**
- In `clearAllFilters`, add `setAlphabetFilterLetter(null)`. Place it next to
  `setFilterText('')` and extend that block's existing comment: both are session-only with
  no localStorage key, so both are cleared bare rather than through a persisted wrapper —
  the letter is `useState<string | null>(null)` with no `storage.setItem`, same as
  `filterText` under D-22.
- In `handleToggleAlphabetFilter`, call `setAlphabetFilterLetter(null)` when the strip is
  being hidden (`newValue === false`), with a one-line comment naming D-08a and why: an
  active filter with no on-screen representation is the state this prevents.

Do **NOT**: touch `chipLabels.ts`, `FilterChipRow/index.tsx`, `filterEngine.ts`,
`facetLabels.ts`, `LibraryHeader`, or `activeFilterCount`'s derivation. DECISION 1 turns on
leaving all of those alone.
  </action>

  <verify>
    <automated>pnpm exec jest --config src/frontend/jest.config.js src/frontend/screens/Library/__tests__/alphabetLetterIsAFilter.test.ts src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx src/frontend/screens/Library/__tests__/clearAllFiltersCoverage.test.ts 2>&1 | tail -20</automated>
    <automated>pnpm lint-translations:gamelib</automated>
    <automated>pnpm exec eslint src/frontend/screens/Library/index.tsx src/frontend/screens/Library/components/FilterZeroResult/index.tsx src/frontend/screens/Library/__tests__/alphabetLetterIsAFilter.test.ts src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx</automated>
    <automated>pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5</automated>
    <automated>git diff --stat -- src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts src/frontend/screens/Library/facetLabels.ts src/frontend/screens/Library/filterEngine.ts src/frontend/screens/Library/components/FilterChipRow/index.tsx | wc -l  # MUST be 0 -- DECISION 1's blast-radius bound</automated>
  </verify>

  <done>
All of B1-B5 and S1-S4 pass, three suites report non-zero test counts, and the SUMMARY
records the verbatim pre-fix failure text for B1, B2, B3, S1, S2 and S3 (six independent
RED proofs). B4 is recorded as passing both before and after. `pnpm lint-translations:gamelib`
is green — if it reports the two new keys missing from the other two `gamelib.json` locales,
run `pnpm machine-fill-gamelib` and re-run it; do not hand-write translations. eslint and
tsc are clean on the changed files. The blast-radius check prints `0`.
  </done>
</task>

<task type="auto">
  <name>Task 2: WR-18 — give the two i18n declaration sites a measured, blocking ratchet without touching either pinned config</name>
  <files>
meta/__tests__/hardcodedStringGate.test.ts
meta/__tests__/genI18nGateScope.test.ts
  </files>

  <action>
Implement DECISION 3. Nothing outside `meta/__tests__/` is edited.

**Step 0 — capture the known-red baseline BEFORE any edit** (hazard 8):

    pnpm exec jest --config meta/jest.config.js meta/__tests__/genI18nGateScope.test.ts 2>&1 | tail -40 > /tmp/vpl-a17-before.txt

Record in the SUMMARY the exact failing test name and the exact list of file names it
prints. Anything that differs after your edit is yours.

**Step 1 — measure, do not copy.** The 8 / 35 in DECISION 3 is a planning-time reference at
`51716f88f` and a concurrent session shares this branch. Re-derive the real numbers and the
real literal texts yourself, using audit mode so the committed scope is untouched:

    scanScope({ extraFiles: [
      'src/frontend/screens/Library/facetLabels.ts',
      'src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts'
    ] })

(the same `extraFiles` idiom quick `260827-s8z` used, and the same one the new tests will
use). If your measurement differs from the plan's reference, **yours is authoritative** —
pin yours and say so in the SUMMARY.

**Step 2 — triage before pinning.** Read every violation `text` you measured. Each must be
either an i18n key literal or its paired English `defaultText`. **If any one of them is a
genuinely untranslated user-facing string, STOP** — that is a real defect, not a false
positive, and it invalidates DECISION 3's premise. Report it and do not pin it away.

**Step 3 — add the ratchet** to `meta/__tests__/hardcodedStringGate.test.ts`, as a new
`describe` inside the existing real-scope block (next to the `gate is not disabled` group,
whose T-34.8-29/T-34.8-30 integrity idiom it mirrors). Header comment must state: what
WR-18 found, why the allowlist is the wrong register (quote
`genI18nGateScope.test.ts`'s DEFERRAL-register rule), why the regeneration route is closed
(WR-17), and that this runs in audit mode so neither pinned config moves.

Four assertions:

- **W1 mutual exclusion:** neither path appears in `meta/i18nGateScope.json`'s `files` nor
  in `meta/i18nGateAllowlist.json`. This is not decoration — `scanScope` scans scope files
  into `report.violations` and allowlist files into `report.allowlisted`, so a future
  double-listing would turn all of them into hard gate failures. This assertion catches
  that the day it happens.
- **W2 count pin:** the audit scan reports exactly `<measured>` violations for
  `facetLabels.ts` and exactly `<measured>` for `chipLabels.ts`, asserted per file, not as
  a sum — a sum lets a gain in one file hide a loss in the other (the "coarser than the
  defect's unit" shape this project has hit five times).
- **W3 text-set pin:** the sorted unique set of violation `text` values for the two files
  equals a committed literal array. This is the assertion that makes the gate *useful*: a
  new English literal added to either file fails **by name**, and moving code between lines
  does not. Every entry in the committed array is a key or a `defaultText` — say so in a
  comment directly above it, and name the reviewer (this task) who checked.
- **W4 no collateral:** the audit scan finds **zero** violations outside these two files,
  proving the committed 163-file scope is still green and that W2/W3 are not masking
  breakage elsewhere.

Plus a **non-vacuity** assertion in the file's established idiom: run `scanSource` (or
`scanScope` against a temp fixture, matching the `writeAllowlist`/tmpdir helpers already in
this file) over a synthetic source containing one added bare English literal, and assert
the measured set gains it. Prove the ratchet can fail; do not merely assert that it passes.

**Step 4 — cross-reference, comment only.** In `meta/__tests__/genI18nGateScope.test.ts`,
extend the `DECLARED_UNSCANNED_DEBT` header comment to document these two entries in the
same idiom the existing comment uses for `helpers/gamepad.ts`: measured counts, the shape
(i18n key + English `defaultText` declarations feeding `t()` at call sites already in
scope), why they are false positives rather than debt, and a pointer to the new
`hardcodedStringGate.test.ts` ratchet that now measures them.
**Comment only. Do not add, remove or alter a single assertion in this file.**

**Forbidden here:** editing `meta/i18nGateScope.json`, editing `meta/i18nGateAllowlist.json`,
running `pnpm gen-i18n-gate-scope` or `pnpm gen-i18n-scope:rewrite`, and changing
`DECLARED_UNSCANNED_DEBT`'s contents (a comment above it is fine; the array is not).
  </action>

  <verify>
    <automated>pnpm exec jest --config meta/jest.config.js meta/__tests__/hardcodedStringGate.test.ts 2>&1 | tail -20</automated>
    <automated>pnpm exec jest --config meta/jest.config.js meta/__tests__/genI18nGateScope.test.ts 2>&1 | tail -40 > /tmp/vpl-a17-after.txt; diff /tmp/vpl-a17-before.txt /tmp/vpl-a17-after.txt; echo "exit=$?  # 0 means the known-red baseline is UNCHANGED"</automated>
    <automated>git diff --stat -- meta/i18nGateScope.json meta/i18nGateAllowlist.json | wc -l  # MUST be 0</automated>
    <automated>pnpm exec eslint meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/genI18nGateScope.test.ts</automated>
  </verify>

  <done>
`hardcodedStringGate.test.ts` passes with a non-zero test count, including W1-W4 and the
non-vacuity case. The `genI18nGateScope.test.ts` before/after diff is EMPTY — the A-17
known-red failure is byte-identical, same test name, same three file names, and the SUMMARY
quotes it. Both pinned config files show a zero-line diff. The SUMMARY records the measured
per-file counts, states whether they matched the plan's 8/35 reference, and confirms the
Step 2 triage found no genuinely untranslated string.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the ledger — amend D-08, re-derive the arithmetic, resolve the todo, route the residual</name>
  <files>
.planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-CONTEXT.md
.planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md
.planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-VERIFICATION.md
.planning/todos/completed/2026-08-25-phase-34-11-residual-review-warnings.md
.planning/todos/pending/2026-08-27-i18n-gate-flags-declaration-site-literals-as-violations.md
  </files>

  <action>
**Do this task ONLY if Tasks 1 and 2 both landed green.** If either did not, stop, leave
`status: partial`, and report what is still needed. A false `all_fixed` is worse than a
yellow folder.

**(1) Amend D-08 in `34.11-CONTEXT.md`.** Do not rewrite the original bullet — append a
dated extension beneath it, in the same idiom D-12 already uses
(`> **Extended 2026-08-09 at /gsd-plan-phase — Windows resolved.**`). Content: the
placement conclusion is upheld; the premise "the alphabet filter is not a filter" is false
as to the alphabet member and correct as to sort/layout; the evidence
(`library.filter(...)` in `libraryToShow`; no scroll/seek anywhere in `AlphabetFilter`);
the three consequences implemented (WR-10 zero state, WR-11 clear-all, D-08a strip-hide);
and the one consequence deliberately withheld (no chip, `activeFilterCount` unchanged)
with its three reasons. Name the quick task ID and both commit SHAs.

**(2) Update `34.11-REVIEW-FIX.md`.**

Add a `re-swept-4` block to the frontmatter (same shape as `re-swept-3`), naming this quick
task and the commits. Rewrite the three rows:

- **WR-10 -> FIXED** — cite the commit, the changed branch condition, the two new i18n keys,
  and the B1/B2/B3 assertions with their pre-fix failure text. Note that this is the
  reviewer's own first prescribed option, and that D-08 is amended rather than discarded.
- **WR-11 -> FIXED** — cite the commit, `setAlphabetFilterLetter(null)` in `clearAllFilters`,
  the `filterText`/D-22 precedent, the S1 source gate, and the self-consuming-escape-hatch
  evidence from DECISION 2. Record D-08a and why it shipped alongside.
- **WR-18 -> FIXED (by an alternative mechanism; the prescribed fix is invalid)** — the full
  DECISION 3 evidence chain: allowlist mechanically capable but doctrinally wrong
  (`genI18nGateScope.test.ts`'s DEFERRAL-register rule) and pinned shut (T-34.8-30
  `toHaveLength(2)`); prescribed regeneration invalid for WR-17's reason; both files already
  in `DECLARED_UNSCANNED_DEBT` and A-03/A-17-ratcheted but never measured; the measured
  per-file counts (state the corrected numbers AND that the previously-recorded 8+27=35 was
  stale); and the new W1-W4 ratchet. Note the residual gate-heuristic item is routed to a
  new todo, not carried by the phase.

**Re-derive the arithmetic from the rows — do not copy a number from this plan.** Count the
`FIXED`, `OPEN` and `INVALID` rows in the table yourself and check the sum against the
review's original 23-finding total (4 Critical + 19 Warning). Set `dispositions:` to what
you counted. Set `status:` to `all_fixed` **only if** the open count you derived is exactly
0. If your count disagrees with the expectation (fixed 22 / open 0 / invalid 1 / total 23),
your count wins and you stop and report the discrepancy.

Update the `## Verdict` prose from `partial` to the new verdict, and rewrite `## Residual`:
it currently says three Warnings are carried to a pending todo. Replace with the closed
state and a pointer to the new gate-heuristic todo. Leave the `## Badge attribution` table
alone but change which row is marked *(actual)* vs *(counterfactual)* to match reality.

`34.11-REVIEW.md`'s own `status: issues_found` is NOT edited — that is a standing rule of
this ledger and is stated in its own header.

**(3) Sweep the phase folder for stale claims.** `34.11-VERIFICATION.md` carries a row
listing WR-05/06/07/08/09/10/11/16/19 as "Confirmed still open" — every one of those is now
fixed, so that row has been wrong since `260827-t9c`. Correct it to point at
`34.11-REVIEW-FIX.md` as the live ledger rather than restating dispositions that will rot
again. Then `grep -rn "WR-10\|WR-11\|WR-18" .planning/phases/34.11-*/` and fix any other
document still asserting these are open. Do not touch `34.11-VERIFICATION.md`'s
`status: passed` or its 17/17 requirement scoring — those were never in question.

**(4) Resolve the pending todo.** Convention, confirmed from the four most recent entries in
`.planning/todos/completed/`: the date-prefixed filename is PRESERVED, and the frontmatter
gains `status: completed`, `completed: 2026-08-27`, `completed_by: "quick task 260827-vpl"`.
Use `git mv .planning/todos/pending/2026-08-25-phase-34-11-residual-review-warnings.md
.planning/todos/completed/` then edit the frontmatter (`status: pending` -> `completed`) and
append a closing note naming the three dispositions and this task. Do not delete the body.

**(5) Open the routed residual** as a NEW pending todo,
`.planning/todos/pending/2026-08-27-i18n-gate-flags-declaration-site-literals-as-violations.md`.
Frontmatter matching sibling conventions (`created`, `title`, `area: build`,
`severity: low`, `found_by: "Quick task 260827-vpl (WR-18 disposition)"`, `source:` pointing
at `34.11-REVIEW-FIX.md`'s WR-18 row, `files:` `meta/hardcodedStringGate.ts`). Body: the
gate flags i18n key literals and their paired English `defaultText` declarations as
`object-property`/`argument` violations; this affects `facetLabels.ts`, `chipLabels.ts` and
(in the CSS-selector variant) `helpers/gamepad.ts`; `genI18nGateScope.test.ts`'s own comment
names the gate heuristic as the right fix; state explicitly that this is **not** a 34.11
residual and does not hold that phase open. **`resolves_phase:` must be empty** — a phase
number there would re-attach it to 34.11 and undo the routing.

**(6) Commit.** Stage ONLY your own files, by explicit path — a concurrent session shares
this branch, so no `git add -A` and no `gsd-sdk` commit verb (it stages the whole tree).
Do not push.
  </action>

  <verify>
    <automated>grep -c "OPEN" .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md  # inspect every hit; none may be a live disposition</automated>
    <automated>grep -n "^status:\|  fixed:\|  open:\|  invalid:\|  total:" .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/34.11-REVIEW-FIX.md</automated>
    <automated>test ! -f .planning/todos/pending/2026-08-25-phase-34-11-residual-review-warnings.md && test -f .planning/todos/completed/2026-08-25-phase-34-11-residual-review-warnings.md && echo TODO-MOVED-OK</automated>
    <automated>grep -rn "WR-10\|WR-11\|WR-18" .planning/phases/34.11-library-filtering-search-views-collections-and-cross-store-f/ | grep -iv "fixed" | grep -i "open" | wc -l  # MUST be 0</automated>
    <automated>node ~/.vscode/extensions/gsd-phase-status/parse.js 2>/dev/null | grep -i "34.11" || echo "extension not directly invokable -- verify the folder colour by hand instead"</automated>
    <automated>git status --porcelain | grep -v "^ M src/frontend\|^ M meta\|^ M public\|^?? \|^ M .planning\|^R  .planning" | wc -l  # sanity: nothing unexpected staged from the concurrent session</automated>
  </verify>

  <done>
`34.11-REVIEW-FIX.md` frontmatter reads `status: all_fixed` with dispositions re-derived by
counting the table's own rows and summing to the review's original 23, `open: 0`. The three
rows carry their evidence chains. The pending todo is in `completed/` with its filename
preserved and its frontmatter updated. The new gate-heuristic todo exists with an empty
`resolves_phase:`. D-08 in `34.11-CONTEXT.md` carries a dated amendment. No document in the
phase folder still asserts WR-10, WR-11 or WR-18 is open. Everything is committed by
explicit path, nothing pushed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| user data -> zero-state sentence | Collection names and search terms are user-controlled and already flow into `FilterZeroResult`'s body via `{ literal: ... }` specs. |
| repo config -> blocking CI gate | `meta/i18nGateScope.json` / `meta/i18nGateAllowlist.json` govern whether a blocking gate can fail. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vpl-01 | Tampering | `FilterZeroResult` letter label | accept | `alphabetFilterLetter` is drawn from `AlphabetFilter`'s fixed `CHARS` set (`A`-`Z` plus `#`) and can hold no other value; it is not user-authored text. The existing hostile-name injection tests continue to cover the genuinely user-controlled `collection`/`search` specs. |
| T-vpl-02 | Elevation of Privilege | i18n hardcoded-string gate | mitigate | Task 2 is forbidden from editing either pinned config or running the scope generator, and asserts a zero-line diff on both. W1 additionally makes a future double-listing (scope AND allowlist) fail loudly rather than turning into a wall of hard violations. |
| T-vpl-03 | Repudiation | `34.11-REVIEW-FIX.md` ledger | mitigate | Task 3 re-derives dispositions by counting the table's own rows and cross-checks against the review's original 23-finding total; a mismatch stops the task rather than being written through. |
| T-vpl-SC | Tampering | package-manager installs | mitigate | No `npm`/`pnpm add` in this plan. Every library used (`jest`, `i18next`, `scanScope`) is already present. If any task finds itself wanting a new dependency, that is a scope error — stop. |
</threat_model>

<verification>
1. Task 1's six RED proofs are quoted verbatim in the SUMMARY, with B4 recorded as
   green-before-and-after.
2. Task 2's before/after diff of the `genI18nGateScope.test.ts` known-red output is empty.
3. `git diff --stat` over `meta/i18nGateScope.json`, `meta/i18nGateAllowlist.json`,
   `chipLabels.ts`, `facetLabels.ts`, `filterEngine.ts` and `FilterChipRow/index.tsx` is
   zero lines — the two decisions' blast-radius bounds hold.
4. `pnpm lint-translations:gamelib` green.
5. `34.11-REVIEW-FIX.md` arithmetic sums to 23 with `open: 0`.
</verification>

<success_criteria>
- The zero state names the alphabet letter; `Clear all` clears it; hiding the strip clears it.
- A new English literal in `facetLabels.ts` or `chipLabels.ts` fails a blocking gate by name.
- D-08 is amended on the record with its evidence, not silently overridden.
- `34.11-REVIEW-FIX.md` is `all_fixed` with derived arithmetic; the todo is in `completed/`;
  the gate-heuristic residual is a separate, phase-detached todo.
- Nothing pinned was widened, nothing was pushed, and the concurrent session's work is untouched.
</success_criteria>

<output>
Create `.planning/quick/260827-vpl-close-out-phase-34-11-final-three-residu/260827-vpl-SUMMARY.md` when done.
</output>
