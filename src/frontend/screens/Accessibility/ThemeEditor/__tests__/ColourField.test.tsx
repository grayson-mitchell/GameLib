/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ColourField } from '../ColourField'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

beforeEach(() => {
  Object.assign(window, {
    api: {
      storeNew: () => undefined,
      storeGet: (_name: string, _key: string, dflt?: unknown) => dflt,
      storeSet: () => undefined,
      storeSetChecked: () => Promise.resolve(true),
      gamepadAction: () => Promise.resolve()
    }
  })
})

afterEach(cleanup)

const ERROR = 'Enter a hex colour like #1a2b3c or an rgba() value.'

const commits: string[] = []
const renderField = (value = '#336699') => {
  commits.length = 0
  return render(
    <ColourField
      id="body"
      label="Body background"
      value={value}
      onCommit={(v) => commits.push(v)}
    />
  )
}

const field = () => screen.getByRole<HTMLInputElement>('textbox')
const swatch = () => screen.getByRole<HTMLButtonElement>('button')

const typeText = (text: string) =>
  fireEvent.input(field(), { target: { value: text } })

describe('ColourField', () => {
  it('commits the canonical hex of a typed rgba() on Enter', () => {
    renderField()
    typeText('rgba(255, 0, 0, 0.5)')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(commits).toEqual(['#ff000080'])
    expect(field().value).toBe('#ff000080')
  })

  it('shows the colour error for invalid text, commits nothing and restores the last good text on blur', () => {
    renderField()
    typeText('#12')
    expect(screen.getByText(ERROR)).not.toBeNull()
    expect(field().getAttribute('aria-invalid')).toBe('true')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(commits).toEqual([])
    fireEvent.blur(field())
    expect(commits).toEqual([])
    expect(field().value).toBe('#336699')
    expect(screen.queryByText(ERROR)).toBeNull()
  })

  it('treats a cleared field as invalid and keeps the last good value', () => {
    renderField()
    typeText('')
    expect(screen.getByText(ERROR)).not.toBeNull()
    fireEvent.blur(field())
    expect(commits).toEqual([])
    expect(field().value).toBe('#336699')
  })

  it('commits a valid entry on blur', () => {
    renderField()
    typeText('#abc')
    fireEvent.blur(field())
    expect(commits).toEqual(['#aabbcc'])
  })

  it('names the swatch with the label and the current value', () => {
    renderField()
    expect(swatch().getAttribute('aria-label')).toBe(
      'Pick colour for Body background, currently #336699'
    )
  })

  it('never renders a native colour input', () => {
    const { container } = renderField()
    expect(container.querySelector('input[type="color"]')).toBeNull()
  })

  it('opens the picker from the swatch and Escape closes it, returning focus to the swatch', () => {
    renderField()
    expect(document.querySelector('.react-colorful')).toBeNull()
    fireEvent.click(swatch())
    expect(document.querySelector('.react-colorful')).not.toBeNull()
    fireEvent.keyDown(document.querySelector('.react-colorful') as Element, {
      key: 'Escape'
    })
    expect(document.activeElement).toBe(swatch())
  })

  it('commits the picker canonical hex when the alpha slider moves', () => {
    renderField('#336699')
    fireEvent.click(swatch())
    const alpha = screen.getByRole('slider', { name: 'Alpha' })
    // react-colorful reads `keyCode`; 37 is ArrowLeft, which lowers alpha by 0.05.
    fireEvent.keyDown(alpha, { key: 'ArrowLeft', keyCode: 37 })
    expect(commits).toEqual(['#336699f2'])
  })
})
