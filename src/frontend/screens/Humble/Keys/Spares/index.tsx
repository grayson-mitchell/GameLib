import { useTranslation } from 'react-i18next'

// Wave-2 placeholder (Plan 03): keeps the nested route table self-contained
// and compiling before Plan 04 lands the full gift-enabled Giftable Spares
// view (D-58/D-59/D-60). Renders only the D-64 header blurb + the locked
// empty-state copy — no list, no gift action yet.
export default function HumbleKeysSpares() {
  const { t } = useTranslation()

  return (
    <div className="humbleKeysTabPanel">
      <p className="humbleKeysBlurb">
        {t(
          'humbleKeys.sparesBlurb',
          'You already own these games — keep the keys unrevealed and gift them instead.'
        )}
      </p>
      <div className="humbleKeysEmptyState">
        <h5>{t('humbleKeys.sparesEmptyTitle', 'No giftable spares')}</h5>
        <p>
          {t(
            'humbleKeys.sparesEmptyBody',
            "Keys show up here once they're confirmed owned elsewhere and haven't been revealed yet."
          )}
        </p>
      </div>
    </div>
  )
}
