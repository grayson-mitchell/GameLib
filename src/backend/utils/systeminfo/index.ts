/**
 * @file Figures out system information (CPU, GPU, memory) and software versions (Heroic, Legendary, gogdl, etc.)
 */

import os from 'os'
import process from 'process'
import { filesize } from 'filesize'

import { getGpuInfo } from './gpu'
import { getMemoryInfo } from './memory'
import { getOsInfo } from './osInfo'
import { getSteamDeckInfo, type SteamDeckInfo } from './steamDeck'
import { getHeroicVersion } from './heroicVersion'
import {
  getCometVersion,
  getGogdlVersion,
  getLegendaryVersion,
  getNileVersion
} from '../helperBinaries'
import type { VersionProbeDeps } from '../helperBinaries'
import type { ProbeDeps } from '../os/processes'
import type { AppInfo, AppPaths } from 'backend/process/context'
import type { Stores } from 'backend/services/types'
import type { GlobalConfigSlice } from 'backend/config'
import { APP_DISPLAY_NAME } from 'backend/constants/others'

type GPUInfo = {
  // The PCI device ID of the graphics card (hexadecimal)
  deviceId: string
  // The PCI vendor ID of the graphics card (hexadecimal)
  vendorId: string
  // The PCI sub-device ID of the graphics card (hexadecimal)
  subdeviceId?: string
  // The PCI sub-vendor ID of the graphics card (hexadecimal)
  subvendorId?: string
  // If the device has an entry in `pci.ids`, this is its name
  deviceString?: string
  // If the vendor has an entry in `pci.ids`, this is their name
  vendorString?: string
  // On Windows: The version of the GPU driver (formatted as nicely as possible)
  // On Linux:   The driver in use (nvidia/nouveau; amdgpu/radeon/etc.)
  driverVersion?: string
}

interface SystemInformation {
  CPU: {
    model: string
    cores: number
  }
  memory: {
    used: number
    total: number
    usedFormatted: string
    totalFormatted: string
  }
  GPUs: GPUInfo[]
  OS: {
    platform: string
    name: string
    version: string
  }
  steamDeckInfo: SteamDeckInfo
  isFlatpak: boolean
  isAppImage: boolean
  softwareInUse: {
    heroicVersion: string
    legendaryVersion: string
    gogdlVersion: string
    cometVersion: string
    nileVersion: string
  }
}

/** R1 slice: the runner managers the version probes ask. */
export type SystemInfoDeps = VersionProbeDeps &
  ProbeDeps & { stores: Pick<Stores, 'systemInfo'> } & {
    config: Pick<GlobalConfigSlice, 'getSettings'>
  } & {
    appInfo: Pick<AppInfo, 'version'>
  } & {
    paths: Pick<AppPaths, 'publicDir'>
  }

/**
 * The system-information cache of one boot (D-05, 66.4-12): the value cache and the in-flight
 * promise are closure fields. Concurrent callers share one fetch -- debug/gog-spawn-reduction.md
 * fix 3: concurrent callers at boot (backend boot log, frontend boot IPC call,
 * isMacSonomaOrHigher, etc.) each raced past a value-only cache before the first resolved,
 * 9 `--version` spawns in a 4s boot window instead of the expected 3 (one per runner).
 * There is no TTL.
 */
export function createSystemInfoCache() {
  let cachedSystemInfo: SystemInformation | null = null
  let inFlightSystemInfoFetch: Promise<SystemInformation> | null = null

  /**
   * Gathers information about various system components
   * @param cache Whether cached information should be returned if possible
   */
  async function getSystemInfo(
    deps: SystemInfoDeps,
    cache = true
  ): Promise<SystemInformation> {
    if (cache && cachedSystemInfo) return cachedSystemInfo
    if (cache && inFlightSystemInfoFetch) return inFlightSystemInfoFetch

    const fetchPromise = fetchSystemInfo(deps)
    if (cache) {
      inFlightSystemInfoFetch = fetchPromise
    }
    try {
      const sysinfo = await fetchPromise
      cachedSystemInfo = sysinfo
      return sysinfo
    } finally {
      if (inFlightSystemInfoFetch === fetchPromise) {
        inFlightSystemInfoFetch = null
      }
    }
  }

  return { getSystemInfo }
}

export type SystemInfoCache = ReturnType<typeof createSystemInfoCache>

async function fetchSystemInfo(
  deps: SystemInfoDeps
): Promise<SystemInformation> {
  const cpus = os.cpus()
  const memory = await getMemoryInfo(deps)
  const gpus = await getGpuInfo(deps, deps.stores.systemInfo)
  const detailedOsInfo = await getOsInfo(deps)
  const deckInfo = getSteamDeckInfo(cpus, gpus)
  const versionDeps = deps
  const [legendaryVersion, gogdlVersion, cometVersion, nileVersion] =
    await Promise.all([
      getLegendaryVersion(versionDeps),
      getGogdlVersion(versionDeps),
      getCometVersion(versionDeps),
      getNileVersion(versionDeps)
    ])

  const firstCpu = cpus[0]
  if (firstCpu === undefined) {
    throw new Error('os.cpus() returned no CPUs')
  }

  const sysinfo: SystemInformation = {
    CPU: {
      model: firstCpu.model,
      // FIXME: Technically the user could be on a server with more than one
      //        physical CPU installed, but I'd say that's rather unlikely
      cores: cpus.length
    },
    memory: {
      total: memory.total,
      used: memory.used,
      totalFormatted: filesize(memory.total, { base: 2 }),
      usedFormatted: filesize(memory.used, { base: 2 })
    },
    GPUs: gpus,
    OS: {
      platform: process.platform,
      version: os.release(),
      ...detailedOsInfo
    },
    steamDeckInfo: deckInfo,
    isFlatpak: !!process.env.FLATPAK_ID,
    isAppImage: !!process.env.APPIMAGE,
    softwareInUse: {
      heroicVersion: getHeroicVersion(deps),
      legendaryVersion: legendaryVersion,
      gogdlVersion: gogdlVersion,
      cometVersion: cometVersion,
      nileVersion: nileVersion
    }
  }
  return sysinfo
}

async function formatSystemInfo(info: SystemInformation): Promise<string> {
  const isLinux: boolean = process.platform === 'linux'
  return `CPU: ${info.CPU.cores}x ${info.CPU.model}
Memory: ${filesize(info.memory.total)} (used: ${filesize(info.memory.used)})
GPUs:
${info.GPUs.map(
  (gpu, index) => `  GPU ${index}:
    Name: ${gpu.vendorString} ${gpu.deviceString}
    IDs: D=${gpu.deviceId} V=${gpu.vendorId} SD=${gpu.subdeviceId} SV=${gpu.subvendorId}
    Driver: ${gpu.driverVersion}`
).join('\n')}
OS: ${info.OS.name} ${info.OS.version} (${info.OS.platform})

The current system is${info.steamDeckInfo.isDeck ? '' : ' not'} a Steam Deck${
    info.steamDeckInfo.isDeck
      ? ` (model: ${info.steamDeckInfo.model}) in ${info.steamDeckInfo.mode} mode`
      : ''
  }
${
  isLinux
    ? `We are${info.isFlatpak ? '' : ' not'} running inside a Flatpak container
We are${info.isAppImage ? '' : ' not'} running from an AppImage
`
    : ''
}
Software Versions:
  ${APP_DISPLAY_NAME}: ${info.softwareInUse.heroicVersion}
  Legendary: ${info.softwareInUse.legendaryVersion}
  gogdl: ${info.softwareInUse.gogdlVersion}
  comet: ${info.softwareInUse.cometVersion}
  Nile: ${info.softwareInUse.nileVersion}`
}

export { formatSystemInfo }
export type { SystemInformation, GPUInfo }
