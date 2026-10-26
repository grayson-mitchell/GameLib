import { messageBoxButtonClassName } from '../buttonClassName'

describe('messageBoxButtonClassName', () => {
  test('no variant keeps the legacy secondary-outline classes byte-identical', () => {
    expect(messageBoxButtonClassName(undefined)).toBe(
      'button is-secondary outline'
    )
  })

  test('primary maps to the primary button', () => {
    expect(messageBoxButtonClassName('primary')).toBe('button is-primary')
  })

  test('danger maps to the danger button, pushed to the far left', () => {
    expect(messageBoxButtonClassName('danger')).toBe(
      'button is-danger messageBoxModal__button--separated'
    )
  })
})
