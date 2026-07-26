/**
 * Tests for WebviewUnavailablePanel (D-04, REQ-34.4-12) plus two
 * source-text gates: proving `WebView/index.tsx`'s Electron arm stays
 * structurally distinct and provably unreachable (D-04's rider), and that
 * the panel itself never references `navigator.clipboard`
 * (navigator-clipboard-noops-under-tauri).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js's docstring) — the panel is invoked
 * directly as a plain function, the same DOM-less pattern
 * CrossoverBadge.test.tsx uses.
 *
 * Group 2's unreachability proof uses the STRUCTURAL FALLBACK, not the
 * "behavioral, preferred" form the plan names first: WebView/index.tsx is
 * a large hook-heavy component (useState/useEffect/useRef/useContext/
 * useNavigate/useLocation/useParams) that cannot be invoked as a plain
 * function outside a React render tree — doing so throws "Invalid hook
 * call" with no dispatcher present, and this project has no DOM harness to
 * render it properly (jest.config.js's own docstring). So this proves the
 * branch shape by reading and comment-stripping the real source text,
 * self-tested against synthetic merged/regressed sources per the plan's
 * own anti-vacuity requirement — the exact lesson Phase 34.2's four gap
 * cycles paid for (a source-text gate without a self-test is a vacuous
 * gate).
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

import WebviewUnavailablePanel from '../WebviewUnavailablePanel'

type AnyReactElement = ReactElement<{ children?: unknown }>

/**
 * Recursively flattens a React element's `children` prop graph into a
 * single string. Operates purely on the plain element/props object graph
 * React elements already are before rendering — no DOM required. Assert on
 * the aggregated text, not on layout or nesting depth (a brittle
 * structural assertion would break on the next styling change).
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

describe('WebviewUnavailablePanel (D-04, REQ-34.4-12)', () => {
  it('renders a non-null element with a stable, greppable className — not a blank fragment', () => {
    const element = WebviewUnavailablePanel({}) as AnyReactElement

    expect(element).not.toBeNull()
    expect(element.props).toBeDefined()
    expect(
      (element as ReactElement<{ className?: string }>).props.className
    ).toBe('WebView__unavailablePanel')
  })

  it('renders honest explanatory text naming the build limitation and the Electron workaround', () => {
    const element = WebviewUnavailablePanel({}) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('not available on this build')
    expect(text).toContain('does not yet embed a browser view')
    expect(text).toContain('Electron build')
    expect(text.length).toBeGreaterThan(0)
  })

  it('names the attempted store/runner when provided', () => {
    const element = WebviewUnavailablePanel({
      runner: 'humble'
    }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('Humble')
    expect(text).toContain('unavailable here')
  })

  it('still names the limitation honestly when no runner is provided (no crash, no blank content)', () => {
    const element = WebviewUnavailablePanel({}) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('not available on this build')
  })
})

describe('WebviewUnavailablePanel — no navigator.clipboard reference (Group 3)', () => {
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

describe('WebView/index.tsx — Electron arm stays structurally distinct and unreachable (D-04 rider, Group 2)', () => {
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
   * The gate under test (D-04's rider, proven not asserted): the
   * `!webviewPreloadPath` block must contain a nested `if (isTauri())`
   * sub-block that renders WebviewUnavailablePanel, AND a `return <></>`
   * that appears strictly AFTER that sub-block closes — i.e. a distinct,
   * separate arm, not merged into a single expression/ternary and not
   * nested inside the Tauri arm itself.
   */
  function hasDistinctTauriAndElectronArms(strippedSource: string): boolean {
    let outerBlock: string
    try {
      outerBlock = extractBlock(strippedSource, 'if (!webviewPreloadPath)')
    } catch {
      return false
    }

    const tauriIdx = outerBlock.indexOf('if (isTauri())')
    if (tauriIdx === -1) {
      return false
    }

    const tauriBlock = extractBlock(
      outerBlock.slice(tauriIdx),
      'if (isTauri())'
    )
    const tauriArmRendersPanel = tauriBlock.includes('WebviewUnavailablePanel')

    const tauriBlockEndInOuter =
      outerBlock.indexOf(tauriBlock, tauriIdx) + tauriBlock.length
    const afterTauriBlock = outerBlock.slice(tauriBlockEndInOuter)
    const electronArmReturnsEmptyFragment = /return\s*<>\s*<\/>/.test(
      afterTauriBlock
    )

    return tauriArmRendersPanel && electronArmReturnsEmptyFragment
  }

  it('the real source has a distinct isTauri() arm (rendering the panel) and a distinct, later return <></> arm', () => {
    const rawSource = readFileSync(webViewIndexPath, 'utf-8')
    const stripped = stripSourceComments(rawSource)

    expect(hasDistinctTauriAndElectronArms(stripped)).toBe(true)
  })

  it('the real source calls window.api.logInfo naming the screen and the runner inside the Tauri arm', () => {
    const rawSource = readFileSync(webViewIndexPath, 'utf-8')
    const stripped = stripSourceComments(rawSource)
    const outerBlock = extractBlock(stripped, 'if (!webviewPreloadPath)')
    const tauriBlock = extractBlock(
      outerBlock.slice(outerBlock.indexOf('if (isTauri())')),
      'if (isTauri())'
    )

    expect(tauriBlock).toContain('window.api.logInfo')
    expect(tauriBlock).toContain('WebView')
    expect(tauriBlock).toContain('runner')
  })

  it('self-test: the gate REJECTS a synthetic source where the arms have been merged into a single unconditional return (the exact hand RED-proof mutation)', () => {
    const merged = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    return <></>',
      '  }',
      '}'
    ].join('\n')

    expect(hasDistinctTauriAndElectronArms(merged)).toBe(false)
  })

  it('self-test: the gate REJECTS a synthetic source where isTauri() is called but the Electron fallback return was dropped (behavior-changing regression)', () => {
    const droppedFallback = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isTauri()) {',
      '      return <WebviewUnavailablePanel />',
      '    }',
      '  }',
      '}'
    ].join('\n')

    expect(hasDistinctTauriAndElectronArms(droppedFallback)).toBe(false)
  })

  it('self-test: the gate REJECTS a synthetic source where the Electron arm was silently changed to also render the panel', () => {
    const bothArmsRenderPanel = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isTauri()) {',
      '      return <WebviewUnavailablePanel />',
      '    }',
      '    return <WebviewUnavailablePanel />',
      '  }',
      '}'
    ].join('\n')

    expect(hasDistinctTauriAndElectronArms(bothArmsRenderPanel)).toBe(false)
  })

  it('self-test: the gate ACCEPTS the exact shape the plan specifies (positive control, proves the gate is not vacuously false either)', () => {
    const correctShape = [
      'function WebView() {',
      '  if (!webviewPreloadPath) {',
      '    if (isTauri()) {',
      '      window.api.logInfo("[WebView] gap")',
      '      return <WebviewUnavailablePanel />',
      '    }',
      '    return <></>',
      '  }',
      '}'
    ].join('\n')

    expect(hasDistinctTauriAndElectronArms(correctShape)).toBe(true)
  })
})
