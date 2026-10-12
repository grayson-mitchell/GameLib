/**
 * Tests for `EpicLauncherBlockedNotice` (Phase 50 Plan 03, D-14).
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

import EpicLauncherBlockedNotice from '../EpicLauncherBlockedNotice'

interface AnyProps {
  children?: ReactNode
  className?: string
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

describe('EpicLauncherBlockedNotice (D-14)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns null when visible is false, and schedules nothing', () => {
    const onDismissed = jest.fn()
    const element = EpicLauncherBlockedNotice({
      visible: false,
      onDismissed
    })

    expect(element).toBeNull()
    jest.advanceTimersByTime(10000)
    expect(onDismissed).not.toHaveBeenCalled()
  })

  it('renders a non-null row with the locked message when visible', () => {
    const element = EpicLauncherBlockedNotice({
      visible: true,
      onDismissed: jest.fn()
    }) as AnyReactElement

    expect(element).not.toBeNull()
    expect(element.props.className).toBe('WebView__embedNoticeRow')
    expect(collectText(element)).toContain('Install from your Library instead')
  })

  it('renders no button -- D-14 names no action for this notice', () => {
    const element = EpicLauncherBlockedNotice({
      visible: true,
      onDismissed: jest.fn()
    }) as AnyReactElement

    const json = JSON.stringify(element)
    expect(json).not.toContain('"button"')
  })

  it('schedules onDismissed exactly once, after the module auto-dismiss interval', () => {
    const onDismissed = jest.fn()
    EpicLauncherBlockedNotice({ visible: true, onDismissed })

    expect(onDismissed).not.toHaveBeenCalled()
    jest.advanceTimersByTime(3999)
    expect(onDismissed).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(onDismissed).toHaveBeenCalledTimes(1)
  })

  it('fail-soft: a missing onDismissed does not throw and schedules nothing that crashes', () => {
    expect(() =>
      EpicLauncherBlockedNotice({
        visible: true,
        onDismissed: undefined as unknown as () => void
      })
    ).not.toThrow()
    expect(() => jest.advanceTimersByTime(10000)).not.toThrow()
  })

  it('renders no spinner or progress indicator', () => {
    const element = EpicLauncherBlockedNotice({
      visible: true,
      onDismissed: jest.fn()
    }) as AnyReactElement

    const json = JSON.stringify(element).toLowerCase()
    expect(json).not.toContain('spinner')
    expect(json).not.toContain('progress')
  })
})

describe('WebView/index.css new notice-row rules (D-07/D-14)', () => {
  it('reference var(--status-warning) and var(--background-darker), at least two --space- tokens, and contain no hex literal or var(--accent)', () => {
    const css = readFileSync(join(__dirname, '../../index.css'), 'utf8')
    const marker = css.indexOf('.WebView__embedNoticeRow')
    expect(marker).toBeGreaterThan(-1)
    const noticeRowRules = css.slice(marker)

    expect(noticeRowRules).toContain('var(--status-warning)')
    expect(noticeRowRules).toContain('var(--background-darker)')
    expect(
      noticeRowRules.match(/var\(--space-[a-z0-9-]+\)/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2)
    expect(noticeRowRules.match(/#[0-9a-fA-F]{3,8}/g)).toBeNull()
    expect(noticeRowRules).not.toContain('var(--accent)')
  })
})
