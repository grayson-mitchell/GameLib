/**
 * The one origin table (Phase 40 Plan 09, D-31/D-34/D-35/D-05).
 *
 * Every host-based decision this screen makes -- "is a stored URL still valid for its store",
 * "does a store-page deep link belong to a configured store", "is that store's origin embeddable
 * at all" -- reads from this table instead of five independent ad-hoc substring checks (the
 * retired `validStoredUrl`, which tested whether `url` contained `'gog.com'` -- and four
 * siblings -- as a substring of the WHOLE url string).
 *
 * MATCHING RULE (D-31): the URL's HOSTNAME must equal an apex exactly, or be a dot-prefixed
 * SUFFIX of one -- never a substring test on the whole URL (a bare "does this URL contain the
 * apex" check happily passes `https://attacker.net/?x=gog.com`), and never a bare
 * `hostname.endsWith(apex)` without the
 * leading dot (`evilgog.com` still ends with the literal characters `gog.com`). This project has
 * already shipped one production defect from omitting exactly that boundary
 * (F-34.4.2-19, `cookie_domain_matches` in `src-tauri/src/main.rs`). This file is the
 * TypeScript-side sibling of that discipline, not a port of that function -- the two run in
 * different processes against different inputs (a cookie's `domain` attribute vs. a URL's
 * `hostname`) and there is no shared call surface between them.
 *
 * HTTPS-ONLY (D-31): a store origin reached over http is not the store origin this table means --
 * the chrome's insecure-scheme handling is the only place a non-https store URL should ever
 * appear.
 */

export interface StoreEmbedConfig {
  /** The store identity used for the restore key, the user agent, and the history stack (D-35). */
  key: string
  /** Exact-or-dot-suffix match targets, checked against `new URL(url).hostname`. */
  apexHosts: string[]
  /** The store's canonical start URL -- parity with `index.tsx`'s route map, informational only. */
  startUrl: string
  /** False for Epic (D-05): still a KNOWN store origin for the deep-link/stored-URL checks, but never embedded. */
  embeddable: boolean
}

// Measured from the surviving route map (`index.tsx`'s `urls`) at plan time. GOG's start URL is
// an affiliate host (`af.gog.com`), a subdomain of the `gog.com` apex -- covered by the suffix
// rule below and proven by this file's own test suite rather than assumed.
const STORE_EMBED_ORIGINS: readonly StoreEmbedConfig[] = [
  {
    key: 'epic',
    apexHosts: ['epicgames.com'],
    startUrl: 'https://www.epicgames.com/store/en-US/',
    embeddable: false
  },
  {
    key: 'gog',
    apexHosts: ['gog.com'],
    startUrl: 'https://af.gog.com?as=1838482841',
    embeddable: true
  },
  {
    key: 'amazon',
    apexHosts: ['gaming.amazon.com'],
    startUrl: 'https://gaming.amazon.com',
    embeddable: true
  },
  {
    key: 'zoom',
    apexHosts: ['zoom-platform.com'],
    startUrl: 'https://www.zoom-platform.com',
    embeddable: true
  },
  {
    key: 'steam',
    apexHosts: ['store.steampowered.com'],
    startUrl: 'https://store.steampowered.com/',
    embeddable: true
  }
]

function hostMatchesApex(hostname: string, apex: string): boolean {
  return hostname === apex || hostname.endsWith(`.${apex}`)
}

/**
 * Resolves a URL to its configured store, or `null` if it belongs to none of them. Never throws:
 * an unparseable URL is exactly as "not a configured store" as any other non-matching URL.
 */
export function resolveStoreForUrl(url: string): StoreEmbedConfig | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') {
    return null
  }
  for (const config of STORE_EMBED_ORIGINS) {
    if (config.apexHosts.some((apex) => hostMatchesApex(parsed.hostname, apex))) {
      return config
    }
  }
  return null
}

/** `true` only for a URL that resolves to a KNOWN and EMBEDDABLE store (D-05 excludes Epic). */
export function isEmbeddableOrigin(url: string): boolean {
  const config = resolveStoreForUrl(url)
  return config !== null && config.embeddable
}
