import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons'

import { useRemovalRefusedNotice } from 'frontend/state/RemovalRefusedNotice'
import type { QueuedRemovalNotice } from 'frontend/state/RemovalRefusedNotice'
import { useSuppressStoreEmbedWhile } from 'frontend/components/UI/NavShell/StoreEmbedSuppressionContext'
import {
  renderNoticeSlot,
  useNoticePhaseFallback
} from 'frontend/components/UI/NoticeStack/noticeSlot'
import type { NoticePhase } from 'frontend/components/UI/NoticeStack/noticeSlot'
import type {
  RemovalRefusalKind,
  RemovalRefusalOutcome
} from 'common/types/removalRefusal'
import type { RemovalReason } from 'common/types/safety'
import './index.scss'

// Phase 82 (D-13/D-14): the toast for a guarded removal that was refused or failed. It names the
// game (or GameLib, for a reset), the one check that stopped it, and says whether anything was
// deleted. No auto-hide and no countdown hairline, like ThemeSaveFailedNotice and
// ReadOnlyStoresNotice: either nothing was deleted or files may be partly gone, and the user must
// acknowledge which. No retry button: retry is clicking the original action again (D-13).
//
// T-82-19: "Nothing was deleted" is said only when the outcome is `refused`. A `failed` outcome, and
// the delete-failed reason on its own, never say it.

const unknownGame = (t: TFunction) =>
  t('removalRefused.unknownGame', 'this game')

function title(t: TFunction, kind: RemovalRefusalKind, game: string): string {
  switch (kind) {
    case 'uninstall':
      return t(
        'removalRefused.title.uninstall',
        "Couldn't uninstall {{game}}",
        {
          game
        }
      )
    case 'remove-prefix':
      return t(
        'removalRefused.title.removePrefix',
        "Couldn't remove the Wine prefix for {{game}}",
        { game }
      )
    case 'remove-bottle':
      return t(
        'removalRefused.title.removeBottle',
        "Couldn't remove the bottle for {{game}}",
        { game }
      )
    case 'reset':
      return t('removalRefused.title.reset', "Couldn't reset GameLib")
    case 'cancel-install':
      return t(
        'removalRefused.title.cancelInstall',
        "Couldn't clean up the cancelled install of {{game}}",
        { game }
      )
  }
}

function reasonBody(
  t: TFunction,
  reason: RemovalReason,
  other: string | undefined
): string {
  switch (reason) {
    case 'nested-known-install':
      return other === undefined
        ? t(
            'removalRefused.reason.nestedKnownInstallUnnamed',
            'Another game is installed inside this folder.'
          )
        : t(
            'removalRefused.reason.nestedKnownInstall',
            '{{other}} is installed inside this folder.',
            { other }
          )
    case 'inside-known-install':
      return other === undefined
        ? t(
            'removalRefused.reason.insideKnownInstallUnnamed',
            'This folder is inside the install of another game.'
          )
        : t(
            'removalRefused.reason.insideKnownInstall',
            'This folder is inside the install of {{other}}.',
            { other }
          )
    case 'is-protected-root':
      return t(
        'removalRefused.reason.protectedRoot',
        'The folder is a protected location, such as your home folder or the default install folder.'
      )
    case 'is-trust-root':
    case 'outside-trust-root':
      return t(
        'removalRefused.reason.outsideTrustRoot',
        "The folder isn't inside the expected install location."
      )
    case 'not-a-prefix':
      return t(
        'removalRefused.reason.notAPrefix',
        "The folder doesn't look like a Wine prefix."
      )
    case 'folder-looks-shared':
      return t(
        'removalRefused.reason.folderLooksShared',
        "The game's folder also holds other programs, so it may be shared with other software."
      )
    case 'delete-failed':
      return t(
        'removalRefused.reason.deleteFailed',
        'Some files could not be removed.'
      )
    case 'in-use':
      return t(
        'removalRefused.reason.inUse',
        'The bottle is in use. Quit the game and anything else running in it, then try again.'
      )
    case 'unsafe-name':
      return t(
        'removalRefused.reason.unsafeName',
        "The bottle's name isn't one GameLib made for this game, so it was left alone."
      )
    // Every other reason is a check that could not be completed (a malformed or relative path, a
    // missing trust root, an unreadable install list, a failed lookup or reply): the location is
    // unconfirmed, so GameLib refuses rather than guess.
    default:
      return t(
        'removalRefused.reason.unconfirmed',
        "GameLib couldn't confirm the install location."
      )
  }
}

function outcomeBody(
  t: TFunction,
  outcome: RemovalRefusalOutcome,
  reason: RemovalReason
): string {
  // delete-failed means a delete ran, so it can never be paired with "nothing was deleted".
  if (outcome === 'failed' || reason === 'delete-failed') {
    return t(
      'removalRefused.outcome.failed',
      'Some files may already have been removed. Try again to finish.'
    )
  }
  return t('removalRefused.outcome.refused', 'Nothing was deleted.')
}

function RemovalRefusedToast({ notice }: { notice: QueuedRemovalNotice }) {
  const { t } = useTranslation('gamelib')
  const dismiss = useRemovalRefusedNotice((s) => s.dismiss)
  const [phase, setPhase] = useState<NoticePhase | null>('in')

  // Held while on screen, including the exit (matches ThemeSaveFailedNotice).
  useSuppressStoreEmbedWhile(phase !== null)

  const toCollapsing = () => setPhase('collapsing')
  // The store entry goes only when the exit finishes, so the toast stays mounted through it.
  const remove = () => {
    setPhase(null)
    dismiss(notice.id)
  }
  useNoticePhaseFallback(phase, notice.id, toCollapsing, remove)

  if (phase === null) return null

  function handleDismiss() {
    if (phase !== 'in') return
    setPhase('leaving')
  }

  const game = notice.title ?? unknownGame(t)

  return renderNoticeSlot({
    slotKey: 'removalRefused',
    toastKey: notice.id,
    phase,
    toastClassName: 'removalRefusedNotice',
    toCollapsing,
    remove,
    children: (
      <>
        <FontAwesomeIcon
          icon={faCircleExclamation}
          className="noticeStackIcon removalRefusedNoticeIcon"
        />
        <div className="noticeStackText removalRefusedNoticeText" role="alert">
          <div className="noticeStackTitle removalRefusedNoticeTitle">
            {title(t, notice.kind, game)}
          </div>
          <div className="noticeStackBody removalRefusedNoticeBody">
            {reasonBody(t, notice.reason, notice.otherTitle)}
          </div>
          <div className="noticeStackBody removalRefusedNoticeBody">
            {outcomeBody(t, notice.outcome, notice.reason)}
          </div>
        </div>
        <button
          className="noticeStackDismiss removalRefusedNoticeDismiss"
          aria-label={t('removalRefused.dismiss', 'Dismiss')}
          onClick={handleDismiss}
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </>
    )
  })
}

export default function RemovalRefusedNotice() {
  const notices = useRemovalRefusedNotice((s) => s.notices)
  return (
    <>
      {notices.map((notice) => (
        <RemovalRefusedToast key={notice.id} notice={notice} />
      ))}
    </>
  )
}
