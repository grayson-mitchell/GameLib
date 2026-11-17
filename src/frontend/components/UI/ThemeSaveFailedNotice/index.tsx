import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTriangleExclamation,
  faXmark
} from '@fortawesome/free-solid-svg-icons'

import { useThemeSaveFailedNotice } from 'frontend/state/ThemeSaveFailedNotice'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import {
  renderNoticeSlot,
  useNoticePhaseFallback
} from 'frontend/components/UI/NoticeStack/noticeSlot'
import type { NoticePhase } from 'frontend/components/UI/NoticeStack/noticeSlot'
import './index.scss'

// Phase 64 (user decision 2026-11-18): shown when the config-store write behind the theme
// editor's Save is refused. No auto-hide and no countdown hairline: edits that did not reach disk
// are something the user must acknowledge (as ReadOnlyStoresNotice does). The editor stays open
// with the draft dirty, so the notice only explains why nothing was saved.
export default function ThemeSaveFailedNotice() {
  const { t } = useTranslation('gamelib')
  const { name, seq, dismiss } = useThemeSaveFailedNotice()
  const [phase, setPhase] = useState<NoticePhase | null>(null)
  // The name stays on screen through the exit even though the store has already cleared it.
  const [shownName, setShownName] = useState('')
  const showCount = useRef(0)

  // Held while on screen, including the exit (matches ReadOnlyStoresNotice).
  useSuppressStoreEmbedWhile(phase !== null)

  const toCollapsing = () => setPhase('collapsing')
  const remove = () => setPhase(null)
  useNoticePhaseFallback(phase, showCount.current, toCollapsing, remove)

  // `seq` is a dependency so a repeat failure of the same theme re-shows a dismissed notice.
  useEffect(() => {
    if (name === null) return
    showCount.current += 1
    setShownName(name)
    setPhase('in')
  }, [name, seq])

  if (phase === null) return null

  function handleDismiss() {
    if (phase !== 'in') return
    dismiss()
    setPhase('leaving')
  }

  return renderNoticeSlot({
    slotKey: 'themeSaveFailed',
    toastKey: showCount.current,
    phase,
    toastClassName: 'themeSaveFailedNotice',
    toCollapsing,
    remove,
    children: (
      <>
        <FontAwesomeIcon
          icon={faTriangleExclamation}
          className="noticeStackIcon themeSaveFailedNoticeIcon"
        />
        <div className="noticeStackText themeSaveFailedNoticeText">
          <div className="noticeStackTitle themeSaveFailedNoticeTitle">
            {t(
              'customThemes.saveFailed',
              'Couldn’t save “{{name}}”. Your changes are still here, so try again.',
              { name: shownName }
            )}
          </div>
        </div>
        <button
          className="noticeStackDismiss themeSaveFailedNoticeDismiss"
          aria-label={t('customThemes.dismissNotice', 'Dismiss')}
          onClick={handleDismiss}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </>
    )
  })
}
