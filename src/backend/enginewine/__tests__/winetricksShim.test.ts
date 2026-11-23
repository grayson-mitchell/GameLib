/**
 * The Winetricks shims (Phase 87, 87-35, D-15): the launcher's known-fix install and its installed-packages log
 * line, and the Steam bridge's known fixes, reach the Rust Winetricks ops through `winetricksInstallVerbs` and
 * `winetricksListInstalled`, with the settings and ids they already hold (no Game object crosses). The shape of each
 * shim is pinned by `engineWineShimSchedule.test.ts`; this file pins what crosses and what comes back.
 */
import type { GameSettings } from 'common/types'
import {
  RUST_WINE_WINETRICKS_INSTALL,
  RUST_WINE_WINETRICKS_LIST_INSTALLED
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import { winetricksInstallVerbs, winetricksListInstalled } from '../tools'

const SETTINGS = { winePrefix: '/prefix' } as unknown as GameSettings

function fakeTransport(answer: unknown): RustInvokeDeps & {
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

describe('winetricksInstallVerbs', () => {
  it('sends one typed call carrying the target the caller holds and every verb, in order', async () => {
    const deps = fakeTransport(['installed', 'failed'])
    const verbs = ['vcrun2019', 'corefonts']
    expect(
      await winetricksInstallVerbs(deps, {
        settings: SETTINGS,
        runner: 'gog',
        appName: 'app-1',
        verbs
      })
    ).toEqual(['installed', 'failed'])
    expect(deps.calls).toEqual([
      [
        RUST_WINE_WINETRICKS_INSTALL,
        [{ runner: 'gog', appName: 'app-1', settings: SETTINGS }, verbs]
      ]
    ])
    // Identity: the caller's list is the one that crosses.
    expect(deps.calls[0]?.[1][1]).toBe(verbs)
  })

  it("lets Rust's refusal reach the caller instead of swallowing it", async () => {
    const deps = fakeTransport(new Error('wine_winetricks_install:bad-args'))
    await expect(
      winetricksInstallVerbs(deps, {
        settings: SETTINGS,
        runner: 'steam',
        appName: '480',
        verbs: ['xact']
      })
    ).rejects.toThrow('wine_winetricks_install:bad-args')
  })
})

describe('winetricksListInstalled', () => {
  it('sends one typed call carrying the target and answers the log lines Rust read', async () => {
    const lines = ['vcrun2019', 'corefonts']
    const deps = fakeTransport(lines)
    expect(
      await winetricksListInstalled(deps, {
        settings: SETTINGS,
        runner: 'legendary',
        appName: 'app-2'
      })
    ).toBe(lines)
    expect(deps.calls).toEqual([
      [
        RUST_WINE_WINETRICKS_LIST_INSTALLED,
        [{ runner: 'legendary', appName: 'app-2', settings: SETTINGS }]
      ]
    ])
  })
})
