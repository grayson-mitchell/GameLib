---
phase: quick-261101-mv3
plan: 01
subsystem: steam-bridge
tags: [invite, lobby, helper, net-harness]
requirements: [TODO-2026-11-01-invite-dialog-with-lobby-0]
key-files:
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/net_harness_driver.c
    - src/backend/storeManagers/steam/bridge/__tests__/helperNetHarness.test.ts
    - .planning/todos/completed/2026-11-01-invite-dialog-with-lobby-0-refuses-every-invite.md
completed: 2026-11-01
---

# Quick 261101-mv3: Adopt lobby id for lobby-0 invite dialog

A dialog arriving with lobby 0 now arms `g_invite_await_lobby`; the first successful 513 (call result or broadcast, not gated on ring space) is adopted one-shot via `gl_invite_note_lobby_created`, so the first Invite click sends.

## Commits
- fb9cf3974 fix: helper change (flag, hook at both pump sites, `lobby-pending` refusal word reusing wire code -1)
- 1f650542e test: `invite-zero-adopt` and `invite-zero-guards` net-harness cases (513 injected through the real pump)
- 22a677bf4 docs: todo moved to completed/, `ready: live-gate`, Resolution plus live check owed

## Verification
- `pnpm build-steam-bridge` passes (both compile gates).
- helperNetHarness, helperProcess, inviteBridge jest suites: 112 passed, including both new cases.
- prettier --check on helperNetHarness.test.ts passes; `pnpm codecheck` passes.
- `pnpm planning-gates`: 11/12; only the known pre-existing state-sdk-field-anchor failure.
- `graphify update .` ran.

## Deviations from Plan
None. `born_ms` is intentionally not reset on adoption (per plan).

## Live check still owed
First main-menu '+' press in Schedule I: expect `INVITE lobby adopted` then `INVITE sent ok=1`, no `refused reason=no-pending`/`lobby-pending`.

## Self-Check: PASSED
