---
phase: 62-module-boundaries-and-decomposition
fixed_at: 2026-11-11T00:00:00Z
review_path: .planning/phases/62-module-boundaries-and-decomposition/62-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 62: Code Review Fix Report

**Fixed at:** 2026-11-11
**Source review:** .planning/phases/62-module-boundaries-and-decomposition/62-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (fix_scope: all)
- Fixed: 4 (3 by commit, 1 resolved with no change required)
- Skipped: 0

WR-01 and WR-02 were fixed by an earlier critical_warning pass (commits `3d463c1c1`, `dfbf682e7`); both commits were confirmed still present in `git log` on `main` and their entries are carried forward here unchanged. IN-01 and IN-02 were handled in this pass.

Edits were made in the main checkout (`workflow.use_worktrees` is `false`), so no worktree, temp branch or recovery sentinel was created.

## Fixed Issues

### WR-01: The switch gate's `:has` searches descendants, so a nested switch's store-literal case flags an unrelated outer switch

**Files modified:** `meta/runnerLiteralSelectors.cjs`, `meta/__tests__/runnerLiteralSelectors.test.ts`
**Commit:** 3d463c1c1
**Status:** fixed (selector logic; the NON-HIT and HIT cases pin it, but a human should confirm the gate semantics)
**Applied fix:**
- The switch arm now gates on `:has(> SwitchCase[test.value=...])`, so only the switch's own cases count.
- The array arm and the `new Set([...]).has(...)` arm now require the literal to be an element of the receiver array.
- Adaptation from the review's suggestion: esquery 1.6 returns no matches for a multi-step relative `:has(> A > B)` (the review's suggested `:has(> MemberExpression.callee > ArrayExpression.object > Literal[...])` matches nothing). The chains are expressed as nested single-step `:has(> X)` instead, with a comment on `LITERAL_CHILD` explaining why.
- Tests added. NON-HIT: `switch (value) { case 'a': switch (x) { case 'steam': break } }`, `['a','b'].includes(runner, 'steam'.length)`, `new Set(['a']).has(runner, 'steam')`. HIT: the inner switch of a nested pair.
- Header text updated to state the direct-case and receiver-element scoping.

### WR-02: The header says casts and non-null assertions are "seen through", but composed forms are missed and missing from "Known blind spots"

**Files modified:** `meta/runnerLiteralSelectors.cjs`, `meta/__tests__/runnerLiteralSelectors.test.ts`
**Commit:** dfbf682e7
**Status:** fixed (selector logic; covered by new HIT cases)
**Applied fix:**
- Chose to cover the forms rather than only document them.
- `nameSide` is now generated for up to `WRAP_DEPTH = 3` nested `.expression` wrappers (`as`, `satisfies`, non-null, optional chain), replacing the hand-written one-level arms.
- The includes/indexOf arm accepts `lastIndexOf` and an `as const` / `satisfies`-wrapped array receiver, and no longer needs the `callee.object.type='ArrayExpression'` gate.
- HIT cases added for every shape the review listed: `(game?.runner as string)`, `(game?.runner)!`, `(runner as Runner)!`, `(['gog'] as const).includes(runner)` and `['steam'].lastIndexOf(runner)`. Also added: `(game?.runner as string)!`, `satisfies` on both operand and array, an `as const` `indexOf` with a wrapped argument, and `includes(runner!)`. Two NON-HIT guards cover the cast receiver and `lastIndexOf` without a store literal.
- Header updated so its claims match the selectors. "Known blind spots" now lists: a wrapper nested deeper than `WRAP_DEPTH`, a `Set` built from a cast array (`new Set([..] as const)`), and an optional call (`[..].includes?.(runner)`).

### IN-01: `value` and `.value` are now matched everywhere, so any future `<select>`/option comparison against a store-named literal will error

**Files modified:** none
**Commit:** none (resolved, no change required)
**Applied fix:** None. The review's own prescribed fix is "Nothing is needed now": the finding is a forward-looking cost, not a live false positive. Both preconditions were confirmed in this pass:
- `NAME_DENYLIST` exists in `meta/runnerLiteralSelectors.cjs` (declared at line 85, consumed via `DENY_RE` at line 93, exported at line 177), currently an empty frozen array, so the escape hatch for the first legitimate case is in place.
- `pnpm lint:src` reports 0 errors (cold, after deleting `.eslintcache-src`), so there is no live runner-literal hit and nothing to denylist. The rule is error-level, so any hit would have shown as an error.

When a legitimate case appears (for example a key-platform `<select>` whose option value is `'steam'`), add it to `NAME_DENYLIST` with a one-line reason rather than an `eslint-disable`.

### IN-02: New `isStore` imports are appended after side-effect stylesheet imports

**Files modified:** `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx`, `src/frontend/screens/Library/components/FocusRowStrip/index.tsx`
**Commit:** 178b5e96b
**Applied fix:** Moved `import { isStore } from 'common/storeCapabilities'` above the stylesheet import in both files, directly after the existing `common/types` import so it sits with the other module imports. Import-order-only change; no logic touched.

## Verification

Ran in the main checkout (not a worktree), so the numbers are reproducible from the tree.

- `npx prettier --check` over exactly the two IN-02 tsx files: clean.
- `npx eslint --no-cache` over the two IN-02 files: 0 errors (one pre-existing `import-x/no-named-as-default-member` warning at `FocusRowStrip/index.tsx:292`, unrelated to this change).
- `pnpm exec jest meta/__tests__/runnerLiteralSelectors.test.ts`: 69/69 pass.
- `pnpm lint:src` (cold, `.eslintcache-src` removed first): 0 errors, 1068 pre-existing warnings, `production: PASS`.
- `npx tsc --noEmit -p .`: no errors (about 15 s).
- Earlier WR-01/WR-02 verification (prettier over the two meta files, cold `eslint --no-cache` over `src/frontend` and `src/backend` with 0 runner-literal hits) stands; those files were not touched in this pass.
- All commits went through the husky pre-commit hook without `--no-verify`.

---

_Fixed: 2026-11-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
