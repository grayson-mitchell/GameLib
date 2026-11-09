# Spike Wrap-Up Summary

**Date:** 2026-11-09 (updated twice — backlog 023–060 and 065–070 plus the Rust migration line 067a–c and 071–074; then 075–076 in a second wrap-up the same day; every spike in `.planning/spikes/` is processed)
**Spikes processed:** 87 (31 before, 54 in the first 2026-11-09 wrap-up, 2 in the second)
**Feature areas:** Steam native install; macOS native Steam bridge; Tauri/Rust rearchitecture; Tauri login webview + cookies; Tauri embedded store browser; login-window UX on macOS; OAuth login test harness; Steam overlay in bridged games; bridge engines & per-game fixes; Steam DRM in the bridge; Mac Steam client integration; Steam library ownership; macOS runtime signals; Rust migration of the Steam stack
**Skill output:** `./.claude/skills/spike-findings-gamelib/`

## Processed Spikes

| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 001 | acf-adoption | standard | ✓ VALIDATED | Steam native install |
| 002 | steam-user-depot-download | standard | ✓ VALIDATED | Steam native install |
| 003 | stateflags4-full-ownership | standard | ✓ VALIDATED | Steam native install |
| 004a | wine-mach-o-thunk | standard | ⚠ PARTIAL | macOS native Steam bridge |
| 004b | community-lsteamclient-survey | standard | ✓ VALIDATED | macOS native Steam bridge |
| 004c | native-mac-steam-ipc-surface | standard | ✓ VALIDATED | macOS native Steam bridge |
| 005a | native-steam-helper-handshake | standard | ✓ VALIDATED | macOS native Steam bridge |
| 005b | bottle-to-host-tcp | standard | ✓ VALIDATED | macOS native Steam bridge |
| 005c | min-steam_api-shim | standard | ✓ VALIDATED | macOS native Steam bridge |
| 006 | cpp-vtable-abi | standard | ✓ VALIDATED | macOS native Steam bridge |
| 007 | real-game-avernum | standard | ✓ VALIDATED | macOS native Steam bridge |
| 008 | gating-game-hoard | standard | ⚠ PARTIAL | macOS native Steam bridge |
| 009 | node-backend-headless-sidecar | standard | ⚠ PARTIAL | Tauri/Rust rearchitecture |
| 010 | steam-user-rust-vs-sidecar | comparison | ✓ WINNER (Node sidecar) | Tauri/Rust rearchitecture |
| 011 | electron-api-parity-in-tauri | standard | ✓ VALIDATED | Tauri/Rust rearchitecture |
| 012 | react-frontend-under-tauri | standard | ✓ VALIDATED | Tauri/Rust rearchitecture |
| 013 | tauri-child-webview-login-window | standard | ✓ VALIDATED | Tauri login webview + cookies |
| 014a | cookie-read-rust-webview-api | comparison | ✓ WINNER | Tauri login webview + cookies |
| 014b | cookie-read-injected-js | comparison | ✗ INVALIDATED | Tauri login webview + cookies |
| 015 | cookie-jar-isolation-persistence | standard | ✓ VALIDATED | Tauri login webview + cookies |
| 016 | embedded-child-webview-basic | standard | ✓ VALIDATED | Tauri embedded store browser |
| 017 | child-webview-bounds-sync | standard | ✓ VALIDATED | Tauri embedded store browser |
| 018 | child-webview-coexistence | standard | ✓ VALIDATED | Tauri embedded store browser |
| 019 | dummy-oauth-store | standard | ✓ VALIDATED | OAuth login test harness |
| 020 | keychain-autofill-login-webview | standard | ⚠ PARTIAL | Login-window UX on macOS |
| 021 | modal-login-window | standard | ✓ VALIDATED | Login-window UX on macOS |
| 022 | programmatic-autofill-trigger | standard | ⚠ PARTIAL | Login-window UX on macOS |
| 061 | notproton-overlay-render | standard | ✓ VALIDATED | Steam overlay in bridged games |
| 062 | bridge-overlay-attach | standard | ✓ VALIDATED | Steam overlay in bridged games |
| 063 | d3dmetal-overlay | standard | ✓ VALIDATED | Steam overlay in bridged games |
| 064 | d3dmetal-d3d12-overlay | standard | ⚠ PARTIAL | Steam overlay in bridged games |
| 023 | sea-native-addon-dlopen | standard | VALIDATED | Tauri rearchitecture (SEA addon) |
| 024 | epic-store-in-embedded-child-webview | standard | RESOLVED | Tauri embedded store browser (off macOS) |
| 025 | linux-add-child-compile | standard | VALIDATED | Tauri embedded store browser (off macOS) |
| 026 | linux-add-child-runtime | standard | PARTIAL | Tauri embedded store browser (off macOS) |
| 027 | windows-add-child-crosscheck | standard | PARTIAL | Tauri embedded store browser (off macOS) |
| 028 | linux-add-child-gtkbox-packing-lever | standard | PARTIAL | Tauri embedded store browser (off macOS) |
| 029 | linux-embed-allocation-reliability | standard | PARTIAL | Tauri embedded store browser (off macOS) |
| 030 | hoard-macos-opengl | standard | PARTIAL | Bridge engines & per-game fixes |
| 031 | hoard-mesa-opengl | standard | PARTIAL | Bridge engines & per-game fixes |
| 032 | zink-moltenvk-64bit | standard | INVALIDATED | Bridge engines & per-game fixes |
| 033 | shim-gamefixes-hoard | standard | PARTIAL | Bridge engines & per-game fixes |
| 034 | known-fixes-v2-hoard | standard | VALIDATED | Bridge engines & per-game fixes |
| 035 | xcom-ceg-handshake-trace | standard | VALIDATED | Steam DRM in the bridge |
| 036 | proton-style-dipc-responder | standard | PARTIAL | Steam DRM in the bridge |
| 037 | ceg-steamclient-probe | standard | INVALIDATED | Steam DRM in the bridge |
| 038 | steamstub-grimdawn-probe | standard | PARTIAL | Steam DRM in the bridge |
| 039 | steamstub-forwarding-client | standard | PARTIAL | Steam DRM in the bridge |
| 040 | steamstub-launch-check-static | standard | INVALIDATED | Steam DRM in the bridge |
| 041 | steamstub-genuine-steamclient | standard | INVALIDATED | Steam DRM in the bridge |
| 042 | crossover-gst-libav-overlay | standard | VALIDATED | Bridge engines & per-game fixes |
| 043 | notproton-steam-bridge-comparison | standard | PARTIAL | Steam DRM in the bridge |
| 044 | notproton-drm-live | standard | PARTIAL | Steam DRM in the bridge |
| 045 | ceg-census | standard | VALIDATED | Steam DRM in the bridge |
| 046a | steam-url-offline-toggle | standard | VALIDATED | Mac Steam client integration |
| 046b | wrap-around-logon | standard | VALIDATED | Mac Steam client integration |
| 046c | reconnect-reflip | standard | PARTIAL | Mac Steam client integration |
| 047 | running-steam-adoption | standard | VALIDATED | Mac Steam client integration |
| 048 | running-steam-adoption-large | standard | VALIDATED | Mac Steam client integration |
| 049 | adoption-corrupt-file | standard | VALIDATED | Mac Steam client integration |
| 050 | steam-download-progress-sources | standard | VALIDATED | Mac Steam client integration |
| 051 | powera-pad-drives-gamelib-macos | standard | VALIDATED | macOS runtime signals |
| 052 | demo-licenses-vs-owned-apps | standard | VALIDATED | Steam library ownership |
| 053 | web-api-library-no-cm | standard | INVALIDATED | Steam library ownership |
| 053b | renewal-mint | standard | INVALIDATED | Steam library ownership |
| 056 | plain-prefix-bridge-handshake | standard | VALIDATED | Bridge engines & per-game fixes |
| 057 | wine-staging-real-title | standard | VALIDATED | Bridge engines & per-game fixes |
| 058 | gptk-engine-bridge | standard | PARTIAL | Bridge engines & per-game fixes |
| 059 | reuse-cx-bottle-vs-fresh-prefix | comparison | VALIDATED | Bridge engines & per-game fixes |
| 060 | crossover-trial-expiry | standard | PARTIAL | macOS runtime signals |
| 065 | steamclient-installapp | standard | VALIDATED | Mac Steam client integration |
| 066 | steamclient-register-install | standard | VALIDATED | Mac Steam client integration |
| 067 | steamclient-uninstallapp | standard | VALIDATED | Mac Steam client integration |
| 067a | node-pipeline-stage-profile | standard | VALIDATED | Rust migration of the Steam stack |
| 067b | chunk-decode-bench | comparison | ✓ WINNER Rust on decode CPU | Rust migration of the Steam stack |
| 067c | rust-depot-job | standard | NOT RUN | Rust migration of the Steam stack |
| 068 | nonsteam-first-match-signal | standard | PARTIAL | macOS runtime signals |
| 069 | steamclient-update-installed | standard | VALIDATED | Mac Steam client integration |
| 070 | bridge-games-stay-stale | standard | VALIDATED | Mac Steam client integration |
| 071a | cm-crate-steamroom | comparison | VALIDATED | Rust migration of the Steam stack |
| 071b | cm-crate-steam-client-lib | comparison | VALIDATED | Rust migration of the Steam stack |
| 071c | cm-crate-steam-vent | comparison | WINNER | Rust migration of the Steam stack |
| 072 | rust-signin-refresh-token | standard | PARTIAL | Rust migration of the Steam stack |
| 073 | rust-owned-apps-parity | standard | VALIDATED | Rust migration of the Steam stack |
| 074 | rust-logon-friends-wrap | standard | VALIDATED | Rust migration of the Steam stack |
| 075 | friends-flip-full-refresh | standard | VALIDATED | Mac Steam client integration |
| 076 | bridge-delta-update | standard | VALIDATED | Rust migration of the Steam stack |

## Key Findings

### 2026-11-09 second wrap-up (075–076)

**075** — GameLib's full Refresh (logon, licenses, canary, `getUserOwnedApps`, licensed-demos
package and app info, held-session PICS pass, 60 s idle, logOff) run **unwrapped** with Mac Steam
online, as a staged harness and as the real app with the wrap patched out: Friends stayed signed
in and changeable, and Mac Steam's `connection_log` recorded nothing. `steamclient.dylib` is
unchanged since before the debug-era flips, so the cause changed server-side or lived in the old
token. Keep the wrap as insurance, fall through unwrapped instead of the guided Go-Offline step,
live-gate Friends in Steam-auth phases, and park spike 078 (owned apps via the running client).

**076** — A chunk-level delta updates stale bridge installs correctly and cheaply. Request codes
were still issued for all six install-time GIDs. Chunk-level downloads (5.7 MiB–916 MiB) were
4–8× below file-level on the Unreal titles (Manor Lords 6.7 GB → 0.9 GB). Applied on APFS clones,
Mining Mechs 48/49 and Manor Lords 111/112 matched the new manifest; the misses were an untouched
shim and a game-modified ini. Reuse is mostly moved-in-file and up to 3.7 GB cross-file, so build
temps and commit only after all verify. SHA-1 every reused chunk (forced corruption fell back to
the CDN). Manor Lords' update replaces `steam_api64.dll`, so Phase 74 needs a shim handover.

### 2026-11-09 wrap-up (023–074)

- **Reversed rules, marked in SKILL.md:** "keep `steam-user` as a Node sidecar" (010) is reversed by
  071–073 (Rust CM crates reach parity; the depot pipeline is Phase 73 Rust); `data_store_identifier`
  partitions cookie jars on macOS only (026, 027); 038/039's forwarding `steamclient64.dll` is
  reversed by 040/041; 047–049's `steam://install` adoption needs a click (corrected by 066).
- **Rust migration:** the depot pipeline is network-bound, so Rust is for retiring the sidecar;
  every CM input from steam-user is reproducible from Rust with exact parity on the operator's
  account (depot key SHA-1, 390 owned games, 1,144 license appids); steam-vent fits the CM half;
  QR sign-in goes over the Web API.
- **Open premise:** a bare authenticated logon no longer flips Mac Steam Friends (074, steam-user
  and Rust alike). Keep the go-offline wrap until GameLib's full refresh sequence is retested.
- **DRM boundary** is written into `bridge-steam-drm.md` as Requirements: genuine CDN-fetched Valve
  client + trampoline only; no exe edits, payload decryption or protocol stand-ins; plan nothing on
  `STEAMSTART` capture/replay.
- **Sources hygiene:** `sources/` for 023–074 holds only files git tracks in each spike (the first
  copy of 067a pulled 398 MB of an installed game and its chunk corpus; removed before commit).

### Earlier wrap-ups

**Steam native install (001–003):** GameLib can own the first install — download depots in-process
via `steam-user` (`getRawManifest()` + own decrypt; byte-identical to Steam), write an
`appmanifest.acf` Steam adopts, and launch via `steam://` so DRM holds. Spike 003 reversed the
"never write StateFlags=4" rule: a per-chunk sha1 gate makes full-ownership `4` trustworthy.
64-bit IDs must be strings (vdf rounds them); depot selection is package-ownership two-channel.
Operationalized in Phases 21/23.

**macOS native Steam bridge (004–008):** The seed's premise (gated on a macOS `lsteamclient`) was
too pessimistic. A LOWER, out-of-process `steam_api` bridge already works, proven on GameLib's exact
stack across every layer: 005a native helper reads real SteamID/persona from live Mac Steam via the
on-disk `libsteam_api.dylib`; 005b a Windows PE in the real GameLibSteam bottle round-trips that
identity over host loopback; 005c a drop-in `steam_api.dll` a game-like caller loads returns the
real SteamID (flat path); **006** the same via a real C++ **vtable** virtual call (MSVC `__thiscall`);
**007** a **real commercial game** (Avernum 4) ran on the bridge; **008** the bridge drives the Steam
gate correctly, but games often ignore `steam_api.dll` returns — it's a **compatibility layer, not a
DRM gate** (real enforcement is CEG-level). Remaining productionization: the full per-interface shim
generator (`gen_vtables.py` scope + sret), callback breadth, a persistent channel, and the
known-hard P2P-join gap. Toolchain: `brew` only dry-runs in this env — PEs built with `zig cc
-target x86-windows-gnu`; run in the bottle via `bin/wine` (NOT `cxstart`, which wedges wineserver).

**Tauri/Rust rearchitecture (009–012, run 2026-07-20):** Idea C is a **feasible reshape, not a free
lunch**, and its dominant cost is strategic (losing Heroic upstream merge), not technical. Shape:
Tauri/Rust shell + Rust platform seam + bundled Node sidecar + the existing React UI.
**009** — 176/220 backend files (80%) are Electron-free; the 20% seam is real work, and the sharp
edge is *import-time* coupling (`app.getPath` at import scope, then `electron-store` throwing at
construction), so lazy shimming cannot work and `electron-store` must be replaced across 20 files.
**010** — the Steam differentiator comes along free: `steam-user` loads headless in 341 ms with 0
electron imports, while Rust's `steam-vent` 0.5.0 is auth-only, experimental, and has no
PICS/CDN/manifest/chunk layer at all. **011** — 13/16 Electron APIs have full Tauri v2 parity, with
the two riskiest proven live in compiled Rust (a 41-byte token round-tripped through the macOS
Keychain via `keyring`; Steam.app confirmed as the registered `steam://` handler). **012** — the
frontend is the *cheapest* leg: 379 `window.api` call sites are untouched because the whole surface
funnels through three preload factory functions. Net cost: the 220-endpoint IPC re-plumb.

**Tauri login webview + cookies (013–015, run 2026-07-27):** Spike 011 rated Electron's `session`
API as needing "a small shim." Measured on real hardware, the shim is small but **the semantics
differ in a way that silently breaks Humble login**. The headline worry is cleared — this is *not*
the `navigator.clipboard` no-op shape: `Webview::cookies()` returns `HttpOnly`+`Secure` values in
2–4 ms from any thread (the documented Windows deadlock does not reproduce on macOS). But
**`cookies_for_url()` compares domains with plain string `==`** (`wry-0.55.1/src/wkwebview/mod.rs:1184`),
so for `HUMBLE_BASE_URL = 'https://www.humblebundle.com'` it returns **4 plausible host-only cookies
with `_simpleauth_sess` absent**, while `cookies()` returns 33 including it — worse than an empty
result, because a non-empty return defeats naive liveness checks. A literal port of `watchForLogin()`
would poll silently for its full 5-minute deadline and settle `{status:'waiting'}` with no error.
`document.cookie` is disqualified outright (the session cookie is `HttpOnly`; 27 other names make
the read look healthy). Two further gotchas: `on_navigation` fires for **subframes** (5 of 8 events
on Humble's login page), so relaying it to `notifyLoginNavigated()` would let an ad iframe re-arm
the watch deadline forever — use `on_page_load`; and Tauri's default macOS UA has **no browser
product token**, making the Chrome-UA spoof mandatory rather than reinforcement. Persistence is free
(24 cookies survived process exit) and `data_store_identifier` genuinely partitions, but there is
**no `session.fromPartition()` shape** — jar access requires a live `Webview` handle. Method note:
the verdicts are trustworthy because three independent oracles watched the same jar, which is also
what caught two of my own wrong assumptions mid-spike.

**Tauri embedded store browser (016–018, run 2026-08-03):** The in-app "Store tab" (Electron
`<webview>` parity for `WebView/index.tsx`) is **VALIDATED** via the `unstable` multiwebview API.
**016** — `Window::add_child` works on the *config-created* main window (42–51 ms; no window
restructuring); the real Steam store composited inside the window above the live app UI,
**screenshot-proven** via window-targeted `screencapture -l<NSWindow.windowNumber>` (full-screen
grabs repeatedly failed); per-child `.user_agent()` reaches the network (server-side oracle); the
`unstable` feature costs one ~11 s rebuild of `tauri`+`tauri-runtime-wry` only. A bare
`WindowBuilder` window with two children (probe B) also works. **017** — JS
`getBoundingClientRect()` → `set_position/set_size` lands exactly (1:1 coordinate space, no
titlebar offset at scale 1.0; fractional px round to whole logical px); hide/show/close support
route-change semantics; the panel's live ResizeObserver sync silently **overrode** the scripted
bounds — two geometry writers last-write-wins with no error, so the renderer must be the SOLE
bounds owner; native child renders above the main webview, so overlay UI must hide the embed.
**018** — the 013–015 cookie/event model carries over unchanged to children (`cookies()` works on
the child handle incl. HttpOnly; `on_page_load` fires per-child), with one ecosystem-level fact:
**one default jar per process across ALL windows and children** (probe B's GOG child dropped
cookies the main webview could read), and `data_store_identifier` genuinely partitions a child jar
(isolated child saw none of the shared jar's Steam/GOG cookies). Discrepancy vs 014a: Secure
cookies over `http://localhost` did NOT surface this session — positive controls must not depend
on them. Unverified: input/scroll feel (interactive checkpoint pending), retina, drag-resize
latency, Windows/Linux backends, Epic anti-bot inside an embed.

## Blueprint

`./.claude/skills/spike-findings-gamelib/` — auto-loads in future build conversations
(`references/steam-native-install.md`, `references/macos-steam-bridge.md`,
`references/tauri-rearchitecture.md`, `references/tauri-login-webview-cookies.md`,
`references/tauri-embedded-store-browser.md`, `sources/`).

**Login-window UX on macOS (019–022, 2026-08-04):** Both UX goals are met. A **local OAuth 2.0
code-grant store** (019, zero deps, port 17940, PKCE + replay enforcement + an `/events` oracle)
gives login/form work an offline fixture, and proved the production capture pattern: watching
navigation delivers `code`+`state` **before the redirect page paints** (713 ms of a 727 ms flow).
**Modal (021):** attaching the login as an AppKit **child window** makes it un-losable and keeps
typing, paste and autofill working — re-raise it after the parent restores from the Dock; sheets
work too but **trap the user** (the sheet blocks the window holding any cancel control, and a
store's login page has none). **Autofill (020/022):** inline Password AutoFill and save-prompts
are **platform-blocked** in both login surfaces on HTTP *and* real HTTPS, so no credential store
should be built — but the system **right-click → AutoFill → Passwords** panel fills in both
surfaces, Cmd+V paste works in both, and an **in-field key glyph that posts a synthesized
right-click pops that real menu with AutoFill in it** (screenshot-proven, public API only). The
panel can never be opened *directly*: the AutoFill item is injected at menu **display** time and
is absent from the NSMenu even for a genuine user right-click (proven by subclassing `WKWebView`
and hooking `willOpenMenu:`, plus a post-display re-dump), and `WKWebView` exposes no autofill
selector — only the W3C digital-credentials picker.

**Steam overlay in bridged games (061–064, 2026-11-02):** Mac Steam's own overlay works inside
GameLib-bridged Wine games, with no Steam-side patching. Loading Steam's `steamloader.dylib` +
`gameoverlayrenderer.dylib` (with `SteamOverlayGameId`) into the game is the whole trigger: Steam
attaches `gameoverlayui` to the game's pid by itself, even though it launched nothing and only
knows the bridge helper (062 run 4). The obstacle is code signing. CrossOver's `bin/wine` execs
two hardened loaders (`bin/wineloader`, `lib/wine/x86_64-unix/wine`) that drop `DYLD_*`, so the
insert list must travel through `CX_ENV` on a clone of the inner `SharedSupport/CrossOver` with
**both** loaders ad-hoc re-signed with `allow-dyld-environment-variables`. Re-signing inside a
copied `.app` gets the launch killed by Gatekeeper (-67018). On 8-bit BGRA8 layers that is enough
(DXVK: Schedule I; D3DMetal D3D11: The Planet Crafter). On a **10-bit `RGB10A2Unorm`** layer
(Manor Lords, D3D12 on D3DMetal) Steam's BGRA8 overlay pipeline draws corrupted, and NotProton's
`overlay_shim.m` fixes it by substituting a matching pipeline (it also covers HDR and D3DMetal's
Metal 4 queue). It is **GPLv3**, compatible with GameLib's `GPL-3.0-only`, so vendor and build
it. Overlay correctness is operator-verified: `screencapture -l` returns stale Metal frames.
Untested: HDR titles, DXMT, WineD3D-GL, non-CrossOver engines, fullscreen on the D3D11 paths, and
the overlay's invite dialog vs GameLib's picker. Blueprint:
`references/steam-overlay-in-bottles.md`. Spikes 023–060 remain unwrapped.
