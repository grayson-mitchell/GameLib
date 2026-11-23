/**
 * quick 261117-p38: the real probes behind the "Launch without Steam" verdict.
 *
 * Everything here only READS: the bridge's PE import scan and SteamStub / CEG
 * detection, the curated known-fix list, the Mach-O load-command reader, a
 * bounded install-tree walk, and one anonymous PICS read for the launch
 * arguments. Nothing writes, copies, replaces or emulates a steam_api file
 * (DRM boundary).
 */
import { dirname, join } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import { getBottleDir } from 'backend/enginewine/twin'
import { locateMachOBinary } from 'backend/utils/macArch'
import type SteamGame from '../games'
import { isBottleEligible } from '../gameEligibility'
import { isPublicOnlyEntry } from '../anonymousClient'
import {
  findBridgeInstallBottle,
  getBridgeBottleSettings
} from '../bridgeBottle'
import { getBottleSteamappsDir } from '../bottle'
import { resolveBridgeGameInstallRoot } from '../bridgeInstallState'
import { knownFixSaysCeg } from '../drmKnownFix'
import { readAcfUpdateState } from '../library/acfUpdateState'
import { resolveBridgeLaunchExe } from '../bridge/launchTarget'
import { scanSteamApiImports } from '../bridge/importScan'
import { detectLaunchDrmWrapper } from '../bridge/drm/drmScanExe'
import { detectExeSteamDrm } from '../bridge/shimDrmWrapper'
import {
  findRuntimeLoadedSteamApiDlls,
  findUnrealLayout,
  resolveWalkRoot
} from '../bridge/bridgeScan'
import { isGameLibShimBytes } from '../bridge/shimOriginals'
import {
  STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS,
  STEAM_PICS_TIMEOUT_MS,
  withTimeout
} from '../withTimeout'
import {
  findMacSteamApiFiles,
  machOLinksSteamApi,
  machORunnableHere
} from './machoSteamApi'
import {
  getDirectLaunchVerdict,
  type DirectLaunchInput,
  type DirectLaunchKind,
  type DirectLaunchProbes,
  type DirectLaunchVerdict,
  type LaunchEntry
} from './directLaunchVerdict'

interface PicsLaunchEntry {
  executable?: unknown
  arguments?: unknown
  workingdir?: unknown
  config?: { oslist?: unknown }
}

function pickLaunchEntry(
  appinfo: unknown,
  os: 'macos' | 'windows'
): LaunchEntry | undefined {
  const launch = (
    appinfo as { config?: { launch?: Record<string, PicsLaunchEntry> } }
  )?.config?.launch
  const entries = Object.values(launch ?? {}).filter(
    (e): e is PicsLaunchEntry & { executable: string } =>
      typeof e?.executable === 'string' && e.executable.length > 0
  )
  const tags = (e: PicsLaunchEntry): string[] =>
    typeof e.config?.oslist === 'string' && e.config.oslist.length > 0
      ? e.config.oslist.split(',').map((t) => t.trim())
      : []
  const picked =
    entries.find((e) => tags(e).includes(os)) ??
    entries.find(
      (e) =>
        tags(e).length === 0 &&
        (os === 'windows' || e.executable.endsWith('.app'))
    )
  if (!picked) return undefined
  return {
    executable: picked.executable,
    arguments: typeof picked.arguments === 'string' ? picked.arguments : '',
    ...(typeof picked.workingdir === 'string' && picked.workingdir.length > 0
      ? { workingdir: picked.workingdir }
      : {})
  }
}

function isOffline(steamGame: SteamGame): boolean {
  try {
    return steamGame.deps.onlineMonitor.getConnectivityStatus() === 'offline'
  } catch {
    return false
  }
}

async function readPicsLaunchEntry(
  steamGame: SteamGame,
  os: 'macos' | 'windows'
): Promise<LaunchEntry | undefined> {
  if (isOffline(steamGame)) return undefined
  try {
    const client = await withTimeout(
      steamGame.deps.anonymousClient.get('launch-target'),
      STEAM_INSTALLDIR_CONNECT_TIMEOUT_MS,
      'directLaunch anonymous connect'
    )
    if (!client) return undefined
    const n = Number(steamGame.appId)
    const { apps } = await withTimeout(
      client.getProductInfo([n], [], true),
      STEAM_PICS_TIMEOUT_MS,
      'directLaunch getProductInfo'
    )
    const entry = apps?.[n] as { appinfo?: unknown } | undefined
    if (!entry || isPublicOnlyEntry(entry)) return undefined
    return pickLaunchEntry(entry.appinfo, os)
  } catch (err) {
    logWarning(
      `direct-launch: PICS launch read failed for appId ${steamGame.appId}: ${String(err)}`,
      LogPrefix.Steam
    )
    return undefined
  }
}

/** Where this install lives, mirroring launch()'s LOCATION order. */
async function resolveInput(steamGame: SteamGame): Promise<DirectLaunchInput> {
  const { appId, deps } = steamGame
  const host: NodeJS.Platform = isMac ? 'darwin' : process.platform
  let kind: DirectLaunchKind | null = null
  let installPath: string | undefined
  const bottle = findBridgeInstallBottle(deps.paths, appId)
  if (bottle !== null) {
    kind = 'bridge'
    installPath = join(getBottleSteamappsDir(deps.paths, bottle), 'common')
  } else if (!isBottleEligible(steamGame)) {
    const info = steamGame.getGameInfo()
    const path = info.install?.install_path
    if (info.is_installed && typeof path === 'string' && path.length > 0) {
      kind = 'mac-native'
      installPath = path
    }
  }
  const acf = kind
    ? await readAcfUpdateState(
        deps,
        appId,
        kind === 'bridge' ? 'bridge' : 'native'
      )
    : null
  return {
    appId,
    host,
    kind,
    ...(installPath ? { installPath } : {}),
    buildid: acf?.buildid ?? ''
  }
}

function buildDirectLaunchProbes(steamGame: SteamGame): DirectLaunchProbes {
  const { appId, deps } = steamGame
  const bottleName = () =>
    getBridgeBottleSettings(deps, appId).wineCrossoverBottle
  let bridgeExe: Promise<string | undefined> | undefined
  const resolveExe = () =>
    (bridgeExe ??= resolveBridgeLaunchExe(deps, appId, {
      offline: isOffline(steamGame)
    }))
  return {
    knownFixCeg: () => knownFixSaysCeg(deps, appId),
    readLaunchEntry: (os) => readPicsLaunchEntry(steamGame, os),
    locateMacBinary: (installPath, executable) =>
      locateMachOBinary(installPath, executable, LogPrefix.Steam),
    macSteamApiFiles: (installPath) => findMacSteamApiFiles(installPath),
    macLinks: (binaryPath) => machOLinksSteamApi(binaryPath),
    macRunnable: (binaryPath) => machORunnableHere(binaryPath),
    resolveBridgeExe: resolveExe,
    peDrm: async (exePath) => {
      const { drmWrapper, drmExe } = await detectLaunchDrmWrapper(
        deps,
        getBottleDir(deps.paths, bottleName()),
        exePath
      )
      if (drmWrapper === undefined) return undefined
      const markers = await detectExeSteamDrm(deps, appId, drmExe)
      if (markers === undefined) return undefined
      if (markers?.kind === 'ceg') return 'ceg'
      return drmWrapper === 'steamstub' ? 'steamstub' : 'none'
    },
    peImports: async (exePath) => {
      const result = await scanSteamApiImports(
        deps,
        appId,
        exePath,
        'directLaunchVerdict'
      )
      if ('status' in result && result.status === 'error') return 'error'
      return 'arch' in result && result.arch !== 'none' ? 'steam-api' : 'none'
    },
    peSteamApiDlls: async (exePath) => {
      const name = bottleName()
      const bottleDir = getBottleDir(deps.paths, name)
      const root = resolveWalkRoot(
        bottleDir,
        exePath,
        resolveBridgeGameInstallRoot(steamGame, exePath, name)
      )
      const unreal = await findUnrealLayout(bottleDir, dirname(exePath))
      const dlls = await findRuntimeLoadedSteamApiDlls(
        root,
        unreal?.steamworksDir ? [unreal.steamworksDir] : [],
        { isShimBytes: isGameLibShimBytes }
      )
      return dlls.length
    }
  }
}

/** The verdict for this game; the sidecar calls this at both query and launch. */
export async function getSteamDirectLaunchVerdict(
  steamGame: SteamGame
): Promise<DirectLaunchVerdict> {
  const input = await resolveInput(steamGame)
  return getDirectLaunchVerdict(
    {
      store: steamGame.deps.stores.steam
        .steamDirectLaunchVerdictStore as unknown as {
        get(k: string): unknown
        set(k: string, v: unknown): void
      },
      probes: buildDirectLaunchProbes(steamGame),
      now: () => Date.now(),
      warn: (m) => logWarning(m, LogPrefix.Steam),
      info: (m) => logInfo(m, LogPrefix.Steam)
    },
    input
  )
}
