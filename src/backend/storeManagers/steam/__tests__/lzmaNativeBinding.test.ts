// Phase 23.1 Plan 03: coverage for lzmaNativeBinding.ts -- the SEA-aware
// `node-gyp-build` replacement aliased in at esbuild bundle time.
//
// lzmaNativeBinding.ts deliberately has NO ECMAScript `export` (see its own
// file header -- `export =` fails TS1203 under this repo's `"module":
// "esnext"` tsconfig, and any ES `export` keyword makes esbuild ESM-interop-
// wrap the bundled alias target, breaking the "callable module.exports"
// shape lzma-native's own `require('node-gyp-build')(__dirname)` call
// needs). This suite therefore reaches it the same way
// decompressPool.test.ts / decompressPool.ts's own resolveWorkerSpec()
// reaches `node:sea` -- a guarded runtime `require()` with a type cast, not
// an ES `import`.

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import {
  LZMA_NATIVE_ASSET_KEY,
  LZMA_NATIVE_DLL_ASSET_KEY
} from '../../../../../meta/buildSidecarSea'

type LzmaNativeBindingResolver = {
  (dir: string): unknown
  LZMA_NATIVE_SEA_ASSET_KEY: string
  LZMA_NATIVE_ADDON_FILENAME: string
  LZMA_NATIVE_DLL_SEA_ASSET_KEY: string
  LZMA_NATIVE_WIN32_DLL_FILENAME: string
  LZMA_NATIVE_EXTRACTION_RECORD_KEY: string
  nativeExtractDirPrefix: () => string
  sweepStaleExtractDirs: (root?: string) => {
    examined: number
    removed: number
  }
  LZMA_NATIVE_STALE_SWEEP_MAX_DIRS: number
  LZMA_NATIVE_STALE_SWEEP_RECORD_KEY: string
}

// The REAL host platform, captured before any test pins process.platform.
const HOST_PLATFORM = process.platform
const REAL_PLATFORM_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  process,
  'platform'
) as PropertyDescriptor

const MODULE_PATH = '../depot/lzmaNativeBinding'

function loadFresh(): LzmaNativeBindingResolver {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(MODULE_PATH) as LzmaNativeBindingResolver
}

// Pins process.platform for one test; afterEach restores the saved
// descriptor. The binding reads process.platform at CALL time, so pinning
// after the module is loaded is sufficient.
function pinPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
}

function extractionRecordSymbol(): symbol {
  return Symbol.for(loadFresh().LZMA_NATIVE_EXTRACTION_RECORD_KEY)
}

function readExtractionRecord(): unknown {
  return (globalThis as unknown as Record<symbol, unknown>)[
    extractionRecordSymbol()
  ]
}

function clearExtractionRecord(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[
    extractionRecordSymbol()
  ]
}

// 261012-82w: the per-isolate stale-sweep record, same registry discipline.
function sweepRecordSymbol(): symbol {
  return Symbol.for(loadFresh().LZMA_NATIVE_STALE_SWEEP_RECORD_KEY)
}

function readSweepRecord(): unknown {
  return (globalThis as unknown as Record<symbol, unknown>)[sweepRecordSymbol()]
}

function clearSweepRecord(): void {
  delete (globalThis as unknown as Record<symbol, unknown>)[sweepRecordSymbol()]
}

// 261012-82w fixtures. Pids no real test run could own; every probe of them
// is mocked.
const DEAD_PID = 999991
const ALIVE_PID = 999992
const EPERM_PID = 999993

function extractName(pid: number, suffix = 'AbCdEf'): string {
  return `gamelib-lzma-native-${pid}-${suffix}`
}

function killError(code: string): Error {
  return Object.assign(new Error(`kill ${code}`), { code })
}

const DIR_STATS = { isDirectory: () => true, isSymbolicLink: () => false }

const REAL_LZMA_NATIVE_DIR = join('some', 'root', 'node_modules', 'lzma-native')
const NOT_LZMA_NATIVE_DIR = join(
  'some',
  'root',
  'node_modules',
  'not-lzma-native'
)

// Phase 23.1 plan 05 (coordinator-directed fix, live-hardware finding
// 2026-08-18): the `dir`-based throw-gate this describe block used to test
// was REMOVED. A real packaged SEA install (Planetfall, real gamelib.log)
// reproduced exactly what this file's own header comment had already
// predicted from the spike: `dir` collapses to `"."` once genuinely
// bundled, has NO 'lzma-native' segment, and the throw-gate rejected the
// LEGITIMATE call before it ever reached the SEA-asset-loading branch --
// Task 1's byte-offset proof that the addon shipped correctly inside the
// binary was true and irrelevant, because this guard never let execution
// reach it. A real dev-mode build separately showed `dir` collapsing to a
// DIFFERENT, also-wrong value (the worker bundle's own output directory) --
// confirming `dir` carries no usable identity information in EITHER build,
// not a single fixable edge case. The T-23.1-03-02 security property this
// guard existed for is not gone -- it moved to build time
// (`assertNodeGypBuildSingleConsumer()`, covered by
// `meta/__tests__/esbuildWorkerBundleShared.test.ts`, including a
// known-bad-input case). These tests now assert the actual current
// contract: `dir`'s content has NO effect on the outcome.
describe('lzmaNativeBinding no longer gates on dir (Phase 23.1 plan 05)', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('node:sea')
    jest.restoreAllMocks()
  })

  it('succeeds identically for a directory that does NOT belong to lzma-native -- dir is not an identity gate', () => {
    const lzmaNativeBinding = loadFresh()
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getRawAsset: () => {
        throw new Error('should not be called in the dev branch')
      }
    }))
    jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)
    expect(() => lzmaNativeBinding(NOT_LZMA_NATIVE_DIR)).not.toThrow()
  })

  it('succeeds for the exact degenerate values a real bundled call site produces ("." and a real build output directory)', () => {
    const lzmaNativeBinding = loadFresh()
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getRawAsset: () => {
        throw new Error('should not be called in the dev branch')
      }
    }))
    jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)
    // "." -- the real eval'd SEA worker's collapsed __dirname
    expect(() => lzmaNativeBinding('.')).not.toThrow()
  })

  it('does not depend on dir formatting (trailing separator / Windows-style backslash path) -- retained as a general robustness check', () => {
    const lzmaNativeBinding = loadFresh()
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getRawAsset: () => {
        throw new Error('should not be called in the dev branch')
      }
    }))
    jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)
    expect(() =>
      lzmaNativeBinding(`${REAL_LZMA_NATIVE_DIR}${join('/')}`)
    ).not.toThrow()
    jest.resetModules()
    const lzmaNativeBinding2 = loadFresh()
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getRawAsset: () => {
        throw new Error('should not be called in the dev branch')
      }
    }))
    jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)
    const windowsPath = 'C:\\some\\root\\node_modules\\lzma-native'
    expect(() => lzmaNativeBinding2(windowsPath)).not.toThrow()
  })
})

describe('lzmaNativeBinding SEA branch', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', REAL_PLATFORM_DESCRIPTOR)
    clearExtractionRecord()
    clearSweepRecord()
    jest.resetModules()
    jest.dontMock('node:sea')
    jest.restoreAllMocks()
  })

  // Shared setup: SEA mocked on, the fs calls spied as no-ops through
  // `require()`. Spying on the ESM namespace binding
  // (`import * as nodeFs from 'node:fs'`) throws "Cannot redefine property"
  // under this repo's ts-jest CJS transform (confirmed by hand); `require()`
  // returns the mutable CJS module object jest.spyOn can patch. existsSync is
  // deliberately NOT spied: jest's own module resolution may read it.
  const FAKE_DIR = join(tmpdir(), 'gamelib-lzma-native-1234-AbCdEf')
  function setupSea(
    getRawAsset: (key: string) => ArrayBuffer = jest.fn(
      () => new ArrayBuffer(4)
    )
  ) {
    const getAssetSpy = jest.fn()
    jest.doMock('node:sea', () => ({
      isSea: () => true,
      getRawAsset,
      getAsset: getAssetSpy
    }))

    let lzmaNativeBinding: LzmaNativeBindingResolver
    jest.isolateModules(() => {
      lzmaNativeBinding = loadFresh()
    })

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
    const nodeFs = require('node:fs')
    const mkdtempSyncSpy = jest
      .spyOn(nodeFs, 'mkdtempSync')
      .mockImplementation(() => FAKE_DIR)
    const chmodSyncSpy = jest
      .spyOn(nodeFs, 'chmodSync')
      .mockImplementation(() => undefined)
    const writeFileSyncSpy = jest
      .spyOn(nodeFs, 'writeFileSync')
      .mockImplementation(() => undefined)
    const rmSyncSpy = jest
      .spyOn(nodeFs, 'rmSync')
      .mockImplementation(() => undefined)
    // 261012-82w: os.tmpdir() is NOT redirected under jest, so without this
    // stub the win32-pinned SEA-branch tests would sweep the operator's real
    // %TEMP%. An empty listing makes the sweep a no-op.
    const readdirSyncSpy = jest
      .spyOn(nodeFs, 'readdirSync')
      .mockImplementation(() => [])
    const dlopenSpy = jest
      .spyOn(process, 'dlopen')
      .mockImplementation(() => undefined)

    return {
      lzmaNativeBinding: lzmaNativeBinding!,
      getRawAsset,
      getAssetSpy,
      mkdtempSyncSpy,
      chmodSyncSpy,
      writeFileSyncSpy,
      rmSyncSpy,
      readdirSyncSpy,
      dlopenSpy
    }
  }

  it('R1: on win32 reads both assets, makes ONE private dir, writes DLL then addon into it, then dlopens the addon from it', () => {
    pinPlatform('win32')
    const s = setupSea()

    s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)

    expect(s.getRawAsset).toHaveBeenCalledWith(
      s.lzmaNativeBinding.LZMA_NATIVE_SEA_ASSET_KEY
    )
    expect(s.getRawAsset).toHaveBeenCalledWith(
      s.lzmaNativeBinding.LZMA_NATIVE_DLL_SEA_ASSET_KEY
    )
    expect(s.getAssetSpy).not.toHaveBeenCalled()
    expect(s.mkdtempSyncSpy).toHaveBeenCalledTimes(1)
    expect(s.mkdtempSyncSpy).toHaveBeenCalledWith(
      s.lzmaNativeBinding.nativeExtractDirPrefix()
    )
    expect(s.chmodSyncSpy).toHaveBeenCalledWith(FAKE_DIR, 0o700)

    expect(s.writeFileSyncSpy).toHaveBeenCalledTimes(2)
    const [first, second] = s.writeFileSyncSpy.mock.calls
    expect(dirname(first[0] as string)).toBe(FAKE_DIR)
    expect(dirname(second[0] as string)).toBe(FAKE_DIR)
    expect(basename(first[0] as string)).toBe('liblzma.dll')
    expect(basename(second[0] as string)).toBe(
      s.lzmaNativeBinding.LZMA_NATIVE_ADDON_FILENAME
    )
    expect((first[2] as { mode: number }).mode).toBe(0o600)
    expect((second[2] as { mode: number }).mode).toBe(0o600)

    expect(s.dlopenSpy).toHaveBeenCalledTimes(1)
    expect(s.dlopenSpy.mock.calls[0][1]).toBe(
      join(FAKE_DIR, s.lzmaNativeBinding.LZMA_NATIVE_ADDON_FILENAME)
    )
    const dlopenOrder = s.dlopenSpy.mock.invocationCallOrder[0]
    for (const order of s.writeFileSyncSpy.mock.invocationCallOrder) {
      expect(order).toBeLessThan(dlopenOrder)
    }
  })

  it('R2: on linux the DLL asset is never read; only the addon is written, into the mkdtemp dir', () => {
    pinPlatform('linux')
    const s = setupSea()

    s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)

    expect(s.getRawAsset).not.toHaveBeenCalledWith(
      s.lzmaNativeBinding.LZMA_NATIVE_DLL_SEA_ASSET_KEY
    )
    expect(s.writeFileSyncSpy).toHaveBeenCalledTimes(1)
    const target = s.writeFileSyncSpy.mock.calls[0][0] as string
    expect(dirname(target)).toBe(FAKE_DIR)
    expect(basename(target)).toBe(
      s.lzmaNativeBinding.LZMA_NATIVE_ADDON_FILENAME
    )
    expect(s.dlopenSpy.mock.calls[0][1]).toBe(target)
  })

  it('R3: on success removes the extraction DIR exactly once, recursively, AFTER process.dlopen', () => {
    pinPlatform('win32')
    const s = setupSea()

    s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)

    expect(s.rmSyncSpy).toHaveBeenCalledTimes(1)
    expect(s.rmSyncSpy).toHaveBeenCalledWith(FAKE_DIR, {
      recursive: true,
      force: true
    })
    expect(s.rmSyncSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
      s.dlopenSpy.mock.invocationCallOrder[0]
    )
  })

  it('R3: removes the dir and rethrows the ORIGINAL error when process.dlopen throws', () => {
    pinPlatform('win32')
    const s = setupSea()
    s.dlopenSpy.mockImplementation(() => {
      throw new Error('dlopen boom')
    })

    expect(() => s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)).toThrow(
      'dlopen boom'
    )

    expect(s.rmSyncSpy).toHaveBeenCalledTimes(1)
    expect(s.rmSyncSpy.mock.calls[0][0]).toBe(FAKE_DIR)
  })

  it('R3: a cleanup failure never masks the dlopen error', () => {
    pinPlatform('win32')
    const s = setupSea()
    s.dlopenSpy.mockImplementation(() => {
      throw new Error('dlopen boom')
    })
    s.rmSyncSpy.mockImplementation(() => {
      throw new Error('EBUSY')
    })

    expect(() => s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)).toThrow(
      'dlopen boom'
    )
    expect(s.rmSyncSpy).toHaveBeenCalledTimes(1)
  })

  it('R3: an EBUSY on the success path (Windows cannot unlink a mapped image) is swallowed and the binding is still returned', () => {
    pinPlatform('win32')
    const s = setupSea()
    s.dlopenSpy.mockImplementation((mod) => {
      ;(mod as { exports: unknown }).exports = { marker: 'binding' }
    })
    s.rmSyncSpy.mockImplementation(() => {
      throw new Error('EBUSY')
    })

    expect(s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)).toEqual({
      marker: 'binding'
    })
  })

  it('R4: records { dir, leftover: false } when the removal succeeds', () => {
    pinPlatform('win32')
    const s = setupSea()
    s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)
    expect(readExtractionRecord()).toEqual({ dir: FAKE_DIR, leftover: false })
  })

  it('R4: records { dir, leftover: true } when the removal throws', () => {
    pinPlatform('win32')
    const s = setupSea()
    s.rmSyncSpy.mockImplementation(() => {
      throw new Error('EBUSY')
    })
    s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)
    expect(readExtractionRecord()).toEqual({ dir: FAKE_DIR, leftover: true })
  })

  it('R5: a missing DLL asset on win32 throws BEFORE any directory is created', () => {
    pinPlatform('win32')
    let dllKey = ''
    const getRawAsset = jest.fn((key: string) => {
      if (key === dllKey) {
        throw new Error('no such asset')
      }
      return new ArrayBuffer(4)
    })
    const s = setupSea(getRawAsset)
    dllKey = s.lzmaNativeBinding.LZMA_NATIVE_DLL_SEA_ASSET_KEY

    expect(() => s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)).toThrow(
      'no such asset'
    )
    expect(s.mkdtempSyncSpy).not.toHaveBeenCalled()
    expect(s.writeFileSyncSpy).not.toHaveBeenCalled()
    expect(s.dlopenSpy).not.toHaveBeenCalled()
  })

  describe('stale-extraction sweep wiring (261012-82w)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see setupSea's comment
    const fsObj = () => require('node:fs')

    it('W1: on win32 sweeps os.tmpdir() exactly once, BEFORE mkdtempSync, and records { examined: 0, removed: 0 }', () => {
      pinPlatform('win32')
      const s = setupSea()

      s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)

      expect(s.readdirSyncSpy).toHaveBeenCalledTimes(1)
      expect(s.readdirSyncSpy).toHaveBeenCalledWith(tmpdir())
      expect(s.readdirSyncSpy.mock.invocationCallOrder[0]).toBeLessThan(
        s.mkdtempSyncSpy.mock.invocationCallOrder[0]
      )
      expect(readSweepRecord()).toEqual({ examined: 0, removed: 0 })
    })

    it('W2: on win32 removes a dead-pid stale dir before mkdtempSync, then the unchanged finally removes the fresh dir; dlopen still runs once', () => {
      pinPlatform('win32')
      const s = setupSea()
      const stale = extractName(DEAD_PID)
      s.readdirSyncSpy.mockImplementation(() => [stale])
      jest.spyOn(fsObj(), 'lstatSync').mockImplementation(() => DIR_STATS)
      jest.spyOn(process, 'kill').mockImplementation((pid: number) => {
        if (pid === DEAD_PID) {
          throw killError('ESRCH')
        }
        return true
      })

      s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)

      expect(s.rmSyncSpy).toHaveBeenCalledTimes(2)
      expect(s.rmSyncSpy.mock.calls[0][0]).toBe(join(tmpdir(), stale))
      expect(s.rmSyncSpy.mock.calls[0][1]).toEqual({
        recursive: true,
        force: true
      })
      expect(s.rmSyncSpy.mock.invocationCallOrder[0]).toBeLessThan(
        s.mkdtempSyncSpy.mock.invocationCallOrder[0]
      )
      expect(s.rmSyncSpy.mock.calls[1][0]).toBe(FAKE_DIR)
      expect(s.dlopenSpy).toHaveBeenCalledTimes(1)
      expect(readSweepRecord()).toEqual({ examined: 1, removed: 1 })
    })

    it('W3: on linux never sweeps and records nothing', () => {
      pinPlatform('linux')
      const s = setupSea()

      s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)

      expect(s.readdirSyncSpy).not.toHaveBeenCalled()
      expect(readSweepRecord()).toBeUndefined()
    })

    it('W4: on win32 a throwing readdirSync never stops write, dlopen or the returned binding', () => {
      pinPlatform('win32')
      const s = setupSea()
      s.readdirSyncSpy.mockImplementation(() => {
        throw new Error('EACCES')
      })
      s.dlopenSpy.mockImplementation((mod) => {
        ;(mod as { exports: unknown }).exports = { marker: 'binding' }
      })

      expect(s.lzmaNativeBinding(REAL_LZMA_NATIVE_DIR)).toEqual({
        marker: 'binding'
      })
      expect(s.writeFileSyncSpy).toHaveBeenCalledTimes(2)
      expect(s.dlopenSpy).toHaveBeenCalledTimes(1)
      expect(readSweepRecord()).toEqual({ examined: 0, removed: 0 })
    })
  })

  // R6: REAL filesystem, no fs spies. dlopen is stubbed by an implementation
  // that looks at what is actually on disk at the moment the addon would be
  // loaded -- the property the Windows import resolution depends on.
  describe.each([
    ['win32', ['liblzma.dll', 'node.napi.node']],
    ['linux', ['node.napi.node']]
  ] as const)(
    'R6 real filesystem round trip (platform pinned %s)',
    (platform, expected) => {
      it('has exactly the expected files in one private tmpdir child at dlopen time, and leaves nothing behind', () => {
        jest.doMock('node:sea', () => ({
          isSea: () => true,
          getRawAsset: () => new ArrayBuffer(8)
        }))
        let lzmaNativeBinding: LzmaNativeBindingResolver
        jest.isolateModules(() => {
          lzmaNativeBinding = loadFresh()
        })
        pinPlatform(platform)

        // 261012-82w: hide the REAL temp root from the sweep only (it would
        // otherwise delete dead-pid dirs a real run needs as its fixture).
        // Every other path delegates to the real readdirSync, so the
        // dlopen mock below still lists the real extraction dir.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodeFs = require('node:fs')
        const realReaddirSync = nodeFs.readdirSync as (
          ...args: unknown[]
        ) => unknown
        jest
          .spyOn(nodeFs, 'readdirSync')
          .mockImplementation((...args: unknown[]) =>
            args[0] === tmpdir() ? [] : realReaddirSync(...args)
          )

        let seenDir = ''
        let listing: string[] = []
        let mode: number | undefined
        jest.spyOn(process, 'dlopen').mockImplementation((_mod, path) => {
          seenDir = dirname(path)
          listing = readdirSync(seenDir).sort()
          if (HOST_PLATFORM !== 'win32') {
            mode = statSync(seenDir).mode & 0o777
          }
        })

        try {
          lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)

          expect(listing).toEqual([...expected])
          expect(dirname(seenDir)).toBe(tmpdir())
          expect(basename(seenDir).startsWith('gamelib-lzma-native-')).toBe(
            true
          )
          if (HOST_PLATFORM !== 'win32') {
            expect(mode).toBe(0o700)
          }
          expect(existsSync(seenDir)).toBe(false)
          expect(readExtractionRecord()).toEqual({
            dir: seenDir,
            leftover: false
          })
          expect(readSweepRecord()).toEqual(
            platform === 'win32' ? { examined: 0, removed: 0 } : undefined
          )
        } finally {
          if (seenDir) {
            rmSync(seenDir, { recursive: true, force: true })
          }
        }
      })
    }
  )
})

describe('lzmaNativeBinding dev branch', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('node:sea')
    jest.restoreAllMocks()
  })

  it('calls process.dlopen with a path containing prebuilds and platform-arch, and never getRawAsset', () => {
    const getRawAsset = jest.fn()
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getRawAsset
    }))

    let lzmaNativeBinding: LzmaNativeBindingResolver
    jest.isolateModules(() => {
      lzmaNativeBinding = loadFresh()
    })

    const dlopenSpy = jest
      .spyOn(process, 'dlopen')
      .mockImplementation(() => undefined)

    lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)

    expect(dlopenSpy).toHaveBeenCalledTimes(1)
    const dlopenPath = dlopenSpy.mock.calls[0][1]
    expect(dlopenPath).toContain('prebuilds')
    expect(dlopenPath).toContain(`${process.platform}-${process.arch}`)
    expect(getRawAsset).not.toHaveBeenCalled()
  })

  it('takes the dev branch when require("node:sea") throws', () => {
    jest.doMock('node:sea', () => {
      throw new Error('node:sea unavailable')
    })

    let lzmaNativeBinding: LzmaNativeBindingResolver
    jest.isolateModules(() => {
      lzmaNativeBinding = loadFresh()
    })

    const dlopenSpy = jest
      .spyOn(process, 'dlopen')
      .mockImplementation(() => undefined)

    lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)

    expect(dlopenSpy).toHaveBeenCalledTimes(1)
    const dlopenPath = dlopenSpy.mock.calls[0][1]
    expect(dlopenPath).toContain('prebuilds')
  })
})

describe('lzmaNativeBinding memoization', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('node:sea')
    jest.restoreAllMocks()
  })

  it('two calls in the same process return the same binding object without a second dlopen', () => {
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getRawAsset: jest.fn()
    }))

    let lzmaNativeBinding: LzmaNativeBindingResolver
    jest.isolateModules(() => {
      lzmaNativeBinding = loadFresh()
    })

    const dlopenSpy = jest
      .spyOn(process, 'dlopen')
      .mockImplementation((mod) => {
        ;(mod as { exports: unknown }).exports = { marker: 'binding' }
      })

    const first = lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)
    const second = lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)

    expect(second).toBe(first)
    expect(dlopenSpy).toHaveBeenCalledTimes(1)
  })
})

describe('lzmaNativeBinding.sweepStaleExtractDirs (261012-82w)', () => {
  const ROOT = join(tmpdir(), 'gamelib-82w-fake-root')
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see the SEA branch's comment on spying through require()
  const fsObj = () => require('node:fs')

  afterEach(() => {
    jest.useRealTimers()
    jest.resetModules()
    jest.restoreAllMocks()
  })

  // Loads the module, then spies fs + process.kill. `kill` throws an error
  // (or a non-Error value) to simulate a failed probe, or returns to let the
  // probe succeed.
  function setupSweep(
    entries: string[],
    kill: (pid: number) => void = (pid) => {
      if (pid === DEAD_PID) {
        throw killError('ESRCH')
      }
    }
  ) {
    const binding = loadFresh()
    const readdirSpy = jest
      .spyOn(fsObj(), 'readdirSync')
      .mockImplementation(() => entries)
    const lstatSpy = jest
      .spyOn(fsObj(), 'lstatSync')
      .mockImplementation(() => DIR_STATS)
    const rmSpy = jest.spyOn(fsObj(), 'rmSync').mockImplementation(() => {})
    const killSpy = jest
      .spyOn(process, 'kill')
      .mockImplementation((pid: number) => {
        kill(pid)
        return true
      })
    return { binding, readdirSpy, lstatSpy, rmSpy, killSpy }
  }

  it('S1: removes a dead-pid entry (ESRCH) with a recursive forced rmSync', () => {
    const t = setupSweep([extractName(DEAD_PID)])

    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 1,
      removed: 1
    })
    expect(t.killSpy).toHaveBeenCalledWith(DEAD_PID, 0)
    expect(t.rmSpy).toHaveBeenCalledTimes(1)
    expect(t.rmSpy).toHaveBeenCalledWith(join(ROOT, extractName(DEAD_PID)), {
      recursive: true,
      force: true
    })
  })

  it('S2: keeps the own-pid entry and never probes it (sibling workers share process.pid)', () => {
    const t = setupSweep([extractName(process.pid)])

    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 0,
      removed: 0
    })
    expect(t.killSpy).not.toHaveBeenCalled()
    expect(t.rmSpy).not.toHaveBeenCalled()
  })

  it('S3: keeps an entry whose probe does not throw (owner alive)', () => {
    const t = setupSweep([extractName(ALIVE_PID)], () => undefined)

    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 1,
      removed: 0
    })
    expect(t.rmSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['EPERM', () => killError('EPERM')],
    ['EINVAL', () => killError('EINVAL')],
    ['a thrown non-Error value', () => 'boom']
  ])('S4: a probe that throws %s keeps the entry', (_label, make) => {
    const t = setupSweep([extractName(EPERM_PID)], () => {
      // Deliberately throws a non-Error value in one row: the binding must
      // cope with whatever process.kill could surface.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw make()
    })

    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 1,
      removed: 0
    })
    expect(t.rmSpy).not.toHaveBeenCalled()
  })

  it('S5: names that do not exactly match a mkdtemp-minted name (or carry an out-of-range pid) are never probed or removed', () => {
    const t = setupSweep([
      'other-dir',
      'gamelib-jest-run-AbCdEf',
      'gamelib-lzma-native-abc-AbCdEf',
      'gamelib-lzma-native-123-short',
      'gamelib-lzma-native-123-AbCdEfG',
      'gamelib-lzma-native-0-AbCdEf',
      'gamelib-lzma-native-4294967295-AbCdEf',
      'gamelib-lzma-native-12345678901-AbCdEf'
    ])

    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 0,
      removed: 0
    })
    expect(t.killSpy).not.toHaveBeenCalled()
    expect(t.rmSpy).not.toHaveBeenCalled()
  })

  it('S6: a throwing readdirSync returns zeros without throwing and touches nothing else', () => {
    const t = setupSweep([])
    t.readdirSpy.mockImplementation(() => {
      throw new Error('EACCES')
    })

    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 0,
      removed: 0
    })
    expect(t.killSpy).not.toHaveBeenCalled()
    expect(t.lstatSpy).not.toHaveBeenCalled()
    expect(t.rmSpy).not.toHaveBeenCalled()
  })

  it('S7: probes and removes at most LZMA_NATIVE_STALE_SWEEP_MAX_DIRS (64); own-pid entries do not consume the budget', () => {
    const entries: string[] = []
    for (let i = 0; i < 70; i++) {
      entries.push(extractName(DEAD_PID, `Dead${String(i).padStart(2, '0')}`))
      if (i % 14 === 0) {
        entries.push(extractName(process.pid, `Self${i % 10}${i % 7}`))
      }
    }
    expect(entries.filter((n) => n.includes(`-${process.pid}-`))).toHaveLength(
      5
    )
    const t = setupSweep(entries)

    expect(t.binding.LZMA_NATIVE_STALE_SWEEP_MAX_DIRS).toBe(64)
    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 64,
      removed: 64
    })
    expect(t.killSpy).toHaveBeenCalledTimes(64)
    expect(t.rmSpy).toHaveBeenCalledTimes(64)
  })

  it('S8: an rmSync failure on one entry is swallowed and the next entry is still removed', () => {
    const t = setupSweep([
      extractName(DEAD_PID, 'Aaaaaa'),
      extractName(DEAD_PID, 'Bbbbbb')
    ])
    t.rmSpy.mockImplementationOnce(() => {
      throw new Error('EBUSY')
    })

    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 2,
      removed: 1
    })
    expect(t.rmSpy).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      'a symlink or junction',
      () => ({ isDirectory: () => true, isSymbolicLink: () => true })
    ],
    [
      'a non-directory',
      () => ({ isDirectory: () => false, isSymbolicLink: () => false })
    ],
    ['an entry that vanished (undefined)', () => undefined],
    [
      'an lstatSync that throws',
      () => {
        throw new Error('EPERM')
      }
    ]
  ])('S9: %s is never removed nor counted as removed', (_label, make) => {
    const t = setupSweep([extractName(DEAD_PID)])
    t.lstatSpy.mockImplementation(make)

    expect(t.binding.sweepStaleExtractDirs(ROOT)).toEqual({
      examined: 1,
      removed: 0
    })
    expect(t.rmSpy).not.toHaveBeenCalled()
  })

  it('S10: is purely synchronous -- a plain non-thenable result and no timers (sidecar exit contract)', () => {
    jest.useFakeTimers()
    const t = setupSweep([extractName(DEAD_PID)])

    const result = t.binding.sweepStaleExtractDirs(ROOT)

    expect((result as unknown as { then?: unknown }).then).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })

  describe('S11 real filesystem (private fixture root)', () => {
    let fixtureRoot = ''

    afterEach(() => {
      if (fixtureRoot) {
        rmSync(fixtureRoot, { recursive: true, force: true })
      }
    })

    it('removes only the dead-pid dir; names minted by the real mkdtempSync match the sweep pattern', () => {
      const binding = loadFresh()
      fixtureRoot = mkdtempSync(join(tmpdir(), 'gamelib-82w-sweep-fixture-'))
      const dead = mkdtempSync(
        join(fixtureRoot, `gamelib-lzma-native-${DEAD_PID}-`)
      )
      writeFileSync(join(dead, 'liblzma.dll'), 'x')
      const own = mkdtempSync(
        join(fixtureRoot, basename(binding.nativeExtractDirPrefix()))
      )
      const other = mkdtempSync(join(fixtureRoot, 'unrelated-'))

      const realKill = process.kill.bind(process)
      jest
        .spyOn(process, 'kill')
        .mockImplementation((pid: number, signal?: string | number) => {
          if (pid === DEAD_PID) {
            throw killError('ESRCH')
          }
          return realKill(pid, signal)
        })

      expect(binding.sweepStaleExtractDirs(fixtureRoot)).toEqual({
        examined: 1,
        removed: 1
      })
      expect(existsSync(dead)).toBe(false)
      expect(existsSync(own)).toBe(true)
      expect(existsSync(other)).toBe(true)
    })
  })
})

describe('lzmaNativeBinding.nativeExtractDirPrefix', () => {
  it('R7: is a prefix under the OS temp dir carrying the pid, whose basename marks it as ours', () => {
    const lzmaNativeBinding = loadFresh()
    const prefix = lzmaNativeBinding.nativeExtractDirPrefix()
    expect(prefix.startsWith(tmpdir())).toBe(true)
    expect(prefix).toContain(String(process.pid))
    expect(basename(prefix).startsWith('gamelib-lzma-native-')).toBe(true)
  })
})

describe('lzmaNativeBinding asset-key drift guard', () => {
  it("LZMA_NATIVE_SEA_ASSET_KEY strictly equals meta/buildSidecarSea.ts's LZMA_NATIVE_ASSET_KEY", () => {
    const lzmaNativeBinding = loadFresh()
    expect(lzmaNativeBinding.LZMA_NATIVE_SEA_ASSET_KEY).toBe(
      LZMA_NATIVE_ASSET_KEY
    )
  })

  it("R8: LZMA_NATIVE_DLL_SEA_ASSET_KEY strictly equals meta/buildSidecarSea.ts's LZMA_NATIVE_DLL_ASSET_KEY", () => {
    const lzmaNativeBinding = loadFresh()
    expect(lzmaNativeBinding.LZMA_NATIVE_DLL_SEA_ASSET_KEY).toBe(
      LZMA_NATIVE_DLL_ASSET_KEY
    )
  })
})
