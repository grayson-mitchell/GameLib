import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'
import LibraryContext from '../../LibraryContext'
import './index.css'

interface AddGameButtonProps {
  'data-tour'?: string
  iconOnly?: boolean
}

function AddGameButton({
  'data-tour': dataTour,
  iconOnly
}: AddGameButtonProps = {}) {
  const { t } = useTranslation()
  const { handleAddGameButtonClick } = useContext(LibraryContext)
  const label = t('add_game', 'Add Game')

  return (
    <button
      className={classNames('sideloadGameButton', {
        'sideloadGameButton--iconOnly': iconOnly
      })}
      onClick={handleAddGameButtonClick}
      data-tour={dataTour || 'library-add-game'}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
    >
      {iconOnly ? <FontAwesomeIcon icon={faPlus} /> : label}
    </button>
  )
}

export default AddGameButton
