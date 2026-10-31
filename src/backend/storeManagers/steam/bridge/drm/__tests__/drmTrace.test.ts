import { readFileSync } from 'fs'
import { join } from 'path'

import {
  MAX_DRM_TRACE_BYTES,
  MAX_DRM_TRACE_LINES,
  MAX_DRM_TRACE_LINE_CHARS,
  appLogPayload,
  drmRelogPrefix,
  extractDrmEvidence,
  formatDrmTraceLine,
  parseDrmLaunchAnchor,
  parseDrmTraceFile,
  parseDrmTraceLine,
  scoreLegacyP2pJoin
} from '../drmTrace'

const H = '(12:00:00) [INFO]:    [Steam]:        '
const TRACE_PATH =
  '/Users/a b/Library/Application Support/GameLib/steam-bridge/drm/trace/219990-1761084000123.log'
const ANCHOR = `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 client=1761084000 trace=${TRACE_PATH}`
const CREATE =
  '[drm-trace] appId=219990 pid=1234 role=game event=create-interface iface=SteamClient021'
const CALL =
  '[drm-trace] appId=219990 pid=1234 role=game event=call name=ISteamUser_SteamUser023_GetSteamID'

const relog = (l: string, id = '219990') => `${H}${drmRelogPrefix(id)}${l}`

describe('parseDrmTraceLine', () => {
  it('parses create-interface and call lines and round-trips', () => {
    expect(parseDrmTraceLine(CREATE)).toEqual({
      appId: '219990',
      pid: 1234,
      role: 'game',
      event: 'create-interface',
      iface: 'SteamClient021'
    })
    const call = parseDrmTraceLine(CALL)
    expect(call).toMatchObject({
      event: 'call',
      name: 'ISteamUser_SteamUser023_GetSteamID'
    })
    for (const l of [CREATE, CALL]) {
      expect(formatDrmTraceLine(parseDrmTraceLine(l)!)).toBe(l)
    }
  })

  it('tolerates one trailing CR and rejects malformed lines', () => {
    expect(parseDrmTraceLine(CREATE + '\r')).not.toBeNull()
    const bad = [
      'x ' + CREATE,
      CREATE + ' extra',
      CREATE.replace('pid=1234 role', 'pid=1234  role'),
      CREATE.replace('role=game', 'role=steam'),
      CREATE.replace('event=create-interface', 'event=init'),
      CREATE.replace('appId=219990', 'appId=abc'),
      CREATE.replace('pid=1234', 'pid=0'),
      CREATE.replace('SteamClient021', 'Steam/Client'),
      CREATE.replace('SteamClient021', 'Steam Client'),
      CREATE + 'a'.repeat(MAX_DRM_TRACE_LINE_CHARS)
    ]
    for (const l of bad) expect(parseDrmTraceLine(l)).toBeNull()
  })
})

describe('parseDrmLaunchAnchor', () => {
  it('parses trace as rest of line, spaces included', () => {
    expect(parseDrmLaunchAnchor(ANCHOR)).toEqual({
      appId: '219990',
      mode: 'steamclient-layer',
      crossover: '26.3.0.39832',
      client: '1761084000',
      trace: TRACE_PATH
    })
  })

  it('rejects wrong shapes', () => {
    const bad = [
      ANCHOR.replace('mode=steamclient-layer', 'mode=other'),
      ANCHOR.replace('crossover=26.3.0.39832', 'crossover=26.3'),
      ANCHOR.replace('client=1761084000', 'client=17x'),
      ANCHOR.replace(`trace=${TRACE_PATH}`, 'trace=relative/x.log'),
      ANCHOR.replace(`trace=${TRACE_PATH}`, 'trace='),
      ANCHOR.replace(TRACE_PATH, '/' + 'a'.repeat(1024)),
      ANCHOR.replace(TRACE_PATH, '/a\u0001b'),
      `[bridge-drm] appId=219990 mode=steamclient-layer crossover=26.3.0.39832 trace=${TRACE_PATH} client=1761084000`
    ]
    for (const l of bad) expect(parseDrmLaunchAnchor(l)).toBeNull()
  })
})

describe('parseDrmTraceFile', () => {
  it('keeps valid lines for the appId and counts the rest as rejected', () => {
    const other = CREATE.replace('appId=219990', 'appId=1')
    const r = parseDrmTraceFile(
      [CREATE, other, 'junk', '', CALL].join('\n'),
      '219990'
    )
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.events).toHaveLength(2)
      expect(r.rejected).toBe(2)
    }
  })

  it('stops after the line cap', () => {
    const text = Array(MAX_DRM_TRACE_LINES + 10)
      .fill(CREATE)
      .join('\n')
    const r = parseDrmTraceFile(text, '219990')
    expect(r.status === 'ok' && r.events.length).toBe(MAX_DRM_TRACE_LINES)
    expect(r.status === 'ok' && r.rejected).toBe(10)
  })

  it('reports oversize for an over-long file', () => {
    const r = parseDrmTraceFile('a'.repeat(MAX_DRM_TRACE_BYTES + 1), '219990')
    expect(r).toEqual({ status: 'oversize' })
  })
})

describe('appLogPayload', () => {
  it('strips the logger header and leaves headerless lines alone', () => {
    expect(appLogPayload(`${H}hello`)).toBe('hello')
    expect(appLogPayload('hello')).toBe('hello')
  })
})

describe('extractDrmEvidence', () => {
  const helper = (pid: number) =>
    `[drm-trace] appId=219990 pid=${pid} role=helper event=create-interface iface=SteamClient021`

  it('is unanchored without an anchor payload at line start', () => {
    const text = `${H}bridge helper [219990]: [t] FWD x] ${ANCHOR}\n${relog(CREATE)}`
    expect(extractDrmEvidence('219990', text).anchored).toBe(false)
  })

  it('does not anchor another appId', () => {
    const text = `${H}${ANCHOR.replace('appId=219990', 'appId=1')}\n${relog(CREATE)}`
    expect(extractDrmEvidence('219990', text).anchored).toBe(false)
  })

  it('counts only lines after the last anchor', () => {
    const text = [H + ANCHOR, relog(CREATE), H + ANCHOR, relog(CALL)].join('\n')
    const ev = extractDrmEvidence('219990', text)
    expect(ev.anchored).toBe(true)
    expect(ev.gameInterfaces).toEqual([])
    expect(ev.gameCalls).toEqual(['ISteamUser_SteamUser023_GetSteamID'])
  })

  it('requires the relog prefix and a matching appId', () => {
    const text = [
      H + ANCHOR,
      `${H}${CREATE}`,
      `${H}bridge helper [219990]: [t] FWD ${CREATE}`,
      relog(CREATE.replace('appId=219990', 'appId=1'))
    ].join('\n')
    const ev = extractDrmEvidence('219990', text)
    expect(ev.gameInterfaces).toEqual([])
  })

  it('counts helper-only lines separately', () => {
    const text = [H + ANCHOR, relog(helper(100))].join('\n')
    const ev = extractDrmEvidence('219990', text)
    expect(ev.helperEvents).toBe(1)
    expect(ev.gameInterfaces).toEqual([])
  })

  it('flags a game pid equal to a helper pid', () => {
    const text = [H + ANCHOR, relog(CREATE), relog(helper(1234))].join('\n')
    expect(extractDrmEvidence('219990', text).pidConflict).toBe(true)
    const ok = [H + ANCHOR, relog(CREATE), relog(helper(99))].join('\n')
    expect(extractDrmEvidence('219990', ok).pidConflict).toBe(false)
  })
})

describe('zero-import gate', () => {
  it('has no import or require', () => {
    const src = readFileSync(join(__dirname, '..', 'drmTrace.ts'), 'utf8')
    expect(/^import/m.test(src)).toBe(false)
    expect(src.includes('require(')).toBe(false)
  })
})

describe('event=callback', () => {
  const cb = (tail: string, role = 'game') =>
    `[drm-trace] appId=219990 pid=1234 role=${role} event=callback ${tail}`

  it('parses with and without detail and round-trips', () => {
    expect(parseDrmTraceLine(cb('id=504 resp=1'))).toEqual({
      appId: '219990',
      pid: 1234,
      role: 'game',
      event: 'callback',
      id: 504,
      detail: { key: 'resp', value: 1 }
    })
    expect(parseDrmTraceLine(cb('id=1221 state=3'))).toMatchObject({
      id: 1221,
      detail: { key: 'state', value: 3 }
    })
    const bare = parseDrmTraceLine(cb('id=1202'))!
    expect(bare).not.toHaveProperty('detail')
    for (const l of [
      cb('id=504 resp=1'),
      cb('id=1221 state=3'),
      cb('id=1202')
    ]) {
      expect(formatDrmTraceLine(parseDrmTraceLine(l)!)).toBe(l)
    }
  })

  it('rejects mismatched detail keys and malformed ids', () => {
    for (const tail of [
      'id=1202 resp=1',
      'id=504 state=1',
      'id=333 state=1',
      'id=123456',
      'id=0504',
      'id=-5',
      'id=504 resp=1 x'
    ]) {
      expect(parseDrmTraceLine(cb(tail))).toBeNull()
    }
  })

  it('extractDrmEvidence collects game callbacks only from game role', () => {
    const text = [
      relog(ANCHOR.replace('[bridge-drm] ', '[bridge-drm] ')).replace(
        drmRelogPrefix('219990'),
        ''
      ),
      relog(cb('id=1202')),
      relog(cb('id=504 resp=1')),
      relog(cb('id=1221 state=3')),
      relog(cb('id=1221 state=1')),
      relog(cb('id=333', 'helper'))
    ].join('\n')
    const ev = extractDrmEvidence('219990', text)
    expect(ev.gameCallbacks).toEqual([504, 1202, 1221])
    expect(ev.gameLobbyEnterOk).toBe(true)
    expect(ev.gameConnStates).toEqual([1, 3])
    expect(ev.helperEvents).toBe(1)
  })
})

describe('Phase 58 D-08a: peer and size evidence', () => {
  const PEER = '1'
  const OTHER = '2'
  const line = (tail: string, role = 'game') =>
    `[drm-trace] appId=219990 pid=1234 role=${role} event=${tail}`

  it('parses and round-trips 1202 peer, accept, send and read lines', () => {
    for (const l of [
      line(`callback id=1202 peer=${PEER}`),
      line(`p2p op=accept peer=${PEER} ok=1`),
      line(`p2p op=accept peer=${PEER} ok=0`),
      line(`p2p op=send peer=${PEER} bytes=64`),
      line(`p2p op=read peer=${PEER} bytes=0`)
    ]) {
      const ev = parseDrmTraceLine(l)
      expect(ev).not.toBeNull()
      expect(formatDrmTraceLine(ev!)).toBe(l)
    }
    expect(
      parseDrmTraceLine(line(`callback id=1202 peer=${PEER}`))
    ).toMatchObject({ event: 'callback', id: 1202, peer: PEER })
    expect(
      parseDrmTraceLine(line(`p2p op=send peer=${PEER} bytes=64`))
    ).toEqual({
      appId: '219990',
      pid: 1234,
      role: 'game',
      event: 'p2p',
      op: 'send',
      peer: PEER,
      bytes: 64
    })
  })

  it('rejects malformed peer, size and callback combinations', () => {
    for (const l of [
      line(`callback id=504 peer=${PEER}`),
      line(`callback id=1202 peer=0`),
      line(`callback id=1202 peer=123456789012345678901`),
      // stale archive: a raw SteamID64 must never parse (privacy, D-08 restored)
      line(`callback id=1202 peer=76561198000000001`),
      line(`p2p op=accept peer=76561198000000001 ok=1`),
      line(`p2p op=send peer=76561198000000001 bytes=8`),
      line(`p2p op=read peer=76561198000000001 bytes=8`),
      // table-full marker is never a match
      line(`callback id=1202 peer=overflow`),
      line(`p2p op=send peer=overflow bytes=8`),
      line(`callback id=1202 peer=01`),
      line(`callback id=1202 peer=${PEER} resp=1`),
      line(`p2p op=send peer=0 bytes=1`),
      line(`p2p op=send peer=${PEER} bytes=4294967296`),
      line(`p2p op=send peer=${PEER} bytes=-1`),
      line(`p2p op=send peer=${PEER} ok=1`),
      line(`p2p op=accept peer=${PEER} bytes=1`),
      line(`p2p op=accept peer=${PEER} ok=2`),
      line(`p2p op=close peer=${PEER} bytes=1`)
    ]) {
      expect(parseDrmTraceLine(l)).toBeNull()
    }
  })

  const evidence = (lines: string[]) =>
    extractDrmEvidence(
      '219990',
      [ANCHOR, ...lines.map((l) => relog(l))].join('\n')
    )

  it('collects ordered game-role p2p events and ignores the helper', () => {
    const ev = evidence([
      line(`callback id=1202 peer=${PEER}`),
      line(`p2p op=accept peer=${PEER} ok=1`),
      line(`p2p op=send peer=${PEER} bytes=32`),
      line(`p2p op=read peer=${OTHER} bytes=8`, 'helper'),
      line(`p2p op=read peer=${PEER} bytes=16`)
    ])
    expect(ev.gameP2p.map((e) => [e.kind, e.peer])).toEqual([
      ['request', PEER],
      ['accept', PEER],
      ['send', PEER],
      ['read', PEER]
    ])
    expect(ev.gameP2p.map((e) => e.seq)).toEqual([1, 2, 3, 4])
    expect(ev.helperEvents).toBe(1)
  })

  describe('scoreLegacyP2pJoin', () => {
    const score = (lines: string[]) =>
      scoreLegacyP2pJoin(evidence(lines).gameP2p)
    const REQ = line(`callback id=1202 peer=${PEER}`)
    const ACC = line(`p2p op=accept peer=${PEER} ok=1`)
    const SEND = line(`p2p op=send peer=${PEER} bytes=32`)
    const READ = line(`p2p op=read peer=${PEER} bytes=16`)

    it('completes for 1202, later accept, nonzero send and read, one peer', () => {
      expect(score([REQ, ACC, SEND, READ]).complete).toBe(true)
    })
    it('requires the accept to come after the 1202 line', () => {
      expect(score([ACC, REQ, SEND, READ])).toMatchObject({
        request: true,
        accepted: false,
        complete: false
      })
    })
    it('requires every clause to name the same peer', () => {
      const otherRead = line(`p2p op=read peer=${OTHER} bytes=16`)
      expect(score([REQ, ACC, SEND, otherRead])).toMatchObject({
        read: false,
        complete: false
      })
    })
    it('does not count zero-byte traffic', () => {
      const zeroSend = line(`p2p op=send peer=${PEER} bytes=0`)
      const zeroRead = line(`p2p op=read peer=${PEER} bytes=0`)
      expect(score([REQ, ACC, zeroSend, zeroRead])).toMatchObject({
        send: false,
        read: false,
        complete: false
      })
    })
    it('a bare 1202 line without a peer names nobody', () => {
      expect(score([line('callback id=1202'), ACC, SEND, READ]).request).toBe(
        false
      )
    })
    it('is false for no events', () => {
      expect(scoreLegacyP2pJoin([]).complete).toBe(false)
    })
  })
})

describe('WR-01: event=apps trace lines', () => {
  const BID =
    '[drm-trace] appId=219990 pid=1234 role=game event=apps op=build-id ret=12345'
  const GIVEN =
    '[drm-trace] appId=219990 pid=1234 role=game event=apps op=build-id-given ret=-1'

  it('round-trips build-id and build-id-given', () => {
    for (const l of [BID, GIVEN]) {
      const ev = parseDrmTraceLine(l)
      expect(ev).not.toBeNull()
      expect(ev?.event).toBe('apps')
      expect(formatDrmTraceLine(ev!)).toBe(l)
    }
  })

  it('rejects a non-numeric ret', () => {
    expect(parseDrmTraceLine(BID.replace('ret=12345', 'ret=abc'))).toBeNull()
  })

  it('reports rejected 0 for a file of only apps lines', () => {
    const r = parseDrmTraceFile(`${BID}\n${GIVEN}\n`, '219990')
    expect(r).toEqual({
      status: 'ok',
      events: expect.any(Array),
      rejected: 0
    })
    if (r.status === 'ok') expect(r.events).toHaveLength(2)
  })
})
