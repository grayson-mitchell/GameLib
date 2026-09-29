---
created: 2026-09-29
title: "Phase 24's two criticals (24-CR-01 string-return marshaling, 24-CR-02 shim/def symbol parity) are both correct at HEAD, but a mutation re-creating 24-CR-02 exactly left 124/124 jest green and tsc exit 0 — neither fix is pinned by any test"
area: steam
severity: medium
platform: any
ready: code
source: "quick task 260929-lrh (the phase 29/41/24 critical-disposition audit) — the audit confirmed both fixes intact and deliberately scoped the missing pin OUT, filing it here"
files:
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - native/steam-bridge/generated/steam_api.def
  - meta/gen_vtables.ts
  - meta/__tests__/gen_vtables.test.ts
---

## 1. What is correct at HEAD, and where

**24-CR-01 — string-return marshaling.** `isStringReturn()` at `meta/gen_vtables.ts:117` and
`STRING_RETURN_BUF_BYTES = 256` at `meta/gen_vtables.ts:129` are consumed at `:257`/`:293`/`:297`
and emitted into `native/steam-bridge/generated/steam_api_shim.c:37`, used at `:199-210`
(`vt_SteamFriends018_GetPersonaName_buf`). Fixed in `1e744d204`. **Correct at HEAD**, re-confirmed
2026-09-29.

**24-CR-02 — shim/def symbol parity.** `SHIM_EXPORTED_SYMBOLS` at
`src/backend/storeManagers/steam/bridge/shimGenerate.ts:63` must cover every symbol in
`native/steam-bridge/generated/steam_api.def` (12 symbols, re-counted 2026-09-29). Consumed at
`shimGenerate.ts:231`. Verified identical. Fixed in `934e51a0f`. **Correct at HEAD.**

Lead with this: the code is right. The gap is the pin.

## 2. What the gap is

Neither fix is pinned by any test. The mutation proof, re-derived and run: deleting
`'SteamAPI_SteamUser_v023'` and `'SteamAPI_SteamFriends_v018'` from `SHIM_EXPORTED_SYMBOLS` —
re-creating CR-02 exactly, a defect that wrongly rejects shim placement for any interface-using
game — left **124/124 jest tests green across 8 suites** and `tsc --noEmit` **exit 0**. A defect
that CR-02 was specifically opened to fix can be reintroduced today and every automated gate in the
repo stays green.

In production, that defect's effect is: shim placement is wrongly rejected for any game that uses
one of the two omitted interfaces (`SteamUser` v023, `SteamFriends` v018) — the exact interfaces
CR-01's own string-return fix (`GetPersonaName`) depends on.

## 3. Why nothing caught it

The single existing test reference to either symbol is
`meta/__tests__/gen_vtables.test.ts:190` — `expect(def).toContain('SteamAPI_SteamUser_v023')` —
which asserts the *generated* `.def` file contains the symbol. That is the opposite side of the
parity CR-02 was about (`.def` → `SHIM_EXPORTED_SYMBOLS`, not `SHIM_EXPORTED_SYMBOLS` → `.def`), so
it stays green under the mutation by construction — it never reads `SHIM_EXPORTED_SYMBOLS` at all.
`isStringReturn` / `STRING_RETURN_BUF_BYTES` (24-CR-01) have **zero** test references anywhere in
the repo.

## 4. Proposed fix

A parity test asserting `SHIM_EXPORTED_SYMBOLS` equals the `.def` file's export list exactly (set
equality both directions) — honestly, about ~10 lines, and it would have caught CR-02 originally
had it existed then. Describing it here, not writing it.

The implementer will hit this constraint first: `tsconfig.json`'s `include` is `["src"]` only, so
`src/` cannot statically import `meta/` (recorded in situ at `shimGenerate.ts:54-55` and in the
comment above `SHIM_EXPORTED_SYMBOLS`) — this is *why* the two lists are hand-synced rather than
imported, and it is the reason the parity can drift silently at all. The new test must read
`native/steam-bridge/generated/steam_api.def` from disk and parse its symbol list independently,
rather than importing anything from `meta/`.

## 5. Scope note

This todo describes a test. It does not contain one — no test file was created or modified by the
audit that filed this. `ready: code` means desk-ready: editable and typecheckable with no live gate
and no second operating system required.
