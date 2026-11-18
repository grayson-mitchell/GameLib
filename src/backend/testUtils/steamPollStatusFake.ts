/**
 * Wraps a recording invoke double so the Rust steampoll registry read answers an empty registry,
 * as it does when no poll is running. The polls run on the Rust side, so any TS path that reads
 * the registry makes this one extra call; the wrapped double still sees every other channel and
 * its call counts stay unchanged.
 */

import { RUST_STEAMPOLL_STATUS } from 'common/types/sidecarTransport'

import type { RequestRustInvoke } from '../host'
import type { PollStatus } from '../storeManagers/steam/pollRust/steamPollTypes'

export const EMPTY_POLL_STATUS: PollStatus = {
  installs: [],
  uninstalls: []
}

export function withEmptyPollStatus(
  inner: (channel: string, args: unknown[]) => unknown
): RequestRustInvoke {
  return ((channel: string, args: unknown[]) =>
    channel === RUST_STEAMPOLL_STATUS
      ? Promise.resolve(EMPTY_POLL_STATUS)
      : inner(channel, args)) as unknown as RequestRustInvoke
}
