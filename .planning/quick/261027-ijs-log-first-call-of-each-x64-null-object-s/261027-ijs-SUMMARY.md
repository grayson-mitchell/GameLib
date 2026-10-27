---
phase: quick-261027-ijs
plan: 01
subsystem: steam-bridge
tags: [bridge, shim, x64, null-object, sret, diagnostics]
requires: [quick-261027-i4x]
provides: [CONTROL slot 7 REPORT_NULL_SRET, NULLSRET helper log line]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - meta/gen_vtables.ts
    - native/steam-bridge/generated/steam_api_shim.c
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/shimAbiGate.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - .planning/todos/pending/2026-10-26-x64-null-object-sret-aware-per-family.md
metrics:
  completed: 2026-10-27
---

# Quick 261027-ijs: NULLSRET instrumentation Summary

The shim now reports the first game call of each per-version x64 sret null-object slot to the helper, which logs `NULLSRET <version> slot=<n> size=<bytes>`.

## Commits
- d6f4ef20d feat: helper slot 7 + protocol.ts + helper tests
- e2f073ba6 feat: per-site sret functions, one-shot reporter, regenerated shim, tests
- d543d28f1 fix: no-regex-spaces lint in a new test regex
- f55b4318c docs: Progress line on the todo

## Deviations
1. **Orchestrator amendment (applied):** `x64_null_sret_note` resets the site's reported flag to 0 when `bridge_transact` fails, with a per-site attempt counter capped at 3 (`g_x64_null_sret_attempts`). Pinned by a gen_vtables test on the emitted C. Memset and return value are untouched.
2. **[Plan error] Site count is 140, not 189.** The inventory holds 189 sret slots, but versions an x64 manifest serves get a real proxy, not a null object (existing i4x behaviour). The regenerated shim has 140 sites. The test computes the expected count from inventory minus served versions rather than hardcoding 189.
3. **[Format] Log line has ONE space after NULLSRET.** `logts` uses `%-6s `, and NULLSRET is 8 characters, so the line is `NULLSRET SteamController003 slot=12 size=16`, not two spaces. Grep for `NULLSRET SteamController003`.
4. **[Rule 1] Lint:** `no-regex-spaces` error in a new test regex, fixed in d543d28f1.
5. TDD note: helper handler and tests were written together before the first run; the first run failed only on the log-format assumption in the test (item 3), not on a missing handler.

## ABI gate
The sret function now makes a call, and clang inlines the reporter. The disassembly shows `movq %rdx, %rsi` at entry and the value returned from the callee-saved register. The gate asserts either direct rdx->rax or rdx->R followed by R->rax (R in rbx/rsi/rdi/rbp/r12-r15) plus a plain final ret. shimAbiGate ran for real (zig 0.16.0), 7/7 passed, not skipped.

## Lock-safety grep (T-ijs-06)
Every hit for `x64_null_object_for_version` / null-object instances is a definition or a `return` to the caller (lines 3135/3142 and the `return local != NULL ? local : x64_null_object_for_version(...)` sites). No shim path invokes a null object under g_bridge_lock or g_cb_registry_lock.

## Verification (verbatim)
- helperIntegration: 18 passed. gen_vtables: 255 passed. gen_vtables + protocol: 293 passed. shimAbiGate: 7 passed.
- Only steam_api_shim.c changed among generated outputs.
- `pnpm build-steam-bridge`: helper and all three DLLs rebuilt (13:29 NZDT); `strings` finds NULLSRET in the helper and SteamController003 in steam_api64.dll.
- `pnpm codecheck`: clean. `pnpm find-deadcode`: "unreachable: 46 OK | used-in-module: 0 OK". `pnpm planning-gates`: "12/12 planning gates passed". `pnpm lint`: "1110 problems (0 errors, 1110 warnings)".
- Todo frontmatter unchanged (diff check returned 0 key changes).

## Operator steps for the ELEX rerun
1. Artifacts are already rebuilt (`pnpm build-steam-bridge`; rerun it after any further change to the shim or helper).
2. Restart `pnpm tauri dev` (dev does not rebuild the sidecar; the helper and DLLs are staged from public/bin/arm64/darwin).
3. Launch ELEX (411300) and grep the helper log for `NULLSRET SteamController003`. Expect slot 9 size 2 or slot 12 size 16 if the game calls them. Absence after a full load means the game never called an sret slot.

## Known Stubs
None.

## Self-Check: PASSED
Commits d6f4ef20d, e2f073ba6, d543d28f1, f55b4318c exist; modified files present.
