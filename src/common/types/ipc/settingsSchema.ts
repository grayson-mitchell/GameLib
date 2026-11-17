/**
 * Phase 70 (D-11): the strict schema for GameSettings / AppSettings, shared by writeConfig,
 * setSetting (per-key value validation), wineTools gameSettings and the LaunchParams
 * launchArguments. Backend/sidecar only: the renderer never value-imports zod.
 *
 * The interfaces stay hand-written in common/types.ts; ipcSchemas/settingsParity.test.ts proves
 * schema output and interface agree, both ways.
 */
import { z } from 'zod'

import type { AppSettings, LaunchOption, WineInstallation } from '../../types'

import { nonEmptyString, wineInstallationArg } from './schemaTypes'

const str = () => z.string().max(4096)
const prose = () => z.string().max(65536)

// `wineVersion` stays the named loose boundary (67-13): it comes from persisted config and may
// carry legacy keys. The backend's own factory default is not always a real installation: with
// no wine on PATH it is `{ bin: '', name: 'Default Wine - Not Found', type: 'wine' }`, and on
// Windows it is `{}`. A full-config write must accept those, so the "no wine" arm admits an empty
// `bin` and absent keys. This arm exists only to admit those two factory defaults, so it is
// strict; lib/lib32/wineserver carry the same bounds as wineInstallationArg. The cast on the
// union keeps the derived type the interface.
const noWineInstallation = z.strictObject({
  bin: z.literal('').optional(),
  name: z.string().max(1024).optional(),
  type: z.enum(['wine', 'proton', 'crossover', 'toolkit']).optional(),
  lib: z.string().max(4096).nullish(),
  lib32: z.string().max(4096).nullish(),
  wineserver: z.string().max(4096).nullish()
})
const wineVersionArg = z.union([
  wineInstallationArg(),
  noWineInstallation
]) as unknown as z.ZodType<WineInstallation, WineInstallation>

const baseLaunchOption = z.strictObject({
  type: z.literal('basic').optional(),
  name: str(),
  parameters: str()
})
const altExeLaunchOption = z.strictObject({
  type: z.literal('altExe'),
  // LaunchOption.executable is the branded Path; the brand is type-only here.
  executable: str().brand<'Path'>()
})
const dlcLaunchOption = z.strictObject({
  type: z.literal('dlc'),
  dlcAppName: nonEmptyString(256),
  dlcTitle: str()
})

// z.union, not discriminatedUnion: the base arm's `type` is optional.
export const launchOptionSchema = z.union([
  baseLaunchOption,
  altExeLaunchOption,
  dlcLaunchOption
]) satisfies z.ZodType<LaunchOption>

const gamescopeSchema = z.strictObject({
  enableUpscaling: z.boolean(),
  enableLimiter: z.boolean(),
  enableForceGrabCursor: z.boolean(),
  windowType: str(),
  gameWidth: str(),
  gameHeight: str(),
  upscaleWidth: str(),
  upscaleHeight: str(),
  upscaleMethod: str(),
  fpsLimiter: str(),
  fpsLimiterNoFocus: str(),
  additionalOptions: prose()
})

export const gameSettingsShape = {
  autoInstallDxvk: z.boolean(),
  autoInstallVkd3d: z.boolean(),
  autoInstallDxvkNvapi: z.boolean(),
  autoSyncSaves: z.boolean(),
  battlEyeRuntime: z.boolean(),
  DXVKFpsCap: str(),
  eacRuntime: z.boolean(),
  enableDXVKFpsLimit: z.boolean(),
  enableEsync: z.boolean(),
  enableFSR: z.boolean(),
  enableMsync: z.boolean(),
  enableFsync: z.boolean(),
  enableWineWayland: z.boolean(),
  enableHDR: z.boolean(),
  enableWoW64: z.boolean(),
  gamescope: gamescopeSchema,
  enviromentOptions: z
    .array(z.strictObject({ key: str(), value: prose() }))
    .max(4096),
  ignoreGameUpdates: z.boolean(),
  language: str(),
  launcherArgs: prose(),
  lastUsedLaunchOption: launchOptionSchema.optional(),
  maxSharpness: z.number().optional(),
  nvidiaPrime: z.boolean(),
  offlineMode: z.boolean(),
  otherOptions: prose().optional(),
  preferSystemLibs: z.boolean(),
  showFps: z.boolean(),
  showMangohud: z.boolean(),
  targetExe: str(),
  useGameMode: z.boolean(),
  wineCrossoverBottle: str(),
  steamEngineOverride: str().optional(),
  engineOverride: str().optional(),
  steamOverlayOverride: z.enum(['automatic', 'on', 'off']).optional(),
  launchWithoutSteam: z.boolean().optional(),
  winePrefix: str(),
  wineVersion: wineVersionArg,
  wrapperOptions: z
    .array(z.strictObject({ exe: str(), args: prose() }))
    .max(4096),
  savesPath: str(),
  gogSaves: z
    .array(z.strictObject({ name: str(), location: str() }))
    .max(4096)
    .optional(),
  beforeLaunchScriptPath: str(),
  afterLaunchScriptPath: str(),
  disableUMU: z.boolean(),
  verboseLogs: z.boolean(),
  advertiseAvxForRosetta: z.boolean(),
  enableQuickSavesMenu: z.boolean()
}

const signInStore = z.enum(['legendary', 'gog', 'nile', 'humble', 'steam'])

export const appSettingsShape = {
  ...gameSettingsShape,
  notifyHumbleExpirations: z.boolean(),
  shareDetectedFixes: z.boolean(),
  addDesktopShortcuts: z.boolean(),
  addStartMenuShortcuts: z.boolean(),
  addSteamShortcuts: z.boolean(),
  altGogdlBin: str(),
  altCometBin: str(),
  altLegendaryBin: str(),
  altNileBin: str(),
  autoUpdateGames: z.boolean(),
  checkForUpdatesOnStartup: z.boolean(),
  checkUpdatesInterval: z.number(),
  customWinePaths: z.array(str()).max(4096),
  trayIconVariant: z.enum(['auto', 'light', 'dark']),
  defaultInstallPath: str(),
  defaultSteamPath: str(),
  loginBackgroundPath: str(),
  sharedWinePrefix: str(),
  defaultWinePrefix: str(),
  defaultWinePrefixDir: str(),
  disableController: z.boolean(),
  disablePlaytimeSync: z.boolean(),
  disableLogs: z.boolean(),
  disableAnimations: z.boolean(),
  discordRPC: z.boolean(),
  disableGOGPresence: z.boolean(),
  downloadNoHttps: z.boolean(),
  downloadProtonToSteam: z.boolean(),
  enableSteamNativeInstall: z.boolean(),
  enableSteamNativeDelete: z.boolean().optional(),
  steamExperimentalInstallApp: z.boolean(),
  egsLinkedPath: str(),
  enableUpdates: z.boolean(),
  exitToTray: z.boolean(),
  gamepadRepeatDelay: z.number(),
  gamepadInitialRepeatDelay: z.number(),
  noTrayIcon: z.boolean(),
  experimentalFeatures: z
    .strictObject({
      cometSupport: z.boolean(),
      umuSupport: z.boolean().optional()
    })
    .optional(),
  framelessWindow: z.boolean(),
  focusRow: z
    .strictObject({
      kind: z.enum(['view', 'collection', 'store', 'runnability']),
      value: str()
    })
    .nullable(),
  dismissedSignInNotices: z.array(signInStore).max(16),
  hideChangelogsOnStartup: z.boolean(),
  hideWindowOnProtocolLaunch: z.boolean(),
  maxWorkers: z.number(),
  minimizeOnLaunch: z.boolean(),
  startInConsoleMode: z.boolean(),
  startInTray: z.boolean(),
  allowInstallationBrokenAnticheat: z.boolean(),
  showValveProton: z.boolean(),
  steamGridDbApiKey: str()
}

export const gameSettingsSchema = z.strictObject(gameSettingsShape)
export const appSettingsSchema = z.strictObject(appSettingsShape)

/** Every key of AppSettings; the parity test proves the tuple covers `keyof AppSettings`. */
export const settingKey = z.enum(
  Object.keys(appSettingsShape) as [keyof AppSettings, ...(keyof AppSettings)[]]
)
