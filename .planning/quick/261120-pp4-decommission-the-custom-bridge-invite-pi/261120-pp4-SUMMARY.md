---
phase: quick-261120-pp4
plan: 01
subsystem: steam-bridge
tags: [steam, bridge, invite, decommission, tauri, rust, c-helper, i18n]
status: complete
requires:
  - "2026-11-20 live gate: Steam's own invite picker works in bridged games (CrossOver, Wine-Staging)"
provides:
  - "Steam's own picker is the only invite picker in bridged games"
  - "Helper control slots 13 and 14 retired (STATUS_ERR, never reuse) in C and TS"
affects: [bridge_helper.c, helperSpawn, ipc contract, Rust shell, locales]
key-files:
  deleted:
    - src-tauri/src/login_window/invite_picker.rs
    - src-tauri/capabilities/bridge-invite-picker.json
    - src/common/bridgeInvitePicker.ts
    - src/frontend/bridgeInvitePicker/
    - src/frontend/components/UI/SteamBridgeInviteDialog/
    - src/frontend/state/SteamBridgeInvite.ts
    - src/backend/storeManagers/steam/bridge/inviteBridge.ts
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/helperSpawn.ts
    - src/backend/storeManagers/steam/bridge/protocol.ts
    - src-tauri/src/ipc_contract.rs (regenerated)
    - public/locales/*/gamelib.json (49 files, 13 lines each)
decisions:
  - "Slots 13/14 and the friend snapshot / lobby adoption removed, not just unreachable (item-4 evidence below)"
  - "win32 clippy ceiling lowered too: the removed warning sat in platform-independent code"
metrics:
  tasks: 3
  completed: 2026-11-20
commits: 4
plan_head_before: 159ae2f0a055f2adad7994e60165a01137aca886
plan_head_after: 7f5e50053cd4a4b173abf644aa2b09ef389c529f
actuals:
  tokens: 0
  tasks: 3
  commits: 4
---

# Phase quick-261120-pp4 Plan 01: Decommission the custom bridge invite picker Summary

GameLib's custom invite picker is gone end to end (window, RPC, capability, frontend root, dialog, state, sidecar channels, helper slots 13/14 with their friend snapshot and lobby adoption, catalogue strings). The helper still forwards the game's `ActivateGameOverlayInviteDialog` to Mac Steam, so Steam's own picker is the only one.

## Commits

- `fbe89d867` Task 1: picker window, trigger and frontend removed (40 files)
- `5049811c4` Task 2: slots 13/14 and the friend-list/invite RPC retired
- `7f5e50053` Task 3: 49 locale catalogues, skill note, todo moved to `completed/`
- `88d680dcb` is another task's docs commit (quick 261120-p2j) that landed between mine. `commits: 4` is the measured `rev-list` count over the ledger base; three are this plan's.

## Item-4 evidence (grep re-run before deleting)

- `steamBridgeListFriends` / `steamBridgeInviteFriend`: callers only `src/backend/sidecar/steamAuthFlowRegistration.ts:378,388` (the two handlers), `src/preload/api/steam.ts:53-54` (invokers), their schemas/tests. The one UI caller, `state/SteamBridgeInvite.ts`, was deleted in Task 1.
- `listBridgeFriends` / `sendBridgeInvite`: called only at `steamAuthFlowRegistration.ts:384,400`; the rest is `inviteBridge.ts` and its own test.
- Slots 13/14: the generated `steam_api_shim.c` has no 13 or 14 sender (grep empty); only `inviteBridge.ts` sent them.
- `g_friend_snapshot*`, `g_invite_lobby`, `g_invite_born_ms`, `g_invite_await_lobby`, `gl_invite_note_lobby_created`: every read sat in `gl_invite_send` (slot 14, `bridge_helper.c` ~2526-2553), `gl_invite_list_friends` (slot 13) and the two side-observer call lines (~1812, ~1859). No non-picker caller turned up, so all of it went.
- Kept, byte-identical: `gl_cr_complete`, `gl_cbq_offer`, `gl_note_join_from_mac`, `gl_p2p_note_lobby_from_mac`, `gl_mms_lobby_log`, the `GL_CBQ_ID_LOBBY_CREATED` row, and the `gl_friends_invite_dialog` forward plus its INVITE diagnostic line and 2 s gap.

## Gate results

- Gate A residue (picker identifiers, excluding `.planning`, `graphify-out`): 262 -> 0. Gate B residue: 220 -> 0 (only the dated history comment in `flowRegistrationCensus.test.ts`, as planned). `picker trigger` wording: 2 -> 0.
- `pnpm codecheck`, `pnpm check:ipc-contract`, `pnpm lint` (both scopes), `pnpm find-deadcode`, `pnpm boundaries`, `pnpm steam-line-ceiling`, `pnpm gameinfo-narrowing-ceiling`, `lint-translations:gamelib`, `i18n-churn-guard`: pass. `planning-gates`: 11 PASS, 1 FAIL (`state-sdk-field-anchor-gate.py`, pre-existing).
- Rust shell tests: 509 passed. `rustfmt` over hand-edited shell files: 0 diffs.
- TDD: `protocol.test.ts` RED assertion (no CONTROL_SLOT 3/13/14, none defined in the helper) failed before the `protocol.ts` edit and passed after. The harness `control-retired` mode replaces `control-unauth`; `invite-dialog`, `invite-dialog-ratelimit` and the 58-35 held-shim test (now on `CONTROL_SLOT.health`) pass.
- Clippy ratchet: `match_like_matches_macro` 1 -> 0 (the picker's navigation-allow `match` of `=> true, _ => false`); entry deleted on darwin and, because it was platform-independent code, on win32 too (win32 not re-measured locally; the windows-latest CI clippy leg is its measurement). The ratchet still exits 1 on the pre-existing `deprecated` warning in `gamelib-steampoll/tests/adoption.rs` (see `deferred-items.md`); every other lint equals its ceiling.
- `pnpm test:ci`: 8 failed / 22931 passed; all 8 pre-existing and unrelated (listed in `deferred-items.md`). `pnpm backend-di-ceilings` fails on 4 pre-existing entries from the Steam Verify quick.

## Helper rebuild

`pnpm build-steam-bridge` rebuilt `public/bin/arm64/darwin/steam-bridge-helper` (gitignored, no commit). `strings` shows 0 of the removed log formats (`lobby adopted`, `friends n=`, `reason=bad-ordinal`, `sent ok=`) and 1 `dialog appid=`. Local bridge installs need the rebuilt binary.

## Deviations from Plan

**1. [Rule 3 - Blocking] Preload stale comment moved into Task 1.** Gate A flagged the `bridge-invite` mention in `src/preload/api/steam.ts`; the plan listed that comment under Task 2. Removed in Task 1 so Gate A reads 0 at its commit; the two invokers went in Task 2.

**2. [Rule 1 - Bug] Rust-invoke channel census.** `rustInvokeSchemas.test.ts` pinned 118 Rust channels (now 117) and `ipcDomainCensus.test.ts` pinned 296 sidecar channels (now 294). Neither file was in the plan's list; fixed in Task 2 with dated notes. Also `tauriShellSource.test.ts` router arm count 118 -> 117 (Task 1), `lintScoped` unused-var in `helperSpawn.test.ts` (Task 1).

**3. Files tsc/gates forced into scope that the plan did not list:** `src/backend/sidecar/__tests__/ipcDomainCensus.test.ts`, `src/backend/sidecar/__tests__/rustInvokeSchemas.test.ts`. Both are prettier-clean.

**4. Plan battery not fully green.** The plan's gate chains assume a green baseline; pre-existing failures from earlier 2026-11-20 commits (clippy `deprecated`, DI ceilings, shell-source census, store kinds, others) are recorded in `deferred-items.md` and were not fixed (scope boundary).

## Known Stubs

None.

## Threat Flags

None. The change removes surface (a capability grant, a game-reachable stderr trigger, two authenticated control slots) and adds none.

## Self-Check: PASSED

- Commits `fbe89d867`, `5049811c4`, `7f5e50053` exist in `HEAD`'s history.
- Deleted files absent; `.planning/todos/completed/2026-11-19-test-steam-native-invite-picker-then-decommission-custom-picker.md` present with `## Resolution (2026-11-20)`; the pending copy is gone.
- `public/locales/en/gamelib.json`: committed diff is exactly 13 deletions; the three unrelated reorder hunks remain unstaged in the working tree.
