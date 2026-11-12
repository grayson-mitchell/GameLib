/**
 * @file  Defines functions to update, download or remove available
 *        tool releases.
 */

import { existsSync, mkdirSync, rmSync } from 'graceful-fs'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import {
  WineVersionInfo,
  Repositorys,
  WineManagerStatus,
  ReleasesInfo
} from 'common/types'

import { getAvailableVersions, installVersion } from './downloader/main'
import type { SendFrontendMessage } from '../../host/frontendMessage'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import type { AppPaths } from 'backend/process/context'
import { isLinux, isMac, isWindows } from 'backend/constants/environment'
import type { GlobalConfigSlice } from '../../config'
import { join } from 'path'
import type { AppRuntimeSlice } from 'backend/appRuntime'
import type { Stores } from 'backend/services/types'
import type { ProcessRunner } from 'backend/process/types'

/** The store slice the wine manager reads (66.1, R1). */
export interface WineManagerDeps {
  stores: {
    wineManager: Pick<Stores['wineManager'], 'wineDownloaderInfoStore'>
  }
  sendFrontendMessage: SendFrontendMessage
}

function getLatestLocalVersions(
  deps: WineManagerDeps
): Record<string, string | undefined> {
  const localWines = deps.stores.wineManager.wineDownloaderInfoStore.get(
    'wine-releases',
    []
  )

  if (isLinux) {
    return {
      latestGEProton: localWines.find(
        (wine) => wine.version === 'GE-Proton-latest'
      )?.date,
      latestProtonCachyos: localWines.find(
        (wine) => wine.version === 'Proton-CachyOS-latest'
      )?.date
    }
  }

  if (isMac) {
    return {
      latestWineCrossover: localWines.find(
        (wine) => wine.version === 'Wine-Crossover-latest'
      )?.date,
      latestWineStaging: localWines.find(
        (wine) => wine.version === 'Wine-Staging-macOS-latest'
      )?.date,
      latestGPTK: localWines.find(
        (wine) => wine.version === 'Game-Porting-Toolkit-latest'
      )?.date
    }
  }

  return {}
}

// compare dates only of local version is present
function localVersionIsOlder(
  localDate: string | undefined,
  latestRelease: { published_at: string; tag: string }
) {
  if (!localDate) return false

  return (
    Date.parse(localDate) <
    Date.parse(latestRelease.published_at.replace(/T.*/, ''))
  )
}

// Fetch the latest releases of the different translation layers but only
// if we don't already have the latest version locally
//
// Note that this updates the list of releases of a given repo if and only if
// we already have a list for that given repo
export function updateWineListsIfOutdated(
  deps: WineManagerDeps,
  releasesData: ReleasesInfo
) {
  if (isWindows) return

  const latestLocalVersions = getLatestLocalVersions(deps)
  const repositoriesToFetch = []

  // compare dates to know which repositories to fetch
  if (isLinux) {
    if (
      localVersionIsOlder(
        latestLocalVersions.latestGEProton,
        releasesData['ge-proton']
      )
    )
      repositoriesToFetch.push(Repositorys.PROTONGE)

    if (
      localVersionIsOlder(
        latestLocalVersions.latestProtonCachyos,
        releasesData['proton-cachyos']
      )
    )
      repositoriesToFetch.push(Repositorys.PROTONCACHYOS)
  }

  if (isMac) {
    if (
      localVersionIsOlder(
        latestLocalVersions.latestWineCrossover,
        releasesData['wine-crossover']
      )
    )
      repositoriesToFetch.push(Repositorys.WINECROSSOVER)

    if (
      localVersionIsOlder(
        latestLocalVersions.latestWineStaging,
        releasesData['wine-staging']
      )
    )
      repositoriesToFetch.push(Repositorys.WINESTAGINGMACOS)

    if (
      localVersionIsOlder(
        latestLocalVersions.latestGPTK,
        releasesData['game-porting-toolkit']
      )
    )
      repositoriesToFetch.push(Repositorys.GPTK)
  }

  if (repositoriesToFetch.length > 0) {
    void updateWineVersionInfos(deps, true, repositoriesToFetch)
  }
}

async function updateWineVersionInfos(
  deps: WineManagerDeps,
  fetch = false,
  repositorys: Repositorys[] | null = null,
  count = 50
): Promise<WineVersionInfo[]> {
  let releases: WineVersionInfo[] = []

  logInfo('Updating wine versions info', LogPrefix.WineDownloader)
  if (fetch) {
    logInfo('Fetching upstream information...', LogPrefix.WineDownloader)

    if (repositorys === null) {
      repositorys = isMac
        ? [
            Repositorys.WINECROSSOVER,
            Repositorys.WINESTAGINGMACOS,
            Repositorys.GPTK
          ]
        : [Repositorys.PROTONGE, Repositorys.PROTONCACHYOS]
    }

    await getAvailableVersions({
      repositorys,
      count
    }).then((response) => (releases = response as WineVersionInfo[]))

    let releasesToStore: WineVersionInfo[] = []

    if (deps.stores.wineManager.wineDownloaderInfoStore.has('wine-releases')) {
      const old_releases = deps.stores.wineManager.wineDownloaderInfoStore.get(
        'wine-releases',
        []
      )

      old_releases.forEach((old) => {
        releasesToStore.push(old)

        const index = releases.findIndex((release) => {
          if (isLinux && release.type === 'GE-Proton') {
            // The "Proton" prefix got dropped from the version string. We still
            // want to detect old versions though
            if (`Proton-${release.version}` === old.version) return true
            // -latest is an even more special case, since it got renamed from
            // "Proton-GE-latest" to "GE-Proton-latest"
            if (
              release.version === 'GE-Proton-latest' &&
              old.version === 'Proton-GE-latest'
            )
              return true
          }
          return release.version === old.version
        })

        if (old.installDir !== undefined && existsSync(old?.installDir)) {
          const match = releases[index]
          if (match !== undefined) {
            match.installDir = old.installDir
            match.isInstalled = old.isInstalled
            match.disksize = old.disksize
            if (match.checksum !== old.checksum || old.hasUpdate) {
              match.hasUpdate = true
            }
          } else {
            releases.push(old)
          }
        }
      })

      // here we are adding new elements to the list and replacing the `-latest`
      releases.forEach((release) => {
        const foundIndex = releasesToStore.findIndex(
          (oldRelease) =>
            oldRelease.version === release.version ||
            oldRelease.version === `Proton-${release.version}`
        )
        if (foundIndex === -1) {
          releasesToStore.push(release)
        } else if (release.version.endsWith('-latest')) {
          releasesToStore[foundIndex] = release
        }
      })
    } else {
      releasesToStore = releases
    }

    deps.stores.wineManager.wineDownloaderInfoStore.set(
      'wine-releases',
      releasesToStore.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    )
  } else {
    logInfo('Read local information ...', LogPrefix.WineDownloader)
    if (deps.stores.wineManager.wineDownloaderInfoStore.has('wine-releases')) {
      releases.push(
        ...deps.stores.wineManager.wineDownloaderInfoStore.get(
          'wine-releases',
          []
        )
      )
    }
  }

  logInfo('wine versions updated', LogPrefix.WineDownloader)
  deps.sendFrontendMessage('wineVersionsUpdated')
  return releases
}

function getInstallDir(
  deps: {
    config: Pick<GlobalConfigSlice, 'getSettings'>
    paths: Pick<AppPaths, 'toolsPath'>
  },
  release: WineVersionInfo
): string {
  if (release?.type?.includes('Wine')) {
    return `${deps.paths.toolsPath}/wine`
  } else if (release.type.includes('Toolkit')) {
    return `${deps.paths.toolsPath}/game-porting-toolkit`
  } else {
    const config = deps.config.getSettings()
    if (config.downloadProtonToSteam && config.defaultSteamPath) {
      const isValidSteamPath = existsSync(
        join(config.defaultSteamPath, 'steam.sh')
      )
      if (isValidSteamPath) {
        const compatToolsPath = join(
          config.defaultSteamPath,
          'compatibilitytools.d'
        )
        mkdirSync(compatToolsPath, { recursive: true })
        return compatToolsPath
      } else {
        logWarning(
          `Configured Steam path ("${config.defaultSteamPath}") does not appear to be valid, installing into Heroic tools path instead`,
          LogPrefix.WineDownloader
        )
      }
    }
    return `${deps.paths.toolsPath}/proton`
  }
}

async function installWineVersion(
  deps: WineManagerDeps & {
    runner: Pick<ProcessRunner, 'run'>
    config: Pick<GlobalConfigSlice, 'getSettings'>
    paths: Pick<AppPaths, 'toolsPath'>
    /** The boot-owned abort registry a release download registers in (66.4-13). */
    aborts: Pick<AbortRegistry, 'create' | 'delete'>
  } & AppRuntimeSlice<'events'>,
  release: WineVersionInfo,
  onProgress: (status: WineManagerStatus) => void
) {
  let updatedInfo: WineVersionInfo
  const variant = release.hasUpdate ? 'update' : 'installation'

  if (!existsSync(`${deps.paths.toolsPath}/wine`)) {
    mkdirSync(`${deps.paths.toolsPath}/wine`, { recursive: true })
  }

  if (isMac && !existsSync(`${deps.paths.toolsPath}/game-porting-toolkit`)) {
    mkdirSync(`${deps.paths.toolsPath}/game-porting-toolkit`, {
      recursive: true
    })
  }

  if (!existsSync(`${deps.paths.toolsPath}/proton`)) {
    mkdirSync(`${deps.paths.toolsPath}/proton`, { recursive: true })
  }

  logInfo(
    `Start ${variant} of wine version ${release.version}`,
    LogPrefix.WineDownloader
  )

  const installDir = getInstallDir(deps, release)

  const abortController = deps.aborts.create(release.version)

  try {
    const response = await installVersion({
      versionInfo: release,
      installDir,
      overwrite: release.hasUpdate,
      onProgress: onProgress,
      abortSignal: abortController.signal,
      runner: deps.runner,
      appRuntime: deps.appRuntime
    })
    updatedInfo = {
      ...response.versionInfo,
      installDir: response.installDir,
      isInstalled: true,
      hasUpdate: false,
      type: release.type
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      logWarning(error, LogPrefix.WineDownloader)
      return 'abort'
    } else {
      logError(error, LogPrefix.WineDownloader)
      return 'error'
    }
  } finally {
    deps.aborts.delete(release.version)
  }

  // Update stored information
  if (deps.stores.wineManager.wineDownloaderInfoStore.has('wine-releases')) {
    const releases = deps.stores.wineManager.wineDownloaderInfoStore.get(
      'wine-releases',
      []
    )

    const index = releases.findIndex((storedRelease) => {
      return release?.version === storedRelease?.version
    })

    if (index === -1) {
      logError(
        `Can't find ${release.version} in electron-store -> wine-downloader-info.json!`,
        LogPrefix.WineDownloader
      )
      return 'error'
    }

    releases[index] = updatedInfo

    deps.stores.wineManager.wineDownloaderInfoStore.set(
      'wine-releases',
      releases
    )
  } else {
    logError(
      `Couldn't find a tools entry in electron-store -> wine-downloader-info.json. Tool ${release.version} couldn't be installed!`,
      LogPrefix.WineDownloader
    )
    return 'error'
  }

  logInfo(
    `Finished ${variant} of wine version ${release.version}`,
    LogPrefix.WineDownloader
  )

  deps.sendFrontendMessage('wineVersionsUpdated')
  return 'success'
}

async function removeWineVersion(
  deps: WineManagerDeps & AppRuntimeSlice<'events'>,
  release: WineVersionInfo
): Promise<boolean> {
  if (!deps.stores.wineManager.wineDownloaderInfoStore.has('wine-releases')) {
    logError(
      `Couldn't find a wine-releases entry in electron-store -> wine-downloader-info.json. Release ${release.version} couldn't be removed!`,
      LogPrefix.WineDownloader
    )
    return false
  }

  const releases = deps.stores.wineManager.wineDownloaderInfoStore.get(
    'wine-releases',
    []
  )
  const index = releases.findIndex((storedRelease) => {
    return release.version === storedRelease.version
  })

  const stored = releases[index]
  if (index === -1 || stored === undefined) {
    logError(
      `Can't find ${release.version} in electron-store -> wine-downloader-info.json!`,
      LogPrefix.WineDownloader
    )
    return false
  }

  // `release` arrives from the renderer over IPC, so its `installDir` is untrusted: only ever
  // remove the directory this backend itself recorded for the version when it installed it.
  const installDir = stored.installDir

  // remove folder if exist
  if (installDir && existsSync(installDir)) {
    try {
      rmSync(installDir, { recursive: true })
      // A copy: the stored entry's installDir is cleared below, and the DXMT listener reads it.
      deps.appRuntime.events.emit('wineVersionUninstalled', { ...stored })
    } catch (error) {
      logError(error, LogPrefix.WineDownloader)
      logWarning(
        `Couldn't remove folder ${installDir}! Still mark wine version ${release.version} as not installed!`,
        LogPrefix.WineDownloader
      )
    }
  }

  // update tool information
  stored.isInstalled = false
  stored.installDir = ''
  stored.disksize = 0
  stored.hasUpdate = false

  deps.stores.wineManager.wineDownloaderInfoStore.set('wine-releases', releases)

  logInfo(
    `Removed wine version ${release.version} succesfully.`,
    LogPrefix.WineDownloader
  )

  deps.sendFrontendMessage('wineVersionsUpdated')
  return true
}

export { updateWineVersionInfos, installWineVersion, removeWineVersion }
