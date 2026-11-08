import {
  displayedGameStartWindowMode,
  everyLaunchNeedsTray,
  gameStartWindowModeFromSettings,
  gameStartWindowModes,
  isGameStartWindowMode,
  settingsForGameStartWindowMode
} from '../gameStartWindow'

describe('gameStartWindowModeFromSettings', () => {
  it.each([
    [true, false, 'every'],
    [true, true, 'every'],
    [false, true, 'shortcut'],
    [false, false, 'keep']
  ] as const)(
    'minimize=%s hide=%s -> %s',
    (minimizeOnLaunch, hideWindowOnProtocolLaunch, expected) => {
      expect(
        gameStartWindowModeFromSettings({
          minimizeOnLaunch,
          hideWindowOnProtocolLaunch
        })
      ).toBe(expected)
    }
  )
})

describe('settingsForGameStartWindowMode', () => {
  it('returns the documented boolean pairs exactly', () => {
    expect(settingsForGameStartWindowMode('keep')).toEqual({
      minimizeOnLaunch: false,
      hideWindowOnProtocolLaunch: false
    })
    expect(settingsForGameStartWindowMode('shortcut')).toEqual({
      minimizeOnLaunch: false,
      hideWindowOnProtocolLaunch: true
    })
    expect(settingsForGameStartWindowMode('every')).toEqual({
      minimizeOnLaunch: true,
      hideWindowOnProtocolLaunch: true
    })
  })

  it('round-trips every mode', () => {
    for (const mode of gameStartWindowModes) {
      expect(
        gameStartWindowModeFromSettings(settingsForGameStartWindowMode(mode))
      ).toBe(mode)
    }
  })
})

describe('everyLaunchNeedsTray', () => {
  it.each([
    ['linux', true, true],
    ['win32', true, true],
    ['linux', false, false],
    ['darwin', true, false],
    ['darwin', false, false]
  ] as const)('%s noTrayIcon=%s -> %s', (platform, noTrayIcon, expected) => {
    expect(everyLaunchNeedsTray(platform, noTrayIcon)).toBe(expected)
  })
})

describe('displayedGameStartWindowMode', () => {
  const every = { minimizeOnLaunch: true, hideWindowOnProtocolLaunch: true }
  const everyOnly = {
    minimizeOnLaunch: true,
    hideWindowOnProtocolLaunch: false
  }

  it('shows what actually happens when every needs a tray that is off', () => {
    expect(displayedGameStartWindowMode(every, 'linux', true)).toBe('shortcut')
    expect(displayedGameStartWindowMode(everyOnly, 'win32', true)).toBe('keep')
  })

  it('shows every on macOS without a tray, and when the tray is on', () => {
    expect(displayedGameStartWindowMode(every, 'darwin', true)).toBe('every')
    expect(displayedGameStartWindowMode(every, 'linux', false)).toBe('every')
  })

  it('leaves keep and shortcut alone', () => {
    expect(
      displayedGameStartWindowMode(
        { minimizeOnLaunch: false, hideWindowOnProtocolLaunch: true },
        'linux',
        true
      )
    ).toBe('shortcut')
  })
})

describe('isGameStartWindowMode', () => {
  it('accepts exact lowercase modes only', () => {
    expect(isGameStartWindowMode('every')).toBe(true)
    expect(isGameStartWindowMode('Every')).toBe(false)
    expect(isGameStartWindowMode(undefined)).toBe(false)
  })
})
