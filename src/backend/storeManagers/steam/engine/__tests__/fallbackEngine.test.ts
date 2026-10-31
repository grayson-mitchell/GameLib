/**
 * Pinned fallback engine download/verify/extract/retention (phase 59-03).
 * Real tar + real extractFiles; downloadFile is faked to copy a fixture.
 */
import { execFileSync } from 'child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let mockTools = ''
const mockDownload = jest.fn()
const mockIsOnline = jest.fn()

jest.mock('backend/constants/paths', () => ({
  get toolsPath() {
    return mockTools
  }
}))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/online_monitor', () => ({
  isOnline: () => mockIsOnline()
}))
jest.mock('backend/utils', () => {
  const actual = {
    extractFiles: async ({
      path,
      destination,
      strip
    }: {
      path: string
      destination: string
      strip: number
    }) => {
      try {
        require('child_process').execFileSync('tar', [
          '-xf',
          path,
          '-C',
          destination,
          `--strip-components=${strip}`
        ])
        return { status: 'done' }
      } catch {
        return { status: 'error' }
      }
    }
  }
  return {
    downloadFile: (a: unknown) => mockDownload(a),
    calculateEta: () => '1m',
    extractFiles: actual.extractFiles
  }
})

import {
  ensurePinnedEngine,
  isPinnedEngineInstalled,
  pinnedEnginePaths,
  pinnedEngineRoot,
  pruneUnpinnedEngines,
  sha256OfFile,
  type FallbackDownloadProgress
} from '../fallbackEngine'
import { ENGINE_PINS, type EnginePin } from '../enginePins'

let work = ''

function tar(dir: string, name: string, flag: string): string {
  const out = join(work, name)
  execFileSync('tar', [flag, out, '-C', work, dir])
  return out
}

async function makePin(opts: { badHash?: boolean; escape?: boolean } = {}) {
  const w = join(work, 'wsrc', 'top')
  mkdirSync(join(w, 'Contents/Resources/wine/bin'), { recursive: true })
  writeFileSync(join(w, 'Contents/Resources/wine/bin/wine'), 'w')
  writeFileSync(join(w, 'Contents/Resources/wine/bin/wineserver'), 'ws')
  if (opts.escape) symlinkSync('/etc', join(w, 'evil'))
  const d = join(work, 'dsrc', 'top')
  mkdirSync(join(d, 'x32'), { recursive: true })
  mkdirSync(join(d, 'x64'), { recursive: true })
  writeFileSync(join(d, 'x32/a.dll'), 'a')
  const wa = join(work, 'w.tar.gz')
  const da = join(work, 'd.tar.gz')
  execFileSync('tar', ['-czf', wa, '-C', join(work, 'wsrc'), 'top'])
  execFileSync('tar', ['-czf', da, '-C', join(work, 'dsrc'), 'top'])
  const wsha = await sha256OfFile(wa)
  const dsha = await sha256OfFile(da)
  const pin: EnginePin = {
    id: 'test-pin',
    label: 't',
    wine: {
      version: '1',
      url: 'https://x/w',
      size: statSync(wa).size,
      sha256: opts.badHash ? '0'.repeat(64) : wsha,
      archiveName: 'w.tar.gz'
    },
    dxvk: {
      version: 'v1',
      url: 'https://x/d',
      size: statSync(da).size,
      sha256: dsha,
      archiveName: 'd.tar.gz'
    }
  }
  mockDownload.mockImplementation(
    async (a: {
      url: string
      dest: string
      progressCallback?: (b: number, s: number, p: number) => void
    }) => {
      a.progressCallback?.(1, 1, 50)
      copyFileSync(
        a.url.endsWith('/w') ? wa : da,
        join(a.dest, a.url.endsWith('/w') ? 'w.tar.gz' : 'd.tar.gz')
      )
    }
  )
  return pin
}

function leftovers(): string[] {
  const root = pinnedEngineRoot()
  return existsSync(root)
    ? readdirSync(root).filter((n) => n.startsWith('.tmp-'))
    : []
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'gl-fb-'))
  mockTools = join(work, 'tools')
  mockDownload.mockReset()
  mockIsOnline.mockReset().mockReturnValue(true)
})
afterEach(() => rmSync(work, { recursive: true, force: true }))

test('import does no work', () => {
  expect(mockDownload).not.toHaveBeenCalled()
  jest.useFakeTimers()
  expect(jest.getTimerCount()).toBe(0)
  jest.useRealTimers()
})

test('pinnedEnginePaths layout', () => {
  const p = pinnedEnginePaths(ENGINE_PINS.current)
  const root = join(mockTools, 'steam-engines')
  expect(p.wineDir).toBe(join(root, 'wine-staging-11.20'))
  expect(p.wineBin).toBe(join(p.wineDir, 'Contents/Resources/wine/bin/wine'))
  expect(p.wineserverBin).toBe(
    join(p.wineDir, 'Contents/Resources/wine/bin/wineserver')
  )
  expect(p.dxvkDir).toBe(join(root, 'dxvk-macOS-v1.10.3-20230507-repack'))
})

test('installed only after ensure writes markers', async () => {
  const pin = await makePin()
  expect(isPinnedEngineInstalled(pin)).toBe(false)
  const phases: string[] = []
  const r = await ensurePinnedEngine(pin, {
    onProgress: (p: FallbackDownloadProgress) => {
      if (phases[phases.length - 1] !== p.phase) phases.push(p.phase)
    }
  })
  expect(r.ok).toBe(true)
  expect(isPinnedEngineInstalled(pin)).toBe(true)
  expect(phases).toEqual([
    'downloading',
    'verifying',
    'extracting',
    'downloading',
    'verifying',
    'extracting'
  ])
  expect(leftovers()).toEqual([])
})

test('hash mismatch leaves nothing', async () => {
  const pin = await makePin({ badHash: true })
  const r = await ensurePinnedEngine(pin)
  expect(r).toMatchObject({ ok: false, reason: 'hash-mismatch' })
  expect(existsSync(pinnedEnginePaths(pin).wineDir)).toBe(false)
  expect(leftovers()).toEqual([])
})

test('escaping symlink is rejected', async () => {
  const pin = await makePin({ escape: true })
  const r = await ensurePinnedEngine(pin)
  expect(r).toMatchObject({ ok: false, reason: 'extract-failed' })
  expect(existsSync(pinnedEnginePaths(pin).wineDir)).toBe(false)
  expect(leftovers()).toEqual([])
})

test('aborted signal leaves nothing', async () => {
  const pin = await makePin()
  const ac = new AbortController()
  ac.abort()
  const r = await ensurePinnedEngine(pin, { signal: ac.signal })
  expect(r).toMatchObject({ ok: false, reason: 'aborted' })
  expect(leftovers()).toEqual([])
  expect(isPinnedEngineInstalled(pin)).toBe(false)
})

test('offline makes no download call', async () => {
  const pin = await makePin()
  mockIsOnline.mockReturnValue(false)
  const r = await ensurePinnedEngine(pin)
  expect(r).toMatchObject({ ok: false, reason: 'offline' })
  expect(mockDownload).not.toHaveBeenCalled()
})

test('concurrent calls share one download per artifact', async () => {
  const pin = await makePin()
  const [a, b] = await Promise.all([
    ensurePinnedEngine(pin),
    ensurePinnedEngine(pin)
  ])
  expect(mockDownload).toHaveBeenCalledTimes(2)
  expect(a).toBe(b)
  expect(a.ok).toBe(true)
})

test('prune keeps pinned dirs and removes others, only inside root', () => {
  const root = pinnedEngineRoot()
  const keepW = join(root, ENGINE_PINS.current.id)
  const keepD = join(root, `dxvk-macOS-${ENGINE_PINS.current.dxvk.version}`)
  for (const d of [
    keepW,
    keepD,
    join(root, 'wine-staging-9.0'),
    join(root, 'dxvk-macOS-old')
  ])
    mkdirSync(d, { recursive: true })
  const outside = join(work, 'outside')
  mkdirSync(outside)
  symlinkSync(outside, join(root, 'link'))
  pruneUnpinnedEngines()
  expect(existsSync(keepW)).toBe(true)
  expect(existsSync(keepD)).toBe(true)
  expect(existsSync(join(root, 'wine-staging-9.0'))).toBe(false)
  expect(existsSync(join(root, 'dxvk-macOS-old'))).toBe(false)
  expect(existsSync(outside)).toBe(true)
})
