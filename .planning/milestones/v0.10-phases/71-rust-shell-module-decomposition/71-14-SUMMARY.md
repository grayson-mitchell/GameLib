---
phase: 71-rust-shell-module-decomposition
plan: 14
subsystem: infra
tags: [rust, tauri, wave-4, macos_epic_embed, module-split]
requires: [71-13]
provides:
  - macos_epic_embed/ split into surface.rs and nav_delegate.rs under a 249-line parent
  - wave-4-start baseline
affects: [71-15]
key-files:
  created:
    - src-tauri/src/macos_epic_embed/surface.rs
    - src-tauri/src/macos_epic_embed/nav_delegate.rs
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-4-start/
  modified:
    - src-tauri/src/macos_epic_embed.rs
    - src-tauri/src/epic_embed_js_dialog.rs
    - src-tauri/src/store_embed_handoff_policy.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py
key-decisions:
  - "Children use `use super::*;`; the parent keeps its explicit imports and compiler reported none unused after the split"
  - "Line-range split (cluster map was exact at d8786408e); moveproof Layer 3 proved every item moved whole"
requirements-completed: [D-03, D-08, D-10, D-11, D-12, D-13, D-15]
duration: 35min
completed: 2026-11-09
---

# Phase 71 Plan 14: macos_epic_embed split Summary

macos_epic_embed.rs (2,089 lines) is now a 249-line parent (header, imports, consts, `epic_embed_load_timed_out`, `epic_embed_response_is_challenged`, their 2 test mods, `mod` + `pub(crate) use` pairs) over `surface.rs` (1,116 total) and `nav_delegate.rs` (739). The module stays excluded from the combined jest/Rust shell source (D-11).

## Baseline
wave-4-start at d8786408e: cargo 445 passed / 0 failed / 2 ignored, jest 714 passed + 2 known failures (WR-07, C3), clippy exit 0.

## Assignment table
| File | Contents | Total / non-test |
| --- | --- | --- |
| macos_epic_embed.rs | module doc, `#![cfg(target_os = "macos")]`, imports, consts, 2 fns, 2 test mods | 249 / 157 |
| surface.rs | SendPtr, EPIC_EMBED_SURFACE, `surface()`, KVO observers, EpicEmbedSurface impl, load-timeout monitor, open/set_bounds/nav/hide/show/close/deselect, selection, `take_nav_events`, 3 test mods | 1116 / 1019 |
| nav_delegate.rs | EpicEmbedNavDelegateIvars, `define_class!` (whole), failure/scheme/download/termination/JS-dialog handlers, `impl EpicEmbedNavDelegate` | 739 / 739 |

## Items made pub(crate) (compiler-driven)
- surface.rs: `surface()`, `apply_visibility`, `nav_state_json`, `epic_embed_kvo_context`, struct `EpicEmbedSurface` and its fields `visibility`, `top_level_host`, `pending_nav_events`, `nav_generation`, `nav_started_at`, `load_timed_out`, `has_committed`, `blocked_launcher_scheme_count`, methods `enqueue_nav_event`, `nav_flags` (all used by the delegate's callbacks).
- nav_delegate.rs: struct `EpicEmbedNavDelegate`, `EpicEmbedNavDelegateIvars` (E0446 otherwise), `EpicEmbedNavDelegate::new` (used by surface.rs `open`).
- External callers (`macos_epic_embed::open`, `is_selected`, `EpicEmbedSurfaceSelection`, `take_nav_events`, etc.) keep working through `pub(crate) use surface::*;`. No parent import was unused, so the clippy ceiling is unchanged.

## Reader repoints
- epic_embed_js_dialog.rs: `concat!` of parent + surface.rs + nav_delegate.rs (absence checks over all three pieces).
- store_embed_handoff_policy.rs :224 and :340: `macos_epic_embed/nav_delegate.rs` (every needle, `decide_policy_for_navigation_response`, `epic_embed_route_download`, `webViewWebContentProcessDidTerminate:` and `create_web_view_for_navigation_action`, lives there).
- tauriShellSource.test.ts: the readMacosEpicEmbedSource case now asserts parent + nav_delegate + surface (sorted, joined by newline); new test asserts `listTauriShellSourceFiles()` has no `macos_epic_embed/` path (D-11). The main.rs Rust guard already skipped the directory (71-03) and needed no change; macosEpicEmbedSource / DiagPersistence read through the helper and are unchanged.

## Verification
- `permove.sh wave-4-start 4` PASS after each move commit (cargo 445, clippy ratchet PASS, Layer 3 items removed/added 0/0).
- jestpins over the wave suites: 715 passed (714 + the new D-11 test), 2 failed (known WR-07, C3), 0 unknown.
- moveproof --wave 4: PASS.
- sizes.py: surface.rs non-test 1,019 lines is OVER 1,000 (D-13 reason: one cohesive surface type plus its KVO plumbing; splitting further would separate the impl from its observers). The script exits 1 overall because main.rs, single_instance.rs and tray.rs are also over; those belong to later plans.

## Deviations from Plan
**1. [Ordering] Rust reader repoints landed in the nav_delegate move commit, not a separate Task 2 commit.** With the delegate moved, three cargo source-text tests fail until repointed, and permove requires green cargo per commit. The jest test change is its own commit.
**2. [Tooling] moveproof wave 4 add-allow for `//!` headers** (`4: ([], [r'^//!( .*)?$'])`), the same narrow allowance as wave 2, for the child module headers.
**3. [Tooling] items.py not used;** the clusters were contiguous line ranges.

## Not verifiable here
macOS-only module: Linux/Windows legs never compile it; only local cargo and the macOS CI leg gate it. CI runs in 71-15.

## Task Commits
1. bcd2c2aff surface.rs (+ wave-4-start baseline, moveproof wave-4 allow)
2. a7e716a57 nav_delegate.rs + include_str! repoints
3. 4127e92fe jest D-11 pins

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
