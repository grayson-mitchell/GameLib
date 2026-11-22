/**
 * Phase 70 (D-09, D-10): the strict per-runner GameInfo schemas that guard every IPC channel
 * carrying a renderer-built GameInfo (install, updateGame, addNewApp). The D-12 library
 * migration that once read them in TS is the shell's now (gamelib-store `migrate/libraries.rs`,
 * which strips to `schemas.json`, generated from these schemas). Backend/sidecar only: the
 * renderer never value-imports zod.
 *
 * The interfaces in common/types.ts and common/types/<store>.ts stay hand-written; the
 * parity test (ipcSchemas/gameInfoParity.test.ts) proves schema output and interface agree.
 */
import { z } from 'zod'

import type { GameMetadataInner } from '../legendary'

import { nonEmptyString } from './schemaTypes'

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

const str = () => z.string().max(4096)
// Prose bodies (store descriptions, changelogs, requirement text) are legitimately long.
const prose = () => z.string().max(262144)
const artUrl = () => z.string().max(65536)

const manifestSchema = z.strictObject({
  disk_size: z.number(),
  download_size: z.number(),
  app_name: str(),
  languages: z.array(str()).max(4096),
  versionEtag: str(),
  dependencies: z.array(str()).max(4096),
  perLangSize: z.record(
    z.string(),
    z.strictObject({ download_size: z.number(), disk_size: z.number() })
  )
})

// Keys of InstalledInfo; every one optional because GameInfoCore.install is Partial<InstalledInfo>.
const installedInfoShape = {
  manifest: manifestSchema.optional(),
  executable: str().optional(),
  install_path: str().optional(),
  install_size: str().optional(),
  is_dlc: z.boolean().optional(),
  version: str().optional(),
  platform: installPlatform.optional(),
  appName: str().optional(),
  language: str().optional(),
  branch: str().optional()
}

const steamInstalledInfoShape = {
  ...installedInfoShape,
  steamResumePending: z.boolean().optional(),
  steamResumeTargetSteamappsDir: str().optional(),
  steamResumeInstalldir: str().optional(),
  steamResumeInstalledAtStart: z.boolean().optional()
}

const gogInstalledInfoShape = {
  ...installedInfoShape,
  isDosbox: z.boolean().optional(),
  dosboxConf: z.array(str()).max(4096).optional(),
  installedWithDLCs: z.boolean().optional(),
  installedDLCs: z.array(str()).max(4096).optional(),
  versionEtag: str().optional(),
  buildId: str().optional(),
  pinnedVersion: z.boolean().optional(),
  cyberpunk: z
    .strictObject({
      modsEnabled: z.boolean(),
      modsToLoad: z.array(str()).max(4096)
    })
    .optional()
}

const aboutSchema = z.strictObject({
  description: prose(),
  shortDescription: prose()
})

const reqsSchema = z.strictObject({
  minimum: prose(),
  recommended: prose(),
  title: str()
})

const extraInfoShape = {
  about: aboutSchema.optional(),
  reqs: z.array(reqsSchema).max(256),
  releaseDate: str().optional(),
  storeUrl: str().optional(),
  changelog: prose().optional(),
  genres: z.array(str()).max(256).optional()
}

const extraInfoSchema = z.strictObject(extraInfoShape)

const steamExtraInfoSchema = z.strictObject({
  ...extraInfoShape,
  steamPlaytimeMinutes: z.number().optional(),
  steamLastPlayed: z.number().optional()
})

const overridesSchema = z.strictObject({
  title: str().optional(),
  art_cover: artUrl().optional(),
  art_square: artUrl().optional()
})

/**
 * The one sanctioned loose boundary in the GameInfo schemas. `dlcList` is a raw Epic API blob
 * (GameMetadataInner): a third-party payload whose persisted entries carry undeclared keys on
 * real profiles (`mainGameItemList`, `esrbGameRatingValue`, `longDescription`), and no reader
 * consumes it. Strict-declaring it would reject real library entries at install. Loose, the
 * array and element type remain bounded. Mirrors wineInstallationArg() in schemaTypes.ts; the
 * cast keeps the derived type the interface (zod's loose-object type carries an index
 * signature an interface cannot satisfy). Deleting dlcList outright is a deferred idea.
 */
function epicDlcMetadataArg() {
  return z.array(z.looseObject({})).max(4096) as unknown as z.ZodType<
    GameMetadataInner[],
    GameMetadataInner[]
  >
}

// Keys of GameInfoCore except `runner` (each member adds its literal) and the members'
// `install` / `extra`, which a member narrows.
const gameInfoCoreShape = {
  store_url: str().optional(),
  app_name: nonEmptyString(),
  art_cover: artUrl(),
  art_logo: artUrl().optional(),
  art_background: artUrl().optional(),
  art_icon: artUrl().optional(),
  art_square: artUrl(),
  cloud_save_enabled: z.boolean().optional(),
  developer: str().optional(),
  extra: extraInfoSchema.optional(),
  folder_name: str().optional(),
  install: z.strictObject(installedInfoShape),
  is_installed: z.boolean(),
  save_folder: str().optional(),
  title: str(),
  canRunOffline: z.boolean(),
  thirdPartyManagedApp: str().optional(),
  is_mac_native: z.boolean().optional(),
  mac_arch: z.enum(['32', '64', 'unknown']).optional(),
  is_linux_native: z.boolean().optional(),
  is_windows_native: z.boolean().optional(),
  metacritic_score: z.number().optional(),
  description: prose().optional(),
  version: str().optional(),
  overrides: overridesSchema.optional()
}

export const steamGameInfoSchema = z.strictObject({
  ...gameInfoCoreShape,
  runner: z.literal('steam'),
  extra: steamExtraInfoSchema.optional(),
  install: z.strictObject(steamInstalledInfoShape),
  installable: z.boolean().optional(),
  is_delisted: z.boolean().optional(),
  steamPlatformsCaptured: z.boolean().optional()
})

export const gogGameInfoSchema = z.strictObject({
  ...gameInfoCoreShape,
  runner: z.literal('gog'),
  install: z.strictObject(gogInstalledInfoShape),
  gog_save_location: z
    .array(z.strictObject({ name: str(), location: str() }))
    .max(4096)
    .optional()
})

export const legendaryGameInfoSchema = z.strictObject({
  ...gameInfoCoreShape,
  runner: z.literal('legendary'),
  namespace: str().optional(),
  // Persisted as null by save_sync.ts when the user discards a stored save path.
  save_path: str().nullable().optional(),
  isEAManaged: z.boolean().optional(),
  isUbisoftManaged: z.boolean().optional(),
  dlcList: epicDlcMetadataArg().optional()
})

export const nileGameInfoSchema = z.strictObject({
  ...gameInfoCoreShape,
  runner: z.literal('nile')
})

export const sideloadGameInfoSchema = z.strictObject({
  ...gameInfoCoreShape,
  runner: z.literal('sideload'),
  browserUrl: str().optional(),
  customUserAgent: str().optional(),
  launchFullScreen: z.boolean().optional()
})

export const gameInfoSchema = z.discriminatedUnion('runner', [
  steamGameInfoSchema,
  gogGameInfoSchema,
  legendaryGameInfoSchema,
  nileGameInfoSchema,
  sideloadGameInfoSchema
])
