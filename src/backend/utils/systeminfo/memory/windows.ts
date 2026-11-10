import { freemem, totalmem } from 'os'

import type { PartialMemoryInfo } from './index'

// Node's os module, not Electron's process.getSystemMemoryInfo(): the sidecar
// is plain Node, where that Electron-only method does not exist and threw on
// every Windows launch. os.totalmem()/os.freemem() already return bytes.
function getMemoryInfo_windows(): PartialMemoryInfo {
  const total = totalmem()
  return {
    total,
    used: total - freemem()
  }
}

export { getMemoryInfo_windows }
