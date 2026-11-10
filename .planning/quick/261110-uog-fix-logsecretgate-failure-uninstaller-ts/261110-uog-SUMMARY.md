# Quick 261110-uog Summary

Removed raw `result.stderr` from the refused/failed `logInfo` lines in `uninstallGameCallback`, which now log `stderrLength=`. The logSecretGate ratchet is back to zero violations. Gate source and test are untouched, with no new exemption.

## Commits
- e51427cfe: uninstaller.ts log lines plus the regression assertions in uninstaller.test.ts
- 70989e3c3: gameUninstall.ts `refuse()` logs its own reason (deviation; briefly re-tripped the gate via a `stderr`-named identifier)
- 043f8962b: renames the `refuse()` parameter to `reason`, gate green again

## Spot-check of gameUninstall.ts
All producers except the `refuse()` helper already log a warning before returning. The three `refuse()` routes (refused-running, steam-error, refused) did not, so `refuse()` now does `logWarning('SteamGame: <reason>')`. The reason string holds only the appId, an error code or a fixed reason, never process output.

## Tests
- logSecretGate.test.ts and uninstaller.test.ts: 69/69 pass.
- `tsc` reports errors only in storeLayer.test.ts and createStores.test.ts, which this change does not touch.
- macArchKnownFixRouting.test.ts has 1 failing test that also fails on HEAD without my change.
