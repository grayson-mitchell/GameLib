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

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
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
