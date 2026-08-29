/**
 * Tests for WebviewUnavailablePanel (D-06, REQ-34.4.1-07) plus one
 * source-text gate: proving `WebView/index.tsx`'s two arms (login/
 * store-wiki) stay structurally distinct (D-06's rider).
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
 * Deviation note (34.4.1-05, Task 1+3 combined — see that plan's SUMMARY):
 * the Group 3 structural gate below was originally written asserting a
 * three-arm shape (login / store-wiki / an Electron-only fallback arm),
 * because a Tauri-context check gated the first two arms and the third was
 * reachable only when that check was false.
 *
 * Phase 35 plan 17 note: that check is gone (the shell it distinguished no
 * longer exists — Tauri is the only runtime now), so the third arm was
 * unreachable dead code and has been deleted from `index.tsx`. The gate
 * below is REWRITTEN again, not deleted, to assert the resulting two-arm
 * shape: a login arm gated on `isLoginPathname(pathname)`, followed
 * unconditionally by the store/wiki arm. Rewriting to check the structure
 * explicitly (rather than searching for a specific guard's name) is
 * deliberate — this is what lets the gate keep catching ANY future guard
 * that re-appears in front of the store/wiki arm, not just one spelled a
 * particular way (the exact regression this file's own history has already
 * hit once, in the 34.4.1-05 rewrite referenced above).
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

describe('WebView/index.tsx — two distinct arms: login / store-wiki (D-06 rider, Group 3)', () => {
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
   * on `isLoginPathname(pathname)` rendering `TauriLoginPanel`, followed
   * UNCONDITIONALLY (no guarding `if (` of any name/shape in front of it —
   * this is what makes the check structural rather than name-specific) by
   * a store/wiki arm rendering `WebviewUnavailablePanel` (and NOT
   * `TauriLoginPanel`) that names the pathname via `window.api.logInfo`.
   */
  function hasTwoDistinctArms(strippedSource: string): boolean {
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

    // Structural, not name-specific: the store/wiki arm must not be
    // guarded by ANY `if (` immediately following the login arm's close
    // brace. A regression that re-adds a guard here -- named after the
    // deleted predicate or anything else -- must fail this check.
    const storeArmHasNoGuard = !/^\s*if\s*\(/.test(afterLogin)
    const storeArmRendersUnavailablePanel =
      afterLogin.includes('WebviewUnavailablePanel') &&
      !afterLogin.includes('TauriLoginPanel')
    const storeArmLogsPathname =
      afterLogin.includes('window.api.logInfo') &&
      afterLogin.includes('pathname')

    return (
      loginArmRendersLoginPanel &&
      storeArmHasNoGuard &&
      storeArmRendersUnavailablePanel &&
      storeArmLogsPathname
    )
  }

  it('the real source has two distinct arms: login (TauriLoginPanel, gated), store/wiki (WebviewUnavailablePanel, unconditional)', () => {
    const rawSource = readFileSync(webViewIndexPath, 'utf-8')
    const stripped = stripSourceComments(rawSource)

    expect(hasTwoDistinctArms(stripped)).toBe(true)
  })

  it('self-test: the gate REJECTS a synthetic source where both arms were merged into one unconditional return', () => {
    const merged = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    return <></>',
      '  }',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(merged)).toBe(false)
  })

  it('self-test: the gate REJECTS a synthetic source where the store/wiki arm was silently re-gated behind a guard (stale-guard regression)', () => {
    const reGated = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isLoginPathname(pathname)) {',
      '      return <TauriLoginPanel runner={runner} />',
      '    }',
      '    if (guardCheck()) {',
      '      window.api.logInfo("gap")',
      '      return <WebviewUnavailablePanel url={startUrl} />',
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(reGated)).toBe(false)
  })

  it('self-test: the gate REJECTS a synthetic source where the store/wiki arm was silently changed to also render TauriLoginPanel (wrong-panel regression)', () => {
    const wrongPanel = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isLoginPathname(pathname)) {',
      '      return <TauriLoginPanel runner={runner} />',
      '    }',
      '    window.api.logInfo("gap")',
      '    return <TauriLoginPanel runner={runner} />',
      '  }',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(wrongPanel)).toBe(false)
  })

  it('self-test: the gate ACCEPTS the exact shape the real source uses (positive control, proves the gate is not vacuously false either)', () => {
    const correctShape = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isLoginPathname(pathname)) {',
      '      return <TauriLoginPanel runner={runner} />',
      '    }',
      '    window.api.logInfo("gap, pathname=x")',
      '    return <WebviewUnavailablePanel url={startUrl} />',
      '  }',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(correctShape)).toBe(true)
  })
})
