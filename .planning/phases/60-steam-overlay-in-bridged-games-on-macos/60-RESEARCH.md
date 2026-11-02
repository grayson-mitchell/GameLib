# Phase 60: Steam overlay in bridged games on macOS - Research

**Researched:** 2026-11-02
**Domain:** macOS dyld injection into CrossOver/Wine processes; cloned+re-signed runner; vendored Objective-C Metal shim; launch-path integration in the sidecar
**Confidence:** HIGH on code integration points and the shim verdict; MEDIUM on Staging-engine overlay behaviour (injection mechanism verified, overlay rendering not)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The overlay is **on by default** for every bridged launch. There is no opt-in.
- **D-02:** A **per-game toggle** in the game's settings turns it off. There is no global switch.
- **D-03:** A **known-fix entry can disable the overlay** for a title where it is known to break, so every user gets the fix without finding the toggle. The user's per-game toggle wins over the known-fix value in both directions.
- **D-04:** TCP-mode games with the overlay on run on a **separate overlay-only clone**: an unpatched APFS clone of the inner `SharedSupport/CrossOver` with both loaders re-signed, and no patched ntdll. It is kept apart from the DRM clone. It reuses `runnerClone.ts`'s machinery (0700 runners root, `xattr -cr`, keep every stock entitlement, re-hash on every launch, re-clone when the CrossOver version/build changes). With the overlay off, a TCP-mode game runs on stock CrossOver as it does today.
- **D-05:** The **DRM clone also re-signs `bin/wineloader`** and gets the same `CX_ENV` tokens, so DRM-mode (SteamStub) titles get the overlay too.
- **D-06:** **No CrossOver version allowlist for the overlay.** It is attempted on any CrossOver. Phase 59's one-time "untested CrossOver version" notice and launch-log line (D-59-15) cover the risk. DRM mode's own allowlist (D-56-09) is unchanged, and still gates DRM titles.
- **D-07:** **Phase 59 fallback engine (Wine-Staging + DXVK):** research finds out whether dyld injection works on the pinned Staging build: whether its loaders strip `DYLD_*`, how env reaches the game, and whether re-signing is needed. Add overlay support there only if it is cheap. Otherwise fallback launches run without the overlay, and the gap is recorded.
- **D-08:** Overlay setup failure **never blocks a launch.** Failures include: Mac Steam's dylibs missing, clone or re-sign failure, the shim missing from the build, or an unsafe `CX_ENV` value. The game launches without the overlay, on stock CrossOver for TCP mode or on the DRM clone without the overlay tokens for DRM mode. A toast names the failed step, and a `[bridge-notice]` log line records the step and the reason. This is the opposite of DRM mode's fail-closed rule (D-56-13), because the overlay is an enhancement.
- **D-09:** That toast shows on **every affected launch**, matching Phase 59's fallback toast. It is not deduplicated.
- **D-10:** When an overlay-injected launch **exits abnormally soon after start**, the launch-failure message mentions the overlay and links to the per-game toggle. GameLib does not auto-retry without the overlay.
- **D-11:** After launch, GameLib **watches Mac Steam's `console_log.txt`** for `GameOverlay: started '…/gameoverlayui' (pid N) for game process <pid>`. It logs attached or not-attached within about 10 s in the launch log. This is diagnostic only: no UI and no toast.
- **D-12:** The NotProton shim is injected on **every overlay launch, first in the insert list** (`<shim>:<steamloader>:<gameoverlayrenderer>`). On BGRA8 paths it is measured harmless.
- **D-13:** **Unknown GPU or macOS:** research reads `overlay_shim.m` to see whether it no-ops safely when an `AGX*` class it swizzles is missing. If it does, inject everywhere. If it doesn't, gate **the shim only** (never the Steam dylibs) on known GPU families or macOS versions.
- **D-14:** Vendor `overlay-shim/overlay_shim.m` from `NotProtonNot/NotProton` at a pinned commit, keeping its GPLv3 copyright and licence notice. Build it in GameLib's own native build tooling as a universal dylib. Never ship NotProton's prebuilt binary (same rule as D-56-01).
- **D-15:** **All four titles gate the phase.** Each one is launched through GameLib's real launch path. The operator confirms that Shift+Tab opens the overlay, it draws correctly and it takes clicks. The bridge must stay verified to the strict criterion (D-53-13 / D-56-15/16). Schedule I Free Sample 3205720 (DXVK, BGRA8, TCP); The Planet Crafter 1284190 (D3DMetal D3D11, BGRA8, TCP); Manor Lords 1363080 (D3DMetal D3D12, RGB10A2, depends on shim, launches through the UE stub never `…-Shipping.exe`); Grim Dawn 219990 (DRM mode, DRM clone). Each run also records the D-11 attach line, `vmmap` showing the injected dylibs, and the shim's `hook_set_pixel_format` trace. Pixel evidence and screenshots don't count; the operator does.
- **D-16:** **Invites:** Phase 58's invite picker routing (`inviteBridge.ts`, `ActivateGameOverlayInviteDialog`, 58-29..36) is unchanged. In UAT, the operator records what the overlay's own invite button does in a bridged game. Rerouting to the real overlay is deferred.

### Claude's Discretion
- Where the per-game toggle sits (likely next to Phase 59's Advanced engine override), and its label.
- The exact abnormal-exit window for D-10 and the attach-watch timeout for D-11.
- How the overlay clone and the DRM clone share code in `runnerClone.ts`: a parameterised re-sign list against duplication.
- How the known-fix schema expresses "overlay off". Name it to avoid confusion with the existing known-fix `overlays` (payload archives, `KnownFixOverlayEntry`), which are unrelated.
- Toast component and copy, following the existing bridge-notice patterns.

### Deferred Ideas (OUT OF SCOPE)
- Routing `ActivateGameOverlayInviteDialog` to Steam's real overlay when it is attached, instead of GameLib's picker. This needs an attach signal (D-16).
- HDR (`RGBA16Float`), DXMT, WineD3D-GL and fullscreen-on-D3D11 coverage: untested in the spikes, and not gated here.
- Overlay on the Phase 59 fallback engine, if D-07 research finds it isn't cheap.
- Not in this phase: patching Steam.app, starting `gameoverlayui`, bottled-Steam rerouting.
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped to this phase (Requirements: TBD). The planner maps plans to CONTEXT decisions D-01..D-16 instead.

| Decision | Research Support |
|----------|------------------|
| D-01..D-03 | Tri-state per-game setting + tier-1 known-fix key + precedence function (Architecture Pattern 5) |
| D-04, D-05, D-06 | `runnerClone.ts` anatomy and parameterisation (Pattern 1); registry integration (Pattern 2) |
| D-07 | Staging probe results (section "D-07 verdict") |
| D-08, D-09 | Notice pattern (Pattern 6) |
| D-10, D-11 | Abnormal-exit and console_log watcher (Pattern 7) |
| D-12, D-13, D-14 | Shim source reading + build recipe (sections "D-13 verdict", Pattern 4) |
| D-15, D-16 | Validation Architecture (manual-only live UAT) |
</phase_requirements>

## Summary

The recipe is proven by spikes 061-064 and the codebase already has nearly all the machinery. DRM mode's `runnerClone.ts` re-signs `lib/wine/x86_64-unix/wine` only; the overlay needs `bin/wineloader` re-signed too. The `CX_ENV` token merge already exists in the `buildDrmLaunchEnvironment` function in `games.ts` (L830-894) but is dormant in live config, because DRM's channels are `dll-option` and `not-needed` and so emit no `CX_ENV` tokens today. The overlay is its first real user.

The TCP route needs a new overlay-only clone (no allowlist, no patched ntdll, sibling root). It is best integrated by extending the existing per-appId runner registry in `bottle.ts` (`drmBridgeRunners`), so `getBridgeBottleSettings(appId)` returns the clone for every wine spawn of the launch. Overlay setup slots in after `drmLaunchSetup` returns `not-applicable`, and always fails open.

Four findings change the plan versus what CONTEXT assumes:

1. **`overlay_shim.m` has no `AGX*` class names at all.** It discovers Metal classes at runtime with `object_getClass(device/queue/buffer/encoder/drawable)` and swizzles only through `interpose()`, which returns 0 (no-op) when a class or selector is missing. D-13 resolves to "inject everywhere", with no GPU/macOS gate. (HIGH for the static reading, MEDIUM for behaviour on non-Apple-silicon GPUs, which is unobserved.)
2. **D-08 vs D-05 conflict:** if the `bin/wineloader` re-sign is a hard step of the DRM clone build, a re-sign failure breaks DRM mode itself (fail-closed), contradicting D-08's "DRM clone without the overlay tokens". Resolve by making the wineloader re-sign best-effort in the DRM clone, recorded in the marker. This is an open question for the user to confirm.
3. **The TCP wine launch drops stderr.** `fireBridgeWineLaunch` only attaches an output sink for DRM launches, so the shim's `hook_set_pixel_format` trace (stderr, D-15 evidence) never reaches any log on TCP launches. A wine-log sink must be added for overlay launches.
4. **D-07 verdict: wiring is cheap, verification is not.** Plain `DYLD_INSERT_LIBRARIES` env reaches the Staging loader unmodified (verified by a probe dylib below). But D-15 does not gate any fallback-engine title, and plain env injects every process in the wine tree. Recommendation: do not inject on the fallback engine this phase; record the gap and a log line.

**Primary recommendation:** Add a new `bridge/overlay/` module family (paths, overlay clone, token builder, notice, watcher). Share loader re-sign primitives with `runnerClone.ts` by exporting them. Register the overlay runner in the existing runner registry. Vendor the shim under `native/steam-bridge/overlay-shim/`, build it in `meta/buildSteamBridgeShims.ts` into `public/bin/<arch>/darwin/overlay_shim.dylib`, and wrap everything fail-open.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Overlay-enabled decision (user toggle > known fix > default on) | API / Backend (sidecar) | Browser / Client (toggle UI) | Launch happens in the sidecar; the renderer only edits the stored per-game setting |
| Per-game toggle UI | Browser / Client | API / Backend (eligibility flag) | Settings screen; eligibility computed by backend like `overrideEligible` (WR-04) |
| Overlay clone build, re-sign, per-launch verify | API / Backend (sidecar) | OS (cp, codesign, xattr) | Filesystem + child processes, all under fake-HOME |
| Shim build (universal dylib) | Build tooling (`meta/`) | CI (release-tauri.yml already runs `pnpm build-steam-bridge`) | Operator/CI-run, never on the user's machine |
| Shim + Steam dylib injection | Wine process (dyld) | Sidecar (builds `CX_ENV`) | dyld loads them into the Wine process under the re-signed loaders |
| Overlay UI drawing and input | Mac Steam (`gameoverlayui`) | — | Steam attaches itself; GameLib never starts it |
| Attach diagnostic (D-11) | API / Backend (sidecar) | — | Bounded, unref'd tail of Mac Steam's `console_log.txt` |
| Failure toast and `[bridge-notice]` | API / Backend | OS notification (`notify`) | Existing `notify()` + log-line pattern |
| Known-fix "overlay off" flag | Data (`public/fixes`, remote fixes repo) | API / Backend (reader) | Tier-1 key, reaches users without a release |

## Standard Stack

No new npm or PyPI packages. Everything is existing in-repo code plus system tools.

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `src/backend/storeManagers/steam/bridge/drm/runnerClone.ts` | in-repo | APFS clone, re-sign, verify, marker | Proven DRM machinery (Phase 56) |
| `overlay_shim.m` (NotProtonNot/NotProton) | commit `0c798e7148efe279627573f864210064788b427c`, blob `194b5fba7c0f145a9d7e227fc5ace2e2333e2299`, sha256 `d6924aa4b330059dfa1212340a34f8081ea949cc8c82cfc2875ca6f0964687e5` | Metal pipeline-format fix for RGB10A2 / Metal 4 | Spike 064 proved it; the only way to get a correct overlay on 10-bit layers |
| Apple clang + `lipo` + `codesign` (Xcode CLT) | clang from CLT, SDK 27.0 here | Build universal dylib | `buildSteamBridgeShims.ts` already requires system `clang` |
| Mac Steam's `steamloader.dylib` + `gameoverlayrenderer.dylib` | the user's own install | The injected overlay | Nothing of Valve's is redistributed |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `readBoundedTail` (`bottleLaunchSignals.ts`) | Bounded tail read of a log file, never throws | D-11 console_log.txt watcher |
| `notify` (`backend/dialog/dialog`) | The "toast" in this codebase (OS notification) | D-08/D-09/D-10 |
| `createFakeHomeProfile().childEnv()` | Env for every spawn | cp/xattr/codesign/plutil/ps/clang/lipo |
| `readStoredEngineOverride`-style direct file read | Read the per-game toggle at launch | `GameConfig.get(id).config` is async-filled (59-UAT G11) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `drmBridgeRunners` registry with a `kind` | A second `overlayRunners` map | Second map means touching `getBridgeBottleSettings` precedence, `killForRegisteredEngine`, and every `drmBridgeRunners.has` site separately. A `kind` field with a relaxed path regex is the smaller diff. |
| `lipo` of two clang runs | `clang -arch arm64 -arch x86_64` in one call | Either works. The NotProton Makefile uses two runs + lipo, and I verified that recipe locally. |
| Tier-2 known-fix key | Tier-1 key | Tier 1 reaches users from the remote repo with no release (D-03 "every user gets the fix"). The flag can only remove injection, never add code, so it fits tier 1 (see Pattern 5). |

**Installation:** none. Build the shim with `pnpm build-steam-bridge` (extended).

**Version verification:** the pinned shim commit/blob/sha256 above were fetched with `gh api` on 2026-11-02 and recomputed locally. The file is unchanged between commit `0c798e7` and `main` HEAD `e67dd9ba984a74025d7857f998842c8173df294c`. `[VERIFIED: gh api repos/NotProtonNot/NotProton]`

## Package Legitimacy Audit

No external packages are installed in this phase.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

The one external artifact is a vendored source file, not a package. See "Vendoring" below. Provenance: `NotProtonNot/NotProton` repo root `LICENSE` is the GPLv3 text, `NOTICE` says the bulk is GPLv3 and lists exemptions that do not include `overlay-shim/`. `overlay_shim.m` carries no per-file licence header (first line is a prose comment). `[VERIFIED: gh api repos/NotProtonNot/NotProton/contents/NOTICE]`

## Architecture Patterns

### System Architecture Diagram

```
Play pressed
   |
   v
launchBridgeGameBody (games.ts ~L4429)
   |-- detectLaunchDrmWrapper -> wantsDrm?
   |
   +-- wantsDrm=false (TCP) --> selectLaunchEngine --> engine kind?
   |                              |-- non-CrossOver (Staging fallback) --> NO overlay (D-07), log line
   |                              |-- CrossOver
   |                                    v
   |                          drmLaunchSetup -> 'not-applicable' (clears registry entry)
   |                                    v
   |                          resolveOverlayEnabled(userToggle, knownFix, platform)
   |                              |-- off --> stock CrossOver (unchanged path)
   |                              |-- on  --> prepareOverlayLaunch   [NEW, never rejects]
   |                                    |  1 Mac Steam dylibs present?  (steamloader, gameoverlayrenderer)
   |                                    |  2 shim file present?         (public/bin/<arch>/darwin/overlay_shim.dylib)
   |                                    |  3 detect CrossOver (no allowlist) + ensureOverlayRunnerClone
   |                                    |  4 build CX_ENV tokens + validate (' : control chars)
   |                                    |-- any step fails --> [bridge-notice] + notify, STOCK CrossOver
   |                                    v ok
   |                          register overlay runner in bottle.ts registry (kind 'overlay')
   |                          => getBridgeBottleSettings(appId) now returns the clone
   |
   +-- wantsDrm=true --> preflightCrossover --> drmLaunchSetup (DRM clone, allowlist, fail-closed)
                           v ok
                         launchDrmModeGame
                           v
                         prepareOverlayTokens (Mac Steam dylibs + shim + wineloader re-signed?)
                           |-- fail --> [bridge-notice] + notify, DRM clone WITHOUT tokens (D-08)
                           v ok
   both --> fireBridgeWineLaunch(exePath, settings, drm?, overlay?)
              |-- known fixes / redists / DLL overrides (settings carry the clone runner)
              |-- append CX_ENV tokens to launchSettings.enviromentOptions
              |-- start wine-log sink (overlay launches only; shim stderr trace)
              |-- runWineCommand (spawn bin/wine from clone, env incl. CX_ENV)
              |-- monitor.onFirstMatch --> start console_log watcher (<=10 s, unref'd, bounded)
              |-- monitor.onStopped / winePromise settle --> D-10 abnormal-exit check
              v
         Wine process: dyld honours DYLD_INSERT_LIBRARIES (loaders re-signed)
              shim -> steamloader -> gameoverlayrenderer
              Mac Steam sees SteamOverlayGameId and starts gameoverlayui itself
```

### Recommended Project Structure
```
src/backend/storeManagers/steam/bridge/overlay/      [NEW]
├── overlayPaths.ts          # <appFolder>/steam-bridge/overlay/{runners,trace}; same regex/containment style as drmPaths.ts
├── overlayRunnerClone.ts    # detectCrossoverForOverlay (no allowlist) + ensureOverlayRunnerClone
├── overlayLaunch.ts         # resolveOverlayEnabled, prepareOverlayLaunch, buildOverlayCxTokens, appendCxEnvTokens
├── overlayNotice.ts         # OverlayStep union, overlayStepError, formatOverlayNoticeLine (do NOT extend DRM_STEPS)
├── overlayAttachWatch.ts    # console_log.txt bounded poll (D-11)
└── __tests__/
native/steam-bridge/overlay-shim/                    [NEW, vendored]
├── overlay_shim.m           # byte-identical to NotProton blob 194b5fba...
├── LICENSE                  # GPLv3 text copied from the NotProton repo root
├── NOTICE                   # source repo, commit SHA, blob SHA, sha256, "built by GameLib, no prebuilt binary"
└── PINS.md                  # same role as native/steam-bridge/steamclient-layer/ntdll-patch/PINS.md
```
Also edit: `bridge/drm/runnerClone.ts` (export primitives, re-sign `bin/wineloader`), `bottle.ts` (registry `kind`, regex), `games.ts`, `common/types.ts`, `backend/knownFixes.ts`, `meta/buildSteamBridgeShims.ts`, `src/backend/constants/paths.ts`, `THIRD-PARTY-NOTICES.md`, the settings screen, `engineState.ts`.

### Pattern 1: Parameterise `runnerClone.ts` (Research Q4)

**What exists** `[VERIFIED: codebase read]`
- `buildRunner` (L874-1165) does, in order: mkdir 0700 runners root, `mkdtemp` partial, `cp -c -R` (fallback `cp -R -p`), clone checks (bin symlink, executables, ntdll sha equals installed, `wine.inf` mtime pin), ntdll patch, builtins copy + `codesign --remove-signature` on `lsteamclient.so`, **loader re-sign (only `LOADER_REL` = `lib/wine/x86_64-unix/wine`)**, targeted xattr scrub, marker, atomic rename.
- `verifyRunnerClone` (L564) re-hashes per launch and checks entitlements on the one loader. The marker is `schema: 1` with `loaderSha256` only.
- Entitlements are hardcoded as `STOCK_LOADER_ENTITLEMENTS` (5 keys) and `buildRunner` fails closed on any other set (`unexpected loader entitlements`).
- `detectAllowedCrossover` hard-requires an ntdll allowlist row. It cannot be reused for the overlay (D-06 says no allowlist).
- `pruneStale` and `STALE_CLONE_RE` operate on one runners root. A sibling root for the overlay clone (`…/steam-bridge/overlay/runners/`) keeps the two from pruning each other.
- Helpers needed by the overlay are module-private today: `dumpLoaderEntitlements`, `entitlementsPlist`, `sha256File`, `statRegular`, `safeRemove`, `removeInside`, `psListing`, `isPathInUse`. Export them (add `// ts-prune-ignore-next` or consume them so ts-prune stays green).

**What to change**
1. Add `WINELOADER_REL = join('bin','wineloader')`. Factor the loader re-sign into one exported helper, `resignLoaders(run, dest, rels, partial, timeouts)`, that takes the list of rels. DRM calls it with `[LOADER_REL, WINELOADER_REL]`; the overlay clone calls it with the same pair.
2. **Overlay clone** (`overlayRunnerClone.ts`) = clone + checks + the re-sign helper + xattr scrub + marker. No ntdll patch, no builtins, no `lsteamclient`. Key the dir `crossover-<CFBundleVersion>` under the overlay runners root. Marker (own schema) holds `crossoverBuild`, SHA-256 of both re-signed loaders, and the SHA-256 of both **source** loaders in the installed CrossOver. Per-launch verify re-hashes the installed loaders and compares to the marker, so a same-build reinstall or repack re-clones. This is cheap (two files of about 1-3 MB).
3. **Entitlements for the overlay clone:** derive the plist from the dump (all boolean-true stock keys + `DYLD_ENTITLEMENT`), as the spike did with `plutil -insert`. Do not require the 5-key equality, because D-06 attempts any CrossOver and a future build may change the stock set. `parseEntitlementKeys` already returns null on non-`<true/>` values, which fails open (overlay skipped, game launches). Note this as an intentional difference from the DRM clone, which stays strict.
4. **DRM clone (D-05):** call the helper for both loaders. Marker `schema: 2` adds `wineloaderSha256` and `wineloaderResigned: boolean`. A schema bump makes every existing DRM clone fail verify once and rebuild, which is about 1 s on APFS, but note the `isPathInUse` guard returns an error `quit the game and retry` if that title is running. Verify then requires the six entitlements on `bin/wineloader` only when `wineloaderResigned` is true.
5. **D-08 vs D-05 resolution (recommend, confirm with user):** make the `bin/wineloader` re-sign **best-effort in the DRM clone**. On failure, the DRM clone still builds (fail-closed rules for everything DRM needs are unchanged), `wineloaderResigned=false` is recorded, and the overlay tokens are omitted with a `[bridge-notice] reason=overlay-resign` + toast. Otherwise a re-sign failure turns an enhancement into a DRM-mode launch blocker.
6. **xattr scrub:** CONTEXT and the spike say `xattr -cr`. The existing code deliberately does targeted `xattr -r -d com.apple.quarantine` / `com.apple.provenance` and its comment says "Never `xattr -c`: it would strip com.apple.cs.* signature xattrs". Keep the targeted scrub; do not switch to `-cr`. Re-sign always runs after the scrub's predecessors, so both approaches clear quarantine, but only the targeted one is safe for the other stock-signed files. `[VERIFIED: runnerClone.ts L1043-1070]`
7. **Never re-sign inside a `.app`.** The clone source is the inner `…/CrossOver.app/Contents/SharedSupport/CrossOver` directory, as in `detectAllowedCrossover` (`CX_ROOT_SUFFIX`). Gatekeeper `-67018` / `Killed: 9` otherwise (spike 062).

On this machine: CrossOver 26.3.0.39832; both `bin/wineloader` and `lib/wine/x86_64-unix/wine` are `flags=0x10000(runtime)` with exactly the five stock entitlements (`allow-unsigned-executable-memory`, `disable-executable-page-protection`, `disable-library-validation`, `device.audio-input`, `device.camera`). `[VERIFIED: codesign -d --entitlements on the installed CrossOver]`

### Pattern 2: Route selection and registry (Research Q5)

`CX_ENV` code is **not** in a `cxTokens` block inside `fireBridgeWineLaunch`. It is in `buildDrmLaunchEnvironment` (`games.ts` L750-900): `cxTokens` is filled only when the DLL-overrides or DLL-path channel is `cx_env`; the merge into any existing `CX_ENV` is L887-894, with the single-quote guard `t.slice(t.indexOf("'")+1,-1).includes("'")`. Live config is `DRM_DLLPATH_CHANNEL='not-needed'` and `DRM_DLLOVERRIDES_CHANNEL='dll-option'`, so no `CX_ENV` is emitted for DRM today.

**Extract the merge into one shared helper** `appendCxEnvTokens(env, tokens)` returning `{status:'ok', env}` or `{status:'error', cause}`, used by both the DRM builder (add an optional `overlayTokens?: string[]` to `DrmLaunchEnvInput`) and the TCP overlay path. Keep the existing `existing ? existing + ' ' + joined : joined` semantics, because a known-fix `envVariables` entry could already hold `CX_ENV`.

**Where the branch points are (`games.ts`, line numbers as read):**
| Step | Location | Overlay action |
|------|----------|----------------|
| DRM/TCP split | `launchBridgeGameBody` L4429-4470 (`wantsDrm`, `preflightCrossover` vs `selectLaunchEngine`) | none |
| Engine selection (TCP) | `selectLaunchEngine` L4035-4180, ends `return {ok:true, settings:getBridgeBottleSettings(appId)}` | overlay needs `sel.kind==='crossover'`; if `isNonCrossover(sel)` log `overlay=skipped reason=fallback-engine` and skip |
| Registry clear | `drmLaunchSetup` `not-applicable` branch L4510-4516 (`clearRunner(appId)`; `hadDrmRunner` reset) | run overlay prepare **after this**; it re-registers when on |
| DRM launch | `launchDrmModeGame` L4296-4358 -> `fireBridgeWineLaunch(exePath, ready.bottleSettings, {ready,...})` | compute tokens here; pass in `DrmWineLaunch` or a new param |
| TCP call sites | L4691 (no-steam-api, no helper) and L4803 (normal) | pass `overlay` to both |
| Env assembly | `fireBridgeWineLaunch` L4985-5010 (DRM `buildEnv`) and just after `launchSettings` is computed at L4958 for TCP | append `CX_ENV`; add a "known fix swapped the runner back" guard mirroring DRM's D-11 block |
| Spawn | `runWineCommand` L5148; launcher spawns `bin/wine` directly with `process.env` + settings env | no change |

**Registry integration (`bottle.ts` L1485-1700):** `drmBridgeRunners` gates `getBridgeBottleSettings` (L1727), `killForRegisteredEngine` (L1990), `drmRunnerBinDir`. The DRM path validates `cxRoot` against `DRM_RUNNER_CXROOT_RE = …/steam-bridge/drm/runners/crossover-<build>/CrossOver$`. Relax it to `(?:drm|overlay)` and add `kind: 'drm' | 'overlay'` to the entry, so all per-appId spawns (known fixes, redists, kill/stop) use the same runner and the same wineserver. `drmRunnerWineInstallation` names the install "(GameLib DRM runner)"; add an overlay label for the log.

When the registered runner changes (stock to overlay, overlay to stock, either to DRM), run the existing `endPerGameBridgeBottleSession` before registering, exactly as `drmLaunchSetup` does (L420-436) so a clone never joins a stock wineserver left by an earlier launch. Toggling the overlay between launches is the new exposure.

### Pattern 3: Token set and validation (D-12)

Exactly as the spike (`062 run.sh` L79-91 and the spike skill):
```
DYLD_INSERT_LIBRARIES='<shim>:<SBIN>/steamloader.dylib:<SBIN>/gameoverlayrenderer.dylib' SteamOverlayGameId=<appid> SteamGameId=<appid> SteamAppId=<appid>
```
`SBIN` = `<userHome>/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS` (`MAC_STEAM_CLIENT_SUBPATH` in `games.ts`). Validate before use: each path absolute, no control chars, no `'`, **no `:`** (the insert-list delimiter; `buildDrmLaunchEnvironment` already rejects `:` for its own list), and each file exists as a regular file. A missing file is an `overlay-steam-dylibs` / `overlay-shim` step failure (D-08), not an exception. appId matches `^[0-9]{1,10}$`.

Verified locally: both Steam dylibs exist, `steamloader.dylib` is `i386 x86_64 arm64`, `gameoverlayrenderer.dylib` is `x86_64 arm64`. The Wine process is x86_64 under Rosetta, which is why the shim needs the x86_64 slice. `[VERIFIED: lipo -info on this machine]`

### Pattern 4: Build the shim (Research Q3)

Add a third compile target to `meta/buildSteamBridgeShims.ts`, called from `main()` after `compileHelper()`. The NotProton recipe (their Makefile, `OVERLAY_SHIM_FLAGS`) built clean here under a fake HOME with both archs, then `lipo -create`, then `codesign -fs -`. `[VERIFIED: ran it in the scratchpad with env -i HOME=<fake>]`

```ts
// Source: NotProton Makefile OVERLAY_SHIM_FLAGS, run locally 2026-11-02
const OVERLAY_SHIM_FLAGS = [
  '-mmacosx-version-min=<GameLib floor>', '-Werror=unguarded-availability-new',
  '-dynamiclib', '-O2', '-Wall', '-Wextra',
  '-install_name', '@rpath/overlay_shim.dylib',
  '-framework', 'Metal', '-framework', 'QuartzCore',
  '-framework', 'CoreGraphics', '-framework', 'CoreFoundation', '-framework', 'Foundation'
]
// two clang runs: -arch arm64 -> tmp/overlay_shim.arm64.dylib; -arch x86_64 -> tmp/overlay_shim.x86_64.dylib
// lipo -create both -output public/bin/<arch>/darwin/overlay_shim.dylib
// codesign -fs - <output>      (arm64 slices require a signature; ad hoc is fine)
```
- **Both slices are required regardless of the bundle's target arch.** The injected process is x86_64 (Rosetta), the sidecar is arm64. (`clang -arch` for the Rosetta slice; release CI has only an arm64 leg now, `release-tauri.yml` L150.)
- Output path: `public/bin/<resolveBridgeArch()>/darwin/overlay_shim.dylib`, next to `steam-bridge-helper`. The Tauri macOS bundle already maps `Resources/build/bin/arm64/darwin` to `../build/bin/arm64/darwin` (`src-tauri/tauri.macos.conf.json`), so no packaging config change is needed. `meta/signMachOResources.ts` re-signs every Mach-O under that tree for notarization; the loaders have `disable-library-validation`, so a Developer-ID-signed or ad hoc dylib loads either way.
- Runtime lookup: add `builtOverlayShimPath = fixAsarPath(join(publicDir,'bin',process.arch,'darwin','overlay_shim.dylib'))` in `src/backend/constants/paths.ts`, beside `steamBridgeHelperPath`. `publicDir` is `public` in dev and `build` packaged. Dev needs `pnpm build-steam-bridge` first, else the `overlay-shim` step fails open (log + toast every launch, per D-09). Say so in the dev docs, because the same trap exists for the helper (memory: fresh worktree needs build prep).
- `-mmacosx-version-min`: the shim compiled with zero diagnostics at 11.0, 12.0, 13.0 and 15.0 (NotProton uses 15.0). Use GameLib's minimum macOS. `[VERIFIED: local clang runs]` GameLib's declared floor was not found in `src-tauri/*.json` (`[ASSUMED]` that no floor is set), so the planner should pick it.
- Spawn convention: `buildSteamBridgeShims.ts`'s `spawnArgv` has no `env` literal (the isolation gate only flags hand-rolled `env`). `buildDrmNativeParts.ts` imports `createFakeHomeProfile`. For the new clang/lipo/codesign spawns use `createFakeHomeProfile().childEnv()`, which I verified is sufficient for clang with fake HOME. Add `buildOverlayShimCompileArgv(arch)` as a pure exported function so `meta/__tests__/buildSteamBridgeShims.test.ts` can assert argv, matching `buildHelperCompileArgv`.
- Do not vendor `overlay-shim/tests/` (not needed, and it carries its own build rules).

**Vendoring (D-14):** copy `overlay_shim.m` byte-for-byte (1058 lines, verify `git hash-object` equals `194b5fba7c0f145a9d7e227fc5ace2e2333e2299`). The source has no per-file copyright header, so the licence notice is the repo-level GPLv3: ship `LICENSE` (GPLv3 text), a `NOTICE` naming `NotProtonNot/NotProton`, the pinned commit, the blob and sha256, and add an entry to `THIRD-PARTY-NOTICES.md`. GameLib is `GPL-3.0-only`, so the combination is licence-compatible. `[VERIFIED: package.json "license"; NotProton NOTICE]`

### Pattern 5: Per-game toggle, known-fix flag, precedence (Research Q6)

**Per-game setting.** `GameSettings` (`common/types.ts` L301-340) already carries `steamEngineOverride?: string`. D-03 requires the user choice to win in both directions, so a boolean cannot represent "unset". Add a **string tri-state** beside it: `steamOverlayOverride?: 'automatic' | 'on' | 'off'` (undefined = automatic). Follow the engine override's conventions: parse defensively, never a path.

**UI.** `SteamEngineOverride.tsx` is the model: a `<details>` + `SelectField` inside `GamesSettings/index.tsx` L267-271, shown only for `!isDefault && isMac && gameInfo?.runner === 'steam'`, with `labelHelp={<InfoIcon …/>}` (memory: help is an icon-only (i) on the label line, never a "Help" text link). Add a sibling component `SteamOverlayOverride.tsx` using `useSetting('steamOverlayOverride','automatic')`. It is **not** the same eligibility as the engine override: `overrideEligible` excludes DRM-mode titles (`!d.isDrmModeTitle`), but the overlay applies to DRM titles too. Add `overlayEligible?: boolean` to `SteamEngineState` (`common/types/steam.ts`), true whenever `bridgeInstallBottleFor(appId) !== null` on macOS (`engineState.ts` L218-222 computes the same bottle check). Labels: "Automatic (on, unless a known fix turns it off)", "On", "Off". Add the new strings to the gamelib namespace and run `lint-translations`. `public/locales/` is prettier-ignored, so no prettier check for catalogue files (see Validation).

**Reading at launch.** `GameConfig.get(id).config` fills asynchronously and returned undefined on first read after restart (59-UAT G11). Add `readStoredOverlayOverride(appId)` mirroring `readStoredEngineOverride` (`engineDecision.ts` L355-370): read `gamesConfigPath/<appId>.json` directly, `raw[appId]?.steamOverlayOverride`.

**Known-fix flag.** `KnownFixOverlayEntry`/`overlays` (tier 2) are payload archives, unrelated. Name the new key `steamGameOverlay` with the single allowed value `"off"`. Make it **tier 1**: add it to `TIER1_KNOWN_FIX_KEYS` in `backend/knownFixes.ts` L80, add to `KnowFixesInfo` in `common/types.ts` L1160, and validate in `filterTier1KnownFixes` (accept only `"off"`, same style as `drm: 'ceg'`). Rationale: it can only remove an injection, it runs no new code, and D-03 wants every user to get the fix without a release. Read it via `readKnownFixes(appId,'steam')`. Two things the planner must verify (not read in full here): whether `steamGameOverlay` belongs in `TIER1_ROUTING_KEYS` (it would then not count as a "fix" for the GameLib row; I recommend it does count, so leave it out), and the drift test `knownFixReportDrift.test.ts` that pins the tier-1 key list. `[VERIFIED: knownFixes.ts L80-131; filterTier2Profile L269-297]`

**Precedence function (pure, unit-tested):**
```ts
export function resolveOverlayEnabled(a: {
  platform: NodeJS.Platform
  userOverride: unknown      // from readStoredOverlayOverride
  knownFixOff: boolean       // tier-1 steamGameOverlay === 'off'
}): { enabled: boolean; source: 'platform' | 'user' | 'known-fix' | 'default' } {
  if (a.platform !== 'darwin') return { enabled: false, source: 'platform' }
  if (a.userOverride === 'on') return { enabled: true, source: 'user' }
  if (a.userOverride === 'off') return { enabled: false, source: 'user' }
  if (a.knownFixOff) return { enabled: false, source: 'known-fix' }
  return { enabled: true, source: 'default' }
}
```
Log the `source` on every launch so a support log explains why the overlay was or was not injected.

### Pattern 6: Notices (Research Q8)

- The "toast" is `notify({ title, body })` from `backend/dialog/dialog` (an OS notification). Phase 59's fallback toast is exactly `notify({title, body})` at `games.ts` L4165 and fires every launch, which matches D-09. `maybeNotifyDrmModeFailed` (L3893) is the dedupe-per-session variant, with dialog and `app.raiseMainWindow()`; do not copy its `drmModeNoticeShownThisSession` dedupe, because D-09 says not deduplicated. A raised dialog on every overlay failure would also be intrusive for an enhancement: use `notify` only.
- Log line shape: `formatDrmNoticeLine` produces `[bridge-notice] appId=<id> reason=drm-<step> cause=<token>` with a whitespace-free token so a game- or filesystem-supplied string cannot inject a second log line. Write `formatOverlayNoticeLine(appId, step, cause)` the same way with `reason=overlay-<step>`.
- **Do not extend `DRM_STEPS` / `DrmStep`.** `steamclientLayerMode.ts` has a zero-imports rule (`meta/bridgeCensus.ts` bundles it), and `drmStepNoticeText` has an exhaustive `never` switch. Add a separate `OverlayStep` union in `overlayNotice.ts`: `'steam-dylibs' | 'shim' | 'crossover-detect' | 'clone' | 'resign' | 'env'`. Copy the `normaliseCause` rules (strip control chars, cap 160).
- Toast copy goes through `i18next.t('gamelib:steam.overlay.…')`, with English defaults inline, as the neighbours do.

### Pattern 7: Abnormal exit (D-10) and the attach watcher (D-11) (Research Q7)

**D-10.** `fireBridgeWineLaunch` has two signals: (a) `winePromise` settles with `{code}` when the wrapper exits, and the CrossOver wrapper lives as long as the game; (b) the process monitor's `onFirstMatch` and `onStopped` give game-process lifetime. The current `winePromise.then(() => …)` ignores the result. Treat a launch as abnormal when the game process was seen, was gone within a window (recommend 30 s after first match), and the wrapper code is non-zero. If only one of the two signals is available, use lifetime alone. Both thresholds are discretion; make them named constants. If the game never appeared, Phase 59's launch deadline owns that case (`onBridgeLaunchDeadline`), so do not duplicate it.

On abnormal exit of an overlay-injected launch: log `[bridge-notice] appId=… reason=overlay-exit-abnormal`, then show the existing `showEngineDialog`-style message (`notify` + modal) that names the overlay and the toggle's location. No auto-retry. Linking: a modal MESSAGE dialog cannot link. Options for the "links to the toggle" requirement, in increasing cost: (1) text only: "Game settings > Advanced > Steam overlay"; (2) push an `overlayNotice` through the existing `SteamEngineState` push and render a button in `SteamEngineNotices.tsx`, which the game page already mounts, with the button navigating to the game's settings. The UI-phase gate or the planner should pick one; I recommend (2) if the settings route for a game is easy to reach, else (1). I did not find a one-call "open this game's settings" helper; routes are `settings/:type` in `App.tsx`.

**D-11.** Mac Steam logs `[YYYY-MM-DD HH:MM:SS] GameOverlay: started '<path>/gameoverlayui' (pid N) for game process <pid>` to `~/Library/Application Support/Steam/logs/console_log.txt`. `[VERIFIED: grep of this machine's console_log.txt shows 8 such lines]`. The file is about 670 KB and contains many old matches, so never match without a time bound. The repo already has what is needed in `bottleLaunchSignals.ts`: `readBoundedTail(path, maxBytes=65536)` (open, stat, read the tail, close in `finally`, never throws) and a `[…]`-timestamp parser with a `launchStartedAt - 5000` cutoff. Reuse them. Write `overlayAttachWatch.ts`:
- Start at the monitor's `onFirstMatch` (so a first-run prefix update does not eat the window); if there is no monitor (no install root), start at spawn.
- Poll every 1 s for at most 10 s using a **tracked, unref'd** `setTimeout` chain (`bottleProcessMonitor.ts` L245 is the model: "Tracked, unref'd sleep"). Cap total work (about 10 reads of 64 KB). Register an abort in `createAbortController` so stdin-EOF `callAllAbortControllers()` ends it.
- Match only lines whose timestamp is at or after `launchStartedAt - 5000`. Capture `gameoverlayui` pid and game pid. If the process monitor knows the game's host pid, prefer matching it; otherwise accept the first matching line after the cutoff. (Timestamps are local time, second resolution.)
- Output: one `logInfo` per launch, `overlay attach: attached gameoverlayui pid=N game=PID after Xs` or `overlay attach: not attached within 10s`. No UI, no toast. This also is the D-15 attach-line evidence, so log the whole matched line (bounded) too.
- Nothing runs at module import, and nothing runs at sidecar boot. This keeps the exit contract: every handle unref'd, no unbounded in-flight work.
- Real HOME is needed here (it reads Mac Steam's real log directory). That is the declared real-profile arm; it spawns no process and only reads one file. Say so in the module docblock, as `launchDrmModeGame` does.

### Anti-Patterns to Avoid
- **Re-signing inside a copied `.app`** (Gatekeeper `-67018`, `Killed: 9`).
- **Re-signing only the `lib/wine/x86_64-unix/wine` loader.** `bin/wine` execs `bin/wineloader` first, which strips `DYLD_*` (spike 062 run 2).
- **Plain-env `DYLD_INSERT_LIBRARIES` on CrossOver launches.** The wrapper drops it. Use `CX_ENV`.
- **Starting `gameoverlayui` from GameLib.** Two overlays.
- **Gating the Steam dylibs** on GPU/macOS: D-13 permits gating only the shim, and the shim needs no gate.
- **Screenshots as evidence.** Operator only (D-15).
- **Putting the failure toast behind a session dedupe** (D-09).
- **Throwing from overlay setup.** Every overlay function returns a result object and never rejects; the caller wraps it in a `try` so a bug here cannot break a launch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| APFS clone, abortable cp, rm safety, ps in-use scan | New clone code | `runnerClone.ts` primitives (export them) | Already hardened: 900 s abortable cp, `safeRemove` containment, fail-safe `ps` |
| Loader re-sign and entitlement dump | Shell `plutil -insert` flow | `dumpLoaderEntitlements` + generated plist + `codesign --force --sign - --options runtime --entitlements` | Existing, tested, fake-HOME |
| Bounded log tail | `fs.readFileSync` of a 670 KB log | `readBoundedTail` | Never throws, bounded, async |
| `[bridge-notice]` line formatting | Template string | Copy `formatDrmNoticeLine`'s token sanitiser | Prevents log-line injection |
| `CX_ENV` merge + quote guard | Re-implement | Extract the games.ts L887-894 block | One place for the `'` rule |
| Reading a per-game setting at launch | `GameConfig.get(id).config` | Direct file read like `readStoredEngineOverride` | The async-fill trap (59-UAT G11) |
| Metal pipeline-format fix | Own swizzles | Vendored `overlay_shim.m` | 1058 lines of hard-won Metal 4/HDR logic |
| Fake-HOME env | `{ HOME: … }` literal | `createFakeHomeProfile().childEnv()` | Enforced by `fakeHomeIsolation.test.ts` |

**Key insight:** every hard part of this phase (clone safety, re-sign, bounded tail, notice shape, setting readers) already has a tested implementation in the repo. The new work is parameterisation, wiring and fail-open discipline.

## Runtime State Inventory

Not a rename/refactor phase, but the DRM clone schema change touches persisted state:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing DRM clones under `<appFolder>/steam-bridge/drm/runners/crossover-<build>/` carry `gamelib-runner.json` `schema: 1` | Marker bump to `schema: 2` makes verify fail once and rebuild (data migration by rebuild, no code to migrate). Fails with "in use" only if that title is running. |
| Live service config | None. Overlay settings live in per-game `GameConfig` JSON (`steamOverlayOverride`) | Code only |
| OS-registered state | None | None, verified: no launchd/Task Scheduler entries involved |
| Secrets/env vars | None. `SteamOverlayGameId`, `DYLD_INSERT_LIBRARIES` are launch-time env values, not stored | None |
| Build artifacts | `public/bin/<arch>/darwin/overlay_shim.dylib` must be built; a stale dev tree has no shim | `pnpm build-steam-bridge`; fail-open if absent |

A stale in-memory registry entry survives game exit by design (`drmBridgeRunners` is cleared only by the next launch's `drmLaunchSetup`). The overlay inherits that; confirm toggling off then launching clears it (it does, via the `not-applicable` clear plus `hadDrmRunner` reset).

## Common Pitfalls

### Pitfall 1: DRM clone re-sign failure turns an enhancement into a DRM blocker
**What goes wrong:** D-05 adds a `bin/wineloader` re-sign to the DRM clone build, which is fail-closed (D-56-13).
**How to avoid:** make it best-effort and record `wineloaderResigned` in the marker. On false, skip tokens and notify (Pattern 1.5).
**Warning signs:** a DRM launch failing with `runner-patch` after the change, on a CrossOver build whose `bin/wineloader` differs.

### Pitfall 2: Overlay clone joins a stock wineserver (or the reverse)
**What goes wrong:** a bottle's wineserver started by stock CrossOver (e.g., by an earlier launch, or by known-fix steps run with the stock runner) is joined by the clone's `bin/wine`.
**How to avoid:** register the runner before known fixes/redists run (so `getBridgeBottleSettings` returns the clone for all of them), and call `endPerGameBridgeBottleSession` when the registered runner changes.

### Pitfall 3: Stale console_log lines read as "attached"
**What goes wrong:** the log holds old `GameOverlay: started …` lines from earlier sessions.
**How to avoid:** timestamp cutoff (`launchStartedAt - 5000`) and prefer the monitor's game pid.

### Pitfall 4: Shim trace is lost on TCP launches
**What goes wrong:** only DRM launches pass `options.onOutput`. The shim logs to stderr (`shim_log` is `vfprintf(stderr…)`), so `hook_set_pixel_format` never reaches a GameLib log, and D-15 cannot record it.
**How to avoid:** for overlay launches, attach a bounded wine-log sink. `createDrmWineLogAppender` / `stageWineLog.ts` (`openStageWineLog`: O_EXCL, 0700 dir, size cap, retention) are the model. Put it under `<appFolder>/steam-bridge/overlay/trace/`. Also copy lines starting with `overlay_shim` into the main launch log, capped (the shim logs a handful of lines per run, but `hook_set_pixel_format` logs only on change).

### Pitfall 5: `CX_ENV` quoting
Values with spaces (`Application Support`) work inside single quotes. A `'` anywhere in a path breaks the token. Validate and fail open (`env` step). Also reject `:` in any inserted path.

### Pitfall 6: Dev tree has no shim, so every launch toasts
In `tauri dev`, `overlay_shim.dylib` is absent until `pnpm build-steam-bridge`. D-09 says toast every launch. That is correct behaviour, but call it out in the dev notes (memory: tauri dev does not rebuild the sidecar either; restart dev before live testing, check `sidecar.js` mtime).

### Pitfall 7: Bottle with `"d3d11"="native,builtin"` before a D3DMetal test
Spike 063 run 1 crashed before the bridge attached. Check `user.reg` DllOverrides before the Planet Crafter and Manor Lords runs.

### Pitfall 8: Unreal titles
Launch Manor Lords through the UE stub, never `…-Shipping.exe` (the bridge does not attach otherwise, spike 064).

### Pitfall 9: Shim input blocking depends on a symbol only NotProton's lsteamclient calls
`np_overlay_shim_set_active` (added in commit `0c798e7`, "Block game input while the Steam overlay is open") is only invoked by NotProton's lsteamclient on `GameOverlayActivated_t`. GameLib's own lsteamclient and the TCP shim never call it, so the game keeps receiving input while GameLib's overlay is open. Spike 064 recorded "clicks OK" for Manor Lords, so this is a UAT observation, not a blocker. Ask the operator to note whether game input leaks through while the overlay is open. `[VERIFIED: overlay_shim.m L1006-1030; ASSUMED that GameLib's lsteamclient lacks the call; grep it]`

### Pitfall 10: Selecting the overlay clone by name is not robust to a CrossOver reinstall of the same build
Same CFBundleVersion with different binaries would reuse a clone built from the old loaders. Hash the source loaders into the marker (Pattern 1.2).

### Pitfall 11: Executing the downloaded shim source
Compiling is fine; the vendored `.m` is built, never executed during research. Pin the SHA and verify `git hash-object` in a test so a future edit to the vendored copy is deliberate.

## Code Examples

### D-13 shim reading: why it no-ops safely
```c
// Source: NotProtonNot/NotProton@0c798e7148efe279627573f864210064788b427c overlay-shim/overlay_shim.m L216-229
static int interpose(Class target, const char *selector_name, IMP replacement, IMP *previous)
{
	if (target == Nil)
		return 0;
	Method method = class_getInstanceMethod(target, sel_registerName(selector_name));
	if (method == NULL)
		return 0;
	*previous = method_getImplementation(method);
	method_setImplementation(method, replacement);
	return 1;
}
```
Every swizzle goes through this. Classes are not named; they come from live objects, e.g. `ensure_device_hooks` L700-716 does `stage_claimed(object_getClass(device), &device_class, "device")` and then `interpose(device_class, "newMTL4CommandQueue", …)`. A GPU or macOS without that class or selector yields `hooked=0` and the hook is never installed (and the `next_*` pointer is never called). The constructor (L1040-1058) returns early with `CAMetalLayer absent, nothing to correct` if `CAMetalLayer` is missing, and every `ensure_*_hooks` function guards `nil` objects. The only AGX strings are in the spike logs (`AGXG17XFamilyCommandQueue_mtlnext`), which are printed class names, not hard-coded. `[VERIFIED: grep -n "AGX" overlay_shim.m returns nothing]`

**D-13 verdict: inject the shim on every overlay launch; do not gate on GPU or macOS version.** Residual risk (cannot be excluded by reading): a private class whose swizzled selector exists but changed signature would crash rather than no-op; `stage_claimed` claims only the first device class, so a multi-GPU Mac gets hooks on one device only (it logs `second device class …`). Keep the D-10 abnormal-exit message and the per-game toggle as the mitigation, and ask the operator to note the GPU and macOS in the UAT.

### CX_ENV append helper (extract from games.ts L887-894)
```ts
// Source: existing code in buildDrmLaunchEnvironment, generalised
export function appendCxEnvTokens(
  env: EnviromentVariable[], tokens: readonly string[]
): { status: 'ok'; env: EnviromentVariable[] } | { status: 'error'; cause: string } {
  // single-quoted values may not contain a quote; unquoted tokens are KEY=digits
  if (tokens.some((t) => t.includes("'") && t.slice(t.indexOf("'") + 1, -1).includes("'")))
    return { status: 'error', cause: 'invalid CX_ENV value' }
  const existing = env.find((e) => e.key.toLowerCase() === 'cx_env')?.value
  const joined = tokens.join(' ')
  return {
    status: 'ok',
    env: [
      ...env.filter((e) => e.key.toLowerCase() !== 'cx_env'),
      { key: 'CX_ENV', value: existing ? `${existing} ${joined}` : joined }
    ]
  }
}
```

### Staging probe (D-07 evidence)
```
# a universal probe dylib with a constructor that prints a line; run under a scrubbed env
env -i PATH=/usr/bin:/bin HOME=<fake> DYLD_INSERT_LIBRARIES=<probe.dylib> \
  ".../steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wine" --version
=> PROBE-LOADED pid=98959
   wine-11.20 (Staging)
```
`[VERIFIED: ran 2026-11-02]` See the D-07 section for the full answer.

## D-07 verdict (Research Q1): Phase 59 fallback engine

| Question | Finding | Evidence |
|----------|---------|----------|
| Pinned build | Gcenx `wine-staging-11.20-osx64.tar.xz` (size 227975304, sha256 `4df858c5…cd952`) + DXVK-macOS `v1.10.3-20230507-repack` | `engine/enginePins.ts` `ENGINE_PINS.current` |
| Launch path | `buildFallbackGameSettings` returns `wineVersion {type:'wine', bin: engine.wineBin}`; `runWineCommand` does `spawn(wineBin, commandParts, {env: process.env + settings env})` directly: no wrapper script, no `CX_ENV`, no `arch`/`sh` hop | `bottle.ts` L1675-1700; `launcher.ts` L1560-1600 |
| Do its loaders strip `DYLD_*`? | **No.** `Contents/Resources/wine/bin/wine` and `wineserver` are x86_64 Mach-O, signed `flags=0x2(adhoc)`: no hardened runtime, no entitlements. `Contents/MacOS/wine` is unsigned. A probe dylib passed in plain `DYLD_INSERT_LIBRARIES` loaded in the Staging loader | `codesign -dv` + probe run on the installed engine under `steam-engines.bak/wine-staging-11.20` |
| How does env reach the game? | Plain env on the spawned wine process (`enviromentOptions` in the fallback settings), inherited by wine's children | `launcher.ts` spawn |
| Re-sign needed? | No | same |
| Cloning needed? | No | same |

**Verdict: mechanically cheap, but not cheap overall.** The wiring is a few lines (append four env vars to the fallback `enviromentOptions`). The cost is correctness, which nobody has checked:
- Plain env injects **every process in the wine tree** (wineserver, services, winedevice, the bridge helper `steam.exe`, the game). Under CrossOver `CX_ENV` the spikes only looked at the game pid. Multiple injected processes with `SteamOverlayGameId` could produce more than one `gameoverlayui` or odd attach behaviour. `[ASSUMED]`
- The overlay on Staging's winemac + DXVK-macOS 1.10.3 / MoltenVK path is untested (the spike skill says "Wine-Staging, GPTK and the pinned DXVK engine are untested").
- D-15 gates four CrossOver titles. No fallback-engine title is in the gate, and the fallback path is used by people who just lost CrossOver, so a broken injection there is costly.

**Recommendation:** do not inject on the fallback engine in Phase 60. Log `overlay=skipped reason=fallback-engine` on those launches (no toast: the user did not ask for anything that failed), record the gap in the phase summary, and note the one-liner follow-up (plain-env injection of the same four values, proven mechanically here) as a deferred item with an added UAT title. This is consistent with CONTEXT's own "Otherwise fallback launches run without the overlay, and the gap is recorded".

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Bottled Steam overlay (Windows Steam in a bottle) | Inject Mac Steam's own dylibs into the Wine game via `CX_ENV` | Spikes 061-064, 2026-11-01/02 | No Windows Steam client needed; Mac Steam attaches `gameoverlayui` |
| Overlay broken on 10-bit/Metal 4 | NotProton `overlay_shim.m` pipeline-format variants + Metal 4 present bridge | NotProton commits through 2026-11-01 | Needed for D3DMetal D3D12 (RGB10A2) |

**Deprecated/outdated:** `.planning/research/ARCHITECTURE.md` describes the Electron-era process model; ignore it for this phase. The skill's statement "swizzles Apple's private `AGX*` classes" is a description of the runtime classes the shim finds, not of source-level class names.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Plain-env injection into every wine process on Staging may cause multiple overlay attaches or odd behaviour | D-07 | If it is actually harmless, deferring the fallback overlay loses a small feature; low risk |
| A2 | GameLib's `-mmacosx-version-min` floor is unset in `src-tauri/*.json`; planner picks it | Pattern 4 | Dylib may fail to load on older macOS if set too high; it compiles clean down to 11.0 |
| A3 | GameLib's own `lsteamclient` does not call `np_overlay_shim_set_active` (so game input is not blocked while the overlay is open) | Pitfall 9 | If it does call it, input behaviour differs; observable in UAT, not a blocker |
| A4 | A tier-1 known-fix key is acceptable for "overlay off" (vs tier 2) | Pattern 5 | If the user wants only bundled/local control, move it to tier 2 (one list change) |
| A5 | The CrossOver wrapper's exit code reflects the game's exit code | Pattern 7 (D-10) | If not, rely on lifetime alone; the design already degrades to that |
| A6 | `steamloader.dylib`/`gameoverlayrenderer.dylib` stay x86_64-capable in future Mac Steam builds | Pattern 3 | Overlay silently fails to attach; D-11 reports not-attached |
| A7 | Making the DRM clone's wineloader re-sign best-effort is what the user wants (D-05 vs D-08) | Pitfall 1 | If the user wants it fail-closed, DRM mode can break on an odd CrossOver |

## Open Questions

1. **D-05 vs D-08 on the DRM clone's wineloader re-sign.**
   - What we know: D-05 puts the re-sign inside the DRM clone build (fail-closed by D-56-13); D-08 says DRM-mode overlay setup failure launches on the DRM clone without tokens.
   - What's unclear: whether a wineloader re-sign failure should block DRM mode.
   - Recommendation: best-effort re-sign with a marker flag (Pitfall 1). Confirm with the user.

2. **How should D-10's "links to the per-game toggle" render?**
   - What we know: dialogs are plain MESSAGE dialogs; `SteamEngineNotices.tsx` shows inline game-page notices with buttons and is fed by the `SteamEngineState` push.
   - What's unclear: whether a deep link to the game's settings tab is acceptable work in this phase.
   - Recommendation: text pointer minimum; inline notice with a button if the UI phase can afford it.

3. **Is `steamGameOverlay` a routing key (`TIER1_ROUTING_KEYS`) or a fix?**
   - Recommendation: a fix (counts for the GameLib row). Check `knownFixReportDrift.test.ts` and the `isRoutingOnlyTier1Fix` logic before choosing.

4. **Should overlay-off-by-known-fix titles still get the shim/clone?** No: off means stock CrossOver (TCP) or DRM clone without tokens (DRM).

5. **Window for D-10.** Recommended 30 s after first match; the planner finalises.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Apple clang (Xcode CLT) | Shim build | yes | CLT, SDK 27.0 | none (build host only) |
| `lipo`, `codesign`, `xattr`, `plutil`, `cp -c` | Shim build, clone | yes | system | none |
| CrossOver | Overlay clone, UAT | yes | 26.3.0.39832, both loaders runtime-hardened with the 5 stock entitlements | overlay skipped (fail-open) |
| Mac Steam (signed in) | Dylibs, UAT | yes | `steamloader.dylib` (i386/x86_64/arm64), `gameoverlayrenderer.dylib` (x86_64/arm64) present | D-08 notice, no overlay |
| Rosetta 2 | Staging probe, Wine x86_64 | yes | probe ran | — |
| `gh` CLI | Fetching the shim pin | yes | — | — |
| Pinned Staging engine on disk | D-07 probe | yes | `steam-engines.bak/wine-staging-11.20` | — |
| The four UAT titles installed | D-15 | not checked | — | operator to confirm before the live gate |

**Missing dependencies with no fallback:** none for planning. **Missing with fallback:** none identified.
Host is macOS 27.0.1 (Darwin 27); spikes ran under the same host family per the skill, so behaviour on older macOS is untested.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7 (`"test": "jest"`); root `jest.config.js`, meta project `meta/jest.config.js` |
| Config file | `/Users/graysonmitchell/Projects/GameLib/jest.config.js` |
| Quick run command | `pnpm exec jest src/backend/storeManagers/steam/bridge/overlay src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts` |
| Full suite command | `pnpm test:ci` (plus `pnpm codecheck`, `pnpm lint`, `pnpm planning-gates`, `pnpm smoke:sidecar`) |

### Phase Decisions -> Test Map
| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-01..D-03 | `resolveOverlayEnabled` precedence incl. user-on beats known-fix-off, platform gate | unit | `pnpm exec jest overlayLaunch.test` | Wave 0 |
| D-02 | Setting reader returns tri-state, ignores junk | unit | `pnpm exec jest readStoredOverlayOverride` | Wave 0 |
| D-02 | Toggle renders, writes `steamOverlayOverride`, hidden on Default/non-mac | component | `pnpm exec jest SteamOverlayOverride.test` | Wave 0 |
| D-03 | Tier-1 filter accepts only `"off"`; drift/routing tests still green | unit | `pnpm exec jest knownFixes knownFixReportDrift` | exists (edit) |
| D-04 | Overlay clone: no ntdll patch, both loaders re-signed with derived entitlements, sibling root, marker, re-clone on build/source-loader change (fake `runTool` + synthetic tree) | unit | `pnpm exec jest overlayRunnerClone.test` | Wave 0 |
| D-04 | Real-CrossOver arm (opt-in, not CI) | integration | gated like `ntdllPatch.realCrossover.test.ts` | Wave 0 |
| D-05 | DRM clone re-signs wineloader; marker schema 2; best-effort flag; old marker triggers rebuild | unit | `pnpm exec jest runnerClone.test` | exists (edit) |
| D-06 | Overlay attempted on a build absent from the allowlist | unit | `overlayRunnerClone.test` | Wave 0 |
| D-07 | Fallback selection skips overlay and logs reason | unit | `pnpm exec jest games.test -t overlay` | exists (edit) |
| D-08 | Every setup failure returns a step error, launch proceeds on stock/DRM-without-tokens, `notify` called each time, notice line shape | unit | `overlayLaunch.test`, `games.test` | Wave 0 / edit |
| D-09 | No session dedupe: two launches, two notifies | unit | `games.test` | edit |
| D-10 | Abnormal-exit predicate (code, lifetime) and message content | unit | `overlayLaunch.test` | Wave 0 |
| D-11 | Watcher: matches only post-cutoff lines, 10 s bound, unref'd timers, aborts on controller abort | unit (fake timers) | `pnpm exec jest overlayAttachWatch.test` | Wave 0 |
| D-12 | Token string exactly `DYLD_INSERT_LIBRARIES='<shim>:<steamloader>:<gameoverlayrenderer>' SteamOverlayGameId=… SteamGameId=… SteamAppId=…`, shim first; rejects `'`, `:`, control chars | unit | `overlayLaunch.test` | Wave 0 |
| D-12 | `appendCxEnvTokens` merges with existing `CX_ENV` | unit | `pnpm exec jest buildDrmLaunchEnvironment` | exists (edit) |
| D-13 | Static: vendored file hash equals the pin, contains no hard-coded class gate | unit | `pnpm exec jest overlayShimVendor.test` | Wave 0 |
| D-14 | `buildOverlayShimCompileArgv` argv per arch, output path, `lipo` step; vendored hash; NOTICE present | unit | `pnpm exec jest --selectProjects Meta buildSteamBridgeShims.test` | exists (edit) |
| D-14 | Real build produces fat x86_64+arm64 dylib | smoke (build host) | `pnpm build-steam-bridge && lipo -info public/bin/arm64/darwin/overlay_shim.dylib` | n/a, manual command |
| Every spawn | Fake-HOME isolation | gate | `pnpm exec jest fakeHomeIsolation` | exists |
| Sidecar exit | No import-time work; watcher unref'd | smoke | `pnpm smoke:sidecar` | exists |
| D-15 | Shift+Tab opens overlay, draws correctly, takes clicks on all 4 titles; bridge verified strictly (HELLO + clean game Steam-init log; DRM: lsteamclient trace) | **manual-only live UAT** | operator on this Mac | n/a |
| D-15 | `vmmap <pid>` lists shim + steamloader + gameoverlayrenderer; D-11 attach line; `hook_set_pixel_format` trace | **manual-only live UAT** (evidence captured by operator, shim trace via new wine-log sink) | operator | n/a |
| D-16 | What the overlay's invite button does in a bridged game | **manual-only live UAT** (record only) | operator | n/a |

Manual-only justification: overlay correctness and clicks cannot be machine-verified (spike 062 run 3: `screencapture` returns stale frames of the Metal surface). The live gate follows the project's live-gate contract (see `references/live-gate-contract-authoring.md` in the spike skill for UAT item shape; remember `### N.` at column 0, inline `expected:`, `result:` opening with a status word).

### Sampling Rate
- **Per task commit:** the quick run command above for touched modules, plus `npx prettier --check <exact paths written>`
- **Per wave merge:** `pnpm test:ci`, `pnpm codecheck`, `pnpm lint`
- **Phase gate:** full suite green, `pnpm planning-gates`, `pnpm smoke:sidecar`, `pnpm lint-translations`, then the four-title live UAT before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `bridge/overlay/__tests__/overlayLaunch.test.ts` - D-01/03/08/10/12
- [ ] `bridge/overlay/__tests__/overlayRunnerClone.test.ts` - D-04/06 (copy the synthetic-tree + fake `runTool` style of `runnerClone.test.ts`)
- [ ] `bridge/overlay/__tests__/overlayAttachWatch.test.ts` - D-11
- [ ] `bridge/overlay/__tests__/overlayShimVendor.test.ts` - D-13/14 hash pin
- [ ] `frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx` - D-02
- [ ] Framework install: none (Jest exists)

Formatter rule for every task's `<verify>` (per `Skill("gamelib-conventions")`): run `npx prettier --check` over the exact paths written, after `npx prettier --file-info <path>` confirms they are not ignored. Ignored trees you will write to: `.planning`, `public/locales/` (catalogue edits), `.claude`. For tasks that write only ignored paths, say so and omit the check. The vendored `overlay_shim.m` has no prettier parser and `native/` should be checked with `--file-info` first. All new `.ts`/`.tsx` files are checkable.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes (filesystem) | 0700 runners root, no symlink roots, realpath/containment checks (`drmPaths.ts` `contained()` pattern) |
| V5 Input Validation | yes | Strict regex on appId, CFBundleVersion (`BUILD_RE`); path validation (absolute, no control chars, no `'`, no `:`) before `CX_ENV`; known-fix value allow-list (`"off"` only) |
| V6 Cryptography | yes (integrity) | SHA-256 via Node `crypto` for loader/marker verification; never hand-rolled; vendored shim pinned by sha256 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Trust widening: ad hoc re-signed, runtime-hardened loader with dyld env allowed and library validation off | Elevation of privilege | Same class DRM mode accepts. 0700 root, re-hash every launch, marker pins source and result hashes, clone only the inner `SharedSupport/CrossOver` |
| Planted file/symlink in the runners root or trace dir | Tampering | `lstat` real-directory checks, `O_EXCL` file creation (as `stageWineLog.ts`), `safeRemove` containment |
| `CX_ENV` / env injection via a crafted path | Tampering | Reject `'`, `:`, control chars; absolute paths only; fail open |
| Log-line injection from filesystem or game strings | Tampering / Repudiation | Whitespace-free token sanitiser in `formatOverlayNoticeLine` |
| Untrusted console_log.txt content | Tampering | Bounded tail, strict anchored regex, numeric pid capture only |
| Remote known-fix file disables or alters launches | Tampering | Tier-1 key accepts only `"off"` (can only remove behaviour), same as `drm: 'ceg'` precedent |
| Supply chain of the vendored shim | Tampering | Pin commit + blob + sha256, byte-identical copy, test asserts the hash, built from source in GameLib's pipeline, no prebuilt binary |
| Spawn with the real profile leaks user data to logs | Information disclosure | `createFakeHomeProfile().childEnv()` for cp/xattr/codesign/plutil/ps/clang/lipo; the only real-profile arm is the read-only console_log tail, declared in its docblock |

## Sources

### Primary (HIGH confidence)
- Codebase reads: `runnerClone.ts`, `drmPaths.ts`, `drmLaunchSetup.ts`, `steamclientLayerMode.ts`, `bottle.ts` (registry L1485-1765), `games.ts` (L750-900, L3890-3960, L4035-4180, L4296-4520, L4640-5230), `launcher.ts` `runWineCommand`, `engine/enginePins.ts`, `engineState.ts`, `engineDecision.ts`, `bottleLaunchSignals.ts`, `bottleProcessMonitor.ts`, `knownFixes.ts`, `bridgeKnownFixes.ts`, `common/types.ts`, `SteamEngineOverride.tsx`, `SteamEngineNotices.tsx`, `meta/buildSteamBridgeShims.ts`, `meta/buildDrmNativeParts.ts`, `src/backend/constants/paths.ts`
- `.claude/skills/spike-findings-gamelib/references/steam-overlay-in-bottles.md`; `.claude/skills/gamelib-conventions/SKILL.md`; spike dirs 061-064 (`062-bridge-overlay-attach/run.sh`)
- NotProtonNot/NotProton via `gh api` (2026-11-02): `overlay-shim/overlay_shim.m` at `0c798e7148efe279627573f864210064788b427c`, `Makefile` (`OVERLAY_SHIM_FLAGS`), `NOTICE`, `LICENSE`
- Local verification on this machine: shim compiled for arm64 and x86_64 under a scrubbed fake HOME (`env -i`), `lipo -create`, `codesign -fs -`, min-version sweep 11.0-15.0; Staging probe; `codesign -d --entitlements` on the installed CrossOver 26.3.0.39832 loaders; `lipo -info` on Mac Steam dylibs; `console_log.txt` line grep

### Secondary (MEDIUM confidence)
- Spike READMEs 061-064 for the coverage table and run results (operator-verified in earlier sessions; not re-run)

### Tertiary (LOW confidence)
- None used

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Everything is in-repo or verified locally; the shim pin was recomputed.
- Architecture: HIGH for integration points (read at line level); MEDIUM for the registry-`kind` approach, which is a design recommendation, not existing code.
- Pitfalls: HIGH for code-derived ones; MEDIUM for Staging multi-process injection (assumed).
- D-13 verdict: HIGH on the static reading; MEDIUM on runtime behaviour across GPUs.

**Research date:** 2026-11-02
**Valid until:** 2026-11-16 (NotProton is moving quickly: three commits touching the shim in six weeks; re-check the pin if the plan slips)
