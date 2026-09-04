/**
 * Tests for StoreEmbedControls (D-22/D-23, Phase 40 Plan 07, REQ-40-06).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js's docstring) -- the component is invoked directly as a plain
 * function and its returned element graph is inspected as plain objects, the same DOM-less
 * pattern WebviewUnavailablePanel.test.tsx and CrossoverBadge.test.tsx use.
 *
 * `react-i18next` is mocked so `t(key)` returns the key itself (default namespace) and the
 * `gamelib` namespace's `t(key, { host })` returns a string embedding `host`, letting assertions
 * check exact translation keys and interpolated values without a real i18n instance.
 */
import type { ReactElement } from 'react'

// This project's jest config has no CSS transform (see jest.config.js's docstring) -- both this
// component's own stylesheet and the real SvgButton's are mocked out so their side-effect
// imports do not reach ts-jest, while SvgButton's actual component logic (disabled/title/onClick
// plumbing) still runs for real, unmocked.
jest.mock('../index.css', () => ({}))
jest.mock('../../SvgButton/index.css', () => ({}))

jest.mock('react-i18next', () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (
        ns === 'gamelib' &&
        opts &&
        typeof opts === 'object' &&
        'host' in opts
      ) {
        return `Currently viewing ${String(opts.host)}`
      }
      return key
    }
  })
}))

import StoreEmbedControls, { type StoreEmbedControlsProps } from '../index'

type AnyReactElement = ReactElement<{
  children?: unknown
  className?: string
  title?: string
  disabled?: boolean
  'aria-label'?: string
  onClick?: () => void
}>

/** Recursively flattens a React element's `children` prop graph into a single string. */
function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join(' ')
  }
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as AnyReactElement).props
    return collectText(props?.children)
  }
  return ''
}

/**
 * Recursively collects every descendant element whose `className` includes `className` as one
 * of its space-separated tokens -- `cx()` (used for the insecure-scheme modifier) joins multiple
 * classes into one string, so an exact-string match would miss a match with any sibling class.
 */
function findAllByClassName(
  node: unknown,
  className: string
): AnyReactElement[] {
  if (node === null || node === undefined || typeof node !== 'object') {
    return []
  }
  if (Array.isArray(node)) {
    return node.flatMap((child) => findAllByClassName(child, className))
  }
  const el = node as AnyReactElement
  const classes = (el.props?.className ?? '').split(/\s+/)
  const self = classes.includes(className) ? [el] : []
  return [...self, ...findAllByClassName(el.props?.children, className)]
}

function findByTitle(node: unknown, title: string): AnyReactElement | null {
  const matches = findAllByClassName(node, 'StoreEmbedControls__icon').filter(
    (el) => el.props?.title === title
  )
  return matches[0] ?? null
}

function baseProps(
  overrides: Partial<StoreEmbedControlsProps> = {}
): StoreEmbedControlsProps {
  return {
    url: 'https://store.steampowered.com/app/440',
    backAvailable: false,
    forwardAvailable: false,
    onBack: jest.fn(),
    onForward: jest.fn(),
    onReload: jest.fn(),
    onOpenInBrowser: jest.fn(),
    ...overrides
  }
}

describe('StoreEmbedControls -- back/forward availability arrives as props, never a handle query (D-22)', () => {
  it('back available: the back button is enabled and its onClick prop fires the callback', () => {
    const onBack = jest.fn()
    const element = StoreEmbedControls(
      baseProps({ backAvailable: true, onBack })
    ) as unknown as AnyReactElement
    const backButton = findByTitle(element, 'webview.controls.back')

    expect(backButton).not.toBeNull()
    expect(backButton?.props.disabled).toBe(false)
    backButton?.props.onClick?.()
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('back unavailable: the back button is disabled and its callback is never invoked', () => {
    const onBack = jest.fn()
    const element = StoreEmbedControls(
      baseProps({ backAvailable: false, onBack })
    ) as unknown as AnyReactElement
    const backButton = findByTitle(element, 'webview.controls.back')

    expect(backButton).not.toBeNull()
    expect(backButton?.props.disabled).toBe(true)
    // A disabled real <button> never delivers a click to onClick -- assert the callback stays
    // untouched by simply never invoking it, mirroring what the DOM would actually do.
    expect(onBack).not.toHaveBeenCalled()
  })

  it('forward availability is independent of back availability', () => {
    const element = StoreEmbedControls(
      baseProps({ backAvailable: false, forwardAvailable: true })
    ) as unknown as AnyReactElement
    const forwardButton = findByTitle(element, 'webview.controls.forward')

    expect(forwardButton?.props.disabled).toBe(false)
  })

  it('reload is never gated by back/forward availability', () => {
    const onReload = jest.fn()
    const element = StoreEmbedControls(
      baseProps({ backAvailable: false, forwardAvailable: false, onReload })
    ) as unknown as AnyReactElement
    const reloadButton = findByTitle(element, 'webview.controls.reload')

    expect(reloadButton?.props.disabled).toBeFalsy()
    reloadButton?.props.onClick?.()
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})

describe('StoreEmbedControls -- host-only display (D-23, T-40-07-01)', () => {
  it('displays the host and does NOT display the query string', () => {
    const element = StoreEmbedControls(
      baseProps({
        url: 'https://store.steampowered.com/app/440?utm_source=affiliate&session=abc123'
      })
    ) as unknown as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('store.steampowered.com')
    expect(text).not.toContain('utm_source')
    expect(text).not.toContain('session=abc123')
    expect(text).not.toContain('/app/440')
  })

  it('an unparseable URL renders without throwing, and shows no host', () => {
    expect(() =>
      StoreEmbedControls(baseProps({ url: 'not a url at all' }))
    ).not.toThrow()

    const element = StoreEmbedControls(
      baseProps({ url: 'not a url at all' })
    ) as unknown as AnyReactElement
    const hostNodes = findAllByClassName(
      element,
      'StoreEmbedControls__hostText'
    )

    expect(hostNodes).toHaveLength(0)
  })

  it('an empty URL renders without throwing and disables Open in browser', () => {
    const element = StoreEmbedControls(
      baseProps({ url: '' })
    ) as unknown as AnyReactElement
    const openInBrowserButton = findByTitle(
      element,
      'webview.controls.openInBrowser'
    )

    expect(openInBrowserButton?.props.disabled).toBe(true)
  })

  it('the insecure-scheme class is applied for a non-https URL', () => {
    const element = StoreEmbedControls(
      baseProps({ url: 'http://store.steampowered.com/app/440' })
    ) as unknown as AnyReactElement
    const warned = findAllByClassName(
      element,
      'StoreEmbedControls__hostText--warning'
    )

    expect(warned).toHaveLength(1)
  })

  it('the insecure-scheme class is absent for an https URL', () => {
    const element = StoreEmbedControls(
      baseProps({ url: 'https://store.steampowered.com/app/440' })
    ) as unknown as AnyReactElement
    const warned = findAllByClassName(
      element,
      'StoreEmbedControls__hostText--warning'
    )

    expect(warned).toHaveLength(0)
  })

  it('the host display carries a gamelib-namespaced accessibility label naming the host', () => {
    const element = StoreEmbedControls(
      baseProps({ url: 'https://store.steampowered.com/app/440' })
    ) as unknown as AnyReactElement
    const hostNode = findAllByClassName(
      element,
      'StoreEmbedControls__hostText'
    )[0]

    expect(hostNode?.props['aria-label']).toBe(
      'Currently viewing store.steampowered.com'
    )
  })
})

describe('StoreEmbedControls -- open in browser', () => {
  it('fires onOpenInBrowser when a URL is present', () => {
    const onOpenInBrowser = jest.fn()
    const element = StoreEmbedControls(
      baseProps({ onOpenInBrowser })
    ) as unknown as AnyReactElement
    const button = findByTitle(element, 'webview.controls.openInBrowser')

    button?.props.onClick?.()
    expect(onOpenInBrowser).toHaveBeenCalledTimes(1)
  })
})
