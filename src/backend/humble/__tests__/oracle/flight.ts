/**
 * Synthetic Humble responses for the 94-08 oracles: React Flight text, the JS chunk that names a
 * server action, and the library HTML that lists chunks (D-05, D-06). Everything is built from
 * visibly fake values (`fake-gamekey-0001`, `REDACTED` as every key value), because the wire
 * recorder redacts a key value to `REDACTED` before it writes a recording, so a replayed
 * response must already say `REDACTED` for the TS to see what it saw when the golden was written.
 *
 * The builders mirror the shape `adapter.test.ts` fakes for its own cases and the real site's
 * (`0:{"a":"$@1","f":"","b":"x"}` then the result row), and are the single source for both
 * oracles and that test.
 *
 * `compressAdapterGaps` shortens the adapter's two courtesy sleeps (150 ms between chunk fetches,
 * 300 ms between library pages) to zero, so a 200-page run is not a minute of waiting. It changes
 * no request: only the delay between two of them.
 */
import type { SyntheticResponse } from 'backend/testUtils/humbleOracle/wireRecorder'

/** Server-action ids: 40 to 44 hex characters, visibly fake. */
export const LIBRARY_ACTION_ID = 'a'.repeat(42)
export const REDEEM_ACTION_ID = 'b'.repeat(42)
export const REPLACEMENT_ACTION_ID = 'c'.repeat(42)

/** The cookie every oracle case sends; its value is already what the recorder writes. */
export const FAKE_COOKIE = 'ory_session_fake=REDACTED'

/** A key value in a synthetic response (a real one is never typed). */
export const FAKE_KEY_VALUE = 'REDACTED'

export interface FlightKey {
  id: string
  title?: string
  keyIntegrationId?: string | null
  /** `null` while unrevealed. */
  gameKey?: string | null
  redeemedAt?: string | null
  expired?: boolean
  /** A flight date, e.g. `$D2030-01-02T00:00:00.000Z`, or the marker `$undefined`. */
  redemptionExpiryDate?: string
  /** A revealed key's value (`redemptionData.keyFormatted`). */
  keyFormatted?: string | null
  directRedeem?: boolean
}

export interface FlightItem {
  id: string
  title: string
  keys: FlightKey[]
  itemType?: string
}

function flightKey(key: FlightKey): Record<string, unknown> {
  return {
    id: key.id,
    title: key.title,
    keyIntegrationId:
      key.keyIntegrationId === undefined ? 'steam' : key.keyIntegrationId,
    gameKey: key.gameKey ?? null,
    redeemedAt: key.redeemedAt ?? null,
    expired: key.expired ?? false,
    ...(key.redemptionExpiryDate !== undefined
      ? { redemptionExpiryDate: key.redemptionExpiryDate }
      : {}),
    ...(key.keyFormatted !== undefined
      ? { redemptionData: { keyFormatted: key.keyFormatted } }
      : {}),
    ...(key.directRedeem ? { directRedeem: true } : {})
  }
}

function flightItem(item: FlightItem): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    ...(item.itemType ? { itemType: item.itemType } : {}),
    entitlements: { keys: item.keys.map(flightKey), downloads: [] }
  }
}

export interface FlightPageOptions {
  page: number
  totalPages: number
  totalDocs?: number
  items: readonly FlightItem[]
  /** Echoed as `requestId` in the result row (the client increments it). */
  requestId?: string
  /** Row 0's `q`, the query string the server read from the URL. */
  echoedQuery?: string
  /** Extra fields appended to the first result item (to exercise `$undefined` handling). */
  extraResultFields?: Record<string, unknown>
}

/** The text of one `filterUserLibrary` server-action response. */
export function libraryFlightPage(options: FlightPageOptions): string {
  const row0: Record<string, unknown> = {
    a: '$@1',
    f: '',
    b: 'x',
    ...(options.echoedQuery !== undefined ? { q: options.echoedQuery } : {})
  }
  const row1: Record<string, unknown> = {
    results: options.items.map((item) => ({
      ...flightItem(item),
      ...(options.extraResultFields ?? {})
    })),
    bundlesCount: 0,
    pagination: {
      page: options.page,
      totalPages: options.totalPages,
      totalDocs: options.totalDocs ?? options.items.length
    },
    success: true,
    ...(options.requestId !== undefined ? { requestId: options.requestId } : {})
  }
  return `0:${JSON.stringify(row0)}\n1:${JSON.stringify(row1)}\n`
}

/** The text of one `redeemEntitlementAction` response. */
export function redeemFlight(result: unknown): string {
  return `0:{"a":"$@1","f":"","b":"x"}\n1:${JSON.stringify(result)}\n`
}

export const LIBRARY_PATH = '/home/library'

/** The chunk paths a library page lists, in page order. */
export const CHUNK_PATHS = [
  '/_next/static/chunks/aaa.js',
  '/_next/static/chunks/bbb.js',
  '/_next/static/chunks/ccc.js'
] as const

const htmlOf = (paths: readonly string[]): string =>
  `<html><body>${paths.map((p) => `<script src="${p}"></script>`).join('')}</body></html>`

/** The JS a chunk holds when it names `actionName`'s server-action id. */
function chunkNaming(actionId: string, actionName: string): string {
  return `x=createServerReference("${actionId}",e.callServer,void 0,e.findSourceMapURL,"${actionName}")`
}

const ok = (
  target: string,
  contentType: string,
  body: string,
  method = 'GET'
): SyntheticResponse => ({
  method,
  target,
  status: 200,
  headers: [['content-type', contentType]],
  body
})

export interface DiscoveryOptions {
  /** The page the HTML is fetched from: `/home/library` or `/home/library/<gamekey>`. */
  pagePath: string
  actionId: string
  actionName: 'filterUserLibrary' | 'redeemEntitlementAction'
  /** Which of `CHUNK_PATHS` holds the id (index), or `null` for none. Default 1. */
  holder?: number | null
  /** The chunks the HTML lists, default all three. */
  listed?: readonly string[]
  /** The chunks to answer, in the order the adapter fetches them (default: every listed one). */
  fetched?: readonly string[]
}

/** The synthetic answers of one discovery: the HTML, then the chunks that get fetched. */
export function discoveryResponses(
  options: DiscoveryOptions
): SyntheticResponse[] {
  const listed = options.listed ?? CHUNK_PATHS
  const holder = options.holder === undefined ? 1 : options.holder
  const holderPath = holder === null ? undefined : CHUNK_PATHS[holder]
  const fetched = options.fetched ?? listed
  return [
    ok(options.pagePath, 'text/html', htmlOf(listed)),
    ...fetched.map((chunk) =>
      ok(
        chunk,
        'application/javascript',
        chunk === holderPath
          ? chunkNaming(options.actionId, options.actionName)
          : 'nothing'
      )
    )
  ]
}

export interface PagesOptions {
  pageSize?: number
  totalDocs?: number
  /** Adds `requestId` to every page's result row (the page number). */
  requestIds?: boolean
  /** Replaces the page number in the pagination block (a server that ignores paging). */
  reportedPage?: (page: number) => number
}

/** The synthetic POST answers for walking `items`, five to a page like the real site. */
export function libraryPageResponses(
  items: readonly FlightItem[],
  options: PagesOptions = {}
): SyntheticResponse[] {
  const size = options.pageSize ?? 5
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  const out: SyntheticResponse[] = []
  for (let page = 1; page <= totalPages; page++) {
    const slice = items.slice((page - 1) * size, page * size)
    out.push(
      ok(
        page > 1 ? `${LIBRARY_PATH}?page=${page}` : LIBRARY_PATH,
        'text/x-component',
        libraryFlightPage({
          page: options.reportedPage?.(page) ?? page,
          totalPages,
          totalDocs: options.totalDocs ?? items.length,
          items: slice,
          requestId: options.requestIds ? String(page) : undefined
        }),
        'POST'
      )
    )
  }
  return out
}

/** One synthetic POST answer with a chosen status, content type and body. */
export function postAnswer(
  target: string,
  status: number,
  body = '',
  contentType = 'text/x-component',
  extraHeaders: [string, string][] = []
): SyntheticResponse {
  return {
    method: 'POST',
    target,
    status,
    headers: [['content-type', contentType], ...extraHeaders],
    body
  }
}

/** One synthetic GET answer. */
export function getAnswer(
  target: string,
  status: number,
  body = '',
  contentType = 'text/html',
  extraHeaders: [string, string][] = []
): SyntheticResponse {
  return {
    method: 'GET',
    target,
    status,
    headers: [['content-type', contentType], ...extraHeaders],
    body
  }
}

/** A whole-library answer set: discovery of the library action, then every page. */
export function fullLibraryResponses(
  items: readonly FlightItem[],
  options: PagesOptions = {}
): SyntheticResponse[] {
  return [
    ...discoveryResponses({
      pagePath: LIBRARY_PATH,
      actionId: LIBRARY_ACTION_ID,
      actionName: 'filterUserLibrary'
    }),
    ...libraryPageResponses(items, options)
  ]
}

/** The reveal's discovery of the redeem action from `/home/library/<gamekey>`. */
export function redeemDiscoveryResponses(
  gamekey: string,
  actionId = REDEEM_ACTION_ID
): SyntheticResponse[] {
  return discoveryResponses({
    pagePath: `${LIBRARY_PATH}/${encodeURIComponent(gamekey)}`,
    actionId,
    actionName: 'redeemEntitlementAction',
    holder: 0,
    listed: [CHUNK_PATHS[0]]
  })
}

/** The synthetic POST answer of a reveal to `/home/library/<gamekey>`. */
export function redeemAnswer(
  gamekey: string,
  status: number,
  body: string,
  contentType = 'text/x-component',
  extraHeaders: [string, string][] = []
): SyntheticResponse {
  return postAnswer(
    `${LIBRARY_PATH}/${encodeURIComponent(gamekey)}`,
    status,
    body,
    contentType,
    extraHeaders
  )
}

/**
 * Makes the adapter's courtesy sleeps (150 ms between chunk fetches, 300 ms between pages) zero.
 * Only a delay of exactly those two values is shortened; the axios and fetch timeouts and the
 * Steam resolver's gap pass through untouched. Returns the restore.
 */
export function compressAdapterGaps(): () => void {
  const real = global.setTimeout
  const spy = jest
    .spyOn(global, 'setTimeout')
    .mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) =>
      (real as (...a: unknown[]) => NodeJS.Timeout)(
        fn,
        ms === 150 || ms === 300 ? 0 : ms,
        ...args
      )) as unknown as typeof setTimeout)
  return () => spy.mockRestore()
}
