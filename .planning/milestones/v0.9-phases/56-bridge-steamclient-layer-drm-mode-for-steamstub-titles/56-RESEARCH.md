# Phase 56: Bridge steamclient-layer DRM mode for SteamStub titles - Research

**Researched:** 2026-10-28
**Domain:** macOS native Steam bridge, second launch mode (Valve genuine `steamclient64.dll` + in-memory export trampoline to a GameLib-built `lsteamclient` + cloned/ntdll-patched CrossOver runner)
**Confidence:** MEDIUM overall. HIGH on codebase seams, Valve manifest/CDN, NotProton's runtime recipe. MEDIUM on the build toolchain. LOW on three things only a live run can settle (listed in Open Questions).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Where the parts come from**
- **D-01:** GameLib builds `lsteamclient` itself: the PE `lsteamclient.dll` and the winelib unix
  `.so`. It builds from Proton's `lsteamclient` at a pinned, digest-checked commit (NotProton pins
  `164e0ccd`) with NotProton's three overlay files (`steamclient_main.c`, `unixlib.cpp`,
  `unix_steam_input_manual.cpp`), against a configured CrossOver source drop, inside GameLib's own
  build tooling (the same family as `pnpm build-steam-bridge`). Do not consume NotProton's prebuilt
  release artifacts. Do not compile on the user's machine.
- **D-02:** `lsteamclient` is under the Steamworks SDK License, not GPL. It ships as a separately
  licensed component next to the app and is never linked into GameLib's GPL-3.0-only code. Planning
  must keep that separation visible in packaging and in a NOTICE.
- **D-03:** The ntdll redirect is a port of NotProton's GPL-3 `ntdll-patch` (`detour.c` and the
  `resolve.py` pattern finder) into GameLib's tree, applied by GameLib to the cloned runner. It is
  not a from-scratch rewrite of Proton's loader step. It covers x64 only, because all three targets
  are SteamStub 3.1 x64 (spike 040). `detour32.c` is not in scope.
- **D-04:** The Valve client package follows Valve's current client manifest at fetch time: read the
  manifest, download that package from Valve's CDN (`client-update.akamai.steamstatic.com`), and
  verify it against the manifest's own sha. Do not pin a package sha in GameLib. NotProton fetches
  from the Linux `bins_misc_ubuntu12` package, which carries the genuine signed Windows client
  (spike 043 step 5).
- **D-05:** Fetch lazily on the first DRM-mode launch, with a visible progress state, then cache it
  per user and reuse it. Nothing is downloaded for users who never launch a SteamStub title.
- **D-06:** Fetch the set spike 044 proved: `steamclient64.dll`, `tier0_s64.dll` and
  `vstdlib_s64.dll`.
- **D-07:** Port the game-process environment from NotProton's BSD-3 `steam-shim` (Proton
  `steam_helper`). That covers `Steam3Master_SharedMemLock`, `Global\Valve_SteamIPC_Class`, the
  hidden Steam window, `ActiveProcess\pid`, `ActiveProcess\SteamClientDll64` and `SteamPath`, and
  `setup_steam_registry`. Leave out `steam_drm_thread` (the DIPC/CEG responder): CEG is out of scope.
  Keep the HKCU-only rule from Phase 52 (`steamClientSetup.ts` header): HKLM `Software\Valve\Steam`
  diverts the game into `steam.exe -applaunch` (spike 036). If the ported helper needs an HKLM key,
  research must justify it against that finding.

**Runner and bottle**
- **D-08:** The runner is an APFS clone of the user's installed CrossOver, made under GameLib's
  app-support directory. The user's installed copy stays stock. The resolve.py port finds patch
  sites by pattern.
- **D-09:** The supported CrossOver versions are an explicit allowlist, because the `lsteamclient`
  `.so` must match the source drop's ABI. On a CrossOver version outside the allowlist, GameLib
  shows a notice naming the installed version and the supported versions, and does not launch. It
  never attempts the patch on an unlisted version.
- **D-10:** The clone is keyed to the CrossOver version and build. When they no longer match the
  installed CrossOver, the next DRM-mode launch makes a fresh clone, re-patches it and removes the
  old clone.
- **D-11:** A DRM-mode title runs in its existing per-title `GameLibSteamBridge-<appid>` bottle,
  which keeps its installed game and settled shared-redist ledger. That bottle runs under the
  patched runner, with GameLib's `steam_api` shim and the Phase 52 forwarder removed and the game's
  original `steam_api*.dll` restored (the `originalRestore.ts` mechanism). No re-install and no new
  bottle.

**Routing and failure**
- **D-12:** Every title whose launch exe scans as `drmWrapper: 'steamstub'` (`peSteamDrm.ts` `.bind`
  detection) routes to DRM mode automatically. There is no allowlist gate and no per-title override.
  Only these titles change routing. `peSteamDrm.ts`'s header comment ("`.bind` never changes
  routing") must be updated, because it is no longer true.
- **D-13:** When DRM-mode setup fails, GameLib logs a `[bridge-notice] appId=… reason=…` line, shows
  a notice that names the failed step and its cause, and does not launch. Failed steps include:
  - the CDN fetch or verify;
  - `lsteamclient` missing from the build;
  - an unsupported CrossOver;
  - clone or patch failure, including a patch site that isn't found;
  - Mac Steam not running.

  There is no fallback to the Phase 52 forwarder (it is known to fail the SteamStub check) and no
  reroute to bottled Steam.
- **D-14:** Remove the Phase 52 forwarder path once DRM mode covers every `.bind` title: the forwarder
  placement and registry in `steamClientSetup.ts`, `maybeNotifySteamStubForwarded`,
  `maybeNotifySteamStubUnforwarded` and their i18n keys, and the forwarder build output
  (`builtBridgeSteamClient64Path`). Do not keep dormant code. Tests that pin the forwarder are
  rewritten for DRM mode, not kept.

**Bridge-verified evidence in this mode**
- **D-15:** There is no GameLib shim, so there is no `HELLO shim attached`. Its replacement:
  GameLib's `lsteamclient` build logs one line, with the appId and pid, when the **game process**
  (not any GameLib helper) first reaches the Mac `steamclient.dylib` through the redirect
  (`CreateInterface`). This is the "ran through GameLib's mode" half of the criterion.
- **D-16:** For the "the game initialised Steam" half, a **game-originated** call beyond init (for
  example `GetSteamID` / `ISteamUser`), traced by GameLib's `lsteamclient`, counts. This mirrors
  D-53-13. A clean Steam-init line in the game's own log also counts where one exists. Calls that
  come from a helper never count. Mac Steam's In-Game status never counts.
  `SteamInternal_SetMinidumpSteamID … [API loaded no]` (spike 044's only Grim Dawn line) is
  pre-init and does not count.
- **D-17:** The live gate is Grim Dawn 219990: it reaches its menu with only Mac Steam running and
  meets D-15 and D-16. Raft 648800 and Ranch Simulator 1119730 get recorded results (verified /
  reached menu / fails at step X) but do not block the phase. Ranch Simulator's exit-53 variant
  (spike 040) may be unrelated.

### Claude's Discretion
- How the progress state for the first-launch fetch (D-05) appears in the UI. Reuse an existing
  launch-progress surface rather than inventing one.
- The cache location and layout for the fetched Valve DLLs and the cloned runner, within GameLib's
  app-support directory.
- How the D-15 and D-16 trace lines are written: the log file and format. They must be greppable by
  the census or verdict tooling (`bridgeVerdict.ts`).
- The order of setup steps inside a DRM-mode launch, and which steps are idempotent or cached.

### Deferred Ideas (OUT OF SCOPE)
- CEG titles through this mode, which would need `STEAMSTART` request servicing. Out of scope (spikes
  044/045). Spike 045's census found only 3 of 389 owned games hit the CEG wall on Apple silicon.
- x86 (32-bit) SteamStub titles (`detour32.c`). Defer until a 32-bit SteamStub title shows up.
- A per-title override that forces a title to the TCP bridge or to DRM mode. Declined for now in
  favour of automatic routing.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (ROADMAP: "Requirements: TBD"). Per the caller, D-01..D-17 are the requirements.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | GameLib builds lsteamclient (PE dll + unix .so) | "Build pipeline" section; NotProton `lsteamclient/{fetch,build}.sh`, `bridge/setup-wine-tree.sh`; Flag F3 (stock Wine 11.15 vs CX source drop) |
| D-02 | Separate Steamworks-licensed component + NOTICE | "Packaging and licence separation"; Flag F6 (notarization vs unsigned `.so`) |
| D-03 | Port ntdll-patch, x64 only | "ntdll patch" section; Flag F5 (resolve.py needs capstone, so dev-time) |
| D-04/D-06 | Follow Valve manifest, fetch 3 DLLs | "Valve client fetch" section; Flag F4 (one package, `steam_client_win64`) |
| D-05 | Lazy fetch with progress | "Progress surface" section |
| D-07 | Port game-process environment, HKCU-only | "Game-process helper" section; Flag F7 |
| D-08/D-09/D-10 | APFS clone, allowlist, version-keyed clone | "Runner clone" section |
| D-11 | Existing bottle, originals restored | "Bottle and original-DLL swap" section; Flag F2 |
| D-12/D-13 | Auto routing, fail closed | "Routing seam" section; Flag F10 |
| D-14 | Remove forwarder | "D-14 removal inventory"; Flag F9 |
| D-15/D-16/D-17 | Trace evidence, live gate | "Evidence design" section; Flag F1, F12 |
</phase_requirements>

## Summary

Spike 044 proved the mechanism with NotProton's *shipped* artifacts on this exact machine (CrossOver 26.3.0.39832, Mac Steam 1792618285). This phase re-creates NotProton's **game-side half only** inside GameLib's tree. I read NotProton's source (`NotProtonNot/NotProton` at `8db22ad`, the Gcenx fork at `c09e0c4`, and Proton) from the scratch clones, inspected the live runner NotProton left at `~/Library/Application Support/notproton/runners/crossover-26.3.0.39832/CrossOver`, and fetched Valve's manifests and package today. The runtime recipe is small and well understood. The riskiest part is the **build**: `lsteamclient` has to be compiled as a Wine builtin, which needs a configured Wine source tree with Wine's own `winebuild`/`makedep` tools plus mingw-w64. Nothing in GameLib builds that today.

Several CONTEXT premises are refined or contradicted by the evidence (F1..F12 below). The most consequential: (F3) NotProton's *current* upstream builds `lsteamclient` against **stock Wine 11.15**, not a CrossOver source drop, and the 044-proven artifacts came from that; a CrossOver 26.3 source drop does exist and is downloadable, so D-01 is feasible, but it is unproven. (F6) A bundled, notarized app cannot carry an *unsigned* x86_64 Mach-O `lsteamclient.so` under `Contents/Resources`, because the release workflow signs every Mach-O there and Wine builtins fail to load once codesigned. (F4) One Valve package, `bins_win64` from the `steam_client_win64` manifest, contains all three D-06 DLLs, so D-04 needs one download, not two. (F2) `originalRestore.ts` does not put originals back in place; a new swap step is needed.

**Primary recommendation:** Plan this as four layers built in this order: (1) pure TS units (manifest parse, fetch/verify/extract, ntdll table-apply, CrossOver build detection, mode routing, trace parsing) with full jest coverage; (2) the native build (lsteamclient + payload + game-process helper) behind `pnpm build-steam-bridge`, gated by an early build-feasibility task; (3) launch wiring in `games.ts` plus D-14 removal; (4) the Grim Dawn live gate. Run the native build feasibility task first, because it can invalidate D-01's exact shape.

## Architectural Responsibility Map

GameLib is a Tauri shell with a Node sidecar. Tiers here are the sidecar, the Wine process, and external sources.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route decision (`.bind` => DRM mode) | Sidecar (`games.ts` launch path) | `bridge/` pure helper | Decided from the exe PE sections before any shim placement |
| Valve manifest read, package download, sha verify, extract | Sidecar | Valve CDN | Mirrors `knownFixOverlayInstall.ts` (axios, abort handler, unref'd deadline, temp dir, atomic move) |
| Runner clone + ntdll patch | Sidecar (pure TS applier, `cp -c` clone) | Build tooling (derives the table) | Runtime applies a pinned table; pattern-finding is dev-time |
| lsteamclient, payload, helper build | Build tooling (`meta/`) | CI macOS leg | Never on the user's machine (D-01) |
| Registry + events + window for the game process | Wine process (GameLib-authored helper exe) | lsteamclient export `steamclient_init_registry` | Named kernel objects must outlive setup, so the helper stays as the game's parent |
| Genuine-client trampoline | Wine process (patched ntdll + payload) | | Rewrites `steamclient64.dll` exports at map time |
| Talking to Mac Steam | Wine process (lsteamclient `.so` => `steamclient.dylib` x86_64 slice) | Mac Steam (external, must run) | In-process, no GameLib helper |
| Evidence trace (D-15/D-16) | lsteamclient PE half writes a file | Sidecar re-logs it; `meta/bridgeCensus.ts` classifies | Independent of `WINEDEBUG` and of how Wine stderr is captured |
| Progress and failure notices | Sidecar (`sendGameStatusUpdate`, `notify`, `showDialogBoxModalAuto`) | Frontend (existing status rendering) | Reuse, no new UI |

## Standard Stack

### Core (runtime, all already in the repo)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@node-steam/vdf` | ^2.2.0 | Parse Valve's client manifest (VDF) | Already the frozen Steam-stack choice [VERIFIED: package.json, CLAUDE.md] |
| `axios` | ^1.20.0 | Manifest and package download | Frozen stack; `knownFixOverlayInstall.ts` reaches it via lazy import [VERIFIED: package.json] |
| Node `crypto` + `fs` | node22 | Streamed sha256 of the 64 MB zip | Same as `hashFile()` in `knownFixOverlayInstall.ts` [VERIFIED: codebase] |
| `/usr/bin/unzip` | macOS built-in | Extract three named entries from the zip | NotProton's own `fetch-valve.sh` does this; no new npm dependency [VERIFIED: `ls /usr/bin/unzip`] |
| jest 29 + ts-jest | ^29.7 | Unit tests (`backend` and `meta` projects) | Existing infra [VERIFIED: jest.config.js] |

### Build-time only (not shipped)
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| mingw-w64 (`x86_64-w64-mingw32-gcc`) | 14.0.0 (Homebrew) | Wine's PE-side cross compile; detour payload | NOT installed on this machine; macOS CI runner needs `brew install` [VERIFIED: `brew info`] |
| bison >= 3 + flex | bison 3.8.2 (Homebrew) | Wine tree tools | System bison is 2.3, too old; NotProton's setup script prepends `/opt/homebrew/opt/bison/bin` [VERIFIED: `bison --version`] |
| Wine source (pinned) | `wine-11.15` @ `2df1ee28039cf84776eb1421ed90bd154cebb65f` OR CrossOver 26.3.0 source | `winebuild`, `makedep`, headers, `ntdll.so` to link `lsteamclient.so` | See Flag F3 [CITED: NotProton `bridge/setup-wine-tree.sh`] |
| Proton `lsteamclient` @ `164e0ccd2ea2b1ec2e5d08dc97f65b184c2539ca` | n/a | Valve-generated thunks for every interface version | Digest-checked: tree sha `b286df1d…657bf` [CITED: NotProton `lsteamclient/fetch.sh`] |
| zig 0.16.0 (`.build-tools/zig`) | 0.16.0 | Compile the game-process helper (pure Win32 C) with `zig cc -target x86_64-windows-gnu` | Already used for the shims [VERIFIED: `zig version`] |
| Python 3 + `capstone` 5.0.9 | 5.0.9 | Dev-only: derive the per-build ntdll patch table (`resolve.py`) | NOT a runtime or CI dependency [VERIFIED: `pip3 index versions capstone`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `/usr/bin/unzip` child | In-Node zip central-directory reader (`zlib.inflateRaw`) | Avoids a spawn site (matches the overlay installer's "no child process" stance) but is hand-rolled parsing of untrusted input. Choose `unzip` with explicit entry names into a temp dir (no zip-slip: only three fixed names are extracted). |
| Compile lsteamclient against stock Wine 11.15 | CrossOver 26.3.0 source drop (D-01 as written) | 11.15 is the configuration the 044-proven NotProton artifacts came from. The CX drop matches the runner exactly but is untested. See F3. |

**Installation (build host only):**
```bash
brew install mingw-w64 bison   # flex is system-provided
# dev-only, when adding a new allowlisted CrossOver build:
python3 -m venv /tmp/np-resolve && /tmp/np-resolve/bin/pip install capstone==5.0.9
```
No new npm packages are required by this phase.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none new on npm) | n/a | n/a | n/a | n/a | n/a | Phase adds no npm dependency |
| `capstone` (dev-time tool) | PyPI | 10+ yrs | high | github.com/capstone-engine/capstone | not run [ASSUMED] | Dev-only, `pip index versions` confirms 5.0.9. Never ships; planner gates install behind `checkpoint:human-verify` only if the plan installs it in CI |
| `mingw-w64` | Homebrew core | mature | n/a | sourceforge.net/projects/mingw-w64 | n/a | Official brew formula [VERIFIED: `brew info`] |

**Packages removed due to slopcheck [SLOP]:** none. **Packages flagged [SUS]:** none. slopcheck was not run because no npm package is installed; `capstone` is tagged `[ASSUMED]` for provenance and used only by a developer-run script.

## Architecture Patterns

### System Architecture Diagram

```
Play (SteamGame.launch, games.ts:2769)
  -> launchBridgeGame (games.ts:3045)
       resolveBridgeLaunchExe -> bridge bottle ready? -> exe exists?          [existing gates]
       detectDrmWrapper(exe)  (shimGenerate.ts:487, .bind)  ---- 'none' --->  existing TCP path
            |                                                                  (placeShimForGame ... helper ... fireBridgeWineLaunch)
            | 'steamstub'   (BEFORE placeShimForGame, so the shim is never re-placed)
            v
  DRM-mode setup (every step returns a typed result, never throws)
    0. CEG exe? -> existing refusal path (CEG stays out of scope)
    1. Mac Steam running?                         -- no  -> [bridge-notice] reason=drm-steam-not-running, STOP
    2. CrossOver build detect (Info.plist CFBundleVersion) vs ALLOWLIST
                                                  -- no  -> notice names installed + supported, STOP
    3. Runner: clone present for this build? else `cp -c -R` the CX_ROOT,
       verify clean ntdll sha, apply table patch, install lsteamclient.{dll,so},
       re-sign loader (+dyld entitlement), prune old clone      [progress: 'redist' status + context]
    4. Valve client cached? else manifest -> bins_win64 zip -> sha2 verify -> unzip 3 DLLs -> cache [progress]
    5. Originals: swap each shim steam_api*.dll for its .gamelib-orig (fetch backup via
       restoreBridgeSteamApiOriginals if missing); remove gamelib_bridge.cfg
    6. Stage into the bottle's  C:\Program Files (x86)\Steam\ :
       steamclient64.dll, tier0_s64.dll, vstdlib_s64.dll, lsteamclient.dll, gamelib steam.exe (helper)
    7. Known fixes, shared redists, DLL overrides (existing fireBridgeWineLaunch pieces)
    8. runWineCommand with wineVersion = {clone bin}, env: SteamGameId, SteamAppId,
       STEAM_COMPAT_CLIENT_INSTALL_PATH=<Mac Steam MacOS dir>, WINEDLLOVERRIDES, GAMELIB_DRM_TRACE_FILE
       command: C:\Program Files (x86)\Steam\steam.exe  <game.exe>

  Inside the Wine process (patched ntdll, clone runner):
    helper steam.exe: events + window + HKCU ActiveProcess + steamclient_init_registry -> spawns game.exe, stays as parent
    game.exe: SteamStub reads ActiveProcess\SteamClientDll64 -> loads genuine steamclient64.dll (file check passes)
              ntdll detour (build_module) maps it, rewrites its named exports to lsteamclient jumps, entry => `mov eax,1; ret`
              game steam_api64 -> CreateInterface -> lsteamclient PE -> lsteamclient.so -> dlopen steamclient.dylib (x86_64 slice)
              -> Mac Steam over its local IPC
    lsteamclient logs [drm-trace] lines (role=game|helper) to GAMELIB_DRM_TRACE_FILE

  After exit: sidecar re-logs trace lines into the app log; meta/bridgeCensus.ts classifies evidence.
```

### Recommended Project Structure
```
src/backend/storeManagers/steam/bridge/drm/        # NEW, all pure TS with injected deps
  steamclientLayerMode.ts      # resolveBridgeMode(drmWrapper): 'tcp' | 'steamclient-layer' + notice reasons
  valveClient.ts               # manifest parse, package fetch, sha verify, unzip, cache layout
  runnerClone.ts               # CrossOver build detect, allowlist, cp -c clone, verify, prune
  ntdllPatch.ts                # table-driven applier (port of NtdllPatcher.swift / apply.py)
  ntdllPatchTable.ts           # generated/committed: per-build hook/cave/stolen/sha pins
  stageDrmBottle.ts            # swap originals, stage DLLs, registry (adapted from steamClientSetup.ts)
  drmTrace.ts                  # parse [drm-trace] lines (shared with meta/bridgeCensus.ts, zero imports)
native/steam-bridge/steamclient-layer/             # NEW, Steamworks-licensed component, own LICENSE + NOTICE
  lsteamclient/ (overlay files + gamelib trace additions + fetch/build scripts)
  ntdll-patch/  (detour.c, shim.S, link.ld, GPL-3, ported)
  helper/       (steam.exe port, BSD-3, pure Win32)
meta/buildSteamClientLayer.ts                      # wired from buildSteamBridgeShims.ts main()
meta/ntdllResolve/                                 # dev-only vendored resolve.py + README (GPL-3)
```

### Pattern 1: Table-driven ntdll patch (what NotProton actually does at runtime)
**What:** NotProton's runtime patcher (`NtdllPatcher.swift`) does not search. It has a per-CrossOver-build table and applies it after hash checks. `resolve.py` is a development tool ("The real patcher lives in the app. `apply.py` is the original Python version, kept for validating patches against new CrossOver builds") that uses **capstone** to disassemble `build_module` in `ntdll.dll`. [CITED: NotProton `ntdll-patch/apply.py` header, `NtdllPatcher.swift`]
**When to use:** always at runtime. A TS port of the *applier* is about 150 lines of PE-header and byte work with no disassembler.
**Verified table row for this machine** (CrossOver 26.3.0.39832, x86_64-windows), all from NotProton's tables and cross-checked against the live runner:
- clean ntdll sha256 `6dff64c00793ce92124f1316985c63783f539f26b392975c70f57637458d2387` (equals this machine's `/Applications/CrossOver.app/.../x86_64-windows/ntdll.dll`; verified with `shasum`)
- patched ntdll sha256 `c0e21a9a5250f0a97c08d3c3e1798566255387213e2553b1e555264fb9ded97e` (equals the live runner's patched file; verified)
- hook RVA `0x44972`, stolen bytes `4883bc24f000000000` (9 bytes: `cmp qword ptr [rsp+0xf0], 0`), resume `0x4497b`, WM register `r14`, load_path slot `[rsp+0xd0]`
- placement `section`: append a `.npdet` section (size 0x1000, flags 0x60000020) at image end RVA `0xae000`; image base `0x170000000`
- payload `detour2-cx26.bin`, sha256 `e35b834408599c45f30b23a6d2bf38acfa5c3df4d15206617c471e23a4a01bfb`
- exports used by the payload: `LdrGetDllHandle 0x170014bc0`, `LdrLoadDll 0x170015680`, `NtProtectVirtualMemory 0x17000f380`
[CITED: NotProton `NtdllPatcher.swift` + `ntdll-patch/resolve.py` PINNED table]

**Example (applier outline, ported from `NtdllPatcher.apply`):**
```typescript
// Source: NotProton app/Sources/NotProtonApp/Model/NtdllPatcher.swift (GPL-3, port per D-03)
export function applyNtdllPatch(image: Buffer, patch: NtdllPatchRow, payload: Buffer): Buffer {
  validateHeaders(image, patch)                      // machine, magic, imageBase
  const bytes = Buffer.from(image)
  const grown = patch.placement === 'section' ? appendSection(bytes, patch) : bytes
  // cave must be all `cavePad` bytes (refuses an already-patched or wrong-build file)
  // each hook site must equal `stolen` before E9 rel32 + 0xCC padding is written
  // payload length must fit `caveSize - (payloadRVA - caveRVA)`
  return grown
}
// verify sha256(result) === patch.patchedSha256 BEFORE writing the clone file
```

### Pattern 2: Typed-result setup steps (existing convention)
Every step returns `{ status: 'ok' | 'unavailable' | 'error', ... }`, never throws into launch (see `steamClientSetup.ts`). Reuse the `REG_ADD_TIMEOUT_MS` unref'd-timer race pattern for every spawned child.

### Pattern 3: Overlay-style verified download
Copy `src/backend/knownFixOverlayInstall.ts` almost verbatim for `valveClient.ts`: `createAbortController`, an unref'd deadline timer, a temp dir, verify, then atomic rename into `<appFolder>/steam-bridge/drm/valve-client/<manifest-version>/`. It must not import `backend/launcher` or `backend/utils` statically (module cycle; the overlay installer documents this).

### Anti-Patterns to Avoid
- **Runtime pattern-finding on an unlisted CrossOver.** D-09 forbids it, and it needs a disassembler. Allowlist plus sha pins only.
- **Writing the patched ntdll over the user's CrossOver.** Patch only the clone, and keep `ntdll.dll.notproton-orig`-style clean copy (the runner needs it to re-derive).
- **Placing the shim first and swapping back.** `placeShimForGame` runs at the top of `launchBridgeGame` (games.ts:3121) and re-places the shim every launch. Branch on `.bind` before it.
- **Using Wine stderr/`WINEDEBUG` as the evidence channel.** `fireBridgeWineLaunch` passes no `logWriters` (games.ts:3547), and the default is `err+all,fixme-all`.
- **Signing `lsteamclient.so`.** x86_64 Wine builtins fail to load once codesigned [CITED: NotProton `lsteamclient/build.sh` comment].

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interface-version thunks for the whole Steamworks API | Per-game shim/export generation | Valve's `lsteamclient` at the pinned commit | 3,133 generated files; this is the point of the mode |
| Export trampolining | A new loader hook design | NotProton's `detour.c` + `shim.S` (ported) | Mirrors Proton's `steamclient_setup_trampolines` |
| `setup_steam_registry` (UI language, `Apps\<id>`, locale) | Re-implement in the helper | `lsteamclient.dll` export `steamclient_init_registry`, called via `LoadLibraryW(L"lsteamclient")` + `GetProcAddress` | This is exactly what current Proton `steam_helper/steam.c:205-222` does [CITED: Proton `steam_helper/steam.c`]; removes the need for Steamworks headers in the helper |
| Atomic verified download | Ad-hoc `fs` code | Pattern from `knownFixOverlayInstall.ts` | Abort handler, deadline, temp dir, symlink refusal already solved |
| Mac Steam running check | New `pgrep` code | `isSteamRunning` dependency in `macSteamOffline.ts:165` (`pgrep -x steam_osx`) | Existing, injectable |
| Bottle path to `C:\` mapping | New mapper | `toBottleWindowsPath` in `steamClientSetup.ts` | Already contained-path checked |
| Valve signature checking of the manifest | Custom RSA verify | None in v1: trust TLS + the manifest's `sha2` | See Pitfall 9 and Security Domain |

## Runtime State Inventory

Not a rename phase. For the "swap shim back for the original" step, the stored state is:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `steam_metadata.json` `<appId>.bridge.scan` (incl. `drmWrapper`, `originalFingerprints`) | None for correctness. D-14's export-set bump (F9) auto-clears scans once, which is the designed path (D-51-07) |
| Live service config | None | None, verified: no external service holds a GameLib bridge name |
| OS-registered state | None | None |
| Secrets/env vars | None new | None |
| Build artifacts | Installed `public/bin/arm64/darwin/steamclient64.dll` (forwarder) in dev trees; `native/steam-bridge/steamclient/` | Delete source, build code and any stale built copy |
| Bottle contents | Per-title bottle `GameLibSteamBridge-<appId>`: placed shim `steam_api(64).dll`, `*.gamelib-orig`, `gamelib_bridge.cfg`, forwarder `steamclient64.dll` beside the exe, `HKCU\...\ActiveProcess\SteamClientDll64` pointing at the forwarder | DRM launch must swap originals back, delete `gamelib_bridge.cfg` and the forwarder, and rewrite the registry value to the genuine DLL (code edit AND data migration; both belong in the plan) |

## Common Pitfalls

### Pitfall 1: `lsteamclient.so` signed or quarantined
**What goes wrong:** Wine refuses to load a codesigned x86_64 builtin; copying from `/Applications` can add `com.apple.quarantine`/`com.apple.provenance` xattrs that NotProton scrubs after the clone (`scrubDownloadMarkers`).
**How to avoid:** `codesign --remove-signature` on install (as `build.sh --install` does), never sign the `.so`, `xattr -r -d` both markers on the clone.
**Warning signs:** `err:module:load_so_dll` or the game exiting at the first `CreateInterface`.

### Pitfall 2: Loader entitlement on the clone
**What goes wrong:** NotProton's `RunnerPatcher.grantLoaderEntitlement` re-signs each unix loader ad hoc, adding `com.apple.security.cs.allow-dyld-environment-variables`. The stock `x86_64-unix/wine` has `allow-unsigned-executable-memory`, `disable-executable-page-protection`, `disable-library-validation`, audio and camera, but not the dyld one (verified with `codesign -d --entitlements`); the live clone has it. CONTEXT does not mention this step.
**How to avoid:** include "re-sign loader with the original entitlements plus the dyld one" in the clone step, copy the clean loader aside first, and verify `codesign -d --entitlements` afterwards. Whether GameLib needs it is unproven (it may be what lets `DYLD_*` reach Mac Steam's dylib dependencies), so keep it for fidelity with 044.

### Pitfall 3: Patching a file that is not the build it claims
The applier must check clean sha before and patched sha after, the cave padding, and the stolen bytes. A wrong-build ntdll corrupts the runner silently otherwise.

### Pitfall 4: Wine prefix refresh
The bottle was created by stock CrossOver. Running it under a patched clone of the same build should not trigger a prefix update, but this is unverified for GameLib's `CX_BOTTLE` wrapper path (NotProton runs the raw loader against a `WINEPREFIX`, not the Perl `bin/wine` wrapper). Test early.

### Pitfall 5: CrossOver detection by path
`resolveCrossoverBinDirAsync` (crossoverLocation.ts) finds the bin dir; the build comes from `<app>/Contents/Info.plist` `CFBundleVersion` (`26.3.0.39832` here; verified with `defaults read`). The clone is of `<app>/Contents/SharedSupport/CrossOver` (929 MB), not the whole `.app`.

### Pitfall 6: Cross-volume clone
`cp -c` only clones on the same APFS volume. If it fails NotProton falls back to a full `cp -R` (about 1 GB). Do the same and log which happened.

### Pitfall 7: `tauri dev` does not rebuild the sidecar
[VERIFIED: memory] Live-test only after restarting dev and checking `sidecar.js` mtime. Also a fresh worktree needs `build:sidecar-sea` and `build-steam-bridge` first.

### Pitfall 8: Name collisions in the repo
`src/backend/storeManagers/steam/clientSetup.ts`, `SteamClientSetup.tsx`, `state/SteamClientSetup.ts` are the **Steam client install wizard**, unrelated to the forwarder's `bridge/steamClientSetup.ts`. D-14 touches only `bridge/steamClientSetup.ts`.

### Pitfall 9: The manifest is trusted over TLS only
Valve's manifest carries a `kvsignatures` RSA signature block that the Steam client verifies. D-04 specifies "verify against the manifest's own sha", which protects against a corrupted download but not a compromised CDN manifest. Pin the host list to Valve's three bases, require `https`, and record this limitation. Do not invent a signature scheme.

### Pitfall 10: Lsteamclient initialises in the helper too
The overlay's `steamclient_init_registry` (unixlib.cpp:709-727) calls `p_CreateInterface("SteamClient017")` in whichever process invokes it, i.e. the GameLib helper. A naive "CreateInterface was logged" line would pass for the helper. D-15 must be role-tagged (see Evidence design).

## Code Examples

### Valve client manifest (verified live today)
`GET https://client-update.akamai.steamstatic.com/steam_client_win64` returns VDF:
```
"win64"
{
	"version"		"1792618285"      # equals the installed Mac Steam client build on this machine
	"ostype"		"win10"
	...
	"bins_win64"
	{
		"file"		"bins_win64.zip.1f91da2609327de9658146b01307e89a13cc1ef8"
		"size"		"64309479"
		"sha2"		"f34b0d5924d0cca4c81775ed2fef0aee1ca060e2daa5c24270711267786c0236"
		"zipvz"		"bins_win64.zip.vz.4a74…_35488701"      # Valve-compressed variant; ignore
		"sha2vz"	"…"
	}
```
Then `GET <base>/bins_win64.zip.1f91da26…`; I downloaded it (6.8 s) and `shasum -a 256` equals `sha2`. It holds `steamclient64.dll` 26,547,864 B, `tier0_s64.dll` 887,960 B, `vstdlib_s64.dll` 487,576 B as **flat** entry names (all 21 Oct 2026). `steamclient64.dll` is byte-identical to the one in `bins_misc_ubuntu12`. Fallback bases (identical bytes per NotProton): `https://steamcdn-a.akamaihd.net/client`, `https://media.steampowered.com/client`. [VERIFIED: live fetch 2026-10-28]

```typescript
// Parse with the frozen-stack library; select ONLY the `bins_win64` node, never iterate/extract everything.
import { parse } from '@node-steam/vdf'
const m = parse(text) as { win64: { version: string; bins_win64: { file: string; sha2: string; size: string } } }
// require /^bins_win64\.zip\.[0-9a-f]{40}$/ for `file`, /^[0-9a-f]{64}$/ for `sha2`, size within a sane cap (e.g. 200 MB)
```

### Staging recipe (what NotProton's `compat_run.sh` does, verified against the live prefix logic)
Into the prefix's `C:\Program Files (x86)\Steam\`: `steamclient64.dll`, `tier0_s64.dll`, `vstdlib_s64.dll`, `lsteamclient.dll` (the x86_64 PE, flat, as the 64-bit load trigger), and the helper as `steam.exe`. Into the clone: `lib/wine/x86_64-windows/lsteamclient.dll`, `lib/wine/x86_64-unix/lsteamclient.so`, patched `lib/wine/x86_64-windows/ntdll.dll`. Environment:
```
WINEDLLPATH=<prefix Steam dir>:<clone x86_64-windows>:<clone x86_64-unix>
WINEDLLOVERRIDES=steamclient=n;steamclient64=n;lsteamclient=b
STEAM_COMPAT_CLIENT_INSTALL_PATH=~/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS   # holds steamclient.dylib
SteamGameId=<appId>  SteamAppId=<appId>      # the helper only does game-process setup when SteamGameId is set
WINEDEBUG=err+all,fixme-all
# launch:  wine "C:\Program Files (x86)\Steam\steam.exe" "<game exe>"
```
[CITED: NotProton `dylib/feats/compat_run.sh` lines 1551-1675]. Note NotProton passes the raw `WINELOADER` with `WINEPREFIX`; GameLib passes `CX_BOTTLE` through `bin/wine` (launcher.ts:1198). Whether the Perl wrapper preserves `WINEDLLPATH` and `WINEDLLOVERRIDES` is an unverified difference; the registry value `SteamClientDll64` is a full path, so `steamclient64.dll` itself does not depend on `WINEDLLPATH`.

### Registry plumbing to adapt (steamClientSetup.ts)
Keep `buildSteamClientRegistryCommands` shape (argv arrays, `/f`, HKCU only, `Universe=Public`) and add `SteamPath`. Point `SteamClientDll64` at the **genuine** `C:\Program Files (x86)\Steam\steamclient64.dll`. The helper also writes `ActiveProcess\pid` and `SteamPath` itself at game start, so GameLib's own `reg add` only needs to cover what must exist before the helper runs, or can be dropped in favour of the helper.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 004a: "don't build lsteamclient on macOS" | NotProton ships it publicly and 044 proved it live | 2026-10-27 | `.claude/skills/spike-findings-gamelib/references/macos-steam-bridge.md` lines 14 and 75 still say "do NOT pursue lsteamclient" and are now stale; update them in this phase |
| Phase 52 forwarder `steamclient64.dll` | Genuine Valve file in the slot, behaviour redirected in memory | Phase 56 | Forwarder fails SteamStub's module check (040/041) |
| NotProton fork builds on a "CrossOver 11.0 source drop" (spike 043) | Upstream `8db22ad` builds on stock Wine 11.15 (`setup-wine-tree.sh`) | between c09e0c4 and b2f49e4 | Affects D-01; see F3 |
| Upstream `steam-shim` ACK bug (`OpenEventW(SYNCHRONIZE)`) | Fixed upstream at `8db22ad` "Open the start ACK event with EVENT_MODIFY_STATE" | 2026-10 | Irrelevant to GameLib: no DIPC responder (D-07) |

**Deprecated/outdated:** the CONTEXT pointer to `NotProton's three overlay files` is correct for the Gcenx pin `164e0ccd`. Upstream HEAD has a `serialized005.patch` and a `steamworks_sdk_165x` directory the fork lacks. Pin to one revision and record it; do not mix.

## Flags: findings that refine or contradict CONTEXT

**F1. `bridgeVerdict.ts` is not the evidence parser.** It is the persisted route and scan store. The strict "bridge verified" classifier is `meta/bridgeCensus.ts`: `classifyBridgeEvidence` (line 982), `appLogSegmentFor` (846), `helloRegex` (827), `findGameCalls` (888), `findGameInit` (928). It anchors on a `HELLO shim attached appid=…` line from the *helper* (`bridge helper [<appid>]:` prefix). DRM mode has no helper, so every title in this mode currently reads `unverified (no HELLO)`. Plan a DRM branch there. `bridgeVerdict.ts` only needs the existing `drmWrapper` field.

**F2. `originalRestore.ts` does not restore originals into place.** It fetches the depot original into a staging dir and writes it ONLY as `<shim>.gamelib-orig`; it never touches the live shim (file header lines 1-9). D-11's "restore the original `steam_api*.dll`" therefore needs a new step: for each runtime steam_api DLL where `isGameLibShimBytes` is true, ensure `.gamelib-orig` exists (call `restoreBridgeSteamApiOriginals` if not), verify it with `probeOriginalBackup`, then rename it over the live file. Spike 044's `stage.sh` did exactly this with `mv` on a clone. Reuse `findRuntimeLoadedSteamApiDlls`, `isGameLibShimBytes`, `probeOriginalBackup`, `isContainedWithin`. Also delete `gamelib_bridge.cfg` (game dir, and `compat/`, `x64/` copies), and remove the forwarder `steamclient64.dll`.

**F3. D-01 says "CrossOver source drop"; NotProton upstream now uses stock Wine 11.15.** `bridge/setup-wine-tree.sh` (upstream `8db22ad`): "CrossOver doesn't ship winegcc or winebuild … Uses stock Wine 11.15, the version CrossOver is based on", tag `wine-11.15`, commit `2df1ee28039cf84776eb1421ed90bd154cebb65f`, configured `--enable-archs=i386,x86_64 --without-freetype --without-x` with `CC="clang -arch x86_64"`. The installed CrossOver 26.3 reports Wine 11.0 (`strings ntdll.so`: `11.0`; CrossOver release notes: "CrossOver 26 includes Wine 11.0"). So the artifacts spike 044 ran (built by NotProton's pipeline, timestamped 2026-10-24) were built against Wine 11.15 headers and `ntdll.so` yet ran on CrossOver's 11.0 runner. That means the `.so` ABI tolerance is wider than D-09's rationale assumes, but the evidence cannot say how wide. A CrossOver 26.3.0 source drop does exist: `https://media.codeweavers.com/pub/crossover/source/crossover-sources-26.3.0.tar.gz` (HTTP 200, 149,054,023 bytes, last-modified 2026-07-21) [VERIFIED: curl]. **Recommendation:** make "build `lsteamclient` against the CX 26.3.0 drop and diff its behaviour on Grim Dawn" the first native task. If the CX drop will not configure or link, fall back to the stock Wine 11.15 recipe (the 044-proven configuration) and amend D-01 with the user. Either way keep D-09's allowlist: it is required by the ntdll patch regardless of the `.so`.

**F4. One Valve package, not two.** D-04/D-06 is simplest as: manifest `steam_client_win64` (stable; version `1792618285` equals this Mac's Steam), node `bins_win64`, which holds all three DLLs (verified above). `bins_misc_ubuntu12` (named in D-04) has only `steamclient64.dll` (no `tier0_s64.dll`/`vstdlib_s64.dll`); NotProton gets tier0/vstdlib from a separate `bins_win64` pin. The current `steam_client_ubuntu12` manifest also lists a *different* `bins_misc_ubuntu12` hash (`…f8ced8ce…`, sha2 `81cead84…`) than NotProton's pin (`…3f928107…`), which shows why D-04 follows the manifest rather than pinning. Use `steam_client_win64`, not `…_publicbeta_…` (beta is 1793056502, ahead of Mac stable). Open question O2: the live package is the 21 Oct 2026 client; 044 ran the 3 Sep 2026 client. The genuine DLL's code is not executed (exports are trampolined, entry replaced), so a drift risk is low but unproven.

**F5. `resolve.py` needs capstone; the runtime patcher does not.** `resolve.py` imports `capstone` and walks disassembly of `build_module` (finds it through string refs to `"build_module"`/`"alloc_module"` plus `.pdata`, takes the single `call alloc_module`, steps over `test rax,rax / mov reg,rax / je`, hooks the next instruction, then proves the `load_path` stack slot is stable). A pure-TS port would need an x86-64 decoder. Use the split in Pattern 1: dev-time vendored `resolve.py` (x86_64 path only, about 100 lines of `resolve_amd64` + `amd64_load_path` + PE helpers) produces a committed table; build step compiles `detour.c` + `shim.S` with the table's values into a payload and checks its pinned sha; runtime TS applier consumes only the table. D-08's "finds patch sites by pattern" is satisfied at dev time; document that adding a CrossOver build is a developer procedure. I did not execute any NotProton code; this is from reading it.

**F6. Notarization versus an unsigned Mach-O.** `release-tauri.yml` runs `pnpm sign:macos-resources --dir build/bin/arm64/darwin`, signing every Mach-O there with Developer ID + hardened runtime + timestamp, because notarization failed on 253 unsigned/ad-hoc files (meta/signMachOResources.ts header). The x86_64 `lsteamclient.so` must be **unsigned** (Wine builtins fail to load once codesigned). Placing it as a loose file in `build/bin/arm64/darwin/` will either get signed (breaks it) or get rejected by notarization. Options for the planner, with my recommendation first: (a) ship the component as one non-Mach-O archive (like the overlay `.tar.gz`) and extract it into app-support on first DRM use, then `codesign --remove-signature`; whether Apple's notary scans nested archives is LOW confidence, test it on a release candidate. (b) Host it as a GameLib release asset downloaded on demand with a pinned sha, exactly the `gst-libav` overlay precedent (`THIRD-PARTY-NOTICES.md`, `knownFixOverlayInstall.ts`); this also makes the D-02 licence separation obvious and keeps Steamworks-licensed binaries out of the signed GPL bundle. (c) Have `signMachOResources` skip a named path; fragile. The PE files (`lsteamclient.dll`, helper `steam.exe`) are not Mach-O and are unaffected. `THIRD-PARTY-NOTICES.md` already exists at the repo root and is the NOTICE home; add a Steamworks SDK License section plus the licence text file next to the component.

**F7. Game-process helper and HKLM.** NotProton's `steam.cpp` `set_install_paths()` (lines 123-136) writes `HKLM\Software\Wow6432Node\Valve\Steam InstallPath` and `HKLM\Software\Valve\Steam InstallPath`, with the in-source comment "Values Proton's wine.inf sets. Ubisoft Connect needs them to see Steam." Nothing there serves SteamStub. Spike 036 (o1 oracle) shows that with `HKLM\Software\Valve\Steam` present the stub-side code reads `InstallPath` and runs `steam.exe -applaunch`. **Recommendation: omit the HKLM writes** (D-07's default), and keep HKCU `SteamExe`, `ActiveProcess\{pid,SteamClientDll64,SteamClientDll,Universe,SteamPath}`, `SteamPath`. Caveat: 044's run had the HKLM values and still reached the menu, so omission is a deviation from the proven configuration; if Grim Dawn fails at "relaunch via steam.exe", restore them and justify against 036 (NotProton's shim handles `-applaunch`/`steam://` by forwarding to the Mac client, so it may be benign). Everything else the helper needs is plain Win32 (`CreateEventA`, a hidden `vguiPopupWindow` window, `RegSetKeyValueA`, `CreateProcess`, `NtSetInformationProcess(…, 1000 /* ProcessWineMakeProcessSystem */, …)`). **`setup_steam_registry` is available as a `lsteamclient.dll` export** (`steamclient_init_registry`, `lsteamclient.spec:78`; Proton's own helper uses it), so the helper needs no Steamworks headers, no Wine tree, and can be built with `zig cc -target x86_64-windows-gnu` and licensed BSD-3 in the GPL tree. Do not port the VR, BattlEye, EAC, EA, jsoncpp code; none serves this phase. Leave out `steam_drm_thread` (D-07).

**F8. Not in CONTEXT: the clone also needs `ntdll.dll` clean-copy bookkeeping and builtin installs.** NotProton (`RunnerPatcher.install`) does three things to the clone: patch `ntdll.dll` (keeping `ntdll.dll.notproton-orig`), install `lsteamclient.dll` into `lib/wine/x86_64-windows/` and `lsteamclient.so` into `lib/wine/x86_64-unix/`, and re-sign loaders. `verify_runner` checks all of it on every launch. Mirror this as one idempotent `ensureRunner()` with a cheap per-launch verify (sha of three files + `codesign` entitlement) and a full rebuild only when missing or mismatched.

**F9. D-14's removal list is incomplete.** Beyond what CONTEXT names, the forwarder drags in:
- `native/steam-bridge/steamclient/steamclient_fwd.c` and `.rc` (delete)
- `meta/buildSteamBridgeShims.ts`: `STEAMCLIENT_FWD_SOURCE_PATH`, `STEAMCLIENT_FWD_RC_PATH`, `missingSteamClient64Inputs`, `steamClient64OutputPath`, `buildSteamClient64CompileArgv`, `STEAMCLIENT64_BUILD_BYPRODUCTS`, `steamClient64ByproductPaths`, `pruneSteamClient64BuildByproducts`, `compileSteamClient64()` and its call at line ~721; and `meta/__tests__/buildSteamBridgeShims.test.ts` (29 forwarder-related lines)
- `src/backend/constants/paths.ts:132` `builtBridgeSteamClient64Path` (+ comment)
- `src/backend/storeManagers/steam/bridge/steamClientSetup.ts` (`setupSteamClientForwarder`, `chooseTargetDir`, `isByteIdentical`, `SteamClientSetupResult`) and `__tests__/steamClientSetup.test.ts` (26 lines): keep `toBottleWindowsPath`, `buildSteamClientRegistryCommands` shape and the timer-race for the new staging module
- `games.ts`: imports (118), `steamStubNoticeShownThisSession` / `steamStubForwardedNoticeShownThisSession` (612-620), `maybeNotifySteamStubUnforwarded` (2949-2975), `maybeNotifySteamStubForwarded` (3016-3043), the `no-steam-api`/`withheld` call (3241-3245), the forwarder block (3364-3400); `__tests__/games.test.ts` has about 32 lines to rewrite
- i18n: `gamelib:steam.bridge.steamstub.{title,body,forwardedTitle,forwardedBody}` in `public/locales/en/gamelib.json:499-504` and every other `public/locales/*/gamelib.json` plus `gamelib.mt.json` (about 47 locales); run `meta/i18nCatalogChurnGuard.ts` / `meta/lintTranslations.ts` gates
- **Shim-side forwarder support (the part to decide):** `GameLibBridge_CreateInterface` and `g_bridge_steamstub_path_active` in `meta/gen_vtables.ts` (lines ~1311, 1427, 3590; tests in `meta/__tests__/gen_vtables.test.ts`), the generated `native/steam-bridge/generated/*`, `shimExports.generated.ts:7`, helper `CONTROL_SLOT_CREATE_INTERFACE 3` (`bridge_helper.c:211`) and `protocol.ts:117`. All exist solely for the forwarder. "Do not keep dormant code" says remove them; the cost is a `SHIM_EXPORT_SET_VERSION` change that auto-clears every persisted scan once (D-51-07 handles that by design) and a regenerate. Recommend removing; ask the user only if they would rather defer it.
- Comment fixes: `peSteamDrm.ts` header (lines 18-21), `peSections.ts:44-45` ("only gates forwarder setup"), `shimGenerate.ts:557-559` and `:583` ("no routing change"), `electronStores.ts:225`, `meta/bridgeCensus.ts:324-341` ("never changes routing"; the census should now mark `.bind` rows as routed to DRM mode and its test at `bridgeCensus.test.ts:439-503` changes).

**F10. Routing seam is `launchBridgeGame`, not `resolveBridgeRoute`.** `resolveBridgeRoute` (bridgeRoute.ts:138) is a pure `bottle | bridge | not-eligible` resolver; DRM mode is a sub-mode of the `bridge` route (the bits live in the same `GameLibSteamBridge-<appId>` bottle, install and `findBridgeInstallBottle` stay unchanged). Add a tiny pure `resolveBridgeMode()` and branch in `launchBridgeGame` right after the bottle-ready/exe-exists gate (games.ts:3094) and **before** `placeShimForGame` (3121). One interaction to check: row 5 `win64-no-shim` (bridgeRoute.ts) reroutes an x64 title to bottled Steam when no Win64 shim exists. Today a Win64 shim is built, so this does not trigger, but a DRM-mode title needs no shim; do not let a future shim-less build send an x64 SteamStub title to bottled Steam. Also decide install-time behaviour: `placeShimForGame` runs at install too, so a freshly installed `.bind` title has a shim placed that the first DRM launch removes. Prefer to skip shim placement when `detectDrmWrapper` says `steamstub` at install, but that is optional polish; the launch-time swap (F2) is mandatory either way. `bridgeFailedThisSession` (games.ts:2816) sends a failed bridge title to the bottled-Steam flow on the next Play; D-13 forbids a bottled reroute, so DRM-mode failures must NOT call `markBridgeFailedThisSession` (follow the `steamStateCause` precedent at 3290-3295).

**F11. Trace and `bridgeCensus` plumbing needs a new anchor.** See Evidence design.

**F12. D-15 helper/game distinction.** Covered by Pitfall 10 and Evidence design.

## Evidence design (D-15 / D-16)

**Transport.** Add a small GameLib-authored addition to the lsteamclient overlay (`steamclient_main.c`, which is NotProton-authored and already an overlay file, so this is not a patch of Valve's generated code). The PE half appends to the file named by env `GAMELIB_DRM_TRACE_FILE` using `CreateFileW(FILE_APPEND_DATA)` + `WriteFile`; the sidecar passes a unix path and the PE code maps `/…` to `Z:\…`. This is independent of `WINEDEBUG` and of how Wine stderr is captured. (A Wine `MESSAGE()`-to-stderr route also works but depends on capture, which `fireBridgeWineLaunch` does not have.)

**Role.** In `DllMain(PROCESS_ATTACH)` compute `role = basename(GetModuleFileNameW(NULL)) == "steam.exe" ? "helper" : "game"` and read `SteamGameId` for the appId.

**Hooks (two spots, both in overlay-owned code):**
1. `CreateInterface` (`steamclient_main.c:395`): first call per process.
2. `steamclient_call(unsigned code, void *args, const char *name)` (`steamclient_main.c:83`): the single choke point for every `STEAMCLIENT_CALL`, and it receives the stringified function name (`ISteamUser_SteamUser023_GetSteamID`, matching the generated wrapper at `winISteamUser.c:6217`). Log the **first occurrence of each distinct name** in the game role only, capped (for example 64 lines), and always log identity-family names: `*_GetSteamID`, `*_BLoggedOn`, `*_GetPersonaName`. No edit to Valve's generated files is needed.

**Line grammar** (stable, anchored, one line each):
```
[drm-trace] appId=219990 pid=1234 role=game event=create-interface iface=SteamClient021
[drm-trace] appId=219990 pid=1234 role=game event=call name=ISteamUser_SteamUser023_GetSteamID
```
and a GameLib-side launch anchor written by `games.ts` when it fires wine:
```
[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 trace=<file>
```
After the monitor reports the game gone, the sidecar reads the trace file (size-capped, no symlinks) and re-logs each valid line into the app log via `logInfo` with a `bridge drm [<appid>]:` prefix, so `appLogSegmentFor`-style segmentation (which reads rotated `gamelib.log` files) keeps working. The classifier must only trust lines whose `appId` matches and whose `role=game`, mirroring the anchoring discipline of `helloRegex` and `attributeHelperLines` (a game-supplied string must not be able to forge a line; the file is written by lsteamclient, not by the game, but treat file contents as untrusted anyway and cap size and line length).

**Classifier branch** in `meta/bridgeCensus.ts` `classifyBridgeEvidence`: when a `[bridge-drm]` anchor exists for the appid, evidence is `verified` iff there is a `role=game` `create-interface` line (D-15) AND at least one `role=game` `call` line (D-16), or a clean game-log init line where the engine's log has one. `role=helper` lines never count; the existing Mac Steam In-Game status stays a non-input; `SteamInternal_SetMinidumpSteamID … [API loaded no]` stays pre-init and non-counting. Put the line parser in a zero-import module so the `meta/` bundle can reuse it (the `peSteamDrm.ts` D-51-15 discipline).

## Build pipeline (D-01, D-03, D-07)

What NotProton's own scripts show is needed, in order (all from `NotProtonNot/NotProton` unless noted):
1. `lsteamclient/fetch.sh`: download `codeload.github.com/ValveSoftware/Proton/tar.gz/164e0ccd…`, extract only `*/lsteamclient/`, verify a content digest (`b286df1d…657bf`: sha256 over sorted path-hash/content-hash pairs), copy to a tree, overlay the three NotProton-authored files. Only the authored files are tracked; Valve's 3,133 files are fetched, so Steamworks-licensed sources and LGPL `cxx.h` are never redistributed. GameLib should copy this posture: commit only the overlay plus GameLib's trace additions.
2. `bridge/setup-wine-tree.sh`: obtain the Wine source (see F3), apply `register-components.diff` (adds `dlls/lsteamclient` and `programs/steam.exe` to `configure`/`configure.ac`; GameLib's helper is built with zig so it only needs the `dlls/lsteamclient` half), rsync the assembled tree in, run `configure --enable-archs=x86_64 --without-freetype --without-x --host=x86_64-apple-darwin CC="clang -arch x86_64" CXX="clang++ -arch x86_64"` (D-03: x64 only, so drop `i386`), then `make dlls/ntdll/ntdll.so` (the unix half links against it).
3. `lsteamclient/build.sh`: `make dlls/lsteamclient/x86_64-windows/lsteamclient.dll` with Wine's make (the PE half; needs `x86_64-w64-mingw32-gcc`); the unix half is compiled by hand with `g++ -arch x86_64 … -DWINE_UNIX_LIB -Dprivate=public -Dprotected=public -fPIC` per `.cpp` in the Makefile.in `SOURCES` order, then linked `gcc -std=gnu23 -arch x86_64 -dynamiclib -install_name @rpath/lsteamclient.so -Wl,-rpath,@loader_path/ … dlls/ntdll/ntdll.so -lc++ -Wl,-undefined,dynamic_lookup`. Wine's own make silently builds the wrong arch for the unix half, hence the manual step. Size floors guard against a link that dropped its objects (PE > 1,000,000 B; unix `.so` > 1,000,000 B). The live artifacts are 33,957,982 B (dll) and 2,396,088 B (so). The `.so` must end up **unsigned**.
4. `ntdll-patch/build.sh`: `x86_64-w64-mingw32-gcc -c -Os -fno-asynchronous-unwind-tables -ffreestanding -fno-stack-protector detour.c`, assemble `shim.S` with `-DWM_REG -DSCRATCH_REG -DLOAD_PATH_SLOT -DSTOLEN_BYTES`, `ld -T link.ld … --defsym CAVE_VA/BM_RESUME/LDR_GETDLLHANDLE/LDR_LOADDLL/NT_PROTECT`, `objcopy -O binary -j .cave`. The payload embeds the resolved addresses, so it is **per CrossOver build** and its sha is pinned. Not zig-verified; if zig cannot replace mingw `ld`/`objcopy` for this ELF-flavoured link script, use mingw (Homebrew) in CI.
5. Helper (`steam.exe`): `zig cc -target x86_64-windows-gnu`, pure Win32, no Steamworks headers (F7).

**Build-host reality on this machine:** `x86_64-w64-mingw32-gcc` is absent; system `bison` is 2.3 (Wine needs >= 3); `autoconf` absent (not needed if `register-components.diff` patches the generated `configure` as NotProton's does); zig 0.16.0 and Xcode CLT present. CI macOS runner is arm64 (`GAMELIB_BRIDGE_TARGET_ARCH: arm64`), so the x86_64 Mach-O is produced with `clang -arch x86_64`, which is what `setup-wine-tree.sh` does. Expect a first Wine tree configure and `ntdll.so` build in the tens of minutes; cache the configured tree in CI.

**Where it hooks in.** `meta/buildSteamBridgeShims.ts` `main()` currently compiles the helper, shim x86, shim x64 and the forwarder (line ~721 `compileSteamClient64`). Replace the forwarder compile with a call into `meta/buildSteamClientLayer.ts`. The existing script has an explicit "compile gate" pattern (non-zero exit or missing output fails the build) and `--target` arch handling via `GAMELIB_BRIDGE_TARGET_ARCH`; follow both. Build outputs are "never committed" (D-07 of 24); only the overlay, scripts, tables and pins are.

## Packaging and licence separation (D-02)

- Steamworks-licensed binaries: `lsteamclient.dll`, `lsteamclient.so`. The helper is BSD-3 only if it avoids Steamworks headers (F7). The ntdll payload is GPL-3 (derived from `detour.c`).
- Layout: one directory `steamclient-layer/` with `LICENSE.lsteamclient` (Valve's SDK licence text, copied from the pinned Proton `lsteamclient/LICENSE`), a `NOTICE` stating which files fall under which licence and that GameLib's GPL-3.0-only code never links against them (they are loaded by Wine at run time, in a separate process), and the GPL-3 `ntdll-patch` sources.
- Add a section to the existing root `THIRD-PARTY-NOTICES.md` (it already documents the on-demand `gst-libav` overlay in the same shape) and a `NOTICE` inside the component. Keep the licence boundary in the file tree, not just the doc.
- Decide F6 before writing the packaging plan.

## Runner clone (D-08, D-09, D-10)

- Source: `<CrossOver.app>/Contents/SharedSupport/CrossOver` (929 MB). Clone with `/bin/cp -c -R`, fall back to `cp -R`, then `xattr -r -d com.apple.quarantine` and `com.apple.provenance`. Location: `<appFolder>/steam-bridge/drm/runners/crossover-<CFBundleVersion>/CrossOver` (same shape as NotProton's `runners/crossover-26.3.0.39832/CrossOver`, which I inspected: 994 MB, `bin -> "CrossOver-Hosted Application"`, `bin/wine` is the Perl wrapper, `lib/wine/x86_64-windows/ntdll.dll` patched plus `ntdll.dll.notproton-orig`, `lsteamclient.dll`, `lib/wine/x86_64-unix/lsteamclient.so`).
- Detect the build from `Info.plist` `CFBundleVersion` (`26.3.0.39832`; `CFBundleShortVersionString` is only `26.3`). The allowlist key is the build string plus the clean-ntdll sha (a CrossOver rebuild with the same version string but different binaries, like NotProton's "crossoverchina" rebuild entry, must fail closed).
- D-10: a clone whose build or clean sha no longer matches the installed CrossOver is removed and rebuilt on the next DRM launch; never remove a clone while its wineserver is live (NotProton's `isRunning` checks for processes under the clone path).
- Runner selection for the bottle: `runWineCommand` takes the binary from `gameSettings.wineVersion.bin` (launcher.ts:1570) and the bottle from `CX_BOTTLE` (1198). `getBridgeBottleSettings(appId)` (bottle.ts:1393) builds that settings object from `resolveCrossoverWine(...)`. The seam is to return the same settings with `wineVersion` swapped for `{ ...resolved, bin: <clone>/bin/wine, wineserver: <clone>/bin/wineserver }` for the DRM launch only. Everything that spawns wine for this appId (registry writes, redist installs, known fixes, the final launch) must use the clone, or the bottle's wineserver will be started by one runner and joined by another.

## Progress surface (D-05)

Reuse `sendGameStatusUpdate({ appName, runner: 'steam', status: 'redist', context: <label> })`, the exact pattern at `sharedRedistInstall.ts:476-482` and `:655-660`. The frontend already renders it as "Installing Redistributables (<context>)" (`gamepage.json:289,386`), shows it on the library card and game page, and the sleep-assertion classifier treats it as a system-busy status. No new status type or frontend change. The label reads slightly off for a Steam-client download; if that is unacceptable, a new `Status` member is a cross-cutting change (`common/types.ts:353`, `GlobalState.tsx:302`, `GameCard`, `ConsoleCard`, `LaunchOverlay`) and I recommend against it. Send `context` strings such as `Steam client files` and `Compatibility runner`. Download progress is coarse (stage-level) unless the plan adds byte progress to the context string.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| CrossOver | Runner clone, live gate | yes | 26.3.0.39832 (clean ntdll sha matches the allowlist row) | none, D-09 fails closed otherwise |
| Mac Steam | Live gate (D-17) | yes (`steam_osx` running now) | 1792618285; `steamclient.dylib` universal | none |
| Rosetta x86_64 on arm64 | CrossOver x86_64 loader | yes | macOS 27.0.1 | none |
| zig | Helper build | yes | 0.16.0 (`.build-tools/zig`) | none needed |
| mingw-w64 | Wine PE build, detour payload | **no** | brew 14.0.0 | `brew install mingw-w64` on dev and CI |
| bison >= 3 | Wine tools | **no** (system 2.3) | brew 3.8.2 | `brew install bison` |
| Wine source or CX 26.3.0 source | lsteamclient build | **no** (not on disk; CX drop 149 MB is downloadable) | wine-11.15 @ `2df1ee28…` / crossover-sources-26.3.0 | the other of the two |
| autoconf | Re-generating `configure` | no | n/a | not needed if `register-components.diff` patches `configure` as NotProton does |
| `/usr/bin/unzip`, `curl`, `codesign`, `cp -c` | Fetch, extract, clone, re-sign | yes | system | n/a |
| Valve CDN | Fetch | yes (fetched manifest + 64 MB package today) | n/a | the two fallback bases |
| `python3` + `capstone` | Dev-only table derivation | python3 yes; capstone not installed | 5.0.9 on PyPI | only needed when adding a CrossOver build |
| Per-title bottle `GameLibSteamBridge-219990` | Live gate | **not present on this machine now** | n/a | reinstall Grim Dawn through the bridge install path before the gate |

**Missing dependencies with no fallback:** none beyond installing the build tools.
**Missing dependencies with fallback:** mingw-w64, bison, Wine/CX source.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29.7 + ts-jest, projects `src/backend`, `src/common`, `src/frontend`, `src/preload`, `meta` |
| Config file | `jest.config.js` |
| Quick run command | `npx jest src/backend/storeManagers/steam/bridge/drm --silent` |
| Full suite command | `pnpm test:ci` |
| Type gate | `pnpm codecheck` (`tsc --noEmit` and `tsc -p tsconfig.meta.json --noEmit`) |
| Other gates | `pnpm planning-gates`, `pnpm lint`, `pnpm check-i18n`-style gates (`meta/i18nCatalogChurnGuard.ts`, `meta/lintTranslations.ts`), `fakeHomeIsolation.test.ts` |

### Phase Requirements to Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-12 | `.bind` exe selects `steamclient-layer`; non-`.bind`, unreadable exe, CEG exe do not | unit | `npx jest src/backend/storeManagers/steam/bridge/__tests__/steamclientLayerMode.test.ts` | no, Wave 0 |
| D-12 | DRM branch runs before `placeShimForGame` and never marks bridge-failed-this-session | unit (games.ts with mocks) | `npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "steamclient-layer"` | file exists, cases are Wave 0 |
| D-04/D-06 | Manifest parse picks only `bins_win64`; rejects bad `file`/`sha2`/size; follows the `version` | unit (fixture = the live manifest text) | `npx jest .../drm/__tests__/valveClient.test.ts` | no, Wave 0 |
| D-04 | sha mismatch deletes the temp file and installs nothing; fallback base used on failure | unit (injected fetch) | same file | no, Wave 0 |
| D-06 | Extracts exactly three named DLLs; ignores other entries; sizes plausible | unit (tiny zip fixture) | same file | no, Wave 0 |
| D-05 | Cached set reused with no network; no fetch when no `.bind` title launched; `redist` status sent with context | unit | same file | no, Wave 0 |
| D-03/D-09 | Applier on a synthetic PE: refuses wrong sha, non-empty cave, wrong stolen bytes, oversize payload; writes E9 + padding; appends `.npdet` section | unit | `npx jest .../drm/__tests__/ntdllPatch.test.ts` | no, Wave 0 |
| D-03 | Real 26.3.0.39832 ntdll patched sha equals `c0e21a9a…` | integration, skips when CrossOver absent | `npx jest .../ntdllPatch.realCrossover.test.ts` | no, Wave 0 |
| D-09 | Unlisted build or unknown clean sha returns `unsupported-crossover` naming installed and supported; no clone made | unit | `npx jest .../drm/__tests__/runnerClone.test.ts` | no, Wave 0 |
| D-08/D-10 | Clone created beside nothing in `/Applications`; stale clone removed only when no process runs from it; verify detects tampered ntdll | unit (temp dirs) | same | no, Wave 0 |
| D-11 | Swap restores `.gamelib-orig` over a shim, refuses non-shim or symlinks, deletes cfg and forwarder, rewrites registry value | unit (temp dir, mock reg runner) | `npx jest .../drm/__tests__/stageDrmBottle.test.ts` | no, Wave 0 |
| D-13 | Each failed step logs `[bridge-notice] appId=… reason=drm-<step>`, notifies once, returns false, does not call `markBridgeFailedThisSession` | unit | games.test.ts | cases are Wave 0 |
| D-14 | No remaining reference to `setupSteamClientForwarder`, `builtBridgeSteamClient64Path`, `steamstub.forwarded*`, `steamclient_fwd` | grep gate | `! grep -rnE "setupSteamClientForwarder|builtBridgeSteamClient64Path|forwardedTitle|steamclient_fwd" src meta native public/locales/en` | n/a |
| D-14 | Locale catalogs consistent after key removal | gate | `npx jest meta/__tests__ -t i18n` and the churn guard | exists |
| D-15/D-16 | Trace parser: role-tagged, anchored, rejects helper lines, forged lines, oversize files | unit (zero-import module) | `npx jest .../drm/__tests__/drmTrace.test.ts` | no, Wave 0 |
| D-15/D-16 | `classifyBridgeEvidence` DRM branch: anchor + game create-interface + game call => verified; helper-only => unverified; no anchor => unverified | unit | `npx jest meta/__tests__/bridgeCensus.test.ts` | exists, cases are Wave 0 |
| D-01 | Build script compile gates (missing input, size floors, unsigned `.so`, payload sha pin) | unit on argv and checks | `npx jest meta/__tests__/buildSteamClientLayer.test.ts` | no, Wave 0 |
| D-02 | NOTICE and licence files present beside the component; component contains no GPL object | unit/grep | `npx jest meta/__tests__/steamclientLayerNotice.test.ts` | no, Wave 0 |
| convention | New spawn sites (cp, codesign, unzip, build tools) use `createFakeHomeProfile()` | existing gate | `npx jest src/backend/__tests__/fakeHomeIsolation.test.ts` | exists |
| D-15/D-16/D-17 | Grim Dawn reaches menu with only Mac Steam running; trace shows game `create-interface` + game `call`; game process pid differs from helper pid | **live, manual** | operator run + `pnpm bridge-census` | live gate |
| D-17 | Raft 648800, Ranch Simulator 1119730 recorded | **live, manual** | operator run | live gate |

**Manual-only justification:** the native build, the Wine-side trampoline, `steamclient.dylib` IPC, and "reaches the menu" cannot run in jest. Everything feeding them is unit-covered so the live gate only tests integration.

### Sampling Rate
- **Per task commit:** the relevant `npx jest <file>` plus `npx prettier --check <exact paths>` per the repo `<verify>` rule (check `--file-info` first; omit if every path is prettier-ignored).
- **Per wave merge:** `pnpm codecheck && pnpm test:ci`.
- **Phase gate:** full suite green, `pnpm planning-gates`, then the Grim Dawn live gate before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `src/backend/storeManagers/steam/bridge/drm/__tests__/{valveClient,ntdllPatch,runnerClone,stageDrmBottle,drmTrace,steamclientLayerMode}.test.ts`
- [ ] `meta/__tests__/{buildSteamClientLayer,steamclientLayerNotice}.test.ts`
- [ ] Fixture: the live `steam_client_win64` manifest text (captured today) and a tiny three-entry zip
- [ ] Fixture: a synthetic minimal x86_64 PE for the ntdll applier (do not commit CrossOver's ntdll)
- [ ] Framework install: none

## Security Domain

`security_enforcement` is absent from config, so treated as enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3 Authentication, Session | no | no user auth involved |
| V4 Access Control | no | local desktop app |
| V5 Input Validation | yes | Strict regex and size caps on every manifest field (`file`, `sha2`, `size`); `zod` is already in the repo for schema validation (`bridgeVerdict.ts`); path containment via `isContainedWithin` / `toBottleWindowsPath`; the PE exe is untrusted (reuse bounds-checked readers) |
| V6 Cryptography | yes | Node `crypto` sha256 only; no custom crypto; no manifest signature scheme invented (Pitfall 9) |
| V12 Files and resources | yes | Temp dir plus atomic rename; refuse symlinks; extract only three fixed entry names; clone and swap inside app-support and the bottle only |
| V14 Config | yes | No secret ever in trace files or logs; `meta/logSecretGate.ts` exists, run it |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tampered or substituted Valve package | Tampering | HTTPS only, host allowlist (three Valve bases), sha256 vs manifest `sha2`, size cap, temp-then-rename |
| Zip slip | Tampering | Extract by explicit entry name to a fresh temp dir; never `unzip` everything; verify the three outputs are regular files |
| Patching the wrong ntdll | Tampering | Clean sha pin, cave-pad check, stolen-byte check, patched sha pin before the file is written |
| Symlink/TOCTOU in the clone dir or `.gamelib-orig` swap | Tampering/EoP | `lstat` checks, `O_EXCL`/`wx`, contained-path checks (the pattern in `originalRestore.ts`) |
| Unsigned `lsteamclient.so` loaded into a hardened-runtime loader | EoP | The clone's loader is the one we re-sign; document that this widens trust to that file; it lives in a GameLib-owned directory with 0700 parent |
| Trace-file forgery | Spoofing | Role and appId derived in lsteamclient from process image and env, classifier anchors lines, caps size, requires matching `[bridge-drm]` anchor |
| Spawned children inherit the real HOME | Info disclosure | `createFakeHomeProfile()` for `cp`, `codesign`, `unzip`, build tools. **Declared real-profile arm:** the wine launch itself needs the real CrossOver bottle and Mac Steam; document it where the launch spawns, as `bridgeCensus.ts` does |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Omitting the HKLM `InstallPath` writes (F7) still lets Grim Dawn reach the menu, as 044 ran with them | F7 | Game fails at a Steam relaunch step; fix is to restore the two values and justify against 036 |
| A2 | `lsteamclient.so` built from the CX 26.3.0 source drop works on the CX 26.3 runner (044 only proved a stock-Wine-11.15 build on it) | F3 | Build or link fails; fall back to Wine 11.15 and amend D-01 |
| A3 | The CrossOver Perl `bin/wine` wrapper from a relocated clone honours `CX_BOTTLE` and passes `WINEDLLPATH`/`WINEDLLOVERRIDES` through for an existing stock-created bottle without a prefix update | Pitfall 4, staging recipe | Must launch the raw loader like NotProton does instead; changes `runWineCommand` usage |
| A4 | The 21 Oct 2026 genuine client behaves like the 3 Sep one 044 used (its code never runs) | F4 | A stub check sensitive to version fails; pinning would then conflict with D-04 |
| A5 | The loader dyld entitlement is needed (or harmless) for GameLib | Pitfall 2 | Skipping it breaks Mac dylib loading; including it is low-risk |
| A6 | Apple's notary service scans or tolerates an unsigned x86_64 Mach-O inside a nested archive in `Contents/Resources` | F6 | Notarization rejects the release; use the on-demand release-asset route |
| A7 | zig can replace mingw `ld`/`objcopy` for the detour payload link | Build pipeline step 4 | Use Homebrew mingw in CI (needed anyway for Wine's PE build) |
| A8 | `steamclient_init_registry` is exported by the overlay's `lsteamclient.dll` build at the pinned commit (verified in the scratch Proton tree and NotProton overlay source; not verified in a built binary) | F7 | Helper falls back to the NotProton `steam_client_init` + vtable path (needs Steamworks headers) |
| A9 | DRM-mode failures must not use `markBridgeFailedThisSession` (my reading of D-13's "no reroute to bottled Steam" against games.ts:2816) | F10 | If used, the next Play silently goes to bottled Steam |

## Open Questions (RESOLVED)

1. **Does the CX 26.3.0 source drop configure and link `lsteamclient` x86_64 on this toolchain?**
   - Known: CX drop is downloadable; upstream NotProton uses stock Wine 11.15 instead; the fork used a CX drop earlier.
   - Unclear: whether CodeWeavers' tree includes everything `setup-wine-tree.sh` assumes, and whether the resulting `.so` runs on the clone.
   - Recommendation: first native task, time-boxed; fall back to Wine 11.15 and ask the user to amend D-01.
   - RESOLVED (by plan: live build): D-19, carried out by 56-02 Task 3 (time-boxed CX drop, falling back to Wine 11.15).
2. **Version drift of the fetched client (A4).** Recommend recording the manifest `version` in the cache and in the `[bridge-drm]` anchor so any failure can be tied to a client build; no pinning.
   - RESOLVED: 56-07 records the manifest `version`, and 56-12 writes it into the `[bridge-drm]` anchor's `client=` field.
3. **Distribution form of the Steamworks-licensed component (F6).** Needs a user decision between archive-in-bundle and on-demand release asset. Recommend on-demand release asset (existing precedent).
   - RESOLVED: D-18 (on-demand release asset), carried out by 56-10.
4. **Does the existing per-title bottle run unchanged under the clone (A3)?** Test with `notepad.exe` first, then Grim Dawn.
   - RESOLVED (by plan: live probe): 56-01's runner-clone probe; 56-08/56-11/56-12 follow its `launch_form`.
5. **Where does the genuine `steamclient64.dll` live for `SteamClientDll64`?** NotProton puts it in the prefix's `C:\Program Files (x86)\Steam\`. Putting it beside the game exe (as the forwarder was) is not recommended: `SteamStub` reads the registry value, and a game-dir copy would be touched by Steam depot verification.
   - RESOLVED: 56-09 stages it in the prefix's `C:\Program Files (x86)\Steam\`.
6. **Does the user want the shim-side forwarder support removed now (F9)?** It forces one scan-verdict refresh. Recommend yes.
   - RESOLVED: D-20 (remove now), carried out by 56-14. 56-14 found that no forced rescan actually happens.

## Sources

### Primary (HIGH confidence)
- Live fetch 2026-10-28: `https://client-update.akamai.steamstatic.com/steam_client_win64`, `steam_client_ubuntu12`, `steam_client_win32`, `steam_client_osx`, `…publicbeta…`; package `bins_win64.zip.1f91da26…` sha256 verified against manifest `sha2`; `bins_misc_ubuntu12.zip.f8ced8ce…` verified; NotProton's pinned `bins_win64.zip.36f5d920…` also verified.
- `HEAD https://media.codeweavers.com/pub/crossover/source/crossover-sources-26.3.0.tar.gz`: 200, 149,054,023 bytes.
- NotProton source read from scratch clones (not executed): `NotProtonNot/NotProton@8db22ad`: `lsteamclient/{fetch,build}.sh` + overlay files, `ntdll-patch/{detour.c,shim.S,build*.sh,apply.py,resolve.py}`, `steam-shim/steam.cpp`, `bridge/{setup-wine-tree.sh,fetch-valve.sh,register-components.diff}`, `app/Sources/NotProtonApp/Model/{NtdllPatcher,RunnerPatcher,RunnerInstaller,SupportedRunner}.swift`, `dylib/feats/compat_run.sh`, `NOTICE`; Gcenx fork `c09e0c4`; Proton `steam_helper/steam.c`, `lsteamclient/*`.
- Live machine inspection: `~/Library/Application Support/notproton/runners/crossover-26.3.0.39832/CrossOver` (clone layout, patched/clean ntdll shas, loader entitlements), `/Applications/CrossOver.app` (CFBundleVersion, ntdll sha, entitlements), `codesign`, `brew info`, `zig version`.
- GameLib code read: `games.ts`, `launcher.ts`, `bottle.ts`, `bridgeRoute.ts`, `steamClientSetup.ts`, `originalRestore.ts`, `peSteamDrm.ts`, `peSections.ts`, `shimGenerate.ts`, `meta/bridgeCensus.ts`, `meta/buildSteamBridgeShims.ts`, `meta/signMachOResources.ts`, `knownFixOverlayInstall.ts`, `paths.ts`, `release-tauri.yml`, `tauri.conf.json`, `THIRD-PARTY-NOTICES.md`.
- Spikes 036, 040, 041, 043, 044 (READMEs, `stage.sh`, `notproton-report-notes.md`).

### Secondary (MEDIUM confidence)
- [CodeWeavers FOSS source page](https://codeweavers.com/crossover/source) and a web search for the 26.x tarball (filename inferred from the HEAD check above).
- CrossOver 26 release notes (`changelog.html` in the installed app): "CrossOver 26 includes Wine 11.0".

### Tertiary (LOW confidence)
- Apple notarization behaviour for nested archives (A6): not verified, no source consulted.

## Metadata

**Confidence breakdown:**
- Standard stack and runtime recipe: HIGH. Re-derived from NotProton source and the live runner, with sha cross-checks on this machine.
- Valve fetch design: HIGH. Fetched and hashed live.
- Codebase seams and D-14 inventory: HIGH. Read directly; one grep-based enumeration (locale count approximate).
- Build pipeline: MEDIUM. From NotProton's scripts; not run here, and F3 may change it.
- Packaging/notarization: LOW-MEDIUM. The conflict is certain; the best resolution is untested.
- Evidence design: MEDIUM. Hook points confirmed in source; the trace additions are new code.

**Research date:** 2026-10-28
**Valid until:** 2026-11-04 for anything touching Valve's manifest or NotProton (both move weekly: NotProton released v1.2.1 on 2026-10-23 and had commits through 10-24); 30 days for codebase seams.
