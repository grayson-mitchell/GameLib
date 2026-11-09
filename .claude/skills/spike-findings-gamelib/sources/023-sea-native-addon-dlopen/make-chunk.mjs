#!/usr/bin/env node
// Spike 023, task 2(d): produce fixtures/real-vz-chunk.bin -- a Steam VZ-container
// chunk built from REAL game bytes (a slice of an actual installed Steam title's
// binary), compressed with this repo's own pinned `lzma@2.3.2` package to an
// `lzma_alone` stream, then wrapped in the exact Steam VZ container layout
// documented in 23.1-01-PLAN.md's <interfaces> block:
//
//   bytes [0..2)              magic 'VZ'
//   bytes [2..3)              version 'a' (SteamKit VZipUtil header shape)
//   bytes [3..7)              timestamp (4 bytes, zero here -- decompressChunk
//                              never reads this field)
//   bytes [7..12)             LZMA1 properties (5 bytes)
//   bytes [12 .. len-10)      raw LZMA1 payload
//   bytes [len-10 .. len-6)   crc32 (unused/unchecked by decompressChunk)
//   bytes [len-6 .. len-2)    uncompressed size, uint32 LE
//   bytes [len-2 .. len)      footer magic 'zv'
//
// This mirrors decompressPool.test.ts's buildVZChunk() fixture helper exactly
// (read as part of this task's read_first).
//
// Route taken: LOCAL REAL GAME BYTES (not live CDN capture). RESEARCH.md
// Assumption A3 is explicitly that a synthetic text+random payload is not
// representative; a 1 MiB slice from the middle of a real installed Steam
// title's compiled binary (not the header, not padding) gives real-world
// entropy without requiring a live Steam auth session for this spike.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, readSync, closeSync, fstatSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const require = createRequire(import.meta.url)

// Reuse the project's own pinned `lzma@2.3.2` dependency (hoisted to the repo
// root's node_modules by pnpm) rather than adding a second dependency to this
// spike's package.json -- the spike's package.json declares exactly one
// dependency (lzma-native@8.0.6) per the plan.
const lzmaPath = join(REPO_ROOT, 'node_modules', 'lzma', 'index.js')
if (!existsSync(lzmaPath)) {
  throw new Error(
    `Cannot find this repo's pinned lzma package at ${lzmaPath} -- ` +
      `run this script from a checkout with node_modules installed.`
  )
}
const lzma = require(lzmaPath)

const SLICE_BYTES = 1024 * 1024 // ~1 MiB, matching this project's documented
// max compressed-chunk ceiling (RESEARCH.md order-of-magnitude match)
const SLICE_OFFSET = 2 * 1024 * 1024 // skip the Mach-O header region entirely

const CANDIDATE_SOURCE_FILES = [
  join(
    process.env.HOME || '',
    'Library/Application Support/Steam/steamapps/common/Humankind/Humankind.app/Contents/PlugIns/libEOSSDK-Mac-Shipping.dylib'
  ),
  join(
    process.env.HOME || '',
    'Library/Application Support/Steam/steamapps/common/Humankind/Humankind.app/Contents/Frameworks/libmonobdwgc-2.0.dylib'
  )
]

function pickSourceFile() {
  for (const candidate of CANDIDATE_SOURCE_FILES) {
    if (existsSync(candidate)) {
      const stat = fstatSync(openSync(candidate, 'r'))
      if (stat.size >= SLICE_OFFSET + SLICE_BYTES) {
        return candidate
      }
    }
  }
  throw new Error(
    'No candidate real-game source file found (or none large enough for a ' +
      `${SLICE_BYTES}-byte slice at offset ${SLICE_OFFSET}). Update ` +
      'CANDIDATE_SOURCE_FILES in make-chunk.mjs for this machine\'s installed library.'
  )
}

function sliceRealBytes(path, offset, length) {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(length)
    const bytesRead = readSync(fd, buf, 0, length, offset)
    if (bytesRead !== length) {
      throw new Error(`Short read from ${path}: got ${bytesRead}, wanted ${length}`)
    }
    return buf
  } finally {
    closeSync(fd)
  }
}

function compressAsync(data) {
  return new Promise((resolve, reject) => {
    lzma.compress(data, 1, (result, error) => {
      if (error) return reject(error)
      resolve(Buffer.from(result))
    })
  })
}

/** Build a VZ-container chunk from raw data + its LZMA-compressed (lzma_alone
 *  format: props(5) + size(8, LE) + payload) representation -- byte-for-byte
 *  the same construction as decompressPool.test.ts's buildVZChunk() helper. */
function buildVZChunk(data, compressed) {
  const props = compressed.subarray(0, 5)
  const payload = compressed.subarray(13) // skip props(5) + alone-format size(8)

  const header = Buffer.concat([Buffer.from('VZa', 'latin1'), Buffer.alloc(4), props])
  const footer = Buffer.alloc(10)
  footer.writeUInt32LE(0, 0) // crc -- unused/unchecked by decompressChunk
  footer.writeUInt32LE(data.length, 4) // outSize -- read at buf.length-6
  footer.write('zv', 8, 'latin1')

  return Buffer.concat([header, payload, footer])
}

async function main() {
  const sourceFile = pickSourceFile()
  const rawBytes = sliceRealBytes(sourceFile, SLICE_OFFSET, SLICE_BYTES)
  const sha1Uncompressed = createHash('sha1').update(rawBytes).digest('hex')

  console.log(`[make-chunk] source file: ${sourceFile}`)
  console.log(`[make-chunk] slice: offset=${SLICE_OFFSET} length=${rawBytes.length}`)
  console.log(`[make-chunk] uncompressed sha1: ${sha1Uncompressed}`)

  const compressed = await compressAsync(rawBytes)
  console.log(`[make-chunk] lzma_alone compressed size: ${compressed.length}`)

  const vzChunk = buildVZChunk(rawBytes, compressed)
  console.log(`[make-chunk] VZ container total size: ${vzChunk.length}`)

  const fixturesDir = join(__dirname, 'fixtures')
  mkdirSync(fixturesDir, { recursive: true })
  const outPath = join(fixturesDir, 'real-vz-chunk.bin')
  writeFileSync(outPath, vzChunk)
  console.log(`[make-chunk] wrote ${outPath}`)

  const metaPath = join(fixturesDir, 'real-vz-chunk.meta.json')
  const meta = {
    route: 'local-real-bytes',
    sourceFile,
    sliceOffset: SLICE_OFFSET,
    uncompressedSize: rawBytes.length,
    compressedSize: compressed.length,
    vzContainerSize: vzChunk.length,
    sha1Uncompressed
  }
  writeFileSync(metaPath, JSON.stringify(meta, null, 2))
  console.log(`[make-chunk] wrote ${metaPath}`)
  console.log(`[make-chunk] JSON: ${JSON.stringify(meta)}`)
}

main().catch((error) => {
  console.error('[make-chunk] FAILED', error)
  process.exit(1)
})
