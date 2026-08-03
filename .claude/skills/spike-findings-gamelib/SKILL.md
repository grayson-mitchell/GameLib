---
name: spike-findings-gamelib
description: Implementation blueprint from GameLib spike experiments — verified patterns, requirements, and gotchas for (a) Steam native depot install + ACF adoption, (b) the macOS native Steam bridge, and (c) the Rust/Tauri v2 rearchitecture (Node sidecar, Electron-API parity, preload seam, the login webview / cookie-read surface, and the embedded in-app store browser via the unstable multiwebview API). Auto-loaded during Steam, macOS, or Tauri implementation work.
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

Spike sessions wrapped: 2026-07-14 → 2026-07-18 (bridge line through 008), 2026-07-20 (Tauri
feasibility 009–012), 2026-07-27 (Tauri login webview + cookies 013–015), 2026-08-03
(embedded in-app store browser 016–018).
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
  `libsteam_api.dylib`); NOT the in-process `lsteamclient` thunk (blocked/Valve-scale).
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
- **Keep `steam-user` as a Node sidecar**; do not rewrite the Steam CM/depot stack in Rust
  (`steam-vent` is auth-only + experimental).
- The cost is a **bounded platform-seam rewrite**: replace `electron-store` (20 files), re-plumb
  **220 IPC endpoints**, port the 44-file lifecycle/dialog/tray/updater/protocol cluster.
- The frontend is the *cheapest* leg: 379 `window.api` call sites are untouched; the port is
  **three preload factory functions** (+5 stray direct-electron renderer files).

**Tauri login webview + cookies (013–015):**
- **NEVER `Webview::cookies_for_url()`** — wry compares domains with string `==` on macOS, so
  `https://www.humblebundle.com` returns 4 plausible cookies with `_simpleauth_sess` **missing**
  while `cookies()` returns 33 with it. Use `cookies()` + your own suffix match.
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
  (no titlebar offset at scale 1.0); fractional px round to whole logical px.
- **Overlay UI cannot render above the embed** (native subview) — `hide()` it first.
- **One default cookie jar per PROCESS across all windows AND children**;
  `data_store_identifier` genuinely partitions a child jar (macOS 14+).
- All 013–015 rules carry over to embeds unchanged; don't build positive controls on
  Secure-over-`http://localhost` cookies (contra 014a's note, they didn't surface in 016–018).
- Unverified: input/scroll feel, retina, drag-resize latency, Windows/Linux backends, Epic
  anti-bot inside an embed.
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| Steam native install | references/steam-native-install.md | GameLib-owned depot download is byte-identical to Steam; `StateFlags=4` full-ownership is trustworthy with a sha1 gate; 64-bit IDs must be strings |
| macOS native Steam bridge | references/macos-steam-bridge.md | Out-of-process `steam_api` bridge PROVEN end-to-end incl. a **real commercial game** (007) and the **C++ vtable ABI** (006); it's a compatibility layer not a DRM gate (008). Remaining: full shim generator + P2P join |
| Tauri/Rust rearchitecture | references/tauri-rearchitecture.md | Feasible reshape, no idea-killer: 80% of backend files are Electron-free, Steam comes along free as a Node sidecar, 13/16 Electron APIs have full Tauri parity, and the frontend port is 3 factory functions. Cost is the 220-endpoint IPC re-plumb + `electron-store` swap |
| Tauri login webview + cookies | references/tauri-login-webview-cookies.md | The Rust cookie API is sound on macOS (HttpOnly+Secure values, 2–4 ms, any thread) — **but `cookies_for_url()` does string `==` on the domain and silently drops `_simpleauth_sess` for `www.humblebundle.com`**, and `document.cookie` can never see it |
| Tauri embedded store browser | references/tauri-embedded-store-browser.md | In-app store browser VALIDATED: `add_child` embeds a child webview in the config-created main window (real Steam store composited, screenshot-proven); renderer must be the sole bounds owner; one shared jar per process across all windows/children |

## Source Files

Original spike source is preserved in `sources/` (001–003 = Node `.mjs`; 005 = C helper/shim/harness
+ build/run scripts + in-bottle evidence; 004 = research READMEs; 009 = `Module._load` Proxy-recorder
probes; 011 = Rust `keyring` parity probe; 012 = preload bridge-shim demo; 013 = a full runnable
Tauri cookie-probe app with `SPIKE_AUTORUN=1|2`; 014a = raw JSONL evidence logs; 016 = a full
runnable Tauri multiwebview harness with `SPIKE_AUTORUN=1`, JSONL run.log, and window-targeted
screenshot evidence, shared by 017/018).
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
</metadata>
