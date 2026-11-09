---
spike: 034
name: known-fixes-v2-hoard
type: standard
validates: "Given a local tier-2 profile for Hoard (63000-steam.profile.json) carrying shimFeatures.wgl.hideExtensions, when GameLib launches Hoard through the real Steam bridge path, then the profile reaches the shim through gamelib_bridge.cfg, a generic WGL-extension filter hides the matching tokens, and the unmodified exe runs"
verdict: VALIDATED
related: [030, 031, 033]
tags: [steam, macos, known-fixes, tier-2, shim, shim-features, wgl, opengl, bridge-cfg, hoard, game-fix]
---

# Spike 034: known-fixes v2 for Hoard — option (a), `shimFeatures`

## What This Validates

Scope narrowed on 2026-10-26 to option (a) of the original 034 plan: **a data-driven shim feature**.
Option (b) (Mesa overlays + `dllOverrides` + `GALLIUM_DRIVER` + an applied-fix ledger) is out of scope.

Three parts of one question, riskiest first:

| Part | Given / When / Then |
|---|---|
| 034a | Given the generated shim + a generic `fix.wgl.hideExtensions=<patterns>` cfg line read at `DLL_PROCESS_ATTACH`, built with the shipping release flags, when an x86 GL test program runs in a bridge bottle, then matching tokens vanish from `wglGetExtensionsString*` with the line and return without it |
| 034b | Given `fixes/local/63000-steam.profile.json` with `shimFeatures`, when the real `launchBridgeGame` writes `gamelib_bridge.cfg`, then the cfg carries the fix line (and only validated content can get there) |
| 034c | Given Hoard installed through GameLib, when it is launched from GameLib with the profile, then the sha-verified unmodified `Reuben.exe` gets past its start-up crash; without the profile, it crashes as before |

## Research

No external dependencies. Prior art is in-repo:

- **Spike 030:** root cause. Hoard requests an OpenGL 3.3 *compatibility* context, which macOS can't
  provide (legacy 2.1 or core 4.1 only). Hiding `WGL_ARB_create_context` sends its GLEW path to a
  legacy context, and it runs on GL 2.1 Metal. Registry/env options (`DisabledExtensions`,
  `CX_FWD_COMPAT_GL_CTX`) don't work.
- **Spike 033:** the same filter as an IAT hook inside the shim, switched by an env var, ran the
  unmodified exe. It also flagged that the shipped shim was a Debug/UBSan build.
- **`notes/per-game-compat-fixes-architecture.md`:** decision 3. The only code is a shim feature
  list whose entries are generic, so it is "hide WGL extensions", never "the Hoard fix".

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Feature lines in the existing `gamelib_bridge.cfg` (`fix.<name>=...`) | One file the backend already rewrites on every launch, beside every placed shim; the shim already parses `key=value`; no new channel | Shim's own loader runs lazily at the first Steam call, too late for a GL hook | **Chosen**, and the feature reads the cfg itself at `DLL_PROCESS_ATTACH` |
| Env vars (033's `GAMELIB_FIX_*`) | Trivial | CrossOver's `wine` wrapper drops some env (`WINEDLLOVERRIDES`, 031); every feature is a new env name; not data | Rejected |
| Separate `gamelib_fixes.cfg` | Separates concerns | A second file to place, contain and clean up beside every shim | Not needed |

## Prerequisite: the UBSan build risk (033)

**Already resolved before this spike.** Quick task `261023-tyf` (`1ffb5b315`) made every shim a release
build: `SHIM_RELEASE_CFLAGS = ['-O2', '-fno-sanitize=undefined']` in `meta/buildSteamBridgeShims.ts`.
Checked on 2026-10-26: neither `public/bin/arm64/darwin/steam_api.dll` nor `steam_api64.dll` contains
the `panic:` or `misaligned address` strings 033 found. The spike's own builds use the same flags
(`build.sh`) and contain none either. 033 needed `#pragma clang attribute ... no_sanitize("alignment")`;
034's code doesn't.

## How to Run

```bash
./build.sh                 # x86 shim (generated source + shim_features.c, release flags) + glprobe.exe
./run-034a.sh              # 7-case cfg matrix in an APFS clone of a bridge bottle (GameLibSpike034)
npx jest src/backend/__tests__/steamBridgeKnownFixes.test.ts \
  src/backend/storeManagers/steam/bridge/__tests__/bridgeConfig.test.ts   # 034b, with prototype.patch applied
./stage-034c.sh            # spike shim -> public/bin, local Hoard profile; then restart `pnpm dev`
./check-034c.sh <label>    # after a GameLib launch of Hoard: shas, written cfg, shim log
./restore-034c.sh          # put the shipped shim back, remove the local profile
```

`prototype.patch` is the backend side (`git apply` it to reproduce 034b/034c). It's not committed in `src/`.

## Investigation Trail

### 034a: the shim feature (`shim_features.c`)

Built **beside** the unmodified generated `steam_api_shim.c`, as 033 did. The generated shim has no
`DllMain` (mingw's default is a no-op), so the feature's `DllMain` doesn't conflict. At
`DLL_PROCESS_ATTACH` it reads `gamelib_bridge.cfg` beside its own module, the same way
`load_bridge_port_once` resolves it. It only looks at `fix.` lines, and it installs the
`OPENGL32!wglGetProcAddress` IAT hook **only if** a pattern was parsed. With no `fix.` line, the IAT is
never touched.

Positive control: `glprobe.exe` (x86) imports `steam_api.dll` (one import, never called) and
`OPENGL32!wglGetProcAddress`, then creates a legacy context the way a GLEW-era engine does. It runs in
`GameLibSpike034`, an APFS clone of `GameLibSteamBridge-206060`; no real bridge bottle is touched.

| Case | cfg | `WGL_ARB_create_context*` tokens seen by the app | total tokens | shim log |
|---|---|---|---|---|
| A | none | 3 | 20 | 0 patterns, no hook |
| B | `port`/`appid` only | 3 | 20 | 0 patterns, no hook |
| C | `fix.wgl.hideExtensions=WGL_ARB_create_context*` | **0** | 17 | hook ok, ARB dropped 3 |
| D | `...=WGL_ARB_create_context` (exact) | 2 | 19 | dropped 1 |
| E | `...= WGL_ARB_create_context_profile , WGL_EXT_swap_control ` + CRLF | 2 | 18 | 2 patterns, dropped 2 |
| F | `fix.gl.nope=1` | 3 | 20 | "unknown fix line ignored", no hook |
| G | C's cfg, **shipped** shim | 3 | 20 | (no feature) |

GL in the bottle: `2.1 Metal - 91.7`. The same exposed tokens as 033 (three `WGL_ARB_create_context*`).
The same source also builds for `x86_64-windows-gnu` with `steam_api64.def`, so the x64 shim can carry it.

### 034b: profile → cfg (`prototype.patch`)

- `KnownFixProfile.shimFeatures` (`src/common/types.ts`), and `shimFeatures` added to `TIER2_PROFILE_KEYS`. So
  it's honoured only from `.profile.json` at the local and bundled layers, never from a tier-1 file
  or from remote.
- `steamShimFeatureCfgLines(appId)` (`bridgeKnownFixes.ts`): the backend's copy of the feature list.
  An unknown feature name is dropped with a warning. `wgl.hideExtensions` patterns must match
  `^[A-Za-z0-9_]{1,62}\*?$`, with 1–16 of them; otherwise the whole feature is dropped. These limits
  mirror the shim's (16 patterns, under 64 bytes each), and they mean no newline, comma, space or bare
  `*` can reach the cfg.
- `writeBridgeConfig({ fixLines })` appends them after `port`/`appid`/`iface.*`, and drops anything
  that doesn't start with `fix.` or that contains a CR/LF (a second guard against cfg-line injection).
- `launchBridgeGame` passes `fixLines: steamShimFeatureCfgLines(this.appId)`, lazily imported like the
  other `bridgeKnownFixes` calls in `games.ts`.

Evidence: 12 new jest cases (local, bundled, remote-ignored and tier-1-ignored layers; 7 invalid pattern
shapes; unknown feature; cfg append order and malformed-line drop). `games.test.ts` 385/385 once its
`bridgeKnownFixes` mock gained the new export, `tsc --noEmit` clean, prettier clean.
`--findRelatedTests` also showed `testContainment.test.ts` T-34.2-83 failing, but **it fails
identically with the patch stashed**, so it isn't this change. It also showed one
`dxvkInstallRemove.test.ts` timing failure that passed 3/3 when rerun alone.

### 034c: live Hoard through GameLib (operator, 2026-10-26)

Staged with `stage-034c.sh`, dev restarted, Hoard freshly installed through GameLib (new
`GameLibSteamBridge-63000`), launched from GameLib.

| Run | Profile | `Reuben.exe` | cfg written by `launchBridgeGame` | shim log | Outcome |
|---|---|---|---|---|---|
| on #1 (16:40) | local | sha `54be4b8c…` = original | `…iface.*`, `fix.wgl.hideExtensions=WGL_ARB_create_context*` | hook ok, hid `WGL_ARB_create_context`, `_no_error`, `_profile` | ran 269 s, then exited (no crash report found; operator: "had crashed as it took so long") |
| on #2 (16:45) | local | same | same | same | **game ran.** Operator: two long pauses (load screen before the menu, and again after selecting Play), "but game did eventually start!" |
| control (16:49) | removed | same | `port`/`appid`/`iface.*` only | `attach: 0 … pattern(s)`, no hook | **"got the reuben crash message"**, the pre-fix crash |

All three runs: `HELLO shim attached appid=63000` and `GINIT fn=SteamAPI_Init ret=1 ok=1` (`logs/034c-profile-on.gamelib.txt`,
paths and SteamID redacted). The same spike shim was placed in all three runs, so the only variable is the profile.

Things this run surfaced, not caused by the spike:
- **The "does-not-run" route notice didn't appear.** It's pushed from `install()` gated on
  `bridgeRoute.noticeRequired`, not at launch. Not investigated further (likely the earlier 51-UAT
  acknowledgement).
- **A second long pause after Play** (the level load). Not profiled; likely the same x87/Rosetta class as 033's
  splash freeze. Launch #1's exit during the long pauses is unexplained: no macOS or Wine crash report was found, and
  the monitor only saw the process go away.
- On launch #2 `placeShimForGame` logged `new .gamelib-orig -- discarding the persisted verdict and rescanning`
  (quick 261026-lif), on an install that had just been shimmed once. Worth a look on its own; harmless here.

Cleanup: `restore-034c.sh` put back the shipped shim (`ddaa80db…`) and removed the local profile, `src/` was reverted
to HEAD (`prototype.patch` verified byte-identical to the reverted diff and `git apply --check` clean), and the
`GameLibSpike034` clone was deleted. Hoard stays installed.

## Results

**Verdict: VALIDATED ✓** (option (a) only)

- ✓ **A per-game fix that is pure data works end to end.** A local `.profile.json` with
  `shimFeatures.wgl.hideExtensions` makes the unmodified, sha-verified Hoard run through GameLib's real
  bridge launch. Removing the file brings the crash back on the same shim. No game files, no per-game code.
- ✓ **The transport is the existing `gamelib_bridge.cfg`.** It's `fix.<feature>=<value>` lines, read by the
  shim at `DLL_PROCESS_ATTACH`. Nothing new to place or clean up.
- ✓ **The release-build shim carries it.** The UBSan risk 033 raised was already closed by `261023-tyf`.
  The feature needs no sanitizer pragma, and it builds for x64 too.
- ⚠ **Playability is "runs, slowly to load".** Two long CPU-bound pauses, plus one unexplained exit on the
  first launch during them. That's a `launchNotice` and a profiling question, not a profile/shim one.
- ✗ **Not tested:** option (b) (Mesa overlays + `dllOverrides` + ledger), a bundled (`public/fixes/`) profile in
  a packaged build, and any non-WGL feature.

**Signal for the build:** apply `prototype.patch`, and move `shim_features.c` into the shim build:
either generated by `meta/gen_vtables.ts` or as a hand-written sibling source in `buildShimCompileArgv`
(both arches), like the steamclient forwarder. Ship Hoard's profile bundled with its evidence link. Then
re-test against the bar below before touching the allowlist. Drop the spike's log file
(`gamelib_shimfix.log` beside the shim) or route it through the bridge helper's log.

## Lifting Hoard's `does-not-run` entry

A `does-not-run` entry in `bridge-allowlist.json` `knownBad` doesn't stop the launch. Only
`drm-wrapped` reroutes to bottled Steam; the rest launch on the bridge behind a one-time notice. So the
entry is wrong information, not a block. To remove it, all of these must hold:

1. ✓ **Met by 034c (local profile):** the unmodified exe gets past the crash with the profile and
   crashes again without it. Still to do: reach single-player on a packaged build.
2. The profile ships **bundled** (`public/fixes/63000-steam.profile.json`), not local. Otherwise every
   other user still gets the crash, and the entry is still accurate for them.
3. The bridge-verified bar (memory `bridge-verified-criterion-is-strict`): HELLO plus a clean
   Steam-init log from the game. Hoard's never got past the crash before, so 51-UAT item 4's Part B
   (USER/FRIENDS dispatch) is still unobserved.
4. Known limitation that stays: the ~24 s freeze at the splash screen (x87 code under Rosetta 2, 033) isn't
   fixable. It's a `launchNotice` (tier 1) candidate, not a reason to keep `does-not-run`.
