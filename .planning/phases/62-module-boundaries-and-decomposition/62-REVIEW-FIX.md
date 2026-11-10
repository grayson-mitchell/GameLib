---
phase: 62-module-boundaries-and-decomposition
fixed_at: 2026-11-11T00:00:00Z
review_path: .planning/phases/62-module-boundaries-and-decomposition/62-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 62: Code Review Fix Report

**Fixed at:** 2026-11-11
**Source review:** .planning/phases/62-module-boundaries-and-decomposition/62-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (fix_scope: critical_warning)
- Fixed: 2
- Skipped: 0
- Out of scope (Info, not attempted): 2 (IN-01, IN-02)

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

## Out of Scope (not attempted)

- IN-01: `value` / `.value` matched everywhere. Info severity, outside `fix_scope: critical_warning`. The review itself says no action is needed until a legitimate case appears.
- IN-02: `isStore` imports appended after stylesheet imports. Info severity, outside `fix_scope: critical_warning`.

## Verification

Ran in the main checkout (not a worktree), so the numbers are reproducible from the tree.

- `pnpm exec jest meta/__tests__/runnerLiteralSelectors.test.ts`: 57/57 after WR-01 (the original table plus the WR-01 cases), 69/69 after WR-02.
- `pnpm lint:src` (consumer: `eslint.config.mjs` imports `SELECTORS`): 0 errors, `production: PASS`.
- Cold cross-check, `eslint --no-cache` over `src/frontend` and `src/backend`: 0 errors and 0 runner-literal (`storeCapabilities` message) hits, so no new hits appeared. The cold run guards against the stale-cache hazard.
- `npx prettier --check` over exactly `meta/runnerLiteralSelectors.cjs` and `meta/__tests__/runnerLiteralSelectors.test.ts`: clean.
- Both commits went through the husky pre-commit hook without `--no-verify`.

---

_Fixed: 2026-11-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
