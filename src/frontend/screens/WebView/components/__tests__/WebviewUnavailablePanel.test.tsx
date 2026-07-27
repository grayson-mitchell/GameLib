/**
 * Tests for WebviewUnavailablePanel (D-06, REQ-34.4.1-07) plus one
 * source-text gate: proving `WebView/index.tsx`'s three arms (login/
 * store-wiki/Electron) stay structurally distinct (D-06's rider).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js's docstring) — the panel is invoked
 * directly as a plain function, the same DOM-less pattern
 * CrossoverBadge.test.tsx uses.
 *
 * `window.api` is stubbed at the `globalThis` level (mirrors
 * StoreSearchRow.test.tsx's convention) because the "Open in browser"
 * button calls `window.api.openExternalUrl` — this project's
 * `testEnvironment: 'node'` jest config has no `window` global otherwise.
 *
 * Deviation note (34.4.1-05, Task 1+3 combined — see this plan's SUMMARY):
 * the Group 2 structural gate below (previously named "Group 2" in this
 * file, testing the two-arm shape) is REWRITTEN, not deleted, to assert the
 * NEW three-arm shape `index.tsx`'s branch split produces. The reason: the
 * old gate's `if (isTauri())` string search now happens to still match the
 * (unrelated) store arm after the split, which would have let it pass
 * vacuously without actually proving the login arm exists at all. Rewriting
 * it to check all three arms explicitly closes that gap rather than relying
 * on a coincidental string match.
 */
import type { ReactElement } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

const mockApi = {
  openExternalUrl: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

import WebviewUnavailablePanel from '../WebviewUnavailablePanel'

type AnyReactElement = ReactElement<{
  children?: unknown
  className?: string
  onClick?: () => void
}>

/**
 * Recursively flattens a React element's `children` prop graph into a
 * single string. Operates purely on the plain element/props object graph
 * React elements already are before rendering — no DOM required.
 */
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

/** Recursively finds the first descendant element with the given className. */
function findByClassName(
  node: unknown,
  className: string
): AnyReactElement | null {
  if (node === null || node === undefined || typeof node !== 'object') {
    return null
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByClassName(child, className)
      if (found) return found
    }
    return null
  }
  const el = node as AnyReactElement
  if (el.props?.className === className) {
    return el
  }
  return findByClassName(el.props?.children, className)
}

describe('WebviewUnavailablePanel (D-06, store/wiki-only)', () => {
  it('renders a non-null element with a stable, greppable className', () => {
    const element = WebviewUnavailablePanel({}) as AnyReactElement

    expect(element).not.toBeNull()
    expect(element.props.className).toBe('WebView__unavailablePanel')
  })

  it('renders honest copy naming in-app store/wiki browsing as the gap, never a login gap', () => {
    const element = WebviewUnavailablePanel({}) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('not available on this build')
    expect(text.toLowerCase()).toContain('store and wiki')
    expect(text.toLowerCase()).not.toMatch(/sign in|signing in|login/)
  })

  it('renders no Open in browser button when url is absent', () => {
    const element = WebviewUnavailablePanel({}) as AnyReactElement
    const button = findByClassName(
      element,
      'WebView__unavailablePanel-openInBrowser'
    )

    expect(button).toBeNull()
  })

  it('renders an Open in browser button that calls window.api.openExternalUrl with the exact url when present', () => {
    const url = 'https://store.steampowered.com/'
    const element = WebviewUnavailablePanel({ url }) as AnyReactElement
    const button = findByClassName(
      element,
      'WebView__unavailablePanel-openInBrowser'
    )

    expect(button).not.toBeNull()
    button?.props.onClick?.()
    expect(mockApi.openExternalUrl).toHaveBeenCalledWith(url)
  })
})

describe('WebviewUnavailablePanel — no navigator.clipboard reference (Group 2)', () => {
  const panelSourcePath = join(__dirname, '..', 'WebviewUnavailablePanel.tsx')

  function hasNavigatorClipboardReference(source: string): boolean {
    return /navigator\s*\.\s*clipboard/.test(stripSourceComments(source))
  }

  it('the real component source contains no navigator.clipboard reference', () => {
    const rawSource = readFileSync(panelSourcePath, 'utf-8')

    expect(hasNavigatorClipboardReference(rawSource)).toBe(false)
  })

  it('self-test: the gate DOES catch a real navigator.clipboard reference outside a comment', () => {
    const synthetic = [
      'const copy = () => {',
      "  navigator.clipboard.writeText('leak')",
      '}'
    ].join('\n')

    expect(hasNavigatorClipboardReference(synthetic)).toBe(true)
  })

  it('self-test: a non-*-prefixed block comment merely NAMING navigator.clipboard is stripped, not a false positive', () => {
    const synthetic = [
      '/*',
      "navigator.clipboard.writeText('should not count')",
      '*/',
      'const x = 1'
    ].join('\n')

    expect(hasNavigatorClipboardReference(synthetic)).toBe(false)
  })
})

describe('WebView/index.tsx — three distinct arms: login / store-wiki / Electron (D-06 rider, Group 3)', () => {
  const webViewIndexPath = join(__dirname, '..', '..', 'index.tsx')

  /** Extracts the balanced-brace block body starting at the first `{` after `marker`. */
  function extractBlock(source: string, marker: string): string {
    const markerIdx = source.indexOf(marker)
    if (markerIdx === -1) {
      throw new Error(`marker not found: ${marker}`)
    }
    const braceStart = source.indexOf('{', markerIdx)
    let depth = 0
    let i = braceStart
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    return source.slice(braceStart, i + 1)
  }

  /**
   * The gate under test (D-06's rider, proven not asserted): the
   * `!webviewPreloadPath` block must contain, IN ORDER: a login arm gated
   * on `isLoginPathname(pathname)` rendering `TauriLoginPanel`, a distinct
   * store/wiki arm gated on bare `isTauri()` rendering
   * `WebviewUnavailablePanel` (and NOT `TauriLoginPanel`), and a final
   * `return <></>` Electron arm reachable only after both Tauri arms —
   * not nested inside either of them, and not merged into one return.
   */
  function hasThreeDistinctArms(strippedSource: string): boolean {
    let outerBlock: string
    try {
      outerBlock = extractBlock(strippedSource, 'if (!webviewPreloadPath)')
    } catch {
      return false
    }

    const loginConditionIdx = outerBlock.indexOf('isLoginPathname(pathname)')
    if (loginConditionIdx === -1) return false
    const loginArmStart = outerBlock.lastIndexOf('if (', loginConditionIdx)
    if (loginArmStart === -1) return false

    let loginBlock: string
    try {
      loginBlock = extractBlock(outerBlock.slice(loginArmStart), 'if (')
    } catch {
      return false
    }
    const loginArmRendersLoginPanel = loginBlock.includes('TauriLoginPanel')

    const loginBlockEndInOuter =
      outerBlock.indexOf(loginBlock, loginArmStart) + loginBlock.length
    const afterLogin = outerBlock.slice(loginBlockEndInOuter)

    const storeMarkerIdx = afterLogin.indexOf('if (isTauri())')
    if (storeMarkerIdx === -1) return false

    let storeBlock: string
    try {
      storeBlock = extractBlock(
        afterLogin.slice(storeMarkerIdx),
        'if (isTauri())'
      )
    } catch {
      return false
    }
    const storeArmRendersUnavailablePanel =
      storeBlock.includes('WebviewUnavailablePanel') &&
      !storeBlock.includes('TauriLoginPanel')

    const storeBlockEndInAfterLogin =
      afterLogin.indexOf(storeBlock, storeMarkerIdx) + storeBlock.length
    const afterStore = afterLogin.slice(storeBlockEndInAfterLogin)
    const electronArmReturnsEmptyFragment = /return\s*<>\s*<\/>/.test(
      afterStore
    )

    return (
      loginArmRendersLoginPanel &&
      storeArmRendersUnavailablePanel &&
      electronArmReturnsEmptyFragment
    )
  }

  it('the real source has three distinct arms: login (TauriLoginPanel), store/wiki (WebviewUnavailablePanel), Electron (return <></>)', () => {
    const rawSource = readFileSync(webViewIndexPath, 'utf-8')
    const stripped = stripSourceComments(rawSource)

    expect(hasThreeDistinctArms(stripped)).toBe(true)
  })

  it('the real source calls window.api.logInfo naming the pathname inside the store/wiki arm', () => {
    const rawSource = readFileSync(webViewIndexPath, 'utf-8')
    const stripped = stripSourceComments(rawSource)
    const outerBlock = extractBlock(stripped, 'if (!webviewPreloadPath)')
    const loginConditionIdx = outerBlock.indexOf('isLoginPathname(pathname)')
    const loginArmStart = outerBlock.lastIndexOf('if (', loginConditionIdx)
    const loginBlock = extractBlock(outerBlock.slice(loginArmStart), 'if (')
    const loginBlockEndInOuter =
      outerBlock.indexOf(loginBlock, loginArmStart) + loginBlock.length
    const afterLogin = outerBlock.slice(loginBlockEndInOuter)
    const storeMarkerIdx = afterLogin.indexOf('if (isTauri())')
    const storeBlock = extractBlock(
      afterLogin.slice(storeMarkerIdx),
      'if (isTauri())'
    )

    expect(storeBlock).toContain('window.api.logInfo')
    expect(storeBlock).toContain('pathname')
  })

  it('self-test: the gate REJECTS a synthetic source where all arms were merged into one unconditional return', () => {
    const merged = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    return <></>',
      '  }',
      '}'
    ].join('\n')

    expect(hasThreeDistinctArms(merged)).toBe(false)
  })

  it('self-test: the gate REJECTS a synthetic source where the Electron fallback return was dropped (behavior-changing regression)', () => {
    const droppedFallback = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isTauri() && isLoginPathname(pathname)) {',
      '      return <TauriLoginPanel runner={runner} />',
      '    }',
      '    if (isTauri()) {',
      '      window.api.logInfo("gap")',
      '      return <WebviewUnavailablePanel url={startUrl} />',
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(hasThreeDistinctArms(droppedFallback)).toBe(false)
  })

  it('self-test: the gate REJECTS a synthetic source where the store/wiki arm was silently changed to also render TauriLoginPanel (wrong-panel regression)', () => {
    const wrongPanel = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isTauri() && isLoginPathname(pathname)) {',
      '      return <TauriLoginPanel runner={runner} />',
      '    }',
      '    if (isTauri()) {',
      '      window.api.logInfo("gap")',
      '      return <TauriLoginPanel runner={runner} />',
      '    }',
      '    return <></>',
      '  }',
      '}'
    ].join('\n')

    expect(hasThreeDistinctArms(wrongPanel)).toBe(false)
  })

  it('self-test: the gate ACCEPTS the exact shape the real source uses (positive control, proves the gate is not vacuously false either)', () => {
    const correctShape = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isTauri() && isLoginPathname(pathname)) {',
      '      return <TauriLoginPanel runner={runner} />',
      '    }',
      '    if (isTauri()) {',
      '      window.api.logInfo("gap")',
      '      return <WebviewUnavailablePanel url={startUrl} />',
      '    }',
      '    return <></>',
      '  }',
      '}'
    ].join('\n')

    expect(hasThreeDistinctArms(correctShape)).toBe(true)
  })
})
