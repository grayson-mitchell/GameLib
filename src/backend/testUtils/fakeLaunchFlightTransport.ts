/**
 * A fake of the Rust single-flight table behind the three launch-flight channels (88.3-18), for the tests that need a
 * `LaunchFlights` without a shell: `createRustLaunchFlights` over `transport()` joins this table the way the boot's glue joins
 * `gamelib-launch`'s. It models the reply shapes 88.3-11 pinned: `begin` answers `{ lead }` or `{ join: true }` (decided
 * synchronously, as Rust decides under one lock), `wait` answers the leader's value or `abandoned` (and `abandoned` at once for
 * a key nobody leads), `end` answers a boolean. `releaseAtSidecarEof()` answers every waiter `abandoned` and frees every key;
 * `shutdown()` rejects every waiter with `launch_flight_wait:shutdown`. No timer, no handle: every settle is a promise.
 * Plain object, no jest APIs.
 */
import type { RustInvokeDeps } from '../host/rustInvokeDeps'

interface Flight {
  key: string
  settle: (answer: { value: unknown } | { shutdown: true } | null) => void
  settled: Promise<{ value: unknown } | { shutdown: true } | null>
}

export interface FakeLaunchFlightTransport {
  deps: RustInvokeDeps
  /** Every call in order, as `[channel, args]`. */
  sent: { channel: string; args: unknown[] }[]
  /** The keys that have a leader now. */
  heldKeys: () => string[]
  /** The sidecar went away: every key is free and every waiter answers `abandoned`. */
  releaseAtSidecarEof: () => void
  /** The app is shutting down: every waiter rejects with `launch_flight_wait:shutdown`. */
  shutdown: () => void
}

export function createFakeLaunchFlightTransport(): FakeLaunchFlightTransport {
  const byKey = new Map<string, Flight>()
  const byId = new Map<string, Flight>()
  const sent: { channel: string; args: unknown[] }[] = []
  let counter = 0

  function keyOf(arg: unknown): string {
    const { runner, appName } = arg as { runner: string; appName: string }
    return `${runner}:${appName}`
  }

  function reply(channel: string, args: unknown[]): Promise<unknown> {
    switch (channel) {
      case 'launch_flight_begin': {
        const key = keyOf(args[0])
        if (byKey.has(key)) return Promise.resolve({ join: true })
        let settle!: Flight['settle']
        const settled = new Promise<
          { value: unknown } | { shutdown: true } | null
        >((resolve) => (settle = resolve))
        const flight: Flight = { key, settle, settled }
        const id = `${(++counter).toString(16).padStart(32, '0')}`
        byKey.set(key, flight)
        byId.set(id, flight)
        return Promise.resolve({ lead: id })
      }
      case 'launch_flight_wait': {
        const flight = byKey.get(keyOf(args[0]))
        if (!flight) return Promise.resolve('abandoned')
        return flight.settled.then((answer) => {
          if (answer === null) return 'abandoned'
          if ('shutdown' in answer) {
            throw new Error('launch_flight_wait:shutdown')
          }
          return answer.value
        })
      }
      case 'launch_flight_end': {
        const { flightId, result } = args[0] as {
          flightId: string
          result: unknown
        }
        const flight = byId.get(flightId)
        if (!flight) return Promise.resolve(false)
        byId.delete(flightId)
        byKey.delete(flight.key)
        flight.settle({ value: result })
        return Promise.resolve(true)
      }
      default:
        return Promise.reject(new Error(`${channel}:unexpected-channel`))
    }
  }

  const deps = {
    requestRustInvoke: (channel: string, args: unknown[]) => {
      sent.push({ channel, args })
      return reply(channel, args)
    }
  } as unknown as RustInvokeDeps

  return {
    deps,
    sent,
    heldKeys: () => [...byKey.keys()],
    releaseAtSidecarEof: () => {
      const flights = [...byKey.values()]
      byKey.clear()
      byId.clear()
      for (const flight of flights) flight.settle(null)
    },
    shutdown: () => {
      for (const flight of byKey.values()) flight.settle({ shutdown: true })
    }
  }
}
