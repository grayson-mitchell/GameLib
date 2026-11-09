---
name: spike-findings-gamelib
description: Implementation blueprint from GameLib spike experiments — verified patterns, requirements, and gotchas for (a) Steam native depot install + ACF adoption, (b) the macOS native Steam bridge, (c) the Rust/Tauri v2 rearchitecture (Node sidecar, Electron-API parity, preload seam, the login webview / cookie-read surface, and the embedded in-app store browser via the unstable multiwebview API), (d) login-window UX on macOS (modal child-window attachment, Keychain/password-manager autofill channels, and a local OAuth test store), and (e) the Steam overlay in bridged (bottled) games on macOS (dylib injection via CX_ENV on a re-signed CrossOver clone, Steam self-attaching gameoverlayui, and the 10-bit/Metal 4 overlay-shim fix), (f) the bridge's engines, per-game fixes and Steam DRM (CEG/SteamStub) boundary, (g) integrating with the running Mac Steam client (go-offline wrap, InstallApp adoption/update, download progress), (h) Steam library ownership sources, (i) macOS runtime signals (gamepad, CrossOver trial, non-Steam process match), (j) Tauri embeds on Linux/Windows and SEA native addons, and (k) the Rust migration of the Steam stack (depot pipeline numbers, choosing a Rust CM client, Web-API QR sign-in, owned-apps parity). Auto-loaded during Steam, macOS, Tauri, or login/auth implementation work.
---

<context>
## Project: GameLib

GameLib is a Heroic Games Launcher fork adding Steam as a first-class platform on macOS/Windows/
Linux. Three spike lines are captured here: **Steam native install** (GameLib owns the depot
download and writes an `appmanifest.acf` Steam adopts; launch stays on `steam://` for DRM), the
**macOS native Steam bridge** (run bottled Windows games against ONE native Mac Steam client via an
out-of-process `steam_api` proxy, instead of bottling a full Windows Steam per CrossOver bottle),
and the **Rust/Tauri v2 rearchitecture** (Idea C — swap the Electron shell for Tauri + a Rust
platform seam + a bundled Node sidecar, keeping the React UI and the Steam stack).

A fourth line, **login-window UX** (Idea D), was spiked against a local OAuth store so form and
window work could proceed without real stores' anti-bot surfaces.

Spike sessions wrapped: 2026-07-14 → 2026-07-18 (bridge line through 008), 2026-07-20 (Tauri
feasibility 009–012), 2026-07-27 (Tauri login webview + cookies 013–015), 2026-08-03
(embedded in-app store browser 016–018), 2026-08-04 (login-window UX 019–022),
2026-11-02 (Steam overlay in bridged games 061–064), 2026-11-09 (backlog 023–060 plus 065–070,
and the Rust migration line 067a–c and 071–074 — Idea E, moving the Node sidecar to Rust piece by
piece), 2026-11-09 second wrap-up (075 the Friends flip under GameLib's full Refresh, 076 the
chunk-level delta update for bridge installs).
</context>

<requirements>
## Requirements (non-negotiable — see the reference files for full detail)

**Steam native install (001–003):**
- Launch stays with Steam (`steam://`); the download is bypassed, not the DRM.
- `StateFlags=4` full-ownership is achievable with a per-chunk sha1 gate + correct
  `Bytes*`/buildid/`InstalledDepots`/file-modes; `1026` is the fallback (spike 003 reversed the old
  "never 4" rule).
- 64-bit IDs (manifest GIDs, SteamID64) are **strings end-to-end** — `@node-steam/vdf` rounds them.
- Depot selection = package-level ownership via two channels; never PICS-alone.
- Download in-process via `steam-user` + `getRawManifest()`; retry chunks across content servers.

**macOS native Steam bridge (004–008):**
- Bridge at the `steam_api` flat layer, **out-of-process** (PE shim → TCP → native helper loading
  `libsteam_api.dylib`); SteamStub `.bind` titles use the in-process `lsteamclient`
  steamclient-layer DRM mode instead (spike 044, Phase 56); see references/macos-steam-bridge.md.
- Proxy the running signed-in native Mac Steam; never replicate auth. Supply the game's real AppID.
- A drop-in shim must export **every** symbol the game imports (objdump the exe) or it won't load.
- Unmodified games use **C++ vtables**; the MSVC-`__thiscall` vtable mechanism is PROVEN (006).
  The full per-interface generator (pinned SDK) is the first build task. Handle sret (>8-byte returns).
- The bridge is a **compatibility layer, not a DRM gate** — `steam_api.dll` returns are advisory;
  real enforcement is CEG/DRM below the flat API (008). A real game ran on the bridge (007).
- P2P multiplayer join is the known-hard gap.

**Rust/Tauri rearchitecture (009–012):**
- Divorce from Heroic upstream is accepted; the target shape is **Tauri/Rust shell + Rust platform
  seam + bundled Node sidecar for business logic + the existing React UI** — NOT a Rust rewrite.
- ~~**Keep `steam-user` as a Node sidecar**; do not rewrite the Steam CM/depot stack in Rust
  (`steam-vent` is auth-only + experimental).~~ **Reversed 2026-11-09 (071–073):** the depot
  pipeline is Rust (Phase 73), and three Rust CM crates now supply every CM input with parity;
  see "Rust migration of the Steam stack" below.
- The cost is a **bounded platform-seam rewrite**: replace `electron-store` (20 files), re-plumb
  **220 IPC endpoints**, port the 44-file lifecycle/dialog/tray/updater/protocol cluster.
- The frontend is the *cheapest* leg: 379 `window.api` call sites are untouched; the port is
  **three preload factory functions** (+5 stray direct-electron renderer files).

**Tauri login webview + cookies (013–015):**
- **NEVER `Webview::cookies_for_url()`** — wry compares domains with string `==` on macOS, so
  `https://www.humblebundle.com` returns 4 plausible cookies with `_simpleauth_sess` **missing**
  while `cookies()` returns 33 with it. Use `cookies()` + your own suffix match — and that match
  **must strip a leading dot from the cookie's `domain` first** (`_simpleauth_sess`'s real domain is
  `.humblebundle.com`). Omitting the strip is production defect F-34.4.2-19; see the reference.
- **Any cookie poll needs a liveness proof** — `count === 0` is otherwise indistinguishable from a
  dead API, and `watchForLogin()` would spin silently for its full 5-minute deadline.
- **Never detect login from `document.cookie`** — `_simpleauth_sess` is `HttpOnly` and structurally
  invisible to JS, while 27 other names make the read look healthy.
- **Relay navigation from `on_page_load`, not `on_navigation`** (the latter fires for subframes and
  would let an ad iframe re-arm the login deadline forever).
- The UA override is **mandatory** (Tauri's default macOS UA has no browser product token).
- Cookie persistence is free; **isolation costs a live window** — there is no
  `session.fromPartition()` shape in Tauri.

**Tauri embedded store browser (016–018):**
- The in-app "Store tab" (Electron `<webview>` parity) is achievable: **`Window::add_child`
  on the existing config-created main window** (`unstable` cargo feature; only `tauri` +
  `tauri-runtime-wry` recompile, ~11 s warm).
- **The renderer is the ONLY owner of the embed's geometry** — a second bounds writer
  silently last-write-wins. JS `getBoundingClientRect()` maps 1:1 to child logical coords
  (no titlebar offset at scale 1.0) **only at webview zoom 1** -- under Accessibility zoom f
  (`setZoom`), logical = CSS px x f, so scale the rect by the applied `--webview-zoom`
  (`storeEmbedZoom.ts`, quick 261012-gn8; W8 PASS live on Windows at 120% and 80%, 2026-10-12);
  fractional px round to whole logical px.
- **Overlay UI cannot render above the embed** (native subview) — `hide()` it first.
- **One default cookie jar per PROCESS across all windows AND children**;
  `data_store_identifier` genuinely partitions a child jar (macOS 14+) — **macOS only**: it does
  nothing on Linux or Windows (026, 027), so design embeds there around one shared jar.
- All 013–015 rules carry over to embeds unchanged; don't build positive controls on
  Secure-over-`http://localhost` cookies (contra 014a's note, they didn't surface in 016–018).
- Unverified: input/scroll feel, retina, drag-resize latency. Windows/Linux backends and Epic
  anti-bot were spiked later (024–029, below).

**Login-window UX on macOS (019–022):**
- **Attach the login window as an AppKit CHILD window** (`addChildWindow:ordered:Above`), not via
  Tauri `.parent()` — one runtime-switchable path covers the wry window AND the pristine
  `WKWebView` shell. It becomes un-losable; **re-raise it after the parent deminiaturizes**.
- **Sheets are forbidden without self-dismissal** — a sheet blocks the window holding any cancel
  control, and the store's page has none (live-observed user trap).
- **Inline password autofill and save-prompts do not exist** in either login surface, on HTTP or
  real HTTPS. Do **not** build a credential store for store logins.
- **The two working Keychain channels are system-provided**: right-click → AutoFill → Passwords
  (fills in both surfaces) and Cmd+V paste from the Passwords app.
- **An in-field affordance IS shippable**: a key glyph that posts a **synthesized right-click**
  pops the real menu *with AutoFill in it* (screenshot-proven, all public API). The panel itself
  cannot be opened directly — the AutoFill item is injected at menu *display* time and is absent
  from the NSMenu even for a real click.
- **Capture OAuth codes by navigation observation** (`on_page_load` Started / pristine's
  `decidePolicyForNavigationAction`), never a callback server or remote-page IPC.
- **Scripted login tests need a logout preamble** — the jar is sticky across restarts.

### Steam overlay in bridged games (061–064)

- **Inject, don't spawn**: `steamloader.dylib` + `gameoverlayrenderer.dylib` (+ `SteamOverlayGameId`)
  in the game process make Mac Steam attach `gameoverlayui` itself. GameLib never starts it.
- **`CX_ENV` on a clone**: re-sign BOTH `bin/wineloader` and `lib/wine/x86_64-unix/wine` with
  `allow-dyld-environment-variables` (keep stock keys); clone the inner `SharedSupport/CrossOver`,
  never the `.app`, or Gatekeeper kills it.
- **Vendor NotProton's `overlay_shim.m` (GPLv3)** for non-BGRA8 layers: Steam's BGRA8 overlay pipeline
  draws corrupted on a 10-bit `RGB10A2Unorm` layer (Manor Lords D3D12/D3DMetal); the shim also
  covers HDR and D3DMetal's Metal 4 queue. Overlay correctness is operator-verified only;
  `screencapture` returns stale Metal frames.
### Tauri embeds off macOS, SEA native addons (023–029)

- On Linux, `set_position`/`set_size` return `Ok` and change nothing: place the embed with a
  `gtk::Overlay` over main plus a pass-through `gtk::Fixed`. Never trust `set_bounds`, and never
  pack the `Fixed` as a sibling of main in the vbox. (026, 028, 029)
- Create webviews from an async command or `run_on_main_thread`, never a sync
  `#[tauri::command]` (it hangs on Windows). One embed, on the main window only (a second window
  segfaults on Linux). (026, 027)
- **Never host Epic's store in a Tauri-managed webview**; use a Rust-managed raw `WKWebView`
  subview of the main window (challenged 0/16), with a load timeout and a reload option. (024)
- Load native addons in the SEA sidecar only via `getRawAsset()` + temp file + `dlopen()` on proven
  triples, with paths resolved at build time, never through `__dirname`. (023)

### Bridge engines and per-game fixes (030–034, 042, 056–059)

- Per-game fixes are data: tier-2 `shimFeatures` → `fix.<feature>=<value>` lines in
  `gamelib_bridge.cfg`, read at `DLL_PROCESS_ATTACH`, from a closed generic feature list. No hook
  without a `fix.` line. Never patch game files. (030, 033, 034)
- `wgl.hideExtensions` (IAT hook on `wglGetProcAddress`) is the shipping fix for GL 3.x
  compat-context games; Mesa softpipe is slow, Zink is dead (MoltenVK `nullDescriptor=0`).
  (030–034)
- Under CrossOver use `AppDefaults\<exe>\DllOverrides` and `CX_DEBUGMSG`; `WINEDLLOVERRIDES`
  and `WINEDEBUG` are dropped, `GST_PLUGIN_PATH` passes (a libav overlay fixes WMV/WMA). (031, 042)
- Engine order is CrossOver first, then pinned Wine-Staging + DXVK-macOS on the same CX bottle with
  `USER=crossover` (`WINEUSERNAME` is ignored). Cap wine stdout (MoltenVK wrote 3.37 GB in 184 s).
  GPTK and `-DXMT` are not supported engines. (056–059)

### Steam DRM in the bridge (035–041, 043–045)

- **The DRM boundary:** a genuine Valve client answers every DRM check. GameLib may fetch the
  genuine client DLLs from Valve's CDN (never ship them) and trampoline their exports in memory.
  It never edits game exes, decrypts DRM payloads, or writes a stand-in that answers Steam's
  private protocols (`Steam3Master`, a fake `ISteamClient`, a built `STEAMSTART` answer).
  (037, 040, 041, 043)
- SteamStub (`.bind`) titles take the steamclient-layer DRM mode (genuine client + trampoline +
  `lsteamclient`); forwarding or shim-backed `steamclient64.dll` fails the file check (038/039
  reversed by 040/041). Live in 044. (040–044)
- CEG (`drm-wrapped`, 3 of 389 owned games) is the only justified route into bottled Steam. Stop
  spiking the handshake; Claude can't build `STEAMSTART` capture/replay, so plan nothing on it.
  (036, 037, 044, 045)
- "Verified" in DRM mode = `lsteamclient` logs the game's first `CreateInterface` plus a
  game-originated call; reaching the menu does not count. (044)

### Integrating with the running Mac Steam client (046–050, 065–067, 069, 070, 075)

- Wrap every authenticated CM logon on macOS: `steam://open/gooffline` → wait for `LogOff()` in
  `connection_log.txt` (≤5 s, else don't log on) → log on → `goonline`; `autoRelogin: false`, and
  every reconnect goes through the wrapped connect. (046a–c)
- **The wrap is insurance, not a gate:** on 2026-11-09 neither a bare logon (074) nor GameLib's
  full Refresh, staged or in the real app with the wrap removed (075), signed Friends out. The
  local client is unchanged since before the flips, so the cause changed server-side or lived in
  the old token, and could return. Keep the wrap; when Mac Steam won't log off in 5 s, **log on
  unwrapped** instead of blocking on the guided Go-Offline step. Live-gate "Refresh with Mac
  Steam online → Friends still signed in" in Steam-auth phases. (046b, 074, 075)
- A running Steam never picks up a GameLib-written ACF, and `steam://install` needs a click
  (corrects 047–049). Adopt with `IClientAppManager::InstallApp` when the files are present, or
  restart Steam. (047–049, 066)
- Never call an `IClientAppManager`/engine slot without verifying it at runtime (getter by RTTI
  name, method by the IPC function ID's high half); fall back on failure. Error 18 = signed out
  or not installed. (065–067, 069)
- Live Steam-download progress comes from nettop per-flow `bytes_in`, not the ACF or staging. (050)
- Nothing updates bridge-bottle installs: detect by comparing `buildid` and depot GIDs (as
  strings) against PICS. (070)

### Steam library ownership (052, 053, 053b)

- The library = owned games (`GetOwnedGames`) ∪ licensed apps resolved through PICS and filtered by
  `common.type`; demos never appear in `GetOwnedGames`. (052, 073)
- Fetch package access tokens before PICS package info. (073)
- Library Refresh needs a signed-in CM logon: there is no web-token route for a SteamClient
  refresh token, with or without renewal. (053, 053b)

### macOS runtime signals (051, 060, 068)

- Controller mode needs a native gamepad reader (gilrs) merged into `navigator.getGamepads()`;
  map by HID usage, not gilrs button names. (051)
- Run `CX_BOTTLE=<b> wine --demo-status` per bottle before every CrossOver launch; never launch
  through CrossOver without a timeout (an expired trial hangs). (060)
- Arm a non-Steam launch deadline only on an install-dir match (unix, `Z:` or `Y:` form, trailing
  separator); basename-only launches can't be matched. (068)

### Rust migration of the Steam stack (067a–c, 071–074, 076)

- Justify Rust depot work on code removal or retiring the sidecar, not speed: the pipeline is
  network-bound (~18 MiB/s). Rust decode needs `--cfg aes_armv8` + `zlib-rs`; prefer `xz2`.
  (067a, 067b)
- Use a Rust crate for the **CM half only**; the CDN half is Phase 73's `gamelib-depot`. Best fit:
  **steam-vent** (pin the codeberg rev; its main branch breaks anonymous logon); fallback
  steamroom with a message pump added. (071a–c)
- The CM client must have a message pump and must log on with the stored refresh token **without
  an account name**. Subscribe to `ClientLicenseList` before logon. (071a–c)
- Do QR sign-in over the Steam Web API (`IAuthenticationService` over HTTPS), not the CM; handle
  the ~22 s challenge rotation. Don't depend on CDN auth tokens. (071a, 072)
- **Bridge updates = chunk-level delta in `gamelib-depot` (`fromManifest`),** built beside the old
  tree and committed only when every new file verifies; SHA-1 every reused local chunk. File-level
  reconcile barely beats a full download on Unreal titles (Manor Lords 6.7 vs 7.0 GB; chunk-level
  0.9 GB). Old manifests are still served, but cache the installed one. If the update changes a
  shimmed `steam_api*.dll`, move the new genuine DLL to `.gamelib-orig` and re-shim. (076)
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| Steam native install | references/steam-native-install.md | GameLib-owned depot download is byte-identical to Steam; `StateFlags=4` full-ownership is trustworthy with a sha1 gate; 64-bit IDs must be strings |
| macOS native Steam bridge | references/macos-steam-bridge.md | Out-of-process `steam_api` bridge PROVEN end-to-end incl. a **real commercial game** (007) and the **C++ vtable ABI** (006); it's a compatibility layer not a DRM gate (008). Remaining: full shim generator + P2P join |
| Tauri/Rust rearchitecture | references/tauri-rearchitecture.md | (023: SEA native addons load via `getRawAsset()` + `dlopen()`.) Feasible reshape, no idea-killer: 80% of backend files are Electron-free, Steam comes along free as a Node sidecar, 13/16 Electron APIs have full Tauri parity, and the frontend port is 3 factory functions. Cost is the 220-endpoint IPC re-plumb + `electron-store` swap |
| Tauri login webview + cookies | references/tauri-login-webview-cookies.md | The Rust cookie API is sound on macOS (HttpOnly+Secure values, 2–4 ms, any thread) — **but `cookies_for_url()` does string `==` on the domain and silently drops `_simpleauth_sess` for `www.humblebundle.com`**, and `document.cookie` can never see it |
| Tauri embedded store browser | references/tauri-embedded-store-browser.md | In-app store browser VALIDATED: `add_child` embeds a child webview in the config-created main window (real Steam store composited, screenshot-proven); renderer must be the sole bounds owner; one shared jar per process across all windows/children. Off macOS (025–029): Linux needs an Overlay + pass-through `Fixed` because `set_bounds` is a no-op, and Epic's store needs a raw `WKWebView` subview (024) |
| Login-window UX on macOS | references/login-window-ux-macos.md | Child-window attachment makes the login un-losable (sheets trap the user); inline Keychain autofill is platform-blocked, but a **synthesized right-click from an in-field key glyph pops the real AutoFill menu** — the panel can never be opened directly |
| OAuth login test harness | references/oauth-login-test-harness.md | **DummyStore**: a zero-dep local OAuth 2.0 code-grant provider (port 17940) with a hot-editable login form, PKCE + replay enforcement and an `/events` oracle — the offline fixture for all login/form work |
| Steam overlay in bridged games | references/steam-overlay-in-bottles.md | Mac Steam's own overlay works in GameLib-bridged games: inject Steam's dylibs via `CX_ENV` on a CrossOver clone with both loaders re-signed for dyld, and Steam attaches `gameoverlayui` itself. BGRA8 layers need nothing else (DXVK, D3DMetal D3D11); 10-bit layers (D3D12/D3DMetal) need NotProton's GPLv3 Metal shim |
| Live-gate contract authoring | references/live-gate-contract-authoring.md | Five defect-class tests for reviewing a blocking live-gate contract BEFORE its first run — Test 5's unit of review is the requirement **PAIR** (does satisfying A destroy B's evidence: restart/truncate/clear/reset/env-var/one-shot-resource), and a dual-sink **append-and-archive** capture standard (`tee -a`, per-launch delimiters, `gamelib.log` archived before it rotates) so both the transcript and sidecar-log sinks survive every launch |
| Bridge engines & per-game fixes | references/bridge-engines-and-game-fixes.md | The bridge works the same on every engine; every failure was in the graphics or media stack before `steam_api` loaded. Fixes are data (`fix.` lines, env + GameLib-owned overlays), never game-file patches; CrossOver first, Staging + DXVK on the same bottle as the only fallback |
| Steam DRM in the bridge | references/bridge-steam-drm.md | SteamStub clears without bottled Steam via Proton's design: genuine CDN-fetched `steamclient(64).dll`, exports trampolined to `lsteamclient` → Mac `steamclient.dylib` (Grim Dawn live, 044). CEG isn't cleared on the Mac side, but only 3/389 owned games need it → bottled Steam for those |
| Running Mac Steam client integration | references/mac-steam-client-integration.md | A separate native process calling steamclient's `IClientAppManager::InstallApp` (slot verified at runtime) installs, adopts and updates with no window or dialog; `steam://install` needs a click. The go-offline wrap keeps Friends signed in; since 2026-11-09 neither a bare logon nor GameLib's full Refresh flips it unwrapped (074, 075), so keep it as insurance and fall through unwrapped |
| Steam library ownership | references/steam-library-ownership.md | Demos never appear in `GetOwnedGames`, so the library unions owned games with PICS-resolved licensed apps; no web-token route exists for a SteamClient refresh token (053/053b INVALIDATED); both sources reproduce exactly from Rust (073) |
| macOS runtime signals | references/macos-runtime-signals.md | WebKit hides the PowerA pad from the Gamepad API (use gilrs); CrossOver trials expire per bottle (`wine --demo-status`) and expired bottles hang launches; non-Steam processes match by install dir |
| Rust migration of the Steam stack | references/rust-migration-steam.md | The depot pipeline is network-bound, so Rust is for retiring the sidecar, not speed; every CM input GameLib takes from steam-user (PICS, licenses, depot key, request code, CDN hosts, owned games, sign-in) is reproducible from Rust with exact parity, and steam-vent fits the CM half best. Bridge-game updates are a chunk-level delta, 4–8× under file-level on Unreal titles (076) |

## Source Files

Original spike source is preserved in `sources/` (001–003 = Node `.mjs`; 005 = C helper/shim/harness
+ build/run scripts + in-bottle evidence; 004 = research READMEs; 009 = `Module._load` Proxy-recorder
probes; 011 = Rust `keyring` parity probe; 012 = preload bridge-shim demo; 013 = a full runnable
Tauri cookie-probe app with `SPIKE_AUTORUN=1|2`; 014a = raw JSONL evidence logs; 016 = a full
runnable Tauri multiwebview harness with `SPIKE_AUTORUN=1`, JSONL run.log, and window-targeted
screenshot evidence, shared by 017/018; 019 = the runnable **DummyStore** OAuth server +
login-flow harness, reused as the fixture by 020–022; 021 = runtime child/sheet attachment with
an `NSApp.orderedWindows` layering oracle; 022 = a `WKWebView` subclass hooking
`willOpenMenu:` + event synthesis, incl. `menu-with-autofill.png`; 061 = Mac Steam staging +
window-capture loop; 062 = `run.sh`, the reusable bridged-game overlay harness (helper spawn, cfg
swap/restore, `CX_ENV` injection, env-selected game and backend); 063/064 = READMEs only).
From the 2026-11-09 wrap-up, `sources/` holds only files git tracks in each spike (no game data,
run state or raw logs): 023–029 Tauri/GTK harnesses and the SEA addon probe; 030–059 bridge
harnesses, shims and C probes (no binaries); 046–070 steamclient IPC probes and adoption
scripts; 067a/b depot profile and decode bench; 071a–c, 073, 074 Rust CM harnesses (cargo,
pinned revs) with steam-user `.mjs` parity references; 072 the local-page sign-in harness; 075 the staged-Refresh harness plus the real-app wrap-bypass
patch; 076 the Rust diff/apply bins on `gamelib-depot` with their Node CM drivers.
</findings_index>

<metadata>
## Processed Spikes

- 001-acf-adoption
- 002-steam-user-depot-download
- 003-stateflags4-full-ownership
- 004a-wine-mach-o-thunk
- 004b-community-lsteamclient-survey
- 004c-native-mac-steam-ipc-surface
- 005a-native-steam-helper-handshake
- 005b-bottle-to-host-tcp
- 005c-min-steam_api-shim
- 006-cpp-vtable-abi
- 007-real-game-avernum
- 008-gating-game-hoard
- 009-node-backend-headless-sidecar
- 010-steam-user-rust-vs-sidecar
- 011-electron-api-parity-in-tauri
- 012-react-frontend-under-tauri
- 013-tauri-child-webview-login-window
- 014a-cookie-read-rust-webview-api
- 014b-cookie-read-injected-js
- 015-cookie-jar-isolation-persistence
- 016-embedded-child-webview-basic
- 017-child-webview-bounds-sync
- 018-child-webview-coexistence
- 019-dummy-oauth-store
- 020-keychain-autofill-login-webview
- 021-modal-login-window
- 022-programmatic-autofill-trigger
- 061-notproton-overlay-render
- 062-bridge-overlay-attach
- 063-d3dmetal-overlay
- 064-d3dmetal-d3d12-overlay
- 023-sea-native-addon-dlopen
- 024-epic-store-in-embedded-child-webview
- 025-linux-add-child-compile
- 026-linux-add-child-runtime
- 027-windows-add-child-crosscheck
- 028-linux-add-child-gtkbox-packing-lever
- 029-linux-embed-allocation-reliability
- 030-hoard-macos-opengl
- 031-hoard-mesa-opengl
- 032-zink-moltenvk-64bit
- 033-shim-gamefixes-hoard
- 034-known-fixes-v2-hoard
- 035-xcom-ceg-handshake-trace
- 036-proton-style-dipc-responder
- 037-ceg-steamclient-probe
- 038-steamstub-grimdawn-probe
- 039-steamstub-forwarding-client
- 040-steamstub-launch-check-static
- 041-steamstub-genuine-steamclient
- 042-crossover-gst-libav-overlay
- 043-notproton-steam-bridge-comparison
- 044-notproton-drm-live
- 045-ceg-census
- 046a-steam-url-offline-toggle
- 046b-wrap-around-logon
- 046c-reconnect-reflip
- 047-running-steam-adoption
- 048-running-steam-adoption-large
- 049-adoption-corrupt-file
- 050-steam-download-progress-sources
- 051-powera-pad-drives-gamelib-macos
- 052-demo-licenses-vs-owned-apps
- 053-web-api-library-no-cm
- 053b-renewal-mint
- 056-plain-prefix-bridge-handshake
- 057-wine-staging-real-title
- 058-gptk-engine-bridge
- 059-reuse-cx-bottle-vs-fresh-prefix
- 060-crossover-trial-expiry
- 065-steamclient-installapp
- 066-steamclient-register-install
- 067-steamclient-uninstallapp
- 067a-node-pipeline-stage-profile
- 067b-chunk-decode-bench
- 067c-rust-depot-job
- 068-nonsteam-first-match-signal
- 069-steamclient-update-installed
- 070-bridge-games-stay-stale
- 071a-cm-crate-steamroom
- 071b-cm-crate-steam-client-lib
- 071c-cm-crate-steam-vent
- 072-rust-signin-refresh-token
- 073-rust-owned-apps-parity
- 074-rust-logon-friends-wrap
- 075-friends-flip-full-refresh
- 076-bridge-delta-update
</metadata>
