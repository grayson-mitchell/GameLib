/**
 * The prepare shims (Phase 88.1, 88.1-15, D-01): the Launcher's prepare members reach the Rust prepare ops through
 * `launchrust/prepare.ts`. The shape of each shim and the phase that deletes it are pinned by
 * `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross, and that the arguments
 * pass the same zod schema the sidecar checks before the frame is written.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import {
  RUST_LAUNCH_PREPARE,
  RUST_LAUNCH_PREPARE_WINE_BEGIN,
  RUST_LAUNCH_PREPARE_WINE_FINISH
} from 'common/types/sidecarTransport'
import type { GameSettings } from 'common/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import {
  prepareLaunch,
  prepareWineLaunchBegin,
  prepareWineLaunchFinish
} from '../prepare'

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

const settings = {
  wineVersion: { type: 'wine', bin: '/w/wine', name: 'Wine-9' },
  winePrefix: '/p'
} as unknown as GameSettings

const args = {
  settings,
  runner: 'legendary' as const,
  appName: 'Fortnite',
  title: 'Fortnite',
  canRunOffline: true,
  thirdPartyManagedApp: undefined,
  installPath: '/games/fortnite',
  isNative: false,
  storeExpired: false,
  namespace: 'fn'
}

describe('prepareLaunch', () => {
  it('sends one launch_prepare call carrying the facts object and answers what Rust did', async () => {
    const reply = { success: true, offlineMode: false, log: [] }
    const deps = fakeTransport(reply)
    expect(await prepareLaunch(deps, args)).toBe(reply)
    expect(deps.calls).toEqual([[RUST_LAUNCH_PREPARE, [args]]])
  })

  it('sends arguments the sidecar schema accepts, and refuses a key it does not know', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_PREPARE]
    expect(schema.safeParse([args]).success).toBe(true)
    expect(schema.safeParse([{ ...args, rpcClient: true }]).success).toBe(false)
  })

  it('rejects when the call could not be made, with no fallback', async () => {
    const deps = fakeTransport(new Error('not-ready'))
    await expect(prepareLaunch(deps, args)).rejects.toThrow('not-ready')
    expect(deps.calls).toHaveLength(1)
  })
})

const beginArgs = {
  runner: 'gog' as const,
  appName: '1234',
  title: 'A Game',
  canRunOffline: false,
  folderName: 'a-game',
  storedSettings: settings
}

describe('prepareWineLaunchBegin', () => {
  it('sends one launch_prepare_wine_begin call carrying the facts object and answers what Rust did', async () => {
    const reply = { success: true, prefixUpdated: true, settings, log: [] }
    const deps = fakeTransport(reply)
    expect(await prepareWineLaunchBegin(deps, beginArgs)).toBe(reply)
    expect(deps.calls).toEqual([[RUST_LAUNCH_PREPARE_WINE_BEGIN, [beginArgs]]])
  })

  it('sends arguments the sidecar schema accepts, and refuses a key it does not know', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_PREPARE_WINE_BEGIN]
    expect(schema.safeParse([beginArgs]).success).toBe(true)
    expect(schema.safeParse([{ ...beginArgs, extra: 1 }]).success).toBe(false)
  })

  it('rejects when the call could not be made, with no fallback', async () => {
    const deps = fakeTransport(new Error('not-ready'))
    await expect(prepareWineLaunchBegin(deps, beginArgs)).rejects.toThrow(
      'not-ready'
    )
  })
})

const finishArgs = {
  runner: 'gog' as const,
  appName: '1234',
  title: 'A Game',
  installPath: '/games/a',
  folderName: 'a-game',
  settings,
  storedSettings: settings,
  prefixUpdated: true,
  mergesTier1Env: true,
  isGog: true,
  cometSupport: undefined
}

describe('prepareWineLaunchFinish', () => {
  it("sends one launch_prepare_wine_finish call carrying begin's settings and the stored settings", async () => {
    const reply = { success: true, envVars: {}, knownFixEnv: {}, log: [] }
    const deps = fakeTransport(reply)
    expect(await prepareWineLaunchFinish(deps, finishArgs)).toBe(reply)
    expect(deps.calls).toEqual([
      [RUST_LAUNCH_PREPARE_WINE_FINISH, [finishArgs]]
    ])
  })

  it('sends arguments the sidecar schema accepts, and refuses a missing storedSettings and an unknown key', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_PREPARE_WINE_FINISH]
    expect(schema.safeParse([finishArgs]).success).toBe(true)
    const { storedSettings: _dropped, ...withoutStored } = finishArgs
    expect(schema.safeParse([withoutStored]).success).toBe(false)
    expect(schema.safeParse([{ ...finishArgs, extra: 1 }]).success).toBe(false)
  })
})
