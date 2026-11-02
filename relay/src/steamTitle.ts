// D-14: the canonical title comes only from Steam appdetails for the appId.
// Open Question 4 (accepted): delisted / region-locked titles return success:false
// and therefore cannot be reported.
import type { FetchLike } from './env'

export const ALLOWED_STEAM_APP_TYPES = ['game', 'demo'] as const

export type TitleResult =
  | { ok: true; title: string }
  | { ok: false; kind: 'unknown-app' | 'unavailable' }

/**
 * Strip control/format chars (incl. bidi overrides), backticks and angle
 * brackets; collapse whitespace; cap at 200. The title is only ever placed in a
 * JSON file (JSON.stringify) and inside a single-backtick code span in bodies.
 */
export function sanitizeSteamTitle(name: string): string {
  return name
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[`<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export async function lookupSteamTitle(
  appId: string,
  fetch: FetchLike
): Promise<TitleResult> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`,
      {
        redirect: 'manual',
        headers: {
          'User-Agent': 'gamelib-fix-relay',
          Accept: 'application/json'
        }
      }
    )
    if (!res.ok) return { ok: false, kind: 'unavailable' }
    let body: unknown
    try {
      body = await res.json()
    } catch {
      return { ok: false, kind: 'unavailable' }
    }
    const entry = (body as Record<string, unknown> | null)?.[appId] as
      | { success?: unknown; data?: { type?: unknown; name?: unknown } }
      | undefined
    if (!entry || entry.success !== true) {
      return { ok: false, kind: 'unknown-app' }
    }
    const type = entry.data?.type
    if (
      typeof type !== 'string' ||
      !(ALLOWED_STEAM_APP_TYPES as readonly string[]).includes(type)
    ) {
      return { ok: false, kind: 'unknown-app' }
    }
    const name = entry.data?.name
    const title = typeof name === 'string' ? sanitizeSteamTitle(name) : ''
    if (!title) return { ok: false, kind: 'unknown-app' }
    return { ok: true, title }
  } catch {
    return { ok: false, kind: 'unavailable' }
  }
}
