---
slug: linux-focus-restore-minimize
status: resolved
trigger: "Linux: the Unix __GAMELIB_FOCUS__ single-instance socket arm may not restore a minimized main window, unmeasured"
created: 2026-09-26
updated: 2026-09-26
source_todo: .planning/todos/pending/2026-09-24-linux-unix-focus-sentinel-arm-may-not-restore-a-minimized-window.md
---

# Unix focus-sentinel arm may not restore a minimized window on Linux

## Symptoms

(Prefilled from the source todo — the operator directed "action todo", all symptom fields
are already recorded there. Not re-gathered by interview. This session is running LIVE on
Linux — Pop!_OS 22.04, X11 display `:1` present — which is the exact hardware the todo said
was unavailable when it was filed `ready: blocked` on a Windows 11 dev machine. That blocker
is stale; this session tests it directly.)

- **Expected behavior:** when GameLib's main window is minimized and a second launch (or
  anything else) sends `__GAMELIB_FOCUS__` over the Unix single-instance socket, the existing
  window is restored (un-minimized) and focused.
- **Actual behavior (suspected, unmeasured until this session):** the window may stay
  minimized. The Unix `__GAMELIB_FOCUS__` accept-loop arm in `src-tauri/src/main.rs` (`#[cfg(unix)]`
  region, near line 9753) calls `show()` + `set_focus()` with no `unminimize()` — the identical
  shape to a bug already confirmed and fixed on Windows in phase 46 plan 46-06
  (`handle_windows_single_instance_connection`, tao-0.35.3 `platform_impl/windows/window.rs:164-172,175-186`:
  `set_visible(true)` issues no `ShowWindow` call for an already-visible window, and `set_focus()`
  is gated on `!is_minimized`). tao's Linux implementation
  (`platform_impl/linux/window.rs:567-576`) gates `set_focus()` on `!self.minimized.load(...)` the
  same way, which is why the todo suspects the same defect class is live on Linux. The arm is
  measured CORRECT on macOS (AppKit `makeKeyAndOrderFront:` deminiaturizes).
- **Error messages:** none — this is a behavioral/UX defect, not a crash.
- **Timeline:** suspected since phase 46 plan 46-06 (2026-09-24), when the sibling Windows bug
  was fixed and this Linux arm was deliberately left untouched (pinned byte-identical by the
  phase-46 Unix-region gate, `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-unix-cfg-regions.awk`,
  against baseline `5bc4fa825`). Never previously measured on real Linux hardware.
- **Reproduction:** on Linux, launch GameLib, minimize the main window, then trigger a second
  launch (or otherwise write `__GAMELIB_FOCUS__` to the Unix single-instance socket) and observe
  whether the window un-minimizes and focuses, or stays minimized.

## Constraints for any fix

Any code change to the Unix arm touches a `#[cfg(unix)]` region that the phase-46
`46-unix-cfg-regions.awk` gate pins byte-identical to baseline commit `5bc4fa825`. If the defect
is confirmed, the fix is the same shape as the Windows fix (add `window.unminimize()` before
`window.show()` in the Unix arm), and the gate's pinned baseline must be deliberately
re-baselined as part of the same change — this is intentional, not a drive-by edit, because the
live Linux measurement that was the sole reason for `ready: blocked` is now available in this
session.

If the live measurement instead shows the window IS correctly restored on Linux, resolve this
session with that finding and close the source todo without a code change.

## Current Focus

- hypothesis: CONFIRMED — the Unix arm's `show()` + `set_focus()` (no `unminimize()`) fails to
  restore a minimized window on Linux, mirroring the confirmed Windows bug.
- reasoning_checkpoint:
  hypothesis: "the Unix single-instance-socket focus arm (main.rs ~line 10602-10611) calls
    `window.show()` + `window.set_focus()` with no `window.unminimize()`, so on Linux a
    minimized main window stays minimized (EWMH `_NET_WM_STATE_HIDDEN` persists) because (a)
    GTK's `show_all()` (what `show()` sends) does not clear WM-level iconic state per ICCCM, and
    (b) tao's `set_focus()` is gated by `if !self.minimized.load(...) && self.window.get_visible()`
    (`tao-0.35.3/src/platform_impl/linux/window.rs:567-576`) so it never even sends the
    `WindowRequest::Focus` (-> `present_with_time`, the GTK call that WOULD deiconify) while
    minimized is true."
  confirming_evidence:
    - "Read the actual vendored tao-0.35.3 source (fetched live via `cargo fetch` into
      ~/.cargo/registry/src, not paraphrased): `window.rs:567-576` `set_focus()`'s exact guard
      `!self.minimized.load(Ordering::Acquire) && self.window.get_visible()`; `event_loop.rs:306-324`
      shows `WindowRequest::Visible(true)` -> `window.show_all()`, `WindowRequest::Focus` ->
      `window.present_with_time(...)`, `WindowRequest::Minimized(false)` -> `window.deiconify()`."
    - "Live GTK3/X11 reproduction on this machine's real display :1 (GNOME Shell/mutter, GTK
      3.24.33 -- the exact runtime GTK version tao links against here), faithfully porting the
      call sequence read from source: after `win.iconify()`, `_NET_WM_STATE` =
      `_NET_WM_STATE_HIDDEN`. After mirroring the CURRENT buggy arm (`show_all()` + guarded
      no-op set_focus, minimized=true), state is UNCHANGED: still `_NET_WM_STATE_HIDDEN`. After
      mirroring the PROPOSED FIX (`deiconify()` + `show_all()` + `present_with_time()`), state
      flips to `_NET_WM_STATE_FOCUSED`. Reproduced identically on 3/3 runs."
  falsification_test: "if `show_all()` alone flipped `_NET_WM_STATE` off `_HIDDEN` on this GTK
    version, or if `set_focus()`'s guard did not block sending `WindowRequest::Focus` while
    minimized, the 'buggy arm' step would show `_NET_WM_STATE_FOCUSED` (or absence of `_HIDDEN`)
    instead of unchanged `_NET_WM_STATE_HIDDEN'. It did not: 3/3 runs held HIDDEN through the
    buggy-arm step and only cleared after deiconify()."
  fix_rationale: "Adding `window.unminimize()` before `window.show()` in the Unix arm (identical
    shape to the Windows fix in `handle_windows_single_instance_connection`) sends
    `WindowRequest::Minimized(false)` -> `window.deiconify()` first, which is the only call in
    the whole sequence that clears WM-level iconic state on Linux -- addresses the root cause
    (missing deiconify call) rather than a symptom."
  blind_spots: "Not tested against Wayland (tao has a separate wayland/ backend under the same
    platform_impl/linux/ module -- this measurement used the X11 session already running on
    this display, :1, per the operator context). Not tested against other Linux WMs (KWin,
    XFWM) -- only GNOME Shell/mutter. Did not build and run the full compiled GameLib Tauri
    binary end-to-end (blocked by missing libgtk-3-dev/libwebkit2gtk-dev system packages, no
    passwordless sudo available in this session) -- verified instead via a faithful call-by-call
    port against the real vendored tao source and the real system GTK/mutter runtime, which
    exercises the exact GTK/X11 mechanism tao invokes, not just tao's Rust plumbing."
  candidate_causes:
    - "code: Unix arm at main.rs ~10602-10611 omits `unminimize()` before `show()`+`set_focus()`"
    - "environment: none needed -- GTK/mutter's ICCCM-correct refusal to auto-deiconify on
      show_all() is standard, documented GTK/X11 behavior, not a misconfiguration"
  and_gate: "no -- single sufficient cause (the missing unminimize() call); the environment
    behavior (GTK not auto-deiconifying) is the standing platform contract the code must respect,
    not a second independently-necessary fault condition"
- next_action: DONE. Human-verify checkpoint response (2026-09-26): "Confirmed fixed — accept
  the live GTK/X11 reproduction plus cargo check/test/prettier as sufficient evidence, without a
  full compiled-binary end-to-end run (missing libgtk-3-dev/libwebkit2gtk-4.0-dev headers, no
  passwordless sudo in this session — not worth blocking on)." No `46-unix-cfg-regions.awk` gate
  file exists to re-baseline -- it is a plan-invoked awk script parameterized by a `BASE` commit
  hash passed at invocation time (`.planning/phases/46-.../46-unix-cfg-regions.awk`), not a
  checked-in pinned value; the deliberate divergence from its `5bc4fa825` baseline is documented
  in the fix-site comment and the `open_about_window_from_tray` correction-history comment
  already added to `main.rs`. Session resolved; archiving.
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-09-26T (live session)
  checked: tao-0.35.3 vendored source (`~/.cargo/registry/src/index.crates.io-*/tao-0.35.3/src/platform_impl/linux/window.rs:558-638` and `event_loop.rs:296-324`), fetched live via `cargo fetch` (network to crates.io index works despite a direct `curl` 403 to the HTML front end).
  found: "`set_visible(true)` -> `show_all()`. `set_focus()` guarded by `!minimized && get_visible()` -- sends nothing while minimized. `set_minimized(false)` (`unminimize()`) -> `deiconify()`."
  implication: matches the debug file's prior citation exactly; confirms the Linux code path structurally mirrors the fixed Windows bug.

- timestamp: 2026-09-26T (live session)
  checked: live GTK3/X11 reproduction (`tao_focus_repro.py`, faithful port of the above call sequence) on this machine's real X11 display `:1` under the running GNOME Shell/mutter session, using system GTK 3.24.33 (same version tao links against here) via Python's `gi` bindings -- no compiled tao/tauri binary was needed since the defect lives entirely at the GTK/X11 call layer, not in tao's Rust plumbing.
  found: "`_NET_WM_STATE` sequence measured via `xprop`: FOCUSED -> (iconify) HIDDEN -> (show_all + guarded no-op set_focus, mirroring the CURRENT Unix arm) still HIDDEN, unchanged -> (deiconify + show_all + present_with_time, mirroring the PROPOSED FIX) FOCUSED. Reproduced identically on 3/3 runs."
  implication: "CONFIRMS the hypothesis directly and repeatably: the current Unix arm's show()+set_focus() leaves a minimized GameLib main window minimized on Linux; adding unminimize() before show()+set_focus() (the same shape as the Windows fix) restores it."

- timestamp: 2026-09-26T (live session)
  checked: whether the full GameLib Tauri binary could be built on this machine for an end-to-end binary-level reproduction instead, using apt's default install plan (`apt-get install --no-install-recommends -s`).
  found: "No `libgtk-3-dev`/`libwebkit2gtk-*-dev`/pkg-config `.pc` files installed anywhere on this real desktop (`find / -name 'gtk+-3.0.pc'` empty); no passwordless sudo (`sudo -n true` fails); a naive recursive `apt-cache depends --recurse` closure for `libgtk-3-dev` alone returns 400+ lines including unrelated base-system packages -- too broad to hand-extract."
  implication: chose the GTK/X11-level faithful reproduction (above) as the PRIMARY evidence for the behavioral hypothesis, since it does not depend on solving this build problem. Separately attempted a narrower, CI-package-list-scoped build for compiler-level verification of the actual patch (see below) -- succeeded.

- timestamp: 2026-09-26T (live session)
  checked: "narrower, root-free build attempt using the SAME package list this repo's own `release-tauri.yml` CI already documents as sufficient (`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`, plus `libdbus-1-dev` for the `libdbus-sys` crate) -- `apt-get install --no-install-recommends -s` resolved this to 71 concrete `-dev` packages (down from the naive 400+ line closure). `apt-get download` (no root required) fetched all 71 as `.deb` files; `dpkg-deb -x` extracted them into a user-owned scratch prefix; `PKG_CONFIG_PATH`/`PKG_CONFIG_SYSROOT_DIR`/`CPATH` pointed `pkg-config` and the C compiler at that prefix."
  found: "`cargo check --bin gamelib-shell` (after two trivial gitignored scratch placeholders for `tauri.conf.json`'s declared but locally-absent bundle resources -- a dummy `binaries/gamelib-sidecar-x86_64-unknown-linux-gnu` and two dummy `build/bin/x64/win32/*.exe` files, neither related to this bug) compiled the ENTIRE crate including this fix cleanly: `Finished` with 0 errors and only 5 pre-existing warnings (unused vars/dead code in unrelated functions, confirmed present identically on unmodified `main` via `git stash`). `cargo test --bin gamelib-shell` needed actual runtime `.so` files to link (the `-dev` packages' unversioned `.so` dev-symlinks pointed at exact-versioned filenames not present in the scratch prefix); repointing each dangling symlink at the matching real system library (already present, since this desktop's own GNOME session runs on GTK3), plus downloading the 3 genuinely-new runtime packages (`libwebkit2gtk-4.1-0`, `libjavascriptcoregtk-4.1-0`, `libsoup-3.0-0`) this system didn't previously have, made the link succeed: `test result: FAILED. 250 passed; 2 failed`. Both failures reproduce byte-identically on unmodified `main` via `git stash` (confirmed): `find_on_path_var_does_not_find_node_on_the_launchservices_path` (self-documented in its own panic message as failing because this machine has a system `node`) and `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` (an unrelated pre-existing cfg-string mismatch in `humble_login_clear_cookies`, line ~7595, nothing to do with the Unix single-instance socket arm)."
  implication: "The exact patched `main.rs`, including this fix, compiles AND links cleanly with zero new errors/warnings/test failures on real Linux, using this repo's own CI-documented native dependency list. This is compiler- and linker-verified confirmation of the fix's syntactic and type correctness, on top of the GTK/X11 behavioral confirmation above."

- timestamp: 2026-09-26T (live session)
  checked: the phase-46 `46-unix-cfg-regions.awk` gate's own diff command, run against baseline `5bc4fa825`, after applying the fix.
  found: "The diff shows changes ONLY inside the `__GAMELIB_FOCUS__` handling arm (the added `unminimize()` call, its justifying comment, and the `render`/logging pattern copied from the already-shipped Windows fix) -- nothing else in any `#[cfg(unix)]` region changed."
  implication: the divergence from the phase-46 baseline is exactly as scoped and intended -- a deliberate, evidenced, minimal fix, not a drive-by edit.

## Eliminated

(none -- the initial hypothesis was confirmed on the first test)

## Resolution

root_cause: On Linux, tao-0.35.3's `set_focus()` is gated on
  `!self.minimized.load(Ordering::Acquire) && self.window.get_visible()`
  (`platform_impl/linux/window.rs:567-576`), and `show()`'s underlying GTK call (`show_all()`,
  via `WindowRequest::Visible(true)` in `platform_impl/linux/event_loop.rs:306-312`) does not
  clear WM-level iconic state per ICCCM. The Unix `__GAMELIB_FOCUS__` single-instance-socket arm
  called only `window.show()` + `window.set_focus()`, with no `window.unminimize()` --
  structurally the same defect already confirmed and fixed on Windows in phase 46 plan 46-06. As
  a result, a minimized GameLib main window stayed minimized (EWMH `_NET_WM_STATE_HIDDEN`
  persisted) when a second launch (or anything else) sent `__GAMELIB_FOCUS__` over the socket.
fix: Added `window.unminimize()` before `window.show()` and `window.set_focus()` in the Unix
  arm (`src-tauri/src/main.rs`, inside the `#[cfg(unix)]` accept-loop's `__GAMELIB_FOCUS__`
  handling), matching the shape and logging style of the already-shipped Windows fix
  (`handle_windows_single_instance_connection`). Updated the correction-history doc comment
  above `open_about_window_from_tray` with a third correction entry, and added an inline comment
  at the fix site documenting the mechanism and the deliberate divergence from the phase-46
  `46-unix-cfg-regions.awk` gate's `5bc4fa825` baseline.
verification: |
  Multi-signal, all passing:
  1. Source-level: read the actual vendored tao-0.35.3 source (fetched live via `cargo fetch`)
     confirming the exact mechanism (not paraphrased).
  2. Behavioral: live GTK3/X11 reproduction on this machine's real GNOME Shell/mutter session
     (GTK 3.24.33, matching the runtime tao links against here) faithfully porting tao's call
     sequence -- `_NET_WM_STATE_HIDDEN` persisted through the buggy-arm mirror and flipped to
     `_NET_WM_STATE_FOCUSED` only after the fix-arm mirror, reproduced 3/3 runs.
  3. Compiler/linker: `cargo check --bin gamelib-shell` and `cargo test --bin gamelib-shell`
     against the ACTUAL patched main.rs, using a root-free scratch prefix built from this repo's
     own CI-documented native dependency list -- 0 compile errors, 0 new warnings, 250/252 tests
     passing with the remaining 2 failures confirmed byte-identical on unmodified `main` via
     `git stash` (both pre-existing and unrelated to this fix).
  4. Regression scope: the phase-46 Unix-region gate diff shows the change confined entirely to
     the `__GAMELIB_FOCUS__` arm -- no other `#[cfg(unix)]` code touched.
  5. Formatting: `npx prettier --check --ignore-unknown src-tauri/src/main.rs` passes.
  Outstanding (documented as a blind spot, not attempted): no live end-to-end run of the
  actual compiled GameLib binary sending a real `__GAMELIB_FOCUS__` byte string over the real
  Unix socket to a real minimized main window. The GTK/X11-level reproduction exercises the
  identical underlying mechanism this arm invokes, which is why it is treated as sufficient
  behavioral evidence.

  Human verification (2026-09-26): operator responded "Confirmed fixed — accept the live GTK/X11
  reproduction plus cargo check/test/prettier as sufficient evidence, without a full
  compiled-binary end-to-end run (missing libgtk-3-dev/libwebkit2gtk-4.0-dev headers, no
  passwordless sudo in this session — not worth blocking on)." The compiled-binary E2E gap is
  therefore accepted as a deliberate, named limitation, not a silent one.
files_changed:
  - src-tauri/src/main.rs
