import type { ReactElement, ReactNode } from 'react'
import type { GameInfo } from 'common/types'

jest.mock('react-i18next', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gamelibT } = require('./gamelibT')
  return { useTranslation: () => ({ t: gamelibT }) }
})

import NativePortInfo from '../NativePortInfo'

type El = ReactElement<{ children?: ReactNode; onClick?: () => unknown }>
const flat = (n: ReactNode, out: El[] = []): El[] => {
  if (Array.isArray(n)) n.forEach((c) => flat(c, out))
  else if (n && typeof n === 'object') {
    out.push(n as El)
    flat((n as El).props.children, out)
  }
  return out
}
const text = (n: ReactNode): string =>
  Array.isArray(n)
    ? n.map(text).join('')
    : typeof n === 'string'
      ? n
      : n && typeof n === 'object'
        ? text((n as El).props.children)
        : ''

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

const els = (gameInfo: GameInfo, platform: string) =>
  flat(NativePortInfo({ gameInfo, platform }) as ReactNode).filter(
    (e) => typeof e.type === 'string'
  )
const button = (list: El[], label: string) =>
  list.find((e) => (e.type as string) === 'button' && text(e) === label)

const openExternalUrl = jest.fn()
const openFolder = jest.fn()
const clipboardWriteText = jest.fn()
beforeEach(() => {
  jest.clearAllMocks()
  ;(globalThis as unknown as { window: unknown }).window = {
    api: { openExternalUrl, openFolder, clipboardWriteText }
  }
})

describe('NativePortInfo', () => {
  it('renders nothing for non-Steam, unknown AppId or unsupported platform', () => {
    expect(
      NativePortInfo({
        gameInfo: makeGameInfo({ runner: 'gog' }),
        platform: 'darwin'
      })
    ).toBeNull()
    expect(
      NativePortInfo({
        gameInfo: makeGameInfo({ app_name: '730' }),
        platform: 'darwin'
      })
    ).toBeNull()
    expect(
      NativePortInfo({ gameInfo: makeGameInfo(), platform: 'unknown' })
    ).toBeNull()
  })

  it('renders the block with setup help and wires the buttons', () => {
    const list = els(makeGameInfo(), 'darwin')
    const all = list.map((e) => text(e)).join('|')
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

    button(list, 'Get fallout1-ce')?.props.onClick?.()
    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://github.com/alexbatalov/fallout1-ce/releases'
    )
    button(list, 'Show data folder')?.props.onClick?.()
    expect(openFolder).toHaveBeenCalledWith('/x/Fallout')
    button(list, 'Copy install path')?.props.onClick?.()
    expect(clipboardWriteText).toHaveBeenCalledWith('/x/Fallout')
  })

  it('hides the path buttons when not installed or no install path', () => {
    for (const info of [
      makeGameInfo({ is_installed: false }),
      makeGameInfo({ install: {} })
    ]) {
      const list = els(info, 'darwin')
      expect(list.length).toBeGreaterThan(0)
      expect(button(list, 'Show data folder')).toBeUndefined()
      expect(button(list, 'Copy install path')).toBeUndefined()
      expect(button(list, 'Get fallout1-ce')).toBeDefined()
    }
  })

  it('uses the point step for point-style ports', () => {
    const list = els(makeGameInfo({ app_name: '22320' }), 'darwin')
    expect(list.map((e) => text(e)).join('|')).toContain(
      "point it at the game's install folder"
    )
  })
})
