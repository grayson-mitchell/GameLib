import diagnostics_channel from 'node:diagnostics_channel'
import type { ClientRequest } from 'node:http'

/**
 * Tracks every in-flight outbound `node:http`/`https` request so the stdin-EOF release can
 * destroy them (quick 261110-9w2, todo 2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c).
 *
 * Exit-contract half 2 ("no unbounded in-flight work"): raw outbound HTTP had no shutdown hook.
 * Measured on Node 22: idle keep-alive sockets are unref'd and harmless, but a request in
 * flight, or a response whose body is still streaming or never read, holds the event loop
 * (still alive at 5 s; completed and consumed exits in 8 ms).
 *
 * The fix is agent-agnostic on purpose: axiosClient (`backend/utils.ts`) and steam-user's
 * HttpClient use PRIVATE agents, so destroying `https.globalAgent` would miss them, and a
 * chained follow-up request issued after the destroy would reopen a socket. The
 * `http.client.request.start` diagnostics channel sees every ClientRequest regardless of agent,
 * and once shutting down, new requests are destroyed at creation.
 *
 * Not covered, deliberately: `fetch` (undici; only `logger/uploader.ts`, user-triggered) and
 * WebSocket upgrades (steam-user's CM), which `SteamUser.releaseForShutdown()` logs off.
 *
 * The module does nothing at import; the caller logs (no logger import here).
 */

export interface OutboundHttpTracker {
  /** Subscribes to the diagnostics channel; a second call on the same instance is a no-op. */
  install(): void
  markShuttingDown(): void
  destroyAll(): { destroyed: number; hosts: string[] }
  liveCount(): number
  /** Unsubscribes so a later instance in the same process sees no duplicate callbacks. */
  dispose(): void
}

export function createOutboundHttpTracker(): OutboundHttpTracker {
  let subscribed = false
  let shuttingDown = false
  const live = new Set<ClientRequest>()

  const onStart = (msg: unknown): void => {
    const { request } = msg as { request: ClientRequest }
    if (shuttingDown) {
      request.destroy(
        new Error(
          'sidecar shutting down: outbound HTTP refused after stdin EOF'
        )
      )
      return
    }
    // WebSocket upgrades (steam-user's CM) are owned by their library and released by
    // SteamUser.releaseForShutdown(); do not track them.
    if (request.getHeader('upgrade')) return
    live.add(request)
    request.once('close', () => live.delete(request))
  }

  return {
    install() {
      if (subscribed) return
      subscribed = true
      diagnostics_channel.subscribe('http.client.request.start', onStart)
    },
    markShuttingDown() {
      shuttingDown = true
    },
    destroyAll() {
      shuttingDown = true
      const snapshot = [...live]
      live.clear()
      const hosts = new Set<string>()
      let destroyed = 0
      for (const request of snapshot) {
        if (request.destroyed) continue
        destroyed++
        if (request.host) hosts.add(request.host)
        request.destroy(
          new Error(
            'sidecar shutting down: in-flight outbound HTTP destroyed at stdin EOF'
          )
        )
      }
      return { destroyed, hosts: [...hosts] }
    },
    liveCount() {
      return live.size
    },
    dispose() {
      if (!subscribed) return
      subscribed = false
      diagnostics_channel.unsubscribe('http.client.request.start', onStart)
      live.clear()
    }
  }
}
