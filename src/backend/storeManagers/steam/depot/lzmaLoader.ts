// Phase 23.1 plan 04: TDD RED stub — replaced with the real native-first
// loader implementation in the immediately-following GREEN commit. Exists
// only so `decompressPool.test.ts -t "lzmaLoader"` can be run against this
// commit and observed to FAIL for the right reason (not a module-not-found
// error) before the real implementation lands.

import type { LzmaModule } from './decompress'

export type LzmaDecoderKind = 'native' | 'pure-js' | 'unresolved'

export function lzmaDecoderKind(): LzmaDecoderKind {
  return 'unresolved'
}

export function resetLzmaLoaderForTests(): void {
  // no-op stub
}

export function loadLzmaModule(): Promise<LzmaModule> {
  return Promise.reject(new Error('TDD RED stub: lzmaLoader not implemented yet'))
}
