---
status: human_needed
score: 8/8 must-haves verified in code and tests
human_verification:
  - test: "Bridge-launch 1363080 or 219990 on this Mac with the logged-in Steam client"
    expected: "Play button shows Installing Redistributables (...); msvcp140.dll in bottle system32/syswow64; HasRunKey values under HKLM\\Software\\Wow6432Node\\Valve\\Steam\\Apps\\CommonRedist; second launch shows no redist step and makes no CM/wine calls for it"
    why_human: "Needs real CM keys for 228980 (assumption A1), real wine and the live bottle"
---

# Quick 261025-rkj Verification

Status: human_needed. All code-level truths verified; the live launch is the only open item.

- Pure module, depot entry point (downloadSharedRedistDepots), runner and tests exist and are substantive (commits a8453133f, 2f22e5a47, b5ed4a3c3).
- Wiring: games.ts fireBridgeWineLaunch awaits installSteamBridgeSharedRedists after applySteamBridgeKnownFixes and before the monitor, with a .catch that only logs. The DLL-override ordering is not asserted by test (by construction only).
- steamSharedRedists is in TRUSTED_ONLY_KNOWN_FIX_KEYS (knownFixes.ts:104-106), stripped from the remote layer; covered by knownFixesLayered test.
- Ledger: sharedRedistInstall.ts settles only when failed is empty, no timeout stop and no entry failure; the timeout path writes a timedOut marker (not done) and stops further entries; the runner never rejects.
- Todo is in .planning/todos/completed/ and absent from pending/.
- Jest run by me (bridge dir, depot.sharedRedist, games, knownFixesLayered): 23 suites, 1042 tests, all passing. No TBD/FIXME/XXX markers in the new files.

Residual limits (accepted in SUMMARY): a timed-out installer child cannot be killed, and a settled ledger does not notice newly declared depots.
