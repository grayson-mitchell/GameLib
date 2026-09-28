---
spike: 025
idea: idea-c-tauri-rearchitecture
name: linux-add-child-compile
type: standard
validates: "Given spike 016's unmodified `unstable`/`add_child` harness, when built and run NATIVELY on a real Linux desktop (Pop!_OS 22.04, webkit2gtk 2.0.2), then does it compile against the real GTK/webkit2gtk backend, and does `Window::add_child` succeed at all"
verdict: VALIDATED
related: [016, 017, 018, 026, 027]
tags: [tauri, webview, multiwebview, unstable, embed, linux, webkit2gtk, gtk, store-browser, phase-38, 38-E01, 38-E02]
---

# Spike 025: Linux `add_child` — compiles and a real embed succeeds

## What This Validates

Given spike 016's harness (`Window::add_child`, unmodified since its macOS run), when built and
run **natively** on a real Linux machine with the real webkit2gtk/GTK backend, then it compiles
and `add_child` at least succeeds — the premise ledger items `38-E01`/`38-E02` (Phase 38) record
as "no Windows/Linux implementation exists yet."

## Why this session could even attempt it

This session's environment reported `Platform: linux` — not a sandboxed CI runner but the
operator's own Pop!_OS 22.04 desktop (`rustc`/`cargo` already installed, a real `DISPLAY=:1` with
two real monitors attached). Phase 38's ledger assumed both `38-E01`/`38-E02` needed "an
implementation task" before verification, and that Linux specifically needed "booting the Linux
machine." Neither was true once system packages were installed — this machine already **is** an
owned Linux machine, reachable directly from this session.

## Research

Checked `src-tauri/Cargo.toml` and `main.rs` first: the real app gates the whole `unstable`
feature to `[target.'cfg(target_os = "macos")'.dependencies]` (Phase 40 Plan 02, D-03), so the
real app genuinely has no Linux/Windows code path today. But spike 016's own harness
(`.planning/spikes/016-embedded-child-webview-basic/app/Cargo.toml`) requests `unstable`
**unconditionally** — no target gate — and its one macOS-specific line
(`ns_window_number`'s `#[cfg(target_os = "macos")]` block) already degrades to `None` elsewhere.
That means the exact same harness, byte-for-byte except the OS-gated `objc2` dependency, is a
valid Linux (and Windows, see spike 027) probe with zero source changes.

## How to Run

```bash
export CARGO_TARGET_DIR=.planning/spikes/025-linux-add-child-compile/target-cache  # gitignored
cd .planning/spikes/025-linux-add-child-compile/app
cargo build   # native Linux target, no cross-compile
DISPLAY=:1 SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1 ./target-cache/debug/spike-025-linux-add-child
```

Needs `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`,
`patchelf`, `build-essential` (the exact set `release-tauri.yml:193` installs for the real CI
Linux leg — this spike is the first time anything in this project has actually compiled `src-tauri`
against them; `rust-test.yml`'s own header comment records that CI has never had a Linux leg for
exactly this reason).

## Investigation Trail

1. **Cargo.toml port.** Copied 016's `app/` unchanged; renamed the package; moved `objc2` behind
   `[target.'cfg(target_os = "macos")'.dependencies]` to match its one call site (016 already
   scoped the *use*, just not the *dependency*).
2. **`cargo build` (no `--target`, native host).** Full cold build: 48.82s. Compiled the entire
   Linux Tauri stack for real — `webkit2gtk-sys`, `gtk-sys`, `gdk-sys`, `atk-sys`, `soup3-sys`,
   `tao` — none of which this repo's own CI has ever compiled (per `rust-test.yml`'s own admission
   above). `system-deps`/`pkg-config` resolved every dev package on the first try once installed.
3. **Live run, `SPIKE_AUTORUN=1 SPIKE_AUTORUN_EXIT=1`.** `add_child` on the existing config-created
   main window returned `Ok` in **2ms** (vs macOS's measured 42–51ms in spike 016) — both `main`
   and `store-embed` immediately visible in `list_webviews`. Navigated the embed through the same
   sequence spike 016 used: a loopback control-server `/set` page, then the **real Steam store**
   (`store.steampowered.com/app/440/...`) — `on_navigation`/`on_page_load` fired for both, and the
   real network response set real Steam cookies (`browserid`, `sessionid`, `steamCountry`,
   `recentapps`, `timezoneOffset`, `timezoneName`) that `cookies()` read back correctly.
4. **Surprising finding, followed up in spike 026, not resolved here.** The bounds readback
   immediately after `add_child` was `{x:0,y:0,w:0,h:0}` (macOS's spike 016 log doesn't show a
   comparable zero), and subsequent `list_webviews` calls showed **both** webviews pinned to
   `{x:0,y:0,w:1280,h:450}` — exactly half the window's 900px height — regardless of the
   `x:290,y:96,w:760,h:560` actually requested. That is a big enough surprise (per this project's
   own spike convention: never declare a verdict on a single happy path, follow surprises) that it
   is scoped out to its own spike rather than glossed over here. See spike 026.
5. **Also surprising, also deferred to 026.** Probe B (a second bare `Window` with two child
   webviews) segfaulted natively inside `libwebkit2gtk-4.1.so.0.19.7`, twice, at the identical
   instruction offset. The primary shape this spike targets — a single embed on the
   already-existing main window — was unaffected; isolating and root-causing the crash is 026's
   job, not this one's.

## Results

**VALIDATED, for the compile + minimum-viable-embed question specifically.** `38-E01`/`38-E02`'s
own recorded premise — "no Windows/Linux implementation exists yet ... this is an implementation
task before it is a verification task" — is now **false for Linux**, and false at the weakest
possible bar: zero source changes to a macOS-authored harness were needed. `add_child` on the
config-created main window succeeds, both webviews coexist, and a real external store page loads,
navigates, and sets/returns real cookies through the identical `cookies()`/`on_page_load` API
surface spikes 013–018 validated on macOS.

**This is a narrower verdict than "Linux `add_child` is production-ready."** Two significant,
reproducible gaps were found in the same session and are written up separately in spike 026 so
this README's VALIDATED verdict isn't misread as covering them: geometry (`set_position`/
`set_size`) silently no-ops on Linux, and a second-window multiwebview shape segfaults natively.
Read 026 before treating this VALIDATED as "ship it."
