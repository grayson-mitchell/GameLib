# Quick 261101-tsq: Hide titles toggle Summary

Adds a `hideTitles` preference (default off) that removes the grid tile title strip in every state (rest, hover, focus, even with "Always show titles" on), via a single CSS rule `.hideTitles .gameCard .gameTitle { display: none }` placed after the reveal rule.

## Commits
- f2f9f6bcc: wiring (store type, storePolicy allowlist + test, types, ContextProvider, GlobalState, Accessibility toggle, en string). "Always show titles" gets `disabled={hideTitles}` and keeps its stored value.
- 3948170d6: GamesList wrapper class, CSS rule, `hideTitles.test.ts` source-text gate (seen failing first, 4/5 red, then green).

## Verification
- `npx tsc --noEmit` clean; storePolicy test (52) and GameCard `__tests__` (78) pass; scoped prettier clean (translation.json is prettier-ignored, omitted).
- `graphify update .` run.

## Deviations
None. (`pnpm lint-translations` not run.)

## Pending human verification
Live `tauri dev` check not done (cannot be run by the agent): follow the plan's human-check steps 1-7 (toggle, disabled-but-checked always-show, hover/keyboard/controller, shelves/FocusRowStrip, list view, restore on off, Clean tiles combo, persistence across restart).
