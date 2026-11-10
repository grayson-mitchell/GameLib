import { existsSync, mkdirSync, readFileSync } from 'graceful-fs'

import {
  AppSettings,
  GlobalConfigVersion,
  WineInstallation
} from 'common/types'
import { currentGlobalConfigVersion } from 'backend/constants/others'
import { migrateFocusRowSelection } from 'common/focusRowMigration'
import { migrateTrayIconVariant } from 'common/trayIconVariant'

import {
  ensureSettingsMigrated,
  writeSettingsFile
} from './storeVersioning/settingsFiles'
import {
  getCrossover,
  getDefaultWineBinary,
  getGamePortingToolkitWine,
  getLinuxWineSet,
  getSystemGamePortingToolkitWine,
  getWhisky,
  getWineOnMac,
  getWineskinWine
} from './utils/compatibility_layers'
import { backendEvents } from './backend_events'
import { isFlatpak, isLinux, isMac, isWindows } from './constants/environment'
import {
  configPath,
  sharedWinePrefix,
  gamesConfigPath,
  heroicInstallPath,
  userHome,
  defaultWinePrefixDir
} from './constants/paths'
import { join } from 'path'
import type { ProcessRunner } from './process/types'
import { updateWineVersionInfos } from './wine/manager/utils'
import type { Stores } from './services/types'

const FLATPAK_STEAM_APP = 'com.valvesoftware.Steam'

/**
 * Whether Steam is really installed as a flatpak: its app directory exists under a
 * flatpak installation root (system or user). Pure fs check, no `flatpak info` child
 * (D-66.2-01: the factory defaults run before any runner exists).
 */
export function isFlatpakSteamInstalled(roots: string[]): boolean {
  return roots.some((root) => existsSync(join(root, 'app', FLATPAK_STEAM_APP)))
}

function getSteamCompatFolder() {
  // Paths are from https://savelocation.net/steam-game-folder
  if (isWindows) {
    const defaultWinPath = join(process.env['PROGRAMFILES(X86)'] ?? '', 'Steam')
    return defaultWinPath
  } else if (isMac) {
    return join(userHome, 'Library/Application Support/Steam')
  } else {
    const flatpakSteamPath = join(
      userHome,
      '.var/app/com.valvesoftware.Steam/.steam/steam'
    )

    if (existsSync(flatpakSteamPath)) {
      // check if steam is really installed via flatpak
      if (
        isFlatpakSteamInstalled([
          '/var/lib/flatpak',
          join(userHome, '.local/share/flatpak')
        ])
      ) {
        return flatpakSteamPath
      }
    }
    return join(userHome, '.steam/steam')
  }
}

/**
 * This class does config handling.
 * This can't be constructed directly. Use the static method get().
 * It automatically selects the appropriate config loader based on the config version.
 *
 * It also implements all the config features that won't change across versions.
 */
abstract class GlobalConfig {
  protected static globalInstance: GlobalConfig

  public abstract version: GlobalConfigVersion

  protected config: AppSettings | undefined

  public set(config: AppSettings) {
    this.config = config
  }

  /**
   * Get the global configuartion handler.
   * If one doesn't exist, create one.
   *
   * @returns GlobalConfig instance.
   */
  public static get(): GlobalConfig {
    // Migrate (or mark read-only) before anything reads the file. Memoised per
    // path, never throws (Phase 68, D-10).
    ensureSettingsMigrated(configPath, 'settings/global')

    if (!GlobalConfig.globalInstance) {
      // A single loader for every version: a newer file loads what this build
      // understands (D-03) instead of crashing on an unknown version.
      GlobalConfig.globalInstance = new GlobalConfigV0()
    }

    return GlobalConfig.globalInstance
  }

  /**
   * Detects Wine on Mac
   * @returns Promise<Set<WineInstallation>>
   * @memberof GlobalConfig
   **/
  public async getMacOsWineSet(deps: {
    runner: Pick<ProcessRunner, 'run'>
  }): Promise<Set<WineInstallation>> {
    if (!isMac) {
      return new Set<WineInstallation>()
    }

    const discovery = { runner: deps.runner }
    const getGPTKWine = await getGamePortingToolkitWine()
    const getSystemGPTK = await getSystemGamePortingToolkitWine(discovery)
    const crossover = await getCrossover(discovery)
    const wineOnMac = await getWineOnMac(discovery)
    const wineskinWine = await getWineskinWine(discovery)
    const whiskyWine = await getWhisky()

    return new Set([
      ...getGPTKWine,
      ...getSystemGPTK,
      ...crossover,
      ...wineOnMac,
      ...wineskinWine,
      ...whiskyWine
    ])
  }

  /**
   * Detects Wine/Proton on the user's system.
   *
   * @returns An Array of Wine/Proton installations.
   */
  public async getAlternativeWine(
    deps: {
      wineDownloaderInfoStore: Stores['wineManager']['wineDownloaderInfoStore']
      runner: Pick<ProcessRunner, 'run'>
    },
    scanCustom = true
  ): Promise<WineInstallation[]> {
    if (deps.wineDownloaderInfoStore.get('wine-releases', []).length === 0) {
      await updateWineVersionInfos({ stores: { wineManager: deps } }, true)
    }

    if (isMac) {
      const macOsWineSet = await this.getMacOsWineSet(deps)
      return [...macOsWineSet]
    }

    const linuxWineSet = await getLinuxWineSet(deps, scanCustom)

    return [...linuxWineSet]
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

  protected writeToFile(config: Record<string, unknown>) {
    return writeSettingsFile(configPath, config)
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
   */
  protected load() {
    // Config file doesn't exist, make one.
    if (!existsSync(configPath)) {
      this.resetToDefaults()
    }
    this.config = this.getSettings()
  }
}

class GlobalConfigV0 extends GlobalConfig {
  public version: GlobalConfigVersion = currentGlobalConfigVersion

  constructor() {
    super()
    this.load()
  }

  public getSettings(): AppSettings {
    if (this.config) {
      return this.config
    }

    if (!existsSync(gamesConfigPath)) {
      mkdirSync(gamesConfigPath, { recursive: true })
    }

    if (!existsSync(configPath)) {
      return this.getFactoryDefaults()
    }

    let settings = JSON.parse(readFileSync(configPath, 'utf-8'))
    const defaultSettings = settings.defaultSettings as AppSettings

    // keep old setting value for backwards compatibility, always use defaultWinePrefixDir in new code
    if (!defaultSettings.defaultWinePrefixDir)
      defaultSettings.defaultWinePrefixDir = defaultSettings.defaultWinePrefix

    // fix relative paths
    const winePrefix = !isWindows
      ? defaultSettings?.winePrefix?.replace('~', userHome)
      : ''

    settings = {
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
      defaultInstallPath: heroicInstallPath,
      focusRow: null,
      dismissedSignInNotices: [],
      trayIconVariant: 'auto',
      defaultSteamPath: getSteamCompatFolder(),
      loginBackgroundPath: '',
      defaultWinePrefix: defaultWinePrefixDir,
      defaultWinePrefixDir: defaultWinePrefixDir,
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
      winePrefix: isWindows ? '' : sharedWinePrefix,
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

    backendEvents.emit('settingChanged', { key, oldValue, newValue: value })

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

export { GlobalConfig }
