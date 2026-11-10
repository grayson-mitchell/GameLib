import { isAxiosError } from 'axios'

/**
 * Quick 261111-8b5. Pure decision for "is Epic offline?" with the fetch,
 * notification and logging injected, so it is unit-testable without mocks.
 */

const EPIC_NETWORK_ERROR_CODES: readonly string[] = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EHOSTDOWN',
  'ERR_NETWORK'
]

/**
 * True when the request went out and no HTTP response came back. Any error
 * that carries an HTTP response is false, as is a cancelled request and an
 * axios config error (raised before sending, so it has no `request`).
 */
export function isNetworkLevelFailure(error: unknown): boolean {
  if (isAxiosError(error)) {
    if (error.response !== undefined) return false
    if (error.code === 'ERR_CANCELED') return false
    return error.request !== undefined
  }
  if (typeof error === 'object' && error !== null) {
    const { code } = error as { code?: unknown }
    return typeof code === 'string' && EPIC_NETWORK_ERROR_CODES.includes(code)
  }
  return false
}

export interface EpicServiceStatusDeps {
  fetchComponents(): Promise<unknown>
  notify(): void
  onUnreachable(error: unknown): void
  onError(error: unknown): void
}

export async function checkEpicServiceOffline(
  deps: EpicServiceStatusDeps,
  type: 'Epic Games Store' | 'Fortnite' | 'Rocket League' = 'Epic Games Store'
): Promise<boolean> {
  try {
    const data = (await deps.fetchComponents()) as {
      components: { name: string; status: string }[]
    }

    for (const component of data.components) {
      const { name, status: indicator } = component

      // found component and checking status
      if (name === type) {
        const isOffline = indicator === 'major'
        if (isOffline) {
          deps.notify()
        }
        return isOffline
      }
    }

    deps.notify()
    return false
  } catch (error) {
    // Quick 261111-8b5 / Phase 62 smoke 2: isOnline() lags right after the
    // network drops, and a status request that got no response at all means
    // Epic is unreachable from here, so launch offline instead of failing
    // login silently. Any HTTP response keeps the old "online" result.
    if (isNetworkLevelFailure(error)) {
      deps.onUnreachable(error)
      return true
    }
    deps.onError(error)
    return false
  }
}
