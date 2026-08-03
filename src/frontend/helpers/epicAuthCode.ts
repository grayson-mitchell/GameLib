// Paste-extraction helper for the Epic SIDLogin flow (QUICK-SIDLOGIN-PASTE).
//
// This is a UX helper, NOT a security validator — Epic's login endpoint is
// the authoritative validator. It exists only to accept either input shape
// the user might paste (a bare authorizationCode, or the full JSON blob the
// Epic browser-login page returns) and extract a usable code from it.

const BARE_CODE_MIN_LENGTH = 20
const BARE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/

export function parseEpicAuthCode(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return null
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'authorizationCode' in parsed
    ) {
      const code = (parsed as { authorizationCode: unknown }).authorizationCode
      if (typeof code === 'string' && code.trim().length > 0) {
        return code.trim()
      }
    }
    return null
  }

  const bare = trimmed.replace(/^["']|["']$/g, '').trim()
  if (bare.length >= BARE_CODE_MIN_LENGTH && BARE_CODE_PATTERN.test(bare)) {
    return bare
  }

  return null
}
