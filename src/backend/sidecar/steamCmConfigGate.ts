/**
 * Phase 79 review C2/WR-04: every Steam CM op that needs the Rust session actor waits for
 * `steamcm_configure`, and a failed configure is retried by the next such op.
 *
 * Rust spawns the session actor, and records the app folder the owed go-online restore reads, only
 * inside `configure`. Until it succeeds, `session_acquire` answers `client-not-ready` and
 * `wrap_restore_if_owed` answers `NotOwed`. The boot step used to send configure once and never
 * retry it, and the IPC handlers were live before it ran. So one failed or slow configure
 * (`steamcm:wrap-host-missing`, or the 60 s generic rustInvoke cap) left every Refresh, depot key and
 * install failing, and the owed restore unpaid, for the rest of the app session.
 *
 * The gate wraps the host's `requestRustInvoke`:
 * - a session-dependent `steamcm_*` channel first awaits `ensure()`;
 * - `ensure()` shares one configure attempt between concurrent callers, remembers success, and
 *   forgets a failure so the next caller tries again;
 * - the sign-in Web API flows, the public store reads and the anonymous session do not need the
 *   actor, so they pass straight through and a slow configure never delays a sign-in.
 *
 * Retries happen on demand only: no timer, watcher or handle is created (sidecar exit contract), and
 * each attempt is one rustInvoke bounded by the transport's own timeout.
 */
import type { RequestRustInvoke } from 'backend/host'
import type { RustInvokeChannel } from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'

/** Channel prefixes that never touch the session actor or the app folder. */
const UNGATED_PREFIXES: readonly string[] = [
  'steamcm_signin_',
  'steamcm_store_',
  'steamcm_anon_'
]

/** True for a `steamcm_*` channel that needs a successful `steamcm_configure` first. */
export function needsSteamCmConfigure(channel: string): boolean {
  return (
    channel.startsWith('steamcm_') &&
    channel !== 'steamcm_configure' &&
    !UNGATED_PREFIXES.some((prefix) => channel.startsWith(prefix))
  )
}

export interface SteamCmConfigGate {
  /**
   * Resolves true once a configure has succeeded, false when this attempt failed. Never rejects.
   * A failed attempt is not cached: the next call starts a new one.
   */
  ensure: () => Promise<boolean>
  /** The wrapped transport: gated channels wait for `ensure()` before they are sent. */
  requestRustInvoke: RequestRustInvoke
}

export function createSteamCmConfigGate(deps: {
  /** One configure attempt; resolves true on success and false on failure, never rejects. */
  configure: () => Promise<boolean>
  requestRustInvoke: RequestRustInvoke
}): SteamCmConfigGate {
  let configured = false
  let inflight: Promise<boolean> | null = null

  function ensure(): Promise<boolean> {
    if (configured) return Promise.resolve(true)
    if (!inflight) {
      inflight = deps.configure().then(
        (ok) => {
          configured = ok
          inflight = null
          return ok
        },
        () => {
          inflight = null
          return false
        }
      )
    }
    return inflight
  }

  function requestRustInvoke<C extends RustInvokeChannel>(
    channel: C,
    args: RustInvokeArgsOf<C>
  ): Promise<unknown> {
    if (!needsSteamCmConfigure(channel)) {
      return deps.requestRustInvoke(channel, args)
    }
    // Sent even when configure failed again: Rust then answers with its own refusal, which the
    // caller already handles, and the next gated op retries the configure.
    return ensure().then(() => deps.requestRustInvoke(channel, args))
  }

  return { ensure, requestRustInvoke }
}
