/**
 * Colour and gradient value validation for custom-theme tokens (Phase 64, D-14). Relative
 * imports only so the module stays bundle-safe.
 */

export type SupportsFn = (property: string, value: string) => boolean

export function validateColourInput(
  _text: string
): { ok: true; value: string } | { ok: false } {
  return { ok: false }
}

export function isValidGradient(
  _text: string,
  _supports?: SupportsFn
): boolean {
  return false
}

export function isValidTokenValue(
  _name: string,
  _value: string,
  _supports?: SupportsFn
): boolean {
  return false
}
