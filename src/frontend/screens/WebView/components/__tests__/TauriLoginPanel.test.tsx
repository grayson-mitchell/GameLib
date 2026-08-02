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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
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
    const props = (node as AnyReactElement & { props?: { className?: unknown } }).props
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
  it.each(['legendary', 'gog', 'nile', 'zoom'])(
    'runner=%s renders "Finalizing" + the runner label, a spinner element, and never the blocked copy',
    (runner) => {
      const element = TauriLoginPanel({
        runner,
        state: { phase: 'finalizing', runner: runner as never }
      }) as AnyReactElement
      const text = collectText(element)
      const runnerLabel = runner.charAt(0).toUpperCase() + runner.slice(1)

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

    expect(text).toContain('Signing in to Gog')
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
    TauriLoginPanel({ runner: 'gog', state: { phase: 'finalizing', runner: 'gog' } })

    expect(mockApi.logInfo).toHaveBeenCalledTimes(1)
    const [message] = mockApi.logInfo.mock.calls[0]
    expect(message).toContain('runner=gog')
    expect(message).toContain('phase=finalizing')
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
