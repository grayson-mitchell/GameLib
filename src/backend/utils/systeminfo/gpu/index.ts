import { logWarning, LogPrefix } from 'backend/logger'
import type { GPUInfo } from '../index'
import { populateDeviceAndVendorName } from './pci_ids'
import type { ProbeDeps } from '../../os/processes'

type PartialGpuInfo = Omit<GPUInfo, 'deviceString' | 'vendorString'>

/**
 * Gathers information about the GPUs in the system. See {@link GPUInfo}
 */
async function getGpuInfo(deps: ProbeDeps): Promise<GPUInfo[]> {
  try {
    let partialGpus: PartialGpuInfo[]
    switch (process.platform) {
      case 'win32': {
        const { getGpuInfo_windows } = await import('./windows')
        partialGpus = await getGpuInfo_windows(deps)
        break
      }
      case 'linux': {
        const { getGpuInfo_linux } = await import('./linux')
        partialGpus = await getGpuInfo_linux(deps)
        break
      }
      case 'darwin':
        // macOS GPU probing is not implemented
        partialGpus = []
        break
      default:
        return []
    }

    return await populateDeviceAndVendorName(partialGpus)
  } catch (error) {
    logWarning(['Could not gather GPU info:', error], LogPrefix.Backend)
    return []
  }
}

export { getGpuInfo }
export type { PartialGpuInfo }
