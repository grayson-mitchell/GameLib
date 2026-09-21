---
quick_id: 260921-k2d
subsystem: i18n
tags: [react-i18next, trans, gamepage, real-i18next-test]
key-files:
  created:
    - src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
    - .planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md
  modified:
    - src/frontend/screens/Game/GamePage/index.tsx
    - .planning/todos/completed/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md (moved from pending/, corrected)
key-decisions:
  - "Accepted the U+00A0 -> U+0020 trade: shouldUnescape decodes &nbsp; to an ordinary space, not a true non-breaking space, in English too. Stated as a trade in code comment, todo, and here -- not an oversight."
  - "Confirmed the plan's REPO_ROOT depth warning: six '..' segments from GamePage/__tests__/, not the sibling's eight."
  - "Did not assert shouldUnescape's presence as a source token in A1 -- only its rendered consequence via A4, per orchestrator decision 3."
duration: ~40min
completed: 2026-09-21
---

# Quick Task 260921-k2d: flip GamePage's wikiLink `key=` to `i18nKey=` + `ns` + `shouldUnescape` Summary

**GamePage's wikiLink `<Trans>` used React's reserved `key` prop instead of `i18nKey`, orphaning 31 non-English translations; fixed with a three-attribute change (`i18nKey`, `ns="gamepage"`, `shouldUnescape`) proven against a real i18next engine and the real catalogs, with the naive two-attribute version confirmed as a visible-mojibake regression via a fourth assertion (A4) that the sibling task did not need.**

## What was built

- `src/frontend/screens/Game/GamePage/index.tsx:452` now writes
  `<Trans i18n={i18n} i18nKey="wikiLink" ns="gamepage" shouldUnescape>`, with a four-point
  explanatory comment above it naming the reserved-prop mechanism, the `ns`/`defaultNS`
  mismatch, the `shouldUnescape` requirement, and the accepted `U+00A0` → `U+0020` trade.
- `src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts` (new): five
  assertions (A1, A2, A2b, A3, A4) rendering a reconstructed `<Trans>` element -- built from
  attributes extracted out of the production source -- through a real `createInstance()` +
  `i18next-fs-backend` against the real `public/locales` catalogs.
- `.planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md` (new):
  files the French catalog's malformed `&nbsp` entity + untranslated link text, which
  `shouldUnescape` cannot fix and which this task is scoped out of repairing.
- `.planning/todos/completed/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md`: the
  original todo, corrected (its "probably a genuine one-line fix" claim was half wrong) and
  moved from `pending/` to `completed/`.

## Lint baseline

Measured at HEAD `a225e59fe` (untouched tree, before any edit): **SRC 1119 problems, TESTS 638
problems**, exit code 0, `production: PASS | tests: PASS`. This matches (independently
re-measured, not carried forward as an assumption) the sibling task's 1119/638.

Measured again after all four tasks, at the tree's final state: **SRC 1119 problems, TESTS 638
problems**, exit code 0, `production: PASS | tests: PASS`. Identical to baseline; neither ceiling
raised.

## Non-negotiable verification: the three negative controls, actual red text quoted

All three were run for real by editing the source, running the test, reading the failure text,
then restoring via `cp` from a scratchpad copy of the fixed file (never `git checkout --`).

**Control A — `i18nKey="wikiLink"` reverted to `key="wikiLink"`:**

```
FAIL Frontend src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
  ● Test suite failed to run

    extractTransAttributes: no i18nKey attribute found on the Trans tag -- the source is still
    writing React's reserved "key" prop (or some other attribute) instead of "i18nKey", so Trans
    has nothing to resolve and falls through to its English children.
```

A1's named extractor throw, as required. Restored, re-ran, confirmed 5/5 green before continuing.

**Control B — `ns="gamepage"` changed to `ns="gamelib"`:**

```
FAIL Frontend src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
    ✓ A1: the source writes exactly one Trans tag with i18nKey and ns (shouldUnescape extracted, not asserted here)
    ✕ A2: that (i18nKey, ns) pair resolves to the real German catalog text
    ✕ A2b: the catalog's <1> child maps onto the element at index 1 (the link)
    ✕ A3: the reconstructed element does NOT fall back to its English sentinel children
    ✓ A4: the rendered markup contains no escaped &amp;nbsp; entity mojibake

  ● A3: the reconstructed element does NOT fall back to its English sentinel children

    expect(received).not.toContain(expected) // indexOf
    Expected substring: not "__K2D_ENGLISH_TEXT_MUST_NOT_RENDER__"
    Received string:        "__K2D_ENGLISH_TEXT_MUST_NOT_RENDER__<a href=\"https://example.invalid\">__K2D_ENGLISH_LINK_MUST_NOT_RENDER__</a>"

  ● A2 / A2b:
    getNestedCatalogValue: path "wikiLink" did not resolve to a string inside gamelib.json. If
    this happened while running the wrong-ns negative control, this is expected -- read the A3
    (sentinel) assertion's failure instead, not this one.
```

A3 red with both sentinels appearing in the markup (load-bearing signal, as the plan specified),
A2/A2b red with the named catalog-miss diagnostic (secondary signal). Restored, re-ran, confirmed
5/5 green.

**Control C — `shouldUnescape` removed entirely:**

```
FAIL Frontend src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
    ✓ A1: the source writes exactly one Trans tag with i18nKey and ns (shouldUnescape extracted, not asserted here)
    ✓ A2: that (i18nKey, ns) pair resolves to the real German catalog text
    ✓ A2b: the catalog's <1> child maps onto the element at index 1 (the link)
    ✓ A3: the reconstructed element does NOT fall back to its English sentinel children
    ✕ A4: the rendered markup contains no escaped &amp;nbsp; entity mojibake

  ● A4: the rendered markup contains no escaped &amp;nbsp; entity mojibake

    expect(received).not.toContain(expected) // indexOf
    Expected substring: not "&amp;nbsp;"
    Received string:        "Wichtige Informationen zu diesem Spiel, bitte lies dies:&amp;nbsp;<a href=\"https://example.invalid\">Öffne Seite</a>"
```

A4 red on the literal `&amp;nbsp;` mojibake, **while A1/A2/A2b/A3 stayed green** -- exactly the
asymmetry the plan calls out as the entire point of A4: the two-attribute fix looks correct on
every other axis, and only the rendered-entity assertion catches the dropped flag. Restored,
re-ran, confirmed 5/5 green.

After all three controls, `git diff` on `GamePage/index.tsx` showed only the intended
three-attribute change plus the explanatory comment -- no stray whitespace, no reverted control
left behind.

## The accepted trade, stated as a trade

`shouldUnescape` decodes the catalog's literal `&nbsp;` entity to an ordinary space (`U+0020`),
**not** a true non-breaking space (`U+00A0`). The original JSX `&nbsp;` in the English fallback
children compiled to a real `U+00A0`; that same `<Trans>` element now renders its English fallback
through the identical `shouldUnescape` path once `ns`/`i18nKey` resolve correctly for `en`, so the
downgrade applies in English too. This is deliberate: the alternative was either 31 dead
translations (defect as filed) or visible `&nbsp;` mojibake across ~31 locales (the naive
two-attribute fix). Recorded in the code comment above the fixed `<Trans>`, in the corrected
original todo, and here.

## Honest limitation of the test

The test renders a **reconstructed** element -- built from the `(i18nKey, ns, shouldUnescape)`
triple read out of the production source at runtime, with sentinel text/link children substituted
for the real English fallback and a plain `<a>` standing in for the real react-router `<Link>`
(which would need a Router context this DOM-free Frontend jest project cannot supply; no
`jest-environment-jsdom` or `react-test-renderer` is installed). It pins that triple as written in
source, proves it resolves to real non-English catalog text through the real i18next engine, maps
the catalog's `<1>` marker onto child index 1, and proves the entity decodes. It is **not** a full
component render of `GamePage`. This limitation is stated in the test file's header comment.

## French catalog damage: filed, not fixed

`.planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md` records
that `public/locales/fr/gamepage.json`'s `wikiLink` value is
`Information importante au sujet de ce jeu, lisez ceci<U+00A0>: &nbsp<U+202F>;<1>Open page</1>` --
a malformed entity (`&nbsp` + narrow no-break space `U+202F` + `;`, not a well-formed `&nbsp;`)
that `shouldUnescape` cannot decode, so French still renders a visible `&amp;nbsp ;` after this
fix, plus an untranslated link text (`Open page`). This task did not and could not repair it --
`REQ-34.8-04` forbids hand-editing `public/locales/`. `severity: medium`, `platform: any`,
`ready: human` (needs both a French translation and a decision on repair route).

**The 15 locales with no `wikiLink` key at all** (`az`, `bs`, `eu`, `fa`, `he`, `hr`, `ka`, `ko`,
`ml`, `ro`, `sk`, `sr`, `th`, `uz`, `zh_Hant`) were left alone on purpose -- a separate,
pre-existing, deliberately-untouched condition, not conflated with the `fr` malformed-entity
defect.

## Full verification results (Task 4)

- `npx jest --selectProjects Frontend --runInBand`: **169 test suites passed, 2668 tests passed**,
  0 failures (includes the new test file).
- `pnpm codecheck`: exit 0, no output (clean).
- `pnpm lint`: SRC 1119 / TESTS 638, exit 0 -- identical to the Task 1 baseline.
- `git status --porcelain public/locales/`: empty.
- `pnpm i18n-churn-guard`: "clean -- no upstream public/locales/ catalog changed."
- `pnpm lint-translations`: "7450 findings, 0 hard failures" (pre-existing findings are the
  expected passing state).
- `pnpm planning-gates`: 11/11 passed.
- `git show HEAD:.planning/todos/completed/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md`:
  confirmed the corrected body (three-attribute correction, trade, cross-references) is present
  in the committed content, not stale HEAD-at-move content.
- `graphify update .`: ran after the code change per CLAUDE.md; `graphify-out/` remained
  gitignored (`git status --short` unaffected).

## Commits

- `5a51f1378` -- `test(quick-260921-k2d): add failing real-i18next assertion for the wikiLink Trans`
- `cb96dd4b4` -- `feat(quick-260921-k2d): flip wikiLink Trans to i18nKey, ns="gamepage" and shouldUnescape`
- `829b63a48` -- `docs(quick-260921-k2d): close the wikiLink todo and file the fr catalog damage`

## Deviations from Plan

**One self-corrected authoring mistake, fixed before any test run or commit (Rule 1 - Bug):**
while applying Task 2's edit, an intermediate `Edit` call briefly left both the old `key="wikiLink"`
and the new `i18nKey="wikiLink"` on the same `<Trans>` tag (an editing slip, not a plan
deviation). Caught immediately by inspection before running any test or committing; corrected in
a second `Edit` call to the intended single-`key`-removed form before any verification ran. No
commit was made with the erroneous intermediate state; git history reflects only the correct
three-attribute form.

No other deviations. Plan executed as written, including the orchestrator's three decisions
(accepted trade confirmed, REPO_ROOT depth verified at six segments, `shouldUnescape` not
asserted as a source token in A1).

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced.

## Threat Flags

None. This task added no new dependency, network call, credential, or user-input boundary. The
plan's threat model rows (T-k2d-SC, T-k2d-01, T-k2d-02) cover the actual surface touched; no
additional surface was introduced beyond what they describe.

## Self-Check: PASSED

- FOUND: `src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts`
- FOUND: `.planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md`
- FOUND: `.planning/todos/completed/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md`
- CONFIRMED ABSENT: `.planning/todos/pending/2026-09-19-gamepage-wikilink-trans-uses-key-not-i18nkey.md`
- FOUND: `src/frontend/screens/Game/GamePage/index.tsx`
- FOUND: `.planning/quick/260921-k2d-fix-gamepage-wikilink-trans-key-to-i18nk/260921-k2d-SUMMARY.md`
- FOUND commit: `5a51f1378`
- FOUND commit: `cb96dd4b4`
- FOUND commit: `829b63a48`
