// debug/cross-depot-collision-1026: recover Steam's REAL appinfo depot order.
//
// PICS returns an app's appinfo as VDF text whose `depots` section lists depot
// ids in a meaningful order (XCOM 200510: 225341 ... 200522). steam-user hands
// us `VDF.parse(text).appinfo`, a plain JS object -- and a JS object enumerates
// integer-like keys in ASCENDING NUMERIC order regardless of insertion order,
// so by the time getProductInfo resolves, the order is gone (200522 sorts
// first). The raw text is only visible inside steam-user's ClientPICSProductInfo
// response callback, which getProductInfo does not expose.
//
// So this module taps that one callback (per client, installed once) and reads
// the depot ids straight out of the raw VDF text, in textual order. Nothing
// here substitutes numeric order, gid or anything else: when no raw text was
// observed for an app, `getAppInfoDepotOrder` returns undefined and the caller
// must treat order as UNKNOWN.

import { logWarning, LogPrefix } from 'backend/logger'

/** EMsg.ClientPICSProductInfoRequest (steam-user EMsg table, value 8903). */
const PICS_PRODUCT_INFO_REQUEST = 8903

/** appId -> depot ids in the order they appear in the raw appinfo VDF. */
const orderByApp = new Map<string, string[]>()

type Token = string | '{' | '}'

function* tokenize(text: string): Generator<{ t: Token; quoted: boolean }> {
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === '{' || c === '}') {
      yield { t: c, quoted: false }
      i++
    } else if (c === '"') {
      i++
      let s = ''
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          i++
          const e = text[i]
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e
        } else s += text[i]
        i++
      }
      i++
      yield { t: s, quoted: true }
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++
    } else if (/\s/.test(c)) {
      i++
    } else {
      let s = ''
      while (i < n && !/[\s{}"]/.test(text[i])) s += text[i++]
      yield { t: s, quoted: true }
    }
  }
}

/**
 * Depot ids of the top-level `appinfo.depots` block, in the order they appear
 * in the raw VDF text. Only direct children of `depots` that are blocks are
 * returned (`branches`, `baselanguages`, `hasdepotsindlc` etc. are excluded by
 * the numeric-id filter). Returns undefined when the text has no depots block.
 */
export function extractDepotOrder(vdfText: string): string[] | undefined {
  let depth = 0
  // key stack, one entry per open block
  const stack: string[] = []
  let pendingKey: string | undefined
  let expectValue = false
  let found = false
  const order: string[] = []

  for (const { t, quoted } of tokenize(vdfText)) {
    if (!quoted && t === '{') {
      stack.push(pendingKey ?? '')
      depth++
      if (
        depth === 3 &&
        stack[1]?.toLowerCase() === 'depots' &&
        /^\d+$/.test(stack[2])
      ) {
        order.push(stack[2])
      }
      if (depth === 2 && stack[1]?.toLowerCase() === 'depots') found = true
      pendingKey = undefined
      expectValue = false
    } else if (!quoted && t === '}') {
      stack.pop()
      depth--
      pendingKey = undefined
      expectValue = false
    } else if (expectValue) {
      // scalar value; consumed
      expectValue = false
      pendingKey = undefined
    } else {
      pendingKey = t
      expectValue = true
      // a key followed by '{' is a block; followed by a string it is a scalar.
      // expectValue is cleared by the '{' branch above.
    }
  }
  return found ? order : undefined
}

/** Depot ids of `appId` in raw appinfo order, or undefined when never observed. */
export function getAppInfoDepotOrder(appId: string): string[] | undefined {
  return orderByApp.get(appId)
}

/** Test seam. */
export function recordAppInfoDepotOrder(appId: string, ids: string[]): void {
  orderByApp.set(appId, ids)
}

/** Test seam. */
export function clearAppInfoDepotOrder(): void {
  orderByApp.clear()
}

interface PicsApp {
  appid?: number
  buffer?: Buffer
}

const active = new WeakMap<object, { depth: number; original: unknown }>()

/**
 * Run `fn` (a getProductInfo call) with a tap on the client's PICS
 * product-info responses so the raw appinfo VDF text is seen. The tap is
 * installed only for the duration of `fn` (ref-counted for overlapping calls)
 * and the client's own `_send` is restored afterwards, so nothing else ever
 * observes a replaced method. It never alters what steam-user does: the
 * original callback is invoked unchanged and any failure in the tap is
 * swallowed (order then simply stays unknown for that app).
 */
export async function withAppInfoOrderCapture<T>(
  client: object,
  fn: () => Promise<T>
): Promise<T> {
  const c = client as { _send?: (...args: unknown[]) => unknown }
  if (typeof c._send !== 'function') return fn()

  let state = active.get(client)
  if (!state) {
    const original = c._send
    state = { depth: 0, original }
    active.set(client, state)
    const wrapper = function (this: unknown, ...args: unknown[]) {
      try {
        const head = args[0]
        const msg =
          typeof head === 'object' && head !== null
            ? (head as { msg?: number }).msg
            : head
        const cb = args[2]
        if (msg === PICS_PRODUCT_INFO_REQUEST && typeof cb === 'function') {
          args[2] = (
            body: { apps?: PicsApp[] } | undefined,
            ...rest: unknown[]
          ) => {
            try {
              for (const app of body?.apps ?? []) {
                if (app?.appid === undefined || !app.buffer) continue
                const ids = extractDepotOrder(app.buffer.toString('utf8'))
                if (ids) orderByApp.set(String(app.appid), ids)
              }
            } catch (err) {
              logWarning(
                `appinfoOrder: could not read raw appinfo order: ${String(err)}`,
                LogPrefix.Steam
              )
            }
            return (cb as (...a: unknown[]) => unknown).call(
              this,
              body,
              ...rest
            )
          }
        }
      } catch {
        // never break the send path
      }
      return original.apply(this, args)
    }
    c._send = wrapper
  }
  state.depth++
  try {
    return await fn()
  } finally {
    state.depth--
    if (state.depth === 0) {
      c._send = state.original as (...args: unknown[]) => unknown
      active.delete(client)
    }
  }
}
