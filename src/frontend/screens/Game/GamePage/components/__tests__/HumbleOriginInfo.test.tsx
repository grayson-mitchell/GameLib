/**
 * Unit tests for HumbleOriginInfo (HDEDUP-02, D-35/D-36/D-37/D-40).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring — adding one is a new npm
 * dependency, excluded from executor auto-fix). 'react' (useContext) and
 * 'react-i18next' (useTranslation) are mocked at the module level so the
 * component can be invoked directly as a plain function; the returned React
 * element's props are inspected without ever needing a DOM/render tree.
 */
import type { ReactElement } from 'react'

import { GameInfo } from 'common/types'
import { HumbleKey } from 'common/types/humble'

const mockKeys: HumbleKey[] = []

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useContext: () => ({ humble: { keys: mockKeys } })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      params?: Record<string, unknown>
    ) =>
      Object.entries(params ?? {}).reduce(
        (str, [k, v]) => str.replace(`{{${k}}}`, String(v)),
        defaultValue
      )
  })
}))

// eslint-disable-next-line import/first
import HumbleOriginInfo from '../HumbleOriginInfo'

function makeGameInfo(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'steam',
    app_name: '12345',
    art_cover: '',
    art_square: '',
    install: {},
    is_installed: false,
    title: 'Some Game',
    canRunOffline: true,
    ...overrides
  }
}

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gk-1',
    machineName: 'mn-1',
    state: 'REDEEMED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Humble RPG Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

type Rendered = ReactElement<{ children: string }> | null

describe('HumbleOriginInfo', () => {
  afterEach(() => {
    mockKeys.length = 0
  })

  it('renders the annotation with the origin/bundle name for a REDEEMED, AppID-matching Steam key', () => {
    mockKeys.push(
      makeKey({
        steamAppId: '12345',
        state: 'REDEEMED',
        origin: 'Humble RPG Bundle'
      })
    )
    const element = HumbleOriginInfo({
      gameInfo: makeGameInfo({ app_name: '12345' })
    }) as Rendered

    expect(element).not.toBeNull()
    expect(element?.props.children).toContain('Humble RPG Bundle')
  })

  it('renders nothing when gameInfo.runner is not steam', () => {
    mockKeys.push(makeKey({ steamAppId: '12345', state: 'REDEEMED' }))
    const element = HumbleOriginInfo({
      gameInfo: makeGameInfo({ runner: 'gog', app_name: '12345' })
    }) as Rendered

    expect(element).toBeNull()
  })

  it('renders nothing when the only matching-AppID key is NOT REDEEMED (D-40)', () => {
    mockKeys.push(makeKey({ steamAppId: '12345', state: 'REVEALED' }))
    const element = HumbleOriginInfo({
      gameInfo: makeGameInfo({ app_name: '12345' })
    }) as Rendered

    expect(element).toBeNull()
  })

  it('renders nothing when no key matches this AppID (D-37 no mismatch flag)', () => {
    mockKeys.push(makeKey({ steamAppId: '99999', state: 'REDEEMED' }))
    const element = HumbleOriginInfo({
      gameInfo: makeGameInfo({ app_name: '12345' })
    }) as Rendered

    expect(element).toBeNull()
  })
})
