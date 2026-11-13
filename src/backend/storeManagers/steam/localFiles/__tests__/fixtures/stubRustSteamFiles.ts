import type { RustSteamFilesChannel } from 'common/types/sidecarTransport'
import type {
  SteamFilesArgsFor,
  SteamFilesResultFor
} from '../../steamFilesTypes'

type Handlers = Partial<{
  [C in RustSteamFilesChannel]: (
    args: SteamFilesArgsFor<C>
  ) => SteamFilesResultFor<C>
}>

/**
 * Test double for the rustInvoke leaf used by steamfiles callers. It answers from programmed
 * results, never from a parser (README section 3.6): real parsing is proven by the crate tests
 * and the replay harness. An unhandled channel throws so a missed stub is loud.
 */
export function stubRustSteamFiles(handlers: Handlers) {
  const calls: { channel: string; args: unknown }[] = []
  const requestRustInvoke = (
    channel: string,
    argv: readonly unknown[]
  ): Promise<unknown> => {
    const args = argv[0]
    calls.push({ channel, args })
    const handler = (
      handlers as Record<string, ((a: unknown) => unknown) | undefined>
    )[channel]
    if (!handler) {
      return Promise.reject(
        new Error(`unstubbed steamfiles channel ${channel}`)
      )
    }
    try {
      return Promise.resolve(handler(args))
    } catch (e) {
      return Promise.reject(e as Error)
    }
  }
  return { requestRustInvoke, calls }
}
