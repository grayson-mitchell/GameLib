# Phase 17: Steam on macOS via CrossOver/Wine - Research

**Researched:** 2026-07-10
**Domain:** Electron/Wine-CrossOver process orchestration; Steam client-in-a-bottle integration
**Confidence:** MEDIUM (codebase mechanics HIGH; CrossOver bottle-creation CLI + Steam-under-Wine runtime behavior MEDIUM/LOW — flagged below)

## Summary

This phase reverses a hardcoded assumption from Phase 3 (`SteamGame.isNative() === true` on every OS) so that, on macOS, Windows-only Steam games are launched and installed through a real Windows Steam client running inside a dedicated GameLib-managed CrossOver/Wine bottle — not through the native `steam://` protocol, which today silently cannot install Windows-only depots on the native macOS Steam client. Nearly every mechanical piece needed already exists in the codebase (Wine command execution, CrossOver bottle-existence verification, ACF-based install polling, per-OS `is.*` gating, a `WineSelector` engine picker) but has never been assembled into "run a resident client app inside a bottle and delegate to it" — the closest existing analog (Legendary's `thirdPartyManagedApp` for EA App / Ubisoft Connect) is Windows-native-only and has no Wine code path, so this phase is genuinely new integration territory for GameLib, not a reuse of an existing pattern.

Two concrete gaps stand out as needing dedicated design attention during planning: (1) GameLib's existing Wine plumbing **verifies** a CrossOver bottle exists (`cxbottle.conf` file check) but has **no existing code path that creates one** — `verifyWinePrefix()` is an explicit no-op for `wineVersion.type === 'crossover'` — so bottle *creation* is new work, likely via CrossOver's `cxbottle` CLI, with syntax that is only community-documented (MEDIUM confidence) and should be spiked early; and (2) the bottled Steam client's own `steamapps/` library lives inside the Wine prefix's `C:` drive, completely separate from `getSteamLibraries()` / `buildInstalledMap()` / the existing ACF poller, all of which read the **native** `defaultSteamPath` setting — every one of those needs a bottle-aware variant or parameterization, and `hostInstallPlatform()` needs to stop hardcoding `'Mac'` for macOS installs once bottled installs exist (a bottled game is a Windows install, not a Mac one).

**Primary recommendation:** Branch inside the three existing `SteamGame` methods (`isNative()`, `install()`, `launch()`, `uninstall()`) on `isMac && info.is_mac_native === false` (confirmed-not-native, per D-11) rather than creating a parallel game class; introduce a small `steam/bottle.ts` module owning bottle provisioning/path/state, a dedicated (non-`GameConfig`) settings store for the bottle's Wine engine choice, and a bottle-scoped variant of `buildInstalledMap()`/the ACF poller pointed at `<bottle>/drive_c/Program Files (x86)/Steam/steamapps`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bottle provisioning (create CrossOver/Wine prefix, install Windows Steam) | Backend (Electron main) | — | Requires `child_process.spawn`, filesystem access to `~/Library/Application Support/CrossOver/Bottles`; must not run in renderer |
| Engine selection UI (WineSelector reuse) | Frontend (React) | Backend (`getSettings`/`setSetting` IPC) | Existing pattern — settings picked in renderer, persisted via IPC to `config.ts`/dedicated store |
| `isNative()` / install / launch / uninstall routing | Backend (`steam/games.ts`) | Frontend (`InstallGameModal.ts` short-circuit) | Backend owns the decision of *how* to install/launch; frontend owns the *entry point* gate that currently bypasses GameLib's install modal entirely for Steam |
| ACF/appmanifest polling (bottle-scoped) | Backend (`steam/library.ts`) | — | Filesystem read of `steamapps/appmanifest_*.acf`, no network; must be pointed at the bottle path, not `defaultSteamPath` |
| Bottled Steam login persistence | External (Windows Steam client's own `loginusers.vdf`/sentry inside the bottle) | Backend (path/existence checks only) | GameLib treats this as opaque per D-04 — no bridging, no parsing beyond "does a bottle exist and has it been through login setup" |
| UI bottle indicator | Frontend (`AppleWikiInfo.tsx` / Install-info tab) | — | Already the natural home per D-08; gate already frontend-computed from `gameInfo.is_mac_native`, decoupled from backend `isNative()` |
| Focus-driven install-state reconciliation | Backend (`main.ts` `'focus'` listener → `refreshInstallState()`) | — | Existing Steam-only backstop; must be extended to also re-scan the bottle's ACF path |

## Standard Stack

No new npm packages are required for this phase — confirmed by grepping `package.json` (`@node-steam/vdf@2.2.0`, `electron-store@8.2.0`, `electron@41.1.1` already present) and by the fact that every primitive needed (spawning processes, parsing VDF/ACF, filesystem checks) already has a first-party helper in the codebase (`runWineCommand`, `parse` from `@node-steam/vdf`, `downloadFile`, `getFileSize`).

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@node-steam/vdf` | `^2.2.0` [VERIFIED: package.json] | Parse the bottled Steam's own `libraryfolders.vdf` / `appmanifest_*.acf` inside the bottle, same as the native path today | Already used by `steam/library.ts::buildInstalledMap` for the native path; same parser works unmodified on the bottle's internal Steam install (it's the same file formats, just at a different filesystem root) |
| Electron `child_process.spawn` (via `runWineCommand` in `launcher.ts`) | Electron 41.1.1 [VERIFIED: package.json] | Run `SteamSetup.exe` non-silently inside the bottle; later, ask the bottled Steam client to install/launch a game | Existing chokepoint already used by GOG/Nile setup flows (`storeManagers/gog/setup.ts`) for running Windows installers under Wine |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Electron `downloadFile` util (`backend/utils.ts`, pattern seen in `legendary/games.ts::installEA`) | n/a (first-party) | Fetch `SteamSetup.exe` from Valve's CDN once, cache in a redist-style directory | First bottle provisioning only; re-use cached installer on subsequent bottle (re)creation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CrossOver `cxbottle` CLI for bottle creation | Let the user create the bottle manually in CrossOver's own GUI, GameLib only verifies+configures | Rejected by D-02 ("GameLib creates the bottle") — but should be the fallback if `cxbottle` CLI syntax verification fails during a Wave 0 spike |
| Reusing `GameConfig`-per-fake-appId for bottle settings | A dedicated `steamBottleConfigStore` (same `TypeCheckedStoreBackend` pattern as `steam/electronStores.ts`) | `GameConfig` persists to `gamesConfigPath/{appName}.json` and is designed around real library entries with a Settings-tab UI; a dedicated store avoids a phantom "game" existing anywhere reachable by the user. Recommended: dedicated store for the primary settings, but see Pitfall 3 below for a `checkWineBeforeLaunch` nuance that still wants *some* reserved appName |

**Installation:** No new packages — nothing to install.

## Package Legitimacy Audit

Not applicable — this phase introduces zero new npm dependencies. All required primitives (`runWineCommand`, `@node-steam/vdf` parsing, `downloadFile`) already exist in the codebase and are already used by shipped features (GOG/Nile Wine setup, Steam ACF polling). No `slopcheck`/registry verification is needed.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend (renderer)                                                 │
│                                                                       │
│  GamePage "Install"/"Play" click                                     │
│        │                                                              │
│        ▼                                                              │
│  InstallGameModal.ts:35 short-circuit                                │
│  (runner==='steam' && action==='install')                            │
│        │                                                              │
│        │  ── if isMac && gameInfo.is_mac_native === false ──►  route │
│        │        to bottle flow (NEW: bottle-setup-required check)    │
│        │                                                              │
│        └──  else (native mac / Windows / Linux) ──► existing         │
│              window.api.install() → steam://install (unchanged)      │
└──────────────────────────────┬────────────────────────────────────────┘
                                │ IPC
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend (Electron main) — src/backend/storeManagers/steam/          │
│                                                                       │
│  games.ts  SteamGame                                                  │
│   isNative()  → per-OS: isMac ? info.is_mac_native : true (Linux/Win) │
│   install()   → isMac && !is_mac_native?                              │
│                    ├─ NO bottle yet → provisionBottle() (guided)     │
│                    └─ bottle ready  → tellBottledSteamToInstall()    │
│                 else → existing steam://install (unchanged)          │
│   launch()    → same branch → tellBottledSteamToLaunch() (rungameid  │
│                 via the BOTTLED Steam, not the native one)           │
│   uninstall() → same branch → tellBottledSteamToUninstall()          │
│                                                                       │
│  bottle.ts (NEW)                                                      │
│   provisionBottle()      — create CrossOver bottle (cxbottle CLI),   │
│                             download SteamSetup.exe, runWineCommand   │
│                             non-silent, guided login window           │
│   getBottleSteamappsDir() — <bottle>/drive_c/Program Files (x86)/     │
│                             Steam/steamapps                            │
│   isBottleProvisioned()  — bottle dir exists + Steam.exe present      │
│                                                                       │
│  library.ts (extended)                                                │
│   buildInstalledMap()     — existing, native-path only (unchanged)   │
│   buildBottleInstalledMap() (NEW) — same ACF parse, bottle path       │
│   startInstallPolling/startUninstallPolling — parameterized to       │
│     accept which steamapps root to poll (native vs. bottle)           │
│                                                                       │
│  launcher.ts                                                          │
│   runBeforeLaunch: isNative() now false for these games → Linux-only │
│   steamRuntime branch stays skipped (gated on isLinux, unaffected)    │
│                                                                       │
│  main.ts 'focus' listener                                             │
│   refreshInstallState() extended to also reconcile bottle-installed   │
│   games from the bottle's ACF path                                    │
└──────────────────────────────┬────────────────────────────────────────┘
                                │ runWineCommand / shell.openExternal-equivalent
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CrossOver/Wine bottle (external process, real macOS windows)         │
│                                                                       │
│  Windows Steam client (SteamSetup.exe → Steam.exe)                    │
│   - owns its own steamapps/ + appmanifest_*.acf                       │
│   - owns its own loginusers.vdf + sentry (opaque to GameLib, D-04)    │
│   - satisfies Steam DRM/runtime because it IS Steam, just under Wine  │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/backend/storeManagers/steam/
├── games.ts          # existing — isNative()/install()/launch()/uninstall() gain isMac branch
├── library.ts         # existing — buildInstalledMap/ACF poller gain bottle-path variants
├── bottle.ts           # NEW — bottle provisioning, path resolution, provisioned-state checks
├── electronStores.ts   # existing — add steamBottleConfigStore (wineVersion/bottle name/provisioned)
└── constants.ts        # existing — add SteamSetup.exe CDN URL, bottle default name

src/frontend/state/
└── InstallGameModal.ts # existing — gains isMac && !is_mac_native branch before the steam:// short-circuit

src/frontend/screens/Game/GamePage/components/
└── AppleWikiInfo.tsx   # existing — natural home for D-08 bottle indicator row (is.native already gates correctly)
```

### Pattern 1: Reuse `runWineCommand`/`GameSettings` shape without a real `Game`
**What:** `runWineCommand()` (launcher.ts:1490) and `checkWineBeforeLaunch()` (utils.ts:952) both accept a `GameSettings`-shaped object and (for the latter) a `GameInfo`-shaped object — neither requires a real, library-registered game. `storeManagers/gog/setup.ts::runSetupCommand` already calls `runWineCommand` directly for a Windows installer `.exe` (non-silent is just a matter of omitting `/VERYSILENT`-style flags).
**When to use:** Provisioning the dedicated Steam bottle — the SteamSetup.exe run is not tied to any single game.
**Example:**
```typescript
// Source: src/backend/storeManagers/gog/setup.ts (existing pattern, adapted)
await runWineCommand({
  commandParts: [steamSetupExePath], // no /S / /VERYSILENT — D-02 wants the real installer UI
  gameSettings: steamBottleSettings, // { wineVersion, wineCrossoverBottle, winePrefix, ... }
  wait: false,
  protonVerb: 'run',
  skipPrefixCheckIKnowWhatImDoing: true,
  startFolder: steamRedistDir
})
```

### Pattern 2: CrossOver bottle existence check (already shipped, read-only)
**What:** `prepareWineLaunch()` in launcher.ts (~line 828) checks `existsSync(join(userHome, 'Library/Application Support/CrossOver/Bottles', bottleName, 'cxbottle.conf'))` before launching, and shows an error dialog if missing. This is the exact predicate `bottle.ts::isBottleProvisioned()` should reuse for "has D-01/D-02 setup ever completed."
**When to use:** Gating D-07's guided-setup-on-first-click behavior, and gating whether install/launch can proceed without re-provisioning.
**Example:**
```typescript
// Source: src/backend/launcher.ts lines 828-855 (existing, read-only reuse)
const bottleExists = existsSync(
  join(userHome, 'Library/Application Support/CrossOver/Bottles', bottleName, 'cxbottle.conf')
)
```

### Pattern 3: Bottle-scoped Steam library path (NEW — no existing analog)
**What:** `getSteamLibraries()` (utils.ts:536) and `buildInstalledMap()` (steam/library.ts:359) both read the **native** `defaultSteamPath` global setting (`~/Library/Application Support/Steam` on macOS via `getSteamCompatFolder()`). The bottled Windows Steam client's `steamapps/` instead lives at `<CrossOver bottle path>/drive_c/Program Files (x86)/Steam/steamapps` (Windows Steam's default install location, translated through Wine's `drive_c`). These are two entirely separate filesystem roots that must never be conflated.
**When to use:** Any new bottle-aware install-state read (ACF polling, `refreshInstallState()`, `isGameAvailable()`).
**Example (illustrative — path construction, not yet in codebase):**
```typescript
// bottle.ts (NEW)
function getBottleSteamappsDir(bottleName: string): string {
  return join(
    userHome,
    'Library/Application Support/CrossOver/Bottles',
    bottleName,
    'drive_c/Program Files (x86)/Steam/steamapps'
  )
}
```

### Anti-Patterns to Avoid
- **Wine-running the game's own `.exe` directly:** Explicitly rejected by the locked architecture decision (ROADMAP.md) — breaks Steam DRM/runtime requirements for any game that checks for a live Steam session. Only works for DRM-free titles.
- **Reusing the native `steamMetadataStore`/`steamLibraryStore` cache entries for bottle-installed state:** These stores are keyed only by `appId` and assume one global installed/not-installed state per game. A bottle-aware `install` object needs its own `platform: 'Windows'` (never `'Mac'`) and its own path, distinct from a hypothetical native Mac install of the same appId (not possible today, but keep the shape unambiguous).
- **Calling `runWineCommandOnGame()` (tools/index.ts:871) on a Steam game once `isNative()` returns `false`:** This function is used by the Winetricks/Verify UI surface and explicitly `logError`s + no-ops when `game.isNative()` is true. Once Steam's `isNative()` becomes conditionally `false` on macOS, this function would technically **allow** calling winetricks-style utilities "on" a Steam game — but Steam games have no per-game Wine prefix of their own (the bottle is shared across all Steam games), so this must stay unreachable. Confirm the Phase 3 D-04 menu-hiding (`GameSubMenu/index.tsx` `!isSteam` gates on Verify/Move/Change/Settings) still applies unconditionally, not just on non-mac platforms.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting whether Wine/CrossOver is installed & valid | A custom `which crossover` / version-parse routine | `validWine()` (launcher.ts:1399) + `getCrossover()`/`getWineOnMac()`/`getGamePortingToolkitWine()`/`getWhisky()` (utils/compatibility_layers.ts) | Already handles CrossOver, Game Porting Toolkit, Whisky, WineOnMac/Wineskin detection and version validation; feeds `WineSelector`'s dropdown directly |
| Running a Windows executable under Wine/CrossOver with correct env vars (`WINEPREFIX`, `CX_BOTTLE`, DXVK/MSync toggles, etc.) | A new `spawn()` wrapper | `runWineCommand()` (launcher.ts:1490) | Already resolves `wineVersion.type`, builds `env_vars` via `setupEnvVars`/`setupWineEnvVars`, handles the CrossOver `--bottle` argument convention |
| Parsing Steam's ACF/VDF manifest format | A custom key-value parser | `@node-steam/vdf`'s `parse()` (already imported in `steam/library.ts`) | Handles Valve's VDF format including nested objects; already battle-tested against real `appmanifest_*.acf` files in this codebase |
| Detecting a currently-running Steam game (for a "Playing" badge on a bottled game) | A new bottle-specific process/registry reader | `macOsRunningAppId()` (steam/library.ts:849) reads `~/Library/Application Support/Steam/registry.vdf` — **but this is the NATIVE Steam client's registry, not the bottle's.** A bottled Steam client would write its own `RunningAppID` to a Windows-side registry inside the bottle (`HKCU\Software\Valve\Steam` within the prefix), which needs the *Windows*-style reader (`windowsRunningAppId()`'s `reg query` logic) invoked *through Wine* against the bottle prefix, not the macOS-native reader | GAME-05 "Playing" badge parity for bottled games is a genuine open question — flagged below, likely out of this phase's strict scope unless explicitly required |

**Key insight:** Every low-level primitive (spawn Wine, parse VDF, verify a bottle) is already implemented and shipped for GOG/Epic/Nile Windows-game support. The actual net-new engineering is entirely in *stitching these together around a resident client process* rather than a one-shot installer — which is a pattern this codebase has never needed before (GOG/Epic installers run once and exit; the Windows Steam client stays running and needs to be treated as a peer application, not a game).

## Common Pitfalls

### Pitfall 1: CrossOver bottle *creation* has no existing code path
**What goes wrong:** Planning could assume "just call `verifyWinePrefix()` like every other Wine flow" — but `verifyWinePrefix()` (launcher.ts:1437) explicitly `return`s early as a no-op when `wineVersion.type === 'crossover'` (CrossOver manages its own bottles; GameLib's existing code only *verifies* a bottle exists via the `cxbottle.conf` file check, never creates one).
**Why it happens:** All of GameLib's shipped Wine-prefix creation logic assumes plain `wine`/`proton`/`toolkit` engines, where `mkdirSync` + `wineboot --init` suffices. CrossOver deliberately manages bottles through its own tooling.
**How to avoid:** Plan a Wave 0 spike to confirm the CrossOver `cxbottle` CLI's exact create syntax on the target CrossOver version — community sources (see Sources) describe `"/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle" --create --bottle "<name>" --template <templatename>`, but this is **not confirmed against official CodeWeavers CLI docs** (their public docs cover only bottle *environment variables* and GUI creation, not the exact `cxbottle --create` flag surface). If the CLI syntax doesn't verify cleanly, the fallback is instructing the user to create the bottle once via CrossOver's own "New Bottle" GUI dialog as part of the guided D-02 flow, then GameLib only configures + verifies it (still satisfies "GameLib initiates the flow", weakens "GameLib creates the bottle" literally).
**Warning signs:** `cxbottle --create` exits non-zero or produces a bottle CrossOver's own GUI doesn't recognize; `cxbottle.conf` never appears after the call.

### Pitfall 2: Two "Steam libraries" that must never be conflated
**What goes wrong:** `getSteamLibraries()`/`buildInstalledMap()`/`readAcfState()` all read the **native** Steam install path (`defaultSteamPath` global setting, `~/Library/Application Support/Steam` on macOS). A bottled Windows Steam client's `steamapps/` lives inside the CrossOver bottle's `drive_c`, an entirely different filesystem subtree. Reusing the existing functions unmodified for bottle-installed games would silently find nothing (native path has no manifest for a Windows-only appId) or, worse, if a future refactor merges the two into one scan, could double-count or misattribute installs.
**Why it happens:** The existing code was written under the (correct, at the time) assumption of exactly one Steam client per OS.
**How to avoid:** Introduce a bottle-aware sibling to each of `buildInstalledMap()`, `readAcfState()`, `startInstallPolling()`/`startUninstallPolling()` that takes the steamapps root as a parameter (or an explicit `source: 'native' | 'bottle'` flag), and route based on `isMac && info.is_mac_native === false`.
**Warning signs:** A bottled game's install badge never flips to "installed" even though Steam-in-the-bottle shows it installed; `refreshInstallState()`'s focus backstop doesn't reconcile bottle games.

### Pitfall 3: `hostInstallPlatform()` currently lies about bottled installs
**What goes wrong:** `hostInstallPlatform()` (steam/library.ts:35) hardcodes `'Mac'` whenever `isMac` is true, regardless of what was actually installed. This was correct before Phase 17 (only Mac-native depots could ever install via the native macOS Steam client), but once bottled installs exist, an installed Windows-only game on macOS is a **Windows** install running via Wine — reporting `platform: 'Mac'` would corrupt the frontend's `installPlatform` derivation in `GamePage/index.tsx` (`install.platform || (is_mac_native && isMac ? 'Mac' : 'Windows')`), which in turn feeds `is.native`/`is.macNative` in `GameContext` and could suppress the D-08 bottle indicator (`AppleWikiInfo` returns `null` when `is.native`).
**Why it happens:** `hostInstallPlatform()` was written under the same "always native" assumption Phase 3 baked in everywhere.
**How to avoid:** Branch `hostInstallPlatform()` (or its call sites) so bottle-installed games report `'Windows'`, not the host OS, when the install came through the bottle.
**Warning signs:** A bottled game's game-details page loses its "runs via bottle" indicator after install completes (it worked pre-install, then vanished right when it became most relevant).

### Pitfall 4: Steam-under-Wine has documented first-run/self-update instability
**What goes wrong:** Community reports (CodeWeavers/CrossOver forums, cross-referenced across multiple threads — see Sources) describe `steamwebhelper.exe` hanging after Steam's own self-update inside a Wine/CrossOver bottle ("a suspiciously fast 'Updating Steam'" followed by a hang), sometimes requiring the user to quit `steamwebhelper` from the Mac menu bar to force a relaunch, or setting the bottle's Windows version to "Windows 10" explicitly, or adding Steam launch options `-allosarches -cef-force-32bit`.
**Why it happens:** Steam's embedded Chromium Embedded Framework (steamwebhelper) is sensitive to Wine's DXVK/graphics translation and 32-bit/64-bit subsystem quirks; this is a known pattern across Wine-based Steam installs, not specific to GameLib.
**How to avoid:** Treat the guided setup flow (D-02/D-07) as needing explicit error-recovery messaging ("If Steam appears stuck updating, try relaunching..."), not just a progress spinner; consider defaulting the bottle to a "Windows 10" Windows-version setting if the chosen Wine engine exposes that knob (CrossOver bottles do, via `cxbottle`/bottle config). Treat this as MEDIUM-confidence community folklore, not a guaranteed fix — surfacing a "reset/reinstall bottle" escape hatch (D-01's rationale) may matter more than trying to prevent every failure mode.
**Warning signs:** First-run guided setup appears to hang indefinitely with no way for the user to tell if it's still working or stuck.

### Pitfall 5: `runWineCommandOnGame` / per-game Wine action menu items must stay unreachable for Steam
**What goes wrong:** Once `SteamGame.isNative()` conditionally returns `false` on macOS, any code path that gates purely on `isNative()` (rather than `runner === 'steam'`) could newly treat a Steam game as "a normal Wine game" and expose Winetricks/Verify/per-game-prefix UI that makes no sense for a bottle shared across all Steam titles.
**Why it happens:** `isNative()` was previously a safe, unconditional `true` for Steam; several code paths (`runWineCommandOnGame` in tools/index.ts:871; potentially others) branch on it directly instead of on `runner`.
**How to avoid:** Audit every call site of `game.isNative()` (not just `launcher.ts`) before considering the reversal complete; the Phase 3 D-04 frontend menu-hiding (`!isSteam` gates) should already prevent user-reachability, but backend call sites that don't check `runner` are still a latent bug even if unreachable from the current UI.
**Warning signs:** A Verify/Winetricks action becomes clickable for a Steam game on macOS, or silently does something meaningless to the shared bottle instead of erroring.

### Pitfall 6: `checkWineBeforeLaunch`'s silent auto-recovery writes to a per-appName `GameConfig`
**What goes wrong:** `checkWineBeforeLaunch()` (utils.ts:952), when it detects the configured Wine version is invalid, silently switches to a fallback Wine version and persists it via `GameConfig.get(gameInfo.app_name).setSetting('wineVersion', ...)`. If the bottle's settings are stored in a dedicated store (recommended above) rather than a real `GameConfig`, this auto-recovery write has nowhere sensible to land unless a reserved synthetic `appName` (e.g. a constant like `__gamelib_steam_bottle__`) is passed through for this one purpose.
**Why it happens:** `checkWineBeforeLaunch` was designed for real per-game settings, not a shared bottle setting object.
**How to avoid:** Either (a) reuse `GameConfig.get(RESERVED_APP_NAME)` as the actual source of truth for the bottle's Wine settings (simplest, fully reuses existing recovery/persistence code, at the cost of a phantom config file on disk that must never be reachable via any Settings/Game route), or (b) keep the dedicated store as the source of truth and have the bottle-provisioning code call `checkWineBeforeLaunch` with a throwaway `GameInfo`-shaped object whose `app_name` is the reserved constant, then copy any resulting wine-version change back into the dedicated store afterward.
**Warning signs:** A recovered Wine version "sticks" only until the next app restart because the dedicated store was never updated, or a stray `gamesConfigPath/__gamelib_steam_bottle__.json` file appears unexpectedly.

## Code Examples

### Existing steam:// delegation to reverse-engineer from (native path, unchanged for other cases)
```typescript
// Source: src/backend/storeManagers/steam/games.ts:326-346 (existing, unchanged for native/Linux/Windows)
async install(_args: InstallArgs): Promise<InstallResult> {
  const url = buildSteamProtocolUrl('install', this.appId)
  if (!url) return { status: 'error', error: `Invalid appId: ${this.appId}` }
  await shell.openExternal(url)
  startInstallPolling(this.appId) // ACF poller — same pattern the bottle flow should mirror
  return { status: 'done' }
}
```

### Existing non-silent Wine-run-an-installer pattern to adapt for SteamSetup.exe
```typescript
// Source: src/backend/storeManagers/gog/setup.ts:33-66 (existing — runSetupCommand)
async function runSetupCommand(wineArgs: WineCommandArgs) {
  // isWindows branch omitted — macOS always goes through runWineCommand
  return runWineCommand(wineArgs)
}
```

### Existing CrossOver bottle-existence gate to reuse verbatim
```typescript
// Source: src/backend/launcher.ts:828-836 (existing, read-only reuse for isBottleProvisioned())
if (isMac && gameSettings.wineVersion.type === 'crossover') {
  const bottleExists = existsSync(
    join(
      userHome,
      'Library/Application Support/CrossOver/Bottles',
      gameSettings.wineCrossoverBottle,
      'cxbottle.conf'
    )
  )
}
```

### Frontend gate that already works unmodified once `is_mac_native` is populated
```typescript
// Source: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:24-26 (existing, no change needed)
if (is.native) {
  return null // already false for a confirmed non-native macOS Steam game — natural home for D-08
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Windows-only Steam games on macOS: `steam://install`/`steam://rungameid` handed to the **native** Mac Steam client, which has no Windows depot to install/run | Same protocol verbs, but handed to a **bottled Windows** Steam client via Wine/CrossOver, which does have the Windows depot | This phase (v1.4) | Previously-broken/no-op install path becomes functional; `isNative()` becomes per-OS instead of a blanket `true` |
| `hostInstallPlatform()` always reports the host OS as the installed platform | Must report `'Windows'` for bottle-installed games regardless of host OS | To be implemented this phase | Frontend `installPlatform` derivation and the D-08 bottle-indicator gate depend on this being correct |

**Deprecated/outdated:** None — this is additive; the native `steam://` path is explicitly preserved unchanged for Mac-native games, Windows, and Linux (Proton) per the CONTEXT.md scope boundary.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `cxbottle --create --bottle "<name>" --template/--distro <type>` is the correct CLI invocation to programmatically create a new CrossOver bottle on the current CrossOver version | Architecture Patterns / Pitfall 1 | If wrong, D-02's "GameLib creates the bottle" cannot be implemented as specified; planner must budget a Wave 0 spike task and a documented fallback (user creates bottle via CrossOver GUI, GameLib only configures/verifies) |
| A2 | The bottled Windows Steam client installs to the Windows-default path `<bottle>/drive_c/Program Files (x86)/Steam` and writes standard `appmanifest_*.acf`/`libraryfolders.vdf` files identical in format to the native client | Architecture Patterns Pattern 3, Don't Hand-Roll | If the bottled install path differs (e.g., user redirects the Steam library during the guided install), the bottle-aware ACF scan needs to also parse the bottle's own `libraryfolders.vdf` rather than assuming a single fixed path — same logic `getSteamLibraries()` already applies for the native case, just rooted differently |
| A3 | `steamwebhelper` hang-after-self-update and the `-allosarches -cef-force-32bit` workaround are real, current failure modes for Steam-under-Wine/CrossOver on macOS | Common Pitfalls, Pitfall 4 | Sourced from CodeWeavers/CrossOver community forum threads (MEDIUM confidence, cross-referenced across 2+ independent threads) rather than an official CodeWeavers/Valve statement — if the underlying Steam/CrossOver versions have since fixed this, the recommended error-recovery UX may be over-engineered for a problem that no longer occurs; low cost to include defensively regardless |
| A4 | GameConfig's silent Wine-version auto-recovery (`checkWineBeforeLaunch`) is desirable/acceptable behavior to inherit for the shared Steam bottle, rather than something to suppress | Common Pitfalls, Pitfall 6 | If undesirable (e.g., planner wants Steam bottle wine-version changes to always be explicit user action), `checkWineBeforeLaunch` reuse needs an opt-out or a different codepath entirely |

**If this table is empty:** N/A — see entries above; all four require confirmation before being treated as locked implementation facts.

## Open Questions

1. **What is the exact `cxbottle` CLI syntax for non-interactive bottle creation on the CrossOver version GameLib users are likely to have installed?**
   - What we know: Community sources describe `cxbottle --create --bottle NAME --template/--distro TYPE`; official CodeWeavers docs confirm the bottle storage path and in-bottle environment variables (`CX_ROOT`, `CX_BOTTLE`, `WINEPREFIX`) but not the create-flag surface.
   - What's unclear: Exact flag name (`--template` vs `--distro`), valid values, and whether this is stable across CrossOver versions.
   - Recommendation: Budget a Wave 0 spike (mirroring Phase 16's `spike/` precedent) to empirically confirm against a real CrossOver install before committing to this as the provisioning mechanism; fall back to "GameLib prompts the user to create the bottle via CrossOver's GUI, then verifies + configures it" if the CLI proves unreliable.

2. **Should uninstall/move for bottled games route through the bottled Steam client, and what does "move" even mean when the install lives inside a shared bottle?**
   - What we know: D-09 says install is bottle-driven; CONTEXT.md marks uninstall/move mechanics as Claude's-discretion, expecting uninstall to mirror install (route through bottled Steam). The existing frontend already hides Move/Change/Verify/Settings for all Steam games (`GameSubMenu` `!isSteam` gates), so "Move" is likely already a non-issue — it's simply never offered.
   - What's unclear: Whether "uninstall" for a bottled game should just fire `steam://uninstall` *at the bottled client* (analogous to install), or whether GameLib should ever offer "delete the whole bottle" as a separate, more drastic reset action (tied to D-01's stated rationale of being able to "reset/reinstall Steam without risking non-Steam games").
   - Recommendation: Plan uninstall as routing through the bottled client (steam:// verb executed against the bottle's Steam process) for parity with install; treat "reset the entire bottle" as an explicitly separate Settings-level action, out of this phase's per-game uninstall flow unless the planner decides otherwise.

3. **Does GAME-05 "Playing" badge parity extend to bottled games in this phase, or is it explicitly out of scope?**
   - What we know: The existing `macOsRunningAppId()` poller (steam/library.ts:849) reads the **native** Steam client's `registry.vdf`; a bottled Steam client would need its own registry read routed through the bottle (Windows-style `reg query` executed via Wine, or the bottle's own `registry.vdf` if CrossOver exposes one at a predictable path).
   - What's unclear: ROADMAP.md's Phase 17 scope explicitly covers "install and launch" only, with no mention of the running-game poller; CONTEXT.md doesn't mention GAME-05 either.
   - Recommendation: Treat as explicitly out of scope for Phase 17 unless the planner decides otherwise — flag it as a known limitation/follow-up rather than silently under-delivering GAME-05 parity.

4. **Where does the D-07 guided setup UI live (Settings vs. an install-time modal), and how does its state persist across the multi-minute provisioning + login flow if the user navigates away?**
   - What we know: CONTEXT.md marks this as Claude's-discretion. D-07 ties the guided prompt to the very first Install/Play click on an eligible game.
   - What's unclear: Whether this should be a modal (blocking, similar to `InstallModal`) or a background task with a persistent progress indicator (similar to the Steam ACF install poller's non-blocking toast pattern) — probably the latter, given D-09's precedent of "no GameLib install modal for Steam, Steam owns its own progress UI."
   - Recommendation: Model it as a background-task + notification pattern (consistent with the existing Steam install-polling UX), not a blocking modal — but flag this as a `/gsd-ui-phase` decision point per D-08's note.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| CrossOver / Wine engine (macOS) | Bottle provisioning (D-01/D-03) | Not verifiable from this research session (runtime-dependent on the end user's machine, not the dev machine `gsd-sdk` runs on) | — | `getCrossover()`/`getWineOnMac()`/`getGamePortingToolkitWine()`/`getWhisky()` (utils/compatibility_layers.ts) already implement a detection+fallback chain; `downloadDefaultWine()` can fetch a default engine if none is detected, exactly as GOG/Epic Wine flows already do |
| Network access to `cdn.cloudflare.steamstatic.com` | Fetching `SteamSetup.exe` | Assumed available (same CDN already used for Steam store artwork in `steam/games.ts`) | — | None needed — CDN already reachable by the app for existing Steam art/metadata fetches |

**Missing dependencies with no fallback:** None identified — every dependency has an existing detection/fallback chain already in the codebase.

**Missing dependencies with fallback:** CrossOver/Wine engine absence is already handled generically by the existing Wine-detection + `downloadDefaultWine()` chain used by GOG/Epic install flows; no bottle-specific new fallback logic is needed here.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 [VERIFIED: package.json] via `ts-jest`, two projects (`src/backend`, `src/frontend`) |
| Config file | `jest.config.js` (repo root) |
| Quick run command | `npm test -- --testPathPattern=steam` |
| Full suite command | `npm test` |

### Phase Requirement → Test Map
*(Formal REQ IDs are TBD per ROADMAP.md — the planner should mint them, e.g. `MACSTEAM-01..0N`. Rows below describe the behaviors that will need IDs, mapped to concrete test types.)*

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| `isNative()` returns per-OS value (`is_mac_native` on mac, `true` on Windows/Linux) | unit | `npm test -- --testPathPattern=steam/games` | ✅ existing `games.test.ts` — extend |
| `install()`/`launch()`/`uninstall()` branch correctly on `isMac && info.is_mac_native === false` vs. all other cases (native mac, Windows, Linux unchanged) | unit | `npm test -- --testPathPattern=steam/games` | ✅ existing `games.test.ts` — extend |
| Bottle-scoped ACF scan (`buildBottleInstalledMap` or equivalent) reads the bottle's `steamapps/appmanifest_*.acf`, not the native path | unit | `npm test -- --testPathPattern=steam/library` | ✅ existing `library.test.ts` — extend, add bottle-path fixtures |
| D-11 unknown-vs-confirmed routing (does NOT force bottle flow before `platformsCaptured` is true) | unit | `npm test -- --testPathPattern=steam/games` | ✅ existing — extend with a `platformsCaptured: false` fixture case |
| `InstallGameModal.ts` frontend routing (bottle path vs. existing native short-circuit) | unit (frontend jest project) | `npm test -- --testPathPattern=InstallGameModal` | ❌ Wave 0 — no existing test file for this module found; add one |
| Guided bottle provisioning (create bottle, install SteamSetup.exe, detect completion) | manual-only (real CrossOver install, real Steam installer UI) | — | Justification: requires a real CrossOver/Wine engine and interactive installer window; not mockable meaningfully in CI |
| Bottled-Steam login persistence across GameLib restarts | manual-only | — | Justification: depends on real Steam client state inside a real bottle; D-04 treats this as opaque by design, so no code-level assertion is meaningful beyond "bottle still marked provisioned" |
| UI bottle indicator renders correctly (D-08) | manual-only (visual) | — | Consistent with this codebase's established practice of marking visual/GUI changes "Runtime visual UAT pending" (see recent quick-task log in STATE.md) |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=steam` (fast, backend-only)
- **Per wave merge:** `npm test` (full suite) + `npm run codecheck` (tsc/lint, per existing project convention)
- **Phase gate:** Full suite green + a human-verify checkpoint plan (mirroring Phase 3/10/13's precedent) before `/gsd:verify-work`, given the significant manual-only surface (real CrossOver bottle, real Steam installer, real login)

### Wave 0 Gaps
- [ ] Spike: confirm `cxbottle --create` CLI syntax against a real installed CrossOver version (Assumption A1) — mirrors the Phase 16 `spike/` precedent before committing to the mechanism in a plan
- [ ] `src/frontend/state/__tests__/InstallGameModal.test.ts` — no existing test file found for this module; needed to cover the new bottle-routing branch without regressing the existing native short-circuit
- [ ] Test fixtures for a bottle-path ACF scan in `steam/library.test.ts` (bottle `steamapps` directory structure, distinct from existing native-path fixtures)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No (directly) | Bottled Steam login is delegated entirely to the real Windows Steam client's own auth UI (D-04) — GameLib never handles Steam credentials for this flow, only detects bottle-provisioned state |
| V3 Session Management | No | Per D-04, GameLib treats the bottled Steam session (`loginusers.vdf` + sentry) as opaque — no parsing, no storage, no bridging with GameLib's own `steam-session`/`steam-user` refresh token |
| V4 Access Control | No | Single-user desktop app; no multi-user access boundary introduced |
| V5 Input Validation | Yes | Any new path/command construction (bottle name, CrossOver bottle path, `steamapps` root) must follow the existing `buildSteamProtocolUrl`'s numeric-appId-guard precedent — bottle *names* originate from user text input (`CrossoverBottle.tsx`'s `TextInputField`) and are interpolated into filesystem paths and `--bottle` CLI arguments; must be validated/sanitized before use in `spawn()` argv (argv-form spawn, never shell string interpolation, consistent with existing `spawnSync`/`execFileSync` usage in `steam/library.ts`) |
| V6 Cryptography | No (directly) | No new secrets introduced by this phase — the bottled Steam session's own credential storage is entirely internal to the Windows Steam client, outside GameLib's control or responsibility per D-04 |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Bottle-name / path injection into `spawn()` argv (CrossOver `--bottle <name>` argument, or filesystem path construction for the bottle's `steamapps` dir) | Tampering | Argv-form `spawn`/`spawnSync`/`execFileSync` (never shell-string interpolation) — same discipline already applied to `buildSteamProtocolUrl`'s numeric-appId guard (T-03-01) and `windowsRunningAppId()`'s hardcoded registry path (T-06-04); a malicious/malformed bottle name should be rejected or sanitized (e.g., reject path-separator characters) before being passed to `cxbottle`/`runWineCommand` |
| Downloading `SteamSetup.exe` from a spoofed/MITM'd CDN URL | Tampering | Use HTTPS only (`https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe`); no certificate-pinning precedent exists elsewhere in this codebase for other CDN downloads (GOG/EA/Ubisoft installer fetches use plain HTTPS via `downloadFile`), so standard HTTPS is consistent with existing risk posture — do not introduce a stricter bar unilaterally for this one download |
| A stale/corrupted bottle silently failing every install/launch with no user-visible signal | Denial of Service (self-inflicted) | Reuse the existing `cxbottle.conf`-existence check as a pre-flight gate before every bottled install/launch attempt (mirroring `prepareWineLaunch`'s existing error-dialog pattern for a missing bottle) rather than assuming provisioned-once-means-always-valid |

## Sources

### Primary (HIGH confidence)
- `src/backend/storeManagers/steam/games.ts`, `library.ts`, `electronStores.ts`, `user.ts` — direct codebase read
- `src/backend/launcher.ts` (isNative usage, `checkWineBeforeLaunch`, `runWineCommand`, `getCrossoverBottleFolder`, `prepareWineLaunch`, `prepareLaunch`) — direct codebase read
- `src/backend/config.ts` (`getSteamCompatFolder`, `getFactoryDefaults` wine defaults) — direct codebase read
- `src/backend/utils.ts` (`getSteamLibraries`, `checkWineBeforeLaunch`, `downloadDefaultWine`) — direct codebase read
- `src/backend/utils/compatibility_layers.ts` (Wine engine detection functions) — direct codebase read
- `src/frontend/state/InstallGameModal.ts`, `src/frontend/screens/Game/GamePage/index.tsx`, `GameContext.tsx`, `AppleWikiInfo.tsx`, `GameSubMenu/index.tsx` — direct codebase read
- `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx`, `src/frontend/screens/Settings/components/CrossoverBottle.tsx` — direct codebase read
- `src/backend/storeManagers/gog/setup.ts`, `src/backend/storeManagers/legendary/games.ts` (thirdPartyManagedApp EA/Ubisoft precedent) — direct codebase read
- `package.json` — direct read, confirms zero new dependencies needed
- CodeWeavers official docs: [Advanced CrossOver Mac Configuration](https://support.codeweavers.com/advanced-crossover-mac-configuration) — confirms bottle env vars + default storage path (`~/Library/Application Support/CrossOver/Bottles`)

### Secondary (MEDIUM confidence)
- [Steam Support: Installing Steam](https://help.steampowered.com/en/faqs/view/099E-F5D1-8780-4778) and multiple cross-referenced sources confirming `https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe` as the official Windows installer URL
- CrossOver/CodeWeavers community forum threads on `steamwebhelper` hangs and workarounds ([Steam has completely stopped working](https://www.codeweavers.com/support/forums/general/?t=27&msg=279837), [steamwebhelper.exe not responding](https://www.codeweavers.com/compatibility/crossover/forum/steam?msg=290823), [Steam Update Causing steamwebhelper Hang](https://www.portingkit.com/forum/showthread.php?tid=32369), [steamwebhelper.exe crashes when starting](https://www.codeweavers.com/compatibility/crossover/forum/steam/?forumcurPos=50&msg=224311)) — cross-referenced across 4 independent threads, consistent workarounds reported

### Tertiary (LOW confidence)
- Community blog/forum descriptions of `cxbottle --create --bottle NAME --template/--distro TYPE` syntax ([Use CrossOver in a shell script in macOS](https://metawave.ch/braindump/macos/use-crossover-in-shellscript/), general web-search synthesis) — NOT confirmed against official CodeWeavers CLI reference docs; flagged as Assumption A1, needs a Wave 0 spike
- [Whisky-App/Whisky GitHub issue #382](https://github.com/Whisky-App/Whisky/issues/382) — confirms community awareness that "Steam requires a Windows 10 bottle" and manual installer download, but is a feature request with no deep technical findings

## Metadata

**Confidence breakdown:**
- Standard stack (no new packages, reuse of existing Wine/VDF plumbing): HIGH — directly verified against `package.json` and existing shipped code
- Architecture (routing branch points, bottle-vs-native path separation): HIGH for what exists today, MEDIUM for the net-new `bottle.ts` design (no prior art in this codebase to point to)
- Pitfalls (bottle creation gap, dual-library-path gap, `hostInstallPlatform` bug risk): HIGH for the codebase-derived findings (games.ts/library.ts/launcher.ts read directly); MEDIUM for the Steam-under-Wine runtime-instability findings (community forum sourced, cross-referenced but not officially documented by Valve/CodeWeavers)

**Research date:** 2026-07-10
**Valid until:** 30 days (codebase-derived findings are stable; the CrossOver CLI assumption (A1) should be re-verified at implementation time regardless of elapsed time, since it was never HIGH confidence to begin with)
