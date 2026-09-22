---
slug: linux-get-window-e0599
status: awaiting_human_verify
trigger: 'Linux release leg fails to COMPILE: E0599 no method named `get_window` found for reference `&AppHandle`, at src-tauri/src/main.rs:5203 and :6915. The SAME commit compiled fine on macOS.'
created: 2026-09-21
updated: 2026-09-21
source_todo: .planning/todos/pending/2026-09-17-linux-release-leg-fails-to-compile-get-window-missing-on-apphandle.md
---

# Debug: Linux E0599 `get_window` on `&AppHandle`

## Symptoms

**Expected behavior:** `pnpm tauri build` on the `ubuntu-24.04` matrix leg compiles
`gamelib-shell` and produces Linux bundles, as the macOS leg does from the same commit.

**Actual behavior:** the Linux leg fails to COMPILE. Every later step (bundling, signing,
release upload) is skipped, so the run yields no information about anything downstream.

**Error messages (verbatim):**

```
error[E0599]: no method named `get_window` found for reference `&AppHandle` in the current scope
For more information about this error, try `rustc --explain E0599`.
error: could not compile `gamelib-shell` (bin "gamelib-shell") due to 1 previous error
failed to build app: failed to build app
##[error]Command "pnpm ["tauri","build"]" failed with exit code 1
```

**Timeline:** pre-existing, never worked. Surfaced on GitHub Actions run 35223308954,
triggered by the throwaway annotated tag `v0.7.0-notarize-test1` at commit `cc2d66248` — the
FIRST tag push `release-tauri.yml` has ever completed. The defect is not introduced by that tag
or that commit; it is the first time this build path ran on Linux at all.

**Reproduction:** build the crate for a non-macOS target. `cargo check` for a Linux target, or a
tag push reaching the Linux leg. A macOS build does NOT reproduce it and proves nothing here.

## Call sites

Two REAL call sites in `src-tauri/src/main.rs`:

```
:5203   let window = app.get_window(MAIN_WINDOW_LABEL).ok_or_else(|| {
:6915   None => match app.get_window(label) {
```

**Grep trap, from the source todo:** `:3534` is a doc-comment mention and `:6908` is a comment —
NOT code. A census by plain grep finds four and is wrong; there are two.

## Desk finding established BEFORE this session — this is NOT feature drift

Verified structurally on the working tree 2026-09-21 (by `grep -n '^\['` plus the `tauri =`
lines, not by a visual scan of a rendered file):

- `src-tauri/Cargo.toml:14` `[dependencies]` — unconditional.
- `src-tauri/Cargo.toml:37` — `tauri = { version = "2", features = ["tray-icon", "image-png"] }`.
  **No `unstable`.**
- `src-tauri/Cargo.toml:113` — `[target.'cfg(target_os = "macos")'.dependencies]`.
- The `unstable` feature is declared ONLY inside that macOS-gated table.

The in-file comments attribute this to **Phase 40 Plan 02, decision D-03**: `unstable` was moved
OUT of the unconditional dependency line INTO the macOS-only table on purpose, so that "a future
Tauri release that breaks `unstable`'s API can only break the macOS build leg". The comment
further claims the consequence was **proven by measurement**, not assumed — `cargo tree -e
features` run once with `--target x86_64-pc-windows-msvc` (no `unstable`) and once with no
`--target` on a macOS host (`unstable` present), with both outputs pasted into
`40-02-SUMMARY.md`.

**Therefore the source todo's framing is wrong in one important way.** Its `needs:` field says
`identify-feature-drift-then-fix` and its Hypothesis section calls the cause unverified drift.
There is no drift: `Manager::get_window` is `unstable`-gated in Tauri v2, `unstable` is
deliberately macOS-only, and the two call sites are NOT `#[cfg]`-guarded. The macOS leg compiles
for exactly the reason the Linux leg does not.

## What this session must NOT do

**Do not reflexively add `unstable` to the unconditional `[dependencies]` line.** That reverses
a deliberate, documented, measured decision (D-03) and silently widens the `unstable` API
surface to Linux and Windows — the precise outcome D-03 exists to prevent. If that genuinely is
the best remedy, it must be argued as a REVERSAL of D-03 on its merits and flagged for the
operator, not slipped in as a one-line build fix.

`get_webview_window()` is the obvious stable candidate, but the source todo explicitly warns it
"must NOT be asserted as the fix without verification". Establish what each of the two call
sites actually needs from the returned value before choosing.

## Current Focus

```yaml
reasoning_checkpoint:
  hypothesis: >
    Call site 1 (main.rs:5203, inside store_embed_open) is already `#[cfg(target_os =
    "macos")]`-gated at the function level and needs NO fix — it is correctly absent from the
    Linux compilation unit already. Call site 2 (main.rs:6915, the `humble_login_close`
    fallback inside `dispatch_rust_channel`, which is NOT cfg-gated) is the sole real E0599
    source on Linux. The fix is to gate ONLY the `get_window` fallback arm with
    `#[cfg(target_os = "macos")]` / `#[cfg(not(target_os = "macos"))]`, following the exact
    convention already used by every other `unstable`-gated call in this file (e.g. the
    "store_embed_open" dispatch arm, main.rs:7667-7676) — resolving to `false` (not found) on
    non-macOS, since the window this fallback exists to find
    (`open_pristine_epic_login_window`'s raw-WKWebView `Window`) is itself
    `#[cfg(target_os = "macos")]`-gated and can never exist on Linux/Windows.
  confirming_evidence:
    - "Vendored tauri-2.11.5/src/lib.rs:541 — get_window carries #[cfg(feature = \"unstable\")]; :576 get_webview_window carries no cfg at all (read directly, cross-checked against 40-EMBED-API-VERIFICATION.md Q5 which already established the same fact for a different call site)."
    - "main.rs:5192 — #[cfg(target_os = \"macos\")] sits directly on `fn store_embed_open`, immediately above the fn, no intervening attribute — call site 1's entire function is elided on Linux."
    - "Symptom log says 'due to 1 previous error' (singular) — consistent with exactly one of the two call sites surviving into the Linux compilation unit, not two."
    - "main.rs:3157 — open_pristine_epic_login_window (the only thing get_window's fallback at 6915 can find that get_webview_window cannot) is itself #[cfg(target_os = \"macos\")]-gated, so the fallback is unreachable-but-required-to-compile logic on non-macOS, not live behavior being removed."
    - "main.rs:7663-7676 — the codebase's OWN established convention for every other unstable-gated call already uses exactly this #[cfg(target_os=\"macos\")]/#[cfg(not(...))] split; this fix applies that existing pattern rather than inventing a new one."
  falsification_test: >
    If `app.get_window` at main.rs:6915 were ALSO already unreachable on Linux (e.g. wrapped in
    a cfg the initial read missed), the symptom log would show 0 errors, not 1 — it shows 1, and
    grep confirms `dispatch_rust_channel` and the `"humble_login_close"` arm carry no cfg gate
    anywhere between fn start (5529) and line 6915. This was checked, not assumed.
  fix_rationale: >
    Addresses the root cause directly: the ONE unstable-gated call that is NOT compiled out on
    Linux. Does not touch Cargo.toml/D-03 (no reversal). Does not touch call site 1 (already
    correct). Preserves 100% of macOS behavior (the pristine-window fallback still runs
    identically under cfg(macos)) and changes non-macOS behavior in exactly the way the
    surrounding code already documents as correct for a not-found window: resolves `false`
    ("healthy already-closed state, not an error", main.rs:6890-6892).
  blind_spots: >
    Cannot compile-check this for a Linux target from this macOS host (rustup Linux target +
    gtk/webkit2gtk system libs not established present) — verification will be reported
    honestly as incomplete/needing a live CI gate, per the operational constraints. Have not
    exhaustively re-scanned the ENTIRE file for a third unstable-gated call beyond the two the
    source todo named; relying on the todo's own prior grep-trap-aware census (two real sites)
    plus this session's independent read of both sites' surrounding cfgs.
```

next_action: DONE for this session — fix applied to main.rs:6915, macOS `cargo check` passes,
Linux cross-target check attempted and failed for an unrelated pkg-config/GTK sysroot reason
(reported honestly in Resolution.verification). Awaiting human verification via a live Linux
CI leg (or a Linux machine with GTK/WebKit2GTK dev packages) before this session can be
archived.

## Evidence

- timestamp: 2026-09-21 — `src-tauri/Cargo.toml` structure verified: `unstable` appears only
  under `[target.'cfg(target_os = "macos")'.dependencies]` (line 113); the unconditional
  `tauri` line (37) requests only `tray-icon` and `image-png`.
- timestamp: 2026-09-21 — checked: `.planning/phases/40-in-app-store-and-wiki-browsing-under-
  tauri-embedded-child-we/40-EMBED-API-VERIFICATION.md` Q5 (already discharged, pre-existing).
  found: cites vendored `tauri-2.11.5/src/lib.rs:540-543` verbatim —
  `Manager::get_window` carries `#[cfg(feature = "unstable")]`. Independently re-confirmed by
  reading the same vendored file directly this session (`~/.cargo/registry/src/index.crates.io-
  1949cf8c6b5b557f/tauri-2.11.5/src/lib.rs:540-576`): `get_window` (:541), `get_focused_window`
  (:547), `windows` (:553), `get_webview` (:561), `webviews` (:567) are ALL
  `#[cfg(feature = "unstable")]`-gated. `get_webview_window` (:576) and `webview_windows` (:588)
  carry **no cfg gate at all** — stable, unconditional, on every platform.
  implication: `get_webview_window` is confirmed the correct stable replacement candidate, not
  merely assumed. Its signature is `fn get_webview_window(&self, label: &str) ->
  Option<WebviewWindow<R>>` — a DIFFERENT return type from `get_window`'s
  `Option<Window<R>>`. `WebviewWindow` wraps both a `Window` and a `Webview`; it exposes
  `.close()` (used by both call sites) but is not interchangeable with `Window` for every method
  a caller might want.
- timestamp: 2026-09-21 — checked: full context of call site 1, `src-tauri/src/main.rs:5189-5205`.
  found: the ENTIRE containing function `store_embed_open` carries `#[cfg(target_os = "macos")]`
  directly on the `fn` (line 5192, immediately above `fn store_embed_open` at 5193, no
  intervening attribute). Line 5203's `app.get_window(...)` call is therefore ALREADY compiled
  out entirely on non-macOS targets — it does not exist in the Linux compilation unit at all.
  implication: **the debug file's own earlier desk finding ("the two call sites are NOT
  `#[cfg]`-guarded") is WRONG for call site 1 in the current working tree.** Call site 1 needs no
  fix. This also explains the verbatim symptom text precisely: `error: could not compile
  \`gamelib-shell\`... due to **1 previous error**` — singular, not plural. A genuinely
  ungated pair of call sites would produce two E0599 blocks; the log has exactly one.
- timestamp: 2026-09-21 — checked: `dispatch_rust_channel` (`main.rs:5529`), the function
  containing call site 2, and its enclosing match arm `"humble_login_close"` (`main.rs:6893-
  6931`). found: `dispatch_rust_channel` itself carries no `#[cfg]` — compiles on every
  platform. The `"humble_login_close"` arm is likewise unguarded. Its `None =>` fallback at
  line 6915 (`app.get_window(label)`) is reached only when `app.get_webview_window(label)`
  (line 6910, stable, tried first) returns `None`. The in-file comment at lines 6898-6909
  explains why the fallback exists: `open_pristine_epic_login_window` builds a raw `WKWebView`
  attached to a plain `tauri::Window`, never registered as a Tauri-managed `WebviewWindow`, so
  `get_webview_window` can never find it "for ANY label" — `get_window` is the only lookup that
  finds both kinds of window.
  implication: call site 2 is the SOLE genuine break. It is functionally required to close a
  macOS-only construct.
- timestamp: 2026-09-21 — checked: `open_pristine_epic_login_window` (`main.rs:3155-3158`).
  found: carries `#[cfg(target_os = "macos")]` directly on its `fn` declaration.
  implication: the "pristine window" this fallback exists to close can only ever be created on
  macOS. On Linux/Windows the fallback branch is dead code by construction — `get_webview_window`
  alone is already exhaustive there, so resolving `None`/`false` in the non-macOS case changes no
  observable behavior (matches this arm's own documented "missing label is a healthy already-
  closed state" contract, lines 6890-6892).
- timestamp: 2026-09-21 — checked: the established convention for every OTHER `unstable`-gated
  call in this file — `dispatch_rust_channel`'s `"store_embed_open"` arm
  (`main.rs:7667-7676`) and its siblings (`store_embed_set_bounds`, etc.). found: each wraps the
  macOS-only call in `#[cfg(target_os = "macos")] { ... }` paired with a
  `#[cfg(not(target_os = "macos"))] { Err(...) }` arm, with a section comment stating the pattern
  explicitly: "Every arm is macOS-only per D-03's target-gated `unstable` feature; the non-macOS
  branch returns a legible error rather than silently compiling this section out."
  implication: call site 2's fallback is the ONE place this exact, already-established convention
  was not applied when D-03 was implemented — not a novel design decision, a straightforward
  application of the codebase's own existing pattern to a spot it was missed.

## Eliminated

- hypothesis: "the code is simply wrong / a bad API call" — eliminated by the fact that the
  SAME commit compiled on macOS and reached notarization. Anyone treating this as ordinary
  broken code will fix the wrong thing.
- hypothesis: "accidental per-platform feature DRIFT" — eliminated by the Cargo.toml comments
  and structure: the split is deliberate (D-03), documented in-file, and was measured.

## Resolution

root_cause: Two calls to `Manager::get_window` exist in `src-tauri/src/main.rs`, and
`Manager::get_window` is `unstable`-gated in Tauri 2.11.5 (confirmed against the vendored
crate source, `tauri-2.11.5/src/lib.rs:540-543`), while D-03 deliberately scopes the
`unstable` cargo feature to `[target.'cfg(target_os = "macos")'.dependencies]`
(`Cargo.toml:113`) only. Call site 1 (`main.rs:5203`, inside `store_embed_open`) is already
correctly `#[cfg(target_os = "macos")]`-gated at the function level and was never actually
broken on Linux — it does not exist in the Linux compilation unit (this revises this debug
file's own earlier desk finding, which incorrectly called BOTH sites unguarded; the symptom
log's "due to 1 previous error", singular, was the tell). Call site 2 (`main.rs:6915`, the
`get_window` fallback inside the `"humble_login_close"` arm of `dispatch_rust_channel`) is
NOT cfg-gated and is the sole genuine E0599 source on Linux. It exists to close
`open_pristine_epic_login_window`'s raw-`WKWebView`-on-plain-`Window` construct, which
`get_webview_window` (stable, tried first) can never find — but that construct-creating
function is ITSELF `#[cfg(target_os = "macos")]`-gated (`main.rs:3157`), so the fallback is
structurally unreachable on non-macOS and was simply never given the same `#[cfg]` split
already used everywhere else in this file for `unstable`-gated calls (e.g.
`dispatch_rust_channel`'s `"store_embed_open"` arm, `main.rs:7663-7676`).

fix: Wrapped call site 2's fallback arm in `#[cfg(target_os = "macos")] { match
app.get_window(label) { ... } }` / `#[cfg(not(target_os = "macos"))] { false }`, matching the
codebase's own pre-existing convention for every other `unstable`-gated call. macOS behavior
is unchanged (the pristine-window close path still runs identically). Non-macOS behavior
resolves to `false` — the same "missing label is a healthy already-closed state, not an
error" contract this arm's own comment already documents (`main.rs:6890-6892`). Call site 1
was left untouched; it needed no fix.

verification: `cargo check --bin gamelib-shell` on the macOS host (default target) passes
after the edit — confirms the macOS-gated arm is still syntactically/type valid and nothing
regressed on the supported build. This does NOT prove the Linux leg compiles. A genuine
`cargo check --target x86_64-unknown-linux-gnu` was attempted this session (rustup target
added successfully) and failed, but for an UNRELATED reason exactly as the operational
constraints anticipated: `gobject-sys`/`gio-sys`/`gdk-sys` build scripts fail because
`pkg-config` is not configured for cross-compilation on this Mac (no Linux GTK/WebKit2GTK
sysroot present) — the failure occurs in transitive GTK dependency build scripts before
`gamelib-shell`'s own source is ever reached, so it neither confirms nor refutes this fix.
**No sound local Linux compile check exists on this host.** Verification is honestly
incomplete and requires a live CI leg (a tag push reaching `release-tauri.yml`'s
`ubuntu-24.04` matrix leg, or an equivalent `cargo check --target x86_64-unknown-linux-gnu`
run on an actual Linux machine or CI runner with GTK/WebKit2GTK dev packages installed).

files_changed:
- src-tauri/src/main.rs (call site 2 fallback arm, `humble_login_close`, lines ~6910-6934:
  added `#[cfg(target_os = "macos")]` / `#[cfg(not(target_os = "macos"))]` split around the
  `get_window` fallback, plus an explanatory comment)
