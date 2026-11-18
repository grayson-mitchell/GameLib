/**
 * Pins the text-checking opt-outs on the shared SearchBar input (G-47-12b).
 * This pins the attributes only: whether macOS still rewrites the typed word
 * on blur can only be seen live (the debug session's synthetic WKWebView
 * harness never reproduced the bug), so the human check in plan 47-20 is the
 * proof of the behaviour.
 */
import { renderToStaticMarkup } from 'react-dom/server'

import SearchBar from '..'

// React 18's server renderer warns that useLayoutEffect does nothing on the
// server; SearchBar uses two. Swallow only that warning, forward the rest.
const USE_LAYOUT_EFFECT_WARNING = /useLayoutEffect does nothing on the server/

describe('SearchBar text checking (G-47-12b)', () => {
  let errorSpy: jest.SpyInstance
  const forwarded: unknown[][] = []

  beforeEach(() => {
    forwarded.length = 0
    const realError = console.error.bind(console)
    errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        if (
          typeof args[0] === 'string' &&
          USE_LAYOUT_EFFECT_WARNING.test(args[0])
        ) {
          return
        }
        forwarded.push(args)
        realError(...args)
      })
  })

  afterEach(() => {
    errorSpy.mockRestore()
  })

  const renderInputTags = (): string[] => {
    const markup = renderToStaticMarkup(
      <SearchBar
        value="xcom"
        placeholder="Search"
        onInputChanged={() => undefined}
      />
    )
    return markup.match(/<input\b[^>]*>/gi) ?? []
  }

  const attribute = (tag: string, name: string): string | null => {
    const match = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)
    return match ? match[1]! : null
  }

  it('renders exactly one input that opts out of spellchecking and autocorrection', () => {
    const tags = renderInputTags()
    expect(tags).toHaveLength(1)
    const tag = tags[0]!
    expect(attribute(tag, 'spellcheck')).toBe('false')
    expect(attribute(tag, 'autocorrect')).toBe('off')
    expect(attribute(tag, 'autocapitalize')).toBe('off')
    expect(attribute(tag, 'autocomplete')).toBe('off')
  })

  it('keeps the virtual-keyboard id and does not become a native search field', () => {
    const tag = renderInputTags()[0]!
    expect(attribute(tag, 'id')).toBe('search')
    expect(attribute(tag, 'type')).toBeNull()
  })

  it('does not hide any console error other than the server useLayoutEffect warning', () => {
    renderInputTags()
    expect(forwarded).toEqual([])
  })
})
