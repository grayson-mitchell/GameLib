/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'
import { use as registerI18nPlugin } from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { GameInfo } from 'common/types'
import gamelib from '../../../../../../../public/locales/en/gamelib.json'
import NativePortInfo from '../NativePortInfo'

// Real i18next over the shipped en catalogue, so assertions measure the shipped strings.
void registerI18nPlugin(initReactI18next).init({
  lng: 'en',
  ns: ['gamelib'],
  defaultNS: 'gamelib',
  resources: { en: { gamelib } },
  initImmediate: false,
  interpolation: { escapeValue: false }
})

const makeGameInfo = (over: Partial<GameInfo> = {}): GameInfo => ({
  runner: 'steam',
  app_name: '38400',
  art_cover: '',
  art_square: '',
  install: { install_path: '/x/Fallout' },
  is_installed: true,
  title: 'Fallout',
  canRunOffline: true,
  ...over
})

const renderInfo = (gameInfo: GameInfo, platform: string) =>
  render(<NativePortInfo gameInfo={gameInfo} platform={platform} />).container
const button = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === label
  )

const openExternalUrl = jest.fn()
const openFolder = jest.fn()
const clipboardWriteText = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  Object.assign(window, {
    api: { openExternalUrl, openFolder, clipboardWriteText }
  })
})
afterEach(cleanup)

describe('NativePortInfo', () => {
  it('renders nothing for non-Steam, unknown AppId or unsupported platform', () => {
    expect(
      renderInfo(makeGameInfo({ runner: 'gog' }), 'darwin').firstChild
    ).toBeNull()
    cleanup()
    expect(
      renderInfo(makeGameInfo({ app_name: '730' }), 'darwin').firstChild
    ).toBeNull()
    cleanup()
    expect(renderInfo(makeGameInfo(), 'unknown').firstChild).toBeNull()
  })

  it('renders the block with setup help and wires the buttons', () => {
    const container = renderInfo(makeGameInfo(), 'darwin')
    const all = container.textContent ?? ''
    expect(all).toContain('Native port available')
    expect(all).toContain('fallout1-ce')
    expect(all).toContain('Sustainable Use License')
    expect(all).toContain('rewrites fallout.cfg')
    expect(all).toContain(
      'Steam playtime and achievements are not tracked when you play through the port.'
    )
    expect(all).toContain("copy, don't move")
    expect(all).toContain('MASTER.DAT, CRITTER.DAT, DATA/')
    expect(all).toContain('Add Game')

    const get = button(container, 'Get fallout1-ce')
    expect(get).toBeDefined()
    fireEvent.click(get as HTMLElement)
    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://github.com/alexbatalov/fallout1-ce/releases'
    )
    const show = button(container, 'Show data folder')
    expect(show).toBeDefined()
    fireEvent.click(show as HTMLElement)
    expect(openFolder).toHaveBeenCalledWith('/x/Fallout')
    const copy = button(container, 'Copy install path')
    expect(copy).toBeDefined()
    fireEvent.click(copy as HTMLElement)
    expect(clipboardWriteText).toHaveBeenCalledWith('/x/Fallout')
  })

  it('hides the path buttons when not installed or no install path', () => {
    for (const info of [
      makeGameInfo({ is_installed: false }),
      makeGameInfo({ install: {} })
    ]) {
      const container = renderInfo(info, 'darwin')
      expect(container.querySelector('[role="note"]')).not.toBeNull()
      expect(button(container, 'Show data folder')).toBeUndefined()
      expect(button(container, 'Copy install path')).toBeUndefined()
      expect(button(container, 'Get fallout1-ce')).toBeDefined()
      cleanup()
    }
  })

  it('uses the point step for point-style ports', () => {
    const container = renderInfo(makeGameInfo({ app_name: '22320' }), 'darwin')
    expect(container.textContent).toContain(
      "point it at the game's install folder"
    )
  })
})
