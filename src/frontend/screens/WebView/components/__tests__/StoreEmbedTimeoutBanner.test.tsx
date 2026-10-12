/**
 * Tests for `StoreEmbedTimeoutBanner` (Phase 50 Plan 03, D-07/D-08/D-11).
 *
 * No jsdom / react-test-renderer in this project (see
 * `src/frontend/jest.config.js`'s docstring) -- invoked directly as a plain
 * function, the same DOM-less pattern `StoreEmbedPlaceholder.test.tsx` uses
 * in this same directory.
 */

import type { ReactElement, ReactNode } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

import StoreEmbedTimeoutBanner from '../StoreEmbedTimeoutBanner'

interface AnyProps {
  children?: ReactNode
  className?: string
  onClick?: () => void
  disabled?: boolean
}

type AnyReactElement = ReactElement<AnyProps>

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

function findAllByClassName(
  node: unknown,
  className: string
): AnyReactElement[] {
  const found: AnyReactElement[] = []
  function walk(n: unknown) {
    if (n === null || n === undefined || typeof n !== 'object') {
      return
    }
    if (Array.isArray(n)) {
      n.forEach(walk)
      return
    }
    const el = n as AnyReactElement
    if (el.props && el.props.className === className) {
      found.push(el)
    }
    walk(el.props?.children)
  }
  walk(node)
  return found
}

function noop() {
  // intentionally empty -- test double
}

describe('StoreEmbedTimeoutBanner (D-07/D-08/D-11)', () => {
  it('returns null when timedOut is false', () => {
    const element = StoreEmbedTimeoutBanner({
      timedOut: false,
      onReload: noop,
      onOpenInBrowser: noop
    })

    expect(element).toBeNull()
  })

  it('renders a non-null row when timedOut is true', () => {
    const element = StoreEmbedTimeoutBanner({
      timedOut: true,
      onReload: noop,
      onOpenInBrowser: noop
    }) as AnyReactElement

    expect(element).not.toBeNull()
    expect(element.props.className).toBe('WebView__embedNoticeRow')
  })

  it('renders the locked message, a Reload action, and an Open in browser action, in that order', () => {
    const element = StoreEmbedTimeoutBanner({
      timedOut: true,
      onReload: noop,
      onOpenInBrowser: noop
    }) as AnyReactElement

    const text = collectText(element)
    expect(text).toContain('Epic is taking a while to load')
    expect(text).toContain('Reload')
    expect(text).toContain('Open in browser')
    expect(text.indexOf('Reload')).toBeLessThan(text.indexOf('Open in browser'))
  })

  it('clicking Reload calls onReload exactly once and never onOpenInBrowser', () => {
    const onReload = jest.fn()
    const onOpenInBrowser = jest.fn()
    const element = StoreEmbedTimeoutBanner({
      timedOut: true,
      onReload,
      onOpenInBrowser
    }) as AnyReactElement

    const buttons = findAllByClassName(
      element,
      'WebView__embedNoticeRow-action'
    )
    expect(buttons).toHaveLength(2)
    buttons[0].props.onClick?.()

    expect(onReload).toHaveBeenCalledTimes(1)
    expect(onOpenInBrowser).not.toHaveBeenCalled()
  })

  it('clicking Open in browser calls onOpenInBrowser exactly once and never onReload', () => {
    const onReload = jest.fn()
    const onOpenInBrowser = jest.fn()
    const element = StoreEmbedTimeoutBanner({
      timedOut: true,
      onReload,
      onOpenInBrowser
    }) as AnyReactElement

    const buttons = findAllByClassName(
      element,
      'WebView__embedNoticeRow-action'
    )
    buttons[1].props.onClick?.()

    expect(onOpenInBrowser).toHaveBeenCalledTimes(1)
    expect(onReload).not.toHaveBeenCalled()
  })

  it('renders no spinner and no progress indicator', () => {
    const element = StoreEmbedTimeoutBanner({
      timedOut: true,
      onReload: noop,
      onOpenInBrowser: noop
    }) as AnyReactElement

    const json = JSON.stringify(element).toLowerCase()
    expect(json).not.toContain('spinner')
    expect(json).not.toContain('progress')
  })

  it('fail-soft: a missing onReload disables the Reload affordance rather than throwing', () => {
    const element = StoreEmbedTimeoutBanner({
      timedOut: true,
      onReload: undefined as unknown as () => void,
      onOpenInBrowser: noop
    }) as AnyReactElement

    const buttons = findAllByClassName(
      element,
      'WebView__embedNoticeRow-action'
    )
    expect(buttons[0].props.disabled).toBe(true)
    expect(() => buttons[0].props.onClick?.()).not.toThrow()
  })

  it('fail-soft: a missing onOpenInBrowser disables that affordance rather than throwing', () => {
    const element = StoreEmbedTimeoutBanner({
      timedOut: true,
      onReload: noop,
      onOpenInBrowser: undefined as unknown as () => void
    }) as AnyReactElement

    const buttons = findAllByClassName(
      element,
      'WebView__embedNoticeRow-action'
    )
    expect(buttons[1].props.disabled).toBe(true)
    expect(() => buttons[1].props.onClick?.()).not.toThrow()
  })

  it('reuses the existing open-in-browser key rather than minting a duplicate', () => {
    const source = readFileSync(
      join(__dirname, '../StoreEmbedTimeoutBanner.tsx'),
      'utf8'
    )
    const matches = source.match(/unavailable\.open-in-browser/g) ?? []
    expect(matches).toHaveLength(1)
  })
})

describe('WebView/index.css new notice-row rules (D-07/D-14)', () => {
  function readNoticeRowRules(): string {
    const css = readFileSync(join(__dirname, '../../index.css'), 'utf8')
    const marker = css.indexOf('.WebView__embedNoticeRow')
    expect(marker).toBeGreaterThan(-1)
    return css.slice(marker)
  }

  it('reference var(--status-warning) and var(--background-darker), at least two --space- tokens, and contain no hex literal or var(--accent)', () => {
    const noticeRowRules = readNoticeRowRules()

    expect(noticeRowRules).toContain('var(--status-warning)')
    expect(noticeRowRules).toContain('var(--background-darker)')
    expect(
      noticeRowRules.match(/var\(--space-[a-z0-9-]+\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2)
    expect(noticeRowRules.match(/#[0-9a-fA-F]{3,8}/g)).toBeNull()
    expect(noticeRowRules).not.toContain('var(--accent)')
  })

  it('does not position any notice row absolutely over the embed slot', () => {
    const noticeRowRules = readNoticeRowRules()
    expect(noticeRowRules).not.toMatch(/position:\s*absolute/)
  })
})
