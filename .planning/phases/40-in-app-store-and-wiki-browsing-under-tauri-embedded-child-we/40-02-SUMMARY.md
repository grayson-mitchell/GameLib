---
phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
plan: 02
subsystem: rust-shell
tags: [tauri, wry, embed, cargo-features, dispatch-rust-channel]
dependency-graph:
  requires: [D-01, D-03, D-17, D-18, D-21, D-22, D-25]
  provides:
    - "40-EMBED-API-VERIFICATION.md (D-25's written verdict)"
    - "unstable Cargo feature target-gated to macOS (D-03)"
    - "store_embed_open/set_bounds/hide/show/close dispatch arms"
    - "StoreEmbedState history registry (D-22)"
  affects:
    - "plan 40-04 (containment hooks: on_navigation/on_new_window/on_download)"
    - "plan 40-07 (browser chrome: back/forward/reload commands against Task 1's verdict)"
    - "plan 40-09 (navigation-failure handling, branches on Q3's ABSENT verdict)"
tech-stack:
  added: []
  patterns:
    - "Rust-side history stack (on_page_load push) instead of a native back/forward API"
    - "target-gated Cargo feature via [target.'cfg(...)'.dependencies], proven by cargo tree diff"
    - "single-writer geometry discipline: exactly one fn may call set_position/set_size"
key-files:
  created:
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-EMBED-API-VERIFICATION.md
    - .planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/deferred-items.md
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/main.rs
decisions:
  - "D-25 discharged: no back/forward/history API exists anywhere in tauri 2.11.5 or wry 0.55.1 (D-22 stands)"
  - "D-03 proven by cargo tree diff, not asserted; cross-target cargo check could not run in this environment (no non-host rustup target installed) so it is NOT reported as a passed proof"
  - "D-17 UA: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36, reviewed 2026-09-04"
metrics:
  duration: "~35 min between Task 1 and Task 3 commits (a6bca3c84 17:04:32 -> 4e269d321 17:39:42 NZ local); one session interruption occurred mid-Task-2 verification"
  completed: 2026-09-04
---

# Phase 40 Plan 02: Store Embed Rust Mechanism (D-25 Verification, D-03 Target-Gate, store_embed_* Arms) Summary

Verified the tauri 2.11.5 / wry 0.55.1 embed navigation surface against vendored crate source only (D-25: no back/forward/history API exists anywhere in the stack, confirming D-22's Rust-side history design), target-gated the `unstable` Cargo feature to macOS with two independent measurements proving the exclusion (D-03), and added five macOS-only `store_embed_*` dispatch arms that create/position/hide/show/close a single child webview on the existing `main` window via `Window::add_child`.

## What Was Built

**Task 1 — D-25 vendored-source verification** (`40-EMBED-API-VERIFICATION.md`, commit `a6bca3c84`):

| Q | Question | Verdict | Consequence |
|---|----------|---------|-------------|
| Q1 | `tauri::webview::Webview` back/forward/history method? | **ABSENT** | D-22's Rust-side history stack stands |
| Q2 | `wry-0.55.1::WebView` back/forward/history method? | **ABSENT** | Confirms Q1 is not a tauri re-export gap; wry itself has none |
| Q3 | Any navigation-FAILURE callback (`did-fail-load` analog)? | **ABSENT** | D-32's caveat confirmed TRUE from source, not merely suspected; plan `40-09` is written against this |
| Q4 | What does `on_page_load` deliver? | **EXISTS** (main-frame-only success signal; no subframe/failure info) | D-22's history stack and D-32's derivation both rest on this being main-frame-only by construction (`WKNavigationDelegate`), not by omission |
| Q5 | `add_child`'s `#[cfg]`, internal `run_on_main_thread`, `get_window`'s gating | **GATED** (both `add_child` and `Manager::get_window`/`get_webview` require `unstable`) | Confirms D-01/D-03's target-gate is the only lever; no unstable-free path exists |
| Q6 | The three `40-04` containment hooks (`on_navigation`/`on_new_window`/`on_download`) | **EXISTS** (all three; no platform-specific caveat found for any) | Clean seams left for `40-04`, none consumed here |

Decisions table in the artifact: D-22 STANDS, D-25 STANDS (discharged), D-28 STANDS, D-29 STANDS, D-32 STANDS (caveat now confirmed, not assumed). No decision was superseded.

**Task 2 — target-gate `unstable` to macOS, proven** (`src-tauri/Cargo.toml`, commit `61e0593b8`):

Moved `unstable` out of the unconditional `tauri = { ... }` line in `[dependencies]` and into a new `tauri = { version = "2", features = ["unstable"] }` line under the existing `[target.'cfg(target_os = "macos")'.dependencies]` table. The pre-existing rationale comment (pristine-Epic-webview history) was amended in place, not replaced — it still contains the literal token `pristine`, and a new paragraph names D-03.

Two independent measurements were taken:

**(a) `cargo tree -e features -i tauri` — no `--target`, run on this macOS host:**
```
tauri v2.11.5
├── tauri-plugin-clipboard-manager v2.3.2
│   └── tauri-plugin-clipboard-manager feature "default"
│       └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri)
│           └── gamelib-shell feature "default" (command-line)
├── tauri-plugin-deep-link v2.4.9
│   └── tauri-plugin-deep-link feature "default"
│       └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
├── tauri-plugin-dialog v2.7.2
│   ├── tauri-plugin-dialog feature "default"
│   │   └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
│   └── tauri-plugin-dialog feature "gtk3"
│       └── tauri-plugin-dialog feature "default" (*)
├── tauri-plugin-fs v2.5.1
│   └── tauri-plugin-fs feature "default"
│       └── tauri-plugin-dialog v2.7.2 (*)
├── tauri-plugin-notification v2.3.3
│   └── tauri-plugin-notification feature "default"
│       └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
├── tauri-plugin-opener v2.5.4
│   └── tauri-plugin-opener feature "default"
│       └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
├── tauri-plugin-shell v2.3.5
│   └── tauri-plugin-shell feature "default"
│       └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
└── tauri-plugin-updater v2.10.1
    ├── tauri-plugin-updater feature "default"
    │   └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
    ├── tauri-plugin-updater feature "rustls-tls"
    │   └── tauri-plugin-updater feature "default" (*)
    └── tauri-plugin-updater feature "zip"
        └── tauri-plugin-updater feature "default" (*)
├── tauri feature "common-controls-v6"
│   └── tauri feature "default"
│       └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
├── tauri feature "compression"
│   └── tauri feature "default" (*)
├── tauri feature "dbus"
│   └── tauri feature "default" (*)
├── tauri feature "default" (*)
├── tauri feature "dynamic-acl"
│   └── tauri feature "default" (*)
├── tauri feature "image"
│   └── tauri feature "image-png"
│       └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
├── tauri feature "image-png" (*)
├── tauri feature "tauri-runtime-wry"
│   └── tauri feature "wry"
│       └── tauri feature "default" (*)
├── tauri feature "tray-icon"
│   └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
├── tauri feature "unstable"
│   └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
├── tauri feature "webkit2gtk"
│   └── tauri feature "wry" (*)
├── tauri feature "webview2-com"
│   └── tauri feature "wry" (*)
├── tauri feature "wry" (*)
└── tauri feature "x11"
    └── tauri feature "default" (*)
```

**`cargo tree --target x86_64-pc-windows-msvc -e features -i tauri`** and **`cargo tree --target x86_64-unknown-linux-gnu -e features -i tauri`**: both outputs are byte-identical to the macOS tree above with exactly one exception — `diff` against the macOS output shows only these two lines removed, present nowhere else in either non-macOS tree:
```
< ├── tauri feature "unstable"
< │   └── gamelib-shell v0.7.0 (/Users/graysonmitchell/Projects/GameLib/src-tauri) (*)
```
This is the discriminating proof: `unstable` is requested by `gamelib-shell` and appears only in the macOS-target resolution; it is entirely absent — not merely unlisted, but structurally removed from the tree — for both `x86_64-pc-windows-msvc` and `x86_64-unknown-linux-gnu`.

**(b) Compile-level discriminant — attempted, could NOT complete in this environment.** `rustup target list --installed` shows only `aarch64-apple-darwin` installed. `cargo check --target x86_64-pc-windows-msvc` was run to completion and failed with:
```
error[E0463]: can't find crate for `std`
  = note: the `x86_64-pc-windows-msvc` target may not be installed
  = help: consider downloading the target with `rustup target add x86_64-pc-windows-msvc`
error[E0463]: can't find crate for `core`
error: could not compile `serde_core` (lib) due to 1 previous error
error: could not compile `windows-link` (lib) due to 1 previous error
```
exit code 101. This failure is a missing-target-toolchain error (`E0463`), occurring in unrelated crates (`serde_core`, `windows-link`) before compilation ever reaches this crate's own code, so it says nothing about `unstable`'s resolution one way or the other. Per the plan's explicit instruction, this unrun/incomplete proof is **not** reported as having passed. Measurement (a) — the `cargo tree` diff above — is the sole proof recorded for D-03's exclusion.

Native `cargo check` (no `--target`) exits 0 after the move. `Cargo.lock` has zero diff (`git diff --stat -- src-tauri/Cargo.lock` produces no output) — no new dependency was resolved.

A pre-existing, unrelated set of 12 `cargo clippy -- -D warnings` failures in `src-tauri/src/main.rs` (confirmed pre-existing via `git diff --stat -- src-tauri/src/main.rs` showing zero changes at the time Task 2's clippy run was made) was logged to `deferred-items.md` per the scope-boundary rule, not fixed.

**Task 3 — `store_embed_*` dispatch arms** (`src-tauri/src/main.rs`, commit `4e269d321`):

Five new `#[cfg(target_os = "macos")]`-gated match arms in `dispatch_rust_channel` (`main.rs:4607`), each returning a legible `Err("store_embed_*:unsupported-platform")` on non-macOS rather than compiling to nothing:

- `store_embed_open` — resolves `MAIN_WINDOW_LABEL`, builds a `WebviewBuilder` with `.user_agent(STORE_EMBED_USER_AGENT)`, `.on_page_load(...)` pushing main-frame `Finished` URLs into the new `StoreEmbedState` history registry, and a bare `.on_navigation(|_| true)` placeholder commented as reserved for plan `40-04`'s scheme policy (D-29). Idempotent: if a webview already exists under `STORE_EMBED_LABEL`, navigates it instead of building a second child.
- `store_embed_set_bounds` — the single Rust call site that applies renderer-supplied `{x, y, w, h}` verbatim via `set_position`/`set_size` (D-18). Its doc comment names D-18 explicitly.
- `store_embed_hide` / `store_embed_show` / `store_embed_close` — wrap `Webview::hide()`/`show()`/`close()` (D-21); `close` additionally clears the history registry. Each returns a distinguishable `no-webview` error rather than a silent `Ok` when the label is absent.

**Single call-site verification (line numbers):**
- The **only** `add_child` call in the Rust tree: `src-tauri/src/main.rs:4743` (`match window.add_child(`), inside `store_embed_open`.
- The **only** `set_position`/`set_size` calls in the Rust tree: `src-tauri/src/main.rs:4795` (`set_position`) and `:4798` (`set_size`), both inside `store_embed_set_bounds`. The other three matches of the grep pattern (`:4783`, `:4785`, `:4786`) are that same function's own doc comment referencing the methods by name, not additional call sites.

**Chrome UA (D-17):** `STORE_EMBED_USER_AGENT` (`main.rs:4630`) = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36`, with an adjacent doc comment containing the literal token `MAINTAINED VALUE` and review date `2026-09-04`. Matches the `Chrome/142.0` convention already used by this file's own `valid_reveal_args`/`valid_clear_storage_args` test fixtures. `grep -c "Chrome/200.0" src-tauri/src/main.rs` returns 0.

**Verification results:**
- `cargo check` (native, macOS): exits 0.
- `cargo build` (native, macOS): exits 0.
- `cargo clippy -- -D warnings`: exits 101 with the same 12 pre-existing findings as before this plan's changes (confirmed by line-number shift matching exactly the number of lines inserted; none of the 12 findings are in the new `store_embed_*` code).
- `python3 meta/runPlanningGates.py`: 7/7 planning gates passed.
- `git diff --stat -- src-tauri/capabilities/default.json`: no output — file untouched, as required (plan `40-04` owns it).
- `git diff --stat -- src-tauri/Cargo.lock`: no output across both tasks — no new dependency resolved.
- No renderer file was modified by this plan.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs or missing-critical-functionality were discovered that required Rule 1/2 fixes during Task 3's implementation.

### Scope-boundary deferrals (not fixed, logged)

**1. [Scope boundary] Pre-existing `cargo clippy -- -D warnings` failures in `src-tauri/src/main.rs`**
- **Found during:** Task 2 (re-confirmed unchanged after Task 3).
- **Issue:** 12 pre-existing clippy errors (`needless_borrows_for_generic_args`, `needless_borrow`, `doc_lazy_continuation`, etc.) at lines unrelated to this plan's changes.
- **Why not fixed:** Confirmed pre-existing (present before any edit in this plan touched `main.rs`); out of scope per the scope-boundary rule (only auto-fix issues directly caused by the current task's changes).
- **Logged to:** `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/deferred-items.md`.

**2. [Documented limitation] Cross-target `cargo check` proof could not execute**
- **Found during:** Task 2.
- **Issue:** The plan's proof method (b) — a compile-level discriminant via `cargo check --target x86_64-pc-windows-msvc` — requires a non-host rustup target/toolchain. Only `aarch64-apple-darwin` is installed in this environment.
- **Resolution:** Ran the command anyway per the plan's own fallback instruction; it failed with `E0463` (missing `std`/`core` for the target) before reaching any code this plan touches. This is reported here as an environment limitation, not as a passed proof. Measurement (a) — the `cargo tree --target` diff — is the sole recorded proof of D-03's exclusion, exactly as the plan's fallback anticipated.

## Known Stubs

None. `store_embed_open`'s `.on_navigation(|_| true)` placeholder is an intentional, explicitly-commented deferral to plan `40-04` (D-29) — not a stub masking missing wiring, since no chrome or renderer surface in this plan calls into it yet.

## Threat Flags

None. All five threats in this plan's own `<threat_model>` (T-40-02-01 through T-40-02-05, T-40-02-SC) were addressed as specified: the `url` argument is parsed with `tauri::Url` with no fallback URL; `STORE_EMBED_LABEL` is a fixed const never derived from caller input; exactly one call site writes geometry; the UA is a static, non-identifying header; every arm degrades to a legible error off macOS; and `Cargo.lock`'s zero diff is the evidence that no new dependency was resolved (no package-legitimacy checkpoint was triggered).

## Self-Check: PASSED

- FOUND: `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/40-EMBED-API-VERIFICATION.md`
- FOUND: `src-tauri/Cargo.toml`
- FOUND: `src-tauri/src/main.rs`
- FOUND: `.planning/phases/40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we/deferred-items.md`
- FOUND: commit `a6bca3c84` (Task 1) in `git log --oneline --all`
- FOUND: commit `61e0593b8` (Task 2) in `git log --oneline --all`
- FOUND: commit `4e269d321` (Task 3) in `git log --oneline --all`
- Confirmed `grep -c "VERDICT:"` on the verification artifact returns 6 (matches the six-row table above).
- Confirmed `grep -n "add_child" src-tauri/src/main.rs` returns exactly 1 line (`:4743`).
