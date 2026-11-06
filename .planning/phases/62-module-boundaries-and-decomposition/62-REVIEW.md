---
phase: 62-module-boundaries-and-decomposition
reviewed: 2026-11-07T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - meta/__tests__/runnerLiteralSelectors.test.ts
  - meta/runnerLiteralSelectors.cjs
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/utils.ts
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx
  - src/frontend/components/UI/NavShell/components/FilterStoreFacet/index.tsx
  - src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts
  - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 62: Code Review Report (gap-closure re-review, 62-22 / 62-23)

> The original full-phase review (96 files) is in git history at the commit before this one (`bf3dbc032`, `docs(62): add code review report and file WR-02 selector-coverage todo`). WR-02 from that review is the finding 62-23 closed.

**Reviewed:** 2026-11-07
**Depth:** standard (scoped to `git diff ff35ff124..HEAD` over the listed files)
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This re-review covers three changes: the widened runner-literal selector (62-23), the seven store-literal comparisons converted to `isStore` (62-23), and the redundant `as string[]` cast removed from `games.test.ts` (62-22).

**Converted sites keep their behaviour.** `isStore(subject, store)` with a string or `undefined` subject returns `false` for `null`/`undefined` and `subject === store` otherwise. So `isStore(library, 'gog') || !library` in `clearCache` (`src/backend/utils.ts:455,461,476`) gives the same truth table as `library === 'gog' || !library`, including the `undefined` "clear everything" path. The four `'sideload'` label sites (FilterStoreFacet:73, FilterFocusRow:136, FocusRowStrip:228, chipLabels:85) still return the `storeOther` / "Other" label for `sideload` and do the `RunnerToStore` lookup otherwise.

`isStore`'s string overload returns plain `boolean`, so the `else` branch no longer narrows `value` away from `'sideload'`. That has no effect today because `RunnerToStore` is `Record<string, string>`, and chipLabels still guards against `undefined`.

**The removed cast is safe.** `readdirSync(path)` with no options resolves to the `string[]` overload through the typed `requireActual`.

**Verification run during review:**
- The selector suite passes 53/53.
- `eslint` over the five converted source files reports 0 errors.

**The selector change is correct for every WR-02 shape it targets.** I probed it with extra AST shapes beyond the test table and found two defects:
- **False positive:** the switch gate (and the existing `:has(Literal…)` gates) search descendants, so a store-literal `case` in a nested inner switch flags an outer switch that compares no store literal.
- **Overstated coverage:** the header says casts and non-null assertions are "seen through", but composed forms (`(game?.runner as string)`, `(runner as Runner)!`, `(['gog'] as const).includes(runner)`) are missed. They are also absent from the "Known blind spots" list, which recreates the overstated-coverage problem WR-02 was about, on a smaller scale.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: The switch gate's `:has` searches descendants, so a nested switch's store-literal case flags an unrelated outer switch

**File:** `meta/runnerLiteralSelectors.cjs:110` (also the existing `:has(Literal…)` in the `includes`/`indexOf` and `Set.has` arms, lines 116 and 122)

**Issue:** esquery's `:has(X)` matches any descendant, not just direct `cases`. The header (and the 62-23 decision) says the switch arm needs "at least one store-literal `case`", so that `switch (value) { case 'a': }` is not flagged. The gate does not hold once switches nest. Probed against the shipped `SELECTORS`:

```
1  switch (value) { case 'a': switch (x) { case 'steam': break } }   <- false positive (outer)
1  switch (kind)  { case 'a': switch (runner) { case 'steam': break } } <- correct hit, inner
```

The first line is an error-level hit on a generic `value` switch whose own cases are not store literals. Now that `value` and `library` are in `RUNNER_NAME`, this is far more likely than when only `runner`/`store` matched. The array/Set arms have the same looseness: `:has(Literal[value=…])` also scans the call's arguments. For example, `['a','b'].includes(runner, 'steam'.length)` hits even though the array holds no store literal.

**Fix:** Scope the gate to direct children. Child-relative `:has` works with the ESLint/esquery in this repo (verified: the nested case drops to 0 and `switch (runner) { case 'gog': }` still hits):

```js
{
  selector: `SwitchStatement${nameSide('discriminant')}:has(> SwitchCase[test.value=${LITERAL_RE}])`,
  message: MESSAGE
},
// array arms: look only inside the receiver array
"CallExpression[callee.property.name=/^(includes|indexOf)$/][callee.object.type='ArrayExpression']" +
  `${nameSide('arguments.0')}:has(> MemberExpression.callee > ArrayExpression.object > Literal[value=${LITERAL_RE}])`
```

Add `"switch (value) { case 'a': switch (x) { case 'steam': break } }"` to the NON-HIT table so the gate is pinned.

### WR-02: The header says casts and non-null assertions are "seen through", but composed forms are missed and missing from "Known blind spots"

**File:** `meta/runnerLiteralSelectors.cjs:20-26,37-42,85-99`

**Issue:** `nameSide` adds `.expression.name` and `.expression.property.name`, which see through exactly one wrapper level. These shapes return 0 hits against the shipped `SELECTORS`:

```
0  const a = (game?.runner as string) === 'steam'   // TSAsExpression > ChainExpression > MemberExpression
0  const a = (game?.runner)! === 'steam'            // TSNonNullExpression > ChainExpression
0  const a = (runner as Runner)! === 'steam'        // TSNonNull > TSAs > Identifier
0  const a = (['gog'] as const).includes(runner)    // callee.object is TSAsExpression, not ArrayExpression
0  const a = ['steam'].lastIndexOf(runner)
```

`as const` on an inline tuple is idiomatic TypeScript (this repo already writes `['legendary', 'gog', 'nile'] as const` in `src/frontend/screens/Login/index.tsx:56`). The header claims "Also seen through … a cast (`(runner as string)`) and a non-null (`runner!`)" and the blind-spot list was added "so a zero count is read correctly". Neither mentions these forms, so a reader will think casts are covered when only the single-wrapper form is. No current source site uses these shapes (lint is 0 and a grep found none), so this is a coverage and documentation defect, not a live miss.

**Fix:** Either cover the forms or document them. Covering them is cheap:
- Add arms for `${f}.expression.expression.property.name`, `${f}.expression.expression.name` and `${f}.expression.expression.property.value`.
- Accept `callee.object.type=/^(ArrayExpression|TSAsExpression)$/` with `callee.object.expression.type='ArrayExpression'`.
- Add `lastIndexOf` to the method regex.

Then add HIT cases for each shape. If you leave any uncovered, list it in "Known blind spots" next to `Object.is`/`startsWith`.

## Info

### IN-01: `value` and `.value` are now matched everywhere, so any future `<select>`/option comparison against a store-named literal will error

**File:** `meta/runnerLiteralSelectors.cjs:71`

**Issue:** `^(…|value)$` combined with the `.property.name` arm matches `e.target.value`, `option.value`, `setting.value`, `myStore.value`, and so on. The literal-side requirement limits hits to the six store names, but some non-identity UI uses those names. One example is a Humble key-platform `<select>` whose option value is `'steam'`: it would now trip an error-level rule with a message telling the author to use `isStore`, which would be the wrong fix there. The same applies to the `^(runner|store)[A-Z0-9_]` prefix, which matches `storeUrl`, `storePage` and `store_id`. Lint is 0 today, so this is a forward-looking cost of the 62-23 decision, not a current false positive.

**Fix:** Nothing is needed now. When the first legitimate case appears, add it to `NAME_DENYLIST` with its one-line reason (the mechanism already exists), rather than adding an `eslint-disable`.

### IN-02: New `isStore` imports are appended after side-effect stylesheet imports

**File:** `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx:17`, `src/frontend/screens/Library/components/FocusRowStrip/index.tsx:36`

**Issue:** `import { isStore } from 'common/storeCapabilities'` was placed after `import './index.scss'` / `import './index.css'`. In FilterStoreFacet and chipLabels it was appended at the end of the import block. Nothing depends on the order, but in these two files a module import now follows the stylesheet import, unlike the rest of the block.

**Fix:** Move the import up with the other module imports, above the stylesheet import.

---

_Reviewed: 2026-11-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
