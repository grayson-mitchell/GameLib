/**
 * The bridge's CrossOver bin-dir lookup over the Rust shim (Phase 87, 87-55, D-04): the hints Rust cannot read itself
 * cross as values, a reply is narrowed rather than cast, and a failed call is "not installed", never a rejection (the TS
 * locator's `resolveCrossoverBinDirAsync` never rejected).
 */
import { RUST_ENGINE_CX_RESOLVE_BIN_DIR } from 'common/types/sidecarTransport'
import type { WineInstallation } from 'common/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import * as logger from 'backend/logger'
import { crossoverBinDir } from '../engine/crossoverBinDir'

beforeEach(() => {
  jest.spyOn(logger, 'logWarning').mockImplementation(() => undefined)
})
afterEach(() => {
  jest.restoreAllMocks()
})

const BIN = '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'

function transport(handler: () => Promise<unknown>): RustInvokeDeps & {
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return handler()
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

describe('crossoverBinDir', () => {
  it('resolves the path Rust names and sends no hint when none is given', async () => {
    const deps = transport(() => Promise.resolve(BIN))
    await expect(crossoverBinDir(deps)).resolves.toBe(BIN)
    expect(deps.calls).toEqual([
      [RUST_ENGINE_CX_RESOLVE_BIN_DIR, [{ hintWineBins: [] }]]
    ])
  })

  it('sends a CrossOver wineVersion first, then the persisted hints', async () => {
    const deps = transport(() => Promise.resolve(BIN))
    const wineVersion: WineInstallation = {
      bin: `${BIN}/wine`,
      name: 'CrossOver',
      type: 'crossover'
    }
    await crossoverBinDir(deps, { wineVersion, hintWineBins: ['/other/wine'] })
    expect(deps.calls[0]?.[1]).toEqual([
      { hintWineBins: [`${BIN}/wine`, '/other/wine'] }
    ])
  })

  it('leaves a non-CrossOver wineVersion out of the hints', async () => {
    const deps = transport(() => Promise.resolve(null))
    const wineVersion: WineInstallation = {
      bin: '/w/bin/wine',
      name: 'Wine',
      type: 'wine'
    }
    await crossoverBinDir(deps, { wineVersion })
    expect(deps.calls[0]?.[1]).toEqual([{ hintWineBins: [] }])
  })

  it.each([null, '', 7, {}, undefined])(
    'reads a reply of %p as "not installed"',
    async (reply) => {
      await expect(
        crossoverBinDir(transport(() => Promise.resolve(reply)))
      ).resolves.toBeUndefined()
    }
  )

  it('reads a failed call as "not installed" instead of rejecting', async () => {
    await expect(
      crossoverBinDir(
        transport(() =>
          Promise.reject(new Error('engine_cx_resolve_bin_dir:not-ready'))
        )
      )
    ).resolves.toBeUndefined()
    expect(logger.logWarning).toHaveBeenCalledTimes(1)
  })
})
