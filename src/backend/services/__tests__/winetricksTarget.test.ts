/**
 * The Winetricks and Run EXE target (Phase 87, 87-56a, D-23): a non-Steam game's environment is decided in Rust from the
 * live selection, over an injected transport (no module mock). A native game never asks Rust.
 */
import type { Runner } from 'common/types'
import type { ToolTargetSource } from '../winetricksTarget'
import {
  resolveToolTarget,
  resolveWinetricksTarget,
  toolSettingsResultFrom
} from '../winetricksTarget'

interface FakeGame {
  native: boolean
  platform?: string
  settings: Record<string, unknown>
}

function sourceFor(
  game: FakeGame,
  reply: () => Promise<unknown>
): { source: ToolTargetSource; calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = []
  const source = {
    libraryManagers: {
      gog: {
        getGame: () => ({
          isNative: () => game.native,
          getSettings: async () => game.settings,
          getGameInfo: () => ({
            runner: 'gog',
            app_name: '1',
            install: { platform: game.platform }
          })
        })
      }
    },
    requestRustInvoke: (channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return reply()
    }
  } as unknown as ToolTargetSource
  return { source, calls }
}

const gog: Runner = 'gog'

describe('resolveToolTarget for a non-Steam game', () => {
  it('answers the stored settings for a native game without asking Rust', async () => {
    const { source, calls } = sourceFor(
      { native: true, settings: { winePrefix: '/own' } },
      () => Promise.reject(new Error('must not be called'))
    )
    await expect(
      resolveToolTarget(source, gog, '1', { ensureBottle: true })
    ).resolves.toEqual({
      runner: 'gog',
      appName: '1',
      settings: { winePrefix: '/own' }
    })
    expect(calls).toEqual([])
  })

  it("answers the settings Rust decided on, sending the game's own facts", async () => {
    const settings = { wineVersion: { bin: '/fallback/wine' } }
    const { source, calls } = sourceFor(
      { native: false, platform: 'Windows', settings: { winePrefix: '/old' } },
      () => Promise.resolve({ kind: 'engine', key: 'gog:1', settings })
    )
    await expect(
      resolveToolTarget(source, gog, '1', { ensureBottle: false })
    ).resolves.toEqual({ runner: 'gog', appName: '1', settings })
    expect(calls).toEqual([
      [
        'engine_resolve_tool_settings',
        [
          {
            runner: 'gog',
            appName: '1',
            platform: 'Windows',
            stored: { winePrefix: '/old' },
            ensureBottle: false
          }
        ]
      ]
    ])
  })

  it('keeps the reason word of an unavailable answer', async () => {
    const { source } = sourceFor({ native: false, settings: {} }, () =>
      Promise.resolve({ kind: 'unavailable', reason: 'bottle-not-created' })
    )
    await expect(
      resolveToolTarget(source, gog, '1', { ensureBottle: false })
    ).resolves.toEqual({
      runner: 'gog',
      appName: '1',
      unavailable: 'bottle-not-created'
    })
  })
})

describe('resolveWinetricksTarget', () => {
  it('answers no-engine when the call is rejected', async () => {
    const { source } = sourceFor({ native: false, settings: {} }, () =>
      Promise.reject(new Error('engine_resolve_tool_settings:not-ready'))
    )
    await expect(
      resolveWinetricksTarget(source, gog, '1', { ensureBottle: true })
    ).resolves.toEqual({
      runner: 'gog',
      appName: '1',
      unavailable: 'no-engine'
    })
  })

  it('answers no-engine when the reply is not one of the three shapes', async () => {
    const { source } = sourceFor({ native: false, settings: {} }, () =>
      Promise.resolve({ kind: 'engine', settings: {} })
    )
    await expect(
      resolveWinetricksTarget(source, gog, '1', { ensureBottle: true })
    ).resolves.toMatchObject({ unavailable: 'no-engine' })
  })
})

describe('toolSettingsResultFrom', () => {
  it('passes the three shapes and rejects everything else', () => {
    expect(toolSettingsResultFrom({ kind: 'stored', settings: {} })).toEqual({
      kind: 'stored',
      settings: {}
    })
    expect(
      toolSettingsResultFrom({ kind: 'engine', key: 'k', settings: {} })
    ).toEqual({ kind: 'engine', key: 'k', settings: {} })
    expect(
      toolSettingsResultFrom({ kind: 'unavailable', reason: 'no-engine' })
    ).toEqual({ kind: 'unavailable', reason: 'no-engine' })
    for (const bad of [
      null,
      'stored',
      [],
      { kind: 'stored' },
      { kind: 'unavailable', reason: 'because' },
      { kind: 'engine', key: 1, settings: {} }
    ]) {
      expect(() => toolSettingsResultFrom(bad)).toThrow(
        'engine_resolve_tool_settings:unexpected-reply'
      )
    }
  })
})
