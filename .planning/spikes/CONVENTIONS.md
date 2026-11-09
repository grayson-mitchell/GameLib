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
  **Exception: a Wine game's Metal surface.** `screencapture -l` returned byte-identical stale
  frames of D3D/Metal game windows, even with the Steam overlay open (062 run 3), so pixels
  cannot prove what a bottled game draws. Use the operator's report, appended to the run's
  `run.log` as an `operator: …` line, plus process and log evidence (`vmmap`, Steam's
  `console_log.txt`), and a control run where the expected effect must be absent (062 run 2,
  064 run 1). Established in 061–064.
- **Live bottled-game spikes: one background harness per run, operator at the keyboard.** The
  harness launches the game, finds its pid by its largest on-screen window (`CGWindowList`; a
  game may own a thin strip first), accepts only a numeric pid, restores every file it touched
  in an `EXIT` trap, and stops on game exit. Never edit a `/bin/sh` script while a run of it is
  live: sh reads incrementally, and a rewrite corrupts the running tail. Pass the title and
  backend as env vars so one harness serves every title (062's `run.sh`, reused by 063/064).
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

- **Wrap-up `sources/` copies only git-tracked spike files** (`git ls-files .planning/spikes/<n>`).
  A spike's working tree can hold an installed game, chunk corpora, run state and raw logs that its
  `.gitignore` keeps out of the repo; the skill's `sources/` is committed, so a directory copy
  republishes them (067a's first copy was 398 MB of Civ V). *(2026-11-09 wrap-up)*
- **Signed-in Steam CM probes (Rust migration line, 071–074):** a plain `cargo` binary per
  candidate crate, pinned to a git `rev`, with a Node `.mjs` beside it that makes the same calls
  through `steam-user` as the parity reference. The binary reads the refresh token itself from
  the dev vault (`$TMPDIR/gamelib-dev-secret-vault.json`, slot `steam-refresh-token`); tokens,
  depot keys and request codes are never printed, and keys are compared by SHA-1 fingerprint.
  Every signed-in logon on macOS goes through `071a/run-authed.sh` (or its Rust twin in 072/074),
  which refuses to log on unless Mac Steam's user-initiated LogOff is seen within 5 s. Leave about
  15 s between back-to-back wrapped runs, or the second wrap refuses while Steam reconnects.
  Anything the operator types (password, Guard codes) goes through a local page served by the
  harness, never a terminal. Commit source, README and redacted run logs; `out/` and `target/`
  are gitignored.
- **The go-offline wrap is optional for signed-in probes since 075.** GameLib's full Refresh ran
  unwrapped without flipping Friends on 2026-11-09, and 076's long unwrapped sessions (depot keys,
  request codes) didn't either. Use the wrap for short probes, where it costs nothing. Skip it when
  it would hold Mac Steam offline for minutes, and say so in the README. Either way, mirror
  `connection_log.txt` into the run log as the oracle. *(075, 076)*
- **Depot-data spikes: Node for the CM, a Rust bin on `gamelib-depot` for the bytes.** Use a
  standalone cargo package (its own `[workspace]`) with a path dependency on
  `src-tauri/crates/gamelib-depot`, so parsing and chunk decoding are production's own
  (`parse_manifest`, `container::decode_chunk`). Node gets depot keys, request codes and CDN
  hosts through steam-user and does the CDN fetches. The depot key reaches Rust **on stdin** and
  is never printed or written. `parse_manifest` wants the raw CDN bytes; steam-user's
  `getRawManifest` returns them already unzipped, so fetch the manifest URL yourself. *(076;
  extends 071's convention.)*
- **Spikes that write into a real install work on an APFS clone** (`cp -cR` into the gitignored
  `out/`), never on the install itself. Delete the clone afterwards: blocks the run rewrote are
  real disk (~13 GB for 076's Manor Lords). Hash a file in the real install afterwards to prove
  it was untouched. *(035, 076)*
- **Live Steam-pipeline spikes that reuse production code (Idea E, 067a):** an esbuild bundle
  (`--packages=external`, the sidecar's flags) of a TypeScript harness that imports the real
  `src/backend` functions, next to the app's dev decode worker (`build/main/decompressWorker.js`,
  found via `__dirname`). Sign in with a **steam-session QR code** shown as a local HTML page
  (operator's choice: the refresh token stays in memory and is never written; raise
  `loginTimeout` from its 30 s default), build the steam-user client with production's options
  (`enablePicsCache: false, autoRelogin: false`), wait for `licenses`, then swap it into the
  `SteamUser` statics. Call `initHeadless(true)` before any backend code logs, run with `HOME`
  pointed at `state/home` so a GameLib app starting mid-run cannot rotate the log away, and
  flush for 3 s before `process.exit`. Mac Steam must be quit (Phase 54 Friends sign-out). Keys
  never touch disk: chunks are saved post-decrypt, and benches re-encrypt with a throwaway key.

- **Cross-platform Rust probes (080):** build locally first: `x86_64-pc-windows-gnu` with
  `x86_64-w64-mingw32-gcc` (installed) and **run it under GameLib's pinned Wine-Staging**
  (`.../steam-engines/wine-staging-<v>/Contents/Resources/wine/bin/wine`, never the `.app`'s
  `Contents/MacOS/wine` stub) in a fresh `wineboot -i` prefix under `out/`; Linux with zig as
  CC/linker through a wrapper that drops cc-rs's `--target=` flag. GNU proves nothing about MSVC
  build scripts, so production's MSVC target and a live Linux run go to **CI on a throwaway branch
  cut from `origin/main`** (never from a local `main` that is ahead: the push would publish those
  commits), in a separate worktree, workflow on `push` to that branch only (no other workflow
  triggers off `main`/`stable`), **anonymous logon only**, logs as artifacts, then delete the
  branch and worktree. The pre-push hook Prettier-checks the workflow file. *(080)*
- **Two signed-in sessions in one spike need distinct `logonID`s,** or the later logon kicks the
  earlier with `LogonSessionReplaced` 34 (steam-user default 0; steam-vent hard-codes 0). *(077)*

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

- **Rust crypto/compression for Steam chunks (067b):** `aes` 0.8 needs `--cfg aes_armv8` in
  `.cargo/config.toml` or it runs a software fallback ~20× slower than Node's OpenSSL; `flate2`'s
  default `miniz_oxide` is ~2.5× slower than Node's zlib, use the `zlib-rs` feature; `xz2`
  (`static`) beats `lzma-rs` by ~30%. Naive Rust loses to Node here because Node's hot paths
  are already C.

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
  run `WINEPREFIX="$HOME/Library/Application Support/CrossOver/Bottles/<bottle>" .../bin/wineserver -k`
  between runs to reset — **`bin/wineserver` ignores `CX_BOTTLE`**, so `CX_BOTTLE=<b> wineserver -k` silently
  kills nothing (036: a "cleaned-up" bottled Steam survived and swallowed two later runs). Real 32-bit Windows games live under the bottle
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

- **Bridge-bottle game experiments without touching an install (035):** APFS-clone a bridge bottle
  (`cp -cR`) and build a **shadow tree** of symlinks into the real install, with only the directory holding
  `steam_api.dll` made real. CrossOver's `bin/wine` ignores `WINEDEBUG`; trace with `--cx-log <file>
  --debugmsg +sync,+reg,+file`. When a question is "what does genuine Steam do", boot the bottled Windows
  client as an **oracle** and diff traces; to read a launched process's env, dump its PEB from a tiny PE
  (Wine's `+process` doesn't trace CRT `getenv`).
- **Shim-side game fixes: prove them on a positive-control probe PE first (034).** A tiny `zig cc` x86 program
  that imports `steam_api.dll` (one import, never called, so the shim loads at process start) and the API the
  fix hooks, run in an APFS-cloned bridge bottle (035's clone pattern), gives a self-verifiable cfg matrix
  before any live game run. Build the shim exactly as `buildShimCompileArgv` + `SHIM_RELEASE_CFLAGS` does.
  Make an import lib with `zig dlltool -m i386 -d <def> -l lib.a`: `zig cc -shared` names its own import lib
  after the first source file and drops it in the cwd. macOS has no `timeout`; use
  `perl -e 'alarm shift; exec @ARGV' <secs> <cmd>`.
- **Engine-matrix spikes (bridge line, 056–059):** one harness, an `<engine>` argument, the same
  probe or title under each Wine. Run the **CrossOver clone as the positive control first** — in
  056 both probe bugs (legacy `SteamUser()` accessor; `GetSteamID` is MSVC **sret**, see
  `vt_SteamUser023_GetSteamID(self, sretOut)`) showed up on CrossOver, so they were never
  mistaken for engine faults. Plain prefixes come from the engine's own `wineboot -i` with
  `WINEDLLOVERRIDES="mscoree,mshtml="`; wait for `wineserver -w` before reading `system.reg`
  (it is flushed only on exit). Real titles run from a **shadow tree** (`057/shadow.py`) inside
  the plain prefix, and the harness applies `meta/bridgeCensus.ts`'s own verdict rules (HELLO,
  anchored `GINIT ok=1 session=1`, `NOVER`, Player.log markers) so every run lands one judged
  line in `logs/events.log`. Mirror `launcher.ts`'s per-engine env (`WINEMSYNC` for `-DXMT`;
  `WINEMSYNC`+`WINEESYNC` for `toolkit`) and production's DXVK install before calling a graphics
  failure an engine verdict. *(056–059.)*
- **Don't hardcode the prefix's Windows user.** Wine-Staging uses `users/$USER`; GPTK and
  CrossOver use `users/crossover`. Discover `drive_c/users/*/AppData` (058's harness bug).
  `USER=crossover` (not `WINEUSERNAME`) makes Wine-Staging reuse a CrossOver profile. *(058/059.)*
- **Cap or summarise wine stdout before committing.** A DXVK-macOS run wrote a 3.37 GB
  `wine.out` in 184 s of MoltenVK warnings. Commit a head + `uniq -c` excerpt and keep the raw
  file in the gitignored `state/`. Always `du -sh logs/` before a spike commit. *(057.)*
- **`grep` calls the 48 k-line generated `steam_api_shim.c` a binary file** and prints only
  "Binary file matches" — use `grep -a`. *(056.)*
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
- **`tauri::Window::default_vbox()` and `Webview::with_webview` -> `PlatformWebview::inner()` are
  PUBLIC, non-`unstable`-gated ways to reach the real GTK objects on Linux** — no
  wry/tauri-runtime-wry fork needed for GTK-level layout experiments. Pin the harness's own direct
  `gtk` dependency to the EXACT version wry already resolves transitively (check `Cargo.lock`), or
  you get two incompatible `gtk::Box` types in one dependency graph. `webkit2gtk::WebView` already
  `@extends gtk::Container, gtk::Widget`, so no upcast is needed to call `WidgetExt`/`ContainerExt`
  methods on it directly. *(028.)*
- **wry's own `bounds()` (Linux/GTK path) never sets `.position` at all** — only
  `allocated_size()`, off the `x11` feature's separate branch. A `{x:0,y:0}` reading from this API
  is NOT evidence a widget is at the origin; it is this method's own gap. Use
  `gtk::Widget::translate_coordinates` against the toplevel for a real, absolute, window-relative
  position instead. *(028.)*
- **A GTK packing-property change (`set_child_packing`, `set_size_request`) can be real and still
  read back unchanged immediately after the call** — GTK defers the visible consequence to its
  next actual relayout pass, which a plain sleep does not force and which only became visible, in
  one measured case, after a genuine window resize. Don't conclude a packing lever "did nothing"
  from an immediate snapshot alone; force or wait for a real relayout before judging it. *(028.)*
- **A `GtkFixed` your OWN code creates (not wry's own `reparent`, which never updates wry's
  internal `is_in_fixed_parent` gate) is a real, working escape hatch for exact widget positioning
  on Linux** — `vbox.remove(&widget)` + `gtk::Fixed::new()` + `fixed.put()` +
  `gtk::Fixed::move_`/`WidgetExt::set_size_request`, all stock `gtk-rs`, confirmed to reach an
  exact arbitrary rect and survive a window resize. But treat it as provisional: it was reliable
  exactly ONCE across 11 measured runs on this same machine — see the next bullet. *(028.)*
- **An `add_child`-ed Linux webview can fail to receive ANY `GtkBox` allocation at all — not just
  the expected 50/50, nothing — and this was NOT explained by any cheap mechanism tried.** 10 of 11
  runs (varying post-create sleep 500ms→2000ms, an explicit `gtk::main_iteration()` pump, and a
  first-ever-create variant with no prior destroy/recreate history) got stuck at GTK's own
  "never laid out" `{-1,-1,1,1}` sentinel through pumps, sleeps, AND a real window resize that
  itself silently failed to take visible effect — confirmed visually via a region-capture
  screenshot showing no embed content at all. Killing stray `WebKitNetworkProcess`/
  `WebKitWebProcess` helpers first made no difference. **Root cause unresolved** — a window-
  focus/mapping hypothesis (the one clean run was this X session's very first GUI window; every
  later run launched while the driving tool session already held focus elsewhere) is recorded as
  untested, not confirmed. Before trusting ANY Linux `add_child` layout result — this spike's or a
  future one's — re-verify allocation reliability first; a single clean run is not enough evidence
  on this specific mechanism. *(028.)*
