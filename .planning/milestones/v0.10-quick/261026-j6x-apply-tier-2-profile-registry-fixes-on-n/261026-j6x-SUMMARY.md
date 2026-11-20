---
status: complete
quick: 261026-j6x
commits: [3987181e6, 436008c32, a9608a9ea]
---

# Quick 261026-j6x: tier-2 registry fixes on non-Steam launch paths

Registry validation, `reg add` argv and the 15 s apply loop now live in `src/backend/knownFixesRegistry.ts`. `prepareWineLaunch` calls `applyKnownFixProfileRegistry` on every launch, outside the `if (hasUpdated)` block. Legendary, gog, nile, zoom and sideload launches therefore apply their `<appName>-<store>.profile.json` `registry`. The Steam bridge uses the shared module through a thin wrapper.

## Commits
- 3987181e6: shared module, Steam bridge refactor, tests
- 436008c32: launcher wiring and `types.ts` doc comment
- a9608a9ea: todo moved to completed with a Resolution section

## Verification
- `npx jest` on knownFixesRegistry, steamBridgeKnownFixes (unmodified), steam games, launcher_callRunner and gogImportGame: all pass. 463 of 464 tests passed on a run where the one failure was a mistake in my new test (the legendary file suffix). After fixing it, knownFixesRegistry and steamBridgeKnownFixes pass together, 64 of 64.
- `tsc --noEmit` is clean. `lint:src` reports warnings only. Prettier is clean on the five changed paths.
- `knownFixesRegistry.ts` has no import of `backend/launcher` outside a dynamic `import()`.

## Deviations
- The plan's literal grep for a single-line `await applyKnownFixProfileRegistry(gameInfo.app_name, gameInfo.runner, gameSettings)` does not match, because prettier wraps the call across lines. The call sits after the `hasUpdated` block, confirmed by the awk output.
- A test fixture was wrong, not the code. `readKnownFixProfile` names files with `storeMap[runner]` (legendary is `epic`, nile is `amazon`), so the legendary test writes `GOGAPP-epic.profile.json`.

## Issues found, not fixed
- `storeMap.sideload` is `undefined`, so sideload games look up `<appName>-undefined.profile.json`. A sideload profile can't be named sensibly today, so the sideload hook is effectively inert. This predates this change and is out of scope.
- `pnpm planning-gates` passes 11 of 12. The failing gate is the STATE.md SDK field-anchor check, which I didn't touch. The todo-frontmatter gate passes.
