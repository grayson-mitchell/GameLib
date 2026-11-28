/**
 * The launch funnel transport shim (Phase 88.3, 88.3-10, D-01, D-04, D-25): `launchrust/funnel.ts` and the Launcher's
 * `launchEventCallback` member over it. The shape of the shim and the phase that deletes it are pinned by
 * `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross, that the arguments pass the same
 * zod schema the sidecar checks before the frame is written, the narrowing of the answer, and (the tracer) that a Play through
 * the Launcher runs nothing of the TS sequence: one request, no per-game log writer, no single-flight entry (and the launcher holds no wake lock to start: its deps have no app state).
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Backend: 'Backend' },
  getRunnerLogWriter: jest.fn(),
  createGameLogWriter: jest.fn()
}))

import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import {
  RUST_LAUNCH_READOPTED_ANNOUNCE,
  RUST_LAUNCH_RUN,
  RUST_LAUNCH_SETUP_ENV_VARS
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createLauncher } from 'backend/launchrust/launcher'
import type { GameSettings } from 'common/types'
import { createGameLogWriter } from 'backend/logger'

import { settleLaunchStatus } from 'backend/launchBuilderReply'

import { announceReadoptedGames, launchRun } from '../funnel'

type Sent = { channel: string; args: unknown[] }

function recordingDeps(reply: unknown): {
  deps: RustInvokeDeps
  sent: Sent[]
} {
  const sent: Sent[] = []
  const deps = {
    requestRustInvoke: (channel: string, args: unknown[]) => {
      sent.push({ channel, args })
      return reply instanceof Error
        ? Promise.reject(reply)
        : Promise.resolve(reply)
    }
  } as unknown as RustInvokeDeps
  return { deps, sent }
}

const PARAMS = {
  appName: 'Quail',
  runner: 'legendary' as const,
  skipVersionCheck: true,
  args: ['-windowed'],
  launchArguments: {
    type: 'basic' as const,
    name: 'Windowed',
    parameters: '-windowed'
  }
}

describe('launchRun', () => {
  it('sends exactly [RUST_LAUNCH_RUN, [params]] and answers the reply untouched', async () => {
    const { deps, sent } = recordingDeps({ status: 'done' })

    await expect(launchRun(deps, PARAMS)).resolves.toEqual({ status: 'done' })

    expect(sent).toEqual([{ channel: RUST_LAUNCH_RUN, args: [PARAMS] }])
  })

  it('sends arguments that pass the schema the sidecar checks before the frame is written', () => {
    expect(rustInvokeArgs[RUST_LAUNCH_RUN].safeParse([PARAMS]).success).toBe(
      true
    )
    expect(
      rustInvokeArgs[RUST_LAUNCH_RUN].safeParse([
        { appName: 'Quail', runner: 'legendary' }
      ]).success
    ).toBe(true)
  })

  it("rejects with the call's own error and never answers a status", async () => {
    const { deps } = recordingDeps(new Error('launch_run:not-ready'))

    await expect(launchRun(deps, PARAMS)).rejects.toThrow(
      'launch_run:not-ready'
    )
  })
})

describe('settleLaunchStatus', () => {
  it.each(['done', 'error', 'abort'] as const)(
    'answers { status: %s }',
    (s) => {
      expect(settleLaunchStatus({ status: s })).toEqual({ status: s })
    }
  )

  it.each([
    undefined,
    null,
    'done',
    1,
    {},
    { status: 'launched' },
    { status: 1 },
    { statuses: 'done' }
  ])('throws by name on %p', (reply) => {
    expect(() => settleLaunchStatus(reply)).toThrow(
      'launchRun: the reply was not a launch status'
    )
  })
})

// The tracer: a Play through the Launcher member, built the way `createStoreManagers` builds it (88.3-16): the library
// managers, the store hooks, the global settings and the Rust transport, and nothing else.
function buildLauncher(requestRustInvoke: RustInvokeDeps['requestRustInvoke']) {
  const getGame = jest.fn()
  const launcher = createLauncher({
    requestRustInvoke,
    libraryManagers: { legendary: { getGame } } as never,
    launchHooks: { legendary: {} } as never,
    config: { getSettings: () => ({}) } as never
  })
  return { launcher, getGame }
}

describe("createLauncher's launchEventCallback (D-01, D-04, D-25)", () => {
  beforeEach(() => {
    ;(createGameLogWriter as jest.Mock).mockReset()
  })

  it("a Play makes exactly one RUST_LAUNCH_RUN request, settles on Rust's status and runs nothing of the TS sequence", async () => {
    const sent: Sent[] = []
    const { launcher, getGame } = buildLauncher(((
      channel: string,
      args: unknown[]
    ) => {
      sent.push({ channel, args })
      return Promise.resolve({ status: 'done' })
    }) as RustInvokeDeps['requestRustInvoke'])

    await expect(launcher.launchEventCallback(PARAMS)).resolves.toEqual({
      status: 'done'
    })

    expect(sent).toEqual([{ channel: RUST_LAUNCH_RUN, args: [PARAMS] }])
    expect(createGameLogWriter).not.toHaveBeenCalled()
    expect(getGame).not.toHaveBeenCalled()
  })

  it('a setupEnvVars makes exactly one RUST_LAUNCH_SETUP_ENV_VARS request and answers its string map', async () => {
    const sent: Sent[] = []
    const { launcher } = buildLauncher(((channel: string, args: unknown[]) => {
      sent.push({ channel, args })
      return Promise.resolve({ GAMEID: '0' })
    }) as RustInvokeDeps['requestRustInvoke'])
    const settings = { winePrefix: '/p' } as unknown as GameSettings

    await expect(launcher.setupEnvVars(settings, '/games/q')).resolves.toEqual({
      GAMEID: '0'
    })

    expect(sent).toEqual([
      { channel: RUST_LAUNCH_SETUP_ENV_VARS, args: [settings, '/games/q'] }
    ])
  })

  it("two Plays of one game each go to Rust (the single flight is the funnel's, not a TS table)", async () => {
    const sent: Sent[] = []
    const { launcher } = buildLauncher(((channel: string, args: unknown[]) => {
      sent.push({ channel, args })
      return Promise.resolve({ status: 'abort' })
    }) as RustInvokeDeps['requestRustInvoke'])

    const a = await launcher.launchEventCallback(PARAMS)
    const b = await launcher.launchEventCallback(PARAMS)

    expect(a).toEqual({ status: 'abort' })
    expect(b).toEqual({ status: 'abort' })
    expect(sent.map((s) => s.channel)).toEqual([
      RUST_LAUNCH_RUN,
      RUST_LAUNCH_RUN
    ])
  })

  it('a Play without a chosen launch option sends no launchArguments key', async () => {
    const sent: Sent[] = []
    const { launcher } = buildLauncher(((channel: string, args: unknown[]) => {
      sent.push({ channel, args })
      return Promise.resolve({ status: 'done' })
    }) as RustInvokeDeps['requestRustInvoke'])

    await launcher.launchEventCallback({ appName: 'Quail', runner: 'gog' })

    expect(sent.map((s) => s.args)).toStrictEqual([
      [{ appName: 'Quail', runner: 'gog' }]
    ])
  })

  it('a malformed reply throws by name instead of passing as a launch that ended', async () => {
    const { launcher } = buildLauncher((() =>
      Promise.resolve('done')) as RustInvokeDeps['requestRustInvoke'])

    await expect(launcher.launchEventCallback(PARAMS)).rejects.toThrow(
      'launchRun: the reply was not a launch status'
    )
  })

  it("a rejected call fails the Play with Rust's word, with no TS fallback", async () => {
    const { launcher, getGame } = buildLauncher((() =>
      Promise.reject(
        new Error('launch_run:not-ready')
      )) as RustInvokeDeps['requestRustInvoke'])

    await expect(launcher.launchEventCallback(PARAMS)).rejects.toThrow(
      'launch_run:not-ready'
    )
    expect(getGame).not.toHaveBeenCalled()
  })
})

describe('announceReadoptedGames', () => {
  it('sends exactly [RUST_LAUNCH_READOPTED_ANNOUNCE, []] and answers the count untouched', async () => {
    const { deps, sent } = recordingDeps(1)

    await expect(announceReadoptedGames(deps)).resolves.toBe(1)

    expect(sent).toEqual([
      { channel: RUST_LAUNCH_READOPTED_ANNOUNCE, args: [] }
    ])
    expect(RUST_LAUNCH_READOPTED_ANNOUNCE).toBe('launch_readopted_announce')
  })

  it('sends arguments that pass the schema the sidecar checks before the frame is written', () => {
    expect(
      rustInvokeArgs[RUST_LAUNCH_READOPTED_ANNOUNCE].safeParse([]).success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_LAUNCH_READOPTED_ANNOUNCE].safeParse([{}]).success
    ).toBe(false)
  })

  it("rejects with the call's own error when the shell is not ready", async () => {
    const { deps } = recordingDeps(
      new Error('launch_readopted_announce:not-ready')
    )

    await expect(announceReadoptedGames(deps)).rejects.toThrow(
      'launch_readopted_announce:not-ready'
    )
  })
})
