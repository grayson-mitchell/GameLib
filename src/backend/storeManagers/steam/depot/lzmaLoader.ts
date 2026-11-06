// Main-thread entry for the LZMA loader: wires lzmaLoaderCore's log sink to
// backend/logger and re-exports its public API. Main-thread code imports THIS
// file; only the decode worker imports lzmaLoaderCore directly (it must stay
// free of backend/logger -- see the note at the top of lzmaLoaderCore.ts).

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { setLzmaLoaderLogSink } from './lzmaLoaderCore'

setLzmaLoaderLogSink(({ level, lines }) => {
  if (level === 'warning') logWarning(lines, LogPrefix.Steam)
  else logInfo(lines, LogPrefix.Steam)
})

export {
  loadLzmaModule,
  lzmaDecoderKind,
  resetLzmaLoaderForTests,
  setNativeLzmaDecodeEnabledForTests
} from './lzmaLoaderCore'
export type { LzmaDecoderKind } from './lzmaLoaderCore'
