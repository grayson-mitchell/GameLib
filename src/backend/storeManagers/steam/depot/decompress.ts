// Phase 21 (21-01): Steam depot decompress + verified-fetch primitives.
// STUB — RED phase. Implementation lands in the GREEN commit.

export interface LzmaModule {
  decompress(
    input: Buffer,
    callback: (result: number[] | Buffer | string, error?: Error) => void
  ): void
}

export interface DepotChunk {
  sha: string | Buffer
  cb_original: number | string
  attemptSeed?: number
}

export async function decompressChunk(
  _buf: Buffer,
  _lzma: LzmaModule
): Promise<Buffer> {
  throw new Error('not implemented')
}

export const sha1 = (_buf: Buffer): string => {
  throw new Error('not implemented')
}

export async function fetchChunk(
  _hosts: string[],
  _depotId: string,
  _chunk: DepotChunk,
  _key: Buffer,
  _lzma: LzmaModule,
  _attempts = 4
): Promise<Buffer> {
  throw new Error('not implemented')
}
