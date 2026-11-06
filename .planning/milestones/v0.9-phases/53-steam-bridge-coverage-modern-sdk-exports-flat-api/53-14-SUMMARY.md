---
phase: 53-steam-bridge-coverage-modern-sdk-exports-flat-api
plan: 14
subsystem: steam-bridge
tags: [wire-policy, gen-vtables, GetAuthSessionTicket, out-buffer, null-in, live-gate]
requires: []
provides:
  - "SteamUser021/023 GetAuthSessionTicket and CancelAuthTicket forwarded through the helper"
  - "ParamKind null-in (const SteamNetworkingIdentity*), NULL passed helper-side"
  - "out-buffer support in the helper dispatch with lenParam"
affects: [53-16]
key-files:
  modified:
    - meta/gen_vtables.ts
    - meta/extractProtonInventory.ts
    - meta/sdk/wire-policy.json
    - meta/sdk/isteamuser.manifest.json
    - meta/sdk/isteamuser021.manifest.json
    - native/steam-bridge/generated/bridge_dispatch.h
    - native/steam-bridge/generated/steam_api_shim.c
decisions:
  - "Hang hypothesis REFUTED: ticket now succeeds, the 427410 loading hang survives"
metrics:
  tasks: 3
  completed: 2026-10-25
---

# Phase 53 Plan 14: GetAuthSessionTicket forward Summary

GetAuthSessionTicket and CancelAuthTicket are now forwarded to the real Steam client and return a real ticket. Abiotic Factor (427410) still hangs at loading, so the plan's hang hypothesis is refuted. The bridge is not verified for this title.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 RED | 0d0d0b96c | Tests pin out-buffer/out-value marshaling and helper-side NULL identity |
| 1 GREEN | f89e64673 | Wire stubs for both SteamUser versions, helper dispatch with 5 args ending in NULL |
| 2 | (checkpoint) | Operator live launch of 427410 |
| 3 | 648ffd194 | UAT item 14 (issue) and the follow-up todo |

## Step 0 finding

Pre-fix Saved log: `Failed to acquire Steam auth session ticket for 0` twice (21.34.56, 21.35.57 log clock), the last Steam/OnlineIdentity line before the hang, with EOS warnings coexisting. That supported the hypothesis but did not prove it.

## Build facts (recorded before scoring)

- public/bin/arm64/darwin/steam_api64.dll 497664 bytes (12:03:57); helper 153376 bytes; sidecar rebuilt 12:04:46, after the feat commit at 12:04:27.
- Bottle shim after the launch: 497664 bytes (replaced; the game's own copy was 402944 before and is kept as `.gamelib-orig`, 295336 bytes in the bottle).
- Packaged build exited 1 only at updater signing (no TAURI_SIGNING_PRIVATE_KEY), as in 53-09.

## Live result (427410)

- gamelib.log: `HELLO  shim attached appid=427410` (12:11:45), then CALL BIsSubscribed, GetAppID, GetSteamID, GetPersonaName, BLoggedOn, `CALL   SteamUser023.GetAuthSessionTicket` (12:12:03). No further CALL lines until the game was stopped at 12:16:21.
- Current Saved log: 0 occurrences of "Failed to acquire Steam auth session ticket"; three `LogOnlineIdentity: STEAM: Obtained steam authticket` (23.12.03, 23.12.45, 23.16.04).
- Operator, verbatim: `still hangs at loading`.
- Hypothesis (the failed ticket causes the hang): REFUTED. The ticket path was a real wrong-zero and is fixed, but it was not the cause of the hang.
- Bridge verification stays strict: HELLO plus a clean game Steam-init log is present, but the game does not load, so this is recorded as `issue`, not a pass. In-Game does not count.

## Deviations from Plan

All made in Task 1.

1. [Rule 3 - Blocking] The helper dispatch had no out-buffer support. Added it, with `lenParam` on out-buffers.
2. [Rule 3 - Blocking] Added the new `null-in` ParamKind, accepted only for `const SteamNetworkingIdentity*`, as the plan allowed.
3. [Rule 3 - Blocking] `helperTrailingNullArgs` is derived from the per-method `helperNativeArgs: 4` (the plan allowed either form).
4. [Rule 2 - Security, T-53-56] Hardening: negative cbMaxTicket gives capacity 0; no copy past the caller's capacity; out-values zeroed on transport failure; the helper clamps to 4084 ticket bytes. WIRE_OUT_BUFFER_MAX_BYTES is 4096.

## Deferred Issues

- `pnpm planning-gates` is 11/12: planning-frontmatter-gate fails on `53-VERIFICATION.md` (frontmatter does not parse at 4:82). Pre-existing, file not touched by this plan, and the todo gate passes. Logged in deferred-items.md.

## Follow-up

Todo `.planning/todos/pending/2026-10-25-abiotic-factor-loading-hang-after-auth-ticket.md` (severity major, platform macos, ready live-gate). Next candidates: the GetAuthSessionTicketResponse_t callback never relayed to the game, EOS login waits, or a non-Steam fault (capture wine +err).

## Known Stubs

None.

## Self-Check: PASSED

Commits 0d0d0b96c, f89e64673 and 648ffd194 exist; the todo and UAT item 14 are written.
