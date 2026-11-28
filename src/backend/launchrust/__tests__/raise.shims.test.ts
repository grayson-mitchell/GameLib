/**
 * The window raiser transport (Phase 88.3, 88.3-13): the shim sends one `launch_window_raise` call, the glue the boot builds swallows a rejection
 * (the TS raise never rejected) and sends the pids and names as given (Rust filters them). The raise loop itself is replayed in Rust
 * (`gamelib-launch`'s `golden_window_raise.rs`). `windowsExeNameFromCommand`, the exe-name twin the bottle monitor still calls, is
 * pinned here to the name vectors of the same golden (88.3-20), which the TS driver recorded before it was deleted.
 */
import { RUST_LAUNCH_WINDOW_RAISE } from 'common/types/sidecarTransport'
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { readFileSync } from 'fs'
import { join } from 'path'

import {
  createRustWindowRaiser,
  raiseWineWindow,
  windowsExeNameFromCommand
} from '../raise'

// 88.3-17: the warning line is injected, so a plain jest.fn is the seam (no `jest.mock` of the logger).
const logWarning = jest.fn()

beforeEach(() => {
  logWarning.mockClear()
})

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

const spawnDeps = { spawnAsync: jest.fn() }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('raiseWineWindow', () => {
  it('sends exactly [RUST_LAUNCH_WINDOW_RAISE, [args]] and answers untouched', async () => {
    const { deps, sent } = recordingDeps(null)
    const args = { context: 'bridge:1', pids: ['12'], processNames: ['A.exe'] }

    await expect(raiseWineWindow(deps, args)).resolves.toBeNull()

    expect(sent).toEqual([{ channel: RUST_LAUNCH_WINDOW_RAISE, args: [args] }])
    expect(RUST_LAUNCH_WINDOW_RAISE).toBe('launch_window_raise')
  })

  it('sends arguments that pass the schema the sidecar checks before the frame is written', () => {
    const schema = rustInvokeArgs[RUST_LAUNCH_WINDOW_RAISE]
    expect(
      schema.safeParse([{ context: 'c', pids: ['1'], processNames: ['a.exe'] }])
        .success
    ).toBe(true)
    expect(schema.safeParse([{ pids: ['1'] }]).success).toBe(false)
  })

  it('rejects with the shell category word when the call could not be made', async () => {
    const { deps } = recordingDeps(new Error('launch_window_raise:not-ready'))

    await expect(raiseWineWindow(deps, { context: 'c' })).rejects.toThrow(
      'launch_window_raise:not-ready'
    )
  })
})

describe('createRustWindowRaiser', () => {
  it('sends one RUST_LAUNCH_WINDOW_RAISE with the pids and names as given and resolves', async () => {
    const { deps, sent } = recordingDeps(null)
    const raiser = createRustWindowRaiser({
      transport: () => deps,
      warn: logWarning
    })

    await expect(
      raiser.raise(spawnDeps, {
        context: 'c',
        pids: ['12', 'x', '7; rm'],
        processNames: ['', 'a.exe']
      })
    ).resolves.toBeUndefined()

    // The filtering of both lists is Rust's: they travel as they came.
    expect(sent).toEqual([
      {
        channel: RUST_LAUNCH_WINDOW_RAISE,
        args: [
          {
            context: 'c',
            pids: ['12', 'x', '7; rm'],
            processNames: ['', 'a.exe']
          }
        ]
      }
    ])
    expect(logWarning).not.toHaveBeenCalled()
  })

  it('never rejects: a failed call is one warning line', async () => {
    const { deps, sent } = recordingDeps(
      new Error('launch_window_raise:not-ready')
    )
    const raiser = createRustWindowRaiser({
      transport: () => deps,
      warn: logWarning
    })

    await expect(
      raiser.raise(spawnDeps, { context: 'bridge:1', pids: ['1'] })
    ).resolves.toBeUndefined()

    expect(sent).toHaveLength(1)
    expect(logWarning).toHaveBeenCalledTimes(1)
    expect(logWarning.mock.calls[0][0][0]).toBe(
      'raiseWineGameWindow [bridge:1]: raise failed'
    )
  })

  it('reads the transport at call time, because the host exists only after boot', async () => {
    const { deps, sent } = recordingDeps(null)
    let ready = false
    const raiser = createRustWindowRaiser({
      transport: () => {
        if (!ready) throw new Error('host not ready')
        return deps
      },
      warn: logWarning
    })

    // Building the raiser touches nothing.
    expect(sent).toEqual([])
    // A call before the host exists is a warning, not a throw.
    await expect(
      raiser.raise(spawnDeps, { context: 'c', pids: ['1'] })
    ).resolves.toBeUndefined()
    expect(sent).toEqual([])
    ready = true
    await raiser.raise(spawnDeps, { context: 'c', pids: ['1'] })
    expect(sent).toHaveLength(1)
  })

  it('keeps stop() for the type and it does nothing', () => {
    const { deps, sent } = recordingDeps(null)
    const raiser = createRustWindowRaiser({
      transport: () => deps,
      warn: logWarning
    })
    expect(() => raiser.stop()).not.toThrow()
    expect(sent).toEqual([])
  })
})

// The golden's name vectors: recorded from the TS helper by the 88.3-02 driver (now deleted), kept as the one record of its behaviour.
const GOLDEN = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-launch',
  'tests',
  'fixtures',
  'golden',
  'window_raise'
)
const EXE_NAME_CASE =
  'wineWindowRaise--winewindowraise-windowsexenamefromcommand'

describe('windowsExeNameFromCommand', () => {
  const cases = JSON.parse(
    readFileSync(join(GOLDEN, 'cases.json'), 'utf8')
  ) as { id: string; kind: string; inputs?: string[] }[]
  const recorded = JSON.parse(
    readFileSync(join(GOLDEN, 'expected', EXE_NAME_CASE, 'result.json'), 'utf8')
  ) as { rows: { input: string; output: string | null }[] }

  it('anti-vacuity: the golden names a dozen inputs and each has a recorded row', () => {
    const exeCase = cases.find((c) => c.id === EXE_NAME_CASE)
    expect(exeCase?.kind).toBe('exe-names')
    expect(exeCase?.inputs?.length).toBeGreaterThanOrEqual(12)
    expect(recorded.rows.map((r) => r.input)).toEqual(exeCase?.inputs)
  })

  it.each(recorded.rows.map((r) => [r.input, r.output] as const))(
    'replays the golden name vector %j as %j',
    (input, output) => {
      expect(windowsExeNameFromCommand(input)).toBe(output)
    }
  )
})
