import type { SendFrontendMessage } from './host/frontendMessage'
import { existsSync, mkdirSync } from 'graceful-fs'

import {
  AppSettings,
  GlobalConfigVersion,
  WineInstallation
} from 'common/types'
import { currentGlobalConfigVersion } from 'backend/constants/others'
import { migrateFocusRowSelection } from 'common/focusRowMigration'
import { migrateTrayIconVariant } from 'common/trayIconVariant'

import {
  readSettingsDoc,
  settingsDocExists,
  writeSettingsDoc,
  type SettingsDocRoot
} from './stores/settingsDocs'
import type { RustInvokeDeps } from './host/rustInvokeDeps'
import { getDefaultWineBinary } from './utils/compatibility_layers'
import type { BackendEvents } from './backend_events'
import { isFlatpak, isLinux, isMac, isWindows } from './constants/environment'
import { join } from 'path'
import type { ProcessRunner } from './process/types'
import type { AppPaths } from './process/context'
import { discoverAlternativeWine } from './enginewine/wineDiscovery'
import type { Stores } from './services/types'

/**
 * Factory default for defaultSteamPath. The root is already discovered by
 * the shell (plan 12 sets GAMELIB_STEAM_ROOT_DEFAULT on every sidecar spawn), so there is no
 * boot-time rustInvoke here: 'config' runs before 'rpc-server' and construction stays synchronous.
 * With no env (Jest, headless smoke) it is the plain per-OS fallback, mirroring Rust's no-candidate
 * fallback with no probing.
 */
export function steamRootDefault(
  userHome: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string {
  const fromShell = env.GAMELIB_STEAM_ROOT_DEFAULT?.trim()
  if (fromShell) return fromShell
  if (platform === 'win32') return join(env['PROGRAMFILES(X86)'] ?? '', 'Steam')
  if (platform === 'darwin') {
    return join(userHome, 'Library/Application Support/Steam')
  }
  return join(userHome, '.steam/steam')
}

/**
 * What the config reports outward (66.4-17): the boot wires `onSettingChanged` to its event bus's
 * `settingChanged` event. Optional so a test that does not observe the event builds a config bare.
 */
export type GlobalConfigPaths = Pick<
  AppPaths,
  | 'configPath'
  | 'gamesConfigPath'
  | 'userHome'
  | 'heroicInstallPath'
  | 'defaultWinePrefixDir'
  | 'sharedWinePrefix'
>

export interface GlobalConfigDeps extends RustInvokeDeps {
  /** The boot's path roots: the config file, the games-config folder and the install/prefix defaults. */
  paths: GlobalConfigPaths
  /**
   * The boot's store root (85-15): config.json is read and written through its mirror, the shell
   * being the one writer. Absent (a test that only reads), the file is read as it stands and a
   * write throws.
   */
  root?: SettingsDocRoot
  onSettingChanged?: (
    ...args: Parameters<BackendEvents['settingChanged']>
  ) => void
}

/**
 * This class does config handling.
 * This can't be constructed directly. The boot's 'config' step builds the one instance with
 * `createGlobalConfig()`.
 * It automatically selects the appropriate config loader based on the config version.
 *
 * It also implements all the config features that won't change across versions.
 */
abstract class GlobalConfig {
  public abstract version: GlobalConfigVersion

  /** The settings documents of this boot (85-15): config.json is read and written through it. */
  protected readonly docs: SettingsDocRoot

  constructor(protected readonly deps: GlobalConfigDeps) {
    this.docs = deps.root ?? {}
  }

  protected config: AppSettings | undefined

  public set(config: AppSettings) {
    this.config = config
  }

  /**
   * Detects Wine/Proton on the user's system.
   *
   * Discovery is Rust's (Phase 87, `gamelib-wine` `wine_discover_alternatives`): the macOS set on a Mac, the
   * Linux set on Linux, an empty list on Windows; with no wine release list stored it refreshes it first and
   * pushes `wineVersionsUpdated`. This method is the one scheduled shim through
   * `enginewine/wineDiscovery.ts` (D-22, deleted with the config in Phase 98). `deps` is what the TS
   * discovery read; Rust reads its own roots, `PATH` and settings, so only `scanCustom` is sent, and the
   * parameter stays so `utils.ts` and the Steam install form call it unchanged.
   *
   * @returns An Array of Wine/Proton installations.
   */
  public async getAlternativeWine(
    deps: {
      wineDownloaderInfoStore: Stores['wineManager']['wineDownloaderInfoStore']
      runner: Pick<ProcessRunner, 'run'>
      paths: Pick<AppPaths, 'toolsPath' | 'userHome' | 'configPath'>
      sendFrontendMessage: SendFrontendMessage
    },
    scanCustom = true
  ): Promise<WineInstallation[]> {
    return (await discoverAlternativeWine(
      this.deps,
      scanCustom
    )) as WineInstallation[]
  }

  /**
   * Gets the actual settings from the config file.
   * Does not modify its parent object.
   * Always reads from file regardless of `this.config`.
   *
   * @returns Settings present in config file.
   */
  public abstract getSettings(): AppSettings

  /**
   * Get default settings as if the user's config file doesn't exist.
   * Doesn't modify the parent object.
   * Doesn't access config files.
   *
   * @returns AppSettings
   */
  public abstract getFactoryDefaults(): AppSettings

  /**
   * Reset `this.config` to `getFactoryDefaults()` and flush.
   */
  public abstract resetToDefaults(): void

  /** One whole-document write: a `replace` frame when the shell owns config.json (85-15). */
  protected writeToFile(config: Record<string, unknown>) {
    return writeSettingsDoc(this.docs, this.deps.paths.configPath, config)
  }

  /**
   * Write `this.config` to file.
   * Uses the config version defined in `this.version`.
   */
  public abstract flush(): void

  /** change a specific setting */
  public abstract setSetting(
    key: keyof AppSettings,
    value: unknown,
    deps: { configStore: Stores['kvs']['configStore'] }
  ): void

  /**
   * Load the config file, upgrade if needed.
   *
   * D-22: on a fresh profile the factory defaults are written as one ordinary document write (a
   * `replace` frame when the shell owns config.json) and `this.config` already holds them, so the
   * `getSettings()` below, and every later one, is served from memory: nothing reads the file back
   * while the shell may not have applied the write yet.
   */
  protected load() {
    // Config file doesn't exist, make one.
    if (!settingsDocExists(this.docs, this.deps.paths.configPath)) {
      this.resetToDefaults()
    }
    this.config = this.getSettings()
  }
}

class GlobalConfigV0 extends GlobalConfig {
  public version: GlobalConfigVersion = currentGlobalConfigVersion

  constructor(deps: GlobalConfigDeps) {
    super(deps)
    this.load()
  }

  public getSettings(): AppSettings {
    if (this.config) {
      return this.config
    }

    if (!existsSync(this.deps.paths.gamesConfigPath)) {
      mkdirSync(this.deps.paths.gamesConfigPath, { recursive: true })
    }

    // Through the settings-document seam: the cell's view (pending writes included) when the shell
    // owns config.json, the file itself otherwise (85-15).
    const stored = readSettingsDoc(this.docs, this.deps.paths.configPath)
    if (stored === undefined) {
      return this.getFactoryDefaults()
    }

    // A document with no defaultSettings (one the shell found unreadable reads as `{}`) is the
    // factory defaults, not a crash.
    const defaultSettings = (stored.defaultSettings ?? {}) as AppSettings

    // keep old setting value for backwards compatibility, always use defaultWinePrefixDir in new code
    if (!defaultSettings.defaultWinePrefixDir)
      defaultSettings.defaultWinePrefixDir = defaultSettings.defaultWinePrefix

    // fix relative paths
    const winePrefix = !isWindows
      ? defaultSettings?.winePrefix?.replace('~', this.deps.paths.userHome)
      : ''

    const settings = {
      ...this.getFactoryDefaults(),
      ...defaultSettings,
      winePrefix,
      // Read-side normalisers (D-11). The persisted `settings/global` v0->v1 migration already
      // wrote both properties; these calls remain for an unmigrated file that stayed read-only
      // (failed migration or a newer file), so the tray and focus row still resolve. Two derived
      // properties, one rule: each is derived from the RAW on-disk `defaultSettings`, must come
      // AFTER the merge spreads, and must never read the merge itself.
      // - `trayIconVariant`: legacy `darkTrayIcon` true -> 'dark', false -> 'light', neither ->
      //   'auto'. The factory default is 'auto', so migrating the merged object would always
      //   return that and discard a legacy `darkTrayIcon: true`.
      // - `focusRow`: seeded once (now in the v0->v1 migration) from legacy `libraryTopSection`, guarded by the PRESENCE of the
      //   `focusRow` key (a present `null` is a deliberate clear). The factory default is
      //   `focusRow: null`, which is indistinguishable from a deliberate clear, so migrating the
      //   merged object would always short-circuit on the presence guard and silently discard
      //   every legacy `libraryTopSection`. It is the LAST property.
      trayIconVariant: migrateTrayIconVariant(defaultSettings),
      focusRow: migrateFocusRowSelection(defaultSettings)
    } as AppSettings

    return settings
  }

  public getFactoryDefaults(): AppSettings {
    // @ts-expect-error FIXME: Settings values don't work like this in other parts of the codebase
    const defaultWine: WineInstallation = isWindows
      ? {}
      : getDefaultWineBinary()

    const settings: Partial<AppSettings> = {
      notifyHumbleExpirations: true,
      shareDetectedFixes: false,
      checkUpdatesInterval: 10,
      enableUpdates: false,
      addDesktopShortcuts: false,
      addStartMenuShortcuts: false,
      autoInstallDxvk: isLinux || isMac,
      autoInstallVkd3d: isLinux,
      autoInstallDxvkNvapi: isLinux,
      addSteamShortcuts: false,
      preferSystemLibs: false,
      checkForUpdatesOnStartup: !isFlatpak,
      autoUpdateGames: true,
      customWinePaths: [],
      defaultInstallPath: this.deps.paths.heroicInstallPath,
      focusRow: null,
      dismissedSignInNotices: [],
      trayIconVariant: 'auto',
      defaultSteamPath: steamRootDefault(this.deps.paths.userHome),
      loginBackgroundPath: '',
      defaultWinePrefix: this.deps.paths.defaultWinePrefixDir,
      defaultWinePrefixDir: this.deps.paths.defaultWinePrefixDir,
      hideChangelogsOnStartup: false,
      language: 'en',
      maxWorkers: 0,
      minimizeOnLaunch: false,
      nvidiaPrime: false,
      enviromentOptions: [],
      wrapperOptions: [],
      showFps: false,
      useGameMode: isFlatpak,
      wineCrossoverBottle: 'GameLib',
      winePrefix: isWindows ? '' : this.deps.paths.sharedWinePrefix,
      wineVersion: defaultWine,
      enableEsync: true,
      enableFsync: isLinux,
      enableMsync: isMac,
      enableWineWayland: false,
      enableHDR: false,
      enableWoW64: false,
      eacRuntime: isLinux,
      gamepadRepeatDelay: 50,
      gamepadInitialRepeatDelay: 300,
      battlEyeRuntime: isLinux,
      framelessWindow: false,
      hideWindowOnProtocolLaunch: true,
      beforeLaunchScriptPath: '',
      afterLaunchScriptPath: '',
      disableUMU: false,
      verboseLogs: true,
      downloadProtonToSteam: false,
      enableSteamNativeInstall: true,
      steamExperimentalInstallApp: false,
      advertiseAvxForRosetta: isMac && defaultWine.type === 'toolkit',
      noTrayIcon: false,
      showValveProton: false,
      steamGridDbApiKey: '',
      disableGOGPresence: false
    }
    // @ts-expect-error TODO: We need to settle on *one* place to define settings defaults
    return settings
  }

  public setSetting(
    key: keyof AppSettings,
    value: unknown,
    deps: { configStore: Stores['kvs']['configStore'] }
  ) {
    const { configStore } = deps
    const config = this.getSettings()
    const configStoreSettings = configStore.get_nodefault('settings') || config
    configStore.set('settings', { ...configStoreSettings, [key]: value })

    const oldValue = config[key]
    config[key] = value as never
    this.config = config

    this.deps.onSettingChanged?.({ key, oldValue, newValue: value })

    return this.flush()
  }

  public resetToDefaults() {
    this.config = this.getFactoryDefaults()
    return this.flush()
  }

  public flush() {
    return this.writeToFile({
      defaultSettings: this.config,
      version: currentGlobalConfigVersion
    })
  }
}

/**
 * The instance methods non-test backend code calls on the global config. Consumers declare
 * their dependency as this slice (or a narrower Pick of it), never the whole class.
 */
export type GlobalConfigSlice = Pick<
  GlobalConfig,
  | 'getSettings'
  | 'setSetting'
  | 'set'
  | 'flush'
  | 'getFactoryDefaults'
  | 'resetToDefaults'
  | 'getAlternativeWine'
>

/**
 * Builds the global config handler. Called once by the boot's 'config' step; the instance is then
 * handed to every consumer as `GlobalConfigSlice`. Nothing is migrated or guarded here: the shell
 * migrated config.json at boot (store_boot, 85-15) and refuses a write to a newer one (85-16). A
 * single loader serves every version: a newer file loads what this build understands (D-03)
 * instead of crashing on an unknown version.
 */
export function createGlobalConfig(deps: GlobalConfigDeps): GlobalConfig {
  return new GlobalConfigV0(deps)
}

export { GlobalConfig }
