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

let cachedSystemInfo: SystemInformation | null = null
// In-flight-promise memoization -- debug/gog-spawn-reduction.md fix 3. The value-cache
// above only helps SEQUENTIAL calls; concurrent callers at boot (backend boot log,
// frontend boot IPC call, isMacSonomaOrHigher, etc.) each raced past it before the first
// resolved, live-log-confirmed as 9 `--version` spawns in a 4s boot window instead of the
// expected 3 (one per runner). Sharing the in-flight promise across concurrent cache=true
// callers collapses those races back down to a single set of spawns.
let inFlightSystemInfoFetch: Promise<SystemInformation> | null = null

/**
 * Gathers information about various system components
 * @param cache Whether cached information should be returned if possible
 */
async function getSystemInfo(cache = true): Promise<SystemInformation> {
  if (cache && cachedSystemInfo) return cachedSystemInfo
  if (cache && inFlightSystemInfoFetch) return inFlightSystemInfoFetch

  const fetchPromise = fetchSystemInfo()
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

async function fetchSystemInfo(): Promise<SystemInformation> {
  const cpus = os.cpus()
  const memory = await getMemoryInfo()
  const gpus = await getGpuInfo()
  const detailedOsInfo = await getOsInfo()
  const deckInfo = getSteamDeckInfo(cpus, gpus)
  const [legendaryVersion, gogdlVersion, cometVersion, nileVersion] =
    await Promise.all([
      getLegendaryVersion(),
      getGogdlVersion(),
      getCometVersion(),
      getNileVersion()
    ])

  const sysinfo: SystemInformation = {
    CPU: {
      model: cpus[0].model,
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
      version: process.getSystemVersion(),
      ...detailedOsInfo
    },
    steamDeckInfo: deckInfo,
    isFlatpak: !!process.env.FLATPAK_ID,
    isAppImage: !!process.env.APPIMAGE,
    softwareInUse: {
      heroicVersion: getHeroicVersion(),
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

/**
 * Test-only reset hook (debug/gog-spawn-reduction.md fix 3). `cachedSystemInfo` and
 * `inFlightSystemInfoFetch` are module-level singletons that outlive any individual test
 * (this project's Jest config has no `resetModules`), so a value cached or an in-flight
 * promise started by one test would silently be reused by the next. Called from this
 * module's own test file's `beforeEach`. Never called from production code.
 */
function __resetSystemInfoCacheForTests(): void {
  cachedSystemInfo = null
  inFlightSystemInfoFetch = null
}

export { getSystemInfo, formatSystemInfo, __resetSystemInfoCacheForTests }
export type { SystemInformation, GPUInfo }
