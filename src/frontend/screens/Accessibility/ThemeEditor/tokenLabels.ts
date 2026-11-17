import { TFunction } from 'i18next'
import type { CoreTokenGroupId } from 'frontend/customThemes/tokens'

// Theme editor labels (Phase 64, D-12). One literal `t('gamelib:customThemes.<slug>', '<English>')`
// per case so the hardcoded-string gate sees a literal-argument call (the same switch-of-literals
// shape as `themeLabels.ts`; a `[key, text]` tuple table cannot carry the `gamelib:` prefix).

/** The human label of one of the 27 core tokens, or the token name itself for any other. */
export function resolveTokenLabel(token: string, t: TFunction): string {
  switch (token) {
    case '--body-background':
      return t('gamelib:customThemes.token.bodyBackground', 'Body background')
    case '--background':
      return t(
        'gamelib:customThemes.token.background',
        'Panel and tile surface'
      )
    case '--input-background':
      return t('gamelib:customThemes.token.inputBackground', 'Input background')
    case '--modal-background':
      return t(
        'gamelib:customThemes.token.modalBackground',
        'Dialog background'
      )
    case '--modal-border':
      return t('gamelib:customThemes.token.modalBorder', 'Dialog border')
    case '--border-color':
      return t('gamelib:customThemes.token.borderColor', 'Border')
    case '--navbar-background':
      return t(
        'gamelib:customThemes.token.navbarBackground',
        'Sidebar and tab bar'
      )
    case '--navbar-active-background':
      return t(
        'gamelib:customThemes.token.navbarActiveBackground',
        'Active row background'
      )
    case '--navbar-active':
      return t('gamelib:customThemes.token.navbarActive', 'Active label')
    case '--navbar-inactive':
      return t('gamelib:customThemes.token.navbarInactive', 'Inactive label')
    case '--navbar-accent':
      return t('gamelib:customThemes.token.navbarAccent', 'Navigation accent')
    case '--text-default':
      return t('gamelib:customThemes.token.textDefault', 'Text')
    case '--text-secondary':
      return t('gamelib:customThemes.token.textSecondary', 'Secondary text')
    case '--text-tertiary':
      return t('gamelib:customThemes.token.textTertiary', 'Text on buttons')
    case '--text-hover':
      return t('gamelib:customThemes.token.textHover', 'Hover text')
    case '--primary':
      return t('gamelib:customThemes.token.primary', 'Primary button')
    case '--primary-hover':
      return t('gamelib:customThemes.token.primaryHover', 'Primary hover')
    case '--secondary-button':
      return t('gamelib:customThemes.token.secondaryButton', 'Secondary button')
    case '--success-button':
      return t('gamelib:customThemes.token.successButton', 'Success button')
    case '--cancel-button':
      return t('gamelib:customThemes.token.cancelButton', 'Danger button')
    case '--danger':
      return t('gamelib:customThemes.token.danger', 'Danger text and icons')
    case '--accent':
      return t('gamelib:customThemes.token.accent', 'Accent')
    case '--accent-overlay':
      return t('gamelib:customThemes.token.accentOverlay', 'Accent overlay')
    case '--search-bar-border':
      return t('gamelib:customThemes.token.searchBarBorder', 'Search outline')
    case '--status-success':
      return t('gamelib:customThemes.token.statusSuccess', 'Success')
    case '--status-warning':
      return t('gamelib:customThemes.token.statusWarning', 'Warning')
    case '--status-danger':
      return t('gamelib:customThemes.token.statusDanger', 'Danger')
    default:
      return token
  }
}

export function resolveGroupLabel(id: CoreTokenGroupId, t: TFunction): string {
  switch (id) {
    case 'surfaces':
      return t('gamelib:customThemes.group.surfaces', 'Surfaces')
    case 'navigation':
      return t('gamelib:customThemes.group.navigation', 'Navigation')
    case 'text':
      return t('gamelib:customThemes.group.text', 'Text')
    case 'buttons':
      return t('gamelib:customThemes.group.buttons', 'Buttons')
    case 'accent':
      return t('gamelib:customThemes.group.accent', 'Accent')
    case 'status':
      return t('gamelib:customThemes.group.status', 'Status')
  }
}
