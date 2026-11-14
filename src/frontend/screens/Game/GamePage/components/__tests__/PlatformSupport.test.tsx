/**
 * Unit tests for PlatformSupport's installed-platform box.
 *
 * Same DOM-less function-invocation pattern as MacArchBadge.test.tsx: no jsdom
 * is installed, so the component is called as a plain function and the
 * returned element tree is walked via props.children.
 */
import type { ReactElement, ReactNode } from 'react'
import { faApple, faLinux, faWindows } from '@fortawesome/free-brands-svg-icons'

import { GameInfo } from 'common/types'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

import PlatformSupport, { getInstallPlatformIcon } from '../PlatformSupport'

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

type El = ReactElement<{
  className?: string
  title?: string
  icon?: unknown
  children?: ReactNode
  'aria-label'?: string
}>

function collect(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) {
    node.forEach((n: unknown) => collect(n, out))
  } else if (node && typeof node === 'object' && 'props' in node) {
    const el = node as El
    out.push(el)
    collect(el.props.children, out)
  }
  return out
}

const render = (gameInfo: GameInfo) =>
  collect(PlatformSupport({ gameInfo }) as El)

const boxed = (els: El[]) =>
  els.filter((e) =>
    (e.props.className ?? '').includes('platformSupport__icon--installed')
  )

const glyphs = (els: El[], icon: unknown) =>
  els.filter((e) => e.props.icon === icon)

describe('PlatformSupport', () => {
  it('boxes nothing when the game is not installed', () => {
    const els = render(makeGameInfo({ is_mac_native: true }))
    expect(boxed(els)).toHaveLength(0)
    expect(glyphs(els, faWindows)).toHaveLength(1)
    expect(glyphs(els, faApple)).toHaveLength(1)
  })

  it('boxes the installed macOS glyph without duplicating it', () => {
    const els = render(
      makeGameInfo({
        is_installed: true,
        is_mac_native: true,
        install: { platform: 'Mac' }
      })
    )
    const b = boxed(els) as [El]
    expect(b).toHaveLength(1)
    expect(b[0].props.title).toBe('macOS (installed)')
    expect(b[0].props['aria-label']).toBe('macOS (installed)')
    expect(glyphs(collect(b[0]), faApple)).toHaveLength(1)
    expect(glyphs(els, faApple)).toHaveLength(1)
    expect(glyphs(collect(b[0]), faWindows)).toHaveLength(0)
  })

  it('appends a boxed Linux glyph when Linux is installed but not native-flagged', () => {
    const els = render(
      makeGameInfo({
        is_installed: true,
        is_linux_native: false,
        install: { platform: 'linux' }
      })
    )
    const b = boxed(els) as [El]
    expect(b).toHaveLength(1)
    expect(b[0].props.title).toBe('Linux (installed)')
    expect(b[0].props['aria-label']).toBe('Linux (installed)')
    expect(glyphs(collect(b[0]), faLinux)).toHaveLength(1)
    expect(glyphs(collect(b[0]), faWindows)).toHaveLength(0)
  })

  it('renders raw text, boxed, for a platform with no icon', () => {
    const els = render(
      makeGameInfo({ is_installed: true, install: { platform: 'Browser' } })
    )
    const b = boxed(els) as [El]
    expect(b).toHaveLength(1)
    expect(b[0].props.children).toBe('Browser')
    expect(b[0].props.title).toBe('Browser (installed)')
    expect(b[0].props['aria-label']).toBe('Browser (installed)')
  })

  it('maps install platform strings to icons', () => {
    expect(getInstallPlatformIcon('darwin')?.title).toBe('macOS')
    expect(getInstallPlatformIcon('Windows')?.title).toBe('Windows')
    expect(getInstallPlatformIcon('osx')?.title).toBe('macOS')
    expect(getInstallPlatformIcon('Browser')).toBeNull()
    expect(getInstallPlatformIcon(undefined)).toBeNull()
  })
})
