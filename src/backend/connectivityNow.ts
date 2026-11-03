// G25: a fresh, bounded "is the Mac offline right now?" check for callers that are about to
// act (Play). The event-driven monitor status is not enough on its own: after boot the status
// only leaves 'online' through the renderer's connectivity-changed listener, which is fed by
// the webview's DOM 'offline' event, so Wi-Fi switched off just before an action can still
// read 'online' (UAT 34). This check asks the OS instead.
//
// A DNS lookup that does not settle within the cap is reported as NOT offline (unknown): a
// slow resolver must never cause a refusal. Any internal error is also not offline.
import dns from 'node:dns'
import os from 'node:os'
import { logInfo, LogPrefix } from './logger'
import { isOnline, recheckConnectivity } from 'backend/online_monitor'

export const FRESH_DNS_CAP_MS = 1500

export type FreshConnectivity = {
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

export interface ConnectivityNowDeps {
  isOnline(): boolean
  networkInterfaces(): NodeJS.Dict<os.NetworkInterfaceInfo[]>
  lookup(host: string): Promise<unknown>
  onFreshOffline(reason: string, source: string): void
  host: string
  timeoutMs: number
}

const defaultDeps: ConnectivityNowDeps = {
  isOnline,
  networkInterfaces: () => os.networkInterfaces(),
  lookup: (host) => dns.promises.lookup(host),
  onFreshOffline: recheckConnectivity,
  host: 'github.com',
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
    if (!d.isOnline()) {
      result = { offline: true, source: 'monitor' }
    } else if (!hasRoutableAddress(d.networkInterfaces())) {
      d.onFreshOffline(reason, 'no-interface')
      result = { offline: true, source: 'no-interface' }
    } else {
      let timer: NodeJS.Timeout | undefined
      try {
        const outcome = await Promise.race([
          Promise.resolve(d.lookup(d.host)).then(
            () => ({ kind: 'ok' as const }),
            (error: unknown) => ({ kind: 'failed' as const, error })
          ),
          new Promise<{ kind: 'timeout' }>((resolve) => {
            timer = setTimeout(() => resolve({ kind: 'timeout' }), d.timeoutMs)
            timer.unref?.()
          })
        ])
        if (outcome.kind === 'failed') {
          const code = (outcome.error as { code?: string } | undefined)?.code
          d.onFreshOffline(reason, 'dns-failed')
          result = {
            offline: true,
            source: 'dns-failed',
            detail: code ?? String(outcome.error)
          }
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
