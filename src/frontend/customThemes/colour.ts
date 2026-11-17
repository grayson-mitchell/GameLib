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

const ratioOf = (
  a: [number, number, number],
  b: [number, number, number]
): number => {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export const contrastRatio = (fg: string, bg: string): number => {
  const a = toRgb(fg)
  const b = toRgb(bg)
  if (!a || !b) throw new Error(`uncomparable colours: ${fg} / ${bg}`)
  return ratioOf(a, b)
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

/**
 * The total colour API for user-typed text (the editor calls it on every
 * keystroke): nothing below throws, whatever the input. The legacy
 * `toRgb`/`contrastRatio` above stay as they were because the theme tests pin
 * their numbers.
 */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const PARSE_NAMED: Record<string, Rgba> = {
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 }
}

const RGB_FN =
  /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)(%?)\s*)?\)$/

/**
 * Accepts #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba() and the five named
 * colours; null for everything else (including var() text and the empty
 * string).
 */
export const parseColour = (input: string): Rgba | null => {
  const text = input.trim().toLowerCase()
  const named = PARSE_NAMED[text]
  if (named) return { ...named }

  const hex = /^#([0-9a-f]+)$/.exec(text)?.[1]
  if (hex !== undefined) {
    if (![3, 4, 6, 8].includes(hex.length)) return null
    const full =
      hex.length <= 4
        ? hex
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : hex
    const byte = (i: number) => parseInt(full.slice(i, i + 2), 16)
    return {
      r: byte(0),
      g: byte(2),
      b: byte(4),
      a: full.length === 8 ? byte(6) / 255 : 1
    }
  }

  const m = RGB_FN.exec(text)
  if (m) {
    const [r, g, b] = [m[1], m[2], m[3]].map(Number)
    if (
      r === undefined ||
      g === undefined ||
      b === undefined ||
      r > 255 ||
      g > 255 ||
      b > 255
    )
      return null
    let a = 1
    if (m[4] !== undefined) {
      const raw = Number(m[4])
      a = m[5] === '%' ? raw / 100 : raw
      if (!Number.isFinite(a) || a > 1) return null
    }
    return { r, g, b, a }
  }
  return null
}

const hexByte = (n: number): string =>
  Math.round(n).toString(16).padStart(2, '0')

/** Lowercase `#rrggbb` when opaque, else `#rrggbbaa` (alpha byte rounded). */
export const normaliseColour = (input: string): string | null => {
  const c = parseColour(input)
  if (!c) return null
  const rgb = `#${hexByte(c.r)}${hexByte(c.g)}${hexByte(c.b)}`
  const alpha = Math.round(c.a * 255)
  return alpha >= 255 ? rgb : `${rgb}${hexByte(alpha)}`
}

/**
 * WCAG contrast between two user-typed colours, or null when either is
 * missing, unparseable or fully transparent. A translucent foreground is
 * composited over the background first; a partly transparent background is
 * measured as opaque, the legacy `toRgb` behaviour the built-in floors were
 * measured with.
 */
export function tryContrast(
  fg: string | undefined,
  bg: string | undefined
): number | null {
  if (fg === undefined || bg === undefined) return null
  const f = parseColour(fg)
  const b = parseColour(bg)
  if (!f || !b || f.a === 0 || b.a === 0) return null
  const over = (top: number, under: number) => top * f.a + under * (1 - f.a)
  return ratioOf(
    [over(f.r, b.r), over(f.g, b.g), over(f.b, b.b)],
    [b.r, b.g, b.b]
  )
}

/** The canonical form of `value`, or `fallback` when it is missing or unparseable. */
export const safeColour = (
  value: string | undefined,
  fallback: string
): string =>
  value === undefined ? fallback : (normaliseColour(value) ?? fallback)

/** One decimal, truncated: 2.96 reads 2.9, never "3.0:1, needs 3:1". */
export const formatRatio = (ratio: number): string =>
  (Math.floor(ratio * 10) / 10).toFixed(1)
