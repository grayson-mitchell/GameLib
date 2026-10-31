/**
 * Not a test file. A `t` that resolves against the real en gamelib.json with
 * plural (_one/_other) and {{var}} interpolation, so assertions measure the
 * shipped strings.
 */
import gamelib from '../../../../../../../public/locales/en/gamelib.json'

export function gamelibT(
  key: string,
  a?: string | Record<string, unknown>,
  b?: Record<string, unknown>
): string {
  const opts = (typeof a === 'object' ? a : b) ?? {}
  const walk = (k: string): string | undefined => {
    const v = k
      .split('.')
      .reduce<unknown>(
        (n, p) =>
          n && typeof n === 'object'
            ? (n as Record<string, unknown>)[p]
            : undefined,
        gamelib
      )
    return typeof v === 'string' ? v : undefined
  }
  let found: string | undefined
  if (typeof opts.count === 'number') {
    found = walk(`${key}_${opts.count === 1 ? 'one' : 'other'}`)
  }
  found = found ?? walk(key) ?? (typeof a === 'string' ? a : key)
  return found.replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
    String(opts[k] ?? '')
  )
}
