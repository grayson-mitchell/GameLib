import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  __resetOutboundHttpForTests,
  destroyOutboundHttp,
  installOutboundHttpTracking,
  liveOutboundRequestCount
} from '../outboundHttpRegistry'

let server: http.Server
let port: number
let okHits = 0
const privateAgents: http.Agent[] = []

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const settle = (req: http.ClientRequest) =>
  new Promise<{ error?: Error }>((resolve) => {
    let error: Error | undefined
    req.on('error', (e) => {
      error = e
    })
    req.on('close', () => resolve({ error }))
  })

const hang = (
  path = '/hang',
  opts: http.RequestOptions = {}
): http.ClientRequest => {
  const req = http.get({ host: '127.0.0.1', port, path, ...opts })
  req.on('error', () => undefined)
  return req
}

const waitForLive = async (n: number) => {
  for (let i = 0; i < 100 && liveOutboundRequestCount() < n; i++) {
    await sleep(5)
  }
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.startsWith('/hang')) {
      res.writeHead(200)
      res.write('chunk')
      return
    }
    okHits++
    res.end('ok')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  port = (server.address() as AddressInfo).port
})

beforeEach(() => {
  okHits = 0
  installOutboundHttpTracking()
  __resetOutboundHttpForTests()
})

afterEach(() => {
  destroyOutboundHttp()
  __resetOutboundHttpForTests()
  server.closeAllConnections()
  while (privateAgents.length) privateAgents.pop()?.destroy()
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((r) => server.close(() => r()))
})

describe('outboundHttpRegistry', () => {
  it('destroys in-flight requests on the global agent and a private keepAlive agent', async () => {
    const agent = new http.Agent({ keepAlive: true })
    privateAgents.push(agent)
    const a = hang('/hang')
    const b = hang('/hang', { agent })
    const pa = settle(a)
    const pb = settle(b)
    await waitForLive(2)
    expect(liveOutboundRequestCount()).toBe(2)
    const res = destroyOutboundHttp()
    expect(res.destroyed).toBe(2)
    expect(res.hosts).toContain('127.0.0.1')
    const [ra, rb] = await Promise.all([pa, pb])
    expect(ra.error).toBeDefined()
    expect(rb.error).toBeDefined()
    expect(liveOutboundRequestCount()).toBe(0)
  })

  it('counts and destroys a response whose body is never read', async () => {
    const req = http.get({ host: '127.0.0.1', port, path: '/hang' })
    req.on('error', () => undefined)
    const gotResponse = new Promise<void>((r) => req.on('response', () => r()))
    await gotResponse
    expect(liveOutboundRequestCount()).toBe(1)
    expect(destroyOutboundHttp().destroyed).toBe(1)
  })

  it('drops a completed request from the registry', async () => {
    const req = http.get({ host: '127.0.0.1', port, path: '/ok' })
    req.on('response', (res) => res.resume())
    await settle(req)
    expect(liveOutboundRequestCount()).toBe(0)
    expect(destroyOutboundHttp().destroyed).toBe(0)
  })

  it('refuses new requests after destroy', async () => {
    destroyOutboundHttp()
    const req = http.get({ host: '127.0.0.1', port, path: '/ok' })
    const { error } = await settle(req)
    expect(error?.message).toContain('sidecar shutting down')
    expect(okHits).toBe(0)
  })

  it('does not track or destroy WebSocket upgrade requests', async () => {
    const req = hang('/hang', {
      headers: { Connection: 'Upgrade', Upgrade: 'websocket' }
    })
    let errored = false
    req.on('error', () => {
      errored = true
    })
    await sleep(50)
    expect(liveOutboundRequestCount()).toBe(0)
    destroyOutboundHttp()
    await sleep(300)
    expect(errored).toBe(false)
    req.destroy()
  })

  it('subscribes once when installed twice', async () => {
    installOutboundHttpTracking()
    installOutboundHttpTracking()
    hang('/hang')
    await waitForLive(1)
    expect(liveOutboundRequestCount()).toBe(1)
  })

  it('reports de-duplicated hostnames without path or query', async () => {
    hang('/hang?token=secret')
    hang('/hang?token=secret2')
    await waitForLive(2)
    const { hosts } = destroyOutboundHttp()
    expect(hosts).toEqual(['127.0.0.1'])
    for (const h of hosts) {
      expect(h).not.toContain('secret')
      expect(h).not.toContain('/')
    }
  })
})
