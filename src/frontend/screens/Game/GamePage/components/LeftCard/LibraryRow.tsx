import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LocalOffer from '@mui/icons-material/LocalOffer'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import type { GameInfo } from 'common/types'
import {
  useCustomCategories,
  useHiddenGames
} from 'frontend/state/accountHooks'
import CategoryPopover from './CategoryPopover'
import { assignedCategories, categoryKeyFor } from './categoryName'
import './index.css'

interface Props {
  gameInfo: GameInfo
  title: string
}

/**
 * Phase 100 (D-01, D-08, D-09): the left card's library row. Your categories
 * show as outlined chips with a tag icon (never filled like store genres), each
 * with a hover/focus × that removes the game from it, then a dashed "+ Category"
 * chip that opens the checklist popover. A quiet Hide toggle sits at the row
 * end: the state is aria-pressed (amber when on), the label stays the noun.
 */
const LibraryRow = ({ gameInfo, title }: Props) => {
  const { t } = useTranslation()
  const { app_name: appName, runner } = gameInfo
  const customCategories = useCustomCategories()
  const hiddenGames = useHiddenGames()
  const addRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const isHidden = hiddenGames.list.some((h) => h.appName === appName)
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
      <button
        type="button"
        className="hideToggle"
        aria-pressed={isHidden}
        onClick={() =>
          isHidden
            ? hiddenGames.remove(appName)
            : hiddenGames.add(appName, title)
        }
      >
        {isHidden ? (
          <VisibilityOff aria-hidden="true" fontSize="inherit" />
        ) : (
          <Visibility aria-hidden="true" fontSize="inherit" />
        )}
        {t('gamelib:gamepage.leftCard.hide', 'Hide')}
      </button>
    </div>
  )
}

export default LibraryRow
