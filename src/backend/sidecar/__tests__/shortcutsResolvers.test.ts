/**
 * The shortcut resolvers (Phase 94 Plan 11, 86 D-24): `resolveShortcutsExists` gathers the game's title
 * from the TypeScript library manager as a `const` and makes exactly one `requestRustInvoke` call;
 * `registerShortcutsResolvers` installs the renderer-facing `shortcutsExists` handle. The path rules and the
 * disk read are Rust's (`gamelib-shortcuts`, pinned by its golden replay).
 */
import { RUST_SHORTCUTS_EXIST } from 'common/types/sidecarTransport'
import type { Runner } from 'common/types'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { createTestManagers } from 'backend/testUtils/testServices'
import {
  registerShortcutsResolvers,
  resolveShortcutsExists
} from '../shortcutsResolvers'

type Call = [channel: string, args: unknown[]]

function fakeDeps(
  gameInfo: Record<string, unknown>,
  answer: unknown = true
): {
  deps: Parameters<typeof resolveShortcutsExists>[0]
  calls: Call[]
  lookups: [appName: string][]
} {
  const calls: Call[] = []
  const lookups: [string][] = []
  const getGame = (appName: string) => {
    lookups.push([appName])
    return { getGameInfo: () => gameInfo }
  }
  const deps = {
    managers: createTestManagers({
      library: {
        legendary: { getGame: getGame as never },
        gog: { getGame: getGame as never }
      }
    }),
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return Promise.resolve(answer)
    }) as never
  }
  return { deps, calls, lookups }
}

describe('resolveShortcutsExists', () => {
  it('sends one shortcuts_exist call carrying the library title, and resolves the Rust answer', async () => {
    const { deps, calls, lookups } = fakeDeps({ title: 'Plain Game' }, true)
    await expect(
      resolveShortcutsExists(deps, 'AppName', 'legendary')
    ).resolves.toBe(true)
    expect(calls).toEqual([
      [
        RUST_SHORTCUTS_EXIST,
        [{ appName: 'AppName', runner: 'legendary', title: 'Plain Game' }]
      ]
    ])
    expect(lookups).toEqual([['AppName']])
  })

  it('looks the game up in the library of its own runner', async () => {
    const { deps, calls } = fakeDeps({ title: 'GOG Game' }, false)
    await expect(resolveShortcutsExists(deps, 'g1', 'gog')).resolves.toBe(false)
    expect(calls[0]?.[1]).toEqual([
      { appName: 'g1', runner: 'gog', title: 'GOG Game' }
    ])
  })

  it('a game with no title (the empty getGameInfo sentinel) reaches Rust with no title key at all', async () => {
    const { deps, calls } = fakeDeps({}, false)
    await expect(
      resolveShortcutsExists(deps, 'AppName', 'legendary')
    ).resolves.toBe(false)
    expect(calls).toHaveLength(1)
    // The frame is JSON: an undefined title is dropped, which the Rust arg struct reads as `None`.
    const [, args] = calls[0] as Call
    expect(JSON.parse(JSON.stringify(args))).toEqual([
      { appName: 'AppName', runner: 'legendary' }
    ])
  })

  it('carries a Rust rejection to the caller', async () => {
    const { deps } = fakeDeps({ title: 'T' })
    deps.requestRustInvoke = (() =>
      Promise.reject(new Error('shortcuts_exist:bad-args'))) as never
    await expect(
      resolveShortcutsExists(deps, 'AppName', 'legendary')
    ).rejects.toThrow('shortcuts_exist:bad-args')
  })
})

describe('registerShortcutsResolvers', () => {
  it('registers the shortcutsExists handle, which answers from Rust, and nothing else', async () => {
    const ipc = createIpcRegistry()
    const { deps, calls } = fakeDeps({ title: 'Plain Game' }, true)
    registerShortcutsResolvers({ ...deps, ipc })
    expect([...ipc.handlerMap().keys()]).toEqual(['shortcutsExists'])
    expect([...ipc.listenerMap().keys()]).toEqual([])
    const handler = ipc.getHandler('shortcutsExists')
    await expect(
      handler?.(undefined, 'AppName', 'legendary' satisfies Runner)
    ).resolves.toBe(true)
    expect(calls).toHaveLength(1)
  })
})
