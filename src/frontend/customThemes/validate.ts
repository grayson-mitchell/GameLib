/**
 * Colour and gradient value validation for custom-theme tokens (Phase 64, D-14). Relative
 * imports only so the module stays bundle-safe.
 */
import { normaliseColour } from './colour'

export type SupportsFn = (property: string, value: string) => boolean

// A gradient is the only non-colour token value, and it is exactly ONE gradient function.
// `CSS.supports` validates grammar only, and a second comma-separated image layer is grammatical:
// WKWebView returned true for a linear-gradient followed by image-set("https://...") (64-REVIEW
// CR-01). The CSP `img-src` allows https:, so that layer would be a network fetch on every app
// start. The one-layer rule therefore runs BEFORE the engine is asked (T-64-12, T-64-21).
// Anything that could fetch (`url(`), alias (`var(`), end the declaration (`;`, `{`, `}`, `@`,
// `!important`) or hide any of those from this scan (a backslash escape) is refused too. So are
// the image functions that take a URL or a string (`image-set(`, which also matches the
// `-webkit-` form, `cross-fade(`, `element(`, `src(`), quote characters and comments. With
// quotes, backslashes and comments refused, the character-level paren walk below sees the same
// nesting the CSS tokenizer does, so one layer cannot be faked.
const GRADIENT_DENY =
  /var\(|url\(|image-set\(|cross-fade\(|element\(|src\(|\/\*|["']|;|\{|\}|@|!important|\\/i
// Gradient tokens are named `--gradient-*`. The four real ones are --gradient-01, --gradient-02,
// --gradient-gamecard (all in the built-in seeds) and the live-derived --gradient-body-background
// (in no seed, OD-1), so the rule is the name prefix, not "the seed value is a gradient" (IN-03).
const GRADIENT_TOKEN_PATTERN = /^--gradient-/
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
  const start = GRADIENT_START.exec(candidate)
  if (!start || !candidate.endsWith(')')) return false
  // Walk from the gradient's own opening paren: it must close at the final character and
  // nowhere earlier, so a second layer (or a stray paren) cannot ride along.
  let depth = 0
  for (let i = start[0].length - 1; i < candidate.length; i++) {
    const ch = candidate[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0 && i !== candidate.length - 1) return false
    }
  }
  if (depth !== 0) return false
  return supports('background-image', candidate)
}

export const looksLikeGradient = (value: string): boolean =>
  GRADIENT_START.test(value.trim())

export function isValidTokenValue(
  name: string,
  value: string,
  supports?: SupportsFn
): boolean {
  // A gradient is valid only for a gradient token, so one cannot be planted in a colour
  // token such as `--accent` (IN-03). A colour value on a gradient token stays accepted.
  return looksLikeGradient(value)
    ? GRADIENT_TOKEN_PATTERN.test(name) && isValidGradient(value, supports)
    : validateColourInput(value).ok
}
