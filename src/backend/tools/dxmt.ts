import type { backendEvents } from 'backend/backend_events'
import type { DialogBoxDeps } from '../dialog/dialog'
import { isMac } from 'backend/constants/environment'
import { logDebug, logError, LogPrefix, logWarning } from 'backend/logger'
import type { OnlineMonitor } from 'backend/online_monitor'
import { installOrUpdateTool } from '.'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import type { ReleasesInfo, Tool, WineVersionInfo } from 'common/types'
import { join } from 'path'
import {
  copyFileSync,
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'graceful-fs'
import { toolsPath } from 'backend/constants/paths'
import { checkWinemacMetalViewExports } from './machoExports'
import type { WinemacMetalCheck } from './machoExports'
import type { Stores } from 'backend/services/types'
import type { ProcessRunner } from 'backend/process/types'

/** The store slice the DXMT listeners read (66.1, R1). */
interface DxmtStoresDeps extends DialogBoxDeps {
  runner: Pick<ProcessRunner, 'run'>
  aborts: Pick<AbortRegistry, 'create'>
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  stores: {
    wineManager: Pick<Stores['wineManager'], 'wineDownloaderInfoStore'>
  }
}

/**
 * What `registerDxmtListeners` needs (66.3-15): the store slice and runner the listeners read, and
 * the emitter they attach to. Every member is required, so a listener can never exist without its
 * deps: there is no unbound state to skip through.
 */
export interface DxmtListenerDeps extends DxmtStoresDeps {
  events: Pick<typeof backendEvents, 'on' | 'off'>
}

// Quick 261031-rjv: DXMT v0.80's winemetal.so resolves macdrv metal-view symbols that
// Wine-Staging-macOS's winemac.so does not define, so D3D11 games cannot present on a
// -DXMT copy of it. Existing copies are deliberately left alone.
function logDXMTSkip(
  action: 'creating' | 'updating',
  versionLabel: string,
  result: Extract<WinemacMetalCheck, { ok: false }>
) {
  logWarning(
    `Not ${action} DXMT copy of ${versionLabel}: ${result.winemacPath} ${result.reason}; missing ${result.missing.join(', ')}. DXMT v0.80 needs _macdrv_functions or all three _macdrv_view_*_metal_* exports, so D3D11 games could not present on it. Existing -DXMT copies are left untouched.`,
    LogPrefix.ToolInstaller
  )
}

const DXMT = {
  getLatest: (
    deps: {
      runner: Pick<ProcessRunner, 'run'>
      aborts: Pick<AbortRegistry, 'create'>
      onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
    } & DialogBoxDeps
  ) => {
    if (!deps.onlineMonitor.isOnline()) {
      logWarning(
        'App offline, skipping possible DXMT update.',
        LogPrefix.ToolInstaller
      )
      return
    }

    const tool: Tool = {
      name: 'dxmt',
      url: 'https://api.github.com/repos/3Shain/dxmt/releases/latest',
      os: 'darwin'
    }

    return installOrUpdateTool(deps, tool)
  },
  copyWineAndConfigure: async (
    versionInfo: WineVersionInfo,
    installDir: string
  ) => {
    const wineFilePath = join(installDir, versionInfo.version)
    const wineCopyFilePath = `${wineFilePath}-DXMT`
    try {
      cpSync(wineFilePath, wineCopyFilePath, { recursive: true })

      DXMT.copyLatestDXMTFiles(wineCopyFilePath)

      DXMT.addDXMTSuffixInPlist(wineCopyFilePath)
    } catch (error) {
      logError(
        `Error copying wine staging for DXMT version ${error}`,
        LogPrefix.ToolInstaller
      )
      if (existsSync(wineCopyFilePath)) {
        rmSync(wineCopyFilePath, { recursive: true })
      }
    }
  },
  getCurrentDXMTVersion: () => {
    const versionFilePath = join(toolsPath, 'dxmt', 'latest_dxmt')
    if (existsSync(versionFilePath)) {
      // split() always yields at least one element
      return readFileSync(versionFilePath).toString().split('\n')[0] ?? ''
    } else {
      return ''
    }
  },
  deleteWineCopy: async (versionInfo: WineVersionInfo) => {
    const dxmtVersionPath = `${versionInfo.installDir}-DXMT`
    if (versionInfo.installDir !== undefined && existsSync(dxmtVersionPath)) {
      try {
        rmSync(dxmtVersionPath, { recursive: true })
      } catch (error) {
        logError(error, LogPrefix.ToolInstaller)
        logWarning(
          `Couldn't remove DXMT copy of ${versionInfo.version}!`,
          LogPrefix.ToolInstaller
        )
      }
    }
  },

  copyLatestDXMTFiles: (pathToWine: string) => {
    const dxmtVersion = DXMT.getCurrentDXMTVersion()

    const pathToDXMT = join(toolsPath, 'dxmt', dxmtVersion)

    const wineInternalPath = join(
      pathToWine,
      'Contents',
      'Resources',
      'wine',
      'lib',
      'wine'
    )

    const filesToCopy = [
      'x86_64-windows/d3d10core.dll',
      'x86_64-windows/d3d11.dll',
      'x86_64-windows/dxgi.dll',
      'x86_64-windows/nvapi64.dll',
      'x86_64-windows/nvngx.dll',
      'x86_64-windows/winemetal.dll',
      'x86_64-unix/winemetal.so',
      'i386-windows/d3d10core.dll',
      'i386-windows/d3d11.dll',
      'i386-windows/dxgi.dll',
      'i386-windows/winemetal.dll'
    ]

    filesToCopy.forEach((file) => {
      logDebug(
        `Copying ${join(pathToDXMT, file)} in ${join(wineInternalPath, file)}`,
        LogPrefix.ToolInstaller
      )
      copyFileSync(join(pathToDXMT, file), join(wineInternalPath, file))
    })
  },
  addDXMTSuffixInPlist: (pathToWine: string) => {
    const infoFilePath = join(pathToWine, 'Contents', 'Info.plist')
    let content = readFileSync(infoFilePath, 'utf8')
    content = content.replace(
      /(<key>CFBundleShortVersionString<\/key>\n.*<string>)(.*)(<\/string>)/m,
      '$1$2-DXMT$3'
    )
    content = content.replace(
      /(<key>CFBundleVersion<\/key>\n.*<string>)(.*)(<\/string>)/m,
      '$1$2-DXMT$3'
    )

    writeFileSync(infoFilePath, content)
  }
}

const onWineVersionInstalled = async (
  deps: DxmtStoresDeps,
  versionInfo: WineVersionInfo,
  installDir: string
) => {
  if (isMac && versionInfo.type === 'Wine-Staging-macOS') {
    const check = await checkWinemacMetalViewExports(
      join(installDir, versionInfo.version),
      'wineVersionInstalled'
    )
    if (!check.ok) {
      logDXMTSkip('creating', versionInfo.version, check)
      return
    }
    await DXMT.getLatest(deps)
    await DXMT.copyWineAndConfigure(versionInfo, installDir)
  }
}

const onWineVersionUninstalled = async (versionInfo: WineVersionInfo) => {
  if (isMac && versionInfo.type === 'Wine-Staging-macOS') {
    await DXMT.deleteWineCopy(versionInfo)
  }
}

// Update DXMT version in `*-DXMT` wines if new version available
const onReleasesInfoReady = async (
  deps: DxmtStoresDeps,
  releasesInfo: ReleasesInfo
) => {
  if (!isMac) return

  // TODO: should we store just the version instead of the file name?
  const currentDXMTVersion = DXMT.getCurrentDXMTVersion()
    .replace(/.*dxmt-/, '')
    .replace(/-builtin.*/, '')

  if (releasesInfo['dxmt'].tag === currentDXMTVersion) return

  // Quick 260916-9vh: the installed-wine census runs BEFORE the download, and returns
  // early when there is nothing to update. It used to run after, which meant a cold
  // profile fetched the DXMT tarball and then copied it into ZERO wine installs.
  //
  // MEASURED (meta/coldBootTiming.ts with an https.request probe, 2 cold
  // createFakeHomeProfile() runs, macOS): that fetch is the ENTIRE cold-boot cost.
  // `installOrUpdateTool` -> `downloadFile` (backend/utils.ts) -> EasyDl with
  // `connections: 5` issues five parallel 206-range requests on `https.globalAgent`;
  // the last chunk ended at 27.10s and the process exited at 27.26s. Exit tracks the
  // download drain, so an unbounded fetch nobody needs delays sidecar exit by ~27s.
  //
  // This implements CLAUDE.md's "not issued at boot" remedy for the in-flight class.
  // The alternative -- an 'end'/'close' handler on startRpcServer() that aborts in
  // flight -- is explicitly FENCED by the completed exit-contract todo and CLAUDE.md
  // ("adding one misunderstands the mechanism rather than hardening it"). Do not
  // reintroduce it here.
  //
  // This CANNOT starve a new wine install: the `wineVersionInstalled` listener above
  // calls `DXMT.getLatest()` itself before `copyWineAndConfigure`, so a freshly
  // installed Wine-Staging-macOS still provisions DXMT on demand. This listener only
  // ever UPDATES DXMT inside `-DXMT` wines that already exist, which is exactly what
  // its own header comment says it is for.
  //
  // Quick 261031-rjv: the census now also requires an existing `-DXMT` copy whose own
  // winemac.so passes the export check, so a Wine with no usable `-DXMT` copy never
  // triggers the boot fetch. Failing copies are deliberately left on disk (operator
  // decision: games pinned to them must keep launching).
  //
  // Phase 63: the export check is now an async rustInvoke whose 60 s timer is unref()'d and
  // which holds no referenced handle, so it adds no unbounded in-flight boot work (exit
  // contract half 2). It runs only for existing `-DXMT` copies, sequentially; do not move it
  // earlier in boot.
  // The listener is registered by registerDxmtListeners with its deps in hand (66.3-15), so it
  // reads the wine-manager store slice it was constructed with; there is no unbound state.
  const availableWines = deps.stores.wineManager.wineDownloaderInfoStore.get(
    'wine-releases',
    []
  )
  const installedWineStagingVersions = availableWines.filter(
    (wine) => wine.type === 'Wine-Staging-macOS' && wine.isInstalled
  )

  const copiesToUpdate: string[] = []
  for (const wine of installedWineStagingVersions) {
    const wineWithDXMTFilePath = `${wine.installDir}-DXMT`
    if (!existsSync(wineWithDXMTFilePath)) continue
    const check = await checkWinemacMetalViewExports(
      wineWithDXMTFilePath,
      'dxmtBootUpdate'
    )
    if (check.ok) {
      copiesToUpdate.push(wineWithDXMTFilePath)
    } else {
      logDXMTSkip('updating', wine.version, check)
    }
  }

  if (copiesToUpdate.length === 0) return

  await DXMT.getLatest(deps)

  copiesToUpdate.forEach((path) => DXMT.copyLatestDXMTFiles(path))
}

/**
 * Attaches the three DXMT listeners (`wineVersionInstalled`, `wineVersionUninstalled`,
 * `releasesInfoReady`) to `deps.events` and returns the function that detaches them. Called by
 * the 'secret-stores' boot step; importing this module registers nothing (66.3-15, C-WR-2).
 */
export function registerDxmtListeners(deps: DxmtListenerDeps): () => void {
  const installed = (versionInfo: WineVersionInfo, installDir: string) =>
    onWineVersionInstalled(deps, versionInfo, installDir)
  const releases = (releasesInfo: ReleasesInfo) =>
    onReleasesInfoReady(deps, releasesInfo)
  deps.events.on('wineVersionInstalled', installed)
  deps.events.on('wineVersionUninstalled', onWineVersionUninstalled)
  deps.events.on('releasesInfoReady', releases)
  return () => {
    deps.events.off('wineVersionInstalled', installed)
    deps.events.off('wineVersionUninstalled', onWineVersionUninstalled)
    deps.events.off('releasesInfoReady', releases)
  }
}
