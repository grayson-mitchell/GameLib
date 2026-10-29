import {
  applyContentLogEvent,
  applyNettopRow,
  createFlowAccumulator,
  createUpdateTracker,
  liveProgress,
  parseContentLogLine,
  parseNettopRow,
  windowRate,
  type NettopRow
} from '../steamDownloadProgress'

const STARTED =
  '[2026-10-29 20:12:03] AppID 43160 update started : download 0/8736151712, store 0/0, reuse 0/0, delta 0/0, stage 0/9614286648 \r'

describe('parseContentLogLine', () => {
  it('parses CRLF update started', () => {
    expect(parseContentLogLine(STARTED)).toEqual({
      kind: 'started',
      appId: '43160',
      downloadDone: 0,
      downloadTotal: 8736151712
    })
  })
  it('parses a resumed download', () => {
    expect(
      parseContentLogLine(
        '[x] AppID 238320 update started : download 1048576/2813215248, store 0/0 \r'
      )
    ).toMatchObject({ downloadDone: 1048576, downloadTotal: 2813215248 })
  })
  it('parses phase lines', () => {
    expect(
      parseContentLogLine(
        '[x] AppID 43160 App update changed : Running Update,Downloading,Staging,\r'
      )
    ).toEqual({
      kind: 'phase',
      appId: '43160',
      phase: 'Running Update,Downloading,Staging'
    })
  })
  it.each([
    '[x] AppID 43160 scheduler finished : removed from schedule (result No Error, state 0xc) \r',
    '[x] AppID 43160 finished update, 1 mounted depots (BuildID 4597280) : x\r',
    '[x] AppID 43160 App update changed : None\r',
    '[x] AppID 43160 update canceled : foo\r'
  ])('ended: %s', (line) => {
    expect(parseContentLogLine(line)).toEqual({ kind: 'ended', appId: '43160' })
  })
  it('ignores unrelated lines', () => {
    expect(
      parseContentLogLine('[x] AppID 43160 preallocated 29 files (9168 MB) \r')
    ).toBeNull()
    expect(parseContentLogLine('garbage')).toBeNull()
  })
})

describe('parseNettopRow', () => {
  it('parses header, flows and rejects the rest', () => {
    expect(parseNettopRow(',bytes_in,\r')).toEqual({ kind: 'header' })
    expect(
      parseNettopRow('tcp4 10.0.0.5:50123<->23.45.6.7:443,123456,\r')
    ).toEqual({
      kind: 'flow',
      flow: '10.0.0.5:50123<->23.45.6.7:443',
      bytesIn: 123456
    })
    expect(parseNettopRow('tcp4 127.0.0.1:1<->127.0.0.1:2,5,')).toBeNull()
    expect(parseNettopRow('tcp6 ::1.1<->::1.2,5,')).toBeNull()
    expect(parseNettopRow('tcp4 1.1.1.1:1<->2.2.2.2:2,,')).toBeNull()
    expect(parseNettopRow('steam_osx.48169,99,')).toBeNull()
    expect(parseNettopRow('nonsense')).toBeNull()
  })
})

describe('flow accumulator', () => {
  const h: NettopRow = { kind: 'header' }
  const f = (flow: string, bytesIn: number): NettopRow => ({
    kind: 'flow',
    flow,
    bytesIn
  })
  it('baselines block 1, then sums positive deltas', () => {
    const a = createFlowAccumulator()
    applyNettopRow(a, h)
    applyNettopRow(a, f('a', 1000))
    expect(a.cum).toBe(0)
    applyNettopRow(a, h)
    applyNettopRow(a, f('a', 1500))
    applyNettopRow(a, f('b', 200)) // new flow counts from 0
    expect(a.cum).toBe(700)
  })
  it('decrease adds nothing and re-baselines; closed flows never drop cum', () => {
    const a = createFlowAccumulator()
    applyNettopRow(a, h)
    applyNettopRow(a, f('a', 1000))
    applyNettopRow(a, h)
    applyNettopRow(a, f('a', 100))
    expect(a.cum).toBe(0)
    applyNettopRow(a, h)
    applyNettopRow(a, f('a', 150))
    expect(a.cum).toBe(50)
    applyNettopRow(a, h) // flow a closed
    expect(a.cum).toBe(50)
  })
})

describe('update tracker', () => {
  it('tracks start, end and re-baseline', () => {
    const t = createUpdateTracker()
    applyContentLogEvent(
      t,
      { kind: 'started', appId: '1', downloadDone: 5, downloadTotal: 10 },
      0
    )
    expect(t.active.size).toBe(1)
    applyContentLogEvent(
      t,
      { kind: 'started', appId: '1', downloadDone: 7, downloadTotal: 10 },
      42
    )
    expect(t.active.get('1')).toEqual({
      downloadDone: 7,
      downloadTotal: 10,
      cumAtStart: 42
    })
    applyContentLogEvent(t, { kind: 'ended', appId: '1' }, 50)
    expect(t.active.size).toBe(0)
  })
})

describe('liveProgress', () => {
  const base = {
    downloadDone: 0,
    downloadTotal: 8736151712,
    cumAtStart: 0,
    acfBytesDownloaded: 0,
    acfBytesToDownload: 8736151712
  }
  it('computes percent', () => {
    const p = liveProgress({ ...base, cumNow: 4368075856 })!
    expect(p.percent).toBeCloseTo(50, 5)
    expect(p.bytesDone).toBe(4368075856)
  })
  it('caps at 99 on overshoot', () => {
    expect(liveProgress({ ...base, cumNow: 8770693182 })!.percent).toBe(99)
  })
  it('floors at ACF bytes and falls back to the log total', () => {
    expect(
      liveProgress({ ...base, cumNow: 0, acfBytesDownloaded: 100 })!.bytesDone
    ).toBe(100)
    expect(
      liveProgress({ ...base, acfBytesToDownload: 0, cumNow: 10 })!.total
    ).toBe(8736151712)
  })
  it('is undefined with no total', () => {
    expect(
      liveProgress({
        ...base,
        downloadTotal: 0,
        acfBytesToDownload: 0,
        cumNow: 1
      })
    ).toBeUndefined()
  })
})

describe('windowRate', () => {
  it('computes bytes per second inside the window', () => {
    const s = [
      { ms: 1000, cum: 0 },
      { ms: 2000, cum: 10 },
      { ms: 3000, cum: 30 }
    ]
    expect(windowRate(s, 3000)).toBe(15)
  })
  it('ignores old samples and is undefined when unmeasurable', () => {
    expect(windowRate([{ ms: 0, cum: 0 }], 0)).toBeUndefined()
    expect(
      windowRate(
        [
          { ms: 1000, cum: 0 },
          { ms: 1200, cum: 5 }
        ],
        1200
      )
    ).toBeUndefined()
    expect(
      windowRate(
        [
          { ms: 0, cum: 0 },
          { ms: 1000, cum: 5 }
        ],
        10000
      )
    ).toBeUndefined()
    expect(
      windowRate(
        [
          { ms: 0, cum: 10 },
          { ms: 1000, cum: 5 }
        ],
        1000
      )
    ).toBeUndefined()
  })
})
