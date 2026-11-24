/**
 * GameLib-owned catalogue of tier-2 known-fix overlays (quick 261027-n77).
 *
 * Per the locked delivery decision, the download URL and EVERY sum are pinned
 * here, in code that ships in the signed app. They are never fetched, and a
 * profile entry can only name an overlay `id` (see validateOverlayEntries);
 * it can never carry a URL or a hash. Tier 2 never comes from the remote
 * layer.
 *
 * Pure data and helpers: no node or electron imports, because the frontend
 * imports the notice URL from here. The JSON import is bundled, not read at run
 * time.
 */

import catalogueJson from './knownFixOverlayCatalogue.json'

type KnownFixOverlayTarget = 'gstreamer-plugin-path'

export interface KnownFixOverlayCatalogueEntry {
  id: string
  target: KnownFixOverlayTarget
  /** Directory, relative to the install dir, that is put on the env var. */
  pluginSubdir: string
  platform: { os: 'darwin'; wine: 'crossover' }
  release: { repo: string; tag: string; asset: string }
  archiveSha256: string
  archiveSize: number
  files: ReadonlyArray<{ path: string; sha256: string; size: number }>
}

/**
 * The pins live in `knownFixOverlayCatalogue.json`, the one file the Rust `gamelib-knownfix` crate
 * compiles in too (Phase 88 D-03), so the two sides cannot name different builds.
 * `knownFixOverlayCatalogue.test.ts` proves this view equals the file.
 */
const CATALOGUE_ENTRIES =
  catalogueJson.entries as ReadonlyArray<KnownFixOverlayCatalogueEntry>

export const KNOWN_FIX_OVERLAY_TARGET_ENV = catalogueJson.targetEnv as Record<
  KnownFixOverlayTarget,
  string
>

/**
 * The process-env keys an overlay's env is resolved against (Phase 88, 88-13, D-03): every target env var plus
 * `GST_PLUGIN_PATH_1_0` (which shadows `GST_PLUGIN_PATH`, so the resolver warns about it). Only these cross to
 * Rust as the base values, never the whole environment (T-88-33).
 */
export const KNOWN_FIX_OVERLAY_BASE_ENV_KEYS: readonly string[] = [
  ...new Set([
    ...Object.values(KNOWN_FIX_OVERLAY_TARGET_ENV),
    'GST_PLUGIN_PATH_1_0'
  ])
]

/** The base-value keys of `env` that are set, as the overlay env resolver takes them. */
export function overlayBaseEnv(
  env: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  const base: Record<string, string> = {}
  for (const key of KNOWN_FIX_OVERLAY_BASE_ENV_KEYS) {
    const value = Object.prototype.hasOwnProperty.call(env, key)
      ? env[key]
      : undefined
    if (value !== undefined) base[key] = value
  }
  return base
}

export const KNOWN_FIX_OVERLAY_CATALOGUE: Readonly<
  Record<string, KnownFixOverlayCatalogueEntry>
> = Object.fromEntries(CATALOGUE_ENTRIES.map((entry) => [entry.id, entry]))

/** Own-property lookup only, so `__proto__` and `constructor` miss. */
export function lookupKnownFixOverlay(
  id: unknown
): KnownFixOverlayCatalogueEntry | undefined {
  if (typeof id !== 'string') return undefined
  return Object.prototype.hasOwnProperty.call(KNOWN_FIX_OVERLAY_CATALOGUE, id)
    ? KNOWN_FIX_OVERLAY_CATALOGUE[id]
    : undefined
}

export function overlayArchiveUrl(entry: KnownFixOverlayCatalogueEntry) {
  const { repo, tag, asset } = entry.release
  return `https://github.com/${repo}/releases/download/${tag}/${asset}`
}

function overlayReleasePageUrl(entry: KnownFixOverlayCatalogueEntry) {
  const { repo, tag } = entry.release
  return `https://github.com/${repo}/releases/tag/${tag}`
}

// The notices page is the release page of the first entry (the one overlay shipped today). An empty
// catalogue is a build mistake, so it fails at load rather than naming no page.
const NOTICES_ENTRY = CATALOGUE_ENTRIES[0]
if (!NOTICES_ENTRY)
  throw new Error('knownFixOverlayCatalogue.json has no entries')

export const KNOWN_FIX_OVERLAY_NOTICES_URL =
  overlayReleasePageUrl(NOTICES_ENTRY)
