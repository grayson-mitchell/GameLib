import { GameConfigVersion, GameSettings } from 'common/types'
import type { GlobalConfigSlice } from './config'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isStoreKey } from './stores/storeFrames'
import {
  prepareSettingsDoc,
  readSettingsDoc,
  settingsDocExists,
  writeSettingsDoc,
  type SettingsDocRoot
} from './stores/settingsDocs'
import type { StoreVersioning } from './storeVersioning/engine'
import { join } from 'path'
import { currentGameConfigVersion } from 'backend/constants/others'
import { isMac, isWindows } from './constants/environment'
import type { AppPaths } from './process/context'

/**
 * This class does config handling for games.
 * This can't be constructed directly. Use `createGameConfigs({ config }).get(appName)`.
 * It automatically selects the appropriate config loader based on the config version.
 *
 * It also implements all the config features that won't change across versions.
 */
export type GameConfigPaths = Pick<
  AppPaths,
  'configPath' | 'sharedWinePrefix' | 'gamesConfigPath' | 'userHome'
>

abstract class GameConfig {
  public abstract version: GameConfigVersion

  // @ts-expect-error TODO: Somehow figure out how to synchronously load the config
  public config: GameSettings

  readonly appName: string
  readonly path: string

  protected readonly globalConfig: Pick<GlobalConfigSlice, 'getSettings'>

  /** The settings documents of this boot (85-15): every read and write goes through it. */
  protected readonly docs: SettingsDocRoot
  protected readonly paths: GameConfigPaths

  protected constructor(
    appName: string,
    globalConfig: Pick<GlobalConfigSlice, 'getSettings'>,
    docs: SettingsDocRoot,
    paths: GameConfigPaths
  ) {
    this.docs = docs
    this.paths = paths
    this.appName = appName
    this.path = join(paths.gamesConfigPath, appName + '.json')
    this.globalConfig = globalConfig
  }

  /**
   * Gets the actual settings from the config file.
   * Does not modify its parent object.
   * Always reads from file regardless of `this.config`.
   *
   * @returns Settings present in config file.
   */
  public abstract getSettings(): Promise<GameSettings>

  /**
   * Synchronous form of `getSettings`, used by `load` and `setSetting` so
   * `this.config` is never read before it is set (G17).
   */
  protected abstract readSettings(): GameSettings

  /** Change a specific setting */
  public abstract setSetting(key: string, value: unknown): void

  /**
   * Reset `this.config` to global defaults and flush.
   */
  public abstract resetToDefaults(): void

  /**
   * One whole-document write: a `replace` frame when the shell owns the file (85-15). Under the
   * Rust owner a name that is not one plain path segment is refused here (T-85-37): its path is not
   * `GamesConfig/<app>.json` (`'../config'` resolves to the global document), the shell would refuse
   * the frame, and TS must not write a file the shell owns. The line names no appName.
   */
  protected writeToFile(config: Record<string, unknown>) {
    if (
      this.docs.mirrors !== undefined &&
      !isStoreKey(`GamesConfig/${this.appName}`)
    ) {
      logWarning(
        'game settings write refused: the game name is not one plain file name',
        LogPrefix.Backend
      )
      return
    }
    return writeSettingsDoc(this.docs, this.path, config)
  }

  /**
   * Write `this.config` to file.
   * Uses the config version defined in `this.version`.
   */
  public abstract flush(): void

  /**
   * Load the config file, upgrade if needed.
   */
  protected load() {
    // Config file doesn't exist, make one. A global document written but not yet applied by the
    // shell exists (85-15).
    if (!settingsDocExists(this.docs, this.paths.configPath)) {
      this.resetToDefaults()
    }
    // Synchronous: an async load left `this.config` undefined for a tick, so a
    // `setSetting` that was a title's first `GameConfig.get` threw (G17).
    this.config = this.readSettings()
  }
}

class GameConfigV0 extends GameConfig {
  public version: GameConfigVersion = currentGameConfigVersion

  // True for v0 (legacy) configs.
  // Based on legacy behaviour.
  protected isExplicit = true

  constructor(
    appName: string,
    globalConfig: Pick<GlobalConfigSlice, 'getSettings'>,
    docs: SettingsDocRoot,
    paths: GameConfigPaths
  ) {
    super(appName, globalConfig, docs, paths)
    this.load()
  }

  public async getSettings(): Promise<GameSettings> {
    return this.readSettings()
  }

  protected readSettings(): GameSettings {
    // Take defaults, then overwrite if explicitly set values exist.
    // The settings defined work as overrides.

    const {
      autoInstallDxvk,
      autoInstallDxvkNvapi,
      autoInstallVkd3d,
      DXVKFpsCap,
      preferSystemLibs,
      autoSyncSaves,
      enableEsync,
      enableFSR,
      enableMsync,
      enableFsync,
      enableWineWayland,
      enableHDR,
      enableDXVKFpsLimit,
      enableWoW64,
      maxSharpness,
      launcherArgs,
      nvidiaPrime,
      offlineMode,
      enviromentOptions,
      wrapperOptions,
      savesPath,
      showFps,
      showMangohud,
      targetExe,
      useGameMode,
      winePrefix,
      wineCrossoverBottle,
      wineVersion,
      eacRuntime,
      battlEyeRuntime,
      beforeLaunchScriptPath,
      afterLaunchScriptPath,
      gamescope,
      verboseLogs,
      advertiseAvxForRosetta
    } = this.globalConfig.getSettings()

    // initialize generic defaults
    // TODO: I know more values can be moved that are not used in windows
    const defaultSettings = {
      autoInstallDxvk,
      autoInstallDxvkNvapi,
      autoInstallVkd3d,
      DXVKFpsCap,
      preferSystemLibs,
      autoSyncSaves,
      enableEsync,
      enableMsync,
      enableFSR,
      enableFsync,
      enableWineWayland,
      enableHDR,
      enableWoW64,
      enableDXVKFpsLimit,
      maxSharpness,
      launcherArgs,
      nvidiaPrime,
      offlineMode,
      enviromentOptions: [...enviromentOptions],
      wrapperOptions,
      savesPath,
      showFps,
      showMangohud,
      targetExe,
      useGameMode,
      battlEyeRuntime,
      eacRuntime,
      language: '', // we want to fallback to '' always here, fallback lang for games should be ''
      beforeLaunchScriptPath,
      afterLaunchScriptPath,
      gamescope,
      verboseLogs,
      advertiseAvxForRosetta,
      enableQuickSavesMenu: false
    } as GameSettings

    let gameSettings = {} as GameSettings

    // Through the settings-document seam: the cell's view (pending writes included) when the shell
    // owns the file, the file itself otherwise (85-15).
    const settings = readSettingsDoc(this.docs, this.path)
    if (settings !== undefined) {
      // read game's settings
      gameSettings = (settings[this.appName] || {}) as GameSettings
    } else {
      // only set the `disableUMU` default value when getting settings for a new game
      // we want it to be `undefined` for games that were installed already
      defaultSettings.disableUMU = false
      // CR-05: the engine key is never a game default. readEngineForGame derives a
      // config-less game's engine and the install dialogs write it explicitly for
      // new installs, so flushing defaults can never persist an engine.
    }

    if (!isWindows) {
      defaultSettings.wineVersion = wineVersion

      // set specific keys depending on the platform
      if (isMac) {
        defaultSettings.wineCrossoverBottle = wineCrossoverBottle
      }

      defaultSettings.winePrefix = winePrefix || this.paths.sharedWinePrefix

      // fix winePrefix if needed
      if (gameSettings.winePrefix?.includes('~')) {
        gameSettings.winePrefix = gameSettings.winePrefix.replace(
          '~',
          this.paths.userHome
        )
      }
    }

    // return an object with the game's settings, with fallbacks to the defaults
    return {
      ...defaultSettings,
      ...gameSettings
    }
  }

  public setSetting(key: keyof GameSettings, value: unknown) {
    // Defensive: read rather than flush a one-key object over the file.
    if (this.config === undefined) {
      this.config = this.readSettings()
    }
    // WR-04: remember the prior state so a failed flush can be undone.
    const had = key in this.config
    const prev = this.config[key]
    // check if the key exists, if not, initialize it with a undefined value
    if (!had) {
      this.config[key] = undefined as never
    }

    this.config[key] = value as never
    logInfo(`${this.appName}: Setting ${key} to ${JSON.stringify(value)}`)
    try {
      return this.flush()
    } catch (error) {
      // WR-04: memory must match the file the launch path reads.
      if (had) {
        this.config[key] = prev as never
      } else {
        delete this.config[key]
      }
      throw error
    }
  }

  public resetToDefaults() {
    this.config = {} as GameSettings
    return this.flush()
  }

  public flush() {
    const config = new Map(Object.entries({ ...this.config }))
    if (this.isExplicit) {
      // Explicit mode on. Config is taken as is, missing values are not substituted for defaults.
      // Even if global defaults are changed, this will not be affected.
      return this.writeToFile(
        Object.fromEntries([
          [this.appName, this.config],
          ['version', currentGameConfigVersion],
          ['explicit', this.isExplicit]
        ])
      )
    }
    // Remove explicitly set values which match the defaults.
    // Thus the defaults are never hard set into any game's config.
    // If the defaults change, they will automatically change.
    // Explicit overrides CANNOT be the same as defaults.
    // TODO(adityaruplaha): fix this
    const globalConfig = new Map(
      Object.entries(this.globalConfig.getSettings())
    )
    const defaultedKeys = Object.entries(this.config)
      .filter(([key, value]) => globalConfig.get(key) === value)
      .map(([k]) => k)
    for (const key of defaultedKeys) {
      config.delete(key)
    }
    return this.writeToFile(
      Object.fromEntries([
        [this.appName, Object.fromEntries(config)],
        ['version', currentGameConfigVersion],
        ['explicit', this.isExplicit]
      ])
    )
  }
}

/** The per-game config members consumers call; test fakes implement exactly this. */
export type GameConfigSlice = Pick<
  GameConfig,
  | 'appName'
  | 'path'
  | 'version'
  | 'config'
  | 'getSettings'
  | 'setSetting'
  | 'resetToDefaults'
  | 'flush'
>

export interface GameConfigs {
  get(appName: string): GameConfigSlice
}

/**
 * Builds the per-game config registry. Called once by the boot's 'config' step; the per-game
 * cache lives in this closure, so two registries never share an instance.
 *
 * Who migrates a game's file (85-15, research A4): the shell, which owns the settings family (no
 * flag since 85-21, D-03). Its boot sweep migrates every `GamesConfig/*.json` before this process is
 * spawned, inside the store boot bound, so a synchronous read here never sees an unmigrated
 * document and nothing is migrated from TS. Only a caller with no root (a test) reads the file
 * directly, migrating it lazily on its first `get` (memoised per file); TS never sweeps
 * GamesConfig/ at boot (the sidecar exit contract).
 */
export function createGameConfigs(deps: {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  /** The boot's store-versioning engine (`StoreRoot.versioning`). */
  versioning: StoreVersioning
  /**
   * The boot's store root (85-15): the settings documents read and write through its mirror when
   * the shell owns them. Absent (a test), the documents are TS-owned over `versioning`.
   */
  root?: SettingsDocRoot
  /** The boot's path roots: the games-config folder, the config file and the prefix defaults. */
  paths: GameConfigPaths
}): GameConfigs {
  const instances = new Map<string, GameConfigSlice>()
  const docs: SettingsDocRoot = deps.root ?? { versioning: deps.versioning }
  return {
    get: (appName) => {
      let instance = instances.get(appName)
      if (!instance) {
        prepareSettingsDoc(
          docs,
          join(deps.paths.gamesConfigPath, appName + '.json'),
          'settings/game'
        )
        instance = new GameConfigV0(appName, deps.config, docs, deps.paths)
        instances.set(appName, instance)
      }
      return instance
    }
  }
}
