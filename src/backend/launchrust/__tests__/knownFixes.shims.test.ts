/**
 * The known-fix shims (Phase 88, 88-12, D-01, D-03): the store managers and the download manager reach the
 * Rust known-fix ops through `launchrust/knownFixes.ts`. The shape of each shim and the phase that deletes it
 * are pinned by `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross,
 * and that the arguments pass the same zod schema the sidecar checks before the frame is written.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import {
  RUST_KNOWNFIX_APPLY_REGISTRY,
  RUST_KNOWNFIX_FETCH_REMOTE,
  RUST_KNOWNFIX_LAUNCH_OVERRIDES,
  RUST_KNOWNFIX_REPORT_DETECTED,
  RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV
} from 'common/types/sidecarTransport'
import type { GameSettings } from 'common/types'
import {
  KNOWN_FIX_OVERLAY_BASE_ENV_KEYS,
  overlayBaseEnv
} from 'common/knownFixOverlayCatalogue'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import {
  applyRegistryFixes,
  fetchRemoteKnownFixes,
  readKnownFixLaunchOverrides,
  reportDetectedFix,
  resolveKnownFixOverlayEnv
} from '../knownFixes'
import type { DetectedFix } from '../knownFixes'

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

describe('readKnownFixLaunchOverrides', () => {
  it('sends one knownfix_launch_overrides call carrying the app, the runner and the install path', async () => {
    const reply = { launchArgs: ['-windowed'], exeOverride: null }
    const deps = fakeTransport(reply)
    expect(
      await readKnownFixLaunchOverrides(deps, '1234', 'gog', '/games/g1234')
    ).toBe(reply)
    expect(deps.calls).toEqual([
      [
        RUST_KNOWNFIX_LAUNCH_OVERRIDES,
        [{ appName: '1234', runner: 'gog', installPath: '/games/g1234' }]
      ]
    ])
    expect(RUST_KNOWNFIX_LAUNCH_OVERRIDES).toBe('knownfix_launch_overrides')
  })

  it('sends an unknown install folder as it is held, and the argument passes the channel schema', async () => {
    const deps = fakeTransport({ launchArgs: [] })
    await readKnownFixLaunchOverrides(deps, 'App', 'legendary', undefined)
    await readKnownFixLaunchOverrides(deps, 'App', 'nile', null)
    for (const [channel, args] of deps.calls) {
      expect(channel).toBe(RUST_KNOWNFIX_LAUNCH_OVERRIDES)
      expect(() =>
        rustInvokeArgs[RUST_KNOWNFIX_LAUNCH_OVERRIDES].parse(args)
      ).not.toThrow()
    }
    expect(deps.calls[1]?.[1]).toEqual([
      { appName: 'App', runner: 'nile', installPath: null }
    ])
  })

  it('rejects with the transport failure and does not catch it', async () => {
    const deps = fakeTransport(new Error('knownfix_launch_overrides:not-ready'))
    await expect(
      readKnownFixLaunchOverrides(deps, '1', 'gog', '/g')
    ).rejects.toThrow('not-ready')
  })

  it('has a channel schema that refuses a wrong runner, an unknown key and a wrong arity', () => {
    const schema = rustInvokeArgs[RUST_KNOWNFIX_LAUNCH_OVERRIDES]
    const ok = { appName: 'a', runner: 'gog', installPath: null }
    expect(schema.safeParse([ok]).success).toBe(true)
    expect(schema.safeParse([{ ...ok, runner: 'epic' }]).success).toBe(false)
    expect(schema.safeParse([{ ...ok, extra: 1 }]).success).toBe(false)
    expect(schema.safeParse([ok, ok]).success).toBe(false)
    expect(schema.safeParse([]).success).toBe(false)
  })
})

describe('fetchRemoteKnownFixes', () => {
  it('sends one knownfix_fetch_remote call carrying the app and the runner, and resolves what Rust answered', async () => {
    const deps = fakeTransport(null)
    expect(await fetchRemoteKnownFixes(deps, '1207658930', 'gog')).toBeNull()
    expect(deps.calls).toEqual([
      [RUST_KNOWNFIX_FETCH_REMOTE, [{ appName: '1207658930', runner: 'gog' }]]
    ])
    expect(RUST_KNOWNFIX_FETCH_REMOTE).toBe('knownfix_fetch_remote')
    expect(() =>
      rustInvokeArgs[RUST_KNOWNFIX_FETCH_REMOTE].parse(deps.calls[0]?.[1])
    ).not.toThrow()
  })

  it('rejects with the transport failure and does not catch it (the download manager logs it)', async () => {
    const deps = fakeTransport(new Error('knownfix_fetch_remote:not-ready'))
    await expect(fetchRemoteKnownFixes(deps, '1', 'steam')).rejects.toThrow(
      'not-ready'
    )
  })

  it('has a channel schema that refuses a wrong runner, an unknown key and a wrong arity', () => {
    const schema = rustInvokeArgs[RUST_KNOWNFIX_FETCH_REMOTE]
    const ok = { appName: 'a', runner: 'steam' }
    expect(schema.safeParse([ok]).success).toBe(true)
    expect(schema.safeParse([{ ...ok, runner: 'epic' }]).success).toBe(false)
    expect(schema.safeParse([{ ...ok, installPath: null }]).success).toBe(false)
    expect(schema.safeParse([ok, ok]).success).toBe(false)
    expect(schema.safeParse([]).success).toBe(false)
  })
})

const SETTINGS = {
  wineVersion: { type: 'crossover' }
} as unknown as GameSettings

describe('applyRegistryFixes (the Steam bridge, 88-14)', () => {
  it('sends one knownfix_apply_registry call carrying the app, the label, the bridge settings and the bottle folder', async () => {
    const deps = fakeTransport(null)
    expect(
      await applyRegistryFixes(
        deps,
        '480',
        'Steam 480',
        SETTINGS,
        '/Bottles/GameLibSteamBridge-480'
      )
    ).toBeNull()
    expect(deps.calls).toEqual([
      [
        RUST_KNOWNFIX_APPLY_REGISTRY,
        [
          {
            appId: '480',
            label: 'Steam 480',
            gameSettings: SETTINGS,
            bottleDir: '/Bottles/GameLibSteamBridge-480'
          }
        ]
      ]
    ])
    expect(RUST_KNOWNFIX_APPLY_REGISTRY).toBe('knownfix_apply_registry')
  })

  it('the arguments pass the channel schema, a null bottle folder included, and a settings value that is not an object does not', async () => {
    const deps = fakeTransport(null)
    await applyRegistryFixes(deps, '480', 'Steam 480', SETTINGS, null)
    const schema = rustInvokeArgs[RUST_KNOWNFIX_APPLY_REGISTRY]
    expect(() => schema.parse(deps.calls[0]?.[1])).not.toThrow()
    expect(deps.calls[0]?.[1]).toEqual([
      {
        appId: '480',
        label: 'Steam 480',
        gameSettings: SETTINGS,
        bottleDir: null
      }
    ])
    const ok = {
      appId: '480',
      label: 'Steam 480',
      gameSettings: {},
      bottleDir: null
    }
    for (const bad of [null, [], 'x', 1]) {
      expect(() => schema.parse([{ ...ok, gameSettings: bad }])).toThrow()
    }
    expect(() => schema.parse([{ ...ok, extra: 1 }])).toThrow()
    expect(() => schema.parse([{ ...ok, bottleDir: 1 }])).toThrow()
    expect(() => schema.parse([ok, ok])).toThrow()
    // The Steam profile is read in Rust, so a caller-supplied profile is refused.
    expect(() => schema.parse([{ ...ok, profile: {} }])).toThrow()
  })

  it('rejects with what the transport rejected with', async () => {
    const deps = fakeTransport(new Error('knownfix_apply_registry:not-ready'))
    await expect(
      applyRegistryFixes(deps, '1', 'Steam 1', SETTINGS, null)
    ).rejects.toThrow('not-ready')
  })
})

describe('resolveKnownFixOverlayEnv (the Steam bridge, 88-14)', () => {
  it('sends one knownfix_resolve_overlay_env call carrying the app, the label, the wine type and the base values', async () => {
    const reply = { GST_PLUGIN_PATH: '/t1:/ov' }
    const deps = fakeTransport(reply)
    const base = { GST_PLUGIN_PATH: '/t1' }
    expect(
      await resolveKnownFixOverlayEnv(
        deps,
        '480',
        'Steam 480',
        'crossover',
        base
      )
    ).toBe(reply)
    expect(deps.calls).toEqual([
      [
        RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV,
        [
          {
            appId: '480',
            label: 'Steam 480',
            wineType: 'crossover',
            baseValues: base
          }
        ]
      ]
    ])
    expect(RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV).toBe(
      'knownfix_resolve_overlay_env'
    )
  })

  it('the arguments pass the channel schema, a null wine type included, and a non-string base value does not', async () => {
    const deps = fakeTransport({})
    await resolveKnownFixOverlayEnv(deps, '480', 'Steam 480', null, {})
    const schema = rustInvokeArgs[RUST_KNOWNFIX_RESOLVE_OVERLAY_ENV]
    expect(() => schema.parse(deps.calls[0]?.[1])).not.toThrow()
    const ok = {
      appId: '480',
      label: 'Steam 480',
      wineType: null,
      baseValues: {}
    }
    expect(() => schema.parse([{ ...ok, baseValues: { A: 1 } }])).toThrow()
    expect(() => schema.parse([{ ...ok, extra: 1 }])).toThrow()
    expect(() => schema.parse([{ ...ok, wineType: 1 }])).toThrow()
    // The Steam profile's overlays are read in Rust, so a caller-supplied list is refused.
    expect(() => schema.parse([{ ...ok, overlays: [] }])).toThrow()
  })

  it('rejects with what the transport rejected with', async () => {
    const deps = fakeTransport(
      new Error('knownfix_resolve_overlay_env:not-ready')
    )
    await expect(
      resolveKnownFixOverlayEnv(deps, '1', 'Steam 1', null, {})
    ).rejects.toThrow('not-ready')
  })
})

describe('reportDetectedFix (the Steam library, 88-15)', () => {
  const FIX: DetectedFix = {
    appId: '220',
    key: 'macArch',
    op: 'add',
    detector: 'macho'
  }

  it('sends one knownfix_report_detected call carrying the detection and the caller-held setting, and resolves the outcome word', async () => {
    const deps = fakeTransport('sent')
    expect(await reportDetectedFix(deps, FIX, true)).toBe('sent')
    expect(deps.calls).toEqual([
      [
        RUST_KNOWNFIX_REPORT_DETECTED,
        [
          {
            appId: '220',
            key: 'macArch',
            op: 'add',
            detector: 'macho',
            enabled: true
          }
        ]
      ]
    ])
    expect(RUST_KNOWNFIX_REPORT_DETECTED).toBe('knownfix_report_detected')
  })

  it('sends the setting as it is held: a disabled report is still a call, with enabled false', async () => {
    const deps = fakeTransport('disabled')
    await reportDetectedFix(
      deps,
      { appId: '730', key: 'drm', op: 'remove', detector: 'ceg' },
      false
    )
    expect(deps.calls[0]?.[1]).toEqual([
      {
        appId: '730',
        key: 'drm',
        op: 'remove',
        detector: 'ceg',
        enabled: false
      }
    ])
    for (const [channel, args] of deps.calls) {
      expect(channel).toBe(RUST_KNOWNFIX_REPORT_DETECTED)
      expect(() =>
        rustInvokeArgs[RUST_KNOWNFIX_REPORT_DETECTED].parse(args)
      ).not.toThrow()
    }
  })

  it('carries nothing beyond the five fields of the detection and the setting (no title, path or account)', async () => {
    const deps = fakeTransport('sent')
    const widened = {
      ...FIX,
      title: 'A Game',
      path: '/Users/x/Library'
    } as DetectedFix
    await reportDetectedFix(deps, widened, true)
    const sent = (deps.calls[0]?.[1] as Array<Record<string, unknown>>)[0]
    expect(Object.keys(sent ?? {}).sort()).toEqual([
      'appId',
      'detector',
      'enabled',
      'key',
      'op'
    ])
  })

  it('rejects with the transport failure and does not catch it (the callers log it)', async () => {
    const deps = fakeTransport(new Error('knownfix_report_detected:not-ready'))
    await expect(reportDetectedFix(deps, FIX, true)).rejects.toThrow(
      'not-ready'
    )
  })

  it('has a channel schema that refuses an unknown key, op or detector, a non-boolean setting, an extra field and a wrong arity', () => {
    const schema = rustInvokeArgs[RUST_KNOWNFIX_REPORT_DETECTED]
    const ok = {
      appId: '220',
      key: 'macArch',
      op: 'add',
      detector: 'macho',
      enabled: true
    }
    expect(schema.safeParse([ok]).success).toBe(true)
    expect(schema.safeParse([{ ...ok, key: 'other' }]).success).toBe(false)
    expect(schema.safeParse([{ ...ok, op: 'toggle' }]).success).toBe(false)
    expect(schema.safeParse([{ ...ok, detector: 'other' }]).success).toBe(false)
    expect(schema.safeParse([{ ...ok, enabled: 'yes' }]).success).toBe(false)
    expect(schema.safeParse([{ ...ok, title: 'x' }]).success).toBe(false)
    expect(schema.safeParse([ok, ok]).success).toBe(false)
    expect(schema.safeParse([]).success).toBe(false)
  })
})

describe('overlayBaseEnv', () => {
  it('names the target env var and GST_PLUGIN_PATH_1_0, nothing else', () => {
    expect([...KNOWN_FIX_OVERLAY_BASE_ENV_KEYS].sort()).toEqual([
      'GST_PLUGIN_PATH',
      'GST_PLUGIN_PATH_1_0'
    ])
  })

  it('picks only the base keys that are set, never the rest of the environment (T-88-33)', () => {
    expect(
      overlayBaseEnv({
        GST_PLUGIN_PATH: '/a',
        GST_PLUGIN_PATH_1_0: undefined,
        HOME: '/Users/someone',
        STEAM_API_KEY: 'secret'
      })
    ).toEqual({ GST_PLUGIN_PATH: '/a' })
    expect(overlayBaseEnv({ GST_PLUGIN_PATH_1_0: '/b', PATH: '/bin' })).toEqual(
      { GST_PLUGIN_PATH_1_0: '/b' }
    )
    expect(overlayBaseEnv({})).toEqual({})
  })
})
