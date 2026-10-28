# Phase 56: Bridge steamclient-layer DRM mode for SteamStub titles - Context

**Gathered:** 2026-10-28
**Status:** Ready for planning

<domain>
## Phase Boundary

A second native-bridge launch mode, on macOS only, for SteamStub-wrapped titles (exe carries a
`.bind` section). In this mode the title's own, unmodified `steam_api(64).dll` runs. Behind it,
Valve's genuine `steamclient64.dll` (fetched from Valve's CDN onto the user's machine, never
shipped) sits in the `ActiveProcess\SteamClientDll64` slot, so SteamStub's module check passes.
Its exports are trampolined in memory to a GameLib-built `lsteamclient`, which hosts the x86_64
slice of Mac Steam's `steamclient.dylib` inside the Wine process. The game runs on a cloned,
ntdll-patched copy of the user's CrossOver. This is spike 043's adoption option 2, which spike 044
proved live under NotProton (Grim Dawn 219990 reached its menu).

The TCP `steam_api` bridge (generated shim, then `bridge_helper`, then `libsteam_api.dylib`) stays
the mode for every DRM-free title.

**Boundary (user ruling 2026-10-27):** these are in bounds:
- fetching Valve's client from Valve's CDN;
- rewriting its exports in memory (Proton's `steamclient_setup_trampolines` mechanism).

These are out:
- patching game exes;
- decrypting DRM payloads;
- any GameLib stand-in for Steam's private protocol;
- CEG titles (spike 044/045 left `STEAMSTART` servicing unsolved);
- any route into bottled Steam.

**Done when (live gate):** Grim Dawn 219990 reaches its menu through this mode with only Mac Steam
running, and meets the strict bridge-verified criterion as defined for this mode in D-15 to D-17.

</domain>

<decisions>
## Implementation Decisions

### Where the parts come from
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

### Runner and bottle
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

### Routing and failure
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

### Bridge-verified evidence in this mode
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

### Planning-time rulings (user, 2026-10-28, after 56-RESEARCH.md)
- **D-18:** The Steamworks-licensed `lsteamclient` component (PE `.dll` plus unsigned x86_64 `.so`)
  ships as an on-demand release asset that is downloaded on the first DRM-mode launch, like the
  `gst-libav` overlay. It is not in the signed and notarized `.app` bundle. This refines D-02
  (research F6: Wine builtins don't load once codesigned).
- **D-19:** D-01's build base is time-boxed. The first native task tries the CrossOver 26.3.0
  source drop. If it fails inside the time box, the build falls back to stock Wine 11.15 headers
  (NotProton upstream, what spike 044 proved) and records the D-01 amendment in a SUMMARY
  (research F3).
- **D-20:** D-14's removal includes the shim-side forwarder support: `GameLibBridge_CreateInterface`
  and `g_bridge_steamstub_path_active` in `meta/gen_vtables.ts`, the helper's
  `CONTROL_SLOT_CREATE_INTERFACE`, `native/steam-bridge/steamclient/` and the forwarder compile code
  in `meta/buildSteamBridgeShims.ts`. Bump `SHIM_EXPORT_SET_VERSION`, which accepts one forced
  rescan (research F9).
- **D-21:** The ported helper omits NotProton's HKLM writes, which exist only for Ubisoft Connect.
  It stays HKCU-only per D-07 and spike 036. If Grim Dawn fails at the live gate, one diagnostic
  run with the HKLM writes is allowed, and the result is recorded (research F7).
- **D-04 refinement (research F4):** the Valve package is the `steam_client_win64` manifest's
  `bins_win64` node, which holds all three D-06 DLLs. `bins_misc_ubuntu12` has no tier0 or vstdlib.
  The rest of D-04 is unchanged: follow the current manifest and verify against its `sha2`, with
  no pinned sha.
- **D-08 narrowing (user, 2026-10-28, after plan check):** `resolve.py` is vendored as a dev-time
  tool only. At runtime, GameLib applies a pinned, sha-verified per-build row from
  `ntdllPatchTable.ts` (56-06), not a runtime pattern finder (research F5; consistent with D-09's
  fail-closed allowlist). To add a CrossOver build, run `resolve.py` at dev time and commit a new
  row.
- **Follow-ups (user, 2026-10-28):**
  - 56-15 is split into 56-15 (contract plus publish) and 56-16 (live run), per the live-gate
    author ≠ runner rule.
  - The now-unreachable SteamClient017/014 `wire` policy moves to the follow-up todo
    `2026-10-28-steamclient-wire-policy-unreachable-after-phase-56.md`, not Phase 56.
  - D-20's "one forced rescan" doesn't happen (`isScanVerdictNowCovered` ignores the stamp); 56-14
    pins that behaviour.
- **D-15/D-16 refinement (research F1):** the strict classifier is `meta/bridgeCensus.ts`
  (`classifyBridgeEvidence`), not `bridgeVerdict.ts`. Trace lines carry `role=game|helper`.

### Claude's Discretion
- How the progress state for the first-launch fetch (D-05) appears in the UI. Reuse an existing
  launch-progress surface rather than inventing one.
- The cache location and layout for the fetched Valve DLLs and the cloned runner, within GameLib's
  app-support directory.
- How the D-15 and D-16 trace lines are written: the log file and format. They must be greppable by
  the census or verdict tooling (`bridgeVerdict.ts`).
- The order of setup steps inside a DRM-mode launch, and which steps are idempotent or cached.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spikes this phase builds on
- `.planning/spikes/044-notproton-drm-live/README.md`: the live proof (Grim Dawn reaches its menu
  under NotProton), NotProton's setup steps, and the open Steam-init question.
- `.planning/spikes/043-notproton-steam-bridge-comparison/README.md`: NotProton's layout
  (game-side half only), `lsteamclient` build, ntdll detour, `steam-shim`, fragility, licensing, and
  adoption option 2.
- `.planning/spikes/041-steamstub-genuine-steamclient/README.md`: the genuine client passes the file
  check, then fails on `Steam3Master_SharedMemLock`.
- `.planning/spikes/040-steamstub-launch-check-static/README.md`: `.bind` decode of the three targets
  (all SteamStub 3.1 x64), armed flags, and Ranch Simulator's exit-53 variant.
- `.planning/spikes/036-proton-style-dipc-responder/`: why HKLM must not be written, and the genuine
  Steam oracle.
- `.planning/spikes/004a-wine-mach-o-thunk/`: the older "don't build lsteamclient on macOS" finding,
  superseded by 043.

### Project skills
- `Skill("spike-findings-gamelib")`: the macOS native Steam bridge and Tauri/sidecar patterns.
- `Skill("gamelib-conventions")`: fake-HOME isolation for every spawned process (the CrossOver
  clone, wine, the build tooling), the sidecar exit contract, and the `<verify>` prettier rule.

### Decisions and stance
- `.planning/notes/per-game-compat-fixes-architecture.md`: decision 4 (game files are never touched).
- `.planning/todos/completed/2026-10-26-steamstub-titles-fail-launch-check-on-bridge.md`: the source
  todo and its resolution, which ties item 1 to this phase.
- `.planning/phases/53-steam-bridge-coverage-modern-sdk-exports-flat-api/53-CONTEXT.md`: D-53-13
  and D-53-15, the evidence rules this phase's D-16 mirrors.
- `.planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/`: the forwarder this phase
  removes, its plans and summaries, and `52-19-DIAGNOSIS.md`.
- `.planning/research/STEAM-STACK.md`: the frozen Steam stack. This mode adds a component; it does
  not replace any stack choice.

### External sources (read from scratch clones, not committed)
- NotProton (NotProtonNot/NotProton, GPL-3; `steam-shim` is BSD-3): `lsteamclient/`, `ntdll-patch/`
  (`detour.c`, `resolve.py`), `steam-shim/steam.cpp`, and `bridge/fetch-valve.sh` with
  `valve-packages.manifest`.
- Proton (ValveSoftware): `lsteamclient/` at the pinned commit, `steam_helper/steam.c`, and Wine
  `loader.c` `steamclient_setup_trampolines`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/backend/storeManagers/steam/bridge/peSteamDrm.ts`: the `.bind` detection that drives routing
  (D-12). It has zero imports by design (D-51-15).
- `src/backend/storeManagers/steam/bridge/originalRestore.ts`: puts the game's original
  `steam_api*.dll` back (D-11).
- `src/backend/storeManagers/steam/bridge/steamClientSetup.ts`: the HKCU `ActiveProcess` registry
  plumbing via `runWineCommand`, with typed results and no throws. The registry part can be adapted
  for the genuine client path. The forwarder part is removed (D-14).
- `src/backend/storeManagers/steam/bridge/bridgeRoute.ts`: route resolution (`resolveBridgeRoute`).
  The DRM-mode branch goes here.
- `src/backend/storeManagers/steam/bridge/bridgeVerdict.ts`: the verdict and evidence tooling that
  must read the D-15 and D-16 lines.
- `src/backend/storeManagers/steam/bottle.ts`: per-title bridge bottle and `cxbottle` location.
- `meta/buildSteamBridgeShims.ts` (`pnpm build-steam-bridge`): the existing native build entry and the
  home for the `lsteamclient` build (D-01).

### Established Patterns
- Bridge setup steps return typed results and never throw into the launch path.
- `[bridge-notice] appId=… reason=…` log lines, paired with one-time i18n notices (`games.ts`
  `maybeNotify*`).
- Every spawned child process uses `createFakeHomeProfile()` (convention: fake-HOME isolation).
- `electronStores.ts` persists `drmWrapper?: 'steamstub'` on the scan record.

### Integration Points
- The `games.ts` launch path, around the Phase 52 SteamStub branch (about lines 3179-3196): choosing
  the runner and bottle, and skipping shim and forwarder placement in DRM mode.
- Packaging: the `lsteamclient` component and NOTICE in the Tauri bundle, kept separate from GPL
  code (D-02).

</code_context>

<specifics>
## Specific Ideas

- Match NotProton's game-side behaviour as closely as possible, since that is what 044 proved. Do not
  adopt its Steam-side half: no `Steam.app` `Info.plist` `DYLD_INSERT_LIBRARIES`, no ad-hoc re-sign,
  no `steamclient.dylib`/`steamui.dylib` signature hooks. GameLib is the launcher and Mac Steam
  stays untouched.
- Do not import NotProton's one-flag ACK bug (`OpenEventW(SYNCHRONIZE, …)`). It doesn't arise,
  because the DIPC responder is excluded (D-07). If that code is ever ported, it must use
  `SYNCHRONIZE | EVENT_MODIFY_STATE`, as Proton does.

</specifics>

<deferred>
## Deferred Ideas

- CEG titles through this mode, which would need `STEAMSTART` request servicing. Out of scope (spikes
  044/045). Spike 045's census found only 3 of 389 owned games hit the CEG wall on Apple silicon.
- x86 (32-bit) SteamStub titles (`detour32.c`). Defer until a 32-bit SteamStub title shows up.
- A per-title override that forces a title to the TCP bridge or to DRM mode. Declined for now in
  favour of automatic routing.

### Reviewed Todos (not folded)
- `todo.match-phase` surfaced 15 keyword matches (Phase 21/26 UAT, redist slowness, GameMaker DXVK,
  install routing, and others). None is about SteamStub or the steamclient layer; all are unrelated
  keyword hits. The real source todo is already completed and points here.

</deferred>

---

*Phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles*
*Context gathered: 2026-10-28*
