import { freemem, totalmem } from 'os'

import type { PartialMemoryInfo } from './index'

// Plain Node has no `process.getSystemMemoryInfo()` (an Electron main-process extra the sidecar
// never had), so the figures come from `os`, which already reports bytes.
function getMemoryInfo_windows(): PartialMemoryInfo {
  const total = totalmem()
  return {
    total,
    used: total - freemem()
  }
}

export { getMemoryInfo_windows }
