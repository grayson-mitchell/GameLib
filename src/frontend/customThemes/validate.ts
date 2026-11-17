/**
 * Colour and gradient value validation for custom-theme tokens (Phase 64, D-14). Relative
 * imports only so the module stays bundle-safe.
 */
import { normaliseColour } from './colour'

export type SupportsFn = (property: string, value: string) => boolean

// A gradient is the only non-colour token value. Anything that could fetch (`url(`), alias
// (`var(`), end the declaration (`;`, `{`, `}`, `@`, `!important`) or hide any of those from
// this scan (a backslash escape) is refused BEFORE the engine is asked (T-64-12): the CSP
// `img-src` allows https:, so a `url()` here would be a network fetch on every app start.
const GRADIENT_DENY = /var\(|url\(|;|\{|\}|@|!important|\\/i
const GRADIENT_START = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i

// Fails closed: with no `CSS.supports` (jsdom, node, an old engine) no gradient is accepted.
const defaultSupports: SupportsFn = (property, value) => {
  const css = (
    globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }
  ).CSS
  if (typeof css?.supports !== 'function') return false
  return css.supports(property, value)
}

export function validateColourInput(
  text: string
): { ok: true; value: string } | { ok: false } {
  const value = normaliseColour(text)
  return value === null ? { ok: false } : { ok: true, value }
}

export function isValidGradient(
  text: string,
  supports: SupportsFn = defaultSupports
): boolean {
  const candidate = text.trim()
  if (GRADIENT_DENY.test(candidate)) return false
  if (!GRADIENT_START.test(candidate) || !candidate.endsWith(')')) return false
  return supports('background-image', candidate)
}

export const looksLikeGradient = (value: string): boolean =>
  GRADIENT_START.test(value.trim())

export function isValidTokenValue(
  _name: string,
  value: string,
  supports?: SupportsFn
): boolean {
  return looksLikeGradient(value)
    ? isValidGradient(value, supports)
    : validateColourInput(value).ok
}
