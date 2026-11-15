// debug/cross-depot-collision-1026: recover Steam's REAL appinfo depot order.
//
// PICS appinfo is VDF text whose `depots` section lists depot ids in a meaningful order (XCOM
// 200510: 225341 ... 200522). A JS object enumerates integer-like keys in ASCENDING NUMERIC order,
// so once appinfo is parsed into a plain object the order is gone. The Rust CM client parses the
// raw VDF text in textual order and returns it as `apps[id].depotOrder` on every product-info
// result (79-22); this module records that, and nothing else. Nothing here substitutes numeric
// order, gid or anything else: when no order was observed for an app, `getAppInfoDepotOrder`
// returns undefined and the caller must treat order as UNKNOWN.

export interface AppinfoOrder {
  /** Depot ids of `appId` in raw appinfo order, or undefined when never observed. */
  getAppInfoDepotOrder(appId: string): string[] | undefined
  /** Runs `fn` (a getProductInfo call) and records `depotOrder` from its result. */
  withAppInfoOrderCapture<T>(client: object, fn: () => Promise<T>): Promise<T>
}

/** Depot ids as strings when `v` is an array of numeric ids (number or numeric string). */
function toOrder(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: string[] = []
  for (const x of v) {
    const id = typeof x === 'number' ? String(x) : x
    if (typeof id !== 'string' || !/^\d+$/.test(id)) return undefined
    out.push(id)
  }
  return out
}

/**
 * The depot order recorder, as one instance (D-05, 66.4-09): the appId -> order map is a closure
 * field. Construction allocates an empty container only: no I/O, timer or handle (sidecar exit
 * contract).
 */
export function createAppinfoOrder(): AppinfoOrder {
  /** appId -> depot ids in the order they appear in the raw appinfo VDF. */
  const orderByApp = new Map<string, string[]>()

  /** Records `apps[id].depotOrder` from a product-info result (no-op for other shapes). */
  function recordDepotOrder(result: unknown): void {
    const apps = (result as { apps?: unknown } | null | undefined)?.apps
    if (typeof apps !== 'object' || apps === null) return
    for (const [id, entry] of Object.entries(apps)) {
      const order = toOrder(
        (entry as { depotOrder?: unknown } | null)?.depotOrder
      )
      if (order) orderByApp.set(id, order)
    }
  }

  async function withAppInfoOrderCapture<T>(
    _client: object,
    fn: () => Promise<T>
  ): Promise<T> {
    const result = await fn()
    recordDepotOrder(result)
    return result
  }

  return {
    getAppInfoDepotOrder: (appId) => orderByApp.get(appId),
    withAppInfoOrderCapture
  }
}
