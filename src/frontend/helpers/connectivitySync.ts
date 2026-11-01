import type { ConnectivitySnapshot, ConnectivityStatus } from 'common/types'

/**
 * How long a renderer may sit in a non-online state without hearing from the sidecar before it
 * asks again. The sidecar talks at least once a second during a retry countdown and a probe
 * round ends within about ten seconds, so this is comfortably longer than any legitimate
 * silence while still correcting a lost message within the same half minute.
 */
export const CONNECTIVITY_RESYNC_MS = 20_000

export interface ConnectivityView {
  status: ConnectivityStatus
  retryIn: number
}

interface ConnectivitySyncOptions {
  /** Reads the sidecar's current snapshot (`get-connectivity-status`). */
  pull: () => Promise<ConnectivitySnapshot>
  /** Receives every update that is newer than what the renderer already shows. */
  onChange: (view: ConnectivityView) => void
  /** Diagnostics for gamelib.log, so a recurrence can be attributed. */
  log: (message: string) => void
  resyncMs?: number
}

/**
 * Keeps the renderer's connectivity state equal to the sidecar's, however the messages arrive.
 *
 * Two things reach the webview: pushes (`connectivity-changed`) and the reply to the one pull
 * made on mount. The Rust shell `emit`s a push straight from its stdout reader thread, but a
 * reply goes through the invoke machinery, so their arrival order is not their send order.
 * Applying "whatever came last" lets an old reply taken while the sidecar was still probing
 * land after the `online` push and strand the "Retrying" banner (a stranded state is never
 * corrected, because nothing changes on a connection that is fine). Every snapshot therefore
 * carries a per-process `epoch` and a `seq` that only grows, and anything that is not newer
 * than what has been applied is dropped.
 *
 * Whatever else loses a message, the watchdog covers it: while the state is not `online`, a
 * quiet spell triggers one more pull.
 */
export function createConnectivitySync(options: ConnectivitySyncOptions) {
  const resyncMs = options.resyncMs ?? CONNECTIVITY_RESYNC_MS
  let newest: { epoch: string; seq: number } | undefined
  let shown: ConnectivityStatus | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let pullFailureLogged = false
  let disposed = false

  const disarm = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const arm = () => {
    disarm()
    // `shown === undefined` (nothing heard yet) is not online either.
    if (disposed || shown === 'online') {
      return
    }
    timer = setTimeout(() => {
      timer = undefined
      void pull('resync')
    }, resyncMs)
  }

  const isStale = (snapshot: ConnectivitySnapshot) =>
    newest !== undefined &&
    typeof snapshot.seq === 'number' &&
    snapshot.epoch === newest.epoch &&
    snapshot.seq <= newest.seq

  const receive = (
    snapshot: ConnectivitySnapshot,
    via: 'push' | 'pull' | 'resync' = 'push'
  ): boolean => {
    if (disposed) {
      return false
    }
    if (isStale(snapshot)) {
      // The same stamp again is a watchdog pull confirming nothing was missed. Only an OLDER
      // one is evidence that messages crossed on the way, which is worth a line in the log.
      if (newest && snapshot.seq < newest.seq) {
        options.log(
          `[connectivity] ignored a stale ${via === 'push' ? 'push' : 'pull'} ` +
            `(${snapshot.status}, seq ${snapshot.seq} is older than ${newest.seq})`
        )
      }
      return false
    }
    newest =
      typeof snapshot.seq === 'number'
        ? { epoch: snapshot.epoch, seq: snapshot.seq }
        : undefined
    shown = snapshot.status
    options.onChange({ status: snapshot.status, retryIn: snapshot.retryIn })
    arm()
    return true
  }

  const pull = async (via: 'pull' | 'resync' = 'pull'): Promise<void> => {
    try {
      const snapshot = await options.pull()
      pullFailureLogged = false
      const applied = receive(snapshot, via)
      if (applied && via === 'resync') {
        options.log(
          `[connectivity] resync recovered '${snapshot.status}' after ` +
            `${resyncMs}ms without an update from the sidecar`
        )
      }
    } catch (error) {
      if (!pullFailureLogged) {
        pullFailureLogged = true
        options.log(`[connectivity] pull failed: ${String(error)}`)
      }
    }
    // Whatever the answer was, keep watching while the state is not online.
    if (via === 'resync') {
      arm()
    }
  }

  // The renderer starts out believing nothing is known, which is not 'online' either.
  arm()

  return {
    receive: (snapshot: ConnectivitySnapshot) => {
      receive(snapshot, 'push')
    },
    pull: () => pull('pull'),
    dispose: () => {
      disposed = true
      disarm()
    }
  }
}
