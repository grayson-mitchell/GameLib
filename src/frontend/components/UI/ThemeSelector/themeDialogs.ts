import { createElement } from 'react'
import type { TFunction } from 'i18next'
import useUiState from 'frontend/state/uiState'
import { MAX_CUSTOM_THEMES } from 'frontend/customThemes/customTheme'

/**
 * The limit and delete confirmations over the shared dialog queue. Every message is a React
 * element, so MessageBoxModal never routes a user-typed theme name through its string path
 * (`textarea.innerHTML` entity decoding, T-64-16); React renders the name as text.
 */

/** "Theme limit reached": a single "Close message" button (Duplicate at the 50-theme cap). */
export function showThemeLimitDialog(t: TFunction): void {
  useUiState.getState().showDialogModal({
    title: t('gamelib:customThemes.limitTitle', 'Theme limit reached'),
    message: createElement(
      'p',
      null,
      t(
        'gamelib:customThemes.limitBody',
        'You’ve reached the limit of {{max}} custom themes. Delete one to make another.',
        { max: MAX_CUSTOM_THEMES }
      )
    ),
    buttons: [{ text: t('gamelib:customThemes.limitClose', 'Close message') }]
  })
}
