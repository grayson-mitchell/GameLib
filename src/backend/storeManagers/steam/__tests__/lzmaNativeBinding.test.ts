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

import { join } from 'node:path'

import { LZMA_NATIVE_ASSET_KEY } from '../../../../../meta/buildSidecarSea'

type LzmaNativeBindingResolver = {
  (dir: string): unknown
  LZMA_NATIVE_SEA_ASSET_KEY: string
  LZMA_NATIVE_ADDON_FILENAME: string
  nativeAddonTempPath: () => string
}

const MODULE_PATH = '../depot/lzmaNativeBinding'

function loadFresh(): LzmaNativeBindingResolver {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(MODULE_PATH) as LzmaNativeBindingResolver
}

const REAL_LZMA_NATIVE_DIR = join('some', 'root', 'node_modules', 'lzma-native')
const NOT_LZMA_NATIVE_DIR = join('some', 'root', 'node_modules', 'not-lzma-native')

describe('lzmaNativeBinding identity guard', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('node:sea')
  })

  it('throws when called with a directory that does not belong to lzma-native', () => {
    const lzmaNativeBinding = loadFresh()
    expect(() => lzmaNativeBinding(NOT_LZMA_NATIVE_DIR)).toThrow()
  })

  it('the thrown message names both the offending directory and "lzma-native"', () => {
    const lzmaNativeBinding = loadFresh()
    expect(() => lzmaNativeBinding(NOT_LZMA_NATIVE_DIR)).toThrow(
      new RegExp(
        `${NOT_LZMA_NATIVE_DIR.replace(/[\\/]/g, '.')}.*lzma-native|lzma-native.*${NOT_LZMA_NATIVE_DIR.replace(/[\\/]/g, '.')}`
      )
    )
  })

  it('does not defeat the guard with a trailing separator', () => {
    const lzmaNativeBinding = loadFresh()
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getRawAsset: () => {
        throw new Error('should not be called in the dev branch')
      }
    }))
    jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)
    expect(() => lzmaNativeBinding(`${REAL_LZMA_NATIVE_DIR}${join('/')}`)).not.toThrow()
  })

  it('does not defeat the guard with a Windows-style backslash path', () => {
    const lzmaNativeBinding = loadFresh()
    jest.doMock('node:sea', () => ({
      isSea: () => false,
      getRawAsset: () => {
        throw new Error('should not be called in the dev branch')
      }
    }))
    jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)
    const windowsPath = 'C:\\some\\root\\node_modules\\lzma-native'
    expect(() => lzmaNativeBinding(windowsPath)).not.toThrow()
  })
})

describe('lzmaNativeBinding SEA branch', () => {
  afterEach(() => {
    jest.resetModules()
    jest.dontMock('node:sea')
    jest.restoreAllMocks()
  })

  it('calls getRawAsset with the exact asset-key literal, then process.dlopen, and never getAsset', () => {
    const getAssetSpy = jest.fn()
    const getRawAsset = jest.fn(() => new ArrayBuffer(4))
    jest.doMock('node:sea', () => ({
      isSea: () => true,
      getRawAsset,
      getAsset: getAssetSpy
    }))

    let lzmaNativeBinding: LzmaNativeBindingResolver
    jest.isolateModules(() => {
      lzmaNativeBinding = loadFresh()
    })

    const writeFileSyncSpy = jest
      .spyOn(require('node:fs'), 'writeFileSync')
      .mockImplementation(() => undefined)
    const rmSyncSpy = jest
      .spyOn(require('node:fs'), 'rmSync')
      .mockImplementation(() => undefined)
    const dlopenSpy = jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)

    lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)

    expect(getRawAsset).toHaveBeenCalledWith(
      lzmaNativeBinding!.LZMA_NATIVE_SEA_ASSET_KEY
    )
    expect(dlopenSpy).toHaveBeenCalledTimes(1)
    expect(getAssetSpy).not.toHaveBeenCalled()

    writeFileSyncSpy.mockRestore()
    rmSyncSpy.mockRestore()
  })
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

    const dlopenSpy = jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)

    lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)

    expect(dlopenSpy).toHaveBeenCalledTimes(1)
    const dlopenPath = dlopenSpy.mock.calls[0][1] as string
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

    const dlopenSpy = jest.spyOn(process, 'dlopen').mockImplementation(() => undefined)

    lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)

    expect(dlopenSpy).toHaveBeenCalledTimes(1)
    const dlopenPath = dlopenSpy.mock.calls[0][1] as string
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

    const dlopenSpy = jest.spyOn(process, 'dlopen').mockImplementation((mod) => {
      ;(mod as { exports: unknown }).exports = { marker: 'binding' }
    })

    const first = lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)
    const second = lzmaNativeBinding!(REAL_LZMA_NATIVE_DIR)

    expect(second).toBe(first)
    expect(dlopenSpy).toHaveBeenCalledTimes(1)
  })
})

describe('lzmaNativeBinding.nativeAddonTempPath', () => {
  it('two calls return different strings and both contain the process pid', () => {
    const lzmaNativeBinding = loadFresh()
    const a = lzmaNativeBinding.nativeAddonTempPath()
    const b = lzmaNativeBinding.nativeAddonTempPath()
    expect(a).not.toBe(b)
    expect(a).toContain(String(process.pid))
    expect(b).toContain(String(process.pid))
  })
})

describe('lzmaNativeBinding asset-key drift guard', () => {
  it('LZMA_NATIVE_SEA_ASSET_KEY strictly equals meta/buildSidecarSea.ts\'s LZMA_NATIVE_ASSET_KEY', () => {
    const lzmaNativeBinding = loadFresh()
    expect(lzmaNativeBinding.LZMA_NATIVE_SEA_ASSET_KEY).toBe(LZMA_NATIVE_ASSET_KEY)
  })
})
