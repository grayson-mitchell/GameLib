/**
 * Deterministic build of the on-demand steamclient-layer component archive
 * (Phase 56 plan 10, D-18).
 *
 *   pnpm build:steamclient-layer-archive [--build <CFBundleVersion>] [--source <dir>] [--out <file>]
 *
 * Operator-run on a build host. It never runs in release CI and never on a
 * user's machine (D-01, D-18). It reads ONLY the six catalogue names: five from
 * --source (the shared staging dir that build:lsteamclient and build:drm-native
 * write) and NOTICE from the committed path. It gates every file, writes the
 * archive, re-reads it with the strict reader, and prints `pinned: match`
 * (exit 0), `pinned: none` (exit 3, no catalogue entry yet, which is how the
 * first pin is taken) or `pinned: MISMATCH` (exit 3).
 *
 * Reproducibility contract: the same Node zlib gives identical bytes; a
 * different zlib build may not. The per-file sums are the content truth. The
 * operator must see `pinned: match` before uploading the asset.
 *
 * No child processes, so there is no spawn site and fake-HOME does not apply.
 *
 * It does NOT import meta/buildLsteamclient.ts or meta/buildDrmNativeParts.ts:
 * their JEST_WORKER_ID-only guard would run their main() inside this CLI
 * bundle. The staging-dir helpers are recomputed here and the test asserts
 * they agree.
 */

import { createHash } from 'crypto'
import { lstatSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import {
  STEAMWORKS_LICENSE_SHA256,
  lookupSteamclientLayer,
  steamclientLayerFileNames,
  steamclientLayerLicenceFor
} from '../src/common/steamclientLayerCatalogue'
import {
  buildOverlayTarGz,
  readOverlayTarGz
} from '../src/backend/knownFixOverlayArchive'
import { steamclientLayerComponentId } from '../src/backend/storeManagers/steam/bridge/drm/drmPaths'

const USAGE =
  'usage: pnpm build:steamclient-layer-archive [--build <CFBundleVersion>] [--source <dir>] [--out <file>]'

// ts-prune-ignore-next
export const NOTICE_SOURCE_PATH = 'native/steam-bridge/steamclient-layer/NOTICE'

const MIN_BINARY_BYTES = 1_000_000
const MACH_O_MAGIC_64 = 0xfeedfacf
const CPU_TYPE_X86_64 = 0x01000007
const LC_CODE_SIGNATURE = 0x1d

const sha256 = (b: Buffer | Uint8Array) =>
  createHash('sha256').update(b).digest('hex')

// ts-prune-ignore-next
export function componentStagingDir(build: string): string {
  return join('build', 'steamclient-layer', `steamclient-layer-cx${build}`)
}

// ts-prune-ignore-next
export function componentArchivePath(build: string): string {
  return join(
    'build',
    'steamclient-layer',
    `steamclient-layer-cx${build}.tar.gz`
  )
}

/** PE machine type, or null when the header is not a well-formed PE. */
// ts-prune-ignore-next
export function peMachine(bytes: Uint8Array): number | null {
  if (bytes.length < 0x40) return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) return null
  const lfanew = dv.getUint32(0x3c, true)
  if (lfanew > bytes.length - 6) return null
  if (
    bytes[lfanew] !== 0x50 ||
    bytes[lfanew + 1] !== 0x45 ||
    bytes[lfanew + 2] !== 0 ||
    bytes[lfanew + 3] !== 0
  ) {
    return null
  }
  return dv.getUint16(lfanew + 4, true)
}

/**
 * Walks a thin x86_64 Mach-O 64 header's load commands. A code signature
 * changes the file bytes, so the pinned sha of an unsigned build also proves
 * the shipped file is unsigned (RESEARCH Pitfall 1, F6).
 */
// ts-prune-ignore-next
export function machOX8664SignatureState(
  bytes: Uint8Array
): 'unsigned' | 'signed' | null {
  if (bytes.length < 32) return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dv.getUint32(0, true) !== MACH_O_MAGIC_64) return null
  if (dv.getUint32(4, true) !== CPU_TYPE_X86_64) return null
  const ncmds = dv.getUint32(16, true)
  const sizeofcmds = dv.getUint32(20, true)
  if (32 + sizeofcmds > bytes.length) return null
  const end = 32 + sizeofcmds
  let off = 32
  let signed = false
  for (let i = 0; i < ncmds; i++) {
    if (off + 8 > end) return null
    const cmd = dv.getUint32(off, true)
    const cmdsize = dv.getUint32(off + 4, true)
    if (cmdsize < 8 || off + cmdsize > end) return null
    if (cmd === LC_CODE_SIGNATURE) signed = true
    off += cmdsize
  }
  return signed ? 'signed' : 'unsigned'
}

// ts-prune-ignore-next
export type ComponentSourceFile = { path: string; data: Buffer }

// ts-prune-ignore-next
export function checkComponentSources(input: {
  build: string
  files: ReadonlyArray<ComponentSourceFile>
  committedNotice: Buffer
  caveSize: number
  homeDir: string
}): { ok: true } | { ok: false; failures: string[] } {
  const { build, files, committedNotice, caveSize, homeDir } = input
  const failures: string[] = []
  const byPath = new Map(files.map((f) => [f.path, f.data]))
  const want = steamclientLayerFileNames(build)
  const have = [...byPath.keys()].sort()
  if (JSON.stringify(want) !== JSON.stringify(have)) {
    failures.push(
      `name set: expected ${want.join(',')} but have ${have.join(',')}`
    )
    return { ok: false, failures }
  }
  const get = (p: string) => byPath.get(p) as Buffer

  const dll = get('lsteamclient.dll')
  if (peMachine(dll) !== 0x8664) {
    failures.push('lsteamclient.dll: not a PE x86_64 image')
  } else if (dll.length <= MIN_BINARY_BYTES) {
    failures.push('lsteamclient.dll: implausibly small')
  }
  const so = get('lsteamclient.so')
  const soState = machOX8664SignatureState(so)
  if (soState === null) {
    failures.push('lsteamclient.so: not a thin x86_64 Mach-O')
  } else if (soState === 'signed') {
    failures.push('lsteamclient.so: carries a code signature')
  } else if (so.length <= MIN_BINARY_BYTES) {
    failures.push('lsteamclient.so: implausibly small')
  }
  if (peMachine(get('steam.exe')) !== 0x8664) {
    failures.push('steam.exe: not a PE x86_64 image')
  }
  const detour = get(`detour-cx${build}.bin`)
  if (detour.length < 1 || detour.length > caveSize) {
    failures.push(`detour-cx${build}.bin: size outside 1..${caveSize}`)
  }
  if (sha256(get('LICENSE.lsteamclient')) !== STEAMWORKS_LICENSE_SHA256) {
    failures.push(
      'LICENSE.lsteamclient: sha256 differs from the Steamworks pin'
    )
  }
  if (!get('NOTICE').equals(committedNotice)) {
    failures.push(`NOTICE: differs from the committed ${NOTICE_SOURCE_PATH}`)
  }
  if (homeDir.length >= 2 && homeDir !== '/') {
    const needle = Buffer.from(homeDir)
    for (const name of want) {
      if (get(name).includes(needle)) {
        failures.push(`${name}: contains the build-host home path`)
      }
    }
  }
  return failures.length === 0 ? { ok: true } : { ok: false, failures }
}

// ts-prune-ignore-next
export function componentPinLines(
  files: ReadonlyArray<ComponentSourceFile>
): string[] {
  return [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => {
      const build = /^detour-cx(.+)\.bin$/.exec(f.path)?.[1] ?? ''
      const licence = steamclientLayerLicenceFor(f.path, build) ?? 'unknown'
      return `file=${f.path} sha256=${sha256(f.data)} size=${f.data.length} licence=${licence}`
    })
}

// ts-prune-ignore-next
export function buildComponentArchive(
  files: ReadonlyArray<ComponentSourceFile>
): Buffer {
  const build =
    files
      .map((f) => /^detour-cx(.+)\.bin$/.exec(f.path)?.[1])
      .find((b) => b !== undefined) ?? ''
  const want = steamclientLayerFileNames(build)
  const have = files.map((f) => f.path).sort()
  if (JSON.stringify(want) !== JSON.stringify(have)) {
    throw new Error(`file set is not the six-name component set: ${have}`)
  }
  return buildOverlayTarGz(files)
}

// ts-prune-ignore-next
export function comparePins(
  build: string,
  files: ReadonlyArray<ComponentSourceFile>,
  archive: Buffer
):
  | { status: 'none' }
  | { status: 'file-mismatch'; path: string }
  | { status: 'archive-mismatch' }
  | { status: 'match' } {
  const entry = lookupSteamclientLayer(build)
  if (!entry) return { status: 'none' }
  for (const pin of entry.files) {
    const f = files.find((x) => x.path === pin.path)
    if (!f || f.data.length !== pin.size || sha256(f.data) !== pin.sha256) {
      return { status: 'file-mismatch', path: pin.path }
    }
  }
  if (
    archive.length !== entry.archiveSize ||
    sha256(archive) !== entry.archiveSha256
  ) {
    return { status: 'archive-mismatch' }
  }
  return { status: 'match' }
}

function argOf(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}

function readRegular(path: string): Buffer {
  const st = lstatSync(path)
  if (!st.isFile() || st.isSymbolicLink()) {
    throw new Error(`${path} is not a regular file`)
  }
  return readFileSync(path)
}

// ts-prune-ignore-next
export async function main(
  argv: string[] = process.argv.slice(2)
): Promise<number> {
  const build = argOf(argv, 'build') ?? '26.3.0.39832'
  if (steamclientLayerComponentId(build) === null) {
    console.error(USAGE)
    return 2
  }
  const source = argOf(argv, 'source') ?? componentStagingDir(build)
  const out = argOf(argv, 'out') ?? componentArchivePath(build)
  try {
    lstatSync(NOTICE_SOURCE_PATH)
  } catch {
    console.error(`run from the repo root (${NOTICE_SOURCE_PATH} not found)`)
    return 2
  }

  const failures: string[] = []
  const files: ComponentSourceFile[] = []
  for (const name of steamclientLayerFileNames(build)) {
    const full = name === 'NOTICE' ? NOTICE_SOURCE_PATH : join(source, name)
    try {
      files.push({ path: name, data: readRegular(full) })
    } catch (err) {
      failures.push(`${name}: ${err instanceof Error ? err.message : err}`)
    }
  }
  if (failures.length > 0) {
    console.log(`SOURCE GATE FAILED (56-10): ${failures.join('; ')}`)
    return 4
  }
  const gate = checkComponentSources({
    build,
    files,
    committedNotice: readFileSync(NOTICE_SOURCE_PATH),
    // DETOUR_BUILD_ROWS[build].caveSize (meta/buildDrmNativeParts.ts); a test asserts the two agree.
    caveSize: 0x1000,
    homeDir: homedir()
  })
  if (!gate.ok) {
    console.log(`SOURCE GATE FAILED (56-10): ${gate.failures.join('; ')}`)
    return 4
  }
  for (const line of componentPinLines(files)) console.log(line)

  const archive = buildComponentArchive(files)
  const partial = `${out}.partial-${process.pid}`
  writeFileSync(partial, archive, { flag: 'wx' })
  renameSync(partial, out)
  const total = files.reduce((n, f) => n + f.data.length, 0)
  await readOverlayTarGz(
    archive,
    new Map(files.map((f) => [f.path, f.data.length])),
    total + 1024 * 1024
  )

  console.log(`sha256=${sha256(archive)} size=${archive.length}`)
  const verdict = comparePins(build, files, archive)
  switch (verdict.status) {
    case 'match':
      console.log('pinned: match')
      return 0
    case 'none':
      console.log(`pinned: none (no catalogue entry for ${build})`)
      return 3
    case 'file-mismatch':
      console.log(`pinned: MISMATCH (file ${verdict.path})`)
      return 3
    case 'archive-mismatch':
      console.log(
        `pinned: MISMATCH (catalogue ${lookupSteamclientLayer(build)?.archiveSha256})`
      )
      return 3
  }
}

if (!process.env.JEST_WORKER_ID) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err))
      process.exit(1)
    }
  )
}
