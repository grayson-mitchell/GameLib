/**
 * The DXVK shim (Phase 87, 87-34, D-15): the launcher's DXVK step reaches the one Rust op through
 * `dxvkInstallRemove`, with the settings they already hold. The shape of the
 * shim is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what comes back.
 */
import type { GameSettings } from 'common/types'
import { RUST_WINE_DXVK_INSTALL_REMOVE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import { dxvkInstallRemove } from '../tools'

const SETTINGS = { winePrefix: '/prefix' } as unknown as GameSettings

function fakeTransport(answer: unknown): RustInvokeDeps & {
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return Promise.resolve(answer)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

describe('dxvkInstallRemove', () => {
  it('sends one typed call carrying the settings, tool and action the caller holds', async () => {
    const deps = fakeTransport(true)
    expect(
      await dxvkInstallRemove(deps, {
        settings: SETTINGS,
        tool: 'dxvk',
        action: 'backup'
      })
    ).toBe(true)
    expect(deps.calls).toEqual([
      [
        RUST_WINE_DXVK_INSTALL_REMOVE,
        [{ settings: SETTINGS, tool: 'dxvk', action: 'backup' }]
      ]
    ])
  })

  it("carries the engine's pinned source when one is given", async () => {
    const deps = fakeTransport(true)
    const source = { dir: '/engines/dxvk', version: '2.4' }
    await dxvkInstallRemove(deps, {
      settings: SETTINGS,
      tool: 'dxvk-macOS',
      action: 'backup',
      source
    })
    expect(deps.calls[0]?.[1]).toEqual([
      { settings: SETTINGS, tool: 'dxvk-macOS', action: 'backup', source }
    ])
  })
})
