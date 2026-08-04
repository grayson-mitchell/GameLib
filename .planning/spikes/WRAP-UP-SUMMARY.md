# Spike Wrap-Up Summary

**Date:** 2026-08-04 (updated — login-window UX 019–022 wrapped)
**Spikes processed:** 27
**Feature areas:** Steam native install; macOS native Steam bridge; Tauri/Rust rearchitecture; Tauri login webview + cookies; Tauri embedded store browser; login-window UX on macOS; OAuth login test harness
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

## Key Findings

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
