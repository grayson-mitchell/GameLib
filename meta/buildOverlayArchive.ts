/**
 * Deterministic build of a known-fix overlay archive from an installed payload
 * dir (quick 261027-n77).
 *
 *   pnpm build:overlay-archive --source <dir> --out <file> [--id <overlay id>]
 *
 * Reads ONLY the catalogue's paths from --source, refuses anything that is not
 * a regular file or whose sha256/size differs from the pin, writes the
 * archive, re-reads it with the strict reader as a self-check, and prints
 * `sha256=<hex> size=<n>` plus `pinned: match` or `pinned: MISMATCH`. Exit 0 on
 * match, 3 on mismatch (the output is still written, which is how the first pin
 * is taken).
 *
 * Reproducibility contract: the same Node zlib gives identical bytes; a
 * different zlib build may not. The per-file sums are the content truth. The
 * operator rebuilds and must see `pinned: match` before uploading the asset.
 * No child processes.
 */

import { createHash } from 'crypto'
import { lstatSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { lookupKnownFixOverlay } from '../src/common/knownFixOverlayCatalogue'
import {
  buildOverlayTarGz,
  readOverlayTarGz
} from '../src/backend/knownFixOverlayArchive'

const USAGE =
  'usage: pnpm build:overlay-archive --source <dir> --out <file> [--id <overlay id>]'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

async function main(): Promise<number> {
  const source = arg('source')
  const out = arg('out')
  const id = arg('id') ?? 'gst-libav-1.24.13'
  if (!source || !out) {
    console.error(USAGE)
    return 2
  }
  const entry = lookupKnownFixOverlay(id)
  if (!entry) {
    console.error(`unknown overlay id '${id}'\n${USAGE}`)
    return 2
  }

  const files = entry.files.map((f) => {
    const full = join(source, f.path)
    const st = lstatSync(full)
    if (!st.isFile() || st.isSymbolicLink()) {
      throw new Error(`${f.path} is not a regular file`)
    }
    const data = readFileSync(full)
    if (data.length !== f.size || sha256(data) !== f.sha256) {
      throw new Error(`${f.path} does not match the catalogue pin`)
    }
    return { path: f.path, data }
  })

  const archive = buildOverlayTarGz(files)
  writeFileSync(out, archive)

  const total = entry.files.reduce((n, f) => n + f.size, 0)
  await readOverlayTarGz(
    archive,
    new Map(entry.files.map((f) => [f.path, f.size])),
    total + 1024 * 1024
  )

  const sum = sha256(archive)
  console.log(`sha256=${sum} size=${archive.length}`)
  if (sum === entry.archiveSha256 && archive.length === entry.archiveSize) {
    console.log('pinned: match')
    return 0
  }
  console.log(`pinned: MISMATCH (catalogue ${entry.archiveSha256})`)
  return 3
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
)
