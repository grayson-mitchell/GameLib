import { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { selectKeysWaiting } from 'common/humble/viewFilters'
import { getUrgencyTier } from 'common/humble/urgencyBadge'
import HumbleKeyRow from '../components/HumbleKeyRow'

// HVIEW-01: Keys waiting is a single flat list (D-56, no section headers,
// unlike the All-keys tab's HumbleKeyGroup) sorted soonest-expiring first via
// the pure selectKeysWaiting helper. Reads `humble.keys` from
// ContextProvider directly — same shape as the pre-refactor Keys/index.tsx
// render body this tab is descended from.
export default function HumbleKeysWaiting() {
  const { t } = useTranslation()
  const { humble } = useContext(ContextProvider)

  const keys = selectKeysWaiting(humble?.keys ?? [])

  return (
    <div className="humbleKeysTabPanel">
      <p className="humbleKeysBlurb">
        {t(
          'humbleKeys.waitingBlurb',
          "Keys you don't own yet — claim them before they expire."
        )}
      </p>
      {keys.length > 0 ? (
        <ul className="humbleKeysFlatList">
          {keys.map((key) => (
            <HumbleKeyRow
              key={`${key.gamekey}:${key.machineName}`}
              humbleKey={key}
              urgencyTier={getUrgencyTier(key.state, key.expiration)}
            />
          ))}
        </ul>
      ) : (
        <div className="humbleKeysEmptyState">
          <h5>{t('humbleKeys.waitingEmptyTitle', "You're all caught up")}</h5>
          <p>
            {t(
              'humbleKeys.waitingEmptyBody',
              'No keys are waiting to be claimed. Check the All keys tab to see your full inventory.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}
