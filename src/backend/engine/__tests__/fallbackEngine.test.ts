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
import { defined } from './defined'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

let mockTools = ''
const mockDownload = jest.fn()
const mockIsOnline = jest.fn()
// The injected connectivity slice; `mockIsOnline` is read at call time.
const onlineMonitor = { isOnline: () => mockIsOnline() as boolean }

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => {
  const actual = {
    extractFiles: async (
      _deps: unknown,
      {
        path,
        destination,
        strip
      }: {
        path: string
        destination: string
        strip: number
      }
    ) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
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
  createFallbackEngine,
  sha256OfFile,
  type FallbackDownloadProgress,
  type FallbackEngine
} from '../fallbackEngine'
import { ENGINE_PINS, type EnginePin } from '../enginePins'
import {
  callAllAbortControllers,
  hasAbortController
} from 'backend/utils/aborthandler/aborthandler'

let work = ''
let ensurePinnedEngine: FallbackEngine['ensurePinnedEngine']
let isPinnedEngineInstalled: FallbackEngine['isPinnedEngineInstalled']
let pinnedEnginePaths: FallbackEngine['pinnedEnginePaths']
let pinnedEngineRoot: FallbackEngine['pinnedEngineRoot']
let pruneUnpinnedEngines: FallbackEngine['pruneUnpinnedEngines']
let sweepStaleEngineTemps: FallbackEngine['sweepStaleEngineTemps']
// extractFiles is faked above, so the runner is never called; an empty script fails loudly if it is.
const runner = createScriptedRunner([])

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
  ;({
    ensurePinnedEngine,
    isPinnedEngineInstalled,
    pinnedEnginePaths,
    pinnedEngineRoot,
    pruneUnpinnedEngines,
    sweepStaleEngineTemps
  } = createFallbackEngine({ paths: { toolsPath: mockTools } }))
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
    runner,
    onlineMonitor,
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
  const r = await ensurePinnedEngine(pin, { runner, onlineMonitor })
  expect(r).toMatchObject({ ok: false, reason: 'hash-mismatch' })
  expect(existsSync(pinnedEnginePaths(pin).wineDir)).toBe(false)
  expect(leftovers()).toEqual([])
})

test('escaping symlink is rejected', async () => {
  const pin = await makePin({ escape: true })
  const r = await ensurePinnedEngine(pin, { runner, onlineMonitor })
  expect(r).toMatchObject({ ok: false, reason: 'extract-failed' })
  expect(existsSync(pinnedEnginePaths(pin).wineDir)).toBe(false)
  expect(leftovers()).toEqual([])
})

test('aborted signal leaves nothing', async () => {
  const pin = await makePin()
  const ac = new AbortController()
  ac.abort()
  const r = await ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: ac.signal
  })
  expect(r).toMatchObject({ ok: false, reason: 'aborted' })
  expect(leftovers()).toEqual([])
  expect(isPinnedEngineInstalled(pin)).toBe(false)
})

test('abort during verify resolves aborted and installs nothing', async () => {
  const pin = await makePin()
  const ac = new AbortController()
  const r = await ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: ac.signal,
    onProgress: (p) => {
      if (p.phase === 'verifying') ac.abort()
    }
  })
  expect(r).toMatchObject({ ok: false, reason: 'aborted' })
  expect(existsSync(pinnedEnginePaths(pin).wineDir)).toBe(false)
  expect(leftovers()).toEqual([])
})

test('abort during extract resolves aborted and installs nothing', async () => {
  const pin = await makePin()
  const ac = new AbortController()
  const r = await ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: ac.signal,
    onProgress: (p) => {
      if (p.phase === 'extracting') ac.abort()
    }
  })
  expect(r).toMatchObject({ ok: false, reason: 'aborted' })
  expect(existsSync(pinnedEnginePaths(pin).wineDir)).toBe(false)
  expect(isPinnedEngineInstalled(pin)).toBe(false)
  expect(leftovers()).toEqual([])
})

test('offline makes no download call', async () => {
  const pin = await makePin()
  mockIsOnline.mockReturnValue(false)
  const r = await ensurePinnedEngine(pin, { runner, onlineMonitor })
  expect(r).toMatchObject({ ok: false, reason: 'offline' })
  expect(mockDownload).not.toHaveBeenCalled()
})

test('concurrent calls share one download per artifact', async () => {
  const pin = await makePin()
  const [a, b] = await Promise.all([
    ensurePinnedEngine(pin, { runner, onlineMonitor }),
    ensurePinnedEngine(pin, { runner, onlineMonitor })
  ])
  expect(mockDownload).toHaveBeenCalledTimes(2)
  expect(a).toEqual(b)
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

/** Make downloadFile hang until its abortSignal fires (rejects like the real one). */
function hangingDownload() {
  const seen: AbortSignal[] = []
  mockDownload.mockImplementation(
    (a: { abortSignal?: AbortSignal }) =>
      new Promise<void>((_res, rej) => {
        if (a.abortSignal) seen.push(a.abortSignal)
        a.abortSignal?.addEventListener('abort', () =>
          rej(new Error('Download stopped'))
        )
      })
  )
  return seen
}
const tick = () => new Promise((r) => setImmediate(r))

test('abort controller is registered during download and released after', async () => {
  const pin = await makePin()
  const id = `steam-engine-download:${pin.id}`
  const p = ensurePinnedEngine(pin, { runner, onlineMonitor })
  expect(hasAbortController(id)).toBe(true)
  await p
  expect(hasAbortController(id)).toBe(false)
})

test('callAllAbortControllers aborts an in-flight download and cleans temp dirs', async () => {
  const pin = await makePin()
  const seen = hangingDownload()
  const p = ensurePinnedEngine(pin, { runner, onlineMonitor })
  await tick()
  expect(seen).toHaveLength(1)
  callAllAbortControllers()
  expect(defined(seen[0], 'seen[0]').aborted).toBe(true)
  await expect(p).resolves.toMatchObject({ ok: false, reason: 'aborted' })
  expect(leftovers()).toEqual([])
  expect(hasAbortController(`steam-engine-download:${pin.id}`)).toBe(false)
})

test('concurrent callers each receive every progress event over one download', async () => {
  const pin = await makePin()
  const a: string[] = []
  const b: string[] = []
  const [ra, rb] = await Promise.all([
    ensurePinnedEngine(pin, {
      runner,
      onlineMonitor,
      onProgress: (p) => a.push(p.phase)
    }),
    ensurePinnedEngine(pin, {
      runner,
      onlineMonitor,
      onProgress: (p) => b.push(p.phase)
    })
  ])
  expect(ra.ok && rb.ok).toBe(true)
  expect(mockDownload).toHaveBeenCalledTimes(2)
  expect(a.length).toBeGreaterThan(0)
  expect(b).toEqual(a)
})

test('one caller aborting does not abort the others', async () => {
  const pin = await makePin()
  const seen = hangingDownload()
  const acA = new AbortController()
  const pa = ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: acA.signal
  })
  const pb = ensurePinnedEngine(pin, { runner, onlineMonitor })
  await tick()
  acA.abort()
  await expect(pa).resolves.toMatchObject({ ok: false, reason: 'aborted' })
  expect(defined(seen[0], 'seen[0]').aborted).toBe(false)
  // let B finish: release the hung download normally
  await makePin()
  mockDownload.mockImplementation(async (x: { url: string; dest: string }) => {
    copyFileSync(
      join(work, x.url.endsWith('/w') ? 'w.tar.gz' : 'd.tar.gz'),
      join(x.dest, x.url.endsWith('/w') ? 'w.tar.gz' : 'd.tar.gz')
    )
  })
  callAllAbortControllers() // clean up the hung first download
  await pb
})

test('shared download aborts when every caller has aborted', async () => {
  const pin = await makePin()
  const seen = hangingDownload()
  const a = new AbortController()
  const b = new AbortController()
  const pa = ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: a.signal
  })
  const pb = ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: b.signal
  })
  await tick()
  a.abort()
  expect(defined(seen[0], 'seen[0]').aborted).toBe(false)
  b.abort()
  expect(defined(seen[0], 'seen[0]').aborted).toBe(true)
  await expect(pa).resolves.toMatchObject({ reason: 'aborted' })
  await expect(pb).resolves.toMatchObject({ reason: 'aborted' })
  expect(leftovers()).toEqual([])
})

test('a single caller aborting its signal aborts the download', async () => {
  const pin = await makePin()
  const seen = hangingDownload()
  const ac = new AbortController()
  const p = ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: ac.signal
  })
  await tick()
  ac.abort()
  expect(defined(seen[0], 'seen[0]').aborted).toBe(true)
  await expect(p).resolves.toMatchObject({ ok: false, reason: 'aborted' })
})

test('shutdown wins over live caller signals', async () => {
  const pin = await makePin()
  hangingDownload()
  const a = new AbortController()
  const b = new AbortController()
  const pa = ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: a.signal
  })
  const pb = ensurePinnedEngine(pin, {
    runner,
    onlineMonitor,
    signal: b.signal
  })
  await tick()
  callAllAbortControllers()
  await expect(pa).resolves.toMatchObject({ ok: false, reason: 'aborted' })
  await expect(pb).resolves.toMatchObject({ ok: false, reason: 'aborted' })
})

test('prune removes stale .tmp-* dirs when idle, keeps them during an install', async () => {
  const root = pinnedEngineRoot()
  mkdirSync(join(root, '.tmp-wine-abc'), { recursive: true })
  pruneUnpinnedEngines()
  expect(existsSync(join(root, '.tmp-wine-abc'))).toBe(false)

  const pin = await makePin()
  const seen = hangingDownload()
  const p = ensurePinnedEngine(pin, { runner, onlineMonitor })
  await tick()
  expect(seen).toHaveLength(1)
  mkdirSync(join(root, '.tmp-other-1'))
  pruneUnpinnedEngines()
  expect(existsSync(join(root, '.tmp-other-1'))).toBe(true)
  expect(leftovers().length).toBeGreaterThanOrEqual(2)
  callAllAbortControllers()
  await p
})

describe('sweepStaleEngineTemps', () => {
  const logger =
    jest.requireMock<typeof import('backend/logger')>('backend/logger')

  it('G20: removes only .tmp-* dirs under the root', () => {
    const root = pinnedEngineRoot()
    mkdirSync(join(root, '.tmp-wine-abc/nested'), { recursive: true })
    writeFileSync(join(root, '.tmp-wine-abc/nested/f'), 'x')
    mkdirSync(join(root, '.tmp-dxvk-def'))
    mkdirSync(join(root, 'wine-staging-11.20'))
    mkdirSync(join(root, 'dxvk-macOS-1.10.3'))
    mkdirSync(join(root, 'other'))
    writeFileSync(join(root, '.tmp-note'), 'n')
    sweepStaleEngineTemps()
    expect(existsSync(join(root, '.tmp-wine-abc'))).toBe(false)
    expect(existsSync(join(root, '.tmp-dxvk-def'))).toBe(false)
    expect(existsSync(join(root, '.tmp-note'))).toBe(true)
    expect(existsSync(join(root, 'other'))).toBe(true)
    expect(existsSync(join(root, 'wine-staging-11.20'))).toBe(true)
    expect(existsSync(join(root, 'dxvk-macOS-1.10.3'))).toBe(true)
  })

  it('G20: does not follow a .tmp-* symlink', () => {
    const root = pinnedEngineRoot()
    const outside = join(work, 'outside')
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'keep'), 'k')
    mkdirSync(root, { recursive: true })
    symlinkSync(outside, join(root, '.tmp-link'))
    sweepStaleEngineTemps()
    expect(existsSync(join(outside, 'keep'))).toBe(true)
  })

  it('G20: missing root is a silent no-op', () => {
    ;(logger.logWarning as jest.Mock).mockClear()
    const root = pinnedEngineRoot()
    rmSync(root, { recursive: true, force: true })
    sweepStaleEngineTemps()
    expect(existsSync(root)).toBe(false)
    expect(logger.logWarning).not.toHaveBeenCalled()
  })

  it('G20: removes nothing while an artifact install is in flight', async () => {
    const root = pinnedEngineRoot()
    const pin = await makePin()
    hangingDownload()
    const p = ensurePinnedEngine(pin, { runner, onlineMonitor })
    await tick()
    mkdirSync(join(root, '.tmp-other-9'))
    sweepStaleEngineTemps()
    expect(existsSync(join(root, '.tmp-other-9'))).toBe(true)
    callAllAbortControllers()
    await p
  })

  it('G20: an rmSync failure warns once and does not throw', () => {
    const root = pinnedEngineRoot()
    mkdirSync(join(root, '.tmp-wine-bad'), { recursive: true })
    ;(logger.logWarning as jest.Mock).mockClear()
    const spy = jest
      .spyOn(jest.requireActual<typeof import('fs')>('fs'), 'rmSync')
      .mockImplementationOnce(() => {
        throw new Error('boom')
      })
    expect(() => sweepStaleEngineTemps()).not.toThrow()
    spy.mockRestore()
    expect(logger.logWarning).toHaveBeenCalledTimes(1)
  })

  it('G20: logs one info line naming the removed count', () => {
    const root = pinnedEngineRoot()
    mkdirSync(join(root, '.tmp-a'), { recursive: true })
    mkdirSync(join(root, '.tmp-b'))
    ;(logger.logInfo as jest.Mock).mockClear()
    sweepStaleEngineTemps()
    expect(logger.logInfo).toHaveBeenCalledTimes(1)
    expect((logger.logInfo as jest.Mock).mock.calls[0][0]).toContain('2 stale')
  })
})
