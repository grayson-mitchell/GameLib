import { useTranslation } from 'react-i18next'
import useSettingsState from 'frontend/state/settingsState'
import { SelectField } from '..'
import { MenuItem } from '@mui/material'
import { defaultThemes, resolveThemeLabel } from './themeLabels'

// The `defaultThemes` re-export was dropped (Phase 64-04): its only importer,
// frontend/index.tsx, now applies themes through customThemes/applyTheme, which
// reads it from './themeLabels' (the original declaration). resolveThemeLabel
// was dropped from the export list earlier (260922-vzw) for the same reason.
// The import above stays for this file's own internal use below.

export const ThemeSelector = () => {
  const { theme, setTheme } = useSettingsState.keys('theme', 'setTheme')
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')

  return (
    <SelectField
      htmlId="theme_selector"
      label={t('setting.select_theme', 'Select Theme')}
      onChange={(event) => setTheme(event.target.value)}
      value={theme}
    >
      {Object.keys(defaultThemes).map((key) => (
        <MenuItem key={key} value={key}>
          {resolveThemeLabel(key, tGamelib)}
        </MenuItem>
      ))}
    </SelectField>
  )
}
