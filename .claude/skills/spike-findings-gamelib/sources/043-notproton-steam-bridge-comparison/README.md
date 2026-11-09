---
spike: 043
name: notproton-steam-bridge-comparison
type: standard
validates: "Given NotProton (NotProtonNot/NotProton, Gcenx fork at c09e0c4), when its game-to-Steam path is read against GameLib's steam_api shim + out-of-process helper and against the DRM walls of spikes 035-041, then name the layer it intercepts, whether it plausibly clears the SteamStub/CEG walls without a Windows steam.exe, what GameLib could adopt under its licence and boundary, and its fragility points"
verdict: PARTIAL
related: [004a, 036, 037, 038, 039, 040, 041]
tags: [steam, macos, bridge, notproton, lsteamclient, proton, steamstub, ceg, drm, crossover, ntdll, boundary, research]
---

# Spike 043: NotProton vs the GameLib Steam bridge

## What This Validates

Given NotProton, when its game-to-Steam path is read against our bridge and against the DRM walls
of spikes 035–041, then answer: (1) which layer it intercepts and how far its coverage goes,
(2) whether its design gets past the SteamStub file check (040/041) and the CEG start handshake
(035–037) with no Windows `steam.exe`, (3) what GameLib could adopt, under GameLib's
`GPL-3.0-only` licence and the project's DRM boundary, and (4) where it is fragile.

Read-only and static, apart from one cheap check: fetching the hash-pinned Valve package NotProton
stages, to compare its `steamclient64.dll` with the one in the user's `GameLibSteam` bottle.
**NotProton was not installed or run.**

## Research

- **Source read:** `github.com/Gcenx/NotProton` (fork, HEAD `c09e0c4`, 2026-09-26, v1.0.1). The fork
  is a snapshot. **Upstream is `NotProtonNot/NotProton`**: v1.2.1 (2026-10-23), about 2.2k stars,
  39 open issues, a brew cask, and it now supports **Steam stable 1792618285 + CrossOver 26.3**.
  Those are exactly the versions on this machine (`lipo`/manifest checked). The fork's README still
  pins 1788652215/1790121765 + Preview 2026082.
- **Valve source cross-check:** `ValveSoftware/wine` branch `proton_9.0`,
  `dlls/ntdll/loader.c:2330-2423` (`use_lsteamclient`, `steamclient_setup_trampolines`).
- **Upstream issues read:** #245 (a Steam update broke launches; the cause was Rosetta missing after
  a macOS upgrade) and #113 (a Denuvo title: hangs under Rosetta, gets past Denuvo under FEX, then
  dies on DX12).
- **Prior art in this repo:** 004a rejected the in-process `lsteamclient` route as "blocked, no
  toolchain, Valve-scale". 036/037 hit the CEG wall and 040/041 the SteamStub wall.

## Investigation Trail

1. **Layout.** NotProton has two halves that are independent of each other:
   - **Steam-side** (`app/`, `dylib/`, `signatures/`): it adds `LSEnvironment.DYLD_INSERT_LIBRARIES`
     to **Steam.app's `Info.plist`**, re-signs the bundle ad hoc (`SteamInstaller.adHocSign`),
     and hooks `steamclient.dylib`/`steamui.dylib` by per-build byte signatures (`sigdb`, AOB
     fallback). All of that exists to switch on the inert Steam Play UI and compat-tool launch, so
     that Steam itself launches Windows games through a "CrossOver" compat tool
     (`dylib/feats/compat_run.sh`).
   - **Game-side** (`lsteamclient/`, `ntdll-patch/`, `steam-shim/`, `bridge/`): what runs inside
     the Wine process. **GameLib only cares about this half.** GameLib is already the launcher and
     doesn't need Steam's Steam Play UI.
2. **`lsteamclient`** is Valve's Proton `lsteamclient`, pinned to Proton commit `164e0ccd`
   (digest-checked), with three files of NotProton's own laid over it (`steamclient_main.c`,
   `unixlib.cpp`, `unix_steam_input_manual.cpp`). The unix half is a winelib `.so` that runs
   **inside the Wine process** and `dlopen`s
   `$STEAM_COMPAT_CLIENT_INSTALL_PATH/steamclient.dylib`, calling `CreateInterface`,
   `Steam_BGetCallback` and the rest directly (`unixlib.cpp:782-845`). The Mac `steamclient.dylib`
   is universal **x86_64 + arm64** (checked here), so the x86_64 slice maps into the Rosetta Wine
   process. They work around 004a's "no toolchain" blocker by building against a configured
   **CrossOver source drop** (`WINE_BUILD`, `lsteamclient/build.sh`) instead of the shipped runtime.
3. **The trampoline (`ntdll-patch/detour.c`).** A detour on Wine's `build_module` notices when
   `steamclient64.dll` is being mapped, loads `lsteamclient.dll`, and rewrites **every named export
   of steamclient64 that lsteamclient also exports, plus its entry point**, into `movabs rax; jmp
   rax` jumps to lsteamclient. It also sets `LDR_DONT_CALL_DLLMAIN`. `detour32.c` does the same
   for 32-bit. `resolve.py` finds the per-build patch sites in CrossOver's `ntdll` by pattern, and
   the patch goes onto a **cloned** CrossOver under `~/Library/Application Support/notproton/runners/`
   (the user's installed copy is left stock).
4. **Valve does the same thing.** Proton's own Wine `loader.c:2390-2398` matches `steamclient` /
   `steamclient64` by basename, loads `lsteamclient.dll` and calls `steamclient_setup_trampolines`.
   NotProton's binary patch adds Proton's loader step to CrossOver. It isn't a new trick.
5. **Which client DLL.** The `steamclient(64).dll` that NotProton stages isn't one it built. It's
   Valve's, taken from the **Linux** Steam client package `bins_misc_ubuntu12.zip.3f9281…`,
   sha256-pinned and fetched from Valve's CDN at install time, not redistributed (`bridge/fetch-valve.sh`,
   `valve-packages.manifest`). Cheap check: I fetched that package (sha256 `026b9847…` matched) and
   compared its `steamclient64.dll` (26,328,216 B, PE stamp 2026-09-03) with the user's
   `GameLibSteam` bottle copy (26,547,864 B, 2026-10-21). **Both are the stock Windows client**:
   the same build-path family (`steam_rel_client_win64` vs `…_hotfix_win64`), the same
   `Steam3Master` / `SteamStart_SharedMem*` strings, no `lsteamclient` string, and both carry a
   certificate table (11,416 B). So the Linux package simply ships a genuine, signed Windows client.
   It's the trampoline, not a special build, that sends its calls elsewhere.
6. **`steam-shim` (`steam.exe`)** is a port of Proton 9's `steam_helper` (BSD-3). For a game
   process it creates the `Steam3Master_SharedMemLock` event and
   `Global\Valve_SteamIPC_Class`, a hidden Steam window, and `ActiveProcess\pid`; points
   `ActiveProcess\SteamClientDll(64)` and `SteamPath` at `C:\Program Files (x86)\Steam\`; does
   `setup_steam_registry`, BattlEye/EAC bridge files and VR paths; launches the game; and runs
   `steam_drm_thread`. That thread is the **same** DIPC responder spike 036 built: it waits on
   `STEAM_DIPC_CONSUME`, sets `STEAM_START_ACK_EVENT_*`, releases `SREAM_DIPC_PRODUCE`, and does
   nothing more.
7. **Coverage compared with ours.** Ours is a generated PE `steam_api(64).dll` (≈36.6k lines,
   exports per game) that sends flat calls and C++-vtable calls over loopback TCP to a native
   `bridge_helper` holding `libsteam_api.dylib`. NotProton's sits one layer lower, at
   `steamclient`. The game's **own** genuine `steam_api.dll` runs unmodified and reaches
   `lsteamclient` through the client DLL, which carries Valve's generated thunks for **every
   interface version** of every interface, callbacks included. So nothing has to be generated per
   game, there's no export list to match, and there's no ABI drift between SDK versions.
8. **How this lines up with our DRM walls (inference, not run):**
   - **SteamStub (040/041).** 041 proved the stub accepts the genuine signed client file, and that
     the genuine client then fails on `Steam3Master_SharedMemLock` because nothing answers its
     Windows-Steam IPC. Under NotProton the genuine file is on disk (so the file check should pass),
     but its code never runs: the exports jump to `lsteamclient` before `DllMain`, so the
     `Steam3Master` path is never taken. The stub's ownership questions then reach the **genuine Mac
     Steam client** in-process. That's exactly the combination 041 called impossible ("no DLL both
     passes the check and reaches the native Mac client"). The answer is one DLL file with another
     DLL's code behind it.
   - **CEG (035–037).** 036 found the ACK isn't enough, and 037's probe client was never loaded.
     NotProton adds what 036's responder lacked (the `Steam3Master_SharedMemLock` event,
     `Valve_SteamIPC_Class`, the Steam window, `ActiveProcess\pid`) and has a genuine client in the
     slot. Whether XCOM gets further is **untested**. It also depends on whether the Mac
     `steamclient.dylib` services CEG's runtime calls, and 036's string survey found only
     install-time CEG code.
   - **Evidence that it works in practice:** upstream #113 reports a Denuvo title getting *past
     Denuvo* under FEX (it then failed on DX12, not on Steam). That's anecdotal, and there's no
     SteamStub or CEG title in the issue tracker either way.
9. **Fragility, from the code and the issues:**
   - The **Steam-side** half depends on Steam's build. It uses per-build signature databases, writes
     to Steam.app's plist and re-signs it ad hoc (every Steam self-update can undo or invalidate
     this), and the README lists the supported Steam builds. This is the part a Steam update breaks.
     GameLib doesn't need it.
   - The **`ntdll` patch** depends on CrossOver's build. Patch sites are derived per build
     (`resolve.py`, which mirrors the `WINE_MODREF` offsets `0x30`/`0x60`/`0x68`), supported runners
     are listed, and every CrossOver release needs re-deriving. This is the part GameLib *would*
     need.
   - **`lsteamclient.so`** has to be built against the same CrossOver source drop as the runner it
     loads into, and must be unsigned on x86_64 but signed on arm64.
   - The interface it relies on is stable: the public `CreateInterface`/`Steam_BGetCallback` exports
     of the Mac `steamclient.dylib` don't change from build to build.
10. **Licensing.** NOTICE: NotProton's own code is GPL-3 (fine for `GPL-3.0-only` GameLib).
    `steam-shim` is BSD-3 (fine). **`lsteamclient` is under the Steamworks SDK License**, not GPL,
    and it compiles against Steamworks SDK headers. It can only ship as a separately licensed
    component alongside GameLib, never linked into GameLib's GPL code. The **Valve client DLLs**
    aren't redistributed: they're fetched from Valve's CDN on the user's machine.

## Results

**PARTIAL.** The comparison question is answered from source and one binary check. Whether
NotProton's design actually clears our DRM walls on GameLib's stack is a strong, mechanism-backed
inference, but it hasn't been run.

| | GameLib bridge | NotProton |
|---|---|---|
| layer intercepted | `steam_api(64).dll` (game's import replaced) | `steamclient(64).dll` (genuine file, exports trampolined to `lsteamclient`) |
| process boundary | out-of-process: PE shim → loopback TCP → native `bridge_helper` → `libsteam_api.dylib` | in-process: PE → winelib unix call → Mac `steamclient.dylib` x86_64 slice mapped into the Wine process |
| coverage | generated per pinned SDK + per-game export set | Valve's generated thunks for every interface version; the game's own `steam_api` runs |
| Steam host | the user's running Mac Steam | the user's running Mac Steam |
| SteamStub file check | **fails** (040: unsigned forwarder) | genuine signed file on disk → **should pass** (041 proved it does) |
| after the check | n/a | client code never runs → no `Steam3Master` → calls reach Mac Steam (**untested**) |
| CEG | ACK accepted, then exits (036/037) | same ACK + the full `steam_helper` environment + genuine client in the slot (**untested**) |
| runtime cost | stock CrossOver, no patching | **cloned + binary-patched** CrossOver per build; `lsteamclient.so` built from a CrossOver source drop |
| Steam client changes | none | Info.plist `DYLD_INSERT` + ad-hoc re-sign (Steam-side half only) |

**What this changes:**

- **004a's "do not build lsteamclient on macOS" is out of date.** Someone has shipped it publicly
  and it's in use. The two blockers were the toolchain (solved by building against a CrossOver
  source drop) and Rosetta (solved by the x86_64 slice of the universal `steamclient.dylib`).
- **The CEG/SteamStub walls in 037/041 aren't fundamental.** They follow from using a Windows-Steam
  protocol. Valve's own Proton answers them with genuine client file + loader trampoline +
  `lsteamclient` + host Steam client, and NotProton ports exactly that.
- **The bottled-Steam stance is unchanged until a live run.** If spike 044 shows Grim Dawn or XCOM
  reaching its menu this way, the "DRM may justify bottled Steam" exception from 037/041 no longer
  holds, which is the stated goal ([[bottled-steam-is-narrow-fallback]]).

**What could be adopted, from cheapest to most expensive:**

1. **Idea only:** the steam-shim's game-process environment (the `Steam3Master_SharedMemLock` and
   `Valve_SteamIPC_Class` events, the Steam window, `ActiveProcess\pid`/`SteamPath`) as a delta on
   036's responder. It's BSD-3, cheap, and on its own probably still not enough for CEG (037).
2. **A second bridge mode at the `steamclient` layer for DRM titles only:** a cloned, patched
   CrossOver runner, plus `lsteamclient` (Steamworks-licensed, a separate component) and Valve's
   client DLLs fetched from the CDN. Our TCP `steam_api` bridge stays the default for DRM-free
   titles, because it needs no patched runtime.
3. **Wholesale replacement** of our bridge with lsteamclient. Not recommended: it makes every title
   depend on a per-CrossOver-build binary patch, which is the most fragile part of NotProton.

**Boundary questions for the user (not decided here):**

- Spike 040 listed "ship-genuine-DLL" as outside the boundary. NotProton doesn't ship it, it fetches
  Valve's file from Valve's CDN, and Valve's own Proton uses the same file the same way. Does
  fetching on the user's machine fall inside the boundary?
- Is rewriting the genuine client's exports **in memory** (Valve's Proton mechanism, not a change to
  the game) acceptable? The game's own files are never touched, so decision 4 of
  `per-game-compat-fixes-architecture.md` holds. Ownership is still decided by the genuine Mac Steam
  client.

## Next: spike 044 (proposed, not run)

Given Grim Dawn (219990, SteamStub) and XCOM EW (200510, CEG), when they run through an
lsteamclient path (genuine Linux-package `steamclient(64).dll` + trampoline + Mac
`steamclient.dylib`) with only native Mac Steam running, then see whether each reaches its menu.
There are two ways to run it:

- **(a) Use upstream NotProton as the oracle.** Install v1.2.1 and launch through Steam's compat
  tool. This is cheap, but it **modifies the user's Steam.app** (plist insert + ad-hoc re-sign).
  Upstream has an uninstall/revert.
- **(b) Reproduce only the game-side half** in a scratch bottle: build lsteamclient and patch a
  cloned CrossOver 26.3, leaving Steam.app untouched. That costs days, not hours.

## Artifacts

- No code. NotProton source was read from a scratch clone (not committed; GPL/Steamworks
  licensed). Pinned refs: Gcenx fork `c09e0c4`, Proton `164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca`,
  Valve package `bins_misc_ubuntu12.zip.3f92810725ee673827371a0470cd4f8c7ea8cfae`
  (sha256 `026b984726c728bbf81ae3ba16623bcd96e2bf837a859c235acf0ee279d940fd`).
- Machine state when read: Mac Steam client 1792618285, `steamclient.dylib` universal
  x86_64+arm64, CrossOver 26.3.
