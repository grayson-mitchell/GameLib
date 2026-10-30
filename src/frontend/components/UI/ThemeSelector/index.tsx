import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'frontend/state/ContextProvider'
import { SelectField } from '..'
import { MenuItem } from '@mui/material'
import { defaultThemes, resolveThemeLabel } from './themeLabels'

export { defaultThemes }
// resolveThemeLabel was dropped from this export list (260922-vzw):
// src/frontend/components/UI/ThemeSelector/__tests__/index.test.tsx imports
// it directly from '../themeLabels' (the original declaration), never from
// this re-export, and no other file imports it from here either. The
// import above stays for this file's own internal use below.

export const ThemeSelector = () => {
  const { theme, setTheme } = useContext(ContextProvider)
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const [themes, setThemes] = useState<string[]>(Object.keys(defaultThemes))

  // The Custom Themes Path field was removed from Settings (261031-blb).
  // Themes from a folder already saved in config are still listed, so a
  // previously selected custom theme stays selectable.
  useEffect(() => {
    const loadThemes = async () => {
      const themes = await window.api.getCustomThemes()
      setThemes([...Object.keys(defaultThemes), ...themes])
    }

    void loadThemes()
  }, [])

  return (
    <SelectField
      htmlId="theme_selector"
      label={t('setting.select_theme', 'Select Theme')}
      onChange={(event) => setTheme(event.target.value)}
      value={theme}
    >
      {themes.map((key) => (
        <MenuItem key={key} value={key}>
          {resolveThemeLabel(key, tGamelib)}
        </MenuItem>
      ))}
    </SelectField>
  )
}
