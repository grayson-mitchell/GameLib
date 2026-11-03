import { ConnectivityStatus } from 'common/types'
import { net } from 'backend/platform'
import { addListener, addHandler, sendFrontendMessage } from 'backend/ipc'
import { logError, logInfo, LogPrefix } from './logger'
import axios from 'axios'
import EventEmitter from 'node:events'
import { randomUUID } from 'node:crypto'

let status: ConnectivityStatus
let retryTimer: NodeJS.Timeout | undefined
let retryIn = 0
const defaultTimeBetweenRetries = 5
let timeBetweenRetries = defaultTimeBetweenRetries
const connectivityEmitter = new EventEmitter()

// Ordering stamp for everything sent to the renderer. A push and a pull reply reach the
// webview by different routes (the Rust shell `emit`s a push straight from its reader
// thread; a reply goes through the invoke machinery), so the renderer cannot rely on
// arrival order and needs a way to tell a stale snapshot from a newer one. `seq` counts
// every publish; `epoch` identifies this process so a restarted sidecar (seq back at 0)
// is not mistaken for old news.
const epoch = randomUUID()
let seq = 0

// The probe rounds that are running right now. At most one is ever in flight: starting a
// round, or leaving 'check-online', cancels the rest, and a cancelled round's outcome is
// ignored (see `pingSites`).
const inFlight = new Set<AbortController>()

const PROBE_URLS = [
  'https://github.com',
  'https://store.epicgames.com',
  'https://gog.com',
  'https://cloudflare-dns.com/'
]

const publish = () => {
  seq += 1
  sendFrontendMessage('connectivity-changed', { status, retryIn, epoch, seq })
}

// A listener's own bug must not derail the monitor: an exception out of `emit` used to land
// in the probe's failure path and be reported to the user as "all ping requests failed".
const guarded = (name: string, listener: () => unknown) => () => {
  try {
    listener()
  } catch (error) {
    logError(
      [`Connectivity listener for '${name}' threw:`, error],
      LogPrefix.Connection
    )
  }
}

const cancelProbing = () => {
  inFlight.forEach((controller) => controller.abort())
  inFlight.clear()
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
}

// handle setting the status, dispatch events for backend and frontend, and trigger pings
const setStatus = (newStatus: ConnectivityStatus, source?: string) => {
  logInfo(
    `Connectivity: ${newStatus}${source ? ` (${source})` : ''}`,
    LogPrefix.Connection
  )

  status = newStatus
  // Whatever was probing or counting down belongs to the previous status.
  cancelProbing()
  retryIn = 0
  if (status !== 'check-online') {
    timeBetweenRetries = defaultTimeBetweenRetries
  }

  // events
  publish()
  connectivityEmitter.emit(status)

  // start pinging if needed
  if (status === 'check-online') {
    pingSites()
  }
}

// Runs only while the status is 'check-online': it is reached from the failure of a round that
// was not cancelled, or from its own timer, and `setStatus` clears both when the status moves.
const retry = (seconds: number) => {
  retryIn = seconds
  // dispatch event with retry countdown
  publish()

  if (seconds) {
    // if still counting down, repeat
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
    retryTimer = setTimeout(() => retry(seconds - 1), 1000)
    // Exit is by event-loop drain at stdin EOF: a countdown must not hold the sidecar open.
    retryTimer.unref?.()
  } else {
    // else, retry pings
    retryTimer = undefined
    pingSites()
  }
}

class ProbeFailure extends Error {
  constructor(
    readonly host: string,
    readonly reason: string,
    readonly elapsedMs: number
  ) {
    super(`${host}: ${reason}`)
  }
}

const describeFailure = (error: unknown) => {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  return code ?? message ?? String(error)
}

// Resolves with the HTTP answer from `url`. ANY answer counts: this checks that the network
// path works, not that the site is happy with a HEAD request from a Node TLS fingerprint.
// store.epicgames.com answers this exact request with a 403 on a healthy connection, and
// Cloudflare-fronted hosts do the same to any axios client (see the humble-reveal-key-fails
// knowledge-base entry), so the 2xx-only default made one probe target permanently dead and
// let a block on the other three (a VPN exit address, say) read as "offline" while the
// webview, with a browser fingerprint, browsed fine.
const probe = (url: string, signal: AbortSignal) => {
  const host = new URL(url).host
  const startedAt = Date.now()
  // Promise.resolve + `response?.`: a request that resolved, whatever with, is an answer. The
  // old `Promise.any([axios.head(..), ..])` took a bare value the same way, and the sidecar
  // suites auto-mock axios (`head` returns undefined) and rely on reaching 'online'.
  return Promise.resolve(
    axios.head(url, {
      timeout: 10000,
      signal,
      headers: { 'Cache-Control': 'no-cache' },
      validateStatus: () => true
    })
  ).then(
    (response: { status?: number } | undefined) => ({
      host,
      statusCode: response?.status,
      elapsedMs: Date.now() - startedAt
    }),
    (error: unknown) => {
      throw new ProbeFailure(
        host,
        describeFailure(error),
        Date.now() - startedAt
      )
    }
  )
}

const pingSites = () => {
  if (process.env.CI === 'e2e') {
    setStatus('online')
    return
  }

  // Always called with nothing in flight: `setStatus` cancels whatever was running before it
  // starts a round (that is how a second request to check, which the renderer's DOM `online`
  // event echoes, replaces the running round instead of racing it), and the countdown only
  // reaches here after its own round has settled.
  const controller = new AbortController()
  inFlight.add(controller)

  logInfo(`Pinging external endpoints`, LogPrefix.Connection)

  Promise.any(PROBE_URLS.map((url) => probe(url, controller.signal))).then(
    (answer) => {
      inFlight.delete(controller)
      // Cancelled by a status change or a newer round: not this round's news to report.
      if (controller.signal.aborted) {
        return
      }
      logInfo(
        `Connectivity probe answered by ${answer.host} (HTTP ${answer.statusCode}, ${answer.elapsedMs}ms)`,
        LogPrefix.Connection
      )
      setStatus('online')
    },
    (error: unknown) => {
      inFlight.delete(controller)
      // An aborted round rejects every request with a cancel error, which is the opposite of
      // "the network is down": ignore it. (Treating it as a failure used to push a
      // "retrying in 5 seconds" countdown after the monitor had already gone online.)
      if (controller.signal.aborted) {
        return
      }
      const failures = (
        error instanceof AggregateError ? error.errors : [error]
      ).map((failure) =>
        failure instanceof ProbeFailure
          ? `${failure.host}: ${failure.reason} after ${failure.elapsedMs}ms`
          : describeFailure(failure)
      )
      logInfo(
        `Connectivity probe failed on every host (${failures.join('; ')})`,
        LogPrefix.Connection
      )
      const wait = timeBetweenRetries
      timeBetweenRetries = timeBetweenRetries + defaultTimeBetweenRetries
      retry(wait)
    }
  )
}

export const initOnlineMonitor = () => {
  // listen to events from the frontend
  addListener(
    'connectivity-changed',
    (event, newStatus: ConnectivityStatus): void => {
      setStatus(newStatus, 'from renderer')
    }
  )

  if (net.isOnline()) {
    // set initial status and ping external sites
    setStatus('check-online')
  } else {
    setStatus('offline')
  }

  // listen to the frontend asking for current status
  addHandler('get-connectivity-status', () => {
    return { status, retryIn, epoch, seq }
  })

  addListener('set-connectivity-online', () => {
    setStatus('online', 'from renderer')
  })
}

export const onConnectivityChange = (
  callback: (status: ConnectivityStatus) => unknown
) => {
  connectivityEmitter.on(
    'online',
    guarded('online', () => callback('online'))
  )
  connectivityEmitter.on(
    'offline',
    guarded('offline', () => callback('offline'))
  )
  connectivityEmitter.on(
    'check-online',
    guarded('check-online', () => callback('check-online'))
  )
}

export const runOnceWhenOnline = (callback: () => unknown) => {
  if (isOnline()) {
    callback()
  } else {
    connectivityEmitter.once(
      'online',
      guarded('online', () => callback())
    )
  }
}

export const isOnline = () => status === 'online'

// G25: after boot nothing in the backend re-probes while the status is 'online', so a fresh
// offline finding (see connectivityNow.ts) hands the decision back to the ping loop (bounded
// axios HEAD with a 10 s timeout, unref'd retry timer). That loop also brings the status back
// to 'online' when the network returns, without waiting for the webview's 'online' event.
// Never set 'offline' directly: nothing in the backend would ever leave it.
export const recheckConnectivity = (reason: string, finding: string) => {
  if (status !== 'online') return
  setStatus('check-online', `fresh check at ${reason} found ${finding}`)
}
