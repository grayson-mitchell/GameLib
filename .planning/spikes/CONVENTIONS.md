# Spike Conventions

Patterns and stack choices established across spike sessions. New spikes follow these unless the
question requires otherwise.

## Stack

- **Executable experiments (depot/download line, 001–003):** standalone Node **ESM `.mjs`**
  scripts, run with `node`, no build step, no bundler. Reuse the project's existing deps
  (`steam-user`, `@node-steam/vdf`) rather than adding new ones — the project's no-native-modules
  constraint holds (pure-JS LZMA proven acceptable in 002).
- **Feasibility / reconnaissance spikes (bridge line, 004):** no code build. Deliverable is a
  grounded README backed by (a) a **web survey** of prior art and (b) **local binary inspection**
  of the real install — `file`, `nm -gU`, plist/config reads — captured inline as evidence.
  Appropriate when the question is a fact ("does this native surface exist / can this cross the
  boundary"), not a feeling.
- **Rearchitecture / portability spikes (Tauri line, 009–012):** two flavors.
  (a) *Coupling probes* — hook `Module._load` to swap `require('electron')` for a **Proxy recorder**
  and load the real built bundle (`build/main/main.js`) under bare `node`; the ordered touch-list +
  fault point is the evidence of runtime coupling (009). A tolerant recorder (coerces to benign
  values) reveals deeper import-time surface than a strict one.
  (b) *Rust parity probes* — a plain `cargo` binary (no Tauri CLI needed) that exercises the same OS
  facility a Tauri plugin wraps (`keyring` → macOS Keychain for safeStorage; `/usr/bin/open` +
  registered scheme for `shell.openExternal`). `.gitignore` the `target/` dir; commit `Cargo.toml` +
  `src/` + the run output. Grounded verdicts = real Keychain round-trips, real crate builds.
- **Native handshake spikes (bridge line, 005):** single-file `clang -arch arm64` helper that
  **`dlopen`s the on-disk Steam dylib and `dlsym`s only the symbols found via `nm -gU`** — no SDK
  headers, no link-time Valve dependency. Emit an ISO-timestamped forensic event log (stderr +
  `run.log`) plus a final JSON verdict on stdout; exit code encodes pass/fail. `.gitignore` the
  compiled binary + transient `steam_appid.txt`; commit source + scripts + README + `run.log`.
  Requires the live signed-in Steam client (user launches it).

- **Live-webview / platform-behaviour spikes (Tauri line, 013–015):** a real `cargo`-run Tauri
  app (no Tauri CLI: static `dist/index.html` as `frontendDist`, `bundle.active = false`, plus a
  copied `icons/icon.png` which `generate_context!` demands even when bundling is off). Set
  `CARGO_TARGET_DIR` to the project's own `src-tauri/target` **and match `Cargo.toml` feature
  flags to `src-tauri/Cargo.toml`** — the ~600 cached rlibs are then reused and a clean harness
  build takes **5 s instead of ~10 min**. Ship both an interactive control panel *and* a scripted
  `SPIKE_AUTORUN=N` path, so the evidence is reproducible and diffable rather than
  click-dependent.
- **When a spike's claim is VISUAL ("renders", "composites", "is inside the window"), the
  evidence must be pixels, not API returns.** Log each window's `NSWindow.windowNumber`
  (== `CGWindowID`; one `objc2::msg_send![…, windowNumber]` on `ns_window()`) and have the
  run photograph itself with `screencapture -x -o -l<id>` — this captures the exact window
  even when occluded or on another display, which full-screen grabs repeatedly failed at
  (and full-screen grabs also sweep in the user's unrelated windows — delete those on
  sight). Established in 016.
- **Truncate logged evidence AFTER the discriminating byte.** A 60-char UA prefix cut at
  `AppleWebKit/` made a *working* Chrome-UA spoof look failed in 016's first log pass —
  Chrome and default WebKit UAs are identical up to exactly that point. When a field exists
  to discriminate two outcomes, log at least through the point where they diverge.
- **When the question is "does this API silently no-op?", build a POSITIVE CONTROL first.**
  A read returning `[]` is uninterpretable on its own. Stand up a loopback origin whose state you
  set exactly, prove the API can see it, and only then trust an empty result from the real
  target. Classify every result into an explicit verdict — `SUPPORTED_NONEMPTY` /
  `SUPPORTED_BUT_EMPTY` / `UNSUPPORTED_OR_ERROR` / `UNDECIDABLE` — and never report a bare
  empty list. Prefer **three independent oracles** (the API under test, a self-hosted server that
  echoes what the client actually sent, and an in-page JS view): in 014a two oracles agreeing on
  a *surprising* 3-of-5 result is what proved the API faithful and my control design wrong.
- **Redact secrets in spike logs.** Cookie/token values are logged as a 3-char prefix + length
  unless the spike set them itself (`spike_*`). Enough to prove identity and change across polls;
  never a real session token on disk. Mirrors `user.ts`'s existing secrecy discipline.

## Structure

- One directory per spike: `.planning/spikes/NNN-descriptive-name/`. Sub-probes of a single
  feasibility question may share a number with a letter suffix (`004a/004b/004c`) — reserved here
  for *facets of one question*, distinct from the "comparison variant" meaning of the suffix.
- Every spike has a `README.md` with YAML frontmatter (`spike`, `name`, `type`, `validates`,
  `verdict`, `related`, `tags`), an **Investigation Trail**, and a **Results** section with the
  verdict and evidence.
- `MANIFEST.md` groups spikes by **idea line** (Idea A = native install; Idea B = macOS Steam
  bridge). Requirements that emerge live under their idea line.

## Patterns

- **Depth over speed / no single-happy-path VALIDATED.** Follow surprises (001's vdf 64-bit
  corruption; 002's steam-user filename truncation; 004b's "the working path avoids the hard
  part").
- **Ground verdicts in observed evidence** — real installs, real binaries, real byte-comparison —
  not just docs or reasoning.
- **Carry findings forward as MANIFEST Requirements** the moment a design decision is proven, so
  the real build inherits them.

## Tools & Libraries

- `steam-user` (CM auth, PICS, raw manifests, depot keys) — but reimplement its `getManifest()`
  filename handling and chunk download by hand (broken; see 002).
- `@node-steam/vdf` — corrupts 64-bit GIDs; treat 64-bit IDs as strings end-to-end (001).
- macOS inspection: `file`, `nm -gU`, `find`, plist reads. CrossOver runtime at
  `/Applications/CrossOver.app/...` ships **no** winelib build toolchain (winegcc/winebuild) — a
  from-scratch winelib build is out of scope for a feasibility spike (004a).
- **Windows PE cross-compilation (bridge line, 005b/005c):** `brew install` does **not** work in
  this environment (Homebrew only dry-runs — "Would install"). Use **`zig cc -target
  x86-windows-gnu`** instead — zig is a self-contained tarball (bundles a mingw-w64 sysroot), no
  brew/root. Download via `ziglang.org/download/index.json` → the `aarch64-macos` tarball; scripts
  take `ZIG=/path/to/zig`. Produces `PE32 … Intel 80386`. Force exact DLL export names with a
  `.def` file (Steamworks S_API is `__cdecl` on i386).
- **Running a PE in a GameLib bottle:** `CX_BOTTLE=<bottle> /Applications/CrossOver.app/Contents/
  SharedSupport/CrossOver/bin/wine "C:\prog.exe"`. Wine on macOS **shares the host network
  namespace**, so `127.0.0.1` in the bottle is the host loopback. The real bottle is
  `GameLibSteam` (Phase 17); its `drive_c` is at `~/Library/Application Support/CrossOver/Bottles/
  GameLibSteam/drive_c`. Have PEs also write results to `C:\*.txt` (recoverable host-side) in case
  the bottle detaches stdout.
- **Bottle/wineserver hygiene (bridge line, 007+):** do NOT launch via `cxstart` — it detaches and
  **wedges the bottle's `wineserver`**, silently swallowing later `wine` output. Use `bin/wine`, and
  run `.../bin/wineserver -k` between runs to reset. Real 32-bit Windows games live under the bottle
  at `.../GameLibSteam/drive_c/Program Files (x86)/Steam/steamapps/common/<game>/`.
- **Rust toolchain (Tauri line, 009–012):** `cargo`/`rustc` **are** installed locally (1.94.x). The
  `keyring` crate (feature `apple-native`) builds and round-trips the macOS Keychain with no extra
  setup. No Tauri CLI is installed — and it isn't needed for feasibility probes; a bare `cargo`
  binary exercising the underlying OS facility is sufficient and cheaper.
- **Real-game drop-in shims (bridge line, 007/008):** to replace a game's `steam_api.dll`, first
  enumerate its exact import set — `/usr/bin/objdump --private-headers "<game>.exe" | grep -A40
  'DLL Name: steam_api'` — and export **every** one via a `.def` (a missing export = the process
  won't load), identity marshaled to the bridge, the rest stubbed. Always back up the original DLL
  and restore on exit (trap). Note: `steam_api.dll` return values (`Init`,
  `RestartAppIfNecessary`) are **advisory** — many games ignore them; the bridge is a compatibility
  layer, not a DRM gate.

- **Login-UX spikes (019–022):** the shared fixture is spike 019's DummyStore
  (`019-dummy-oauth-store/store-server.mjs`, zero-dep Node ESM, port 17940) — an OAuth 2.0
  auth-code-grant provider with a hot-editable login form. Scripted flows against it MUST run
  a logout preamble and baseline the store's `/events` counters after it: the login-window
  jar persists across app restarts, so "logged in" is sticky and silently skips the form.
  Claims get TWO oracles — the harness `run.log` and the store's own `/events` export.
- **Human-judgment spikes get a probe-checklist UI** (020/021/022): an explicit numbered probe
  table in the control panel with yes/no/n-a toggles + note fields, each toggle logged into
  the same forensic stream as the machine events. Conversational reports are acceptable
  evidence — record them in the README trail as "reported conversationally" with the date.
- **objc2 binding gaps: use raw `msg_send!`** when a method (`orderedWindows`,
  `childWindows`, `sheetParent`) isn't generated under src-tauri's pinned feature set —
  extends 016's `windowNumber` convention. Match src-tauri's `Cargo.toml` verbatim for the
  objc2 crates AND remember `tauri`'s `unstable` feature is required for
  `tauri::WindowBuilder`/`get_window` (raw-window shells, multiwebview).
- **Menus are their own windows.** A per-window `screencapture -l<id>` grab (016) MISSES a
  popped NSMenu. Use a region grab (`-R x,y,w,h`) scoped to the owning window's screen rect —
  wider regions sweep in the user's unrelated windows. NSWindow frames are bottom-left origin;
  `-R` is top-left, so flip against `NSScreen.mainScreen().frame().size.height`. *(022)*
- **A synthesized event is not a user event — prove the hit before trusting a negative.**
  Log `document.elementFromPoint` at the click centre (the coordinate path CSS px → view
  coords → `convertPoint:toView:nil` is easy to get wrong by a title bar), and compare the
  result against the same probe driven by a REAL click. In 022 the same verified element
  yielded two DIFFERENT menus by event provenance. *(022)*
- **Check the session's own `Platform:` line before assuming a spike needs "the other machine."**
  Spikes 025–027 ran on a Linux session that turned out to be the operator's real, owned desktop
  (`DISPLAY` set, two real monitors) — not a sandboxed CI runner. A macOS-authored Tauri spike
  harness with no target-specific gate in its `Cargo.toml` (016's shape) is *already* a valid
  Linux/Windows probe with **zero source changes**: only the one already-scoped platform-specific
  dependency (`objc2`, used solely behind `#[cfg(target_os = "macos")]`) needs moving into
  `[target.'cfg(target_os = "macos")'.dependencies]` so the other OS never has to resolve it.
  *(025.)*
- **Linux Tauri build deps are one `apt-get` away, and CI has never verified this repo needs
  them.** `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf libgtk-3-dev
  build-essential` — the exact list `release-tauri.yml:193` installs — plus `mingw-w64` (provides
  `x86_64-w64-mingw32-windres`) if also cross-checking a `windows-gnu` target from the same host.
  `rust-test.yml`'s own header comment records that this project's CI has **never** compiled
  `src-tauri` on Linux for exactly this reason — a first local install is genuinely first
  contact, not a formality. *(025.)*
- **A missing `windres`/`llvm-rc` blocks a Windows `cargo check` at the resource-embed step, not
  at your own code.** `tauri-build`'s Windows resource generation (icon embed) is unconditional
  whenever `target_os == "windows"` — there is no `Attributes` flag to skip it — so a Windows
  cross-check needs `icons/icon.ico` (reuse the real project's own, don't fabricate one) AND a
  resource compiler for the chosen triple (`mingw-w64` for `-gnu`, an `llvm`/clang toolchain for
  `-msvc`). A failure here says nothing about whether your `add_child`/webview code compiles —
  don't let it read as a code-level blocker. *(027.)*
- **`cargo check --target <other-os>` (no system linker needed) is a real, cheap signal — not
  nothing, but not a live run either.** It exercises full trait resolution and proc-macro
  expansion against the target's real crates (`webview2-com`, `windows`, etc.) without needing
  that OS's linker at all. Treat a pass as "the API surface compiles here," never as "it works
  here" — 026 found that even a *successful, source-confirmed* cross-platform builder field
  (`data_store_identifier`) can be a silent runtime no-op on a backend that never reads it.
  Source-reading the dependency (not just running the harness) is what turned that from a
  suspicious log line into a citable, root-caused finding — grep the actual backend module
  (`wry-X.Y.Z/src/<backend>/mod.rs`) for the API in question before trusting a builder-pattern
  call "worked" just because it returned `Ok`. *(026/027.)*
- **A full-desktop screenshot on a real (non-sandboxed) machine is a privacy incident, not just
  noise.** `mss`/`import`/`scrot` grabbing the whole display on the operator's actual desktop
  captures whatever else is on screen — their other windows, browser tabs, editor buffers.
  Get the target window's exact geometry first (`xwininfo -id <id>` after `xdotool search --pid
  <pid>`), region-capture only that rect, and if a stray full-desktop grab happens anyway
  (e.g. because the process had already exited and the "hit" was really whatever window
  happened to occupy that screen position), **delete it immediately** rather than inspect it
  further — this extends 016's macOS `screencapture -l<id>` discipline to X11, where the
  equivalent tool (`xdotool`/`xwininfo`/`mss` region grab) has to be assembled by hand and no
  native per-window capture flag exists. A window's reported geometry can also go stale within
  seconds if the process has already exited (`BadWindow` on `xdotool windowactivate` for an ID
  that answered `xwininfo` moments earlier) — re-resolve the window id immediately before
  capturing, don't cache it across several other tool calls. *(025.)*
- **A silent native crash (no Rust panic, process just vanishes) means check `journalctl`/`dmesg`
  for a segfault before assuming a clean exit or a hung process.** `libwebkit2gtk`'s crash in 026
  produced zero output on stdout/stderr and no panic — only `journalctl --since ... | grep
  segfault` revealed it, twice, at the identical instruction offset, which is what turned "the
  window just closed" into a confirmed, reproducible native defect. *(026.)*
- **Isolate a multi-phase autorun crash with a one-line env-gated skip, not a rewrite.** When
  phase 6 of a shared multi-phase `autorun()` crashed, adding `if
  std::env::var("SPIKE_SKIP_X").is_ok() { ...skip... } else { ...original... }` around just that
  phase (leaving 1–5 and 7–8 untouched) isolated the defect to that phase in one rebuild
  (1.95s incremental) without disturbing the evidence trail for everything else. *(026.)*
