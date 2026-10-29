import {
  crossoverRiskDialogOptions,
  resolveCrossoverInstallRisk
} from '../crossoverInstallRisk'

const mac = { platform: 'darwin', installsViaCrossover: true }

describe('resolveCrossoverInstallRisk', () => {
  test.each([1, 2])('rating %i is known-not-to-work', (rating) => {
    expect(resolveCrossoverInstallRisk({ ...mac, rating })).toEqual({
      kind: 'confirm',
      severity: 'known-not-to-work',
      rating
    })
  })

  test('rating 3 is may-have-problems', () => {
    expect(resolveCrossoverInstallRisk({ ...mac, rating: 3 })).toEqual({
      kind: 'confirm',
      severity: 'may-have-problems',
      rating: 3
    })
  })

  test.each([4, 5])('rating %i gives none', (rating) => {
    expect(resolveCrossoverInstallRisk({ ...mac, rating })).toEqual({
      kind: 'none'
    })
  })

  test.each([1, 3, null])(
    'runsForMe skips every warning (rating %s)',
    (rating) => {
      expect(
        resolveCrossoverInstallRisk({ ...mac, rating, runsForMe: true })
      ).toEqual({ kind: 'none' })
    }
  )

  test('runsForMe false behaves as today', () => {
    expect(
      resolveCrossoverInstallRisk({ ...mac, rating: 1, runsForMe: false })
    ).toEqual({ kind: 'confirm', severity: 'known-not-to-work', rating: 1 })
  })

  test('null is unrated, undefined is none', () => {
    expect(resolveCrossoverInstallRisk({ ...mac, rating: null })).toEqual({
      kind: 'unrated'
    })
    expect(resolveCrossoverInstallRisk({ ...mac, rating: undefined })).toEqual({
      kind: 'none'
    })
  })

  test('NaN gives none', () => {
    expect(resolveCrossoverInstallRisk({ ...mac, rating: NaN })).toEqual({
      kind: 'none'
    })
  })

  test.each([
    ['linux', true],
    ['win32', true],
    ['darwin', false]
  ])('%s / viaCrossover=%s gives none', (platform, installsViaCrossover) => {
    for (const rating of [1, 2, 3, null]) {
      expect(
        resolveCrossoverInstallRisk({ platform, installsViaCrossover, rating })
      ).toEqual({ kind: 'none' })
    }
  })
})

describe('crossoverRiskDialogOptions', () => {
  const t = (key: string, def: string, opts?: Record<string, unknown>) =>
    `${key}|${JSON.stringify(opts ?? {})}`

  test('builds [install anyway, cancel] and wires onConfirm', () => {
    const onConfirm = jest.fn()
    const opts = crossoverRiskDialogOptions(
      { kind: 'confirm', severity: 'known-not-to-work', rating: 2 },
      'Hoard',
      t,
      onConfirm
    )
    expect(opts.title).toContain('knownBadTitle')
    expect(String(opts.message)).toContain('knownBadMessage')
    expect(String(opts.message)).toContain('"rating":2')
    expect(String(opts.message)).toContain('"title":"Hoard"')
    expect(opts.buttons).toHaveLength(2)
    expect(opts.buttons?.[0].text).toContain('installAnyway')
    expect(opts.buttons?.[1].text).toContain('cancel')
    opts.buttons?.[1].onClick?.()
    expect(onConfirm).not.toHaveBeenCalled()
    opts.buttons?.[0].onClick?.()
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('may-have-problems uses different keys', () => {
    const opts = crossoverRiskDialogOptions(
      { kind: 'confirm', severity: 'may-have-problems', rating: 3 },
      'X',
      t,
      jest.fn()
    )
    expect(opts.title).toContain('mayHaveProblemsTitle')
    expect(String(opts.message)).toContain('mayHaveProblemsMessage')
  })
})
