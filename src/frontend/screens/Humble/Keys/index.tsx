import './index.css'

import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt } from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'

import ContextProvider from 'frontend/state/ContextProvider'
import WarningMessage from 'frontend/components/UI/WarningMessage'
import { humbleLoginPath } from 'frontend/screens/Login'
import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import HumbleKeyGroup from './components/HumbleKeyGroup'

// D-21: fixed group order, urgency-first (action-needed states before
// terminal ones). Never reordered by data — only non-empty groups render.
const GROUP_ORDER: HumbleKeyState[] = [
  'UNPICKED',
  'UNREVEALED',
  'REVEALED',
  'REDEEMED',
  'UNREDEEMABLE'
]

// Local formatRelativeTime (mirrors LibraryHeader's, returns the bare
// duration phrase — the "ago"/"showing data from" wrapper lives in the
// caller's i18n string). 4 buckets: <1 minute / minutes / hours / days.
function formatRelativeTime(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) {
    return 'less than a minute'
  }
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  }
  const hours = Math.floor(ms / 3600000)
  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  const days = Math.floor(ms / 86400000)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

// D-21: group by state, expiring-soonest first within each group; keys with
// no expiration sort last. Sorting/grouping happens once here — child
// components render in the order they receive.
function groupAndSortKeys(
  keys: HumbleKey[]
): Partial<Record<HumbleKeyState, HumbleKey[]>> {
  const groups: Partial<Record<HumbleKeyState, HumbleKey[]>> = {}

  for (const key of keys) {
    if (!groups[key.state]) {
      groups[key.state] = []
    }
    groups[key.state]!.push(key)
  }

  for (const state of GROUP_ORDER) {
    groups[state]?.sort((a, b) => {
      if (a.expiration === null && b.expiration === null) return 0
      if (a.expiration === null) return 1
      if (b.expiration === null) return -1
      return new Date(a.expiration).getTime() - new Date(b.expiration).getTime()
    })
  }

  return groups
}

export default function HumbleKeys() {
  const { t } = useTranslation()
  const { humble } = useContext(ContextProvider)

  const [cooldownUntil, setCooldownUntil] = useState<number | undefined>(
    undefined
  )
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)

  // Cooldown lives in humbleSyncStore (D-33), not the context slice — fetch
  // it directly on mount and again whenever a sync just finished.
  useEffect(() => {
    void window.api
      .humbleGetSyncState()
      .then((state) => setCooldownUntil(state.cooldownUntil))
  }, [])

  useEffect(() => {
    const removeListener = window.api.handleHumbleSyncProgress((_e, p) => {
      setProgress(p)
    })
    return () => removeListener()
  }, [])

  useEffect(() => {
    if (!humble?.syncing) {
      void window.api
        .humbleGetSyncState()
        .then((state) => setCooldownUntil(state.cooldownUntil))
      setProgress(null)
    }
  }, [humble?.syncing])

  // D-20: route guard — a disconnected user never sees this page rendered
  // disconnected; deep links / back-button bounce to the login route.
  if (!humble?.isLoggedIn) {
    return <Navigate to={humbleLoginPath} replace />
  }

  const keys = humble.keys ?? []
  const groups = groupAndSortKeys(keys)
  const hasKeys = keys.length > 0

  const now = Date.now()
  const syncedAt = humble.syncedAt ?? null
  const relativeTime = syncedAt !== null ? formatRelativeTime(now - syncedAt) : null

  const inCooldown =
    humble.syncError === 'denied' && !!cooldownUntil && cooldownUntil > now

  const showProgress = !!(humble.syncing && progress && progress.total > 1)

  const cooldownMinutes = cooldownUntil
    ? Math.max(1, Math.ceil((cooldownUntil - now) / 60000))
    : 0

  const showBanner = !!humble.syncError && humble.syncError !== 'none'

  return (
    <div className="humbleKeysScreen" data-tour="humble-keys">
      <div className="humbleKeysHeader">
        <div className="humbleKeysHeaderTop">
          <h4 className="humbleKeysTitle">
            {t('humbleKeys.title', 'Humble Keys')}
          </h4>
          <button
            className={classNames('humbleKeysRefreshButton', {
              spinning: humble.syncing
            })}
            aria-label={t('humbleKeys.refresh', 'Refresh Humble Keys')}
            title={
              inCooldown
                ? t(
                    'humbleKeys.cooldown',
                    'Temporarily unavailable — retry in {{minutes}}m',
                    { minutes: cooldownMinutes }
                  )
                : t('humbleKeys.refresh', 'Refresh Humble Keys')
            }
            disabled={humble.syncing || inCooldown}
            onClick={() => window.api.humbleSync()}
          >
            <FontAwesomeIcon
              icon={faSyncAlt}
              className={classNames({ 'fa-spin': humble.syncing })}
            />
          </button>
        </div>
        {showProgress ? (
          <span className="humbleKeysSyncIndicator">
            <FontAwesomeIcon icon={faSyncAlt} className="humbleKeysSyncSpinner" />
            {t('humbleKeys.syncing', 'Syncing… {{done}}/{{total}} orders', {
              done: progress?.done ?? 0,
              total: progress?.total ?? 0
            })}
          </span>
        ) : (
          relativeTime !== null && (
            <span className="humbleKeysSyncIndicator">
              {t('humbleKeys.lastSynced', 'Last synced {{time}} ago', {
                time: relativeTime
              })}
            </span>
          )
        )}
      </div>

      {showBanner && (
        <WarningMessage className="humbleSyncBanner">
          {humble.syncError === 'partial'
            ? t(
                'humbleKeys.syncErrorPartial',
                "Couldn't finish refresh — showing the latest data available"
              )
            : t(
                'humbleKeys.syncError',
                "Couldn't refresh — showing data from {{time}}",
                { time: relativeTime ?? '' }
              )}
        </WarningMessage>
      )}

      {hasKeys ? (
        <div className="humbleKeysGroupList">
          {GROUP_ORDER.map((state) => {
            const groupKeys = groups[state]
            if (!groupKeys?.length) {
              return null
            }
            return (
              <HumbleKeyGroup key={state} state={state} keys={groupKeys} />
            )
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
      )}
    </div>
  )
}
