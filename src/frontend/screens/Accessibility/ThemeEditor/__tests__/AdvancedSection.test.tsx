/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  BUILTIN_TOKENS,
  builtinSeed
} from 'frontend/customThemes/builtinTokens'
import { isValidTokenValue } from 'frontend/customThemes/validate'
import {
  CORE_TOKENS,
  LIVE_DERIVED_TOKENS,
  NON_COLOUR_TOKENS
} from 'frontend/customThemes/tokens'
import { AdvancedSection } from '../AdvancedSection'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

afterEach(cleanup)

const BASE = 'midnightMirage'
const seed = builtinSeed(BASE) as Record<string, string>
const draft: Record<string, string> = { ...seed }

const universe = [
  ...new Set([
    ...Object.keys(seed),
    ...Object.keys(draft),
    ...Object.keys(LIVE_DERIVED_TOKENS)
  ])
]
  .filter(
    (name) =>
      !CORE_TOKENS.includes(name) &&
      !(NON_COLOUR_TOKENS as readonly string[]).includes(name)
  )
  .sort()

const setup = (d: Record<string, string> = draft) => {
  const onCommit = jest.fn()
  const utils = render(
    <AdvancedSection base={BASE} draft={d} onCommit={onCommit} />
  )
  const toggle = () => screen.getByRole('button', { name: /Advanced/ })
  const tokenNames = () =>
    Array.from(utils.container.querySelectorAll('.themeEditor__rowToken')).map(
      (n) => n.textContent
    )
  const filter = () => screen.getByPlaceholderText('Filter tokens')
  return { onCommit, toggle, tokenNames, filter, ...utils }
}

describe('AdvancedSection', () => {
  it('renders collapsed with a count of the hidden tokens and no rows', () => {
    const { toggle, tokenNames } = setup()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(toggle().textContent).toContain(`${universe.length} more tokens`)
    expect(tokenNames()).toHaveLength(0)
    expect(screen.queryByPlaceholderText('Filter tokens')).toBeNull()
  })

  it('opens to a filter input and every other token sorted by name', () => {
    const { toggle, tokenNames, filter } = setup()
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(filter()).toBeTruthy()
    expect(tokenNames()).toEqual(universe)
  })

  it('excludes core tokens and --focus-ring-width, and includes live-derived tokens', () => {
    const { toggle, tokenNames } = setup()
    fireEvent.click(toggle())
    const names = tokenNames()
    for (const core of CORE_TOKENS) expect(names).not.toContain(core)
    expect(names).not.toContain('--focus-ring-width')
    for (const derived of Object.keys(LIVE_DERIVED_TOKENS)) {
      expect(names).toContain(derived)
    }
  })

  it('filters by name or label, ignoring case', () => {
    const { toggle, tokenNames, filter } = setup()
    fireEvent.click(toggle())
    fireEvent.input(filter(), { target: { value: 'GAMECARD' } })
    const names = tokenNames()
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(name?.toLowerCase()).toContain('gamecard')
  })

  it('says no tokens match, with the query, for a miss', () => {
    const { toggle, tokenNames, filter } = setup()
    fireEvent.click(toggle())
    fireEvent.input(filter(), { target: { value: 'zzz' } })
    expect(tokenNames()).toHaveLength(0)
    expect(screen.getByText('No tokens match “zzz”.')).toBeTruthy()
  })

  it('renders gradient tokens as raw-text fields and colours as colour rows', () => {
    const { toggle, container } = setup()
    fireEvent.click(toggle())
    expect(container.querySelector('#token--gradient-body-background')).toBe(
      container.querySelector('textarea#token--gradient-body-background')
    )
    expect(
      container.querySelector('textarea#token--gradient-gamecard')
    ).toBeTruthy()
    const colourToken = universe.find(
      (name) => !/gradient/.test(name) && /^#/.test(seed[name] ?? '')
    ) as string
    expect(container.querySelector(`input#token${colourToken}`)).toBeTruthy()
  })

  it.each(Object.keys(BUILTIN_TOKENS))(
    'IN-03: a %s copy edits exactly the four gradient tokens as gradients, each accepted by the validator',
    (key) => {
      const copy: Record<string, string> = { ...builtinSeed(key) }
      const { container } = render(
        <AdvancedSection base={key} draft={copy} onCommit={jest.fn()} />
      )
      fireEvent.click(screen.getByRole('button', { name: /Advanced/ }))
      const names = Array.from(container.querySelectorAll('textarea'))
        .map((el) => el.id.replace(/^token/, ''))
        .sort()
      expect(names).toEqual([
        '--gradient-01',
        '--gradient-02',
        '--gradient-body-background',
        '--gradient-gamecard'
      ])
      for (const name of names) {
        expect(
          isValidTokenValue(
            name,
            'linear-gradient(90deg, #000, #333)',
            () => true
          )
        ).toBe(true)
      }
    }
  )

  it('commits an edited colour through onCommit with the token name', () => {
    const colourToken = universe.find(
      (name) => !/gradient/.test(name) && /^#/.test(seed[name] ?? '')
    ) as string
    const { toggle, onCommit, container } = setup()
    fireEvent.click(toggle())
    const input = container.querySelector(
      `input#token${colourToken}`
    ) as HTMLInputElement
    fireEvent.input(input, { target: { value: '#123456' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith(colourToken, '#123456')
  })
})
