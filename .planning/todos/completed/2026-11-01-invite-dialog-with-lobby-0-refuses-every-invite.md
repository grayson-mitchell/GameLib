---
created: 2026-11-01
title: "Invite dialog opened with lobby id 0 refuses every invite until a second '+' press"
area: steam-bridge
files:
  - native/steam-bridge/helper/bridge_helper.c
  - src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c
severity: major
platform: macos
ready: live-gate
---

## Trigger

Schedule I calls `ActivateGameOverlayInviteDialog` in the same instant as `CreateLobby` and passes lobby id 0. `gl_friends_invite_dialog` (`bridge_helper.c` ~line 2278, stores at ~2288) sets `g_invite_lobby = 0`. The picker still opens, and every Invite returns `refused reason=no-pending` (the ~2406 branch): 3 times at 16:06:29, 16:06:37 and 16:06:41, and also at 15:24:23. A second '+' press works.

Severity is major because the main-menu invite is now the reliable host path.

## Likely cause

The dialog call arrives before the lobby exists, so the stored lobby is 0 and the send path treats 0 as "nothing pending". The helper already relays 513 (LobbyCreated_t) from quick 261031-ixa, but nothing feeds that id back into `g_invite_lobby`.

## What done looks like

A single first '+' press that arrives with lobby 0 leads to a successful `INVITE sent ok=1`, with no `refused reason=no-pending`. A harness case covers dialog-with-0 followed by 513.

Fix direction:

- When lobby is 0, keep the dialog pending and adopt the lobby id from the LobbyCreated_t (513) call result or broadcast for that CreateLobby.
- Alternative: do not fire the picker until a lobby is known.

## Verify

Harness case for dialog-with-0 then 513, then a live check: first main-menu '+' press, pick a friend, `INVITE sent ok=1`, zero `refused reason=no-pending`.

## Related

`2026-11-01-main-menu-invite-is-a-supported-host-path.md`.

## Resolution

2026-11-01 (quick 261101-mv3): A dialog that arrives with lobby 0 now arms `g_invite_await_lobby`. The first successful LobbyCreated_t (513) the pump sees adopts the lobby id, from either the call result or the broadcast, and adoption is not gated on ring space. Adoption is one-shot, never overwrites an explicit lobby, and does not reset `born_ms`, so a late or stray 513 can never extend a dialog's 10-minute window. A click before 513 returns -1 (wire and UI unchanged) and logs `refused reason=lobby-pending`. Harness cases: `invite-zero-adopt` and `invite-zero-guards`.

Live check still owed: first main-menu '+' press in Schedule I, pick a friend, expect `INVITE lobby adopted` then `INVITE sent ok=1`, and zero `refused reason=no-pending` / `lobby-pending`. Until then this stays open in spirit.
