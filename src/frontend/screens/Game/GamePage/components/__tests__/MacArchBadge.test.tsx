/**
 * Unit tests for MacArchBadge (MAC32-04).
 *
 * Same DOM-less function-invocation pattern as HumbleOriginInfo.test.tsx —
 * no jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring). 'react-i18next' is mocked at the
 * module level so the component can be invoked directly as a plain function;
 * the returned React element's props are inspected without ever needing a
 * DOM/render tree.
 */
import type { ReactElement } from 'react'

import { GameInfo } from 'common/types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

import MacArchBadge from '../MacArchBadge'

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

type Rendered = ReactElement<{
  className?: string
  title?: string
  children?: string
}> | null

describe('MacArchBadge', () => {
  it.each([
    ['unknown', 'unknown' as const],
    ['64', '64' as const],
    ['undefined', undefined]
  ])('renders nothing when mac_arch is %s', (_label, macArch) => {
    const element = MacArchBadge({
      gameInfo: makeGameInfo({ mac_arch: macArch }),
      isMac: true
    }) as Rendered

    expect(element).toBeNull()
  })

  it('renders the "32" mark when mac_arch is 32', () => {
    const element = MacArchBadge({
      gameInfo: makeGameInfo({ mac_arch: '32' }),
      isMac: true
    }) as Rendered

    expect(element).not.toBeNull()
    expect(element?.props.children).toBe('32')
  })

  it('applies the warning/actionable class when isMac is true', () => {
    const element = MacArchBadge({
      gameInfo: makeGameInfo({ mac_arch: '32' }),
      isMac: true
    }) as Rendered

    expect(element?.props.className).toContain('macArchBadge--warning')
    expect(element?.props.className).not.toContain(
      'macArchBadge--informational'
    )
  })

  it('applies the informational/neutral class when isMac is false', () => {
    const element = MacArchBadge({
      gameInfo: makeGameInfo({ mac_arch: '32' }),
      isMac: false
    }) as Rendered

    expect(element?.props.className).toContain('macArchBadge--informational')
    expect(element?.props.className).not.toContain('macArchBadge--warning')
  })

  it('has an accessible title describing the 32-bit macOS build', () => {
    const element = MacArchBadge({
      gameInfo: makeGameInfo({ mac_arch: '32' }),
      isMac: true
    }) as Rendered

    expect(element?.props.title).toBe('32-bit macOS build')
  })
})
