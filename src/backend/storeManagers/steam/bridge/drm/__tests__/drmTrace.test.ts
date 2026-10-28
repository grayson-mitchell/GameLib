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
  parseDrmTraceLine
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
