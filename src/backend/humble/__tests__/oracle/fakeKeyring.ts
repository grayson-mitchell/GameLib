/**
 * A scripted stand-in for the Rust keyring (94-09 Tasks 1 and 2, D-18, T-94-16). It is what a case
 * hands the real `SidecarHumbleSecretStore` as `requestRustInvoke`, so no oracle case can reach the
 * real OS Keychain, a dev vault or any other store: the only secret storage in a case is the map in
 * this closure.
 *
 * It answers the four keyring channels (`keyring_get`, `keyring_set`, `keyring_delete`,
 * `keyring_available`) the way the Rust arm does for a healthy keyring: `get` answers the stored
 * string or `null` for an empty slot, `set` stores, `delete` removes, `available` answers `true`.
 * `behave` overrides one call (counted per channel, from 0) with a failure, a delay or a fixed
 * answer, so a case can script a keyring that fails, is slow or lies.
 *
 * A delay uses the global `setTimeout` at call time, so a case under jest fake timers moves it
 * with the fake clock and a case without them waits in real time.
 *
 * Every call is reported to `onCall` as `{op, slot, ...}`, the exact shape a golden records. A set
 * records the value it was given (a synthetic string in every case); a get records `present`/`absent`
 * and the stored value.
 */
import type { RequestRustInvoke } from 'backend/host'
import {
  RUST_KEYRING_AVAILABLE,
  RUST_KEYRING_DELETE,
  RUST_KEYRING_GET,
  RUST_KEYRING_SET
} from 'common/types/sidecarTransport'

type KeyringChannel =
  | typeof RUST_KEYRING_GET
  | typeof RUST_KEYRING_SET
  | typeof RUST_KEYRING_DELETE
  | typeof RUST_KEYRING_AVAILABLE

export type KeyringBehavior =
  | { fail: string }
  | { delayMs: number; then?: KeyringBehavior }
  | { answer: unknown }

export interface KeyringCall {
  op: KeyringChannel
  slot: string
  /** A set's value. */
  value?: string
  /** What the call answered. */
  answered?: unknown
  /** The failure message when the call rejected. */
  threw?: string
}

export interface FakeKeyringOptions {
  /** Slots that hold a value before the case starts. */
  initial?: Readonly<Record<string, string>>
  /** Overrides call number `n` (0-based, per channel) of a channel. `undefined` is the healthy path. */
  behave?: Partial<
    Record<
      KeyringChannel,
      (n: number, slot: string) => KeyringBehavior | undefined
    >
  >
  /** Called at the start of each call with the call's record, which is filled in as it settles. */
  onCall?: (call: KeyringCall) => void
}

export interface FakeKeyring {
  readonly requestRustInvoke: RequestRustInvoke
  /** The slots as they stand now. */
  slots(): Record<string, string>
  /** Every call so far. */
  readonly calls: readonly KeyringCall[]
}

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export function createFakeKeyring(
  options: FakeKeyringOptions = {}
): FakeKeyring {
  const slots: Record<string, string> = { ...(options.initial ?? {}) }
  const counts: Record<KeyringChannel, number> = {
    keyring_get: 0,
    keyring_set: 0,
    keyring_delete: 0,
    keyring_available: 0
  }
  const calls: KeyringCall[] = []

  async function run(
    behavior: KeyringBehavior | undefined,
    healthy: () => unknown
  ): Promise<unknown> {
    if (behavior === undefined) return healthy()
    if ('fail' in behavior) throw new Error(behavior.fail)
    if ('delayMs' in behavior) {
      await pause(behavior.delayMs)
      return run(behavior.then, healthy)
    }
    return behavior.answer
  }

  const requestRustInvoke = (async (channel: string, args: unknown[]) => {
    const op = channel as KeyringChannel
    if (!(op in counts)) {
      throw new Error(`fake keyring: unexpected channel ${channel}`)
    }
    const n = counts[op]++
    const [first, second] = args as [string, string | undefined]
    // keyring_set is [token, slot]; every other channel is [slot].
    const slot = op === RUST_KEYRING_SET ? String(second) : String(first)
    const call: KeyringCall = {
      op,
      slot,
      ...(op === RUST_KEYRING_SET ? { value: String(first) } : {})
    }
    calls.push(call)
    options.onCall?.(call)
    const behavior = options.behave?.[op]?.(n, slot)
    try {
      const answered = await run(behavior, () => {
        if (op === RUST_KEYRING_GET) return slots[slot] ?? null
        if (op === RUST_KEYRING_SET) {
          slots[slot] = String(first)
          return null
        }
        if (op === RUST_KEYRING_DELETE) {
          delete slots[slot]
          return null
        }
        return true
      })
      call.answered = answered
      return answered
    } catch (error) {
      call.threw = (error as Error).message
      throw error
    }
  }) as unknown as RequestRustInvoke

  return {
    requestRustInvoke,
    slots: () => ({ ...slots }),
    calls
  }
}
