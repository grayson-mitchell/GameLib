---
status: complete
plan: 261026-qvc
requirements: [QVC-01]
commits: [e55c916d1, 60085b702]
---

# Quick 261026-qvc: wire ISteamFriends::GetFriendPersonaName

Generator now admits CSteamID as a by-value wire param (CGameID still rejected, reason recorded in the STRUCT_PARAM_TYPES comment). GetFriendPersonaName is wired in SteamFriends011/013/015/017/018 (helperFlat `SteamAPI_ISteamFriends_GetFriendPersonaName`), with shim and dispatch regenerated. The wire-table hash went from `e05aec2c174d` to `00e358feeee6`, and only the two generated files carried it.

## Verification
- gen_vtables, shimAbiGate (executed, not skipped), buildSteamBridgeShims and src/backend/storeManagers/steam/bridge suites: 25 suites, 1034 tests pass.
- tsc, scoped prettier and `pnpm planning-gates` (12/12) pass. meta/bridgeCensus.ts is untouched.
- shimAbiGate: i386 `retl $0x8`; x64 `movq %rdx` store and a plain `retq`.

## Built sizes (public/bin/arm64/darwin)
steam_api.dll 290304 (unchanged), steam_api64.dll 505344 (was 497664/501248), steam-bridge-helper 156688 (was 153376). No code or test hard-codes these sizes.

## Deviations
- [Rule 1 - test helper] `lastReturnInstruction` reads the next unexported function's epilogue, because objdump labels only exported symbols. Added `firstReturnInstruction` for the two new tests (single-epilogue thunks). The shim itself was correct.
- Cosmetic: the manifest JSON was rewritten via prettier. No .def changes.

## Known Stubs
None introduced.
