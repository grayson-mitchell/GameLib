---
phase: 67-schema-validation-at-the-sidecar-ipc-boundary
plan: 08
subsystem: ipc
tags: [rust, serde, dispatch, keyring, dialog, tray, scan]
requires: [67-06]
provides: [26-arms-on-generated-args]
key-files:
  modified:
    - src-tauri/src/store_embed.rs
    - src-tauri/src/main.rs
    - src-tauri/src/clipboard.rs
    - src/backend/__tests__/dialogOptionForwarding.test.ts
    - src/backend/scanners/__tests__/scanChannelParity.test.ts
decisions:
  - "Scan arms validate through the generated Args then pass the original args to gamelib_scan::dispatch, which stays the stricter (deny_unknown_fields) authority; error string is the same <op>:bad-args"
  - "tray_set_icon keeps a lenient Auto fallback when from_args fails (unknown variant / retired dark-bool shape), preserving the pinned wire-compat tests"
  - "keyring_slot_arg replaced by const KEYRING_DEFAULT_SLOT; absent slot still defaults, a present non-string (or null) slot is now keyring:bad-args"
metrics:
  completed: 2026-11-08
requirements: [V67-E]
---

# Phase 67 Plan 08: 26 dispatch arms on generated Args Summary

26 `dispatch_rust_channel` arms (4 keyring, 3 dialog, notification, 2 shell, 2 clipboard, 4 app/window, tray, 2 wake-lock, 6 scan) now call `<Channel>Args::from_args(args)?`. Arms still match on string literals, so transportParity is untouched. Both plan tasks landed in one commit because the arms share `store_embed.rs`.

## Commits
- d7c5f6d38: feat(67-08) migrate 26 arms

## Verification
- `cargo test --bin gamelib-shell`: 421 passed, 0 failed. `pnpm check:ipc-contract` green. prettier clean on the two touched TS files.
- Jest `src/backend/__tests__`, `sidecar`, `scanners`: only known failures (steam games/bottle/macArch, tauriShellSource `.title(`).
- Jest `meta`: known genI18nGateScope and logSecretGate failures, plus `x86CallbackWineHarness` (spawns Wine, 39s; environmental, no file this plan touches is read by it).

## Deviations from Plan
**1. [Rule 1] Behaviour tightening, accepted by the plan's "stricter-or-equal" note.** A non-string or `null` keyring slot, and a null/absent `dialog_*`/`notification_show` options object, were silently tolerated by the hand ladders and are now `<arm>:bad-args`. The TS schemas already forbid those shapes, so the sidecar never sends them.
**2. Scan arms** validate via `from_args` and still forward `args` to the library (see decisions); not a pure replacement because the Tauri-free crate cannot depend on `ipc_contract`.
**3. [Rule 3] Tests re-pinned:** dialogOptionForwarding (field names now live in `DialogOpenArgs`, plus a new test pinning its serde keys) and scanChannelParity (from_args line then dispatch). Clipboard and keyring-slot Rust tests rewritten onto `from_args`, original clipboard test fn names kept so the tauriShellSource name pin holds.
**4.** `clipboard_text_arg` and `keyring_slot_arg` deleted. `tray_set_icon_mode_from_args`/`tray_set_icon_variant_str` kept (compat fallback). rustInvoke.ts unchanged, no regeneration needed.

## Known Stubs
None.

## Self-Check: PASSED
