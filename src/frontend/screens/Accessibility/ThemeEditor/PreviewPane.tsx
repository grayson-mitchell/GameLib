import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { checkFloors } from 'frontend/customThemes/contrastFloors'
import { ThemeThumbnail } from 'frontend/components/UI/ThemeSelector/ThemeThumbnail'

interface PreviewPaneProps {
  name: string
  base: string
  /** The unsaved draft: the only thing in the editor that paints from it (D-05). */
  tokens: Readonly<Record<string, string>>
}

export function PreviewPane({ name, base, tokens }: PreviewPaneProps) {
  const { t } = useTranslation()
  const warningCount = useMemo(() => checkFloors(tokens).length, [tokens])
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
      <p role="status" aria-live="polite" className="themeEditor__summary">
        {warningCount === 0
          ? t(
              'gamelib:customThemes.contrastSummaryNone',
              'No contrast warnings'
            )
          : t('gamelib:customThemes.contrastSummary', {
              count: warningCount,
              defaultValue_one: '{{count}} contrast warning',
              defaultValue_other: '{{count}} contrast warnings'
            })}
      </p>
    </div>
  )
}
