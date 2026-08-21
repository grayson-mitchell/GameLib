/**
 * Unit tests for CrossoverBadge (CXIDX-10/CXIDX-11).
 *
 * Same DOM-less function-invocation pattern as MacArchBadge.test.tsx — no
 * jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring). 'react-i18next' is mocked at the
 * module level so the component can be invoked directly as a plain function;
 * the returned React element's props are inspected without ever needing a
 * DOM/render tree.
 */
import type { ReactElement } from 'react'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

import CrossoverBadge from '../CrossoverBadge'

type Rendered = ReactElement<{
  className?: string
  title?: string
  children?: string
}> | null

describe('CrossoverBadge', () => {
  it('renders nothing when rating is undefined (app_name not looked up — D-16)', () => {
    const element = CrossoverBadge({ rating: undefined }) as Rendered

    expect(element).toBeNull()
  })

  it.each([
    [5, 'gold', 'Runs great on CrossOver (gold rating)'],
    [4, 'silver', 'Runs well on CrossOver (silver rating)'],
    [3, 'bronze', 'Runs with issues on CrossOver (bronze rating)'],
    [2, 'wontRun', 'Known not to work on CrossOver'],
    [1, 'wontRun', 'Known not to work on CrossOver']
  ])(
    'rating=%i derives to tier %s with the correct aria-label',
    (rating, tier, label) => {
      const element = CrossoverBadge({ rating }) as Rendered

      expect(element).not.toBeNull()
      expect(element?.props.className).toContain(
        `gameCardCrossoverBadge--${tier}`
      )
      expect(element?.props.title).toBe(label)
    }
  )

  it('renders the neutral "unknown" dot when rating is null (looked up, absent from index — D-16)', () => {
    const element = CrossoverBadge({ rating: null }) as Rendered

    expect(element).not.toBeNull()
    expect(element?.props.className).toContain(
      'gameCardCrossoverBadge--unknown'
    )
    expect(element?.props.title).toBe('CrossOver compatibility unknown')
  })

  it('title and aria-label are always identical', () => {
    const element = CrossoverBadge({ rating: 5 }) as unknown as ReactElement<{
      title?: string
      'aria-label'?: string
    }>

    expect(element.props.title).toBe(element.props['aria-label'])
  })

  it('carries no dense text in the visible glyph — the sentence lives only in title/aria-label', () => {
    const element = CrossoverBadge({ rating: 5 }) as Rendered

    expect(element?.props.children ?? '').toBe('')
  })
})
