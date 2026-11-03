/**
 * Per `runner:appName` single-flight for launches (WR-03).
 *
 * Both launch funnels share this map: `dispatchSteamLaunch` (every Steam
 * launch: sidecar `launch` IPC and the `gamelib://launch` deep link) and
 * `launchEventCallback` in `launcher.ts` (every other runner). A second Play
 * for the same app, from any entry point, joins the first launch before any
 * launcher-level work runs (log writer, launch scripts, status updates).
 *
 * Mirrors the G26 pattern in `storeManagers/steam/games.ts`
 * (`bridgeLaunchesInFlight`): synchronous check-and-set at call entry, the
 * joiner receives the owner's promise, and the entry is released when the
 * owner settles. Has no imports, so it adds no import cycle.
 */

const launchesInFlight = new Map<string, Promise<unknown>>()

export function singleFlightLaunch<T>(
  runner: string,
  appName: string,
  onJoin: () => void | Promise<void>,
  run: () => Promise<T>
): Promise<T> {
  const key = `${runner}:${appName}`
  const existing = launchesInFlight.get(key)
  if (existing) {
    // A throwing or rejecting notifier must never reject the joiner.
    Promise.resolve()
      .then(onJoin)
      .catch(() => undefined)
    return existing as Promise<T>
  }

  const p = run()
  launchesInFlight.set(key, p)
  p.finally(() => {
    if (launchesInFlight.get(key) === p) {
      launchesInFlight.delete(key)
    }
  }).catch(() => undefined)
  return p
}

export function resetLaunchSingleFlightForTests(): void {
  launchesInFlight.clear()
}
