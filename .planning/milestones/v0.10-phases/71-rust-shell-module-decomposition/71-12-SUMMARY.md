---
phase: 71-rust-shell-module-decomposition
plan: 12
subsystem: infra
tags: [rust, tauri, wave-3, store_embed, module-split]
requires: [71-11]
provides:
  - store_embed/ split into state, policy, open, layout, controls children under a 35-line parent
  - wave-3-start baseline
affects: [71-13]
key-files:
  created:
    - src-tauri/src/store_embed/state.rs
    - src-tauri/src/store_embed/policy.rs
    - src-tauri/src/store_embed/open.rs
    - src-tauri/src/store_embed/layout.rs
    - src-tauri/src/store_embed/controls.rs
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-3-start/
  modified:
    - src-tauri/src/store_embed.rs
    - src-tauri/src/main.rs
    - src-tauri/src/store_embed_handoff_policy.rs
key-decisions:
  - "Clusters are contiguous in the source, so a marker-based line splitter (first line of each cluster's leading doc block) replaced items.py; moveproof Layer 3 proved every move"
requirements-completed: [D-03, D-10, D-12, D-13, D-15]
duration: 40min
completed: 2026-11-08
---

# Phase 71 Plan 12: store_embed split Summary

store_embed.rs (1,859 lines) is now a 35-line parent (header comment, `use super::*;`, five `mod x; pub(crate) use x::*;` pairs) over five children, each moved whole; every direct `include_str!` reader points at the child holding its needles.

## Baseline
wave-3-start captured at 0cbed9653 (includes the quick-261108-ved keyring move): cargo 445 passed / 0 failed / 2 ignored, jest 714 passed + 2 known failures (WR-07, C3), clippy exit 0. Same counts as wave-2-end, so the keyring move changed nothing measurable.

## Assignment table (line spans at 0cbed9653)
| Child | Contents | Non-test lines |
| --- | --- | --- |
| state.rs | label/UA consts, StoreEmbedHistoryChange, StoreEmbedState + impl, nav_state_json, STORE_EMBED_STATE, store_embed_state(), store_embed_open_args | 510 |
| policy.rs | StoreEmbedNavigationDecision, navigation_policy, is_valve_host, HandoffThrottle, link popup, throttle statics, handoff_admitted | 177 |
| open.rs | store_embed_open (carries `.on_new_window({`, `.on_download({`), rpc_store_embed_open | 333 |
| layout.rs | set_bounds_args, linux rect fns, set_bounds, apply_rect, inline `linux_store_embed_layout` mod whole, rpc_store_embed_set_bounds | 456 |
| controls.rs | hide/show/close/take_nav_events/navigate_args/back/forward/reload/navigate + 8 rpc handlers | 368 |

## Items made pub(crate) (each audited by compiler error from a sibling)
- `STORE_EMBED_USER_AGENT`, `store_embed_state()`, `StoreEmbedHistoryChange::as_str` (state.rs): used by open.rs / controls.rs.
- `store_embed_open_link_popup`, `STORE_EMBED_STEAM_THROTTLE`, `STORE_EMBED_TOP_LEVEL_HOST` (policy.rs): used by open.rs's hooks.
- `store_embed_apply_rect` (layout.rs): used by open.rs.
- `linux_store_embed_layout` stays reachable from open.rs through the `pub(crate) use layout::*;` glob chain (module was already `pub(crate)`). No E0659 ambiguity.

## Reader repoints
- store_embed_handoff_policy.rs :338 (.on_new_window, +4000) and :367 (.on_download, +2500) -> `store_embed/open.rs`.
- main.rs tests: show-before-navigate and epic-arm-hides-embed -> `open.rs`; Linux apply_bounds -> `layout.rs`.
- src/ and meta/ grep: only a doc comment in rustInvoke.ts mentions `store_embed.rs`; no jest reader needs repointing (openPolicy.test.ts was repointed in 71-07). No absence assertion reads a single child.

## Verification
- `permove.sh wave-3-start 3` PASS after each of the five move commits (cargo 445/0 failed, clippy ratchet PASS, moveproof: Layer 1 0/0, Layer 3 items removed/added 0/0).
- sizes.py exit 0 with no store_embed path allowed; largest store_embed file 510 lines.
- jestpins: 714 passed, 2 failed, 0 unknown failures.
- `git diff wave-3-start -- rust_dispatch.rs` empty.

## Task Commits
1. 99a0e15e2 state.rs (+ wave-3-start baseline)
2. d2bdcb58a policy.rs
3. 7bef5d21a open.rs + handoff-policy and two main.rs reader repoints
4. b9a17af54 layout.rs + Linux apply_bounds repoint
5. ae15147d1 controls.rs

## Deviations from Plan
**1. [Plan check wording] One `include_str!("store_embed.rs")` remains in main.rs.** It is the entry in `SHELL_SOURCE_PARTS` for the parent file itself, which the shell-source guard requires. The acceptance line "no include_str! of store_embed.rs remains in main.rs" is read as "no test reads it for its needles"; handoff_policy.rs has zero. The verify's `grep -c` total therefore evaluates to 1, not 0.

**2. [Tooling] moveproof wave-3 import allowance not needed.** Children carry only `use super::*;`, which the DECL filter already ignores, so no wave 3 ALLOW/IMPORT_WAVES extension was made.

**3. [Tooling] items.py not used for splitting.** Its end-line detection is wrong for multi-line signatures; a marker-based splitter was used instead.

## Not verifiable here
Linux and Windows builds (cfg-gated `linux_store_embed_layout` path, win32 unused-import ceiling) are only checked by CI in 71-13; Wave 2 CI is still pending from the GitHub outage. Pre-existing dead-code warning on `observe_live_url` (in the baseline clippy list) is unchanged.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
