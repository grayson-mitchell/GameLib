import { useCallback, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import TextInputField from 'frontend/components/UI/TextInputField'
import useSettingsState from 'frontend/state/settingsState'
import { validateThemeName } from 'frontend/customThemes/customTheme'
import './index.scss'

interface RenameThemeDialogProps {
  open: boolean
  themeId: string
  currentName: string
  onClose: () => void
}

/**
 * The one Rename dialog (OD-5): opened from a gallery card and, in Plan 09, from the editor
 * header. Escape, "Keep name" and the backdrop (unless disableDialogBackdropClose) close it.
 * "Rename theme" stays disabled while the name is invalid or unchanged.
 */
export function RenameThemeDialog({
  open,
  themeId,
  currentName,
  onClose
}: RenameThemeDialogProps) {
  // Mounted only while open: the Dialog primitive suppresses the store embed for as long as
  // it exists, and each open starts from the current name.
  if (!open) return null
  return (
    <RenameThemeDialogBody
      themeId={themeId}
      currentName={currentName}
      onClose={onClose}
    />
  )
}

function RenameThemeDialogBody({
  themeId,
  currentName,
  onClose
}: Omit<RenameThemeDialogProps, 'open'>) {
  const { t } = useTranslation()
  const { customThemes, renameCustomTheme } = useSettingsState.keys(
    'customThemes',
    'renameCustomTheme'
  )
  const [value, setValue] = useState(currentName)
  const errorId = useId()
  const selected = useRef(false)

  const problem = validateThemeName(value, customThemes, themeId)
  const unchanged = value.trim() === currentName
  const canConfirm = problem === null && !unchanged

  const errorText = (() => {
    switch (problem) {
      case 'empty':
        return t('gamelib:customThemes.renameErrorEmpty', 'Enter a name.')
      case 'too-long':
        return t(
          'gamelib:customThemes.renameErrorTooLong',
          'Use 60 characters or fewer.'
        )
      case 'taken': {
        const clash = customThemes.find(
          (o) =>
            o.id !== themeId &&
            o.name.trim().toLowerCase() === value.trim().toLowerCase()
        )
        return t(
          'gamelib:customThemes.renameErrorTaken',
          'You already have a theme called “{{name}}”.',
          { name: clash?.name ?? value.trim() }
        )
      }
      default:
        return null
    }
  })()

  const onChange = useCallback((next: string) => setValue(next), [])

  const confirm = () => {
    if (!canConfirm) return
    if (renameCustomTheme(themeId, value) === 'ok') onClose()
  }

  return (
    <Dialog showCloseButton onClose={onClose} className="renameThemeDialog">
      <DialogHeader onClose={onClose}>
        {t('gamelib:customThemes.renameTitle', 'Rename theme')}
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          confirm()
        }}
      >
        <DialogContent>
          <TextInputField
            htmlId="rename-theme-name"
            label={t('gamelib:customThemes.renameLabel', 'Theme name')}
            value={value}
            onChange={onChange}
            autoFocus
            // Select the existing name once, on first focus, so typing replaces it.
            onFocus={(e) => {
              if (selected.current) return
              selected.current = true
              e.currentTarget.select()
            }}
            aria-invalid={problem !== null}
            aria-describedby={errorText ? errorId : undefined}
          />
          {errorText && (
            <p id={errorId} className="renameThemeDialog__error" role="alert">
              {errorText}
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          <button
            type="button"
            className="button is-secondary outline"
            onClick={onClose}
          >
            {t('gamelib:customThemes.renameKeepName', 'Keep name')}
          </button>
          <button
            type="submit"
            className="button is-primary"
            disabled={!canConfirm}
          >
            {t('gamelib:customThemes.renameConfirm', 'Rename theme')}
          </button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
