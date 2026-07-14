/**
 * CodeWeavers publishes per-title CrossOver compatibility pages at a
 * predictable, constructed-slug path. There is no search API — the slug is
 * derived from the game title (see `slugify` in ./utils).
 */
export const BASE_URL = 'https://www.codeweavers.com/compatibility/crossover'

/**
 * CodeWeavers sits behind Cloudflare, which serves a challenge/blocked
 * response to non-browser User-Agents (axios' default `axios/x.y` included).
 * Send a desktop browser UA so the real HTML page is returned. Mirrors the
 * same workaround used for AppleGamingWiki / HowLongToBeat.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * D-03: CodeWeavers does NOT return a real HTTP 404 for an unknown slug —
 * every response (hit or miss) is HTTP 200. A miss is a "soft-404": HTTP 200
 * with a page titled "404 Not Found | CodeWeavers" and no `VideoGame`
 * JSON-LD node. Hit/miss MUST be decided by this content signal, never by
 * response.status (spike/crossover-compat-FINDINGS.md — "Critical protocol
 * correction").
 */
export const SOFT_404_TITLE_RE = /<title>\s*404 Not Found/i

/**
 * Matches the first `<script type="application/ld+json">...</script>` block
 * on a CodeWeavers compatibility page. Non-greedy (`[\s\S]*?`) so a
 * pathological/huge response body cannot cause catastrophic backtracking
 * (T-16-02).
 */
export const ldJsonRegEx =
  /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
