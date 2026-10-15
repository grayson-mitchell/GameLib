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

/** Quick task 261015-dlu: same idiom as `embedContainerGridRows.test.ts`'s helper of the
 * same name -- a non-greedy block-comment strip, so a selector named in comment prose
 * cannot satisfy a search meant for the rule body. */
function stripCssComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
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

  /**
   * Quick task 261015-9qy (TODO-9qy-2): pins the message/actions degrade contract
   * PER SELECTOR -- the two tests above slice from the first notice-row selector to end
   * of file, which is too coarse here: under that slice a no-shrink declaration on the
   * icon rule (`.WebView__embedNoticeRow-icon { flex-shrink: 0; ... }`) would satisfy an
   * assertion written about the actions rule. `readSelectorBody` narrows to exactly the
   * body of the named selector.
   *
   * This CSS has been in the tree since `348e28057` (`feat(50-03)`), before the
   * 2026-10-14 live gate that filed the todo -- this test ADDS NO CSS, it only pins the
   * contract that was already there and corrects the todo's stale premise.
   *
   * Quick task 261015-dlu: generalised with an optional `regionStart`, defaulting to the
   * original hardcoded literal so all three pre-existing call sites keep their exact prior
   * behaviour. Also made comment-blind -- both the region marker and the selector match now
   * run over comment-stripped CSS, the same `stripCssComments` idiom
   * `embedContainerGridRows.test.ts` already uses -- because `.WebView__embedContainer` is
   * named in this file's own comment prose (see the `index.css` comment block above that
   * rule), and an unstripped search would be satisfied by that prose rather than the rule
   * body. The selector match is anchored on the selector followed by its opening brace, so a
   * bare row selector cannot be satisfied by a `-message` or `-actions` rule and vice versa.
   */
  function readSelectorBody(
    stylesheet: string,
    selector: string,
    regionStart: string = '.WebView__embedNoticeRow'
  ): string {
    const stripped = stripCssComments(stylesheet)
    const region = (() => {
      const marker = stripped.indexOf(regionStart)
      expect(marker).toBeGreaterThan(-1)
      return stripped.slice(marker)
    })()
    const selectorIndex = region.indexOf(`${selector} {`)
    expect(selectorIndex).toBeGreaterThan(-1)
    const openBrace = region.indexOf('{', selectorIndex)
    const closeBrace = region.indexOf('}', openBrace)
    expect(openBrace).toBeGreaterThan(-1)
    expect(closeBrace).toBeGreaterThan(openBrace)
    return region.slice(openBrace + 1, closeBrace)
  }

  it('pins the message rule and the actions rule degrade contract PER SELECTOR, with a string-copy sabotage arm proving the pin can fail', () => {
    const css = readFileSync(join(__dirname, '../../index.css'), 'utf8')

    const messageBody = readSelectorBody(
      css,
      '.WebView__embedNoticeRow-message'
    )
    expect(messageBody).toMatch(/min-width:\s*0/)
    expect(messageBody).toMatch(/overflow:\s*hidden/)
    expect(messageBody).toMatch(/white-space:\s*nowrap/)
    expect(messageBody).toMatch(/text-overflow:\s*ellipsis/)

    const actionsBody = readSelectorBody(
      css,
      '.WebView__embedNoticeRow-actions'
    )
    expect(actionsBody).toMatch(/flex-shrink:\s*0/)

    // A property declared on a DIFFERENT selector in the same stylesheet region must not
    // satisfy either assertion -- the icon rule also carries flex-shrink: 0, but it must
    // not be read as the actions rule's declaration.
    const iconBody = readSelectorBody(css, '.WebView__embedNoticeRow-icon')
    expect(iconBody).toMatch(/flex-shrink:\s*0/)
    expect(iconBody).not.toMatch(/text-overflow:\s*ellipsis/)

    // SANITY (string-copy sabotage, never written to disk): remove the ellipsis
    // declaration from an in-memory copy only, and assert the same per-selector
    // extraction then throws. First assert it occurs exactly once so the sabotage
    // cannot silently no-op.
    const ellipsisDeclaration = 'text-overflow: ellipsis;'
    const occurrences = css.split(ellipsisDeclaration).length - 1
    expect(occurrences).toBe(1)
    const sabotagedCss = css.replace(ellipsisDeclaration, '')
    const sabotagedMessageBody = readSelectorBody(
      sabotagedCss,
      '.WebView__embedNoticeRow-message'
    )
    expect(() =>
      expect(sabotagedMessageBody).toMatch(/text-overflow:\s*ellipsis/)
    ).toThrow()
  })

  /**
   * Quick task 261015-dlu (TODO-dlu-1): `.WebView__embedContainer`'s implicit grid column had
   * no floor -- an `auto` track whose minimum is its items' min-content contribution, set by
   * this row's own nowrap message to ~420px. Pins the container-level fix PER SELECTOR, with a
   * cross-selector control and a sabotage arm whose count runs over comment-stripped CSS.
   */
  it('pins a zero-floor column template on the embed container, with a cross-selector control and a comment-stripped sabotage arm', () => {
    const css = readFileSync(join(__dirname, '../../index.css'), 'utf8')

    const containerBody = readSelectorBody(
      css,
      '.WebView__embedContainer',
      '.WebView__embedContainer'
    )
    expect(containerBody).toMatch(
      /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/
    )

    // Cross-selector control: the slot carries its OWN min-width: 0 (D-24), which must not be
    // read as the container's column declaration.
    const slotBody = readSelectorBody(
      css,
      '.WebView__embedSlot',
      '.WebView__embedContainer'
    )
    expect(slotBody).not.toMatch(
      /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/
    )

    // SANITY (string-copy sabotage, never written to disk): remove the column declaration from
    // an in-memory copy only, over COMMENT-STRIPPED CSS, and assert the same per-selector
    // extraction then throws. First assert it occurs exactly once so the sabotage cannot
    // silently no-op.
    const strippedCss = stripCssComments(css)
    const columnDeclaration = 'grid-template-columns: minmax(0, 1fr);'
    const occurrences = strippedCss.split(columnDeclaration).length - 1
    expect(occurrences).toBe(1)
    const sabotagedStrippedCss = strippedCss.replace(columnDeclaration, '')
    const sabotagedContainerBody = readSelectorBody(
      sabotagedStrippedCss,
      '.WebView__embedContainer',
      '.WebView__embedContainer'
    )
    expect(() =>
      expect(sabotagedContainerBody).toMatch(
        /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/
      )
    ).toThrow()
  })
})
