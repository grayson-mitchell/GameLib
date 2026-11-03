// G25: a fresh, bounded "is the Mac offline right now?" check for callers that are about to
// act (Play). The event-driven monitor status is not enough on its own: after boot the status
// only leaves 'online' through the renderer's connectivity-changed listener, which is fed by
// the webview's DOM 'offline' event, so Wi-Fi switched off just before an action can still
// read 'online' (UAT 34). This check asks the OS instead.
//
// CR-01: only a definite monitor 'offline' short-circuits. 'check-online' means unknown (every
// boot until the first probe answers, and after each recheckConnectivity) and falls through to
// the OS check, so a Play is never refused while the Mac is online.
//
// A DNS lookup that does not settle within the cap is reported as NOT offline (unknown): a
// slow resolver must never cause a refusal. Any internal error is also not offline.
// WR-01: dns-failed needs EVERY probe host to fail; one resolving host means online.
//
// IN-01: an abandoned lookup stays queued on the libuv threadpool until the OS resolver gives
// up. That is bounded by the OS, and runs at an action, never at boot.
// IN-02: VPN utun, bridge100, vnic/vmnet and fd00::/8 ULA addresses count as routable, so on
// such Macs the decision falls to DNS and a hanging resolver reads as dns-timeout, a deliberate
// fail-open.
import dns from 'node:dns'
import os from 'node:os'
import { logInfo, logWarning, LogPrefix } from './logger'
import {
  getConnectivityStatus,
  recheckConnectivity
} from 'backend/online_monitor'
import type { ConnectivityStatus } from 'common/types'

const FRESH_DNS_CAP_MS = 1500

type FreshConnectivity = {
  offline: boolean
  source:
    | 'monitor'
    | 'no-interface'
    | 'dns-failed'
    | 'dns-ok'
    | 'dns-timeout'
    | 'error'
  detail?: string
  elapsedMs: number
}

interface ConnectivityNowDeps {
  status(): ConnectivityStatus
  networkInterfaces(): NodeJS.Dict<os.NetworkInterfaceInfo[]>
  lookup(host: string): Promise<unknown>
  onFreshOffline(reason: string, source: string): void
  hosts: string[]
  timeoutMs: number
}

const defaultDeps: ConnectivityNowDeps = {
  status: () => getConnectivityStatus(),
  networkInterfaces: () => os.networkInterfaces(),
  lookup: (host) => dns.promises.lookup(host),
  onFreshOffline: recheckConnectivity,
  hosts: ['github.com', 'gog.com'],
  timeoutMs: FRESH_DNS_CAP_MS
}

type IfaceInfo = {
  address: string
  internal: boolean
  family: string | number
}
type IfaceMap = NodeJS.Dict<IfaceInfo[]>

export function hasRoutableAddress(ifaces: IfaceMap): boolean {
  return Object.values(ifaces).some((list) =>
    (list ?? []).some((info) => {
      if (info.internal) return false
      const address = info.address.toLowerCase()
      if (info.family === 'IPv4' || info.family === 4) {
        return !address.startsWith('169.254.')
      }
      if (info.family === 'IPv6' || info.family === 6) {
        if (address === '::1') return false
        // fe80::/10 covers fe80-febf
        return !/^fe[89ab][0-9a-f]:/.test(address)
      }
      return false
    })
  )
}

export async function checkConnectivityNow(
  reason: string,
  deps?: Partial<ConnectivityNowDeps>
): Promise<FreshConnectivity> {
  const startedAt = Date.now()
  let result: Omit<FreshConnectivity, 'elapsedMs'>
  try {
    const d = { ...defaultDeps, ...deps }
    const st = d.status()
    const notifyFreshOffline = (source: string) => {
      if (st !== 'online') return
      try {
        d.onFreshOffline(reason, source)
      } catch (error) {
        logWarning(
          `Connectivity: fresh-offline hook failed: ${String(error)}`,
          LogPrefix.Connection
        )
      }
    }
    if (st === 'offline') {
      result = { offline: true, source: 'monitor' }
    } else if (!hasRoutableAddress(d.networkInterfaces())) {
      result = { offline: true, source: 'no-interface' }
      notifyFreshOffline('no-interface')
    } else if (d.hosts.length === 0) {
      // Fail open: with nothing to probe we cannot prove offline (IN-02).
      result = {
        offline: false,
        source: 'error',
        detail: 'no DNS probe hosts configured'
      }
    } else {
      let timer: NodeJS.Timeout | undefined
      try {
        const errors: unknown[] = []
        const lookups = new Promise<{ kind: 'ok' } | { kind: 'failed' }>(
          (resolve) => {
            let pending = d.hosts.length
            // hosts is non-empty here (empty list handled above)
            d.hosts.forEach((host, i) => {
              Promise.resolve()
                .then(() => d.lookup(host))
                .then(
                  () => resolve({ kind: 'ok' }),
                  (error: unknown) => {
                    errors[i] = error
                    pending -= 1
                    if (pending === 0) resolve({ kind: 'failed' })
                  }
                )
            })
          }
        )
        const outcome = await Promise.race([
          lookups,
          new Promise<{ kind: 'timeout' }>((resolve) => {
            timer = setTimeout(() => resolve({ kind: 'timeout' }), d.timeoutMs)
            timer.unref?.()
          })
        ])
        if (outcome.kind === 'failed') {
          const first = errors.find((e) => e !== undefined) ?? errors[0]
          const code = (first as { code?: string } | undefined)?.code
          result = {
            offline: true,
            source: 'dns-failed',
            detail: code ?? String(first)
          }
          notifyFreshOffline('dns-failed')
        } else if (outcome.kind === 'timeout') {
          result = { offline: false, source: 'dns-timeout' }
        } else {
          result = { offline: false, source: 'dns-ok' }
        }
      } finally {
        if (timer) clearTimeout(timer)
      }
    }
  } catch (error) {
    result = { offline: false, source: 'error', detail: String(error) }
  }
  const elapsedMs = Date.now() - startedAt
  const { offline, source, detail } = result
  logInfo(
    `Connectivity: fresh check (${reason}) -> ${offline ? 'offline' : 'online'} via ${source}${detail ? ` (${detail})` : ''} in ${elapsedMs}ms`,
    LogPrefix.Connection
  )
  return { ...result, elapsedMs }
}
