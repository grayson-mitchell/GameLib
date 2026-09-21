---
phase: 260921-rmj
plan: 01
subsystem: i18n
tags: [i18next, react-i18next, trans, gamepage, fr-locale, mutation-testing]

requires: []
provides:
  - "public/locales/fr/gamepage.json wikiLink repaired to a well-formed &nbsp; entity and a real French link translation"
  - "wikiLinkTrans.realI18next.test.ts A4 widened to the malformed-entity family, parameterised over de+fr, mutation-proven"
  - "the fr malformed-entity todo closed with a corrected sibling paragraph"
  - "a new, re-measured pending todo for the 15-locale empty-wikiLink condition"
affects: [i18n, gamepage]

tech-stack:
  added: []
  patterns:
    - "Round-trip-verified JSON edit script (read raw bytes -> json.load -> assert re-dump byte-identical -> assert current value matches expected -> mutate -> write) as the safe way to hand-edit a legacy locale catalog"
    - "Mutation-proof a widened test gate by restoring the pre-fix fixture from a scratchpad copy, running the widened assertion alone, and pasting the actual RED output -- not just reporting a final green run"

key-files:
  created:
    - .planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md
  modified:
    - public/locales/fr/gamepage.json
    - src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
    - .planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md (edited in place, then moved to completed/)

key-decisions:
  - "Hand-edited the fr catalog value directly (not a re-namespace into gamelib) -- the gamelib route was evaluated and rejected as disproportionate per M8's three traps, and hand-editing a legacy catalog is settled precedent (474c26c02, a9436fa9d)"
  - "A4 widened to match the malformed &amp;nbsp family via regex, not a second exact-string literal, so future malformed variants (any suffix) are also caught"
  - "A1/A2/A2b/A3 kept German-only; their helpers are German-shaped and generalising them was out of scope and would have broken A2's split logic against French's pre-fix value"
  - "Re-filed the corrected 15-locale finding as its own pending todo before closing the fr todo, rather than editing the finding out of existence, per this repo's recorded lesson that closing a todo on a false title can discard its untested siblings"

requirements-completed: []

duration: ~7min commit-to-commit (d466a141d to cf3493cf3); wall time including full gate runs (pnpm test:ci ~4min) was longer
completed: 2026-09-21
---

# Quick Task 260921-rmj: Fix fr gamepage wikiLink entity Summary

**Repaired the one malformed `&nbsp` + U+202F + `;` entity and untranslated `Open page` link text in
`public/locales/fr/gamepage.json`'s `wikiLink` value, widened the A4 test gate (which was blind to
this exact shape and to French entirely) to the malformed-entity family run over `de`+`fr`, proved
the widened gate by mutation, and re-filed the todo's sibling 15-locale finding with a corrected,
re-measured mechanism before closing it.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 3 (1 catalog, 1 test file, 1 todo edited-then-moved) + 1 new todo created
- **Commits:** 3 task commits (no checkpoints hit; fully autonomous)

## Accomplishments

- French GamePage users now see a real French "Ouvrir la page" link with a correctly-decoded
  non-breaking space, instead of the literal text `&amp;nbsp ;` and an English `Open page` link.
- The A4 test gate, which existed specifically to catch this defect family but could not see the
  French shape (exact-string match, German-only), now catches any `&amp;nbsp` variant across both
  `de` and `fr`, proven RED-then-GREEN by an executed mutation.
- A wrong claim in the todo record ("15 locales have no wikiLink key") was re-measured and
  corrected before being re-filed, rather than carried forward or silently dropped.

## Task Commits

1. **Task A: Repair the fr wikiLink value, verified by a real render** - `d466a141d` (fix)
2. **Task B: Widen A4 to the malformed-entity family AND to French, mutation-proven** - `35a901521` (test)
3. **Task C: Re-file the corrected sibling finding, then close the todo** - `cf3493cf3` (docs)

**Plan metadata (PLAN.md, SUMMARY.md, STATE.md):** committed separately by the orchestrator, not by
this executor, per the plan's constraints.

## Files Created/Modified

- `public/locales/fr/gamepage.json` - `wikiLink` value repaired (one line changed, `git diff --cached --numstat` confirmed `1  1`)
- `src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts` - A4 widened to `it.each(['de','fr'])` with a family regex; header comment updated; A1/A2/A2b/A3 unchanged in meaning
- `.planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md` - new, corrected sibling finding (created)
- `.planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md` - edited in place (corrected paragraph + closing note), then moved via plain `mv` + `git add` to `.planning/todos/completed/`

## The three reasons for the three changes to the `fr` value

1. **`&nbsp` + U+202F + `;` → well-formed `&nbsp;`.** The original value carried a literal `&nbsp`,
   then a NARROW NO-BREAK SPACE (U+202F), then a bare `;` -- not a well-formed HTML entity, so
   `shouldUnescape` had nothing to decode. Removing the stray U+202F and the ordinary space that
   preceded it, and closing the entity with `;` directly, makes the value structurally identical
   to `en`/`de`/`es`/`it` (`…:&nbsp;<1>`) and gives `shouldUnescape` a real entity to decode.
2. **`Open page` → `Ouvrir la page`.** The link text was still untranslated English. Replaced with
   the French translation, consistent with the sibling catalogs' pattern (`de` = `Öffne Seite`,
   `es` = `Abrir página`, `it` = `Apri la pagina`).
3. **The U+00A0 immediately before the colon (`ceci :`) was deliberately LEFT UNCHANGED.** A
   non-breaking space before a colon is standard, correct French typography. It was explicitly
   named in both the todo and the plan as NOT part of the defect -- normalizing it away would have
   been a regression against correct French style, not a fix. It is still present in the render
   evidence below (`ceci<U+00A0>:`).

## Codepoint-explicit French render (Task A verification)

Rendered the reconstructed production `<Trans i18nKey="wikiLink" ns="gamepage" shouldUnescape>`
through a real i18next instance with `lng: 'fr'`, via a temporary probe test (deleted immediately
after, confirmed by `git status --porcelain src/` returning empty):

```
FR_RENDER_PROBE: Information importante au sujet de ce jeu, lisez ceci<U+00A0>:  <a href="https://example.invalid">Ouvrir la page</a>
```

All three PASS conditions held simultaneously:
1. Contains `Ouvrir la page` -- YES.
2. Contains no `&amp;nbsp` in any form -- YES (the entity decoded to an ordinary space, per the
   `shouldUnescape` trade recorded in the file's own header comment -- visible above as the two
   spaces between `:` and `<a>`: the preserved U+00A0 before the colon, then the decoded U+0020
   from `&nbsp;`).
3. Still carries `<U+00A0>` immediately before the colon -- YES.

Blast radius, confirmed after staging:
```
$ git diff --cached --numstat -- public/locales/fr/gamepage.json
1	1	public/locales/fr/gamepage.json
$ git status --porcelain -- public/locales
M  public/locales/fr/gamepage.json
```

## Mutation proof's actual RED output (Task B)

Step 1 (GREEN, against the repaired catalog) -- all 6 tests passed, both `de` and `fr` visible as
separately-named A4 cases:

```
✓ A1: the source writes exactly one Trans tag with i18nKey and ns (shouldUnescape extracted, not asserted here)
✓ A2: that (i18nKey, ns) pair resolves to the real German catalog text
✓ A2b: the catalog's <1> child maps onto the element at index 1 (the link)
✓ A3: the reconstructed element does NOT fall back to its English sentinel children
✓ A4: the rendered markup contains no &amp;nbsp mojibake (locale: de)
✓ A4: the rendered markup contains no &amp;nbsp mojibake (locale: fr)
Tests: 6 passed, 6 total
```

Step 2-3 (RED, against the malformed pre-fix value restored from `$SCRATCH/fr-gamepage.PRE.json`
via `cp`, never `git checkout --` or `git stash`) -- actual jest output:

```
FAIL Frontend src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts
  GamePage wikiLink <Trans> against a REAL i18next instance (260921-k2d)
    ✓ A1: the source writes exactly one Trans tag with i18nKey and ns (shouldUnescape extracted, not asserted here)
    ✓ A2: that (i18nKey, ns) pair resolves to the real German catalog text (6 ms)
    ✓ A2b: the catalog's <1> child maps onto the element at index 1 (the link) (2 ms)
    ✓ A3: the reconstructed element does NOT fall back to its English sentinel children (1 ms)
    ✓ A4: the rendered markup contains no &amp;nbsp mojibake (locale: de) (1 ms)
    ✕ A4: the rendered markup contains no &amp;nbsp mojibake (locale: fr) (1 ms)

  ● GamePage wikiLink <Trans> against a REAL i18next instance (260921-k2d) › A4: the rendered markup contains no &amp;nbsp mojibake (locale: fr)

    expect(received).not.toMatch(expected)

    Expected pattern: not /&amp;nbsp/
    Received string:      "Information importante au sujet de ce jeu, lisez ceci : &amp;nbsp ;<a href=\"https://example.invalid\">Open page</a>"

      298 |       const markup = renderReconstructed(instance)
      299 |
    > 300 |       expect(markup).not.toMatch(/&amp;nbsp/)
          |                          ^
      301 |     }
      302 |   )
      303 | })

Test Suites: 1 failed, 1 total
Tests:       1 failed, 5 passed, 6 total
```

The received markup shows exactly the defect the gate was widened to catch: `&amp;nbsp ;` (escaped,
malformed) and `Open page` (still English), against `de` staying green because it was never the
locale carrying the defect.

Steps 4-5 (GREEN again, catalog restored from `$SCRATCH/fr-gamepage.POST.json` via `cp`) --
identical to step 1's output: all 6 tests passed, both `de` and `fr` cases green.

Step 6 (tree parity check): `git status --porcelain -- public/locales` returned empty -- the
restored working-tree content is byte-identical to what was already staged from Task A. No re-`add`
was needed.

## Re-run census buckets (Task C)

Re-measured independently with a fresh Python sweep over all 49 `public/locales/*` directories,
bucketing each `gamepage.json` by its `wikiLink` field:

```
total locale dirs: 49

wikiLink KEY ABSENT:            0 locales
wikiLink PRESENT but empty:    15 locales  (az bs eu fa he hr ka ko ml ro sk sr th uz zh_Hant)
no gamepage.json FILE:          2 locales  (br sl)
wikiLink PRESENT and non-empty:32 locales
sum: 49
```

This reproduces M9's numbers exactly -- no discrepancy found, so the plan's measured facts were
used as-is. The new todo's frontmatter carries `severity: minor` / `platform: any` / `ready: human`
in that order, matching the buckets above.

## Deviations from Plan

**This section originally read "None". That was wrong, and the orchestrator caught it on review.**
Corrected below; the rest of this summary is left as the executor wrote it, so the record shows
what was claimed at the time.

**DEVIATION: plan Task A change (1) was only half-applied.** The plan required the value to become
`ceci :&nbsp;<1>` -- removing BOTH the `U+202F` AND "the ordinary space that preceded the
broken entity", making it structurally identical to `en`/`de`/`es`/`it` (plan M3). Commit
`d466a141d` removed the `U+202F` and translated the link text but LEFT the ordinary space, so the
value shipped as `ceci : &nbsp;<1>`. Since `shouldUnescape` decodes the entity to a second
`U+0020`, French rendered a visible DOUBLE space after the colon.

The Task A render evidence at line 104 of this summary shows it directly -- `ceci<U+00A0>:  <a`,
two spaces -- and was recorded as a PASS anyway, because all three stated PASS conditions
(contains `Ouvrir la page` / no `&amp;nbsp` / `U+00A0` retained) are silent about spacing.

**Fixed in `1fbbbcf2c`**, which also adds **A5** next to A4 over the same `['de', 'fr']` set,
asserting the rendered markup carries no doubled whitespace. A5 was mutation-proven, not reasoned:
restoring `d466a141d`'s value turns A5/fr RED --

```
  ✕ A5: the rendered markup has no doubled whitespace (locale: fr)
    Expected pattern: not /\s{2}/
    Received string:  "Information importante au sujet de ce jeu, lisez ceci :  <a href=\"https://example.invalid\">Ouvrir la page</a>"
```

-- while A4 and A1-A3 stay green, which is the demonstration that A4 could not have caught this.
Restoring the fix returns 8/8.

Post-fix render, independently re-measured:

```
en: Important information about this game, read this: <a …>Open page</a>
fr: Information importante au sujet de ce jeu, lisez ceci<U+00A0>: <a …>Ouvrir la page</a>
```

One space in both. The `U+00A0` before the French colon is untouched and remains the single
deliberate structural difference from the other locales.

**Gate re-run after the fix:** Frontend 167 suites / **2658** tests (+2 from A5's two cases);
`pnpm codecheck` clean; `pnpm lint` exit 0 with **638 warnings, unchanged** from before the edit;
`pnpm lint-translations` 0 hard failures; `pnpm i18n-churn-guard` clean on a staged tree.

**One lint error was introduced and fixed during this follow-up:** the first draft of A5's comment
embedded two literal `U+00A0` characters (from pasting the value rather than writing the escape),
tripping `no-irregular-whitespace` -- `pnpm lint` exit 1, "2 error(s) in the tests scope". Replaced
with the escape text ` `. Worth recording because `pnpm codecheck` (`tsc --noEmit`) is blind
to it and the jest run was green throughout; only `pnpm lint` saw it.

## Gate Results

| Gate | Result |
|------|--------|
| `npx jest --selectProjects Frontend --runInBand src/frontend/screens/Game/GamePage/__tests__/wikiLinkTrans.realI18next.test.ts` | PASS -- 6/6, both de and fr A4 cases green |
| `npx jest --selectProjects Frontend --runInBand` (full project) | PASS -- 167 suites, 2656 tests |
| `pnpm codecheck` | PASS -- no output, exit 0 |
| `pnpm test:ci` | 1 FAILING SUITE, pre-existing and unrelated (see below) -- 438/439 suites, 8853/8856 tests passed |
| `pnpm lint` | PASS -- exit 0, no new warnings introduced against the existing ceilings |
| `pnpm lint-translations` | PASS -- `7450 findings, 0 hard failures` (per M10, this is a warnings-only run for the `gamepage` namespace; it does not cover the empty-value condition and this summary does not claim that it does) |
| `pnpm i18n-churn-guard` | PASS -- `clean -- no upstream public/locales/ catalog changed` (staged tree) |
| `pnpm planning-gates` | PASS -- 11/11 gates, including the new todo's frontmatter and the UAT-visibility gate |

### Pre-existing, unrelated `pnpm test:ci` failure (not fixed, not absorbed)

`meta/__tests__/genI18nGateScope.test.ts` › `A-17 ANTI-ROT: the committed meta/i18nForkTouchedFiles.json
equals the LIVE git derivation` fails because `src/frontend/screens/Settings/components/SettingsModal/index.tsx`
was touched by commit `5d220d1cd` ("fix(quick-260921-nub): delete dead SettingsModal.scss and
Dialog__input className") without that commit updating the checked-in `meta/i18nForkTouchedFiles.json`
snapshot. Verified `5d220d1cd` is an ancestor of this task's baseline (`git merge-base --is-ancestor
5d220d1cd 1e5948c50` succeeded) -- `1e5948c50` is the commit immediately preceding this task's first
commit (`d466a141d`). This task never touched `SettingsModal/index.tsx` or
`meta/i18nForkTouchedFiles.json`, and per the plan's constraints this gate is not in scope for this
task's `<verification>` table, so it was named and left as-is rather than fixed or the gate widened.

## Self-Check

```
$ [ -f public/locales/fr/gamepage.json ] && echo FOUND
FOUND
$ git log --oneline --all | grep -q d466a141d && echo FOUND
FOUND
$ git log --oneline --all | grep -q 35a901521 && echo FOUND
FOUND
$ git log --oneline --all | grep -q cf3493cf3 && echo FOUND
FOUND
$ [ -f .planning/todos/pending/2026-09-21-fifteen-locales-carry-an-empty-wikilink-value.md ] && echo FOUND
FOUND
$ [ -f .planning/todos/completed/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md ] && echo FOUND
FOUND
$ [ -f .planning/todos/pending/2026-09-20-fr-gamepage-wikilink-catalog-entity-is-malformed.md ] && echo FOUND || echo MISSING (expected)
MISSING (expected)
```

## Self-Check: PASSED
