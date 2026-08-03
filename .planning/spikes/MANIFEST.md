# Spike Manifest

## Idea

**Steam native install.** Replace GameLib's `steam://rungameid` install handoff — a black
box that returns no progress and no errors — with a depot download GameLib owns, exactly as
it already does for Epic (legendary), GOG (gogdl), and Amazon (nile). GameLib writes the
files into a real `steamapps/` library plus an `appmanifest_{appId}.acf` so the Steam client
**adopts** the install; launch still goes through `steam://` so DRM keeps working, and Steam
owns all future updates with its own delta-patching.

**GameLib owns the first install. Steam owns everything after.**

Background: `.planning/notes/steam-depot-install-architecture.md`
Seed: `.planning/seeds/steam-native-install.md`
Open questions: `.planning/research/questions.md` (Q3, Q4, Q5)

## Requirements

Design decisions established so far. Non-negotiable for the real build.

- **Launch stays with Steam.** Depot download bypasses the download, not the DRM. Files on
  disk do not make a DRM-wrapped game launch. (D-1)
- **Steam owns updates; GameLib owns only the first install.** No delta-patching, no resume,
  no integrity repair — that is the hard part and we deliberately scoped it out. Any move to
  "GameLib owns updates" re-opens the entire build-vs-bundle architecture decision. (D-2)
- **Write `StateFlags = 1026`, never `4`.** ~~Original rule~~ — **SUPERSEDED by spike 003 (2026-07-17).**
  Was correct only while the download had no integrity guarantee. Phase 21's per-chunk sha1 gate + spike
  003's exec-bit handling make a trustworthy `StateFlags 4` achievable: on real HW Steam accepted a
  GameLib-written 4 with no verify/re-download and the game launched. Full-ownership (StateFlags=4) is the
  new direction — see spike 003 + Phase 22. The 1026 path may stay as a fallback when completeness can't
  be proven. Load-bearing for a trustworthy 4: StateFlags 4 + BytesToDownload==BytesDownloaded(!=0) +
  current public buildid + correct InstalledDepots + **Executable(32)/CustomExecutable(128) file modes**.
- **64-bit IDs are strings, end to end.** Depot manifest GIDs and SteamID64s exceed
  `Number.MAX_SAFE_INTEGER`. `@node-steam/vdf.parse()` silently rounds them and produces a
  wrong manifest GID — which is exactly how you cause a forced re-download. *(Established by
  spike 001.)*
- **Depot selection is driven by PACKAGE-LEVEL OWNERSHIP, through two channels.** A depot is
  installed iff it appears in an owned package's `depotids`, OR it carries a `dlcappid` whose
  app the user owns. Neither channel alone is sufficient. Depots can also live in a DLC's OWN
  app entry (walk `extended.listofdlc`), and language-specific depots must be filtered to the
  user's language. No combination of `optional`/`systemdefined` flags can substitute for
  ownership — two PICS-identical depots differ only in whether they are owned. Verified 11/11
  against real installs. *(Established by spike 001; rule in `001-acf-adoption/select.mjs`.)*
- **Download in-process via `steam-user`; do NOT bundle DepotDownloader.** Proven byte-identical
  to Steam's own download. No .NET, no second auth stack, no stdout scraping. *(Spike 002.)*
- **Do NOT use `steam-user`'s `getManifest()` filenames or `downloadChunk`/`downloadFile`.**
  Both are broken against current Steam — filenames come back truncated to an AES block
  boundary, and chunk download throws. Use `getRawManifest()` plus our own decrypt/decompress
  (~100 lines, see `002-steam-user-depot-download/steam-depot.mjs`). The underlying protocol is
  fine; only steam-user's handling of it is wrong. *(Spike 002.)*
- **Retry chunks across DIFFERENT content servers.** Steam's CDN edges drop connections under
  concurrency; ~16% of chunks fail without retry. This is normal, not a protocol error.
  *(Spike 002.)*
- **`lzma-native` is optional.** Pure-JS LZMA is correct, just 2.2× slower (8.1 vs 17.8 MB/s).
  The project's no-native-modules constraint holds. *(Spike 002.)*
- **Never write `StateFlags = 4` for a manifest with a wrong `InstalledDepots` set.** A wrong
  depot set is the one condition that provokes a re-download. Any manifest writer must be
  able to prove its depot selection before writing. *(Established by spike 001.)*

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | acf-adoption | standard | Given a real Steam install, when GameLib writes its own `appmanifest.acf`, then Steam adopts it and launches the game with no re-download | ✓ VALIDATED | steam, appmanifest, acf, depot, vdf |
| 002 | steam-user-depot-download | standard | Given an authenticated `steam-user` connection, when we fetch a depot manifest and download every chunk, then all files land on disk SHA1-verified and byte-identical to Steam's own install | ✓ VALIDATED | steam, depot, download, cdn, lzma, crypto |
| 003 | stateflags4-full-ownership | standard | Given a 100%-downloaded (per-chunk sha1-verified) WazHack macOS depot, when GameLib writes StateFlags=4 + consistent bytes + current buildid, then Steam shows it Installed with NO verify/re-download and it launches with DRM intact | ✓ VALIDATED (Steam trusts 4; exec-bit fix → launches) | steam, appmanifest, stateflags, full-ownership, d-2-reversal |

> **⚠ Spike 003 deliberately RE-OPENS two locked requirements** — "Write StateFlags=1026, never 4" and D-2 ("Steam owns completion; GameLib owns only first install"). Justification: Phase 21 shipped a per-chunk sha1 integrity gate, so "our download was byte-perfect" is now checkable. Note spike 001 found `Bytes*`/`buildid` were "free" ONLY because Steam recomputed them during its 1026 verify pass — under StateFlags=4 (no verify) they are expected to become load-bearing. If 003 INVALIDATES, the 1026 requirement stands.

### 001 — acf-adoption (VALIDATED)

**The core architecture works.** Wrote our own manifest for WazHack, restarted Steam:
Steam verified it, flipped `StateFlags` `1026` → `4` (`FullyInstalled`) by itself, downloaded
**zero bytes** (game dir byte-identical to the pre-swap backup), and the game **launched via
`steam://rungameid`**. The "GameLib writes the manifest → Steam adopts it → Steam launches"
model holds end to end.

- ✓ **`StateFlags = 1026` is correct.** Steam verifies-and-repairs rather than trusting us.
- ✓ **Manifest format fully cracked.** Field set and casing (`universe`/`lastupdated` are
  lowercase, while `SizeOnDisk`/`StateFlags` are cased) reproduced exactly.
- ✓ **`Bytes*` / `DownloadType` / `TargetBuildID` are free** — Steam recomputes them.
- ⚠ **Found a critical latent bug:** `@node-steam/vdf` corrupts 64-bit manifest GIDs
  (`…854` → `…700`). GameLib already uses this library on `.acf` files. **Audit call sites.**
- ✓ **Depot selection SOLVED.** PICS-alone selection was invalidated (passed on WazHack,
  failed on all 10 other games). With the authenticated license list, the two-channel
  ownership rule now reproduces Steam **11/11 exactly — depot-for-depot and GID-for-GID.**
- ~ **`SizeOnDisk` is not a derived sum** (corrects an earlier claim). Steam measures real
  bytes on disk; a manifest sum overshoots on multi-depot games (Wasteland 3 by 236 MB).
  Believed bookkeeping, but untested when wrong.
- ~ **DRM caveat:** WazHack was not confirmed hard-DRM-wrapped. The launch path is proven;
  one confirmation against a DRM-heavy title is worth doing before shipping.

### 002 — steam-user-depot-download (VALIDATED)

**Option A wins; the C# DepotDownloader wrapper is rejected.** Downloaded WazHack's macOS depot
entirely in-process — **171/171 files, byte-identical to what the real Steam client
downloaded**, in 6.3s at 17.8 MB/s.

The twist: `steam-user` gets everything *hard* right (CM auth, PICS, depot keys, raw manifests,
content servers) and both *easy* things wrong. `getManifest()` truncates every filename to an
AES block boundary (`UnityEngine.SubstanceModule.dll` → `UnityEngine.Substan`), and
`downloadChunk`/`downloadFile` throw outright. Neither is a protocol problem — decrypting by
hand recovers perfect plaintext and a valid LZMA container. We reimplemented just those two
pieces (~100 lines).

- ✓ **Byte-identical to Steam**, verified against a real install.
- ✓ **Pure-JS LZMA works** — `lzma-native` is a 2.2× speedup, not a requirement. The
  no-native-modules constraint holds.
- ⚠ **Retry across content servers is mandatory** — ~16% of chunks fail at concurrency 8.
- ○ Untested: multi-depot games, large (50 GB) games, streaming to disk (files are currently
  assembled in RAM), and resume-after-interruption.

---

## Idea B — macOS native Steam bridge (Phase 22's preferred long-term architecture)

**Distinct idea line from spikes 001–003.** Replicate Linux/Proton's model on macOS: run ONE
**native** macOS Steam client and bridge each bottled Windows game's Steamworks IPC out to it,
instead of bottling a full Windows Steam client per CrossOver bottle. If feasible, the whole
Phase 22 per-bottle-login problem dissolves (one native client = one login; cheap per-game
prefixes). Seed: `.planning/seeds/macos-steam-native-bridge-lsteamclient.md`.

Spikes 004a/004b/004c are three sub-probes of ONE feasibility question (not comparison variants).
Investigation/feasibility only — not building the bridge.

### Requirements (Idea B — emerged from spike 004)

- **Bridge at the `steam_api` flat-API layer, out-of-process — NOT the in-process `lsteamclient`
  thunk.** The proven approach (L4D2-launcher) is a PE32 `steam_api.dll` shim in the bottle
  marshaling over **TCP (localhost)** to a native Mach-O helper that loads the real
  `libsteam_api.dylib`. The Linux-style in-process winelib PE→Mach-O thunk is blocked on macOS
  (no build toolchain locally; Rosetta/protobuf interconnect) and is Valve/CodeWeavers-scale. *(004a/004b)*
- **Proxy the running, signed-in native Mac Steam client — never replicate auth.** DRM/`SteamAPI_Init`
  succeeds because it's the genuine client. The helper hardcodes nothing; it reads real
  SteamID/persona/auth from the live client. *(004b/004c)*
- **The native surface already exists on every user's machine.** `steamclient.dylib`
  (universal, arm64, exports `CreateInterface`) and `libsteam_api.dylib` (full pipe/user IPC
  surface) ship with Steam; macOS Steam's IPC transport is a **Mach service** (`ipcserver`,
  `com.valvesoftware.steam.ipctool`). A bridge links against surfaces the user already has — no
  bundling of Valve libraries. *(004c)*
- **Generate Steamworks vtables from a pinned SDK version.** L4D2 generated from SDK 1.53a for
  correct `__thiscall` arg counts / `ret N` and pack(4)→pack(8) callback repacking. Version drift
  breaks the ABI. *(004b)* Spike 006 proved the mechanism live: an MSVC-ABI vtable (ECX-`this`
  `__thiscall`, 8-byte return in EDX:EAX, vptr→slots) in a mingw-built shim serves a game-style
  virtual `GetSteamID()` and round-trips the real ID. Remaining: real MSVC-game confirmation, sret
  (>8-byte struct returns), and full per-interface vtable generation. *(006)*
- **The helper/shim MUST supply the game's real AppID before init.** `SteamAPI_InitFlat` with no
  `steam_appid.txt` / `SteamAppId` returns "No appID found" and every interface accessor returns
  NULL. For a bottled game this is the game's own appID; `480` (Spacewar) suffices for
  identity-only handshakes. Host helper needs no code signing/entitlements to load the dylib. *(005a)*
- **Known-hard gap: P2P / multiplayer *join*.** Single-player, auth, persona, listen-server
  hosting, and server-browsing are proven; inbound P2P handshake needs `InitRelayNetworkAccess()`
  + proactive `AcceptP2PSessionWithUser` and remains only partially fixed upstream. *(004b)*
- **Seed trigger_condition needs revising.** The seed assumed the bridge is gated on a macOS
  `lsteamclient`. Spike 004 shows a *lower, working* bridge tier already exists — the gate is
  "productionize the out-of-process steam_api bridge," not "port lsteamclient." *(004b)*

### Spikes (Idea B)

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 004b | community-lsteamclient-survey | standard | Given the Whisky/GPTK/CrossOver/Wine ecosystems, when surveyed for a macOS lsteamclient port or Win↔native-Steam bridge, then find existing art or rule it out | ✓ VALIDATED | steam, macos, bridge, survey, lsteamclient |
| 004a | wine-mach-o-thunk | standard | Given a Wine/CrossOver PE process, when it calls a native macOS .dylib via the winelib thunk, then the cross-boundary call returns correct data | ⚠ PARTIAL (in-process thunk blocked; routed around by out-of-process TCP) | steam, macos, wine, thunk, winelib |
| 004c | native-mac-steam-ipc-surface | standard | Given the installed native macOS Steam client, when inspected for an attachable Steamworks IPC surface, then determine bridge-in vs headless-shim | ✓ VALIDATED | steam, macos, ipc, steamclient, mach-service |
| 005a | native-steam-helper-handshake | standard | Given running signed-in Mac Steam + on-disk libsteam_api.dylib, when a native helper (not launched by Steam) dlopens it and inits, then it returns the user's real SteamID + persona | ✓ VALIDATED (live: SteamID64 + persona read from running client) | steam, macos, bridge, handshake, libsteam_api |
| 005b | bottle-to-host-tcp | standard | Given the GameLibSteam bottle, when a Windows PE inside it TCP-connects to the host bridge, then it round-trips the real signed-in identity | ✓ VALIDATED (live: PE in real bottle got real identity over loopback) | steam, macos, bridge, crossover, tcp, winsock |
| 005c | min-steam_api-shim | standard | Given a Windows module in the bottle that LoadLibrary's a replacement steam_api.dll, when it calls the flat API, then GetSteamID marshals to the host bridge and returns the real SteamID | ✓ VALIDATED (live: game-like harness got real SteamID via drop-in steam_api.dll) | steam, macos, bridge, steam_api, shim, dll |
| 006 | cpp-vtable-abi | standard | Given a replacement steam_api.dll with an MSVC-ABI C++ vtable for ISteamUser, when a game-style virtual dispatch calls GetSteamID (slot 2, __thiscall), then it marshals to the bridge and returns the real SteamID | ✓ VALIDATED (live: C++ virtual call ABI round-trips real SteamID; unmodified-game path) | steam, macos, bridge, vtable, thiscall, abi |
| 007 | real-game-avernum | standard | Given a real commercial Steam game (Avernum 4) in the GameLibSteam bottle, when its steam_api.dll is replaced with our bridge-backed drop-in, then the game loads it, calls Init, gets the real live-session identity, and runs | ✓ VALIDATED (live: real game ran on the bridge; caveat — Avernum ignores Init return, so not a gating demo) | steam, macos, bridge, real-game, avernum |
| 008 | gating-game-hoard | standard | Given a game importing SteamAPI_RestartAppIfNecessary (Hoard), when our bridge drives that gate, then the game runs iff the bridge validates the session | ⚠ PARTIAL (bridge drives the gate correctly both ways; but Hoard, like Avernum, ignores the return — steam_api returns are advisory, real enforcement is CEG-level) | steam, macos, bridge, gate, drm, ceg |

> **Overall 004–007 feasibility:** The bridge IS feasible **via the out-of-process `steam_api`
> TCP bridge**, **not** via a Linux-style in-process `lsteamclient` (blocked on macOS Wine build
> tooling + Rosetta/protobuf; still dual-client today). Spikes 005+006 reproduced **all four legs on
> GameLib's exact stack** (005a host↔Steam, 005b bottle↔host, 005c flat `steam_api.dll`, 006 C++
> vtable ABI), and **007 ran a REAL commercial game** (Avernum 4) on the bridge — it loaded our
> drop-in `steam_api.dll`, called `SteamAPI_Init`, got the real live-session identity, and ran, with
> no Windows Steam client in the bottle. Remaining productionization: a **gating-game demo** (Avernum
> ignores Init's return, so 007 proves drop-in compatibility, not launch-gating), sret (>8-byte
> struct returns), full per-interface vtable + export generation (`gen_vtables.py` scope), callback
> breadth, a persistent channel, and the known-hard **P2P-join** gap. If productionized it likely
> supersedes much of Phase 22's multi-bottle machinery — but Phase 22 remains the ship-now answer.
> Tooling landmine (007): `cxstart` detaches and wedges the bottle's `wineserver`; use `bin/wine`
> and `wineserver -k` between runs.
>
> **008 (gating):** the bridge *drives* the Steam gate correctly (`RestartAppIfNecessary`/`Init`
> return bridge-derived values both ways), but two local games (Avernum 4, Hoard) call the gate
> APIs and **ignore** the return — `steam_api.dll` returns are advisory, not enforcing. Real
> launch-enforcement is Steam **CEG**/DRM below the flat API, out of scope for a flat-API bridge.
> Takeaway: the bridge does not need to gate launches — its job is to make Steamworks calls
> succeed so games that check get valid answers.
>
> Toolchain: no mingw-w64 installable here (Homebrew only dry-runs in this env) — PE builds used
> **`zig cc -target x86-windows-gnu`** (self-contained mingw sysroot). Bottle run:
> `CX_BOTTLE=<bottle> <CrossOver>/bin/wine "C:\prog.exe"`.

---

## Idea C — Rust/Tauri rearchitecture (feasibility of a hard fork off Heroic)

**Distinct idea line.** Test whether GameLib could be re-based from Electron+React+TS onto
**Rust + Tauri v2**. This deliberately **breaks the locked "stay mergeable with Heroic upstream"
constraint** (CLAUDE.md) — the user chose **"divorce is on the table"** (2026-07-20): the spikes
test pure feasibility/cost of a rewrite, *not* mergeability preservation. The real question is not
"is Tauri nicer" but **"can GameLib's existing guts (Node backend + `steam-user` + React UI) come
along, or is this a ground-up rewrite?"**

Stack today (verified): Electron ^41.1.1, React ^18.3.1, electron-vite build, `steam-user` ^5.3.0
(pure JS), `electron-store` ^8.2.0, safeStorage token encryption, `shell.openExternal` for
`steam://`. Rust/cargo **is** installed locally; no Tauri CLI yet. Backend is the standard Heroic
architecture: typed IPC surface (`common/types/ipc.ts`), six store managers, download manager, wine
manager, dialog, launcher.

### Requirements (Idea C — emerging)

- **Divorce accepted.** Spikes assume a hard fork; loss of upstream Heroic merge is a chosen cost,
  not a blocker to design around. *(User decision 2026-07-20.)*
- **Target shape = Tauri/Rust shell + Rust platform seam + bundled Node sidecar for business logic.**
  NOT a Rust rewrite. 80% of backend files are Electron-free and port to a Node sidecar as-is. *(009)*
- **Keep `steam-user` as a Node sidecar; do NOT rewrite the Steam CM/depot stack in Rust.** The
  differentiator (spikes 001/002/003) already runs headless (0 electron imports, loads in 341 ms).
  The only mature Rust crate (`steam-vent` 0.5.0) is auth-only + experimental — no PICS/depot/CDN.
  A Rust port re-opens spike 002's byte-identical depot pipeline for no near-term gain. *(010)*
- **The platform seam is the real cost, and it is bounded & enumerated:** replace `electron-store`
  (20 files), re-plumb all **220 IPC endpoints** (158 handlers + 62 listeners) onto a sidecar/Tauri
  protocol, and port the 44-file lifecycle/dialog/tray/updater/protocol cluster. *(009)*

### Spikes (Idea C)

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 009 | node-backend-headless-sidecar | standard | Given a real backend slice, when run under plain node with electron stubbed (as a Tauri sidecar forces), then observe which Electron-main APIs it hard-depends on — bounding the port | ⚠ PARTIAL (sidecar viable: 80% of files electron-free, but electron-store + 220 IPC endpoints + 44-file platform seam must be rewritten) | tauri, rust, backend, electron, sidecar |
| 010 | steam-user-rust-vs-sidecar | comparison | Given Steam CM auth + owned-apps + depot download, when tested Rust-native (steam-vent) vs Node sidecar, then determine if the Steam differentiator can go Rust or must stay Node | ✓ WINNER = Node sidecar (steam-user runs headless in 341ms, 0 electron imports; steam-vent 0.5.0 is auth-only + experimental, no depot/CDN) | tauri, rust, steam, steam-user, sidecar |
| 011 | electron-api-parity-in-tauri | standard | Given the Electron APIs 009 surfaces, when mapped to Tauri v2 plugins, then build a minimal Tauri app proving the riskiest equivalents (encrypted token store; steam:// launch) work | ✓ VALIDATED (13/16 full parity; safeStorage→Keychain + steam:// launch PROVEN LIVE in compiled Rust; only session/powerSaveBlocker are minor shims) | tauri, rust, electron-api, parity |
| 012 | react-frontend-under-tauri | standard | Given GameLib's React renderer + preload bridge, when hosted in a Tauri v2 webview with the bridge shimmed, then the real UI renders and one round-trip IPC call succeeds | ✓ VALIDATED (renderer decoupled by design: 379 window.api calls, 1 direct ipcRenderer; whole surface = 3 preload factories; rebuilt live on mock-Tauri transport, 0 electron symbols) | tauri, rust, react, frontend, ipc |
| 013 | tauri-child-webview-login-window | standard | Given Tauri 2.11.5, when a child WebviewWindow opens a live login site with a spoofed UA, then the page loads and the parent observes every navigation | ✓ VALIDATED (external URLs load with no allowlist; `.user_agent()` reaches real requests; **`on_navigation` also fires for subframes** — use `on_page_load`; no `page-title-updated` analog) | tauri, webview, navigation, login, user-agent |
| 014a | cookie-read-rust-webview-api | comparison | Given a webview that provably received Set-Cookie incl. HttpOnly, when Rust `cookies()`/`cookies_for_url()` runs on macOS, then real values return — and empty is distinguishable from unsupported | ✓ **WINNER** — API is real (HttpOnly+Secure values, 2–4 ms, any thread) **BUT `cookies_for_url()` does exact domain `==` and silently drops `_simpleauth_sess` for `www.humblebundle.com`** | tauri, cookies, wkwebview, false-negative, humble |
| 014b | cookie-read-injected-js | comparison | Same precondition, when read via injected JS `document.cookie`, then which subset is visible — and does HttpOnly vanish silently | ✗ INVALIDATED as a login channel (`_simpleauth_sess` is HttpOnly → structurally invisible; 27 other cookies make it *look* healthy; remote-origin IPC denied by the ACL) | tauri, javascript, httponly, ipc, capabilities |
| 015 | cookie-jar-isolation-persistence | standard | Given a login jar, when the window closes and the app restarts, then cookies persist and stay isolated from the main webview | ✓ VALIDATED (24 cookies survived process exit; `data_store_identifier` genuinely partitions) — **but there is no `session.fromPartition()` shape: jar access requires a LIVE webview handle** | tauri, cookies, persistence, partition, data-store-identifier |
| 016 | embedded-child-webview-basic | standard | Given Tauri 2.11.5 with the `unstable` feature, when a child webview is added to the main window at a position/size, then an external store URL renders INSIDE the window alongside the main webview, with the Chrome UA override applied | ✓ VALIDATED (`add_child` works on the CONFIG-CREATED main window, 42–51 ms; real Steam store composited in-window with the app UI live around it — screenshot evidence; per-child UA reaches the network; `unstable` costs one 10.8 s 2-crate rebuild) | tauri, webview, multiwebview, unstable, embed, store-browser |
| 017 | child-webview-bounds-sync | standard | Given an embedded child webview, when the window resizes and JS reports a new content rect, then the child's bounds track it acceptably, and it can be hidden/shown/destroyed on route change | ✓ VALIDATED (JS `getBoundingClientRect` → `set_position/set_size` lands exactly; fractional px round to whole logical px; hide/show/close work) — **two geometry writers = silent last-write-wins; the renderer must be the ONLY bounds owner**; retina + drag-resize latency unmeasured | tauri, webview, bounds, resize, lifecycle |
| 018 | child-webview-coexistence | standard | Given main + child webviews in one window, when cookies and events are exercised, then `cookies()` works on the child handle, `on_page_load` fires for it, and jar sharing/isolation matches spike 015's window-level findings | ✓ VALIDATED (cookies()/on_page_load/on_navigation all work per-child; **ONE default jar per process across all windows AND children**; `data_store_identifier` partitions a child jar for real) — surprise: Secure-over-http-localhost control cookies absent this session, contra 014a's note | tauri, webview, cookies, events, isolation, data-store-identifier |

> **Overall Idea C feasibility (spikes 009–012):** A Rust/Tauri rearchitecture is **FEASIBLE but is
> a deliberate reshape, not a free lunch** — and the divorce from Heroic upstream is its dominant
> strategic cost, not a technical one. Shape proven across all four legs: **Tauri/Rust shell + Rust
> platform seam + bundled Node sidecar for business logic (incl. the Steam differentiator) + the
> existing React UI**. Cheapest→most expensive:
> - **Frontend (012): cheapest.** 379 `window.api` calls are untouched; the port is 3 preload factory
>   functions (+5 stray direct-electron renderer files). Proven live on a mock-Tauri transport.
> - **Steam (010): free.** `steam-user` + the depot pipeline (001/002/003) already run headless with
>   0 electron imports; keep as a Node sidecar. Rust-native (`steam-vent`) is auth-only/experimental.
> - **Platform seam (011): bounded, no blockers.** 13/16 Electron APIs have full Tauri v2 parity;
>   safeStorage→Keychain and steam:// launch proven live in compiled Rust; only `session` +
>   `powerSaveBlocker` need small shims.
> - **Backend re-plumb (009): the headline cost.** 80% of backend files port as-is, but the 20% seam
>   is real work: replace `electron-store` (20 files) and **re-plumb all 220 IPC endpoints** onto a
>   sidecar/Tauri protocol, plus the 44-file lifecycle/dialog/tray/updater cluster.
>
> **Net:** no idea-killer surfaced. The blocker to *starting* is not "can it be done" but "is losing
> Heroic upstream merge worth a large IPC-transport re-plumb for a smaller/faster binary + a Rust
> platform layer." Toolchain note: cargo/rustc present; `keyring` builds & round-trips the macOS
> Keychain; no Tauri CLI installed (not needed for these probes).

### Requirements (Idea C — login webview / cookie surface, from spikes 013–015)

Spike 011 rated Electron's `session` API as one of only 3 of 16 needing "a small shim". Spikes
013–015 went and measured it. The shim is small; the **semantics underneath it are not the same**,
and one difference silently breaks Humble login.

- **NEVER use `Webview::cookies_for_url()`. Use `cookies()` plus your own domain filter.**
  wry's macOS implementation compares domains with plain string equality
  (`wry-0.55.1/src/wkwebview/mod.rs:1184`), not RFC 6265 domain-matching. Measured against the
  live site in the same instant: `cookies_for_url("https://www.humblebundle.com")` returns **4
  cookies with `_simpleauth_sess` absent**, while `cookies()` returns 33 **including** it, and
  the apex spelling returns 25 including it. Since
  `HUMBLE_BASE_URL = 'https://www.humblebundle.com'` (`src/backend/humble/constants.ts:13`) is
  passed verbatim to both `watchForLogin()` and `getLiveCsrfToken()`, a literal port makes the
  login poll spin silently for its full 5-minute deadline and then settle `{status:'waiting'}`
  with no error anywhere. The replacement filter must be a suffix match
  (`host === domain || host.endsWith('.' + domain)`). *(014a — the killer finding.)*
- **A zero-cookie read is only actionable with a liveness proof.** `count === 0` cannot be
  distinguished from a dead API without one. Cheapest proof: on watch start, do one unfiltered
  `cookies()` and require `> 0` — a login page always sets something (Humble set 33 cookies to an
  anonymous visitor). If that returns 0, fail loudly instead of entering the poll. *(014a.)*
- **The Rust cookie API is the ONLY viable login-detection channel.** `document.cookie` cannot
  see `_simpleauth_sess` (`HttpOnly`) and cannot report that it cannot — it returns a
  healthy-looking 27-name list with the deciding cookie missing. Any design that detects login
  from injected JS is wrong by construction. *(014b.)*
- **Good news: the API itself is sound on macOS.** `cookies()` returns `HttpOnly` + `Secure`
  values in full, in 2–4 ms, from the main thread, a worker thread, or a `run_on_main_thread`
  hop. The documented Windows deadlock does not reproduce; wry's internal 1 s timeout is never
  approached. This is **not** the `[[navigator-clipboard-noops-under-tauri]]` shape. *(014a.)*
- **Wire the navigation relay to `on_page_load`, never `on_navigation`.** `on_navigation` fires
  for subframes — 5 of 8 events on the Humble login page were iframes (Optimizely, Humble's
  mailer, `about:blank`). `notifyLoginNavigated()` re-arms the watch deadline, so relaying
  subframe navigations would let a third-party ad frame keep a login watch alive indefinitely,
  defeating WR-03's timeout. *(013.)*
- **The UA override is mandatory, not reinforcement.** Tauri's default macOS UA is
  `…AppleWebKit/605.1.15 (KHTML, like Gecko)` with **no browser product token** — a worse
  bot-management fingerprint than Electron's default. `.user_agent()` on the builder does reach
  real HTTP requests (verified server-side), so D-05/D-07's Chrome UA requirement is portable.
  *(013.)*
- **Cookie persistence across restart is free; isolation costs a live window.** The default
  `WKWebsiteDataStore` is already disk-backed (24 cookies incl. `_simpleauth_sess` survived
  process exit), so `persist:` needs no equivalent. But by default **there is no isolation at
  all** — the app's own `tauri://` webview reads the live site's session cookie. Real
  partitioning needs `data_store_identifier([u8;16])` (macOS 14+/iOS 17+ only; Windows/Linux
  parity **unverified**), and an isolated jar is readable *only* through a live webview built
  with that identifier. *(015.)*
- **There is no `session.fromPartition()` shape in Tauri.** Electron hands the backend a session
  object with no window attached; Tauri only ever hands you a `Webview`. Closing the login window
  destroys the handle (`no webview window labelled …`) even though the cookies survive. A cookie
  poller must therefore be anchored to a webview that outlives the poll. *(015.)*
- **Remote pages cannot invoke app commands, but they do get `window.__TAURI__`.** A capability
  with `remote.urls` grants the webview remote-IPC eligibility but not ACL access to
  `#[tauri::command]`s (`rejected: … Plugin not found`). Meanwhile the Tauri global **is**
  injected into `https://www.humblebundle.com`. Threat-model that before shipping a store
  browser. *(014b.)*

### Requirements (Idea C — in-app store browser / embedded child webviews, from spikes 016–018)

The in-app "Store tab" UX (Electron `<webview>` parity) is achievable via the `unstable`
multiwebview API. All macOS-only evidence, like 013–015.

- **Embed with `Window::add_child` on the existing config-created main window** — no window
  restructuring needed. The child composites ABOVE the main webview; reserve a layout region
  for it. `add_child` hops to the main thread internally; callable from any thread. *(016.)*
- **The `unstable` cargo feature is the price and it is small.** Only `tauri` +
  `tauri-runtime-wry` recompile (10.8 s with the shared target dir). It is compile-time only —
  no config/capability changes to the existing app surface. *(016.)*
- **The renderer must be the ONLY owner of the embed's geometry.** JS
  `getBoundingClientRect()` → `set_position/set_size` in logical px lands exactly (fractional
  px round to whole logical px; no titlebar offset at scale 1.0). Two writers (backend +
  renderer) silently last-write-wins with no error. *(017.)*
- **Overlay UI cannot render above the embed.** The child is a native subview; modals or
  dropdowns over the store region must `hide()` the embed first or avoid its rect. *(017.)*
- **One default cookie jar per PROCESS — all windows and all children share it.** A store
  embed's logged-in session is readable from any webview handle (handy for pollers, bad
  hygiene). Per-store isolation works on children via `data_store_identifier` (macOS 14+),
  proven by a fresh isolated jar seeing none of the shared jar's Steam/GOG cookies. *(018.)*
- **All 013–015 rules carry over to embeds unchanged:** `cookies()` never `cookies_for_url()`;
  `on_page_load` not `on_navigation` for deadline-armed relays; per-child `.user_agent()` is
  mandatory and reaches the network; handle dies with the webview — anchor pollers to a
  survivor. *(018.)*
- **Do not rely on Secure cookies over `http://localhost` in positive controls.** Contra
  014a's note, `spike_secure`/`spike_both` never surfaced this session; keep control cookies
  flag-free or HttpOnly-only. Real-HTTPS Secure+HttpOnly cookies work fine. *(016/018.)*
- **Open before shipping:** input/scroll feel (needs a human on the interactive harness),
  retina (`scale_factor` 2.0), drag-resize latency, Windows/Linux backends, and Epic's
  anti-bot posture inside an embed (its pre-auth 403 is a known parked blocker). *(016–018.)*

---

## Idea D — Login-window UX (dummy store, modal windows, password managers)

**Distinct idea line.** Improve the login-window UX under the Tauri rearchitecture, iterated
against a fully-controlled local OAuth 2.0 auth-code-grant provider ("DummyStore") instead of
real stores' anti-bot surfaces (Epic's pre-auth 403 is a parked blocker). Two target UX
capabilities: (1) a **modal** login window that cannot get lost behind the main window;
(2) **Apple Keychain / password-manager autofill** inside the login webview.

### Requirements (Idea D — emerging)

- **Capture OAuth codes by navigation observation** — `on_page_load` (Started, main frame)
  delivers `code`+`state` to the app before the landing page paints. No callback server, no
  remote-page IPC (014b: ACL-denied anyway). *(019)*
- **Any scripted login test needs an explicit logout preamble.** The shared jar persists
  across app restarts (015), so "logged-in" is sticky and silently skips the form. *(019)*
- **`crypto.subtle` is available on the `tauri://` origin (macOS)** — S256 PKCE works
  in-renderer. Windows/Linux unverified. *(019)*

### Spikes (Idea D)

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 019 | dummy-oauth-store | standard | Given a local OAuth2 auth-code-grant provider, when a Tauri login window drives the flow end-to-end, then every step is observable and the harness is reusable for UI/form iteration | ✓ VALIDATED (2 consecutive scripted runs exit 0; replay + PKCE-tamper rejected; warm-session flow 75 ms) | oauth, pkce, login, webview, harness |
| 020 | keychain-autofill-login-webview | standard | Given the dummy store's login form in (a) a wry WebviewWindow and (b) a pristine raw WKWebView, when the user focuses the credential fields, then macOS Keychain/password-manager autofill offers to fill — or the gating (web-browser entitlement) is proven and fallbacks enumerated | ○ PENDING | keychain, autofill, wkwebview, entitlement |
| 021 | modal-login-window | standard | Given the main Tauri window, when the login window opens modal (.parent() / NSWindow child / always-on-top), then it cannot be lost behind the main window and input+autofill still work | ○ PENDING | modal, nswindow, parent, window-management |
