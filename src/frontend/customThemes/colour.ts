/**
 * Colour math shared by the theme-token tests and the theme generator
 * (D-16). Relative imports only: `meta/runTs.cjs` does not honour the
 * tsconfig `baseUrl`.
 */

export const NAMED_COLOURS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  // CSS `gray` -- what --border-color and three themes' --divider resolve to.
  gray: '#808080'
}

export const toRgb = (colour: string): [number, number, number] | null => {
  const c = (NAMED_COLOURS[colour.toLowerCase()] ?? colour).trim()
  const m = /^#([0-9a-f]{3,8})$/i.exec(c)
  if (!m) return null
  let hex = m[1] ?? ''
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('')
  if (hex.length === 8) hex = hex.slice(0, 6) // opaque alpha
  if (hex.length !== 6) return null
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number
  ]
}

const relativeLuminance = ([r, g, b]: [number, number, number]): number => {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export const contrastRatio = (fg: string, bg: string): number => {
  const a = toRgb(fg)
  const b = toRgb(bg)
  if (!a || !b) throw new Error(`uncomparable colours: ${fg} / ${bg}`)
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Mixes two colours already resolved to a `toRgb`-acceptable literal, channel
 * by channel, as `weightA·a + (1-weightA)·b` (weightA a 0-1 fraction).
 * Rounded to the nearest integer per channel and returned as a 6-digit
 * lowercase hex string.
 */
export const mixSrgb = (a: string, b: string, weightA: number): string => {
  const rgbA = toRgb(a)
  const rgbB = toRgb(b)
  if (!rgbA || !rgbB) {
    throw new Error(`mixSrgb: uncomparable colours: ${a} / ${b}`)
  }
  const mixed = rgbA.map((channelA, i) =>
    Math.round(channelA * weightA + (rgbB[i] ?? 0) * (1 - weightA))
  )
  return (
    '#' + mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')
  )
}
