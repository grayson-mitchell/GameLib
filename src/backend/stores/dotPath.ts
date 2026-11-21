/**
 * dot-prop 6 paths over plain JSON values (Phase 85, FND-06): the dot-path semantics `conf` 10.2.0
 * gave every TS store, as one module the mirror's local view runs on.
 *
 * This is the TS twin of `gamelib-store`'s `dotpath.rs`, and both replay the same oracle vectors
 * (`dotpath.json`, `keyorder.json`), so the value a `MirrorCell` shows its readers after a local
 * write is the value Rust will persist for the same frame.
 *
 * A path is split on `.`; a segment ending in a backslash joins the next one with a literal dot
 * (`a\.b` is the single key `a.b`). A path with a `__proto__`, `prototype` or `constructor` segment
 * is refused outright: `getPath` and `hasPath` find nothing, `setPath` and `deletePath` change
 * nothing, and nothing is ever assigned through such a segment. `setPath` replaces any non-object on
 * the way down with a fresh `{}`; `deletePath` never prunes a parent. Array levels are walked by
 * canonical decimal indices only: an index past the end fills with `null` (the JSON a JS hole
 * prints as) and deleting an element leaves `null`.
 *
 * With `dotNotation` false (a store opened with `accessPropertiesByDotNotation: false`) the whole
 * string is one literal key and nothing is refused: a `__proto__` key is an ordinary key there, so
 * it is defined as an own property rather than assigned (an assignment would reach the prototype).
 *
 * Key order is JavaScript's own: integer-like keys come first in ascending order, the rest in
 * insertion order, a re-set keeps its place and a delete-then-set moves the key last. Objects built
 * here are plain `{}` literals, so that ordering is the engine's and the `keyorder.json` vectors
 * hold without any ordering code.
 *
 * Pure: mutates only the value it is given, no logger, no IPC, no module state.
 */

type Doc = Record<string, unknown>
type Container = Doc | unknown[]

/** A path segment dot-prop refuses, because it would reach the prototype chain. */
const DISALLOWED_SEGMENTS: readonly string[] = [
  '__proto__',
  'prototype',
  'constructor'
]

const isContainer = (value: unknown): value is Container =>
  typeof value === 'object' && value !== null

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key)

/**
 * `getPathSegments` of dot-prop 6: `null` where dot-prop returns an empty list (a disallowed
 * segment), which makes every operation a no-op. With `dotNotation` false the path is one segment.
 */
export function segments(path: string, dotNotation: boolean): string[] | null {
  if (!dotNotation) return [path]
  const pieces = path.split('.')
  const parts: string[] = []
  for (let i = 0; i < pieces.length; i++) {
    let part = pieces[i] as string
    while (part.endsWith('\\') && i + 1 < pieces.length) {
      part = `${part.slice(0, -1)}.${pieces[++i] as string}`
    }
    parts.push(part)
  }
  return parts.some((s) => DISALLOWED_SEGMENTS.includes(s)) ? null : parts
}

/** The index an array segment names: a canonical non-negative decimal that fits a u32. */
function arrayIndex(segment: string): number | null {
  if (!/^(0|[1-9][0-9]{0,9})$/.test(segment)) return null
  const n = Number(segment)
  return n <= 0xffffffff ? n : null
}

/** Defines `key` as an own enumerable property: `obj['__proto__'] = v` would set the prototype. */
function assignOwn(target: Doc, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    })
    return
  }
  target[key] = value
}

function childOf(node: unknown, segment: string): unknown {
  if (Array.isArray(node)) {
    const i = arrayIndex(segment)
    return i === null ? undefined : node[i]
  }
  if (isContainer(node) && hasOwn(node, segment)) return (node as Doc)[segment]
  return undefined
}

/** The value at `path`, or `undefined` when a step finds nothing. A `null` leaf is a value. */
export function getPath(
  root: unknown,
  path: string,
  dotNotation: boolean
): unknown {
  const parts = segments(path, dotNotation)
  if (parts === null) return undefined
  let cur: unknown = root
  for (const part of parts) {
    cur = childOf(cur, part)
    if (cur === undefined) return undefined
  }
  return cur
}

/** dot-prop's `has`: the leaf exists, whatever its value, and every step reached a container. */
export function hasPath(
  root: unknown,
  path: string,
  dotNotation: boolean
): boolean {
  return getPath(root, path, dotNotation) !== undefined
}

/**
 * Sets `path` to `value` in place. Returns false, and changes nothing, when the path is refused or
 * the root is not a container. The value is stored as given: a caller that must not share it
 * passes a copy.
 */
export function setPath(
  root: unknown,
  path: string,
  value: unknown,
  dotNotation: boolean
): boolean {
  const parts = segments(path, dotNotation)
  if (parts === null || parts.length === 0 || !isContainer(root)) return false
  let cur: Container = root
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as string
    const last = i === parts.length - 1
    if (Array.isArray(cur)) {
      const index = arrayIndex(part)
      // A named property on an array never reaches `JSON.stringify`.
      if (index === null) return false
      while (cur.length <= index) cur.push(null)
      if (last) {
        cur[index] = value
        return true
      }
      if (!isContainer(cur[index])) cur[index] = {}
      cur = cur[index] as Container
    } else {
      if (last) {
        assignOwn(cur, part, value)
        return true
      }
      if (!isContainer(childOf(cur, part))) assignOwn(cur, part, {})
      cur = cur[part] as Container
    }
  }
  return true
}

/**
 * Removes the leaf at `path` in place. Returns whether the walk reached the leaf's container; a
 * missing leaf is not an error and a parent is never pruned.
 */
export function deletePath(
  root: unknown,
  path: string,
  dotNotation: boolean
): boolean {
  const parts = segments(path, dotNotation)
  if (parts === null || parts.length === 0) return false
  const leaf = parts[parts.length - 1] as string
  let cur: unknown = root
  for (const part of parts.slice(0, -1)) {
    cur = childOf(cur, part)
    if (!isContainer(cur)) return false
  }
  if (Array.isArray(cur)) {
    const index = arrayIndex(leaf)
    if (index !== null && index < cur.length) cur[index] = null
    return true
  }
  if (isContainer(cur)) {
    delete (cur as Doc)[leaf]
    return true
  }
  return false
}
