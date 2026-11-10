import {
  dismissUntestedNotice,
  isTestedCrossover,
  readCrossoverBuild,
  shouldShowUntestedNotice,
  untestedCrossoverLogLine
} from '../testedCrossoverVersions'

const CX_BIN =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'

function memStore(initial?: unknown) {
  const data = new Map<string, unknown>()
  if (initial !== undefined)
    data.set('dismissedUntestedCrossoverBuilds', initial)
  return {
    data,
    get: (k: string, fb: unknown) => (data.has(k) ? data.get(k) : fb),
    set: jest.fn((k: string, v: unknown) => void data.set(k, v))
  }
}

const ok = (stdout: string) => ({
  code: 0,
  stdout,
  stderr: '',
  timedOut: false,
  aborted: false
})

describe('isTestedCrossover', () => {
  it('knows the seeded build only', () => {
    expect(isTestedCrossover('26.3.0.39832')).toBe(true)
    expect(isTestedCrossover('26.4.0.40000')).toBe(false)
    expect(isTestedCrossover(null)).toBe(false)
    expect(isTestedCrossover('__proto__')).toBe(false)
  })
})

describe('untestedCrossoverLogLine', () => {
  it('is silent for tested, loud for untested and unreadable', () => {
    expect(untestedCrossoverLogLine('26.3.0.39832')).toBeNull()
    const l = untestedCrossoverLogLine('26.4.0.40000')
    expect(l).toContain('26.4.0.40000')
    expect(l).toContain('untested with GameLib')
    expect(untestedCrossoverLogLine(null)).toContain('could not be read')
  })
})

describe('untested notice state', () => {
  it('shows until dismissed; tested builds never show', () => {
    const s = memStore()
    expect(shouldShowUntestedNotice('26.4.0.40000', s)).toBe(true)
    expect(dismissUntestedNotice('26.4.0.40000', s)).toBe(true)
    expect(shouldShowUntestedNotice('26.4.0.40000', s)).toBe(false)
    expect(shouldShowUntestedNotice('26.3.0.39832', s)).toBe(false)
  })
  it('rejects malformed builds without writing', () => {
    const s = memStore()
    expect(dismissUntestedNotice('../x', s)).toBe(false)
    expect(dismissUntestedNotice('26.4', s)).toBe(false)
    expect(s.set).not.toHaveBeenCalled()
  })
  it('treats a corrupt store value as empty', () => {
    expect(shouldShowUntestedNotice('26.4.0.40000', memStore('nope'))).toBe(
      true
    )
    expect(shouldShowUntestedNotice('26.4.0.40000', memStore([1, {}]))).toBe(
      true
    )
  })
})

describe('readCrossoverBuild', () => {
  it('reads CFBundleVersion through plutil', async () => {
    const run = jest.fn().mockResolvedValue(ok('26.3.0.39832\n'))
    await expect(readCrossoverBuild(CX_BIN, run)).resolves.toBe('26.3.0.39832')
    expect(run.mock.calls[0][0]).toBe('/usr/bin/plutil')
    expect(run.mock.calls[0][1]).toContain(
      '/Applications/CrossOver.app/Contents/Info.plist'
    )
  })
  it('returns null on a wrong layout or a bad result', async () => {
    const run = jest.fn().mockResolvedValue(ok('26.3.0.39832'))
    await expect(readCrossoverBuild('/opt/wine/bin', run)).resolves.toBeNull()
    for (const r of [
      { ...ok('26.3.0.39832'), code: 1 },
      { ...ok('26.3.0.39832'), timedOut: true },
      ok('garbage')
    ]) {
      await expect(
        readCrossoverBuild(CX_BIN, jest.fn().mockResolvedValue(r))
      ).resolves.toBeNull()
    }
  })
})
