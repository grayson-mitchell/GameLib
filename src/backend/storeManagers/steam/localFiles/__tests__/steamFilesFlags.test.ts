import {
  STEAMFILES_SHORTCUTS_DEFAULT,
  STEAMFILES_TEXT_DEFAULT,
  steamFilesShortcutsImpl,
  steamFilesTextImpl
} from '../steamFilesFlags'

describe('steamfiles dev flags', () => {
  it('defaults to rust', () => {
    expect(STEAMFILES_TEXT_DEFAULT).toBe('rust')
    expect(STEAMFILES_SHORTCUTS_DEFAULT).toBe('rust')
    expect(steamFilesTextImpl({})).toBe('rust')
    expect(steamFilesShortcutsImpl({})).toBe('rust')
  })

  it('still honours an explicit ts', () => {
    expect(steamFilesTextImpl({ GAMELIB_STEAMFILES_TEXT: 'ts' })).toBe('ts')
    expect(
      steamFilesShortcutsImpl({ GAMELIB_STEAMFILES_SHORTCUTS: 'ts' })
    ).toBe('ts')
  })

  it('reads rust and ts from the env', () => {
    expect(steamFilesTextImpl({ GAMELIB_STEAMFILES_TEXT: 'rust' })).toBe('rust')
    expect(steamFilesTextImpl({ GAMELIB_STEAMFILES_TEXT: 'ts' })).toBe('ts')
    expect(
      steamFilesShortcutsImpl({ GAMELIB_STEAMFILES_SHORTCUTS: 'rust' })
    ).toBe('rust')
  })

  it('falls back to the default on a bogus value', () => {
    expect(steamFilesTextImpl({ GAMELIB_STEAMFILES_TEXT: 'bogus' })).toBe(
      STEAMFILES_TEXT_DEFAULT
    )
    expect(
      steamFilesShortcutsImpl({ GAMELIB_STEAMFILES_SHORTCUTS: 'bogus' })
    ).toBe(STEAMFILES_SHORTCUTS_DEFAULT)
  })

  it('keeps the two flags independent', () => {
    const env = { GAMELIB_STEAMFILES_TEXT: 'ts' }
    expect(steamFilesShortcutsImpl(env)).toBe('rust')
  })
})
