/**
 * The launch single-flight transport shims (Phase 88.3, 88.3-18, D-04, SC4): `launchrust/flights.ts`. The shape of the shims and
 * the phase that deletes them are pinned by `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that
 * cross (they pass the same zod schema the sidecar checks before the frame is written), the glue's semantics over a fake of the
 * Rust table (`fakeLaunchFlightTransport.ts`, which models the reply shapes 88.3-11 recorded). The tracer, two concurrent
 * `dispatchSteamLaunch` calls over `createRustLaunchFlights` launching once, records one recent game and notifying once, is in
 * `storeManagers/steam/__tests__/launchDispatch.test.ts` (it owns the dispatch's module mocks, which the DI ceiling keeps from this file).
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import {
  RUST_LAUNCH_FLIGHT_BEGIN,
  RUST_LAUNCH_FLIGHT_END,
  RUST_LAUNCH_FLIGHT_WAIT
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { createFakeLaunchFlightTransport } from 'backend/testUtils/fakeLaunchFlightTransport'

import {
  createRustLaunchFlights,
  launchFlightBegin,
  launchFlightEnd,
  launchFlightWait
} from '../flights'

type Sent = { channel: string; args: unknown[] }

function recordingDeps(reply: unknown): { deps: RustInvokeDeps; sent: Sent[] } {
  const sent: Sent[] = []
  const recording = {
    requestRustInvoke: (channel: string, args: unknown[]) => {
      sent.push({ channel, args })
      return reply instanceof Error
        ? Promise.reject(reply)
        : Promise.resolve(reply)
    }
  } as unknown as RustInvokeDeps
  return { deps: recording, sent }
}

const KEY = { runner: 'steam', appName: '999005' }

describe('the three flight shims', () => {
  it('launchFlightBegin sends exactly [RUST_LAUNCH_FLIGHT_BEGIN, [key]] and answers untouched', async () => {
    const { deps: d, sent } = recordingDeps({ lead: 'ab' })
    await expect(launchFlightBegin(d, KEY)).resolves.toEqual({ lead: 'ab' })
    expect(sent).toEqual([{ channel: RUST_LAUNCH_FLIGHT_BEGIN, args: [KEY] }])
    expect(RUST_LAUNCH_FLIGHT_BEGIN).toBe('launch_flight_begin')
  })

  it('launchFlightWait sends exactly [RUST_LAUNCH_FLIGHT_WAIT, [key]] and answers untouched', async () => {
    const { deps: d, sent } = recordingDeps(true)
    await expect(launchFlightWait(d, KEY)).resolves.toBe(true)
    expect(sent).toEqual([{ channel: RUST_LAUNCH_FLIGHT_WAIT, args: [KEY] }])
    expect(RUST_LAUNCH_FLIGHT_WAIT).toBe('launch_flight_wait')
  })

  it('launchFlightEnd sends exactly [RUST_LAUNCH_FLIGHT_END, [flight]] and answers untouched', async () => {
    const { deps: d, sent } = recordingDeps(true)
    const flight = { flightId: 'ab', result: false }
    await expect(launchFlightEnd(d, flight)).resolves.toBe(true)
    expect(sent).toEqual([{ channel: RUST_LAUNCH_FLIGHT_END, args: [flight] }])
    expect(RUST_LAUNCH_FLIGHT_END).toBe('launch_flight_end')
  })

  it('sends arguments that pass the schemas the sidecar checks before the frame is written', () => {
    expect(
      rustInvokeArgs[RUST_LAUNCH_FLIGHT_BEGIN].safeParse([KEY]).success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_LAUNCH_FLIGHT_WAIT].safeParse([KEY]).success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_LAUNCH_FLIGHT_END].safeParse([
        { flightId: 'ab', result: { rejected: true } }
      ]).success
    ).toBe(true)
    expect(
      rustInvokeArgs[RUST_LAUNCH_FLIGHT_BEGIN].safeParse([{}]).success
    ).toBe(false)
  })

  it("rejects with the call's own error when it could not be made", async () => {
    const { deps: d } = recordingDeps(
      new Error('launch_flight_begin:not-ready')
    )
    await expect(launchFlightBegin(d, KEY)).rejects.toThrow(
      'launch_flight_begin:not-ready'
    )
  })
})

describe('createRustLaunchFlights', () => {
  function build(warn?: (message: unknown[]) => void) {
    const fake = createFakeLaunchFlightTransport()
    const flights = createRustLaunchFlights({
      transport: () => fake.deps,
      warn
    })
    return { fake, flights }
  }

  it('each flight operation is one typed call: begin, then end for a leader; begin, then wait for a joiner', async () => {
    const { fake, flights } = build()
    await flights.singleFlightLaunch('steam', '1', jest.fn(), () =>
      Promise.resolve(true)
    )
    expect(fake.sent.map((s) => s.channel)).toEqual([
      RUST_LAUNCH_FLIGHT_BEGIN,
      RUST_LAUNCH_FLIGHT_END
    ])
    expect(fake.sent[0]?.args).toEqual([{ runner: 'steam', appName: '1' }])
    expect(fake.sent[1]?.args).toEqual([
      { flightId: expect.any(String), result: true }
    ])
  })

  it('runs the leader once and gives its value to every joiner, calling onJoin per joiner', async () => {
    const { fake, flights } = build()
    let release!: (v: string) => void
    const run = jest.fn(
      () => new Promise<string>((resolve) => (release = resolve))
    )
    const onJoin = jest.fn()
    const first = flights.singleFlightLaunch('steam', '1', onJoin, run)
    const second = flights.singleFlightLaunch('steam', '1', onJoin, run)
    const third = flights.singleFlightLaunch('steam', '1', onJoin, run)
    await new Promise(setImmediate)
    release('done')
    await expect(first).resolves.toBe('done')
    await expect(second).resolves.toBe('done')
    await expect(third).resolves.toBe('done')
    expect(run).toHaveBeenCalledTimes(1)
    expect(onJoin).toHaveBeenCalledTimes(2)
    expect(fake.heldKeys()).toEqual([])
  })

  it('keeps different keys apart', async () => {
    const { flights } = build()
    const run = jest.fn().mockResolvedValue(true)
    await Promise.all([
      flights.singleFlightLaunch('steam', '1', jest.fn(), run),
      flights.singleFlightLaunch('steam', '2', jest.fn(), run),
      flights.singleFlightLaunch('gog', '1', jest.fn(), run)
    ])
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('a throwing or rejecting onJoin never rejects the joiner', async () => {
    const { flights } = build()
    let release!: (v: number) => void
    const lead = flights.singleFlightLaunch(
      'steam',
      '1',
      jest.fn(),
      () => new Promise<number>((resolve) => (release = resolve))
    )
    const throwing = flights.singleFlightLaunch(
      'steam',
      '1',
      () => {
        throw new Error('notifier')
      },
      jest.fn()
    )
    const rejecting = flights.singleFlightLaunch(
      'steam',
      '1',
      () => Promise.reject(new Error('notifier')),
      jest.fn()
    )
    await new Promise(setImmediate)
    release(7)
    await expect(lead).resolves.toBe(7)
    await expect(throwing).resolves.toBe(7)
    await expect(rejecting).resolves.toBe(7)
  })

  it("a leader's rejection rejects its joiner (the leader's own error does not cross) and releases the key", async () => {
    const { fake, flights } = build()
    let fail!: (e: Error) => void
    const lead = flights.singleFlightLaunch(
      'steam',
      '1',
      jest.fn(),
      () => new Promise<never>((_resolve, reject) => (fail = reject))
    )
    const joiner = flights.singleFlightLaunch(
      'steam',
      '1',
      jest.fn(),
      jest.fn()
    )
    await new Promise(setImmediate)
    fail(new Error('boom'))
    await expect(lead).rejects.toThrow('boom')
    await expect(joiner).rejects.toThrow(/rejected/)
    await expect(joiner).rejects.not.toThrow(/boom/)
    expect(fake.heldKeys()).toEqual([])
    await expect(
      flights.singleFlightLaunch('steam', '1', jest.fn(), () =>
        Promise.resolve('again')
      )
    ).resolves.toBe('again')
  })

  it('a leader whose run throws synchronously still ends its flight', async () => {
    const { fake, flights } = build()
    await expect(
      flights.singleFlightLaunch('steam', '1', jest.fn(), () => {
        throw new Error('sync')
      })
    ).rejects.toThrow('sync')
    expect(fake.heldKeys()).toEqual([])
  })

  it('an abandoned answer (released at sidecar EOF) rejects the joiner by name', async () => {
    const { fake, flights } = build()
    const lead = flights.singleFlightLaunch(
      'steam',
      '1',
      jest.fn(),
      () => new Promise<never>(() => undefined)
    )
    void lead
    const joiner = flights.singleFlightLaunch(
      'steam',
      '1',
      jest.fn(),
      jest.fn()
    )
    await new Promise(setImmediate)
    fake.releaseAtSidecarEof()
    await expect(joiner).rejects.toThrow(/abandoned/)
  })

  it('a shutdown rejection rejects the joiner by name', async () => {
    const { fake, flights } = build()
    const lead = flights.singleFlightLaunch(
      'steam',
      '1',
      jest.fn(),
      () => new Promise<never>(() => undefined)
    )
    void lead
    const joiner = flights.singleFlightLaunch(
      'steam',
      '1',
      jest.fn(),
      jest.fn()
    )
    await new Promise(setImmediate)
    fake.shutdown()
    await expect(joiner).rejects.toThrow(/shutdown/)
  })

  it('a begin the shell refuses rejects the caller and runs nothing (no TypeScript fallback)', async () => {
    const { deps: refusing } = recordingDeps(
      new Error('launch_flight_begin:not-ready')
    )
    const flights = createRustLaunchFlights({ transport: () => refusing })
    const run = jest.fn()
    await expect(
      flights.singleFlightLaunch('steam', '1', jest.fn(), run)
    ).rejects.toThrow('launch_flight_begin:not-ready')
    expect(run).not.toHaveBeenCalled()
  })

  it('a begin answer of neither shape rejects the caller', async () => {
    const { deps: odd } = recordingDeps({ nope: 1 })
    const flights = createRustLaunchFlights({ transport: () => odd })
    const run = jest.fn()
    await expect(
      flights.singleFlightLaunch('steam', '1', jest.fn(), run)
    ).rejects.toThrow('launch_flight_begin:bad-reply')
    expect(run).not.toHaveBeenCalled()
  })

  it("a lost end warns and never replaces the leader's own result", async () => {
    const warn = jest.fn()
    const sent: Sent[] = []
    const lossy = {
      requestRustInvoke: (channel: string, args: unknown[]) => {
        sent.push({ channel, args })
        return channel === RUST_LAUNCH_FLIGHT_BEGIN
          ? Promise.resolve({ lead: 'ab' })
          : Promise.reject(new Error('launch_flight_end:lost'))
      }
    } as unknown as RustInvokeDeps
    const flights = createRustLaunchFlights({ transport: () => lossy, warn })
    await expect(
      flights.singleFlightLaunch('steam', '1', jest.fn(), () =>
        Promise.resolve(true)
      )
    ).resolves.toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('creates no timer', () => {
    jest.useFakeTimers()
    try {
      build()
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})
