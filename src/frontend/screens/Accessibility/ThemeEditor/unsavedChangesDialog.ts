import { createElement } from 'react'
import type { TFunction } from 'i18next'
import useUiState from 'frontend/state/uiState'

// One prompt at a time: a fixed id makes a repeat request update the open dialog in place.
const UNSAVED_DIALOG_ID = 'theme-editor-unsaved-changes'

interface UnsavedChangesDialogArgs {
  t: TFunction
  name: string
  onSave: () => void
  onDiscard: () => void
  onKeepEditing: () => void
}

/**
 * The shared "Unsaved changes" prompt for leaving the editor (D-06): Keep editing, Discard
 * changes, and Save theme (focused, primary). The message is a React element so a user-typed
 * theme name renders as text and never takes MessageBoxModal's entity-decoding string path
 * (T-64-23).
 *
 * MessageBoxModal runs `onClose` BEFORE the clicked button's `onClick`, and Escape, the backdrop
 * and the header X reach only `onClose`. Each button therefore marks the prompt resolved, and
 * `onClose` defers "Keep editing" one microtask: a button click is never followed by a reset,
 * while Escape, the backdrop and X all mean "Keep editing".
 */
export function showUnsavedChangesDialog({
  t,
  name,
  onSave,
  onDiscard,
  onKeepEditing
}: UnsavedChangesDialogArgs): void {
  let resolved = false
  const choose = (action: () => void) => () => {
    resolved = true
    action()
  }
  useUiState.getState().showDialogModal({
    dialogId: UNSAVED_DIALOG_ID,
    title: t('gamelib:customThemes.unsavedTitle', 'Unsaved changes'),
    message: createElement(
      'p',
      null,
      t(
        'gamelib:customThemes.unsavedBody',
        'You have unsaved changes to “{{name}}”.',
        { name }
      )
    ),
    buttons: [
      {
        text: t('gamelib:customThemes.unsavedKeepEditing', 'Keep editing'),
        onClick: choose(onKeepEditing)
      },
      {
        text: t('gamelib:customThemes.unsavedDiscard', 'Discard changes'),
        onClick: choose(onDiscard)
      },
      {
        text: t('gamelib:customThemes.saveTheme', 'Save theme'),
        variant: 'primary',
        autoFocus: true,
        onClick: choose(onSave)
      }
    ],
    onClose: () => {
      useUiState
        .getState()
        .showDialogModal({ showDialog: false, dialogId: UNSAVED_DIALOG_ID })
      queueMicrotask(() => {
        if (resolved) return
        resolved = true
        onKeepEditing()
      })
    }
  })
}
