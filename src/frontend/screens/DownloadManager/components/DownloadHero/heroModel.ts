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
