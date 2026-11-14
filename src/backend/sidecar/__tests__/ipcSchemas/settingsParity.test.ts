/**
 * Phase 70 (D-10, D-11): schema output and the hand-written AppSettings / GameSettings /
 * LaunchParams interfaces must be identical, both ways. The type-level checks fail `tsc`; the
 * runtime checks stop a key vanishing from both sides at once, prove every setting key has a
 * valid setSetting value, and prove the values the backend itself produces pass writeConfig.
 */
import type { z } from 'zod'

import type { AppSettings, GameSettings, LaunchParams } from 'common/types'
import { settingsAsyncArgs, settingsSyncArgs } from 'common/types/ipc/settings'
import {
  appSettingsSchema,
  appSettingsShape,
  gameSettingsSchema,
  gameSettingsShape,
  settingKey
} from 'common/types/ipc/settingsSchema'
import { steamAsyncArgs } from 'common/types/ipc/steam'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestVersioning } from 'backend/testUtils/testStoreRoot'
import { createGlobalConfig } from '../../../config'
import { createGameConfigs } from '../../../game_config'

// Identity equality, not mutual assignability.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false
type Simplify<T> = { [K in keyof T]: T[K] } & {}
type Expect<T extends true> = T

type AppParity = Expect<
  Equal<Simplify<z.output<typeof appSettingsSchema>>, Simplify<AppSettings>>
>
type GameParity = Expect<
  Equal<Simplify<z.output<typeof gameSettingsSchema>>, Simplify<GameSettings>>
>
type LaunchArg = (typeof steamAsyncArgs)['launch']
type LaunchParity = Expect<
  Equal<Simplify<z.output<LaunchArg>[0]>, Simplify<LaunchParams>>
>
type KeyParity = Expect<Equal<z.output<typeof settingKey>, keyof AppSettings>>

// Negative control: an extra optional key on one side must break Equal.
type ControlBroken = Equal<
  Simplify<z.output<typeof gameSettingsSchema>>,
  Simplify<GameSettings & { extraneous?: string }>
>
// @ts-expect-error the control must report false; if Equal were loose this line would compile
const controlMustBeFalse: ControlBroken = true

// One valid value per AppSettings key. Typed as a full record so tsc forces a row for a new key.
const wine = { bin: '/w', name: 'W', type: 'wine' } as const
const validValues: { [K in keyof AppSettings]-?: AppSettings[K] } = {
  autoInstallDxvk: true,
  autoInstallVkd3d: false,
  autoInstallDxvkNvapi: false,
  autoSyncSaves: true,
  battlEyeRuntime: false,
  DXVKFpsCap: '60',
  eacRuntime: false,
  enableDXVKFpsLimit: false,
  enableEsync: true,
  enableFSR: false,
  enableMsync: true,
  enableFsync: false,
  enableWineWayland: false,
  enableHDR: false,
  enableWoW64: false,
  gamescope: {
    enableUpscaling: false,
    enableLimiter: false,
    enableForceGrabCursor: false,
    windowType: 'fullscreen',
    gameWidth: '',
    gameHeight: '',
    upscaleWidth: '',
    upscaleHeight: '',
    upscaleMethod: 'fsr',
    fpsLimiter: '',
    fpsLimiterNoFocus: '',
    additionalOptions: ''
  },
  enviromentOptions: [{ key: 'A', value: 'b' }],
  ignoreGameUpdates: false,
  language: 'en',
  launcherArgs: '-windowed',
  lastUsedLaunchOption: { type: 'basic', name: 'n', parameters: 'p' },
  maxSharpness: 5,
  nvidiaPrime: false,
  offlineMode: false,
  otherOptions: '',
  preferSystemLibs: false,
  showFps: false,
  showMangohud: false,
  targetExe: '',
  useGameMode: false,
  wineCrossoverBottle: 'GameLib',
  steamEngineOverride: 'engine-1',
  engineOverride: 'engine-1',
  steamOverlayOverride: 'automatic',
  winePrefix: '/p',
  wineVersion: wine,
  wrapperOptions: [{ exe: 'gamemoderun', args: '' }],
  savesPath: '',
  gogSaves: [{ name: 'saves', location: '/s' }],
  beforeLaunchScriptPath: '',
  afterLaunchScriptPath: '',
  disableUMU: false,
  verboseLogs: true,
  advertiseAvxForRosetta: false,
  enableQuickSavesMenu: false,
  notifyHumbleExpirations: true,
  shareDetectedFixes: false,
  addDesktopShortcuts: false,
  addStartMenuShortcuts: false,
  addSteamShortcuts: false,
  altGogdlBin: '',
  altCometBin: '',
  altLegendaryBin: '',
  altNileBin: '',
  autoUpdateGames: true,
  checkForUpdatesOnStartup: true,
  checkUpdatesInterval: 10,
  customWinePaths: ['/opt/wine'],
  trayIconVariant: 'auto',
  defaultInstallPath: '/g',
  defaultSteamPath: '/s',
  loginBackgroundPath: '',
  sharedWinePrefix: '/sp',
  defaultWinePrefix: '/dp',
  defaultWinePrefixDir: '/dp',
  disableController: false,
  disablePlaytimeSync: false,
  disableLogs: false,
  disableAnimations: false,
  discordRPC: false,
  disableGOGPresence: false,
  downloadNoHttps: false,
  downloadProtonToSteam: false,
  enableSteamNativeInstall: true,
  enableSteamNativeDelete: false,
  steamExperimentalInstallApp: false,
  egsLinkedPath: '',
  enableUpdates: false,
  exitToTray: false,
  gamepadRepeatDelay: 50,
  gamepadInitialRepeatDelay: 300,
  noTrayIcon: false,
  experimentalFeatures: { cometSupport: false, umuSupport: true },
  framelessWindow: false,
  focusRow: { kind: 'store', value: 'steam' },
  dismissedSignInNotices: ['steam'],
  hideChangelogsOnStartup: false,
  hideWindowOnProtocolLaunch: true,
  maxWorkers: 0,
  minimizeOnLaunch: false,
  startInConsoleMode: false,
  startInTray: false,
  allowInstallationBrokenAnticheat: false,
  showValveProton: false,
  steamGridDbApiKey: ''
}

// A value of the wrong type for each kind of key.
const wrongValues: [keyof AppSettings, unknown][] = [
  ['autoUpdateGames', 'yes'],
  ['language', 5],
  ['trayIconVariant', 'purple'],
  ['steamOverlayOverride', 'maybe'],
  ['customWinePaths', 'not-an-array'],
  ['customWinePaths', [1]],
  ['gamescope', { enableUpscaling: true }],
  ['gamescope', 'x'],
  ['focusRow', { kind: 'bogus', value: 'x' }],
  ['wineVersion', { bin: '/w', name: 'W', type: 'bogus' }],
  ['lastUsedLaunchOption', { type: 'dlc', dlcAppName: '' }],
  ['checkUpdatesInterval', '10'],
  ['dismissedSignInNotices', ['epic']]
]

const optionalKeys = (Object.keys(appSettingsShape) as (keyof AppSettings)[])
  .filter((k) => appSettingsShape[k].safeParse(undefined).success)
  .sort()

const wireSetSetting = settingsSyncArgs.setSetting
const wireWriteConfig = settingsAsyncArgs.writeConfig

describe('settings schema parity (D-10)', () => {
  it('compiles the type-level parity checks', () => {
    const checks: [AppParity, GameParity, LaunchParity, KeyParity] = [
      true,
      true,
      true,
      true
    ]
    expect(checks.every(Boolean)).toBe(true)
    expect(controlMustBeFalse).toBe(true)
  })

  it('declares exactly the keys of AppSettings and GameSettings', () => {
    expect(Object.keys(appSettingsShape).sort()).toEqual(
      Object.keys(validValues).sort()
    )
    expect(settingKey.options.slice().sort()).toEqual(
      Object.keys(appSettingsShape).sort()
    )
    const appOnly = Object.keys(appSettingsShape).filter(
      (k) => !(k in gameSettingsShape)
    )
    expect(appOnly).toContain('trayIconVariant')
    expect(Object.keys(gameSettingsShape)).not.toContain('trayIconVariant')
  })
})

describe('setSetting per-key values (D-11, T-70-30)', () => {
  const keys = Object.keys(appSettingsShape) as (keyof AppSettings)[]

  it.each(keys)('accepts a valid value for %s', (key) => {
    const parsed = wireSetSetting.safeParse([
      { appName: 'default', key, value: validValues[key] }
    ])
    expect(parsed.success).toBe(true)
  })

  it.each(optionalKeys)('accepts null and an absent value for %s', (key) => {
    expect(
      wireSetSetting.safeParse([{ appName: 'default', key, value: null }])
        .success
    ).toBe(true)
    expect(
      wireSetSetting.safeParse([{ appName: 'default', key }]).success
    ).toBe(true)
  })

  it('rejects null for a required key', () => {
    expect(
      wireSetSetting.safeParse([
        { appName: 'default', key: 'autoUpdateGames', value: null }
      ]).success
    ).toBe(false)
  })

  it('rejects an unknown key', () => {
    expect(
      wireSetSetting.safeParse([
        { appName: 'default', key: 'unknownFutureKey', value: 1 }
      ]).success
    ).toBe(false)
  })

  it.each(wrongValues)('rejects a wrong value for %s', (key, value) => {
    expect(
      wireSetSetting.safeParse([{ appName: 'default', key, value }]).success
    ).toBe(false)
  })
})

describe('backend-produced settings pass writeConfig (D-11, T-70-31)', () => {
  const profile = createFakeHomeProfile()
  afterAll(() => profile.dispose())

  it('the default AppSettings and default GameSettings are valid', async () => {
    const paths = createTestAppPaths(profile.root)
    const versioning = createTestVersioning()
    const global = createGlobalConfig({
      requestRustInvoke: jest.fn(),
      versioning,
      paths
    })
    const appDefaults = JSON.parse(JSON.stringify(global.getFactoryDefaults()))
    const gameDefaults = JSON.parse(
      JSON.stringify(
        await createGameConfigs({ config: global, versioning, paths })
          .get('some-game')
          .getSettings()
      )
    )
    const r = wireWriteConfig.safeParse([
      { appName: 'default', config: appDefaults }
    ])
    expect(r.success).toBe(true)
    expect(
      wireWriteConfig.safeParse([
        { appName: 'some-game', config: gameDefaults }
      ]).success
    ).toBe(true)
  })

  it('a Windows-style empty wineVersion is valid', () => {
    expect(
      wireWriteConfig.safeParse([
        { appName: 'default', config: { wineVersion: {} } }
      ]).success
    ).toBe(true)
  })
})
