import type { SystemInformation } from '../index'
import type { ProbeDeps } from '../../os/processes'

type PartialMemoryInfo = Omit<
  SystemInformation['memory'],
  'totalFormatted' | 'usedFormatted'
>

async function getMemoryInfo(deps: ProbeDeps): Promise<PartialMemoryInfo> {
  switch (process.platform) {
    case 'linux': {
      const { getMemoryInfo_linux } = await import('./linux')
      return getMemoryInfo_linux(deps)
    }
    case 'win32': {
      const { getMemoryInfo_windows } = await import('./windows')
      return getMemoryInfo_windows()
    }
    case 'darwin': {
      const { getMemoryInfo_macos } = await import('./macos')
      return getMemoryInfo_macos(deps)
    }
    default:
      return { total: 0, used: 0 }
  }
}

export { getMemoryInfo }
export type { PartialMemoryInfo }
