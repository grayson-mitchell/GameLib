import { createElement } from 'react'
import type { TFunction } from 'i18next'
import useUiState from 'frontend/state/uiState'
import {
  DEFAULT_THEME_KEY,
  MAX_CUSTOM_THEMES
} from 'frontend/customThemes/customTheme'
import { isBuiltInThemeKey } from 'frontend/customThemes/builtinTokens'
import type { CustomTheme } from 'common/types/customTheme'
import { resolveThemeLabel } from './themeLabels'

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
    buttons: [
      {
        text: t('gamelib:customThemes.limitClose', 'Close message'),
        autoFocus: true
      }
    ]
  })
}

interface ConfirmDeleteThemeArgs {
  t: TFunction
  theme: CustomTheme
  /** True when the theme is the one the app is using: the dialog names the fallback. */
  isActive: boolean
  onConfirm: () => void
}

/**
 * "Delete theme?" with "Keep theme" focused by default and "Delete theme" in the danger style.
 * Deleting the active theme says which theme the app will switch to: the deleted theme's
 * built-in base, else the default theme (mirrors deleteCustomTheme's fallback).
 */
export function confirmDeleteTheme({
  t,
  theme,
  isActive,
  onConfirm
}: ConfirmDeleteThemeArgs): void {
  const fallback = resolveThemeLabel(
    isBuiltInThemeKey(theme.base) ? theme.base : DEFAULT_THEME_KEY,
    t
  )
  const body = isActive
    ? t(
        'gamelib:customThemes.deleteActiveBody',
        '“{{name}}” is your active theme. The app will switch to {{fallback}}. This can’t be undone.',
        { name: theme.name, fallback }
      )
    : t(
        'gamelib:customThemes.deleteBody',
        '“{{name}}” will be deleted. This can’t be undone.',
        { name: theme.name }
      )
  useUiState.getState().showDialogModal({
    title: t('gamelib:customThemes.deleteTitle', 'Delete theme?'),
    message: createElement('p', null, body),
    buttons: [
      {
        text: t('gamelib:customThemes.deleteKeep', 'Keep theme'),
        autoFocus: true
      },
      {
        text: t('gamelib:customThemes.deleteConfirm', 'Delete theme'),
        variant: 'danger',
        onClick: onConfirm
      }
    ]
  })
}
