import type { FetchLike } from '../../env'

export interface FetchCall {
  method: string
  url: string
  body: unknown
  headers: Record<string, string>
}

export type Reply =
  | {
      status: number
      json?: unknown
      text?: string
      headers?: Record<string, string>
    }
  | Error

type Route = Reply | Reply[] | ((call: FetchCall) => Reply)

export function createFakeFetch(routes: Record<string, Route>) {
  const calls: FetchCall[] = []
  const queues = new Map<string, Reply[]>()
  let inFlight = 0
  let max = 0

  const fetch: FetchLike = async (url, init) => {
    inFlight++
    max = Math.max(max, inFlight)
    try {
      await Promise.resolve()
      const method = (init?.method ?? 'GET').toUpperCase()
      const headers: Record<string, string> = {}
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v))
      let body: unknown = undefined
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body)
        } catch {
          body = init.body
        }
      }
      const call: FetchCall = { method, url, body, headers }
      calls.push(call)

      const key = `${method} ${url}`
      const route = routes[key]
      let reply: Reply
      if (route === undefined) {
        reply = { status: 404, json: { message: 'Not Found' } }
      } else if (typeof route === 'function') {
        reply = route(call)
      } else if (Array.isArray(route)) {
        if (!queues.has(key)) queues.set(key, [...route])
        const q = queues.get(key) as Reply[]
        reply = q.length > 1 ? (q.shift() as Reply) : q[0]
      } else {
        reply = route
      }
      if (reply instanceof Error) throw reply
      const text =
        reply.text ??
        (reply.json !== undefined ? JSON.stringify(reply.json) : '')
      return new Response(text, {
        status: reply.status,
        headers: reply.headers
      })
    } finally {
      inFlight--
    }
  }

  return { fetch, calls, maxConcurrent: () => max }
}
