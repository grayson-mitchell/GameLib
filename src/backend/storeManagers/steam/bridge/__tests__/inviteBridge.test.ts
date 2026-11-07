/**
 * Phase 58 Plan 31: inviteBridge control client against an in-test TCP server
 * speaking the real frame protocol.
 */
import { at } from '../../__tests__/fixtures/indexed'
import { createServer, Server, Socket } from 'node:net'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logInfo } from 'backend/logger'
import { listBridgeFriends, sendBridgeInvite } from '../inviteBridge'
import { getBridgeHelperConnection } from '../helperRegistry'
import {
  CONTROL_ORDINAL,
  CONTROL_SLOT,
  HELLO_ROLE_PROBE,
  STATUS_ERR,
  STATUS_OK,
  encodeResponse,
  decodeRequest
} from '../protocol'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../helperRegistry', () => ({ getBridgeHelperConnection: jest.fn() }))

const SECRET = 'ab'.repeat(32)
const mockedConn = getBridgeHelperConnection as jest.Mock

interface Seen {
  helloRole: number | null
  slot: number | null
  args: Buffer | null
  closed: boolean
}

let server: Server
let sockets: Socket[] = []
let seen: Seen
let helloStatus = STATUS_OK
let controlStatus = STATUS_OK
let controlReply: Buffer = Buffer.alloc(0)
let silent = false

function friendPayload(): Buffer {
  const name = Buffer.from('Alice')
  const b = Buffer.alloc(4 + 8 + name.length)
  b.writeUInt32LE(1, 0)
  b.writeUInt32LE(2, 4)
  b[8] = 1
  b[9] = 0
  b.writeUInt16LE(name.length, 10)
  name.copy(b, 12)
  return b
}

beforeEach(async () => {
  seen = { helloRole: null, slot: null, args: null, closed: false }
  helloStatus = STATUS_OK
  controlStatus = STATUS_OK
  controlReply = Buffer.alloc(0)
  silent = false
  sockets = []
  mockedConn.mockReset()
  ;(logInfo as jest.Mock).mockClear()
  server = createServer((sock) => {
    sockets.push(sock)
    sock.on('close', () => {
      seen.closed = true
    })
    sock.on('error', () => undefined)
    sock.on('data', (chunk) => {
      if (silent) return
      const req = decodeRequest(chunk)
      if (req.slot === CONTROL_SLOT.hello) {
        seen.helloRole = req.argBlob.length === 65 ? at(req.argBlob, 64) : null
        sock.write(encodeResponse(req.requestId, helloStatus, Buffer.alloc(0)))
        return
      }
      expect(req.ordinal).toBe(CONTROL_ORDINAL)
      seen.slot = req.slot
      seen.args = req.argBlob
      sock.write(encodeResponse(req.requestId, controlStatus, controlReply))
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as { port: number }).port
  mockedConn.mockReturnValue({ port, secret: SECRET })
})

afterEach(async () => {
  sockets.forEach((s) => s.destroy())
  await new Promise<void>((r) => server.close(() => r()))
})

async function waitClosed(): Promise<void> {
  for (let i = 0; i < 50 && !seen.closed; i++) {
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('listBridgeFriends', () => {
  test('HELLO with probe role, then slot 13; resolves the decoded list', async () => {
    controlReply = friendPayload()
    const res = await listBridgeFriends('3205720')
    expect(res).toEqual({
      ok: true,
      friends: [
        { ordinal: 2, online: true, playingThisApp: false, name: 'Alice' }
      ]
    })
    expect(seen.helloRole).toBe(HELLO_ROLE_PROBE)
    expect(seen.slot).toBe(CONTROL_SLOT.listFriends)
    await waitClosed()
    expect(seen.closed).toBe(true)
  })

  test('no helper -> no-helper, no socket opened', async () => {
    mockedConn.mockReturnValue(null)
    expect(await listBridgeFriends('3205720')).toEqual({
      ok: false,
      reason: 'no-helper'
    })
    expect(sockets).toHaveLength(0)
  })

  test('HELLO refusal -> error', async () => {
    helloStatus = STATUS_ERR
    expect(await listBridgeFriends('3205720')).toEqual({
      ok: false,
      reason: 'error'
    })
    await waitClosed()
    expect(seen.closed).toBe(true)
  })

  test('STATUS_ERR on the control frame -> error', async () => {
    controlStatus = STATUS_ERR
    expect(await listBridgeFriends('3205720')).toEqual({
      ok: false,
      reason: 'error'
    })
  })

  test('malformed payload -> error', async () => {
    controlReply = Buffer.from([5, 0, 0, 0])
    expect(await listBridgeFriends('3205720')).toEqual({
      ok: false,
      reason: 'error'
    })
  })

  test('timeout -> error, 3 s timer unref()d, socket destroyed', async () => {
    silent = true
    const realSetTimeout = global.setTimeout
    const fired: Array<() => void> = []
    const unref = jest.fn()
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number
    ) => {
      if (ms === 3000) {
        fired.push(fn)
        return { unref } as unknown as NodeJS.Timeout
      }
      return realSetTimeout(fn, ms)
    }) as typeof setTimeout)
    const p = listBridgeFriends('3205720')
    for (let i = 0; i < 50 && sockets.length === 0; i++) {
      await new Promise((r) => realSetTimeout(r, 10))
    }
    spy.mockRestore()
    expect(unref).toHaveBeenCalled()
    expect(fired).toHaveLength(1)
    at(fired, 0)()
    expect(await p).toEqual({ ok: false, reason: 'error' })
    await waitClosed()
    expect(seen.closed).toBe(true)
  })
})

describe('sendBridgeInvite', () => {
  const cases: Array<[number, string]> = [
    [1, 'sent'],
    [0, 'steam-refused'],
    [-1, 'no-pending'],
    [-2, 'expired'],
    [-3, 'bad-ordinal']
  ]
  test.each(cases)('i32 %i -> %s', async (code, word) => {
    controlReply = Buffer.alloc(4)
    controlReply.writeInt32LE(code, 0)
    expect(await sendBridgeInvite('3205720', 2)).toBe(word)
    expect(seen.slot).toBe(CONTROL_SLOT.inviteFriend)
    expect(seen.args?.readUInt32LE(0)).toBe(2)
    expect(seen.helloRole).toBe(HELLO_ROLE_PROBE)
  })

  test('unknown code or short reply -> error', async () => {
    controlReply = Buffer.alloc(4)
    controlReply.writeInt32LE(9, 0)
    expect(await sendBridgeInvite('3205720', 0)).toBe('error')
    controlReply = Buffer.alloc(1)
    expect(await sendBridgeInvite('3205720', 0)).toBe('error')
  })

  test('no helper -> no-helper without a socket', async () => {
    mockedConn.mockReturnValue(null)
    expect(await sendBridgeInvite('3205720', 1)).toBe('no-helper')
    expect(sockets).toHaveLength(0)
  })

  test.each([-1, 1.5, NaN])(
    'ordinal %p -> bad-ordinal before any socket',
    async (o) => {
      expect(await sendBridgeInvite('3205720', o)).toBe('bad-ordinal')
      expect(mockedConn).not.toHaveBeenCalled()
      expect(sockets).toHaveLength(0)
    }
  )

  test('STATUS_ERR -> error', async () => {
    controlStatus = STATUS_ERR
    expect(await sendBridgeInvite('3205720', 1)).toBe('error')
  })
})

describe('logging (T-58-105)', () => {
  test('no log call carries a name', async () => {
    controlReply = friendPayload()
    await listBridgeFriends('3205720')
    const msgs = (logInfo as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(msgs.length).toBeGreaterThan(0)
    for (const m of msgs) expect(m).not.toContain('Alice')
  })

  test('source never interpolates name or ordinal into a log call', () => {
    const src = readFileSync(join(__dirname, '..', 'inviteBridge.ts'), 'utf8')
    expect(src).not.toMatch(/log(Info|Warning|Error)\(.*(name|ordinal)/)
  })
})
