/**
 * "When a game starts" window behaviour (quick task 261108-kpc).
 *
 * One three-way choice over two existing booleans; no new settings key and no migration, so an
 * existing config displays the option its booleans imply:
 *
 *   - `keep`     = hideWindowOnProtocolLaunch false, minimizeOnLaunch false
 *   - `shortcut` = hideWindowOnProtocolLaunch true,  minimizeOnLaunch false
 *   - `every`    = hideWindowOnProtocolLaunch true,  minimizeOnLaunch true
 *
 * `minimizeOnLaunch` alone (the old minimize toggle without the protocol toggle) is read as
 * `every`, since it already hid GameLib for every launch. Self-contained, no React.
 */

export type GameStartWindowMode = 'keep' | 'shortcut' | 'every'

/** Every mode, in display order. */
export const gameStartWindowModes: readonly GameStartWindowMode[] = [
  'keep',
  'shortcut',
  'every'
]

/** Exact, lowercase match only. */
export function isGameStartWindowMode(
  value: unknown
): value is GameStartWindowMode {
  return (
    typeof value === 'string' &&
    (gameStartWindowModes as readonly string[]).includes(value)
  )
}

export function gameStartWindowModeFromSettings(settings: {
  minimizeOnLaunch: boolean
  hideWindowOnProtocolLaunch: boolean
}): GameStartWindowMode {
  if (settings.minimizeOnLaunch) return 'every'
  if (settings.hideWindowOnProtocolLaunch) return 'shortcut'
  return 'keep'
}

export function settingsForGameStartWindowMode(mode: GameStartWindowMode): {
  minimizeOnLaunch: boolean
  hideWindowOnProtocolLaunch: boolean
} {
  switch (mode) {
    case 'keep':
      return { minimizeOnLaunch: false, hideWindowOnProtocolLaunch: false }
    case 'shortcut':
      return { minimizeOnLaunch: false, hideWindowOnProtocolLaunch: true }
    case 'every':
      return { minimizeOnLaunch: true, hideWindowOnProtocolLaunch: true }
  }
}

/**
 * Off macOS, hiding for every launch needs the tray icon to get back (macOS restores from the
 * Dock). The sidecar applies the same gate, so the UI must not offer what it will not honour.
 */
export function everyLaunchNeedsTray(
  platform: string,
  noTrayIcon: boolean
): boolean {
  return platform !== 'darwin' && noTrayIcon
}

/** What actually happens: a stored `every` without a usable tray behaves as the shortcut/keep mode. */
export function displayedGameStartWindowMode(
  settings: { minimizeOnLaunch: boolean; hideWindowOnProtocolLaunch: boolean },
  platform: string,
  noTrayIcon: boolean
): GameStartWindowMode {
  const stored = gameStartWindowModeFromSettings(settings)
  if (stored === 'every' && everyLaunchNeedsTray(platform, noTrayIcon)) {
    return settings.hideWindowOnProtocolLaunch ? 'shortcut' : 'keep'
  }
  return stored
}
