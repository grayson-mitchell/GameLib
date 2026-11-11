/**
 * A controllable OnlineMonitor for consumer tests (D-66.3-11). Plain object, no jest APIs.
 * `setOnline(bool)` flips the status and fires the listeners the way the real monitor does:
 * `onConnectivityChange` callbacks see every transition, `runOnceWhenOnline` callbacks queued
 * while offline run once on the next online transition.
 */
import type { ConnectivityStatus } from 'common/types'
import type { OnlineMonitor } from '../online_monitor'

export interface TestOnlineMonitor extends OnlineMonitor {
  setOnline(online: boolean): void
  setStatus(status: ConnectivityStatus): void
  /** Every (reason, finding) passed to recheckConnectivity. */
  rechecks: Array<[string, string]>
}

export function createTestOnlineMonitor(
  opts: { online?: boolean } = {}
): TestOnlineMonitor {
  let status: ConnectivityStatus = opts.online === false ? 'offline' : 'online'
  const changeListeners: Array<(status: ConnectivityStatus) => unknown> = []
  const onceOnline: Array<() => unknown> = []
  const rechecks: Array<[string, string]> = []

  const setStatus = (next: ConnectivityStatus) => {
    status = next
    changeListeners.forEach((listener) => listener(next))
    if (next === 'online') {
      onceOnline.splice(0).forEach((callback) => callback())
    }
  }

  return {
    start: () => undefined,
    onConnectivityChange: (callback) => {
      changeListeners.push(callback)
    },
    runOnceWhenOnline: (callback) => {
      if (status === 'online') callback()
      else onceOnline.push(callback)
    },
    isOnline: () => status === 'online',
    getConnectivityStatus: () => status,
    recheckConnectivity: (reason, finding) => {
      rechecks.push([reason, finding])
    },
    setOnline: (online) => setStatus(online ? 'online' : 'offline'),
    setStatus,
    rechecks
  }
}
