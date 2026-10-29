---
phase: quick-261029-oog
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - meta/hardcodedStringGate.ts
  - meta/__tests__/hardcodedStringGate.test.ts
  - src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts
  - src/frontend/helpers/resolveBootLanguage.ts
  - meta/i18nGateScope.json
  - meta/__tests__/genI18nGateScope.test.ts
  - .planning/todos/pending/2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes.md (moved to .planning/todos/completed/)
autonomous: true
requirements:
  - TODO-2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes

must_haves:
  truths:
    - "The six named files are in meta/i18nGateScope.json and the blocking scanScope() reports zero violations for them"
    - "Each new gate exemption has a paired NEGATIVE fixture proving the shape alone does not exempt real English"
    - "meta/i18nGateAllowlist.json is untouched (still exactly 2 entries) and no file-exempt or declaration-exempt marker is added"
    - "DECLARED_UNSCANNED_DEBT no longer lists the six files, and the A0/A2 pins read 241"
    - "The pre-existing pairing-completeness fixture (dangling `key: 'library.filterPanel.chipHiddenOnly'` stays flagged) still passes unchanged"
  artifacts:
    - path: "meta/hardcodedStringGate.ts"
      provides: "isBareI18nKeyPathLiteral, isClassNameFunctionReturn, isInjectedDiagnosticLoggerArgument"
      contains: "I18N_KEY_PATH_RE"
    - path: "meta/i18nGateScope.json"
      provides: "241-file hand-curated blocking scope"
    - path: ".planning/todos/completed/2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes.md"
      provides: "closed todo with a Resolution section"
  key_links:
    - from: "meta/hardcodedStringGate.ts record()"
      to: "isBareI18nKeyPathLiteral"
      via: "exempted += 1 branch right after the tuple/object pair check"
    - from: "isStructuralNonCandidate"
      to: "isClassNameFunctionReturn, isInjectedDiagnosticLoggerArgument"
      via: "two new `if (...) return true` lines"
---

<objective>
Close todo `2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes`: make the hardcoded-string gate
stop false-positiving on the 48 audit hits in six fork files, then move those files from
`DECLARED_UNSCANNED_DEBT` into the blocking scope `meta/i18nGateScope.json`.

Purpose: these six files are currently unscanned, so a real untranslated string added to them would
pass CI. Every exemption stays shape-based and narrow (the 41-02 / 41-04 precedent). No ignore list,
allowlist or exempt-marker additions.

Output: three new gate predicates with positive and negative fixtures, two small source refactors that
route files through EXISTING exempt seams, a 241-file scope, and the todo moved to `completed/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes.md

Load `Skill("gamelib-conventions")` before running any `<verify>` block (the prettier rule).

## Measured audit (planner ran `scanScope({ extraFiles: [the six] })` on 2026-10-29: 48 violations)

The todo's grouping is a little off. Here is what the AST actually shows:

| File | Hits | Real cause |
| --- | --- | --- |
| `welcomeState.ts` L52/59/66 | 3 | `statusKey: 'welcome.appManagement.status.granted'` property initializer. Camel-case segments defeat `DOMAIN_RE`. |
| `bridgeRouteDisplay.ts` L42-59, L129 | 14 | `REASON_KEYS` (9) and `KNOWN_BAD_KEYS` (4) `Record<..., string>` values, plus `limitedLineKeys.push('steam.bridge.limited.identityFallback')` (a call argument, L129). `'steam.bridge.route.reason.seed'` and `'steam.bridge.limited.body'` already pass because they are all-lowercase, so `DOMAIN_RE` discards them. |
| `steamBridgeRouteLine.ts` L43-60 | 13 | Same two tables. |
| `crossoverInstallRisk.ts` L66-96 | 12 | NOT a tuple/object shape. These are six direct `tGamelib(key, default)` calls. They are missed because `tGamelib` is a parameter typed with the local alias `TGamelibLike`, and `T_FUNC_TYPE_RE = /\bTFunc(tion)?\b/` (hardcodedStringGate.ts ~L1098) does not match that name, so `collectTAliases` never registers `tGamelib`. |
| `buttonClassName.ts` L10/12/14 | 3 | `return 'button is-primary'` etc. inside `messageBoxButtonClassName()`. |
| `resolveBootLanguage.ts` L38/40/41 | 3 | Template and string parts of the argument to `logFallback(...)`, where `logFallback: (message: string) => void` is an injected parameter. The real caller (`src/frontend/index.tsx:207`) passes `window.api.logError`. |

## Design decisions (planner's discretion, with the reasoning)

- **Shape 1 (bare key paths) gets a new gate exemption, `isBareI18nKeyPathLiteral`.** The text must match
  `I18N_KEY_PATH_RE = /^([a-z][a-zA-Z0-9]*:)?[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){2,}$/`: an optional
  `ns:` prefix and at least THREE lowerCamel dot-separated segments, with no whitespace, no
  uppercase-initial segment and no empty segment. That is narrower than `DOTTED_KEY_RE` (which allows 2
  segments). There is ONE position exclusion: the literal must NOT be the initializer of a
  `PropertyAssignment` whose name is exactly `key`. That slot belongs to `isKeyDefaultObjectProperty`'s
  pairing rule. The existing fixture "dangling `key: 'library.filterPanel.chipHiddenOnly'` with only a
  `label` sibling is flagged" (hardcodedStringGate.test.ts ~L1302-1323) MUST stay green unchanged.
  Without this exclusion the new rule would silently void it. The rule is otherwise position-agnostic,
  so it covers the `.push(...)` argument (L129). The argument is the same as for `DOMAIN_RE`, which already
  discards all-lowercase dotted strings everywhere: a whitespace-free, lowerCamel, 3+-segment dotted path
  is never English prose. Wire it into `record()` as a counted exemption (`exempted += 1`) immediately
  after the `isKeyDefaultTupleElement || isKeyDefaultObjectProperty` branch. Do not add it to
  `isTechnicalToken` (that is text-only and cannot see the `key` slot) or to the discard list.
- **Shape 2 (crossoverInstallRisk) needs NO gate widening. It is a tiny source refactor through an
  existing seam.** Rename the file-local `type TGamelibLike` to `type TFunc` (2 occurrences: the
  declaration at L48 and the parameter annotation at L57). This matches `chipLabels.ts`'s established
  local `export type TFunc = (key, defaultValue, options?) => string`. `T_FUNC_TYPE_RE` then registers
  `tGamelib` as a t-alias, and `isTCallArgument` exempts all 12 hits. Widening `T_FUNC_TYPE_RE`, or adding
  a "parameter typed as a `(string, string) => string` function" rule, was rejected: it would launder any
  two-string formatter callback. `TGamelibLike` is not exported (grep confirms zero other references).
- **Shape 3 (CSS class strings) gets `isClassNameFunctionReturn`, a discard in
  `isStructuralNonCandidate`.** All three of these conditions must hold:
  (a) the literal is the direct `getExpression()` of a `ReturnStatement`.
  (b) the nearest enclosing function-like node is named with the `/ClassName$/` suffix. That is a
  `FunctionDeclaration`'s own name, or for an `ArrowFunction` / `FunctionExpression` the name of the
  `VariableDeclaration` it initializes.
  (c) the text matches a whitespace-separated class list (`CSS_CLASS_LIST_RE`): two or more tokens, each
  matching `/^[a-z][a-zA-Z0-9]*([-_]{1,2}[a-zA-Z0-9]+)*$/`, where AT LEAST ONE token contains `-` or `_`.
  This mirrors the existing `isDropdownButtonClassProp` / `className` excluded-attribute reasoning,
  carried across a function boundary. The name anchor alone is not enough: (c) is what stops
  `return 'Install anyway'`, and the hyphen requirement is what stops lowercase prose like
  `'click to continue'`.
- **Shape 4 (injected logger) is a one-line source refactor plus a resolution-based gate rule,
  `isInjectedDiagnosticLoggerArgument`.** In `resolveBootLanguage.ts`, change the parameter annotation to
  `logFallback: typeof window.api.logError`. That type-query pattern is already used in the frontend:
  `typeof window.api.listSteamLibraryTargets` in `state/InstallGameModal.ts:13` and
  `typeof window.api.openDialog` in `hooks/useOpenDialog.ts:10`. Then add the gate rule, a discard in
  `isStructuralNonCandidate`. It applies when the literal's nearest `CallExpression` ancestor has an
  `Identifier` callee whose `getDefinitionNodes()` include a `ParameterDeclaration` whose
  `getTypeNode()` is a `TypeQuery` (`Node.isTypeQueryNode` / `Node.isTypeQuery`, whichever this ts-morph
  version exposes). The query's `getExprName().getText()` must match
  `/^window\.api\.log([A-Z][a-zA-Z]*)?$/` or `/^console\.(log|info|warn|error|debug)$/`. Per GAP-C's own
  doctrine (hardcodedStringGate.ts ~L344-361), this is RESOLUTION-based and not NAME-based: a parameter
  named `logIn` or `logFallback` with a plain function type gets nothing. Only a declared type that IS an
  already-exempt diagnostic channel qualifies. It also works in the gate's single-file in-memory project
  (`scanSource` creates one source file), because it never needs to see `index.tsx`.

## Interfaces the executor needs

From meta/hardcodedStringGate.ts:
- `const DOTTED_KEY_RE` (~L1349). Leave it unchanged. The new `I18N_KEY_PATH_RE` sits beside it, with a
  comment stating why it is stricter (3+ segments, lowerCamel only).
- `function isStructuralNonCandidate(node, classification)` (~L1002). Add the two discards at the end,
  before `return false`.
- `function record(node, rawText, classification)` inside `scanSource` (~L1700). The tuple/object branch
  is at ~L1753. Add the shape-1 branch right after it.
- `function isLocalDiagnosticWrapperArgument` (~L363) is the style model for callee resolution through
  `callee.getDefinitionNodes()`.
- `function isConsoleArgument` / `isWindowApiLogArgument` (~L308/L328) are the style model for
  `getFirstAncestor(Node.isCallExpression)`.
- Test helpers: `scanSource('fixture.ts', source, EMPTY_GLOSSARY)` returns `{ violations, exempted }`.
  `scanScope()` / `scanScope({ extraFiles })` return `{ violations, scannedFiles, fileExempt, ... }`.

From meta/__tests__/genI18nGateScope.test.ts:
- `DECLARED_UNSCANNED_DEBT` (~L359). Its first 7 lines are the `// TEMPORARY (56-30 A-17)` comment plus
  the six paths, and they are removed.
- The history docblock immediately above it (ends ~L357) gets a new dated entry.
- A0 (~L1125-1127): `expect(scopeSnapshot.files.length).toBe(235)` and the test title "REAL 235-file".
  A2 (~L1168) title: "real 235 -> 287 diff". The fork-touched count 287 does NOT change.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the three narrow gate exemptions (shapes 1, 3, 4), each with positive and NEGATIVE fixtures</name>
  <files>meta/hardcodedStringGate.ts, meta/__tests__/hardcodedStringGate.test.ts</files>
  <behavior>
    New `describe('quick 261029-oog: key-table / class-list / injected-logger shapes', ...)` block. Place it after the existing `D-14: [key, default] tuple tables` block. Every positive case asserts `violations` length 0. The shape-1 positives also assert `exempted > 0`, because shape 1 is a counted exemption.
    - P1 (shape 1, welcomeState mirror): a switch returning `{ visible: true, statusKey: 'welcome.appManagement.status.granted', ... }`. Expect 0 violations and exempted > 0.
    - P2 (shape 1, route tables mirror): `const REASON_KEYS: Record<string, string> = { 'scan-clean': 'steam.bridge.route.reason.scanClean', 'win64-no-shim': 'steam.bridge.route.reason.win64NoShim' }` plus `limitedLineKeys.push('steam.bridge.limited.identityFallback')`. Expect 0 violations.
    - P3 (shape 1, ns prefix): `{ titleKey: 'gamelib:installFlows.crossoverRating.knownBadTitle' }`. Expect 0 violations.
    - N1 (shape 1): `{ statusKey: 'Access granted' }`. Expect 1 violation (a *Key-named slot buys nothing).
    - N2 (shape 1): `{ statusKey: 'welcome.appManagement' }`. Expect 1 violation (two segments is not enough).
    - N3 (shape 1): `{ label: 'Steam.Bridge.Route' }`. Expect 1 violation (an uppercase-initial segment is not this repo's key shape).
    - N4 (shape 1): `{ hint: 'See steam.bridge.route.reasonSeed for details' }`. Expect 1 violation (whitespace means prose).
    - N5 (shape 1, the `key` slot exclusion): `{ ns: 'gamelib', key: 'library.filterPanel.chipHiddenOnly', label: 'Hidden only' }`. Expect the violation texts to contain BOTH `'library.filterPanel.chipHiddenOnly'` and `'Hidden only'`. The existing ~L1302 fixture must also still pass untouched.
    - P4 (shape 3, buttonClassName mirror): `export function messageBoxButtonClassName(variant?: string): string { switch (variant) { case 'primary': return 'button is-primary'; case 'danger': return 'button is-danger messageBoxModal__button--separated'; default: return 'button is-secondary outline' } }`. Expect 0 violations. Also cover the arrow form `const rowClassName = () => 'row row--active'`, which expects 0.
    - N6 (shape 3, name anchor): the same body in `function messageBoxButtonLabel()`. Expect 3 violations.
    - N7 (shape 3, text shape): `function bannerClassName() { return 'Install anyway' }`. Expect 1 violation.
    - N8 (shape 3, hyphen requirement): `function bannerClassName() { return 'click to continue' }`. Expect 1 violation.
    - N9 (shape 3, return position): `function bannerClassName() { const label = 'Install anyway now'; return label }`. Expect 1 violation. Assert on the text, not only the count.
    - P5 (shape 4, resolveBootLanguage mirror): `export function resolveBootLanguage(c: string | undefined, s: string | null, logFallback: typeof window.api.logError) { logFallback(\`[GameLib] configStore has no 'language' key; resolved to "${s}" via \` + (s ? \`stale localStorage fallback (was "${s}")\` : "the 'en' default")) }`. Expect 0 violations. Also a `typeof console.warn` parameter variant, which expects 0.
    - N10 (shape 4, plain function type): the identical body with `logFallback: (message: string) => void`. Expect 3 violations (the parameter name buys nothing).
    - N11 (shape 4, non-log channel): `notify: typeof window.api.openDialog` with `notify('Choose a folder to continue')`. Expect 1 violation.
    - N12 (shape 4, login verb): `logIn: (user: string) => void` with `logIn('Welcome back, friend')`. Expect 1 violation (GAP-C's own anti-laundering case).
  </behavior>
  <action>
    RED: add the fixtures above to `meta/__tests__/hardcodedStringGate.test.ts` and run the file. P1-P5 must fail. The N cases may already pass (they pin today's behavior), and that is expected.

    GREEN: implement the code in `meta/hardcodedStringGate.ts` exactly as the Design decisions section specifies:
    - `I18N_KEY_PATH_RE` and `isBareI18nKeyPathLiteral(node)`. The text is the literal text of a StringLiteral or NoSubstitutionTemplateLiteral. A TemplateExpression returns false. Return false when the parent is a `PropertyAssignment` named exactly `key` and the node is that assignment's initializer. Wire it into `record()` as `exempted += 1; return` directly after the tuple/object branch.
    - `CSS_CLASS_LIST_RE` (or a token loop) and `isClassNameFunctionReturn(node)`. Add it to `isStructuralNonCandidate`.
    - `isInjectedDiagnosticLoggerArgument(node)`. Add it to `isStructuralNonCandidate`.

    Give each predicate a doc comment in the house style of the neighboring predicates. The comment names the real file and lines it covers, its paired negative fixtures by intent, and the shape it deliberately refuses. For shape 1, also note that the `key`-slot exclusion protects `isKeyDefaultObjectProperty`'s pairing-completeness fixture. Do NOT touch `DOTTED_KEY_RE`, `T_FUNC_TYPE_RE`, `EXCLUDED_ATTRIBUTES`, the allowlist or the glossary.

    Run the whole test file. Every pre-existing test must still pass, including `scope orchestration` (the six files are not in scope yet, so scope counts are unaffected) and the ~L1302 dangling-key fixture. If any pre-existing NEGATIVE test turns red, the new rule is too broad. Narrow it, and do not edit that test.

    Check the prettier file-info first. Both paths are expected to be not ignored.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info meta/hardcodedStringGate.ts meta/__tests__/hardcodedStringGate.test.ts && npx jest meta/__tests__/hardcodedStringGate.test.ts && npx tsc -p tsconfig.meta.json --noEmit && npx prettier --check meta/hardcodedStringGate.ts meta/__tests__/hardcodedStringGate.test.ts</automated>
  </verify>
  <done>All P cases report 0 violations. All N cases report the stated violations. The full hardcodedStringGate.test.ts passes with zero edits to any pre-existing test. The meta tsconfig typechecks and prettier is clean on both paths.</done>
</task>

<task type="auto">
  <name>Task 2: Two source refactors, promote the six files into blocking scope, drop the debt, re-pin A0/A2, close the todo</name>
  <files>src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts, src/frontend/helpers/resolveBootLanguage.ts, meta/i18nGateScope.json, meta/__tests__/genI18nGateScope.test.ts, meta/__tests__/hardcodedStringGate.test.ts, .planning/todos/pending/2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes.md</files>
  <action>
    1. In `crossoverInstallRisk.ts`, rename `type TGamelibLike` to `type TFunc` (declaration ~L48, parameter annotation ~L57). Add a one-line comment: the name matches `chipLabels.ts`'s `TFunc`, and the hardcoded-string gate's `T_FUNC_TYPE_RE` uses it to recognize `tGamelib` as a t-alias. No other change.
    2. In `resolveBootLanguage.ts`, change the `logFallback` parameter type from `(message: string) => void` to `typeof window.api.logError`, and add one sentence to the header saying why. `index.tsx:207` already passes `window.api.logError`, and the test file passes `jest.fn()`. Confirm with `npx tsc --noEmit`. If the declared type of `window.api.logError` makes `jest.fn()` or the template argument fail to typecheck, stop and report it. Do not fall back to a name-based gate rule.
    3. Re-run the planner's audit: `scanScope({ extraFiles: [the six paths] })` must report 0 violations for all six. A throwaway script in the session scratchpad works, run with `node meta/runTs.cjs --bundle --platform=node --target=node21 <script>`. If any hit remains, fix the narrow cause (go back to Task 1's rules) rather than widening.
    4. Hand-edit the six paths into `meta/i18nGateScope.json` `files` in sorted position. The file is currently default JS `.sort()` order. `crossoverInstallRisk.ts` lands between `WineSelector/index.tsx` and `diskSpaceLabels.ts`. `steamBridgeRouteLine.ts` lands before `steamEligibilityProbe.ts`. The other four go to their sorted neighbors. Append to the `generatedBy` string: `, then quick 261029-oog promoted buttonClassName.ts, welcomeState.ts, resolveBootLanguage.ts, bridgeRouteDisplay.ts, crossoverInstallRisk.ts and steamBridgeRouteLine.ts after widening the gate for bare key-path, class-list-return and typed-diagnostic-logger shapes -- still NOT a pnpm gen-i18n-gate-scope run`. Keep the leading `hand-edited` so `isHandCuratedProvenance` (A5) stays true. Do NOT touch `meta/i18nForkTouchedFiles.json`, because those six are already fork-touched.
    5. In `meta/__tests__/genI18nGateScope.test.ts`, delete the `// TEMPORARY (56-30 A-17)` comment and the six paths from `DECLARED_UNSCANNED_DEBT`. Add a dated history entry at the end of the docblock above it: "2026-10-29 (quick 261029-oog): scope 235 -> 241, fork-touched unchanged at 287; the six 56-30 A-17 temporary-debt files promoted after the gate widening; DECLARED_UNSCANNED_DEBT -6". Re-pin A0 `toBe(235)` to `toBe(241)` and update the A0 title. Update the A2 title "235 -> 287" to "241 -> 287". Grep the file for any other literal `235` that refers to the CURRENT scope (historical docblock mentions stay as they are).
    6. In `meta/__tests__/hardcodedStringGate.test.ts`, add a `describe('quick 261029-oog: the six 56-30 A-17 files in blocking scope', ...)` modeled on the REQ-41-04 W1/W2 block (~L1768). W1: each of the six is in `meta/i18nGateScope.json` and NOT in `meta/i18nGateAllowlist.json`. W2: `scanScope().violations` filtered per file is empty.
    7. Close the todo. `git mv` it to `.planning/todos/completed/2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes.md` (the repo uses `completed/`, not `done/`). Append a `## Resolution` section in the style of the other completed todos: the fix commit (fill in after commit), the root cause per shape (include the correction that shape 2 was alias detection, not a tuple shape), the fix per shape, and the status "code fix, no live gate needed".
    8. Run `graphify update .`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts src/frontend/helpers/resolveBootLanguage.ts meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts && npx tsc --noEmit && npx tsc -p tsconfig.meta.json --noEmit && node -e "const f=require('./meta/i18nGateScope.json').files;if(f.length!==241||JSON.stringify(f)!==JSON.stringify([...f].sort()))process.exit(1)" && npx jest meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/genI18nGateScope.test.ts src/frontend/helpers/__tests__/resolveBootLanguage.test.ts src/frontend/components/UI/DialogHandler/components/MessageBoxModal/__tests__/buttonClassName.test.ts && test -f .planning/todos/completed/2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes.md && test ! -f .planning/todos/pending/2026-10-29-widen-hardcoded-string-gate-for-key-table-shapes.md && pnpm planning-gates && npx prettier --check src/frontend/screens/Library/components/InstallModal/crossoverInstallRisk.ts src/frontend/helpers/resolveBootLanguage.ts meta/i18nGateScope.json meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts</automated>
  </verify>
  <done>The scope holds 241 files in sorted order, with the six present. The blocking `scope orchestration` test reports 0 violations. The allowlist still has exactly 2 entries and `fileExempt` is still only `bootErrorSurface.ts`. A0 through A6 pass. Any crossoverInstallRisk tests that exist pass, along with the resolveBootLanguage and buttonClassName unit tests. Both typechecks pass. The todo is in `completed/` with a Resolution section. The todo markdown is prettier-ignored (`--file-info` reports `ignored: true`), so it is deliberately left out of the prettier check.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| developer source -> CI i18n gate | The gate is the only automated check that user-facing text is translated. Each exemption is a hole in it. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-oog-01 | Tampering | isBareI18nKeyPathLiteral | mitigate | 3+ lowerCamel segments, no whitespace, `key`-slot exclusion; negative fixtures N1-N5 plus the untouched ~L1302 fixture |
| T-oog-02 | Tampering | isClassNameFunctionReturn | mitigate | Three-way conjunction (return position, `*ClassName` function, hyphenated class-list text); N6-N9 |
| T-oog-03 | Tampering | isInjectedDiagnosticLoggerArgument | mitigate | Resolution via declared `typeof window.api.log*`/`console.*` type, never the parameter name; N10-N12 |
| T-oog-04 | Elevation | allowlist / exempt markers | mitigate | Existing "gate is not disabled" tests (allowlist length 2, single fileExempt) must stay green unchanged |
</threat_model>

<verification>
- `npx jest meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/genI18nGateScope.test.ts` is green.
- `git diff --stat meta/i18nGateAllowlist.json meta/i18nGlossary.json meta/i18nForkTouchedFiles.json` shows no changes.
- `git diff meta/__tests__/hardcodedStringGate.test.ts` shows only additions. No pre-existing assertion was edited.
</verification>

<success_criteria>
The six files are blocking-scanned with 0 violations. Each of the three new exemptions has passing negative fixtures. No ignore-list, allowlist or marker growth. The debt register is down by six, A0/A2 are pinned at 241, and the todo is closed in `.planning/todos/completed/`.
</success_criteria>

<output>
Create `.planning/quick/261029-oog-widen-hardcoded-string-gate-for-key-tabl/261029-oog-SUMMARY.md` when done.
</output>
