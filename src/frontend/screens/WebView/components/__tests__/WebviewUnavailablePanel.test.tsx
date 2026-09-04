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

describe('WebviewUnavailablePanel — reason="platform" (D-02, REQ-40-12)', () => {
  it('defaults to the platform reason when no reason prop is passed (D-34 deep-link call site compatibility)', () => {
    const element = WebviewUnavailablePanel({}) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain(
      "In-app store and wiki browsing isn't available on this platform yet"
    )
  })

  it('renders honest copy naming the PLATFORM as the reason, never "this build"', () => {
    const element = WebviewUnavailablePanel({
      reason: 'platform'
    }) as AnyReactElement
    const text = collectText(element)

    expect(text.toLowerCase()).toContain('platform')
    expect(text.toLowerCase()).not.toContain('not available on this build')
    expect(text.toLowerCase()).toContain('store and wiki')
    expect(text.toLowerCase()).not.toMatch(/sign in|signing in|login/)
  })

  it('renders ONLY the platform heading, never the epic heading', () => {
    const element = WebviewUnavailablePanel({
      reason: 'platform'
    }) as AnyReactElement
    const text = collectText(element)

    expect(text).not.toContain('Epic Store browsing')
  })

  it('renders an Open in browser button for the platform reason', () => {
    const url = 'https://store.steampowered.com/'
    const element = WebviewUnavailablePanel({
      url,
      reason: 'platform'
    }) as AnyReactElement
    const button = findByClassName(
      element,
      'WebView__unavailablePanel-openInBrowser'
    )

    expect(button).not.toBeNull()
    button?.props.onClick?.()
    expect(mockApi.openExternalUrl).toHaveBeenCalledWith(url)
  })
})

describe('WebviewUnavailablePanel — reason="epic" (D-05/D-08, REQ-40-12)', () => {
  it('renders ONLY the epic heading, never the platform heading', () => {
    const element = WebviewUnavailablePanel({
      reason: 'epic'
    }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain("Epic Store browsing isn't available in-app yet")
    expect(text).not.toContain('platform')
  })

  it('D-08: the epic copy asserts no blocking/accusatory claim about Epic', () => {
    const element = WebviewUnavailablePanel({
      reason: 'epic'
    }) as AnyReactElement
    const text = collectText(element)

    // The confirmed 403 is on a LOGIN endpoint only (D-07) -- whether Epic
    // guards store pages the same way is unproven. The copy must describe
    // GameLib's own gap ("doesn't yet embed"), never assert that Epic
    // itself blocks, refuses, or prevents in-app browsing.
    expect(text.toLowerCase()).not.toMatch(
      /epic[^.]*\b(blocks?|refuses?|prevents?|disallows?|forbids?)\b/
    )
    expect(text.toLowerCase()).not.toMatch(/\b403\b/)
  })

  it('never mentions signing in or login for the epic reason', () => {
    const element = WebviewUnavailablePanel({
      reason: 'epic'
    }) as AnyReactElement
    const text = collectText(element)

    expect(text.toLowerCase()).not.toMatch(/sign in|signing in|login/)
  })

  it('renders an Open in browser button for the epic reason (D-08 escape hatch)', () => {
    const url = 'https://www.epicgames.com/store/en-US/'
    const element = WebviewUnavailablePanel({
      url,
      reason: 'epic'
    }) as AnyReactElement
    const button = findByClassName(
      element,
      'WebView__unavailablePanel-openInBrowser'
    )

    expect(button).not.toBeNull()
    button?.props.onClick?.()
    expect(mockApi.openExternalUrl).toHaveBeenCalledWith(url)
  })
})

describe('WebviewUnavailablePanel — minted i18n keys (Task 1, gamelib.json only)', () => {
  const gamelibEnPath = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    'public',
    'locales',
    'en',
    'gamelib.json'
  )
  const translationEnPath = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    'public',
    'locales',
    'en',
    'translation.json'
  )

  function getPath(obj: unknown, path: string[]): unknown {
    return path.reduce<unknown>((acc, key) => {
      if (acc !== null && typeof acc === 'object' && key in acc) {
        return (acc as Record<string, unknown>)[key]
      }
      return undefined
    }, obj)
  }

  const mintedKeyPaths = [
    ['webview', 'unavailable', 'platform', 'heading'],
    ['webview', 'unavailable', 'platform', 'body'],
    ['webview', 'unavailable', 'epic', 'heading'],
    ['webview', 'unavailable', 'epic', 'body']
  ]

  it.each(mintedKeyPaths)(
    'gamelib.json has the minted key %s',
    (...path) => {
      const gamelib = JSON.parse(readFileSync(gamelibEnPath, 'utf-8'))
      expect(typeof getPath(gamelib, path)).toBe('string')
    }
  )

  it.each(mintedKeyPaths)(
    'translation.json does NOT have the minted key %s (new strings never go there)',
    (...path) => {
      const translation = JSON.parse(readFileSync(translationEnPath, 'utf-8'))
      expect(getPath(translation, path)).toBeUndefined()
    }
  )
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

describe('WebView/index.tsx — two distinct arms: login / store-wiki (D-06 rider, Group 3, INVERT)', () => {
  const webViewIndexPath = join(__dirname, '..', '..', 'index.tsx')

  /**
   * Phase 40 Plan 01 (D-09/D-10, REQ-40-10). Verdict: INVERT.
   *
   * The guard string this gate used to anchor on, `if (!webviewPreloadPath)`, no longer exists
   * -- Task 2 of that plan hoisted both of its arms to unconditional returns, because
   * `getWebviewPreloadPath` (`appShellFlowRegistration.ts`, D-12) always returns a declared-empty
   * string under Tauri and the guard was therefore always true. The gate's PURPOSE survives the
   * guard's deletion and gets sharper: instead of extracting a named guard's block (which a
   * regression could dodge by naming a NEW guard, or by nesting the two arms one level deeper
   * without touching either arm's own content), this extracts the `WebView` component's whole
   * function body and asserts the two-arm shape structurally, by position and brace depth, not by
   * searching for any particular guard's name.
   */
  function extractFunctionBody(source: string, marker: string): string {
    const markerIdx = source.indexOf(marker)
    if (markerIdx === -1) {
      throw new Error(`marker not found: ${marker}`)
    }
    // Skip past the parameter list by paren-depth, not by the first `{` after the marker -- a
    // destructured parameter (none here, but self-tests below use plain functions too) would
    // otherwise make `indexOf('{', markerIdx)` land on the PARAMETER list's brace instead of the
    // function body's own opening brace.
    const parenStart = source.indexOf('(', markerIdx)
    let parenDepth = 0
    let i = parenStart
    for (; i < source.length; i++) {
      if (source[i] === '(') parenDepth++
      else if (source[i] === ')') {
        parenDepth--
        if (parenDepth === 0) {
          i++
          break
        }
      }
    }
    const braceStart = source.indexOf('{', i)
    let depth = 0
    let j = braceStart
    for (; j < source.length; j++) {
      if (source[j] === '{') depth++
      else if (source[j] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    return source.slice(braceStart, j + 1)
  }

  /** Counts the net brace depth of `source` at the point just before `index`. */
  function braceDepthBefore(source: string, index: number): number {
    let depth = 0
    for (let k = 0; k < index; k++) {
      if (source[k] === '{') depth++
      else if (source[k] === '}') depth--
    }
    return depth
  }

  /**
   * The gate under test: the `WebView` function body must contain, IN ORDER: a login arm gated
   * on `isLoginPathname(pathname)` rendering `TauriLoginPanel`, followed UNCONDITIONALLY (no
   * guarding `if (` of any name/shape in front of it, AND not nested one level deeper inside a
   * reintroduced wrapper of any name -- this is what makes the check structural rather than
   * name-specific) by a store/wiki arm rendering `WebviewUnavailablePanel` (and NOT
   * `TauriLoginPanel`) that names the pathname via `window.api.logInfo`.
   */
  function hasTwoDistinctArms(strippedSource: string): boolean {
    let functionBody: string
    try {
      functionBody = extractFunctionBody(strippedSource, 'function WebView')
    } catch {
      return false
    }

    const loginConditionIdx = functionBody.indexOf('isLoginPathname(pathname)')
    if (loginConditionIdx === -1) return false
    const loginArmStart = functionBody.lastIndexOf('if (', loginConditionIdx)
    if (loginArmStart === -1) return false

    // Structural, not name-specific: the login arm's own `if (` must sit directly inside the
    // function body (brace depth 1, i.e. the function body's own opening brace and nothing
    // else) -- not nested one level deeper inside a reintroduced wrapper guard of any name. A
    // regression that re-wraps BOTH arms behind a fresh guard (mirroring the exact shape of the
    // deleted `!webviewPreloadPath` guard, just renamed) must fail this check even though the
    // login/store arms themselves are otherwise untouched.
    if (braceDepthBefore(functionBody, loginArmStart) !== 1) return false

    let loginBlock: string
    try {
      loginBlock = extractFunctionBody(functionBody.slice(loginArmStart), 'if (')
    } catch {
      return false
    }
    const loginArmRendersLoginPanel = loginBlock.includes('TauriLoginPanel')

    const loginBlockEndInBody =
      functionBody.indexOf(loginBlock, loginArmStart) + loginBlock.length
    const afterLogin = functionBody.slice(loginBlockEndInBody)

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
      '  return <></>',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(merged)).toBe(false)
  })

  it('self-test: the gate REJECTS a synthetic source where the store/wiki arm was silently re-gated behind a guard (stale-guard regression)', () => {
    const reGated = [
      'function WebView() {',
      '  if (isLoginPathname(pathname)) {',
      '    return <TauriLoginPanel runner={runner} />',
      '  }',
      '  if (guardCheck()) {',
      '    window.api.logInfo("gap")',
      '    return <WebviewUnavailablePanel url={startUrl} />',
      '  }',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(reGated)).toBe(false)
  })

  it('self-test: the gate REJECTS a synthetic source where the store/wiki arm was silently changed to also render TauriLoginPanel (wrong-panel regression)', () => {
    const wrongPanel = [
      'function WebView() {',
      '  if (isLoginPathname(pathname)) {',
      '    return <TauriLoginPanel runner={runner} />',
      '  }',
      '  window.api.logInfo("gap")',
      '  return <TauriLoginPanel runner={runner} />',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(wrongPanel)).toBe(false)
  })

  it('self-test: the gate ACCEPTS the exact shape the real source uses (positive control, proves the gate is not vacuously false either)', () => {
    const correctShape = [
      'function WebView() {',
      '  if (isLoginPathname(pathname)) {',
      '    return <TauriLoginPanel runner={runner} />',
      '  }',
      '  window.api.logInfo("gap, pathname=x")',
      '  return <WebviewUnavailablePanel url={startUrl} />',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(correctShape)).toBe(true)
  })

  it('self-test (FIFTH, INVERT anti-regression): the gate REJECTS a synthetic source where the deleted guard was RE-ADDED under an entirely new name, wrapping BOTH arms exactly as `!webviewPreloadPath` used to', () => {
    const reintroducedGuard = [
      'function WebView() {',
      '  if (someFreshlyNamedGuard()) {',
      '    if (isLoginPathname(pathname)) {',
      '      return <TauriLoginPanel runner={runner} />',
      '    }',
      '    window.api.logInfo("gap, pathname=x")',
      '    return <WebviewUnavailablePanel url={startUrl} />',
      '  }',
      '}'
    ].join('\n')

    expect(hasTwoDistinctArms(reintroducedGuard)).toBe(false)
  })
})
