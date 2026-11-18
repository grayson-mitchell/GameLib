/**
 * Source gate: TextInputField's input opts out of spellchecking and automatic
 * correction by default (G-47-12b). A source gate rather than a render because
 * the component reads the settings store (zustand, which pulls in configStore)
 * and is not rendered in this project's tests.
 *
 * Why the defaults exist: the callers hold paths, launch arguments,
 * environment values, API keys and titles, which an on-blur correction would
 * silently rewrite (macOS WKWebView commits the correction with no squiggle
 * shown). The defaults sit before the `{...inputProps}` spread so a caller can
 * still opt back in.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

describe('TextInputField text checking (source gate, G-47-12b)', () => {
  const source = stripSourceComments(
    readFileSync(join(__dirname, '..', 'index.tsx'), 'utf8')
  )
  const start = source.indexOf('<input')
  const inputElement = source.slice(start, source.indexOf('/>', start))

  it('has exactly one input element to inspect', () => {
    expect(start).toBeGreaterThanOrEqual(0)
    expect(source.indexOf('<input', start + 1)).toBe(-1)
  })

  it('sets spellCheck={false} and autoCorrect="off" before the inputProps spread', () => {
    const spread = inputElement.indexOf('{...inputProps}')
    expect(spread).toBeGreaterThan(0)
    const spell = inputElement.indexOf('spellCheck={false}')
    const correct = inputElement.indexOf('autoCorrect="off"')
    expect(spell).toBeGreaterThanOrEqual(0)
    expect(correct).toBeGreaterThanOrEqual(0)
    expect(spell).toBeLessThan(spread)
    expect(correct).toBeLessThan(spread)
  })
})
