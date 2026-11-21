import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LocalOffer from '@mui/icons-material/LocalOffer'
import type { GameInfo } from 'common/types'
import { useCustomCategories } from 'frontend/state/accountHooks'
import CategoryPopover from './CategoryPopover'
import { assignedCategories, categoryKeyFor } from './categoryName'
import './index.css'

interface Props {
  gameInfo: GameInfo
}

/**
 * Phase 100 (D-01, D-08, D-09): the left card's library row. Your categories
 * show as outlined chips with a tag icon (never filled like store genres), each
 * with a hover/focus × that removes the game from it, then a dashed "+ Category"
 * chip that opens the checklist popover.
 */
const LibraryRow = ({ gameInfo }: Props) => {
  const { t } = useTranslation()
  const { app_name: appName, runner } = gameInfo
  const customCategories = useCustomCategories()
  const addRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const key = categoryKeyFor(appName, runner)
  const assigned = assignedCategories(
    customCategories.list,
    customCategories.listCategories(),
    key
  )

  return (
    <div className="libraryRow">
      {assigned.map((name) => (
        <span key={name} className="categoryChip">
          <LocalOffer aria-hidden="true" fontSize="inherit" />
          {name}
          <button
            type="button"
            className="categoryChip__remove"
            aria-label={t(
              'gamelib:gamepage.leftCard.removeCategory',
              'Remove {{name}}',
              { name }
            )}
            onClick={() => customCategories.removeFromGame(name, key)}
          >
            ×
          </button>
        </span>
      ))}
      <button
        ref={addRef}
        type="button"
        className="addCategoryChip"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {assigned.length === 0
          ? t('gamelib:gamepage.leftCard.addFirstCategory', '+ Add to Category')
          : t('gamelib:gamepage.leftCard.addCategory', '+ Category')}
      </button>
      <CategoryPopover
        open={open}
        anchorEl={addRef.current}
        onClose={() => setOpen(false)}
        appName={appName}
        runner={runner}
      />
    </div>
  )
}

export default LibraryRow
