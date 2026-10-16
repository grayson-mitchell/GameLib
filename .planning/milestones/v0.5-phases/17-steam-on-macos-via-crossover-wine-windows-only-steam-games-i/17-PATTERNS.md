# Phase 17: Steam on macOS via CrossOver/Wine - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 9 (3 modified, 1 new backend module, 1 new store, 2 frontend, plus 2 read-only-reuse references)
**Analogs found:** 7 / 9 (2 flagged "no analog" — genuinely new integration territory per RESEARCH.md)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/backend/storeManagers/steam/games.ts` (`isNative()`, `install()`, `launch()`, `uninstall()`) | controller (Game class methods) | request-response + event-driven (ACF poll) | itself — existing native `steam://` branch (lines 326-461) | exact (extend in place) |
| `src/backend/storeManagers/steam/bottle.ts` (NEW) | service | file-I/O + event-driven (process spawn) | `src/backend/storeManagers/gog/setup.ts` (`runSetupCommand`) + `src/backend/launcher.ts` (`verifyWinePrefix`, `prepareWineLaunch` bottle-exists gate) | role-match (no true analog for creation; verified-existence check has exact analog) |
| `src/backend/storeManagers/steam/library.ts` (`hostInstallPlatform()`, `buildInstalledMap()`, new `buildBottleInstalledMap()`) | service | file-I/O (VDF/ACF parse) | itself — `buildInstalledMap()` (lines 359-406) | exact (parameterize existing function) |
| `src/backend/storeManagers/steam/electronStores.ts` (add `steamBottleConfigStore`) | config/store | CRUD (key-value persistence) | itself — `configStore`/`steamMetadataStore` (`TypeCheckedStoreBackend`/`CacheStore` pattern, lines 1-23) | exact |
| `src/frontend/state/InstallGameModal.ts` (bottle-routing branch before line 35 short-circuit) | store/state (zustand) | request-response | itself — the `runner === 'steam' && action === 'install'` short-circuit (lines 24-56) | exact (extend in place) |
| `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` (D-08 bottle-indicator row) | component | request-response (render) | itself — `showCrossover`/`showProton`/`showWine` row pattern (lines 32-120) | exact (add sibling row) |
| `src/backend/launcher.ts` (`isNative` branch at line 198, `prepareWineLaunch` bottle-exists gate line 828) | controller (launch orchestration) | request-response | itself — existing `isNative`/wine-check branch | exact (no change needed to the branch shape, only to what `isNative()` returns) |
| Guided bottle-setup + login UI (new, location TBD by planner/UI phase) | component + provider | event-driven (progress/notification) | Steam ACF install-poller's non-blocking toast pattern (`steam/library.ts` `startInstallPolling`) | role-match (background task + notification, not modal) |
| Bottle-aware Wine engine picker (reuse `WineSelector` for D-03) | component | request-response | `src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx` | exact (reuse as-is with new props source) |

## Pattern Assignments

### `src/backend/storeManagers/steam/games.ts` — `isNative()` reversal + bottle routing

**Analog:** itself (existing native delegation, lines 326-461); reversal target is `isNative()` (line 348).

**Current code to reverse** (lines 348-350):
```typescript
isNative(): boolean {
  return true
}
```
Per D-11/RESEARCH.md Pattern recommendation, branch on `isMac && info.is_mac_native === false` (confirmed-not-native only — do not force the bottle before `platformsCaptured` is true; see `getGameInfo()` lines 164-169 for the exact self-heal signal already used):
```typescript
isNative(): boolean {
  if (isMac) {
    const info = this.getGameInfo()
    return info.is_mac_native !== false // undefined/true => native; confirmed-false => bottle
  }
  return true // Linux (Proton) and Windows unchanged
}
```
Note the existing `steamMetadataStore` cache entry shape (`electronStores.ts` lines 25-42) already distinguishes "never captured" (`platformsCaptured` undefined) from "confirmed not native" (`is_mac_native === false` + `platformsCaptured === true`) — reuse that distinction rather than re-deriving it.

**Existing `install()` pattern to extend** (lines 326-346):
```typescript
async install(_args: InstallArgs): Promise<InstallResult> {
  const url = buildSteamProtocolUrl('install', this.appId)
  if (!url) {
    return { status: 'error', error: `Invalid appId: ${this.appId}` }
  }
  logInfo(`SteamGame: delegating install for appId ${this.appId} via ${url}`, LogPrefix.Steam)
  await shell.openExternal(url)
  startInstallPolling(this.appId) // ACF poller — mirror for bottle path
  return { status: 'done' }
}
```
For the bottle branch: same shape, but the "shell.openExternal(url)" step becomes "tell the bottled Steam client to install" (new `bottle.ts` responsibility) and `startInstallPolling` becomes a bottle-scoped variant pointed at `getBottleSteamappsDir()`. Preserve the "never optimistically flip state; ACF confirms" discipline noted in the existing comment (D-02).

**Existing `launch()` pattern to extend** (lines 376-400) — note the `activate: false` nuance (avoids a macOS Space-flash) should be preserved/adapted for whatever bottle-launch mechanism replaces `shell.openExternal`.

**Existing `uninstall()` pattern to extend** (lines 443-461) — symmetric to install; `startUninstallPolling` needs the same bottle-scoped variant.

---

### `src/backend/storeManagers/steam/bottle.ts` (NEW module)

**No true analog — flagged in RESEARCH.md as genuinely new integration territory.** Two existing patterns to compose:

**Pattern A — non-silent Windows installer under Wine** (analog: `src/backend/storeManagers/gog/setup.ts` lines 33-66, the `runSetupCommand` wrapper, and its real call site at lines 213-221):
```typescript
// Source: src/backend/storeManagers/gog/setup.ts:33-66 (existing, adapted)
async function runSetupCommand(wineArgs: WineCommandArgs) {
  if (isWindows) {
    // powershell Start-Process -Verb RunAs branch — irrelevant for macOS-only Phase 17
  } else {
    return runWineCommand(wineArgs)
  }
}

// Real call site pattern (gog/setup.ts:213-221) — non-silent install omits /VERYSILENT-style flags:
await runSetupCommand({
  commandParts: [absPath, ...exeArgs],
  gameSettings,
  wait: false,
  protonVerb: 'run',
  gameInstallPath: gameInfo.install.install_path,
  skipPrefixCheckIKnowWhatImDoing: true,
  startFolder: gameInfo.install.install_path
})
```
For SteamSetup.exe: same `runWineCommand` call, `skipPrefixCheckIKnowWhatImDoing: true` (CrossOver bottles bypass the requiredPrefixFiles check anyway — see below), `commandParts: [steamSetupExePath]` with **no silent flags** per D-02 (user must see the real installer UI).

**Pattern B — CrossOver bottle existence check, reuse verbatim** (analog: `src/backend/launcher.ts` lines 827-855, `prepareWineLaunch`'s bottle-exists gate):
```typescript
// Source: src/backend/launcher.ts:828-836 (existing, read-only reuse for bottle.ts::isBottleProvisioned())
if (isMac && gameSettings.wineVersion.type === 'crossover') {
  const bottleExists = existsSync(
    join(
      userHome,
      'Library/Application Support/CrossOver/Bottles',
      gameSettings.wineCrossoverBottle,
      'cxbottle.conf'
    )
  )
  if (!bottleExists) {
    // launcher.ts shows a showDialogBoxModalAuto ERROR dialog here (lines 838-849) —
    // bottle.ts's isBottleProvisioned() should return false and let the caller
    // decide whether to trigger provisionBottle() (D-07) vs. show an error.
  }
}
```

**Critical gap flagged by RESEARCH.md (Pitfall 1, Assumption A1):** `verifyWinePrefix()` (`launcher.ts` lines 1437-1481) is an explicit **no-op** for `wineVersion.type === 'crossover'` (line 1448-1450: `if (wineVersion.type === 'crossover') { return { res: { stdout: '', stderr: '' } } }`). There is **no existing code path that creates a CrossOver bottle** — only verifies one exists. Bottle *creation* must be new code, likely shelling out to `cxbottle --create --bottle <name> --template/--distro <type>` (community-documented syntax, MEDIUM confidence — Wave 0 spike required per RESEARCH.md). `runWineCommand()`'s own prefix-check block (`launcher.ts` lines 1511-1541) is also explicitly skipped for `wineVersion.type === 'crossover'` (line 1511: `if (!skipPrefixCheckIKnowWhatImDoing && wineVersion.type !== 'crossover')`), confirming CrossOver bottles are always assumed pre-existing everywhere else in the codebase.

**CX_BOTTLE env var convention** (analog: `src/backend/launcher.ts` lines 1183-1185, inside `setupWineEnvVars`):
```typescript
// Source: src/backend/launcher.ts:1183-1185 (existing — env var wiring for any crossover-type wineVersion)
case 'crossover':
  ret.CX_BOTTLE = wineCrossoverBottle
  break
```
This is how `runWineCommand()` already threads the bottle name into the spawned process's environment — `bottle.ts` does not need to reinvent this; just ensure `gameSettings.wineCrossoverBottle` is set to the **dedicated Steam bottle name** (distinct from the shared `GameLib` bottle in `config.ts`) before calling `runWineCommand`.

**Bottle-scoped steamapps path** (NEW — no existing analog, illustrative per RESEARCH.md):
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

---

### `src/backend/storeManagers/steam/library.ts` — `hostInstallPlatform()` bug + bottle-aware ACF scan

**Analog:** itself. `hostInstallPlatform()` (lines 35-39):
```typescript
function hostInstallPlatform(): InstallPlatform {
  if (isMac) return 'Mac'
  if (isLinux) return 'linux'
  return 'Windows'
}
```
Per RESEARCH.md Pitfall 3, this hardcodes `'Mac'` for every mac install — but a bottle-installed game is a **Windows** install running via Wine. Call sites at lines 216, 336, and 497 (inside `refresh()`, `refreshInstallState()`, and `pollInstallOnce()` respectively) all do:
```typescript
install: installedData
  ? {
      install_path: installedData.installPath,
      install_size: getFileSize(Number(installedData.sizeOnDisk)),
      platform: hostInstallPlatform()
    }
  : {}
```
These three call sites need to branch on whether `installedData` came from the native `buildInstalledMap()` scan or the new bottle-scoped scan, and report `'Windows'` for the latter regardless of host OS.

**`buildInstalledMap()` to parameterize/clone** (lines 359-406) — reads `getSteamLibraries()` (native `defaultSteamPath`-rooted) and iterates `appmanifest_*.acf` files, parsing via `@node-steam/vdf`'s `parse()`. The bottle-aware sibling (`buildBottleInstalledMap()`) needs the identical ACF-parsing body, rooted at `getBottleSteamappsDir()` instead of each `getSteamLibraries()` entry — same bitmask check (`stateFlags & 4`), same corrupt-file try/catch discipline (T-2-01).

**`readAcfState()` (lines 429-466), `startInstallPolling()`/`startUninstallPolling()` (lines 536-590, 690-741)** — same parameterization need: accept a `steamappsRoot` parameter (or a `source: 'native' | 'bottle'` flag) rather than always calling `getSteamLibraries()`. The existing GRACE_TICKS/MAX_TICKS safety-cap logic, the `notify()` toast calls (GAME-02/GAME-03), and the `sendFrontendMessage('gameStatusUpdate', ...)` shape should all be reused unmodified — only the manifest-root lookup changes.

---

### `src/backend/storeManagers/steam/electronStores.ts` — new `steamBottleConfigStore`

**Analog:** itself, lines 1-23 (the `TypeCheckedStoreBackend`/`CacheStore` construction pattern):
```typescript
// Source: src/backend/storeManagers/steam/electronStores.ts:1-23 (existing pattern to replicate)
const configStore = new TypeCheckedStoreBackend('steamConfigStore', {
  cwd: 'steam_store'
})

const steamLibraryStore = new CacheStore<GameInfo[], 'games'>('steam_library', null)
```
For the dedicated bottle settings store (RESEARCH.md "Alternatives Considered" recommendation — a dedicated store over a phantom `GameConfig` entry), add e.g.:
```typescript
const steamBottleConfigStore = new TypeCheckedStoreBackend('steamBottleConfigStore', {
  cwd: 'steam_store'
})
// shape: { wineVersion: WineInstallation, wineCrossoverBottle: string, provisioned: boolean, loggedIn: boolean }
```
**Pitfall 6 caveat (RESEARCH.md):** `checkWineBeforeLaunch()` (`backend/utils.ts` lines 952-1021) silently persists a Wine-version auto-recovery via `GameConfig.get(gameInfo.app_name).setSetting('wineVersion', ...)` (see lines 997, 1014) — a dedicated store has no such write path. If bottle provisioning reuses `checkWineBeforeLaunch` for its own Wine-validity check, either reserve a synthetic `GameConfig` appName for it, or copy any resulting Wine-version change back into `steamBottleConfigStore` after the call (RESEARCH.md's two documented options).

---

### `src/frontend/state/InstallGameModal.ts` — bottle-routing branch

**Analog:** itself (existing short-circuit, lines 24-56):
```typescript
// Source: src/frontend/state/InstallGameModal.ts:24-56 (existing — the single chokepoint for every Steam install entry point)
export const openInstallGameModal = ({
  appName,
  runner,
  gameInfo,
  action = 'install'
}: OpenInstallGameModalParams) => {
  if (runner === 'steam' && action === 'install' && gameInfo) {
    window.api.install({
      appName,
      path: '',
      runner: 'steam',
      installDlcs: [],
      sdlList: [],
      installLanguage: 'en-US',
      platformToInstall: 'Windows',
      gameInfo
    })
    return
  }

  useInstallGameModal.setState({ isOpen: true, appName, runner, gameInfo, action })
}
```
Per RESEARCH.md's architecture diagram, insert an `isMac && gameInfo.is_mac_native === false` branch **before** this short-circuit fires `window.api.install(...)` — route to the bottle-setup-required check (D-07 guided prompt) instead of (or in addition to) the existing native install call. `platformToInstall: 'Windows'` is already correct for both branches (the bottled install genuinely is a Windows install) — only the destination of the IPC call needs a new branch, not this field.

---

### `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` — D-08 bottle indicator

**Analog:** itself, the existing `showCrossover`/`showProton`/`showWine` row pattern (lines 16-122):
```typescript
// Source: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:24-26 (existing gate — already correct, no change needed)
if (is.native) {
  return null // already false for a confirmed non-native macOS Steam game
}
```
```typescript
// Source: same file, lines 32-34 — existing sibling-row derivation pattern to copy for the new bottle-indicator row
const showProton = is.linux && gameInfo.runner === 'steam' && !!steamInfo?.compatibilityLevel
const showCrossover = is.mac && !!codeweavers
const showWine = !!applegamingwiki && !showProton
```
```typescript
// Source: same file, lines 67-88 — existing <a role="button" className="iconWithText"> row JSX shape to copy for the new "runs via Windows Steam bottle" row
{showCrossover && (
  <a role="button" className="iconWithText" title={t('info.clickToOpen', 'Click to open')} onClick={onClickCrossover}>
    <CrossoverIcon style={{ width: '24px', height: '24px' }} />
    <b>{t('info.crossover-rating', 'Crossover emulation')}:</b>
    {codeweavers?.macRating != null ? (
      <Rating value={codeweavers.macRating} precision={0.5} max={5} readOnly size="small" />
    ) : (
      t('info.unrated', 'Unrated')
    )}
  </a>
)}
```
The new D-08 row is `showBottle = is.mac && gameInfo.runner === 'steam' && gameInfo.is_mac_native === false` — natural home immediately adjacent to `showCrossover` (this file already imports `CrossoverIcon`). No new gating logic needed beyond this boolean; the existing `is.native` early-return at line 24 already guarantees this component only renders for non-native games.

---

### `src/backend/launcher.ts` — `isNative` consumption (no code change to the branch itself)

**Analog:** itself, lines 198-224 (`prepareLaunch`'s isNative check):
```typescript
// Source: src/backend/launcher.ts:198-224 (existing — unchanged shape; behavior changes only because isNative() now returns false for bottled games)
const isNative = game.isNative()

if (!isNative) {
  const isWineOkToLaunch = await checkWineBeforeLaunch(gameInfo, gameSettings, logWriter)
  if (!isWineOkToLaunch) {
    logError(`Was not possible to launch using ${gameSettings.wineVersion.name}`, LogPrefix.Backend)
    sendGameStatusUpdate({ appName, runner, status: 'done' })
    await logWriter.close()
    return { status: 'error' }
  }
}
```
Once `SteamGame.isNative()` conditionally returns `false` on macOS, this existing branch **automatically** routes bottled Steam games through `checkWineBeforeLaunch` and (via `prepareWineLaunch`, lines 807+) through the CrossOver bottle-exists gate — no change needed to `launcher.ts` itself, confirming RESEARCH.md's "Branch inside the three existing SteamGame methods... rather than creating a parallel game class" recommendation. **Caveat:** `game.getSettings()` (`steam/games.ts` lines 142-145) currently returns whatever `GameConfig.get(this.appId)` holds — for the bottle path this must resolve to the dedicated Steam-bottle settings (wineVersion/wineCrossoverBottle pointing at the dedicated bottle, NOT the shared `GameLib` bottle), not a per-appId `GameConfig` that was never populated for Steam games before.

---

## Shared Patterns

### CrossOver bottle-exists gate (reuse verbatim)
**Source:** `src/backend/launcher.ts` lines 828-855 (`prepareWineLaunch`)
**Apply to:** `bottle.ts::isBottleProvisioned()`, and any pre-flight check before a bottled install/launch/uninstall call (RESEARCH.md Pitfall 1's "reuse the existing `cxbottle.conf`-existence check as a pre-flight gate before every bottled install/launch attempt").
```typescript
const bottleExists = existsSync(
  join(userHome, 'Library/Application Support/CrossOver/Bottles', bottleName, 'cxbottle.conf')
)
```

### "steam:// fire-and-forget + ACF owns real status" discipline
**Source:** `src/backend/storeManagers/steam/games.ts` lines 326-346, 443-461; `src/backend/storeManagers/steam/library.ts` lines 536-741 (poller lifecycle)
**Apply to:** All bottle install/uninstall paths — never optimistically flip `is_installed`; only a confirmed ACF read (native or bottle-scoped) flips the badge. `startInstallPolling`/`startUninstallPolling`'s GRACE_TICKS/MAX_TICKS/idempotent-Map pattern should be cloned, not reinvented, for the bottle-scoped variants.

### Non-silent Windows-installer-under-Wine invocation
**Source:** `src/backend/storeManagers/gog/setup.ts` lines 33-66, 213-221
**Apply to:** `bottle.ts`'s SteamSetup.exe run (D-02) — `runWineCommand({ commandParts: [exe, ...args], gameSettings, wait: false, protonVerb: 'run', skipPrefixCheckIKnowWhatImDoing: true, startFolder })`.

### `GameConfig`-per-appId Wine-version auto-recovery
**Source:** `src/backend/utils.ts` lines 952-1021 (`checkWineBeforeLaunch`), specifically lines 996-997 and 1013-1014 (`GameConfig.get(gameInfo.app_name).setSetting('wineVersion', ...)`)
**Apply to:** Any bottle-provisioning code that calls `checkWineBeforeLaunch` — needs either a reserved synthetic `appName` or a copy-back step into `steamBottleConfigStore` (Pitfall 6).

### `is.native`/`is.mac`/`is.linux` frontend gating
**Source:** `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` lines 24-34; `src/frontend/screens/Game/GameSubMenu/index.tsx` lines 88-89, 253, 342-397 (`isSteam`/`isSideloaded` gates)
**Apply to:** The new D-08 bottle-indicator row, and confirming `GameSubMenu`'s `!isSteam` gates (which hide Verify/Move/Change/Settings for ALL Steam games unconditionally, not just non-mac) still make `runWineCommandOnGame` (`src/backend/tools/index.ts` lines 871-880, guarded by `if (game.isNative())`) unreachable once `isNative()` becomes conditionally `false` — this is Pitfall 5 from RESEARCH.md and should be an explicit verification step, not a new pattern to build.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `bottle.ts::provisionBottle()` (bottle *creation* via `cxbottle --create`) | service | file-I/O + event-driven (process spawn) | No existing code path creates a CrossOver bottle — `verifyWinePrefix()` is an explicit no-op for `wineVersion.type === 'crossover'` (launcher.ts:1448-1450); this is genuinely new engineering flagged as Assumption A1 / Wave 0 spike in RESEARCH.md. Nearest conceptual precedent (Legendary's `thirdPartyManagedApp` EA/Ubisoft installer pattern, `legendary/games.ts` lines 657-734) is Windows-native-only with no Wine code path — useful for the "download + spawn an installer" shape only, not for bottle creation itself. |
| Bottle-scoped "running game" poller (GAME-05 parity for bottled games) | service | event-driven (polling) | `macOsRunningAppId()` (`steam/library.ts` line 849) reads the **native** Steam client's `registry.vdf`; a bottled Steam client would need a Windows-style `reg query` read executed *through Wine* against the bottle prefix — no existing code does this. RESEARCH.md's Open Question 3 recommends treating this as explicitly out of scope for Phase 17. |

## Metadata

**Analog search scope:** `src/backend/storeManagers/steam/`, `src/backend/storeManagers/gog/`, `src/backend/storeManagers/legendary/`, `src/backend/launcher.ts`, `src/backend/utils.ts`, `src/backend/config.ts`, `src/frontend/state/`, `src/frontend/screens/Game/`, `src/frontend/screens/Library/components/InstallModal/WineSelector/`, `src/frontend/screens/Settings/components/CrossoverBottle.tsx`
**Files scanned:** 9 read in full (games.ts, library.ts, gog/setup.ts, InstallGameModal.ts, CrossoverBottle.tsx, config.ts, electronStores.ts, AppleWikiInfo.tsx, WineSelector/index.tsx) + targeted grep/offset reads of launcher.ts (isNative usage, prepareWineLaunch, verifyWinePrefix, runWineCommand, setupWineEnvVars crossover case), utils.ts (checkWineBeforeLaunch), legendary/games.ts (installEA/installUbisoft), tools/index.ts (runWineCommandOnGame), GameSubMenu/index.tsx (isSteam gates)
**Pattern extraction date:** 2026-07-10
