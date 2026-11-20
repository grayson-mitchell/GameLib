---
status: complete
quick: 261029-t4b
---

# Quick 261029-t4b: Console mode Native chip

Console mode top bar now reads Installed, Native, divider, stores. Native is an independent local toggle (starts off each mount, not persisted, separate from desktop libraryNativeOnly). Hidden on win32. Filtering goes through the new pure `applyConsoleChipFilters` in selectors.ts, which delegates the rule to `filterEngine.isHostNative`.

## Commits
- 0ca4f2e65: applyConsoleChipFilters helper + 7 tests
- 013c3f451: Native chip in ConsoleMode/index.tsx

## Verification
- jest ConsoleMode + hardcodedStringGate: 4 suites, 253 tests pass
- pnpm codecheck clean, eslint clean, prettier --check clean
- No edits to filterEngine.ts, gamepage.json or locales. graphify update run.

## Deviations
None.

## Still needs a live check (human-check from plan)
1. macOS console mode: chip order, Native narrows grid, 32-bit Steam title absent.
2. Installed + Native + Steam combination; Native persists while cycling stores with L1/R1.
3. D-pad Left/Right walk and wrap through Installed, Native, stores, Sort, Quit; Up from grid lands on Installed; Down from Native returns to grid.
4. Re-entering console mode resets Native; desktop Native chip unaffected.
5. Windows shows no Native chip.
