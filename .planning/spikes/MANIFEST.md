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
- **SEA native-addon `dlopen()` from an eval'd worker WORKS.** `getRawAsset()` +
  `process.dlopen()` succeeds inside `new Worker(source, { eval: true })` — the packaged-SEA
  worker-spawn shape `decompressPool.ts` actually uses — in a REAL compiled SEA binary, not
  just a normal `new Worker(path)` dev-mode spawn. Confirmed 10/10 runs. *(Spike 023.)*
- **`lzma-native`'s real prebuild filename is `node.napi.node`, NOT `lzma_native.node`.**
  Every triple also ships a separate `electron.napi.node` variant beside it (plans must
  resolve the plain-Node one, not the Electron one). The string `lzma_native.node` is only
  usable as an arbitrary SEA asset-map key — it does not need to, and does not, match the
  real on-disk prebuild filename. Win32 additionally ships a companion `liblzma.dll`.
  *(Spike 023.)*
- **esbuild flattens `__dirname` across every file in one bundle to the OUTPUT file's own
  location — do NOT use `__dirname` to locate a bundled package's own resources at
  runtime.** Confirmed empirically (a nested source file's `__dirname` tracked the *outfile's*
  directory, not its own, and changed when the outfile moved) and reproduced for real inside
  `lzma-native`'s own `require('node-gyp-build')(__dirname)` call once bundled — `dir` arrived
  as `"."` inside the compiled SEA binary's eval'd worker. Resolve any such path at BUILD TIME
  instead and bake it into a small generated data module the runtime code just `require()`s.
  *(Spike 023.)*
- **Real Steam-chunk native-LZMA speedup is ~5.8–6.6x, not RESEARCH.md's 47x synthetic
  figure.** Measured against a 1 MiB slice of real installed-game bytes (not text+random) on
  darwin-arm64: pure-JS ~87–99ms, native ~14–15ms per chunk. Still a clear win, but plans
  citing "47x" should cite this number instead. *(Spike 023.)*

- **A running Steam never notices a GameLib-written ACF.** `steam://install/<appId>` only opens Steam's install dialog (needs a human click; corrected 2026-10-29), so GameLib restarts Steam on Play instead (quick 261029-ji2); a Steam that starts after the files + ACF are written adopts them at startup.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | acf-adoption | standard | Given a real Steam install, when GameLib writes its own `appmanifest.acf`, then Steam adopts it and launches the game with no re-download | ✓ VALIDATED | steam, appmanifest, acf, depot, vdf |
| 002 | steam-user-depot-download | standard | Given an authenticated `steam-user` connection, when we fetch a depot manifest and download every chunk, then all files land on disk SHA1-verified and byte-identical to Steam's own install | ✓ VALIDATED | steam, depot, download, cdn, lzma, crypto |
| 003 | stateflags4-full-ownership | standard | Given a 100%-downloaded (per-chunk sha1-verified) WazHack macOS depot, when GameLib writes StateFlags=4 + consistent bytes + current buildid, then Steam shows it Installed with NO verify/re-download and it launches with DRM intact | ✓ VALIDATED (Steam trusts 4; exec-bit fix → launches) | steam, appmanifest, stateflags, full-ownership, d-2-reversal |
| 047 | running-steam-adoption | standard | Given native Mac Steam running and a complete GameLib depot install + ACF written after Steam last looked, when `open -g steam://install/<appId>` fires, then Steam adopts it with no restart and no game-content download | ✓ VALIDATED (WazHack 264160, n=1 game, 2 arms + 2 passive controls: passive = ignored 16+ min; install URL → toast only, Steam replaces the ACF with a StateFlags 2 placeholder, full scan finds 171/171 matching files, Fully Installed at BuildID 9044149 within ~2 s, same steam_osx PID, 0 game files rewritten, only Workshop depot 264160 (575 KB) downloaded; identical for StateFlags 4 and the 1026 handoff, so 4 buys nothing on this path); CORRECTED 2026-10-29: adoption needed a click on Steam's install dialog (Installs.ContinueInstall), not unattended — scan/repair findings stand | steam, macos, appmanifest, acf, adoption, steam-url, stateflags, live |
| 048 | running-steam-adoption-large | standard | Given native Mac Steam running and Civ V (7.72 GB, 22 depots incl. DLC, 10,897 files) with a GameLib 1026 handoff ACF, when `open -g steam://install/8930` fires, then Steam adopts it in bounded time with no restart and no game-content download | ✓ VALIDATED (~28 s end to end: 22 depot-manifest fetches ≈15 s + full scan 10897/10897 files in 12 s (~640 MB/s); every depot matched; 0 chunk downloads; same PID; 10,894 files untouched, 3 zero-byte files recreated, Steam ADDED the missing `installscript.vdf`; placeholder StateFlags 18 (not 047's 2), so wait for bit 4 + buildid≠0, not an exact value; hash-vs-size scan still open); CORRECTED 2026-10-29: adoption needed a click on Steam's install dialog (Installs.ContinueInstall), not unattended — scan/repair findings stand | steam, macos, appmanifest, acf, adoption, steam-url, multi-depot, large-install, live |
| 049 | adoption-corrupt-file | standard | Given a GameLib WazHack install with one same-size, same-mtime mid-file corruption and one 1-byte truncation, when running Mac Steam adopts it via `steam://install/264160`, then the scan catches both and repairs only those files | ✓ VALIDATED (`found 169/2 matching files`, so the scan checks CONTENT, not size; matched bytes exactly equal the total minus both files; re-fetched 17 chunks = every chunk of both files (12+5), not just the bad bytes; all 171 files byte-exact vs pristine after, only the 2 rewritten, about 3 s, same PID; ACF shows StateFlags 1026 + live Bytes* during the repair; decodes 047's `download X/Y`: X = bytes already satisfied from disk); CORRECTED 2026-10-29: adoption needed a click on Steam's install dialog (Installs.ContinueInstall), not unattended — scan/repair findings stand | steam, macos, adoption, steam-url, verify, integrity, repair, live |
| 050 | steam-download-progress-sources | standard | Given native Mac Steam downloading a Mac-native game, when the ACF Bytes*, the downloading/<appId>/ size (apparent + allocated), common/<installdir>/, content_log lines and nettop per-flow bytes are sampled every 1 s, then name the source(s) for a smooth Downloads-hero percent and speed | ✓ VALIDATED (Outlast 238320 2.81 GB / 113 s + Metro LL 43160 8.74 GB / 356 s: ACF writes **0 times mid-download** (setup at +2–6 s with BytesToDownload, then commit) so today's hero shows 0 % then done; staging is preallocated with real blocks to ~100 % within 2 s; content_log `Current download rate` every 60 s; phase lines immediate; **nettop per-flow bytes_in for steam_osx: 1 s cadence, 0.28 % steps, speed CV 0.13–0.17, ends at 100.4 % of BytesToDownload** → use nettop for percent+speed, content_log for phase, ACF for totals+done; per-process `-P` drops closed flows, nettop needs a pty; only Mac-native games reach this path (Wine games use GameLib's downloader); untested: pause/resume, concurrent downloads, updates) | steam, macos, downloads, progress, acf, content-log, preallocation, nettop, live |
| 051 | powera-pad-drives-gamelib-macos | standard | Given GameLib (WKWebView) on macOS with the PowerA Switch 2 wired pad (20d6:a720), when the user presses buttons/moves sticks, then the pad reaches GameLib's controller mode | ✓ VALIDATED via native route (WebKit Gamepad API does NOT expose the pad — GameLib and a Safari control page both blind — though raw IOHID shows full input; `gilrs` 0.11 native reader sees it by name/VID/PID/SDL GUID and delivers all 17 buttons, hat and 4 full-range axes with wrong default names (mapping=driver), Windows-measured indices hold (usage = index+1); prototype gilrs thread + renderer shim merging native pads into navigator.getGamepads() drives GameLib controller mode, [GAMEPAD] triple identical to Windows; follow-up: Down at bottom tile jumps to left panel) | gamepad, macos, wkwebview, gilrs, iohid, powera, controller-mode |
| 056 | plain-prefix-bridge-handshake | standard | Given a fresh WINEPREFIX made by Wine-Staging-macOS's own `wineboot -i` (no cxbottle), when a game-shaped x86 and x64 PE loads the SHIPPED bridge shim with a per-run helper, then HELLO + SteamAPI ready + real SteamID64 via the MSVC vtable | ✓ VALIDATED (x86 via WoW64 + x64, Wine-Staging and -DXMT, identical to a CrossOver-clone control; wrong-secret control fails closed with `AUTH refused`; CrossOver coupling confined to bottle creation + runner selection; readiness must wait for `wineserver -w` — system.reg flushes only on exit) | steam, macos, bridge, wine, wine-staging, dxmt, wineprefix, crossover, engine |
| 057 | wine-staging-real-title | standard | Given a plain Wine-Staging prefix + a shadow tree of a real bridge-verified install, when launched via WINEPREFIX + the engine's wine with the shipped shim, then it passes the strict criterion and plays | ✓ VALIDATED (Avernum 6 x86 verified on staging + -DXMT; Planet Crafter x64 Unity verified on staging + production's DXVK-macOS 1.10.3 with game-originated GetSteamID/GetPersonaName/BIsDlcInstalled, played, sluggish vs CX; bare wined3d cannot create a D3D11 device; **-DXMT engine broken for all D3D11 on Wine-Staging 11.20** — winemac.so exports no macdrv metal-view symbols DXMT v0.80 needs; every failure was graphics, before steam_api loaded) | steam, macos, bridge, wine-staging, dxmt, dxvk, unity, d3d11, wineprefix, engine |
| 058 | gptk-engine-bridge | standard | Given Gcenx GPTK 3.0-3 from GameLib's Downloads tab, when 056's probe and 057's real titles run in a fresh GPTK prefix, then the bridge is verified or the blocker is named | ⚠ PARTIAL (bridge works: probe x86 via wine32on64 + x64 pass, Avernum 6 HELLO + GINIT ok=1; but neither title playable — Avernum 6 crashes 2 s in on a wine32on64 `alloc_pages_vprot` assertion, Planet Crafter (Unity 6) aborts on unimplemented `USER32.IsMouseInPointerEnabled` after D3DMetal brought up D3D11; 3.0-3 is the newest Gcenx release; GPTK prefixes use Windows user `crossover`) | steam, macos, bridge, gptk, d3dmetal, wine32on64, toolkit, unity, engine |
| 059 | reuse-cx-bottle-vs-fresh-prefix | comparison | Given an existing CrossOver bridge bottle, when it is run by Wine-Staging via WINEPREFIX instead of a fresh prefix, then the bridge still works, CrossOver still works afterwards, and side effects are known | ✓ VALIDATED (reuse works both ways: staging then CrossOver on the same bottle, probe + Avernum 6 GINIT each time; each engine silently re-updates the prefix ~5-7 s and CrossOver restores all 1,489 rewritten placeholder DLLs, leaving 45 extras; cxbottle.conf untouched; hazard = Staging makes users/<mac user> so saves split — WINEUSERNAME ignored, **USER=crossover fixes it**) | steam, macos, bridge, wine-staging, crossover, wineprefix, engine-switch, user-profile, saves |
| 060 | crossover-trial-expiry | standard | Given an unlicensed CrossOver whose trial has expired for a bottle, when GameLib's calls run against it, then we know how each fails and how to detect expiry before launching | ⚠ PARTIAL (`CX_BOTTLE=<b> wine --demo-status` → `Standard version` / `Demo version (N days remaining)` / `(expired N days ago)` in ~1–4 s, no UI; trial clock is **per bottle** (obfuscated `InstallTime` in `Software\CodeWeavers\CrossOver\cxoffice`); licence = `~/Library/Preferences/com.codeweavers.CrossOver.license`, simulated absent via sandbox-exec read-deny; **expired launch hangs** (90 s cap, game never starts) — nag dialog inferred, not confirmed; `cxbottle --create` under expiry not run) | steam, macos, crossover, licence, trial, demo, fallback, sandbox-exec |
| 061 | notproton-overlay-render | standard | Given Grim Dawn (219990, DXVK → MoltenVK → Metal) staged on NotProton 1.2.1 and launched by Mac Steam, when the operator presses Shift+Tab, then Mac Steam's overlay draws over the Wine game and takes input | ✓ VALIDATED (operator: "drew fine, behaved as normally"; Steam started `gameoverlayui -pid <game>` itself; NotProton's `overlay-shim.dylib` hooked `WineMetalLayer` and built 4 overlay pipelines; `overlay_commit=missing` is NOT a failure; gotcha: NotProton setup started from a Terminal shell fails "could not write files" because TCC charges App Management to Terminal, launch it from Finder) | steam, macos, overlay, gameoverlayui, notproton, metal, dxvk, grim-dawn, live |
| 062 | bridge-overlay-attach | standard | Given Schedule I Free Sample (3205720) launched GameLib's bridge way (helper + TCP shim, CrossOver bin/wine + CX_BOTTLE, DXVK), not by Steam, when Steam's overlay dylibs + NotProton's shim are injected via `CX_ENV` on a CrossOver clone whose loaders allow DYLD, then Steam attaches gameoverlayui and Shift+Tab works | ✓ VALIDATED (runs 3+4 operator: drew, clicks worked; **Steam attaches `gameoverlayui` on its own once the renderer is in the game**, run 4 with nothing started by us; BOTH `bin/wineloader` and `lib/wine/x86_64-unix/wine` must be re-signed with allow-dyld (run 2 control: only one → stripped, nothing drew); clone must sit outside an `.app` or Gatekeeper kills it (-67018); bridge HELLO + GINIT ok=1 unchanged; `screencapture -l` returns stale Metal frames, pixels not usable; run 5 **without NotProton's shim** also drew + clicked, so Steam's own two dylibs suffice on DXVK; open: non-DXVK paths, fullscreen) | steam, macos, overlay, gameoverlayui, bridge, crossover, dyld, codesign, entitlements, gatekeeper, schedule-i, live |
| 063 | d3dmetal-overlay | standard | Given a GameLib-bridged game on CrossOver's D3DMetal (not DXVK), when only Steam's own `steamloader` + `gameoverlayrenderer` dylibs are injected and Steam attaches gameoverlayui itself, then Shift+Tab works | ✓ VALIDATED (The Planet Crafter 1284190, Unity D3D11: `D3DMetal.framework` + GPTK `dxgi` mapped, no DXVK, bridge GINIT ok=1, Steam attached `gameoverlayui` itself; operator: "worked and was responsive"; run 1 on Schedule I was NOT a D3DMetal test: its bottle's `d3d11=native,builtin` (old dxvk-macOS install) gave DXVK d3d11 on GPTK dxgi and it exited pre-HELLO; open: D3D12, DXMT, WineD3D-GL, fullscreen) | steam, macos, overlay, gameoverlayui, bridge, crossover, d3dmetal, gptk, d3d11, unity, planet-crafter, live |
| 064 | d3dmetal-d3d12-overlay | standard | Given Manor Lords (1363080, UE5, D3D12) on D3DMetal, when Steam's own overlay dylibs are injected, then the overlay draws correctly; if not, name the fault and whether NotProton's shim fixes it | ⚠ PARTIAL (D3D12 confirmed: GPTK `d3d12`/`dxgi` + `D3DMetal` + `libmetalirconverter`, no DXVK; Steam attached gameoverlayui itself; **Steam dylibs alone: overlay VERY DISTORTED, clicks worked, game fine**; with NotProton's shim: correct. Cause from shim trace: game's `WineMetalLayer` is **RGB10A2Unorm (10-bit)** and Steam's overlay pipeline is built for BGRA8Unorm; the shim substitutes an RGB10A2 variant at `setRenderPipelineState:`. D3D11 titles were BGRA8 so never hit it. Bridge did not attach (Shipping exe launched directly, stub bypassed): says nothing about Manor Lords' bridge) | steam, macos, overlay, d3dmetal, d3d12, gptk, metal, pixel-format, rgb10a2, notproton, unreal, manor-lords, live |
| 023 | sea-native-addon-dlopen | standard | Given `lzma-native`'s native `.node` addon embedded as a Node SEA asset, when extracted via `sea.getRawAsset()` and `process.dlopen()`'d from inside a worker spawned via `new Worker(source, { eval: true })` in a REAL compiled SEA binary, then the load succeeds and decodes a real Steam VZ chunk byte-identically to the pure-JS `lzma` path | ✓ VALIDATED (real SEA binary: isSea=true, dlopenFromEvalWorker=true, sha1Match=true, 10/10 runs; real-chunk speedup ~5.8–6.6x, below the 47x synthetic estimate) | steam, depot, lzma, native, sea, dlopen, worker_threads |

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
- **CEG-wrapped titles cannot run through the bridge alone.** CEG's start stub (in the game exe, before
  `SteamAPI_Init`) sends a DIPC start request (`STEAM_DIPC_CONSUME`/`SREAM_DIPC_PRODUCE`, `STEAM_START_ACK_EVENT_*`,
  `<exe>.<pid>.STEAMSTART`). Only a genuine Windows Steam client's servicing lets it continue. A bare ACK
  (Proton-style) or a registered `SteamClientDll` makes it exit 0; the native Mac client has no handler. Do not
  replicate Steam's answer (DRM circumvention). `drm-wrapped` → bottled Steam is the justified exception. *(035–037)*
- **Per-game shim fixes are data: tier-2 `shimFeatures` → `gamelib_bridge.cfg` `fix.<feature>=<value>` lines.**
  No new channel: the backend already rewrites the cfg beside every placed shim on every launch. The shim
  reads `fix.` lines itself at `DLL_PROCESS_ATTACH`, because its lazy port loader runs at the first Steam
  call, after a game may already have created its GL context. No `fix.` line = no hook, and the IAT is
  untouched. Feature names are a closed list on BOTH sides (backend validator + shim parser), each generic;
  patterns are allow-list regex-validated before reaching the cfg. Never per-game code. *(034)*
- **`wgl.hideExtensions` is the shipping fix for GL-3.3-compat-context games (Hoard).** It's an IAT hook on
  `OPENGL32!wglGetProcAddress` that wraps `wglGetExtensionsString{ARB,EXT}`; exact tokens or `prefix*`.
  Limitation: exe-imported `wglGetProcAddress` only (a renderer DLL or a `GetProcAddress`-loaded
  opengl32 isn't covered). *(033, 034)*
- **DRM boundary, clarified by the user 2026-10-27 (spike 043):** two things are **inside** the
  boundary. First, fetching Valve's genuine client DLLs (`steamclient(64).dll` etc.) from Valve's
  own CDN onto the user's machine, as opposed to GameLib redistributing them. Second, rewriting that
  genuine client's exports **in memory** so they jump to `lsteamclient`, which is Valve's Proton
  loader mechanism. Game files are still never modified, and ownership is still decided by the
  genuine Mac Steam client. This supersedes spike 040's listing of "ship-genuine-DLL" as out of
  bounds, but only for the fetch-don't-ship form.
- **Known-hard gap: P2P / multiplayer *join*.** Single-player, auth, persona, listen-server
  hosting, and server-browsing are proven; inbound P2P handshake needs `InitRelayNetworkAccess()`
  + proactive `AcceptP2PSessionWithUser` and remains only partially fixed upstream. *(004b)*
- **Seed trigger_condition needs revising.** The seed assumed the bridge is gated on a macOS
  `lsteamclient`. Spike 004 shows a *lower, working* bridge tier already exists — the gate is
  "productionize the out-of-process steam_api bridge," not "port lsteamclient." *(004b)*

### Requirements (Idea B — non-CrossOver engines, from spikes 056–059)

- **DECISION (operator, 2026-10-31, refined same day): CrossOver stays the first-choice Steam engine; a GameLib-managed Wine-Staging + DXVK is the automatic fallback.** Weighed against switching Steam wholly to Wine-Staging + DXVK: that option is behind (2 titles evidenced vs the Phase 53 census), slower (MoltenVK descriptor-pool storm), has no D3D12 and no working DXMT, and would need DRM mode + bottled Steam re-ported. Shape:
  1. **Fallback engine** — one pinned Wine-Staging + DXVK per GameLib release, installed by GameLib; bumped only when a release has tested it; the previous pinned version kept installed for rollback. Used automatically when CrossOver is missing, its trial/licence has expired, or it is broken — on the **same bottle**, launched with `USER=crossover` (059), so saves survive.
  2. **Per-game override** — advanced and explicitly unsupported (Proton model): any installed engine/version; known-fixes and census verdicts do not apply; the launch log records the exact engine + version. No picker by default. GPTK and `-DXMT` are not in the supported set.
  3. **CrossOver hygiene** — record tested CrossOver versions (generalising the DRM-mode allowlist); warn on untested, never block; detect missing/expired and drop to the fallback instead of failing. Never modify the user's CrossOver in place (clone, as DRM mode does).
  4. **Before the phase** — spike how an expired CrossOver trial fails under `cxbottle`/`wine` (registration dialog? hang?); optionally a few more titles on the fallback. No full census: the fallback is best-effort.
- **Non-CrossOver engines run the bridge unchanged; the work is runner/env, not the shim.** Shim, helper, cfg and TCP path pass on Wine-Staging, -DXMT and GPTK (x86 + x64). CrossOver coupling is confined to `provisionBridgeBottle` (cxbottle) and `stockBridgeBottleSettings` (runner). *(056, 058)*
- **A Steam engine picker is a D3D-path picker.** Every non-CrossOver failure happened in graphics or the engine before steam_api loaded: bare wined3d cannot make a Unity 6 D3D11 device; -DXMT is broken for D3D11 on Wine-Staging 11.20 (missing winemac metal-view exports); Wine-Staging + DXVK-macOS is the working non-CrossOver D3D11 path (sluggish, MoltenVK pool-exhaustion storm). *(057)*
- **GPTK 3.0-3 is not a general target** — bridge works but both test titles crash in the engine (wine32on64 `alloc_pages_vprot`; unimplemented `USER32.IsMouseInPointerEnabled`). *(058)*
- **Switching engines may reuse the existing CrossOver bridge bottle**, reversibly, if non-CrossOver engines launch it with `USER=crossover` (`WINEUSERNAME` is ignored). Expect a one-time silent prefix update per switch. *(059)*
- **Never capture unbounded wine stdout on the DXVK-macOS path** — 3.37 GB in 184 s from MoltenVK warnings. *(057)*

### Requirements (Idea B — Steam overlay in bridged games, from spikes 061–062)

- **Inject, don't spawn.** Putting `steamloader.dylib` + `gameoverlayrenderer.dylib` (with `SteamOverlayGameId`) into the game process is the whole trigger: Mac Steam attaches `gameoverlayui` to that pid itself, even though it only knows the bridge helper as the game. GameLib must not start `gameoverlayui` (two result). *(062)*
- **Injection channel = `CX_ENV` on a cloned runner.** Plain `DYLD_*` env is dropped by CrossOver's wrapper and by hardened loaders. Both `bin/wineloader` and `lib/wine/x86_64-unix/wine` need `allow-dyld-environment-variables` with every stock entitlement kept; DRM mode's `runnerClone` re-signs only the latter today. Clone the inner `SharedSupport/CrossOver` (never the `.app`), `xattr -cr`, or Gatekeeper kills the launch. *(062)*
- **Steam's dylibs alone are enough only for BGRA8 layers.** On BGRA8 swapchains (DXVK 062, D3DMetal D3D11 063) the overlay is correct with no third-party code. On a 10-bit `RGB10A2Unorm` layer (Manor Lords D3D12 on D3DMetal, 064) Steam's BGRA8 overlay pipeline draws it corrupted; a pipeline-format substitution fixes it (NotProton's shim does this). The build needs that fix, best by vendoring NotProton's `overlay-shim/overlay_shim.m`: it is **GPLv3** (repo default, not among NOTICE's exceptions), compatible with GameLib's `GPL-3.0-only`; keep its notice, build it ourselves. It also covers HDR and D3DMetal's Metal 4 queue. *(061–064)*

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
| 024 | epic-store-in-embedded-child-webview | standard | Given a Tauri-managed child webview (`Window::add_child`, spike 016's harness) pointed at `store.epicgames.com`, when the page loads with the injected `window.isTauri`/`__TAURI_INTERNALS__`/`window.ipc`/`__TAURI_PLUGIN_*` globals present (the confirmed, root-caused Talon fingerprint from 2026-08-03), then observe whether Talon blocks STORE browsing the way it blocks the `/id/api/email/exists` LOGIN endpoint, or whether the block is login-scoped only | ⚠️ PARTIAL 2026-09-05, 3 runs — **the store is NOT reliably browsable.** Run 1 (fresh container, this IP's first contact): store RENDERED, 0 Cloudflare navs, `bodyLen=89181`, header painted (`shot-epic-store.png`). Runs 2 AND 3: **Cloudflare Turnstile** — `Just a moment...`, `bodyLen=18450`, empty text, `challenges.cloudflare.com/.../turnstile/...` (`shot-epic-CHALLENGED-run2.png`). Run 3 used a BRAND-NEW container and was still challenged, which **falsifies the cookie-state explanation**; surviving candidate is IP/behaviour reputation accrued across the session. Steam positive control rendered in ALL THREE runs, so no run is a broken harness. **ESTABLISHED:** the injected globals were present in all three INCLUDING the run that passed, so the login-endpoint Talon fingerprint does NOT explain the store gate; the store CAN render in a Tauri-managed child webview; and `www.epicgames.com/store/en-US/` 302s onto `store.epicgames.com`, so the host distinction is not a variable. **NOT ESTABLISHED — the key open question:** whether a HUMAN can click through the Turnstile widget. All three runs were unattended and never clicked, so 'challenged' does NOT mean 'a user cannot browse'. ⚠️ An earlier revision of this row read VALIDATED on run 1 alone — generalising from one sample of a service whose posture is known to vary. `/store/epic` stays scoped out (D-05 unchanged); the follow-up is now 'can a user clear the challenge in-app', filed as a todo. | tauri, webview, epic, talon, cloudflare, turnstile, anti-bot, embed, store-browser, partial |
| 025 | linux-add-child-compile | standard | Given spike 016's unmodified `add_child` harness, when built and run NATIVELY on a real Linux desktop (this session's own environment, not a hypothetical machine), then does it compile against real webkit2gtk/GTK and does `add_child` succeed at all | ✓ VALIDATED (zero source changes; full native build in 48.8s incl. webkit2gtk-sys/gtk-sys; `add_child` OK in 2ms — faster than macOS's 42–51ms; real Steam store page loaded, navigated, and set/read real cookies through the identical API) | tauri, webview, multiwebview, unstable, embed, linux, webkit2gtk, phase-38 |
| 026 | linux-add-child-runtime | standard | Given spike 025's compiling Linux embed, when its geometry (017) and cookie-jar isolation (018) are exercised the same way as macOS, then do those same behaviours carry over | ⚠ PARTIAL — **two silent structural no-ops, source-confirmed, plus one reproducible native crash**: (1) `set_position`/`set_size` never write on Linux because `add_child` always packs into a `GtkBox` (`tauri-runtime-wry:5189` `default_vbox()`), and wry's `set_bounds` only mutates `if is_in_fixed_parent` (`wry webkitgtk/mod.rs:963-983`) — both webviews split the window 50/50 regardless of requested rect; (2) `data_store_identifier` isolation is a no-op on Linux — `wry lib.rs:2479` hardcodes it to the macOS `wkwebview` backend only, so an "isolated" child saw the full shared jar (all 10 cookies, not just its own 2); (3) a second `Window` with two child webviews segfaults natively in `libwebkit2gtk-4.1.so.0.19.7`, reproduced 2/2 at the identical offset — isolated away from, and absent in, the primary single-embed-on-main-window shape this project needs | tauri, webview, multiwebview, unstable, embed, linux, webkit2gtk, gtkbox, gtkfixed, data-store-identifier, segfault, phase-38 |
| 027 | windows-add-child-crosscheck | standard | Given no Windows machine reachable from this Linux session, when spike 016's harness is `cargo check`-ed cross-target against `x86_64-pc-windows-{gnu,msvc}`, then does it at least type-check against the WebView2 backend | ⚠ PARTIAL — `cargo check --target x86_64-pc-windows-gnu` SUCCEEDED (main.rs, incl. every `add_child`/`data_store_identifier`/`on_page_load` call, type-checks against real `webview2-com`/`windows` crates); `-msvc` (the triple actually shipped) blocked on a missing `llvm-rc`, not on the code; source read of `wry webview2/mod.rs` shows Windows uses real `WS_CHILD`+`SetWindowPos` absolute positioning (same family as macOS, NOT Linux's GtkBox packing) — narrows but does not close 38-E01, which still needs a live Windows run. **UPDATE 2026-09-30 (live, Windows 11, quick 260930-o75): PASS** — a native MSVC build of the unmodified harness (tauri 2.12.0 / wry 0.57.0 per Cargo.lock) attached a real `WS_CHILD` WebView2 child at every requested slot rect with 0 px error at DPI 1.25 on an independent HWND instrument; `data_store_identifier` is a silent no-op on WebView2 too; `38-E01` DISCHARGED. Sync `#[tauri::command]` webview creation hangs on Windows (harness now uses async wrappers). See README `## Live Windows run` | tauri, webview, multiwebview, unstable, embed, windows, webview2, cross-compile, phase-38 |
| 028 | linux-add-child-gtkbox-packing-lever | standard | Given spike 026's confirmed shared-GtkBox packing and no-op `set_bounds` on Linux, when application code reaches the real GTK objects through stock Tauri API (`Window::default_vbox()`, `Webview::with_webview` -> `PlatformWebview::inner()`) and applies raw `gtk-rs` packing/positioning calls, then can a non-50/50 layout be achieved without forking wry or tauri-runtime-wry | ⚠ PARTIAL — YES on the original question: reparenting the real widget into an application-created `gtk::Fixed` (`vbox.remove` + `gtk::Fixed::new()` + `fixed.put()` + `gtk::Fixed::move_`/`set_size_request`, all stock `gtk-rs`, never calling wry's own broken `reparent`/`set_bounds`) achieved an EXACT arbitrary rect (700x400, confirmed on two independent oracles), surviving two window resizes — in the ONE run this succeeded. `set_child_packing`/`size_request` alone showed only a plausible, not cleanly isolated, effect. **A second, more severe, UNRESOLVED finding supersedes it**: in 10 of 11 total runs (plain, longer sleep, explicit `gtk::main_iteration()` pump, and a first-ever-create variant that skips any destroy/recreate history), the embed webview never received ANY GTK allocation at all — stuck at GTK's own "never laid out" sentinel through pumps, sleeps, and even a real window resize that itself silently failed to take effect; visually confirmed absent via a region-captured screenshot. Root cause NOT identified within this spike's scope; a window-focus/mapping hypothesis is recorded as untested. This reliability gap is now a live, higher-priority open question for whichever phase builds the Linux store tab, independent of which layout lever it picks. | tauri, webview, multiwebview, unstable, embed, linux, webkit2gtk, gtk, gtkbox, gtkfixed, default_vbox, with_webview, phase-38, reliability |
| 029 | linux-embed-allocation-reliability | standard | Given 028's 10-of-11 degenerate embed allocation, when the focus/mapping hypothesis and 7 other treatments run N=10 each with a fresh fake profile, then does anything reliably make the embed allocate and is reparent_fixed reliable | ⚠ PARTIAL — 100/100 one-shot attempts ALLOCATED (incl. 10 with the window UNFOCUSED and 10 off-main-thread); reparent_fixed 30/30 EXACT; 028's own code path no longer degenerates (6/6). Focus/mapping REFUTED. Cause of 028's failures unidentified: sole changed variable is the GPU path (NVIDIA driver/library mismatch today forces WEBKIT_DISABLE_DMABUF_RENDERER=1) — re-run with it UNSET on a working GPU stack before building. New design constraint: never pack the Fixed as a vbox sibling (main webview squeezed to 61-125px). | tauri, webview, embed, linux, webkit2gtk, gtkfixed, reliability, focus, nvidia |
| 030 | hoard-macos-opengl | standard | Given Hoard (63000, CrossOver rating 2) crashes in its bridge bottle but is ProtonDB platinum, when we find what Proton has that macOS lacks and steer around it, then Hoard runs on the Mac | ⚠ PARTIAL (root cause: game requests GL 3.3 *compatibility* context, impossible on macOS (legacy 2.1 / core 4.1 only); no Proton config involved; forcing its GLEW legacy branch → runs on GL 2.1 Metal, 0 faults; no config-only fix (DisabledExtensions, CX_FWD_COMPAT_GL_CTX both fail); shim-side WGL-extension filter proposed, not built; visual check pending) | steam, macos, crossover, opengl, wgl, glew, hoard, game-fix |
| 031 | hoard-mesa-opengl | standard | Given unpatched Hoard needs GL 3.3 compat (030), when Mesa's Windows opengl32.dll is placed beside the exe, then it gets a 3.3 compat context and runs (llvmpipe, then zink) | ⚠ PARTIAL (softpipe ✓: unpatched game gets "3.3 (Compatibility Profile) Mesa 26.2.4", 0 faults, full SSAO path; llvmpipe ✗ wglChoosePixelFormatARB fails; zink ✗ null call in Vulkan init via winevulkan→MoltenVK; CrossOver drops WINEDLLOVERRIDES — use AppDefaults\<exe>\DllOverrides; playability/FPS unmeasured) | steam, macos, crossover, opengl, mesa, softpipe, llvmpipe, zink, moltenvk, hoard |
| 032 | zink-moltenvk-64bit | standard | Given zink crashed for 32-bit Hoard (031), when Mesa's test_wgl runs x64+x86 per Gallium driver in the bottle, then we learn whether zink fails only on the 32-bit path or on MoltenVK itself | ✗ INVALIDATED (zink fails x64 AND x86: CrossOver MoltenVK 1.2.290 reports robustness2 nullDescriptor=0, which zink hard-requires — vkCreateDevice never reached; bonus: llvmpipe passes x64, fails only x86; softpipe passes both) | macos, crossover, opengl, mesa, zink, moltenvk, vulkan, llvmpipe, robustness2 |
| 033 | shim-gamefixes-hoard | standard | Given 030's Hoard problems, when per-game fixes are applied from GameLib's steam_api shim via IAT hooks at load, then the UNMODIFIED exe runs (WGL fix) and the splash freeze shrinks (seek cache) | ⚠ PARTIAL (WGL fix ✓ from shim — unmodified exe runs; seek cache ✗ — 449k seeks virtualised, freeze unchanged 24.35s; real freeze cause = x87-heavy game code under Rosetta 2 (in-shim sampler, ~80% at Reuben+0x10db00..e700) — not shim-fixable; 030 seek theory corrected; product risk: shipped shim is a Debug/UBSan build that panics on legal x86 misaligned pointers) | steam, macos, shim, iat-hook, wgl, rosetta, x87, ubsan, hoard |
| 034 | known-fixes-v2-hoard | standard | Scope narrowed 2026-10-26 to option (a): given a LOCAL tier-2 profile `63000-steam.profile.json` with `shimFeatures.wgl.hideExtensions`, when GameLib launches Hoard through the real Steam bridge path, then the profile reaches the shim via `gamelib_bridge.cfg` `fix.` lines, a generic WGL filter hides the tokens, and the unmodified exe runs | ✓ VALIDATED (034a: 7-case cfg matrix with an x86 GL probe, release-flag build; 034b: profile→cfg plumbing, 12 jest cases, `prototype.patch`; 034c live: sha-verified unmodified Reuben.exe ran to gameplay with the profile, 3 tokens hidden, HELLO + SteamAPI_Init ok; control without the profile crashed as before. UBSan prerequisite already fixed by 261023-tyf. Option (b) overlays/ledger NOT tested) | steam, macos, known-fixes, tier-2, shim-features, wgl, bridge-cfg, hoard |
| 035 | xcom-ceg-handshake-trace | standard | Given XComEW.exe (XCOM: Enemy Within, 200510) in a bridge bottle with the shim, when traced +sync,+reg,+file, then the CEG start stub's exact handshake is named | ✓ VALIDATED (pre-init: STEAM_DIPC_CONSUME/SREAM_DIPC_PRODUCE semaphores + STEAM_START_ACK_EVENT_<pid>_<n> + <exe>.<pid>.STEAMSTART request, 30s wait → exit; identical to the protocol Proton's steam_helper `steam_drm_thread` answers) | steam, macos, bridge, ceg, drm, xcom, proton, dipc |
| 036 | proton-style-dipc-responder | standard | Given 035's handshake, when a Proton-style steam.exe responder ACKs the DIPC start request in the bridge bottle, then XComEW.exe passes the CEG wait and reaches SteamAPI_Init | ⚠ PARTIAL (ACK found+accepted, but game then exits 0 = 'Steam will relaunch me'; oracle under genuine bottled Steam shows the same request, ~1ms ACK, then the game loads ActiveProcess\\SteamClientDll's steamclient.dll and continues to menu → missing piece is a bridge-backed steamclient.dll (Proton's lsteamclient slot), not the DIPC answer; env/shim/relaunch ruled out; CrossOver wineserver ignores CX_BOTTLE) | steam, macos, bridge, ceg, drm, xcom, proton, dipc, oracle |
| 037 | ceg-steamclient-probe | standard | Given 036's accepted ACK, when ActiveProcess\\SteamClientDll names a probe steamclient.dll (Proton's lsteamclient slot), then XComEW.exe loads it post-ACK and reveals what CEG asks the client | ✗ INVALIDATED (registered client never loaded; game still exits 2ms after ACK → continuation depends on genuine Windows Steam's DIPC servicing; Mac client has no runtime handler; reproducing Steam's answer = DRM circumvention, stopped at the boundary → CEG titles need a genuine Windows Steam client: drm-wrapped → bottled Steam route confirmed justified) | steam, macos, bridge, ceg, drm, xcom, boundary |
| 038 | steamstub-grimdawn-probe | standard | Given Grim Dawn (219990, SteamStub .bind) in its bridge bottle, when a logging steamclient.dll is registered in ActiveProcess\\SteamClientDll64, then we see whether the stub loads it and what it requests | ⚠ PARTIAL (unlike CEG: stub loads the registered client and asks CreateInterface("SteamClient017"/"014") — the public client surface the Mac steamclient.dylib exports and Proton's lsteamclient forwards → a bridge-backed forwarding steamclient(64).dll is a plausible route; follow-up calls not enumerated; without a client the stub falls back to steam://run/219990 → silent 2s exit) | steam, macos, bridge, steamstub, drm, grim-dawn, steamclient, proton |
| 039 | steamstub-forwarding-client | standard | Given 038's SteamClientDll64 slot, when it names a steamclient64.dll returning the game's own GameLib shim interfaces, then SteamStub passes on answers that reach the native Mac client | ⚠ PARTIAL (stub takes the shim's SteamClient017, still falls back to 014 and exits 51; helper saw no HELLO: the shim's SteamClient017 methods are local HELPER FALLBACK/STUB constants, not forwarded → the real work is making the generated SteamClient017/014 genuinely forward) | steam, macos, bridge, steamstub, grim-dawn, steamclient, shim |

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
  Retina/drag-resize/Windows/Linux filed as Phase 38 ledger items `38-E01`..`38-E04` (D-04,
  Phase 40 Plan 10); Epic's anti-bot posture probed by spike 024 (3 runs, 2026-09-05): the store RENDERED once on first contact but was Cloudflare-Turnstile-challenged on both later runs including from a fresh container, so it is NOT reliably browsable. D-05's scope-out stands.
- **Linux's embed geometry model is fundamentally different from macOS/Windows, not just
  unmeasured.** `Window::add_child`'s `WindowChild` webviews always pack into the window's
  shared `GtkBox` on Linux (`tauri-runtime-wry` hardcodes `default_vbox()` for this kind on
  every non-Windows/macOS/iOS/Android target — the SAME box the main webview itself uses) —
  never a `GtkFixed`. wry's `set_bounds` only writes when the parent is a `GtkFixed`
  (`is_in_fixed_parent`), so on Linux it silently no-ops: every `set_position`/`set_size` call
  in spike 025/026 returned `Ok` while leaving both webviews pinned at an even 50/50 window
  split. **017's entire "renderer measures a rect, backend places the child there" design has
  no floor on Linux** — this is a layer below the retina/drag-resize refinement `38-E03`/
  `38-E04` already asked about; it is whether positioning works AT ALL. Windows, by contrast,
  uses real `WS_CHILD` + unconditional `SetWindowPos` (same family as macOS's NSView subview) —
  a live Windows run is still needed, but the source is NOT the Linux shape. *(025/026, 027 for
  the Windows contrast.)*
- **`data_store_identifier` per-store cookie isolation is ALSO a silent no-op on Linux** — wry's
  GTK backend never reads the field at all (`fetch_data_store_identifiers` is hardcoded to the
  macOS `wkwebview` module); every webview shares one `WebKitWebContext`. An "isolated" child in
  spike 026 saw the full 10-cookie shared jar, not just its own 2. This resolves spike 015/018's
  own "Windows/Linux parity unverified" caveat, for Linux, in the negative. *(026.)*
- **A second `Window` with two child webviews segfaults natively on Linux, reproducibly.**
  `libwebkit2gtk-4.1.so.0.19.7` crashed at the identical instruction offset in 2/2 runs of spike
  016's "Probe B" shape (bare `Window` + an app-origin panel child + an externally-navigating
  store child), with no Rust panic — only visible via `journalctl`. Isolated by a one-line
  skip-flag: the primary single-embed-on-the-existing-main-window shape (what GameLib's in-app
  store tab actually needs) completed cleanly with the same flag set, 0 segfaults. Treat any
  future design that opens a SEPARATE window per embedded store as unproven on Linux until this
  is root-caused; the shape already in use (one embed on the main window) is not implicated.
  *(026.)*
- **Compile/runtime feasibility itself is no longer unmeasured for either platform, only
  incomplete.** `38-E01`/`38-E02`'s recorded premise — "no implementation exists yet" — is
  superseded: Linux compiles AND runs (with the three caveats above); Windows type-checks
  cleanly against `webview2-com`/`windows` via cross-target `cargo check` from this Linux host,
  though no live Windows run has happened yet. *(025/026/027.)*
  **UPDATE 2026-09-30:** a live Windows run has now happened (Phase 38 sitting 13, quick
  `260930-o75`): `add_child` attaches and positions a real WebView2 child at the slot rect with
  0 px error, as the `WS_CHILD` + `SetWindowPos` source predicted; `data_store_identifier` is a
  silent no-op there too. Harness only, NOT the shipped app. *(027 README, `## Live Windows run`.)*

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
- **Inline Password AutoFill and save-password prompts do NOT exist in either login surface**
  (wry WebviewWindow AND pristine WKWebView; loopback-HTTP and real-HTTPS) on macOS 26 —
  live-confirmed; matches Apple's browser-only policy; no public entitlement changes it. *(020)*
- **The system right-click → AutoFill → Passwords panel IS a working Keychain channel in both
  surfaces** — fills credentials even on loopback HTTP; GameLib never touches the secret. UX
  caveats (both surfaces, so system behavior not a harness bug): no site auto-match, panel
  search box rejects typed input with a beep, manual scroll, click-per-field fill. *(020)*
- **Cmd+V paste from the Passwords app works in both surfaces**; the pristine window needs the
  key-equivalent local-monitor fix (re-proven under a minimal reimplementation). Login UX
  should surface these two system channels (hint text), not build a custom credential store.
  *(020)*
- **Login windows attach as AppKit child windows (`addChildWindow:ordered:Above` via objc2),
  not Tauri `.parent()`** — one runtime-switchable code path covers the wry AND pristine
  surfaces; un-losable behind main; typing/paste/AutoFill panel keep working. Re-assert
  z-order after main deminiaturizes (child returns behind main until re-raised). *(021)*
- **An in-field autofill affordance IS shippable — via synthesized right-click.** A key glyph
  injected into the password field posts `rightMouseDown`/`Up` at that field; macOS shows its
  real context menu **including AutoFill → Passwords** (screenshot-proven). All public API.
  Costs one menu hop vs a browser's inline dropdown. *(022)*
- **The AutoFill panel cannot be opened directly, at any price.** The item is injected at menu
  DISPLAY time and is absent from the NSMenu object even for a real user right-click (verified
  via a `willOpenMenu:` capture on a WKWebView subclass + a post-display re-dump); WKWebView
  exposes no autofill selector (only W3C digital-credentials). Nothing to capture or re-fire.
  *(022)*
- **Never trust a synthesized-event negative without comparing to a real event.** Same
  password field, verified by `elementFromPoint`: a real click yields a 3-item secure-field
  menu, a synthesized one the 10-item generic text menu. *(022)*
- **Sheet-mode login is forbidden without self-dismissal**: the sheet blocks the window
  holding any dismiss control, the store's page has no cancel, and sheets render no close
  button — an abandoning user is trapped (observed live). If ever used: auto-close on OAuth
  code capture + a sheet-owned Esc/cancel affordance; `endSheet` hides the window. *(021)*

### Spikes (Idea D)

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 019 | dummy-oauth-store | standard | Given a local OAuth2 auth-code-grant provider, when a Tauri login window drives the flow end-to-end, then every step is observable and the harness is reusable for UI/form iteration | ✓ VALIDATED (2 consecutive scripted runs exit 0; replay + PKCE-tamper rejected; warm-session flow 75 ms) | oauth, pkce, login, webview, harness |
| 020 | keychain-autofill-login-webview | standard | Given the dummy store's login form in (a) a wry WebviewWindow and (b) a pristine raw WKWebView, when the user focuses the credential fields, then macOS Keychain/password-manager autofill offers to fill — or the gating (web-browser entitlement) is proven and fallbacks enumerated | ⚠ PARTIAL (inline autofill + save-prompt platform-blocked on macOS 26, both surfaces, HTTP & HTTPS; BUT right-click → AutoFill → Passwords fills in both, and Cmd+V paste works in both) | keychain, autofill, wkwebview, entitlement |
| 022 | programmatic-autofill-trigger | standard | Given a login WKWebView, when an in-app affordance tries to invoke the macOS AutoFill/Passwords panel programmatically, then the panel opens (L3) / a synthesized event pops the real menu with AutoFill (L2) / neither (L1) | ⚠ PARTIAL — **L2 achieved** (synthesized right-click pops the real menu WITH AutoFill, screenshot-proven, all public API); **L3 impossible** (the AutoFill item is never in the NSMenu — even for a real click — and WKWebView has no autofill selector) | autofill, keychain, wkwebview, nsmenu, event-synthesis |
| 021 | modal-login-window | standard | Given the main Tauri window, when the login window opens modal (.parent() / NSWindow child / always-on-top), then it cannot be lost behind the main window and input+autofill still work | ✓ VALIDATED (child-window attachment RECOMMENDED — un-losable, input/autofill intact; sheet works but TRAPS the user without self-dismissal; oracle-proven restore-order gotcha) | modal, nswindow, child-window, sheet, window-management |
| 040 | steamstub-launch-check-static | standard | Given the three SteamStub titles failing through the bridge (Grim Dawn 219990, Raft 648800, Ranch Simulator 1119730), when their .bind stub headers are decoded read-only to see which launch checks are armed and the 52-19 load-time trace is read against them, then decide whether the check rejecting GameLib's forwarding steamclient64.dll is satisfiable inside Phase 52's locked boundary | ✗ INVALIDATED (check runs on the client-DLL file itself: stub reads all 186368 B of the forwarder then raises the error, upstream of any forwarded interface call; genuine client is 26MB Authenticode-signed, forwarder 187KB unsigned; Grim Dawn/Raft arm module-verify+ownership+debugger, Ranch Sim ships NoModuleVerification yet STILL fails → the only answers are ship-genuine-DLL / DRM-reconstruction / exe-edit / bottled-reroute, all outside the boundary; same wall as CEG 035-037; DID NOT decrypt the DRM payload — stopped at the boundary) | steam, macos, bridge, steamstub, drm, grim-dawn, raft, ranch-simulator, steamclient, boundary |
| 041 | steamstub-genuine-steamclient | standard | Given Grim Dawn (219990) in a clone of its bridge bottle with only native Mac Steam running, when ActiveProcess\\SteamClientDll64 names the user's own genuine Windows steamclient64.dll (copied from their GameLibSteam bottle, not shipped), then see whether the stub's file check passes and whether the game reaches its menu without Windows Steam | ✗ INVALIDATED (control a1: forwarder → "Application load error 3:0000065432"; b1 genuine: check PASSES (0 MessageBox) — confirms 040's file-check inference — but the genuine client then opens Steam3Master_SharedMemLock → not found (Windows steam.exe shared-memory IPC, which Mac Steam never creates), stub falls back to steam://run/219990// and exits ~0.7s later, no HELLO, no Windows Steam started; passing needs Windows steam.exe (bottled Steam) or a reimplemented Steam3Master protocol (stand-in) → no DLL both passes the check and reaches the Mac client) | steam, macos, bridge, steamstub, drm, grim-dawn, steamclient, boundary, oracle |
| 042 | crossover-gst-libav-overlay | standard | Given CrossOver 26.3's bundled GStreamer 1.24.4 (no libav), when an x86_64 gst-libav + LGPL ffmpeg set (from the official GStreamer 1.24.13 universal pkg) is put on GST_PLUGIN_PATH, then Media Foundation opens Unclaimed World (284100)'s WMV3/WMA9 Pro menu video and WMA8 music and the game reaches its main menu | ✓ VALIDATED (042a: GST_PLUGIN_PATH reaches the unix side through the CrossOver wrapper; 042b: plugin + 9 deps thinned to x86_64, 19 MB, @rpath resolves to CrossOver's loaded GStreamer, compat 2414 vs 2405 harmless; 042c: probe DECODE_OK 32/64-bit via avdec_wmv3/avdec_wmapro/avdec_wmav2, live GameLib bridge launch reaches main menu with video and music. Options.xml PlayVideo=false workaround INVALIDATED under CrossOver: music WMA still needs a decoder) | crossover, gstreamer, media-foundation, known-fixes, overlays, steam-bridge, unclaimed-world |
| 043 | notproton-steam-bridge-comparison | standard | Given NotProton (NotProtonNot/NotProton; Gcenx fork c09e0c4), when its game→Steam path is read against GameLib's steam_api shim + TCP helper and the DRM walls of 035-041, then name its layer, whether it plausibly clears SteamStub/CEG without Windows steam.exe, what is adoptable, and its fragility | ⚠ PARTIAL (static: it is Valve's Proton design ported — genuine signed steamclient(64).dll fetched from Valve's Linux client package + ntdll build_module detour trampolining its exports/entry to lsteamclient before DllMain (= Proton wine loader.c steamclient_setup_trampolines) + in-process winelib lsteamclient dlopening Mac steamclient.dylib's x86_64 slice + Proton steam_helper env (Steam3Master_SharedMemLock, Valve_SteamIPC_Class, DIPC ACK); answers 041's "no DLL both passes the file check and reaches Mac Steam" by mechanism and obsoletes 004a's "blocked" verdict, but NOT run on Grim Dawn/XCOM; costs a cloned, per-build binary-patched CrossOver; lsteamclient is Steamworks-SDK-licensed; Steam-side half patches Steam.app Info.plist and is not needed by GameLib → live test proposed as 044) | steam, macos, bridge, notproton, lsteamclient, proton, steamstub, ceg, drm, crossover, ntdll, boundary, research |
| 044 | notproton-drm-live | standard | Given Grim Dawn (219990, SteamStub 3.1) and XCOM EU (200510, CEG) staged into native Mac Steam as Windows builds on NotProton 1.2.1's compat tool with GameLib's bridge removed, when each is launched from Steam, then see whether it reaches its menu and, if not, name the failing step | ⚠ PARTIAL (SteamStub CLEARED: fully-armed compat/grim dawn.exe reached its menu with only Mac Steam running, confirming 043's genuine-client+trampoline inference; Steam API init not verified under the strict criterion. CEG NOT CLEARED: NotProton's steam-shim opens STEAM_START_ACK_EVENT with SYNCHRONIZE only (steam.cpp:1708 @ b2f49e4; Proton steam.c:848 has |EVENT_MODIFY_STATE; fix submitted as NotProtonNot/NotProton#260), so SetEvent gets ERROR_ACCESS_DENIED and the game times out at 30s; with a correct-mask ACK the wait returns 0 but the game still exits 0 right after, as in 036, so the Proton environment plus the genuine client add nothing at the CEG step and 037's verdict stands; 045 re-scoped to a CEG census) | steam, macos, notproton, lsteamclient, proton, steamstub, ceg, drm, dipc, crossover, grim-dawn, xcom, live |
| 045 | ceg-census | standard | Given the owned Steam library, when every owned game's Windows depot manifests are read for EDepotFileFlag.CustomExecutable (128) and each CEG title's Mac binary arch is read, then we know how many titles reach the CEG wall on Apple silicon | ✓ VALIDATED (CEG is rare: 6 of 389 owned games carry CEG (flag validated on XCOM vs Grim Dawn/Raft); 3 have x86_64 Mac builds (Civ V, Borderlands 2, Civ BE) and never hit it; only 3 (0.8%) do, the i386-Mac titles XCOM EU, Hitman: Absolution, Hitman: Sniper Challenge. Bottled Steam for drm-wrapped is an acceptable permanent answer and the 035–037/044 CEG line closes; the Hitmans need macArch "32" known-fix hints; SteamStub is the leverage. Started as a STEAMSTART capture/replay, dropped before code was kept) | steam, ceg, drm, census, depot-manifest, macarch, i386, bottled-steam, routing |
| 046a | steam-url-offline-toggle | standard | Given Mac Steam online, when `open -g steam://open/gooffline` then `steam://open/goonline` fire, then connection_log shows a user-initiated LogOff and a completed logon on the same steam_osx process, with no dialog | ✓ VALIDATED (undocumented `gooffline`/`goonline` in steamui.dylib's native steam://open/ verb table; Valve's JS uses `steam://open/goonline` itself; n=4: LogOff ≤0.25 s with the menu's "user initiated logoff" signature, logon complete ≈1.3–1.5 s, same PID, no dialog, no TCC prompt; both verbs idempotent (0 log lines when already in state); bare toggle on a clean Steam leaves Friends signed in and changeable. Running-game behaviour untested: Settings path refuses with MustCloseGames) | steam, macos, offline-mode, steam-url, friends, steam-auth |
| 046b | wrap-around-logon | standard | Given a clean Mac Steam and 046a's toggle, when a harness fires gooffline, waits for GameLib's own SteamUser.loggedOn, then fires goonline, then Friends stays signed in and changeable with GameLib's session alive | ✓ VALIDATED (n=1 automated + operator's n=2 manual: gooffline 13:42:50 → GameLib launch logon 13:43:14 (cold 971 ms) → goonline +2 s → Mac Steam back 1259 ms later, same PID; GameLib's 385-game fetch finished across the rejoin, no disconnect/relog/LogonSessionReplaced; operator: Friends signed in, status changeable. Required offline window automated ≈3–4 s) | steam, macos, offline-mode, steam-url, friends, steam-auth, steam-user, live |
| 046c | reconnect-reflip | standard | Given Mac Steam online and GameLib connected, when GameLib's CM connection drops and it logs on again, then see whether Friends flips | ⚠ PARTIAL (mechanism only, not live: steam-user autoRelogin defaults true and GameLib doesn't override it (user.ts:615); on NoConnection/TryAnotherCM/etc. it calls logOn(true) after a 1 s backoff, a full CMsgClientLogon with the same token/logonID/chat_mode; the canary client.relog() (user.ts:287) takes the same path → expect a flip; the wrap must own every logon: autoRelogin:false + route reconnects and relog through the wrapped connect) | steam, macos, friends, steam-user, autorelogin, relog, steam-auth |
| 052 | demo-licenses-vs-owned-apps | standard | Given a played Steam demo (3205720), when getUserOwnedApps runs with every option variant and the account's licenses are resolved through PICS, then the demo is missing from every owned-apps variant but present in the licenses path | ✓ VALIDATED (demos never appear in GetOwnedGames, played or not; licenses path finds 3205720 via free-on-demand package 1136752, plus 12 demos and 10 unplayed F2P games) | steam, steam-user, library, licenses, pics, demo, live |
| 053 | web-api-library-no-cm | standard | Given GameLib's SteamClient refresh token, when a web access token is minted over HTTPS (no authenticated CM logon) and used against Web API/store endpoints, then the library incl. demos is fetched without disturbing Friends | ✗ INVALIDATED (mint refused without CM session: CM-websocket AccessDenied 15, HTTPS form x-eresult 63; renewal and a WebBrowser-platform token not tried; Mac Steam untouched) | steam, steam-session, web-api, access-token, library, friends, live |
| 053b | renewal-mint | standard | Given GameLib's SteamClient refresh token, when GenerateAccessTokenForApp is called with renewal ALLOWED (no CM logon), then a web access token is issued | ✗ INVALIDATED (AccessDenied 15 on CM-websocket and HTTPS; no new refresh token; Keychain verified unchanged, backup deleted) | steam, steam-session, access-token, renewal, live |
| 065 | steamclient-installapp | standard | Given running native Mac Steam, when a separate native process loads steamclient.dylib, connects via CLIENTENGINE_INTERFACE_VERSION005 and calls IClientAppManager::InstallApp(appId), then Steam downloads it with no main window and no install dialog | ✓ VALIDATED (macOS n=1, TF2 440: EAppUpdateError 0, ACF + downloading/440 within 5s, operator saw no window/dialog; OpenSteamClient header indices stale — engine GetIClientAppManager is slot 43 not 45 and a new app-manager method at slot 8 shifts 8+; resolved by RTTI name + IPC function-ID high half, so a build must verify at runtime and fall back to steam://install; untested: Steam not running, unowned app, Windows/Linux) | steam, macos, install, steamclient, iclientengine, iclientappmanager, ipc, no-ui |
| 066 | steamclient-register-install | standard | Given a complete game on disk plus an ACF the running Mac Steam has not loaded, when a separate process calls an IClientAppManager method, then Steam registers it Fully Installed with no restart, re-download or window | ✓ VALIDATED (macOS n=1, WazHack 264160: control stays state 1 for 30s; RefreshLibraryFolders no effect; RecoverAppFromFolder → 18 NotInstalled (repair-only); InstallApp(264160) → "Found 171 pre-existing matching files", manifest-only fetch, state 4 in ~2s, no window, toast + library entry → replaces "Restart Steam to finish"; untested: GameLib-written ACF, large/multi-depot, non-default folder, Windows/Linux) | steam, macos, install, adoption, acf, steamclient, iclientappmanager, ipc, no-ui |

## Idea E — Incremental Rust migration (Node sidecar → Rust, piece by piece)

The sidecar exists because the backend is Node and Tauri has no JavaScript runtime (spikes
009–012). This line sizes moving it to Rust one piece at a time through `rustInvoke`, keeping
TypeScript signatures, with a parity harness and a TypeScript fallback flag per step. Phase 63
is the first step (the executable scanners). The Steam depot pipeline was the candidate second
step, on the premise that Rust would make installs faster.

### Requirements (Idea E)

- **A Rust depot pipeline must be justified on CPU, memory or code removal, not speed.** On this
  machine's connection the Node pipeline is network-bound at ~18 MiB/s with decode at 3 ms per
  chunk; raising concurrency adds latency and timeouts, not throughput. *(067a)*
- **Do not raise `TARGET_INFLIGHT_CHUNKS` above 32 on current evidence:** 96 gave no gain and 57
  timeouts. *(067a)*
- **The decode-worker memory is a Node packaging problem, not a reason to port:** each worker
  loads a 14 MB bundle (~160 MiB RSS idle) and the pool spawns up to 16 while ~0.2 are busy.
  Fix with a slim worker entry and a smaller pool before weighing Rust on memory. *(067b)*
- **A Rust depot pipeline must use `--cfg aes_armv8` and a non-default `flate2` backend
  (`zlib-rs`)**: the defaults are 20× (AES) and ~2.5× (deflate) slower than Node's C paths.
  Prefer `xz2` (C liblzma) over `lzma-rs` (pure Rust, ~30% slower). *(067b)*
- **Spike harnesses that reuse production Steam code must use production's steam-user options**
  (`enablePicsCache: false, autoRelogin: false`) and wait for `licenses` before planning; the
  PICS cache makes the plan's DLC lookup time out. *(067a)*

- **A Rust CM client must have a message pump.** Replies routed by `jobid_target`, every other
  message delivered to subscribers. A request/response client silently drops the license list
  (485 licenses lost inside steamroom's `login()`) and would drop `LoggedOff`/kicks. *(071a)*
- **Refresh-token logon must not require an account name** — GameLib stores only the token and
  SteamID64; the SteamID comes from the JWT `sub`. *(071a)*
- **Signed-in CM spikes on macOS run inside the go-offline wrap** (`071a/run-authed.sh`): refuse
  to log on unless Mac Steam's user-initiated LogOff is seen within 5 s. *(071a)*
- **Use a Rust crate for the CM half only.** The CDN half (manifest, chunks, decrypt, write) is
  Phase 73's `gamelib-depot`; a crate's content pipeline is duplicate, not an asset. *(071c)*
- **Fetch package access tokens before PICS package info**, or token-gated packages come back
  without their appids (939 vs 1,144 on the same account). *(073)*
- **Keep the macOS go-offline wrap for a Rust CM client;** it works unchanged from Rust. But a bare
  authenticated logon (steam-vent or steam-user) did not flip Friends on 2026-11-09, so the wrap's
  premise needs re-testing against GameLib's full refresh sequence before anyone removes it or
  builds more on it. *(074)*
- **The wrap is now insurance, not a requirement.** GameLib's full Refresh, unwrapped, as a
  staged harness and as the real app, did not flip Friends on 2026-11-09, and Mac Steam's
  `connection_log` stayed silent. The local `steamclient.dylib` is unchanged since the debug-era
  flips, so the cause changed server-side or in the (re-minted) token, and could return. Keep the
  wrap, but when Mac Steam doesn't go offline in 5 s, **log on unwrapped** rather than block on
  the guided Go-Offline step. Carry a "Refresh with Mac Steam online → Friends still signed in"
  live-gate item in Steam-auth phases. *(075)*
- **Bridge updates are a chunk-level delta, built beside the old tree, then committed.** Diff the
  installed manifest against the new one, take every reusable chunk from local bytes **after a
  SHA-1 check**, fetch the rest, build each changed file as a temp, verify `sha_content`, rename,
  then delete removed files. Reuse is mostly moved-in-file and can be cross-file (3.7 GB on Manor
  Lords), so nothing old is overwritten before every new file is built. File-level reconcile
  alone barely beats a full download on Unreal titles (6.7 vs 7.0 GB; chunk-level 0.9 GB).
  Budget free disk for the total size of changed files. *(076)*
- **Old manifests are still served** (request codes for 6/6 install-time GIDs), but cache each
  install's manifest and exempt it from `KEEP_GIDS` pruning while installed. *(076)*
- **If an update changes a shimmed `steam_api*.dll`,** move the new genuine DLL to
  `.gamelib-orig` and re-place the shim; otherwise leave the shim alone. *(076)*
- **Do Steam QR sign-in over the Web API** (`IAuthenticationService` over HTTPS), not the CM:
  it needs no crate patch and no user logon, so no go-offline wrap. Handle the ~22 s challenge
  rotation. *(072)*
- **Store the Steam account name at sign-in** if a crate that always sends `account_name` is
  chosen: an empty name is refused (`InvalidPassword`), and GameLib persists none today. *(071b)*
- **Give the sidecar's steam-user client a non-zero, per-install `logonID` before any
  authenticated Rust CM session runs beside it.** steam-user (0 by default, as production sends)
  and steam-vent (`obfuscated_private_ip` hard-coded 0) on one account kick each other with
  `LogonSessionReplaced` (34), the last logon winning; a distinct logonID on either side keeps
  both alive. Two authenticated Rust sessions would need a steam-vent patch, so share one. *(077)*
- **A Rust CM session must subscribe to `CMsgClientLoggedOff` for its whole life.** After a kick,
  calls fail only with "closed connection"; the reason (34 replaced vs a drop) arrives only on
  that message. *(077)*
- **The Rust Steam stack is cross-platform as-is:** steam-vent + `gamelib-depot` build and run on
  Windows x64 MSVC/GNU and Linux x64 with no NASM, cmake or OpenSSL (aws-lc-rs turns on
  aws-lc-sys's `prebuilt-nasm` by default). *(080)*
- **Adopting steam-vent adds aws-lc-sys to `src-tauri` and a second rustls provider.** steam-vent
  hard-codes `aws_lc_rs::default_provider().install_default()` on every CM connect, which beats
  `gamelib-depot`'s `ring` install. Install one process-level provider explicitly at shell start,
  or patch steam-vent (no default features, provider passed in) to stay ring-only. *(080)*
- **Install one rustls provider explicitly at the top of the shell's `main()`, in the same change that adds steam-vent.** Two compiled providers remove rustls's implicit choice, and any `rustls-no-provider` reqwest client built before an install panics. Whichever provider is installed first serves the whole process, and steam-vent and `gamelib-depot` both work on either. *(082)*
- **On macOS, a Refresh can read the account's apps from the running Steam (`IClientUser::GetSubscribedApps`) instead of a signed-in CM logon**, but only after `GetSteamID` matches the stored `userData.steamId`, with slots resolved by IPC function ID and the CM path as fallback. Intersect the licensed-demo rule with this set: the raw CM licence list keeps expired licences Steam hides (084).
- **A depot install that finishes while Mac Steam is signed out ends in "Sign in to Steam to finish", not "Restart Steam".** Sign-in reloads every appmanifest and adopts the GameLib ACF on its own; poll `BLoggedOn` + `GetAppInstallState`, and fall back to `InstallApp` if state is not 4 shortly after sign-in. That adoption hashes nothing when the manifest ID matches, so GameLib's own verify is the only integrity check on this path (083).
- **steam-vent main needs a one-line patch for anonymous logon** (`send_logon` demands a token);
  `080/vendor.sh` holds it. Upstream it, or pin a patched fork. *(071c, 080)*
- **Do not depend on CDN auth tokens:** `GetCDNAuthToken` fails for both steam-user and
  steamroom on current hosts, and the Phase 73 pipeline runs without them. *(071a)*

### Spikes (Idea E)

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 067a | node-pipeline-stage-profile | standard | Given a real Civ V (8930) macOS depot install through today's unchanged Node pipeline, when fetch and decode are timed and CPU/RSS/pool sampled per second, then we know whether the network or decoding limits throughput | ✓ VALIDATED — network-bound (18.3 MiB/s steady at 31.3 in flight × 534 ms; budget 96 → 18.4 MiB/s, 780 ms, 57 timeouts); decode 3 ms/chunk, 16 native workers never saturated; ~1.1 cores, 2.75 GB peak RSS. The Rust speed premise is invalidated | steam, depot, download, throughput, decompress, rust-migration, live |
| 067b | chunk-decode-bench | comparison | Given 067a's corpus of 978 decrypted Civ V chunks, when decrypted and decompressed single-threaded by production's Node functions and by Rust, then compare MiB/s and cpu-s/GiB with SHA1-verified output | ✓ WINNER Rust on decode CPU (5.8 vs 9.3 cpu-s/GiB at equal 177 MiB/s; needs `--cfg aes_armv8` and `flate2` `zlib-rs`), but decode is ~20% of the pipeline's ~1 core → ~8% system CPU. 067a's 2.75 GB RSS = 16 idle decode workers × ~160 MiB (14 MB worker bundle) — fixable in Node | depot, decompress, lzma, zip, aes, rust-migration, benchmark, memory |
| 067c | rust-depot-job | standard | Given the same depot job handed over stdin, when a Rust binary runs the whole fetch → write loop, then compare throughput, CPU and memory with 067a, files byte-identical | — NOT RUN: re-scoped trigger (memory inherent to Node) not met by 067b | depot, download, rust-migration, memory |
| 067 | steamclient-uninstallapp | standard | Given an app installed in running Mac Steam, when a separate process calls IClientAppManager::UninstallApp(appId), then Steam removes it with no window/dialog, and a signed-out Steam returns an explicit error | ✓ VALIDATED (macOS n=1, WazHack 264160: signed-out → 18 NotInstalled synchronously, nothing deleted; signed-in → 0, install dir + ACF + workshop content gone and state 1 within 1s, "finished uninstall (No Error)", no window/dialog; 18 is ambiguous (signed out vs not installed) → disambiguate with GetNumInstalledApps; GameLib dialog becomes the only confirmation) | steam, macos, uninstall, steamclient, iclientappmanager, ipc, no-ui, signed-out |
| 068 | nonsteam-first-match-signal | standard | Given a Windows game launched by Wine from a macOS install path, when ps is sampled, then we know which command-line shape identifies the game process for non-Steam launches and which per-game CrossOver bottle names cxbottle --create accepts | ~ PARTIAL (CrossOver exe shows Y:\ (home) or Z:\ persistently, unix path only 1-2 s; live GOG launch was GPTK, unix path persistent in wine64-preloader; basename-only unmatchable; bottle names up to 120 chars with dots and escapes accepted) | macos, crossover, launch-deadline, ps, first-match, bottle-name, phase-61 |
| 069 | steamclient-update-installed | standard | Given an app installed in running Mac Steam with a deferred pending update, when a separate process calls IClientAppManager::InstallApp(appId), then Steam starts and finishes the update immediately with no window/dialog | ✓ VALIDATED (macOS n=1, ADOM 333300 rolled back via release-101 branch, then BetaKey removed with Steam quit → "Update delayed for 28776 secs", state 6, BIsAppUpToDate 0; InstallApp → 0, update ran at once: 1.87 MB, 13 updated/4 deleted, BuildID 5820078 in 2s; on an up-to-date app InstallApp is a sub-second no-op; StartValidatingApp → 1, verify in 2s; no separate update method exists; detection via BIsAppUpToDate/state 6 or ACF StateFlags 6 + TargetBuildID≠buildid + ScheduledAutoUpdate; branch switch downloads immediately even with behavior 1, so it can't fake a pending update; GetUpdateInfo struct drifted (build words at 0x20/0x24); operator saw no dialog, toast unobserved) | steam, macos, update, steamclient, iclientappmanager, ipc, no-ui, buildid, validate, phase-74 |
| 070 | bridge-games-stay-stale | standard | Given Steam games installed by GameLib's bridge into per-game bottles, when the developer ships a new public build after install, then nothing updates the bridge install (ACF buildid, depot GIDs, files) | ✓ VALIDATED (macOS, 28 existing bridge installs vs anonymous PICS public: 6 stale — Manor Lords, Core Keeper, Abiotic Factor, Planet Crafter, Hell Clock, Mining Mechs — each with a public build shipped after install, 22 current; buildid and per-depot GID checks agree 28/28; ACF mtime = LastUpdated for all; only GameLib shim files and runtime caches changed; Mac Steam libraryfolders never lists a bottle; bottle steam.exe is GameLib's helper stub; @node-steam/vdf corrupts 19-digit GIDs — read as strings; timeupdated missing for old apps) | steam, macos, bridge, update, buildid, pics, acf, phase-74, live |
| 071a | cm-crate-steamroom | comparison | Given a plain cargo binary on steamroom (git e892bdf), when it logs on anonymously and with GameLib's stored refresh token, then PICS appinfo, licenses, depot key, manifest request code and CDN hosts match steam-user and drive the Phase 73 Rust pipeline | ✓ VALIDATED with workaround (anon PICS identical to steam-user on 4 apps incl. 86 Civ V manifest gids; refresh-token logon with no account name; depot key SHA-1 identical; request code + CDN hosts drove `gamelib-depot-cli summarize` to a decrypted manifest, 198 files / 3.2 GB; 485 licenses = steam-user's, but only recovered via RecordingTransport because `login()` discards them; no message pump — dead `_rx`, serial requests, no heartbeat; CDN auth token fails for both clients; Windows/Linux inferred from shared deps, not built) | rust, steam, cm, steamroom, sidecar-retirement, pics, depot |
| 071b | cm-crate-steam-client-lib | comparison | Given a plain cargo binary on steam-client-lib (SteamHelper-rs f77c946), when it logs on anonymously and with GameLib's stored refresh token, then PICS appinfo, licenses, depot key, request code and CDN hosts match steam-user | ✓ VALIDATED, needs account name (anon PICS identical on 4 apps; refresh-token logon REFUSED with empty account name — crate always sets it, sealed Account trait — ok with the name from loginusers.vdf; 485 licenses as a normal event; depot key SHA-1 identical across all three clients; request code ok, 6 CDN servers; has the message pump / heartbeat / reconnect / concurrent handle steamroom lacks; PICS/depot calls added as ~50 lines of JobMessage/ServiceMethod markers; multi-part PICS unsupported by its job model; ~0.55 s per round trip vs ~0.25 steamroom, likely Nagle; pulls reqwest 0.11 + native-tls → openssl-sys on Linux) | rust, steam, cm, steam-client-lib, sidecar-retirement, pics, depot |
| 071c | cm-crate-steam-vent | comparison | Given a plain cargo binary on steam-vent (codeberg main a9e8164, unreleased 0.6.0), when it logs on anonymously and with GameLib's stored refresh token, then PICS appinfo, licenses, depot key, request code and CDN hosts match steam-user | ★ WINNER with caveats (message filter routes by job id + typed subscriptions + heartbeat; generic `job`/`job_multi`/`service_method` — no marker types; refresh-token logon with no account name; 485 licenses via `on::<CMsgClientLicenseList>()` subscribed before logon; depot key SHA-1 identical (4/4 clients); request code ok, 6 CDN; ~0.3–0.4 s round trips; anonymous logon BROKEN on main — `send_logon` demands a token (NoToken), one-line regression — released 0.5.0 anon PICS = steam-user 4/4; no QR helper; pulls aws-lc-sys via reqwest 0.13; 4 active authors. Head-to-head: GameLib needs only the CM half — Phase 73 owns CDN — so steamroom's content layer is duplicate; steamroom = fallback with a pump added; steam-client-lib hardest to adopt (account name, OpenSSL)) | rust, steam, cm, steam-vent, sidecar-retirement, pics, depot |
| 072 | rust-signin-refresh-token | standard | Given steam-vent plus the Steam Web API, when the operator signs in by QR and by password + Steam Guard, then each yields a client refresh token that logs on with no account name | ⚠ PARTIAL (live, operator's main account: QR over the Web API — IAuthenticationService via HTTPS, platform SteamClient, no CM, no crate patch — approved, 494-char token aud client/web/renew/derive, account name returned; QR challenge rotates ~22 s while unscanned; password + Guard via steam-vent `login` + page-driven handler: Steam offered device code + device confirmation, operator approved in app, logged on 485 licenses; password token re-logged on with no account name; QR token not separately logged on; typed codes not exercised, email impossible on a mobile-authenticator account) | rust, steam, auth, qr, steam-guard, refresh-token, sidecar-retirement, live |
| 073 | rust-owned-apps-parity | standard | Given a refresh-token logon on steam-vent, when it fetches owned games and license-derived apps the way GameLib does, then both sets match steam-user exactly | ✓ VALIDATED (live, operator's account: Player.GetOwnedGames#1 with GameLib's options 390 = 390, identical ids/names/playtime/last-played; licenses → package tokens → PICS packages → 1,144 = 1,144 appids identical; bogus ClientRegisterKey → job reply BadActivationCode, nothing redeemed; 071a's 939 was package info fetched without access tokens; back-to-back wrapped logons: the second wrap refuses until Mac Steam finishes reconnecting; family sharing and a split PICS answer untested) | rust, steam, owned-apps, licenses, pics, redeem, steam-vent, live |
| 074 | rust-logon-friends-wrap | standard | Given Mac Steam freshly restarted with Friends signed in, when a Rust (steam-vent) client logs on inside the go-offline wrap and holds the session, then Friends stays signed in and changeable with the Rust session alive | ✓ VALIDATED wrapped + ⚠ SURPRISE (live: wrapped — Mac Steam LogOff 0.26 s, Rust logon, goonline, Mac Steam back in 1.5 s, Rust session alive 120 s with no ClientLoggedOff, operator: Friends signed in and changeable; unwrapped Rust control — Mac Steam's connection_log recorded nothing, Friends still fine; C1 positive control with GameLib's production steam-user logon, unwrapped, 60 s — ALSO no flip. A bare authenticated logon no longer signs Friends out on 2026-11-09 from either client; either Steam changed or the trigger is GameLib's post-logon refresh work. C2 OS-type A/B skipped as moot. Keep the wrap) | rust, steam, macos, friends, offline-mode, steam-vent, steam-user, live |
| 075 | friends-flip-full-refresh | standard | Given Mac Steam signed in with Friends online, when GameLib's full Refresh sequence runs without the go-offline wrap, then we learn which step, if any, still signs Friends out | ✓ VALIDATED (live: arm A staged harness — logon, 485 licenses, canary, webSession, 390 owned, 754 licensed-not-owned appinfo, 390-app PICS pass, 60 s hold, logOff — and arm B the real app with the wrap patched out, Refresh → demos=11 → idle close; connection_log silent in both, operator: Friends signed in and changeable, no flicker. steamclient.dylib unchanged since 2026-10-22, before the flips → server-side or token change; app no longer logs on at launch. Keep the wrap but fall through unwrapped instead of the guided step; park 078) | steam, macos, friends, offline-mode, refresh, live |
| 076 | bridge-delta-update | standard | Given a stale bridge install, when its installed manifest is diffed against the current public one and patched in place at chunk level, then the tree matches the new manifest byte for byte, user files survive, and we know the delta bytes vs a full download | ✓ VALIDATED (live, 6/6 stale installs: request codes still issued for every install-time GID; chunk-level delta 5.7 MiB–916 MiB vs file-level 18.8 MiB–6.7 GB vs full 110 MiB–7.0 GB, Unreal titles 4–8× smaller than file-level; reuse mostly moved-in-file, 3.7 GB cross-file on Manor Lords. Applied on APFS clones: Mining Mechs 48/49 and Manor Lords 111/112 match the new manifest, misses = untouched shim / game-modified ini; Manor Lords 83 s vs ~6.5 min full; 3 corrupted local chunks fell back to CDN, still 48/49. Manor Lords' update replaces steam_api64.dll → shim handover needed. Untested: removals, multi-depot, resume, game running, bridge launch after patch) | steam, depot, delta, update, bridge, rust, phase-74, live |
| 077 | dual-cm-session-coexistence | standard | Given the sidecar's steam-user session and a Rust steam-vent session signed in with the same refresh token (Mac Steam online), when both stay logged on and make CM calls at once, then neither is kicked, or we learn which logon field (obfuscated_private_ip / logonID) keeps them apart | ✓ VALIDATED (they collide: steam-user logonID 0 (production) vs steam-vent ip 0 (hard-coded) → the LAST logon wins, the other gets LogonSessionReplaced 34, in both orders; P1/P2 controls prove obfuscated_private_ip alone separates sessions; a non-zero steam-user logonID → both alive full hold (arm C); a kicked steam-vent fails later calls fast with "closed connection", only a CMsgClientLoggedOff subscription carries the 34; anonymous sessions get distinct anon IDs and never collide; Mac Steam silent throughout. Inferred: two GameLib installs behind one NAT already kick each other today) | rust, steam, cm, steam-vent, steam-user, session, logonid, sidecar-retirement, live |
| 080 | rust-steam-stack-win-linux | standard | Given steam-vent and gamelib-depot built for Windows x64 and Linux x64, when each logs on anonymously and fetches + decrypts a public manifest, then it builds and runs, or the blocking native dependency (aws-lc-sys, xz2, zlib-rs) is named | ✓ VALIDATED (one binary — steam-vent logon → PICS → depot key → request code → CDN hosts → gamelib-depot depot_manifest_summary — PASS on macOS arm64 (signed in, 198 files/3.2 GB), Windows x64 GNU live under Wine-Staging 11.20 (signed in), and CI run 42667918251: windows-latest MSVC ×3 (NASM present / hidden / prebuilt) + ubuntu 22.04/24.04, anonymous 232250 + 1007; no blocking native dep, binaries link only OS libs. aws-lc-sys is NEW to src-tauri via steam-vent (reqwest/rustls defaults + hard-coded aws_lc_rs install_default in websocket.rs:21) but needs no NASM: aws-lc-rs enables prebuilt-nasm by default. Two TLS providers in one process, first installer wins. steam-vent main anonymous logon fixed by a one-line placeholder-token patch (vendor.sh)) | rust, steam, cm, steam-vent, gamelib-depot, windows, linux, cross-compile, sidecar-retirement |
| 082 | one-process-tls-providers | standard | Given steam-vent (aws-lc-rs default provider) and `gamelib-depot` (ring) linked into one binary, when a CM connect runs before, during and after a depot CDN fetch in the same process, then both stay working with no provider panic, and we know which provider each connection actually used | ✓ VALIDATED (the first install wins for the whole process, and CM + depot work on either provider; concurrent: 2,227 HTTPS manifest summaries during 40 PICS jobs, 0 errors; **hazard: with steam-vent in the build, rustls has two providers, so a `rustls-no-provider` reqwest client built before any install PANICS** (control ring-only build: HTTP 200); no shell path does that today (updater self-installs ring, tauri core reqwest is mobile-only), but new Rust networking code would; 5/6 CDN hosts are `httpsSupport: mandatory`, so the depot does use TLS) | rust, tls, rustls, aws-lc, ring, steam-vent, gamelib-depot, integration |
| 084 | owned-apps-from-running-steam | standard | Given a signed-in Mac Steam, when the bridge helper reads licenses / owned apps through `steamclient.dylib` interfaces (located and verified at runtime as 065/067 did), then the set matches 073's parity set with no GameLib CM logon | ✓ VALIDATED (`IClientUser::GetSubscribedApps` (slot found by IPC function ID, 12 new slots on this build) returns 1,140 apps: all 390 owned games, and the 1,144 CM-licensed set minus 4 licences Steam no longer honours. The operator confirmed 2 of those demos show in GameLib but not in Steam. No GameLib CM logon. Superset of `GetOwnedGames` (F2P, DLC, tools), so filter by anonymous PICS type. Check `GetSteamID` against the stored account first. Live-add and Offline Mode not tested) | steam, macos, steamclient, licenses, ownership, refresh, no-cm, frontier |
| 081 | three-session-coexistence | standard | Given Mac Steam online + steam-user with a non-zero logonID + an authenticated steam-vent session on one account, when Refresh-shaped and depot-shaped calls run on both for ~10 min, then no `LoggedOff 34` on either and Mac Steam Friends stays signed in | ✓ VALIDATED (10 min, Mac Steam online and unwrapped + steam-vent ip 0 doing depot-key/request-code/CDN cycles (31/31) + steam-user logonID 81 doing getUserOwnedApps + PICS cycles (29/29): no kick on either, Mac Steam `BLoggedOn` 21/21 and connection_log silent. 077's non-zero-logonID fix holds at production shape, vent-first order) | steam, cm, steam-vent, steam-user, logonid, friends, coexistence, integration, live |
| 083 | adoption-signal-without-restart | standard | Given a GameLib-written ACF with Mac Steam running but signed out, when the helper polls the app's install state through `IClientAppManager` across the operator's sign-in, then GameLib observes adoption when Steam rescans, without a Steam restart | ✓ VALIDATED (WazHack 264160, GameLib 1026 ACF written while Steam signed out: at sign-in Steam reloads every appmanifest and reaches state 4 about 1 s after BLoggedOn, with no restart and no InstallApp. Steam did not hash files ("has no changes", 0 files committed, no Validation line), so the matching-manifest 1026 path is not a second integrity check. Restart hold becomes a sign-in hold, with an InstallApp fallback) | steam, macos, adoption, steamclient, restart-hold, integration, live |
| 085 | steam-vent-long-lived-session | standard | Given an authenticated steam-vent session held for hours, when the network drops, the Mac sleeps/wakes and the CM connection is lost, then the session is re-established and subscriptions resume — or the exact recovery GameLib must own is named | PENDING | rust, steam-vent, cm, reconnect, heartbeat, sleep, sidecar-retirement, frontier |
