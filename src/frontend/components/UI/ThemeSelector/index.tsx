import { useTranslation } from 'react-i18next'
import { ThemeGallery } from './ThemeGallery'
import './index.scss'

// The `defaultThemes` re-export was dropped (Phase 64-04): its only importer,
// frontend/index.tsx, now applies themes through customThemes/applyTheme, which
// reads it from './themeLabels' (the original declaration). resolveThemeLabel
// was dropped from the export list earlier (260922-vzw) for the same reason.

export const ThemeSelector = () => {
  const { t } = useTranslation()

  return (
    <div className="themeGallerySection">
      <h2 className="themeGallerySection__heading">
        {t('setting.select_theme', 'Select Theme')}
      </h2>
      <ThemeGallery />
    </div>
  )
}
