---
phase: quick-261030-sqq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
  - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
autonomous: true
requirements: [QUICK-261030-sqq]

must_haves:
  truths:
    - "A gift-only row (owned on Steam, exact match, UNREVEALED, giftAction supplied, no claim/settle action) shows the 'Owned on Steam' badge in the KEY cell"
    - "The same row still shows no Activate/claim button, only the 'Gift on Humble' button (D-60 unchanged)"
    - "A gift-only row whose gift was already opened (giftedAt set) shows the badge plus the gifted annotation, and zero buttons"
    - "The badge renders ahead of the gift action row, the same fragment order 'settled' uses"
  artifacts:
    - path: "src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx"
      provides: "'gift-only' branch of renderKeyAction renders {ownedBadge} then the action row"
      contains: "case 'gift-only':"
    - path: "src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx"
      provides: "regression describe pinning the badge on gift-only rows"
      contains: "Owned on Steam"
  key_links:
    - from: "renderKeyAction 'gift-only' case"
      to: "ownedBadge (const defined ~L405)"
      via: "JSX fragment"
      pattern: "\\{ownedBadge\\}"
---

<objective>
Fix the Humble Keys bug the operator found live on 2026-10-30. A gift-only row is a key for a
game the user already owns on Steam: exact AppID match, still UNREVEALED, with a gift action and
no claim or settle action. That row shows the gift button but no "Owned on Steam" badge. The
Activate button is missing on purpose (D-60), but nothing on the row says why. Operator: "No
activate button available (also does not have a message saying I own it, that is a bug."

Purpose: the badge states a fact about the key, so it should not depend on which action the row
offers. `'settled'` and `'override-pending'` already render it. `'gift-only'` skipped it.
Output: a one-branch render fix, a corrected doc comment, and a regression describe.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<interfaces>
<!-- Extracted from the codebase. No further exploration is needed. -->

src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx:
- L150-176: the doc comment on `HumbleKeyScenarioId`. It maps scenarios to UI-SPEC rows
  ("`'gift-only'` and `'claim-and-gift'` are rows 3 and 2"). It says nothing about badges, so
  leave it alone unless you edit what it describes.
- L178-213: the `resolveKeyScenario` doc comment. Item 5 reads "An owned, not-yet-revealed key
  with only a gift action (no claim action) is a giftable spare (D-60) — claiming a game you
  already own elsewhere makes no sense, gifting it still does." This is the comment to extend
  (see Task 1).
- L255-261: `if (isGiftableSpare(humbleKey) && hasGiftAction && !hasClaimAction) return 'gift-only'`.
  Fuzzy matches return `'override-pending'` earlier (L250), so a gift-only row is in practice an
  exact match.
- L405-424: `const ownedBadge = humbleKey.ownedElsewhere && (<span className="humbleKeyOwnedBadge">…)`.
  The copy follows `matchConfidence`: 'exact' gives 'Owned on Steam', anything else gives
  'Likely owned on Steam'. The "Not the same game" button appears only when
  `scenario === 'override-pending'`. Render it as it is and do not re-derive it.
- L601-626: `giftContent`, which is either the "Gift on Humble" button
  (`className="humbleKeyGiftButton"`) or, when `giftAction.giftedAt !== null`, the gifted
  annotation `"Opened Humble gift page {{date}}"` (`humbleKeyGiftedAnnotation`). Under
  `'gift-only'` it is never null in practice, because `hasGiftAction` requires `giftAction`.
- L648-686: the `'settled'` case returns `<>{ownedBadge}{settleAction && (<span className="humbleKeyActionRow">…</span>)}</>`.
  This is the shape to copy.
- L687: `case 'override-pending': return ownedBadge`
- L690-695 (the bug):
  `case 'gift-only': return ( giftContent && ( <span className="humbleKeyActionRow">{giftContent}</span> ) )`

Test file __tests__/index.test.tsx (1546 lines, no DOM; the component is called as a plain
function and the element graph is inspected):
- Helpers at L49-160: `makeHumbleKey(overrides)` (defaults: platform 'steam', state 'UNREVEALED',
  ownedElsewhere false, matchConfidence 'none'), `collectElements`, `findByClassNamePart(tree, part)`,
  `textContent(node)`. `react-i18next` is mocked to return the default string with interpolation.
- Existing gift-only coverage (L1337-1443, describe "gift affordance transitively withheld for a
  keyless spare") checks only the scenario id and whether a `humbleKeyGiftButton` exists. It
  never checks the badge. The pattern for checking a badge's placement in KEY versus GAME is at
  L637-664 (filter `collectElements(keyCell?.props?.children)` on the `humbleKeyOwnedBadge` class).
- Audit result: no current test asserts that the badge is ABSENT on gift-only rows, so no test
  encodes the bug. The executor re-confirms this in Task 2.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Render ownedBadge on gift-only rows, plus a regression describe</name>
  <files>src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx, src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx</files>
  <behavior>
    - Test A: render HumbleKeyRow with makeHumbleKey({ platform: 'steam', state: 'UNREVEALED', ownedElsewhere: true, matchConfidence: 'exact' }) and giftAction { giftedAt: null, onGift: jest.fn() }. Start with a non-vacuity pin: resolveKeyScenario on the same inputs (hasGiftAction true, the other has* flags false, undoOverride false) returns 'gift-only'. Then assert that exactly one humbleKeyOwnedBadge element sits inside humbleKeyColumnCell, none inside humbleKeyGameCell, its textContent is 'Owned on Steam', and it does not contain 'Not the same game'.
    - Test B (same row): every button element in the tree is a humbleKeyGiftButton. There is exactly one, and textContent(tree) contains no 'Activate' and no 'Claim on'. This pins that D-60's withheld Activate stays withheld.
    - Test C (same row): in textContent(keyCell), the index of 'Owned on Steam' is lower than the index of 'Gift on Humble'. The badge comes first, as in 'settled'.
    - Test D (gifted variant, giftAction.giftedAt set to a fixed timestamp): the badge is still present in KEY with 'Owned on Steam', a humbleKeyGiftedAnnotation is present, and the tree has zero button elements.
    - RED first: before editing index.tsx, run the new describe. Tests A, C and D must FAIL because no badge is found. Test B may already pass, since it guards behaviour the fix must not break. Record the RED output in the SUMMARY.
  </behavior>
  <action>
    First the tests. Append a new top-level describe at the end of __tests__/index.test.tsx, titled
    "gift-only rows show the ownership badge (261030-sqq)". Open it with a short comment. Name the
    live bug (2026-10-30, operator). Say the badge states a fact and does not depend on which
    action is offered. Say the gift-only branch used to omit it while 'settled' and
    'override-pending' rendered it. Build Tests A to D from <behavior> using the existing helpers
    (makeHumbleKey, collectElements, findByClassNamePart, textContent) and the KEY-vs-GAME filter
    idiom from L637-664. Add no new helpers or mocks. Run it and confirm RED.

    Then the fix. In index.tsx renderKeyAction, change `case 'gift-only':` so it returns a fragment
    with `{ownedBadge}` first and then `{giftContent && (<span className="humbleKeyActionRow">{giftContent}</span>)}`.
    This is the same fragment shape as `'settled'`. Render ownedBadge unconditionally inside the
    fragment, not gated on giftContent: the badge is a fact, independent of whether a gift is
    available. Do not touch ownedBadge, giftContent, resolveKeyScenario's logic, or any other case.
    Add a two-line comment above the case. It cites D-60: Activate is withheld because the game is
    already owned, so the badge is what tells the user why, and omitting it was the 261030-sqq bug.

    Then the doc comment. Extend item 5 of the resolveKeyScenario doc comment (L198-200) with one
    clause saying the row also carries the ownership badge that explains the missing claim action.
    Leave the HumbleKeyScenarioId comment at L150-176 unchanged, because it makes no badge claim.

    Run the describe again and confirm GREEN, then run the whole file.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --runTestsByPath src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx && npx prettier --file-info src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx && npx prettier --check src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx</automated>
  </verify>
  <done>The new describe was RED before the index.tsx edit and is GREEN after it, and the whole HumbleKeyRow test file passes. The 'gift-only' case renders {ownedBadge} ahead of the action row. Both paths are prettier-clean. At planning time --file-info reported both as `"ignored": false`, so the check proves something; re-confirm that.</done>
</task>

<task type="auto">
  <name>Task 2: Codecheck, scoped lint, mutation proof and audit confirmation</name>
  <files>src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx, src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx</files>
  <action>
    Run pnpm codecheck. The exhaustive `never` default in renderKeyAction must still compile.
    Run eslint scoped to the two paths only (npx eslint on the exact paths, never `.`).

    Mutation proof: temporarily revert just the `{ownedBadge}` line in the gift-only case, run the
    new describe, and confirm A, C and D fail. Restore the line and confirm GREEN. Use
    `git diff --stat` afterwards to show that only the two planned files changed. Put the verbatim
    fail and pass lines in the SUMMARY.

    Audit: run grep -n on the test file for 'gift-only' and 'humbleKeyOwnedBadge' to confirm that
    no pre-existing test asserts the badge is absent on a gift-only row. Planning found none. If
    the executor finds one, it encodes the bug: update it to expect the badge and say so in the
    SUMMARY.

    Note in the SUMMARY as an observation, without changing code: a row with ownedElsewhere true
    and NEITHER a giftAction NOR a claimAction (for example an owned UNREVEALED epic_keyless spare,
    which falls through to 'claim-and-gift' with nothing to render) also shows no badge. That falls
    outside this fix's scope and is flagged to the orchestrator.

    Finally run graphify update . (AST-only) per CLAUDE.md.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && npx eslint src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx && npx jest --runTestsByPath src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx && npx prettier --check src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx</automated>
  </verify>
  <done>codecheck and scoped eslint pass. The mutation proof is recorded, failing with the fix reverted and passing with it restored. The audit result is stated, and the claim-and-gift empty-fallthrough observation is in the SUMMARY.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | A presentational render change inside an existing component. No new input, IPC or network surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261030-sqq-01 | Tampering (UI integrity) | renderKeyAction 'gift-only' | mitigate | Test B pins that no Activate/claim button appears, so the fix cannot re-expose a claim on an owned game (D-60) |
| T-261030-sqq-02 | Information disclosure | ownedBadge | accept | Shows the user's own ownership fact to that user, the same data 'settled' already shows |
</threat_model>

<verification>
- The HumbleKeyRow jest file passes. The new describe is RED without the fix and GREEN with it.
- pnpm codecheck passes, and eslint and prettier scoped to the two paths pass.
- Live (operator, optional): on the Humble Keys page, the owned-on-Steam UNREVEALED key now reads "Owned on Steam" beside its "Gift on Humble" button.
</verification>

<success_criteria>
Gift-only rows render the "Owned on Steam" badge ahead of the gift action, with no claim or
Activate affordance. The behaviour is pinned by a regression describe with a recorded mutation
proof.
</success_criteria>

<output>
Create `.planning/quick/261030-sqq-humble-gift-only-rows-show-owned-on-stea/261030-sqq-SUMMARY.md` when done
</output>
