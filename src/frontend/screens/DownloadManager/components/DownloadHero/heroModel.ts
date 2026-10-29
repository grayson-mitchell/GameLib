/**
 * Pure helpers for the Download Manager hero (quick 261012-dhs, D-04).
 * Kept free of React so the art-precedence and percent rules are unit-testable
 * in this no-jsdom jest project.
 */

interface HeroArtInfo {
  art_background?: string
  art_cover?: string
  art_square?: string
}

/**
 * Orders the hero's artwork candidates: background first, then cover, then
 * square. Falsy values are dropped and duplicates collapsed; the first
 * survivor is the `src`, the rest are `CachedImage` fallbacks. Returns `null`
 * when the game has no artwork at all.
 */
export function heroArtSources(
  info?: HeroArtInfo
): { src: string; fallback: string[] } | null {
  if (!info) return null

  const ordered: string[] = []
  for (const candidate of [
    info.art_background,
    info.art_cover,
    info.art_square
  ]) {
    if (candidate && !ordered.includes(candidate)) {
      ordered.push(candidate)
    }
  }

  const [src, ...fallback] = ordered
  return src === undefined ? null : { src, fallback }
}

interface HeroCoverInfo {
  art_cover?: string
  art_square?: string
  overrides?: { art_cover?: string; art_square?: string }
}

/**
 * Orders the hero's 3:4 cover tile candidates: override portrait, portrait
 * `art_square`, override landscape, landscape `art_cover`. Portrait comes first
 * because the tile is 3:4 and `art_square` is the portrait art (for Steam,
 * library_600x900; `art_cover` is the landscape header.jpg). This mirrors the
 * Library GameCard precedence. Falsy values are dropped and duplicates
 * collapsed; returns `null` when there is no art.
 */
export function heroCoverSources(
  info?: HeroCoverInfo
): { src: string; fallback: string[] } | null {
  if (!info) return null

  const ordered: string[] = []
  for (const candidate of [
    info.overrides?.art_square,
    info.art_square,
    info.overrides?.art_cover,
    info.art_cover
  ]) {
    if (candidate && !ordered.includes(candidate)) {
      ordered.push(candidate)
    }
  }

  const [src, ...fallback] = ordered
  return src === undefined ? null : { src, fallback }
}

/**
 * The bar's fill percent: 0 when nothing is downloading or the value is not a
 * finite number, otherwise clamped to 0..100.
 */
export function heroPercent(
  hasElement: boolean,
  percent: number | undefined
): number {
  if (!hasElement || typeof percent !== 'number' || !Number.isFinite(percent)) {
    return 0
  }
  return Math.min(100, Math.max(0, percent))
}

/** A post-download step the hero names instead of showing transfer stats. */
export type HeroPhase =
  | { kind: 'redist'; context: string }
  | { kind: 'drm-setup'; context: string }
  | { kind: 'steam-syncing'; context: string }
  | { kind: 'finishing' }

/**
 * Quick 261029-exu: a bridge install keeps its queue slot after the depot
 * download while it installs redists and prefetches DRM support. Maps the
 * game's status to that phase, or `null` while it is genuinely downloading.
 */
export function heroPhase(entry?: {
  status?: string
  context?: string
}): HeroPhase | null {
  if (!entry) return null
  if (entry.status === 'redist') {
    return { kind: 'redist', context: entry.context ?? '' }
  }
  if (entry.status === 'drm-setup') {
    return { kind: 'drm-setup', context: entry.context ?? '' }
  }
  if (entry.status === 'steam-syncing') {
    return { kind: 'steam-syncing', context: entry.context ?? '' }
  }
  if (
    entry.status === 'installing' &&
    entry.context === 'steam-bridge-finishing'
  ) {
    return { kind: 'finishing' }
  }
  return null
}
