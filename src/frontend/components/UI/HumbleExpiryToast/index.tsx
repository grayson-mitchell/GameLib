import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTriangleExclamation,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import ContextProvider from 'frontend/state/ContextProvider'
import { humbleLoginPath } from 'frontend/screens/Login'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import {
  renderNoticeSlot,
  useNoticePhaseFallback
} from 'frontend/components/UI/NoticeStack/noticeSlot'
import type { NoticePhase } from 'frontend/components/UI/NoticeStack/noticeSlot'
import './index.scss'

// D-09: the ONLY correct surface for the reconnect prompt is a non-blocking,
// dismissible snackbar - never showDialog/handleShowDialogModal (both render
// a full MUI Dialog with a backdrop + focus trap, which would freeze the
// rest of the app). No toast/snackbar library exists in this codebase, so
// this is a minimal from-scratch banner; it now lives as the LAST slot of
// NoticeStack (nearest the corner). It reacts to the `expired` context
// value directly rather than owning any state itself - GlobalState's
// humbleAuthState listener is the single source of truth for `expired`.
export default function HumbleExpiryToast() {
  const { humble } = useContext(ContextProvider)
  const navigate = useNavigate()
  const { t } = useTranslation()

  // Tracks whether the toast has already been shown for the CURRENT expiry
  // period, so it fires exactly once per false -> true transition rather
  // than re-appearing every time GlobalState re-renders while expired stays
  // true. Dismissing (X) sets shownForCurrentExpiry without resetting
  // `expired` itself - it only re-arms once `expired` goes back to false
  // (successful reconnect) and later flips true again.
  const shownForCurrentExpiry = useRef(false)
  // Bumped on every show so a re-expiry during a leave replays the entrance.
  const showCount = useRef(0)
  const [phase, setPhase] = useState<NoticePhase | null>(null)

  // Phase 40 Plan 06 (D-18/D-20): this component is permanently mounted
  // (it's rendered by NoticeStack in `App.tsx`'s `Root()`, not
  // rendered/unmounted per appearance -- the `if (phase === null) return null`
  // below is a render-output early-out, not a mount/unmount), so suppression
  // is held while the toast is on screen, including its exit, rather than for
  // the whole mounted lifetime. Released only once fully gone (matches
  // SteamEngineLaunchNotice): releasing at leave would let the native store
  // embed repaint over the toast mid slide-out.
  useSuppressStoreEmbedWhile(phase !== null)

  const toCollapsing = () => setPhase('collapsing')
  const remove = () => setPhase(null)
  useNoticePhaseFallback(phase, showCount.current, toCollapsing, remove)

  useEffect(() => {
    const isExpired = !!humble.expired
    if (isExpired && !shownForCurrentExpiry.current) {
      shownForCurrentExpiry.current = true
      showCount.current += 1
      setPhase('in')
    } else if (!isExpired) {
      shownForCurrentExpiry.current = false
      setPhase((p) => (p === 'in' ? 'leaving' : p))
    }
  }, [humble.expired])

  if (phase === null) {
    return null
  }

  function beginLeave() {
    if (phase === 'in') setPhase('leaving')
  }

  function handleReconnect() {
    beginLeave()
    navigate(humbleLoginPath)
  }

  return renderNoticeSlot({
    slotKey: 'humble',
    toastKey: showCount.current,
    phase,
    toastClassName: 'humbleExpiryToast',
    toCollapsing,
    remove,
    children: (
      <>
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="humbleExpiryToastIcon"
        />
        <span className="humbleExpiryToastMessage">
          {t(
            'login.humble_expired_toast',
            'Your Humble Bundle session expired. Reconnect to keep your keys in sync.'
          )}
        </span>
        <button className="humbleExpiryToastAction" onClick={handleReconnect}>
          {t('login.humble_reconnect', 'Session expired — Reconnect')}
        </button>
        <button
          className="humbleExpiryToastDismiss"
          aria-label={t('button.dismiss', 'Dismiss')}
          onClick={beginLeave}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </>
    )
  })
}
