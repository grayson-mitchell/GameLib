/**
 * The JS value to string conversion that stays in TypeScript (Phase 84, D-05): the same rules as
 * `convertUnknownToString` in `formatter.ts`, which the native writer cannot reproduce (Errors,
 * Promises, arbitrary objects). The forwarder sends the resulting text; Rust formats the line.
 *
 * Synchronous unless the value is, or contains, a Promise. Never throws: a value that cannot be
 * serialised (a circular object, a BigInt) falls back to `String(value)`, and then to a fixed
 * marker, so a log call can never throw into its caller.
 */
export function stringifyLogValue(value: unknown): string | Promise<string> {
  if (Array.isArray(value)) {
    const parts = value.map(stringifyLogValue)
    if (parts.some((part) => typeof part !== 'string')) {
      return Promise.all(parts).then((resolved) => resolved.join(' '))
    }
    return (parts as string[]).join(' ')
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value.toString()
  }

  if (value instanceof Promise) {
    return value.then(stringifyLogValue)
  }
  if (value instanceof Error) return value.stack ?? value.message

  try {
    // `JSON.stringify(undefined)` is `undefined`, not a string.
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    try {
      return String(value)
    } catch {
      return '[unserializable value]'
    }
  }
}
