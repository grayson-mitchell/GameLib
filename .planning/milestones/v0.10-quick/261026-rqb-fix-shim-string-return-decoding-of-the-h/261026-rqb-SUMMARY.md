---
phase: quick-261026-rqb
plan: 01
status: complete
requirements: [RQB-01]
---

# Quick 261026-rqb: Fix shim string-return decoding

The generated shim now decodes the helper's `[u32 len][bytes]` string reply instead of handing the game the raw frame (length prefix included). Live confirmation is pending (orchestrator gate).

## Commits
- 6d8a4c94c fix: generator emitters, shim decode, regenerated shim
- 79d6cd28f chore: bridge_dispatch.h regenerated (comment only)
- e7e0eff4a test: round-trip harness
- (Task 3 docs commit: todo + 53-UAT item 36)

## Sizes (after pnpm build-steam-bridge)
steam_api.dll 290816 (was 290304), steam_api64.dll 506368 (was 505344), steam-bridge-helper 156688 (unchanged). No live size assertions depended on the old numbers.

## Tests
gen_vtables 242 pass; Task 3 run (gen_vtables, shimAbiGate, buildSteamBridgeShims, stringReturnRoundTrip, steam/bridge): 26 suites / 1048 tests pass. fakeHomeIsolation green, tsc clean, planning-gates 12/12.

## Findings
- Other retbuf consumers (out-buffer, sret, scalar, presence, CREATE_INTERFACE control slot) are not length-prefixed on the wire; no change.
- protocol.ts is frame-level only; no string encode/decode there.
- Old retbuf (255) vs helper max encode (259) latently dropped the connection for 252..255-byte strings; retbuf is now 259.
- RED proof (scratchpad copy with the old raw-copy decode): `FAIL seven_byte_name strlen(got) == 7`.
- ASan/UBSan available with Apple clang; harness ran with `-fsanitize=address,undefined`.
- prettier --file-info for the .c harness: inferredParser null (not in --check). Both .planning paths are prettier-ignored.
- audit-uat is not on PATH; not run.

## Deviations
- bridge_dispatch.h changed (the plan expected byte-identical): WIRE_LAYOUT_DOC is embedded there, and the planned DOC tightening altered a comment. Table hash unchanged; helper binary size unchanged. Committed separately.
- The new gen_vtables describe block sits inside the last existing describe (cosmetic).

## Not touched
`.planning/todos/completed/2026-10-25-mining-mechs-win32-error-dialogs-on-launch.md` left untouched (unrelated user edit). Hypothesis that Mining Mechs' Win32 dialogs come from a garbage GetCurrentGameLanguage is recorded as unproven in the Overlooting todo.
