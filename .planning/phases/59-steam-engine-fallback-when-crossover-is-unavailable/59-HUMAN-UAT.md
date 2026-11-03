---
status: complete
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
source: [59-VERIFICATION.md]
started: 2026-11-02T22:20:00+13:00
updated: 2026-11-03T23:30:00+13:00
---

## Current Test

[testing complete]

## Tests

### 1. Live no-CrossOver install of a title with shared redists (UAT 14 redist half)
expected: Install-time redist lines run the pinned wine (a path under the engine root), and no redist entry fails on a missing CrossOver binary.
result: pass — Low Magic Age (576770, depots 228985 + 228990), installed under no-crossover.sb 2026-11-02. Every redist ran with the pinned wine (`Checking if wine version exists: Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)` before each call). vcredist 2013 x86 and x64 installed (22:33:06, 22:33:08). No redist failed on a missing CrossOver binary. Findings: DXSETUP Jun2010 exits 247 on the pinned wine (H1), the CrossOver-only wineserver stop around the display-driver switch (H2), library-folder ERROR noise (H3). On launch the game's own error dialog drew, so the display works, and the deferred DirectX retry did not block it. The game itself failed `SteamAPI_Init()` because the shim was withheld for coverage gaps (SteamUser020, SteamUtils009, …): bridge coverage, not phase 59 (H4).

### 2. Install refusal on a rejected stored Steam session (UAT 13, skipped)
expected: No bottle directory appears and no engine download starts.
result: pass — accepted on unit-test coverage by the operator 2026-11-02. It can't be reached through the UI when signed out.

### 3. Untested CrossOver build warning (D-15)
expected: A CrossOver version absent from testedCrossoverVersions logs a warning line, and the launch is not blocked.
result: pass — 2026-11-02, with testedCrossoverVersions.ts temporarily set to a fake 26.3.0.99999 (uncommitted, reverted afterwards, sidecar rebuilt). The operator saw the in-app notice "CrossOver 26.3.0.39832 is untested with GameLib. Games should still work; please report issues". Log 22:38:35: `SteamEngine: CrossOver build 26.3.0.39832 is untested with GameLib; please report issues`. Planet Crafter launched on CrossOver (game started 22:38:37); the launch was not blocked.

### 4. Fallback bottle survives a different Wine-Staging build (UAT 11, skipped)
expected: The prefix updates silently, the game launches, and the save is still present.
result: skipped — accepted by the operator 2026-11-02. No second Wine-Staging-macOS build exists. Revisit when the pin is bumped.

### 5. Round-6 paths not exercised live: G29 transient retry (UAT 45), launch-option picker launches once (UAT 46), offline-warning button closes (UAT 47b)
expected: Retry: after a nonzero-exit probe, a `stdout=` detail, an "inconclusive, retrying once" warning and a following `outcome=ok`. Picker: one dialogId and one launch at a pick or the 10 s auto-select. Offline warning: OK closes it and leaves no queued dialog.
result: pass — accepted on unit-test coverage by the operator 2026-11-03. Re-UAT 6 could not reach these paths: no transient probe failure happened (all three re-Play probes were `outcome=ok` first try), no installed title has two launch options, and 47b was not run. They rest on the demoStatus, engineDecision, dialogQueue and launchOptionPicker suites, all passing at 6f1484ebb.

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

- H1 (minor): `DXSETUP.exe /silent` (DirectX Jun2010) exits 247 on the pinned Wine-Staging, so the entry never settles and is retried every launch. It completes on CrossOver bottles (38400, 648800).
- H2 (minor): the redist display-driver switch and restore call `killBottleWineServer`, which only knows CrossOver (`no CrossOver install found, skipping wineserver -k`). Under the fallback this logs "could not switch the bottle to the null display driver" and "could not restore the Wine display driver … the game may start with no display". The final state was fine: `[Software\\Wine\\Drivers]` is empty.
- H3 (minor, noise): every pinned-wine call logs `[ERROR] Couldn't find all library folders of Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)! Missing undefined and/or undefined!`, from Heroic's library-folder check on a wine with no lib paths.
- H4 (out of phase scope): Low Magic Age gets `SteamAPI_Init() failed` because the shim is withheld for interface coverage gaps. This is bridge shim coverage, not the engine fallback.
