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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
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
    // WR-07: only an explicit `{ "<id>": { "success": false } }` means the
    // app is unknown (a final 422 for the client). Steam answers HTTP 200 with
    // `null`, `[]` or a body missing the id when it is throttling; those are
    // retryable (503), never a permanent rejection.
    if (!isObject(body)) return { ok: false, kind: 'unavailable' }
    const entry = body[appId]
    if (!isObject(entry)) return { ok: false, kind: 'unavailable' }
    if (entry.success === false) return { ok: false, kind: 'unknown-app' }
    if (entry.success !== true || !isObject(entry.data)) {
      return { ok: false, kind: 'unavailable' }
    }
    const data = entry.data
    const type = data.type
    if (
      typeof type !== 'string' ||
      !(ALLOWED_STEAM_APP_TYPES as readonly string[]).includes(type)
    ) {
      return { ok: false, kind: 'unknown-app' }
    }
    const name = data.name
    const title = typeof name === 'string' ? sanitizeSteamTitle(name) : ''
    if (!title) return { ok: false, kind: 'unknown-app' }
    return { ok: true, title }
  } catch {
    return { ok: false, kind: 'unavailable' }
  }
}
