---
phase: quick-261027-jgs
plan: 01
subsystem: steam-bridge
tags: [steam-bridge, shim, helper, diagnostics, elex]
requires: [quick-261027-ijs]
provides:
  - "helper control slot 8 REPORT_STUB_CALL, logged as STUBCALL"
  - "shim gamelib_stubcall_note one-shot reporter at 2078 locally-answered manifest sites"
  - "256 per-slot x64 null thunks plus a 32-entry per-version null-object pool"
affects: [native/steam-bridge, meta/gen_vtables.ts]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/__tests__/shimAbiGate.test.ts
    - native/steam-bridge/generated/steam_api_shim.c
metrics:
  completed: 2026-10-27
---

# Quick 261027-jgs: STUBCALL first-call logging for locally-answered Steam calls

Every Steam interface call that the shim answers without a wire round-trip now logs one `STUBCALL` line the first time the game makes it. Stub, helperFallback and SteamClient off-path methods log `<VERSION>.<Method> slot=<n> kind=stub|fallback|offpath`. Non-sret x64 null-object slots log `<VERSION> slot=<n> kind=null`. Return values, out-params, sret zero-fill and callee-clean `ret N` are unchanged, and NULLSRET (slot 7) is untouched.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 | 1292d1b10 | helper slot 8 handler (bounds, sanitise, auth-only, 256 cap + one cap line), protocol.ts `reportStubCall: 8`, helperIntegration tests |
| 2 | 859a64ff0 | shim `gamelib_stubcall_note` plus a report site in every stub / helperFallback / off-path answer, regenerated shim, parity + generator + ABI tests |
| 3 | d03c037df | 256 `vt_x64_null_s<N>` thunks, named table + 32-entry pool + state array, `x64_null_call_note`, new `x64_null_object_for_version`, ABI gate |

## Verification (verbatim)

- `npx jest meta/__tests__/gen_vtables.test.ts meta/__tests__/shimAbiGate.test.ts src/backend/storeManagers/steam/bridge/__tests__/protocol.test.ts src/backend/storeManagers/steam/bridge/__tests__/helperIntegration.test.ts`: `Test Suites: 4 passed, 4 total`, `Tests: 333 passed, 333 total`. shimAbiGate ran (no SKIPPED); zig resolved.
- Counts derived from the files: report sites in shim = 2078, node-computed expectation from `meta/sdk` manifests = 2078. `g_x64_null_object_vtbl[256]` and 256 thunks. Live `vt_x64_null_object` = 0. `GLIB_X64_NULL_SRET_SITES 140` and 140 sret functions.
- `pnpm gen-vtables` changed only `steam_api_shim.c` among the generated outputs.
- `pnpm build-steam-bridge`: helper compiled, all three compile gates PASSED (x86, x64, steamclient64).
- `strings steam-bridge-helper | grep -c STUBCALL` = 1. `strings steam_api64.dll | grep STEAMAPPS_INTERFACE_VERSION008` hits.
- `pnpm codecheck` rc 0. `pnpm lint`: `1106 problems (0 errors, 1106 warnings)`. `pnpm find-deadcode`: `unreachable: 46 OK | used-in-module: 0 OK`. `pnpm planning-gates`: `12/12 planning gates passed.` `graphify update .` ran.
- Prettier: `--file-info` reports `"ignored": false` and parser `typescript` for all 7 TS paths; `--check` clean. Not run on the C files (no parser).

### Artifact mtimes (public/bin/arm64/darwin, gitignored)

| File | mtime |
| ---- | ----- |
| steam-bridge-helper | Oct 27 14:22:15 2026 |
| steam_api.dll | Oct 27 14:22:16 2026 |
| steam_api64.dll | Oct 27 14:22:17 2026 |
| steamclient64.dll | Oct 27 14:22:17 2026 |

## Lock checks (T-jgs-05)

Script over the regenerated shim: 14 regions (`AcquireSRWLockExclusive(&g_bridge_lock)` / `GL_CB_LOCK()` to the matching release). Flagged any `vt_*`, `vt[`, `gamelib_stubcall_note`, `x64_null_*`, `vptr`. Result: `regions 14 hits 0`, so neither `g_bridge_lock` nor `g_cb_registry_lock` is held across any `vt_*` function, any stub, or `gamelib_stubcall_note`. `x64_null_object_for_version` is only called from the GetISteam* lookup stubs and flat lookups, none inside a locked region. `g_x64_null_pool_lock` is a leaf: one acquire, one release, no return or bridge_transact between (unit-tested).

## ABI proof

- i386: `retl $0x4` on the sret stub is unchanged (callee-clean survives the added call).
- x64 sret stub: `mov %rdx,%rsi` / `movq $0x0,(%rdx)` / call / `mov %rsi,%rax` / plain `retq`. `%rcx` is never the store base.
- x64 null thunk `vt_x64_null_s0`: `xorl %edx,%edx; callq note; xorl %eax,%eax; ... retq`. RAX is zeroed after the last call and nothing writes it later.

## Deviations from Plan

**1. [Rule 1 - test premise] `lastReturnInstruction` no longer valid for the stubs.** objdump labels only exports, so the extracted block now runs on into the unexported `gamelib_stubcall_note` / `x64_null_call_note` neighbours. The i386 `ret $0x4` test and the x64 gate tests now cut at the stub's first ret (single epilogue). The ijs gate was not changed except to use the shared `rdxReturnedInRax` helper.

**2. TDD order.** Task 1 tests were written and seen failing first (slot 8 returned STATUS_ERR). Tasks 2 and 3 implemented the generator first, then migrated and wrote tests; the existing tests that broke against the new output were the failing evidence.

**3. Verify commands.** The plan's `grep -v ... | grep -c` pipelines return empty in this shell (the `grep` function and a non-UTF8 byte in the 2MB shim). I used `/usr/bin/grep -a`. Numbers match the plan's rules.

## Deferred / out of scope

Pre-existing unrelated failures in the full `meta/__tests__` run (pluralCategoriesFor ru/ar, genI18nGateScope A-17, isIntelMac zero-match, findDeadcode CLI). The findDeadcode one cleared by itself later (another concurrent change in `librarySort.ts`). Not touched.

## Operator steps for the ELEX (411300) rerun

1. Restart `pnpm tauri dev` (dev does not rebuild or restage the helper and DLLs until restart).
2. Launch ELEX.
3. Read the helper log in time order: the CALL line, every STUBCALL line, and especially the last STUBCALL before the hang.
4. A `kind=stub` on a SteamAPICall_t-returning method (FileReadAsync, or any UGC / RemoteStorage async) is the lead for the hypothesis.

## Known gaps (design 6)

Not reported: SteamClient GetISteamXxx lookups (the first call on the returned proxy / null object is reported instead), the flat-export fall-through for a non-served `self`, the GameServer flat stubs, lifecycle no-ops, and legacy CSteamworks exports. An old helper answers STATUS_ERR, which re-arms a site at most 3 times. XMM0 on float-returning null slots is unspecified, as before. A 64+ char game-supplied version is matched on its first 63 characters in the pool.

## Self-Check: PASSED

Commits 1292d1b10, 859a64ff0, d03c037df exist. Modified files exist. Working tree still holds unrelated uncommitted changes (not staged by this task).
