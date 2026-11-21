import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Popover from '@mui/material/Popover'
import { useCustomCategories } from 'frontend/state/accountHooks'
import { categoryKeyFor, validateNewCategoryName } from './categoryName'
import './index.css'

interface Props {
  open: boolean
  anchorEl: HTMLElement | null
  onClose: () => void
  appName: string
  runner: string
}

/**
 * Phase 100 (D-08, D-09): the "+ Category" checklist. Every category is a
 * checkbox (ticking assigns, unticking removes); the "New category…" field
 * creates a category and assigns this game in one step and the popover stays
 * open. It never opens the per-game Categories modal; renaming and deleting
 * stay in CategoriesManager.
 */
const CategoryPopover = ({
  open,
  anchorEl,
  onClose,
  appName,
  runner
}: Props) => {
  const { t } = useTranslation()
  const customCategories = useCustomCategories()
  const [newName, setNewName] = useState('')
  const [exists, setExists] = useState(false)

  const key = categoryKeyFor(appName, runner)
  const names = customCategories.listCategories()

  // T-100-04: validate BEFORE addCategory -- setCustomCategory replaces the
  // named category's game list with [], so an existing name would wipe it.
  function handleNewCategory() {
    const result = validateNewCategoryName(
      newName,
      customCategories.listCategories()
    )
    if (!result.ok) {
      setExists(result.reason === 'exists')
      return
    }
    customCategories.addCategory(result.name)
    customCategories.addToGame(result.name, key)
    setNewName('')
    setExists(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    handleNewCategory()
  }

  const label = t('gamelib:gamepage.leftCard.newCategory', 'New category…')

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <div className="categoryPopover">
        {names.map((name) => {
          const checked = !!customCategories.list[name]?.includes(key)
          return (
            <label key={name} className="categoryOption">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  checked
                    ? customCategories.removeFromGame(name, key)
                    : customCategories.addToGame(name, key)
                }
              />
              <span>{name}</span>
            </label>
          )
        })}
        <input
          type="text"
          className="categoryPopover__new"
          placeholder={label}
          aria-label={label}
          value={newName}
          onChange={(event) => {
            setNewName(event.target.value)
            setExists(false)
          }}
          onKeyDown={handleKeyDown}
        />
        {exists && (
          <p className="categoryHint" role="status">
            {t(
              'gamelib:gamepage.leftCard.categoryExists',
              'That category already exists — tick it above.'
            )}
          </p>
        )}
      </div>
    </Popover>
  )
}

export default CategoryPopover
