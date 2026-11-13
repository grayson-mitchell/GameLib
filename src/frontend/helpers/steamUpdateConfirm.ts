import type { TFunction } from 'i18next'
import type { UiState } from 'frontend/state/uiState'
import { size } from 'frontend/helpers'

interface ConfirmArgs {
  appName: string
  title: string
  showDialogModal: UiState['showDialogModal']
  t: TFunction
  onConfirm: () => void
}

const CHECKING_ID = 'steam-update-confirm'

/**
 * Phase 74-12 (D-13/D-14): size-aware confirmation before a Steam update.
 * Bridge games compute both sizes (an explicit, user-initiated authenticated
 * logon, T-74-39) and refuse up front when the disk is too small; the backend
 * re-checks at start. Steam-registered games go straight through: Steam owns
 * the download. All text is rendered as React text, never HTML (T-74-38).
 */
export async function confirmSteamUpdate({
  appName,
  title,
  showDialogModal,
  t,
  onConfirm
}: ConfirmArgs): Promise<void> {
  let cancelled = false
  const close = () =>
    showDialogModal({ showDialog: false, dialogId: CHECKING_ID })
  const confirmTitle = t('gamelib:gamepage.update.confirmTitle', {
    defaultValue: 'Update {{title}}?',
    title
  })
  const cancelText = t('gamelib:gamepage.update.cancel', {
    defaultValue: 'Cancel'
  })

  showDialogModal({
    dialogId: CHECKING_ID,
    title: confirmTitle,
    message: t('gamelib:gamepage.update.checkingSize', {
      defaultValue: 'Checking update size…'
    }),
    buttons: [{ text: cancelText, onClick: () => (cancelled = true) }]
  })

  let info
  try {
    info = await window.api.getSteamUpdateInfo(appName, { computeSize: true })
  } catch (error) {
    if (cancelled) return
    showDialogModal({
      dialogId: CHECKING_ID,
      title: confirmTitle,
      message: String(error instanceof Error ? error.message : error),
      buttons: [{ text: 'OK' }]
    })
    return
  }

  if (cancelled) return

  if (info?.kind === 'registered') {
    close()
    onConfirm()
    return
  }

  const confirmButton = {
    text: t('gamelib:gamepage.update.confirmButton', {
      defaultValue: 'Update'
    }),
    onClick: onConfirm
  }

  const estimate = info?.estimate
  if (!estimate) {
    showDialogModal({
      dialogId: CHECKING_ID,
      title: confirmTitle,
      message: info?.sizeError ?? '',
      buttons: [
        {
          ...confirmButton,
          text: t('gamelib:gamepage.update.anyway', {
            defaultValue: 'Update anyway'
          })
        },
        { text: cancelText }
      ]
    })
    return
  }

  if (
    estimate.freeBytes !== undefined &&
    estimate.freeBytes < estimate.peakBytes
  ) {
    showDialogModal({
      dialogId: CHECKING_ID,
      title: confirmTitle,
      message: t('gamelib:gamepage.update.notEnoughDisk', {
        defaultValue: 'Needs {{peak}} free, {{available}} available.',
        peak: size(estimate.peakBytes),
        available: size(estimate.freeBytes)
      }),
      buttons: [{ text: 'OK' }]
    })
    return
  }

  const params = {
    download: size(estimate.downloadBytes),
    peak: size(estimate.peakBytes)
  }
  const sizes = t('gamelib:gamepage.update.sizesEstimate', {
    defaultValue:
      'Download about {{download}} · needs {{peak}} free during update (estimate)',
    ...params
  })
  const message = estimate.oldManifestAvailable
    ? sizes
    : `${t('gamelib:gamepage.update.fallback', {
        defaultValue:
          "GameLib can't get the previous build's file list, so it will check every file: download up to {{download}}.",
        ...params
      })} ${sizes}`
  showDialogModal({
    dialogId: CHECKING_ID,
    title: confirmTitle,
    message,
    buttons: [confirmButton, { text: cancelText }]
  })
}
