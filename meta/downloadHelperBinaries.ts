import { createHash } from 'crypto'
import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { Readable } from 'stream'
import { finished } from 'stream/promises'

import { setGlobalDispatcher, ProxyAgent } from 'undici'

import {
  RELEASE_TAGS,
  type SupportedPlatform,
  type DownloadedBinary
} from './releaseTags'
import { archiveName } from './buildRunnersOnedir'
import runnersOnedirDigestsRaw from './runnersOnedirDigests.json'

// meta/runnersOnedirDigests.json's shape, cast once here so every dynamic
// (runtime-computed filename) lookup below doesn't need its own assertion.
const runnersOnedirDigests = runnersOnedirDigestsRaw as {
  layout: string
  digests: Record<string, string>
}

const pathExists = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  )

async function downloadFile(url: string, dst: string) {
  const response = await fetch(url, {
    keepalive: true,
    headers: {
      'User-Agent': 'HeroicBinaryUpdater/1.0'
    }
  })
  if (response.status !== 200 || !response.body) {
    throw Error(`Failed to download ${url}: ${response.status}`)
  }
  await mkdir(dirname(dst), { recursive: true })
  const fileStream = createWriteStream(dst, { flags: 'w' })
  // DOM lib's ReadableStream vs Node's stream/web ReadableStream -- same
  // conflict meta/downloadZig.ts already casts around.
  await finished(
    Readable.fromWeb(
      response.body as unknown as import('stream/web').ReadableStream
    ).pipe(fileStream)
  )
}

// ---------------------------------------------------------------------------
// Darwin onedir sourcing (Phase 34.9 Plan 06) -- legendary/gogdl/nile's
// macOS assets are directory-tree archives built by GameLib's own CI
// (.github/workflows/build-runners-onedir-macos.yml, plan 34.9-04), not the
// single-file upstream binaries downloadAsset() handles. Deliberately a
// SEPARATE function with its own call sites (34.9-RESEARCH.md's anti-pattern
// warning): downloadAsset()'s signature and body are untouched.
//
// GAMELIB_RUNNERS_REPO is a hardcoded literal, deliberately NOT derived from
// package.json's `repository` field -- that field still points at Heroic
// upstream (the same trap electron-builder.yml's `publish:` block already
// documents for its own auto-update feed).
// ---------------------------------------------------------------------------

const GAMELIB_RUNNERS_REPO = 'grayson-mitchell/GameLib'
const RUNNERS_ONEDIR_TAG = 'runners-onedir-macos'

const DIGEST_SENTINEL = 'PENDING-CI-PUBLISH'

async function fetchArchiveBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'HeroicBinaryUpdater/1.0' }
  })
  if (response.status !== 200) {
    throw new Error(`Failed to download ${url}: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// Argv-form spawn (T-34.9-03, mirrors meta/downloadZig.ts's T-24-06 control)
// -- never a shell string. Lists an archive's entries WITHOUT extracting.
function listTarEntries(archivePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-tzf', archivePath], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.split('\n').filter((line) => line.length > 0))
      } else {
        reject(new Error(`tar -tzf failed (exit ${code}): ${stderr}`))
      }
    })
  })
}

// T-34.9-02: every entry must live under `${binaryName}/` -- rejects
// absolute paths and any path containing `..` BEFORE a single file is
// extracted.
async function assertArchiveEntriesAreSafe(
  archivePath: string,
  binaryName: string
): Promise<void> {
  const entries = await listTarEntries(archivePath)
  const requiredPrefix = `${binaryName}/`
  for (const entry of entries) {
    const isAbsolute = entry.startsWith('/')
    const hasTraversal = entry.split('/').includes('..')
    const hasWrongPrefix = !entry.startsWith(requiredPrefix)
    if (isAbsolute || hasTraversal || hasWrongPrefix) {
      throw new Error(
        `Archive entry "${entry}" in ${archivePath} does not begin with ` +
          `"${requiredPrefix}", or is an absolute/traversal path -- ` +
          `refusing to extract`
      )
    }
  }
}

// Argv-form spawn -- extraction only runs after assertArchiveEntriesAreSafe
// has already passed.
function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', destDir], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
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

/**
 * Fetches, sha256-verifies (against a digest committed IN THIS REPOSITORY --
 * T-34.9-01, strictly stronger than a same-round-trip shasum), structurally
 * validates (T-34.9-02) and extracts one darwin onedir archive from the
 * GameLib rolling release. Exported for test (meta/__tests__/
 * downloadHelperBinaries.test.ts).
 */
export async function downloadOnedirAsset(
  binaryName: string,
  arch: string
): Promise<void> {
  const filename = archiveName(binaryName, arch)
  const url = `https://github.com/${GAMELIB_RUNNERS_REPO}/releases/download/${RUNNERS_ONEDIR_TAG}/${filename}`

  const expectedDigest = runnersOnedirDigests.digests[filename]
  if (expectedDigest === undefined) {
    throw new Error(
      `No digest entry for "${filename}" in meta/runnersOnedirDigests.json`
    )
  }
  if (expectedDigest === DIGEST_SENTINEL) {
    throw new Error(
      `Digest for "${filename}" is still the placeholder sentinel ` +
        `"${DIGEST_SENTINEL}" -- plan 34.9-09 must fill it in with the real ` +
        `sha256 published by build-runners-onedir-macos.yml before this ` +
        `archive can be verified and extracted.`
    )
  }

  console.log('Downloading', binaryName, 'for darwin', arch, 'from', url)
  const buffer = await fetchArchiveBuffer(url)

  const actualDigest = createHash('sha256').update(buffer).digest('hex')
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `sha256 mismatch for "${filename}": expected ${expectedDigest}, got ` +
        `${actualDigest} -- refusing to write anything under public/bin`
    )
  }

  const tmpPath = join(tmpdir(), filename)
  await writeFile(tmpPath, buffer)

  try {
    await assertArchiveEntriesAreSafe(tmpPath, binaryName)

    const destDir = join('public', 'bin', arch, 'darwin')
    const finalDir = join(destDir, binaryName)
    // The existing entry may be a stale FLAT FILE from the pre-34.9 layout,
    // or a stale directory from a prior onedir extraction -- either way it
    // must not linger alongside the fresh extraction.
    await rm(finalDir, { recursive: true, force: true })
    await mkdir(destDir, { recursive: true })
    await extractTarGz(tmpPath, destDir)

    const binPath = join(finalDir, binaryName)
    if (!(await pathExists(binPath))) {
      throw new Error(
        `Expected ${binPath} to exist after extracting ${filename}, none found`
      )
    }
    // Modes are restored from the archive (CI creates it with correct
    // modes) -- only chmod the SINGLE top-level entry, and only when its
    // exec bit is missing. Never a recursive chmod over the ~100-file tree
    // (T-34.9-04): that would mark data files executable and widen what
    // Gatekeeper/notarization must assess.
    const binStat = await stat(binPath)
    const isExecutable = (binStat.mode & 0o111) !== 0
    if (!isExecutable) {
      await chmod(binPath, '755')
    }
  } finally {
    await rm(tmpPath, { force: true })
  }

  console.log('Done downloading', binaryName, 'for darwin', arch)
}

async function downloadAsset(
  binaryName: string,
  repo: string,
  tag_name: string,
  arch: string,
  platform: SupportedPlatform,
  filename: string
) {
  const url = `https://github.com/${repo}/releases/download/${tag_name}/${filename}`
  console.log('Downloading', binaryName, 'for', platform, arch, 'from', url)

  const exeFilename = binaryName + (platform === 'win32' ? '.exe' : '')
  const exePath = join('public', 'bin', arch, platform, exeFilename)
  await downloadFile(url, exePath)

  console.log('Done downloading', binaryName, 'for', platform, arch)

  if (platform !== 'win32') {
    await chmod(exePath, '755')
  }
}

/**
 * Downloads assets uploaded to a GitHub release
 * @param binaryName The binary which was built & uploaded. Also used to get the final folder path
 * @param repo The repo to download from
 * @param tagName The GitHub Release tag which produced the binaries
 * @param assetNames The name(s) of the assets which were uploaded, mapped to platforms
 */
async function downloadGithubAssets(
  binaryName: string,
  repo: string,
  tagName: string,
  assetNames: Record<
    'x64' | 'arm64',
    Partial<Record<SupportedPlatform, string>>
  >
) {
  const downloadPromises = Object.entries(assetNames).map(
    async ([arch, platformFilenameMap]) =>
      Promise.all(
        Object.entries(platformFilenameMap).map(([platform, filename]) => {
          if (!filename) return
          return downloadAsset(
            binaryName,
            repo,
            tagName,
            arch,
            platform as keyof typeof platformFilenameMap,
            filename
          )
        })
      )
  )

  return Promise.all(downloadPromises)
}

async function downloadLegendary() {
  return Promise.all([
    downloadGithubAssets(
      'legendary',
      'legendary-gl/legendary',
      RELEASE_TAGS['legendary'],
      {
        x64: {
          linux: 'legendary_linux_x64',
          win32: 'legendary_windows_x64.exe'
        },
        arm64: {
          linux: 'legendary_linux_arm64',
          win32: 'legendary_windows_arm64.exe'
        }
      }
    ),
    // macOS: onedir archive from the GameLib rolling release, not upstream
    // (34.9-RESEARCH.md Pitfall 5 -- the single-repo-per-runner assumption
    // above cannot express a platform-conditional source).
    downloadOnedirAsset('legendary', 'x64'),
    downloadOnedirAsset('legendary', 'arm64')
  ])
}

async function downloadGogdl() {
  return Promise.all([
    downloadGithubAssets(
      'gogdl',
      'Heroic-Games-Launcher/heroic-gogdl',
      RELEASE_TAGS['gogdl'],
      {
        x64: {
          linux: 'gogdl_linux_x86_64',
          win32: 'gogdl_windows_x86_64.exe'
        },
        arm64: {
          linux: 'gogdl_linux_arm64',
          win32: 'gogdl_windows_arm64.exe'
        }
      }
    ),
    downloadOnedirAsset('gogdl', 'x64'),
    downloadOnedirAsset('gogdl', 'arm64')
  ])
}

async function downloadNile() {
  return Promise.all([
    downloadGithubAssets('nile', 'imLinguin/nile', RELEASE_TAGS['nile'], {
      x64: {
        linux: 'nile_linux_x86_64',
        win32: 'nile_windows_x86_64.exe'
      },
      arm64: {
        linux: 'nile_linux_arm64'
      }
    }),
    downloadOnedirAsset('nile', 'x64'),
    downloadOnedirAsset('nile', 'arm64')
  ])
}

async function downloadComet() {
  return Promise.all([
    downloadGithubAssets(
      'GalaxyCommunication',
      'imLinguin/comet',
      RELEASE_TAGS['comet'],
      {
        x64: {
          win32: 'GalaxyCommunication-dummy.exe'
        },
        arm64: {}
      }
    ),
    downloadGithubAssets('comet', 'imLinguin/comet', RELEASE_TAGS['comet'], {
      x64: {
        linux: 'comet-x86_64-unknown-linux-gnu',
        darwin: 'comet-x86_64-apple-darwin',
        win32: 'comet-x86_64-pc-windows-msvc.exe'
      },
      arm64: {
        darwin: 'comet-aarch64-apple-darwin',
        linux: 'comet-aarch64-unknown-linux-gnu',
        win32: 'comet-aarch64-pc-windows-msvc.exe'
      }
    })
  ])
}

async function downloadEpicIntegration() {
  return downloadGithubAssets(
    'EpicGamesLauncher',
    'Etaash-mathamsetty/heroic-epic-integration',
    RELEASE_TAGS['epic-integration'],
    {
      x64: {
        win32: 'EpicGamesLauncher.exe'
      },
      arm64: {}
    }
  )
}

// Pure hash-over-canonical-JSON helper, factored out of darwinLayoutMarker()
// below so it (and therefore the marker's sensitivity to a digest VALUE
// changing vs. its stability under key reordering) is directly testable
// without needing to mock or mutate meta/runnersOnedirDigests.json's
// imported module.
export function computeLayoutMarker(
  layout: string,
  digests: Record<string, string>
): string {
  const sortedKeys = Object.keys(digests).sort()
  const canonical = JSON.stringify({
    layout,
    digests: Object.fromEntries(sortedKeys.map((key) => [key, digests[key]]))
  })
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * A sha256 hex digest over meta/runnersOnedirDigests.json's `layout` string
 * and its `digests` object (keys sorted, so reordering the JSON's keys does
 * NOT change the marker -- only the layout name or a digest VALUE does).
 *
 * RELEASE_TAGS (compareDownloadedTags below) answers "did the upstream
 * version change". Phase 34.9 is the first change to alter the on-disk
 * LAYOUT (a flat public/bin/{arch}/darwin/{runner} file becoming a nested
 * public/bin/{arch}/darwin/{runner}/{runner} onedir tree) WITHOUT changing a
 * version -- without this __darwin_layout marker, an existing checkout
 * holding the old flat public/bin/arm64/darwin/nile file would report
 * "up to date", skip the re-download, and then fail at runtime against
 * archSpecificBinary()'s new nested lookup (34.9-RESEARCH.md Pitfall 6).
 */
export function darwinLayoutMarker(): string {
  return computeLayoutMarker(
    runnersOnedirDigests.layout,
    runnersOnedirDigests.digests
  )
}

const DARWIN_LAYOUT_RUNNERS: DownloadedBinary[] = ['legendary', 'gogdl', 'nile']

/**
 * Finds out which binaries need to be downloaded by comparing
 * `public/bin/.release_tags` to RELEASE_TAGS, PLUS the darwin onedir layout
 * marker above (__darwin_layout) -- see darwinLayoutMarker()'s docblock.
 */
export async function compareDownloadedTags(): Promise<DownloadedBinary[]> {
  const storedTagsText = await readFile(
    'public/bin/.release_tags',
    'utf-8'
  ).catch(() => '{}')
  let storedTagsParsed: Partial<Record<DownloadedBinary, string>> & {
    __darwin_layout?: string
  }
  try {
    storedTagsParsed = JSON.parse(storedTagsText)
  } catch {
    return ['legendary', 'gogdl', 'nile', 'comet', 'epic-integration']
  }
  const binariesToDownload: DownloadedBinary[] = []
  for (const [runner, currentTag] of Object.entries(RELEASE_TAGS)) {
    if (storedTagsParsed[runner as DownloadedBinary] !== currentTag)
      binariesToDownload.push(runner as keyof typeof RELEASE_TAGS)
  }

  // Layout-only re-download branch. Deliberately restricted to the three
  // onedir-affected runners -- comet and epic-integration must never be
  // pulled in from here, only from the RELEASE_TAGS comparison above.
  if (storedTagsParsed.__darwin_layout !== darwinLayoutMarker()) {
    for (const runner of DARWIN_LAYOUT_RUNNERS) {
      if (!binariesToDownload.includes(runner)) {
        binariesToDownload.push(runner)
      }
    }
  }

  return binariesToDownload
}

export async function storeDownloadedTags() {
  await writeFile(
    'public/bin/.release_tags',
    JSON.stringify({ ...RELEASE_TAGS, __darwin_layout: darwinLayoutMarker() })
  )
}

async function main() {
  const proxyUri = process.env['HTTPS_PROXY']
  if (proxyUri) {
    console.log(`Using proxy: ${proxyUri}`)
    const proxyAgent = new ProxyAgent(proxyUri)
    setGlobalDispatcher(proxyAgent)
  }

  if (!(await pathExists('public/bin'))) {
    console.error('public/bin not found, are you in the source root?')
    return
  }

  const binariesToDownload = await compareDownloadedTags()
  if (!binariesToDownload.length) {
    console.log('Nothing to download, binaries are up-to-date')
    return
  }

  console.log('Downloading:', binariesToDownload)
  const promisesToAwait: Promise<unknown>[] = []

  if (binariesToDownload.includes('legendary'))
    promisesToAwait.push(downloadLegendary())
  if (binariesToDownload.includes('gogdl'))
    promisesToAwait.push(downloadGogdl())
  if (binariesToDownload.includes('nile')) promisesToAwait.push(downloadNile())
  if (binariesToDownload.includes('comet'))
    promisesToAwait.push(downloadComet())
  if (binariesToDownload.includes('epic-integration'))
    promisesToAwait.push(downloadEpicIntegration())

  await Promise.all(promisesToAwait)

  await storeDownloadedTags()
}

// Guard main() so importing this module (e.g. from
// meta/__tests__/downloadHelperBinaries.test.ts) never starts a real
// download. Mirrors meta/buildCrossoverIndex.ts's / meta/buildRunnersOnedir.ts's
// idiom: this script is run via `node meta/runTs.cjs` (the meta/
// convention), which DOES set `require.main` -- but this module is also
// imported directly by its jest suite, so `JEST_WORKER_ID` (set by Jest for
// every worker) still reliably distinguishes "imported under test" from
// "run as a CLI".
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
