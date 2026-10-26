import type { ButtonOptions } from 'common/types'

// Maps a button's opt-in `variant` to its class list. Kept apart from the
// component so tests can import it without pulling in the stylesheet.
export function messageBoxButtonClassName(
  variant?: ButtonOptions['variant']
): string {
  switch (variant) {
    case 'primary':
      return 'button is-primary'
    case 'danger':
      return 'button is-danger messageBoxModal__button--separated'
    default:
      return 'button is-secondary outline'
  }
}
