import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faClone,
  faPen,
  faPenToSquare,
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { Tooltip } from '@mui/material'
import classNames from 'classnames'
import './index.scss'

interface ThemeCardActionsProps {
  /** The theme's display name; every aria-label names it (D-07). */
  name: string
  onDuplicate: () => void
  /** Custom cards only: a built-in card passes none of these three, so none renders. */
  onEdit?: () => void
  onRename?: () => void
  onDelete?: () => void
}

interface ActionButtonProps {
  icon: IconDefinition
  label: string
  tooltip?: string
  danger?: boolean
  onClick: () => void
}

function ActionButton({
  icon,
  label,
  tooltip,
  danger = false,
  onClick
}: ActionButtonProps) {
  return (
    <Tooltip title={tooltip ?? label} placement="top">
      <button
        type="button"
        className={classNames('themeCard__action', {
          'themeCard__action--danger': danger
        })}
        aria-label={label}
        onClick={onClick}
      >
        <FontAwesomeIcon icon={icon} aria-hidden="true" />
      </button>
    </Tooltip>
  )
}

/**
 * The per-card icon row. Rendered beside the apply button, never inside it. Each button is a
 * 32px square with a tooltip on hover and keyboard focus (MUI Tooltip) and an aria-label naming
 * the theme.
 */
export function ThemeCardActions({
  name,
  onDuplicate,
  onEdit,
  onRename,
  onDelete
}: ThemeCardActionsProps) {
  const { t } = useTranslation()
  return (
    <>
      {onEdit && (
        <ActionButton
          icon={faPen}
          label={t('gamelib:customThemes.actionEdit', 'Edit {{name}}', {
            name
          })}
          onClick={onEdit}
        />
      )}
      <ActionButton
        icon={faClone}
        label={t('gamelib:customThemes.actionDuplicate', 'Duplicate {{name}}', {
          name
        })}
        tooltip={t('gamelib:customThemes.actionDuplicateShort', 'Duplicate')}
        onClick={onDuplicate}
      />
      {onRename && (
        <ActionButton
          icon={faPenToSquare}
          label={t('gamelib:customThemes.actionRename', 'Rename {{name}}', {
            name
          })}
          onClick={onRename}
        />
      )}
      {onDelete && (
        <ActionButton
          icon={faTrash}
          label={t('gamelib:customThemes.actionDelete', 'Delete {{name}}', {
            name
          })}
          danger
          onClick={onDelete}
        />
      )}
    </>
  )
}
