import { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import ContextProvider from 'frontend/state/ContextProvider'
import { GROUP_ORDER, groupAndSortKeys } from 'common/humble/groupKeys'
import HumbleKeyGroup from '../components/HumbleKeyGroup'

// D-21 grouping + round-7 generic->Other partition live in the pure
// common/humble/groupKeys helper (unit-tested from the backend jest
// project) — this tab only renders the groups it receives, in order. Moved
// verbatim from the pre-refactor Humble/Keys/index.tsx render body
// (Pitfall 4: do not alter spacing, group order, or collapse defaults).
// This is the All-keys tab (/humble-keys/all) — uncounted (D-52), no header
// blurb (D-64 only applies to the two focused tabs).
export default function HumbleKeysAll() {
  const { t } = useTranslation()
  const { humble } = useContext(ContextProvider)

  const keys = humble?.keys ?? []
  const groups = groupAndSortKeys(keys)
  const hasKeys = keys.length > 0

  return hasKeys ? (
    <div className="humbleKeysGroupList">
      {GROUP_ORDER.map((group) => {
        const groupKeys = groups[group]
        if (!groupKeys?.length) {
          return null
        }
        return <HumbleKeyGroup key={group} group={group} keys={groupKeys} />
      })}
    </div>
  ) : (
    <div className="humbleKeysEmptyState">
      <h5>{t('humbleKeys.emptyTitle', 'No Humble keys yet')}</h5>
      <p>
        {t(
          'humbleKeys.emptyBody',
          'Your synced key inventory will appear here once your account has orders.'
        )}
      </p>
    </div>
  )
}
