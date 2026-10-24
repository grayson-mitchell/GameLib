---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 10
subsystem: steam-bridge
tags: [abi, win64, flat-api, gen_vtables, gap-closure]
requires: []
provides:
  - Win64 hidden-pointer flat exports for struct returns of size other than 1/2/4/8
  - fail-closed structSize guard (WR-07)
  - x64 `_ret` refusal in validateManifest (WR-08)
affects: [53-12]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/__tests__/gen_vtables.test.ts
    - meta/sdk/isteaminput006.manifest.json
    - meta/sdk/isteamgameserver014.manifest.json
    - meta/sdk/isteamgameserver015.manifest.json
    - meta/sdk/isteamfriends.manifest.json
    - native/steam-bridge/generated/steam_api_shim.c
key-decisions:
  - "Struct returns are modelled as returnKind 'class' + structSize, never a leading `_ret` param on x64."
  - "Vtable path keeps sret for every class return (MSVC member rule); flat path uses RAX only for 1/2/4/8 bytes."
requirements-completed: [D-53-01, D-53-03, D-53-05]
duration: ~25min
completed: 2026-10-25
---

# Phase 53 Plan 10: Flat struct-return ABI (CR-01, WR-01, WR-07, WR-08) Summary

Flat exports now follow the Win64 C ABI for struct returns: 1/2/4/8-byte structs return in RAX, any other size uses `void *f(void *ret, void *self, ...)`, and the generator refuses x64 `_ret` manifests and unsized class returns.

## Tasks and commits

| Task | Commit | Notes |
| ---- | ------ | ----- |
| 1 RED | 52734bedf | failing tests |
| 1 GREEN | 04ed2e55a | generator: isRaxStructSize, isHiddenPointerFlatReturn, hidden-pointer emit + reconcile, WR-07 guard, x64 `_ret` refusal, ABI comment |
| 2 | 624e3e094 | four manifests remodelled, shim regenerated, vtable/WR-01 tests |

## Measured struct sizes (Proton 2c620c0fd7c2c424f6bd91898602bdc4d4260468, lsteamclient/)

- InputDigitalActionData_t = 2: `unixlib_generated.cpp:7041` `C_ASSERT( sizeof(InputDigitalActionData_t) >= 2 )`, bState@0, bActive@1.
- InputAnalogActionData_t = 16: `unixlib_generated.cpp:7031` asserts `>= 13`, last field bActive@12 (1 byte); natural 4-byte alignment pads to 16. Derived from offsets, not a literal assert.
- InputMotionData_t = 40: `unixlib_generated.cpp:7085` `>= 40`, rotVelZ@36.
- SteamIPAddress_t = 20: `steamclient_structs.h:54` `typedef struct { uint8_t _[20]; } SteamIPAddress_t;`.

## Vtable-path return convention evidence

- Microsoft x64 calling convention doc: "User-defined types can be returned by value from global functions and static member functions. ... Otherwise, the caller must allocate memory for the return value and pass a pointer to it as the first argument. The remaining arguments are then shifted one argument to the right." Non-static member functions are outside the RAX case, so a 2-byte POD member return is sret.
- Proton `winISteamInput.c:1931`: `InputDigitalActionData_t * __thiscall winISteamInput_SteamInput006_GetDigitalActionData(struct w_steam_iface *_this, InputDigitalActionData_t *_ret, uint64_t inputHandle, ...)` takes a `_ret` hidden pointer for the 2-byte struct.
- Both agree, so the vtable stub keeps sretOut for every class return. Pinned by test `53-10: x64 vtable class return of 2 bytes is sret ...`. No `memberReturnsInRax` flag was needed.

## Friends018

The seven `_ret` params were removed and the real SDK params restored (GetFriendByIndex gained iFriendFlags; GetClanByIndex iClan; GetCoplayFriend iCoplayFriend; the CSteamID-taking methods gained their trailing int32). Each was cross-checked against `winISteamFriends.c` SteamFriends018 thunks and matched. The x86 vtable stub bodies are unchanged (only header comments changed); stackBytes values were already consistent. SteamFriends011/013 (x86-only) untouched. stackBytes on the x64-only Input006/GameServer manifests is kept as extracted (informational).

## Verification

- gen_vtables, shimAbiGate and steam bridge suites: 19 suites, 706 tests pass.
- `pnpm gen-vtables` idempotent; `pnpm build-steam-bridge` passes (x86, x64, steamclient64); steam_api64.dll exports 512 `SteamAPI_ISteam*` symbols.
- prettier --check clean over the JSON/TS paths.

## Deviations from Plan

- [Rule 1] The pre-existing test "refuses a class return wider than 8 bytes, accepts 8" pinned the old behaviour this plan removes; rewritten to assert the hidden-pointer signature.
- Existing out-of-scope failures in `meta/__tests__` (i18n pluralCategoriesFor, genI18nGateScope fork-touched anti-rot) are unrelated to this plan and not touched.
- Incidental generated change: flat parameter types for sibling Friends versions narrowed from uint64 casts to `int32_t` (correct, follows reconcile of now-accurate params).

## Self-Check: PASSED
