/**
 * Phase 24 Plan 07 (R5, D-07): pinned zig tarball downloader.
 *
 * Zig is a build-time-ONLY toolchain used by meta/buildSteamBridgeShims.ts to
 * cross-compile the PE32 `steam_api.dll` shim (`zig cc -target
 * x86-windows-gnu`, D-07 / 24-RESEARCH.md Pattern 5). It must NEVER ship
 * inside the packaged app -- it is extracted to a build-tooling directory
 * (`.build-tools/zig`), NEVER `public/bin/**` (that convention is reserved
 * for BUNDLED runtime binaries -- `legendary`/`gogdl`/`nile`/`comet`/the
 * steam-bridge helper -- see meta/downloadHelperBinaries.ts).
 *
 * Follows meta/downloadHelperBinaries.ts's `RELEASE_TAGS` pinning precedent
 * (pin a literal version string, never "latest") but fetches from
 * `ziglang.org/download/index.json` -- the official zig distribution index --
 * rather than a GitHub releases URL (24-RESEARCH.md: "NOT a GitHub releases
 * URL, NOT brew, NOT latest").
 *
 * T-24-SC (mitigate, partial): verifies the downloaded tarball's sha256
 * against the shasum published IN THE SAME index response. This is
 * Trust-On-First-Use, not true pinning -- the shasum is fetched from the
 * same network round-trip as the tarball, so a compromised
 * ziglang.org/download/index.json could serve a matching (bad) pair. A
 * hardcoded expected digest committed in-repo would be strictly stronger
 * (recorded as a minor accepted residual, finding #12). Still a real
 * improvement over the existing UNCHECKSUMMED meta/downloadHelperBinaries.ts
 * precedent, which verifies nothing about the bytes it downloads.
 */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'

// Pinned zig release (RELEASE_TAGS-shaped constant, per
// meta/downloadHelperBinaries.ts's pinning precedent) -- a literal version
// string, never "latest".
export const ZIG_VERSION = '0.16.0'

const ZIG_INDEX_URL = 'https://ziglang.org/download/index.json'
const ZIG_TARGET = 'aarch64-macos'

// Build-tooling directory -- NOT public/bin/**. Zig does not ship in the
// packaged app.
export const ZIG_TOOLS_DIR = join('.build-tools', 'zig')
const ZIG_VERSION_MARKER = join(ZIG_TOOLS_DIR, '.zig-version')

interface ZigIndexTarget {
  tarball: string
  shasum: string
  size: string
}

async function fetchZigIndexTarget(): Promise<ZigIndexTarget> {
  const response = await fetch(ZIG_INDEX_URL, {
    headers: { 'User-Agent': 'GameLibZigDownloader/1.0' }
  })
  if (response.status !== 200) {
    throw new Error(`Failed to fetch ${ZIG_INDEX_URL}: ${response.status}`)
  }
  const index = (await response.json()) as Record<
    string,
    Record<string, ZigIndexTarget>
  >
  const versionEntry = index[ZIG_VERSION]
  if (!versionEntry) {
    throw new Error(
      `Pinned zig version "${ZIG_VERSION}" not found in ${ZIG_INDEX_URL}`
    )
  }
  const target = versionEntry[ZIG_TARGET]
  if (!target) {
    throw new Error(
      `No "${ZIG_TARGET}" build for pinned zig version "${ZIG_VERSION}"`
    )
  }
  return target
}

async function downloadTarball(url: string, dest: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'GameLibZigDownloader/1.0' }
  })
  if (response.status !== 200 || !response.body) {
    throw new Error(`Failed to download zig tarball ${url}: ${response.status}`)
  }
  await mkdir(dirname(dest), { recursive: true })
  const fileStream = createWriteStream(dest, { flags: 'w' })
  await finished(
    Readable.fromWeb(
      response.body as unknown as import('stream/web').ReadableStream
    ).pipe(fileStream)
  )
}

// T-24-SC: reject a tarball whose bytes don't match the index-published
// shasum BEFORE it is ever extracted/executed.
async function verifyChecksum(
  filePath: string,
  expectedShasum: string
): Promise<void> {
  const buf = await readFile(filePath)
  const actual = createHash('sha256').update(buf).digest('hex')
  if (actual !== expectedShasum) {
    throw new Error(
      `zig tarball checksum mismatch (T-24-SC): expected ${expectedShasum}, got ${actual}`
    )
  }
}

// Argv-form (never a shell string, T-24-06) tar extraction.
function extractTarball(tarballPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tar',
      ['-xJf', tarballPath, '-C', destDir, '--strip-components=1'],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`tar extraction failed (exit ${code}): ${stderr}`))
    })
  })
}

async function alreadyDownloaded(): Promise<boolean> {
  if (!existsSync(ZIG_VERSION_MARKER)) return false
  if (!existsSync(join(ZIG_TOOLS_DIR, 'zig'))) return false
  const marker = await readFile(ZIG_VERSION_MARKER, 'utf-8').catch(() => '')
  return marker.trim() === ZIG_VERSION
}

/**
 * Ensures the pinned zig release is present under `ZIG_TOOLS_DIR`
 * (downloading + checksum-verifying + extracting it if missing or stale --
 * drift-detection idiom from meta/downloadHelperBinaries.ts's
 * `compareDownloadedTags`), and returns the resolved path to the `zig`
 * binary itself.
 */
export async function downloadZig(): Promise<string> {
  const zigBinPath = join(ZIG_TOOLS_DIR, 'zig')

  if (await alreadyDownloaded()) {
    console.log(
      `zig ${ZIG_VERSION} already present at ${zigBinPath}, skipping download`
    )
    return zigBinPath
  }

  console.log(`Downloading pinned zig ${ZIG_VERSION} (${ZIG_TARGET})...`)
  const target = await fetchZigIndexTarget()

  await rm(ZIG_TOOLS_DIR, { recursive: true, force: true })
  await mkdir(ZIG_TOOLS_DIR, { recursive: true })

  const tarballPath = join('.build-tools', `zig-${ZIG_VERSION}.tar.xz`)
  await downloadTarball(target.tarball, tarballPath)
  await verifyChecksum(tarballPath, target.shasum)
  await extractTarball(tarballPath, ZIG_TOOLS_DIR)
  await rm(tarballPath, { force: true })

  await writeFile(ZIG_VERSION_MARKER, ZIG_VERSION)
  console.log(`zig ${ZIG_VERSION} ready at ${zigBinPath}`)
  return zigBinPath
}
