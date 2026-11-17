import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import useSettingsState from 'frontend/state/settingsState'
import { builtinSeed } from 'frontend/customThemes/builtinTokens'
import { resolveThemeKey } from 'frontend/customThemes/customTheme'
import { ThemeCard } from './ThemeCard'
import { defaultThemes, resolveThemeLabel } from './themeLabels'
import './index.scss'

/**
 * The theme gallery (THEME-01, D-01..D-03). Built-ins come from build-time token maps, so there is
 * no loading state; clicking a card applies that theme, as the dropdown did.
 */
export function ThemeGallery() {
  const { theme, customThemes, setTheme } = useSettingsState.keys(
    'theme',
    'customThemes',
    'setTheme'
  )
  const { t } = useTranslation()
  const { t: tGamelib } = useTranslation('gamelib')
  const headingId = useId()
  const resolved = resolveThemeKey(theme, customThemes)

  return (
    <div className="themeGallery" role="group" aria-labelledby={headingId}>
      <h3 id={headingId} className="themeGallery__heading">
        {t('gamelib:customThemes.groupBuiltIn', 'Built-in')}
      </h3>
      <div className="themeGallery__grid">
        {Object.keys(defaultThemes).map((key) => (
          <ThemeCard
            key={key}
            themeKey={key}
            name={resolveThemeLabel(key, tGamelib)}
            tokens={builtinSeed(key) ?? {}}
            base={key}
            active={resolved.kind === 'builtin' && resolved.key === key}
            readOnly
            onApply={() => setTheme(key)}
          />
        ))}
      </div>
    </div>
  )
}
