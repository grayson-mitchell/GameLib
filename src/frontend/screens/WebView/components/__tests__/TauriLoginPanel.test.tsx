/**
 * Unit tests for TauriLoginPanel (D-06/D-04, REQ-34.4.1-07/-08).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js's docstring) — the panel is invoked directly
 * as a plain function, the same DOM-less pattern
 * WebviewUnavailablePanel.test.tsx / CrossoverBadge.test.tsx use.
 *
 * `window.api` is stubbed at the `globalThis` level (mirrors
 * StoreSearchRow.test.tsx's convention) because the component's
 * declared-blocked branch calls `window.api.logInfo` synchronously in its
 * render body — this project's `testEnvironment: 'node'` jest config has no
 * `window` global otherwise.
 */
import type { ReactElement } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// The mock INTERPOLATES, mirroring real i18next (quick task 260823-qsm / 34.4 WR-02+WR-03).
// It used to be `t: (_key, defaultValue) => defaultValue`, dropping the options argument on the
// floor -- which is precisely the blindness 34.4-REVIEW.md's WR-03 called out: a mock that ignores
// options cannot tell a `{{placeholder}}` default from one with the value baked in, so it can
// never catch the very defect WR-03 describes. Substituting here means every assertion below
// exercises the real interpolation path.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      options?: Record<string, unknown>
    ): string =>
      defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(options?.[name] ?? '')
      )
  })
}))

const mockApi = {
  logInfo: jest.fn(),
  clipboardWriteText: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

import TauriLoginPanel from '../TauriLoginPanel'

type AnyReactElement = ReactElement<{ children?: unknown }>

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

// Quick task 260803-eee: walks the same element graph as collectText, gathering every
// `props.className` found so the spinner's presence can be asserted without a DOM.
function collectClassNames(node: unknown): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return []
  }
  if (Array.isArray(node)) {
    return node.flatMap(collectClassNames)
  }
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (
      node as AnyReactElement & { props?: { className?: unknown } }
    ).props
    const own = typeof props?.className === 'string' ? [props.className] : []
    return [...own, ...collectClassNames(props?.children)]
  }
  return []
}

describe('TauriLoginPanel — Humble in-progress surface', () => {
  it('renders in-progress copy and never the word "unavailable"', () => {
    const element = TauriLoginPanel({ runner: 'humble' }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('Humble')
    expect(text.toLowerCase()).toContain('sign-in window has opened')
    expect(text.toLowerCase()).not.toContain('unavailable')
  })

  it('does not call window.api.logInfo for the humble variant', () => {
    TauriLoginPanel({ runner: 'humble' })

    expect(mockApi.logInfo).not.toHaveBeenCalled()
  })
})

describe('TauriLoginPanel — Humble error/timeout surfaces [F-34.4.2-19]', () => {
  it('{ phase: "error" } falls through to the shared generic error branch, naming Humble Bundle and a Retry affordance', () => {
    const element = TauriLoginPanel({
      runner: 'humble',
      state: {
        phase: 'error',
        message: 'the Humble sign-in window closed or could not be reached'
      }
    }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('Humble Bundle')
    expect(text).toContain('failed')
    expect(text).toContain(
      'the Humble sign-in window closed or could not be reached'
    )
    expect(text.toLowerCase()).not.toContain('sign-in window has opened')
    expect(text).toContain('Retry')
  })

  it('{ phase: "timeout" } falls through to the shared generic timeout branch, naming Humble Bundle and a Retry affordance', () => {
    const element = TauriLoginPanel({
      runner: 'humble',
      state: { phase: 'timeout' }
    }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('Humble Bundle')
    expect(text).toContain('timed out')
    expect(text.toLowerCase()).not.toContain('sign-in window has opened')
    expect(text).toContain('Retry')
  })

  it('the Retry button reloads the page, exactly like every other runner’s error/timeout surface', () => {
    const element = TauriLoginPanel({
      runner: 'humble',
      state: { phase: 'error', message: 'unreachable' }
    }) as AnyReactElement
    const reloadSpy = jest.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true
    })

    function findButton(node: unknown): AnyReactElement | undefined {
      if (node === null || node === undefined || typeof node === 'boolean') {
        return undefined
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = findButton(child)
          if (found) return found
        }
        return undefined
      }
      if (typeof node === 'object' && node !== null && 'type' in node) {
        const el = node as AnyReactElement & { type?: unknown }
        if (el.type === 'button') return el
        return findButton((el.props as { children?: unknown })?.children)
      }
      return undefined
    }

    const button = findButton(element)
    expect(button).toBeDefined()
    ;(button?.props as { onClick?: () => void })?.onClick?.()
    expect(reloadSpy).toHaveBeenCalled()
  })

  it('other phases (idle/undefined) are unaffected: humble still renders its in-progress copy', () => {
    const element = TauriLoginPanel({ runner: 'humble' }) as AnyReactElement
    const text = collectText(element)

    expect(text.toLowerCase()).toContain('sign-in window has opened')
    expect(text).not.toContain('Retry')
  })
})

describe('TauriLoginPanel — OAuth declared-blocked surface (D-04)', () => {
  it.each([
    ['legendary', 'login'],
    ['gog', 'authGOG'],
    ['nile', 'authAmazon'],
    ['zoom', 'authZoom']
  ])(
    'runner=%s names its channel (%s) and states Phase 34.5',
    (runner, channel) => {
      const element = TauriLoginPanel({ runner }) as AnyReactElement
      const text = collectText(element)

      expect(text).toContain(channel)
      expect(text).toContain('Phase 34.5')
      expect(text.toLowerCase()).not.toContain('not attempted')
      expect(text.toLowerCase()).not.toContain('nothing was attempted')
    }
  )

  it('calls window.api.logInfo exactly once per mount for the OAuth variant, naming runner and channel', () => {
    TauriLoginPanel({ runner: 'gog' })

    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
    const [message] = mockApi.logInfo.mock.calls[0]
    expect(message).toContain('gog')
    expect(message).toContain('authGOG')
  })

  it('still renders the declared-blocked surface (no crash) when no runner is provided', () => {
    const element = TauriLoginPanel({}) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('Phase 34.5')
    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
  })

  it('an unrecognized runner falls back to the generic "sign-in channel" phrasing rather than crashing', () => {
    const element = TauriLoginPanel({ runner: 'sideload' }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('the sign-in channel')
    expect(text).toContain('Phase 34.5')
  })
})

describe('TauriLoginPanel — finalizing surface [quick task 260803-eee]', () => {
  // WR-02 (quick task 260823-qsm): the expected label is now DECLARED per runner rather than
  // recomputed by capitalizing the id. Recomputing it made this table tautological — it asserted
  // the component did whatever the test did, which is how "Legendary"/"Gog"/"Nile" survived a
  // full phase of review. `zoom` has no mapping entry, so it keeps the capitalize fallback.
  it.each([
    ['legendary', 'Epic Games'],
    ['gog', 'GOG'],
    ['nile', 'Amazon Games'],
    ['zoom', 'Zoom']
  ])(
    'runner=%s renders "Finalizing" + the user-facing store name (%s), a spinner element, and never the blocked copy',
    (runner, runnerLabel) => {
      const element = TauriLoginPanel({
        runner,
        state: { phase: 'finalizing', runner: runner as never }
      }) as AnyReactElement
      const text = collectText(element)

      expect(text).toContain('Finalizing')
      expect(text).toContain(runnerLabel)
      expect(text).not.toContain('Phase 34.5')
      expect(text).not.toContain('not wired up')
      expect(text.toLowerCase()).not.toContain('sign-in window has opened')

      const classNames = collectClassNames(element)
      expect(classNames).toContain('WebView__unavailablePanel-spinner')
    }
  )

  it('{ phase: "awaiting" } still renders the byte-identical original copy, distinct from finalizing', () => {
    const element = TauriLoginPanel({
      runner: 'gog',
      state: { phase: 'awaiting' }
    }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('Signing in to GOG')
    expect(text).toContain('A sign-in window has opened.')
    expect(text).not.toContain('Finalizing')
    const classNames = collectClassNames(element)
    expect(classNames).not.toContain('WebView__unavailablePanel-spinner')
  })

  it('the declared-blocked default (state undefined) is unchanged: same text, same single logInfo call', () => {
    mockApi.logInfo.mockClear()
    const element = TauriLoginPanel({ runner: 'gog' }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('Phase 34.5')
    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
  })

  it('logs one [TauriLoginPanel] runner=<runner> phase=finalizing line', () => {
    mockApi.logInfo.mockClear()
    TauriLoginPanel({
      runner: 'gog',
      state: { phase: 'finalizing', runner: 'gog' }
    })

    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
    const [message] = mockApi.logInfo.mock.calls[0]
    expect(message).toContain('runner=gog')
    expect(message).toContain('phase=finalizing')
  })
})

describe('TauriLoginPanel — preparing surface (quick task 260806-teb)', () => {
  it('renders the spinner element, a heading naming the runner, and a body -- never the awaiting or declared-blocked copy', () => {
    const element = TauriLoginPanel({
      runner: 'nile',
      state: { phase: 'preparing', runner: 'nile' }
    }) as AnyReactElement
    const text = collectText(element)

    expect(text).toContain('Preparing')
    expect(text).toContain('Amazon Games')
    expect(text.toLowerCase()).not.toContain('a sign-in window has opened')
    expect(text).not.toContain('Phase 34.5')
    expect(text).not.toContain('not wired up')

    const classNames = collectClassNames(element)
    expect(classNames).toContain('WebView__unavailablePanel-spinner')
  })

  it('never claims a sign-in window has already opened', () => {
    const element = TauriLoginPanel({
      runner: 'nile',
      state: { phase: 'preparing', runner: 'nile' }
    }) as AnyReactElement
    const text = collectText(element).toLowerCase()

    expect(text).not.toContain('window has opened')
  })

  it('logs one [TauriLoginPanel] runner=<runner> phase=preparing line', () => {
    mockApi.logInfo.mockClear()
    TauriLoginPanel({
      runner: 'nile',
      state: { phase: 'preparing', runner: 'nile' }
    })

    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
    const [message] = mockApi.logInfo.mock.calls[0]
    expect(message).toContain('runner=nile')
    expect(message).toContain('phase=preparing')
  })

  it('{ phase: "awaiting" } and the declared-blocked default are unaffected by the new branch', () => {
    const awaiting = TauriLoginPanel({
      runner: 'gog',
      state: { phase: 'awaiting' }
    }) as AnyReactElement
    const awaitingText = collectText(awaiting)
    expect(awaitingText).toContain('Signing in to GOG')
    expect(awaitingText).not.toContain('Preparing')

    mockApi.logInfo.mockClear()
    const idleDefault = TauriLoginPanel({ runner: 'gog' }) as AnyReactElement
    const idleText = collectText(idleDefault)
    expect(idleText).toContain('Phase 34.5')
    expect(idleText).not.toContain('Preparing')
    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
  })
})

describe('TauriLoginPanel — no navigator.clipboard reference', () => {
  it('never touches navigator.clipboard for either surface', () => {
    TauriLoginPanel({ runner: 'humble' })
    TauriLoginPanel({ runner: 'gog' })
    TauriLoginPanel({})

    expect(mockApi.clipboardWriteText).not.toHaveBeenCalled()
  })

  const panelSourcePath = join(__dirname, '..', 'TauriLoginPanel.tsx')

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
})

describe('TauriLoginPanel — WR-03: no dynamic value baked into a t() default', () => {
  const panelSource = join(__dirname, '..', 'TauriLoginPanel.tsx')

  /**
   * Finds `t('key', ...)` calls whose DEFAULT argument is a template literal carrying a `${}`
   * substitution. That is the WR-03 defect shape: i18next looks a key up by key alone, so the
   * moment any locale supplies one of these keys the translated string wins and the baked-in
   * runtime value silently disappears — in every locale except untranslated English.
   *
   * Deliberately narrow: it matches only the argument position after a key literal, so template
   * literals elsewhere in the file (the logInfo lines, channelLabel's backticks) are not flagged.
   */
  function bakedDefaults(source: string): string[] {
    const clean = stripSourceComments(source)
    const calls = clean.matchAll(/\bt\(\s*'[^']+'\s*,\s*(`(?:[^`\\]|\\.)*`)/g)
    return [...calls].map((m) => m[1]).filter((arg) => arg.includes('${'))
  }

  it('the real component source bakes no dynamic value into any t() default', () => {
    expect(bakedDefaults(readFileSync(panelSource, 'utf-8'))).toEqual([])
  })

  it('self-test: the gate DOES catch a baked-in default (proven against known-bad input)', () => {
    const synthetic = [
      'const heading = t(',
      "  'webview.login.oauth.awaiting.heading',",
      '  `Signing in to ${runnerLabel}`',
      ')'
    ].join('\n')

    expect(bakedDefaults(synthetic)).toHaveLength(1)
  })

  it('self-test: the gate does NOT fire on a correct interpolated default', () => {
    const synthetic = [
      'const heading = t(',
      "  'webview.login.oauth.awaiting.heading',",
      "  'Signing in to {{runner}}',",
      '  { runner: runnerLabel }',
      ')'
    ].join('\n')

    expect(bakedDefaults(synthetic)).toEqual([])
  })
})

describe('TauriLoginPanel — reusable by plan 34.4.1-09 without restructuring', () => {
  it('accepts an optional state prop that defaults to undefined without changing the declared-blocked render', () => {
    const withoutState = TauriLoginPanel({ runner: 'zoom' }) as AnyReactElement
    const withUndefinedState = TauriLoginPanel({
      runner: 'zoom',
      state: undefined
    }) as AnyReactElement

    expect(collectText(withoutState)).toBe(collectText(withUndefinedState))
  })
})
