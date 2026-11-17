import { useTranslation } from 'react-i18next'
import { ThemeThumbnail } from 'frontend/components/UI/ThemeSelector/ThemeThumbnail'

interface PreviewPaneProps {
  name: string
  base: string
  /** The unsaved draft: the only thing in the editor that paints from it (D-05). */
  tokens: Readonly<Record<string, string>>
}

export function PreviewPane({ name, base, tokens }: PreviewPaneProps) {
  const { t } = useTranslation()
  return (
    <div className="themeEditor__preview">
      <ThemeThumbnail
        tokens={tokens}
        base={base}
        label={t(
          'gamelib:customThemes.previewLabel',
          'Live preview of {{name}}',
          { name }
        )}
      />
    </div>
  )
}
