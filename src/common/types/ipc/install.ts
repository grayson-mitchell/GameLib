import { z } from 'zod'

import type { GameInfo, StatusPromise } from '../../types'

import {
  nonEmptyString,
  optionalArg,
  phase70Passthrough,
  runnerArg,
  wineInstallationArg,
  type InvokeFns
} from './schemaTypes'

// Every InstallPlatform member (LegendaryInstallPlatform | GogInstallPlatform |
// NileInstallPlatform | 'Browser'); the call-site type check against InstallPlatform catches drift.
export const installPlatform = z.enum([
  'Windows',
  'Win32',
  'Mac',
  'Android',
  'iOS',
  'windows',
  'osx',
  'linux',
  'Browser'
])

// D-07: the GameInfo nested in install/update args is a PHASE70-PASSTHROUGH. Declared keys are
// only the ones the sidecar handlers read directly (`updateGame` destructures
// `install.platform` / `install.install_path`); Phase 70 tightens the rest.
// The cast keeps the derived call-site type the full GameInfo: zod's loose-object input type
// carries an index signature that GameInfo (an interface) cannot satisfy.
const gameInfoArg = phase70Passthrough({
  app_name: nonEmptyString(),
  runner: runnerArg(),
  install: phase70Passthrough({
    platform: installPlatform.optional(),
    install_path: z.string().max(4096).optional()
  })
}) as unknown as z.ZodType<GameInfo, GameInfo>

const stringList = z.array(z.string().max(4096)).max(4096)

// Keys of InstallParams. `updateGame` shares the shape: a retried update re-sends the queue
// element's params, which the backend has already extended with `path` / `platformToInstall`.
const installFields = {
  appName: nonEmptyString(),
  runner: runnerArg(),
  gameInfo: gameInfoArg,
  path: z.string().max(4096),
  platformToInstall: installPlatform,
  installDlcs: stringList.optional(),
  sdlList: stringList.optional(),
  installLanguage: z.string().max(256).optional(),
  branch: z.string().max(1024).optional(),
  build: z.string().max(1024).optional(),
  dependencies: stringList.optional(),
  steamForceWindowsViaBottle: z.boolean().optional(),
  size: z.string().max(256).optional()
}

interface SteamLibraryTarget {
  path: string
  steamappsDir: string
  isPrimary: boolean
}

export const installAsyncArgs = {
  checkGameUpdates: z.tuple([]),
  listSteamLibraryTargets: z.tuple([optionalArg(z.string().max(64))]),
  getSteamDeleteRoute: z.tuple([optionalArg(z.string().max(64))]),
  getSteamInstallAppTargets: z.tuple([optionalArg(z.string().max(64))]),
  install: z.tuple([z.strictObject(installFields)]),
  uninstall: z.tuple([nonEmptyString(), runnerArg(), z.boolean(), z.boolean()]),
  // `path` is a bounded string, deliberately NOT absolutePathArg(): the handler's
  // assertPlausibleAbsolutePath owns the rejection, and that is what emits the localisable
  // dialog and the terminal 'done' status (T-34.6-31). A boundary reject would skip both (D-05).
  moveInstall: z.tuple([
    z.strictObject({
      appName: nonEmptyString(),
      path: z.string().max(4096),
      runner: runnerArg()
    })
  ]),
  importGame: z.tuple([
    z.strictObject({
      appName: nonEmptyString(),
      path: z.string().max(4096),
      runner: runnerArg(),
      platform: installPlatform,
      winePrefix: z.string().max(4096).optional(),
      wineVersion: wineInstallationArg().optional(),
      wineCrossoverBottle: z.string().max(1024).optional(),
      engineOverride: z.string().max(256).optional()
    })
  ]),
  updateGame: z.tuple([
    z.strictObject({
      ...installFields,
      path: installFields.path.optional(),
      platformToInstall: installPlatform.optional()
    })
  ])
}

interface InstallAsyncReturns {
  checkGameUpdates: Promise<string[]>
  // Phase 21 (21-09), D-09: registered Steam libraries for the multi-library
  // install-location override picker (D-08 — registered folders only, never
  // an arbitrary filesystem browse). Gated server-side on the D-13 opt-in —
  // returns [] when native install is OFF, EXCEPT for a bottle-routed title:
  // pass its `appName` and the backend answers with targets regardless of the
  // toggle (quick 261030-o77: the toggle only scopes mac-native titles).
  listSteamLibraryTargets: Promise<SteamLibraryTarget[]>
  // quick 261105-upw: backend-authoritative InstallApp-route discriminator for
  // the install modal. installAppRoute is true only for feature ON + native
  // OFF + non-bottle title on macOS; libraries are then the registered targets.
  // quick 261106-s3n: true only when "Delete Steam games directly in GameLib"
  // is ON and this appId is a native-root install (backend-authoritative).
  getSteamDeleteRoute: Promise<{ gamelibDelete: boolean; delegated: boolean }>
  getSteamInstallAppTargets: Promise<{
    installAppRoute: boolean
    libraries: SteamLibraryTarget[]
  }>
  install: Promise<void>
  uninstall: Promise<void>
  moveInstall: Promise<void>
  importGame: StatusPromise
  updateGame: Promise<void>
}

export type InstallAsync = InvokeFns<
  typeof installAsyncArgs,
  InstallAsyncReturns
>
