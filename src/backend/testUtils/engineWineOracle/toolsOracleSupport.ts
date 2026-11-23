/**
 * Helpers the tools oracles share (87-09, D-08): the DXVK family and DXMT both run the real tools
 * against a fake HOME, serve a synthetic release archive, pin the platform the tools compare
 * against, and record the log lines (the evidence lines the live gates cite).
 */
import { gzipSync } from 'zlib'
import { snapshotTree } from './treeSnapshot'

/** One ustar entry: mode 0644, uid/gid 0, mtime 0, so the bytes are reproducible. */
function tarEntry(name: string, body: Buffer): Buffer {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100)
  header.write('0000000\0', 108)
  header.write('0000000\0', 116)
  header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124)
  header.write('00000000000\0', 136)
  header.write('        ', 148)
  header.write('0', 156)
  header.write('ustar\0', 257)
  header.write('00', 263)
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  const pad = Buffer.alloc((512 - (body.length % 512)) % 512)
  return Buffer.concat([header, body, pad])
}

/**
 * A synthetic `.tar.gz` of text files, built here so no real DXVK, vkd3d, DXMT or winetricks
 * binary is ever a fixture body (T-87-13). `tar` autodetects the compression on read, so the
 * bytes extract whatever extension the release feed gave the asset.
 */
export function buildTarGz(entries: { name: string; text: string }[]): Buffer {
  const tar = Buffer.concat([
    ...entries.map((e) => tarEntry(e.name, Buffer.from(e.text, 'utf8'))),
    Buffer.alloc(1024)
  ])
  return gzipSync(tar, { level: 9 })
}

/** `process.platform` and `process.arch` are read-only: redefine them and return the restore. */
export function pinProcess(values: {
  platform: string
  arch: string
}): () => void {
  const originals = (['platform', 'arch'] as const).map((key) => ({
    key,
    descriptor: Object.getOwnPropertyDescriptor(process, key)
  }))
  for (const key of ['platform', 'arch'] as const) {
    Object.defineProperty(process, key, {
      value: values[key],
      configurable: true
    })
  }
  return () => {
    for (const { key, descriptor } of originals) {
      if (descriptor) Object.defineProperty(process, key, descriptor)
    }
  }
}

// `instanceof Error` is false for an error graceful-fs made in another jest realm, so the check is
// by tag.
const isError = (item: unknown): item is Error =>
  Object.prototype.toString.call(item) === '[object Error]'

const renderItem = (item: unknown): string =>
  typeof item === 'string'
    ? item
    : isError(item)
      ? `${item.name}: ${item.message}`
      : JSON.stringify(item)

/** A log message (a string, or the array form with errors in it) as one line. */
const renderLogMessage = (message: unknown): string =>
  Array.isArray(message)
    ? message.map(renderItem).join(' ')
    : renderItem(message)

export interface LogLine {
  level: string
  prefix: string
  message: string
}

/** Fills `into` from one logger call: the level, the prefix and the rendered message. */
export function captureLog(
  into: LogLine[],
  level: string,
  message: unknown,
  options: unknown
): void {
  const prefix =
    typeof options === 'string'
      ? options
      : ((options as { prefix?: string } | undefined)?.prefix ?? '')
  into.push({ level, prefix, message: renderLogMessage(message) })
}

/** The copies an install starts without awaiting: wait until the tree stops changing. */
export async function waitForTreeToSettle(root: string): Promise<void> {
  let last = ''
  let stable = 0
  for (let i = 0; i < 200 && stable < 3; i++) {
    const now = JSON.stringify(snapshotTree(root))
    stable = now === last ? stable + 1 : 0
    last = now
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
}
