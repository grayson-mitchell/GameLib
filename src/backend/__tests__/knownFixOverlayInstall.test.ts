/**
 * quick 261027-n77: the verified overlay installer. Tmp overlays root,
 * injected fetchArchive, a synthetic catalogue entry; no network.
 */

import { createHash } from 'crypto'
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gzipSync } from 'zlib'

const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
jest.mock('backend/logger', () => ({
  logWarning: (...a: unknown[]) => mockLogWarning(...a),
  logInfo: (...a: unknown[]) => mockLogInfo(...a),
  logDebug: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

import { LogPrefix } from 'backend/logger'
import {
  KNOWN_FIX_OVERLAY_CATALOGUE,
  KnownFixOverlayCatalogueEntry,
  overlayArchiveUrl,
  lookupKnownFixOverlay
} from 'common/knownFixOverlayCatalogue'
import { buildOverlayTarGz } from '../knownFixOverlayArchive'
import {
  ensureOverlayInstalled,
  verifyInstalledOverlay,
  OverlayArchiveFetch
} from '../knownFixOverlayInstall'
import { hasAbortController } from '../utils/aborthandler/aborthandler'

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const ctx = { label: 'test', logPrefix: LogPrefix.Backend }

const payload = [
  { path: 'lib/gstreamer-1.0/libplug.dylib', data: Buffer.from('plug') },
  { path: 'lib/libdep.1.dylib', data: Buffer.from('dependency bytes') }
]

function entryFor(
  files: typeof payload,
  archive: Buffer
): KnownFixOverlayCatalogueEntry {
  return {
    id: 'test-overlay-1',
    target: 'gstreamer-plugin-path',
    pluginSubdir: 'lib/gstreamer-1.0',
    platform: { os: 'darwin', wine: 'crossover' },
    release: { repo: 'o/r', tag: 't', asset: 'a.tar.gz' },
    archiveSha256: sha(archive),
    archiveSize: archive.length,
    files: files.map((f) => ({
      path: f.path,
      sha256: sha(f.data),
      size: f.data.length
    }))
  }
}

const goodArchive = buildOverlayTarGz(payload)
const entry = entryFor(payload, goodArchive)

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gamelib-overlay-'))
  mockLogWarning.mockClear()
  mockLogInfo.mockClear()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const okFetch = () =>
  jest.fn<ReturnType<OverlayArchiveFetch>, Parameters<OverlayArchiveFetch>>(
    () => Promise.resolve(goodArchive)
  )

const leftovers = () => readdirSync(root).filter((n) => n.startsWith('.'))

describe('ensureOverlayInstalled', () => {
  it('installs fresh, then is idempotent', async () => {
    const fetchArchive = okFetch()
    const dir = await ensureOverlayInstalled(entry, ctx, {
      overlaysRoot: root,
      fetchArchive
    })
    expect(dir).toBe(join(root, entry.id))
    expect(fetchArchive).toHaveBeenCalledTimes(1)
    expect(fetchArchive.mock.calls[0][0]).toBe(overlayArchiveUrl(entry))
    expect(fetchArchive.mock.calls[0][1].maxBytes).toBe(entry.archiveSize)
    expect(readFileSync(join(dir!, payload[0].path))).toEqual(payload[0].data)
    expect(leftovers()).toEqual([])
    await ensureOverlayInstalled(entry, ctx, {
      overlaysRoot: root,
      fetchArchive
    })
    expect(fetchArchive).toHaveBeenCalledTimes(1)
  })

  it('accepts an extra root-level file without fetching', async () => {
    const fetchArchive = okFetch()
    await ensureOverlayInstalled(entry, ctx, {
      overlaysRoot: root,
      fetchArchive
    })
    writeFileSync(join(root, entry.id, 'SHA256SUMS'), 'x')
    await ensureOverlayInstalled(entry, ctx, {
      overlaysRoot: root,
      fetchArchive
    })
    expect(fetchArchive).toHaveBeenCalledTimes(1)
  })

  describe.each([
    [
      'an extra file in the plugin subdir',
      (d: string) =>
        writeFileSync(join(d, 'lib/gstreamer-1.0/extra.dylib'), 'x')
    ],
    [
      'a corrupted file',
      (d: string) =>
        writeFileSync(join(d, 'lib/libdep.1.dylib'), 'xxxxxxxxxxxxxxxx')
    ],
    [
      'a wrong size',
      (d: string) => writeFileSync(join(d, 'lib/libdep.1.dylib'), 'short')
    ],
    [
      'a symlink in place of a file',
      (d: string) => {
        rmSync(join(d, 'lib/libdep.1.dylib'))
        writeFileSync(join(root, 'real'), 'dependency bytes')
        symlinkSync(join(root, 'real'), join(d, 'lib/libdep.1.dylib'))
      }
    ],
    [
      'lib/ being a symlink',
      (d: string) => {
        const moved = join(root, 'lib-moved')
        renameSync(join(d, 'lib'), moved)
        symlinkSync(moved, join(d, 'lib'))
      }
    ]
  ])('with %s', (_l, damage) => {
    it('is invalid and gets replaced', async () => {
      const fetchArchive = okFetch()
      const dir = (await ensureOverlayInstalled(entry, ctx, {
        overlaysRoot: root,
        fetchArchive
      }))!
      damage(dir)
      expect((await verifyInstalledOverlay(dir, entry)).ok).toBe(false)
      await ensureOverlayInstalled(entry, ctx, {
        overlaysRoot: root,
        fetchArchive
      })
      expect(fetchArchive).toHaveBeenCalledTimes(2)
      expect((await verifyInstalledOverlay(dir, entry)).ok).toBe(true)
      expect(leftovers()).toEqual([])
    })
  })

  it('refuses a sha mismatch and a length mismatch', async () => {
    for (const bad of [
      { ...entry, archiveSha256: '0'.repeat(64) },
      { ...entry, archiveSize: entry.archiveSize + 1 }
    ]) {
      mockLogWarning.mockClear()
      const out = await ensureOverlayInstalled(bad, ctx, {
        overlaysRoot: root,
        fetchArchive: okFetch()
      })
      expect(out).toBeNull()
      expect(mockLogWarning).toHaveBeenCalledTimes(1)
      expect(existsSync(join(root, entry.id))).toBe(false)
      expect(leftovers()).toEqual([])
    }
  })

  it('refuses a hostile archive whose sha matches the pin', async () => {
    // build a tar with a ../x entry by renaming within the header of a good one
    const tarOf = (name: string) => {
      const h = Buffer.alloc(512)
      h.write(name, 0, 'ascii')
      h.write('0000644\0', 100, 'ascii')
      h.write('0000000\0', 108, 'ascii')
      h.write('0000000\0', 116, 'ascii')
      h.write('00000000001\0', 124, 'ascii')
      h.write('00000000000\0', 136, 'ascii')
      h.write('        ', 148, 'ascii')
      h.write('0ustar\0' + '00', 156, 'ascii')
      let s = 0
      for (const b of h) s += b
      h.write(s.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii')
      return gzipSync(
        Buffer.concat([h, Buffer.alloc(512, 0x78), Buffer.alloc(1024)])
      )
    }
    const hostile = tarOf('../x')
    const out = await ensureOverlayInstalled(entryFor(payload, hostile), ctx, {
      overlaysRoot: root,
      fetchArchive: () => Promise.resolve(hostile)
    })
    expect(out).toBeNull()
    expect(mockLogWarning).toHaveBeenCalled()
    expect(existsSync(join(root, '..', 'x'))).toBe(false)
    expect(leftovers()).toEqual([])
  })

  it('fails open when the fetch rejects', async () => {
    const out = await ensureOverlayInstalled(entry, ctx, {
      overlaysRoot: root,
      fetchArchive: () => Promise.reject(new Error('HTTP 500'))
    })
    expect(out).toBeNull()
    expect(mockLogWarning.mock.calls[0][0]).toMatch(/HTTP 500/)
  })

  it('times out a fetch that never settles', async () => {
    let seen: AbortSignal | undefined
    const out = await ensureOverlayInstalled(entry, ctx, {
      overlaysRoot: root,
      timeoutMs: 50,
      fetchArchive: (_u, { signal }) => {
        seen = signal
        return new Promise<Buffer>(() => undefined)
      }
    })
    expect(out).toBeNull()
    expect(seen?.aborted).toBe(true)
    expect(mockLogWarning.mock.calls[0][0]).toMatch(/timed out/)
    expect(hasAbortController(`known-fix-overlay:${entry.id}`)).toBe(false)
  })

  it('shares one fetch between concurrent calls', async () => {
    const fetchArchive = okFetch()
    const [a, b] = await Promise.all([
      ensureOverlayInstalled(entry, ctx, { overlaysRoot: root, fetchArchive }),
      ensureOverlayInstalled(entry, ctx, { overlaysRoot: root, fetchArchive })
    ])
    expect(a).toBe(b)
    expect(fetchArchive).toHaveBeenCalledTimes(1)
  })
})

describe('real catalogue', () => {
  const real = lookupKnownFixOverlay('gst-libav-1.24.13')!
  it('pins the 10 files and the archive', () => {
    expect(real.files.map((f) => f.path)).toEqual([
      'lib/gstreamer-1.0/libgstlibav.dylib',
      'lib/libavcodec.60.dylib',
      'lib/libavfilter.9.dylib',
      'lib/libavformat.60.dylib',
      'lib/libavutil.58.dylib',
      'lib/libbz2.1.dylib',
      'lib/libpostproc.57.dylib',
      'lib/libswresample.4.dylib',
      'lib/libswscale.7.dylib',
      'lib/libz.1.dylib'
    ])
    expect(real.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true)
    expect(real.files.reduce((n, f) => n + f.size, 0)).toBe(20190752)
    expect(real.archiveSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(real.archiveSha256).not.toBe('0'.repeat(64))
    expect(real.archiveSize).toBeGreaterThan(0)
    expect(overlayArchiveUrl(real)).toBe(
      'https://github.com/grayson-mitchell/GameLib/releases/download/overlay-gst-libav-1.24.13-x86_64/gst-libav-1.24.13-macos-x86_64.tar.gz'
    )
    expect(real.pluginSubdir).toBe('lib/gstreamer-1.0')
    expect(
      real.files.filter((f) => f.path.startsWith('lib/gstreamer-1.0/'))
    ).toHaveLength(1)
    expect(KNOWN_FIX_OVERLAY_CATALOGUE[real.id]).toBe(real)
    expect(lookupKnownFixOverlay('__proto__')).toBeUndefined()
    expect(lookupKnownFixOverlay('constructor')).toBeUndefined()
  })
})
