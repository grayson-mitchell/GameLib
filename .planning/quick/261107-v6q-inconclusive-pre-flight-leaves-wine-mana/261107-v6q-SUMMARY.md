# Quick 261107-v6q Summary

Under an inconclusive CrossOver pre-flight, a bottle whose marker is a `wine-manager` build or a retired pin now keeps its recorded engine (same marker identity, so `prepareBottleForEngine` is a no-op). An unresolvable recorded engine takes the CrossOver branch.

## Reversal of 61-26

This reverses 61-26's choice "wine-manager marker under Automatic gets pins.current". A non-crossover marker that is not a known pin is never coerced to `pins.current` any more.

## Commits

- 88c8296b7: code and tests (engineTypes, engineSwitch, engineDecision and both test files)
- caee9cdc8: 61-HUMAN-UAT item 4 recorded as pass (passed 3, pending 1)

## Changes

- `engineTypes.ts`: wine-manager selection `reason` widened to `'override' | 'cx-inconclusive'`.
- `engineSwitch.ts`: `readBottleEngineMarkerSummary` also returns `wineManagerVersion` and a containment-checked `pinWineserverBin` (inside `pinnedEngineRoot()`, basename `wineserver`).
- `engineDecision.ts`: inconclusive branch resolves, in order, known pin, installed Wine Manager build, retired pin with existing binaries, else CrossOver (`cx-inconclusive`). DXVK rule shared via a `wineManagerDxvk` helper.
- Tests: the 61-26 test "a wine-manager marker (null pin id) gets pins.current" was replaced. New cases cover Steam and non-Steam keys, retired pin, uninstalled build, pruned pin, forced CrossOver, accessor and prepare no-op.

## Verification

- Jest (engineDecision, engineSwitch, launchEngine, engineState): 204 passed.
- `pnpm codecheck` clean. Scoped prettier clean on the five .ts files.

## Deviations

None. No wine-manager consumer needed gating on `reason === 'override'`: the only non-type uses of `managerVersion` are `engineSwitch.ts` marker identity and the decision itself. The fallback toast and notice gates already exclude cx-inconclusive by reason.
