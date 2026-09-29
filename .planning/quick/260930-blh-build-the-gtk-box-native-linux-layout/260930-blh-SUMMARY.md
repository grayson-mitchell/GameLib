---
phase: quick-260930-blh
plan: 01
subsystem: store-embed (Linux)
tags: [tauri, gtk, linux, store-embed, overlay, live-gate]
status: complete
requires:
  - "2026-09-28 positioning todo decision (a); spikes 028/029"
provides:
  - "Linux GTK-box-native store/wiki embed layout (Overlay over main + pass-through Fixed), renderer gate admits linux"
  - "Reusable live harness: embed_live.ts, check_settled.py, cap.py"
affects:
  - "src-tauri/Cargo.toml, src-tauri/Cargo.lock, src-tauri/src/main.rs, src/frontend/screens/WebView/index.tsx, tauriShellSource.test.ts comments"
key-files:
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/Cargo.lock
    - src-tauri/src/main.rs
    - src/frontend/screens/WebView/index.tsx
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/todos/pending/2026-09-28-linux-add-child-embed-cannot-be-positioned-gtkbox-packing.md
  created:
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/embed_live.ts
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/check_settled.py
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/cap.py
    - .planning/quick/260930-blh-build-the-gtk-box-native-linux-layout/evidence/
decisions:
  - "Live scored runs used WEBKIT_DISABLE_DMABUF_RENDERER=1 because the dev app never painted with it unset (0/6 launches)"
  - "Zero-area slot rects are ignored on Linux (logged), rather than applied verbatim"
  - "Existing-embed store_embed_open on Linux re-applies the carried rect and shows the embed"
commits: 4
plan_head_before: 8925b22a253de06766c6d11494b57a2e30ebfad7
actuals:
  tokens: 19000
  tasks: 3
  commits: 4
estimate_note: "actuals.tokens is chars/4 over the code diff (75417 chars) incl. harness scripts; the plan estimated 180000 (harness/live work dominated wall-clock, not diff size)"
---

# Phase quick-260930-blh Plan 01: GTK-box-native Linux store-embed layout Summary

On Linux, opening `/store/gog` in the dev app now puts the GOG page exactly in the renderer's slot, with the app's own UI at full size and clickable around it. The main webview lives in a `gtk::Overlay` and the embed sits in a pass-through `gtk::Fixed`, using only public Tauri Linux API plus gtk-rs, with no runtime or wry patch. The layout is proven live on one X11 machine, but only on the DMABUF-disabled render path (see the first deviation).

## What was built

- **Layout** (`linux_store_embed_layout` in `src-tauri/src/main.rs`). On the first `store_embed_open`, main's widget moves from `default_vbox()` into an `Overlay` packed at its old position. A `Fixed` is the Overlay's only overlay child (`set_overlay_pass_through(true)`), and the embed is moved from the vbox into that Fixed. It is positioned with `Fixed::move_` + `set_size_request`. The Fixed is never a vbox sibling of main. Every GTK call runs on the GTK main thread through `with_webview`, bounded by a 10s `recv_timeout`. A debounced (500 ms) measurement log emits one `[shell] store_embed(linux): settled ...` line per settle.
- **Pure helpers with red-first tests:** `store_embed_linux_gtk_rect` (rounding to `i32`; rejects non-finite, out-of-range and negative-size input), `store_embed_linux_settled_line`, `store_embed_linux_rect_is_zero_area`. The first two groups were observed RED (compile failure) before implementation.
- **Cargo:** `[target.'cfg(target_os = "linux")'.dependencies]` with `tauri = { version = "2", features = ["unstable"] }` and `gtk = "0.18.2"`. `Cargo.lock` gained exactly one `"gtk",` line and no new crate name.
- **Gating:** the store-embed section is `any(macos, linux)`. Windows keeps all ten `:unsupported-platform` arms (non-comment count 10 before and after). macOS `set_position`/`set_size` statements are unchanged inside `#[cfg(target_os = "macos")]`. No per-store data-store identifier is set (non-comment count 0): Linux runs on the one shared cookie jar and nothing claims isolation.
- **Renderer gate** (`index.tsx`): `platform !== 'darwin' && platform !== 'linux'`. Panel copy and l10n catalogues are untouched.
- **Existing tests now run on Linux:** 22 macOS-gated `store_embed_*` tests converted (`N_CONVERTED = 22`).
- **Harness:** `embed_live.ts` (fresh `createFakeHomeProfile`, window `_NET_WM_PID` -> `/proc/<pid>/exe` identity, incremental settled-line extraction, stop-file, shell-first then group then environ-matched teardown, `dispose()` in `finally`), `check_settled.py` (with `--selftest` proving it rejects a squeezed main, an off-by-one embed, an error line, an empty log and a no-resize log), and `cap.py` (window capture by xwininfo absolute origin).

## Baselines and after-counts

| Measure | Baseline | After |
| --- | --- | --- |
| `cargo test --bin gamelib-shell` (full) | 254 passed, 0 failed, 2 ignored | 285 passed, 0 failed, 2 ignored |
| `cargo test ... store_embed` | 0 passed | 31 passed (22 converted + 8 layout-helper + 1 zero-area) |
| `cargo fmt --check` "Diff in" | 75 | 75 (no growth) |
| Non-comment `:unsupported-platform` store_embed arms | 10 | 10 |
| Non-comment `data_store_identifier` | 0 | 0 |
| `Cargo.lock` diff | - | one added `"gtk",` |
| jest Frontend `src/frontend/screens/WebView` | - | 287 tests, 14 suites, success |
| jest Backend `tauriShellSource` + `cargoFeatures` | - | 234 tests, 2 suites, success |
| `pnpm codecheck` | - | exit 0 |
| `prettier --check` (index.tsx, tauriShellSource.test.ts) | - | clean (both `"ignored": false`) |
| `pnpm planning-gates` | - | 12/12; todo frontmatter gate OK |

## Live results (dev binary, fresh fake profile per launch, X11, one machine, 1280x800)

Slot rect from the renderer: `204,82 1076x418`. Evidence: `evidence/` (`expansion-results.txt`, `*-identity.txt`, `*-teardown.txt`, `*-settled.log`, inspected captures).

- **Tracer PASS.** `requested=204,82,1076x418 embed=204,82,1076x418 main=0,0,1280x800 vbox=1280x800`. GOG content in the slot below the controls, NavShell tabs rendering above (main is not blank after its reparent). `tracer-teardown.txt`: `POST_TEARDOWN_PROCS=0`.
- **E1 resize PASS.** 1280x800 -> 1100x700 -> 1280x800: 4 settled lines, 4 pass, 2 distinct vbox sizes, main always the full vbox, embed always the requested rect.
- **E2 wheel PASS.** Changed pixels: slot 0.5024; chrome band above the slot 0.0000; left nav 0.0000; inspector strip 0.0000.
- **E3 pass-through PASS.** A click on the LIBRARY tab (outside the embed, under the full-size Fixed) reached main; the route changed and no GOG pixels remained.
- **E4 return PASS** (after fix 1 and fix 2, below): GOG is back in the slot with a fresh passing settled line. **E4b PASS:** GOG -> Epic -> GOG returns the embed to `204,82`.
- **E5 RECORDED, not gating.** A link click inside the embed navigated it (in-embed click input works). The host label did not change (same host), so "label changes" was not exercised. Whether Back moved the history is UNCONFIRMED; consistent with Phase 40 Observable Truth 6 (FAILED on macOS itself).
- **RECORDED, not measured:** the first-open split frame (no capture inside the first 500 ms) and keyboard focus after first open.

## Deviations from Plan

### 1. [Rule 3 - Blocking, environment] `WEBKIT_DISABLE_DMABUF_RENDERER` could NOT be left unset

The plan required it absent from the launched environment. With it absent, the dev app's renderer never painted on this host: 0 of 6 launches rendered (window white, `#root` empty, renderer log stops after `after-hydrate`, no JS errors, WebProcess alive at ~1% CPU). With `WEBKIT_DISABLE_DMABUF_RENDERER=1`, 6 of 8 launches rendered; the other 2 stalled the same way and are the known intermittent blank launch (todo `2026-09-17-packaged-app-renders-blank-on-roughly-one-launch-in-four`), so those were relaunched before any embed action. NVIDIA 580.173.02 reported no driver mismatch. All scored live runs therefore used `--diag-env WEBKIT_DISABLE_DMABUF_RENDERER=1` (recorded as `DMABUF_VAR_PRESENT=yes`, `DIAG_ENV=...` in the identity files). The plan's clause "DMABUF absent" is **NOT MET**, and the automated verify's `DMABUF_VAR_PRESENT=no` grep would fail against the tracer identity file. The layout is proven on the DMABUF-DISABLED path only. Evidence: `evidence/unset-dmabuf-attempt.txt`, `unset-attempt2-*.txt`, `unset-dmabuf-blank-window.png`, `dmabuf-disabled-app-renders.png`. This is a census of 14 launches, not a mechanism; whether a packaged app or another GPU stack paints with it unset is unknown.

### 2. [Rule 1 - Bug] Route return left the embed hidden (fix attempt 1 of 2)

Live-found in the first expansion run: leaving and returning to `/store/gog` showed a black slot. The slot unmount sends a zero rect that the Linux `set_bounds` branch applied verbatim while the embed was hidden, and the renderer's remount calls `store_embed_open` again, whose existing-embed path only navigates (no show, no bounds). Fix: on Linux only, the existing-embed branch re-applies the carried rect and shows the embed before navigating. This touches the existing-embed navigate path the plan said to leave unchanged, so it is a deliberate deviation; the macOS statements are untouched. Commit `0e46c4372`. Pre-fix evidence: `prefix-run-*`. Post-fix-1 evidence: `fix1-run-*`.

### 3. [Rule 1 - Bug] Epic round trip drew the embed at (0,0) over the chrome (fix attempt 2 of 2)

After fix 1, GOG -> Epic -> GOG (the refused-target path calls `show` + `navigate` with no bounds) drew the embed at `(0,0)`, over the app chrome. Cause: the zero rect from the Epic panel's slot unmount was the last rect applied. Fix: on Linux, `store_embed_set_bounds` ignores a zero-area rect with a logged line (`ignored zero-area bounds (slot unmounted); keeping the last real geometry`). This departs from "apply verbatim" (D-18), and a slot that genuinely collapses to zero area while visible would now keep its old geometry; that edge is unmeasured. Commit `0e46c4372`. The full expansion sequence was then re-run on the final binary (E1-E4b all PASS). Both fix attempts are spent.

### 4. [Tooling] The plan's jest command form is wrong

`jest --selectProjects Backend <paths>` makes `--selectProjects` swallow the paths and runs the whole Backend project (5094 tests). That run had 2 failures in `lzmaNativeSeaRealBuild.test.ts` (two `gamelib-sidecar-*` binaries present in `src-tauri/binaries`), unrelated to this change and left alone. The recorded results use the path-scoped form (paths first, `--selectProjects` last).

### 5. [Scope] Branch

The work was on protected `main`, so before the first commit I created and committed on branch `quick-260930-blh` (the repo's own pattern: `Merge branch 'quick-260930-aof' into main`). Merging it is the orchestrator's call.

## Windows / macOS / not-verified

- **Windows compile: NOT verified (environment).** `cargo check --target x86_64-pc-windows-msvc` failed in a build script (`cc-rs` cannot find `lib.exe`); `--target x86_64-pc-windows-gnu` failed in `tauri-build` (`binaries/gamelib-sidecar-x86_64-pc-windows-gnu.exe` missing). Neither reached `src/main.rs`; neither is a pass or a fail of this change.
- **macOS build leg: NOT compiled** (no apple target on this host). macOS is protected only by leaving its statements inside `#[cfg(target_os = "macos")]` blocks unchanged.
- **Also not verified:** the packaged AppImage/release build; a real-profile run with logged-in stores; Wayland; HiDPI scale != 1.
- The Rust `store_embed_*` tests are HAND-RUN: CI runs no cargo step.

## Open observations (for the operator, NOT decided here)

1. The embed's Chrome UA keeps its `Macintosh` platform token on Linux.
2. The `platform` panel copy still names only macOS (true for Windows; no l10n churn taken).
3. The first open may show one frame of GTK's even split before `mount` runs (unobserved: no capture inside 500 ms).
4. Keyboard focus after first open was not measured.
5. The macOS path has the same shape as the two defects fixed here (existing-embed open only navigates; a zero rect is applied verbatim on unmount). That is unmeasured on macOS, and could be a real macOS defect.
6. The dev build auto-docks the WebKit inspector inside the main webview, so the renderer viewport was 1280x500 in every run.
7. xdotool's `getwindowgeometry` origin is off by the decoration offset on this host (60,164 vs xwininfo 50,119); the older `linux_sitting_capture.py grab` uses the xdotool origin, so `cap.py` was written instead.

## Known Stubs

None.

## Threat Flags

None beyond the plan's `<threat_model>`. Mitigations exercised: T-blh-02 (navigation-policy tests now run on Linux, 22 converted), T-blh-03 (pass-through proven by E3; embed never drawn over the chrome after fix 2), T-blh-04 (bounded `recv_timeout`, mount failure closes the embed and clears history, `linux-not-mounted` is a distinguishable error), T-blh-05 (unit-tested rect validation), T-blh-06/07 (fresh fake profile per launch, identity files omit the profile path, `POST_TEARDOWN_PROCS=0` in every scored run, kills by pid/group only). The vite dev server was stopped by process group. One shared cookie jar remains accepted (T-blh-01); no identifier is set.

## Commits

| Commit | Message |
| --- | --- |
| `e4d25138a` | feat(quick-260930-blh): Linux GTK-box-native store-embed layout, tracer proven live |
| `0e46c4372` | feat(quick-260930-blh): run store_embed tests on Linux, fix route-return placement, live expansion proven |
| `704fa246b` | docs(todo): record the spike-029 DMABUF-unset re-run (pre-existing working-tree change, committed for provenance) |
| `0029d03f0` | docs(todo): linux embed positioning todo to ready: live-gate after the GTK-box-native layout was built and proven live (quick 260930-blh) |

`.planning/spikes/025-linux-add-child-compile/app/gen/` and `run.log` were left untouched and uncommitted. `graphify update .` was run (AST-only); its outputs are not tracked.

Todo triage: `ready: code` -> `ready: live-gate`, one `## Addendum (2026-09-30, quick 260930-blh)`, file stays in `pending/`. The todo path is prettier-ignored (`"ignored": true`), so a `prettier --check` there would be vacuous and was omitted. The Rust and TOML paths have no prettier parser; the Rust formatter gate is the rustfmt no-growth ceiling (75 -> 75).

## Self-Check: PASSED

- Created files exist: `embed_live.ts`, `check_settled.py`, `cap.py`, `evidence/expansion-results.txt`, `evidence/desk-battery.txt`, `evidence/tracer-gog-in-slot.png`.
- Commits exist on `quick-260930-blh`: `e4d25138a`, `0e46c4372`, `704fa246b`, `0029d03f0`; `git rev-list --count 8925b22a2..HEAD` = 4, matching `commits: 4`.
- Post-run: 0 `gamelib-shell` processes, no `/tmp/gl-blh-*` profile left, vite stopped.
