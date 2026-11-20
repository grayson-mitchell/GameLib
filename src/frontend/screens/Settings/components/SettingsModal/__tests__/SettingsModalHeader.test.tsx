/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import { use as registerI18nPlugin } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cleanup, render } from '@testing-library/react'
import type { GameInfo } from 'common/types'
import SettingsModalHeader from '../SettingsModalHeader'

void registerI18nPlugin(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

afterEach(cleanup)

const game = (over: Partial<GameInfo> = {}): GameInfo =>
  ({
    title: 'Low Magic Age',
    app_name: '576770',
    runner: 'steam',
    art_square: 'https://example.test/sq.jpg',
    art_cover: 'https://example.test/cv.jpg',
    ...over
  }) as unknown as GameInfo

describe('SettingsModalHeader (261121-dzl)', () => {
  it('261121-dzl G: steam title alone, with Game settings / Steam App ID / Saved automatically', () => {
    const { container } = render(
      <SettingsModalHeader
        gameInfo={game()}
        type="settings"
        justSaved={false}
      />
    )
    expect(container.querySelector('h2')?.textContent).toBe('Low Magic Age')
    const sub = container.querySelector('.settingsModalHeader__subline')
    expect(sub?.textContent).toContain('Game settings')
    expect(sub?.textContent).toContain('Steam App ID')
    expect(sub?.textContent).toContain('576770')
    expect(sub?.textContent).toContain('Saved automatically')
  })

  it('261121-dzl H: justSaved flashes Saved and restores Saved automatically', () => {
    const { container, rerender } = render(
      <SettingsModalHeader gameInfo={game()} type="settings" justSaved />
    )
    const saved = () => container.querySelector('.settingsModalHeader__saved')
    expect(saved()?.textContent).toBe('Saved')
    expect(saved()?.classList.contains('is-flashing')).toBe(true)
    rerender(
      <SettingsModalHeader
        gameInfo={game()}
        type="settings"
        justSaved={false}
      />
    )
    expect(saved()?.textContent).toBe('Saved automatically')
    expect(saved()?.classList.contains('is-flashing')).toBe(false)
  })

  it('261121-dzl I: a gog game shows App ID, not Steam App ID', () => {
    const { container } = render(
      <SettingsModalHeader
        gameInfo={game({ runner: 'gog', app_name: '123' })}
        type="settings"
        justSaved={false}
      />
    )
    const text = container.querySelector(
      '.settingsModalHeader__subline'
    )?.textContent
    expect(text).toContain('App ID')
    expect(text).not.toContain('Steam App ID')
  })

  it('261121-dzl J: log and category types show their label and no saved element', () => {
    const log = render(
      <SettingsModalHeader gameInfo={game()} type="log" justSaved={false} />
    )
    expect(
      log.container.querySelector('.settingsModalHeader__subline')?.textContent
    ).toContain('Log')
    expect(
      log.container.querySelector('.settingsModalHeader__saved')
    ).toBeNull()
    cleanup()
    const cat = render(
      <SettingsModalHeader
        gameInfo={game()}
        type="category"
        justSaved={false}
      />
    )
    expect(
      cat.container.querySelector('.settingsModalHeader__subline')?.textContent
    ).toContain('Categories')
    expect(
      cat.container.querySelector('.settingsModalHeader__saved')
    ).toBeNull()
  })

  it('261121-dzl K: no art renders the placeholder and no img; art renders img with empty alt', () => {
    const none = render(
      <SettingsModalHeader
        gameInfo={game({ art_square: '', art_cover: '' })}
        type="settings"
        justSaved={false}
      />
    )
    expect(none.container.querySelector('img')).toBeNull()
    expect(
      none.container.querySelector('.settingsModalHeader__thumb--placeholder')
    ).not.toBeNull()
    cleanup()
    const art = render(
      <SettingsModalHeader
        gameInfo={game()}
        type="settings"
        justSaved={false}
      />
    )
    expect(art.container.querySelector('img')?.getAttribute('alt')).toBe('')
  })
})
