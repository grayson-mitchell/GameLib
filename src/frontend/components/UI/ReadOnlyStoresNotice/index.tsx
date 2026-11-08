import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTriangleExclamation,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { useReadOnlyStoresNotice } from 'frontend/state/ReadOnlyStoresNotice'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import {
  renderNoticeSlot,
  useNoticePhaseFallback
} from 'frontend/components/UI/NoticeStack/noticeSlot'
import type { NoticePhase } from 'frontend/components/UI/NoticeStack/noticeSlot'
import './index.scss'

// Phase 68 (D-05/D-07/D-15): one notice per launch when any persisted store is
// read-only (written by a newer GameLib, or its migration failed).
//
// The ONE deliberate difference from the stack's other notices: NO auto-hide
// and NO countdown hairline (D-15). Data that will not be saved is something
// the user must acknowledge, so it stays until dismissed. Dismissal is held in
// the store, so it does not reappear this launch even if the list grows.
export default function ReadOnlyStoresNotice() {
  const { t } = useTranslation('gamelib')
  const { entries, visible, dismiss } = useReadOnlyStoresNotice()
  const [phase, setPhase] = useState<NoticePhase | null>(null)
  const showCount = useRef(0)

  // Held while on screen, including the exit (matches HumbleExpiryToast).
  useSuppressStoreEmbedWhile(phase !== null)

  const toCollapsing = () => setPhase('collapsing')
  const remove = () => setPhase(null)
  useNoticePhaseFallback(phase, showCount.current, toCollapsing, remove)

  useEffect(() => {
    if (visible && phase === null) {
      showCount.current += 1
      setPhase('in')
    }
  }, [visible, phase])

  if (phase === null) return null

  function handleDismiss() {
    if (phase !== 'in') return
    dismiss()
    setPhase('leaving')
  }

  const newer = entries.some((e) => e.reason === 'newer')
  const failedAreas = entries
    .filter((e) => e.reason === 'failed')
    .map((e) => t(`readOnlyStores.area.${e.area}`, e.area))

  return renderNoticeSlot({
    slotKey: 'readOnlyStores',
    toastKey: showCount.current,
    phase,
    toastClassName: 'readOnlyStoresNotice',
    toCollapsing,
    remove,
    children: (
      <>
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="readOnlyStoresNoticeIcon"
        />
        <div className="readOnlyStoresNoticeText">
          <div className="readOnlyStoresNoticeTitle">
            {t('readOnlyStores.title', 'Some data is read-only')}
          </div>
          {newer && (
            <div className="readOnlyStoresNoticeBody">
              {t(
                'readOnlyStores.newer.body',
                "This data was saved by a newer GameLib, so changes won't be saved. Update GameLib to keep them."
              )}
            </div>
          )}
          {failedAreas.length > 0 && (
            <div className="readOnlyStoresNoticeBody">
              {t(
                'readOnlyStores.failed.body',
                "{{areas}} couldn't be updated, so changes won't be saved. See the log for details.",
                { areas: failedAreas.join(', ') }
              )}
            </div>
          )}
        </div>
        <button
          className="readOnlyStoresNoticeDismiss"
          aria-label={t('readOnlyStores.dismiss', 'Dismiss')}
          onClick={handleDismiss}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </>
    )
  })
}
