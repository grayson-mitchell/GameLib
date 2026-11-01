import {
  KNOWN_FIX_REPORT_MAX_BYTES,
  KNOWN_FIX_REPORT_PAIRS,
  RELAY_RESPONSE_STATUSES,
  parseKnownFixReport,
  reportSentKey
} from '../knownFixReport'

const base = {
  v: 1,
  store: 'steam',
  appId: '1234',
  key: 'macArch',
  value: '32',
  op: 'add',
  gamelibVersion: '0.8.0'
}

describe('knownFixReport schema', () => {
  test('macArch/add parses ok', () => {
    const r = parseKnownFixReport(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.report.appId).toBe('1234')
  })

  test('drm/ceg/add parses ok', () => {
    expect(parseKnownFixReport({ ...base, key: 'drm', value: 'ceg' }).ok).toBe(
      true
    )
  })

  test('macArch/remove parses ok', () => {
    expect(parseKnownFixReport({ ...base, op: 'remove' }).ok).toBe(true)
  })

  test('drm/remove is rejected', () => {
    const r = parseKnownFixReport({
      ...base,
      key: 'drm',
      value: 'ceg',
      op: 'remove'
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('only macArch can be removed')
  })

  test('macArch with ceg is rejected', () => {
    const r = parseKnownFixReport({ ...base, value: 'ceg' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('pair not allowed')
  })

  test('drm with 32 is rejected', () => {
    expect(parseKnownFixReport({ ...base, key: 'drm', value: '32' }).ok).toBe(
      false
    )
  })

  test('title is rejected (D-19)', () => {
    expect(parseKnownFixReport({ ...base, title: 'Some Game' }).ok).toBe(false)
  })

  test('launchArgs is rejected', () => {
    expect(parseKnownFixReport({ ...base, launchArgs: '-x' }).ok).toBe(false)
  })

  test.each(['0123', '12a', '', '12345678901'])(
    'appId %p is rejected',
    (id) => {
      expect(parseKnownFixReport({ ...base, appId: id }).ok).toBe(false)
    }
  )

  test('10 digit appId is accepted', () => {
    expect(parseKnownFixReport({ ...base, appId: '1234567890' }).ok).toBe(true)
  })

  test('store gog is rejected', () => {
    expect(parseKnownFixReport({ ...base, store: 'gog' }).ok).toBe(false)
  })

  test('v 2 is rejected', () => {
    expect(parseKnownFixReport({ ...base, v: 2 }).ok).toBe(false)
  })

  test('gamelibVersion with a space or over 40 chars is rejected', () => {
    expect(parseKnownFixReport({ ...base, gamelibVersion: '0.8 0' }).ok).toBe(
      false
    )
    expect(
      parseKnownFixReport({ ...base, gamelibVersion: 'a'.repeat(41) }).ok
    ).toBe(false)
  })

  test.each([null, 'x', 42, []])(
    'non-object %p returns error, no throw',
    (v) => {
      expect(parseKnownFixReport(v).ok).toBe(false)
    }
  )

  test('reportSentKey', () => {
    expect(reportSentKey({ appId: '1234', key: 'drm', op: 'add' })).toBe(
      '1234:drm:add'
    )
  })

  test('constants', () => {
    expect(KNOWN_FIX_REPORT_PAIRS).toEqual({ macArch: '32', drm: 'ceg' })
    expect(KNOWN_FIX_REPORT_MAX_BYTES).toBe(2048)
    expect(RELAY_RESPONSE_STATUSES).toContain('rate-limited')
  })
})
