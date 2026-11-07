import {
  initialInstallEngine,
  installsViaCrossoverForEngine,
  usesEngineChoiceForInstall
} from '../engineInstallChoice'

describe('usesEngineChoiceForInstall', () => {
  it.each(['legendary', 'gog', 'nile', 'sideload'] as const)(
    'is true on mac Windows installs for %s',
    (runner) => {
      expect(
        usesEngineChoiceForInstall({
          platform: 'darwin',
          runner,
          platformToInstall: 'Windows'
        })
      ).toBe(true)
    }
  )

  it('is false for Mac, Browser, other hosts and Steam', () => {
    const base = {
      platform: 'darwin',
      runner: 'gog',
      platformToInstall: 'Windows'
    } as const
    expect(
      usesEngineChoiceForInstall({ ...base, platformToInstall: 'Mac' })
    ).toBe(false)
    expect(
      usesEngineChoiceForInstall({ ...base, platformToInstall: 'Browser' })
    ).toBe(false)
    expect(usesEngineChoiceForInstall({ ...base, platform: 'linux' })).toBe(
      false
    )
    expect(usesEngineChoiceForInstall({ ...base, platform: 'win32' })).toBe(
      false
    )
    expect(usesEngineChoiceForInstall({ ...base, runner: 'steam' })).toBe(false)
  })
})

describe('installsViaCrossoverForEngine', () => {
  it('is true for automatic and crossover only', () => {
    expect(installsViaCrossoverForEngine('automatic')).toBe(true)
    expect(installsViaCrossoverForEngine('crossover')).toBe(true)
    expect(installsViaCrossoverForEngine('pinned:x')).toBe(false)
    expect(installsViaCrossoverForEngine('wine-manager:x')).toBe(false)
  })
})

describe('initialInstallEngine (D-20)', () => {
  it('maps a Legacy default to automatic and keeps others', () => {
    expect(initialInstallEngine('legacy:Game Porting Toolkit')).toBe(
      'automatic'
    )
    expect(initialInstallEngine(undefined)).toBe('automatic')
    expect(initialInstallEngine('crossover')).toBe('crossover')
  })
})
