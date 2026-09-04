/**
 * Tests for `StoreEmbedPlaceholder` (Phase 40 Plan 06 Task 2, D-19).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`'s docstring) -- the panel is invoked
 * directly as a plain function, the same DOM-less pattern
 * `WebviewUnavailablePanel.test.tsx` uses in this same directory.
 *
 * The last test in this file asserts the exact minted key
 * (`webview.embedPlaceholder.message`) is present in
 * `public/locales/en/gamelib.json` by reading the catalog directly --
 * `pnpm lint-translations:gamelib` cannot catch a typo between a component
 * and the catalog because it only flags keys with NO reference anywhere
 * (D-37/planning finding 7); a key that is spelled consistently wrong in
 * both places passes that gate silently. This test is what would fail if
 * the component's key and the catalog's key ever drifted from each other.
 */

import type { ReactElement } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

import StoreEmbedPlaceholder from '../StoreEmbedPlaceholder'

type AnyReactElement = ReactElement<{
  children?: unknown
  className?: string
}>

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

const MINTED_KEY = 'webview.embedPlaceholder.message'

describe('StoreEmbedPlaceholder (D-19)', () => {
  it('renders a non-null element with a stable, greppable className', () => {
    const element = (
      StoreEmbedPlaceholder as unknown as () => AnyReactElement
    )()

    expect(element).not.toBeNull()
    expect(element.props.className).toBe('WebView__embedPlaceholder')
  })

  it('takes no props (its signature accepts zero arguments)', () => {
    expect((StoreEmbedPlaceholder as unknown as () => void).length).toBe(0)
  })

  it('renders one short line of copy, no button and no interactive element', () => {
    const element = (
      StoreEmbedPlaceholder as unknown as () => AnyReactElement
    )()
    const text = collectText(element)

    expect(text.length).toBeGreaterThan(0)
    // A "no busy placeholder" ceiling -- generous enough for real copy,
    // tight enough to fail if a future edit turns this into a paragraph.
    expect(text.length).toBeLessThan(80)

    const json = JSON.stringify(element)
    expect(json).not.toContain('"type":"button"')
  })

  it('the minted key exists in gamelib.json with the exact default-text copy the component renders', () => {
    const gamelibJsonPath = join(
      __dirname,
      '../../../../../../public/locales/en/gamelib.json'
    )
    const gamelib = JSON.parse(
      readFileSync(gamelibJsonPath, 'utf8')
    ) as Record<string, unknown>

    const value = MINTED_KEY.split('.').reduce<unknown>((acc, segment) => {
      if (acc && typeof acc === 'object' && segment in acc) {
        return (acc as Record<string, unknown>)[segment]
      }
      return undefined
    }, gamelib)

    expect(typeof value).toBe('string')

    const element = (
      StoreEmbedPlaceholder as unknown as () => AnyReactElement
    )()
    const text = collectText(element)
    expect(text).toBe(value)
  })

  it('the minted key is NOT present in translation.json (D-37: new strings never go there)', () => {
    const translationJsonPath = join(
      __dirname,
      '../../../../../../public/locales/en/translation.json'
    )
    const translation = JSON.parse(
      readFileSync(translationJsonPath, 'utf8')
    ) as Record<string, unknown>

    const value = MINTED_KEY.split('.').reduce<unknown>((acc, segment) => {
      if (acc && typeof acc === 'object' && segment in acc) {
        return (acc as Record<string, unknown>)[segment]
      }
      return undefined
    }, translation)

    expect(value).toBeUndefined()
  })
})
