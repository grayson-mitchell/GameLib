import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTriangleExclamation,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { useSteamEngineState } from 'frontend/state/SteamEngineState'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import './index.scss'

type Reason = 'cx-missing' | 'cx-expired' | 'cx-broken'
interface Shown {
  reason: Reason
  seq: number
}

const AUTO_HIDE_MS = 8000

const isReason = (r: unknown): r is Reason =>
  r === 'cx-missing' || r === 'cx-expired' || r === 'cx-broken'

// D-06 and 59-UAT G6: a launch that drops to the built-in engine is announced
// inside the app, so it does not depend on a system notification (which
// `tauri dev` never delivers and a packaged build may have turned off).
// Non-blocking and dismissible, like HumbleExpiryToast. It reads only the
// engine state store, fed by the backend's steamEngineStateChanged push;
// `launchNotice` is non-null only in the push from recordLaunchDecision, so a
// page re-fetch (launchNotice null) never re-shows it. T-59-72: only the
// three closed reason values map to catalogue strings.
export default function SteamEngineLaunchNotice() {
  const { t } = useTranslation('gamelib')
  const byAppId = useSteamEngineState((s) => s.byAppId)
  const lastSeq = useRef(0)
  const [shown, setShown] = useState<Shown | null>(null)

  useEffect(() => {
    let newest: Shown | null = null
    for (const state of Object.values(byAppId)) {
      const n = state.launchNotice
      if (!n || !isReason(n.reason) || typeof n.seq !== 'number') continue
      if (n.seq > lastSeq.current && (!newest || n.seq > newest.seq)) {
        newest = { reason: n.reason, seq: n.seq }
      }
    }
    if (newest) {
      lastSeq.current = newest.seq
      setShown(newest)
    }
  }, [byAppId])

  useEffect(() => {
    if (!shown) return
    const id = setTimeout(() => setShown(null), AUTO_HIDE_MS)
    return () => clearTimeout(id)
  }, [shown])

  // The native store embed would cover the notice, as for HumbleExpiryToast.
  useSuppressStoreEmbedWhile(shown !== null)

  if (!shown) return null

  const message =
    shown.reason === 'cx-expired'
      ? t(
          'steam.engine.toast.cxExpired',
          'CrossOver trial expired — using built-in engine'
        )
      : shown.reason === 'cx-broken'
        ? t(
            'steam.engine.toast.cxBroken',
            "CrossOver isn't working — using built-in engine"
          )
        : t(
            'steam.engine.toast.cxMissing',
            'CrossOver not found — using built-in engine'
          )

  return (
    <div className="steamEngineLaunchNotice" role="status">
      <FontAwesomeIcon
        icon={faTriangleExclamation}
        className="steamEngineLaunchNoticeIcon"
      />
      <span className="steamEngineLaunchNoticeMessage">{message}</span>
      <button
        className="steamEngineLaunchNoticeDismiss"
        aria-label={t('steam.engine.notice.dismiss', 'Dismiss')}
        onClick={() => setShown(null)}
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  )
}
